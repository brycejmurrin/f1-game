/* light-store-cond-layer.test.mjs — the conditional shipped layer ("*|<tod>"
 * in window.LightPresets) is the quality-ladder rung for condition-scoped
 * defaults (the ULTRA-night per-chunk lamps flip ships through it). Its
 * predicate is the ONLY thing separating ULTRA from HIGH (both are PerfGov
 * tier 0), so this suite pins exactly when the layer resolves:
 *   ULTRA preset  AND  gfx.hasPerChunkLights  AND  not mobile  AND
 *   the "*|<tod>" key matches the resolved time-of-day.
 * And, just as load-bearing: player layers come LATER, so a player edit —
 * including an explicit 0 — always wins, while dragging TO the layer's own
 * value stores nothing (put() dedups against base(), which includes the
 * layer). Same vm idiom as light-store-copy.test.mjs.
 *
 * Run: node --test tests/unit/light-store-cond-layer.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const DEFS = [
  { id: "perChunkLights", def: 0, min: 0, max: 1 },
  { id: "lampLevel", def: 0.2, min: 0, max: 1 },
];
const TRACKS = [
  { id: "vegas", night: true },
  { id: "monza", night: false },
];

function loadStore({ presets = {}, tod = "night", track = "vegas",
                     preset = "ultra", gfx = { hasPerChunkLights: true, isMobile: false } } = {}) {
  const stored = {};
  const G = {
    store: {
      get: (k, d) => (stored[k] === undefined || stored[k] === null ? d : stored[k]),
      set: (k, v) => { stored[k] = JSON.parse(JSON.stringify(v)); },
    },
    clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
    get track() { return { def: TRACKS.find((t) => t.id === track) }; },
    get raceTimeOfDay() { return tod; },
    get raceWeather() { return "dry"; },
    get state() { return "race"; },
    get gfx() { return gfx; },
    applyRaceSettings: () => {},
    isWetRoad: () => false,
    initRainDrops: () => {},
  };
  const ctx = vm.createContext({
    window: { LightPresets: presets },
    LightTune: { TUNE_DEFS: DEFS, LT: {} },
    // MIRROR THE REAL EXPORT: js/game/gfx-quality.js ends with
    // `current: () => current().id`, so current() IS the id STRING, not a
    // preset object. This stub used to return { id } — the same mistake
    // light-store.js made at its call site, so the two cancelled out and this
    // test passed green while the *|night rung was dead in production for
    // everyone. A stub that invents an API the module does not have proves
    // nothing about the code it stands in for.
    GfxQuality: { current: () => preset },
    Math, JSON, Object, Array, Number, isFinite, console,
  });
  seedLog(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/game/light-store.js"), "utf8"), ctx,
    { filename: "js/game/light-store.js" });
  const store = vm.runInContext("LightStore", ctx).create(G);
  const LT = vm.runInContext("LightTune.LT", ctx);
  store.apply();
  return { store, LT, stored };
}

const NIGHT_LAYER = { "*|night": { perChunkLights: 0.3 } };

test("the *|night layer resolves on ULTRA with a capable backend at night", () => {
  const h = loadStore({ presets: NIGHT_LAYER });
  assert.equal(h.LT.perChunkLights, 0.3);
  assert.equal(h.LT.lampLevel, 0.2, "knobs the layer does not name keep their defaults");
});

test("'default' time-of-day resolves through track.def.night before matching the key", () => {
  const night = loadStore({ presets: NIGHT_LAYER, tod: "default", track: "vegas" });
  assert.equal(night.LT.perChunkLights, 0.3, "default on a night circuit is night");
  const day = loadStore({ presets: NIGHT_LAYER, tod: "default", track: "monza" });
  assert.equal(day.LT.perChunkLights, 0, "default on a day circuit is day — no layer");
});

test("EVERY preset gets the layer — the ULTRA-only predicate is gone", () => {
  // It used to be ULTRA-only, which shipped the rung to almost nobody: HIGH is
  // the same PerfGov tier 0 AND the desktop default preset, and nothing
  // measured ever separated the two. What bounds the cost now is the resolved
  // gate in game.js, which sheds on the governor's MEASURED tier instead of on
  // which preset the player picked.
  for (const preset of ["low", "medium", "high", "ultra"]) {
    const st = loadStore({ presets: NIGHT_LAYER, preset });
    assert.equal(st.LT.perChunkLights, 0.3, preset + " must resolve the layer");
  }
});

test("MOBILE gets the layer too — capability is the only gate left", () => {
  // The isMobile exclusion was never measured (docs/LIGHTING-TUNER-SLIDERS.md
  // says so outright) and meant a phone read 0 at every preset and every hour,
  // i.e. the feature did not exist on mobile at all.
  const mob = loadStore({ presets: NIGHT_LAYER, gfx: { hasPerChunkLights: true, isMobile: true } });
  assert.equal(mob.LT.perChunkLights, 0.3);
  // Capability still gates: three.js cannot bind per-chunk sets.
  const tlx = loadStore({ presets: NIGHT_LAYER, gfx: { hasPerChunkLights: undefined, isMobile: false } });
  assert.equal(tlx.LT.perChunkLights, 0);
  const none = loadStore({ presets: NIGHT_LAYER, gfx: null });
  assert.equal(none.LT.perChunkLights, 0);
});

test("a player edit always wins — an explicit 0 beats the layer and persists sparsely", () => {
  const h = loadStore({ presets: NIGHT_LAYER });
  assert.equal(h.LT.perChunkLights, 0.3);
  h.store.set("perChunkLights", 0);
  assert.equal(h.LT.perChunkLights, 0, "the explicit 0 override wins over the shipped layer");
  h.store.apply();
  assert.equal(h.LT.perChunkLights, 0, "and survives a re-apply");
});

test("dragging TO the layer's own value stores nothing (base() includes the layer)", () => {
  const h = loadStore({ presets: NIGHT_LAYER });
  h.store.set("perChunkLights", 0.3);
  const prof = JSON.parse(JSON.stringify(h.store.profiles));
  const stampedKeys = Object.values(prof).flatMap((p) => Object.keys(p));
  assert.ok(!stampedKeys.includes("perChunkLights"),
    "an edit equal to the resolved base must not stamp an override");
});

test("the day key never fires at night and vice versa", () => {
  const h = loadStore({ presets: { "*|day": { perChunkLights: 0.9 } }, tod: "night" });
  assert.equal(h.LT.perChunkLights, 0);
});
