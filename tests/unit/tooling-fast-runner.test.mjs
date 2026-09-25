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
import { runToolingFast, scheduleLongestFirst, loadTimings, TIMINGS_FILE, TOOLING_FAST_FILES }
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
test("waits forever", () => new Promise(() => { setTimeout(() => {}, 60000); }));
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
