/* spec-timings.test.mjs — the duration history, and what it is allowed to say.
 *
 * Three properties carry the whole design and each has a way of failing
 * silently, which is why they are pinned rather than described:
 *
 *   MERGE IS IDEMPOTENT. CI will merge the same junit more than once (a re-run,
 *   a re-uploaded artifact, a job that reads both a run's junit AND its live
 *   log). If that double-counted, the median it feeds would drift upward on
 *   nothing but bookkeeping, and the budget derived from it would follow.
 *
 *   HISTORY IS BOUNDED. The file is COMMITTED, so an unbounded append is a
 *   repository that grows by a kilobyte per CI job forever.
 *
 *   PROVENANCE SURVIVES. select-budget must never present the inherited 79.7 s
 *   default as though it had been measured — the constant's own header records
 *   that mistaking a mean for a measurement cost three deploys.
 *
 * Run: node --test tests/unit/spec-timings.test.mjs   (npm run test:tooling-fast)
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJunit, parseLiveLog, mergeRows, emptyDb, serialise, saveDb, loadDb,
  growth, median, envBucket, isoSecond, normaliseSpec, defaultSources,
  KEEP, BUCKETS, TIMINGS_FILE } from "../../tools/ci/spec-timings.mjs";
import { specSecPerTest, billing, MEASURED, MIN_SAMPLES, CI_BUCKETS,
  timings } from "../../tools/ci/select-budget.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// One run of one spec, in the exact shape playwright.config.js's junit reporter
// writes it (verified against artifacts/test-results-45723/junit.xml, 2026-09-16):
// the testsuite carries the timestamp, the testcase carries `time`, and a PASS
// is a self-closing tag.
const JUNIT = `<testsuites id="" name="" tests="3" failures="0" time="120">
<testsuite name="specs/smoke.spec.js" timestamp="2026-09-16T06:06:01.994Z" hostname="render" tests="3" time="120">
<testcase name="Smoke › first" classname="specs/smoke.spec.js" time="10.5"/>
<testcase name="Smoke › second &amp; last" classname="specs/smoke.spec.js" time="100"/>
<testcase name="Smoke › skipped one" classname="specs/smoke.spec.js" time="0">
<skipped/>
</testcase>
</testsuite>
</testsuites>`;

const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), "spec-timings-"));

test("parseJunit reads Playwright's shape: suite timestamp, testcase time, tests/ prefix", () => {
  const rows = parseJunit(JUNIT);
  assert.deepEqual(rows.map((r) => r.spec), Array(2).fill("tests/specs/smoke.spec.js"),
    "junit's classname drops the tests/ prefix; every consumer needs it back");
  assert.deepEqual(rows.map((r) => r.title), ["Smoke › first", "Smoke › second & last"],
    "XML entities must be decoded, and a SKIPPED case measures nothing");
  assert.deepEqual(rows.map((r) => r.sec), [10.5, 100]);
  assert.deepEqual([...new Set(rows.map((r) => r.ts))], ["2026-09-16T06:06:01Z"],
    "the run-start second is the sample's identity — millisecond precision would never dedupe");
});

test("a RETRIED test is billed once, at its final attempt", () => {
  // Playwright writes one <testcase> per attempt under the same name. Billing
  // both would inflate every flaky test's history by construction — and flaky
  // tests are exactly the ones whose cost anyone wants to look up.
  const xml = `<testsuites><testsuite name="specs/logging.spec.js" timestamp="2026-09-16T01:00:00Z">
<testcase name="flaky" classname="specs/logging.spec.js" time="180"><failure message="x">y</failure></testcase>
<testcase name="flaky" classname="specs/logging.spec.js" time="42"/>
</testsuite></testsuites>`;
  const rows = parseJunit(xml);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sec, 42);
});

test("parseLiveLog reads the reporter's own end lines, and only the FINAL ones", () => {
  const log = [
    "[06:06:01] = run start: 3 tests, 1 worker(s), heartbeat 30s",
    "[06:07:16] + pass   1/3 tests/specs/smoke.spec.js › Smoke › first (73.0s)",
    "[06:08:00] ! retry  2/3 tests/specs/smoke.spec.js › Smoke › second (12.0s)",
    "[06:09:00] x FAIL   2/3 tests/specs/smoke.spec.js › Smoke › second (61.5s)",
    "[06:09:10] ~ skip   3/3 tests/specs/smoke.spec.js › Smoke › third (0.0s)",
    "[06:09:11] = run failed  (3/3 done, 1 failed)",
  ].join("\n");
  const rows = parseLiveLog(log, "2026-09-16T06:09:12.000Z");
  assert.deepEqual(rows.map((r) => [r.title, r.sec]),
    [["Smoke › first", 73], ["Smoke › second", 61.5]],
    "a retry is not a result and a skip is not a duration");
  assert.deepEqual([...new Set(rows.map((r) => r.ts))], ["2026-09-16T06:06:01Z"],
    "the log's ts is the RUN START, so it collides with the same run's junit");
  // The log has clock times and no date. A run that started before midnight and
  // ended after it must not claim to have started in the future.
  const rolled = parseLiveLog(log, "2026-09-17T00:04:00.000Z");
  assert.equal(rolled[0].ts, "2026-09-16T06:06:01Z");
  assert.deepEqual(parseLiveLog(log, null), [], "no date, no samples — never a guess");
  assert.deepEqual(parseLiveLog("nothing here", "2026-09-16T00:00:00Z"), []);
});

test("MERGE IS IDEMPOTENT: the same run, from either source, lands once", () => {
  // The measured defect this pins. A batch that carried a run's junit AND its
  // live log deduped the per-TEST series but summed the per-SPEC totals:
  // smoke.spec.js came out as "20 tests, 950 s" for a run of 10 tests in 475 s.
  const log = [
    "[06:06:01] = run start: 2 tests, 1 worker(s)",
    "[06:07:16] + pass   1/2 tests/specs/smoke.spec.js › Smoke › first (10.5s)",
    "[06:09:00] + pass   2/2 tests/specs/smoke.spec.js › Smoke › second & last (100.0s)",
  ].join("\n");
  const both = [...parseJunit(JUNIT), ...parseLiveLog(log, "2026-09-16T06:20:00Z")];
  const db = emptyDb();
  const first = mergeRows(db, both, { env: "local" });
  assert.equal(first.added, 2);
  assert.equal(first.collapsed, 2, "the log rows were the same run seen twice");
  const spec = db.specs["tests/specs/smoke.spec.js"];
  assert.deepEqual(spec.s, [["2026-09-16T06:06:01Z", "local", 110.5, 2]],
    "one run is one spec-level sample: 10.5 + 100 over 2 tests");

  // ...and merging it all again changes nothing at all.
  const before = serialise(db);
  const again = mergeRows(db, both, { env: "local" });
  assert.equal(again.added, 0);
  assert.equal(serialise(db), before, "a re-merge must be a byte-for-byte no-op");
});

test("a different run in the same second but a different BUCKET is a different sample", () => {
  const db = emptyDb();
  mergeRows(db, parseJunit(JUNIT), { env: "swiftshader" });
  mergeRows(db, parseJunit(JUNIT), { env: "llvmpipe" });
  const s = db.specs["tests/specs/smoke.spec.js"].s;
  assert.equal(s.length, 2, "two machines are two measurements, never one average");
  assert.deepEqual(s.map((x) => x[1]).sort(), ["llvmpipe", "swiftshader"]);
  assert.throws(() => mergeRows(emptyDb(), [], { env: "nvidia" }), /unknown env bucket/,
    "an unknown bucket is a typo that would quietly start a third history");
});

test("HISTORY IS BOUNDED at KEEP samples, keeping the NEWEST", () => {
  const db = emptyDb();
  for (let i = 0; i < KEEP + 5; i++) {
    const ts = `2026-09-${String(i + 1).padStart(2, "0")}T00:00:00Z`;
    mergeRows(db, [{ ts, spec: "tests/specs/smoke.spec.js", title: "a", sec: i }], { env: "local" });
  }
  const t = db.specs["tests/specs/smoke.spec.js"].t.a;
  assert.equal(t.length, KEEP, `the file is COMMITTED — an unbounded append grows the repo forever`);
  assert.equal(t[t.length - 1][2], KEEP + 4, "newest last");
  assert.equal(t[0][2], 5, "the oldest five were dropped, not the newest");
  // A smaller cap is honoured too, so the CI job can hold fewer than an agent does.
  const small = emptyDb();
  for (let i = 0; i < 6; i++)
    mergeRows(small, [{ ts: `2026-09-0${i + 1}T00:00:00Z`, spec: "tests/specs/dev-tools.spec.js", title: "a", sec: i }],
      { env: "local", keep: 2 });
  assert.equal(small.specs["tests/specs/dev-tools.spec.js"].t.a.length, 2);
});

test("serialisation is deterministic and small — sorted, one line per series", () => {
  const a = emptyDb(), b = emptyDb();
  const rows = [
    { ts: "2026-09-02T00:00:00Z", spec: "tests/specs/boot-guard.spec.js", title: "z", sec: 2 },
    { ts: "2026-09-01T00:00:00Z", spec: "tests/specs/aero-zones.spec.js", title: "y", sec: 1 },
  ];
  mergeRows(a, rows, { env: "local" });
  mergeRows(b, [...rows].reverse(), { env: "local" });
  assert.equal(serialise(a), serialise(b), "insertion order must not reach the file");
  const text = serialise(a);
  assert.match(text, /"tests\/specs\/aero-zones\.spec\.js"[\s\S]*"tests\/specs\/boot-guard\.spec\.js"/,
    "specs sorted, though they were merged in the other order");
  assert.deepEqual(JSON.parse(text).specs["tests/specs/aero-zones.spec.js"].t.y, [["2026-09-01T00:00:00Z", "local", 1]]);
  for (const line of text.split("\n"))
    assert.ok(!/^\s+\d+(\.\d+)?,?$/.test(line), `a sample was exploded across lines: ${line}`);
});

test("saveDb/loadDb round-trip, and a missing or corrupt file is an EMPTY history", () => {
  const dir = tmpdir();
  try {
    const file = path.join(dir, "nested", "spec-timings.json");
    assert.deepEqual(loadDb(file).specs, {}, "absent file: no history, not a crash");
    const db = emptyDb();
    mergeRows(db, parseJunit(JUNIT), { env: "swiftshader" });
    saveDb(db, file);
    assert.equal(serialise(loadDb(file)), serialise(db));
    fs.writeFileSync(file, "{ not json");
    assert.deepEqual(loadDb(file).specs, {},
      "a half-written file from a killed CI job must not take the budget tool down with it");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the GROWTH FLAG fires on 2x, inside one bucket, and never on thin history", () => {
  const db = emptyDb();
  const add = (sec, day, env = "swiftshader") => mergeRows(db,
    [{ ts: `2026-09-${String(day).padStart(2, "0")}T00:00:00Z`, spec: "tests/specs/boot-guard.spec.js", title: "a", sec }],
    { env });
  add(10, 1); add(10, 2);
  assert.deepEqual(growth(db), [], `under ${MIN_SAMPLES} samples there is no median, only the last run`);
  add(11, 3);
  assert.deepEqual(growth(db), [], "an ordinary run is not growth");
  add(40, 4);
  const flagged = growth(db).filter((r) => r.level === "test");
  assert.equal(flagged.length, 1, "40 s against a 10 s median is the flag's whole purpose");
  assert.equal(flagged[0].spec, "tests/specs/boot-guard.spec.js");
  assert.equal(flagged[0].bucket, "swiftshader");
  assert.equal(flagged[0].ratio, 4);

  // A RENDERER SWAP IS NOT A REGRESSION. The plan's own warning: mixing buckets
  // is how a move to a different GPU stack gets reported as a slow test.
  const mixed = emptyDb();
  for (const d of [1, 2, 3]) mergeRows(mixed,
    [{ ts: `2026-09-0${d}T00:00:00Z`, spec: "tests/specs/projection.spec.js", title: "a", sec: 10 }], { env: "swiftshader" });
  mergeRows(mixed, [{ ts: "2026-09-04T00:00:00Z", spec: "tests/specs/projection.spec.js", title: "a", sec: 90 }],
    { env: "llvmpipe" });
  assert.deepEqual(growth(mixed), [],
    "the 90 s llvmpipe run has no llvmpipe median to be 2x of — it is a new machine, not a regression");
});

test("growth bills a SPEC per test, so adding a test to a file is not growth", () => {
  const db = emptyDb();
  const run = (day, n, each) => mergeRows(db,
    Array.from({ length: n }, (_, i) => ({ ts: `2026-09-0${day}T00:00:00Z`,
      spec: "tests/specs/map-hooks.spec.js", title: `t${i}`, sec: each })), { env: "swiftshader" });
  run(1, 4, 10); run(2, 4, 10); run(3, 4, 10);
  run(4, 12, 10);   // three times the file, same cost per test
  assert.deepEqual(growth(db).filter((r) => r.level === "spec"), [],
    "a file that tripled its test count at an unchanged per-test cost has not got slower");
});

test("envBucket names the RUNNER, and an unmeasured box is never a CI estimate", () => {
  assert.equal(envBucket({}), "local");
  assert.equal(envBucket({ APEX_GL: "llvmpipe" }), "local", "off CI it is a local box whatever GL says");
  assert.equal(envBucket({ CI: "true" }), "swiftshader");
  assert.equal(envBucket({ CI: "1", APEX_GL: "angle,llvmpipe" }), "llvmpipe");
  for (const b of ["swiftshader", "llvmpipe", "local"]) assert.ok(BUCKETS.includes(b));
});

test("small helpers: isoSecond, median, normaliseSpec", () => {
  assert.equal(isoSecond("2026-09-16T06:06:01.994Z"), "2026-09-16T06:06:01Z");
  assert.equal(isoSecond("not a date"), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
  assert.equal(normaliseSpec("specs/projection.spec.js"), "tests/specs/projection.spec.js");
  assert.equal(normaliseSpec("./tests/specs/projection.spec.js"), "tests/specs/projection.spec.js");
  assert.equal(normaliseSpec("tests/specs/projection.spec.js one two"), "tests/specs/projection.spec.js");
});

test("defaultSources finds both junit layouts and invents nothing", () => {
  const dir = tmpdir();
  try {
    for (const d of ["test-results-123", "report-123", "logs", "test-results-empty"])
      fs.mkdirSync(path.join(dir, "artifacts", d), { recursive: true });
    for (const d of ["test-results-123", "report-123"])
      fs.writeFileSync(path.join(dir, "artifacts", d, "junit.xml"), JUNIT);
    assert.deepEqual(defaultSources(dir).map((f) => path.relative(dir, f)),
      ["artifacts/report-123/junit.xml", "artifacts/test-results-123/junit.xml"]);
    assert.deepEqual(defaultSources(path.join(dir, "nope")), [],
      "a tree with no artifacts/ is an empty list, never a throw");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/* ── select-budget's half: which number, and where it came from ───────────── */

test("FALLBACK: a spec with no CI history is billed at the 2026-08-07 constant, and SAYS so", () => {
  const empty = emptyDb();
  const r = specSecPerTest("tests/specs/smoke.spec.js", empty);
  assert.equal(r.sec, MEASURED.secPerTest);
  assert.equal(r.source, "constant");
  assert.equal(r.bucket, null);
});

test("MEASURED: a spec with enough CI samples is billed at its own median", () => {
  const db = emptyDb();
  const spec = "tests/specs/smoke.spec.js";
  // Four runs of a 2-test spec: 40, 60, 100 and 62 seconds per test.
  for (const [day, each] of [[1, 40], [2, 60], [3, 100], [4, 62]])
    mergeRows(db, [0, 1].map((i) => ({ ts: `2026-09-0${day}T00:00:00Z`, spec, title: `t${i}`, sec: each })),
      { env: "swiftshader" });
  const r = specSecPerTest(spec, db);
  assert.equal(r.source, "measured");
  assert.equal(r.bucket, "swiftshader");
  assert.equal(r.samples, 4);
  assert.equal(r.sec, 61, "median of 40/60/62/100 per test, not the 79.7 s default");
  // Below the floor it falls back: two samples is "the runs we happened to see".
  const thin = emptyDb();
  for (const day of [1, 2])
    mergeRows(thin, [{ ts: `2026-09-0${day}T00:00:00Z`, spec, title: "t0", sec: 5 }], { env: "swiftshader" });
  assert.equal(MIN_SAMPLES, 3);
  assert.equal(specSecPerTest(spec, thin).source, "constant");
});

test("a LOCAL history never sets a CI budget", () => {
  // This container is not a runner. Its numbers are worth recording and worth
  // reading; they are not worth billing a CI job with, and the seeded file is
  // entirely local — so this is the rule that keeps the seed honest.
  const db = emptyDb();
  const spec = "tests/specs/smoke.spec.js";
  for (const day of [1, 2, 3, 4])
    mergeRows(db, [{ ts: `2026-09-0${day}T00:00:00Z`, spec, title: "t0", sec: 5 }], { env: "local" });
  const r = specSecPerTest(spec, db);
  assert.equal(r.source, "constant", "four local samples must not displace the CI constant");
  assert.equal(r.sec, MEASURED.secPerTest);
  assert.ok(!CI_BUCKETS.includes("local"));
});

test("the bucket with the most samples wins, so a runner move re-bases the estimate", () => {
  const db = emptyDb();
  const spec = "tests/specs/smoke.spec.js";
  for (const day of [1, 2, 3])
    mergeRows(db, [{ ts: `2026-09-0${day}T00:00:00Z`, spec, title: "t0", sec: 90 }], { env: "swiftshader" });
  for (const day of [4, 5, 6, 7])
    mergeRows(db, [{ ts: `2026-09-0${day}T00:00:00Z`, spec, title: "t0", sec: 30 }], { env: "llvmpipe" });
  const r = specSecPerTest(spec, db);
  assert.equal(r.bucket, "llvmpipe");
  assert.equal(r.sec, 30, "averaging the two would describe neither machine");
});

test("billing() hands capacity() a per-spec rate that carries its provenance", () => {
  const b = billing("tests/specs/smoke.spec.js");
  assert.equal(b.perTestTimeoutSec, MEASURED.perTestTimeoutSec, "only the rate is re-derived");
  assert.equal(b.retries, MEASURED.retries);
  assert.ok(["measured", "constant"].includes(b.secPerTestSource));
  assert.ok(Number.isFinite(b.secPerTest));
});

/* ── the live reporter's half ─────────────────────────────────────────────── */

/** Drive tests/helpers/live-reporter.js over a fake run. Playwright's reporter
 *  API is small enough to stub exactly, and stubbing it is the only way to prove
 *  the writer works without 15 minutes of SwiftShader. */
async function fakeRun(tests, env) {
  const { default: LiveReporter } = await import("../../tests/helpers/live-reporter.js");
  const r = new LiveReporter();
  const lines = [];
  r.write = (l) => lines.push(l);
  const stubs = tests.map(([titles, ms]) => ({
    // [root, project, file, ...describes, title] — junit's `name` is what
    // follows the file, which is exactly what key() must reproduce.
    titlePath: () => ["", "render", "specs/smoke.spec.js", ...titles],
    location: { file: "/checkout/tests/specs/smoke.spec.js" },
    retries: 0, results: [{}], outcome: () => "expected", ms,
  }));
  r.onBegin({ workers: 1 }, { allTests: () => stubs });
  for (const t of stubs) {
    r.onTestBegin(t, { workerIndex: 0 });
    r.onTestEnd(t, { status: "passed", duration: t.ms, steps: [], attachments: [] });
  }
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try { await r.onEnd({ status: "passed" }); }
  finally { for (const k of Object.keys(env)) { delete process.env[k]; if (k in saved) process.env[k] = saved[k]; } }
  return { lines, reporter: r };
}

test("the reporter records a run through the same merge, on the same key as junit", async () => {
  const dir = tmpdir();
  const file = path.join(dir, "spec-timings.json");
  try {
    const { lines } = await fakeRun(
      [[["Apex 26 — smoke", "page loads without WebGL error"], 2434],
       [["Apex 26 — HUD", "minimap canvas has content after race starts"], 10078]],
      { APEX_SPEC_TIMINGS: "1", APEX_SPEC_TIMINGS_FILE: file });
    const db = JSON.parse(fs.readFileSync(file, "utf8"));
    const spec = db.specs["tests/specs/smoke.spec.js"];
    assert.ok(spec, "the spec key is the tests/-prefixed path, as junit's classname normalises to");
    assert.deepEqual(Object.keys(spec.t).sort(), [
      "Apex 26 — HUD › minimap canvas has content after race starts",
      "Apex 26 — smoke › page loads without WebGL error",
    ], "the TITLE key must be junit's `name` — describes joined to the title, with no file prefix");
    assert.deepEqual(spec.t["Apex 26 — smoke › page loads without WebGL error"].map((s) => s[2]), [2.434],
      "ms in, seconds out");
    assert.equal(spec.s[0][3], 2, "one spec-level row for the run, billed at 2 tests");
    assert.ok(lines.some((l) => /= run passed/.test(l)));
    const verdict = lines.findIndex((l) => /= run passed/.test(l));
    assert.ok(lines.slice(verdict + 1).some((l) => /spec timings/.test(l)),
      "the merge line comes AFTER the verdict line every background run greps for");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("without APEX_SPEC_TIMINGS the reporter writes nothing at all", async () => {
  const dir = tmpdir();
  const file = path.join(dir, "spec-timings.json");
  try {
    const { lines } = await fakeRun([[["Apex 26 — smoke", "a"], 1000]],
      { APEX_SPEC_TIMINGS_FILE: file });
    assert.equal(fs.existsSync(file), false,
      "OFF by default: a reporter that dirtied a tracked file on every npm test would be a trap");
    assert.ok(!lines.some((l) => /spec timings/.test(l)));
    assert.ok(lines.some((l) => /= slowest/.test(l)), "the existing summary is untouched");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a broken timings file cannot turn a green run red", async () => {
  const dir = tmpdir();
  // An unwritable target that does not depend on file MODE — the CI runner and
  // this container both run as root, where a chmod 500 directory is no obstacle
  // at all and the test would pass vacuously. A regular file where a directory
  // has to be is ENOTDIR for everyone.
  const file = path.join(dir, "not-a-directory", "spec-timings.json");
  fs.writeFileSync(path.dirname(file), "");
  try {
    const { lines } = await fakeRun([[["Apex 26 — smoke", "a"], 1000]],
      { APEX_SPEC_TIMINGS: "1", APEX_SPEC_TIMINGS_FILE: file });
    assert.ok(lines.some((l) => /spec timings: not recorded/.test(l)),
      "the failure is REPORTED — a silent swallow would leave an agent believing timings were written");
    assert.ok(lines.some((l) => /= run passed/.test(l)), "and the run's verdict stands");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/* ── the committed file itself ────────────────────────────────────────────── */

test("the committed spec-timings.json is well formed, bounded and honestly bucketed", () => {
  // A unit test of a checker is not the check (tests/unit/test-coverage-audit.test.mjs
  // §1): the assertions above all run on fixtures, so the SEEDED file gets its
  // own pass, in the suite the edit loop runs.
  const file = path.join(ROOT, TIMINGS_FILE);
  assert.ok(fs.existsSync(file), `${TIMINGS_FILE} must be committed — it is the history`);
  const db = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(db.keep, KEEP);
  const specs = Object.keys(db.specs);
  assert.ok(specs.length > 0, "an empty history proves nothing about the merge");
  for (const spec of specs) {
    assert.ok(fs.existsSync(path.join(ROOT, spec)), `${spec} has timings but no file on disk`);
    const { s, t } = db.specs[spec];
    const check = (samples, where) => {
      assert.ok(samples.length <= KEEP, `${where}: ${samples.length} samples exceeds the KEEP bound`);
      for (const [ts, env, sec] of samples) {
        assert.match(ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, `${where}: ts is not a second-precision ISO`);
        assert.ok(BUCKETS.includes(env), `${where}: ${env} is not an env bucket`);
        assert.ok(Number.isFinite(sec) && sec >= 0, `${where}: ${sec} is not a duration`);
      }
    };
    check(s, `${spec} .s`);
    for (const title of Object.keys(t)) check(t[title], `${spec} › ${title}`);
    // The spec-level row must agree with the per-test rows of the same run.
    for (const [ts, env, sec, n] of s) {
      const own = Object.values(t).flatMap((rows) => rows.filter((r) => r[0] === ts && r[1] === env));
      assert.equal(own.length, n, `${spec} @ ${ts}: claims ${n} tests, ${own.length} recorded`);
      const sum = own.reduce((a, r) => a + r[2], 0);
      assert.ok(Math.abs(sum - sec) < 0.05, `${spec} @ ${ts}: ${sec}s total vs ${sum}s of tests`);
    }
  }
  assert.equal(serialise(db), fs.readFileSync(file, "utf8"),
    "the committed file is not what the writer would produce — re-run tools/ci/spec-timings.mjs");
  // Growth flags are ADVISORY (docs/TESTING.md: `--check` exits 0 either way —
  // a busy runner and a slow test look identical). The seeded file had none;
  // real CI history adopted from bot/spec-timings does (pit-signs at 3.4x on
  // one llvmpipe run, 2026-09-24), so the committed file is only held to
  // flags that are well formed, never to having none.
  for (const g of growth(db)) {
    assert.ok(specs.includes(g.spec) && BUCKETS.includes(g.bucket), `growth row names a real spec/bucket: ${JSON.stringify(g)}`);
    assert.ok(g.ratio > 1 && Number.isFinite(g.median), `growth row is a real ratio: ${JSON.stringify(g)}`);
  }
});

test("select-budget reads the committed file rather than a fixture", () => {
  const db = timings(true);
  assert.deepEqual(Object.keys(db.specs).sort(),
    Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, TIMINGS_FILE), "utf8")).specs).sort());
});
