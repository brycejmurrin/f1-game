/* TLX perf hunt 3, lane TLX-1 (2026-10-13). No browser, no GPU: three r186's REAL WebGPURenderer({ forceWebGL })
 * over a no-op WebGL2 context (tests/helpers/fake-webgl2.mjs) compiles the REAL tsl-lit material, so a test can
 * read the GLSL it generated (the hunt-1 codegen-dump method); the rest are source pins on tlx.js / tlx-post.js.
 * A unit test of a backend is not evidence it runs: the follow-up is gfx-probe + gpu-census.yml (macos).
 *   R4  no env cube target / sampler while TLX is opted out of the live env probe */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeFakeGL, installThreeGlobals } from "../helpers/fake-webgl2.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const TLX = read("js/render/three/tlx.js");

installThreeGlobals();
globalThis.Log = globalThis.Log || { info() {}, warn() {}, error() {}, debug() {} };
const THREE = await import(pathToFileURL(path.join(ROOT, "vendor/three-0.186.0/three.webgpu.min.js")).href);
const TSL = THREE.TSL;
for (const f of ["js/render/shared/light-budget.js", "js/render/three/tsl-chunks.js", "js/render/three/tsl-lit.js"])
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
