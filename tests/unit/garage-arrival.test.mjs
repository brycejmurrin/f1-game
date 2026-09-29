import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../../js/garage/arrival.js', import.meta.url), 'utf8'), context);
const Arrival = vm.runInContext('GarageArrival', context);
function harness(reduced = false) {
  const elements = new Map();
  const $ = id => {
    if (!elements.has(id)) elements.set(id, { hidden: true, inert: false, textContent: '',
      classList: { toggle() {} }, setAttribute(k, v) { this[k] = v; }, focus() { this.focused = true; } });
    return elements.get(id);
  };
  return { $, arrival: Arrival.create($, () => reduced) };
}
test('car waits outside until shutter is clear, backs monotonically into bay and parks', () => {
  let prior = Infinity;
  for (let t = 0; t <= 7; t += 0.02) {
    const p = Arrival.pose(t);
    assert.ok(p.z <= prior && p.z >= 0);
    if (t < 1.8) assert.equal(p.z, 11.4);
    if (p.z < 11.4) assert.equal(p.door, 1);
    assert.ok(p.eye[0] > -5.4 && p.eye[0] < 5.4 && p.eye[2] > -6.4 && p.eye[2] < 6.4);
    prior = p.z;
  }
  assert.equal(Arrival.pose(7).z, 0);
  assert.equal(Arrival.pose(7).active, false);
});
test('skip and natural completion unlock controls and preserve open shutter until exit', () => {
  for (const skip of [true, false]) {
    const { $, arrival } = harness(); arrival.start();
    assert.equal($('cs-inner').inert, true);
    assert.equal($('carsetup')['data-esc-close'], 'cs-arrival-skip');
    if (skip) $('cs-arrival-skip').onclick();
    else for (let i = 0; i < 70; i++) arrival.step(0.1);
    assert.equal(arrival.state.z, 0); assert.equal(arrival.state.door, 1);
    assert.equal($('cs-inner').inert, false); assert.equal($('cs-arrival').hidden, true);
    assert.equal($('carsetup')['data-esc-close'], 'cs-back');
    arrival.cancel(); assert.equal(arrival.state, null);
    arrival.start(); assert.equal(arrival.state.z, 11.4);
  }
});
test('reduced motion bypasses camera movement; tab gaps and invalid dt cannot skip sequence', () => {
  const reduced = harness(true); reduced.arrival.start();
  assert.equal(reduced.arrival.state.active, false);
  assert.equal(reduced.$('cs-inner').inert, false);
  const { arrival } = harness(); arrival.start();
  for (const dt of [NaN, -3, Infinity]) arrival.step(dt);
  assert.equal(arrival.state.door, 0);
  arrival.step(60); assert.equal(arrival.state.active, true); assert.equal(arrival.state.z, 11.4);
});
test('saved tuner settings control arrival speed, angle, lens and disabled playback', () => {
  const { $ } = harness();
  let saved = null;
  const read = Arrival.bindSettings($, { get: () => saved, set: (_, value) => { saved = value; } });
  $('ga-speed').value = '2'; $('ga-speed').onchange();
  $('ga-angle').value = 'right'; $('ga-angle').onchange();
  $('ga-fov').value = '70'; $('ga-fov').onchange();
  const arrival = Arrival.create($, () => false, read);
  arrival.start(); assert.ok(arrival.state.eye[0] > 0); assert.equal(arrival.state.fov, 70);
  for (let i = 0; i < 33; i++) arrival.step(0.1);
  assert.equal(arrival.state.active, false);
  $('ga-enabled').checked = false; $('ga-enabled').onchange();
  arrival.start(); assert.equal(arrival.state.active, false);
  $('ga-reset').onclick(); assert.equal(saved, null); assert.equal(read().speed, 1);
  arrival.start(); assert.equal(arrival.state.active, true);
  assert.equal(Arrival.settings({ speed: Infinity, fov: -100, angle: 'outside' }).fov, 40);
  assert.equal(Arrival.settings({ speed: Infinity }).speed, 1);
  assert.equal(Arrival.settings({ angle: 'outside' }).angle, 'cut');
});

// ── THE DRIVE-OUT: the arrival in reverse, as the flyby's opening shot (js/camera/drive-out.js) ──
const outCtx = vm.createContext({ Math, Number, Object, Log: { info() {}, warn() {} } });
vm.runInContext(readFileSync(new URL('../../js/camera/drive-out.js', import.meta.url), 'utf8'), outCtx);
const Out = vm.runInContext('DriveOut', outCtx);
test('drive-out path: parked in the bay facing the lane, a held beat, then out of the door and away down the working lane', () => {
  for (const sd of [1, -1]) {
    const laneL = -2.75;
    const p0 = Out.path(0, laneL, sd), hold = Out.path(Out.HOLD * 0.9, laneL, sd), p1 = Out.path(1, laneL, sd);
    assert.equal(p0.l, Out.L_CAR, 'at rest inside the bay');
    assert.ok(Math.abs(p0.yaw - (-sd * Math.PI / 2)) < 1e-9, 'nose to the pit lane (the arrival reverses in)');
    assert.equal(hold.l, p0.l, 'still during the hold');
    assert.equal(hold.v, 0);
    assert.ok(Math.abs(p1.l - laneL) < 1e-9 && Math.abs(p1.yaw) < 1e-9, 'ends on the working lane, pointing down it');
    assert.ok(p1.a > p0.a + 5, 'towards the pit exit (the racing direction)');
    let prevL = Infinity;
    for (let u = 0; u <= 1; u += 0.01) {
      const p = Out.path(u, laneL, sd);
      assert.ok(p.l <= prevL + 1e-9, 'never backs into the bay');
      assert.ok(p.l <= Out.L_CAR && p.l >= laneL - 1e-9, 'between the bay and the lane');
      prevL = p.l;
    }
  }
});
test('drive-out shot: both eyes inside the bay, the dolly towards the door, the tuner fov, RIGHT mirrors the side', () => {
  const s = Out.shot(-2.75, { fov: 60 });
  assert.equal(s.id, 'garage-out');
  assert.ok(!/^grid/.test(s.id), 'never a grid shot: the card keeps the map and the radio check ignores it');
  for (const e of s.eye) {
    assert.equal(e.at, 'box');
    assert.ok(e.x > 0 && e.x < 12.8, `eye ${e.x} m in: inside, short of the back wall`);
    assert.ok(Math.abs(e.off) < 5.4, 'inside the side walls');
  }
  assert.ok(s.eye[0].x > s.eye[1].x, 'from the back of the bay towards the door');
  assert.deepEqual([...s.fov], [60, 60]);
  assert.equal(Out.shot(-2.75, { angle: 'right' }).eye[0].off, -s.eye[0].off);
});
