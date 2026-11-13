// weather-arc-wetness-memo — static weather runs the wetness chain once (#5055).
//
// js/race/weather-arc.js wetness() with no arc was wetOf → asRain →
// TyreModel.wetness on EVERY call. gripMult (per car), wetnessAt (per car) and
// race-control lowGrip (~200×/step on a full grid) all read it, so the chain
// ran ~298×/step in the game VM at monza (measured, PR body). The memo is keyed
// on the weather enum, so a weather change, a set arc or a nulled arc can never
// read a stale value, and the returned numbers are the same floats.
//
// The real weather-arc.js in a VM with a counting TyreModel stub. No browser.
//
// Run: node --test tests/unit/weather-arc-wetness-memo.test.mjs  (npm run test:tooling-fast)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/race/weather-arc.js"), "utf8").replace(/^const\b/gm, "var");

function boot() {
  const ctx = vm.createContext({ Math, Number, Object, Array, JSON });
  ctx.window = ctx;
  seedLog(ctx);
  const calls = { wetness: 0 };
  const wetValue = (w) => (w === "rain" || w === "storm" ? 1 : w === "wet" ? 0.5 : 0);
  ctx.TyreModel = {
    wetness(w, arc) { calls.wetness++; return arc ? NaN : wetValue(w); },
    treadFor: (_w, x) => (x >= 0.72 ? 2 : x >= 0.25 ? 1 : 0),
  };
  ctx.Particles = { rainShow() {} };
  vm.runInContext(SRC, ctx, { filename: absSrc("js/race/weather-arc.js") });
  const G = {
    state: "race", flow: "single", season: null, seasonMode: false,
    raceWeather: "dry", raceRound: 0, raceLaps: 25, lapsTarget: 25,
    track: { total: 5800 }, soundOn: false,
    simSeed: () => 1, netPlay: { active: () => false },
    announce() {}, applyRaceSettings() {}, isWetRoad: () => false, isRaining: () => false,
    initRainDrops() {},
  };
  const wa = ctx.WeatherArc.create(G, { isTimeTrial: () => false, isQuali: () => false });
  return { G, wa, calls };
}

test("static weather: wetness() runs the TyreModel chain once, not per call", () => {
  const { wa, calls } = boot();
  for (let i = 0; i < 300; i++) assert.equal(wa.wetness(), 0);
  assert.ok(calls.wetness <= 2, `TyreModel.wetness ran ${calls.wetness}× for 300 static reads (want ≤ 2)`);
});

test("the memo follows the weather enum: a change is read on the next call", () => {
  const { G, wa } = boot();
  assert.equal(wa.wetness(), 0);
  G.raceWeather = "wet"; assert.equal(wa.wetness(), 0.5);
  G.raceWeather = "storm"; assert.equal(wa.wetness(), 1, "a storm is rain on the road (asRain)");
  G.raceWeather = "dry"; assert.equal(wa.wetness(), 0);
});

test("setting and nulling an arc never leaves a stale static value", () => {
  const { G, wa } = boot();
  G.raceWeather = "rain";
  assert.equal(wa.wetness(), 1);
  wa.arc = { from: "rain", to: "dry", t: 0, dur: 60 };
  assert.ok(Number.isFinite(wa.wetness()), "the arc path answers, not the memo");
  wa.arc = null;   // the setter re-applies G.raceWeather
  G.raceWeather = "dry";
  assert.equal(wa.wetness(), 0);
});
