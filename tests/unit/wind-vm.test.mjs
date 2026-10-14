/* wind-vm.test.mjs — WIND and AQUAPLANING in the real game (tools/lib/game-vm.cjs
 * runs the whole game on an inert DOM). A pinned 30 km/h headwind on Monza's main
 * straight costs the player top speed and a tailwind gives it back, by a few
 * km/h; still air is the "off" level to the bit (the characterization
 * baseline); an AI field in standing water on the wrong tread lifts at the
 * aquaplane speed (TyreModel.aquaplaneSafeV) and stays on the road.
 * The pure halves are tests/unit/wind.test.mjs and tests/unit/tyre-model.test.mjs.
 *
 * Run: node --test tests/unit/wind-vm.test.mjs   (npm run test:game-vm)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");

let g, W, T, Z;
before(async () => {
  g = await createGame({ track: "monza", storage: { wind: "real" } });
  W = vm.runInContext("Wind", g.ctx);
  T = vm.runInContext("TyreModel", g.ctx);
  await g.race("monza", "day", "dry");
  Z = g.apex.aeroZones().slice().sort((p, q) => q.len - p.len)[0];   // the main straight (Parabolica exit → Rettifilo)
});
after(() => { W && W.pin(null); g?.close(); });

/** Full throttle down the main straight from above top speed, DRIVING HELP on so it stays on the road;
 *  `wind` = null (level off) or { ms, rel } pinned relative to the car's heading at the start. */
async function straight(wind, secs = 6) {
  W.setLevel(wind ? "real" : "off");
  await g.race("monza", "day", "dry"); g.apex.go(); g.apex.headless(true);
  g.apex.setPhysics({ roadFollow: 0.7 });
  g.apex.jump(Z.startFrac, 70, 0);
  W.pin(wind ? { speed: wind.ms, dir: g.G.player.head + wind.rel } : null);
  const trace = [];
  for (let k = 0; k < secs * 4; k++) {
    g.apex.act({ throttle: true }, 1 / 60, 15);
    const c = g.G.player;
    trace.push([c.speed, c.s, c.x, c.head, c.vLat]);
  }
  W.pin(null); W.setLevel("real");
  return trace;
}
const kmh = (tr) => tr[tr.length - 1][0] * 3.6;

test("a 30 km/h headwind costs top speed and a tailwind gives it back — a few km/h each way", async (t) => {
  const still = await straight({ ms: 0, rel: 0 });
  const head = await straight({ ms: 30 / 3.6, rel: Math.PI });
  const tail = await straight({ ms: 30 / 3.6, rel: 0 });
  const dH = kmh(head) - kmh(still), dT = kmh(tail) - kmh(still);
  t.diagnostic(`still ${kmh(still).toFixed(2)} km/h; headwind ${dH.toFixed(2)}; tailwind +${dT.toFixed(2)}`);
  assert.ok(dH < -1 && dH > -8, `headwind ${dH.toFixed(2)} km/h (still ${kmh(still).toFixed(1)})`);
  assert.ok(dT > 1 && dT < 8, `tailwind +${dT.toFixed(2)} km/h`);
});

test("still air is the OFF level to the bit: wind 0 leaves the driving model untouched", async () => {
  const off = await straight(null);
  const zero = await straight({ ms: 0, rel: 0 });
  assert.deepEqual(zero, off);
});

test("a crosswind nudges the car sideways, within the cap", async () => {
  const still = await straight({ ms: 0, rel: 0 }, 2);
  const cross = await straight({ ms: 40 / 3.6, rel: -Math.PI / 2 }, 2);   // blowing toward the car's right
  const dv = cross.map((r, i) => r[4] - still[i][4]);
  assert.ok(dv.some((d) => d > 0), "the side force reaches the player's lateral velocity");
  assert.ok(Math.max(...dv.map(Math.abs)) < 1.5, `a nudge, not a shove: ${Math.max(...dv.map(Math.abs)).toFixed(3)} m/s`);
});

test("AI on inters in standing water lifts at the aquaplane speed and keeps it on the road", async (t) => {
  await g.race("monza", "day", "rain"); g.apex.go(); g.apex.headless(true);
  g.aiOnly();
  const cars = g.G.cars.filter((c) => !c.retired);
  const pace = g.apex.tuning().pace;
  let top = 0;
  for (let i = 0; i < 60 * 45; i++) {
    for (const c of cars) c.tread = 1;
    g.apex.step(1 / 60, 1);
    for (const c of cars) top = Math.max(top, c.speed / pace);   // vStd = v / PACE
  }
  const safe = T.aquaplaneSafeV(g.G.trackWetness(), 1);
  t.diagnostic(`fastest AI ${(top * 3.6).toFixed(1)} km/h std; lift speed ${(safe * 3.6).toFixed(1)}`);
  assert.ok(Number.isFinite(safe), "full rain is standing water");
  assert.ok(top <= safe + 1e-6, `fastest AI ${(top * 3.6).toFixed(1)} ≤ lift speed ${(safe * 3.6).toFixed(1)} km/h (std)`);
  assert.ok(top > safe - 15 / 3.6, "…and drives up to it rather than crawling");
  assert.equal(g.G.cars.filter((c) => c.retired).length, 1, "nobody but the benched player retires");
});
