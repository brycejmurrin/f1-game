/* race-settings-vm.test.mjs — RACE SETTINGS lap ladder as BEHAVIOUR in the
 * game-vm harness (tools/lib/game-vm.cjs runs the real game.js on an inert DOM).
 *
 * FULL moves with the circuit (def.gpLaps: Monaco 78, Spa 44, Silverstone 52),
 * so a lap count picked on one circuit can sit OFF the ladder on the next —
 * above full (78 at Spa) or BELOW it (52 (FULL) at Monaco). The old clamp only
 * handled "above": a Silverstone full race opened Monaco's sheet with no LAPS
 * chip lit (setup-screens audit 2026-09-02, finding 11). Any off-ladder value
 * now snaps to this circuit's FULL — a full race stays a full race.
 *
 * Run: node --test tests/unit/race-settings-vm.test.mjs   (npm run test:game-vm)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fnSource } from "../helpers/fn-source.mjs";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ storage: { trackId: "monza" } }); });
after(() => { if (g) g.close(); });

const tracks = () => (g.sandbox && g.sandbox.Tracks) || (g.ctx && g.ctx.Tracks);
const idx = (id) => tracks().LIST.findIndex((t) => t.id === id);
const full = (id) => tracks().LIST[idx(id)].gpLaps;
// openRaceSettings() runs buildRaceSettings() on the inert DOM; the state it
// leaves in G.raceLaps is the assertion, the chips are not. Outside the VS
// FRIEND room every visit resets the chips to the default (3, or a season
// format's distance), so the carried-over case is the ROOM's: the host picks a
// distance, changes circuit, and comes back to the sheet.
function open(trackId, room = true) {
  g.G.setNetRoom(room);
  try { g.G.trackIdx = idx(trackId); g.G.openRaceSettings("select"); return g.G.raceLaps; }
  finally { g.G.setNetRoom(false); }
}

test("FULL is the circuit's own distance and differs between circuits", () => {
  assert.ok(full("monaco") > full("spa"), `monaco ${full("monaco")} > spa ${full("spa")}`);
  assert.ok(full("silverstone") < full("monaco"), `silverstone ${full("silverstone")} < monaco ${full("monaco")}`);
});

test("a lap count on the ladder survives a circuit change", () => {
  g.G.timeTrial = false; g.G.seasonMode = false;
  g.G.raceLaps = 25;
  assert.equal(open("silverstone"), 25);
  assert.equal(open("monaco"), 25, "25 is on every circuit's ladder");
});

test("a FULL race picked on a shorter circuit is FULL on a longer one (below-full snap)", () => {
  g.G.raceLaps = full("silverstone");
  assert.equal(open("silverstone"), full("silverstone"), "FULL at Silverstone is FULL there");
  assert.equal(open("monaco"), full("monaco"), "…and Monaco's own FULL, not an unlit ladder");
});

test("a FULL race picked on a longer circuit is FULL on a shorter one (above-full snap)", () => {
  g.G.raceLaps = full("monaco");
  assert.equal(open("monaco"), full("monaco"));
  assert.equal(open("spa"), full("spa"));
});

test("time trial keeps its own ladder and never snaps to a grand prix distance", () => {
  g.G.timeTrial = true;
  g.G.raceLaps = 4;
  assert.equal(open("monaco"), 4, "TT default 4 stays lit");
  g.G.timeTrial = false;
});

test("outside the room a visit still resets to the default, which is on every ladder", () => {
  g.G.raceLaps = full("monaco");
  assert.equal(open("spa", false), 3, "the solo flow's default (GAME_LAPS) — a preselection, not a carry-over");
});

// ── the GRID RULE ─────────────────────────────────────────────────────────────

// gridOrderFor() is pure over its closure: lift its source and bind stubs.
const GAME = readFileSync(new URL("../../js/game.js", import.meta.url), "utf8");
function gridRule(rule, o = {}) {
  const src = fnSource(GAME, "function gridOrderFor(base)");
  const rank = (season, a, b) => (season.pts[b] || 0) - (season.pts[a] || 0) || (a < b ? -1 : 1);
  return new Function("isTimeTrial", "isChampionship", "SeasonCal", "raceGrid", "season", "cars", "simRnd",
    src + ";return gridOrderFor;")(() => !!o.tt, () => !!o.champ, { quali: () => !!o.squali, rank },
    rule, o.season || { pts: {} }, o.cars, o.rnd || (() => 0.5));
}
const carsOf = (n) => Array.from({ length: n }, (_, i) => ({ driverId: "d" + i }));

test("REVERSE TOP 10 flips the qualifying top ten and leaves 11+ as they qualified", () => {
  const cars = carsOf(12);
  const out = gridRule("rev10", { cars })(cars.slice());
  assert.deepEqual(out.map((c) => c.driverId), ["d9", "d8", "d7", "d6", "d5", "d4", "d3", "d2", "d1", "d0", "d10", "d11"]);
  assert.equal(gridRule("rev10", { cars })(null), null, "without a session there is nothing to reverse");
});

test("REVERSE STANDINGS grids the last-placed driver first, championship only", () => {
  const cars = carsOf(3);
  const season = { pts: { d0: 40, d1: 10, d2: 25 } };
  assert.deepEqual(gridRule("revchamp", { cars, champ: true, season })(null).map((c) => c.driverId), ["d1", "d2", "d0"]);
  assert.equal(gridRule("revchamp", { cars, season })(null), null, "a one-off Grand Prix has no standings");
  const sprint = cars.slice().reverse();
  assert.equal(gridRule("revchamp", { cars, champ: true, season })(sprint), sprint, "a sprint result still grids the GP");
});

test("a qualifying championship and a time trial ignore the rule; RANDOM spends one draw per car", () => {
  const cars = carsOf(4);
  const q = cars.slice().reverse();
  assert.equal(gridRule("rev10", { cars, champ: true, squali: true })(q), q, "the session's order stands");
  assert.equal(gridRule("random", { cars, tt: true })(null), null);
  let draws = 0;
  const rnd = () => { draws++; return [0.7, 0.1, 0.9, 0.4][draws - 1]; };
  const out = gridRule("random", { cars, rnd })(null);
  assert.equal(draws, cars.length, "exactly the jitter gridUp would have drawn");
  assert.deepEqual(out.map((c) => c.driverId), ["d1", "d3", "d0", "d2"]);
});

test("RANDOM in the live game: the same seed grids the same field, and it is not the pace order", async () => {
  g.G.timeTrial = false; g.G.seasonMode = false;
  const A = g.apex;
  const gridOf = async (rule, seed) => {
    g.G.raceGrid = rule; g.G.seed = seed;
    await g.race("monza");
    return A.fieldState().map((c) => (c.isPlayer ? "YOU" : c.code));
  };
  const r1 = await gridOf("random", 11), r2 = await gridOf("random", 11), t = await gridOf("tier", 11);
  assert.deepEqual(r1, r2);
  assert.notDeepEqual(r1, t);
  assert.equal(t.indexOf("YOU"), 11, "the pace-order grid keeps the player at P12");
  assert.equal(g.G.raceGrid, "tier");
  g.G.raceGrid = "nonsense";
  assert.equal(g.G.raceGrid, "tier", "the façade refuses an unknown rule");
  g.G.raceQuali = true;
  assert.equal(g.G.raceGrid, "quali", "the boolean view moves the rule across the qualifying line");
  g.G.raceGrid = "rev10"; g.G.raceQuali = true;
  assert.equal(g.G.raceGrid, "rev10", "…and only across it");
  g.G.raceQuali = false;
  assert.equal(g.G.raceGrid, "tier");
});

// ── time-trial medals ─────────────────────────────────────────────────────────

test("the medal ladder is monotone and the reference pole slows with the pace slider", async () => {
  const Q = g.sandbox.Quali;
  assert.equal(Q.medalFor(99, 100), "gold");
  assert.equal(Q.medalFor(102, 100), "silver");
  assert.equal(Q.medalFor(106, 100), "bronze");
  assert.equal(Q.medalFor(108, 100), null);
  assert.equal(Q.medalFor(0, 100), null);
  assert.equal(Q.medalFor(90, 0), null, "no pole, no medal");
  await g.race("monza");
  const pole = g.G.referencePole();
  assert.ok(pole > 30 && pole < 300 && Number.isFinite(pole), "a lap of Monza: " + pole);
  const pace = g.G.PACE;
  try {
    g.G.PACE = pace * 0.5;
    assert.ok(g.G.referencePole() > pole * 1.3, "half the pace is a much slower pole");
  } finally { g.G.PACE = pace; }
});

// ── CHANGEABLE (MIXED) conditions ─────────────────────────────────────────────

test("a MIXED race arms a weather arc at the start and walks it; the plan is the seed's", async () => {
  g.G.timeTrial = false; g.G.seasonMode = false; g.G.raceGrid = "tier";
  g.G.raceChangeable = true; g.G.wxArcPlan = null; g.G.seed = 5;
  await g.race("monza", "day", "dry");
  const arc = g.G.weatherArc;
  assert.ok(arc, "an arc is armed");
  assert.equal(arc.from, "dry");
  assert.notEqual(arc.to, "dry");
  assert.ok(arc.dur >= 120 && arc.dur <= 420, "2–7 minutes: " + arc.dur);
  // The derived plan is a function of (seed, race counter): read twice, same answer.
  g.G.wxArcPlan = null;
  const p1 = JSON.parse(JSON.stringify(g.G.wxArcPlan)), p2 = JSON.parse(JSON.stringify(g.G.wxArcPlan));
  assert.deepEqual(p1, p2, "same seed and counter, same plan");
  assert.ok(p1 && p1.to !== "dry" && p1.dur >= 120, JSON.stringify(p1));
  // A host-supplied plan wins over the derived one.
  g.G.wxArcPlan = { to: "fog", dur: 200 };
  await g.race("monza", "day", "dry");
  assert.equal(g.G.weatherArc.to, "fog");
  assert.equal(g.G.weatherArc.dur, 200);
  // Walk it: the weather has moved off dry well before the arc ends…
  g.apex.headless(true); g.apex.go();
  g.apex.step(1 / 30, 30 * 150);
  assert.notEqual(g.G.raceWeather, "dry", "the arc moved the weather");
  // …and the chip's pick comes back when the race is left.
  g.G.quitToMenu();
  assert.equal(g.G.raceWeather, "dry");
  assert.equal(g.G.weatherArc, null);
  g.G.raceChangeable = false; g.G.wxArcPlan = null;
});

// apex.tt()/daily.open() start a session the way race() does; wait the same way.
async function started(start) {
  const before = g.G.cars;
  const r = start();
  await g.settle(() => { const i = g.apex.info(); return i && i.track && g.G.cars !== before; }, 4000);
  return r;
}

test("a time trial never arms the arc, and MIXED off means no arc", async () => {
  g.G.raceChangeable = true; g.G.wxArcPlan = null;
  await started(() => g.apex.tt("monza"));
  assert.equal(g.G.weatherArc, null);
  g.G.quitToMenu();
  g.G.raceChangeable = false;
  await g.race("monza", "day", "wet");
  assert.equal(g.G.weatherArc, null);
  g.G.quitToMenu();
});

// ── the DAILY in the live game ────────────────────────────────────────────────

test("TODAY's challenge stages the day's circuit as a time trial with the day's seed", async () => {
  const p = await started(() => g.G.daily.open("2026-09-03"));
  assert.equal(g.apex.info().timeTrial, true);
  assert.equal(g.apex.info().track, p.trackId);
  assert.equal(g.G.seed, p.seed);
  assert.equal(g.G.raceWeather, p.weather);
  assert.equal(g.G.daily.isActive(), true);
  g.G.quitToMenu();
  assert.equal(g.G.daily.isActive(), false, "leaving the session ends the daily");
});

// ── the RED FLAG in the live game ─────────────────────────────────────────────

test("a red flag re-grids the field in race order with laps and the clock kept, and lights-out resumes the race", async () => {
  g.G.timeTrial = false; g.G.seasonMode = false; g.G.raceGrid = "tier"; g.G.raceChangeable = false;
  await g.race("monza", "day", "dry");
  const A = g.apex;
  A.headless(true); A.go();
  A.step(1 / 30, 30 * 20);   // 20 s of racing: the field has spread out
  const before = A.fieldState();
  const raceT = g.G.raceT;
  assert.ok(raceT > 15, "the clock ran: " + raceT);
  const r = A.redFlag();
  assert.equal(r && r.state, "count");
  assert.equal(A.redFlag(), false, "a second call while counting is refused");
  const after = A.fieldState();
  assert.deepEqual(after.map((c) => c.code), before.map((c) => c.code), "race order is the grid order");
  assert.deepEqual(after.map((c) => c.lap), before.map((c) => c.lap), "laps are kept");
  assert.ok(after.every((c) => c.speed === 0), "the field is standing");
  assert.ok(after.every((c, i) => i === 0 || after[i - 1].gap <= c.gap), "boxes in order");
  assert.equal(g.G.raceT, raceT, "the clock is stopped, not reset");
  assert.equal(g.G.lightsLit, 0);
  // Through the lights: state race, clock continuous, the cars move again.
  A.step(1 / 30, 30 * 9);
  assert.equal(g.apex.info().state, "race");
  assert.ok(g.G.raceT >= raceT, "lights-out resumed the clock: " + g.G.raceT + " >= " + raceT);
  A.step(1 / 30, 30 * 3);
  assert.ok(A.fieldState().some((c) => c.speed > 5), "racing again");
  g.G.quitToMenu();
});
