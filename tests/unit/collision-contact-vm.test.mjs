/* collision-contact-vm.test.mjs — what a car-to-car contact COSTS the player,
 * in the Node VM harness (tools/lib/game-vm.cjs). New behavioural gate; not a
 * twin of any browser spec.
 *
 * THE DEFECTS, measured on monza's start straight before the fixes
 * (scratch/collision-bench.mjs):
 *   - boxed between two AI cars at 40 m/s the player lost 18 m/s in ONE second
 *     with zero slip and zero lateral velocity: the resolver's side-rub scrub
 *     (0.995 a frame) ran on every one of the four relaxation passes — 2 % a
 *     frame, 48 m/s^2 — and the player was the car "behind" because the level
 *     band was ±0.5 m on a 4.8 m car, so an AI a bumper ahead made the player
 *     the yielder;
 *   - leaning on an AI for under a second cost 15 m/s for the same reason;
 *   - a rear-end impulse of 0.5 * relV / (invA + invB) is (1 + e) = 0.5, so the
 *     pair was STILL closing at half speed after it and penetration ate the
 *     rest over ~30 frames — a bump read as being pushed along.
 *
 * Fixes: the rub is a small absolute deceleration (AiDrive.rubDecel) taken once
 * a frame; "behind" is less than half a car alongside (AiDrive.sideYieldsA,
 * the FIA's "significant portion alongside"); the yielding AI keeps its full
 * steering authority when steering AWAY from the contact and targets the
 * LATERALLY nearest car; the impulse is (1 + e) * relV / (invA + invB) with a
 * real restitution (AiDrive.bumpRestitution) and a pace-scaled cap on the
 * player's forward punt (AiDrive.humanPuntCap).
 *
 * Run: node --test tests/unit/collision-contact-vm.test.mjs   (~20 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ track: "monza" }); });
after(() => { if (g) g.close(); });

const DT = 1 / 60;
// The start straight: frac 0 at the line, 600 m of straight road ahead.
async function straight(speed, x) {
  const A = g.apex;
  await g.race("monza");
  A.reset(0, speed, x);
  A.headless(true);
  A.go();
}
// Lane-keeper steer toward xT (the straight is straight; this is not a racing line).
function laneSteer(xT) {
  const p = g.apex.probe(); if (!p) return 0;
  const L = Math.max(8, Math.min(38, p.speed * 0.6));
  return Math.max(-1, Math.min(1, 2.2 * (Math.atan2(xT - p.x, L) - p.angle)));
}

test("boxed between two AI cars, the player keeps their speed", async () => {
  const A = g.apex;
  await straight(40, 0);
  const [l, r] = A.rivals([{ dProg: 0.3, dx: -2.3, speed: 40 }, { dProg: -0.3, dx: 2.3, speed: 40 }]);
  const cl = g.G.cars[l], cr = g.G.cars[r], p = g.G.player;
  let minV = 40, contact = 0;
  for (let i = 0; i < 120; i++) {
    A.act({ steer: laneSteer(0), throttle: true, brake: false }, DT, 1);
    minV = Math.min(minV, p.speed);
    if (p.contactT > 0) contact++;
  }
  A.headless(false);
  // Anti-vacuity: the AIs really came in and touched (their lines pull to the centre).
  assert.ok(contact > 0, "the sandwich never made contact — wrong scenario");
  // Measured before: 21.7 m/s at t=1 (a loss of 18). After: no loss at all.
  assert.ok(minV >= 38.5, `boxed player lost ${(40 - minV).toFixed(1)} m/s`);
  // Both AIs are still running — the rub is not a wall for them either.
  assert.ok(cl.speed > 38 && cr.speed > 38, `an AI stalled in the sandwich: ${cl.speed.toFixed(1)} / ${cr.speed.toFixed(1)}`);
});

test("leaning on an AI wheel to wheel is a rub, not a brake", async () => {
  const A = g.apex;
  await straight(45, -1.2);
  const r = A.rivals([{ dProg: 0, dx: 2.6, speed: 45 }])[0];
  const c = g.G.cars[r], p = g.G.player;
  let leaned = false, holdX = null, minV = 45, contact = 0;
  for (let i = 0; i < 180; i++) {
    if (p.contactT > 0) leaned = true;
    // Lean right into the AI until we touch, then hold the lane we are in.
    const steer = (!leaned && i < 60) ? laneSteer(-1.2) + 0.35 : laneSteer(holdX ?? (holdX = p.x));
    A.act({ steer, throttle: true, brake: false }, DT, 1);
    minV = Math.min(minV, p.speed);
    if (p.contactT > 0) contact++;
  }
  A.headless(false);
  assert.ok(contact > 0, "the lean never touched the AI — wrong scenario");
  // Measured before: 30.1 m/s (a loss of 14.9). After: none.
  assert.ok(minV >= 43, `a wheel-to-wheel lean cost ${(45 - minV).toFixed(1)} m/s`);
  assert.ok(c.speed > 40, `the AI was scrubbed to ${c.speed.toFixed(1)} m/s by a rub`);
});

test("a rear-end is a bump: the closing speed is gone after one frame of contact", async () => {
  const A = g.apex;
  await straight(50, 0);
  const r = A.rivals([{ dProg: 12, dx: 0, speed: 40 }])[0];
  const c = g.G.cars[r], p = g.G.player;
  c.tierV = 0.6;   // a slow car so it is the player who arrives
  let pre = null, post = null;
  for (let i = 0; i < 120 && post == null; i++) {
    const relBefore = p.speed - c.speed;
    A.act({ steer: laneSteer(0), throttle: true, brake: false }, DT, 1);
    // The bump is the frame the closing speed collapses (the contact flag is
    // gated on a real penetration and a pair at the slop distance has none).
    const relAfter = p.speed - c.speed;
    if (relBefore > 5 && relAfter < 0.6 * relBefore) { pre = relBefore; post = relAfter; }
  }
  A.headless(false);
  assert.ok(pre != null && pre > 5, `never arrived on the car ahead (closing ${pre})`);
  // Measured before: 55 % of the closing speed survived each pass. After: the
  // impulse takes all of it and a tenth back — the pair separates.
  assert.ok(post <= 0.15 * pre, `still closing at ${post.toFixed(2)} of ${pre.toFixed(2)} m/s after the bump`);
  // And the car ahead was punted, not stopped: it gained, the player lost.
  assert.ok(c.speed > 40.5, `the car ahead did not move on the bump: ${c.speed.toFixed(1)}`);
  assert.ok(p.speed < 50, "the player kept every m/s through a bump");
});
