/* gfx-hi-absent.test.mjs — every eager seam of the lazy GfxHi bundle (js/render/shared/gfx-hi.js) keeps the ULTRA
 * path when the bundle is absent. Only RendererBoot.start loads it, and only at GfxQuality.detail() >= 2, so a phone,
 * ULTRA and below, and an EXTREME boot whose bundle failed to load all run through these branches. None may throw.
 * Covered here: the governor, ShadowPass (gfx.shadowX present, no casters fed), LightBudget, FrameLights and LampChunks.
 * The loaded side (behaviour identity with the bundle) is in extreme-lights-sky, tlx-csm-lampx and assets-pack.
 * Run: node --test tests/unit/gfx-hi-absent.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");
const run = (ctx, f) => vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: absSrc(f) });
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
function store(preset) {
  const raw = new Map();
  return { get: (k, d) => (k === "gfxPreset" ? preset : d), set() {}, raw: (k) => (raw.has(k) ? raw.get(k) : null), rawSet: (k, v) => raw.set(k, String(v)) };
}

// The behavioural tests below drive each seam without the bundle; this one pins only the governor's independence.
test("the governor never reads GfxHi: its upper ladder sheds ULTRA's extras too, so it stays eager", () => {
  assert.doesNotMatch(read("js/perf/governor.js"), /GfxHi/);
});

// The governor on desktop EXTREME / TLX without the bundle: the upper ladder still sheds (it never needed GfxHi).
test("governor: EXTREME on TLX with no GfxHi still sheds the upper ladder, no throw", () => {
  const ctx = vm.createContext({ Log: { info() {}, warn() {}, debug() {} }, GameStore: { store: store("extreme") }, window: { __APEX_BUILD: 1 } });
  const GQ = vm.runInContext(read("js/perf/quality-preset.js") + ";GfxQuality", ctx, { filename: absSrc("js/perf/quality-preset.js") });
  const PerfGov = vm.runInContext(read("js/perf/governor.js") + ";PerfGov", ctx, { filename: absSrc("js/perf/governor.js") });
  assert.equal(vm.runInContext("typeof GfxHi", ctx), "undefined");
  let scale = 1;
  PerfGov.init({ __tlx: {}, isMobile: false, getRenderScale: () => scale, setRenderScale: (s) => { s = Math.max(0.5, Math.min(1, s)); if (Math.abs(s - scale) < 0.02) return false; scale = s; return true; } });
  PerfGov.sentinelArm(true);
  assert.equal(GQ.detail(), 2);
  let maxShed = 0;
  for (let i = 0; i < 4000; i++) { PerfGov.tick(i < 1500 ? 16.7 : 40); maxShed = Math.max(maxShed, PerfGov.extrasShed()); }
  assert.ok(maxShed > 0, "a slow stretch sheds extras");
  assert.equal(PerfGov.gpuMs(), -1, "no GPU timer on this gfx");
});

// ShadowPass with gfx.shadowX on (a forced apex26.gfxx.csm / lampShadows A/B below EXTREME, or a failed bundle):
// the casters live in GfxHi, so nothing feeds the cascades and the call log is today's.
function passRig() {
  const ctx = vm.createContext({ Math, Float32Array, Float64Array, Int32Array, Array, Object, Number, Infinity, NaN });
  ctx.window = ctx;
  seedLog(ctx);
  run(ctx, "js/core/mat4.js");
  vm.runInContext(`var LightTune = { LT: { shadowRange: 80, carShadow: false, moonShadow: 0, lampShadow: true, shadowStr: 1 } };
    var PerfGov = { tier: () => 0 };`, ctx);
  run(ctx, "js/render/shared/shadow-pass.js");
  const calls = [];
  const rec = (name) => () => { calls.push(name); return true; };
  const gfx = {
    shadowBegin: rec("shadowBegin"), shadowEnd: rec("shadowEnd"), castShadow: rec("castShadow"), castShadowChunked: rec("castShadowChunked"),
    lampShadowBegin: rec("lampShadowBegin"), lampShadowEnd: rec("lampShadowEnd"), lampShadowKeep: rec("lampShadowKeep"),
    shadowX: { csmOn: true, lampOn: true, csmPass: rec("csmPass"), lampPass: rec("lampPass"), reset: rec("xReset") },
  };
  const G = { track: { propTop: 20, meshes: { terrainChunked: null, roadChunked: null, terrain: {}, road: {}, props: {} } },
    gfx, camEye: [0, 3, -8], camTgt: [0, 0, 0], player: { team: 0, head: 0, speed: 0 }, state: "race" };
  return { sp: ctx.ShadowPass.create(G, { vStd: (v) => v, teamMesh: () => ({}) }), calls };
}

test("shadow pass: gfx.shadowX on but no GfxHi = today's sun and lamp call sequence, no extra pass, no throw", () => {
  const { sp, calls } = passRig();
  const day = { sunDir: norm([0.4, 0.8, 0.3]), sunColor: [1, 1, 1] };
  for (let f = 0; f < 3; f++) sp.sunPass(day, f, false);
  assert.deepEqual(calls, ["shadowBegin", "castShadow", "castShadow", "castShadowChunked", "shadowEnd"]);
  calls.length = 0;
  const L = new Float32Array(15);
  L.set([0, 10, 0, 5, 5, 5, 40, 0, -1, 0, 0.8, 0.5, 0, 0, 0]);
  sp.lampPass({ sunDir: [0, 1, 0], sunColor: [0.1, 0.1, 0.1], lights: L, tailCount: 0 }, 0, false);
  assert.deepEqual(calls, ["lampShadowBegin", "castShadowChunked", "lampShadowEnd"]);
  calls.length = 0;
  sp.reset();
  assert.deepEqual(calls, [], "no cascade reset without the casters that fill them");
});

function lightsCtx(preset) {
  const ctx = vm.createContext({ GameStore: { store: store(preset) }, GLX: { isMobile: false }, Log: { info() {}, warn() {} },
    LightKnobs: { LT: { lampCull: 40 } }, performance: { now: () => 1000 } });
  for (const f of ["js/render/shared/light-budget.js", "js/render/shared/frustum.js", "js/render/shared/lamp-chunks.js",
    "js/perf/quality-preset.js", "js/lighting/frame-lights.js"]) vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const g = (n) => vm.runInContext(n, ctx);
  return { LB: g("LightBudget"), LC: g("LampChunks"), FL: g("FrameLights"), Q: g("GfxQuality") };
}

test("lightsHi: EXTREME with no GfxHi keeps the ULTRA budget (48 slots, 24-lamp cells, nearest-first bake)", () => {
  const { LB, LC, FL, Q } = lightsCtx("extreme");
  assert.equal(Q.feature("lightsHi"), true, "the feature is on; only the bundle is missing");
  assert.equal(LB.tlxSlots(true), 48);
  assert.equal(LB.setSlots(128), 48);
  assert.equal(LB.hiBuilt(), false);
  assert.equal(LB.bakeChunk(), 24);
  const L = new Float32Array(300 * 15);
  for (let i = 0; i < 300; i++) L.set([(i % 20) * 10, 5, Math.floor(i / 20) * 10, 1, 1, 1, 60], i * 15);
  const frame = { time: 0, perChunkLights: 0 };
  FL.setFrameLights(frame, { _lights: L }, [{}], [0, 2, 0], 1, [0, 0, 1], false);
  assert.equal(frame.lights.length / 15, 48);
  assert.equal(frame.chunkLampCap, 0);
  const box = [{ min: [0, -1, -1], max: [10, 1, 1] }];
  const two = new Float32Array(30);
  two.set([21, 0, 0, 1, 1, 1, 12], 0); two.set([40, 0, 0, 1, 1, 1, 120], 15);
  assert.deepEqual(Array.from(LC.buildTable(two, box, 1, LB.bakeChunk()).lists[0]), [0, 1], "nearest first");
});
