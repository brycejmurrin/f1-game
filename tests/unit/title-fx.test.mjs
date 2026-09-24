/* title-fx — MENU ANIMATIONS + TITLE INTRO + MENU WASH + TITLE ART as player
 * settings, the one-shot intro, the hidden-tab pause and the title-button
 * haptic. Runs the REAL module in node:vm over a mini DOM.
 *
 * Run: node --test tests/unit/title-fx.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = "js/ui/title-fx.js";
const SRC = fs.readFileSync(path.join(ROOT, FILE), "utf8").replace(/^const\b/gm, "var");
const CSS = fs.readFileSync(path.join(ROOT, "css/responsive.css"), "utf8");
const MENUS = fs.readFileSync(path.join(ROOT, "css/menus.css"), "utf8");
const COMP = fs.readFileSync(path.join(ROOT, "css/components.css"), "utf8");
const SHELL = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const EXPORT = fs.readFileSync(path.join(ROOT, "js/ui/settings-export.js"), "utf8");
const MANIFEST = fs.readFileSync(path.join(ROOT, "tools/manifest.cjs"), "utf8");

function el(id) {
  const attrs = new Map();
  const e = {
    id, hidden: false, parentNode: null, children: [], _handlers: {}, offsetWidthReads: 0,
    setAttribute(k, v) { attrs.set(k, String(v)); },
    removeAttribute(k) { attrs.delete(k); },
    hasAttribute(k) { return attrs.has(k); },
    addEventListener(ev, fn) { this._handlers[ev] = fn; },
    insertBefore(n, ref) {
      const i = ref ? this.children.indexOf(ref) : -1;
      if (i < 0) this.children.push(n); else this.children.splice(i, 0, n);
      n.parentNode = this;
    },
    appendChild(n) { this.insertBefore(n, null); },
    get nextSibling() {
      const s = this.parentNode ? this.parentNode.children : [];
      return s[s.indexOf(this) + 1] || null;
    },
    get offsetWidth() { e.offsetWidthReads++; return 100; },
  };
  return e;
}

function load({ stored = {}, osReduce = false, readyState = "complete", vibrate = true, overlayHidden = false } = {}) {
  const timers = new Map();
  let nextTimer = 1;
  const frames = [];
  const written = {};
  const buzz = [];
  const wired = [];
  const observers = [];
  const ids = new Map();
  const overlay = el("overlay");
  overlay.setAttribute("data-intro", "");
  overlay.hidden = overlayHidden;
  // Static Appearance rows (shell declares them).
  for (const id of ["pm-motion", "pm-titleintro", "pm-menuwash", "pm-menulayout", "pm-titleart", "pm-replay-intro"]) {
    ids.set(id, el(id));
  }
  ids.set("overlay", overlay);
  const html = { dataset: {} };
  const document = {
    readyState, documentElement: html, visibilityState: "visible", _handlers: {},
    getElementById: (id) => ids.get(id) || null,
    addEventListener(ev, fn) { this._handlers[ev] = fn; },
    createElement: (tag) => el(tag),
  };
  const sb = {
    Math, console, Object, Array, JSON, String, Number,
    GameStore: { store: {
      get: (k, d) => (k in stored ? stored[k] : d),
      set: (k, v) => { written[k] = v; stored[k] = v; },
    } },
    SettingRow: {
      wire: (id, spec) => { wired.push({ id, spec }); ids.get(id)._spec = spec; },
      paint: () => {},
    },
    setTimeout: (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    MutationObserver: function (fn) {
      const o = { observe() {}, disconnect() { this.off = true; }, fn, o: null };
      o.observe = (el, opts) => { o.o = opts; observers.push(o); };
      o.fn = fn;
      return o;
    },
    document, window: {
      matchMedia: () => ({
        matches: osReduce,
        addEventListener() {},
        addListener() {},
      }),
    },
    Input: vibrate ? { vibrate: (n) => buzz.push(n) } : undefined,
  };
  sb.window.document = document;
  sb.window.matchMedia = () => ({
    matches: osReduce,
    addEventListener(_t, fn) { sb._mq = fn; },
    addListener(fn) { sb._mq = fn; },
  });
  const ctx = vm.createContext(sb);
  ctx.MutationObserver = function (fn) {
    const o = {
      off: false,
      o: null,
      fn,
      observe(_el, opts) { this.o = opts; observers.push(this); },
      disconnect() { this.off = true; },
    };
    return o;
  };
  vm.runInContext(SRC, ctx, { filename: FILE });
  return {
    M: vm.runInContext("TitleFx", ctx),
    html, written, wired, ids, overlay, document, timers, frames, buzz, observers,
    runTimers: () => { for (const t of [...timers.values()]) t.fn(); timers.clear(); },
    runFrames: () => { const f = frames.splice(0); for (const fn of f) fn(); },
  };
}

test("shell declares MENU ANIMATIONS, TITLE INTRO, MENU WASH, MENU LAYOUT, TITLE ART and REPLAY INTRO", () => {
  assert.ok(SHELL.includes('id="pm-panel-appearance"'));
  assert.ok(SHELL.includes('id="pm-motion"'));
  assert.ok(SHELL.includes('id="pm-titleintro"'));
  assert.ok(SHELL.includes('id="pm-menuwash"'));
  assert.ok(SHELL.includes('id="pm-menulayout"'));
  assert.ok(SHELL.includes('id="pm-titleart"'));
  assert.ok(SHELL.includes('id="pm-replay-intro"'));
  assert.ok(SHELL.includes('id="pm-uiscale"'));
  assert.ok(SHELL.includes("apex26.titleIntro"));
  assert.ok(SHELL.includes("apex26.menuWash"));
  assert.ok(SHELL.includes("apex26.menuLayout"));
  assert.ok(SHELL.includes("apex26.titleArt"));
  // UI SIZE moved under APPEARANCE (not DISPLAY).
  const app = SHELL.slice(SHELL.indexOf('id="pm-panel-appearance"'), SHELL.indexOf('id="advanced"'));
  assert.ok(app.includes('id="pm-uiscale"'));
  assert.ok(!SHELL.slice(SHELL.indexOf('id="pm-panel-display"'), SHELL.indexOf('id="pm-panel-appearance"')).includes('id="pm-uiscale"'));
});

test("defaults: motion ON, intro FULL, wash FULL, layout AUTO, title art ON (no data-*)", () => {
  const { html, M } = load({ readyState: "loading" });
  assert.equal(M.mode(), "on");
  assert.equal(M.introMode(), "full");
  assert.equal(M.washMode(), "full");
  assert.equal(M.layoutMode(), "auto");
  assert.equal(M.artMode(), "on");
  assert.equal(html.dataset.motion, undefined);
  assert.equal(html.dataset.titleIntro, undefined);
  assert.equal(html.dataset.menuWash, undefined);
  assert.equal(html.dataset.menuLayout, undefined);
  assert.equal(html.dataset.titleArt, undefined);
});

test("OS reduced motion always wins over a stored ON", () => {
  const { html, M } = load({ osReduce: true, stored: { motion: "on" } });
  assert.equal(M.mode(), "reduce");
  assert.equal(html.dataset.motion, "reduce");
});

test("a stored REDUCED lands on a normal OS, and garbage reads as unset (ON)", () => {
  assert.equal(load({ stored: { motion: "reduce" } }).html.dataset.motion, "reduce");
  assert.equal(load({ stored: { motion: 7 } }).M.mode(), "on");
});

test("TITLE INTRO quick/off stamp data-title-intro; garbage falls to full", () => {
  const quick = load({ stored: { titleIntro: "quick" } });
  assert.equal(quick.M.introMode(), "quick");
  assert.equal(quick.html.dataset.titleIntro, "quick");
  assert.equal(quick.M.introHoldMs(), 1200);
  const off = load({ stored: { titleIntro: "off" } });
  assert.equal(off.html.dataset.titleIntro, "off");
  assert.ok(!off.overlay.hasAttribute("data-intro"), "OFF drops the intro at once");
  assert.equal(load({ stored: { titleIntro: "slow" } }).M.introMode(), "full");
});

test("MENU WASH soft/off stamp data-menu-wash; garbage falls to full", () => {
  const soft = load({ stored: { menuWash: "soft" } });
  assert.equal(soft.M.washMode(), "soft");
  assert.equal(soft.html.dataset.menuWash, "soft");
  const off = load({ stored: { menuWash: "off" } });
  assert.equal(off.html.dataset.menuWash, "off");
  assert.equal(load({ stored: { menuWash: "neon" } }).M.washMode(), "full");
});

test("MENU LAYOUT stack/compact stamp data-menu-layout; garbage falls to auto", () => {
  const stack = load({ stored: { menuLayout: "stack" } });
  assert.equal(stack.M.layoutMode(), "stack");
  assert.equal(stack.html.dataset.menuLayout, "stack");
  const compact = load({ stored: { menuLayout: "compact" } });
  assert.equal(compact.html.dataset.menuLayout, "compact");
  assert.equal(load({ stored: { menuLayout: "masonry" } }).M.layoutMode(), "auto");
});

test("TITLE ART soft/off stamp data-title-art; garbage falls to on", () => {
  const soft = load({ stored: { titleArt: "soft" } });
  assert.equal(soft.M.artMode(), "soft");
  assert.equal(soft.html.dataset.titleArt, "soft");
  const off = load({ stored: { titleArt: "off" } });
  assert.equal(off.html.dataset.titleArt, "off");
  assert.equal(load({ stored: { titleArt: "neon" } }).M.artMode(), "on");
});

test("Appearance rows wire and round-trip motion + intro + wash + layout + titleArt", () => {
  const { wired, written, html, ids, M } = load();
  assert.deepEqual(wired.map((w) => w.id).sort(), [
    "pm-menulayout", "pm-menuwash", "pm-motion", "pm-titleart", "pm-titleintro",
  ]);
  ids.get("pm-motion")._spec.write("reduce");
  assert.equal(written.motion, "reduce");
  assert.equal(html.dataset.motion, "reduce");
  ids.get("pm-titleintro")._spec.write("quick");
  assert.equal(written.titleIntro, "quick");
  assert.equal(html.dataset.titleIntro, "quick");
  ids.get("pm-menuwash")._spec.write("soft");
  assert.equal(written.menuWash, "soft");
  assert.equal(html.dataset.menuWash, "soft");
  ids.get("pm-menulayout")._spec.write("stack");
  assert.equal(written.menuLayout, "stack");
  assert.equal(html.dataset.menuLayout, "stack");
  ids.get("pm-titleart")._spec.write("soft");
  assert.equal(written.titleArt, "soft");
  assert.equal(html.dataset.titleArt, "soft");
  M.setArt("off");
  assert.equal(html.dataset.titleArt, "off");
  M.setArt("on");
  assert.equal(html.dataset.titleArt, undefined);
  M.setIntro("full");
  assert.equal(html.dataset.titleIntro, undefined);
  M.setWash("full");
  assert.equal(html.dataset.menuWash, undefined);
  M.setLayout("auto");
  assert.equal(html.dataset.menuLayout, undefined);
  M.set("on");
  assert.equal(html.dataset.motion, undefined);
});

test("wiring waits for DOMContentLoaded while deferred scripts still run", () => {
  const { wired, document } = load({ readyState: "interactive" });
  assert.equal(wired.length, 0, "SettingRow loads after this file — never wire at eval here");
  document._handlers.DOMContentLoaded();
  assert.equal(wired.length, 5);
});

test("REPLAY INTRO button calls replay()", () => {
  const { ids, overlay, runTimers, runFrames } = load();
  runTimers();
  assert.ok(!overlay.hasAttribute("data-intro"));
  ids.get("pm-replay-intro")._handlers.click();
  assert.ok(!overlay.hasAttribute("data-intro"), "dropped first");
  runFrames();
  assert.ok(overlay.hasAttribute("data-intro"), "back on a frame later");
});

test("the intro plays ONCE: held one pass, then gone for good", () => {
  const { overlay, timers, runTimers, observers } = load();
  assert.ok(overlay.hasAttribute("data-intro"), "visible at boot → the shell's intro stays on");
  assert.equal([...timers.values()][0].ms, 2800);
  runTimers();
  assert.ok(!overlay.hasAttribute("data-intro"), "after one pass the title rests");
  assert.equal(observers.length, 0, "no observer: coming back from a room never replays");
  assert.equal(overlay.offsetWidthReads, 0, "no forced layout anywhere");
});

test("QUICK intro holds for 1200 ms", () => {
  const { timers } = load({ stored: { titleIntro: "quick" } });
  assert.equal([...timers.values()][0].ms, 1200);
});

test("reduced motion and INTRO OFF drop the intro at once", () => {
  assert.ok(!load({ osReduce: true }).overlay.hasAttribute("data-intro"));
  assert.ok(!load({ stored: { titleIntro: "off" } }).overlay.hasAttribute("data-intro"));
  const { M, overlay } = load();
  M.set("reduce");
  assert.ok(!overlay.hasAttribute("data-intro"));
});

test("replay under INTRO OFF lifts the stamp for one FULL preview", () => {
  const { M, html, overlay, runFrames, runTimers, timers } = load({ stored: { titleIntro: "off" } });
  assert.equal(html.dataset.titleIntro, "off");
  assert.ok(!overlay.hasAttribute("data-intro"));
  M.replay();
  assert.equal(html.dataset.titleIntro, undefined, "off stamp lifted so CSS can run");
  runFrames();
  assert.ok(overlay.hasAttribute("data-intro"));
  assert.equal([...timers.values()][0].ms, 2800, "FULL timing for the preview");
  runTimers();
  assert.ok(!overlay.hasAttribute("data-intro"));
  assert.equal(html.dataset.titleIntro, "off", "off stamp restored");
});

test("booted past the title, the intro waits for the first time it is seen", () => {
  const { overlay, observers, timers, runTimers } = load({ overlayHidden: true });
  const mo = observers[0];
  assert.deepEqual(JSON.parse(JSON.stringify(mo.o.attributeFilter)), ["hidden"]);
  assert.equal(timers.size, 0);
  overlay.hidden = false; mo.fn();
  assert.ok(mo.off, "one-shot: the observer disconnects");
  assert.equal(timers.size, 1);
  runTimers();
  assert.ok(!overlay.hasAttribute("data-intro"));
});

test("replay() restarts on the next frame, never with a forced layout", () => {
  const { M, overlay, runTimers, runFrames } = load();
  runTimers();
  M.replay();
  assert.ok(!overlay.hasAttribute("data-intro"), "dropped first");
  runFrames();
  assert.ok(overlay.hasAttribute("data-intro"), "back on a frame later");
  runTimers();
  assert.ok(!overlay.hasAttribute("data-intro"));
  assert.equal(overlay.offsetWidthReads, 0);
});

test("a hidden tab pauses the title animations and a visible one resumes them", () => {
  const { overlay, document } = load();
  document.visibilityState = "hidden"; document._handlers.visibilitychange();
  assert.ok(overlay.hasAttribute("data-paused"));
  document.visibilityState = "visible"; document._handlers.visibilitychange();
  assert.ok(!overlay.hasAttribute("data-paused"));
});

test("a title .bigbtn click taps through Input.vibrate, anything else does not", () => {
  const { overlay, buzz } = load();
  const btn = { disabled: false };
  overlay._handlers.click({ isTrusted: true, target: { closest: (s) => (s === ".bigbtn" ? btn : null) } });
  overlay._handlers.click({ isTrusted: true, target: { closest: () => null } });
  overlay._handlers.click({ isTrusted: false, target: { closest: () => btn } });
  btn.disabled = true;
  overlay._handlers.click({ isTrusted: true, target: { closest: () => btn } });
  assert.deepEqual(buzz, [8], "one tap, via the slider-scaled path (no-op on iOS inside Input); a scripted click is not a finger");
  const noInput = load({ vibrate: false });
  assert.doesNotThrow(() => noInput.overlay._handlers.click({ isTrusted: true, target: { closest: () => ({}) } }));
});

test("CSS keys off data-motion / data-title-intro / data-menu-wash / data-menu-layout / data-title-art; export lists them", () => {
  assert.match(CSS, /:root\[data-motion="reduce"\] :is\(#overlay, \.screen\) \*/);
  assert.match(CSS, /#overlay\[data-paused\]/);
  assert.match(MENUS, /:root\[data-title-art="soft"\] #title-car/);
  assert.match(MENUS, /:root\[data-title-art="off"\] #title-car/);
  assert.match(MENUS, /--menu-wash-pct:\s*12%/);
  assert.match(MENUS, /--menu-wash-pct:\s*0%/);
  assert.match(MENUS, /var\(--menu-wash-pct/);
  assert.match(CSS, /var\(--menu-wash-pct/);
  assert.match(MENUS, /--grain-opacity:\s*0\.025/);
  assert.match(MENUS, /--grain-opacity:\s*0/);
  assert.match(COMP, /opacity:\s*var\(--grain-opacity/);
  assert.match(MENUS, /data-title-intro="quick"/);
  assert.match(MENUS, /:not\(\[data-title-intro="off"\]\)/);
  assert.match(COMP, /:not\(\[data-title-intro="off"\]\)/);
  assert.match(MENUS, /:root\[data-menu-layout="stack"\] #menu-primary/);
  assert.match(MENUS, /:root\[data-menu-layout="compact"\] #menu-buttons/);
  assert.match(EXPORT, /k:\s*"motion"[\s\S]*?group:\s*"appearance"/);
  assert.match(EXPORT, /k:\s*"titleIntro"[\s\S]*?group:\s*"appearance"/);
  assert.match(EXPORT, /k:\s*"menuWash"[\s\S]*?group:\s*"appearance"/);
  assert.match(EXPORT, /k:\s*"menuLayout"[\s\S]*?group:\s*"appearance"/);
  assert.match(EXPORT, /k:\s*"titleArt"[\s\S]*?group:\s*"appearance"/);
  assert.match(EXPORT, /k:\s*"uiScale"[\s\S]*?group:\s*"appearance"/);
  assert.match(MANIFEST, /\["js\/core\/store\.js", "js\/ui\/title-fx\.js"\]/);
});
