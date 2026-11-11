import { test } from "node:test";
import assert from "node:assert/strict";
import { compareToBaseline, envOf, summariseFrameMs, REGRESSION, ENV_KEYS } from "../helpers/perf-frametime.mjs";

const ENV = envOf({ renderer: "webgl2", api: "webgl2", adapter: "SwiftShader", browser: "chromium", browserVersion: "140.0.7339.16", viewport: { width: 844, height: 390, dpr: 1 } });

test("summariseFrameMs computes percentiles on a synthetic run", () => {
  const samples = Array.from({ length: 120 }, (_, i) => 16 + (i % 5));
  const s = summariseFrameMs(samples);
  assert.equal(s.ok, true);
  assert.ok(s.p50 >= 16 && s.p50 <= 21);
  assert.ok(s.p95 >= s.p50);
  assert.ok(s.p99 >= s.p95);
});

test("compareToBaseline flags only large regressions", () => {
  const baseline = { env: ENV, metrics: { p50: 20, p95: 28, p99: 35, longTasks: 2, heapUsedMB: 100 } };
  const ok = compareToBaseline({ p50: 21, p95: 30, p99: 36, longTasks: 3, heapUsedMB: 105 }, baseline, ENV);
  assert.equal(ok.regressions.length, 0);
  assert.equal(ok.outcome, "pass");

  const bad = compareToBaseline({ p50: 30, p95: 40, p99: 50, longTasks: 20, heapUsedMB: 140 }, baseline, ENV);
  assert.ok(bad.regressions.length >= 3);
  assert.equal(bad.outcome, "regressed");
  assert.ok(REGRESSION.p95Ratio > 1);
});

test("a run on another renderer, adapter, browser or viewport is not comparable: neither a pass nor a fail (#3665)", () => {
  const baseline = { env: ENV, metrics: { p50: 20, p95: 28, p99: 35, longTasks: 2, heapUsedMB: 100 } };
  const slow = { p50: 60, p95: 80, p99: 90, longTasks: 30, heapUsedMB: 200 };
  for (const [k, v] of [["renderer", "three"], ["api", "webgpu"], ["adapter", "Apple M2"], ["browser", "webkit 18"], ["viewport", "1280x720@2"]]) {
    const r = compareToBaseline(slow, baseline, { ...ENV, [k]: v });
    assert.equal(r.outcome, "not-comparable", k);
    assert.deepEqual(r.regressions, [], `${k}: no regression verdict across machines`);
    assert.equal(r.mismatches.length, 1);
    assert.match(r.mismatches[0], new RegExp("^" + k + ":"));
  }
  // Unknown is not "the same": an unrecorded field on either side compares nothing.
  assert.equal(compareToBaseline(slow, { metrics: baseline.metrics }, ENV).outcome, "not-comparable");
  assert.equal(compareToBaseline(slow, baseline, { ...ENV, adapter: null }).outcome, "not-comparable");
  assert.equal(compareToBaseline(slow, baseline).outcome, "not-comparable");
  assert.deepEqual(Object.keys(ENV), ENV_KEYS);
  assert.equal(ENV.browser, "chromium 140", "browser compares by name and major version");
  assert.equal(ENV.viewport, "844x390@1");
});
