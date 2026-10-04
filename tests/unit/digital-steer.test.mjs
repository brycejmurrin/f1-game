/* digital-steer.test.mjs — the ramp behind ARROW KEYS and the on-screen turn
 * buttons, measured rather than read.
 *
 * The defect this exists for: `moveToward(val, target, target !== 0 ? rateIn :
 * RAMP_OUT)` used the BUILD rate for any non-zero target, so pressing the
 * OPPOSITE arrow crossed back through centre at the build rate instead of the
 * release rate. Releasing was 2.6x quicker than counter-steering, which makes
 * "release, wait, press" the fastest way through a chicane — a technique nobody
 * should have to find, and one the ADAPTIVE BUTTONS assist made worse, because
 * it slows the build rate with speed and never touched the release rate.
 *
 * Run: node --test tests/unit/digital-steer.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var");

// The real js/input/input.js in a VM, with a clock the test steps by hand and
// just enough DOM for init() to attach its window key listeners.
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
    performance: { now: () => clock.t },
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
  for (const f of ["js/input/bindings.js", "js/input/pad-menu.js", "js/input/haptics.js", "js/input/hold-buttons.js", "js/input/input.js"])
    vm.runInContext(read(f), ctx, { filename: f });
  const Input = vm.runInContext("Input", ctx);
  Input.init(el());
  const key = (k, down) => (listeners[down ? "keydown" : "keyup"] || [])
    .forEach((f) => f({ key: k, code: k, repeat: false, preventDefault() {}, target: { tagName: "BODY" } }));
  const fire = (t, e) => (listeners[t] || []).forEach((f) => f(e || {}));
  return { Input, key, clock, sb, fire };
}

const STEP = 1000 / 60;

/** ms from full RIGHT lock back to centre, either by releasing or by pressing
 *  the other way. `speed` in m/s; `mix` is the ADAPTIVE BUTTONS trim, 0..1. */
function msToCentre(how, { speed, mix }) {
  const { Input, key, clock } = boot();
  Input.reset();
  Input.setAdaptiveButtons(mix);
  Input.setSpeedStd(speed);
  clock.t = 0;
  key("ArrowRight", true);
  for (let i = 0; i < 600 && Input.steer() < 0.999; i++) clock.t += STEP;
  assert.ok(Input.steer() > 0.999, "precondition: never reached full right lock");
  key("ArrowRight", false);
  if (how === "counter") key("ArrowLeft", true);
  const t0 = clock.t;
  for (let i = 0; i < 600 && Input.steer() > 0; i++) clock.t += STEP;
  assert.ok(Input.steer() <= 0, "never reached centre");
  return Math.round(clock.t - t0);
}

test("counter-steering unwinds as fast as letting go, at every speed and trim", () => {
  for (const speed of [0, 20, 41.7, 90]) {
    for (const mix of [0, 0.5, 1]) {
      const release = msToCentre("release", { speed, mix });
      const counter = msToCentre("counter", { speed, mix });
      assert.equal(counter, release,
        `at ${speed} m/s, adaptive ${mix}: pressing the other arrow takes ${counter} ms ` +
        `to unwind but releasing takes ${release} ms — release-wait-press would be faster`);
    }
  }
});

test("the assist still slows how fast lock BUILDS — only the unwind was wrong", () => {
  // The point of ADAPTIVE BUTTONS is a calmer wheel at speed. Fixing the unwind
  // must not quietly undo that, so the build direction is pinned here.
  const build = (speed, mix) => {
    const { Input, key, clock } = boot();
    Input.reset(); Input.setAdaptiveButtons(mix); Input.setSpeedStd(speed);
    clock.t = 0; key("ArrowRight", true);
    let n = 0;
    for (; n < 900 && Input.steer() < 0.999; n++) clock.t += STEP;
    return Math.round(n * STEP);
  };
  const slow = build(0, 1), fast = build(90, 1);
  assert.ok(fast > slow * 1.5,
    `adaptive on: building lock at 90 m/s (${fast} ms) should be far slower than at rest (${slow} ms)`);
  assert.equal(build(0, 0), build(90, 0), "adaptive OFF: speed must not change the build rate");
});

test("a single frame can hold both halves of a direction change", () => {
  // At 60 Hz the release rate covers 0.133 units a frame, so a flick from a
  // shallow angle crosses centre mid-frame. Spending only the unwind half would
  // silently cap a direction change at one rate per frame; the leftover time
  // has to keep going into the new lock.
  const { Input, key, clock } = boot();
  Input.reset(); Input.setAdaptiveButtons(0); Input.setSpeedStd(0);
  clock.t = 0; key("ArrowRight", true);
  // steer() IS the ramp — it advances on the call, not on the clock — so a
  // frame only happens when something asks for the value.
  // Two calls, because the first only seeds the ramp's timestamp (dt = 0).
  for (let i = 0; i < 2; i++) { clock.t += STEP; Input.steer(); }
  const small = Input.steer();
  // The ramp runs in SHAPED (road-wheel) space, so the budget comparison has to
  // as well: steer() hands back the raw stick value whose expo-th power is the
  // shaped one. Raw 0.38 is shaped 0.10 at the default LINEARITY — inside one
  // frame of unwind (RAMP_OUT 8/s x 1/60 s = 0.133), which is what makes the
  // frame able to reach centre at all.
  const EXPO = 2.3889;                       // the shipped LINEARITY 5
  const shaped = Math.pow(small, EXPO);
  assert.ok(small > 0 && shaped < 8 / 60,
    `precondition: wanted a shaped angle inside one frame of unwind, got ${shaped} (raw ${small})`);
  key("ArrowRight", false); key("ArrowLeft", true);
  clock.t += STEP;                                  // ONE frame
  assert.ok(Input.steer() < 0,
    `one frame from ${small.toFixed(3)} should cross centre and start building left, got ${Input.steer()}`);
});

/* PAD AXIS SHAPING (2026-10-04, input.js padAxisShape / padPedalLevel /
 * pollGamepad's free-look). Three defects, each pinned by what the player gets:
 *   - a calibrated rest offset was subtracted then CLAMPED, so a stick resting
 *     at 0.15 topped out at 0.85 toward the drift side (66 % lock after expo);
 *   - trigger travel was a 0.12 GATE: 0 below, then 12 % at once (and game.js
 *     floored any brake at 15 %), the band trail braking lives in;
 *   - free-look read raw axes 2/3 on any device: a wheel pedal resting at -1 on
 *     axis 2 pinned the cockpit camera at full yaw. */
function padRig(mapping = "standard") {
  const r = boot();
  const pad = { id: mapping ? "Xbox Wireless Controller" : "Wheel", index: 0, mapping, connected: true, timestamp: 1,
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  r.sb.navigator.getGamepads = () => [pad];
  r.fire("gamepadconnected", { gamepad: pad });
  r.Input.setSteerMode("touch");
  return Object.assign(r, { pad, trig: (i, v) => { pad.buttons[i] = { pressed: v >= 0.5, value: v }; } });
}

test("a calibrated drift offset still reaches full lock on BOTH sides", () => {
  const { Input, pad } = padRig();
  Input.setPadDeadzone(0.05); Input.setPadSaturation(0);
  for (const rest of [0.08, 0.15, -0.15]) {
    Input.setPadRest(rest);
    pad.axes[0] = 1; Input.poll();
    assert.equal(Input.steer(), 1, `rest ${rest}: full right is full lock`);
    pad.axes[0] = -1; Input.poll();
    assert.equal(Input.steer(), -1, `rest ${rest}: full left is full lock`);
    pad.axes[0] = rest; Input.poll();
    assert.equal(Input.debugState().pad.steer, 0, `rest ${rest}: the resting stick is centre`);
  }
});

test("trigger travel is a rescaled dead zone: no 12 % step, no 15 % brake floor", () => {
  const { Input, trig } = padRig();
  trig(7, 0.12); Input.poll();
  assert.equal(Input.throttle(), false, "inside the dead zone is not throttle");
  assert.equal(Input.throttleLevel(), 0);
  trig(7, 0.13); Input.poll();
  assert.equal(Input.throttle(), true);
  assert.ok(Input.throttleLevel() > 0 && Input.throttleLevel() < 0.02,
    "just past the dead zone is just past zero, not 12 %: " + Input.throttleLevel());
  trig(7, 1); Input.poll();
  assert.equal(Input.throttleLevel(), 1, "a full trigger is full travel");
  trig(7, 0); trig(6, 0.2); Input.poll();
  assert.ok(Math.abs(Input.brakeLevel() - 0.08 / 0.88) < 1e-9, "brake travel ramps from 0 too: " + Input.brakeLevel());
  let prev = 0;
  for (let v = 0; v <= 1.0001; v += 0.01) {
    trig(6, Math.min(1, v)); Input.poll();
    assert.ok(Input.brakeLevel() >= prev, "monotonic at " + v);
    assert.ok(Input.brakeLevel() - prev < 0.02, `no step at ${v.toFixed(2)}: ${prev} -> ${Input.brakeLevel()}`);
    prev = Input.brakeLevel();
  }
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  assert.doesNotMatch(game, /Math\.max\(0\.15,\s*Input\.brakeLevel/, "the 15 % brake step is gone from game.js");
  assert.match(game, /Math\.max\(surfaceBrake \* brakeLvl, COAST_DRAG\)/, "a live pedal never brakes less than lifting (the floor's intent, continuous)");
});

test("free-look reads the right stick only on a standard pad, never a mapped wheel axis", () => {
  const std = padRig();
  std.pad.axes[2] = 0.8; std.Input.poll();
  assert.ok(std.Input.lookStick().x > 0.5, "a standard pad's right stick looks around");
  std.Input.setPadAxisMap({ steer: 0, throttle: 2, brake: 3 });
  std.Input.poll();
  assert.equal(std.Input.lookStick().x, 0, "an axis the wizard mapped to a pedal is a pedal, not a look stick");
  const wheel = padRig("");
  wheel.pad.axes[2] = -1; wheel.pad.axes[3] = -1; wheel.Input.poll();
  assert.deepEqual({ ...wheel.Input.lookStick() }, { x: 0, y: 0 }, "a wheel's resting pedal on axis 2/3 never yaws the camera");
});
