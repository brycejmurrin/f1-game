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
import { bootSheetShape } from "../helpers/sheetshape-boot.mjs";


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
function boot(initial = {}) {
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
  const timers = [];

  const { dom, sb } = bootSheetShape(() => ({
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    // Timers QUEUE (never run unless a test drains them) so the rotation-settle
    // test below can step the clock; the keyboard tests never drain them.
    setTimeout: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].live = false; },
    addEventListener: add(winListeners),
    visualViewport: vv,
    innerWidth: 390, innerHeight: 844, devicePixelRatio: 3,
    ...initial,
  }));

  const fire = (target, type) => {
    const map = target === "vv" ? vvListeners : winListeners;
    for (const fn of map.get(type) || []) fn({ type });
    while (frames.length) frames.shift()(0);
  };
  const kb = () => dom.document.documentElement.style.getPropertyValue("--kb");

  const runTimers = () => {
    const due = timers.splice(0).filter((t) => t.live).sort((a, b) => a.ms - b.ms);
    for (const t of due) t.fn();
  };

  return { dom, sb, vv, fire, kb, runTimers };
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

/* The same rotation, the TITLE SCREEN's half. iOS (the home-screen PWA most of
   all) fires resize/orientationchange while innerWidth/innerHeight still hold the
   portrait numbers, and may fire nothing once they settle. body[data-shape] and
   body[data-density] were answered only on those events, so a phone turned to
   landscape kept the portrait title layout — full-size doors with subtitles in a
   430px screen, scrolling (reported 2026-09-29). SheetShape re-asks after the
   rotation has had time to land; this pins that the late answer is taken. */
test("body shape follows a rotation whose size lands after its events", () => {
  const { dom, sb, fire, runTimers } = boot();
  const body = dom.document.body;

  sb.innerWidth = 430; sb.innerHeight = 932;
  fire("win", "resize");
  runTimers();
  assert.equal(body.dataset.shape, "tall", "precondition: portrait reads tall");

  // The phone turns: both events arrive while the sizes are still portrait.
  fire("win", "orientationchange");
  fire("win", "resize");
  assert.equal(body.dataset.shape, "tall", "precondition: the events saw portrait numbers");

  // The sizes settle with no event behind them.
  sb.innerWidth = 932; sb.innerHeight = 430;
  runTimers();
  assert.equal(body.dataset.shape, "wide",
    "a rotation whose sizes land after its last event must still be answered — " +
    "left latched, a landscape phone keeps the portrait title screen and scrolls");
});

/* #427's settle timers reclassified shape/density but did NOT re-ask --kb.
   watchKeyboard's window listeners clear the band when a resize fires after
   sizes land; the same iOS "no event on settle" hole left a mismatched
   mid-rotation band (844−390=454) stuck on every .screen. The settle path
   must re-derive the keyboard band too. */
test("--kb clears on a silent size settle after a mismatched rotation", () => {
  const { sb, vv, fire, kb, runTimers } = boot();

  // Portrait, keyboard up.
  sb.innerWidth = 390; sb.innerHeight = 844;
  vv.height = 500; vv.offsetTop = 0;
  fire("vv", "resize");
  assert.equal(kb(), "344px", "precondition: keyboard band is live");

  // Mid-rotation mismatch: vv already landscape, layout still portrait.
  // Also fire the window events (still on portrait sizes) so settle timers arm.
  vv.height = 390;
  fire("vv", "resize");
  fire("win", "orientationchange");
  fire("win", "resize");
  assert.equal(kb(), "454px",
    "precondition: the mismatched pair wrote a bogus band");

  // Sizes settle. No further event — the hole #427 documented for shape.
  sb.innerWidth = 844; sb.innerHeight = 390;
  // vv.height is already 390; no vv event either.
  runTimers();
  assert.equal(kb(), "",
    "settle timers must re-derive --kb: left latched at 454, every .screen " +
    "opened from the title carries more padding than the landscape viewport is tall");
});

/* Title scrollers swap roles when body[data-shape] flips. A leftover
   scrollTop from the previous shape must not survive the flip. */
test("title scrollers reset when body shape flips on settle", () => {
  const { dom, sb, fire, runTimers } = boot();
  const ov = dom.document.getElementById("overlay");
  const mb = dom.document.getElementById("menu-buttons");
  ov.scrollTop = 180;
  mb.scrollTop = 220;

  sb.innerWidth = 390; sb.innerHeight = 844;
  fire("win", "resize");
  runTimers();
  assert.equal(dom.document.body.dataset.shape, "tall");
  // Re-stain after the tall classify (idempotent shape write does not reset).
  ov.scrollTop = 180;
  mb.scrollTop = 220;

  fire("win", "orientationchange");
  // Sizes land after the events; settle flips tall → wide and must zero both.
  sb.innerWidth = 844; sb.innerHeight = 390;
  runTimers();
  assert.equal(dom.document.body.dataset.shape, "wide");
  assert.equal(ov.scrollTop, 0,
    "a leftover #overlay scrollTop from portrait must not survive the flip");
  assert.equal(mb.scrollTop, 0,
    "a leftover #menu-buttons scrollTop from portrait must not survive the flip");
});


// Home Screen launch can settle without a window resize. Model the reported
// normal-density wide launch -> compact wide viewport; rotation must be optional.
function bootHomeLaunch() {
  return boot({
    innerWidth: 852, innerHeight: 700,
    getComputedStyle: () => ({ getPropertyValue: (key) =>
      ({ "--ui-scale": "1.09", "--compact-at": "600px" }[key] || "") }),
  });
}

test("Home Screen startup rechecks a viewport that settles without resize", () => {
  const { dom, sb, vv, runTimers } = bootHomeLaunch();
  assert.equal(dom.document.body.dataset.shape, "wide");
  assert.equal(dom.document.body.dataset.density, "normal");
  sb.innerHeight = 393; vv.height = 393;
  runTimers();
  assert.equal(dom.document.body.dataset.density, "compact",
    "a landscape launch must settle into the compact title without a rotation");
});

test("pageshow re-arms settling for a restored Home Screen window", () => {
  const { dom, sb, vv, fire, runTimers } = bootHomeLaunch();
  runTimers();
  fire("win", "pageshow"); // restoration event can precede final dimensions
  sb.innerHeight = 393; vv.height = 393;
  runTimers();
  assert.equal(dom.document.body.dataset.density, "compact");
});

test("visual viewport resize updates title density as well as keyboard padding", () => {
  const { dom, sb, vv, fire, runTimers } = bootHomeLaunch();
  fire("vv", "resize"); // prime the unchanged zero-keyboard band
  runTimers();
  sb.innerHeight = 393; vv.height = 393;
  fire("vv", "resize");
  assert.equal(dom.document.body.dataset.density, "compact");
});

/* UI hunt 2026-10-29 #12: CAREER rotated 844x390 → portrait kept #cr-body's
   scrollTop while its content grew, leaving the focused control off-screen.
   The settle path brings focus back into its nearest scroller, and only then. */
test("a rotation scrolls the top layer's focused control back into its scroller", () => {
  let layer = null;
  const { dom, sb, fire, runTimers } = boot({
    UiLayers: { top: () => layer },
    getComputedStyle: (el) => ({ getPropertyValue: () => "", overflowY: el._overflowY || "visible" }),
  });
  const box = (top, height) => ({ left: 0, right: 400, width: 400, top, bottom: top + height, height });
  const make = (parent, tag, rect) => { const n = dom.makeElement(tag); n._rect = rect; parent.appendChild(n); return n; };
  layer = make(dom.document.body, "dialog", box(0, 844));
  const body = make(layer, "div", box(60, 700)); body._overflowY = "auto"; body.scrollHeight = 1374;
  const btn = make(make(body, "div", box(200, 40)), "button", box(900, 44));
  const calls = [];
  btn.scrollIntoView = (o) => calls.push(o);
  btn.focus();
  sb.innerWidth = 844; sb.innerHeight = 390;   // a rotation changes the size
  fire("win", "orientationchange");
  assert.deepEqual(calls.map((o) => o.block), ["nearest"], "an off-screen focused control is scrolled in, nearest");
  btn._rect = box(300, 44); runTimers();
  assert.equal(calls.length, 1, "a visible focused control is left where it is");
  btn._rect = box(900, 44); runTimers(); fire("win", "orientationchange");
  assert.equal(calls.length, 1, "the same size is handled once: a later scroll by the player stands");
  btn._rect = box(900, 44); layer = null; sb.innerWidth = 390; sb.innerHeight = 844; fire("win", "resize");
  assert.equal(calls.length, 1, "no menu layer (racing): nothing moves");
});
