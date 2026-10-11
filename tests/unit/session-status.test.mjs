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
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseVerdict, toMarkdown, collect, ciSummary, livePrLines, fetchLivePr } from "../../tools/ci/session-status.mjs";

// ── live PR state (--pr): pure formatting over mocked API answers ────────────
const SHA = "a".repeat(40), OTHER = "b".repeat(40), AT = "2026-10-10T08:00:00Z";
const run = (name, status, conclusion, id = 1, created_at = "2026-10-10T07:00:00Z") => ({ name, status, conclusion, id, created_at });

test("ciSummary: running beats failure beats success, newest run per workflow only", () => {
  assert.equal(ciSummary([]), "no CI run for this sha");
  assert.equal(ciSummary([run("CI", "completed", "success")]), "success");
  assert.equal(ciSummary([run("CI", "completed", "success"), run("Pages", "in_progress", null, 2)]), "running");
  assert.equal(ciSummary([run("CI", "completed", "failure"), run("Pages", "completed", "success", 2)]), "failure");
  // an old failed run superseded by a newer green one is not a red
  assert.equal(ciSummary([run("CI", "completed", "failure", 1), run("CI", "completed", "success", 2, "2026-10-10T07:30:00Z")]), "success");
});

test("livePrLines: head, draft/ready, mergeable_state, CI — each stamped as a snapshot", () => {
  const md = livePrLines({ at: AT, localHead: SHA, pr: { number: 7, draft: true, mergeable_state: "clean", head: { sha: SHA } }, ci: "running" }).join("\n");
  assert.match(md, /PR #7 head\*\* `aaaaaaaaa` — draft/);
  assert.match(md, /mergeable_state `clean`/);
  assert.match(md, /CI.*running/);
  assert.equal((md.match(/snapshot read 2026-10-10T08:00:00Z/g) || []).length, 3);
  assert.match(md, /ready-gate\.mjs.*ready-full-cap\.mjs/);
  assert.doesNotMatch(md, /LOCAL HEAD != PR HEAD/);
});

test("livePrLines: a differing local HEAD is a loud warning; ready is named ready", () => {
  const md = livePrLines({ at: AT, localHead: OTHER, pr: { number: 7, draft: false, mergeable_state: "dirty", head: { sha: SHA } }, ci: "success" }).join("\n");
  assert.match(md, /LOCAL HEAD != PR HEAD/);
  assert.match(md, /ready/);
});

test("livePrLines: unavailable state is one clear line", () => {
  assert.deepEqual(livePrLines({ at: AT, error: "no token" }), ["- **Live PR state** unavailable: no token (checked " + AT + ")"]);
});

test("fetchLivePr: mocked API; any error or missing PR degrades, never throws", () => {
  const pr = { number: 7, draft: true, mergeable_state: "blocked", head: { sha: SHA } };
  const ok = (p) => p.startsWith("pulls/7") ? { json: pr } : { json: { workflow_runs: [run("CI", "completed", "success")] } };
  const r = fetchLivePr({ prArg: "7", branch: "x", request: ok });
  assert.equal(r.pr.number, 7); assert.equal(r.ci, "success");
  assert.match(fetchLivePr({ prArg: "7", branch: "x", request: () => ({ error: "HTTP 401" }) }).error, /HTTP 401/);
  assert.match(fetchLivePr({ prArg: "auto", branch: "x", request: () => ({ json: [] }) }).error, /no open PR/);
  assert.match(fetchLivePr({ prArg: "7", branch: "x", request: () => { throw new Error("boom"); } }).error, /boom/);
});

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
  assert.match(md, /Ready gate.*ready-gate\.mjs/);
  assert.match(md, /session_abc/);
  assert.match(md, /`abc1234` fix/);
});

test("collect runs against the real checkout without throwing", () => {
  const s = collect();
  assert.equal(typeof s.branch, "string");
  assert.ok(Array.isArray(s.commits) && Array.isArray(s.logs));
});

test("collect preserves the first porcelain status column and complete path", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-status-git-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "git"), '#!/bin/sh\nif [ "$1" = status ]; then printf " M docs/README.md\\n?? new-file.md\\n"; else exit 1; fi\n', { mode: 0o755 });
  const previousPath = process.env.PATH;
  try {
    process.env.PATH = dir + path.delimiter + (previousPath || "");
    const result = collect();
    assert.deepEqual(result.dirty, [" M docs/README.md", "?? new-file.md"]);
    assert.match(toMarkdown(result), /`docs\/README\.md`/);
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  }
});

test("a detached HEAD is told to name a branch, never `git push -u origin HEAD`", () => {
  const base = { at: "2026-10-04T00:00:00Z", base: null, ahead: 0, behind: 0, unpushed: 0, upstream: null,
    sessions: [], commits: [], dirty: [], logs: [], live: null };
  const md = toMarkdown({ ...base, branch: "HEAD" });
  assert.match(md, /detached HEAD — name a branch first: `git switch -c claude\/<topic>`/);
  assert.doesNotMatch(md, /git push -u origin HEAD/);
  assert.match(toMarkdown({ ...base, branch: "claude/x" }), /git push -u origin claude\/x/);
});
