/* TLX perf hunt 3, lane TLX-1 (2026-10-13). No browser, no GPU: three r186's REAL WebGPURenderer({ forceWebGL })
 * over a no-op WebGL2 context (tests/helpers/fake-webgl2.mjs) compiles the REAL tsl-lit material, so a test can
 * read the GLSL it generated (the hunt-1 codegen-dump method); the rest are source pins on tlx.js / tlx-post.js.
 * A unit test of a backend is not evidence it runs: the follow-up is gfx-probe + gpu-census.yml (macos).
 *   R4  no env cube target / sampler while TLX is opted out of the live env probe
 *   R3  phone MEDIUM: one-attachment scene target, no ssrTag MRT, a distinct fallback in the composite's tag slot
 *   R7  dry-day SSR gate on po.reflect (game.js, every backend), behind apex26.ssrDayGate (default OFF)
 *   R9  the particle / rain stream wraps the producer's array instead of copying it per upload
 *   R13 the chunk-cull scratch list keeps its backing store; refuseTab is minted once per renderer
 *   R6  pooled wrappers hang off a pool root listing only this pass's draws
 *   R5  apex26.tlxSkyCache512 (default OFF) sizes the cloud cache
 *   R1  (lane TLX-2) the field's opaque wheel layers coalesce into one attribute-instanced run per mesh and pass
 *   B14 (lane TLX-2) the lit textures in renderGroup through vendor patch §13 (apex26.tlxSharedTex)
 *   A2  (lane TLX-2) prop batches as attribute-instanced Meshes: one node graph, no UBO pad (apex26.tlxAttrInst) */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeFakeGL, installThreeGlobals } from "../helpers/fake-webgl2.mjs";
import { gameSource } from "../helpers/game-source.mjs";
import { fnSource } from "../helpers/fn-source.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const TLX = read("js/render/three/tlx.js");

installThreeGlobals();
globalThis.Log = globalThis.Log || { info() {}, warn() {}, error() {}, debug() {} };
const THREE = await import(pathToFileURL(path.join(ROOT, "vendor/three-0.186.1/three.webgpu.min.js")).href);
const TSL = THREE.TSL;
for (const f of ["js/render/shared/light-budget.js", "js/lighting/knobs.js", "js/render/shared/post-common.js",
  "js/render/three/tsl-chunks.js", "js/render/three/tsl-lit.js", "js/render/three/tsl-post.js", "js/render/three/tlx-post.js"])
  vm.runInThisContext(read(f), { filename: f });

// Compile one lit mesh on a fresh renderer and return every shader source three handed GL.
async function litGLSL(ctxOver = {}, matOpts = { clearcoat: 0.8, carPaint: 1 }) {
  const fg = makeFakeGL();
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  const lit = globalThis.TLXShaders.lit(THREE, TSL, { chunks: globalThis.TLXShaders.chunks(THREE, TSL), shadow: null,
    ssrTag: false, envCube: null, matMaps: null, lampGrid: null, sharedUniforms: true, maxLights: 16, ...ctxOver });
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(); cam.position.set(0, 0, 5); cam.updateMatrixWorld();
  const g = new THREE.BufferGeometry();
  for (const [n, k, c] of [["position", 3, 3], ["normal", 3, 3], ["color", 3, 3], ["mat", 1, 3], ["trk", 2, 3]])
    g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(k * c), k));
  const m = new THREE.Mesh(g, lit.makeMaterial(matOpts)); m.frustumCulled = false; scene.add(m);
  renderer.render(scene, cam);
  const src = fg.shaders.join("\n");
  renderer.dispose();
  return { src, lit };
}
const cubeSamplers = (src) => (src.match(/uniform\s+(?:\w+\s+)?samplerCube\s+\w+/g) || []).length;

test("R4: the lit program built with envCube null declares no cube sampler and taps none", async () => {
  const off = await litGLSL({ envCube: null });
  assert.equal(cubeSamplers(off.src), 0, "opted out: the cube binding is compiled out");
  const env = new THREE.CubeRenderTarget(1, { type: THREE.HalfFloatType });
  const on = await litGLSL({ envCube: env.texture });
  assert.equal(cubeSamplers(on.src), 1, "control: an envCube still compiles its one sampler (the opt-in path is intact)");
  const taps = (s) => (s.match(/\btexture(?:Lod)?\s*\(/g) || []).length;
  assert.ok(taps(on.src) > taps(off.src), "the probe taps exist only with a cube");
  env.dispose();
});

test("R4: tlx.js reads the env opt-out before allocating, and allocates no cube target when opted out", () => {
  const optAt = TLX.indexOf('_envOptOut = GameStore.store.raw("apex26.tlxEnvProbe") !== "1"');
  const allocAt = TLX.indexOf("envRT = new THREE.CubeRenderTarget(ENV_SIZE");
  const litAt = TLX.indexOf("lit = TLXShaders.lit(THREE, TSL, {");
  assert.ok(optAt > 0 && allocAt > 0 && litAt > 0, "needles moved — check this test, not the code");
  assert.ok(optAt < allocAt, "the opt-out is read before the env target is allocated");
  assert.match(TLX.slice(optAt, allocAt), /if \(!_envOptOut\) try \{/, "the allocation is gated on the opt-out");
  assert.match(TLX.slice(litAt, litAt + 400), /envCube:\s*envRT \? envRT\.texture : null/, "lit gets null with no target");
  assert.equal((TLX.match(/let _envOptOut\b/g) || []).length, 1, "one declaration");
  // envFaceBegin stays the producer-side early return (an opted-in session still probes).
  assert.match(TLX, /envFaceBegin\(face, eye, frame\) \{\s*if \(_envOptOut\) return null;/);
});

// The REAL post chain (tlx-post + tsl-post) over the fake GL; warm() compiles every pass the frame would run.
async function postChain(ssrTag) {
  const fg = makeFakeGL(320, 180);
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  const post = globalThis.TLXShaders.postChain(THREE, TSL, { renderer, isMobile: true, chunks: globalThis.TLXShaders.chunks(THREE, TSL),
    shadow: null, viz: null, ssrTag, softDest: () => null, wantSpatialUpscale: () => false, getPresentSize: () => [320, 180], sceneSamples: 0 });
  post.resize(320, 180);
  const I = new THREE.Matrix4().toArray();
  const n0 = fg.shaders.length;
  await post.warm({ reflect: 0, carReflect: 0, bloom: 0.5, ssao: 0.5, godray: 0, exposure: 1 },
    { proj: I, invProj: I, invVP: I, viewProj: I, time: 0, sunVS: [0, 0, -1] });
  const samplers = fg.shaders.slice(n0).map((s) => (s.match(/uniform\s+(?:\w+\s+)?sampler2D\s+\w+/g) || []).length);
  const out = { tagOn: post.tagOn(), attachments: post.state().attachments, textures: post.sceneTarget().textures.length,
    maxSamplers: Math.max(...samplers) };
  post.dispose(); renderer.dispose();
  return out;
}

test("R3: ssrTag false builds a one-attachment scene target; the composite keeps a DISTINCT tag sampler (lesson 4)", async () => {
  const on = await postChain(undefined), off = await postChain(false);
  assert.equal(on.tagOn, true, "default keeps the tag (desktop, HIGH/ULTRA phones)");
  assert.equal(on.textures, 2); assert.equal(on.attachments, 2);
  assert.equal(off.tagOn, false);
  assert.equal(off.textures, 1, "no ssrTag colour attachment"); assert.equal(off.attachments, 1);
  // The composite is the pass with the most samplers. Had the tag slot fallen back to sceneRT.texture (or any
  // texture another slot holds) three would merge the two nodes into ONE sampler and this count would drop.
  assert.equal(off.maxSamplers, on.maxSamplers, "the tag slot is its own sampler in the tag-less composite");
});

test("R3: tlx.js sets the ssrTag MRT only on a tagged chain (present + warm), and swaps the chain when the rule moves", () => {
  assert.match(TLX, /function _wantTag\(\) \{[\s\S]{0,400}PerfGov\.userTier\(\)[\s\S]{0,120}return !\(ut >= 2 && \(mobileTier \|\| _tagLessKnob === "1"\)\);/,
    "the rule: tag-less only at userTier >= 2 on a mobileTier phone (or the desktop A/B knob)");
  assert.match(TLX, /viz: vizMode, ssrTag: _wantTag\(\),/, "buildPost passes the rule to the chain");
  const at = TLX.indexOf("const _tag = !post.tagOn || post.tagOn();");
  assert.ok(at > 0, "present() reads the chain's tag state");
  assert.match(TLX.slice(at, at + 400),
    /if \(_tag && lit && lit\.setSsrMrt\) lit\.setSsrMrt\(true\);[\s\S]*if \(_tag && fx && fx\.setSsrMrt\) fx\.setSsrMrt\(true\);[\s\S]*const _hadMrt = _tag && /);
  const warm = TLX.slice(TLX.indexOf("function startProgramWarm(opts) {"), TLX.indexOf("const ENV_PROBE_TRIES"));
  assert.match(warm, /const useTag = usePost && \(!post\.tagOn \|\| post\.tagOn\(\)\);/);
  assert.doesNotMatch(warm, /setSsrMrt\(usePost\)|usePost \? _ssrMrtNode\(\)/, "the warm compiles the MRT variant present() will use");
  assert.match(TLX, /function _tagSwap\(\) \{\s*if \(!post \|\| !post\.tagOn \|\| _warmPending \|\| post\.tagOn\(\) === _wantTag\(\)\) return;[\s\S]{0,200}post = buildPost\(\); if \(post\) post\.resize\(W, H, presentW, presentH\);/,
    "a GRAPHICS change that moves the rule rebuilds the chain");
  const b = TLX.indexOf("        begin(frame) {");
  assert.match(TLX.slice(b, b + 1200), /_tagSwap\(\);/, "begin() runs the swap before the scene records");
});

test("R7: the dry-day SSR gate zeroes po.reflect only on a dry day below the 1/64 weight, and only when armed", () => {
  const G = gameSource();
  const m = G.match(/^ {2}const _ssrPo = (.+);$/m);
  assert.ok(m, "the gated po.reflect input moved — check this test, not the code");
  const gateT = new Function("_ssrDayGate", "frame", "_ssr", "PerfGov", `"use strict"; return ${m[1]};`);
  const gate = (armed, frame, ssr, tier = 0) => gateT(armed, frame, ssr, { tier: () => tier });
  const day = { lights: false, wetness: 0 }, night = { lights: true, wetness: 0 }, wet = { lights: false, wetness: 0.4 };
  assert.equal(gate(false, day, 0.07), 0.07, "default OFF: today's value");
  assert.equal(gate(true, day, 0.07), 0, "shipped 0.07: weight 0.0143 < 1/64 -> skipped");
  assert.equal(gate(true, day, 0.074), 0, "the presets' 0.074 -> skipped");
  assert.equal(gate(true, day, 0.1), 0.1, "baku's 0.1 (weight 0.0204) keeps the march");
  assert.equal(gate(true, night, 0.08), 0.08, "dry night neon sheen untouched");
  assert.equal(gate(true, wet, 0.05), 0.05, "a wet road never gates at tier 0");
  // Tier >= 2 (phone MEDIUM): a near-dry wet frame whose blend weight cannot reach 1/64 skips the march.
  assert.equal(gate(false, { lights: false, wetness: 0.02 }, 0.02 * 1.28, 2), 0, "drying road at tier 2: invisible, skipped");
  assert.equal(gate(false, wet, 0.4 * 1.28, 2), 0.4 * 1.28, "a properly wet road keeps its mirror at tier 2");
  assert.equal(gate(false, wet, 0.02, 0), 0.02, "tier 0 never applies the weight gate unless armed");
  assert.match(G, /po\.reflect = PerfGov\.tier\(\) >= _ssrTier \? 0 : _ssrPo;/, "the one input every backend reads");
  assert.doesNotMatch(G, /po\.carReflect = [^;]*_ssrPo/, "car-paint SSR is not gated");
  assert.match(G, /const _ssrDayGate = \(\(\) => \{ try \{ return localStorage\.getItem\("apex26\.ssrDayGate"\) === "1"; \}/,
    "armed only by an explicit apex26.ssrDayGate=1");
});

// R9: the particle stream (rain rides in the alpha group) wraps the producer's array instead of copying it.
// Lifts the REAL setRange0 / ensureStream / wrapStream / uploadStream / drawParticles from tlx.js over real
// three core classes; pushRec and the FX materials are stubs.
function bootParticles(wrapOn = true) {
  const fnText = (decl) => fnSource(TLX, decl);
  const dpAt = TLX.indexOf("        drawParticles(data, floatCount, additive, dirty) {");
  const dpEnd = TLX.indexOf("\n        },", dpAt);
  assert.ok(dpAt > 0 && dpEnd > dpAt, "drawParticles moved — check this test, not the code");
  const disposed = [], recs = [];
  const body = `"use strict";
    ${H1_USAGE}
    ${fnText("function setRange0(attr, count) {")}
    ${fnText("function ensureStream(slot, verts) {")}
    ${fnText("function wrapStream(slot, arr) {")}
    ${fnText("function uploadStream(slot, floats) {")}
    ${TLX.slice(TLX.indexOf("      const _partEpochs ="), TLX.indexOf("      const partStreams ="))}
    const PART_ATTRS = [["fxCorner", 2, 0], ["position", 3, 2], ["fxColor", 3, 5], ["fxSize", 1, 8], ["fxAlpha", 1, 9]];
    const partStreams = [
      { geo: null, ib: null, cap: 0, min: 256 * 6, stride: 10, attrs: PART_ATTRS },
      { geo: null, ib: null, cap: 0, min: 256 * 6, stride: 10, attrs: PART_ATTRS },
    ];
    const fx = { particleMats: ["matA", "matB"] }, frameEye = [0, 0, 0], _fxFrame = { particles: 0 };
    const api = { ${TLX.slice(dpAt, dpEnd).trim()} } };
    return { api, partStreams };`;
  const out = new Function("THREE", "disposeGeometry", "pushRec", "_wrapPart", body)(
    THREE, (g) => disposed.push(g), (geo, m, mat) => recs.push([geo, mat]), wrapOn);
  return { ...out, disposed, recs };
}

test("R9: drawParticles wraps the producer's Float32Array (no per-frame copy), re-wraps on reallocation, copies otherwise", () => {
  const P = bootParticles();
  const vertA = new Float32Array(600 * 10);
  for (let i = 0; i < 360; i++) vertA[i] = i + 0.5;
  P.api.drawParticles(vertA, 360, false, true);
  const s = P.partStreams[0];
  assert.equal(s.ib.array, vertA, "the InterleavedBuffer IS the caller's array: nothing to copy");
  assert.deepEqual(s.ib.updateRanges.map((r) => [r.start, r.count]), [[0, 360]], "upload range = the payload");
  assert.equal(s.geo.drawRange.count, 36);
  assert.equal(s.geo.getAttribute("fxAlpha").getX(35), vertA[359], "attributes read the caller's floats");
  const geo0 = s.geo;
  vertA[0] = 42; P.api.drawParticles(vertA, 400, false, true);
  assert.equal(s.geo, geo0, "same array: same geometry, no rebuild");
  assert.equal(s.ib.updateRanges[0].count, 400);
  const uploaded = s.ib.version;
  P.api.drawParticles(vertA, 400, false, false);
  assert.equal(s.ib.version, uploaded, "a clean same-epoch re-issue skips the GPU upload");
  assert.equal(s.geo, geo0, "a clean re-issue keeps the stream");
  P.api.drawParticles(vertA, 400, true, true);
  P.api.drawParticles(vertA, 400, false, false);
  assert.ok(s.ib.version > uploaded, "a dirty upload through another blend invalidates the alpha stream epoch");
  const vertA2 = new Float32Array(900 * 10);   // particles.js rainSeed grew the shower
  P.api.drawParticles(vertA2, 600, false, true);
  assert.equal(s.ib.array, vertA2, "re-wrapped");
  assert.deepEqual(P.disposed, [geo0], "the old stream geometry is disposed exactly once");
  // Not wrappable (not a whole number of vertices): the copy path, as before.
  const odd = new Float32Array(16).fill(3);
  P.api.drawParticles(odd, 10, true, true);
  const b = P.partStreams[1];
  assert.notEqual(b.ib.array, odd); assert.equal(b.ib.array[9], 3);
  // The A/B handle restores the copy for every call.
  const Q = bootParticles(false);
  Q.api.drawParticles(vertA, 360, false, true);
  assert.notEqual(Q.partStreams[0].ib.array, vertA); assert.equal(Q.partStreams[0].ib.array[359], vertA[359]);
});

test("R13: chunk cull never shrinks its scratch list; refuseTab is minted once per renderer, not per present()", () => {
  const CH = read("js/render/three/tlx-chunked.js");
  const cull = fnSource(CH, "function cull(mesh, vp, eye, cullDist, fog) {");
  assert.doesNotMatch(cull, /_visList\.length\s*=/, "length = 0 / = n frees V8's backing store; the returned n is the contract");
  assert.match(cull, /_visList\[n\+\+\] = ch;/);
  assert.match(fnSource(CH, "function free(mesh) {"), /_visList\.length = 0;/, "a freed world still leaves module scratch");
  for (const site of [/const n = chunkedSys\.cull\([^;]+;\s*const vis = chunkedSys\.visList;\s*for \(let (\w) = 0; \1 < n; \1\+\+\)/g])
    assert.ok((TLX.match(site) || []).length >= 2, "every visList reader loops to the returned n");
  const present = TLX.indexOf("        present(opts) {");
  const rt = TLX.indexOf("const refuseTab = () => {");
  assert.ok(rt > 0 && rt < present, "refuseTab is hoisted out of present()");
  assert.equal((TLX.match(/const refuseTab = /g) || []).length, 1);
});

// R6: the REAL pool-root functions (_kidsBegin / _poolShow) and acquireMesh's parenting, driven the way
// present() / mirrorEnd() drive them, rendered by three r186 over the fake GL: three draws exactly the
// acquired wrappers and walks nothing else.
test("R6: the pool root's children are exactly this pass's acquired wrappers; three draws those and only those", async (t) => {
  const fg = makeFakeGL();
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  t.after(() => renderer.dispose());   // a failed assert must not leave three's frame loop holding the process
  const scene = new THREE.Scene(); scene.matrixWorldAutoUpdate = false;
  const cam = new THREE.PerspectiveCamera(); cam.position.set(0, 0, 5); cam.updateMatrixWorld();
  const decl = TLX.slice(TLX.indexOf("      let _r6 = true;"), TLX.indexOf("      const _tmpMat4 = new THREE.Matrix4()"));
  assert.match(decl, /function _poolShow\(\)/, "the R6 block moved — check this test, not the code");
  const acq = fnSource(TLX, "function acquireMesh(geo, matrixArr, material, rec) {");
  const parenting = acq.slice(acq.indexOf("        if (_r6) {"), acq.indexOf("        return m;"));
  const mk = new Function("THREE", "scene", "localStorage", `"use strict";
    const meshPool = []; let _poolBatch = 0;
    ${decl}
    function acquire(m) { m.visible = true; ${parenting} return m; }
    return { poolRoot, begin(kind) { _poolBatch++; _kidsBegin(kind === "mir" ? _kidsMir : _kidsMain); },
      acquire, show: _poolShow, meshPool };`);
  const P = mk(THREE, scene, { getItem: () => null });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
  const mat = new THREE.MeshBasicNodeMaterial();
  const wrappers = Array.from({ length: 12 }, () => { const m = new THREE.Mesh(g, mat); m.frustumCulled = false; P.meshPool.push(m); return m; });
  const raw = () => { fg.reset(); renderer.render(scene, cam); return fg.counts.drawArrays || 0; };
  const base = raw();   // three draws its own background quad
  const draws = () => raw() - base;
  P.begin("main"); for (const m of wrappers) P.acquire(m); P.show();
  assert.equal(P.poolRoot.parent, scene);
  assert.equal(P.poolRoot.children.length, 12); assert.equal(draws(), 12);
  P.begin("mir"); for (const m of wrappers.slice(0, 3)) P.acquire(m); P.show();
  assert.deepEqual(P.poolRoot.children, wrappers.slice(0, 3), "the mirror pass lists its 3 — the other 9 are not walked");
  assert.equal(draws(), 3);
  assert.ok(wrappers.every((m) => m.parent === P.poolRoot), "parent set once, never re-added");
  assert.equal(scene.children.length, 1, "no wrapper sits in the scene itself");
  P.begin("main"); for (const m of wrappers.slice(4, 9)) P.acquire(m); P.show();
  assert.equal(draws(), 5, "the main list is rebuilt per pass, in acquisition order");
  assert.deepEqual(P.poolRoot.children, wrappers.slice(4, 9));
  P.begin("main"); P.show();
  assert.equal(draws(), 0, "a pass that acquired nothing draws nothing from the pool");
  // A wrapper dropped while listed (dropWrapper: parent.remove) leaves the list.
  P.begin("main"); for (const m of wrappers) P.acquire(m); P.show();
  P.poolRoot.remove(wrappers[0]);
  assert.equal(draws(), 11);
  // The A/B handle restores the hide loop over wrappers parented to the scene.
  const scene2 = new THREE.Scene(); scene2.matrixWorldAutoUpdate = false;
  const Q = mk(THREE, scene2, { getItem: (k) => (k === "apex26.tlxPoolRoot" ? "0" : null) });
  const w2 = Array.from({ length: 4 }, () => { const m = new THREE.Mesh(g, mat); m.frustumCulled = false; Q.meshPool.push(m); return m; });
  Q.begin("main"); for (const m of w2) { m.__tlxBatch = 1; Q.acquire(m); } Q.show();
  assert.equal(scene2.children.length, 4, "tlxPoolRoot=0: wrappers in the scene as before");
});

test("R6: every acquire site opens its kid list after its _poolBatch++ and closes it with _poolShow()", () => {
  const sites = [["env face", "          _poolBatch++;\n          _kidsBegin(_kidsEnv);"], ["mirror", "            _poolBatch++;\n            _kidsBegin(_kidsMir);"],
    ["main", "          _poolBatch++;\n          _kidsBegin(_kidsMain);"]];
  for (const [what, needle] of sites) assert.equal(TLX.split(needle).length - 1, 1, what);
  assert.equal((TLX.match(/acquireMesh\(/g) || []).length - 1, (TLX.match(/acquireMesh\([^)]*\)\.renderOrder = /g) || []).length,
    "acquireMesh is only called from the three pass loops");
  assert.equal((TLX.match(/_poolShow\(\);/g) || []).length, 3, "each pass loop ends in _poolShow()");
  assert.equal((TLX.match(/pm\.__tlxBatch !== _poolBatch\) pm\.visible = false;/g) || []).length, 1, "the hide loop survives only as the A/B fallback");
});

test("R5: apex26.tlxSkyCache512 is off by default, '1' = mobileTier only, 'all' = everywhere; the sky builds that size", () => {
  const at = TLX.indexOf("      const _skyCacheSize = (function () {");
  assert.ok(at > 0, "the knob moved — check this test, not the code");
  const iife = TLX.slice(at + "      const _skyCacheSize = ".length, TLX.indexOf("})();", at) + 4);
  const size = (v, mobileTier) => new Function("localStorage", "mobileTier", `"use strict"; return ${iife};`)(
    { getItem: (k) => (k === "apex26.tlxSkyCache512" ? v : null) }, mobileTier);
  assert.equal(size(null, true), 0, "unset: tsl-sky's own 768 — on a phone too");
  assert.equal(size("1", false), 0, "'1' leaves desktop alone");
  assert.equal(size("1", true), 512);
  assert.equal(size("all", false), 512, "'all' is the desktop A/B lever");
  assert.match(TLX, /TLXShaders\.sky\(THREE, TSL, \{ chunks, cache: _skyCacheOn, cacheSize: _skyCacheSize, vp: vport, sceneView \}\)/);
  // The real sky factory honours the size (its NUMBERS block derives W and the texel from S).
  vm.runInThisContext(read("js/render/three/tsl-sky.js"), { filename: "tsl-sky.js" });
  for (const [cacheSize, want] of [[512, 512], [0, 768]]) {
    const sky = globalThis.TLXShaders.sky(THREE, TSL, { chunks: globalThis.TLXShaders.chunks(THREE, TSL), cache: true, cacheSize });
    assert.equal(sky.cacheState().size, want);
    sky.dispose();
  }
});

// R1 (lane TLX-2): the REAL coalescing block of tlx.js (runs, attribute instancing, the sentinel), driven over
// the REAL tsl-lit material and three r186 on the fake GL, against the per-record draws it replaces.
const R1 = TLX.slice(TLX.indexOf("      let _coOn = true;"), TLX.indexOf("      function ensureStream(slot, verts) {"));
// The hunt-4 A-H1 usage knob the runs read (_coRun's ib.setUsage(_instUsage)), from tlx.js too.
// The release helper _coDrop frees each run through (#2150), verbatim.
const DROP = TLX.slice(TLX.indexOf("      const _dropQueue = [];"), TLX.indexOf("      // Caller frees are ownership boundaries"));
const H1_USAGE = TLX.slice(TLX.indexOf("      let _instUsage = THREE.StreamDrawUsage;"), TLX.indexOf("      function _instColorAttr(imesh, cap) {"));
async function r1Rig(t, ls = {}) {
  const fg = makeFakeGL();
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  t.after(() => renderer.dispose());
  const lit = globalThis.TLXShaders.lit(THREE, TSL, { chunks: globalThis.TLXShaders.chunks(THREE, TSL), shadow: null,
    ssrTag: false, envCube: null, matMaps: null, lampGrid: null, sharedUniforms: true, maxLights: 16 });
  const scene = new THREE.Scene(); scene.matrixWorldAutoUpdate = false;
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 0, 5); camera.updateMatrixWorld();
  const env = { soft: false };
  assert.match(R1, /function _coAppend\(geo, w, opts\)/, "the R1 block moved — check this test, not the code");
  assert.match(H1_USAGE, /^      let _instUsage = THREE\.StreamDrawUsage;[\s\S]*const _instUsageOf = /, "the A-H1 knob moved — check this test, not the code");
  const mk = new Function("THREE", "TSL", "scene", "renderer", "camera", "localStorage", "lit", "env", `"use strict";
    const _instRegistry = [], drawList = []; drawList.n = 0;
    const unlitMat = new THREE.MeshBasicNodeMaterial(), _drawMatMode = 0, vizMat = null;
    const skipBatches = () => env.soft, drawEm = (o) => (o && o.emissive !== undefined ? o.emissive : 0);
    function setRange0(attr, count) { attr.updateRanges.length = 0; attr.updateRanges.push({ start: 0, count }); }
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
    function buildGeometry() { throw new Error("unused"); }
    let _warmPending = null;
    ${DROP}
    ${H1_USAGE}
    ${R1}
    return { warming(value) { _warmPending = value; }, flush: flushDropped, append: _coAppend, drop: _coDrop, runs: _coRuns, stat: _coStat, drawList, resetRecs, materialFor, _instRegistry,
      aiMesh: _aiMesh, aiOf: _aiOf, aiOn: _aiInst, unlitMat,
      show() { for (let i = 0; i < drawList.n; i++) { const r = drawList[i]; if (!r.instanced) continue;
        const b = r.instanced; b.imesh.count = b.visible; b.imesh.material = r.mat; b.imesh.userData.tlxEmissive = r.em; b.imesh.visible = true; } } };`);
  const R = mk(THREE, TSL, scene, renderer, camera, { getItem: (k) => (k in ls ? ls[k] : null) }, lit, env);
  return { fg, renderer, scene, camera, R, env, lit };
}
// A wheel-like geometry and car-basis matrices: game.js basisMat is a reflection (det -1).
function r1Geo() {
  const g = new THREE.BufferGeometry();
  for (const [n, k, c] of [["position", 3, 4], ["normal", 3, 4], ["color", 3, 4], ["mat", 1, 4], ["trk", 3, 4]])
    g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(k * c).fill(0.5), k));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  return g;
}
function carWheel(i) {
  const W = new THREE.Matrix4().makeRotationY(0.3 * i).multiply(new THREE.Matrix4().makeScale(-1, 1, 1))
    .multiply(new THREE.Matrix4().makeRotationX(0.7 + i)).setPosition(812.25 + i * 3.1, 4.5, -1290.75 + i);
  return Float32Array.from(W.elements);
}

test("R1: N same-mesh opaque draws are ONE instanced draw; R x W per instance rebuilds W exactly; front face as per record", async (t) => {
  const { fg, renderer, scene, camera, R } = await r1Rig(t);
  const geo = r1Geo(), opts = { roughness: 0.55, metalness: 0.3, specular: 0.45, emissive: 0.12, doubleSided: true, coalesce: true };
  const mats = [0, 1, 2, 3, 4].map(carWheel);
  for (const w of mats) assert.equal(R.append(geo, w, opts), true);
  assert.equal(R.drawList.n, 1, "five draws, one record");
  const b = R.drawList[0].instanced;
  assert.equal(b.visible, 5);
  assert.ok(b.imesh.matrixWorld.determinant() < 0, "a det < 0 run carries the reflection as its matrixWorld");
  const a = b.ib.array;
  for (let i = 0; i < 5; i++) {
    const inst = new THREE.Matrix4().fromArray(a, i * 19), got = b.imesh.matrixWorld.clone().multiply(inst).elements;
    for (let k = 0; k < 16; k++) assert.equal(Math.fround(got[k]), mats[i][k], `instance ${i} element ${k}: R x (R x W) == W bit for bit`);
    assert.deepEqual([...a.subarray(i * 19 + 16, i * 19 + 19)], [1, 1, 1], "white tint");
    assert.ok(inst.determinant() > 0, "the instance itself is a proper transform");
  }
  R.show();
  const front = []; fg.gl.frontFace = (m) => front.push(m);
  fg.reset(); renderer.render(scene, camera);
  assert.equal(fg.counts.drawElementsInstanced || 0, 1, "one instanced draw");
  assert.equal(fg.counts.drawElements || 0, 0);
  const vs = fg.shaders.find((s) => /\biM0\b/.test(s) && /gl_Position/.test(s));
  assert.ok(vs, "the vertex stage reads the named instance stream");
  assert.match(vs, /inverse\(/, "normals through the true inverse-transpose (r186 transformNormal)");
  // The per-record control: the same five through plain meshes at W (what TLX drew before).
  const scene2 = new THREE.Scene(); scene2.matrixWorldAutoUpdate = false;
  const plain = R.materialFor({ roughness: 0.55, metalness: 0.3, specular: 0.45, doubleSided: true }, false, false);
  for (const w of mats) {
    const m = new THREE.Mesh(geo, plain); m.matrixAutoUpdate = false; m.matrixWorldAutoUpdate = false; m.frustumCulled = false;
    m.matrixWorld.fromArray(w); scene2.add(m);
  }
  const front2 = []; fg.gl.frontFace = (m) => front2.push(m);
  fg.reset(); renderer.render(scene2, camera);
  assert.equal(fg.counts.drawElements || 0, 5, "control: five per-record draws");
  assert.ok(front.length > 0 && front2.length > 0, "both renders set a front face");
  assert.equal(front[front.length - 1], front2[front2.length - 1], "the run rasterises with the per-record front face (CW for the reflected basis)");
});

test("R1: the sentinel, the fallbacks and the kill switch", async (t) => {
  const { R, env } = await r1Rig(t);
  const geo = r1Geo(), o = { roughness: 0.55, doubleSided: true, coalesce: true, emissive: 0 };
  assert.equal(R.append(geo, carWheel(0), o), true);
  assert.equal(R.append(geo, carWheel(1), Object.assign({}, o, { emissive: 0.5 })), false, "a second emissive in one run draws per record");
  assert.equal(R.append(geo, carWheel(1), Object.assign({}, o, { roughness: 0.9 })), false, "so does a second material");
  assert.equal(R.append(geo, carWheel(2), Object.assign({}, o, { alpha: 0.5 })), false, "alpha < 1 never joins");
  const pos = Float32Array.from(new THREE.Matrix4().setPosition(1, 2, 3).elements);
  assert.equal(R.append(geo, pos, o), true, "a det > 0 draw takes the other run of the same mesh");
  assert.equal(R.drawList.n, 2);
  assert.equal(R.runs.get(geo)[0].imesh.matrixWorld.determinant(), 1);
  R.resetRecs();
  assert.equal(R.append(geo, carWheel(3), o), true);
  assert.equal(R.drawList.n, 1, "after the pass reset the run re-opens at the new list's slot (A6's sentinel)");
  assert.equal(R.runs.get(geo)[1].visible, 1);
  for (let i = 1; i < 128; i++) assert.equal(R.append(geo, carWheel(i & 7), o), true);
  assert.equal(R.append(geo, carWheel(0), o), false, "past CO_CAP the rest draw per record");
  assert.equal(R.stat.fall, 3);
  env.soft = true;
  R.resetRecs();
  assert.equal(R.append(geo, carWheel(0), o), false, "software WebGPU (skipBatches) keeps the per-record path");
  const reg = R._instRegistry.length;
  R.drop(geo);
  assert.equal(R.runs.has(geo), false); assert.equal(R._instRegistry.length, reg - 2, "a freed source takes both runs");
  const off = await r1Rig(t, { "apex26.tlxCoalesce": "0" });
  assert.equal(off.R.append(geo, carWheel(0), o), false, "apex26.tlxCoalesce=0: per record");
});

test("R1: the AI material is the lit instanced fragment on its own program key; tlx.js wires draw, warm, release and the capability", async (t) => {
  const { R } = await r1Rig(t);
  const ai = R.materialFor({ roughness: 0.55 }, false, 2), inst = R.materialFor({ roughness: 0.55 }, false, true);
  assert.equal(ai.colorNode, inst.colorNode, "the same shared instanced fragment graph");
  assert.equal(ai.customProgramCacheKey(), "ai-" + inst.customProgramCacheKey());
  assert.match(TLX, /draw\(mesh, model, opts\) \{\s*if \(opts && opts\.coalesce && mesh && mesh\.geo && _coAppend\(mesh\.geo, model, opts\)\) return;/);
  assert.match(fnSource(TLX, "async function warmFxPrograms() {"), /await _coWarm\(\);/);
  assert.match(fnSource(TLX, "function releaseGeometry(geo) {"), /_coDrop\(geo\);/);
  assert.match(TLX, /get coalesce\(\) \{ return _coOn && !skipBatches\(\); \}/);
  assert.match(TLX, /\(instanced === 2 \? "\|ai" : instanced \? "\|in" : ""\)/, "the material key separates the three modes");
  assert.match(TLX, /if \(instanced === 2 && m\) _attrInst\(m\);/);
  assert.match(TLX, /if \(im\.isInstancedMesh\) im\.material = instMat;\s*else if \(mode >= 2\) im\.visible = false;\s*else im\.material = _aiOf\(unlitInstancedMat\);/,
    "a fallback rung never puts an InstancedMesh material on a run (three's instancing does not reach a plain Mesh)");
});

test("R1: car-draw.js sends only the OPAQUE wheel layers through a coalescing sibling bag, and only to a backend that asks", () => {
  const cd = read("js/car/car-draw.js");
  const fn = cd.slice(cd.indexOf("    const _coSib = new WeakMap();"), cd.indexOf("    // ── decal-queue"));
  assert.match(fn, /function coOpt\(o\)/, "coOpt moved — check this test, not the code");
  const mk = (gfx) => new Function("G", `"use strict"; ${fn} return coOpt;`)({ gfx });
  const o = { roughness: 0.55, emissive: 0 };
  assert.equal(mk({})(o), o, "GLX / WGX: the caller's own bag, untouched");
  const co = mk({ coalesce: true });
  const s = co(o);
  assert.notEqual(s, o); assert.equal(s.coalesce, true); assert.equal(o.coalesce, undefined, "the caller's bag is never mutated");
  o.emissive = 0.12;
  assert.equal(co(o), s, "one sibling per bag"); assert.equal(s.emissive, 0.12, "refreshed per call");
  const ring = { alpha: 0.5 };
  assert.equal(co(ring), ring, "alpha < 1 stays per record");
  const body = fnSource(cd, "    function drawPlayerWheels(c, base, dt, opt, frontsOnly, fwdOffset, wScale, bare) {");
  assert.match(body, /const wo = coOpt\(opt\);/);
  assert.match(body, /G\.gfx\.draw\(wd\.rear \? wm\.R : wm\.F, _wheelWorld, wo\);/);
  assert.match(body, /G\.gfx\.draw\(_wqMesh\[i\], _wq\[i\], wo\);/);
  assert.match(body, /G\.gfx\.draw\(_cqMesh\[i\], _cq\[i\], wo\);/);
  assert.match(body, /G\.gfx\.draw\(_rqMesh\[i\] \|\| getBrakeRing\(\), _rq\[i\], ro\);/, "rings and discs: the plain blended bag");
});

// B14 / R2 (lane TLX-2): the lit textures in three's renderGroup through vendor patch §13, on the REAL
// tsl-lit with its material arrays and lamp grid, three r186 WebGL2 over the fake GL. Plain, InstancedMesh
// and attribute-instanced (R1) programs share one fragment graph, so this is where a key without the
// binding NAME would hand one program another's sampler names.
async function b14Rig(t, sharedTex) {
  const fg = makeFakeGL();
  const progOf = new Map(), srcOf = new Map(), locs = [], unit = new Map(), bound = [];
  const gl = fg.gl;
  gl.createShader = () => ({ sh: true }); gl.createProgram = () => ({ prog: true, sh: [] });
  gl.shaderSource = (sh, src) => { srcOf.set(sh, src); fg.shaders.push(src); };
  gl.attachShader = (p, sh) => p.sh.push(sh);
  gl.getUniformLocation = (p, name) => { const loc = { p, name }; locs.push(loc); return loc; };
  gl.uniform1i = (loc, i) => { if (loc) unit.set(loc, i); };
  gl.createTexture = () => ({ tex: true }); gl.bindTexture = (target, tex) => bound.push(tex);
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  t.after(() => renderer.dispose());
  const f32 = (n) => new Float32Array(n);
  const dt = (data, w, h, fmt) => { const x = new THREE.DataTexture(data, w, h, fmt, THREE.FloatType); x.needsUpdate = true; return x; };
  const lampGrid = { lampTex: dt(f32(64), 4, 4, THREE.RGBAFormat), idxTex: dt(f32(16), 4, 4, THREE.RedFormat), gridTex: dt(f32(32), 4, 4, THREE.RGFormat), LAMPS: 4, IDXW: 4, G: 4 };
  const arr = () => { const a = new THREE.DataArrayTexture(new Uint8Array(17 * 4), 1, 1, 17); a.needsUpdate = true; return a; };
  const matMaps = { albedo: arr(), normal: arr() };
  const prevLS = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => (k === "apex26.tlxSharedTex" && !sharedTex ? "0" : null) };
  let lit;
  try {
    lit = globalThis.TLXShaders.lit(THREE, TSL, { chunks: globalThis.TLXShaders.chunks(THREE, TSL), shadow: null,
      ssrTag: false, envCube: null, matMaps, lampGrid, sharedUniforms: true, maxLights: 16 });
  } finally { if (prevLS === undefined) delete globalThis.localStorage; else globalThis.localStorage = prevLS; }
  const attrInst = new Function("THREE", "TSL", "localStorage", `${R1.slice(0, R1.indexOf("      function _coRun("))}; return _attrInst;`)(THREE, TSL, { getItem: () => null });
  const scene = new THREE.Scene(); scene.matrixWorldAutoUpdate = false;
  const cam = new THREE.PerspectiveCamera(); cam.position.set(0, 0, 5); cam.updateMatrixWorld();
  const plain = lit.makeMaterial({ roughness: 0.55 });
  for (let i = 0; i < 20; i++) { const m = new THREE.Mesh(r1Geo(), plain); m.frustumCulled = false; scene.add(m); }
  const ig = r1Geo(); ig.setAttribute("instanceTint", new THREE.InstancedBufferAttribute(new Float32Array(3 * 2000).fill(1), 3));
  const im = new THREE.InstancedMesh(ig, lit.makeMaterial({ instanced: true }), 2000); im.count = 2; im.frustumCulled = false; scene.add(im);
  const ag = r1Geo(), ib = new THREE.InstancedInterleavedBuffer(new Float32Array(19 * 2), 19, 1);
  for (let c = 0; c < 4; c++) ag.setAttribute("iM" + c, new THREE.InterleavedBufferAttribute(ib, 4, c * 4));
  ag.setAttribute("instanceTint", new THREE.InterleavedBufferAttribute(ib, 3, 16));
  const am = new THREE.Mesh(ag, attrInst(lit.makeMaterial({ instanced: true }))); am.count = 2; am.frustumCulled = false; scene.add(am);
  let texGets = 0;
  const tg = renderer._textures.get.bind(renderer._textures);
  renderer._textures.get = (x) => { texGets++; return tg(x); };
  const frame = () => { texGets = 0; bound.length = 0; renderer.render(scene, cam); return texGets; };
  frame();
  return { fg, renderer, lit, matMaps, frame, locs, unit, srcOf, bound, progOf };
}

test("B14: the lit textures share renderGroup — walked once per render(), not per object; per-object with tlxSharedTex=0", async (t) => {
  const on = await b14Rig(t, true), off = await b14Rig(t, false);
  const a = on.frame(), b = off.frame();
  // 20 plain objects x 7 textures (bake x2, lamp grid x3, material arrays x2) + 2 instanced x 4, against one
  // walk per shared bind group per render: the plain, InstancedMesh and AI programs.
  t.diagnostic(`texture walks per render: per-object ${b}, shared ${a}`);
  assert.ok(b >= 20 * 7 + 2 * 4, `per-object: ${b} texture walks for 22 objects`);
  // (measured 154 -> 21: the shared count no longer scales with the object count)
  assert.ok(a * 5 < b && a <= 24, `shared: ${a} texture walks per render (one per bind group)`);
});

test("B14: every program's sampler units are set by names its OWN GLSL declares (the §13 key carries the binding name)", async (t) => {
  const { locs, unit, srcOf } = await b14Rig(t, true);
  const samplerNames = (p) => new Set(p.sh.flatMap((sh) => [...(srcOf.get(sh) || "").matchAll(/uniform\s+\w*sampler\w*\s+(\w+)\s*;/g)].map((m) => m[1])));
  const progs = new Set(locs.map((l) => l.p));
  assert.ok(progs.size >= 3, `three lit programs linked (${progs.size})`);
  let n = 0;
  for (const l of locs) {
    if (!unit.has(l)) continue;
    n++;
    assert.ok(samplerNames(l.p).has(l.name), `a sampler unit set for ${l.name}, which this program does not declare`);
  }
  for (const p of progs) t.diagnostic(`program: ${[...samplerNames(p)].join(" ")} | set: ${locs.filter((l) => l.p === p && unit.has(l)).map((l) => l.name + "=" + unit.get(l)).join(" ")}`);
  // plain: bake x2 + lamp grid x3 + material arrays x2; both instanced programs take no per-chunk lamps (4 each).
  assert.ok(n >= 7 + 4 + 4, `${n} sampler units set`);
});

test("B14: a texture .value swapped between render() calls is the one bound by the next render", async (t) => {
  const { lit, frame, bound, fg } = await b14Rig(t, true);
  frame();
  const before = new Set(bound);
  const next = new THREE.DataArrayTexture(new Uint8Array(17 * 4), 1, 1, 17); next.needsUpdate = true;
  lit.setMaterialMaps({ albedo: next });
  frame();
  const fresh = bound.filter((x) => !before.has(x));
  assert.ok(fresh.length >= 1, "the swapped material array is bound in the next render");
  assert.ok(fg.counts.texImage3D || fg.counts.texStorage3D || fg.counts.texSubImage3D, "and uploaded");
});

test("B14: tsl-lit groups the shadow, bake, lamp-grid, material-array and env-cube base nodes; the vendor key and clone pins", () => {
  const src = read("js/render/three/tsl-lit.js");
  assert.match(src, /function texGroup\(n\) \{ return SHARED_TEX && n \? n\.setGroup\(renderGroup\) : n; \}/);
  assert.match(src, /const SHARED_TEX = !\(ctx && ctx\.sharedUniforms === false\) && /, "rides SHARED_UNIFORMS' ctx switch");
  for (const re of [/const shadowMapNode = \(tex\) => texGroup\(/, /const envCubeNode = ENV_CUBE \? texGroup\(/, /const BAKE_NODE = texGroup\(/,
    /const BAKE_IDX_NODE = texGroup\(/, /const matAlbedoNode = [^\n]*texGroup\(/, /const matNormalNode = [^\n]*texGroup\(/])
    assert.match(src, re);
  assert.doesNotMatch(src, /textureLoad\(LGRID\./, "the lamp-grid taps are clones of the grouped base nodes");
  const ids = THREE_PATCH_IDS();
  assert.ok(ids.includes(13));
});
function THREE_PATCH_IDS() { return JSON.parse(read("vendor/three-0.186.1/MANIFEST.json")).patches; }

// R8 / A2 (lane TLX-2): the prop batches as attribute-instanced plain Meshes (tlx.js _aiMesh), on the REAL
// R1 instance step and lit material, three r186 WebGL2 over the fake GL.
test("A2: two batches on their own geometry each draw their own instance stream at their real count", async (t) => {
  const { fg, renderer, scene, camera, R } = await r1Rig(t);
  assert.equal(R.aiOn, true, "on by default");
  const mat = R.materialFor({ roughness: 0.6 }, false, 2);
  const mk = (n) => {
    const g = r1Geo(), m = R.aiMesh(g, mat, n);
    g.setAttribute("instanceTint", new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3));   // _instColorAttr's shape
    const im = m.instanceMatrix;
    assert.equal(im.count, n, "instanceMatrix.count is the instance count (the cap the readers size by)");
    assert.equal(im.array.length, n * 16, "no pad past the UBO limit");
    for (let i = 0; i < n; i++) im.array.set(carWheel(i), i * 16);
    im.updateRanges.push({ start: 0, count: n * 16 }); im.needsUpdate = true;
    m.setUsageOk = typeof im.setUsage === "function";
    m.frustumCulled = false; scene.add(m);
    return m;
  };
  const a = mk(2), b = mk(3);
  assert.ok(a.setUsageOk && !a.isInstancedMesh, "a plain Mesh with the InstancedBufferAttribute surface");
  fg.reset(); renderer.render(scene, camera);
  assert.equal(fg.counts.drawElementsInstanced || 0, 2, "one instanced draw per batch");
  for (const m of [a, b]) assert.ok(renderer.backend.get(m.instanceMatrix).bufferGPU, "each batch's OWN stream reached the GPU (attributes are read by name per geometry)");
  assert.notEqual(renderer.backend.get(a.instanceMatrix).bufferGPU, renderer.backend.get(b.instanceMatrix).bufferGPU);
  const off = await r1Rig(t, { "apex26.tlxAttrInst": "0" });
  assert.equal(off.R.aiOn, false, "apex26.tlxAttrInst=0: the padded InstancedMesh batches");
});

test("A2: under tlx.js's own node-builder key, N attribute batches build ONE node graph; N padded InstancedMeshes build N", async (t) => {
  const at = TLX.indexOf("        renderer._nodes.getForRenderCacheKey = function (ro) {");
  const end = TLX.indexOf("\n        };\n", at);
  assert.ok(at > 0 && end > at, "the key override moved — check this test, not the code");
  const install = new Function("renderer", "attachKey", TLX.slice(at, end + "\n        };".length));
  const builds = async (kind) => {
    const { fg, renderer, scene, camera, R } = await r1Rig(t);
    install(renderer, () => "1");
    const cnb = renderer.backend.createNodeBuilder.bind(renderer.backend);
    let n = 0; renderer.backend.createNodeBuilder = (...a) => { n++; return cnb(...a); };
    const mat = kind === "ai" ? R.materialFor({ roughness: 0.6 }, false, 2) : R.materialFor({ roughness: 0.6 }, false, true);
    for (let i = 0; i < 5; i++) {
      const g = r1Geo(), k = 3 + i;
      g.setAttribute("instanceTint", new THREE.InstancedBufferAttribute(new Float32Array(k * 3).fill(1), 3));
      const m = kind === "ai" ? R.aiMesh(g, mat, k) : new THREE.InstancedMesh(g, mat, 2000);
      m.count = k; m.frustumCulled = false; scene.add(m);
    }
    fg.reset(); renderer.render(scene, camera);
    assert.equal(fg.counts.drawElementsInstanced || 0, 5);
    return n;
  };
  const ai = await builds("ai"), im = await builds("im");
  t.diagnostic(`node builds for 5 batches: attribute ${ai}, padded InstancedMesh ${im}`);
  assert.ok(im >= ai + 4, `padded InstancedMesh: one build per batch (${im} vs ${ai})`);
});

test("A2: the fallback / viz rungs get an instance-step copy that keeps the rung's program key", async (t) => {
  const { fg, renderer, scene, camera, R } = await r1Rig(t);
  const u = new THREE.MeshBasicNodeMaterial();
  u.colorNode = TSL.attribute("color", "vec3").mul(TSL.attribute("instanceTint", "vec3"));
  u.lights = false; u.customProgramCacheKey = () => "tlx-unlit-instanced";
  const ai = R.aiOf(u);
  assert.equal(R.aiOf(u), ai, "one copy per rung");
  assert.notEqual(ai, u, "the InstancedMesh rung itself is untouched");
  assert.equal(ai.customProgramCacheKey(), "ai-tlx-unlit-instanced");
  const g = r1Geo(); g.setAttribute("instanceTint", new THREE.InstancedBufferAttribute(new Float32Array(6).fill(1), 3));
  const m = R.aiMesh(g, ai, 2); m.frustumCulled = false; scene.add(m);
  fg.reset(); renderer.render(scene, camera);
  assert.ok(fg.shaders.some((s) => /\biM0\b/.test(s) && /gl_Position/.test(s)), "the unlit copy compiles the instance step");
});

test("A2: tlx.js builds batches, mirror views and their materials on the attribute path; the caster keeps its InstancedMesh", () => {
  const cib = fnSource(TLX, "      function createInstancedBatch(data, matrices, colors, opts) {");
  assert.match(cib, /const cap = _aiInst \? n : /, "no UBO pad on the attribute path");
  assert.match(cib, /const imesh = _aiInst \? _aiMesh\(geo, unlitMat, n\) : new THREE\.InstancedMesh\(geo, unlitMat, cap\);/);
  assert.match(fnSource(TLX, "      function drawInstanced(batch, opts) {"), /materialFor\(opts, false, batch\.imesh\.isInstancedMesh \? true : 2\)/);
  const mir = fnSource(TLX, "      function _mirOf(batch) {");
  assert.match(mir, /k !== "instanceTint" && !_AI_ATTR\.test\(k\)/, "the mirror view takes its own stream, never the main one's");
  assert.match(mir, /: _aiMesh\(g, main\.material \|\| unlitMat, main\.instanceMatrix\.count\);/);
  assert.match(fnSource(TLX, "      function fallbackMat(instanced) {"), /if \(instanced === 2\) return _drawMatMode >= 2 \? null : _aiOf\(unlitInstancedMat\);/);
  assert.match(TLX, /if \(vizMat\) return instanced === 2 \? _aiOf\(vizMat\) : vizMat;/);
  // The node-builder key keeps "I" + id for a real InstancedMesh only, so every A2 batch shares one state.
  assert.match(TLX, /const inst = ro\.object && ro\.object\.isInstancedMesh\s*\? "I" \+ ro\.object\.id : "M";/);
  const sh = read("js/render/three/tlx-shadow.js");
  assert.match(sh, /if \(k !== "instanceTint" && !\/\^iM\[0-3\]\$\/\.test\(k\)\) g\.setAttribute\(k, src\.attributes\[k\]\);/, "casterGeo drops the lit stream");
  assert.match(sh, /m = new THREE\.InstancedMesh\(casterGeo\(batch\.geo\), depthMat, sharedInstCap\(batch\.instances \| 0\)\);/, "the caster is still a padded InstancedMesh (R11 / A2 caster: not in this lane)");
  assert.match(sh, /batch\.imesh && batch\.imesh\.instanceMatrix[\s\S]{0,200}batch\.imesh\.instanceMatrix\.array/, "its copy reads the batch's instanceMatrix alias");
});


test("R1: owned run retirement uses the real warm-aware wrapper queue and preserves source geometry", async (t) => {
  const { R, scene } = await r1Rig(t);
  const geo=r1Geo();let sourceDisposals=0;geo.addEventListener("dispose",()=>{sourceDisposals++;});
  assert.equal(R.append(geo,carWheel(0),{roughness:0.55,doubleSided:true,coalesce:true,emissive:0}),true);
  const views=R.runs.get(geo).filter(Boolean).map(b=>({mesh:b.imesh,geometry:b.imesh.geometry,objects:0,geometries:0}));
  for(const v of views){v.mesh.addEventListener("dispose",()=>{v.objects++;});v.geometry.addEventListener("dispose",()=>{v.geometries++;});}
  R.warming(true);R.drop(geo);R.flush();
  assert.equal(R.runs.has(geo),false);assert.equal(R._instRegistry.length,0);
  for(const v of views){assert.equal(v.mesh.parent,null);assert.equal(v.mesh.geometry,v.geometry);assert.equal(v.objects,0);assert.equal(v.geometries,0);}
  R.warming(false);R.flush();R.flush();R.drop(geo);
  for(const v of views){assert.equal(v.objects,1);assert.equal(v.geometries,1);assert.equal(v.mesh.geometry,null);assert.equal(v.mesh.material,null);}
  assert.equal(sourceDisposals,0,"the source geometry is borrowed; only each owned run view retires");
});
