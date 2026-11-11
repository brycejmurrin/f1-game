/* TLX fixed render targets (#2655, apex26.tlxFixedTargets): the viewport helper
 * (js/render/three/tsl-viewport.js) and the canary that keeps raw screen-uv use
 * out of the shaders. VM + source scan, no browser, ~0.1 s.
 *
 * The canary is the point: three's screenUV is screenCoordinate / the BOUND
 * TARGET size, so under a sub-viewport any reader that takes it as 0..1 over the
 * image is wrong. Every such reader goes through VP.uv(view) and every
 * sampled intermediate through VP.tex(node); a new raw use fails here. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("canary: screenUV appears only as the import and the identity fallback", () => {
  const dir = path.join(ROOT, "js/render/three");
  const hits = {};
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".js"))) {
    const n = (strip(read("js/render/three/" + f)).match(/\bscreenUV\b/g) || []).length;
    if (n) hits[f] = n;
  }
  // tsl-post.js: the TSL destructure + the `uv: () => screenUV` fallback.
  // tsl-sky.js: the destructure, the `: screenUV` fallback of imageUV, and the cloud-cache
  // fill — it draws into its OWN full S x S target, never a sub-viewport.
  // tsl-viewport.js: the destructure + the disabled return.
  assert.deepEqual(hits, { "tsl-post.js": 2, "tsl-sky.js": 3, "tsl-viewport.js": 2 });
});

test("canary: every texture node in tsl-post is a VP.tex wrapper or on the explicit list", () => {
  const src = strip(read("js/render/three/tsl-post.js"));
  const raw = [...src.matchAll(/(?<!VP\.tex\()\btexture\(([^)]*)\)/g)].map((m) => m[1]);
  // Full-image textures that are not render-target layouts: the lens-dirt map, the
  // mirror target (its own rect-relative read), the godray slot's "off" texture
  // object, the shadow compare taps (godray march) and the import/destructure.
  const allowed = new Set(["ctx.dirtTex || ctx.blackTex", "ctx.blackTex", "SHD.sunTex, flipUV(sc.xy",
    "SHD.lampTex, flipUV(lqs.xy", "ctx.sceneTex"].map((x) => x));
  const stray = raw.filter((a) => !allowed.has(a));
  assert.deepEqual(stray, [], "unwrapped texture(): " + stray.join(" | "));
  for (const name of ["sceneT", "tagT", "depthT", "bloomTexN", "ssaoTexN", "godrayTexN", "fxaaTex", "sgsrTex", "blitTex"]) {
    assert.match(src, new RegExp("const " + name + " = VP\\.tex\\(texture\\("), name + " wrapped");
  }
});

test("canary: tlx.js hands every chain the same viewport mapper and the physical size", () => {
  const tlx = strip(read("js/render/three/tlx.js"));
  assert.match(tlx, /fixedTargets, vp: vport/);
  assert.match(tlx, /sky = TLXShaders\.sky\(THREE, TSL, \{[^}]*vp: vport, sceneView/);
  assert.equal((tlx.match(/post\.resize\([^)]*\)/g) || []).every((c) => /presentW, presentH/.test(c)), true);
});

test("fixed targets preference is opt-in and stays off when storage is unavailable", () => {
  const source = read("js/render/three/tlx.js");
  // Execute the production declaration and storage read, including its catch.
  // Bound the slice by declarations, without restating the preference condition.
  const start = source.indexOf("let fixedTargets");
  const end = source.indexOf("function fixedActive", start);
  assert.ok(start >= 0 && end > start, "production preference initializer exists");
  const initializer = new vm.Script(source.slice(start, end) + "\nfixedTargets;", {
    filename: absSrc("js/render/three/tlx.js"),
  });
  for (const [label, stored, throws, expected] of [
    ["unset", null, false, false],
    ["disabled", "0", false, false],
    ["enabled", "1", false, true],
    ["unrecognized", "true", false, false],
    ["storage throws", null, true, false],
  ]) {
    const keys = [];
    const actual = initializer.runInNewContext({ localStorage: { getItem(key) {
      keys.push(key);
      if (throws) throw new Error("storage unavailable");
      return stored;
    } } });
    assert.deepEqual(keys, ["apex26.tlxFixedTargets"], label + " reads the intended preference");
    assert.equal(actual, expected, label);
  }
});

// ---- the helper itself, over a recording fake of the TSL surface -------------
function fakeTSL() {
  const node = (op, ...a) => new Proxy({ op, a }, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === "symbol") return undefined;
      return (...args) => node(String(k), t, ...args);
    },
  });
  return {
    uniform: (v) => ({ value: v, isUniform: true }),
    vec2: (x) => node("vec2", x),
    min: (a, b) => node("min", a, b),
    screenUV: { isScreenUV: true },
    screenCoordinate: node("screenCoordinate"),
  };
}
class V2 { constructor(x, y) { this.x = x; this.y = y; } set(x, y) { this.x = x; this.y = y; return this; } }

function load(enabled) {
  const ctx = { window: {}, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read("js/render/three/tsl-viewport.js"), ctx, { filename: absSrc("js/render/three/tsl-viewport.js") });
  const TSL = fakeTSL();
  return { VP: ctx.TLXShaders.viewport({ Vector2: V2 }, TSL, { enabled }), TSL };
}

test("disabled: the helper is the identity — the flag-off graph is the shipped one", () => {
  const { VP, TSL } = load(false);
  const n = { sample() {}, value: null };
  assert.equal(VP.tex(n), n, "tex() returns the node itself");
  assert.equal(VP.uv(VP.view()), TSL.screenUV, "uv() returns screenUV itself");
  assert.equal(VP.wrapperCount(), 0);
});

test("enabled: wrappers follow the bound texture's logical rect", () => {
  const { VP } = load(true);
  const calls = [];
  const node = { value: null, sample(uv) { calls.push(uv); return "tap"; } };
  const w = VP.tex(node);
  const rtA = { id: "A" }, rtB = { id: "B" }, blank = { id: "blank" };
  VP.layout(rtA, 672, 378, 960, 540);          // scale 0.7 of 960x540
  VP.layout(rtB, 480, 270, 480, 270);          // a target at full logical size
  w.value = rtA;
  assert.equal(node.value, rtA, "value setter writes through");
  assert.equal(w.value, rtA, "value getter reads through");
  VP.sync();
  assert.deepEqual([w.ratio.value.x, w.ratio.value.y], [672 / 960, 378 / 540]);
  assert.deepEqual([w.maxUV.value.x, w.maxUV.value.y], [(672 - 0.5) / 960, (378 - 0.5) / 540]);
  w.value = rtB; VP.sync();
  assert.deepEqual([w.ratio.value.x, w.ratio.value.y], [1, 1], "rebinding re-reads the layout");
  w.value = blank; VP.sync();
  assert.deepEqual([w.ratio.value.x, w.ratio.value.y], [1, 1], "an unregistered 1x1 fallback maps 1:1");
  assert.equal(w.sample({ k: 1 }), "tap");
  assert.equal(calls.length, 1, "sample() forwards one tap");
  // a resolution step is a layout() call, not an allocation
  VP.layout(rtA, 480, 270, 960, 540); w.value = rtA; VP.sync();
  assert.deepEqual([w.ratio.value.x, w.ratio.value.y], [0.5, 0.5]);
});

test("enabled: uv(view) is bound to the view's size uniform", () => {
  const { VP } = load(true);
  const v = VP.view();
  v.set(672, 378);
  assert.deepEqual([v.size.value.x, v.size.value.y], [672, 378]);
  const u = VP.uv(v);
  assert.equal(u.op, "div", "screenCoordinate.xy / size");
  assert.equal(u.a[1], v.size);
});

test("post lazy targets use their logical rect on first activation and reopening", async () => {
  // Real post orchestration and TSL graphs; record uniforms at each draw.
  // No renderer compilation or GPU is needed to observe binding order.
  const THREE = await import("../../vendor/three-0.187.0/three.webgpu.min.js");
  const ctx = vm.createContext({ window: {},
    localStorage: { getItem: (key) => key === "apex26.tlxAoFold" ? "0" : null },
    Log: { info() {} },
  });
  ctx.window = ctx;
  for (const file of ["js/lighting/knobs.js", "js/render/shared/post-common.js",
    "js/render/three/tsl-viewport.js", "js/render/three/tsl-chunks.js",
    "js/render/three/tsl-post.js", "js/render/three/tlx-post.js"])
    vm.runInContext(read(file), ctx, { filename: absSrc(file) });
  const VP = ctx.TLXShaders.viewport(THREE, THREE.TSL, { enabled: true });
  const wrappers = [], tex = VP.tex, scope = VP.scope;
  VP.tex = (node) => { const w = tex(node); wrappers.push(w); return w; };
  // The chain registers its readers through a disposable scope (W6).
  VP.scope = () => {
    const owner = scope(), own = owner.tex;
    owner.tex = (node) => { const w = own(node); wrappers.push(w); return w; };
    return owner;
  };
  let target = null, draws = 0, reducedReads = 0;
  const renderer = {
    backend: { isWebGPUBackend: true }, autoClear: true,
    getRenderTarget: () => target,
    setRenderTarget: (value) => { target = value; },
    render() {
      draws++;
      for (const w of wrappers) {
        const L = VP.layoutOf(w.value);
        if (!L) continue;
        assert.equal(w.ratio.value.x, L.lw / L.pw, "width ratio at draw");
        assert.equal(w.ratio.value.y, L.lh / L.ph, "height ratio at draw");
        assert.equal(w.maxUV.value.x, (L.lw - 0.5) / L.pw, "right edge at draw");
        assert.equal(w.maxUV.value.y, (L.lh - 0.5) / L.ph, "bottom edge at draw");
        if (L.lw < L.pw) reducedReads++;
      }
    },
  };
  const identity = new THREE.Matrix4().elements;
  const post = ctx.TLXShaders.postChain(THREE, THREE.TSL, { renderer,
    fixedTargets: true, vp: VP, isMobile: false,
    chunks: ctx.TLXShaders.chunks(THREE, THREE.TSL),
    shadow: { sunTex: new THREE.DepthTexture(1, 1),
      S: { enabled: true, lightVP: identity, lampLightVP: identity } },
    wantSpatialUpscale: () => true,
    getPresentSize: () => ({ width: 800, height: 400 }),
  });
  try {
    post.resize(400, 200, 800, 400);
    const frame = { invProj: identity, proj: identity, invVP: identity,
      viewProj: identity, eye: [0, 0, 0], sunDir: [0, 1, 0], sunColor: [1, 1, 1] };
    const on = { ssao: 1, godray: 1, bloom: 1 };
    const off = { ssao: 0, godray: 0, bloom: 0 };
    post.present(on, frame);
    assert.equal(post.state().held.ssao, true);
    assert.equal(post.state().held.shafts, true);
    assert.equal(post.state().held.bloom, true);
    for (let i = 0; i < 8; i++) post.present(off, frame);
    assert.equal(Object.values(post.state().held).every((held) => !held), true);
    const previousDraws = draws;
    post.present(on, frame);
    assert.ok(draws > previousDraws, "reopened blocks drew");
    assert.ok(reducedReads > 0, "checked sub-viewport readers");
  } finally { post.dispose(); }
});

test("texture rebind updates ratio and edge clamp immediately, without a global sync", () => {
  const { VP } = load(true), t = {}, fallback = {};
  VP.layout(t, 21, 10, 84, 40);
  const w = VP.tex({ value: t, sample() {} });
  assert.deepEqual([w.ratio.value.x, w.ratio.value.y], [.25, .25]);
  w.value = fallback;
  assert.deepEqual([w.ratio.value.x, w.ratio.value.y], [1, 1]);
  w.value = t;
  assert.deepEqual([w.ratio.value.x, w.ratio.value.y], [.25, .25]);
  assert.deepEqual([w.maxUV.value.x, w.maxUV.value.y], [20.5 / 84, 9.5 / 40]);
});

// Real post factories and Three graph objects; intercept only GPU drawing.
// Assert uniforms at submission, not only after present() has completed.
import * as RealThree from "../../vendor/three-0.187.0/three.webgpu.min.js";
function postFixture() {
  const ctx = { Log: { info() {}, warn() {} }, localStorage: { getItem() { return null; } } };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of ["js/lighting/knobs.js", "js/render/shared/post-common.js", "js/render/three/tsl-viewport.js",
    "js/render/three/tsl-chunks.js", "js/render/three/tsl-post.js", "js/render/three/tlx-post.js"])
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const VP = ctx.TLXShaders.viewport(RealThree, RealThree.TSL, { enabled: true });
  const groups = [], scope = VP.scope, rootReaders = [], rootTex = VP.tex;
  VP.tex = n => { const w = rootTex(n); rootReaders.push(w); return w; };
  VP.scope = () => {
    const owner = scope(), tex = owner.tex, readers = [];
    owner.tex = n => { const w = tex(n); readers.push(w); return w; };
    groups.push(readers); return owner;
  };
  let target = null;
  const renderer = { backend: { isWebGPUBackend: true, device: { features: new Set() } },
    setRenderTarget(t) { target = t; }, getRenderTarget() { return target; } };
  const create = () => {
    const n = groups.length, first = rootReaders.length;
    const p = ctx.TLXShaders.postChain(RealThree, RealThree.TSL, { renderer, isMobile: true,
      chunks: ctx.TLXShaders.chunks(RealThree, RealThree.TSL), fixedTargets: true, vp: VP,
      shadow: null, wantSpatialUpscale: () => false });
    if (groups.length === n) groups.push(rootReaders.slice(first)); // baseline factory has no scope
    return p;
  };
  const I = new RealThree.Matrix4().toArray();
  const frame = { proj: I, invProj: I, viewProj: I, sunDir: [0, 1, 0], sunColor: [1, 1, 1], upVS: [0, 1, 0] };
  return { ctx, VP, groups, create, frame };
}

test("real post readers stay current through cold allocation, toggles, shedding and resize", () => {
  const f = postFixture(), p = f.create();
  const original = RealThree.QuadMesh.prototype.render;
  let draws = 0;
  RealThree.QuadMesh.prototype.render = function () {
    draws++;
    assert.ok(f.groups[0] && f.groups[0].length > 0, "the real chain registered readers");
    for (const w of f.groups[0]) {
      const L = f.VP.layoutOf(w.value);
      assert.deepEqual([w.ratio.value.x, w.ratio.value.y], L ? [L.lw / L.pw, L.lh / L.ph] : [1, 1]);
      assert.deepEqual([w.maxUV.value.x, w.maxUV.value.y], L ? [(L.lw - .5) / L.pw, (L.lh - .5) / L.ph] : [1, 1]);
    }
  };
  const present = on => p.present({ bloom: on ? .5 : 0, ssao: on ? .5 : 0, godray: 0, reflect: 0 }, f.frame);
  try {
    p.resize(422, 194, 844, 390);
    present(true); present(true); present(false); present(true);
    for (let i = 0; i < 8; i++) present(false);
    assert.equal(p.state().held.ssao, false); assert.equal(p.state().held.bloom, false);
    present(true); // new target objects after resource shedding
    p.resize(506, 234, 844, 390); present(true);
    p.resize(600, 300, 1000, 500); present(true);
    assert.ok(draws > 0);
  } finally { RealThree.QuadMesh.prototype.render = original; p.dispose(); }
});

test("four real post rebuilds retire only their readers and preserve shared scene/sky readers", () => {
  const f = postFixture(), t = {};
  f.VP.layout(t, 20, 10, 80, 40);
  const external = f.VP.tex({ value: t, sample() {} }), baseline = f.VP.wrapperCount();
  for (let cycle = 0; cycle < 4; cycle++) {
    const p = f.create(); p.resize(422, 194, 844, 390);
    assert.ok(f.VP.wrapperCount() > baseline);
    p.dispose(); p.dispose();
    assert.equal(f.VP.wrapperCount(), baseline);
    f.VP.layout(t, 20 + cycle, 10, 80, 40); f.VP.sync();
    assert.deepEqual([external.ratio.value.x, external.ratio.value.y], [(20 + cycle) / 80, .25]);
  }
  // A graph factory failure after registering readers must unwind the scope too.
  const makePost = f.ctx.TLXShaders.post;
  f.ctx.TLXShaders.post = (...args) => { makePost(...args); throw new Error("controlled graph failure"); };
  assert.throws(f.create, /controlled graph failure/);
  assert.equal(f.VP.wrapperCount(), baseline);
});
