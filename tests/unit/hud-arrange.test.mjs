/* hud-arrange.test.mjs — ARRANGE HUD (js/ui/hud-arrange.js), the on-screen
 * editor for MOVE & SIZE. Pure maths only: a drag becomes a share-of-screen
 * offset, a pinch a stepped size, overlapping rects a clash list.
 * Fail-before: without the module the pause card has no editor and the slider
 * fold is the only way to place a piece. Run: node --test tests/unit/hud-arrange.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/ui/hud-arrange.js"), "utf8");

function load() {
  const ctx = { Log: { info() {}, warn() {}, debug() {}, enabled() { return false; } },
    M4: { clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v) } };   // the shared clamp the module aliases
  vm.createContext(ctx);
  vm.runInContext(SRC.replace(/^const\b/gm, "var"), ctx);
  return ctx.HudArrange;
}
// vm-realm objects fail deepStrictEqual on prototype identity: compare plain copies.
const plain = (v) => JSON.parse(JSON.stringify(v));

test("dragTo: screen px become a share of the screen, rounded to 0.1 and clamped at HudLayout's ±50", () => {
  const A = load();
  assert.deepEqual(plain(A.dragTo({ x: 0, y: 0 }, 84.4, -39, 844, 390)), { x: 10, y: -10 });
  assert.deepEqual(plain(A.dragTo({ x: 12, y: 3 }, 0, 0, 844, 390)), { x: 12, y: 3 }, "no movement keeps the offset");
  assert.deepEqual(plain(A.dragTo({ x: 45, y: -45 }, 844, -390, 844, 390)), { x: 50, y: -50 }, "clamped at the slider's range");
  assert.deepEqual(plain(A.dragTo(null, 8.44, 3.9, 844, 390)), { x: 1, y: 1 }, "a missing origin is the shipped 0 / 0");
  assert.deepEqual(plain(A.dragTo({ x: 0, y: 0 }, 10, 10, 0, 0)), { x: 50, y: 50 }, "a zero-size screen cannot divide by zero");
});

test("pinchTo: a pinch scales the size on 5 % steps between 50 and 200; a zero distance is ignored", () => {
  const A = load();
  assert.equal(A.pinchTo(100, 100, 150), 150);
  assert.equal(A.pinchTo(100, 100, 123), 125, "rounded to the slider's 5 % step");
  assert.equal(A.pinchTo(100, 100, 10), 50, "floored at 50");
  assert.equal(A.pinchTo(150, 100, 400), 200, "capped at 200");
  assert.equal(A.pinchTo(100, 0, 150), 100, "no first distance: unchanged");
  assert.equal(A.pinchTo(100, 100, 0), 100, "no second distance: unchanged");
});

test("stepSize: the toolbar's − / + move by STEP inside the range", () => {
  const A = load();
  assert.equal(A.stepSize(100, 1), 100 + A.STEP);
  assert.equal(A.stepSize(55, -1), 50);
  assert.equal(A.stepSize(200, 1), 200);
});

test("clashes: only pairs overlapping by more than the margin on BOTH axes; touching and empty rects are not clashes", () => {
  const A = load();
  const r = (id, l, t, w, h) => ({ id, l, t, r: l + w, b: t + h });
  const pairs = A.clashes([
    r("tower", 200, 8, 400, 50),
    r("map", 10, 8, 128, 128),
    r("gaps", 138, 8, 60, 20),         // touches the map's right edge exactly: not a clash
    r("damage", 560, 60, 100, 40),
    r("inputs", 570, 70, 100, 40),     // 90 x 30 over DAMAGE
    r("#btn-boost", 580, 90, 72, 72),  // 90 x 10 over DAMAGE (10 > 3), 90 x 20 over INPUTS
    r("flag", 300, 100, 0, 0),         // empty: skipped
    r("limits", 150, 140, 60, 20),     // 1 px into the map on y only (map bottom 136): not a clash
  ]);
  assert.deepEqual(plain(pairs), [["damage", "inputs"], ["damage", "#btn-boost"], ["inputs", "#btn-boost"]]);
  assert.deepEqual(plain(A.clashes([r("a", 0, 0, 10, 10), r("b", 8, 8, 10, 10)], 3)), [], "2 px of overlap is under the margin");
  assert.deepEqual(plain(A.clashes([r("a", 0, 0, 10, 10), r("b", 6, 6, 10, 10)], 3)), [["a", "b"]]);
  assert.equal(A.MIN_CLASH, 3);
});

test("visIds / visShown: which HUD ELEMENTS toggles a piece maps to, and when it reads as shown", () => {
  const A = load();
  assert.deepEqual(plain(A.visIds("tower")), ["pos", "lap", "time", "best"], "the tower is its four boxes together");
  assert.deepEqual(plain(A.visIds("gearbox")), ["gear"]);
  for (const id of ["map", "gaps", "mirror", "flag", "announce", "nope"]) assert.deepEqual(plain(A.visIds(id)), [], id + " has no toggle here");
  const off = new Set(["pos", "lap", "time", "best", "speed"]);
  const isOn = (v) => !off.has(v);
  assert.equal(A.visShown("tower", isOn), false, "all four tower boxes off: hidden");
  assert.equal(A.visShown("speed", isOn), false);
  assert.equal(A.visShown("sectors", isOn), true);
  assert.equal(A.visShown("map", isOn), true, "a piece with no toggle always reads as shown");
  off.delete("lap");
  assert.equal(A.visShown("tower", isOn), true, "any tower box on: shown");
  // Every toggle id the editor writes is one js/ui/hud-elements.js declares.
  const elSrc = fs.readFileSync(path.join(ROOT, "js/ui/hud-elements.js"), "utf8");
  for (const ids of Object.values(A.VIS)) for (const v of ids) assert.match(elSrc, new RegExp('\\["' + v + '", "'), v + " is a HudElements id");
});

test("create: inert without a document or HudLayout; the pure API is frozen", () => {
  const A = load();
  assert.equal(A.create({}), null, "no document, no editor");
  assert.ok(Object.isFrozen(A));
  assert.deepEqual(plain(A.LIM), { x: [-50, 50], y: [-50, 50], s: [50, 200] }, "the same range HudLayout.LIM clamps to");
});

// Exercise the real editor listeners with a tiny DOM and a controllable frame queue.
function editor() {
  const ids = new Map(), listeners = {}, frames = new Map(), writes = [], observers = [];
  let frame = 0, set = 'chase', profile = 'standard';
  class El {
    constructor(tag = 'div') { this.tagName = tag; this.children = []; this.attrs = {}; this.hidden = false; this.style = { removeProperty() {} }; this.isConnected = true; }
    set id(v) { this._id = v; ids.set(v, this); } get id() { return this._id; }
    setAttribute(k, v) { this.attrs[k] = v; } getAttribute(k) { return this.attrs[k] ?? null; }
    hasAttribute(k) { return k in this.attrs; } removeAttribute(k) { delete this.attrs[k]; }
    appendChild(e) { this.children.push(e); e.parentNode = this; return e; }
    insertBefore(e) { return this.appendChild(e); }
    contains(e) { return this === e || this.children.some(c => c.contains(e)); }
    closest(sel) { return sel === '#piece' && this.id === 'piece' ? this : null; }
    getBoundingClientRect() { return { left: 10, top: 10, right: 30, bottom: 30, width: 20, height: 20 }; }
    focus() { doc.activeElement = this; }
  }
  const body = new El(), doc = { body, createElement: tag => new El(tag), activeElement: null,
    getElementById: id => ids.get(id), querySelector: sel => ids.get(sel.slice(1)), querySelectorAll: () => [],
    addEventListener: (name, fn) => { (listeners[name] ||= []).push(fn); } };
  for (const id of ['piece', 'pmsettings', 'pausemenu', 'pm-hud-details', 'pm-hud-details-sum', 'rotate-device']) { const e = new El(); e.id = id; body.appendChild(e); }
  ids.get('rotate-device').setAttribute('aria-hidden', 'true');
  const values = new Map();
  const key = (sn = set, pn = profile) => sn + ':' + pn;
  const get = (id, sn, pn) => ({ x: 0, y: 0, s: 100, ...values.get(key(sn, pn)) });
  const layout = { ELEMENTS: [['piece', 'Piece', '#piece']], shown: () => set, profile: () => profile, get,
    set(id, v, sn, pn) { writes.push({ id, v: { ...v }, sn, pn }); values.set(key(sn, pn), { ...get(id, sn, pn), ...v }); }, resetEl() {} };
  const ctx = { document: doc, window: { innerWidth: 1000, innerHeight: 500, addEventListener: (name, fn) => { (listeners[name] ||= []).push(fn); } },
    HudLayout: layout, M4: { clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)) }, Log: { info() {} },
    requestAnimationFrame: fn => { frames.set(++frame, fn); return frame; }, cancelAnimationFrame: n => frames.delete(n),
    MutationObserver: class { constructor(fn) { observers.push(fn); } observe() {} } };
  vm.createContext(ctx); vm.runInContext(SRC.replace(/^const\b/gm, 'var'), ctx);
  const api = ctx.HudArrange.create({ $: id => ids.get(id) });
  const fire = (name, args = {}) => { const e = { target: ids.get('piece'), pointerId: 1, clientX: 100, clientY: 100, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}, ...args }; for (const fn of listeners[name] || []) fn(e); };
  const tick = () => { const todo = [...frames.values()]; frames.clear(); for (const fn of todo) fn(); };
  return { api, fire, tick, writes, ids, frames, doc, get, observers, context(sn, pn = profile) { set = sn; profile = pn; for (const fn of observers) fn(); } };
}

test('editor: exit flushes the final drag once into its original camera/style and clears its frame', () => {
  const e = editor(); e.api.setEditing(true);
  e.fire('pointerdown'); e.fire('pointermove', { clientX: 200 });
  e.context('cockpit', 'broadcast');
  assert.equal(e.api.isEditing(), false);
  assert.equal(e.writes.length, 1);
  assert.equal(e.writes[0].sn, 'chase'); assert.equal(e.writes[0].pn, 'standard');
  assert.equal(e.writes[0].v.x, 10); assert.equal(e.frames.size, 0);
  e.tick(); assert.equal(e.writes.length, 1);
});

test('editor: lifting either pinch finger rebases the remaining drag without a position jump', () => {
  for (const lifted of [1, 2]) {
    const e = editor(); e.api.setEditing(true);
    e.fire('pointerdown'); e.fire('pointerdown', { pointerId: 2, clientX: 200 });
    e.fire('pointermove', { clientX: 130 });
    e.fire('pointermove', { pointerId: 2, clientX: 260 });
    e.fire('pointerup', { pointerId: lifted });
    const remaining = lifted === 1 ? 2 : 1, x = remaining === 1 ? 130 : 260;
    e.fire('pointermove', { pointerId: remaining, clientX: x + 10 }); e.tick();
    assert.equal(e.writes.at(-1).v.x, 1);
  }
});

test('editor: keyboard entry selects a readout, focuses the selector and moves with arrows', () => {
  const e = editor(); e.api.setEditing(true);
  assert.equal(e.api.selected(), 'piece'); assert.equal(e.doc.activeElement.id, 'hud-arrange-element');
  e.fire('keydown', { key: 'ArrowRight', target: e.ids.get('hud-arrange-move') });
  assert.equal(e.writes.at(-1).v.x, 1, "one press survives the layout store's integer snap");
  e.fire('keydown', { key: 'ArrowDown', shiftKey: true, target: e.ids.get('hud-arrange-move') });
  assert.equal(e.writes.at(-1).v.y, 5);
  e.fire('keydown', { key: 'Escape' }); assert.equal(e.api.isEditing(), false);
});

test('editor: resize and rotation prompt end editing and preserve pending movement', () => {
  for (const kind of ['resize', 'rotate']) {
    const e = editor(); e.api.setEditing(true); e.fire('pointerdown'); e.fire('pointermove', { clientX: 150 });
    if (kind === 'resize') e.fire('resize');
    else { e.ids.get('rotate-device').setAttribute('aria-hidden', 'false'); for (const fn of e.observers) fn(); }
    assert.equal(e.api.isEditing(), false); assert.equal(e.writes.at(-1).v.x, 5); assert.equal(e.frames.size, 0);
  }
});
