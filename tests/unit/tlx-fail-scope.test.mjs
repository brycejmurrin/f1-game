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
import { fnSource } from "../helpers/fn-source.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

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
  vm.runInContext(read("js/render/three/tlx-shadow.js"), ctx, { filename: absSrc("js/render/three/tlx-shadow.js") });
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

function bootWgpu(isMobile) {
  const renderer = { backend: { isWebGPUBackend: true }, getRenderTarget: () => null, setRenderTarget() {},
    render() {}, autoClear: true };
  const ctx = vm.createContext({ window: {}, localStorage: { getItem: () => null }, Log: { warn() {} },
    Float32Array, Math, Array, Object, WeakMap, Map, Set, Number });
  vm.runInContext(read("js/render/three/tlx-shadow.js"), ctx, { filename: absSrc("js/render/three/tlx-shadow.js") });
  const sys = ctx.window.TLXShaders.shadowSys(mk(), mk(), { renderer, isMobile, softwareGL: false });
  return { sys, S: sys.S };
}

test("a WebGPU phone does not build the PCSS blocker (fixed-R phone rule, §2q)", () => {
  // §2q: the shadow pass is 40.4 MB of TLX's phone excess and jetsam
  // headroom is the phone constraint. colorPcss always excluded phones;
  // the WebGPU leg of the blocker gate did not, so the one phone class
  // that runs WebGPU (Safari 26) allocated the 512² R32F blocker target
  // and PCSS sampling GLX withholds from every phone.
  const { S } = bootWgpu(true);
  assert.equal(S.enabled, true, "the sun map itself still builds on a phone");
  assert.equal(S.pcssEnabled, false, "no blocker pass and no PCSS sampling — the fixed-R look GLX gives every phone");
  assert.equal(S.carEnabled, false, "the car map stays unbuilt on phones");
  assert.equal(S.lampEnabled, false, "the lamp map stays unbuilt on phones");
});

test("a WebGPU desktop still builds the PCSS blocker", () => {
  const { S } = bootWgpu(false);
  assert.equal(S.pcssEnabled, true, "desktop WebGPU keeps PCSS — the gate is phones only");
  assert.equal(S.carEnabled, true);
  assert.equal(S.lampEnabled, true);
});

test("TLX post chain: re-callable factory, rebuilt at the next realloc, bound label kept (M13)", () => {
  const src = read("js/render/three/tlx.js");
  assert.match(src, /function buildPost\(\) \{/, "the post chain is built by a function that can run again");
  assert.match(src, /post = buildPost\(\);/);
  const resize = src.slice(src.indexOf("function applyResize()"), src.indexOf("function resize()"));
  assert.match(resize, /if \(_postRebuild && !post\) \{\s*_postRebuild = false; post = buildPost\(\);\s*if \(!post\) postFailure\("Post-processing reconstruction failed"\);\s*\}\s*if \(post\) post\.resize\(rw, rh, presentW, presentH\);/,
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
    _dMatUsed: 0, _fxMatUsed: 0, _instAlive: new Set(), _kidsBegin() {}, _kidsMir: [], _poolShow() {},   // R6 pool root (hunt 3)
    _mirMrt: () => false, _mirMrtArm() {},   // A·W14: a one-attachment mirror target draws with no MRT
    post: null, _mirInv: () => null, _mirDiscards: 0,   // A-P2: the WebGL2 depth + tag discard after the mirror render
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
  const out = { reloads: 0, errors: [], latched: [], store, local: Object.assign({ "apex26.gfxBackendProbe": "1" }, o.ls || {}) };
  const ss = o.ssThrows
    ? { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } }
    : { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const ring = [];
  const recordGfxBudgetExhausted = (where, err) => {
    const msg = (err && (err.message || err)) || "unknown";
    ring.push({ t: Date.now(), kind: "caught", msg: "Caught @ " + where + ": " + String(msg).slice(0, 400),
                detail: String((err && err.stack) || "").slice(0, 800) });
    out.errors.push([where, msg]);
  };
  const ctx = vm.createContext({
    _glPin: o.pin ?? null, forceWebGL: !!o.forceWebGL, _autoStayGL: !!o.autoStayGL,
    _latchWebKitGL: (why) => out.latched.push(why),
    sessionStorage: ss,
    localStorage: { removeItem: (k) => { delete out.local[k]; } },
    location: { reload() { out.reloads++; } },
    recordGfxBudgetExhausted,
    window: { __apexErrors: ring, __apexReportError: (w, e) => out.errors.push([w, e.message]) },
  });
  const src = read("js/render/three/tlx.js");
  // Hoisted beside persistFail by perf hunt 3 R13 (one closure per renderer, not one per present()): read
  // the arrow function by its own closing column instead of up to present()'s `let painted`.
  const body = fnSource(src, "const refuseTab = () => {") + ";";
  assert.ok(body.startsWith("const refuseTab") && body.length < 2000, "the refuseTab needles moved — check this test, not the code");
  vm.runInContext(read("js/perf/gfx-escalation.js"), ctx, { filename: absSrc("js/perf/gfx-escalation.js") });
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
  assert.deepEqual(r.latched, ["first render refused"], "AUTO's refusal also latches the WebKit device kill switch");
});

test("refuseTab: a boot already on three WebGL2 binds GLX instead of reloading into itself (08-F1)", () => {
  for (const o of [{ forceWebGL: true }, { autoStayGL: true }, { pin: "1" }, { pin: "0" }]) {
    const r = refuse(o);
    r.call();
    assert.equal(r.store["apex26.gfxClaimFail"], "1", JSON.stringify(o));
    assert.deepEqual(r.latched, [], "a GLX hand-off is not a WebGPU verdict: " + JSON.stringify(o));
    assert.equal(r.store["apex26.tlxAutoGL"], undefined, JSON.stringify(o));
    assert.equal(r.reloads, 1, JSON.stringify(o));
  }
});

test("refuseTab: bounded at two reloads per tab; past the cap the latch is kept but nothing reloads (08-F1)", () => {
  const r = refuse({ forceWebGL: true });
  for (let i = 0; i < 6; i++) r.call();
  assert.equal(r.reloads, 2, "a tab that fails every boot cannot loop");
  assert.equal(r.errors.length, 4, "every refused reload is recorded on the error ring");
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

test("ctxLost window.name fallback parses legacy and preserved-prefix markers (c91f)", () => {
  for (const [name, expected] of [["apex26.ctxLostReloads=2", 2], ["player\napex26.ctxLostReloads=2", 2], ["apex26xctxLostReloads=2", 0]]) {
    const ctx = vm.createContext({ window: { name }, sessionStorage: { getItem() { throw Error("blocked"); } } });
    vm.runInContext(read("js/perf/gfx-escalation.js"), ctx, { filename: absSrc("js/perf/gfx-escalation.js") });
    assert.equal(vm.runInContext("GfxEscalation.reloadCount()", ctx), expected);
  }
});

// 2026-10-23: AUTO on WebKit tries WebGPU; the per-DEVICE kill switch (localStorage apex26.tlxWebKitGL) sends that
// device back to three WebGL2 after a detected failure. The REAL declarations run here, sliced from isWebKit's
// declaration to the end of _latchWebKitGL.
function webkitSwitch({ ua, pin = null, ls = {} }) {
  const local = Object.assign({}, ls);
  const src = read("js/render/three/tlx.js");
  const from = src.indexOf("      const isWebKit = ");
  const end = src.indexOf("      };\n", src.indexOf("const _latchWebKitGL = ")) + 9;
  assert.ok(from > 0 && end > from && end - from < 2500, "the WebKit kill-switch needles moved — check this test, not the code");
  const ctx = vm.createContext({ ua, _glPin: pin,
    localStorage: { getItem: (k) => (k in local ? local[k] : null), setItem: (k, v) => { local[k] = String(v); } } });
  vm.runInContext(src.slice(from, end) + "\n globalThis.r = { isWebKit, _webkitStayGL, _latchWebKitGL };", ctx, { filename: absSrc("js/render/three/tlx.js") });
  return { local, ...ctx.r };
}
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1";
const CHROME = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

test("WebKit kill switch: unset → AUTO may try WebGPU; a latched failure keeps the device on WebGL2", () => {
  const fresh = webkitSwitch({ ua: IPHONE });
  assert.equal(fresh.isWebKit, true);
  assert.equal(fresh._webkitStayGL, false, "a fresh iPhone tries WebGPU on AUTO");
  fresh._latchWebKitGL("WebGPU init failed: x".padEnd(400, "!"));
  assert.equal(fresh.local["apex26.tlxWebKitGL"].length, 200, "the stamped reason is stored, capped");
  assert.equal(webkitSwitch({ ua: IPHONE, ls: fresh.local })._webkitStayGL, true, "the next boot on this device stays on WebGL2");
});

test("WebKit kill switch expires: 7 days, a Safari update, or an unstamped legacy latch re-probe WebGPU (iPhone WebGL2-leg report)", () => {
  const fresh = webkitSwitch({ ua: IPHONE });
  fresh._latchWebKitGL("device lost x3");
  const stamp = fresh.local["apex26.tlxWebKitGL"];
  const at = +stamp.split("|")[0];
  assert.ok(Math.abs(at - Date.now()) < 60000, "the latch is stamped with when it happened");
  assert.equal(webkitSwitch({ ua: IPHONE, ls: { "apex26.tlxWebKitGL": stamp } })._webkitStayGL, true, "a fresh latch still holds");
  const aged = String(at - 8 * 864e5) + stamp.slice(String(at).length);
  assert.equal(webkitSwitch({ ua: IPHONE, ls: { "apex26.tlxWebKitGL": aged } })._webkitStayGL, false, "after 7 days AUTO tries WebGPU again");
  const updated = IPHONE.replace("OS 27_0", "OS 27_1").replace("Version/27.0", "Version/27.1");
  assert.equal(webkitSwitch({ ua: updated, ls: { "apex26.tlxWebKitGL": stamp } })._webkitStayGL, false, "a Safari update re-probes WebGPU");
  assert.equal(webkitSwitch({ ua: IPHONE, ls: { "apex26.tlxWebKitGL": "WebGPU init failed" } })._webkitStayGL, false,
    "an unstamped latch from before the expiry re-probes once (it re-latches, stamped, if WebGPU still fails)");
});

test("WebKit kill switch: never on Chromium, never written under a pin", () => {
  const chrome = webkitSwitch({ ua: CHROME, ls: { "apex26.tlxWebKitGL": "stale" } });
  assert.equal(chrome._webkitStayGL, false, "a desktop Chrome ignores the marker");
  chrome._latchWebKitGL("x");
  assert.equal(chrome.local["apex26.tlxWebKitGL"], "stale", "and never writes it");
  for (const pin of ["0", "1"]) {
    const p = webkitSwitch({ ua: IPHONE, pin });
    p._latchWebKitGL("x");
    assert.equal(p.local["apex26.tlxWebKitGL"], undefined, `pin ${pin} is a user override, not a verdict`);
  }
});

// A-P2 (phoneperf 2026-10-24): after a depth pass on WebGL2 the map's R8 colour — written because WebGL
// cannot render colourless, read only by the PCSS blocker off the SUN map — is invalidated while the FBO
// three just rendered into is still bound. Never the sun map while colorPcss reads it; never a guess at
// which FBO; nothing at all without a WebGL backend (WebGPU never writes it: depthMat.colorWrite).
function bootGL({ isMobile, bound = true, gl: glOn = true } = {}) {
  const fb = {}, inv = [];
  const gl = glOn ? { DRAW_FRAMEBUFFER: 36009, COLOR_ATTACHMENT0: 36064, invalidateFramebuffer: (t, l) => inv.push([t, Array.from(l)]) } : null;   // Array.from: a host-realm copy (deepEqual checks prototypes)
  const renderer = { backend: { gl, state: { currentBoundFramebuffers: { 36009: bound ? fb : null } }, get: () => ({ framebuffers: { 0: fb } }) },
    getRenderTarget: () => null, setRenderTarget() {}, render() {}, autoClear: true };
  const ctx = vm.createContext({ window: {}, localStorage: { getItem: () => null }, Log: { warn() {} },
    Float32Array, Math, Array, Object, WeakMap, Map, Set, Number });
  vm.runInContext(read("js/render/three/tlx-shadow.js"), ctx, { filename: absSrc("js/render/three/tlx-shadow.js") });
  const sys = ctx.window.TLXShaders.shadowSys(mk(), mk(), { renderer, isMobile, softwareGL: false });
  return { sys, S: sys.S, inv };
}

test("A-P2: a phone's sun pass drops its unread R8 colour store on WebGL2 (the one FBO three rendered into)", () => {
  const { sys, S, inv } = bootGL({ isMobile: true });
  sys.shadowBegin(new Float32Array(16)); sys.shadowEnd();
  assert.deepEqual(inv, [[36009, [36064]]], "COLOR_ATTACHMENT0 on DRAW_FRAMEBUFFER, once");
  assert.equal(S.colorDiscards, 1);
  sys.shadowBegin(new Float32Array(16)); sys.shadowEnd();
  assert.equal(S.colorDiscards, 2, "every pass, not only the first");
});

test("A-P2: the desktop sun map keeps its colour for the PCSS blocker; the car map still drops it", () => {
  const { sys, S, inv } = bootGL({ isMobile: false });
  sys.shadowBegin(new Float32Array(16)); sys.shadowEnd();
  assert.equal(inv.length, 0, "colorPcss reads the sun map's colour");
  sys.carShadowBegin(new Float32Array(16), 1); sys.carShadowEnd();
  assert.deepEqual(inv, [[36009, [36064]]]);
  assert.equal(S.colorDiscards, 1);
});

test("A-P2: no discard with another FBO bound, and none without a WebGL backend", () => {
  const a = bootGL({ isMobile: true, bound: false });
  a.sys.shadowBegin(new Float32Array(16)); a.sys.shadowEnd();
  assert.equal(a.inv.length, 0); assert.equal(a.S.colorDiscards, 0);
  const b = bootGL({ isMobile: true, gl: false });
  b.sys.shadowBegin(new Float32Array(16)); b.sys.shadowEnd();
  assert.equal(b.S.colorDiscards, 0, "WebGPU: nothing to drop, nothing thrown");
});

test("A-P2W: on WebGPU every shadow map hints its unread R8 colour discard (vendored patch 17); tlxTagDiscard=0 keeps it", () => {
  for (const [ls, want] of [[null, 1], ["0", undefined]]) {
    const renderer = { backend: { isWebGPUBackend: true }, getRenderTarget: () => null, setRenderTarget() {}, render() {}, autoClear: true };
    const ctx = vm.createContext({ window: {}, localStorage: { getItem: (k) => (k === "apex26.tlxTagDiscard" ? ls : null) }, Log: { warn() {} },
      Float32Array, Math, Array, Object, WeakMap, Map, Set, Number });
    vm.runInContext(read("js/render/three/tlx-shadow.js"), ctx, { filename: absSrc("js/render/three/tlx-shadow.js") });
    // mk() swallows writes, so RenderTarget alone is a recording object (unknown members still mk()).
    const made = [], base = mk();
    function RT() { const o = { texture: {} }; made.push(o); return new Proxy(o, { get: (t, k) => (k in t ? t[k] : k === "then" ? undefined : mk()) }); }
    const T = new Proxy(base, { get: (t, k) => (k === "RenderTarget" ? RT : base[k]) });
    ctx.window.TLXShaders.shadowSys(T, mk(), { renderer, isMobile: true, softwareGL: false });
    const sun = made.find((rt) => rt.texture && rt.texture.name === "TLXSunShadow.color");
    assert.ok(sun, "the sun map was built");
    assert.equal(sun.apexDiscardColor, want, ls === "0" ? "switch off: stored" : "bit 0 = the R8 colour");
    assert.equal(sun.apexDiscardDepth, undefined, "the depth IS the shadow map: never discarded");
  }
});
