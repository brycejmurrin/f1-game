/* TLX perf hunt 3, lane TLX-1 (2026-10-13). No browser, no GPU: three r186's REAL WebGPURenderer({ forceWebGL })
 * over a no-op WebGL2 context (tests/helpers/fake-webgl2.mjs) compiles the REAL tsl-lit material, so a test can
 * read the GLSL it generated (the hunt-1 codegen-dump method); the rest are source pins on tlx.js / tlx-post.js.
 * A unit test of a backend is not evidence it runs: the follow-up is gfx-probe + gpu-census.yml (macos).
 *   R4  no env cube target / sampler while TLX is opted out of the live env probe
 *   R3  phone MEDIUM: one-attachment scene target, no ssrTag MRT, a distinct fallback in the composite's tag slot
 *   R7  dry-day SSR gate on po.reflect (game.js, every backend), behind apex26.ssrDayGate (default OFF)
 *   R9  the particle / rain stream wraps the producer's array instead of copying it per upload */
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
const THREE = await import(pathToFileURL(path.join(ROOT, "vendor/three-0.186.0/three.webgpu.min.js")).href);
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
  assert.match(TLX, /function _tagSwap\(\) \{\s*if \(!post \|\| !post\.tagOn \|\| _warmPending \|\| post\.tagOn\(\) === _wantTag\(\)\) return;[\s\S]{0,200}post = buildPost\(\); if \(post\) post\.resize\(W, H\);/,
    "a GRAPHICS change that moves the rule rebuilds the chain");
  const b = TLX.indexOf("        begin(frame) {");
  assert.match(TLX.slice(b, b + 1200), /_tagSwap\(\);/, "begin() runs the swap before the scene records");
});

test("R7: the dry-day SSR gate zeroes po.reflect only on a dry day below the 1/64 weight, and only when armed", () => {
  const G = gameSource();
  const m = G.match(/^ {2}const _ssrPo = (.+);$/m);
  assert.ok(m, "the gated po.reflect input moved — check this test, not the code");
  const gate = new Function("_ssrDayGate", "frame", "_ssr", `"use strict"; return ${m[1]};`);
  const day = { lights: false, wetness: 0 }, night = { lights: true, wetness: 0 }, wet = { lights: false, wetness: 0.4 };
  assert.equal(gate(false, day, 0.07), 0.07, "default OFF: today's value");
  assert.equal(gate(true, day, 0.07), 0, "shipped 0.07: weight 0.0143 < 1/64 -> skipped");
  assert.equal(gate(true, day, 0.074), 0, "the presets' 0.074 -> skipped");
  assert.equal(gate(true, day, 0.1), 0.1, "baku's 0.1 (weight 0.0204) keeps the march");
  assert.equal(gate(true, night, 0.08), 0.08, "dry night neon sheen untouched");
  assert.equal(gate(true, wet, 0.05), 0.05, "a wet road never gates");
  assert.match(G, /po\.reflect = PerfGov\.tier\(\) >= 2 \? 0 : _ssrPo;/, "the one input every backend reads");
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
    ${fnText("function setRange0(attr, count) {")}
    ${fnText("function ensureStream(slot, verts) {")}
    ${fnText("function wrapStream(slot, arr) {")}
    ${fnText("function uploadStream(slot, floats) {")}
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
  P.api.drawParticles(vertA, 400, false, false);
  assert.equal(s.geo, geo0, "a clean re-issue keeps the stream");
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
