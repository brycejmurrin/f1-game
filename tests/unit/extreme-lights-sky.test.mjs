/* extreme-lights-sky.test.mjs — the EXTREME `lightsHi` and `skyAtmo` extras (TLX only;
 * docs/notes/DESKTOP-GRAPHICS-TIERS-2026-11-20.md).
 *
 *   lightsHi  LightBudget keeps 48 / 24 / 8 / 5 at detail 0 and on every non-TLX-WebGPU caller; on
 *             EXTREME TLX-WebGPU compiles 128 slots and bakes 48 lamps a grid cell, ranked by the lit
 *             shader's own attenuation; a governor shed slides back to today's 48 / 24 in about half
 *             a second with no recompile (the shader's cap is a uniform).
 *   skyAtmo   the CPU twin of the TSL single-scattering atmosphere (phase functions, optical depth,
 *             noon / sunset colour), and the real sky factory built through three's WGSL and GLSL
 *             node builders over the fake GL: on adds the apexSkyAtmo function, off is the old graph.
 *
 * No GPU: none of this is evidence the picture looks right. That is gfx-probe + gpu-census.yml.
 * Run: node --test tests/unit/extreme-lights-sky.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeFakeGL, installThreeGlobals } from "../helpers/fake-webgl2.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// One context holding the REAL quality preset (its FEATURES / SHED_ORDER) and the light island.
function lightsCtx(preset, { mobile = false, perfGov = null } = {}) {
  const clock = { t: 1000 };
  const store = { get: (k, d) => (k === "gfxPreset" ? preset : d), raw: () => null, set() {}, rawSet() {} };
  const ctx = vm.createContext({
    GameStore: { store }, GLX: { isMobile: mobile }, Log: { info() {}, warn() {} },
    LightKnobs: { LT: { lampCull: 40 } }, performance: { now: () => clock.t },
    ...(perfGov ? { PerfGov: perfGov } : {}),
  });
  for (const f of ["js/render/shared/light-budget.js", "js/render/shared/frustum.js", "js/render/shared/lamp-chunks.js",
    "js/perf/quality-preset.js", "js/render/shared/gfx-hi.js", "js/lighting/frame-lights.js"])
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const g = (n) => vm.runInContext(n, ctx);
  return { LB: g("LightBudget"), LC: g("LampChunks"), Q: g("GfxQuality"), FL: g("FrameLights"), HI: g("GfxHi"), clock };
}

test("lightsHi: detail 0 (HIGH, ULTRA, a phone) keeps 48 / 24 / 8 / 5 and never compiles past 48", () => {
  for (const [preset, mobile] of [["high", false], ["ultra", false], ["extreme", true], ["low", false]]) {
    const { LB, LC, HI } = lightsCtx(preset, { mobile });
    assert.deepEqual([LB.MAX, LB.CHUNK, LB.MIRROR, LB.TAIL_RESERVE, LB.MOBILE, LB.LITE], [48, 24, 8, 5, 24, 16]);
    assert.equal(LB.tlxSlots(true), 48, `${preset}: TLX WebGPU stays 48`);
    assert.equal(LB.setSlots(128), 48, `${preset}: a 128 request clamps to 48`);
    assert.equal(HI.frameMax(), 48);
    assert.equal(LB.bakeChunk(), 24);
    assert.equal(HI.chunkFor(1), 0, "no HI loop: no chunk-cap override");
    assert.equal(LC.capFor(1, LB.bakeChunk()), 24);
  }
});

test("lightsHi: EXTREME on TLX WebGPU compiles 128 / 48; WebGL2, GLX and WGX keep 48", () => {
  const { LB, LC, HI } = lightsCtx("extreme");
  assert.equal(HI.hiOn(), true);
  assert.equal(LB.tlxSlots(false), 48, "three's WebGL2 path keeps the uniform floor");
  assert.equal(LB.setSlots(48), 48, "GLX / WGX publish 48 and stay there on EXTREME");
  assert.equal(HI.frameMax(), 48);
  assert.equal(LB.bakeChunk(), 24);
  assert.equal(LB.setSlots(LB.tlxSlots(true)), 128);
  assert.equal(HI.frameMax(), 128);
  assert.equal(LB.bakeChunk(), 48);
  assert.equal(LC.capFor(1, 48), 48);
  assert.equal(LC.capFor(0.5, 48), 24);
  assert.equal(LC.capFor(0.05, 48), 8, "the floor of 8 still holds");
  assert.deepEqual([HI.chunkFor(1), HI.chunkFor(0.5), HI.chunkFor(0), HI.chunkFor(-1)], [48, 36, 24, 24]);
});

test("lightsHi: a governor shed (GfxQuality.setShed) drops frameMax to 48 within the poll, bake stays 48", () => {
  const { LB, Q, HI, clock } = lightsCtx("extreme");
  LB.setSlots(LB.tlxSlots(true));
  assert.equal(HI.frameMax(), 128);
  Q.setShed(7);   // lightsHi is SHED_ORDER[0]: the last extra the governor drops
  assert.equal(HI.frameMax(), 128, "cached inside the 250 ms poll");
  clock.t += 300;
  assert.equal(HI.frameMax(), 48, "today's budget after the poll");
  assert.equal(LB.bakeChunk(), 48, "boot-time: a shed never re-bakes");
  Q.setShed(0); clock.t += 300;
  assert.equal(HI.frameMax(), 128);
});

// A stride-15 lamp record: [x,y,z, r,g,b, rad, dir.., cone..].
function lampSet(recs) {
  const L = new Float32Array(recs.length * 15);
  recs.forEach(([x, y, z, rad], i) => { const o = i * 15; L[o] = x; L[o + 1] = y; L[o + 2] = z; L[o + 3] = L[o + 4] = L[o + 5] = 1; L[o + 6] = rad; });
  return L;
}

test("lightsHi bake: ranked by the shader's attenuation, capped at 48; the 24 bake is still nearest-first", () => {
  const { LC } = lightsCtx("extreme");
  const box = [{ min: [0, -1, -1], max: [10, 1, 1] }];
  // A 12 m kerb lamp 11 m off (at the end of its reach) against a 120 m floodlight 30 m off.
  const L = lampSet([[21, 0, 0, 12], [40, 0, 0, 120]]);
  assert.deepEqual(Array.from(LC.buildTable(L, box, 1).lists[0]), [0, 1], "today: nearest first");
  assert.deepEqual(Array.from(LC.buildTable(L, box, 1, 48).lists[0]), [1, 0], "HI: the brighter floodlight first");
  // 80 lamps reach the box: today keeps 24, HI 48, and the cache re-bakes when capMax changes.
  const many = lampSet(Array.from({ length: 80 }, (_, i) => [11 + i, 0, 0, 200]));
  assert.equal(LC.resolve(many, box, 1).lists[0].length, 24);
  const hi = LC.resolve(many, box, 1, 48);
  assert.equal(hi.lists[0].length, 48);
  assert.equal(LC.resolve(many, box, 0.5, 48).lists[0].length, 24, "the knob still scales the HI cap");
  assert.deepEqual(Array.from(LC.resolve(many, box, 0.5, 48).lists[0]), Array.from(hi.lists[0].slice(0, 24)), "a narrower cap is a prefix");
  assert.equal(LC.resolve(many, box, 1).lists[0].length, 24, "back to the 24 bake");
});

function frameRun(FL, n, cars) {
  const src = lampSet(Array.from({ length: n }, (_, i) => [(i % 20) * 10, 5, Math.floor(i / 20) * 10, 60]));
  const track = { _lights: src }, frame = { time: 0, perChunkLights: 0 };
  FL.setFrameLights(frame, track, cars, [0, 2, 0], 1, [0, 0, 1], false);
  return frame;
}

test("lightsHi frame set: 128 solo, 120 with traffic (the 8-slot tail reserve kept), 48 / 40 at detail 0", () => {
  const cars = [{}, {}, {}];
  const hi = lightsCtx("extreme");
  hi.LB.setSlots(hi.LB.tlxSlots(true));
  assert.equal(frameRun(hi.FL, 300, [{}]).lights.length / 15, 128);
  const f = frameRun(hi.FL, 300, cars);
  assert.equal(f.lights.length / 15, 120);
  assert.equal(f.chunkLampCap, 48);
  const lo = lightsCtx("high");
  lo.LB.setSlots(lo.LB.tlxSlots(true));
  assert.equal(frameRun(lo.FL, 300, [{}]).lights.length / 15, 48);
  const g = frameRun(lo.FL, 300, cars);
  assert.equal(g.lights.length / 15, 40);
  assert.equal(g.chunkLampCap, 0, "detail 0: tsl-lit keeps its compiled cap");
});

test("lightsHi shed with the governor up: the set slides 128 -> 48 in well under a second, one way per frame", () => {
  const gov = { tier: 0 };
  const h = lightsCtx("extreme", { perfGov: { tier: () => gov.tier } });
  h.LB.setSlots(h.LB.tlxSlots(true));
  assert.equal(frameRun(h.FL, 300, [{}]).lights.length / 15, 128);
  h.Q.setShed(7);
  let prev = 128, frames = 0, chunk = 48;
  while (prev > 48 && frames < 200) {
    h.clock.t += 16; frames++;
    const f = frameRun(h.FL, 300, [{}]);
    const n = f.lights.length / 15;
    assert.ok(n <= prev, "monotone");
    assert.ok(f.chunkLampCap <= chunk && f.chunkLampCap >= 24, "the cell cap slides with it");
    prev = n; chunk = f.chunkLampCap;
  }
  assert.equal(prev, 48);
  assert.ok(frames * 16 <= 900, `took ${frames * 16} ms`);
  h.clock.t += 16;
  assert.equal(frameRun(h.FL, 300, [{}]).chunkLampCap, 24, "the cell cap lands with the set");
  assert.ok(frames >= 20, "spread over frames, not a single-frame pop");
});

/* ── skyAtmo: the CPU model ─────────────────────────────────────────────── */
const skyCtx = vm.createContext({ window: {} });
vm.runInContext(read("js/render/three/tsl-sky.js"), skyCtx, { filename: absSrc("js/render/three/tsl-sky.js") });
const SA = skyCtx.window.TLXShaders.skyAtmo;
const sunAt = (deg) => { const r = deg * Math.PI / 180; return [Math.cos(r), Math.sin(r), 0]; };
const view = (el, az) => { const e = el * Math.PI / 180, a = az * Math.PI / 180; return [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)]; };

test("skyAtmo phase functions integrate to 1 over the sphere and Mie peaks forward", () => {
  const integ = (fn) => { let s = 0; const n = 4000; for (let i = 0; i < n; i++) { const mu = -1 + (i + 0.5) * 2 / n; s += fn(mu) * 2 * Math.PI * (2 / n); } return s; };
  assert.ok(Math.abs(integ(SA.phaseR) - 1) < 1e-3, "Rayleigh");
  assert.ok(Math.abs(integ((mu) => SA.phaseM(mu)) - 1) < 0.02, "Cornette-Shanks");
  assert.ok(SA.phaseM(1) > 50 * SA.phaseM(-1), "Mie is a forward lobe");
  assert.equal(SA.phaseR(0.3), SA.phaseR(-0.3), "Rayleigh is symmetric");
});

test("skyAtmo optical depth: the horizon path is far longer than the zenith, and grows toward it", () => {
  const z = SA.viewDepth([0, 1, 0]), h = SA.viewDepth(view(1, 0)), m = SA.viewDepth(view(20, 0));
  assert.ok(Math.abs(z[0] - 8) < 0.5, `zenith Rayleigh depth ~ the 8 km scale height (${z[0]})`);
  // 12 quadratic segments over 60 km: the 1.2 km Mie layer comes out ~20 % thin (0.96), the price of
  // the shader's step count; the bound says "the layer is sampled at all" (uniform steps gave 0.54).
  assert.ok(Math.abs(z[1] - 1.2) < 0.3, `zenith Mie depth ~ 1.2 km (${z[1]})`);
  assert.ok(m[0] > z[0] && h[0] > 10 * z[0], "monotone toward the horizon");
  const tNoon = SA.sunTransmit(sunAt(70)), tSet = SA.sunTransmit(sunAt(2));
  assert.ok(tNoon[2] > 0.7 && tNoon[0] > tNoon[2], "noon sun: slightly yellow, mostly through");
  assert.ok(tSet[0] / tSet[2] > 10 * (tNoon[0] / tNoon[2]), "sunset sun: red");
});

test("skyAtmo colour: zenith bluer than horizon at noon, the sunward horizon red at sunset", () => {
  const br = (c) => c[2] / c[0];
  const noonZ = SA.scatter([0, 1, 0], sunAt(70)), noonH = SA.scatter(view(2, 90), sunAt(70));
  assert.ok(br(noonZ) > 2, `noon zenith blue (b/r ${br(noonZ).toFixed(2)})`);
  assert.ok(br(noonZ) > br(noonH), "the horizon is paler than the zenith");
  assert.ok(SA.lum(noonH) > SA.lum(noonZ), "and brighter");
  const setH = SA.scatter(view(2, 0), sunAt(1)), setZ = SA.scatter([0, 1, 0], sunAt(1));
  assert.ok(setH[0] > setH[1] && setH[1] > setH[2], "sunset horizon toward the sun: r > g > b");
  assert.ok(br(setH) < 0.1 * br(noonH), "far redder than the noon horizon");
  assert.ok(br(setZ) > br(setH), "the sunset zenith stays the bluer end");
  for (const c of [noonZ, noonH, setH, setZ, SA.scatter(view(10, 45), sunAt(-4))])
    assert.ok(c.every((v) => Number.isFinite(v) && v >= 0), "finite and non-negative, the sun below the horizon included");
});

test("skyAtmo exposure pins the model zenith to the authored zenith luminance, bounded", () => {
  const authored = [0.18, 0.40, 0.78];
  for (const deg of [70, 30, 5, 1]) {
    const k = SA.exposure(sunAt(deg), authored);
    const z = SA.scatter([0, 1, 0], sunAt(deg)).map((v) => v * k);
    assert.ok(Math.abs(SA.lum(z) - SA.lum(authored)) < 1e-9, `${deg} deg`);
  }
  assert.ok(SA.exposure(sunAt(-60), authored) <= 1e4);
  assert.equal(SA.exposure(sunAt(30), [0, 0, 0]), 0);
});

/* ── skyAtmo: the real factory through three's node builders ─────────────── */
installThreeGlobals();
globalThis.Log = globalThis.Log || { info() {}, warn() {}, error() {}, debug() {} };
const THREE = await import(pathToFileURL(path.join(ROOT, "vendor/three-0.187.0/three.webgpu.min.js")).href);
const TSL = THREE.TSL;
for (const f of ["js/render/three/tsl-chunks.js", "js/render/three/tsl-sky.js"]) vm.runInThisContext(read(f), { filename: absSrc(f) });

async function skyShader(lang, { atmo }) {
  const fg = makeFakeGL();
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  const had = globalThis.GfxQuality;
  try {
    await renderer.init();
    renderer.backend.utils.getTextureSampleData = () => ({ primarySamples: 1 });   // the WGSL builder asks; fake GL lacks it
    if (atmo) globalThis.GfxQuality = { feature: (n) => n === "skyAtmo" };
    const sky = globalThis.TLXShaders.sky(THREE, TSL, { chunks: globalThis.TLXShaders.chunks(THREE, TSL), cache: true });
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.colorNode = sky.node;
    const B = lang === "WGSL" ? THREE.WGSLNodeBuilder : THREE.GLSLNodeBuilder;
    const b = new B(new THREE.Mesh(new THREE.PlaneGeometry(), mat), renderer);
    b.camera = new THREE.PerspectiveCamera(); b.scene = new THREE.Scene(); b.build();
    // A noon update drives derive() + atmoDerive() through the real factory.
    sky.update({ sunDir: [0.3, 0.9, 0.3], sunColor: [1, 0.97, 0.9], zenith: [0.18, 0.4, 0.78], horizon: [0.6, 0.72, 0.86], cloud: 0.4, time: 10 });
    const out = { src: b.fragmentShader, atmo: sky.atmo, k: null };
    sky.dispose();
    return out;
  } finally {
    if (had === undefined) delete globalThis.GfxQuality; else globalThis.GfxQuality = had;
    renderer.dispose();
  }
}

for (const lang of ["WGSL", "GLSL"]) test(`skyAtmo: the sky node builds in ${lang}; on adds apexSkyAtmo, off is the old graph`, async () => {
  const off = await skyShader(lang, { atmo: false }), on = await skyShader(lang, { atmo: true });
  assert.equal(off.atmo, false);
  assert.equal(on.atmo, true);
  assert.doesNotMatch(off.src, /apexSkyAtmo/, "off: no atmosphere function");
  assert.match(on.src, /apexSkyAtmo/, "on: the layouted atmosphere function is emitted");
  assert.ok(on.src.length > off.src.length);
  const forcedOff = await (async () => {
    globalThis.GfxQuality = { feature: () => true };
    try {
      const fg = makeFakeGL(), r = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
      await r.init();
      const sky = globalThis.TLXShaders.sky(THREE, TSL, { chunks: globalThis.TLXShaders.chunks(THREE, TSL), cache: true, atmo: false });
      r.dispose();
      return sky.atmo;
    } finally { delete globalThis.GfxQuality; }
  })();
  assert.equal(forcedOff, false, "ctx.atmo === false wins over the feature");
});
