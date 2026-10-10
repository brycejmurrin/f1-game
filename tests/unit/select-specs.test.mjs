// select-specs — the blocking CI selector's two halves, and its honesty.
//
// The selection logic (groups -> specs -> budget cut) is pure enough to test
// on fixtures; the real-tree case pins that the composition still produces a
// non-empty, in-budget selection for a diff that touches js/game/ — the shape
// the job will see every day. The skip list is load-bearing: a selector that
// silently drops the expensive spec reads as "covered", which is the same
// lie the coverage reporter exists to catch from the other side.
import test from "node:test";
import assert from "node:assert/strict";
import { specsOf, fit, maxDeclaredTimeout, specsImporting, prioritise, TRACKED,
  DOCS_ONLY, isDocsOnly, shards, shardCapMin, TARGET_SHARD_SEC, MAX_FAILURES, MAX_OVERSIZE_SHARDS,
  MAX_OVER_BUDGET_SHARDS, MAX_OVERFLOW_SHARDS, MAX_SPILL_SHARDS, MAX_SELECTED_JOB_MIN, MAX_TESTS_PER_JOB,
  FAT_UI_SELECTED_JOB_MIN, FAT_UI_SEC_PER_TEST,
  SOLO_OWN_TIMEOUT_SEC, SELECTED_SETUP_MIN, SELECTED_WRAP_MIN,
  partitionMegaSweepArgs, megasForThisShard, megaShardPlan, megaSoloFlags, playwrightShard, isMegaSweepSpec,
  expectedSec, measuredCheap, circuitsTouched, dataCircuits, racingCircuitIds, foundationSpec, CIRCUIT_FILTERED_TESTS, CIRCUIT_DEF,
  DEFAULT_BUDGET_MIN,
  SELECTED_GATE, FIXED_GATE_SPECS, MANUAL_OPT_IN_SPECS, dropBootFallback, BOOT_FALLBACK_REASONS,
  scopeCarryForward, SOURCE_AFFECTED, specsAffectedBySource, specsRacing, circuitsOf } from "../../tools/ci/select-specs.mjs";
import { pick } from "../../tools/ci/pick-tests.mjs";
import { failedSpecsFrom, unattributedFailuresFrom } from "../../tools/ci/junit-failed.mjs";
import { recall } from "../../tools/ci/select-recall.mjs";
import { MEASURED, capacity, declaredTests } from "../../tools/ci/select-budget.mjs";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// A budget (minutes) whose allowance is exactly `sec` seconds of work at the
// gate's settings: fit()'s allowance is budget - one failure + one fallback test.
const budgetFor = (sec) => (sec + SELECTED_GATE.perTestTimeoutSec - MEASURED.secPerTest) / 60;
const EMPTY = { specs: {} };
const at = (files, secPerTest) => ({ specs: Object.fromEntries(files.map((f) => [f,
  { s: [1, 2, 3].map((i) => [`2026-09-2${i}T00:00:00Z`, "llvmpipe", secPerTest * declaredTests(f), declaredTests(f)]) }])) });


const SCRIPTS = {
  "test:one": "node tools/ci/run-playwright.mjs tests/specs/smoke.spec.js",
  "test:two": "node tools/ci/run-playwright.mjs tests/specs/smoke.spec.js tests/specs/logging.spec.js",
  "test:glob": "node tools/ci/run-playwright.mjs tests/specs/physics-*.spec.js",
  "test:node": "node --test tests/unit/select-specs.test.mjs",
};

test("specsOf dedupes across groups and expands globs against the tree", () => {
  const got = specsOf(["test:one", "test:two"], SCRIPTS);
  assert.deepEqual(got, ["tests/specs/logging.spec.js", "tests/specs/smoke.spec.js"]);
  const glob = specsOf(["test:glob"], SCRIPTS);
  assert.ok(glob.length >= 2, `physics-* expanded to ${glob.length}`);
  assert.ok(glob.every((f) => /^tests\/specs\/physics-.*\.spec\.js$/.test(f)));
});

test("specsOf ignores scripts that are not browser runs", () => {
  assert.deepEqual(specsOf(["test:node"], SCRIPTS), []);
});

test("fit cuts at the budget and names every skipped spec", () => {
  // Real specs so declaredTests resolves; the budget is set artificially small
  // so the cut provably happens.
  // boot-guard, not logging: logging is ADAPTED (tools/ci/twinned-specs.mjs),
  // so fit() reports it as coveredByVmTwin before any budgeting happens.
  const specs = ["tests/specs/smoke.spec.js", "tests/specs/boot-guard.spec.js"];
  const r = fit(specs, 5);
  assert.equal(r.selected.length + r.skipped.length + r.unreachable.length
    + r.oversize.length + r.coveredByFixedGates.length + r.coveredByManualOptIn.length, 2,
    "every spec lands in selected, skipped, unreachable, oversize, or an independent fixed/manual gate");
  assert.ok(r.testsSelected <= r.testsFit, `${r.testsSelected} selected into ${r.testsFit}`);
  for (const s of r.skipped) assert.ok(s.tests > 0, "a skipped spec carries its cost");
});

test("a spec bigger than the whole pack runs as OVERSIZE shards, not unreachable", () => {
  // Was "unreachable": every js/net change listed multiplayer-session as a
  // permanent REPORT and nobody ran it. Too-big-for-the-budget means it runs
  // outside the budgeted set, packed by expected time (shards()).
  // Unmeasured (EMPTY) so the fallback rate decides, and a budget that holds
  // boot-guard but not the big spec.
  const big = "tests/specs/multiplayer-session.spec.js", small = "tests/specs/boot-guard.spec.js";
  const fb = MEASURED.secPerTest;
  const budget = budgetFor(declaredTests(small) * fb + 1);
  assert.ok(declaredTests(big) > declaredTests(small) + 1, "fixture: big must not fit where small does");
  const r = fit([big, small], budget, { db: EMPTY });
  assert.ok(r.oversize.some((s) => s.file === big), `${big} must run as oversize: ${JSON.stringify(r.skipped)}`);
  assert.ok(!r.unreachable.some((s) => s.file === big), "oversize is not double-counted as unreachable");
  assert.ok(!r.skipped.some((s) => s.file === big), "oversize is not double-counted as skipped");
  assert.deepEqual(r.selected.map((s) => s.file), [small],
    "a spec that does fit is still selected alongside the oversize plan");
  // A spec that fits the budget ON ITS OWN but not beside another is never
  // oversize. It rides as OVERFLOW (2026-09-29): it used to be skipped, and a
  // routed spec that always loses the packing was run by nothing but the
  // 11-night rota. With no overflow allowance it is skipped by name, as before.
  const a = "tests/specs/multiplayer-seats.spec.js", b = "tests/specs/multiplayer-npeer.spec.js";
  const bud = budgetFor(Math.max(declaredTests(a), declaredTests(b)) * fb);
  const both = fit([a, b], bud, { db: EMPTY });
  assert.deepEqual(both.oversize.map((s) => s.file), [], "a spec smaller than the budget is not oversize");
  assert.deepEqual(both.unreachable.map((s) => s.file), [], "…and never unreachable");
  assert.equal(both.selected.length + both.overflow.length, 2, "each lands in exactly one bucket");
  assert.equal(both.overflow.length, 1, "the one that lost the packing runs as overflow");
  assert.deepEqual(both.skipped, []);
  const planned = shards(both, EMPTY).flatMap((r) => r.specs.split(" "));
  assert.ok(planned.includes(both.overflow[0].file), "shards() packs the overflow spec into a job");
  const none = fit([a, b], bud, { db: EMPTY, overflowShards: 0, spillShards: 0, overBudgetShards: 0 });
  assert.equal(none.skipped.length, 1, "no remaining pool allowance: skipped by name");
  assert.deepEqual(none.overflow, []);
  const spilled = fit([a, b], bud, { db: EMPTY, overflowShards: 0 });
  assert.equal(spilled.spill.length, 1, "no overflow allowance: the spill leg carries it");
  assert.deepEqual(spilled.skipped, []);
});

test("a FULL overflow spills into bounded spill jobs instead of skipping (PR #1204, dev-tools)", () => {
  // CI on 5f2e64b82: the selected-failed hoist + the bot/spec-timings overlay
  // filled all MAX_OVERFLOW_SHARDS jobs, so dev-tools.spec.js (56 tests) was
  // skipped, ran nowhere, and red the verdict (remote-group 37665046433:
  // 74/74 pass). Reproduce: ~300 s routed fillers (fewer tests, so they sort
  // first) fill the overflow to within less than dev-tools' 129 s, then
  // dev-tools is the leftover.
  const dev = "tests/specs/dev-tools.spec.js";
  const all = fs.readdirSync(path.join(ROOT, "tests/specs")).filter((f) => f.endsWith(".spec.js"))
    .map((f) => "tests/specs/" + f);
  const plain = fit(all, 1000, { db: EMPTY, overflowShards: 0, spillShards: 0 }).selected
    .filter((s) => s.file !== dev && !s.ownTimeoutSec && s.tests < declaredTests(dev)
      && !/career|hud-layout|menu-baseline/.test(s.file))
    .map((s) => s.file);
  const row = (sec, n) => ({ s: [1, 2, 3].map((i) => [`2026-09-2${i}T00:00:00Z`, "llvmpipe", sec, n]) });
  const plan = (nFill, opts = {}) => {
    const fill = plain.slice(0, nFill);
    assert.equal(fill.length, nFill, `fixture: ${nFill} plain specs available`);
    const db = { specs: { ...Object.fromEntries(fill.map((f) => [f, row(300, declaredTests(f))])),
      [dev]: row(129, declaredTests(dev)) } };
    const rank = () => 3;
    return { db, r: fit([...fill, dev], DEFAULT_BUDGET_MIN, { db, rank, overflowShards: MAX_OVERFLOW_SHARDS, ...opts }) };
  };
  const secOf = (xs) => xs.reduce((n, x) => n + x.sec, 0);
  const devSec = 129;
  const { db, r } = plan(14);
  assert.ok(MAX_OVERFLOW_SHARDS * TARGET_SHARD_SEC - secOf(r.overflow) < devSec,
    `fixture: overflow is full (${secOf(r.overflow)} s of ${MAX_OVERFLOW_SHARDS * TARGET_SHARD_SEC})`);
  assert.ok(!r.overflow.some((s) => s.file === dev), "dev-tools did not fit the overflow");
  assert.deepEqual(r.spill.map((s) => s.file), [dev], "dev-tools rides the spill leg");
  assert.deepEqual(r.skipped, [], "nothing is skipped");
  const jobs = shards(r, db);
  const sp = jobs.filter((j) => j.name.startsWith("spill-"));
  assert.equal(sp.length, 1, `one spill job in the matrix: ${jobs.map((j) => j.name)}`);
  assert.ok(sp[0].specs.split(" ").includes(dev), "the spill job runs dev-tools");
  // Disable the later spare-pool fallback as well to isolate the spill fix.
  const off = plan(14, { spillShards: 0, overBudgetShards: 0 }).r;
  assert.deepEqual(off.skipped.map((s) => s.file), [dev], "without a spill leg dev-tools is skipped (the bug)");
  // Past the spill: bounded, and what is left is still NAMED in skipped (the
  // CLI/step report it as an error; the verdict reds on dropped > 0).
  const over = plan(20, { overBudgetShards: 0 }).r;
  assert.ok(secOf(over.spill) <= MAX_SPILL_SHARDS * TARGET_SHARD_SEC, `spill ${secOf(over.spill)} s is bounded`);
  assert.ok(over.skipped.length > 0, "what the spill cannot carry is named, not silently dropped");
  const placed = [...over.selected, ...over.overflow, ...over.spill, ...over.oversize, ...over.skipped].map((s) => s.file);
  assert.equal(placed.length, 21, "every spec lands in exactly one bucket");
  assert.equal(new Set(placed).size, 21);
  assert.equal(MAX_SPILL_SHARDS, 4, "the measured spill allowance stays bounded");
});

test("full oversize slots carry expensive suites before a smaller hoisted failure (PR #1289)", () => {
  const terrain = "tests/specs/terrain-over-road.spec.js", hoisted = "tests/specs/career-hub.spec.js";
  const rows = [["tests/specs/hud-layout.spec.js", 1318], [terrain, 638],
    ["tests/specs/career-season.spec.js", 403], ["tests/specs/career.spec.js", 352], [hoisted, 260]];
  const db = { specs: Object.fromEntries(rows.map(([file, sec]) => [file,
    { s: [1, 2, 3].map((i) => [`2026-10-0${i}T00:00:00Z`, "llvmpipe", sec, declaredTests(file)]) }])) };
  // Four slots plus one 360-second slow pool can carry all five suites. Giving
  // the small failure a slot strands terrain's 638 seconds, which cannot fit that pool.
  const r = fit(rows.map(([file]) => file), budgetFor(1), { db,
    rank: (file) => file === hoisted ? 1 : file === terrain ? 3 : 2,
    overflowShards: 0, spillShards: 0, overBudgetShards: 1 });
  assert.equal(r.oversize.length, MAX_OVERSIZE_SHARDS);
  assert.ok(r.oversize.some((s) => s.file === terrain), "the largest routed suite keeps a scarce slot");
  assert.ok(!r.oversize.some((s) => s.file === hoisted), "a smaller failure cannot evict a larger workload");
  assert.deepEqual(r.overBudgetRun.map((s) => s.file), [hoisted]);
  assert.deepEqual(r.skipped, []);
  assert.deepEqual(r.overBudgetSpecs, []);
  const jobs = shards(r, db);
  for (const [file] of rows) assert.ok(jobs.some((j) => j.specs.split(" ").includes(file)), `${file} is scheduled`);
});

test("terrain and ordinary parts leftovers use only spare over-budget capacity (PR #1289)", () => {
  // CI 38018686533 carried quali instead of Abu Dhabi. Career Hub took the
  // fourth oversize slot, leaving terrain (638 s) outside the ordinary pools
  // despite 1512 spare seconds in the already-reserved over-budget pool. Keep
  // four genuinely larger occupants here to test fallback under cost-first
  // allocation too, independently of that subsequent allocation repair.
  const terrain = "tests/specs/terrain-over-road.spec.js";
  const slow = "tests/specs/track-switch-memory.spec.js";
  const oversized = [
    ["tests/specs/career-season.spec.js", 700],
    ["tests/specs/career.spec.js", 700],
    ["tests/specs/career-hub.spec.js", 700],
    ["tests/specs/hud-layout.spec.js", 1318],
  ];
  const leftovers = [
    ["tests/specs/ui-button-touch.spec.js", 254],
    ["tests/specs/tracks-walls-b.spec.js", 78],
    ["tests/specs/gamepad.spec.js", 262],
    ["tests/specs/props-over-road.spec.js", 374],
    ["tests/specs/dev-tools.spec.js", 123], [terrain, 638], [slow, 87],
  ];
  const reserved = new Set([...oversized, ...leftovers].map(([file]) => file));
  const all = fs.readdirSync(path.join(ROOT, "tests/specs"))
    .filter((f) => f.endsWith(".spec.js")).map((f) => "tests/specs/" + f);
  const fillers = fit(all, 1000, { db: EMPTY, overflowShards: 0, spillShards: 0 }).selected
    .filter((s) => !reserved.has(s.file) && !s.ownTimeoutSec && s.tests < 24)
    .slice(0, 14).map((s) => s.file);
  assert.equal(fillers.length, 14);
  const [budgeted, ...overflowFillers] = fillers;
  const rows = [[budgeted, 426], ...overflowFillers.map((f) => [f, 300]), ...oversized, ...leftovers];
  const dbFor = (rows) => ({ specs: Object.fromEntries(rows.map(([file, sec]) => [file,
    { s: [1, 2, 3].map((i) => [`2026-10-0${i}T00:00:00Z`, "llvmpipe", sec, declaredTests(file)]) }])) });
  const db = dbFor(rows);
  const affected = new Set(oversized.map(([file]) => file));
  const rank = (file) => file === budgeted ? 0 : affected.has(file) ? 2 : 3;
  const plan = (overBudgetShards) => fit(rows.map(([file]) => file), DEFAULT_BUDGET_MIN,
    { db, rank, overBudgetShards });
  assert.equal(maxDeclaredTimeout(terrain), SELECTED_GATE.perTestTimeoutSec * 1000);
  assert.equal(measuredCheap(terrain, db), true, "terrain remains eligible for the ordinary measured cut first");
  const full = plan(MAX_OVER_BUDGET_SHARDS);
  assert.equal(full.oversize.length, MAX_OVERSIZE_SHARDS);
  assert.equal(full.spill.reduce((n, s) => n + s.sec, 0), 1091);
  assert.deepEqual(full.overBudgetRun.map((s) => s.file), [slow, terrain]);
  assert.deepEqual(full.skipped, []);
  assert.deepEqual(full.overBudgetSpecs, []);
  const placed = [...full.selected, ...full.oversize, ...full.overflow, ...full.spill, ...full.overBudgetRun];
  assert.equal(placed.length, rows.length);
  assert.equal(new Set(placed.map((s) => s.file)).size, rows.length, "admission is not duplicated");
  assert.ok(full.overBudgetRun.reduce((n, s) => n + s.sec, 0) <= MAX_OVER_BUDGET_SHARDS * TARGET_SHARD_SEC);
  const jobs = shards(full, db);
  const terrainJobs = jobs.filter((j) => j.specs.split(" ").includes(terrain));
  // Split by its MEASURED 638 s, not 8 tests a leg (R3-CI-HEALTH-3): it was
  // seven --shard pieces of ~91 s each, every one paying setup and a slot.
  const nTerrain = Math.ceil(638 / TARGET_SHARD_SEC);
  assert.deepEqual(terrainJobs.map((j) => j.shard), Array.from({ length: nTerrain }, (_, i) => `${i + 1}/${nTerrain}`));
  assert.ok(terrainJobs.every((j) => j.specs === terrain && j.perTest === SELECTED_GATE.perTestTimeoutSec),
    "existing slow-pool sharding and per-test limits apply");
  assert.ok(jobs.every((j) => j.timeout <= (j.workers > 1 ? FAT_UI_SELECTED_JOB_MIN : MAX_SELECTED_JOB_MIN)));
  const exhausted = plan(2); // 720 - 87 < 638: the earlier slow candidate wins.
  assert.deepEqual(exhausted.overBudgetRun.map((s) => s.file), [slow]);
  assert.deepEqual(exhausted.skipped.map((s) => s.file), [terrain], "unused but insufficient capacity still drops by name");
  const disabled = plan(0);
  assert.deepEqual(disabled.overBudgetRun, []);
  assert.deepEqual(disabled.overBudgetSpecs.map((s) => s.file), [slow]);
  assert.deepEqual(disabled.skipped.map((s) => s.file), [terrain]);

  // The single-failure-cache audit also found props-first displacing parts,
  // which has no long declaration. Saturate the ordinary pools with that
  // ordering too: unused reserved room must carry it without raising limits.
  const props = "tests/specs/props-over-road.spec.js", parts = "tests/specs/parts-physics.spec.js";
  const ordinaryRows = [...rows.filter(([file]) => file !== terrain)
    .map(([file, sec]) => [file, overflowFillers.includes(file) ? 298
      : file === "tests/specs/dev-tools.spec.js" ? 495 : sec]), [parts, 70]];
  const ordinaryDb = dbFor(ordinaryRows);
  const ordinaryPlan = (overBudgetShards) => fit(ordinaryRows.map(([file]) => file), DEFAULT_BUDGET_MIN,
    { db: ordinaryDb, rank: (file) => file === props ? 1 : rank(file), overBudgetShards });
  assert.equal(maxDeclaredTimeout(parts), 0, "this regression covers ordinary, not declared-slow, work");
  const ordinary = ordinaryPlan(MAX_OVER_BUDGET_SHARDS);
  assert.deepEqual(ordinary.skipped, []);
  assert.deepEqual(ordinary.overBudgetRun.map((s) => s.file), [slow, parts]);
  const ordinarySpillSec = ordinary.spill.reduce((n, s) => n + s.sec, 0);
  assert.ok(ordinarySpillSec <= MAX_SPILL_SHARDS * TARGET_SHARD_SEC
    && MAX_SPILL_SHARDS * TARGET_SHARD_SEC - ordinarySpillSec < 70, "parts cannot fit the bounded ordinary spill");
  const partJobs = shards(ordinary, ordinaryDb).filter((j) => j.specs.split(" ").includes(parts));
  assert.equal(partJobs.length, 1, "all 70 parts tests stay in one job");
  assert.ok(partJobs.every((j) => j.specs === parts && j.perTest === SELECTED_GATE.perTestTimeoutSec
    && j.timeout <= MAX_SELECTED_JOB_MIN), "parts stays isolated at 180 s instead of inheriting the earlier slow candidate's 360 s");
  const noOrdinaryRoom = ordinaryPlan(0);
  assert.deepEqual(noOrdinaryRoom.skipped.map((s) => s.file), [parts], "exhausted capacity still names ordinary omissions");
});

test("a saturated wide plan runs props-over-road and parts-physics without displacing another spec (PR #1289)", () => {
  // CI 38010342804: four oversize slots and the overflow were full, then
  // 717 spill seconds left no room for 374 s of road props or 70 s of parts.
  // Preserve those measured costs and ordering with real spec declarations.
  const props = "tests/specs/props-over-road.spec.js";
  const parts = "tests/specs/parts-physics.spec.js";
  const oversized = [
    ["tests/specs/career-season.spec.js", 403],
    ["tests/specs/career.spec.js", 352],
    ["tests/specs/hud-layout.spec.js", 1318],
    ["tests/specs/terrain-over-road.spec.js", 638],
  ];
  const leftovers = [
    ["tests/specs/ui-button-touch.spec.js", 254],
    ["tests/specs/tracks-walls-b.spec.js", 78],
    ["tests/specs/gamepad.spec.js", 262],
    ["tests/specs/dev-tools.spec.js", 123],
    [props, 374], [parts, 70],
  ];
  const reserved = new Set([...oversized, ...leftovers].map(([file]) => file));
  const all = fs.readdirSync(path.join(ROOT, "tests/specs"))
    .filter((f) => f.endsWith(".spec.js")).map((f) => "tests/specs/" + f);
  const fillers = fit(all, 1000, { db: EMPTY, overflowShards: 0, spillShards: 0 }).selected
    .filter((s) => !reserved.has(s.file) && !s.ownTimeoutSec && s.tests < 24)
    .slice(0, 14).map((s) => s.file);
  assert.equal(fillers.length, 14, "one budget filler and thirteen overflow fillers exist");
  const [budgeted, ...overflowFillers] = fillers;
  const rows = [[budgeted, 426], ...overflowFillers.map((f) => [f, 300]), ...oversized, ...leftovers];
  const db = { specs: Object.fromEntries(rows.map(([file, sec]) => [file,
    { s: [1, 2, 3].map((i) => [`2026-10-0${i}T00:00:00Z`, "llvmpipe", sec, declaredTests(file)]) }])) };
  const affected = new Set(oversized.map(([file]) => file));
  const rank = (file) => file === budgeted ? 0 : affected.has(file) ? 2 : 3;
  const plan = (spillShards, overBudgetShards = MAX_OVER_BUDGET_SHARDS) => fit(rows.map(([file]) => file), DEFAULT_BUDGET_MIN,
    { db, rank, spillShards, overBudgetShards });
  const old = plan(2, 0); // Disable the later spare-pool fallback to isolate the original spill defect.
  assert.equal(old.oversize.length, MAX_OVERSIZE_SHARDS, "all oversize slots are occupied");
  assert.equal(old.spill.reduce((n, s) => n + s.sec, 0), 717);
  assert.deepEqual(old.skipped.map((s) => s.file), [props, parts], "reproduces both CI omissions");
  const fixed = plan(MAX_SPILL_SHARDS);
  assert.deepEqual(fixed.skipped, [], "no candidate is displaced into the dropped list");
  assert.deepEqual(fixed.overBudgetSpecs, []);
  assert.deepEqual(fixed.unreachable, []);
  const placed = [...fixed.selected, ...fixed.oversize, ...fixed.overflow, ...fixed.spill, ...fixed.overBudgetRun];
  assert.equal(placed.length, rows.length, "every candidate has a scheduled bucket");
  assert.equal(new Set(placed.map((s) => s.file)).size, rows.length, "every candidate is scheduled once");
  assert.ok(fixed.spill.reduce((n, s) => n + s.sec, 0) <= MAX_SPILL_SHARDS * TARGET_SHARD_SEC);
  const jobs = shards(fixed, db);
  assert.equal(jobs.length, shards(old, db).length + 2, "coverage adds only two matrix jobs");
  const propJobs = jobs.filter((j) => j.specs.split(" ").includes(props));
  assert.deepEqual(propJobs.map((j) => j.shard), ["1/2", "2/2"], "both road-prop shards run");
  assert.equal(jobs.filter((j) => j.specs.split(" ").includes(parts)).length, 1, "parts runs in one job");
  assert.ok(jobs.every((j) => j.timeout <= (j.workers > 1 ? FAT_UI_SELECTED_JOB_MIN : MAX_SELECTED_JOB_MIN)),
    "existing ordinary and fat-UI job caps stay unchanged");
});

test("overflow is bounded, and every spec lands in exactly one bucket at any allowance", () => {
  const specs = fs.readdirSync(path.join(ROOT, "tests/specs")).filter((f) => f.endsWith(".spec.js"))
    .map((f) => "tests/specs/" + f);
  const r = fit(specs, 10, { overflowShards: 2 });
  const sec = r.overflow.reduce((n, x) => n + (x.sec || 0), 0);
  assert.ok(sec <= 2 * TARGET_SHARD_SEC, `overflow ${sec} s within two jobs' worth`);
  assert.ok(r.skipped.length > 0, "a whole-suite plan still leaves specs to name");
  const wide = fit(specs, 60, { overflowShards: 12, staleFirst: true });
  assert.ok(wide.overflow.length + wide.selected.length > r.overflow.length + r.selected.length, "the nightly's allowance runs more");
  const all = (x) => x.selected.length + x.skipped.length + x.overflow.length + (x.spill || []).length + x.oversize.length
    + x.overBudgetRun.length + x.unreachable.length + x.overBudgetSpecs.length + x.coveredByFixedGates.length
    + x.coveredByManualOptIn.length + x.coveredByVmTwin.length + x.unreadable.length;
  assert.equal(all(r), all(wide), "the same specs, bucketed, at any allowance");
});

test("manual opt-in specs are never put on a selected command", () => {
  // material-shimmer is behind APEX_SHIMMER=1; selecting it without the env
  // skips every test and the runner fails the job as all-skipped (PR #968).
  assert.ok(MANUAL_OPT_IN_SPECS.has("tests/specs/material-shimmer.spec.js"));
  const r = fit([...MANUAL_OPT_IN_SPECS, "tests/specs/boot-guard.spec.js"], 60);
  assert.deepEqual(r.coveredByManualOptIn.map((s) => s.file).sort(), [...MANUAL_OPT_IN_SPECS].sort());
  assert.ok(!r.selected.some((s) => MANUAL_OPT_IN_SPECS.has(s.file)));
  assert.ok(!r.oversize.some((s) => MANUAL_OPT_IN_SPECS.has(s.file)));
  assert.ok(!r.overBudgetRun.some((s) => MANUAL_OPT_IN_SPECS.has(s.file)));
  const planned = shards(r).flatMap((j) => j.specs.split(" "));
  assert.ok(!planned.some((f) => MANUAL_OPT_IN_SPECS.has(f)),
    "shards() must not schedule a manual opt-in spec");
});

test("the nightly diffs from the deploy branch as it stood a day ago, with a wider allowance", () => {
  const sh = fs.readFileSync(path.join(ROOT, "tools/ci/ci-resolve-before.sh"), "utf8");
  assert.match(sh, /schedule\) BEFORE="\$\(git rev-list -1 --first-parent --before='24 hours ago' HEAD/);
  const step = fs.readFileSync(path.join(ROOT, "tools/ci/ci-select-specs-step.sh"), "utf8");
  assert.match(step, /--overflow-shards "\$OVERFLOW_SHARDS" --stale-first/);
  assert.match(step, /--budget-min "\$BUDGET_MIN"/);
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
  assert.match(yml, /BUDGET_MIN: \$\{\{ github\.event_name == 'schedule' && !inputs\.concurrency_key && '60' \|\| '' \}\}/);
  assert.match(yml, /OVERFLOW_SHARDS: \$\{\{ github\.event_name == 'schedule' && !inputs\.concurrency_key && '12' \|\| '' \}\}/,
    "only the nightly (never a Pages train tick, whose caller event is also schedule) widens the plan");
});

test("a spec that reserves more than the selected-gate timeout runs in the OVER-BUDGET POOL, never the budget", () => {
  // The cost model's blind spot, measured on CI run 31233088772: the selector
  // billed every test at ~80 s while 8 of its 10 picks declared their own
  // test.setTimeout of 180-420 s — which OVERRIDES the job's --timeout — and
  // the "14-minute" selection failed the job. bahrain-foundation (300 s) is the
  // standing over-budget example after imola-foundation moved to ADAPTED
  // (fit() files ADAPTED specs as coveredByVmTwin before budgeting — same as
  // projection.spec.js). If bahrain's budget ever drops below the selected-gate
  // timeout this pin should move to whichever non-twinned spec then holds it.
  const pin = "tests/specs/bahrain-foundation.spec.js";
  const own = maxDeclaredTimeout(pin);
  assert.ok(own > SELECTED_GATE.perTestTimeoutSec * 1000,
    `bahrain-foundation now declares ${own} ms — find a new worst example for this pin`);
  const r = fit([pin, "tests/specs/boot-guard.spec.js"], 15);
  // 2026-10-04: a ROUTED over-budget spec runs in its own pool. It used to be
  // named in overBudgetSpecs and run by nothing but the 11-night rota.
  assert.deepEqual(r.overBudgetRun.map((s) => s.file), [pin]);
  assert.deepEqual(r.overBudgetSpecs, [], "nothing dropped while the pool has room");
  assert.deepEqual(r.selected.map((s) => s.file), ["tests/specs/boot-guard.spec.js"],
    "the spec that fits the selected-gate budget must still be selected");
  // With no pool at all it is dropped BY NAME, never silently.
  const none = fit([pin, "tests/specs/boot-guard.spec.js"], 15, { overBudgetShards: 0 });
  assert.deepEqual(none.overBudgetSpecs.map((s) => s.file), [pin]);
  // imola keeps its high declaration but is ADAPTED — never overBudgetSpecs.
  const imola = fit(["tests/specs/imola-foundation.spec.js"], 15);
  assert.deepEqual(imola.overBudgetSpecs, []);
  assert.ok(imola.coveredByVmTwin.some((s) => s.file === "tests/specs/imola-foundation.spec.js"),
    "ADAPTED imola-foundation must route through coveredByVmTwin, not overBudget");
});

test("fixed blocking specs can never run under the selected gate's timeout", () => {
  assert.ok(FIXED_GATE_SPECS.has("tests/specs/smoke.spec.js"));
  assert.ok(FIXED_GATE_SPECS.has("tests/specs/physics-characterization.spec.js"));
  const r = fit([...FIXED_GATE_SPECS], 60);
  assert.deepEqual(r.selected, [], "even a huge selected budget must not duplicate fixed specs");
  assert.deepEqual(r.coveredByFixedGates.map((s) => s.file).sort(), [...FIXED_GATE_SPECS].sort());
});

test("TRACKED covers the paths that make a selection meaningless", () => {
  // The measured hole: tests/helpers/fixtures.js is imported by ~59 specs, but
  // pick-tests routes ^tests/ to `audit` (not a browser group), so before this
  // list a change to the file EVERY spec depends on selected ZERO specs and the
  // job reported nothing to run — silent exactly when everything is affected.
  // Datadog TIA calls these "tracked files"; Fowler's account of Google Testar
  // records the same blind spot for data-driven inputs.
  for (const f of ["tests/helpers/fixtures.js", "package.json", "playwright.config.js",
                   "tools/manifest.cjs", "index.html", "version.json",
                   "tests/data/physics-baseline.json", ".github/workflows/ci.yml"])
    assert.ok(TRACKED.some((re) => re.test(f)), `${f} must be a tracked path`);
  // ...and does NOT swallow ordinary source or spec edits, or the selector is
  // a full-run trigger wearing a selector's name.
  for (const f of ["js/game.js", "js/track/tracks.js", "tests/specs/smoke.spec.js",
                   "css/hud.css", "docs/TESTING.md"])
    assert.ok(!TRACKED.some((re) => re.test(f)), `${f} must NOT be tracked`);
  // ...and the four tools that MOVED to tools/ci/, which is the drift this list
  // actually suffered: the entry named them at the tools/ root, so each matched
  // nothing and a selector edit stopped flagging itself as infra.
  for (const f of ["tools/ci/pick-tests.mjs", "tools/ci/select-specs.mjs",
                   "tools/ci/select-budget.mjs", "tools/ci/run-playwright.mjs"])
    assert.ok(TRACKED.some((re) => re.test(f)), `${f} must be a tracked path`);
});

test("every TRACKED pattern matches a file that exists", () => {
  // THE LINT THAT WOULD HAVE CAUGHT IT, and the reason pick-tests has no dead
  // rules: tests/unit/pick-tests.test.mjs ("no rule is dead") has run exactly this check over
  // RULES for months. TRACKED never had it, so four dead alternatives sat in
  // one regex, silently, while the hand-listed examples above all passed —
  // they only ever probed the members someone thought to name.
  //
  // A dead pattern here FAILS OPEN: it selects nothing, flags nothing, and
  // every run still looks green. Checked against `git ls-files` because these
  // patterns name workflows, tests/data and the shell, which no manifest lists.
  const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
    .trim().split("\n");
  const dead = TRACKED.filter((re) => !tracked.some((f) => re.test(f))).map(String);
  assert.deepEqual(dead, [],
    "a TRACKED pattern matches no file in the tree — re-point it at where the file went, or drop it");
});

test("the import graph finds specs a path RULE cannot — helper -> spec", () => {
  // Playwright's --only-changed walks the import graph; here it would find
  // almost nothing (specs load the game over HTTP, so no graph reaches js/),
  // but it is exactly right for helper -> spec, where the RULES are weakest:
  // ^tests/ routes to `audit` and nothing else.
  const hit = specsImporting(["tests/helpers/qr-camera.js"]);
  assert.ok(hit.includes("tests/specs/multiplayer-scan.spec.js"), `got ${hit.join(", ")}`);
  assert.ok(hit.length < 10, "a NARROW helper must not fan out to the whole suite");
  assert.deepEqual(specsImporting(["js/game.js"]), [],
    "js/ is invisible to the import graph in this architecture — say so by returning nothing");
});

test("carry-forward only reorders specs this change already routed", () => {
  // Pages 33927358590: a livery lockup routed only test:car, but
  // .selected-failed.txt injected albert-park-foundation + physics-fixes,
  // those timed out first, and carview-parts never ran.
  const routed = ["tests/specs/carview-parts.spec.js", "tests/specs/garage-aero.spec.js"];
  const failed = [
    "tests/specs/albert-park-foundation.spec.js",
    "tests/specs/physics-fixes.spec.js",
    "tests/specs/garage-aero.spec.js",
  ];
  const { inScope, dropped } = scopeCarryForward(failed, routed);
  assert.deepEqual(inScope, ["tests/specs/garage-aero.spec.js"]);
  assert.deepEqual(dropped, [
    "tests/specs/albert-park-foundation.spec.js",
    "tests/specs/physics-fixes.spec.js",
  ]);
});

test("fail-fast order: edited, then previously-failed, then imported, then routed", () => {
  // Fowler's TIA survey records Microsoft and Google Testar both running
  // newly-added and previously-failing tests unconditionally; Playwright's CI
  // guidance is the ordering half. The gate should report the likeliest failure
  // first instead of spending its budget on a lower-signal spec.
  const specs = [{ file: "d.spec.js", tests: 1 }, { file: "c.spec.js", tests: 1 },
                 { file: "b.spec.js", tests: 1 }, { file: "a.spec.js", tests: 1 }];
  const got = prioritise(specs, { changedSpecs: ["a.spec.js"], failed: ["b.spec.js"],
                                  imported: ["c.spec.js"] });
  assert.deepEqual(got.map((s) => s.file), ["a.spec.js", "b.spec.js", "c.spec.js", "d.spec.js"]);
});

test("FAULTY-CHANGE RECALL: no real regression is dropped in silence", () => {
  // The metric Facebook's Predictive Test Selection reports separately and for
  // good reason: their model catches >99.9% of faulty CHANGES while catching
  // only >95% of individual test failures, because a bad change is usually
  // caught by several tests. So a selector is judged on whether the regression
  // would still have been reported — never on how much of the suite it copies.
  //
  // A "silent miss" is the one true failure: the catching spec neither selected
  // nor named. Being unaffordable (a 25-minute sweep) or infra is fine — those
  // are honest answers the gates then own. This ratchet caught a REAL routing
  // bug on its first run: js/track/tracks.js holds buildProps but did not route
  // to `scenery`, so the two specs that reported both of 2026-08-08's scenery
  // defects were silently absent.
  const rows = recall();
  const silent = rows.filter((r) => !r.hit && !r.named && r.reason !== "infra");
  assert.deepEqual(silent.map((r) => `${r.name} -> ${r.catches}`), [],
    "a spec that caught a real regression was dropped with no word — fix the routing, " +
    "the budget, or the case, but never leave the selector silent");
  assert.ok(rows.length >= 5, "the case history is the harness — do not let it shrink");
});

test("the renderer's blocking spec stays inside the gate it was written for", () => {
  /* tests/specs/render-boot.spec.js exists BECAUSE js/render/ routed to nothing
     that can fail a push: all six test:gfx specs declare 240-540 s against the
     gate's 180 s per-test cap, so a renderer diff emptied the plan and skipped
     the `selected` job entirely.

     That makes its cheapness load-bearing, not incidental. One `test.slow()`,
     one `test.setTimeout`, one `test.describe.configure({ timeout })` — the
     three things maxDeclaredTimeout() walks for — puts it back over the cap and
     silently restores the hole, with every other test in this file still green.
     So the property is asserted directly, on the same function the gate uses. */
  const SPEC = "tests/specs/render-boot.spec.js";
  assert.ok(fs.existsSync(path.join(ROOT, SPEC)), `${SPEC} is gone; so is the renderer's only blocking gate`);
  assert.equal(maxDeclaredTimeout(SPEC), 0,
    `${SPEC} declares a timeout, which excludes it from the selected gate — that is the hole it was written to close`);
  // …and it must actually fit: under the cap by declaration is not enough if it
  // declares more tests than the whole capacity (touch-steer, 25 against 10).
  const cut = fit([SPEC], 15, { rank: () => 3 });
  assert.deepEqual(cut.selected.map((r) => r.file), [SPEC],
    `${SPEC} did not fit the budgeted shard: ${JSON.stringify({ skipped: cut.skipped, unreachable: cut.unreachable, over: cut.overBudgetSpecs })}`);
  // And it is reachable from a renderer diff at all — it has to be in the group
  // js/render/ routes to, or being cheap buys nothing.
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.ok([...specsOf(["test:gfx"], pkg.scripts)].includes(SPEC),
    `${SPEC} is not in test:gfx, which is the group js/render/ routes to`);
});

test("the physics-core blocking spec stays inside the gate it was written for", () => {
  /* tests/specs/physics-boot.spec.js exists BECAUSE js/physics/ routed to a
     plan that could never run: every other test:physics-core spec is either
     FIXED_GATE (characterization), a VM twin / vmPage adapter, or EXCLUDED for
     declaring >= 180 s (physics-hotpath 300 s, debris 540 s). A player-forces
     PR then selected 0 specs, dropped 2, and failed Selected specs (verdict)
     — PR #826 run 37165166486.

     Cheapness is load-bearing, same contract as render-boot. */
  const SPEC = "tests/specs/physics-boot.spec.js";
  assert.ok(fs.existsSync(path.join(ROOT, SPEC)), `${SPEC} is gone; so is physics-core's only selected-gate boot`);
  assert.equal(maxDeclaredTimeout(SPEC), 0,
    `${SPEC} declares a timeout, which excludes it from the selected gate — that is the hole it was written to close`);
  const cut = fit([SPEC], 15, { rank: () => 3 });
  assert.deepEqual(cut.selected.map((r) => r.file), [SPEC],
    `${SPEC} did not fit the budgeted shard: ${JSON.stringify({ skipped: cut.skipped, unreachable: cut.unreachable, over: cut.overBudgetSpecs })}`);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.ok([...specsOf(["test:physics-core"], pkg.scripts)].includes(SPEC),
    `${SPEC} is not in test:physics-core, which is the group js/physics/ routes to`);
});

test("each missed case is attributed to the bucket that actually excluded it", () => {
  /* The footer of select-recall.mjs attributed all four misses to the
     deliberate `>=` per-test budget policy. That was right for three of them
     and WRONG for touch-steer.spec.js, which declares 120 s — comfortably under
     the 180 s cap — and was excluded because it declared 25 tests against a
     10-test capacity. It landed in `unreachable`, and no budget this gate could
     be handed would have admitted it; only splitting the file could.

     THE FILE HAS SINCE BEEN SPLIT (touch-steer / touch-buttons / touch-pedals,
     9 / 9 / 7), which is why this test no longer expects `unreachable` for it.
     That is the fix landing, not the assertion being relaxed: the two lines
     below are stricter than what they replaced, because they say NO spec in the
     tree is unreachable by count rather than merely naming the one that was.

     A wrong attribution is worse than none: it points the fix at the knob that
     cannot move the number. So the bucket stays machine-checked here rather
     than described in prose that drifts. */
  const rows = recall();
  const by = Object.fromEntries(rows.map((r) => [r.catches, r]));
  const touch = by["tests/specs/touch-steer.spec.js"];
  assert.ok(touch, "the touch-steer case left the history");
  assert.doesNotMatch(touch.why || "", /^unreachable/,
    `touch-steer was split to get it under the 10-test cap; "${touch.why}" says it is still over`);
  // The stronger form: nothing in the tree may be bigger than the whole
  // capacity. A spec that is reads as "not affected by this change" in the
  // plan, which is indistinguishable from being genuinely irrelevant — the
  // exact confusion the 2026-09-22 audit was about.
  const unreachable = rows.filter((r) => /^unreachable/.test(r.why || "")).map((r) => r.catches);
  assert.deepEqual(unreachable, [],
    `spec(s) declare more tests than the gate's whole capacity: ${unreachable.join(", ")}`);
  // The two that ARE the `>=` policy (still declare >= 180 s), so a future
  // change that makes them unreachable (or selectable) has to say so here.
  // props-over-road left this set on 2026-09-30 (one test per circuit at 120 s).
  // Since 2026-10-04 the over-budget pool runs them: a miss here is a regression.
  for (const f of ["tests/specs/terrain-over-road.spec.js",
                   "tests/specs/audio-smoke.spec.js"]) {
    assert.ok(by[f].hit, `${f} declares >= the per-test cap and must still RUN (over-budget pool): ${by[f].why}`);
  }
  // The push-blind hole this workstream closed: props-over-road must stay under
  // the selected gate's per-test cap so a js/track edit can select it again.
  const propsOwn = maxDeclaredTimeout("tests/specs/props-over-road.spec.js");
  assert.ok(propsOwn > 0 && propsOwn < SELECTED_GATE.perTestTimeoutSec * 1000,
    `props-over-road declares ${propsOwn / 1000}s — must be under the ${SELECTED_GATE.perTestTimeoutSec}s gate`);
  assert.ok(declaredTests("tests/specs/props-over-road.spec.js") >= 40,
    "props-over-road must still cover the roster (one test per circuit), not a silent shrink");
});

test("the selected-gate settings match select-budget's recommendation", () => {
  // retries 0 halves the failure cost, and a per-test timeout under smoke's
  // 240 s halves it again. If either drifts back to smoke's gate settings, the
  // budget maths silently stops describing the job that runs.
  assert.equal(SELECTED_GATE.retries, 0);
  assert.equal(SELECTED_GATE.perTestTimeoutSec, 180);
  const gate = capacity(15, 1, MEASURED);
  const selected = capacity(15, 1, { ...MEASURED, ...SELECTED_GATE });
  assert.ok(selected.tests > gate.tests,
    "the selected settings must fit MORE tests than smoke's settings, or they buy nothing");
});

test("the boot group is not selected for a blanket source edit — the fixed smoke gate owns that question", () => {
  // 2026-09-02: every js/css edit routed to `tiny`, whose cheapest-by-count
  // specs (boot-guard, logging) are the slowest per test; they timed out the
  // deploy gate twice on starved runners for diffs that never touched them.
  const g = pick(["js/ui/hud.js", "index.html"]);
  assert.ok(g.has("tiny"), "the blanket rules still route to the boot group for a human reader");
  for (const why of g.get("tiny")) assert.ok(BOOT_FALLBACK_REASONS.has(why), `unexpected boot reason: ${why}`);
  assert.equal(dropBootFallback(g), true);
  assert.ok(!g.has("tiny"), "the selected gate drops the boot group when only the blanket rules named it");
  // A group named for a specific reason stays.
  const specific = new Map([["tiny", new Set(["js/core/log.js"])]]);
  assert.equal(dropBootFallback(specific), false);
  assert.ok(specific.has("tiny"));
});

test("junit-failed reads Playwright's junit shape (system-out BEFORE the failure) and normalises the path", () => {
  const xml = `<testsuites>
<testsuite name="specs/logging.spec.js">
<testcase name="a" classname="specs/logging.spec.js" time="1.0"/>
<testcase name="b" classname="specs/logging.spec.js" time="135.7">
<system-out>
<![CDATA[ noise ]]>
</system-out>
<error message="Test timeout of 120000ms exceeded." type="Error">
<![CDATA[ stack ]]>
</error>
</testcase>
<testcase name="c" classname="specs/boot-guard.spec.js" time="120.0">
<failure message="expect failed" type="FAILURE">x</failure>
</testcase>
<testcase name="d" classname="specs/smoke.spec.js" time="9.0">
<system-out><![CDATA[ passed with output ]]></system-out>
</testcase>
</testsuite></testsuites>`;
  assert.deepEqual(failedSpecsFrom(xml), ["tests/specs/boot-guard.spec.js", "tests/specs/logging.spec.js"]);
  assert.deepEqual(failedSpecsFrom("<testsuites></testsuites>"), []);
});

test("junit-failed counts a failing testcase that names no spec (15-F2, 2026-10-10)", () => {
  // A load / setup error has no classname; `if (!cn) continue` used to drop it, so a
  // shard that failed outside any test read as "no failures".
  const xml = `<testsuites><testsuite>
<testcase name="spec failed to load"><failure message="x">boom</failure></testcase>
<testcase name="g" classname="global-setup.js"><error message="e">boom</error></testcase>
<testcase name="ok" classname="specs/logging.spec.js"/>
<testcase name="bad" classname="specs/smoke.spec.js"><failure message="f">x</failure></testcase>
</testsuite></testsuites>`;
  assert.deepEqual(unattributedFailuresFrom(xml), ["(no spec) g", "(no spec) spec failed to load"]);
  assert.deepEqual(failedSpecsFrom(xml), ["tests/specs/smoke.spec.js"]);
});

test("a spec that cannot pass at the gate's per-test cap declares so, and is excluded", () => {
  // hud-layout.spec.js boots a full race — 22 cars, a built circuit, the maps
  // pass — for every one of its ~19 generated cases, just to measure HUD box
  // geometry. On a CI runner the page log puts that fixture at 76-80 s before
  // the test body starts.
  //
  // It declared no budget, so `fit()` read "undeclared" as "fits in 120 s" and
  // let it into the change-aware gate that every other race-fixture spec is
  // excluded from. It then failed 6 of its first 7 cases at exactly "Test
  // timeout of 120000ms exceeded" and burned the job's whole 26-minute cap,
  // which CANCELLED Pages #1967 — run 33822785596, job 100868882762. A deploy
  // stopped by a spec that never had a chance to pass.
  //
  // Pinned as the RULE, not the number: whatever the gate's cap is, this spec
  // must sit above it and must therefore be excluded. Raising the gate later
  // does not quietly re-admit it.
  const own = maxDeclaredTimeout("tests/specs/hud-layout.spec.js");
  assert.ok(own > SELECTED_GATE.perTestTimeoutSec * 1000,
    `hud-layout.spec.js declares ${own / 1000}s, at or under the ${SELECTED_GATE.perTestTimeoutSec}s gate — ` +
    "it boots a full race per case and cannot pass there; see Pages #1967");

  const r = fit(["tests/specs/hud-layout.spec.js"], 26);
  assert.deepEqual(r.selected, [], "the budgeted gate must not select it");
  assert.ok(r.overBudgetRun.some((s) => s.file === "tests/specs/hud-layout.spec.js"),
    "it runs in the over-budget pool, whose job is capped from its own declaration");
  const job = shards(r).find((j) => j.specs.split(" ").includes("tests/specs/hud-layout.spec.js"));
  assert.ok(job && job.perTest >= own / 1000, `its job's per-test cap clears its ${own / 1000}s declaration`);
});

test("every race-fixture spec the gate has starved DECLARES a budget above it", () => {
  // Pages #2048 (2026-09-05) failed its selected gate twice on three specs none
  // of which the change had touched: physics-hotpath declared 120 s (UNDER the
  // 180 s gate, so it was admitted, then its own budget killed it at 132-177 s
  // on the runner), map-hooks and projection declared nothing (read as "fits",
  // ran 185-190 s and 116-125 s + a context that never came). Each boots a full
  // race or two circuits; each belongs to a browser group, not the gate.
  //
  // Same RULE as hud-layout above, one row per victim: above whatever the gate's
  // cap is, and NAMED as over budget in the report. Add a spec here the day the
  // gate starves it — the declaration is the fix, this row keeps it fixed.
  //
  // projection.spec.js was the third row until 2026-09-22: it is ADAPTED now
  // (runs under the vm-page adapter, 13 s), so fit() files it as
  // coveredByVmTwin before budgeting and never as over budget. Its 300 s
  // declaration still stands in the file for the day it leaves ADAPTED.
  for (const spec of [
    "tests/specs/physics-hotpath.spec.js",
    "tests/specs/map-hooks.spec.js",
  ]) {
    const own = maxDeclaredTimeout(spec);
    assert.ok(own > SELECTED_GATE.perTestTimeoutSec * 1000,
      `${spec} declares ${own / 1000}s, at or under the ${SELECTED_GATE.perTestTimeoutSec}s gate — ` +
      "it boots a race fixture and cannot pass there; see Pages #2048");
    const r = fit([spec], 26);
    assert.deepEqual(r.selected, [], `the budgeted gate must not select ${spec}`);
    assert.ok(r.overBudgetRun.some((x) => x.file === spec), `${spec} must run in the over-budget pool`);
  }
});

test("the gate's per-test timeout clears the SLOWEST spec, not the average one", () => {
  // The defect this pins: 120 s bounded the mean test (79.7 s) and not the
  // slowest, so the gate failed specs that pass. Measured on an idle box,
  // one worker, 2026-09-04 — raise these only against a fresh measurement.
  const SLOWEST_MEASURED_SEC = 124.2;   // physics-fixes, Monaco lap continuity
  assert.ok(SELECTED_GATE.perTestTimeoutSec > SLOWEST_MEASURED_SEC,
    `gate ${SELECTED_GATE.perTestTimeoutSec}s does not clear the slowest measured ` +
    `spec (${SLOWEST_MEASURED_SEC}s) — it will fail specs that pass`);
  // ...with real margin, not by a second: CI runners are shared and slower.
  assert.ok(SELECTED_GATE.perTestTimeoutSec > SLOWEST_MEASURED_SEC * 1.25,
    "a timeout that only just clears the slowest spec fails on any contention");
});

test("the cut fills AFFECTED specs first, so the spec you edited cannot lose to smaller routed ones", () => {
  // 2026-09-10 audit: a changed 10-test assets spec was omitted while three
  // smaller routed specs consumed the budget, because the priority was applied
  // AFTER a smallest-first cut. Real specs so declaredTests resolves; a budget
  // that holds the edited spec but not the edited spec plus the smallest other.
  const changed = "tests/specs/assets-api.spec.js";
  const small = ["tests/specs/output-paths.spec.js", "tests/specs/telemetry-compare.spec.js",
                 "tests/specs/race-control.spec.js"];
  const fb = MEASURED.secPerTest;
  const minSmall = Math.min(...small.map(declaredTests));
  const budget = budgetFor((declaredTests(changed) + minSmall / 2) * fb);
  const rank = (f) => f === changed ? 0 : 3;
  const r = fit([...small, changed], budget, { rank, db: EMPTY });
  assert.ok(r.selected.some((s) => s.file === changed), "the edited spec is selected");
  assert.equal(r.selected[0].file, changed, "and it is first in the budgeted set");
  // Under the old smallest-first cut the same inputs dropped it:
  const old = fit([...small, changed], budget, { db: EMPTY });
  assert.ok(!old.selected.some((s) => s.file === changed), "the pre-fix ordering reproduces the audit's omission");
});

test("an affected spec that cannot fit the budget runs OUTSIDE the budget, bounded, named and capped", () => {
  const big = "tests/specs/multiplayer-session.spec.js", small = "tests/specs/boot-guard.spec.js";
  const budget = budgetFor(declaredTests(small) * MEASURED.secPerTest + 1);
  const affected = fit([big, small], budget, { rank: (f) => f === big ? 0 : 3, db: EMPTY });
  assert.deepEqual(affected.oversize.map((s) => s.file), [big], "affected + too big = outside the budget");
  assert.ok(!affected.unreachable.some((s) => s.file === big), "not reported as unreachable when it will run");
  // Merely routed + too big ALSO runs as oversize: dropping tracks-walls here
  // would re-open the cancel-with-0-failures hole.
  const routed = fit([big, small], budget, { db: EMPTY });
  assert.deepEqual(routed.oversize.map((s) => s.file), [big], "routed + too big still runs");
  assert.deepEqual(routed.unreachable.map((s) => s.file), [], "not parked as unreachable");
  // PACKED, not one runner each (2026-09-29): the two fit one job together,
  // and that job's kill timer clears both at the fallback rate plus
  // MAX_FAILURES timeouts.
  const plan = shards(affected, EMPTY);
  const job = plan.find((j) => j.specs.split(" ").includes(big));
  assert.ok(job, "the plan carries the oversize spec");
  assert.equal(plan.length, 1, `two small specs share one runner: ${JSON.stringify(plan)}`);
  assert.equal(job.timeout, shardCapMin(job.sec, SELECTED_GATE.perTestTimeoutSec));
  assert.ok(MAX_OVERSIZE_SHARDS >= 1 && MAX_OVERSIZE_SHARDS <= 4, "fan-out stays bounded");
});

test("a leftover billed over one overflow job still runs when room remains", () => {
  // hud-layout: 32 tests. 26 s/test → 832 s > TARGET_SHARD_SEC. Rank 3 + cost
  // still inside the whole budget used to leave it SKIPPED (PR #1021 run
  // 37472255445). Overflow now admits it while room lasts; shards() splits it.
  const big = "tests/specs/hud-layout.spec.js";
  const small = "tests/specs/boot-guard.spec.js";
  const nBig = declaredTests(big);
  assert.ok(nBig > 10, `hud-layout declares ${nBig} tests`);
  const db = at([big, small], 26);
  const r = fit([big, small], DEFAULT_BUDGET_MIN, { db, overflowShards: 11, rank: () => 3 });
  const running = [...r.overflow, ...r.oversize, ...r.selected].map((s) => s.file);
  assert.ok(running.includes(big), "too-big leftover is not dropped");
  assert.equal(r.skipped.filter((s) => s.file === big).length, 0);
  assert.equal(r.overBudgetSpecs.filter((s) => s.file === big).length, 0);
  const planned = shards(r, db).flatMap((j) => j.specs.split(" "));
  assert.ok(planned.includes(big), "shards() carries the leftover spec");
});

test("a loop-expanded per-circuit spec is billed at fleet size, and split only when its EXPECTED run is long", () => {
  // The concrete failure: select billed tracks-walls as 4, packed it with
  // foundations into one shard (timeout 39), Playwright ran ~63 tests at
  // 45-58 s each, job cancelled at the cap with 0 failures. The count stays
  // the fleet's; what changed (2026-09-29) is that a split is decided by the
  // measured cost, not by "every test times out".
  const walls = "tests/specs/tracks-walls-a.spec.js";
  const n = declaredTests(walls);
  assert.ok(n > 15, `walls-a expands to ${n} — the per-circuit half must be counted`);
  // Cheap (llvmpipe measured ~3.3 s/test): one job, no --shard.
  const cheap = at([walls, "tests/specs/boot-guard.spec.js"], 3);
  const r1 = fit([walls, "tests/specs/boot-guard.spec.js"], 15, { db: cheap });
  const p1 = shards(r1, cheap).filter((j) => j.specs.includes(walls));
  assert.equal(p1.length, 1, "a 3-minute spec is one job");
  assert.equal(p1[0].shard, "", "…and carries no --shard token");
  // Slow (SwiftShader-like, 50 s/test): split so each piece is under the target.
  const slow = at([walls], 50);
  const r2 = fit([walls], 15, { db: slow });
  const pieces = shards(r2, slow).filter((j) => j.specs === walls);
  assert.ok(pieces.length >= 2, `expected multiple Playwright shards, got ${pieces.length}`);
  assert.ok(pieces.every((j) => /^\d+\/\d+$/.test(j.shard)), "each piece carries --shard=i/n");
  assert.ok(pieces.every((j) => j.sec <= TARGET_SHARD_SEC), "no piece expects more than the target");
  assert.ok(pieces.every((j) => j.timeout === shardCapMin(j.sec, j.perTest)), "each piece's kill timer matches its plan");
});

test("a tracked-path change narrows the selection to the edited/imported specs instead of emptying it", () => {
  // Before: reason "infra" set selected = [] and the gate ran nothing for a
  // change to the shell or a shared fixture — silent exactly when everything
  // might be affected. The reason still reports "infra" so the log says why the
  // selection is narrower than the change; the selection itself stands.
  const src = fs.readFileSync(path.join(ROOT, "tools/ci/select-specs.mjs"), "utf8");
  assert.ok(!/reason === "infra"\) \{ r\.skipped/.test(src), "select() no longer blanks the selection on infra");
  assert.match(src, /r\.shards = shards\(r\)/, "select() emits the matrix plan the CI job consumes");
});

test("ci.yml runs the selected gate with the settings the selector models", () => {
  // Three files encode these numbers (select-specs, select-budget, ci.yml) and
  // the workflow is the only one the runner actually obeys. When they drifted,
  // the model described a job that did not exist.
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
  const ms = SELECTED_GATE.perTestTimeoutSec * 1000;
  // Retries come from the plan: 0 on every leg but a quarantined spec's own
  // (R3-CI-HEALTH-4; tests/unit/flaky-quarantine.test.mjs pins that half).
  assert.equal(SELECTED_GATE.retries, 0);
  assert.match(yml, new RegExp(`--retries=\\$\\{\\{ matrix\\.retries \\|\\| 0 \\}\\} --timeout=${ms} --max-failures=${MAX_FAILURES}`),
    `ci.yml's selected step does not run --retries=<plan> --timeout=${ms} --max-failures=${MAX_FAILURES}`);
  // The cap is DERIVED per job by shardCapMin and handed over through the
  // matrix; it must clear the budgeted job's worst case, which --max-failures
  // bounds: its whole allowance, then MAX_FAILURES timeouts, then setup.
  assert.match(yml, /name: Selected specs[\s\S]*?timeout-minutes: \$\{\{ matrix\.timeout \}\}/,
    "the selected job's cap must come from the matrix (shardCapMin), not a literal");
  const { secFit } = fit([], DEFAULT_BUDGET_MIN);
  assert.equal(shardCapMin(secFit), MAX_SELECTED_JOB_MIN,
    `passing selected legs are capped at ${MAX_SELECTED_JOB_MIN} min (career was 27-34 min when the cap priced three 540 s timeouts)`);
  assert.ok(shardCapMin(1) >= 6 && shardCapMin(1) <= MAX_SELECTED_JOB_MIN);
  // The circuit lane reaches the runner: the plan's ids become the job's env.
  assert.match(yml, /APEX_CIRCUITS: \$\{\{ matrix\.circuits \}\}/,
    "the selected job must pass matrix.circuits to APEX_CIRCUITS, or the circuit lane runs the whole fleet");
  // The deploy gate runs it now: no caller-key exclusion on the plan job.
  const selectJob = /\n  select:\n[\s\S]*?\n  selected:\n/.exec(yml)?.[0] || "";
  assert.ok(selectJob && !/concurrency_key == ''/.test(selectJob),
    "the select job must not skip itself on the Pages call — exact-commit deploys need the change-aware gate too");
});

test("raising the gate must not enrol specs that opted out of the lower one", () => {
  // The defect: the exclusion used `own > gate`, so a spec declaring EXACTLY
  // the gate's budget was SELECTED with zero headroom and then killed at its
  // own declared figure. Raising the gate 120 -> 180 s silently pulled in all
  // five specs that declare exactly 180 s — audio-smoke (115.5 s SOLO on an
  // idle 4-core), material-shimmer, and the qatar/spa/suzuka foundations.
  //
  // The one way in since 2026-09-29 is EVIDENCE: CI measured the spec at a
  // third of the gate's per-test timeout or less (measuredCheap). A spec that
  // is only declared, never measured, still may not be selected.
  const gateMs = SELECTED_GATE.perTestTimeoutSec * 1000;
  const files = fs.readdirSync(path.join(ROOT, "tests/specs"))
    .filter((f) => f.endsWith(".spec.js")).map((f) => `tests/specs/${f}`);
  const atOrOver = files.filter((f) => maxDeclaredTimeout(f) >= gateMs);
  assert.ok(atOrOver.length > 0, "no spec declares at or over the gate — this test is vacuous");
  for (const db of [EMPTY, undefined]) {
    const r = fit(files, 60, db ? { db } : {});
    const selected = new Set(r.selected.map((x) => x.file));
    for (const f of atOrOver) {
      if (!selected.has(f)) continue;
      assert.ok(db !== EMPTY && measuredCheap(f),
        `${f} declares ${maxDeclaredTimeout(f) / 1000}s against a ${SELECTED_GATE.perTestTimeoutSec}s gate ` +
        "and was SELECTED without a measurement that says it is cheap");
      const row = r.selected.find((x) => x.file === f);
      assert.equal(row.ownTimeoutSec, maxDeclaredTimeout(f) / 1000,
        "a measured-cheap spec keeps its declared figure so its job's kill timer clears it");
    }
  }
});

/* A DOCS-ONLY DEPLOY MUST NOT FAIL THE SELECTED GATE (2026-09-08).
 *
 * ci.yml's push trigger ignores docs/**, **&#47;*.md, .claude/** and .cursor/**, so a
 * docs commit never reaches the selected gate by push. pages.yml CALLS the
 * workflow, and workflow_call does not honour paths-ignore — so on the DEPLOY
 * path the gate saw a docs diff, matched no rule, and failed closed. An
 * AGENTS.md-only deploy took a Pages run red for a change that ships no code.
 * "unmatched" means the selection is untrustworthy; "no code changed" is a
 * different fact and now has its own reason. */
test("a docs-only change is 'nothing to select', never 'unmatched'", () => {
  assert.equal(isDocsOnly(["AGENTS.md"]), true, "the file that actually broke it");
  assert.equal(isDocsOnly(["docs/TESTING.md", "README.md"]), true);
  assert.equal(isDocsOnly([".claude/skills/x/SKILL.md"]), true);
  // .mdc is not .md, so this one rides on the .cursor/ PREFIX rule, not the
  // extension rule — which is exactly why the list needs both shapes.
  assert.equal(isDocsOnly([".cursor/rules/apex-shared.mdc"]), true);
  // A docs change RIDING ALONG with code is not docs-only: the code must select.
  assert.equal(isDocsOnly(["AGENTS.md", "js/game.js"]), false);
  assert.equal(isDocsOnly(["js/game.js"]), false);
  // No files changed at all is "none", handled before this predicate.
  assert.equal(isDocsOnly([]), false);
});

test("DOCS_ONLY still mirrors ci.yml's paths-ignore", () => {
  // The comment on DOCS_ONLY says these two lists move together. If someone
  // adds a path to the workflow's ignore list and not here, a deploy touching
  // only that path fails closed again — which is the whole defect.
  const ci = fs.readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
  const ignored = [...ci.matchAll(/^\s*-\s+"([^"]+)"\s*$/gm)].map((m) => m[1]);
  for (const pat of ["docs/**", "**/*.md", ".claude/**", ".cursor/**"]) {
    assert.ok(ignored.includes(pat), `ci.yml no longer ignores ${pat} — re-derive DOCS_ONLY`);
  }
  assert.equal(DOCS_ONLY.length, 4, "a pattern was added or removed without updating this pin");
});


/* THE SELECTOR AIMED AT ITSELF — the three holes a 2026-09-20 survey found in
 * the machinery whose whole job is deciding what the gate runs. */

test("the TRACKED infra list names where the selector tools ACTUALLY live", () => {
  // These four moved tools/ -> tools/ci/ and this list kept the old paths, so
  // a change to the selection machinery matched no rule, selected ZERO browser
  // specs, and printed no "SELECTION NARROWER THAN THE CHANGE" warning. A
  // selector that goes silent precisely when it is the thing being edited is
  // the failure TRACKED exists to prevent, turned on itself.
  const hit = (p) => TRACKED.some((r) => r.test(p));
  for (const f of ["tools/ci/select-specs.mjs", "tools/ci/pick-tests.mjs",
                   "tools/ci/select-budget.mjs", "tools/ci/run-playwright.mjs"]) {
    assert.ok(hit(f), `${f} is selection machinery and must be TRACKED`);
    assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} does not exist — re-point TRACKED, do not pin a ghost`);
  }
  assert.ok(hit("tools/manifest.cjs"), "manifest.cjs is still at tools/, not tools/ci/");
});

test("an over-budget spec runs whether the diff EDITS it or merely routes it", () => {
  /* 56 of 119 specs declare >= the gate's 180 s, and the over-budget test used
     to `continue` BEFORE ranking — so 47% of the suite could not be selected by
     any change, including a change that edits the spec itself.

     The `>=` rule is unchanged for UNMEASURED specs: declaring the whole budget
     opts a spec out of the BUDGETED set. What it may not do is opt the spec out
     of running when you just edited it. */
  const over = "tests/specs/career.spec.js";            // declares well over the gate
  assert.ok(maxDeclaredTimeout(over) >= 180000, "pick a spec that is still over budget");

  const edited = fit([over], 30, { rank: (f) => (f === over ? 0 : 3), db: EMPTY });
  assert.deepEqual(edited.oversize.map((s) => s.file), [over], "an EDITED over-budget spec runs");
  assert.equal(edited.overBudgetSpecs.length, 0);
  assert.equal(edited.selected.length, 0, "…but never inside the budgeted set");

  // 2026-10-04: a merely ROUTED one runs too, in the over-budget pool — it
  // used to be excluded, and post-edit.sh told authors to declare > 180 s to
  // join it. Only an exhausted pool drops it, by name.
  const routed = fit([over], 30, { rank: () => 3, db: EMPTY });
  assert.deepEqual(routed.overBudgetRun.map((s) => s.file), [over], "a merely ROUTED one runs in the pool");
  assert.deepEqual(routed.overBudgetSpecs, []);
  assert.equal(routed.oversize.length, 0);
  const full = fit([over], 30, { rank: () => 3, db: EMPTY, overBudgetShards: 0 });
  assert.deepEqual(full.overBudgetSpecs.map((s) => s.file), [over], "an exhausted pool drops it BY NAME");
  const rjobs = shards(routed, EMPTY).filter((x) => x.specs.includes(over));
  const declared = maxDeclaredTimeout(over) / 1000;
  assert.ok(rjobs.length >= 1 && rjobs.every((j) => j.perTest === declared && j.timeout === shardCapMin(j.sec, declared, FAT_UI_SELECTED_JOB_MIN)),
    "a routed over-budget job is capped at the spec's own per-test timeout too");

  // Every job carrying it has a kill timer derived from the spec's OWN
  // declared per-test figure, not the gate's: a 180 s cap for a spec that says
  // it needs 300+ kills the job, and a killed job reads as "0 failures".
  const own = edited.oversize[0].ownTimeoutSec;
  const jobs = shards(edited, EMPTY).filter((x) => x.specs.includes(over));
  assert.ok(jobs.length >= 1, "the edited spec gets at least one job");
  assert.ok(jobs.every((j) => j.perTest === own && j.timeout === shardCapMin(j.sec, own, FAT_UI_SELECTED_JOB_MIN)),
    "each job is capped at the spec's own per-test timeout");
  if (jobs.length > 1) assert.ok(jobs.every((j) => /^\d+\/\d+$/.test(j.shard)), "a split plan carries --shard tokens");
});

test("mega-sweep specs never share a selected Chromium", () => {
  const megas = fs.readdirSync(path.join(ROOT, "tests/specs")).map((f) => `tests/specs/${f}`)
    .filter((f) => isMegaSweepSpec(f));
  assert.ok(megas.includes("tests/specs/material-shimmer.spec.js"));
  assert.equal(isMegaSweepSpec("tests/specs/terrain-over-road.spec.js"), false);
  for (const mega of megas) {
    const cut = fit([mega], 30, { rank: () => 0, db: EMPTY });
    const jobs = shards(cut, EMPTY).filter((j) => j.specs.split(" ").includes(mega));
    assert.ok(jobs.every((j) => j.specs === mega), `${mega} must run alone`);
  }
});

test("partitionMegaSweepArgs peels terrain-over-road out of a packed circuits argv", () => {
  // browser-group.yml shards the whole circuits group with Playwright --shard;
  // without this peel the mega-sweep shares a Chromium with qatar-foundation
  // (run 36911235525). Helpers live next to SOLO_OWN_TIMEOUT_SEC so both gates
  // use the same threshold. props-over-road left the mega set on 2026-09-30
  // (PR #576: one test per circuit at 120 s) — it must NOT peel.
  const props = "tests/specs/props-over-road.spec.js";
  const terrain = "tests/specs/terrain-over-road.spec.js";
  const shimmer = "tests/specs/material-shimmer.spec.js";
  const qatar = "tests/specs/qatar-foundation.spec.js";
  assert.equal(isMegaSweepSpec(props), false,
    "props-over-road is under the selected gate; peel must not isolate it");
  assert.equal(isMegaSweepSpec(terrain), false,
    "terrain-over-road is a per-circuit 180 s walk, under the mega threshold");
  assert.equal(isMegaSweepSpec(shimmer), true);
  assert.equal(isMegaSweepSpec(qatar), false);
  assert.equal(isMegaSweepSpec("tests/specs/*-foundation.spec.js"), false);

  const packed = ["--timeout=900000", "--shard=2/4", "--workers=1", props, qatar, shimmer];
  const { mega: peeled, rest, peeled: did } = partitionMegaSweepArgs(packed);
  assert.equal(did, true);
  assert.deepEqual(peeled, [shimmer]);
  assert.deepEqual(rest, ["--timeout=900000", "--shard=2/4", "--workers=1", props, qatar]);
  assert.deepEqual(playwrightShard(packed), { index: 2, total: 4 });
  assert.deepEqual(megasForThisShard(packed, [shimmer]), [], "a lone mega lands on shard 1; shard 2 must not re-run it");
  assert.deepEqual(megasForThisShard(["--shard=1/4", shimmer, qatar], [shimmer]), [shimmer]);
  assert.deepEqual(megasForThisShard([shimmer, qatar], [shimmer]), [shimmer], "unsharded runs megas once");
  assert.deepEqual(megaSoloFlags(packed), ["--timeout=900000", "--workers=1"]);
});

test("solo oversize mega keeps --shard (selected gate does not peel itself)", () => {
  // PR #1113 / #1109: select-specs already shards tlx-probes 1/3. Peeling the
  // lone file dropped --shard (megaSoloFlags) and ran all 17 tests on shard 1
  // inside a 6 min cap billed for 6; shards 2/3 exited green with no tests.
  const tlx = "tests/specs/tlx-probes.spec.js";
  assert.equal(isMegaSweepSpec(tlx), true, "tlx-probes test.slow() is mega-class");
  const solo = [tlx, "--retries=0", "--timeout=180000", "--max-failures=3", "--shard=1/3"];
  const { mega, rest, peeled } = partitionMegaSweepArgs(solo);
  assert.equal(peeled, false);
  assert.deepEqual(mega, []);
  assert.deepEqual(rest, solo);
  assert.deepEqual(playwrightShard(solo), { index: 1, total: 3 });
});

test("shardCapMin leaves wrap-up room after Mesa setup", () => {
  // PR #1109 image-grade-visual 1of2: 5 tests billed ~265 s → used to cap at
  // 8 min; 5/5 passed in 379 s after 113 s Mesa, then the kill hit upload.
  // Since R3-CI-HEALTH-6: 2 x work + one 180 s timeout + setup 3 + wrap 2.
  assert.equal(shardCapMin(265), MAX_SELECTED_JOB_MIN);
  assert.equal(shardCapMin(163), 2 * 3 + 3 + 3 + 2);
  assert.equal(shardCapMin(1), 2 + 3 + 3 + 2);
  assert.ok(shardCapMin(1) >= 6, "the floor stays");
});

test("a leg packed to TARGET_SHARD_SEC gets a cap of 2x its work + setup + wrap (R3-CI-HEALTH-6)", () => {
  // Ship 37996125261 selected-5 (104 tests) and 38020479662 selected-2 (87):
  // killed at the 10 min cap after `+ pass 101/104` / `+ pass 85/87`, 0
  // failed — 561 s of passing tests in a leg billed ~360 s, a 1.6x cap. The
  // comment promised 2x; the formula added a flat 5 min.
  const fullLeg = shardCapMin(TARGET_SHARD_SEC);
  const workMin = Math.ceil(TARGET_SHARD_SEC / 60);
  assert.ok(fullLeg >= 2 * workMin + SELECTED_SETUP_MIN + SELECTED_WRAP_MIN,
    `a full leg (${TARGET_SHARD_SEC} s) is capped at ${fullLeg} min — under 2 x ${workMin} + ${SELECTED_SETUP_MIN} + ${SELECTED_WRAP_MIN}`);
  assert.ok(fullLeg >= 561 / 60 + SELECTED_SETUP_MIN + SELECTED_WRAP_MIN, "the measured 561 s passing leg fits with its setup");
  // Every leg the planner can emit at the gate's own timeout keeps that 2x.
  for (const sec of [1, 60, 120, 200, 300, TARGET_SHARD_SEC]) {
    const cap = shardCapMin(sec);
    assert.ok(cap >= 2 * Math.ceil(sec / 60) + SELECTED_SETUP_MIN + SELECTED_WRAP_MIN, `${sec} s -> ${cap} min`);
    assert.ok(cap <= MAX_SELECTED_JOB_MIN);
  }
  // A shorter leg also keeps one whole per-test timeout of headroom, so one
  // hung test fails by its own timeout rather than the job's kill.
  assert.ok(shardCapMin(120) >= 2 * 2 + Math.ceil(SELECTED_GATE.perTestTimeoutSec / 60) + SELECTED_SETUP_MIN + SELECTED_WRAP_MIN);
  // A retry (a quarantined spec's leg) buys one more timeout of headroom.
  assert.ok(shardCapMin(60, 180, MAX_SELECTED_JOB_MIN, 1) > shardCapMin(60, 180, MAX_SELECTED_JOB_MIN, 0));
});

test("declared-slow specs are split by MEASURED time, not 8 tests a leg: the 22-of-30-legs-under-2-min plan (R3-CI-HEALTH-3)", () => {
  // Ship run 38041862767's oversize legs, from its select log: new-hooks 7 x
  // ~46 s, terrain-over-road 7 x ~118 s, ui-scale 3 x ~75 s, menu-keyboard
  // 3 x ~50 s — 20 jobs, 18 of them expecting under 2 min, because each spec
  // DECLARES >= the gate's 180 s a test and MAX_TESTS_PER_JOB cut it by count
  // (20 of the run's 30 legs ran < 2 min of tests; ~0.55 min setup each).
  // Measured per-test rates from that log (expected s / tests per leg).
  const rate = { "tests/specs/new-hooks.spec.js": 46 / 8, "tests/specs/terrain-over-road.spec.js": 118 / 8,
    "tests/specs/ui-scale.spec.js": 75 / 7, "tests/specs/menu-keyboard.spec.js": 50 / 7 };
  const files = Object.keys(rate);
  const db = { specs: Object.fromEntries(files.map((f) => [f,
    { s: [1, 2, 3].map((i) => [`2026-10-0${i}T00:00:00Z`, "llvmpipe", rate[f] * declaredTests(f), declaredTests(f)]) }])) };
  const rows = files.map((f) => ({ file: f, tests: declaredTests(f), ownTimeoutSec: maxDeclaredTimeout(f) / 1000 }));
  for (const r of rows) assert.ok(r.ownTimeoutSec >= SELECTED_GATE.perTestTimeoutSec, `${r.file} must still declare >= the gate (${r.ownTimeoutSec} s)`);
  // The count rule, as it was: max(ceil(sec / target), ceil(tests / 8)) legs each.
  const before = rows.flatMap((r) => {
    const sec = expectedSec(r, db), n = Math.max(Math.ceil(sec / TARGET_SHARD_SEC), Math.ceil(r.tests / MAX_TESTS_PER_JOB));
    return Array.from({ length: n }, () => sec / n);
  });
  const plan = shards({ selected: [], oversize: rows }, db, new Set());
  const after = plan.filter((j) => files.some((f) => j.specs.split(" ").includes(f)));
  assert.ok(before.length >= 18, `the count rule's plan: ${before.length} legs`);
  assert.ok(after.length * 2 <= before.length, `measured time must at least halve the legs: ${before.length} -> ${after.length} (${after.map((j) => `${j.name}:${j.sec}s`).join(", ")})`);
  assert.ok(after.filter((j) => j.sec < 120).length < before.filter((s) => s < 120).length,
    "fewer legs that pay setup and a queue slot for under 2 min of tests");
  // Every spec still runs whole: the pieces of a split carry --shard i/n.
  for (const f of files) {
    const legs = after.filter((j) => j.specs.split(" ").includes(f));
    assert.ok(legs.length >= 1, `${f} runs`);
    if (legs.length > 1) assert.ok(legs.every((j) => j.specs === f && new RegExp(`^\\d+/${legs.length}$`).test(j.shard)), `${f} split as --shard i/${legs.length}`);
  }
  // BOUNDED BY THE PER-TEST TIMEOUT: no leg expects more than the target, and
  // each leg's cap still holds 2x its work plus one of its spec's declared
  // timeouts, where the ceiling allows one.
  assert.ok(after.every((j) => j.sec <= TARGET_SHARD_SEC), "no leg over the target");
  for (const j of after) {
    const need = 2 * Math.ceil(j.sec / 60) + SELECTED_SETUP_MIN + SELECTED_WRAP_MIN;
    assert.ok(j.timeout >= need, `${j.name}: cap ${j.timeout} < 2x work + setup (${need})`);
    if (need + Math.ceil(j.perTest / 60) <= MAX_SELECTED_JOB_MIN) assert.ok(j.timeout >= need + Math.ceil(j.perTest / 60), `${j.name}: no timeout headroom`);
  }
  // UNMEASURED, the count rule stands: a fallback rate is a guess, and the
  // declared timeout is the only signal of what the spec costs.
  const blind = shards({ selected: [], oversize: rows.filter((r) => r.file.includes("new-hooks")) }, EMPTY, new Set());
  assert.equal(blind.length, Math.max(Math.ceil(expectedSec(rows[0], EMPTY) / TARGET_SHARD_SEC), Math.ceil(rows[0].tests / MAX_TESTS_PER_JOB)));
});

test("the browser legs do not wait on the guards aggregator, and a guards red still fails the run (R3-CI-HEALTH-2)", () => {
  // Ship run 38041862767: the legs started at 11.3 min behind the 30 s
  // aggregator's own queue trip instead of ~2; in the 07:59Z burst that trip
  // alone queued 26-37 min. The verdict jobs keep the edge.
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
  const job = (name) => (yml.split(`\n  ${name}:\n`)[1] || "").split(/^  [a-z][\w-]*:$/m)[0];
  const needsOf = (name) => {
    const body = job(name);
    const inline = body.match(/^    needs: \[([^\]]*)\]$/m);
    if (inline) return inline[1].split(",").map((x) => x.trim());
    const list = body.match(/^    needs:\n((?:      - [\w-]+\n)+)/m);
    return list ? list[1].trim().split("\n").map((l) => l.replace(/^\s*- /, "")) : [];
  };
  assert.deepEqual(needsOf("selected"), ["select"], "the matrix starts as soon as the plan exists");
  assert.doesNotMatch(job("selected").match(/^    if: .*$/m)?.[0] || "", /needs\.guards/, "its if: must not read a job it does not need");
  for (const j of ["selected-verdict", "ci-verdict", "poke-train"]) assert.ok(needsOf(j).includes("guards"), `${j} must still need guards`);
  assert.match(job("poke-train"), /needs\.guards\.result == 'success'/, "a guards red pokes no train");
  const verdictSrc = fs.readFileSync(path.join(ROOT, "tools/ci/selected-gate-verdict.mjs"), "utf8");
  assert.match(verdictSrc, /if \(guards !== "success" && guards !== "skipped"\)/, "selected-verdict reds on a guards red");
  assert.match(job("selected-verdict"), /GUARDS: \$\{\{ needs\.guards\.result \}\}/);
});

test("run-playwright keeps native --shard for megas-only oversize jobs (PR #1110)", () => {
  // select-specs shards() emits oversize-tlx-probes-1of3 with --shard=1/3 and a
  // 6 min kill timer sized for ~1/3 of the file. partitionMegaSweepArgs no longer
  // peels a lone mega (#1113); run-playwright still guards peeled megas-only + shard.
  const runner = fs.readFileSync(path.join(ROOT, "tools/ci/run-playwright.mjs"), "utf8");
  assert.match(runner, /playwrightShard/, "imports the shard parser");
  assert.match(runner, /megas-only \+ --shard/, "names the oversize exception");
  assert.match(runner, /skip megaShardPlan/, "does not re-home a planned count shard");
  const tlx = "tests/specs/tlx-probes.spec.js";
  assert.equal(isMegaSweepSpec(tlx), true, "tlx-probes still peels when packed with siblings");
  const alone = ["--timeout=180000", "--shard=1/3", "--workers=1", tlx];
  const soloPart = partitionMegaSweepArgs(alone);
  assert.equal(soloPart.peeled, false, "lone oversize job keeps native --shard in argv (PR #1113/#1109)");
  assert.deepEqual(soloPart.rest, alone);
  assert.deepEqual(playwrightShard(alone), { index: 1, total: 3 });
  // Packed with a sibling: peel stays the packed-group path (megaShardPlan).
  const packed = ["--shard=2/4", "tests/specs/qatar-foundation.spec.js", tlx];
  const p = partitionMegaSweepArgs(packed);
  assert.deepEqual(p.mega, [tlx]);
  assert.ok(p.rest.some((a) => a.includes("qatar-foundation")), "sibling stays on the shared shard");
});

test("mega solos spread across shards longest-first, each on exactly one shard (T1)", () => {
  // modes nightly 2026-10-04 (run 37195789273): career AND quali solo on shard
  // 1 = 1827 s against 185/276/410 s on shards 2-4.
  const db = { specs: {} };   // constant-rate fallback: expected = declared tests x 7.5 s
  const megas = fs.readdirSync(path.join(ROOT, "tests/specs")).map((f) => `tests/specs/${f}`)
    .filter((f) => isMegaSweepSpec(f)).sort();
  assert.ok(megas.length >= 1, `need at least one mega to spread, found ${megas.length}`);
  for (const total of [1, 2, 4]) {
    const plan = megaShardPlan(megas, total, db);
    const owners = [];
    for (let i = 1; i <= total; i++) owners.push(...megasForThisShard([`--shard=${i}/${total}`], megas, db));
    assert.deepEqual(owners.sort(), megas, `${total} shards: every mega runs exactly once`);
    for (const shard of plan.values()) assert.ok(shard >= 1 && shard <= total);
    // Deterministic: a reversed input list gives the same plan.
    assert.deepEqual([...megaShardPlan([...megas].reverse(), total, db)].sort(), [...plan].sort());
  }
  const career = "tests/specs/career.spec.js", quali = "tests/specs/quali.spec.js";
  if (isMegaSweepSpec(career) && isMegaSweepSpec(quali)) {
    const plan = megaShardPlan([career, quali], 4, db);
    assert.equal(plan.get(career), 1, "the longest mega takes shard 1");
    assert.notEqual(plan.get(quali), plan.get(career), "the modes megas no longer share a runner");
  }
  // Load beats count: one long mega against two short ones on 2 shards.
  const ranked = megas.map((f) => [f, declaredTests(f) || 1]).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const plan2 = megaShardPlan(megas, 2, db);
  assert.equal(plan2.get(ranked[0][0]), 1);
  const load = [0, 0];
  for (const [f, n] of ranked) load[plan2.get(f) - 1] += n;
  assert.ok(Math.max(...load) - Math.min(...load) <= ranked[0][1], `LPT bound: ${load}`);
  // The runner consumes the plan, not the old shard-1 rule.
  const runner = fs.readFileSync(path.join(ROOT, "tools/ci/run-playwright.mjs"), "utf8");
  assert.match(runner, /megasForThisShard\(args, mega\)/);
  assert.match(runner, /for \(const spec of megaHere\)/);
});

test("SOURCE_AFFECTED elevates career.spec.js when career-ui or career-backup changes", () => {
  // PR #611: modes-group routing alone left career.spec.js in overBudgetSpecs
  // (declares 540 s), so EXPORT/IMPORT reusing .cr-slot-del shipped green.
  const career = [
    "tests/specs/career.spec.js",
    "tests/specs/career-season.spec.js",
    "tests/specs/career-hub.spec.js",
  ];
  assert.ok(SOURCE_AFFECTED.some(([re, spec]) =>
    re.test("js/career/career-ui.js") && re.test("js/career/career-backup.js") && spec === career[0]));
  assert.deepEqual(specsAffectedBySource(["js/career/career-ui.js"]).sort(), [...career].sort());
  assert.deepEqual(specsAffectedBySource(["js/career/career-backup.js"]).sort(), [...career].sort());
  assert.deepEqual(specsAffectedBySource(["js/career/career.js"]), [],
    "other career modules stay merely routed");
  const over = career[0];
  // Rank 2 (import / foundation / SOURCE_AFFECTED) must put it in oversize.
  const pinned = fit([over], 30, { rank: (f) => (f === over ? 2 : 3), db: EMPTY });
  assert.deepEqual(pinned.oversize.map((s) => s.file), [over],
    "SOURCE_AFFECTED rank runs the over-budget career.spec as oversize");
  assert.equal(pinned.overBudgetSpecs.length, 0);
});

test("a spec this tool cannot READ is reported, never silently dropped", () => {
  // It used to `continue` into no bucket at all, in a file whose entire
  // contract is that nothing leaves the selection unaccounted for. Reachable
  // by any missing or renamed path — found by handing fit() a spec that does
  // not exist and watching it vanish from every list in the result.
  // BUILT, not written as a literal: docs-integrity.test.mjs scans source for
  // path-shaped tokens and fails on any that does not exist — correctly, and a
  // deliberately-absent path is exactly the case it cannot tell from a typo.
  const ghost = ["tests", "specs", "no-such-spec.spec.js"].join("/");
  assert.ok(!fs.existsSync(path.join(ROOT, ghost)), "the point of this test is that it is absent");
  const r = fit([ghost], 60, { rank: () => 3 });
  assert.deepEqual(r.unreadable.map((s) => s.file), [ghost]);
  for (const k of ["selected", "skipped", "unreachable", "oversize", "overBudgetRun", "overBudgetSpecs"]) {
    assert.equal((r[k] || []).length, 0, `${k} must not claim a spec that could not be read`);
  }
});

test("career / hud-layout selected legs use 2 workers instead of a fake Playwright shard", () => {
  // Pages 37420997285: --shard=1/5 of career.spec.js billed 21 tests per
  // shard but ran ~101 on shard 1 (~22 min) because Playwright shards GROUPS.
  const files = [
    "tests/specs/career.spec.js",
    "tests/specs/career-season.spec.js",
    "tests/specs/career-hub.spec.js",
    "tests/specs/hud-layout.spec.js",
  ];
  for (const f of files) {
    const n = declaredTests(f);
    assert.ok(n >= 1, `${f} has tests`);
    const jobs = shards(fit([f], 30, { rank: () => 0, db: EMPTY }), EMPTY)
      .filter((j) => j.specs.includes(f));
    assert.equal(jobs.length, 1, `${f} must be one job, not ${jobs.length} --shard pieces`);
    assert.equal(jobs[0].shard, "", `${f} must not use Playwright --shard`);
    assert.equal(jobs[0].workers, 2, `${f} runs two workers so wall time halves`);
    assert.equal(jobs[0].timeout, shardCapMin(jobs[0].sec, jobs[0].perTest, FAT_UI_SELECTED_JOB_MIN),
      `${f} kill timer must use the fat-UI ceiling, not the packed 10 min one`);
    assert.ok(jobs[0].timeout <= FAT_UI_SELECTED_JOB_MIN,
      `${f} job cap ${jobs[0].timeout} exceeds ${FAT_UI_SELECTED_JOB_MIN}`);
    assert.ok(jobs[0].sec >= (n * FAT_UI_SEC_PER_TEST) / 2 - 1,
      `${f} billed ${jobs[0].sec}s must floor at ~${FAT_UI_SEC_PER_TEST}s/test / 2 workers (PR #1075 37446472987)`);
  }
  const terrain = "tests/specs/terrain-over-road.spec.js";
  const tJobs = shards(fit([terrain], 30, { rank: () => 0, db: EMPTY }), EMPTY)
    .filter((j) => j.specs.includes(terrain));
  assert.ok(tJobs.length >= 1, "terrain-over-road must run");
  assert.ok(tJobs.every((j) => j.timeout <= MAX_SELECTED_JOB_MIN),
    `terrain job cap ${tJobs.map((j) => j.timeout)} exceeds ${MAX_SELECTED_JOB_MIN}`);
});

test("fit bills each spec at its MEASURED rate, and an unmeasured selection cuts at the fallback", () => {
  // 2026-09-24: the cut counted TESTS against a cap derived from one 79.7 s
  // mean, so the per-spec medians select-budget reports (3+ CI samples) never
  // moved a selection. Synthetic histories pin it. Budgeted specs only: none
  // twinned, fixed-gate or over the per-test gate.
  const specs = ["tests/specs/output-paths.spec.js", "tests/specs/telemetry-compare.spec.js",
                 "tests/specs/assets-api.spec.js"];
  const total = specs.reduce((n, f) => n + declaredTests(f), 0);
  // Holds every spec at 5 s a test, but not at the fallback rate.
  const budget = budgetFor(total * (5 + MEASURED.secPerTest) / 2);
  const flat = fit(specs, budget, { db: EMPTY });
  assert.ok(flat.secSelected <= flat.secFit, "no history: the fallback-rate boundary holds");
  const cheap = at(specs, 5);
  const measured = fit(specs, budget, { db: cheap });
  assert.equal(measured.selected.length, specs.length, "every spec at 5 s a test fits");
  assert.ok(measured.selected.length > flat.selected.length, "the measured rate must change the cut, or it is decoration");
  assert.ok(measured.secSelected <= measured.secFit, `${measured.secSelected} s billed into ${measured.secFit} s`);
  // Two samples are not a median: below MIN_SAMPLES the fallback stands.
  const thin = { specs: Object.fromEntries(Object.entries(cheap.specs).map(([f, v]) => [f, { s: v.s.slice(0, 2) }])) };
  assert.deepEqual(fit(specs, budget, { db: thin }).selected.map((s) => s.file), flat.selected.map((s) => s.file));
  // A local sample never sets a CI budget.
  const local = { specs: Object.fromEntries(Object.entries(cheap.specs).map(([f, v]) => [f, { s: v.s.map((x) => [x[0], "local", x[2], x[3]]) }])) };
  assert.deepEqual(fit(specs, budget, { db: local }).selected.map((s) => s.file), flat.selected.map((s) => s.file));
  // The job's kill timer is derived from what it expects to spend.
  const plan = shards({ ...measured, oversize: [] }, cheap);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].timeout, shardCapMin(plan[0].sec));
  assert.equal(plan[0].sec, Math.round(expectedSec({ file: specs[0], tests: 0 }, cheap)
    + specs.reduce((n, f) => n + expectedSec({ file: f, tests: declaredTests(f) }, cheap), 0)));
});

/* THE CIRCUIT LANE (2026-09-29). Most branches racing for the 20 runner slots
 * on 2026-09-29 touched one circuit each; the routing ran every circuit's
 * specs and excluded the one about the circuit that changed. */
test("a circuit-only diff names its circuits; anything else leaves the fleet on", () => {
  const imola = circuitsTouched(["js/circuits/scenery/imola.js", "js/circuits/imola.js",
    "docs/tracks/imola.md", "tests/unit/scenery-api-contract.test.mjs"], null);
  assert.deepEqual(imola.ids, ["imola"]);
  assert.equal(imola.scoped, true, "prose and node unit files cannot change what a circuit spec sees");
  const two = circuitsTouched(["js/circuits/monza.js", "js/circuits/scenery/spa.js"], null);
  assert.deepEqual(two.ids, ["monza", "spa"]);
  assert.equal(two.scoped, true);
  const engine = circuitsTouched(["js/circuits/monza.js", "js/track/tracks.js"], null);
  assert.equal(engine.scoped, false, "an engine edit reaches every circuit");
  assert.deepEqual(engine.ids, ["monza"], "…but the touched circuit is still named (its foundation spec runs)");
  for (const f of CIRCUIT_FILTERED_TESTS) {
    assert.equal(circuitsTouched(["js/circuits/monza.js", f], null).scoped, false,
      `editing ${f} edits the per-circuit loop itself, so it must run whole`);
  }
  assert.equal(circuitsTouched(["tests/data/scenery-audit-baseline.json"], null).scoped, false,
    "a per-circuit data file the tool cannot diff (no base) is not scoped");
  assert.equal(circuitsTouched([], null).scoped, false, "no change is not a circuit change");
});

test("a circuit landmark registry + its foundation spec stay circuit-scoped (PR #1015)", () => {
  // tests/data/landmarks/<id>.json matches TRACKED (`^tests/data/`) and a
  // *-foundation.spec.js is not CIRCUIT_FILE; without CIRCUIT_LANDMARK /
  // CIRCUIT_FOUNDATION the selected gate treated a Monza-only PR as fleet
  // infra and dropped props-over-road, tracks-walls, and parts-physics.
  const files = [
    "js/circuits/scenery/monza.js",
    "tests/data/landmarks/monza.json",
    "tests/specs/monza-foundation.spec.js",
    "tools/ci/select-specs.mjs",
    "tests/unit/select-specs.test.mjs",
  ];
  const r = circuitsTouched(files, null);
  assert.deepEqual(r.ids, ["monza"]);
  assert.equal(r.scoped, true, "landmark + foundation + the selector stay circuit-only");
  assert.deepEqual(racingCircuitIds(files), [],
    "scenery/landmarks/foundation do not race-route the default-fixture fleet (PR #1015 run 37446466249)");
  assert.ok(CIRCUIT_DEF.test("js/circuits/monza.js"));
  assert.ok(!CIRCUIT_DEF.test("js/circuits/scenery/monza.js"), "scenery is not a def");
  assert.deepEqual(racingCircuitIds(["js/circuits/monza.js", "js/circuits/scenery/monza.js"]), ["monza"]);
  assert.ok(r.dataResolved.includes("tests/data/landmarks/monza.json"));
  const clipAlone = circuitsTouched(["tools/track/clip-baseline.json"], null);
  assert.equal(clipAlone.scoped, false, "a baseline the base git cannot show, alone, stays infra");
  const clipWithCircuit = circuitsTouched(
    ["tools/track/clip-baseline.json", "js/circuits/scenery/monza.js",
     "tests/data/scenery-audit-baseline.json", "tools/track/props-tris-baseline.json"], null);
  assert.equal(clipWithCircuit.scoped, true,
    "unreadable baselines pin to circuits the rest of the diff already named (blob:none CI)");
  assert.deepEqual(clipWithCircuit.ids, ["monza"]);
  assert.ok(clipWithCircuit.dataResolved.includes("tools/track/clip-baseline.json"));
});

test("every APEX_CIRCUITS-filtered test actually reads APEX_CIRCUITS", () => {
  // The plan hands the ids to a job's env; a listed test that ignores them
  // runs the whole fleet while the plan's comment claims otherwise, and one
  // that reads them but is not listed would be narrowed by an edit to itself.
  for (const f of CIRCUIT_FILTERED_TESTS) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} is gone — drop it from CIRCUIT_FILTERED_TESTS`);
    assert.match(fs.readFileSync(path.join(ROOT, f), "utf8"), /process\.env\.APEX_CIRCUITS/, `${f} ignores APEX_CIRCUITS`);
  }
  const readers = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const rel = path.relative(ROOT, p).replaceAll("\\", "/");
      if (name === "helpers" || rel === "tests/unit/select-specs.test.mjs") continue;
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/\.(js|mjs|cjs)$/.test(name) && fs.readFileSync(p, "utf8").includes("process.env.APEX_CIRCUITS")) readers.push(rel);
    }
  };
  walk(path.join(ROOT, "tests"));
  assert.deepEqual(readers.sort(), [...CIRCUIT_FILTERED_TESTS].sort(),
    "a test that reads APEX_CIRCUITS must be listed in CIRCUIT_FILTERED_TESTS");
});

test("a circuit's own foundation spec is affected, and other circuits' are not candidates", () => {
  // dcb3e721b (imola wave-6 scenery) excluded imola-foundation for its declared
  // 420 s and ran abudhabi/interlagos-foundation instead.
  assert.equal(foundationSpec("albert_park"), "tests/specs/albert-park-foundation.spec.js");
  assert.ok(fs.existsSync(path.join(ROOT, foundationSpec("imola"))));
  const src = fs.readFileSync(path.join(ROOT, "tools/ci/select-specs.mjs"), "utf8");
  // ownFoundations share rank 2 with imports and SOURCE_AFFECTED pins.
  assert.match(src, /ownFoundations\.includes\(f\).*sourceAffected\.includes\(f\)\) \? 2 : 3/,
    "own foundation specs rank as affected (2)");
  assert.match(src, /\.filter\(\(f\) => !otherCircuit\(f\)\)/, "other circuits' foundations leave the candidates");
});

test("a circuit edit routes the specs that RACE that circuit, read from the files (T2)", () => {
  // #878 moved Bahrain's startFrac; steering.spec (races bahrain) went red on
  // six unrelated PRs because a bahrain edit never selected it.
  const bahrain = specsRacing(["bahrain"]);
  assert.ok(bahrain.includes("tests/specs/steering.spec.js"), "the #878 regression must now be routed");
  assert.ok(bahrain.length >= 10, `only ${bahrain.length} specs race bahrain — the scan broke`);
  for (const f of bahrain) assert.ok(circuitsOf(f)?.has("bahrain"), `${f} does not build bahrain`);
  assert.ok(specsRacing(["monza"]).length > bahrain.length, "monza is the fixtures' default circuit");
  assert.deepEqual(specsRacing([]), [], "no circuit touched routes nothing");
  // A roster walker is the circuits group's business, not this route's.
  const walker = fs.readdirSync(path.join(ROOT, "tests/specs")).map((f) => `tests/specs/${f}`)
    .find((f) => f.endsWith(".spec.js") && circuitsOf(f) === null);
  if (walker) assert.ok(!specsRacing(["monza"]).includes(walker), `${walker} walks the roster`);
  // Wiring: routed (rank 3, budgeted), never forced past fit() as affected.
  const src = fs.readFileSync(path.join(ROOT, "tools/ci/select-specs.mjs"), "utf8");
  assert.match(src, /const racing = specsRacing\(racingCircuitIds\(changed\)\);/);
  assert.match(src, /\.\.\.specs, \.\.\.racing\]\)\]/, "racing specs join the routed candidates");
  assert.doesNotMatch(src, /racing\.includes\(f\)\) \? [012]/, "a racing spec must not out-rank group routing");
});

test("a per-circuit data file resolves to the circuits whose rows changed", () => {
  // Build a two-commit repo so dataCircuits reads a real base, for both shapes.
  // artifacts/ is gitignored, so a fresh clone or worktree has none.
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  const tmp = fs.mkdtempSync(path.join(ROOT, "artifacts", "dc-"));
  try {
    const git = (...a) => execFileSync("git", a, { cwd: tmp, encoding: "utf8" });
    git("init", "-q"); git("config", "user.email", "t@t"); git("config", "user.name", "t");
    const nested = "nested.json", flat = "flat.json";
    fs.writeFileSync(path.join(tmp, nested), JSON.stringify({ "//": "x", buried: { monza: 1, spa: [2] }, unsupported: { imola: 3 } }));
    fs.writeFileSync(path.join(tmp, flat), JSON.stringify({ monza: 10, spa: 20 }));
    git("add", "."); git("commit", "-qm", "base");
    fs.writeFileSync(path.join(tmp, nested), JSON.stringify({ "//": "y", buried: { monza: 1, spa: [3] }, unsupported: { imola: 3, baku: 1 } }));
    fs.writeFileSync(path.join(tmp, flat), JSON.stringify({ monza: 11, spa: 20 }));
    assert.deepEqual([...dataCircuits(nested, "HEAD", tmp)].sort(), ["baku", "spa"]);
    assert.deepEqual([...dataCircuits(flat, "HEAD", tmp)], ["monza"]);
    fs.writeFileSync(path.join(tmp, flat), "{not json");
    assert.equal(dataCircuits(flat, "HEAD", tmp), null, "unreadable -> null, and the caller keeps it infra");
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("every job in a plan has a UNIQUE name, and the budgeted ones are selected-<i>", () => {
  /* Run 37198214523 (PR #842): three budgeted jobs all named `selected` raced
     for one carry-forward cache key ("Unable to reserve cache") and uploaded
     three artifacts called spec-timings-junit-selected-selected. A whole-suite
     plan at a small budget forces several budgeted bins plus overflow and
     over-budget bins. */
  const specs = fs.readdirSync(path.join(ROOT, "tests/specs")).filter((f) => f.endsWith(".spec.js"))
    .map((f) => "tests/specs/" + f);
  const r = fit(specs, 10, { db: EMPTY });
  const plan = shards(r, EMPTY);
  const names = plan.map((j) => j.name);
  assert.equal(new Set(names).size, names.length, `duplicate job names: ${names.join(", ")}`);
  assert.ok(names.filter((n) => /^selected-\d+$/.test(n)).length >= 1, "the budgeted bins are selected-<i>");
  assert.ok(!names.includes("selected"), "no bare `selected` name is left for a cache key to collide on");
  assert.ok(names.some((n) => /^overbudget-\d+$/.test(n)), "routed declared-slow specs get overbudget-<k> jobs");
  // The over-budget pool never shares a bin with the budgeted specs: a 300-540 s
  // declaration must not raise a `selected-<i>` job's kill timer.
  const ob = new Set(r.overBudgetRun.map((x) => x.file));
  for (const j of plan.filter((x) => x.name.startsWith("selected-")))
    assert.ok(j.specs.split(" ").every((f) => !ob.has(f)), `${j.name} carries an over-budget-pool spec`);
});

test("a routed over-budget spec is never silently dropped: run, or named, and every run spec is in a job", () => {
  const specs = fs.readdirSync(path.join(ROOT, "tests/specs")).filter((f) => f.endsWith(".spec.js"))
    .map((f) => "tests/specs/" + f);
  for (const opts of [{}, { overBudgetShards: 1 }, { overBudgetShards: 0 }]) {
    const r = fit(specs, 10, { db: EMPTY, ...opts });
    const over = specs.filter((f) => maxDeclaredTimeout(f) >= SELECTED_GATE.perTestTimeoutSec * 1000);
    const accounted = new Set([...r.selected, ...r.oversize, ...r.overflow, ...r.overBudgetRun, ...r.overBudgetSpecs,
      ...r.skipped, ...r.unreachable, ...r.coveredByFixedGates, ...r.coveredByManualOptIn, ...r.coveredByVmTwin].map((x) => x.file));
    for (const f of over) assert.ok(accounted.has(f), `${f} is in no bucket (${JSON.stringify(opts)})`);
    const planned = new Set(shards(r, EMPTY).flatMap((j) => j.specs.split(" ")));
    for (const x of [...r.selected, ...r.oversize, ...r.overflow, ...r.overBudgetRun])
      assert.ok(planned.has(x.file), `${x.file} is meant to run but no job carries it (${JSON.stringify(opts)})`);
    const poolSec = r.overBudgetRun.reduce((n, x) => n + x.sec, 0);
    assert.ok(poolSec <= (opts.overBudgetShards ?? MAX_OVER_BUDGET_SHARDS) * TARGET_SHARD_SEC,
      `the pool spends ${poolSec} s, over its allowance`);
  }
  assert.ok(MAX_OVERFLOW_SHARDS >= 11 && MAX_OVER_BUDGET_SHARDS >= 1, "both allowances exist");
});

test("post-edit.sh no longer tells authors to declare > 180 s to escape the gate", () => {
  const hook = fs.readFileSync(path.join(ROOT, ".claude/hooks/post-edit.sh"), "utf8");
  assert.doesNotMatch(hook, /above 180 s|excludes it by name/,
    "declaring a big timeout no longer opts a spec out of CI; the advice must not come back");
  const step = fs.readFileSync(path.join(ROOT, "tools/ci/ci-select-specs-step.sh"), "utf8");
  assert.match(step, /overBudgetRun/, "the CI step names the specs the over-budget pool runs");
  assert.match(step, /::warning::DROPPED/, "a dropped spec is an annotation on the PR");
});

test("L9: circuitsOf(the ADAPTED runner) is the union of its specs' circuits (2026-10-09)", async () => {
  const { ADAPTED, ADAPTED_RUNNER } = await import("../../tools/ci/twinned-specs.mjs");
  const want = new Set();
  for (const spec of Object.keys(ADAPTED)) for (const id of circuitsOf(spec) || []) want.add(id);
  assert.ok(want.has("cota"));
  assert.deepEqual([...circuitsOf(ADAPTED_RUNNER)].sort(), [...want].sort());
});

test("maxDeclaredTimeout folds `BOOT_MS + 240_000` and bills an unresolvable argument as over the cap (15-F4, 2026-10-10)", () => {
  // garage-out-before-card declares BOOT_MS (45 s, imported from the fixtures) + 240_000 = 285 s per
  // test, over the gate's 180 s cap; only literals counted, so it read 0 and was selected into the
  // ordinary budgeted shards, where test.setTimeout overrides the CLI --timeout.
  assert.equal(maxDeclaredTimeout("tests/specs/garage-out-before-card.spec.js"), 285_000);
  assert.ok(maxDeclaredTimeout("tests/specs/garage-out-before-card.spec.js") > SELECTED_GATE.perTestTimeoutSec * 1000);
  assert.equal(maxDeclaredTimeout("tests/specs/real-race.spec.js"), 135_000, "BOOT_MS + 90000");
  const dir = fs.mkdtempSync(path.join(ROOT, "scratch", "mdt-"));
  try {
    const rel = (n) => path.relative(ROOT, path.join(dir, n));
    fs.writeFileSync(path.join(dir, "a.spec.js"), 'const T = 100_000;\ntest.setTimeout(T * 2 + 5);\n');
    fs.writeFileSync(path.join(dir, "b.spec.js"), 'test.setTimeout(someRuntimeValue());\n');
    fs.writeFileSync(path.join(dir, "c.spec.js"), 'test.describe.configure({ timeout: 60_000 + 1 });\n');
    assert.equal(maxDeclaredTimeout(rel("a.spec.js")), 200_005);
    assert.equal(maxDeclaredTimeout(rel("b.spec.js")), 3 * SELECTED_GATE.perTestTimeoutSec * 1000, "unknown is over the cap, never free");
    assert.equal(maxDeclaredTimeout(rel("c.spec.js")), 60_001);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
