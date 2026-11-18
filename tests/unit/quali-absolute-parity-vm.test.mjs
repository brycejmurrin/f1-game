/* quali-absolute-parity-vm.test.mjs — at the SHIPPED pace, the simulated qualifying field sits where a
 * driver exactly as good as the AI would qualify: a tight band around QUALI_CENTRE of the lap the same
 * car DRIVES in clear air, on every kind of circuit and at every level.
 *
 * #5783 row Q1. The model once ran 6-9 % SLOWER than the AI drives (a lap at AI pace took pole at every
 * circuit), and its first refit (one trim, no wing term) sat 3.5 % under the driven laps with a sheet
 * one second wide (the same lap started last). Both fail here.
 *
 * THREE ASSERTIONS per circuit and level, on an AI-only field with every fourth grid car kept (slots
 * i % 4 == 0; the calibration tool measures slots 1 and 3, so this is a check of the committed table,
 * not a copy of it), the rest retired and lifted off the road, best of the timed laps, one seed, wear
 * and wind off (the VM's defaults):
 *   1. model lap / the same car's driven best lap, median over the sample, in [LO, HI];
 *   2. the sample's FASTEST model lap / its fastest driven lap in [FLO, FHI]: the front of the sheet,
 *      which a median cannot see (a sheet with no spread passes 1 and fails this);
 *   3. the model column of tests/data/quali-calibration.json is the model's lap today, to the ms.
 *
 * A FAILURE AFTER A CHANGE TO HOW THE AI DRIVES is the re-measure duty, not a tolerance to widen:
 *   node tools/check/quali-calibrate.mjs --update --jobs 3 && npm run gen      (3 fails alone: --model-only)
 *
 * Run: node --test tests/unit/quali-absolute-parity-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const CENTRE = 0.993;           // QUALI_CENTRE (js/race/quali-model.js)
const LO = 0.978, HI = 1.008;   // CENTRE ± 0.015
// The fastest car: ONE car's ratio, not a median, and the sheet is narrower than the driven field (the wing's
// straight-line share, #5791), so its band is CENTRE ± 0.025. Measured on this sample: 0.975 (monaco) to 1.013 (bahrain).
const FLO = 0.968, FHI = 1.018;
const CAL = JSON.parse(fs.readFileSync(new URL("../data/quali-calibration.json", import.meta.url), "utf8")).cells;
const LAPS = 3;                 // timed laps per car; the first includes the standing start
const KEEP = (i) => i % 4 === 0;

async function measure(track, difficulty) {
  const g = await createGame({ track, carMeshes: false, storage: { difficulty } });
  try {
    const a = g.apex, G = g.G;
    a.headless(true);
    await g.race(track, "day", "dry", { laps: LAPS + 2 });
    assert.equal(G.difficulty, difficulty, "the level took");
    assert.ok(Math.abs(G.PACE - 0.8396) < 0.001, "the shipped PACE, got " + G.PACE);
    const quali0 = g.sandbox.Quali.create(G);
    const stale = (CAL[track][difficulty] || []).filter(([i, code, , ms]) => G.cars[i].code !== code || Math.round(quali0.carLap(G.cars[i], G.track, G.gripMult(G.cars[i]), true) * 1000) !== ms);
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
    const timed = cars.map((c, i) => laps[i].length ? { m: quali.carLap(c, G.track, G.gripMult(c)), d: Math.min(...laps[i]) } : null).filter(Boolean);
    assert.ok(timed.length >= 4, `${track} ${difficulty}: ${timed.length} timed cars`);
    const rs = timed.map((x) => x.m / x.d).sort((x, y) => x - y);
    return { median: rs[(rs.length / 2) | 0], fastest: Math.min(...timed.map((x) => x.m)) / Math.min(...timed.map((x) => x.d)), stale: stale.length };
  } finally { g.close(); }
}

// Five characters: a power circuit, a street circuit, a long fast mix, a stop-start desert
// track and a flowing figure-eight.
for (const track of ["monza", "monaco", "spa", "bahrain", "suzuka"]) {
  test(`${track}: the modelled field sits a qualifying trim inside the driven laps at the shipped PACE, every level`, { timeout: 300000 }, async (t) => {
    const at = {};
    for (const d of ["easy", "normal", "hard"]) at[d] = await measure(track, d);
    const msg = Object.entries(at).map(([d, r]) => `${d}: median ${r.median.toFixed(3)} fastest ${r.fastest.toFixed(3)}`).join("  ");
    t.diagnostic(msg);
    for (const [d, r] of Object.entries(at)) {
      assert.equal(r.stale, 0, `${track} ${d}: ${r.stale} model laps in tests/data/quali-calibration.json are not the model's today — node tools/check/quali-calibrate.mjs --model-only && npm run gen`);
      assert.ok(r.median >= LO && r.median <= HI, `${track} ${d}: model/driven median ${r.median.toFixed(3)} outside [${LO}, ${HI}] around ${CENTRE} — ${msg}`);
      assert.ok(r.fastest >= FLO && r.fastest <= FHI, `${track} ${d}: fastest model / fastest driven ${r.fastest.toFixed(3)} outside [${FLO}, ${FHI}] — ${msg}`);
    }
  });
}
