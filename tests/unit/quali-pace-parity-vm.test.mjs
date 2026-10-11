/* quali-pace-parity-vm.test.mjs — simulated qualifying tracks the DRIVEN field at every OVERALL SPEED.
 *
 * R3-RACE-INTEGRITY-1: QUALI_TRIM (js/race/quali-model.js) was fitted at PACE 1 and
 * scaled only the straight-line cap, so the modelled field (and the time-trial
 * medal pole, referencePole) drifted off the AI's driven pace as the slider moved:
 * model lap / the same car's driven lap, medians, monza 1.215 / 0.994 / 0.936 and
 * monaco 1.058 / 0.904 / 0.933 at PACE 0.44 / 1 / 1.34 — a free pole and TT gold
 * at the bottom notch, a pole 4 % beyond the field's pace at the top.
 *
 * THE ASSERTION: on each circuit the median ratio at PACE 0.44 and 1.34 sits within
 * ±3 % of that circuit's own PACE-1 ratio (the calibrated one). Measured the way
 * scratch/hunt3-race-integrity/quali-pace.cjs measures it — AI-only field, each
 * car's first full racing lap in sim time — on a SAMPLED field (every fourth car,
 * the rest retired before the start) so six VM races fit the time budget.
 *
 * Run: node --test tests/unit/quali-pace-parity-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const PACES = [0.44, 1, 1.34];
const TOL = 0.03;
const KEEP = (i) => i % 4 === 0;   // the sampled field: every fourth grid slot

async function medianRatio(track, pace) {
  const g = await createGame({ track, carMeshes: false });
  try {
    const a = g.apex, G = g.G;
    a.headless(true);
    a.setPhysics({ pace });
    await g.race(track, "day", "dry", { laps: 3 });
    a.setPhysics({ pace });
    assert.equal(G.PACE, pace, "the pace slider took");
    g.aiOnly();
    G.cars.forEach((c, i) => { if (!c.retired && !KEEP(i)) a.retire(i, "bench"); });
    const cars = G.cars.filter((c) => !c.retired);
    assert.ok(cars.length >= 4, "a sampled field of " + cars.length);
    const quali = g.sandbox.Quali.create(G);
    const seen = cars.map((c) => c.lap || 0), lap = cars.map(() => null), last = cars.map(() => null);
    const DT = 1 / 60;
    let t = 0;
    for (let f = 0; f < Math.round(600 / DT) && lap.some((x) => x == null); f++) {
      g.step(1, DT); t += DT;
      cars.forEach((c, i) => {
        if ((c.lap || 0) > seen[i]) { if (last[i] != null && lap[i] == null) lap[i] = t - last[i]; last[i] = t; seen[i] = c.lap; }
      });
    }
    const rs = cars.map((c, i) => lap[i] && quali.carLap(c, G.track, G.gripMult(c)) / lap[i]).filter((r) => r > 0).sort((x, y) => x - y);
    assert.ok(rs.length >= 4, track + " @" + pace + ": " + rs.length + " timed laps");
    return { ratio: rs[(rs.length / 2) | 0], pole: quali.referencePole() };
  } finally { g.close(); }
}

for (const track of ["monza", "monaco"]) {
  test(track + ": the modelled field's lap tracks the driven lap at every PACE", { timeout: 240000 }, async (t) => {
    const at = {};
    for (const pace of PACES) at[pace] = await medianRatio(track, pace);
    const ref = at[1].ratio;
    const msg = PACES.map((p) => p + ":" + at[p].ratio.toFixed(3) + " (pole " + at[p].pole.toFixed(1) + " s)").join("  ");
    t.diagnostic(msg);
    for (const pace of [0.44, 1.34]) {
      const d = at[pace].ratio / ref - 1;
      assert.ok(Math.abs(d) <= TOL, `${track} PACE ${pace}: model/driven ${at[pace].ratio.toFixed(3)} is ${(d * 100).toFixed(1)} % off PACE 1's ${ref.toFixed(3)} — ${msg}`);
    }
  });
}
