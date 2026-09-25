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
