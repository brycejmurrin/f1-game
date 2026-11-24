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
import { boot as bootInput, fakePad } from "../helpers/key-binds-rig.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/ui/dock-layout.js"), "utf8");

const toolbarSource = fs.readFileSync(path.join(ROOT, "js/ui/dock-toolbar.js"), "utf8");
function installToolbar(ctx) {
  vm.runInNewContext(toolbarSource.replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/ui/dock-toolbar.js") });
}

let lastWin;
function loadDock(insets = {}) {
  lastWin = { innerWidth: 400, innerHeight: 800, visualViewport: { width: 0, height: 0 } };
  const ctx = {
    Log: { info() {}, warn() {}, debug() {}, enabled() { return false; } },
    window: lastWin,
    document: { documentElement: {} },
    getComputedStyle() { return { getPropertyValue(key) { return insets[key] || "0"; } }; },
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

test("usablePad reads the layout viewport (documentElement.client*), never the visual viewport (UI contract rule 1)", () => {
  lastWin.visualViewport.width = 320;
  lastWin.visualViewport.height = 500;
  DL.__doc.documentElement.clientWidth = 852;
  DL.__doc.documentElement.clientHeight = 393;
  const pad = DL.usablePad({ });
  assert.equal(pad.w, 852, "a pinch (visual 320) must not move a dock");
  assert.equal(pad.h, 393);
  DL.__doc.documentElement.clientWidth = 0;
  DL.__doc.documentElement.clientHeight = 0;
  const layout = DL.usablePad({ });
  assert.equal(layout.w, 400, "no layout yet (the unit harness) falls back to innerWidth");
  assert.equal(layout.h, 800);
  lastWin.visualViewport.width = 0;
  lastWin.visualViewport.height = 0;
});

test("clampXY accepts signed offsets while bounding malformed imports", () => {
  const c = DL.clampXY({ x: 2, y: -2 });
  assert.equal(c.x, DL.MAX);
  assert.equal(c.y, -DL.MAX);
  const neg = DL.clampXY({ x: -0.1, y: -0.2 });
  assert.equal(neg.x, -0.1);
  assert.equal(neg.y, -0.2);
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

// Layout geometry, including a change to the effective zoom between paints.
// Homes and sizes are screen coordinates; CSS translations scale with zoom.
function dockWithButton(id, left, top, width, height) {
  const style = () => ({ removeProperty(k) { delete this[k]; } });
  const dock = { style: style(), currentCSSZoom: 1 };
  const el = { id, style: style(), get currentCSSZoom() { return dock.currentCSSZoom; } };
  let reads = 0;
  const numbers = s => (s?.match(/-?[\d.]+px/g) || []).map(parseFloat);
  el.getBoundingClientRect = () => {
    reads++;
    const [dx = 0, dy = 0] = numbers(dock.style.transform);
    const [bx = 0, by = 0] = numbers(el.style.translate);
    const x = left + (dx + bx) * dock.currentCSSZoom, y = top + (dy + by) * dock.currentCSSZoom;
    return { left: x, right: x + width, top: y, bottom: y + height, width, height };
  };
  dock.querySelectorAll = () => [el];
  return { dock, el, reads: () => reads };
}

test("intentional moves use the side gutters and stop at the reachable part of the safe area", () => {
  const D = loadDock({ "--sal": "59px", "--sar": "59px", "--sab": "21px" });
  D.__doc.documentElement.clientWidth = 852; D.__doc.documentElement.clientHeight = 393;
  const { dock, el } = dockWithButton("btn-steer-left", 71, 245, 92, 92);
  const bag = D.normalize({ buttons: { L: { x: -1, y: -1 } } });
  D.apply("buttons", bag, { L: dock });
  let r = el.getBoundingClientRect();
  assert.equal(r.left, 11, "an intentional outward move reclaims 60px past the automatic anchor");
  assert.equal(r.right, 103, "44px of steering target remain inside the 59px inset");
  assert.equal(r.bottom, 393, "the whole target remains physically on the display");
  dock.currentCSSZoom = 2;
  D.apply("buttons", bag, { L: dock });
  r = el.getBoundingClientRect();
  assert.equal(r.left, 11, "the old translation is unwound at the new zoom");
  bag.buttons.L.x = 1;
  D.apply("buttons", bag, { L: dock });
  assert.equal(el.getBoundingClientRect().right, 841, "the opposite safe-area edge is reachable");
  const small = dockWithButton("btn-boost", 71, 285, 32, 32);
  bag.buttons.L.x = -1;
  D.apply("buttons", bag, { L: small.dock });
  assert.equal(small.el.getBoundingClientRect().left, 59, "an undersized target stays wholly within the safe inset");
});

test("a saved pedal pair keeps its spacing when the bottom pedal reaches the viewport edge", () => {
  const D = loadDock(), viewport = D.__doc.documentElement;
  viewport.clientWidth = 852; viewport.clientHeight = 393;
  const { dock, el: gas } = dockWithButton("btn-throttle", 740, 260, 97, 122);
  const { el: brake } = dockWithButton("btn-brake", 740, 131, 97, 122);
  const group = { classList: { contains: name => name === "dock-grp" }, children: [brake, gas] };
  gas.parentElement = brake.parentElement = group;
  dock.querySelectorAll = () => group.children;
  const bag = D.normalize({ buttons: { controls: {
    "btn-throttle": { x: -.03, y: -.1098 }, "btn-brake": { x: -.03, y: -.1102 },
  } } });
  D.apply("buttons", bag, { R: dock });
  assert.equal(gas.getBoundingClientRect().bottom, 393);
  assert.ok(Math.abs(gas.getBoundingClientRect().top - brake.getBoundingClientRect().bottom - 7) < .5);
  const { el: boost } = dockWithButton("btn-boost", 654, 131, 76, 76);
  dock.querySelectorAll = () => [brake, gas, boost];
  bag.buttons.controls["btn-boost"] = { x: -.037, y: -.097 };
  D.apply("buttons", bag, { R: dock });
  const columnGap = brake.getBoundingClientRect().left - boost.getBoundingClientRect().right;
  assert.ok(columnGap > 3 && columnGap < 5, "separately positioned groups retain the intended gap at the edge");
  viewport.clientHeight = 600;
  D.apply("buttons", bag, { R: dock });
  assert.ok(gas.getBoundingClientRect().bottom < 600);
  assert.ok(brake.getBoundingClientRect().top > 190, "original offsets return when space permits");
  bag.buttons.controls["btn-brake"].y = .2;
  D.apply("buttons", bag, { R: dock });
  assert.equal(brake.getBoundingClientRect().top, 11, "an individually moved button keeps its own range");
});

test("individual placement uses the group's current offset, clamps on resize and restores shipped placement on reset", () => {
  const D = loadDock(), doc = D.__doc.documentElement;
  doc.clientWidth = 400; doc.clientHeight = 600;
  const { dock, el } = dockWithButton("btn-brake", 300, 300, 60, 60);
  const bag = D.normalize({ buttons: { R: { x: .25 }, controls: { "btn-brake": { x: .25, y: -.25 } } } });
  D.apply("buttons", bag, { R: dock });
  let r = el.getBoundingClientRect();
  assert.equal(r.left, 100);
  assert.equal(r.top, 450);
  doc.clientWidth = 200;
  D.apply("buttons", bag, { R: dock });
  r = el.getBoundingClientRect();
  assert.equal(r.right <= 200, true);
  doc.clientWidth = 400;
  D.apply("buttons", D.normalize({}), { R: dock });
  assert.equal(el.getBoundingClientRect().left, 300);
  assert.equal(el.getBoundingClientRect().top, 300);
  assert.equal(el.style.translate, undefined);
});

test("store.subscribe on steerMode reloads that scheme's offsets", () => {
  // The PRODUCTION listener create() registers: switch STEERING INPUT, fire it.
  const { els, listeners, setMode } = bootCreate({ subscribe: true });
  const left = els["dock-left"];
  assert.match(left.style.transform, /^translate\(/, "buttons offset painted at create");
  assert.equal(listeners.length, 1, "create() subscribes to the store");
  setMode("tilt");
  listeners[0]({ key: "steerMode" });
  assert.equal(left.style.transform, "", "singular key notify must clear buttons offset");
  setMode("buttons");
  listeners[0]({ keys: ["steerMode"] });
  assert.match(left.style.transform, /^translate\(/, "bulk keys notify repaints the buttons offset");
  setMode("tilt");
  listeners[0]({ key: "unrelated" });
  assert.match(left.style.transform, /^translate\(/, "an unrelated key does not repaint");
});

// create() itself, in a context that records its window/document listeners
// and the settings MutationObserver, so the two lifecycle edges are testable.
function bootCreate(opts = {}) {
  const winL = {}, docL = {}, observers = new Map();
  const settings = { hidden: false };
  const pause = { hidden: true };
  const els = { "dock-left": dockEl(), "dock-right": dockEl(), pmsettings: settings, pausemenu: pause };
  const made = [];
  const bodyAttrs = {};
  let leaveSettings;
  const ctx = {
    Log: { info() {}, warn() {}, debug() {}, enabled() { return false; } },
    window: { innerWidth: 400, innerHeight: 800, addEventListener(t, fn) { winL[t] = fn; } },
    document: {
      documentElement: {},
      body: { setAttribute(k, v) { bodyAttrs[k] = v; }, removeAttribute(k) { delete bodyAttrs[k]; }, appendChild(n) { made.push(n); } },
      // The REPOSITION toolbar is a div of buttons found by [data-k=…].
      createElement(tag) {
        const kids = [], attrs = new Map();
        return { tagName: tag.toUpperCase(), style: {}, dataset: {}, children: kids,
          setAttribute(k, v) { attrs.set(k, String(v)); },
          getAttribute(k) { return attrs.get(k) ?? null; },
          removeAttribute(k) { attrs.delete(k); },
          click() { this.onclick?.(); },
          appendChild(c) { kids.push(c); },
          querySelector(sel) { const k = /data-k=(\w+)/.exec(sel); return k ? kids.find((c) => c.dataset.k === k[1]) || null : null; } };
      },
      addEventListener(t, fn) { docL[t] = fn; },
    },
    MutationObserver: function (cb) { this.observe = target => observers.set(target, cb); },
    getComputedStyle() { ctx.gcsCalls = (ctx.gcsCalls || 0) + 1; return { getPropertyValue() { return "0"; } }; },
    SettingsNav: { onLeave(fn) { leaveSettings = fn; } },
  };
  if (!opts.lazyToolbar) installToolbar(ctx);
  vm.runInNewContext(SRC.replace(/^const\b/gm, "var"), ctx);
  const bag = ctx.DockLayout.normalize({});
  bag.buttons.L = { x: 0, y: 0.35 };
  const persisted = { ...opts.scalePrefs, dockLayout: opts.saved || bag };
  const sets = [];
  const listeners = [];
  let mode = "buttons";
  const store = { get(k, d) { return k in persisted ? persisted[k] : d; }, set(k, v) { persisted[k] = v; sets.push([k, v]); } };
  if (opts.subscribe) store.subscribe = (fn) => { listeners.push(fn); return () => {}; };
  const api = ctx.DockLayout.create({ $: (id) => els[id] || null, store, getSteerMode: () => mode }, opts.scaleUi, opts.previewControls);
  return { ctx, api, winL, docL, observers, settings, pause, els, bodyAttrs, made, sets, listeners, store, leaveSettings, setMode: (m) => { mode = m; } };
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

test("Done and Cancel restore the opener after the Controls dialog reopens", () => {
  for (const action of ["done", "cancel"]) {
    const { api, ctx, els, settings, made } = bootCreate();
    const next = [], nativeFocus = {};
    ctx.queueMicrotask = fn => next.push(fn);
    const opener = els["pm-dock-reposition"] = {
      isConnected: true, setAttribute() {},
      focus() { if (settings.open) ctx.document.activeElement = opener; },
    };
    settings.contains = target => target === opener || target === nativeFocus;
    let top = settings;
    ctx.window.UiLayers = { top: () => top };
    ctx.document.activeElement = opener;
    api.setEditing(true);
    const bar = made[0];
    settings.open = false;
    ctx.document.activeElement = bar;
    bar.querySelector("[data-k=" + action + "]").click();
    assert.equal(api.editing(), false);
    assert.equal(settings.hidden, false);
    assert.equal(ctx.document.activeElement, bar, "the native dialog is still closed");
    settings.open = true;
    ctx.document.activeElement = nativeFocus;
    assert.equal(next.length, 1);
    next.shift()();
    assert.equal(ctx.document.activeElement, opener, "restore after native focus selection");

    api.setEditing(true);
    bar.querySelector("[data-k=" + action + "]").click();
    top = { contains: () => false };
    ctx.document.activeElement = nativeFocus;
    next.shift()();
    assert.equal(ctx.document.activeElement, nativeFocus, "leave focus alone when another layer opens");

    top = settings;
    api.setEditing(true);
    bar.querySelector("[data-k=" + action + "]").click();
    api.setEditing(true);
    ctx.document.activeElement = bar;
    next.shift()();
    assert.equal(ctx.document.activeElement, bar, "a previous close cannot focus through a reopened editor");
    api.setEditing(false, false);
    assert.equal(settings.hidden, true);
    assert.equal(next.length, 0, "no restore is queued when the editor yields the screen");
  }
});

test("dock tools open compact and keep Done available in both states", () => {
  const { api, made } = bootCreate();
  api.setEditing(true);
  const bar = made[0], control = key => bar.querySelector("[data-k=" + key + "]");
  assert.equal(control("tools").textContent, "Size & shape");
  for (const key of ["size", "shape", "smaller", "bigger"]) assert.equal(control(key).hidden, true);
  control("tools").onclick();
  assert.equal(control("shape").hidden, false);
  assert.equal(Boolean(control("done").hidden), false);
  control("done").onclick();
  api.setEditing(true);
  assert.equal(control("shape").hidden, true);
});

test("independent Gas and Brake edits retain the other settings when a button is reset", () => {
  const { api, made, els, docL } = bootCreate();
  const attributes = {};
  const gas = els["btn-throttle"] = {
    id: "btn-throttle", closest() { return this; },
    setAttribute(k, v) { attributes[k] = v; }, removeAttribute(k) { delete attributes[k]; },
  };
  els["btn-brake"] = { id: "btn-brake", setAttribute() {}, removeAttribute() {} };
  els["dock-right"].contains = target => target === gas;
  els["dock-left"].contains = () => false;
  api.setEditing(true);
  const control = key => made[0].querySelector("[data-k=" + key + "]");
  const choose = (key, value) => {
    control(key).value = value; control(key).onchange();
  };
  const event = x => ({ target: gas, pointerId: 1, clientX: x, clientY: 600, preventDefault() {} });
  docL.pointerdown(event(300)); docL.pointerup(event(300));
  assert.equal(control("target").value, "btn-throttle", "a tap selects just the pedal");
  let blocked = false;
  docL.click({ target: gas, detail: 0, preventDefault() {}, stopImmediatePropagation() { blocked = true; } });
  assert.equal(blocked, true, "keyboard activation selects without driving");
  assert.equal(control("bigger").hidden, false);
  control("bigger").onclick(); choose("shape", "paddle-left");
  docL.pointerdown(event(300)); docL.pointermove(event(260)); docL.pointerup(event(260));
  let config = api.bag().buttons;
  assert.equal(config.controls["btn-throttle"].size, 110);
  assert.equal(config.controls["btn-throttle"].shape, "paddle-left");
  assert.equal(config.controls["btn-throttle"].x, 0.1);
  assert.equal(config.R.x, 0, "the group stays at home");
  assert.equal(config.controls["btn-brake"], undefined);
  docL.pointerdown(event(260)); docL.pointermove(event(220)); docL.pointercancel(event(220));
  assert.equal(api.bag().buttons.controls["btn-throttle"].x, 0.1, "cancel restores the individual button");
  const key = (name, shiftKey) => docL.keydown({ target: gas, key: name, shiftKey, preventDefault() {}, stopImmediatePropagation() {} });
  key("ArrowUp", false);
  assert.equal(api.bag().buttons.controls["btn-throttle"].y, 2 / 800);
  key("ArrowUp", true);
  assert.equal(api.bag().buttons.controls["btn-throttle"].y, 18 / 800);
  choose("target", "btn-brake"); control("smaller").onclick();
  choose("target", "steer"); choose("gap", "24");
  choose("target", "drive"); choose("layout", "pedal-row");
  choose("target", "btn-throttle"); control("reset").onclick();
  config = api.bag().buttons;
  assert.equal(config.controls["btn-throttle"], undefined);
  assert.equal(config.controls["btn-brake"].size, 90);
  assert.equal(config.gap, 24);
  assert.equal(config.layout, "pedal-row");
  assert.equal(api.bag().tilt.controls, undefined);
});

test("dock Done persists independent dimensions, Undo reverses reset and Cancel preserves the saved layout", () => {
  const saved = { buttons: { controls: { "btn-throttle": { size: 120 }, "btn-brake": { shape: "square" } } } };
  const { api, made, sets } = bootCreate({ saved });
  api.setEditing(true);
  const field = key => made[0].querySelector("[data-k=" + key + "]");
  const choose = (key, value) => { field(key).value = value; field(key).onchange(); };
  choose("shape", "arch");
  assert.equal(api.shape(), "arch");
  assert.equal(field("undo").disabled, false);
  field("undo").onclick();
  assert.equal(api.shape(), "auto");
  choose("target", "btn-throttle");
  choose("width", "125"); choose("height", "75");
  assert.equal(sets.length, 0);
  field("reset").onclick();
  assert.equal(api.bag().buttons.controls["btn-throttle"], undefined);
  field("undo").onclick();
  assert.deepEqual({ ...api.bag().buttons.controls["btn-throttle"] }, { size: 120, width: 125, height: 75 });
  field("done").onclick();
  const record = sets.find(([key]) => key === "dockLayout")[1];
  const reloaded = bootCreate({ saved: record });
  assert.equal(reloaded.api.bag().buttons.controls["btn-throttle"].height, 75);
  api.setEditing(true);
  choose("target", "btn-throttle"); choose("height", "175"); field("reset").onclick();
  field("cancel").onclick();
  assert.equal(api.editing(), false);
  assert.deepEqual({ ...api.bag().buttons.controls["btn-throttle"] }, { size: 120, width: 125, height: 75 });
  assert.equal(api.bag().buttons.controls["btn-brake"].shape, "square");
  assert.equal(sets.length, 1);
});

test("global size Undo restores adaptive preferences and repaints the shared scale owner", () => {
  let repaints = 0;
  const { api, ctx, els, made, store } = bootCreate({ scalePrefs: { hudScale: 105 },
    scaleUi: { applyHudScale() { repaints++; }, applyBtnScale() { repaints++; } } });
  ctx.Event = class {};
  els["pm-btnscale"] = { value: "100", dispatchEvent() {
    store.set("hudBtnScale", Number(this.value)); store.set("hudBotKeep", { hud: 105, bot: 91 });
  } };
  api.setEditing(true);
  const field = key => made[0].querySelector("[data-k=" + key + "]");
  field("bigger").onclick();
  assert.equal(store.get("hudBtnScale", null), 110);
  field("undo").onclick();
  assert.equal(store.get("hudBtnScale", null), null);
  assert.equal(store.get("hudBotKeep", null), null);
  assert.equal(store.get("hudScale", null), 105);
  assert.equal(repaints, 2);
});

test("driving layouts survive saving and reset independently of the other steering schemes", () => {
  const { api, made, sets, setMode } = bootCreate();
  api.setEditing(true);
  const field = key => made[0].querySelector("[data-k=" + key + "]");
  const choose = (key, value) => { field(key).value = value; field(key).onchange(); };
  choose("target", "drive");
  for (const [scheme, layout] of [["buttons", "gas-left"], ["tilt", "gas-above"], ["touch", "action-grid"]]) {
    setMode(scheme);
    choose("layout", layout);
  }
  assert.equal(sets.length, 0);
  field("done").onclick();
  const restored = () => DL.load(memStore({ dockLayout: sets.at(-1)[1] }));
  assert.equal(restored().buttons.layout, "gas-left");
  assert.equal(restored().tilt.layout, "gas-above");
  assert.equal(restored().touch.layout, "action-grid");
  api.setEditing(true); choose("target", "drive");
  field("reset").onclick(); field("done").onclick();
  assert.equal(restored().touch.layout, undefined);
  assert.equal(restored().buttons.layout, "gas-left");
  api.setEditing(true); choose("target", "drive");
  choose("layout", "action-grid"); choose("layout", ""); field("done").onclick();
  assert.equal(restored().touch.layout, undefined);
});

test("Gas + Brake and Race actions move, resize and reset as independent subsets", () => {
  const { api, made, els, docL } = bootCreate();
  const controls = ["btn-throttle", "btn-brake", "btn-boost", "btn-ot", "btn-aero"];
  for (const id of controls) els[id] = { id, closest() { return this; }, setAttribute() {}, removeAttribute() {} };
  els["dock-left"].contains = () => false;
  els["dock-right"].contains = node => controls.includes(node.id);
  api.setEditing(true);
  const field = k => made[0].querySelector("[data-k=" + k + "]");
  const target = field("target");
  const choose = id => { target.value = id; target.onchange(); };
  const pointer = (id, x) => ({ target: els[id], pointerId: 5, clientX: x, clientY: 300, preventDefault() {} });
  const drag = (id, from, to, end) => {
    docL.pointerdown(pointer(id, from)); docL.pointermove(pointer(id, to)); docL[end](pointer(id, to));
  };
  choose("pedals"); field("bigger").onclick(); field("shape").value = "shield"; field("shape").onchange();
  drag("btn-brake", 260, 220, "pointerup");
  choose("actions"); field("smaller").onclick();
  drag("btn-ot", 240, 160, "pointercancel");
  let prefs = api.bag().buttons.controls;
  for (const id of controls.slice(0, 2)) {
    assert.equal(prefs[id].size, 110);
    assert.equal(prefs[id].shape, "shield");
    assert.equal(prefs[id].x, 0.1);
  }
  for (const id of controls.slice(2)) assert.deepEqual({ ...prefs[id] }, { size: 90 });
  choose("pedals"); field("reset").onclick();
  prefs = api.bag().buttons.controls;
  assert.deepEqual(Object.keys(prefs).sort(), controls.slice(2).sort());
});

test("resetting driving buttons in manual tilt preserves the shifter sharing their dock", () => {
  const { api, els, docL, made, setMode } = bootCreate();
  for (const id of ["btn-boost", "shift-up"]) els[id] = {
    id, closest() { return this; }, setAttribute() {}, removeAttribute() {},
  };
  els["dock-left"].contains = node => node === els["btn-boost"] || node === els["shift-up"];
  els["dock-right"].contains = () => false;
  setMode("tilt");
  api.setEditing(true);
  const pointer = x => ({ target: els["btn-boost"], clientX: x, clientY: 300, pointerId: 4, preventDefault() {} });
  docL.pointerdown(pointer(40)); docL.pointermove(pointer(80)); docL.pointerup(pointer(80));
  const original = api.bag().tilt.L.x;
  assert.equal(original, 0.1);
  const field = k => made[0].querySelector("[data-k=" + k + "]");
  field("target").value = "drive"; field("target").onchange();
  field("reset").onclick();
  const scheme = api.bag().tilt;
  assert.equal(scheme.L.x, 0);
  assert.equal(scheme.controls["shift-up"].x, original);
  assert.equal(scheme.controls["btn-boost"], undefined);
});

test("an interrupted dock drag rolls back without saving or switching to a second finger", () => {
  for (const interrupt of ["pointercancel", "lostpointercapture", "blur", "resize", "orientationchange"]) {
    const { api, docL, winL, els, sets } = bootCreate();
    const target = { closest() { return target; } };
    els["dock-right"].contains = t => t === target;
    els["dock-left"].contains = () => false;
    const press = (pid, x) => ({ target, pointerId: pid, clientX: x, clientY: 500, preventDefault() {} });
    api.setEditing(true);
    docL.pointerdown(press(1, 180));
    docL.pointermove(press(1, 140));
    docL.pointerdown(press(2, 130));
    docL.pointermove(press(2, 90));
    assert.equal(api.bag().buttons.R.x, 0.1);
    if (winL[interrupt]) winL[interrupt]({});
    else docL[interrupt](press(1, 140));
    docL.pointerup(press(1, 140));
    assert.equal(api.bag().buttons.R.x, 0);
    assert.equal(sets.length, 0);
  }
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
  assert.equal(docL.pointerdown, undefined, "the editor registers drag handlers on first use");
  docL.pointerdown?.(idle);
  assert.ok(!idle.stopped, "outside edit mode the press passes through to the pedals");
  api.setEditing(true);
  const down = ev({ clientX: 300, clientY: 700 });
  docL.pointerdown(down);
  assert.ok(down.stopped, "the dock claimed the press");
  docL.pointermove(ev({ clientX: 260, clientY: 700 }));   // 40 px toward the centre
  docL.pointerup(ev({ clientX: 240, clientY: 700 }));
  assert.equal(api.bag().buttons.R.x, 60 / 400, "the final movement can arrive with the release");
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
    docL.pointerdown?.(e);
    if (!e.stopped) latched = !latched;
    docL.pointerup?.(Object.assign({}, e, { clientX: o.clientX + 30 }));
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
  observers.get(settings)();   // our own hide settled: nothing visible, still editing
  assert.equal(api.editing(), true);
  pause.hidden = false;   // the pause button
  observers.get(pause)();
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
  assert.equal(DL.SHAPES.map((s) => s[0]).join(), "auto,round,squircle,square,arch,shield,paddle-left,paddle-right,leaf");
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

test("a REPOSITION drag reads the pad once (pointerdown), not per pointermove, and fits once per frame (#4482)", () => {
  const { ctx, api, docL, els } = bootCreate();
  let fits = 0, rafCb = null;
  ctx.GameHud = { invalidateFit() { fits++; } };
  ctx.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
  const target = { closest() { return null; } };
  els["dock-right"].contains = (t) => t === target;
  els["dock-left"].contains = () => false;
  const ev = (o) => Object.assign({ target, pointerId: 1, preventDefault() {} }, o);
  api.setEditing(true);
  docL.pointerdown(ev({ clientX: 300, clientY: 700 }));
  const g0 = ctx.gcsCalls, f0 = fits;
  for (let i = 1; i <= 10; i++) docL.pointermove(ev({ clientX: 300 - i, clientY: 700 }));
  assert.equal(ctx.gcsCalls, g0, "no getComputedStyle during pointermove");
  assert.equal(fits, f0, "no invalidateFit per pointermove");
  assert.equal(typeof rafCb, "function", "one fit is scheduled for the frame");
  rafCb();
  assert.equal(fits, f0 + 1);
  docL.pointerup(ev({}));
  assert.equal(fits, f0 + 2, "pointerup settles the fit");
});

test("setEditing(false) cancels a pending drag fit frame (hunt memory-leaks back)", () => {
  const { ctx, api, docL, els } = bootCreate();
  let fits = 0, rafCb = null, cancelled = [];
  ctx.GameHud = { invalidateFit() { fits++; } };
  ctx.requestAnimationFrame = (cb) => { rafCb = cb; return 7; };
  ctx.cancelAnimationFrame = (id) => { cancelled.push(id); rafCb = null; };
  const target = { closest() { return null; } };
  els["dock-right"].contains = (t) => t === target;
  els["dock-left"].contains = () => false;
  const ev = (o) => Object.assign({ target, pointerId: 1, preventDefault() {} }, o);
  api.setEditing(true);
  docL.pointerdown(ev({ clientX: 300, clientY: 700 }));
  docL.pointermove(ev({ clientX: 260, clientY: 700 }));
  assert.equal(typeof rafCb, "function", "a fit frame is queued mid-drag");
  api.setEditing(false);
  assert.deepEqual(cancelled, [7], "DONE/Escape cancels the pending fit");
  assert.equal(rafCb, null, "the cancelled frame is dropped, not flushed");
});

test("dock toolbar loads on first open, deduplicates a pending request and retries on failure", async () => {
  const { ctx, api, settings } = bootCreate({ lazyToolbar: true });
  const requests = [];
  ctx.ScriptLoader = { create: () => ({ load(paths) {
    assert.deepEqual(Array.from(paths), ["js/ui/dock-toolbar.js"]);
    return new Promise(resolve => requests.push(resolve));
  } }) };
  api.setEditing(true);
  api.setEditing(true);
  assert.equal(requests.length, 1);
  assert.equal(settings.hidden, false);
  requests[0](false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(api.editing(), false);
  api.setEditing(true);
  installToolbar(ctx);
  requests[1](true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(api.editing(), true);
  api.setEditing(false);
  api.setEditing(true);
  assert.equal(requests.length, 2);
});

test("leaving Settings while its toolbar loads does not open an editor over the next screen", async () => {
  const { ctx, api, settings, pause } = bootCreate({ lazyToolbar: true });
  let finish;
  ctx.ScriptLoader = { create: () => ({ load: () => new Promise(resolve => { finish = resolve; }) }) };
  api.setEditing(true);
  settings.hidden = true;
  pause.hidden = false;
  installToolbar(ctx);
  finish(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(api.editing(), false);
  assert.equal(pause.hidden, false);
});

test("switching Settings sections retires a pending editor even after returning to Controls", async () => {
  const { ctx, api, settings, els, leaveSettings } = bootCreate({ lazyToolbar: true });
  const door = els["pm-dock-reposition"] = ctx.document.createElement("button");
  const controls = els["pm-panel-controls"] = { hidden: false };
  let finish;
  ctx.ScriptLoader = { create: () => ({ load: () => new Promise(resolve => { finish = resolve; }) }) };
  api.setEditing(true);
  assert.equal(door.getAttribute("aria-busy"), "true");
  leaveSettings("controls");
  controls.hidden = true;
  assert.equal(door.getAttribute("aria-busy"), null);
  controls.hidden = false;
  installToolbar(ctx);
  finish(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(api.editing(), false);
  assert.equal(settings.hidden, false);
  api.setEditing(true);
  assert.equal(api.editing(), true, "a fresh request can open the loaded toolbar");
});

test("controller directions and Back belong to the editor while its throttle and steering stay neutral", () => {
  const { api, settings, pause, made } = bootCreate();
  api.setEditing(true);
  const bar = made[0], tools = bar.querySelector("[data-k=tools]"), done = bar.querySelector("[data-k=done]");
  const cancel = bar.querySelector("[data-k=cancel]");
  const { Input, sb, fire } = bootInput();
  const lookup = { "dock-edit-bar": bar, [cancel.id]: cancel, pmsettings: settings, pausemenu: pause };
  sb.document.getElementById = id => lookup[id] ?? null;
  sb.document.documentElement = { clientWidth: 400, clientHeight: 800, dataset: {} };
  sb.getComputedStyle = () => ({ visibility: "visible", zIndex: "0" });
  bar.contains = el => bar.children.includes(el);
  bar.querySelectorAll = () => [tools, done];
  bar.getBoundingClientRect = () => ({ left: 0, right: 180, top: 0, bottom: 44, width: 180, height: 44 });
  settings.getBoundingClientRect = () => ({ width: 400, height: 800 });
  const dispatch = event => {
    event.target = sb.document.activeElement;
    event.isTrusted = false;
    event.preventDefault = () => { event.defaultPrevented = true; };
    event.stopPropagation = () => {};
    sb.MenuNav.onKeyDown(event);
    sb.TopModal.onEscape(event);
    return !event.defaultPrevented;
  };
  for (const [index, button] of [tools, done].entries()) {
    button.getBoundingClientRect = () => ({ left: index * 100, right: index * 100 + 80, top: 0, bottom: 44, width: 80, height: 44 });
    button.closest = () => null;
    button.focus = () => { sb.document.activeElement = button; };
    button.scrollIntoView = () => {};
    button.dispatchEvent = dispatch;
  }
  for (const file of ["js/ui/layers.js", "js/ui/menu-nav.js", "js/ui/modal.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), sb, { filename: absSrc(file) });
  }
  tools.focus();
  assert.equal(sb.UiLayers.top(), bar);
  assert.equal(sb.UiLayers.anyOpen(), true);
  const editable = { tagName: "BUTTON", matches: selector => selector === "#hud-dock .touchbtn", closest: () => null };
  sb.document.activeElement = editable;
  sb.MenuNav.onKeyDown({ key: "ArrowUp", isTrusted: true, preventDefault: () => assert.fail("the dock button owns its keyboard nudge") });
  assert.equal(sb.document.activeElement, editable);
  tools.focus();

  const pad = fakePad(sb, fire);
  pad.press(15);   // D-pad Right
  Input.poll();
  assert.equal(sb.document.activeElement, done);
  assert.equal(Input.steer(1 / 60), 0);
  pad.press(7);    // the normal driving accelerator
  Input.poll();
  assert.equal(Input.throttleLevel(), 0);

  pad.release(7);
  pad.release(15);
  pad.press(1);    // Back, while the compact toolbar hides its Cancel button
  Input.poll();
  assert.equal(api.editing(), false);
  assert.equal(settings.hidden, false);
});

test("the home touch editor previews the race dock and restores the title when it closes", () => {
  for (const restore of [true, false]) {
    const calls = [];
    const { api, els, settings } = bootCreate({ previewControls: show => calls.push(show) });
    els.hud = { hidden: true }; els.overlay = { hidden: false };
    api.setEditing(true);
    assert.equal(els.hud.hidden, false);
    assert.equal(els.overlay.hidden, true);
    assert.deepEqual(calls, [true]);
    api.setEditing(false, restore);
    assert.equal(els.hud.hidden, true);
    assert.equal(els.overlay.hidden, false);
    assert.equal(settings.hidden, !restore);
    assert.deepEqual(calls, [true, false]);
  }
});
