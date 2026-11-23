/* GRAPHICS: EXTREME shadow extras on TLX (docs/notes/DESKTOP-GRAPHICS-TIERS-2026-11-20.md; GfxQuality features
 * "csm" and "lampShadows"): the far sun cascades and the two extra floodlight maps.
 *  1. the pure maths in tlx-shadow.js csmMath (splits, depth span, texel snapping, bias scale, fade, cadence,
 *     the extra-lamp pick) against hand values and invariants;
 *  2. the planner / driver over the real M4 with recording begin/end;
 *  3. the REAL shadow-pass.js sunPass / lampPass against a stub gfx: with no gfx.shadowX the call sequence is
 *     exactly today's; with one, the cascades are cast inside their own begin/end;
 *  4. the REAL shadowSys (three r187 on the fake WebGL2): off unless ctx.extras AND the feature; sizes in S;
 *  5. the REAL lit shader: no extras = the same WGSL as a shadow system without the seam; extras add 4 maps
 *     (the car decals 2: the cascades); the far car layer and the extra lamps' static caches (planner, driver,
 *     the real shadow-pass casts and the real shadowSys counters).
 * No browser, no GPU: how the cascades and extra lamps LOOK is unverified here (a real-GPU census is). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";
import { makeFakeGL, installThreeGlobals } from "../helpers/fake-webgl2.mjs";
import * as THREE from "../../vendor/three-0.187.0/three.webgpu.min.js";

const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

// A sandbox with M4 + tlx-shadow.js (top level only: shadowSys needs THREE) for the pure half.
function mathCtx() {
  const ctx = vm.createContext({ Math, Float32Array, Float64Array, Int32Array, Array, Object, Number, Infinity, NaN });
  ctx.window = ctx;
  seedLog(ctx);
  vm.runInContext(read("js/core/mat4.js").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/core/mat4.js") });
  vm.runInContext(read("js/render/three/tlx-shadow.js"), ctx, { filename: absSrc("js/render/three/tlx-shadow.js") });
  return ctx;
}
const MC = mathCtx();
const CM = MC.TLXShaders.csmMath, CSM = CM.CSM;
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };

test("cascade splits: 80 m box -> 240 / 600 m, capped, always growing >= 1.5x", () => {
  assert.deepEqual(Array.from(CM.csmHalves(80, [0, 0, 0])), [80, 240, 600]);
  assert.deepEqual(Array.from(CM.csmHalves(200, [0, 0, 0])), [200, 400, 1000], "caps at 400 / 1000");
  for (let b = 10; b <= 400; b += 7) {
    const h = CM.csmHalves(b, [0, 0, 0]);
    assert.ok(h[1] >= 1.5 * h[0] && h[2] >= 1.5 * h[1], `box ${b}: ${h}`);
  }
});

test("cascade depth span: sunSpan's rule scaled with the box", () => {
  const s = [0, 0];
  assert.deepEqual(Array.from(CM.csmSpan(20, 80, s)), [150, 320], "the near box's own span (shadow-pass.js 150/320)");
  assert.deepEqual(Array.from(CM.csmSpan(20, 240, s)), [Math.ceil(Math.hypot(20, 240)) + 10, Math.ceil(Math.hypot(20, 240)) + 10 + 510]);
  assert.deepEqual(Array.from(CM.csmSpan(undefined, 600, s)), [1200, 1200 + 170 * 7.5], "unknown propTop = the max, capped");
});

test("texel snapping: a cell is SIZE/8 whole texels, and the anchor moving inside it keeps the key", () => {
  const sd = norm([0.4, 0.7, 0.55]), b = new Float64Array(9);
  CM.lightBasis(sd, b);
  for (const h of [240, 600]) {
    const step = h / 4, texel = 2 * h / CSM.SIZE;
    assert.equal(step / texel, CSM.SIZE / 8, "step is a whole number of texels");
    const a = CM.csmSnap(b, [1003.2, 12, -481.7], step, [0, 0]).slice();
    // project a small offset onto the light plane and stay well inside the cell
    const c2 = [1003.2 + b[0] * step * 0.1, 12 + b[1] * step * 0.1, -481.7 + b[2] * step * 0.1];
    assert.deepEqual(CM.csmSnap(b, c2, step, [0, 0]).slice(), a);
    for (const v of a) assert.ok(Math.abs(v / step - Math.round(v / step)) < 1e-9, "snapped to the step grid");
  }
});

test("the basis is M4.lookAtTo's: the snapped VP maps the light x axis to clip x", () => {
  const sd = norm([0.3, 0.9, -0.2]), b = new Float64Array(9);
  const up = CM.lightBasis(sd, b);
  const view = new Float32Array(16);
  MC.M4.lookAtTo(view, sd, [0, 0, 0], up);
  // view row 0 = the light x axis (column-major: m[0], m[4], m[8])
  assert.ok(Math.abs(view[0] - b[0]) < 1e-6 && Math.abs(view[4] - b[1]) < 1e-6 && Math.abs(view[8] - b[2]) < 1e-6);
  assert.ok(Math.abs(view[1] - b[3]) < 1e-6 && Math.abs(view[5] - b[4]) < 1e-6 && Math.abs(view[9] - b[5]) < 1e-6);
});

test("bias scale: world bias follows the cascade's texel", () => {
  assert.equal(CM.csmBiasK(80, 320, 4096, 80, 320, 4096), 1);
  const k = CM.csmBiasK(80, 320, 4096, 240, 760, 2048);
  // world bias = normalised bias x far: ratio to the near map = (240/80)(4096/2048)
  assert.ok(Math.abs(k * 760 / 320 - 6) < 1e-9);
});

test("fade bands: the near map + two cascades cover continuously, then fade out by ~0.92 x far half", () => {
  const h = CM.csmHalves(80, [0, 0, 0]);
  const near = (d) => CM.csmWeight(d, h[0], 0);   // the near map's own band is 0.62..0.84, FADE[0]
  let prev = 1;
  for (let d = 0; d <= 700; d += 1) {
    const w1 = CM.csmWeight(d, h[1], 0), w2 = CM.csmWeight(d, h[2], 1);
    const cov = near(d) + (1 - near(d)) * (w1 + (1 - w1) * w2);
    assert.ok(cov <= prev + 1e-12, `coverage never rises with distance (d ${d})`);
    if (d <= 0.70 * h[2]) assert.ok(Math.abs(cov - 1) < 1e-12, `fully covered to 0.70 x ${h[2]} (d ${d}: ${cov})`);
    prev = cov;
  }
  assert.equal(prev, 0, "nothing past the far cascade");
  assert.deepEqual(Array.from(CSM.FADE[0]), [0.62, 0.84], "the mid cascade's band equals the near map's (tsl-lit.js sampleShadow)");
});

test("band dither: no noise = the plain bands; any noise keeps coverage monotone and full, shifted by <= DITHER x width", () => {
  const h = CM.csmHalves(80, [0, 0, 0]);
  for (let d = 0; d <= 700; d += 3.7) for (const k of [0, 1]) assert.equal(CM.csmWeight(d, h[k + 1], k), CM.csmWeight(d, h[k + 1], k, 0.5), "n 0.5 = no shift");
  assert.equal(CM.csmJitter(240, 0), 0);
  assert.ok(Math.abs(CM.csmJitter(240, 0, 1) - CSM.DITHER * 0.22 * 240) < 1e-9, "n 1 moves the band by DITHER x its width");
  const slack = CSM.DITHER * 0.22;
  for (const n of [0, 0.13, 0.5, 0.77, 0.999]) {
    let prev = 1;
    for (let d = 0; d <= 700; d += 1) {
      const near = CM.csmWeight(d, h[0], 0, n), w1 = CM.csmWeight(d, h[1], 0, n), w2 = CM.csmWeight(d, h[2], 1, n);
      const cov = near + (1 - near) * (w1 + (1 - w1) * w2);
      assert.ok(cov <= prev + 1e-12, `n ${n}: coverage never rises (d ${d})`);
      if (d <= (0.70 - slack) * h[2]) assert.ok(Math.abs(cov - 1) < 1e-12, `n ${n}: covered at d ${d}`);
      if (d >= (0.92 + slack) * h[2]) assert.equal(cov, 0);
      prev = cov;
    }
  }
});

test("far-car reach: the cascade box's horizontal corner bound (+ pad), never short of any box point", () => {
  const b = new Float64Array(9);
  CM.lightBasis([0, 1, 0], b);   // overhead sun: the box stands upright, its footprint is the ±h square
  const span = CM.csmSpan(20, 240, [0, 0]);
  assert.ok(Math.abs(Math.sqrt(CM.csmReach2(b, 240, span[0], span[1])) - (240 * Math.SQRT2 + CSM.CAR_PAD)) < 1e-6);
  for (const sd of [norm([0.4, 0.8, 0.3]), norm([0.9, 0.2, -0.4]), norm([-0.1, 0.35, 0.93])]) {
    CM.lightBasis(sd, b);
    const r = Math.sqrt(CM.csmReach2(b, 240, span[0], span[1])) - CSM.CAR_PAD;
    for (let s = 0; s < 400; s++) {
      const x = Math.sin(s * 12.9898) * 240, y = Math.sin(s * 78.233) * 240;
      const z = span[0] - 1 - (span[1] - 1) * Math.abs(Math.sin(s * 3.17));   // [back - far, back - 1] along the sun
      const hx = x * b[0] + y * b[3] + z * b[6], hz = x * b[2] + y * b[5] + z * b[8];
      assert.ok(Math.hypot(hx, hz) <= r + 1e-9, `sd ${sd}: box point at ${Math.hypot(hx, hz)} > ${r}`);
    }
  }
});

test("far-car gate: FieldLod.castsShadow(d2 x csmGateK) is the 50 m gate moved to CAR_M (200 m on ULTRA+)", () => {
  const ctx = vm.createContext({ Math, Object, GfxQuality: { detail: () => 1 } });
  vm.runInContext(read("js/car/field-lod.js").replace(/^const FieldLod\b/m, "var FieldLod"), ctx, { filename: absSrc("js/car/field-lod.js") });
  const FL = ctx.FieldLod;
  FL.init({ get: () => 1 });
  const K = CM.csmGateK(FL.T.SHADOW_CAST_M);
  assert.equal(K, (FL.T.SHADOW_CAST_M / CSM.CAR_M) ** 2);
  assert.equal(FL.castsShadow(99 * 99), true, "the near gate: 100 m on ULTRA+");
  assert.equal(FL.castsShadow(101 * 101), false);
  assert.equal(FL.castsShadow(199 * 199 * K), true, "the cascade gate: 2 x CAR_M");
  assert.equal(FL.castsShadow(201 * 201 * K), false);
  assert.ok(2 * CSM.CAR_M > CSM.FADE[0][0] * CM.csmHalves(80, [0, 0, 0])[1], "reaches into cascade 1's own fade band");
  assert.equal(CM.csmGateK(undefined), 1, "unknown gate: never wider than the near one");
  FL.setEnabled(false);
  assert.equal(FL.castsShadow(900 * 900 * K), true, "apex26.fieldLod=0: every rival casts, as in the near map");
});

test("cadence: c1 on even frames, c2 on frames = 1 mod 4, never on a near-map frame unless starved", () => {
  for (let f = 0; f < 64; f++) {
    assert.equal(CM.csmDue(0, 0, f, false), f % 2 === 0);
    assert.equal(CM.csmDue(1, 0, f, false), f % 4 === 1);
    assert.ok(!(CM.csmDue(0, 0, f, false) && CM.csmDue(1, 0, f, false)), "never both on one frame");
    assert.equal(CM.csmDue(0, 0, f, true), false);
  }
  assert.equal(CM.csmDue(1, CSM.STARVE * 4, 2, true), true, "a starved cascade rebuilds even on a near-map frame");
});

function planner(log) {
  return CM.csmPlanner({
    M4: MC.M4, size0: 4096,
    begin(i, vp, half, bk) { log.push(["begin", i, half, +bk.toFixed(4), Array.from(vp)]); return true; },
    end(i) { log.push(["end", i]); return true; },
    invalidate() { log.push(["invalidate"]); },
  });
}
const inp = (o) => Object.assign({ sd: norm([0.4, 0.8, 0.3]), ctr: [0, 0, 0], box: 80, far: 320, propTop: 20, frameNo: 0,
  sunRebuilt: false, read: true, cast() {} }, o);

test("planner: one cascade per frame on its phase; unchanged keys rebuild nothing; casts sit inside begin/end", () => {
  const log = [], P = planner(log);
  const casts = [];
  const I = inp({ cast: (i) => casts.push([i, log.length && log[log.length - 1][0]]) });
  const builtAt = [];
  for (let f = 0; f < 8; f++) { I.frameNo = f; builtAt.push(P.pass(I)); }
  assert.deepEqual(builtAt, [1, 1, 0, 0, 0, 0, 0, 0], "c1 at frame 0, c2 at frame 1, then the cached maps hold");
  assert.deepEqual(casts, [[0, "begin"], [1, "begin"]]);
  // a move inside both cells: nothing; a move past the mid cell: c1 only, on its next even frame
  I.ctr = [3, 0, 2]; I.frameNo = 8;
  assert.equal(P.pass(I), 0);
  I.ctr = [90, 0, 70]; I.frameNo = 11;
  assert.equal(P.pass(I), 0, "frame 11 is neither cascade's phase: both wait");
  I.frameNo = 12;
  assert.equal(P.pass(I), 1);
  const c1Begins = () => log.filter((r) => r[0] === "begin" && r[1] === 0).length;
  assert.equal(c1Begins(), 2, "c1 rebuilt on its even frame");
  I.frameNo = 13; P.pass(I);   // c2's phase: it rebuilds if the move crossed its 150 m cell
  // the near map rebuilt this frame: a due cascade still waits
  I.sd = norm([0.41, 0.8, 0.3]); I.frameNo = 14; I.sunRebuilt = true;
  assert.equal(P.pass(I), 0);
  I.sunRebuilt = false;
  assert.equal(P.pass(I), 1, "and goes on the next allowed frame");
  // nothing reads the sun maps: invalidated, rebuilt on reopen
  I.read = false;
  P.pass(I);
  assert.equal(log[log.length - 1][0], "invalidate");
});

test("planner VP: a cell move shifts a fixed world point by a whole number of texels (stable, no shimmer)", () => {
  const log = [], P = planner(log);
  const I = inp({ frameNo: 0 });
  P.pass(I);
  const vpA = log.find((r) => r[0] === "begin" && r[1] === 0)[4];
  I.ctr = [61, 0, -35]; I.frameNo = 2;
  P.pass(I);
  const vpB = log.filter((r) => r[0] === "begin" && r[1] === 0)[1][4];
  const px = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]];
  for (const p of [[10, 0, 20], [-150, 3, 77], [200, 40, -190]]) {
    const a = px(vpA, p), b = px(vpB, p);
    for (let c = 0; c < 2; c++) {
      const dTex = (b[c] - a[c]) / 2 * CSM.SIZE;   // NDC [-1, 1] spans SIZE texels
      assert.ok(Math.abs(dTex - Math.round(dTex)) < 0.02, `point ${p}: shift ${dTex} texels`);
    }
  }
  assert.equal(log.find((r) => r[0] === "begin" && r[1] === 0)[2], 240);
});

// A planner whose io has the car layer; `copy` = whether the live map can take a copy yet.
function carPlanner(log, opt = {}) {
  const st = { copy: opt.copy !== false, staticOk: true };
  const P = CM.csmPlanner({
    M4: MC.M4, size0: 4096,
    begin(i) { log.push("begin" + i); return true; },
    end(i) { log.push("end" + i); st.copy = true; return true; },
    carsOn: (i) => i < CSM.CARS,
    staticBegin(i) { log.push("static" + i); return true; },
    staticEnd(i) { log.push("staticEnd" + i); return st.staticOk; },
    carsBegin(i, fresh) { log.push("copy" + i + (fresh ? "f" : "")); return st.copy; },
    carsEnd(i) { log.push("carsEnd" + i); return true; },
  });
  return { P, st };
}

test("car layer: cascade 1 only; static key -> cache + copy + cars; a car-key change refreshes on c1's phase", () => {
  const log = [], { P, st } = carPlanner(log, { copy: false });
  let ck = 5;
  const seen = [];
  const I = inp({ carKey: (i, cw, r2) => { seen.push([i, r2]); return ck; }, castCars: (i) => { log.push("cars" + i); return 3; }, cast: (i) => log.push("cast" + i) });
  I.frameNo = 0; P.pass(I);
  // first build: the live map never rendered, so the copy declines -> today's direct pass, cars included
  assert.deepEqual(log, ["static0", "cast0", "staticEnd0", "copy0f", "begin0", "cast0", "cars0", "end0"]);
  assert.ok(seen.every(([i]) => i === 0), "the outer cascade never asks for cars");
  assert.ok(seen[0][1] > 240 * 240, "the reach is the cascade box's, not the near car map's");
  log.length = 0; I.frameNo = 1; P.pass(I);
  assert.deepEqual(log, ["begin1", "cast1", "end1"], "cascade 2: static only, no car layer");
  log.length = 0; I.frameNo = 2; P.pass(I);
  assert.deepEqual(log, [], "same cars, same cells: nothing");
  ck = 6; log.length = 0; I.frameNo = 3; P.pass(I);
  assert.deepEqual(log, [], "a car change waits for c1's even frame");
  I.frameNo = 4; P.pass(I);
  assert.deepEqual(log, ["copy0", "cars0", "carsEnd0"], "car-only: copy the cached static depth, draw the cars");
  assert.deepEqual([P.state.carBuilds[0], P.state.carDeferred[0], P.state.carCasts[0], P.state.cached[0]], [1, 1, 3, 1]);
  // a cell move: the static map goes to the cache, then copy + cars in the same pass
  log.length = 0; I.ctr = [130, 0, 90]; I.frameNo = 6; P.pass(I);
  assert.deepEqual(log, ["static0", "cast0", "staticEnd0", "copy0f", "cars0", "carsEnd0"]);
  // the copy declines on a car-only refresh: the static key is dirtied, so the next due frame rebuilds it
  ck = 7; st.copy = false; log.length = 0; I.frameNo = 8; P.pass(I);
  assert.deepEqual(log, ["copy0"]);
  st.copy = true; log.length = 0; I.frameNo = 10; P.pass(I);
  assert.deepEqual(log, ["static0", "cast0", "staticEnd0", "copy0f", "cars0", "carsEnd0"]);
  // cars leave the cascade (key 0): one empty refresh clears them, then nothing
  ck = 0; log.length = 0; I.frameNo = 12; P.pass(I); I.frameNo = 14; P.pass(I);
  assert.deepEqual(log, ["copy0", "cars0", "carsEnd0"]);
});

test("car layer: no carsOn / no castCars = the static-only planner exactly", () => {
  const a = [], b = [];
  const Pa = planner(a), { P: Pb } = carPlanner(b);
  for (let f = 0; f < 6; f++) {
    Pa.pass(inp({ frameNo: f, ctr: [f * 40, 0, 0] }));
    Pb.pass(inp({ frameNo: f, ctr: [f * 40, 0, 0] }));   // no castCars in the input: the layer stays off
  }
  assert.deepEqual(b, a.filter((r) => r[0] === "begin" || r[0] === "end").map((r) => r[0] + r[1]));
});

// ── the extra floodlights ──
function lights(list) {   // [x, y, z, level, radius] -> frame.lights stride 15 (aim straight down, cone 0.5)
  const L = new Float32Array(list.length * 15);
  list.forEach(([x, y, z, lv, r], i) => { L.set([x, y, z, lv, lv, lv, r, 0, -1, 0, 0.8, 0.5, 0, 0, 0], i * 15); });
  return L;
}
const slots = (n) => Array.from({ length: n }, () => ({ x: NaN, y: NaN, z: NaN }));

test("lampPick: the two best lamps after the primary; tails, washers and the primary never count", () => {
  const L = lights([[0, 10, 0, 5, 40], [10, 10, 0, 5, 40], [20, 10, 0, 5, 40], [30, 10, 0, 5, 40], [5, 10, 0, 5, 8], [1, 10, 0, 5, 40]]);
  const out = new Int32Array(2);
  CM.lampPick(L, 6, 5, null, [0, 0, 0], 0, slots(2), out, 1.2);
  assert.deepEqual(Array.from(out), [1, 2], "record 4 is a washer (r 8), record 5 a tail light, record 0 the primary");
  CM.lampPick(L, 6, 6, null, [0, 0, 0], 0, slots(2), out, 1.2);
  assert.deepEqual(Array.from(out), [5, 1]);
});

test("lampPick: a held lamp keeps its slot until a rival beats it by more than the handover", () => {
  const out = new Int32Array(2);
  const held = [{ x: 30, y: 10, z: 0 }, { x: 10, y: 10, z: 0 }];
  // scores: d² / level. Lamp at 30 m vs a rival at 28 m: within 20%, kept, in its own slot
  let L = lights([[0, 10, 0, 5, 40], [10, 10, 0, 5, 40], [28, 10, 0, 5, 40], [30, 10, 0, 5, 40]]);
  CM.lampPick(L, 4, 4, null, [0, 10, 0], 0, held, out, 1.2);
  assert.deepEqual(Array.from(out), [3, 1]);
  // the rival at 20 m beats it by far more: slot 0 hands over
  L = lights([[0, 10, 0, 5, 40], [10, 10, 0, 5, 40], [20, 10, 0, 5, 40], [30, 10, 0, 5, 40]]);
  CM.lampPick(L, 4, 4, null, [0, 10, 0], 0, held, out, 1.2);
  assert.deepEqual(Array.from(out), [2, 1]);
  // fewer candidates than slots: -1
  CM.lampPick(lights([[0, 10, 0, 5, 40], [10, 10, 0, 5, 40]]), 2, 2, null, [0, 0, 0], 0, slots(2), out, 1.2);
  assert.deepEqual(Array.from(out), [1, -1]);
});

test("lampXDriver: lamp change rebuilds now, unchanged keeps, a car-only change rebuilds on the slot's alternate frame", () => {
  const log = [];
  const D = CM.lampXDriver({ n: 2, M4: MC.M4,
    begin: (k, vp, idx) => { log.push(["begin", k, idx]); return true; },
    end: (k) => { log.push(["end", k]); },
    keep: (k, idx) => { log.push(["keep", k, idx]); return true; } });
  let car = 7;
  const I = { L: lights([[0, 10, 0, 5, 40], [10, 10, 0, 5, 40], [20, 10, 0, 5, 40]]), nRec: 3, tailFrom: 3, lum: null,
    eye: [5, 2, 0], primary: 0, frameNo: 0, carKey: () => car, cast: (reach, r2) => log.push(["cast", reach.slice(), r2]) };
  assert.equal(D.pass(I), 2);
  assert.deepEqual(log.map((r) => r[0]), ["begin", "cast", "end", "begin", "cast", "end"]);
  assert.deepEqual(Array.from(log[1][1]), [10, 10, 0, 48], "reach = the lamp + rad + 8");
  log.length = 0; I.frameNo = 1;
  assert.equal(D.pass(I), 0);
  assert.deepEqual(JSON.parse(JSON.stringify(log)), [["keep", 0, 1], ["keep", 1, 2]]);
  log.length = 0; car = 8; I.frameNo = 1;   // car-only: slot 0 waits on odd frames, slot 1 (frameNo + 1 even) builds
  D.pass(I);
  assert.deepEqual(log.map((r) => r[0] + (typeof r[1] === "number" ? r[1] : "")), ["keep0", "begin1", "cast", "end1"]);
  log.length = 0; I.frameNo = 2;
  D.pass(I);
  assert.deepEqual(log.map((r) => r[0] + (typeof r[1] === "number" ? r[1] : "")), ["begin0", "cast", "end0", "keep1"]);
  // out of the pool + pad: no map, no arm
  log.length = 0; I.eye = [500, 2, 0];
  D.pass(I);
  assert.deepEqual(log, []);
});

test("lampXDriver static cache: props once per lamp into the cache, then copy + cars; a declined copy = the full pass", () => {
  const log = [];
  const cache = { valid: [false, false], vp: [null, null], rendered: [false, false] };
  const D = CM.lampXDriver({ n: 2, M4: MC.M4,
    begin: (k) => { log.push("begin" + k); return true; },
    end: (k) => { log.push("end" + k); cache.rendered[k] = true; },
    keep: (k) => { log.push("keep" + k); return true; },
    staticBegin: (k, vp) => { log.push("static" + k); cache.vp[k] = Array.from(vp); return true; },
    staticEnd: (k) => { log.push("staticEnd" + k); cache.valid[k] = true; return true; },
    // the shadowSys rule: a valid cache drawn under exactly this VP, and a live map that has rendered once
    carsBegin: (k, vp) => { const ok = cache.valid[k] && cache.rendered[k] && cache.vp[k].every((v, i) => v === vp[i]); log.push("copy" + k + (ok ? "" : "-no")); return ok; } });
  let car = 1;
  const I = { L: lights([[0, 10, 0, 5, 40], [10, 10, 0, 5, 40], [20, 10, 0, 5, 40]]), nRec: 3, tailFrom: 3, lum: null,
    eye: [5, 2, 0], primary: 0, frameNo: 0, carKey: () => car,
    cast: () => log.push("full"), castCars: () => log.push("cars"), castProps: () => log.push("props") };
  D.pass(I);
  assert.deepEqual(log.slice(0, 6), ["static0", "props", "staticEnd0", "copy0-no", "begin0", "full"], "first: the live map never rendered -> full");
  log.length = 0; car = 2; I.frameNo = 2;   // car-only on slot 0's frame
  D.pass(I);
  assert.deepEqual(log.slice(0, 3), ["copy0", "cars", "end0"], "car-only: no props redraw");
  assert.equal(log.filter((c) => c === "props").length, 0, "no props redraw");
  assert.deepEqual([D.state.staticBuilds[0], D.state.carOnly[0], D.state.builds[0]], [1, 1, 2]);
  // a lamp change (the slot hands over): a new static render under the new VP, then copy + cars
  log.length = 0; I.L = lights([[0, 10, 0, 5, 40], [10, 10, 0, 5, 40], [20, 10, 0, 5, 40], [11, 10, 1, 9, 40]]); I.nRec = 4; I.tailFrom = 4;
  D.pass(I);
  const i1 = log.indexOf("static1");
  assert.deepEqual(log.slice(i1, i1 + 6), ["static1", "props", "staticEnd1", "copy1", "cars", "end1"], log.join(","));
});

// ── the real shadow-pass.js, stub gfx ──
function passRig(withX) {
  const ctx = vm.createContext({ Math, Float32Array, Float64Array, Int32Array, Array, Object, Number, Infinity, NaN });
  ctx.window = ctx;
  seedLog(ctx);
  vm.runInContext(read("js/core/mat4.js").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/core/mat4.js") });
  vm.runInContext(read("js/render/three/tlx-shadow.js"), ctx, { filename: absSrc("js/render/three/tlx-shadow.js") });
  vm.runInContext(`var LightTune = { LT: { shadowRange: 80, carShadow: false, moonShadow: 0, lampShadow: true, shadowStr: 1 } };
    var PerfGov = { tier: () => 0 };`, ctx);
  // the EXTREME casters (ShadowPass's far cascades / extra lamp maps) live in the lazy GfxHi bundle
  vm.runInContext(read("js/render/shared/gfx-hi.js").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/render/shared/gfx-hi.js") });
  vm.runInContext(read("js/render/shared/shadow-pass.js").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/render/shared/shadow-pass.js") });
  const calls = [];
  const rec = (name) => (...a) => { calls.push(name); return true; };
  const gfx = {
    shadowBegin: rec("shadowBegin"), shadowEnd: rec("shadowEnd"), castShadow: rec("castShadow"), castShadowChunked: rec("castShadowChunked"),
    lampShadowBegin: rec("lampShadowBegin"), lampShadowEnd: rec("lampShadowEnd"), lampShadowKeep: rec("lampShadowKeep"),
  };
  if (withX) {
    const P = ctx.TLXShaders.csmMath.csmPlanner({ M4: ctx.M4, size0: 2048, begin: (i) => { calls.push("csmBegin" + i); return true; }, end: (i) => { calls.push("csmEnd" + i); return true; } });
    const D = ctx.TLXShaders.csmMath.lampXDriver({ n: 2, M4: ctx.M4, begin: (k) => { calls.push("lampXBegin" + k); return true; },
      end: (k) => calls.push("lampXEnd" + k), keep: (k) => { calls.push("lampXKeep" + k); return true; } });
    const bind = ctx.TLXShaders.csmMath.bindField;   // what shadowSys.x does before its planner / driver
    gfx.shadowX = { csmOn: true, lampOn: true, csmPass: (i) => P.pass(bind(i, false)), lampPass: (i) => D.pass(bind(i, true)), reset() { calls.push("xReset"); P.reset(); D.reset(); } };
  }
  const player = { team: 0, head: 0, speed: 0 };
  const G = {
    track: { propTop: 20, meshes: { terrainChunked: null, roadChunked: null, terrain: {}, road: {}, props: {} } },
    gfx, camEye: [0, 3, -8], camTgt: [0, 0, 0], player, state: "race",
  };
  const sp = ctx.ShadowPass.create(G, { vStd: (v) => v, teamMesh: () => ({}) });
  return { sp, calls, G };
}

test("shadow-pass: no gfx.shadowX = today's call sequence; with it the cascades cast inside their own passes", () => {
  const day = { sunDir: norm([0.4, 0.8, 0.3]), sunColor: [1, 1, 1] };
  const a = passRig(false), b = passRig(true);
  for (let f = 0; f < 3; f++) { a.sp.sunPass(day, f, false); b.sp.sunPass(day, f, false); }
  assert.deepEqual(a.calls, ["shadowBegin", "castShadow", "castShadow", "castShadowChunked", "shadowEnd"]);
  // frame 0: near map + (c1 waits: the near map rebuilt) ; frame 1: c2's phase ; frame 2: c1's phase
  assert.deepEqual(b.calls, ["shadowBegin", "castShadow", "castShadow", "castShadowChunked", "shadowEnd",
    "csmBegin1", "castShadow", "castShadow", "castShadowChunked", "csmEnd1",
    "csmBegin0", "castShadow", "castShadow", "castShadowChunked", "csmEnd0"]);
  b.calls.length = 0;
  b.sp.reset();
  assert.deepEqual(b.calls, ["xReset"]);
});

test("shadow-pass: the night lamp pass maps the primary and then the two extras (not the primary again)", () => {
  const L = lights([[0, 10, 0, 5, 40], [15, 10, 0, 5, 40], [30, 10, 0, 5, 40], [400, 10, 0, 5, 40]]);
  const night = { sunDir: [0, 1, 0], sunColor: [0.1, 0.1, 0.1], lights: L, tailCount: 0 };
  const a = passRig(false), b = passRig(true);
  a.sp.lampPass(night, 0, false); b.sp.lampPass(night, 0, false);
  assert.deepEqual(a.calls, ["lampShadowBegin", "castShadowChunked", "lampShadowEnd"]);
  assert.deepEqual(b.calls, ["lampShadowBegin", "castShadowChunked", "lampShadowEnd",
    "lampXBegin0", "castShadowChunked", "lampXEnd0", "lampXBegin1", "castShadowChunked", "lampXEnd1"]);
  b.calls.length = 0;
  b.sp.lampPass(night, 1, false);
  assert.deepEqual(b.calls, ["lampShadowKeep", "lampXKeep0", "lampXKeep1"], "same lamps, same cars: every map kept");
});

test("shadow-pass far cars: cascade 1 casts gated rivals (the shared low-poly body) inside its car pass, keyed on that set", () => {
  const ctx = vm.createContext({ Math, Float32Array, Float64Array, Int32Array, Array, Object, Number, Infinity, NaN, GfxQuality: { detail: () => 1 } });
  ctx.window = ctx;
  seedLog(ctx);
  vm.runInContext(read("js/core/mat4.js").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/core/mat4.js") });
  vm.runInContext(read("js/render/three/tlx-shadow.js"), ctx, { filename: absSrc("js/render/three/tlx-shadow.js") });
  vm.runInContext(read("js/car/field-lod.js").replace(/^const FieldLod\b/m, "var FieldLod"), ctx, { filename: absSrc("js/car/field-lod.js") });
  ctx.FieldLod.init({ get: () => 1 });
  // carShadow on, but no gfx.carShadowBegin: the near car map stays out of the call log
  vm.runInContext(`var LightTune = { LT: { shadowRange: 80, carShadow: true, moonShadow: 0, lampShadow: false, shadowStr: 1 } };
    var PerfGov = { tier: () => 0 };`, ctx);
  // the EXTREME casters (ShadowPass's far cascades / extra lamp maps) live in the lazy GfxHi bundle
  vm.runInContext(read("js/render/shared/gfx-hi.js").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/render/shared/gfx-hi.js") });
  vm.runInContext(read("js/render/shared/shadow-pass.js").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/render/shared/shadow-pass.js") });
  const calls = [], bodies = [];
  const rec = (name) => (...a) => { calls.push(name); return true; };
  const CMx = ctx.TLXShaders.csmMath;
  const rendered = [false, false];
  const P = CMx.csmPlanner({ M4: ctx.M4, size0: 2048,
    begin: (i) => { calls.push("csmBegin" + i); return true; }, end: (i) => { calls.push("csmEnd" + i); rendered[i] = true; return true; },
    carsOn: (i) => i === 0, staticBegin: (i) => { calls.push("static" + i); return true; }, staticEnd: (i) => { calls.push("staticEnd" + i); return true; },
    carsBegin: (i) => { calls.push("copy" + i); return rendered[i]; }, carsEnd: (i) => { calls.push("carsEnd" + i); return true; } });
  const gfx = { shadowBegin: rec("shadowBegin"), shadowEnd: rec("shadowEnd"), castShadowChunked: rec("castShadowChunked"),
    castShadow: (mesh) => { calls.push("castShadow"); bodies.push(mesh.name); return true; },
    shadowX: { csmOn: true, lampOn: false, csmPass: (i) => P.pass(CMx.bindField(i, false)), reset() { P.reset(); } } };
  const player = { team: 0, head: 0, speed: 0 };
  const G = { track: { propTop: 20, meshes: { terrainChunked: null, roadChunked: null, terrain: {}, road: {}, props: {} } },
    gfx, camEye: [0, 3, -8], camTgt: [0, 0, 0], player, state: "race" };
  const farFlags = [];
  const sp = ctx.ShadowPass.create(G, { vStd: (v) => v, teamMesh: () => ({ name: "team" }),
    sharedRivalBody: (far) => { farFlags.push(far); return { name: "shared" }; } });
  const at = (x, z) => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; m[12] = x; m[14] = z; return m; };
  const field = () => {
    sp.beginFrame();
    sp.pushCaster(at(0, 150), 1, { id: "a" }, false);   // 150 m: past the near gate (100 m), inside the cascade one (200 m)
    sp.pushCaster(at(0, 260), 2, { id: "b" }, false);   // 260 m: past both gates
    sp.pushCaster(at(0, 5), 3, player, true);           // the player's stale pooled entry: never cast from the pool
  };
  field();
  const day = { sunDir: norm([0.4, 0.8, 0.3]), sunColor: [1, 1, 1] };
  for (let f = 0; f < 3; f++) sp.sunPass(day, f, false);   // 0: the near map (c1 waits), 1: c2 static-only, 2: c1
  assert.deepEqual(calls.slice(calls.indexOf("csmBegin1")).filter((c) => !c.startsWith("castShadowChunked")).slice(0, 4),
    ["csmBegin1", "castShadow", "castShadow", "csmEnd1"], "cascade 2 carries no cars");
  const c1 = calls.slice(calls.indexOf("static0"));
  assert.deepEqual(c1.filter((c) => !c.startsWith("castShadowChunked")),
    ["static0", "castShadow", "castShadow", "staticEnd0", "copy0", "csmBegin0", "castShadow", "castShadow", "castShadow", "csmEnd0"],
    "first build: cache, declined copy, the direct pass with ONE far rival (terrain + road + the rival)");
  assert.deepEqual(bodies.slice(-1), ["shared"], "the far rival is the shared body");
  assert.deepEqual(farFlags, [false], "150 m is short of the decimated body (250 m x 2)");
  // the rival moves: c1 refreshes on its next even frame as copy + cars
  calls.length = 0; bodies.length = 0;
  sp.beginFrame(); sp.pushCaster(at(3, 150), 1, { id: "a" }, false); sp.pushCaster(at(0, 260), 2, { id: "b" }, false);
  sp.sunPass(day, 3, false);
  assert.equal(calls.filter((c) => c === "copy0").length, 0, "odd frame: the car refresh waits");
  sp.sunPass(day, 4, false);
  const c2 = calls.filter((c) => c !== "castShadowChunked");
  assert.deepEqual(c2.slice(c2.indexOf("copy0")), ["copy0", "castShadow", "carsEnd0"]);
  assert.deepEqual(bodies, ["shared"]);
  // the same field again: kept
  calls.length = 0; sp.sunPass(day, 6, false);
  assert.equal(calls.filter((c) => c === "copy0").length, 0, calls.join());
});

test("fieldCars: a lamp takes the pooled flag + 3-D reach + silhouette; a cascade its own gate + horizontal reach + shared body", () => {
  const at = (x, y, z) => { const m = new Float64Array(16); m[0] = m[5] = m[10] = m[15] = 1; m[12] = x; m[13] = y; m[14] = z; return m; };
  const player = {}, cast = [];
  const f = { n: 3, eye: [0, 0, 0], player, mats: [at(10, 0, 0), at(0, 30, 0), at(1, 0, 0)], cars: [{}, {}, player], ok: [false, true, true],
    pm: () => at(2, 0, 0), castP: () => cast.push("P"), castR: (j, far) => cast.push([j, far]) };
  // lamp at the origin, reach 20 m: rival 0 is near but flagged off, rival 1 is 30 m UP (3-D: out), 2 is the stale player
  assert.equal(CM.fieldCars(f, true, [0, 0, 0], 400, true, true), 1);
  assert.deepEqual(cast, ["P"]);
  f.ok[0] = true; cast.length = 0;
  assert.equal(CM.fieldCars(f, false, [0, 0, 0], 400, true, true), 1);
  assert.deepEqual(cast, [[0, null]], "the silhouette, as the one-lamp map draws it");
  // cascade (no FieldLod in this realm: no gate): horizontal reach takes rival 1 (30 m up), flag ignored
  f.ok[0] = false; cast.length = 0;
  assert.equal(CM.fieldCars(f, false, [0, 0, 0], 400, false, true), 2);
  assert.deepEqual(cast, [[0, false], [1, false]]);
  const k1 = CM.fieldCars(f, true, [0, 0, 0], 400, false, false);
  f.mats[1][12] += 0.1;
  assert.equal(CM.fieldCars(f, true, [0, 0, 0], 400, false, false), k1, "under 0.25 m: the same key");
  f.mats[1][12] += 0.3;
  assert.notEqual(CM.fieldCars(f, true, [0, 0, 0], 400, false, false), k1);
  f.n = 0;
  assert.equal(CM.fieldCars(f, false, [0, 0, 0], 400, false, false), 0, "no casters: key 0");
  // bindField: the planner's hooks read nothing while the car gates are closed
  const inp = CM.bindField({ f: Object.assign({}, f, { n: 3 }), live: true, carsOk: false }, false);
  assert.equal(inp.carKey(0, [0, 0, 0], 400), 0);
  assert.equal(inp.castCars(0, [0, 0, 0], 400), 0);
  assert.equal(CM.bindField({ cast() {} }, true).carKey, undefined, "an input without a field is left alone");
});

// ── the real shadowSys + lit shader on three r187 / fake WebGL2 ──
installThreeGlobals();
globalThis.Log = globalThis.Log || { info() {}, warn() {}, error() {}, debug() {} };
if (!globalThis.localStorage) globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
vm.runInThisContext(read("js/core/mat4.js").replace(/^const M4\b/m, "globalThis.M4"), { filename: absSrc("js/core/mat4.js") });
for (const f of ["js/render/shared/light-budget.js", "js/lighting/knobs.js", "js/render/three/tsl-chunks.js", "js/render/three/tsl-lit.js", "js/render/three/tlx-shadow.js", "js/render/three/tsl-fx.js"])
  vm.runInThisContext(read(f), { filename: absSrc(f) });

async function rig(t) {
  const fg = makeFakeGL();
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  t.after(() => renderer.dispose());
  return renderer;
}
function withFeatures(on, fn) {
  const prev = globalThis.GfxQuality;
  globalThis.GfxQuality = { feature: (n) => on.includes(n) };
  try { return fn(); } finally { if (prev === undefined) delete globalThis.GfxQuality; else globalThis.GfxQuality = prev; }
}

test("shadowSys: extras need ctx.extras AND the feature AND a desktop; sizes and cascade info in S / x.state()", async (t) => {
  const renderer = await rig(t);
  const mk = (ctx) => globalThis.TLXShaders.shadowSys(THREE, THREE.TSL, Object.assign({ renderer, isMobile: false, softwareGL: false, isWarming: () => false }, ctx));
  assert.equal(withFeatures(["csm", "lampShadows"], () => mk({})).x, null, "no ctx.extras (HIGH, the lite lab): no seam");
  assert.equal(mk({ extras: true }).x, null, "features off: no seam");
  assert.equal(withFeatures(["csm", "lampShadows"], () => mk({ extras: true, isMobile: true })).x, null, "phones never");
  const only = withFeatures(["csm"], () => mk({ extras: true }));
  assert.ok(only.x.csmOn && !only.x.lampOn && only.S.lampX.n === 0);
  const sys = withFeatures(["csm", "lampShadows"], () => mk({ extras: true, sunSize: 4096 }));
  const st = sys.x.state();
  assert.deepEqual(st.csm.sizes, [4096, 2048, 2048]);
  assert.equal(st.lampX.size, 512);
  assert.equal(st.lampX.slots.length, 2);
  assert.equal(sys.x.csmTex.length, 2);
  assert.equal(sys.x.lampTex.length, 2);
  // a cascade pass through the real planner renders into its own target and marks it valid
  const day = { sd: norm([0.4, 0.8, 0.3]), ctr: [0, 0, 0], box: 80, far: 320, propTop: 20, frameNo: 0, sunRebuilt: false, read: true, cast() {} };
  assert.equal(sys.x.csmPass(day), 1);
  assert.deepEqual(sys.S.csm.valid, [true, false]);
  assert.equal(sys.S.csm.half[0], 240);
  assert.ok(sys.S.csm.vp[0].some((v, i) => v !== (i % 5 === 0 ? 1 : 0)), "the cascade VP landed in S");
  // an extra lamp slot arms, and present() (clearArmed) disarms it
  const L = lights([[0, 10, 0, 5, 40], [10, 10, 0, 5, 40], [20, 10, 0, 5, 40]]);
  const n = sys.x.lampPass({ L, nRec: 3, tailFrom: 3, lum: null, eye: [5, 2, 0], primary: 0, frameNo: 0, carKey: () => 0, cast() {} });
  assert.equal(n, 2);
  assert.ok(sys.S.lampX.slots.every((s) => s.armed && s.builds === 1));
  assert.deepEqual(sys.S.lampX.slots.map((s) => s.idx), [1, 2]);
  sys.clearArmed();
  assert.ok(sys.S.lampX.slots.every((s) => !s.armed));
  // a throwing cast takes the cascades down, never the near map
  const bad = Object.assign({}, day, { frameNo: 2, ctr: [500, 0, 500], cast() { throw new Error("boom"); } });
  assert.equal(sys.x.csmPass(bad), 0);
  assert.equal(sys.S.csm.on, false);
  assert.equal(sys.S.enabled, true);
});

test("shadowSys caches: the cascade car layer and the extra lamps' static props run, count, and fail alone", async (t) => {
  const renderer = await rig(t);
  const sys = withFeatures(["csm", "lampShadows"], () => globalThis.TLXShaders.shadowSys(THREE, THREE.TSL,
    { renderer, isMobile: false, softwareGL: false, isWarming: () => false, extras: true }));
  let st = sys.x.state();
  assert.equal(st.csm.carsOn, true); assert.equal(st.csm.carLayers, 1); assert.equal(st.lampX.staticOn, true);
  assert.equal(sys.S.csm.dither, 0.15);
  let ck = 1, casts = 0;
  const day = { sd: norm([0.4, 0.8, 0.3]), ctr: [0, 0, 0], box: 80, far: 320, propTop: 20, frameNo: 0, sunRebuilt: false, read: true,
    cast() {}, carKey: () => ck, castCars: () => { casts++; return 2; } };
  for (let f = 0; f < 3; f++) { day.frameNo = f; sys.x.csmPass(day); }
  ck = 2; day.frameNo = 4; assert.equal(sys.x.csmPass(day), 1);
  ck = 3; day.frameNo = 6; day.ctr = [130, 0, 90]; assert.equal(sys.x.csmPass(day), 1);
  st = sys.x.state();
  assert.deepEqual([st.csm.carBuilds[0], st.csm.carCasts[0], st.csm.carPasses[0]], [1, 2, 2], "one car-only refresh + one cache-and-copy build");
  assert.deepEqual(st.csm.staticBuilds, [2]);
  assert.deepEqual(st.csm.valid, [true, true]);
  // a throwing car pass drops the car layer, never the cascades
  ck = 4; day.frameNo = 8; day.castCars = () => { throw new Error("car boom"); };
  sys.x.csmPass(day);
  st = sys.x.state();
  assert.equal(st.csm.carsOn, false); assert.equal(st.csm.on, true); assert.equal(sys.S.enabled, true);
  day.frameNo = 10; assert.equal(sys.x.csmPass(day), 1, "rebuilt static-only on the next due frame");
  assert.equal(sys.x.state().csm.valid[0], true);
  // extra lamps: lamp change = static props + (first: full); car-only = copy + cars
  const L = lights([[0, 10, 0, 5, 40], [10, 10, 0, 5, 40], [20, 10, 0, 5, 40]]);
  let car = 1;
  const LI = { L, nRec: 3, tailFrom: 3, lum: null, eye: [5, 2, 0], primary: 0, frameNo: 0, carKey: () => car,
    cast() {}, castCars() {}, castProps() {} };
  assert.equal(sys.x.lampPass(LI), 2);
  car = 2; LI.frameNo = 2; sys.x.lampPass(LI);
  const s0 = sys.x.state().lampX.slots[0];
  assert.deepEqual([s0.staticBuilds, s0.carOnly, s0.builds], [1, 1, 2]);
});

async function fragFor(renderer, shadow) {
  const lit = globalThis.TLXShaders.lit(THREE, THREE.TSL, { chunks: globalThis.TLXShaders.chunks(THREE, THREE.TSL), maxLights: 16, shadow });
  const g = new THREE.BufferGeometry();
  for (const [n, k] of [["position", 3], ["normal", 3], ["color", 3], ["mat", 1], ["trk", 3]])
    g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(k * 3), k));
  renderer.backend.utils.getTextureSampleData = () => ({ primarySamples: 1 });
  const b = new THREE.WGSLNodeBuilder(new THREE.Mesh(g, lit.makeMaterial({})), renderer);
  b.scene = new THREE.Scene(); b.camera = new THREE.PerspectiveCamera(); b.build();
  return b.fragmentShader;
}

test("lit shader: extras off compiles the seam-less program; on adds exactly the 4 extra depth maps", async (t) => {
  const renderer = await rig(t);
  const base = { renderer, isMobile: false, softwareGL: false, isWarming: () => false };
  const off = globalThis.TLXShaders.shadowSys(THREE, THREE.TSL, Object.assign({ extras: true }, base));
  const noSeam = Object.assign({}, off, { x: undefined });
  const fOff = await fragFor(renderer, off), fNoSeam = await fragFor(renderer, noSeam);
  // Same lines (a second lit factory in one process can order three's uniform-struct members differently; the
  // byte-for-byte check against the pre-extras source was run once by hand, separate processes, WGSL and GLSL).
  const lines = (s) => s.split("\n").map((l) => l.replace(/,\s*$/, "")).sort();
  assert.deepEqual(lines(fOff), lines(fNoSeam), "a null seam changes nothing");
  const on = withFeatures(["csm", "lampShadows"], () => globalThis.TLXShaders.shadowSys(THREE, THREE.TSL, Object.assign({ extras: true }, base)));
  const fOn = await fragFor(renderer, on);
  const depth = (s) => (s.match(/texture_depth_2d/g) || []).length;
  assert.equal(depth(fOn) - depth(fOff), 4, "2 cascades + 2 lamp maps");
  // the car decals take the cascades too (tsl-lit.js decalShadow -> csmFar): +2 depth maps, none with extras off
  const decalFrag = (shadow) => {
    const lit = globalThis.TLXShaders.lit(THREE, THREE.TSL, { chunks: globalThis.TLXShaders.chunks(THREE, THREE.TSL), maxLights: 16, shadow });
    const fx = globalThis.TLXShaders.fx(THREE, THREE.TSL, { lit });
    const g = new THREE.BufferGeometry();
    for (const [n, k] of [["position", 3], ["normal", 3], ["uv", 2]]) g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(k * 3), k));
    const b = new THREE.WGSLNodeBuilder(new THREE.Mesh(g, fx.decalMaterialFor(new THREE.DataTexture(new Uint8Array(4), 1, 1), 0)), renderer);
    b.scene = new THREE.Scene(); b.camera = new THREE.PerspectiveCamera(); b.build();
    return b.fragmentShader;
  };
  assert.deepEqual(lines(decalFrag(off)), lines(decalFrag(noSeam)), "a null seam changes no decal line");
  assert.equal(depth(decalFrag(on)) - depth(decalFrag(off)), 2, "decals: the 2 cascades");
});
