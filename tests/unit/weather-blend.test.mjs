// weather-blend — a weather-arc step cross-fades the session lighting; a chip
// or __apex.weather() still cuts. Also pins blended TOD cityGlow clear
// (night→day/dusk/dawn must not leak the light-pollution dome; day→night fades
// it in) — the cut path already cleared it, the fade path did not.
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
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function boot(trackId = "t", { particles = false } = {}) {
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
    vm.runInContext(read(f), sandbox, { filename: absSrc(f) });
  vm.runInContext("LightTune = { LT: LightKnobs.LT, TUNE_DEFS: LightKnobs.TUNE_DEFS, buildTrackLights: () => [] };", sandbox);
  // Exercise the real falling-rain producer only in the drizzle regression.
  // A constant RNG puts every drop directly along the eye ray, where its
  // zero-width billboard is correctly skipped, so use a deterministic stream.
  let drawnRain = 0;
  const rain = particles ? vm.runInContext(read("js/fx/particles.js") + ";Particles", sandbox, { filename: absSrc("js/fx/particles.js") }) : null;
  if (rain) {
    vm.runInContext("{ let seed = 0x51a7; Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }", sandbox);
    rain.init({ drawParticles: (_data, floats, additive) => { if (!additive) drawnRain += floats; } });
  }
  vm.runInContext(read("js/lighting/profiles.js"), sandbox, { filename: absSrc("js/lighting/profiles.js") });
  const saved = {};
  const G = {
    clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    store: { get: (k, d) => (k in saved ? saved[k] : d), set: (k, v) => { saved[k] = JSON.parse(JSON.stringify(v)); } },
    satAdjust: (c) => c, isRaining: () => G.raceWeather === "rain", isWetRoad: () => G.raceWeather === "rain" || G.raceWeather === "wet",
    isFloodActiveSession: () => false, _nightAmbientBand: () => 0, initRainDrops: () => { if (rain) rain.rainSeed(G.raceWeather === "wet"); },
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
  const drawRain = () => {
    assert.ok(rain, "boot with particles enabled to inspect the rain producer");
    rain.rainSeed(true); rain.rainShow(true);
    rain.rainUpdate(1 / 60, [100, 5, -30], 0.5);
    drawnRain = 0; rain.draw();
    return drawnRain;
  };
  return { G, atmo, ltStore, LT, DEFS, P, snapLt, drawRain };
}
const host = (v) => JSON.parse(JSON.stringify(v));
const sum = (a) => a.reduce((s, v) => s + v, 0);

test("shipped dawn wet produces drizzle, while explicit player zero still suppresses it", () => {
  for (const track of ["spa", "bahrain", "singapore"]) {
    const b = boot(track, { particles: true });
    b.G.raceTimeOfDay = "dawn"; b.G.raceWeather = "wet";
    b.atmo.applyRaceSettings();
    assert.ok(b.drawRain() > 0, `${track}: shipped dawn wet must contain falling drizzle`);

    b.ltStore.set("drizzleCount", 0);
    b.atmo.applyRaceSettings();
    assert.equal(b.LT.drizzleCount, 0, `${track}: player zero survives profile resolution`);
    assert.equal(b.drawRain(), 0, `${track}: the player's explicit suppression reaches the rain producer`);

    b.ltStore.reset(); b.atmo.applyRaceSettings();
    assert.ok(b.drawRain() > 0, `${track}: resetting player edits restores shipped drizzle`);
    b.ltStore.set("particleMul", 0); b.atmo.applyRaceSettings();
    assert.equal(b.LT.particleMul, 0);
    assert.ok(b.drawRain() > 0, `${track}: the separate smoke/spray control does not suppress falling rain`);
  }
});

test("dawn wet does not impose a crushing grade relative to rain, and reapplying does not compound it", () => {
  for (const track of ["spa", "bahrain", "singapore"]) {
    const b = boot(track);
    b.G.raceTimeOfDay = "dawn"; b.G.raceWeather = "rain"; b.atmo.applyRaceSettings();
    const rain = { contrast: b.LT.contrast, blacks: b.LT.blacks, midtones: b.LT.midtones };
    b.G.raceWeather = "wet"; b.atmo.applyRaceSettings();
    assert.ok(Math.abs(b.LT.contrast - rain.contrast) <= 0.2, `${track}: drizzle must not introduce a separate high-contrast grade`);
    assert.ok(b.LT.blacks >= rain.blacks - 0.1, `${track}: drizzle must not crush substantially more blacks than rain`);
    assert.ok(b.LT.midtones >= rain.midtones - 0.1, `${track}: drizzle must not suppress substantially more midtones than rain`);
    const snapshot = () => host({ sun: b.G.frame.sunColor, sky: b.G.frameSky.zenith, fog: b.G.frame.fogColor,
      ambient: b.G.frame.ambientSky, exposure: b.G.frame.exposure,
      grade: [b.LT.contrast, b.LT.blacks, b.LT.midtones, b.LT.gammaB] });
    const first = snapshot();
    for (let i = 0; i < 3; i++) b.atmo.applyRaceSettings();
    assert.deepEqual(snapshot(), first, `${track}: repeated weather/tuner applies reconstruct the same look`);
  }
});

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

test("daytime rain and storm stay overcast daylight; night storm stays as dark as before", () => {
  const dayTracks = ["monza", "spa", "bahrain", "suzuka"];
  for (const track of dayTracks) {
    const dry = boot(track);
    dry.G.raceTimeOfDay = "day";
    dry.G.raceWeather = "dry";
    dry.atmo.applyRaceSettings();
    const dryZ = lum(dry.G.frameSky.zenith);
    for (const wx of ["rain", "storm"]) {
      const { G, atmo } = boot(track);
      G.raceTimeOfDay = "day";
      G.raceWeather = wx;
      atmo.applyRaceSettings();
      const z = lum(G.frameSky.zenith);
      assert.ok(z >= 0.45, `${track} day ${wx}: zenith luminance ${z.toFixed(3)} reads like night`);
      assert.ok(G.frame.exposure >= 1.0, `${track} day ${wx}: exposure ${G.frame.exposure}`);
      assert.ok(z >= dryZ * 0.85, `${track} day ${wx}: zenith must not plunge below dry (${z.toFixed(3)} vs ${dryZ.toFixed(3)})`);
      if (wx === "storm") {
        assert.ok(sum(G.frame.sunColor) < sum(dry.G.frame.sunColor) * 0.55,
          `${track} day storm sun must be much softer than dry`);
      }
    }
  }
  const night = boot("monza");
  night.G.raceTimeOfDay = "night";
  night.G.raceWeather = "storm";
  night.atmo.applyRaceSettings();
  assert.ok(lum(night.G.frameSky.zenith) < 0.03, "night storm zenith stays near-black");
  assert.ok(night.G.frame.exposure < 0.85, "night storm exposure stays suppressed");
});

test("daytime overcast and fog grey the zenith, not just the horizon (survey: blue sky under overcast)", () => {
  for (const track of ["monza", "spa", "bahrain", "suzuka"]) {
    const dry = boot(track);
    dry.G.raceTimeOfDay = "day";
    dry.G.raceWeather = "dry";
    dry.atmo.applyRaceSettings();
    const blueDry = dry.G.frameSky.zenith[2] - dry.G.frameSky.zenith[0];
    for (const wx of ["overcast", "fog"]) {
      const { G, atmo } = boot(track);
      G.raceTimeOfDay = "day";
      G.raceWeather = wx;
      atmo.applyRaceSettings();
      const blue = G.frameSky.zenith[2] - G.frameSky.zenith[0];
      assert.ok(blue < blueDry * 0.5, `${track} day ${wx}: zenith blue excess ${blue.toFixed(3)} vs dry ${blueDry.toFixed(3)}`);
      assert.ok(lum(G.frameSky.zenith) >= 0.45, `${track} day ${wx}: zenith too dark`);
    }
  }
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
  // Dry endpoint is the Silverstone pass-2 skyglow override (2.35), not the
  // fleet *|night|dry 0.55; wet still inherits *|night|wet 0.88.
  assert.ok(Math.abs(stampDry.cityGlowMul - 2.35) < 1e-6 && Math.abs(stampWet.cityGlowMul - 0.88) < 1e-6,
    "endpoints use silverstone|night|dry cityGlow + *|night|wet stamps");
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
  const between = (v, a, b) => v > Math.min(a, b) && v < Math.max(a, b);
  const p0 = at(0);
  assert.deepEqual(p0.horizon, [0.04, 0.03, 0.06], "night horizon stays on the dry palette at blend start");
  assert.equal(p0.cityGlowMul, stampDry.cityGlowMul, "cityGlowMul at 0%");
  assert.equal(p0.keyMul, stampDry.keyMul);
  assert.equal(p0.bloomMul, stampDry.bloomMul);
  assert.ok(Math.abs(p0.glow - dryGlow) < 1e-6, "city skyglow starts on the dry look");
  const p1 = at(0.5);
  assert.ok(between(p1.cityGlowMul, stampDry.cityGlowMul, stampWet.cityGlowMul), "cityGlowMul mid-fade");
  assert.ok(between(p1.keyMul, stampDry.keyMul, stampWet.keyMul), "keyMul mid-fade");
  assert.ok(between(p1.bloomMul, stampDry.bloomMul, stampWet.bloomMul), "bloomMul mid-fade");
  assert.ok(between(p1.glow, dryGlow, wetGlow), "city skyglow mid-fade");
  if (stampDry.moonBright !== stampWet.moonBright)
    assert.ok(between(p1.moonBright, stampDry.moonBright, stampWet.moonBright), "moonBright mid-fade");
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

// Blended TOD used to LEAK night cityGlow into day/dusk/dawn: _mixv(b==null)
// returned the FROM array for the whole fade (including s=1), and _writeWx
// skipped null writes — so the light-pollution dome never cleared. Cut path
// was fine (stars already snap; this is the skyglow twin of that qatar bug).
test("a blended night→day/dusk/dawn clears city skyglow instead of leaking it", () => {
  const glowLum = (g) => (g ? g[0] + g[1] + g[2] : 0);
  for (const to of ["day", "dusk", "dawn"]) {
    const { G, atmo } = boot("singapore");
    G.track.def.theme = "street_night";
    G.raceTimeOfDay = "night";
    atmo.applyRaceSettings();
    const nightGlow = glowLum(G.frameSky.cityGlow);
    assert.ok(nightGlow > 0.01, `${to}: night must author a cityGlow dome`);

    G.raceTimeOfDay = to;
    atmo.applyRaceSettings(true);
    assert.ok(Math.abs(glowLum(G.frameSky.cityGlow) - nightGlow) < 1e-6, `${to}: fade starts on the night dome`);
    atmo.tick(atmo.WX_BLEND_S / 2);
    const mid = glowLum(G.frameSky.cityGlow);
    assert.ok(mid > 0 && mid < nightGlow - 1e-6, `${to}: mid-fade skyglow ${mid} did not ease toward clear`);
    atmo.tick(atmo.WX_BLEND_S);
    assert.equal(G.frameSky.cityGlow, null, `${to}: blended land must clear cityGlow like a cut`);
    assert.equal(atmo.wxBlend(), null);

    const cut = boot("singapore");
    cut.G.track.def.theme = "street_night";
    cut.G.raceTimeOfDay = to;
    cut.atmo.applyRaceSettings();
    assert.equal(cut.G.frameSky.cityGlow, null, `${to}: cut path still clears`);
  }
});

test("a blended day→night fades city skyglow in from clear", () => {
  const { G, atmo } = boot("singapore");
  G.track.def.theme = "street_night";
  G.raceTimeOfDay = "day";
  atmo.applyRaceSettings();
  assert.equal(G.frameSky.cityGlow, null);
  const night = boot("singapore");
  night.G.track.def.theme = "street_night";
  night.G.raceTimeOfDay = "night";
  night.atmo.applyRaceSettings();
  const nightGlow = night.G.frameSky.cityGlow[0] + night.G.frameSky.cityGlow[1] + night.G.frameSky.cityGlow[2];

  G.raceTimeOfDay = "night";
  atmo.applyRaceSettings(true);
  assert.equal(G.frameSky.cityGlow, null, "fade starts clear (no snap-on dome)");
  atmo.tick(atmo.WX_BLEND_S / 2);
  const mid = G.frameSky.cityGlow;
  assert.ok(mid && mid[0] + mid[1] + mid[2] > 0, "mid-fade has a partial dome");
  assert.ok(mid[0] + mid[1] + mid[2] < nightGlow - 1e-6, "mid-fade is below the night end");
  atmo.tick(atmo.WX_BLEND_S);
  assert.ok(Math.abs((G.frameSky.cityGlow[0] + G.frameSky.cityGlow[1] + G.frameSky.cityGlow[2]) - nightGlow) < 1e-6,
    "lands on the night dome");
});

test("day FOG weather is opaque by ~500 m and its horizon IS the fog colour (survey: 'fog hazes ground only')", () => {
  const { G, atmo, LT } = boot();
  G.raceTimeOfDay = "day"; G.raceWeather = "fog";
  atmo.applyRaceSettings();
  const d = G.frame.fogDensity * LT.fogDensityMul, fd = 500 * d;
  assert.ok(1 - Math.exp(-fd * fd) > 0.97, `exp² haze at 500 m must be >97 %, density ${d}`);
  assert.deepEqual(host(G.frameSky.horizon), host(G.frame.fogColor), "sky horizon meets the fog colour seamlessly");
});

// Gallery D (#2256): every shipped `<track>|<tod>|fog` row pins fogDensityMul ~2 on top of
// FOG BOOST, and the renderers multiply the two — a fog session ran 0.011-0.026 effective
// (white within ~150 m). The EFFECTIVE density (frame.fogDensity x LT.fogDensityMul, what the
// shaders and the chunk cull use) must sit in the floor..ceiling band at the default boost.
test("FOG weather effective density stays in the readable band on shipped presets (#2256)", () => {
  const seen = [];
  for (const id of ["spa", "qatar", "monza", "singapore"]) {
    for (const tod of ["dawn", "day", "dusk", "night"]) {
      const { G, atmo, LT } = boot(id);
      G.frame.fogDensity = id === "spa" ? 0.0043 : 0.0017;   // spa's measured dawn base; a mid base elsewhere
      G.raceTimeOfDay = tod; G.raceWeather = "fog";
      atmo.applyRaceSettings();
      const eff = G.frame.fogDensity * (LT.fogDensityMul != null ? LT.fogDensityMul : 1);
      const at = (m) => 1 - Math.exp(-(m * eff) * (m * eff));
      seen.push(`${id}|${tod} ${eff.toFixed(5)}`);
      assert.ok(at(500) > 0.97, `${id}|${tod}|fog not opaque by 500 m (eff ${eff})`);
      assert.ok(at(150) < 0.65, `${id}|${tod}|fog is a white wall by 150 m (eff ${eff})`);
      // Bryce 2026-10-21: a 0.0042 floor (16 % at 100 m) read as plain overcast.
      assert.ok(at(150) > 0.5, `${id}|${tod}|fog does not read as fog by 150 m (eff ${eff})`);
    }
  }
  assert.equal(seen.length, 16);
});

test("FOG BOOST still scales fog: the band follows the knob, so pea-soup stays reachable", () => {
  const eff = (boost) => {
    const { G, atmo, LT, ltStore } = boot("spa");
    G.frame.fogDensity = 0.0043; G.raceTimeOfDay = "day"; G.raceWeather = "fog";
    ltStore.set("fogWxMul", boost); atmo.applyRaceSettings();
    return G.frame.fogDensity * LT.fogDensityMul;
  };
  assert.ok(eff(2.75) > eff(1.5) * 1.6, `FOG BOOST max must thicken well past the default (${eff(2.75)} vs ${eff(1.5)})`);
});

test("dawn/dusk FOG: horizon IS the fog colour and the zenith is pulled to it (#2257)", () => {
  for (const tod of ["dawn", "dusk"]) {
    const { G, atmo } = boot();
    G.raceTimeOfDay = tod; G.raceWeather = "fog";
    atmo.applyRaceSettings();
    const fc = G.frame.fogColor, z = G.frameSky.zenith;
    assert.deepEqual(host(G.frameSky.horizon), host(fc), `${tod}: horizon must meet the fog colour`);
    const dist = Math.hypot(z[0] - fc[0], z[1] - fc[1], z[2] - fc[2]);
    assert.ok(dist < 0.12, `${tod}: zenith ${JSON.stringify(host(z))} stays a clear-sky colour over fog ${JSON.stringify(host(fc))}`);
  }
});

test("NIGHT fog keeps its dark sky (the twilight fog deck must not reach it)", () => {
  const { G, atmo } = boot();
  G.raceTimeOfDay = "night"; G.raceWeather = "fog";
  atmo.applyRaceSettings();
  const z = G.frameSky.zenith;
  assert.ok(Math.max(...z) < 0.2, `night fog zenith lifted to ${JSON.stringify(host(z))}`);
});

test("day OVERCAST fog colour follows the grey deck, not the clear-sky blue", () => {
  const { G, atmo } = boot();
  G.raceTimeOfDay = "day"; G.raceWeather = "overcast";
  atmo.applyRaceSettings();
  const f = G.frame.fogColor;
  assert.ok(f[2] - f[0] < 0.12, `overcast fog must be near-neutral grey, got ${JSON.stringify(host(f))}`);
});

test("FOG ground mist out-thickens every other weather and clears the shaders' fill gate", () => {
  // Bryce 2026-10-21: fog must read close in. glsl-lit/tsl-lit/wgsl-chunks fill the
  // mist patches from 1.1 x MIST DENSITY up; other weathers stay under the 0.7 cap.
  for (const id of ["monza", "monaco", "spa", "bahrain"]) {
    const mist = (wx) => { const { G, atmo } = boot(id); G.raceTimeOfDay = "day"; G.raceWeather = wx; atmo.applyRaceSettings(); return G.frame.groundMist; };
    const fog = mist("fog");
    for (const wx of ["dry", "wet", "rain", "storm", "overcast"]) {
      const m = mist(wx);
      assert.ok(m <= 0.7, `${id} day ${wx}: ground mist ${m} above the non-fog cap`);
      assert.ok(fog > m, `${id} day fog mist ${fog} must exceed ${wx} ${m}`);
    }
    assert.ok(fog >= 0.6, `${id} day fog mist ${fog} too thin for the fill gate`);
    // Bryce 2026-10-22: a night fog keeps round 1's lighter mist (lamp glow stays down).
    const { G, atmo } = boot(id); G.raceTimeOfDay = "night"; G.raceWeather = "fog"; atmo.applyRaceSettings();
    assert.ok(G.frame.groundMist <= 0.7, `${id} night fog mist ${G.frame.groundMist} must stay under the non-fog cap`);
  }
});
