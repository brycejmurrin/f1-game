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
  assert.deepEqual(VERDICTS, ["conflict", "stale-red", "tip-red", "no"]);
  assert.equal(exitCode({ ok: true, verdict: "tip-red" }), 1, "tip-red is not a sync");
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
test("needsSync: a green clean-behind head reads only the ci.yml runs and the deploy tip's pages.yml run (no `gate` status read since 2026-11-03) = no", () => {
  const calls = [];
  const request = (p) => { calls.push(p); return { json: { workflow_runs: [] } }; };
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])), request });
  assert.equal(v.verdict, "no");
  assert.equal(v.distance, undefined, "no distance fact is reported");
  assert.ok(calls.some((p) => p.startsWith("actions/workflows/ci.yml/runs")), calls.join(" "));
  assert.ok(calls.every((p) => p.startsWith("actions/workflows/ci.yml/runs") || p.startsWith("actions/workflows/pages.yml/runs?branch=")), calls.join(" "));
});
test("needsSync: red head + newer tip commit = stale-red via the injected API", () => {
  const request = () => ({ json: { workflow_runs: [{ id: 7, path: ".github/workflows/ci.yml", status: "completed", conclusion: "failure", run_started_at: "2000-01-01T00:00:00Z" }] } });
  const v = needsSync("pr", { fetch: false, readGit: alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"])), request });
  assert.equal(v.verdict, "stale-red");
});

// #5425: tip-red — the deploy tip is red on code, so a sync would import the red.
const pagesRun = (id, conclusion) => ({ id, head_sha: "1421575aec6a36eb2390e4731d87887f713ad13f", status: "completed", conclusion });
const tipApi = (run, jobs) => (p) => p.startsWith("actions/workflows/pages.yml/runs") ? { json: { workflow_runs: run ? [run] : [] } }
  : p.startsWith(`actions/runs/${run?.id}/jobs`) ? { json: { jobs } } : { json: { workflow_runs: [] } };
test("decideSync: a code-red tip is tip-red, over conflict and stale-red; not behind stays no", () => {
  const tip = { state: "code-red", evidence: "pages.yml run 9 on abc concluded failure on code: failed job(s) `ci / CI`" };
  assert.equal(decideSync({ behind: true, conflict: false, ci: "success", tip }).verdict, "tip-red");
  assert.equal(decideSync({ behind: true, conflict: true, tip }).verdict, "tip-red", "a conflict sync would import the red too");
  assert.equal(decideSync({ behind: true, conflict: false, ci: "failure", runStartedAt: "2026-11-10T00:00:00Z", tipNewestAt: "2026-11-11T00:00:00Z", tip }).verdict, "tip-red");
  assert.match(decideSync({ behind: true, conflict: false, tip }).why, /run 9/);
  assert.equal(decideSync({ behind: false, conflict: false, tip }).verdict, "no");
  for (const state of ["green", "platform", "none"]) assert.equal(decideSync({ behind: true, conflict: false, ci: "success", tip: { state, evidence: "x" } }).verdict, "no", state);
});
test("needsSync: the deploy tip red in a spec leg = tip-red; a publish-only (platform) failure = no", () => {
  const rg = () => alias(repo(["a.txt", "a\n"], ["b.txt", "b\n"]));
  const spec = needsSync("pr", { fetch: false, readGit: rg(), request: tipApi(pagesRun(9, "failure"), [{ name: "ci / Selected specs (change-aware gate) (selected-1)", conclusion: "failure" }, { name: "deploy", conclusion: "skipped" }]) });
  assert.equal(spec.verdict, "tip-red"); assert.match(spec.why, /Selected specs/);
  assert.equal(exitCode(spec), 1);
  const platform = needsSync("pr", { fetch: false, readGit: rg(), request: tipApi(pagesRun(42880431465, "failure"), [{ name: "ci / CI", conclusion: "success" },
    { name: "deploy", conclusion: "failure", steps: [{ name: "Publish to Pages (retry)", conclusion: "failure" }, { name: "Pages publish failed (platform)", conclusion: "failure" }, { name: "Deploy verdict", conclusion: "failure" }] }]) });
  assert.equal(platform.verdict, "no", "run 42880431465 failed only in publish");
  const unread = needsSync("pr", { fetch: false, readGit: rg(), request: (p) => p.startsWith("actions/workflows/pages.yml") ? { error: "HTTP 502" } : { json: { workflow_runs: [] } } });
  assert.equal(unread.verdict, "no"); assert.match(unread.note, /deploy tip state unreadable/);
  assert.equal(needsSync("pr", { fetch: false, offline: true, readGit: rg() }).deployTip, null, "offline reads no API");
});
