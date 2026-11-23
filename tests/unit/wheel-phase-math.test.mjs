// Pin: road speed → wheel axle angle is angle += v/R·dt (front scales by 1−lock).
// The race frame step (CarDraw.advanceWheelPhases) and the garage distance path
// both consume CarWheels.phaseStep / WHEEL_R so this file is the math's one home.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

function loadCarWheels() {
  const ctx = vm.createContext({
    Math, Float32Array, Array, Object, Number, String, JSON, Map, WeakMap, Set,
    Infinity, console,
  });
  // car-wheels.js only needs a stub Car3D/CarMaterials/CarShade/CarGeometry for create();
  // phaseStep / wrapPhase / WHEEL_R are defined before create() and need none of them.
  ctx.Car3D = { TYRE_BAND: [null, [1, 0, 0]], BRAKE_CALIPER: [null, [1, 0, 0]], buildWheelLayers() { return { rotating: {}, fixed: {} }; } };
  ctx.CarMaterials = { SURFACES: { paint: 1 }, FINISH_SURFACE: {} };
  ctx.CarShade = { any: () => false, vertexNormals() {} };
  ctx.CarGeometry = { weld: (o) => o };
  ctx.M4 = { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), mulTo() {}, ident: () => new Float32Array(16) };
  vm.runInContext(fs.readFileSync(absSrc("js/car/car-wheels.js"), "utf8").replace(/^const\b/gm, "var"),
    ctx, { filename: absSrc("js/car/car-wheels.js") });
  return ctx.CarWheels;
}

const W = loadCarWheels();

test("CarWheels exports phaseStep, wrapPhase and WHEEL_R matching the geometry radius", () => {
  assert.equal(typeof W.phaseStep, "function");
  assert.equal(typeof W.wrapPhase, "function");
  assert.equal(W.WHEEL_R, 0.34);
});

test("phaseStep is angle += v/R·dt; fronts freeze under full lock", () => {
  const R = W.WHEEL_R;
  const dt = 1 / 60;
  const v = 40;   // m/s
  const d = W.phaseStep(v, dt, R, 0);
  assert.ok(Math.abs(d.rear - (v / R) * dt) < 1e-12);
  assert.equal(d.front, d.rear);
  const locked = W.phaseStep(v, dt, R, 1);
  assert.ok(Math.abs(locked.rear - d.rear) < 1e-12, "rears keep rolling under lock");
  assert.equal(locked.front, 0, "full lock freezes the fronts");
  const half = W.phaseStep(v, dt, R, 0.5);
  assert.ok(Math.abs(half.front - d.rear * 0.5) < 1e-12);
});

test("phaseStep reuses one scratch: no per-car-per-frame object (#5057 row 3)", () => {
  const a = W.phaseStep(40, 1 / 60, W.WHEEL_R, 0);
  const aRear = a.rear;
  const b = W.phaseStep(20, 1 / 60, W.WHEEL_R, 1);
  assert.equal(b, a, "same out-object identity across calls");
  assert.ok(Math.abs(b.rear - aRear / 2) < 1e-12, "values are the latest call's");
  assert.equal(b.front, 0);
  const seen = new Set();
  for (let i = 0; i < 1320; i++) seen.add(W.phaseStep(i, 1 / 60, W.WHEEL_R, 0.5));
  assert.equal(seen.size, 1, "a 22-car second of frames returns one object");
});

test("phaseStep integrates: N frames at constant v cover v·N·dt / R radians", () => {
  const R = W.WHEEL_R, dt = 0.016, v = 55, N = 120;
  let rear = 0, front = 0;
  for (let i = 0; i < N; i++) {
    const d = W.phaseStep(v, dt, R, 0.25);
    rear = W.wrapPhase(rear + d.rear);
    front = W.wrapPhase(front + d.front);
  }
  const expectRear = W.wrapPhase((v / R) * dt * N);
  const expectFront = W.wrapPhase((v / R) * dt * N * 0.75);
  assert.ok(Math.abs(rear - expectRear) < 1e-9, `rear ${rear} vs ${expectRear}`);
  assert.ok(Math.abs(front - expectFront) < 1e-9, `front ${front} vs ${expectFront}`);
});

test("phaseStep is zero on dt 0 or speed 0; reverse keeps sign; wrapPhase is in [0, 2π)", () => {
  const z0 = W.phaseStep(80, 0, W.WHEEL_R, 0), z1 = W.phaseStep(0, 0.02, W.WHEEL_R, 0);
  assert.equal(z0.rear, 0); assert.equal(z0.front, 0);
  assert.equal(z1.rear, 0); assert.equal(z1.front, 0);
  const back = W.phaseStep(-20, 0.02, W.WHEEL_R, 0);
  assert.ok(back.rear < 0 && back.front < 0);
  assert.ok(W.wrapPhase(-0.1) > 0 && W.wrapPhase(-0.1) < Math.PI * 2);
  assert.ok(Math.abs(Math.sin(W.wrapPhase(-0.1)) - Math.sin(-0.1)) < 1e-12);
  assert.equal(W.wrapPhase(0), 0);
});

test("createGarage rolls by distance/R — same R as phaseStep", () => {
  // A quarter turn of travel must leave cos≈0 on the rotating Y column (matrix[5]).
  const gfx = {
    createMesh: (d) => d,
    freeMesh() {},
    draw(mesh, mat) { this.draws.push({ mesh, mat: Array.from(mat) }); },
    draws: [],
  };
  // Minimal Car3D for prepare()
  const ctx = vm.createContext({
    Math, Float32Array, Array, Object, Number, String, JSON, Map, WeakMap, Set, Infinity, console,
    Car3D: {
      TYRE_BAND: [null, [0.9, 0.8, 0.1]], BRAKE_CALIPER: [null, [1, 0, 0]],
      buildWheelLayers: () => ({ rotating: { kind: "rot" }, fixed: { kind: "fix" } }),
    },
    CarMaterials: { SURFACES: { paint: 1 }, FINISH_SURFACE: {} },
    CarShade: { any: () => false },
    CarGeometry: { weld: (o) => o },
    M4: {
      mulTo(out, a, b) {
        // out = a * b with a = identity → copy b
        for (let i = 0; i < 16; i++) out[i] = b[i];
      },
    },
  });
  vm.runInContext(fs.readFileSync(absSrc("js/car/car-wheels.js"), "utf8").replace(/^const\b/gm, "var"),
    ctx, { filename: absSrc("js/car/car-wheels.js") });
  const wheels = ctx.CarWheels.createGarage(gfx);
  wheels.prepare("t", {}, { tyres: 1, brakes: 1, _visual: {} });
  const base = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  gfx.draws = [];
  wheels.draw(base, ctx.CarWheels.WHEEL_R * (Math.PI / 2), 0, {});
  const rotating = gfx.draws.filter((_, i) => i % 2 === 0);
  assert.ok(rotating.length === 4);
  for (const d of rotating) {
    assert.ok(Math.abs(d.mat[5]) < 1e-6, "quarter-turn: local Y.y (cos) ≈ 0");
    assert.ok(Math.abs(Math.abs(d.mat[6]) - 1) < 1e-6, "quarter-turn: local Y.z (sin) ≈ ±1");
  }
});
