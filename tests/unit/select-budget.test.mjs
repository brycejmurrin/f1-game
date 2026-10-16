// select-budget — the arithmetic behind the change-aware CI decision.
//
// Guards the MODEL, not the recommendation. The measured constants are expected
// to move when CI's cost is re-measured; what must not move is the shape of the
// calculation, because the design decision (per-spec not per-group; a selector
// must not inherit a gate's retry settings) rests on it.
import test from "node:test";
import { DEFAULT_BUDGET_MIN } from "../../tools/ci/select-specs.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { capacity, declaredTests, MEASURED, VARIANTS, SPEC_COUNTS } from "../../tools/ci/select-budget.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("a failure costs timeout x (1 + retries) — the term the design omitted", () => {
  assert.equal(capacity(15, 1, { ...MEASURED, retries: 1, perTestTimeoutSec: 240 }).perFailureSec, 480);
  assert.equal(capacity(15, 1, { ...MEASURED, retries: 0, perTestTimeoutSec: 240 }).perFailureSec, 240);
});

test("capacity falls as the number of survivable failures rises", () => {
  const [a, b, c] = [0, 1, 2].map((k) => capacity(15, k).tests);
  assert.ok(a > b, `all-pass ${a} should exceed one-failure ${b}`);
  assert.ok(b > c, `one-failure ${b} should exceed two-failure ${c}`);
});

test("a budget smaller than one failure holds NOTHING, and says so", () => {
  // The trap this exists for: a formula that returns a positive number when the
  // budget cannot absorb a single timeout would read as "3 tests fit" for a job
  // that dies on the first red one.
  const tiny = capacity(5, 1, { ...MEASURED, retries: 1, perTestTimeoutSec: 240 });
  assert.equal(tiny.tests, 0, "a 5-minute budget cannot survive one 480 s failure");
});

test("cutting the failure cost buys more than doubling the budget", () => {
  // This is the design conclusion, so it is pinned rather than left in prose.
  const asSmokeRuns = capacity(15, 1, VARIANTS[0]).tests;
  const noRetry = capacity(15, 1, VARIANTS[1]).tests;
  const doubleBudget = capacity(30, 1, VARIANTS[0]).tests;
  assert.ok(noRetry > asSmokeRuns,
    `dropping the retry should raise capacity (${asSmokeRuns} -> ${noRetry})`);
  assert.ok(noRetry - asSmokeRuns >= 3,
    "the retry is the dominant term at this timeout, not a rounding difference");
  assert.ok(doubleBudget > noRetry, "doubling the budget still buys more, at twice the minutes");
});

test("declaredTests counts by AST, and rejects nothing silently", () => {
  assert.equal(declaredTests("tests/specs/physics-characterization.spec.js"), 1);
  assert.equal(declaredTests("tests/specs/smoke.spec.js"), 10);   // 10 since the DRIVING LINE test (2026-09-08)
  assert.equal(declaredTests("tests/specs/there-is-no-such.spec.js"), null,
    "a missing file must return null, not 0 — 0 would read as an empty spec");
});

test("declaredTests expands statically resolvable for-of loops (per-circuit specs)", () => {
  // CI run 36057109364: the selector billed tracks-walls as ~4 CallExpressions,
  // packed it into a 39-minute selected shard, and the job cancelled at 63/76
  // with 0 failures. The fleet has one .js def per circuit under js/circuits/.
  const circuits = fs.readdirSync(path.join(ROOT, "js/circuits"))
    .filter((f) => f.endsWith(".js")).length;
  assert.ok(circuits >= 40, `expected a full circuit fleet, got ${circuits}`);
  // Identity file: 1 list-match + STREET import (billed 1; 5 street ids live
  // in the helper) + 1 wrap + 4 edge-ram = 7. Fleet halves live in
  // tracks-walls-a/b (readdirSync + slice).
  assert.equal(declaredTests("tests/specs/tracks-walls.spec.js"), 7,
    "tracks-walls identity file bills list/street/wrap/edge, not the fleet walk");
  const half = Math.ceil(circuits / 2);
  assert.equal(declaredTests("tests/specs/tracks-walls-a.spec.js"), half,
    "fleet A bills one test per circuit in the first half");
  assert.equal(declaredTests("tests/specs/tracks-walls-b.spec.js"), circuits - half,
    "fleet B bills one test per circuit in the second half");
  // scenery-kits: 1 static + 5 theme rows
  assert.equal(declaredTests("tests/specs/scenery-kits.spec.js"), 6);
  // abudhabi-foundation: day + night
  assert.equal(declaredTests("tests/specs/abudhabi-foundation.spec.js"), 2);
  // menu-baseline: 2 shapes × 3 screens (the ci.yml comment already says six)
  assert.equal(declaredTests("tests/specs/menu-baseline.spec.js"), 6);
});

test("declaredTests expands the auditTracks() roster (terrain-over-road)", () => {
  // CI runs 37603233990 (selected-3, 72 tests run vs 21 billed) and
  // 37607617812 (selected-4, 73 run vs 22 billed): `for (const trk of
  // TRACKS)` with TRACKS = auditTracks() billed once, so terrain-over-road
  // read as 5 tests, packed beside five other specs, and the 10-minute job
  // was cancelled at its cap with 0 failures — which skipped poke-train.
  const roster = createRequire(import.meta.url)("../../tools/manifest.cjs").CIRCUITS.length;
  assert.ok(roster >= 40, `expected a full circuit roster, got ${roster}`);
  // 4 named single-circuit tests + one per circuit in the roster.
  assert.equal(declaredTests("tests/specs/terrain-over-road.spec.js"), 4 + roster,
    "terrain-over-road bills one test per audited circuit, not one for the loop");
});

test("the spec census is real — anti-vacuity", () => {
  assert.ok(SPEC_COUNTS.length > 50, `only ${SPEC_COUNTS.length} specs counted`);
  assert.ok(SPEC_COUNTS.at(-1).tests > 50,
    "the largest spec should be large — if every count collapsed to a handful, " +
    "the AST walk has broken and the whole budget argument is built on nothing");
});

test("per-GROUP selection does not fit, which is why the design changed", () => {
  // parts is 167 declared tests, modes 140. Both measured 2026-08-07. The
  // argument was first made at 79.7 s/test and 30 minutes; at the measured
  // llvmpipe rate (7.5 s, 2026-09-29) it holds at the budget the gate
  // actually spends, which is the one that matters.
  const atGate = capacity(DEFAULT_BUDGET_MIN, 1).tests;
  assert.ok(atGate < 140,
    `a ${DEFAULT_BUDGET_MIN}-minute budget holds ${atGate} tests; a 140-167-test group cannot be the unit ` +
    "of selection at the budget the gate spends");
});
