// tooling-fast-runner — the scheduler and the bounds of tools/ci/tooling-fast.mjs.
//
// Two behaviours added 2026-09-25, each pinned by running the real runner:
//   * LONGEST FIRST: files start in recorded-duration order (unmeasured first),
//     so a slow file never starts last and runs alone while the pool idles;
//   * A HUNG FILE FAILS BY NAME: node's --test-timeout bounds each test, and a
//     per-file wall kills a child that never exits — instead of the file running
//     to the CI job's timeout-minutes and the job reporting a nameless `cancelled`.
import "../helpers/git-fixture-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { verificationIdentity, beginVerification, finishVerification, readVerification, verificationPath, verificationMarker } from "../../tools/ci/verification-receipt.mjs";
import { buildToolingFastPinIndex, estimateToolingFast, runToolingFast, scheduleLongestFirst, loadTimings, TIMINGS_FILE, TOOLING_FAST_FILES,
  parseToolingFastArgv, TOOLING_FAST_USAGE, tapFailureDetail, applyFileShard, tapSummary, emptyRunReason, ALL_SKIP_OK,
  selectToolingFastChanged, shardsCoveringFiles, DEFAULT_JOBS, AUTO_JOBS, AUTO_JOBS_MAX_LOAD, autoJobs, changedHeader, EMPTY_DIFF_MESSAGE,
  isScriptTagOnlyIndexHtmlDiff, isScriptsOnlyPackageJsonDiff, isVersionOnlySwJsDiff, widenedLine, ciShardFiles,
  LONG_RUN_HINT, LONG_RUN_MS, NARROW_INFRA_TESTS, guardsScope, closingLine, workflowFailureAnnotations }
  from "../../tools/ci/tooling-fast.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "apex-tf-"));

test("verification receipts separate a suite verdict from current source applicability", () => {
  const dir = tmp(), logPath = path.join(dir, "suite.log");
  const source = { root: dir, head: "a".repeat(40), tree: "b".repeat(40) };
  try {
    fs.mkdirSync(path.join(dir, "tests", "unit"), { recursive: true });
    fs.writeFileSync(path.join(dir, "tests", "unit", "tooling-fast-runner.test.mjs"), "// selected fixture\n");
    fs.writeFileSync(path.join(dir, "example"), "example suite\n");
    fs.writeFileSync(path.join(dir, "another"), "another suite\n");
    assert.equal(readVerification(logPath, source).status, "unknown");
    fs.writeFileSync(logPath, "= run passed (1 passed, 0 failed)\n");
    const started = beginVerification({ logPath, files: ["tests/unit/tooling-fast-runner.test.mjs"], source });
    fs.writeFileSync(logPath, verificationMarker(started) + "\n= run passed (1 passed, 0 failed)\n");
    assert.equal(readVerification(logPath, source).status, "unknown", "a started run is not a pass");
    finishVerification(started, { logPath, source, ok: true });
    const current = readVerification(logPath, { ...source, head: "c".repeat(40) });
    assert.equal(current.status, "current", "committing the tested bytes preserves evidence");
    assert.equal(current.verdict, "passed");
    assert.deepEqual(current.files, ["tests/unit/tooling-fast-runner.test.mjs"]);
    assert.equal(readVerification(logPath, { ...source, tree: "d".repeat(40) }).status, "stale");
    assert.equal(readVerification(logPath, { ...source, root: "another-checkout" }).status, "stale");
    assert.equal(readVerification(logPath, { ...source, tree: null }).status, "unknown");
    fs.appendFileSync(logPath, "appended unrelated run\n");
    assert.equal(readVerification(logPath, source).reason, "log differs from completed run");
    const failed = beginVerification({ logPath, files: ["example"], source });
    fs.writeFileSync(logPath, verificationMarker(failed) + "\n= run failed (0 passed, 1 failed)\n");
    finishVerification(failed, { logPath, source, ok: false });
    assert.equal(readVerification(logPath, source).verdict, "failed", "a matching source cannot promote a failure");
    const changed = beginVerification({ logPath, files: ["example"], source });
    fs.writeFileSync(logPath, verificationMarker(changed) + "\n= run passed (1 passed, 0 failed)\n");
    finishVerification(changed, { logPath, source: { ...source, tree: "e".repeat(40) }, ok: true });
    assert.equal(readVerification(logPath, source).reason, "source changed during verification");
    const old = beginVerification({ logPath, files: ["example"], source });
    const latest = beginVerification({ logPath, files: ["another"], source });
    assert.equal(finishVerification(old, { logPath, source, ok: true }), null, "an older runner cannot replace the new receipt");
    fs.writeFileSync(logPath, verificationMarker(old) + "\n= run failed (0 passed, 1 failed)\n");
    assert.equal(finishVerification(latest, { logPath, source, ok: true }), null, "a newer receipt cannot adopt an older runner's log");
    assert.equal(JSON.parse(fs.readFileSync(verificationPath(logPath), "utf8")).id, latest.id);
    fs.rmSync(logPath);
    finishVerification(latest, { logPath, source, ok: true });
    assert.equal(readVerification(logPath, source).status, "unknown");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("receipt hashes detect ignored selected suites changed or deleted after a completed run", () => {
  const dir = tmp(), logPath = path.join(dir, "artifacts", "suite.log");
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  try {
    assert.equal(git("init", "-q").status, 0);
    fs.writeFileSync(path.join(dir, ".gitignore"), "artifacts/\n");
    assert.equal(git("add", ".").status, 0);
    fs.mkdirSync(path.dirname(logPath));
    const selected = path.join(dir, "artifacts", "selected.test.mjs");
    const link = path.join(dir, "artifacts", "linked.test.mjs");
    fs.symlinkSync("selected.test.mjs", link);
    for (const file of ["artifacts/selected.test.mjs", selected, "artifacts/linked.test.mjs"]) {
      fs.writeFileSync(selected, "original\n");
      const source = verificationIdentity(dir);
      const started = beginVerification({ logPath, files: [file], source });
      fs.writeFileSync(logPath, verificationMarker(started) + "\n= run passed\n");
      finishVerification(started, { logPath, source: verificationIdentity(dir), ok: true });
      assert.equal(readVerification(logPath, source).status, "current");
      fs.writeFileSync(selected, "modified\n");
      assert.equal(verificationIdentity(dir).tree, source.tree);
      assert.equal(readVerification(logPath, verificationIdentity(dir)).status, "stale");
      fs.unlinkSync(selected);
      assert.equal(verificationIdentity(dir).tree, source.tree);
      assert.equal(readVerification(logPath, verificationIdentity(dir)).status, "stale");
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("receipt hashes detect ignored selected input changes during the run even after restoration", () => {
  const dir = tmp(), logPath = path.join(dir, "artifacts", "suite.log");
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  try {
    assert.equal(git("init", "-q").status, 0);
    fs.writeFileSync(path.join(dir, ".gitignore"), "artifacts/\n");
    assert.equal(git("add", ".").status, 0);
    fs.mkdirSync(path.dirname(logPath));
    const selected = path.join(dir, "artifacts", "selected.test.mjs");
    const source = verificationIdentity(dir);
    for (const change of ["edit", "delete"]) {
      fs.writeFileSync(selected, "original\n");
      const started = beginVerification({ logPath, files: ["artifacts/selected.test.mjs"], source });
      fs.writeFileSync(logPath, verificationMarker(started) + "\n= run passed\n");
      if (change === "edit") fs.writeFileSync(selected, "modified\n"); else fs.unlinkSync(selected);
      assert.equal(verificationIdentity(dir).tree, source.tree);
      finishVerification(started, { logPath, source: verificationIdentity(dir), ok: true });
      fs.writeFileSync(selected, "original\n");
      const result = readVerification(logPath, source);
      assert.equal(result.status, "stale");
      assert.equal(result.reason, "selected input changed during verification");
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("legacy or missing selected-input snapshots retain the historical verdict without proving currency", () => {
  const dir = tmp(), logPath = path.join(dir, "suite.log");
  const source = { root: dir, head: "a".repeat(40), tree: "b".repeat(40) };
  try {
    const selected = path.join(dir, "selected.test.mjs");
    fs.writeFileSync(selected, "original\n");
    const started = beginVerification({ logPath, files: [selected], source });
    fs.writeFileSync(logPath, verificationMarker(started) + "\n= run passed\n");
    const finished = finishVerification(started, { logPath, source, ok: true });
    delete finished.inputHashes; delete finished.endInputHashes;
    fs.writeFileSync(verificationPath(logPath), JSON.stringify(finished));
    assert.equal(readVerification(logPath, source).status, "unknown");
    assert.equal(readVerification(logPath, source).verdict, "passed");
    fs.unlinkSync(selected);
    const missing = beginVerification({ logPath, files: [selected], source });
    fs.writeFileSync(logPath, verificationMarker(missing) + "\n= run passed\n");
    finishVerification(missing, { logPath, source, ok: true });
    assert.equal(readVerification(logPath, source).status, "unknown");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("verification source identity includes dirty and untracked inputs but ignores artifacts", () => {
  const dir = tmp();
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  try {
    assert.equal(git("init", "-q").status, 0);
    fs.writeFileSync(path.join(dir, ".gitignore"), "artifacts/\n");
    fs.writeFileSync(path.join(dir, "input.js"), "original\n");
    assert.equal(git("add", ".").status, 0);
    const before = verificationIdentity(dir);
    assert.match(before.tree, /^[0-9a-f]{40,64}$/);
    fs.mkdirSync(path.join(dir, "artifacts"));
    fs.writeFileSync(path.join(dir, "artifacts", "output.json"), "evidence\n");
    assert.equal(verificationIdentity(dir).tree, before.tree);
    fs.writeFileSync(path.join(dir, "input.js"), "modified\n");
    const dirty = verificationIdentity(dir);
    assert.notEqual(dirty.tree, before.tree);
    fs.writeFileSync(path.join(dir, "untracked.js"), "new input\n");
    assert.notEqual(verificationIdentity(dir).tree, dirty.tree);
    fs.rmSync(path.join(dir, "input.js"));
    assert.notEqual(verificationIdentity(dir).tree, dirty.tree);
    assert.equal(verificationIdentity(path.join(dir, "absent")).tree, null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("longest recorded duration first; unmeasured files ahead of all, in list order", () => {
  const files = ["a", "b", "c", "d", "e"];
  const order = scheduleLongestFirst(files, { a: 100, b: 5000, d: 5000, e: 20 });
  assert.deepEqual(order, ["c", "b", "d", "a", "e"],
    "c has no timing (first), b and d tie at the top (list order kept), then descending");
  assert.deepEqual(scheduleLongestFirst(files, {}), files, "no timings at all is list order");
  assert.deepEqual(files, ["a", "b", "c", "d", "e"], "the input list is not mutated");
});

test("timing estimate reports total and worker critical path", () => {
  const e = estimateToolingFast(["a", "b", "c"], { a: 100, b: 500, c: 200 }, 2);
  assert.equal(e.totalMs, 800);
  assert.equal(e.criticalPathMs, 500);
  assert.deepEqual(e.workerMs, [500, 300]);
  const unknown = estimateToolingFast(["a", "missing"], { a: 100 }, 2);
  assert.deepEqual(unknown.unmeasured, ["missing"]);
});

test("local measurements override the committed table", () => {
  const dir = tmp();
  try {
    const committed = path.join(dir, "committed.json"), local = path.join(dir, "local.json");
    fs.writeFileSync(committed, JSON.stringify({ ms: { x: 1, y: 2 } }));
    fs.writeFileSync(local, JSON.stringify({ ms: { y: 9 } }));
    assert.deepEqual(loadTimings([committed, local]), { x: 1, y: 9 });
    assert.deepEqual(loadTimings([path.join(dir, "absent.json")]), {}, "a missing table is no hint, never an error");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the committed timing table is well-formed and names real tooling-fast files", () => {
  const t = JSON.parse(fs.readFileSync(TIMINGS_FILE, "utf8"));
  const entries = Object.entries(t.ms || {});
  assert.ok(entries.length > 50, `only ${entries.length} recorded durations — the table is not doing its job`);
  for (const [f, ms] of entries) assert.ok(Number.isFinite(ms) && ms >= 0, `${f}: ${ms}`);
  const listed = new Set(TOOLING_FAST_FILES);
  const known = entries.filter(([f]) => listed.has(f)).length;
  assert.ok(known > entries.length / 2, "most recorded files must still be on the tooling-fast list");
});

test("a runner schedules by the table it is given, and logs the order it used", async () => {
  const dir = tmp();
  try {
    const mk = (n) => { const f = path.join(dir, `${n}.test.mjs`); fs.writeFileSync(f, `import test from "node:test"; test("${n}", () => {});\n`); return f; };
    const [fast, slow] = [mk("fast"), mk("slow")];
    const logPath = path.join(dir, "suite.log");
    const r = await runToolingFast([fast, slow], { jobs: 1, logPath, localTimingsPath: null,
      timings: { [path.relative(path.resolve(import.meta.dirname, "../.."), fast)]: 10,
                 [path.relative(path.resolve(import.meta.dirname, "../.."), slow)]: 9000 } });
    assert.equal(r.ok, true);
    const log = fs.readFileSync(logPath, "utf8");
    assert.match(log, /order=longest-first \(2 with a recorded duration, 0 unmeasured/);
    assert.ok(log.indexOf("START 1/2 ") < log.indexOf("slow.test.mjs"), "slow starts first");
    assert.match(log, /START 1\/2 \S*slow\.test\.mjs/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a hung FILE fails by name at the file wall, and its process group is killed", async () => {
  const dir = tmp();
  try {
    const hung = path.join(dir, "hung.test.mjs");
    const pidFile = path.join(dir, "pid");
    // The test itself passes; the file never exits (a live interval) — the
    // shape --test-timeout cannot see, because no test is running.
    fs.writeFileSync(hung, `import test from "node:test"; import fs from "node:fs";
fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
setInterval(() => {}, 1000);
test("passes, then the file hangs", () => {});
`);
    const logPath = path.join(dir, "suite.log");
    const t0 = Date.now();
    const r = await runToolingFast([hung], { jobs: 1, logPath, localTimingsPath: null, fileTimeoutMs: 3000 });
    assert.equal(r.ok, false);
    assert.ok(Date.now() - t0 < 20000, "the wall must stop it, not the test runner's patience");
    const log = fs.readFileSync(logPath, "utf8");
    assert.match(log, /FAIL {2}1\/1 \S*hung\.test\.mjs .*reason=timeout/, "the verdict names the file and why");
    const pid = Number(fs.readFileSync(pidFile, "utf8"));
    await new Promise((res) => setTimeout(res, 300));
    // Dead = gone, or a zombie awaiting a reaper (a container's PID 1 may never
    // reap it; kill(pid, 0) still succeeds on a zombie, so read the state).
    let state = "gone";
    try { state = fs.readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1][0]; } catch (_) { /* gone */ }
    if (state === "gone") assert.throws(() => process.kill(pid, 0), "no /proc entry, and no process either");
    assert.ok(state === "gone" || state === "Z", `the grandchild running the file must be dead, not orphaned (state ${state})`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a hung TEST fails as `not ok` with its name via --test-timeout", async () => {
  const dir = tmp();
  try {
    const f = path.join(dir, "stuck.test.mjs");
    fs.writeFileSync(f, `import test from "node:test";
test("waits forever", (t) => new Promise(() => {
  const keepAlive = setTimeout(() => {}, 60000);
  // This fixture tests test cancellation, not an unrelated open-handle leak.
  // The hung-FILE fixture above covers handles surviving a completed test.
  t.after(() => clearTimeout(keepAlive));
}));
`);
    const logPath = path.join(dir, "suite.log");
    const r = await runToolingFast([f], { jobs: 1, logPath, localTimingsPath: null, testTimeoutMs: 500, fileTimeoutMs: 30000 });
    assert.equal(r.ok, false);
    const log = fs.readFileSync(logPath, "utf8");
    // Node applies the bound to the file's own top-level test too (measured), so
    // the name reported is the file's or the test's, whichever expires first.
    assert.match(log, /not ok \d+ - \S*(stuck\.test\.mjs|waits forever)/, "the stuck file or test is named");
    assert.match(log, /test timed out after 500ms/);
    assert.doesNotMatch(log, /reason=timeout/, "the per-test bound fired, not the file wall");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// #3885: node 22's `--test` parent re-orders a deferred 0xFF byte when a pipe
// read ends inside a result frame's header, then spins forever draining the
// frame (100 % CPU, SIGTERM ignored). A file whose LAST stdout bytes are an
// unfinished frame header is the deterministic form of that read; under the
// default per-file subprocess it ran to the file wall. See TEST_ISOLATION_FLAG.
test("stdout ending in a partial v8 frame header does not hang the runner (#3885)", async () => {
  const dir = tmp();
  try {
    const f = path.join(dir, "partial-header.test.mjs");
    fs.writeFileSync(f, `import test from "node:test";
test("writes FF 0F 00 last", () => { process.stdout.write(Buffer.from([0xff, 0x0f, 0x00])); });
`);
    const logPath = path.join(dir, "suite.log");
    const r = await runToolingFast([f], { jobs: 1, logPath, localTimingsPath: null, fileTimeoutMs: 15000 });
    const log = fs.readFileSync(logPath, "utf8");
    assert.doesNotMatch(log, /reason=timeout/, "the runner must exit, not spin until the file wall");
    assert.equal(r.ok, true, log);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// The runner parses TAP failure blocks, independently of the host Node's
// default reporter and this suite's inherited NODE_TEST_CONTEXT.
test("a failed child preserves named TAP subtests and assertion diagnostics", async () => {
  const dir = tmp();
  const seen = [], log0 = console.log, actions0 = process.env.GITHUB_ACTIONS;
  try {
    process.env.GITHUB_ACTIONS = "true";
    console.log = (...args) => seen.push(args.join(" "));
    const file = path.join(dir, "assertion.test.mjs");
    fs.writeFileSync(file, `import test from "node:test"; import assert from "node:assert/strict";
test("the arithmetic contract fails", () => assert.equal(1, 2));
`);
    const logPath = path.join(dir, "suite.log");
    const result = await runToolingFast([file], { jobs: 1, logPath, localTimingsPath: null, workflowAnnotations: true });
    assert.equal(result.ok, false);
    assert.equal(result.failed, 1);
    assert.equal(result.results[0].exit, 1);
    const log = fs.readFileSync(logPath, "utf8");
    assert.match(log, /failed 1 subtest\(s\):/);
    assert.match(log, /not ok 1 - the arithmetic contract fails/);
    assert.match(log, /expected: 2/);
    assert.match(log, /actual: 1/);
    assert.match(log, /operator: 'strictEqual'/);
    assert.doesNotMatch(log, /reason=timeout/);
    const commands = seen.filter((line) => line.startsWith("::error "));
    assert.deepEqual(commands, [`::error file=tools/ci/tooling-fast.mjs,title=Tooling-fast failure::Unavailable or unsafe test path: exit; exit=1; signal=none; durationMs=${Math.round(result.results[0].durationMs)}`]);
    assert.equal(seen.at(-2), commands[0], "the annotation precedes the unchanged final verdict");
    assert.equal(seen.at(-1), "[tooling-fast] = run failed (0 passed, 1 failed)", "the original verdict remains red");
    assert.equal(log, [...seen.slice(0, -2), seen.at(-1)].join("\n") + "\n", "workflow commands leave the persisted runner log unchanged");

    seen.length = 0;
    const nested = await runToolingFast([file], { jobs: 1, logPath, localTimingsPath: null });
    assert.deepEqual({ ok: nested.ok, failed: nested.failed, exit: nested.results[0].exit }, { ok: false, failed: 1, exit: 1 });
    assert.deepEqual(seen.filter((line) => line.startsWith("::error ")), [], "imported runners default off even in Actions");
  } finally {
    console.log = log0;
    if (actions0 === undefined) delete process.env.GITHUB_ACTIONS; else process.env.GITHUB_ACTIONS = actions0;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("workflow failure annotations escape properties and never execute child TAP or unsafe paths", () => {
  const failure = { file: ["tests", "unit", "percent%, label.test.mjs"].join("/"), ok: false, exit: 1, durationMs: 12.4 };
  const commands = workflowFailureAnnotations([{ ...failure, stdout: "\n::error file=other::forged\r\n", stderr: "secret TAP" }], { GITHUB_ACTIONS: "true" });
  const escapedFile = ["tests", "unit", "percent%25%2C label.test.mjs"].join("/");
  const escapedMessage = ["tests", "unit", "percent%25, label.test.mjs: exit; exit=1; signal=none; durationMs=12"].join("/");
  assert.deepEqual(commands, [`::error file=${escapedFile},title=Tooling-fast failure::${escapedMessage}`]);
  for (const file of [undefined, "", "../outside", "safe/../outside", "safe/./file", "/absolute", "C:\\outside", "bad:name", "bad\r\n::error::forged", "x".repeat(257)]) {
    const [command] = workflowFailureAnnotations([{ ...failure, file }], { GITHUB_ACTIONS: "true" });
    assert.equal(command, "::error file=tools/ci/tooling-fast.mjs,title=Tooling-fast failure::Unavailable or unsafe test path: exit; exit=1; signal=none; durationMs=12");
  }
  const longFile = "x".repeat(256);
  assert.deepEqual(workflowFailureAnnotations([{ ...failure, file: longFile }], { GITHUB_ACTIONS: "true" }),
    [`::error file=${longFile},title=Tooling-fast failure::${longFile}: exit; exit=1; signal=none; durationMs=12`]);
});

test("workflow annotations require Actions and explicit failures and retain structured outcome distinctions", () => {
  const failure = { file: "tests/unit/tooling-fast-runner.test.mjs", ok: false, exit: 1, durationMs: 25 };
  for (const env of [{}, { GITHUB_ACTIONS: "false" }, { GITHUB_ACTIONS: "TRUE" }])
    assert.deepEqual(workflowFailureAnnotations([failure], env), [], "local output gets no workflow commands");
  assert.deepEqual(workflowFailureAnnotations([{ ...failure, ok: true }, { ...failure, ok: undefined }], { GITHUB_ACTIONS: "true" }), []);
  const outcomes = workflowFailureAnnotations([
    { ...failure, exit: null, signal: "SIGKILL", timedOut: true },
    { ...failure, exit: null, missing: true }, { ...failure, exit: 0, empty: true },
    { ...failure, signal: "SIGTERM\n::error::forged", durationMs: Infinity },
  ], { GITHUB_ACTIONS: "true" });
  const prefix = "::error file=tests/unit/tooling-fast-runner.test.mjs,title=Tooling-fast failure::tests/unit/tooling-fast-runner.test.mjs: ";
  assert.deepEqual(outcomes, [
    prefix + "timeout; exit=unknown; signal=SIGKILL; durationMs=25",
    prefix + "missing-file; exit=unknown; signal=none; durationMs=25",
    prefix + "empty-run; exit=0; signal=none; durationMs=25",
    prefix + "exit; exit=1; signal=none; durationMs=unknown",
  ]);
});

test("workflow errors cap file annotations at nine and reserve the tenth for omitted failures", () => {
  const failures = Array.from({ length: 12 }, (_, n) => ({ file: `failure-${n}.test.mjs`, ok: false, exit: 1, durationMs: n }));
  const env = { GITHUB_ACTIONS: "true" };
  const expected = Array.from({ length: 9 }, (_, n) => `::error file=failure-${n}.test.mjs,title=Tooling-fast failure::failure-${n}.test.mjs: exit; exit=1; signal=none; durationMs=${n}`);
  assert.deepEqual(workflowFailureAnnotations(failures.slice(0, 9), env), expected);
  assert.deepEqual(workflowFailureAnnotations([{ ...failures[0], ok: true }, ...failures], env), [
    ...expected, "::error file=tools/ci/tooling-fast.mjs,title=Tooling-fast failure::3 additional failed files omitted from annotations; see the tooling-fast log.",
  ]);
});

test("tapFailureDetail keeps deepEqual body rows and indexed actual members", () => {
  const tap = [
    "not ok 1 - ceiling breach",
    "  ---",
    "  error: |-",
    "    Expected values to be strictly deep-equal:",
    "    + actual - expected",
    "",
    "    + [",
    "    +   'js/net/lobby.js lines: 1895 > 1894 (+1)'",
    "    + ]",
    "    - []",
    "",
    "  name: 'AssertionError'",
    "  expected:",
    "  actual:",
    "    0: 'js/net/lobby.js lines: 1895 > 1894 (+1)'",
    "  operator: 'deepStrictEqual'",
    "  ...",
  ].join("\n");
  const detail = tapFailureDetail(tap).join("\n");
  assert.match(detail, /js\/net\/lobby\.js lines: 1895 > 1894 \(\+1\)/);
  assert.match(detail, /0: 'js\/net\/lobby\.js/);
  assert.match(detail, /operator: 'deepStrictEqual'/);
});

test("deepequal TAP failures keep the actual member list and error body", async () => {
  // The defect this exists for: Structural guards #841 (2026-10-04) failed
  // ratchets.test.mjs with empty Expected/Received because the runner kept
  // only the `actual:` / `expected:` keys and dropped `0: '…'` rows and the
  // `error: |-` deepEqual dump — so nobody could see which metric was over.
  const dir = tmp();
  try {
    const file = path.join(dir, "deepeq.test.mjs");
    fs.writeFileSync(file, `import test from "node:test"; import assert from "node:assert/strict";
test("ceiling breach", () => assert.deepEqual(["js/net/lobby.js lines: 1895 > 1894 (+1)"], []));
`);
    const logPath = path.join(dir, "suite.log");
    const result = await runToolingFast([file], { jobs: 1, logPath, localTimingsPath: null });
    assert.equal(result.ok, false);
    const log = fs.readFileSync(logPath, "utf8");
    assert.match(log, /not ok 1 - ceiling breach/);
    assert.match(log, /js\/net\/lobby\.js lines: 1895 > 1894 \(\+1\)/);
    assert.match(log, /operator: 'deepStrictEqual'/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("--quiet keeps START/PASS in the log only; the console still carries FAIL, its detail and the verdict", async () => {
  const dir = tmp();
  const seen = [];
  const log0 = console.log;
  try {
    const ok = path.join(dir, "ok.test.mjs");
    const bad = path.join(dir, "bad.test.mjs");
    fs.writeFileSync(ok, `import test from "node:test"; test("fine", () => {});\n`);
    fs.writeFileSync(bad, `import test from "node:test"; import assert from "node:assert/strict";\ntest("quiet contract fails", () => assert.equal(1, 2));\n`);
    const logPath = path.join(dir, "suite.log");
    console.log = (...a) => seen.push(a.join(" "));
    const r = await runToolingFast([ok, bad], { jobs: 1, logPath, localTimingsPath: null, quiet: true });
    console.log = log0;
    assert.equal(r.failed, 1);
    const out = seen.join("\n");
    assert.ok(!/\] (START|PASS) /.test(out), out);
    assert.ok(/\] FAIL +\d\/2 \S*bad\.test\.mjs/.test(out) && out.includes("not ok 1 - quiet contract fails"), out);
    assert.ok(/= run failed/.test(out), out);
    const log = fs.readFileSync(logPath, "utf8");
    assert.ok(/\] START /.test(log) && /\] PASS +\d\/2 \S*ok\.test\.mjs/.test(log), log);
    assert.equal(parseToolingFastArgv(["--changed", "--quiet"]).quiet, true);
    assert.ok(TOOLING_FAST_USAGE.includes("--quiet"));
  } finally {
    console.log = log0;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: default --jobs stays 1 (AGENTS.md rule 4 load limits); --changed is a first-class flag", () => {
  assert.equal(DEFAULT_JOBS, 1);
  const d = parseToolingFastArgv([]);
  assert.equal(d.jobs, 1);
  assert.equal(parseToolingFastArgv(["--changed"]).changed, true);
  assert.match(TOOLING_FAST_USAGE, /--changed/);
});

test("CLI auto width (B4): --jobs=2 only on a quiet box with no live browser run; an explicit --jobs always wins", () => {
  assert.equal(AUTO_JOBS, 2);
  assert.equal(AUTO_JOBS_MAX_LOAD, 2);
  assert.deepEqual(autoJobs({ busy: false, load1: 0.4 }), { jobs: 2, why: "no live browser run, loadavg 0.40 < 2" });
  assert.equal(autoJobs({ busy: true, load1: 0.1 }).jobs, 1, "rule 4: never a wide node run on top of a browser run");
  assert.equal(autoJobs({ busy: false, load1: 2 }).jobs, 1, "a busy box stays serial");
  assert.equal(autoJobs({ busy: null, load1: 0.1 }).jobs, 1, "unknown occupancy is treated as busy");
  assert.equal(autoJobs({ busy: false, load1: NaN }).jobs, 1, "unknown load stays serial");
  assert.equal(parseToolingFastArgv([]).jobsExplicit, false);
  assert.equal(parseToolingFastArgv(["--jobs=4"]).jobsExplicit, true);
  assert.equal(parseToolingFastArgv(["--jobs=4"]).jobs, 4);
});

test("--changed selects pinned unit tests for a tool edit, not the full suite", () => {
  const all = ["tests/unit/behind-ship.test.mjs", "tests/unit/agent-config.test.mjs", "tests/unit/a11y-opts.test.mjs",
    "tests/unit/test-bg-outcome.test.mjs"];
  const pinIndex = new Map([["tools/ci/test-bg.mjs", new Set(["tests/unit/agent-config.test.mjs"])]]);
  const r = selectToolingFastChanged(["tools/ci/test-bg.mjs"], { allFiles: all, pinIndex,
    scripts: { "test:tooling-fast": "node tools/ci/tooling-fast.mjs" } });
  assert.equal(r.reason, "matched");
  assert.deepEqual(r.files, ["tests/unit/agent-config.test.mjs"]);
  assert.ok(r.files.length < all.length);
  // Which CI halves run those files follows the CI split (time-balanced since 2026-10-21), not a stride.
  const covering = ["1/4", "2/4", "3/4", "4/4"].filter((sp) => ciShardFiles(all, sp).some((f) => r.files.includes(f)));
  assert.deepEqual(shardsCoveringFiles(r.files, all), covering);
  assert.ok(covering.length >= 1);
});

test("a file pin does not inherit a generic top-level tree pin", () => {
  const exact = "tests/unit/" + "exact.test.mjs";
  const dir = "tests/unit/" + "dir.test.mjs";
  const tree = "tests/unit/" + "tree.test.mjs";
  const all = [exact, dir, tree];
  const pinIndex = new Map([
    ["js/ui/hud.js", new Set([exact])],
    ["js/ui", new Set([dir])],
    ["js", new Set([tree])],
  ]);
  const r = selectToolingFastChanged(["js/ui/hud.js"], { allFiles: all, pinIndex,
    scripts: { "test:tooling-fast": "node tools/ci/tooling-fast.mjs" } });
  assert.deepEqual(r.files.sort(), [dir, exact].sort());
});

test("--changed fail-safes to the full list on infra paths", () => {
  const all = ["tests/unit/behind-ship.test.mjs", "tests/unit/agent-config.test.mjs"];
  const r = selectToolingFastChanged(["tests/groups.json"], { allFiles: all,
    scripts: { "test:tooling-fast": "node tools/ci/tooling-fast.mjs" } });
  assert.equal(r.reason, "run-all-path");
  assert.deepEqual(r.files, all);
});

test("--changed selector: one case per branch (empty, docs-only, tracked, unmatched, no-pin-match, matched)", () => {
  const scripts = { "test:tooling-fast": "node tools/ci/tooling-fast.mjs" };
  const all = ["tests/unit/" + "a.test.mjs", "tests/unit/docs-integrity.test.mjs", "tests/unit/" + "b.test.mjs"];
  const sel = (changed, extra = {}) => selectToolingFastChanged(changed, { allFiles: all, pinIndex: new Map(), scripts, ...extra });

  const empty = sel([]);
  assert.deepEqual([empty.reason, empty.files, empty.changed], ["empty", [], 0]);

  const docs = sel(["docs/README.md"]);
  assert.equal(docs.reason, "docs-only");
  assert.deepEqual(docs.files, ["tests/unit/docs-integrity.test.mjs"], "prose runs only the docs tests");

  // A dependencies edit is not scripts-only (#2890), so it still fails safe; pinned here so the case never reads the checkout's real diff.
  const pkgPair = { name: "f1-game", scripts: { a: "1" }, dependencies: { x: "1" } };
  const tracked = sel(["package.json"], { filePairs: { "package.json": { before: JSON.stringify(pkgPair), after: JSON.stringify({ ...pkgPair, dependencies: { x: "2" } }) } } });
  assert.equal(tracked.reason, "tracked");
  assert.equal(tracked.because, "package.json");
  assert.deepEqual(tracked.files, all, "a selector-machinery edit fails safe to the whole floor");

  const unmatched = sel(["totally/unknown.bin"]);
  assert.equal(unmatched.reason, "unmatched");
  assert.equal(unmatched.because, "totally/unknown.bin");
  assert.deepEqual(unmatched.files, all);

  const none = sel(["js/ui/hud.js"]);
  assert.equal(none.reason, "no-pin-match", "claimed by the floor but pinned by no unit test: run everything, not nothing");
  assert.deepEqual(none.files, all);

  const hit = sel(["js/ui/hud.js"], { pinIndex: new Map([["js/ui/hud.js", new Set(["tests/unit/" + "b.test.mjs"])]]) });
  assert.equal(hit.reason, "matched");
  assert.deepEqual(hit.files, ["tests/unit/" + "b.test.mjs"]);
  assert.equal(hit.changed, 1);
});

test("--changed selector with the REAL pin index: a tooling edit selects some pinned unit tests, never an empty set", () => {
  const r = selectToolingFastChanged(["tools/ci/sweep-shards.mjs"], { scripts: { "test:tooling-fast": "node tools/ci/tooling-fast.mjs" } });
  assert.ok(["matched", "no-pin-match", "unmatched", "run-all-path", "tracked"].includes(r.reason), r.reason);
  assert.ok(r.files.length > 0, "the real pin index must yield files (empty would verify nothing)");
  assert.ok(r.files.every((f) => f.startsWith("tests/unit/")), "only unit files");
});

test("--bail stops STARTING files after the first failure and says how many it skipped", async () => {
  const dir = tmp();
  try {
    const mk = (n, body) => { const f = path.join(dir, `${n}.test.mjs`); fs.writeFileSync(f, `import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs";\n${body}\n`); return f; };
    const marker = path.join(dir, "third-ran");
    const files = [
      mk("a-fails", `test("a", () => assert.equal(1, 2));`),
      mk("b-passes", `test("b", () => {});`),
      mk("c-marks", `test("c", () => fs.writeFileSync(${JSON.stringify(marker)}, "x"));`),
    ];
    const logPath = path.join(dir, "suite.log");
    const r = await runToolingFast(files, { jobs: 1, order: "list", bail: true, logPath, localTimingsPath: null });
    assert.equal(r.ok, false);
    assert.equal(r.failed, 1);
    assert.equal(r.notStarted, 2, "the two files after the failure never started");
    assert.equal(fs.existsSync(marker), false, "a file after the first failure must not run under --bail");
    const log = fs.readFileSync(logPath, "utf8");
    assert.match(log, /bail: stopped starting files after the first failure; 2 of 3 file\(s\) not started/);
    assert.match(log, /= run failed \(0 passed, 1 failed\)/, "the verdict line keeps its shape (test-bg and session-status anchor on it)");
    // Without --bail the same list runs to the end.
    const full = await runToolingFast(files, { jobs: 1, order: "list", logPath: path.join(dir, "full.log"), localTimingsPath: null });
    assert.equal(full.notStarted, 0);
    assert.equal(full.passed + full.failed, 3);
    assert.equal(fs.existsSync(marker), true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("CLI: --bail is a first-class flag and defaults off", () => {
  assert.equal(parseToolingFastArgv([]).bail, false);
  assert.equal(parseToolingFastArgv(["--bail", "--shard=1/2"]).bail, true);
  assert.match(TOOLING_FAST_USAGE, /--bail/);
});

// #3951: ci.yml's guards shards ask --print-scope whether to run the whole floor.
test("guards scope: only a pull request that touches no tooling narrows to --changed", () => {
  const js = ["js/perf/governor.js", "css/hud.css"];
  assert.equal(guardsScope(js, "pull_request").mode, "changed");
  assert.equal(guardsScope(["docs/TESTING.md", "AGENTS.md"], "pull_request").mode, "changed", "docs-only narrows too");
  for (const f of ["tools/ci/tooling-fast.mjs", "tests/unit/tooling-fast-runner.test.mjs", ".github/workflows/ci.yml", "package.json", "package-lock.json"]) {
    const r = guardsScope([...js, f], "pull_request");
    assert.equal(r.mode, "full", `${f} keeps the whole floor`);
    assert.match(r.reason, new RegExp(f.replace(/[.]/g, "\\.")));
  }
  for (const ev of ["push", "schedule", "workflow_dispatch", undefined]) {
    assert.equal(guardsScope(js, ev).mode, "full", `${ev}: only a pull request narrows (the deploy push and the train stay full)`);
  }
  assert.equal(guardsScope([], "pull_request").mode, "full", "an empty diff stays full (--changed exits 3 on one)");
  // Joined, not literal: these two paths do not exist, and docs-integrity checks every path a comment or string names.
  assert.equal(guardsScope([["toolsy", "x.js"].join("/"), ["js", "tests", "x.js"].join("/")], "pull_request").mode, "changed",
    "prefixes are anchored directories");
  assert.equal(parseToolingFastArgv(["--print-scope"]).printScope, true);
  assert.match(TOOLING_FAST_USAGE, /--print-scope/);
});

test("CLI: --help and unknown flags never start the suite", () => {
  assert.match(TOOLING_FAST_USAGE, /--jobs=N/);
  assert.equal(parseToolingFastArgv(["--help"]).help, true);
  assert.equal(parseToolingFastArgv(["-h"]).help, true);
  assert.throws(() => parseToolingFastArgv(["--help-me"]), /unknown flag --help-me/);
  assert.throws(() => parseToolingFastArgv(["--paralel"]), /unknown flag --paralel/);
  const ok = parseToolingFastArgv(["--jobs=3", "--record", "tests/unit/behind-ship.test.mjs"]);
  assert.equal(ok.help, false);
  assert.equal(ok.jobs, 3);
  assert.equal(ok.record, true);
  assert.deepEqual(ok.files, ["tests/unit/behind-ship.test.mjs"]);
  const sh = parseToolingFastArgv(["--shard=1/2", "--jobs=4"]);
  assert.equal(sh.shard, "1/2");
  assert.deepEqual(applyFileShard(["a", "b", "c", "d"], "1/2"), ["a", "c"]);
  assert.deepEqual(applyFileShard(["a", "b", "c", "d"], "2/2"), ["b", "d"]);
  assert.throws(() => applyFileShard(["a"], "3/2"), /bad --shard/);
});

// TF1 — exit 0 is not a verdict. Each fixture is run through the real runner.
test("tapSummary / emptyRunReason read the TAP footer", () => {
  const foot = (o) => Object.entries({ tests: 0, suites: 0, pass: 0, fail: 0, cancelled: 0, skipped: 0, todo: 0, ...o })
    .map(([k, v]) => `# ${k} ${v}`).join("\n");
  assert.equal(emptyRunReason(foot({ tests: 3, pass: 3 })), null);
  assert.equal(emptyRunReason(foot({ tests: 3, pass: 1, skipped: 2 })), null, "some skips are fine while something passed");
  assert.match(emptyRunReason(foot({ tests: 0 })), /zero tests/);
  assert.match(emptyRunReason(foot({ tests: 3, skipped: 3 })), /no test passed/);
  assert.match(emptyRunReason(foot({ tests: 2, todo: 2 })), /no test passed/);
  assert.match(emptyRunReason(foot({ tests: 4, pass: 1 })), /only 1 of 4/);
  assert.match(emptyRunReason("no footer at all"), /no TAP footer/);
  // node counts a test-less file as ONE passing test named after the file:
  // Fixture labels borrow REAL repo paths (the comment-citation guard requires every
  // path-shaped token to exist); the TAP text is synthetic.
  const self = "TAP version 13\nok 1 - tests/unit/a11y-pwa-pass.test.mjs\n" + foot({ tests: 1, pass: 1 });
  assert.match(emptyRunReason(self, "tests/unit/a11y-pwa-pass.test.mjs"), /registered no tests/);
  assert.equal(emptyRunReason("ok 1 - a real single test\n" + foot({ tests: 1, pass: 1 }), "tests/unit/ai-band.test.mjs"), null);
  assert.deepEqual(ALL_SKIP_OK, {}, "the opt-out list starts empty: every entry needs a written reason");
});

test("a file that runs zero tests, skips every test, or calls process.exit(0) FAILS the runner; a real pass still passes", async () => {
  const dir = tmp();
  try {
    const mk = (n, body) => { const f = path.join(dir, `${n}.test.mjs`); fs.writeFileSync(f, body); return f; };
    const files = {
      zero: mk("zero", `export const x = 1;\n`),
      allskip: mk("allskip", `import test from "node:test"; test("a", { skip: true }, () => {}); test("b", { todo: true }, () => {});\n`),
      exit0: mk("exit0", `import test from "node:test"; test("never runs", () => {}); process.exit(0);\n`),
      good: mk("good", `import test from "node:test"; test("ok", () => {}); test("skipped one", { skip: true }, () => {});\n`),
    };
    const logPath = path.join(dir, "suite.log");
    const r = await runToolingFast(Object.values(files), { jobs: 1, logPath, localTimingsPath: null, order: "list" });
    const byName = Object.fromEntries(r.results.map((x) => [path.basename(x.file, ".test.mjs"), x.ok]));
    assert.deepEqual(byName, { zero: false, allskip: false, exit0: false, good: true });
    assert.equal(r.ok, false);
    const log = fs.readFileSync(logPath, "utf8");
    assert.match(log, /FAIL .*zero\.test\.mjs .*reason=empty-run/);
    assert.match(log, /FAIL .*allskip\.test\.mjs .*reason=empty-run/);
    assert.match(log, /FAIL .*exit0\.test\.mjs .*reason=empty-run/);
    assert.match(log, /PASS .*good\.test\.mjs/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("isolated performance benchmarks run serially before ordinary files run in parallel with contiguous progress indices", async () => {
  const dir = tmp();
  try {
    const events = path.join(dir, "events.jsonl");
    const mk = (name, body) => {
      const file = path.join(dir, name + ".test.mjs");
      fs.writeFileSync(file, `import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs";
const event = action => fs.appendFileSync(${JSON.stringify(events)}, JSON.stringify({ name: ${JSON.stringify(name)}, action }) + "\\n");
test(${JSON.stringify(name)}, async () => { event("start"); ${body} event("end"); });\n`);
      return file;
    };
    const isolatedA = mk("isolated-a", "await new Promise(resolve => setTimeout(resolve, 250));");
    const isolatedB = mk("isolated-b", "await new Promise(resolve => setTimeout(resolve, 250));");
    const isolatedNames = new Set(["isolated-a", "isolated-b"]);
    const markerA = path.join(dir, "a-started"), markerB = path.join(dir, "b-started");
    const rendezvous = (own, other) => `fs.writeFileSync(${JSON.stringify(own)}, "started");
const deadline = Date.now() + 10000;
while (!fs.existsSync(${JSON.stringify(other)}) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
assert.ok(fs.existsSync(${JSON.stringify(other)}), "ordinary files must run concurrently");`;
    const a = mk("ordinary-a", rendezvous(markerA, markerB));
    const b = mk("ordinary-b", rendezvous(markerB, markerA));
    const logPath = path.join(dir, "suite.log");
    const result = await runToolingFast([a, isolatedA, b, isolatedB], { jobs: 2, order: "list", isolatedFiles: [isolatedA, isolatedB], logPath });
    assert.equal(result.ok, true);
    assert.equal(result.passed, 4); assert.equal(result.failed, 0); assert.equal(result.notStarted, 0);
    const history = fs.readFileSync(events, "utf8").trim().split("\n").map(JSON.parse);
    assert.deepEqual(history.slice(0, 4), [
      { name: "isolated-a", action: "start" }, { name: "isolated-a", action: "end" },
      { name: "isolated-b", action: "start" }, { name: "isolated-b", action: "end" },
    ]);
    const active = new Set(); let maxOrdinary = 0;
    for (const event of history) {
      if (event.action === "start") {
        if (isolatedNames.has(event.name)) assert.equal(active.size, 0, "isolated benchmarks must not overlap any child");
        else assert.equal([...active].some(name => isolatedNames.has(name)), false, "an ordinary child overlaps an isolated benchmark");
        active.add(event.name); maxOrdinary = Math.max(maxOrdinary, [...active].filter(name => !isolatedNames.has(name)).length);
      } else active.delete(event.name);
    }
    assert.equal(maxOrdinary, 2, "ordinary children still use both permitted slots");
    assert.equal(active.size, 0);
    const log = fs.readFileSync(logPath, "utf8");
    assert.match(log, /isolated prefix=.*isolated-a\.test\.mjs,.*isolated-b\.test\.mjs before parallel pool/);
    assert.match(log, /START 1\/4 \S*isolated-a\.test\.mjs/);
    assert.match(log, /START 2\/4 \S*isolated-b\.test\.mjs/);
    assert.match(log, /START 3\/4 \S*ordinary-a\.test\.mjs/);
    assert.match(log, /START 4\/4 \S*ordinary-b\.test\.mjs/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

for (const failIsolated of [true, false]) test(`isolated scheduling counts unstarted files under bail after ${failIsolated ? "isolated" : "ordinary"} failure`, async () => {
  const dir = tmp();
  try {
    const events = path.join(dir, "events");
    const mk = (name, fail) => {
      const file = path.join(dir, name + ".test.mjs");
      fs.writeFileSync(file, `import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs";
test(${JSON.stringify(name)}, () => { fs.appendFileSync(${JSON.stringify(events)}, ${JSON.stringify(name + "\n")}); assert.equal(${fail}, false); });\n`);
      return file;
    };
    const ordinary = mk("ordinary", !failIsolated), isolated = mk("isolated", failIsolated), later = mk("later", false);
    const result = await runToolingFast([ordinary, isolated, later], { jobs: 1, order: "list", bail: true,
      isolatedFiles: [isolated], logPath: path.join(dir, "suite.log") });
    assert.equal(result.ok, false); assert.equal(result.failed, 1);
    assert.equal(result.passed, failIsolated ? 0 : 1);
    assert.equal(result.notStarted, failIsolated ? 2 : 1);
    assert.deepEqual(fs.readFileSync(events, "utf8").trim().split("\n"), failIsolated ? ["isolated"] : ["isolated", "ordinary"]);
    assert.match(fs.readFileSync(path.join(dir, "suite.log"), "utf8"),
      new RegExp(`bail: stopped starting files after the first failure; ${result.notStarted} of 3 file\\(s\\) not started`));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// --changed follow-up: an empty diff must never read as a green run, and the header must say why it fell back.
test("--changed: every selector result carries the real diff size; a fallback names the path that forced it", () => {
  const all = ["tests/unit/docs-integrity.test.mjs", "tests/unit/agent-config.test.mjs"];
  const opts = { allFiles: all, pinIndex: new Map(), scripts: {} };
  const empty = selectToolingFastChanged([], opts);
  assert.deepEqual([empty.reason, empty.files, empty.changed], ["empty", [], 0]);
  const runAll = selectToolingFastChanged(["tools/lib/hud-survey-matrix.mjs", "docs/README.md"], opts);   // tools/lib/ is a run-all path (the real #2663 case)
  assert.equal(runAll.reason, "run-all-path");
  assert.equal(runAll.changed, 2, "a whole-floor fallback used to print changed=0");
  assert.equal(runAll.because, "tools/lib/hud-survey-matrix.mjs", "the first matching run-all path is named");
  assert.equal(runAll.files.length, all.length);
});

test("--changed header: reason, real diff size, files, because=<path>; the empty message tells the caller what to do", () => {
  assert.equal(changedHeader({ reason: "run-all-path", changed: 3, because: "tools/lib/hud-survey-matrix.mjs", shards: ["1/2", "2/2"] }, 662),
    "[tooling-fast] --changed reason=run-all-path changed=3 files=662 because=tools/lib/hud-survey-matrix.mjs shards=1/2,2/2");
  assert.equal(changedHeader({ reason: "matched", changed: 5, shards: [] }, 52), "[tooling-fast] --changed reason=matched changed=5 files=52 shards=none");
  assert.match(EMPTY_DIFF_MESSAGE, /EMPTY diff against origin\/claude\/f1-game-project-26h3ng — nothing was selected, nothing verified \(exit 3\)/);
  assert.match(EMPTY_DIFF_MESSAGE, /without --changed/);
});

test("--changed CLI: an empty selection reports reason=empty and the message tells the caller to drop --changed", () => {
  const r = selectToolingFastChanged([], { allFiles: ["tests/unit/" + "a.test.mjs"] });
  assert.equal(r.reason, "empty");
  assert.deepEqual(r.files, [], "nothing selected → the CLI exits 3 instead of running an empty floor");
  assert.match(changedHeader({ reason: r.reason, changed: 0, shards: r.shards }, 1), /reason=empty changed=0 files=1 shards=none/);
});

// #2890 — script-tag / scripts-only / version-only infra must not widen to the full suite.
test("#2890 classifiers: script-tag index.html, scripts-only package.json, version-only sw.js", () => {
  assert.equal(isScriptTagOnlyIndexHtmlDiff(
    "diff --git a/index.html b/index.html\n--- a/index.html\n+++ b/index.html\n@@ -10 +10 @@\n+  <script src=\"js/game.js?v=dev\"></script>\n"), true);
  assert.equal(isScriptTagOnlyIndexHtmlDiff(
    "--- a/index.html\n+++ b/index.html\n@@ -1 +1 @@\n-<title>Apex</title>\n+<title>Apex 26</title>\n"), false);
  const pkgBase = { name: "f1-game", version: "0.0.0", scripts: { test: "node --test" }, dependencies: { x: "1" } };
  assert.equal(isScriptsOnlyPackageJsonDiff(
    JSON.stringify(pkgBase),
    JSON.stringify({ ...pkgBase, scripts: { test: "node --test", "test:x": "node x" }, version: "0.0.1" })), true);
  assert.equal(isScriptsOnlyPackageJsonDiff(
    JSON.stringify(pkgBase),
    JSON.stringify({ ...pkgBase, dependencies: { x: "2" } })), false);
  assert.equal(isVersionOnlySwJsDiff(
    "--- a/sw.js\n+++ b/sw.js\n@@ -19 +19 @@\n-const CACHE_PREFIX = \"apex26-\";\n+const CACHE_PREFIX = \"apex26-v2-\";\n"), true);
  assert.equal(isVersionOnlySwJsDiff(
    "--- a/sw.js\n+++ b/sw.js\n@@ -1 +1 @@\n-const NAV_RACE_MS = 3000;\n+const NAV_RACE_MS = 4000;\n"), false, "NAV_RACE_MS is not a cache/version constant name");
});

test("#2890 --changed: script-tag-only index.html selects a named set, not the full suite", () => {
  const seeds = NARROW_INFRA_TESTS["index.html"];
  const all = [...seeds, "tests/unit/agent-config.test.mjs", "tests/unit/behind-ship.test.mjs"];
  const r = selectToolingFastChanged(["index.html"], {
    allFiles: all, pinIndex: new Map(), scripts: {},
    fileDiffs: { "index.html": "--- a/index.html\n+++ b/index.html\n@@ -10 +10 @@\n+<script src=\"js/core/log.js?v=dev\"></script>\n" },
  });
  assert.equal(r.reason, "narrow-infra");
  assert.ok(r.files.length < all.length, `expected narrow, got ${r.files.length}/${all.length}`);
  assert.deepEqual(r.files.sort(), seeds.filter((f) => all.includes(f)).sort());
  assert.equal(r.widened, undefined);
});

test("#2890 --changed: scripts-only package.json does not widen", () => {
  const seeds = NARROW_INFRA_TESTS["package.json"];
  const all = [...seeds, "tests/unit/agent-config.test.mjs"];
  const before = JSON.stringify({ name: "f1-game", version: "0.0.0", scripts: { a: "1" }, dependencies: { x: "1" } });
  const after = JSON.stringify({ name: "f1-game", version: "0.0.1", scripts: { a: "1", b: "2" }, dependencies: { x: "1" } });
  const r = selectToolingFastChanged(["package.json"], {
    allFiles: all, pinIndex: new Map(), scripts: { a: "1", b: "2" },
    filePairs: { "package.json": { before, after } },
  });
  assert.ok(r.reason === "narrow-infra" || r.reason === "matched", r.reason);
  assert.ok(r.files.length < all.length);
  assert.ok(r.files.every((f) => seeds.includes(f)));
});

test("#2890 --changed: sw.js version-only bump does not widen", () => {
  const seeds = NARROW_INFRA_TESTS["sw.js"];
  const all = [...seeds, "tests/unit/agent-config.test.mjs"];
  const r = selectToolingFastChanged(["sw.js"], {
    allFiles: all, pinIndex: new Map(), scripts: {},
    fileDiffs: { "sw.js": "--- a/sw.js\n+++ b/sw.js\n@@ -19 +19 @@\n-const CACHE_PREFIX = \"apex26-\";\n+const CACHE_PREFIX = \"apex26-x-\";\n" },
  });
  assert.ok(r.files.length < all.length);
  assert.ok(r.files.every((f) => seeds.includes(f)));
});

test("#2890 --changed: non-benign index.html still widens and names WIDENED:", () => {
  const all = ["tests/unit/load-order.test.mjs", "tests/unit/agent-config.test.mjs", "tests/unit/behind-ship.test.mjs"];
  const r = selectToolingFastChanged(["index.html"], {
    allFiles: all, pinIndex: new Map(), scripts: {},
    fileDiffs: { "index.html": "--- a/index.html\n+++ b/index.html\n@@ -1 +1 @@\n-<title>A</title>\n+<title>B</title>\n" },
  });
  assert.equal(r.reason, "tracked");
  assert.equal(r.files.length, all.length);
  assert.equal(r.because, "index.html");
  assert.equal(r.widened, "index.html non-script change");
  assert.equal(widenedLine(r, all.length), `WIDENED: index.html non-script change (${all.length} files)`);
});

test("#2890 --changed CLI prints WIDENED first and the long-run hint when estimated over ~2 min (source pin)", () => {
  const src = fs.readFileSync(fileURLToPath(new URL("../../tools/ci/tooling-fast.mjs", import.meta.url)), "utf8");
  assert.match(src, /widenedLine\(changedMeta/);
  assert.match(src, /LONG_RUN_HINT/);
  assert.match(src, /criticalPathMs/);
  assert.ok(LONG_RUN_MS >= 120_000);
  assert.match(LONG_RUN_HINT, /nohup npm run test:tooling-fast -- --changed/);
});

test("applyFileShard with timings packs longest first onto the least-loaded shard; unmeasured files cost the median", () => {
  const files = ["a", "b", "c", "d", "e", "f"];
  const t = { a: 100, b: 90, c: 60, d: 50, e: 40, f: 10 };
  // LPT: a->s1 (100), b->s2 (90), c->s2 (150), d->s1 (150), e->s1 on the tie (190), f->s2 (160). List order is kept.
  assert.deepEqual(applyFileShard(files, "1/2", t), ["a", "d", "e"]);
  assert.deepEqual(applyFileShard(files, "2/2", t), ["b", "c", "f"]);
  // A file with no recorded time costs the median of the table (60 here): same plan as giving it that time.
  const more = [...files, "z"];
  for (const spec of ["1/2", "2/2"]) {
    assert.deepEqual(applyFileShard(more, spec, t), applyFileShard(more, spec, { ...t, z: 60 }), spec);
  }
  // Three and four shards (ci.yml since 2026-10-24) still partition the list.
  for (const n of [3, 4]) {
    const parts = Array.from({ length: n }, (_, i) => applyFileShard(more, `${i + 1}/${n}`, t));
    assert.deepEqual(parts.flat().sort(), [...more].sort());
    assert.equal(new Set(parts.flat()).size, more.length);
  }
  const parts = ["1/3", "2/3", "3/3"].map((s3) => applyFileShard(more, s3, t));
  assert.deepEqual(parts.flat().sort(), [...more].sort());
  assert.equal(new Set(parts.flat()).size, more.length);
});

test("applyFileShard: equal costs, or no table at all, reproduce the old stride", () => {
  const files = ["a", "b", "c", "d", "e"];
  assert.deepEqual(applyFileShard(files, "1/2", { a: 5, b: 5, c: 5, d: 5, e: 5 }), ["a", "c", "e"]);
  assert.deepEqual(applyFileShard(files, "2/2", { a: 5, b: 5, c: 5, d: 5, e: 5 }), ["b", "d"]);
  assert.deepEqual(applyFileShard(files, "2/2", {}), ["b", "d"]);
  assert.deepEqual(applyFileShard(files, "1/2"), ["a", "c", "e"]);
  assert.throws(() => applyFileShard(files, "0/2", { a: 1 }), /bad --shard/);
});

test("ciShardFiles: the two CI halves partition the list, balanced by the committed table, slowest files apart", () => {
  const all = TOOLING_FAST_FILES;
  const table = loadTimings([TIMINGS_FILE]);
  const known = Object.values(table).filter((v) => typeof v === "number").sort((x, y) => x - y);
  const median = known[known.length >> 1];
  const cost = (f) => (typeof table[f] === "number" ? table[f] : median);
  const sum = (fs0) => fs0.reduce((acc, f) => acc + cost(f), 0);
  const a = ciShardFiles(all, "1/2"), b = ciShardFiles(all, "2/2");
  assert.equal(a.length + b.length, all.length);
  assert.equal(new Set([...a, ...b]).size, all.length, "no file runs twice, none is dropped");
  const ratio = (x, y) => Math.max(sum(x), sum(y)) / Math.min(sum(x), sum(y));
  // The stride this replaced was 1407 s vs 770 s of recorded work on 2026-10-20 (tooling A hit its 12 min cap twice
  // that night) and flips with every file added, because an insertion moves every later file to the other half.
  const strideRatio = ratio(applyFileShard(all, "1/2"), applyFileShard(all, "2/2"));
  assert.ok(ratio(a, b) <= 1.05, `halves ${Math.round(sum(a) / 1000)} s vs ${Math.round(sum(b) / 1000)} s`);
  assert.ok(ratio(a, b) <= strideRatio, "never worse than the stride");
  const [first, second] = [...all].sort((x, y) => cost(y) - cost(x));
  assert.notEqual(a.includes(first), a.includes(second), "the two slowest files are not in the same half");
  // Every shard computes the same plan from the same inputs, and shardsCoveringFiles reads the same split.
  assert.deepEqual(ciShardFiles(all, "1/2"), a);
  assert.deepEqual(shardsCoveringFiles([a[0]], all, 2), ["1/2"]);
  assert.deepEqual(shardsCoveringFiles([b[0]], all, 2), ["2/2"]);
});

test("buildToolingFastPinIndex resolves relative import specifiers against the importing test (#3907)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pin-rel-"));
  fs.mkdirSync(path.join(root, "tests/unit"), { recursive: true });
  fs.writeFileSync(path.join(root, "tests/unit/verify-live.test.mjs"),
    'import { a } from "../../tools/ci/verify-live.mjs";\nimport h from "./helper.mjs";\n');
  const index = buildToolingFastPinIndex(["tests/unit/verify-live.test.mjs"], root);
  assert.ok(index.get("tools/ci/verify-live.mjs").has("tests/unit/verify-live.test.mjs"));
  assert.ok(!index.has("tools/ci"), "relative pins are exact, not directory-wide");
  assert.ok(!index.has("tests/unit"), "a sibling import must not pin the whole test directory");
});

test("--changed selects a test that imports its subject by relative path (#3907)", () => {
  const r = selectToolingFastChanged(["tools/ci/verify-live.mjs"]);
  assert.deepEqual(r.files.filter((f) => f === "tests/unit/verify-live.test.mjs"), ["tests/unit/verify-live.test.mjs"]);
});

test("closingLine: the verdict is the LAST output line of a CLI run, red or green (efficiency review finding 4)", async () => {
  assert.equal(closingLine(true, 3, 0), "= tooling-fast passed (3 files, 0 failed)");
  assert.equal(closingLine(false, 3, 1), "= tooling-fast failed (3 files, 1 failed)");
  const { spawnSync } = await import("node:child_process");
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "tf-closing-"));
  try {
    const bad = path.join(dir, "bad.test.mjs");
    fs.writeFileSync(bad, 'import t from "node:test";import a from "node:assert";t("x",()=>{a.equal(1,2)});\n');
    const r = spawnSync(process.execPath, [path.join(ROOT, "tools/ci/tooling-fast.mjs"), path.relative(ROOT, bad), "--jobs=1", "--quiet"],
      { cwd: ROOT, encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.equal(r.stdout.trimEnd().split("\n").pop(), "= tooling-fast failed (1 files, 1 failed)");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
