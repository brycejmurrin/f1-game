/* light-store-perchunk-pin.test.mjs — perChunkLights track pins must survive a
 * lower condLayer ("*|<tod>") without reordering layers (Monaco roadChunkLamps
 * depends on today's order for every other knob).
 *
 * Run: node --test tests/unit/light-store-perchunk-pin.test.mjs
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
  { id: "roadChunkLamps", def: 0, min: 0, max: 1, step: 1 },
  { id: "lampLevel", def: 0.2, min: 0, max: 1 },
];
const TRACKS = [
  { id: "vegas", night: true },
  { id: "monaco", night: true },
  { id: "monza", night: false },
];

function loadStore({
  presets = {},
  tod = "dawn",
  weather = "wet",
  track = "vegas",
  gfx = { hasPerChunkLights: true },
} = {}) {
  const stored = {};
  const G = {
    store: {
      get: (k, d) => (stored[k] === undefined || stored[k] === null ? d : stored[k]),
      set: (k, v) => { stored[k] = JSON.parse(JSON.stringify(v)); },
    },
    clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
    get track() { return { def: TRACKS.find((t) => t.id === track) }; },
    get raceTimeOfDay() { return tod; },
    get raceWeather() { return weather; },
    get state() { return "race"; },
    get gfx() { return gfx; },
    applyRaceSettings: () => {},
    isWetRoad: () => weather === "wet" || weather === "rain",
    initRainDrops: () => {},
  };
  const ctx = vm.createContext({
    window: { LightPresets: presets },
    LightTune: { TUNE_DEFS: DEFS, LT: {} },
    Tracks: { LIST: TRACKS },
    Math, JSON, Object, Array, Number, isFinite, console,
  });
  seedLog(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/lighting/profiles.js"), "utf8"), ctx,
    { filename: "js/lighting/profiles.js" });
  const store = vm.runInContext("LightStore", ctx).create(G);
  const LT = vm.runInContext("LightTune.LT", ctx);
  store.apply();
  return { store, LT };
}

const COND_DAWN = { "*|dawn": { perChunkLights: 0.3 } };

test("track-pinned perChunkLights survives a lower condLayer value", () => {
  const presets = {
    ...COND_DAWN,
    "vegas|dawn|wet": { perChunkLights: 1 },
  };
  const h = loadStore({ presets, track: "vegas", tod: "dawn", weather: "wet" });
  assert.equal(h.LT.perChunkLights, 1, "pin 1 must not be crushed to 0.3");
});

test("condLayer still raises an unpinned track and a low track pin", () => {
  const presets = {
    ...COND_DAWN,
    "vegas|dawn|wet": { perChunkLights: 0.1 },
  };
  const low = loadStore({ presets, track: "vegas", tod: "dawn", weather: "wet" });
  assert.equal(low.LT.perChunkLights, 0.3, "condLayer raises a pin below 0.3");

  const none = loadStore({ presets: COND_DAWN, track: "monza", tod: "dawn", weather: "dry" });
  assert.equal(none.LT.perChunkLights, 0.3, "unpinned track still takes condLayer");
});

test("non-perChunkLights knobs keep cond-over-track order", () => {
  const presets = {
    "*|night": { lampLevel: 0.9 },
    "vegas|night|dry": { lampLevel: 0.15 },
  };
  const h = loadStore({ presets, track: "vegas", tod: "night", weather: "dry" });
  assert.equal(h.LT.lampLevel, 0.9, "condLayer still overrides track lampLevel");
});

test("Monaco shipped roadChunkLamps profile is unchanged by perChunk merge", () => {
  const presetsPath = join(ROOT, "js/lighting/presets.js");
  const ctx = vm.createContext({ window: {}, console, Math, Object, Array, Number, isFinite, JSON });
  seedLog(ctx);
  vm.runInContext(readFileSync(presetsPath, "utf8"), ctx, { filename: presetsPath });
  const F = ctx.window.LightPresets;
  const shipped = F["monaco|night|dry"];
  assert.ok(shipped, "monaco|night|dry preset");
  const h = loadStore({
    presets: { "*|night": { perChunkLights: 0.3 }, "monaco|night|dry": shipped },
    track: "monaco",
    tod: "night",
    weather: "dry",
  });
  assert.equal(h.LT.roadChunkLamps, 1, "Monaco night dry roadChunkLamps");
  assert.equal(h.LT.perChunkLights, 0.3, "explicit pin 0 still loses to cond 0.3 via max(0,0.3)");
});
