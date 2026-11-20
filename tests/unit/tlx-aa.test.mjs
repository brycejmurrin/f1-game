// TLXAA (js/render/three/tsl-aa.js): the desktop-tier TRAA / supersample / HDR-out maths, plus the TRAA graph
// compiled to WGSL and GLSL through the vendored three. Numeric contracts and compilation only: no GPU here, so
// image quality, ghosting and cost still need the laptop / gpu-census (docs/notes/DESKTOP-GRAPHICS-TIERS-2026-11-20.md).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";
import * as THREE from "../../vendor/three-0.187.0/three.webgpu.min.js";
import { makeFakeGL, installThreeGlobals } from "../helpers/fake-webgl2.mjs";

installThreeGlobals();
for (const file of ["tsl-chunks.js", "tsl-post.js", "tsl-aa.js"]) {
  vm.runInThisContext(fs.readFileSync(new URL(`../../js/render/three/${file}`, import.meta.url), "utf8"), { filename: absSrc(`js/render/three/${file}`) });
}
const A = window.TLXAA;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test("Halton(2,3) jitter: 8 distinct phases inside (-0.5, 0.5) px, mean near the pixel centre, cycle repeats", () => {
  assert.equal(A.halton(1, 2), 0.5);
  assert.equal(A.halton(2, 2), 0.25);
  assert.equal(A.halton(3, 2), 0.75);
  assert.ok(near(A.halton(1, 3), 1 / 3) && near(A.halton(2, 3), 2 / 3) && near(A.halton(3, 3), 1 / 9));
  const seen = new Set();
  let sx = 0, sy = 0;
  for (let n = 0; n < A.PHASES; n++) {
    const [x, y] = A.jitterPx(n);
    assert.ok(x > -0.5 && x < 0.5 && y > -0.5 && y < 0.5, `phase ${n} inside the pixel`);
    seen.add(x.toFixed(6) + "," + y.toFixed(6)); sx += x; sy += y;
  }
  assert.equal(seen.size, A.PHASES, "no phase repeats inside a cycle");
  assert.ok(Math.abs(sx / A.PHASES) < 0.07 && Math.abs(sy / A.PHASES) < 0.07, "no net sub-pixel shift of the image");
  assert.deepEqual(A.jitterPx(A.PHASES + 3), A.jitterPx(3));
  assert.deepEqual(A.jitterNdc(0.5, -0.25, 1000, 500), [0.001, -0.001]);
});

function persp(fov, aspect, n, f) {
  const t = 1 / Math.tan(fov / 2), e = new Float32Array(16);
  e[0] = t / aspect; e[5] = t; e[10] = (f + n) / (n - f); e[11] = -1; e[14] = (2 * f * n) / (n - f);
  return e;
}
const toNdc = (m, p) => {
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
  const z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14], w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  return [x / w, y / w, z / w, w];
};

test("applyJitter shifts every projected point by exactly +jx, +jy in NDC, at any depth", () => {
  const P = persp(1.0, 16 / 9, 0.1, 2000);
  for (const p of [[1, 2, -5], [-30, 4, -400], [0.2, -0.1, -0.5]]) {
    const a = toNdc(P, p), J = A.applyJitter(Float32Array.from(P), 0.002, -0.0013), b = toNdc(J, p);
    assert.ok(near(b[0] - a[0], 0.002, 1e-6) && near(b[1] - a[1], -0.0013, 1e-6), `point ${p}`);
    assert.ok(near(b[2], a[2], 1e-7), "depth untouched");
  }
});

const M4 = (e) => new THREE.Matrix4().fromArray(e);
function viewProj(eye, target, P) {
  const cam = new THREE.PerspectiveCamera();
  cam.position.set(...eye); cam.lookAt(...target); cam.updateMatrixWorld(true);
  const vp = M4(P).multiply(cam.matrixWorldInverse);
  return { vp: Float32Array.from(vp.elements), inv: Float32Array.from(vp.clone().invert().elements) };
}

test("reproject: a still camera maps a pixel to itself; a moved camera lands where the old view saw the point", () => {
  const P = persp(1.0, 2, 0.1, 1500);
  const a = viewProj([0, 2, 0], [0, 2, -10], P);
  const world = [3, 1, -20];
  const n = toNdc(a.vp, world);
  const uv = [n[0] * 0.5 + 0.5, n[1] * 0.5 + 0.5], d = n[2] * 0.5 + 0.5;
  const same = A.reproject(a.inv, a.vp, uv[0], uv[1], d, 0, 0);
  assert.ok(near(same.u, uv[0], 1e-4) && near(same.v, uv[1], 1e-4), "static: identity");
  assert.ok(near(same.wPrev, same.wCur, 1e-2) && near(same.wCur, 20, 1e-2), "view depth of the point");
  // The camera moved 1.5 m forward and yawed a little since the previous frame.
  const prev = viewProj([0.3, 2, 1.5], [0, 2, -10], P);
  const r = A.reproject(a.inv, prev.vp, uv[0], uv[1], d, 0, 0);
  const pn = toNdc(prev.vp, world);
  assert.ok(near(r.u, pn[0] * 0.5 + 0.5, 1e-4) && near(r.v, pn[1] * 0.5 + 0.5, 1e-4), "prev uv of the same world point");
  assert.ok(near(r.wPrev, pn[3], 1e-2), "its view depth in the previous frame");
  // Jitter: the depth was rasterised at the jittered spot, the unjitter puts it back on the point.
  const j = [0.004, -0.003], Pj = A.applyJitter(Float32Array.from(P), j[0], j[1]);
  const aj = viewProj([0, 2, 0], [0, 2, -10], Pj), nj = toNdc(aj.vp, world);
  const rj = A.reproject(a.inv, a.vp, nj[0] * 0.5 + 0.5, nj[1] * 0.5 + 0.5, nj[2] * 0.5 + 0.5, j[0], j[1]);
  assert.ok(near(rj.u, uv[0], 1e-4) && near(rj.v, uv[1], 1e-4), "unjittered reprojection");
  // The sky (depth 1 on an infinite far plane would divide by zero): clamped to a finite far point.
  const sky = A.reproject(a.inv, a.vp, 0.5, 0.9, 1, 0, 0);
  assert.ok(Number.isFinite(sky.u) && Number.isFinite(sky.v) && near(sky.u, 0.5, 1e-3) && near(sky.v, 0.9, 1e-3));
});

test("neighbourhood clamp, disocclusion and camera-cut tests", () => {
  assert.deepEqual(A.clampRGB([0.9, 0.1, 0.5], [0.2, 0.2, 0.2], [0.6, 0.6, 0.6]), [0.6, 0.2, 0.5]);
  assert.equal(A.disoccluded(20, 20.5), false, "same surface");
  assert.equal(A.disoccluded(4, 20), true, "a car that has left the pixel");
  assert.equal(A.disoccluded(20, -1), true, "behind the old camera");
  const f = [0, 0, -1];
  assert.equal(A.camCut([0, 2, 0], [0, 2, -1.6], f, f), false, "350 km/h at 60 Hz");
  assert.equal(A.camCut([0, 2, 0], [0, 2, -40], f, f), true, "teleport / replay seek");
  const turned = [Math.sin(0.6), 0, -Math.cos(0.6)];
  assert.equal(A.camCut([0, 2, 0], [0, 2, 0], f, turned), true, "a cut to another camera angle");
  assert.equal(A.camCut(null, [0, 0, 0], f, f), true, "no history");
  const fw = A.forwardOf(viewProj([0, 2, 0], [0, 2, -10], persp(1, 2, 0.1, 1000)).inv);
  assert.ok(near(fw[2], -1, 1e-4) && near(fw[0], 0, 1e-4));
});

test("supersample ceiling: 1.5 at DPR <= 1.25, 2 in CINEMA, capped by the device limit and the pixel budget", () => {
  assert.equal(A.ssCeil({}), 1);
  assert.equal(A.ssCeil({ superSample: true, dpr: 1, presentW: 1920, presentH: 1080, maxDim: 8192 }), 1.5);
  assert.equal(A.ssCeil({ superSample: true, dpr: 2, presentW: 2880, presentH: 1800, maxDim: 8192 }), 1, "retina: already sampled by its DPR");
  assert.equal(A.ssCeil({ ss2x: true, dpr: 1, presentW: 1920, presentH: 1080, maxDim: 8192 }), 2);
  assert.equal(A.ssCeil({ ss2x: true, dpr: 2, presentW: 2880, presentH: 1800, maxDim: 8192 }), 1.78, "pixel budget");
  assert.equal(A.ssCeil({ ss2x: true, presentW: 5000, presentH: 1000, maxDim: 8192 }), 1.63, "device texture limit");
  assert.equal(A.ssCeil({ superSample: true, dpr: 1, presentW: 9000, presentH: 9000, maxDim: 8192 }), 1, "never below 1");
});

test("HDR peak: only a confirmed rgba16float + extended canvas on an HDR display; SDR (1) otherwise", () => {
  const cfg = { format: "rgba16float", toneMapping: { mode: "extended" } };
  assert.equal(A.hdrPeak({ want: true, webgpu: true, displayHdr: true, config: cfg }), A.HDR_PEAK);
  assert.equal(A.hdrPeak({ want: true, webgpu: true, displayHdr: false, config: cfg }), 1);
  assert.equal(A.hdrPeak({ want: true, webgpu: true, displayHdr: true, config: { format: "rgba16float", toneMapping: { mode: "standard" } } }), 1, "browser ignored the request");
  assert.equal(A.hdrPeak({ want: true, webgpu: true, displayHdr: true, config: null }), 1, "no getConfiguration: unknown");
  assert.equal(A.hdrPeak({ want: true, webgpu: true, soft: true, displayHdr: true, config: cfg }), 1, "soft present reads RGBA8");
  assert.equal(A.hdrPeak({ want: false, webgpu: true, displayHdr: true, config: cfg }), 1);
});

test("the stretched ACES curve keeps shadows and mid-tones and only lifts highlights (tsl-post.js hdrPeak, same formula)", () => {
  const aces = (x) => Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
  const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const hdr = (x, p) => { const s = aces(x); return s + Math.max(aces(x / p) * p - s, 0) * ss(0.7, 1.0, s); };
  for (const x of [0, 0.01, 0.05, 0.18, 0.4, 0.6]) assert.equal(hdr(x, 2.5), aces(x), `x=${x} unchanged (SDR out < 0.7)`);
  assert.ok(hdr(8, 2.5) > 1.5 && hdr(8, 2.5) <= 2.5, "a highlight rises above SDR white");
  for (let x = 0; x < 20; x += 0.05) assert.ok(hdr(x + 0.05, 2.5) >= hdr(x, 2.5), "monotone");
  for (let x = 0; x < 20; x += 0.5) assert.equal(hdr(x, 1), aces(x), "peak 1 is the SDR curve");
});

for (const language of ["WGSL", "GLSL"]) test(`TRAA resolve and copy compile (${language}); the controller resets, ping-pongs and only advances live`, async () => {
  const fake = makeFakeGL(64, 32);
  const renderer = new THREE.WebGPURenderer({ canvas: fake.canvas, context: fake.gl, forceWebGL: true });
  const materials = [], targets = [], passes = [];
  try {
    await renderer.init();
    renderer.backend.utils.getTextureSampleData = () => ({ primarySamples: 1 });
    const ldr = new THREE.RenderTarget(64, 32); targets.push(ldr);
    const depth = new THREE.DepthTexture(64, 32);
    const aa = A.taa(THREE, THREE.TSL, {
      runPass: (m, t) => passes.push([m.name, t]), ownRT: (rt) => { targets.push(rt); return rt; },
      trackMaterial: (m) => materials.push(m), ldrTex: ldr.texture, depthTex: depth,
    });
    const P = persp(1, 2, 0.1, 1000), v = viewProj([0, 2, 0], [0, 2, -10], P);
    const F = { invVP: v.inv, viewProj: v.vp, eye: [0, 2, 0] };
    const j = aa.jitter(64, 32);
    assert.ok(Math.abs(j[0]) < 1 / 64 && Math.abs(j[1]) < 1 / 32, "under a pixel of NDC");
    const h1 = aa.resolve(F, 64, 32, null, false);
    assert.deepEqual(passes.map((p) => p[0]), ["tlx-post-traa", "tlx-post-traa-out"]);
    assert.equal(passes[0][1], h1, "the resolve writes the history the copy reads");
    assert.equal(passes[1][1], null, "the copy draws the destination (the canvas)");
    assert.equal(h1.texture.type, THREE.HalfFloatType, "history keeps half-float colour + depth alpha");
    assert.equal(aa.state().frames, 0, "a warm (not live) does not advance the history");
    const h2 = aa.resolve(F, 64, 32, null, true), h3 = aa.resolve(F, 64, 32, null, true);
    assert.notEqual(h2, h3, "ping-pong between the two history targets");
    assert.equal(aa.state().resets, 1, "first live frame resets; a still camera does not");
    aa.resolve({ ...F, eye: [0, 2, -50] }, 64, 32, null, true);
    assert.equal(aa.state().resets, 2, "a teleport resets");
    aa.skipped(); aa.resolve(F, 64, 32, null, true);
    assert.equal(aa.state().resets, 3, "a frame that skipped the TAA resets");
    aa.resolve(F, 32, 16, null, true);
    assert.equal(aa.state().resets, 4, "a resize resets");
    for (const name of ["tlx-post-traa", "tlx-post-traa-out"]) {
      const mat = materials.find((m) => m.name === name);
      const Builder = language === "WGSL" ? THREE.WGSLNodeBuilder : THREE.GLSLNodeBuilder;
      const b = new Builder(new THREE.QuadMesh(mat), renderer);
      b.camera = new THREE.PerspectiveCamera(); b.scene = new THREE.Scene(); b.build();
      assert.ok(b.fragmentShader.length > 100, `${name} compiled`);
    }
    aa.dispose();
  } finally {
    for (const m of materials) m.dispose();
    for (const rt of targets) rt.dispose();
    renderer.dispose();
  }
});

test("hdrOut: the hdrPeak uniform exists only on a confirmed HDR build, and that composite compiles", async () => {
  const fake = makeFakeGL(64, 32);
  const renderer = new THREE.WebGPURenderer({ canvas: fake.canvas, context: fake.gl, forceWebGL: true });
  const materials = [], targets = [];
  try {
    await renderer.init();
    renderer.backend.utils.getTextureSampleData = () => ({ primarySamples: 1 });
    const tex = () => { const rt = new THREE.RenderTarget(64, 32); targets.push(rt); return rt.texture; };
    const mk = (extra) => window.TLXShaders.post(THREE, THREE.TSL, {
      chunks: window.TLXShaders.chunks(THREE, THREE.TSL), blackTex: tex(), whiteTex: tex(),
      sceneTex: tex(), sceneDepthTex: tex(), trackMaterial: (m) => materials.push(m), ...extra,
    });
    assert.equal(mk({}).composite.U.hdrPeak, undefined, "feature off: no uniform, today's program");
    assert.equal(mk({ hdrPeak: 1 }).composite.U.hdrPeak, undefined, "SDR canvas: no uniform");
    const p = mk({ hdrPeak: 2.5 });
    assert.equal(p.composite.U.hdrPeak.value, 2.5);
    const b = new THREE.WGSLNodeBuilder(new THREE.QuadMesh(p.composite.mat), renderer);
    b.camera = new THREE.PerspectiveCamera(); b.scene = new THREE.Scene(); b.build();
    assert.ok(b.fragmentShader.length > 100);
  } finally {
    for (const m of materials) m.dispose();
    for (const rt of targets) rt.dispose();
    renderer.dispose();
  }
});
