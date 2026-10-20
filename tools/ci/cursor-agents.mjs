#!/usr/bin/env node
// cursor-agents.mjs — Cursor Cloud Agents client: read (list, status, dump, digest) and control agents this tool launched (launch, followup, cancel, archive, delete).
// @doc Cursor agents client: read (list/status/dump/digest) + launch/followup/cancel/archive/delete of agents it launched.
// Full description: Cursor Cloud Agents API v1 client (`CURSOR_API_KEY` from the environment, never printed). Reads: `list`, `status <id>`, `dump [<id>...]` (SSE run streams, rate-limit safe, into ignored artifacts/), `digest`. Writes: `launch` (client-minted agentId, so a retry never duplicates), `followup`, `cancel`, `archive`, `delete`: each refuses an agent id that `launch` did not record in artifacts/cursor-launched.json (the key reaches every agent its owner has). `allowed` lists the recorded ids.
// @skill agent-fleet
//
// Evidence: docs/notes/CURSOR-AGENTS-API-PROBE-2026-10-19.md. The run stream
// (GET /v1/agents/{id}/runs/{runId}/stream) is the only full-transcript door:
// the v0 conversation route carries text only. It rate-limits (429) when read in
// parallel, so dump is sequential with a gap and exponential backoff.
//
//   node tools/ci/cursor-agents.mjs list [--limit 20]
//   node tools/ci/cursor-agents.mjs status <agent-id>
//   node tools/ci/cursor-agents.mjs dump [<agent-id>...] [--limit 20]
//   node tools/ci/cursor-agents.mjs digest [--dir artifacts/cursor-dumps]
//   node tools/ci/cursor-agents.mjs launch (--prompt "…" | --prompt-file F) [--model composer-2.5] [--repo URL]
//        [--ref BRANCH | --pr PR_URL] [--name N] [--mode agent|plan] [--create-pr] [--on-branch] [--dry-run]
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
      await sleep(Math.min(5000 * 2 ** a, Number(process.env.APEX_CURSOR_BACKOFF_CAP_MS) || 80000));
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
  };
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
  const t = { runs: list.length, calls: {}, resChars: {}, terminal: {} };
  const scalars = ["noArgs", "thinkChars", "asstChars", "editEchoChars", "bigResults", "mcpDiscovery", "mcpDiscoveryDup", "repeatReads"];
  for (const k of scalars) t[k] = 0;
  for (const m of list) {
    for (const k of scalars) t[k] += m[k];
    for (const [n, v] of Object.entries(m.calls)) t.calls[n] = (t.calls[n] || 0) + v;
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

async function listAgents(limit) {
  const d = await json(`/v1/agents?limit=${limit}`);
  return d.items || [];
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
    for (const a of await listAgents(Number(flag(rest, "--limit", 20)))) {
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
    fs.mkdirSync(dir, { recursive: true });
    const ids = rest.filter((x) => !x.startsWith("--") && x !== flag(rest, "--dir") && x !== flag(rest, "--limit"));
    const agents = ids.length ? ids : (await listAgents(Number(flag(rest, "--limit", 20)))).map((a) => a.id);
    let got = 0;
    let skipped = 0;
    for (const id of agents) {
      for (const run of (await json(`/v1/agents/${id}/runs`)).items || []) {
        const out = path.join(dir, `${id.slice(-8)}_${run.id.slice(-8)}.sse`);
        if (run.status === "CREATING" || (fs.existsSync(out) && fs.statSync(out).size > 2000)) {
          skipped++;
          continue;
        }
        const r = await api(`/v1/agents/${id}/runs/${run.id}/stream`, { accept: "text/event-stream" });
        if (!r.ok) throw new Error(`stream ${run.id}: HTTP ${r.status}`);
        fs.writeFileSync(out, await r.text());
        got++;
        await sleep(1500);
      }
    }
    console.log(`DUMP dir=${path.relative(ROOT, dir)} written=${got} skipped=${skipped}`);
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
    });
    emit(lines);
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
    console.log("usage: cursor-agents.mjs list|status <id>|dump [<id>...]|digest [--dir D]|launch …|followup <id> …|cancel <id>|archive <id>|delete <id>|allowed");
    process.exit(cmd ? 1 : 0);
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.log(e instanceof Refused ? e.message : `ERROR ${e.message}`);
    process.exit(e instanceof Refused ? 3 : 1);
  });
}
