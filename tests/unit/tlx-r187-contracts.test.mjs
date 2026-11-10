/* tlx-r187-contracts.test.mjs — what TLX assumes about the vendored three.js r187 (audit W11, 2026-11-10).
 * Each test runs the REAL vendored bundle (vendor/three-0.187.0) and, where it can, the real TLX code over the
 * no-op WebGL2 context (tests/helpers/fake-webgl2.mjs). No GPU: a pass here is not evidence the WebGPU leg runs
 * on a phone (AGENTS.md §Seeing the game). Scissor warm (finding 1): tlx-hunt4b.test.mjs A-W1. Clean-refusal
 * fall-through (3): renderer-boot-timeout.test.mjs. adapter.info.isFallbackAdapter on WGX (5): webgpu-lifecycle.
 * Run: node --test tests/unit/tlx-r187-contracts.test.mjs */
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
const TLX = read("js/render/three/tlx.js");
const CHUNKED = read("js/render/three/tlx-chunked.js");
const code = (s) => s.replace(/^[ \t]*\/\/.*$/gm, "");

installThreeGlobals();
globalThis.Log = globalThis.Log || { info() {}, warn() {}, error() {}, debug() {} };
const THREE = await import(pathToFileURL(path.join(ROOT, "vendor/three-0.187.0/three.webgpu.min.js")).href);

function chunkedSys(ctx) {
  const sb = { window: {}, localStorage: { getItem: () => null }, Frustum: {},
    Float32Array, Uint32Array, Uint16Array, Uint8Array, Int16Array, Int32Array, Math };
  vm.createContext(sb);
  vm.runInContext(CHUNKED, sb, { filename: absSrc("js/render/three/tlx-chunked.js") });
  return sb.window.TLXShaders.chunked(THREE, ctx);
}
function sharedGeos(n) {
  const attrs = {
    position: new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
    normal: new THREE.BufferAttribute(new Int16Array([0, 32767, 0, 0, 32767, 0, 0, 32767, 0, 0, 32767, 0]), 4, true),
    color: new THREE.BufferAttribute(new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]), 4, true),
  };
  const geos = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(attrs)) g.setAttribute(k, a);
    g.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2]), 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
    geos.push(g);
  }
  return { attrs, geos };
}

// ── 2. three's own WebGL2 swap inside init() ──────────────────────────────────────────────────────────────────────
// The REAL bootRenderer + its AUTO retry + the post-init check (tlx.js, verbatim), over the real r187
// WebGPURenderer. Node has no navigator.gpu, so WebGPUBackend.init() throws exactly as it does on a device whose
// adapter or device request fails.
const BOOT = (() => {
  const a = TLX.indexOf("      let ownGL = null;\n      async function bootRenderer(forceWebGL) {");
  const b = TLX.indexOf("      _abortRenderer = renderer;", a);
  assert.ok(a > 0 && b > a, "the bootRenderer block moved: re-pin this slice");
  return TLX.slice(a, b);
})();
async function boot(pin) {
  const fg = makeFakeGL(64, 64);
  const ctxCalls = [];
  const get = fg.canvas.getContext;
  fg.canvas.getContext = (type, attrs) => { ctxCalls.push({ type, attrs: attrs || null }); return get(type, attrs); };
  const latched = [];
  const AsyncFunction = (async () => {}).constructor;
  const run = new AsyncFunction("THREE", "canvas", "_glPin", "forceWebGL0", "_latchWebKitGL", "Log", `"use strict";
    let forceWebGL = forceWebGL0;
    const checkInit = () => {}, _liteGpu = false, isMobile = false, isWebKit = false, pumpAnimation = () => null;
    const disposeKeepingContext = (r) => { try { const p = r && r.dispose(); if (p && p.catch) p.catch(() => {}); } catch (_) {} };
    ${BOOT}
    return { renderer, forceWebGL, ownGL, initSwapGL: _initSwapGL };`);
  const out = await run(THREE, fg.canvas, pin, pin === "1", (why) => latched.push(why), globalThis.Log);
  return { ...out, ctxCalls, latched };
}

test("AUTO: a failed WebGPU init throws into TLX's own retry (three's fallback disarmed), which binds #game opaque", async (t) => {
  assert.ok(!globalThis.navigator || !globalThis.navigator.gpu, "this test needs a Node with no navigator.gpu");
  const r = await boot(null);
  t.after(() => { try { r.renderer.dispose(); } catch (_) { /* fake GL */ } });
  assert.equal(r.renderer.backend.isWebGLBackend, true);
  assert.equal(r.forceWebGL, true, "forceWebGL tells the truth: _softBlit, sceneSamplesFor and toGlx take the WebGL2 leg");
  assert.equal(r.initSwapGL, false, "TLX's retry ran, not three's swap");
  assert.ok(r.latched.some((w) => /^WebGPU init failed/.test(w)), "the WebKit latch is set");
  const gl2 = r.ctxCalls.filter((c) => c.type === "webgl2");
  assert.ok(gl2.length >= 1 && gl2[0].attrs && gl2[0].attrs.alpha === false,
    "the FIRST webgl2 context on #game is TLX's opaque one (three's own asks alpha:true and fixes it for the canvas)");
  assert.ok(r.ownGL, "bootRenderer handed three the caller-made context");
});

test("WebGPU pin: three's in-init swap is detected and the WebGL2-leg flags are corrected", async (t) => {
  const r = await boot("0");
  t.after(() => { try { r.renderer.dispose(); } catch (_) { /* fake GL */ } });
  assert.equal(r.renderer.backend.isWebGLBackend, true, "r187 swapped in its WebGLBackend (getFallback)");
  assert.equal(r.initSwapGL, true, "backendState().initSwapGL reports it");
  assert.equal(r.forceWebGL, true, "and forceWebGL follows the backend that actually bound");
  assert.ok(r.latched.some((w) => /fell back inside three/.test(w)), "reported (the real latch ignores a pin)");
  assert.match(TLX, /forceWebGL, initSwapGL: _initSwapGL, pin: _glPin/, "backendState() exposes the swap");
});

test("r187 still arms getFallback on a non-forceWebGL WebGPURenderer (the disarm's premise)", () => {
  const r = new THREE.WebGPURenderer({ canvas: makeFakeGL().canvas });
  assert.equal(typeof r._getFallback, "function", "if this fails, three renamed _getFallback: re-derive the disarm in bootRenderer");
  const gl = new THREE.WebGPURenderer({ canvas: makeFakeGL().canvas, forceWebGL: true });
  assert.equal(gl._getFallback, null);
});

// ── 4. data-engine label ──────────────────────────────────────────────────────────────────────────────────────────
test("#game data-engine names the vendored revision, not a hand-kept r185", () => {
  const engineLabel = new Function(`${fnSource(TLX, "function engineLabel(")}; return engineLabel;`)();
  assert.equal(engineLabel(THREE, "webgpu"), "three.js r187 webgpu");
  assert.equal(engineLabel({ REVISION: "188" }, "webgl2"), "three.js r188 webgl2");
  assert.match(TLX, /canvas\.setAttribute\("data-engine", engineLabel\(THREE, api\)\)/);
  assert.doesNotMatch(code(TLX), /"three\.js r18\d/, "no literal revision left in code");
});

// ── 5. adapter.info.isFallbackAdapter (TLX sniff) ─────────────────────────────────────────────────────────────────
test("TLX's software-adapter sniff reads GPUAdapterInfo.isFallbackAdapter first (Chrome 140 removed the adapter's)", () => {
  assert.match(code(TLX), /_softAdapter = !_phoneHw && !!\(\(info && info\.isFallbackAdapter\) \|\| ad\.isFallbackAdapter \|\|/);
});

// ── 6. mirror release vs r187's vertex-layout key ─────────────────────────────────────────────────────────────────
test("r187's WebGPU vertex-layout key reads every attribute's array; a released chunk mirror is kept on WebGPU", () => {
  const be = new THREE.WebGPURenderer({ canvas: makeFakeGL().canvas }).backend;
  assert.equal(be.isWebGPUBackend, true);
  const layout = (g) => be.attributeUtils.getVertexBufferLayoutCacheKey({ getAttributes: () => Object.values(g.attributes) });
  // The library fact the fix rests on: a nulled array throws in the key a new RenderObject builds.
  const probe = sharedGeos(2);
  const key = layout(probe.geos[1]);
  for (const a of Object.values(probe.attrs)) a.array = null;
  assert.throws(() => layout(probe.geos[1]), TypeError, "r187 getVertexBufferLayout: array.BYTES_PER_ELEMENT of null");

  // WebGPU: releaseMirrors keeps the arrays, so a never-seen chunk's first pipeline resolves.
  const gpu = sharedGeos(3), sys = chunkedSys({ isWebGPU: () => true });
  const mesh = { chunks: gpu.geos.map((geo) => ({ geo })) };
  sys.releaseMirrors(mesh);
  assert.equal(mesh._mirrorsFreed, true, "decided once (the caller stops queueing it)");
  assert.equal(mesh._mirrorsKept, true);
  assert.equal(layout(gpu.geos[2]), key, "a chunk that enters the frustum after the release builds its layout key");
  for (const a of Object.values(gpu.attrs)) assert.ok(a.array && a.array.length, "mirror kept");

  // WebGL2: unchanged (its createAttribute is the only reader, and every shared attribute has passed it).
  const gl = sharedGeos(2), sysGL = chunkedSys({ isWebGPU: () => false });
  sysGL.releaseMirrors({ chunks: gl.geos.map((geo) => ({ geo })) });
  for (const a of Object.values(gl.attrs)) assert.equal(a.array, null, "WebGL2 still frees the CPU mirror");
});

test("releaseGeoMirrors keeps the arrays on the WebGPU backend, before it touches any of them", () => {
  const body = code(fnSource(TLX, "function releaseGeoMirrors(g) {"));
  const gate = body.indexOf("renderer.backend.isWebGPUBackend");
  assert.ok(gate > 0, "the WebGPU gate is gone");
  assert.ok(gate < body.indexOf("computeBoundingSphere()") && gate < body.indexOf("a.array = null"));
});

// ── 7. renderer.samples is getter-only ────────────────────────────────────────────────────────────────────────────
test("r187's renderer.samples has no setter, and TLX no longer assigns it", () => {
  let p = THREE.WebGPURenderer.prototype, d = null;
  while (p && !(d = Object.getOwnPropertyDescriptor(p, "samples"))) p = Object.getPrototypeOf(p);
  assert.ok(d && typeof d.get === "function" && d.set === undefined, "samples is getter-only in r187");
  assert.doesNotMatch(code(TLX), /renderer\.samples\s*=/, "an assignment throws in strict mode and was swallowed");
});

// ── 8. batched chunk free destroys the shared vertex buffers ──────────────────────────────────────────────────────
// Real r187 WebGPURenderer({ forceWebGL }) over the fake WebGL2: a mesh drawn ONLY through a merge slot (the
// merged draw), then freed. Before: the slot's attributes were stripped before its dispose and the never-drawn
// chunk had no dispose listener, so only the index buffer was deleted.
async function drawnMesh(t) {
  const fg = makeFakeGL(32, 32);
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  t.after(() => renderer.dispose());
  const { attrs, geos } = sharedGeos(2);
  const [slot, chunk] = geos;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
  cam.position.set(0, 0, 3); cam.updateMatrixWorld();
  const m = new THREE.Mesh(slot, new THREE.MeshBasicNodeMaterial()); m.frustumCulled = false; scene.add(m);
  renderer.render(scene, cam);
  const be = renderer.backend;
  assert.ok(be.get(attrs.position).bufferGPU, "the slot's draw uploaded the shared position buffer");
  scene.remove(m);
  // tlx.js releaseGeometry drops the geometry's pool wrappers FIRST (dropWrapper: the object's "dispose", which
  // disposes its RenderObject). With a live RenderObject, r187's onGeometryDispose would delete the stripped
  // attributes itself (deleteNodeAttributes); production never reaches the geometry dispose with one left.
  const releaseGeometry = (g) => { if (m.geometry === g) m.dispatchEvent({ type: "dispose" }); };
  return { fg, attrs, slot, chunk, be, releaseGeometry };
}

test("unbatched free(): the shared vertex buffers are destroyed, not only the index", async (t) => {
  const h = await drawnMesh(t);
  const sys = chunkedSys({ isWebGPU: () => false, releaseGeometry: h.releaseGeometry });
  const d0 = h.fg.counts.deleteBuffer || 0;
  sys.free({ chunks: [{ geo: h.chunk }], _tlxMv: [{ geo: h.slot }] });
  const deleted = (h.fg.counts.deleteBuffer || 0) - d0;
  assert.ok(deleted >= 2, `position AND the slot's index buffer deleted (${deleted})`);
  assert.equal(h.be.get(h.attrs.position).bufferGPU, undefined, "three's attribute record is gone");
  assert.deepEqual(Object.keys(h.slot.attributes), [], "the CPU arrays are still released (attributes stripped)");
});

test("batched flush: disposeShared destroys each shared attribute once, then disposes the stripped geometries", async (t) => {
  const h = await drawnMesh(t);
  const sys = chunkedSys({ isWebGPU: () => false, releaseGeometry: h.releaseGeometry });
  const batch = new Set();
  sys.free({ chunks: [{ geo: h.chunk }], _tlxMv: [{ geo: h.slot }] }, batch);   // releaseGeometry drops the wrapper
  assert.equal(batch.size, 2);
  const d0 = h.fg.counts.deleteBuffer || 0;
  assert.equal(sys.disposeShared(batch), 3, "three shared attributes, deduplicated across the two geometries");
  assert.ok((h.fg.counts.deleteBuffer || 0) - d0 >= 2, "position and the index buffer deleted");
  assert.match(code(fnSource(TLX, "flushChunkedOwnership() {")), /flushOwnershipRelease\(_ownershipFreeBatch\);\s*if \(chunkedSys && chunkedSys\.disposeShared\) chunkedSys\.disposeShared\(_ownershipFreeBatch\);/,
    "tlx.js flushes the batch through disposeShared");
});
