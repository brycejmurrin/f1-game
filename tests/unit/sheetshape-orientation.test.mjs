/* sheetshape-orientation.test.mjs — the layout viewport's own signals re-ask body
 * shape and density (UI contract 2026-11-06 rule 1; #5167 part G).
 *
 * The title's tier (body[data-shape] / [data-density]) is answered from the ICB
 * (documentElement.clientWidth/Height, falling back to innerWidth/Height) on
 * resize, orientationchange, pageshow, visualViewport resize and three bounded
 * settle timers. Every one of those is keyed to the WINDOW'S size pair, which
 * iOS can leave on the portrait numbers at a Home Screen landscape launch and
 * settle later with no event (#5152: Bryce's "broken" Home Screen title is the
 * portrait layout painted into an 852×393 box). A media query is evaluated
 * against the ICB itself, so `matchMedia("(orientation: portrait)")` changing is
 * the one signal that says "CSS now lays out the other way" whether or not a
 * window event comes with it; screen.orientation's change is the OS's rotation
 * notice; visibilitychange is the app coming back from the switcher turned the
 * other way. All three must land on the same re-ask path as resize.
 *
 * BEHAVIOURAL: the module runs in a VM on tests/helpers/mini-dom.mjs with a
 * scriptable matchMedia / screen.orientation / document visibility; the
 * assertion is body's attribute after a sequence with NO window event in it.
 *
 * Run: node --test tests/unit/sheetshape-orientation.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootSheetShape } from "../helpers/sheetshape-boot.mjs";

function boot() {
  const winListeners = new Map();
  const mqlListeners = new Map();   // query string -> listeners
  const soListeners = [];
  const add = (map, key) => (type, fn) => {
    const k = key === undefined ? type : key;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(fn);
  };
  const timers = [];
  const frames = [];
  const screen = { orientation: { type: "portrait-primary", angle: 0, addEventListener: (type, fn) => { if (type === "change") soListeners.push(fn); } } };
  const { dom, sb } = bootSheetShape(() => ({
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    setTimeout: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].live = false; },
    addEventListener: add(winListeners),
    matchMedia: (q) => ({
      get matches() { return q.includes("portrait") ? sb.innerHeight > sb.innerWidth : false; },
      addEventListener: (type, fn) => { if (type === "change") add(mqlListeners, q)(type, fn); },
      removeEventListener() {}, addListener() {}, removeListener() {},
    }),
    screen,
    visualViewport: null,
    innerWidth: 393, innerHeight: 852, devicePixelRatio: 3,
  }));
  const drain = () => { while (frames.length) frames.shift()(0); };
  const fireWin = (type) => { for (const fn of winListeners.get(type) || []) fn({ type }); drain(); };
  const fireMql = () => { for (const [q, fns] of mqlListeners) for (const fn of fns) fn({ matches: sb.matchMedia(q).matches, media: q }); drain(); };
  const fireOrientation = () => { for (const fn of soListeners) fn({ type: "change" }); drain(); };
  const fireVisibility = (state) => { dom.document.visibilityState = state; dom.document.dispatchEvent({ type: "visibilitychange" }); drain(); };
  const pending = () => timers.filter((t) => t.live).length;
  const runTimers = () => { const due = timers.splice(0).filter((t) => t.live).sort((a, b) => a.ms - b.ms); for (const t of due) t.fn(); };
  return { dom, sb, fireWin, fireMql, fireOrientation, fireVisibility, runTimers, pending };
}

const shape = (dom) => dom.document.body.dataset.shape;

test("a portrait launch reads tall, and a window resize still flips it", () => {
  const { dom, sb, fireWin, runTimers } = boot();
  runTimers();
  assert.equal(shape(dom), "tall", "precondition: 393×852 is tall");
  sb.innerWidth = 852; sb.innerHeight = 393;
  fireWin("resize");
  assert.equal(shape(dom), "wide", "the existing window path is untouched");
});

test("the orientation media query flipping re-asks body shape with no window event", () => {
  const { dom, sb, fireMql, runTimers, pending } = boot();
  runTimers();
  assert.equal(shape(dom), "tall", "precondition: portrait launch");
  // The layout viewport turns landscape. No resize, no orientationchange: the
  // iOS hole #5152 documented. The media query, evaluated against the ICB,
  // changes — and that is the only signal.
  sb.innerWidth = 852; sb.innerHeight = 393;
  fireMql();
  assert.equal(shape(dom), "wide",
    "a media-query change must re-ask body shape: left tall, a landscape Home Screen launch " +
    "paints the portrait title (centred brand, full-width stacked doors, scrolling) into an 852×393 box");
  assert.ok(pending() >= 3, "and it re-arms the bounded settle timers like every other viewport event");
});

test("screen.orientation change re-asks the same way", () => {
  const { dom, sb, fireOrientation, runTimers } = boot();
  runTimers();
  sb.innerWidth = 852; sb.innerHeight = 393;
  fireOrientation();
  assert.equal(shape(dom), "wide", "the OS rotation notice is a viewport event");
});

test("coming back visible re-asks; going hidden does not", () => {
  const { dom, sb, fireVisibility, runTimers } = boot();
  runTimers();
  assert.equal(shape(dom), "tall");
  // Suspended portrait, resumed landscape: the turn happened while asleep.
  sb.innerWidth = 852; sb.innerHeight = 393;
  fireVisibility("hidden");
  assert.equal(shape(dom), "tall", "hiding is not a layout event (and the box behind the switcher is stale anyway)");
  fireVisibility("visible");
  assert.equal(shape(dom), "wide", "a Home Screen app resumed the other way round must re-fit on return");
});

test("the media-query path is idempotent beside the window path", () => {
  const { dom, sb, fireWin, fireMql, runTimers } = boot();
  runTimers();
  sb.innerWidth = 852; sb.innerHeight = 393;
  fireWin("orientationchange"); fireWin("resize"); fireMql();
  assert.equal(shape(dom), "wide");
  sb.innerWidth = 393; sb.innerHeight = 852;
  fireMql(); fireWin("resize");
  assert.equal(shape(dom), "tall", "four deliveries of one rotation land on one answer each way");
});
