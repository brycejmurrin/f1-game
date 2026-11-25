// EXTREME car surface (GfxQuality feature carSurf; js/render/three/tsl-carsurf.js): the pure maths, and the lit
// program contract — feature off (or GfxQuality absent) compiles the SAME WGSL/GLSL as before, feature on builds.
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
for (const f of ["js/render/shared/light-budget.js", "js/lighting/knobs.js", "js/render/three/tsl-chunks.js",
  "js/render/three/tsl-carsurf.js", "js/render/three/tsl-lit.js"])
  vm.runInThisContext(read(f), { filename: absSrc(f) });
const CS = vm.runInThisContext("TLXCarSurf");
const M = CS.math;
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const unit = v => Math.hypot(...v);

async function litSrc(language, opts) {
  const fg = makeFakeGL();
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true });
  await renderer.init();
  const lit = globalThis.TLXShaders.lit(THREE, THREE.TSL, { chunks: globalThis.TLXShaders.chunks(THREE, THREE.TSL), maxLights: 16 });
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
  const g = new THREE.BufferGeometry();
  for (const [n, k] of [["position", 3], ["normal", 3], ["color", 3], ["mat", 1], ["trk", 3], ["instanceTint", 3]])
    g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(k * 3), k));
  const m = new THREE.Mesh(g, lit.makeMaterial(opts)); m.frustumCulled = false; scene.add(m);
  let src;
  if (language === "WGSL") {
    renderer.backend.utils.getTextureSampleData = () => ({ primarySamples: 1 });
    const b = new THREE.WGSLNodeBuilder(m, renderer);
    b.scene = scene; b.camera = cam; b.build();
    src = b.vertexShader + "\n" + b.fragmentShader;
  } else {
    renderer.render(scene, cam);
    src = fg.shaders.join("\n");
  }
  g.dispose(); m.material.dispose(); renderer.dispose();
  return src;
}
async function withQuality(gq, fn) {
  const had = Object.hasOwn(globalThis, "GfxQuality"), prev = globalThis.GfxQuality;
  if (gq === undefined) delete globalThis.GfxQuality; else globalThis.GfxQuality = gq;
  try { return await fn(); } finally { if (had) globalThis.GfxQuality = prev; else delete globalThis.GfxQuality; }
}
const gqFeature = on => ({ feature: n => (n === "carSurf" ? on : false) });
const CAR = { carFinish: true, carPaint: 1, clearcoat: 0.8 };

test("fade and footprintFade: endpoints and monotone non-increasing", () => {
  assert.equal(M.fade(5, 10, 30), 1); assert.equal(M.fade(30, 10, 30), 0); assert.equal(M.fade(20, 10, 30), 0.5);
  for (const size of [0.0025, 0.0032, 0.0165]) {
    let prev = Infinity;
    for (let px = 0; px <= 0.05; px += 0.0001) {
      const f = M.footprintFade(px, size, 0.35, 1.0);
      assert.ok(f <= prev + 1e-12 && f >= 0 && f <= 1, `size ${size} px ${px}`);
      prev = f;
    }
    assert.equal(M.footprintFade(0.2 * size, size, 0.35, 1.0), 1);
    assert.equal(M.footprintFade(1.2 * size, size, 0.35, 1.0), 0);
  }
});

test("anisoAlphas: isotropic at 0, mean-preserving (at^2 + ab^2 = 2 alpha^2), ab <= at", () => {
  for (const alpha of [0.05, 0.27, 0.6, 1]) {
    const [t0, b0] = M.anisoAlphas(alpha, 0);
    assert.ok(near(t0, alpha) && near(b0, alpha));
    for (const a of [0.1, 0.5, 0.75, 1]) {
      const [at, ab] = M.anisoAlphas(alpha, a);
      assert.ok(near(at * at + ab * ab, 2 * alpha * alpha, 1e-12), `alpha ${alpha} a ${a}`);
      assert.ok(ab <= at);
    }
  }
});

test("saaAlpha2: zero variance is identity, the kernel clamps at kappa, the result stays <= 1", () => {
  assert.equal(M.saaAlpha2(0.04, 0), 0.04);
  assert.ok(near(M.saaAlpha2(0.04, 1e9), 0.04 + CS.K.saa.kappa));
  assert.equal(M.saaAlpha2(0.95, 10), 1);
  assert.ok(M.saaAlpha2(0.1, 0.2) > M.saaAlpha2(0.1, 0.1));
});

test("SDF helpers: signs, distances and groove profile", () => {
  assert.equal(M.sdSegment(0, 1, -1, 0, 1, 0), 1);
  assert.equal(M.sdSegment(3, 0, -1, 0, 1, 0), 2);
  assert.ok(M.sdRoundBox(0, 0, 1, 0.5, 0.1) < 0);
  assert.ok(near(M.sdRoundBox(2, 0, 1, 0.5, 0.1), 1));
  assert.ok(near(M.sdRoundBox(0, 0.5, 1, 0.5, 0.1), 0));
  assert.ok(near(M.sdAnnulus(0.3, 0.4, 0.5), 0) && near(M.sdAnnulus(0, 0, 0.5), 0.5));
  assert.equal(M.groove(0, 0.003), 1); assert.equal(M.groove(0.003, 0.003), 0); assert.equal(M.groove(0.01, 0.003), 0);
  assert.equal(M.grooveSlope(0, 0.003), 0); assert.ok(M.grooveSlope(0.002, 0.003) > 0);
});

test("strength 0 returns the unmodified normal (perturb, edgeBend)", () => {
  const N = [0, 1, 0];
  assert.deepEqual(M.perturb(N, [0.3, 0.1, -0.2], 0), N);
  assert.deepEqual(M.edgeBend(N, [0.6, 0.8, 0], 0.4, 0), N);
  assert.deepEqual(M.edgeBend(N, [0.6, 0.8, 0], 0, 1), N);   // no normal cone (flat / hard split edge): no bend
  const p = M.perturb(N, [0.3, 0.1, -0.2], 1);
  assert.ok(near(unit(p), 1, 1e-12) && p[0] < 0 && p[2] > 0, "surface gradient tilts against g; N.g is dropped");
  const e = M.edgeBend(N, [0.6, 0.8, 0], 0.4, 1);
  assert.ok(near(unit(e), 1, 1e-12) && e[0] > 0 && Math.acos(e[1]) <= CS.K.edge.cone + 1e-9, "bend toward H, at most the cone");
});

test("flakeLod keeps the mean (w * gain constant) and widens with flakes per pixel; refractOut bends toward N", () => {
  for (const cpp of [0.1, 1, 2, 5]) {
    const { w, gain } = M.flakeLod(cpp);
    assert.ok(near(w * gain, CS.K.flake.w0, 1e-15));
    if (cpp > 1) assert.ok(w > CS.K.flake.w0);
  }
  const N = [0, 0, 1], d = [Math.sin(1), 0, Math.cos(1)], t = M.refractOut(d, N, 1.5);
  assert.ok(near(unit(t), 1, 1e-12) && t[2] > d[2] && near(t[0], Math.sin(1) / 1.5, 1e-12), "Snell: sin t = sin i / n");
});

test("the seam: enabled() follows GfxQuality.feature, never throwing", async () => {
  await withQuality(undefined, () => assert.equal(CS.enabled(), false));
  await withQuality(gqFeature(false), () => assert.equal(CS.enabled(), false));
  await withQuality(gqFeature(true), () => assert.equal(CS.enabled(), true));
  await withQuality({ feature() { throw new Error("x"); } }, () => assert.equal(CS.enabled(), false));
});

for (const lang of ["WGSL", "GLSL"]) {
  test(`${lang}: carSurf off (and GfxQuality absent) compiles the same lit program; on builds a different one`, async () => {
    // three's shared camera uniforms settle their struct order on the first build of a process: warm it first
    await withQuality(undefined, () => litSrc(lang, {}));
    for (const opts of [{}, CAR]) {
      const absent = await withQuality(undefined, () => litSrc(lang, opts));
      const off = await withQuality(gqFeature(false), () => litSrc(lang, opts));
      assert.equal(off, absent, "feature off = GfxQuality absent, character for character");
      const on = await withQuality(gqFeature(true), () => litSrc(lang, opts));
      assert.notEqual(on, off, "feature on changes the program");
      assert.ok(on.length > off.length);
    }
    // the chunked / instanced graphs never carry the car hooks
    for (const opts of [{ chunked: true }, { instanced: true }]) {
      const off = await withQuality(gqFeature(false), () => litSrc(lang, opts));
      const on = await withQuality(gqFeature(true), () => litSrc(lang, opts));
      assert.equal(on, off, JSON.stringify(opts));
    }
  });
}

test("tsl-lit.js: every carSurf hook is a JS-time `cs` guard, and CSN is read once per factory", () => {
  const src = read("js/render/three/tsl-lit.js");
  assert.equal((src.match(/TLXCarSurf\.nodes\(/g) || []).length, 1);
  const uses = src.split("\n").filter(l => /\bCSN\.[a-zA-Z]+\(/.test(l));
  assert.ok(uses.length >= 7, `hooks found: ${uses.length}`);
  for (const l of uses) assert.match(l, /\bcs \?|if \(cs\)|CSN && !chunked && !instanced/, l.trim());
});

// #6509 item 3: the FICTIONAL sidewall text (no texture, no uniform; a packed 5x7 font).
test("sidewall text: fictional string, every glyph in the font, packed floats exact and decoded back", () => {
  const T = CS.K.text;
  assert.equal(T.str, "APEX 26 · RACE SLICK", "the line is the game's own name; a change here needs a licence look");
  assert.throws(() => M.packText("Q"), /no glyph/);
  const { packed, ncol } = CS.text;
  assert.equal(ncol, [...T.str].length * 6);
  for (const v of packed) assert.ok(Number.isInteger(v) && v >= 0 && v < 2 ** 21, `${v} exact in float32`);
  assert.ok(Math.fround(packed[0]) === packed[0]);
  [...T.str].forEach((ch, i) => {
    for (let r = 0; r < 7; r++) for (let c = 0; c < 6; c++) {
      const want = c < 5 && CS.font[ch][r][c] === "#" ? 1 : 0;
      assert.equal(M.textBit(packed, i * 6 + c, r), want, `${ch} r${r} c${c}`);
    }
  });
  for (const [col, row] of [[-1, 0], [ncol, 0], [0, -1], [0, 7]]) assert.equal(M.textBit(packed, col, row), 0);
});

test("sidewall text: cells stay inside the band, read left to right on both faces, upright at the top", () => {
  const T = CS.K.text, { ncol } = CS.text, rMid = (T.r0 + T.r1) / 2;
  // car-wheels.js radii (r 0.34, rimR 0.68 r; band inner = max(0.76 e, 0.96 e - bandWidth), e the crown/shoulder):
  // the default crown (0.948, bandWidth 0.09) keeps the band clear of the text; SH1/SH2 or a wide band reach into it,
  // which is why the ink only prints on dark rubber (inkOn), never on the coloured band.
  const R = 0.34, bandIn = (e, bw) => R * Math.max(0.76 * e, 0.96 * e - bw);
  assert.ok(T.r0 > R * 0.68, "outboard of the rim");
  assert.ok(T.r1 < bandIn(0.948, 0.09), "inboard of the default band");
  assert.ok(bandIn(0.874, 0.132) < T.r1, "a wide SH2 band does overlap: the inkOn gate is load-bearing");
  assert.equal(M.inkOn(0.16), 1, "sidewall rubber / dark ring (car-wheels.js SW 0.16) takes ink");
  assert.equal(M.inkOn(0.85), 0, "a red/yellow/white compound band (max channel >= 0.85) never does");
  // the TSL face select is the mirror's: x < 0 reads toward +th (side +1), else -th
  const src = read("js/render/three/tsl-carsurf.js");
  assert.match(src, /const side = select\(xa\.lessThan\(0\.0\), float\(1\.0\), float\(-1\.0\)\);/);
  assert.match(src, /th\.mul\(side\)\.div\(Math\.PI\)\.add\(1\.0\)/);
  assert.equal(M.textCell(0, T.r1 - 0.25 * (T.r1 - T.r0) / T.rows, 1, ncol).row, -1, "the top half-row is margin");
  assert.equal(M.textCell(0, T.r1 - 0.75 * (T.r1 - T.r0) / T.rows, 1, ncol).row, 0, "row 0 (glyph top) outermost");
  // two repeats a turn: th and th + pi land on the same column
  for (const th of [-2.5, -1, 0.3, 1.2]) assert.equal(M.textCell(th, rMid, 1, ncol).col, M.textCell(th + Math.PI, rMid, 1, ncol).col);
  // +x face: reading advances as th falls; -x face: as th rises (a viewer's left to right on either side)
  const d = 0.05, t0 = 1.2;
  assert.ok(M.textCell(t0 - d, rMid, 1, ncol).col > M.textCell(t0, rMid, 1, ncol).col);
  assert.ok(M.textCell(t0 + d, rMid, -1, ncol).col > M.textCell(t0, rMid, -1, ncol).col);
  // a font pixel is about square (radial row height vs arc column width)
  const rowH = (T.r1 - T.r0) / T.rows, colW = Math.PI * rMid / T.cols;
  assert.ok(colW / rowH > 0.8 && colW / rowH < 1.25, `${colW} / ${rowH}`);
  assert.ok(ncol < T.cols, "the line fits its half turn");
  assert.ok(T.far <= 6, "close cameras only");
});
