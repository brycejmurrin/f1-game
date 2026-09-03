// select-budget — the arithmetic behind the change-aware CI decision.
//
// Guards the MODEL, not the recommendation. The measured constants are expected
// to move when CI's cost is re-measured; what must not move is the shape of the
// calculation, because the design decision (per-spec not per-group; a selector
// must not inherit a gate's retry settings) rests on it.
import test from "node:test";
import assert from "node:assert/strict";
import { capacity, declaredTests, MEASURED, VARIANTS, SPEC_COUNTS } from "../../tools/ci/select-budget.mjs";

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
  assert.equal(declaredTests("tests/specs/smoke.spec.js"), 9);
  assert.equal(declaredTests("tests/specs/there-is-no-such.spec.js"), null,
    "a missing file must return null, not 0 — 0 would read as an empty spec");
});

test("the spec census is real — anti-vacuity", () => {
  assert.ok(SPEC_COUNTS.length > 50, `only ${SPEC_COUNTS.length} specs counted`);
  assert.ok(SPEC_COUNTS.at(-1).tests > 50,
    "the largest spec should be large — if every count collapsed to a handful, " +
    "the AST walk has broken and the whole budget argument is built on nothing");
});

test("per-GROUP selection does not fit, which is why the design changed", () => {
  // parts is 167 declared tests, modes 140. Both measured 2026-08-07.
  const at30 = capacity(30, 1).tests;
  assert.ok(at30 < 100,
    `a 30-minute budget holds ${at30} tests; a 167-test group cannot be the unit ` +
    "of selection at any budget worth spending");
});
