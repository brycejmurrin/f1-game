/* handback.test.mjs — tools/ci/handback.mjs and tools/ci/post-merge.mjs (#2397).
 * Run: node --test tests/unit/handback.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { handbackPlan, main as handback } from "../../tools/ci/handback.mjs";
import { mergeVerdict, main as postMerge } from "../../tools/ci/post-merge.mjs";

const BODY = "## Plan\n- [x] a — s\n\n```fleet\norchestrator: claude:session_0\ncheckin: trig_1, trig_2\n```\n";
const SHA = "a".repeat(40);
const green = { code: 0, state: "passed", evidence: "Structural guards success" };

test("handbackPlan: green prints SWEEP + DONE and the check-ins", () => {
  const p = handbackPlan({ pr: 12, sha: SHA, ci: "passed", gate: green, body: BODY });
  assert.equal(p.sweep, "SWEEP 12");
  assert.match(p.done, /^DONE #12 head aaaaaaa/);
  assert.deepEqual(p.checkins, ["trig_1", "trig_2"]);
  assert.equal(p.parent, "claude:session_0");
});

test("handbackPlan: red CI or an open gate prints no SWEEP", () => {
  const a = handbackPlan({ pr: 1, sha: SHA, ci: "failed", gate: green, body: BODY });
  assert.equal(a.sweep, null);
  assert.match(a.why[0], /ci failed/);
  const b = handbackPlan({ pr: 1, sha: SHA, ci: "passed", gate: { code: 1, state: "plan-open", evidence: "1 open" }, body: BODY });
  assert.equal(b.ready, false);
});

test("handback main: exactly one SWEEP line, exit 1 when not ready, unknown flag rejected", () => {
  const out = [];
  const deps = (ci) => ({ resolve: () => ({ sha: SHA, body: BODY }), gateFor: () => green, ci: () => ci, log: (s) => out.push(s) });
  assert.equal(handback(["--pr", "12"], deps("passed")), 0);
  assert.equal(out.filter((l) => /^SWEEP /.test(l)).length, 1);
  assert.ok(out.includes("delete_trigger trig_1"));
  out.length = 0;
  assert.equal(handback(["--pr", "12"], deps("running")), 1);
  assert.ok(!out.some((l) => /^SWEEP /.test(l)));
  assert.throws(() => handback(["--pr", "12", "--sned"], deps("passed")), /unknown flag/);
});

test("mergeVerdict: two parents ok, one is SQUASH, open PR is not merged", () => {
  assert.equal(mergeVerdict({ merged: true, merge_commit_sha: SHA }, { parents: [{}, {}] }).evidence, "merge ok (2 parents)");
  const s = mergeVerdict({ merged: true, merge_commit_sha: SHA }, { parents: [{}] });
  assert.equal(s.ok, false);
  assert.match(s.evidence, /^SQUASH/);
  assert.equal(mergeVerdict({ merged: false, state: "open" }, null).state, "not-merged");
});

test("post-merge main: verdict, release, check-ins", () => {
  const out = [], ran = [];
  const request = (m, p) => p.startsWith("pulls/")
    ? { json: { merged: true, merge_commit_sha: SHA, body: BODY } } : { json: { parents: [{}, {}] } };
  const run = (cmd, args) => { ran.push(args.join(" ")); return { status: 0, stdout: "", stderr: "" }; };
  assert.equal(postMerge(["12"], { request, run, log: (s) => out.push(s) }), 0);
  assert.match(out[0], /merge ok \(2 parents\)/);
  assert.deepEqual(ran, ["tools/ci/who-is-on-it.mjs --release"]);
  assert.ok(out.includes("delete_trigger trig_2"));
  const sq = postMerge(["12", "--no-release"], { request: (m, p) => p.startsWith("pulls/") ? { json: { merged: true, merge_commit_sha: SHA, body: "" } } : { json: { parents: [{}] } }, run, log() {} });
  assert.equal(sq, 1);
  assert.equal(ran.length, 1);
});
