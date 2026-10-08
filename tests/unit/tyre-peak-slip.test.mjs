/**
 * Front lateral curve peak slip (tyre-model.js lateralCurve default path).
 * Rear explicit _R args must stay bit-identical to tip.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEG = 180 / Math.PI;

function load() {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, JSON, isFinite });
  seedLog(ctx);
  ctx.window = ctx;
  for (const f of ["js/core/mat4.js", "js/physics/consts.js", "js/physics/tyre-model.js"]) {
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  return { TM: vm.runInContext("TyreModel", ctx), PC: vm.runInContext("PhysicsConsts", ctx) };
}

const { TM, PC } = load();
const CS = PC.CS_FRONT;
const front = (x) => TM.lateralCurve(x);
const rear = (x) => TM.lateralCurve(x, TM.CURVE_FLOOR_R, TM.CURVE_FALL_W_R, TM.CURVE_HOLD_R);

test("front peak abscissa is below π/2 and exported util divisor unchanged", () => {
  assert.equal(TM.CURVE_PEAK_X, Math.PI / 2);
  assert.ok(TM.CURVE_PEAK_X_F > 0 && TM.CURVE_PEAK_X_F < TM.CURVE_PEAK_X);
  assert.ok(Math.abs(front(TM.CURVE_PEAK_X_F) - 1) < 1e-6, "peak force magnitude still 1");
});

test("front peak slip angle sits in 6–9° for representative μ at the limit", () => {
  const peakX = TM.CURVE_PEAK_X_F;
  const alphaOldDeg = 10.5;
  const alphaNomDeg = alphaOldDeg * (peakX / TM.CURVE_PEAK_X);
  const muRep = (CS * ((alphaOldDeg * Math.PI) / 180)) / TM.CURVE_PEAK_X;
  for (const scale of [0.75, 1, 1.06]) {
    const mu = muRep * scale;
    const alphaDeg = alphaNomDeg * scale;
    assert.ok(alphaDeg >= 6 && alphaDeg <= 9.05, `μ=${mu.toFixed(2)} → α_peak=${alphaDeg.toFixed(2)}°`);
  }
});

test("rear path bit-identical to sin/plateau/fall reference across x sweep", () => {
  const ref = (x) => {
    const ax = Math.abs(x);
    if (ax <= TM.CURVE_PEAK_X) return Math.sin(x);
    if (ax <= TM.CURVE_HOLD_R) return x < 0 ? -1 : 1;
    const d = (ax - TM.CURVE_HOLD_R) / TM.CURVE_FALL_W_R;
    const g = TM.CURVE_FLOOR_R + (1 - TM.CURVE_FLOOR_R) * Math.exp(-d * d);
    return x < 0 ? -g : g;
  };
  for (let i = -400; i <= 400; i++) {
    const x = i * 0.025;
    assert.equal(rear(x), ref(x), `rear mismatch at x=${x}`);
  }
});

test("front curve: monotonic to peak, C¹ at peak, non-negative, no oscillation", () => {
  const samples = [];
  for (let i = 0; i <= 50; i++) samples.push(front((i * TM.CURVE_PEAK_X_F) / 50));
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i] >= samples[i - 1] - 1e-9, `not monotonic up to peak at i=${i}`);
    assert.ok(samples[i] >= 0, "negative force");
  }
  const h = 1e-5;
  const dLeft = (front(TM.CURVE_PEAK_X_F) - front(TM.CURVE_PEAK_X_F - h)) / h;
  const dRight = (front(TM.CURVE_PEAK_X_F + h) - front(TM.CURVE_PEAK_X_F)) / h;
  assert.ok(Math.abs(dLeft) < 0.02 && Math.abs(dRight) < 0.02, "C¹ at peak");
  let last = front(TM.CURVE_PEAK_X_F);
  for (let x = TM.CURVE_PEAK_X_F + 0.05; x <= 8; x += 0.05) {
    const v = front(x);
    assert.ok(v >= 0 && v <= last + 1e-9, `oscillation past peak at x=${x}`);
    last = v;
  }
});
