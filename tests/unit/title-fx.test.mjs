/* title-fx — MENU ANIMATIONS as a player setting, the one-shot intro, the hidden-
 * tab pause and the title-button haptic. Runs the REAL module in node:vm over
 * a mini DOM: the failure modes are all quiet ones (the attribute never lands,
 * the row is never claimed, the replay never restarts, the tap bypasses the
 * HAPTICS slider), and each looks fine in the shell until someone checks.
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
  const built = [];
  const observers = [];
  const ids = new Map();
  const overlay = el("overlay");
  overlay.setAttribute("data-intro", "");          // the shell ships it
  overlay.hidden = overlayHidden;
  const pane = el("pane");
  const label = el("uiscale-label");
  pane.appendChild(label);
  const slider = el("pm-uiscale");
  label.appendChild(slider);
  ids.set("overlay", overlay).set("pm-uiscale", slider);
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
      build: (id, text, values) => { const row = el(id); ids.set(id, row); built.push({ id, text, values }); return { row }; },
      wire: (row, spec) => { row._spec = spec; return row; },
    },
    setTimeout: (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    MutationObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe(t, o) { this.t = t; this.o = o; } disconnect() { this.off = true; } },
    document,
  };
  if (vibrate) sb.Input = { vibrate: (ms) => buzz.push(ms) };
  sb.window = sb;
  sb.window.matchMedia = () => ({ matches: osReduce, addEventListener() {} });
  const ctx = vm.createContext(sb);
  vm.runInContext(SRC, ctx, { filename: FILE });
  const runTimers = () => { const all = [...timers.values()]; timers.clear(); all.forEach((t) => t.fn()); };
  const runFrames = () => { frames.splice(0).forEach((fn) => fn()); };
  return { M: vm.runInContext("TitleFx", ctx), html, overlay, pane, written, buzz, built, observers, document, ids, timers, runTimers, runFrames };
}

test("unset is ON; an OS asking for reduced motion always wins", () => {
  assert.equal(load().html.dataset.motion, undefined);
  assert.equal(load({ osReduce: true }).html.dataset.motion, "reduce");
  assert.equal(load({ stored: { motion: "on" }, osReduce: true }).html.dataset.motion, "reduce",
    "the setting can only ADD reduction");
});

test("a stored REDUCED reduces on a normal OS, and garbage reads as unset (ON)", () => {
  assert.equal(load({ stored: { motion: "reduce" } }).html.dataset.motion, "reduce");
  assert.equal(load({ stored: { motion: 7 } }).M.mode(), "on");
});

test("the row sits under UI SIZE and round-trips through apex26.motion", () => {
  const { M, built, pane, ids, html, written } = load();
  assert.deepEqual(built.map((b) => b.id), ["pm-motion"]);
  assert.deepEqual(JSON.parse(JSON.stringify(built[0].values)), [["on", "ON"], ["reduce", "REDUCED"]]);
  const row = ids.get("pm-motion");
  assert.equal(pane.children[1], row, "row goes right after the UI SIZE label");
  assert.equal(pane.children[2].className, "adv-help");
  row._spec.write("reduce");
  assert.equal(written.motion, "reduce");
  assert.equal(html.dataset.motion, "reduce");
  assert.equal(row._spec.read(), "reduce");
  M.set("on");
  assert.equal(html.dataset.motion, undefined);
});

test("wiring waits for DOMContentLoaded while deferred scripts still run", () => {
  const { built, document } = load({ readyState: "interactive" });
  assert.equal(built.length, 0, "SettingRow loads after this file — never wire at eval here");
  document._handlers.DOMContentLoaded();
  assert.equal(built.length, 1);
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

test("reduced motion drops the intro at once", () => {
  assert.ok(!load({ osReduce: true }).overlay.hasAttribute("data-intro"));
  const { M, overlay } = load();
  M.set("reduce");
  assert.ok(!overlay.hasAttribute("data-intro"));
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

test("the CSS keys off the attributes this module writes, and it loads behind the store", () => {
  assert.match(CSS, /:root\[data-motion="reduce"\] :is\(#overlay, \.screen\) \*/);
  assert.match(CSS, /#overlay\[data-paused\]/);
  assert.match(CSS, /@media \(forced-colors: active\)[\s\S]*#overlay \.bigbtn:focus-visible/);
  assert.doesNotMatch(CSS.replace(/\/\*[\s\S]*?\*\//g, ""), /outline:\s*none/);
  assert.match(MANIFEST, /\["js\/core\/store\.js", "js\/ui\/title-fx\.js"\]/);
});
