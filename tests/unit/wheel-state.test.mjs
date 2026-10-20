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
import { absSrc } from "../helpers/abs-src.mjs";

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
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: absSrc(f) });
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

// Demand / capacity are accel units, billed by PlayerForces on the legacy
// LONG_GRIP circle. A dry BB_REF stop sits at ~0.64 of capacity.
const opts = (o) => Object.assign({
  dt: DT, braking: false, thrOn: false, aReqF: 0, aReqR: 0, muLongF: 34, muLongR: 34,
  slipF: 0, slipR: 0, csFront: 130, csRear: 160, muLatF: 14, muLatR: 12,
}, o);

test("a brake demand above the front's capacity locks it (κ → −, wheelLock > 0, shortfall > 0)", () => {
  const { WheelState } = load();
  WheelState.setEnabled(true);
  const c = { speed: 28, vwF: 28, vwR: 28, kappaF: 0, kappaR: 0 };
  let maxLock = 0, minKappaF = 0, short = 0;
  for (let i = 0; i < 30; i++) {
    const r = WheelState.stepPlayer(c, opts({ braking: true, aReqF: -14, aReqR: -8, muLongF: 9, muLongR: 20 }));
    maxLock = Math.max(maxLock, c.wheelLock || 0);
    minKappaF = Math.min(minKappaF, c.kappaF || 0);
    short = r.shortfall;
  }
  assert.ok(minKappaF < -0.2, `expected lockup κF < -0.2, got ${minKappaF}`);
  assert.ok(maxLock > 0.5, `expected wheelLock > 0.5, got ${maxLock}`);
  assert.ok(c.vwF < c.speed - 5, `locked rim slower than body: vwF=${c.vwF} speed=${c.speed}`);
  assert.ok(short > 0.05 && short < 1, `a sliding tyre delivers less than asked: shortfall ${short}`);
});

test("the same demand inside capacity never locks: κ settles at demand/capacity × peak", () => {
  const { WheelState } = load();
  WheelState.setEnabled(true);
  const c = { speed: 55, vwF: 55, vwR: 55, kappaF: 0, kappaR: 0 };
  let r;
  for (let i = 0; i < 60; i++) {
    r = WheelState.stepPlayer(c, opts({ braking: true, aReqF: -0.64 * 34, aReqR: -0.3 * 34 }));
    c.speed -= 20 * DT;   // the body decelerates; the rim must follow it, not lag
  }
  assert.equal(c.wheelLock, 0);
  assert.equal(r.shortfall, 0);
  assert.ok(Math.abs(c.kappaF + 0.064) < 0.004, `κF ${c.kappaF} ≈ −0.064`);
});

test("drive demand above the rear's capacity spins it (κR → +, wheelSpin > 0)", () => {
  const { WheelState } = load();
  WheelState.setEnabled(true);
  const c = { speed: 4, vwF: 4, vwR: 4, kappaF: 0, kappaR: 0 };
  let maxSpin = 0, maxKappaR = 0, short = 0;
  for (let i = 0; i < 30; i++) {
    const r = WheelState.stepPlayer(c, opts({ thrOn: true, aReqR: 21, muLongR: 14 }));
    maxSpin = Math.max(maxSpin, c.wheelSpin || 0);
    maxKappaR = Math.max(maxKappaR, c.kappaR || 0);
    short = r.shortfall;
  }
  assert.ok(maxKappaR > 0.3, `expected wheelspin κR > 0.3, got ${maxKappaR}`);
  assert.ok(maxSpin > 0.5, `expected wheelSpin > 0.5, got ${maxSpin}`);
  assert.ok(c.vwR > c.speed + 1, `spinning rim faster than body: vwR=${c.vwR} speed=${c.speed}`);
  assert.ok(short > 0.2, `shortfall ${short}`);
});

test("an accelerating body under a gripping throttle reads no phantom lock (κR stays +)", () => {
  const { WheelState } = load();
  WheelState.setEnabled(true);
  const c = { speed: 0.5, vwF: 0.5, vwR: 0.5, kappaF: 0, kappaR: 0 };
  let minK = 1;
  for (let i = 0; i < 60; i++) {
    WheelState.stepPlayer(c, opts({ thrOn: true, aReqR: 21 }));
    c.speed += 7 * DT;
    if (i > 5) minK = Math.min(minK, c.kappaR);
  }
  assert.ok(minK > 0, `κR ${minK} went negative while driving`);
  assert.equal(c.wheelSpin, 0);
});

test("combined slip: a cornering rear pays for the same drive with more κ and less lateral grip", () => {
  const { WheelState } = load();
  WheelState.setEnabled(true);
  const run = (slipR) => {
    const c = { speed: 25, vwF: 25, vwR: 25, kappaF: 0, kappaR: 0 };
    let r;
    for (let i = 0; i < 30; i++) r = WheelState.stepPlayer(c, opts({ thrOn: true, aReqR: 21, slipR }));
    return { k: c.kappaR, lat: r.latScaleR, short: r.shortfall };
  };
  const straight = run(0), cornering = run(0.11);
  assert.ok(cornering.k > straight.k + 0.01, `κR straight ${straight.k} cornering ${cornering.k}`);
  assert.ok(cornering.lat < straight.lat - 0.03, `latScaleR straight ${straight.lat} cornering ${cornering.lat}`);
  assert.equal(cornering.short, 0, "still under the combined peak: the drive is delivered");
});

test("a placement (speed step > RESYNC_A·dt) re-syncs the rims instead of reading slip", () => {
  const { WheelState } = load();
  WheelState.setEnabled(true);
  const c = { speed: 60, vwF: 60, vwR: 60, kappaF: 0, kappaR: 0 };
  WheelState.stepPlayer(c, opts({}));
  c.speed = 10;   // jump()
  WheelState.stepPlayer(c, opts({}));
  assert.ok(Math.abs(c.kappaF) < 0.01 && Math.abs(c.kappaR) < 0.01, `κ ${c.kappaF}/${c.kappaR}`);
  assert.equal(c.wheelLock, 0);
});

test("coast / free-roll keeps |κ| small and latScale ≈ 1", () => {
  const { WheelState } = load();
  WheelState.setEnabled(true);
  const c = { speed: 40, vwF: 40, vwR: 40, kappaF: 0, kappaR: 0 };
  const out = WheelState.stepPlayer(c, opts({}));
  assert.ok(Math.abs(c.kappaF) < 0.02, `κF coast ${c.kappaF}`);
  assert.ok(Math.abs(c.kappaR) < 0.02, `κR coast ${c.kappaR}`);
  assert.equal(c.wheelLock, 0);
  assert.equal(c.wheelSpin, 0);
  assert.equal(out.shortfall, 0);
  assert.ok(out.latScaleF > 0.95 && out.latScaleR > 0.95, `latScale ${out.latScaleF}/${out.latScaleR}`);
});

test("past the peak the lateral share is the sliding force's direction, not a 0.05 cliff", () => {
  const { WheelState } = load();
  const part = WheelState.axleStep({ vw: 21 }, { dt: DT, vx: 30, aReq: -30, muLong: 10, alphaN: 0.5 }, {});
  const full = WheelState.axleStep({ vw: 0 }, { dt: DT, vx: 30, aReq: -30, muLong: 10, alphaN: 0.5 }, {});
  assert.ok(part.kappa < -0.25 && part.latScale > 0.1 && part.latScale < 0.5, `κ ${part.kappa} latScale ${part.latScale}`);
  assert.ok(full.kappa <= -0.9 && full.latScale <= 0.08, `a fully locked front does not steer: ${full.latScale}`);
});

test("axleStep runaway brake drives κ negative within ~100 ms", () => {
  const { WheelState } = load();
  const state = { vw: 40 };
  const out = {};
  for (let i = 0; i < 12; i++) {
    WheelState.axleStep(state, {
      dt: DT, vx: 40, aReq: -20,
      muLong: 8, alphaN: 0,
    }, out);
    state.vw = out.vw;
  }
  assert.ok(out.kappa < -0.1, `κ after stamp ${out.kappa}`);
  assert.ok(out.locked > 0.3, `locked ${out.locked}`);
});
