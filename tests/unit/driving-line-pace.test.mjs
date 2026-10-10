/* driving-line-pace.test.mjs — the DRIVING LINE / brake cue profile is built
 * with what the car actually pulls (hunt 3, R3-RACE-INTEGRITY-2).
 *
 * game.js's drivingLineApi() handed DrivingLine.build() the bare pace-5
 * PhysicsConsts.ACCEL — the mismatch aTop() fixed in quali-model — so at the
 * top PACE notch the forward sweep under-rated a 9.4 m/s² car at 7 m/s² and
 * the cue read "brake" on ~8 % more of a lap driven at AI pace
 * (scratch/hunt3-race-integrity/line-cue-pace.cjs: 37.1 % vs 29.0 % at 1.34).
 * The api is closure-local, so this reads it where render() hands it over.
 *
 * Run: node --test tests/unit/driving-line-pace.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

test("the driving-line api carries aTop(), not the bare ACCEL, at PACE 1.34", async () => {
  const seen = [];
  const g = await createGame({ carMeshes: false, onSandbox: (S) => {
    let real;
    Object.defineProperty(S, "DrivingLine", { configurable: true, get: () => real, set: (v) => {
      real = Object.assign({}, v, { draw: (gfx, api, sp) => { seen.push({ accel: api.accel, vTop: api.vTop }); return v.draw(gfx, api, sp); } });
    } });
  } });
  try {
    const a = g.apex, G = g.G, ACCEL = vm.runInContext("PhysicsConsts.ACCEL", g.ctx);
    a.setPhysics({ pace: 1.34 });
    await g.race("monza");
    a.setPhysics({ pace: 1.34 });
    assert.equal(G.PACE, 1.34);
    g.step(5);
    for (let i = 0; i < 3; i++) g.pumpFrame();
    assert.ok(seen.length > 0, "render() drew the driving line");
    const last = seen[seen.length - 1];
    assert.ok(Math.abs(G.aTop() - ACCEL * 1.34) < 1e-9, "aTop() is the pace-scaled ACCEL");
    assert.equal(last.vTop, G.vTop());
    assert.notEqual(last.accel, ACCEL, "the bare pace-5 constant under-rates the car at this PACE");
    assert.equal(last.accel, G.aTop(), `api.accel ${last.accel} is aTop() ${G.aTop()}, not the bare ${ACCEL}`);
  } finally { g.close(); }
});
