// pad-haptics.test.mjs — Input.rumble(intensity, ms, channel) trigger-rumble.
//
// Chrome/Edge 126+ advertise "trigger-rumble" on vibrationActuator.effects.
// Lock-up → leftTrigger, wheelspin → rightTrigger; unsupported pads and
// TRIGGER HAPTICS off fall back to dual-rumble. A rejected playEffect must
// never escape (index.html paints unhandledrejection as a full-screen overlay).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

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
    Math, Object, Array, Number, isFinite, JSON, Map, Set, Date, String, RegExp,
    Promise,
    performance: { now: () => clock.t },
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
    removeEventListener() {}, setTimeout: () => 0, clearTimeout() {},
    navigator: {}, screen: {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    document: {
      addEventListener: (t, f) => { (listeners[t] ||= []).push(f); }, removeEventListener() {},
      getElementById: el, querySelector: el, querySelectorAll: () => [],
      hidden: false, visibilityState: "visible",
      activeElement: null,
      dispatchEvent: () => true,
      body: { classList: { add() {}, remove() {}, toggle() {} } },
    },
    UiLayers: { navOpen: () => false, anyOpen: () => false, top: () => null },
  };
  sb.Event = class { constructor(type, init) { this.type = type; Object.assign(this, init || {}); } };
  sb.KeyboardEvent = class extends sb.Event {};
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(read("js/core/mat4.js"), ctx, { filename: "js/core/mat4.js" });
  for (const f of ["js/input/bindings.js", "js/input/pad-menu.js", "js/input/haptics.js", "js/input/hold-buttons.js", "js/input/input.js"])
    vm.runInContext(read(f), ctx, { filename: f });
  const Input = vm.runInContext("Input", ctx);
  Input.init(el());
  const fire = (t, e) => (listeners[t] || []).forEach((f) => f(e || {}));
  return { Input, sb, fire, clock };
}

function attachPad(sb, fire, { effects = ["dual-rumble", "trigger-rumble"], reject = false, result = null } = {}) {
  const calls = [];
  const playEffect = (type, params) => {
    calls.push({ type, params });
    if (typeof result === "function") return result(type, params);
    if (reject) return Promise.reject(new Error("InvalidStateError"));
    return Promise.resolve("complete");
  };
  const pad = {
    connected: true, mapping: "standard", id: "Xbox Wireless Controller",
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    vibrationActuator: { effects: effects.slice(), playEffect },
  };
  sb.navigator.getGamepads = () => [pad];
  fire("gamepadconnected", { gamepad: pad });
  return { pad, calls };
}

test("lock-up channel plays trigger-rumble on the left trigger only", () => {
  const { Input, sb, fire } = boot();
  const { calls } = attachPad(sb, fire);
  Input.setHaptics(1);
  Input.setTriggerHaptics(true);
  Input.poll();
  Input.rumble(0.8, 90, "brake");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, "trigger-rumble");
  assert.ok(calls[0].params.leftTrigger > 0, "leftTrigger must fire for brake lock");
  assert.equal(calls[0].params.rightTrigger, 0);
  assert.equal(calls[0].params.duration, 90);
});

test("throttle channel (wheelspin) plays trigger-rumble on the right trigger only", () => {
  const { Input, sb, fire } = boot();
  const { calls } = attachPad(sb, fire);
  Input.setHaptics(1);
  Input.poll();
  Input.rumble(0.6, 110, "throttle");
  assert.equal(calls[0].type, "trigger-rumble");
  assert.equal(calls[0].params.leftTrigger, 0);
  assert.ok(calls[0].params.rightTrigger > 0);
});

test("handles / omitted channel stays on dual-rumble even when trigger-rumble exists", () => {
  const { Input, sb, fire } = boot();
  const { calls } = attachPad(sb, fire);
  Input.setHaptics(1);
  Input.poll();
  Input.rumble(0.25, 90, "handles");
  Input.poll();                      // next frame: the mixer plays one effect per frame
  Input.rumble(0.4, 120);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].type, "dual-rumble");
  assert.equal(calls[1].type, "dual-rumble");
  assert.ok(calls[0].params.strongMagnitude > 0);
});

test("a pad without trigger-rumble falls back to dual-rumble for brake", () => {
  const { Input, sb, fire } = boot();
  const { calls } = attachPad(sb, fire, { effects: ["dual-rumble"] });
  Input.setHaptics(1);
  Input.poll();
  assert.equal(Input.triggerRumbleSupported(), false);
  Input.rumble(0.8, 90, "brake");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, "dual-rumble");
});

test("TRIGGER HAPTICS off forces dual-rumble for brake/throttle", () => {
  const { Input, sb, fire } = boot();
  const { calls } = attachPad(sb, fire);
  Input.setHaptics(1);
  Input.setTriggerHaptics(false);
  Input.poll();
  Input.rumble(0.8, 90, "brake");
  Input.poll();
  Input.rumble(0.6, 110, "throttle");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].type, "dual-rumble");
  assert.equal(calls[1].type, "dual-rumble");
});

test("haptics scale 0 plays nothing", () => {
  const { Input, sb, fire } = boot();
  const { calls } = attachPad(sb, fire);
  Input.setHaptics(0);
  Input.poll();
  Input.rumble(1, 100, "brake");
  Input.rumble(1, 100, "handles");
  assert.equal(calls.length, 0);
});

test("a rejected playEffect promise is swallowed", async () => {
  const { Input, sb, fire } = boot();
  const { calls } = attachPad(sb, fire, { reject: true });
  Input.setHaptics(1);
  Input.poll();
  let unhandled = 0;
  const onRej = () => { unhandled++; };
  // Node's unhandledRejection is process-level; also cover a thrown sync path.
  process.on("unhandledRejection", onRej);
  try {
    assert.doesNotThrow(() => Input.rumble(0.5, 80, "brake"));
    assert.equal(calls.length, 1);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(unhandled, 0, "rejection must be .catch()'d inside rumble()");
  } finally {
    process.off("unhandledRejection", onRej);
  }
});

test("visibility-hidden rejection does not throw", async () => {
  const { Input, sb, fire } = boot();
  sb.document.visibilityState = "hidden";
  sb.document.hidden = true;
  const { calls } = attachPad(sb, fire, { reject: true });
  Input.setHaptics(1);
  Input.poll();
  assert.doesNotThrow(() => Input.rumble(0.5, 80, "handles"));
  assert.equal(calls.length, 1);
  await new Promise((r) => setTimeout(r, 20));
});

/* THE MIXER (2026-10-04). One actuator plays one effect, and a new playEffect
 * PREEMPTS the running one, so a lock-up trigger pulse and a kerb grip rumble
 * fired on overlapping cadences used to cut each other short. Every channel
 * now rides ONE effect per frame, carrying all four motors.
 * https://developer.mozilla.org/en-US/docs/Web/API/GamepadHapticActuator/playEffect */
const tick = () => new Promise((r) => setImmediate(r));

test("mixer: a lock-up and a kerb in one frame play together — one effect, both motors", () => {
  const { Input, sb, fire } = boot();
  const { calls } = attachPad(sb, fire);
  Input.setHaptics(1); Input.setTriggerHaptics(true);
  Input.poll();
  Input.rumble(0.8, 90, "brake");          // plays at once: no added latency
  Input.rumble(0.25, 90, "handles");       // same frame: queued into the mix
  Input.rumble(0.4, 60, "handles");
  assert.equal(calls.length, 1, "at most one playEffect per frame");
  Input.poll();                            // next frame flushes the sum
  assert.equal(calls.length, 2);
  const mix = calls[1];
  assert.equal(mix.type, "trigger-rumble");
  assert.ok(mix.params.leftTrigger > 0.79, "the lock-up survives the kerb");
  assert.ok(Math.abs(mix.params.strongMagnitude - 0.4) < 1e-9, "the strongest grip pulse wins its motor");
  assert.ok(mix.params.weakMagnitude > 0, "the kerb survives the lock-up");
  Input.poll();
  assert.equal(calls.length, 2, "nothing changed: nothing re-played");
});

test("mixer: when the shorter pulse ends the longer one is re-played alone", () => {
  const { Input, sb, fire, clock } = boot();
  const { calls } = attachPad(sb, fire);
  Input.setHaptics(1);
  Input.poll();
  Input.rumble(0.3, 200, "handles");
  Input.rumble(0.9, 50, "brake");
  Input.poll();
  assert.equal(calls.at(-1).params.duration, 200, "the mix lasts as long as its longest pulse");
  clock.t = 60; Input.poll();
  const last = calls.at(-1);
  assert.equal(last.type, "dual-rumble", "the trigger pulse ended, so did the trigger motor");
  assert.equal(last.params.duration, 140);
  assert.ok(Math.abs(last.params.strongMagnitude - 0.3) < 1e-9);
});

test("mixer: preempted by its own newer effect is the design; preempted by anything else re-plays", async () => {
  const { Input, sb, fire } = boot();
  const answers = ["preempted"];          // per call, then "complete"
  const { calls } = attachPad(sb, fire, { result: () => Promise.resolve(answers.shift() || "complete") });
  Input.setHaptics(1);
  Input.poll();
  Input.rumble(0.5, 300, "handles");       // preempted by someone else
  await tick();
  Input.poll();
  assert.equal(calls.length, 2, "a foreign preemption with a pulse still live re-plays it next frame");
  await tick(); Input.poll();
  assert.equal(calls.length, 2, "a completed effect is not re-played");

  answers.push("preempted");               // ours, preempted by our own next frame's mix
  Input.rumble(0.6, 300, "brake");
  Input.poll();
  Input.rumble(0.2, 300, "handles");
  const n = calls.length;
  await tick(); Input.poll();
  assert.equal(calls.length, n, "preempted by our own newer effect: nothing to re-play");
});

test("mixer: NotSupportedError on trigger-rumble folds the triggers into the grips from then on", async () => {
  const { Input, sb, fire } = boot();
  const err = Object.assign(new Error("nope"), { name: "NotSupportedError" });
  const { calls } = attachPad(sb, fire, { result: (type) => type === "trigger-rumble" ? Promise.reject(err) : Promise.resolve("complete") });
  Input.setHaptics(1);
  Input.poll();
  Input.rumble(0.7, 300, "brake");
  assert.equal(calls[0].type, "trigger-rumble");
  await tick();
  Input.poll();
  assert.equal(calls.at(-1).type, "dual-rumble", "re-played on the grips");
  assert.ok(calls.at(-1).params.strongMagnitude > 0.69);
});

test("Firefox legacy pulse(): a rejection is caught too", async () => {
  const { Input, sb, fire } = boot();
  const pulsed = [];
  const pad = { connected: true, mapping: "standard", id: "Gecko pad", axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    hapticActuators: [{ pulse: (m, d) => { pulsed.push([m, d]); return Promise.reject(new Error("InvalidStateError")); } }] };
  sb.navigator.getGamepads = () => [pad];
  fire("gamepadconnected", { gamepad: pad });
  Input.setHaptics(1);
  Input.poll();
  let unhandled = 0;
  const onRej = () => { unhandled++; };
  process.on("unhandledRejection", onRej);
  try {
    Input.rumble(0.5, 80, "handles");
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(pulsed.length, 1);
    assert.equal(unhandled, 0, "pulse()'s rejection must be caught inside the mixer");
  } finally { process.off("unhandledRejection", onRej); }
});

test("mixer: OFF stops the actuator and discards queued pulses without reviving them", async () => {
  const { Input, sb, fire, clock } = boot();
  let preempt;
  const { calls, pad } = attachPad(sb, fire, { result: () => new Promise((r) => { preempt = r; }) });
  let resets = 0;
  pad.vibrationActuator.reset = () => { resets++; return Promise.reject(new Error("already stopped")); };
  Input.poll(); Input.rumble(.8, 90, "brake"); Input.rumble(.4, 120, "handles");
  Input.setHaptics(0);
  assert.equal(resets, 1, "OFF also stops the effect already playing");
  preempt("preempted"); await tick();
  clock.t = 16; Input.poll(); Input.rumble(1, 100);
  assert.equal(calls.length, 1, "neither queued nor newly requested pulses play while OFF");
  Input.setHaptics(1); Input.poll();
  assert.equal(calls.length, 1, "turning back on cannot revive discarded pulses");
  Input.rumble(.5, 70); assert.equal(calls.length, 2);
});

test("mixer: strength and trigger changes remix live pulses without extending their duration", () => {
  const { Input, sb, fire, clock } = boot();
  const { calls } = attachPad(sb, fire);
  Input.poll(); Input.rumble(.8, 90, "brake"); Input.rumble(.4, 120, "handles");
  Input.setHaptics(.5); Input.setTriggerHaptics(false);
  clock.t = 16; Input.poll();
  assert.equal(calls[1].type, "dual-rumble");
  assert.equal(calls[1].params.strongMagnitude, .4);
  assert.equal(calls[1].params.duration, 104);
  Input.setTriggerHaptics(true); clock.t = 32; Input.poll();
  assert.equal(calls[2].type, "trigger-rumble");
  assert.equal(calls[2].params.leftTrigger, .4);
  assert.equal(calls[2].params.duration, 88);
  clock.t = 95; Input.poll();
  assert.equal(calls[3].type, "dual-rumble", "expired trigger pulse cannot be revived");
  assert.equal(calls[3].params.strongMagnitude, .2);
  assert.equal(calls[3].params.duration, 25);
  clock.t = 130; Input.poll(); assert.equal(calls.length, 4);
});

test("mixer: OFF sends a zero-duration stop on actuators without reset", () => {
  const { Input, sb, fire } = boot();
  const { calls } = attachPad(sb, fire);
  Input.poll(); Input.rumble(.8, 120);
  Input.setHaptics(0);
  assert.equal(calls.at(-1).params.duration, 0);
  assert.equal(calls.at(-1).params.strongMagnitude, 0);
  assert.equal(calls.at(-1).params.weakMagnitude, 0);
  Input.poll(); assert.equal(calls.length, 2);
});
