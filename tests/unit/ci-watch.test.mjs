/* ci-watch.test.mjs — the CI watcher's verdict is the one AGENTS.md rule 8 asks
 * for, and every job result becomes exactly one event.
 *
 * The watcher is what an agent trusts instead of waiting, so the failure modes
 * that matter are: the designed push/PR dedupe (a push run the PR run cancelled
 * on the same SHA) read as a red; a finished-but-failed run read as "running"
 * or green; and a job reported twice (Monitor turns every line into a message).
 *
 * Run: node --test tests/unit/ci-watch.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { latestPerWorkflow, verdict, newJobEvents, wantsAnnotations } from "../../tools/ci/ci-watch.mjs";

const run = (id, name, status, conclusion, created) => ({ id, name, status, conclusion, created_at: created });
const job = (id, name, status, conclusion, steps = []) => ({ id, name, status, conclusion, steps, html_url: `u/${id}` });

test("the newest run per workflow wins, so a superseded push run is not a red", () => {
  const runs = latestPerWorkflow([
    run(1, "CI", "completed", "cancelled", "2026-09-24T00:00:00Z"),   // push run, cancelled by the PR run
    run(2, "CI", "completed", "success", "2026-09-24T00:00:05Z"),
  ]);
  assert.deepEqual(runs.map((r) => r.id), [2], "only the newest CI run counts");
  assert.equal(verdict(runs, { 2: [job(9, "guards", "completed", "success")] }).state, "passed");
});

test("verdict: failed as soon as a job fails, done only when every run completed", () => {
  const live = [run(1, "CI", "in_progress", null, "t")];
  const v = verdict(live, { 1: [job(1, "a", "completed", "failure"), job(2, "b", "in_progress", null)] });
  assert.equal(v.state, "failed", "a failed job is a red before the run ends");
  assert.equal(v.done, false, "…but the watcher keeps reporting the remaining jobs");
  const done = [run(1, "CI", "completed", "failure", "t")];
  assert.equal(verdict(done, { 1: [job(1, "a", "completed", "failure")] }).done, true);
  assert.equal(verdict([], {}).state, "none", "no run yet is not green");
  const cancelled = verdict([run(1, "CI", "completed", "cancelled", "t")], { 1: [job(1, "a", "completed", "cancelled")] });
  assert.equal(cancelled.state, "cancelled", "a cancelled run with no newer sibling is surfaced, not passed");
  assert.equal(verdict([run(1, "CI", "completed", "failure", "t")], { 1: [job(1, "a", "completed", "success")] }).state, "failed",
    "a run that concluded failure with no failed job (setup error) is still a red");
});

test("each finished job is one event; skipped jobs are silent; a red names its step and URL", () => {
  const seen = new Set();
  const jobs = [
    job(1, "Smoke (1)", "completed", "success"),
    job(2, "Smoke (2)", "completed", "failure", [{ name: "checkout", conclusion: "success" }, { name: "Run smoke shard", conclusion: "failure" }]),
    job(3, "GPU", "completed", "skipped"),
    job(4, "Sweeps", "in_progress", null),
  ];
  const first = newJobEvents(jobs, seen, "CI");
  assert.deepEqual(first.map((e) => e.line), [
    "CI › Smoke (1) → success",
    'CI › Smoke (2) → failure — step "Run smoke shard" u/2',
  ]);
  assert.equal(newJobEvents(jobs, seen, "CI").length, 0, "a job already reported is never reported again");
  jobs[3] = job(4, "Sweeps", "completed", "success");
  assert.deepEqual(newJobEvents(jobs, seen, "CI").map((e) => e.line), ["CI › Sweeps → success"]);
});

test("only a failed or timed-out job gets its annotations printed", () => {
  // A cancelled job's annotation is the designed push/PR dedupe ("higher
  // priority waiting request"); printed, every one became a Monitor event.
  assert.equal(wantsAnnotations(job(1, "a", "completed", "failure")), true);
  assert.equal(wantsAnnotations(job(2, "a", "completed", "timed_out")), true);
  assert.equal(wantsAnnotations(job(3, "a", "completed", "cancelled")), false);
  assert.equal(wantsAnnotations(job(4, "a", "completed", "success")), false);
});
