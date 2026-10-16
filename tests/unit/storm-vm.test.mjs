/* storm-vm.test.mjs — the STORM weather in the real game (tools/lib/game-vm.cjs
 * runs js/game.js on an inert DOM): a storm race starts behind the safety car
 * on rain's grip; the render frame's lightning strikes off the seeded schedule
 * and never flashes under REDUCED MOTION; a friend room may keep a storm
 * staged (js/net/lobby.js refuses the word and drops the whole SETTINGS).
 * The pure halves are tests/unit/storm-weather.test.mjs.
 *
 * Run: node --test tests/unit/storm-vm.test.mjs   (npm run test:game-vm)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
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

test("a storm race: rain's wetness and grip, and the start behind the safety car", async () => {
  await race("rain");
  g.apex.step(1 / 60, 60);
  const rain = { w: g.G.trackWetness(), grip: g.G.gripMult({ tread: 0 }), wet: g.G.gripMult({ tread: 2 }) };
  await race("storm");
  g.apex.step(1 / 60, 60);
  assert.equal(g.G.raceWeather, "storm");
  assert.equal(g.G.trackWetness(), rain.w, "storm wetness = rain");
  assert.equal(g.G.gripMult({ tread: 0 }), rain.grip, "slick grip = rain");
  assert.equal(g.G.gripMult({ tread: 2 }), rain.wet, "full-wet grip = rain");
  const c = g.apex.caution();
  assert.equal(c.label, "SAFETY CAR", JSON.stringify(c));
  assert.equal(c.cause, "STORM");
  assert.equal(c.lowGrip, true, "and Overtake is off for low grip, as in rain");
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
  await race("storm");
  delete root.dataset.motion;
  const on = flashes(90);
  assert.ok(on.max > 0.5, "a storm flashes within 90 s, max " + on.max);
  await race("storm");
  root.dataset.motion = "reduce";   // SETTINGS › MOTION: REDUCED (game.js motionReduced())
  try {
    g.G._ltFlash = 0;   // the last race's strike, still decaying, is not this one's
    const off = flashes(90);
    assert.equal(off.max, 0, "no flash under reduced motion");
  } finally { delete root.dataset.motion; }
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
