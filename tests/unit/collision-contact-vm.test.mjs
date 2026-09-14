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

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT_C = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
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
  // Overlapped from the first frame (WCAR is 2.0 m). Until 2026-09-08 the pair
  // started at ±2.3 and the position P-loop's overshoot pressed them into the
  // player; the heading-state controller settles them at the ±2.8 m clean gap
  // (AiDrive.minLatGap) and never touches — measured, scratch/sandwich.mjs —
  // so the contact this test prices has to be given, not waited for.
  const [l, r] = A.rivals([{ dProg: 0.3, dx: -1.8, speed: 40 }, { dProg: -0.3, dx: 1.8, speed: 40 }]);
  const cl = g.G.cars[l], cr = g.G.cars[r], p = g.G.player;
  let minV = 40, contact = 0;
  for (let i = 0; i < 120; i++) {
    A.act({ steer: laneSteer(0), throttle: true, brake: false }, DT, 1);
    minV = Math.min(minV, p.speed);
    if (p.contactT > 0) contact++;
  }
  A.headless(false);
  // Anti-vacuity: the overlap really registered as contact.
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

/* ── the contact NORMAL is extent-scaled, not raw least penetration ────────
 *
 * Pure arithmetic — no boot. pairContact's classification is a function of
 * (dProg, dX) and the two extents, so the defect and the fix are both a table.
 *
 * Raw `penLat < penLong` is the minimum-translation rule. MTV is the right
 * answer to "which way do I push to separate with least movement" and the
 * WRONG answer to "which face did we hit" on a 4.8 x 2.0 box: it expands to
 * |dProg| < 2.8 + |dX|, so nose-to-tail at 2.5 m with zero lateral offset read
 * as a SIDE rub. Scaling each penetration by its own extent makes the test
 * |dX| > (WCAR/LCAR) * |dProg| — the contact bearing against the car's own
 * aspect ratio.
 */
const LCAR_T = 4.8, WCAR_T = 2.0;
const rawSide  = (dProg, dX) => (WCAR_T - Math.abs(dX)) < (LCAR_T - Math.abs(dProg));
const scaled   = (dProg, dX) => (WCAR_T - Math.abs(dX)) * LCAR_T < (LCAR_T - Math.abs(dProg)) * WCAR_T;

test("nose-to-tail is never a side contact, at any following distance", () => {
  for (const dProg of [0.5, 1.0, 2.0, 2.5, 3.0, 4.0, 4.7]) {
    assert.equal(scaled(dProg, 0), false,
      `dProg ${dProg} with zero lateral offset must be a REAR contact`);
  }
  // and the rule it replaced got most of those wrong
  assert.equal(rawSide(2.5, 0), true, "the old rule called 2.5 m directly behind a side rub");
  assert.equal(rawSide(1.0, 0), true, "and 1.0 m too");
});

test("genuine side-by-side still classifies as a side contact", () => {
  for (const [dProg, dX] of [[0, 0.5], [0.2, 0.1], [0.5, 1.8], [1.0, 1.5]]) {
    assert.equal(scaled(dProg, dX), true, `dProg ${dProg} dX ${dX} is alongside`);
  }
});

test("the boundary is the car's own aspect ratio", () => {
  const k = WCAR_T / LCAR_T;                 // 0.41666...
  for (const dProg of [1, 2, 3, 4]) {
    assert.equal(scaled(dProg, k * dProg + 0.01), true,  "just outside the ratio => side");
    assert.equal(scaled(dProg, k * dProg - 0.01), false, "just inside  the ratio => rear");
  }
});

test("sgn-of-zero is unreachable: a side contact always has a real dX to sign", () => {
  // `sgn = dX >= 0 ? 1 : -1` is only meaningful when dX is genuinely non-zero.
  // Under the scaled rule a side contact requires |dX| > k*|dProg| >= 0, and at
  // dProg = 0 it requires |dX| > 0 strictly, so dX == 0 can never enter it.
  assert.equal(scaled(0, 0), false);
  for (const dProg of [0, 0.5, 2.5]) assert.equal(scaled(dProg, 0), false);
});

test("the shipped rule is the scaled one", () => {
  const src = readFileSync(join(ROOT_C, "js/physics/collide.js"), "utf8");
  // The constants became per-PAIR extents when the extents went yaw-aware
  // (eLong/eLat), so the shipped form scales by those. Same rule, same
  // cross-multiplication — and for an unyawed pair eLong/eLat ARE LCAR/WCAR.
  assert.match(src, /_ct\.sideContact = \(penLat \* eLong < penLong \* eLat\)/);
  assert.doesNotMatch(src, /_ct\.sideContact = penLat < penLong/,
    "raw least-penetration misclassifies nose-to-tail on a 2.4:1 box");
});

/* ── YAW-AWARE EXTENTS: the spun-car hole ─────────────────────────────────
 *
 * (prog, x) is a plane, and every car used to be axis-aligned in it — heading
 * relative to the tangent never entered the contact test. A car crossways is
 * 4.8 m across the road while the pair got 2.0 m of lateral reach, so a rival
 * passing at |dX| between 2.0 and 3.4 m drove through drawn bodywork.
 *
 * Pure arithmetic again: the extents are a function of psi alone, so the hole
 * and its closure are both a table. The functions here mirror collide.js; the
 * live-source assertions below stop them drifting apart.
 */
const HL_T = 2.4, WL_T = 1.0;
const LO_T = 20 * Math.PI / 180, HI_T = 60 * Math.PI / 180;
const mix = (psi) => {
  const a = Math.abs(psi);
  if (!(a > LO_T)) return 0;
  if (a >= HI_T) return 1;
  const t = (a - LO_T) / (HI_T - LO_T);
  return t * t * (3 - 2 * t);
};
const eLongT = (p) => { const k = mix(p); return k === 0 ? HL_T : HL_T * (1 - k) + k * (HL_T * Math.abs(Math.cos(p)) + WL_T * Math.abs(Math.sin(p))); };
const eLatT  = (p) => { const k = mix(p); return k === 0 ? WL_T : WL_T * (1 - k) + k * (HL_T * Math.abs(Math.sin(p)) + WL_T * Math.abs(Math.cos(p))); };
const deg = (d) => d * Math.PI / 180;

test("an unyawed car measures exactly the old constants — the field is untouched", () => {
  // The whole safety argument: only a car past the blend floor changes at all,
  // so an ordinary race is bit-identical to before this existed.
  assert.equal(eLongT(0), HL_T);
  assert.equal(eLatT(0), WL_T);
  for (const d of [1, 5, 10, 15, 19.9]) {
    assert.equal(eLongT(deg(d)), HL_T, `psi ${d} deg is under the blend floor`);
    assert.equal(eLatT(deg(d)), WL_T, `psi ${d} deg is under the blend floor`);
  }
  // ...and cornering slip never reaches it. AI cars are pinned to psi = 0 by
  // the c.human gate in collide.js anyway (they have no real heading), which
  // the source assertion below pins.
});

test("a spun car is finally as wide as it is drawn", () => {
  // The hole, as metres of lateral reach the PAIR gets against a normal rival.
  const pairLat = (psi) => eLatT(psi) + WL_T;
  assert.equal(+pairLat(0).toFixed(2), 2.00);
  // TWO DIFFERENT NUMBERS, and conflating them is easy: the GEOMETRIC truth of
  // how wide the car is, and what the blend actually ships. The blend closes
  // the hole progressively so ordinary cornering is untouched, so at low yaw it
  // is a deliberate PARTIAL closure — the cost of the 20 deg floor.
  //
  //   psi     true reach   shipped   hole closed
  //    20°       2.76 m     2.00 m       0 %     (the floor: nothing yet)
  //    30°       3.07 m     2.17 m      16 %
  //    45°       3.40 m     2.96 m      68 %
  //    60°       3.58 m     3.58 m     100 %
  //    90°       3.40 m     3.40 m     100 %
  //
  // Full strength covers 60-90 deg, which is where the miss peaks — a car that
  // is properly sideways can no longer be driven through at all.
  const shipped = { 30: 2.17, 45: 2.96, 60: 3.58, 75: 3.58, 90: 3.40 };
  for (const d of Object.keys(shipped)) {
    assert.equal(+pairLat(deg(+d)).toFixed(2), shipped[d], `psi ${d} deg`);
    assert.ok(pairLat(deg(+d)) > 2.0, `psi ${d} deg must reach past the old 2.0 m`);
  }
  // At and past 60 deg the blend is done, so the shipped reach IS the geometry.
  for (const d of [60, 75, 90]) {
    const truth = HL_T * Math.abs(Math.sin(deg(d))) + WL_T * Math.abs(Math.cos(deg(d))) + WL_T;
    assert.ok(Math.abs(pairLat(deg(d)) - truth) < 1e-9, `psi ${d} deg must be the full geometry`);
  }
  // A rival at 2.8 m alongside a car spun 90 deg: through the bodywork before,
  // a contact now. This is the case the entry asked for.
  const GAP = 2.8;
  assert.ok(GAP > 2.0, "2.8 m is outside the OLD 2.0 m pair reach — no contact was reported");
  assert.ok(GAP < pairLat(deg(90)), "and inside the new reach, so it is a contact now");
});

test("the peak miss is the three-quarters-on car, not the sideways one", () => {
  // The entry framed this as the sideways car and proposed blending to full by
  // 45 deg. Measured, the miss peaks at 60-75 deg, so the blend runs to 60.
  const miss = (d) => eLatT(deg(d)) + WL_T - 2.0;
  assert.ok(miss(60) > miss(90), "60 deg misses more than 90 deg");
  assert.ok(miss(75) > miss(90), "75 deg misses more than 90 deg");
  // ...and at 90 deg the LONGITUDINAL extent has shrunk below the old constant,
  // so this removes contacts there as well as adding them laterally. That shows
  // up in the characterization gate and is not a regression.
  assert.ok(eLongT(deg(90)) + HL_T < 4.8, "a sideways car is SHORTER along the track");
});

test("the broadphase can still see every pair the extents now reach", () => {
  // THE COMPANION EDIT, and the reason it is not optional. The bucket walk only
  // compares a bucket with itself and the next one, so it is correct exactly
  // while the bucket is at least as wide as the widest contacting pair. Widen
  // the extents without widening the bucket and the broadphase silently drops
  // the very pairs the change was made to catch.
  // One car can reach sqrt(2.4^2 + 1^2) = 2.6 (at 22.6 deg off the tangent);
  // the other is at most 2.4. Sample densely to show nothing EXCEEDS that — the
  // sampled peak lands just under it, which is the grid, not a looser bound.
  const analytic = Math.hypot(HL_T, WL_T);
  let worst = 0;
  for (let d = 0; d <= 180; d += 0.05) worst = Math.max(worst, eLongT(deg(d)));
  assert.ok(worst <= analytic + 1e-12, `sampled ${worst} exceeds the analytic bound ${analytic}`);
  assert.ok(worst > analytic - 1e-3, `sampled peak ${worst} is far below ${analytic} — wrong shape`);
  const widestPair = analytic + HL_T;
  assert.equal(+widestPair.toFixed(4), 5.0);

  const src = readFileSync(join(ROOT_C, "js/physics/collide.js"), "utf8");
  const m = src.match(/const LCAR_MAX = ([\d.]+);/);
  assert.ok(m, "LCAR_MAX must exist");
  assert.ok(+m[1] >= widestPair, `LCAR_MAX ${m[1]} is under the widest pair ${widestPair}`);
  assert.match(src, /const COL_BUCKET_M = LCAR_MAX;/,
    "the bucket must be the widened span, not LCAR");
  assert.match(src, /if \(adProg > LCAR_MAX && adProg < L - LCAR_MAX\) return null;/,
    "the cheap reject must use the widened span too");
});

test("only a car with a REAL heading is ever yawed", () => {
  // AI cars are kinematic: game.js writes head = atan2(tangent) for them and
  // their yawVis is a cosmetic lean of up to ~36 deg. Widening a car because it
  // LOOKS tilted would be the renderer entering the physics, and a genuine spin
  // is Rapier-owned and skipped by pairContact's callers entirely.
  const src = readFileSync(join(ROOT_C, "js/physics/collide.js"), "utf8");
  const hits = src.match(/const psi = c\.human \? \(c\.yawVis \|\| 0\) : 0;/g) || [];
  assert.equal(hits.length, 2, "both extent functions must gate psi on c.human");
});
