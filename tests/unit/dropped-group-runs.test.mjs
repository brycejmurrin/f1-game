// dropped-group-runs — a ready plan's dropped spec counts only when a same-head, same-base browser-group run ran it
// green on attempt 1 (#5480; Bryce 2026-11-11 "Count the separate run"). One case per refusal, and the accept case.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parse as parseYAML } from "yaml";
import {
  decide, droppedSpecs, groupRecordLine, parseGroupRecord, parseRunTitle, covers, passedSpecFiles, GROUP_RECORD_TITLE, GROUP_PLAN_TITLE, GROUP_WORKFLOW_PATH,
} from "../../tools/ci/dropped-group-runs.mjs";
import { runShardArgs, testedPair, prInput } from "../../tools/ci/remote-group.mjs";
import { selectedGateVerdict } from "../../tools/ci/selected-gate-verdict.mjs";
import { ciWorkflow } from "../helpers/ci-workflow.mjs";

const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);
const OLD = "c".repeat(40);
const UI = "tests/specs/ui-scale.spec.js";
const HOOKS = "tests/specs/new-hooks.spec.js";
const GROUPS = { ui: [UI, "tests/specs/audio-smoke.spec.js"], hooks: [HOOKS] };

// One green llvmpipe `ui` run on HEAD, attempt 1, PR merge ref on BASE, two shards that together ran ui-scale whole.
function world(over = {}) {
  const run = { id: 300, path: GROUP_WORKFLOW_PATH, event: "workflow_dispatch", head_sha: HEAD, status: "completed", conclusion: "success", run_attempt: 1, display_title: "browser group ui on cursor/x (llvmpipe)", ...over.run };
  const rec = (o = {}) => ({ head: HEAD, base: BASE, gl: "llvmpipe", flaky: true, group: "ui", ok: true, ...o });
  const jobs = over.jobs || [{ id: 1, name: "ui (1/2)", conclusion: "success" }, { id: 2, name: "ui (2/2)", conclusion: "success" }];
  // Each job: its plan record (what it would run, written before any spec) and its end record (what passed).
  const pair = (units, o = {}, p = {}) => [
    { title: GROUP_PLAN_TITLE, message: groupRecordLine(rec({ units, ...o, ...p })) },
    { title: GROUP_RECORD_TITLE, message: groupRecordLine(rec({ units, ...o })) },
  ];
  const u1 = over.rec1?.units || [UI], u2 = over.rec2?.units || ["tests/specs/audio-smoke.spec.js"];
  const notes = over.notes || {
    1: pair(u1, over.rec1, over.plan1),
    2: pair(u2, over.rec2, over.plan2),
  };
  return {
    dropped: [UI], count: "1", head: HEAD, base: BASE,
    runs: [run, ...(over.extraRuns || [])],
    groupSpecs: (g) => GROUPS[g] || null,
    jobsOf: (id) => (String(id) === String(run.id) ? jobs : (over.jobsOf ? over.jobsOf(id) : null)),
    annotationsOf: (jobId) => notes[jobId] || [],
    ...over.q,
  };
}

test("accept: every dropped spec ran green in a same-head, same-base llvmpipe group run on attempt 1, and the run is named", () => {
  const v = decide(world());
  assert.equal(v.accept, true, v.why);
  assert.deepEqual(v.runs, ["300"]);
  assert.match(v.why, /run\(s\) 300/);
});

test("accept: a fat spec covered by every piece j/k across shards", () => {
  const v = decide(world({ rec1: { units: [`${UI}#1/2`] }, rec2: { units: [`${UI}#2/2`] } }));
  assert.equal(v.accept, true, v.why);
  const half = decide(world({ rec1: { units: [`${UI}#1/3`] }, rec2: { units: [`${UI}#2/3`] } }));
  assert.equal(half.accept, false, "pieces 1/3 and 2/3 without 3/3 do not cover the file");
  assert.match(half.why, /no green same-head/);
});

test("refuse: no group run at all, or only one on another sha", () => {
  assert.equal(decide(world({ q: { runs: [] } })).accept, false);
  const v = decide(world({ run: { head_sha: OLD } }));
  assert.equal(v.accept, false);
  assert.match(v.why, /no green same-head/);
});

test("refuse: a re-run attempt (green only on attempt 2)", () => {
  const v = decide(world({ run: { run_attempt: 2 } }));
  assert.equal(v.accept, false);
  assert.match(v.why, /attempt 2/);
});

test("refuse: a failed or cancelled group run, and a still-running one", () => {
  for (const [status, conclusion] of [["completed", "failure"], ["completed", "cancelled"], ["in_progress", null], ["queued", null]]) {
    const v = decide(world({ run: { status, conclusion } }));
    assert.equal(v.accept, false, `${status}/${conclusion}`);
    assert.equal(v.live, status !== "completed", "only a queued or running group run is worth the bounded wait");
  }
});

test("refuse: a red group run of the spec beside a green one (a pass after a red is a retry, rule 9)", () => {
  const red = { id: 299, path: GROUP_WORKFLOW_PATH, event: "workflow_dispatch", head_sha: HEAD, status: "completed", conclusion: "failure", run_attempt: 1, display_title: "browser group ui on cursor/x (llvmpipe)" };
  const v = decide(world({ extraRuns: [red] }));
  assert.equal(v.accept, false);
  assert.match(v.why, /run 299 \(group ui\) is completed\/failure/);
  // A red run of a group that does NOT contain the spec does not taint it.
  const other = { ...red, display_title: "browser group hooks on cursor/x (llvmpipe)" };
  assert.equal(decide(world({ extraRuns: [other] })).accept, true);
});

test("refuse: a non-green run whose group cannot be read refuses every dropped spec", () => {
  const odd = { id: 298, path: GROUP_WORKFLOW_PATH, event: "workflow_dispatch", head_sha: HEAD, status: "completed", conclusion: "failure", run_attempt: 1, display_title: "something else" };
  assert.equal(decide(world({ extraRuns: [odd] })).accept, false);
});

test("refuse: a flaky (retried) pass — the record must say APEX_FAIL_ON_FLAKY was on", () => {
  const v = decide(world({ rec1: { units: [UI], flaky: false } }));
  assert.equal(v.accept, false);
  assert.match(v.why, /flaky=off/);
});

test("refuse: SwiftShader, not the default GL", () => {
  assert.equal(decide(world({ run: { display_title: "browser group ui on cursor/x (swiftshader)" } })).accept, false);
  assert.equal(decide(world({ rec1: { units: [UI], gl: "swiftshader" } })).accept, false);
});

test("refuse: another base (the deploy tip moved between the group run and this run), or a branch-head run", () => {
  const moved = decide(world({ rec1: { units: [UI], base: OLD } }));
  assert.equal(moved.accept, false);
  assert.match(moved.why, /tested base c{12}/);
  const branch = decide(world({ rec1: { units: [UI], base: "" } }));
  assert.equal(branch.accept, false);
  assert.match(branch.why, /branch head, not the PR merge ref/);
  assert.equal(decide(world({ rec1: { units: [UI], head: OLD } })).accept, false, "a record of another head");
  // Option 2 (orchestrator A, 2026-11-11): same base as THIS run is the rule; the live tip is not read here.
  assert.equal(decide(world({ q: { tip: OLD } })).accept, true, "a tip that moved after both runs is the gate's retest row, not this");
});

test("refuse: an unreadable or missing record, a failed shard record, a red job, unreadable jobs", () => {
  assert.equal(decide(world({ notes: { 1: [{ title: GROUP_RECORD_TITLE, message: "garbage" }], 2: [] } })).accept, false);
  assert.equal(decide(world({ notes: { 1: [] } })).accept, false);
  const endOnly = { title: GROUP_RECORD_TITLE, message: groupRecordLine({ head: HEAD, base: BASE, gl: "llvmpipe", flaky: true, group: "ui", ok: true, units: [UI] }) };
  const noPlan = decide(world({ notes: { 1: [endOnly], 2: [] }, jobs: [{ id: 1, name: "ui (1/1)", conclusion: "success" }] }));
  assert.equal(noPlan.accept, false, "an end record without the plan record written before the specs ran");
  assert.match(noPlan.why, /no readable apex-group-plan record/);
  assert.equal(decide(world({ rec1: { units: [UI], ok: false } })).accept, false);
  assert.equal(decide(world({ jobs: [{ id: 1, name: "ui (1/2)", conclusion: "failure" }] })).accept, false);
  assert.equal(decide(world({ q: { jobsOf: () => null } })).accept, false);
  assert.equal(decide(world({ q: { runs: null } })).accept, false, "a runs lookup failure");
});

test("refuse: a second record of either kind (a spec or helper printed one), an end claim outside the plan, a plan outside the group", () => {
  const rec = (o) => groupRecordLine({ head: HEAD, base: BASE, gl: "llvmpipe", flaky: true, group: "ui", ok: true, units: [UI], ...o });
  const one = [{ id: 1, name: "ui (1/1)", conclusion: "success" }];
  const twoEnd = decide(world({ jobs: one, notes: { 1: [{ title: GROUP_PLAN_TITLE, message: rec() }, { title: GROUP_RECORD_TITLE, message: rec() }, { title: GROUP_RECORD_TITLE, message: rec() }] } }));
  assert.equal(twoEnd.accept, false);
  assert.match(twoEnd.why, /2 apex-group and 1 apex-group-plan records/);
  const twoPlan = decide(world({ jobs: one, notes: { 1: [{ title: GROUP_PLAN_TITLE, message: rec() }, { title: GROUP_PLAN_TITLE, message: rec() }, { title: GROUP_RECORD_TITLE, message: rec() }] } }));
  assert.equal(twoPlan.accept, false);
  // The orchestrator's case: a run whose end annotation names a spec its plan did not contain.
  const claim = decide(world({ rec1: { units: [UI] }, plan1: { units: ["tests/specs/audio-smoke.spec.js"] } }));
  assert.equal(claim.accept, false);
  assert.match(claim.why, /claims tests\/specs\/ui-scale\.spec\.js, which its plan did not contain/);
  // Review S1's fixture: a green `hooks` run whose records claim ui-scale ran. ui-scale is not in test:hooks.
  const hooks = decide(world({
    run: { display_title: "browser group hooks on cursor/x (llvmpipe)" }, jobs: one,
    notes: { 1: [{ title: GROUP_PLAN_TITLE, message: rec({ group: "hooks" }) }, { title: GROUP_RECORD_TITLE, message: rec({ group: "hooks" }) }] },
  }));
  assert.equal(hooks.accept, false);
  assert.match(hooks.why, /test:hooks does not contain/);
});

test("junit is the evidence: a file passes with a passed case and no failure; skipped-only or failed files do not", () => {
  const xml = `<testsuite><testcase classname="specs/ui-scale.spec.js" name="a"/><testcase classname="specs/ui-scale.spec.js" name="b"></testcase>
<testcase classname="specs/new-hooks.spec.js" name="c"><skipped/></testcase>
<testcase classname="specs/audio-smoke.spec.js" name="d"/><testcase classname="specs/audio-smoke.spec.js" name="e"><system-out>x</system-out><failure message="m"/></testcase></testsuite>`;
  assert.deepEqual([...passedSpecFiles(xml)], [UI]);
  assert.deepEqual([...passedSpecFiles("")], []);
});

test("refuse: a run with no run_attempt is not read as attempt 1", () => {
  assert.equal(decide(world({ run: { run_attempt: undefined } })).accept, false);
});

test("refuse: a dropped spec the group run did not contain", () => {
  const v = decide(world({ q: { dropped: [UI, HOOKS], count: "2" } }));
  assert.equal(v.accept, false);
  assert.match(v.why, /covers tests\/specs\/new-hooks\.spec\.js/);
});

test("refuse: dropped names missing or not matching the plan's dropped count; bad shas", () => {
  assert.equal(decide(world({ q: { dropped: [] } })).accept, false);
  assert.equal(decide(world({ q: { count: "2" } })).accept, false);
  assert.equal(decide(world({ q: { count: "" } })).accept, false);
  assert.equal(decide(world({ q: { head: "" } })).accept, false);
  assert.equal(decide(world({ q: { base: "" } })).accept, false);
});

test("the record round-trips, and a malformed unit or field is unreadable", () => {
  const line = groupRecordLine({ head: HEAD, base: BASE, gl: "llvmpipe", flaky: true, group: "ui", ok: true, units: [UI, `${HOOKS}#2/3`] });
  assert.deepEqual(parseGroupRecord(line), { head: HEAD, base: BASE, gl: "llvmpipe", flaky: "fail", group: "ui", ok: true, units: [UI, `${HOOKS}#2/3`] });
  assert.equal(parseGroupRecord(line.replace(UI, "rm -rf /")), null);
  assert.equal(parseGroupRecord(line + " extra=1"), null);
  assert.deepEqual(parseRunTitle("browser group ui on claude/a-b (llvmpipe)"), { group: "ui", gl: "llvmpipe" });
  assert.equal(covers([UI], UI), true);
  assert.equal(covers([`${UI}#1/1`], UI), true);
});

test("droppedSpecs names the four drop lists, sorted and unique", () => {
  const sel = { overBudgetSpecs: [{ file: UI }], unreachable: [{ file: HOOKS }], skipped: [{ file: UI }], unreadable: [] };
  assert.deepEqual(droppedSpecs(sel), [HOOKS, UI]);
  assert.deepEqual(droppedSpecs(null), []);
});

test("the shard step records what it ran: plain units, pieces, and every file's i/n in count mode", () => {
  const scripts = { "test:ui": `node tools/ci/run-playwright.mjs ${UI} tests/specs/audio-smoke.spec.js` };
  const plan = JSON.stringify({ matrix: [{ shard: 1, total: 2 }, { shard: 2, total: 2 }], shards: [[UI, { file: "tests/specs/audio-smoke.spec.js", shard: "1/2" }], [{ file: "tests/specs/audio-smoke.spec.js", shard: "2/2" }]] });
  assert.deepEqual(runShardArgs({ group: "ui", plan, shard: 1, total: 2 }, scripts).units, [UI, "tests/specs/audio-smoke.spec.js#1/2"]);
  assert.deepEqual(runShardArgs({ group: "ui", plan: "", shard: 2, total: 4 }, scripts).units, ["tests/specs/audio-smoke.spec.js#2/4", `${UI}#2/4`]);
});

test("the tested pair comes from the merge commit's parents, only on a PR merge ref", () => {
  const cat = `tree ${"d".repeat(40)}\nparent ${BASE}\nparent ${HEAD}\nauthor x\n`;
  assert.deepEqual(testedPair(cat, true), { base: BASE, head: HEAD });
  assert.deepEqual(testedPair(`tree x\nparent ${BASE}\n`, true), { base: "", head: "" }, "a merge ref with one parent is unreadable");
  assert.equal(testedPair(cat, false), null, "a branch head (even a sync merge commit) is never read as a PR pair");
});

test("remote-group passes `pr` only for exactly one open PR on a branch whose browser-group.yml takes it", () => {
  const yml = fs.readFileSync(".github/workflows/browser-group.yml", "utf8");
  const one = { json: [{ number: 5341 }] };
  assert.equal(prInput("b", { get: () => one, show: () => yml }), "5341");
  assert.equal(prInput("b", { get: () => one, show: () => yml.replace(/\n {6}pr:\n[\s\S]*?type: string\n/, "\n") }), "", "an old workflow: no pr input");
  assert.equal(prInput("b", { get: () => ({ json: [] }), show: () => yml }), "");
  assert.equal(prInput("b", { get: () => ({ error: "HTTP 500" }), show: () => yml }), "");
});

test("selected verdict: an accepted group run turns a ready drop green and names the run; nothing else does", () => {
  const base = { select: "success", selected: "success", guards: "success", dropped: "1", draft: "false", called: "false" };
  const ok = selectedGateVerdict({ ...base, groupAccept: "true", groupRuns: "300,301" });
  assert.equal(ok.ok, true, ok.reason);
  assert.match(ok.reason, /browser-group run\(s\) 300, 301/);
  for (const g of [{}, { groupAccept: "false", groupWhy: "no green same-head run covers x" }, { groupAccept: "true", groupRuns: "" }, { groupAccept: "true", groupRuns: "300;x" }]) {
    const v = selectedGateVerdict({ ...base, ...g });
    assert.equal(v.ok, false, JSON.stringify(g));
    assert.match(v.reason, /What counts: every dropped spec green in ONE browser-group run per group on this head and this base, first attempt, default GL/);
    assert.match(v.reason, /node tools\/ci\/remote-group\.mjs <group>/);
    assert.match(v.reason, /flip the PR to draft and back to ready/);
  }
  assert.match(selectedGateVerdict({ ...base, groupAccept: "false", groupWhy: "why-text" }).reason, /no separate run counts: why-text/);
  assert.equal(selectedGateVerdict({ ...base, selected: "failure", groupAccept: "true", groupRuns: "300" }).ok, false, "a red leg is never cured by a group run");
  assert.equal(selectedGateVerdict({ ...base, dropped: "x", groupAccept: "true", groupRuns: "300" }).ok, false, "an unreadable count stays red");
});

test("ci.yml wires it: select names the drops, the verdict job asks only on a ready PR and can read runs and annotations", () => {
  const wf = parseYAML(ciWorkflow);
  const sel = wf.jobs.select;
  assert.match(sel.outputs.dropped_specs, /steps\.dropped_names\.outputs\.dropped_specs/);
  assert.ok(sel.steps.some((s) => s.id === "dropped_names" && /dropped-group-runs\.mjs --names/.test(s.run)));
  const v = wf.jobs["selected-verdict"];
  assert.deepEqual(v.permissions, { contents: "read", actions: "read", checks: "read" });
  const step = v.steps.find((s) => s.id === "group_runs");
  assert.ok(step, "the group-runs step");
  assert.match(step.if, /!github\.event\.pull_request\.draft/);
  assert.match(step.if, /needs\.select\.outputs\.dropped != '0'/);
  const verdictStep = v.steps.find((s) => s.name === "One answer for the change-aware gate");
  assert.match(verdictStep.env.GROUP_ACCEPT, /steps\.group_runs\.outputs\.accept/);
  assert.match(verdictStep.env.GROUP_RUNS, /steps\.group_runs\.outputs\.runs/);
  for (const s of v.steps.filter((x) => x.with?.["sparse-checkout"])) assert.match(s.with["sparse-checkout"], /tests\/specs/, "globbed groups need tests/specs");
  const bg = parseYAML(fs.readFileSync(".github/workflows/browser-group.yml", "utf8"));
  assert.equal(bg.on.workflow_dispatch.inputs.pr.default, "");
  const steps = bg.jobs.group.steps;
  assert.match(steps.find((s) => String(s.uses || "").startsWith("actions/checkout")).with.ref, /refs\/pull\/\{0\}\/merge/);
  for (const s of steps.filter((x) => /--run-shard/.test(x.run || ""))) assert.equal(s.env.APEX_FAIL_ON_FLAKY, 1);
});
