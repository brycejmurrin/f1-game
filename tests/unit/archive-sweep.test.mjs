import test from "node:test";
import assert from "node:assert/strict";
import { sweep } from "../../tools/ci/archive-sweep.mjs";

const prs = [
  { number: 1, merged_at: "2026-11-03T00:00:00Z", body: "x\nhttps://claude.ai/code/session_AAA" },
  { number: 2, merged_at: null, body: "https://claude.ai/code/session_BBB" },
  { number: 3, merged_at: "t", body: "https://claude.ai/code/session_CCC" },
];

test("sweep lists done sessions whose PR merged or closed", () => {
  const got = sweep([
    { id: "session_AAA", status: "idle" },
    { id: "session_BBB", status: "completed" },
    { id: "session_CCC", status: "working" },
    { id: "session_DDD", status: "idle" },
  ], prs);
  assert.deepEqual(got, [
    { id: "session_AAA", pr: 1, reason: "merged" },
    { id: "session_BBB", pr: 2, reason: "closed" },
  ]);
});
