#!/usr/bin/env node
// merge-attribution.mjs — who merged? The trailer merge-gate.mjs emits, and the detector that flags merges without it.
// @doc Merged-by trailer and a detector flagging deploy-branch merges that lack it (job summary; one daily bus INFO digest).
// @section runner
// @skill agent-fleet
//
// Why (docs/notes/FLEET-ADAPTIVE-COORDINATION-2026-10-22.md §8): every agent and Bryce merge as "brycejmurrin" and
// GitHub shows no app, so on 2026-10-22 six PRs merged during a train freeze with nobody able to say who did it.
// merge-gate.mjs now prints the merge call with a commit_message ending in
//     Merged-by: <host>:<session or agent id> (<fleet>/<role>)
//     Gate: merge-gate <head sha, 12>
// (the merge API's `commit_message` is the body of the merge commit:
// https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request). This tool reads the first-parent merge commits on
// the deploy branch and classifies each: ATTRIBUTED when it carries `Merged-by:`, else UNATTRIBUTED, presumed to be a
// Bryce UI merge unless he says otherwise. It only FLAGS (one bus HANDOFF line, one PR comment); it never pauses
// or freezes anything.
//
//   node tools/ci/merge-attribution.mjs --range 9f9db7fc..origin/claude/f1-game-project-26h3ng --dry-run
//   node tools/ci/merge-attribution.mjs                    # since the cursor (artifacts/merge-attribution/cursor), else the last 20
//   node tools/ci/merge-attribution.mjs --range A..B --no-bus   # CI: PR comment only (the workflow has no bus push right)
//   node tools/ci/merge-attribution.mjs --no-comment       # bus line only
//   node tools/ci/merge-attribution.mjs --digest --since "24 hours ago"   # ONE bus INFO line for the window (daily job)
//
// --digest (2026-10-26): one INFO line `to:*` naming every unattributed merge in the range instead of one line per
// merge, sent from `github:merge-attribution` (or --as) through fleet-bus's sendBusLine with an idem key on the newest
// unattributed sha, so a re-run of the same window writes nothing. Nothing unattributed → nothing sent.
//
// Idempotent: a PR comment carries `<!-- merge-attribution:<sha12> -->` and is never posted twice for a sha; a bus
// line is skipped when the bus already holds one naming the sha. Exit 0 always except usage / git failure (1).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ghApi, FOOTER } from "./fleet-bus-mirror.mjs";
import { readBus, sendBusLine } from "./fleet-bus.mjs";
import { DEPLOY_BRANCH } from "./deploy.mjs";
import { REPO } from "./ready-gate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const UNKNOWN_IDENTITY = "unknown:unidentified";

/**
 * The merge commit_message for merge-gate's merge call: the PR title, a blank line, then the two trailers. Pure.
 * by: whoAmI() (`<host>:<id>`, null → UNKNOWN_IDENTITY); fleet/role: the PR's fleet block and the session's role.
 */
export function mergeTrailers({ by, fleet = "", role = "", head = "", title = "" } = {}) {
  const who = by || UNKNOWN_IDENTITY;
  const tag = `${fleet || "?"}/${role || "?"}`;
  const trailers = `Merged-by: ${who} (${tag})\nGate: merge-gate ${String(head).slice(0, 12)}`;
  return title ? `${title}\n\n${trailers}` : trailers;
}

/** `{ by, fleet, role, gate }` from a merge commit message, or null when it has no Merged-by trailer. Pure. */
export function parseAttribution(message) {
  const m = /^Merged-by:[ \t]*(\S+)(?:[ \t]+\(([^/)\s]*)\/([^)\s]*)\))?[ \t]*$/m.exec(String(message || ""));
  if (!m) return null;
  const g = /^Gate:[ \t]*merge-gate[ \t]+(\S+)/m.exec(message);
  return { by: m[1], fleet: m[2] || "", role: m[3] || "", gate: g ? g[1] : "" };
}

/** `Merge pull request #N from …` / `… (#N)` → N, else 0. Pure. */
export function prOfSubject(subject) {
  const m = /^Merge pull request #(\d+)\b/.exec(subject || "") || /\(#(\d+)\)\s*$/.exec(subject || "");
  return m ? Number(m[1]) : 0;
}

/** One merge commit → a classified row. Pure. c: { sha, subject, body, author }. */
export function classify(c) {
  const a = parseAttribution(`${c.subject || ""}\n${c.body || ""}`);
  return { sha: c.sha, pr: prOfSubject(c.subject), author: c.author || "", subject: c.subject || "", state: a ? "ATTRIBUTED" : "UNATTRIBUTED", attribution: a };
}

/** First-parent merge commits in `range` (git rev-list syntax), oldest first. */
export function listMerges({ range, cwd = ROOT, run = spawnSync } = {}) {
  const r = run("git", ["log", "--first-parent", "--merges", "--reverse", "--format=%H%x1f%an%x1f%s%x1f%b%x1e", range], { cwd, encoding: "utf8", maxBuffer: 64 << 20 });
  if (r.status !== 0) return { error: (r.stderr || "git log failed").trim().split("\n")[0] };
  const merges = (r.stdout || "").split("\x1e").map((s) => s.replace(/^\n/, "")).filter(Boolean).map((rec) => {
    const [sha, author, subject, body] = rec.split("\x1f");
    return { sha, author, subject, body: body || "" };
  });
  return { merges };
}

export const marker = (sha) => `<!-- merge-attribution:${String(sha).slice(0, 12)} -->`;
export const commentBody = (c) =>
  `${marker(c.sha)}\nmerged without attribution: Bryce UI merge, or an agent? reply here if it was you\n\n` +
  `Merge commit \`${c.sha.slice(0, 8)}\` on the deploy branch carries no \`Merged-by:\` trailer. ` +
  `Unattributed merges are presumed to be Bryce's UI merges. This is a flag only: nothing is paused.${FOOTER}`;
export const busText = (c) =>
  `merge-attribution: UNATTRIBUTED merge ${c.sha.slice(0, 8)}${c.pr ? ` #${c.pr}` : ""} (${c.author || "?"}) — presumed Bryce UI merge; ` +
  `reply on the PR if it was an agent (docs/notes/FLEET-ADAPTIVE-COORDINATION-2026-10-22.md §8)`;

/** True when the bus already holds a line for this sha (an 8-char prefix is in every line we send). Pure. */
export const busHas = (entries, sha) => (entries || []).some((e) => String(e.text || "").includes(`merge-attribution: UNATTRIBUTED merge ${sha.slice(0, 8)}`));

/**
 * Flag every UNATTRIBUTED row. Pure given the callbacks: gh.comments(n) -> [body], gh.post(n, body);
 * sendBus(text) -> bool; busEntries: the bus lines already sent. Returns [{ sha, pr, comment, bus }] with
 * "posted" | "exists" | "skipped" | "none" (no PR number) | "error: …" | "dry-run".
 */
export function flag(rows, { gh, sendBus, busEntries = [], dry = false, comment = true, bus = true } = {}) {
  const out = [];
  for (const c of rows.filter((r) => r.state === "UNATTRIBUTED")) {
    const o = { sha: c.sha, pr: c.pr, comment: "skipped", bus: "skipped" };
    if (comment) {
      if (!c.pr) o.comment = "none";
      else {
        try {
          const exists = gh.comments(c.pr).some((b) => String(b).includes(marker(c.sha)));
          if (exists) o.comment = "exists";
          else if (dry) o.comment = "dry-run";
          else { gh.post(c.pr, commentBody(c)); o.comment = "posted"; }
        } catch (e) { o.comment = `error: ${String(e.message || e).split("\n")[0].slice(0, 80)}`; }
      }
    }
    if (bus) {
      if (busHas(busEntries, c.sha)) o.bus = "exists";
      else if (dry) o.bus = "dry-run";
      else { o.bus = sendBus(busText(c)) ? "posted" : "error: bus send failed"; busEntries.push({ text: busText(c) }); }
    }
    out.push(o);
  }
  return out;
}

export const DIGEST_FROM = "github:merge-attribution";
const DIGEST_MAX_PRS = 20;

/** The one INFO body for a window: count, the PRs (capped), the presumption. Pure; "" when every merge is attributed. */
export function digestText(rows, range) {
  const un = rows.filter((r) => r.state === "UNATTRIBUTED");
  if (!un.length) return "";
  const refs = un.slice(0, DIGEST_MAX_PRS).map((r) => (r.pr ? `#${r.pr}` : r.sha.slice(0, 8)));
  const more = un.length > DIGEST_MAX_PRS ? ` +${un.length - DIGEST_MAX_PRS} more` : "";
  return `merge-attribution digest: ${un.length} of ${rows.length} merges in ${range} carry no Merged-by: trailer (presumed Bryce UI merges): ` +
    `${refs.join(" ")}${more}. An agent merge? Merge through merge-gate.mjs so the trailer lands.`;
}

/** The idem key for a window's digest: the newest unattributed sha, so one window never posts twice. Pure. */
export const digestIdem = (rows) => {
  const un = rows.filter((r) => r.state === "UNATTRIBUTED");
  return un.length ? `merge-attr:${un[un.length - 1].sha.slice(0, 12)}` : "";
};

const USAGE = `usage: node tools/ci/merge-attribution.mjs [--range <A..B> | --since <git date>] [--digest [--as <host>:<id>]] [--dry-run] [--no-bus] [--no-comment] [--json]
  Classify first-parent merges on the deploy branch as ATTRIBUTED (Merged-by trailer) or UNATTRIBUTED and flag the
  latter once each: one fleet-bus HANDOFF and one PR comment. Default range: the cursor, else the last 20 merges.
  --since D: the merges on the tip since date D (git --before syntax, e.g. "24 hours ago").
  --digest: instead of per-merge flags, ONE bus INFO line for the whole range (idempotent per window).`;

const cursorFile = (root) => path.join(root, "artifacts", "merge-attribution", "cursor");

export function main(argv, { root = ROOT, log = console.log, gh, read = readBus, run = spawnSync, mergesOf = listMerges, send = sendBusLine } = {}) {
  if (argv.includes("--help") || argv.includes("-h")) { log(USAGE); return 0; }
  const opt = (k) => { const i = argv.indexOf(k); return i < 0 ? "" : argv[i + 1] && !argv[i + 1].startsWith("-") ? argv[i + 1] : ""; };
  const dry = argv.includes("--dry-run"), asJson = argv.includes("--json");
  const useBus = !argv.includes("--no-bus"), useComment = !argv.includes("--no-comment");
  const tip = `origin/${DEPLOY_BRANCH}`;
  let range = opt("--range");
  const since = opt("--since");
  if (!range && since) {
    // The newest first-parent commit at or before `since`; none (a young branch) → the last 60.
    const r = run("git", ["rev-list", "-1", "--first-parent", `--before=${since}`, tip], { cwd: root, encoding: "utf8" });
    if (r.status !== 0) { log(`[merge-attribution] = merge-attribution error — ${(r.stderr || "git rev-list failed").trim().split("\n")[0]}`); return 1; }
    const base = (r.stdout || "").trim();
    range = base ? `${base.slice(0, 12)}..${tip}` : `${tip}~60..${tip}`;
  }
  const explicit = Boolean(range);
  const saved = (() => { try { return fs.readFileSync(cursorFile(root), "utf8").trim(); } catch { return ""; } })();
  if (!range) range = saved ? `${saved}..${tip}` : `${tip}~60..${tip}`;
  const listed = mergesOf({ range, cwd: root, run });
  if (listed.error) { log(`[merge-attribution] = merge-attribution error — ${listed.error}`); return 1; }
  let merges = listed.merges;
  if (!explicit && !saved) merges = merges.slice(-20);
  const rows = merges.map(classify);
  if (argv.includes("--digest")) {
    const text = digestText(rows, range);
    const un = rows.filter((r) => r.state === "UNATTRIBUTED").length;
    if (!text) log(`= merge-attribution digest ${rows.length} merges, 0 unattributed: nothing sent`);
    else if (dry) log(`= merge-attribution digest (dry run, not sent): INFO to:* ${text}`);
    else {
      const r = send("INFO", "*", opt("--as") || DIGEST_FROM, text, { cwd: root, idem: digestIdem(rows) });
      log(r.ok ? `= merge-attribution digest ${rows.length} merges, ${un} unattributed: ${r.deduped ? "already sent" : "sent"} ${r.sha || ""}`.trim()
        : `= merge-attribution digest send FAILED: ${r.reason}`);
      if (!r.ok) return 1;
    }
    return 0;
  }
  const api = gh || (dry ? { comments: () => [], post: () => {} } : ghApi(REPO)); // a dry run posts and reads nothing remote
  const busEntries = useBus ? (read({ cwd: root, last: 200 }).entries || []) : [];
  const sendBus = (text) => run(process.execPath, [path.join(root, "tools/ci/fleet-bus.mjs"), "send", "HANDOFF", "--to", "*", text], { cwd: root, encoding: "utf8" }).status === 0;
  const flags = flag(rows, { gh: api, sendBus, busEntries, dry, comment: useComment, bus: useBus });
  if (asJson) log(JSON.stringify({ range, rows, flags }, null, 2));
  else {
    for (const r of rows) log(`${r.state.padEnd(12)} ${r.sha.slice(0, 8)} ${r.pr ? "#" + r.pr : "-"} ${r.author} — ${r.attribution ? `${r.attribution.by} (${r.attribution.fleet}/${r.attribution.role})` : r.subject.slice(0, 70)}`);
    const posted = flags.filter((f) => f.comment === "posted" || f.bus === "posted").length;
    log(`= merge-attribution ${rows.length} merges, ${rows.filter((r) => r.state === "ATTRIBUTED").length} attributed, ${flags.length} unattributed, ${posted} flagged${dry ? " (dry run: nothing posted)" : ""}`);
  }
  if (!dry && rows.length && !explicit) {
    try { fs.mkdirSync(path.dirname(cursorFile(root)), { recursive: true }); fs.writeFileSync(cursorFile(root), rows[rows.length - 1].sha + "\n"); } catch { /* cursor is a convenience */ }
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
