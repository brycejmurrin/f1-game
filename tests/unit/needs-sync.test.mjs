// needs-sync — the predicate behind "sync only when you must" (sync-pr.mjs, pr-board.mjs).
import "../helpers/git-fixture-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { decideSync, needsSync, exitCode, verdictLine, VERDICTS } from "../../tools/ci/needs-sync.mjs";

const T0 = "2026-10-16T08:00:00Z", T1 = "2026-10-16T09:00:00Z";

test("decideSync: up to date is no, even with a red", () => {
  assert.equal(decideSync({ behind: false, conflict: false, ci: "failure" }).verdict, "no");
});
test("decideSync: a conflict wins over everything", () => {
  assert.equal(decideSync({ behind: true, conflict: true, ci: "success" }).verdict, "conflict");
});
test("decideSync: red + tip moved after the run = stale-red", () => {
  assert.equal(decideSync({ behind: true, conflict: false, ci: "failure", runStartedAt: T0, tipNewestAt: T1 }).verdict, "stale-red");
});
test("decideSync: red but the tip is older than the run = no (the red is the branch's own)", () => {
  assert.equal(decideSync({ behind: true, conflict: false, ci: "failure", runStartedAt: T1, tipNewestAt: T0 }).verdict, "no");
});
test("decideSync: clean-behind green / running / unknown / none = no", () => {
  for (const ci of ["success", "in_progress", "queued", "unknown", "none", "cancelled"]) {
    assert.equal(decideSync({ behind: true, conflict: false, ci, runStartedAt: T0, tipNewestAt: T1 }).verdict, "no", ci);
  }
});
test("exit codes and verdict line", () => {
  assert.deepEqual(VERDICTS, ["conflict", "stale-red", "no"]);
  assert.equal(exitCode({ ok: true, verdict: "conflict" }), 0);
  assert.equal(exitCode({ ok: true, verdict: "stale-red" }), 0);
  assert.equal(exitCode({ ok: true, verdict: "no" }), 1);
  assert.equal(exitCode({ ok: false }), 3);
  assert.equal(verdictLine({ verdict: "stale-red" }), "= sync needed: stale-red");
});

// A real repo: deploy tip D, branch B behind it.
function repo(tipEdit, branchEdit) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "needs-sync-"));
  const g = (...a) => { const r = spawnSync("git", a, { cwd: dir, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  g("init", "-q", "-b", "deploy"); g("config", "user.email", "t@t"); g("config", "user.name", "t");
  fs.writeFileSync(path.join(dir, "f.txt"), "base\n"); g("add", "."); g("commit", "-qm", "base");
  g("checkout", "-qb", "pr"); fs.writeFileSync(path.join(dir, branchEdit[0]), branchEdit[1]); g("add", "."); g("commit", "-qm", "pr");
  g("checkout", "-q", "deploy"); fs.writeFileSync(path.join(dir, tipEdit[0]), tipEdit[1]); g("add", "."); g("commit", "-qm", "tip");
  g("update-ref", "refs/remotes/origin/deploy", "deploy"); g("update-ref", "refs/remotes/origin/pr", "pr");
  return (args) => { const r = spawnSync("git", args, { cwd: dir, encoding: "utf8" }); return { code: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() }; };
}
const DEPLOY = "claude/f1-game-project-26h3ng";
const alias = (readGit) => (args) => readGit(args.map((a) => a.replace(`origin/${DEPLOY}`, "origin/deploy")));

test("needsSync on a real repo: disjoint edits are clean-behind = no", () => {
  const v = needsSync("pr", { fetch: false, offline: true, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])) });
  assert.equal(v.ok, true); assert.equal(v.behind, true); assert.equal(v.conflict, false); assert.equal(v.verdict, "no");
});
test("needsSync on a real repo: the same line edited twice = conflict", () => {
  const v = needsSync("pr", { fetch: false, offline: true, readGit: alias(repo(["f.txt", "tip\n"], ["f.txt", "pr\n"])) });
  assert.equal(v.conflict, true); assert.equal(v.verdict, "conflict");
});
test("needsSync: an unresolvable ref is an error, not a verdict", () => {
  const v = needsSync("nope", { fetch: false, offline: true, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])) });
  assert.equal(v.ok, false);
});
test("needsSync: API failure degrades to a note, never a stale-red", () => {
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])), request: () => ({ error: "HTTP 403" }) });
  assert.equal(v.verdict, "no"); assert.match(v.note, /unreadable/);
});
test("needsSync: red head + newer tip commit = stale-red via the injected API", () => {
  const request = () => ({ json: { workflow_runs: [{ id: 7, path: ".github/workflows/ci.yml", status: "completed", conclusion: "failure", run_started_at: "2000-01-01T00:00:00Z" }] } });
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])), request });
  assert.equal(v.verdict, "stale-red");
});
