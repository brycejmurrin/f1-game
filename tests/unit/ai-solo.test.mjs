/* ai-solo.test.mjs — the pure halves of tools/check/ai-solo.mjs (no VM boot).
 * The race half is a measurement; these pin the two numbers it reports from
 * its rows: Spearman rho (average ranks on ties) and the spread / tier-order summary.
 *
 * Run: node --test tests/unit/ai-solo.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { spearman, summarize } from "../../tools/check/ai-solo.mjs";

test("spearman: identical order is 1, reversed is -1, ties take average ranks", () => {
  assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  assert.equal(spearman([1, 2, 3, 4], [40, 30, 20, 10]), -1);
  assert.equal(spearman([1, 1, 2], [1, 2, 3]), 0.8660254037844387);
  assert.equal(spearman([1], [1]), null);
});

test("summarize: spread, rho against -best, tier means in order", () => {
  const rows = [
    { tier: 0, best: 100, script: 0.94 },
    { tier: 0, best: 101, script: 0.939 },
    { tier: 1, best: 102, script: 0.93 },
    { tier: 1, best: 104, script: 0.929 },
    { tier: 2, best: NaN, script: 0.92 },
  ];
  const s = summarize(rows);
  assert.equal(s.timed, 4);
  assert.equal(s.fastest, 100);
  assert.equal(s.slowest, 104);
  assert.equal(s.spread, 0.040000000000000036);
  assert.equal(s.rho, 1);
  assert.equal(s.tierOrder, true);
  assert.deepEqual(s.tierMean, { 0: 100.5, 1: 103 });
  assert.equal(summarize([{ tier: 0, best: 101, script: 0.9 }, { tier: 1, best: 100, script: 0.8 }]).tierOrder, false);
  assert.deepEqual(summarize([]), { timed: 0 });
});
