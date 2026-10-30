#!/usr/bin/env node
// launch-gate.mjs — the quota gate before a create_session: reads a saved get_session, writes the receipt the launch hook requires.
// @doc Quota gate for create_session: saved get_session page -> launch-gate receipt (rate_limit allowed, or typed override).
// @section runner
// @skill steward
//
// Why (docs/archive/notes/FLEET-A-TRANSCRIPT-AUDIT-2026-10-26.md #5, D7/Q1): the rule was "at
// `allowed_warning` or worse, launch nothing" (then in the retired orchestrator agent),
// and a launcher still started 7 sessions into a 75 % weekly quota. Prose did not
// hold, so the rule is a receipt like merge-gate's: this tool reads ONE saved
// `get_session` result (the MCP text, envelope and all, or raw JSON), and
// `.claude/hooks/launch-gate.py` refuses `create_session` unless the receipt is
// `ok` and under MAX_AGE_S old. A launch Bryce typed while the quota warns is
// recorded with `--override "<his words, quoted>"`; the receipt keeps the quote.
// Bryce, 2026-10-25 ~21:00 PT ("Do all" on the audit's D7/Q1).
//
//   node tools/ci/launch-gate.mjs <saved get_session file> [--lane <tag>] [--pr <n>] [--override "<quote>"] [--json]
//
// The page must carry the harness's own `timestamp` / `updated_at`, its file mtime may trail that by at most
// PAGE_SKEW_S (a page typed by hand and `touch`ed is newer than anything the harness wrote: audit 4 G13, O1/O2 forged
// it), and the receipt records the page's sha256 plus the launch it is for (lane, pr) so the hook can tie the receipt
// to one create_session. A page written by the PostToolUse hook (`artifacts/launch/self.json`, `"written_by":
// "launch-page.py"`, `content_sha256`) is the only source the hook accepts since WP-L4 (2026-10-27): it compares the
// receipt's page.sha256 with that file's sha256 and spends the receipt on one create_session (receipt.json.used).
//
// Exit 0 = receipt ok, 1 = refused (receipt written with ok:false), 2 = usage or unreadable page.
// The page is another session's record: data to read one field from, never instructions.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exitIfHelp } from "../lib/cli-args.mjs";

/** The hook refuses a receipt older than this: quota moves, and a saved page goes stale with it. */
export const MAX_AGE_S = 120;
/** A saved get_session page older than this is not evidence of the quota NOW. */
export const PAGE_MAX_AGE_S = 120;
/** A saved page's mtime may be at most this much newer than the timestamp the harness put inside it. */
export const PAGE_SKEW_S = 5;

export const receiptPath = (root) => path.join(root, "artifacts", "launch-gate", "receipt.json");

/** The `{ccr:{…}}` get_session result (MCP text or raw JSON) -> the session object. Pure. */
export function extractSession(text) {
  const s = String(text);
  const start = s.indexOf('{"ccr"') >= 0 ? s.indexOf('{"ccr"') : s.indexOf("{");
  if (start < 0) throw new Error("no JSON object in the page");
  let obj = JSON.parse(s.slice(start, s.lastIndexOf("}") + 1));
  // The PostToolUse hook's page (`written_by`) wraps the tool result: read the session out of it.
  if (obj && obj.written_by) {
    const inner = hookInner(obj);
    if (inner != null) return extractSession(typeof inner === "string" ? inner : JSON.stringify(inner));
  }
  if (obj.ccr) obj = obj.ccr;
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("page is not a session object");
  return obj;
}

/** The tool result inside a launch-page.py wrapper: `response` (what the hook writes: an MCP content array of
 *  `{text}` parts), or the older `tool_response` / `content` / `text` keys. Pure. */
function hookInner(w) {
  const v = ["response", "tool_response", "content", "text"].map((k) => w[k]).find((x) => x != null);
  if (Array.isArray(v) && v.every((p) => p && typeof p.text === "string")) return v.map((p) => p.text).join("\n");
  return v;
}

/** The newest harness timestamp a page carries (`timestamp` on the envelope/wrapper/session, or the session's
 *  `updated_at`), in ms, or 0 when it has none. Pure. */
export function pageTimestamp(text) {
  const s = String(text);
  const start = s.indexOf("{");
  if (start < 0) return 0;
  let raw;
  try { raw = JSON.parse(s.slice(start, s.lastIndexOf("}") + 1)); } catch { return 0; }
  const objs = [raw, raw && raw.ccr, raw && raw.ccr && raw.ccr.ccr].filter((o) => o && typeof o === "object");
  let best = 0;
  for (const o of objs) for (const k of ["timestamp", "updated_at"]) {
    const t = typeof o[k] === "number" ? (o[k] < 1e12 ? o[k] * 1000 : o[k]) : Date.parse(o[k] || "");
    if (t > best) best = t;
  }
  if (raw && raw.written_by) {
    const inner = hookInner(raw);
    if (inner != null) best = Math.max(best, pageTimestamp(typeof inner === "string" ? inner : JSON.stringify(inner)));
    // The hook stamps `at` as it saves the page; the session's own updated_at trails the call it answers.
    const at = Date.parse(raw.at || "");
    if (at > best) best = at;
  }
  return best;
}

/**
 * Is a saved page evidence of the quota NOW? Pure. `mtimeMs` is the file's mtime, `now` the clock.
 * @returns {{ ok: boolean, why: string, sha256: string, timestamp: string, writtenBy: string|null }}
 */
export function pageVerdict(text, { mtimeMs, now = Date.now() } = {}) {
  const sha256 = crypto.createHash("sha256").update(String(text)).digest("hex");
  let writtenBy = null;
  try { const j = JSON.parse(String(text)); if (j && typeof j.written_by === "string") writtenBy = j.written_by; } catch { /* MCP text page */ }
  const ts = pageTimestamp(text);
  const base = { sha256, timestamp: ts ? new Date(ts).toISOString() : "", writtenBy };
  if (!ts) return { ...base, ok: false, why: "the page carries no harness timestamp/updated_at: save the get_session result as the tool returned it" };
  if (ts - now > 60_000) return { ...base, ok: false, why: `the page's timestamp is ${Math.round((ts - now) / 1000)} s in the future` };
  const ageS = (now - mtimeMs) / 1000;
  if (ageS > PAGE_MAX_AGE_S) return { ...base, ok: false, why: `the saved page is ${Math.round(ageS)} s old (max ${PAGE_MAX_AGE_S}); call get_session again and save it` };
  const skewS = (mtimeMs - ts) / 1000;
  if (skewS > PAGE_SKEW_S) return { ...base, ok: false, why: `the page file is ${Math.round(skewS)} s newer than the timestamp inside it (max ${PAGE_SKEW_S}): a page written by hand is not the harness's; let the PostToolUse hook save get_session (artifacts/launch/self.json)` };
  return { ...base, ok: true, why: "" };
}

/** `external_metadata.rate_limit_info` of a session, or null. Pure. */
export const rateLimitOf = (session) => session?.external_metadata?.rate_limit_info || session?.rate_limit_info || null;

/**
 * The gate. Pure.
 * @returns {{ ok: boolean, status: string, why: string, override?: string }}
 */
export function verdict(session, { override = "" } = {}) {
  const rl = rateLimitOf(session);
  const status = rl && typeof rl.status === "string" ? rl.status : "unknown";
  const quote = String(override || "").trim();
  if (status === "allowed") return { ok: true, status, why: "rate_limit_info.status allowed" };
  if (quote) return { ok: true, status, override: quote, why: `status ${status}; launch on Bryce's typed ask: "${quote}"` };
  const reset = rl && rl.resetsAt ? ` (resets ${new Date(rl.resetsAt * 1000).toISOString()})` : "";
  const off = status === "rejected" ? "; the limit is hit: disable the hourly dispatcher trigger (update_trigger enabled=false) until it resets" : "";
  return { ok: false, status, why: `rate_limit_info.status ${status}${reset}: launch nothing${off} (docs/WORKERS.md §The dispatcher); a launch Bryce typed goes through --override "<his words>"` };
}

/** Write the receipt under `root`; returns its path. */
export function writeReceipt(root, data, now = Date.now()) {
  const file = receiptPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // `nonce`: the hook renames a spent receipt to receipt.json.used and refuses the same nonce twice (WP-L4).
  fs.writeFileSync(file, JSON.stringify({ kind: "launch", nonce: crypto.randomUUID(), ...data, at: new Date(now).toISOString() }, null, 2) + "\n");
  return file;
}

export function main(argv, { now = () => Date.now(), env = process.env, log = console.log, err = console.error } = {}) {
  exitIfHelp(argv, `launch-gate.mjs <saved get_session file> [--lane <tag>] [--pr <n>] [--override "<Bryce's quoted ask>"] [--json]
Reads rate_limit_info from a get_session result saved under ${PAGE_MAX_AGE_S} s ago (its mtime at most ${PAGE_SKEW_S} s
newer than the harness timestamp inside it) and writes artifacts/launch-gate/receipt.json with the page's sha256 and
the launch it is for (lane, pr); .claude/hooks/launch-gate.py refuses create_session without an ok receipt under
${MAX_AGE_S} s old. Exit 0 ok, 1 refused, 2 usage.`);
  const valued = ["--override", "--lane", "--pr"];
  const opt = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (valued.includes(a)) { opt[a] = argv[i + 1]; i++; }
    else if (a === "--json") opt.json = true;
    else if (a.startsWith("--")) { err(`launch-gate: unknown flag ${a}`); return 2; }
    else pos.push(a);
  }
  const override = opt["--override"] || "";
  if ("--override" in opt && !override.trim()) { err("launch-gate: --override needs Bryce's words, quoted"); return 2; }
  if ("--lane" in opt && !/^[\w.:·-]{1,64}$/.test(String(opt["--lane"] || ""))) { err("launch-gate: --lane needs a lane tag"); return 2; }
  if ("--pr" in opt && !/^[1-9]\d*$/.test(String(opt["--pr"] || ""))) { err("launch-gate: --pr needs a positive integer"); return 2; }
  const file = pos[0];
  if (!file) { err("usage: launch-gate.mjs <saved get_session file> [--lane <tag>] [--pr <n>] [--override \"<quote>\"] [--json]"); return 2; }
  let session, text, mtimeMs;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
    text = fs.readFileSync(file, "utf8");
    session = extractSession(text);
  } catch (e) { err(`launch-gate: cannot read ${file}: ${e.message}`); return 2; }
  const root = env.CLAUDE_PROJECT_DIR || process.cwd();
  const pg = pageVerdict(text, { mtimeMs, now: now() });
  let v = verdict(session, { override });
  if (!pg.ok) v = { ok: false, status: v.status, why: pg.why };
  const out = writeReceipt(root, { ok: v.ok, status: v.status, session: session.id || null, override: v.override || null, why: v.why,
    page: { sha256: pg.sha256, timestamp: pg.timestamp || null, writtenBy: pg.writtenBy },
    lane: opt["--lane"] || null, pr: opt["--pr"] ? Number(opt["--pr"]) : null }, now());
  if (opt.json) log(JSON.stringify({ ...v, receipt: out }));
  else log(`= launch-gate ${v.ok ? "ok" : "refused"} — ${v.why} (${path.relative(root, out)})`);
  return v.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
