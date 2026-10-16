// puddles — the standing-water mask is ONE piece of math in three shading
// languages. js/render/shared/puddles.js is the reference (constants K and
// mask()); GLX glsl-lit.js, TLX tsl-lit.js and WGX wgsl-chunks.js hand-port it.
// This file pins (1) the reference's behaviour and sample values, and (2) every
// constant of it in each backend's wet block, plus the PUDDLES knob plumbing.
// A constant that drifts on one backend is a different wet race there and
// nothing else notices (docs/ARCHITECTURE.md §Cross-backend parity).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function loadPuddles() {
  const ctx = {};
  vm.runInNewContext(read("js/core/mat4.js") + "\n" + read("js/render/shared/puddles.js") + "\nthis.Puddles = Puddles;", ctx);
  return ctx.Puddles;
}
const P = loadPuddles();
const K = P.K;

// GLSL/WGSL spell a float with a decimal point; "1.0" not "1".
const fl = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));

test("reference: no puddles below road wetness 0.6, and none with the knob at 0", () => {
  for (let i = 0; i < 400; i++) {
    const x = i * 3.7 - 600, z = i * -2.3 + 140;
    for (const lat of [null, 0, 0.6, -1, 1])
      assert.equal(P.mask(x, z, { wetness: 0.6, lat, downhill: 0.2 }), 0, `wetness 0.6 at ${x},${z}`);
    assert.equal(P.mask(x, z, { wetness: 1, amount: 0, lat: 1 }), 0);
  }
});

test("reference: puddles grow with wetness and shrink back to their deepest spots when drying", () => {
  const pts = [];
  for (let i = 0; i < 3000; i++) pts.push([(i % 60) * 1.9 - 50, Math.floor(i / 60) * 2.1 - 40]);
  const cover = (w) => pts.filter(([x, z]) => P.mask(x, z, { wetness: w, lat: 0.9 }) > 0.05).length / pts.length;
  const c = [0.65, 0.75, 0.85, 1.0].map(cover);
  for (let i = 1; i < c.length; i++) assert.ok(c[i] > c[i - 1], `coverage grows with wetness: ${c.join(", ")}`);
  assert.ok(c[3] > 0.15 && c[3] < 0.75, `a soaked gutter is pooled, not a lake: ${c[3]}`);
  // monotone per point: drying never adds water anywhere
  for (const [x, z] of pts.slice(0, 500)) {
    let prev = 1;
    for (const w of [1, 0.9, 0.8, 0.7, 0.62]) {
      const m = P.mask(x, z, { wetness: w, lat: 0.9 });
      assert.ok(m <= prev + 1e-12, `drying grew a puddle at ${x},${z}`); prev = m;
    }
  }
  // the spots still wet at 0.7 are the deepest: they were full at 1.0
  const late = pts.filter(([x, z]) => P.mask(x, z, { wetness: 0.7, lat: 0.9 }) > 0.01);
  assert.ok(late.length > 0, "something is still wet at 0.7");
  for (const [x, z] of late) assert.ok(P.mask(x, z, { wetness: 1, lat: 0.9 }) > 0.9, "a late puddle is a deep spot");
});

test("reference: the crown drains, the gutter and the low side of a camber hold water", () => {
  const pts = [];
  for (let i = 0; i < 4000; i++) pts.push([(i % 80) * 1.3, Math.floor(i / 80) * 1.7]);
  const sum = (o) => pts.reduce((a, [x, z]) => a + P.mask(x, z, Object.assign({ wetness: 1 }, o)), 0);
  const crown = sum({ lat: 0 }), edge = sum({ lat: 0.95 });
  assert.ok(edge > crown * 4, `edge ${edge.toFixed(1)} vs crown ${crown.toFixed(1)}`);
  // downhill > 0: the +x side lies lower
  assert.ok(sum({ lat: 0.9, downhill: 0.1 }) > sum({ lat: -0.9, downhill: 0.1 }), "the low side pools");
  assert.equal(P.pool(null, 0.3), 1, "off the ribbon the field is unweighted");
});

test("reference: pinned sample values (a change here is a look change on all three backends)", () => {
  // Recorded from the reference on 2026-10-14. Regenerate only for an intended
  // look change, and port that change to all three shaders with it.
  // [x, z, lat (null = off the ribbon), wetness, mask]
  const PINS = [
    [-122.49, 36.07, 0.95, 1, 0.9347306],
    [-44.98, -7.86, null, 0.9, 0.07105629],
    [-41.61, -9.77, -0.9, 0.8, 0.25133344],
    [-14.65, -25.05, 0.7, 1, 0.15258625],
    [-11.28, -26.96, 1, 0.9, 0.65792155],
    [15.68, -42.24, 0.95, 0.8, 0.47567537],
    [0, 0, 0, 1, 0],
  ];
  for (const [x, z, lat, w, want] of PINS) {
    const got = P.mask(x, z, { wetness: w, lat });
    assert.ok(Math.abs(got - want) < 1e-6, `mask(${x}, ${z}, lat ${lat}, w ${w}) = ${got}, pinned ${want}`);
  }
  assert.equal(P.hash21(1, 0), 0.2799530029296875, "the f32-emulated surface hash");
  for (let i = 0; i < 200; i++) { const v = P.field(i * 5.3, i * -7.1); assert.ok(v >= 0 && v <= 1, `field in range: ${v}`); }
});

// The puddle segment of each backend's wet block.
const seg = (file, start, end) => {
  const src = read(file); const i = src.indexOf(start);
  assert.ok(i >= 0, `${file}: ${start}`); const j = src.indexOf(end, i);
  assert.ok(j > i, `${file}: ${end} after ${start}`); return src.slice(i, j);
};
const GLX = seg("js/render/glx/shaders/glsl-lit.js", "STANDING-WATER PUDDLES (2026-10-14)", "RAIN RIPPLES");
const TLX = seg("js/render/three/tsl-lit.js", "STANDING-WATER PUDDLES (2026-10-14)", "RAIN RIPPLES");
const WGX = seg("js/render/webgpu/wgsl-chunks.js", "STANDING-WATER PUDDLES (2026-10-14)", "RAIN RIPPLES");

test("parity: the mask's field, road weight and growth carry the reference constants on GLX, TLX and WGX", () => {
  const f = fl;
  assert.ok(GLX.includes(`vnoise(vWorldPos.xz * ${K.F1} + ${K.O1}) * ${K.W1.toFixed(2)} + vnoise(vWorldPos.xz * ${K.F2} + ${K.O2}) * ${K.W2.toFixed(2)}`), "GLX field");
  assert.ok(WGX.includes(`svnoise(in.wpos.xz * ${K.F1} + vec2<f32>(${K.O1})) * ${K.W1.toFixed(2)} + svnoise(in.wpos.xz * ${K.F2} + vec2<f32>(${K.O2})) * ${K.W2.toFixed(2)}`), "WGX field");
  assert.ok(TLX.includes(`vnoise(wp.xz.mul(${K.F1}).add(${K.O1})).mul(${K.W1.toFixed(2)}).add(vnoise(wp.xz.mul(${K.F2}).add(${K.O2})).mul(${K.W2.toFixed(2)}))`), "TLX field");
  const weight = `mix(${K.POOL_C}, ${K.POOL_E}, smoothstep(${K.EDGE_LO}, ${K.EDGE_HI}, abs(lat))) * clamp(1.0 + downhill * lat * ${f(K.CAMBER)}, ${K.CAMBER_LO}, ${K.CAMBER_HI})`;
  assert.ok(GLX.includes(weight), "GLX road weight"); assert.ok(WGX.includes(weight), "WGX road weight");
  assert.ok(TLX.includes(`mix(float(${K.POOL_C}), float(${K.POOL_E}), smoothstep(${K.EDGE_LO}, ${K.EDGE_HI}, abs(lat))).mul(clamp(float(1.0).add(downhill.mul(lat).mul(${f(K.CAMBER)})), ${K.CAMBER_LO}, ${K.CAMBER_HI}))`), "TLX road weight");
  assert.ok(GLX.includes(`clamp(smoothstep(${K.WET_ON}, ${f(K.WET_FULL)}, uWetness) * uPuddles, 0.0, 1.0)`), "GLX growth");
  assert.ok(WGX.includes(`clamp(smoothstep(${K.WET_ON}, ${f(K.WET_FULL)}, wetness) * F.params10.y, 0.0, 1.0)`), "WGX growth");
  assert.ok(TLX.includes(`clamp(smoothstep(${K.WET_ON}, ${f(K.WET_FULL)}, U.wetness).mul(U.puddles), 0.0, 1.0)`), "TLX growth");
  assert.ok(GLX.includes(`float plo = ${f(K.THR)} - ${K.THR_GROW} * pg;`), "GLX threshold");
  assert.ok(WGX.includes(`let plo = ${f(K.THR)} - ${K.THR_GROW} * pg;`), "WGX threshold");
  assert.equal(K.THR, 1, "TLX writes the threshold as pg.mul(THR_GROW).oneMinus(), which assumes THR = 1");
  assert.ok(TLX.includes(`pg.mul(${K.THR_GROW}).oneMinus()`), "TLX threshold");
  assert.ok(GLX.includes(`smoothstep(plo, plo + ${K.SOFT.toFixed(2)}, pn * pool) * pg * upFace`), "GLX mask");
  assert.ok(WGX.includes(`smoothstep(plo, plo + ${K.SOFT.toFixed(2)}, pn * pool) * pg * upFace * (1.0 - porous)`), "WGX mask");
  assert.ok(TLX.includes(`smoothstep(plo, plo.add(${K.SOFT.toFixed(2)}), pn.mul(pool)).mul(pg).mul(upFace).mul(porous.oneMinus())`), "TLX mask");
  // GLX gates porous ground on the next line
  assert.match(read("js/render/glx/shaders/glsl-lit.js"), /puddle \*= 1\.0 - porous;/);
});

test("parity: inside a puddle — near-zero roughness, darker albedo, a stronger mirror — on all three", () => {
  const glx = read("js/render/glx/shaders/glsl-lit.js"), tlx = read("js/render/three/tsl-lit.js"), wgx = read("js/render/webgpu/wgsl-chunks.js");
  const d = K.DARK.toFixed(2), r = K.ROUGH.toFixed(2), e = K.ENV.toFixed(2);
  assert.ok(glx.includes(`albedo *= mix(1.0, ${d}, puddle);`), "GLX dark");
  assert.ok(wgx.includes(`albedo = albedo * mix(1.0, ${d}, puddle);`), "WGX dark");
  assert.ok(tlx.includes(`albedo.mulAssign(mix(float(1.0), float(${d}), puddle));`), "TLX dark");
  assert.ok(glx.includes(`rough = mix(rough, ${r}, puddle);`), "GLX rough");
  assert.ok(wgx.includes(`rough = mix(rough, ${r}, puddle);`), "WGX rough");
  assert.ok(tlx.includes(`rough.assign(mix(rough, ${r}, puddle));`), "TLX rough");
  assert.ok(glx.includes(`envBlend = max(envBlend, max(wetSheen * 0.55, puddle * ${e}));`), "GLX env floor");
  assert.ok(wgx.includes(`envBlend = max(envBlend, max(wetSheen * 0.55, puddle * ${e}));`), "WGX env floor");
  assert.ok(tlx.includes(`envBlend.assign(max(envBlend, max(wetSheen.mul(0.55), puddle.mul(${e}))));`), "TLX env floor");
  const k = K.ENV_KEEP;
  assert.ok(glx.includes(`envColor * (1.0 - wetSheen * 0.45 * (1.0 - puddle * ${k}))`), "GLX sky keep");
  assert.ok(wgx.includes(`envColor * (1.0 - wetSheen * 0.45 * (1.0 - puddle * ${k}))`), "WGX sky keep");
  assert.ok(tlx.includes(`envColor.mul(wetSheen.mul(0.45).mul(puddle.mul(${k}).oneMinus()).oneMinus())`), "TLX sky keep");
  // the old single-octave, wetness-scaled mask is gone everywhere
  for (const [n, s] of [["GLX", glx], ["TLX", tlx], ["WGX", wgx]]) {
    assert.ok(!/0\.48, 0\.88/.test(s), `${n} still carries the pre-2026-10-14 threshold`);
    assert.ok(!/mix\(rough, 0\.06, puddle\)|mix\(rough, 0\.06, puddle\)\)/.test(s), `${n} still uses the old 0.06 puddle roughness`);
  }
  // WGX hoists puddle so the env mirror (outside the wet block) can read it
  assert.match(wgx, /var puddle = 0\.0;/);
  // dry frames pay nothing: the whole mask sits under the wetness gate
  assert.ok(glx.indexOf("if (uWetness > 0.001 && !classifiedCar)") < glx.indexOf("STANDING-WATER PUDDLES (2026-10-14)"));
  assert.ok(wgx.indexOf("if (wetness > 0.001 && !classifiedCar)") < wgx.indexOf("STANDING-WATER PUDDLES (2026-10-14)"));
  assert.ok(tlx.indexOf("If(U.wetness.greaterThan(0.001).and(classifiedCar.not())") < tlx.indexOf("STANDING-WATER PUDDLES (2026-10-14)"));
});

test("parity: the reference hash is the surface hash the three shaders sample", () => {
  const ref = read("js/render/shared/puddles.js");
  for (const c of ["123.34", "456.21", "45.32"]) assert.ok(ref.includes(c), `reference hash carries ${c}`);
  assert.match(read("js/render/glx/shaders/glsl-chunks.js"), /float hash21\(vec2 p\) \{\s*p = fract\(p \* vec2\(123\.34, 456\.21\)\);\s*p \+= dot\(p, p \+ 45\.32\);/);
  assert.match(read("js/render/webgpu/wgsl-chunks.js"), /fn hash21\(p_in: vec2<f32>\) -> f32 \{\s*var p = fract\(p_in \* vec2<f32>\(123\.34, 456\.21\)\);\s*p = p \+ dot\(p, p \+ 45\.32\);/);
  assert.match(read("js/render/three/tsl-chunks.js"), /fract\(p2\.mul\(vec2\(123\.34, 456\.21\)\)\)\.toVar\(\);\s*p\.addAssign\(dot\(p, p\.add\(45\.32\)\)\);/);
});

test("the PUDDLES knob reaches every backend", () => {
  const src = read("js/lighting/knobs.js");
  const m = src.match(/\{ id: "puddles",[^\n]*\}/);
  assert.ok(m, "TUNE_DEFS has a puddles row");
  assert.match(m[0], /def: 1\.0/); assert.match(m[0], /u: "uPuddles"/); assert.match(m[0], /min: 0, max: 2/);
  const glx = read("js/render/glx/glx.js");
  assert.match(glx, /"uWetDark", "uPuddles"/, "GLX looks the uniform up");
  assert.match(glx, /uf1\(litU\.uPuddles,\s*_litUf,\s*"puddles",\s*T && T\.puddles\s*!= null \? T\.puddles\s*: 1\.0\)/, "GLX uploads uPuddles");
  assert.match(read("js/render/glx/shaders/glsl-lit.js"), /uniform float uPuddles;/);
  const tlx = read("js/render/three/tsl-lit.js");
  assert.match(tlx, /puddles:\s+uniform\(1\.0\)/); assert.match(tlx, /uf1\(U\.puddles, k\("puddles", 1\.0\)\)/, "TLX updates U.puddles");
  assert.match(read("js/render/webgpu/wgx.js"), /d\[141\] = \(T && T\.puddles != null\) \? T\.puddles : 1\.0;/, "WGX packs params10.y");
  assert.match(read("js/render/webgpu/wgsl-chunks.js"), /params10\s*:\s*vec4<f32>,.*\n.*y PUDDLES knob/, "FrameU documents params10.y");
});
