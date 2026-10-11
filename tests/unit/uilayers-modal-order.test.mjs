// Native selectors retain DOM order; actual showModal calls establish the stack.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");

// Minimal DOM: elements carry the handful of members uilayers.js reads
// (hidden, box, children, matches, id) — enough to exercise top()'s ranking
// without pulling in a DOM implementation.
function fakeDom(els, modalOrder) {
  const node = (e) => ({
    id: e.id,
    hidden: !!e.hidden,
    _modal: false,
    showModal() { this._modal = true; },
    close() { this._modal = false; },
    _z: e.z,
    children: e.children || [],
    getBoundingClientRect: () => e.box || { width: 800, height: 600 },
    matches(sel) { return sel === ":modal" ? this._modal : false; },
  });
  const nodes = els.map(node);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const context = {
    window: {},
    document: {
      querySelectorAll(sel) {
        if (sel === ":modal") return nodes.filter((n) => n._modal);
        // ALL_SEL is the layer list with :not([hidden]) — honour the hidden
        // half, since that is what keeps the query cheap mid-race.
        const ids = new Set(sel.split(",").map((s) => s.trim().replace(/^#/, "").replace(/:not\(\[hidden\]\)$/, "")));
        return nodes.filter((n) => ids.has(n.id) && !n.hidden);
      },
      getElementById: (id) => byId.get(id) || null,
    },
    getComputedStyle: (el) => ({ zIndex: el._z == null ? "auto" : String(el._z), visibility: "visible" }),
    Log: { info() {}, warn() {} },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read("js/ui/layers.js"), context);
  const U = context.window.UiLayers;
  nodes.forEach((n) => U.trackDialog(n));
  modalOrder.forEach((id) => byId.get(id).showModal());
  U._nodes = byId;
  U._doc = context.document;
  return U;
}

test("the LAST-SHOWN dialog is top, even when it comes first in the DOM", () => {
  // #pmsettings appears BEFORE #teampicker in the layer list, but was
  // shown second — so it is later in the top layer and must win.
  const U = fakeDom(
    [{ id: "pmsettings", modal: true }, { id: "teampicker", modal: true }],
    ["teampicker", "pmsettings"],
  );
  assert.equal(U.top().id, "pmsettings",
    "top-layer order, not DOM order, decides between two open dialogs");
});

test("DOM order still answers when it agrees with open order", () => {
  const U = fakeDom(
    [{ id: "pmsettings", modal: true }, { id: "teampicker", modal: true }],
    ["pmsettings", "teampicker"],
  );
  assert.equal(U.top().id, "teampicker");
});

test("any modal outranks any z-index, and hidden layers never rank", () => {
  const U = fakeDom(
    [{ id: "overlay", z: 9000 }, { id: "teampicker", modal: true }, { id: "select", z: 12, hidden: true }],
    ["teampicker"],
  );
  assert.equal(U.top().id, "teampicker", "a dialog is in the top layer, above every z-index");
});

test("a zero-box modal still outranks the sized screen behind it", () => {
  // Chromium can leave a freshly showModal()'d dialog at 0×0 after the
  // hidden→[open] seam (css/dialog-platform.css). shownLayer() would skip it
  // and hand the layer to #pausemenu — menu-keyboard's "open modal is the
  // active layer" wait then times out with TopModal already logging #standings.
  const U = fakeDom(
    [
      { id: "pausemenu", modal: true, z: 30 },
      { id: "standings", modal: true, box: { width: 0, height: 0 } },
    ],
    ["pausemenu", "standings"],
  );
  assert.equal(U.top().id, "standings",
    ":modal wins even when getBoundingClientRect is empty");
});

test("with no dialogs open the z-index ranking is unchanged", () => {
  const U = fakeDom([{ id: "overlay", z: 10 }, { id: "select", z: 40 }], []);
  assert.equal(U.top().id, "select");
});

test("#loading is a gated UiLayers entry: anyOpen while the plate is up", () => {
  // Without a DEFS entry, Escape paused under the pre-race card (anyOpen stayed
  // false; top() never named #loading). Default gate + shown box → anyOpen.
  const U = fakeDom(
    [{ id: "loading", z: 36 }, { id: "overlay", z: 20, hidden: true }],
    [],
  );
  assert.equal(U.top().id, "loading", "the plate ranks above the hidden title");
  assert.equal(U.anyOpen(), true, "driving keys and Escape-as-pause stay gated");
  U._nodes.get("loading").hidden = true;
  assert.equal(U.anyOpen(), false, "clearing the plate restores anyOpen");
});

test("navOpen: no querySelectorAll when nothing is open (it runs every frame for a pad player)", () => {
  const U = fakeDom([{ id: "overlay", z: 10, hidden: true }, { id: "rotate-device", hidden: true }, { id: "pausemenu", modal: true, hidden: true }], []);
  let scans = 0;
  const qsa = U._doc.querySelectorAll;
  U._doc.querySelectorAll = (sel) => { scans++; return qsa(sel); };
  assert.equal(U.navOpen(), false, "a race with nothing open");
  assert.equal(scans, 0, "the hot path must not run top()'s selector walk");
  U._nodes.get("overlay").hidden = false;
  assert.equal(U.navOpen(), true, "the title screen keeps pad navigation");
  U._nodes.get("overlay").hidden = true;
  U._nodes.get("rotate-device").hidden = false;
  assert.equal(U.navOpen(), true, "so does the rotate blocker");
  U._nodes.get("rotate-device").hidden = true;
  U._nodes.get("pausemenu").hidden = false;
  U._nodes.get("pausemenu").showModal();
  assert.equal(U.navOpen(), true, "an open dialog still counts");
  assert.equal(scans, 0);
});

test("Photo Studio owns focus and Escape above its borrowed fly-camera controls", () => {
  const html = read("index.html");
  const layerZ = (file, id) => {
    const match = read(file).match(new RegExp(`#${id}\\s*\\{[^}]*z-index:\\s*(\\d+)`));
    assert.ok(match, id + " has a stacking level"); return Number(match[1]);
  };
  const layers = [{ id: "photo-studio", z: layerZ("css/photo-studio.css", "photo-studio") },
    { id: "photo-controls", z: layerZ("css/hud.css", "photo-controls") }];
  layers.sort((a, b) => html.indexOf(`id="${a.id}"`) - html.indexOf(`id="${b.id}"`));
  assert.equal(fakeDom(layers, []).top().id, "photo-studio");
});

test("topmodal does not preventDefault a non-cancelable focusin (F9)", () => {
  const src = read("js/ui/modal.js");
  assert.doesNotMatch(src, /focusin[\s\S]{0,1200}?e\.preventDefault\(\)/,
    "focusin is not cancelable — preventDefault there is a no-op that reads as a guard");
  assert.match(src, /No preventDefault: `focusin` is NOT cancelable/);
});

test("menunav releases its per-press measurement cache (F11)", () => {
  const src = read("js/ui/menu-nav.js");
  assert.match(src, /try \{ navKey\(e\); \} finally \{ _boxes = null; \}/,
    "the box cache must be dropped across every early return, not just replaced next press");
  assert.match(src, /_boxes = new Map\(\);/, "still fresh per press");
});

// ── Escape in a NESTED dialog belongs to that dialog ────────────────────────
// The Data Hub's telemetry popup is a showModal() <dialog> built INSIDE
// #datahub (js/data/telemetry.js) and is not a UiLayers entry, so top() still
// names #datahub. onEscape used to press the hub's data-esc-close door and the
// whole hub closed under the popup. It now stands aside when the topmost
// :modal sits inside the layer, so the popup's own cancel runs.
function escHarness(modalIds) {
  let clicks = 0;
  const btn = { disabled: false, click() { clicks++; } };
  const popup = { id: "popup" };
  const layer = {
    id: "datahub",
    getAttribute: (a) => (a === "data-esc-close" ? "dh-close-btn" : null),
    contains: (el) => el === layer || el === popup,
  };
  const byId = { datahub: layer, popup };
  const context = {
    window: { UiLayers: { top: () => layer } },
    document: {
      readyState: "loading",
      addEventListener() {},
      getElementById: (id) => (id === "dh-close-btn" ? btn : null),
      querySelectorAll: (sel) => (sel === ":modal" ? modalIds.map((id) => byId[id]) : []),
    },
    WeakSet, WeakMap,
    Log: { info() {}, warn() {} },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read("js/ui/modal.js"), context);
  const ev = (extra = {}) => {
    const e = { key: "Escape", defaultPrevented: false, stopped: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...extra };
    context.window.TopModal.onEscape(e);
    return e;
  };
  return { ev, clicks: () => clicks };
}

test("Escape over the telemetry popup leaves the Data Hub open (the popup's cancel runs)", () => {
  const h = escHarness(["datahub", "popup"]);
  const e = h.ev();
  assert.equal(h.clicks(), 0, "the hub's close door was not pressed");
  assert.equal(e.defaultPrevented, false, "native cancel must still reach the popup");
  assert.equal(e.stopped, false);
});

test("Escape on the Data Hub itself still presses its door", () => {
  const h = escHarness(["datahub"]);
  const e = h.ev();
  assert.equal(h.clicks(), 1);
  assert.equal(e.defaultPrevented, true);
});

test("Escape with a disabled data-esc-close door still consumes the key", () => {
  // Photo Studio used to disable #ps-close during CAPTURE/CLOSING; onEscape
  // returned without preventDefault and Escape leaked to pause/resume.
  let clicks = 0;
  const btn = { disabled: true, click() { clicks++; } };
  const layer = {
    id: "photo-studio",
    getAttribute: (a) => (a === "data-esc-close" ? "ps-close" : null),
    contains: () => true,
  };
  const context = {
    window: { UiLayers: { top: () => layer } },
    document: {
      readyState: "loading",
      addEventListener() {},
      getElementById: (id) => (id === "ps-close" ? btn : null),
      querySelectorAll: () => [],
    },
    WeakSet, WeakMap,
    Log: { info() {}, warn() {} },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read("js/ui/modal.js"), context);
  const e = { key: "Escape", defaultPrevented: false, stopped: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
  context.window.TopModal.onEscape(e);
  assert.equal(clicks, 0, "a disabled door is not clicked");
  assert.equal(e.defaultPrevented, true, "Escape is still consumed");
  assert.equal(e.stopped, true);
});

// ── A STALE close event must not shut a reopened screen ─────────────────────
// `close` is dispatched as a queued task, so on a busy page the event for a close
// the app made can land AFTER the screen was reopened. The close listener read
// "visible and closing" as a platform close nothing asked for and pressed the
// door — SETTINGS shut the instant it reopened (menu-traversal, CONTROLS).
test("a close event arriving after the screen reopened does not press its door", () => {
  const listeners = {};
  let clicks = 0;
  const door = { click() { clicks++; } };
  const dlg = {
    hidden: false, open: false,
    hasAttribute: () => true, getAttribute: (a) => (a === "data-esc-close" ? "door" : null),
    addEventListener: (t, fn) => { listeners[t] = fn; },
    showModal() { this.open = true; }, close() { this.open = false; },
  };
  const context = {
    window: {}, WeakSet, WeakMap, queueMicrotask: () => {},
    MutationObserver: class { observe() {} },
    document: { readyState: "loading", addEventListener() {}, getElementById: (id) => (id === "door" ? door : null), querySelectorAll: () => [], querySelector: () => null },
    Log: { info() {}, warn() {} },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read("js/ui/modal.js"), context);
  context.window.TopModal.wire(dlg);
  assert.ok(listeners.close, "the close listener is wired");
  // Reopened: visible and open when the old close event finally arrives.
  dlg.hidden = false; dlg.open = true;
  listeners.close();
  assert.equal(clicks, 0, "a stale close on an OPEN dialog leaves the door alone");
  // A real platform close (visible, no longer open) still goes through the door.
  dlg.open = false;
  listeners.close();
  assert.equal(clicks, 1, "a platform close of a visible screen still presses its door");
});

test("a :modal dialog that bypassed the showModal wrapper still outranks an earlier tracked one", () => {
  // Packed-3 menu-keyboard: #standings was :modal (CLOSE focused, painted on
  // top) while activeLayer() stayed on #pausemenu, because standings had no
  // modalOrder stamp and ranked 0 against pause's serial.
  const U = fakeDom([{ id: "pausemenu" }, { id: "standings" }], ["pausemenu"]);
  U._nodes.get("standings")._modal = true;
  assert.equal(U.top().id, "standings",
    "a live :modal without a wrapper stamp is stamped on first top() and wins");
});

test("a zero-box :modal still ranks above a sized screen behind it", () => {
  const U = fakeDom(
    [{ id: "pausemenu", z: 30 }, { id: "standings", box: { width: 0, height: 0 } }],
    ["standings"],
  );
  assert.equal(U.top().id, "standings",
    ":modal skips the shownLayer size gate (Chromium dropped-box re-attach)");
});

test("close and reopen moves a dialog above the previously latest opening", () => {
  const U = fakeDom([{id:"pmsettings"}, {id:"teampicker"}], ["pmsettings", "teampicker"]);
  assert.equal(U.top().id, "teampicker");
  U._nodes.get("pmsettings").close();
  U._nodes.get("pmsettings").showModal();
  assert.equal(U.top().id, "pmsettings");
  U._nodes.get("teampicker").showModal();
  assert.equal(U.top().id, "pmsettings", "showModal on an already-modal dialog does not move it");
});

// ── A HELD Escape is one press ──────────────────────────────────────────────
// The auto-repeat of the Escape that paused a race reached the pause menu's
// data-esc-close door (pm-resume) and resumed it; from a Settings sub-page it
// walked BACK → close → RESUME. onEscape swallows a repeat before any door.
test("a repeated (held) Escape reaches no door and is consumed", () => {
  const h = escHarness(["datahub"]);
  const first = h.ev();
  assert.equal(h.clicks(), 1, "the first press still goes through the door");
  assert.equal(first.defaultPrevented, true);
  const again = h.ev({ repeat: true });
  assert.equal(h.clicks(), 1, "the auto-repeat pressed no door");
  assert.equal(again.defaultPrevented, true, "…and is consumed, so the pause switch never sees it");
  assert.equal(again.stopped, true);
});

// ── Closing a screen hands focus back to a NON-inert opener ─────────────────
// sync() closed the dialog BEFORE syncMenuIsolation() lifted `inert` from the
// title (#overlay): the platform's close() focus restore hit an inert opener
// and focus fell to <body>. Same order bug in wireLayer for non-dialog layers.
function isolationHarness(layerIsDialog) {
  const doc = { activeElement: null };
  const overlay = { id: "overlay", inert: false, hidden: false, setAttribute() {}, removeAttribute() {} };
  // A fake focus() that honours `inert` the way the platform does: a no-op.
  const opener = { id: "mb-garage", hidden: false, disabled: false, getAttribute: () => null,
    focus() { if (!overlay.inert) doc.activeElement = opener; } };
  const inner = { id: "inner-btn", hidden: false, disabled: false, getAttribute: () => null,
    focus() { doc.activeElement = inner; } };
  let mo = null;
  const layer = {
    id: "teampicker", hidden: true, open: false,
    hasAttribute: () => true, getAttribute: () => null, addEventListener() {},
    contains: (el) => el === layer || el === inner,
    querySelector: (sel) => (sel === "[autofocus]" ? inner : null),
    querySelectorAll: () => [inner],
  };
  if (layerIsDialog) {
    layer.showModal = function () { this.open = true; inner.focus(); };
    // Native close(): focus goes back to the element focused before showModal.
    layer.close = function () { this.open = false; opener.focus(); };
  }
  const byId = { overlay, teampicker: layer };
  const document = {
    readyState: "loading", addEventListener() {},
    get activeElement() { return doc.activeElement; },
    body: { contains: (el) => el === opener || el === inner },
    getElementById: (id) => byId[id] || null,
    querySelectorAll: () => [], querySelector: () => null,
  };
  const context = {
    window: { UiLayers: { LAYER_IDS: ["overlay", "teampicker"], top: () => null } },
    WeakSet, WeakMap, queueMicrotask: () => {},
    MutationObserver: class { constructor(fn) { mo = fn; } observe() {} },
    document, Log: { info() {}, warn() {} },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read("js/ui/modal.js"), context);
  return { doc, overlay, opener, inner, layer, TopModal: context.window.TopModal, fire: () => mo() };
}

test("closing a dialog lifts #overlay's inert BEFORE close(), so focus returns to the opener", () => {
  const h = isolationHarness(true);
  h.doc.activeElement = h.opener;
  h.TopModal.wire(h.layer);              // hidden: nothing opens yet
  h.layer.hidden = false; h.fire();      // open: showModal + isolate the title
  assert.equal(h.layer.open, true);
  assert.equal(h.overlay.inert, true, "the title is isolated while the sheet is up");
  assert.equal(h.doc.activeElement, h.inner);
  h.layer.hidden = true; h.fire();       // close
  assert.equal(h.layer.open, false);
  assert.equal(h.overlay.inert, false);
  assert.equal(h.doc.activeElement, h.opener, "close() restored focus to a live (non-inert) opener, not <body>");
});

test("hiding a non-dialog layer lifts #overlay's inert BEFORE refocusing the opener", () => {
  const h = isolationHarness(false);
  h.doc.activeElement = h.opener;
  h.TopModal.wireLayer(h.layer);
  h.layer.hidden = false; h.fire();      // show: remembers the opener, lands inside
  assert.equal(h.doc.activeElement, h.inner, "focus landed inside the layer");
  assert.equal(h.overlay.inert, true, "isolation applies AFTER the opener was recorded");
  h.layer.hidden = true; h.fire();       // hide
  assert.equal(h.overlay.inert, false);
  assert.equal(h.doc.activeElement, h.opener, "focus went back to the opener on the title");
});
