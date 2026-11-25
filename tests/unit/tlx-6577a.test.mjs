/* #6577 batch A (render perf hunt 2026-11-25, rows 2 / 5 / 6). No browser, no GPU: three r187's REAL
 * WebGPURenderer({ forceWebGL }) over a no-op WebGL2 context (tests/helpers/fake-webgl2.mjs) counting
 * bufferSubData bytes, the REAL tsl-lit factory and the REAL tlx.js / glx.js functions sliced out of create().
 * A unit test of a backend is not evidence it runs: CI's browser tiers and gpu-census.yml are.
 *   row 2  a Dynamic InstancedMesh run drawn by a second render() with no re-arm uploads its whole capacity; the
 *          XR eye loop (the one pass tlx.js renders twice) re-arms the blob / decal runs before each later eye.
 *   row 5  lit.updateFrame = updateFrameShared + updateView; the mirror's full update followed by the main view's
 *          updateView leaves every uniform exactly where a full main update does.
 *   row 6  drawGlow (TLX and GLX) repacks and uploads only when a packed halo value moved. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeFakeGL, installThreeGlobals } from "../helpers/fake-webgl2.mjs";
import { fnSource } from "../helpers/fn-source.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const TLX = read("js/render/three/tlx.js");
const GLX = read("js/render/glx/glx.js");

installThreeGlobals();
globalThis.Log = globalThis.Log || { info() {}, warn() {}, error() {}, debug() {} };
if (!globalThis.localStorage) globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const THREE = await import(pathToFileURL(path.join(ROOT, "vendor/three-0.187.0/three.webgpu.min.js")).href);
const TSL = THREE.TSL;
for (const f of ["js/render/shared/light-budget.js", "js/lighting/knobs.js", "js/render/three/tsl-chunks.js",
  "js/render/three/tsl-lit.js"])
  vm.runInThisContext(read(f), { filename: absSrc(f) });

// ---- row 2 ------------------------------------------------------------------------------------------------------
test("#6577 row 2: a second render() of a Dynamic run re-sends its capacity unless re-armed; _rearmRuns re-arms", async (t) => {
  const fg = makeFakeGL();
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  t.after(() => renderer.dispose());
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  camera.position.z = 5; camera.updateMatrixWorld();
  const CAP = 257, mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const mk = () => {
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, CAP);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.count = 2; im.visible = true;
    scene.add(im);
    return { imesh: im, visible: 2 };
  };
  // The REAL setRange0 and _rearmRuns over a blob run and one decal run.
  const api = new Function("_blob", "_decalRuns", `"use strict";
    ${fnSource(TLX, "function setRange0(attr, count) {")}
    ${fnSource(TLX, "function _rearmRuns() {")}
    ${fnSource(TLX, "function _rearmRun(b) {")}
    return { setRange0, _rearmRuns };`);
  const blob = mk(), decal = mk(), R = api(blob, new Map([["geo", decal]]));
  const append = () => { for (const b of [blob, decal]) { R.setRange0(b.imesh.instanceMatrix, b.visible * 16); b.imesh.instanceMatrix.needsUpdate = true; } };
  append(); renderer.render(scene, camera);   // first sight: buffers created
  const bytes = (fn) => { fg.reset(); fn(); return fg.bytes.bufferSubData; };
  const one = bytes(() => { append(); renderer.render(scene, camera); });
  assert.equal(one, 2 * 2 * 64, "an armed pass uploads only the 2 live instances of each run");
  const twice = bytes(() => { append(); renderer.render(scene, camera); renderer.render(scene, camera); });
  assert.equal(twice, one + 2 * CAP * 64, "the unarmed second render() re-sends both runs whole (the hunt's mechanism)");
  const rearmed = bytes(() => { append(); renderer.render(scene, camera); R._rearmRuns(); renderer.render(scene, camera); });
  assert.equal(rearmed, 2 * one, "re-armed, the second render() uploads the live instances only");
  // A hidden or empty run is left alone (nothing would draw it).
  decal.imesh.visible = false; blob.visible = 0;
  blob.imesh.instanceMatrix.updateRanges.length = 0; decal.imesh.instanceMatrix.updateRanges.length = 0;
  R._rearmRuns();
  assert.equal(blob.imesh.instanceMatrix.updateRanges.length + decal.imesh.instanceMatrix.updateRanges.length, 0);
});

test("#6577 row 2: tlx.js wiring — the XR eye loop re-arms before every eye after the first", () => {
  assert.match(TLX, /_gpuLastOperation = "render-xr-" \+ ei;\n\s*if \(ei > 0\) _rearmRuns\(\);[^\n]*\n\s*_renderTimed\(scene, camera\);/);
});

// ---- row 5 ------------------------------------------------------------------------------------------------------
const mkLit = () => globalThis.TLXShaders.lit(THREE, TSL, { chunks: globalThis.TLXShaders.chunks(THREE, TSL), shadow: null,
  ssrTag: false, envCube: null, matMaps: null, lampGrid: null, sharedUniforms: true, maxLights: 16 });
const snap = (lit) => {
  const out = {};
  for (const k of Object.keys(lit.uniforms)) {
    const v = lit.uniforms[k].value;
    out[k] = v && typeof v.toArray === "function" ? v.toArray() : Array.isArray(v) ? v.map((e) => (e && e.toArray ? e.toArray() : e)) : v;
  }
  return out;
};
const lamp = (x, r) => [x, 4, 2, r, r * 0.8, r * 0.5, 20, 0, -1, 0, 0.5, 0.9, 1, 1, 1];

test("#6577 row 5: mirror updateFrame + main updateView leaves the uniforms exactly where a full main update does", () => {
  const tune = { ambientMul: 0.8, fogDensityMul: 1.3, keyMul: 1.2, glowAmp: 2.0, carSunGlint: 9, carSparkle: 1.1, windowSunFlash: 0.7 };
  const main = {
    tune, sunDir: [0.3, 0.8, 0.1], sunColor: [1.1, 1.0, 0.9], ambientSky: [0.3, 0.3, 0.4], ambientGround: [0.2, 0.2, 0.1],
    skyZenith: [0.1, 0.3, 0.7], skyHorizon: [0.6, 0.7, 0.8], fogColor: [0.4, 0.4, 0.5], fogDensity: 0.002, fogHeight: 3,
    groundMist: 0.4, lampFog: 0.2, wetness: 0.3, rain: 0.1, time: 12.5, cloud: 0.4, cloudSpeed: 1.2,
    pitLane: [1, 2, 3, 4], pitBox: [5, 6], lights: [...lamp(10, 30), ...lamp(40, 60), ...lamp(80, 90)], brakeSpillCount: 0,
    chunkLampCap: 0, eye: [0, 1, 0],
  };
  // The mirror pass as mirror-pass.js builds it on the SAME frame: MIRROR_TUNE over the main tune, its own lamps
  // and lamp cap, its own eye; game.js thins frame.fogDensity around begin() only, so the main view sees another.
  const mirror = Object.assign({}, main, {
    tune: Object.assign(Object.create(tune), { carSunGlint: 0, carSparkle: 0, windowSunFlash: 0, shadowStr: 0 }),
    lights: lamp(5, 200), mirrorLampCap: 4, eye: [0, 1, -3],
  });
  const thinned = Object.assign({}, main, { fogDensity: main.fogDensity * 0.5 });

  const full = mkLit(), split = mkLit();
  assert.equal(typeof split.updateView, "function", "updateView is exported");
  for (const frame of [main, thinned]) {
    full.updateFrame(mirror, true); full.updateFrame(frame);    // before: two whole updates
    split.updateFrame(mirror, true); split.updateView(frame, false);   // after: the shared half once
    assert.deepEqual(snap(split), snap(full), "every uniform matches");
  }
  assert.equal(split.uniforms.numLights.value, 3, "the main view's lamps, not the mirror's");
  assert.equal(split.uniforms.carSunGlint.value, 9, "MIRROR_TUNE is undone by the main view");
  assert.ok(Math.abs(split.uniforms.fogDensity.value - 0.001 * 1.3) < 1e-12, "the thinned fog of the main view");
});

test("#6577 row 5: mirrorBegin marks the frame; begin() takes updateView only for that frame", () => {
  const mb = TLX.slice(TLX.indexOf("        mirrorBegin(frame, w, h, rearView) {"), TLX.indexOf("        mirrorEnd() {"));
  assert.match(mb, /_litSharedFor = frame;[^\n]*\n\s*return true;\n\s*\},\s*$/, "marked last, on the success path");
  // begin()'s REAL lit-update block, run over a stub lit: the mark is consumed and cleared on every begin().
  const b0 = TLX.indexOf("const litShared = _litSharedFor === frame"), END = "else lit.updateFrame(frame);";
  const b1 = TLX.indexOf(END, b0);
  assert.ok(b0 > 0 && b1 > b0 && b1 - b0 < 400, "begin()'s lit block is one short span");
  const run = new Function("st", "lit", "frame", `"use strict"; let _litSharedFor = st.mark;
    ${TLX.slice(b0, b1 + END.length)} }
    st.mark = _litSharedFor;`);
  const calls = [], lit = { updateView: (f, full) => calls.push(["view", f, full]), updateFrame: (f) => calls.push(["frame", f]) };
  const f1 = {}, f2 = {}, st = { mark: f1 };
  run(st, lit, f1);
  assert.deepEqual(calls, [["view", f1, false]], "the marked frame takes updateView only");
  assert.equal(st.mark, null, "the mark is cleared");
  calls.length = 0; run(st, lit, f1);
  assert.deepEqual(calls, [["frame", f1]], "the next begin() of the same frame, unmarked, takes the whole update");
  calls.length = 0; st.mark = f1; run(st, lit, f2);
  assert.deepEqual(calls, [["frame", f2]], "a mark for another frame is not honoured");
  assert.equal(st.mark, null, "and is cleared all the same");
  calls.length = 0; st.mark = f1; run(st, { updateFrame: lit.updateFrame }, f1);
  assert.deepEqual(calls, [["frame", f1]], "a lit without updateView takes the whole update");
});

// ---- row 6 ------------------------------------------------------------------------------------------------------
const glowLight = (x = 10, glare = 1) => [x, 0, 0, 10, 20, 30, 20, 0, 0, 0, 0, 0, 0, 0, glare];
const glowSet = (xs) => new Float32Array(xs.flatMap((x) => glowLight(x)));

test("#6577 row 6: TLX drawGlow uploads only when a packed halo moved", () => {
  const glowStream = { geo: null, ib: null, cap: 0 }, records = [];
  const ctx = { THREE, Float32Array, Math, glowStream, _instUsage: THREE.StreamDrawUsage,
    _glowCorners: JSON.parse(TLX.match(/const _glowCorners = (\[[^;]+\]);/)[1]), frameEye: [0, 0, 0], _fxFrame: {},
    fx: { glowStr: { value: 0 }, glowMat: {} }, disposeGeometry(g) { g.dispose(); }, pushRec(...a) { records.push(a); } };
  const fns = ["function ensureGlowStream(instances, slot = glowStream) {", "function uploadStream(slot, floats) {",
    "function setRange0(attr, count) {"].map((d) => fnSource(TLX, d)).join("\n");
  const api = vm.runInNewContext(`${fns};({drawGlow:${fnSource(TLX, "drawGlow(lights, str) {").replace(/^drawGlow/, "function")}})`,
    ctx, { filename: absSrc("js/render/three/tlx.js") });
  const ib = () => glowStream.ib;
  api.drawGlow(glowSet([10, 20, 30]), 1);
  const v0 = ib().version, packed = ib().array.slice(0, 21);
  api.drawGlow(glowSet([10, 20, 30]), 2);   // a fresh copy, same values (frame.lights every frame)
  assert.equal(ib().version, v0, "unchanged halos: no upload");
  assert.equal(glowStream.geo.instanceCount, 3); assert.equal(records.length, 2, "still drawn");
  assert.equal(ctx.fx.glowStr.value, 2, "str is a uniform, never a reason to upload");
  api.drawGlow(glowSet([10, 20]), 1);   // shrink: the live prefix is already on the GPU
  assert.equal(ib().version, v0); assert.equal(glowStream.geo.instanceCount, 2);
  api.drawGlow(glowSet([10, 25, 30]), 1);   // one lamp moved
  assert.equal(ib().version, v0 + 1, "a moved halo uploads");
  assert.equal(ib().updateRanges[0].count, 21, "the whole live prefix");
  assert.deepEqual(Array.from(ib().array.slice(0, 7)), Array.from(packed.slice(0, 7)));
  assert.equal(ib().array[7], 25);
  ctx.frameEye = [0, 0, 80];   // the eye moved: every fade changes
  api.drawGlow(glowSet([10, 25, 30]), 1);
  assert.equal(ib().version, v0 + 2);
});

test("#6577 row 6: GLX drawGlow repacks and uploads only when a lamp's values moved; a new VBO re-uploads", () => {
  const calls = [];
  const gl = new Proxy({}, { get: (_, k) => (k in glStub ? glStub[k] : () => {}) });
  const glStub = { ARRAY_BUFFER: 1, DYNAMIC_DRAW: 2, ONE: 3, SRC_ALPHA: 4, ONE_MINUS_SRC_ALPHA: 5, TRIANGLES: 6,
    bufferData: (...a) => calls.push(["bufferData", a[1]]), bufferSubData: (...a) => calls.push(["bufferSubData", a[4], a[2].slice(0, a[4])]),
    drawArrays: (...a) => calls.push(["draw", a[2]]) };
  const at = GLX.indexOf("  const _glowCorners = "), end = GLX.indexOf("\n  }\n", GLX.indexOf("  function drawGlow(lights, str) {")) + 4;
  const state = vm.runInNewContext(`
    let glowProg = {}, glowU = {}, glowVAO = {}, glowVBO = { id: 1 }, glowCap = 0, glowData = null, glowUpVBO = null;
    let frameEye = [0, 0, 0], frameViewProj = new Float32Array(16);
    const ctxGone = () => false, frontCCW = () => {}, useProg = () => {}, bindVAO = () => {}, setBlend = () => {},
      setDepthMask = () => {}, setCull = () => {}, setAlphaWrite = () => {};
    ${GLX.slice(at, end)}
    ({ drawGlow, newVBO() { glowVBO = { id: 2 }; } });`, { gl, Float32Array, Math }, { filename: absSrc("js/render/glx/glx.js") });
  const ups = () => calls.filter((c) => c[0] === "bufferSubData");
  state.drawGlow(glowSet([10, 20]), 1);
  assert.equal(ups().length, 1); assert.equal(ups()[0][1], 2 * 54);
  const first = ups()[0][2];
  state.drawGlow(glowSet([10, 20]), 1);
  assert.equal(ups().length, 1, "unchanged: no bufferSubData");
  assert.equal(calls.filter((c) => c[0] === "draw").length, 2, "still drawn");
  state.drawGlow(glowSet([10, 21]), 1);
  assert.equal(ups().length, 2, "a moved lamp uploads");
  assert.deepEqual(Array.from(ups()[1][2].slice(0, 54)), Array.from(first.slice(0, 54)), "the unchanged lamp keeps its packing");
  assert.equal(ups()[1][2][54 + 2], 21);
  state.newVBO();   // a restored context: new VBO, no storage
  state.drawGlow(glowSet([10, 21]), 1);
  assert.equal(ups().length, 3, "a new VBO uploads although nothing moved");
  assert.deepEqual(calls.filter((c) => c[0] === "bufferData").map((c) => c[1]), [2 * 54 * 4, 2 * 54 * 4], "and allocates first");
});
