/* track-wetness-vm.test.mjs — look=drive: frame.wetness follows trackWetness.
 *
 * Before A1, eighty dry LightPresets pinned LT.wetness (0.545–0.685) so the
 * road looked wet while gripMult stayed dry. Shipped presets must stay AUTO;
 * syncWetness (weather-arc) ramps frame.wetness to roadWetness even under
 * headless (render used to early-return before the ramp).
 *
 * Run: node --test tests/unit/track-wetness-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");

let g;
before(async () => { g = await createGame({ track: "monza" }); });
after(() => g?.close());

async function raceDry() {
  g.G.daily.stop();
  g.G.timeTrial = true;
  g.G.raceWeather = "dry";
  await g.G.startRace();
  g.apex.go();
  g.apex.headless(true);
}

/** Saturate the wetness ramp without advancing a live weather arc (dt=0 → sync snaps). */
function settleWetness() {
  g.apex.step(0, 1);
}

test("trackWetness is on G; roadWetness is the in-file alias (look=drive)", async () => {
  await raceDry();
  assert.equal(typeof g.G.trackWetness, "function");
  assert.equal(g.G.trackWetness(), 0);
  g.apex.weather("dry");
  settleWetness();
  assert.equal(g.G.frame.wetness, 0,
    "dry + AUTO must not leave a preset-pinned wet road under the car");
  assert.equal(g.G.gripMult({ tread: 0 }), 1);
});

test("rain settles frame.wetness to 1 with the same grip ladder", async () => {
  await raceDry();
  g.apex.weather("rain");
  settleWetness();
  assert.equal(g.G.trackWetness(), 1);
  assert.equal(g.G.frame.wetness, 1);
  assert.equal(g.G.gripMult({ tread: 0 }), 0.72);
});

test("a weather arc keeps look and grip on the continuous lerp", async () => {
  await raceDry();
  settleWetness();
  g.apex.weatherArc("dry", "rain", 60);
  g.G.weatherArc.t = 30;
  g.G.raceWeather = "wet";   // mid-arc stage flip (enum) while the ramp target is 0.5
  // The road LAGS the arc's ramp (WeatherArc wetAt: wets with τ 8 s), so half
  // way through it is a little short of 0.5 — continuous, never an enum pin.
  const w = g.G.trackWetness();
  assert.ok(w > 0.3 && w < 0.5, "lagged mid-arc wetness, got " + w);
  settleWetness();
  const pl = g.G.player;   // frame.wetness is the field under the view, (s, x); the drying line only shaves the lap value
  assert.ok(Math.abs(g.G.frame.wetness - g.G.trackWetness()) < 0.2, "frame.wetness follows the road's wetness, not a discrete wet/rain pin");
  assert.ok(Math.abs(g.G.gripMult({ tread: 0, s: pl.s, x: pl.x }) - g.ctx.TyreModel.weatherGrip(0, g.G.frame.wetness)) < 1e-6,
    "grip and frame.wetness agree at the same (s, x)");
  const grip = g.G.gripMult({ tread: 0 });
  const want = g.ctx.TyreModel.weatherGrip(0, g.G.trackWetness());
  assert.ok(Math.abs(grip - want) < 1e-6 && grip > 0.82 && grip < 1, "grip at mid-arc wetness is the continuous slick value, got " + grip);
  g.apex.weather("dry");
});

test("A2: mid-arc enum flip cannot force rain FX or wet tread while lerp is dry", async () => {
  // Would fail before A2: isWetRoad/isRaining/treadFor(weather) followed the
  // discrete raceWeather stage flip even when trackWetness was still ~0.
  await raceDry();
  settleWetness();
  g.apex.weatherArc("dry", "rain", 100);
  g.G.weatherArc.t = 5;                 // lerp wetness = 0.05
  g.G.raceWeather = "wet";              // stage flip (enum ahead of lerp)
  assert.ok(g.G.trackWetness() < 0.25, "fixture: lerp still below inter threshold");
  assert.equal(g.G.isWetRoad(), false, "road/FX wet gate follows wetness, not enum");
  assert.equal(g.G.viewRainfall(), 0.05, "falling rain follows the cloud ramp independently of tread advice");
  const TyreModel = g.ctx.TyreModel;
  assert.equal(TyreModel.treadFor(g.G.raceWeather, g.G.trackWetness()), 0,
    "tread advice mid-arc near dry must stay slicks despite enum=wet");
  assert.equal(TyreModel.treadFor(g.G.raceWeather), 1,
    "control: enum-only treadFor would wrongly ask for inters");
  g.apex.weather("dry");
});

// #5253 (Bryce 2026-11-11, "Automatic set"): CHANGEABLE weather with TYRE WEAR off
// has no pit lane, and a player on their own garage slick stayed on it when the
// rain came — 0.72 grip against a field at 0.97, for the rest of the race. The set
// now follows the weather the way the AI field's does (TyreModel treadOf /
// followWeather), and back to the garage slick when the road dries. c.tread and
// c.mods do not move: they are the session-record key (session-records.js).
test("wear OFF: a player on the garage slick drives on the weather's tyre as the rain comes, and back when it dries (#5253)", async () => {
  const w = await createGame({ seat: "shipped", track: "silverstone", storage: { tyreWear: "off" } });
  try {
    await w.race("silverstone", "day", "dry", { laps: 5 }); w.apex.go(); w.apex.headless(true);
    w.apex.setPhysics({ roadFollow: 0.7 });
    const { G } = w, P = G.player, ai = G.cars.find((c) => !c.human);
    const drive = (s) => { for (let i = 0; i < 60 * s; i++) w.apex.act({ throttle: true }, 1 / 60, 1); };
    const key = JSON.stringify([P.tread, P.mods]);
    assert.equal(G.tyres.on(), false);
    assert.equal(P.tyre.tread, 0); assert.equal(G.gripMult(P), 1);
    w.apex.weatherArc("dry", "rain", 20); drive(60);
    assert.ok(!P.retired, "the player is still racing");
    assert.equal(P.tyre.code, "W", "the HUD letter follows the weather");
    assert.equal(G.gripMult(P), G.gripMult(ai), `player ${G.gripMult(P)} vs the field ${G.gripMult(ai)}`);
    assert.ok(G.gripMult(P) > 0.9, `full wets in the rain: ${G.gripMult(P)} (a slick reads 0.72)`);
    w.apex.weatherArc("rain", "dry", 20); drive(240);
    assert.equal(P.tyre.tread, 0, "back on the garage slick on a dry road");
    assert.equal(P.tyre.id, P.tyreOpt.id);
    assert.equal(G.gripMult(P), 1);
    assert.equal(JSON.stringify([P.tread, P.mods]), key, "the session-record key never moved");
  } finally { w.close(); }
});
