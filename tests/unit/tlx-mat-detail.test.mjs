// EXTREME material detail on TLX (features matDetail / envAll, js/perf/quality-preset.js FEATURES;
// docs/notes/DESKTOP-GRAPHICS-TIERS-2026-11-20.md Phase 3): the pure weight maths of the hex tiling and the
// biplanar wall blend, and the lit graph compiled to WGSL + GLSL with the features off (no new taps) and on.
// No GPU here: this proves the graph builds and carries the intended taps, not how it looks or what it costs.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";
import { makeFakeGL, installThreeGlobals } from "../helpers/fake-webgl2.mjs";
import * as THREE from "../../vendor/three-0.187.0/three.webgpu.min.js";
const read = (rel) => fs.readFileSync(new URL("../../" + rel, import.meta.url), "utf8");
installThreeGlobals();
globalThis.Log = globalThis.Log || { info() {}, warn() {}, error() {}, debug() {} };
for (const f of ["js/render/shared/light-budget.js", "js/lighting/knobs.js", "js/render/three/tsl-chunks.js", "js/render/three/tsl-lit.js"])
  vm.runInThisContext(read(f), { filename: absSrc(f) });
const M = globalThis.TLXShaders.matDetailMath;
const LIT = read("js/render/three/tsl-lit.js");
const TLX = read("js/render/three/tlx.js");

// Deterministic points (no Math.random: a failure must reproduce).
const pts = [];
for (let i = 0; i < 400; i++) pts.push([((i * 0.6180339887) % 1) * 37 - 11, ((i * 0.7548776662) % 1) * 29 - 7]);

test("hex grid: barycentric and gained weights are non-negative and sum to 1", () => {
  for (const [u, v] of pts) {
    const { bary, w } = M.hexGrid(u, v);
    for (const set of [bary, w]) {
      assert.ok(set.every((x) => x >= -1e-9 && x <= 1 + 1e-9), `weights in [0,1] at ${u},${v}: ${set}`);
      assert.ok(Math.abs(set[0] + set[1] + set[2] - 1) < 1e-9, `sum 1 at ${u},${v}: ${set}`);
    }
  }
});

test("hex grid: the three vertices are a lattice triangle whose barycentric blend is the point", () => {
  const k = 2 * Math.sqrt(3);
  for (const [u, v] of pts) {
    const { bary, verts } = M.hexGrid(u, v);
    const sx = u * k, sy = v * k, kx = sx - sy * 0.57735027, ky = sy * 1.15470054;
    const rx = bary[0] * verts[0][0] + bary[1] * verts[1][0] + bary[2] * verts[2][0];
    const ry = bary[0] * verts[0][1] + bary[1] * verts[1][1] + bary[2] * verts[2][1];
    assert.ok(Math.abs(rx - kx) < 1e-6 && Math.abs(ry - ky) < 1e-6, `reconstructs ${u},${v}`);
    const keys = new Set(verts.map((p) => p.join(",")));
    assert.equal(keys.size, 3, "three distinct vertices");
    for (const p of verts) assert.ok(p.every(Number.isInteger), "integer lattice vertices");
  }
});

test("hex grid: the weights are continuous across a cell edge (no seam in the blend)", () => {
  // Walking a fine line, a vertex's weight can only change smoothly; a vertex that enters or leaves does so at 0.
  let prev = null;
  for (let t = 0; t <= 2; t += 0.0005) {
    const g = M.hexGrid(0.37 + t, 0.11 + t * 0.43);
    const map = new Map(g.verts.map((p, i) => [p.join(","), g.w[i]]));
    if (prev) {
      for (const key of new Set([...map.keys(), ...prev.keys()])) {
        const a = prev.get(key) || 0, b = map.get(key) || 0;
        assert.ok(Math.abs(a - b) < 0.02, `weight of ${key} jumps ${a} -> ${b} at t=${t}`);
      }
    }
    prev = map;
  }
});

test("variance-preserving scale: 1 at a vertex, sqrt(3) at a centroid", () => {
  assert.ok(Math.abs(M.varScale([1, 0, 0]) - 1) < 1e-9);
  assert.ok(Math.abs(M.varScale([1 / 3, 1 / 3, 1 / 3]) - Math.sqrt(3)) < 1e-9);
});

test("biplanar weights: sum 1, follow the dominant axis, split a flat top face evenly", () => {
  for (let a = 0; a <= Math.PI * 2; a += 0.05) {
    const [wx, wz] = M.biplanar(Math.cos(a), Math.sin(a));
    assert.ok(Math.abs(wx + wz - 1) < 1e-9);
    if (Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) + 1e-6) assert.ok(wx > wz, `x-major at ${a}`);
  }
  assert.ok(M.biplanar(1, 0)[0] > 0.999999, "a +x face is all (z,y) plane");
  assert.ok(M.biplanar(0, -1)[1] > 0.999999, "a -z face is all (x,y) plane");
  assert.deepEqual(M.biplanar(0, 0), [0.5, 0.5], "a flat top face splits 50/50 instead of 0/0");
  const d = M.biplanar(Math.SQRT1_2, Math.SQRT1_2);
  assert.ok(Math.abs(d[0] - 0.5) < 1e-9, "45 degrees blends evenly");
});

test("the shader's hex grid and biplanar constants are the twin's", () => {
  assert.match(LIT, /const st = uv\.mul\(2\.0 \* Math\.sqrt\(3\.0\)\);/);
  assert.match(LIT, /vec2\(st\.x\.sub\(st\.y\.mul\(0\.57735027\)\), st\.y\.mul\(1\.15470054\)\)/);
  assert.match(LIT, /const s = step\(0\.0, z\.negate\(\)\)/);
  assert.match(LIT, /const g = w\.mul\(w\)\.mul\(w\);/);
  assert.match(LIT, /a\.x\.mul\(a\.x\)\.mul\(a\.x\.mul\(a\.x\)\)\.add\(1e-6\)/);
  // e. twice today's reach (today: normal 22->80 m, albedo 90->260 m).
  assert.match(LIT, /const fade = clamp\(vd\.sub\(44\.0\)\.div\(116\.0\)\.oneMinus\(\), 0\.0, 1\.0\)/);
  assert.match(LIT, /const far = clamp\(vd\.sub\(180\.0\)\.div\(340\.0\)\.oneMinus\(\), 0\.0, 1\.0\)/);
});

async function build(ctxExtra, language) {
  const fg = makeFakeGL();
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true });
  await renderer.init();
  const arr = () => {
    const t = new THREE.DataArrayTexture(new Uint8Array(17 * 4), 1, 1, 17);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true; t.needsUpdate = true;
    return t;
  };
  const cube = new THREE.CubeRenderTarget(4, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const lit = globalThis.TLXShaders.lit(THREE, THREE.TSL, Object.assign({
    chunks: globalThis.TLXShaders.chunks(THREE, THREE.TSL), maxLights: 16,
    matMaps: { albedo: arr(), normal: arr() }, envCube: cube.texture }, ctxExtra));
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
  const g = new THREE.BufferGeometry();
  for (const [n, k] of [["position", 3], ["normal", 3], ["color", 3], ["mat", 1], ["trk", 3], ["instanceTint", 3]])
    g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(k * 3), k));
  const m = new THREE.Mesh(g, lit.makeMaterial({})); m.frustumCulled = false; scene.add(m);
  renderer.backend.utils.getTextureSampleData = () => ({ primarySamples: 1 });
  const B = language === "wgsl" ? THREE.WGSLNodeBuilder : THREE.GLSLNodeBuilder;
  const b = new B(m, renderer); b.scene = scene; b.camera = cam; b.build();
  const out = { fs: b.fragmentShader, detail: lit.detail, lit };
  g.dispose(); m.material.dispose(); renderer.dispose();
  return out;
}

for (const language of ["wgsl", "glsl"]) {
  test(`${language}: features off build today's program; on adds the explicit-gradient taps`, async () => {
    await build({}, language);   // warm-up: three orders the shared render-struct members by first registration
    const none = await build({}, language);
    const off = await build({ detail: { matDetail: false, envAll: false, envLods: 7 } }, language);
    assert.equal(off.fs, none.fs, "detail flags false = no detail ctx, byte for byte");
    assert.deepEqual(none.detail, { matDetail: false, envAll: false });
    const grad = language === "wgsl" ? /textureSampleGrad\(/g : /textureGrad\(/g;
    assert.equal((none.fs.match(grad) || []).length, 0, "no gradient taps below EXTREME");
    const on = await build({ detail: { matDetail: true, envAll: true, envLods: 7 } }, language);
    assert.deepEqual(on.detail, { matDetail: true, envAll: true });
    // normal: 2 biplanar + 3 hex + 1 plain + 1 detail; albedo: 2 + 3 + 1; parallax: MD_POM_STEPS (6).
    assert.equal((on.fs.match(grad) || []).length, 19, "every matDetail tap takes explicit gradients");
    assert.match(on.fs, /3\.4641016/, "the hex grid scale (2 sqrt 3)");
    assert.match(on.fs, /sqrt\( nodeVar\d+ \) \* 7\.0/, "envAll: roughness-aware cube mip, sqrt(rough) x ENV_LODS");
    const matOnly = await build({ detail: { matDetail: true, envAll: false } }, language);
    assert.doesNotMatch(matOnly.fs, /\* 7\.0 \)/, "envAll off keeps today's env LOD");
  });
}

test("envAll needs a live cube: without one it compiles out, and setEnvStr's live bit drives envWorld", async () => {
  const lit = globalThis.TLXShaders.lit(THREE, THREE.TSL, { chunks: globalThis.TLXShaders.chunks(THREE, THREE.TSL), maxLights: 16,
    detail: { envAll: true, envLods: 7 } });
  assert.deepEqual(lit.detail, { matDetail: false, envAll: false }, "no cube, no pack: both features compile out");
  assert.equal(lit.uniforms.envWorld, undefined);
  const on = await build({ detail: { envAll: true, envLods: 7 } }, "wgsl");
  on.lit.setEnvStr(0.3, true);
  assert.equal(on.lit.uniforms.envWorld.value, 1);
  on.lit.setEnvStr(0.3, false);
  assert.equal(on.lit.uniforms.envWorld.value, 0);
  assert.equal(on.lit.uniforms.envStr.value, 0.3);
});

test("tlx.js asks for the features on desktop WebGPU only, and retries today's program if the detail factory throws", () => {
  assert.match(TLX, /if \(!isMobile && typeof GfxQuality !== "undefined" && renderer\.backend && renderer\.backend\.isWebGPUBackend\) \{\n\s*litDetail = \{ matDetail: GfxQuality\.feature\("matDetail"\), envAll: GfxQuality\.feature\("envAll"\), envLods: Math\.log2\(ENV_SIZE\) \};/);
  assert.match(TLX, /catch \(e\) \{\n\s*if \(!litDetail\) throw e;\n[^\n]*\n\s*lit = TLXShaders\.lit\(THREE, TSL, litCtx\);/);
  assert.match(TLX, /lit\.setEnvStr\(_envOn \? \(_T && _T\.carEnvCube != null \? _T\.carEnvCube : 0\) : 0, _envOn\);/);
});
