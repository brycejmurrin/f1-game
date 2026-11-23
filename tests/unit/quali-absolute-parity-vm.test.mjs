/* Qualifying parity at the shipped PACE. For five contrasting circuits and all three difficulty levels,
 * the field's modelled lap must match a solo AI driver's flying lap using the production qualifying start.
 * We time slots i % 4 == 0, held out from the calibration tool's slots 1 and 3.
 *
 * Assert the median paired ratio, the ratio of fastest times, and that the committed calibration still records
 * the current raw model to the millisecond. The parity tolerances remain ±1.5% and ±2.5% respectively.
 *
 * If AI driving changes, re-measure with quali-calibrate.mjs --update --jobs 3 and npm run gen.
 * A change to the model alone only needs --model-only and generation.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { flyingLap, METHOD } from "../../tools/check/quali-calibrate.mjs";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const LO = 0.985, HI = 1.015;
const FLO = 0.975, FHI = 1.025;
const CAL = JSON.parse(fs.readFileSync(new URL("../data/quali-calibration.json", import.meta.url), "utf8"));
const KEEP = (i) => i % 4 === 0;

async function measure(track, difficulty) {
  const g = await createGame({ track, carMeshes: false, storage: { difficulty } });
  try {
    const a = g.apex, G = g.G;
    a.headless(true);
    await g.race(track, "day", "dry", { laps: 3 });
    assert.equal(G.difficulty, difficulty);
    assert.ok(Math.abs(G.PACE - METHOD.pace) < 0.001, "the shipped PACE, got " + G.PACE);
    const quali = g.sandbox.Quali.create(G);
    const stale = CAL.cells[track][difficulty].filter(([i, code, , ms]) =>
      G.cars[i].code !== code || Math.round(quali.carLap(G.cars[i], G.track, G.gripMult(G.cars[i]), true) * 1000) !== ms);
    const cars = G.cars.filter((c, i) => !c.isPlayer && KEEP(i));
    assert.ok(cars.length >= 4, "a held-out field of " + cars.length);
    const model = cars.map((c) => quali.carLap(c, G.track, G.gripMult(c)));
    const timed = [];
    for (const [i, c] of cars.entries()) timed.push({ m: model[i], d: await flyingLap(g, track, c) / METHOD.hz });
    const rs = timed.map((x) => x.m / x.d).sort((x, y) => x - y);
    return { median: rs[(rs.length / 2) | 0], fastest: Math.min(...timed.map((x) => x.m)) / Math.min(...timed.map((x) => x.d)), stale: stale.length };
  } finally { g.close(); }
}

// Five characters: a power circuit, a street circuit, a long fast mix, a stop-start desert
// track and a flowing figure-eight.
assert.deepEqual(CAL.method, METHOD, "these data must come from qualifying starts");
for (const track of ["monza", "monaco", "spa", "bahrain", "suzuka"]) {
  test(`${track}: the modelled field matches independent qualifying flying laps at the shipped PACE, every level`, { timeout: 300000 }, async (t) => {
    const at = {};
    for (const d of ["easy", "normal", "hard"]) at[d] = await measure(track, d);
    const msg = Object.entries(at).map(([d, r]) => `${d}: median ${r.median.toFixed(3)} fastest ${r.fastest.toFixed(3)}`).join("  ");
    t.diagnostic(msg);
    for (const [d, r] of Object.entries(at)) {
      assert.equal(r.stale, 0, `${track} ${d}: ${r.stale} model laps in tests/data/quali-calibration.json are not the model's today — node tools/check/quali-calibrate.mjs --model-only && npm run gen`);
      assert.ok(r.median >= LO && r.median <= HI, `${track} ${d}: model/driven median ${r.median.toFixed(3)} outside [${LO}, ${HI}] — ${msg}`);
      assert.ok(r.fastest >= FLO && r.fastest <= FHI, `${track} ${d}: fastest model / fastest driven ${r.fastest.toFixed(3)} outside [${FLO}, ${FHI}] — ${msg}`);
    }
  });
}
