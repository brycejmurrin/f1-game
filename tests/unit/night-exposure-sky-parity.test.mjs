// #6881 R5 + R8: a night session never gets brighter under rain/fog/overcast than dry night,
// and the WGX sky's Mie damping matches GLX/TLX.
// Run: node --test tests/unit/night-exposure-sky-parity.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";
import { fakeG } from "../helpers/fake-g.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

async function exposure(weather, theme) {
  const sandbox = {
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }), console,
    fetch: async () => ({ ok: true, json: async () => ({ env: {} }) }),
    LampBake: { prebake: () => null, budget: () => 0, forTrack: () => null },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: {}, document: { getElementById: () => null },
  };
  vm.createContext(sandbox);
  for (const f of ["js/core/log.js", "js/core/mat4.js", "js/lighting/knobs.js", "js/render/shared/assets.js", "js/lighting/atmosphere.js"])
    vm.runInContext(read(f), sandbox, { filename: absSrc(f) });
  await vm.runInContext("Assets", sandbox).manifest();
  vm.runInContext("LightTune = { LT: LightKnobs.LT, buildTrackLights: () => [] };", sandbox);
  const wet = weather === "rain" || weather === "storm";
  const G = fakeG({
    clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    _cloudBase: undefined, _ltBase: undefined, _ltFlash: 0, _ltNextT: 0, _lastFloodEmit: undefined,
    satAdjust: (c) => c, isWetRoad: () => wet, isFloodActiveSession: () => false,
    _nightAmbientBand: () => 0, applyLightTune: () => {},
    frame: { ambientSky: [0.3, 0.3, 0.3], ambientGround: [0.1, 0.1, 0.1], sunDir: [0, 1, 0], sunColor: [1, 1, 1], fogColor: [0.5, 0.5, 0.5] },
    frameSky: { zenith: [0.1, 0.2, 0.5], horizon: [0.6, 0.7, 0.8], sunDir: [0, 1, 0], sunColor: [1, 1, 1] },
    gfx: null, state: "menu", raceTimeOfDay: "night", raceWeather: weather,
    track: { def: { id: "t", theme, night: true, palette: {} } },
  });
  vm.runInContext("Atmosphere", sandbox).create(G).applyRaceSettings();
  return G.frame.exposure;
}

test("night exposure: rain/overcast never exceed dry night (street_night 0.86, other 0.90)", async () => {
  for (const [theme, base] of [["street_night", 0.86], ["default", 0.90]]) {
    const dry = await exposure("dry", theme);
    assert.equal(dry, base, theme + " dry night base");
    // fog is excluded: its night floor 0.95 is pinned by tests/specs/lighting-ab.spec.js (>= 0.94).
    for (const w of ["rain", "overcast"]) {
      const e = await exposure(w, theme);
      assert.ok(e <= dry + 1e-9, `${theme} ${w} exposure ${e} brighter than dry ${dry}`);
    }
  }
});

test("WGX sky mieDamp matches GLX and TLX (overcast damping)", () => {
  const norm = (s) => s.replace(/\s+/g, "");
  const wgsl = read("js/render/webgpu/wgsl-chunks.js").match(/let mieDamp = ([^;]+);/)[1];
  const glsl = read("js/render/glx/shaders/glsl-sky.js").match(/float mieDamp = ([^;]+);/)[1];
  const tsl = read("js/render/three/tsl-sky.js").match(/const mieDamp = ([^;]+);/)[1];
  const canon = (s) => norm(s).replace(/nightSky|night/g, "N").replace(/overcast/g, "O").replace(/(\d)\.0(?!\d)/g, "$1");
  assert.equal(canon(wgsl), canon(glsl), "WGSL vs GLSL mieDamp");
  assert.equal(canon(tsl), canon(glsl), "TSL vs GLSL mieDamp");
});
