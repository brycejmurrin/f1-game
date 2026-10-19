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

// One fixture per filter branch in analyzePrCi (measure-pr-ci-after-close.mjs): each case is a lone run that the
// filter must drop from the peak-hour sample, so a missing/inverted filter flips peakHourUtc from null.
const wallRun = (over) => ({
  id: 1, path: CI_PATH, event: "pull_request", status: "completed", conclusion: "success",
  created_at: "2026-10-18T15:00:00Z", updated_at: "2026-10-18T15:12:00Z", pull_requests: [{ number: 1 }], ...over,
});
const deployPr = new Map([[1, { base: { ref: DEPLOY }, closed_at: "2026-10-18T20:00:00Z" }]]);
const peakOf = (runs, prByNum = deployPr) => analyzePrCi({ runs, prByNum, jobsByRun: new Map() });

test("analyzePrCi: a lone qualifying run is the peak (control for the filter cases)", () => {
  const v = peakOf([wallRun({})]);
  assert.equal(v.peakHourUtc, 15);
  assert.ok(Math.abs(v.peakHourMedianWallMin - 12) < 0.01);
});

for (const conclusion of ["cancelled", "skipped", "stale"]) {
  test(`analyzePrCi: a ${conclusion} run adds no wall sample`, () => {
    const v = peakOf([wallRun({ conclusion })]);
    assert.equal(v.peakHourUtc, null);
    assert.equal(v.peakHourMedianWallMin, null);
  });
}

test("analyzePrCi: an unfinished run (no conclusion) adds no wall sample", () => {
  assert.equal(peakOf([wallRun({ status: "in_progress", conclusion: null })]).peakHourUtc, null);
});

test("analyzePrCi: a run under 3 minutes of wall time is excluded; exactly 3 counts", () => {
  assert.equal(peakOf([wallRun({ updated_at: "2026-10-18T15:02:59Z" })]).peakHourUtc, null);
  assert.equal(peakOf([wallRun({ updated_at: "2026-10-18T15:03:00Z" })]).peakHourUtc, 15);
});

test("analyzePrCi: a PR whose base is not the deploy branch is skipped, jobs included", () => {
  const other = new Map([[1, { base: { ref: "feature/x" }, closed_at: "2026-10-18T10:00:00Z" }]]);
  const jobs = new Map([[1, [{ started_at: "2026-10-18T15:00:00Z", completed_at: "2026-10-18T15:10:00Z", status: "completed" }]]]);
  const v = analyzePrCi({ runs: [wallRun({})], prByNum: other, jobsByRun: jobs });
  assert.equal(v.totalJobs, 0);
  assert.equal(v.peakHourUtc, null);
  assert.equal(analyzePrCi({ runs: [wallRun({})], prByNum: new Map(), jobsByRun: jobs }).totalJobs, 0, "unknown PR is skipped too");
});

test("analyzePrCi: non-CI workflows and non-pull_request events are skipped", () => {
  assert.equal(peakOf([wallRun({ path: ".github/workflows/pages.yml" })]).peakHourUtc, null);
  assert.equal(peakOf([wallRun({ event: "push" })]).peakHourUtc, null);
});
