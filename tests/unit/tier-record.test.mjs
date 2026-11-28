/* tier-record.test.mjs — the node-only half of the real-GPU tier test (docs/notes/TIER-CENSUS-TEST-2026-11-20.md).
 *
 * The census (gpu-census.yml, tools/gfx/census-verdict.mjs tierGate) fails a forced-detail run when a feature the
 * level turns on did not RUN. That gate is only as good as two things no GPU is needed for: GfxQuality's FEATURES /
 * SHED_ORDER tables agreeing with themselves, and GfxDebug.tiers() reporting `on` exactly as feature() decides and a
 * `ran` for every name. Both run here in a vm with the real js/perf/quality-preset.js and js/perf/gfx-debug-overlay.js.
 *
 * Run: node --test tests/unit/tier-record.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";
import { tierGate, TIER_SKIPS } from "../../tools/gfx/census-verdict.mjs";
import { makeFakeGL, installThreeGlobals } from "../helpers/fake-webgl2.mjs";
import { carDrawVm } from "../helpers/car-draw-vm.mjs";
import * as THREE from "../../vendor/three-0.187.0/three.webgpu.min.js";
import { seedTlxUtil } from "../helpers/tlx-util-vm.mjs";

seedTlxUtil();   // TLX files release through TLXUtil at call time (#7334)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

// A page with GfxQuality booted at `detail` (apex26.gfxDetail, the census's ls knob) and GfxDebug loaded beside it.
function page(detail, { mobile = false, sandbox = {} } = {}) {
  const raw = { "apex26.gfxDetail": String(detail) };
  const store = { get: (k, d) => d, raw: (k) => (k in raw ? raw[k] : null), set() {}, rawSet() {} };
  const ctx = vm.createContext({ GameStore: { store }, Log: { info() {}, warn() {} }, ...sandbox });
  vm.runInContext(read("js/perf/quality-preset.js").replace(/^const GfxQuality\b/m, "var GfxQuality"), ctx,
    { filename: absSrc("js/perf/quality-preset.js") });
  ctx.GLX = sandbox.GLX || { isMobile: mobile };
  vm.runInContext(read("js/perf/gfx-debug-overlay.js").replace(/^const GfxDebug\b/m, "var GfxDebug"), ctx,
    { filename: absSrc("js/perf/gfx-debug-overlay.js") });
  return ctx;
}

test("FEATURES / SHED_ORDER agree: levels 1..3, every shed name is a feature at level <= 2, no duplicates", () => {
  const { GfxQuality: Q } = page(0);
  const names = Object.keys(Q.FEATURES);
  assert.ok(names.length >= 20, "the feature table is populated");
  for (const n of names) assert.ok([1, 2, 3].includes(Q.FEATURES[n]), `${n}: level ${Q.FEATURES[n]} is 1, 2 or 3 (CINEMA)`);
  assert.equal(new Set(Q.SHED_ORDER).size, Q.SHED_ORDER.length, "SHED_ORDER has no duplicates");
  for (const n of Q.SHED_ORDER) {
    assert.ok(n in Q.FEATURES, `${n} in SHED_ORDER is a feature`);
    assert.ok(Q.FEATURES[n] <= 2, `${n}: the governor sheds only extras a non-CINEMA level turns on`);
  }
  // The verdict's declared skips name real features.
  for (const n of Object.keys(TIER_SKIPS)) assert.ok(n in Q.FEATURES, n);
});

test("tiers(): for each detail level the record's enabled set is exactly the features at or below it, every name present", () => {
  for (const d of [0, 1, 2]) {
    const ctx = page(d);
    const rec = vm.runInContext("GfxDebug.tiers()", ctx);
    const Q = ctx.GfxQuality;
    assert.equal(rec.detail, d);
    assert.equal(rec.shed, 0);
    assert.equal(rec.cinema, false);
    assert.deepEqual([...rec.shedOrder], [...Q.SHED_ORDER]);
    assert.deepEqual(Object.keys(rec.features).sort(), Object.keys(Q.FEATURES).sort(), "one row per feature");
    const on = Object.keys(rec.features).filter((n) => rec.features[n].on).sort();
    const want = Object.keys(Q.FEATURES).filter((n) => Q.FEATURES[n] <= d).sort();
    assert.deepEqual(on, want, `detail ${d}: enabled set`);
    for (const [n, f] of Object.entries(rec.features)) {
      assert.equal(f.need, Q.FEATURES[n]);
      // No renderer in the vm: nothing may claim it ran, and every null names why.
      assert.notEqual(f.ran, true, `${n}: no renderer, nothing ran`);
      if (f.ran === null) assert.ok(f.why, `${n}: a null ran names why`);
    }
  }
});

test("tiers(): shed and cinema move the enabled set the way feature() does; a phone is detail 0", () => {
  const ctx = page(2);
  const Q = ctx.GfxQuality;
  Q.setShed(2);
  let rec = vm.runInContext("GfxDebug.tiers()", ctx);
  const shedNames = Q.SHED_ORDER.slice(-2);
  for (const n of shedNames) assert.equal(rec.features[n].on, false, `${n} shed`);
  assert.equal(rec.shed, 2);
  Q.setShed(0); Q.setCinema(true);
  rec = vm.runInContext("GfxDebug.tiers()", ctx);
  assert.equal(rec.cinema, true);
  for (const n of Object.keys(Q.FEATURES).filter((k) => Q.FEATURES[k] === 3)) assert.equal(rec.features[n].on, true, `${n} on in CINEMA`);
  const ph = vm.runInContext("GfxDebug.tiers()", page(2, { mobile: true }));
  assert.equal(ph.detail, 0);
  assert.ok(Object.values(ph.features).every((f) => !f.on), "a phone enables nothing");
});

test("tiersProbe(): a TLX stub reports what each surface says, a throwing read is null with its reason, never false", () => {
  const post = { blocks: { ssao: true, shafts: true, ssr: false }, aa: { traa: true, taa: true, hdrPeak: 1 },
    hi: { ran: { aoHi: 2, rays: 1, gi: false, ssrHi: false, dof: false, mblur: false } } };
  const GLX = {
    isMobile: false, mirrorMax: [2048, 1024], maxRenderScale: () => 1.5,
    shadowX: { state: () => ({ csm: { on: true, builds: [3, 1, 0] }, lampX: { on: false, slots: [] } }) },
    __tlx: { postState: () => post, sky: { atmo: true }, lit: { detail: { matDetail: true, envAll: false }, carSurf: true } },
  };
  const sandbox = { GLX, devicePixelRatio: 1, matchMedia: () => ({ matches: false }),
    LightBudget: { hiBuilt: () => true }, Assets: { state: () => { throw new Error("boom"); } },
    LiveryTex: { liveryHiUsed: () => true }, CarDraw: { instance: () => ({ carDetailUsed: { player: 2, hero: true } }) } };
  const rec = vm.runInContext("GfxDebug.tiers()", page(2, { sandbox }));
  const ran = (n) => rec.features[n].ran;
  assert.deepEqual(["gtao", "ssaoHi", "raysHi", "traa", "superSample", "mirrorHi", "csm", "lightsHi", "skyAtmo", "matDetail", "carSurf", "liveryHi", "meshHi", "heroCar"].filter((n) => ran(n) !== true), []);
  assert.deepEqual(["ssgi", "envAll", "lampShadows"].filter((n) => ran(n) !== false), [], "reported off reads false");
  assert.equal(ran("ssrHi"), null, "no SSR pass this frame: no signal, not a failure");
  assert.equal(ran("hdrOut"), null);
  assert.equal(rec.features.hdrOut.why, "the display is not HDR");
  assert.equal(ran("packHd"), null);
  assert.equal(rec.features.packHd.why, "read threw: boom");
  assert.equal(rec.features.dof.why, "CINEMA only (replay / photo / garage)");
  assert.equal(rec.features.crowd3d.why, "built with the track; no page-side record");

  // Fed to the verdict, this record fails on exactly the two features that were on and did not run.
  const g = { timeOfDay: "day", gfx: { tiers: rec, backendState: { api: "webgpu", softAdapter: false, liteGpu: false } } };
  const { bad } = tierGate(g, { hardware: true, level: 2 });
  assert.deepEqual(bad.map((b) => b.split(" ")[1]).sort(), ["envAll", "ssgi"], bad.join("\n"));
});

// ── The producers tiersProbe() reads, run for real (no GPU: three r187 on the fake WebGL2 where a factory needs
// a renderer, a stub THREE for the post chain's CPU side) and fed to the real GfxDebug.tiers(). ──
installThreeGlobals();
globalThis.Log = globalThis.Log || { info() {}, warn() {}, error() {}, debug() {} };
if (!globalThis.localStorage) globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
vm.runInThisContext(read("js/core/mat4.js").replace(/^const M4\b/m, "globalThis.M4"), { filename: absSrc("js/core/mat4.js") });
for (const f of ["js/render/shared/light-budget.js", "js/lighting/knobs.js", "js/render/three/tsl-chunks.js", "js/render/three/tsl-carsurf.js",
  "js/render/three/tsl-lit.js", "js/render/three/tlx-shadow.js", "js/render/three/tsl-fx.js", "js/render/three/tsl-sky.js"])
  vm.runInThisContext(read(f), { filename: absSrc(f) });
const TLXS = globalThis.TLXShaders;
// The factories read GfxQuality.feature() once, at build: `on` names the features that read true.
function withFeatures(on, fn) {
  const had = Object.hasOwn(globalThis, "GfxQuality"), prev = globalThis.GfxQuality;
  globalThis.GfxQuality = { feature: (n) => on.includes(n) };
  try { return fn(); } finally { if (had) globalThis.GfxQuality = prev; else delete globalThis.GfxQuality; }
}

// The real LightBudget in its own realm (setSlots is process state); GfxHi stands in for the lazy HI bundle.
function lightBudget(hi) {
  const ctx = vm.createContext(hi ? { GfxHi: { tlxSlots: () => 64, HI_CHUNK: 32 } } : {});
  vm.runInContext(read("js/render/shared/light-budget.js") + "\n;globalThis.LightBudget = LightBudget;", ctx, { filename: absSrc("js/render/shared/light-budget.js") });
  ctx.LightBudget.setSlots(hi ? 64 : 48);
  return ctx.LightBudget;
}

// The real LiveryTex (js/car/liverytex.js) over the same file set livery-tier.test.mjs M28 loads.
function liveryTex(gq) {
  const ctx = { console, Math, Object, Array, Float32Array, Uint16Array, Uint32Array, JSON, Number, String, Boolean, isFinite, isNaN, Map, Set, WeakMap };
  if (gq) ctx.GfxQuality = gq;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ["js/core/log.js", "js/core/mat4.js", "js/data/teams.js", "js/car/parts.js", "js/car/livery-graphics.js", "js/car/crest-draw.js", "js/car/liverytex.js"])
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  return vm.runInContext("LiveryTex", ctx);
}

// The real TLXShaders.postChain over a stub THREE (renderer-soft-lifecycle.test.mjs's shape): its state() is CPU-side.
// `webgpu` also stubs the tsl-gi plan (one extra built) and TLXAA, so the chain's own HI / AA / hdrPeak logic decides.
function postChain(webgpu) {
  class D { dispose() {} }
  class Texture extends D { constructor() { super(); this.isTexture = true; } }
  class RenderTarget extends D {
    constructor(w, h, o = {}) {
      super(); this.width = w; this.height = h;
      this.textures = Array.from({ length: o.count || 1 }, () => new Texture());
      this.texture = this.textures[0]; this.depthTexture = o.depthTexture || null;
    }
    setSize(w, h) { this.width = w; this.height = h; }
  }
  const T = { DataTexture: Texture, DepthTexture: Texture, RenderTarget, Texture, QuadMesh: class { render() {} },
    NoColorSpace: "none", HalfFloatType: "f16", UnsignedByteType: "u8", RGBAFormat: "rgba", RedFormat: "r", LinearFilter: "linear" };
  const bag = () => new Proxy({}, { get: (t, k) => (typeof k !== "string" ? undefined : (t[k] ||= { value: { set() {}, fromArray() {} } })) });
  const waterUV = uv => uv;
  const TS = { post: () => ({ composite: { mat: {}, U: bag(), tex: {} }, fxaa: { waterUV } }) };
  const sb = { TLXShaders: TS, document: { createElement: () => ({ getContext: () => null }) }, Log: { info() {}, warn() {} }, performance: { now: () => 0 } };
  if (webgpu) {
    TS.gi = { gfxEnv: (e) => e, buildPlan: () => ({ gtao: true }), anyBuilt: (p) => !!(p && p.gtao), livePlan: (p) => p, gfxFeature: () => true };
    sb.TLXAA = { taa: (_T, _TSL, ctx) => {
      assert.equal(ctx.waterUV, waterUV, "the TAA final resolve receives the shared wet-surface transform");
      return { state: () => ({ velocity: false }) };
    } };
  }
  sb.window = sb;
  vm.runInNewContext(read("js/render/shared/post-common.js"), sb, { filename: absSrc("js/render/shared/post-common.js") });
  vm.runInNewContext(read("js/render/three/tlx-post.js"), sb, { filename: absSrc("js/render/three/tlx-post.js") });
  return sb.TLXShaders.postChain(T, {}, { renderer: { backend: { isWebGPUBackend: !!webgpu }, autoClear: true, setRenderTarget() {} },
    chunks: {}, shadow: null, traa: true, hdrPeak: 2 });
}

test("producers: LightBudget.hiBuilt, LiveryTex.liveryHiUsed and CarDraw carDetailUsed report what was built", () => {
  assert.equal(lightBudget(false).hiBuilt(), false, "48 slots: the HI loop was not compiled");
  assert.equal(lightBudget(true).hiBuilt(), true, "64 slots through GfxHi.tlxSlots: the HI loop was compiled");

  for (const on of [false, true]) {
    const LT = liveryTex({ feature: (n) => on && n === "liveryHi" });
    assert.equal(LT.liveryHiUsed(), null, "nothing built yet: null (the probe's 'no AI livery atlas built yet')");
    assert.equal(LT.liveryHi(), on);
    assert.equal(LT.liveryHiUsed(), on, "after the first read it reports the boot-time decision");
  }
  assert.equal(liveryTex(null).liveryHi(), false, "GfxQuality absent: false, not a throw");

  const v = carDrawVm();
  v.field(() => 1000);
  assert.equal(v.ctx.CarDraw.instance(), v.carDraw, "instance() is the one create() made");
  assert.equal(v.carDraw.carDetailUsed, null, "no car built yet");
  v.ctx.CarGeometry = { detailFor: (player) => (player ? 2 : 1), heroOn: () => true };
  const team = v.teams[1];
  v.carDraw.teamMesh(team, v.G.cars.find((c) => c.team === team));
  assert.deepEqual({ ...v.carDraw.carDetailUsed }, { player: 2, rival: 1, hero: true, key: ":d2h" }, "the detail the first build used");
});

test("producers: tsl-lit carSurf/detail, tsl-sky atmo and tlx-post state() hi.ran / aa have the shape the probe reads", () => {
  const chunks = TLXS.chunks(THREE, THREE.TSL);
  for (const on of [false, true]) {
    const lit = withFeatures(on ? ["carSurf"] : [], () => TLXS.lit(THREE, THREE.TSL, { chunks, maxLights: 16 }));
    assert.equal(lit.carSurf, on, `lit.carSurf follows the carSurf feature (${on})`);
    assert.deepEqual({ ...lit.detail }, { matDetail: false, envAll: false }, "no material maps or env cube: neither detail built");
    const sky = withFeatures(on ? ["skyAtmo"] : [], () => TLXS.sky(THREE, THREE.TSL, { chunks, cache: true }));
    assert.equal(sky.atmo, on, `sky.atmo follows the skyAtmo feature (${on})`);
    sky.dispose();
  }

  const gl = postChain(false).state();
  assert.equal(gl.hi, null, "WebGL2 / no tier plan: no hi record");
  assert.deepEqual([gl.aa.traa, gl.aa.taa, gl.aa.hdrPeak], [false, false, 1], "no TRAA off WebGPU; SDR peak");
  const wg = postChain(true).state();
  assert.deepEqual({ ...wg.hi.ran }, { aoHi: 0, rays: 0, gi: false, ssrHi: false, dof: false, mblur: false }, "hi.ran before any present");
  assert.deepEqual({ ...wg.hi.built }, { gtao: true });
  assert.deepEqual([wg.aa.traa, wg.aa.taa, wg.aa.hdrPeak], [true, false, 2], "TRAA built, not yet run; the HDR peak passed through");
  assert.deepEqual(Object.keys(wg.blocks).sort(), ["bloom", "fxaa", "sgsr", "shafts", "ssao", "ssr"]);
});

test("producers: the real shadowX, post chain, lit, sky, LightBudget, LiveryTex and CarDraw drive tiers() end to end", async (t) => {
  const fg = makeFakeGL();
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  t.after(() => renderer.dispose());
  const sys = withFeatures(["csm", "lampShadows"], () => TLXS.shadowSys(THREE, THREE.TSL,
    { renderer, isMobile: false, softwareGL: false, isWarming: () => false, extras: true }));
  const st0 = sys.x.state();
  assert.deepEqual([st0.csm.on, [...st0.csm.builds], st0.lampX.on, st0.lampX.slots.length], [true, [0, 0], true, 2]);
  assert.deepEqual(st0.lampX.slots.map((s) => s.builds), [0, 0]);

  const chunks = TLXS.chunks(THREE, THREE.TSL);
  const lit = withFeatures(["carSurf"], () => TLXS.lit(THREE, THREE.TSL, { chunks, maxLights: 16 }));
  const sky = withFeatures(["skyAtmo"], () => TLXS.sky(THREE, THREE.TSL, { chunks, cache: true }));
  t.after(() => sky.dispose());
  const chain = postChain(true);
  const LT = liveryTex({ feature: (n) => n === "liveryHi" });
  LT.liveryHi();
  const v = carDrawVm();
  v.field(() => 1000);
  v.ctx.CarGeometry = { detailFor: (player) => (player ? 2 : 1), heroOn: () => true };
  v.carDraw.teamMesh(v.teams[1], v.G.cars.find((c) => c.team === v.teams[1]));

  const GLX = { isMobile: false, mirrorMax: [1024, 512], maxRenderScale: () => 1, shadowX: sys.x,
    __tlx: { postState: () => chain.state(), sky, lit } };
  const sandbox = { GLX, devicePixelRatio: 1, matchMedia: () => ({ matches: false }), LightBudget: lightBudget(true),
    LiveryTex: LT, CarDraw: v.ctx.CarDraw };
  const ctx = page(2, { sandbox });
  const ran = (rec) => Object.fromEntries(["csm", "lampShadows", "lightsHi", "skyAtmo", "carSurf", "matDetail", "envAll",
    "liveryHi", "meshHi", "heroCar", "traa", "ssgi", "gtao", "superSample", "mirrorHi"].map((n) => [n, rec.features[n].ran]));
  const before = ran(vm.runInContext("GfxDebug.tiers()", ctx));
  assert.deepEqual(before, { csm: false, lampShadows: false, lightsHi: true, skyAtmo: true, carSurf: true, matDetail: false, envAll: false,
    liveryHi: true, meshHi: true, heroCar: true, traa: false, ssgi: false, gtao: null, superSample: false, mirrorHi: false });

  // One cascade pass through the real planner: shadowX.state().csm.builds counts it and the probe's csm flips.
  const l = Math.hypot(0.4, 0.8, 0.3);
  const day = { sd: [0.4 / l, 0.8 / l, 0.3 / l], ctr: [0, 0, 0], box: 80, far: 320, propTop: 20, frameNo: 0, sunRebuilt: false, read: true, cast() {} };
  assert.equal(sys.x.csmPass(day), 1);
  assert.deepEqual([...sys.x.state().csm.builds], [1, 0]);
  const after = vm.runInContext("GfxDebug.tiers()", ctx);
  assert.equal(after.features.csm.ran, true, "a built cascade reads ran");
  assert.equal(after.features.lampShadows.ran, false, "no extra lamp map built: false, not null");
  assert.equal(after.features.gtao.why, "no AO pass in the last frame");
});

// Left as source pins: these producers only exist inside a booted TLX renderer or a Playwright page, neither of
// which runs in node (hunt-tlx-create-undo.test.mjs: three.js cannot boot TLX.create in the VM).
test("the producers no node harness can run still exist (tlx.js GLX members, gpu-game-check's tiers read)", () => {
  assert.match(read("js/render/three/tlx.js"), /get shadowX\(\)/);
  assert.match(read("js/render/three/tlx.js"), /maxRenderScale\(\) \{ return _ssCeil\(\); \}/);
  assert.match(read("tools/gfx/gpu-game-check.mjs"), /r\.tiers = typeof GfxDebug !== "undefined" && GfxDebug\.tiers \? GfxDebug\.tiers\(\)/);
});
