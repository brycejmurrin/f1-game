/* Renderer software-present/back-end degradation lifecycle regressions.
 * Node-only: resource ownership is exercised with fake three objects while
 * the no-build renderer schedulers are guarded at their integration seams.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fnSource } from "../helpers/fn-source.mjs";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function postHarness(factoryThrows = false) {
  const made = { targets: [], data: [], depth: [], materials: [] };
  class Disposable {
    constructor(bucket) { this.disposeCount = 0; if (bucket) bucket.push(this); }
    dispose() { this.disposeCount++; }
  }
  class Texture extends Disposable {
    constructor() { super(); this.isTexture = true; }
  }
  class DataTexture extends Texture {
    constructor() { super(); made.data.push(this); }
  }
  class DepthTexture extends Texture {
    constructor() { super(); made.depth.push(this); }
  }
  class RenderTarget extends Disposable {
    constructor(w, h, opts = {}) {
      super(made.targets);
      this.width = w; this.height = h;
      this.textures = Array.from({ length: opts.count || 1 }, () => new Texture());
      this.texture = this.textures[0];
      this.depthTexture = opts.depthTexture || null;
    }
    setSize(w, h) { this.width = w; this.height = h; }
    dispose() {
      super.dispose();
      for (const texture of this.textures) texture.dispose();
      if (this.depthTexture) this.depthTexture.dispose();
    }
  }
  class QuadMesh { constructor() { this.material = null; } }
  const THREE = {
    DataTexture, DepthTexture, RenderTarget, QuadMesh, Texture,
    NoColorSpace: "none", HalfFloatType: "f16", UnsignedByteType: "u8",
    RGBAFormat: "rgba", LinearFilter: "linear",
  };
  const renderer = { backend: {}, autoClear: true, setRenderTarget() {} };
  const TLXShaders = {
    post(_THREE, _TSL, ctx) {
      for (let i = 0; i < 2; i++) {
        const material = new Disposable(made.materials);
        ctx.trackMaterial(material);
      }
      if (factoryThrows) throw new Error("post graph failed");
      return {};
    },
  };
  const sandbox = {
    window: { TLXShaders }, TLXShaders,
    document: { createElement: () => ({ getContext: () => null }) },
    Log: { info() {} },
  };
  // PostCommon (js/render/shared/post-common.js) owns the lens-dirt generator
  // and god-ray select tlx-post calls at init / present.
  vm.runInNewContext(read("js/render/shared/post-common.js"), sandbox,
    { filename: "post-common.js" });
  vm.runInNewContext(read("js/render/three/tlx-post.js"), sandbox,
    { filename: "tlx-post.js" });
  return {
    made,
    create: () => sandbox.window.TLXShaders.postChain(THREE, {}, {
      renderer, chunks: {}, shadow: null,
    }),
  };
}

test("TLX post chain disposes every owned base resource exactly once", () => {
  const h = postHarness();
  const chain = h.create();
  assert.equal(h.made.targets.length, 2, "scene and LDR targets are base-owned");
  assert.equal(h.made.data.length, 2, "white and black fallback textures are base-owned");
  assert.equal(h.made.materials.length, 2, "post graph registered its materials");

  chain.dispose();
  chain.dispose();
  for (const target of h.made.targets) assert.equal(target.disposeCount, 1);
  for (const texture of h.made.data) assert.equal(texture.disposeCount, 1);
  for (const texture of h.made.depth) assert.equal(texture.disposeCount, 1);
  for (const material of h.made.materials) assert.equal(material.disposeCount, 1);
});

test("TLX post construction failure unwinds targets, textures, and tracked materials", () => {
  const h = postHarness(true);
  assert.throws(() => h.create(), /post graph failed/);
  assert.equal(h.made.targets.length, 2);
  assert.equal(h.made.data.length, 2);
  assert.equal(h.made.depth.length, 1);
  assert.equal(h.made.materials.length, 2);
  for (const target of h.made.targets) assert.equal(target.disposeCount, 1);
  for (const texture of h.made.data) assert.equal(texture.disposeCount, 1);
  for (const texture of h.made.depth) assert.equal(texture.disposeCount, 1);
  for (const material of h.made.materials) assert.equal(material.disposeCount, 1);
});

test("TLX soft blit pools the unstride buffer and writes ImageData in one pass", () => {
  // Audit #3 / PERF soft-present: a full-frame Uint8ClampedArray + second RGBA
  // copy every present was a young-gen / long-task source on HeadlessChrome.
  const src = read("js/render/three/tlx.js");
  assert.match(src, /let _unstridePool = null/);
  assert.match(src, /function _ensureUnstridePool\(need\)/);
  assert.match(src, /function _unstrideIntoSoft\(src, w, h, dest\)/);
  const unstride = src.slice(src.indexOf("function _unstrideRgba"), src.indexOf("function _unstrideIntoSoft"));
  assert.doesNotMatch(unstride, /new Uint8ClampedArray\(w \* h \* 4\)/,
    "per-present full-frame alloc must be gone from _unstrideRgba");
  assert.match(unstride, /_ensureUnstridePool\(need\)/);
  const start = src.slice(src.indexOf("function _startSoftBlitRead"), src.indexOf("function _queueSoftBlit"));
  assert.match(start, /readRenderTargetPixelsAsync\(req\.rt/);
  assert.match(start, /_unstrideIntoSoft\(src, w, h, _softImg\.data\)/);
  assert.doesNotMatch(start, /_readLdr\(req/,
    "soft blit must not take the pooled capture path (extra copy)");
  assert.match(src, /data: new Uint8ClampedArray\(pack\.data\)/,
    "capturePixels must clone off the pool so a held shot stays stable");
});

test("TLX soft present serializes reads, coalesces newest, and rejects stale sizes", () => {
  const src = read("js/render/three/tlx.js");
  assert.match(src, /let _softReadPending = false, _softReadQueued = null, _softReadEpoch = 0/);
  // One in-flight read still gates the next, and the newest frame still wins
  // the single waiter slot — but a read that has not settled in
  // SOFT_READ_STALE_MS is abandoned (epoch bumped so its late completion is
  // void, gate cleared) instead of wedging presentation on the first frame it
  // ever read (2026-09-03: byte-identical captures across a camera move).
  assert.match(src, /const SOFT_READ_STALE_MS = 20000/, "a 2 s floor abandoned every llvmpipe read (they take tens of seconds) — keep the floor generous, the guard adaptive");
  assert.match(src, /Math\.max\(SOFT_READ_STALE_MS, 3 \* _softReadLastMs\)/);
  assert.match(src, /if \(_softReadPending\) \{[^]*?now - _softReadSince > _softReadStaleMs\(\)[^]*?_softReadEpoch\+\+;[^]*?_softReadPending = false;[^]*?\} else \{\s*_softReadQueued = req;[^]*?return;\s*\}\s*\}/);
  assert.match(src, /if \(req\.epoch === _softReadEpoch\) _finishSoftBlitRead\(\)/,
    "an abandoned read's completion must not clear the gate a newer read holds");
  assert.match(src, /const next = _softReadQueued;\s*_softReadQueued = null;\s*if \(next\) _startSoftBlitRead\(next\)/);
  assert.match(src, /req\.epoch !== _softReadEpoch[^]*?_displayCanvas\.width !== w[^]*?_displayCanvas\.height !== h/);
  // Size work lives in applyResize(); public resize() only coalesces / warm-gates.
  const resize = src.slice(src.indexOf("function applyResize()"), src.indexOf("function resize()"));
  assert.match(resize, /_softReadEpoch\+\+/);
  assert.match(resize, /_softReadQueued = null/);
});

test("TLX displayed source generation rejects old async completion and follows newest queued frame", async () => {
  const src = read("js/render/three/tlx.js");
  const scheduler = src.slice(src.indexOf("function _softBlitNotify()"), src.indexOf("// present()'s failure ladder"));
  const pending = [];
  const sandbox = {
    Date,
    renderer: { readRenderTargetPixelsAsync: (rt) => new Promise((resolve) => pending.push({ rt, resolve })) },
    _displayCanvas: { width: 4, height: 1 },
    _displayCtx: { createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} },
    _unstrideIntoSoft: () => 64,
  };
  vm.runInNewContext(`
    let _softBlit = true, _softReadPending = false, _softReadQueued = null, _softReadEpoch = 0;
    let _softSubmittedGen = 0, _softShownGen = 0, _softBlitGen = 0, _softImg = null;
    let W = 4, H = 1;
    const _softPresentWaiters = [];
    ${scheduler}
    globalThis.queue = _queueSoftBlit;
    globalThis.cancel = _cancelSoftBlits;
    globalThis.state = () => ({ submitted: _softSubmittedGen, shown: _softShownGen });
  `, sandbox);
  const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  sandbox.queue({ name: "old-inflight", width: 4, height: 1 });
  sandbox.queue({ name: "old-queued", width: 4, height: 1 });
  const required = sandbox.state().submitted + 1;
  sandbox.queue({ name: "requested-camera", width: 4, height: 1 });
  pending[0].resolve(new Uint8Array(16)); await flush();
  assert.equal(sandbox.state().shown, 1);
  assert.ok(sandbox.state().shown < required, "a completion submitted before the camera request cannot satisfy freshness");
  assert.equal(pending[1].rt.name, "requested-camera", "the latest frame replaces the stale queued frame");
  pending[1].resolve(new Uint8Array(16)); await flush();
  assert.equal(sandbox.state().shown, required);
  sandbox.queue({ name: "voided", width: 4, height: 1 });
  sandbox.cancel();
  sandbox.queue({ name: "new-epoch", width: 4, height: 1 });
  pending[2].resolve(new Uint8Array(16)); await flush();
  assert.equal(sandbox.state().shown, required, "an invalidated epoch cannot advance the displayed source token");
  pending[3].resolve(new Uint8Array(16)); await flush();
  assert.equal(sandbox.state().shown, 5);
});

test("TLX voiding an in-flight soft read releases its gate", () => {
  // The voided completion skips _finishSoftBlitRead (epoch mismatch), so a gate
  // left held wedges presentation until the stale guard: 60 s+ under load, which
  // timed out image-grade-visual "blacks" twice on the llvmpipe render shard.
  const src = read("js/render/three/tlx.js");
  const cancel = src.slice(src.indexOf("function _cancelSoftBlits()"), src.indexOf("// the backend object"));
  assert.match(cancel, /_softReadEpoch\+\+;\s*_softReadQueued = null;\s*_softReadPending = false;/);
  const resize = src.slice(src.indexOf("function applyResize()"), src.indexOf("function resize()"));
  assert.match(resize, /_softReadEpoch\+\+;\s*_softReadQueued = null;\s*_softReadPending = false;/);
});

test("TLX post fallback invalidates reads and disposes the retained chain", () => {
  const src = read("js/render/three/tlx.js");
  const at = src.indexOf("// Post-only death:");
  const fallback = src.slice(at, src.indexOf("if (!painted)", at));
  assert.match(fallback, /const deadPost = post/);
  assert.match(fallback, /post = null;\s*_cancelSoftBlits\(\)/);
  assert.match(fallback, /finally \{[^]*?deadPost\.dispose\(\)/);
  const post = read("js/render/three/tlx-post.js");
  assert.match(post, /function makeRT[^]*?ownRT\(new THREE\.RenderTarget/,
    "lazy targets must enter the same owned set as base targets");
  assert.match(post, /present,\s*dispose,\s*viz/);
  assert.match(read("js/render/three/tsl-post.js"), /ctx\.trackMaterial\(m\)/);
});

test("TLX, WGX, and GLX remove timed-out software-present waiters", () => {
  for (const file of ["js/render/three/tlx.js", "js/render/webgpu/wgx.js", "js/render/glx/glx.js"]) {
    const src = read(file);
    const at = src.indexOf("awaitSoftPresent(timeoutMs)");
    assert.ok(at >= 0, file + " exposes awaitSoftPresent");
    const body = src.slice(at, at + 1600);
    assert.match(body, /let waiter = null/);
    assert.match(body, /_softPresentWaiters\.indexOf\(waiter\)/);
    assert.match(body, /_softPresentWaiters\.splice\(i, 1\)/);
    assert.match(body, /_softPresentWaiters\.push\(waiter\)/);
  }
});

test("GLX/TLX re-queue waiters whose predicate has not fired", () => {
  for (const file of ["js/render/glx/glx.js", "js/render/three/tlx.js", "js/render/webgpu/wgx.js"]) {
    const src = read(file);
    assert.match(src, /const keep = \[\]/, file + " must keep waiters whose callback returns false");
    assert.match(src, /keep\.push\(ws\[i\]\)/);
  }
  const tlx = read("js/render/three/tlx.js");
  assert.match(tlx, /invalidateSoftPresent\(\) \{ _cancelSoftBlits\(\); \}/);
  const glx = read("js/render/glx/glx.js");
  const glxAwait = glx.slice(glx.indexOf("function awaitSoftPresent"), glx.indexOf("function init(canvasEl)"));
  assert.match(glxAwait, /no display ctx/);
  assert.match(glxAwait, /return true;/);
  assert.match(glxAwait, /return false;/);
  const tlxAwait = tlx.slice(tlx.indexOf("awaitSoftPresent(timeoutMs)"), tlx.indexOf("invalidateSoftPresent()"));
  assert.match(tlxAwait, /no display ctx/);
});

test("GLX soft-present reads back only for an explicit capture waiter", () => {
  const src = read("js/render/glx/glx.js");
  const blit = src.slice(src.indexOf("function softBlit()"), src.indexOf("function softPresentState()"));
  assert.match(blit, /if\s*\(\s*!_softPresentWaiters\.length\s*&&\s*!_softCaptureDue\s*\)\s*return/,
    "ordinary WebDriver presents must not synchronously read back the framebuffer");
  assert.match(blit, /_softCaptureDue = false/,
    "a successful capture blit must disarm the one-shot snapCam flag");
  assert.doesNotMatch(src, /SOFT_BLIT_EVERY|_softBlitPace/,
    "periodic background readbacks must be removed");
  const present = src.slice(src.indexOf("present: (opts) =>"), src.indexOf("softPresent: () =>"));
  assert.match(present, /if\s*\(\s*_softPresentWaiters\.length\s*\|\|\s*_softCaptureDue\s*\)\s*softBlit\(\)/);
});

test("GLX links SGSR only after spatial upscaling is requested", () => {
  const post = read("js/render/glx/post.js");
  assert.match(post, /function ensureSpatial\(\)/);
  const setup = post.slice(post.indexOf("function setup()"), post.indexOf("function createTargets"));
  assert.doesNotMatch(setup, /sgsrProg\s*=\s*link\(/,
    "the disabled-by-default path must not compile SGSR during post setup");
  const ensure = post.slice(post.indexOf("function ensureSpatial()"), post.indexOf("function setup()"));
  assert.match(ensure, /sgsrProg\s*=\s*link\(POST_VS,\s*SGSR_FS\)/);
  assert.match(post, /ensureSpatial,\s*spatialOk/);
  const glx = read("js/render/glx/glx.js");
  const setter = glx.slice(glx.indexOf("function setSpatialUpscale"), glx.indexOf("function resize"));
  assert.match(setter, /if\s*\(\s*on\s*&&\s*PST\s*&&\s*PST\.ensureSpatial\s*\)\s*PST\.ensureSpatial\(\)/);
});

test("WGX soft present permits one staging read and drops pre-resize pixels", () => {
  const src = read("js/render/webgpu/wgx.js");
  assert.match(src, /let _softBlitSeq = 0/);
  assert.match(src, /let _softDisplayPending = false, _softDisplayEpoch = 0/);
  assert.match(src, /if \(_softHold \|\| _softDisplayPending\) return null/);
  assert.match(src, /_softDisplayPending = true;\s*_softDisplaySince = _softNow\(\);\s*return \{ buf, bpr, w, h, seq: _softBlitSeq, epoch: _softDisplayEpoch, sceneGen: _softSceneGen \}/);
  assert.match(src, /epoch === _softDisplayEpoch && seq === _softBlitSeq &&[^]*?_displayCanvas\.width === w[^]*?_displayCanvas\.height === h/);
  assert.match(src, /const release = function \(\) \{ _softDisplayPending = false; \}/);
  const resize = src.slice(src.indexOf("function resize()"), src.indexOf("function setRenderScale"));
  assert.match(resize, /if \(sizeChanged\) \{\s*_cssApplying = true;/);
  assert.match(resize, /_softDisplayEpoch\+\+/);
  assert.match(src, /CanvasCssSize\.create\(_layoutCanvas,[^]*?ignore:\s*\(\) => _cssApplying/,
    "WGX suppresses its own backing-store resize signal through the shared cache");
  // Size split: present jitter uses pw/ph vs presentW/H; render jitter uses rw/rh vs width/height.
  assert.match(resize, /Math\.abs\(r?w - width\) <= 1 && Math\.abs\(r?h - height\) <= 1/);
});

test("WGX soft present back-pressures frames and the car pass while a read waits (#2226)", () => {
  // Measured 2026-10-15 on SwiftShader (montreal): ~500 frames queued ahead of
  // the first map, so the next blit never landed inside gfx-probe's 60 s.
  const src = read("js/render/webgpu/wgx.js");
  const grab = (re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };
  const held = grab(/function _softFrameHeld\(\) \{[^]*?\n    \}/, "_softFrameHeld");
  const gate = grab(/if \(_softGpu && _softDisplayPending\) \{\s*if \(_softFrameHeld\(\)\) return false;[^}]*\}/, "begin() hold");
  const car = grab(/const carShadowBegin = \(\.\.\.a\) => \{[^]*?\n    \};/, "carShadowBegin gate");
  assert.ok(src.indexOf(gate) < src.indexOf("encoder = device.createCommandEncoder();\n        _passSamples"),
    "begin() refuses before it records any frame work");
  const make = new Function("SHD", `
    let _softGpu = true, _softDisplayPending = false, _softDisplaySince = 0, now = 0;
    const SOFT_HOLD_MAX_MS = ${grab(/const SOFT_HOLD_MAX_MS = \d+/, "bound").split("= ")[1]};
    const _softNow = () => now;
    ${held}
    ${car}
    function begin() { ${gate} return true; }
    return { begin, carShadowBegin,
      set: (o) => { if ("pending" in o) { _softDisplayPending = o.pending; _softDisplaySince = now; } if ("gpu" in o) _softGpu = o.gpu; },
      at: (t) => { now = t; } };`);
  const calls = { begin: 0, keep: 0 };
  const W = make({ carShadowBegin() { calls.begin++; }, carShadowKeep() { calls.keep++; return true; } });
  assert.equal(W.begin(), true, "no read in flight: frames render");
  W.set({ pending: true });
  let drawn = 0;
  for (let t = 0; t <= 60000; t += 16) { W.at(t); if (W.begin()) drawn++; W.carShadowBegin([], 1); }
  assert.ok(drawn >= 2 && drawn <= 4, "a stuck read lets one frame through per bound, never a flood (" + drawn + ")");
  assert.equal(calls.begin, 0, "no car-shadow submission while a read waits");
  assert.ok(calls.keep > 3000, "the held car map stays armed (KEEP)");
  W.set({ pending: false }); W.carShadowBegin([], 1);
  assert.equal(W.begin(), true); assert.equal(calls.begin, 1, "both resume once the read lands");
  W.set({ gpu: false, pending: true }); W.carShadowBegin([], 1);
  assert.equal(W.begin(), true, "hardware presentation is never held");
  assert.equal(calls.begin, 2);
});

test("all renderers share zero/reveal, orientation, and UI-scale CSS-size semantics", () => {
  const listeners = new Map();
  let observed = null, disconnected = false, observerCallback = null;
  class RO {
    constructor(fn) { observerCallback = fn; }
    observe(el) { observed = el; }
    disconnect() { disconnected = true; }
  }
  const window = {
    innerWidth: 800, innerHeight: 450,
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
  };
  const ctx = vm.createContext({ window, ResizeObserver: RO, Number, Math });
  vm.runInContext(read("js/render/shared/canvas-css-size.js"), ctx);
  const CanvasCssSize = vm.runInContext("CanvasCssSize", ctx);
  let w = 0, h = 0, reads = 0;
  const canvas = {};
  Object.defineProperties(canvas, {
    clientWidth: { get() { reads++; return w; } },
    clientHeight: { get() { reads++; return h; } },
  });
  const cache = CanvasCssSize.create(canvas, { settleFrames: 2 });
  assert.equal(observed, canvas);
  assert.deepEqual({ ...cache.read() }, { width: 0, height: 0 });
  assert.deepEqual({ ...cache.read() }, { width: 0, height: 0 });
  assert.equal(reads, 4, "zero is retried while the canvas is hidden");

  w = 640; h = 360;
  assert.deepEqual({ ...cache.read() }, { width: 640, height: 360 }, "reveal self-corrects without a signal");
  const afterReveal = reads;
  cache.read();
  assert.equal(reads, afterReveal, "steady frames use the cache");

  // UI SIZE affects overlays, not the game canvas. Without a box signal it
  // must not force a layout read; if CSS does resize the canvas, RO is the seam.
  window.uiScale = 1.3;
  cache.read();
  assert.equal(reads, afterReveal, "an unrelated UI-scale write does not invalidate the canvas");
  w = 600; observerCallback(); cache.read();
  assert.equal(cache.read().width, 600, "an observer-reported scale/layout change is consumed");

  // Rotation can notify before layout. The viewport change opens a bounded
  // settle window so the next frame sees the eventually-reflowed canvas.
  window.innerWidth = 390; window.innerHeight = 844;
  listeners.get("orientationchange")();
  cache.read();
  w = 390; h = 844;
  assert.deepEqual({ ...cache.read() }, { width: 390, height: 844 });
  const afterSettle = reads;
  cache.read(); cache.read();
  assert.equal(reads, afterSettle, "the orientation settle window is bounded");

  cache.dispose();
  assert.equal(disconnected, true);
  assert.equal(listeners.size, 0);

  for (const [file, frames] of [
    ["js/render/glx/glx.js", 8],
    ["js/render/webgpu/wgx.js", 30],
    ["js/render/three/tlx.js", 30],
  ]) {
    assert.match(read(file), new RegExp(`CanvasCssSize\\.create\\([^]*?settleFrames:\\s*${frames}`),
      `${file} delegates observation but keeps its measured settle budget`);
  }
});

test("TLX picks its backend on what three will BIND, not on navigator.gpu existing", () => {
  // The see-through car on three.js. bootRenderer only supplies its own
  // `alpha: false` WebGL2 context when `forceWebGL` is set — and the file's own
  // comment explains why that matters: three's WebGLBackend.init() hardcodes
  // `alpha: !0` and IGNORES the `alpha:false` parameter, honouring only a
  // caller-supplied context. So if three binds WebGL while forceWebGL is false,
  // the canvas is alpha-composited and anything writing alpha < 1 shows the page
  // through the car.
  //
  // three does NOT throw on that path — it logs "WebGPU is not available,
  // running under WebGL2 backend" and carries on — so the catch around
  // bootRenderer never fires. The decision has to be right BEFORE three touches
  // the canvas, because context attributes are fixed for the life of a canvas
  // and a second getContext silently returns the first.
  //
  // Two facts are needed and `navigator.gpu` existing is neither: an adapter
  // must resolve, AND a webgpu context must be obtainable (measured in this
  // repo's container: the adapter resolves and the context provider still
  // fails). Comments are stripped first — this suite has been fooled by a guard
  // matching its own explanatory prose more than once.
  const src = read("js/render/three/tlx.js")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  const decl = /let forceWebGL =([\s\S]{0,200}?);/.exec(src);
  assert.ok(decl, "the forceWebGL declaration moved — this guard is pinned to it");
  const expr = decl[1];
  assert.match(expr, /_gpuCanvasOk/,
    "forceWebGL must consult whether a WebGPU CONTEXT is obtainable, not just navigator.gpu");
  assert.doesNotMatch(expr, /!\s*_hasGpu\b/,
    "`!_hasGpu` is a presence check: navigator.gpu can exist while three still " +
    "falls back to WebGL, which is exactly the alpha-canvas defect");

  // The probe must never touch #game: one context type per canvas for life, and
  // asking again returns the first one with ITS attributes.
  const probe = /_gpuCanvasOk = ([\s\S]{0,160}?);/.exec(src);
  assert.ok(probe, "the WebGPU context probe is gone");
  assert.match(src, /createElement\("canvas"\)[\s\S]{0,200}?getContext\("webgpu"\)/,
    "the webgpu context probe must run on a THROWAWAY canvas, never on #game");

  // And the defect must stay diagnosable from a bug report.
  assert.match(src, /canvasAlpha:/,
    "backendState must report the LIVE canvas alpha so a report can name this defect");
});

// ── the drawing buffer is clamped to the driver's ceiling on EVERY backend ──
// WGX clamped presentW/H to maxTextureDimension2D; GLX never queried a limit,
// so a 6K panel at DPR 2 (or a window across two 4K monitors) asked the driver
// for a ~12000 px backing store and every post target with it. The clamp has
// to land BEFORE rw/rh: post.js createTargets() allocates from getSize() (the
// render size), not from canvas.width, so a clamp on the canvas alone would
// leave the scene, bloom and SSAO targets oversized.
test("GLX and TLX clamp the present size to the driver limit before deriving the render size", () => {
  const glx = read("js/render/glx/glx.js");
  assert.match(glx, /gl\.getParameter\(gl\.MAX_TEXTURE_SIZE\)/, "GLX queries MAX_TEXTURE_SIZE");
  assert.match(glx, /gl\.getParameter\(gl\.MAX_RENDERBUFFER_SIZE\)/, "GLX queries MAX_RENDERBUFFER_SIZE");
  const resize = glx.slice(glx.indexOf("  function resize() {"), glx.indexOf("  function setRenderScale("));
  assert.ok(resize.length > 0, "found GLX resize()");
  const clampAt = resize.search(/if \(maxDim > 0 && \(presentW > maxDim \|\| presentH > maxDim\)\)/);
  const rwAt = resize.search(/(?:const|let) rw = Math\.max\(1, Math\.round\(presentW \* renderScale\)\);/);
  assert.ok(clampAt > 0 && rwAt > 0 && clampAt < rwAt, "the uniform clamp precedes the rw/rh derivation");
  assert.match(resize, /const k = Math\.min\(maxDim \/ presentW, maxDim \/ presentH\);/, "one factor for both axes keeps aspect");

  const tlx = read("js/render/three/tlx.js");
  const tresize = tlx.slice(tlx.indexOf("      function applyResize() {"), tlx.indexOf("      function applyResize() {") + 4000);
  assert.match(tresize, /_gl\.getParameter\(_gl\.MAX_TEXTURE_SIZE\)/, "TLX's WebGL2 leg asks its driver, as GLX does");
  assert.match(tresize, /maxTextureDimension2D/, "TLX's WebGPU leg keeps the device limit");

  const wgx = read("js/render/webgpu/wgx.js");
  assert.doesNotMatch(wgx, /GLX and TLX do not clamp at all/, "the WGX comment must not describe a gap that is closed");
});

function captureHarness(opts = {}) {
  const state = new Map(), jobs = [], buffers = [], fences = [];
  let clock = 0, copied = 0, submitted = 0;
  const gl = Object.fromEntries(['PIXEL_PACK_BUFFER', 'PIXEL_PACK_BUFFER_BINDING', 'PACK_ALIGNMENT',
    'PACK_ROW_LENGTH', 'PACK_SKIP_PIXELS', 'PACK_SKIP_ROWS', 'STREAM_READ', 'BUFFER_SIZE', 'RGBA',
    'UNSIGNED_BYTE', 'SYNC_GPU_COMMANDS_COMPLETE', 'ALREADY_SIGNALED', 'CONDITION_SATISFIED',
    'TIMEOUT_EXPIRED', 'WAIT_FAILED'].map((k, i) => [k, i + 1]));
  const binding = { external: true }, laterBinding = { renderer: true };
  state.set(gl.PIXEL_PACK_BUFFER_BINDING, binding);
  const names = [gl.PACK_ALIGNMENT, gl.PACK_ROW_LENGTH, gl.PACK_SKIP_PIXELS, gl.PACK_SKIP_ROWS];
  names.forEach((n, i) => state.set(n, [8, 7, 2, 1][i]));
  const frame = Uint8Array.from({ length: 24 }, (_, i) => i + 1);
  Object.assign(gl, {
    getParameter: (n) => state.get(n),
    createBuffer() { if (opts.refuseBuffer) return null; const b = { deleted: 0 }; buffers.push(b); return b; },
    bindBuffer(_t, b) { state.set(gl.PIXEL_PACK_BUFFER_BINDING, b); },
    bufferData(_t, size) { state.get(gl.PIXEL_PACK_BUFFER_BINDING).size = size; },
    getBufferParameter: () => opts.refuseAllocation ? 0 : state.get(gl.PIXEL_PACK_BUFFER_BINDING).size,
    pixelStorei: (n, v) => state.set(n, v),
    readPixels(_x, _y, w, h, _format, _type, offset) {
      assert.equal(offset, 0, 'GPU-buffer offset, never a synchronous client-memory read');
      assert.deepEqual(names.map((n) => state.get(n)), [4, 0, 0, 0]);
      if (opts.submitThrows) throw new Error('submit failed');
      state.get(gl.PIXEL_PACK_BUFFER_BINDING).data = frame.slice(0, w * h * 4); submitted++;
    },
    fenceSync() { if (opts.refuseFence) return null; const f = { deleted: 0 }; fences.push(f); return f; },
    flush() {}, isContextLost: () => !!opts.lost,
    clientWaitSync(_s, flags, timeout) {
      assert.equal(flags, 0); assert.equal(timeout, 0, 'no blocking fence wait');
      return opts.waitFailed ? gl.WAIT_FAILED : opts.ready ? gl.CONDITION_SATISFIED : gl.TIMEOUT_EXPIRED;
    },
    getBufferSubData(_t, _offset, dst) {
      assert.ok(opts.ready, 'no client copy before GPU completion');
      if (opts.copyThrows) throw new Error('copy failed');
      dst.set(state.get(gl.PIXEL_PACK_BUFFER_BINDING).data); copied++;
    },
    deleteBuffer(b) { b.deleted++; }, deleteSync(s) { s.deleted++; },
  });
  const src = read('js/render/three/tlx.js');
  const sb = { _captureReads: new WeakSet(), performance: { now: () => clock },
    setTimeout: (fn) => { jobs.push(fn); }, Uint8ClampedArray, ownGL: gl, renderer: { backend: {} }, W: 2, H: 3 };
  vm.runInNewContext(`${fnSource(src, 'async function readGlCapture(gl, w, h) {')}
    const gfx = { ${fnSource(src, 'capturePixels() {')} }; globalThis.capture = () => gfx.capturePixels();`, sb);
  return { opts, gl, sb, frame, state, names, binding, laterBinding, buffers, fences, jobs,
    capture: sb.capture, copied: () => copied, submitted: () => submitted,
    advance: (ms) => { clock += ms; },
    tick: async () => { assert.ok(jobs.length, 'poll scheduled'); jobs.shift()(); await Promise.resolve(); await Promise.resolve(); },
  };
}

test('TLX WebGL capture snapshots now, waits without blocking, restores GL state and returns independent top-down pixels', async () => {
  const h = captureHarness();
  const p = h.capture();
  assert.equal(h.submitted(), 1, 'snapshot issued before the canvas can be cleared by compositing');
  assert.equal(h.copied(), 0);
  assert.equal(h.state.get(h.gl.PIXEL_PACK_BUFFER_BINDING), h.binding);
  assert.deepEqual(h.names.map((n) => h.state.get(n)), [8, 7, 2, 1]);
  await assert.rejects(h.capture(), /already in progress/);
  assert.equal(h.buffers.length, 1, 'concurrent captures cannot multiply pending buffers');
  await h.tick();
  assert.equal(h.copied(), 0, 'a pending fence yields again');
  h.frame.fill(0); h.sb.W = 1; h.sb.H = 1;
  h.gl.bindBuffer(h.gl.PIXEL_PACK_BUFFER, h.laterBinding);
  h.opts.ready = true; await h.tick();
  const shot = await p;
  assert.equal(shot.width, 2); assert.equal(shot.height, 3, 'resize does not change an in-flight snapshot');
  assert.deepEqual([...shot.data], [...Array.from({ length: 8 }, (_, i) => i + 17),
    ...Array.from({ length: 8 }, (_, i) => i + 9), ...Array.from({ length: 8 }, (_, i) => i + 1)]);
  assert.equal(h.state.get(h.gl.PIXEL_PACK_BUFFER_BINDING), h.laterBinding, 'preserve intervening renderer state');
  assert.equal(h.buffers[0].deleted, 1); assert.equal(h.fences[0].deleted, 1); assert.equal(h.jobs.length, 0);
  const held = [...shot.data], again = h.capture(); await h.tick(); await again;
  assert.deepEqual([...shot.data], held, 'later shots do not overwrite a held image');
});

test('TLX WebGL capture accepts a slow valid GPU fence beyond twenty seconds', async () => {
  const h = captureHarness(), result = h.capture().then((shot) => ({ shot }), (error) => ({ error }));
  h.advance(20001); await h.tick();
  assert.equal(h.copied(), 0);
  assert.equal(h.buffers[0].deleted, 0, 'slow work stays pending rather than forcing a canvas fallback');
  h.opts.ready = true; await h.tick();
  const { shot, error } = await result;
  assert.equal(error, undefined); assert.equal(shot.width, 2); assert.equal(shot.height, 3);
  assert.equal(h.buffers[0].deleted, 1); assert.equal(h.fences[0].deleted, 1); assert.equal(h.jobs.length, 0);
});

for (const fault of ['refuseBuffer', 'refuseAllocation', 'submitThrows', 'refuseFence', 'waitFailed', 'lost', 'copyThrows', 'timeout']) {
  test(`TLX WebGL capture releases owned resources on ${fault}`, async () => {
    const opts = { ready: fault === 'copyThrows' }, h = captureHarness(opts);
    if (fault !== 'timeout') opts[fault] = true;
    const p = h.capture(), rejected = assert.rejects(p, /capture|submit|copy/);
    if (h.jobs.length) { if (fault === 'timeout') h.advance(120001); await h.tick(); }
    await rejected;
    assert.equal(h.state.get(h.gl.PIXEL_PACK_BUFFER_BINDING), h.binding);
    assert.deepEqual(h.names.map((n) => h.state.get(n)), [8, 7, 2, 1]);
    for (const b of h.buffers) assert.equal(b.deleted, 1);
    for (const f of h.fences) assert.equal(f.deleted, 1);
    assert.equal(h.jobs.length, 0, 'failed captures leave no polling timer');
    for (const k of Object.keys(opts)) delete opts[k]; opts.ready = true;
    const retry = h.capture(); await h.tick(); await retry;
  });
}
