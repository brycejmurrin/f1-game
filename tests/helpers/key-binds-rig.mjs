// Shared VM rig for the key-binds*.test.mjs files (split from key-binds.test.mjs, T3-16): the real
// input.js in a VM (boot), a fake pad, the CONTROLS-page DOM (bootUi) and the calibration / profile-store
// fixtures. Moved verbatim; no assertion lives here beyond the ones the rigs already carried.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "./abs-src.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

export function boot(initOpts) {
  const listeners = {};
  // Keydowns the pad synthesises land here when they go to the document (the
  // fallback target); one that reaches a focused control is recorded by that
  // control's own fake dispatchEvent instead — which is the point of the test.
  const dispatched = [];
  // anyOpen = real menus (pause/settings). navOpen also covers title #overlay.
  // Keep them independent so the touch-pause gate can pin anyOpen ≠ navOpen.
  const anyOpen = { on: false };
  const navOpen = { on: false };
  const el = () => ({
    addEventListener() {}, removeEventListener() {}, style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {}, children: [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }),
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false,
  });
  const sb = {
    Math, Object, Array, Number, isFinite, JSON, Map, Set, Date, String, RegExp,
    performance: { now: () => 0 },
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
    removeEventListener() {}, setTimeout: () => 0, clearTimeout() {},
    navigator: {}, screen: {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    document: {
      addEventListener: (t, f) => { (listeners[t] ||= []).push(f); }, removeEventListener() {},
      getElementById: el, querySelector: el, querySelectorAll: () => [], hidden: false,
      activeElement: null,
      dispatchEvent: (e) => { dispatched.push(e); return true; },
      body: { classList: { add() {}, remove() {}, toggle() {} } },
    },
    UiLayers: {
      anyOpen: () => anyOpen.on,
      navOpen: () => anyOpen.on || navOpen.on,
      top: () => (anyOpen.on ? { id: "pmsettings", contains: () => true }
        : (navOpen.on ? { id: "overlay", contains: () => true } : null)),
    },
  };
  sb.Event = class { constructor(type, init) { this.type = type; Object.assign(this, init || {}); } };
  sb.KeyboardEvent = class extends sb.Event {};
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(read("js/core/mat4.js"), ctx, { filename: absSrc("js/core/mat4.js") });
  for (const f of ["js/input/controller-profiles.js", "js/input/bindings.js", "js/input/pad-menu.js", "js/input/haptics.js", "js/input/pedal-travel.js", "js/input/hold-buttons.js", "js/input/input.js"])
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const Input = vm.runInContext("Input", ctx);
  Input.init(el(), initOpts);
  const key = (code, down) => (listeners[down ? "keydown" : "keyup"] || [])
    .forEach((f) => f({ key: code, code, repeat: false, preventDefault() {}, target: { tagName: "BODY" } }));
  const fire = (t, e) => (listeners[t] || []).forEach((f) => f(e || {}));
  return { Input, key, sb, fire, dispatched, navOpen, anyOpen };
}

// A standard-mapping pad the sandbox's navigator reports as the only one.
// press(i, v) sets button i (a trigger takes a value); gamepadconnected must be
// fired once so pollGamepad reads it every frame instead of re-probing.
export function fakePad(sb, fire, id = "Xbox Wireless Controller") {
  const pad = { connected: true, mapping: "standard", id, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  sb.navigator.getGamepads = () => [pad];
  fire("gamepadconnected", { gamepad: pad });
  return { pad, press: (i, v = 1) => { pad.buttons[i] = { pressed: v >= 0.5, value: v }; }, release: (i) => { pad.buttons[i] = { pressed: false, value: 0 }; } };
}
// Values come back from the vm realm with that realm's Array/Object
// prototypes; strict deepEqual compares prototypes, so round-trip to plain.
export const plain = (v) => JSON.parse(JSON.stringify(v));

// A DOM just deep enough for KeyBinds.create: elements by id with hidden,
// textContent and children; createElement for the rows.
// `disk`, when given, backs the store (reads and writes land in it).
// `pre(sb)` adds globals the module reads at create() time (SettingsNav).
export function bootUi(desktop, helpSlots = {}, disk = null, pre = null, opts = null) {
  const { Input, key, sb, fire } = boot();
  const deferTimers = !!(opts && opts.deferTimers);
  const timerQueue = [];
  let timerSeq = 1;
  const nodes = {};
  const mk = (tag = "div") => {
    let text = "";
    const n = { tagName: tag.toUpperCase(), hidden: false, dataset: {}, disabled: false, style: {}, kids: [], clears: 0, attrs: {},
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      removeAttribute(k) { delete this.attrs[k]; },
      setAttribute(k, v) { this.attrs[k] = String(v); }, append(...a) { this.kids.push(...a); }, appendChild(a) { this.kids.push(a); },
      addEventListener() {}, removeEventListener() {},
      focus() { sb.document.activeElement = this; } };
    Object.defineProperty(n, "textContent", { get: () => text, set(v) {
      text = String(v);
      if (v === "") { n.kids = []; n.clears++; }
    } });
    return n;
  };
  sb.document.getElementById = (id) => (nodes[id] ||= mk());
  sb.document.querySelectorAll = (sel) => helpSlots[sel] || [];
  sb.document.createElement = (tag) => mk(tag);
  sb.document.body.classList.contains = (c) => c === "desktop" && desktop;
  sb.document.readyState = "complete";
  const winListeners = {};
  sb.addEventListener = (t, f) => { (winListeners[t] ||= []).push(f); };
  sb.removeEventListener = (t, f) => { const l = winListeners[t] || []; const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); };
  sb.dispatchEvent = (e) => { for (const f of [...(winListeners[e.type] || [])]) f(e); return true; };
  sb.GameAudio = null;
  if (pre) pre(sb);
  if (deferTimers) {
    sb.setTimeout = (f, ms = 0) => {
      const id = timerSeq++;
      timerQueue.push({ id, f, ms: Number(ms) || 0 });
      return id;
    };
    sb.clearTimeout = (id) => {
      const i = timerQueue.findIndex((t) => t.id === id);
      if (i >= 0) timerQueue.splice(i, 1);
    };
  } else {
    sb.setTimeout = (f) => { f(); return 0; };   // the reveal defers past the dispatch; here it just runs
    sb.clearTimeout = () => {};
  }
  vm.runInContext(read("js/ui/key-binds.js"), sb.__ctx || (sb.__ctx = vm.createContext(sb)), { filename: absSrc("js/ui/key-binds.js") });
  const KeyBinds = vm.runInContext("KeyBinds", sb.__ctx);
  const store = disk
    ? {
      get: (k, d) => (Object.prototype.hasOwnProperty.call(disk, k) ? disk[k] : d),
      set: (k, v) => { disk[k] = v; },
      rawDel: (k) => { delete disk[k]; },
    }
    : { get: () => null, set() {}, rawDel() {} };
  const G = { $: sb.document.getElementById, store, soundOn: false };
  const kb = KeyBinds.create(G);
  // A physical key: Input's window listener sets the latch, then the module's.
  const press = (code) => {
    key(code, true);
    [...(winListeners.keydown || [])].forEach((f) => f({ code, isTrusted: true, repeat: false,
      preventDefault() {}, stopPropagation() {} }));
    key(code, false);
  };
  // Input's listeners were registered before the swap above, the module's after.
  const fireAll = (t, e) => { fire(t, e); (winListeners[t] || []).forEach((f) => f(e || {})); };
  const flushTimers = (throughMs = Infinity) => {
    const due = timerQueue.filter((t) => t.ms <= throughMs).sort((a, b) => a.ms - b.ms);
    for (const t of due) {
      const i = timerQueue.indexOf(t);
      if (i >= 0) timerQueue.splice(i, 1);
      t.f();
    }
  };
  return {
    Input, kb, press, fire: fireAll, sb, $: sb.document.getElementById,
    flushTimers, pendingTimers: () => timerQueue.length,
  };
}
// The UI module reads Input from the same realm; boot() runs input.js in a
// context whose globals are `sb`, so createContext(sb) is that same realm.

// The slot chip for (action, slot) anywhere under a rendered table.
export function slotOf(node, action, slot) {
  if (node.dataset && node.dataset.action === action && node.dataset.slot === String(slot)) return node;
  for (const child of node.kids || []) { const hit = slotOf(child, action, slot); if (hit) return hit; }
  return null;
}

export const rawPad = (extra) => Object.assign({ connected: true, mapping: "standard", id: "Xbox Wireless Controller", index: 0, axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }, extra);
export const setBtn = (pad, i, down) => { pad.buttons[i] = { pressed: down, value: down ? 1 : 0 }; };
// A stable menu layer + a focused control, so the pad's menu walk is observable.
export function menuRig() {
  const r = boot();
  let t = 0; r.sb.performance.now = () => t;
  r.tick = () => { t += 16; r.Input.poll(); };
  const layer = { id: "overlay", contains: () => true };
  r.sb.MenuNav = { activeLayer: () => layer, FOCUSABLE: "button" };
  r.sb.UiLayers.top = () => layer;
  r.navOpen.on = true;
  r.clicks = 0;
  r.sb.document.activeElement = { tagName: "BUTTON", disabled: false, matches: () => true, click() { r.clicks++; } };
  return r;
}

// Keep cancelled callbacks runnable: a queued callback must remain harmless
// even after clearTimeout, and must not cancel a fresh request in its place.
export function delayedCalibration() {
  let leave;
  const disk = { padRest: 0.08 };
  const r = bootUi(true, {}, disk, (sb) => { sb.SettingsNav = { onLeave: (fn) => { leave = fn; } }; });
  const device = fakePad(r.sb, r.fire);
  device.pad.index = 0;
  device.pad.axes[0] = 0.08;
  r.Input.poll();
  const timers = [], cleared = [];
  r.sb.setTimeout = (fn, ms) => { const id = timers.length + 1; timers.push({ fn, ms, id }); return id; };
  r.sb.clearTimeout = (id) => cleared.push(id);
  return { ...r, ...device, disk, timers, cleared, leave: (id) => leave(id) };
}

export function withProfileStore(sb) {
  const data = new Map();
  sb.GameStore = { store: { get: (k, d) => data.has(k) ? data.get(k) : d,
    set(k, v) { data.set(k, plain(v)); return true; } } };
}
