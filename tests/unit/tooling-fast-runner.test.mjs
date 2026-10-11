// tooling-fast-runner — the scheduler and the bounds of tools/ci/tooling-fast.mjs.
//
// Two behaviours added 2026-09-25, each pinned by running the real runner:
//   * LONGEST FIRST: files start in recorded-duration order (unmeasured first),
//     so a slow file never starts last and runs alone while the pool idles;
//   * A HUNG FILE FAILS BY NAME: node's --test-timeout bounds each test, and a
//     per-file wall kills a child that never exits — instead of the file running
//     to the CI job's timeout-minutes and the job reporting a nameless `cancelled`.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runToolingFast, scheduleLongestFirst, loadTimings, TIMINGS_FILE, TOOLING_FAST_FILES,
  parseToolingFastArgv, TOOLING_FAST_USAGE, tapFailureDetail, applyFileShard, tapSummary, emptyRunReason, ALL_SKIP_OK }
  from "../../tools/ci/tooling-fast.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "apex-tf-"));

test("longest recorded duration first; unmeasured files ahead of all, in list order", () => {
  const files = ["a", "b", "c", "d", "e"];
  const order = scheduleLongestFirst(files, { a: 100, b: 5000, d: 5000, e: 20 });
  assert.deepEqual(order, ["c", "b", "d", "a", "e"],
    "c has no timing (first), b and d tie at the top (list order kept), then descending");
  assert.deepEqual(scheduleLongestFirst(files, {}), files, "no timings at all is list order");
  assert.deepEqual(files, ["a", "b", "c", "d", "e"], "the input list is not mutated");
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

// The runner parses TAP failure blocks, independently of the host Node's
// default reporter and this suite's inherited NODE_TEST_CONTEXT.
test("a failed child preserves named TAP subtests and assertion diagnostics", async () => {
  const dir = tmp();
  try {
    const file = path.join(dir, "assertion.test.mjs");
    fs.writeFileSync(file, `import test from "node:test"; import assert from "node:assert/strict";
test("the arithmetic contract fails", () => assert.equal(1, 2));
`);
    const logPath = path.join(dir, "suite.log");
    const result = await runToolingFast([file], { jobs: 1, logPath, localTimingsPath: null });
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
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
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
