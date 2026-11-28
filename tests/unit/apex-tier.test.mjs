// APEX (#7411, D-050): the opt-in desktop tier above EXTREME and its first extra, long contact shadows (contactSS).
// Part 1 pins the preset plumbing: APEX is stored as EXTREME plus a flag, is never a default, never reaches a phone,
// and leaves every other preset's answers alone. Part 2 pins the contact march: its CPU twin, and that the post graph
// is today's unless tlx.js passes contactSS (three's node builder generates the shader text; nothing is compiled by a
// driver and no pixel is checked, so this is NOT evidence about a GPU).
//
// Run: node --test tests/unit/apex-tier.test.mjs
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

// The real GfxQuality over a plain-object store; GLX as given (undefined = a harness with no renderer).
function quality(data = {}, GLX, raw = {}) {
  const store = { get: (k, d) => (k in data ? data[k] : d), set: (k, v) => { data[k] = v; return true; },
    raw: (k) => (k in raw ? raw[k] : null), rawSet: (k, v) => { raw[k] = v; } };
  const ctx = vm.createContext({ GameStore: { store }, Log: { info() {}, warn() {} }, GLX, setTimeout() {} });
  vm.runInContext(read("js/perf/quality-preset.js") + "\nthis.GfxQuality = GfxQuality;", ctx, { filename: absSrc("js/perf/quality-preset.js") });
  return { Q: ctx.GfxQuality, data };
}
const APEX_ON = { gfxPreset: "extreme", gfxApex: true };

test("APEX is EXTREME plus a flag: no stored value or detail level changes for any reader", () => {
  const { Q, data } = quality({ gfxPreset: "high" }, { apexTier: true });
  assert.equal(Q.set("apex", { noReload: true }), true);
  assert.equal(Q.current(), "apex");
  assert.deepEqual({ ...data }, APEX_ON, "the preset key every backend reads still says extreme");
  const on = quality({ ...APEX_ON }).Q;
  assert.equal(on.detail(), 2, "EXTREME's detail level, not a new one");
  assert.equal(on.feature("contactSS"), true);
  assert.equal(on.feature("gtao"), true);
  Q.set("extreme", { noReload: true });
  assert.deepEqual({ ...data }, { gfxPreset: "extreme", gfxApex: false }, "leaving APEX clears the flag");
  Q.set("high", { noReload: true });
  assert.equal(data.gfxApex, false);
});

test("every other preset answers as before: the APEX extra is off and the flag alone does nothing", () => {
  for (const preset of ["low", "medium", "high", "ultra", "extreme"]) {
    const { Q } = quality({ gfxPreset: preset });
    assert.equal(Q.feature("contactSS"), false, preset);
    assert.equal(Q.presetDefault("contactSS", preset), false, preset);
  }
  assert.equal(quality({ gfxPreset: "high", gfxApex: true }).Q.feature("contactSS"), false, "a stray flag under HIGH");
  assert.equal(quality({}).Q.defaultId(false), "high", "never the default");
  assert.equal(quality({}).Q.maxId(false), "extreme");
  assert.equal(quality({}).Q.FEATURES.contactSS, undefined, "not a detail-level feature: tsl-gi's plan never sees it");
});

test("never on a phone: capped, and no override or A/B key turns the extra on", () => {
  const phone = { isMobile: true };
  assert.equal(quality({}, phone).Q.capId("apex", true), "high");
  const { Q } = quality({ ...APEX_ON, gfxPhoneFeatureOverrides: { contactSS: true } }, phone, { "apex26.gfxx.contactSS": "1" });
  assert.equal(Q.feature("contactSS"), false);
  assert.equal(Q.supportsOption("contactSS"), false, "the Graphics details row is not listed on a phone");
  assert.equal(Q.presetRule("contactSS"), null);
  assert.equal(Q.apexBlocked(), true);   // set() caps through capId(id, true) above (init() reads GLX.isMobile)
});

test("a renderer that is not desktop-class refuses APEX; an unknown one (pre-boot) does not", () => {
  const no = quality({ gfxPreset: "extreme" }, { apexTier: false });
  assert.equal(no.Q.apexBlocked(), true);
  assert.equal(no.Q.capId("apex", false), "extreme");
  no.Q.set("apex", { noReload: true });
  assert.deepEqual({ ...no.data }, { gfxPreset: "extreme" }, "GLX / WGX / a software adapter stay on EXTREME");
  assert.equal(quality({}, {}).Q.apexBlocked(), false);
  assert.equal(quality({}, undefined).Q.apexBlocked(), false);
  assert.equal(quality({}, { apexTier: true }).Q.capId("apex", false), "apex");
});

test("overrides and the A/B key: On under EXTREME, Off under APEX", () => {
  assert.equal(quality({ gfxPreset: "extreme", gfxFeatureOverrides: { contactSS: true } }).Q.feature("contactSS"), true);
  assert.equal(quality({ ...APEX_ON, gfxFeatureOverrides: { contactSS: false } }).Q.feature("contactSS"), false);
  assert.equal(quality({ ...APEX_ON }, undefined, { "apex26.gfxx.contactSS": "0" }).Q.feature("contactSS"), false);
  assert.equal(quality({ gfxPreset: "high" }, undefined, { "apex26.gfxx.contactSS": "1" }).Q.feature("contactSS"), true);
  const { Q } = quality({ ...APEX_ON });
  assert.equal(Q.presetRule("contactSS"), "apex");
  assert.equal(Q.presetDefault("contactSS", "apex"), true);
  assert.equal(Q.presetDefault("gtao", "apex"), true, "APEX keeps every EXTREME row on");
  assert.equal(Q.presetDefault("msaa", "apex"), true);
});

// ---------------------------------------------------------------------------------------------------------------
// The contact march.
// ---------------------------------------------------------------------------------------------------------------
installThreeGlobals();
globalThis.Log = globalThis.Log || { info() {}, warn() {}, error() {}, debug() {} };
const THREE = await import(pathToFileURL(path.join(ROOT, "vendor/three-0.187.0/three.webgpu.min.js")).href);
for (const f of ["js/render/shared/light-budget.js", "js/lighting/knobs.js", "js/render/shared/post-common.js",
  "js/render/three/tsl-chunks.js", "js/render/three/tsl-gi.js", "js/render/three/tsl-post.js", "js/render/three/tsl-aa.js",
  "js/render/three/tlx-post.js"])
  vm.runInThisContext(read(f), { filename: absSrc(f) });

test("contactLong: 16 taps, ordered, inside 1 m; full strength through today's 0.2 m, fading to 0", () => {
  const C = globalThis.TLXShaders.contactLong;
  assert.deepEqual([C.STEPS, C.REACH, C.FULL], [16, 1, 0.2]);
  for (const j of [0, 0.5, 0.999]) {
    let prev = 0;
    for (let i = 0; i < C.STEPS; i++) {
      const d = C.dist(i, j);
      assert.ok(d > prev && d <= C.REACH + 1e-9, `tap ${i} jitter ${j}: ${d}`);
      prev = d;
    }
  }
  assert.ok(C.dist(0, 0) < 0.01 && C.dist(C.STEPS - 1, 1) === C.REACH, "first tap at the contact, last at the reach");
  assert.ok(C.dist(1, 0.5) - C.dist(0, 0.5) < C.dist(15, 0.5) - C.dist(14, 0.5), "short steps near, long steps far");
  assert.equal(C.weight(0.1), 1);
  assert.equal(C.weight(0.2), 1);
  assert.equal(C.weight(1), 0);
  assert.ok(C.weight(0.4) > C.weight(0.6) && C.weight(0.6) > C.weight(0.9));
});

async function ssaoShader(t, contactSS) {
  const fg = makeFakeGL(320, 180);
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  const identity = new THREE.Matrix4().elements;
  const shadow = { sunTex: new THREE.DepthTexture(1, 1), S: { enabled: true, lightVP: identity, lampLightVP: identity, lampArmed: false, lampIdx: -1 } };
  const T = globalThis.TLXShaders, orig = T.post;
  let P = null;
  T.post = (...a) => (P = orig(...a));
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: { getItem: () => null, setItem() {}, removeItem() {} } });
  let post;
  try {
    post = T.postChain(THREE, THREE.TSL, { renderer, isMobile: false, chunks: T.chunks(THREE, THREE.TSL), shadow, viz: null,
      ssrTag: true, softDest: () => null, wantSpatialUpscale: () => false, getPresentSize: () => [320, 180], sceneSamples: 0,
      ...(contactSS === undefined ? {} : { contactSS }) });
  } finally {
    T.post = orig;
    if (had) Object.defineProperty(globalThis, "localStorage", had); else delete globalThis.localStorage;
  }
  t.after(() => { post.dispose(); renderer.dispose(); });
  renderer.backend.utils.getTextureSampleData = () => ({ primarySamples: 1 });
  const builder = new THREE.WGSLNodeBuilder(new THREE.QuadMesh(P.ssao.mat), renderer);
  builder.camera = new THREE.PerspectiveCamera();
  builder.scene = new THREE.Scene();
  builder.build();
  return { wgsl: builder.fragmentShader, key: P.ssao.mat.customProgramCacheKey(), composite: P.composite.mat.customProgramCacheKey() };
}

test("the post graph is today's unless tlx.js passes contactSS; with it the march is the long one under its own key", async (t) => {
  const absent = await ssaoShader(t, undefined), off = await ssaoShader(t, false), on = await ssaoShader(t, true);
  assert.equal(off.wgsl, absent.wgsl, "contactSS false builds the same shader text as a chain that never heard of it");
  assert.equal(off.key, "tlx-post-ssao");
  assert.equal(off.composite, absent.composite);
  const loops = (w, n) => new RegExp(`< ${n}\\b`).test(w);
  assert.deepEqual([loops(off.wgsl, 6), loops(off.wgsl, 16)], [true, false], "the shipped 5-step loop");
  assert.notEqual(on.wgsl, off.wgsl);
  assert.equal(on.key, "tlx-post-ssao+cs", "a different program never shares a cache key");
  assert.deepEqual([loops(on.wgsl, 6), loops(on.wgsl, 16)], [false, true], "16 taps, fixed at graph build: the cost bound");
});
