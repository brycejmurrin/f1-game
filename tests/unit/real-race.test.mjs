/* real-race.test.mjs — the REAL RACE director, in a VM.
 *
 * js/race/real-race.js lays a real Grand Prix's timing script over a live
 * field: the real grid, each AI car's lap-by-lap pace steered to its real gap,
 * its real stops, its retirement lap and the race's safety-car windows. The
 * script is the 2026 Azerbaijan GP built from the OpenF1 fixture by
 * js/data/real-race-tab.js, so every number below is a real one.
 *
 *  1. THE PLAN IS THE REAL STRATEGY, mapped onto the sim distance (a condensed
 *     race keeps the stops in proportion, never two in one lap, never on the last).
 *  2. THE CLOSED LOOP PULLS TOWARD THE REAL GAP: a field that runs the real
 *     timeline exactly gets the open-loop pace only; a car dropped behind its
 *     real gap is told to go faster next lap, one ahead to ease off — clamped.
 *  3. THE FLAGS FLY ON THE LEADER'S LAP and hand back at the window's end.
 *  4. stage() takes the seat and restores every setting it touched on stop().
 *
 * Run: node --test tests/unit/real-race.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/openf1-baku-2026-race.json"), "utf8"));
const host = (v) => JSON.parse(JSON.stringify(v));
const TRACKS = [{ id: "monza", name: "MONZA", country: "Italy" }, { id: "baku", name: "BAKU", country: "Azerbaijan" }];

function load() {
  const sb = { Math, Array, Object, Number, String, Boolean, Date, isFinite, isNaN, console, JSON, Set, Map, RegExp, Infinity };
  const ctx = vm.createContext(sb);
  seedLog(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/data/teams.js"), "utf8"), ctx, { filename: "teams.js" });
  vm.runInContext("var Tracks = " + JSON.stringify({ LIST: TRACKS }) + ";", ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/data/real-race-tab.js"), "utf8"), ctx, { filename: "real-race-tab.js" });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/race/real-race.js"), "utf8"), ctx, { filename: "real-race.js" });
  const Teams = vm.runInContext("Teams", ctx);
  const KEYS = [["racing bulls", "RB"], ["red bull", "RBR"], ["mercedes", "MER"], ["ferrari", "FER"], ["mclaren", "MCL"], ["alpine", "ALP"],
    ["haas", "HAA"], ["williams", "WIL"], ["audi", "AUD"], ["aston", "AMR"], ["cadillac", "CAD"]];
  const findTeam = (name) => { const n = String(name || "").toLowerCase(); const k = KEYS.find((p) => n.indexOf(p[0]) !== -1); return k ? Teams.LIST.find((t) => t.short === k[1]) || null : null; };
  const raw = host(FIXTURE); raw.session.meeting_name = FIXTURE.meeting_name;
  const script = vm.runInContext("DataRealRace", ctx).build(raw, findTeam, TRACKS);
  return { R: vm.runInContext("RealRace", ctx), Teams, script, ctx };
}

/** A fake field in Teams.LIST order (makeCars' order), the player in one seat. */
function makeCars(Teams, playerSeat = "mercedes:0") {
  const cars = [];
  for (const t of Teams.LIST) {
    if (t.custom || t.legends) continue;
    t.drivers.forEach((d, di) => {
      const id = t.id + ":" + di;
      cars.push({ team: t, code: d.code, name: d.name, driverId: id, human: id === playerSeat, isPlayer: id === playerSeat,
        tierV: Teams.TIER_V[t.tier], skill: 0.95 + di * 0.01, lap: 0, totalT: 0, lastLap: 0, retired: false, finished: false,
        pitPlan: { pitLossLaps: 0.2, lapsAt: [2], seq: ["soft", "hard"], start: "soft", stops: 1 }, tyreClass: "soft", gridPos: 0, dnfAt: null, dnfWhy: null });
    });
  }
  return cars;
}

function makeG(Teams, cars) {
  const calls = [];
  const G = {
    state: "menu", cars, ranked: cars, teamIdx: 2, driverIdx: 1, raceLaps: 3, raceWeather: "wet", raceTimeOfDay: "night", duel: true,
    raceTyreWear: "off", raceChangeable: true, flow: "career", session: "tt", timeTrial: true, trackIdx: 0,
    resetRaceDraft: () => calls.push(["resetRaceDraft"]),
    startRace: () => calls.push(["startRace"]),
    gridUp: (order) => { calls.push(["gridUp", order.map((c) => c.code)]); order.forEach((c, i) => { c.gridPos = i + 1; }); },
    snapGameCam: () => calls.push(["snapGameCam"]),
    tyres: { on: () => true, classRecord: (cls) => ({ cls }), fit: (c, rec) => { c.tyre = rec; } },
    announce: (m) => calls.push(["announce", m]),
    holdCaution: (level, cause) => calls.push(["hold", level, cause]),
    applyCaution: (d) => calls.push(["apply", d.level]),
  };
  return { G, calls };
}

test("lap mapping: identity at full distance, proportional and in range when condensed", () => {
  const { R } = load();
  assert.equal(R.realLapFor(17, 51, 51), 17);
  assert.equal(R.simLapFor(17, 51, 51), 17);
  assert.equal(R.realLapFor(1, 10, 51), 5);
  assert.equal(R.realLapFor(10, 10, 51), 51);
  assert.equal(R.simLapFor(31, 10, 51), 6);
  assert.equal(R.simLapFor(1, 10, 51), 1, "never below lap 1");
  assert.equal(R.simLapFor(51, 10, 51), 10);
  for (let n = 2; n <= 10; n++) assert.ok(R.realLapFor(n, 10, 51) > R.realLapFor(n - 1, 10, 51), "monotonic");
});

test("the pace table: a field median per lap, each driver relative to it, pit and missing laps neutral", () => {
  const { R, script } = load();
  const { ref, rel } = R.paceTable(script);
  // 31-38 crawl behind the safety car (lap 36 is 251 s); lap 37 has NO clean lap — the whole field stopped under the SC — and reads neutral.
  const blank = [];
  for (let lap = 1; lap <= 51; lap++) { if (ref[lap] == null) blank.push(lap); else assert.ok(ref[lap] > 90, "lap " + lap + " median " + ref[lap]); }
  assert.deepEqual(blank, [37]);
  const rus = rel[63];
  assert.ok(Math.abs(rus[2] - 109.535 / ref[2]) < 1e-9);
  assert.equal(rus[31], null, "the in-lap");
  assert.equal(rus[32], null, "the out-lap");
  assert.equal(rus[37], null, "the second out-lap");
  assert.equal(rel[18][8], null, "the retirement lap has no time");
  const cum = R.cumTable(script);
  assert.equal(cum[63].length, 52);
  assert.ok(Math.abs(cum[63][51] - script.drivers.find((d) => d.num === 63).laps.reduce((a, b) => a + b, 0)) < 1e-6);
  assert.equal(cum[18].length, 8, "seven laps, then the row ends at the missing time");
});

test("the real strategy becomes the pit plan the pit lane executes, at full and condensed distance", () => {
  const { R, script } = load();
  const rus = script.drivers.find((d) => d.num === 63);
  const full = R.planFor(rus, 51, 51, 0.2);
  assert.deepEqual(host(full), { start: "medium", seq: ["medium", "soft", "soft"], stints: [31, 5, 15], stops: 2, lapsAt: [31, 36], cost: 0, pitLossLaps: 0.2, real: true });
  const short = R.planFor(rus, 10, 51, 0);
  assert.deepEqual(host(short.lapsAt), [6, 7]);
  assert.equal(short.stints.reduce((a, b) => a + b, 0), 10, "the stints cover the distance exactly");
  assert.equal(short.pitLossLaps, 0.18, "the planner's fallback when no plan priced a stop");
  const tiny = R.planFor(rus, 3, 51, 0.2);
  assert.deepEqual(host(tiny.lapsAt), [2], "one stop fits in three laps; the second would be on the last lap or double up");
  assert.deepEqual(host(tiny.seq), ["medium", "soft"]);
  assert.equal(R.planFor({ stints: [] }, 51, 51, 0.2), null);
  const str = script.drivers.find((d) => d.num === 18);
  assert.ok(Math.abs(R.dnfAtFor(str, 51) - 7.5 / 51) < 1e-9);
  assert.equal(R.dnfAtFor(rus, 51), null, "a finisher never retires");
  assert.deepEqual(host(R.cautionsFor(script, 51)), [{ level: 3, from: 31, to: 35, cause: "SAFETY CAR" }, { level: 3, from: 36, to: 38, cause: "SAFETY CAR" }]);
  assert.deepEqual(host(R.cautionsFor(script, 10)), [{ level: 3, from: 6, to: 7, cause: "SAFETY CAR" }, { level: 3, from: 7, to: 7, cause: "SAFETY CAR" }]);
});

test("every 2026 driver takes a roster seat by code; a stranger takes a free seat of their team", () => {
  const { R, script, Teams } = load();
  const seats = R.mapField(script, Teams.LIST);
  assert.equal(seats.length, 22);
  assert.equal(new Set(seats.map((s) => s.driverId)).size, 22);
  assert.equal(seats.find((s) => s.num === 63).driverId, "mercedes:0");
  assert.equal(seats.find((s) => s.num === 3).driverId, "redbull:0");
  // A reserve driver the roster has never heard of, entered for Mercedes.
  const odd = host(script);
  odd.drivers.find((d) => d.num === 12).code = "XYZ";
  const seats2 = R.mapField(odd, Teams.LIST);
  assert.equal(seats2.find((s) => s.num === 12).driverId, "mercedes:1", "the seat Antonelli left free");
  // The same stranger with no team match goes unseated; the seat reads as did-not-start.
  odd.drivers.find((d) => d.num === 12).teamId = null;
  assert.equal(R.mapField(odd, Teams.LIST).length, 21);
});

test("the pace multiplier: behind means faster, ahead means slower, a slow real lap means slower, all clamped", () => {
  const { R } = load();
  assert.equal(R.paceMul(0, 110, 1), 1);
  assert.ok(R.paceMul(5, 110, 1) > 1);
  assert.ok(R.paceMul(-5, 110, 1) < 1);
  assert.ok(R.paceMul(0, 110, 1.02) < 1 && R.paceMul(0, 110, 0.98) > 1);
  assert.equal(R.paceMul(1000, 110, 1), R.MUL_MAX);
  assert.equal(R.paceMul(-1000, 110, 1), R.MUL_MIN);
  assert.equal(R.paceMul(NaN, 110, 1), 1, "no reference yet: open loop only");
  assert.ok(Math.abs(R.paceMul(11, 110, 1) - (1 + R.KP * 0.1)) < 1e-9);
});

test("stage() seats the player, sets the session, and stop() restores every setting it touched", () => {
  const { R, script, Teams } = load();
  const cars = makeCars(Teams);
  const { G, calls } = makeG(Teams, cars);
  const rr = R.create(G);
  assert.equal(rr.isActive(), false);
  const p = rr.stage(script, { seat: "LEC", laps: 10 });
  assert.deepEqual(host(p), { trackId: "baku", laps: 10, seat: "LEC" });
  assert.equal(G.trackIdx, 1);
  assert.equal(G.teamIdx, Teams.LIST.findIndex((t) => t.id === "ferrari"));
  assert.equal(G.driverIdx, 0);
  assert.equal(G.raceLaps, 10);
  assert.equal(G.raceWeather, "dry");
  assert.equal(G.raceTimeOfDay, "day");
  assert.equal(G.flow, "gp"); assert.equal(G.session, "race"); assert.equal(G.timeTrial, false); assert.equal(G.duel, false);
  assert.equal(G.raceTyreWear, "real", "wear OFF would mean no stops — the stops are the story");
  assert.equal(G.raceChangeable, false);
  assert.ok(calls.some((c) => c[0] === "resetRaceDraft"));
  assert.equal(rr.isActive(), true);
  assert.equal(rr.current(), script);
  // An unknown seat falls back to the first driver; an unknown circuit refuses.
  assert.equal(rr.stage(script, { seat: "ZZZ" }).seat, "RUS");
  assert.equal(rr.stage({ ...script, trackId: "spa" }), null);
  assert.equal(rr.launch(script, { seat: "RUS" }).seat, "RUS");
  assert.ok(calls.some((c) => c[0] === "startRace"));
  rr.stop();
  assert.equal(rr.isActive(), false);
  assert.deepEqual([G.teamIdx, G.driverIdx, G.raceLaps, G.raceWeather, G.raceTimeOfDay, G.duel, G.raceTyreWear, G.raceChangeable],
    [2, 1, 3, "wet", "night", true, "off", true]);
});

test("arming lays the real grid, plans, compounds and retirements over the field on the first countdown frame", () => {
  const { R, script, Teams } = load();
  const cars = makeCars(Teams, "ferrari:0");   // the player is LEC
  const { G, calls } = makeG(Teams, cars);
  const rr = R.create(G);
  rr.stage(script, { seat: "LEC" });
  rr.update(1 / 60);   // still in the menu: nothing happens
  assert.ok(!calls.some((c) => c[0] === "gridUp"));
  G.state = "count";
  rr.update(1 / 60);
  const grid = calls.find((c) => c[0] === "gridUp");
  assert.ok(grid, "one re-grid");
  assert.deepEqual(grid[1].slice(0, 4), ["RUS", "LEC", "PIA", "HAD"]);
  assert.equal(grid[1][21], "STR");
  assert.ok(calls.some((c) => c[0] === "snapGameCam"));
  const by = (code) => cars.find((c) => c.code === code);
  assert.equal(by("LEC").gridPos, 2, "the player starts from the real slot");
  assert.deepEqual(host(by("RUS").pitPlan.lapsAt), [31, 36]);
  assert.equal(by("RUS").tyreClass, "medium");
  assert.deepEqual(host(by("RUS").tyre), { cls: "medium" });
  assert.deepEqual(host(by("LEC").tyre), { cls: "soft" }, "the player is fitted with the real start compound too (Leclerc started on softs)");
  assert.ok(Math.abs(by("STR").dnfAt - 7.5 / 51) < 1e-9);
  assert.equal(by("RUS").dnfAt, null, "a finisher: no random reliability failure either");
  assert.equal(by("LEC").dnfAt, null, "never the human");
  // One base pace for the whole field: the differences are the data's.
  const ai = cars.filter((c) => !c.human);
  assert.equal(new Set(ai.map((c) => (c.tierV * c.skill).toFixed(6))).size, 1);
  assert.ok(calls.some((c) => c[0] === "announce" && /REAL RACE/.test(c[1])));
  const st = rr.status();
  assert.equal(st.armed, true); assert.equal(st.laps, 51); assert.equal(st.seat, "LEC");
  assert.equal(st.cars.length, 22);
  // Second frame: no second re-grid.
  rr.update(1 / 60);
  assert.equal(calls.filter((c) => c[0] === "gridUp").length, 1);
  // Back in the menu the field is released; the next countdown arms again (pm-restart).
  G.state = "menu"; rr.update(1 / 60);
  assert.equal(rr.status().armed, false);
  G.state = "count"; rr.update(1 / 60);
  assert.equal(calls.filter((c) => c[0] === "gridUp").length, 2);
});

test("a seat with no real driver did not start; a real driver of a team the roster lacks is left out", () => {
  const { R, script, Teams } = load();
  const odd = host(script);
  odd.drivers = odd.drivers.filter((d) => d.num !== 77);   // Bottas withdrawn: the Cadillac seat has no data
  const cars = makeCars(Teams);
  const { G } = makeG(Teams, cars);
  const rr = R.create(G);
  rr.stage(odd, { seat: "RUS" });
  G.state = "count"; rr.update(1 / 60);
  const bot = cars.find((c) => c.code === "BOT");
  assert.equal(bot.dnfAt, 0.002); assert.equal(bot.dnfWhy, "dns");
  assert.equal(bot.gridPos, 22, "an empty seat starts from the back");
});

test("the closed loop: the field on its real timeline gets open-loop pace; a car dropped behind is told to push", () => {
  const { R, script, Teams } = load();
  const cars = makeCars(Teams, "ferrari:0");
  const { G, calls } = makeG(Teams, cars);
  const rr = R.create(G);
  rr.stage(script, { seat: "LEC" });
  G.state = "count"; rr.update(1 / 60);
  G.state = "race";
  const cum = R.cumTable(script), pace = R.paceTable(script);
  const K0 = 1.4;   // the sim runs 40 % slower than reality — any scale must do
  const numOf = (c) => script.drivers.find((d) => d.code === c.code).num;
  // Drive every AI car across the line on the real timeline, lap by lap, in real order.
  const cross = (lap, tweak = {}) => {
    const order = cars.filter((c) => !c.human && cum[numOf(c)].length > lap).sort((a, b) => cum[numOf(a)][lap] - cum[numOf(b)][lap]);
    for (const c of order) { c.lap = lap + 1; c.totalT = K0 * cum[numOf(c)][lap] + (tweak[c.code] || 0); c.lastLap = K0 * script.drivers.find((d) => d.num === numOf(c)).laps[lap - 1]; rr.update(1 / 60); }
  };
  cross(1); cross(2); cross(3);
  const st = rr.status();
  assert.ok(Math.abs(st.K - K0) < 1e-6, "the scale is read off the reference car: " + st.K);
  const ver = st.cars.find((c) => c.code === "VER");
  assert.ok(Math.abs(ver.err) < 1e-6, "on the real timeline the gap error is zero");
  assert.ok(Math.abs(ver.mul - 1 / pace.rel[3][4]) < 1e-4, "open loop only: the real lap-4 pace relative to the field (status rounds to 4 places)");
  const base = cars.find((c) => c.code === "VER").skill / ver.mul;
  // Lap 4: Verstappen crosses 6 s later than his real gap says; Antonelli 4 s earlier.
  cross(4, { VER: 6, ANT: -4 });
  const st2 = rr.status();
  const ver2 = st2.cars.find((c) => c.code === "VER"), ant2 = st2.cars.find((c) => c.code === "ANT");
  assert.ok(Math.abs(ver2.err - 6) < 1e-6, "err is the seconds behind the real gap: " + ver2.err);
  assert.ok(Math.abs(ant2.err + 4) < 1e-6);
  assert.ok(ver2.mul > 1 / pace.rel[3][5] + 0.01, "behind: faster than the open loop");
  assert.ok(ant2.mul < 1 / pace.rel[12][5] - 0.005, "ahead: slower than the open loop");
  assert.ok(Math.abs(cars.find((c) => c.code === "VER").skill - base * ver2.mul) < 1e-3, "skill is base x multiplier (status rounds mul)");
  assert.ok(cars.find((c) => c.code === "LEC").skill === 0.95, "the player's skill is never touched");
  assert.ok(!calls.some((c) => c[0] === "hold"), "no flag before lap 31");
});

test("safety-car windows fly on the leader's lap and hand back at the window's end", () => {
  const { R, script, Teams } = load();
  const cars = makeCars(Teams);
  const { G, calls } = makeG(Teams, cars);
  const rr = R.create(G);
  rr.stage(script, { seat: "RUS" });
  G.state = "count"; rr.update(1 / 60);
  G.state = "race";
  const leader = cars.find((c) => c.code === "LEC");
  G.ranked = [leader].concat(cars.filter((c) => c !== leader));
  const holds = () => calls.filter((c) => c[0] === "hold").map((c) => [c[1], c[2] || ""]);
  leader.lap = 30; rr.update(1 / 60);
  assert.deepEqual(holds(), []);
  leader.lap = 31; rr.update(1 / 60);
  assert.deepEqual(holds(), [[3, "SAFETY CAR"]]);
  leader.lap = 33; rr.update(1 / 60); rr.update(1 / 60);
  assert.equal(holds().length, 1, "held, not re-raised every frame");
  leader.lap = 36; rr.update(1 / 60);
  assert.equal(holds().length, 1, "the second window starts as the first ends: one continuous hold");
  leader.lap = 39; rr.update(1 / 60);
  assert.deepEqual(holds(), [[3, "SAFETY CAR"], [0, ""]]);
  // A condensed race keeps the windows in proportion.
  rr.stop();
  rr.stage(script, { seat: "RUS", laps: 10 });
  G.state = "count"; rr.update(1 / 60); G.state = "race";
  calls.length = 0;
  leader.lap = 5; rr.update(1 / 60); assert.deepEqual(holds(), []);
  leader.lap = 6; rr.update(1 / 60); assert.deepEqual(holds(), [[3, "SAFETY CAR"]]);
  leader.lap = 8; rr.update(1 / 60); assert.deepEqual(holds(), [[3, "SAFETY CAR"], [0, ""]]);
  // Leaving the race releases a flag still held.
  leader.lap = 6; rr.update(1 / 60);
  G.state = "results"; rr.update(1 / 60);
  assert.deepEqual(holds().slice(-1), [[0, ""]]);
  // A red flag fires once, through the one-shot path.
  const red = { ...script, cautions: [{ level: 4, from: 3, to: 3, cause: "RED FLAG" }] };
  rr.stop(); rr.stage(red, { seat: "RUS" });
  G.state = "count"; rr.update(1 / 60); G.state = "race"; calls.length = 0;
  leader.lap = 3; rr.update(1 / 60); rr.update(1 / 60);
  assert.deepEqual(host(calls.filter((c) => c[0] === "apply")), [["apply", 4]]);
});
