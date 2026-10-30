// Compile the actual post graph. This guards derivative safety/control flow;
// rendered pixel parity and device performance still need browser evidence.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";
import * as THREE from "../../vendor/three-0.187.0/three.webgpu.min.js";
import { makeFakeGL, installThreeGlobals } from "../helpers/fake-webgl2.mjs";

installThreeGlobals();
for (const file of ["tsl-chunks.js", "tsl-post.js"]) {
  vm.runInThisContext(fs.readFileSync(new URL(`../../js/render/three/${file}`, import.meta.url), "utf8"), { filename: absSrc(`js/render/three/${file}`) });
}

for (const language of ["WGSL", "GLSL"]) test(`folded mirror: ${language} samples only the exact inset with explicit gradients`, async () => {
  const fake = makeFakeGL(192, 96);
  const renderer = new THREE.WebGPURenderer({ canvas: fake.canvas, context: fake.gl, forceWebGL: true });
  const materials = [], targets = [];
  try {
    await renderer.init();
    // WGSL compilation only; the fake GL backend has no WebGPU sample query.
    renderer.backend.utils.getTextureSampleData = () => ({ primarySamples: 1 });
    const tex = () => {
      const rt = new THREE.RenderTarget(256, 128, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
      targets.push(rt); return rt.texture;
    };
    const p = window.TLXShaders.post(THREE, THREE.TSL, {
      chunks: window.TLXShaders.chunks(THREE, THREE.TSL), blackTex: tex(), whiteTex: tex(),
      sceneTex: tex(), sceneDepthTex: tex(), trackMaterial: m => materials.push(m),
    });
    p.fxaa.mirTex.value = tex();
    const Builder = language === "WGSL" ? THREE.WGSLNodeBuilder : THREE.GLSLNodeBuilder;
    const builder = new Builder(new THREE.QuadMesh(p.fxaa.mat), renderer);
    builder.camera = new THREE.PerspectiveCamera(); builder.scene = new THREE.Scene(); builder.build();
    const shader = builder.fragmentShader;
    const grad = language === "WGSL" ? "textureSampleGrad" : "textureGrad";
    assert.equal((shader.match(new RegExp(`\\b${grad}\\(`, "g")) || []).length, 1);
    assert.doesNotMatch(shader, /\b(?:dpdx|dpdy|dFdx|dFdy)\s*\(/, "no lazy derivatives within a varying branch");
    const insetGuards = shader.split("\n").filter(line => /\bif\s*\(/.test(line) && />=/.test(line) && /\.w/.test(line) && /\.z/.test(line));
    assert.equal(insetGuards.length, 1, "one inset guard: the mirror sample and its overwrite, FXAA in its else");
    assert.equal((insetGuards[0].match(/>=/g) || []).length, 2, "inclusive left/top");
    assert.equal((insetGuards[0].match(/<(?![=])/g) || []).length, 2, "exclusive right/bottom");
    assert.equal((insetGuards[0].match(/> 0\.5/g) || []).length, 1, "mirror-off remains gated by exactly one test");
    const branchStart = shader.indexOf(insetGuards[0]);
    let end = shader.indexOf("{", branchStart) + 1, depth = 1;
    for (; depth > 0 && end < shader.length; end++) {
      if (shader[end] === "{") depth++;
      if (shader[end] === "}") depth--;
    }
    assert.equal(depth, 0);
    const branch = shader.slice(branchStart, end);
    assert.doesNotMatch(branch, /\b(?:textureSample|texture)\s*\(/, "no implicit sample in the inset branch");
    const rest = shader.slice(end);
    assert.match(rest, /^\s*else\s*\{/, "FXAA runs only outside the inset (else of the same guard)");
    const sampler = branch.match(new RegExp(`${grad}\\(\\s*(\\w+)`))[1];   // throws unless the gradient call is in the branch
    assert.doesNotMatch(shader, new RegExp(`\\b(?:textureSample|texture)\\(\\s*${sampler}\\b`), "no additional fullscreen mirror sample");
  } finally {
    for (const m of materials) m.dispose();
    for (const rt of targets) rt.dispose();
    renderer.dispose();
  }
});

test("production mirror fallback declares its gradient sampler through cold/off/on/off transitions", async () => {
  for (const file of ["js/lighting/knobs.js", "js/render/shared/post-common.js", "js/render/three/tlx-post.js"]) {
    vm.runInThisContext(fs.readFileSync(new URL(`../../${file}`, import.meta.url), "utf8"), { filename: absSrc(file) });
  }
  const fake = makeFakeGL(192, 96);
  const renderer = new THREE.WebGPURenderer({ canvas: fake.canvas, context: fake.gl, forceWebGL: true });
  const original = window.TLXShaders.post;
  let graph, context, chain;
  window.TLXShaders.post = (T, tsl, ctx) => { context = ctx; return graph = original(T, tsl, ctx); };
  const mirror = new THREE.RenderTarget(128, 64, { type: THREE.HalfFloatType,
    generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  try {
    await renderer.init();
    renderer.backend.utils.getTextureSampleData = () => ({ primarySamples: 1 });
    // Drive actual present-time bindings, then compile only WGSL: one graph
    // cannot first cache GLSL helper functions and then switch backends.
    renderer.render = () => {};
    chain = window.TLXShaders.postChain(THREE, THREE.TSL, {
      renderer, isMobile: true, chunks: window.TLXShaders.chunks(THREE, THREE.TSL), shadow: null,
      softDest: () => null, wantSpatialUpscale: () => false, getPresentSize: () => [192, 96], sceneSamples: 0,
    });
    assert.equal(context.blackTex.minFilter, THREE.LinearFilter);
    assert.equal(context.blackTex.magFilter, THREE.LinearFilter);
    assert.ok(context.blackTex.version > 0, "fallback is marked for initial upload");
    assert.deepEqual(Array.from(context.blackTex.image.data), [0, 0, 0, 255], "same constant 1x1 fallback");
    chain.resize(192, 96);
    const I = new THREE.Matrix4().toArray();
    const frame = { proj: I, invProj: I, invVP: I, viewProj: I, time: 0,
      sunVS: [0, 0, -1], sunDir: [0, 1, 0], sunColor: [1, 1, 1], upVS: [0, 1, 0] };
    const build = () => {
      const b = new THREE.WGSLNodeBuilder(new THREE.QuadMesh(graph.fxaa.mat), renderer);
      b.camera = new THREE.PerspectiveCamera(); b.scene = new THREE.Scene(); b.build();
      return b.fragmentShader;
    };
    const declared = shader => {
      const sampler = /textureSampleGrad\(\s*\w+\s*,\s*(\w+)/.exec(shader)?.[1];
      assert.ok(sampler, "actual mirror gradient call emitted");
      return new RegExp(`var\\s+${sampler}\\s*:\\s*sampler\\b`).test(shader);
    };
    for (const on of [false, true, false, true]) {
      chain.setMirror(on ? mirror.texture : null, [17, 13, 63, 29], true, true);
      chain.present({ bloom: 0, ssao: 0, godray: 0, reflect: 0 }, frame);
      assert.equal(graph.fxaa.U.mir.value, on ? 1 : 0);
      assert.equal(graph.fxaa.mirTex.value, on ? mirror.texture : context.blackTex);
      assert.ok(declared(build()), `mirror ${on}: every gradient sample references a declared sampler`);
    }
    // Former negative control: on r186 the old Nearest DataTexture placeholder emitted textureSampleGrad against an
    // undeclared sampler (the startup defect). r187 (#35169, grad() with unfilterable textures) no longer does; the
    // Linear placeholder above stays, and the old one must not regress to an undeclared sampler either.
    chain.setMirror(null, [17, 13, 63, 29], true, true);
    chain.present({ bloom: 0, ssao: 0, godray: 0, reflect: 0 }, frame);
    context.blackTex.minFilter = context.blackTex.magFilter = THREE.NearestFilter;
    const nearest = build(), gradSampler = /textureSampleGrad\(\s*\w+\s*,\s*(\w+)/.exec(nearest)?.[1];
    assert.ok(!gradSampler || new RegExp(`var\\s+${gradSampler}\\s*:\\s*sampler\\b`).test(nearest),
      "r187: the nearest placeholder references no undeclared sampler");
  } finally {
    window.TLXShaders.post = original;
    if (chain) chain.dispose();
    mirror.dispose(); renderer.dispose();
  }
});
