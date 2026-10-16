/* touch-drag-speed.test.mjs — the drag range sheds lock with speed the way a
 * held arrow sheds rate.
 *
 * digitalRateIn() already slows keys and on-screen arrows as currentSpeedStd()
 * rises. touchRangePx() was a fixed fraction of the long screen edge, so the
 * flick that placed the car in a hairpin was the same flick at the end of a
 * straight. The range now widens by that same fraction. At rest it is exactly
 * the old range.
 *
 * Run: node --test tests/unit/touch-drag-speed.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var");

function boot() {
  const listeners = {};
  const clock = { t: 0 };
  const el = () => ({
    addEventListener() {}, removeEventListener() {}, style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {}, children: [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }),
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false,
  });
  const sb = {
    Math, Object, Array, Number, isFinite, JSON, Map, Set, Date,
    innerWidth: 1000, innerHeight: 500,
    performance: { now: () => clock.t }, DeviceOrientationEvent: function DeviceOrientationEvent() {},
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
    removeEventListener() {}, setTimeout: () => 0, clearTimeout() {},
    navigator: {}, screen: {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    document: {
      addEventListener: (t, f) => { (listeners[t] ||= []).push(f); }, removeEventListener() {},
      getElementById: el, querySelector: el, querySelectorAll: () => [], hidden: false,
      body: { classList: { add() {}, remove() {}, toggle() {} } },
    },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(read("js/core/mat4.js"), ctx, { filename: "js/core/mat4.js" });
  for (const f of ["js/input/tilt-roll.js", "js/input/bindings.js", "js/input/pad-menu.js", "js/input/haptics.js", "js/input/hold-buttons.js", "js/input/input.js"])
    vm.runInContext(read(f), ctx, { filename: f });
  const Input = vm.runInContext("Input", ctx);
  const canvasL = {};
  const canvas = Object.assign(el(), { addEventListener: (t, f) => { (canvasL[t] ||= []).push(f); } });
  Input.init(canvas);
  const onCanvas = (t, e) => (canvasL[t] || []).forEach((f) => f(Object.assign({ preventDefault() {} }, e)));
  return { Input, onCanvas };
}

const REF = 41.7;
const DEAD = 5;
// 1000 × 0.12. The long edge is innerWidth here.
const BASE = 120;

function arm(speed, { adapt = 1, touch = 1, ref = REF } = {}) {
  const r = boot();
  r.Input.reset();
  r.Input.setSteerMode("touch");
  r.Input.setDragSmoothing(0);
  r.Input.setAnalogSpeedMix(0);
  r.Input.setSteerSpeedRef(ref);
  r.Input.setAdaptiveButtons(adapt);
  r.Input.setTouchSpeedMix(touch);
  r.Input.setSpeedStd(speed);
  return r;
}

function rangeAt(speed, opts) {
  return arm(speed, opts).Input.debugState().touchRangePx;
}

test("OPT-IN: with no DRAG AT SPEED choice the range is the tip's fixed range at rest and at 300 km/h", () => {
  // Shipped defaults: no setTouchSpeedMix call, ADAPTIVE BUTTONS at its own
  // default. The ship tip's touchRangePx() is max(40, long edge × 0.12) at
  // every speed, so an existing player must read BASE at both ends.
  for (const speed of [0, 300 / 3.6]) {
    const r = boot();
    r.Input.reset();
    r.Input.setSteerMode("touch");
    r.Input.setSpeedStd(speed);
    const st = r.Input.debugState();
    assert.equal(st.touchSpeedMix, 0, "the speed-sensitive range is off by default");
    assert.equal(st.touchRangePx, BASE, `range at ${(speed * 3.6).toFixed(0)} km/h is the tip's ${BASE}px, got ${st.touchRangePx}`);
  }
});

test("at rest the drag range is the old fixed fraction, with the assist on or off", () => {
  const off = rangeAt(0, { adapt: 0, touch: 0 });
  const on = rangeAt(0, { adapt: 1, touch: 1 });
  const knobOnly = rangeAt(0, { adapt: 0, touch: 1 });
  assert.equal(off, BASE, `static range is long edge × 0.12, got ${off}`);
  assert.equal(on, off, "speed 0 with both mixes full is the same range");
  assert.equal(knobOnly, off, "ADAPTIVE BUTTONS off keeps the static range at rest");
});

test("mid speed doubles the range when the assist is full on, high speed widens it further", () => {
  const rest = rangeAt(0, { adapt: 1, touch: 1 });
  const mid = rangeAt(REF, { adapt: 1, touch: 1 });
  const high = rangeAt(90, { adapt: 1, touch: 1 });
  // digitalRateIn at v = ref is KEY_RAMP_IN / 2, so the range doubles.
  assert.ok(Math.abs(mid - rest * 2) < 1e-9, `at ${REF} m/s range ${mid} should be 2 × ${rest}`);
  const factor = (REF + 90) / REF;
  assert.ok(Math.abs(high - rest * factor) < 1e-6, `at 90 m/s range ${high} should be ${rest * factor}`);
  assert.ok(high > mid && mid > rest, "the range only grows as speed rises");
});

test("the widened range is the same fraction digitalRateIn sheds", () => {
  for (const speed of [0, 20, REF, 90]) {
    const { Input } = arm(0, { adapt: 0, touch: 1 });
    const ramp = Input.debugState().rateIn;
    const base = Input.debugState().touchRangePx;
    Input.setAdaptiveButtons(1);
    Input.setSpeedStd(speed);
    const st = Input.debugState();
    const scale = st.rateIn / ramp;
    assert.ok(Math.abs(st.touchRangePx - base / scale) < 1e-6,
      `at ${speed} m/s range ${st.touchRangePx} should be ${base} / ${scale} (rate ${st.rateIn})`);
  }
});

test("the same finger travel steers less at mid speed and less again at high speed", () => {
  const travel = DEAD + BASE * 0.5;   // half lock at rest
  const steerAt = (speed) => {
    const { Input, onCanvas } = arm(speed, { adapt: 1, touch: 1 });
    onCanvas("touchstart", { changedTouches: [{ identifier: 1, clientX: 200, clientY: 40 }] });
    onCanvas("touchmove", { changedTouches: [{ identifier: 1, clientX: 200 + travel, clientY: 40 }] });
    return Input.steer();
  };
  const low = steerAt(0), mid = steerAt(REF), high = steerAt(90);
  assert.ok(Math.abs(low - 0.5) < 1e-9, `at rest half the range is half lock, got ${low}`);
  assert.ok(Math.abs(mid - 0.25) < 1e-9, `at ${REF} m/s the same travel is a quarter lock, got ${mid}`);
  assert.ok(high < mid && high > 0, `at 90 m/s ${high} should be less than mid ${mid} and still a turn`);
});

test("DRAG AT SPEED off, or ADAPTIVE BUTTONS off, restores the fixed range at every speed", () => {
  for (const speed of [0, REF, 90, 200]) {
    const fixed = rangeAt(0, { adapt: 0, touch: 0 });
    assert.equal(rangeAt(speed, { adapt: 1, touch: 0 }), fixed, `knob off at ${speed} m/s`);
    assert.equal(rangeAt(speed, { adapt: 0, touch: 1 }), fixed, `adaptive off at ${speed} m/s`);
  }
});

test("a maxed assist at absurd speed keeps a fifth of the static range, not zero", () => {
  const rest = rangeAt(0, { adapt: 1, touch: 1 });
  const absurd = rangeAt(1e6, { adapt: 1, touch: 1 });
  assert.ok(Math.abs(absurd - rest / 0.05) < 1e-6, `floor keeps ${rest / 0.05} px, got ${absurd}`);
});

test("touchSpeedFromSlider: notch 1 is off, notch 10 is full, monotonic", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/input/steer-tuning.js"), "utf8");
  const at = src.indexOf("function touchSpeedFromSlider(");
  assert.ok(at >= 0, "touchSpeedFromSlider missing");
  let depth = 0, i = src.indexOf("{", at);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) break;
  }
  const f = new Function(`${src.slice(at, i + 1)}; return touchSpeedFromSlider;`)();
  assert.equal(f(1), 0);
  assert.equal(f(10), 1);
  assert.ok(Math.abs(f(5) - 4 / 9) < 1e-12);
  for (let v = 1; v < 10; v++) assert.ok(f(v + 1) > f(v), `not increasing at notch ${v}`);
  assert.match(src, /store\.get\("touchDragSpeed", 1\)/, "OPT-IN: an absent key is notch 1, the fixed range");
  assert.match(src, /wireTune\("pm-touchdragspeed", "touchDragSpeed", 1,/);
});
