/* gfx-hi-lazy.test.mjs — the desktop tiers above ULTRA ride LAZY_GFX_HI, off the boot wall (Bryce's B for #6003,
 * 2026-11-20: a lazy bundle, not an eagerCodeBytes raise).
 *
 * RendererBoot.start fetches the group beside the backend when the REAL GfxQuality.detail() reads 2 (EXTREME) and
 * awaits it before handing the renderer back, so GfxHi and CarHero are resident before the first car build. A phone
 * (GLX.isMobile: detail 0 whatever preset is stored) and ULTRA and below never fetch a byte of it.
 * Run: node --test tests/unit/gfx-hi-lazy.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { absSrc } from "../helpers/abs-src.mjs";
import { eagerScriptsOf } from "../../tools/check/boot-wall.mjs";

const require = createRequire(import.meta.url);
const MANIFEST = require("../../tools/manifest.cjs");
const read = (rel) => readFileSync(new URL("../../" + rel, import.meta.url), "utf8");
const HI = MANIFEST.LAZY_GFX_HI;

// A boot with the real quality-preset.js and renderer-boot.js; the loader evaluates the real files it is handed.
function boot({ preset, mobile = false, gfxDetail = null }) {
  const loads = [], warns = [], ls = new Map([["apex26.gfxBackend", "three"]]);
  const raw = new Map(gfxDetail == null ? [] : [["apex26.gfxDetail", String(gfxDetail)]]);
  const ctx = vm.createContext({
    console, Promise, setTimeout, clearTimeout,
    ApexRoster: { DEFERRED: { three: ["tlx.js"], webgpu: ["wgx.js"], webgl2: ["glx.js"] }, LAZY_GFX_HI: HI, LAZY_GFX_HI_EDGES: MANIFEST.LAZY_GFX_HI_EDGES },
    GameStore: { store: { get: (k, d) => (k === "gfxPreset" ? preset : d), set() {}, raw: (k) => (raw.has(k) ? raw.get(k) : null), rawSet: (k, v) => raw.set(k, v) } },
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    ApexXR: { bootPick: () => null, detect: async () => {} },
    navigator: { gpu: { requestAdapter: async () => ({}) } },
    location: { reload() { throw new Error("no reload expected"); } },
    document: { createElement: () => ({}), head: { appendChild() {} }, addEventListener() {}, getElementById: () => null, readyState: "complete" },
    Event: class { constructor(type) { this.type = type; } },
    GLX: { isMobile: mobile, init: () => true },
    RendererPicker: { showUnavailable() {} },
    Gfx: { create: async () => ({ name: "tlx" }) },
    Log: { warn: (_ns, ...m) => warns.push(m.join(" ")), info() {} },
  });
  ctx.window = ctx;
  ctx.dispatchEvent = () => true;
  vm.runInContext(read("js/perf/quality-preset.js").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/perf/quality-preset.js") });
  vm.runInContext(read("js/render/renderer-boot.js").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/render/renderer-boot.js") });
  const rb = vm.runInContext("RendererBoot", ctx).create({
    $: () => null, els: {}, canvas: { getContext: () => ({}) }, ensureDataHub() {},
    loadBackendScripts: async (files) => {
      loads.push(...files);
      for (const f of files) if (HI.includes(f)) vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: absSrc(f) });
      return true;
    },
  });
  return { rb, ctx, loads, warns, Q: vm.runInContext("GfxQuality", ctx) };
}

test("LAZY_GFX_HI is a lazy group: no <script> tag on the boot wall, rostered for the loader", () => {
  assert.ok(HI.length >= 2 && HI.includes("js/render/shared/gfx-hi.js") && HI.includes("js/car/car-hero.js"));
  const wall = new Set(eagerScriptsOf(read("index.html")));
  for (const f of HI) assert.equal(wall.has(f), false, f + " is not eager");
  const roster = read("js/roster.js");
  for (const f of HI) assert.ok(roster.includes(JSON.stringify(f)), f + " is in js/roster.js");
});

test("desktop EXTREME: start() loads the bundle beside the backend and the tier's extras turn on", async () => {
  const h = boot({ preset: "extreme" });
  assert.equal(h.Q.detail(), 2);
  await h.rb.start();
  for (const f of HI) assert.ok(h.loads.includes(f), f + " fetched");
  assert.equal(typeof vm.runInContext("GfxHi", h.ctx), "object", "GfxHi resident when start() returns");
  assert.equal(typeof vm.runInContext("CarHero", h.ctx), "object", "CarHero resident when start() returns");
  assert.equal(h.Q.feature("heroCar"), true);
  assert.equal(h.Q.feature("csm"), true);
  assert.equal(h.Q.maxId(false), "extreme", "the GRAPHICS row offers EXTREME on a desktop");
  assert.deepEqual(h.warns.filter((w) => /EXTREME detail bundle/.test(w)), []);
});

test("ULTRA and below on a desktop never fetch the bundle", async () => {
  for (const preset of ["ultra", "high", "medium", "low", null]) {
    const h = boot({ preset });
    await h.rb.start();
    assert.deepEqual(h.loads.filter((f) => HI.includes(f)), [], `${preset}: no LAZY_GFX_HI fetch`);
    assert.equal(h.Q.feature("heroCar"), false);
  }
});

test("a phone never fetches the bundle, even with EXTREME stored or apex26.gfxDetail=2", async () => {
  for (const opts of [{ preset: "extreme" }, { preset: "ultra" }, { preset: "extreme", gfxDetail: 2 }]) {
    const h = boot({ ...opts, mobile: true });
    assert.equal(h.Q.detail(), 0, "phones read detail 0");
    await h.rb.start();
    assert.deepEqual(h.loads, ["tlx.js"], JSON.stringify(opts) + ": the backend alone");
  }
});

test("a failed bundle fetch keeps the boot: the renderer still comes back, ULTRA detail, said out loud", async () => {
  const h = boot({ preset: "extreme" });
  const rb = vm.runInContext("RendererBoot", h.ctx).create({
    $: () => null, els: {}, canvas: { getContext: () => ({}) }, ensureDataHub() {},
    loadBackendScripts: async (files) => (files.some((f) => HI.includes(f)) ? false : true),
  });
  const made = await rb.start();
  assert.ok(made, "start() still resolves");
  assert.equal(typeof h.ctx.CarHero, "undefined");
  assert.ok(h.warns.some((w) => /EXTREME detail bundle did not load/.test(w)));
});
