// @doc Session perf budgets: hang ceilings vs recorded phone lines for garage, grid, frames and heap.
// tools/perf/session-budgets.mjs — pure verdicts for tests/specs/perf-session-budgets.spec.js.
//
// A millisecond measured under SwiftShader or llvmpipe is a property of the
// box, not of a phone GPU (docs/notes/PERFTEST-HUNT-2026-10-24.md). The blessed
// software-GL sample in tests/data/perf-frametime-baseline.json is p50 5783 ms
// and max 16366 ms, six frames in 20 s. Each metric therefore has two numbers:
//
//   gate    — a hang ceiling the spec fails. Sized above that sample so a
//             loaded software-GL runner still passes.
//   record  — the phone-class line. Always written on the report. It fails
//             the run only when APEX_PERF_SESSION_STRICT=1 (or APEX_PERF_STRICT=1).
//
// A null gate is record-only (worst/steady). A missing sample is recorded and
// does not fail: performance.memory is quantized (Playwright #36844) and a
// short software-GL window may not yield enough steady frames to percentile.
//
// https://github.com/microsoft/playwright/issues/36844
// https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-getHeapUsage

export const RACE_WINDOW_MS = 30_000;
/** Drop this fraction of the window (chronological) before the steady median. */
export const STEADY_DROP_FRAC = 0.4;
/** Below this, steady p50 is unproven and is not gated.
 *  SwiftShader produced 7 rAF gaps in 30 s (2026-10-29); a 40% entry drop
 *  leaves 5, so the floor is 4 — enough for a median, not a percentile fantasy. */
export const MIN_STEADY_FRAMES = 4;

export const BUDGETS = {
  garageFirstDrawMs: { gate: 90_000, record: 8_000 },
  raceGridMs: { gate: 240_000, record: 90_000 },
  worstFrameMs: { gate: 25_000, record: 100 },
  steadyP50Ms: { gate: 20_000, record: 34 },
  worstOverSteady: { gate: null, record: 8 },
  heapGrowthMB: { gate: 200, record: 40 },
};

export const STRICT = process.env.APEX_PERF_SESSION_STRICT === "1"
  || process.env.APEX_PERF_STRICT === "1";

const round2 = (n) => Math.round(n * 100) / 100;

/** Same ceil-index quantile as tools/perf/lib.mjs intervalStats. */
export function quantile(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i];
}

/**
 * rAF deltas (ms) from the first 30 s of a race.
 * `worst` is the max of the whole window. `steadyP50` is the median after
 * the entry drop, or null when fewer than MIN_STEADY_FRAMES remain.
 */
export function frameWindow(samples) {
  const raw = Array.isArray(samples)
    ? samples.filter((x) => typeof x === "number" && Number.isFinite(x) && x > 0 && x < 120_000)
    : [];
  if (!raw.length) {
    return {
      ok: false, reason: "no_frames", frames: 0, worst: null, p50: null, p95: null,
      steadyFrames: 0, steadyP50: null, steadyReason: "no frames", worstOverSteady: null,
    };
  }
  const sorted = [...raw].sort((a, b) => a - b);
  const worst = sorted[sorted.length - 1];
  const drop = Math.floor(raw.length * STEADY_DROP_FRAC);
  const steadySrc = raw.slice(drop);
  const steadySorted = [...steadySrc].sort((a, b) => a - b);
  const steadyP50 = steadySorted.length ? quantile(steadySorted, 0.5) : null;
  const steadyOk = steadySrc.length >= MIN_STEADY_FRAMES && steadyP50 != null && steadyP50 > 0;
  return {
    ok: true,
    frames: raw.length,
    worst: round2(worst),
    p50: round2(quantile(sorted, 0.5)),
    p95: round2(quantile(sorted, 0.95)),
    steadyFrames: steadySrc.length,
    steadyP50: steadyOk ? round2(steadyP50) : null,
    steadyReason: steadyOk ? null : `steady needs ${MIN_STEADY_FRAMES} frames after the entry drop, got ${steadySrc.length}`,
    worstOverSteady: steadyOk ? round2(worst / steadyP50) : null,
  };
}

/** Post-GC heap at the menu, before the race and after Quit to Menu. */
export function heapGrowth(beforeMB, afterMB) {
  if (!Number.isFinite(beforeMB) || !Number.isFinite(afterMB)) {
    return { ok: false, reason: "unavailable", growthMB: null, ratio: null, beforeMB: beforeMB ?? null, afterMB: afterMB ?? null };
  }
  return {
    ok: true,
    growthMB: round2(afterMB - beforeMB),
    ratio: beforeMB > 0 ? round2(afterMB / beforeMB) : null,
    beforeMB: round2(beforeMB),
    afterMB: round2(afterMB),
  };
}

/**
 * @param {string} name
 * @param {number|null} value  null → recorded, not gated
 * @param {{ gate: number|null, record: number|null }} budget
 */
export function judge(name, value, budget, strict = STRICT) {
  const record = budget && budget.record != null ? budget.record : null;
  const gate = budget && budget.gate != null ? budget.gate : null;
  if (value == null || !Number.isFinite(value)) {
    return {
      name, value: value ?? null, pass: true, gated: false, overRecord: false, cap: null,
      detail: `${name} unavailable (recorded, not gated)`,
    };
  }
  const overRecord = record != null && value > record;
  const cap = strict && record != null ? record : gate;
  if (cap == null) {
    return {
      name, value, pass: true, gated: false, overRecord, cap: null,
      detail: `${name}=${value} ${overRecord ? "over" : "within"} record ${record} (not gated)`,
    };
  }
  const pass = value <= cap;
  const which = strict && record != null ? "strict" : "gate";
  return {
    name, value, pass, gated: true, overRecord, cap,
    detail: `${name}=${value} ${pass ? "<=" : ">"} ${which} ${cap}`
      + (overRecord && pass ? `; over record ${record}` : ""),
  };
}

/**
 * @param {{ garageFirstDrawMs?: number|null, raceGridMs?: number|null, frames?: number[], heapBeforeMB?: number|null, heapAfterMB?: number|null, heapGate?: boolean }} measured
 * heapGate false (menu was not quiet) records the delta and does not fail.
 */
export function sessionReport(measured, { strict = STRICT } = {}) {
  const m = measured || {};
  const frames = frameWindow(m.frames || []);
  const heap = heapGrowth(m.heapBeforeMB, m.heapAfterMB);
  const heapValue = m.heapGate === false ? null : (heap.ok ? heap.growthMB : null);
  const rows = [
    judge("garageFirstDrawMs", finiteOrNull(m.garageFirstDrawMs), BUDGETS.garageFirstDrawMs, strict),
    judge("raceGridMs", finiteOrNull(m.raceGridMs), BUDGETS.raceGridMs, strict),
    judge("worstFrameMs", frames.frames ? frames.worst : null, BUDGETS.worstFrameMs, strict),
    judge("steadyP50Ms", frames.steadyP50, BUDGETS.steadyP50Ms, strict),
    judge("worstOverSteady", frames.worstOverSteady, BUDGETS.worstOverSteady, strict),
    judge("heapGrowthMB", heapValue, BUDGETS.heapGrowthMB, strict),
  ];
  return { pass: rows.every((r) => r.pass), rows, frames, heap, strict };
}

function finiteOrNull(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
