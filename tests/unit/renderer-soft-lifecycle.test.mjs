/* Renderer software-present/back-end degradation lifecycle regressions.
 * Node-only: resource ownership is exercised with fake three objects while
 * the no-build renderer schedulers are guarded at their integration seams.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
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

test("TLX soft present serializes reads, coalesces newest, and rejects stale sizes", () => {
  const src = read("js/render/three/tlx.js");
  assert.match(src, /let _softReadPending = false, _softReadQueued = null, _softReadEpoch = 0/);
  assert.match(src, /if \(_softReadPending\) \{\s*_softReadQueued = req;[^]*?return;\s*\}/);
  assert.match(src, /const next = _softReadQueued;\s*_softReadQueued = null;\s*if \(next\) _startSoftBlitRead\(next\)/);
  assert.match(src, /req\.epoch !== _softReadEpoch[^]*?_displayCanvas\.width !== w[^]*?_displayCanvas\.height !== h/);
  const resize = src.slice(src.indexOf("function resize()"), src.indexOf("const noopMesh"));
  assert.match(resize, /_softReadEpoch\+\+/);
  assert.match(resize, /_softReadQueued = null/);
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

test("TLX and WGX remove timed-out software-present waiters", () => {
  for (const file of ["js/render/three/tlx.js", "js/render/webgpu/wgx.js"]) {
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

test("WGX soft present permits one staging read and drops pre-resize pixels", () => {
  const src = read("js/render/webgpu/wgx.js");
  assert.match(src, /let _softBlitSeq = 0/);
  assert.match(src, /let _softDisplayPending = false, _softDisplayEpoch = 0/);
  assert.match(src, /if \(_softHold \|\| _softDisplayPending\) return null/);
  assert.match(src, /_softDisplayPending = true;\s*return \{ buf, bpr, w, h, seq: _softBlitSeq, epoch: _softDisplayEpoch, sceneGen: _softSceneGen \}/);
  assert.match(src, /epoch === _softDisplayEpoch && seq === _softBlitSeq &&[^]*?_displayCanvas\.width === w[^]*?_displayCanvas\.height === h/);
  assert.match(src, /const release = function \(\) \{ _softDisplayPending = false; \}/);
  const resize = src.slice(src.indexOf("function resize()"), src.indexOf("function setRenderScale"));
  assert.match(resize, /if \(sizeChanged\) \{\s*_cssApplying = true;/);
  assert.match(resize, /_softDisplayEpoch\+\+/);
  assert.match(src, /if \(!_cssApplying\) _cssDirty = true/);
  assert.match(resize, /Math\.abs\(w - width\) <= 1 && Math\.abs\(h - height\) <= 1/);
});

test("WGX and TLX distrust the CSS-size cache after a viewport change", () => {
  // The defect GLX was fixed for (docs/PERF-FINDINGS.md §2u) is in all three
  // backends: cssDirty is edge-triggered and consumed unconditionally, so one
  // read landing before the canvas box reflows latches the PREVIOUS viewport's
  // size for the session. GLX's fix is guarded BEHAVIOURALLY on the WebGL2 mock
  // (gfx-backend-canary.test.mjs); three.js cannot load in Node and WGX's
  // _cssSize is not reachable from its mock device, so these two are pinned on
  // shape — the settle window must key off window.innerWidth/innerHeight
  // (viewport metrics, no reflow) and must reach the cache's guard.
  for (const [file, dirtyVar, wVar] of [
    ["js/render/webgpu/wgx.js", "_cssDirty", "_cssW"],
    ["js/render/three/tlx.js", "cssDirty", "cssW"],
  ]) {
    const src = read(file);
    assert.match(src, /window\.innerWidth \| 0, vh = window\.innerHeight \| 0/,
      `${file}: the settle trigger must be a viewport read, not a layout read`);
    assert.match(src, /cssRecheck = CSS_RECHECK_FRAMES/i,
      `${file}: a viewport change must arm a FRAME countdown (a wall-clock window`
      + ` expired before a starved loop ran a frame — artifacts/r16-accept.log)`);
    assert.match(src, new RegExp(`if \\(${dirtyVar} \\|\\| ${wVar} <= 0 \\|\\| \\w+ <= 0 \\|\\| \\w*[cC]ssRecheck > 0\\)`),
      `${file}: the countdown must actually reach the cache guard`);
    assert.match(src, /[cC]ssRecheck > 0\) \w*[cC]ssRecheck--/,
      `${file}: and it must be spent, or the cache stops being a cache`);
  }
  // TLX registered its ResizeObserver INSIDE the addEventListener check, so an
  // engine with one and not the other got no invalidation at all. GLX and WGX
  // both register it independently; TLX now does too.
  const tlx = read("js/render/three/tlx.js");
  const listeners = tlx.indexOf('window.addEventListener("orientationchange", markCssDirty)');
  // Anchor on the observer's own `if`, NOT on `new ResizeObserver(` — that
  // token sits inside the if's and the try's braces, which would offset the
  // depth by +2 and make the check say the opposite of what it means.
  const obs = tlx.indexOf('if (typeof ResizeObserver === "function"', listeners);
  assert.ok(listeners > 0 && obs > listeners, "TLX registers listeners, then the observer");
  // Net brace depth between the two: nested would be >= 0, outside is negative
  // (the window check's own `}` has been passed).
  let depth = 0;
  for (const ch of tlx.slice(listeners, obs)) { if (ch === "{") depth++; else if (ch === "}") depth--; }
  assert.ok(depth < 0, `TLX ResizeObserver must sit OUTSIDE the addEventListener check (net brace depth ${depth})`);
});
