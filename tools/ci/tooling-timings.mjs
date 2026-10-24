#!/usr/bin/env node
/**
 * @doc Refresh tests/data/tooling-fast-timings.json from CI: median per-file durations out of green guards-shard logs.
 * @section runner
 * @skill check-changes
 *
 * The CI tooling shards (ci.yml guards-a/b/c) pack files by that committed
 * table. On 2026-10-24 it held 396 of 855 files, recorded on a local box;
 * the 459 unmeasured files were packed at a fallback cost and started first,
 * and the slowest shard ran a mean 7.4 min against a 6.1 min balance
 * (docs/notes/BUILD-HUNT-2026-10-24.md B1). This reads the runners' own
 * `PASS i/n <file> duration=…` lines, so the table measures the machine
 * and `--jobs` the split runs on.
 *
 *   node tools/ci/tooling-timings.mjs                 # newest 6 green runs → predicted shard walls, old vs new
 *   node tools/ci/tooling-timings.mjs --runs 10 --write
 *   node tools/ci/tooling-timings.mjs --branch cursor/x --runs 3     # only that branch's runs (a packing experiment)
 *   node tools/ci/tooling-timings.mjs --log a.log --log b.log --write   # saved job logs, no API
 *
 * Read-only on GitHub (token via github-token.mjs). `--write` rewrites the
 * table with files still in TOOLING_FAST_FILES only; a file with no CI sample
 * keeps its old entry. Every file runs in exactly one shard either way: the
 * table moves files between shards, it never drops one.
 */
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { api, REPO } from "./github-api.mjs";
import { githubToken, NO_TOKEN_HINT } from "./github-token.mjs";
import { TOOLING_FAST_FILES, TIMINGS_FILE, applyFileShard, scheduleLongestFirst } from "./tooling-fast.mjs";

const relFile = (f) => (path.isAbsolute(f) ? path.relative(process.cwd(), f) : f);

export const GUARD_JOBS = ["Structural guards (tooling A)", "Structural guards (tooling B)", "Structural guards (tooling C)"];
export const CI_JOBS = 4;   // ci.yml: tooling-fast.mjs --jobs=4 on a 4-vCPU ubuntu-latest

const PASS_RE = /\[tooling-fast\] PASS\s+\d+\/\d+ (\S+) duration=([\d.]+)(ms|s)\b/g;

/** `{ file: [ms, …] }` from one job log's PASS lines (FAIL and timeouts say nothing about normal cost). */
export function parseDurations(logText, into = {}) {
  for (const m of String(logText).matchAll(PASS_RE)) {
    const ms = m[3] === "s" ? Number(m[2]) * 1000 : Number(m[2]);
    if (Number.isFinite(ms)) (into[m[1]] ||= []).push(ms);
  }
  return into;
}

export function median(values) {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

/** New `ms` table: CI median where sampled, else the old entry; only files in `files`; rounded to 10 ms like --record. */
export function foldTable(samples, oldMs = {}, files = TOOLING_FAST_FILES) {
  const out = {};
  for (const f of [...files].map(relFile).sort()) {
    const m = samples[f]?.length ? median(samples[f]) : oldMs[f];
    if (typeof m === "number") out[f] = Math.round(m / 10) * 10;
  }
  return out;
}

/** Predicted wall (ms) of each CI shard: pack by `table`, run `jobs` slots greedily on `truth` durations. */
export function predictShards(table, truth, { files = TOOLING_FAST_FILES, shards = 3, jobs = CI_JOBS, fallbackMs = 1000 } = {}) {
  const walls = [];
  for (let i = 1; i <= shards; i++) {
    const slots = new Array(jobs).fill(0);
    for (const f of scheduleLongestFirst(applyFileShard(files, `${i}/${shards}`, table), table)) {
      const k = slots.indexOf(Math.min(...slots));
      slots[k] += truth[relFile(f)] ?? fallbackMs;
    }
    walls.push(Math.max(...slots));
  }
  return walls;
}

function fetchLog(jobId, token) {
  const r = spawnSync("curl", ["-sSL", "--max-time", "60", "-K", "-", `https://api.github.com/repos/${REPO}/actions/jobs/${jobId}/logs`],
    { encoding: "utf8", maxBuffer: 256 << 20, input: `header = "Authorization: Bearer ${token}"\n` });
  return r.status === 0 ? r.stdout : "";
}

/** Samples from the newest `runs` ci.yml runs whose three guard shards all passed. */
export function harvestFromActions(runs, { log = () => {}, branch = null } = {}) {
  const token = githubToken();
  if (!token) throw new Error(NO_TOKEN_HINT);
  const list = api(`actions/workflows/ci.yml/runs?status=completed&per_page=60${branch ? `&branch=${encodeURIComponent(branch)}` : ""}`);
  if (list.error) throw new Error(`runs: ${list.error}`);
  const samples = {};
  const used = [];
  for (const run of list.json.workflow_runs) {
    if (used.length >= runs) break;
    const jobs = api(`actions/runs/${run.id}/jobs?per_page=50`).json?.jobs || [];
    const guard = GUARD_JOBS.map((n) => jobs.find((j) => j.name === n));
    if (!guard.every((j) => j && j.conclusion === "success")) continue;
    const one = {};
    for (const j of guard) parseDurations(fetchLog(j.id, token), one);
    if (!Object.keys(one).length) continue;   // memoized or reused-draft skip: no PASS lines
    for (const [f, v] of Object.entries(one)) (samples[f] ||= []).push(...v);
    used.push(run.id);
    log(`run ${run.id}: ${Object.keys(samples).length} files sampled so far`);
  }
  return { samples, runs: used };
}

function main(argv) {
  const val = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const logs = argv.flatMap((a, i) => (a === "--log" ? [argv[i + 1]] : []));
  const old = JSON.parse(fs.readFileSync(TIMINGS_FILE, "utf8"));
  let samples = {};
  let source;
  if (logs.length) {
    for (const p of logs) parseDurations(fs.readFileSync(p, "utf8"), samples);
    source = `${logs.length} log file(s)`;
  } else {
    const h = harvestFromActions(Number(val("--runs", "6")), { log: (s) => console.error(s), branch: val("--branch", null) });
    samples = h.samples;
    source = `ci.yml runs ${h.runs.join(" ")}`;
  }
  const truth = Object.fromEntries(Object.entries(samples).map(([f, v]) => [f, median(v)]));
  const ms = foldTable(samples, old.ms);
  const files = TOOLING_FAST_FILES.map(relFile);
  const fmt = (w) => w.map((x) => (x / 60000).toFixed(2)).join(" / ");
  const before = predictShards(old.ms, truth), after = predictShards(ms, truth);
  console.log(`= source ${source}`);
  console.log(`= coverage old ${files.filter((f) => typeof old.ms[f] === "number").length}/${files.length}  new ${Object.keys(ms).length}/${files.length}  sampled ${files.filter((f) => samples[f]).length}`);
  console.log(`= predicted shard walls (min) old ${fmt(before)}  max ${(Math.max(...before) / 60000).toFixed(2)}`);
  console.log(`= predicted shard walls (min) new ${fmt(after)}  max ${(Math.max(...after) / 60000).toFixed(2)}`);
  if (argv.includes("--write")) {
    fs.writeFileSync(TIMINGS_FILE, JSON.stringify({ _doc: old._doc, jobs: CI_JOBS, ms }, null, 2) + "\n");
    console.log(`= wrote ${TIMINGS_FILE}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try { main(process.argv.slice(2)); }
  catch (e) { console.error(`tooling-timings: ${e.message}`); process.exit(1); }
}
