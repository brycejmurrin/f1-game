// Day sky follows the circuit palette; day storm is visibly darker and denser than day rain
// (engine-weather-light-a1). Runs the REAL js/lighting/atmosphere.js (applyRaceSettings)
// in a VM and asserts the frame it produces — no text scan of the source.
// Run: node --test tests/unit/day-sky-palette-storm-deck.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = (f) => fs.readFileSync(new URL("../../" + f, import.meta.url), "utf8");
const plain = (v) => JSON.parse(JSON.stringify(v));        // arrays minted in another vm realm
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

function run({ palette, tod = "day", weather = "dry", night = false }) {
  const sandbox = {
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }), console,
    LampBake: { prebake: () => null, budget: () => 0, forTrack: () => null },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: {}, document: { getElementById: () => null },
  };
  vm.createContext(sandbox);
  for (const f of ["js/core/log.js", "js/core/mat4.js", "js/lighting/knobs.js", "js/lighting/atmosphere.js"])
    vm.runInContext(read(f), sandbox, { filename: f });
  vm.runInContext("LightTune = { LT: LightKnobs.LT, buildTrackLights: () => [] };", sandbox);
  const wet = weather === "rain" || weather === "storm";
  const G = {
    clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    satAdjust: (c) => c, isRaining: () => wet, isWetRoad: () => wet, isFloodActiveSession: () => false,
    _nightAmbientBand: () => 0, applyLightTune: () => {},
    frame: { ambientSky: [0.3, 0.3, 0.3], ambientGround: [0.1, 0.1, 0.1], sunDir: [0, 1, 0], sunColor: [1, 1, 1], fogColor: [0.5, 0.5, 0.5], fogDensity: 0.0016 },
    frameSky: { zenith: [0.1, 0.2, 0.5], horizon: [0.6, 0.7, 0.8], sunDir: [0, 1, 0], sunColor: [1, 1, 1] },
    gfx: null, state: "menu", raceTimeOfDay: tod, raceWeather: weather,
    track: { def: { id: "testtrack", night, palette } },
  };
  vm.runInContext("Atmosphere", sandbox).create(G).applyRaceSettings();
  return { zenith: plain(G.frameSky.zenith), horizon: plain(G.frameSky.horizon), fog: plain(G.frame.fogColor),
           fogDensity: G.frame.fogDensity, sky: G.frame.skyZenith && plain(G.frame.skyZenith) };
}

const BRIGHT = { zenith: [0.20, 0.45, 0.90], horizon: [0.80, 0.88, 0.95], fog: [0.70, 0.80, 0.90],
                 sunDir: [0.4, 0.7, 0.3], sunColor: [1, 0.95, 0.9], sun: [1, 0.95, 0.9] };
const DUSKY = { ...BRIGHT, zenith: [0.05, 0.05, 0.15], horizon: [0.30, 0.18, 0.12] };   // luminance < 0.45
const near = (a, b, msg) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9, `${msg}[${i}]: ${v} vs ${b[i]}`));

test("explicit day blends the circuit palette sky half-way in, skipping night-authored palettes", () => {
  const base = run({ palette: undefined });                  // the formula day sky
  const lit = run({ palette: BRIGHT });
  near(lit.zenith, base.zenith.map((v, i) => v + (BRIGHT.zenith[i] - v) * 0.5), "zenith is midway to the palette");
  near(lit.horizon, base.horizon.map((v, i) => v + (BRIGHT.horizon[i] - v) * 0.5), "horizon is midway to the palette");
  near(lit.fog, base.fog.map((v, i) => v + (BRIGHT.fog[i] - v) * 0.5), "fog is midway to the palette fog");
  assert.notDeepEqual(lit.zenith, base.zenith, "fixture: the palette must change the sky");
  const dark = run({ palette: DUSKY });
  assert.deepEqual(dark.zenith, base.zenith, "a dusk/night-authored palette must not tint a day sky");
  assert.deepEqual(dark.horizon, base.horizon);
});

test("day storm is darker and denser than rain", () => {
  const rain = run({ palette: BRIGHT, weather: "rain" }), storm = run({ palette: BRIGHT, weather: "storm" });
  assert.ok(lum(storm.horizon) < 0.95 * lum(rain.horizon), `storm horizon ${lum(storm.horizon).toFixed(3)} vs rain ${lum(rain.horizon).toFixed(3)}`);
  assert.ok(lum(storm.zenith) < 0.95 * lum(rain.zenith), "storm zenith darker than rain");
  assert.ok(lum(storm.fog) < lum(rain.fog), "storm fog darker than rain fog");
  assert.ok(storm.fogDensity > 2 * rain.fogDensity, `storm haze ${storm.fogDensity} vs rain ${rain.fogDensity}`);
});

test("a night session's storm keeps the near-black deck, not the day-storm slate", () => {
  const night = run({ palette: BRIGHT, tod: "night", weather: "storm", night: true });
  const day = run({ palette: BRIGHT, weather: "storm" });
  assert.ok(lum(night.horizon) < 0.5 * lum(day.horizon), "night storm sky is far darker than day storm");
});

test("fog in-scatter sun colour is capped (divided by max(1, brightest channel)) in all three backends", () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const want = {
    "js/render/glx/shaders/glsl-lit.js": /vec3 fogSun = uSunColor \/ max\(1\.0, max\(uSunColor\.r, max\(uSunColor\.g, uSunColor\.b\)\)\);/,
    "js/render/webgpu/wgsl-chunks.js": /let fogSun = F\.sunColor\.xyz \/ max\(1\.0, max\(F\.sunColor\.x, max\(F\.sunColor\.y, F\.sunColor\.z\)\)\);/,
    "js/render/three/tsl-lit.js": /const fogSun = vec3\(U\.sunColor\)\.div\(max\(float\(1\.0\), max\(U\.sunColor\.x, max\(U\.sunColor\.y, U\.sunColor\.z\)\)\)\);/,
  };
  for (const [f, re] of Object.entries(want)) assert.match(strip(read(f)), re, f + ": fogSun cap declaration");
});
