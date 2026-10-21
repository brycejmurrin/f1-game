/* input-clock-rotate.test.mjs — the hit-stop steering clock (Input.setTimeScale) and the
   rotation reset (onScreenRotate), neither entered by a unit test before (B·H11 coverage, 2026-10-21). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot } from "../helpers/key-binds-rig.mjs";

// Live-path keyboard steer after `ms` of a held RIGHT arrow, on a clock the test owns.
function rampAfter(ms, scale) {
  const { Input, key, sb } = boot();
  let t = 1000;
  sb.performance = { now: () => t };
  if (scale !== undefined) Input.setTimeScale(scale);
  key("ArrowRight", true);
  Input.steer();                     // first sample: dt 0
  t += ms;
  return Input.steer();
}

test("hit-stop slows the live steering ramp with the sim clock; bad scales fall back to 1", () => {
  const full = rampAfter(50), slow = rampAfter(50, 0.15);
  assert.ok(full > 0.05, "a held arrow moves the wheel in 50 ms: " + full);
  assert.ok(slow > 0 && slow < full * 0.5, `at 0.15x the wheel travels far less: ${slow} vs ${full}`);
  for (const bad of [0, -1, NaN, Infinity, "0.5"]) assert.equal(rampAfter(50, bad), full, "ignored: " + String(bad));
  assert.equal(rampAfter(50, 5), full, "capped at 1: hit-stop never speeds the wheel up");
});

test("the fixed-step ramp (Input.steer(stepDt)) is the sim's own clock and ignores the time scale", () => {
  const step = (scale) => {
    const { Input, key } = boot();
    if (scale !== undefined) Input.setTimeScale(scale);
    key("ArrowRight", true);
    let v = 0;
    for (let i = 0; i < 3; i++) v = Input.steer(1 / 60);
    return v;
  };
  assert.equal(step(0.15), step(), "game.js already scales the step it passes");
});

test("a screen rotation restarts the tilt filter but keeps the calibrated zero", () => {
  const { Input, sb, fire } = boot();
  let t = 1000;
  sb.performance = { now: () => t };
  const roll = (deg, n = 20) => { let v = 0; for (let i = 0; i < n; i++) { t += 16; Input.remoteSample({ source: "phone", roll: deg, thr: 0, brk: 0 }); v = Input.steer(); } return v; };
  roll(10, 5);
  Input.calibrate();                 // neutral = 10°
  const leaning = roll(30);
  assert.ok(leaning > 0.2, "a 20° lean past neutral steers: " + leaning);
  fire("orientationchange");
  t += 16; Input.remoteSample({ source: "phone", roll: 10, thr: 0, brk: 0 });
  const after = Input.steer();
  assert.ok(Math.abs(after) < 0.02, `the filter restarts on the new axis instead of easing in from the old lean (${leaning}): ` + after);
  assert.ok(Math.abs(roll(10)) < 0.02, "the calibrated neutral survived the rotation");
});
