/* throttle-latch.test.mjs — THROTTLE = LATCH, measured through the real pedal
 * listeners rather than read off the source.
 *
 * XAG 107 (Duration) names our exact case: holding accelerate for a whole race
 * is a fatigue barrier, and a toggle is the fix that sits between HOLD and the
 * full AUTO assist. The three things that can go wrong are all here:
 *
 *   1. the UP edge must not undo the DOWN edge (a tap would be a no-op),
 *   2. a latched throttle must be FULL travel, not the pedal's last modulation,
 *   3. it must drop on the everything-off path — a latch that survives a window
 *      blur accelerates the car while the player is not looking at it.
 *
 * Run: node --test tests/unit/throttle-latch.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var");

// Like digital-steer.test.mjs's boot, but the element stubs are KEPT BY ID and
// record their listeners, because this test has to fire the pedal's own
// pointerdown/pointerup rather than a window key event.
function boot() {
  const listeners = {};
  const els = new Map();
  const clock = { t: 0 };
  function el(id) {
    if (id && els.has(id)) return els.get(id);
    const on = {};
    const e = {
      id, cls: new Set(), attrs: {},
      addEventListener: (t, f) => { (on[t] ||= []).push(f); }, removeEventListener() {},
      fire(t, ev) { (on[t] || []).forEach((f) => f({ pointerId: 1, clientX: 0, clientY: 0, preventDefault() {}, ...ev })); },
      style: {}, dataset: {}, children: [],
      classList: {
        add(c) { e.cls.add(c); }, remove(c) { e.cls.delete(c); },
        toggle(c, on2) { if (on2) e.cls.add(c); else e.cls.delete(c); },
        contains: (c) => e.cls.has(c),
      },
      setAttribute(k, v) { e.attrs[k] = v; }, getAttribute: (k) => (k in e.attrs ? e.attrs[k] : null),
      removeAttribute(k) { delete e.attrs[k]; },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }),
      setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false,
    };
    if (id) els.set(id, e);
    return e;
  }
  const sb = {
    Math, Object, Array, Number, isFinite, JSON, Map, Set, Date,
    performance: { now: () => clock.t },
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
    removeEventListener() {}, setTimeout: () => 0, clearTimeout() {},
    navigator: {}, screen: {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    document: {
      addEventListener: (t, f) => { (listeners[t] ||= []).push(f); }, removeEventListener() {},
      getElementById: el, querySelector: () => el(), querySelectorAll: () => [], hidden: false,
      body: { classList: { add() {}, remove() {}, toggle() {} } },
    },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(read("js/core/mat4.js"), ctx, { filename: "js/core/mat4.js" });
  vm.runInContext(read("js/input/input.js"), ctx, { filename: "js/input/input.js" });
  const Input = vm.runInContext("Input", ctx);
  Input.init(el());
  const pedal = el("btn-throttle");
  const tap = () => { pedal.fire("pointerdown"); pedal.fire("pointerup"); };
  const blur = () => (listeners.blur || []).forEach((f) => f({}));
  return { Input, pedal, tap, blur };
}

test("HOLD is unchanged: the pedal follows the thumb", () => {
  const { Input, pedal } = boot();
  pedal.fire("pointerdown");
  assert.equal(Input.throttle(), true);
  pedal.fire("pointerup");
  assert.equal(Input.throttle(), false, "releasing the pedal must lift the throttle in HOLD");
  assert.equal(Input.throttleLatched(), false);
});

test("LATCH: a tap sticks, a second tap lifts", () => {
  const { Input, tap } = boot();
  Input.setThrottleLatch(true);
  tap();
  assert.equal(Input.throttle(), true, "the UP edge must not undo the DOWN edge");
  assert.equal(Input.throttleLatched(), true);
  tap();
  assert.equal(Input.throttle(), false, "a second tap lifts it");
  assert.equal(Input.throttleLatched(), false);
});

test("LATCH is FULL travel, not the pedal's last modulation", () => {
  const { Input, pedal } = boot();
  Input.setThrottleLatch(true);
  pedal.fire("pointerdown");
  pedal.fire("pointermove", { clientY: 400 });   // slide DOWN = ease off
  pedal.fire("pointerup");
  assert.equal(Input.throttleLatched(), true);
  assert.equal(Input.throttleLevel(), 1, "a latched pedal is held at 1, not at wherever the thumb slid to");
});

test("a latch drops on blur and on reset — it never outlives the window", () => {
  for (const how of ["blur", "reset"]) {
    const h = boot();
    h.Input.setThrottleLatch(true);
    h.tap();
    assert.equal(h.Input.throttleLatched(), true);
    if (how === "blur") h.blur(); else h.Input.reset();
    assert.equal(h.Input.throttleLatched(), false, `a latch must not survive ${how}`);
    assert.equal(h.Input.throttleLevel(), 0);
  }
});

test("leaving LATCH mode clears a live latch", () => {
  const { Input, tap } = boot();
  Input.setThrottleLatch(true);
  tap();
  Input.setThrottleLatch(false);
  assert.equal(Input.throttle(), false, "switching back to HOLD must not leave the throttle pinned on");
  assert.equal(Input.throttleLatched(), false);
});

test("the pedal SHOWS the latch: :active follows the thumb, .on outlives it", () => {
  const { Input, pedal, tap } = boot();
  Input.setThrottleLatch(true);
  assert.equal(pedal.getAttribute("aria-pressed"), "false", "in LATCH the pedal is a toggle button");
  tap();
  assert.equal(pedal.classList.contains("on"), true);
  assert.equal(pedal.getAttribute("aria-pressed"), "true");
  tap();
  assert.equal(pedal.classList.contains("on"), false);
  Input.setThrottleLatch(false);
  assert.equal(pedal.getAttribute("aria-pressed"), null, "in HOLD it is a plain button again");
});
