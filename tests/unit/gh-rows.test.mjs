// gh-rows — the shared GitHub row helpers (tools/ci/lib/gh-rows.mjs), moved out of the retired dispatch.mjs (#6536):
// closing keywords in prose only, a batch issue's members, label names, pagination until a short page, the adoption line.
import test from "node:test";
import assert from "node:assert/strict";
import { ADOPT_RE, PAGE_SIZE, batchMembers, closingIssues, getAll, labelsOf } from "../../tools/ci/lib/gh-rows.mjs";

test("closingIssues: prose closing keywords for this repository; code, comments, other repos and Refs reserve nothing", () => {
  for (const [body, want] of [["Closes #10", [10]], ["Fixes brycejmurrin/f1-game#10", [10]], ["Closes https://github.com/another/repository/issues/10", []],
    ["Refs #10", []], ["```\nCloses #10\n```", []], ["Example: `Closes #10`", []], ["<!-- Closes #10 -->", []], ["Closes #11, resolves #10", [11, 10]]]) {
    assert.deepEqual(closingIssues(body), want, body);
  }
  assert.deepEqual(closingIssues("Closes other/repo#4", "other/repo"), [4]);
});

test("batchMembers: the first #n of each top-level bullet under ## Members; sub-bullets and other sections name none", () => {
  const body = ["One PR fixes every member.", "", "## Members", "- #11 — a bug", "  - a sub-bullet naming #999", "- #12 — another", "- #11 again", "",
    "## Notes", "- #998 also edits this"].join("\n");
  assert.deepEqual(batchMembers(body), [11, 12]);
  assert.deepEqual(batchMembers("no members"), []);
});

test("labelsOf, ADOPT_RE and getAll: string or object labels; the adoption line; pages until a short page, pick unwraps", () => {
  assert.deepEqual(labelsOf({ labels: ["a", { name: "b" }, null] }), ["a", "b"]);
  assert.deepEqual(ADOPT_RE.exec("adopts PR #42 — claude:session_x at abc")?.slice(1), ["42", "claude:session_x"]);
  const calls = [];
  const api = (p) => { calls.push(p); return { json: Array.from({ length: p.endsWith("page=1") ? PAGE_SIZE : 3 }, (_, i) => i) }; };
  assert.equal(getAll(api, "issues?state=open").length, PAGE_SIZE + 3);
  assert.deepEqual(calls, ["issues?state=open&per_page=100&page=1", "issues?state=open&per_page=100&page=2"]);
  assert.deepEqual(getAll(() => ({ json: { check_runs: [{ id: 1 }] } }), "commits/x/check-runs", { pick: (j) => j.check_runs }), [{ id: 1 }]);
  assert.throws(() => getAll(() => ({ error: "HTTP 500" }), "pulls"), /pulls\?per_page=100&page=1: HTTP 500/);
});
