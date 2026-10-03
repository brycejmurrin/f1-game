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
    performance: { now: () => 0 },
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
  return { Input, sb, fire };
}

function attachPad(sb, fire, { effects = ["dual-rumble", "trigger-rumble"], reject = false } = {}) {
  const calls = [];
  const playEffect = (type, params) => {
    calls.push({ type, params });
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
