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
import { fileURLToPath } from "node:url";
import { estimateToolingFast, runToolingFast, scheduleLongestFirst, loadTimings, TIMINGS_FILE, TOOLING_FAST_FILES,
  parseToolingFastArgv, TOOLING_FAST_USAGE, tapFailureDetail, applyFileShard, tapSummary, emptyRunReason, ALL_SKIP_OK,
  selectToolingFastChanged, shardsCoveringFiles, DEFAULT_JOBS, changedHeader, EMPTY_DIFF_MESSAGE }
  from "../../tools/ci/tooling-fast.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "apex-tf-"));

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

test("CLI: default --jobs stays 1 (AGENTS.md rule 4 load limits); --changed is a first-class flag", () => {
  assert.equal(DEFAULT_JOBS, 1);
  const d = parseToolingFastArgv([]);
  assert.equal(d.jobs, 1);
  assert.equal(parseToolingFastArgv(["--changed"]).changed, true);
  assert.match(TOOLING_FAST_USAGE, /--changed/);
});

test("--changed selects pinned unit tests for a tool edit, not the full suite", () => {
  const all = ["tests/unit/behind-ship.test.mjs", "tests/unit/agent-config.test.mjs", "tests/unit/a11y-opts.test.mjs",
    "tests/unit/test-bg-outcome.test.mjs"];
  const pinIndex = new Map([["tools/ci/test-bg.mjs", new Set(["tests/unit/agent-config.test.mjs"])]]);
  const r = selectToolingFastChanged(["tools/ci/test-bg.mjs"], { allFiles: all, pinIndex,
    scripts: { "test:tooling-fast": "node tools/ci/tooling-fast.mjs" } });
  assert.equal(r.reason, "matched");
  assert.deepEqual(r.files.sort(), ["tests/unit/agent-config.test.mjs", "tests/unit/test-bg-outcome.test.mjs"].sort());
  assert.ok(r.files.length < all.length);
  assert.deepEqual(shardsCoveringFiles(r.files, all), ["2/2"]);
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

test("--changed CLI: the empty branch prints the message and exits 3 before any file runs (source pin; the diff cannot be faked in a unit test)", () => {
  const src = fs.readFileSync(fileURLToPath(new URL("../../tools/ci/tooling-fast.mjs", import.meta.url)), "utf8");
  assert.match(src, /if \(changedMeta\.reason === "empty"\) \{[\s\S]{0,600}console\.error\(EMPTY_DIFF_MESSAGE\);\s*process\.exit\(3\);/);
  assert.ok(src.indexOf('changedMeta.reason === "empty"') < src.indexOf("await runToolingFast(files"), "the guard runs before the runner");
});
