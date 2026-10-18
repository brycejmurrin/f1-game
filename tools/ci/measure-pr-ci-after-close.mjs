#!/usr/bin/env node
/**
 * @doc 24 h scan: PR ci.yml job-minutes starting after close + peak-hour PR wall median (#2213, epic #1949).
 * @skill steward
 *
 *   node tools/ci/measure-pr-ci-after-close.mjs --hours 24
 *   node tools/ci/measure-pr-ci-after-close.mjs --hours 24 --json
 *
 * GET-only GitHub API via ready-full-cap.mjs `api()`.
 */
import { api, CI_PATH, DEPLOY, REPO } from "./ready-full-cap.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";

const MS_MIN = 60_000;

/** @param {string|Date} a @param {string|Date} b */
export function minutesBetween(a, b) {
  return (new Date(b).getTime() - new Date(a).getTime()) / MS_MIN;
}

/** @param {number[]} xs */
export function median(xs) {
  const a = xs.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/**
 * @param {Array<{id:number, event?:string, path?:string, created_at?:string, updated_at?:string, pull_requests?:Array<{number?:number}>, head_branch?:string}>} runs
 * @param {Map<number, {closed_at?:string|null, merged_at?:string|null, base?:{ref?:string}}>} prByNum
 * @param {Map<number, Array<{started_at?:string, completed_at?:string, status?:string}>>} jobsByRun
 */
export function analyzePrCi({ runs, prByNum, jobsByRun, deployBase = DEPLOY }) {
  let totalJobMin = 0;
  let postCloseJobMin = 0;
  let postCloseJobs = 0;
  let totalJobs = 0;
  const wallByHour = new Map();

  for (const run of runs || []) {
    if (run.path !== CI_PATH || run.event !== "pull_request") continue;
    const prNum = run.pull_requests?.[0]?.number;
    const pr = prNum != null ? prByNum.get(prNum) : null;
    if (!pr || pr.base?.ref !== deployBase) continue;
    const closeAt = pr.closed_at || pr.merged_at;
    if (run.status === "completed" && run.conclusion && !["cancelled", "skipped", "stale"].includes(run.conclusion)) {
      const wallMin = minutesBetween(run.created_at, run.updated_at);
      if (wallMin >= 3 && Number.isFinite(wallMin)) {
        const hour = new Date(run.created_at).getUTCHours();
        const arr = wallByHour.get(hour) || [];
        arr.push(wallMin);
        wallByHour.set(hour, arr);
      }
    }
    const jobs = jobsByRun.get(run.id) || [];
    for (const j of jobs) {
      if (j.status !== "completed" || !j.started_at || !j.completed_at) continue;
      const dur = minutesBetween(j.started_at, j.completed_at);
      if (dur <= 0) continue;
      totalJobs++;
      totalJobMin += dur;
      if (closeAt && new Date(j.started_at) > new Date(closeAt)) {
        postCloseJobs++;
        postCloseJobMin += dur;
      }
    }
  }

  let peakHour = null;
  let peakCount = 0;
  for (const [h, walls] of wallByHour) {
    if (walls.length > peakCount) { peakCount = walls.length; peakHour = h; }
  }
  const peakMedian = peakHour == null ? null : median(wallByHour.get(peakHour) || []);
  const postClosePct = totalJobMin > 0 ? (100 * postCloseJobMin) / totalJobMin : 0;
  return {
    totalJobMin,
    postCloseJobMin,
    postClosePct,
    postCloseJobs,
    totalJobs,
    peakHourUtc: peakHour,
    peakRunCount: peakCount,
    peakHourMedianWallMin: peakMedian,
    epicPeakWallTargetMin: 20,
    epicPeakWallMet: peakMedian != null && peakMedian <= 20,
    postCloseTargetPct: 1,
    postCloseTargetMet: postClosePct < 1,
  };
}

async function fetchRunsSince(sinceIso, request = api) {
  const runs = [];
  for (let page = 1; page <= 20; page++) {
    const q = `actions/runs?per_page=100&page=${page}&created=${encodeURIComponent(">=" + sinceIso)}`;
    const r = request(q);
    if (r.error) return { error: r.error, runs };
    const batch = r.json?.workflow_runs || [];
    runs.push(...batch);
    if (batch.length < 100) break;
  }
  return { runs };
}

async function fetchPr(request, num) {
  const r = request(`pulls/${num}`);
  if (r.error || !r.json) return null;
  return r.json;
}

async function fetchJobs(request, runId) {
  const jobs = [];
  for (let page = 1; page <= 10; page++) {
    const r = request(`actions/runs/${runId}/jobs?per_page=100&page=${page}`);
    if (r.error) return { error: r.error, jobs };
    const batch = r.json?.jobs || [];
    jobs.push(...batch);
    if (batch.length < 100) break;
  }
  return { jobs };
}

export async function measurePrCiAfterClose({ hours = 24, request = api, maxRuns = 80 } = {}) {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const { runs, error } = await fetchRunsSince(since, request);
  if (error) return { error, since, hours };
  const prRuns = runs.filter((r) => r.path === CI_PATH && r.event === "pull_request").slice(0, maxRuns);
  const prByNum = new Map();
  const jobsByRun = new Map();
  for (const run of prRuns) {
    const n = run.pull_requests?.[0]?.number;
    if (n != null && !prByNum.has(n)) {
      const pr = await fetchPr(request, n);
      if (pr) prByNum.set(n, pr);
    }
    const { jobs, error: je } = await fetchJobs(request, run.id);
    if (je) return { error: je, since, hours };
    jobsByRun.set(run.id, jobs);
  }
  const summary = analyzePrCi({ runs: prRuns, prByNum, jobsByRun });
  return { since, hours, runsSampled: prRuns.length, prsLoaded: prByNum.size, ...summary };
}

function reportLine(v) {
  if (v.error) return `= measure-pr-ci error ${v.error}`;
  return `= measure-pr-ci post_close_pct=${v.postClosePct.toFixed(2)} peak_hour_utc=${v.peakHourUtc} peak_median_wall_min=${v.peakHourMedianWallMin?.toFixed(1) ?? "?"} epic_peak_met=${v.epicPeakWallMet} post_close_met=${v.postCloseTargetMet}`;
}

import { pathToFileURL } from "node:url";

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const argv = process.argv.slice(2);
  exitIfHelp(argv, `usage: node tools/ci/measure-pr-ci-after-close.mjs [--hours N] [--json] [--max-runs N]`);
  const hours = Number(argv.find((a, i) => argv[i - 1] === "--hours") || 24);
  const maxRuns = Number(argv.find((a, i) => argv[i - 1] === "--max-runs") || 80);
  const json = argv.includes("--json");
  measurePrCiAfterClose({ hours, maxRuns }).then((v) => {
    if (json) console.log(JSON.stringify(v, null, 2));
    else console.log(reportLine(v));
    process.exit(v.error ? 3 : 0);
  });
}
