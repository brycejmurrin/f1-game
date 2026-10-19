#!/usr/bin/env node
// claude-usage.mjs — digest local Claude Code session JSONL into per-trigger token usage.
// @doc Digests local Claude Code JSONL: deduped requests, input/cache/output tokens by turn trigger.
// Full description: a Claude Code transcript writes one assistant row per content block, each carrying the
// SAME `message.usage`, so summing rows double- or triple-counts. This digester keys each request by
// `requestId` (falling back to `message.id`), keeps the maximum of every counter across its rows and files
// (repeat teleports and resumed copies of one session), and assigns it to the turn that started it. A turn
// starts at a user record that is neither a tool result nor `isMeta` (skill bodies); its trigger is the
// host's own `turnOrigin` (or `origin.kind`). Without either, an envelope prefix (`<task-notification`,
// `<agent-message`, `[SYSTEM NOTIFICATION`) gives `inferred:<kind>`; anything else stays `unclassified`.
// A counter no row reported is UNKNOWN, never zero: totals print `+N unknown`.
// @skill agent-fleet
//
//   node tools/ci/claude-usage.mjs [file.jsonl | dir]...    # default: ~/.claude/projects/<this repo>/
//   node tools/ci/claude-usage.mjs <files> --turns --limit 20   # also the 20 most expensive turns
//   node tools/ci/claude-usage.mjs <files> --json              # the full digest object
//
// Low-tool turns (≤ 1 tool call after the trigger) are a PROXY for a wasted wake, not proof: a one-call
// turn that reads CI and finds it red did its job. Billing, plan limits and subagents the host did not
// write (no sidechain rows) are not in a transcript; the digest says so instead of guessing.
// Never commit transcripts or this tool's per-turn output: they carry prompts and paths.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

export const COUNTERS = ["input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens"];
const ENVELOPES = [
  [/^\s*<task-notification\b/, "task_notification"],
  [/^\s*<agent-message\b/, "peer_message"],
  [/^\s*(?:<system-reminder>\s*)?\[SYSTEM NOTIFICATION\b/, "system_notification"],
];

const textOf = (content) => typeof content === "string" ? content
  : Array.isArray(content) ? content.map((b) => (b && b.type === "text" ? b.text : "")).join(" ") : "";
const isToolResult = (content) => Array.isArray(content) && content.some((b) => b && b.type === "tool_result");

/** The trigger of a turn-starting user record, and whether the host stated it. */
export function triggerOf(rec) {
  const stated = rec.turnOrigin || (rec.origin && rec.origin.kind);
  if (stated) return String(stated).replace(/-/g, "_");
  const text = textOf(rec.message && rec.message.content);
  for (const [rx, kind] of ENVELOPES) if (rx.test(text)) return `inferred:${kind}`;
  return "unclassified";
}

/** A fresh digest accumulator; feed records with `addRecord`, read with `finish`. */
export function createDigest() {
  return { requests: new Map(), turns: [], current: null, malformed: 0, records: 0, files: 0,
    sidechainRequests: 0, apiErrors: 0, metaRecords: 0, unidentified: 0, seenTurns: new Set(), turnByUuid: new Map() };
}

function openTurn(d, rec, file) {
  // A resumed or re-teleported copy repeats the same record uuids: one turn, not two.
  if (rec.uuid && d.seenTurns.has(rec.uuid)) { d.current = d.turnByUuid.get(rec.uuid); return; }
  const turn = { trigger: triggerOf(rec), at: rec.timestamp || null, file, requests: new Set(), tools: new Set() };
  d.turns.push(turn);
  d.current = turn;
  if (rec.uuid) { d.seenTurns.add(rec.uuid); d.turnByUuid.set(rec.uuid, turn); }
}

export function addRecord(d, rec, file = "") {
  d.records++;
  if (!rec || typeof rec !== "object") { d.malformed++; return; }
  if (rec.type === "user") {
    const content = rec.message && rec.message.content;
    if (rec.isMeta) { d.metaRecords++; return; }
    if (!isToolResult(content) && !rec.isSidechain) openTurn(d, rec, file);
    return;
  }
  if (rec.type !== "assistant" || !rec.message) return;
  const m = rec.message;
  if (rec.isApiErrorMessage || rec.error) d.apiErrors++;
  const id = rec.requestId || m.id;
  let key = id;
  if (!key) { d.unidentified++; key = `uuid:${rec.uuid || `${file}:${d.records}`}`; }
  let req = d.requests.get(key);
  if (!req) {
    req = { sidechain: !!rec.isSidechain, usage: {}, turn: null };
    d.requests.set(key, req);
    if (req.sidechain) d.sidechainRequests++;
  }
  const u = m.usage || {};
  for (const c of COUNTERS) if (Number.isFinite(u[c])) req.usage[c] = Math.max(req.usage[c] ?? 0, u[c]);
  if (!req.turn && !req.sidechain && d.current) { req.turn = d.current; d.current.requests.add(key); }
  for (const b of Array.isArray(m.content) ? m.content : []) {
    if (b && b.type === "tool_use" && d.current && !req.sidechain) d.current.tools.add(b.id || `${key}:${d.current.tools.size}`);
  }
}

function sumInto(acc, usage) {
  for (const c of COUNTERS) {
    if (Number.isFinite(usage[c])) acc[c] += usage[c];
    else acc.unknown[c]++;
  }
}
const zero = () => ({ ...Object.fromEntries(COUNTERS.map((c) => [c, 0])), unknown: Object.fromEntries(COUNTERS.map((c) => [c, 0])) });

/** Totals, per-trigger rows and per-turn rows (most expensive first). */
export function finish(d) {
  const total = zero(), sidechain = zero();
  for (const req of d.requests.values()) sumInto(req.sidechain ? sidechain : total, req.usage);
  const byTrigger = {};
  const turns = d.turns.map((t) => {
    const usage = zero();
    for (const k of t.requests) sumInto(usage, d.requests.get(k).usage);
    return { trigger: t.trigger, at: t.at, file: t.file, requests: t.requests.size, tools: t.tools.size, usage };
  });
  for (const t of turns) {
    const row = byTrigger[t.trigger] ||= { turns: 0, requests: 0, lowToolTurns: 0, lowToolInput: 0, ...zero() };
    row.turns++; row.requests += t.requests;
    if (t.tools <= 1) { row.lowToolTurns++; row.lowToolInput += t.usage.input_tokens + t.usage.cache_creation_input_tokens + t.usage.cache_read_input_tokens; }
    for (const c of COUNTERS) { row[c] += t.usage[c]; row.unknown[c] += t.usage.unknown[c]; }
  }
  const orphanRequests = [...d.requests.values()].filter((r) => !r.sidechain && !r.turn).length;
  turns.sort((a, b) => cost(b.usage) - cost(a.usage));
  return {
    files: d.files, records: d.records, malformed: d.malformed, metaRecords: d.metaRecords,
    requests: d.requests.size, unidentifiedRequests: d.unidentified, apiErrors: d.apiErrors,
    sidechainRequests: d.sidechainRequests, orphanRequests, total, sidechain, byTrigger, turns,
    limits: [
      "billing, plan-limit weighting and dollars are not in a transcript",
      d.sidechainRequests ? null : "no sidechain rows: subagent usage unobserved, not zero",
      "lowToolTurns is a proxy for a wasted wake, not proof",
    ].filter(Boolean),
  };
}
const cost = (u) => u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens + u.output_tokens;

/** Stream one JSONL file into the digest; a bad line counts as malformed and never aborts. */
export async function digestFile(d, file) {
  d.files++;
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { d.records++; d.malformed++; continue; }
    addRecord(d, rec, path.basename(file));
  }
}

function listInputs(args) {
  const out = [];
  for (const a of args) {
    const st = fs.statSync(a);
    if (st.isDirectory()) for (const f of fs.readdirSync(a).sort()) { if (f.endsWith(".jsonl")) out.push(path.join(a, f)); }
    else out.push(a);
  }
  return out;
}
export function defaultDir(cwd = process.cwd()) {
  return path.join(os.homedir(), ".claude", "projects", path.resolve(cwd).replace(/[^A-Za-z0-9]/g, "-"));
}

const n = (v) => v.toLocaleString("en-US");
const withUnknown = (row, c) => n(row[c]) + (row.unknown[c] ? ` +${row.unknown[c]} unknown` : "");
export function render(r, { turns = false, limit = 10 } = {}) {
  const lines = [`# claude-usage: ${r.files} file(s), ${n(r.records)} records (${r.malformed} malformed), ${n(r.requests)} unique requests` +
    (r.unidentifiedRequests ? ` (${r.unidentifiedRequests} without requestId/message.id)` : "") +
    `, ${r.apiErrors} API-error rows, ${r.orphanRequests} before any turn`];
  lines.push(`total  input ${withUnknown(r.total, "input_tokens")}  cache-write ${withUnknown(r.total, "cache_creation_input_tokens")}  ` +
    `cache-read ${withUnknown(r.total, "cache_read_input_tokens")}  output ${withUnknown(r.total, "output_tokens")}`);
  if (r.sidechainRequests) lines.push(`sidechain (${r.sidechainRequests} requests)  cache-read ${n(r.sidechain.cache_read_input_tokens)}  output ${n(r.sidechain.output_tokens)}`);
  lines.push("trigger                    turns  reqs  low-tool  cache-read     output  low-tool input");
  for (const [k, v] of Object.entries(r.byTrigger).sort((a, b) => b[1].cache_read_input_tokens - a[1].cache_read_input_tokens)) {
    lines.push(`${k.padEnd(26)} ${String(v.turns).padStart(5)} ${String(v.requests).padStart(5)} ${String(v.lowToolTurns).padStart(9)} ` +
      `${n(v.cache_read_input_tokens).padStart(11)} ${n(v.output_tokens).padStart(10)} ${n(v.lowToolInput).padStart(15)}`);
  }
  if (turns) {
    lines.push(`top ${Math.min(limit, r.turns.length)} turns by tokens:`);
    for (const t of r.turns.slice(0, limit)) lines.push(`  ${t.at || "-"}  ${t.trigger}  reqs=${t.requests} tools=${t.tools} ` +
      `cache-read=${n(t.usage.cache_read_input_tokens)} output=${n(t.usage.output_tokens)}  ${t.file}`);
  }
  for (const l of r.limits) lines.push(`# limit: ${l}`);
  return lines.join("\n");
}

async function main(argv) {
  const json = argv.includes("--json"), turns = argv.includes("--turns");
  const li = argv.indexOf("--limit");
  const limit = li >= 0 ? Number(argv[li + 1]) : 10;
  if (argv.includes("--help") || (li >= 0 && !(Number.isInteger(limit) && limit > 0))) {
    console.log("usage: node tools/ci/claude-usage.mjs [file.jsonl|dir]... [--turns] [--limit N] [--json]");
    return argv.includes("--help") ? 0 : 2;
  }
  const args = argv.filter((a, i) => !a.startsWith("--") && !(li >= 0 && i === li + 1));
  const inputs = listInputs(args.length ? args : [defaultDir()]);
  if (!inputs.length) { console.error("claude-usage: no .jsonl input"); return 2; }
  const d = createDigest();
  for (const f of inputs) await digestFile(d, f);
  const r = finish(d);
  console.log(json ? JSON.stringify(r, null, 1) : render(r, { turns, limit }));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(`claude-usage: ${e.message}`); process.exit(1); });
}
