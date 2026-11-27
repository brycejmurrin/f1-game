// dualsense-polish.test.mjs — #7043: CREATE/TOUCHPAD labels, connect hint, kerb dual-rumble texture, trigger feel.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function boot() {
  const listeners = {};
  const hint = { hidden: false }, clock = { t: 0 };
  const el = () => ({
    addEventListener() {}, removeEventListener() {}, style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {}, children: [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }),
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false,
  });
  const sb = {
    Math, Object, Array, Number, isFinite, JSON, Map, Set, Date, String, RegExp, Promise,
    performance: { now: () => clock.t },
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
    removeEventListener() {}, setTimeout: () => 0, clearTimeout() {},
    navigator: { getGamepads: () => [] }, screen: {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    document: {
      addEventListener: (t, f) => { (listeners[t] ||= []).push(f); }, removeEventListener() {},
      getElementById: (id) => (id === "pm-pad-connect-hint" ? hint : el()), querySelector: el, querySelectorAll: () => [],
      hidden: false, visibilityState: "visible", activeElement: null, dispatchEvent: () => true,
      body: { classList: { add() {}, remove() {}, toggle() {} } },
    },
    UiLayers: { navOpen: () => false, anyOpen: () => false, top: () => null },
  };
  sb.Event = class { constructor(type, init) { this.type = type; Object.assign(this, init || {}); } };
  sb.KeyboardEvent = class extends sb.Event {};
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(read("js/core/mat4.js"), ctx, { filename: absSrc("js/core/mat4.js") });
  for (const f of ["js/input/bindings.js", "js/input/pad-menu.js", "js/input/haptics.js", "js/input/pedal-travel.js", "js/input/hold-buttons.js", "js/input/input.js"])
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const Input = vm.runInContext("Input", ctx);
  Input.init(el());
  const fire = (t, e) => (listeners[t] || []).forEach((f) => f(e || {}));
  return { Input, sb, fire, hint, clock };
}

function attach(sb, fire, id) {
  const calls = [];
  const pad = {
    connected: true, mapping: "standard", id, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })),
    vibrationActuator: { effects: ["dual-rumble", "trigger-rumble"], playEffect: (type, params) => { calls.push({ type, params }); return Promise.resolve("complete"); } },
  };
  sb.navigator.getGamepads = () => [pad];
  fire("gamepadconnected", { gamepad: pad });
  return calls;
}

test("a DualSense labels CREATE and TOUCHPAD; a DS4 keeps SHARE", () => {
  const a = boot();
  attach(a.sb, a.fire, "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)");
  assert.equal(a.Input.padLabel(8), "CREATE");
  assert.equal(a.Input.padLabel(17), "TOUCHPAD");
  assert.equal(a.Input.padLabel(9), "OPTIONS");
  const b = boot();
  attach(b.sb, b.fire, "Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 05c4)");
  assert.equal(b.Input.padLabel(8), "SHARE");
});

test("the press-any-button hint shows with no pad and hides on gamepadconnected", () => {
  const t = boot();
  assert.equal(t.hint.hidden, false);
  attach(t.sb, t.fire, "Xbox Wireless Controller");
  assert.equal(t.hint.hidden, true);
});

test("the kerb channel alternates which grip motor leads", () => {
  const t = boot();
  const calls = attach(t.sb, t.fire, "DualSense Wireless Controller");
  t.Input.setHaptics(1);
  t.Input.poll(); t.Input.rumble(0.5, 90, "kerb");
  t.clock.t = 200; t.Input.poll(); t.Input.rumble(0.5, 90, "kerb");
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.type === "dual-rumble"));
  const [x, y] = calls.map((c) => c.params);
  assert.ok(x.strongMagnitude > x.weakMagnitude && y.weakMagnitude > y.strongMagnitude, "heavy then light");
});

test("trigger motors get a feel floor; trigger haptics off forces dual-rumble grips", () => {
  const t = boot();
  const calls = attach(t.sb, t.fire, "DualSense Wireless Controller");
  t.Input.setHaptics(1);
  t.Input.poll(); t.Input.rumble(0.1, 90, "brake");
  assert.equal(calls[0].type, "trigger-rumble");
  assert.ok(calls[0].params.leftTrigger >= 0.25, "faint lock-up is still perceptible");
  t.Input.setTriggerHaptics(false);
  t.Input.poll(); t.Input.rumble(0.6, 90, "brake");
  assert.equal(calls[1].type, "dual-rumble");
});

test("DualSense Edge and Firefox-format ids also read as DualSense", () => {
  for (const id of ["DualSense Edge Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0df2)", "054c-0ce6-Wireless Controller"]) {
    const t = boot();
    attach(t.sb, t.fire, id);
    assert.equal(t.Input.padLabel(8), "CREATE", id);
  }
});

test("trigger feel floor edges: 0 stays silent, 1 stays at 1", () => {
  const t = boot();
  const calls = attach(t.sb, t.fire, "DualSense Wireless Controller");
  t.Input.setHaptics(1);
  t.Input.poll(); t.Input.rumble(1, 90, "brake");
  assert.equal(calls[0].params.leftTrigger, 1);
  assert.equal(calls[0].params.rightTrigger, 0);
});
