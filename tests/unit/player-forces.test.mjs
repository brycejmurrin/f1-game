/* player-forces.test.mjs — js/physics/player-forces.js, the human combined-slip
 * / grip-circle / Fy / yaw integrate carve (carve-headroom Slice A, 2026-09-30).
 * Pins what characterization cannot see alone:
 *
 *   - MODULE SURFACE. create(G) returns step + tyreSat; missing the extract
 *     leaves game.js calling an undefined PlayerForces (this test fails first).
 *   - tyreSat SIGN. Lateral force opposes slip (negative of mu·curve); a sign
 *     flip is a silent invert of the whole player model.
 *   - step WIRING. With wear off and neutral ctx, one step writes axFrac /
 *     gripFront / forceFront / yawRateCur without NaN — the call-site contract.
 *
 * Run: node --test tests/unit/player-forces.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DT = 1 / 60;

function load(legacyRearCue = false) {
  const ctx = vm.createContext({
    Math, JSON, Object, Array, Number, isNaN, isFinite, console,
  });
  ctx.window = ctx;
  seedLog(ctx);
  // Minimal SetupTune so step can resolve brake bias / roll balance.
  ctx.SetupTune = {
    BB_REF: 0.56,
    bbScales: () => ({ f: 1, r: 1 }),
    axleGrip: () => ({ f: 1, r: 1 }),
  };
  ctx.DebrisWorld = { active: () => false, marbleGrip: () => 1, tyreMarble: () => {} };
  ctx.Input = { vibrate: () => {}, rumble: () => {} };
  for (const f of [
    "js/core/mat4.js",
    "js/physics/consts.js",
    "js/physics/tyre-model.js",
    "js/physics/player-forces.js",
  ]) {
    let source = fs.readFileSync(path.join(ROOT, f), "utf8");
    if (legacyRearCue && f.endsWith("player-forces.js")) source = source.replace("pastF = sat / TyreModel.CURVE_PEAK_X_F;", "pastF = sat / TyreModel.CURVE_PEAK_X;");
    vm.runInContext(source, ctx, { filename: f });
  }
  return {
    ctx,
    PlayerForces: vm.runInContext("PlayerForces", ctx),
    TyreModel: vm.runInContext("TyreModel", ctx),
    PhysicsConsts: vm.runInContext("PhysicsConsts", ctx),
  };
}

test("PlayerForces.create exposes step and tyreSat", () => {
  const { PlayerForces } = load();
  assert.equal(typeof PlayerForces, "object");
  assert.equal(typeof PlayerForces.create, "function");
  assert.equal(typeof PlayerForces.tyreSat, "function");
  const G = {
    PLAYER_GRIP: 1.15, FRONT_GRIP: 0.94, DRIFT: 0,
    YAW_INERTIA: 0.58, YAW_DAMP: 1.0,
  };
  const api = PlayerForces.create(G);
  assert.equal(typeof api.step, "function");
  assert.equal(typeof api.tyreSat, "function");
});

test("tyreSat opposes slip (negative of mu · lateralCurve)", () => {
  const { PlayerForces } = load();
  const mu = 20, cs = 12, a = 0.1;
  const Fy = PlayerForces.tyreSat(cs, a, mu);
  assert.ok(Number.isFinite(Fy), "finite");
  // Positive slip → negative lateral force (standard bicycle sign).
  assert.ok(Fy < 0, `expected Fy < 0 for +slip, got ${Fy}`);
  const FyNeg = PlayerForces.tyreSat(cs, -a, mu);
  assert.ok(FyNeg > 0, `expected Fy > 0 for -slip, got ${FyNeg}`);
  assert.ok(Math.abs(Fy + FyNeg) < 1e-9, "odd in slip");
});

test("step writes axle/force/yaw fields without NaN (wear off)", () => {
  const { PlayerForces, TyreModel, PhysicsConsts } = load();
  const G = {
    PLAYER_GRIP: 1.15, FRONT_GRIP: 0.94, DRIFT: 0,
    YAW_INERTIA: 0.58, YAW_DAMP: 1.0,
  };
  const api = PlayerForces.create(G);
  const tyres = TyreModel.create({
    get raceTyreWear() { return "off"; },
    store: { get: () => "off", set: () => {} },
  });
  const c = {
    human: true, isPlayer: false, speed: 40, axEstSm: 0, aeroX: 0, wake: 0,
    vLat: 0, yawRateCur: 0, head: 0, brakeStab: 1, rearUtil: 0,
    brakeBias: null, rollBalance: 0.5, lateralAccel: 0, offroad: false,
    tread: 0, flatSpot: 0,
  };
  // Neutral straight-line coast: no throttle/brake, small steer angle.
  const L = 3.2, FRONT_WEIGHT = PhysicsConsts.FRONT_WEIGHT;
  const ar = FRONT_WEIGHT * L, af = L - ar;
  api.step(c, {
    dt: DT, driverDelta: 0.05, assistDelta: 0, lineDelta: 0,
    onThrottle: false, throttleLvl: 0, gearMult: 1,
    deploy: 0, braking: false, surfaceMu: 1, kerbGrip: 1, bankMu: 1,
    modsCornering: 1, loadF: FRONT_WEIGHT, loadR: 1 - FRONT_WEIGHT,
    vertLoad: 0, af, ar, sp: 1, steer: 0.2,
    weatherGrip: 1, aeroDf: 1, dirtyMul: 1, coastCut: 0,
    vTopNow: 72, tyres,
  });
  for (const k of ["axFrac", "axFracF", "axFracR", "gripFront", "gripRear",
    "forceFront", "forceRear", "slipFront", "slipRear", "lateralAccel",
    "yawRateCur", "vLat", "head", "frontUtil", "rearUtil", "slipFactor"]) {
    assert.ok(Number.isFinite(c[k]), `${k} must be finite, got ${c[k]}`);
  }
  assert.ok(c.gripFront > 0 && c.gripRear > 0, "axle grip positive");
  // Small positive steer → nose should start yawing right (+yawRate) or the
  // force pair should be non-zero — either way the model engaged.
  assert.ok(c.forceFront !== 0 || c.forceRear !== 0, "tyres produced force");
});

test("brake-to-reverse does not snap front slip by ~2·steer (dirS blend)", () => {
  // Fail-before: hard `speed < 0 ? -1 : 1` jumped slipFront by ≈ 2·δ when the
  // car crossed standstill with lock held (game-vm: −0.182 → +0.491 at δ≈0.34).
  const { PlayerForces, TyreModel, PhysicsConsts } = load();
  const G = {
    PLAYER_GRIP: 1.15, FRONT_GRIP: 0.94, DRIFT: 0,
    YAW_INERTIA: 0.58, YAW_DAMP: 1.0,
  };
  const api = PlayerForces.create(G);
  const tyres = TyreModel.create({
    get raceTyreWear() { return "off"; },
    store: { get: () => "off", set: () => {} },
  });
  const L = 3.2, FRONT_WEIGHT = PhysicsConsts.FRONT_WEIGHT;
  const ar = FRONT_WEIGHT * L, af = L - ar;
  const delta = 0.34;
  function slipAt(speed) {
    const c = {
      human: true, isPlayer: false, speed, axEstSm: -8, aeroX: 0, wake: 0,
      vLat: 0, yawRateCur: 0.25, head: 0, brakeStab: 1, rearUtil: 0.4,
      brakeBias: null, rollBalance: 0.5, lateralAccel: 0, offroad: false,
      tread: 0, flatSpot: 0,
    };
    api.step(c, {
      dt: DT, driverDelta: delta, assistDelta: 0, lineDelta: 0,
      onThrottle: false, throttleLvl: 0, gearMult: 1,
      deploy: 0, braking: true, surfaceMu: 1, kerbGrip: 1, bankMu: 1,
      modsCornering: 1, loadF: FRONT_WEIGHT + 0.1, loadR: 1 - FRONT_WEIGHT - 0.1,
      vertLoad: 0, af, ar, sp: Math.min(1, Math.abs(speed) / 3), steer: 1,
      weatherGrip: 1, aeroDf: 1, dirtyMul: 1, coastCut: 0,
      vTopNow: 72, tyres,
    });
    return c.slipFront;
  }
  const s0 = slipAt(0);
  const sRev = slipAt(-0.083);
  const dSlip = Math.abs(sRev - s0);
  // Hard flip costs ≈ 2·δ (~0.68). Soft blend over 1 m/s costs ≈ δ·0.083 (~0.03).
  assert.ok(dSlip < 0.15,
    `slipFront jump across standstill must stay small; got Δ=${dSlip.toFixed(4)} (s0=${s0.toFixed(4)}, sRev=${sRev.toFixed(4)})`);
  // Still reverses the steer contribution once fully in reverse.
  const sFull = slipAt(-2);
  assert.ok(Math.sign(sFull - s0) !== 0 || Math.abs(sFull - s0) > 0.2,
    "full reverse must still flip the steer term relative to standstill");
  assert.ok(Math.abs(sFull - slipAt(2)) > Math.abs(delta),
    "forward vs reverse at |v|≥DIR_BLEND must differ by about 2·δ");
});

test("NaN driverDelta or non-finite dt must not poison car state", () => {
  // M4.clamp passes NaN (comparisons are false). A NaN driverDelta used to
  // write NaN into vLat / yawRateCur / head for the rest of the session.
  const { PlayerForces, TyreModel, PhysicsConsts } = load();
  const G = {
    PLAYER_GRIP: 1.15, FRONT_GRIP: 0.94, DRIFT: 0,
    YAW_INERTIA: 0.58, YAW_DAMP: 1.0,
  };
  const api = PlayerForces.create(G);
  const tyres = TyreModel.create({
    get raceTyreWear() { return "off"; },
    store: { get: () => "off", set: () => {} },
  });
  const L = 3.2, FRONT_WEIGHT = PhysicsConsts.FRONT_WEIGHT;
  const ar = FRONT_WEIGHT * L, af = L - ar;
  const baseCtx = {
    assistDelta: 0, lineDelta: 0,
    onThrottle: false, throttleLvl: 0, gearMult: 1,
    deploy: 0, braking: false, surfaceMu: 1, kerbGrip: 1, bankMu: 1,
    modsCornering: 1, loadF: FRONT_WEIGHT, loadR: 1 - FRONT_WEIGHT,
    vertLoad: 0, af, ar, sp: 1, steer: 0.2,
    weatherGrip: 1, aeroDf: 1, dirtyMul: 1, coastCut: 0,
    vTopNow: 72, tyres,
  };
  function car() {
    return {
      human: true, isPlayer: false, speed: 40, axEstSm: 0, aeroX: 0, wake: 0,
      vLat: 1.5, yawRateCur: 0.2, head: 0.1, brakeStab: 1, rearUtil: 0,
      brakeBias: null, rollBalance: 0.5, lateralAccel: 0, offroad: false,
      tread: 0, flatSpot: 0,
    };
  }
  const cBad = car();
  api.step(cBad, { ...baseCtx, dt: DT, driverDelta: NaN });
  for (const k of ["vLat", "yawRateCur", "head", "slipFront", "gripFront"]) {
    assert.ok(Number.isFinite(cBad[k]), `NaN driverDelta poisoned ${k}=${cBad[k]}`);
  }
  const cSkip = car();
  const before = { vLat: cSkip.vLat, yawRateCur: cSkip.yawRateCur, head: cSkip.head };
  api.step(cSkip, { ...baseCtx, dt: NaN, driverDelta: 0.05 });
  assert.equal(cSkip.vLat, before.vLat, "non-finite dt must skip the integrate");
  assert.equal(cSkip.yawRateCur, before.yawRateCur);
  assert.equal(cSkip.head, before.head);
});

test('coach telemetry records the applied wake loss and assistance without changing forces', () => {
  const { PlayerForces, TyreModel, PhysicsConsts: P } = load();
  const api = PlayerForces.create({ PLAYER_GRIP: 1.15, FRONT_GRIP: .94, DRIFT: 0, YAW_INERTIA: .58, YAW_DAMP: 1 });
  const tyres = TyreModel.create({ raceTyreWear: 'off', store: { get: () => 'off', set() {} } });
  const ctx = { dt: DT, driverDelta: .05, assistDelta: .02, lineDelta: 0, onThrottle: true, throttleLvl: .5,
    gearMult: 1, deploy: 0, braking: false, surfaceMu: 1, kerbGrip: 1, bankMu: 1, modsCornering: 1,
    loadF: P.FRONT_WEIGHT, loadR: 1 - P.FRONT_WEIGHT, vertLoad: 0, af: (1 - P.FRONT_WEIGHT) * 3.2,
    ar: P.FRONT_WEIGHT * 3.2, sp: 1, steer: .2, weatherGrip: 1, aeroDf: 1, dirtyMul: .9,
    coastCut: 0, vTopNow: 72, tyres };
  const car = { human: true, isPlayer: false, speed: 40, axEstSm: 0, aeroX: 0, wake: .8,
    vLat: 0, yawRateCur: 0, head: 0, brakeStab: 1, rearUtil: 0, brakeBias: null, rollBalance: .5,
    lateralAccel: 0, offroad: false, tread: 0, flatSpot: 0 };
  api.step(car, ctx);
  assert.equal(car._dirtyAirMul, .9); assert.equal(car._coachAssisted, true);
  const grip = car._aeroGrip;
  ctx.dirtyMul = 1; ctx.assistDelta = 0; api.step(car, ctx);
  assert.equal(car._dirtyAirMul, 1); assert.equal(car._coachAssisted, false);
  assert.ok(Math.abs(grip - (1 + P.DOWNFORCE * (40 / 72) ** 2) * .9) < 1e-12, 'telemetry is the multiplier actually used');
});


test("rear cue compares each axle to its own edge without changing any force integration", () => {
  function run(driverDelta, legacy, modsBraking = 1) {
    const { ctx, PlayerForces, PhysicsConsts: pc } = load(legacy), events = [];
    ctx.Input.rumble = (...args) => events.push(args);
    const car = { human: true, isPlayer: true, speed: 40, axEstSm: 0, aeroX: 0, wake: 0, vLat: 9.8, yawRateCur: 0, head: 0, brakeStab: 1, rearUtil: 0, brakeBias: .56, rollBalance: .5, lateralAccel: 0, offroad: false, tread: 0, flatSpot: 0 };
    PlayerForces.create({ PLAYER_GRIP: 1.15, FRONT_GRIP: .94, DRIFT: 0, YAW_INERTIA: .58, YAW_DAMP: 1 }).step(car, {
      dt: DT, driverDelta, assistDelta: 0, lineDelta: 0, onThrottle: false, throttleLvl: 0, gearMult: 1, deploy: 0, braking: false,
      surfaceMu: 1, kerbGrip: 1, bankMu: 1, modsCornering: 1, modsBraking, loadF: pc.FRONT_WEIGHT, loadR: 1 - pc.FRONT_WEIGHT,
      vertLoad: 0, af: 3.2 * (1 - pc.FRONT_WEIGHT), ar: 3.2 * pc.FRONT_WEIGHT, sp: 1, steer: .5,
      weatherGrip: 1, aeroDf: 1, dirtyMul: 1, coastCut: 0, vTopNow: 72, tyres: { gripMul: () => 1, axleSplit: () => ({ f: 1, r: 1 }) },
    });
    return { events: events.filter((e) => e[2] === "throttle"), force: [car.forceFront, car.forceRear, car.yawRateCur, car.vLat, car.head], car };
  }
  const old = run(.08, true), corrected = run(.08, false);
  assert.equal(old.events.length, 1, "counterexample exercised the old rear cue");
  assert.equal(corrected.events.length, 0, "front further beyond its own peak must not trigger the rear discriminator");
  assert.deepEqual(corrected.force, old.force, "feedback correction changes no force or yaw number");
  const rear = run(.16, false), oldRear = run(.16, true);
  assert.equal(rear.events.length, 1, "genuine rear-dominant state retains the cue");
  assert.deepEqual(rear.events, oldRear.events);
  assert.deepEqual(rear.force, oldRear.force);
  assert.equal(corrected.car._cueConditionGrip, 1, "read-only capacity telemetry is neutral in dry fresh conditions");
  const weakBrakes = run(.16, false, .5);
  assert.equal(weakBrakes.car._cueBraking, .5);
  assert.deepEqual(weakBrakes.force, rear.force, "advisory braking-capacity field cannot feed forces");
});
