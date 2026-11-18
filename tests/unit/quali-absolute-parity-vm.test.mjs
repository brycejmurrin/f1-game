/* quali-absolute-parity-vm.test.mjs — at the SHIPPED pace, the simulated qualifying lap sits
 * just inside the lap the AI actually drives, on every kind of circuit and at every level.
 *
 * #5783 row Q1: js/race/quali-model.js was fitted at PACE 1 and read only dd.ai, and the
 * sibling test (quali-pace-parity-vm.test.mjs) checks PACE 0.44 / 1.34 only RELATIVE to each
 * circuit's own PACE-1 ratio. At the PACE the game ships (0.8396, slider 11) the model ran
 * 9–13 % SLOWER than the AI drives at Monza (sheet pole 132.2 s, the same cars' best laps
 * 118–123 s): a player matching AI pace took pole by seconds and time-trial gold was a lap the
 * AI beats by 6 %. The file's own promise is a ratio near 0.97.
 *
 * THE ASSERTION: model lap / the same car's DRIVEN best lap, median over a sampled field, sits
 * in [LO, HI] around 0.97 on each circuit below at easy, normal and hard. Measured like the
 * sibling test: AI-only field, every fourth grid car kept, the rest retired and lifted off the
 * road, best of the timed laps (the first carries the standing start, so the best is a flying
 * lap), one seed, wear and wind off (the VM's defaults).
 *
 * Run: node --test tests/unit/quali-absolute-parity-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const TARGET = 0.97;
const LO = 0.93, HI = 0.99;     // 0.97 −0.04 / +0.02: above 1 is a free pole, so the top edge is the tight one (fit: docs/notes/QUALI-REFIT-2026-11-18.md)
const LAPS = 3;                 // timed laps per car; the first includes the standing start
const KEEP = (i) => i % 4 === 0;

async function medianRatio(track, difficulty) {
  const g = await createGame({ track, carMeshes: false, storage: { difficulty } });
  try {
    const a = g.apex, G = g.G;
    a.headless(true);
    await g.race(track, "day", "dry", { laps: LAPS + 2 });
    assert.equal(G.difficulty, difficulty, "the level took");
    assert.ok(Math.abs(G.PACE - 0.8396) < 0.001, "the shipped PACE, got " + G.PACE);
    g.aiOnly();
    G.cars.forEach((c, i) => { if (!c.retired && !KEEP(i)) a.retire(i, "bench"); });
    // Off the road, not parked on it: see quali-pace-parity-vm.test.mjs (#5510).
    G.cars.forEach((c) => { if (c.retired) { c.x = (c.x >= 0 ? 1 : -1) * 500; c.xVis = c.x; c.parkedOnRoad = false; } });
    const cars = G.cars.filter((c) => !c.retired);
    assert.ok(cars.length >= 4, "a sampled field of " + cars.length);
    const quali = g.sandbox.Quali.create(G);
    const seen = cars.map((c) => c.lap || 0), last = cars.map(() => null), laps = cars.map(() => []);
    const DT = 1 / 60;
    let t = 0;
    for (let f = 0; f < Math.round(900 / DT) && laps.some((l) => l.length < LAPS); f++) {
      g.step(1, DT); t += DT;
      cars.forEach((c, i) => {
        if ((c.lap || 0) > seen[i]) { if (last[i] != null) laps[i].push(t - last[i]); last[i] = t; seen[i] = c.lap; }
      });
    }
    const rs = cars.map((c, i) => laps[i].length && quali.carLap(c, G.track, G.gripMult(c)) / Math.min(...laps[i]))
      .filter((r) => r > 0).sort((x, y) => x - y);
    assert.ok(rs.length >= 4, `${track} ${difficulty}: ${rs.length} timed cars`);
    return rs[(rs.length / 2) | 0];
  } finally { g.close(); }
}

// Five characters: a power circuit, a street circuit, a long fast mix, a stop-start desert
// track and a flowing figure-eight.
for (const track of ["monza", "monaco", "spa", "bahrain", "suzuka"]) {
  test(`${track}: the modelled lap sits just inside the driven lap at the shipped PACE, every level`, { timeout: 300000 }, async (t) => {
    const at = {};
    for (const d of ["easy", "normal", "hard"]) at[d] = await medianRatio(track, d);
    const msg = Object.entries(at).map(([d, r]) => d + ":" + r.toFixed(3)).join("  ");
    t.diagnostic(msg);
    for (const [d, r] of Object.entries(at))
      assert.ok(r >= LO && r <= HI, `${track} ${d}: model/driven ${r.toFixed(3)} outside [${LO}, ${HI}] around ${TARGET} — ${msg}`);
  });
}
