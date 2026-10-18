import test from "node:test";
import assert from "node:assert/strict";
import { analyzePrCi, median, minutesBetween } from "../../tools/ci/measure-pr-ci-after-close.mjs";
import { CI_PATH, DEPLOY } from "../../tools/ci/ready-full-cap.mjs";

test("minutesBetween and median", () => {
  assert.ok(Math.abs(minutesBetween("2026-10-18T00:00:00Z", "2026-10-18T01:30:00Z") - 90) < 0.01);
  assert.equal(median([10, 20, 30]), 20);
});

test("analyzePrCi counts job-minutes that start after the PR closed", () => {
  const close = "2026-10-18T12:00:00Z";
  const prByNum = new Map([[9, { base: { ref: DEPLOY }, closed_at: close, merged_at: close }]]);
  const runs = [{
    id: 1, path: CI_PATH, event: "pull_request", created_at: "2026-10-18T11:00:00Z", updated_at: "2026-10-18T13:00:00Z",
    pull_requests: [{ number: 9 }],
  }];
  const jobsByRun = new Map([[1, [
    { started_at: "2026-10-18T11:10:00Z", completed_at: "2026-10-18T11:20:00Z", status: "completed" },
    { started_at: "2026-10-18T12:05:00Z", completed_at: "2026-10-18T12:15:00Z", status: "completed" },
  ]]]);
  const v = analyzePrCi({ runs, prByNum, jobsByRun, deployBase: DEPLOY });
  assert.equal(v.totalJobs, 2);
  assert.ok(v.totalJobMin > 19 && v.totalJobMin < 21);
  assert.ok(v.postCloseJobMin > 9 && v.postCloseJobMin < 11);
  assert.ok(v.postClosePct > 45 && v.postClosePct < 55);
});

test("analyzePrCi peak-hour median wall minutes", () => {
  const prByNum = new Map([[1, { base: { ref: DEPLOY }, closed_at: "2026-10-18T20:00:00Z" }]]);
  const runs = [
    { id: 1, path: CI_PATH, event: "pull_request", status: "completed", conclusion: "success", created_at: "2026-10-18T15:00:00Z", updated_at: "2026-10-18T15:12:00Z", pull_requests: [{ number: 1 }] },
    { id: 2, path: CI_PATH, event: "pull_request", status: "completed", conclusion: "success", created_at: "2026-10-18T15:30:00Z", updated_at: "2026-10-18T15:50:00Z", pull_requests: [{ number: 1 }] },
    { id: 3, path: CI_PATH, event: "pull_request", status: "completed", conclusion: "success", created_at: "2026-10-18T03:00:00Z", updated_at: "2026-10-18T03:40:00Z", pull_requests: [{ number: 1 }] },
  ];
  const jobsByRun = new Map([[1, []], [2, []], [3, []]]);
  const v = analyzePrCi({ runs, prByNum, jobsByRun });
  assert.equal(v.peakHourUtc, 15);
  assert.ok(v.peakHourMedianWallMin > 15 && v.peakHourMedianWallMin < 25);
});
