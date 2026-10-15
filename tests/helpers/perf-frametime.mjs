/* perf-frametime.mjs — shared scenario, percentile math, and baseline compare
 * for tests/specs/perf-frametime.spec.js (SwiftShader frame-cost regression lane).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BASELINE_PATH = path.join(HERE, "..", "data", "perf-frametime-baseline.json");

/** Fixed scenario — every run must match this or the baseline is not comparable. */
export const SCENARIO = {
  track: "monza",
  tod: "night",
  wx: "clear",
  seed: 4242,
  startFrac: 0.002,
  gfxPreset: "high",
  viewport: { width: 844, height: 390 },
  warmMs: 5000,
  sampleMs: 20000,
  renderScale: 1,
};

/** Soft report vs strict fail: only large swings trip strict mode. */
export const REGRESSION = {
  p50Ratio: 1.2,
  p95Ratio: 1.25,
  p99Ratio: 1.35,
  longTasksDelta: 8,
  heapRatio: 1.3,
};

export const STRICT = process.env.APEX_PERF_FRAMETIME_STRICT === "1"
  || process.env.APEX_PERF_STRICT === "1";

export function quantile(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return +sorted[i].toFixed(3);
}

export function summariseFrameMs(samples) {
  const s = samples.filter((x) => x > 0 && x < 2000).sort((a, b) => a - b);
  if (s.length < 5) {
    return { ok: false, reason: "insufficient_frames", frames: s.length };
  }
  return {
    ok: true,
    frames: s.length,
    p50: quantile(s, 0.5),
    p95: quantile(s, 0.95),
    p99: quantile(s, 0.99),
    max: quantile(s, 1),
  };
}

/** @returns {{ regressions: string[], report: object }} */
export function compareToBaseline(measured, baseline) {
  const regressions = [];
  const report = { scenario: SCENARIO, measured, baseline: baseline.metrics, deltas: {} };

  const ratio = (key) => {
    const b = baseline.metrics[key];
    const m = measured[key];
    if (b == null || m == null || !(b > 0)) return null;
    return m / b;
  };

  for (const key of ["p50", "p95", "p99"]) {
    const r = ratio(key);
    if (r != null) {
      report.deltas[key] = +r.toFixed(4);
      const cap = REGRESSION[`${key}Ratio`];
      if (r > cap) regressions.push(`${key} ${measured[key]}ms > ${(cap * 100 - 100).toFixed(0)}% vs baseline ${baseline.metrics[key]}ms (ratio ${r.toFixed(3)})`);
    }
  }

  if (baseline.metrics.longTasks != null && measured.longTasks != null) {
    const d = measured.longTasks - baseline.metrics.longTasks;
    report.deltas.longTasks = d;
    if (d > REGRESSION.longTasksDelta) {
      regressions.push(`longTasks +${d} vs baseline ${baseline.metrics.longTasks} (cap +${REGRESSION.longTasksDelta})`);
    }
  }

  if (baseline.metrics.heapUsedMB != null && measured.heapUsedMB != null && baseline.metrics.heapUsedMB > 0) {
    const r = measured.heapUsedMB / baseline.metrics.heapUsedMB;
    report.deltas.heapUsedMB = +r.toFixed(4);
    if (r > REGRESSION.heapRatio) {
      regressions.push(`heap ${measured.heapUsedMB}MB > ${(REGRESSION.heapRatio * 100 - 100).toFixed(0)}% vs baseline ${baseline.metrics.heapUsedMB}MB`);
    }
  }

  report.regressions = regressions;
  return report;
}

export function writeArtifact(dir, payload) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "perf-frametime.json");
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
  return file;
}

export function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}
