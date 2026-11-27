/* input-coarse-switch-vm.test.mjs — #6447: the (pointer: coarse) change listener
 * releases a latched keyboard throttle / look-back toggle (releaseKeyLatches) when
 * the device flips to touch; it used to assign localControlDevice directly and keep
 * the throttle on. It does not go through setLocalControlDevice: that path also
 * releases a mouse contact and notifies, which throttle-latch.test.mjs pins off.
 *
 * Run: node --test tests/unit/input-coarse-switch-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var");

function boot() {
  const listeners = {}, mql = { matches: false, cbs: [], addEventListener(t, f) { if (t === "change") this.cbs.push(f); } };
  const el = () => ({
    addEventListener() {}, removeEventListener() {}, style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {}, children: [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }),
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false,
  });
  const sb = {
    Math, Object, Array, Number, isFinite, JSON, Map, Set, Date,
    performance: { now: () => 0 }, DeviceOrientationEvent: function DeviceOrientationEvent() {},
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
    removeEventListener() {}, setTimeout: () => 0, clearTimeout() {},
    navigator: {}, screen: {}, matchMedia: () => mql,
    document: {
      addEventListener: (t, f) => { (listeners[t] ||= []).push(f); }, removeEventListener() {},
      getElementById: el, querySelector: el, querySelectorAll: () => [], hidden: false,
      body: { classList: { add() {}, remove() {}, toggle() {} } },
    },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(read("js/core/mat4.js"), ctx, { filename: absSrc("js/core/mat4.js") });
  for (const f of ["js/input/tilt-roll.js", "js/input/bindings.js", "js/input/pad-menu.js", "js/input/haptics.js", "js/input/pedal-travel.js", "js/input/hold-buttons.js", "js/input/input.js"])
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const Input = vm.runInContext("Input", ctx);
  Input.init(Object.assign(el(), { addEventListener() {} }));
  const key = (k, down) => (listeners[down ? "keydown" : "keyup"] || [])
    .forEach((f) => f({ key: k, code: k, repeat: false, preventDefault() {}, target: { tagName: "BODY" } }));
  return { Input, key, mql };
}

test("a (pointer: coarse) switch to touch releases the latched keyboard throttle toggle", () => {
  const { Input, key, mql } = boot();
  Input.reset();
  Input.setHoldMode({ throttle: "toggle", lookBack: "toggle" });
  key("ArrowUp", true); key("ArrowUp", false);
  key("KeyB", true); key("KeyB", false);
  assert.equal(Input.lookingBack(), true, "precondition: the toggle latched look-back on");
  assert.equal(Input.throttle(), true, "precondition: the toggle latched the throttle on");
  mql.matches = true;
  Input.onPointerKindChange(() => {});     // ensures the MQL listener exists
  assert.equal(mql.cbs.length, 1, "the change listener is registered");
  mql.cbs[0]();
  assert.equal(Input.throttle(), false, "touch switch must release the keyboard throttle latch");
  assert.equal(Input.lookingBack(), false, "and the look-back latch");
  key("ArrowLeft", true); key("ArrowLeft", false);
  assert.equal(Input.throttle(), false, "the toggle itself is cleared, not just the mirror");
});
