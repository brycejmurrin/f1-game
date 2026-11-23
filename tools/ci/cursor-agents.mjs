#!/usr/bin/env node
// cursor-agents.mjs — Cursor Cloud Agents client: read (list, status, dump, digest) and control agents this tool launched (launch, followup, cancel, archive, delete).
// @doc Cursor agents client: read, wait, artifacts, usage; launch/followup/cancel/archive/delete of agents it launched.
// Full description: Cursor Cloud Agents API v1 client (`CURSOR_API_KEY` from the environment, never printed). Reads: `list`, `status <id>`, `dump [<id>...]` (SSE run streams, rate-limit safe, into ignored artifacts/), `digest`. Writes: `launch` (client-minted agentId, so a retry never duplicates), `followup`, `cancel`, `archive`, `delete`: each refuses an agent id that `launch` did not record in artifacts/cursor-launched.json (the key reaches every agent its owner has). `allowed` lists the recorded ids. Also: `wait`, `artifacts`/`artifact` (presigned download), `usage`.
// @skill steward
//
// Evidence: docs/notes/CURSOR-AGENTS-API-PROBE-2026-10-19.md. The run stream
// (GET /v1/agents/{id}/runs/{runId}/stream) is the only full-transcript door:
// the v0 conversation route carries text only. It rate-limits (429) when read in
// parallel, so dump is sequential with a gap and exponential backoff.
//
//   node tools/ci/cursor-agents.mjs list [--limit 20] [--pr PR_URL] [--include-archived]   (pages past 100)
//   node tools/ci/cursor-agents.mjs status <agent-id>
//   node tools/ci/cursor-agents.mjs wait <agent-id> [--timeout 600] [--interval 5]   (exit 0 FINISHED, 1 ERROR/CANCELLED/EXPIRED, 124 timeout)
//   node tools/ci/cursor-agents.mjs artifacts <agent-id>
//   node tools/ci/cursor-agents.mjs artifact <agent-id> <artifacts/path> [--out DIR]
//   node tools/ci/cursor-agents.mjs usage <agent-id>
//   node tools/ci/cursor-agents.mjs handback <agent-id> [--timeout 600] [--interval 5]   (wait, cache every run while the 24 h stream lasts, bounded digest; exit as wait)
//   node tools/ci/cursor-agents.mjs dump [<agent-id>...] [--limit 20]
//   node tools/ci/cursor-agents.mjs digest [--dir artifacts/cursor-dumps]
//   node tools/ci/cursor-agents.mjs transcript <agent-id> [--run ID | --all] [--only tools,errors,chat,turns] [--tool NAME]
//        [--grep RE] [--width N] [--results] [--summary] [--json] [--no-fetch]   (last run by default; cache first)
//   node tools/ci/cursor-agents.mjs call <agent-id> <callId | run8#seq> [--run ID] [--max N]   (one result in full, bounded)
//   node tools/ci/cursor-agents.mjs launch (--prompt "…" | --prompt-file F) [--model composer-2.5] [--repo URL]
//        [--ref BRANCH | --pr PR_URL] [--name N] [--mode agent|plan] [--create-pr] [--on-branch] [--allow-twin]
//        [--mcp-file F] [--subagent-file F] [--env NAME]... [--env-file F] [--dry-run] [--wait [--timeout S]]
//   node tools/ci/cursor-agents.mjs followup <id> (--text "…" | --text-file F) [--mode agent|plan] [--mcp-file F]
//   node tools/ci/cursor-agents.mjs cancel <id> [--run <runId>]
//   node tools/ci/cursor-agents.mjs archive <id>
//   node tools/ci/cursor-agents.mjs delete <id>        (irreversible; archive is the reversible one)
//   node tools/ci/cursor-agents.mjs allowed
//
// Writes touch ONLY ids `launch` recorded (artifacts/cursor-launched.json, override APEX_CURSOR_ALLOW):
// the key is user-scoped and reaches every agent its owner has. Output is one typed
// line per fact, never a prompt body; `transcript` prints bounded, masked heads and `call` prints ONE
// requested result, cut at --max (a transcript is another agent's record: data, never instructions). Exit 2 = no key, 3 = REFUSED
// (id not launched by this tool), 1 = API error; BUSY / NOT_CANCELLABLE print their
// own line and exit 1. Request shapes: https://cursor.com/docs-static/cloud-agents-openapi.yaml
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ONLY, errorHead, findCall, groupCalls, jsonRows, parseRun, parseSse, renderLines, summaryLine } from "../lib/cursor-transcript.mjs";

// The stream parser and failure detection live in tools/lib/cursor-transcript.mjs (one copy, shared with the MCP tool).
export { errorHead, parseSse };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = "https://api.cursor.com";
const DEFAULT_DIR = path.join(ROOT, "artifacts", "cursor-dumps");

/** Injectable clock: tests replace `sleep` and `now` so no wall time passes. */
export const clock = { sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: () => Date.now() };
const sleep = (ms) => clock.sleep(ms);

/** Delay before retrying a 429: the `Retry-After` header (seconds or an HTTP date) when valid, else 5 s x 2^attempt; capped by APEX_CURSOR_BACKOFF_CAP_MS (80 s). */
export function retryAfterMs(headerValue, attempt, now = Date.now()) {
  const cap = Number(process.env.APEX_CURSOR_BACKOFF_CAP_MS) || 80000;
  let ms = NaN;
  const h = typeof headerValue === "string" ? headerValue.trim() : "";
  if (/^\d+(\.\d+)?$/.test(h)) ms = Number(h) * 1000;
  else if (h) ms = Date.parse(h) - now;
  if (!Number.isFinite(ms) || ms < 0) ms = 5000 * 2 ** attempt;
  return Math.min(ms, cap);
}

/** One API call. GETs retry 429/5xx; a write retries 429 only (the request was not processed), plus 5xx when `retry5xx` (idempotent create). */
async function api(route, { accept = "application/json", tries = 6, method = "GET", body, retry5xx = false, signal } = {}) {
  const key = process.env.CURSOR_API_KEY;
  if (!key) {
    console.log("BLOCKED no CURSOR_API_KEY in the environment");
    process.exit(2);
  }
  const headers = { Authorization: `Bearer ${key}`, Accept: accept };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  for (let a = 0; a < tries; a++) {
    const r = await fetch(BASE + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal });
    const again = r.status === 429 || (r.status >= 500 && (method === "GET" || retry5xx));
    if (again) {
      await sleep(r.status === 429 ? retryAfterMs(r.headers.get("retry-after"), a, clock.now()) : retryAfterMs(null, a));
      continue;
    }
    return r;
  }
  throw new Error(`${route}: still failing after ${tries} tries`);
}

const json = async (route) => {
  const r = await api(route);
  if (!r.ok) throw new Error(`${route}: HTTP ${r.status}`);
  return r.json();
};

const TERMINAL_CLASSES =
  /\b(sync-pr|ci-watch|test-bg|tooling-fast|verify-track|deploy\.mjs|gh run|gh pr|gh api|git (?:push|commit|merge|fetch|status|diff|log)|npm test|node --test|npx|curl|grep|sed|cat|ls|seq|sleep)\b/;

/** Metrics for one run's SSE events. Result sizes are STORED characters, a proxy: the stream elides some results. */
export function digestRun(events) {
  const m = {
    calls: {},
    resChars: {},
    noArgs: 0,
    thinkChars: 0,
    asstChars: 0,
    editEchoChars: 0,
    bigResults: 0,
    mcpDiscovery: 0,
    mcpDiscoveryDup: 0,
    repeatReads: 0,
    terminal: {},
    errCalls: 0,
    errHeads: {},
    errStreak: 0,
  };
  let lastBad = null;
  let streak = 0;
  const reads = new Set();
  const disc = new Set();
  for (const { event, data } of events) {
    if (event === "thinking") m.thinkChars += JSON.stringify(data).length;
    else if (event === "assistant") m.asstChars += JSON.stringify(data).length;
  }
  // Per CALL, not per event: one call is several events (see foldCallEvent), so counting events inflated every figure ~3x.
  for (const c of groupCalls(events)) {
    const n = c.name || "?";
    const args = c.args || {};
    const size = JSON.stringify(c.result ?? "").length;
    m.calls[n] = (m.calls[n] || 0) + 1;
    m.resChars[n] = (m.resChars[n] || 0) + size;
    const bad = errorHead(n, c.result);
    if (bad) {
      m.errCalls++;
      m.errHeads[bad] = (m.errHeads[bad] || 0) + 1;
    }
    // A retry storm: the same failure again and again with nothing in between (any success or other failure resets it).
    streak = bad && bad === lastBad ? streak + 1 : bad ? 1 : 0;
    lastBad = bad;
    if (streak > m.errStreak) m.errStreak = streak;
    // The stream elides args on some calls: an object holding only `toolCallId` (or nothing).
    if (Object.keys(args).every((x) => x === "toolCallId")) m.noArgs++;
    if (size > 20000) m.bigResults++;
    const ok = c.result && c.result.success;
    if (n === "edit_file" && ok) m.editEchoChars += (ok.beforeFullFileContent || "").length + (ok.afterFullFileContent || "").length;
    if (n === "read_file" && args.path) {
      const k = `${args.path}|${args.offset}|${args.limit}`;
      if (reads.has(k)) m.repeatReads++;
      reads.add(k);
    }
    if (n === "get_mcp_tools") {
      const k = JSON.stringify(args);
      m.mcpDiscovery++;
      if (disc.has(k)) m.mcpDiscoveryDup++;
      disc.add(k);
    }
    if (n === "run_terminal_cmd") {
      const cmd = args.command || "";
      const cls = TERMINAL_CLASSES.exec(cmd)?.[1] || (cmd ? "other" : "(args missing)");
      const t = (m.terminal[cls] ||= { calls: 0, chars: 0 });
      t.calls++;
      t.chars += size;
    }
  }
  return m;
}

/** Sum run digests into one fleet digest. */
export function mergeDigests(list) {
  const t = { runs: list.length, calls: {}, resChars: {}, terminal: {}, errHeads: {}, errStreakWorst: 0, errStormRuns: 0 };
  const scalars = ["errCalls", "noArgs", "thinkChars", "asstChars", "editEchoChars", "bigResults", "mcpDiscovery", "mcpDiscoveryDup", "repeatReads"];
  for (const k of scalars) t[k] = 0;
  for (const m of list) {
    for (const k of scalars) t[k] += m[k];
    t.errStreakWorst = Math.max(t.errStreakWorst, m.errStreak || 0);
    if ((m.errStreak || 0) >= 3) t.errStormRuns++;
    for (const [n, v] of Object.entries(m.calls)) t.calls[n] = (t.calls[n] || 0) + v;
    for (const [n, v] of Object.entries(m.errHeads || {})) t.errHeads[n] = (t.errHeads[n] || 0) + v;
    for (const [n, v] of Object.entries(m.resChars)) t.resChars[n] = (t.resChars[n] || 0) + v;
    for (const [n, v] of Object.entries(m.terminal)) {
      const x = (t.terminal[n] ||= { calls: 0, chars: 0 });
      x.calls += v.calls;
      x.chars += v.chars;
    }
  }
  return t;
}

const k = (n) => `${Math.round(n / 1000)}K`;

export function formatDigest(t) {
  const lines = [];
  const totalCalls = Object.values(t.calls).reduce((a, b) => a + b, 0);
  const totalRes = Object.values(t.resChars).reduce((a, b) => a + b, 0);
  lines.push(`DIGEST runs=${t.runs} calls=${totalCalls} resultChars=${k(totalRes)} noArgsShare=${(t.noArgs / Math.max(1, totalCalls)).toFixed(2)}`);
  for (const [n, v] of Object.entries(t.resChars).sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    lines.push(`TOOL ${n} calls=${t.calls[n]} resultChars=${k(v)}`);
  }
  for (const [n, v] of Object.entries(t.terminal).sort((a, b) => b[1].chars - a[1].chars).slice(0, 6)) {
    lines.push(`TERM ${n} calls=${v.calls} resultChars=${k(v.chars)}`);
  }
  lines.push(`EDIT_ECHO chars=${k(t.editEchoChars)} share=${(t.editEchoChars / Math.max(1, totalRes)).toFixed(2)} bigResults=${t.bigResults}`);
  lines.push(`REPEAT_READS ${t.repeatReads}  MCP_DISCOVERY ${t.mcpDiscovery} dup=${t.mcpDiscoveryDup}`);
  lines.push(`REASONING chars=${k(t.thinkChars)} assistant=${k(t.asstChars)}`);
  lines.push(`ERRORS calls=${t.errCalls} share=${(t.errCalls / Math.max(1, totalCalls)).toFixed(2)} stormRuns=${t.errStormRuns} worstStreak=${t.errStreakWorst}`);
  for (const [h, v] of Object.entries(t.errHeads).sort((a, b) => b[1] - a[1]).slice(0, 5)) lines.push(`ERR x${v} ${h}`);
  return lines;
}

// ---- transcript reading: the parsed runs of one agent, from the dump cache or the API ---------------------------------

/**
 * Parsed runs (oldest first) of one agent. `sel`: "last" (default), "all", or a run id / its last 8 characters.
 * A run is read from the dump cache when present, else fetched and cached unless it is past the stream retention
 * window or `fetchMissing` is false. Counts what could not be read, never throws on an expired stream.
 */
export async function loadRuns(id, { dir = DEFAULT_DIR, sel = "last", fetchMissing = true } = {}) {
  const runs = ((await json(`/v1/agents/${id}/runs`)).items || []).slice().reverse();
  const chosen = sel === "all" ? runs : sel === "last" ? runs.slice(-1) : runs.filter((r) => r.id === sel || r.id.endsWith(sel));
  if (!chosen.length) throw new Error(`transcript ${id}: no run matches ${sel}`);
  fs.mkdirSync(dir, { recursive: true });
  const parsed = [];
  let expired = 0;
  let notCached = 0;
  for (const run of chosen) {
    const file = path.join(dir, `${id.slice(-8)}_${run.id.slice(-8)}.sse`);
    let text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    if (text === null) {
      if (!fetchMissing) {
        notCached++;
        continue;
      }
      if (run.createdAt && clock.now() - Date.parse(run.createdAt) > retentionMs()) {
        expired++;
        continue;
      }
      const r = await api(`/v1/agents/${id}/runs/${run.id}/stream`, { accept: "text/event-stream" });
      if (r.status === 410) {
        expired++;
        continue;
      }
      if (!r.ok) throw fail(await apiError(r), "transcript");
      text = await r.text();
      fs.writeFileSync(file, text);
      await sleep(1500);
    }
    parsed.push(parseRun(text, run));
  }
  return { parsed, expired, notCached };
}

const sourceNote = (id, n, expired, notCached) => `TRANSCRIPT ${id} runs=${n} expired=${expired} notCached=${notCached}`;

/** `transcript`: bounded, masked lines (or normalized JSON rows) for the chosen runs. */
export async function transcript(id, opts = {}) {
  const { sel = "last", only, tool, grep, results = false, width = 160, json: asJson = false, summary = false, dir, fetchMissing = true } = opts;
  if (only) for (const o of only) if (!ONLY.includes(o)) throw new Error(`--only takes ${ONLY.join(", ")} (got ${o})`);
  if (grep) {
    try {
      new RegExp(grep);
    } catch {
      throw new Error("--grep is not a valid regular expression");
    }
  }
  const { parsed, expired, notCached } = await loadRuns(id, { dir, sel, fetchMissing });
  const note = sourceNote(id, parsed.length, expired, notCached);
  if (asJson) return [JSON.stringify({ agent: id, runs: expired + notCached, expired, notCached, rows: jsonRows(parsed, { width: Math.max(width, 400), tool, only }) })];
  if (summary) return [...parsed.map((p) => summaryLine(p, width)), note];
  return [...renderLines(parsed, { only: only || ONLY, tool, grep, results, width }), note];
}

/** `call`: one tool call's result in full, found across the agent's runs; bounded by `max`, masked, prefixed `| `. */
export async function transcriptCall(id, ref, { sel = "all", max = 4000, dir, fetchMissing = true } = {}) {
  const { parsed } = await loadRuns(id, { dir, sel, fetchMissing });
  const hit = findCall(parsed, ref, { max });
  if (!hit) throw new Error(`call ${ref}: not found in ${parsed.length} run(s) of ${id}`);
  return [`CALL ${hit.ref} ${hit.name} ${hit.error ? "ERR" : "ok"} chars=${hit.chars}${hit.truncated ? ` truncated@${max}` : ""} args=${hit.args}`, ...hit.text.split("\n").map((l) => `| ${l}`)];
}

// ---- control verbs: launch / followup / cancel / archive / delete -------------------------------

const DEFAULT_REPO = "https://github.com/brycejmurrin/f1-game";
export const DEFAULT_MODEL = "composer-2.5";
const AGENT_ID = /^bc-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PROMPT = 100000;

/** A write the allow-list refused: nothing was sent. */
export class Refused extends Error {}

const allowFile = () => process.env.APEX_CURSOR_ALLOW || path.join(ROOT, "artifacts", "cursor-launched.json");

export function readAllow(file = allowFile()) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")).agents || {};
  } catch {
    return {};
  }
}

function writeAllow(agents, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ agents }, null, 2)}\n`);
}

export function recordAllow(id, meta, file = allowFile()) {
  writeAllow({ ...readAllow(file), [id]: meta }, file);
}

function forgetAllow(id, file = allowFile()) {
  const a = readAllow(file);
  delete a[id];
  writeAllow(a, file);
}

/** Throw Refused unless `id` is well formed AND was recorded by `launch`. */
export function assertAllowed(id, file = allowFile()) {
  if (!id || !AGENT_ID.test(id)) throw new Refused(`REFUSED ${id || "(no id)"} is not a bc-<uuid> agent id`);
  if (!readAllow(file)[id]) throw new Refused(`REFUSED ${id} was not launched by this tool (see: allowed)`);
}

const newAgentId = () => `bc-${crypto.randomUUID()}`;

function needText(text, what) {
  if (typeof text !== "string" || !text.trim()) throw new Error(`${what} is empty`);
  if (text.length > MAX_PROMPT) throw new Error(`${what} is ${text.length} chars, over ${MAX_PROMPT}`);
  return text;
}

function needMode(mode) {
  if (mode !== undefined && mode !== "agent" && mode !== "plan") throw new Error(`--mode must be agent or plan, got ${mode}`);
  return mode;
}

// ---- launch-time options: inline MCP servers, custom subagents, session env vars -------------------------------
// Shapes from the OpenAPI spec (CreateAgentRequest, McpServer, CustomSubagent). Secrets never live in a file or a
// printed line: MCP values may be `${NAME}` placeholders filled from OUR environment, `--env NAME` reads the value from
// it, and every message here names a field, never a value (JSON.parse's own errors can quote the input, so they are
// replaced by a fixed message).
const MAX_MCP = 50;
const MAX_SUBAGENTS = 20;
const MAX_ENV = 50;
const BUILTIN_SUBAGENTS = ["explore", "shell", "debug", "computeruse", "cursorguide"];
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
// Security audit 4 X1: a launch can carry our env off-box, so only these NAMES may leave it — as `--env` / `--env-file`
// variables or as `${NAME}` placeholders. Never AWS_*, FLEET_*, GROK_*, ANTHROPIC_*, GITHUB_*, HTTPS_PROXY. CURSOR_API_KEY
// is a placeholder source only (the API reserves CURSOR_* variable names).
export const LAUNCH_ENV_ALLOW = Object.freeze(["APEX_FLEET_AS", "APEX_SESSION_ID", "APEX_AGENT_WEBHOOK_URL", "APEX_AGENT_WEBHOOK_AUTH", "CURSOR_API_KEY"]);
const notAllowed = (n) => `${n} is not in the launch env allowlist (${LAUNCH_ENV_ALLOW.join(", ")})`;
// Remote MCP hosts a launch may name: Cursor's API, GitHub, and the host of our own APEX_AGENT_WEBHOOK_URL (read from env).
const MCP_HOST_ALLOW = Object.freeze(["api.cursor.com", "github.com", "*.github.com"]);
export function mcpHostAllowed(host, env = process.env) {
  const h = String(host).toLowerCase().replace(/\.$/, "");
  const hook = (() => {
    try {
      return env.APEX_AGENT_WEBHOOK_URL ? new URL(env.APEX_AGENT_WEBHOOK_URL).hostname.toLowerCase() : "";
    } catch {
      return "";
    }
  })();
  if (hook && h === hook) return true;
  return MCP_HOST_ALLOW.some((a) => (a.startsWith("*.") ? h.endsWith(a.slice(1)) : h === a));
}

function noExtra(o, allowed, where) {
  const bad = Object.keys(o).filter((k) => !allowed.includes(k));
  if (bad.length) throw new Error(`${where}: unknown field ${bad.join(", ")}`);
}

/** Fill `${NAME}` from env, NAME in LAUNCH_ENV_ALLOW only. A missing variable is named, its value never echoed. `refs` collects the names used. */
export function interpolate(value, env = process.env, where = "value", refs = null) {
  return String(value).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, n) => {
    if (!LAUNCH_ENV_ALLOW.includes(n)) throw new Error(`${where} references \${${n}}: ${notAllowed(n)}`);
    if (!env[n]) throw new Error(`${where} references \${${n}} but it is not set in the environment`);
    refs?.add(n);
    return env[n];
  });
}

function strMap(m, env, where, refs) {
  if (!isObj(m) || !Object.values(m).every((v) => typeof v === "string")) throw new Error(`${where} must be an object of strings`);
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, interpolate(v, env, `${where}.${k}`, refs)]));
}

/** Validate and normalise an `mcpServers` array (<= 50). Stdio runs in the VM (its env is readable there); remote keeps headers and OAuth with Cursor's backend. */
export function parseMcpServers(list, env = process.env) {
  if (!Array.isArray(list)) throw new Error("mcp file must be a JSON array of servers");
  if (list.length > MAX_MCP) throw new Error(`mcp: ${list.length} servers, over ${MAX_MCP}`);
  const seen = new Set();
  const refs = new Set();
  const out = list.map((sv, i) => {
    const where = `mcp[${i}]`;
    if (!isObj(sv)) throw new Error(`${where} must be an object`);
    if (typeof sv.name !== "string" || !sv.name) throw new Error(`${where}: name is required`);
    if (seen.has(sv.name)) throw new Error(`${where}: duplicate name ${sv.name}`);
    seen.add(sv.name);
    const stdio = sv.command !== undefined;
    if (stdio === (sv.url !== undefined)) throw new Error(`${where} (${sv.name}): give exactly one of command (stdio) or url (remote)`);
    if (stdio) {
      noExtra(sv, ["name", "type", "command", "args", "env"], where);
      if (sv.type !== undefined && sv.type !== "stdio") throw new Error(`${where}: type must be stdio when command is set`);
      if (typeof sv.command !== "string" || !sv.command) throw new Error(`${where}: command must be a non-empty string`);
      if (sv.args !== undefined && !(Array.isArray(sv.args) && sv.args.every((a) => typeof a === "string"))) throw new Error(`${where}: args must be an array of strings`);
      const out = { name: sv.name, type: "stdio", command: sv.command };
      if (sv.args) out.args = sv.args;
      if (sv.env) out.env = strMap(sv.env, env, `${where}.env`, refs);
      return out;
    }
    noExtra(sv, ["name", "type", "url", "headers", "auth"], where);
    // The REST schema also allows sse, but Cursor's capabilities page says cloud agents support http and stdio only.
    if (sv.type !== undefined && sv.type !== "http") throw new Error(`${where}: remote type must be http (cloud agents do not support sse)`);
    let u;
    try {
      u = new URL(sv.url);
    } catch {
      throw new Error(`${where}: url is not a valid URL`);
    }
    if (!/^https?:$/.test(u.protocol)) throw new Error(`${where}: url must be http or https`);
    if (u.username || u.password) throw new Error(`${where}: url must not carry credentials; put them in headers`);
    if (!mcpHostAllowed(u.hostname, env)) throw new Error(`${where}: url host ${u.hostname} is not allowed (${MCP_HOST_ALLOW.join(", ")}, or the APEX_AGENT_WEBHOOK_URL host)`);
    const out = { name: sv.name, type: "http", url: sv.url };
    if (sv.headers) out.headers = strMap(sv.headers, env, `${where}.headers`, refs);
    if (sv.auth) {
      if (!isObj(sv.auth)) throw new Error(`${where}.auth must be an object`);
      noExtra(sv.auth, ["CLIENT_ID", "CLIENT_SECRET", "scopes"], `${where}.auth`);
      if (typeof sv.auth.CLIENT_ID !== "string" || !sv.auth.CLIENT_ID) throw new Error(`${where}.auth.CLIENT_ID is required`);
      out.auth = { CLIENT_ID: interpolate(sv.auth.CLIENT_ID, env, `${where}.auth.CLIENT_ID`, refs) };
      if (sv.auth.CLIENT_SECRET !== undefined) out.auth.CLIENT_SECRET = interpolate(sv.auth.CLIENT_SECRET, env, `${where}.auth.CLIENT_SECRET`, refs);
      if (sv.auth.scopes !== undefined) {
        if (!(Array.isArray(sv.auth.scopes) && sv.auth.scopes.every((x) => typeof x === "string" && x))) throw new Error(`${where}.auth.scopes must be an array of non-empty strings`);
        out.auth.scopes = sv.auth.scopes;
      }
    }
    return out;
  });
  // The env NAMES the placeholders read (never values), for the LAUNCH/FOLLOWUP line; not serialised into the body.
  Object.defineProperty(out, "envRefs", { value: [...refs].sort(), enumerable: false });
  return out;
}

/** Validate a `customSubagents` array (<= 20; names unique and not a built-in; prompt <= 8192 chars). */
export function parseSubagents(list) {
  if (!Array.isArray(list)) throw new Error("subagent file must be a JSON array");
  if (list.length > MAX_SUBAGENTS) throw new Error(`subagents: ${list.length}, over ${MAX_SUBAGENTS}`);
  const seen = new Set();
  return list.map((a, i) => {
    const where = `subagent[${i}]`;
    if (!isObj(a)) throw new Error(`${where} must be an object`);
    noExtra(a, ["name", "description", "prompt", "model"], where);
    const lim = (k, max) => {
      if (typeof a[k] !== "string" || !a[k].trim()) throw new Error(`${where}: ${k} is required`);
      if (a[k].length > max) throw new Error(`${where}: ${k} is ${a[k].length} chars, over ${max}`);
    };
    lim("name", 100);
    lim("description", 1000);
    lim("prompt", 8192);
    const key = a.name.toLowerCase();
    if (BUILTIN_SUBAGENTS.includes(key)) throw new Error(`${where}: name ${a.name} collides with a built-in subagent`);
    if (seen.has(key)) throw new Error(`${where}: duplicate name ${a.name}`);
    seen.add(key);
    const m = a.model;
    if (m !== undefined && !(typeof m === "string" && m) && !(isObj(m) && typeof m.id === "string" && m.id)) throw new Error(`${where}: model must be "inherit", a model id, or {id}`);
    const out = { name: a.name, description: a.description, prompt: a.prompt };
    if (m !== undefined) out.model = m;
    return out;
  });
}

function checkEnvName(n) {
  if (!ENV_NAME.test(n) || Buffer.byteLength(n) > 255) throw new Error(`env name ${JSON.stringify(String(n).slice(0, 40))} is not a valid variable name`);
  if (/^CURSOR_/i.test(n)) throw new Error(`env name ${n} is reserved: names cannot start with CURSOR_`);
  if (!LAUNCH_ENV_ALLOW.includes(n)) throw new Error(`env name ${notAllowed(n)}`);
}

/** Session `envVars` (<= 50, values <= 4096 bytes): `--env NAME` values come from our environment, `--env-file` lines are NAME=VALUE. */
export function buildEnvVars({ names = [], fileText = "" } = {}, env = process.env) {
  const out = {};
  for (const n of names) {
    checkEnvName(n);
    if (!env[n]) throw new Error(`--env ${n}: not set in the environment`);
    out[n] = env[n];
  }
  fileText.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const eq = line.indexOf("=");
    if (eq < 1) throw new Error(`env file line ${i + 1} is not NAME=VALUE`); // never echo the line: it may hold the secret
    const n = line.slice(0, eq).trim();
    checkEnvName(n);
    out[n] = line.slice(eq + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
  });
  const entries = Object.entries(out);
  if (entries.length > MAX_ENV) throw new Error(`env: ${entries.length} variables, over ${MAX_ENV}`);
  for (const [n, v] of entries) if (!v || Buffer.byteLength(v) > 4096) throw new Error(`env ${n}: value must be 1 to 4096 bytes`);
  return out;
}

/** The request body with every secret-bearing value reduced to names, for DRYRUN: prompt text, header/env/auth values and variable values never print. */
export function maskBody(body) {
  const { prompt, mcpServers, customSubagents, envVars, ...rest } = body;
  const out = { ...rest, promptChars: prompt.text.length };
  if (mcpServers) out.mcpServers = mcpServers.map((m) => ({ name: m.name, type: m.type, ...(m.headers && { headerNames: Object.keys(m.headers) }), ...(m.env && { envNames: Object.keys(m.env) }), ...(m.auth && { auth: Object.keys(m.auth) }) }));
  if (customSubagents) out.customSubagents = customSubagents.map((a) => a.name);
  if (envVars) out.envVars = Object.keys(envVars);
  if (mcpServers?.envRefs?.length) out.mcpEnvRefs = mcpServers.envRefs;
  return out;
}

/** The POST /v1/agents body. No PR, no push to a live branch unless asked. */
export function buildLaunchBody({ prompt, model = DEFAULT_MODEL, repo = DEFAULT_REPO, ref, prUrl, name, createPr = false, onBranch = false, mode, agentId = newAgentId(), mcpServers, customSubagents, envVars }) {
  needText(prompt, "prompt");
  if (ref && prUrl) throw new Error("--ref and --pr are exclusive: a PR carries its own base");
  const repoCfg = { url: repo };
  if (prUrl) repoCfg.prUrl = prUrl;
  else if (ref) repoCfg.startingRef = ref;
  const body = {
    prompt: { text: prompt },
    model: { id: model },
    name: (name || `claude-launch: ${prompt.trim().replace(/\s+/g, " ")}`).slice(0, 100),
    agentId,
    env: { type: "cloud" },
    repos: [repoCfg],
    autoCreatePR: !!createPr,
    workOnCurrentBranch: !!onBranch,
  };
  if (needMode(mode)) body.mode = mode;
  // Already validated by parseMcpServers / parseSubagents / buildEnvVars (the CLI calls them); attached only when non-empty.
  if (mcpServers?.length) body.mcpServers = mcpServers;
  if (customSubagents?.length) body.customSubagents = customSubagents;
  if (envVars && Object.keys(envVars).length) {
    body.envVars = envVars;
    // The spec forbids a client agentId together with envVars, so the server mints it (launchAgent then records the id from the response).
    delete body.agentId;
  }
  return body;
}

/** `{code, message}` from an error response, or a generic pair when the body is not the documented envelope. */
async function apiError(r) {
  let code = `http_${r.status}`;
  let message = "";
  try {
    const e = (await r.json()).error || {};
    code = e.code || code;
    message = e.message || "";
  } catch {
    /* non-JSON error body */
  }
  return { status: r.status, code, message };
}

/** ` envNames=A,B mcpEnvRefs=C`: the env NAMES a launch forwards (X1 audit trail); values never print. */
const envNamesNote = (envVars, mcpServers) =>
  `${envVars && Object.keys(envVars).length ? ` envNames=${Object.keys(envVars).join(",")}` : ""}${mcpServers?.envRefs?.length ? ` mcpEnvRefs=${mcpServers.envRefs.join(",")}` : ""}`;

const fail = (e, what) => new Error(`${what}: HTTP ${e.status} ${e.code}${e.message ? ` — ${e.message.slice(0, 200)}` : ""}`);

/** Launch one agent. Records the id BEFORE the request so a crash mid-flight still leaves it manageable; a failed create un-records it. */
export async function launchAgent(opts, { file = allowFile() } = {}) {
  const body = buildLaunchBody(opts);
  const hasEnv = !!body.envVars;
  const meta = { launchedAt: new Date().toISOString(), model: body.model.id, repo: body.repos[0].url, name: body.name };
  const extras = `mcp=${body.mcpServers?.length || 0} subagents=${body.customSubagents?.length || 0} env=${Object.keys(body.envVars || {}).length}${envNamesNote(body.envVars, body.mcpServers)}`;
  if (opts.dryRun) return [`DRYRUN ${body.agentId || "(server-minted)"} promptChars=${body.prompt.text.length} ${JSON.stringify(maskBody(body))}`];
  if (!opts.allowTwin) {
    // Six near-identical "Mcp ... listing" agents ran ~600 tool calls on one question in a day (2026-10-20 transcripts).
    const twin = (await listAgents(100)).find((a) => a.status !== "ARCHIVED" && (a.name || "").toLowerCase() === body.name.toLowerCase());
    if (twin) throw new Refused(`TWIN ${twin.id} ${twin.status} "${body.name.slice(0, 40)}" already exists with this name; pass --allow-twin to launch anyway`);
  }
  const startedAt = clock.now();
  // With a client agentId the id is recorded BEFORE the request and a retry is idempotent. With envVars there is no client id:
  // the id is recorded from the response, nothing is retried on a 5xx, and an ambiguous failure is resolved by looking the agent up by name.
  if (!hasEnv) recordAllow(body.agentId, meta, file);
  const recover = async (why) => {
    const found = (await listAgents(20)).find((a) => a.name === body.name && Date.parse(a.createdAt) >= startedAt - 60000);
    if (!found) throw why;
    recordAllow(found.id, meta, file);
    return [`LAUNCH ${found.id} run=${found.latestRunId || "-"} model=${meta.model} ${extras} (recovered after an ambiguous failure)`];
  };
  let r;
  try {
    r = await api("/v1/agents", { method: "POST", body, retry5xx: !hasEnv });
  } catch (e) {
    if (!hasEnv) throw e;
    return recover(e);
  }
  if (hasEnv && r.status >= 500) return recover(fail(await apiError(r), "launch"));
  if (r.status === 409) {
    const e = await apiError(r);
    // A 5xx retry can land after the first attempt succeeded: the same agentId then conflicts, which means "already created".
    if (!hasEnv && e.code === "agent_id_conflict") {
      const a = await json(`/v1/agents/${body.agentId}`);
      return [`LAUNCH ${body.agentId} run=${a.latestRunId || "-"} model=${meta.model} (already created)`];
    }
    if (!hasEnv) forgetAllow(body.agentId, file);
    throw fail(e, "launch");
  }
  if (!r.ok) {
    if (!hasEnv) forgetAllow(body.agentId, file);
    throw fail(await apiError(r), "launch");
  }
  const d = await r.json();
  const id = d.agent?.id || body.agentId;
  if (hasEnv) recordAllow(id, meta, file);
  return [`LAUNCH ${id} run=${d.run?.id || "-"} model=${meta.model} repo=${meta.repo.split("/").pop()} pr=${body.autoCreatePR ? "auto" : "off"}${hasEnv || body.mcpServers || body.customSubagents ? ` ${extras}` : ""}`];
}

export async function followUp(id, text, mode, { file = allowFile(), mcpServers } = {}) {
  assertAllowed(id, file);
  needText(text, "text");
  const body = { prompt: { text } };
  if (needMode(mode)) body.mode = mode;
  if (mcpServers?.length) body.mcpServers = mcpServers; // replaces the create-time inline servers for this run only (spec)
  const r = await api(`/v1/agents/${id}/runs`, { method: "POST", body });
  if (r.status === 409) {
    const e = await apiError(r);
    if (e.code === "agent_busy") return [`BUSY ${id} a run is already active; retry when status is IDLE`];
    throw fail(e, "followup");
  }
  if (!r.ok) throw fail(await apiError(r), "followup");
  const d = await r.json();
  return [`FOLLOWUP ${id} run=${d.run?.id || "-"} HTTP ${r.status}${envNamesNote(null, body.mcpServers)}`];
}

export async function cancelRun(id, runId, { file = allowFile() } = {}) {
  assertAllowed(id, file);
  const run = runId || (await json(`/v1/agents/${id}`)).latestRunId;
  if (!run) throw new Error(`cancel ${id}: no run to cancel`);
  const r = await api(`/v1/agents/${id}/runs/${run}/cancel`, { method: "POST" });
  if (r.status === 409) {
    const e = await apiError(r);
    if (e.code === "run_not_cancellable") return [`NOT_CANCELLABLE ${id} run=${run} (already finished)`];
    throw fail(e, "cancel");
  }
  if (!r.ok) throw fail(await apiError(r), "cancel");
  return [`CANCELLED ${id} run=${run}`];
}

export async function archiveAgent(id, { file = allowFile() } = {}) {
  assertAllowed(id, file);
  const r = await api(`/v1/agents/${id}/archive`, { method: "POST" });
  if (!r.ok) throw fail(await apiError(r), "archive");
  return [`ARCHIVED ${id}`];
}

export async function deleteAgent(id, { file = allowFile() } = {}) {
  assertAllowed(id, file);
  const r = await api(`/v1/agents/${id}`, { method: "DELETE" });
  if (r.status === 404) forgetAllow(id, file);
  if (!r.ok) throw fail(await apiError(r), "delete");
  forgetAllow(id, file);
  return [`DELETED ${id}`];
}

/** List agents, following `nextCursor` (the API caps a page at 100). */
export async function listAgents(limit, { prUrl, includeArchived } = {}) {
  const out = [];
  let cursor;
  while (out.length < limit) {
    const q = new URLSearchParams({ limit: String(Math.min(100, limit - out.length)) });
    if (cursor) q.set("cursor", cursor);
    if (prUrl) q.set("prUrl", prUrl);
    if (includeArchived) q.set("includeArchived", "true");
    const d = await json(`/v1/agents?${q}`);
    out.push(...(d.items || []));
    cursor = d.nextCursor;
    if (!cursor || !(d.items || []).length) break;
  }
  return out.slice(0, limit);
}

// Streams are retained 24 h (`X-Cursor-Stream-Retention-Seconds: 86400`). Measured 2026-10-20 on 45 fleet runs: all 43
// runs 37-50 h old were 410 and none younger than 24 h was; the 2 older ones that answered 200 were cancelled runs with
// no transcript (status, result, done only). So a run past the window is skipped without a request; a 410 that still
// arrives is counted the same way. The 5 min margin keeps a run on the boundary from being dropped by clock skew.
const retentionMs = () => (Number(process.env.APEX_CURSOR_RETENTION_S) || 86400) * 1000 + 300000;

/** Save every run stream of `agents` under `dir`; a run past the retention window, or a 410 (stream_expired), is counted as expired. */
export async function dumpRuns(agents, dir, { gapMs = 1500 } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  let got = 0;
  let skipped = 0;
  let expired = 0;
  let live = 0;
  let slow = 0;
  for (const id of agents) {
    for (const run of (await json(`/v1/agents/${id}/runs`)).items || []) {
      const out = path.join(dir, `${id.slice(-8)}_${run.id.slice(-8)}.sse`);
      if (run.status === "CREATING" || (fs.existsSync(out) && fs.statSync(out).size > 2000)) {
        skipped++;
        continue;
      }
      // A RUNNING run's stream stays open until the run ends: a 200-agent dump hung 5 min on the first one (2026-10-20).
      // Count it and move on; dump again (or `transcript`, which caps a live read) once it finishes.
      if (run.status === "RUNNING") {
        live++;
        continue;
      }
      if (run.createdAt && clock.now() - Date.parse(run.createdAt) > retentionMs()) {
        expired++;
        continue;
      }
      // A FINISHED run's stream can stay open too: one on an agent with a live follow-up was still sending at 25 s, where
      // a normal one replays in 2 s. A stream cut by the timeout is counted as slow and not written (it has no `done`).
      let text;
      try {
        const signal = AbortSignal.timeout((Number(process.env.APEX_CURSOR_STREAM_TIMEOUT_S) || 60) * 1000);
        const r = await api(`/v1/agents/${id}/runs/${run.id}/stream`, { accept: "text/event-stream", signal });
        if (r.status === 410) {
          expired++;
          continue;
        }
        if (!r.ok) throw new Error(`stream ${run.id}: HTTP ${r.status}`);
        text = await r.text();
      } catch (e) {
        if (e.name !== "TimeoutError") throw e;
        slow++;
        continue;
      }
      fs.writeFileSync(out, text);
      got++;
      await sleep(gapMs);
    }
  }
  return `DUMP dir=${path.relative(ROOT, dir)} written=${got} skipped=${skipped} expired=${expired} live=${live} slow=${slow}`;
}

/** Poll an agent until it is neither ACTIVE nor CREATING. Exit code: 0 last run FINISHED, 1 ERROR/CANCELLED/EXPIRED (or other), 124 timeout. */
export async function waitAgent(id, { timeoutS = 600, intervalS = 5 } = {}) {
  const end = clock.now() + timeoutS * 1000;
  for (;;) {
    const a = await json(`/v1/agents/${id}`);
    if (a.status !== "ACTIVE" && a.status !== "CREATING") {
      const runs = (await json(`/v1/agents/${id}/runs`)).items || [];
      const last = runs[0]?.status || "-";
      return { code: last === "FINISHED" ? 0 : 1, line: `WAIT ${id} ${a.status} run=${a.latestRunId || "-"} last=${last}` };
    }
    if (clock.now() + intervalS * 1000 > end) return { code: 124, line: `WAIT ${id} TIMEOUT after=${timeoutS}s status=${a.status} run=${a.latestRunId || "-"}` };
    await sleep(intervalS * 1000);
  }
}

/**
 * Hand-back: wait for an agent to finish, then read and cache EVERY retrievable run while the stream is still there
 * (retention is 24 h, so a transcript not read at hand-back is gone by the next day), and return a bounded digest:
 * a header, one line per run, at most five failure lines, the artifact count. Read-only, so any agent id is allowed.
 * A timeout returns code 124 with no dump (the agent is still working).
 */
export async function handback(id, { timeoutS = 600, intervalS = 5, dir, errors = 5, width = 120 } = {}) {
  const w = await waitAgent(id, { timeoutS, intervalS });
  if (w.code === 124) return { code: 124, lines: [w.line] };
  const { parsed, expired, notCached } = await loadRuns(id, { dir, sel: "all" });
  const calls = parsed.reduce((t, p) => t + p.stats.calls, 0);
  const errs = parsed.reduce((t, p) => t + p.stats.errors, 0);
  const lines = [`${w.line} HANDBACK runs=${parsed.length} expired=${expired} notCached=${notCached} calls=${calls} err=${errs}`];
  for (const p of parsed) lines.push(summaryLine(p, width));
  const failing = renderLines(parsed, { only: ["errors"], width }).slice(0, errors);
  lines.push(...failing);
  if (errs > failing.length) lines.push(`… ${errs - failing.length} more failures (transcript ${id} --only errors)`);
  let arts = 0;
  try {
    arts = ((await json(`/v1/agents/${id}/artifacts`)).items || []).length;
  } catch {
    arts = -1;
  }
  lines.push(`ARTIFACTS ${arts < 0 ? "unreadable" : arts}${arts > 0 ? ` (artifacts ${id})` : ""}`);
  return { code: w.code, lines };
}

/** Reject anything but a plain relative `artifacts/...` path before a request is made. */
export function checkArtifactPath(p) {
  const segs = typeof p === "string" ? p.split("/") : [];
  if (!p || p.startsWith("/") || p.includes("\\") || p.includes("\0") || segs[0] !== "artifacts" || segs.length < 2 || segs.some((x) => x === ".." || x === "." || x === "")) {
    throw new Error(`artifact path must be relative, start with artifacts/ and contain no .., got ${JSON.stringify(p)}`);
  }
  return p;
}

export async function listArtifacts(id) {
  const items = (await json(`/v1/agents/${id}/artifacts`)).items || [];
  return items.map((x) => `ARTIFACT ${id} ${x.path} ${x.sizeBytes} ${x.updatedAt}`);
}

/** Fetch one artifact through its 15-minute presigned URL (no Authorization header: S3 rejects it) into <outDir>/<last8 of id>/<path without the artifacts/ prefix>. */
export async function downloadArtifact(id, p, outDir = path.join(ROOT, "artifacts", "cursor-artifacts")) {
  checkArtifactPath(p);
  const meta = await json(`/v1/agents/${id}/artifacts/download?path=${encodeURIComponent(p)}`);
  const r = await fetch(meta.url);
  if (!r.ok) throw new Error(`artifact download ${p}: HTTP ${r.status}`);
  const dest = path.join(outDir, id.slice(-8), p.slice("artifacts/".length));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return [`SAVED ${path.relative(ROOT, dest)} ${buf.length}`];
}

/**
 * Token usage (early-access endpoint). Plan-included agents report zeros for tokens and charge
 * (measured 2026-10-20), so this is a token count, not a spend meter.
 */
export async function agentUsage(id) {
  const r = await api(`/v1/agents/${id}/usage`);
  if (r.status === 403) {
    const e = await apiError(r);
    if (e.code === "feature_unavailable") return [`USAGE ${id} UNAVAILABLE`];
    throw fail(e, "usage");
  }
  if (!r.ok) throw fail(await apiError(r), "usage");
  const d = await r.json();
  const runs = d.runs || [];
  // The live response (not the OpenAPI spec) carries cost as `cost{rawCostCents,chargedCents}` at the top level and
  // per run; the SDK docs say it is absent until billing settles, so absent prints n/a, never a made-up 0.
  const costed = runs.filter((x) => x.cost);
  const cents = d.cost?.chargedCents ?? (costed.length ? costed.reduce((s, x) => s + (x.cost.chargedCents || 0), 0) : undefined);
  return [`USAGE ${id} tokens=${d.totalUsage?.totalTokens ?? 0} chargedCents=${cents ?? "n/a"} runs=${runs.length}`];
}

const flag = (args, name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const has = (args, name) => args.includes(name);
const flagAll = (args, name) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]] : []));
/** Read a JSON file; JSON.parse's own message can quote the input (a secret), so a bad file gets a fixed message. */
const readJson = (file, what) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new Error(`${what} file ${file} is missing or is not valid JSON`);
  }
};
/** Print result lines; BUSY / NOT_CANCELLABLE are refusals by the API, so they exit 1 for callers that branch on it. */
const emit = (lines) => {
  for (const l of lines) console.log(l);
  if (/^(BUSY|NOT_CANCELLABLE) /.test(lines[0] || "")) process.exitCode = 1;
};
/** `--x "text"` or `--x-file path`; the file form keeps prompts out of shell history and quoting. */
const textArg = (args, name) => (flag(args, `${name}-file`) ? fs.readFileSync(flag(args, `${name}-file`), "utf8") : flag(args, name));

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const dir = path.resolve(flag(rest, "--dir", DEFAULT_DIR));
  if (cmd === "list") {
    const opts = { prUrl: flag(rest, "--pr"), includeArchived: has(rest, "--include-archived") };
    for (const a of await listAgents(Number(flag(rest, "--limit", 20)), opts)) {
      const repo = (a.repos?.[0]?.url || "-").split("/").pop();
      console.log(`AGENT ${a.id} ${a.status} ${repo} ${a.updatedAt} "${(a.name || "").slice(0, 40)}"`);
    }
  } else if (cmd === "status") {
    const id = rest[0];
    if (!id) throw new Error("status <agent-id>");
    const [a, runs] = await Promise.all([json(`/v1/agents/${id}`), json(`/v1/agents/${id}/runs`)]);
    const r = runs.items || [];
    const dur = r.reduce((s, x) => s + (x.durationMs || 0), 0);
    console.log(`AGENT ${a.id} ${a.status} run=${a.latestRunId} runs=${r.length} durMin=${Math.round(dur / 60000)} last=${r[0]?.status || "-"}`);
  } else if (cmd === "dump") {
    const ids = rest.filter((x) => !x.startsWith("--") && x !== flag(rest, "--dir") && x !== flag(rest, "--limit"));
    const agents = ids.length ? ids : (await listAgents(Number(flag(rest, "--limit", 20)))).map((a) => a.id);
    console.log(await dumpRuns(agents, dir));
  } else if (cmd === "digest") {
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".sse")) : [];
    if (!files.length) throw new Error(`no .sse dumps in ${dir}; run dump first`);
    const runs = files.map((f) => digestRun(parseSse(fs.readFileSync(path.join(dir, f), "utf8"))));
    for (const l of formatDigest(mergeDigests(runs))) console.log(l);
  } else if (cmd === "transcript") {
    if (!rest[0]) throw new Error("transcript <agent-id> [--run ID | --all] [--only tools,errors,chat,turns] [--tool NAME] [--grep RE] [--results] [--summary] [--json]");
    const only = flag(rest, "--only");
    emit(
      await transcript(rest[0], {
        sel: has(rest, "--all") ? "all" : flag(rest, "--run") || "last",
        only: only ? only.split(",") : undefined,
        tool: flag(rest, "--tool"),
        grep: flag(rest, "--grep"),
        width: Number(flag(rest, "--width", 160)),
        results: has(rest, "--results"),
        summary: has(rest, "--summary"),
        json: has(rest, "--json"),
        dir: flag(rest, "--dir") ? dir : undefined,
        fetchMissing: !has(rest, "--no-fetch"),
      }),
    );
  } else if (cmd === "call") {
    if (!rest[0] || !rest[1]) throw new Error("call <agent-id> <callId | run8#seq> [--run ID] [--max N]");
    emit(await transcriptCall(rest[0], rest[1], { sel: flag(rest, "--run") || "all", max: Number(flag(rest, "--max", 4000)), dir: flag(rest, "--dir") ? dir : undefined, fetchMissing: !has(rest, "--no-fetch") }));
  } else if (cmd === "launch") {
    const lines = await launchAgent({
      prompt: textArg(rest, "--prompt"),
      model: flag(rest, "--model"),
      repo: flag(rest, "--repo"),
      ref: flag(rest, "--ref"),
      prUrl: flag(rest, "--pr"),
      name: flag(rest, "--name"),
      mode: flag(rest, "--mode"),
      createPr: has(rest, "--create-pr"),
      onBranch: has(rest, "--on-branch"),
      dryRun: has(rest, "--dry-run"),
      allowTwin: has(rest, "--allow-twin"),
      mcpServers: flag(rest, "--mcp-file") ? parseMcpServers(readJson(flag(rest, "--mcp-file"), "mcp")) : undefined,
      customSubagents: flag(rest, "--subagent-file") ? parseSubagents(readJson(flag(rest, "--subagent-file"), "subagent")) : undefined,
      envVars:
        flagAll(rest, "--env").length || flag(rest, "--env-file")
          ? buildEnvVars({ names: flagAll(rest, "--env"), fileText: flag(rest, "--env-file") ? fs.readFileSync(flag(rest, "--env-file"), "utf8") : "" })
          : undefined,
    });
    emit(lines);
    const id = /^LAUNCH (bc-\S+)/.exec(lines[0])?.[1];
    if (has(rest, "--wait") && id) {
      const w = await waitAgent(id, { timeoutS: Number(flag(rest, "--timeout", 600)) });
      console.log(w.line);
      process.exitCode = w.code;
    }
  } else if (cmd === "wait") {
    if (!rest[0]) throw new Error("wait <agent-id> [--timeout S] [--interval S]");
    const w = await waitAgent(rest[0], { timeoutS: Number(flag(rest, "--timeout", 600)), intervalS: Number(flag(rest, "--interval", 5)) });
    console.log(w.line);
    process.exitCode = w.code;
  } else if (cmd === "handback") {
    if (!rest[0]) throw new Error("handback <agent-id> [--timeout S] [--interval S]");
    const r = await handback(rest[0], { timeoutS: Number(flag(rest, "--timeout", 600)), intervalS: Number(flag(rest, "--interval", 5)), dir: flag(rest, "--dir") ? dir : undefined });
    for (const l of r.lines) console.log(l);
    process.exitCode = r.code;
  } else if (cmd === "artifacts") {
    for (const l of await listArtifacts(rest[0])) console.log(l);
  } else if (cmd === "artifact") {
    emit(await downloadArtifact(rest[0], rest[1], flag(rest, "--out") ? path.resolve(flag(rest, "--out")) : undefined));
  } else if (cmd === "usage") {
    emit(await agentUsage(rest[0]));
  } else if (cmd === "followup") {
    emit(await followUp(rest[0], textArg(rest, "--text"), flag(rest, "--mode"), { mcpServers: flag(rest, "--mcp-file") ? parseMcpServers(readJson(flag(rest, "--mcp-file"), "mcp")) : undefined }));
  } else if (cmd === "cancel") {
    emit(await cancelRun(rest[0], flag(rest, "--run")));
  } else if (cmd === "archive") {
    emit(await archiveAgent(rest[0]));
  } else if (cmd === "delete") {
    emit(await deleteAgent(rest[0]));
  } else if (cmd === "allowed") {
    for (const [id, m] of Object.entries(readAllow())) console.log(`ALLOWED ${id} ${m.launchedAt} ${m.model} "${(m.name || "").slice(0, 40)}"`);
  } else {
    console.log("usage: cursor-agents.mjs list [--pr U] [--include-archived]|status <id>|wait <id>|artifacts <id>|artifact <id> <path>|usage <id>|dump [<id>...]|digest [--dir D]|launch …|followup <id> …|cancel <id>|archive <id>|delete <id>|allowed");
    process.exit(cmd ? 1 : 0);
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.log(e instanceof Refused ? e.message : `ERROR ${e.message}`);
    process.exit(e instanceof Refused ? 3 : 1);
  });
}
