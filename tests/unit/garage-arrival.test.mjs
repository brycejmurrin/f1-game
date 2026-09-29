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
test('drive-out shot: from the back of the bay, out THROUGH the door (never its walls), onto the lane; tuner fov; RIGHT mirrors', () => {
  const s = Out.shot(-2.75, { fov: 60 });
  assert.equal(s.id, 'garage-out');
  assert.ok(!/^grid/.test(s.id), 'never a grid shot: the card keeps the map and the radio check ignores it');
  for (const e of [...s.eye, ...s.look]) assert.equal(e.at, 'box');
  assert.ok(s.eye[0].x > 0 && s.eye[0].x < 12.8 && Math.abs(s.eye[0].off) < 5.4, 'starts inside the bay, short of the back wall');
  assert.ok(s.eye[1].x < 0 && s.eye[1].x > -2.75, 'ends just out of the door, short of the lane the car drives down');
  assert.ok(Math.abs(Out.eyeDoorA(s)) < Out.DOOR_HALF - 0.4, `the dolly crosses the door line ${Out.eyeDoorA(s).toFixed(2)} m from its centre: through the opening`);
  assert.equal(s.look[1].off, Out.A_CAR + Out.A_RUN, 'the last look is where the car stops');
  assert.deepEqual([...s.fov], [60, 60]);
  assert.equal(Out.shot(-2.75, { angle: 'right' }).eye[0].off, -s.eye[0].off);
});

// ── THE STUDIO DRIVE-OUT: RACE! before the circuit is ready (js/game.js introBuild/introWarm) ──
test('studio drive-out (poseOut): shutter up, parked a beat, then nose first out of the door and clear of it', () => {
  for (const angle of ['cut', 'left', 'right']) {
    const cfg = Arrival.settings({ angle, fov: 58 });
    const p0 = Arrival.poseOut(0, cfg);
    assert.equal(p0.z, 0, 'parked where the arrival parks it');
    assert.equal(p0.door, 1, 'the shutter is already up');
    assert.equal(p0.fov, 58);
    assert.equal(Arrival.poseOut(1.0, cfg).z, 0, 'a held beat before it moves');
    let prior = -1;
    for (let t = 0; t <= Arrival.OUT_DURATION + 0.5; t += 0.02) {
      const p = Arrival.poseOut(t, cfg);
      assert.ok(p.z >= prior, 'never backs in');
      assert.ok(p.eye[0] > -5.4 && p.eye[0] < 5.4 && p.eye[2] > -6.4 && p.eye[2] < 6.4, 'the camera stays in the room');
      assert.ok(p.aim[2] <= 9, 'the aim follows the car out, no further');
      prior = p.z;
    }
    assert.ok(Arrival.poseOut(Arrival.OUT_DURATION, cfg).z > 6.4 + 5, 'out of the door and clear of it');
    assert.equal(Arrival.poseOut(Arrival.OUT_DURATION, cfg).active, false);
  }
  assert.ok(Arrival.poseOut(0, Arrival.settings({ angle: 'right' })).eye[0] > 0 && Arrival.poseOut(0, Arrival.settings({})).eye[0] < 0, 'RIGHT stands on the other side');
});
test('game.js plays the studio drive-out AT ONCE when RACE! beats the circuit, and the warm waits for it', () => {
  const game = readFileSync(new URL('../../js/game.js', import.meta.url), 'utf8');
  const build = game.slice(game.indexOf('function introBuild(go)'), game.indexOf('function introWarm(go)'));
  assert.match(build, /loadingScreen\.building\(info0\); studioOpen\(\);/, 'the drive-out starts with the card, before any build step');
  assert.ok(build.indexOf('await studioDone(live)') > 0 && build.indexOf('await studioDone(live)') < build.indexOf('warmPrograms()'), 'the warm waits for the car to be out');
  const warm = game.slice(game.indexOf('function introWarm(go)'), game.indexOf('function startRaceCovered()'));
  assert.match(warm, /loadingScreen\.building\(loadingInfo\(\)\); studioOpen\(\);/);
  assert.ok(warm.indexOf('await studioDone(live)') < warm.indexOf('warmPrograms()'));
  assert.match(game, /const studio = !!built && _studioPlayed; _studioPlayed = false;/, 'the montage does not repeat it on the pit lane');
  assert.match(game, /const lead = world && flybyShots && !studio &&/);
  assert.match(game, /\|\| \(loadingScreen\.phase\(\) === "build" && !setupPreviewOn\);/, 'the studio shows through the build card');
  const cam = readFileSync(new URL('../../js/garage/setup-camera.js', import.meta.url), 'utf8');
  assert.match(cam, /const arriving = driveOut \? stepDriveOut\(dt\) : arrival\.step\(dt\);/);
  assert.match(cam, /if \(!cfg\.enabled \|\| reducedMotion\(\)\) return 0;/, 'the arrival tuner and reduced motion gate it');
  assert.match(game, /setupCam\.driveOutLeft\(\) > 0 && performance\.now\(\) - _studio\.at < _studio\.ms \* 3\)/, 'a build stall delays the car, never cuts it off in the doorway');
});
