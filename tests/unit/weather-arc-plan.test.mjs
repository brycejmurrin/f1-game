// weather-arc-plan — the MIXED (CHANGEABLE) weather plan is ONE plan per race.
//
// js/race/weather-arc.js derives {to, dur} from a seed, the round, the start
// weather and a cap for the race distance. Three ways it used to differ between
// the host's lobby (which ships it in SETTINGS) and the host's own green light:
//
//   1. The cap read G.lapsTarget, which still holds the LAST session's value
//      outside a race (1 after qualifying, 4 after a time trial), so the shipped
//      plan was capped for the wrong distance and the guest adopted it unchanged:
//      a ~100 s weather/grip desync.
//   2. Nothing pinned the plan between the two reads.
//   3. Outside a career the seed was G.simSeed() — random per page load — so a
//      standalone Season with MIXED weather re-rolled its rain on every reload
//      while reliability, launch and qualifying replayed from the season's
//      stamped luck seed (SeasonCal.luckSeed).
//
// The real weather-arc.js in a VM with a stub G. No browser.
//
// Run: node --test tests/unit/weather-arc-plan.test.mjs  (npm run test:tooling-fast)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/race/weather-arc.js"), "utf8").replace(/^const\b/gm, "var");

// A deterministic stand-in for Career.hash: a pure function of its arguments.
const hash = (seed, ...parts) => {
  let h = (seed >>> 0) ^ 0x9e3779b9;
  for (const ch of parts.join("|")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return (h % 100000) / 100000;
};

function boot(over = {}) {
  const ctx = vm.createContext({ Math, Number, Object, Array, JSON });
  ctx.window = ctx;
  seedLog(ctx);
  ctx.Career = { inCareer: () => false, hash };
  // SeasonCal.luckSeed's contract: the season's stamped seed wins over the session's.
  ctx.SeasonCal = { drawRound: (s) => s.round, luckSeed: (season, session) => season.seed || session };
  vm.runInContext(SRC, ctx, { filename: "js/race/weather-arc.js" });
  const G = Object.assign({
    state: "menu", flow: "single", season: null, seasonMode: false,
    raceWeather: "dry", raceRound: 0, raceLaps: 25, lapsTarget: 1,
    track: { total: 5800 }, soundOn: false,
    simSeed: () => 1, netPlay: { active: () => false },
    announce() {}, applyRaceSettings() {}, isWetRoad: () => false, isRaining: () => false,
    initRainDrops() {},
  }, over);
  ctx.Particles = { rainShow() {} };
  const wa = ctx.WeatherArc.create(G, { isTimeTrial: () => false, isQuali: () => false });
  wa.changeable = true;
  return { G, wa, ctx };
}
// The plan comes out of the VM's realm: compare it as data.
const plain = (v) => JSON.parse(JSON.stringify(v));
const plan = (b) => plain(b.wa.planFor());

test("the plan the lobby ships is the plan the green light uses, whatever lapsTarget was left at", () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const { G, wa } = boot({ simSeed: () => seed });
    const shipped = wa.planFor();                         // lobby: state "menu", lapsTarget 1 left by qualifying
    G.lapsTarget = 25; G.state = "count";                 // startRace sets the distance, then the lights
    const a = wa.startChangeable();
    assert.equal(a.dur, shipped.dur, `seed ${seed}: arc ${a.dur}s vs shipped ${shipped.dur}s`);
    assert.equal(a.to, shipped.to);
  }
});

test("outside a live race the cap follows the sheet's raceLaps, not a stale lapsTarget", () => {
  const stale = boot({ lapsTarget: 1, raceLaps: 25 });
  const fresh = boot({ lapsTarget: 25, raceLaps: 25 });
  assert.deepEqual(plan(stale), plan(fresh), "a left-over lapsTarget of 1 must not shorten the plan");
  const short = boot({ lapsTarget: 25, raceLaps: 3 });
  assert.ok(short.wa.planFor().dur <= 3 * (5800 / 48) * 0.72, "a 3-lap sheet still caps the plan");
  const live = boot({ state: "race", lapsTarget: 3, raceLaps: 25 });
  assert.ok(live.wa.planFor().dur <= 3 * (5800 / 48) * 0.72, "inside the race, the session's own distance caps it");
});

test("planFor is remembered until an input changes", () => {
  const { G, wa } = boot();
  const first = wa.planFor();
  assert.notEqual(first, wa.planFor(), "callers get their own copy");
  assert.deepEqual(plain(wa.planFor()), plain(first));
  G.simSeed = () => 99;
  assert.notDeepEqual(plain(wa.planFor()), plain(first), "a new seed is a new plan");
  G.simSeed = () => 1; G.raceRound = 3;
  assert.notDeepEqual(plain(wa.planFor()), plain(first), "and so is a new round");
  G.raceRound = 0;
  assert.deepEqual(plain(wa.planFor()), plain(first), "back to the first inputs, back to the first plan");
  G.raceWeather = "wet";
  assert.notEqual(wa.planFor().to, "wet", "the target is never the weather we start on");
});

test("a standalone Season replays its plan across reloads: the seed is the season's stamped luck seed", () => {
  const seasonPlan = (sessionSeed, stamped = 4242) =>
    plan(boot({ flow: "season", seasonMode: true, season: { round: 2, seed: stamped }, simSeed: () => sessionSeed }));
  assert.deepEqual(seasonPlan(7), seasonPlan(123456), "two page loads (two simSeeds) draw the same weather");
  assert.notDeepEqual(seasonPlan(7, 4243), seasonPlan(7), "a different season seed is a different plan");
  // A one-off Grand Prix keeps drawing from the session seed.
  const gp = (sessionSeed) => plan(boot({ simSeed: () => sessionSeed }));
  assert.notDeepEqual(gp(7), gp(123456));
});

test("a career draws from its season seed, ahead of the session's", () => {
  const careerPlan = (sessionSeed, careerSeed) => {
    const b = boot({ simSeed: () => sessionSeed });
    b.ctx.Career.inCareer = () => true;
    b.ctx.Career.seasonSeed = () => careerSeed;
    return plan(b);
  };
  assert.deepEqual(careerPlan(1, 99), careerPlan(2, 99));
  assert.notDeepEqual(careerPlan(1, 99), careerPlan(1, 100));
});
