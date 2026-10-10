// lighting-tuner-reset-weather — six small lighting / weather defects from the
// 2026-10-09 bug hunt (ledger L8, M3, M10, M11, M12, M37), one pin each:
//
//   L8   tuner RESET + "(N tuned)" must see the sun knobs, which live in the
//        "<track>|<tod>|dry" slot whatever the weather (profiles.js keyFor)
//   R3-PERSISTENCE-3  a pre-2026-10-04 save's per-weather sun edit is moved to
//        that slot at load (or dropped when ambiguous), not left dead + counted
//   M3   frame.wetness is integrated by render() alone (wxArc.tick stands in
//        only when headless), so it ramps at the documented 0.8/s, not ~1.6/s
//   M10  endSession() puts the chip's weather back AND re-lights for it
//   M11  a blended re-apply that starts mid-strike fades FROM the pre-strike
//        look (G._ltBase), not from the lightning-spiked frame
//   M12  LAMP DENSITY > 1 never copies a hand-aimed `signal` kind into fills
//   M37  floodEmit (lit windows / signage) follows TWILIGHT FLOOR / RAMP like
//        the lamp emitter in game.js
//
// Real js/lighting + js/race/weather-arc.js in node VMs, no browser.
//
// Run: node --test tests/unit/lighting-tuner-reset-weather.test.mjs  (npm run test:tooling-fast)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const host = (v) => JSON.parse(JSON.stringify(v));   // VM-realm prototypes

// ── L8 ─────────────────────────────────────────────────────────────────────
const DEFS = [
  { id: "sunElev", def: 0, min: -90, max: 90 },
  { id: "sunAzim", def: 0, min: -180, max: 180 },
  { id: "lampLevel", def: 0.2, min: 0, max: 1 },
];
function loadStore(weather, saved = null) {
  const stored = { lightTune: saved }, writes = [];
  const st = { weather };
  const G = {
    store: { get: (k, d) => (stored[k] == null ? d : stored[k]), set: (k, v) => { writes.push(k); stored[k] = JSON.parse(JSON.stringify(v)); } },
    clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
    track: { def: { id: "monaco", night: false } },
    raceTimeOfDay: "dusk",
    get raceWeather() { return st.weather; },
    state: "race", applyRaceSettings() {}, isWetRoad: () => true, initRainDrops() {},
  };
  const ctx = vm.createContext({
    window: { LightPresets: {} }, LightTune: { TUNE_DEFS: DEFS, LT: {} },
    Tracks: { LIST: [G.track.def] }, Math, JSON, Object, Array, Number, isFinite, console,
  });
  seedLog(ctx);
  vm.runInContext(read("js/lighting/profiles.js"), ctx, { filename: "js/lighting/profiles.js" });
  const LS = vm.runInContext("LightStore", ctx);
  const store = LS.create(G);
  store.apply();
  return { LS, store, st, stored, writes, LT: vm.runInContext("LightTune.LT", ctx) };
}

test("L8: RESET in the wet clears the sun edit the tuner filed under |dry, and the count agrees", () => {
  const h = loadStore("wet");
  h.store.set("sunElev", -3.3);
  assert.deepEqual(host(h.store.profiles), { "monaco|dusk|dry": { sunElev: -3.3 } }, "the sun edit is filed under |dry whatever the weather");
  assert.equal(h.LS.tuned(), 1, "the label counts the |dry slot's sun knob while editing in the wet");
  assert.equal(h.LT.sunElev, -3.3);

  h.LS.reset(); h.store.apply();
  assert.deepEqual(host(h.store.profiles), {}, "no residue after RESET");
  assert.equal(h.LS.tuned(), 0, "and the label says (defaults)");
  assert.equal(h.LT.sunElev, 0, "the sun is back on its default");
});

test("L8: a wet RESET removes only the TOD-keyed ids from |dry; a dry lampLevel edit survives", () => {
  const h = loadStore("dry");
  h.store.set("lampLevel", 0.8);   // a dry-weather edit of a non-TOD knob
  h.st.weather = "wet"; h.store.apply();
  h.store.set("sunElev", -3.3); h.store.set("sunAzim", 12); h.store.set("lampLevel", 0.5);
  assert.equal(h.LS.tuned(), 3, "wet lampLevel + both sun knobs; the dry lampLevel is another condition's");

  h.LS.reset(); h.store.apply();
  assert.deepEqual(host(h.store.profiles), { "monaco|dusk|dry": { lampLevel: 0.8 } });
  h.st.weather = "dry"; h.store.apply();
  assert.equal(h.LT.lampLevel, 0.8, "the dry edit still applies");
});

test("L8: RESET in the dry still clears its own slot (sun + the rest)", () => {
  const h = loadStore("dry");
  h.store.set("sunElev", 5); h.store.set("lampLevel", 0.9);
  assert.equal(h.LS.tuned(), 2, "own slot counted once, not twice");
  h.LS.reset();
  assert.deepEqual(host(h.store.profiles), {});
});

test("L8: the RESET button goes through the store, not a bare delete of the weather key", () => {
  const src = read("js/lighting/tuner-panel.js");
  assert.match(src, /\$\("lt-reset"\)\.onclick[\s\S]{0,700}LightStore\.reset\(\)/);
  assert.match(src, /LightStore\.tuned\(\)/);
});

// ── R3-PERSISTENCE-3: legacy per-weather sun edits ─────────────────────────
test("R3-PERSISTENCE-3: a pre-10-04 wet sun edit moves to |dry at load, applies, and the export carries no dead entry", () => {
  const h = loadStore("wet", { "monaco|dusk|wet": { sunElev: -6, sunAzim: 40, lampLevel: 0.5 } });
  assert.deepEqual(host(h.stored.lightTune), { "monaco|dusk|wet": { lampLevel: 0.5 }, "monaco|dusk|dry": { sunElev: -6, sunAzim: 40 } },
    "the load persisted the migrated blob (what SAVE ALL exports)");
  assert.equal(h.LT.sunElev, -6, "the player's sun edit is live again");
  assert.equal(h.LT.sunAzim, 40);
  assert.equal(h.LS.tuned(), 3, "the label counts live knobs only");
  h.store.persist();
  assert.deepEqual(host(h.stored.lightTune), host(h.store.profiles), "a re-save writes the same clean shape");
});

test("R3-PERSISTENCE-3: ambiguous legacy sun edits are dropped (dry slot already set, or weathers disagree)", () => {
  const h = loadStore("rain", {
    "monaco|dusk|dry": { sunElev: 5 },
    "monaco|dusk|wet": { sunElev: -6, sunAzim: 40 },
    "monaco|dusk|rain": { sunAzim: 12, lampLevel: 0.4 },
    "monaco|night|wet": { sunAzim: 7 }, "monaco|night|rain": { sunAzim: 7 },
  });
  assert.deepEqual(host(h.stored.lightTune), {
    "monaco|dusk|dry": { sunElev: 5 }, "monaco|dusk|rain": { lampLevel: 0.4 }, "monaco|night|dry": { sunAzim: 7 },
  }, "dry wins over a legacy sunElev; wet 40 vs rain 12 sunAzim is dropped; agreeing weathers move once");
  assert.equal(h.LT.sunElev, 5);
  assert.equal(h.LS.tuned(), 2, "rain lampLevel + the dry slot's sunElev");
});

test("R3-PERSISTENCE-3: a clean save is not rewritten at load", () => {
  const h = loadStore("wet", { "monaco|dusk|dry": { sunElev: 5 }, "monaco|dusk|wet": { lampLevel: 0.5 }, "*": { lampLevel: 0.3 } });
  assert.deepEqual(h.writes, [], "no store.set at boot");
  assert.equal(h.LS.tuned(), 2, "wet lampLevel + the dry slot's sunElev");
});

// ── M3 / M10: weather-arc ──────────────────────────────────────────────────
function bootArc({ headless = false } = {}) {
  const ctx = vm.createContext({ Math, JSON, Object, Array, Number, Error });
  seedLog(ctx);
  const rain = [];
  ctx.Particles = { rainShow: (v) => rain.push(v) };
  ctx.GameAudio = { startRain() {}, stopRain() {} };
  vm.runInContext(read("js/race/weather-arc.js").replace(/^const\b/gm, "var"), ctx, { filename: "js/race/weather-arc.js" });
  const applied = [];
  const G = {
    raceWeather: "dry", soundOn: false, track: {}, headlessMode: headless, frame: { wetness: 0 },
    announce() {}, simSeed: () => 1, raceRound: 0, lapsTarget: 3, raceLaps: 3, netPlay: { active: () => false },
    applyRaceSettings: (b) => applied.push(b),
    isWetRoad: () => G.raceWeather === "wet" || G.raceWeather === "rain", isRaining: () => G.raceWeather === "rain",
    initRainDrops() {}, trackWetness: () => 1,
  };
  const wa = ctx.WeatherArc.create(G, { isTimeTrial: () => false, isQuali: () => false });
  return { G, wa, rain, applied };
}

test("M3: a live frame (physics tick + render) advances frame.wetness once, at 0.8/s", () => {
  const { G, wa } = bootArc();
  const dt = 1 / 60;
  for (let i = 0; i < 60; i++) { wa.tick(dt); wa.syncWetness(dt); }   // game.js: update() then render()
  const once = 1 - Math.pow(1 - 0.8 * dt, 60);
  assert.ok(Math.abs(G.frame.wetness - once) < 1e-9, `one integrator: ${once.toFixed(4)}, got ${G.frame.wetness.toFixed(4)}`);
});

test("M3: headless (no render) keeps the tick as the producer", () => {
  const { G, wa } = bootArc({ headless: true });
  const dt = 1 / 60;
  for (let i = 0; i < 60; i++) wa.tick(dt);
  assert.ok(Math.abs(G.frame.wetness - (1 - Math.pow(1 - 0.8 * dt, 60))) < 1e-9);
});

test("M10: endSession restores the chip's weather and re-lights for it (cut apply, rain hidden), once", () => {
  const { G, wa, rain, applied } = bootArc();
  wa.changeable = true; wa.plan = { to: "rain", dur: 60 };
  assert.ok(wa.startChangeable(), "the MIXED arc armed from dry");
  for (let i = 0; i < 60 * 61 && wa.arc; i++) wa.tick(1 / 60);
  assert.equal(G.raceWeather, "rain", "the arc ended in rain");
  applied.length = 0; rain.length = 0;

  wa.endSession();
  assert.equal(G.raceWeather, "dry", "the chip's pick is back");
  assert.deepEqual(applied, [undefined], "one non-blended applyRaceSettings: the cut drops any fade in flight");
  assert.deepEqual(rain, [false], "the rain overlay is hidden");

  wa.endSession();
  assert.equal(applied.length, 1, "idempotent: nothing left to restore the second time");
});

test("M10: a session whose weather never moved does not re-light at the flag", () => {
  const { wa, applied } = bootArc();
  wa.endSession();
  assert.equal(applied.length, 0);
});

// ── M11 / M37: Atmosphere ──────────────────────────────────────────────────
function bootAtmo() {
  const sandbox = {
    console, Assets: { env: () => null },
    LampBake: { prebake: () => null, budget: () => 0, forTrack: () => null },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: {}, document: { getElementById: () => null },
  };
  vm.createContext(sandbox);
  vm.runInContext("Math.random = () => 0.5;", sandbox);
  for (const f of ["js/core/log.js", "js/core/mat4.js", "js/lighting/knobs.js", "js/lighting/presets.js", "js/lighting/atmosphere.js"])
    vm.runInContext(read(f), sandbox, { filename: f });
  vm.runInContext("LightTune = { LT: LightKnobs.LT, TUNE_DEFS: LightKnobs.TUNE_DEFS, buildTrackLights: () => [] };", sandbox);
  vm.runInContext(read("js/lighting/profiles.js"), sandbox, { filename: "js/lighting/profiles.js" });
  const saved = {};
  const G = {
    clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    store: { get: (k, d) => (k in saved ? saved[k] : d), set: (k, v) => { saved[k] = JSON.parse(JSON.stringify(v)); } },
    satAdjust: (c) => c, isRaining: () => G.raceWeather === "rain", isWetRoad: () => G.raceWeather === "rain" || G.raceWeather === "wet",
    isFloodActiveSession: () => false, _nightAmbientBand: () => 0, initRainDrops: () => {},
    applyLightTune: (f, o) => ltStore.apply(f, o), applyRaceSettings: (b) => atmo.applyRaceSettings(b),
    frame: { ambientSky: [0.3, 0.3, 0.3], ambientGround: [0.1, 0.1, 0.1], sunDir: [0, 1, 0], sunColor: [1, 1, 1], fogColor: [0.5, 0.5, 0.5] },
    frameSky: { zenith: [0.1, 0.2, 0.5], horizon: [0.6, 0.7, 0.8], sunDir: [0, 1, 0], sunColor: [1, 1, 1] },
    gfx: null, state: "race", raceTimeOfDay: "default", raceWeather: "dry",
    track: { def: { id: "t", night: false, palette: { sunDir: [0.4, 0.7, 0.3], sunColor: [1, 0.95, 0.9], sun: [1, 0.95, 0.9],
      ambientSky: [0.26, 0.33, 0.50], ambientGround: [0.24, 0.19, 0.12], zenith: [0.1, 0.3, 0.8], horizon: [0.7, 0.8, 0.9] } } },
  };
  const ltStore = vm.runInContext("LightStore", sandbox).create(G);
  const atmo = vm.runInContext("Atmosphere", sandbox).create(G);
  return { G, atmo, LT: vm.runInContext("LightKnobs.LT", sandbox) };
}

test("M11: a blended re-apply that starts mid-strike fades from the pre-strike look", () => {
  const { G, atmo } = bootAtmo();
  G.raceWeather = "rain";
  atmo.applyRaceSettings();
  const base = host(G._ltBase);
  // game.js's lightning block, mid-flash: base + spike, written in place.
  G._ltFlash = 0.8;
  for (let i = 0; i < 3; i++) { G.frame.ambientSky[i] = base.ambientSky[i] + 0.4; G.frame.ambientGround[i] = base.ambientGround[i] + 0.3; }
  G.frame.exposure = base.exposure + 0.18;

  G.raceWeather = "dry";
  atmo.applyRaceSettings(true);   // rain -> dry stage flip, t = 0
  assert.deepEqual(host(G.frame.ambientSky), base.ambientSky, "the fade starts on the un-spiked ambient");
  assert.deepEqual(host(G.frame.ambientGround), base.ambientGround);
  assert.equal(G.frame.exposure, base.exposure);
  assert.deepEqual(host(G._ltBase), base, "and the lightning base is re-seeded from it, not from the flash");
});

test("M11: with no strike the fade source is still the frame (unchanged behaviour)", () => {
  const { G, atmo } = bootAtmo();
  G.raceWeather = "rain";
  atmo.applyRaceSettings();
  G._ltFlash = 0;
  G.frame.ambientSky = [0.9, 0.9, 0.9];   // some other writer: not a strike
  G.raceWeather = "dry";
  atmo.applyRaceSettings(true);
  assert.deepEqual(host(G.frame.ambientSky), [0.9, 0.9, 0.9]);
});

test("M37: floodEmit uses the TWILIGHT FLOOR / RAMP knobs the lamp emitter reads", () => {
  const { G, atmo, LT } = bootAtmo();
  const lamp = (sunY) => Math.max(LT.twilightFloor != null ? LT.twilightFloor : 0.30,
    Math.min(1, Math.max(0, 1 - sunY * (LT.twilightRamp != null ? LT.twilightRamp : 6))));   // game.js nightF
  const want = (sunY) => Math.min(1, LT.floodEmitMul * Math.min(0.70, 0.05 + 0.58 * lamp(sunY)));
  const src = read("js/game.js");
  assert.match(src, /LT\.twilightFloor != null \? LT\.twilightFloor : 0\.30/, "the lamp emitter this mirrors");
  for (const tod of ["dusk", "dawn"]) {
    G.raceTimeOfDay = tod;
    for (const [floor, ramp] of [[0.30, 6], [0.16, 3], [0.685, 5.95], [0.06, 1.2]]) {
      LT.twilightFloor = floor; LT.twilightRamp = ramp;
      for (const sunY of [0.4, 0.2, 0.1, 0.02, -0.05, -0.3])
        assert.ok(Math.abs(atmo.floodEmit(sunY) - want(sunY)) < 1e-12, `${tod} floor ${floor} ramp ${ramp} sunY ${sunY}`);
    }
  }
});

// ── M12: LAMP DENSITY fills ────────────────────────────────────────────────
function loadLightTune() {
  const sb = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Object, Array };
  sb.window = sb;
  vm.createContext(sb);
  seedLog(sb);
  for (const f of ["js/render/shared/light-budget.js", "js/lighting/knobs.js", "js/lighting/track-lights.js", "js/lighting/frame-lights.js", "js/lighting/lighting.js"])
    vm.runInContext(read(f).replace(/^const\b/gm, "var"), sb);
  return sb.LightTune;
}
function ringTrack(kind, extra) {
  const n = 400, total = 5000;
  const px = new Float64Array(n), py = new Float64Array(n), pz = new Float64Array(n);
  const rx = new Float64Array(n), rz = new Float64Array(n), hw = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    px[i] = Math.cos(a) * 400; pz[i] = Math.sin(a) * 400; rx[i] = Math.cos(a); rz[i] = Math.sin(a); hw[i] = 7;
  }
  const lampPosts = [];
  for (let k = 0, mi = 0; k < n; k += 40, mi++) {
    const side = mi % 2 ? -1 : 1;
    lampPosts.push({ k, side, kind, ...extra, x: px[k] + rx[k] * 13 * side, y: 13, z: pz[k] + rz[k] * 13 * side });
  }
  return { n, total, px, py, pz, rx, rz, hw, def: { theme: "green", id: "monza" }, lampPosts };
}
/** [r/g ratio of every light record] — the red signal aspect is > 4, any road lamp < 3. */
function redness(lights) {
  const out = [];
  for (let i = 0; i + 14 < lights.length; i += 15) out.push(lights[i + 3] / Math.max(1e-6, lights[i + 4]));
  return out;
}

test("M12: densified fills never inherit the pit-entrance `signal` kind", () => {
  const api = loadLightTune();
  api.LT.lampDensity = 2; api.LT.lampGapFill = 0;
  const track = ringTrack("signal", { entry: true, aimAt: [0, 0, 0] });
  const reds = redness(api.buildTrackLights(track)).filter((r) => r > 4);
  assert.equal(reds.length, track.lampPosts.length, "only the real signal lamps are red, not the fill between them");
});

test("M12: fills still inherit an ordinary mast kind (the circuit's lamp colour)", () => {
  const api = loadLightTune();
  api.LT.lampDensity = 2; api.LT.lampGapFill = 0;
  const track = ringTrack("sodium");
  const amber = redness(api.buildTrackLights(track)).filter((r) => r > 1.5);
  assert.ok(amber.length > track.lampPosts.length, "sodium amber carried onto the fill lamps");
});
