#!/usr/bin/env node
/**
 * @doc Read-only runner-pool census: who held the 40 Linux slots while land.yml jobs queued (#5848).
 * @section runner
 * @skill steward
 *
 *   node tools/ci/pool-share.mjs                       # last 7 days, one table
 *   node tools/ci/pool-share.mjs --days 3 --json       # the same, as data
 *   node tools/ci/pool-share.mjs --since 2026-11-12T00:00:00Z --until 2026-11-19T12:00:00Z
 *   node tools/ci/pool-share.mjs --cap 8               # the counterfactual cap for browser-group legs (default 8)
 *
 * WHY (#5848). GitHub-hosted runners have no priority: a queued job waits in one account pool (40 standard jobs on
 * GitHub Pro, https://docs.github.com/en/actions/reference/limits) behind every job queued before it. land.yml's
 * gate/train jobs are seconds of work that wait minutes. This reads every run of the window and its jobs, builds the
 * running/queued timeline per workflow class, and reports for each land.yml job its runner queue wait (started_at −
 * created_at) beside how many Linux runners each class held when it was queued.
 *
 * The counterfactual is deliberately narrow: a land job that waited > WAIT_S while browser-group legs held more than
 * `--cap` runners would have had (held − cap) more free slots under that cap; the line counts those waits. It is an
 * upper bound on the jobs helped, not a promise of the new wait: the slots freed go to whichever job queued first.
 *
 * Read-only: `gh api` GETs only, PAR at a time. Completed runs' jobs are cached under artifacts/pool-share/ (they
 * never change); a run still in flight is re-read every time.
 * Exit: 0 report printed, 2 bad args, 3 no token / API unreachable.
 */
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { REPO } from "./github-api.mjs";

export const WAIT_S = 60;
export const DEFAULT_CAP = 8;
const CACHE = path.join(process.cwd(), "artifacts", "pool-share");

/** Workflow class of a run (its path) and, inside ci.yml, of a job (its name). Pure. */
export function classOf(runPath, jobName) {
  const wf = path.basename(String(runPath || "")).replace(/\.ya?ml$/, "");
  if (wf === "ci") return /^Selected specs/.test(String(jobName || "")) ? "ci:selected" : "ci:other";
  if (wf === "land" || wf === "browser-group" || wf === "pages") return wf;
  return "other";
}

/** p-quantile of a numeric list (nearest rank), null when empty. Pure. */
export function quantile(xs, p) {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
}

/** Jobs reduced to {cls, os, created, started, completed} in ms; a job with no start is still queued (or never ran). */
export function normJobs(run, jobs, nowMs = Date.now()) {
  return (jobs || []).map((j) => {
    const labels = (j.labels || []).join(",");
    const os = /macos/i.test(labels) ? "macos" : /windows/i.test(labels) ? "windows" : "linux";
    const created = Date.parse(j.created_at || run.created_at);
    const started = j.started_at ? Date.parse(j.started_at) : null;
    // Only a job with a runner_name held a runner. A skipped job has none; nor has a job that waited PENDING in a
    // concurrency lane and was cancelled there (its started_at..completed_at is the wait, not runner time).
    const ran = started != null && !!j.runner_name;
    const completed = j.completed_at ? Date.parse(j.completed_at) : (started != null ? nowMs : null);
    return { cls: classOf(run.path, j.name), os, created, started: ran ? started : null, completed: ran ? completed : null,
      conclusion: j.conclusion || j.status, runConclusion: run.conclusion || run.status, event: run.event };
  }).filter((j) => Number.isFinite(j.created));
}

/** Linux runners held per class at instant t. Pure. */
export function heldAt(jobs, t) {
  const out = {};
  for (const j of jobs) {
    if (j.os !== "linux" || j.started == null || !(j.started <= t && t < j.completed)) continue;
    out[j.cls] = (out[j.cls] || 0) + 1;
  }
  return out;
}

/** The report from normalised jobs. Pure. */
export function report(jobs, { cap = DEFAULT_CAP, waitS = WAIT_S } = {}) {
  const linux = jobs.filter((j) => j.os === "linux" && j.started != null);
  const jobMin = {};
  for (const j of linux) jobMin[j.cls] = (jobMin[j.cls] || 0) + (j.completed - j.started) / 60000;
  // Peak runners held by browser-group, sampled at every start instant.
  // Sweep line: +1 at each start, −1 at each end (ends first on a tie).
  const ev = linux.flatMap((j) => [[j.started, 1, j.cls], [j.completed, -1, j.cls]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let bgPeak = 0, totalPeak = 0, bg = 0, total = 0;
  for (const [, d, cls] of ev) {
    total += d; if (cls === "browser-group") bg += d;
    bgPeak = Math.max(bgPeak, bg); totalPeak = Math.max(totalPeak, total);
  }
  const land = linux.filter((j) => j.cls === "land").map((j) => {
    const waitSec = (j.started - j.created) / 1000;
    const h = heldAt(linux, j.created + 1);
    return { waitSec, held: h, bg: h["browser-group"] || 0, total: Object.values(h).reduce((a, b) => a + b, 0) };
  });
  const bucket = (lo, hi) => {
    const xs = land.filter((r) => r.bg >= lo && r.bg <= hi).map((r) => r.waitSec);
    return { range: hi === Infinity ? `${lo}+` : `${lo}-${hi}`, n: xs.length, p50: quantile(xs, 0.5), p90: quantile(xs, 0.9) };
  };
  const slow = land.filter((r) => r.waitSec > waitS);
  const helped = slow.filter((r) => r.bg > cap);
  const landWaits = land.map((r) => r.waitSec);
  return {
    linuxJobMin: Object.fromEntries(Object.entries(jobMin).map(([k, v]) => [k, Math.round(v)])),
    peaks: { browserGroup: bgPeak, linuxTotal: totalPeak },
    land: { n: land.length, p50: quantile(landWaits, 0.5), p90: quantile(landWaits, 0.9), max: quantile(landWaits, 1),
      slow: slow.length, slowWaitMin: Math.round(slow.reduce((a, r) => a + r.waitSec, 0) / 60) },
    byBrowserGroupHeld: [bucket(0, 0), bucket(1, cap), bucket(cap + 1, 2 * cap), bucket(2 * cap + 1, Infinity)],
    counterfactual: { cap, waitS, slowWhileOverCap: helped.length,
      slowWaitMinWhileOverCap: Math.round(helped.reduce((a, r) => a + r.waitSec, 0) / 60),
      slotsFreedMedian: quantile(helped.map((r) => r.bg - cap), 0.5) },
  };
}

function args(argv) {
  const o = { days: 7, cap: DEFAULT_CAP, json: false, since: null, until: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.json = true;
    else if (a === "--days") o.days = Number(argv[++i]);
    else if (a === "--cap") o.cap = Number(argv[++i]);
    else if (a === "--since") o.since = argv[++i];
    else if (a === "--until") o.until = argv[++i];
    else return { error: `unknown arg ${a}` };
  }
  if (!(o.days > 0) || !(o.cap >= 0)) return { error: "--days and --cap take numbers" };
  return o;
}

const execFileP = promisify(execFile);
const PAR = 12;
async function get(pathQs) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const { stdout } = await execFileP("gh", ["api", `repos/${REPO}/${pathQs}`], { maxBuffer: 64 << 20 });
      return JSON.parse(stdout);
    } catch (e) { if (attempt === 3) throw new Error(`${pathQs}: ${String(e.stderr || e.message).trim().split("\n")[0]}`); }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
}
async function pool(items, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: PAR }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

async function listRuns(sinceIso, untilIso) {
  // The runs search caps at 1,000 results per query (the repo makes ~2,500 runs a day), so read it an hour at a time.
  const hours = [];
  for (let t = Date.parse(sinceIso); t < Date.parse(untilIso); t += 3600000) hours.push(t);
  const iso = (t) => new Date(t).toISOString().slice(0, 19) + "Z";
  const per = await pool(hours, async (t) => {
    const q = encodeURIComponent(`${iso(t)}..${iso(Math.min(t + 3600000, Date.parse(untilIso)) - 1000)}`);
    const rows = [];
    for (let page = 1; page <= 10; page++) {
      const j = await get(`actions/runs?per_page=100&page=${page}&created=${q}`);
      const got = (j.workflow_runs || []).map((r) => ({ id: r.id, path: r.path, status: r.status, conclusion: r.conclusion,
        event: r.event, created_at: r.created_at, run_attempt: r.run_attempt }));
      rows.push(...got);
      if (got.length < 100) break;
    }
    return rows;
  });
  return per.flat();
}

async function jobsOf(run) {
  const file = path.join(CACHE, `${run.id}-${run.run_attempt || 1}.json`);
  if (run.status === "completed" && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const jobs = [];
  for (let page = 1; page <= 10; page++) {
    const j = await get(`actions/runs/${run.id}/jobs?per_page=100&page=${page}&filter=latest`);
    const rows = (j.jobs || []).map((x) => ({ name: x.name, labels: x.labels, created_at: x.created_at,
      started_at: x.started_at, completed_at: x.completed_at, conclusion: x.conclusion, status: x.status, runner_name: x.runner_name }));
    jobs.push(...rows);
    if (rows.length < 100) break;
  }
  if (run.status === "completed") { fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(file, JSON.stringify(jobs)); }
  return jobs;
}

function fmt(r, o) {
  const s = (x) => (x == null ? "-" : `${Math.round(x)}s`);
  const lines = [];
  lines.push(`window ${o.since} .. ${o.until}`);
  lines.push(`linux job-min by class: ${Object.entries(r.linuxJobMin).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  lines.push(`peak linux runners held: total ${r.peaks.linuxTotal}, browser-group ${r.peaks.browserGroup}`);
  lines.push(`land.yml jobs: n ${r.land.n}, queue wait p50 ${s(r.land.p50)} p90 ${s(r.land.p90)} max ${s(r.land.max)}; > ${r.counterfactual.waitS}s: ${r.land.slow} jobs, ${r.land.slowWaitMin} min`);
  lines.push("land queue wait by browser-group runners held when the land job queued:");
  for (const b of r.byBrowserGroupHeld) lines.push(`  bg ${b.range.padEnd(6)} n ${String(b.n).padStart(5)}  p50 ${s(b.p50).padStart(6)}  p90 ${s(b.p90).padStart(6)}`);
  const c = r.counterfactual;
  lines.push(`= pool-share: ${c.slowWhileOverCap} of ${r.land.slow} land waits > ${c.waitS}s (${c.slowWaitMinWhileOverCap} of ${r.land.slowWaitMin} min) began while browser-group held > ${c.cap} runners (median ${c.slotsFreedMedian ?? 0} slots over the cap)`);
  return lines.join("\n");
}

async function main() {
  const o = args(process.argv.slice(2));
  if (o.error) { console.error(`pool-share: ${o.error}`); process.exit(2); }
  o.until = o.until || new Date().toISOString().slice(0, 19) + "Z";
  o.since = o.since || new Date(Date.parse(o.until) - o.days * 86400000).toISOString().slice(0, 19) + "Z";
  const jobs = [];
  try {
    const runs = await listRuns(o.since, o.until);
    console.error(`pool-share: ${runs.length} runs`);
    const all = await pool(runs, jobsOf);
    runs.forEach((run, k) => jobs.push(...normJobs(run, all[k])));
  } catch (e) { console.error(`pool-share: ${e.message}`); process.exit(3); }
  const r = report(jobs, { cap: o.cap });
  console.log(o.json ? JSON.stringify({ ...o, ...r }, null, 2) : fmt(r, o));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
