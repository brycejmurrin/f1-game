// weather-blend — a weather-arc step cross-fades the session lighting; a chip
// or __apex.weather() still cuts.
//
// applyRaceSettings(blendS) snapshots what the frame showed, computes the new
// weather, and tick(dt) walks sun colour, cloud cover, ambient, fog and
// exposure from the one to the other over blendS seconds (true = WX_BLEND_S,
// what js/race/weather-arc.js passes from its arc). Until 2026-10-01 only the
// wetness ramp and the rain overlay interpolated; everything else stepped
// (the second graphics-detail survey, item 11). atmosphere.js in a VM with the
// real knob defaults, the same harness as ambient-env-override.
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

function boot() {
  const sandbox = {
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }), console,
    Assets: { env: () => null },
    LampBake: { prebake: () => null, budget: () => 0, forTrack: () => null },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: {}, document: { getElementById: () => null },
  };
  vm.createContext(sandbox);
  for (const f of ["js/core/log.js", "js/core/mat4.js", "js/lighting/knobs.js", "js/lighting/atmosphere.js"])
    vm.runInContext(read(f), sandbox, { filename: f });
  vm.runInContext("LightTune = { LT: LightKnobs.LT, buildTrackLights: () => [] };", sandbox);
  const G = {
    clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    satAdjust: (c) => c, isRaining: () => G.raceWeather === "rain", isWetRoad: () => G.raceWeather === "rain" || G.raceWeather === "wet",
    isFloodActiveSession: () => false, _nightAmbientBand: () => 0, applyLightTune: () => {},
    frame: { ambientSky: [0.3, 0.3, 0.3], ambientGround: [0.1, 0.1, 0.1], sunDir: [0, 1, 0], sunColor: [1, 1, 1], fogColor: [0.5, 0.5, 0.5] },
    frameSky: { zenith: [0.1, 0.2, 0.5], horizon: [0.6, 0.7, 0.8], sunDir: [0, 1, 0], sunColor: [1, 1, 1] },
    gfx: null, state: "race", raceTimeOfDay: "default", raceWeather: "dry",
    track: { def: { id: "t", night: false, palette: { sunDir: [0.4, 0.7, 0.3], sunColor: [1, 0.95, 0.9], sun: [1, 0.95, 0.9],
      ambientSky: [0.26, 0.33, 0.50], ambientGround: [0.24, 0.19, 0.12], zenith: [0.1, 0.3, 0.8], horizon: [0.7, 0.8, 0.9] } } },
  };
  const atmo = vm.runInContext("Atmosphere", sandbox).create(G);
  return { G, atmo };
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
