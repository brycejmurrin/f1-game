// weather-blend — a weather-arc step cross-fades the session lighting; a chip
// or __apex.weather() still cuts.
//
// applyRaceSettings(blendS) snapshots what the frame showed, computes the new
// weather, and tick(dt) walks sun colour, cloud cover, ambient, fog and
// exposure from the one to the other over blendS seconds (true = WX_BLEND_S,
// what js/race/weather-arc.js passes from its arc). Until 2026-10-01 only the
// wetness ramp and the rain overlay interpolated; everything else stepped
// (the second graphics-detail survey, item 11). atmosphere.js in a VM with the
// real knob registry, the real shipped presets and the REAL LightStore
// (js/lighting/profiles.js) behind applyLightTune — until 2026-10-04 this file
// stubbed applyLightTune to a no-op, so the one path that snapped every preset
// knob at a stage flip (review-wgx-lighting item 2) was never exercised.
//
// Run: node --test tests/unit/weather-blend.test.mjs  (npm run test:tooling-fast)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function boot(trackId = "t") {
  const sandbox = {
    console,
    Assets: { env: () => null },
    LampBake: { prebake: () => null, budget: () => 0, forTrack: () => null },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: {}, document: { getElementById: () => null },
  };
  vm.createContext(sandbox);
  vm.runInContext("Math.random = () => 0.5;", sandbox);   // the realm's own Math: a host Math is a cross-realm read per call
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
    track: { def: { id: trackId, night: false, palette: { sunDir: [0.4, 0.7, 0.3], sunColor: [1, 0.95, 0.9], sun: [1, 0.95, 0.9],
      ambientSky: [0.26, 0.33, 0.50], ambientGround: [0.24, 0.19, 0.12], zenith: [0.1, 0.3, 0.8], horizon: [0.7, 0.8, 0.9] } } },
  };
  const ltStore = vm.runInContext("LightStore", sandbox).create(G);
  const atmo = vm.runInContext("Atmosphere", sandbox).create(G);
  const LT = vm.runInContext("LightKnobs.LT", sandbox), DEFS = vm.runInContext("LightKnobs.TUNE_DEFS", sandbox);
  const P = vm.runInContext("window.LightPresets", sandbox);
  // Snapshot LT inside the VM realm: a cross-realm property read per knob per frame
  // was 80 % of this file's run time.
  const snapLt = vm.runInContext("(() => { const ids = LightKnobs.TUNE_DEFS.map((d) => d.id); " +
    "return () => { const r = new Float64Array(ids.length); for (let i = 0; i < ids.length; i++) r[i] = LightKnobs.LT[ids[i]]; return r; }; })()", sandbox);
  return { G, atmo, ltStore, LT, DEFS, P, snapLt };
}
const host = (v) => JSON.parse(JSON.stringify(v));
const sum = (a) => a.reduce((s, v) => s + v, 0);

test("the arc's step starts on the old look, walks the sun, cloud, ambient and fog, and lands on the new one", () => {
  const { G, atmo } = boot();
  atmo.applyRaceSettings();
  const dry = { sun: host(G.frame.sunColor), cloud: G.frameSky.cloud, amb: host(G.frame.ambientSky), fog: G.frame.fogDensity };
  // The target, measured on a twin that cuts straight to rain.
  const twin = boot(); twin.G.raceWeather = "rain"; twin.atmo.applyRaceSettings();
  const rain = { sun: host(twin.G.frame.sunColor), cloud: twin.G.frameSky.cloud, amb: host(twin.G.frame.ambientSky), fog: twin.G.frame.fogDensity };
  assert.ok(sum(rain.sun) < sum(dry.sun) * 0.9 && rain.cloud > dry.cloud + 0.2, "rain must actually mute the sun and thicken the cloud, or the fade has nothing to show");

  G.raceWeather = "rain";
  atmo.applyRaceSettings(true);
  assert.deepEqual(host(G.frame.sunColor), dry.sun, "the fade starts on the dry sun, not the rain one");
  assert.equal(G.frameSky.cloud, dry.cloud);
  assert.deepEqual(host(atmo.wxBlend()), { t: 0, dur: atmo.WX_BLEND_S });   // host(): VM-realm prototypes
  atmo.tick(atmo.WX_BLEND_S / 2);
  const mid = sum(G.frame.sunColor);
  assert.ok(mid < sum(dry.sun) - 1e-6 && mid > sum(rain.sun) + 1e-6, `half-way the sun is between dry and rain, got ${mid}`);
  assert.ok(G.frameSky.cloud > dry.cloud && G.frameSky.cloud < rain.cloud, "cloud cover walks too");
  assert.ok(sum(G.frame.ambientSky) !== sum(dry.amb), "ambient walks");
  assert.ok(G.frame.fogDensity > dry.fog && G.frame.fogDensity < rain.fog, "fog density walks");
  assert.ok(G.frame.groundMist !== twin.G.frame.groundMist, "ground mist walks too (it snapped until 2026-10-04)");
  atmo.tick(atmo.WX_BLEND_S);   // past the end
  assert.deepEqual(host(G.frame.sunColor), rain.sun, "the fade lands exactly on the rain look");
  assert.equal(G.frameSky.cloud, rain.cloud);
  assert.equal(G.frame.fogDensity, rain.fog);
  assert.equal(atmo.wxBlend(), null, "the fade is over");
  assert.equal(G.frame.skyHorizon, G.frameSky.horizon, "the frame's sky aliases stay bound to frameSky");
});

test("a chip, a slider or __apex.weather() cuts; a cut during a fade ends the fade", () => {
  const { G, atmo } = boot();
  atmo.applyRaceSettings();
  const dry = host(G.frame.sunColor);
  G.raceWeather = "rain"; atmo.applyRaceSettings();
  assert.notDeepEqual(host(G.frame.sunColor), dry, "no blend argument → the rain look at once");
  assert.equal(atmo.wxBlend(), null);
  const rain = host(G.frame.sunColor);
  G.raceWeather = "dry"; atmo.applyRaceSettings(true);
  assert.deepEqual(host(G.frame.sunColor), rain, "a fade back starts on the rain look");
  atmo.applyRaceSettings();   // a slider re-applies without a blend
  assert.deepEqual(host(G.frame.sunColor), dry, "the cut snaps to the target");
  assert.equal(atmo.wxBlend(), null, "and ends the fade");
  atmo.tick(1);   // no-op
  assert.deepEqual(host(G.frame.sunColor), dry);
});

test("the lightning's saved base follows the fade, so a strike restores to the look in flight", () => {
  const { G, atmo } = boot();
  atmo.applyRaceSettings();
  G.raceWeather = "rain"; atmo.applyRaceSettings(true);
  atmo.tick(atmo.WX_BLEND_S / 2);
  assert.deepEqual(host(G._ltBase.ambientSky), host(G.frame.ambientSky), "_ltBase.ambientSky is the blended value");
  assert.equal(G._ltBase.exposure, G.frame.exposure != null ? G.frame.exposure : 1.0);
});

test("the weather arc asks for the fade and game.js ticks it", () => {
  const arc = read("js/race/weather-arc.js");
  assert.match(arc, /if \(G\.track\) G\.applyRaceSettings\(blend\);/, "setWeatherLive forwards its blend flag");
  assert.match(arc, /setWeatherLive\(want, true\)/, "the arc's progression blends");
  assert.match(arc, /setWeatherLive\(arc\.to, true\)/, "the arc's landing blends");
  assert.doesNotMatch(arc, /return setWeatherLive\(w, true\)/, "__apex.weather() must still cut");
  const game = read("js/game.js");
  assert.match(game, /applyRaceSettings: \(blendS\) => applyRaceSettings\(blendS\)/, "the façade forwards the blend");
  assert.match(game, /wxArc\.tick\(dt\);[^\n]*\n\s*_atmo\.tick\(dt\);/, "the fade ticks right after the arc");
});

// ── L5-b: weather never paints daylight into night or midday into twilight ──
// atmosphere.js's overcast branch flattened the "default" horizon to a daylight
// grey with no night guard (the seven night-default circuits run "default"),
// the fog branch gave explicit dusk/dawn the midday fog grey, and wet/rain left
// the clear fog colour under a greyed sky. (review-wgx-lighting items 3 and 8.)
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const sat = (c) => Math.max(...c) - Math.min(...c);
function bootNight() {
  const b = boot();
  b.G.track.def.night = true;
  b.G.track.def.palette = Object.assign({}, b.G.track.def.palette,
    { zenith: [0.01, 0.02, 0.05], horizon: [0.04, 0.03, 0.06], fog: [0.015, 0.017, 0.035] });
  return b;
}

test("a night-default circuit keeps a night horizon in every weather", () => {
  for (const wx of ["dry", "wet", "rain", "overcast", "fog"]) {
    const { G, atmo } = bootNight();
    G.raceWeather = wx; atmo.applyRaceSettings();
    // 0.11: the night FOG murk [0.09,0.10,0.13] is 0.100 by design; the overcast bug was ~0.73.
    assert.ok(lum(G.frameSky.horizon) <= 0.11, `${wx}: night horizon luminance ${lum(G.frameSky.horizon).toFixed(3)} > 0.11`);
    assert.ok(lum(G.frame.fogColor) <= 0.15, `${wx}: night fog luminance ${lum(G.frame.fogColor).toFixed(3)}`);
  }
  const day = boot(); day.G.raceWeather = "overcast"; day.atmo.applyRaceSettings();
  assert.deepEqual(host(day.G.frameSky.horizon), [0.74, 0.73, 0.74], "a day overcast still flattens to the grey deck");
});

test("dusk and dawn fog take the horizon's hue, not the midday grey", () => {
  for (const tod of ["dusk", "dawn"]) {
    const { G, atmo } = boot();
    G.raceTimeOfDay = tod; atmo.applyRaceSettings();
    const clearExp = G.frame.exposure, hz = host(G.frameSky.horizon);
    G.raceWeather = "fog"; atmo.applyRaceSettings();
    const fc = host(G.frame.fogColor);
    assert.notDeepEqual(fc, [0.74, 0.76, 0.78], `${tod}: still the midday grey`);
    assert.ok(fc[0] > fc[2], `${tod}: fog ${fc} is not warm like its horizon ${hz}`);
    assert.ok(sat(fc) < sat(hz), `${tod}: fog must be a desaturated horizon`);
    assert.ok(Math.abs(lum(fc) - lum(hz)) < 0.08, `${tod}: fog luminance ${lum(fc)} strays from the horizon's ${lum(hz)}`);
    assert.ok(G.frame.exposure <= Math.max(clearExp, 1.03) + 1e-9, `${tod}: fog lifted exposure to ${G.frame.exposure}`);
  }
  const day = boot(); day.G.raceTimeOfDay = "day"; day.G.raceWeather = "fog"; day.atmo.applyRaceSettings();
  assert.deepEqual(host(day.G.frame.fogColor), [0.74, 0.76, 0.78], "day fog keeps its grey");
});

test("wet and rain fog follow the sky's overcast grey, so terrain meets the skyline", () => {
  const { G, atmo } = boot();
  atmo.applyRaceSettings();
  const clear = host(G.frame.fogColor);
  const greyH = [0.58, 0.58, 0.60];
  const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  let last = dist(clear, greyH);
  for (const wx of ["wet", "rain"]) {
    G.raceWeather = wx; atmo.applyRaceSettings();
    const d = dist(host(G.frame.fogColor), greyH);
    assert.ok(d < last - 1e-6, `${wx}: fog ${host(G.frame.fogColor)} did not move toward the grey horizon (${d} vs ${last})`);
    last = d;
  }
});

// ── L5-e: a stage flip cross-fades EVERY lighting knob ───────────────────────
// The arc's blended re-apply used to land the new preset's knobs in one frame
// (keyMul 0.115 -> 0.76, bloomMul x13, fogDensityMul x4) under a fading sky.
const HELD = (d) => !!d.rebuild || ["lampNearClamp", "lampBake", "tailLightEmit"].includes(d.id);
const ARCS = [["dry", "wet"], ["wet", "rain"], ["rain", "wet"], ["wet", "dry"], ["dry", "overcast"], ["overcast", "dry"], ["dry", "fog"], ["fog", "rain"]];

/** Cut to `from`, then blend to `to` at `fps`; returns per-frame LT snapshots. */
function walk(b, track, tod, from, to, fps) {
  const { G, atmo, snapLt } = b;
  G.track.def.id = track; G.raceTimeOfDay = tod; G.raceWeather = from;
  atmo.applyRaceSettings();
  const lights = [{ marker: true }]; G.track._lights = lights;
  const frames = [snapLt()];   // frames[i][j] = knob DEFS[j] at frame i
  G.raceWeather = to; atmo.applyRaceSettings(true);
  frames.push(snapLt());
  for (let t = 0; t < atmo.WX_BLEND_S + 1; t += 1 / fps) { atmo.tick(1 / fps); frames.push(snapLt()); }
  return { frames, lightsKept: G.track._lights === lights };
}

test("a weather-arc flip walks every knob monotonically across the 25 s window, and no 60 fps frame moves keyMul > 10 %", () => {
  const b = boot();
  const tracks = [...new Set(Object.keys(b.P).filter((k) => k.split("|").length === 3).map((k) => k.split("|")[0]))];
  assert.ok(tracks.length >= 52, `only ${tracks.length} preset tracks — the scan broke`);
  const cut = boot();
  const J = Object.fromEntries(b.DEFS.map((d, j) => [d.id, j])), K = J.keyMul;
  let moved = 0, steep = null;
  for (const track of tracks) for (const tod of ["dawn", "day", "dusk", "night"]) for (const [from, to] of ARCS) {
    // 4 fps is enough for the shape (monotonic, held, landed): the fade is a pure
    // function of t, so the frame rate only samples it. The 10 % bound is checked
    // at 60 fps below, on the steepest keyMul ratio this sweep finds.
    const { frames, lightsKept } = walk(b, track, tod, from, to, 4);
    const tag = `${track}|${tod} ${from}->${to}`;
    assert.ok(lightsKept, `${tag}: the flip nulled track._lights (a lamp rebuild + re-bake mid-race)`);
    cut.G.track.def.id = track; cut.G.raceTimeOfDay = tod; cut.G.raceWeather = to; cut.atmo.applyRaceSettings();
    const first = frames[0], last = frames[frames.length - 1];
    for (let j = 0; j < b.DEFS.length; j++) {
      const d = b.DEFS[j], id = d.id, a = first[j], z = last[j];
      if (HELD(d)) { if (z !== a) assert.fail(`${tag}: held knob ${id} moved ${a} -> ${z}`); continue; }
      if (z !== cut.LT[id]) assert.fail(`${tag}: ${id} landed on ${z}, not the ${to} preset's ${cut.LT[id]}`);
      if (a === z) { if (!frames.every((f) => f[j] === a)) assert.fail(`${tag}: ${id} wandered`); continue; }
      moved++;
      const dir = Math.sign(z - a);
      for (let i = 1; i < frames.length; i++)   // message built only on failure: this loop runs ~10^7 times
        if (Math.sign(frames[i][j] - frames[i - 1][j]) * dir < 0) assert.fail(`${tag}: ${id} not monotonic at frame ${i}: ${frames[i - 1][j]} -> ${frames[i][j]}`);
    }
    if (frames[1][K] !== first[K]) assert.fail(`${tag}: keyMul snapped on the flip frame`);
    const r = Math.max(first[K], last[K]) / Math.max(1e-9, Math.min(first[K], last[K]));
    if (!steep || r > steep.r) steep = { r, track, tod, from, to };
    for (const id of ["sunElev", "sunAzim"]) if (last[J[id]] !== first[J[id]]) assert.fail(`${tag}: the weather moved the sun (${id})`);
  }
  assert.ok(moved > 10000, `only ${moved} knob fades exercised — the presets did not load`);
  // The steepest shipped keyMul pair, plus the two the review named, at 60 fps.
  for (const { track, tod, from, to } of [steep, { track: "okayama", tod: "night", from: "dry", to: "wet" }, { track: "nurburgring", tod: "dusk", from: "dry", to: "overcast" }]) {
    const { frames } = walk(b, track, tod, from, to, 60);
    for (let i = 1; i < frames.length; i++) {
      const p = frames[i - 1][K], q = frames[i][K];
      if (Math.abs(q - p) > 0.10 * Math.max(p, q, 1e-9)) assert.fail(`${track}|${tod} ${from}->${to}: frame ${i} keyMul ${p} -> ${q} (> 10 %)`);
    }
  }
});

test("a knob written mid-fade (a tuner drag) leaves the fade instead of being dragged back", () => {
  const b = boot("okayama");
  b.G.raceTimeOfDay = "night"; b.atmo.applyRaceSettings();
  b.G.raceWeather = "wet"; b.atmo.applyRaceSettings(true);
  b.atmo.tick(5);
  b.LT.bloomMul = 0.77;   // what LightStore.set writes for a non-applyRace knob
  b.atmo.tick(5); b.atmo.tick(30);
  assert.equal(b.LT.bloomMul, 0.77, "the fade overwrote a knob the player just set");
});

test("the sun is keyed by track x time of day: a weather never moves it, and the tuner writes it there", () => {
  const b = boot("paul_ricard");
  b.G.raceTimeOfDay = "dawn"; b.G.raceWeather = "dry"; b.atmo.applyRaceSettings();
  const dry = [b.LT.sunElev, b.LT.sunAzim];
  for (const wx of ["wet", "rain", "fog", "overcast"]) {
    b.G.raceWeather = wx; b.atmo.applyRaceSettings();
    assert.deepEqual([b.LT.sunElev, b.LT.sunAzim], dry, `${wx} moved the dawn sun`);
  }
  b.G.raceWeather = "rain";
  b.ltStore.set("sunElev", 7.5);
  assert.equal(b.ltStore.profiles["paul_ricard|dawn|dry"].sunElev, 7.5, "a sun edit in the rain lands on the track|tod (dry) profile");
  assert.ok(!b.ltStore.profiles["paul_ricard|dawn|rain"] || !("sunElev" in b.ltStore.profiles["paul_ricard|dawn|rain"]));
  b.G.raceWeather = "fog"; b.ltStore.apply();
  assert.equal(b.LT.sunElev, 7.5, "and every weather at that time of day reads it");
});

// qatar-foundation.spec (2026-10-05): a night→day rebuild read lightState()
// before the first day frame rendered — stars came from applyRaceSettings,
// floodEmit only from the frame, so the day reported the night's 0.0858. The
// resolve now writes floodEmit itself, from the same formula the frame calls.
test("silverstone night dry→wet blends city skyglow, moon and the stamped knobs", () => {
  const b = boot("silverstone");
  b.G.raceTimeOfDay = "night";
  b.G.raceWeather = "dry";
  b.atmo.applyRaceSettings();
  const cut = boot("silverstone");
  cut.G.raceTimeOfDay = "night";
  cut.G.raceWeather = "wet";
  cut.atmo.applyRaceSettings();
  const stamp = (lt) => ({
    cityGlowMul: lt.cityGlowMul, keyMul: lt.keyMul, bloomMul: lt.bloomMul, moonBright: lt.moonBright,
  });
  const stampDry = stamp(b.LT), stampWet = stamp(cut.LT);
  const glowLum = (g) => (g ? g[0] + g[1] + g[2] : 0);
  const dryGlow = glowLum(b.G.frameSky.cityGlow);
  const wetGlow = glowLum(cut.G.frameSky.cityGlow);
  assert.ok(Math.abs(stampDry.cityGlowMul - 0.55) < 1e-6 && Math.abs(stampWet.cityGlowMul - 0.88) < 1e-6,
    "endpoints use the shipped *|night|dry / *|night|wet stamps");
  b.G.raceWeather = "wet";
  b.atmo.applyRaceSettings(true);
  const at = (s) => {
    b.atmo.tick(s === 1 ? b.atmo.WX_BLEND_S + 1 : s * b.atmo.WX_BLEND_S);
    return {
      cityGlowMul: b.LT.cityGlowMul,
      keyMul: b.LT.keyMul,
      bloomMul: b.LT.bloomMul,
      moonBright: b.LT.moonBright,
      glow: glowLum(b.G.frameSky.cityGlow),
      moon: b.G.frameSky.moon,
      horizon: host(b.G.frameSky.horizon),
    };
  };
  const p0 = at(0);
  assert.deepEqual(p0.horizon, [0.04, 0.03, 0.06], "night horizon stays on the dry palette at blend start");
  assert.equal(p0.cityGlowMul, stampDry.cityGlowMul, "cityGlowMul at 0%");
  assert.equal(p0.keyMul, stampDry.keyMul);
  assert.equal(p0.bloomMul, stampDry.bloomMul);
  assert.ok(Math.abs(p0.glow - dryGlow) < 1e-6, "city skyglow starts on the dry look");
  const p1 = at(0.5);
  assert.ok(p1.cityGlowMul > stampDry.cityGlowMul && p1.cityGlowMul < stampWet.cityGlowMul, "cityGlowMul mid-fade");
  assert.ok(p1.keyMul > stampWet.keyMul && p1.keyMul < stampDry.keyMul, "keyMul mid-fade");
  assert.ok(p1.bloomMul > stampWet.bloomMul && p1.bloomMul < stampDry.bloomMul, "bloomMul mid-fade");
  assert.ok(p1.glow > dryGlow && p1.glow < wetGlow, "city skyglow mid-fade");
  if (stampDry.moonBright !== stampWet.moonBright)
    assert.ok(p1.moonBright > Math.min(stampDry.moonBright, stampWet.moonBright) &&
      p1.moonBright < Math.max(stampDry.moonBright, stampWet.moonBright), "moonBright mid-fade");
  const p2 = at(1);
  assert.equal(p2.cityGlowMul, stampWet.cityGlowMul);
  assert.equal(p2.keyMul, stampWet.keyMul);
  assert.equal(p2.bloomMul, stampWet.bloomMul);
  assert.ok(Math.abs(p2.glow - wetGlow) < 1e-6, "city skyglow lands on wet");
  assert.deepEqual(p2.horizon, p0.horizon, "night horizon unchanged across the fade");
});

test("applyRaceSettings resolves floodEmit with the session, not on the next frame", () => {
  const { G, atmo, LT } = boot("qatar");
  G.raceTimeOfDay = "night";
  atmo.applyRaceSettings();
  const night = G._lastFloodEmit;
  assert.equal(G.frameSky.stars, 1);
  assert.ok(night > 0, `night floodEmit ${night} must be lit`);
  assert.equal(night, atmo.floodEmit(G.frame.sunDir[1]), "the resolve and the frame share one formula");
  assert.equal(night, Math.min(1, LT.floodEmitMul * 0.78));

  G.raceTimeOfDay = "day";
  atmo.applyRaceSettings();   // no frame in between, exactly the spec's window
  assert.equal(G.frameSky.stars, 0);
  assert.equal(G._lastFloodEmit, 0, "day must not inherit the night's prop emissive");

  G.raceTimeOfDay = "default"; G.track.def.night = true;   // a night circuit's default session is night
  atmo.applyRaceSettings();
  assert.ok(G._lastFloodEmit > 0);
});
