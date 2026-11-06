/* vehicle-tick-alloc.test.mjs — Vehicle scratch bags on the player tick.
 *
 * PlayerForces.step writes Vehicle.grip / Vehicle.wheel and passes those
 * objects through. A rewritten copy of the same step that still builds a
 * fresh literal must produce the same car fields. There is no fallback
 * literal in the shipped file: vehicle.js loads first.
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
const PF = "js/physics/player-forces.js";

const GRIP_SCRATCH = [
  "    const og = Vehicle.grip;",
  "    og.muF = muF; og.csFront = CS_FRONT; og.af = af; og.ar = ar;",
  "    og.braking = braking; og.shaped = Math.sign(steer) * Math.pow(Math.abs(steer), G.STEER_EXPO); og.dt = dt;   // the SHAPED lock (game.js shaped), GripSteer's contract",
  "    const gripped = (typeof GripSteer !== \"undefined\" && GripSteer.forPlayer)",
  "      ? GripSteer.forPlayer(driverDelta, c, og)",
  "      : driverDelta;",
].join("\n");
const GRIP_LITERAL = [
  "    const gripped = (typeof GripSteer !== \"undefined\" && GripSteer.forPlayer)",
  "      ? GripSteer.forPlayer(driverDelta, c, { muF, csFront: CS_FRONT, af, ar, braking, shaped: Math.sign(steer) * Math.pow(Math.abs(steer), G.STEER_EXPO), dt })",
  "      : driverDelta;",
].join("\n");
const WHEEL_SCRATCH = [
  "      const ow = Vehicle.wheel;",
  "      ow.dt = dt; ow.braking = braking; ow.thrOn = thrOn;",
  "      ow.aReqF = -pedal * bF * longBudget;",
  "      ow.aReqR = thrOn ? axThrDemand * LONG_GRIP : -(pedal * bR + engine) * longBudget;",
  "      ow.muLongF = capG * tyreAx.f; ow.muLongR = capG * tyreAx.r;",
  "      ow.slipF = slipF; ow.slipR = slipR; ow.csFront = CS_FRONT; ow.csRear = csR;",
  "      ow.muLatF = muF; ow.muLatR = muR;",
  "      const ws = WheelState.stepPlayer(c, ow);",
].join("\n");
const WHEEL_LITERAL = [
  "      const ws = WheelState.stepPlayer(c, {",
  "        dt, braking, thrOn,",
  "        aReqF: -pedal * bF * longBudget,",
  "        aReqR: thrOn ? axThrDemand * LONG_GRIP : -(pedal * bR + engine) * longBudget,",
  "        muLongF: capG * tyreAx.f, muLongR: capG * tyreAx.r,",
  "        slipF, slipR, csFront: CS_FRONT, csRear: csR, muLatF: muF, muLatR: muR,",
  "      });",
].join("\n");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function literalSource(src) {
  // Each swap must take effect, or the literal arm silently runs the scratch code.
  const grip = src.replace(GRIP_SCRATCH, GRIP_LITERAL);
  assert.notEqual(grip, src, "grip scratch hunk missing");
  const both = grip.replace(WHEEL_SCRATCH, WHEEL_LITERAL);
  assert.notEqual(both, grip, "wheel scratch hunk missing");
  return both;
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

function run(ctx, rel, source) {
  vm.runInContext(source == null ? read(rel) : source, ctx, { filename: absSrc(rel) });
}

function grab(ctx, name) {
  // The name is a lexical global, not a source file. A non-file filename keeps
  // the load out of the filename-less source-load count (vm-filename-lint).
  return vm.runInContext(name, ctx, { filename: "vm-grab" });
}

function loadStack(literal) {
  const ctx = baseCtx();
  for (const f of [
    "js/core/mat4.js",
    "js/physics/consts.js",
    "js/physics/tyre-model.js",
    "js/physics/grip-steer.js",
  ]) run(ctx, f);
  if (!literal) run(ctx, "js/physics/vehicle.js");
  run(ctx, PF, literal ? literalSource(read(PF)) : undefined);
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

const G = {
  PLAYER_GRIP: 1.15, FRONT_GRIP: 0.94, DRIFT: 0,
  YAW_INERTIA: 0.58, YAW_DAMP: 1.0, STEER_EXPO: 2.389,
};

function tyresOf(ctx) {
  return grab(ctx, "TyreModel").create({
    get raceTyreWear() { return "off"; },
    store: { get: () => "off", set: () => {} },
  });
}

test("Vehicle exports only the two scratch bags (forPlayer/stepWheel had no caller; audit4 P3)", () => {
  const ctx = baseCtx();
  run(ctx, "js/physics/vehicle.js");
  const V = grab(ctx, "Vehicle");
  assert.deepEqual(Object.keys(V).sort(), ["grip", "wheel"]);
  assert.equal(V.grip, V.grip);
  assert.notEqual(V.grip, V.wheel);
});

test("WheelState.stepPlayer builds no object literal per tick (pooled axleStep bags; audit4 P2)", () => {
  const src = read("js/physics/wheel-state.js");
  const body = src.slice(src.indexOf("function stepPlayer("), src.indexOf("return Object.freeze"));
  assert.equal(/axleStep\(\s*\{/.test(body), false, "no fresh {vw, kappa} state literal");
  assert.equal(/\{\s*dt\s*,/.test(body), false, "no fresh {dt, vx, ...} params literal");
});

test("player step with the scratch matches the fresh-literal path (grip steer on)", () => {
  const shipped = read(PF);
  assert.equal(shipped.includes("GripSteer.forPlayer(driverDelta, c, {"), false);
  assert.equal(shipped.includes("WheelState.stepPlayer(c, {"), false);
  const off = loadStack(true);
  const on = loadStack(false);
  grab(off, "GripSteer").setLevel(8);
  grab(on, "GripSteer").setLevel(8);
  const stepOff = grab(off, "PlayerForces").create(G).step;
  const stepOn = grab(on, "PlayerForces").create(G).step;
  const tyresOff = tyresOf(off);
  const tyresOn = tyresOf(on);
  const fw = grab(on, "PhysicsConsts").FRONT_WEIGHT;
  const cOff = car();
  const cOn = car();
  for (let i = 0; i < 5; i++) {
    stepOff(cOff, ctxBag(tyresOff, fw));
    stepOn(cOn, ctxBag(tyresOn, fw));
  }
  assert.deepEqual(snap(cOn), snap(cOff));
  const grip = grab(on, "Vehicle").grip;
  assert.equal(grip.dt, DT);
  assert.equal(grip.shaped, Math.pow(0.35, G.STEER_EXPO), "GripSteer gets the shaped lock, not the raw stick (audit4 P1)");
  assert.ok(grip.muF > 0);
});

test("player step reuses the wheel bag when WheelState is on", () => {
  const seen = [];
  const ctx = baseCtx();
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
  const step = grab(ctx, "PlayerForces").create(G).step;
  const tyres = tyresOf(ctx);
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
