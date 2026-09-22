import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const ctx = vm.createContext({});
for (const file of ['core/mat4', 'physics/ai-drive', 'physics/ai-corridor'])
  vm.runInContext(readFileSync(new URL('../../js/'+file+'.js', import.meta.url),'utf8'), ctx);
const A = vm.runInContext('AiCorridor',ctx);
function scenario(extra = [], overrides = {}) {
  const car = { prog: 100, x: 0, speed: 40 }, blocker = { prog: 115, x: 0, speed: 37 };
  const context = { roomL: 6, roomR: 6, roadL: 6, roadR: 6, kAhead: .01, lane: 0, ...overrides };
  const cars = [car, blocker, ...extra]; const before = JSON.stringify(cars);
  const result = A.choose(context, car, blocker, cars, 1000, 2.8);
  assert.equal(JSON.stringify(cars), before, 'planner must not mutate any car');
  return result;
}
test('open inside lane wins, but occupied inside selects outside', () => {
  assert.equal(scenario().side, -1);
  const p = scenario([{ prog: 100, x: -2.8, speed: 40 }]);
  assert.equal(p.side, 1); assert.match(p.left.reason, /traffic/);
});
test('fast traffic arriving from behind blocks a lane before end-point overlap', () => {
  const p = scenario([{ prog: 80, x: -2.8, speed: 60 }]);
  assert.equal(p.side, 1);
});
test('both occupied sides or insufficient road width force following', () => {
  assert.equal(scenario([{ prog: 100, x: -2.8, speed: 40 }, { prog: 100, x: 2.8, speed: 40 }]).side, 0);
  assert.equal(scenario([], { roadL: 2, roadR: 2 }).side, 0);
});
test('lane reaching is checked across the lap seam and result storage is reusable', () => {
  const c = { prog: 995, x: 0, speed: 40 }, b = { prog: 1010, x: 0, speed: 37 };
  const context = { roomL: 6, roomR: 6, roadL: 6, roadR: 6 }, out = {};
  const result = A.choose(context, c, b, [c,b,{prog:0,x:-2.8,speed:40}], 1000, 2.8, out);
  assert.equal(result,out); assert.equal(result.side,1);
  const left=result.left; A.choose(context,c,b,[c,b],1000,2.8,out); assert.equal(out.left,left);
});

// CHARACTERISATION — the corridor extrapolates every rival at CONSTANT closing
// speed. `candidate()` reads `closing = other.speed - car.speed` ONCE and
// `crosses()` sweeps the slab with it over the whole horizon: the lane-change
// window (`seconds`, clamped to 0.4-1.6 s) plus the 0.5 s settled tail of the
// second call. A rival that is ACCELERATING inside that window — a pit-lane
// exit merging on, a car powering out of a slow corner — closes more ground
// than the straight line predicts, so the planner can declare a lane clear
// that the rival actually reaches. This test asserts what the code does TODAY,
// so a future move to a second-order (or mean-speed) prediction is a deliberate
// change and not a silent one. It is NOT a licence to widen the slab.
test('constant-closing extrapolation clears a lane an ACCELERATING rival reaches', () => {
  // 16 m back in the left lane, closing at 6 m/s and pulling +6 m/s² relative
  // to us (a rival on corner exit against a car already near its ceiling).
  const GAP = -16, CLOSING = 6, ACCEL = 6;
  const open = scenario([{ prog: 100 + GAP, x: -2.8, speed: 40 + CLOSING }]);
  assert.equal(open.side, -1, 'today the left lane is taken as reachable');
  assert.equal(open.left.reason, 'clear passing lane');

  // The horizon the verdict covers: the lane-change window plus the tail.
  const T = open.left.seconds + 0.5;
  // ...over which the REAL rival arrives. Integrate its own motion (nothing the
  // planner does) and find it inside the same 5.2 m x 2.2 m slab crosses() uses,
  // while our car is still crossing to the target lane.
  let reached = 0;
  for (let t = 0; t <= T + 1e-9; t += 0.01) {
    const ds = GAP + CLOSING * t + 0.5 * ACCEL * t * t;
    const dx = -2.8 + Math.min(t / open.left.seconds, 1) * 2.8;   // we close the 2.8 m to the target lane
    if (Math.abs(ds) < 5.2 && Math.abs(dx) < 2.2) { reached = t; break; }
  }
  assert.ok(reached > 0 && reached <= T,
    `the accelerating rival occupies the slab at t=${reached.toFixed(2)}s, inside the ${T.toFixed(2)}s the verdict covers`);

  // And the miss is the EXTRAPOLATION, not the geometry: hand the planner the
  // same car at its MEAN closing speed over that horizon (6 + 6*T/2) and the
  // very same lane comes back as traffic.
  const mean = scenario([{ prog: 100 + GAP, x: -2.8, speed: 40 + CLOSING + ACCEL * T / 2 }]);
  assert.equal(mean.side, 1, 'at the window-average closing rate the left lane is refused');
  assert.match(mean.left.reason, /traffic/);
});
