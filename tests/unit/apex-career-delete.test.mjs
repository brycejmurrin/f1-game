import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

test("careerSlotDelete preserves conflict and session-only durability metadata", () => {
  let result, loads = 0, refreshes = 0;
  const slots = [{ flavour: "driver", i: 0, used: false }];
  const context = vm.createContext({
    CamModes: { CAM_MODES: [] }, LightTune: { TUNE_DEFS: [], LT: {} },
    AgentView: { create: () => ({}) },
    Career: { deleteSlot: () => result, load: () => { loads++; }, slots: () => slots },
  });
  vm.runInContext(fs.readFileSync(new URL("../../js/agent/apex.js", import.meta.url), "utf8"), context);
  const api = vm.runInContext("ApexApi", context).create({ track: {}, refreshCareerButton: () => { refreshes++; } });
  result = { ok: false, durable: false, reason: "conflict" };
  assert.equal(api.careerSlotDelete("driver", 0), result);
  assert.equal(loads, 0); assert.equal(refreshes, 0);
  result = { ok: true, durable: false, reason: "quota" };
  const session = api.careerSlotDelete("driver", 0);
  assert.equal(session.ok, true); assert.equal(session.durable, false); assert.equal(session.reason, "quota");
  assert.equal(session.slots, slots);
  result = { ok: true, durable: true, reason: null };
  assert.equal(api.careerSlotDelete("driver", 0).durable, true);
  assert.equal(loads, 2); assert.equal(refreshes, 2);
});

// ── round 2, B8: hooks that reach into game.js / Career through a stubbed G ──────────────────────

function loadApex(extra, G) {
  const context = vm.createContext(Object.assign({
    CamModes: { CAM_MODES: [] }, LightTune: { TUNE_DEFS: [], LT: {} },
    AgentView: { create: () => ({}) },
  }, extra));
  vm.runInContext(fs.readFileSync(new URL("../../js/agent/apex.js", import.meta.url), "utf8"), context);
  return vm.runInContext("ApexApi", context).create(G);
}

test("careerSim settles through Career.scoreRound and never advances the calendar itself", () => {
  const calls = [];
  const cars = [];
  const mk = (i, isPlayer) => ({ driverId: "d" + i, code: "C" + i, tier: 2, team: { id: "t" + (i >> 1) }, seat: i & 1, isPlayer, retired: false, dnfAt: null });
  for (let i = 0; i < 4; i++) cars.push(mk(i, i === 0));
  const season = { round: 3, pts: {}, driverCodes: {}, teamPts: {}, finishes: {} };
  const result = { pos: 2, pts: 18, money: 5 };
  let scored = null;
  const Career = {
    data: () => ({}), seasonDone: () => false, round: () => season.round, devFor: () => 0,
    rnd: () => 0.5, hash: () => 0.5,
    scoreRound: (order, player, fastest, run) => { calls.push([order.length, player, fastest, run]); return scored; },
  };
  const G = { track: {}, season, cars, player: cars[0], armReliability() {},
    qualiSim: () => cars.map((c) => ({ driverId: c.driverId })) };
  const api = loadApex({ Career, DriverRatings: { get: () => ({ craft: 50, awareness: 50 }) },
    Teams: { POINTS: [25, 18, 15, 12] } }, G);
  // a refused save (scoreRound -> null): nothing moved, no result row
  scored = null;
  assert.equal(api.careerSim(1).length, 0);
  assert.equal(season.round, 3, "the calendar stays put when the save is refused");
  assert.deepEqual(season.pts, {}, "no points land without a settlement");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], cars[0], "the player is handed to Career.scoreRound");
  // an accepted save: the settlement result is returned
  scored = result;
  const out = api.careerSim(1);
  assert.equal(out.length, 1);
  assert.equal(out[0].pos, 2);
  assert.equal(out[0].round, 4);
  assert.equal(out[0].podium.length, 3);
  assert.equal(season.round, 3, "Career.scoreRound (SeasonCal.award) owns the round counter, not the hook");
});

test("race() and tt() end the previous weather session before choosing the new weather", () => {
  const log = [];
  const G = { trackIdx: 0, seasonMode: false, timeTrial: false, raceLaps: 0, raceTimeOfDay: "",
    startRace: () => { log.push("start:" + G.raceWeather); return Promise.resolve(); },
    endWeatherSession: () => { log.push("end:" + G.raceWeather); },
    GAME_LAPS: 5, TT_LAPS: 3 };
  Object.defineProperty(G, "raceWeather", { get: () => G._w, set: (v) => { log.push("set:" + v); G._w = v; } });
  G._w = "wet";   // a live MIXED race left the arc's last weather behind
  const api = loadApex({ Tracks: { LIST: [{ id: "monza" }], building: () => false } }, G);
  api.race("monza", "day", "dry");
  assert.deepEqual(log.slice(0, 3), ["end:wet", "set:dry", "start:dry"], "end the session first, then set, then start");
  log.length = 0; G._w = "rain";
  api.tt("monza", "day");
  assert.deepEqual(log.slice(0, 3), ["end:rain", "set:dry", "start:dry"]);
});
