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
import { absSrc } from "../helpers/abs-src.mjs";
import { fnSource } from "../helpers/fn-source.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const CHUNKED = read("js/render/three/tlx-chunked.js");

installThreeGlobals();
globalThis.Log = globalThis.Log || { info() {}, warn() {}, error() {}, debug() {} };
if (!globalThis.localStorage) globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const THREE = await import(pathToFileURL(path.join(ROOT, "vendor/three-0.187.0/three.webgpu.min.js")).href);
const TSL = THREE.TSL;
for (const f of ["js/render/shared/light-budget.js", "js/lighting/knobs.js", "js/render/shared/post-common.js",
  "js/render/three/tsl-chunks.js", "js/render/three/tsl-lit.js", "js/render/three/tsl-post.js", "js/render/three/tlx-post.js",
  "js/render/three/tlx-shadow.js"])
  vm.runInThisContext(read(f), { filename: absSrc(f) });

// ── A-W2 ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// The real module, loaded with a given apex26.* store (the knob is read once, at load, like apex26.tlxPack).
function packer(ls = {}, constructors = {}) {
  const sb = { window: {}, localStorage: { getItem: (k) => (k in ls ? ls[k] : null) }, Frustum: {},
    Float32Array, Uint32Array, Uint16Array, Uint8Array, Int16Array, Int32Array, Math, ...constructors };
  vm.createContext(sb);
  vm.runInContext(CHUNKED, sb, { filename: absSrc("js/render/three/tlx-chunked.js") });
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

test("WebGPU normal packing allocates only final storage and preserves the padded Float32 fetch", () => {
  const allocations = [];
  const constructors = Object.fromEntries([Float32Array, Int16Array].map(Type => [Type.name, new Proxy(Type, {
    construct(target, args) { const a = Reflect.construct(target, args); allocations.push(a.byteLength); return a; },
  })]));
  // Include values either side of a quantisation midpoint, float noise at
  // the admission edge, negative zero and ordinary non-Float32 JS inputs.
  const mid = 0.5 / 32767;
  const values = [mid - 1e-13, mid + 1e-13, -0, 1.00009, -1.00009, 0.3, -0.8, 0.6, 1];
  for (const src of [values, new Float32Array(values)]) for (const off of [false, true]) {
    const ls = off ? { "apex26.tlxPack": "0" } : {};
    const p = packer(ls, constructors), reference = packer(ls);
    const padded = new Float32Array(src.length / 3 * 4);
    for (let v = 0; v < src.length / 3; v++) padded.set(src.slice(v * 3, v * 3 + 3), v * 4);
    const expected = reference.packAttr(THREE, padded, padded.length, 4, "unit", true);
    allocations.length = 0;
    const actual = p.packAttr(THREE, src, src.length, 3, "unit", true);
    assert.deepEqual(allocations, [actual.array.byteLength], "one allocation: the final attribute, with no full-size temporary");
    assert.equal(actual.itemSize, expected.itemSize);
    assert.equal(actual.count, expected.count);
    assert.equal(actual.normalized, expected.normalized);
    assert.equal(actual.array.constructor.name, expected.array.constructor.name);
    assert.deepEqual(Array.from(actual.array), Array.from(expected.array));
    assert.equal(p.packStats.savedMB, reference.packStats.savedMB);
  }
  for (const invalid of [1.0001, -1.1, NaN, Infinity, -Infinity]) {
    const p = packer();
    const actual = p.packAttr(THREE, [invalid, 0, 1], 3, 3, "unit", true);
    assert.ok(actual.array instanceof Float32Array, "out-of-range / nonfinite normals retain the wide fallback");
    assert.deepEqual(Array.from(actual.array), [Math.fround(invalid), 0, 1, 0]);
    assert.equal(actual.itemSize, 4);
  }
});

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

test("A-W2: padded WebGL2 normals allocate only final storage and preserve narrow quantization", () => {
  const mid = 0.5 / 32767;
  const values = [mid - 1e-13, mid + 1e-13, -0, 1.00009, -1.00009, 0.3, -0.8, 0.6, 1];
  for (const src of [values, new Float32Array(values), new Float64Array(values)]) {
    const allocations = [];
    class CountedInt16Array extends Int16Array {
      constructor(...args) { super(...args); allocations.push(this.byteLength); }
    }
    const sb = { window: {}, localStorage: { getItem: () => null }, Frustum: {},
      Float32Array, Uint32Array, Uint16Array, Uint8Array, Int16Array: CountedInt16Array, Int32Array, Math };
    vm.runInNewContext(CHUNKED, sb, { filename: absSrc("js/render/three/tlx-chunked.js") });
    const p = sb.window.TLXShaders;
    const narrow = packer({ "apex26.tlxPad4": "0" }).packAttr(THREE, src, src.length, 3, "unit", false);
    const actual = p.packAttr(THREE, src, src.length, 3, "unit", false);
    assert.deepEqual(allocations, [actual.array.byteLength], "no Int16x3 temporary before widening");
    assert.equal(actual.itemSize, 4); assert.equal(actual.count, src.length / 3); assert.equal(actual.normalized, true);
    for (let v = 0; v < actual.count; v++) {
      assert.deepEqual(fetch(actual, v), [...fetch(narrow, v), 0], "same quantization, with a zero fourth lane");
    }
    assert.equal(p.packStats.small, 1); assert.equal(p.packStats.pad4, 1);
    assert.equal(p.packStats.savedMB, src.length * 2 / 1048576);
    assert.equal(p.packStats.pad4MB, src.length / 3 * 2 / 1048576);
  }
  for (const invalid of [1.00011, -1.1, NaN, Infinity, -Infinity]) {
    const p = packer(), src = [invalid, 0, 1];
    const actual = p.packAttr(THREE, src, src.length, 3, "unit", false);
    assert.ok(actual.array instanceof Float32Array, "invalid normals retain the original wide fallback");
    assert.equal(actual.itemSize, 3); assert.equal(actual.normalized, false);
    assert.deepEqual(Array.from(actual.array), Array.from(new Float32Array(src)));
    assert.equal(p.packStats.pad4, 0);
  }
  const unpacked = packer({ "apex26.tlxPack": "0" }).packAttr(THREE, values, values.length, 3, "unit", false);
  assert.equal(unpacked.itemSize, 3); assert.ok(unpacked.array instanceof Float32Array);
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
  // Only explicit WebGL2 mode widens narrow packed strides. Compare the
  // actual shader fetch so the policy survives helper extraction.
  const narrow = off.packAttr(THREE, SRC.nrm, N * 3, 3, "unit", false);
  const wide = on.packAttr(THREE, SRC.nrm, N * 3, 3, "unit", false);
  assert.equal(narrow.itemSize, 3); assert.equal(wide.itemSize, 4);
  assert.equal(stride(narrow), 6); assert.equal(stride(wide), 8);
  for (let v = 0; v < N; v++) assert.deepEqual(fetch(wide, v).slice(0, 3), fetch(narrow, v));
  for (const fmt24 of [true, undefined]) {
    const a = on.packAttr(THREE, SRC.nrm, N * 3, 3, "unit", fmt24);
    assert.equal(a.itemSize, fmt24 === true ? 4 : 3);
  }
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
    return { prepareMirrorTarget, rt: () => mirRT, rect(r) { _mirRect = r; },
      glass(lod = Infinity) { _mirGlassSeen = true; _mirGlassLod = Math.max(_mirGlassLod, lod); } };`);
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

test("perf hunt 5 F1: the cockpit glass grows the chain to its bounded LOD, not the full 9 levels", async (t) => {
  const h = await mirrorRig(t);
  h.M.rect(RECT);
  h.frame(461, 132);
  assert.equal(h.M.rt().texture.mipmaps.length, 3);
  h.M.glass(1.84);   // drawMirrorGlass at the live helmet pose (mip-footprint-lod.test.mjs)
  h.frame(461, 132);
  assert.equal(h.M.rt().texture.mipmaps.length, 4, "ceil(1.84 + 0.25) + 1 levels");
  assert.equal(h.storage.filter((n) => n > 1).at(-1), 4, "re-allocated with 4 levels, not 9");
  h.M.glass(1.2); h.frame(461, 132);
  assert.equal(h.M.rt().texture.mipmaps.length, 4, "the session max: a smaller footprint never shrinks it");
  h.M.glass(3.1); h.frame(461, 132);
  assert.equal(h.M.rt().texture.mipmaps.length, 5, "a larger one grows it");
});

test("A-H5: an UNBOUNDED glass latches the full chain; apex26.tlxMirMips=0 is the old chain, =N pins N under the glass", async (t) => {
  const h = await mirrorRig(t);
  h.M.rect(RECT);
  h.frame(461, 132);
  assert.equal(h.M.rt().texture.mipmaps.length, 3);
  h.M.glass();   // drawMirrorGlass with no bound (two straddling frames, no CPU arrays)
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
async function postRig(t, { ls = {}, samples = 0, ssrTag = false } = {}) {
  const fg = makeFakeGL(320, 180);
  const inv = [];
  fg.gl.invalidateFramebuffer = (target, list) => { inv.push([target, list.slice()]); };
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  const post = withStore(ls, () => globalThis.TLXShaders.postChain(THREE, TSL, { renderer, isMobile: true,
    chunks: globalThis.TLXShaders.chunks(THREE, TSL), shadow: null, viz: null, ssrTag, softDest: () => null,
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
// The same low sun in FRONT of the camera (sunScreen visible) but ~78 deg off axis: outside the 60 deg frustum.
/* global PostCommon */
const DAY_OFF = { ...DAY, sunDir: [0.95, 0.25, -0.2] };
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
  // B-H15: the composite taps depthAt(sunUV) only with sunUV inside [0,1]^2, so an in-front sun OFF screen keeps none.
  const offSun = PostCommon.sunScreen(DAY_OFF.sunDir, DAY_OFF.viewProj, DAY_OFF.sunColor, {});
  assert.ok(offSun.visible && offSun.flare > 0, "fixture: in front and bright, so only the screen bound decides");
  assert.ok(Math.abs(offSun.ndcx) > 1, "fixture: off screen");
  assert.equal(post.needsDepth(OFF, DAY_OFF), false, "a sun in front but off screen: the flare never taps depth");
  assert.equal(post.needsDepth({ ...OFF, ssao: 0.5 }, { ...NIGHT, invProj: null }), false, "no invProj: SSAO cannot run");
});

// B·H26-R1 (GLX twin of B-H15): GLX's present() kept the scene depth (MSAA blit, or no invalidate on the direct
// phone path) for ANY daytime sun, behind the camera included, though its composite taps texture(uDepth, uSunUV)
// only under the same three terms as TLX. Both now ask the one shared predicate.
test("B·H26-R1: PostCommon.flareTapsDepth is the composite's flare-tap guard; GLX keeps depth for the flare only through it", () => {
  const sun = (F) => PostCommon.sunScreen(F.sunDir, F.viewProj, F.sunColor, {});
  assert.equal(PostCommon.flareTapsDepth(sun(DAY)), true, "a day sun on screen: the flare taps depth");
  assert.equal(PostCommon.flareTapsDepth(sun(DAY), 0), false, "LENS FLARE 0: uFlareStr is 0, no tap");
  assert.equal(PostCommon.flareTapsDepth(sun(DAY_OFF)), false, "in front, bright, off screen: no tap");
  assert.equal(PostCommon.flareTapsDepth(sun({ ...DAY, sunDir: [0, 0.3, 0.95] })), false, "behind the camera: no tap");
  assert.equal(PostCommon.flareTapsDepth(sun(NIGHT)), false, "night: the brightness gate zeroes the flare");
  const glx = read("js/render/glx/post.js");
  assert.match(glx, /const flareMaybe = PostCommon\.flareTapsDepth\(sun, flareMul\);/);
  assert.doesNotMatch(glx, /F\.sunDir\[1\] > -0\.02/, "the any-daytime-sun gate kept depth with the sun off screen");
  assert.match(glx, /gl\.uniform1f\(compU\.uFlareStr, flareStr \* flareMul\)/, "the uniform uses the same flareMul");
  // The predicate is exact only while the GLSL tap keeps these terms (glsl-post.js composite).
  assert.match(read("js/render/glx/shaders/glsl-post.js"),
    /float sunVis = \(uFlareStr > 0\.0 && uSunUV\.x >= 0\.0 && uSunUV\.x <= 1\.0 && uSunUV\.y >= 0\.0 && uSunUV\.y <= 1\.0\)\s*\? smoothstep\(0\.9990, 0\.9999, texture\(uDepth, uSunUV\)\.r\) : 0\.0;/);
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
async function warmRig(t, { ls = {}, soft = false, noEnv = false } = {}) {
  const fg = makeFakeGL(320, 180);
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  t.after(() => renderer.dispose());   // first: a throw below must not leave three's frame loop holding the process
  const shadowSys = globalThis.TLXShaders.shadowSys(THREE, TSL, { renderer, isMobile: false, softwareGL: false, isWarming: () => false });
  const lit = globalThis.TLXShaders.lit(THREE, TSL, { chunks: globalThis.TLXShaders.chunks(THREE, TSL), shadow: null,
    ssrTag: true, envCube: null, matMaps: null, lampGrid: null, sharedUniforms: true, maxLights: 16 });
  const post = globalThis.TLXShaders.postChain(THREE, TSL, { renderer, isMobile: false,
    chunks: globalThis.TLXShaders.chunks(THREE, TSL), shadow: null, viz: null, ssrTag: true, softDest: () => null,
    softwareGL: soft, wantSpatialUpscale: () => false, getPresentSize: () => [320, 180], sceneSamples: 0 });
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
  const mk = new Function("THREE", "TSL", "renderer", "scene", "camera", "lit", "post", "shadowSys", "localStorage", "Log", "SOFT", "NOENV", `"use strict";
    let mirRT = null, mirCam = null, _mirRect = null, _mirUsed = false, _glassProbeGeo = null;
    const W = 320, H = 180, presentW = 320, presentH = 180, wantSpatialUpscale = () => false;
    const _instPerPass = true, skipBatches = () => false, _instRegistry = [], _mirOf = () => null;
    const fx = null, vizMat = null, softGpu = () => SOFT, softwareGL = SOFT, softContent = () => false;
    const pinSkyMaterial = () => {}, mintLateLit = () => {}, warmFxPrograms = async () => {}, warmLateLit = async () => {};
    const warmPlusOn = () => true, casterWarmOn = warmPlusOn, wantMirrorWarm = () => true, softOutRT = () => null;
    const I = new THREE.Matrix4().toArray();
    const _postF = { proj: I, invProj: I, invVP: I, viewProj: I, upVS: [0, 1, 0], time: 0, sunVS: [0, 0, -1], noEnv: NOENV };
    const _warmHistory = [];   // tlx.js keeps every warm's stages (B·H8 prep timeline)
    const _warmStages = { at: 0, scene: null, fx: null, post: null, shadow: null, draw: null, drawn: null, garageScene: null, total: null, attempts: 0, failed: 0 };
    let _warmAt = 0, _warmAttempts = 0, _warmPending = null, _warmRequested = false, _warmDone = false, _gpuLastOperation = "";
    ${tslice("      function prepareMirrorTarget(w, h, forWarm) {", "      // TLX opts out of the live env probe by default")}
    ${tslice("      function _mirWarmSwap() {", "      function _showInstanced(rec, order) {")}
    ${tslice("      let _ssrMrt = null;", "      let _poolNow = ")}
    ${tslice("      // A-W1 (perf hunt 4): THE DRAW WARM.", "      const ENV_PROBE_TRIES")}
    return { startProgramWarm, pending: () => _warmPending, stages: _warmStages, history: _warmHistory, mrtNode: _ssrMrtNode, mirRT: () => mirRT };`);
  const W1 = mk(THREE, TSL, renderer, scene, camera, lit, post, shadowSys, { getItem: (k) => (k in ls ? ls[k] : null) },
    globalThis.Log, soft, noEnv);
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
  assert.equal(h.W1.history.length, 1, "the warm left one stage record in the history (memState().warm.history)");
  assert.equal(h.W1.history[0].total, h.W1.stages.total, "the record is this warm's own stages");
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
  assert.ok(off.calls.length > 0, "=0: no A-W1 draw stage, but post warm scissor-draws RT passes on hardware");
  assert.equal(off.W1.stages.drawn, null);
});

// Execute the production uniform derivation with its real uniform defaults;
// this tests CPU illumination inputs, not the shader's per-ray If branches.
function skyDeriveHarness() {
  const source = read("js/render/three/tsl-sky.js");
  const uniforms = source.slice(source.indexOf("    const U = {"), source.indexOf("    const C = ctx"));
  const helpers = source.slice(source.indexOf("    const sstep ="), source.indexOf("    function derive()"));
  const context = vm.createContext({ THREE, uniform: (value) => ({ value }), C: null });
  vm.runInContext(uniforms + helpers + fnSource(source, "function derive()") +
    "\n;globalThis.api = { U, D, derive };", context, { filename: absSrc("js/render/three/tsl-sky.js") });
  return (stars, y) => {
    const { U, D, derive } = context.api;
    U.stars.value = stars;
    U.sunDir.value.set(Math.sqrt(1 - y * y), y, 0);
    U.cloud.value = 1;
    // The same cool authored sky isolates the phase treatment from palettes.
    U.zenith.value.set(0.01, 0.02, 0.05);
    U.horizon.value.set(0.04, 0.03, 0.06);
    derive();
    return { mie: D.mieK.value, horizonGlow: D.hGlowCol.value.toArray(),
      zenith: D.zenithO.value.toArray(), horizon: D.horizonO.value.toArray(),
      daytime: D.daytime.value };
  };
}

test("sky derivation suppresses solar scattering for low and high night moon keys", () => {
  const derive = skyDeriveHarness();
  const low = derive(1, 0.214), high = derive(1, 0.8);
  for (const night of [low, high]) {
    assert.equal(night.mie, 0, "solar Mie must not follow the moon key");
    assert.deepEqual(night.horizonGlow, [0, 0, 0], "solar horizon glow must not follow the moon key");
  }
  assert.deepEqual(low.zenith, high.zenith, "night lid is independent of moon elevation");
  assert.deepEqual(low.horizon, high.horizon);
  const solar = derive(0, 0.214);
  assert.ok(solar.mie > 0, "low solar elevation still scatters by day");
  assert.ok(solar.horizonGlow.some((v) => v > 0));
});

test("overcast sky targets grow continuously from twilight illumination to daylight", () => {
  const derive = skyDeriveHarness();
  const phases = [0.08, 0.28, 0.34, 0.40, 0.8].map((y) => derive(0, y));
  const lum = (c) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  for (let i = 1; i < phases.length; i++) {
    assert.ok(lum(phases[i].zenith) >= lum(phases[i - 1].zenith), "cloudy zenith must not dim as daylight grows");
    assert.ok(lum(phases[i].horizon) >= lum(phases[i - 1].horizon), "cloudy horizon must not dim as daylight grows");
  }
  assert.ok(lum(phases[0].zenith) < 0.6 * lum(phases.at(-1).zenith), "twilight must not inherit the midday grey target");
  assert.ok(lum(phases[0].horizon) < 0.6 * lum(phases.at(-1).horizon));
  assert.equal(phases.at(-1).daytime, 1);
  assert.ok(phases.some((p) => p.daytime > 0 && p.daytime < 1), "fixture exercises the smooth transition");
});

// B·H16 (2026-10-21): a garage/menu frame sets noEnv and keeps proj (SSAO), and present() then paints WITHOUT post
// (`post && _postF.proj && !_postF.noEnv`). The warm took post for it anyway, so it compiled every program into the
// tagged scene target and the title prebuild's hidden garage frame re-linked them all on the main thread (3.8–5.8 s
// long task at 4x CPU, getProgramParameter LINK_STATUS). SwiftShader WebGPU then paid ~3× for a post-only warm that
// skipped the garage target — run the full post warm first, then stamp softOutRT (MRT null) for the garage frame.
test("garage warm: noEnv runs post warm then a garage-scene compile on softOutRT (MRT null), no draw stage", async (t) => {
  const spy = (rig) => {
    const seen = [], base = rig.renderer.compileAsync.bind(rig.renderer);
    rig.renderer.compileAsync = (sc, cam, ...rest) => { seen.push({ tg: rig.renderer.getRenderTarget(), mrt: rig.renderer.getMRT() }); return base(sc, cam, ...rest); };
    return seen;
  };
  const h = await warmRig(t, { noEnv: true });
  const compiles = spy(h);
  await h.warm();
  assert.equal(h.W1.stages.failed, 0, "the warm did not throw");
  assert.ok(compiles.length >= 2, "post warm and garage-scene compile both ran");
  assert.equal(compiles[0].tg, h.post.sceneTarget(), "first pass warms the race post path");
  const garageCompile = compiles[compiles.length - 1];
  assert.notEqual(garageCompile.tg, h.post.sceneTarget(), "garage pass never the post scene target");
  assert.equal(garageCompile.mrt, null, "garage pass: no ssrTag MRT");
  assert.ok(Number.isFinite(h.W1.stages.garageScene) && h.W1.stages.garageScene >= 0, "garageScene stage timed");
  const sceneRT = h.post.sceneTarget();
  assert.ok(h.calls.some((c) => c.tg === sceneRT), "the post pass may run the draw warm into the scene target");
  assert.equal(h.calls.filter((c) => !c.tg).length, 0, "draw warm never targets softOutRT — the garage pass is compile-only");
  const race = await warmRig(t);
  const raceCompiles = spy(race);
  await race.warm();
  assert.equal(raceCompiles[0].tg, race.post.sceneTarget(), "a race frame (noEnv unset) still warms through post");
  assert.equal(raceCompiles[0].tg, race.post.sceneTarget(), "race warm compiles the scene into the post target");
});

function cloudCacheHarness() {
  const source = read("js/render/three/tsl-sky.js");
  const block = source.slice(source.indexOf("    let cacheWarmPending"), source.indexOf("    derive();", source.indexOf("    let cacheWarmPending")));
  let renderer;
  const events = [], resources = Array.from({ length: 4 }, (_, i) => ({ texture: {}, dispose() {
    assert.ok(!resources.slice(0, 2).includes(renderer.getRenderTarget()), "cache retirement must not destroy a bound cache target");
    events.push("dispose" + i);
  } }));
  const C = { rts: resources.slice(0, 2), geo: resources[2], mat: resources[3], dead: false, filling: true, band: 0, N_BANDS: 4, front: 0, F: { y0: {}, y1: {} } };
  const D = { cacheOn: { value: 1 } }, U = { cloud: { value: 1 } };
  const context = vm.createContext({ C, D, U });
  vm.runInContext(block + "\n;globalThis.api={cacheStep,cacheWarm,dispose};", context);
  renderer = { target: "original", mrt: "mrt", autoClear: true,
    getRenderTarget() { return this.target; }, getMRT() { return this.mrt; },
    setRenderTarget(t) { this.target = t; events.push("target:" + (typeof t === "string" ? t : "cache")); },
    setMRT(t) { this.mrt = t; events.push("mrt:" + t); },
    render() { throw new Error("cache failed"); },
  };
  return { api: context.api, renderer, events, C, D };
}

test("failed cloud cache restores render state before retiring optional resources once", () => {
  const h = cloudCacheHarness(); assert.throws(() => h.api.cacheStep(h.renderer), /cache failed/);
  assert.equal(h.renderer.autoClear, true); assert.equal(h.D.cacheOn.value, 0);
  assert.ok(h.events.indexOf("mrt:mrt") < h.events.indexOf("dispose0"));
  h.api.dispose(); h.api.dispose(); h.api.cacheStep(h.renderer);
  assert.equal(h.events.filter((e) => e.startsWith("dispose")).length, 4);
});

test("failed cloud cache defers retirement until an in-flight compile releases it", async () => {
  const h = cloudCacheHarness(); let settle;
  h.renderer.compileAsync = () => new Promise((r) => { settle = r; });
  const pending = h.api.cacheWarm(h.renderer);
  assert.throws(() => h.api.cacheStep(h.renderer), /cache failed/); h.api.dispose();
  assert.equal(h.events.filter((e) => e.startsWith("dispose")).length, 0);
  settle(); await pending;
  assert.equal(h.events.filter((e) => e.startsWith("dispose")).length, 4);
});


test("cloud retirement still flushes after a rejected compile and individual dispose errors", async () => {
  const h = cloudCacheHarness(); let reject;
  h.renderer.compileAsync = () => new Promise((_, r) => { reject = r; });
  h.C.rts[0].dispose = () => { h.events.push("dispose0"); throw new Error("already lost"); };
  const pending = h.api.cacheWarm(h.renderer); const rejected = assert.rejects(pending, /compile rejected/);
  h.api.dispose(); reject(new Error("compile rejected")); await rejected;
  assert.equal(h.events.filter((e) => e.startsWith("dispose")).length, 4);
  h.api.dispose(); assert.equal(h.events.filter((e) => e.startsWith("dispose")).length, 4);
});


for (const rejected of [false, true]) test(`cloud warm restores target and MRT before retirement (rejected=${rejected})`, async () => {
  const h = cloudCacheHarness(); let finish;
  h.renderer.compileAsync = () => new Promise((resolve, reject) => { finish = () => rejected ? reject(new Error("compile rejected")) : resolve(); });
  const pending = h.api.cacheWarm(h.renderer);
  const outcome = rejected ? assert.rejects(pending, /compile rejected/) : pending;
  assert.equal(h.renderer.target, h.C.rts[1]); assert.equal(h.renderer.mrt, null);
  h.api.dispose(); finish(); await outcome;
  assert.equal(h.renderer.target, "original"); assert.equal(h.renderer.mrt, "mrt");
  assert.ok(h.events.indexOf("target:original") < h.events.indexOf("dispose0"));
  assert.ok(h.events.indexOf("mrt:mrt") < h.events.indexOf("dispose0"));
  h.api.dispose(); assert.equal(h.events.filter((e) => e.startsWith("dispose")).length, 4);
});

test("stale cloud warm releases resources without overwriting a successor renderer target", async () => {
  const h = cloudCacheHarness(); let finish;
  h.renderer.compileAsync = () => new Promise((resolve) => { finish = resolve; });
  const pending = h.api.cacheWarm(h.renderer); h.api.dispose();
  h.renderer.setRenderTarget("successor"); h.renderer.setMRT("successor-mrt");
  finish(); await pending;
  assert.equal(h.renderer.target, "successor"); assert.equal(h.renderer.mrt, "successor-mrt");
  assert.equal(h.events.filter((e) => e.startsWith("dispose")).length, 4);
});

// ── A-P2 (phoneperf 2026-10-24): the ssrTag attachment, discarded like the depth ─────────────────────
test("A-P2: needsTag — the composite's SSR gate and the haze plume are the tag's only readers", async (t) => {
  const { post } = await postRig(t, { ssrTag: true });
  assert.equal(post.needsTag(OFF, NIGHT), false, "dry, carReflect 0, no haze: unread");
  assert.equal(post.needsTag({ ...OFF, reflect: 0.3 }, NIGHT), true, "wet road SSR reads it");
  assert.equal(post.needsTag({ ...OFF, carReflect: 0.2 }, NIGHT), true, "car-paint SSR reads it");
  assert.equal(post.needsTag({ ...OFF, reflect: 0.3 }, { ...NIGHT, upVS: null }), false, "ssrOk 0 (no view basis): the If never runs");
  assert.equal(post.needsTag({ ...OFF, haze: { u: 0.5, v: 0.5, str: 0.4 } }, NIGHT), true, "the plume's car mask reads it");
  assert.equal(post.needsTag({ ...OFF, haze: { u: 0.5, v: 0.5, str: 0.001 } }, NIGHT), false, "below the shader's 0.002 gate");
  assert.equal(post.needsTag({ ...OFF, carReflect: undefined, tune: { carReflect: 0.35 } }, NIGHT), true, "the knob default counts, as in needsDepth");
});

test("A-P2: WebGL2 invalidates depth AND the tag after a dry phone scene pass; a reader keeps the tag", async (t) => {
  const h = await postRig(t, { ssrTag: true });
  assert.equal(h.post.state().attachments, 2);
  assert.deepEqual(h.scenePass(OFF, NIGHT), { keep: false, dropped: true });
  assert.equal(h.inv.length, 1, "one invalidate call carries both");
  assert.deepEqual(h.inv[0][1], [h.gl.DEPTH_ATTACHMENT, h.gl.COLOR_ATTACHMENT1]);
  assert.deepEqual(h.post.state().tag, { discard: true, kept: false, discards: 1 });
  h.scenePass({ ...OFF, reflect: 0.4 }, NIGHT);   // wet: SSR reads depth and the tag
  assert.equal(h.inv.length, 1, "nothing invalidated on a frame that reads both");
  assert.equal(h.post.state().tag.kept, true);
  h.scenePass({ ...OFF, ssao: 0.5 }, NIGHT);      // SSAO reads depth only: the tag still goes
  assert.deepEqual(h.inv[1][1], [h.gl.COLOR_ATTACHMENT1], "tag alone");
  assert.deepEqual(h.post.state().depth.kept, true);
  const knob = await postRig(t, { ssrTag: true, ls: { "apex26.tlxTagDiscard": "0" } });
  knob.scenePass(OFF, NIGHT);
  assert.deepEqual(knob.inv[0][1], [knob.gl.DEPTH_ATTACHMENT], "apex26.tlxTagDiscard=0: depth only, the tag always kept");
  const one = await postRig(t, { ssrTag: false });
  one.scenePass(OFF, NIGHT);
  assert.deepEqual(one.inv[0][1], [one.gl.DEPTH_ATTACHMENT], "a one-attachment chain never names an attachment it lacks");
});

test("A-P2: discardAttachments acts only on the FBO three has bound; the mirror hands it depth + tag", async (t) => {
  const h = await postRig(t, { ssrTag: true });
  const rt = h.post.sceneTarget();
  h.renderer.setRenderTarget(rt);
  h.renderer.render(new THREE.Scene(), new THREE.PerspectiveCamera());
  assert.equal(h.post.discardAttachments(rt, [h.gl.DEPTH_ATTACHMENT]), true);
  assert.deepEqual(h.inv.at(-1), [h.gl.DRAW_FRAMEBUFFER, [h.gl.DEPTH_ATTACHMENT]]);
  h.renderer.backend.state.bindFramebuffer(h.gl.FRAMEBUFFER, null);   // setRenderTarget(null) alone binds nothing until the next render
  assert.equal(h.post.discardAttachments(rt, [h.gl.DEPTH_ATTACHMENT]), false, "another FBO bound: no guess");
  assert.equal(h.post.discardAttachments(rt, []), false);
  assert.match(TLX, /renderer\.render\(scene, mirCam\); \} finally \{ if \(mrt\) _mirMrtArm\(false, prevMrt\); if \(hinted\) post\.discardHintOff\(mirRT\); \}\s*\n[^\n]*\n[^\n]*\n\s*if \(hinted \|\| \(post && post\.discardAttachments && post\.discardAttachments\(mirRT, _mirInv\(mrt\)\)\)\) _mirDiscards\+\+;/,
    "tlx.js: the mirror discards right after its render, before anything else binds");
  assert.match(TLX, /return mrt \? _mirInvDT : _mirInvD;/, "tag only when the mirror target carries one");
});

// ── A-P2W (#3681): the WebGPU twin — vendored three patch 17 reads rt.apexDiscardColor / apexDiscardDepth at
// beginRender, so the decision rides on the target BEFORE the pass and comes off after it. The fake GL cannot
// run three's WebGPU backend; the backend flag is flipped after the chain is built, and the pass is depthBegin →
// (what beginRender would read) → depthEnd, with no draw in between.
function gpuPass(h, opts, F) {
  const rt = h.post.sceneTarget(), bk = h.renderer.backend;
  bk.isWebGPUBackend = true;
  try {
    const keep = h.post.depthBegin(opts, F);
    const seen = { color: rt.apexDiscardColor | 0, depth: rt.apexDiscardDepth === true };
    const dropped = h.post.depthEnd();
    return { keep, seen, dropped, after: { color: rt.apexDiscardColor | 0, depth: rt.apexDiscardDepth === true } };
  } finally { delete bk.isWebGPUBackend; }
}

test("A-P2W: WebGPU — a dry phone pass hints depth + tag discard before the pass and clears it after", async (t) => {
  const h = await postRig(t, { ssrTag: true });
  const r = gpuPass(h, OFF, NIGHT);
  assert.deepEqual(r.seen, { color: 2, depth: true }, "bit 1 = the ssrTag attachment; the depth");
  assert.equal(r.dropped, true);
  assert.deepEqual(r.after, { color: 0, depth: false }, "off after the pass: a later render into the target stores");
  assert.equal(h.inv.length, 0, "no WebGL invalidate on the WebGPU leg");
  assert.equal(h.post.state().tag.discards, 1); assert.equal(h.post.state().depth.discards, 1);
  assert.deepEqual(gpuPass(h, { ...OFF, reflect: 0.4 }, NIGHT).seen, { color: 0, depth: false }, "wet: SSR reads both, nothing hinted");
  assert.deepEqual(gpuPass(h, { ...OFF, ssao: 0.5 }, NIGHT).seen, { color: 2, depth: false }, "SSAO reads depth: the tag alone");
});

test("A-P2W: the A/B switches gate the WebGPU hint; MSAA and a one-attachment chain never hint what they lack", async (t) => {
  const tag0 = await postRig(t, { ssrTag: true, ls: { "apex26.tlxTagDiscard": "0" } });
  assert.deepEqual(gpuPass(tag0, OFF, NIGHT).seen, { color: 0, depth: true }, "tlxTagDiscard=0: the tag is stored");
  const dep0 = await postRig(t, { ssrTag: true, ls: { "apex26.tlxDepthDiscard": "0" } });
  assert.deepEqual(gpuPass(dep0, OFF, NIGHT).seen, { color: 2, depth: false }, "tlxDepthDiscard=0: the depth is stored");
  const one = await postRig(t, { ssrTag: false });
  assert.deepEqual(gpuPass(one, OFF, NIGHT).seen, { color: 0, depth: true }, "one attachment: no tag bit");
  const msaa = await postRig(t, { ssrTag: true, samples: 4 });
  assert.deepEqual(gpuPass(msaa, OFF, NIGHT).seen, { color: 0, depth: false }, "MSAA: single-sample hint only (r186's storeMultisampled* owns MSAA)");
});

test("A-P2W: discardHint is a no-op off WebGPU", async (t) => {
  const h = await postRig(t, { ssrTag: true });
  const rt = h.post.sceneTarget();
  assert.equal(h.post.discardHint(rt, 2, true), false, "WebGL2 leg: the invalidate path owns it");
  assert.equal(rt.apexDiscardColor, undefined);
});

// ── phoneperf 2026-10-24: scene colour R11F_G11F_B10F on phones where renderable (KNOWN-WINS row 15) ───────
// Own rig (postRig above is pinned to a one-attachment phone chain by the A-P1 tests): the real post chain over the
// fake WebGL2, which exposes EXT_color_buffer_float, so the 11/11/10 format is renderable here as on a phone GPU.
async function rig11(t, { ls = {}, isMobile = true, ssrTag = true, wgpu = false } = {}) {
  const fg = makeFakeGL(320, 180);
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  if (wgpu) renderer.backend.isWebGPUBackend = true;   // the gate reads this flag; nothing else in the chain's construction does
  const post = withStore(ls, () => globalThis.TLXShaders.postChain(THREE, TSL, { renderer, isMobile,
    chunks: globalThis.TLXShaders.chunks(THREE, TSL), shadow: null, viz: null, ssrTag, softDest: () => null,
    wantSpatialUpscale: () => false, getPresentSize: () => [320, 180], sceneSamples: 0 }));
  post.resize(320, 180);
  t.after(() => { post.dispose(); renderer.dispose(); });
  return { post, renderer, gl: fg.gl };
}

test("scene11: WebGL2 keeps RGBA16F on every path (the 2026-10-25 revert of #3690's WebGL2 leg)", async (t) => {
  // Device Farm iPhone 14 WebGL2: rg11b10 42.5 fps vs RGBA16F 45.7 / 47.0; 55 vs 13-19 frames over 33 ms.
  for (const [name, o] of [["phone", {}], ["phone, forced on", { ls: { "apex26.tlxScene11": "1" } }],
    ["one-attachment phone", { ssrTag: false }], ["desktop, forced on", { isMobile: false, ls: { "apex26.tlxScene11": "1" } }]]) {
    const h = await rig11(t, o);
    assert.equal(h.post.sceneTarget().textures[0].type, THREE.HalfFloatType, name + ": scene colour is RGBA16F");
    assert.equal(h.post.state().sceneFormat, "rgba16f", name);
    assert.equal(h.post.hdrOk(), true);
  }
});

test("scene11: the WebGPU leg keeps its rg11b10 phone default (vendored patch 18, #3711); the tag attachment stays half float", async (t) => {
  const h = await rig11(t, { wgpu: true });
  const rt = h.post.sceneTarget();
  assert.equal(rt.textures[0].type, THREE.UnsignedInt101111Type);
  assert.equal(rt.textures[0].format, THREE.RGBFormat);
  assert.equal(rt.textures[1].type, THREE.HalfFloatType, "attachment 1 (ssrTag) keeps the chain's hdrType");
  assert.equal(h.post.state().sceneFormat, "rg11b10");
  assert.equal(h.post.hdrOk(), true, "the scene is still float HDR to every reader");
  const off = await rig11(t, { wgpu: true, ls: { "apex26.tlxScene11": "0" } });
  assert.equal(off.post.sceneTarget().textures[0].type, THREE.HalfFloatType, "apex26.tlxScene11=0 keeps RGBA16F");
  const desk = await rig11(t, { wgpu: true, isMobile: false });
  assert.equal(desk.post.sceneTarget().textures[0].type, THREE.HalfFloatType, "desktop keeps RGBA16F by default");
  const deskOn = await rig11(t, { wgpu: true, isMobile: false, ls: { "apex26.tlxScene11": "1" } });
  assert.equal(deskOn.post.sceneTarget().textures[0].type, THREE.UnsignedInt101111Type, "=1 forces it on the WebGPU leg");
  const one = await rig11(t, { wgpu: true, ssrTag: false });
  assert.equal(one.post.sceneTarget().textures[0].type, THREE.UnsignedInt101111Type, "a one-attachment chain too");
  const bloomOff = await rig11(t, { wgpu: true, ls: { "apex26.tlxBloom11": "0" } });
  assert.equal(bloomOff.post.sceneTarget().textures[0].type, THREE.UnsignedInt101111Type, "the bloom knob does not reach the scene target");
  const post = read("js/render/three/tlx-post.js");
  assert.ok(post.includes("const _r11Blendable = r11Renderable && !!(renderer.backend && renderer.backend.isWebGPUBackend);"), "the gate reads the backend kind");
});

test("scene11: the probe is read before the bloom knob, and no post reader samples scene alpha", () => {
  const post = read("js/render/three/tlx-post.js");
  assert.ok(post.includes("const r11Renderable = bloom11 && hdr && THREE.UnsignedInt101111Type != null && THREE.RGBFormat != null;"), "the probe is its own const");
  assert.ok(post.indexOf("const r11Renderable") < post.indexOf('localStorage.getItem("apex26.tlxBloom11")'), "the probe is read before the bloom knob can clear it");
  const tslPost = read("js/render/three/tsl-post.js");
  assert.ok(!/sceneT\.sample\([^)]*\)\)?\.[aw]\b/.test(tslPost) && !/\bscn\.[aw]\b/.test(tslPost), "scene alpha is never read: RGB-only storage is lossless for the composite");
});

// ── #2649 phone bandwidth trims: godray11 counted oracle, shadow r187 gate, FB-invalidate canaries ─────────────
// Godray present needs a shadow stub with S.enabled (sun shafts) and aoFold off so rg11b10 is allowed.
async function godrayRig(t, { ls = {}, wgpu = true, aoFold = "0" } = {}) {
  const store = { "apex26.tlxAoFold": aoFold, ...ls };
  const fg = makeFakeGL(320, 180);
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  if (wgpu) renderer.backend.isWebGPUBackend = true;
  const identity = new THREE.Matrix4().elements;
  const shadow = { sunTex: new THREE.DepthTexture(1, 1),
    S: { enabled: true, lightVP: identity, lampLightVP: identity, lampArmed: false, lampIdx: -1 } };
  const post = withStore(store, () => globalThis.TLXShaders.postChain(THREE, TSL, { renderer, isMobile: true,
    chunks: globalThis.TLXShaders.chunks(THREE, TSL), shadow, viz: null, ssrTag: false, softDest: () => null,
    wantSpatialUpscale: () => false, getPresentSize: () => [320, 180], sceneSamples: 0 }));
  post.resize(320, 180);
  t.after(() => { post.dispose(); renderer.dispose(); });
  const frame = { invProj: identity, proj: identity, invVP: identity, viewProj: identity,
    eye: [0, 0, 0], sunDir: [0, 1, 0], sunColor: [1, 1, 1], time: 0, cloud: 0 };
  return { post, frame, present: (opts) => post.present(opts, frame) };
}

test("godray11: default stays rgba16f; knob halves pair bytes on unfolded WebGPU frames", async (t) => {
  const off = await godrayRig(t);
  off.present({ ssao: 0, contact: 0, godray: 0.8, bloom: 0, reflect: 0, carReflect: 0, mist: 0 });
  const s0 = off.post.state();
  assert.equal(s0.formats.godray, "rgba16f", "default: RGBA16F (AO fold may need alpha)");
  assert.equal(s0.godray11, false);
  assert.equal(s0.godrayPairBytes, 160 * 90 * 8 * 2, "half of 320×180, 8 B/px, two targets");

  const on = await godrayRig(t, { ls: { "apex26.tlxGodray11": "1" }, aoFold: "0" });
  on.present({ ssao: 0, contact: 0, godray: 0.8, bloom: 0, reflect: 0, carReflect: 0, mist: 0 });
  const s1 = on.post.state();
  assert.equal(s1.formats.godray, "rg11b10", "knob + unfolded + WebGPU renderable → rg11b10");
  assert.equal(s1.godray11, true);
  assert.equal(s1.godrayPairBytes, 160 * 90 * 4 * 2, "counted oracle: half the colour bytes");
  assert.equal(s1.godrayPairBytes * 2, s0.godrayPairBytes, "4 B/px is half of RGBA16F's 8");
});

test("godray11: a folded AO frame keeps RGBA16F even with the knob (alpha carries AO)", async (t) => {
  const h = await godrayRig(t, { ls: { "apex26.tlxGodray11": "1" }, aoFold: "1" });
  // Both AO and godray live → D7 fold writes AO into godray alpha; ensureGR(false).
  h.present({ ssao: 0.5, contact: 0, godray: 0.8, bloom: 0, reflect: 0, carReflect: 0, mist: 0 });
  const s = h.post.state();
  assert.equal(s.formats.godray, "rgba16f");
  assert.equal(s.godray11, false);
  assert.equal(s.godrayPairBytes, 160 * 90 * 8 * 2);
});

test("godray11: WebGL2 leg never takes rg11b10 (scene11 / bloom11 WebGPU-only gate)", async (t) => {
  const h = await godrayRig(t, { ls: { "apex26.tlxGodray11": "1" }, wgpu: false, aoFold: "0" });
  h.present({ ssao: 0, contact: 0, godray: 0.8, bloom: 0, reflect: 0, carReflect: 0, mist: 0 });
  assert.equal(h.post.state().formats.godray, "rgba16f");
  assert.equal(h.post.state().godray11, false);
});

test("shadow depth-only on r187: no colour attachment on the phone maps, PCSS keeps R32F (#34782, #2649)", async (t) => {
  // The base tree (three r186) carries an R8 attachment: depthOnly false, 1024² colour bytes on a phone sun map.
  assert.equal(+(THREE.REVISION || 0) >= 187, true, "vendored three is r187+");
  const fg = makeFakeGL(64, 64);
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  t.after(() => renderer.dispose());
  const phone = globalThis.TLXShaders.shadowSys(THREE, TSL, { renderer, isMobile: true, softwareGL: false, isWarming: () => false });
  assert.equal(phone.S.depthOnly, true);
  assert.equal(phone.S.sunColorBytes, 0, "phone 1024² sun map: 0 colour bytes (r186: 1,048,576)");
  assert.equal(!!phone.sunTex, true, "the lit pass still samples the depth texture");
  // The drawWarm path builds its probe targets through the same factory, and a pass renders into one.
  assert.doesNotThrow(() => phone.drawWarm());
});

test("FB-invalidate audit: depthEnd / discardAttachments / discardHint stay on the live post chain", async (t) => {
  const { post } = await postRig(t, { ssrTag: true });
  assert.equal(typeof post.depthEnd, "function");
  assert.equal(typeof post.depthBegin, "function");
  assert.equal(typeof post.discardAttachments, "function");
  assert.equal(typeof post.discardHint, "function");
  assert.equal(typeof post.needsDepth, "function");
  // Dry night frame: depth discarded (A-P1 already covers the invalidate path).
  const r = (await postRig(t)).scenePass(OFF, NIGHT);
  assert.equal(r.keep, false);
  assert.equal(r.dropped, true);
});
