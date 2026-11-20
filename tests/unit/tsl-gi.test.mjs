// tsl-gi.js (the TLX desktop-tier post passes, docs/notes/DESKTOP-GRAPHICS-TIERS-2026-11-20.md): the pure maths the
// shaders are built from, the tier plan against the real GfxQuality, the budgets against today's tsl-post constants,
// and the node graphs themselves on three r187 over the fake WebGL2 context (three's node builder generates GLSL for
// every pass; nothing is compiled by a driver and no pixel is checked — this is NOT evidence about a GPU).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeFakeGL, installThreeGlobals } from "../helpers/fake-webgl2.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

function loadGi() {
  const ctx = vm.createContext({ window: {}, Math });
  vm.runInContext(read("js/render/three/tsl-gi.js"), ctx, { filename: absSrc("js/render/three/tsl-gi.js") });
  return ctx.window.TLXShaders.gi;
}
const GI = loadGi();
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// The real GfxQuality for a stored preset (and optional apex26.gfxx.* overrides), as quality-preset.js reads them.
function gfxQuality(preset, raw = {}, mobile = false) {
  const store = { get: (k, d) => (k === "gfxPreset" ? preset : d), raw: (k) => (k in raw ? raw[k] : null), set() {}, rawSet() {} };
  const ctx = vm.createContext({ GameStore: { store }, Log: { info() {}, warn() {} }, GLX: mobile ? { isMobile: true } : undefined });
  vm.runInContext(read("js/perf/quality-preset.js") + "\nthis.GfxQuality = GfxQuality;", ctx);
  return ctx.GfxQuality;
}
function envFor(Q, extra) {
  return Object.assign({ detail: Q.detail(), need: (n) => Q.FEATURES[n] | 0, feature: (n) => Q.feature(n),
    webgpu: true, mobile: false, phys: false, hdr: true }, extra || {});
}

test("index 0 of every budget is today's shipped constant in tsl-post.js", () => {
  const tsl = read("js/render/three/tsl-post.js");
  const B = GI.BUDGET;
  const kernel = tsl.slice(tsl.indexOf("const SSAO_K = ["), tsl.indexOf("];", tsl.indexOf("const SSAO_K = [")));
  assert.equal((kernel.match(/\[-?[\d.]+, -?[\d.]+\]/g) || []).length, B.ssaoTaps[0], "SSAO_K holds today's taps");
  assert.match(tsl, /godray = makeGodray\(16, GR_MAX_LIGHTS, "tlx-post-godray"\)/);
  assert.equal(Number(/const GR_MAX_LIGHTS = (\d+)/.exec(tsl)[1]), B.rayLamps[0]);
  assert.equal(B.raySteps[0], 16);
  assert.match(tsl, /const marchSteps = select\(quality\.greaterThan\(1\.5\), int\(8\), select\(quality\.greaterThan\(0\.5\), int\(16\), int\(24\)\)\)/);
  assert.equal(B.ssrMarch[0], 24);
  assert.match(tsl, /int\(1\), select\(quality\.greaterThan\(0\.5\), int\(2\), int\(4\)\)\)/);
  assert.equal(B.ssrRefine[0], 4);
  assert.match(tsl, /float\(1\.16\)\)\)/);
  assert.match(tsl, /float\(0\.55\)\)\)\.toVar\(\)/);
  assert.deepEqual([B.ssrStep[0], B.ssrGrowth[0]], [0.55, 1.16]);
  // Every hi budget is at least today's, and the hi sample counts double.
  assert.equal(B.ssaoTaps[1], 2 * B.ssaoTaps[0]);
  assert.equal(B.raySteps[1], 2 * B.raySteps[0]);
  assert.equal(B.rayLamps[1], 12, "the god-ray CPU fill's nearest-12 (was cut to the 6-slot march)");
  assert.ok(B.ssrMarch[1] > B.ssrMarch[0] && B.ssrRefine[1] > B.ssrRefine[0]);
});

test("ssrHi march: a finer first step that still reaches past today's march", () => {
  const B = GI.BUDGET;
  const today = GI.marchReach(B.ssrStep[0], B.ssrGrowth[0], B.ssrMarch[0]);
  const hi = GI.marchReach(B.ssrStep[1], B.ssrGrowth[1], B.ssrMarch[1]);
  assert.ok(near(GI.marchReach(1, 1, 5), 5));
  assert.ok(today > 100 && today < 130, `today's reach ${today}`);
  assert.ok(hi >= today, `hi reach ${hi} >= ${today}`);
  assert.ok(B.ssrStep[1] < B.ssrStep[0] && B.ssrGrowth[1] < B.ssrGrowth[0], "finer steps near the receiver");
});

test("16-tap SSAO kernel: evenly spaced, alternating radii, balanced", () => {
  const k = GI.ssaoKernel(16);
  assert.equal(k.length, 16);
  let sx = 0, sy = 0;
  k.forEach(([x, y], i) => {
    const r = Math.hypot(x, y);
    assert.ok(near(r, i % 2 ? 0.55 : 1, 1e-5), `tap ${i} radius ${r}`);
    const a = Math.atan2(y, x), want = (i / 16) * Math.PI * 2;
    assert.ok(near(Math.cos(a), Math.cos(want), 1e-5) && near(Math.sin(a), Math.sin(want), 1e-5), `tap ${i} angle`);
    sx += x; sy += y;
  });
  assert.ok(Math.abs(sx) < 1e-4 && Math.abs(sy) < 1e-4, "no directional bias");
});

test("GTAO slice integral: open flat = 1, closed = 0, monotone in the horizon", () => {
  const H = Math.PI / 2;
  assert.ok(near(GI.gtaoSliceVis(0, -H, H, 1), 1, 1e-12), "unoccluded, normal toward the eye");
  assert.ok(near(GI.gtaoSliceVis(0, 0, 0, 1), 0, 1e-12), "both horizons on the normal: fully occluded");
  assert.ok(near(GI.gtaoSliceVis(0, -H, H, 0.5), 0.5, 1e-12), "scaled by the projected normal length");
  let prev = -1;
  for (let h = 0; h <= H + 1e-9; h += H / 16) {
    const v = GI.gtaoSliceVis(0, -h, h, 1);
    assert.ok(v >= prev - 1e-12, `vis rises as the horizon opens (h=${h})`);
    prev = v;
  }
  // A tilted normal: the open slice integrates to cos n + n sin n (the shader clamps vis to [0, 1]); closing the
  // horizons symmetrically about n only ever lowers it.
  for (const n of [-1.2, -0.4, 0.3, 1.1]) {
    assert.ok(near(GI.gtaoSliceVis(n, n - H, n + H, 1), Math.cos(n) + n * Math.sin(n), 1e-9), `n=${n}`);
    let last = Infinity;
    for (const t of [1, 0.9, 0.4, 0]) {
      const v = GI.gtaoSliceVis(n, n - t * H, n + t * H, 1);
      assert.ok(v >= -1e-9 && v <= last + 1e-9, `n=${n} t=${t} v=${v}`);
      last = v;
    }
  }
  assert.equal(GI.gtaoFalloff(0, 1), 1);
  assert.ok(near(GI.gtaoFalloff(1, 1), 0, 1e-12));
  assert.ok(near(GI.gtaoFalloff(0.385, 1), 1, 1e-9));
  assert.ok(GI.gtaoFalloff(0.7, 1) > 0 && GI.gtaoFalloff(0.7, 1) < 1);
});

test("bilateral denoise: the gaussian is normalised and depth edges are rejected", () => {
  const [g0, g1, g2] = GI.BILATERAL_G;
  assert.ok(near(g0 + 2 * g1 + 2 * g2, 1, 1e-9));
  assert.equal(GI.bilateralDepthW(0, -10), 1);
  assert.ok(GI.bilateralDepthW(0.05, -10) > 0.8, "same surface keeps its weight");
  assert.ok(GI.bilateralDepthW(3, -10) < 0.01, "a 3 m step at 10 m (car over road) is rejected");
  assert.ok(GI.bilateralDepthW(1, -100) > GI.bilateralDepthW(1, -5), "relative: far geometry tolerates more");
});

test("depth of field: CoC is zero at focus, grows both ways, clamps at maxPx", () => {
  const { aperture } = GI.DOF;
  assert.equal(GI.cocPx(6, 6, aperture, 10), 0);
  assert.ok(GI.cocPx(60, 6, aperture, 10) > GI.cocPx(12, 6, aperture, 10));
  assert.ok(GI.cocPx(1e6, 6, aperture, 10) <= 10 * aperture + 1e-9, "background tends to aperture * maxPx");
  assert.equal(GI.cocPx(0.5, 6, aperture, 10), 10, "near foreground clamps at maxPx");
  assert.equal(GI.cocPx(0, 6, aperture, 10), 0);
  assert.equal(GI.cocPx(5, 0, aperture, 10), 0);
  const k = GI.dofKernel(GI.BUDGET.dofTaps);
  assert.equal(k.length, 24);
  assert.ok(k.every(([x, y]) => Math.hypot(x, y) <= 1 + 1e-6), "inside the unit disc");
  const rs = k.map(([x, y]) => Math.hypot(x, y));
  assert.ok(rs.every((r, i) => i === 0 || r > rs[i - 1]), "radius increases along the spiral");
});

test("autofocus: car taps win, else the centre, clamped to the lens range; the pull snaps on a cut", () => {
  assert.equal(GI.focusDistance([{ z: 5, car: true }, { z: 7, car: true }, { z: 90, car: false }], 40), 6);
  assert.equal(GI.focusDistance([{ z: 90, car: false }], 40), 40);
  assert.equal(GI.focusDistance([], 0), GI.FOCUS_MAX, "sky at the centre focuses at infinity");
  assert.equal(GI.focusDistance([{ z: 0.1, car: true }], 9), GI.FOCUS_MIN);
  assert.equal(GI.focusBlend(0.016, true), 1);
  assert.equal(GI.focusBlend(0, false), 1, "no elapsed time: first frame");
  const a = GI.focusBlend(0.016, false), b = GI.focusBlend(0.1, false);
  assert.ok(a > 0 && a < b && b < 1);
  assert.equal(GI.focusBlend(5, false), GI.focusBlend(0.25, false), "a long hitch does not overshoot");
});

test("motion blur velocity: shutter scale, max-length clamp, camera-cut reject", () => {
  const { shutter, maxLen, cutLen } = GI.MB;
  assert.deepEqual([...GI.mbVelocity(0, 0, shutter, maxLen, cutLen)], [0, 0]);
  const [vx, vy] = GI.mbVelocity(0.02, 0, shutter, maxLen, cutLen);
  assert.ok(near(vx, 0.02 * shutter) && vy === 0);
  const c = GI.mbVelocity(0.2, 0.1, shutter, maxLen, cutLen);
  assert.ok(near(Math.hypot(c[0], c[1]), maxLen, 1e-12), "long motion clamps to maxLen");
  assert.deepEqual([...GI.mbVelocity(0.3, 0, shutter, maxLen, cutLen)], [0, 0], "a cut blurs nothing");
});

test("build plan against the real GfxQuality: HIGH / phones / fixed targets build nothing", () => {
  for (const p of ["low", "medium", "high"]) assert.equal(GI.anyBuilt(GI.buildPlan(envFor(gfxQuality(p)))), false, p);
  assert.equal(GI.anyBuilt(GI.buildPlan(envFor(gfxQuality("extreme"), { mobile: true }))), false, "phone");
  assert.equal(GI.anyBuilt(GI.buildPlan(envFor(gfxQuality("extreme", {}, true)))), false, "GLX.isMobile: detail 0");
  assert.equal(GI.anyBuilt(GI.buildPlan(envFor(gfxQuality("extreme"), { phys: true }))), false, "fixed targets");
  assert.equal(GI.anyBuilt(GI.buildPlan({})), false, "no GfxQuality");
});

test("build plan: ULTRA builds the constants, EXTREME the features, CINEMA extras build with EXTREME", () => {
  const ultra = GI.buildPlan(envFor(gfxQuality("ultra")));
  assert.deepEqual(Object.keys(ultra).filter((k) => ultra[k]).sort(), ["raysHi", "ssaoHi"]);
  const ext = GI.buildPlan(envFor(gfxQuality("extreme")));
  assert.deepEqual(Object.keys(ext).filter((k) => ext[k]).sort(), [...GI.NAMES].sort());
  // TLX on WebGL2 stops at ULTRA (the design's carve-out); DoF needs the HDR chain.
  const gl = GI.buildPlan(envFor(gfxQuality("extreme"), { webgpu: false }));
  assert.deepEqual(Object.keys(gl).filter((k) => gl[k]).sort(), ["raysHi", "ssaoHi"]);
  assert.equal(GI.buildPlan(envFor(gfxQuality("extreme"), { hdr: false })).dof, false);
  // apex26.gfxx.<name>: 0 keeps one out on EXTREME, 1 forces one on below its level (the A/B).
  assert.equal(GI.buildPlan(envFor(gfxQuality("extreme", { "apex26.gfxx.gtao": "0" }))).gtao, false);
  const forced = GI.buildPlan(envFor(gfxQuality("high", { "apex26.gfxx.ssgi": "1" }), { webgpu: false }));
  assert.deepEqual(Object.keys(forced).filter((k) => forced[k]), ["ssgi"]);
});

test("live plan follows the governor's shed and the cinema flag", () => {
  const Q = gfxQuality("extreme");
  const built = GI.buildPlan(envFor(Q));
  let live = GI.livePlan(built, (n) => Q.feature(n));
  assert.equal(live.ssgi && live.gtao && live.ssrHi, true);
  assert.equal(live.dof || live.motionBlur, false, "DoF / motion blur only in CINEMA");
  Q.setCinema(true);
  live = GI.livePlan(built, (n) => Q.feature(n));
  assert.equal(live.dof && live.motionBlur, true);
  Q.setShed(1);   // SHED_ORDER sheds from the end: ssgi first
  live = GI.livePlan(built, (n) => Q.feature(n));
  assert.equal(live.ssgi, false);
  assert.equal(live.ssrHi, true);
  Q.setShed(Q.SHED_ORDER.length);
  live = GI.livePlan(built, (n) => Q.feature(n));
  for (const n of ["raysHi", "ssaoHi", "gtao", "ssrHi", "ssgi"]) assert.equal(live[n], false, n);
  assert.equal(GI.livePlan(built, () => { throw new Error("x"); }).gtao, false, "a throwing feature() is off");
  assert.equal(GI.livePlan(null, () => true).gtao, false);
});

// ---------------------------------------------------------------------------------------------------------------
// The real graphs: three r187 over the fake WebGL2 context, the same rig as tlx-webgpu-perf.test.mjs.
// ---------------------------------------------------------------------------------------------------------------
installThreeGlobals();
globalThis.Log = globalThis.Log || { info() {}, warn() {}, error() {}, debug() {} };
const VENDOR = "vendor/three-0.187.0/three.webgpu.min.js";
const THREE = await import(pathToFileURL(path.join(ROOT, VENDOR)).href);
const TSL = THREE.TSL;
for (const f of ["js/render/shared/light-budget.js", "js/lighting/knobs.js", "js/render/shared/post-common.js",
  "js/render/three/tsl-chunks.js", "js/render/three/tsl-gi.js", "js/render/three/tsl-post.js", "js/render/three/tlx-post.js"])
  vm.runInThisContext(read(f), { filename: absSrc(f) });

function withStore(ls, fn) {
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true,
    value: { getItem: (k) => (k in ls ? ls[k] : null), setItem() {}, removeItem() {} } });
  try { return fn(); } finally { if (had) Object.defineProperty(globalThis, "localStorage", had); else delete globalThis.localStorage; }
}
async function rig(t, features) {
  const fg = makeFakeGL(320, 180);
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
  const identity = new THREE.Matrix4().elements;
  const shadow = { sunTex: new THREE.DepthTexture(1, 1), S: { enabled: true, lightVP: identity, lampLightVP: identity, lampArmed: false, lampIdx: -1 } };
  const T = globalThis.TLXShaders, orig = T.post;
  let P = null;
  T.post = (...a) => (P = orig(...a));
  const Q = gfxQuality("high");
  const on = new Set(features);
  // detail 0 + per-name forcing: the plan builds exactly `features` (the apex26.gfxx.<name>=1 path, WebGL2 here).
  globalThis.GfxQuality = { detail: () => 0, FEATURES: Q.FEATURES, feature: (n) => on.has(n) };
  const mats = [];
  let post;
  try {
    post = withStore({}, () => T.postChain(THREE, TSL, { renderer, isMobile: false,
      chunks: T.chunks(THREE, TSL), shadow, viz: null, ssrTag: true, softDest: () => null,
      wantSpatialUpscale: () => false, getPresentSize: () => [320, 180], sceneSamples: 0 }));
  } finally { T.post = orig; }
  post.resize(320, 180);
  t.after(() => { post.dispose(); renderer.dispose(); delete globalThis.GfxQuality; });
  const lights = new Float32Array(15 * 14);
  for (let i = 0; i < 14; i++) { lights[i * 15] = i; lights[i * 15 + 6] = 30; lights[i * 15 + 13] = 1; }
  const frame = { invProj: identity, proj: identity, invVP: identity, viewProj: identity, upVS: [0, 1, 0],
    eye: [0, 0, 0], sunDir: [0, 1, 0], sunColor: [1, 1, 1], sunVS: [0, 0, -1], time: 0, cloud: 0, lights };
  const opts = { ssao: 0.8, contact: 0.5, godray: 0.8, bloom: 0.5, reflect: 0.5, carReflect: 0.3, mist: 0.5, lampVol: 0.5 };
  return { P, post, fg, mats, present: (o) => post.present(o || opts, frame), on };
}

test("no desktop extra: today's material set, no hi state", async (t) => {
  const h = await rig(t, []);
  assert.equal(h.post.state().hi, null);
  assert.equal(h.P.ssaoHi, null); assert.equal(h.P.godrayHi, null); assert.equal(h.P.gi, null);
  assert.equal(h.P.composite.matHi, undefined);
  h.present();
  assert.equal(h.post.state().blocks.ssao, true);
});

test("every desktop extra builds and runs through three's node builder (GLSL generated, no throw)", async (t) => {
  const h = await rig(t, ["ssaoHi", "raysHi", "gtao", "ssrHi", "ssgi", "dof", "motionBlur"]);
  const st0 = h.post.state();
  assert.ok(st0.hi && st0.hi.built.gtao && st0.hi.built.dof, "built");
  assert.ok(h.P.ssaoHi && h.P.godrayHi && h.P.gi.gtao && h.P.gi.ssgi && h.P.gi.dof && h.P.gi.motionBlur);
  assert.equal(h.P.godrayHi.maxLights, 12);
  const before = h.fg.shaders ? h.fg.shaders.length : 0;
  // three reports a node-build problem through console.error / warn and carries on: none may appear.
  const said = [], ce = console.error, cw = console.warn;
  console.error = (...a) => said.push(a.join(" ")); console.warn = (...a) => said.push(a.join(" "));
  try { for (let i = 0; i < 3; i++) h.present(); } finally { console.error = ce; console.warn = cw; }
  assert.deepEqual(said, [], "three logged nothing while building and drawing the extras");
  const st = h.post.state();
  assert.deepEqual(st.hi.ran, { aoHi: 2, rays: 1, gi: true, ssrHi: true, dof: true, mblur: true });
  assert.equal(st.hi.aoFull, true, "GTAO runs at the full post size");
  assert.equal(st.blocks.ssao, true);
  if (h.fg.shaders) {
    const src = h.fg.shaders.slice(before).join("\n");
    assert.ok(src.length > 0, "three generated shader source for the passes");
    assert.match(src, /acos/, "the GTAO horizon integral reached the generated GLSL");
  }
  // GTAO shed -> the 16-tap SSAO; both shed -> today's half-res pass (live plan re-read on its cadence).
  h.on.delete("gtao");
  for (let i = 0; i < 17; i++) h.present();
  assert.equal(h.post.state().hi.ran.aoHi, 1);
  for (const n of ["ssaoHi", "raysHi", "ssrHi", "ssgi", "dof", "motionBlur"]) h.on.delete(n);
  for (let i = 0; i < 17; i++) h.present();
  const off = h.post.state();
  assert.deepEqual(off.hi.ran, { aoHi: 0, rays: 0, gi: false, ssrHi: false, dof: false, mblur: false });
  assert.equal(off.hi.aoFull, false, "the AO pair is back at half size");
  assert.equal(h.P.composite.mat, h.P.composite.matBase, "today's composite program");
  for (let i = 0; i < 9; i++) h.present();
  assert.deepEqual(h.post.state().hi.held, { gi: false, cine: false, focus: false }, "shed extras free their targets");
});
