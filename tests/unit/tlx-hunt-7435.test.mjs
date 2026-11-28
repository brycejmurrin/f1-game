// #7435: TLX render leftovers from hunt #5777 (R17a, R17b, R17c, R22). Each test fails on the base it fixes.
//  R17a  the clearcoat mirror's probe-cube fetch runs only while the probe is live (real WGSL build);
//  R17b  the city-glow pow base has GLX's 1e-4 floor (glsl-sky.js).
//  R17c (ownsFb) and R22 (releaseGeoMirrors keeps Stream arrays) run the real functions in tlx-r187-contracts.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";
import { makeFakeGL, installThreeGlobals } from "../helpers/fake-webgl2.mjs";
import * as THREE from "../../vendor/three-0.187.0/three.webgpu.min.js";
const read = rel => fs.readFileSync(new URL("../../" + rel, import.meta.url), "utf8");
const code = (s) => s.replace(/^[ \t]*\/\/.*$/gm, "");
installThreeGlobals();
globalThis.Log = globalThis.Log || { info() {}, warn() {}, error() {}, debug() {} };
for (const f of ["js/render/shared/light-budget.js", "js/lighting/knobs.js", "js/render/three/tsl-chunks.js", "js/render/three/tsl-lit.js"])
  vm.runInThisContext(read(f), { filename: absSrc(f) });

test("R17a: the clearcoat mirror samples the probe cube only inside `probe strength > 0`", async () => {
  const fg = makeFakeGL();
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true });
  await renderer.init();
  const S = globalThis.TLXShaders;
  const lit = S.lit(THREE, THREE.TSL, { chunks: S.chunks(THREE, THREE.TSL), maxLights: 16, envCube: new THREE.CubeTexture() });
  const g = new THREE.BufferGeometry();
  for (const [n, k] of [["position", 3], ["normal", 3], ["color", 3], ["mat", 1], ["trk", 3], ["instanceTint", 3]])
    g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(k * 3), k));
  const m = new THREE.Mesh(g, lit.makeMaterial({ carFinish: true, carPaint: 1, clearcoat: 0.8 }));
  m.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(m);
  renderer.backend.utils.getTextureSampleData = () => ({ primarySamples: 1 });
  const b = new THREE.WGSLNodeBuilder(m, renderer);
  b.scene = scene; b.camera = new THREE.PerspectiveCamera(); b.build();
  const fs_ = b.fragmentShader;
  g.dispose(); m.material.dispose(); renderer.dispose();
  const cube = (fs_.match(/var (\w+) : texture_cube<f32>;/) || [])[1];
  assert.ok(cube, "the env cube is bound");
  // The FIRST cube fetch is the lacquer mirror (envSurface block; the metal / envAll taps follow it).
  const at = fs_.indexOf(`textureSampleLevel( ${cube},`);
  assert.ok(at > 0, "the lacquer mirror fetches the cube");
  const before = fs_.slice(Math.max(0, at - 400), at);
  const gate = before.match(/let (\w+) = clamp\( [^;]+, 0\.0, 1\.0 \);\s*if \( \( (\w+) > 0\.0 \) \) \{\s*\w+ = $/);
  assert.ok(gate, `the fetch sits directly under a probe-strength branch:\n${before}`);
  assert.equal(gate[1], gate[2], "the branch tests the clamped probe strength the mix uses");
});

test("R17b: the city-glow horizon pow has GLX's 1e-4 base floor", () => {
  const sky = code(read("js/render/three/tsl-sky.js"));
  assert.match(sky, /const horiz = pow\(max\(clamp\(max\(dir\.y, 0\.0\)\.mul\(2\.4\)\.oneMinus\(\), 0\.0, 1\.0\), 1e-4\),\s*U\.cityGlowReach\.mul\(3\.0\)\);/);
});
