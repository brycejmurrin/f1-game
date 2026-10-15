/* touch-drag-anchor.test.mjs — TOUCH drag ring at finger-down XY and offset dot. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var");

function touchRangePx(win) {
  const long = Math.max(win.innerWidth || 844, win.innerHeight || 390);
  return Math.max(40, long * 0.12);
}

function boot({ dragAnchor = true } = {}) {
  const listeners = {};
  const clock = { t: 0 };
  const classOn = new Set();
  const mkEl = (id) => {
    const children = [];
    const style = {
      _props: {},
      setProperty(k, v) { this._props[k] = v; },
      getPropertyValue(k) { return this._props[k] || ""; },
    };
    const el = {
      id,
      style,
      children,
      dataset: {},
      classList: {
        add(c) { classOn.add(c); },
        remove(c) { classOn.delete(c); },
        toggle(c, on) { on === false ? classOn.delete(c) : classOn.add(c); },
        contains: (c) => classOn.has(c),
      },
      setAttribute() {},
      getAttribute: () => null,
      removeAttribute() {},
      addEventListener() {},
      removeEventListener() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }),
      setPointerCapture() {},
      releasePointerCapture() {},
      hasPointerCapture: () => false,
      querySelector(sel) {
        return children.find((c) => c.className && sel.includes(c.className)) || null;
      },
      appendChild(node) {
        children.push(node);
        node.parentNode = el;
        return node;
      },
    };
    return el;
  };
  let dragEl = dragAnchor ? mkEl("drag-anchor") : null;
  const sb = {
    Math, Object, Array, Number, isFinite, JSON, Map, Set, Date,
    performance: { now: () => clock.t },
    DeviceOrientationEvent: function DeviceOrientationEvent() {},
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
    removeEventListener() {},
    setTimeout: () => 0,
    clearTimeout() {},
    navigator: {},
    screen: {},
    innerWidth: 844,
    innerHeight: 390,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    document: {
      addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
      removeEventListener() {},
      getElementById: (id) => (id === "drag-anchor" ? dragEl : mkEl(id)),
      querySelector: (sel) => (sel === "#drag-anchor" ? dragEl : mkEl("x")),
      querySelectorAll: () => [],
      hidden: false,
      body: { classList: { add() {}, remove() {}, toggle() {} } },
      createElement: (tag) => {
        const node = { tagName: tag.toUpperCase(), className: "", style: {}, parentNode: null,
          setAttribute() {}, children: [] };
        return node;
      },
    },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(read("js/core/mat4.js"), ctx, { filename: "js/core/mat4.js" });
  for (const f of ["js/input/tilt-roll.js", "js/input/bindings.js", "js/input/pad-menu.js",
    "js/input/haptics.js", "js/input/hold-buttons.js", "js/input/input.js"])
    vm.runInContext(read(f), ctx, { filename: f });
  const Input = vm.runInContext("Input", ctx);
  const canvasL = {};
  const canvas = Object.assign(mkEl("game"), {
    addEventListener: (t, f) => { (canvasL[t] ||= []).push(f); },
  });
  Input.init(canvas);
  const onCanvas = (t, e) => (canvasL[t] || []).forEach((f) => f(Object.assign({ preventDefault() {} }, e)));
  return { Input, onCanvas, dragEl, classOn, sb };
}

function dragOff(dragEl) {
  const dot = dragEl.children.find((c) => c.style && c.style.transform);
  const m = dot && /translateX\(([-\d.]+)px\)/.exec(dot.style.transform);
  return m ? m[1] + "px" : "";
}

test("anchor sits at touch-down X and Y", () => {
  const { Input, onCanvas, dragEl, classOn } = boot();
  Input.setSteerMode("touch");
  onCanvas("touchstart", { changedTouches: [{ identifier: 1, clientX: 220, clientY: 410 }] });
  assert.ok(classOn.has("on"));
  assert.equal(dragEl.style.left, "220px");
  assert.equal(dragEl.style.top, "410px");
});

test("offset dot tracks horizontal drag and clamps at full lock", () => {
  const { Input, onCanvas, dragEl, sb } = boot();
  Input.setSteerMode("touch");
  Input.setDragSmoothing(0);
  const range = touchRangePx(sb);
  const ax = 180;
  onCanvas("touchstart", { changedTouches: [{ identifier: 2, clientX: ax, clientY: 200 }] });
  onCanvas("touchmove", { changedTouches: [{ identifier: 2, clientX: ax + 40, clientY: 200 }] });
  assert.equal(dragOff(dragEl), "35px");
  const pastLock = ax + 5 + range + 80;
  onCanvas("touchmove", { changedTouches: [{ identifier: 2, clientX: pastLock, clientY: 200 }] });
  assert.equal(dragOff(dragEl), range + "px");
  assert.equal(Input.debugState().touchSteer, 1);
});

test("hides when the steering touch lifts", () => {
  const { Input, onCanvas, classOn } = boot();
  Input.setSteerMode("touch");
  onCanvas("touchstart", { changedTouches: [{ identifier: 3, clientX: 100, clientY: 100 }] });
  assert.ok(classOn.has("on"));
  onCanvas("touchend", { changedTouches: [{ identifier: 3, clientX: 100, clientY: 100 }] });
  assert.ok(!classOn.has("on"));
});

test("no-op without #drag-anchor or outside TOUCH steer mode", () => {
  const noEl = boot({ dragAnchor: false });
  noEl.Input.setSteerMode("touch");
  noEl.onCanvas("touchstart", { changedTouches: [{ identifier: 4, clientX: 50, clientY: 50 }] });
  assert.equal(noEl.classOn.size, 0);

  const { Input, onCanvas, classOn } = boot();
  Input.setSteerMode("buttons");
  onCanvas("touchstart", { changedTouches: [{ identifier: 5, clientX: 50, clientY: 50 }] });
  assert.ok(!classOn.has("on"));
});

test("follows the touch that is actually steering (last press wins)", () => {
  const { Input, onCanvas, dragEl } = boot();
  Input.setSteerMode("touch");
  onCanvas("touchstart", { changedTouches: [{ identifier: 10, clientX: 80, clientY: 120 }] });
  onCanvas("touchstart", { changedTouches: [{ identifier: 11, clientX: 520, clientY: 640 }] });
  assert.equal(dragEl.style.left, "520px");
  assert.equal(dragEl.style.top, "640px");
  onCanvas("touchend", { changedTouches: [{ identifier: 11, clientX: 520, clientY: 640 }] });
  assert.equal(dragEl.style.left, "80px");
  assert.equal(dragEl.style.top, "120px");
});

test("hides while a menu overlay is open", () => {
  const { Input, onCanvas, classOn, sb } = boot();
  Input.setSteerMode("touch");
  sb.UiLayers = { anyOpen: () => true };
  onCanvas("touchstart", { changedTouches: [{ identifier: 6, clientX: 10, clientY: 10 }] });
  assert.ok(!classOn.has("on"));
});
