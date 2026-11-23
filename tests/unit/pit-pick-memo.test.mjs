/* PitLane.pickFor memo: the 10 Hz HUD tick (planInfo → nextCode → nextFor →
 * pickFor) builds no tyre records while nothing changed, and every memo input
 * still moves the answer exactly as an uncached call does. Node VM, no browser.
 *
 * Run: node --test tests/unit/pit-pick-memo.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

function session() {
  const ctx = vm.createContext({ Math, console, Float32Array });
  seedLog(ctx);
  ctx.window = ctx;
  for (const path of ["js/core/mat4.js", "js/physics/consts.js", "js/data/teams.js",
    "js/car/parts.js", "js/physics/tyre-model.js", "js/physics/ai-strategy.js",
    "js/physics/ai-drive.js", "js/race/sporting-regs.js", "js/race/pit-geom.js", "js/race/pit-lane.js"]) {
    vm.runInContext(readFileSync(new URL("../../" + path, import.meta.url), "utf8"), ctx,
      { filename: absSrc(path) });
  }
  const T = vm.runInContext("TyreModel", ctx);
  const counts = { optionRecord: 0 };
  const state = { wetness: 0, lifeK: 1 };
  const G = {
    track: { total: 5386, n: 1346, def: {} }, vTop: () => 60, lapsTarget: 25,
    raceWeather: "dry", cars: [], ranked: [],
    trackWetness: () => state.wetness,
    tyres: {
      on: () => true, spent: (c) => c.tyreWear || 0,
      planLaps: (life, laps) => life * laps * state.lifeK, classRecord: T.classRecord,
      optionRecord: (o) => { counts.optionRecord++; return T.optionRecord(o); },
    },
  };
  const PitLane = vm.runInContext("PitLane", ctx);
  const rows = vm.runInContext("Parts", ctx).CATALOG.find((c) => c.id === "tyres").options.length;
  const player = {
    local: true, human: true, code: "YOU", speed: 40, s: 1000, x: 0, prog: 1000, lap: 3,
    tyre: T.classRecord("medium"), tyreWear: 0, pitState: "none", pitStops: 0, pitFitted: false,
    pitPlan: { stops: 1, seq: ["medium", "hard"], lapsAt: [12], pitLossLaps: 0.2 },
    tyreLog: [{ code: "M", lap0: 0, lap1: null }],
  };
  G.player = player; G.cars = [player];
  return { pits: PitLane.create(G), fresh: () => PitLane.create(G), G, state, counts, player, rows };
}

test("100 unchanged HUD ticks build each tyre record at most once", () => {
  const s = session();
  assert.equal(s.pits.twoCompoundApplies(), true, "the fixture exercises the two-compound branch");
  let first = null;
  for (let i = 0; i < 100; i++) {
    const info = s.pits.planInfo(s.player);
    const next = s.pits.nextFor(s.player);
    if (!first) first = next;
    assert.equal(next, first, "the same record object while nothing changed");
    assert.equal(info.code, first.code);
  }
  assert.ok(s.counts.optionRecord <= s.rows, "optionRecord ran " + s.counts.optionRecord + " times for " + s.rows + " rows");
  assert.equal(first.code, "H", "the plan's letter, not the M already run");
});

test("every memo input moves the pick exactly as a fresh, uncached instance does", () => {
  const s = session(), p = s.player, ids = new Set();
  const same = (why) => {
    const memo = s.pits.pickFor(p), cold = s.fresh().pickFor(p);
    assert.deepEqual(memo, cold, why);
    ids.add(memo && memo.id);
  };
  same("baseline");
  p.pitStops = 1; same("pitStops: the plan slot moves past the last class");
  p.pitState = "box"; p.pitFitted = false; same("in the box before the fit: this stint's slot");
  p.pitState = "none"; p.pitStops = 0;
  p.lap = 24; same("laps to the flag");
  p.lap = 3; s.state.lifeK = 0.01; same("planLaps (wear level / circuit severity)");
  s.state.lifeK = 1;
  p.tyreLog.push({ code: "H", lap0: 3, lap1: null }); same("a new stint satisfies the two-compound rule");
  p.tyreLog = [{ code: "S", lap0: 0, lap1: null }]; same("a replaced stint log");
  s.G.lapsTarget = 5; same("a short race lifts the two-compound rule");
  s.G.lapsTarget = 25;
  p.pitPlan = { stops: 2, seq: ["medium", "soft", "soft"], lapsAt: [8, 16], pitLossLaps: 0.2 }; same("a replanned sequence");
  s.G.raceWeather = "rain"; s.state.wetness = 0.8; same("weather: the wet tread");
  s.state.wetness = 0.3; same("drying track");
  s.G.raceWeather = "dry"; s.state.wetness = 0; same("dry again");
  assert.ok(ids.size >= 3, "the steps exercised several distinct picks: " + [...ids].join(","));
});

test("choices() copies the memoised rows: its AUTO push never reaches the cache", () => {
  const s = session();
  s.G.raceWeather = "rain"; s.state.wetness = 0.9;   // AUTO appends its pick when it is not an owned row
  const a = s.pits.choices(s.player), b = s.pits.choices(s.player);
  assert.equal(a.length, b.length, "a second call is not one row longer");
  assert.deepEqual(a.map((r) => r.id), b.map((r) => r.id));
});
