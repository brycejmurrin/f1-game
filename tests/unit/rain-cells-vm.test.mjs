/* rain-cells-vm.test.mjs — LOCALIZED RAIN in the real game (tools/lib/game-vm.cjs runs js/game.js on an inert
 * DOM): under a shower over a window of the lap, gripMult(c) reads the SURFACE at the car's own s
 * (js/race/rain-cells.js; docs/PHYSICS.md classifies it), while the tread the conditions call for — the AI's
 * fitted tread, pit calls, engineer advice — reads the LAP MEAN, trackWetness(). The pure halves are
 * tests/unit/rain-cells.test.mjs.
 *
 * Run: node --test tests/unit/rain-cells-vm.test.mjs   (npm run test:game-vm)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");

let g;
before(async () => {
  g = await createGame({ track: "monza", carMeshes: false });
  await g.race("monza", "day", "dry");
  g.apex.headless(true);
});
after(() => g?.close());

/** A dry→rain arc with a stationary cell over [c0 − h, c0 + h], read `t` s in (a written arc.t re-bases the clock). */
function shower(h, t) {
  const G = g.G, L = G.track.total;
  G.weather("dry");   // drop any live arc: a re-target would carry the last shower's per-segment road
  const a = G.startWeatherArc("dry", "rain", 60);
  a.cell = { c0: 0.5, h, v: 0, life: 1e9, total: L };
  a.t = t;
  return { G, L, a };
}

test("gripMult differs by s: the car in the shower has wet grip, the car outside it dry grip", () => {
  const { G, L } = shower(0.1, 300);
  const inside = G.gripMult({ tread: 0, s: 0.5 * L }), outside = G.gripMult({ tread: 0, s: 0.05 * L });
  assert.equal(outside, 1, "dry road outside the cell");
  assert.ok(inside < 0.8, `slicks in the shower lose grip: ${inside}`);
  assert.ok(G.gripMult({ tread: 2, s: 0.5 * L }) > inside, "full wets beat slicks in the shower");
  // A car with no s (a probe) reads the lap mean.
  assert.ok(G.gripMult({ tread: 0 }) > inside && G.gripMult({ tread: 0 }) < 1);
  g.apex.step(1 / 60, 1);   // the arc tick publishes the sector picture on the arc
  assert.deepEqual([...G.weatherArc.where], [2], "the shower is in sector 2");
  assert.deepEqual([...G.weatherArc.sectors].map((o) => o.raining), [false, true, false]);
});

test("treadFor reads the LAP-WEIGHTED wetness — a narrow shower keeps slicks the call, a wide one wants inters", () => {
  const TM = g.sandbox.TyreModel;
  let { G, L } = shower(0.08, 300);
  const narrow = G.trackWetness();
  assert.ok(narrow < 0.25, `a 16 % shower: lap mean ${narrow}`);
  assert.equal(TM.treadFor(G.raceWeather, narrow), 0, "slicks for the lap");
  // No fitted set (wear off): gripMult picks the tread the LAP calls for, then reads the surface at s.
  assert.equal(G.gripMult({ tread: null, s: 0.5 * L }), G.gripMult({ tread: 0, s: 0.5 * L }));
  ({ G, L } = shower(0.2, 300));
  const wide = G.trackWetness();
  assert.ok(wide >= 0.25 && wide < 0.72, `a 40 % shower: lap mean ${wide}`);
  assert.equal(TM.treadFor(G.raceWeather, wide), 1, "inters for the lap…");
  assert.equal(G.gripMult({ tread: null, s: 0.05 * L }), G.gripMult({ tread: 1, s: 0.05 * L }), "…even on its dry part");
});

test("with no cell every position reads the one global wetness (the default is unchanged)", () => {
  const G = g.G, L = G.track.total;
  G.weather("dry");
  const a = G.startWeatherArc("dry", "rain", 60);
  a.t = 40;
  const w0 = G.gripMult({ tread: 0, s: 0.1 * L });
  for (const f of [0.3, 0.5, 0.9]) assert.equal(G.gripMult({ tread: 0, s: f * L }), w0);
  assert.equal(G.gripMult({ tread: 0 }), w0);
  g.apex.step(1 / 60, 1);
  assert.equal(G.weatherArc ? G.weatherArc.where : undefined, undefined, "no cell: no sector picture");
});
