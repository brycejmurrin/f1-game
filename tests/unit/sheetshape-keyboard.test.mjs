/* sheetshape-keyboard.test.mjs — the software-keyboard band must not outlive
 * the keyboard.
 *
 * SheetShape.watchKeyboard writes --kb (the band of the layout viewport the
 * keyboard covers) from visualViewport deltas, and every .screen pads its
 * bottom by it. It used to re-ask ONLY on visualViewport resize/scroll. Reported
 * from a phone: type a livery name in the GARAGE in portrait (keyboard up,
 * --kb = 336px), rotate — iOS updates innerHeight and the visual viewport in
 * separate steps and can drop the final resize — and the last delivery left
 * --kb at the landscape keyboard's 163px after the keyboard was gone. The
 * garage sheet stayed a 222px strip at the top of a 393px screen: compact,
 * stacked, fit-capped to 0.925, until a reload. Reproduced headlessly on
 * 2026-09-10 by faking visualViewport.height across a 393x852 -> 852x393
 * resize (scratch repro; the unpatched module kept --kb: 163px after blur).
 *
 * The invariants, behavioural in a VM on tests/helpers/mini-dom.mjs:
 *   1. a keyboard needs a focused editable element — no focus, no band;
 *   2. the field losing focus clears the band without waiting for the viewport;
 *   3. a window resize/rotation re-derives the band, with a settle pass.
 *
 * Run: node --test tests/unit/sheetshape-keyboard.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Boot sheet-shape.js with a fake visualViewport and captured listeners. */
function boot() {
  const dom = makeDom();
  const winListeners = new Map();
  const vvListeners = new Map();
  const timers = [];
  const rafQ = [];
  const flush = () => { while (rafQ.length) rafQ.shift()(0); };
  const on = (map) => (t, fn) => { if (!map.has(t)) map.set(t, []); map.get(t).push(fn); };
  const fire = (map, t) => { for (const fn of map.get(t) || []) fn({ type: t }); };

  const vv = { height: 800, offsetTop: 0, scale: 1, addEventListener: on(vvListeners) };
  class Noop { constructor() {} observe() {} unobserve() {} disconnect() {} }
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, WeakSet,
    RegExp, Date, parseFloat, parseInt, isFinite, Infinity, NaN,
    ResizeObserver: Noop, MutationObserver: Noop,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    // A REAL rAF is asynchronous: the coalescing flag in watchKeyboard is reset
    // inside the callback, so a synchronous stub would leave it set forever.
    requestAnimationFrame: (fn) => { rafQ.push(fn); return rafQ.length; },
    cancelAnimationFrame: () => {},
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
    addEventListener: on(winListeners), removeEventListener: () => {},
    visualViewport: vv,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    innerWidth: 400, innerHeight: 800, devicePixelRatio: 1,
    document: dom.document,
  };
  sb.window = sb;
  sb.self = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/sheet-shape.js"), "utf8"),
    sb, { filename: "sheet-shape.js" });

  const field = dom.document.createElement("input");
  field.setAttribute("type", "text");
  dom.document.body.appendChild(field);
  const kb = () => dom.documentElement.style.getPropertyValue("--kb");
  return {
    sb, vv, field, kb, timers,
    vvResize: () => { fire(vvListeners, "resize"); flush(); },
    winResize: () => { fire(winListeners, "resize"); flush(); },
    focusout: () => { dom.document.dispatchEvent({ type: "focusout" }); flush(); },
    flush,
    winListeners,
  };
}

test("a focused field plus a shrunken visual viewport writes the band (the path that already worked)", () => {
  const t = boot();
  t.field.focus();
  t.vv.height = 800 - 336;
  t.vvResize();
  assert.equal(t.kb(), "336px", "the keyboard band is the visual-viewport deficit");
});

test("no focused editable element means no keyboard, whatever the viewport last said", () => {
  const t = boot();
  // Nothing focused: a rotation-time delta must not be mistaken for a keyboard.
  t.vv.height = 800 - 336;
  t.vvResize();
  assert.equal(t.kb(), "", "a band with nothing to type into is a stale viewport, not a keyboard");
});

test("blurring the field clears the band even when the viewport never reports the keyboard leaving", () => {
  const t = boot();
  t.field.focus();
  t.vv.height = 800 - 336;
  t.vvResize();
  assert.equal(t.kb(), "336px");

  // The phone: rotated, keyboard dismissed by the OS, field blurred — and the
  // visual viewport still describes the landscape keyboard. Only focusout arrives.
  t.sb.innerWidth = 800; t.sb.innerHeight = 400;
  t.vv.height = 400 - 163;
  t.field.blur();
  t.focusout();
  assert.equal(t.kb(), "",
    "--kb must not outlive the keyboard: the garage sheet stayed a 222px strip on a 393px screen");
});

test("a window resize re-derives the band and schedules a settle pass", () => {
  const t = boot();
  assert.ok(t.winListeners.has("resize") && t.winListeners.has("orientationchange"),
    "watchKeyboard must listen to window resize and orientationchange, not only visualViewport");
  t.field.focus();
  t.vv.height = 800 - 336;
  t.vvResize();
  assert.equal(t.kb(), "336px");

  // Keyboard still up across the rotation: the band follows the new numbers
  // from the window event alone (the phone dropped the visualViewport one).
  t.sb.innerWidth = 800; t.sb.innerHeight = 400;
  t.vv.height = 400 - 163;
  const before = t.timers.length;
  t.winResize();
  assert.equal(t.kb(), "163px", "the window resize re-ran the keyboard arithmetic");
  const settle = t.timers.slice(before).find((x) => x.ms >= 200 && x.ms <= 1000);
  assert.ok(settle, "a settle pass is scheduled after the rotation animation");

  // The settle pass sees the keyboard gone (viewport consistent again) and clears it.
  t.vv.height = 400;
  settle.fn();
  t.flush();
  assert.equal(t.kb(), "", "the settle pass clears a band the animation-frame numbers overstated");
});
