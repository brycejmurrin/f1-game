/* phone-viewport-cache.test.mjs — the four phone tests share ONE viewport read (#6487).
 *
 * hud-elements, screen-looks, scale and title-layout each asked "touch AND a short side <= 500?" by reading
 * window.innerWidth/innerHeight on every call. After a DOM write that read forces a whole-document style
 * recalc (~4 ms in container Chromium; ~200 ms across one boot). UiScale.phone() now holds the short side
 * until a resize / orientationchange, so a boot pays one read and a rotation still flips the answer.
 *
 * Run: node --test tests/unit/phone-viewport-cache.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";
import { loadUiShape } from "../helpers/ui-shape-load.mjs";

const src = (f) => fs.readFileSync(absSrc(f), "utf8");

/** A window whose viewport getters count reads, and whose listeners the test can fire. */
function boot({ w, h, coarse }) {
  const reads = { innerWidth: 0, innerHeight: 0 };
  const vp = { innerWidth: w, innerHeight: h };
  const on = {};
  const win = {
    matchMedia: (q) => ({ matches: coarse && q === "(pointer: coarse)" }),
    addEventListener: (n, fn, o) => (on[n] ||= []).push({ fn, capture: !!(o && o.capture) }),
  };
  for (const k of Object.keys(reads)) Object.defineProperty(win, k, { get: () => (reads[k]++, vp[k]) });
  const store = { get: (_k, d) => d, set() {}, subscribe: () => () => {} };
  const ctx = vm.createContext({ console, Math, window: win, document: { body: null, readyState: "complete", getElementById: () => null, addEventListener() {} },
    GameStore: { store } });
  loadUiShape(ctx);
  for (const f of ["js/ui/scale.js", "js/ui/hud-elements.js"]) vm.runInContext(src(f), ctx, { filename: absSrc(f) });
  vm.runInContext("this.UiScale = UiScale; this.HudElements = HudElements;", ctx);
  const fire = (n) => { for (const l of on[n] || []) l.fn({ type: n }); };
  return { ctx, reads, vp, on, fire };
}

const DEVICES = [
  ["Bryce's iPhone 15 landscape", { w: 852, h: 393, coarse: true }, true],
  ["iPhone 15 portrait", { w: 393, h: 852, coarse: true }, true],
  ["16-inch MacBook Pro", { w: 1728, h: 1117, coarse: false }, false],
  ["a touch tablet", { w: 1180, h: 820, coarse: true }, false],
];

for (const [name, d, want] of DEVICES) {
  test(`${name}: the same answer as the inline test, from at most one viewport read`, () => {
    const b = boot(d);
    const before = { ...b.reads };   // hud-elements reads its state at eval
    for (let i = 0; i < 50; i++) {
      assert.equal(b.ctx.UiScale.phone(), want);
      assert.equal(b.ctx.HudElements.isOn("speed"), !want, "phone ships SPEED off");
    }
    assert.equal(b.ctx.UiScale.shortSide(), Math.min(d.w, d.h));
    assert.ok(b.reads.innerWidth <= 1 && b.reads.innerHeight <= 1, `one read per boot, got ${JSON.stringify(b.reads)} (at eval ${JSON.stringify(before)})`);
  });
}

test("a resize or orientationchange drops the held side; the next ask reads the new viewport", () => {
  const b = boot({ w: 852, h: 393, coarse: true });
  assert.equal(b.ctx.UiScale.phone(), true);
  for (const n of ["resize", "orientationchange"]) assert.ok(b.on[n]?.some((l) => l.capture), `${n}: a capture listener runs before other window handlers`);
  Object.assign(b.vp, { innerWidth: 1180, innerHeight: 820 });
  assert.equal(b.ctx.UiScale.phone(), true, "held until the event fires");
  b.fire("resize");
  assert.equal(b.ctx.UiScale.phone(), false);
  assert.equal(b.ctx.UiScale.shortSide(), 820);
  Object.assign(b.vp, { innerWidth: 393, innerHeight: 852 });
  b.fire("orientationchange");
  assert.equal(b.ctx.UiScale.phone(), true);
  assert.equal(b.reads.innerWidth, 3, "one read per viewport, not per ask");
});

test("every phone detector routes through UiShape.phone()", () => {
  for (const f of ["js/ui/hud-elements.js", "js/ui/screen-looks.js", "js/ui/title-layout.js"]) {
    assert.match(src(f), /const phone = \(\) => [^\n]*typeof UiShape !== "undefined"[^\n]*UiShape\.phone\(\)/, f);
  }
  // scale.js loads before the other three, so their eval-time calls already see UiScale.
  const order = src("tools/manifest.cjs");
  const at = (f) => order.indexOf(`"${f}"`);
  for (const f of ["js/ui/hud-elements.js", "js/ui/screen-looks.js", "js/ui/title-layout.js"]) assert.ok(at("js/ui/ui-shape.js") < at(f), f);
});
