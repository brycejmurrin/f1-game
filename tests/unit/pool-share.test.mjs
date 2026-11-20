// Guards tools/ci/pool-share.mjs (#5848): the runner-pool census's pure parts. No network.
// Run: node --test tests/unit/pool-share.test.mjs   (npm run test:tooling-fast)
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import { test } from "node:test";
import assert from "node:assert/strict";
import { classOf, quantile, normJobs, heldAt, report } from "../../tools/ci/pool-share.mjs";

const T0 = Date.parse("2026-11-19T08:00:00Z");
const at = (min) => new Date(T0 + min * 60000).toISOString();

test("classOf: workflows by path, ci.yml split into selected legs and the rest", () => {
  assert.equal(classOf(".github/workflows/ci.yml", "Selected specs (change-aware gate) (3)"), "ci:selected");
  assert.equal(classOf(".github/workflows/ci.yml", "Structural guards"), "ci:other");
  assert.equal(classOf(".github/workflows/land.yml", "resolve"), "land");
  assert.equal(classOf(".github/workflows/browser-group.yml", "ui (1/4)"), "browser-group");
  assert.equal(classOf(".github/workflows/dispatch.yml", "x"), "other");
});

test("quantile: nearest rank, null on empty", () => {
  assert.equal(quantile([], 0.5), null);
  assert.equal(quantile([3, 1, 2], 0.5), 2);
  assert.equal(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9);
  assert.equal(quantile([5, 1], 1), 5);
});

test("normJobs: a skipped job holds no runner; OS from labels", () => {
  const run = { path: ".github/workflows/land.yml", created_at: at(0) };
  const [a, b, w, c] = normJobs(run, [
    { name: "resolve", labels: ["ubuntu-latest"], created_at: at(0), started_at: at(5), completed_at: at(6), conclusion: "success", runner_name: "GitHub Actions 1" },
    { name: "train", labels: ["ubuntu-latest"], created_at: at(0), started_at: at(0), completed_at: at(0), conclusion: "skipped", runner_name: "" },
    { name: "lane-wait", labels: ["ubuntu-latest"], created_at: at(0), started_at: at(0), completed_at: at(40), conclusion: "cancelled", runner_name: "" },
    { name: "mac", labels: ["macos-15"], created_at: at(0), started_at: at(1), completed_at: at(2), conclusion: "success", runner_name: "r" },
  ]);
  assert.equal(a.started, T0 + 5 * 60000);
  assert.equal(b.started, null, "a skipped job never ran");
  assert.equal(w.started, null, "a job cancelled while pending in a lane held no runner");
  assert.equal(c.os, "macos");
});

test("heldAt / report: land waits counted against the browser-group runners held when they queued", () => {
  const bg = { path: ".github/workflows/browser-group.yml", created_at: at(0) };
  const land = { path: ".github/workflows/land.yml", created_at: at(0) };
  const legs = Array.from({ length: 12 }, (_, i) => ({ name: `ui (${i + 1}/12)`, labels: ["ubuntu-latest"], created_at: at(0),
    started_at: at(0), completed_at: at(30), conclusion: "success", runner_name: `r${i}` }));
  const jobs = [
    ...normJobs(bg, legs),
    ...normJobs(land, [{ name: "resolve", labels: ["ubuntu-latest"], created_at: at(10), started_at: at(14), completed_at: at(15), conclusion: "success", runner_name: "x" }]),
    ...normJobs(land, [{ name: "resolve", labels: ["ubuntu-latest"], created_at: at(40), started_at: at(40), completed_at: at(41), conclusion: "success", runner_name: "y" }]),
  ];
  assert.equal(heldAt(jobs, T0 + 60000)["browser-group"], 12);
  const r = report(jobs, { cap: 8 });
  assert.equal(r.peaks.browserGroup, 12);
  assert.equal(r.land.n, 2);
  assert.equal(r.land.slow, 1, "one land job waited > 60 s");
  assert.equal(r.counterfactual.slowWhileOverCap, 1, "…and it queued while browser-group held 12 > 8");
  assert.equal(r.counterfactual.slotsFreedMedian, 4);
  assert.equal(r.linuxJobMin["browser-group"], 360);
});
