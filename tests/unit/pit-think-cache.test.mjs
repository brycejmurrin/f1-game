/* PitLane strategy reads: lazy per-step weather/caution reuse, live dev calls,
 * tick invalidation and unchanged real AiDrive decisions. Node VM, no browser. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

function session({ level = 0, weather = "dry", wetness = 0, fallback = false } = {}) {
  const ctx = vm.createContext({ Math, console, Float32Array });
  seedLog(ctx);
  ctx.window = ctx;
  for (const path of ["js/core/mat4.js", "js/physics/consts.js", "js/data/teams.js",
    "js/car/parts.js", "js/physics/tyre-model.js", "js/physics/ai-strategy.js",
    "js/physics/ai-drive.js", "js/race/pit-geom.js", "js/race/pit-lane.js"]) {
    vm.runInContext(readFileSync(new URL("../../" + path, import.meta.url), "utf8"), ctx,
      { filename: absSrc(path) });
  }
  const T = vm.runInContext("TyreModel", ctx);
  const counts = { caution: 0, wetness: 0, flag: 0 };
  const state = { level, wetness, flagged: false };
  ctx.RaceControl = { flagOut: () => { counts.flag++; return state.flagged; } };
  const G = {
    track: { total: 5386, n: 1346, def: {} }, vTop: () => 60, lapsTarget: 25,
    raceWeather: weather, cars: [], ranked: [],
    trackWetness: () => { counts.wetness++; return state.wetness; },
    tyres: { on: () => true, spent: (c) => c.tyreWear || 0,
      planLaps: (life, laps) => life * laps, classRecord: T.classRecord },
  };
  if (fallback) G.cautionInfo = () => { counts.caution++; return { level: state.level }; };
  else G.cautionLevel = () => { counts.caution++; return state.level; };
  const pits = vm.runInContext("PitLane", ctx).create(G);
  const car = (props = {}) => ({
    local: false, human: false, speed: 40, s: 1000, x: 0, prog: 1000, lap: 3,
    tyre: T.classRecord("medium"), tyreWear: 0, pitState: "none", pitStops: 0,
    pitPlan: { stops: 1, seq: ["medium", "hard"], lapsAt: [12], pitLossLaps: 0.2 },
    ...props,
  });
  return { pits, G, state, counts, car, T };
}

test("one lazy weather/caution read serves the AI field in a step", () => {
  const s = session();
  s.pits.stepBegin();
  assert.deepEqual(s.counts, { caution: 0, wetness: 0, flag: 0 }, "begin is not an eager sample");
  for (let i = 0; i < 6; i++) assert.equal(s.pits.think(s.car()), "");
  assert.deepEqual(s.counts, { caution: 1, wetness: 1, flag: 1 });
  s.pits.stepEnd();
  assert.deepEqual(s.counts, { caution: 1, wetness: 1, flag: 1 }, "end is not a sample either");
});

test("outside the bracket, each call reads live weather and both caution sites", () => {
  const s = session();
  s.pits.stepBegin(); s.pits.think(s.car()); s.pits.stepEnd();
  assert.equal(s.pits.think(s.car()), "");
  assert.deepEqual(s.counts, { caution: 3, wetness: 2, flag: 2 });
  s.G.raceWeather = "rain"; s.state.wetness = 0.8;
  const wet = s.car();
  assert.equal(s.pits.think(wet), "weather");
  assert.equal(wet.pitNext.tread, 2, "a live dev call selects the actual wet class");
  s.state.level = 4;
  assert.equal(s.pits.think(s.car()), "", "a newly red flag is live too");
  assert.deepEqual(s.counts, { caution: 6, wetness: 3, flag: 4 });
});

test("each new step invalidates cached zeroes, wet weather and the fallback caution reader", () => {
  const s = session({ fallback: true });
  s.pits.stepBegin(); assert.equal(s.pits.think(s.car()), ""); s.pits.stepEnd();
  s.G.raceWeather = "rain"; s.state.wetness = 0.8;
  s.pits.stepBegin();
  for (let i = 0; i < 3; i++) assert.equal(s.pits.think(s.car()), "weather");
  s.pits.stepEnd();
  assert.deepEqual(s.counts, { caution: 2, wetness: 2, flag: 2 });
  s.state.level = 4;
  s.pits.stepBegin(); assert.equal(s.pits.think(s.car()), ""); s.pits.stepEnd();
  assert.deepEqual(s.counts, { caution: 3, wetness: 2, flag: 3 }, "red does not read tread");
  s.state.level = 0; s.G.raceWeather = "dry"; s.state.wetness = 0;
  s.pits.stepBegin(); assert.equal(s.pits.think(s.car()), ""); s.pits.stepEnd();
  assert.deepEqual(s.counts, { caution: 4, wetness: 3, flag: 4 });
});

test("early exits preserve lazy reads and cannot seed another AI's memo", () => {
  const s = session();
  s.pits.stepBegin();
  for (const c of [null, s.car({ pitPlan: null }), s.car({ human: true }),
    s.car({ pitArmed: true }), s.car({ lap: 25 })]) assert.equal(s.pits.think(c), "");
  assert.deepEqual(s.counts, { caution: 0, wetness: 0, flag: 0 });
  s.state.flagged = true;
  assert.equal(s.pits.think(s.car()), "");
  assert.deepEqual(s.counts, { caution: 0, wetness: 0, flag: 1 });
  s.pits.stepEnd();
  s.state.flagged = false;
  s.pits.stepBegin(); assert.equal(s.pits.think(s.car()), ""); s.pits.stepEnd();
  assert.deepEqual(s.counts, { caution: 1, wetness: 1, flag: 2 });
});

test("bracketed and live paths produce identical real strategy decisions and car writes", () => {
  let cases = 0;
  const desiredTreads = new Set(), treadPairs = new Set();
  // Both sides and exact values of the real tyre thresholds, plus intermediate
  // and standing water. A dry-named race must still use its actual road state.
  for (const weather of ["dry", "rain"]) for (const wetness of [0.249, 0.25, 0.5, 0.719, 0.72, 0.8]) {
    for (const level of [0, 2, 3, 4]) {
      const s = session({ weather, wetness, level });
      const desired = s.T.treadFor(weather, wetness);
      desiredTreads.add(desired);
      for (const tread of [0, 1, 2]) for (const lap of [3, 12]) {
        const props = { lap, tyre: s.T.classRecord(["medium", "inter", "wet"][tread]) };
        const live = s.car(props), cached = s.car(props);
        const expected = s.pits.think(live);
        s.pits.stepBegin();
        assert.equal(s.pits.think(s.car(props)), expected, "first AI seeds this step lazily");
        const actual = s.pits.think(cached);
        s.pits.stepEnd();
        const row = `${weather}, wetness ${wetness}, caution ${level}, tread ${tread}, lap ${lap}`;
        assert.equal(actual, expected, row);
        assert.equal(JSON.stringify(cached), JSON.stringify(live), row + ": car writes");
        if (level === 4) assert.equal(actual, "", row + ": red never boxes");
        else if (desired !== tread) {
          assert.equal(actual, "weather", row);
          assert.equal(cached.pitNext.tread, desired, row + ": selected tread");
        } else if (desired === 0 && lap === 12 && level === 0) assert.equal(actual, "plan", row);
        treadPairs.add(`${desired}:${tread}`);
        cases++;
      }
    }
  }
  assert.deepEqual([...desiredTreads].sort(), [0, 1, 2]);
  assert.equal(treadPairs.size, 9, "every desired/fitted tread match and mismatch pair");
  assert.equal(cases, 288);
});
