import { test } from "node:test";
import assert from "node:assert/strict";
import { compareToBaseline, summariseFrameMs, REGRESSION } from "../helpers/perf-frametime.mjs";

test("summariseFrameMs computes percentiles on a synthetic run", () => {
  const samples = Array.from({ length: 120 }, (_, i) => 16 + (i % 5));
  const s = summariseFrameMs(samples);
  assert.equal(s.ok, true);
  assert.ok(s.p50 >= 16 && s.p50 <= 21);
  assert.ok(s.p95 >= s.p50);
  assert.ok(s.p99 >= s.p95);
});

test("compareToBaseline flags only large regressions", () => {
  const baseline = { metrics: { p50: 20, p95: 28, p99: 35, longTasks: 2, heapUsedMB: 100 } };
  const ok = compareToBaseline({ p50: 21, p95: 30, p99: 36, longTasks: 3, heapUsedMB: 105 }, baseline);
  assert.equal(ok.regressions.length, 0);

  const bad = compareToBaseline({ p50: 30, p95: 40, p99: 50, longTasks: 20, heapUsedMB: 140 }, baseline);
  assert.ok(bad.regressions.length >= 3);
  assert.ok(REGRESSION.p95Ratio > 1);
});
