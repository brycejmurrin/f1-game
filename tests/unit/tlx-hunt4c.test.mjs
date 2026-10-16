/* TLX perf hunt 4, lane TLX-H4 (2026-10-14). No browser, no GPU: three r186's REAL WebGPURenderer({ forceWebGL }) over
 * the no-op WebGL2 context (tests/helpers/fake-webgl2.mjs) with a small GPU-buffer model on top (every bufferData /
 * bufferSubData applied to a CPU copy of the bound buffer, ARRAY_BUFFER bytes counted, every instanced draw recorded
 * with its instance count), driving the REAL tlx-shadow caster code and the REAL tlx.js program warm (with the real
 * lit material, post chain and shadow subsystem). A unit test of a backend is not evidence it runs: the follow-up is
 * a frozen TLX A/B and gpu-census.yml (macos) — `passKinds` wide frames, `spikeWork` writeBuffer on rebuild frames,
 * `race.warm.mirror` / `mirrorDeferred` / `mirrorLazy` / `total`, `gov.open.maxMs`.
 *   A-H4    the instanced shadow caster is a plain Mesh drawing `count` instances from its own instance-rate buffer
 *           (iM0..3, StreamDrawUsage, no UBO pad) on a depth material with the attribute instance step, instead of a
 *           padded Dynamic InstancedMesh (apex26.tlxCasterAttr=0 restores that exactly).
 *   B-F3.1  an AUTO mirror setting skips the program warm's mirror stage (and W1's 4x4 mirror draw) at the lights and
 *           owes it to the first mirrorBegin, which refuses its pass and has present() run it alone, owned like the
 *           entry warm; an explicit ON warms it eagerly; OPT-IN since the B-F3.1 decision: unset (or "0") is the eager stage, apex26.tlxMirWarmLazy=1 defers it. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeFakeGL, installThreeGlobals } from "../helpers/fake-webgl2.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const SHADOW = read("js/render/three/tlx-shadow.js");
const TLX = read("js/render/three/tlx.js");

installThreeGlobals();
globalThis.Log = globalThis.Log || { info() {}, warn() {}, error() {}, debug() {} };
if (!globalThis.localStorage) globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const THREE = await import(pathToFileURL(path.join(ROOT, "vendor/three-0.186.1/three.webgpu.min.js")).href);
const TSL = THREE.TSL;
for (const f of ["js/render/shared/light-budget.js", "js/lighting/knobs.js", "js/render/shared/post-common.js",
  "js/render/three/tsl-chunks.js", "js/render/three/tsl-lit.js", "js/render/three/tsl-post.js", "js/render/three/tlx-post.js"])
  vm.runInThisContext(read(f), { filename: f });
vm.runInThisContext(SHADOW, { filename: "js/render/three/tlx-shadow.js" });

// ── A-H4 ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// A GPU-buffer model over the fake context: what each GL buffer object holds, and every draw's instance count.
function gpuModel(fg) {
  const gl = fg.gl, mem = new Map(), bound = new Map(), draws = [];
  const view = (src) => new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
  gl.bindBuffer = (target, buf) => { bound.set(target, buf); };
  gl.bufferData = (target, data) => {
    const b = bound.get(target);
    if (b) mem.set(b, typeof data === "number" ? new Uint8Array(data) : Uint8Array.from(view(data)));
  };
  gl.bufferSubData = (target, dst, src, srcOff = 0, len = 0) => {
    const b = bound.get(target), m = b && mem.get(b);
    const k = src.BYTES_PER_ELEMENT || 1, n = len ? len * k : src.byteLength - srcOff * k;
    if (target === gl.ARRAY_BUFFER) fg.bytes.bufferSubData += n;   // vertex data only (a first-sight context's UBOs are not the caster's)
    if (m) m.set(new Uint8Array(src.buffer, src.byteOffset + srcOff * k, n), dst);
  };
  // Instanced draws only: the casters here all draw > 1 instance, and the sun pass's PCSS blocker quad is a drawArrays.
  // `watch`: a GL buffer whose bytes each draw snapshots AT THE DRAW (what the vertex fetch would read then).
  const g = { mem, draws, watch: null };
  const rec = (instances) => draws.push({ instances, snap: g.watch && mem.get(g.watch) ? mem.get(g.watch).slice() : null });
  gl.drawElementsInstanced = (_m, _c, _t, _o, n) => rec(n);
  gl.drawArraysInstanced = (_m, _f, _c, n) => rec(n);
  return g;
}

async function shadowRig(t, ls = {}) {
  const fg = makeFakeGL();
  const gm = gpuModel(fg);
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  t.after(() => renderer.dispose());
  // castScene is private to shadowSys: hand it a THREE whose Scene records itself (its only Scene).
  const scenes = [];
  const T = { ...THREE, Scene: class extends THREE.Scene { constructor() { super(); scenes.push(this); } } };
  const ls0 = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => (k in ls ? ls[k] : null), setItem() {}, removeItem() {} };
  let sys;
  try { sys = globalThis.TLXShaders.shadowSys(T, TSL, { renderer, isMobile: false, softwareGL: false, isWarming: () => false }); }
  finally { globalThis.localStorage = ls0; }
  assert.equal(scenes.length, 1, "one castScene");
  assert.ok(sys.S.enabled && sys.S.lampEnabled && sys.S.carEnabled, "sun, car and lamp maps on (desktop)");
  const VP = new Float32Array(new THREE.Matrix4().elements);
  const pass = (kind, casts) => {
    if (kind === "sun") sys.shadowBegin(VP); else if (kind === "lamp") sys.lampShadowBegin(VP, 0); else sys.carShadowBegin(VP, 1);
    for (const [batch, pack, k] of casts) { batch.packMatrices = pack; sys.castInstanced(batch, k); }
    if (kind === "sun") sys.shadowEnd(); else if (kind === "lamp") sys.lampShadowEnd(); else sys.carShadowEnd();
  };
  const bytes = (fn) => { fg.reset(); gm.draws.length = 0; fn(); return fg.bytes.bufferSubData; };
  const frame = () => new Promise((r) => setTimeout(r, 5));   // the next three frame (its rAF loop ticks the node frame)
  const caster = (batch) => scenes[0].children.find((m) => m.geometry && m.geometry.userData.casterOf === batch.geo) || null;
  // The floats the GPU buffer behind the caster's instance data holds now.
  const bufOf = (batch) => renderer.backend.get(caster(batch).instanceMatrix).bufferGPU;
  const gpuRows = (batch, nf) => {
    const m = caster(batch), d = renderer.backend.get(m.instanceMatrix);
    const u8 = gm.mem.get(d.bufferGPU);
    return u8 ? Array.from(new Float32Array(u8.buffer, 0, nf)) : null;
  };
  return { fg, gm, renderer, sys, pass, bytes, frame, caster, gpuRows, bufOf };
}
function buildTri() {
  const g = new THREE.BufferGeometry();
  for (const [n, k] of [["position", 3], ["normal", 3], ["color", 3], ["mat", 1], ["trk", 3]])
    g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(k * 3).fill(0.5), k));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2]), 1));
  return g;
}
function mats(n, seed = 0) {
  const a = new Float32Array(n * 16);
  for (let i = 0; i < n; i++) a.set(new THREE.Matrix4().makeRotationY(0.01 * i + seed).setPosition(i * 0.5, seed, -i).elements, i * 16);
  return a;
}
const batchOf = (n) => ({ geo: buildTri(), instances: n, srcMatrices: mats(n), packMatrices: null, visible: n });

test("A-H4: the caster is a plain Mesh on an unpadded Stream instance buffer and ONE shared attribute depth program", async (t) => {
  const h = await shadowRig(t);
  const b1 = batchOf(40), b2 = batchOf(7);
  h.pass("sun", [[b1, mats(40, 1), 40], [b2, mats(7, 1), 7]]);
  const m = h.caster(b1);
  assert.ok(m && !m.isInstancedMesh && m.isMesh, "a plain Mesh");
  assert.ok(m.instanceMatrix.isInstancedInterleavedBuffer, "its instanceMatrix is its own instance-rate buffer");
  assert.equal(m.instanceMatrix.usage, THREE.StreamDrawUsage, "Stream: uploads what a cast wrote, nothing else");
  for (let c = 0; c < 4; c++) assert.equal(m.geometry.getAttribute("iM" + c).data, m.instanceMatrix, `iM${c} reads that buffer`);
  assert.equal(b1.geo.getAttribute("iM0"), undefined, "on the caster's clone, never the lit batch's geometry");
  assert.equal(b1._shCasterArr, m.instanceMatrix.array, "C5: the array tlx.js's shadow cull packs into");
  assert.equal(b1._shCasterArr.length, 40 * 16, "sized at the batch's 40 instances — no UBO pad");
  assert.equal(b2._shCasterArr.length, 7 * 16);
  assert.equal(m.material.customProgramCacheKey(), "ai-tlx-depth");
  assert.equal(h.caster(b2).material, m.material, "one depth material for every attribute caster");
  // The program: iM0..3 read by name, no per-object uniform block, one depth program for both casters.
  const vs = h.fg.shaders.filter((s) => /\bin\s+vec4\s+iM0\b/.test(s));
  assert.equal(vs.length, 1, "both casters (one vertex layout) share ONE depth program");
  assert.ok(!/NodeBuffer_\d+/.test(vs[0]), "no per-object NodeBuffer block (the reason for the pad)");
  assert.match(vs[0], /\biM0\b[\s\S]*\biM3\b/, "the mat4 from iM0..3");
  assert.equal(h.gm.draws.length, 2, "two render objects: one per batch caster, as before");
  assert.deepEqual(h.gm.draws.map((d) => d.instances).sort((a, b) => a - b), [7, 40], "each draws its culled count");
});

test("A-H4: sun -> lamp -> lamp -> car rewrites in ONE frame: each draw sees its own pass's rows; bytes = the rows written", async (t) => {
  const h = await shadowRig(t);
  const b = batchOf(40);
  h.pass("sun", [[b, mats(40, 1), 40]]); h.pass("lamp", [[b, mats(9, 1), 9]]);   // first sight (buffers, VAOs)
  await h.frame();
  const seq = [["sun", mats(40, 2), 40], ["lamp", mats(9, 3), 9], ["lamp", mats(9, 4), 9], ["car", mats(5, 5), 5]];
  const got = [];
  h.gm.watch = h.bufOf(b);
  for (const [kind, pack, k] of seq) {
    const by = h.bytes(() => h.pass(kind, [[b, pack, k]]));
    assert.equal(h.gm.draws.length, 1, `${kind}: one caster draw`);
    assert.equal(h.gm.draws[0].instances, k, `${kind}: ${k} instances`);
    const snap = h.gm.draws[0].snap;
    got.push({ kind, by, rows: Array.from(new Float32Array(snap.buffer, 0, k * 16)), want: Array.from(pack.subarray(0, k * 16)) });
  }
  t.diagnostic(`one frame, attribute caster: ${got.map((g) => `${g.kind} ${g.by} B`).join(", ")}`);
  for (const g of got) {
    assert.equal(g.by, g.want.length * 4, `${g.kind}: exactly its ${g.want.length / 16} rows, not the whole buffer`);
    assert.deepEqual(g.rows, g.want, `${g.kind}: at its draw the GPU holds THIS pass's rows — never an earlier pass's`);
  }
});

test("A-H4 control: the same instrument catches the hazard — a Stream InstancedMesh caster redrawn after a rewrite draws stale rows", async (t) => {
  // tlxCasterAttr=0 with the caster's InstancedBufferAttribute forced to Stream: three relays its matrices into the
  // buffer it draws once per frame per render object, so the second lamp pass of the frame reads the first's rows.
  const IBA = THREE.InstancedBufferAttribute.prototype, own = Object.prototype.hasOwnProperty.call(IBA, "setUsage"), base = IBA.setUsage;
  IBA.setUsage = function () { return base.call(this, THREE.StreamDrawUsage); };
  try {
    const h = await shadowRig(t, { "apex26.tlxCasterAttr": "0" });
    const b = batchOf(40);
    h.pass("sun", [[b, mats(40, 1), 40]]); h.pass("lamp", [[b, mats(9, 1), 9]]);
    await h.frame();
    // The buffer it draws is three's relay of instanceMatrix (InstanceNode): the one GL buffer of the padded size.
    const pad = h.caster(b).instanceMatrix.count * 64;
    const drawn = [...h.gm.mem.entries()].filter(([, u8]) => u8.length === pad).map(([k]) => k);
    assert.equal(drawn.length, 1, "one padded instance buffer");
    h.gm.watch = drawn[0];
    const rows = (k) => { const s = h.gm.draws[0].snap; return Array.from(new Float32Array(s.buffer, 0, k * 16)); };
    h.bytes(() => h.pass("lamp", [[b, mats(9, 3), 9]]));
    assert.deepEqual(rows(9), Array.from(mats(9, 3)), "the frame's first lamp draw is relayed");
    h.bytes(() => h.pass("lamp", [[b, mats(9, 4), 9]]));
    assert.deepEqual(rows(9), Array.from(mats(9, 3)), "the second draws the FIRST pass's rows: stale — what the attribute caster cannot do");
  } finally { if (own) IBA.setUsage = base; else delete IBA.setUsage; }
});

test("A-H4: C5's in-place shadow pack (packMatrices === the caster's array) uploads and draws the packed rows", async (t) => {
  const h = await shadowRig(t);
  const b = batchOf(30);
  h.pass("sun", [[b, mats(30, 1), 30]]);
  await h.frame();
  for (const [kind, k, seed] of [["sun", 12, 7], ["lamp", 4, 8]]) {
    const dst = b._shCasterArr;
    dst.set(mats(k, seed));   // tlx.js cullInstances packs straight into it
    const by = h.bytes(() => h.pass(kind, [[b, dst, k]]));
    assert.equal(by, k * 64, `${kind}: the packed ${k} rows`);
    assert.deepEqual(h.gpuRows(b, k * 16), Array.from(mats(k, seed)), `${kind}: drawn from the packed rows`);
  }
});

test("A-H4: a render that wrote nothing (the draw warm over every caster) uploads 0 B; the padded Dynamic caster re-sends it all", async (t) => {
  const run = async (ls) => {
    const h = await shadowRig(t, ls);
    const b1 = batchOf(40), b2 = batchOf(25);
    h.pass("sun", [[b1, mats(40, 1), 40], [b2, mats(25, 1), 25]]);
    h.sys.drawWarm();   // first sight in the scratch targets' contexts
    await h.frame();
    const rebuild = h.bytes(() => h.pass("sun", [[b1, mats(40, 2), 40], [b2, mats(25, 2), 25]]));
    const again = h.bytes(() => h.sys.drawWarm());   // casters drawn again in the same frame, nothing rewritten
    return { h, rebuild, again };
  };
  const on = await run({});
  const off = await run({ "apex26.tlxCasterAttr": "0" });
  t.diagnostic(`sun rebuild of 2 casters (40 + 25 rows): attribute ${on.rebuild} B, padded Dynamic ${off.rebuild} B`);
  t.diagnostic(`then a same-frame redraw with no write: attribute ${on.again} B, padded Dynamic ${off.again} B`);
  assert.equal(on.rebuild, 65 * 64, "the rebuild: its 65 rows");
  assert.equal(on.again, 0, "attribute caster: nothing written, nothing sent");
  assert.equal(off.rebuild, 65 * 64, "control: the first draw of the frame sends the written range on the old path too");
  const pad = globalThis.TLXShaders.uboInstCap(off.h.renderer, 1);
  assert.ok(pad > 40, `control: the padded caster holds max(n, limit / 64 + 1) = ${pad} rows`);
  assert.ok(off.again >= 2 * pad * 64, `control: Dynamic re-sends BOTH whole padded arrays (${off.again} B) on a draw that wrote nothing`);
});

test("A-H4: apex26.tlxCasterAttr=0 is today's caster exactly — padded InstancedMesh, Dynamic, the plain depth material", async (t) => {
  const h = await shadowRig(t, { "apex26.tlxCasterAttr": "0" });
  const b = batchOf(40);
  h.pass("sun", [[b, mats(40, 1), 40]]);
  const m = h.caster(b);
  assert.ok(m.isInstancedMesh, "an InstancedMesh");
  assert.equal(m.instanceMatrix.usage, THREE.DynamicDrawUsage, "Dynamic");
  assert.equal(m.count, 40);
  assert.equal(m.instanceMatrix.count, globalThis.TLXShaders.uboInstCap(h.renderer, 40), "padded past the UBO limit");
  assert.equal(m.material.customProgramCacheKey(), "tlx-depth", "the plain depth material");
  assert.equal(m.geometry.getAttribute("iM0"), undefined, "no attribute instance stream");
  assert.equal(b._shCasterArr, m.instanceMatrix.array);
  assert.ok(h.fg.shaders.every((s) => !/\bin\s+vec4\s+iM0\b/.test(s)), "no attribute-step program was built");
});

test("A-H4: freeInstanced / a geometry swap drop the attribute caster's render object and clone; the knob is read once", async (t) => {
  const h = await shadowRig(t);
  const b = batchOf(10);
  h.pass("sun", [[b, mats(10, 1), 10]]);
  const m = h.caster(b);
  let disposed = 0, geoDisposed = 0;
  m.addEventListener("dispose", () => disposed++);
  m.geometry.addEventListener("dispose", () => geoDisposed++);
  b.geo = buildTri();   // the batch rebuilt its geometry: a new caster on the next cast
  h.pass("sun", [[b, mats(10, 2), 10]]);
  assert.equal(disposed, 1, "the old caster's dispose event (drops its render object; a Mesh has no dispose())");
  assert.equal(geoDisposed, 1, "and its clone geometry (frees the instance buffer)");
  const m2 = h.caster(b);
  assert.ok(m2 && m2 !== m && !m2.isInstancedMesh);
  let d2 = 0; m2.addEventListener("dispose", () => d2++);
  h.sys.freeInstanced(b);
  assert.equal(d2, 1);
  assert.equal(h.caster(b), null, "gone from castScene");
  assert.equal(b._shCasterArr, null, "C5: never pack into a freed caster");
  assert.match(SHADOW, /let casterAttr = true;\s*try \{ casterAttr = localStorage\.getItem\("apex26\.tlxCasterAttr"\) !== "0"; \}/);
  assert.equal((SHADOW.match(/apex26\.tlxCasterAttr/g) || []).length, 3, "read in one place (+ two comments)");
});

// ── B-F3.1 ───────────────────────────────────────────────────────────────────────────────────────────────────────
const tslice = (from, to) => {
  const a = TLX.indexOf(from), b = TLX.indexOf(to, a);
  assert.ok(a > 0 && b > a, `tlx.js block "${from.trim()}" moved — check this test, not the code`);
  return TLX.slice(a, b);
};
// The REAL wantMirrorWarm / mirrorWarmGate block (+ the knob), prepareMirrorTarget, the mirror swap, the ssrTag MRT
// node and the whole warm (W1's draw stage, warmMirrorStage, startProgramWarm, startMirrorWarm) over three r186 on
// the fake WebGL2 with the real lit material, post chain and shadow subsystem. Stand-ins: the store (hudMirror /
// bcPip), the sky, the late-lit / FX compiles, the instance registry, the soft-adapter verdicts, and the two call
// sites — mirrorBegin's refusal order and present()'s warm dispatch, both pinned to the real source below.
async function mirrorWarmRig(t, { ls = {}, store = {}, soft = false } = {}) {
  ls = { "apex26.tlxMirWarmLazy": "1", ...ls };   // opt-in since the B-F3.1 decision: these cases exercise the lazy path
  const fg = makeFakeGL(320, 180);
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  t.after(() => renderer.dispose());
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
  const VPm = new Float32Array(new THREE.Matrix4().elements);
  shadowSys.shadowBegin(VPm); shadowSys.castShadow({ geo: g }, new Float32Array(new THREE.Matrix4().elements)); shadowSys.shadowEnd();
  const GameStore = { store: { get: (k, d) => (k in store ? store[k] : d), raw: () => null } };
  const mk = new Function("THREE", "TSL", "renderer", "scene", "camera", "lit", "post", "shadowSys", "localStorage", "Log", "SOFT", "GameStore", `"use strict";
    let mirRT = null, mirCam = null, _mirRect = null, _mirUsed = false, _glassProbeGeo = null, _mirDead = false;
    const W = 320, H = 180, presentW = 320, presentH = 180, wantSpatialUpscale = () => false;
    const _instPerPass = true, skipBatches = () => false, _instRegistry = [], _mirOf = () => null;
    const fx = null, vizMat = null, softGpu = () => SOFT, softwareGL = SOFT, softContent = () => false, _warmFx = true;
    const pinSkyMaterial = () => {}, mintLateLit = () => {}, warmFxPrograms = async () => {}, warmLateLit = async () => {};
    const warmPlusOn = () => true, softOutRT = () => null;
    const I = new THREE.Matrix4().toArray();
    const _postF = { proj: I, invProj: I, invVP: I, viewProj: I, upVS: [0, 1, 0], time: 0, sunVS: [0, 0, -1] };
    const _warmStages = { at: 0, scene: null, fx: null, post: null, shadow: null, draw: null, drawn: null, total: null, attempts: 0, failed: 0,
      mirrorDeferred: false, mirrorLazy: null };
    let _warmAt = 0, _warmAttempts = 0, _warmPending = null, _warmRequested = false, _warmDone = false, _gpuLastOperation = "", _deviceLost = false;
    ${tslice("      // B-F3.1 (perf hunt 4) — THE MIRROR WARM, DEFERRED", "      // forWarm: the warm compiles the scene into mirRT next")}
    ${tslice("      function prepareMirrorTarget(w, h, forWarm) {", "      // TLX opts out of the live env probe by default")}
    ${tslice("      function _mirWarmSwap() {", "      function _showInstanced(rec, order) {")}
    ${tslice("      let _ssrMrt = null;", "      let _poolNow = ")}
    ${tslice("      // A-W1 (perf hunt 4): THE DRAW WARM.", "      const ENV_PROBE_TRIES")}
    // mirrorBegin's refusals, in the real order (pinned below), and present()'s warm dispatch line, verbatim.
    function mirrorBegin() {
      if (_mirDead || _warmPending) return false;
      if (mirrorWarmGate()) return false;
      prepareMirrorTarget(64, 32);
      _mirUsed = true;
      return true;
    }
    function present(opts) {
      if (!_warmPending && !_deviceLost) { if (_warmRequested) startProgramWarm(opts); else if (_mirWarmReq) startMirrorWarm(opts); }
      return !_warmPending;   // false: present() returns before painting
    }
    return { mirrorBegin, present, request: () => { _warmRequested = true; _warmAttempts = 0; }, pending: () => _warmPending,
      warming: () => !!_warmPending, stages: _warmStages, mirRT: () => mirRT, mirUsed: () => _mirUsed,
      owed: () => _mirWarmOwed, lazyOn: _mirWarmLazy };`);
  const R = mk(THREE, TSL, renderer, scene, camera, lit, post, shadowSys, { getItem: (k) => (k in ls ? ls[k] : null) },
    globalThis.Log, soft, GameStore);
  // Every compileAsync and render, with the target it ran against.
  const compiles = [], draws = [];
  const c0 = renderer.compileAsync.bind(renderer), r0 = renderer.render.bind(renderer);
  renderer.compileAsync = (...a) => { compiles.push(renderer.getRenderTarget()); return c0(...a); };
  renderer.render = (sc, cam) => { const tg = renderer.getRenderTarget(); draws.push({ tg, size: tg ? [tg.width, tg.height] : null }); return r0(sc, cam); };
  const OPTS = { ssao: 0.5, bloom: 0.5, godray: 0, reflect: 0.2, exposure: 1 };
  // The entry warm: requested at race setup, started by the next present().
  const entry = async () => { R.request(); R.present(OPTS); await R.pending(); };
  const mirrorCompiles = () => compiles.filter((tg) => tg && tg === R.mirRT()).length;
  const mirrorDraws = () => draws.filter((d) => d.size && d.size[0] === 4 && d.size[1] === 4).length;
  return { renderer, R, compiles, draws, entry, OPTS, mirrorCompiles, mirrorDraws };
}

test("B-F3.1: AUTO on a real GPU — the entry warm skips the mirror stage and W1's mirror draw, and owes them", async (t) => {
  const h = await mirrorWarmRig(t);
  assert.equal(h.R.lazyOn, true, "lazy by default");
  await h.entry();
  const s = h.R.stages;
  assert.equal(s.failed, 0);
  assert.equal(s.mirror, null, "race.warm.mirror: no mirror stage at the lights");
  assert.equal(s.mirrorDeferred, true, "race.warm.mirrorDeferred");
  assert.equal(h.R.mirRT(), null, "no mirror target allocated");
  assert.equal(h.mirrorDraws(), 0, "no 4x4 mirror draw");
  assert.equal(s.drawn.mirror, 0);
  assert.ok(s.drawn.scene === 1 && s.drawn.post >= 3 && s.drawn.casts >= 1, "the rest of the draw warm is untouched");
  assert.equal(h.R.mirUsed(), true, "_mirUsed latched as an eager warm latches it (CPU attribute mirrors kept)");
  assert.equal(h.R.owed(), true, "owed to the first mirror demand");
  t.diagnostic(`entry warm, AUTO: ${h.compiles.length} compileAsync calls, ${h.draws.length} draws, mirror stage skipped`);
});

test("B-F3.1: the first mirrorBegin refuses, present() runs the mirror stage alone, owned; the next mirrorBegin draws", async (t) => {
  const h = await mirrorWarmRig(t);
  await h.entry();
  const nC = h.compiles.length, nD = h.draws.length;
  assert.equal(h.R.mirrorBegin(), false, "first demand: refused — no frame draws the mirror before its programs exist");
  assert.equal(h.R.mirRT(), null, "and nothing was allocated or drawn for it");
  const target0 = h.renderer.getRenderTarget(), mrt0 = h.renderer.getMRT();
  assert.equal(h.R.present(h.OPTS), false, "present() starts the deferred stage and paints nothing (game.js pauses on warming())");
  assert.equal(h.R.warming(), true);
  assert.equal(h.R.mirrorBegin(), false, "refused while it is in flight");
  await h.R.pending();
  assert.equal(h.R.warming(), false);
  const lazy = h.R.stages.mirrorLazy;
  assert.ok(lazy && lazy.ok === true && lazy.drawn === 1 && lazy.ms >= 0, `memState().warm.mirrorLazy ${JSON.stringify(lazy)}`);
  assert.ok(h.mirrorCompiles() >= 1, "the mirror's world compiled into the mirror target's context");
  assert.equal(h.mirrorDraws(), 1, "W1's 4x4 mirror draw");
  const late = h.draws.slice(nD);
  assert.ok(late.every((d) => d.size && d.size[0] === 4), "the deferred stage draws the mirror only — never the scene, post or casters again");
  assert.ok(h.compiles.length - nC >= 2, "world + composite compiles");
  assert.equal(h.R.stages.mirror, null, "the entry warm's own numbers stand");
  assert.equal(h.renderer.getRenderTarget(), target0, "target restored");
  assert.equal(h.renderer.getMRT(), mrt0, "MRT restored");
  assert.equal(h.R.owed(), false);
  assert.equal(h.R.mirrorBegin(), true, "the next demand draws, its programs compiled");
  assert.equal(h.R.present(h.OPTS), true, "and nothing more is warmed");
});

test("B-F3.1: the default (unset), apex26.tlxMirWarmLazy=0, an explicit ON, a PiP ON warm eagerly; OFF and a software GPU owe nothing (today)", async (t) => {
  for (const [name, opt] of [["default (unset)", { ls: { "apex26.tlxMirWarmLazy": null } }], ["knob 0", { ls: { "apex26.tlxMirWarmLazy": "0" } }], ["hudMirror on", { store: { hudMirror: "on" } }],
    ["bcPip on", { store: { bcPip: "on" } }]]) {
    const h = await mirrorWarmRig(t, opt);
    await h.entry();
    assert.equal(typeof h.R.stages.mirror, "number", `${name}: the mirror stage ran at the lights`);
    assert.equal(h.R.stages.mirrorDeferred, false, `${name}: not deferred`);
    assert.equal(h.mirrorDraws(), 1, `${name}: W1's 4x4 mirror draw`);
    t.diagnostic(`entry warm, ${name}: ${h.compiles.length} compileAsync calls (${h.mirrorCompiles()} into the mirror target), ${h.draws.length} draws`);
    assert.equal(h.R.owed(), false);
    assert.equal(h.R.mirrorBegin(), true, `${name}: the first mirror frame draws at once, as today`);
  }
  for (const [name, opt] of [["both off", { store: { hudMirror: "off", bcPip: "off" } }], ["software GPU", { soft: true, ls: { "apex26.tlxDrawWarm": "1" } }]]) {
    const h = await mirrorWarmRig(t, opt);
    await h.entry();
    assert.equal(h.R.stages.mirror, null, `${name}: no mirror stage (unchanged)`);
    assert.equal(h.R.stages.mirrorDeferred, false, `${name}: nothing owed`);
    assert.equal(h.R.mirUsed(), false, `${name}: _mirUsed untouched (unchanged)`);
    assert.equal(h.R.mirrorBegin(), true, `${name}: a forced mirror takes today's cold path`);
  }
});

test("B-F3.1: every entry warm re-decides — a race after one that used the mirror defers it again", async (t) => {
  const h = await mirrorWarmRig(t);
  await h.entry();
  h.R.mirrorBegin(); h.R.present(h.OPTS); await h.R.pending();
  assert.equal(h.R.mirrorBegin(), true);
  await h.entry();   // the next race
  assert.equal(h.R.stages.mirrorDeferred, true);
  assert.equal(h.R.owed(), true);
  // A demand that never reaches present() (no request yet) leaves it owed: the gate holds until the stage runs.
  assert.equal(h.R.mirrorBegin(), false);
  assert.equal(h.R.mirrorBegin(), false, "still refused until present() has run the stage");
});

test("B-F3.1: tlx.js wiring — mirrorBegin's gate after the in-flight refusal, present()'s dispatch, the knob read once", () => {
  const mb = TLX.slice(TLX.indexOf("        mirrorBegin(frame, w, h) {"), TLX.indexOf("        mirrorEnd() {"));
  assert.match(mb, /if \(_mirDead \|\| _warmPending \|\| [^\n]*\) return false;\n\s*if \(mirrorWarmGate\(\)\) return false;/,
    "the gate right after the in-flight refusal, before any target is made");
  assert.ok(mb.indexOf("mirrorWarmGate()") < mb.indexOf("prepareMirrorTarget(w, h)"));
  assert.match(TLX, /\n\s*if \(!_warmPending && !_deviceLost\) \{ if \(_warmRequested\) startProgramWarm\(opts\); else if \(_mirWarmReq\) startMirrorWarm\(opts\); \}\n\s*if \(_warmPending\) return;/,
    "present() starts it where it starts the entry warm, and paints nothing while it runs");
  assert.match(TLX, /let _mirWarmLazy = false;\s*try \{ _mirWarmLazy = localStorage\.getItem\("apex26\.tlxMirWarmLazy"\) === "1"; \}/, "opt-in: unset is the eager stage");
  assert.equal((TLX.match(/localStorage\.getItem\("apex26\.tlxMirWarmLazy"\)/g) || []).length, 1, "read once");
  assert.match(TLX, /mirrorDeferred: _warmStages\.mirrorDeferred, mirrorLazy: _warmStages\.mirrorLazy/, "memState().warm reports both");
  // The mirror stage is ONE function shared by both warms (no drift between the eager and the deferred compiles).
  assert.equal((TLX.match(/await warmMirrorStage\(usePost, useTag\);/g) || []).length, 2);
  assert.equal((TLX.match(/prepareMirrorTarget\(16, 8, true\)/g) || []).length, 1);
});

// F5: execute the real TSL factory and inspect CPU uniforms; no rendered-pixel claim.
test("TLX ambient fill preserves zero and proportional positive multipliers", () => {
  const lit = globalThis.TLXShaders.lit(THREE, TSL, {
    chunks: globalThis.TLXShaders.chunks(THREE, TSL), shadow: null,
    ssrTag: false, envCube: null, matMaps: null, lampGrid: null,
    sharedUniforms: true, maxLights: 16,
  });
  const sky = [0.3, 0.32, 0.36], ground = [0.2, 0.19, 0.18];
  for (const multiplier of [undefined, null, 1, 0.5, 0.005, 0, 1]) {
    const frame = { sunDir: [0, 1, 0], sunColor: [1, 1, 1], ambientSky: sky, ambientGround: ground };
    if (multiplier !== undefined) frame.tune = { ambientMul: multiplier };
    lit.updateFrame(frame);
    const expected = multiplier == null ? 1 : multiplier;
    assert.deepEqual(lit.uniforms.ambSky.value.toArray(), sky.map((v) => v * expected), `sky multiplier ${multiplier}`);
    assert.deepEqual(lit.uniforms.ambGround.value.toArray(), ground.map((v) => v * expected), `ground multiplier ${multiplier}`);
    assert.deepEqual(lit.uniforms.sunColor.value.toArray(), [1, 1, 1], "unscaled vector uniforms keep their default multiplier");
  }
});
