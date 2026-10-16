// ambient-env-override — the asset pack's WILDCARD environment never replaces a
// circuit's authored ambient.
//
// Atmosphere.applyRaceSettings() copies the pack's baked environment
// (ambientSky/ambientGround/zenith/horizon) over the time-of-day base. It looks
// up "<track>|<tod>" then "*|<tod>", and the shipped pack carries ONLY the
// wildcard keys — one procedural grey (tools/gen/assets.mjs). Until 2026-10-01
// that grey replaced the palette ambient of every circuit that authored one, on
// every non-night "default" race: forty circuits' lighting authoring was dead
// and Bahrain, Spa and Monaco shared one ambient (the second graphics-detail
// survey). The rule now: a wildcard hit fills in only what the palette did not
// author; an exact "<track>|<tod>" key is a measurement of that circuit and
// still overrides.
//
// Run: node --test tests/unit/ambient-env-override.test.mjs  (npm run test:tooling-fast)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const ENV_WILD = { ambientSky: [0.369, 0.374, 0.386], ambientGround: [0.071, 0.092, 0.125],
                   skyZenith: [0.2, 0.3, 0.6], skyHorizon: [0.6, 0.6, 0.7] };
const ENV_EXACT = { ambientSky: [0.5, 0.2, 0.2], ambientGround: [0.2, 0.05, 0.05] };

// Boot atmosphere.js in a VM with the real knob defaults and the pack stubbed.
function run({ env, palette, tod = "default" }) {
  const Math2 = Object.assign(Object.create(Math), { random: () => 0.5 });
  const sandbox = {
    Math: Math2, console,
    Assets: { env: (id, t) => env[id + "|" + t] || env["*|" + t] || null },
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
    satAdjust: (c) => c, isRaining: () => false, isWetRoad: () => false, isFloodActiveSession: () => false,
    _nightAmbientBand: () => 0, applyLightTune: () => {},
    // loadTrack seeds these once; applyRaceSettings only refines them.
    frame: { ambientSky: [0.3, 0.3, 0.3], ambientGround: [0.1, 0.1, 0.1], sunDir: [0, 1, 0], sunColor: [1, 1, 1], fogColor: [0.5, 0.5, 0.5] },
    frameSky: { zenith: [0.1, 0.2, 0.5], horizon: [0.6, 0.7, 0.8], sunDir: [0, 1, 0], sunColor: [1, 1, 1] },
    gfx: null, state: "menu",
    raceTimeOfDay: tod, raceWeather: "dry",
    track: { def: { id: "testtrack", night: false, palette } },
  };
  const Atmosphere = vm.runInContext("Atmosphere", sandbox);
  Atmosphere.create(G).applyRaceSettings();
  return G;
}

const PAL = { sunDir: [0.4, 0.7, 0.3], sunColor: [1, 0.95, 0.9], sun: [1, 0.95, 0.9],
              ambientSky: [0.26, 0.33, 0.50], ambientGround: [0.24, 0.19, 0.12],
              zenith: [0.1, 0.3, 0.8], horizon: [0.7, 0.8, 0.9] };

test("a wildcard environment leaves an authored palette ambient alone on the default time of day", () => {
  const bare = run({ env: {}, palette: PAL });
  const wild = run({ env: { "*|default": ENV_WILD }, palette: PAL });
  assert.deepEqual(wild.frame.ambientSky, bare.frame.ambientSky, "ambientSky was replaced by the pack's generic grey");
  assert.deepEqual(wild.frame.ambientGround, bare.frame.ambientGround, "ambientGround was replaced by the pack's generic grey");
  assert.deepEqual(wild.frameSky.zenith, bare.frameSky.zenith, "the authored zenith was replaced");
  assert.deepEqual(wild.frameSky.horizon, bare.frameSky.horizon, "the authored horizon was replaced");
  // ...and the authored values actually reached the frame (not vacuous).
  assert.notDeepEqual(bare.frame.ambientSky, ENV_WILD.ambientSky);
});

test("a wildcard environment fills in what the palette did not author", () => {
  const { ambientSky, ambientGround, ...noAmbient } = PAL;
  const bare = run({ env: {}, palette: noAmbient });
  const wild = run({ env: { "*|default": ENV_WILD }, palette: noAmbient });
  assert.notDeepEqual(wild.frame.ambientSky, bare.frame.ambientSky, "the pack should supply ambientSky when the palette has none");
  assert.notDeepEqual(wild.frame.ambientGround, bare.frame.ambientGround, "the pack should supply ambientGround when the palette has none");
  assert.deepEqual(wild.frameSky.zenith, bare.frameSky.zenith, "the authored zenith must still win");
});

test("an exact <track>|<tod> key still overrides the authored palette (it is that circuit's measurement)", () => {
  const bare = run({ env: {}, palette: PAL });
  const exact = run({ env: { "*|default": ENV_WILD, "testtrack|default": ENV_EXACT }, palette: PAL });
  assert.notDeepEqual(exact.frame.ambientSky, bare.frame.ambientSky, "the exact key did not override");
  assert.notDeepEqual(exact.frame.ambientGround, bare.frame.ambientGround, "the exact key did not override");
});

test("on an explicit time of day the wildcard still replaces the formula base (nothing was authored there)", () => {
  const bare = run({ env: {}, palette: PAL, tod: "day" });
  const wild = run({ env: { "*|day": ENV_WILD }, palette: PAL, tod: "day" });
  assert.notDeepEqual(wild.frame.ambientSky, bare.frame.ambientSky, "the day base is a formula, the pack should still refine it");
});
