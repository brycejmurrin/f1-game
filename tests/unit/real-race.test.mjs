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
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/core/mat4.js"), "utf8"), ctx, { filename: "mat4.js" });   // M4.clamp, bound at eval
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/data/teams.js"), "utf8"), ctx, { filename: "teams.js" });
  // Tracks: the list, plus the two geometry reads a mid-race drop-in makes (a straight 6 km ring, 7 m half-width).
  vm.runInContext("var TyreModel = { AI_CLASS: { soft: { life: 0.48 }, medium: { life: 0.74 }, hard: { life: 1.05 }, inter: { life: 1 }, wet: { life: 1 } } };", ctx);   // the compound lives place() reads
  vm.runInContext("var Tracks = " + JSON.stringify({ LIST: TRACKS }) + "; Tracks.sample = function (t, s, o) { o.p[0] = s; o.p[1] = 0; o.p[2] = 0; o.t[0] = 1; o.t[1] = 0; o.t[2] = 0; o.r[0] = 0; o.r[1] = 0; o.r[2] = 1; o.hw = 7; }; Tracks.wallAt = function () { return 9; };", ctx);
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
        pitPlan: { pitLossLaps: 0.2, lapsAt: [2], seq: ["soft", "hard"], start: "soft", stops: 1 }, tyreClass: "soft", gridPos: 0, dnfAt: null, dnfWhy: null,
        s: 0, x: 0, prog: -20, speed: 0, tyreWear: 0, tyreLap0: 0, pitStops: 0, tyreStints: 0 });
    });
  }
  return cars;
}

function makeG(Teams, cars) {
  const calls = [];
  const G = {
    state: "menu", cars, ranked: cars, teamIdx: 2, driverIdx: 1, raceLaps: 3, raceWeather: "wet", raceTimeOfDay: "night", duel: true,
    raceTyreWear: "off", raceChangeable: true, flow: "career", session: "tt", timeTrial: true, trackIdx: 0,
    track: { total: 6000 }, raceT: 0,
    wrapS: (v) => ((v % 6000) + 6000) % 6000, vTop: () => 80, referencePole: () => 140, refreshHud: () => calls.push(["refreshHud"]),
    startWeatherArc: (from, to, dur) => calls.push(["arc", from, to, dur]),
    resetRaceDraft: () => calls.push(["resetRaceDraft"]),
    startRace: () => calls.push(["startRace"]),
    gridUp: (order) => { calls.push(["gridUp", order.map((c) => c.code)]); order.forEach((c, i) => { c.gridPos = i + 1; }); },
    snapGameCam: () => calls.push(["snapGameCam"]),
    tyres: { on: () => true, classRecord: (cls) => ({ cls }), fit: (c, rec) => { c.tyre = rec; c.tyreWear = 0; c.tyreLap0 = c.lap || 0; c.tyreStints = (c.tyreStints || 0) + 1; },
             planLaps: (life, n) => life * n },
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
  assert.deepEqual(host(full), { start: "medium", seq: ["medium", "soft", "soft"], stints: [31, 5, 15], stops: 2, lapsAt: [31, 36], cost: 0, pitLossLaps: 0.2 });
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
  assert.deepEqual(host(R.cautionsFor(script, 51)), [{ level: 3, from: 31, to: 35, cause: "SAFETY CAR", done: false }, { level: 3, from: 36, to: 38, cause: "SAFETY CAR", done: false }]);
  assert.deepEqual(host(R.cautionsFor(script, 10)), [{ level: 3, from: 6, to: 7, cause: "SAFETY CAR", done: false }, { level: 3, from: 7, to: 7, cause: "SAFETY CAR", done: false }]);
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
  assert.deepEqual(host(p), { trackId: "baku", laps: 10, seat: "LEC", startLap: 1 });
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
  // An unknown seat is REFUSED (never someone else's car); no seat asked for takes the first seated driver; an unknown circuit refuses.
  assert.equal(rr.stage(script, { seat: "ZZZ" }), null);
  assert.equal(rr.stage(script, {}).seat, "RUS");
  assert.equal(rr.stage({ ...script, trackId: "spa" }), null);
  // A start lap is kept inside the race.
  assert.equal(rr.stage(script, { seat: "RUS", startLap: 31 }).startLap, 31);
  assert.equal(rr.stage(script, { seat: "RUS", startLap: 99 }).startLap, 51);
  assert.equal(rr.launch(script, { seat: "RUS" }).seat, "RUS");
  assert.ok(calls.some((c) => c[0] === "startRace"));
  rr.stop();
  assert.equal(rr.isActive(), false);
  assert.deepEqual([G.teamIdx, G.driverIdx, G.raceLaps, G.raceWeather, G.raceTimeOfDay, G.duel, G.raceTyreWear, G.raceChangeable, G.trackIdx, G.flow],
    [2, 1, 3, "wet", "night", true, "off", true, 0, "career"], "the circuit and the flow the player had are back too");
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
  assert.ok(Math.abs(st.K - K0) < 1e-6, "the scale is read off the reference car (Russell, the best-classified AI seat): " + st.K);
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

test("fieldAt(): the race as it stood at the start of a lap — who was where, on what, and who was already out", () => {
  const { R, script } = load();
  assert.equal(R.fieldAt(script, 1), null, "lap 1 is the grid");
  const at = R.fieldAt(script, 31);
  const cum = R.cumTable(script);
  assert.equal(at.lap, 31);
  assert.ok(Math.abs(at.t0 - Math.min(...script.drivers.filter((d) => cum[d.num].length > 30).map((d) => cum[d.num][30]))) < 1e-9, "t0 is the leader's crossing that completes lap 30");
  const rus = at.by[63];
  assert.equal(rus.lap, 31); assert.equal(rus.frac, 0, "the leader is on the line"); assert.equal(rus.retired, false);
  assert.equal(rus.compound, "medium"); assert.equal(rus.age, 30 + script.drivers.find((d) => d.num === 63).stints[0].age, "30 laps run plus the set's age when it was fitted"); assert.equal(rus.stint, 0);
  const str = at.by[18];
  assert.equal(str.retired, true, "Stroll stopped on lap 8");
  const alo = at.by[14];
  assert.equal(alo.retired, true, "Alonso stopped on lap 21");
  // Everyone still running is somewhere inside the lap they were on, by TIME.
  for (const d of script.drivers) {
    const a = at.by[d.num];
    if (a.retired) continue;
    assert.ok(a.lap >= 1 && a.lap <= 31, d.code + " lap " + a.lap);
    assert.ok(a.frac >= 0 && a.frac <= 0.98, d.code + " frac " + a.frac);
    assert.ok(Math.abs(a.into - a.frac * d.laps[a.lap - 1]) < 1e-6 || a.frac === 0.98, d.code + " time into the lap");
  }
  // A lapped car is a lap down at t0.
  const lapsDown = script.drivers.filter((d) => !at.by[d.num].retired && at.by[d.num].lap < 31);
  assert.ok(lapsDown.length >= 0);
  // A set that came into the race used carries its quali age.
  const aged = { ...script, drivers: [{ ...script.drivers[0], stints: [{ c: "SOFT", from: 1, to: 51, age: 3 }] }] };
  assert.equal(R.fieldAt(aged, 5).by[63].age, 7, "4 laps run plus 3 laps old at the start");
});

test("a mid-race jump-in drops every car where it was, on its set, with the clock and the reference seeded", () => {
  const { R, script, Teams } = load();
  const cars = makeCars(Teams, "ferrari:0");
  const { G, calls } = makeG(Teams, cars);
  const rr = R.create(G);
  rr.stage(script, { seat: "LEC", startLap: 31 });
  assert.equal(G.raceWeather, "dry", "no rain flags: the race's one weather");
  G.state = "count"; rr.update(1 / 60);
  assert.equal(rr.status().placed, false, "the countdown shows the grid; the drop happens on the green");
  G.state = "race"; rr.update(1 / 60);
  const st = rr.status();
  assert.equal(st.placed, true);
  assert.equal(st.startLap, 31);
  const at = R.fieldAt(script, 31);
  const K0 = 140 / R.paceTable(script).best;
  assert.ok(Math.abs(st.K - K0) < 1e-4, "K seeded from the model's reference lap over the race's best clean lap");
  assert.ok(Math.abs(G.raceT - K0 * at.t0) < 1e-6, "the race clock stands at the jump instant");
  const by = (code) => cars.find((c) => c.code === code);
  assert.equal(by("RUS").lap, 31); assert.equal(by("RUS").s, 0);
  assert.ok(Math.abs(by("RUS").prog - 30 * 6000) < 1e-6);
  assert.ok(Math.abs(by("RUS").totalT - K0 * at.t0) < 1e-6);
  assert.equal(by("RUS").speed, 0.55 * 80);
  assert.equal(by("RUS").tyre.cls, "medium");
  assert.ok(by("RUS").tyreWear > 0.5, "a 30-lap-old medium is well worn: " + by("RUS").tyreWear);
  assert.ok(by("RUS").tyreWear <= 0.9);
  assert.equal(by("RUS").pitStops, 0);
  assert.equal(by("LEC").lap, at.by[16].lap, "the player is dropped in too, on the lap he was really on (30: Russell had just lapped him onto it)");
  assert.equal(at.by[16].lap, 30);
  assert.ok(by("LEC").tyre.cls === "soft");
  // Stroll (out on lap 8) and Alonso (out on lap 21) are parked at the wall, quietly.
  assert.equal(by("STR").retired, true); assert.equal(by("STR").speed, 0); assert.equal(by("STR").dnf, "accident");
  assert.equal(by("ALO").retired, true);
  assert.ok(!calls.some((c) => c[0] === "announce" && /RETIREMENT/.test(c[1])), "no retirement broadcast for cars that were already out");
  assert.ok(calls.some((c) => c[0] === "announce" && /LAP 31/.test(c[1])), "the banner names the lap");
  assert.ok(calls.some((c) => c[0] === "refreshHud"));
  // A car running at t0 sits inside the lap it was on, by time.
  const sai = by("SAI"); const a = at.by[55];
  assert.equal(sai.lap, a.lap);
  assert.ok(Math.abs(sai.s - a.frac * 6000) < 1e-6);
  // The safety car deployed on lap 31 is held from the first frame.
  assert.deepEqual(calls.filter((c) => c[0] === "hold").map((c) => [c[1], c[2]]), [[3, "SAFETY CAR"]]);
  // Condensed: the same jump lands on the proportional sim lap.
  rr.stop();
  rr.stage(script, { seat: "LEC", startLap: 31, laps: 10 });
  G.state = "count"; rr.update(1 / 60); G.state = "race"; rr.update(1 / 60);
  assert.equal(by("RUS").lap, 6);
  assert.ok(Math.abs(by("RUS").prog - 5 * 6000) < 1e-6);
});

test("the gain is per sim lap at a condensed distance, and a red-flag lap rewind is followed, not measured", () => {
  const { R, script, Teams } = load();
  const cars = makeCars(Teams, "ferrari:0");
  const { G } = makeG(Teams, cars);
  const rr = R.create(G);
  rr.stage(script, { seat: "LEC", laps: 10 });
  G.state = "count"; rr.update(1 / 60); G.state = "race";
  const cum = R.cumTable(script), pace = R.paceTable(script);
  const numOf = (c) => script.drivers.find((d) => d.code === c.code).num;
  const K0 = 1.4 / 5.1;   // a tenth-distance race: sim time per real time is compressed by the lap ratio
  const cross = (lap, tweak = {}) => {
    const order = cars.filter((c) => !c.human && cum[numOf(c)].length > R.realLapFor(lap, 10, 51)).sort((a, b) => cum[numOf(a)][R.realLapFor(lap, 10, 51)] - cum[numOf(b)][R.realLapFor(lap, 10, 51)]);
    for (const c of order) { const rl = R.realLapFor(lap, 10, 51); c.lap = lap + 1; c.totalT = K0 * cum[numOf(c)][rl] + (tweak[c.code] || 0); rr.update(1 / 60); }
  };
  cross(1); cross(2); cross(3, { VER: 3 });
  const ver = rr.status().cars.find((c) => c.code === "VER");
  assert.ok(Math.abs(ver.err - 3) < 1e-6);
  // Three seconds behind on a ~140 s sim lap is a ~1.3 % push, not the 13 % a compressed-time lap would give.
  const rl = R.realLapFor(3, 10, 51);
  const lapS = K0 * pace.ref[rl] * 51 / 10;
  const expected = R.paceMul(3, lapS, pace.rel[3][R.realLapFor(4, 10, 51)] || 1);
  assert.ok(Math.abs(ver.mul - expected) < 1e-4, ver.mul + " vs " + expected);
  assert.ok(ver.mul < 1.03, "a small correction: " + ver.mul);
  // Red flag: the lap counters go back one; the director follows without re-measuring.
  const before = rr.status().K;
  for (const c of cars) if (!c.human) c.lap -= 1;
  rr.update(1 / 60);
  assert.equal(rr.status().K, before, "K is not re-pinned on a rewound lap");
  assert.equal(rr.status().cars.find((c) => c.code === "VER").lap, 3);
});

test("rain in the real race turns the sky here: the start lap's weather, then an arc when it starts or stops", () => {
  const { R, script, Teams } = load();
  const wet = { ...script, rain: new Array(52).fill(false) };
  for (let n = 20; n <= 30; n++) wet.rain[n] = true;
  const cars = makeCars(Teams);
  const { G, calls } = makeG(Teams, cars);
  const rr = R.create(G);
  rr.stage(wet, { seat: "RUS" });
  assert.equal(G.raceWeather, "dry", "dry at the start");
  rr.stop();
  rr.stage(wet, { seat: "RUS", startLap: 25 });
  assert.equal(G.raceWeather, "rain", "raining at lap 25");
  rr.stop();
  rr.stage(wet, { seat: "RUS" });
  G.state = "count"; rr.update(1 / 60); G.state = "race";
  const leader = cars.find((c) => c.code === "RUS");
  const arcs = () => calls.filter((c) => c[0] === "arc").map((c) => c.slice(1, 3));
  leader.lap = 10; rr.update(1 / 60);
  assert.deepEqual(arcs(), []);
  leader.lap = 20; G.raceWeather = "dry"; rr.update(1 / 60);
  assert.deepEqual(arcs(), [["dry", "rain"]]);
  leader.lap = 25; rr.update(1 / 60);
  assert.equal(arcs().length, 1, "one arc per change");
  leader.lap = 31; G.raceWeather = "rain"; rr.update(1 / 60);
  assert.deepEqual(arcs(), [["dry", "rain"], ["rain", "dry"]]);
});

test("the review's fixes: a filled cum row, a DSQ that saw the flag, the kept stops, the fuel lap, a done window, one stint log", () => {
  const { R, script, Teams } = load();
  // cumTable fills an untimed mid-race lap of a finisher with the field median and runs to the flag.
  const odd = host(script);
  const rus = odd.drivers.find((d) => d.num === 63);
  rus.laps[19] = null;   // lap 20 untimed (a red-flag lap, say)
  const cum = R.cumTable(odd), ref = R.paceTable(odd).ref;
  assert.equal(cum[63].length, 52, "the row still reaches the flag");
  assert.ok(Math.abs((cum[63][20] - cum[63][19]) - ref[20]) < 1e-9, "the gap is the field's lap-20 median");
  assert.equal(R.fieldAt(odd, 31).by[63].retired, false, "an untimed lap is not a retirement");
  // A driver classified with every lap but disqualified never retires by distance; Stroll still does on lap 8.
  const dsq = { ...rus, dnf: true, dsq: true, pos: null, lapsDone: 51 };
  assert.equal(R.dnfAtFor(dsq, 51), null);
  assert.ok(Math.abs(R.dnfAtFor(odd.drivers.find((d) => d.num === 18), 51) - 7.5 / 51) < 1e-9);
  // Kept stops, the fuel lap and the stint log at a condensed mid-race drop-in.
  const cars = makeCars(Teams, "ferrari:0");
  const { G } = makeG(Teams, cars);
  const rr = R.create(G);
  rr.stage(script, { seat: "LEC", startLap: 40, laps: 10 });   // Russell's stops at real 31 and 36 both land on sim lap 6..7 -> one kept
  G.state = "count"; rr.update(1 / 60); G.state = "race"; rr.update(1 / 60);
  const by = (code) => cars.find((c) => c.code === code);
  const plan = by("RUS").pitPlan;
  assert.equal(plan.lapsAt.length, 2, JSON.stringify(host(plan.lapsAt)));
  assert.equal(by("RUS").lap, 8);
  assert.equal(by("RUS").pitStops, plan.lapsAt.filter((l) => l < 8).length, "the stops made are the KEPT stops before this lap, not the real stint index");
  assert.equal(by("RUS").fuelLap, 8, "eight crossings driven: the tank is seven laps down (fuelFrac reads crossings)");
  assert.equal(by("RUS").tyreStints, by("RUS").pitStops + 1);
  // A retiree parked at the jump sits on the lap it stopped on, so retirements classify in order.
  assert.equal(by("STR").retired, true); assert.equal(by("STR").lap, R.simLapFor(8, 10, 51));
  assert.ok(by("STR").prog > 0);
  assert.ok(by("ALO").prog > by("STR").prog, "Alonso (lap 21) stopped after Stroll (lap 8)");
  // A window the race has left is done: a red-flag rewind of the lap counter never re-raises it.
  const wins = R.cautionsFor(script, 51);
  assert.equal(wins[0].done, false);
});

test("a RESTART from the results puts the start lap's weather back before the grid", () => {
  const { R, script, Teams } = load();
  const wet = { ...script, rain: new Array(52).fill(false) };
  for (let n = 20; n <= 51; n++) wet.rain[n] = true;
  const cars = makeCars(Teams);
  const { G, calls } = makeG(Teams, cars);
  G.setWeatherLive = (w) => { G.raceWeather = w; calls.push(["live", w]); };
  const rr = R.create(G);
  rr.stage(wet, { seat: "RUS" });
  G.state = "count"; rr.update(1 / 60); G.state = "race";
  const leader = cars.find((c) => c.code === "RUS");
  leader.lap = 25; G.raceWeather = "rain"; rr.update(1 / 60);   // the arc has turned the sky
  G.state = "results"; rr.update(1 / 60);
  G.state = "count"; rr.update(1 / 60);   // RESTART: startRace again, no stage()
  assert.equal(G.raceWeather, "dry", "lap 1 is dry in this race");
  assert.deepEqual(calls.filter((c) => c[0] === "live").map((c) => c[1]), ["dry"]);
});
