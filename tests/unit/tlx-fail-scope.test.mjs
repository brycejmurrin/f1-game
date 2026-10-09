/* TLX failure scoping. A throw in one TLX subsystem must cost that subsystem only.
 *   M14  tlx-shadow.js endPass: a throw in the CAR or LAMP depth pass cleared
 *        `S.enabled` (the SUN flag), freezing the sun map and switching god-rays
 *        off, while the failing pass stayed armed and re-threw every frame. The
 *        real shadowSys runs here against a permissive three/TSL stand-in and a
 *        renderer whose render() throws on demand.
 *   M13  tlx.js present(): a single throw in the post chain retired it for the
 *        session (no rebuild ever) and persistFail() wrote gfxBound=webgl2 while
 *        TLX kept painting. Source pins: the chain is a re-callable factory, a
 *        post-only death owes a rebuild at the next render-target realloc, and
 *        the post-only candidate does not move the bound label.
 * No browser (~0.1 s). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

const mk = () => {
  const f = function () {};
  return new Proxy(f, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === "then" ? undefined : mk()),
    apply: () => mk(), construct: () => mk(), set: () => true,
  });
};

function boot() {
  const state = { boom: false };
  const renderer = { backend: {}, getRenderTarget: () => null, setRenderTarget() {},
    render() { if (state.boom) throw new Error("depth pass boom"); }, autoClear: true };
  const ctx = vm.createContext({ window: {}, localStorage: { getItem: () => null }, Log: { warn() {} },
    Float32Array, Math, Array, Object, WeakMap, Map, Set, Number });
  vm.runInContext(read("js/render/three/tlx-shadow.js"), ctx);
  const sys = ctx.window.TLXShaders.shadowSys(mk(), mk(), { renderer, isMobile: false, softwareGL: false });
  return { sys, S: sys.S, state };
}

test("a throw in the CAR depth pass disables the car pass, not the sun (M14)", () => {
  const { sys, S, state } = boot();
  assert.ok(S.enabled && S.carEnabled && S.lampEnabled, "desktop boots all three maps");
  state.boom = true;
  sys.carShadowBegin(new Float32Array(16), 1);
  sys.carShadowEnd();
  assert.equal(S.carEnabled, false, "the failing pass is disabled");
  assert.equal(S.enabled, true, "the sun map stays on");
  assert.equal(S.lampEnabled, true, "the lamp map stays on");
  const arms = S.carArms;
  sys.carShadowBegin(new Float32Array(16), 1);   // game.js keeps asking: now a no-op
  assert.equal(S.carArms, arms, "no re-arm, so no re-throw every cadence frame");
});

test("a throw in the LAMP depth pass disables the lamp pass only (M14)", () => {
  const { sys, S, state } = boot();
  state.boom = true;
  sys.lampShadowBegin(new Float32Array(16), 0);
  sys.lampShadowEnd();
  assert.equal(S.lampEnabled, false);
  assert.equal(S.enabled, true);
  assert.equal(S.carEnabled, true);
});

test("a throw in the SUN depth pass still disables the sun (M14)", () => {
  const { sys, S, state } = boot();
  state.boom = true;
  sys.shadowBegin(new Float32Array(16));
  sys.shadowEnd();
  assert.equal(S.enabled, false);
  assert.equal(S.carEnabled, true);
});

test("TLX post chain: re-callable factory, rebuilt at the next realloc, bound label kept (M13)", () => {
  const src = read("js/render/three/tlx.js");
  assert.match(src, /function buildPost\(\) \{/, "the post chain is built by a function that can run again");
  assert.match(src, /post = buildPost\(\);/);
  const resize = src.slice(src.indexOf("function applyResize()"), src.indexOf("function resize()"));
  assert.match(resize, /if \(_postRebuild && !post\) \{ _postRebuild = false; post = buildPost\(\); \}\s*if \(post\) post\.resize\(rw, rh\);/,
    "a render-target realloc rebuilds a retired chain before resizing it");
  const death = src.slice(src.indexOf("// Post-only death:"), src.indexOf("if (!painted)", src.indexOf("// Post-only death:")));
  assert.match(death, /_postRebuild = \+\+_postStrikes <= 3;/, "a post-only death owes a rebuild, bounded at 3");
  const persist = src.slice(src.indexOf("const persistFail"), src.indexOf("const paintCanvas"));
  assert.match(persist, /if \(!postOnly\) try \{ sessionStorage\.setItem\("apex26\.gfxBound", "webgl2"\)/,
    "a post-only candidate must not label the session WEBGL2 while TLX keeps painting");
  assert.match(src, /\} catch \(e\) \{ persistFail\(e, !!post\); \}/, "the first catch marks a post-only candidate");
});
