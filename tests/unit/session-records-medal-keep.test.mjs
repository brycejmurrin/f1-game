/* session-records-medal-keep.test.mjs — #5588 option B (Bryce, 2026-11-18: "B: never lose a medal by
 * going faster."). #5587 made the wet reference pole quicker (Monza wet 133.74 → 130.69 s), so a faster
 * lap can rate lower than the medal it replaces. When a faster lap replaces the ghost, the stored medal
 * is the better of the held one and the new one; a past wet daily's share text follows the new target.
 * Real Quali.medalFor and MEDAL_RANK (js/race/quali-model.js), real SessionRecords and DailyChallenge.
 * Run: node --test tests/unit/session-records-medal-keep.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";
import { seedLog } from "../helpers/seed-log.mjs";
import { seedHash32 } from "../helpers/seed-hash32.mjs";

const read = (f) => fs.readFileSync(new URL("../../" + f, import.meta.url), "utf8");
const run = (ctx, f) => vm.runInContext(read(f), ctx, { filename: absSrc(f) });
const OLD_WET = 133.74, NEW_WET = 130.69, DRY = 80;   // Monza wet pole before / after #5587; a dry pole

function load(weather) {
  let ghost = null;                                    // { time, meta } — the stored best lap
  const announced = [];
  const Ghost = {
    contextKey: (c) => JSON.stringify(c), setTrack() {}, envelope: () => null, startLap() {}, record() {},
    bestTime: () => (ghost ? ghost.time : Infinity), medal: () => (ghost ? ghost.meta.medal : null),
    // js/car/ghost.js finishLap: only a FASTER lap replaces the stored one.
    finishLap: (t, meta) => { if (ghost && t >= ghost.time) return false; ghost = { time: t, meta }; return true; },
  };
  const G = { player: { team: { id: "mclaren" }, tierV: 1, code: "NOR", name: "Norris" },
    track: { def: { id: "monza" }, n: 1, total: 1 }, session: "tt", raceWeather: weather, difficulty: "normal",
    raceTimeOfDay: "day", store: { rev: 1 }, PACE: 0.84, ttRecord: Infinity, fmtTime: (t) => t.toFixed(3),
    recordControls: () => "keys", announce: (m) => announced.push(m),
    daily: { current: () => null, isActive: () => false, record() {} } };
  const ctx = vm.createContext({ G, Ghost, Teams: { LIST: [{ id: "mclaren" }] }, Input: { setSteerSpeedRef() {} },
    PhysicsConsts: { REVISION: 1 }, GameStore: { ttBoard: () => [], ttBoardAdd() {} } });
  seedLog(ctx);
  run(ctx, "js/race/quali-model.js");
  vm.runInContext("globalThis.Quali = Quali;", ctx);
  vm.runInContext(read("js/race/session-phys.js") + ";globalThis.SessionPhys = SessionPhys;", ctx, { filename: absSrc("js/race/session-phys.js") });
  run(ctx, "js/race/session-records.js");
  const rec = vm.runInContext("SessionRecords.create(G)", ctx);
  rec.begin();
  return { rec, announced, held: () => Ghost.medal(), seed: (time, medal) => { ghost = { time, meta: { medal } }; }, Quali: ctx.Quali };
}

test("#5588: the targets themselves — the old wet target rated these laps higher than the new one does", () => {
  const { Quali } = load("wet");
  assert.equal(Quali.medalFor(133.5, OLD_WET), "gold");
  assert.equal(Quali.medalFor(132.0, NEW_WET), "silver");
  assert.equal(Quali.medalFor(142.0, OLD_WET), "bronze");
  assert.equal(Quali.medalFor(130.5, NEW_WET), "gold");
});

test("#5588 B: a held wet GOLD (old target) + a faster lap the new target rates SILVER keeps GOLD", () => {
  const h = load("wet");
  h.seed(133.5, "gold");
  assert.equal(h.rec.finish(132.0, [], NEW_WET), true);
  assert.equal(h.held(), "gold");
  assert.deepEqual(h.announced, ["NEW RECORD 132.000"], "no medal card: the held medal did not change");
});

test("#5588 B: a held wet BRONZE + a faster lap rated GOLD stores GOLD and announces it", () => {
  const h = load("wet");
  h.seed(142.0, "bronze");
  assert.equal(h.rec.finish(130.5, [], NEW_WET), true);
  assert.equal(h.held(), "gold");
  assert.deepEqual(h.announced, ["GOLD MEDAL — NEW RECORD 130.500"]);
});

test("#5588 B: dry is unchanged — a faster lap gets the medal its time earns, a slower one replaces nothing", () => {
  const h = load("dry");
  h.seed(82.0, "silver");                              // 82.0 <= 80 * 1.03 = 82.4
  assert.equal(h.rec.finish(81.0, [], DRY), true);
  assert.equal(h.held(), "silver");
  assert.equal(h.rec.finish(79.9, [], DRY), true);
  assert.equal(h.held(), "gold");
  assert.equal(h.rec.finish(83.0, [], DRY), true);     // slower: the ghost keeps 79.9 and its gold
  assert.equal(h.held(), "gold");
  assert.deepEqual(h.announced, ["NEW RECORD 81.000", "GOLD MEDAL — NEW RECORD 79.900"]);
});

test("#5588 B: a past wet daily's share text follows the NEW target — its stored 132.000 reads SILVER", () => {
  const ctx = vm.createContext({ Math, JSON, Object, Array, String, Number, Date, isNaN, isFinite, console,
    Tracks: { LIST: [{ id: "monza", name: "MONZA" }], SEASON: [{ id: "monza", name: "MONZA" }] } });
  seedLog(ctx); seedHash32(ctx);
  run(ctx, "js/race/quali-model.js");
  vm.runInContext("globalThis.Quali = Quali;", ctx);
  run(ctx, "js/race/daily-challenge.js");
  const stored = new Map();
  const G = { store: { get: (k, d) => (stored.has(k) ? JSON.parse(stored.get(k)) : d), set: (k, v) => stored.set(k, JSON.stringify(v)) },
    fmtTime: (t) => t.toFixed(3), ttDistance: 4, trackIdx: -1, raceWeather: "wet", raceTimeOfDay: "default",
    raceLaps: 3, seed: 1, flow: "gp", timeTrial: false, startRace() {}, referencePole: (k) => (k === "medal" ? NEW_WET : NaN) };
  const d = vm.runInContext("DailyChallenge", ctx).create(G);
  d.open("2026-09-03");
  d.record(132.0);                                     // GOLD against the old 133.74 target
  assert.equal(d.shareResult().medal, "silver");
  assert.equal(d.shareText(), "APEX 26 DAILY 2026-09-03 · MONZA · 132.000 · SILVER · STREAK 1");
});
