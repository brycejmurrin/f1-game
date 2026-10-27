#!/usr/bin/env node
// fleet-flags.mjs — per-session cost / context / model-drift / stall flags for the orchestrator.
// @doc Flags model drift, cost over cap, context over 300k and stalled "working" sessions from get_session JSON.
// @skill agent-fleet
//
// The numbers live behind MCP (`get_session`, `list_events` result totals), which a node CLI cannot call, so the
// orchestrator pipes them in: a JSON array or one object per session, each the `get_session` reply (the `ccr` wrapper
// is optional) plus an optional `cost_usd` (cumulative, from the session's `result` events);
// `external_metadata.usage.cost_usd` is read when no explicit `cost_usd` is given.
//
//   node tools/ci/fleet-flags.mjs sessions.json [--cost-cap 15] [--context-cap 300000] [--stale-min 30] [--json]
//   cat sessions.json | node tools/ci/fleet-flags.mjs
//
// Exit 0 when the flags are printed (the flags are the output); 2 on no input, bad JSON or an unknown flag. No network, no writes.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { makeFlags } from "../lib/cli-args.mjs";

export const DEFAULTS = { costCap: 15, contextCap: 300000, staleMin: 30 };

const unwrap = (s) => (s && s.ccr ? s.ccr : s) || {};

/** One session -> { id, title, cost, contextTokens, configured, served, connection, ageMin, bucket, flags[] }. */
export function assess(raw, now = Date.now(), cfg = {}) {
  const o = { ...DEFAULTS, ...cfg }, s = unwrap(raw), ext = s.external_metadata || {};
  const configured = s.configured_model || (s.session_context && s.session_context.model) || null;
  const served = ext.last_served_model || null;
  const ctx = ext.context_usage && Number.isFinite(ext.context_usage.used_tokens) ? ext.context_usage.used_tokens : null;
  const usd = ext.usage && ext.usage.cost_usd;   // list_sessions / get_session carry it here
  const cost = Number.isFinite(raw && raw.cost_usd) ? raw.cost_usd : Number.isFinite(s.cost_usd) ? s.cost_usd : Number.isFinite(usd) ? usd : null;
  const updated = Date.parse(s.updated_at || "");
  const ageMin = Number.isFinite(updated) ? Math.round((now - updated) / 60000) : null;
  const connection = s.connection_status || null;
  const bucket = String(s.status_bucket || "").replace("SESSION_STATUS_BUCKET_", "").toLowerCase() || null;
  const flags = [];
  const norm = (m) => String(m || "").replace(/\[.*\]$/, "");
  if (configured && served && norm(configured) !== norm(served)) flags.push(`model drift: configured ${configured}, served ${served}`);
  if (cost != null && cost > o.costCap) flags.push(`cost $${cost.toFixed(2)} > cap $${o.costCap}`);
  if (ctx != null && ctx > o.contextCap) flags.push(`context ${Math.round(ctx / 1000)}k > ${Math.round(o.contextCap / 1000)}k`);
  const working = bucket === "working" || /RUNNING/.test(String(s.session_status || ""));
  if (working && (connection === "disconnected" || (ageMin != null && ageMin > o.staleMin))) {
    flags.push(`stalled: ${connection === "disconnected" ? "disconnected" : "no update for " + ageMin + " min"} while working`);
  }
  return { id: String(s.id || "").slice(-8), title: s.title || "", cost, contextTokens: ctx, configured, served, connection, ageMin, bucket, flags };
}

export function format(rows) {
  const p = (x, n) => String(x == null ? "-" : x).padEnd(n);
  const out = [`${p("id", 9)}${p("cost$", 8)}${p("ctx", 7)}${p("model(cfg/served)", 36)}${p("conn", 13)}${p("age", 6)}flags`];
  for (const r of rows) {
    const m = r.configured === r.served || !r.served ? (r.configured || "-") : `${r.configured}/${r.served}`;
    out.push(`${p(r.id, 9)}${p(r.cost == null ? "-" : r.cost.toFixed(2), 8)}${p(r.contextTokens == null ? "-" : Math.round(r.contextTokens / 1000) + "k", 7)}${p(m, 36)}${p(r.connection, 13)}${p(r.ageMin == null ? "-" : r.ageMin + "m", 6)}${r.flags.join("; ") || "ok"}`);
  }
  return out.join("\n");
}

export const USAGE = `usage: node tools/ci/fleet-flags.mjs <sessions.json> [--cost-cap 15] [--context-cap 300000] [--stale-min 30] [--json]
       cat sessions.json | node tools/ci/fleet-flags.mjs
  Input: a JSON array (or one object) of get_session replies, each with an optional cost_usd.
  Exit 0 flags printed (or --help), 2 no input, unreadable JSON or an unknown flag.`;
const VALUE_FLAGS = ["--cost-cap", "--context-cap", "--stale-min"];

/** The CLI, testable: `stdin()` is read only when no file is named and stdin is not a terminal (cli-help S9: an empty
 *  stdin used to throw `SyntaxError: Unexpected end of JSON input`). Returns the exit code. */
export function main(argv, { log = console.log, err = console.error, read = (f) => fs.readFileSync(f, "utf8"),
  stdin = () => (process.stdin.isTTY ? "" : fs.readFileSync(0, "utf8")), now = Date.now } = {}) {
  if (argv.includes("--help") || argv.includes("-h")) { log(USAGE); return 0; }
  try { makeFlags(argv.filter((a, i) => !(i > 0 && VALUE_FLAGS.includes(argv[i - 1]))), [...VALUE_FLAGS, "--json", "--help"]); }
  catch (e) { err(`fleet-flags: ${e.message.split("\n")[0]}`); err(USAGE); return 2; }
  const val = (f, d) => { const i = argv.indexOf(f); const n = i >= 0 ? Number(argv[i + 1]) : d; return Number.isFinite(n) ? n : d; };
  const cfg = { costCap: val("--cost-cap", DEFAULTS.costCap), contextCap: val("--context-cap", DEFAULTS.contextCap), staleMin: val("--stale-min", DEFAULTS.staleMin) };
  const file = argv.find((a, i) => !a.startsWith("--") && !VALUE_FLAGS.includes(argv[i - 1]));
  let text;
  try { text = file ? read(file) : stdin(); } catch (e) { err(`fleet-flags: cannot read ${file || "stdin"}: ${e.message}`); return 2; }
  if (!String(text || "").trim()) { err(`fleet-flags: no input (${file ? `${file} is empty` : "empty stdin"})`); err(USAGE); return 2; }
  let data;
  try { data = JSON.parse(text); } catch (e) { err(`fleet-flags: ${file || "stdin"} is not JSON: ${e.message}`); return 2; }
  const rows = (Array.isArray(data) ? data : [data]).map((s) => assess(s, now(), cfg));
  log(argv.includes("--json") ? JSON.stringify(rows, null, 1) : format(rows));
  return 0;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
