// Weather-blend ticks must not build a new sun-colour array every frame, and
// the sun-direction helpers must publish one scratch vector. Numbers stay on
// the old formulas (V3.norm for azimuth, the elev/azim rebuild). VM.
// Run: node --test tests/unit/lighting-sun-scratch.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const read = (f) => fs.readFileSync(new URL("../../" + f, import.meta.url), "utf8");
const plain = (v) => JSON.parse(JSON.stringify(v));

function boot() {
  const sandbox = {
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }), console,
    LampBake: { prebake: () => null, budget: () => 0, forTrack: () => null },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: {}, document: { getElementById: () => null },
  };
  vm.createContext(sandbox);
  for (const f of ["js/core/log.js", "js/core/mat4.js", "js/lighting/knobs.js", "js/lighting/atmosphere.js"])
    vm.runInContext(read(f), sandbox, { filename: absSrc(f) });
  vm.runInContext("LightTune = { LT: LightKnobs.LT, TUNE_DEFS: LightKnobs.TUNE_DEFS, buildTrackLights: () => [] };", sandbox);
  const G = {
    clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    satAdjust: (c) => c, isRaining: () => G.raceWeather === "rain" || G.raceWeather === "storm",
    isWetRoad: () => G.raceWeather === "wet" || G.raceWeather === "rain" || G.raceWeather === "storm",
    isFloodActiveSession: () => false, _nightAmbientBand: () => 0, applyLightTune: () => {},
    frame: { ambientSky: [0.3, 0.3, 0.3], ambientGround: [0.1, 0.1, 0.1], sunDir: [0, 1, 0], sunColor: [1, 1, 1], fogColor: [0.5, 0.5, 0.5], fogDensity: 0.0016 },
    frameSky: { zenith: [0.1, 0.2, 0.5], horizon: [0.6, 0.7, 0.8], sunDir: [0, 1, 0], sunColor: [1, 1, 1], cloud: 0.4 },
    gfx: null, state: "race", raceTimeOfDay: "day", raceWeather: "dry",
    track: { def: { id: "spa", night: false, palette: {
      sunDir: [0.4, 0.7, 0.3], sunColor: [1, 0.95, 0.9], sun: [1, 0.95, 0.9],
      ambientSky: [0.26, 0.33, 0.50], ambientGround: [0.24, 0.19, 0.12],
      zenith: [0.1, 0.3, 0.8], horizon: [0.7, 0.8, 0.9],
    } } },
  };
  const atmo = vm.runInContext("Atmosphere", sandbox).create(G);
  const LT = vm.runInContext("LightKnobs.LT", sandbox);
  return { sandbox, G, atmo, LT };
}

function countMaps(sandbox, fn) {
  vm.runInContext("globalThis.__maps = 0; if (!globalThis.__map0) { globalThis.__map0 = Array.prototype.map; Array.prototype.map = function () { globalThis.__maps++; return globalThis.__map0.apply(this, arguments); }; }", sandbox);
  sandbox.__maps = 0;
  try { fn(); return sandbox.__maps; }
  finally { vm.runInContext("Array.prototype.map = globalThis.__map0; globalThis.__map0 = undefined;", sandbox); }
}

// The shipped azimuth: atan2(x + bias, z), keep |xz| and y, then normalise.
function sunDirAz(base, xBias) {
  const az = Math.atan2(base[0] + xBias, base[2]);
  const h = Math.hypot(base[0], base[2]);
  const x = h * Math.sin(az), y = base[1], z = h * Math.cos(az);
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}
function near(a, b, msg) {
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-12, `${msg}[${i}]: ${v} vs ${b[i]}`));
}

test("a weather-blend tick reuses the sun-colour arrays and does not call Array.map", () => {
  const { sandbox, G, atmo } = boot();
  atmo.applyRaceSettings();
  G.raceWeather = "rain";
  atmo.applyRaceSettings(true);
  const sun = G.frame.sunColor, sky = G.frameSky.sunColor, amb = G.frame.ambientSky;
  const start = plain(sun), skyStart = plain(sky);
  const maps = countMaps(sandbox, () => {
    atmo.tick(atmo.WX_BLEND_S / 2);
    assert.equal(G.frame.sunColor, sun, "frame sunColour is the same array");
    assert.equal(G.frameSky.sunColor, sky, "sky sunColour is the same array");
    assert.equal(G.frame.ambientSky, amb, "ambient reuses its array too");
    const mid = plain(sun), skyMid = plain(sky);
    atmo.tick(atmo.WX_BLEND_S);
    assert.equal(G.frame.sunColor, sun);
    assert.equal(G.frameSky.sunColor, sky);
    assert.equal(G.frame.skyHorizon, G.frameSky.horizon, "horizon alias survives the in-place mix");
    const end = plain(sun), skyEnd = plain(sky);
    assert.ok(end.reduce((s, v) => s + v, 0) < start.reduce((s, v) => s + v, 0) - 1e-6, "rain still mutes the sun");
    near(mid, start.map((v, i) => v + (end[i] - v) * 0.5), "frame sun at the halfway smoothstep");
    near(skyMid, skyStart.map((v, i) => v + (skyEnd[i] - v) * 0.5), "sky sun at the halfway smoothstep");
    assert.equal(atmo.wxBlend(), null);
  });
  assert.equal(maps, 0, "tick must not Array.map a colour");
});

test("dawn sunDir is one scratch, and sunElev still offsets it", () => {
  const { G, atmo, LT } = boot();
  G.raceTimeOfDay = "dawn";
  atmo.applyRaceSettings();
  const dir = G.frame.sunDir;
  assert.equal(G.frameSky.sunDir, dir);
  // spa bias 0.85 → dawn azimuth (bias*0.28 - 0.14), passed negated.
  const dawn = sunDirAz([-0.62, 0.08, 0.28], -((0.85 * 0.28) - 0.14));
  near(plain(dir), dawn, "dawn direction");
  atmo.applyRaceSettings();
  assert.equal(G.frame.sunDir, dir, "a second apply reuses the scratch");
  assert.equal(G.frameSky.sunDir, dir);

  LT.sunElev = 8;
  atmo.applyRaceSettings();
  assert.equal(G.frame.sunDir, dir, "sunElev writes the same scratch");
  const el = Math.asin(Math.min(1, Math.max(-1, dawn[1]))) + 8 * Math.PI / 180;
  const az = Math.atan2(dawn[0], dawn[2]);
  const ce = Math.cos(el);
  near(plain(dir), [ce * Math.sin(az), Math.sin(el), ce * Math.cos(az)], "sunElev offset");
  LT.sunElev = 0;
});
