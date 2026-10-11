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

test('observed accelerating rival blocks a lane reached within the horizon', () => {
  const p = scenario([{ prog: 84, x: -2.8, speed: 46, corridorAccel: 6 }]);
  assert.equal(p.side, 1);
  assert.match(p.left.reason, /traffic/);
  // Without observed acceleration, retain the existing constant-speed model.
  assert.equal(scenario([{ prog: 84, x: -2.8, speed: 46 }]).side, -1);
});
test('bounded acceleration ignores corrupt estimates and does not close distant lanes', () => {
  assert.equal(scenario([{ prog: -100, x: -2.8, speed: 40, corridorAccel: 1e9 }]).side, -1);
  assert.equal(scenario([{ prog: 84, x: -2.8, speed: 46, corridorAccel: NaN }]).side, -1);
  assert.equal(scenario([{ prog: 84, x: -2.8, speed: 46, corridorAccel: -6 }]).side, -1);
});
test('accelerating approach is detected across the lap seam', () => {
  const c = { prog: 5, x: 0, speed: 40 }, b = { prog: 20, x: 0, speed: 37 };
  const ctx = { roomL: 6, roomR: 6, roadL: 6, roadR: 6, kAhead: .01 };
  const p = A.choose(ctx, c, b, [c,b,{ prog:989,x:-2.8,speed:46,corridorAccel:6 }],1000,2.8);
  assert.equal(p.side, 1);
});

test('our braking does not hide a steady rival closing from behind', () => {
  const car = {prog:100,x:0,speed:40,corridorAccel:-22};
  const blocker = {prog:115,x:0,speed:37,corridorAccel:0};
  const rival = {prog:82,x:-2.8,speed:40,corridorAccel:0};
  const ctx = {roomL:6,roomR:6,roadL:6,roadR:6,kAhead:.01};
  const p = A.choose(ctx,car,blocker,[car,blocker,rival],1000,2.8);
  assert.equal(p.side,1);
  assert.match(p.left.reason,/traffic/);
});

// LOOK DOWN THE LANE (2026-10-01): a slower car AHEAD in the target lane, that
// we would catch before the pass is done, closes the lane — pulling out only to
// queue behind it was a re-queue, not a pass.
test('a slower car ahead in the passing lane closes it; a far or quicker one does not', () => {
  const p = scenario([{ prog: 120, x: -2.8, speed: 37 }], { blockerGap: 15 });
  assert.equal(p.side, 1);
  assert.match(p.left.reason, /traffic ahead/);
  assert.equal(scenario([{ prog: 175, x: -2.8, speed: 37 }], { blockerGap: 15 }).side, -1, 'beyond 1.5 s of road');
  assert.equal(scenario([{ prog: 120, x: -2.8, speed: 48 }], { blockerGap: 15 }).side, -1, 'pulling away');
});
// THE INSIDE AT THE CATCH POINT: with the next corner's curvature (kTurn) the
// inside of THAT corner wins a lane with up to ~3 m less room.
test('the inside of the next corner wins the pass side', () => {
  assert.equal(scenario([], { kAhead: 0, kTurn: -0.01, toTurnIn: 120 }).side, 1, 'right-hander: inside is +x');
  assert.equal(scenario([], { kAhead: 0, kTurn: 0.01, toTurnIn: 120 }).side, -1);
  assert.equal(scenario([], { kAhead: 0, kTurn: -0.01, toTurnIn: 120, roomR: 3, roadR: 3 }).side, 1, 'even with less room');
});

// STREETS (2026-10-01): neither the lane look-ahead nor the next-corner bonus —
// both cost monaco passes; the old otSide tiebreak scores the side.
test('on a street the look-ahead and the next-corner bonus are off', () => {
  assert.equal(scenario([{ prog: 120, x: -2.8, speed: 37 }], { blockerGap: 15, street: true }).side, -1, 'a slower car ahead does not close a street lane');
  assert.equal(scenario([], { kAhead: 0, kTurn: -0.01, toTurnIn: 120, roomR: 3, roadR: 3, street: true }).side, -1, 'no 0.8 inside bonus: the roomier lane wins');
});

// ORDER INDEPENDENCE: game.js stamps _snapProg/_snapX/_snapSpeed on every car
// before any updateCar runs; a rival updated EARLIER in the tick has already
// moved speed·dt on its live fields (~0.7 m at 40 m/s, ~1.3 m at 80 m/s).
// choose() must read the snapshot, or the same traffic picks a different side
// depending on cars[] order.
test('the passing side does not depend on cars[] order (snapshots, not live fields)', () => {
  const dt = 1 / 60, L = 1000;
  const mk = (prog, x, speed) => ({ prog, x, speed, _snapProg: prog, _snapX: x, _snapSpeed: speed });
  // The rival keeps pace in the left lane, 5.3-5.4 m behind the subject at the
  // snapshot: just outside the 5.2 m longitudinal window, so the left lane is
  // open. A live read that has advanced it 0.67 m puts it inside the window.
  for (const rivalProg of [94.6, 94.7, 94.75]) {
    const sides = [];
    for (const rivalFirst of [true, false]) {
      const car = mk(100, 0, 40), blocker = mk(115, 0, 37), rival = mk(rivalProg, -2.8, 40);
      const cars = rivalFirst ? [rival, car, blocker] : [car, blocker, rival];
      // Emulate the tick: every car ahead of the subject in the array has
      // already integrated its motion into the LIVE fields (snapshots stay).
      for (const o of cars.slice(0, cars.indexOf(car))) o.prog += o.speed * dt;
      const ctx = { roomL: 6, roomR: 6, roadL: 6, roadR: 6, kAhead: .01 };
      sides.push(A.choose(ctx, car, blocker, cars, L, 2.8).side);
    }
    assert.equal(sides[0], -1, 'the snapshot gap leaves the inside lane open');
    assert.equal(sides[0], sides[1], `rival snapshot at ${rivalProg}: array order changed the side (${sides})`);
  }
});
test('a car without snapshots falls back to its live fields', () => {
  const p = scenario([{ prog: 100, x: -2.8, speed: 40 }]);
  assert.equal(p.side, 1);
  const withSnap = scenario([{ prog: 999, x: 9, speed: 0, _snapProg: 100, _snapX: -2.8, _snapSpeed: 40 }]);
  assert.equal(withSnap.side, 1, 'the snapshot, not the stale live value, is what the planner reads');
});
