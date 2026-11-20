/* GRAPHICS: EXTREME shadow extras on TLX (docs/notes/DESKTOP-GRAPHICS-TIERS-2026-11-20.md; GfxQuality features
 * "csm" and "lampShadows"): the far sun cascades and the two extra floodlight maps.
 *  1. the pure maths in tlx-shadow.js csmMath (splits, depth span, texel snapping, bias scale, fade, cadence,
 *     the extra-lamp pick) against hand values and invariants;
 *  2. the planner / driver over the real M4 with recording begin/end;
 *  3. the REAL shadow-pass.js sunPass / lampPass against a stub gfx: with no gfx.shadowX the call sequence is
 *     exactly today's; with one, the cascades are cast inside their own begin/end;
 *  4. the REAL shadowSys (three r187 on the fake WebGL2): off unless ctx.extras AND the feature; sizes in S;
 *  5. the REAL lit shader: no extras = the same WGSL as a shadow system without the seam; extras add 4 maps.
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

// ── the real shadow-pass.js, stub gfx ──
function passRig(withX) {
  const ctx = vm.createContext({ Math, Float32Array, Float64Array, Int32Array, Array, Object, Number, Infinity, NaN });
  ctx.window = ctx;
  seedLog(ctx);
  vm.runInContext(read("js/core/mat4.js").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/core/mat4.js") });
  vm.runInContext(read("js/render/three/tlx-shadow.js"), ctx, { filename: absSrc("js/render/three/tlx-shadow.js") });
  vm.runInContext(`var LightTune = { LT: { shadowRange: 80, carShadow: false, moonShadow: 0, lampShadow: true, shadowStr: 1 } };
    var PerfGov = { tier: () => 0 };`, ctx);
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
    gfx.shadowX = { csmOn: true, lampOn: true, csmPass: (i) => P.pass(i), lampPass: (i) => D.pass(i), reset() { calls.push("xReset"); P.reset(); D.reset(); } };
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

// ── the real shadowSys + lit shader on three r187 / fake WebGL2 ──
installThreeGlobals();
globalThis.Log = globalThis.Log || { info() {}, warn() {}, error() {}, debug() {} };
if (!globalThis.localStorage) globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
vm.runInThisContext(read("js/core/mat4.js").replace(/^const M4\b/m, "globalThis.M4"), { filename: absSrc("js/core/mat4.js") });
for (const f of ["js/render/shared/light-budget.js", "js/lighting/knobs.js", "js/render/three/tsl-chunks.js", "js/render/three/tsl-lit.js", "js/render/three/tlx-shadow.js"])
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
});
