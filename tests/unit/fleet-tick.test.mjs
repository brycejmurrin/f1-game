/* fleet-tick.test.mjs — tools/ci/fleet-tick.mjs: row compaction, state diff and rendering, no network. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rowOf, diffState, render, verdictOf, MAX_ROWS } from "../../tools/ci/fleet-tick.mjs";

const board = (o = {}) => ({ number: 7, draft: true, sha: "abc1234def5678", ci: "success", mergeableState: "clean", suggest: "WAIT", hold: false, gate: "passed", plan: { state: "open", items: 4, open: ["x"] }, fleet: { state: "working", reason: "tests" }, ...o });
const st = (prs = {}, extra = {}) => ({ prs, ship: { sha: "d1", line: "= ci passed" }, pages: { line: "= pages passed" }, sessions: {}, ...extra });

test("rowOf compacts a board row", () => {
  assert.deepEqual(rowOf(board({ sync: { verdict: "conflict" } })), { state: "draft", sha: "abc1234", ci: "success", mergeable: "clean", suggest: "WAIT", hold: false, gate: "passed", plan: "3/4", fleet: "working: tests", sync: "conflict" });
});

test("no change is zero rows and a one-line summary", () => {
  const a = st({ 7: rowOf(board()) });
  const d = diffState(a, JSON.parse(JSON.stringify(a)));
  assert.deepEqual(render(d, 5), ["= tick 5 no change"]);
});

test("only the changed fields are reported; new and gone PRs are rows", () => {
  const prev = st({ 7: rowOf(board()), 8: rowOf(board({ number: 8 })) });
  const cur = st({ 7: rowOf(board({ ci: "failure", suggest: "FIX" })), 9: rowOf(board({ number: 9 })) });
  const { rows } = diffState(prev, cur);
  assert.deepEqual(rows.find((r) => r.pr === 7).ch, { ci: ["success", "failure"], suggest: ["WAIT", "FIX"] });
  assert.equal(rows.find((r) => r.pr === 9).ev, "new");
  assert.equal(rows.find((r) => r.pr === 8).ev, "gone");
});

test("ship/pages changes and only NEW session flags surface", () => {
  const prev = st({}, { sessions: { s1: ["cost $20 > cap $15"] } });
  const cur = st({}, { ship: { sha: "d2", line: "= ci failed" }, sessions: { s1: ["cost $20 > cap $15", "context 400k > 300k"], s2: ["stalled"] } });
  const { rows } = diffState(prev, cur);
  assert.equal(rows.find((r) => r.k === "ship").ch.sha[1], "d2");
  assert.deepEqual(rows.find((r) => r.id === "s1").flag, ["context 400k > 300k"]);
  assert.deepEqual(rows.find((r) => r.id === "s2").flag, ["stalled"]);
});

test("first tick is flagged as baseline and output is capped", () => {
  const prs = {}; for (let i = 1; i <= 50; i++) prs[i] = rowOf(board({ number: i }));
  const lines = render(diffState(null, st(prs)), 1);
  assert.equal(lines.length, MAX_ROWS + 1);
  assert.match(lines.at(-1), /^= tick 1 \d+ changed \(\d+ more not shown\) \(first tick: baseline\)$/);
});

test("verdictOf takes the last `= ` line without prefix or sha/run tail", () => {
  const out = "[ci-watch] CI › Smoke → success\n[ci-watch] = ci running (35 jobs, 0 failed) sha=217b834 run=#1 push\n";
  assert.equal(verdictOf(out), "= ci running (35 jobs, 0 failed)");
  assert.equal(verdictOf("nothing"), "");
});
