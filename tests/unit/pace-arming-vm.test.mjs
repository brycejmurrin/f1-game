/* pace-arming-vm.test.mjs — OVERTAKE and X-mode arm on the STANDARD speed scale.
 *
 * PACE is a ground-speed scale (AGENTS.md §Physics): the OVERALL SPEED slider
 * multiplies the car's real m/s. OT_MIN_SPEED (15) and X_MIN_SPEED (25) are
 * vStd() thresholds, so the question "is this car fast enough to arm?" must have
 * the SAME answer at every pace for the same vStd(speed). The A13 bug armed
 * overtake at 42 % of top speed at pace 0.5 and 16 % at pace 1.3 because the
 * gate read a bare `c.speed > 15`.
 *
 * tools/check/vstd-lint.mjs finds that shape statically (now including the
 * UPPER_SNAKE form `c.speed > OT_MIN_SPEED`); this drives the REAL js/game.js in
 * the Node VM and asserts the behaviour: at paces 0.5 / 1 / 1.3, a car whose
 * vStd(speed) sits just BELOW the threshold is not armed and one just ABOVE is,
 * with the real m/s differing by the pace ratio.
 *
 * Run: node --test tests/unit/pace-arming-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const PACES = [0.5, 1, 1.3];
let g = null, PHYS0 = null, OT_MIN_SPEED = 0, X_MIN_SPEED = 0, VMAX = 0;
before(async () => {
  g = await createGame({ storage: { trackId: "monza" } });
  PHYS0 = { ...g.apex.tuning() };
  ({ OT_MIN_SPEED, X_MIN_SPEED, VMAX } = g.sandbox.PhysicsConsts);   // the game's own constants
});
after(() => { if (g) g.close(); });

async function load() {
  g.apex.setPhysics(PHYS0);
  g.apex.headless(false);
  await g.race("monza");
  g.apex.headless(true);
  g.apex.go();
  g.apex.jump(0.1, 60, 0);
}

// The middle of the longest activation zone (xArmed needs inAeroZone).
function straightFrac() {
  const zones = g.apex.aeroZones();
  assert.ok(zones.length, "monza has activation zones");
  const z = zones.slice().sort((a, b) => b.len - a.len).find((q) => q.endFrac > q.startFrac);
  return z.midFrac;
}

// Put the player at `vs` on the STANDARD scale (real m/s = vs * vTop / VMAX), tick once, read.
function tickAt(vs, pace, read) {
  const A = g.apex, p = g.G.player;
  A.setPhysics({ pace });
  const real = vs * (VMAX * pace) / VMAX;
  A.clearInput();
  p.speed = real;
  A.step(1 / 60, 1);
  return read(p, real);
}

test("the consts under test are the vStd thresholds this file assumes", () => {
  assert.equal(OT_MIN_SPEED, 15);
  assert.equal(X_MIN_SPEED, 25);
});

test("overtake arms at the same vStd at every pace — not at the same real m/s", async () => {
  await load();
  const p = g.G.player, L = g.G.track.total;
  for (const pace of PACES) {
    for (const [vs, want] of [[OT_MIN_SPEED - 1.5, false], [OT_MIN_SPEED + 1.5, true]]) {
      // The race-wide gate open (leader past lap 1) and an allowance in hand; no deploy running.
      g.apex.jump(0.1, 60, 0);
      p.lap = 3; p.prog = 3 * L + p.s; p.otE = 0.125; p.otOn = false; p.otT = 0;
      const armed = tickAt(vs, pace, (c) => c.otArmed);
      assert.ok(g.G.otEnabled(), "premise: the race-wide overtake gate is open");
      assert.equal(armed, want, `pace ${pace}: vStd ${vs} (${(vs * pace).toFixed(1)} m/s) otArmed`);
    }
  }
});

test("X-mode arms at the same vStd at every pace — not at the same real m/s", async () => {
  await load();
  const f = straightFrac();
  for (const pace of PACES) {
    for (const [vs, want] of [[X_MIN_SPEED - 1.5, false], [X_MIN_SPEED + 1.5, true]]) {
      g.apex.jump(f, 60, 0);
      const armed = tickAt(vs, pace, (c) => c.xArmed);
      assert.equal(armed, want, `pace ${pace}: vStd ${vs} (${(vs * pace).toFixed(1)} m/s) xArmed`);
    }
  }
});
