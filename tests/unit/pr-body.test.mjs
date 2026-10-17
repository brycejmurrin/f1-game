/* pr-body.test.mjs — the PR-body transforms behind tools/ci/pr-body.mjs (#2387).
 * Run: node --test tests/unit/pr-body.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planItems, tickItem, strikeItem, deferItem, nowItem, addItem, setStatus, setFleet, fleetEntries,
  applyEdits, parseEdits, main,
} from "../../tools/ci/pr-body.mjs";
import { planVerdict } from "../../tools/ci/ready-gate.mjs";

const BODY = `## Goal
Do it.

## Plan
<!-- example:
       - [x] done — sample
       - [ ] todo -->
- [ ] **now:** first step
- [ ] second step
- [x] third — sha

## Status
<!-- paste here -->
old status

## Next step / handoff
\`\`\`fleet
worker: claude:s1
state: planning   # note
orchestrator: claude:s0
\`\`\`
`;

test("planItems ignores items inside HTML comments and numbers in order", () => {
  const it = planItems(BODY);
  assert.equal(it.length, 3);
  assert.deepEqual(it.map((x) => x.mark), [" ", " ", "x"]);
});

test("tick appends evidence, drops **now:**, touches nothing else", () => {
  const out = tickItem(BODY, 1, "abc1234 = run passed");
  assert.match(out, /- \[x\] first step — abc1234 = run passed/);
  assert.equal(out.replace(/- \[x\] first step — abc1234 = run passed/, "- [ ] **now:** first step"), BODY);
  assert.throws(() => tickItem(BODY, 1, " "), /evidence/);
  assert.throws(() => tickItem(BODY, 9, "x"), /does not exist/);
});

test("strike keeps the item listed and closed; defer closes with [~]", () => {
  const s = strikeItem(BODY, 2, "covered by #5");
  assert.match(s, /- \[ \] ~~second step~~ — covered by #5/);
  assert.equal(planVerdict(s).open.length, 1);
  const d = deferItem(BODY, 2);
  assert.match(d, /- \[~\] second step/);
  assert.equal(planVerdict(d).open.length, 1);
  assert.throws(() => strikeItem(BODY, 2, ""), /why/);
});

test("now moves the single marker", () => {
  const out = nowItem(BODY, 2);
  assert.match(out, /- \[ \] first step/);
  assert.match(out, /- \[ \] \*\*now:\*\* second step/);
  assert.equal((out.match(/\*\*now:\*\*/g) || []).length, 1);
  assert.throws(() => nowItem(BODY, 3), /closed/);
});

test("add appends after the last item, inside Plan", () => {
  const out = addItem(BODY, "new work");
  assert.ok(out.indexOf("- [ ] new work") > out.indexOf("- [x] third"));
  assert.ok(out.indexOf("- [ ] new work") < out.indexOf("## Status"));
  assert.equal(planItems(out).length, 4);
});

test("status replaces the block, keeps the comment and other sections", () => {
  const out = setStatus(BODY, "branch x\nci: green\n");
  assert.match(out, /<!-- paste here -->\nbranch x\nci: green\n\n## Next step/);
  assert.ok(!out.includes("old status"));
  assert.match(out, /- \[ \] second step/);
});

test("fleet updates a key (keeping its comment) or adds one", () => {
  const a = setFleet(BODY, "state", "verifying");
  assert.match(a, /state: verifying   # note/);
  const b = setFleet(BODY, "checkin", "trig_1");
  assert.deepEqual(fleetEntries(b).find(([k]) => k === "checkin"), ["checkin", "trig_1"]);
  assert.match(setFleet("no fleet", "state", "x"), /```fleet\nstate: x\n```/);
  assert.throws(() => setFleet(BODY, "bad key", "x"), /word/);
});

test("applyEdits changes only the targeted item (a concurrent edit survives)", () => {
  const live = BODY.replace("- [ ] second step", "- [ ] second step\n- [ ] orchestrator added this");
  const out = applyEdits(live, { tick: [[1, "ok"]], strike: [], defer: [], add: [], fleet: [] });
  assert.match(out, /orchestrator added this/);
  assert.match(out, /- \[x\] first step — ok/);
});

test("parseEdits: pairing and unknown flags", () => {
  assert.throws(() => parseEdits(["--pr", "1", "--tick", "1"]), /--evidence/);
  assert.throws(() => parseEdits(["--pr", "1", "--tcik", "1"]), /unknown flag/);
  assert.throws(() => parseEdits(["--pr", "1", "--now", "x"]), /item number/);
  const o = parseEdits(["--pr", "7", "--tick", "2", "--evidence", "e", "--fleet", "state=done", "--label", "run-ci"]);
  assert.deepEqual([o.tick, o.fleet, o.label], [[[2, "e"]], [["state", "done"]], ["run-ci"]]);
});

test("main: re-reads the live body, PATCHes once, dry-run writes nothing, labels via POST", () => {
  const calls = [];
  const request = (m, p, payload) => { calls.push([m, p, payload]); return m === "GET" ? { json: { body: BODY } } : { json: {} }; };
  const out = [];
  assert.equal(main(["--pr", "3", "--tick", "1", "--evidence", "e", "--label", "run-ci"], { request, log: (s) => out.push(s) }), 0);
  assert.deepEqual(calls.map((c) => c[0] + " " + c[1]), ["GET pulls/3", "PATCH pulls/3", "POST issues/3/labels"]);
  assert.match(calls[1][2].body, /- \[x\] first step — e/);
  assert.deepEqual(calls[2][2], { labels: ["run-ci"] });
  calls.length = 0; out.length = 0;
  main(["--pr", "3", "--now", "2", "--dry-run"], { request, log: (s) => out.push(s) });
  assert.deepEqual(calls.map((c) => c[0]), ["GET"]);
  assert.match(out[0], /\*\*now:\*\* second step/);
  assert.equal(main(["--pr", "3", "--add", "x"], { request: () => ({ error: "no token", noToken: true }), log() {} }), 3);
});
