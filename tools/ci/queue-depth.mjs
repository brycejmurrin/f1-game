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
 *   node tools/ci/queue-depth.mjs --push "git push -u origin cursor/x"   # skip when the push starts no CI
 *
 * INFORMATIONAL since 2026-10-16 (CI/CD review #2333 finding 7): nothing refuses
 * a push on this line any more — the pool ran at 39 of 40 slots all day and a
 * held push only moves its wait. `hold` (exit 1) still reads when ANY of:
 *   Linux jobs in flight (queued + running) ≥ LINUX_HOLD (60; the account has 40 slots)
 *   queued jobs, any OS                     ≥ QUEUED_HOLD (10) — runner-queued only; a `pending`
 *                                             job waits in a CI concurrency lane and drives no hold
 *   macOS jobs in flight                    ≥ MACOS_SLOTS (5)
 *   the oldest queued Linux job's age       ≥ STARVED_AGE_MIN (10 min; #2266) while < LINUX_SLOTS/2 run
 * The line also prints the OBSERVED Linux running count and the oldest queued
 * age (#2266): on 2026-10-15 ~17:30Z only 7–12 Linux jobs ran while 25–36 sat
 * queued for up to 14 min, so the account had far fewer runners than the 40
 * the model assumes. A starved pool holds even under the count thresholds.
 * QUEUED RUNS FIRST (#2181, 2026-10-15). The list used to be in_progress first,
 * then queued, cut at MAX_RUNS: under load ≥ 30 runs are in progress, so no
 * queued run — where the queued jobs live — was ever read (the tool said 155
 * queued while a full scan found 545). Now runs with status queued, pending
 * and requested are listed (paged) before in_progress; the first MAX_RUNS are
 * read job by job, and up to MAX_COUNTED more QUEUED runs are counted by
 * their jobs `total_count` (one per_page=1 call each; the sampled job gives
 * the OS). A count that skipped live runs is a lower bound: the line and the
 * hold reasons say `≥`.
 *
 * PUSHES THAT START NO CI ARE NOT HELD (#2182). `--push "<command>"` reads the
 * destination branch of every `git push` in the command (pushTargets); when
 * every one is a branch with no open PR or a draft PR without the `run-ci`
 * label (ci.yml runs on push for the deploy branch only), it prints
 * `= queue skip — push starts no CI (…)` and exits 0 without measuring.
 * Anything it cannot resolve is measured as before. bash-guard.sh and
 * sync-pr.mjs --push call it this way.
 *
 * Exit: 0 ok, 1 hold, 2 bad args, 3 no token / API unreachable.
 *
 * REST (read 2026-10-14):
 *   https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2022-11-28#list-workflow-runs-for-a-repository
 *     (re-read 2026-10-15: `status` filter accepts queued | in_progress | requested | waiting | pending
 *     among others — "only GitHub Actions can set a status of waiting, pending, or requested";
 *     per_page max 100, default 30; `total_count` required)
 *   https://docs.github.com/en/rest/actions/workflow-jobs?apiVersion=2022-11-28#list-jobs-for-a-workflow-run
 *     (job `status` queued | in_progress | completed | waiting | requested | pending; `labels`;
 *     `filter` latest (default) | all; per_page max 100; `total_count` required)
 *   https://docs.github.com/en/rest/pulls/pulls#list-pull-requests (`head=user:ref-name`, `state`)
 *   https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
 */
import fs from "node:fs";
import { spawnSync } from "node:child_process";
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
/** Minutes the oldest queued Linux job may wait before the pool counts as starved (#2266):
 *  the median wait at 35–60 jobs in flight is 86 s; on 2026-10-15 starved jobs sat 14 min. */
export const STARVED_AGE_MIN = 10;
/** Queued jobs (any OS) at which a push only adds wait: the 35–60 band's median is 86 s. */
export const QUEUED_HOLD = 10;
/** Live runs examined per call (one jobs request each). */
export const MAX_RUNS = 30;
/** Further QUEUED runs counted by jobs total_count (one per_page=1 request each). */
export const MAX_COUNTED = 60;
/** Pages of 100 runs read per status. */
export const MAX_PAGES = 3;
/** Run statuses listed, waiting-for-a-runner first: that is where queued jobs live (#2181). */
export const RUN_STATUSES = ["queued", "pending", "requested", "waiting", "in_progress"];
const QUEUED_RUN = new Set(["queued", "pending", "requested", "waiting"]);
export const DEFAULT_OUT = "apex-status/queue-depth.json";

/** Job statuses that wait for a runner; `waiting` (an environment gate) holds no slot. */
const QUEUED = new Set(["queued", "requested"]);
/**
 * `pending` is a job waiting its turn in a concurrency group: ci.yml's
 * `queue: max` smoke and selected lanes hold ready PRs' legs FIFO. It holds no
 * runner and no push frees it, so it is counted apart (`laneWaiting`) and
 * drives no hold. Counting it as queued froze the gauge at hold for hours on
 * 2026-10-15 (30 "queued", oldest 101 min, while 7 of 40 runners worked).
 * docs.github.com/en/rest/actions/concurrency-groups lists a group's members as
 * `in_progress` / `pending`.
 */
const LANE_WAITING = "pending";

/** macOS when any runner label names it (macos-latest, macos-14, macos-15-xlarge …). */
export const isMac = (job) => (job?.labels || []).some((l) => /^macos/i.test(String(l)));

/**
 * Count live jobs by OS. Pure.
 * @param {Array<{status?:string, labels?:string[]}>} jobs
 */
export function countJobs(jobs) {
  const c = { linux: { running: 0, queued: 0, oldestQueuedAt: null }, macos: { running: 0, queued: 0, oldestQueuedAt: null }, laneWaiting: 0 };
  for (const j of jobs || []) {
    if (!j) continue;
    const os = isMac(j) ? c.macos : c.linux;
    if (j.status === "in_progress") os.running++;
    else if (j.status === LANE_WAITING) c.laneWaiting++;
    else if (QUEUED.has(j.status)) {
      os.queued++;
      const t = Date.parse(j.created_at);
      if (Number.isFinite(t) && (os.oldestQueuedAt === null || t < os.oldestQueuedAt)) os.oldestQueuedAt = t;
    }
  }
  return c;
}

/**
 * The verdict over counted jobs. Pure.
 * @param {ReturnType<typeof countJobs>} c
 * @param {{ runsExamined?: number, runsCounted?: number, runsLive?: number, now?: number }} [meta]
 */
export function evaluate(c, meta = {}) {
  const now = meta.now ?? Date.now();
  const age = (os) => os.oldestQueuedAt == null ? null : Math.max(0, Math.floor((now - os.oldestQueuedAt) / 60e3));
  const linuxAge = age(c.linux), macAge = age(c.macos);
  const linuxInFlight = c.linux.running + c.linux.queued;
  const macInFlight = c.macos.running + c.macos.queued;
  const queued = c.linux.queued + c.macos.queued;
  const runsExamined = meta.runsExamined ?? 0, runsCounted = meta.runsCounted ?? 0;
  const runsLive = meta.runsLive ?? runsExamined + runsCounted;
  const truncated = runsLive > runsExamined + runsCounted;
  // A truncated count is a lower bound: say so in the reason itself (#2181).
  const n = (x) => truncated ? `≥${x} (a lower bound)` : `${x}`;
  const reasons = [];
  if (linuxInFlight >= LINUX_HOLD) reasons.push(`Linux jobs in flight ${n(linuxInFlight)} ≥ ${LINUX_HOLD}`);
  if (queued >= QUEUED_HOLD) reasons.push(`queued jobs ${n(queued)} ≥ ${QUEUED_HOLD}`);
  if (macInFlight >= MACOS_SLOTS) reasons.push(`macOS jobs in flight ${n(macInFlight)} ≥ ${MACOS_SLOTS}`);
  // #2266: the 40-slot model assumes runners; a queue that does not move says
  // the pool is smaller than that, whatever the counts.
  // The age is from the job's created_at, which includes any time it waited
  // `pending` in a CI lane: a leg released after a long lane wait reads as old
  // for the seconds before a runner takes it. So age alone is not starvation;
  // it holds only while fewer than half the slots run (2026-10-15 23:27Z: hold
  // on one 115-min "queued" job with 36 running).
  if (linuxAge !== null && linuxAge >= STARVED_AGE_MIN && c.linux.running < LINUX_SLOTS / 2)
    reasons.push(`oldest queued Linux job ${linuxAge} min ≥ ${STARVED_AGE_MIN} (${c.linux.running} running: runners starved)`);
  return {
    verdict: reasons.length ? "hold" : "ok",
    hold: reasons.length > 0,
    reasons,
    linux: { ...c.linux, inFlight: linuxInFlight, slots: LINUX_SLOTS, oldestQueuedMin: linuxAge },
    macos: { ...c.macos, inFlight: macInFlight, slots: MACOS_SLOTS, oldestQueuedMin: macAge },
    queued,
    laneWaiting: c.laneWaiting ?? 0,
    runsExamined,
    runsCounted,
    runsLive,
    truncated,
  };
}

/** The one verdict line (`= queue ok|hold (...)`). */
export function reportLine(v) {
  const counted = v.runsCounted ? `, ${v.runsCounted} queued runs counted by job total` : "";
  const more = v.truncated || v.runsCounted
    ? `; ${v.runsExamined} of ${v.runsLive} live runs examined${counted}${v.truncated ? ", a lower bound" : ""}` : "";
  // #2266: the observed concurrency (running) and the oldest wait, beside the model's slots.
  const seen = `; ${v.linux.running} Linux running${v.linux.oldestQueuedMin == null ? "" : `, oldest queued ${v.linux.oldestQueuedMin}m`}`
    + (v.laneWaiting ? `, ${v.laneWaiting} waiting in CI lanes` : "");
  return `= queue ${v.verdict} (${v.linux.inFlight} Linux jobs in flight / ${v.linux.slots}, ${v.queued} queued, `
    + `${v.macos.inFlight} macOS / ${v.macos.slots}${seen}${more})${v.hold ? ` — ${v.reasons.join("; ")}: commit locally, do not push` : ""}`;
}

/**
 * Live runs (queued/pending/requested first, then in_progress; paged, deduped)
 * → the first `maxRuns` read job by job, up to `maxCounted` further QUEUED runs
 * counted by jobs total_count → verdict. Injectable `request` for tests.
 * @param {{ request?: typeof api, maxRuns?: number, maxCounted?: number, now?: () => number }} [opts]
 */
export function measure(opts = {}) {
  const request = opts.request || api;
  const maxRuns = opts.maxRuns ?? MAX_RUNS;
  const maxCounted = opts.maxCounted ?? MAX_COUNTED;
  const runs = new Map();
  for (const status of RUN_STATUSES) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const r = request(`actions/runs?status=${status}&per_page=100&page=${page}`);
      if (r.error) return { error: `runs (${status}): ${r.error}` };
      const list = r.json?.workflow_runs;
      if (!Array.isArray(list)) return { error: `runs (${status}) returned no run array` };
      for (const run of list) if (run && Number.isInteger(run.id) && !runs.has(run.id)) runs.set(run.id, { status, ...run });
      const total = Number.isInteger(r.json.total_count) ? r.json.total_count : list.length;
      if (list.length < 100 || page * 100 >= total) break;
    }
  }
  const ordered = [...runs.values()];
  const examined = ordered.slice(0, maxRuns);
  const jobs = [];
  for (const run of examined) {
    const j = request(`actions/runs/${run.id}/jobs?per_page=100`);
    if (j.error) return { error: `run #${run.id} jobs: ${j.error}` };
    if (!Array.isArray(j.json?.jobs)) return { error: `run #${run.id} jobs returned no job array` };
    jobs.push(...j.json.jobs);
  }
  // Past the cap: a QUEUED run's jobs are all waiting, so its jobs total is the
  // count (an upper bound if one started since); the sampled job names the OS.
  let counted = 0;
  for (const run of ordered.slice(maxRuns).filter((r) => QUEUED_RUN.has(r.status)).slice(0, maxCounted)) {
    const j = request(`actions/runs/${run.id}/jobs?per_page=1`);
    if (j.error) return { error: `run #${run.id} jobs: ${j.error}` };
    const n = Number.isInteger(j.json?.total_count) ? j.json.total_count : 0;
    const labels = j.json?.jobs?.[0]?.labels || [];
    const created_at = j.json?.jobs?.[0]?.created_at || run.created_at;
    for (let i = 0; i < n; i++) jobs.push({ status: "queued", labels, created_at });
    counted++;
  }
  const v = evaluate(countJobs(jobs), { runsExamined: examined.length, runsCounted: counted, runsLive: runs.size, now: (opts.now || Date.now)() });
  return { at: new Date((opts.now || Date.now)()).toISOString(), ...v, line: reportLine(v) };
}

// ── #2182: does this push start CI at all? ──────────────────────────────────
const DEPLOY = "claude/f1-game-project-26h3ng";
const OWNER = "brycejmurrin";
/** git push options that take a separate value. */
const PUSH_OPT_VALUE = new Set(["-o", "--push-option", "--repo", "--receive-pack", "--exec"]);
/** git push options that push something other than named branches. */
const PUSH_WIDE = /^--(tags|all|branches|mirror|prune|delete)$|^-d$/;

/**
 * The destination branch of every `git … push` in a command, or null when any
 * one cannot be named (a tag/--all push, a detached HEAD, no push). Pure.
 * @param {string} text the command (quotes are treated as word breaks)
 * @param {string} current the checked-out branch ("" when detached)
 */
export function pushTargets(text, current) {
  const out = [];
  const re = /(?:^|[;&|({`'"\n]\s*)(?:[A-Za-z_]\w*=\S*\s+)*(?:\S*\/)?git((?:\s+-\S+(?:\s+[^-\s;&|'"]\S*)?)*?)\s+push\b([^;&|)`'"\n]*)/g;
  let m, found = 0;
  while ((m = re.exec(String(text || "")))) {
    found++;
    const toks = m[2].trim().split(/\s+/).filter(Boolean);
    const pos = [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (PUSH_WIDE.test(t)) return null;
      if (PUSH_OPT_VALUE.has(t)) { i++; continue; }
      if (t.startsWith("-")) continue;
      pos.push(t);
    }
    const refs = pos.slice(1);
    if (!refs.length) { if (!current) return null; out.push(current); continue; }
    for (const ref of refs) {
      let dst = ref.replace(/^\+/, "");
      if (dst.includes(":")) dst = dst.slice(dst.indexOf(":") + 1);
      dst = dst.replace(/^refs\/heads\//, "");
      if (dst === "HEAD" || dst === "@") { if (!current) return null; dst = current; }
      if (!dst || dst.includes("*") || dst.startsWith("refs/")) return null;
      out.push(dst);
    }
  }
  return found ? out : null;
}

/**
 * Does a push to `branch` start a CI run? The deploy branch's push starts
 * pages.yml (the train, which calls ci.yml); ci.yml runs on pull_request
 * otherwise; a draft without `run-ci` gets one
 * 2-min `draft-ci-skipped` job. `ci` is null when the lookup failed.
 */
export function pushStartsCi(branch, request = api) {
  if (branch === DEPLOY) return { ci: true, why: `${branch}: the deploy branch` };
  const r = request(`pulls?head=${OWNER}:${encodeURIComponent(branch)}&state=open&per_page=10`);
  if (r.error || !Array.isArray(r.json)) return { ci: null, why: `${branch}: PR lookup failed (${r.error || "no array"})` };
  if (!r.json.length) return { ci: false, why: `${branch}: no open PR` };
  const live = r.json.find((p) => !p.draft || (p.labels || []).some((l) => l?.name === "run-ci"));
  if (live) return { ci: true, why: `${branch}: PR #${live.number}${live.draft ? " (draft, run-ci)" : ""}` };
  return { ci: false, why: `${branch}: PR #${r.json[0].number} is a draft without run-ci` };
}

/** Skip the gauge only when every target is known to start no CI. */
export function pushVerdict(text, current, request = api) {
  const targets = pushTargets(text, current);
  if (!targets || !targets.length) return { skip: false, why: "push target unknown" };
  const reads = targets.map((b) => pushStartsCi(b, request));
  if (reads.some((x) => x.ci !== false)) return { skip: false, why: reads.map((x) => x.why).join("; ") };
  const why = reads.map((x) => x.why).join("; ");
  return { skip: true, why, line: `= queue skip — push starts no CI (${why}): not held` };
}

function parseArgs(argv) {
  const out = { json: false, write: null, push: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--push") { if (argv[i + 1] === undefined) return { error: "--push needs the push command" }; out.push = argv[++i]; }
    else if (a === "--write") out.write = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : DEFAULT_OUT;
    else return { error: `unknown arg: ${a}` };
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  exitIfHelp(argv, `usage: node tools/ci/queue-depth.mjs [--json] [--write [path]] [--push "<git push command>"]

Counts queued + running Actions JOBS by OS against ${LINUX_SLOTS} Linux / ${MACOS_SLOTS} macOS slots.
Hold at ≥${LINUX_HOLD} Linux in flight, ≥${QUEUED_HOLD} queued, or ≥${MACOS_SLOTS} macOS. --write defaults to ${DEFAULT_OUT}.
--push: exit 0 with "= queue skip" when every pushed branch has no open PR or a draft without run-ci.
Exit 0 = ok, 1 = hold (commit locally, do not push), 2 = bad args, 3 = API/token.`);
  const args = parseArgs(argv);
  if (args.error) { console.error(`queue-depth: ${args.error}`); process.exit(2); }
  if (args.push !== null) {
    const cur = spawnSync("git", ["branch", "--show-current"], { cwd: ROOT, encoding: "utf8" }).stdout?.trim() || "";
    const p = pushVerdict(args.push, cur);
    if (p.skip) { console.log(p.line); process.exit(0); }
  }
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
