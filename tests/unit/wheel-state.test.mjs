/* wheel-state.test.mjs — js/physics/wheel-state.js (#1628 scoped slice).
 * Pins: default OFF; stamp brake locks at low grip; hard throttle at low
 * speed spins the rear; free-roll κ≈0.
 *
 * Run: node --test tests/unit/wheel-state.test.mjs
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
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  });
  ctx.window = ctx;
  seedLog(ctx);
  for (const f of [
    "js/core/mat4.js",
    "js/physics/consts.js",
    "js/physics/tyre-model.js",
    "js/physics/wheel-state.js",
  ]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  return {
    WheelState: vm.runInContext("WheelState", ctx),
    TyreModel: vm.runInContext("TyreModel", ctx),
  };
}

test("WheelState defaults OFF and exposes axleStep / stepPlayer", () => {
  const { WheelState } = load();
  assert.equal(WheelState.enabled(), false);
  assert.equal(typeof WheelState.axleStep, "function");
  assert.equal(typeof WheelState.stepPlayer, "function");
  assert.equal(typeof WheelState.setEnabled, "function");
});

test("hard brake at low grip locks the front (κ → negative, wheelLock > 0)", () => {
  const { WheelState } = load();
  WheelState.setEnabled(true);
  const c = {
    speed: 28, vwF: 28, vwR: 28, kappaF: 0, kappaR: 0,
    brakeBias: 0.62, human: true,
  };
  let maxLock = 0, minKappaF = 0;
  for (let i = 0; i < 90; i++) {
    WheelState.stepPlayer(c, {
      dt: DT, loadF: 0.55, loadR: 0.45, braking: true, thrOn: false,
      throttleLvl: 0, gearMult: 1, deploy: 0,
      weatherGrip: 0.55, surfaceMu: 0.7, kerbGrip: 1, aeroGrip: 1, tyreMu: 1,
      tyreAx: { f: 1, r: 1 }, slipF: 0.02, slipR: 0.01,
      csFront: 130, csRear: 160, muLatF: 12, muLatR: 11,
      brakeBias: 0.62,
    });
    maxLock = Math.max(maxLock, c.wheelLock || 0);
    minKappaF = Math.min(minKappaF, c.kappaF || 0);
  }
  assert.ok(minKappaF < -0.08, `expected lockup κF < -0.08, got ${minKappaF}`);
  assert.ok(maxLock > 0.25, `expected wheelLock > 0.25, got ${maxLock}`);
  assert.ok(c.vwF < c.speed - 1, `locked rim slower than body: vwF=${c.vwF} speed=${c.speed}`);
});

test("hard throttle at low speed spins the rear (κ → positive, wheelSpin > 0)", () => {
  const { WheelState } = load();
  WheelState.setEnabled(true);
  const c = {
    speed: 8, vwF: 8, vwR: 8, kappaF: 0, kappaR: 0,
    brakeBias: 0.56, human: true,
  };
  let maxSpin = 0, maxKappaR = 0;
  for (let i = 0; i < 90; i++) {
    WheelState.stepPlayer(c, {
      dt: DT, loadF: 0.4, loadR: 0.35, braking: false, thrOn: true,
      throttleLvl: 1, gearMult: 1.1, deploy: 4,
      weatherGrip: 0.7, surfaceMu: 0.85, kerbGrip: 1, aeroGrip: 1, tyreMu: 1,
      tyreAx: { f: 1, r: 1 }, slipF: 0.05, slipR: 0.08,
      csFront: 130, csRear: 160, muLatF: 14, muLatR: 12,
      brakeBias: 0.56,
    });
    maxSpin = Math.max(maxSpin, c.wheelSpin || 0);
    maxKappaR = Math.max(maxKappaR, c.kappaR || 0);
  }
  assert.ok(maxKappaR > 0.08, `expected wheelspin κR > 0.08, got ${maxKappaR}`);
  assert.ok(maxSpin > 0.2, `expected wheelSpin > 0.2, got ${maxSpin}`);
  assert.ok(c.vwR > c.speed + 1, `spinning rim faster than body: vwR=${c.vwR} speed=${c.speed}`);
});

test("coast / free-roll keeps |κ| small and latScale ≈ 1", () => {
  const { WheelState } = load();
  WheelState.setEnabled(true);
  const c = {
    speed: 40, vwF: 40, vwR: 40, kappaF: 0, kappaR: 0,
    brakeBias: 0.56, human: true,
  };
  const out = WheelState.stepPlayer(c, {
    dt: DT, loadF: 0.45, loadR: 0.55, braking: false, thrOn: false,
    throttleLvl: 0, gearMult: 1, deploy: 0,
    weatherGrip: 1, surfaceMu: 1, kerbGrip: 1, aeroGrip: 1, tyreMu: 1,
    tyreAx: { f: 1, r: 1 }, slipF: 0, slipR: 0,
    csFront: 130, csRear: 160, muLatF: 18, muLatR: 16,
    brakeBias: 0.56,
  });
  assert.ok(Math.abs(c.kappaF) < 0.02, `κF coast ${c.kappaF}`);
  assert.ok(Math.abs(c.kappaR) < 0.02, `κR coast ${c.kappaR}`);
  assert.equal(c.wheelLock, 0);
  assert.equal(c.wheelSpin, 0);
  assert.ok(out.latScaleF > 0.95 && out.latScaleR > 0.95, `latScale ${out.latScaleF}/${out.latScaleR}`);
});

test("axleStep runaway brake drives κ negative within ~100 ms", () => {
  const { WheelState } = load();
  const state = { vw: 40 };
  const out = {};
  for (let i = 0; i < 12; i++) {
    WheelState.axleStep(state, {
      dt: DT, vx: 40, aReq: -WheelState.BRAKE_PEDAL,
      muLong: 8, alphaN: 0,
    }, out);
    state.vw = out.vw;
  }
  assert.ok(out.kappa < -0.1, `κ after stamp ${out.kappa}`);
  assert.ok(out.locked > 0.3, `locked ${out.locked}`);
});
