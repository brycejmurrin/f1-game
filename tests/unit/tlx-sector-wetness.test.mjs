// tlx-sector-wetness — #6909 phase 2: the TLX road samples per-sector wetness by its track arc position.
//
// Phase 1 (weather-arc-sector-wetness) wrote frame.wetnessSegs (WeatherArc.WET_SEGS slots along the lap) and
// frame.wetnessLap. js/render/three/tsl-lit.js packs them into U.wetSegs (vec4[6]) / U.wetLap, and the road's wet
// block reads roadWetness(trk): the slot at the fragment's trk.s, interpolated between segment centres. So under a
// local shower a soaked sector ahead looks wet before the view car gets there.
//  1. The lit programs still BUILD (real three r187 GLSL builder over the fake WebGL2) for plain, instanced and
//     chunked; plain/instanced declare the packed 6-row array; chunked (no trk) reads the global value only.
//  2. updateFrame packs the slots and sets wetLap / wetMax; no array = wetLap 0 (the old global look).
//  3. Done-when, VM: the real weather-arc under a local shower → the real TLX uniforms → the shader's sampling
//     (its plain-JS twin, roadWetnessJS) at an arc position AHEAD of the car reads that sector's
//     wetness (wetnessAt), not the car's frame.wetness.
// CPU uniforms and generated program text only; no rendered-pixel claim (rule 5: no local browser).
//
// Run: node --test tests/unit/tlx-sector-wetness.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";
import { seedLog } from "../helpers/seed-log.mjs";
import { makeFakeGL, installThreeGlobals } from "../helpers/fake-webgl2.mjs";
import * as THREE from "../../vendor/three-0.187.0/three.webgpu.min.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
installThreeGlobals();
globalThis.Log = globalThis.Log || { info() {}, warn() {}, error() {}, debug() {} };
for (const f of ["js/render/shared/light-budget.js", "js/lighting/knobs.js", "js/render/shared/post-common.js", "js/render/shared/assets.js", "js/render/three/tsl-chunks.js", "js/render/three/tsl-lit.js"])
  vm.runInThisContext(read(f), { filename: absSrc(f) });
const TSL = THREE.TSL;

const makeLit = () => globalThis.TLXShaders.lit(THREE, TSL, {
  chunks: globalThis.TLXShaders.chunks(THREE, TSL), shadow: null, ssrTag: false, envCube: null, matMaps: null,
  lampGrid: null, sharedUniforms: true, maxLights: 16,
});
const BASE = { sunDir: [0, 1, 0], sunColor: [1, 1, 1] };

// ── the weather side: the real weather-arc + rain-cells in a VM (as weather-arc-sector-wetness) ──
function bootWeather() {
  const ctx = vm.createContext({ Math, Float32Array, Float64Array, Uint8Array, Array, Object, Number, JSON, WeakMap, Error });
  ctx.window = ctx;
  seedLog(ctx);
  ctx.Career = { inCareer: () => false, hash: (_s, _r, _k, n) => n === "dur" ? 0.99 : 0.1 };
  for (const f of ["js/core/mat4.js", "js/physics/consts.js", "js/physics/tyre-model.js", "js/fx/particles.js", "js/race/rain-cells.js", "js/race/weather-arc.js"])
    vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: absSrc(f) });
  ctx.Particles.init({ drawParticles() {} });
  ctx.GameAudio = { startRain() {}, stopRain() {} };
  const G = {
    raceWeather: "dry", soundOn: false, track: { total: 5800 }, announce() {}, applyRaceSettings() {},
    simSeed: () => 1, raceRound: 0, lapsTarget: 3, raceLaps: 3, state: "race", raceT: 0,
    isWetRoad: () => false, isRaining: () => false, initRainDrops() {},
    netPlay: { active: () => false }, player: { s: 1000, x: 0 }, frame: {},
  };
  const wa = ctx.WeatherArc.create(G, { isTimeTrial: () => false, isQuali: () => false });
  G.trackWetness = () => wa.wetness();
  return { ctx, G, wa };
}
function armLocal(G, wa) {
  for (let dur = 120; dur <= 400 && !(wa.arc && wa.arc.cell); dur += 10) {
    wa.endSession(); G.raceWeather = "dry"; wa.changeable = true;
    wa.plan = { to: "rain", dur };
    wa.startChangeable();
  }
  assert.ok(wa.arc && wa.arc.cell, "fixture: a MIXED plan that draws a local shower");
}

// The plain-JS twin of roadWetness() in tsl-lit.js (keep them constant for constant), reading the REAL uniforms.
function roadWetnessJS(U, trk) {
  const [s, x, hw] = trk;
  const hasTrk = hw > 0.5 || Math.abs(x) > 0 || s > 0;
  if (!(U.wetMax.value > 0.001 && U.wetLap.value > 0 && hasTrk)) return U.wetness.value;
  const rows = U.wetSegs.array || U.wetSegs.value, n = rows.length * 4;
  const slot = (i) => rows[i >> 2].getComponent(i & 3);
  const q = s / U.wetLap.value, f = (q - Math.floor(q)) * n - 0.5;
  const fl = Math.floor(f), t = f - fl;
  const i0 = ((fl + n) % n + n) % n, i1 = ((fl + n + 1) % n + n) % n;
  return slot(i0) * (1 - t) + slot(i1) * t;
}

test("one length: tsl-lit's WET_SEGS is WeatherArc.WET_SEGS is RainCells.SEGS (phase-1 nit F2)", () => {
  const { ctx } = bootWeather();
  assert.equal(ctx.WeatherArc.WET_SEGS, ctx.RainCells.SEGS);
  const U = makeLit().uniforms;
  assert.equal((U.wetSegs.array || U.wetSegs.value).length * 4, ctx.WeatherArc.WET_SEGS, "vec4[6] holds exactly WET_SEGS slots: 6 uniform rows, not 24");
});

test("the lit programs build: plain and instanced declare the packed array, chunked reads no trk", async (t) => {
  const fg = makeFakeGL();
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true });
  await renderer.init();
  t.after(() => renderer.dispose());
  renderer.backend.utils.getTextureSampleData = () => ({ primarySamples: 1 });
  const lit = makeLit();
  const fs_ = (opts) => {
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
    const g = new THREE.BufferGeometry();
    for (const [n, k] of [["position", 3], ["normal", 3], ["color", 3], ["mat", 1], ["trk", 3], ["instanceTint", 3]])
      g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(k * 3), k));
    const m = new THREE.Mesh(g, lit.makeMaterial(opts)); m.frustumCulled = false; scene.add(m);
    const b = new THREE.GLSLNodeBuilder(m, renderer);
    b.scene = scene; b.camera = cam; b.build();
    g.dispose();
    return b.fragmentShader;
  };
  for (const [name, o] of [["plain", {}], ["instanced", { instanced: true }]]) {
    const src = fs_(o);
    assert.ok(src.length > 1000, name + ": a fragment program");
    assert.equal((src.match(/\bvec4 \w+\[6\];/g) || []).length, 1, name + ": the 6-row packed array (vec4[6], not float[24])");
    assert.ok(!/\bfloat \w+\[24\];/.test(src), name + ": no 24-row float array");
  }
  const ch = fs_({ chunked: true });
  assert.ok(ch.length > 1000, "chunked: a fragment program");
  assert.ok(!/\bvec4 \w+\[6\];/.test(ch), "chunked (no trk attribute): no per-sector array, the global value only");
});

test("updateFrame packs the slots, sets the lap and the uniform gate; no array keeps the global look", () => {
  const lit = makeLit(), U = lit.uniforms;
  const segs = new Float32Array(24); segs[5] = 0.9; segs[6] = 0.4;
  lit.updateFrame(Object.assign({ wetness: 0.1, wetnessSegs: segs, wetnessLap: 4800 }, BASE));
  const rows = U.wetSegs.array || U.wetSegs.value;
  assert.ok(Math.abs(rows[1].y - 0.9) < 1e-6 && Math.abs(rows[1].z - 0.4) < 1e-6, "slot i = row i>>2, lane i&3");
  assert.equal(U.wetLap.value, 4800);
  assert.ok(Math.abs(U.wetMax.value - 0.9) < 1e-6, "the gate is the wettest slot, not the car's 0.1");
  lit.updateFrame(Object.assign({ wetness: 0.3 }, BASE));
  assert.equal(U.wetLap.value, 0, "no array: every fragment reads U.wetness");
  assert.ok(Math.abs(U.wetMax.value - 0.3) < 1e-6);
  assert.ok(Math.abs(roadWetnessJS(U, [1000, 0, 7]) - 0.3) < 1e-6);
  lit.updateFrame(Object.assign({ wetness: 0, wetnessSegs: new Float32Array(24), wetnessLap: 4800 }, BASE));
  assert.equal(U.wetMax.value, 0, "a dry lap closes the wet block's gate");
});

test("Done-when (VM): under a local shower, the road ahead reads ITS sector's wetness, not the car's", () => {
  const { G, wa } = bootWeather();
  armLocal(G, wa);
  const lit = makeLit(), U = lit.uniforms, len = G.track.total, n = wa.sectorWetness().length;
  let found = null;
  for (let t = 5; t < wa.arc.cell.life && !found; t += 5) {
    G.raceT = t; wa.tick(0); wa.syncWetness(0, true);
    const segs = G.frame.wetnessSegs;
    // Park the view car on the DRIEST segment (phase-1 nit F3), then look for a soaked one ahead of it.
    let dry = 0; for (let i = 1; i < n; i++) if (segs[i] < segs[dry]) dry = i;
    G.player.s = (dry + 0.5) / n * len;
    wa.syncWetness(0, true);
    const view = G.frame.wetness;
    for (let k = 1; k < n && !found; k++) {
      const i = (dry + k) % n;
      if (segs[i] > view + 0.3) found = { i, view, dry };
    }
  }
  assert.ok(found, "the shower soaks a segment ahead while the view car sits on a dry one");
  lit.updateFrame(Object.assign({}, G.frame, BASE));
  assert.equal(U.wetLap.value, len);
  const s = (found.i + 0.5) / n * len;                 // that segment's centre, on the road (hw 7)
  const road = roadWetnessJS(U, [s, 0, 7]);
  assert.ok(Math.abs(road - wa.wetnessAt(s)) < 1e-5, `road at s=${s.toFixed(0)}: ${road} vs wetnessAt ${wa.wetnessAt(s)}`);
  assert.ok(road > found.view + 0.3, `the sector ahead (${road.toFixed(2)}) is wetter than the car's road (${found.view.toFixed(2)})`);
  // Off the track-coord meshes (terrain, buildings: trk 0,0,0) the global value stands.
  assert.equal(roadWetnessJS(U, [0, 0, 0]), U.wetness.value);
  // Interpolation wraps at the line: just past s = 0 blends the last and first slots.
  const rows = U.wetSegs.array || U.wetSegs.value, last = rows[n / 4 - 1].w, first = rows[0].x;
  assert.ok(Math.abs(roadWetnessJS(U, [1e-3, 0, 7]) - (last + first) / 2) < 1e-3, "wraps between slot 23 and slot 0");
});

test("syncSegs threads #7011's snap: dt 0 HOLDS (a paused render(0)), snap jumps (phase-1 F1, dt<=0)", () => {
  const { G, wa } = bootWeather();
  wa.syncWetness(0, true);                   // dry, snapped
  G.raceWeather = "rain";
  wa.syncWetness(0);                         // paused frame: hold
  for (const w of G.frame.wetnessSegs) assert.equal(w, 0);
  assert.equal(G.frame.wetness, 0, "frame.wetness holds too (#7011)");
  wa.syncWetness(0.5);                       // 0.8/s → 0.4
  for (const w of G.frame.wetnessSegs) assert.ok(Math.abs(w - 0.4) < 1e-6, `got ${w}`);
  wa.syncWetness(0, true);                   // race start / headless settle: jump
  for (const w of G.frame.wetnessSegs) assert.ok(Math.abs(w - 1) < 1e-6);
  assert.equal(G.frame.wetnessLap, 5800);
});
