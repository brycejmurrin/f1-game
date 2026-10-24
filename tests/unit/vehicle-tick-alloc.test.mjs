/* vehicle-tick-alloc.test.mjs — Vehicle scratch bags on the player tick.
 *
 * PlayerForces.step used to allocate an options object every physics step for
 * GripSteer.forPlayer, and another for WheelState.stepPlayer when that model
 * is on. Vehicle owns both bags. Numbers must match the fresh-literal path.
 *
 * Run: node --test tests/unit/vehicle-tick-alloc.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DT = 1 / 60;

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function baseCtx() {
  const ctx = vm.createContext({
    Math, JSON, Object, Array, Number, isNaN, isFinite, console,
  });
  ctx.window = ctx;
  seedLog(ctx);
  ctx.SetupTune = {
    BB_REF: 0.56,
    bbScales: () => ({ f: 1, r: 1 }),
    axleGrip: () => ({ f: 1, r: 1 }),
  };
  ctx.DebrisWorld = { active: () => false, marbleGrip: () => 1, tyreMarble: () => {} };
  ctx.Input = { vibrate: () => {}, rumble: () => {} };
  return ctx;
}

function run(ctx, rel) {
  vm.runInContext(read(rel), ctx, { filename: absSrc(rel) });
}

function grab(ctx, name) {
  return vm.runInContext(name, ctx);
}

function loadStack(withVehicle) {
  const ctx = baseCtx();
  for (const f of [
    "js/core/mat4.js",
    "js/physics/consts.js",
    "js/physics/tyre-model.js",
    "js/physics/grip-steer.js",
  ]) run(ctx, f);
  if (withVehicle) run(ctx, "js/physics/vehicle.js");
  run(ctx, "js/physics/player-forces.js");
  return ctx;
}

const FIELDS = [
  "axFrac", "axFracF", "axFracR", "gripFront", "gripRear",
  "forceFront", "forceRear", "slipFront", "slipRear", "lateralAccel",
  "yawRateCur", "vLat", "head", "frontUtil", "rearUtil", "slipFactor",
  "speed", "gripSteerCapSm",
];

function car() {
  return {
    human: true, isPlayer: false, speed: 40, axEstSm: 0, aeroX: 0, wake: 0,
    vLat: 0.4, yawRateCur: 0.15, head: 0.2, brakeStab: 1, rearUtil: 0,
    brakeBias: null, rollBalance: 0.5, lateralAccel: 0.2, offroad: false,
    tread: 0, flatSpot: 0, gripSteerCapSm: 0,
  };
}

function ctxBag(tyres, frontWeight) {
  const L = 3.2;
  const ar = frontWeight * L;
  const af = L - ar;
  return {
    dt: DT, driverDelta: 0.22, assistDelta: 0, lineDelta: 0,
    onThrottle: true, throttleLvl: 0.6, gearMult: 1,
    deploy: 0, braking: false, surfaceMu: 1, kerbGrip: 1, bankMu: 1,
    modsCornering: 1, loadF: frontWeight, loadR: 1 - frontWeight,
    vertLoad: 0, af, ar, sp: 1, steer: 0.35,
    weatherGrip: 1, aeroDf: 1, dirtyMul: 1, coastCut: 0,
    vTopNow: 72, tyres,
  };
}

function snap(c) {
  const out = {};
  for (const k of FIELDS) out[k] = c[k];
  return out;
}

test("grip and wheel bags are stable scratch objects", () => {
  const ctx = baseCtx();
  run(ctx, "js/physics/vehicle.js");
  const V = grab(ctx, "Vehicle");
  assert.equal(V.grip, V.grip);
  assert.equal(V.wheel, V.wheel);
  assert.notEqual(V.grip, V.wheel);
  const seen = [];
  ctx.GripSteer = {
    forPlayer(delta, c, opts) {
      seen.push(opts);
      return delta - 0.01;
    },
  };
  const c = { gripSteerCapSm: 0 };
  V.grip.muF = 18;
  V.grip.csFront = 130;
  V.grip.dt = DT;
  assert.equal(V.forPlayer(0.3, c), 0.29);
  V.grip.muF = 19;
  assert.equal(V.forPlayer(0.3, c), 0.29);
  assert.equal(seen.length, 2);
  assert.equal(seen[0], V.grip);
  assert.equal(seen[1], V.grip);
  assert.equal(seen[0].muF, 19, "the second fill is what the callee reads");
});

test("stepWheel forwards the same wheel bag", () => {
  const ctx = baseCtx();
  ctx.WheelState = {
    stepPlayer(c, opts) {
      seen.push(opts);
      return { latScaleF: 0.9, latScaleR: 0.8, shortfall: 0.1 };
    },
  };
  const seen = [];
  run(ctx, "js/physics/vehicle.js");
  const V = grab(ctx, "Vehicle");
  V.wheel.dt = DT;
  V.wheel.aReqF = -3;
  const a = V.stepWheel({ speed: 10 });
  V.wheel.aReqF = -4;
  const b = V.stepWheel({ speed: 11 });
  assert.equal(a.latScaleF, 0.9);
  assert.equal(b.shortfall, 0.1);
  assert.equal(seen[0], V.wheel);
  assert.equal(seen[1], V.wheel);
  assert.equal(seen[1].aReqF, -4);
});

test("player step with the scratch matches the fresh-literal path (grip steer on)", () => {
  const off = loadStack(false);
  const on = loadStack(true);
  grab(off, "GripSteer").setLevel(8);
  grab(on, "GripSteer").setLevel(8);
  const G = {
    PLAYER_GRIP: 1.15, FRONT_GRIP: 0.94, DRIFT: 0,
    YAW_INERTIA: 0.58, YAW_DAMP: 1.0,
  };
  const stepOff = grab(off, "PlayerForces").create(G).step;
  const stepOn = grab(on, "PlayerForces").create(G).step;
  const tyresOff = grab(off, "TyreModel").create({
    get raceTyreWear() { return "off"; },
    store: { get: () => "off", set: () => {} },
  });
  const tyresOn = grab(on, "TyreModel").create({
    get raceTyreWear() { return "off"; },
    store: { get: () => "off", set: () => {} },
  });
  const fw = grab(off, "PhysicsConsts").FRONT_WEIGHT;
  const cOff = car();
  const cOn = car();
  for (let i = 0; i < 5; i++) {
    stepOff(cOff, ctxBag(tyresOff, fw));
    stepOn(cOn, ctxBag(tyresOn, fw));
  }
  assert.deepEqual(snap(cOn), snap(cOff));
  const grip = grab(on, "Vehicle").grip;
  assert.equal(grip.dt, DT);
  assert.equal(grip.shaped, 0.35);
  assert.ok(grip.muF > 0);
});

test("player step reuses the wheel bag when WheelState is on", () => {
  const ctx = baseCtx();
  const seen = [];
  ctx.WheelState = {
    enabled: () => true,
    stepPlayer(c, opts) {
      seen.push(opts);
      return { latScaleF: 1, latScaleR: 1, shortfall: 0 };
    },
  };
  for (const f of [
    "js/core/mat4.js",
    "js/physics/consts.js",
    "js/physics/tyre-model.js",
    "js/physics/grip-steer.js",
    "js/physics/vehicle.js",
    "js/physics/player-forces.js",
  ]) run(ctx, f);
  const G = {
    PLAYER_GRIP: 1.15, FRONT_GRIP: 0.94, DRIFT: 0,
    YAW_INERTIA: 0.58, YAW_DAMP: 1.0,
  };
  const step = grab(ctx, "PlayerForces").create(G).step;
  const tyres = grab(ctx, "TyreModel").create({
    get raceTyreWear() { return "off"; },
    store: { get: () => "off", set: () => {} },
  });
  const c = car();
  const bag = ctxBag(tyres, grab(ctx, "PhysicsConsts").FRONT_WEIGHT);
  step(c, bag);
  step(c, bag);
  const wheel = grab(ctx, "Vehicle").wheel;
  assert.equal(seen.length, 2);
  assert.equal(seen[0], wheel);
  assert.equal(seen[1], wheel);
  assert.equal(seen[1].dt, DT);
  assert.ok(Number.isFinite(c.yawRateCur));
});
