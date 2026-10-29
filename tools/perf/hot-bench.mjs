#!/usr/bin/env node
// @doc VM microbench of step, physState and nodeAt: 6x hang ceiling vs a checked-in per-call baseline.
// tools/perf/hot-bench.mjs — the hot-function microbench behind tests/unit/perf-hot-bench.test.mjs.
//
// The renderer is stubbed (tools/lib/game-vm.cjs), so these times are the
// simulation, not a GPU. Wall-clock on a shared runner moves; a 15% baseline
// would flake. The gate is therefore a hang ceiling: median ms/call at most
// GENEROUS_RATIO times the checked-in baseline, and the slowest of three
// windows at most SPREAD_RATIO times the fastest (a stall mid-bench, not a
// slow box). APEX_PERF_HOT_STRICT=1 (or APEX_PERF_STRICT=1) tightens the
// ceiling to STRICT_RATIO. Rewrite the baseline only when the hot path
// changed on purpose:
//
//   node tools/perf/hot-bench.mjs
//   node tools/perf/hot-bench.mjs --update
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { createGame } = require("../lib/game-vm.cjs");

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BASELINE_PATH = path.join(HERE, "baselines", "hot-bench.json");

export const TRACK = "monza";
export const WINDOWS = 3;
export const WARM_STEPS = 80;
export const SPREAD_RATIO = 4;
export const GENEROUS_RATIO = 6;
export const STRICT_RATIO = 1.75;
export const BENCHES = {
  step: { iters: 80 },
  physState: { iters: 200 },
  nodeAt: { iters: 2000 },
};

export const STRICT = process.env.APEX_PERF_HOT_STRICT === "1"
  || process.env.APEX_PERF_STRICT === "1";

const round3 = (n) => Math.round(n * 1000) / 1000;

export function windowMs(fn, iters) {
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) fn(i);
  return performance.now() - t0;
}

/** Three window totals → median ms/call and the max/min spread. */
export function summariseWindows(samples, iters) {
  if (!samples.length || !(iters > 0)) {
    return { samples, medianMs: null, msPerCall: null, minMs: null, maxMs: null, ratio: Infinity };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const minMs = sorted[0];
  const maxMs = sorted[sorted.length - 1];
  const mid = sorted.length >> 1;
  const medianMs = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    samples: samples.map(round3),
    medianMs: round3(medianMs),
    msPerCall: round3(medianMs / iters),
    minMs: round3(minMs),
    maxMs: round3(maxMs),
    ratio: minMs > 0 ? round3(maxMs / minMs) : Infinity,
    iters,
  };
}

/**
 * @param {{ msPerCall: number, ratio: number }} row
 * @param {{ msPerCall: number }|null} baseline
 */
export function judgeHot(row, baseline, { strict = STRICT, spreadRatio = SPREAD_RATIO, generousRatio = GENEROUS_RATIO, strictRatio = STRICT_RATIO } = {}) {
  const base = baseline && Number.isFinite(baseline.msPerCall) ? baseline.msPerCall : null;
  const factor = strict ? strictRatio : generousRatio;
  const cap = base != null ? round3(base * factor) : null;
  const overCap = cap != null && row.msPerCall > cap;
  const overSpread = !(row.ratio <= spreadRatio);
  const pass = base != null && cap != null && row.msPerCall > 0 && !overCap && !overSpread;
  return { pass, cap, factor, overCap, overSpread, base, strict };
}

function benchFn(g, name) {
  if (name === "step") return () => { g.apex.step(1 / 60, 1); };
  if (name === "physState") return () => { g.apex.physState(); };
  if (name === "nodeAt") return (i) => { g.apex.nodeAt((i % 1000) / 1000); };
  throw new Error("unknown bench " + name);
}

/** One monza boot, a warm throttle run, then WINDOWS of each hot function. */
export async function measureHot() {
  const g = await createGame({ track: TRACK });
  try {
    g.apex.headless(true);
    g.apex.setInput({ throttle: true, steer: 0.04 });
    g.step(WARM_STEPS);
    const benches = {};
    for (const [name, spec] of Object.entries(BENCHES)) {
      const fn = benchFn(g, name);
      windowMs(fn, spec.iters);
      const samples = [];
      for (let w = 0; w < WINDOWS; w++) samples.push(windowMs(fn, spec.iters));
      benches[name] = summariseWindows(samples, spec.iters);
    }
    return { track: TRACK, windows: WINDOWS, warmSteps: WARM_STEPS, benches };
  } finally {
    g.close();
  }
}

export function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return null;
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
}

export function baselineFromMeasure(measured) {
  const benches = {};
  for (const [name, spec] of Object.entries(BENCHES)) {
    const row = measured.benches[name];
    benches[name] = { iters: spec.iters, msPerCall: row.msPerCall };
  }
  return {
    track: TRACK,
    windows: WINDOWS,
    warmSteps: WARM_STEPS,
    generousRatio: GENEROUS_RATIO,
    strictRatio: STRICT_RATIO,
    spreadRatio: SPREAD_RATIO,
    benches,
    measured: new Date().toISOString(),
  };
}

export function writeBaseline(measured) {
  const doc = baselineFromMeasure(measured);
  writeFileSync(BASELINE_PATH, JSON.stringify(doc, null, 2) + "\n");
  return doc;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const update = process.argv.includes("--update");
  const measured = await measureHot();
  const lines = [];
  for (const [name, row] of Object.entries(measured.benches)) {
    lines.push(`${name}  ms/call ${row.msPerCall}  windows ${row.samples.join(",")}  spread ${row.ratio}`);
  }
  console.log(lines.join("\n"));
  if (update) {
    const doc = writeBaseline(measured);
    console.log("wrote " + BASELINE_PATH);
    console.log(JSON.stringify(doc.benches));
  }
}
