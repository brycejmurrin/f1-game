/* dock-layout.test.mjs — per-scheme touch-dock REPOSITION (plan slice 2).
 * Fail-before: without DockLayout, clamp / per-scheme isolation / identity
 * apply cannot hold. Run: node --test tests/unit/dock-layout.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";
import { cssRules } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/ui/dock-layout.js"), "utf8");

let lastWin;
function loadDock() {
  lastWin = { innerWidth: 400, innerHeight: 800, visualViewport: { width: 0, height: 0 } };
  const ctx = {
    Log: { info() {}, warn() {}, debug() {}, enabled() { return false; } },
    window: lastWin,
    document: { documentElement: {} },
    getComputedStyle() { return { getPropertyValue() { return "0"; } }; },
  };
  vm.createContext(ctx);
  // The real CssZoom (window.CssZoom IIFE) — dock-layout reads the dock's own zoom through it.
  ctx.document.createElement = () => ({ style: {}, getBoundingClientRect: () => ({ width: 200 }) });
  ctx.document.documentElement.appendChild = () => {};
  ctx.document.documentElement.removeChild = () => {};
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/css-zoom.js"), "utf8"), ctx, { filename: absSrc("js/ui/css-zoom.js") });
  ctx.CssZoom = ctx.window.CssZoom;
  vm.runInContext(SRC.replace(/^const\b/gm, "var"), ctx);
  return Object.assign({ __doc: ctx.document }, ctx.DockLayout);
}
const DL = loadDock();
assert.ok(DL && DL.clampXY, "DockLayout IIFE must assign the global");

function memStore(init) {
  const bag = Object.assign({}, init || {});
  return {
    get(k, d) { return Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : d; },
    set(k, v) { bag[k] = v; },
  };
}
function dockEl() {
  return {
    style: {
      transform: "",
      removeProperty(k) { if (k === "transform") this.transform = ""; },
    },
  };
}

test("usablePad prefers a positive visual viewport over the layout viewport", () => {
  lastWin.visualViewport.width = 320;
  lastWin.visualViewport.height = 500;
  const pad = DL.usablePad({ });
  assert.equal(pad.w, 320);
  assert.equal(pad.h, 500);
  lastWin.visualViewport.width = 0;
  lastWin.visualViewport.height = 0;
  const layout = DL.usablePad({ });
  assert.equal(layout.w, 400, "a zero visual viewport falls back to innerWidth");
  assert.equal(layout.h, 800);
});

test("clampXY keeps a dock between its safe-area home and MAX (a negative share would park it off screen)", () => {
  const c = DL.clampXY({ x: 2, y: -2 });
  assert.equal(c.x, DL.MAX);
  assert.equal(c.y, 0, "down past the home bar clips to the home");
  const neg = DL.clampXY({ x: -0.1, y: -0.2 });
  assert.equal(neg.x, 0, "outboard past the screen edge clips to the home edge");
  assert.equal(neg.y, 0, "below the home bar clips to the home");
  // Property-wise: vm-realm objects fail deepStrictEqual on prototype identity.
  const junk = DL.clampXY({ x: "no", y: null });
  assert.equal(junk.x, 0);
  assert.equal(junk.y, 0);
});

test("normalize fills every scheme and clamps junk", () => {
  const n = DL.normalize({ buttons: { L: { x: 9, y: 0.1 }, R: { x: 0, y: 0 } }, weird: {} });
  assert.ok(n.tilt && n.buttons && n.touch);
  assert.equal(n.buttons.L.x, DL.MAX);
  assert.equal(n.tilt.L.x, 0);
  assert.equal(n.weird, undefined);
});

test("load/save round-trip keeps schemes independent", () => {
  const store = memStore();
  const bag = DL.normalize({});
  bag.buttons.L = { x: 0.2, y: 0.1 };
  bag.tilt.R = { x: 0.15, y: 0.05 };
  DL.save(store, bag);
  const loaded = DL.load(store);
  assert.equal(loaded.buttons.L.x, 0.2);
  assert.equal(loaded.tilt.R.x, 0.15);
  assert.equal(loaded.touch.L.x, 0);
  assert.ok(DL.isIdentity(loaded.touch));
  assert.equal(DL.isIdentity(loaded.buttons), false);
});

test("apply writes translate for a non-zero offset and clears at identity", () => {
  const left = dockEl(), right = dockEl();
  const bag = DL.normalize({});
  bag.buttons.L = { x: 0.25, y: 0.1 };
  DL.apply("buttons", bag, { L: left, R: right });
  assert.match(left.style.transform, /^translate\(/);
  assert.equal(right.style.transform, "");
  bag.buttons.L = { x: 0, y: 0 };
  left.style.transform = "translate(1px, 1px)";
  DL.apply("buttons", bag, { L: left, R: right });
  assert.equal(left.style.transform, "");
});

// Bug hunt 2 H16: the dock carries its own CSS `zoom` (>= 1 on touch layouts), and a
// transform inside a zoomed element is scaled by that zoom, so a translate written in
// viewport px moved the dock zoom x the finger. apply() divides by the element's zoom.
test("apply divides the translate by the dock's own CSS zoom", () => {
  const plain = dockEl(), zoomed = dockEl();
  zoomed.currentCSSZoom = 2;
  const bag = DL.normalize({});
  bag.buttons.L = { x: 0.25, y: 0.1 };   // pad 400x800 -> 100px right, 80px up in the viewport
  DL.apply("buttons", bag, { L: plain, R: zoomed });
  bag.buttons.R = { x: 0.25, y: 0.1 };
  DL.apply("buttons", bag, { L: plain, R: zoomed });
  assert.equal(plain.style.transform, "translate(100.0px, -80.0px)");
  assert.equal(zoomed.style.transform, "translate(-50.0px, -40.0px)", "zoom 2 halves both axes");
});

// MIRROR CONTROLS (body.mirror-controls) row-reverses #hud-dock: #dock-left paints on
// the RIGHT edge, so its inboard +x must translate LEFT (and #dock-right's RIGHT).
test("apply flips both docks' inboard direction under MIRROR CONTROLS", () => {
  const doc = DL.__doc;
  const left = dockEl(), right = dockEl();
  const bag = DL.normalize({});
  bag.buttons.L = { x: 0.25, y: 0 };
  bag.buttons.R = { x: 0.25, y: 0 };
  doc.body = { classList: { contains: (c) => c === "mirror-controls" } };
  try {
    DL.apply("buttons", bag, { L: left, R: right });
    assert.equal(left.style.transform, "translate(-100.0px, 0.0px)", "mirrored left dock moves left (inboard)");
    assert.equal(right.style.transform, "translate(100.0px, 0.0px)", "mirrored right dock moves right (inboard)");
  } finally { delete doc.body; }
  DL.apply("buttons", bag, { L: left, R: right });
  assert.equal(left.style.transform, "translate(100.0px, 0.0px)", "unmirrored left dock moves right");
});

test("switching scheme applies that scheme's offsets only", () => {
  const left = dockEl(), right = dockEl();
  const bag = DL.normalize({});
  bag.buttons.L = { x: 0.3, y: 0 };
  bag.tilt.L = { x: 0, y: 0 };
  DL.apply("buttons", bag, { L: left, R: right });
  assert.match(left.style.transform, /^translate\(/);
  DL.apply("tilt", bag, { L: left, R: right });
  assert.equal(left.style.transform, "", "tilt default clears the buttons offset");
});

test("a primary control centre inside the unsafe inset is rejected by clamp", () => {
  // Offsets are fractions of the usable pad (already inset). Clamping at ±MAX
  // is what keeps a drag from parking a dock under the notch / home indicator.
  const edge = DL.clampXY({ x: MAX_PROBE(), y: MAX_PROBE() });
  function MAX_PROBE() { return DL.MAX + 0.5; }
  assert.ok(Math.abs(edge.x) <= DL.MAX + 1e-9);
  assert.ok(Math.abs(edge.y) <= DL.MAX + 1e-9);
});

test("store.subscribe on steerMode reloads that scheme's offsets", () => {
  const left = dockEl(), right = dockEl();
  const listeners = [];
  let mode = "buttons";
  const bag = DL.normalize({});
  bag.buttons.L = { x: 0.2, y: 0 };
  bag.tilt.L = { x: 0, y: 0 };
  const store = {
    get(k, d) { return k === "dockLayout" ? bag : d; },
    set() {},
    subscribe(fn) { listeners.push(fn); return () => {}; },
  };
  // Lightweight create stand-in: paint via apply + the same subscribe filter.
  function paint() { DL.apply(mode, bag, { L: left, R: right }); }
  store.subscribe((change) => {
    if (!change) return;
    const hit = (k) => k === "steerMode" || k === DL.KEY;
    if (hit(change.key) || (Array.isArray(change.keys) && change.keys.some(hit))) paint();
  });
  mode = "buttons"; paint();
  assert.match(left.style.transform, /^translate\(/);
  mode = "tilt";
  listeners[0]({ key: "steerMode" });
  assert.equal(left.style.transform, "", "singular key notify must clear buttons offset");
});

// create() itself, in a context that records its window/document listeners
// and the settings MutationObserver, so the two lifecycle edges are testable.
function bootCreate() {
  const winL = {}, docL = {}, observers = [];
  const settings = { hidden: false };
  const pause = { hidden: true };
  const els = { "dock-left": dockEl(), "dock-right": dockEl(), pmsettings: settings, pausemenu: pause };
  const made = [];
  const bodyAttrs = {};
  const ctx = {
    Log: { info() {}, warn() {}, debug() {}, enabled() { return false; } },
    window: { innerWidth: 400, innerHeight: 800, addEventListener(t, fn) { winL[t] = fn; } },
    document: {
      documentElement: {},
      body: { setAttribute(k, v) { bodyAttrs[k] = v; }, removeAttribute(k) { delete bodyAttrs[k]; }, appendChild(n) { made.push(n); } },
      // The REPOSITION toolbar is a div of buttons found by [data-k=…].
      createElement() {
        const kids = [];
        return { style: {}, dataset: {}, setAttribute() {}, appendChild(c) { kids.push(c); },
          querySelector(sel) { const k = /data-k=(\w+)/.exec(sel); return k ? kids.find((c) => c.dataset.k === k[1]) || null : null; } };
      },
      addEventListener(t, fn) { docL[t] = fn; },
    },
    MutationObserver: function (cb) { observers.push(cb); this.observe = () => {}; },
    getComputedStyle() { return { getPropertyValue() { return "0"; } }; },
  };
  vm.runInNewContext(SRC.replace(/^const\b/gm, "var"), ctx);
  const bag = ctx.DockLayout.normalize({});
  bag.buttons.L = { x: 0, y: 0.35 };
  const sets = [];
  const store = { get(k, d) { return k === "dockLayout" ? bag : d; }, set(k, v) { sets.push([k, v]); } };
  const api = ctx.DockLayout.create({ $: (id) => els[id] || null, store, getSteerMode: () => "buttons" });
  return { ctx, api, winL, docL, observers, settings, pause, els, bodyAttrs, made, sets };
}

test("a rotation repaints the dock offsets in the new viewport's pixels", () => {
  const { ctx, winL, els } = bootCreate();
  const before = els["dock-left"].style.transform;
  assert.match(before, /-280\.0px\)/, "0.35 of an 800 px-tall portrait pad");
  ctx.window.innerWidth = 800; ctx.window.innerHeight = 400;
  assert.equal(typeof winL.resize, "function", "create() must listen for resize");
  winL.resize();
  assert.match(els["dock-left"].style.transform, /-140\.0px\)/, "the same fraction of the landscape pad");
});

test("setEditing(true) hides SETTINGS and PAUSED so the docks are reachable, and false restores", () => {
  const { api, settings, pause, made } = bootCreate();
  pause.hidden = false; settings.hidden = false;   // both modal dialogs open: the whole document is inert
  api.setEditing(true);
  assert.equal(settings.hidden, true, "#pmsettings (showModal) would make the dock inert");
  assert.equal(pause.hidden, true);
  assert.equal(made.length, 1, "a floating DONE is the way out with SETTINGS hidden");
  assert.equal(made[0].hidden, false);
  api.setEditing(false);
  assert.equal(settings.hidden, false, "exit re-shows settings");
  assert.equal(pause.hidden, false, "and the pause card, only because it was open");
  assert.equal(made[0].hidden, true);
});

test("only what REPOSITION hid comes back (settings opened from the menu, no pause card)", () => {
  const { api, settings, pause } = bootCreate();
  settings.hidden = false; pause.hidden = true;
  api.setEditing(true);
  api.setEditing(false);
  assert.equal(settings.hidden, false);
  assert.equal(pause.hidden, true, "the pause card was never open, so exit must not open it");
});

test("a pointerdown on #dock-right starts a drag while editing, and the move shifts it", () => {
  const { api, docL, els } = bootCreate();
  const target = { closest() { return null; } };
  els["dock-right"].contains = (t) => t === target;
  els["dock-left"].contains = () => false;
  const ev = (o) => Object.assign({ target, pointerId: 1, preventDefault() { this.stopped = true; } }, o);
  // Not editing: ignored.
  const idle = ev({ clientX: 300, clientY: 700 });
  docL.pointerdown(idle);
  assert.ok(!idle.stopped, "outside edit mode the press passes through to the pedals");
  api.setEditing(true);
  const down = ev({ clientX: 300, clientY: 700 });
  docL.pointerdown(down);
  assert.ok(down.stopped, "the dock claimed the press");
  docL.pointermove(ev({ clientX: 260, clientY: 700 }));   // 40 px toward the centre
  docL.pointerup(ev({}));
  assert.equal(api.bag().buttons.R.x, 40 / 400);
});

test("DONE mid-drag persists the dragged offset (hunt 2026-11-02)", () => {
  const { api, docL, els, sets } = bootCreate();
  const target = { closest() { return null; } };
  els["dock-right"].contains = (t) => t === target;
  els["dock-left"].contains = () => false;
  const ev = (o) => Object.assign({ target, pointerId: 1, preventDefault() {} }, o);
  api.setEditing(true);
  docL.pointerdown(ev({ clientX: 300, clientY: 700 }));
  docL.pointermove(ev({ clientX: 260, clientY: 700 }));
  const before = sets.length;
  api.setEditing(false); // second finger / Escape ends editing before pointerup
  assert.ok(sets.length > before, "the in-flight move was saved");
  assert.equal(sets[sets.length - 1][1].buttons.R.x, 40 / 400);
});

test("a REPOSITION drag that starts on GAS never reaches the button: the throttle LATCH stays put (hunt3 7-F4)", () => {
  const { api, docL, els } = bootCreate();
  const gas = { closest() { return gas; }, setPointerCapture() {} };
  els["dock-left"].contains = (t) => t === gas;
  els["dock-right"].contains = () => false;
  // DOM dispatch, reduced: document capture first, then the target's own
  // pointerdown (hold-buttons: THROTTLE = LATCH toggles on every press edge)
  // unless the capture listener stopped the event.
  let latched = false;
  const press = (o) => {
    const e = Object.assign({ target: gas, pointerId: 7, preventDefault() {}, stopped: false,
      stopImmediatePropagation() { this.stopped = true; }, stopPropagation() { this.stopped = true; } }, o);
    docL.pointerdown(e);
    if (!e.stopped) latched = !latched;
    docL.pointerup(Object.assign({}, e, { clientX: o.clientX + 30 }));
    return e;
  };
  press({ clientX: 50, clientY: 700 });
  assert.equal(latched, true, "outside REPOSITION the press is GAS's (the baseline)");
  latched = false;
  api.setEditing(true);
  const e = press({ clientX: 50, clientY: 700 });
  assert.equal(e.stopped, true, "the dock claims the press before the button's own listener");
  assert.equal(latched, false, "an odd number of drags on GAS must not arm the latch");
  api.setEditing(false);
});

test("an external open of SETTINGS or PAUSED ends REPOSITION without stacking dialogs", () => {
  const { api, observers, settings, pause, bodyAttrs } = bootCreate();
  api.setEditing(true);
  observers[0]();   // our own hide settled: nothing visible, still editing
  assert.equal(api.editing(), true);
  pause.hidden = false;   // the pause button
  observers[0]();
  assert.equal(api.editing(), false);
  assert.equal(bodyAttrs["data-dock-edit"], undefined);
  assert.equal(settings.hidden, true, "settings is not re-shown over the pause card");
});

test("Escape ends REPOSITION and does not reach Input's pause toggle", () => {
  const { api, docL, settings } = bootCreate();
  api.setEditing(true);
  let prevented = false, stopped = false;
  docL.keydown({ key: "a", preventDefault() { prevented = true; } });
  assert.equal(api.editing(), true);
  docL.keydown({ key: "Escape", preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
  assert.equal(api.editing(), false);
  assert.ok(prevented && stopped);
  assert.equal(settings.hidden, false);
});

test("apply divides the translate by the dock's effective CSS zoom", () => {
  // `zoom` multiplies a translate, so a px offset must be pre-divided or the
  // dock lands at px × zoom (off-screen at BUTTON SIZE 300%).
  const bag = DL.normalize({});
  bag.buttons.L = { x: 0.2, y: 0.1 };
  const plain = dockEl(), zoomed = dockEl(), third = dockEl();
  zoomed.currentCSSZoom = 2;
  third.currentCSSZoom = 3;
  DL.apply("buttons", bag, { L: plain });
  DL.apply("buttons", bag, { L: zoomed });
  DL.apply("buttons", bag, { L: third });
  assert.equal(plain.style.transform, "translate(80.0px, -80.0px)");
  assert.equal(zoomed.style.transform, "translate(40.0px, -40.0px)", "zoom 2 renders the same visual shift from half the px");
  assert.equal(third.style.transform, "translate(26.7px, -26.7px)");
});

test("BUTTON SHAPE: unknown or missing values are AUTO, and AUTO clears the root attribute", () => {
  assert.equal(DL.SHAPES.map((s) => s[0]).join(), "auto,round,squircle,square");
  for (const v of [null, undefined, "", "oval", 3]) assert.equal(DL.shapeOf(v), "auto");
  for (const [v] of DL.SHAPES) assert.equal(DL.shapeOf(v), v);
  const attrs = {};
  const root = DL.__doc.documentElement;
  root.style = {};
  root.setAttribute = (k, v) => { attrs[k] = v; };
  root.removeAttribute = (k) => { delete attrs[k]; };
  assert.equal(DL.applyShape("square"), "square");
  assert.equal(attrs["data-btn-shape"], "square");
  assert.equal(DL.applyShape("oval"), "auto");
  assert.equal("data-btn-shape" in attrs, false);
});

test("BUTTON SIZE toolbar steps snap to the 10 % grid and stay in the slider's range", () => {
  assert.equal(DL.sizeStep(100, 1, 40, 300), 110);
  assert.equal(DL.sizeStep(100, -1, 40, 300), 90);
  assert.equal(DL.sizeStep(245, 1, 40, 300), 250);   // the owner's stored 245 % lands on the grid
  assert.equal(DL.sizeStep(245, -1, 40, 300), 240);
  assert.equal(DL.sizeStep(295, 1, 40, 300), 300);
  assert.equal(DL.sizeStep(300, 1, 40, 300), 300);
  assert.equal(DL.sizeStep(40, -1, 40, 300), 40);
  assert.equal(DL.sizeStep(NaN, 1, 40, 300), 110);
});

test("BUTTON SHAPE CSS: every non-AUTO shape sets a radius in the deferred overlays sheet", () => {
  const rules = cssRules(fs.readFileSync(path.join(ROOT, "css/overlays.css"), "utf8"));
  for (const [v] of DL.SHAPES.slice(1)) {
    const hit = rules.filter((r) => r.selector.startsWith(`:root[data-btn-shape="${v}"]`));
    assert.equal(hit.length > 0 && hit.every((r) => r.decls.has("border-radius")), true, v);
  }
  const eager = cssRules(fs.readFileSync(path.join(ROOT, "css/touch-controls.css"), "utf8"));
  assert.equal(eager.some((r) => r.selector.includes("data-btn-shape")), false, "the eager sheet stays off the critical-path budget");
});
