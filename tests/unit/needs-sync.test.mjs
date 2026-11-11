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
test("decideSync: a stray `distance` fact changes nothing (the verdict went with merge-gate's distance row, 2026-11-03)", () => {
  assert.equal(decideSync({ behind: true, conflict: false, ci: "success", runStartedAt: T0, tipNewestAt: T1, distance: true }).verdict, "no");
  assert.equal(decideSync({ behind: true, conflict: true, ci: "success", distance: true }).verdict, "conflict");
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
test("needsSync: a green clean-behind head reads only the ci.yml runs (no `gate` status read since 2026-11-03) = no", () => {
  const calls = [];
  const request = (p) => { calls.push(p); return { json: { workflow_runs: [] } }; };
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])), request });
  assert.equal(v.verdict, "no");
  assert.equal(v.distance, undefined, "no distance fact is reported");
  assert.ok(calls.length >= 1 && calls.every((p) => p.startsWith("actions/workflows/ci.yml/runs")), calls.join(" "));
});
test("needsSync: red head + newer tip commit = stale-red via the injected API", () => {
  const request = () => ({ json: { workflow_runs: [{ id: 7, path: ".github/workflows/ci.yml", status: "completed", conclusion: "failure", run_started_at: "2000-01-01T00:00:00Z" }] } });
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])), request });
  assert.equal(v.verdict, "stale-red");
});

// A `cancelled` newest run that already had a failed job was red before the cancel (2026-11-11 mirror outage).
test("decideSync: cancelled + 1 failed job + tip moved = stale-red, and the why names the case", () => {
  const d = decideSync({ behind: true, conflict: false, ci: "cancelled", failedJobs: 1, runStartedAt: T0, tipNewestAt: T1 });
  assert.equal(d.verdict, "stale-red"); assert.match(d.why, /ci cancelled after 1 failed job\(s\)/);
});
test("decideSync: cancelled + 0 failed jobs = no (rule 8: a timeout until proven otherwise)", () => {
  const d = decideSync({ behind: true, conflict: false, ci: "cancelled", failedJobs: 0, runStartedAt: T0, tipNewestAt: T1 });
  assert.equal(d.verdict, "no"); assert.match(d.why, /0 failed jobs: a timeout until proven otherwise/);
});
test("decideSync: cancelled + failed job but the tip has not moved = no", () => {
  const d = decideSync({ behind: true, conflict: false, ci: "cancelled", failedJobs: 2, runStartedAt: T1, tipNewestAt: T0 });
  assert.equal(d.verdict, "no"); assert.match(d.why, /ci cancelled after 2 failed job\(s\) but the tip has not moved/);
});
test("decideSync: a failed-job count on a non-cancelled run changes nothing", () => {
  assert.equal(decideSync({ behind: true, conflict: false, ci: "success", failedJobs: 3, runStartedAt: T0, tipNewestAt: T1 }).verdict, "no");
  const d = decideSync({ behind: true, conflict: false, ci: "failure", runStartedAt: T0, tipNewestAt: T1 });
  assert.equal(d.verdict, "stale-red"); assert.match(d.why, /^ci\.yml is red/);
});

const cancelledRun = { id: 9, path: ".github/workflows/ci.yml", status: "completed", conclusion: "cancelled", run_started_at: "2000-01-01T00:00:00Z" };
const jobsApi = (pages) => (p) => {
  if (p.startsWith("actions/workflows/ci.yml/runs")) return { json: { workflow_runs: [cancelledRun] } };
  const m = p.match(/^actions\/runs\/9\/jobs\?per_page=100&page=(\d+)$/);
  assert.ok(m, p);
  const page = pages[Number(m[1]) - 1];
  return page.error ? page : { json: { jobs: page } };
};
test("needsSync: cancelled head with a failed job (second page) + newer tip = stale-red", () => {
  const full = Array.from({ length: 100 }, (_, i) => ({ id: i, conclusion: "cancelled" }));
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])), request: jobsApi([full, [{ conclusion: "failure" }, { conclusion: "success" }]]) });
  assert.equal(v.verdict, "stale-red"); assert.equal(v.failedJobs, 1); assert.match(v.why, /cancelled after 1 failed job/);
});
test("needsSync: cancelled head with zero failed jobs = no", () => {
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])), request: jobsApi([[{ conclusion: "cancelled" }, { conclusion: "success" }]]) });
  assert.equal(v.verdict, "no"); assert.equal(v.failedJobs, 0); assert.match(v.why, /rule 8/);
});
test("needsSync: a jobs read error keeps `no` and says why", () => {
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])), request: jobsApi([{ error: "HTTP 502" }]) });
  assert.equal(v.verdict, "no"); assert.match(v.why, /jobs are unreadable \(HTTP 502\)/); assert.match(v.note, /unreadable/);
});

// A green only on run_attempt > 1 after a red attempt: merge-gate's ci row refuses it, so needs-sync calls it red.
test("decideSync: retried green after a failed job + tip moved = stale-red, and the why names the attempt", () => {
  const d = decideSync({ behind: true, conflict: false, ci: "success", attempt: 2, retryFailedJobs: 3, runStartedAt: T0, tipNewestAt: T1 });
  assert.equal(d.verdict, "stale-red"); assert.match(d.why, /ci green only on attempt 2 after 3 failed job\(s\)/);
});
test("decideSync: retried green after a failed job but the tip has not moved = no", () => {
  const d = decideSync({ behind: true, conflict: false, ci: "success", attempt: 2, retryFailedJobs: 1, runStartedAt: T1, tipNewestAt: T0 });
  assert.equal(d.verdict, "no"); assert.match(d.why, /attempt 2 after 1 failed job\(s\) but the tip has not moved/);
});
test("decideSync: retried green after a cancel-only attempt = no", () => {
  const d = decideSync({ behind: true, conflict: false, ci: "success", attempt: 2, retryFailedJobs: 0, runStartedAt: T0, tipNewestAt: T1 });
  assert.equal(d.verdict, "no"); assert.match(d.why, /earlier attempts had no failed job/);
});
test("decideSync: first-attempt green = no (a stray retry count is ignored)", () => {
  assert.equal(decideSync({ behind: true, conflict: false, ci: "success", attempt: 1, retryFailedJobs: 5, runStartedAt: T0, tipNewestAt: T1 }).verdict, "no");
});

const retriedRun = { id: 11, path: ".github/workflows/ci.yml", status: "completed", conclusion: "success", run_attempt: 3, run_started_at: "2000-01-01T00:00:00Z" };
const attemptsApi = (byAttempt, calls = []) => (p) => {
  calls.push(p);
  if (p.startsWith("actions/workflows/ci.yml/runs")) return { json: { workflow_runs: [retriedRun] } };
  const m = p.match(/^actions\/runs\/11\/attempts\/(\d+)\/jobs\?per_page=100&page=1$/);
  assert.ok(m, p);
  const a = byAttempt[Number(m[1])];
  return a.error ? a : { json: { jobs: a } };
};
test("needsSync: green on attempt 3 after a timed_out job in attempt 1 + newer tip = stale-red", () => {
  const calls = [];
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])),
    request: attemptsApi({ 1: [{ conclusion: "timed_out" }, { conclusion: "failure" }], 2: [{ conclusion: "cancelled" }] }, calls) });
  assert.equal(v.verdict, "stale-red"); assert.equal(v.retryFailedJobs, 2); assert.match(v.why, /attempt 3 after 2 failed job/);
  assert.ok(calls.some((p) => p.includes("/attempts/2/")), "every earlier attempt is read");
});
test("needsSync: green on attempt 3 after cancel-only attempts = no", () => {
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])),
    request: attemptsApi({ 1: [{ conclusion: "cancelled" }], 2: [{ conclusion: "cancelled" }, { conclusion: "skipped" }] }) });
  assert.equal(v.verdict, "no"); assert.equal(v.retryFailedJobs, 0);
});
test("needsSync: an unreadable earlier attempt degrades like an unreadable CI read (no + note), never stale-red", () => {
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])),
    request: attemptsApi({ 1: { error: "HTTP 502" } }) });
  assert.equal(v.ok, true); assert.equal(v.verdict, "no"); assert.equal(v.retryFailedJobs, null);
  assert.match(v.why, /earlier attempts are unreadable \(attempt 1: HTTP 502\)/); assert.match(v.note, /unreadable/);
});
