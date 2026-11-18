// @doc GarageDepartureWheels.samplePose: authored Blender departure for every
// tuner angle (Night Shift high), CUT-only follow camera, settle maps past the
// mid-lane ~8 s mark onto the ~10.6 s out length.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { absSrc } from '../helpers/abs-src.mjs';

function load() {
  const ctx = vm.createContext({});
  for (const f of [
    'js/garage/crew-draw.js',
    'js/garage/arrival.js',
    'js/garage/garage-data.js',
    'js/data/garage-departure-motion.js',
    'js/core/mat4.js',
  ]) {
    vm.runInContext(readFileSync(new URL('../../' + f, import.meta.url), 'utf8'), ctx, { filename: absSrc(f) });
  }
  ctx.Car3D = {
    TYRE_BAND: [null, [1, 0, 0]],
    BRAKE_CALIPER: [null, [1, 1, 0]],
    buildWheelLayers() { return { rotating: {}, fixed: {} }; },
  };
  for (const f of ['js/car/car-wheels.js', 'js/garage/departure-wheels.js']) {
    vm.runInContext(readFileSync(new URL('../../' + f, import.meta.url), 'utf8'), ctx, { filename: absSrc(f) });
  }
  return {
    Arrival: vm.runInContext('GarageArrival', ctx),
    Wheels: vm.runInContext('GarageDepartureWheels', ctx),
    Motion: vm.runInContext('GarageDepartureMotion', ctx),
  };
}

const { Arrival, Wheels, Motion } = load();

test('samplePose applies authored car path for every tuner angle, including Night Shift high', () => {
  const angles = ['cut', 'high', 'left', 'right', 'low', 'door'];
  for (const angle of angles) {
    const cfg = Arrival.settings({ angle, fov: 54 });
    const pose = Object.assign({}, Arrival.poseOut(5.0, cfg, false));
    const eye0 = pose.eye.slice();
    const motion = Wheels.samplePose(pose, 5.0, cfg, { eye: [0, 0, 0], aim: [0, 0, 0] }, {});
    assert.ok(motion, `${angle}: authored departure must apply (Night Shift uses high)`);
    assert.ok(Number.isFinite(pose.distance) && pose.distance > 1, `${angle}: distance published for wheel roll`);
    assert.ok(Math.abs(pose.x - motion.x) < 1e-12 && Math.abs(pose.z - motion.z) < 1e-12);
    if (angle === 'cut') {
      assert.ok(pose.eye === motion.eye, 'CUT takes the authored follow camera');
    } else {
      assert.equal(pose.eye[0], eye0[0], `${angle}: keeps poseOut eye`);
      assert.equal(pose.eye[1], eye0[1], `${angle}: keeps poseOut eye`);
      assert.equal(pose.eye[2], eye0[2], `${angle}: keeps poseOut eye`);
    }
  }
  const night = Arrival.applyStyle(null, 'nightshift');
  assert.equal(night.angle, 'high');
  const p = Object.assign({}, Arrival.poseOut(5.0, night, false));
  const m = Wheels.samplePose(p, 5.0, night, { eye: [0, 0, 0], aim: [0, 0, 0] }, {});
  assert.ok(m && p.distance > 1, 'Night Shift style drives the authored departure');
  // Authored path differs from the analytic poseOut at mid-roll (Blender ease + turn).
  const raw = Arrival.poseOut(5.0, night, false);
  assert.ok(Math.hypot(p.x - raw.x, p.z - raw.z) > 0.5, 'authored mid-roll leaves the analytic path');
});

test('createGarage draw links material prototype only when the mat identity changes', () => {
  const ctx = vm.createContext({
    Math, Float32Array, Object, Array, Number, String, Error, TypeError,
    console, performance: { now: () => 0 },
  });
  ctx.Car3D = {
    TYRE_BAND: [null, [1, 0, 0]],
    BRAKE_CALIPER: [null, [1, 1, 0]],
    buildWheelLayers() {
      return {
        rotating: { pos: [0, 0, 0], nrm: [0, 1, 0], col: [0, 0, 0], mat: [0], idx: [0, 0, 0] },
        fixed: { pos: [0, 0, 0], nrm: [0, 1, 0], col: [0, 0, 0], mat: [0], idx: [0, 0, 0] },
      };
    },
  };
  ctx.M4 = { mulTo(out) { out.fill(0); out[15] = 1; } };
  vm.runInContext(readFileSync(new URL('../../js/car/car-wheels.js', import.meta.url), 'utf8'), ctx, {
    filename: absSrc('js/car/car-wheels.js'),
  });
  let protoCalls = 0;
  const realSet = ctx.Object.setPrototypeOf.bind(ctx.Object);
  Object.defineProperty(ctx.Object, 'setPrototypeOf', {
    configurable: true,
    writable: true,
    value(o, proto) { protoCalls++; return realSet(o, proto); },
  });
  const draws = [];
  const gfx = {
    createMesh(d) { return { d }; },
    freeMesh() {},
    draw(mesh, world, opts) { draws.push({ mesh, opts }); },
  };
  // Top-level const CarWheels is script-scoped in the VM, not ctx.CarWheels.
  const garage = vm.runInContext('CarWheels', ctx).createGarage(gfx);
  garage.prepare('k1', {}, { tyres: 1, brakes: 1, _visual: {} });
  const mat = { roughness: 0.4, specular: 0.2 };
  garage.draw(new Float32Array(16), 1.2, 0.1, mat);
  garage.draw(new Float32Array(16), 1.4, 0.1, mat);
  garage.draw(new Float32Array(16), 1.6, 0.1, mat);
  assert.equal(protoCalls, 1, 'same material identity: one setPrototypeOf for the turntable');
  const mat2 = { roughness: 0.5, specular: 0.1 };
  garage.draw(new Float32Array(16), 1.8, 0.1, mat2);
  assert.equal(protoCalls, 2, 'a new material identity re-links once');
  assert.ok(draws.length >= 4 * 4, 'four wheels × layers still draw');
  assert.equal(Object.getPrototypeOf(draws.at(-1).opts), mat2);
});

test('calm reduced-motion still gets the wide exterior camera on non-CUT angles', () => {
  const cfg = Arrival.settings({ angle: 'high', fov: 56 });
  const pose = Object.assign({}, Arrival.poseOut(5.0, cfg, true));
  const motion = Wheels.samplePose(pose, 5.0, cfg, { eye: [0, 0, 0], aim: [0, 0, 0] }, { calm: true });
  assert.ok(motion);
  assert.equal(pose.fov, 75);
  assert.ok(Math.abs(pose.eye[1] - 3.2) < 1e-9);
});

test('authored u reaches 1 at settle, not at the mid-lane ~8 s mark; preview length stays ~10.6 s', () => {
  // Regression note: a rolling window of door+hold+run (~8 s) would freeze the car
  // while GarageArrival.duration still reports ~10.6 s. samplePose must use settle.
  const cfg = Arrival.settings({ angle: 'cut' });
  const T = Arrival.timeline(cfg, 'out');
  const dur = Arrival.duration(cfg, 'out');
  assert.ok(Math.abs(dur - Arrival.OUT_DURATION) < 1e-9);
  assert.ok(Math.abs(dur * 1000 - 10600) <= 400, 'default out length is the tuned ~10.6 s');
  const delay = dur - T.base;
  const go = T.door + T.hold + delay;
  const rolling = T.settle - T.door - T.hold;
  assert.ok(go + rolling > 9.5, 'motion end tracks settle (~10.3 s), not the ~8 s mid-lane beat');
  const at8 = Object.assign({}, Arrival.poseOut(8.0, cfg, false));
  Wheels.samplePose(at8, 8.0, cfg, { eye: [0, 0, 0], aim: [0, 0, 0] }, {});
  const atSettle = Object.assign({}, Arrival.poseOut(T.settle, cfg, false));
  Wheels.samplePose(atSettle, T.settle, cfg, { eye: [0, 0, 0], aim: [0, 0, 0] }, {});
  assert.ok(at8.distance < atSettle.distance - 1, 'car is still rolling at 8.0 s of 10.6 s');
  assert.ok(Math.abs(atSettle.distance - Motion.sample(1, 1, { eye: [0, 0, 0], aim: [0, 0, 0] }).distance) < 1e-6);
  assert.equal(Arrival.poseOut(dur, cfg, false).active, false);
  assert.equal(Arrival.poseOut(dur - 0.05, cfg, false).active, true);
});

test('samplePose returns null when the motion table is absent', () => {
  const ctx = vm.createContext({
    GarageArrival: Arrival,
    CarWheels: { createGarage: () => ({}) },
  });
  vm.runInContext(readFileSync(new URL('../../js/garage/departure-wheels.js', import.meta.url), 'utf8'), ctx, {
    filename: absSrc('js/garage/departure-wheels.js'),
  });
  const W = vm.runInContext('GarageDepartureWheels', ctx);
  const cfg = Arrival.settings({ angle: 'high' });
  const pose = Object.assign({}, Arrival.poseOut(5, cfg, false));
  assert.equal(W.samplePose(pose, 5, cfg, { eye: [0, 0, 0], aim: [0, 0, 0] }, {}), null);
});

test('spinRadians and create stay locked to the garage wheel radius', () => {
  assert.equal(Wheels.WHEEL_RADIUS, 0.34);
  assert.equal(Motion.wheelRadius, Wheels.WHEEL_RADIUS);
  assert.ok(Math.abs(Wheels.spinRadians(0.34 * Math.PI) - Math.PI) < 1e-12);
  const wheels = Wheels.create({
    createMesh: (data) => data,
    freeMesh() {},
    draw() {},
  });
  assert.equal(typeof wheels.prepare, 'function');
  assert.equal(typeof wheels.draw, 'function');
  assert.equal(typeof wheels.release, 'function');
});
