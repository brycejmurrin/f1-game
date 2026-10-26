/* storm-vm.test.mjs — the STORM weather in the real game (tools/lib/game-vm.cjs
 * runs js/game.js on an inert DOM): a storm race runs on rain's grip and,
 * with CAUTIONS on, starts behind the safety car (CAUTIONS off: green); the render frame's lightning strikes off the seeded schedule
 * and never flashes under REDUCED MOTION; a friend room may keep a storm
 * staged (js/net/lobby.js refuses the word and drops the whole SETTINGS).
 * The pure halves are tests/unit/storm-weather.test.mjs.
 *
 * Run: node --test tests/unit/storm-vm.test.mjs   (npm run test:game-vm)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import vm from "node:vm";
const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");

let g;
before(async () => { g = await createGame({ track: "monza" }); });
after(() => g?.close());

/** A race on `wx`; the agent's race() knows only the five pre-storm names, so a storm is set live before the green. */
async function race(wx) {
  await g.apex.race("monza", "day", wx === "storm" ? "rain" : wx);
  if (wx === "storm") g.apex.weather("storm");
  g.apex.go();
  g.apex.headless(true);
}

test("a storm race: rain's wetness and grip; the start behind the safety car only with CAUTIONS on", async () => {
  await race("rain");
  g.apex.step(1 / 60, 60);
  const rain = { w: g.G.trackWetness(), grip: g.G.gripMult({ tread: 0 }), wet: g.G.gripMult({ tread: 2 }) };
  await race("storm");
  g.apex.step(1 / 60, 60);
  assert.equal(g.G.raceWeather, "storm");
  assert.equal(g.G.trackWetness(), rain.w, "storm wetness = rain");
  assert.equal(g.G.gripMult({ tread: 0 }), rain.grip, "slick grip = rain");
  assert.equal(g.G.gripMult({ tread: 2 }), rain.wet, "full-wet grip = rain");
  const off = g.apex.caution();
  assert.equal(off.enabled, false, "CAUTIONS ships OFF");
  assert.equal(off.label, "GREEN", "CAUTIONS off: no storm safety car " + JSON.stringify(off));
  assert.equal(off.lowGrip, true, "and Overtake is off for low grip, as in rain");
  g.apex.caution(true);
  try {
    await race("storm");
    g.apex.step(1 / 60, 60);
    const c = g.apex.caution();
    assert.equal(c.label, "SAFETY CAR", JSON.stringify(c));
    assert.equal(c.cause, "STORM");
  } finally { g.apex.caution(false); }
});

/** Max flash seen over `secs` of race, rendering a frame every half second. */
function flashes(secs) {
  let max = 0, frames = 0;
  for (let t = 0; t < secs; t += 0.5) {
    g.apex.step(1 / 60, 30);
    g.apex.snapCam(true);
    if (g.G._ltFlash > 0) frames++;
    max = Math.max(max, g.G._ltFlash);
  }
  return { max, frames };
}

test("lightning strikes in a storm, and never flashes under REDUCED MOTION", async () => {
  const root = g.sandbox && g.sandbox.document ? g.sandbox.document.documentElement : (g.ctx && g.ctx.document && g.ctx.document.documentElement);
  assert.ok(root && root.dataset, "the VM DOM has a documentElement dataset");
  const motion = vm.runInContext("TitleFx", g.ctx, { filename: "storm-motion-preference-probe" });
  const previous = motion.choice();
  try {
    motion.setChoice("off");
    await race("storm");
    const on = flashes(90);
    assert.ok(on.max > 0.5, "a storm flashes within 90 s, max " + on.max);
    await race("storm");
    motion.setChoice("reduce");
    assert.equal(root.dataset.motion, "reduce", "the real preference updates the DOM too");
    g.G._ltFlash = 0;   // the last race's strike, still decaying, is not this one's
    const off = flashes(90);
    assert.equal(off.max, 0, "no flash under reduced motion");
  } finally { motion.setChoice(previous); }
});

test("a friend room keeps a storm staged: the lobby accepts it", () => {
  g.G.raceWeather = "storm";
  g.G.setNetRoom(true);
  try {
    assert.equal(g.G.raceWeather, "storm", "setNetRoom no longer coerces a solo STORM pick");
    g.G.openRaceSettings("select");
    assert.equal(g.G.raceWeather, "storm", "the room's sheet keeps storm");
  } finally { g.G.setNetRoom(false); }
});

test("MIXED: the sheet's FORECAST line shows the plan the green arms, and STABLE hides it", async () => {
  await g.apex.race("monza", "day", "dry", { laps: 3 });
  g.G.endWeatherSession();
  const doc = g.sandbox ? g.sandbox.document : g.ctx.document;
  g.G.raceLaps = 4; g.G.raceChangeable = true;
  g.G.openRaceSettings("select");
  const line = doc.getElementById("rs-forecast");
  assert.ok(line && !line.hidden && /^FORECAST: /.test(line.textContent), "MIXED shows a FORECAST line: " + (line && line.textContent));
  await g.G.startRace();
  const arc = g.G.weatherArc;
  const Forecast = (g.sandbox || g.ctx).Forecast;
  const expect = Forecast.compute({ plan: { to: arc.to, dur: arc.dur }, from: "dry", lapS: g.G.track.total / 45, seed: g.G.simSeed() });
  assert.equal(line.textContent, "FORECAST: " + expect.text, "the sheet's line is the forecast of the plan armed at the green");
  g.G.endWeatherSession();
  g.G.raceChangeable = false;
  g.G.openRaceSettings("select");
  assert.ok(doc.getElementById("rs-forecast").hidden, "STABLE has no forecast");
});
