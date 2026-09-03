/* menu-a11y-audit.test.mjs — the 2026-09 keyboard / gamepad / a11y audit of
 * the title menu, sub-menus and dialogs, pinned as BEHAVIOUR on
 * tests/helpers/mini-dom.mjs where a module runs in a VM, as RULES through
 * tests/helpers/css-rules.mjs where the subject is a stylesheet, and as
 * lockstep checks over index.html and the layer lists.
 *
 * CONFIRMED findings (each fixed, each pinned here):
 *   1. Focus was DROPPED by the screens that are not <dialog>s (#select,
 *      #career, #carsetup, the tuners, the title): the button you pressed went
 *      `hidden`, focus fell to <body>, BACK left it there. TopModal now keeps a
 *      per-layer focus memory (land on open, restore on close).
 *   2. TopModal's focus containment took the first focusable in DOM order even
 *      when it was hidden — `focus()` on a hidden node is a silent no-op.
 *   3. A text field owned EVERY key in MenuNav, so a pad that landed on the
 *      circuit search box could not leave it with the D-pad; a range slider
 *      lost Home/End (the ARIA slider ends) to the layer-wide Home/End.
 *   4. role=tab owned every arrow, and the rails' own handlers mapped the
 *      perpendicular axis to "next tab" (garage) or "stay" (settings) — a pad
 *      had no route from the garage category rail to the parts list, or from
 *      the settings tab strip to the panel under it.
 *   5. `#customize .cz-sep` was white at 0.4 alpha: 3.75:1 over the darkest
 *      ground, below AA for 14px text.
 *   6. The non-dialog screens announced nothing on entry (no role, no name);
 *      #announce (LIGHTS OUT / FINAL LAP / SAVE RESTORED …) was not a live
 *      region, so a screen reader never heard a race or save event.
 *   7. ScrollFade's screen list was one short of UiLayers (the title screen).
 *
 * Run: node --test tests/unit/menu-a11y-audit.test.mjs   (npm run test:tooling-fast)
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { cssRules, decl, ruleFor } from "../helpers/css-rules.mjs";
import { makeDom } from "../helpers/mini-dom.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");
const code = (name) => read(name).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const src = (p) => read(p).replace(/^const\b/gm, "var");
const HTML = read("index.html");

/* ── shared harness ─────────────────────────────────────────────────────── */

// Visibility the way UiLayers.shown() answers it: no hidden ancestor, a box.
function shownIn(el) {
  for (let n = el; n; n = n.parentNode) if (n.hidden) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

// A MutationObserver that fires when the test says the attribute flipped —
// mini-dom has no mutation records, and the ORDER of callbacks (observer
// creation order, after every flip of the same tick) is what the focus memory
// relies on, so flipAll() sets every attribute first and then notifies.
function moShim() {
  const observers = [];
  class MutationObserver {
    constructor(cb) { this.cb = cb; }
    observe(el) { observers.push({ el, cb: this.cb }); }
    disconnect() {}
  }
  const flipAll = (pairs) => {
    for (const [el, hidden] of pairs) el.hidden = hidden;
    for (const o of observers) if (pairs.some(([el]) => el === o.el)) o.cb([]);
  };
  return { MutationObserver, flipAll, flip: (el, hidden) => flipAll([[el, hidden]]) };
}

function sandbox(dom, extra = {}) {
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, WeakSet, RegExp, Promise, Date, parseFloat, parseInt, isFinite,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: dom.document,
    addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {},
    getComputedStyle: () => ({ getPropertyValue: () => "", overflowY: "auto", visibility: "visible", zIndex: "auto" }),
    innerWidth: 1000, innerHeight: 600, requestAnimationFrame: () => 0,
    ...extra,
  };
  sb.window = sb;
  return sb;
}

// Layers stack in ORDER; the last visible one is on top (z-index stand-in).
function layerStack(dom, ids) {
  const els = ids.map((id) => { const el = dom.byId(id); el._rect = { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }; return el; });
  const UiLayers = {
    LAYER_IDS: ids,
    shown: shownIn,
    top: () => { let t = null; for (const el of els) if (shownIn(el)) t = el; return t; },
  };
  return { els, UiLayers };
}

function control(dom, parent, id, opts = {}) {
  const el = dom.makeElement(opts.tag || "button");
  el.id = id;
  if (opts.type) el.type = opts.type;
  const x = opts.x == null ? 10 : opts.x, y = opts.y == null ? 10 : opts.y;
  const w = opts.w == null ? 200 : opts.w, h = opts.h == null ? 30 : opts.h;
  el._rect = { left: x, top: y, right: x + w, bottom: y + h, width: w, height: h };
  for (const k of Object.keys(opts.attrs || {})) el.setAttribute(k, opts.attrs[k]);
  if (opts.hidden) el.hidden = true;
  parent.appendChild(el);
  return el;
}

function bootMenuNav() {
  const dom = makeDom({ readyState: "loading" });
  const { els, UiLayers } = layerStack(dom, ["overlay"]);
  const layer = els[0];
  const sb = sandbox(dom, { UiLayers });
  vm.runInNewContext(src("js/ui/menu-nav.js"), sb, { filename: "js/ui/menu-nav.js" });
  const key = (k) => {
    const e = { key: k, altKey: false, ctrlKey: false, metaKey: false, defaultPrevented: false, stopped: false };
    e.preventDefault = () => { e.defaultPrevented = true; };
    e.stopPropagation = () => { e.stopped = true; };
    sb.MenuNav.onKeyDown(e);
    return e;
  };
  return { dom, layer, MenuNav: sb.MenuNav, key, add: (id, o) => control(dom, layer, id, o), focused: () => dom.document.activeElement && dom.document.activeElement.id };
}

function bootTopModal(ids) {
  const dom = makeDom({ readyState: "loading" });
  const { els, UiLayers } = layerStack(dom, ids);
  const mo = moShim();
  const sb = sandbox(dom, { UiLayers, MutationObserver: mo.MutationObserver });
  vm.runInNewContext(src("js/ui/menu-nav.js"), sb, { filename: "js/ui/menu-nav.js" });
  vm.runInNewContext(src("js/ui/modal.js"), sb, { filename: "js/ui/modal.js" });
  const byId = Object.fromEntries(els.map((el) => [el.id, el]));
  return { dom, sb, TopModal: sb.TopModal, layer: (id) => byId[id], flip: mo.flip, flipAll: mo.flipAll,
    add: (parent, id, o) => control(dom, parent, id, o), focused: () => dom.document.activeElement && dom.document.activeElement.id };
}

/* ── 3. MenuNav: text fields and sliders own only their own axis ─────────── */

test("MenuNav: D-pad Down leaves a focused search field; the caret keys stay with it", () => {
  const h = bootMenuNav();
  const search = h.add("sel-track-search", { tag: "input", type: "search", y: 10 });
  const row = h.add("row-1", { y: 60 });
  search.focus();
  const down = h.key("ArrowDown");
  assert.equal(h.focused(), "row-1", "Down leaves the text field for the row under it");
  assert.equal(down.defaultPrevented, true, "…and the key is consumed by the menu");
  search.focus();
  for (const k of ["ArrowLeft", "ArrowRight", "Home", "End"]) {
    const e = h.key(k);
    assert.equal(h.focused(), "sel-track-search", `${k} stays with the caret`);
    assert.equal(e.defaultPrevented, false, `${k} keeps its native default in a text field`);
  }
  assert.equal(h.MenuNav.ownsArrows(search, "PageDown"), false, "the page keys page the pane, not the field");
});

test("MenuNav: a range slider keeps Left/Right AND Home/End (ARIA slider ends); Up/Down leave", () => {
  const h = bootMenuNav();
  const above = h.add("above", { y: 10 });
  const range = h.add("vol", { tag: "input", type: "range", y: 60 });
  const below = h.add("below", { y: 110 });
  range.focus();
  for (const k of ["ArrowLeft", "ArrowRight", "Home", "End"]) {
    h.key(k);
    assert.equal(h.focused(), "vol", `${k} is the slider's own`);
  }
  h.key("ArrowDown");
  assert.equal(h.focused(), "below", "Down leaves the slider row");
  range.focus(); h.key("ArrowUp");
  assert.equal(h.focused(), "above", "Up leaves the slider row");
});

/* ── 4. MenuNav: a tab rail owns its own axis, the other axis is the exit ── */

test("MenuNav: Down leaves a horizontal tab rail and the key stops before the rail's own handler", () => {
  const h = bootMenuNav();
  const list = h.dom.makeElement("div"); list.setAttribute("role", "tablist"); h.layer.appendChild(list);
  const t1 = control(h.dom, list, "pm-tab-controls", { x: 10, y: 10, w: 90, attrs: { role: "tab", "aria-selected": "true" } });
  control(h.dom, list, "pm-tab-display", { x: 110, y: 10, w: 90, attrs: { role: "tab" } });
  h.add("panel-toggle", { x: 10, y: 80, w: 190 });
  t1.focus();
  const right = h.key("ArrowRight");
  assert.equal(h.focused(), "pm-tab-controls", "Right along the rail is the widget's (it cycles and selects)");
  assert.equal(right.stopped, false, "…so the event must reach the rail's keydown handler");
  const down = h.key("ArrowDown");
  assert.equal(h.focused(), "panel-toggle", "Down is the way out of a horizontal rail");
  assert.equal(down.stopped, true, "the rail's handler would re-focus the tab (settings-nav) or cycle it (setup-ui): stop it");
  assert.equal(down.defaultPrevented, true);
});

test("MenuNav: Right leaves a vertical tab rail (the paired garage) and Down stays in it", () => {
  const h = bootMenuNav();
  const list = h.dom.makeElement("div"); h.layer.appendChild(list);   // no role=tablist: parent is the rail
  const t1 = control(h.dom, list, "cs-tab-aero", { x: 10, y: 10, w: 90, attrs: { role: "tab" } });
  control(h.dom, list, "cs-tab-engine", { x: 10, y: 50, w: 90, attrs: { role: "tab" } });
  h.add("cs-opt-1", { x: 120, y: 10, w: 200 });
  t1.focus();
  h.key("ArrowDown");
  assert.equal(h.focused(), "cs-tab-aero", "Down along a column rail is the widget's");
  const right = h.key("ArrowRight");
  assert.equal(h.focused(), "cs-opt-1", "Right reaches the options column beside the rail");
  assert.equal(right.stopped, true);
});

test("MenuNav: a declared aria-orientation beats the measured layout; a lone tab keeps the horizontal default", () => {
  const h = bootMenuNav();
  const list = h.dom.makeElement("div"); list.setAttribute("role", "tablist"); list.setAttribute("aria-orientation", "vertical");
  h.layer.appendChild(list);
  const t1 = control(h.dom, list, "t1", { x: 10, y: 10, w: 90, attrs: { role: "tab" } });
  control(h.dom, list, "t2", { x: 110, y: 10, w: 90, attrs: { role: "tab" } });   // laid out as a row…
  h.add("under", { x: 10, y: 80, w: 190 });
  assert.equal(h.MenuNav.ownsArrows(t1, "ArrowDown"), true, "…but declared vertical: Down is the rail's");
  assert.equal(h.MenuNav.ownsArrows(t1, "ArrowRight"), false, "and Right is the exit");
  assert.equal(h.MenuNav.ownsArrows(t1, "Home"), true, "Home/End are always the rail's ends");
  assert.equal(h.MenuNav.ownsArrows(t1, "PageDown"), false, "page keys page the pane");
  // Its own layer: mini-dom's closest() also sees descendants, so a second
  // tablist in the same layer would be found as the lone tab's rail.
  const g = bootMenuNav();
  const solo = g.dom.makeElement("div"); g.layer.appendChild(solo);
  const only = control(g.dom, solo, "only", { x: 10, y: 200, w: 90, attrs: { role: "tab" } });
  assert.equal(g.MenuNav.ownsArrows(only, "ArrowRight"), true, "a lone tab: nothing to cycle, horizontal default");
  assert.equal(g.MenuNav.ownsArrows(only, "ArrowDown"), false);
});

test("MenuNav exports items/currentItem/ownsArrows for the focus-landing seam", () => {
  const h = bootMenuNav();
  for (const k of ["items", "currentItem", "ownsArrows", "FOCUSABLE"]) assert.ok(h.MenuNav[k], `MenuNav.${k}`);
  h.add("plain", { y: 10 });
  const chosen = h.add("chosen", { y: 50, attrs: { "aria-pressed": "true" } });
  const hid = h.add("hid", { y: 90, hidden: true });
  const list = h.MenuNav.items(h.layer);
  assert.ok(!list.includes(hid), "items() skips a hidden control");
  assert.equal(h.MenuNav.currentItem(h.layer, list), chosen, "currentItem prefers the selected control");
});

/* ── 2. TopModal: containment never lands on a hidden control ────────────── */

test("TopModal.onFocusIn pulls focus to the first SHOWN control, not the first in DOM order", () => {
  const h = bootTopModal(["select"]);
  const select = h.layer("select");
  h.add(select, "filtered-row", { hidden: true, y: 10 });
  h.add(select, "zero-box", { y: 40, w: 0, h: 0 });
  h.add(select, "gone", { y: 70, attrs: { "aria-hidden": "true" } });
  h.add(select, "visible-row", { y: 100 });
  const stray = h.add(h.dom.body, "behind", { y: 300 });
  stray.focus();
  h.TopModal.onFocusIn({ target: stray });
  assert.equal(h.focused(), "visible-row", "hidden, zero-box and aria-hidden controls are skipped");
});

/* ── 1. TopModal: focus memory for the hidden-toggled screens ────────────── */

test("TopModal: opening a non-dialog screen lands focus (autofocus > default > selected > first, never a text field)", () => {
  const h = bootTopModal(["overlay", "select"]);
  const select = h.layer("select"); select.hidden = true;
  h.add(select, "sel-track-search", { tag: "input", type: "search", y: 10 });
  const chip = h.add(select, "chip-all", { y: 40, attrs: { "aria-pressed": "true" } });
  h.add(select, "sel-go", { y: 500 });
  h.TopModal.scanLayers();
  h.flip(select, false);
  assert.equal(h.focused(), "chip-all", "the selected control is the landing spot (same rule as the first arrow press)");
  chip.removeAttribute("aria-pressed");
  h.dom.document.activeElement = null;
  h.flip(select, true); h.flip(select, false);
  assert.equal(h.focused(), "chip-all", "with nothing selected: the first usable control that is not a text field");
  const auto = h.add(select, "auto", { y: 540, attrs: { autofocus: "" } });
  h.dom.document.activeElement = null;
  h.flip(select, true); h.flip(select, false);
  assert.equal(h.focused(), "auto", "[autofocus] wins, as it does for a <dialog>");
  assert.equal(h.TopModal.landing(select), auto);
});

test("TopModal: BACK returns focus to the button that opened the screen", () => {
  const h = bootTopModal(["overlay", "select"]);
  const overlay = h.layer("overlay"), select = h.layer("select");
  select.hidden = true;
  const mbRace = h.add(overlay, "mb-race", { y: 10 });
  h.add(overlay, "mb-tt", { y: 50 });
  h.add(select, "chip-all", { y: 10, attrs: { "aria-pressed": "true" } });
  const selBack = h.add(select, "sel-back", { y: 500 });
  h.TopModal.scanLayers();
  mbRace.focus();
  h.flipAll([[overlay, true], [select, false]]);           // mb-race → SELECT
  assert.equal(h.focused(), "chip-all", "focus entered the screen");
  selBack.focus();                                          // Escape presses sel-back
  h.flipAll([[select, true], [overlay, false]]);            // SELECT → title
  assert.equal(h.focused(), "mb-race", "focus is back on the door that opened the screen, not on <body>");
  // Reverse callback order (the flips are one tick either way) gives the same answer.
  const g = bootTopModal(["overlay", "select"]);
  const o2 = g.layer("overlay"), s2 = g.layer("select"); s2.hidden = true;
  const door = g.add(o2, "mb-tt", { y: 10 });
  g.add(s2, "row", { y: 10 });
  const back2 = g.add(s2, "sel-back", { y: 500 });
  g.TopModal.scanLayers();
  door.focus();
  g.flipAll([[s2, false], [o2, true]]);
  back2.focus();
  g.flipAll([[o2, false], [s2, true]]);
  assert.equal(g.focused(), "mb-tt");
});

test("TopModal: a screen reopens on the control it was left from (garage BACK → YOUR CAR)", () => {
  const h = bootTopModal(["overlay", "select", "carsetup"]);
  const overlay = h.layer("overlay"), select = h.layer("select"), garage = h.layer("carsetup");
  select.hidden = true; garage.hidden = true;
  const mbRace = h.add(overlay, "mb-race", { y: 10 });
  h.add(select, "chip-all", { y: 10, attrs: { "aria-pressed": "true" } });
  const selCar = h.add(select, "sel-car", { y: 500 });
  const tab = h.add(garage, "cs-tab-aero", { y: 10, attrs: { role: "tab", "aria-selected": "true" } });
  const csBack = h.add(garage, "cs-back", { y: 500 });
  h.TopModal.scanLayers();
  mbRace.focus();
  h.flipAll([[overlay, true], [select, false]]);
  selCar.focus();
  h.flipAll([[select, true], [garage, false]]);
  assert.equal(h.focused(), "cs-tab-aero", "the garage lands on its selected category");
  assert.equal(tab, h.dom.document.activeElement);
  csBack.focus();
  h.flipAll([[garage, true], [select, false]]);
  assert.equal(h.focused(), "sel-car", "SELECT comes back on YOUR CAR, where it was left");
  selCar.focus();
  // The view-transition path shows the next screen a frame later: hide first, show later.
  h.flip(select, true); h.flip(garage, false);
  csBack.focus();
  h.flip(garage, true);
  assert.equal(h.focused(), "cs-back", "with its screen still hidden, no focus is thrown at sel-car yet");
  h.flip(select, false);
  assert.equal(h.focused(), "sel-car", "…it lands when the screen actually shows");
});

test("TopModal: no focus is restored to a control whose screen is not up (a race started), and dialogs are left to the platform", () => {
  const h = bootTopModal(["overlay", "select", "carsetup", "teampicker", "rotate-device", "photo-controls"]);
  const overlay = h.layer("overlay"), select = h.layer("select"), garage = h.layer("carsetup");
  overlay.hidden = true; garage.hidden = true;
  const selGo = h.add(select, "sel-go", { y: 500 });
  const done = h.add(garage, "cs-done", { y: 500 });
  const dialog = h.layer("teampicker"); dialog.showModal = () => {}; dialog.close = () => {};
  h.add(dialog, "tp-close", { y: 10 });
  const rotate = h.layer("rotate-device"); rotate.hidden = true;
  const rotateBtn = h.add(rotate, "rotate-controls", { y: 10 });
  h.TopModal.scanLayers();
  selGo.focus();
  h.flipAll([[select, true], [garage, false]]);
  done.focus();
  h.flipAll([[garage, true]]);                              // START: everything hides, the HUD is not a layer
  assert.equal(h.focused(), "cs-done", "focus is not thrown at sel-go inside the hidden select screen");
  h.dom.document.activeElement = null;
  h.flip(dialog, false);
  assert.equal(h.focused(), null, "a <dialog> is showModal()'s business, not wired here");
  h.flip(rotate, false);
  assert.equal(h.focused(), null, "rotate-device manages its own focus (LAYER_SKIP)");
  assert.notEqual(rotateBtn, h.dom.document.activeElement);
});

test("TopModal.scanLayers wires every non-dialog UiLayers layer except the two that manage themselves", () => {
  const s = code("js/ui/modal.js");
  assert.match(s, /"rotate-device":\s*1,\s*"photo-controls":\s*1/, "LAYER_SKIP names exactly the rotate blocker and the fly-cam");
  assert.match(s, /el\.tagName !== "DIALOG"\) wireLayer\(el\)/, "dialogs keep showModal()/close() focus handling");
  assert.match(s, /return \{ scan, wire, onEscape, onFocusIn, wireLayer, scanLayers, landing \}/);
});

/* ── 6. The shell: every screen has a name; announcements are live ───────── */

function loadLayerIds() {
  const sb = sandbox(makeDom());
  vm.runInNewContext(src("js/ui/layers.js"), sb, { filename: "js/ui/layers.js" });
  return sb.UiLayers.LAYER_IDS;
}

function openTag(id) {
  const m = HTML.match(new RegExp(`<(div|dialog|section|aside)\\s[^>]*\\bid="${id}"[^>]*>`));
  return m ? m[0] : null;
}
const ids = new Set([...HTML.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

test("every layer in the shell is a named region or dialog, and #announce is a live region", () => {
  const SKIP = {
    overlay: "the title page itself — the document's main content, not a layer over it",
    "photo-controls": "a toolbar of labelled buttons over the free camera, not a screen",
  };
  for (const id of loadLayerIds()) {
    if (SKIP[id]) continue;
    const tag = openTag(id);
    assert.ok(tag, `#${id} is in index.html`);
    const isDialog = tag.startsWith("<dialog");
    assert.ok(isDialog || /\brole="(region|dialog)"/.test(tag), `#${id}: a non-dialog screen carries role=region`);
    const by = tag.match(/aria-labelledby="([^"]+)"/);
    const label = /aria-label="[^"]+"/.test(tag);
    if (id === "datahub") {
      assert.match(read("js/data/hub.js"), /setAttribute\("aria-labelledby", "dh-title"\)/, "#datahub is named at build time by hub.js");
      continue;
    }
    assert.ok(by || label, `#${id} has an accessible name`);
    if (by) for (const ref of by[1].split(/\s+/)) assert.ok(ids.has(ref), `#${id} aria-labelledby → #${ref} exists`);
  }
  assert.match(openTag("announce"), /role="status"/, "#announce (LIGHTS OUT, FINAL LAP, SAVE RESTORED…) is a polite live region");
  // Source-integrity's rule stands: no <div> claims role=dialog / aria-modal.
  for (const id of ["select", "career", "carsetup", "lighting", "camtune"]) {
    assert.doesNotMatch(openTag(id), /role="dialog"|aria-modal/, `#${id} is a region, not a fake modal`);
  }
});

test("Escape/back is one behaviour: every layer names its own door, and every door exists", () => {
  const NO_DOOR = { overlay: "the title has nothing to go back to", "rotate-device": "CSS-gated blocker; Escape falls through to pause" };
  for (const id of loadLayerIds()) {
    const tag = openTag(id);
    if (NO_DOOR[id]) { assert.doesNotMatch(tag, /data-esc/, `#${id} refuses no key and names no door`); continue; }
    const via = tag.match(/data-esc-close="([^"]+)"/);
    if (!via) { assert.match(tag, /data-esc="none"/, `#${id} either names a close control or refuses Escape outright`); continue; }
    const inShell = ids.has(via[1]);
    const built = new RegExp(`\\.id = "${via[1]}"`).test(read("js/data/hub.js"));
    assert.ok(inShell || built, `#${id} → #${via[1]} exists (shell or built by hub.js)`);
  }
  // Both Escape paths press the same control: the dialog `cancel` and the document keydown.
  const tm = code("js/ui/modal.js");
  assert.match(tm, /el\.addEventListener\("cancel"[\s\S]*?getAttribute\("data-esc-close"\)[\s\S]*?btn\.click\(\)/);
  assert.match(tm, /function onEscape[\s\S]*?getAttribute\("data-esc-close"\)[\s\S]*?btn\.click\(\)/);
});

/* ── 7. Lockstep: the layer lists agree ──────────────────────────────────── */

function stringConst(file, name) {
  const s = code(file);
  const m = s.match(new RegExp(`const ${name} = ([\\s\\S]*?);\\n`));
  assert.ok(m, `${name} in ${file}`);
  return new Function("return " + m[1])();
}

test("ScrollFade.SCREENS and AriaState.ROOTS cover every UiLayers layer that scrolls or selects", () => {
  const layers = loadLayerIds();
  const screens = new Set(stringConst("js/ui/scroll-fade.js", "SCREENS").split(",").map((s) => s.trim().slice(1)));
  const roots = new Set(stringConst("js/ui/aria-state.js", "ROOTS").split(",").map((s) => s.trim().slice(1)));
  const SKIP = {
    "rotate-device": "CSS-gated, never toggled by `hidden`; two buttons, no scroll region, no selected state",
    "photo-controls": "no scroll region; its buttons are actions, none carries a selected class",
  };
  for (const id of layers) {
    if (SKIP[id]) continue;
    assert.ok(screens.has(id), `ScrollFade watches #${id}'s hidden flip`);
    assert.ok(roots.has(id), `AriaState observes #${id}`);
  }
  for (const id of [...screens, ...roots]) assert.ok(layers.includes(id), `#${id} is a UiLayers layer`);
});

/* ── 5 + touch targets: measured from the rules, not the screen ──────────── */

function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const hex2 = (n) => Math.round(n).toString(16).padStart(2, "0");
function blend(rgba, bg) {
  const m = rgba.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\)/);
  if (!m) return null;
  const a = m[4] == null ? 1 : parseFloat(m[4]);
  const b = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16));
  return "#" + [m[1], m[2], m[3]].map((v, i) => hex2(parseFloat(v) * a + b[i] * (1 - a))).join("");
}
function resolveColor(value, tokens, bg) {
  const v = value.trim();
  const tok = v.match(/^var\((--[\w-]+)\)$/);
  if (tok) return resolveColor(decl(tokens, ":root", tok[1]), tokens, bg);
  if (v.startsWith("#")) return v.length === 4 ? "#" + [...v.slice(1)].map((c) => c + c).join("") : v;
  return blend(v, bg);
}

test("menus.css text colours clear AA over the darkest sheet ground", () => {
  const tokens = cssRules(read("css/tokens.css"));
  const menus = cssRules(read("css/menus.css"));
  const bg = decl(tokens, ":root", "--bg");
  assert.equal(bg, "#0c0c14", "the darkest ground a sheet can sit over");
  for (const sel of ["#customize .cz-sep", "#customize .cz-row"]) {
    const c = resolveColor(decl(menus, sel, "color"), tokens, bg);
    assert.ok(c, `${sel} colour resolves`);
    assert.ok(contrast(c, bg) >= 4.5, `${sel} ${decl(menus, sel, "color")} → ${c} is ${contrast(c, bg).toFixed(2)}:1 over ${bg}; AA needs 4.5:1`);
  }
  assert.equal(decl(menus, "#customize .cz-sep", "color"), "var(--dim)", "the separator label uses the dim-text token, not a bespoke alpha");
});

test("menu touch targets are token-sized, and the touch ladder lifts every token to ≥ 44px", () => {
  const tokens = cssRules(read("css/tokens.css"));
  const menus = cssRules(read("css/menus.css"));
  const comps = cssRules(read("css/components.css"));
  const floor = (v) => parseFloat((v || "").match(/max\((\d+)px/)?.[1] || "0");
  // Primary controls: --tap is 44px on a mouse pointer and 52px on touch.
  assert.ok(floor(decl(tokens, ":root", "--tap")) >= 44, `--tap ${decl(tokens, ":root", "--tap")}`);
  assert.ok(floor(decl(tokens, "body:not(.desktop)", "--tap")) >= 44);
  for (const sel of [".track-row", ".team-tile", "#soundbtn"]) {
    assert.equal(decl(menus, sel, "min-height"), "var(--tap)", `${sel} is a --tap box`);
  }
  assert.equal(decl(comps, ".bigbtn", "min-height"), "var(--tap)", "the title doors and every sheet BACK/START are --tap boxes");
  // Secondary chips: 40px for a mouse (chips are secondary), 46px on touch —
  // the ≥ 44px rule holds where a finger is the pointer.
  assert.equal(decl(menus, ".sel-chip", "min-height"), "var(--chip-h)");
  assert.equal(decl(menus, "#sel-track-search", "min-height"), "var(--chip-h)");
  assert.ok(floor(decl(tokens, "body:not(.desktop)", "--chip-h")) >= 44, `--chip-h on touch ${decl(tokens, "body:not(.desktop)", "--chip-h")}`);
  assert.ok(ruleFor(menus, "#sel-track-filter .sel-chip"), "filter chips inherit the chip box (padding-only override)");
  assert.equal(decl(menus, "#sel-track-filter .sel-chip", "min-height"), null, "…and do not shrink it");
});
