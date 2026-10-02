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

function load() {
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
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
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
    dt: DT, delta: 0.05, onThrottle: false, throttleLvl: 0, gearMult: 1,
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
