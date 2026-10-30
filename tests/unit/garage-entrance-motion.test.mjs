import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { absSrc } from '../helpers/abs-src.mjs';
const moduleSource = readFileSync(new URL('../../js/garage/entrance-motion.js', import.meta.url), 'utf8');
function load(dataSource = '') {
  const ctx = vm.createContext({});
  vm.runInContext(dataSource, ctx, { filename: absSrc('js/data/garage-entrance-motion.js') });
  vm.runInContext(moduleSource, ctx, { filename: absSrc('js/garage/entrance-motion.js') });
  return vm.runInContext('GarageEntranceMotion', ctx);
}
const source = readFileSync(new URL('../../js/data/garage-entrance-motion.js', import.meta.url), 'utf8');
const T = { door: 1.8, lane: 2.6, pause: .4, back: 3.6 };
test('missing or corrupt export fails closed so arrival can use procedural fallback', () => {
  for (const code of ['', 'const GarageEntranceMotionData={version:2};',
    'const GarageEntranceMotionData={version:1,columns:[],lane:[[NaN]],back:[]};']) {
    const motion = load(code);
    assert.equal(motion.available(), false);
    assert.equal(motion.pose(4, T), null);
  }
});
test('authored phases join without a transform or wheel discontinuity and finish parked', () => {
  const motion = load(source);
  assert.equal(motion.available(), true);
  const lane = motion.sample('lane', 1), back = motion.sample('back', 0);
  for (const key of Object.keys(lane)) assert.ok(Math.abs(lane[key] - back[key]) < 1e-5, key + ' joins');
  const end = motion.pose(100, T);
  for (const key of ['x', 'z', 'yaw', 'steer', 'heave', 'pitch']) assert.ok(Math.abs(end[key]) < 1e-5, key + ' parked');
  assert.equal(motion.sample('out', .5), null);
});
test('mirroring preserves contact and distance, while tuner timing only remaps phase', () => {
  const motion = load(source), slow = { ...T, lane: T.lane * 2, back: T.back * 2 };
  for (let u = 0; u <= 1; u += .01) {
    const a = motion.sample('back', u, 1), b = motion.sample('back', u, -1);
    for (const key of Object.keys(a)) assert.ok(Math.abs(a[key] - b[key] * (['x', 'yaw', 'steer'].includes(key) ? -1 : 1)) < 1e-8);
    assert.ok(a.z >= 0 && a.z <= 13.001 && Math.abs(a.x) <= 5.001, 'inside route envelope');
    const p = motion.pose(T.door + T.lane * u, T), q = motion.pose(slow.door + slow.lane * u, slow);
    for (const key of Object.keys(p)) assert.ok(Math.abs(p[key] - q[key]) < 1e-8, key + ' time warp');
  }
});

const crewSource = readFileSync(new URL('../../js/garage/crew-draw.js', import.meta.url), 'utf8');
const arrivalSource = readFileSync(new URL('../../js/garage/arrival.js', import.meta.url), 'utf8');
// Keep V8 compilation distinct across scenarios that add lexical globals after boot.
// Reusing identical compiled source across these VM contexts caches a stale typeof lookup.
let arrivalContextId = 0;
function arrivalContext(authored = true) {
  const ctx = vm.createContext({});
  vm.runInContext(crewSource, ctx, { filename: absSrc('js/garage/crew-draw.js') });
  if (authored) {
    vm.runInContext(source, ctx, { filename: absSrc('js/data/garage-entrance-motion.js') });
    vm.runInContext(moduleSource, ctx, { filename: absSrc('js/garage/entrance-motion.js') });
  }
  vm.runInContext(arrivalSource + '\n// isolated arrival scenario ' + (++arrivalContextId), ctx, { filename: absSrc('js/garage/arrival.js') });
  return { ctx, arrival: vm.runInContext('GarageArrival', ctx) };
}
function xyz(p) { return [p.x, p.z, p.yaw]; }
test('real arrival delegates entrance transforms to Blender data and preserves home and exit poses', () => {
  const { ctx, arrival } = arrivalContext(), legacy = arrivalContext(false).arrival;
  const motion = vm.runInContext('GarageEntranceMotion', ctx);
  const config = arrival.settings({ angle: 'left', enterCrew: 'current', homeCrew: 'current', leaveCrew: 'current', sway: 0 });
  let changed = false;
  for (let t = 0; t <= 9; t += .031) {
    const p = arrival.pose(t, config, true), baked = motion.pose(t, arrival.timeline(config), 1);
    assert.deepEqual(xyz(p), xyz(baked), 'entrance uses authored transform');
    if (Math.abs(p.x - legacy.pose(t, config, true).x) > .001) changed = true;
    for (const method of ['poseHome', 'poseOut']) {
      assert.equal(JSON.stringify(arrival[method](t, config, true)), JSON.stringify(legacy[method](t, config, true)), method + ' remains unchanged');
    }
  }
  assert.ok(changed, 'authored approach differs from procedural baseline');
});
test('late data cannot switch an active cold arrival, while the next visit uses the warm data', () => {
  const { ctx, arrival } = arrivalContext(false), nodes = new Map();
  const $ = (id) => {
    if (!nodes.has(id)) nodes.set(id, { hidden: true, inert: false, textContent: '',
      classList: { toggle() {} }, setAttribute() {}, focus() {} });
    return nodes.get(id);
  };
  const config = arrival.settings({ angle: 'left', enterCrew: 'current', sway: 0 });
  const run = arrival.create($, () => false, () => config, () => 0);
  run.start();
  vm.runInContext(source, ctx, { filename: absSrc('js/data/garage-entrance-motion.js') });
  vm.runInContext(moduleSource, ctx, { filename: absSrc('js/garage/entrance-motion.js') });
  let pose;
  for (let i = 0; i < 30; i++) pose = run.step(.1);
  assert.deepEqual(xyz(pose), xyz(arrival.pose(pose.seconds, { ...config, _entranceAuthored: false })), 'cold run retains procedural ownership');
  run.cancel();
  assert.equal(run.state, null);
  assert.equal(nodes.get('cs-inner').inert, false);
  run.start();
  for (let i = 0; i < 30; i++) pose = run.step(.1);
  assert.deepEqual(xyz(pose), xyz(arrival.pose(pose.seconds, config)), 'repeat run uses now-ready data');
  run.finish();
  assert.equal(run.state.active, false);
  assert.equal(nodes.get('cs-inner').inert, false);
  assert.deepEqual(xyz(run.state), [0, 0, 0]);
});
test('direct preview pose latches its source before a lazy asset load and a fresh preview adopts it', () => {
  const { ctx, arrival } = arrivalContext(false);
  const config = arrival.settings({ angle: 'left', enterCrew: 'current', sway: 0 });
  arrival.pose(0, config);
  vm.runInContext(source, ctx, { filename: absSrc('js/data/garage-entrance-motion.js') });
  vm.runInContext(moduleSource, ctx, { filename: absSrc('js/garage/entrance-motion.js') });
  const legacy = arrivalContext(false).arrival;
  const continued = arrival.pose(5, config), baseline = legacy.pose(5, config);
  assert.deepEqual(xyz(continued), xyz(baseline), 'in-flight preview retains the path selected at its opening');
  const fresh = arrival.settings(config);
  arrival.pose(0, fresh);
  const next = arrival.pose(5, fresh);

  const motion = vm.runInContext('GarageEntranceMotion', ctx);
  assert.deepEqual(xyz(next), xyz(motion.pose(5, arrival.timeline(fresh), 1)), 'fresh preview adopts ready Blender samples');
  assert.ok(Math.abs(next.z - continued.z) > .001 || Math.abs(next.x - continued.x) > .001, 'test distinguishes the two paths');
});
test('wheel distance is signed metres and follows forward and reverse travel on both mirrored axes', () => {
  const motion = load(source);
  assert.equal(motion.WHEEL_RADIUS, .34);
  for (const side of [-1, 1]) {
    for (const phase of ['lane', 'back']) {
      let previous = motion.sample(phase, 0, side);
      for (let i = 1; i <= 64; i++) {
        const p = motion.sample(phase, i / 64, side);
        const distance = p.wheelDistance - previous.wheelDistance;
        const alongNose = (p.x - previous.x) * Math.sin(p.yaw) + (p.z - previous.z) * Math.cos(p.yaw);
        assert.ok(phase === 'lane' ? distance > 0 && alongNose > 0 : distance < 0 && alongNose < 0, phase + ': wheel and nose axes agree');
        assert.equal(p.wheelDistance, p.wheelRoll * .34);
        previous = p;
      }
    }
    assert.ok(Math.abs(motion.sample('lane', 1, side).wheelDistance - 22) < 2e-6, '22 metre lane travel, not 22 radians');
  }
});
test('only authored entrance exposes articulation, with body channels separate from the grounded root', () => {
  const { ctx, arrival } = arrivalContext(), motion = vm.runInContext('GarageEntranceMotion', ctx);
  const config = arrival.settings({ angle: 'left', enterCrew: 'current', sway: 0 });
  for (const t of [0, 3, 5.5, 7, 100]) {
    const p = arrival.pose(t, config), channels = motion.pose(t, arrival.timeline(config), 1);
    assert.equal(p.articulated, true);
    assert.equal(p.wheelDistance, channels.wheelDistance);
    assert.equal(p.steer, channels.steer);
    assert.equal(p.bodyPitch, channels.pitch);
    assert.equal(p.bodyHeave, channels.heave);
    for (const key of ['wheelDistance', 'steer', 'bodyPitch', 'bodyHeave']) assert.ok(Number.isFinite(p[key]), key + ' finite');
    assert.equal(p.y, undefined, 'body heave does not lift the grounded wheel/root transform');
  }
  const parked = arrival.pose(100, config);
  assert.deepEqual([parked.steer, parked.bodyPitch, parked.bodyHeave], [0, 0, 0]);
  const legacy = arrivalContext(false).arrival;
  for (const p of [legacy.pose(3, config), arrival.pose(3, { ...config, _entranceAuthored: false }), arrival.poseHome(3, config), arrival.poseOut(3, config)]) {
    for (const key of ['articulated', 'wheelDistance', 'steer', 'bodyPitch', 'bodyHeave']) assert.equal(Object.hasOwn(p, key), false, key + ' absent outside authored entrance');
  }
});
