/* driving-feel-vm.test.mjs — the player's slipstream and every car's throttle-
 * lift after-fire, driven on the REAL js/game.js in the Node VM
 * (tools/lib/game-vm.cjs). These replace the source pins of
 * gfx-backend-canary's "driving feel" group (#1682 step 3): each assertion
 * reads what updateCar DID (physState / the car objects), so a refactor that
 * keeps the behaviour keeps them green and one that breaks it turns them red.
 *
 * Mutation evidence (hand-applied to js/game.js, each turns the named test red):
 *   - `c.wake = wakeOf(tg, …)` → `c.wake = tg < 30 ? 1 : 0`        → "same window and fade"
 *   - drop `* c.towing` from the human vmax line                    → "and the AI's gain"
 *   - drop `!braking &&` from the human tow gate                    → "driver state"
 *   - `const thr = c.human ? onThrottle : !braking` → `… : true`    → "every car pops on lift"
 *   - `steerVis < 0.12` dropped from the tow gate                   → "driver state"
 *   - `if (c.isPlayer) carDraw.drawExhaustFx(…)` in game.js, or
 *     `flameOk && c.isPlayer` in car-draw.js                         → "rivals too"
 * The arc contract on the human tow block ("never Tracks.curvature / kMax") is
 * the curvature-channels gate's job (docs/PHYSICS.md §Curvature channels): a
 * new curvature read there is an unclassified site, and the AI's `kMax` is
 * block-scoped to the AI branch.
 *
 * Run: node --test tests/unit/driving-feel-vm.test.mjs   (~15 s)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null, A = null, G = null, L = 0, zone = null, ai = null, others = [];
before(async () => {
  g = await createGame({ track: "monza" });
  A = g.apex; G = g.G; L = G.track.total;
  A.headless(true); A.go();
  zone = A.aeroZones().slice().sort((a, b) => b.len - a.len)[0];   // the longest straight
  const cars = A.cars();
  ai = cars.find((c) => !c.p).id;
  others = cars.filter((c) => !c.p && c.id !== ai).map((c) => c.id);
});
after(() => { if (g) g.close(); });

const frac = (m) => ((zone.midFrac + m / L) % 1 + 1) % 1;
/** The player at mid-straight at 70 m/s; `ai` placed `gap` m ahead (negative: behind) at `dx` m lateral; the rest half a lap away. */
function place(gap, dx = 0) {
  A.clearInput();
  A.reset(zone.midFrac, 70, 0);
  for (const id of others) A.aiPlace(id, frac(L / 2), 0, 0);
  A.aiPlace(ai, gap == null ? frac(L / 2) : frac(gap), 70, dx);
}
function playerFrame(gap, dx, input = { throttle: true }) {
  place(gap, dx);
  A.setInput(input);
  A.step(1 / 60, 1);
  const ps = A.physState();
  A.clearInput();
  return ps;
}

test("the player's tow uses the AI's window and fade: same wake for the same gap and offset", () => {
  for (const [gap, dx] of [[10, 0], [20, 0], [20, 2], [30, 0]]) {
    const ps = playerFrame(gap, dx);
    place(-gap, -dx);                       // the same geometry with the roles swapped: the AI tows on the player
    A.step(1 / 60, 1);
    const aiWake = G.cars[ai].wake;
    assert.ok(ps.wake > 0, `a car ${gap} m ahead at ${dx} m puts the player in its wake (${ps.wake})`);
    assert.ok(Math.abs(ps.wake - aiWake) < 2e-3, `gap ${gap} dx ${dx}: player wake ${ps.wake} = AI wake ${aiWake}`);
  }
  const near = playerFrame(10, 0).wake, far = playerFrame(30, 0).wake, wide = playerFrame(20, 2).wake, mid = playerFrame(20, 0).wake;
  assert.ok(near > mid && mid > far, `the wake fades with the gap (${near} > ${mid} > ${far})`);
  assert.ok(wide < mid, `and with the lateral offset (${wide} < ${mid})`);
  assert.equal(playerFrame(null).wake, 0, "clear air: no wake");
  assert.equal(playerFrame(60, 0).wake, 0, "a car beyond the tow window gives none");
});

test("the player's tow buys the AI's gain: vmax × (1 + towGain(street) · towing)", () => {
  const clear = playerFrame(null);
  assert.equal(clear.towing, 0);
  const gain = g.ctx.AiDrive.towGain(!!G.track.street);
  assert.ok(gain > 0, "Monza has a slipstream gain");
  for (const gap of [10, 20]) {
    const tow = playerFrame(gap, 0);
    assert.ok(tow.towing > 0, `towing ${gap} m back`);
    assert.ok(Math.abs(tow.vmaxNow / clear.vmaxNow - (1 + gain * tow.towing)) < 1e-3,
      `gap ${gap}: vmax ${tow.vmaxNow} / ${clear.vmaxNow} = 1 + ${gain} × ${tow.towing}`);
  }
});

test("the player's tow gate is driver state: braking or a turned wheel keeps the wake but drops the tow", () => {
  const brake = playerFrame(15, 0, { brake: true });
  assert.ok(brake.wake > 0, "braking in the wake: the wake (grip penalty) is still recorded");
  assert.equal(brake.towing, 0, "but no tow on the brakes");
  place(15, 0);
  A.setInput({ throttle: true, steer: 1 });
  A.step(1 / 60, 20);                      // steerVis follows the wheel past the 0.12 gate
  const steer = A.physState();
  A.clearInput();
  assert.ok(Math.abs(G.player.steerVis) > 0.12, "precondition: the wheel is turned");
  assert.equal(steer.towing, 0, "a turned wheel drops the tow");
});

test("every car pops on lift: the player on a throttle lift, the AI as it starts braking", async () => {
  place(null);
  A.setInput({ throttle: true });
  A.step(1 / 60, 5);
  assert.equal(G.player.exhaustPop, 0, "on throttle: no after-fire");
  A.setInput({});
  A.step(1 / 60, 1);
  assert.equal(G.player.exhaustPop, 1, "the lift fires it");
  A.step(1 / 60, 10);
  assert.ok(G.player.exhaustPop < 0.2, `and it decays in ~0.2 s (${G.player.exhaustPop})`);
  A.clearInput();

  // A fresh race: the AI drive themselves into the first braking zones.
  await g.race("monza");
  A.headless(true); A.go();
  const popped = new Set();
  for (let i = 0; i < 60 * 40 && !popped.size; i++) {
    A.step(1 / 60, 1);
    for (const c of G.cars) if (!c.human && c.exhaustPop === 1) {
      assert.ok(c.brakeDemand > 0, `${c.team && c.team.id}: an AI pops on the frame it brakes`);
      popped.add(c);
    }
  }
  assert.ok(popped.size > 0, "an AI car lifts into a braking zone and spits within 40 s");
});

test("every drawn car's after-fire draws its flame — rivals too, not only the player", async () => {
  await g.race("monza");
  A.headless(false);
  try {
    g.ctx.GLX.makeFrustumPlanes = () => Array.from({ length: 6 }, () => [0, 0, 0, 1]);   // the stub's [] culls nothing out, but render wants six planes
    g.step(60);                                     // the grid: the player and the nearest rivals within FieldLod's 60 m
    // The flame's opts bag (car-draw _flameOpts): emissive, rough, alpha below 1 (0.30 + 0.55·fl)·pop.
    const isFlame = (o) => !!o && o.emissive === 1 && o.roughness === 1 && o.specular === 0 && o.noAlphaWrite && o.alpha < 1 && !("doubleSided" in o);
    const flamesPerFrame = (pop) => {
      let n = 0;
      const gfx = G.gfx, draw = gfx.draw;
      gfx.draw = function (mesh, m, o) { if (isFlame(o)) n++; return draw.apply(this, arguments); };
      try {
        for (const c of G.cars) { c.exhaustPop = pop; c.wasOnThrottle = false; }
        g.pumpFrame(g.sandbox.performance.now() + 16.7);
      } finally { gfx.draw = draw; }
      return n;
    };
    assert.equal(flamesPerFrame(0), 0, "no after-fire: no flame");
    const lit = flamesPerFrame(1);
    assert.ok(lit >= 2, `the player and at least one rival flame on the same frame (${lit})`);
  } finally { A.headless(true); }
});
