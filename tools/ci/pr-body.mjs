#!/usr/bin/env node
// pr-body.mjs — edit a PR body's Plan / Status / fleet block and add labels without clobbering.
// @doc Edits one PR-body Plan item, Status or fleet key, or adds a label, on the LIVE body via REST.
// Full description: Re-reads the PR body immediately before writing and changes only the targeted Plan item, Status block or fleet key, so an orchestrator's concurrent edit is not overwritten by a stale local copy. Writes through the GitHub REST API (PATCH pulls/{n}; POST issues/{n}/labels — the GitHub MCP has no label call). `--dry-run` prints the new body.
// @skill steward
//
//   node tools/ci/pr-body.mjs --pr 12 --tick 2 --evidence "abc1234 = run passed"
//   node tools/ci/pr-body.mjs --pr 12 --strike 3 --why "covered by #2400"
//   node tools/ci/pr-body.mjs --pr 12 --now 4 --add "write the docs row"
//   node tools/ci/pr-body.mjs --pr 12 --defer 5
//   node tools/ci/pr-body.mjs --pr 12 --status - < status.md      # or a file path
//   node tools/ci/pr-body.mjs --pr 12 --fleet state=verifying --fleet checkin=trig_01abc
//   node tools/ci/pr-body.mjs --pr 12 --label run-ci
//   node tools/ci/pr-body.mjs --pr 12 --tick 1 --evidence x --dry-run   # print, write nothing
//
// Plan items are numbered 1.. in document order (the `## Plan` checklist; items
// inside HTML comments — the template's examples — are not items). Indexes in
// one call refer to the body as read, `--add` applies last.
//
// API (read before use, 2026-10-16):
//   PATCH https://api.github.com/repos/{o}/{r}/pulls/{n}  {"body": …}
//     https://docs.github.com/en/rest/pulls/pulls#update-a-pull-request
//   POST  https://api.github.com/repos/{o}/{r}/issues/{n}/labels  {"labels": […]}
//     https://docs.github.com/en/rest/issues/labels#add-labels-to-an-issue
// Auth goes through github-token.mjs and curl -K (the token never reaches argv).
//
// Exit 0 ok, 1 usage / bad index / API refusal, 3 no token.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { githubToken, NO_TOKEN_HINT } from "./github-token.mjs";
import { CliArgError, exitIfHelp, makeFlags } from "../lib/cli-args.mjs";

export const REPO = "brycejmurrin/f1-game";

/** One REST call. `payload` is sent as a JSON body through curl's config on
 *  stdin (with the auth header), so neither the token nor the body is argv.
 *  @returns {{ json?: any, error?: string, noToken?: boolean }} */
export function ghRequest(method, pathQs, payload, { run = spawnSync, env = process.env } = {}) {
  const token = githubToken({ env });
  if (!token) return { error: NO_TOKEN_HINT, noToken: true };
  const q = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
  let cfg = `header = "Authorization: Bearer ${token}"\n`;
  if (payload !== undefined) cfg += `header = "Content-Type: application/json"\ndata-binary = "${q(JSON.stringify(payload))}"\n`;
  const r = run("curl", ["-sS", "--max-time", "30", "-K", "-", "-X", method, "-w", "\n%{http_code}",
    "-H", "Accept: application/vnd.github+json", "-H", "X-GitHub-Api-Version: 2022-11-28",
    "-H", "Cache-Control: no-cache", `https://api.github.com/repos/${REPO}/${pathQs}`],
  { encoding: "utf8", maxBuffer: 64 << 20, input: cfg });
  if (r.status !== 0) return { error: (r.stderr || r.error?.code || "curl failed").trim() };
  const out = (r.stdout || "").split("\n");
  const code = Number(out.pop());
  if (code < 200 || code >= 300) return { error: `HTTP ${code}` };
  try { return { json: JSON.parse(out.join("\n") || "null") }; } catch { return { error: "bad JSON" }; }
}

// ── pure transforms ─────────────────────────────────────────────────────────

const NOW = /\*\*now:\*\*[ \t]*/i;
const maskComments = (s) => s.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));

/** Section `## <name>` bounds in the raw body: [bodyStart, bodyEnd) after the heading line. */
function section(body, name) {
  const masked = maskComments(body);
  const head = new RegExp(`^##[ \\t]+${name}\\b.*$`, "m").exec(masked);
  if (!head) return null;
  const start = head.index + head[0].length;
  const next = /^##[ \t]/m.exec(masked.slice(start));
  return { start, end: next ? start + next.index : body.length, masked };
}

/** Plan items with raw offsets: `markAt` is the index of the character inside `[ ]`, `textAt`..`lineEnd` the text. */
export function planItems(body) {
  const sec = section(body, "Plan");
  if (!sec) return [];
  const re = /^([ \t]*[-*][ \t]+\[)([ xX~])(\][ \t]*)(.*)$/gm;
  const slice = sec.masked.slice(sec.start, sec.end);
  const items = [];
  for (const m of slice.matchAll(re)) {
    const lineStart = sec.start + m.index;
    const markAt = lineStart + m[1].length;
    const textAt = markAt + 1 + m[3].length;
    items.push({ i: items.length + 1, markAt, textAt, lineEnd: lineStart + m[0].length,
      mark: m[2], text: body.slice(textAt, lineStart + m[0].length) });
  }
  return items;
}

function pick(body, i) {
  const items = planItems(body);
  if (!items.length) throw new CliArgError("the PR body has no ## Plan checklist items");
  const it = items[Number(i) - 1];
  if (!it) throw new CliArgError(`Plan item ${i} does not exist (the body has ${items.length})`);
  return it;
}

function setItem(body, it, mark, text) {
  return body.slice(0, it.markAt) + mark + body.slice(it.markAt + 1, it.textAt) + text + body.slice(it.lineEnd);
}

/** `[x]` with the evidence appended; the `**now:**` marker is dropped. */
export function tickItem(body, i, evidence) {
  const it = pick(body, i);
  if (!String(evidence || "").trim()) throw new CliArgError("--tick needs --evidence \"<text>\" (rule 12: tick only with evidence)");
  const text = it.text.replace(NOW, "").trim();
  return setItem(body, it, "x", `${text}${text ? " — " : ""}${evidence.trim()}`);
}

/** `[ ] ~~text~~ — why`: struck items stay in the list and read as closed. */
export function strikeItem(body, i, why) {
  const it = pick(body, i);
  if (!String(why || "").trim()) throw new CliArgError("--strike needs --why \"<text>\" (rule 12: say why it was dropped)");
  const text = it.text.replace(NOW, "").replace(/^~~|~~.*$/g, "").trim() || "(empty item)";
  return setItem(body, it, " ", `~~${text}~~ — ${why.trim()}`);
}

/** `[~]`: deferred to a follow-up; ready-gate counts it closed. */
export function deferItem(body, i) {
  const it = pick(body, i);
  return setItem(body, it, "~", it.text.replace(NOW, "").trim());
}

/** Exactly one item carries `**now:**`: move the marker to item i. */
export function nowItem(body, i) {
  const target = pick(body, i);
  if (target.mark !== " ") throw new CliArgError(`Plan item ${i} is already closed; --now marks an open item`);
  let out = body;
  // Edit from the last item backwards so earlier offsets stay valid.
  for (const it of planItems(body).reverse()) {
    if (it.i === target.i) out = setItem(out, it, " ", `**now:** ${it.text.replace(NOW, "").trim()}`.trim());
    else if (NOW.test(it.text)) out = setItem(out, it, it.mark, it.text.replace(NOW, "").trim());
  }
  return out;
}

/** Append `- [ ] text` after the last Plan item (or at the end of an empty ## Plan). */
export function addItem(body, text) {
  if (!String(text || "").trim()) throw new CliArgError("--add needs a non-empty item");
  const items = planItems(body);
  const line = `- [ ] ${text.trim()}`;
  if (items.length) {
    const at = items[items.length - 1].lineEnd;
    return body.slice(0, at) + "\n" + line + body.slice(at);
  }
  const sec = section(body, "Plan");
  if (!sec) throw new CliArgError("the PR body has no ## Plan section");
  return body.slice(0, sec.start) + "\n" + line + body.slice(sec.start);
}

/** Replace the `## Status` section's content (its leading HTML comment stays). */
export function setStatus(body, text) {
  const sec = section(body, "Status");
  const block = String(text).replace(/\s+$/, "");
  if (!sec) return `${body.replace(/\s*$/, "")}\n\n## Status\n${block}\n`;
  const raw = body.slice(sec.start, sec.end);
  const lead = /^\s*<!--[\s\S]*?-->\s*/.exec(raw);
  const keep = lead ? lead[0].replace(/\s*$/, "\n") : "\n";
  const tail = sec.end < body.length ? "\n\n" : "\n";
  return body.slice(0, sec.start) + keep + block + tail + body.slice(sec.end).replace(/^\s*/, "");
}

/** Set `key: value` inside the ```fleet block (add the key, or the whole block, when absent). */
export function setFleet(body, key, value) {
  if (!/^[a-z][a-z0-9-]*$/i.test(key)) throw new CliArgError(`--fleet key "${key}" must be a word like state or checkin`);
  const m = /```fleet[ \t]*\n([\s\S]*?)```/.exec(body);
  if (!m) return `${body.replace(/\s*$/, "")}\n\n\`\`\`fleet\n${key}: ${value}\n\`\`\`\n`;
  const lines = m[1].replace(/\n$/, "").split("\n");
  const at = lines.findIndex((l) => new RegExp(`^${key}[ \\t]*:`, "i").test(l));
  const comment = at >= 0 ? (/\s+#.*$/.exec(lines[at]) || [""])[0] : "";
  if (at >= 0) lines[at] = `${key}: ${value}${comment}`; else lines.push(`${key}: ${value}`);
  return body.slice(0, m.index) + "```fleet\n" + lines.join("\n") + "\n```" + body.slice(m.index + m[0].length);
}

/** `key: value` lines of the fleet block (a key may repeat; trailing # comments dropped). */
export function fleetEntries(body) {
  const m = /```fleet[ \t]*\n([\s\S]*?)```/.exec(body || "");
  if (!m) return [];
  return m[1].split("\n").map((l) => /^([a-z][a-z0-9-]*)[ \t]*:[ \t]*(.*?)(?:[ \t]+#.*)?$/i.exec(l)).filter(Boolean)
    .map((x) => [x[1].toLowerCase(), x[2].trim()]);
}

/** Apply every requested edit to one body, in a fixed order. */
export function applyEdits(body, o) {
  let out = body;
  for (const [i, ev] of o.tick || []) out = tickItem(out, i, ev);
  for (const [i, why] of o.strike || []) out = strikeItem(out, i, why);
  for (const i of o.defer || []) out = deferItem(out, i);
  if (o.now != null) out = nowItem(out, o.now);
  if (o.status != null) out = setStatus(out, o.status);
  for (const [k, v] of o.fleet || []) out = setFleet(out, k, v);
  for (const t of o.add || []) out = addItem(out, t);
  return out;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const KNOWN = ["--pr", "--tick", "--evidence", "--strike", "--why", "--now", "--add", "--defer", "--status", "--fleet",
  "--label", "--dry-run", "--help"];
const USAGE = `usage: node tools/ci/pr-body.mjs --pr <n> [edits] [--dry-run]
  --tick <i> --evidence "<text>"   mark Plan item i done, with its evidence
  --strike <i> --why "<text>"      strike Plan item i (stays listed, closed)
  --defer <i>                      mark Plan item i [~] (follow-up; closed)
  --now <i>                        move the **now:** marker to item i
  --add "<item>"                   append an open Plan item
  --status <file|->                replace the ## Status block (session-status.mjs --pr output)
  --fleet key=value                set a key in the \`\`\`fleet block (repeatable)
  --label <name>                   add a label via REST
  --dry-run                        print the new body, write nothing
Re-reads the LIVE body right before writing and changes only the targeted parts.
Repeat --tick/--strike/--fleet/--add for several edits; indexes refer to the body as read.`;

function repeated(argv, name) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name) out.push(argv[i + 1] ?? "");
    else if (argv[i].startsWith(name + "=")) out.push(argv[i].slice(name.length + 1));
  }
  return out;
}

/** Parse argv into the edit set (pure; throws CliArgError). */
export function parseEdits(argv) {
  makeFlags(argv, KNOWN);
  const ticks = repeated(argv, "--tick"), evid = repeated(argv, "--evidence");
  const strikes = repeated(argv, "--strike"), whys = repeated(argv, "--why");
  if (ticks.length !== evid.length) throw new CliArgError("each --tick <i> needs its own --evidence \"<text>\"");
  if (strikes.length !== whys.length) throw new CliArgError("each --strike <i> needs its own --why \"<text>\"");
  const nows = repeated(argv, "--now");
  if (nows.length > 1) throw new CliArgError("--now takes one item");
  const num = (v, f) => { if (!/^\d+$/.test(v) || Number(v) < 1) throw new CliArgError(`${f} expects an item number, got "${v}"`); return Number(v); };
  const fleet = repeated(argv, "--fleet").map((kv) => {
    const eq = kv.indexOf("=");
    if (eq < 1) throw new CliArgError(`--fleet expects key=value, got "${kv}"`);
    return [kv.slice(0, eq), kv.slice(eq + 1)];
  });
  const status = repeated(argv, "--status");
  return {
    pr: repeated(argv, "--pr")[0],
    tick: ticks.map((t, k) => [num(t, "--tick"), evid[k]]),
    strike: strikes.map((t, k) => [num(t, "--strike"), whys[k]]),
    defer: repeated(argv, "--defer").map((t) => num(t, "--defer")),
    now: nows.length ? num(nows[0], "--now") : null,
    add: repeated(argv, "--add"),
    status: status.length ? status[0] : null,
    fleet, label: repeated(argv, "--label"), dryRun: argv.includes("--dry-run"),
  };
}

export function main(argv, { request = ghRequest, readFile = fs.readFileSync, stdin = () => fs.readFileSync(0, "utf8"), log = console.log } = {}) {
  const o = parseEdits(argv);
  const n = Number(o.pr);
  if (!Number.isInteger(n) || n < 1) throw new CliArgError("--pr <n> is required (a positive integer)");
  const doesBody = o.tick.length || o.strike.length || o.defer.length || o.now != null || o.add.length || o.status != null || o.fleet.length;
  if (!doesBody && !o.label.length) throw new CliArgError("nothing to do: give an edit or --label");
  if (o.status != null) o.status = o.status === "-" ? stdin() : readFile(o.status, "utf8");
  let code = 0;
  if (doesBody) {
    const live = request("GET", `pulls/${n}`);                       // the LIVE body, read as late as possible
    if (live.error) { log(`[pr-body] PR #${n}: ${live.error}`); return live.noToken ? 3 : 1; }
    const next = applyEdits(live.json?.body || "", o);
    if (o.dryRun) log(next);
    else {
      const w = request("PATCH", `pulls/${n}`, { body: next });
      if (w.error) { log(`[pr-body] PR #${n} body write: ${w.error}`); return 1; }
      log(`[pr-body] PR #${n} body updated (${next.length} chars)`);
    }
  }
  for (const label of o.label) {
    if (o.dryRun) { log(`[pr-body] would add label ${label} to #${n}`); continue; }
    const r = request("POST", `issues/${n}/labels`, { labels: [label] });
    if (r.error) { log(`[pr-body] label ${label} on #${n}: ${r.error}`); code = 1; } else log(`[pr-body] label ${label} added to #${n}`);
  }
  return code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  exitIfHelp(argv, USAGE);
  try { process.exit(main(argv)); }
  catch (e) {
    if (!(e instanceof CliArgError)) throw e;
    console.error(`${e.message}\n\n${USAGE}`);
    process.exit(1);
  }
}
