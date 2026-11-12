// #4556 (perf hunt P1 follow-up of #4532): the TLX lit / post shader trims.
//  1. vertex sway is a real branch, and normalLocal is still assigned on EVERY vertex before it (the
//     acdf1fed black-garage class: a VarNode first built inside a branch strands its assignment there);
//  2. the hammered-finish derivatives run only under the per-draw carFinish uniform;
//  3. the post's dither step and vignette aspect/norm are CPU uniforms equal to the old per-pixel terms.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";
import { makeFakeGL, installThreeGlobals } from "../helpers/fake-webgl2.mjs";
import * as THREE from "../../vendor/three-0.187.0/three.webgpu.min.js";
const read = rel => fs.readFileSync(new URL("../../" + rel, import.meta.url), "utf8");
installThreeGlobals();
globalThis.Log = globalThis.Log || { info() {}, warn() {}, error() {}, debug() {} };
for (const f of ["js/render/shared/light-budget.js", "js/lighting/knobs.js", "js/render/three/tsl-chunks.js", "js/render/three/tsl-lit.js"])
  vm.runInThisContext(read(f), { filename: absSrc(f) });

async function litWgsl(opts) {
  const fg = makeFakeGL();
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true });
  await renderer.init();
  const lit = globalThis.TLXShaders.lit(THREE, THREE.TSL, { chunks: globalThis.TLXShaders.chunks(THREE, THREE.TSL), maxLights: 16 });
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
  const g = new THREE.BufferGeometry();
  for (const [n, k] of [["position", 3], ["normal", 3], ["color", 3], ["mat", 1], ["trk", 3], ["instanceTint", 3]])
    g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(k * 3), k));
  const m = new THREE.Mesh(g, lit.makeMaterial(opts)); m.frustumCulled = false; scene.add(m);
  renderer.backend.utils.getTextureSampleData = () => ({ primarySamples: 1 });
  const b = new THREE.WGSLNodeBuilder(m, renderer);
  b.scene = scene; b.camera = cam; b.build();
  const out = { vs: b.vertexShader, fs: b.fragmentShader };
  g.dispose(); m.material.dispose(); renderer.dispose();
  return out;
}
const flowOf = src => src.slice(src.indexOf("// flow"));

for (const [name, opts] of [["plain", {}], ["chunked", { chunked: true }], ["instanced", { instanced: true }], ["car paint", { carFinish: true, carPaint: 1, clearcoat: 0.8 }]]) {
  test(`${name}: the vertex sway is a branch and normalLocal is assigned before it`, async () => {
    const flow = flowOf((await litWgsl(opts)).vs);
    const nAt = flow.indexOf("normalLocal = normal;"), ifAt = flow.indexOf("if (");
    assert.ok(nAt >= 0, "normalLocal is assigned in the vertex body");
    assert.ok(ifAt > nAt, "…unconditionally, before the first branch");
    assert.match(flow, /if \( \( nodeVar\d+ == 15\.0 \) \)/, "flag branch keyed on the rounded id");
    assert.doesNotMatch(flow, /select\(/, "no select() left that runs both sway arms");
    const sinBefore = flow.slice(0, ifAt).match(/\bsin\(/g);
    assert.equal(sinBefore, null, "no sway sin() outside the branches");
  });
}

test("hammered-finish derivatives sit under the per-draw carFinish gate", async () => {
  const src = read("js/render/three/tsl-lit.js");
  assert.match(src, /If\(matU\.carFinish\.greaterThan\(0\.5\), \(\) => \{\n\s*hmDP1\.assign\(dFdx\(wp\)\); hmDP2\.assign\(dFdy\(wp\)\);/);
  const fs_ = flowOf((await litWgsl({})).fs);
  const first = fs_.search(/\bdpdx\(/);
  const gate = fs_.lastIndexOf("if ( ( object.", first);
  assert.ok(gate >= 0 && fs_.slice(gate, first).split("}").length === 1, "the first derivative is inside an object-uniform If");
});

test("post dither step and vignette aspect/norm: CPU uniforms equal the old per-pixel terms", () => {
  const post = read("js/render/three/tlx-post.js"), tsl = read("js/render/three/tsl-post.js");
  assert.match(tsl, /const dc = xy\.add\(C\.dthOff\)/);
  assert.match(tsl, /q\.x\.mulAssign\(C\.vigAspect\);\n\s*const vr = length\(q\)\.mul\(C\.vigNorm\);/);
  const f = Math.fround;
  const dth = Function("Math", "t", post.match(/const step60 = [^\n]+\n[^\n]+dthOff\.value = ([^;]+);/)[0]
    .replace(/C\.grainTime\.value/g, "t").replace("C.dthOff.value = ", "return ") + ";")
  for (const t of [0, 0.016, 1, 1.0666, 59.99, 123.456, 1e4 + 0.3]) {
    const old = f(f(Math.floor(f(f(t) * 60)) % 64) * f(5.588238));   // mod(floor(t*60), 64) * 5.588238 on the GPU
    assert.ok(Math.abs(f(dth(Math, t)) - old) <= 1e-3, `dither step at t=${t}`);
  }
  for (const [W, H] of [[844, 390], [1920, 1080], [390, 844], [512, 512]]) {
    const ax = (1 / H) / (1 / W), oldNorm = 0.70710678 / Math.hypot(ax * 0.5, 0.5);
    const va = W / H;
    assert.ok(Math.abs(va - ax) < 1e-9 && Math.abs(0.70710678 / Math.hypot(va * 0.5, 0.5) - oldNorm) < 1e-9, `${W}x${H}`);
  }
  assert.match(post, /C\.vigAspect\.value = va;\n\s*C\.vigNorm\.value = 0\.70710678 \/ Math\.hypot\(va \* 0\.5, 0\.5\);/);
});
