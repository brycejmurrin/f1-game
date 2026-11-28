#!/usr/bin/env node
/**
 * @doc Nightly CI process dashboard: per-job p50/p90, cancel and re-gate rates, push-to-live.
 * @section runner
 * @skill check-changes
 *
 * The reducer is pure. The CLI fetches completed ci.yml and pages.yml runs
 * (Actions REST) and writes process-dashboard.json plus a markdown twin.
 * .github/workflows/process-dashboard.yml publishes those files on the
 * `metrics` branch — never the deploy branch — and runs --check there only.
 * A time ratchet reads this file; it never re-runs the jobs it measures.
 *
 *   node tools/ci/process-dashboard.mjs --runs 60 --out process-dashboard.json --md note.md
 *   node tools/ci/process-dashboard.mjs --fixture tests/unit/fixtures/process-dashboard/runs.json --json
 *   node tools/ci/process-dashboard.mjs --check process-dashboard.json
 *
 * Merge path (#7046, #6913 phase 1; #7517 phase 0): land→merge by route, merges/h, red-tip minutes, land.yml runs
 * and `Land retry` dispatches per merge, train red rate, and the land chain per hour. --no-merge-path skips the read.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { githubToken, NO_TOKEN_HINT } from "./github-token.mjs";
import { proxyFetch } from "../lib/proxy-fetch.mjs";
import { tipState } from "./lib/deploy-tip.mjs";
import { TRAIN_PREFIX, trainManifest, trainResult } from "./merge-train.mjs";

export const REPO = "brycejmurrin/f1-game";
export const DEPLOY_BRANCH = "claude/f1-game-project-26h3ng";
export const METRICS_BRANCH = "metrics";
const API = `https://api.github.com/repos/${REPO}`;

/** Jobs page size. `jobs?per_page=100` 502s on large runs (flake-tally #2233;
 *  process-dashboard run 39724286675 / 39578940130). Page at 30 like flake-tally. */
export const JOBS_PAGE = 30;
export const MAX_JOB_PAGES = 12;
/** GitHub REST hiccups that deserve a bounded retry (not 404 / 401). */
const TRANSIENT_HTTP = new Set([429, 502, 503, 504]);

let _fetch = proxyFetch;
let _delay = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

/** @param {{ fetch?: typeof fetch, delay?: (ms: number) => Promise<void> }} [hooks] */
export function setProcessDashboardTestHooks(hooks = {}) {
  _fetch = hooks.fetch || proxyFetch;
  _delay = hooks.delay || ((ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve()));
}

/** Families whose presence (a job that actually ran) marks a full-tier ci.yml run. */
export const FULL_FAMILIES = [
  "Smoke (page boots, __apex responds)",
  "Per-circuit geometry sweeps",
  "Selected specs (change-aware gate)",
];

/** A fast-tier run ran one of these and none of FULL_FAMILIES. A draft that only
 *  printed the skip notice is neither tier — counting it made fast-tier p50 ~7s. */
export const FAST_FAMILIES = [
  "Structural guards",
  "Pure-node unit suites",
  "Driving model (characterization traces)",
  "Parts option-resolution census",
  "Select specs for this change",
];

/**
 * Ceilings for the nightly job only (--check). Set from the 2026-10-17
 * 60-run window of 2026-10-17 plus slack (max(60s, 40%)). Drafts skip
 * node-suites, so a 60-run sample holds ~13 of them: n_min is 10, not 20,
 * or this check would never arm. Replace the numbers from a later window.
 * Do not import this into test:guards.
 */
export const TIME_RATCHETS = [
  // 2026-10-17 60-run p50s: node 516, smoke 167, selected 487, fast wall 507, live 754.
  { id: "ci:Pure-node unit suites", family: "Pure-node unit suites", metric: "p50", ceilingSec: 730, n_min: 10 },
  { id: "ci:Smoke", family: "Smoke (page boots, __apex responds)", metric: "p50", ceilingSec: 240, n_min: 10 },
  { id: "ci:selected", family: "Selected specs (change-aware gate)", metric: "p50", ceilingSec: 690, n_min: 10 },
  { id: "ci:fast-tier", field: "fast", ceilingSec: 720, n_min: 10 },
  { id: "ci:push-to-live", field: "live", ceilingSec: 1060, n_min: 10 },
];

/** 2026-09-16 §0, the column this note adds a successor to. */
export const BASELINE_2026_09_16 = {
  source: "docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0",
  nodeSuites: "11.3 min median (40/40 runs, one serial job)",
  smoke: "slowest shard median 7.4 min, p90 14.5 min",
  fullTier: "median 14.3 min, p90 19.3 (23 runs)",
  pushToLive: "median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min",
  regate: "12 of 60 runs (20%)",
  cancelled: "9 of 59 (15%)",
};

const MATRIX_CELL = /^(?:vm-[a-z0-9-]+|page-[a-z0-9-]+|slow|fast|driving-model|\d+|\d+of\d+|tooling [AB]|selected(?:,.*)?|oversize.*)$/i;

function isMatrixCell(inner) {
  if (MATRIX_CELL.test(inner)) return true;
  // Selected shards carry the spec list inside the parentheses, so the cell is
  // the whole remainder ("selected-1, tests/specs/…"), not a short token.
  return /^(?:selected|oversize|overbudget|packed)-/i.test(inner);
}

/** Known job names whose matrix cell is everything after this prefix. GitHub truncates long selected-shard names, so the closing parenthesis is not always there. */
const FAMILY_PREFIXES = [
  "Selected specs (change-aware gate) (",
  "Smoke (page boots, __apex responds) (",
  "Per-circuit geometry sweeps (",
  "Pure-node unit suites (",
  "Structural guards (",
];

/** Drop one trailing matrix cell. "Smoke (…, …) (1)" → the smoke name; "Selected specs (verdict)" stays. */
export function familyOf(name) {
  let s = String(name || "");
  for (const prefix of FAMILY_PREFIXES) {
    if (s.startsWith(prefix)) return prefix.slice(0, -2);
  }
  for (let i = 0; i < 2; i++) {
    const m = /^(.*) \(([^)]+)\)$/.exec(s);
    if (!m || !isMatrixCell(m[2])) break;
    s = m[1];
  }
  return s;
}

export function isFullJob(name) {
  const fam = familyOf(name);
  // The unsuffixed name is the rollup (geometry sweeps, ~3s) or an unexpanded
  // matrix job. The work is the cell: "Smoke (…) (1)", "… sweeps (1of4)".
  return FULL_FAMILIES.includes(fam) && name !== fam;
}

/** Nearest-rank percentile. `sorted` ascending. p=0.5 → ceil(0.5 n)−1. */
export function percentile(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.max(0, Math.ceil(p * sorted.length) - 1);
  return sorted[Math.min(i, sorted.length - 1)];
}

function secs(start, end) {
  const a = Date.parse(start), b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 1000);
}

function oneDecimal(n) {
  return Math.round(n * 10) / 10;
}

function ran(job) {
  return (job.conclusion === "success" || job.conclusion === "failure") && secs(job.started_at, job.completed_at) != null;
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50_s: percentile(sorted, 0.5),
    p90_s: percentile(sorted, 0.9),
    max_s: sorted.length ? sorted[sorted.length - 1] : null,
  };
}

function reduceFlakes(events) {
  const m = new Map();
  for (const e of events || []) {
    const k = e.test;
    if (!k) continue;
    const row = m.get(k) || { attempts: 0, red: 0 };
    row.attempts += e.attempts == null ? 1 : Number(e.attempts);
    row.red += e.red === true ? 1 : (Number(e.red) || 0);
    m.set(k, row);
  }
  return Object.fromEntries([...m.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

function wallSec(run) {
  return secs(run.run_started_at, run.updated_at);
}

/**
 * @param {{ ciRuns?: object[], pagesRuns?: object[], flakeEvents?: object[], generated?: string }} input
 * ci runs are any branch (the 2026-09-16 audit's sample). pages runs are the deploy branch.
 */
export function reduceDashboard(input) {
  const ciRuns = input.ciRuns || [];
  const pagesRuns = input.pagesRuns || [];
  const byJob = new Map();
  const cellBags = new Map();
  const bareBags = new Map();

  for (const run of ciRuns) {
    const seenCells = new Map();
    const seenBare = new Map();
    for (const job of run.jobs || []) {
      const name = job.name || "(unnamed)";
      const row = byJob.get(name) || { samples: [], steps: new Map(), fail: 0, cancelled: 0 };
      if (job.conclusion === "failure") row.fail++;
      if (job.conclusion === "cancelled") row.cancelled++;
      if (ran(job)) {
        const dur = secs(job.started_at, job.completed_at);
        row.samples.push(dur);
        for (const step of job.steps || []) {
          const sd = secs(step.started_at, step.completed_at);
          if (sd == null || !step.name) continue;
          const bag = row.steps.get(step.name) || [];
          bag.push(sd);
          row.steps.set(step.name, bag);
        }
        const fam = familyOf(name);
        const dest = name === fam ? seenBare : seenCells;
        const prev = dest.get(fam);
        if (prev == null || dur > prev) dest.set(fam, dur);
      }
      byJob.set(name, row);
    }
    // A matrix family's sample is its slowest cell. Bare rollups of a family
    // that also has cells ("Per-circuit geometry sweeps", ~3s) are dropped
    // after the loop, including runs where the cells were skipped.
    for (const [fam, dur] of seenCells) {
      const bag = cellBags.get(fam) || [];
      bag.push(dur);
      cellBags.set(fam, bag);
    }
    for (const [fam, dur] of seenBare) {
      if (seenCells.has(fam)) continue;
      const bag = bareBags.get(fam) || [];
      bag.push(dur);
      bareBags.set(fam, bag);
    }
  }

  const jobs = {};
  for (const name of [...byJob.keys()].sort()) {
    const row = byJob.get(name);
    const st = stats(row.samples);
    const steps = {};
    for (const stepName of [...row.steps.keys()].sort()) {
      steps[stepName] = percentile([...row.steps.get(stepName)].sort((a, b) => a - b), 0.5);
    }
    jobs[name] = { ...st, fail: row.fail, cancelled: row.cancelled, steps };
  }

  const families = {};
  const familyNames = new Set([...cellBags.keys(), ...bareBags.keys()]);
  for (const name of [...familyNames].sort()) {
    const samples = cellBags.has(name) ? cellBags.get(name) : bareBags.get(name);
    families[name] = stats(samples);
  }

  const cancelled = ciRuns.filter((r) => r.conclusion === "cancelled").length;
  const shaCount = new Map();
  const ordered = [...ciRuns].sort((a, b) => String(a.run_started_at).localeCompare(String(b.run_started_at)) || (a.id - b.id));
  let regatedRuns = 0;
  for (const run of ordered) {
    const sha = run.head_sha || "";
    const n = shaCount.get(sha) || 0;
    if (n > 0) regatedRuns++;
    shaCount.set(sha, n + 1);
  }
  const regatedShas = [...shaCount.values()].filter((n) => n > 1).length;

  const finished = ciRuns.filter((r) => r.conclusion === "success" || r.conclusion === "failure");
  const fullWalls = [];
  const fastWalls = [];
  for (const run of finished) {
    const wall = wallSec(run);
    if (wall == null) continue;
    const full = (run.jobs || []).some((j) => ran(j) && isFullJob(j.name));
    const fast = !full && (run.jobs || []).some((j) => ran(j) && FAST_FAMILIES.includes(familyOf(j.name)));
    if (full) fullWalls.push(wall);
    else if (fast) fastWalls.push(wall);
  }
  const full = stats(fullWalls);
  const fast = stats(fastWalls);

  const liveWalls = [];
  let superseded = 0;
  let pageFail = 0;
  let pageOk = 0;
  const pagesOrdered = [...pagesRuns].sort((a, b) => String(a.run_started_at).localeCompare(String(b.run_started_at)) || (a.id - b.id));
  const recoveries = [];
  let openFailAt = null;
  for (const run of pagesOrdered) {
    if (run.conclusion === "cancelled") superseded++;
    if (run.conclusion === "failure") {
      pageFail++;
      openFailAt = Date.parse(run.updated_at);
    }
    if (run.conclusion === "success") {
      pageOk++;
      const wall = wallSec(run);
      if (wall != null) liveWalls.push(wall);
      if (openFailAt != null && Number.isFinite(Date.parse(run.updated_at))) {
        recoveries.push(Math.round((Date.parse(run.updated_at) - openFailAt) / 1000));
        openFailAt = null;
      }
    }
  }
  const live = stats(liveWalls);
  const mttr = stats(recoveries.filter((s) => s >= 0));

  const stamps = [];
  for (const run of [...ciRuns, ...pagesRuns]) {
    if (run.run_started_at) stamps.push(Date.parse(run.run_started_at));
    if (run.updated_at) stamps.push(Date.parse(run.updated_at));
  }
  const fromMs = stamps.length ? Math.min(...stamps) : null;
  const toMs = stamps.length ? Math.max(...stamps) : null;
  const spanDays = fromMs != null && toMs != null ? Math.max((toMs - fromMs) / 86400000, 1 / 24) : null;
  const attempts = pageOk + pageFail;

  const generated = input.generated || new Date().toISOString().slice(0, 16) + "Z";
  return {
    generated,
    window: {
      runs: ciRuns.length,
      from: fromMs != null ? new Date(fromMs).toISOString().slice(0, 16) + "Z" : null,
      to: toMs != null ? new Date(toMs).toISOString().slice(0, 16) + "Z" : null,
    },
    jobs,
    families,
    runs: {
      n: ciRuns.length,
      cancelled_pct: ciRuns.length ? oneDecimal(100 * cancelled / ciRuns.length) : null,
      regated_shas: regatedShas,
      regated_runs: regatedRuns,
      fast_tier_n: fast.n,
      fast_tier_p50_s: fast.p50_s,
      fast_tier_p90_s: fast.p90_s,
      full_tier_n: full.n,
      full_tier_p50_s: full.p50_s,
      full_tier_p90_s: full.p90_s,
    },
    deploy: {
      n: live.n,
      push_to_live_p50_s: live.p50_s,
      p90_s: live.p90_s,
      superseded,
    },
    flake: reduceFlakes(input.flakeEvents),
    dora: {
      deploy_freq_per_day: spanDays ? oneDecimal(pageOk / spanDays) : null,
      lead_time_p50_s: live.p50_s,
      change_fail_pct: attempts ? oneDecimal(100 * pageFail / attempts) : null,
      mttr_p50_s: mttr.p50_s,
    },
    ...(input.mergePath ? { merge_path: input.mergePath.error ? { error: input.mergePath.error } : reduceMergePath(input.mergePath) } : {}),
    notes: ["cancelled runs may hide a real failure — a killed job runs no always() step"],
  };
}

// ---- merge path (#7046, #6913 phase 1; #7517 phase 0) ----------------------------------------------------
//
// Input (slim, see fetchMergePath): `window {from,to}`; `prs` closed into the deploy branch, each
// `{number, head_ref, created_at, merged_at, closed_at, land_at, cars?, outcome?}` (land_at = the LAST
// `labeled: land` event; cars/outcome only on train PRs, from merge-train's manifest and result marks);
// `landRuns` land.yml runs `{id, created_at, updated_at, conclusion, title, event, jobs?}`; `pagesRuns` pages.yml
// runs on the deploy branch (failed ones carry `jobs`), starting before the window so the opening state is known.

/** The land.yml job whose presence marks a run that evaluated a PR (`land-gate (#N)`). */
export const GATE_JOB = /^land-gate\b/;
/** A `Land retry` dispatch, by land.yml's run-name. */
export const RETRY_TITLE = /^Land retry\b/;
/** pages.yml conclusions that say nothing about the tip (deploy-tip.mjs SILENT_RUN): the state carries over. */
const PAGES_SILENT = new Set(["cancelled", "skipped", "neutral", "stale"]);

const ms = (t) => { const v = Date.parse(t || ""); return Number.isFinite(v) ? v : null; };
const minutes = (a, b) => (a != null && b != null && b >= a ? Math.round((b - a) / 6000) / 10 : null);
const hourKey = (t) => new Date(t).toISOString().slice(0, 13) + "Z";
const isTrainRef = (ref) => String(ref || "").startsWith(TRAIN_PREFIX);

function minStats(samples) {
  const s = stats(samples.filter((x) => x != null));
  return { n: s.n, p50_min: s.p50_s, p90_min: s.p90_s, max_min: s.max_s };
}

/** Red-tip intervals inside [from, to]: the newest non-silent pages.yml run is code-red (deploy-tip's tipState, the
 *  `base` row's own exclusions: a Pages-side publish failure and cancelled runs are not code red). Pure. */
export function redTipIntervals(pagesRuns, fromMs, toMs) {
  const ordered = [...(pagesRuns || [])].filter((r) => ms(r.updated_at) != null)
    .sort((a, b) => ms(a.updated_at) - ms(b.updated_at) || (a.id - b.id));
  const out = [];
  let open = null;
  const close = (at) => {
    const a = Math.max(open.at, fromMs), b = Math.min(at, toMs);
    if (b > a) out.push({ from: new Date(a).toISOString().slice(0, 16) + "Z", to: new Date(b).toISOString().slice(0, 16) + "Z", min: minutes(a, b), sha: open.sha, run: open.run });
    open = null;
  };
  for (const run of ordered) {
    if (PAGES_SILENT.has(run.conclusion)) continue;
    const at = ms(run.updated_at);
    const red = tipState(run, run.jobs || null).state === "code-red";
    if (red && !open) open = { at, sha: String(run.head_sha || "").slice(0, 8), run: run.id ?? null };
    else if (!red && open) close(at);
  }
  if (open) close(toMs);
  return out;
}

/** The merge-path rows. Pure. */
export function reduceMergePath(input) {
  const fromMs = ms(input?.window?.from), toMs = ms(input?.window?.to);
  if (fromMs == null || toMs == null || toMs <= fromMs) return { error: "merge path: no window {from, to}" };
  const hours = (toMs - fromMs) / 3_600_000;
  const inWin = (t) => t != null && t >= fromMs && t <= toMs;
  const prs = input.prs || [];

  // Routes. A car is a PR named in the manifest of a MERGED train; its merge is the train's.
  const trains = prs.filter((p) => isTrainRef(p.head_ref));
  const carTrain = new Map();
  for (const t of trains) if (t.merged_at) for (const c of t.cars || []) carTrain.set(Number(c), t);
  const direct = [], car = [], train = [];
  const mergeTimes = []; // merge commits on the deploy branch: direct PRs and train PRs
  const mergeEvents = []; // every PR GitHub marks merged: direct, car (at its train's merge) and train PRs
  let prsMerged = 0;
  for (const p of prs) {
    if (isTrainRef(p.head_ref)) {
      if (!inWin(ms(p.merged_at))) continue;
      mergeTimes.push(ms(p.merged_at));
      mergeEvents.push(ms(p.merged_at));
      train.push(minutes(ms(p.created_at), ms(p.merged_at)));
      continue;
    }
    const t = carTrain.get(p.number);
    const mergedAt = t ? ms(t.merged_at) : ms(p.merged_at);
    if (!inWin(mergedAt)) continue;
    prsMerged++;
    mergeEvents.push(mergedAt);
    if (!t) mergeTimes.push(mergedAt);
    (t ? car : direct).push(minutes(ms(p.land_at), mergedAt));
  }
  // A "merge" in the per-merge rows is a merged PR of any route, as #6913 counted (2833 runs / 343 PRs ≈ 8.3).
  const merges = mergeEvents.length;

  // Longest no-merge gap and empty clock-hours (a parked gate that nobody re-evaluates shows here).
  const times = [fromMs, ...mergeTimes.sort((a, b) => a - b), toMs];
  let gap = { min: 0, from: null, to: null };
  for (let i = 1; i < times.length; i++) {
    const m = minutes(times[i - 1], times[i]);
    if (m > gap.min) gap = { min: m, from: new Date(times[i - 1]).toISOString().slice(0, 16) + "Z", to: new Date(times[i]).toISOString().slice(0, 16) + "Z" };
  }
  const mergedHours = new Set(mergeTimes.map(hourKey));
  let emptyHours = 0;
  for (let h = Math.ceil(fromMs / 3_600_000) * 3_600_000; h + 3_600_000 <= toMs; h += 3_600_000) if (!mergedHours.has(hourKey(h))) emptyHours++;

  // Red tip.
  const red = redTipIntervals(input.pagesRuns, fromMs, toMs);
  const redMin = Math.round(red.reduce((s, r) => s + r.min, 0) * 10) / 10;

  // land.yml churn.
  const landRuns = (input.landRuns || []).filter((r) => inWin(ms(r.created_at)));
  const skipped = landRuns.filter((r) => r.conclusion === "skipped").length;
  const ranRuns = landRuns.filter((r) => r.conclusion !== "skipped");
  const retries = landRuns.filter((r) => RETRY_TITLE.test(String(r.title || ""))).length;
  const per = (n) => (merges ? oneDecimal(n / merges) : null);

  // Trains closed in the window: merged, red (the bisect halved the next), stale, unknown (no result mark).
  const closed = trains.filter((t) => inWin(ms(t.closed_at || t.merged_at)));
  const outcome = (t) => (t.merged_at ? "merged" : t.outcome === "red" || t.outcome === "stale" ? t.outcome : "unknown");
  const count = (o) => closed.filter((t) => outcome(t) === o).length;
  const redTrains = closed.filter((t) => outcome(t) === "red");

  // #7517 phase 0: the gate chain per hour (runs that reached land-gate): wall vs work, queue entries.
  const byHour = new Map();
  const row = (k) => byHour.get(k) || byHour.set(k, { ran: 0, merges: 0, wall: [], work: [], entries: [], wait: [] }).get(k);
  for (const r of ranRuns) row(hourKey(ms(r.created_at))).ran++;
  for (const t of mergeEvents) row(hourKey(t)).merges++;
  for (const r of ranRuns) {
    const jobs = (r.jobs || []).filter((j) => j.conclusion !== "skipped" && ms(j.started_at) != null && ms(j.completed_at) != null);
    if (!jobs.some((j) => GATE_JOB.test(j.name || ""))) continue;
    const h = row(hourKey(ms(r.created_at)));
    h.wall.push(minutes(ms(r.created_at), ms(r.updated_at)));
    h.work.push(Math.round(jobs.reduce((s, j) => s + (ms(j.completed_at) - ms(j.started_at)), 0) / 6000) / 10);
    h.entries.push(jobs.length);
    for (const j of jobs) if (ms(j.created_at) != null) h.wait.push(minutes(ms(j.created_at), ms(j.started_at)));
  }
  const hourly = {};
  for (const k of [...byHour.keys()].sort()) {
    const h = byHour.get(k), wall = minStats(h.wall), work = minStats(h.work), wait = minStats(h.wait);
    hourly[k] = {
      merges: h.merges,
      land_runs: h.ran,
      land_runs_per_merge: h.merges ? oneDecimal(h.ran / h.merges) : null,
      gate_n: wall.n,
      gate_wall_p50_min: wall.p50_min,
      gate_wall_p90_min: wall.p90_min,
      gate_work_p50_min: work.p50_min,
      queue_entries_p50: percentile([...h.entries].sort((a, b) => a - b), 0.5),
      job_wait_p50_min: wait.p50_min,
      job_wait_p90_min: wait.p90_min,
    };
  }

  return {
    window: { from: input.window.from, to: input.window.to, hours: oneDecimal(hours) },
    land_to_merge: { direct: minStats(direct), car: minStats(car), train: minStats(train) },
    prs_merged: prsMerged,
    merges,
    merge_commits: mergeTimes.length,
    merges_per_hour: Math.round((prsMerged / hours) * 100) / 100,
    longest_no_merge: gap,
    zero_merge_hours: emptyHours,
    red_tip: { minutes: redMin, pct: oneDecimal((100 * redMin) / (hours * 60)), intervals: red },
    land: {
      started: landRuns.length,
      skipped,
      ran: ranRuns.length,
      cancelled: ranRuns.filter((r) => r.conclusion === "cancelled").length,
      retry_dispatches: retries,
      runs_per_merge: per(ranRuns.length),
      retries_per_merge: per(retries),
    },
    trains: {
      closed: closed.length,
      merged: count("merged"),
      red: redTrains.length,
      stale: count("stale"),
      unknown: count("unknown"),
      red_pct: closed.length ? oneDecimal((100 * redTrains.length) / closed.length) : null,
      red_prs: redTrains.map((t) => t.number).sort((a, b) => a - b),
    },
    hourly,
  };
}

function getRatchet(dash, r) {
  if (r.family) {
    const row = dash.families?.[r.family];
    return { n: row?.n ?? 0, value: row?.p50_s ?? null };
  }
  if (r.field === "fast") return { n: dash.runs?.fast_tier_n ?? 0, value: dash.runs?.fast_tier_p50_s ?? null };
  if (r.field === "live") return { n: dash.deploy?.n ?? 0, value: dash.deploy?.push_to_live_p50_s ?? null };
  return { n: 0, value: null };
}

/** Nightly-only. Under n_min the row is skipped, not failed. */
export function checkTimeRatchets(dash, ratchets = TIME_RATCHETS) {
  const violations = [];
  const skipped = [];
  for (const r of ratchets) {
    const { n, value } = getRatchet(dash, r);
    if (n < r.n_min || value == null) {
      skipped.push({ id: r.id, n });
      continue;
    }
    if (value > r.ceilingSec) violations.push({ id: r.id, value, ceilingSec: r.ceilingSec, n });
  }
  return { ok: violations.length === 0, violations, skipped };
}

function minLabel(sec) {
  if (sec == null) return "n/a";
  return `${(sec / 60).toFixed(1)} min`;
}

const mins = (v) => (v == null ? "n/a" : `${v} min`);

/** The merge-path section of the markdown twin. Pure. */
export function formatMergePath(mp) {
  const lines = ["## Merge path", ""];
  if (mp.error) return [...lines, `Not measured: ${mp.error}`, ""];
  const l = mp.land_to_merge, t = mp.trains, land = mp.land;
  lines.push(`Window ${mp.window.from} → ${mp.window.to} (${mp.window.hours} h). Land → merge is the last \`labeled: land\` event to the merge; a train car's merge is its train's; a train PR's is created → merged.`);
  lines.push("");
  lines.push("| Route | n | p50 | p90 | max |");
  lines.push("|---|---:|---:|---:|---:|");
  for (const [name, r] of [["Direct PR", l.direct], ["Train car", l.car], ["Train PR", l.train]]) {
    lines.push(`| ${name} | ${r.n} | ${mins(r.p50_min)} | ${mins(r.p90_min)} | ${mins(r.max_min)} |`);
  }
  lines.push("");
  lines.push(`- Merges: ${mp.prs_merged} PRs (${mp.merges_per_hour}/h) plus ${mp.merges - mp.prs_merged} train PRs, in ${mp.merge_commits} merge commits; ${mp.zero_merge_hours} clock-hours with none; longest gap ${mins(mp.longest_no_merge.min)} (${mp.longest_no_merge.from} → ${mp.longest_no_merge.to}).`);
  lines.push(`- Red tip (newest pages.yml run code-red; publish-platform failures and cancelled runs excluded, as the \`base\` row): ${mins(mp.red_tip.minutes)}, ${mp.red_tip.pct}% of the window, ${mp.red_tip.intervals.length} interval(s)${mp.red_tip.intervals.length ? ": " + mp.red_tip.intervals.map((r) => `${r.from}→${r.to} ${r.sha}`).join(", ") : ""}.`);
  lines.push(`- land.yml: ${land.started} started, ${land.skipped} skipped, ${land.ran} ran (${land.runs_per_merge} per merge), ${land.cancelled} cancelled, ${land.retry_dispatches} \`Land retry\` dispatches (${land.retries_per_merge} per merge).`);
  lines.push(`- Trains closed: ${t.closed}: ${t.merged} merged, ${t.red} red and halved (${t.red_pct ?? "n/a"}%), ${t.stale} stale, ${t.unknown} unknown${t.red_prs.length ? ` (red: ${t.red_prs.map((n) => `#${n}`).join(", ")})` : ""}.`);
  lines.push("");
  const hours = Object.entries(mp.hourly);
  if (hours.length) {
    lines.push("### Land chain by hour (#7517 phase 0)");
    lines.push("");
    lines.push("Gate runs are land.yml runs that started a `land-gate` job: wall is created → updated, work is the sum of their jobs' run time, queue entries are the jobs that ran.");
    lines.push("");
    lines.push("| Hour | merges | land runs | per merge | gate runs | gate wall p50 / p90 | work p50 | queue entries | job wait p50 / p90 |");
    lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
    for (const [k, h] of hours) {
      lines.push(`| ${k} | ${h.merges} | ${h.land_runs} | ${h.land_runs_per_merge ?? "n/a"} | ${h.gate_n} | ${mins(h.gate_wall_p50_min)} / ${mins(h.gate_wall_p90_min)} | ${mins(h.gate_work_p50_min)} | ${h.queue_entries_p50 ?? "n/a"} | ${mins(h.job_wait_p50_min)} / ${mins(h.job_wait_p90_min)} |`);
    }
    lines.push("");
  }
  return lines;
}

/** Markdown twin of the JSON, plus the 2026-09-16 comparison when `baseline` is set. */
export function formatMarkdown(dash, { baseline = false } = {}) {
  const lines = [];
  lines.push("# Process dashboard");
  lines.push("");
  lines.push(`Generated ${dash.generated}. ci.yml runs in the window: ${dash.window.runs} (${dash.window.from} → ${dash.window.to}).`);
  lines.push("Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.");
  lines.push("");
  lines.push("## Jobs");
  lines.push("");
  lines.push("| Job | n | p50 | p90 | max | fail | cancelled |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|");
  for (const [name, row] of Object.entries(dash.jobs)) {
    if (!row.n) continue;
    const fam = familyOf(name);
    if (fam === "Selected specs (change-aware gate)" && name !== fam) continue;
    lines.push(`| ${name} | ${row.n} | ${minLabel(row.p50_s)} | ${minLabel(row.p90_s)} | ${minLabel(row.max_s)} | ${row.fail} | ${row.cancelled} |`);
  }
  lines.push("");
  lines.push("## Families");
  lines.push("");
  lines.push("| Family | n | p50 | p90 | max |");
  lines.push("|---|---:|---:|---:|---:|");
  for (const [name, row] of Object.entries(dash.families)) {
    lines.push(`| ${name} | ${row.n} | ${minLabel(row.p50_s)} | ${minLabel(row.p90_s)} | ${minLabel(row.max_s)} |`);
  }
  lines.push("");
  lines.push("## Runs and deploy");
  lines.push("");
  const r = dash.runs, d = dash.deploy;
  lines.push(`- ci.yml runs: ${r.n}; cancelled ${r.cancelled_pct}%; re-gated SHAs ${r.regated_shas} (${r.regated_runs} extra runs).`);
  lines.push(`- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=${r.fast_tier_n}, p50 ${minLabel(r.fast_tier_p50_s)}, p90 ${minLabel(r.fast_tier_p90_s)}.`);
  lines.push(`- Full tier: n=${r.full_tier_n}, p50 ${minLabel(r.full_tier_p50_s)}, p90 ${minLabel(r.full_tier_p90_s)}.`);
  lines.push(`- Deploy push→live (successful pages.yml on ${DEPLOY_BRANCH}): n=${d.n}, p50 ${minLabel(d.push_to_live_p50_s)}, p90 ${minLabel(d.p90_s)}; superseded (cancelled) ${d.superseded}.`);
  lines.push(`- DORA: deploy freq ${dash.dora.deploy_freq_per_day}/day, lead time p50 ${minLabel(dash.dora.lead_time_p50_s)}, change-fail ${dash.dora.change_fail_pct}%, MTTR p50 ${minLabel(dash.dora.mttr_p50_s)}.`);
  lines.push("");
  if (dash.merge_path) lines.push(...formatMergePath(dash.merge_path));
  if (baseline) {
    const node = dash.families["Pure-node unit suites"];
    const smoke = dash.families["Smoke (page boots, __apex responds)"];
    lines.push("## Compared with 2026-09-16");
    lines.push("");
    lines.push(`Source of the earlier column: ${BASELINE_2026_09_16.source}. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).`);
    lines.push("The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.");
    lines.push("");
    lines.push("| Step | 2026-09-16 | This window |");
    lines.push("|---|---|---|");
    lines.push(`| CI node-suites | ${BASELINE_2026_09_16.nodeSuites} | slowest slice per run p50 ${minLabel(node?.p50_s)} (n=${node?.n ?? 0}) |`);
    const selected = dash.families["Selected specs (change-aware gate)"];
    lines.push(`| CI smoke, slowest shard | ${BASELINE_2026_09_16.smoke} | p50 ${minLabel(smoke?.p50_s)}, p90 ${minLabel(smoke?.p90_s)} (n=${smoke?.n ?? 0}) |`);
    lines.push(`| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 ${minLabel(selected?.p50_s)}, p90 ${minLabel(selected?.p90_s)} (n=${selected?.n ?? 0}) |`);
    lines.push(`| Full tier wall | ${BASELINE_2026_09_16.fullTier} | p50 ${minLabel(r.full_tier_p50_s)}, p90 ${minLabel(r.full_tier_p90_s)} (n=${r.full_tier_n}) |`);
    lines.push(`| Push → live | ${BASELINE_2026_09_16.pushToLive} | p50 ${minLabel(d.push_to_live_p50_s)}, p90 ${minLabel(d.p90_s)} (n=${d.n}) |`);
    lines.push(`| Same-SHA re-gate | ${BASELINE_2026_09_16.regate} | ${r.regated_runs} of ${r.n} runs (${r.n ? oneDecimal(100 * r.regated_runs / r.n) : "n/a"}%), ${r.regated_shas} SHAs |`);
    lines.push(`| Cancelled ci.yml runs | ${BASELINE_2026_09_16.cancelled} | ${r.cancelled_pct}% of ${r.n} |`);
    lines.push("");
  }
  lines.push(dash.notes[0]);
  lines.push("");
  return lines.join("\n");
}

/**
 * GET JSON with bounded retries on 429/5xx (process-dashboard 2026-10-21:
 * bare `jobs?per_page=100` answered 502 and killed the nightly with no retry).
 * @param {string} url
 * @param {string} token
 * @param {{ retries?: number }} [opts]
 */
export async function ghJson(url, token, { retries = 3 } = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "apex-process-dashboard",
  };
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await _fetch(url, { headers });
      if (!res.ok) {
        const body = await res.text();
        const err = new Error(`${res.status} ${url} ${body.slice(0, 200)}`);
        if (TRANSIENT_HTTP.has(res.status) && attempt < retries) {
          lastErr = err;
          await _delay(Math.min(8_000, 400 * 2 ** attempt));
          continue;
        }
        throw err;
      }
      return res.json();
    } catch (err) {
      lastErr = err;
      const status = Number(/^(\d{3})\b/.exec(err?.message || "")?.[1] || 0);
      const transient = TRANSIENT_HTTP.has(status)
        || /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket/i.test(String(err?.message || err));
      if (transient && attempt < retries) {
        await _delay(Math.min(8_000, 400 * 2 ** attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function slimRun(r) {
  return {
    id: r.id,
    head_sha: r.head_sha,
    event: r.event,
    status: r.status,
    conclusion: r.conclusion,
    run_attempt: r.run_attempt,
    run_started_at: r.run_started_at,
    updated_at: r.updated_at,
    head_branch: r.head_branch,
    path: r.path,
  };
}

function slimJob(j) {
  return {
    name: j.name,
    started_at: j.started_at,
    completed_at: j.completed_at,
    conclusion: j.conclusion,
    steps: (j.steps || []).map((s) => ({
      name: s.name,
      started_at: s.started_at,
      completed_at: s.completed_at,
      conclusion: s.conclusion,
    })),
  };
}

async function listRuns(token, workflow, { limit, branch }) {
  const runs = [];
  for (let page = 1; runs.length < limit && page <= 5; page++) {
    const q = new URLSearchParams({ per_page: "100", page: String(page), status: "completed" });
    if (branch) q.set("branch", branch);
    const data = await ghJson(`${API}/actions/workflows/${workflow}/runs?${q}`, token);
    const batch = data.workflow_runs || [];
    if (!batch.length) break;
    for (const r of batch) {
      runs.push(slimRun(r));
      if (runs.length >= limit) break;
    }
    if (batch.length < 100) break;
  }
  return runs;
}

/** Attach slim jobs to each run, paging JOBS_PAGE at a time (#2233). */
export async function attachJobs(token, runs) {
  for (const run of runs) {
    const jobs = [];
    for (let page = 1; page <= MAX_JOB_PAGES; page++) {
      const data = await ghJson(
        `${API}/actions/runs/${run.id}/jobs?per_page=${JOBS_PAGE}&page=${page}`,
        token,
      );
      const batch = data.jobs || [];
      for (const j of batch) jobs.push(slimJob(j));
      if (batch.length < JOBS_PAGE) break;
      if (data.total_count != null && jobs.length >= data.total_count) break;
    }
    run.jobs = jobs;
  }
  return runs;
}

/** Merge-path window (hours) and how many of the newest land.yml runs that ran get their jobs read (#7517 phase 0).
 *  The nightly's GITHUB_TOKEN has 1000 requests an hour: ≈1 per merged PR (its events), ≈1 per 100 land runs,
 *  1 per land run read here, plus the ci.yml jobs above, so the cap keeps the whole job under that. */
export const MERGE_PATH_HOURS = 72;
export const LAND_JOB_RUNS = 200;

async function pagedRuns(token, workflow, params, maxPages) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const q = new URLSearchParams({ per_page: "100", page: String(page), ...params });
    const batch = (await ghJson(`${API}/actions/workflows/${workflow}/runs?${q}`, token)).workflow_runs || [];
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

/** The last `labeled: land` event of a PR (issue events are oldest first). */
async function lastLandAt(token, number) {
  let at = null;
  for (let page = 1; page <= 3; page++) {
    const batch = await ghJson(`${API}/issues/${number}/events?per_page=100&page=${page}`, token);
    for (const e of batch || []) if (e?.event === "labeled" && e?.label?.name === "land") at = e.created_at;
    if (!Array.isArray(batch) || batch.length < 100) break;
  }
  return at;
}

/** Read the merge-path input for the last `hours`. Network; the reducer is reduceMergePath. */
export async function fetchMergePath(token, { hours = MERGE_PATH_HOURS, landJobRuns = LAND_JOB_RUNS, now = Date.now() } = {}) {
  const fromMs = now - hours * 3_600_000;
  const window = { from: new Date(fromMs).toISOString(), to: new Date(now).toISOString() };
  const prs = [];
  for (let page = 1; page <= 15; page++) {
    const q = new URLSearchParams({ state: "closed", base: DEPLOY_BRANCH, sort: "updated", direction: "desc", per_page: "100", page: String(page) });
    const batch = await ghJson(`${API}/pulls?${q}`, token);
    for (const p of batch || []) {
      if (ms(p.closed_at) < fromMs) continue;
      const train = isTrainRef(p.head?.ref);
      const slim = { number: p.number, head_ref: p.head?.ref || "", created_at: p.created_at, merged_at: p.merged_at, closed_at: p.closed_at, land_at: null };
      if (train) {
        slim.cars = (trainManifest(p.body)?.cars || []).map((c) => c.pr);
        slim.outcome = trainResult(p.body)?.outcome || null;
      }
      prs.push(slim);
    }
    if (!Array.isArray(batch) || batch.length < 100 || ms(batch[batch.length - 1]?.updated_at) < fromMs) break;
  }
  for (const p of prs) if (p.merged_at && !isTrainRef(p.head_ref)) p.land_at = await lastLandAt(token, p.number);

  const created = `>=${new Date(fromMs).toISOString().slice(0, 19)}Z`;
  const landRuns = (await pagedRuns(token, "land.yml", { created }, 60)).map((r) => ({
    id: r.id, created_at: r.created_at, updated_at: r.updated_at, conclusion: r.conclusion, title: r.display_title || r.name || "", event: r.event,
  }));
  const reading = landRuns.filter((r) => r.conclusion && r.conclusion !== "skipped")
    .sort((a, b) => ms(b.created_at) - ms(a.created_at)).slice(0, landJobRuns);
  for (const run of reading) {
    const data = await ghJson(`${API}/actions/runs/${run.id}/jobs?filter=latest&per_page=${JOBS_PAGE}`, token);
    run.jobs = (data.jobs || []).map((j) => ({ name: j.name, created_at: j.created_at, started_at: j.started_at, completed_at: j.completed_at, conclusion: j.conclusion }));
  }

  // A day before the window, so the state at its start is known.
  const pagesFrom = `>=${new Date(fromMs - 86_400_000).toISOString().slice(0, 19)}Z`;
  const pagesRuns = (await pagedRuns(token, "pages.yml", { branch: DEPLOY_BRANCH, status: "completed", created: pagesFrom }, 5)).map((r) => ({
    id: r.id, head_sha: r.head_sha, created_at: r.created_at, updated_at: r.updated_at, conclusion: r.conclusion,
  }));
  for (const run of pagesRuns) {
    if (!["failure", "timed_out", "startup_failure"].includes(run.conclusion)) continue;
    const data = await ghJson(`${API}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`, token);
    run.jobs = (data.jobs || []).map((j) => ({ name: j.name, conclusion: j.conclusion, steps: (j.steps || []).map((s) => ({ name: s.name, conclusion: s.conclusion })) }));
  }
  return { window, prs, landRuns, pagesRuns };
}

export async function fetchDashboard({ runs = 60, token, generated, mergePath = true } = {}) {
  const ciRuns = await listRuns(token, "ci.yml", { limit: runs });
  await attachJobs(token, ciRuns);
  const pagesRuns = await listRuns(token, "pages.yml", { limit: runs, branch: DEPLOY_BRANCH });
  // The merge path is a second read; its failure (a 403 on a missing scope, the hourly limit) leaves the
  // CI rows standing and names itself in merge_path.error.
  let mp;
  if (mergePath) {
    try { mp = await fetchMergePath(token); } catch (e) { mp = { error: `merge path not read: ${String(e?.message || e).slice(0, 200)}` }; }
  }
  return reduceDashboard({ ciRuns, pagesRuns, generated, mergePath: mp });
}

function arg(name, argv) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
}

async function main(argv) {
  if (argv.includes("--help")) {
    console.log("process-dashboard.mjs --runs 60 --out <json> --md <md> | --fixture <json> --json | --check <json>");
    return;
  }
  if (argv.includes("--check")) {
    const file = arg("--check", argv);
    const dash = JSON.parse(fs.readFileSync(file, "utf8"));
    const result = checkTimeRatchets(dash);
    console.log(JSON.stringify(result));
    if (!result.ok) process.exit(1);
    return;
  }
  let dash;
  if (argv.includes("--fixture")) {
    const raw = JSON.parse(fs.readFileSync(arg("--fixture", argv), "utf8"));
    dash = reduceDashboard(raw);
  } else {
    const token = githubToken();
    if (!token) {
      console.error(NO_TOKEN_HINT);
      process.exit(2);
    }
    const runs = Number(arg("--runs", argv) || 60);
    dash = await fetchDashboard({ runs, token, mergePath: !argv.includes("--no-merge-path") });
  }
  const text = JSON.stringify(dash, null, 2) + "\n";
  const out = arg("--out", argv);
  if (out) fs.writeFileSync(out, text);
  if (argv.includes("--json") || !out) process.stdout.write(text);
  const md = arg("--md", argv);
  if (md) fs.writeFileSync(md, formatMarkdown(dash, { baseline: argv.includes("--baseline") }));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
