/* offtrack-edges-vm.test.mjs — off-track behaviour beyond offtrack.spec.js's
 * eight tests, in the Node VM (tools/lib/game-vm.cjs). Its own file because
 * offtrack-vm.test.mjs is that spec's test-for-test TWIN (twinned-specs.test.mjs
 * pins the count): a regression test with no browser twin lives here instead.
 *
 * Run: node --test tests/unit/offtrack-edges-vm.test.mjs   (one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null, PHYS0 = null;
before(async () => { g = await createGame({ track: "monza" }); PHYS0 = { ...g.apex.tuning() }; });
after(() => { if (g) g.close(); });

async function loadTrack() {
  g.apex.setPhysics(PHYS0); g.apex.headless(false);
  await g.race("monza", "day", "dry");
  g.apex.setPhysics({ pace: 1 });
}

// GANTRY LEGS ARE SOLID FROM BOTH SIDES, AND WALL OFF NOTHING BEHIND THEM.
// Monza's start gantry stands its left leg at hw + 1.5 (a truss, 0.66 m half
// width). Cars drove straight through it; a blockAt() fix walled off the grass
// behind it and was reverted (e39c2c2e5: the -16 car above was snapped onto the
// tarmac). The leg is a POST now (Tracks.postLimits): a car on the road side
// stops at its face, a car on the run-off stays out there.
test("a gantry leg stops a car from the road side, 1.1 m short of its face", async () => {
  await loadTrack();
  const a = g.apex;
  a.jump(0.0, 0, -9.0);          // overlapping the left leg (|x| 9.0 < its 9.5 line)
  a.setInput({ steer: 0, throttle: false });
  a.step(1 / 60, 1);
  a.clearInput();
  const x = a.physState().x;
  assert.ok(x >= -7.74 - 0.02, `pushed back to the leg's road-side face (x ${x.toFixed(2)} >= -7.74)`);
});

test("the grass behind a gantry leg is not walled off, and a car there stays outside it", async () => {
  await loadTrack();
  const a = g.apex;
  a.jump(0.0, 0, -12);           // on the run-off, beyond the leg
  for (let i = 0; i < 5; i++) { a.setInput({ steer: 0, throttle: false }); a.step(1 / 60, 1); }
  a.clearInput();
  const far = a.physState().x;
  assert.ok(far < -11.9, `left where it was, not snapped inside the leg (x ${far.toFixed(2)})`);
  a.jump(0.0, 0, -10.2);         // just outside the leg's line, closer than a car fits
  a.setInput({ steer: 0, throttle: false });
  a.step(1 / 60, 1);
  a.clearInput();
  const near = a.physState().x;
  assert.ok(near <= -11.26 + 0.02, `kept beyond the leg's outer face (x ${near.toFixed(2)} <= -11.26)`);
});
