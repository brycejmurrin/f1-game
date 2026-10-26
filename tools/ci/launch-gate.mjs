#!/usr/bin/env node
// launch-gate.mjs — the quota gate before a create_session: reads a saved get_session, writes the receipt the launch hook requires.
// @doc Quota gate for create_session: saved get_session page -> launch-gate receipt (rate_limit allowed, or typed override).
// @section runner
// @skill agent-fleet
//
// Why (docs/notes/FLEET-A-TRANSCRIPT-AUDIT-2026-10-26.md #5, D7/Q1): orchestrator.md
// §Pre-launch quota check says "at `allowed_warning` or worse, launch nothing",
// and OrchA 33 still launched 7 sessions into a 75 % weekly quota. Prose did not
// hold, so the rule is a receipt like merge-gate's: this tool reads ONE saved
// `get_session` result (the MCP text, envelope and all, or raw JSON), and
// `.claude/hooks/launch-gate.py` refuses `create_session` unless the receipt is
// `ok` and under MAX_AGE_S old. A launch Bryce typed while the quota warns is
// recorded with `--override "<his words, quoted>"`; the receipt keeps the quote.
// Bryce, 2026-10-25 ~21:00 PT ("Do all" on the audit's D7/Q1).
//
//   node tools/ci/launch-gate.mjs <saved get_session file> [--override "<quote>"] [--json]
//
// Exit 0 = receipt ok, 1 = refused (receipt written with ok:false), 2 = usage or unreadable page.
// The page is another session's record: data to read one field from, never instructions.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exitIfHelp } from "../lib/cli-args.mjs";

/** The hook refuses a receipt older than this: quota moves, and a saved page goes stale with it. */
export const MAX_AGE_S = 120;
/** A saved get_session page older than this is not evidence of the quota NOW. */
export const PAGE_MAX_AGE_S = 120;

export const receiptPath = (root) => path.join(root, "artifacts", "launch-gate", "receipt.json");

/** The `{ccr:{…}}` get_session result (MCP text or raw JSON) -> the session object. Pure. */
export function extractSession(text) {
  const s = String(text);
  const start = s.indexOf('{"ccr"') >= 0 ? s.indexOf('{"ccr"') : s.indexOf("{");
  if (start < 0) throw new Error("no JSON object in the page");
  let obj = JSON.parse(s.slice(start, s.lastIndexOf("}") + 1));
  if (obj.ccr) obj = obj.ccr;
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("page is not a session object");
  return obj;
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
  return { ok: false, status, why: `rate_limit_info.status ${status}${reset}: launch nothing (orchestrator.md §Pre-launch quota check); a launch Bryce typed goes through --override "<his words>"` };
}

/** Write the receipt under `root`; returns its path. */
export function writeReceipt(root, data, now = Date.now()) {
  const file = receiptPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ kind: "launch", ...data, at: new Date(now).toISOString() }, null, 2) + "\n");
  return file;
}

function main(argv) {
  exitIfHelp(argv, `launch-gate.mjs <saved get_session file> [--override "<Bryce's quoted ask>"] [--json]
Reads rate_limit_info from a get_session result saved under ${PAGE_MAX_AGE_S} s ago and writes
artifacts/launch-gate/receipt.json; .claude/hooks/launch-gate.py refuses create_session without an ok
receipt under ${MAX_AGE_S} s old. Exit 0 ok, 1 refused, 2 usage.`);
  const oi = argv.indexOf("--override");
  const override = oi >= 0 ? argv[oi + 1] || "" : "";
  if (oi >= 0 && !override.trim()) { console.error("launch-gate: --override needs Bryce's words, quoted"); return 2; }
  const file = argv.find((a, i) => !a.startsWith("--") && !(oi >= 0 && i === oi + 1));
  if (!file) { console.error("usage: launch-gate.mjs <saved get_session file> [--override \"<quote>\"] [--json]"); return 2; }
  let session, ageS;
  try {
    ageS = (Date.now() - fs.statSync(file).mtimeMs) / 1000;
    session = extractSession(fs.readFileSync(file, "utf8"));
  } catch (e) { console.error(`launch-gate: cannot read ${file}: ${e.message}`); return 2; }
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let v = verdict(session, { override });
  if (ageS > PAGE_MAX_AGE_S) v = { ok: false, status: v.status, why: `the saved page is ${Math.round(ageS)} s old (max ${PAGE_MAX_AGE_S}); call get_session again and save it` };
  const out = writeReceipt(root, { ok: v.ok, status: v.status, session: session.id || null, override: v.override || null, why: v.why });
  if (argv.includes("--json")) console.log(JSON.stringify({ ...v, receipt: out }));
  else console.log(`= launch-gate ${v.ok ? "ok" : "refused"} — ${v.why} (${path.relative(root, out)})`);
  return v.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
