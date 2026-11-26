// visible-wetness.test.mjs — the VISIBLE wet state (frame.wetness)
// at a race start, under a paused render, and after a bare arc (#6892: hunt
// #6881 R2 + R6 + R11).
//
//   R2   a rain race's first rendered frame is wet: startChangeable() (every
//        race start) snaps frame.wetness to the road, so the
//        road no longer fades in from dry over ~3-4 s while grip is full-wet
//   R6   syncWetness(0) (the photo studio's render(0) pump) HOLDS; only an
//        explicit snap jumps to the target
//   R11  an arc armed by startArc() alone (agent weatherArc, real-race) is put
//        back by endSession(), not left as the next race's weather
//
// Run: node --test tests/unit/visible-wetness.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";
import { fakeG } from "../helpers/fake-g.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");

function bootArc({ weather = "dry", wet = 0 } = {}) {
  const ctx = vm.createContext({ Math, JSON, Object, Array, Number, Error, Float64Array });
  seedLog(ctx);
  ctx.Particles = { rainShow() {} };
  ctx.GameAudio = { startRain() {}, stopRain() {} };
  vm.runInContext(read("js/race/weather-arc.js").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/race/weather-arc.js") });
  const G = fakeG({
    raceWeather: weather, soundOn: false, track: {}, headlessMode: false, frame: { wetness: wet, rain: 0 },
    announce() {}, simSeed: () => 1, raceRound: 0, lapsTarget: 3, raceLaps: 3, netPlay: { active: () => false },
    applyRaceSettings() {}, isWetRoad: () => G.raceWeather === "wet" || G.raceWeather === "rain",
    initRainDrops() {}, state: "menu", trackWetness: () => wa.wetness(),   // the real G: wxArc.wetness
  });
  const wa = ctx.WeatherArc.create(G, { isTimeTrial: () => false, isQuali: () => false });
  return { G, wa };
}

// ── R2: the race start ─────────────────────────────────────────────────────
let g;
before(async () => { g = await createGame({ track: "monza" }); });
after(() => g?.close());

test("R2: the first rendered frame of a rain start carries the wet road", async () => {
  g.G.daily.stop();
  g.G.timeTrial = true;
  g.G.raceWeather = "rain";
  await g.G.startRace();
  assert.equal(g.G.trackWetness(), 1, "grip already reads a full-wet road");
  assert.equal(g.G.frame.wetness, g.G.trackWetness(), "frame.wetness matches the road straight after startRace");
  g.pumpFrame();   // the first real render(dt)
  assert.ok(g.G.frame.wetness > 0.99, `first rendered frame is wet (frame.wetness ${g.G.frame.wetness})`);
});

test("R2: startChangeable snaps a stale (dry) frame to the session's road", () => {
  const { G, wa } = bootArc({ weather: "rain", wet: 0 });
  wa.startChangeable(0);   // not changeable: returns null, but the start still snaps
  assert.equal(G.frame.wetness, 1);
});

test("R2: a changeable (MIXED) start snaps to the start weather's road before the arc arms", () => {
  const { G, wa } = bootArc({ weather: "rain", wet: 0 });
  wa.changeable = true; wa.plan = { to: "dry", dur: 600 };
  assert.ok(wa.startChangeable(0), "the arc armed");
  assert.equal(G.frame.wetness, 1, "the grid shows the rain road, not a fade from dry");
});

// ── R6: a paused render holds ──────────────────────────────────────────────
test("R6: syncWetness(0) mid-ramp leaves frame.wetness unchanged; a snap jumps", () => {
  const { G, wa } = bootArc({ weather: "rain", wet: 0 });
  for (let i = 0; i < 30; i++) wa.syncWetness(1 / 60);
  const mid = G.frame.wetness;
  assert.ok(mid > 0 && mid < 1, `mid-ramp (${mid})`);
  wa.syncWetness(0);
  assert.equal(G.frame.wetness, mid, "render(0) holds");
  wa.syncWetness(undefined);
  assert.equal(G.frame.wetness, mid, "no dt holds too");
  wa.syncWetness(0, true);
  assert.equal(G.frame.wetness, 1, "an explicit snap reaches the target");
});

// ── R11: a bare arc does not leak ──────────────────────────────────────────
test("R11: startArc then endSession restores the chip's weather", () => {
  const { G, wa } = bootArc({ weather: "dry" });
  G.state = "race";
  assert.ok(wa.startArc("dry", "rain", 60), "a bare arc armed (no startChangeable)");
  for (let i = 0; i < 60 * 30; i++) wa.tick(1 / 60);
  assert.notEqual(G.raceWeather, "dry", "the arc walked off the chip's pick");
  wa.endSession();
  assert.equal(wa.arc, null);
  assert.equal(G.raceWeather, "dry", "the chip's pick is back for the next race");
});

test("R11: an arc from a different start weather is also put back", () => {
  const { G, wa } = bootArc({ weather: "wet" });
  G.state = "race";
  wa.startArc("dry", "rain", 60);
  assert.equal(G.raceWeather, "dry", "the arc applied its from");
  wa.endSession();
  assert.equal(G.raceWeather, "wet");
});

test("R11: a menu arc does not record a base, so a later chip pick survives the race start", () => {
  const { G, wa } = bootArc({ weather: "dry" });
  wa.startArc("dry", "rain", 60);   // state "menu"
  G.raceWeather = "wet";            // the player's chip pick afterwards
  wa.restoreBase();                 // startRace's re-arm
  assert.equal(G.raceWeather, "wet");
});
