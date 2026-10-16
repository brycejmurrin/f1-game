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
const POLICY = fs.readFileSync(path.join(ROOT, "js/ui/hud-layout.js"), "utf8");
const ROW = fs.readFileSync(path.join(ROOT, "js/ui/setting-row.js"), "utf8");

function visibilityPolicy(elements, stored = {}, rows = {}, environment = {}) {
  const ctx = { document: { readyState: 'loading', querySelector: () => null,
    documentElement: environment.root,
    getElementById: id => rows[id] || null, addEventListener() {} }, HudElements: elements,
    Event: class { constructor(type) { this.type = type; } },
    GameStore: { store: { get: (k, d) => k in stored ? stored[k] : d, set: (k, v) => { stored[k] = v; } } }, ...environment };
  vm.createContext(ctx); vm.runInContext(POLICY.replace(/^const\b/gm, 'var'), ctx);
  return ctx.HudLayout;
}

function load() {
  const ctx = { HudLayout: visibilityPolicy(), Log: { info() {}, warn() {}, debug() {}, enabled() { return false; } },
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

test("placedOrig: an auto-placed radio card's first drag starts from where it sits, measured from the fixed point", () => {
  const A = load();
  // 844x390: the fixed point is (422, 97.5). A card at (633, 117) is +25 % across and +5 % down from it.
  assert.deepEqual(plain(A.placedOrig({ x: 0, y: 0, s: 100 }, 633, 117, 844, 390)), { x: 25, y: 5, s: 100 });
  assert.deepEqual(plain(A.placedOrig({ x: 10, y: -4, s: 120 }, 633, 117, 844, 390)), { x: 10, y: -4, s: 120 }, "an already moved card keeps its offset");
  const back = A.dragTo(A.placedOrig({ x: 0, y: 0, s: 100 }, 211, 97.5, 844, 390), 0, 0, 844, 390);
  assert.deepEqual(plain(back), { x: -25, y: 0 }, "a still press leaves it in place");
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

test("create: inert without a document or HudLayout; the pure API is frozen", () => {
  const A = load();
  assert.equal(A.create({}), null, "no document, no editor");
  assert.ok(Object.isFrozen(A));
});

// Exercise the real editor listeners with a tiny DOM and a controllable frame queue.
function editor(pieceId = "piece", options = {}) {
  const ids = new Map(), listeners = {}, frames = new Map(), writes = [], observers = [];
  let frame = 0, set = 'chase', profile = 'standard';
  class El {
    constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.listeners = {}; this.hidden = false; this.style = { removeProperty(k) { delete this[k]; }, setProperty(k,v) { this[k]=v; }, getPropertyValue(k) { return this[k] || ""; } }; this.isConnected = true; }
    set textContent(v) { this._text = v; this.children = []; } get textContent() { return this._text || this.children.map(c => c.textContent).join(''); }
    replaceChildren(...kids) { this.children = []; for (const kid of kids) this.appendChild(kid); }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    dispatchEvent(e) { e.stopPropagation ||= () => {}; for (const fn of this.listeners[e.type] || []) fn(e); }
    set id(v) { this._id = v; ids.set(v, this); } get id() { return this._id; }
    setAttribute(k, v) { this.attrs[k] = v; } getAttribute(k) { return this.attrs[k] ?? null; }
    hasAttribute(k) { return k in this.attrs; } removeAttribute(k) { delete this.attrs[k]; }
    appendChild(e) { this.children.push(e); e.parentNode = this; return e; }
    insertBefore(e) { return this.appendChild(e); }
    removeChild(e) { this.children.splice(this.children.indexOf(e), 1); }
    contains(e) { return this === e || this.children.some(c => c.contains(e)); }
    closest(sel) { return sel === "#" + pieceId && this.id === pieceId ? this : null; }
    getBoundingClientRect() {
      if (this.id === 'hud-arrange-bar') {
        const left = parseFloat(this.style.left) || 0, top = parseFloat(this.style.top) || 0;
        return { left, top, right: left + this.offsetWidth, bottom: top + this.offsetHeight, width: this.offsetWidth, height: this.offsetHeight };
      }
      return { left: 10, top: 10, right: 30, bottom: 30, width: 20, height: 20 };
    }
    get offsetWidth() {
      if (this.hidden || this.id !== 'hud-arrange-bar') return 0;
      return Math.min(options.toolbarSize ? options.toolbarSize(ids).width : 320, parseFloat(this.style.maxWidth) || Infinity);
    }
    get offsetHeight() {
      if (this.hidden || this.id !== 'hud-arrange-bar') return 0;
      return Math.min(options.toolbarSize ? options.toolbarSize(ids).height : 52, parseFloat(this.style.maxHeight) || Infinity);
    }
    focus() { doc.activeElement = this; }
  }
  const body = new El(); body.dataset = {};
  const doc = { body, createElement: tag => new El(tag), activeElement: null,
    getElementById: id => ids.get(id), querySelector: sel => ids.get(sel.slice(1)), querySelectorAll: () => [],
    addEventListener: (name, fn) => { (listeners[name] ||= []).push(fn); } };
  for (const id of [pieceId, 'hud', 'overlay', 'pmsettings', 'pausemenu', 'pm-hud-details', 'pm-hud-details-sum', 'rotate-device']) { const e = new El(); e.id = id; body.appendChild(e); }
  ids.get('rotate-device').setAttribute('aria-hidden', 'true');
  const values = new Map();
  const key = (sn = set, pn = profile) => sn + ':' + pn;
  const get = (id, sn, pn) => ({ x: 0, y: 0, s: 100, ...values.get(key(sn, pn)) });
  const layout = { ELEMENTS: [[pieceId, 'Piece', '#' + pieceId]], shown: () => set, profile: () => profile, get,
    set(id, v, sn, pn) {
      writes.push({ id, v: { ...v }, sn, pn });
      const stored = options.snap ? Object.fromEntries(Object.entries(v).map(([k,n]) => [k, Math.round(n)])) : v;
      values.set(key(sn, pn), { ...get(id, sn, pn), ...stored });
      if (id === 'map') { const el = ids.get(pieceId); el.setAttribute('data-hl-user', ''); el.style.removeProperty('--hud-clear-x'); el.style.removeProperty('--hud-clear-y'); }
    }, resetEl() {} };
  const on = new Set(Array.isArray(options.on) ? options.on : options.on ? [pieceId] : []), visibilityWrites = [];
  const elements = { isOn: id => on.has(id), setMany(ids, enabled) {
    for (const id of ids) { visibilityWrites.push({ id, enabled }); if (enabled) on.add(id); else on.delete(id); }
  }, apply() {} };
  const preferences = {}, rows = {};
  for (const [id, key] of [['map', 'hudMapVis'], ['gaps', 'hudGapsVis'], ['mirror', 'hudMirror']]) {
    preferences[key] = options.visibility || (id === 'mirror' ? 'auto' : 'on');
    rows['pm-hud' + id + '-sel'] = { value: preferences[key], dispatchEvent() { preferences[key] = this.value; } };
  }
  const viewport = { innerWidth: options.width || 1000, innerHeight: options.height || 500, addEventListener: (name, fn) => { (listeners[name] ||= []).push(fn); } };
  const policy = visibilityPolicy(elements, preferences, rows, { window: viewport, root: {},
    getComputedStyle: () => ({ getPropertyValue: key => options.insets?.[key] || '0px' }) });
  Object.assign(layout, { LIM: policy.LIM, visibilityIds: policy.visibilityIds, visibility: policy.visibility, setVisibility: policy.setVisibility,
    screenBounds: policy.screenBounds, fit() {} });
  if (options.hidden) ids.get(pieceId).hidden = true;
  if (options.rect) ids.get(pieceId).getBoundingClientRect = () => options.rect;
  const ctx = { document: doc, window: viewport,
    HudElements: elements,
    HudLayout: layout, M4: { clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)) }, Log: { info() {} },
    requestAnimationFrame: fn => { frames.set(++frame, fn); return frame; }, cancelAnimationFrame: n => frames.delete(n),
    MutationObserver: class { constructor(fn) { observers.push(fn); } observe() {} } };
  vm.createContext(ctx); vm.runInContext(ROW, ctx); ctx.SettingRow = ctx.window.SettingRow;
  vm.runInContext(SRC.replace(/^const\b/gm, 'var'), ctx);
  const api = ctx.HudArrange.create({ $: id => ids.get(id) });
  const fire = (name, args = {}) => { const e = { target: ids.get(pieceId), pointerId: 1, clientX: 100, clientY: 100, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}, ...args }; for (const fn of listeners[name] || []) fn(e); };
  const tick = () => { const todo = [...frames.values()]; frames.clear(); for (const fn of todo) fn(); };
  return { api, fire, tick, writes, ids, frames, doc, get, observers, on, visibilityWrites, preferences, viewport,
    chooseVisibility(value) { const select = ids.get('hud-arrange-vis'); select.value = value; select.dispatchEvent({ type: 'change' }); },
    context(sn, pn = profile) { set = sn; profile = pn; for (const fn of observers) fn(); } };
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

test('editor: title preview restores shell visibility on normal and interrupted exits without saving it', () => {
  for (const titleHidden of [false, true]) for (const restore of [true, false]) {
    const e = editor(); e.ids.get('hud').hidden = true; e.ids.get('overlay').hidden = titleHidden;
    e.api.setEditing(true);
    assert.equal(e.ids.get('hud').hidden, false); assert.equal(e.ids.get('overlay').hidden, true);
    const bar = e.ids.get('hud-arrange-bar');
    assert.equal(bar.getAttribute('role'), 'toolbar'); assert.equal(bar.getAttribute('aria-label'), 'Arrange HUD');
    assert.equal(bar.getAttribute('data-esc-close'), 'hud-arrange-done');
    e.api.setEditing(false, restore);
    assert.equal(e.ids.get('hud').hidden, true); assert.equal(e.ids.get('overlay').hidden, titleHidden);
    assert.equal(e.writes.length, 0);
  }
  const race = editor(); race.ids.get('overlay').hidden = true;
  race.api.setEditing(true); race.api.setEditing(false);
  assert.equal(race.ids.get('hud').hidden, false); assert.equal(race.ids.get('overlay').hidden, true);
});

test('editor: resizing preserves selection and pending movement, ends the old gesture and reflows once', () => {
  const e = editor(); e.api.setEditing(true); e.fire('pointerdown'); e.fire('pointermove', { clientX: 150 });
  e.viewport.innerWidth = 600; e.viewport.innerHeight = 300;
  e.fire('resize'); e.fire('resize');
  assert.equal(e.api.isEditing(), true); assert.equal(e.api.selected(), 'piece');
  assert.equal(e.writes.length, 1); assert.equal(e.writes[0].v.x, 5); assert.equal(e.frames.size, 1);
  e.tick(); e.fire('pointermove', { clientX: 200 }); e.tick();
  assert.equal(e.writes.length, 1, 'the old pointer cannot move the piece in the new coordinate system');
  const r = e.ids.get('hud-arrange-bar').getBoundingClientRect();
  assert.ok(r.left >= 8 && r.right <= 592 && r.top >= 8 && r.bottom <= 292);
  e.fire('resize'); e.api.setEditing(false);
  assert.equal(e.frames.size, 0, 'exit also cancels a queued reflow');
});

test('editor: a required rotation prompt ends editing and restores its original dialog', () => {
  const e = editor(); e.api.setEditing(true); e.fire('pointerdown'); e.fire('pointermove', { clientX: 150 });
  e.ids.get('rotate-device').setAttribute('aria-hidden', 'false'); for (const fn of e.observers) fn();
  assert.equal(e.api.isEditing(), false); assert.equal(e.writes.at(-1).v.x, 5); assert.equal(e.frames.size, 0);
  assert.equal(e.ids.get('pmsettings').hidden, false);
});


test("editor: a radio pinch rebases the remaining finger from its painted position", () => {
  const e = editor("announce"); e.api.setEditing(true);
  e.fire("pointerdown", { pointerId: 1, clientX: 100 });
  e.fire("pointerdown", { pointerId: 2, clientX: 120 });
  e.fire("pointermove", { pointerId: 2, clientX: 140 }); e.tick();
  assert.equal(e.get("announce").s, 200);
  e.fire("pointerup", { pointerId: 2 });
  e.fire("pointermove", { pointerId: 1, clientX: 101 }); e.tick();
  assert.equal(e.get("announce").x, -48.9, "one pixel follows the measured radio origin, not the unplaced zero");
  assert.equal(e.get("announce").y, -23);
});


test('editor: first keyboard radio move starts at its painted position on phone landscape', () => {
  const e = editor('announce', { width: 844, height: 390, rect: { left: 148, top: 106, right: 348, bottom: 146, width: 200, height: 40 } });
  e.api.setEditing(true);
  const move = (key, shiftKey = false) => e.fire('keydown', { key, shiftKey, target: e.ids.get('hud-arrange-move') });
  move('ArrowRight');
  assert.ok(Math.abs(e.get('announce').x - ((148 - 422) / 844 * 100 + 1)) < 1e-9);
  assert.ok(Math.abs(e.get('announce').y - ((106 - 97.5) / 390 * 100)) < 1e-9);
  const before = e.get('announce'); move('ArrowDown', true);
  assert.equal(e.get('announce').x, before.x); assert.equal(e.get('announce').y, before.y + 5);
  for (let i = 0; i < 30; i++) move('ArrowLeft', true);
  assert.equal(e.get('announce').x, -50);
});

test('editor: opt-in readouts are selectable previews without enabling them and restore on exit', () => {
  for (const id of ['rel', 'strat', 'inputs']) {
    const e = editor(id, { hidden: true }), root = e.ids.get(id);
    const original = e.doc.createElement('div'); original.textContent = 'producer content'; original.hidden = false; root.appendChild(original);
    root.setAttribute('data-col-compact', ''); root.setAttribute('data-col-drop', 'fit');
    e.api.setEditing(true);
    assert.equal(root.hidden, false); assert.equal(e.api.selected(), id);
    assert.ok(e.ids.get('hud-arrange-element').children.some(option => option.value === id));
    assert.equal(root.hasAttribute('data-hl-off'), true);
    assert.deepEqual(e.visibilityWrites, []);
    assert.equal(root.hasAttribute('data-col-drop'), false);
    assert.equal(root.hasAttribute('data-col-compact'), true);
    if (id !== 'inputs') {
      assert.equal(original.hidden, true);
      const preview = root.children.at(-1);
      if (id === 'rel') {
        assert.equal(preview.hasAttribute('data-col-row'), true);
        assert.deepEqual(preview.children.map(cell => cell.textContent), ['P2', 'YOU', '+0.8', 'M', '']);
      } else {
        assert.equal(preview.getAttribute('data-k'), 'next');
        assert.deepEqual(preview.children.map(cell => cell.textContent), ['NEXT', 'LAP 12']);
      }
    }
    const vis = e.ids.get('hud-arrange-vis');
    assert.equal(vis.value, 'off'); e.chooseVisibility(vis.value === 'off' ? 'on' : 'off');
    assert.equal(e.on.has(id), true); assert.equal(root.hidden, false); assert.equal(vis.value, 'on');
    e.chooseVisibility(vis.value === 'off' ? 'on' : 'off'); assert.equal(e.on.has(id), false); assert.equal(root.hidden, false);
    e.api.setEditing(false);
    assert.equal(root.hidden, true); assert.equal(root.children.length, 1);
    assert.equal(root.getAttribute('data-col-drop'), 'fit');
    assert.equal(original.hidden, false); assert.equal(original.textContent, 'producer content');
    // A paused toggle can be on before its producer has refreshed hidden=true.
    e.on.add(id); e.api.setEditing(true);
    assert.equal(root.hidden, false); assert.equal(e.ids.get('hud-arrange-vis').value, 'on');
    e.api.setEditing(false); assert.equal(root.hidden, true); assert.equal(e.on.has(id), true);
  }
});


test('editor: visible optional readouts lift and restore producer drop state without replacing content', () => {
  const e = editor('rel', { on: true }), root = e.ids.get('rel');
  const row = e.doc.createElement('div'); row.textContent = 'live row'; root.appendChild(row);
  root.setAttribute('data-col-drop', '');
  e.api.setEditing(true);
  assert.equal(root.hasAttribute('data-col-drop'), false); assert.equal(root.children.length, 1);
  assert.equal(row.hidden, false);
  e.api.setEditing(false);
  assert.equal(root.hidden, false); assert.equal(root.getAttribute('data-col-drop'), '');
  assert.equal(row.textContent, 'live row'); assert.deepEqual(e.visibilityWrites, []);
});


test('editor: tower hide/show includes DELTA and leaves SPEED independent', () => {
  const tower = ['pos', 'lap', 'time', 'best', 'delta'];
  const e = editor('tower', { on: [...tower, 'speed'] });
  e.api.setEditing(true);
  const vis = e.ids.get('hud-arrange-vis');
  assert.equal(vis.value, 'on');
  e.chooseVisibility(vis.value === 'off' ? 'on' : 'off');
  assert.deepEqual([...e.on], ['speed'], 'no timing-tower child remains on');
  assert.equal(vis.value, 'off');
  e.chooseVisibility(vis.value === 'off' ? 'on' : 'off');
  for (const id of tower) assert.equal(e.on.has(id), true, id + ' returns with the tower');
  assert.equal(e.on.has('speed'), true);
  // DELTA can be the only enabled child after individual settings changes.
  for (const id of tower) if (id !== 'delta') e.on.delete(id);
  e.api.setEditing(false); e.api.setEditing(true);
  assert.equal(vis.value, 'mixed', 'a delta-only tower remains partly shown');
  e.chooseVisibility(vis.value === 'off' ? 'on' : 'off');
  assert.deepEqual([...e.on], ['speed']);
});


test('editor: initial toolbar avoids the HUD using its visible content-sized box', () => {
  const piece = { left: 110, top: 10, right: 210, bottom: 70, width: 100, height: 60 };
  const e = editor('speed', { on: true, rect: piece, toolbarSize: ids => {
    // The populated toolbar is wider and taller than either its empty shell
    // or the hidden element's zero-size box. Use the final size readout.
    const current = ids.get('hud-arrange-name').textContent === '100%' &&
      ids.get('hud-arrange-hint').hidden;
    return current ? { width: 800, height: 100 } : { width: 200, height: 52 };
  } });
  e.api.setEditing(true);
  const bar = e.ids.get('hud-arrange-bar');
  assert.equal(bar.hidden, false);
  assert.equal(bar.offsetWidth, 800);
  assert.equal(bar.offsetHeight, 100);
  // Derive the painted slot from its actual dimensions and positioning.
  const left = parseFloat(bar.style.left), top = parseFloat(bar.style.top);
  const overlap = Math.max(0, Math.min(left + bar.offsetWidth, piece.right) - Math.max(left, piece.left)) *
    Math.max(0, Math.min(top + bar.offsetHeight, piece.bottom) - Math.max(top, piece.top));
  assert.equal(overlap, 0, 'the visible toolbar fits below the HUD rather than using a fictitious narrow top slot');
  assert.ok(top > piece.bottom);
});

test('editor: toolbar uses the clear middle when every edge covers HUD content', () => {
  const top = { left: 100, top: 8, right: 900, bottom: 108, width: 800, height: 100 };
  const bottom = { left: 100, top: 392, right: 900, bottom: 492, width: 800, height: 100 };
  const e = editor('speed', { on: true, rect: top, toolbarSize: () => ({ width: 800, height: 100 }) });
  const control = e.doc.createElement('button'); control.getBoundingClientRect = () => bottom;
  e.doc.querySelectorAll = () => [control];
  e.api.setEditing(true);
  const bar = e.ids.get('hud-arrange-bar');
  assert.equal(bar.style.top, '200px'); assert.equal(bar.style.left, '100px');
  assert.equal(bar.style.transform, 'none');
  const painted = { top: (500 - bar.offsetHeight) / 2, bottom: (500 + bar.offsetHeight) / 2 };
  assert.ok(painted.top > top.bottom && painted.bottom < bottom.top, 'neither edge readout is obscured');
});

test('editor: toolbar stays inside asymmetric safe areas on a narrow, short screen', () => {
  const e = editor('speed', { on: true, width: 420, height: 180,
    insets: { '--sal': '70px', '--sar': '10px', '--sat': '20px', '--sab': '15px' },
    toolbarSize: () => ({ width: 800, height: 200 }) });
  e.api.setEditing(true);
  const r = e.ids.get('hud-arrange-bar').getBoundingClientRect();
  assert.ok(r.left >= 78 && r.top >= 28 && r.right <= 402 && r.bottom <= 157, JSON.stringify(r));
});


test('editor: first cleared-map edits adopt its painted origin on the whole-percent grid', () => {
  for (const kind of ['keyboard', 'drag', 'size', 'pinch']) {
    const e = editor('map', { snap: true }), map = e.ids.get('map');
    map.style.setProperty('--hud-clear-x', '117px'); map.style.setProperty('--hud-clear-y', '25px');
    map.getBoundingClientRect = () => {
      const cur=e.get('map'), left=10+cur.x*10+parseFloat(map.style.getPropertyValue('--hud-clear-x')||0);
      const top=10+cur.y*5+parseFloat(map.style.getPropertyValue('--hud-clear-y')||0);
      return {left,top,right:left+20,bottom:top+20,width:20,height:20};
    };
    e.api.setEditing(true);
    e.ids.get('hud-arrange-element').onchange();
    assert.equal(e.writes.length,0,'opening and selecting the map never saves an offset');
    if(kind==='keyboard')e.fire('keydown',{key:'ArrowRight',target:e.ids.get('hud-arrange-move')});
    if(kind==='drag') {e.fire('pointerdown');e.fire('pointermove',{clientX:120});e.tick();e.fire('pointermove',{clientX:130});e.tick();}
    if(kind==='size')e.ids.get('hud-arrange-larger').onclick();
    if(kind==='pinch') {e.fire('pointerdown');e.fire('pointerdown',{pointerId:2,clientX:200});e.fire('pointermove',{pointerId:2,clientX:300});e.tick();}
    const cur=e.get('map');
    assert.equal(cur.x,kind==='keyboard'?13:kind==='drag'?15:12,kind+' retains the temporary horizontal correction');
    assert.equal(cur.y,5,kind+' retains the temporary vertical correction');
    if(kind==='size')assert.equal(cur.s,110);
    if(kind==='pinch')assert.equal(cur.s,200);
    assert.equal(map.getBoundingClientRect().top,35);
  }
});

test('editor: explicit custom maps never adopt stale automatic clearance', () => {
  const e=editor('map',{snap:true}),map=e.ids.get('map');
  map.setAttribute('data-hl-user','');map.style.setProperty('--hud-clear-x','117px');
  e.api.setEditing(true);e.ids.get('hud-arrange-larger').onclick();
  assert.equal(e.get('map').x,0);assert.equal(e.get('map').y,0);assert.equal(e.get('map').s,110);
});

test('editor: hidden map, gaps and mirror stay selectable and their owner modes can be restored', () => {
  for (const id of ['map', 'gaps', 'mirror']) {
    const e = editor(id, { hidden: true, visibility: 'off' });
    e.api.setEditing(true);
    assert.equal(e.api.selected(), id);
    assert.ok(e.ids.get('hud-arrange-element').children.some(option => option.value === id));
    assert.equal(e.ids.get('hud-arrange-vis').value, 'off');
    e.chooseVisibility('on');
    assert.equal(e.ids.get('hud-arrange-vis').value, 'on');
    e.chooseVisibility('auto');
    assert.equal(e.ids.get('hud-arrange-vis').value, 'auto');
    assert.equal(e.preferences[id === 'map' ? 'hudMapVis' : id === 'gaps' ? 'hudGapsVis' : 'hudMirror'], 'auto');
    assert.equal(e.writes.length, 0, 'changing visibility does not move the piece');
  }
});
