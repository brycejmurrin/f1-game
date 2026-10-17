/* ready-gate.test.mjs — draft→ready requires tooling-fast / Structural guards
 * green on the tip (AGENTS.md §Concurrent PRs; evidence #1111 designer-canvas).
 *
 * Run: node --test tests/unit/ready-gate.test.mjs
 */
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  GUARDS_A, GUARDS_B, GUARDS_JOB,
  guardsVerdict, localVerdict, evaluate, shaPrefixMatch, stampReadySha, newestByName,
  planVerdict, withPlan, resolveSha, verdictLine,
} from "../../tools/ci/ready-gate.mjs";

const run = (name, status, conclusion, id = 1) => ({
  id, name, status, conclusion,
  completed_at: status === "completed" ? "2026-10-06T12:00:00Z" : null,
  started_at: "2026-10-06T11:00:00Z",
});

test("shaPrefixMatch accepts short/full mutual prefixes", () => {
  assert.equal(shaPrefixMatch("abcdef1", "abcdef1234567890"), true);
  assert.equal(shaPrefixMatch("abcdef1234567890", "abcdef1"), true);
  assert.equal(shaPrefixMatch("abcdef1", "abcdef2"), false);
  assert.equal(shaPrefixMatch("abc", "abcdef1"), false);
});

test("guardsVerdict: aggregator success is enough", () => {
  const v = guardsVerdict([run(GUARDS_JOB, "completed", "success")]);
  assert.equal(v.state, "passed");
  assert.equal(v.code, 0);
  assert.match(v.evidence, /Structural guards success/);
});

test("guardsVerdict: aggregator failure is a hard refuse", () => {
  const v = guardsVerdict([
    run(GUARDS_JOB, "completed", "failure"),
    run(GUARDS_A, "completed", "success", 2),
    run(GUARDS_B, "completed", "success", 3),
  ]);
  assert.equal(v.state, "failed");
  assert.equal(v.code, 1);
});

test("guardsVerdict: pending aggregator blocks ready", () => {
  const v = guardsVerdict([run(GUARDS_JOB, "in_progress", null)]);
  assert.equal(v.state, "pending");
  assert.equal(v.code, 1);
});

test("guardsVerdict: both tooling halves green when aggregator skipped", () => {
  const v = guardsVerdict([
    run(GUARDS_JOB, "completed", "skipped"),
    run(GUARDS_A, "completed", "success", 2),
    run(GUARDS_B, "completed", "success", 3),
  ]);
  assert.equal(v.state, "passed");
  assert.match(v.evidence, /tooling A/);
});

test("guardsVerdict: one red half fails even if the other is green", () => {
  const v = guardsVerdict([
    run(GUARDS_A, "completed", "success", 2),
    run(GUARDS_B, "completed", "failure", 3),
  ]);
  assert.equal(v.state, "failed");
  assert.match(v.evidence, /tooling B/);
});

test("guardsVerdict: no Structural guards check-runs → none", () => {
  assert.equal(guardsVerdict([run("CI", "completed", "success")]).state, "none");
  assert.equal(guardsVerdict([]).state, "none");
});

test("newestByName keeps the latest completed check-run per name", () => {
  const by = newestByName([
    { id: 1, name: GUARDS_JOB, status: "completed", conclusion: "failure", completed_at: "2026-10-06T10:00:00Z" },
    { id: 2, name: GUARDS_JOB, status: "completed", conclusion: "success", completed_at: "2026-10-06T12:00:00Z" },
  ]);
  assert.equal(by.get(GUARDS_JOB).conclusion, "success");
  assert.equal(by.get(GUARDS_JOB).id, 2);
});

test("localVerdict: stamp + passed log matching tip is green", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ready-gate-"));
  const stamp = path.join(dir, "tooling-fast-ready.sha");
  const log = path.join(dir, "tooling-fast-suite.log");
  const tip = "abcdef1234567890abcdef1234567890abcdef12";
  fs.writeFileSync(stamp, tip + "\n");
  fs.writeFileSync(log, "[tooling-fast] = run passed (10 passed, 0 failed)\n");
  const v = localVerdict(tip, { stampPath: stamp, logPath: log });
  assert.equal(v.state, "passed");
  assert.equal(v.code, 0);
});

test("localVerdict: stamp for another tip refuses", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ready-gate-"));
  const stamp = path.join(dir, "tooling-fast-ready.sha");
  const log = path.join(dir, "tooling-fast-suite.log");
  fs.writeFileSync(stamp, "1111111111111111111111111111111111111111\n");
  fs.writeFileSync(log, "[tooling-fast] = run passed (10 passed, 0 failed)\n");
  const v = localVerdict("abcdef1234567890abcdef1234567890abcdef12", { stampPath: stamp, logPath: log });
  assert.equal(v.state, "failed");
  assert.match(v.evidence, /≠ tip/);
});

test("localVerdict: failed suite log refuses even with matching stamp", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ready-gate-"));
  const stamp = path.join(dir, "tooling-fast-ready.sha");
  const log = path.join(dir, "tooling-fast-suite.log");
  const tip = "abcdef1";
  fs.writeFileSync(stamp, tip + "\n");
  fs.writeFileSync(log, "[tooling-fast] = run failed (9 passed, 1 failed)\n");
  assert.equal(localVerdict(tip, { stampPath: stamp, logPath: log }).state, "failed");
});

test("evaluate: CI success wins; CI failure refuses even with local stamp", () => {
  const tip = "abcdef1234567890abcdef1234567890abcdef12";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ready-gate-"));
  const stamp = path.join(dir, "tooling-fast-ready.sha");
  const log = path.join(dir, "tooling-fast-suite.log");
  fs.writeFileSync(stamp, tip + "\n");
  fs.writeFileSync(log, "[tooling-fast] = run passed (1 passed, 0 failed)\n");
  const localOpts = { stampPath: stamp, logPath: log };

  const ok = evaluate({
    sha: tip,
    request: () => ({ json: { check_runs: [run(GUARDS_JOB, "completed", "success")] } }),
    localOpts,
  });
  assert.equal(ok.state, "passed");
  assert.equal(ok.source, "ci");

  const bad = evaluate({
    sha: tip,
    request: () => ({ json: { check_runs: [run(GUARDS_JOB, "completed", "failure")] } }),
    localOpts,
  });
  assert.equal(bad.state, "failed");
  assert.equal(bad.source, "ci");
  assert.equal(bad.code, 1);
});

test("evaluate: pending CI can be unblocked by a matching local stamp", () => {
  const tip = "abcdef1234567890abcdef1234567890abcdef12";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ready-gate-"));
  const stamp = path.join(dir, "tooling-fast-ready.sha");
  const log = path.join(dir, "tooling-fast-suite.log");
  fs.writeFileSync(stamp, tip + "\n");
  fs.writeFileSync(log, "[tooling-fast] = run passed (1 passed, 0 failed)\n");
  const v = evaluate({
    sha: tip,
    request: () => ({ json: { check_runs: [run(GUARDS_JOB, "in_progress", null)] } }),
    localOpts: { stampPath: stamp, logPath: log },
  });
  assert.equal(v.state, "passed");
  assert.equal(v.source, "local");
});

test("evaluate: API error with no local stamp is unknown (exit 3)", () => {
  const v = evaluate({
    sha: "abcdef1234567890abcdef1234567890abcdef12",
    request: () => ({ error: "no token" }),
    localOpts: {
      stampPath: path.join(os.tmpdir(), "no-such-ready-stamp"),
      logPath: path.join(os.tmpdir(), "no-such-ready-log"),
      exists: () => false,
    },
  });
  assert.equal(v.state, "unknown");
  assert.equal(v.code, 3);
});

test("stampReadySha writes the tip", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ready-gate-"));
  const stamp = path.join(dir, "nested", "tooling-fast-ready.sha");
  assert.equal(stampReadySha("abcdef1234567890", { stampPath: stamp }), true);
  assert.equal(fs.readFileSync(stamp, "utf8").trim(), "abcdef1234567890");
});

// M36 (2026-10-09): the stamp names the tree the suite MEASURED, not HEAD read afterwards.
const T1 = "1".repeat(40), T2 = "2".repeat(40);
const stampFiles = (stampBody, logBody) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ready-gate-"));
  const stampPath = path.join(dir, "tooling-fast-ready.sha"), logPath = path.join(dir, "tooling-fast-suite.log");
  fs.writeFileSync(stampPath, stampBody); fs.writeFileSync(logPath, logBody);
  return { stampPath, logPath };
};
const PASS = "[tooling-fast] = run passed (10 passed, 0 failed)\n";

test("a tree stamp matches the tip's TREE: verify dirty, commit exactly that, and the gate agrees", () => {
  const tip = "abcdef1234567890abcdef1234567890abcdef12";
  const files = stampFiles(`${"9".repeat(40)} tree=${T1}\n`, `[tooling-fast] = tree ${T1} head ${"9".repeat(40)}\n${PASS}`);
  // the stamp's HEAD is the pre-edit commit and is NOT the tip: irrelevant, the tree is what was verified
  assert.equal(localVerdict(tip, { ...files, treeOf: () => T1 }).state, "passed");
  // a red committed tip with an uncommitted fix: the run measured T1, the tip is T2 -> refuse
  const hole = localVerdict(tip, { ...files, treeOf: () => T2 });
  assert.equal(hole.state, "failed");
  assert.match(hole.evidence, /HEAD moved|not what was committed/);
  assert.equal(localVerdict(tip, { ...files, treeOf: () => null }).state, "none", "an unresolvable tip tree is no evidence");
});

test("a tree stamp needs the suite log of the SAME run", () => {
  const tip = "abcdef1234567890abcdef1234567890abcdef12";
  const sameRun = stampFiles(`${tip} tree=${T1}\n`, `[tooling-fast] = tree ${T1} head ${tip}\n${PASS}`);
  assert.equal(localVerdict(tip, { ...sameRun, treeOf: () => T1 }).state, "passed");
  // a subset run overwrote the log afterwards: no `= tree` line
  const subset = stampFiles(`${tip} tree=${T1}\n`, PASS);
  assert.equal(localVerdict(tip, { ...subset, treeOf: () => T1 }).state, "none");
  const other = stampFiles(`${tip} tree=${T1}\n`, `[tooling-fast] = tree ${T2} head ${tip}\n${PASS}`);
  assert.equal(localVerdict(tip, { ...other, treeOf: () => T1 }).state, "none");
});

test("stampReadySha writes `sha tree=<hash>` and refuses a malformed tree", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ready-gate-"));
  const stamp = path.join(dir, "s.sha");
  assert.equal(stampReadySha("abcdef1234567890", { tree: T1, stampPath: stamp }), true);
  assert.equal(fs.readFileSync(stamp, "utf8").trim(), `abcdef1234567890 tree=${T1}`);
  assert.equal(stampReadySha("abcdef1234567890", { tree: "not-a-tree", stampPath: stamp }), false);
});

test("workTreeId is the committed tree once the dirty edits are committed, and moves when they change", async () => {
  const { workTreeId, commitTreeId } = await import("../../tools/lib/work-tree-id.mjs");
  const { execFileSync } = await import("node:child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ready-gate-tree-"));
  const g = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: "pipe" }).trim();
  try {
    g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t");
    fs.writeFileSync(path.join(dir, "a.js"), "1\n"); g("add", "-A"); g("commit", "-qm", "base");
    const clean = workTreeId(dir);
    assert.equal(clean, commitTreeId("HEAD", dir), "a clean tree is HEAD's tree");
    fs.writeFileSync(path.join(dir, "a.js"), "2\n"); fs.writeFileSync(path.join(dir, "new.test.mjs"), "x\n");   // tracked edit + UNTRACKED new file
    const dirty = workTreeId(dir);
    assert.notEqual(dirty, clean, "a dirty tree is not HEAD's tree (the old HEAD stamp could not tell)");
    assert.equal(g("status", "--porcelain").split("\n").length, 2, "the real index and tree were left alone");
    g("add", "-A"); g("commit", "-qm", "the verified edits");
    assert.equal(commitTreeId("HEAD", dir), dirty, "commit exactly what was verified -> the gate's tree comparison agrees");
    fs.writeFileSync(path.join(dir, "a.js"), "3\n");
    assert.notEqual(workTreeId(dir), dirty);
  } finally { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test("workTreeId sees a same-size rewrite that git's stat cache would call clean (racy index)", async () => {
  // Deterministic version of the CI flake: no timing luck. The real index is made older than the entry
  // (so git itself treats the entry as racily clean), ctime is not trusted (a rewrite always moves it), and
  // the file is rewritten with the SAME size and its ORIGINAL mtime restored. A copy of the index with a
  // fresh mtime made every entry look safely older, git trusted the stat cache, and the old tree came back.
  const { workTreeId } = await import("../../tools/lib/work-tree-id.mjs");
  const { execFileSync } = await import("node:child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ready-gate-racy-"));
  const g = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: "pipe" }).trim();
  try {
    g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t"); g("config", "core.trustctime", "false");
    const file = path.join(dir, "a.js");
    fs.writeFileSync(file, "1\n"); g("add", "-A"); g("commit", "-qm", "base");
    const X = Date.now() / 1000 - 50;
    fs.utimesSync(file, X, X);
    g("update-index", "--refresh");                      // the entry now records mtime X
    const index = path.join(dir, ".git", "index");
    fs.utimesSync(index, X - 10, X - 10);                // index older than the entry: racily clean for git
    const before = workTreeId(dir);
    fs.writeFileSync(file, "3\n"); fs.utimesSync(file, X, X);   // same size, same mtime, different content
    fs.utimesSync(index, X - 10, X - 10);
    assert.notEqual(workTreeId(dir), before, "a same-size rewrite in a racy window must still move the tree id");
  } finally { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

// THE PLAN CHECKLIST (AGENTS.md rule 12): with --pr, a green tip still refuses
// while the PR body's ## Plan has an item neither ticked nor struck.
const TEMPLATE = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "../../.github/pull_request_template.md"), "utf8");
const body = (plan) => `## Goal\nfix it\n\n## Plan\n${plan}\n\n## Status\n- [ ] not a plan item\n`;
const GREEN = { state: "passed", evidence: "Structural guards success", code: 0, sha: "a".repeat(40), source: "ci" };

test("planVerdict: ticked and struck items close; unticked ones stay open", () => {
  const v = planVerdict(body("- [x] edit — abc1234\n- [ ] ~~drop it~~ — superseded\n- [ ] **now:** run tests\n* [X] push"));
  assert.equal(v.state, "open");
  assert.equal(v.items, 4);
  assert.deepEqual(v.open, ["**now:** run tests"]);
  assert.equal(planVerdict(body("- [x] a — sha\n- [ ] ~~b~~ — why")).state, "done");
});

test("planVerdict: only the Plan section counts, and HTML comments are not items", () => {
  const v = planVerdict(body("<!-- - [ ] example in a comment -->\n- [x] real"));
  assert.equal(v.state, "done", "the Status section's [ ] and the commented example are ignored");
  assert.equal(v.items, 1);
});

test("planVerdict: the untouched template is open (empty placeholders count)", () => {
  const v = planVerdict(TEMPLATE);
  assert.equal(v.state, "open");
  assert.deepEqual(v.open, ["**now:**", "(empty item)"], "the template's two placeholder items, not its commented examples");
});

test("planVerdict: no Plan section, or a Plan with no items, is none", () => {
  assert.equal(planVerdict("## Goal\nx\n## Status\ny").state, "none");
  assert.equal(planVerdict(body("prose only")).state, "none");
  assert.equal(planVerdict(null).state, "none");
});

test("withPlan: an open Plan turns a green tip into plan-open (exit 1)", () => {
  const v = withPlan(GREEN, body("- [x] a — sha\n- [ ] **now:** b"));
  assert.equal(v.state, "plan-open");
  assert.equal(v.code, 1);
  assert.match(v.evidence, /1 of 2 Plan item\(s\) open: "\*\*now:\*\* b"/);
});

test("withPlan: a closed Plan passes; no Plan passes with a warning; red and no-PR are untouched", () => {
  assert.equal(withPlan(GREEN, body("- [x] a — sha")).code, 0);
  const none = withPlan(GREEN, "## Goal\nolder PR");
  assert.equal(none.code, 0);
  assert.match(none.planWarning, /no ## Plan/);
  const red = { ...GREEN, state: "failed", code: 1 };
  assert.equal(withPlan(red, body("- [ ] open")), red, "a red verdict keeps its own reason");
  assert.equal(withPlan(GREEN, undefined), GREEN, "--sha / HEAD: no PR body, no Plan check");
});

test("resolveSha --pr returns the PR body alongside its head sha", () => {
  const head = "b".repeat(40);
  const r = resolveSha({ pr: "7", request: () => ({ json: { head: { sha: head }, body: "## Plan\n- [x] a" } }) });
  assert.equal(r.sha, head);
  assert.equal(r.pr, 7);
  assert.equal(r.body, "## Plan\n- [x] a");
});

for (const state of ["in_progress", "completed"]) test(`newer ${state} attempt wins despite older late success`, () => {
  const old = { ...run(GUARDS_JOB, "completed", "success", 1), started_at: "2026-10-06T10:00:00Z", completed_at: "2026-10-06T10:10:00Z" };
  const recent = { ...run(GUARDS_JOB, state, state === "completed" ? "failure" : null, 2), started_at: "2026-10-06T10:05:00Z", completed_at: null };
  for (const list of [[old, recent], [recent, old]]) assert.equal(guardsVerdict(list).state, state === "completed" ? "failed" : "pending");
});

test("evaluate paginates globally and fails closed on a later API error", () => {
  const calls = [], sha = "a".repeat(40), localOpts = { exists: () => false };
  const request = (url) => {
    calls.push(url);
    return { json: { total_count: 101, check_runs: url.includes("page=2") ? [run(GUARDS_JOB, "completed", "failure", 101)] : Array.from({ length: 100 }, (_, i) => run("other", "completed", "success", i)) } };
  };
  assert.equal(evaluate({ sha, request, localOpts }).state, "failed");
  assert.equal(calls.length, 2);
  assert.match(calls[1], /&page=2$/);
  assert.equal(evaluate({ sha, localOpts, request: url => url.includes("page=2") ? { error: "page failed" } : request(url) }).code, 3);
});

test("a newer queued attempt without started_at cannot reuse an old pass", () => {
  const old = run(GUARDS_JOB, "completed", "success", 1);
  const queued = { ...run(GUARDS_JOB, "queued", null, 2), started_at: null };
  for (const checks of [[old, queued], [queued, old]]) assert.equal(guardsVerdict(checks).state, "pending");
});

test("planVerdict: [~] and Deferred: items count as closed (#2397)", () => {
  const body = "## Plan\n- [x] a — sha\n- [~] later thing\n- [ ] Deferred: follow-up #12\n- [ ] ~~dropped~~ — why\n";
  assert.deepEqual(planVerdict(body), { state: "done", items: 4, open: [] });
  const open = planVerdict("## Plan\n- [~] later\n- [ ] still todo\n- [ ] Deferred-ish not closed\n");
  assert.equal(open.state, "open");
  assert.deepEqual(open.open, ["still todo", "Deferred-ish not closed"]);
});

test("#2430: the verdict line carries the FULL 40-char sha a merge call needs", () => {
  const sha = "4dc3d6226176b48601a9e9cb0612989cc7ec916b";
  assert.match(verdictLine({ state: "passed", evidence: "ok", sha, source: "ci" }), /^= ready-gate passed — ok sha=[0-9a-f]{40} source=ci$/);
});
