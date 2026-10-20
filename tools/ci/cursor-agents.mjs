#!/usr/bin/env node
// cursor-agents.mjs — Cursor Cloud Agents client: read (list, status, dump, digest) and control agents this tool launched (launch, followup, cancel, archive, delete).
// @doc Cursor agents client: read, wait, artifacts, usage; launch/followup/cancel/archive/delete of agents it launched.
// Full description: Cursor Cloud Agents API v1 client (`CURSOR_API_KEY` from the environment, never printed). Reads: `list`, `status <id>`, `dump [<id>...]` (SSE run streams, rate-limit safe, into ignored artifacts/), `digest`. Writes: `launch` (client-minted agentId, so a retry never duplicates), `followup`, `cancel`, `archive`, `delete`: each refuses an agent id that `launch` did not record in artifacts/cursor-launched.json (the key reaches every agent its owner has). `allowed` lists the recorded ids. Also: `wait`, `artifacts`/`artifact` (presigned download), `usage`.
// @skill agent-fleet
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
//   node tools/ci/cursor-agents.mjs dump [<agent-id>...] [--limit 20]
//   node tools/ci/cursor-agents.mjs digest [--dir artifacts/cursor-dumps]
//   node tools/ci/cursor-agents.mjs launch (--prompt "…" | --prompt-file F) [--model composer-2.5] [--repo URL]
//        [--ref BRANCH | --pr PR_URL] [--name N] [--mode agent|plan] [--create-pr] [--on-branch] [--allow-twin] [--dry-run] [--wait [--timeout S]]
//   node tools/ci/cursor-agents.mjs followup <id> (--text "…" | --text-file F) [--mode agent|plan]
//   node tools/ci/cursor-agents.mjs cancel <id> [--run <runId>]
//   node tools/ci/cursor-agents.mjs archive <id>
//   node tools/ci/cursor-agents.mjs delete <id>        (irreversible; archive is the reversible one)
//   node tools/ci/cursor-agents.mjs allowed
//
// Writes touch ONLY ids `launch` recorded (artifacts/cursor-launched.json, override APEX_CURSOR_ALLOW):
// the key is user-scoped and reaches every agent its owner has. Output is one typed
// line per fact, never a transcript or prompt body. Exit 2 = no key, 3 = REFUSED
// (id not launched by this tool), 1 = API error; BUSY / NOT_CANCELLABLE print their
// own line and exit 1. Request shapes: https://cursor.com/docs-static/cloud-agents-openapi.yaml
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
async function api(route, { accept = "application/json", tries = 6, method = "GET", body, retry5xx = false } = {}) {
  const key = process.env.CURSOR_API_KEY;
  if (!key) {
    console.log("BLOCKED no CURSOR_API_KEY in the environment");
    process.exit(2);
  }
  const headers = { Authorization: `Bearer ${key}`, Accept: accept };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  for (let a = 0; a < tries; a++) {
    const r = await fetch(BASE + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
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

/** Parse an SSE body into [{event, data}], skipping rows that are not JSON. */
export function parseSse(text) {
  const out = [];
  let ev = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("event: ")) ev = line.slice(7).trim();
    else if (line.startsWith("data: ")) {
      try {
        out.push({ event: ev, data: JSON.parse(line.slice(6)) });
      } catch {
        /* partial row */
      }
    }
  }
  return out;
}

const TERMINAL_CLASSES =
  /\b(sync-pr|ci-watch|test-bg|tooling-fast|verify-track|deploy\.mjs|gh run|gh pr|gh api|git (?:push|commit|merge|fetch|status|diff|log)|npm test|node --test|npx|curl|grep|sed|cat|ls|seq|sleep)\b/;

/** One-line head of a tool failure, or null when the call succeeded. Ids and workspace paths are masked so equal failures group. */
export function errorHead(name, result) {
  if (!result || typeof result !== "object") return null;
  let bad = null;
  if (result.error) bad = result.error.message || result.error.error || JSON.stringify(result.error);
  else if (result.spawnError) bad = `spawnError ${result.spawnError.message || JSON.stringify(result.spawnError)}`;
  else if (name === "mcp" && result.success) {
    // An MCP tool reports its own failure inside a successful transport call: {"ok":false,"error"|"message":"..."}.
    const m = /"ok":\s*false[^}]*?"(?:error|message)":\s*"([^"]{0,120})/.exec(JSON.stringify(result.success).replace(/\\"/g, '"'));
    if (m) bad = `ok:false ${m[1]}`;
  }
  if (bad === null) return null;
  const head = String(typeof bad === "string" ? bad : JSON.stringify(bad)).replace(/\s+/g, " ").replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "<uuid>").replace(/\/workspace\S*/g, "<path>");
  return `${name}: ${head.slice(0, 90)}`;
}

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
    else if (event === "tool_call") {
      const n = data.name || "?";
      const args = data.args || {};
      const size = JSON.stringify(data.result ?? "").length;
      m.calls[n] = (m.calls[n] || 0) + 1;
      m.resChars[n] = (m.resChars[n] || 0) + size;
      const bad = errorHead(n, data.result);
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
      const ok = data.result && data.result.success;
      if (n === "edit_file" && ok) {
        m.editEchoChars += (ok.beforeFullFileContent || "").length + (ok.afterFullFileContent || "").length;
      }
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
        const c = args.command || "";
        const cls = TERMINAL_CLASSES.exec(c)?.[1] || (c ? "other" : "(args missing)");
        const t = (m.terminal[cls] ||= { calls: 0, chars: 0 });
        t.calls++;
        t.chars += size;
      }
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

// ---- control verbs: launch / followup / cancel / archive / delete -------------------------------

export const DEFAULT_REPO = "https://github.com/brycejmurrin/f1-game";
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

export function forgetAllow(id, file = allowFile()) {
  const a = readAllow(file);
  delete a[id];
  writeAllow(a, file);
}

/** Throw Refused unless `id` is well formed AND was recorded by `launch`. */
export function assertAllowed(id, file = allowFile()) {
  if (!id || !AGENT_ID.test(id)) throw new Refused(`REFUSED ${id || "(no id)"} is not a bc-<uuid> agent id`);
  if (!readAllow(file)[id]) throw new Refused(`REFUSED ${id} was not launched by this tool (see: allowed)`);
}

export const newAgentId = () => `bc-${crypto.randomUUID()}`;

function needText(text, what) {
  if (typeof text !== "string" || !text.trim()) throw new Error(`${what} is empty`);
  if (text.length > MAX_PROMPT) throw new Error(`${what} is ${text.length} chars, over ${MAX_PROMPT}`);
  return text;
}

function needMode(mode) {
  if (mode !== undefined && mode !== "agent" && mode !== "plan") throw new Error(`--mode must be agent or plan, got ${mode}`);
  return mode;
}

/** The POST /v1/agents body. No PR, no push to a live branch unless asked. */
export function buildLaunchBody({ prompt, model = DEFAULT_MODEL, repo = DEFAULT_REPO, ref, prUrl, name, createPr = false, onBranch = false, mode, agentId = newAgentId() }) {
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

const fail = (e, what) => new Error(`${what}: HTTP ${e.status} ${e.code}${e.message ? ` — ${e.message.slice(0, 200)}` : ""}`);

/** Launch one agent. Records the id BEFORE the request so a crash mid-flight still leaves it manageable; a failed create un-records it. */
export async function launchAgent(opts, { file = allowFile() } = {}) {
  const body = buildLaunchBody(opts);
  const meta = { launchedAt: new Date().toISOString(), model: body.model.id, repo: body.repos[0].url, name: body.name };
  if (opts.dryRun) {
    const { prompt, ...rest } = body;
    return [`DRYRUN ${body.agentId} promptChars=${prompt.text.length} ${JSON.stringify(rest)}`];
  }
  if (!opts.allowTwin) {
    // Six near-identical "Mcp ... listing" agents ran ~600 tool calls on one question in a day (2026-10-20 transcripts).
    const twin = (await listAgents(100)).find((a) => a.status !== "ARCHIVED" && (a.name || "").toLowerCase() === body.name.toLowerCase());
    if (twin) throw new Refused(`TWIN ${twin.id} ${twin.status} "${body.name.slice(0, 40)}" already exists with this name; pass --allow-twin to launch anyway`);
  }
  recordAllow(body.agentId, meta, file);
  const r = await api("/v1/agents", { method: "POST", body, retry5xx: true });
  if (r.status === 409) {
    const e = await apiError(r);
    // A 5xx retry can land after the first attempt succeeded: the same agentId then conflicts, which means "already created".
    if (e.code === "agent_id_conflict") {
      const a = await json(`/v1/agents/${body.agentId}`);
      return [`LAUNCH ${body.agentId} run=${a.latestRunId || "-"} model=${meta.model} (already created)`];
    }
    forgetAllow(body.agentId, file);
    throw fail(e, "launch");
  }
  if (!r.ok) {
    forgetAllow(body.agentId, file);
    throw fail(await apiError(r), "launch");
  }
  const d = await r.json();
  const id = d.agent?.id || body.agentId;
  return [`LAUNCH ${id} run=${d.run?.id || "-"} model=${meta.model} repo=${meta.repo.split("/").pop()} pr=${body.autoCreatePR ? "auto" : "off"}`];
}

export async function followUp(id, text, mode, { file = allowFile() } = {}) {
  assertAllowed(id, file);
  needText(text, "text");
  const body = { prompt: { text } };
  if (needMode(mode)) body.mode = mode;
  const r = await api(`/v1/agents/${id}/runs`, { method: "POST", body });
  if (r.status === 409) {
    const e = await apiError(r);
    if (e.code === "agent_busy") return [`BUSY ${id} a run is already active; retry when status is IDLE`];
    throw fail(e, "followup");
  }
  if (!r.ok) throw fail(await apiError(r), "followup");
  const d = await r.json();
  return [`FOLLOWUP ${id} run=${d.run?.id || "-"} HTTP ${r.status}`];
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
  for (const id of agents) {
    for (const run of (await json(`/v1/agents/${id}/runs`)).items || []) {
      const out = path.join(dir, `${id.slice(-8)}_${run.id.slice(-8)}.sse`);
      if (run.status === "CREATING" || (fs.existsSync(out) && fs.statSync(out).size > 2000)) {
        skipped++;
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
      if (!r.ok) throw new Error(`stream ${run.id}: HTTP ${r.status}`);
      fs.writeFileSync(out, await r.text());
      got++;
      await sleep(gapMs);
    }
  }
  return `DUMP dir=${path.relative(ROOT, dir)} written=${got} skipped=${skipped} expired=${expired}`;
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
  } else if (cmd === "artifacts") {
    for (const l of await listArtifacts(rest[0])) console.log(l);
  } else if (cmd === "artifact") {
    emit(await downloadArtifact(rest[0], rest[1], flag(rest, "--out") ? path.resolve(flag(rest, "--out")) : undefined));
  } else if (cmd === "usage") {
    emit(await agentUsage(rest[0]));
  } else if (cmd === "followup") {
    emit(await followUp(rest[0], textArg(rest, "--text"), flag(rest, "--mode")));
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
