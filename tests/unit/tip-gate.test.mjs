/* tip-gate.test.mjs — tools/ci/lib/tip-gate.mjs: the deploy tip's own unit gate when Pages has not judged it.
 * 2026-11-19: #5714 + #5634 put the boot wall over budget while the tip's Pages runs sat in a backlog; the gate's
 * base row kept reading an older green run. merge-gate.test.mjs pins the base row; this pins the runner and the view.
 *
 * Run: node --test tests/unit/tip-gate.test.mjs
 */
import "../helpers/git-fixture-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runTipGate, tipView, failedTests, TIP_GATE_TESTS, gitReason, ownWorktreePath } from "../../tools/ci/lib/tip-gate.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
/** A fixture path no tree carries, built so the source-path lint does not read it as a reference. */
const U = (name) => ["tests", "unit", `${name}.test.mjs`].join("/");
const scratch = (prefix) => { const d = path.join(ROOT, "artifacts", "tmp"); fs.mkdirSync(d, { recursive: true }); return fs.mkdtempSync(path.join(d, prefix)); };

test("TIP_GATE_TESTS exist and import only node built-ins and repo files (land.yml trusted-rows installs nothing)", () => {
  for (const f of TIP_GATE_TESTS) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    const specs = [...src.matchAll(/^import\b[^"']*["']([^"']+)["']/gm)].map((m) => m[1]);
    const bad = specs.filter((s) => !s.startsWith("node:") && !s.startsWith("."));
    assert.deepEqual(bad, [], `${f} imports a package`);
  }
  assert.equal(TIP_GATE_TESTS[0], "tests/unit/boot-load-budget.test.mjs", "the boot wall that went red on 2026-11-19");
});

test("failedTests reads the top-level `not ok` lines of node --test output", () => {
  assert.deepEqual(failedTests("ok 1 - a\nnot ok 2 - the eager shell stays inside its script budget (count and raw bytes)\n  not ok 1 - nested\nnot ok 3 - b \n"),
    ["the eager shell stays inside its script budget (count and raw bytes)", "b"]);
  assert.deepEqual(failedTests(""), []);
});

test("tipView: Pages speaks only for the sha it ran on; otherwise the tip gate decides, and a gate that cannot run holds", () => {
  const T = "a".repeat(40), O = "b".repeat(40);
  const never = () => assert.fail("the gate is not asked");
  const greenOnTip = { state: "green", sha: T, evidence: "pages.yml run 1 on aaaaaaaa concluded success" };
  assert.equal(tipView(greenOnTip, { tipSha: T, gate: never }), greenOnTip, "Pages ran on the tip itself");
  const redOld = { state: "code-red", sha: O, runAt: "x", evidence: "red" };
  assert.equal(tipView(redOld, { tipSha: T, gate: never }), redOld, "a Pages red stands until Pages itself clears it");
  const greenOld = { state: "green", sha: O, evidence: "pages.yml run 2 on bbbbbbbb concluded success" };
  const red = tipView(greenOld, { tipSha: T, tipAt: "2026-11-19T00:07:00Z", gate: () => ({ state: "code-red", jobs: ["budget"], evidence: "the tip aaaaaaaa's own unit gate fails: \"budget\"" }) });
  assert.deepEqual([red.state, red.sha, red.runAt, red.jobs], ["code-red", T, "2026-11-19T00:07:00Z", ["budget"]], "the red names the tip sha (fixer proof) and the tip date (owner escape)");
  assert.equal(red.evidence, "the newest completed pages.yml run is on bbbbbbbb (green), not the tip aaaaaaaa; the tip aaaaaaaa's own unit gate fails: \"budget\"");
  const ok = tipView(greenOld, { tipSha: T, gate: () => ({ state: "green", evidence: "passed" }) });
  assert.equal(ok.state, "green");
  const held = tipView({ state: "platform", sha: O, evidence: "p" }, { tipSha: T, gate: () => ({ error: "tip gate: boom" }) });
  assert.deepEqual([held.state, held.sha], ["unverified", T]);
  assert.equal(held.evidence, "the newest completed pages.yml run is on bbbbbbbb (platform), not the tip aaaaaaaa; tip gate: boom: held until it runs or Pages reaches the tip");
  const none = tipView({ state: "none", sha: null, evidence: "no completed pages.yml run on the deploy branch" }, { tipSha: T, gate: () => ({ state: "green", evidence: "passed" }) });
  assert.equal(none.evidence, "no completed pages.yml run on the base branch yet (tip aaaaaaaa); passed");
});

test("runTipGate: a detached worktree of the tip, ensure-built, the tests, a verdict cached per sha; failures are errors, never a pass", () => {
  const T = scratch("tip-gate-");
  const git = (cwd, ...a) => { const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd, encoding: "utf8" }); assert.equal(r.status, 0, `${a.join(" ")}: ${r.stderr}`); return r.stdout.trim(); };
  try {
    const W = path.join(T, "w");
    fs.mkdirSync(path.join(W, "tests/unit"), { recursive: true });
    git(W, "init", "-q", "-b", "deploy-x");
    fs.writeFileSync(path.join(W, U("a")), "// a\n");
    git(W, "add", "-A"); git(W, "commit", "-q", "-m", "tip");
    const sha = git(W, "rev-parse", "HEAD");
    const seen = [];
    // git is real; node (ensure-built, node --test) is faked, and records where and how it ran.
    const fake = (out) => (cmd, args, opts) => {
      if (cmd === "git") return spawnSync(cmd, args, opts);
      seen.push({ args, cwd: opts.cwd, ctx: "NODE_TEST_CONTEXT" in opts.env, exists: fs.existsSync(path.join(opts.cwd, U("a"))) });
      return args[0] === "--test" ? out : { status: 0, stdout: "", stderr: "" };
    };
    const tests = [U("a"), U("not-at-this-tip")];
    const red = runTipGate({ sha, base: "deploy-x", root: W, tests, run: fake({ status: 1, stdout: "not ok 1 - the eager shell stays inside its script budget (count and raw bytes)\n" }) });
    assert.deepEqual([red.state, red.sha, red.jobs], ["code-red", sha, ["the eager shell stays inside its script budget (count and raw bytes)"]], JSON.stringify(red));
    assert.deepEqual(seen.map((s) => s.args), [["tools/gen/ensure-built.mjs", "--quiet"], ["--test", U("a")]], "BUILT_PATHS first; only the test files the tip carries");
    assert.ok(seen.every((s) => s.exists && !s.ctx && s.cwd.includes(`wt-${sha.slice(0, 12)}`)), "in the tip's worktree, without NODE_TEST_CONTEXT (a nested node --test exits 0 on a failure)");
    assert.ok(!fs.existsSync(seen[0].cwd), "the worktree is removed");
    assert.equal(git(W, "worktree", "list").split("\n").length, 1, "and pruned");
    seen.length = 0;
    const again = runTipGate({ sha, base: "deploy-x", root: W, tests, run: fake({ status: 0, stdout: "" }) });
    assert.deepEqual([again.state, again.cached, seen.length], ["code-red", true, 0], "one verdict per tip sha: the next PR in the same job reads the cache");
    const other = runTipGate({ sha, base: "deploy-x", root: W, tests: [U("a")], run: fake({ status: 0, stdout: "ok 1 - a\n" }) });
    assert.deepEqual([other.state, other.cached], ["green", undefined], "a different test list is a different gate");
    const s8 = sha.slice(0, 8);
    assert.equal(runTipGate({ sha, base: "deploy-x", root: W, tests: ["x"], run: fake({ status: 1, stdout: "" }) }).error, `tip gate on ${s8}: node --test exit 1 with no failing test named`, "a crash is not a pass and not a named red");
    const noBuild = (cmd, args, opts) => (cmd === "git" ? spawnSync(cmd, args, opts) : { status: 1, stdout: "", stderr: "Error: circuit def\n" });
    assert.equal(runTipGate({ sha, base: "deploy-x", root: W, tests: ["y"], run: noBuild }).error, `tip gate: ensure-built failed on ${s8}: Error: circuit def`);
    assert.equal(runTipGate({ sha: "f".repeat(40), base: "deploy-x", root: W, run: fake({ status: 0 }) }).error, "tip gate: ffffffff is not in this clone after fetching deploy-x");
    assert.equal(runTipGate({ sha: "t".repeat(40), base: "deploy-x", root: W }).error, `tip gate: not a commit sha: ${"t".repeat(40)}`);
  } finally { fs.rmSync(T, { recursive: true, force: true }); }
});

test("two gates on one tip sha at once each keep their own worktree and both get a verdict (#6494)", () => {
  const T = scratch("tip-gate-race-");
  const git = (cwd, ...a) => { const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd, encoding: "utf8" }); assert.equal(r.status, 0, `${a.join(" ")}: ${r.stderr}`); return r.stdout.trim(); };
  try {
    const W = path.join(T, "w");
    fs.mkdirSync(path.join(W, "tests/unit"), { recursive: true });
    git(W, "init", "-q", "-b", "deploy-x");
    fs.writeFileSync(path.join(W, U("a")), "// a\n");
    git(W, "add", "-A"); git(W, "commit", "-q", "-m", "tip");
    const sha = git(W, "rev-parse", "HEAD");
    const tests = [U("a")];
    // Gate B runs whole while gate A sits in its ensure-built step (one tip, two PRs' trusted rows): the old shared
    // `wt-<sha12>` path had B's pre-clean remove A's tree, and A's worktree add / tests then failed → `base: WAIT`.
    const seen = { A: [], B: [] };
    let inner = null;
    const fake = (who, nest) => (cmd, args, opts) => {
      if (cmd === "git") return spawnSync(cmd, args, opts);
      seen[who].push({ step: args[0], cwd: opts.cwd, exists: fs.existsSync(path.join(opts.cwd, U("a"))) });
      if (nest && args[0] !== "--test") inner = runTipGate({ sha, base: "deploy-x", root: W, tests, runId: `${process.pid}-bbbbbb`, run: fake("B", false) });
      return args[0] === "--test" ? { status: 0, stdout: "ok 1 - a\n" } : { status: 0, stdout: "", stderr: "" };
    };
    const outer = runTipGate({ sha, base: "deploy-x", root: W, tests, runId: `${process.pid}-aaaaaa`, run: fake("A", true) });
    assert.equal(inner?.state, "green", `the inner gate gets a verdict: ${JSON.stringify(inner)}`);
    assert.equal(outer.state, "green", `the outer gate gets a verdict too: ${JSON.stringify(outer)}`);
    assert.notEqual(seen.A[0].cwd, seen.B[0].cwd, "a worktree per run, not per sha");
    assert.ok(seen.A.every((s) => s.exists) && seen.B.every((s) => s.exists), "neither run's tree was removed under it");
    assert.ok(seen.A[0].cwd.endsWith(`wt-${sha.slice(0, 12)}-${process.pid}-aaaaaa`), seen.A[0].cwd);
    assert.equal(git(W, "worktree", "list").split("\n").length, 1, "each owner removed and pruned its own");
  } finally { fs.rmSync(T, { recursive: true, force: true }); }
});

test("gitReason quotes git's fatal line, not its first progress line (#6494)", () => {
  assert.equal(gitReason("Preparing worktree (detached HEAD 7bf61a61)\nfatal: '/x/wt' already exists\n"), "fatal: '/x/wt' already exists");
  assert.equal(gitReason("Preparing worktree (detached HEAD 7bf61a61)\nsomething else\n"), "something else", "no fatal: the last line");
  assert.equal(gitReason(""), "(no stderr)");
});

test("ownWorktreePath: this run's own path; a dead run's leftover is swept, a live run's never (#6494)", () => {
  const T = scratch("tip-gate-own-");
  try {
    for (const n of ["wt-abc-111-aa", "wt-abc-222-bb", "wt-other-111-aa", "wt-abc"]) fs.mkdirSync(path.join(T, n));
    const p = ownWorktreePath(T, "wt-abc", "333-cc", { alive: (pid) => pid === 222 });
    assert.equal(p, path.join(T, "wt-abc-333-cc"));
    assert.deepEqual(fs.readdirSync(T).sort(), ["wt-abc", "wt-abc-222-bb", "wt-other-111-aa"], "only the dead pid 111's tree for this prefix goes");
  } finally { fs.rmSync(T, { recursive: true, force: true }); }
});
