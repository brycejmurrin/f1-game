/* TLX perf hunt 4, lane TLX-W (2026-10-14). No browser, no GPU: the REAL tlx-chunked packer, and three r186's REAL
 * WebGPURenderer({ forceWebGL }) over the no-op WebGL2 context (tests/helpers/fake-webgl2.mjs). A unit test of a
 * backend is not evidence it runs: the follow-up is a frozen TLX A/B and gpu-census.yml (macos).
 *   A-W2  4-byte vertex strides on three's WebGL2 backend (apex26.tlxPad4): every packed attribute that missed a
 *         4-byte stride (normal Int16x3n, colour Uint8x3n / Float16x3, mat Float16x1) is widened with the values
 *         the shader reads unchanged; WebGPU (fmt24) and the tools' raw pack are untouched.
 *   A-H5  the mirror target's mip chain capped (apex26.tlxMirMips, default 3 levels) at what the HUD inset's implicit
 *         LOD can reach; the cockpit glass latches the full chain.
 *   A-P1  the scene depth is discarded on frames whose post chain reads none of it (apex26.tlxDepthDiscard): the
 *         real tlx-post rule (GLX's needDepth) and the WebGL2 invalidateFramebuffer on the scene FBO.
 *   A-W1  the program warm's last stage DRAWS what the first frame draws (apex26.tlxDrawWarm; off on software
 *         adapters): the real startProgramWarm, every draw 1x1 and off the canvas, every touched state restored. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeFakeGL, installThreeGlobals } from "../helpers/fake-webgl2.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const CHUNKED = read("js/render/three/tlx-chunked.js");

installThreeGlobals();
globalThis.Log = globalThis.Log || { info() {}, warn() {}, error() {}, debug() {} };
if (!globalThis.localStorage) globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const THREE = await import(pathToFileURL(path.join(ROOT, "vendor/three-0.186.1/three.webgpu.min.js")).href);
const TSL = THREE.TSL;
for (const f of ["js/render/shared/light-budget.js", "js/lighting/knobs.js", "js/render/shared/post-common.js",
  "js/render/three/tsl-chunks.js", "js/render/three/tsl-lit.js", "js/render/three/tsl-post.js", "js/render/three/tlx-post.js",
  "js/render/three/tlx-shadow.js"])
  vm.runInThisContext(read(f), { filename: f });

// ── A-W2 ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// The real module, loaded with a given apex26.* store (the knob is read once, at load, like apex26.tlxPack).
function packer(ls = {}) {
  const sb = { window: {}, localStorage: { getItem: (k) => (k in ls ? ls[k] : null) }, Frustum: {},
    Float32Array, Uint32Array, Uint16Array, Uint8Array, Int16Array, Int32Array, Math };
  vm.createContext(sb);
  vm.runInContext(CHUNKED, sb, { filename: "tlx-chunked.js" });
  return sb.window.TLXShaders;
}
function decodeHalf(h) {
  const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
  if (e === 0) return s * m * Math.pow(2, -24);
  if (e === 31) return m ? NaN : s * Infinity;
  return s * (1 + m / 1024) * Math.pow(2, e - 15);
}
// What the GPU's vertex fetch hands the shader: one vertex's components, as floats.
function fetch(attr, v) {
  const a = attr.array, k = attr.itemSize, out = [];
  for (let c = 0; c < k; c++) {
    const x = a[v * k + c];
    out.push(attr.isFloat16BufferAttribute ? decodeHalf(x)
      : a instanceof Int16Array && attr.normalized ? Math.max(x / 32767, -1)
      : a instanceof Uint8Array && attr.normalized ? x / 255 : x);
  }
  return out;
}
const stride = (attr) => attr.itemSize * attr.array.BYTES_PER_ELEMENT;
// A small geometry covering every pack branch: unit normals (snorm16), in-range colours (unorm8), an HDR colour
// (emissive 2.6, half), whole and fractional MAT ids (half; 15.4 is the flag material's wave phase), and trk.
const N = 7;
const SRC = {
  nrm: Float32Array.from({ length: N * 3 }, (_, i) => [0.6, -0.8, 0, 1.00005, 0, -1, 0.267, 0.534, 0.802][i % 9]),
  col: Float32Array.from({ length: N * 3 }, (_, i) => [0, 0.5, 1, 0.25, 0.75, 0.125, 0.9, 0.1, 0.33][i % 9]),
  hdr: Float32Array.from({ length: N * 3 }, (_, i) => [2.6, 1.05, 0.25][i % 3]),
  mat: Float32Array.from({ length: N }, (_, i) => [0, 3, 15.4, 7, 255, 1, 15.4][i]),
  mat300: Float32Array.from({ length: N }, (_, i) => [0, 300, 2.5, 7, 1, 1, 15.4][i]),
  trk: Float32Array.from({ length: N * 3 }, (_, i) => i * 13.7),
};
const CASES = [["normal", "nrm", 3, "unit", 0], ["color", "col", 3, "unorm", 1], ["color (HDR)", "hdr", 3, "unorm", 1],
  ["mat", "mat", 1, "id", null], ["mat (> 255)", "mat300", 1, "id", null], ["trk", "trk", 3, null, null]];

test("A-W2: on WebGL2 every packed attribute has a 4-byte stride and fetches the same values; w is 0 (normal) / 1 (colour)", () => {
  const on = packer(), off = packer({ "apex26.tlxPad4": "0" });
  assert.equal(on.packStats.pad4On, true, "default ON");
  assert.equal(off.packStats.pad4On, false, "apex26.tlxPad4=0 restores the narrow strides");
  let narrowMisses = 0;
  for (const [name, key, k, kind, w] of CASES) {
    const len = N * k;
    const narrow = off.packAttr(THREE, SRC[key], len, k, kind, false);
    const wide = on.packAttr(THREE, SRC[key], len, k, kind, false);
    if (stride(narrow) % 4) narrowMisses++;
    assert.equal(stride(wide) % 4, 0, `${name}: ${wide.array.constructor.name}x${wide.itemSize} is a ${stride(wide)}-byte stride`);
    assert.equal(wide.array.length / wide.itemSize, N, `${name}: same vertex count`);
    for (let v = 0; v < N; v++) {
      const a = fetch(narrow, v), b = fetch(wide, v);
      assert.deepEqual(b.slice(0, k), a, `${name} vertex ${v}: the shader reads the same floats`);
      if (wide.itemSize === 4 && k === 3) assert.equal(b[3], w, `${name} vertex ${v}: w`);
    }
    if (narrow.isFloat16BufferAttribute && k === 1) {
      assert.ok(!wide.isFloat16BufferAttribute && wide.array instanceof Float32Array, `${name}: a 1-wide half becomes Float32`);
      assert.equal(wide.array[2], decodeHalf(narrow.array[2]), "the DECODED half (15.3984375), not the source 15.4");
    }
  }
  assert.equal(narrowMisses, 5, "control: normal, colour, HDR colour and both mats miss 4 bytes without the pad (trk does not)");
  assert.ok(on.packStats.pad4 >= 4 && on.packStats.pad4MB > 0, "packStats counts the widened attributes");
});

test("A-W2: WebGPU (fmt24) and the tools' raw pack (no fmt24) are untouched by the knob", () => {
  const on = packer(), off = packer({ "apex26.tlxPad4": "0" });
  for (const fmt24 of [true, undefined]) {
    for (const [name, key, k, kind] of CASES) {
      const a = off.packAttr(THREE, SRC[key], N * k, k, kind, fmt24), b = on.packAttr(THREE, SRC[key], N * k, k, kind, fmt24);
      assert.equal(b.array.constructor.name, a.array.constructor.name, `${name} fmt24=${fmt24}: type`);
      assert.equal(b.itemSize, a.itemSize, `${name} fmt24=${fmt24}: width`);
      assert.deepEqual(Array.from(b.array), Array.from(a.array), `${name} fmt24=${fmt24}: bytes`);
    }
  }
  assert.equal(on.packStats.pad4, 0, "nothing widened");
  // Both shipping call sites hand the WebGL2 rule over as `false`: the chunked factory's fmt24() and tlx.js buildGeometry.
  assert.match(CHUNKED, /const fmt24 = \(\) => !!\(ctx && ctx\.isWebGPU && ctx\.isWebGPU\(\)\);/);
  assert.match(read("js/render/three/tlx.js"), /const fmt24 = !!\(renderer\.backend && renderer\.backend\.isWebGPUBackend\);/);
  assert.match(CHUNKED, /const pad = fmt24 === false && pad4On && \(itemSize === 3 \|\| itemSize === 1\);/);
});

test("A-W2: the lit program reads a widened colour as vec3 and a Float32 mat as float — the same inputs, one wider fetch", async (t) => {
  const P = packer();
  const fg = makeFakeGL();
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  t.after(() => renderer.dispose());
  const lit = globalThis.TLXShaders.lit(THREE, TSL, { chunks: globalThis.TLXShaders.chunks(THREE, TSL), shadow: null,
    ssrTag: false, envCube: null, matMaps: null, lampGrid: null, sharedUniforms: true, maxLights: 16 });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute("normal", P.packAttr(THREE, SRC.nrm, N * 3, 3, "unit", false));
  g.setAttribute("color", P.packAttr(THREE, SRC.col, N * 3, 3, "unorm", false));
  g.setAttribute("mat", P.packAttr(THREE, SRC.mat, N, 1, "id", false));
  g.setAttribute("trk", P.packAttr(THREE, SRC.trk, N * 3, 3, null, false));
  assert.equal(g.getAttribute("color").itemSize, 4);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(); cam.position.set(0, 0, 5); cam.updateMatrixWorld();
  const m = new THREE.Mesh(g, lit.makeMaterial({ roughness: 0.6 })); m.frustumCulled = false; scene.add(m);
  renderer.render(scene, cam);
  const vs = fg.shaders.find((s) => /\bin\s+vec4\s+color\b/.test(s));
  assert.ok(vs, "the vertex stage declares the widened colour as a vec4 input");
  assert.match(vs, /\bcolor\.xyz\b/, "and reads its .xyz (attribute(\"color\", \"vec3\"))");
  assert.match(vs, /\bin\s+float\s+mat\b/, "mat is a float input either way");
});

// ── A-H5 ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const TLX = read("js/render/three/tlx.js");
const tslice = (from, to) => {
  const a = TLX.indexOf(from), b = TLX.indexOf(to, a);
  assert.ok(a > 0 && b > a, `tlx.js block "${from.trim()}" moved — check this test, not the code`);
  return TLX.slice(a, b);
};
// prepareMirrorTarget and the H5 level rule, verbatim, over three r186 on the fake WebGL2; the surroundings are
// stand-ins. rect() is mirrorRect's canvas fractions at a 1280 x 720 render size.
async function mirrorRig(t, ls = {}) {
  const fg = makeFakeGL(1280, 720);
  const storage = [];
  let mips = 0;
  fg.gl.texStorage2D = (...a) => { storage.push(a[1]); };
  fg.gl.generateMipmap = () => { mips++; };
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  t.after(() => renderer.dispose());
  const mk = new Function("THREE", "localStorage", `"use strict";
    let mirRT = null, mirCam = null, _mirRect = null;
    const W = 1280, H = 720, presentW = 1280, presentH = 720;
    const _instPerPass = true, skipBatches = () => false, _mirWarmSwap = () => {}, wantSpatialUpscale = () => false;
    const post = { hdrOk: () => true };
    ${tslice("      function prepareMirrorTarget(w, h, forWarm) {", "      // TLX opts out of the live env probe by default")}
    return { prepareMirrorTarget, rt: () => mirRT, rect(r) { _mirRect = r; }, glass() { _mirGlassSeen = true; } };`);
  const M = mk(THREE, { getItem: (k) => (k in ls ? ls[k] : null) });
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
  // One mirror frame: mirrorBegin's prepareMirrorTarget(w, h), then mirrorEnd's render into the target.
  const frame = (w, h) => {
    M.prepareMirrorTarget(w, h);
    renderer.setRenderTarget(M.rt()); renderer.render(scene, cam); renderer.setRenderTarget(null);
  };
  return { M, frame, storage, mipCount: () => mips };
}
// The census's helmet-cam mirror: a 461 x 132 target (SS 2) over its 230 x 66 px HUD rect — ratio 2.004, LOD ~1.
const RECT = [0.4, 0.02, 230.4 / 1280, 66 / 720];

test("A-H5: the mirror target stores and regenerates 3 levels, not 9, while only the inset reads it", async (t) => {
  const h = await mirrorRig(t);
  h.M.rect(RECT);
  h.frame(461, 132);
  const rt = h.M.rt();
  assert.equal(rt.texture.mipmaps.length, 3, "texture.mipmaps.length is the count three's Textures.getMipLevels takes");
  assert.equal(h.storage[0], 3, "texStorage2D allocates 3 colour levels (a 461 px chain is 9)");
  assert.ok(h.mipCount() >= 1, "the levels still regenerate after the mirror render");
  assert.equal(rt.texture.generateMipmaps, true);
  assert.equal(rt.texture.minFilter, THREE.LinearMipmapLinearFilter, "the same sampling state");
  // A rect the target over-samples further (ratio 7.7, LOD up to ~2.9): levels 0..3 can be touched, +slop -> 5.
  const h2 = await mirrorRig(t);
  h2.M.rect([0.4, 0.02, 60 / 1280, 17 / 720]);
  h2.frame(461, 132);
  assert.equal(h2.M.rt().texture.mipmaps.length, 5, "the cap yields to every level the inset's LOD can reach");
  // Same size, a rect that asks for more later: the target grows (and is re-allocated), never shrinks.
  h.M.rect([0.4, 0.02, 60 / 1280, 17 / 720]);
  h.frame(461, 132);
  assert.equal(h.M.rt().texture.mipmaps.length, 5);
  assert.equal(h.storage.filter((n) => n > 1).length, 2, "one re-allocation");
  h.M.rect(RECT); h.frame(461, 132);
  assert.equal(h.M.rt().texture.mipmaps.length, 5, "no shrink at the same size (no churn)");
});

test("A-H5: the cockpit glass latches the full chain; apex26.tlxMirMips=0 is the old chain, =N pins N under the glass", async (t) => {
  const h = await mirrorRig(t);
  h.M.rect(RECT);
  h.frame(461, 132);
  assert.equal(h.M.rt().texture.mipmaps.length, 3);
  h.M.glass();   // drawMirrorGlass ran
  h.frame(461, 132);
  assert.equal(h.M.rt().texture.mipmaps.length, 0, "the full chain again (an empty mipmaps array = three's own rule)");
  assert.equal(h.storage.filter((n) => n > 1).at(-1), 9, "re-allocated with all 9 levels");
  h.frame(500, 140);
  assert.equal(h.M.rt().texture.mipmaps.length, 0, "latched for the session, across a resize");

  const off = await mirrorRig(t, { "apex26.tlxMirMips": "0" });
  off.M.rect(RECT); off.frame(461, 132);
  assert.equal(off.M.rt().texture.mipmaps.length, 0);
  assert.equal(off.storage[0], 9, "knob 0: the full chain, as before");

  const pin = await mirrorRig(t, { "apex26.tlxMirMips": "2" });
  pin.M.rect(RECT); pin.frame(461, 132);
  assert.equal(pin.M.rt().texture.mipmaps.length, 3, "a pinned cap below the inset's need is raised to it");
  pin.M.glass(); pin.frame(461, 132);
  assert.equal(pin.M.rt().texture.mipmaps.length, 3, "pinned: the glass does not latch the full chain (the A/B lever)");
});

test("A-H5: tlx.js wiring — the glass latch in drawMirrorGlass, mirrorState reports the levels", () => {
  assert.match(TLX, /_mirGlass\+\+;\s*_mirGlassSeen = true;/);
  assert.match(TLX, /mips: mirRT \? _mirLevelsNow\(mirRT\.width, mirRT\.height\) : 0, mipCap: _mirMipCap/);
  assert.match(TLX, /localStorage\.getItem\("apex26\.tlxMirMips"\)/);
});

// ── A-P1 ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// Run fn with globalThis.localStorage answering from `ls` (the chain reads its knobs at construction).
function withStore(ls, fn) {
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true,
    value: { getItem: (k) => (k in ls ? ls[k] : null), setItem() {}, removeItem() {} } });
  try { return fn(); } finally {
    if (had) Object.defineProperty(globalThis, "localStorage", had); else delete globalThis.localStorage;
  }
}
// The REAL post chain (tlx-post + tsl-post) on three r186 over the fake WebGL2, plus one lit mesh to draw.
async function postRig(t, { ls = {}, samples = 0 } = {}) {
  const fg = makeFakeGL(320, 180);
  const inv = [];
  fg.gl.invalidateFramebuffer = (target, list) => { inv.push([target, list.slice()]); };
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  const post = withStore(ls, () => globalThis.TLXShaders.postChain(THREE, TSL, { renderer, isMobile: true,
    chunks: globalThis.TLXShaders.chunks(THREE, TSL), shadow: null, viz: null, ssrTag: false, softDest: () => null,
    wantSpatialUpscale: () => false, getPresentSize: () => [320, 180], sceneSamples: samples }));
  post.resize(320, 180);
  t.after(() => { post.dispose(); renderer.dispose(); });
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(); cam.position.set(0, 0, 5); cam.updateMatrixWorld();
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicNodeMaterial()); m.frustumCulled = false; scene.add(m);
  // tlx.js present()'s scene pass, verbatim in shape: depthBegin, the render into the scene target, depthEnd.
  const scenePass = (opts, F) => {
    renderer.setRenderTarget(post.sceneTarget());
    const keep = post.depthBegin(opts, F);
    renderer.render(scene, cam);
    const dropped = post.depthEnd();
    renderer.setRenderTarget(null);
    return { keep, dropped };
  };
  return { fg, renderer, post, inv, scenePass, gl: fg.gl };
}
const I16 = new THREE.Matrix4().toArray();
// A night frame: the key light below the horizon and dim, so the flare is off; no SSAO, godray or SSR inputs.
const VP = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000).projectionMatrix.toArray();   // looking down -z
const NIGHT = { proj: I16, invProj: I16, invVP: I16, viewProj: VP, upVS: [0, 1, 0], time: 0, sunVS: [0, 0, -1],
  sunDir: [0, -0.9, 0.3], sunColor: [0.05, 0.05, 0.08] };
const DAY = { ...NIGHT, sunDir: [0, 0.3, -0.95], sunColor: [1, 0.95, 0.9] };
const OFF = { ssao: 0, contact: 0, godray: 0, reflect: 0, carReflect: 0, bloom: 0.5, exposure: 1 };

test("A-P1: no SSAO / contact / godray / SSR / flare input -> the depth is not needed; each one alone brings it back", async (t) => {
  const { post } = await postRig(t);
  assert.equal(post.needsDepth(OFF, NIGHT), false, "autoTier 4 / night: nothing samples the scene depth");
  assert.equal(post.needsDepth({ ...OFF, ssao: 0.5 }, NIGHT), true, "SSAO");
  assert.equal(post.needsDepth({ ...OFF, contact: 0.4 }, NIGHT), true, "contact shadows ride the SSAO pass");
  assert.equal(post.needsDepth({ ...OFF, reflect: 0.3 }, NIGHT), true, "wet-road SSR");
  assert.equal(post.needsDepth({ ...OFF, carReflect: 0.2 }, NIGHT), true, "car-paint SSR");
  const { carReflect, ...noCar } = OFF;
  assert.equal(post.needsDepth(noCar, NIGHT), true, "an omitted carReflect is the 0.05 knob default: car SSR still marches");
  assert.equal(post.needsDepth(OFF, DAY), true, "a day sun in front of the camera: the lens flare taps depth at sunUV");
  assert.equal(post.needsDepth({ ...OFF, flareMul: 0 }, DAY), false, "LENS FLARE 0: no tap");
  assert.equal(post.needsDepth({ ...OFF, ssao: 0.5 }, { ...NIGHT, invProj: null }), false, "no invProj: SSAO cannot run");
});

test("A-P1: WebGL2 invalidates the scene FBO's depth after the scene pass only on frames that read none of it", async (t) => {
  const h = await postRig(t);
  const off = h.scenePass(OFF, NIGHT);
  assert.deepEqual(off, { keep: false, dropped: true });
  assert.equal(h.inv.length, 1);
  assert.equal(h.inv[0][0], h.gl.DRAW_FRAMEBUFFER, "the scene FBO, still bound for its pass");
  assert.deepEqual(h.inv[0][1], [h.gl.DEPTH_ATTACHMENT], "depth only — never the colour the composite reads");
  const fb = h.renderer.backend.state.currentBoundFramebuffers[h.gl.DRAW_FRAMEBUFFER];
  assert.ok(Object.values(h.renderer.backend.get(h.post.sceneTarget()).framebuffers).includes(fb));
  assert.equal(h.post.sceneTarget().resolveDepthBuffer, false);
  const on = h.scenePass({ ...OFF, ssao: 0.5 }, NIGHT);
  assert.deepEqual(on, { keep: true, dropped: false }, "a frame that reads depth keeps it");
  assert.equal(h.inv.length, 1, "no second invalidate");
  assert.equal(h.post.sceneTarget().resolveDepthBuffer, true, "and an MSAA target resolves it again");
  assert.deepEqual(h.post.state().depth, { discard: true, kept: true, discards: 1 });
  // depthEnd with nothing of ours bound (a caller that rendered elsewhere since) does nothing.
  h.post.depthBegin(OFF, NIGHT);
  h.renderer.backend.state.bindFramebuffer(h.gl.FRAMEBUFFER, null);
  assert.equal(h.post.depthEnd(), false, "never a guess: only the FBO three rendered the scene into");
  assert.equal(h.inv.length, 1);

  const knob = await postRig(t, { ls: { "apex26.tlxDepthDiscard": "0" } });
  assert.deepEqual(knob.scenePass(OFF, NIGHT), { keep: true, dropped: false }, "apex26.tlxDepthDiscard=0 always keeps it");
  assert.equal(knob.inv.length, 0);
});

test("A-P1: tlx.js brackets the scene pass with depthBegin / depthEnd, before post.present", () => {
  const at = TLX.indexOf('_gpuLastOperation = "render-scene";');
  assert.ok(at > 0);
  assert.match(TLX.slice(at, at + 420),
    /if \(post\.depthBegin\) post\.depthBegin\(opts, _postF\);[^\n]*\n\s*_renderTimed\(scene, camera\);\s*if \(post\.depthEnd\) post\.depthEnd\(\);\s*_gpuLastOperation = "render-post";\s*post\.present\(opts, _postF\);/);
});

// ── A-W1 ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// The REAL startProgramWarm with its draw stage (tlx.js, verbatim: the mirror target + H5 rule, the mirror swap,
// the ssrTag MRT node, the W1 block and the warm) over three r186 on the fake WebGL2, with the REAL lit material,
// post chain (tagged scene target, MRT) and shadow subsystem (one caster). Stand-ins: the sky, the late-lit /
// FX compiles, the instance registry, the soft-adapter verdicts. Every renderer.render() is recorded with the
// state it ran under; the warm's compile stages render nothing (compileAsync), so every record is the draw stage.
async function warmRig(t, { ls = {}, soft = false } = {}) {
  const fg = makeFakeGL(320, 180);
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  t.after(() => renderer.dispose());   // first: a throw below must not leave three's frame loop holding the process
  const shadowSys = globalThis.TLXShaders.shadowSys(THREE, TSL, { renderer, isMobile: false, softwareGL: false, isWarming: () => false });
  const lit = globalThis.TLXShaders.lit(THREE, TSL, { chunks: globalThis.TLXShaders.chunks(THREE, TSL), shadow: null,
    ssrTag: true, envCube: null, matMaps: null, lampGrid: null, sharedUniforms: true, maxLights: 16 });
  const post = globalThis.TLXShaders.postChain(THREE, TSL, { renderer, isMobile: false,
    chunks: globalThis.TLXShaders.chunks(THREE, TSL), shadow: null, viz: null, ssrTag: true, softDest: () => null,
    wantSpatialUpscale: () => false, getPresentSize: () => [320, 180], sceneSamples: 0 });
  post.resize(320, 180);
  t.after(() => post.dispose());
  const scene = new THREE.Scene(); scene.matrixWorldAutoUpdate = false;
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 0, 5); camera.updateMatrixWorld();
  const g = new THREE.BufferGeometry();
  for (const [n, k] of [["position", 3], ["normal", 3], ["color", 3], ["mat", 1], ["trk", 3]])
    g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(k * 3).fill(0.5), k));
  const mesh = new THREE.Mesh(g, lit.makeMaterial({ roughness: 0.6 })); mesh.frustumCulled = false; mesh.updateMatrixWorld(); scene.add(mesh);
  // One real caster in castScene (the grid's casters are there when the warm runs).
  const VPm = new Float32Array(new THREE.Matrix4().elements);
  shadowSys.shadowBegin(VPm); shadowSys.castShadow({ geo: g }, new Float32Array(new THREE.Matrix4().elements)); shadowSys.shadowEnd();
  const mk = new Function("THREE", "TSL", "renderer", "scene", "camera", "lit", "post", "shadowSys", "localStorage", "Log", "SOFT", `"use strict";
    let mirRT = null, mirCam = null, _mirRect = null, _mirUsed = false, _glassProbeGeo = null;
    const W = 320, H = 180, presentW = 320, presentH = 180, wantSpatialUpscale = () => false;
    const _instPerPass = true, skipBatches = () => false, _instRegistry = [], _mirOf = () => null;
    const fx = null, vizMat = null, softGpu = () => SOFT, softwareGL = SOFT, softContent = () => false;
    const pinSkyMaterial = () => {}, mintLateLit = () => {}, warmFxPrograms = async () => {}, warmLateLit = async () => {};
    const warmPlusOn = () => true, wantMirrorWarm = () => true, softOutRT = () => null;
    const I = new THREE.Matrix4().toArray();
    const _postF = { proj: I, invProj: I, invVP: I, viewProj: I, upVS: [0, 1, 0], time: 0, sunVS: [0, 0, -1] };
    const _warmStages = { at: 0, scene: null, fx: null, post: null, shadow: null, draw: null, drawn: null, total: null, attempts: 0, failed: 0 };
    let _warmAt = 0, _warmAttempts = 0, _warmPending = null, _warmRequested = false, _warmDone = false, _gpuLastOperation = "";
    ${tslice("      function prepareMirrorTarget(w, h, forWarm) {", "      // TLX opts out of the live env probe by default")}
    ${tslice("      function _mirWarmSwap() {", "      function _showInstanced(rec, order) {")}
    ${tslice("      let _ssrMrt = null;", "      let _poolNow = ")}
    ${tslice("      // A-W1 (perf hunt 4): THE DRAW WARM.", "      const ENV_PROBE_TRIES")}
    return { startProgramWarm, pending: () => _warmPending, stages: _warmStages, mrtNode: _ssrMrtNode, mirRT: () => mirRT };`);
  const W1 = mk(THREE, TSL, renderer, scene, camera, lit, post, shadowSys, { getItem: (k) => (k in ls ? ls[k] : null) },
    globalThis.Log, soft);
  const calls = [];
  const base = renderer.render.bind(renderer);
  renderer.render = (sc, cam) => {
    const tg = renderer.getRenderTarget();
    calls.push({ tg, test: renderer.getScissorTest(), sc: tg ? tg.scissor.clone() : null, ac: renderer.autoClear,
      mrt: renderer.getMRT(), name: tg && tg.texture ? tg.texture.name : null, size: tg ? [tg.width, tg.height] : null });
    return base(sc, cam);
  };
  const warm = async () => { W1.startProgramWarm({ ssao: 0.5, bloom: 0.5, godray: 0, reflect: 0.2, exposure: 1 }); await W1.pending(); };
  return { renderer, post, W1, calls, warm, fg };
}

test("A-W1: the warm's last stage DRAWS the scene, the post chain, the mirror and the casters — 1x1, never the canvas", async (t) => {
  const h = await warmRig(t);
  const target0 = h.renderer.getRenderTarget(), mrt0 = h.renderer.getMRT();
  h.renderer.autoClear = true;
  await h.warm();
  const sceneRT = h.post.sceneTarget();
  assert.equal(h.W1.stages.failed, 0, "the warm did not throw");
  assert.ok(h.calls.length > 3, `draws were issued (${h.calls.length})`);
  for (const c of h.calls) {
    assert.ok(c.tg, "never the canvas: a draw there would present a black frame for the rest of the warm");
    assert.equal(c.ac, false, "autoClear off: a clear ignores the scissor");
  }
  const sc = h.calls.filter((c) => c.tg === sceneRT);
  assert.equal(sc.length, 1, "the scene, once, into the live scene target");
  assert.equal(sc[0].test, true, "under the scissor test");
  assert.deepEqual(sc[0].sc.toArray(), [0, 0, 1, 1], "a 1x1 scissor");
  assert.equal(sc[0].mrt, h.W1.mrtNode(), "with the ssrTag MRT exactly as present() sets it");
  const postDraws = h.calls.filter((c) => c.tg !== sceneRT && c.name !== "TLXWarmCast.color" && c.tg.width > 4);
  assert.ok(postDraws.length >= 3, `the post chain's passes, each into its own target (${postDraws.length})`);
  for (const c of postDraws) { assert.equal(c.test, true); assert.deepEqual(c.sc.toArray(), [0, 0, 1, 1]); }
  assert.equal(h.calls.filter((c) => c.size[0] === 4 && c.size[1] === 4).length, 1, "the mirror's world into a 4x4 copy of mirRT's state");
  assert.ok(h.calls.every((c) => c.tg !== h.W1.mirRT()), "never the live mirror target (a lite rung may composite it before it re-renders)");
  const casts = h.calls.filter((c) => c.name === "TLXWarmCast.color");
  assert.ok(casts.length >= 1 && casts.every((c) => c.size[0] === 1), "the casters into 1x1 scratch depth targets, never the live maps");
  // Everything restored.
  assert.equal(h.renderer.autoClear, true, "autoClear restored");
  assert.equal(h.renderer.getScissorTest(), false, "scissor test restored");
  assert.deepEqual(sceneRT.scissor.toArray(), [0, 0, 320, 180], "the scene target's scissor restored");
  for (const c of postDraws) assert.deepEqual(c.tg.scissor.toArray(), [0, 0, c.tg.width, c.tg.height], "each post target's scissor restored");
  assert.equal(h.renderer.getRenderTarget(), target0, "target restored");
  assert.equal(h.renderer.getMRT(), mrt0, "MRT restored");
  const d = h.W1.stages.drawn;
  assert.equal(d.scene, 1); assert.equal(d.mirror, 1); assert.ok(d.post >= 3); assert.ok(d.casts >= 1);
  assert.equal(typeof h.W1.stages.draw, "number", "memState().warm.draw: the stage's ms, GPU settle included");
  assert.ok(h.fg.counts.fenceSync >= 1 && h.fg.counts.clientWaitSync >= 1, "WebGL2 waited on a fence for the GPU to settle");
});

test("A-W1: off on a software adapter (unset knob), forced on by apex26.tlxDrawWarm=1, off by =0", async (t) => {
  const soft = await warmRig(t, { soft: true });
  await soft.warm();
  assert.equal(soft.calls.length, 0, "SwiftShader CI pays nothing");
  assert.equal(soft.W1.stages.draw, null);
  const forced = await warmRig(t, { soft: true, ls: { "apex26.tlxDrawWarm": "1" } });
  await forced.warm();
  assert.ok(forced.calls.length > 3, "=1 draws on any adapter (the A/B handle)");
  const off = await warmRig(t, { ls: { "apex26.tlxDrawWarm": "0" } });
  await off.warm();
  assert.equal(off.calls.length, 0, "=0: no draw stage");
  assert.equal(off.W1.stages.drawn, null);
});
