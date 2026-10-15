/* TLX perf hunt 4, lane RENDER-S (2026-10-14). No browser, no GPU: three r186's REAL WebGPURenderer({ forceWebGL })
 * over a no-op WebGL2 context (tests/helpers/fake-webgl2.mjs) counting the bytes handed to bufferSubData, driving the
 * REAL tlx.js instance-buffer code (sliced out of create(): the batches, the mirror view, the R1 runs, the FX streams),
 * the REAL tsl-lit material and the REAL tlx-shadow caster. A unit test of a backend is not evidence it runs: the
 * follow-up is a frozen TLX A/B and gpu-census.yml (macos) `gpu.writeBufferKB`.
 *   A-H1  three re-uploads a DynamicDrawUsage buffer in full on every render() that draws it (Attributes.update:
 *         `version < v || usage === DynamicDrawUsage`, with updateRanges already cleared) — the plain-Mesh
 *         instance-rate families go to StreamDrawUsage (upload = the written range, when written); the InstancedMesh
 *         families keep Dynamic, because three relays an InstancedMesh's matrices into its draw buffer once per frame.
 *         apex26.tlxDynUsage=1 is the kill switch. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeFakeGL, installThreeGlobals } from "../helpers/fake-webgl2.mjs";
import { fnSource } from "../helpers/fn-source.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const TLX = read("js/render/three/tlx.js");
const SHADOW = read("js/render/three/tlx-shadow.js");

installThreeGlobals();
globalThis.Log = globalThis.Log || { info() {}, warn() {}, error() {}, debug() {} };
if (!globalThis.localStorage) globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const THREE = await import(pathToFileURL(path.join(ROOT, "vendor/three-0.186.1/three.webgpu.min.js")).href);
const TSL = THREE.TSL;
for (const f of ["js/render/shared/light-budget.js", "js/lighting/knobs.js", "js/render/three/tsl-chunks.js",
  "js/render/three/tsl-lit.js", "js/render/three/tlx-shadow.js"])
  vm.runInThisContext(read(f), { filename: f });

const slice = (from, to) => {
  const a = TLX.indexOf(from), b = TLX.indexOf(to, a);
  assert.ok(a > 0 && b > a, `tlx.js block "${from.trim()}" moved — check this test, not the code`);
  return TLX.slice(a, b);
};
// The instance-buffer code of tlx.js create(), verbatim: batches (+ the A-H1 knob), the mirror view, the R1 runs
// (+ _aiMesh), the FX streams. Only the surroundings below are stand-ins.
const SRC = {
  range0: fnSource(TLX, "function setRange0(attr, count) {"),
  batch: slice("      let _instStamp = 0;", "      function cullInstances(batch, planes, opts) {"),
  mir: fnSource(TLX, "function _mirOf(batch) {"),
  r1: slice("      let _coOn = true;", "      function ensureStream(slot, verts) {"),
  streams: slice("      function ensureStream(slot, verts) {", "      const skidStream = {"),
  drop: slice("      const _dropQueue = [];", "      // Caller frees are ownership boundaries"),
};

async function rig(t, ls = {}) {
  const fg = makeFakeGL();
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  t.after(() => renderer.dispose());
  const lit = globalThis.TLXShaders.lit(THREE, TSL, { chunks: globalThis.TLXShaders.chunks(THREE, TSL), shadow: null,
    ssrTag: false, envCube: null, matMaps: null, lampGrid: null, sharedUniforms: true, maxLights: 16 });
  const scene = new THREE.Scene(); scene.matrixWorldAutoUpdate = false;
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 0, 5); camera.updateMatrixWorld();
  const mk = new Function("THREE", "TSL", "scene", "renderer", "camera", "localStorage", "lit", "window", `"use strict";
    const drawList = []; drawList.n = 0;
    const unlitMat = new THREE.MeshBasicNodeMaterial(), _drawMatMode = 0, vizMat = null;
    const skipBatches = () => false, drawEm = (o) => (o && o.emissive !== undefined ? o.emissive : 0);
    const InstCells = { invalidate() {} }, Frustum = null, TLXShaders = window.TLXShaders;
    function pushRec(geo, m, mat, em, al, lg, chunked, instanced) {
      const r = drawList[drawList.n] || (drawList[drawList.n] = {}); drawList.n++;
      Object.assign(r, { geo, m, mat, em, al, lg, chunked, instanced });
    }
    function resetRecs() { for (let i = 0; i < drawList.n; i++) drawList[i].instanced = null; drawList.n = 0; }
    const cache = new Map();
    function materialFor(o, chunked, instanced) {
      const k = JSON.stringify(o) + instanced;
      if (!cache.has(k)) { const m = lit.makeMaterial(instanced ? Object.assign({ instanced: true }, o) : o); if (instanced === 2) _attrInst(m); cache.set(k, m); }
      return cache.get(k);
    }
    function buildGeometry(d) {
      const g = new THREE.BufferGeometry(), n = d.pos.length / 3;
      for (const [k, a, s] of [["position", "pos", 3], ["normal", "nrm", 3], ["color", "col", 3]])
        g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(d[a] || n * s), s));
      g.setAttribute("mat", new THREE.BufferAttribute(new Float32Array(n), 1));
      g.setAttribute("trk", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      if (d.idx) g.setIndex(new THREE.BufferAttribute(new Uint16Array(d.idx), 1));
      return g;
    }
    function disposeGeometry(g) { g.dispose(); }
    let _mirActive = false; const _instPerPass = true;
    let _warmPending = null;
    ${SRC.drop}
    ${SRC.range0}
    ${SRC.batch}
    ${SRC.mir}
    ${SRC.r1}
    ${SRC.streams}
    return { createInstancedBatch, updateInstances, _mirOf, _coAppend, _coRuns, ensureStream, wrapStream, uploadStream,
      materialFor, resetRecs, drawList, usage: _instUsage, usageOf: _instUsageOf, aiOn: _aiInst,
      _coDrop, _dropQueue, flushDropped, warm: (p) => { _warmPending = p; } };`);
  const R = mk(THREE, TSL, scene, renderer, camera, { getItem: (k) => (k in ls ? ls[k] : null) }, lit, globalThis);
  const bytes = (fn) => { fg.reset(); fn(); return fg.bytes.bufferSubData; };
  const render = () => renderer.render(scene, camera);
  return { fg, renderer, scene, camera, R, lit, bytes, render };
}

const TRI = { pos: [0, 0, 0, 1, 0, 0, 0, 1, 0], nrm: [0, 0, 1, 0, 0, 1, 0, 0, 1], col: [1, 1, 1, 1, 1, 1, 1, 1, 1], idx: [0, 1, 2] };
function mats(n, seed = 0) {
  const a = new Float32Array(n * 16);
  for (let i = 0; i < n; i++) a.set(new THREE.Matrix4().makeRotationY(0.01 * i + seed).setPosition(i * 0.5, seed, -i).elements, i * 16);
  return a;
}
const cols = (n, v = 0.5) => new Float32Array(n * 3).fill(v);
// A batch made by the real createInstancedBatch, shown with the lit attribute-instanced material (drawInstanced's).
function batchOf(h, n, withColors = true) {
  const b = h.R.createInstancedBatch(TRI, mats(n), withColors ? cols(n) : null, null);
  const im = b.imesh;
  im.material = h.R.materialFor({ roughness: 0.6 }, false, im.isInstancedMesh ? true : 2);
  im.count = b.visible; im.visible = true;
  return b;
}

test("A-H1: an attribute-instanced batch uploads 0 bytes over two unchanged renders; Dynamic (the kill switch) re-sends it whole", async (t) => {
  const N = 500;
  const on = await rig(t);
  assert.equal(on.R.aiOn, true, "the attribute path (A2) is the default");
  assert.equal(on.R.usage, THREE.StreamDrawUsage, "Stream by default");
  const b = batchOf(on, N);
  assert.ok(!b.imesh.isInstancedMesh, "a plain Mesh");
  assert.equal(b.imesh.instanceMatrix.usage, THREE.StreamDrawUsage);
  assert.equal(b.imesh.geometry.getAttribute("instanceTint").usage, THREE.StreamDrawUsage);
  on.render();   // first sight: buffers created (bufferData), never bufferSubData
  const steady = on.bytes(() => { on.render(); on.render(); });
  assert.equal(steady, 0, "two unchanged renders (a two-pass frame) re-send nothing");

  const off = await rig(t, { "apex26.tlxDynUsage": "1" });
  assert.equal(off.R.usage, THREE.DynamicDrawUsage, "apex26.tlxDynUsage=1 restores Dynamic");
  const d = batchOf(off, N);
  assert.equal(d.imesh.instanceMatrix.usage, THREE.DynamicDrawUsage);
  off.render();
  const forced = off.bytes(() => { off.render(); off.render(); });
  t.diagnostic(`two unchanged renders of a ${N}-instance batch: Stream ${steady} B, Dynamic ${forced} B`);
  assert.equal(forced, 2 * N * (64 + 12), "Dynamic: the whole mat4 stream and the whole tint, every render");
});

test("A-H1: a changed frame uploads exactly the written range — matrices alone, then matrices + tint — and only once", async (t) => {
  const h = await rig(t);
  const N = 500, K = 37;
  const b = batchOf(h, N);
  h.render();
  // DebrisWorld / the frozen mirror: updateInstances with no colours writes K matrices and leaves the tint alone.
  const m1 = h.bytes(() => { h.R.updateInstances(b, mats(K, 3), K, null); b.imesh.count = b.visible; h.render(); });
  assert.equal(m1, K * 64, "K mat4s, not the N-instance buffer");
  assert.equal(h.bytes(() => { h.render(); }), 0, "the next unchanged render sends nothing");
  const m2 = h.bytes(() => { h.R.updateInstances(b, mats(K, 4), K, cols(K, 0.25)); h.render(); h.render(); });
  assert.equal(m2, K * (64 + 12), "K mat4s + K tints, once over two renders");
  // A rewrite BETWEEN two renders of one frame (a phone's mirror freeze, main then mirror) reaches the second one:
  // a plain Mesh's attribute version is read per render(), not relayed per frame (the InstancedMesh hazard below).
  const m3 = h.bytes(() => {
    h.R.updateInstances(b, mats(K, 5), K, null); h.render();
    h.R.updateInstances(b, mats(5, 6), 5, null); h.render();
  });
  assert.equal(m3, K * 64 + 5 * 64, "each write uploads its own range at the render that follows it");
  const gpu = h.renderer.backend.get(b.imesh.instanceMatrix);
  assert.ok(gpu && gpu.bufferGPU, "the stream lives on the GPU");
});

test("A-H1: the mirror view, the R1 runs and the FX streams are Stream: unchanged renders send 0, a write sends its range", async (t) => {
  const h = await rig(t);
  // _mirOf (A1): its own attribute stream and tint.
  const b = batchOf(h, 64);
  const v = h.R._mirOf(b);
  assert.equal(v.imesh.instanceMatrix.usage, THREE.StreamDrawUsage, "mirror view stream");
  assert.equal(v.imesh.geometry.getAttribute("instanceTint").usage, THREE.StreamDrawUsage, "mirror view tint");
  v.imesh.material = b.imesh.material; v.imesh.count = 64; v.imesh.visible = true;
  h.render();
  assert.equal(h.bytes(() => { h.render(); h.render(); }), 0, "batch + mirror view, unchanged: nothing");
  v.imesh.visible = false;

  // R1 (_coRun / _coAppend): one interleaved mat4 + tint stream (19 floats) per run.
  const geo = buildTri(), o = { roughness: 0.55, coalesce: true, emissive: 0 };
  const W = (i) => Float32Array.from(new THREE.Matrix4().makeRotationY(0.3 * i).setPosition(i, 0, -i).elements);
  for (let i = 0; i < 5; i++) assert.equal(h.R._coAppend(geo, W(i), o), true);
  const run = h.R.drawList[h.R.drawList.n - 1].instanced;
  assert.equal(run.ib.usage, THREE.StreamDrawUsage, "co-run stream");
  run.imesh.material = h.R.drawList[h.R.drawList.n - 1].mat; run.imesh.count = run.visible; run.imesh.visible = true;
  h.render();
  assert.equal(h.bytes(() => { h.render(); }), 0, "a run whose pass appended nothing new sends nothing");
  const coBytes = h.bytes(() => {
    h.R.resetRecs();
    for (let i = 0; i < 3; i++) h.R._coAppend(geo, W(i + 7), o);
    run.imesh.count = run.visible; h.render();
  });
  assert.equal(coBytes, 3 * 19 * 4, "the next pass's three instances: 3 x 19 floats, not CO_CAP x 19");

  // ensureStream / uploadStream (skid, line, glow) and wrapStream (particles, R9).
  const slot = { geo: null, ib: null, cap: 0, min: 64, stride: 5, attrs: [["position", 3, 0], ["uv", 2, 3]] };
  h.R.ensureStream(slot, 64);
  assert.equal(slot.ib.usage, THREE.StreamDrawUsage, "copy stream");
  const fxm = new THREE.Mesh(slot.geo, new THREE.MeshBasicNodeMaterial()); fxm.frustumCulled = false; h.scene.add(fxm);
  slot.ib.array.fill(0.5, 0, 30); h.R.uploadStream(slot, 30); slot.geo.setDrawRange(0, 6);
  h.render();
  assert.equal(h.bytes(() => { h.render(); }), 0, "dirty === false (no uploadStream): nothing");
  assert.equal(h.bytes(() => { slot.ib.array.fill(0.25, 0, 15); h.R.uploadStream(slot, 15); h.render(); }), 15 * 4, "a dirty upload: its floats");
  const wslot = { geo: null, ib: null, cap: 0, min: 6, stride: 10, attrs: [["fxCorner", 2, 0], ["position", 3, 2], ["fxColor", 3, 5], ["fxSize", 1, 8], ["fxAlpha", 1, 9]] };
  const arr = new Float32Array(60);
  assert.equal(h.R.wrapStream(wslot, arr), true);
  assert.equal(wslot.ib.usage, THREE.StreamDrawUsage, "wrapped stream");
  assert.equal(wslot.ib.array, arr, "R9: the producer's array is the buffer");
  const pm = new THREE.Mesh(wslot.geo, new THREE.MeshBasicNodeMaterial()); pm.frustumCulled = false; h.scene.add(pm);
  wslot.geo.setDrawRange(0, 6); h.render();
  assert.equal(h.bytes(() => { h.render(); }), 0, "a clean particle frame (dirty false): nothing");
  assert.equal(h.bytes(() => { arr[2] = 1; h.R.uploadStream(wslot, 60); h.render(); }), 60 * 4);
});
function buildTri() {
  const g = new THREE.BufferGeometry();
  for (const [n, k] of [["position", 3], ["normal", 3], ["color", 3], ["mat", 1], ["trk", 3]])
    g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(k * 3).fill(0.5), k));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2]), 1));
  return g;
}

// #2150: _coDrop freed a coalesced run with scene.remove + geometry.dispose() only. In three r186 a geometry's
// "dispose" just nulls the attribute mirror; only the OBJECT's "dispose" runs RenderObject.dispose(), so every
// RenderObject that drew the run stayed a listener on the long-lived shared run material — pinning the mesh, its
// view geometry and the CO_CAP x 19-float buffer. Measured here on the real renderer: the material's "dispose"
// listener count, one per RenderObject (main pass and mirror alike), must come back down when the source is freed.
test("#2150: freeing a coalesced source releases its run's RenderObjects (and queues the drop while a warm holds it)", async (t) => {
  const h = await rig(t);
  const o = { roughness: 0.55, coalesce: true, emissive: 0 };
  const W = (i) => Float32Array.from(new THREE.Matrix4().setPosition(i, 0, -i).elements);
  const listeners = (m) => ((m._listeners && m._listeners.dispose) || []).length;
  const drawRun = (geo) => {
    h.R.resetRecs();
    for (let i = 0; i < 3; i++) assert.equal(h.R._coAppend(geo, W(i), o), true);
    const rec = h.R.drawList[h.R.drawList.n - 1];
    rec.instanced.imesh.material = rec.mat; rec.instanced.imesh.count = rec.instanced.visible; rec.instanced.imesh.visible = true;
    return rec;
  };
  const geo = buildTri();
  const rec = drawRun(geo), run = rec.instanced, mat = rec.mat, view = run.imesh.geometry;
  const before = listeners(mat);
  h.render();
  const drawn = listeners(mat);
  assert.ok(drawn > before, "the render made a RenderObject listening on the shared run material");
  let objDisposed = 0, viewDisposed = 0;
  run.imesh.addEventListener("dispose", () => objDisposed++);
  view.addEventListener("dispose", () => viewDisposed++);
  h.R._coDrop(geo);
  assert.equal(objDisposed, 1, "the run mesh got the object 'dispose' three's RenderObject listens for");
  assert.equal(viewDisposed, 1, "the run's view geometry is disposed too");
  assert.equal(listeners(mat), before, "every RenderObject of the run left the shared material (none leaked)");
  assert.equal(run.imesh.parent, null); assert.equal(h.R._coRuns.has(geo), false);

  // While a warm is compiling, the drop waits for flushDropped (a compile may still hold the mesh), view included.
  const geo2 = buildTri();
  const rec2 = drawRun(geo2), run2 = rec2.instanced, view2 = run2.imesh.geometry;
  h.render();
  let ob2 = 0, vw2 = 0;
  run2.imesh.addEventListener("dispose", () => ob2++); view2.addEventListener("dispose", () => vw2++);
  h.R.warm(Promise.resolve());
  h.R._coDrop(geo2);
  assert.equal(h.R._dropQueue.includes(run2.imesh), true, "queued while the warm is pending");
  assert.equal(ob2 + vw2, 0, "nothing disposed under a live compile");
  h.R.warm(null); h.R.flushDropped();
  assert.equal(ob2, 1); assert.equal(vw2, 1); assert.equal(listeners(rec2.mat), before);
});

test("A-H1: the InstancedMesh families keep Dynamic — the real caster, redrawn by one pass after a rewrite, still reaches the GPU", async (t) => {
  // The tlxAttrInst=0 fallback batch is a padded InstancedMesh: Dynamic matrices, Stream tint (a named attribute).
  const fb = await rig(t, { "apex26.tlxAttrInst": "0" });
  const ib = batchOf(fb, 8);
  assert.equal(ib.imesh.isInstancedMesh, true);
  assert.equal(ib.imesh.instanceMatrix.usage, THREE.DynamicDrawUsage, "fallback InstancedMesh: Dynamic");
  assert.equal(fb.R.usageOf(ib.imesh), THREE.DynamicDrawUsage);
  assert.equal(ib.imesh.geometry.getAttribute("instanceTint").usage, THREE.StreamDrawUsage, "its tint is a plain named attribute");
  // The REAL tlx-shadow caster on the real renderer, one three frame: sun pass (40 rows), lamp pass (9 rows), then
  // the lamp pass again after a rewrite. three relays an InstancedMesh's matrices into the buffer it draws ONCE PER
  // FRAME PER RENDER OBJECT (the BEFORE_FRAME node update), so each pass's first draw of a frame gets its rows
  // either way; a second draw by the same pass gets them only from Dynamic's per-render() re-send.
  // A-H4 (tlx-hunt4c.test.mjs) made the caster attribute-instanced by default; apex26.tlxCasterAttr=0 is the
  // InstancedMesh caster this test pins.
  const shipped = await casterBytes(t, null);
  t.diagnostic(`caster, Dynamic (tlxCasterAttr=0): sun ${shipped.sun} B, lamp ${shipped.lamp} B, lamp again ${shipped.again} B`);
  assert.equal(shipped.sun, 40 * 64, "the sun pass uploads its 40 rows");
  assert.equal(shipped.lamp, 9 * 64, "the lamp pass, same frame, uploads its own 9 rows");
  assert.ok(shipped.again >= 9 * 64, "the lamp pass redrawn after a rewrite: re-sent (the whole padded array)");
  const forced = await casterBytes(t, THREE.StreamDrawUsage);
  t.diagnostic(`caster forced to Stream: sun ${forced.sun} B, lamp ${forced.lamp} B, lamp again ${forced.again} B`);
  assert.equal(forced.lamp, 9 * 64, "a pass's first draw of the frame is relayed under Stream too");
  assert.equal(forced.again, 0, "Stream: the rewrite before the second draw never reaches the GPU — the reason casters stay Dynamic");
});
// One frame of the real caster: { sun, lamp, again } bufferSubData bytes; `usage` forces every InstancedBufferAttribute's.
async function casterBytes(t, usage) {
  const h = await rig(t);
  const IBA = THREE.InstancedBufferAttribute.prototype, own = Object.prototype.hasOwnProperty.call(IBA, "setUsage");
  const base = IBA.setUsage;
  if (usage !== null) IBA.setUsage = function () { return base.call(this, usage); };
  const ls0 = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => (k === "apex26.tlxCasterAttr" ? "0" : null), setItem() {}, removeItem() {} };
  try {
    let sys;
    try { sys = globalThis.TLXShaders.shadowSys(THREE, TSL, { renderer: h.renderer, isMobile: false, softwareGL: false, isWarming: () => false }); }
    finally { globalThis.localStorage = ls0; }
    assert.ok(sys.S.enabled && sys.S.lampEnabled, "sun and lamp maps on (desktop)");
    const n = 40;
    const batch = { geo: buildTri(), instances: n, srcMatrices: mats(n), packMatrices: null, visible: n };
    const castInto = (begin, end, pack, k) => { begin(); batch.packMatrices = pack; sys.castInstanced(batch, k); end(); };
    const VP = new Float32Array(new THREE.Matrix4().elements);
    const sun = (pack, k) => castInto(() => sys.shadowBegin(VP), () => sys.shadowEnd(), pack, k);
    const lamp = (pack, k) => castInto(() => sys.lampShadowBegin(VP, 0), () => sys.lampShadowEnd(), pack, k);
    sun(mats(n, 1), n); lamp(mats(9, 1), 9);   // first sight in each pass's context (buffers, VAOs)
    await new Promise((r) => setTimeout(r, 5));   // the next three frame (three's rAF loop ticks the node frame)
    return { sun: h.bytes(() => sun(mats(n, 2), n)), lamp: h.bytes(() => lamp(mats(9, 3), 9)), again: h.bytes(() => lamp(mats(9, 4), 9)) };
  } finally {
    if (own) IBA.setUsage = base; else delete IBA.setUsage;
  }
}

test("A-H1: tlx.js wiring — every plain-Mesh family on _instUsage, every InstancedMesh site Dynamic, the knob read once", () => {
  assert.match(TLX, /let _instUsage = THREE\.StreamDrawUsage;\s*try \{ if \(localStorage\.getItem\("apex26\.tlxDynUsage"\) === "1"\) _instUsage = THREE\.DynamicDrawUsage;/);
  assert.match(TLX, /const _instUsageOf = \(mesh\) => \(mesh\.isInstancedMesh \? THREE\.DynamicDrawUsage : _instUsage\);/);
  assert.match(fnSource(TLX, "function _instColorAttr(imesh, cap) {"), /next\.setUsage\(_instUsage\);/);
  assert.match(fnSource(TLX, "function createInstancedBatch(data, matrices, colors, opts) {"), /imesh\.instanceMatrix\.setUsage\(_instUsageOf\(imesh\)\);/);
  assert.match(SRC.mir, /im\.instanceMatrix\.setUsage\(_instUsageOf\(im\)\);/);
  assert.match(fnSource(TLX, "function _coRun(geo, neg) {"), /ib\.setUsage\(_instUsage\);/);
  assert.match(fnSource(TLX, "function ensureStream(slot, verts) {"), /ib\.setUsage\(_instUsage\);/);
  assert.match(fnSource(TLX, "function wrapStream(slot, arr) {"), /ib\.setUsage\(_instUsage\);/);
  // The InstancedMesh runs (A6 blob, F3 decal) and the caster keep Dynamic.
  assert.match(fnSource(TLX, "function _blobAppend(model, w, l) {"), /im\.instanceMatrix\.setUsage\(THREE\.DynamicDrawUsage\);/);
  assert.match(fnSource(TLX, "function _decalAppend(geo, w, mat) {"), /im\.instanceMatrix\.setUsage\(THREE\.DynamicDrawUsage\);/);
  assert.match(SHADOW, /m = new THREE\.InstancedMesh\(casterGeo\(batch\.geo\), depthMat[\s\S]{0,700}m\.instanceMatrix\.setUsage\(THREE\.DynamicDrawUsage\);/);
  // No other Dynamic site crept back in tlx.js (two InstancedMesh runs + the releaseGeoMirrors skip + the knob).
  assert.equal((TLX.match(/setUsage\(THREE\.DynamicDrawUsage\)/g) || []).length, 2);
  // Every write site pushes a range and bumps the version (a Stream buffer uploads nothing otherwise).
  const wim = fnSource(TLX, "function _writeInstanceMatrices(imesh, matrices, colors, n) {");
  assert.match(wim, /setRange0\(col, nc\); col\.needsUpdate = true;/);
  assert.match(wim, /setRange0\(im, nf\);\s*im\.needsUpdate = true;/);
  assert.match(fnSource(TLX, "function _coAppend(geo, w, opts) {"), /setRange0\(b\.ib, b\.visible \* CO_STRIDE\); b\.ib\.needsUpdate = true;/);
  assert.match(fnSource(TLX, "function uploadStream(slot, floats) {"), /setRange0\(slot\.ib, floats\);[^\n]*\n\s*slot\.ib\.needsUpdate = true;/);
});
