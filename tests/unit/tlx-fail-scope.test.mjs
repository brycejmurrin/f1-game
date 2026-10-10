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

// 08-F4: _mirFails was a lifetime counter (four throws anywhere in a session retired the rear-view for good).
test("mirrorEnd: only four CONSECUTIVE failed mirror renders retire the mirror (08-F4)", () => {
  const src = read("js/render/three/tlx.js");
  const a = src.indexOf("mirrorEnd() {");
  const body = src.slice(a, src.indexOf("mirrorRect(r, flip)", a));
  assert.ok(a > 0 && body.length > 200, "the mirrorEnd needles moved — check this test, not the code");
  const st = { boom: false };
  const ctx = vm.createContext({
    _mirActive: false, _poolBatch: 0, drawList: [], _showInstanced() {}, chunkedSys: null, acquireMesh() {}, meshPool: [],
    _hideUndrawnInstanced() {}, scene: { backgroundNode: null }, pinSkyMaterial() {}, mirRT: {}, mirCam: {}, _gpuLastOperation: "",
    _mirRenders: 0, _mirFails: 0, _mirDead: false, _mirErr: null, softOutRT: () => null, resetRecs() {},
    _dMatUsed: 0, _fxMatUsed: 0, _instAlive: new Set(),
    renderer: { setRenderTarget() {}, render() { if (st.boom) throw new Error("stale geometry"); } },
  });
  const obj = vm.runInContext("({" + body.replace(/,\s*$/, "") + "})", ctx);
  const frame = (boom) => { st.boom = boom; ctx._mirActive = true; obj.mirrorEnd(); };
  for (let i = 0; i < 3; i++) { frame(true); frame(false); }   // three isolated throws, each followed by a good render
  frame(true);                                                  // the fourth throw overall, but not consecutive
  assert.equal(ctx._mirDead, false, "four unrelated throws no longer kill the mirror");
  assert.equal(ctx._mirRenders, 3);
  for (let i = 0; i < 3; i++) frame(true);                      // now four in a row
  assert.equal(ctx._mirDead, true, "four consecutive failures still retire it");
});

// 08-F1: refuseTab() on AUTO wrote tlxAutoGL, which only means "stay on three WebGL2"; a boot that was already
// three WebGL2 reloaded into the identical configuration, uncounted, for ever. The real function body runs here.
function refuse(o = {}) {
  const store = Object.assign({}, o.ss || {});
  const out = { reloads: 0, errors: [], store, local: Object.assign({ "apex26.gfxBackendProbe": "1" }, o.ls || {}) };
  const ss = o.ssThrows
    ? { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } }
    : { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const ctx = vm.createContext({
    _glPin: o.pin ?? null, forceWebGL: !!o.forceWebGL, _autoStayGL: !!o.autoStayGL, _sessLostN: 0,
    sessionStorage: ss,
    localStorage: { removeItem: (k) => { delete out.local[k]; } },
    location: { reload() { out.reloads++; } },
    window: { __apexReportError: (w, e) => out.errors.push([w, e.message]) },
  });
  const src = read("js/render/three/tlx.js");
  const body = src.slice(src.indexOf("const refuseTab = () => {"), src.indexOf("let painted = false;", src.indexOf("const refuseTab = () => {")));
  assert.ok(body.startsWith("const refuseTab"), "the refuseTab needles moved — check this test, not the code");
  out.call = vm.runInContext(body + "\n refuseTab", ctx);
  return out;
}

test("refuseTab: AUTO on WebGPU takes three WebGL2, counted against the shared reload budget (08-F1)", () => {
  const r = refuse();
  r.call();
  assert.equal(r.store["apex26.tlxAutoGL"], "1");
  assert.equal(r.store["apex26.gfxClaimFail"], undefined);
  assert.equal(r.store["apex26.ctxLostReloads"], "1", "the reload spends a ctxLostReloads credit");
  assert.equal(r.reloads, 1);
  assert.equal(r.local["apex26.gfxBackendProbe"], undefined, "the canary probe is cleared as before");
});

test("refuseTab: a boot already on three WebGL2 binds GLX instead of reloading into itself (08-F1)", () => {
  for (const o of [{ forceWebGL: true }, { autoStayGL: true }, { pin: "1" }, { pin: "0" }]) {
    const r = refuse(o);
    r.call();
    assert.equal(r.store["apex26.gfxClaimFail"], "1", JSON.stringify(o));
    assert.equal(r.store["apex26.tlxAutoGL"], undefined, JSON.stringify(o));
    assert.equal(r.reloads, 1, JSON.stringify(o));
  }
});

test("refuseTab: bounded at two reloads per tab; past the cap the latch is kept but nothing reloads (08-F1)", () => {
  const r = refuse({ forceWebGL: true });
  for (let i = 0; i < 6; i++) r.call();
  assert.equal(r.reloads, 2, "a tab that fails every boot cannot loop");
  assert.equal(r.errors.length, 4, "every refused reload says so on the error card");
  assert.equal(r.store["apex26.gfxClaimFail"], "1", "the player's own reload still lands on GLX");
  const spent = refuse({ ss: { "apex26.ctxLostReloads": "2" } });
  spent.call();
  assert.equal(spent.reloads, 0);
  assert.equal(spent.store["apex26.tlxAutoGL"], "1");
  // sessionStorage blocked: the in-memory budget still bounds it.
  const blocked = refuse({ ssThrows: true, forceWebGL: true });
  for (let i = 0; i < 5; i++) blocked.call();
  assert.equal(blocked.reloads, 2);
});
