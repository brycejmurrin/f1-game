/* pit-lane-vm.test.mjs — the pit COMMITMENT against the built complex, in the
 * Node VM (tools/lib/game-vm.cjs), on Bahrain (pit side -1, 14 m road).
 *
 * The bug this pins: the commitment line stayed on the old PAINTED lane edge,
 * 3.2 m inside the road on the pit side, after the complex gave the lane a real
 * entry road. A car holding the pit-side third of the pit straight for half a
 * second armed the limiter on the racing line — from the grid, in traffic, on
 * every circuit (the HUD read KEEP LEFT/RIGHT six seconds into a race). The
 * commitment is now the lane's own tarmac: the car's centre past the lane's
 * inner edge (js/race/pit-lane.js `committing`, COMMIT_IN).
 *
 * Run: node --test tests/unit/pit-lane-vm.test.mjs   (~10 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const ID = "bahrain";
let g = null;
before(async () => { g = await createGame({ track: ID }); });
after(() => { if (g) g.close(); });

async function fresh() {
  await g.race(ID, "day", "dry", { laps: 3 });
  const a = g.apex;
  a.tyres({ level: "real" });
  a.go();
  a.setPhysics({ pace: 1, drift: 0 });   // drift 0: steer 0 holds the lateral
  return a;
}
// Throttle, HOLDING a lateral: the road bends away from a fixed heading (a
// steer-0 car left Bahrain's grid onto the pit lane in five seconds, and the
// window's entry stretch there is the exit of T15), so the car is re-aimed
// along the track every tick and steered proportionally back to `x`.
function drive(a, seconds, x) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    const ps = a.physState();
    a.aim(0);
    a.setInput({ steer: Math.max(-1, Math.min(1, (x - ps.x) * 0.5)), throttle: true });
    a.step(1 / 60, 1);
  }
  a.clearInput();
}

test("a car on the racing surface never commits — not from the grid, not on the pit-side third of the road", async () => {
  const a = await fresh();
  // From the grid: five seconds of throttle, holding the slot's own lateral.
  const x0 = a.physState().x;
  drive(a, 5, x0);
  let p = a.pit();
  assert.ok(Math.abs(a.physState().x) < 6, `stayed on the road (${x0.toFixed(2)} → ${a.physState().x.toFixed(2)})`);
  assert.equal(p.armed, false, `armed from the grid (x ${a.physState().x.toFixed(2)})`);
  assert.equal(p.state, "none");
  // On the pit-side third of the road inside the window: the old painted
  // line was at hw - 3.2 = 3.8 m; a car at 5 m off centre on the pit side
  // (2 m from the edge of a 7 m half-road) sat past it.
  const s = a.pit().side;
  a.jump(0.985, 40, 5.0 * s); a.aim(0);
  drive(a, 1.5, 5.0 * s);
  p = a.pit();
  const ps = a.physState();
  assert.ok(Math.abs(ps.x) < 7, `the car stayed on the road (x ${ps.x.toFixed(2)})`);
  assert.equal(p.inWindow, true, "…inside the window");
  assert.equal(p.armed, false, `armed on the racing surface at x ${ps.x.toFixed(2)}`);
  assert.equal(p.state, "none");
  assert.equal(p.commit, 0, "not even counting");
});

test("a car on the lane's own tarmac commits, and the limiter comes on", async () => {
  const a = await fresh();
  a.jump(0.985, 40, 0);
  const drv = a.pit().driveX;            // the fast lane's centre here
  assert.ok(drv != null && Math.abs(drv) > 7, `the lane is beside the road (driveX ${drv})`);
  a.jump(0.985, 40, drv); a.aim(0);
  drive(a, 1.5, drv);
  const p = a.pit();
  assert.equal(p.armed, true, "on the entry road, held: committed");
  assert.equal(p.state, "lane");
  assert.equal(p.inLaneLat, true);
});
