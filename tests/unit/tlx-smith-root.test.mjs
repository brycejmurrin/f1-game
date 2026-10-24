import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { makeFakeGL, installThreeGlobals } from "../helpers/fake-webgl2.mjs";
import * as THREE from "../../vendor/three-0.186.1/three.webgpu.min.js";
const read = rel => fs.readFileSync(new URL("../../" + rel, import.meta.url), "utf8");
installThreeGlobals();
globalThis.Log = globalThis.Log || { info() {}, warn() {}, error() {}, debug() {} };
for (const f of ["js/render/shared/light-budget.js", "js/lighting/knobs.js", "js/render/three/tsl-chunks.js", "js/render/three/tsl-lit.js"])
  vm.runInThisContext(read(f));
async function litGLSL() {
  const fg = makeFakeGL();
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true });
  await renderer.init();
  const lit = globalThis.TLXShaders.lit(THREE, THREE.TSL, { chunks: globalThis.TLXShaders.chunks(THREE, THREE.TSL), maxLights: 16 });
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
  const g = new THREE.BufferGeometry();
  for (const [n, k] of [["position", 3], ["normal", 3], ["color", 3], ["mat", 1], ["trk", 2]])
    g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(k * 3), k));
  const m = new THREE.Mesh(g, lit.makeMaterial({ clearcoat: 0.8, carPaint: 1 }));
  m.frustumCulled = false; scene.add(m);
  renderer.render(scene, cam);
  const src = fg.shaders.join("\n"); renderer.dispose();
  return { src };
}

test("lamp Smith visibility caches preserve f32 arithmetic and defer roots until accepted", () => {
  const src = read("js/render/three/tsl-lit.js");
  const body = src.match(/const V_SmithGGX = \(NoV, NoL, a, viewRoot\) => \{([\s\S]*?)\n    \};/)[1];
  const rootBody = src.match(/const smithViewRoot = \(NoV, a\) => \{([\s\S]*?)\n    \};/)[1];
  let roots = 0;
  class Scalar {
    constructor(x) { this.x = Math.fround(x instanceof Scalar ? x.x : x); }
    add(x) { return new Scalar(this.x + new Scalar(x).x); }
    mul(x) { return new Scalar(this.x * new Scalar(x).x); }
    div(x) { return new Scalar(this.x / new Scalar(x).x); }
    oneMinus() { return new Scalar(1 - this.x); }
  }
  const float = x => new Scalar(x);
  const sqrt = x => { roots++; return float(Math.sqrt(x.x)); };
  const max = (a, b) => float(Math.max(float(a).x, float(b).x));
  const visibility = Function("sqrt", "max", "float", `return (NoV,NoL,a,viewRoot)=>{${body}}`)(sqrt, max, float);
  // Independent pre-change equation: changing both production paths must fail parity.
  const reference = (n, l, a) => {
    const a2 = a.mul(a);
    const gv = l.mul(sqrt(n.mul(n).mul(a2.oneMinus()).add(a2)));
    const gl = n.mul(sqrt(l.mul(l).mul(a2.oneMinus()).add(a2)));
    return float(0.5).div(max(gv.add(gl), 1e-5));
  };
  const view = Function("sqrt", `return (NoV,a)=>{${rootBody}}`)(sqrt);
  for (const nv of [1e-4, .001, .01, .1, .25, .5, .75, 1]) {
    for (const av of [.0004, .0009, .01, .09, .49, 1]) {
      const a = float(av), n = float(nv), cached = view(n, a);
      assert(cached.x > 0, "negative sentinel cannot alias a valid view root");
      for (let j = 0; j <= 128; j++) {
        assert.equal(visibility(n, float(j / 128), a, cached).x, reference(n, float(j / 128), a).x);
      }
    }
  }
  // Execute the production initialization statements; first use may be any lamp.
  const blocks = [...src.matchAll(/If\((lamp(?:Coat)?ViewRoot)\.lessThan\(0\.0\), \(\) => \{([\s\S]*?)\n\s*\}\);/g)];
  assert.equal(blocks.length, 2);
  for (const count of [0, 1, 4, 16, 48]) for (const coat of [false, true]) for (const allRejected of [false, true]) {
    roots = 0;
    const cached = [-1, -1];
    for (let i = 0; i < count; i++) {
      // Range/attenuation/backface rejects never enter the production block.
      if (allRejected || i % 3 !== 2) continue;
      for (let k = 0; k < (coat ? 2 : 1); k++) {
        const key = blocks[k][1];
        const slot = { assign(v) { cached[k] = v.x; } };
        if (cached[k] < 0) Function(key, "smithViewRoot", "NoV", "a", "float", blocks[k][2])(
          slot, view, float(.5), float(.09), float);
      }
    }
    assert.equal(roots, !allRejected && count >= 3 ? (coat ? 2 : 1) : 0);
  }
});

test("lamp Smith caches are initialized outside the generated loop and rooted inside lazy branches", async () => {
  const { src } = await litGLSL();
  const caches = [...src.matchAll(/(nodeVar\d+) = -1\.0;/g)].map(m => m[1])
    .filter(id => src.includes(`if ( ( ${id} < 0.0 ) )`));
  assert.equal(caches.length, 2);
  const loopAt = src.indexOf("for ( int i = 0; i < 16; i ++ )");
  assert(loopAt > 0);
  for (const id of caches) {
    assert(src.indexOf(`${id} = -1.0;`) < loopAt);
    const branchAt = src.indexOf(`if ( ( ${id} < 0.0 ) )`);
    const rootAt = src.indexOf(`${id} = sqrt(`);
    assert(branchAt > loopAt && rootAt > branchAt);
    assert.equal(src.slice(branchAt, rootAt).includes("}"), false, "assignment stays in the lazy branch");
    assert(src.slice(rootAt).includes(` * ${id} )`), "visibility consumes the initialized root");
  }
});
