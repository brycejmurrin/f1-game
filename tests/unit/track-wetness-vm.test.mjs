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
  g.G.raceWeather = "wet";   // mid-arc stage flip (enum) while lerp is 0.5
  assert.ok(Math.abs(g.G.trackWetness() - 0.5) < 1e-9);
  settleWetness();
  assert.ok(Math.abs(g.G.frame.wetness - 0.5) < 1e-6,
    "frame.wetness must follow the lerp, not a discrete wet/rain pin");
  const grip = g.G.gripMult({ tread: 0 });
  // Mid wetness 0.5 → weatherGrip at the wet tier for slicks (WET_GRIP.wet[0]=0.82).
  assert.ok(Math.abs(grip - 0.82) < 1e-6, "grip at mid-arc wetness must be the wet-tier slick value, got " + grip);
  g.apex.weather("dry");
});
