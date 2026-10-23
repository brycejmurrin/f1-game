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
import { absSrc } from "../helpers/abs-src.mjs";

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
    { filename: absSrc("js/lighting/profiles.js") });
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
  vm.runInContext(readFileSync(presetsPath, "utf8"), ctx, { filename: absSrc(presetsPath) });
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

// Moved from track-foundation.test.mjs (TK1-11): the per-chunk lamp gate and its latch are
// light-store / tuner wiring; the governor half runs in perf-governor.test.mjs.
test("per-chunk lamps: every half shares ONE gate, and it is autoShed", () => {
  // A feature the player can switch on must not be held off by three different
  // answers. Before this was pinned:
  //   js/lighting/knobs.js  help text : "Available at every GRAPHICS preset"
  //   js/lighting/tuner-panel.js     why-off   : PerfGov.autoTier()  (governor only)
  //   js/game.js           the gate  : PerfGov.tier()      (preset TOO)
  // and the third one wins, so PER-CHUNK ROAD did nothing on GRAPHICS: LOW
  // while the tuner reported no problem.
  //
  // It was also DEAD CODE, which is why it went unnoticed:
  //   (A && tier() < 1) || (tier() < 3)  ===  tier() < 3
  // tier() < 1 implies tier() < 3, so the lamp clause could never change the
  // outcome.
  //
  // THEN autoTier() LEAKED THE PRESET BACK IN BY ANOTHER ROUTE, which is what
  // this test is now pinning. autoTier() reads _perfTier, and the degrade
  // branch writes `_perfTier = max(_perfTier, _floorTier()) + 1` — _floorTier()
  // folds in the GRAPHICS preset — while the restore branch walks back down
  // only as far as _floorTier(). On MEDIUM (_userTier 2, every phone's default)
  // the governor's FIRST shed pinned autoTier() at >= 2 for the whole session,
  // so these lamps went off and never came back however completely the device
  // recovered — reported as "chunk lights isn't working even with the slider",
  // against a tuner note promising it "returns on its own when frames recover".
  // autoShed() is the governor's measured shed alone (js/perf/governor.js), and
  // autoTier() deliberately stays behind for the tier-4 post consumers, which
  // must still be able to reach 4 on a low preset.
  const src = readFileSync(join(ROOT, "js/game.js"), "utf8");

  const road = src.match(/const _wantRoadChunk = [^;]+;/);
  assert.ok(road, "_wantRoadChunk still exists");
  assert.match(road[0], /!_perChunkOff && PerfGov\.autoShed\(\) < 2/,
    "the road lamp clause must gate on autoShed() — tier() makes it dead code, " +
    "and autoTier() pins it off for the session after one shed on any preset " +
    "below GRAPHICS: HIGH");

  // NOT the first `frame.perChunkLights = ...` — line ~6783 resets it to 0 with
  // the rest of the frame fields, and matching that read as a missing gate.
  const scenery = src.match(/frame\.perChunkLights = \(![^;]*hasPerChunkLights[^;]+;/);
  assert.ok(scenery, "the GATED frame.perChunkLights assignment still exists");
  assert.match(scenery[0], /_pcShed >= 2/,
    "the scenery half must stay on the same accessor and rung as the road half " +
    "so the two cannot disagree");
  assert.match(src, /const _pcShed = PerfGov\.autoShed\(\);/,
    "_pcShed is the autoShed() read, not tier()/autoTier()");
  // One shed tier CAPS the knob at 0.3 (measured cheaper than off) instead of
  // switching it off — off handed a struggling device the popping global set.
  assert.match(src, /_pcShed >= 1 \? Math\.min\(0\.3,/,
    "autoShed 1 caps PER-CHUNK LAMPS at 0.3 rather than turning it off");

  // And the knob's own explanation has to describe the gate that actually runs.
  const tuner = readFileSync(join(ROOT, "js/lighting/tuner-panel.js"), "utf8");
  assert.match(tuner, /PerfGov\.autoShed\s*\)\s*\?\s*PerfGov\.autoShed\(\)/,
    "tuner.js's held-off note must read the same accessor as the gate");
  const apex = readFileSync(join(ROOT, "js/agent/apex.js"), "utf8");
  assert.match(apex, /PerfGov\.autoShed\(\) >= 2\) return "tier"/,
    "__apex.perChunkHeld() must name the same gate the render path runs");

  // Look post (bloom/SSAO/god-rays) reads lookPostShed() so GRAPHICS: LOW
  // sheds it without pinning autoTier (wet-road SSR still uses autoTier).
  // assert.ok (not assert.match) — #1682 ratchet.
  const pfx = readFileSync(join(ROOT, "js/ui/post-fx-opts.js"), "utf8");
  assert.ok(pfx.includes("lookPostShed"),
    "the look post stack must read lookPostShed(), not autoTier alone");
  assert.ok(src.includes("PostFxOpts.applyLookShed"),
    "race present must route look post through applyLookShed");
  assert.ok(pfx.includes("po.ssao = off ? 0 : v.ssao"),
    "SSAO must follow the lookPostShed latch");
});

test("the display-reset latch clears from EITHER chunk slider, as the tuner promises", () => {
  // js/lighting/tuner-panel.js gateNote() shows "held after a display reset — set to 0
  // and back on to retry" for BOTH chunk knobs (its isChunk covers
  // roadChunkLamps). The clear in js/game.js was keyed on perChunkLights only,
  // so a player who read that note on PER-CHUNK ROAD and did exactly what it
  // said cleared nothing: the instruction silently only worked on the other
  // control. Whatever the note offers, the edit path has to honour.
  const game = readFileSync(join(ROOT, "js/race/light-tune-edit.js"), "utf8");
  // Not [^)]* — the condition contains !(+LT[id] > 0), so a no-paren class
  // stops at the first inner ")". Bounded any-char instead.
  const clear = game.match(/if \([\s\S]{0,220}?perChunkLights[\s\S]{0,220}?perChunkOff\) \{/);
  assert.ok(clear, "the _perChunkOff rising-edge clear still exists");
  assert.match(clear[0], /roadChunkLamps/,
    "the latch clear must accept a rising edge on roadChunkLamps too — the " +
    "tuner tells the player that slider can retry it");

  const tuner = readFileSync(join(ROOT, "js/lighting/tuner-panel.js"), "utf8");
  const isChunk = tuner.match(/const isChunk = [^;]+;/);
  assert.ok(isChunk, "tuner.js still classifies the chunk knobs");
  // If the note ever stops covering roadChunkLamps this test is the reminder to
  // narrow the clear again rather than leave the two out of step.
  assert.match(isChunk[0], /roadChunkLamps/,
    "if the note no longer offers the retry on PER-CHUNK ROAD, narrow the clear to match");
});
