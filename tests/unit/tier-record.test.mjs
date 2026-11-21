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
  assert.match(rec.features.hdrOut.why, /not HDR/);
  assert.equal(ran("packHd"), null);
  assert.match(rec.features.packHd.why, /threw: boom/);
  assert.match(rec.features.dof.why, /CINEMA only/);
  assert.match(rec.features.crowd3d.why, /no page-side record/);

  // Fed to the verdict, this record fails on exactly the two features that were on and did not run.
  const g = { timeOfDay: "day", gfx: { tiers: rec, backendState: { api: "webgpu", softAdapter: false, liteGpu: false } } };
  const { bad } = tierGate(g, { hardware: true, level: 2 });
  assert.deepEqual(bad.map((b) => b.split(" ")[1]).sort(), ["envAll", "ssgi"], bad.join("\n"));
});

test("the producers the probe reads still exist (tlx-post hi.ran, shadowX.state, lit.carSurf, the accessors)", () => {
  const post = read("js/render/three/tlx-post.js");
  assert.match(post, /ran: \{ aoHi: _last\.aoHi, rays: _last\.rays, gi: _last\.gi, ssrHi: _last\.ssrHi, dof: _last\.dof, mblur: _last\.mblur \}/);
  assert.match(post, /aa: \{ traa: !!AA, taa: _last\.taa, hdrPeak/);
  assert.match(read("js/render/three/tlx-shadow.js"), /lampX: \{ on: S\.lampX\.on[\s\S]{0,200}builds: s\.builds/);
  assert.match(read("js/render/three/tsl-lit.js"), /carSurf: !!CSN/);
  assert.match(read("js/render/three/tsl-sky.js"), /atmo: ATMO \}/);
  assert.match(read("js/render/three/tlx.js"), /get shadowX\(\)/);
  assert.match(read("js/render/three/tlx.js"), /maxRenderScale\(\) \{ return _ssCeil\(\); \}/);
  assert.match(read("js/render/shared/light-budget.js"), /function hiBuilt\(\)/);
  assert.match(read("js/car/liverytex.js"), /liveryHiUsed: \(\) => _livHi/);
  assert.match(read("js/car/car-draw.js"), /get carDetailUsed\(\) \{ return _det; \}/);
  assert.match(read("tools/gfx/gpu-game-check.mjs"), /r\.tiers = typeof GfxDebug !== "undefined" && GfxDebug\.tiers \? GfxDebug\.tiers\(\)/);
});
