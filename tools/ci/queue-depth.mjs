#!/usr/bin/env node
/**
 * @doc Actions queue gauge: queued + running JOBS by OS vs the 40 Linux / 5 macOS slots; `= queue ok|hold`.
 * @section runner
 * @skill steward
 *
 * AGENTS.md rule 4's push hold. The old rule counted queued RUNS (">15"), but a
 * run's own queue wait is 0 for 95 % of runs — the backlog lives at JOB level.
 * Measured over 2,881 Linux jobs (docs/notes/ACTIONS-AUDIT-2026-10-14.md
 * finding 6): median job queue wait 2 s under 20 jobs in flight, 25 s at 20–35,
 * 86 s at 35–60, 264 s over 60. The account runs 40 standard and 5 macOS jobs
 * at once (GitHub Pro), so this counts jobs, by OS, against those slots.
 *
 *   node tools/ci/queue-depth.mjs            # one `= queue ok|hold (...)` line
 *   node tools/ci/queue-depth.mjs --json     # the same, as data
 *   node tools/ci/queue-depth.mjs --write    # also write apex-status/queue-depth.json (gitignored)
 *   node tools/ci/queue-depth.mjs --write /workspace/apex-status/queue-depth.json
 *
 * HOLD (commit locally, do not push or launch) when ANY of:
 *   Linux jobs in flight (queued + running) ≥ LINUX_HOLD (60; the account has 40 slots)
 *   queued jobs, any OS                     ≥ QUEUED_HOLD (10)
 *   macOS jobs in flight                    ≥ MACOS_SLOTS (5)
 * Only the first MAX_RUNS (30) live runs are examined (≤ 32 API calls); a
 * truncated count is a lower bound and the line says so.
 *
 * Exit: 0 ok, 1 hold, 2 bad args, 3 no token / API unreachable.
 *
 * REST (read 2026-10-14):
 *   https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository
 *     (`status` filter: queued | in_progress; per_page max 100)
 *   https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run
 *     (job `status` queued | in_progress | completed | waiting | requested | pending; `labels`)
 *   https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api } from "./ready-full-cap.mjs";   // githubToken + curl -K - (token on stdin) + 64 MB maxBuffer
import { exitIfHelp } from "../lib/cli-args.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
/** Concurrent standard (Linux) job slots on the account. */
export const LINUX_SLOTS = 40;
/** Linux jobs in flight at which a push only adds wait: full slots with an empty queue is normal use; median queue wait is 86 s up to here, 264 s above (ACTIONS-AUDIT-2026-10-14 finding 6). */
export const LINUX_HOLD = 60;
/** Concurrent macOS job slots on the account. */
export const MACOS_SLOTS = 5;
/** Queued jobs (any OS) at which a push only adds wait: the 35–60 band's median is 86 s. */
export const QUEUED_HOLD = 10;
/** Live runs examined per call (one jobs request each). */
export const MAX_RUNS = 30;
export const DEFAULT_OUT = "apex-status/queue-depth.json";

/** Job statuses that wait for a runner; `waiting` (an environment gate) holds no slot. */
const QUEUED = new Set(["queued", "requested", "pending"]);

/** macOS when any runner label names it (macos-latest, macos-14, macos-15-xlarge …). */
export const isMac = (job) => (job?.labels || []).some((l) => /^macos/i.test(String(l)));

/**
 * Count live jobs by OS. Pure.
 * @param {Array<{status?:string, labels?:string[]}>} jobs
 */
export function countJobs(jobs) {
  const c = { linux: { running: 0, queued: 0 }, macos: { running: 0, queued: 0 } };
  for (const j of jobs || []) {
    if (!j) continue;
    const os = isMac(j) ? c.macos : c.linux;
    if (j.status === "in_progress") os.running++;
    else if (QUEUED.has(j.status)) os.queued++;
  }
  return c;
}

/**
 * The verdict over counted jobs. Pure.
 * @param {ReturnType<typeof countJobs>} c
 * @param {{ runsExamined?: number, runsLive?: number }} [meta]
 */
export function evaluate(c, meta = {}) {
  const linuxInFlight = c.linux.running + c.linux.queued;
  const macInFlight = c.macos.running + c.macos.queued;
  const queued = c.linux.queued + c.macos.queued;
  const reasons = [];
  if (linuxInFlight >= LINUX_HOLD) reasons.push(`Linux jobs in flight ${linuxInFlight} ≥ ${LINUX_HOLD}`);
  if (queued >= QUEUED_HOLD) reasons.push(`queued jobs ${queued} ≥ ${QUEUED_HOLD}`);
  if (macInFlight >= MACOS_SLOTS) reasons.push(`macOS jobs in flight ${macInFlight} ≥ ${MACOS_SLOTS}`);
  const runsExamined = meta.runsExamined ?? 0, runsLive = meta.runsLive ?? runsExamined;
  return {
    verdict: reasons.length ? "hold" : "ok",
    hold: reasons.length > 0,
    reasons,
    linux: { ...c.linux, inFlight: linuxInFlight, slots: LINUX_SLOTS },
    macos: { ...c.macos, inFlight: macInFlight, slots: MACOS_SLOTS },
    queued,
    runsExamined,
    runsLive,
    truncated: runsLive > runsExamined,
  };
}

/** The one verdict line (`= queue ok|hold (...)`). */
export function reportLine(v) {
  const more = v.truncated ? `; ${v.runsExamined} of ${v.runsLive} live runs examined, a lower bound` : "";
  return `= queue ${v.verdict} (${v.linux.inFlight} Linux jobs in flight / ${v.linux.slots}, ${v.queued} queued, `
    + `${v.macos.inFlight} macOS / ${v.macos.slots}${more})${v.hold ? ` — ${v.reasons.join("; ")}: commit locally, do not push` : ""}`;
}

/**
 * Live runs (in_progress first, then queued; newest first, deduped) → their
 * jobs → verdict. Injectable `request` for tests.
 * @param {{ request?: typeof api, maxRuns?: number, now?: () => number }} [opts]
 */
export function measure(opts = {}) {
  const request = opts.request || api;
  const maxRuns = opts.maxRuns ?? MAX_RUNS;
  const runs = new Map();
  let live = 0;
  for (const status of ["in_progress", "queued"]) {
    const r = request(`actions/runs?status=${status}&per_page=100`);
    if (r.error) return { error: `runs (${status}): ${r.error}` };
    const list = r.json?.workflow_runs;
    if (!Array.isArray(list)) return { error: `runs (${status}) returned no run array` };
    // total_count is the live count even past the first page.
    live += Number.isInteger(r.json.total_count) ? r.json.total_count : list.length;
    for (const run of list) if (run && Number.isInteger(run.id) && !runs.has(run.id)) runs.set(run.id, run);
  }
  const examined = [...runs.values()].slice(0, maxRuns);
  const jobs = [];
  for (const run of examined) {
    const j = request(`actions/runs/${run.id}/jobs?per_page=100`);
    if (j.error) return { error: `run #${run.id} jobs: ${j.error}` };
    if (!Array.isArray(j.json?.jobs)) return { error: `run #${run.id} jobs returned no job array` };
    jobs.push(...j.json.jobs);
  }
  const v = evaluate(countJobs(jobs), { runsExamined: examined.length, runsLive: Math.max(live, runs.size) });
  return { at: new Date((opts.now || Date.now)()).toISOString(), ...v, line: reportLine(v) };
}

function parseArgs(argv) {
  const out = { json: false, write: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--write") out.write = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : DEFAULT_OUT;
    else return { error: `unknown arg: ${a}` };
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  exitIfHelp(argv, `usage: node tools/ci/queue-depth.mjs [--json] [--write [path]]

Counts queued + running Actions JOBS by OS against ${LINUX_SLOTS} Linux / ${MACOS_SLOTS} macOS slots.
Hold at ≥${LINUX_HOLD} Linux in flight, ≥${QUEUED_HOLD} queued, or ≥${MACOS_SLOTS} macOS. --write defaults to ${DEFAULT_OUT}.
Exit 0 = ok, 1 = hold (commit locally, do not push), 2 = bad args, 3 = API/token.`);
  const args = parseArgs(argv);
  if (args.error) { console.error(`queue-depth: ${args.error}`); process.exit(2); }
  const v = measure();
  if (v.error) { console.log(`= queue unknown — API: ${v.error}`); process.exit(3); }
  if (args.write) {
    const file = path.resolve(ROOT, args.write);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(v, null, 2) + "\n");
  }
  console.log(args.json ? JSON.stringify(v, null, 2) : v.line);
  process.exit(v.hold ? 1 : 0);
}
