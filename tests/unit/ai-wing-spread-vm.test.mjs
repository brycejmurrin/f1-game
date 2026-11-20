/* ai-wing-spread-vm.test.mjs — #5791 decision B: wing level is worth about 1 s a lap to an AI car, not 4-6 s.
 * Each AI car alone at Monza (tools/check/ai-solo.mjs soloField: hard, seed 1, tyre wear off, shipped
 * OVERALL SPEED), sim time at a fixed step, so the numbers are deterministic and blind to box load.
 *
 * Measured 2026-11-19 against deploy tip dec94440 (before → after):
 *   Gasly's Alpine alone, wing 0 vs wing 1:  126.33 / 120.42 s (5.92 s) → 123.73 / 122.73 s (1.00 s)
 *   one car per team, slowest − fastest:     8.03 s → 4.13 s
 * The bounds sit between the two states, so either half of option B undone fails here.
 *
 * Run: node --test tests/unit/ai-wing-spread-vm.test.mjs   (~30 s)
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { soloField } from "../../tools/check/ai-solo.mjs";

const BASE = { track: "monza", difficulty: "hard", laps: 1, seed: 1, wear: "off" };

test("Monza: the same AI car alone is 0.5-1.5 s quicker at wing 1 than wing 0 (was 5.9 s)", async () => {
  const lap = async (w) => {
    const r = await soloField({ ...BASE, only: (c) => c.code === "GAS", mutate: (c) => { c.aeroLoad = w; } });
    assert.equal(r.rows.length, 1, "Gasly is on the grid");
    assert.ok(Number.isFinite(r.rows[0].best), `a timed lap at wing ${w}`);
    return r.rows[0].best;
  };
  const lo = await lap(0), hi = await lap(1);
  const gain = lo - hi;
  assert.ok(gain > 0.5 && gain < 1.5, `wing 0 ${lo.toFixed(3)} s, wing 1 ${hi.toFixed(3)} s: gain ${gain.toFixed(3)} s`);
});

test("Monza: one car per team alone, fastest to slowest under 5.5 s (was 8.0 s)", async () => {
  const seen = new Set();
  const r = await soloField({ ...BASE, only: (c) => !seen.has(c.team.id) && seen.add(c.team.id) });
  const bests = r.rows.map((x) => x.best);
  assert.ok(bests.length >= 10 && bests.every(Number.isFinite), `every team timed: ${bests.join(", ")}`);
  const spread = Math.max(...bests) - Math.min(...bests);
  assert.ok(spread < 5.5, `per-team spread ${spread.toFixed(3)} s`);
});
