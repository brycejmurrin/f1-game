/* sheetshape-keyboard.test.mjs — --kb must not survive the rotation that ended it.
 *
 * SheetShape.watchKeyboard() writes `--kb`, the software-keyboard occlusion band,
 * onto documentElement; css/components.css spends it as `.screen`'s
 * padding-bottom. Its inputs are `window.innerHeight` (LAYOUT viewport) and
 * `visualViewport.height` / `.offsetTop` (VISUAL viewport) — two numbers that a
 * phone updates INDEPENDENTLY during a rotation.
 *
 * It listened to visualViewport's own `resize`/`scroll` only. That is every
 * event a keyboard opening or closing produces, and it is NOT every event that
 * changes the answer: `innerHeight` is half the subtraction and rotating the
 * phone is the one thing that changes it without necessarily moving
 * `visualViewport.height` again afterwards. So a delivery that lands while the
 * two are momentarily out of step computes a band from mismatched halves and
 * then LATCHES — `last` suppresses nothing further, because no further vv event
 * is coming.
 *
 * The stuck value is not small. A phone rotated out of portrait-with-keyboard
 * latched ~454px of bottom padding onto every .screen and then held it in a
 * 390px-tall landscape viewport: the sheet is crushed against the top or pushed
 * out of view entirely, and nothing the player does brings it back short of a
 * reload. tests/specs/ui-resize.spec.js pins the CONSUMPTION path (--kb reaches
 * .screen) and says in its own comment that the visualViewport math "stays
 * unverified"; this file is that half.
 *
 * BEHAVIOURAL, not source-text: the module runs in a VM on
 * tests/helpers/mini-dom.mjs with a scriptable visualViewport, and the assertion
 * is the property's value after a rotation sequence. A regex over the file would
 * pass on a listener that is wired but computes the wrong thing.
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

/**
 * Boot sheet-shape.js against a phone-shaped DOM whose two viewports can be
 * driven apart on purpose.
 *
 * `fire(target, type)` delivers an event the way the browser would: `win` for
 * window-level resize/orientationchange, `vv` for the visual viewport's own.
 *
 * requestAnimationFrame QUEUES rather than running inline, and fire() drains the
 * queue afterwards. That ordering is load-bearing, not tidiness: watchKeyboard
 * coalesces with `if (!raf) raf = requestAnimationFrame(apply)` and `apply`
 * clears `raf` when it runs. A stub that runs the callback inline lets the
 * assignment land AFTER the clear, so `raf` stays truthy and every later
 * delivery is silently swallowed — a harness artefact that looks exactly like
 * the bug under test and would have "proved" it on healthy code.
 */
function boot() {
  const dom = makeDom();

  const winListeners = new Map();
  const vvListeners = new Map();
  const add = (map) => (type, fn) => {
    if (!map.has(type)) map.set(type, []);
    map.get(type).push(fn);
  };

  const vv = {
    height: 844, offsetTop: 0, scale: 1,
    addEventListener: add(vvListeners),
    removeEventListener: () => {},
  };

  const frames = [];
  class RO { observe() {} unobserve() {} disconnect() {} }
  class MO { observe() {} disconnect() {} }

  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, WeakSet,
    RegExp, Date, parseFloat, parseInt, isFinite, Infinity, NaN,
    ResizeObserver: RO,
    MutationObserver: MO,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    cancelAnimationFrame: () => {},
    setTimeout: () => 1, clearTimeout: () => {},
    addEventListener: add(winListeners), removeEventListener: () => {},
    visualViewport: vv,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    innerWidth: 390, innerHeight: 844, devicePixelRatio: 3,
    document: dom.document,
  };
  sb.window = sb;
  sb.self = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/sheet-shape.js"), "utf8"),
    sb, { filename: "sheetshape.js" });

  const fire = (target, type) => {
    const map = target === "vv" ? vvListeners : winListeners;
    for (const fn of map.get(type) || []) fn({ type });
    while (frames.length) frames.shift()(0);
  };
  const kb = () => dom.document.documentElement.style.getPropertyValue("--kb");

  return { dom, sb, vv, fire, kb };
}

test("--kb clears when the rotation that stranded it finishes", () => {
  const { sb, vv, fire, kb } = boot();

  // 1. Portrait, keyboard up: 844 layout - 500 visual = a 344px band. This is
  //    watchKeyboard working exactly as designed.
  sb.innerHeight = 844; vv.height = 500; vv.offsetTop = 0;
  fire("vv", "resize");
  assert.equal(kb(), "344px", "a real keyboard must still be reported");

  // 2. The phone turns. The VISUAL viewport reports the landscape height first
  //    while the LAYOUT viewport is still the portrait one — the browser
  //    updates them independently, and this delivery sees one of each.
  //    844 - 390 = 454, comfortably over the 15% URL-bar guard, so it is
  //    believed and written.
  vv.height = 390;
  fire("vv", "resize");
  assert.equal(kb(), "454px",
    "precondition: the mismatched pair really does write a bogus band");

  // 3. Rotation settles. innerHeight catches up and the keyboard is gone with
  //    the rotation, so BOTH halves now say 390 — but visualViewport.height did
  //    not move at this step, so visualViewport fires nothing. The window does:
  //    a rotation always produces these two.
  sb.innerHeight = 390;
  fire("win", "resize");
  fire("win", "orientationchange");

  // There is no keyboard on screen. Anything left here is padding-bottom on
  // every .screen, in a viewport 390px tall.
  assert.equal(kb(), "",
    "--kb must be recomputed when the layout viewport changes: left latched, " +
    "it pads every .screen by more than the landscape viewport is tall");
});

test("a window resize alone re-derives the band from the current pair", () => {
  const { sb, vv, fire, kb } = boot();

  // No visualViewport event at all in this test — only the layout viewport
  // moves. That is the case the vv-only wiring could not see, stated without
  // the rotation story around it.
  sb.innerHeight = 900; vv.height = 500; vv.offsetTop = 0;
  fire("win", "resize");
  assert.equal(kb(), "400px", "a layout-viewport change alone must be measured");

  sb.innerHeight = 500;
  fire("win", "resize");
  assert.equal(kb(), "", "and must be un-measured the same way");
});

test("the pinch and URL-bar guards still hold on the window path", () => {
  const { sb, vv, fire, kb } = boot();

  // Pinch zoom shrinks vv.height too; padding the screen for it would be wrong.
  sb.innerHeight = 844; vv.height = 500; vv.offsetTop = 0; vv.scale = 2;
  fire("win", "resize");
  assert.equal(kb(), "", "pinch zoom is not a keyboard");

  // A URL bar collapsing is a small delta; svh already owns those.
  vv.scale = 1; vv.height = 800;
  fire("win", "resize");
  assert.equal(kb(), "", "browser chrome is not a keyboard");
});
