/* perf-session-budgets.test.mjs — hang ceilings vs recorded lines, no browser.
 *
 * The spec applies sessionReport() to a live software-GL session. This file
 * pins the verdict: a value between record and gate passes, over the gate
 * fails, a null gate never fails, and a missing sample is not a failure.
 * The frame hang ceilings stay above the blessed SwiftShader sample.
 *
 * Run: node --test tests/unit/perf-session-budgets.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUDGETS, MIN_STEADY_FRAMES, frameWindow, heapGrowth, judge, sessionReport,
} from "../../tools/perf/session-budgets.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("frame hang ceilings sit above the blessed SwiftShader sample", () => {
  const blessed = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/data/perf-frametime-baseline.json"), "utf8"));
  assert.ok(BUDGETS.worstFrameMs.gate > blessed.metrics.max,
    `worst gate ${BUDGETS.worstFrameMs.gate} must exceed blessed max ${blessed.metrics.max}`);
  assert.ok(BUDGETS.steadyP50Ms.gate > blessed.metrics.p50,
    `steady gate ${BUDGETS.steadyP50Ms.gate} must exceed blessed p50 ${blessed.metrics.p50}`);
  assert.equal(BUDGETS.worstOverSteady.gate, null, "worst/steady is a record, not a software-GL gate");
  assert.ok(BUDGETS.garageFirstDrawMs.record < BUDGETS.garageFirstDrawMs.gate);
  assert.ok(BUDGETS.heapGrowthMB.record < BUDGETS.heapGrowthMB.gate);
});

test("judge: between record and gate passes, over the gate fails, strict uses the record", () => {
  const budget = { gate: 100, record: 20 };
  const mid = judge("x", 50, budget, false);
  assert.equal(mid.pass, true);
  assert.equal(mid.gated, true);
  assert.equal(mid.overRecord, true);
  const over = judge("x", 101, budget, false);
  assert.equal(over.pass, false);
  assert.match(over.detail, /gate 100/);
  const strict = judge("x", 50, budget, true);
  assert.equal(strict.pass, false);
  assert.match(strict.detail, /strict 20/);
  const missing = judge("x", null, budget, false);
  assert.equal(missing.pass, true);
  assert.equal(missing.gated, false);
});

test("a null gate records the ratio and does not fail", () => {
  const row = judge("worstOverSteady", 12, BUDGETS.worstOverSteady, false);
  assert.equal(row.pass, true);
  assert.equal(row.gated, false);
  assert.equal(row.overRecord, true);
  const under = judge("worstOverSteady", 2, BUDGETS.worstOverSteady, false);
  assert.equal(under.overRecord, false);
});

test("frameWindow drops the entry and withholds a thin steady sample", () => {
  const thin = frameWindow([100, 200, 300, 400]);
  assert.equal(thin.frames, 4);
  assert.equal(thin.worst, 400);
  assert.equal(thin.steadyP50, null);
  assert.ok(thin.steadyFrames < MIN_STEADY_FRAMES);
  const samples = [];
  for (let i = 0; i < 10; i++) samples.push(5000);
  for (let i = 0; i < 10; i++) samples.push(40);
  const wide = frameWindow(samples);
  assert.equal(wide.worst, 5000);
  assert.equal(wide.steadyP50, 40);
  assert.ok(wide.worstOverSteady > 8);
});

test("heapGrowth is signed, and a missing side is unavailable", () => {
  const grew = heapGrowth(80, 95.5);
  assert.equal(grew.ok, true);
  assert.equal(grew.growthMB, 15.5);
  const shrunk = heapGrowth(90, 70);
  assert.equal(shrunk.growthMB, -20);
  assert.equal(heapGrowth(null, 10).ok, false);
  assert.equal(judge("heapGrowthMB", shrunk.growthMB, BUDGETS.heapGrowthMB, false).pass, true);
  assert.equal(judge("heapGrowthMB", 201, BUDGETS.heapGrowthMB, false).pass, false);
});

test("sessionReport gates the hang ceilings and records an unquiet heap", () => {
  const quiet = sessionReport({
    garageFirstDrawMs: 1200,
    raceGridMs: 40_000,
    frames: [100, 120, 110, 4000, 130, 140, 125, 135, 128, 132],
    heapBeforeMB: 70,
    heapAfterMB: 88,
    heapGate: true,
  }, { strict: false });
  assert.equal(quiet.pass, true, quiet.rows.map((r) => r.detail).join(" | "));
  assert.equal(quiet.heap.growthMB, 18);

  const hung = sessionReport({
    garageFirstDrawMs: 1200,
    raceGridMs: 40_000,
    frames: [100, 120, 110, 30_000, 130, 140, 125, 135, 128, 132],
    heapBeforeMB: 70,
    heapAfterMB: 88,
    heapGate: true,
  }, { strict: false });
  assert.equal(hung.pass, false);
  assert.ok(hung.rows.find((r) => r.name === "worstFrameMs" && r.pass === false));

  const noisyHeap = sessionReport({
    garageFirstDrawMs: 100,
    raceGridMs: 1000,
    frames: [80, 80, 80, 80, 80, 80, 80, 80, 80, 80],
    heapBeforeMB: 10,
    heapAfterMB: 500,
    heapGate: false,
  }, { strict: false });
  assert.equal(noisyHeap.pass, true, "an unquiet menu records heap and does not fail");
  assert.equal(noisyHeap.heap.growthMB, 490);
  assert.equal(noisyHeap.rows.find((r) => r.name === "heapGrowthMB").gated, false);
});
