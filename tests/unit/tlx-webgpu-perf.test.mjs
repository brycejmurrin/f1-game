/* TLX WebGPU perf pass (2026-10-30, docs/notes/TLX-WEBGPU-PERF-2026-10-30.md). No browser, no GPU: the REAL vendored
 * three r186 (its WebGPU attribute utility, and WebGPURenderer over the no-op WebGL2 for the post chain) driving the REAL
 * tlx-chunked / tsl-lit / tsl-fx / tlx-post code. Each test counts the work a fix removes; a unit test of a backend is
 * not evidence it runs (the follow-up is gpu-census.yml on macos-latest: Chromium/Dawn on Metal, not WebKit).
 *   W1  mergeVisible's index on WebGPU: a Uint16 merge carries the vendor's narrow-index mark (PATCHES §20), so a changed
 *       visible set uploads ITS indices — unmarked, three swapped in a Uint32 copy and every later set re-sent the first
 *   W2  a widening view regrows the merge index O(log) times with headroom and releases each outgrown one
 *   W3  the sun/lamp passes cast a chunked record's visible chunks as ONE merged caster (tlx.js castShadowChunked)
 *   W4  setSsrMrt with an unchanged state walks no material (tsl-lit, tsl-fx)
 *   W5  frame-varying uniforms nothing reads skip their write: hazeTime with no haze, godray time on a clear sky
 *   (round 3, three r187, docs/notes/TLX-WEBGPU-PERF-3-2026-10-30.md)
 *   W6  the draw warm compiles the canvas passes, both sides of the upscale switch: the live present builds none
 *   W7  the sky cache's bake pipeline is warmed by a draw keyed like cacheStep's (no depth), not only by a compile */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { vendorModule, bindImports } from "../helpers/vendor-class.mjs";
import { makeFakeGL, installThreeGlobals } from "../helpers/fake-webgl2.mjs";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

installThreeGlobals();
globalThis.Log = globalThis.Log || { info() {}, warn() {}, error() {}, debug() {} };
const VENDOR = "vendor/three-0.187.0/three.webgpu.min.js";
const THREE = await import(pathToFileURL(path.join(ROOT, VENDOR)).href);
const CORE = await import(pathToFileURL(path.join(ROOT, "vendor/three-0.187.0/three.core.min.js")).href);
const TSL = THREE.TSL;
for (const f of ["js/render/shared/light-budget.js", "js/lighting/knobs.js", "js/render/shared/post-common.js",
  "js/render/three/tsl-chunks.js", "js/render/three/tsl-lit.js", "js/render/three/tsl-fx.js",
  "js/render/three/tsl-post.js", "js/render/three/tlx-post.js"])
  vm.runInThisContext(read(f), { filename: absSrc(f) });

// The actual generated WebGPUAttributeUtils (and the module-level writeBufferAligned r187 calls) over a byte-model queue.
const vmod = vendorModule(read(VENDOR));
const { code: utilsCode, imports: utilsImports } = vmod.closure([vmod.classWith("createAttribute", "updateAttribute", "getVertexBufferLayout")]);
const uctx = { Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Float32Array,
  GPUBufferUsage: { INDEX: 16, VERTEX: 32, STORAGE: 128 }, ...bindImports(utilsImports, THREE, CORE) };
const AttributeUtils = vm.runInNewContext(`${utilsCode};${vmod.classWith("createAttribute", "updateAttribute", "getVertexBufferLayout").id.name}`, uctx, { filename: absSrc(VENDOR) });
function gpu() {
  const data = new WeakMap(), bufs = new Map();
  const backend = {
    get(a) { if (!data.has(a)) data.set(a, {}); return data.get(a); },
    getBufferAttribute: (a) => (a.isInterleavedBufferAttribute ? a.data : a),   // r187 WebGPUBackend
    device: {
      createBuffer(d) { const bytes = new Uint8Array(d.size); return { bytes, getMappedRange: () => bytes.buffer, unmap() {}, destroy() {} }; },
      queue: { writeBuffer(b, off, arr, start = 0, count = arr.length - start) {
        out.written += count * arr.BYTES_PER_ELEMENT;
        b.bytes.set(new Uint8Array(arr.buffer, arr.byteOffset + start * arr.BYTES_PER_ELEMENT, count * arr.BYTES_PER_ELEMENT), off);
      } },
    },
  };
  const utils = new AttributeUtils(backend);
  const out = {
    written: 0,   // bytes through queue.writeBuffer
    // What three's Attributes.update does for an INDEX attribute: create once, then upload on a version bump.
    sync(attr) {
      const d = backend.get(attr);
      if (d.buffer === undefined) { utils.createAttribute(attr, 16); d.v = attr.version; bufs.set(attr, d); return; }
      if (d.v < attr.version) { utils.updateAttribute(attr); d.v = attr.version; }
    },
    // The `n` indices from `at` the GPU buffer behind `attr` holds, decoded at the width it was created with.
    decode(attr, n, at = 0) { const d = backend.get(attr); return Array.from(new attr.array.constructor(d.buffer.bytes.buffer)).slice(at, at + n); },
  };
  return out;
}

function chunkedSys(over = {}) {
  const sandbox = { window: {}, localStorage: { getItem: () => null }, Frustum: {},
    Float32Array, Uint32Array, Uint16Array, Uint8Array, Int16Array, Int32Array, Array, Map, Math };
  vm.createContext(sandbox);
  seedLog(sandbox);
  vm.runInContext(read("js/render/shared/chunk-bins.js").replace(/^const\b/gm, "var"), sandbox, { filename: absSrc("js/render/shared/chunk-bins.js") });
  vm.runInContext(read("js/render/three/tlx-chunked.js"), sandbox, { filename: absSrc("js/render/three/tlx-chunked.js") });
  return sandbox.window.TLXShaders.chunked(THREE, { isWebGPU: () => true, releaseGeometry() {}, ...over });
}
// A chunked record as tlx-chunked builds one: shared attributes, one marked Uint16 index per chunk (packIndex).
function record(nChunks, triPer = 1) {
  const pos = new THREE.BufferAttribute(new Float32Array(nChunks * triPer * 9), 3);
  const chunks = [];
  for (let c = 0; c < nChunks; c++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", pos);
    const idx = new Uint16Array(triPer * 3);
    for (let k = 0; k < idx.length; k++) idx[k] = c * triPer * 3 + k;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.index.__apexUint16Index = true;
    chunks.push({ geo: g, min: [c, 0, 0], max: [c + 1, 1, 1], wrap: { __tlx: true, geo: g } });
  }
  return { __tlx: true, chunked: true, chunks };
}
const merge = (sys, mesh, ids, slot = 0) => {
  for (let i = 0; i < ids.length; i++) sys.visList[i] = mesh.chunks[ids[i]];
  return sys.mergeVisible(mesh, ids.length, slot);
};
const want = (mesh, ids) => ids.flatMap((c) => Array.from(mesh.chunks[c].geo.index.array));

test("W1: a changed visible set reaches the GPU index buffer on WebGPU (the merge index stays the array it writes)", () => {
  const sys = chunkedSys(), mesh = record(8), q = gpu();
  const g = merge(sys, mesh, [0, 1, 2, 3]);
  const attr = g.index;
  assert.equal(attr.__apexUint16Index, true, "the vendor's narrow-index opt-in, like every chunk index");
  q.sync(attr);
  assert.equal(attr.array.constructor, Uint16Array, "three kept the Uint16 array (unmarked it was swapped for a Uint32 copy)");
  assert.deepEqual(q.decode(attr, 12, g.drawRange.start), want(mesh, [0, 1, 2, 3]));
  for (const ids of [[4, 5, 6, 7], [7, 0, 3], [2, 6]]) {
    assert.equal(merge(sys, mesh, ids), g, "same slot geometry");
    assert.equal(g.index, attr, "no regrowth: the set shrank or held");
    q.sync(attr);
    assert.deepEqual(q.decode(attr, ids.length * 3, g.drawRange.start), want(mesh, ids), `GPU holds set ${ids}, not the first set`);
    assert.equal(g.drawRange.count, ids.length * 3);
  }
});

// GPU hunt 3 (#4272 item 3): the set sliding one chunk along the arc, through the vendor's Uint16 writeBuffer path.
test("W1: a one-chunk slide of the visible set writes that chunk's bytes, not the set after the first change", () => {
  const sys = chunkedSys(), mesh = record(40, 100), q = gpu();
  const span = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
  const g = merge(sys, mesh, span(5, 25));
  q.sync(g.index);
  for (const [a, b, bytes] of [[6, 26, 600], [5, 25, 0], [4, 24, 600]]) {
    const w0 = q.written;
    merge(sys, mesh, span(a, b)); q.sync(g.index);
    assert.equal(q.written - w0, bytes, `chunks ${a}..${b - 1}: ${bytes} B (the first-change rule: 12000 B)`);
    assert.deepEqual(q.decode(g.index, 6000, g.drawRange.start), want(mesh, span(a, b)));
  }
});

test("W2: a widening view regrows the merge index O(log) times and releases each outgrown buffer", () => {
  const released = [], sys = chunkedSys({ releaseAttribute: (a) => released.push(a) }), mesh = record(64);
  const seen = new Set();
  let g = null;
  for (let n = 2; n <= 64; n++) { g = merge(sys, mesh, Array.from({ length: n }, (_, i) => i)); seen.add(g.index); }
  // Before: an exact-fit array per new high, 63 index buffers for this sweep. 1.5x headroom: 2,3,5,8,12,18,27,41,62,64.
  assert.ok(seen.size <= 10, `index attributes created: ${seen.size}`);
  assert.equal(released.length, seen.size - 1, "every outgrown index released, the live one kept");
  assert.ok(released.every((a) => a !== g.index), "the live index is never released");
  assert.equal(g.index.array.length, 64 * 3, "capped at the record's whole index count");
});

test("W3: castShadowChunked casts the visible chunks as one merged caster, with the per-chunk path as fallback", () => {
  const TLX = read("js/render/three/tlx.js");
  const at = TLX.indexOf("castShadowChunked(mesh, model, reach) {");
  const body = TLX.slice(at, TLX.indexOf("shadowEnd()", at));
  // Lift the method over stubs: the real chunk system, a counting shadow system.
  const sys = chunkedSys(), mesh = record(10);
  const casts = [];
  const shadowSys = { S: { depthPassOn: true, lightVP: new Float32Array(16) },
    castShadow: (w, m) => casts.push(w.geo), castShadowChunked() { throw new Error("not the chunked fallback"); } };
  const chunked = { ...sys, cull: (m, vp, reach, r) => { for (let i = 0; i < m.chunks.length; i++) sys.visList[i] = m.chunks[i]; return m.chunks.length; } };
  const lift = (merge) => new Function("shadowSys", "chunkedSys", "_chunkMerge", "_shMergeWrap",
    `return { ${body.trim().replace(/,\s*$/, "")} };`)(shadowSys, chunked, merge, { __tlx: true, geo: null });
  lift(true).castShadowChunked(mesh, null, null);
  assert.equal(casts.length, 1, "10 visible chunks -> ONE caster (one pool slot, RenderObject and bind group)");
  assert.equal(casts[0].drawRange.count, 30, "drawing every visible chunk's triangles");
  assert.equal(casts[0], mesh._tlxMv[2].geo, "merge slot 2, beside the main (0) and mirror (1) slots");
  casts.length = 0;
  lift(false).castShadowChunked(mesh, null, null);
  assert.equal(casts.length, 10, "apex26.tlxChunkMerge=0: a caster per chunk, as before");
});

test("W4: setSsrMrt with an unchanged state walks no material", () => {
  const lit = globalThis.TLXShaders.lit(THREE, TSL, { chunks: globalThis.TLXShaders.chunks(THREE, TSL), ssrTag: true, maxLights: 16 });
  const fx = globalThis.TLXShaders.fx(THREE, TSL, { chunks: globalThis.TLXShaders.chunks(THREE, TSL), sharedUniforms: true, lit });
  const mats = [lit.makeMaterial({}), lit.makeMaterial({ chunked: true }), lit.makeMaterial({ alpha: 0.4 }), fx.shadowMat, ...fx.particleMats];
  let writes = 0;
  for (const m of mats) {
    let v = m.mrtNode;
    Object.defineProperty(m, "mrtNode", { configurable: true, get: () => v, set: (x) => { writes++; v = x; } });
  }
  lit.setSsrMrt(true); fx.setSsrMrt(true);
  const armed = writes;
  assert.ok(armed >= mats.length, "a state change writes every material");
  assert.ok(mats.every((m) => m.mrtNode), "all armed");
  for (let i = 0; i < 3; i++) { lit.setSsrMrt(true); fx.setSsrMrt(true); }
  assert.equal(writes, armed, "repeated ON: 0 writes (before: one walk per call)");
  lit.setSsrMrt(false); fx.setSsrMrt(false);
  assert.ok(mats.every((m) => m.mrtNode === null), "OFF still clears every material");
  const off = writes;
  lit.setSsrMrt(false); fx.setSsrMrt(false);
  assert.equal(writes, off, "repeated OFF: 0 writes");
  const born = lit.makeMaterial({ instanced: true });
  assert.equal(born.mrtNode ?? null, null, "a material minted while OFF is born single-target");
  lit.setSsrMrt(true);
  assert.ok(born.mrtNode, "and the next change arms it");
});

// The post chain on three r187 (forceWebGL over the no-op context), its uniform set captured from TLXShaders.post.
function withStore(ls, fn) {
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true,
    value: { getItem: (k) => (k in ls ? ls[k] : null), setItem() {}, removeItem() {} } });
  try { return fn(); } finally { if (had) Object.defineProperty(globalThis, "localStorage", had); else delete globalThis.localStorage; }
}
async function postRig(t, { up = false } = {}) {
  const fg = makeFakeGL(320, 180);
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  // As tlx.js sets it: the post chain tone-maps, so three draws the canvas directly (no frame-buffer target).
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
  const identity = new THREE.Matrix4().elements;
  const shadow = { sunTex: new THREE.DepthTexture(1, 1), S: { enabled: true, lightVP: identity, lampLightVP: identity, lampArmed: false, lampIdx: -1 } };
  const T = globalThis.TLXShaders, orig = T.post;
  let P = null;
  T.post = (...a) => (P = orig(...a));
  let post;
  try {
    post = withStore({ "apex26.tlxAoFold": "0" }, () => T.postChain(THREE, TSL, { renderer, isMobile: true,
      chunks: T.chunks(THREE, TSL), shadow, viz: null, ssrTag: false, softDest: () => null,
      wantSpatialUpscale: () => up, getPresentSize: () => [320, 180], sceneSamples: 0 }));
  } finally { T.post = orig; }
  post.resize(320, 180);
  t.after(() => { post.dispose(); renderer.dispose(); });
  const frame = { invProj: identity, proj: identity, invVP: identity, viewProj: identity,
    eye: [0, 0, 0], sunDir: [0, 1, 0], sunColor: [1, 1, 1], time: 0, cloud: 0 };
  return { P, frame, post, renderer, present: (opts) => post.present(opts, frame),
    setUpscale(v) { up = v; post.resize(320, 180); } };
}

test("W5: a clear sky and no exhaust haze leave the frame-varying time uniforms unwritten; both write once read", async (t) => {
  const h = await postRig(t);
  const opts = { ssao: 0, contact: 0, godray: 0.8, bloom: 0, reflect: 0, carReflect: 0, mist: 0 };
  h.frame.time = 1; h.present(opts);
  assert.equal(h.P.godray.U.str.value > 0, true, "the godray pass ran");
  const gr0 = h.P.godray.U.time.value, hz0 = h.P.composite.U.hazeTime.value;
  for (const time of [2, 3, 4]) { h.frame.time = time; h.present(opts); }
  assert.equal(h.P.godray.U.time.value, gr0, "cloud 0: gCloud never reads time, no per-frame range");
  assert.equal(h.P.composite.U.hazeTime.value, hz0, "no haze: the composite never reads hazeTime");
  h.frame.cloud = 0.5; h.frame.time = 5;
  h.present({ ...opts, haze: { u: 0.5, v: 0.5, str: 1 } });
  assert.equal(h.P.godray.U.time.value, 5, "clouds: the march reads the current time");
  assert.equal(h.P.composite.U.hazeTime.value, 5, "haze: the plume reads the current time");
});

// Every render pipeline three builds from here on, named by material: the backend call itself.
function pipelineBuilds(renderer) {
  const built = [], be = renderer.backend, orig = be.createRenderPipeline;
  be.createRenderPipeline = function (ro, ...rest) {
    built.push((ro.material.name || ro.material.type) + "#" + ro.material.id);
    return orig.call(this, ro, ...rest);
  };
  return built;
}
const settle = () => new Promise((r) => setTimeout(r, 300));   // compileAsync yields per object

test("W6: the draw warm compiles the canvas passes on both sides of the upscale switch; the live presents build none", async (t) => {
  // Census 41021224706 (Dawn/Metal): createShaderModule x2 mid-race from runPass, FXAA into the canvas. The draw warm
  // skipped every canvas pass (a draw there presents) and the WebGPU post warm() is off. Warm at scale < 1 (SGSR to the
  // canvas), then race across 1.0 (FXAA to the canvas). A canvas compile alone is not enough: QuadMesh.render() swaps
  // three's quad vertex node in for the draw only, so compileAsync(quad) built a different program (tlx-post setQuadMat).
  const h = await postRig(t, { up: true });
  const opts = { ssao: 0, contact: 0, godray: 0, bloom: 0, reflect: 0, carReflect: 0, mist: 0 };
  h.post.drawWarm(opts, h.frame);
  await h.post.warmSettled();       // the canvas compiles themselves, not a wall-clock wait (flaked under load)
  const built = pipelineBuilds(h.renderer);
  h.present(opts);                  // SGSR -> canvas
  h.setUpscale(false);
  h.present(opts);                  // FXAA -> canvas
  await settle();
  assert.deepEqual(built, [], "no pipeline is built by a live present after the draw warm");
});

test("W7: the sky cache bake is warmed by a draw keyed like cacheStep's (depth off), not only by compileAsync (depth on)", async (t) => {
  // r187 compileAsync keys the render context's depth from renderer.depth; render() from the target's depthBuffer,
  // and the cache targets have none. Census 41021224706 built the bake's pipeline mid-race from cacheStep.
  vm.runInThisContext(read("js/render/three/tsl-sky.js"), { filename: absSrc("js/render/three/tsl-sky.js") });
  const fg = makeFakeGL(64, 64);
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  const sky = globalThis.TLXShaders.sky(THREE, TSL, { chunks: globalThis.TLXShaders.chunks(THREE, TSL), cache: true, cacheSize: 64 });
  t.after(() => { sky.dispose(); renderer.dispose(); });
  let into = null;
  const getForRender = renderer._pipelines.getForRender;
  renderer._pipelines.getForRender = function (ro, ...rest) {
    if (into && ro.material.customProgramCacheKey && ro.material.customProgramCacheKey() === "tlx-sky-cache") into.add(ro.context.depth);
    return getForRender.call(this, ro, ...rest);
  };
  const warmed = new Set(), live = new Set();
  into = warmed;
  await sky.cacheWarm(renderer);                                   // the compile stage (tlx.js runProgramWarmStages)
  if (sky.cacheDrawWarm) sky.cacheDrawWarm(renderer);              // the draw stage (drawWarmStage)
  into = live;
  sky.uniforms.cloud.value = 0.5;
  sky.cacheStep(renderer);                                          // the race's first bake band
  into = null;
  assert.deepEqual([...live], [false], "the bake renders with no depth attachment");
  assert.ok(warmed.has(false), `the warm built the bake's no-depth pipeline (warm saw depth ${[...warmed]})`);
});


test("W8: the production draw warm awaits the queued canvas compiles before it settles and opens the live present", () => {
  // drawWarm only QUEUES the SGSR/FXAA canvas compiles (serialised); _gpuSettled waits on submitted GPU work, not on them.
  const src = read("js/render/three/tlx.js");
  const i = src.indexOf("_warmStages.drawn = drawWarmStage(usePost, useTag, opts, _warmStages.mirror !== null);");
  assert.ok(i > 0, "the entry draw warm call is where the test expects it");
  const after = src.slice(i, src.indexOf("_gpuSettled(5000)", i));
  assert.match(after, /await post\.warmSettled\(\)/, "warmSettled is awaited between drawWarmStage and _gpuSettled");
});
