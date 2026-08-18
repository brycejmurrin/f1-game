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
  assert.match(src, /let _softDisplayPending = false, _softDisplayEpoch = 0/);
  assert.match(src, /if \(_softHold \|\| _softDisplayPending\) return null/);
  assert.match(src, /_softDisplayPending = true;\s*return \{ buf, bpr, w, h, seq: _softBlitSeq, epoch: _softDisplayEpoch, sceneGen: _softSceneGen \}/);
  assert.match(src, /epoch === _softDisplayEpoch && seq === _softBlitSeq &&[^]*?_displayCanvas\.width === w[^]*?_displayCanvas\.height === h/);
  assert.match(src, /const release = function \(\) \{ _softDisplayPending = false; \}/);
  const resize = src.slice(src.indexOf("function resize()"), src.indexOf("function setRenderScale"));
  assert.match(resize, /if \(sizeChanged\) \{\s*_softDisplayEpoch\+\+/);
});
