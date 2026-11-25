// reuse-draft-selected — the ready flip reuses the same-sha draft's selected verdict only when that proves what a re-run would (#5426).
import test from "node:test";
import assert from "node:assert/strict";
import { parse as parseYAML } from "yaml";
import { decide, planKey, droppedCount, recordLine, parseRecord, parseGuardsRecord, trainCars, RECORD_TITLE, TRAIN_MARK, MAX_CANDIDATES } from "../../tools/ci/reuse-draft-selected.mjs";
import { TRAIN_MARK as WRITER_MARK } from "../../tools/ci/merge-train.mjs";
import { selectedGateVerdict } from "../../tools/ci/selected-gate-verdict.mjs";
import { verdict } from "../../tools/ci/ci-verdict.mjs";
import { ciWorkflow } from "../helpers/ci-workflow.mjs";

const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);
const MOVED = "c".repeat(40);
const TREE = "f".repeat(40);
const OTHER_TREE = "e".repeat(40);
const sel = { shards: [{ specs: "tests/specs/audit.spec.js tests/specs/smoke.spec.js", circuits: "" }, { specs: "tests/specs/cota-foundation.spec.js", circuits: "monza" }], circuits: [] };
const KEY = planKey(sel);

// One green draft run on HEAD (attempt 1), merged on BASE, that ran the same plan with nothing dropped.
function world(over = {}) {
  const run = { id: 100, path: ".github/workflows/ci.yml", event: "pull_request", head_sha: HEAD, status: "completed", conclusion: "success", run_attempt: 1, created_at: "2026-11-11T01:00:00Z", ...over.run };
  const jobs = over.jobs || [
    { id: 1, name: "Structural guards (tooling A)", conclusion: "success" },
    { id: 2, name: "Select specs for this change", conclusion: "success" },
    { id: 3, name: "Selected specs (change-aware gate) (selected-1, …)", conclusion: "success" },
    { id: 4, name: "Selected specs (change-aware gate) (oversize-1, …)", conclusion: "success" },
    { id: 5, name: "Selected specs (verdict)", conclusion: "success" },
  ];
  const notes = {
    1: [{ title: "apex-guards", message: `mode=full base=${over.guardsBase || BASE}${over.guardsTree === null ? "" : ` tree=${over.guardsTree || TREE}`}` }],
    2: [{ title: RECORD_TITLE, message: recordLine({ key: over.draftKey || KEY, dropped: over.draftDropped ?? 0, base: over.planBase || BASE }) }],
  };
  return {
    action: "ready_for_review", head: HEAD, base: BASE, tree: TREE, tip: BASE, key: KEY, dropped: 0, self: "200", hasLegs: true,
    runs: [{ id: 200, path: ".github/workflows/ci.yml", event: "pull_request", head_sha: HEAD, status: "in_progress", created_at: "2026-11-11T02:00:00Z" }, run, ...(over.extraRuns || [])],
    jobsOf: (id) => (String(id) === String(run.id) ? jobs : (over.jobsById || {})[id] || null),
    annotationsOf: (jobId) => notes[jobId] || (over.notesById || {})[jobId] || [],
    ...over.q,
  };
}

test("a flip with a green same-sha draft run and an unmoved tip reuses it: no selected leg starts", () => {
  const v = decide(world());
  assert.equal(v.reuse, true, v.why);
  assert.equal(v.run, "100");
});

test("a flip after a new push (another head, another tree) runs everything", () => {
  const v = decide(world({ run: { head_sha: "d".repeat(40) }, guardsTree: OTHER_TREE }));
  assert.equal(v.reuse, false);
  assert.match(v.why, /no other green ci\.yml pull_request run tested/);
});

test("a red, cancelled or still-running draft run runs everything", () => {
  for (const [status, conclusion] of [["completed", "failure"], ["completed", "cancelled"], ["in_progress", null]]) {
    const v = decide(world({ run: { status, conclusion } }));
    assert.equal(v.reuse, false, `${status}/${conclusion}`);
  }
});

test("an older green run does not count when a newer run on the same sha is red", () => {
  const newerRed = { id: 150, path: ".github/workflows/ci.yml", event: "pull_request", head_sha: HEAD, status: "completed", conclusion: "failure", run_attempt: 1, created_at: "2026-11-11T01:30:00Z" };
  const v = decide(world({ extraRuns: [newerRed] }));
  assert.equal(v.reuse, false);
  assert.match(v.why, /150/);
});

test("a draft run that went green only on a re-run (attempt > 1) runs everything", () => {
  const v = decide(world({ run: { run_attempt: 2 } }));
  assert.equal(v.reuse, false);
  assert.match(v.why, /attempt 2/);
});

test("a moved deploy tip runs everything, even on the same merge ref (#5340: a flip does not rebuild it; #5407)", () => {
  const v = decide(world({ q: { tip: MOVED } }));
  assert.equal(v.reuse, false);
  assert.match(v.why, /deploy tip moved/);
  assert.equal(decide(world({ q: { tip: "" } })).reuse, false, "an unreadable tip is not reuse");
});

test("a different base, plan, drop or a failed leg runs everything", () => {
  assert.equal(decide(world({ guardsBase: MOVED })).reuse, false, "draft guards on another base");
  assert.equal(decide(world({ planBase: MOVED })).reuse, false, "draft plan on another base");
  assert.equal(decide(world({ draftKey: "e".repeat(64) })).reuse, false, "a different spec plan");
  assert.equal(decide(world({ draftDropped: 2 })).reuse, false, "a draft that dropped specs only warned");
  assert.equal(decide(world({ q: { dropped: 1 } })).reuse, false, "this plan drops a spec");
  const jobs = world().jobsOf("100").map((j) => (j.id === 4 ? { ...j, conclusion: "failure" } : j));
  assert.equal(decide(world({ jobs })).reuse, false, "a red leg (the run's other jobs passed)");
  const noLegs = world().jobsOf("100").filter((j) => !/change-aware gate/.test(j.name));
  assert.equal(decide(world({ jobs: noLegs })).reuse, false, "a run whose own legs were reused is not chained onto");
  const noVerdict = world().jobsOf("100").filter((j) => j.name !== "Selected specs (verdict)");
  assert.equal(decide(world({ jobs: noVerdict })).reuse, false, "no verdict job");
  assert.equal(decide(world({ q: { jobsOf: () => null } })).reuse, false, "a failed jobs lookup");
  assert.equal(decide(world({ q: { action: "labeled" } })).reuse, false, "a label event is not a reuse event");
  assert.equal(decide(world({ q: { tree: "" } })).reuse, false, "an unknown merge tree");
  assert.equal(decide(world({ guardsTree: OTHER_TREE })).reuse, false, "the same head on another tree");
});

test("the plan key is the specs and circuit filters, not the shard layout or budget", () => {
  const relaid = { shards: [{ specs: "tests/specs/smoke.spec.js", circuits: "" }, { specs: "tests/specs/audit.spec.js", circuits: "", shard: "1/2" }, { specs: "tests/specs/audit.spec.js", circuits: "", shard: "2/2" }, { specs: "tests/specs/cota-foundation.spec.js", circuits: "monza" }], circuits: [] };
  assert.equal(planKey(relaid), KEY);
  assert.notEqual(planKey({ ...sel, shards: [...sel.shards, { specs: "tests/specs/tracks-walls.spec.js" }] }), KEY);
  assert.notEqual(planKey({ ...sel, shards: [sel.shards[0], { ...sel.shards[1], circuits: "spa" }] }), KEY);
  assert.equal(droppedCount({ skipped: [1], unreachable: [1, 2], overBudgetSpecs: [], unreadable: [] }), 3);
  assert.deepEqual(parseRecord(recordLine({ key: KEY, dropped: 0, base: BASE })), { key: KEY, dropped: 0, base: BASE });
});

test("selected-verdict passes a reused skip only on a ready PR that names the run", () => {
  const ready = { select: "success", selected: "skipped", guards: "success", dropped: "0", called: "false", draft: "false", failedSpecs: [], reused: "true", reusedRun: "100" };
  const v = selectedGateVerdict(ready);
  assert.equal(v.ok, true);
  assert.match(v.reason, /reused from run 100/);
  assert.equal(selectedGateVerdict({ ...ready, reusedRun: "" }).ok, false, "no run id");
  assert.equal(selectedGateVerdict({ ...ready, draft: "true" }).ok, false, "a draft cannot claim a reuse");
  assert.equal(selectedGateVerdict({ ...ready, dropped: "1" }).ok, false, "a drop still reds");
});

test("ci-verdict accepts a skipped matrix with legs only when select names the reused run", () => {
  const needs = (outputs) => ({ guards: { result: "success" }, select: { result: "success", outputs: { any: "true", ...outputs } },
    selected: { result: "skipped" }, "selected-verdict": { result: "success" } });
  assert.equal(verdict(needs({ selected_reused: "true", selected_reused_run: "100" }), { fullTier: true }).ok, true);
  assert.equal(verdict(needs({}), { fullTier: true }).ok, false);
  assert.equal(verdict(needs({ selected_reused: "true", selected_reused_run: "" }), { fullTier: true }).ok, false);
});

test("ci.yml wiring: select asks on non-draft PR runs, the legs skip on a reuse, the verdict is required", () => {
  const jobs = parseYAML(ciWorkflow).jobs;
  const step = jobs.select.steps.find((s) => s.id === "reuse_selected");
  assert.ok(step && /reuse-draft-selected\.mjs/.test(step.run));
  for (const a of ["ready_for_review", "synchronize", "opened", "reopened"]) assert.match(step.if, new RegExp(`"${a}"`));
  assert.match(step.if, /!github\.event\.pull_request\.draft/, "a draft never reuses (selected-verdict reds it)");
  assert.match(step.env.PR_HEAD_REF, /pull_request\.head\.ref/, "the PR's branch is a candidate source (b)");
  assert.match(step.if, /inputs\.concurrency_key == ''/, "the train never reuses a PR's legs");
  assert.ok(jobs.select.steps.some((s) => /reuse-draft-selected\.mjs --record/.test(s.run || "")), "every run records its plan");
  assert.equal(jobs.select.permissions.checks, "read");
  assert.match(jobs.selected.if, /needs\.select\.outputs\.selected_reused != 'true'/);
  const env = jobs["selected-verdict"].steps.find((s) => s.name === "One answer for the change-aware gate").env;
  assert.match(env.REUSED, /selected_reused/);
  assert.match(env.REUSED_RUN, /selected_reused_run/);
  const req = jobs["ci-verdict"].steps.find((s) => s.name === "Aggregate job results").env.REQUIRE_SUCCESS;
  assert.match(req, /'[^']*\bselected-verdict\b[^']*'/, "#5403 part 1: the full tier requires the verdict job it may reuse");
});

// #6557 P1: tooling A's record gained `tree=`; a record from before it still parses, with tree "none".
test("parseGuardsRecord reads the record with and without tree=", () => {
  const b = "a".repeat(40), t = "b".repeat(40);
  assert.deepEqual(parseGuardsRecord(`mode=full base=${b} tree=${t}`), { mode: "full", base: b, tree: t });
  assert.deepEqual(parseGuardsRecord(`mode=changed base=${b}`), { mode: "changed", base: b, tree: "none" });
  assert.equal(parseGuardsRecord(`mode=full base=${b} tree=xyz`), null, "a malformed tree is no record");
});

// #6585: the tree is the key. Another head whose run recorded this base and this merge tree is the same bytes.
const otherRun = (id, over = {}) => ({ id, path: ".github/workflows/ci.yml", event: "pull_request", head_sha: "d".repeat(40), status: "completed", conclusion: "success", run_attempt: 1, created_at: "2026-11-11T01:45:00Z", ...over });
const otherJobs = (id, conclusion = "success") => [{ id: id * 10 + 1, name: "Structural guards (tooling A)", conclusion }];
const otherNotes = (id, tree = TREE, base = BASE) => ({ [id * 10 + 1]: [{ title: "apex-guards", message: `mode=full base=${base} tree=${tree}` }] });

test("(b) a sync push whose merge tree equals a passed merge ref reuses that run", () => {
  const v = decide(world({ run: { head_sha: "d".repeat(40) }, q: { action: "synchronize" } }));
  assert.equal(v.reuse, true, v.why);
  assert.equal(v.run, "100");
  assert.match(v.why, /same tree/);
  assert.equal(decide(world({ run: { head_sha: "d".repeat(40) }, guardsTree: OTHER_TREE, q: { action: "synchronize" } })).reuse, false, "another tree");
  assert.equal(decide(world({ run: { head_sha: "d".repeat(40) }, guardsTree: null, q: { action: "synchronize" } })).reuse, false, "a tree-less record counts only on the same head");
  assert.equal(decide(world({ guardsTree: null })).reuse, true, "a tree-less record on the same head and base is the pre-#6585 rule");
  assert.equal(decide(world({ run: { head_sha: "d".repeat(40) }, guardsBase: MOVED, q: { action: "synchronize" } })).reuse, false, "same tree on another base");
});

test("(c) a train run reuses its car's passed run on the same base and tree", () => {
  const car = "9".repeat(40);
  const v = decide(world({ run: { head_sha: car }, q: { action: "opened", head: "8".repeat(40) } }));
  assert.equal(v.reuse, true, v.why);
  const body = `train\n<!-- merge-train {"base":"${BASE}","cars":[{"pr":7,"head":"${car}","ref":"claude/x"},{"pr":8,"head":"nope"}]} -->`;
  assert.deepEqual(trainCars(body), [{ head: car, ref: "claude/x" }]);
  assert.deepEqual(trainCars("no manifest"), []);
  assert.deepEqual(trainCars("<!-- merge-train {bad json} -->"), []);
  assert.equal(String(TRAIN_MARK), String(WRITER_MARK), "the reader's manifest pattern is merge-train.mjs's");
});

test("the veto: any other run on the same base and tree that is red, re-run, running or unreadable blocks reuse", () => {
  // A newer red on another head with the same tree: a red on these bytes.
  const red = otherRun(150, { conclusion: "failure" });
  let v = decide(world({ extraRuns: [red], jobsById: { 150: otherJobs(150, "failure") }, notesById: otherNotes(150) }));
  assert.equal(v.reuse, false); assert.match(v.why, /150 tested this base and tree/);
  // An OLDER red on the same tree vetoes too: the green after it needed another try.
  v = decide(world({ extraRuns: [{ ...red, created_at: "2026-11-11T00:30:00Z" }], jobsById: { 150: otherJobs(150, "failure") }, notesById: otherNotes(150) }));
  assert.equal(v.reuse, false, "an older red on the same tree");
  // A red on ANOTHER tree is somebody else's bytes.
  v = decide(world({ extraRuns: [red], jobsById: { 150: otherJobs(150, "failure") }, notesById: otherNotes(150, OTHER_TREE) }));
  assert.equal(v.reuse, true, v.why);
  // A cancelled run with no failed job is superseded, not a red; with a timed-out job it is a red.
  const cancelled = otherRun(150, { conclusion: "cancelled" });
  assert.equal(decide(world({ extraRuns: [cancelled], jobsById: { 150: otherJobs(150, "cancelled") }, notesById: otherNotes(150) })).reuse, true);
  assert.equal(decide(world({ extraRuns: [cancelled], jobsById: { 150: [...otherJobs(150, "success"), { id: 9, name: "Smoke (1)", conclusion: "timed_out" }] }, notesById: otherNotes(150) })).reuse, false);
  // A green on the same tree on attempt 2.
  assert.equal(decide(world({ extraRuns: [otherRun(150, { run_attempt: 2 })], jobsById: { 150: otherJobs(150) }, notesById: otherNotes(150) })).reuse, false);
  // A still-running run on this head, or a run whose jobs cannot be read.
  assert.equal(decide(world({ extraRuns: [otherRun(150, { head_sha: HEAD, status: "in_progress", conclusion: null })] })).reuse, false);
  assert.equal(decide(world({ extraRuns: [otherRun(150)] })).reuse, false, "an unreadable candidate could hide a red");
  // A red on this head with no record (setup died before tooling A recorded) cannot be placed: no reuse.
  assert.equal(decide(world({ extraRuns: [otherRun(150, { head_sha: HEAD, conclusion: "failure" })], jobsById: { 150: [] } })).reuse, false);
  // ...on another head too, and a tree-less (pre-2026-11-25) red record on this base.
  assert.equal(decide(world({ extraRuns: [otherRun(150, { conclusion: "failure" })], jobsById: { 150: [] } })).reuse, false);
  assert.equal(decide(world({ extraRuns: [otherRun(150, { conclusion: "failure" })], jobsById: { 150: otherJobs(150) },
    notesById: { 1501: [{ title: "apex-guards", message: `mode=full base=${BASE}` }] } })).reuse, false);
  // A tree-less red on ANOTHER base is not these bytes.
  assert.equal(decide(world({ extraRuns: [otherRun(150, { conclusion: "failure" })], jobsById: { 150: otherJobs(150) },
    notesById: { 1501: [{ title: "apex-guards", message: `mode=full base=${MOVED}` }] } })).reuse, true);
  // A run on another head testing this tree right now; one in flight on another tree does not matter.
  assert.equal(decide(world({ extraRuns: [otherRun(150, { status: "in_progress", conclusion: null })], jobsById: { 150: otherJobs(150, null) }, notesById: otherNotes(150) })).reuse, false);
  assert.equal(decide(world({ extraRuns: [otherRun(150, { status: "queued", conclusion: null })] })).reuse, true, "queued elsewhere, no jobs yet");
  // Too many runs to clear.
  const many = Array.from({ length: MAX_CANDIDATES }, (_, i) => otherRun(1000 + i));
  assert.equal(decide(world({ extraRuns: many })).reuse, false);
});
