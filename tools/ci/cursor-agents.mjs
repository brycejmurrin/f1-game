#!/usr/bin/env node
// cursor-agents.mjs — read-only Cursor Cloud Agents client: list, status, dump full run transcripts, digest them.
// @doc Read-only Cursor agents client: list, status, dump run transcripts to artifacts/, digest token-proxy metrics.
// Full description: Read-only Cursor Cloud Agents API client (`CURSOR_API_KEY` from the environment, never printed). `list`, `status <id>`, `dump [<id>...]` (SSE run streams, rate-limit safe, into ignored artifacts/) and `digest` (per-tool result volume, repeats, edit_file echo, wake runs).
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
//
// Read-only: no launch, follow-up, stop or delete. Output is one typed line per
// fact, never a transcript body. Exit 2 = no key, 1 = API error.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = "https://api.cursor.com";
const DEFAULT_DIR = path.join(ROOT, "artifacts", "cursor-dumps");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(route, { accept = "application/json", tries = 6 } = {}) {
  const key = process.env.CURSOR_API_KEY;
  if (!key) {
    console.log("BLOCKED no CURSOR_API_KEY in the environment");
    process.exit(2);
  }
  for (let a = 0; a < tries; a++) {
    const r = await fetch(BASE + route, { headers: { Authorization: `Bearer ${key}`, Accept: accept } });
    if (r.status === 429 || r.status >= 500) {
      await sleep(5000 * 2 ** a);
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

async function listAgents(limit) {
  const d = await json(`/v1/agents?limit=${limit}`);
  return d.items || [];
}

const flag = (args, name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};

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
  } else {
    console.log("usage: cursor-agents.mjs list|status <id>|dump [<id>...]|digest [--dir D]");
    process.exit(cmd ? 1 : 0);
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.log(`ERROR ${e.message}`);
    process.exit(1);
  });
}
