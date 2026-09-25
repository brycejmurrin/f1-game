/* session-status.test.mjs — the generated handoff block reads verdicts the way
 * AGENTS.md rule 5 anchors them, and says what is unpushed or unread.
 *
 * The PR body is the handoff the next agent trusts, so the two failure modes
 * that matter are a wrong verdict (a heartbeat line read as a result, or a
 * dead run read as green) and a silent omission (unpushed commits, a live run).
 *
 * Run: node --test tests/unit/session-status.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVerdict, toMarkdown, collect } from "../../tools/ci/session-status.mjs";

test("parseVerdict takes the LAST terminal line, never a heartbeat", () => {
  const log = [
    ". running 3/40 done, 1 failed | w0 30s x.spec.js",   // heartbeat: never a verdict
    "= run failed  (40/40 done, 2 failed)",
    "= run passed  (40/40 done, 0 failed)",               // a --last-failed re-run appended
    "= bg exit 0",
  ].join("\n");
  assert.equal(parseVerdict(log), "passed (40/40 done, 0 failed)");
  assert.equal(parseVerdict("[tooling-fast] = run failed (236 passed, 3 failed)"), "failed (236 passed, 3 failed)");
});

test("parseVerdict names a run that died before its reporter's summary", () => {
  assert.match(parseVerdict(". running 3/40 done, 0 failed\n= bg exit 137"), /exited 137 \(no reporter summary\)/);
  assert.match(parseVerdict(". running 3/40 done, 0 failed"), /no verdict yet/);
});

test("toMarkdown flags unpushed commits, dirt and a live run", () => {
  const md = toMarkdown({
    at: "2026-09-24T00:00:00Z", branch: "claude/x", base: "origin/claude/f1-game-project-26h3ng",
    ahead: 2, behind: 1, unpushed: 1, upstream: "origin/claude/x",
    sessions: ["https://claude.ai/code/session_abc"], commits: [{ sha: "abc1234", subject: "fix" }],
    dirty: [" M js/game.js"], logs: [{ log: "artifacts/logs/smoke.log", verdict: "failed (…)", ageMin: 3 }],
    live: "123:456 artifacts/logs/smoke.log",
  });
  assert.match(md, /1 commit\(s\) NOT pushed/);
  assert.match(md, /1 uncommitted: `js\/game\.js`/);
  assert.match(md, /verdict is NOT read yet/);
  assert.match(md, /session_abc/);
  assert.match(md, /`abc1234` fix/);
});

test("collect runs against the real checkout without throwing", () => {
  const s = collect();
  assert.equal(typeof s.branch, "string");
  assert.ok(Array.isArray(s.commits) && Array.isArray(s.logs));
});
