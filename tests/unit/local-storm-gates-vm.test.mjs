/* local-storm-gates-vm.test.mjs — #6891 (#6881 R1 + R3): lightning/thunder and the wet-car SFX read the
 * view's own sky and surface, not the lap-mean wetness, so a local storm cell under the player strikes
 * and sounds wet while the lap mean stays below the rain tier (and a cell away from the player does not).
 *
 * Run: node --test tests/unit/local-storm-gates-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";
const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");

async function cellRace() {
  const race = await createGame({ storage: { tyreWear: "real", reliability: "off" } });
  const { G } = race;
  G.seed = 1; G.raceChangeable = true; G.wxArcPlan = { to: "rain", dur: 150 };
  await race.race("monza", "day", "dry", { laps: 40 });
  G.weatherArc.t = 140; race.step(1, 0);
  race.apex.go(); race.apex.headless(true);
  return race;
}

function spots(G) {
  let wetS = null, dryS = null;
  const n = 400;
  for (let i = 0; i < n; i++) {
    const s = G.track.total * i / n, c = { s, x: 0 };
    G.player.s = s;
    if (G.viewRainfall() >= 0.72 && G.isWetAt(c)) wetS ??= s;
    if (G.viewRainfall() < 0.05 && !G.isWetAt(c)) dryS ??= s;
  }
  return { wetS, dryS };
}

test("a local storm cell under the player strikes lightning while the lap mean is below the rain tier", async () => {
  const race = await cellRace();
  try {
    const { G } = race;
    assert.ok(G.weatherArc.cell, "Monza's shower is a local cell");
    assert.ok(G.trackWetness() < 0.72, "the lap mean is below the rain tier: " + G.trackWetness());
    const { wetS, dryS } = spots(G);
    assert.ok(wetS != null && dryS != null, "a cell spot and a dry spot exist " + wetS + " " + dryS);
    const strikes = (s) => {   // a render frame every half second, the car held at `s` (the storm-vm pattern)
      G._ltFlash = 0; let max = 0;
      for (let t = 0; t < 300; t += 0.5) {
        G.player.s = s; if (G.weatherArc) G.weatherArc.t = 140; race.apex.step(1 / 60, 30); race.apex.snapCam(true);
        max = Math.max(max, G._ltFlash);
      }
      return max;
    };
    assert.ok(strikes(wetS) > 0.5, "lightning under the cell");
    assert.equal(strikes(dryS), 0, "none outside it");
  } finally { race.close(); }
});

test("the wet-car SFX follows the surface under the car, not the lap mean", async () => {
  const race = await cellRace();
  try {
    const { G } = race;
    const { wetS, dryS } = spots(G);
    assert.equal(G.isWetAt({ s: wetS, x: 0 }), true);
    assert.equal(G.isWetAt({ s: dryS, x: 0 }), false, "dry stretch of a wet lap mean");
  } finally { race.close(); }
});

test("CarSfx sends wet from the car's own surface (isWetAt), not the lap-mean isWetRoad", () => {
  const sent = [];
  const sb = { GameAudio: { setCarSfx: (o) => sent.push({ ...o }), pitGun() {} }, performance: { now: () => 0 } };
  const vctx = vm.createContext(sb);
  vm.runInContext(readFileSync(absSrc("js/audio/car-sfx.js"), "utf8"), vctx, { filename: absSrc("js/audio/car-sfx.js") });
  const G = { vTop: () => 100, raceT: 0, pits: null, isWetRoad: () => false, isWetAt: (c) => c.s > 500 };
  const S = vm.runInContext("CarSfx", vctx).create(G);
  S.update({ s: 900, x: 0, speed: 50 });
  assert.equal(sent.at(-1).wet, true, "the car is under the cell while the lap mean is dry");
  sb.performance.now = () => 100;
  S.update({ s: 100, x: 0, speed: 50, pitState: "none" });
  assert.equal(sent.at(-1).wet, false, "and dry outside it");
});
