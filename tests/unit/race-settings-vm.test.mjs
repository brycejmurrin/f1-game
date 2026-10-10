/* race-settings-vm.test.mjs — RACE SETTINGS lap ladder as BEHAVIOUR in the
 * game-vm harness (tools/lib/game-vm.cjs runs the real game.js on an inert DOM).
 *
 * FULL moves with the circuit (def.gpLaps, derived from the GP distance or the
 * def's override: Monaco 78, Spa 44, Silverstone 52), so a lap count picked on
 * one circuit can sit OFF the ladder on the next — above full (78 at Spa) or BELOW it (52 (FULL) at
 * Monaco). The old clamp only handled "above": a Silverstone full race opened
 * Monaco's sheet with no LAPS chip lit (setup-screens audit 2026-09-02, finding
 * 11). Outside a championship an off-ladder value snaps to this circuit's FULL —
 * a full race stays a full race. A CHAMPIONSHIP's format distance (SEASON SETUP's
 * 57 LAPS) is the exception: it is CLAMPED to a shorter circuit's FULL and keeps
 * its own chip below FULL, never raised (ed11e6108, 74fe2d599 — it became FULL at
 * Monaco).
 *
 * Run: node --test tests/unit/race-settings-vm.test.mjs   (npm run test:game-vm)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fnSource } from "../helpers/fn-source.mjs";
import { symbolSource } from "../helpers/game-source.mjs";
import { makeDom } from "../helpers/mini-dom.mjs";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const { createGame, settle } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ storage: { trackId: "monza" } }); });
after(() => { if (g) g.close(); });

const tracks = () => (g.sandbox && g.sandbox.Tracks) || (g.ctx && g.ctx.Tracks);
const idx = (id) => tracks().LIST.findIndex((t) => t.id === id);
const full = (id) => tracks().LIST[idx(id)].gpLaps;
// openRaceSettings() runs buildRaceSettings() on the inert DOM; the state it
// leaves in G.raceLaps is the assertion, the chips are not. In a room, the
// host's choice is authoritative. Solo sessions initialize on first entry and
// preserve edits while backing through the picker or garage.
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

test("solo setup initializes once per track and preserves a draft on re-entry", () => {
  g.G.raceLaps = full("monaco");
  assert.equal(open("spa", false), 3, "the solo flow's default (GAME_LAPS) — a preselection, not a carry-over");
  g.G.raceLaps = 10;
  g.G.raceWeather = "rain";
  g.G.raceTimeOfDay = "night";
  assert.equal(open("spa", false), 10, "Back → settings preserves the pending lap choice");
  assert.equal(g.G.raceWeather, "rain");
  assert.equal(g.G.raceTimeOfDay, "night");
  assert.equal(open("monza", false), 3, "changing circuit starts a new draft");
});

test("REMEMBER LAST RACE SETUP: a stored raceDraft opens the next solo circuit in the live game", () => {
  const G = g.G;
  G.timeTrial = false; G.seasonMode = false;
  try {
    G.store.set("raceDraft", { laps: "10", weather: "rain", tod: "night", mixed: true });
    assert.equal(open("spa", false), 10, "the remembered rung, not GAME_LAPS");
    assert.equal(G.raceWeather, "rain");
    assert.equal(G.raceTimeOfDay, "night");
    assert.equal(G.raceChangeable, true, "MIXED is carried to G.raceChangeable");
    G.store.set("raceDraft", { laps: "FULL", weather: "fog", tod: "dusk", mixed: false });
    assert.equal(open("monaco", false), full("monaco"), "FULL is this circuit's own FULL");
    assert.equal(G.raceWeather, "fog");
    assert.equal(G.raceChangeable, false);
  } finally {
    G.store.rawDel("raceDraft");
    G.raceChangeable = false; G.wxArcPlan = null;
  }
  assert.equal(open("monza", false), 3, "no draft stored: the default 3 again");
});

function RaceSettingsPure() {
  const ctx = vm.createContext({});
  vm.runInContext(readFileSync(new URL("../../js/race/race-settings.js", import.meta.url), "utf8").replace(/^const RaceSettings\b/m, "var RaceSettings"), ctx);
  return ctx.RaceSettings;
}

// ── REMEMBER LAST RACE SETUP through the real START handler ─────────────────
// A RaceSettings instance of its own on a mini DOM, so rs-go can be pressed
// without starting a race: startRace/raceIntro are counters. What is asserted is
// the store and G, which is what the next open reads.
function sheet(o = {}) {
  const dom = makeDom();
  const ctx = vm.createContext({ document: dom.document, Log: { info() {}, warn() {} }, queueMicrotask });
  vm.runInContext(readFileSync(new URL("../../js/race/race-settings.js", import.meta.url), "utf8").replace(/^const RaceSettings\b/m, "var RaceSettings"), ctx);
  const disk = new Map();
  const store = { get: (k, d) => (disk.has(k) ? JSON.parse(disk.get(k)) : d), set: (k, v) => { disk.set(k, JSON.stringify(v)); return true; } };
  const LIST = [{ id: "spa", gpLaps: 44 }, { id: "monaco", gpLaps: 79 }, { id: "zandvoort", gpLaps: 72 }];
  let starts = 0;
  const G = {
    flow: "gp", session: "race", trackIdx: 0, season: null, daily: null, netLobby: { roomChanged() {} },
    raceLaps: 3, raceWeather: "dry", raceTimeOfDay: "default", raceChangeable: false, wxArcPlan: null,
    difficulty: "hard", raceGrid: "tier", champGrid: "champ", raceReliability: "off", raceTyreWear: "off",
    raceQuali: false, duel: false, duelLegend: "", soundOn: false, teamIdx: 0, pits: null,
    cautionInfo: () => ({ enabled: false }),
    $: (id) => dom.byId(id), store, GAME_LAPS: 3, TT_LAPS: 4,
    scheduleFlybyTrack() {}, setCautionEnabled() {}, startRace() { starts++; }, buildSelect() {},
    els: { selGo: dom.byId("sel-go") }, openGarage() {},
  };
  Object.assign(G, o);
  const rs = ctx.RaceSettings.create(G, {
    GameAudio: {}, Tracks: { LIST }, SettingRow: { paint() {}, disable() {}, wire() {} },
    DrivingLine: { mode: () => "off" }, SeasonCal: { formatLaps: (n) => n, quali: () => false, qualiNext: () => false },
    qualiResults: () => null, openQuali() {}, enableTilt() {}, getSteerMode: () => "buttons", buildStandings() {},
    raceIntro: (go) => go(),
  });
  rs.wireButtons();
  const at = (id) => { G.trackIdx = LIST.findIndex((t) => t.id === id); rs.openRaceSettings("select"); return G.raceLaps; };
  const start = () => dom.byId("rs-go").onclick();
  return { G, rs, disk, at, start, starts: () => starts };
}

test("REMEMBER LAST RACE SETUP: START with 10 / rain / night opens the next circuit the same way", () => {
  const h = sheet();
  assert.equal(h.at("spa"), 3, "nothing stored: the default");
  assert.equal(h.disk.has("raceDraft"), false, "opening the sheet writes nothing");
  Object.assign(h.G, { raceLaps: 10, raceWeather: "rain", raceTimeOfDay: "night", raceChangeable: true });
  h.start();
  assert.equal(h.starts(), 1, "START still starts the race");
  assert.deepEqual(JSON.parse(h.disk.get("raceDraft")), { weather: "rain", tod: "night", mixed: true, laps: "10" });
  Object.assign(h.G, { raceLaps: 3, raceWeather: "dry", raceTimeOfDay: "default", raceChangeable: false });
  assert.equal(h.at("monaco"), 10, "10 LAPS carried to a different circuit");
  assert.equal(h.G.raceWeather, "rain");
  assert.equal(h.G.raceTimeOfDay, "night");
  assert.equal(h.G.raceChangeable, true);
});

test("REMEMBER LAST RACE SETUP: FULL is a rung, so it maps to the new circuit's FULL", () => {
  const h = sheet();
  h.at("spa");
  h.G.raceLaps = 44;          // FULL at Spa
  h.start();
  assert.equal(JSON.parse(h.disk.get("raceDraft")).laps, "FULL");
  assert.equal(h.at("monaco"), 79, "FULL at Spa is FULL (79) at Monaco, not 44");
  h.at("spa"); h.G.raceLaps = 25; h.start();
  assert.equal(h.at("zandvoort"), 25);
  // Pure halves: a rung at or past a shorter FULL is that FULL; junk is dropped.
  const RS = RaceSettingsPure();
  assert.deepEqual(JSON.parse(JSON.stringify(RS.draftFor({ laps: "25", weather: "rain" }, 20))), { laps: 20, weather: "rain" });
  assert.equal(RS.draftFor({ laps: "7", weather: "snow", tod: "noon", mixed: "yes" }, 50), null);
  assert.equal(RS.draftFor([1, 2], 50), null);
  assert.equal(RS.draftOf(79, 79, "dry", "day", false).laps, "FULL");
});

test("REMEMBER LAST RACE SETUP: championship, time trial, the Daily and a VS FRIEND room neither save nor restore", () => {
  const stored = { laps: "10", weather: "rain", tod: "night", mixed: true };
  for (const [name, o] of [
    ["season", { flow: "season" }], ["career", { flow: "career" }],
    ["time trial", { session: "tt" }],
    ["daily", { session: "tt", daily: { current: () => ({ day: "2026-09-30", weather: "overcast", tod: "dawn" }) } }],
  ]) {
    const h = sheet(o);
    h.disk.set("raceDraft", JSON.stringify(stored));
    h.at("monaco");
    assert.notEqual(h.G.raceWeather, "rain", name + ": the draft is not restored");
    assert.notEqual(h.G.raceTimeOfDay, "night", name);
    assert.equal(h.G.raceChangeable, false, name);
    h.disk.delete("raceDraft");
    Object.assign(h.G, { raceLaps: 3, raceWeather: "wet", raceTimeOfDay: "dusk" });
    h.start();
    assert.equal(h.disk.has("raceDraft"), false, name + ": START does not save");
  }
  const room = sheet();
  room.rs.setNetRoom(true);
  room.disk.set("raceDraft", JSON.stringify(stored));
  room.at("monaco");
  assert.equal(room.G.raceWeather, "dry", "a room: the host's staging, never the draft");
  room.disk.delete("raceDraft");
  room.G.raceWeather = "wet";
  room.start();
  assert.equal(room.disk.has("raceDraft"), false, "a room's CONFIRM FOR LOBBY does not save");
  assert.equal(room.starts(), 0);
});

test("a championship's 57 LAPS is clamped to a shorter FULL, never raised to a longer one (ed11e6108)", () => {
  // SEASON SETUP ▸ RACE DISTANCE 57 is a flat distance preselected at every
  // round (SeasonCal.formatLaps). Off the ladder below FULL it used to snap UP:
  // 57 LAPS became 79 at Monaco on every circuit shorter than ~5.35 km.
  const S = g.sandbox.SeasonCal, G = g.G;
  const cfg0 = JSON.parse(JSON.stringify(S.config())), season0 = G.season;
  try {
    G.timeTrial = false; G.seasonMode = true;
    const ap = S.applyConfig(Object.assign({}, cfg0, { laps: 57 }));
    assert.ok(ap.ok && ap.season, "the 57-lap season setup applies");
    G.season = ap.season;
    assert.equal(S.formatLaps(3), 57, "anti-vacuity: the round opens on the format distance");
    assert.ok(full("monaco") > 57 && full("spa") < 57, `the two sides of 57: monaco ${full("monaco")}, spa ${full("spa")}`);
    const monaco = open("monaco", false);
    assert.equal(monaco, 57, `57 LAPS at Monaco stays 57 — not raised to FULL (${full("monaco")})`);
    assert.ok(monaco <= full("monaco"));
    assert.equal(open("spa", false), full("spa"), "…and is clamped DOWN to a shorter circuit's FULL");
  } finally {
    G.seasonMode = false;
    S.setConfig(cfg0);
    G.season = season0;
  }
});

test("NEXT ROUND clamps the format distance to the next circuit's FULL, and restores it after a short one", async () => {
  // NEXT ROUND skips RACE SETTINGS, so the clamp above never ran: a 57-lap
  // format raced 57 at Silverstone (full 52), and a value clamped at a short
  // circuit stuck to every longer round (bug hunt 2026-10-05 G6).
  const g2 = await createGame({ track: "monza", carMeshes: false });
  try {
    const a = g2.apex, G = g2.G, S = vm.runInContext("SeasonCal", g2.ctx), T = vm.runInContext("Tracks", g2.ctx);
    a.headless(true);
    const longs = T.SEASON.filter((t) => t.gpLaps > 57), short = T.SEASON.find((t) => t.gpLaps < 57 && t.gpLaps > 3);
    const [long, long2] = longs;   // the calendar collapses a repeated id: two different long circuits
    G.flow = "season"; G.session = "race";
    const r = S.applyConfig(Object.assign(S.fresh(), { quali: false, laps: 57, trackIds: [long.id, short.id, long2.id] }));
    G.season = r.season; G.trackIdx = S.trackIndex(0); G.raceLaps = S.formatLaps(3);
    const round = async (next) => {
      const before = G.cars;
      if (next) G.els.resNext.onclick(); else G.startRace();
      await settle(() => G.cars !== before && (G.state === "count" || G.state === "race"), 4000);
      const out = { id: G.track.def.id, laps: G.lapsTarget };
      a.go(); g2.step(10); a.finishRace();
      return out;
    };
    assert.deepEqual(await round(false), { id: long.id, laps: 57 }, "round 1 runs the format's 57");
    assert.deepEqual(await round(true), { id: short.id, laps: short.gpLaps }, `NEXT ROUND at ${short.id} is its FULL ${short.gpLaps}, not 57`);
    assert.deepEqual(await round(true), { id: long2.id, laps: 57 }, "and the next longer round is back on 57");
  } finally { g2.close(); }
});

// ── the GRID RULE ─────────────────────────────────────────────────────────────

// gridOrderFor() is pure over its closure: lift its source (and gridRule(),
// which it and the flyby's menu grid share) and bind stubs.
function gridRule(rule, o = {}) {
  const src = symbolSource("function gridRule()") + symbolSource("function gridOrderFor(base)");
  const rank = (season, a, b) => (season.pts[b] || 0) - (season.pts[a] || 0) || (a < b ? -1 : 1);
  // A championship reads its OWN rule (champGrid); a one-off reads raceGrid.
  return new Function("isTimeTrial", "isChampionship", "SeasonCal", "raceGrid", "champGrid", "season", "cars", "simRnd", "netPlay", "SportingRegs",
    src + ";return gridOrderFor;")(() => !!o.tt, () => !!o.champ, { quali: () => !!o.squali, rank },
    o.champ ? "tier" : rule, o.champ ? rule : "champ", o.season || { pts: {} }, o.cars, o.rnd || (() => 0.5), { active: () => !!o.net }, REGS);
}
const REGS = new Function(readFileSync(new URL("../../js/race/sporting-regs.js", import.meta.url), "utf8") + ";return SportingRegs;")();
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

test("STANDINGS (champ) grids a no-qualifying championship in points order (FIA 2026 SR B2.5.4(a))", () => {
  const cars = carsOf(4).map((c, i) => Object.assign(c, { tier: [3, 1, 2, 0][i] }));
  const season = { pts: { d0: 10, d1: 40, d2: 25 } };
  let draws = 0;
  const out = gridRule("champ", { cars, champ: true, season, rnd: () => { draws++; return 0.5; } })(null);
  assert.deepEqual(out.map((c) => c.driverId), ["d1", "d2", "d0", "d3"], "scorers by points, the pointless behind");
  assert.equal(draws, cars.length, "one draw per car, discarded: the stream does not shift");
  draws = 0;
  assert.equal(gridRule("champ", { cars, champ: true, season: { pts: {} }, rnd: () => { draws++; return 0.5; } })(null), null,
    "round 1 (nobody scored): gridUp's own default grid");
  assert.equal(draws, 0, "...which draws its own jitter");
  const q = cars.slice().reverse();
  assert.equal(gridRule("champ", { cars, champ: true, squali: true, season })(q), q, "a qualifying championship grids off the session");
  assert.equal(gridRule("champ", { cars, season })(null), null, "a one-off never reaches the championship rule");
});

test("REVERSE STANDINGS on round 1 (nobody scored) grids on pace order, as STANDINGS does", () => {
  // The all-zero table sorted by SeasonCal.rank's last resort — the driver-id
  // STRING — and reversed: pole to williams:1, the player P10 (bug hunt 2026-10-05 G7).
  const cars = carsOf(4);
  let draws = 0;
  assert.equal(gridRule("revchamp", { cars, champ: true, season: { pts: { d0: 0 } }, rnd: () => { draws++; return 0.5; } })(null), null,
    "gridUp's own default grid");
  assert.equal(draws, 0, "...which draws its own jitter");
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

test("RANDOM falls back to the pace order in a room — peers share no seed", () => {
  // netplay's grid is negotiation-free BECAUSE gridUp() runs identically on
  // every peer (js/net/netplay.js separateGrid lays the humans into consecutive
  // boxes from the local car's slot). No seed crosses the wire, so a rule that
  // rolls its own order would have each peer build a DIFFERENT grid and place
  // rivals inside one another.
  const cars = carsOf(4);
  let draws = 0;
  const rnd = () => { draws++; return [0.7, 0.1, 0.9, 0.4][draws - 1]; };
  assert.equal(gridRule("random", { cars, rnd, net: true })(null), null, "the room grids on pace order");
  assert.equal(draws, 0, "…and spends no draw doing it, exactly as PACE ORDER would");
  const solo = gridRule("random", { cars, rnd })(null);
  assert.deepEqual(solo.map((c) => c.driverId), ["d1", "d3", "d0", "d2"], "solo still rolls");
});

test("REVERSE STANDINGS spends the grid jitter it does not use, so the stream does not shift", () => {
  // gridUp() draws one simRnd() per car when it builds its own order. A rule
  // that returns a full order without drawing would leave every later consumer
  // (the AI overtake fire, the start hold) at a different point in the stream
  // for the same seed — the makeCars stream contract.
  const cars = carsOf(3);
  const season = { pts: { d0: 40, d1: 10, d2: 25 } };
  let draws = 0;
  const out = gridRule("revchamp", { cars, champ: true, season, rnd: () => { draws++; return 0.5; } })(null);
  assert.deepEqual(out.map((c) => c.driverId), ["d1", "d2", "d0"], "still the standings, reversed");
  assert.equal(draws, cars.length, "one draw per car, discarded — same count, same stream position");
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
// The chip is a RaceSettings row; the arc it arms lives in js/race/weather-arc.js
// (WeatherArc.create(G, deps)), reached here only through G — raceChangeable,
// wxArcPlan and weatherArc are the whole contract.

test("a MIXED race arms a weather arc at the start and walks it; the plan is the seed's", async () => {
  g.G.timeTrial = false; g.G.seasonMode = false; g.G.raceGrid = "tier";
  g.G.raceChangeable = true; g.G.wxArcPlan = null; g.G.seed = 5;
  await g.race("monza", "day", "dry");
  const arc = g.G.weatherArc;
  assert.ok(arc, "an arc is armed");
  assert.equal(arc.from, "dry");
  assert.notEqual(arc.to, "dry");
  assert.ok(arc.dur >= 90 && arc.dur <= 420, "seeded 2–7 min then race-length cap: " + arc.dur);
  // The derived plan is a function of (seed, race counter): read twice, same answer.
  g.G.wxArcPlan = null;
  const p1 = JSON.parse(JSON.stringify(g.G.wxArcPlan)), p2 = JSON.parse(JSON.stringify(g.G.wxArcPlan));
  assert.deepEqual(p1, p2, "same seed and counter, same plan");
  assert.ok(p1 && p1.to !== "dry" && p1.dur >= 90, JSON.stringify(p1));
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

test("a red flag re-grids in race order to re-run the current lap, keeps the clock, and resumes at lights-out", async () => {
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
  // Boxes are behind the line: roll back one crossing so the restart re-enters
  // the same lap instead of awarding an undriven lap (red-flag-vm tests crossing).
  assert.ok(before.some((c) => c.lap > 0), "the field has crossed the line before the flag");
  assert.deepEqual(after.map((c) => c.lap), before.map((c) => Math.max(0, c.lap - 1)), "the current lap is re-run");
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

// ── The STRATEGY row ────────────────────────────────────────────────────────
// The player's reference plan for this circuit (js/race/pit-lane.js planFor):
// AUTO or a pinned stop count, shown only when TYRE WEAR is on, persisted per
// circuit through PitLane.setPinnedStops.

test("the STRATEGY row follows TYRE WEAR: hidden when wear is off, a pin persisted per circuit when on", () => {
  // The inert DOM has no <select> children to step (SettingRow's parts walk
  // finds nothing), so the pin is driven through the module the row wires:
  // PitLane.setPinnedStops / pinnedStops, and the store it persists to.
  const doc = g.sandbox.document, byId = (id) => doc.getElementById(id);
  g.G.raceTyreWear = "off";
  open("monza", false);
  assert.equal(byId("rs-plan").hidden, true, "no plan without wear");
  assert.equal(byId("rs-plan-bar").hidden, true);
  g.G.raceTyreWear = "real";
  open("monza", false);
  assert.equal(byId("rs-plan").hidden, false, "wear on: the row shows");
  assert.equal(g.G.pits.pinnedStops(), null, "AUTO by default");
  g.G.pits.setPinnedStops(0);
  assert.equal(g.G.pits.pinnedStops(), 0, "the pin is the module's");
  assert.equal(g.G.store.get("pitPlan.monza", "auto"), 0, "…persisted per circuit");
  g.G.pits.setPinnedStops(null);
  assert.equal(g.G.pits.pinnedStops(), null, "AUTO clears it");
  // Where the complex is built the stint bar is drawn from the plan.
  if (g.G.pits.zoneOf()) {
    open("monza", false);
    assert.equal(byId("rs-plan-bar").hidden, false);
    const plan = g.G.pits.planFor(0.5, true, g.G.raceLaps);
    assert.equal(byId("rs-plan-stints").children.length, plan.stints.length, "one segment per stint");
    assert.match(byId("rs-plan-loss").textContent, /PIT LOSS ≈ \d+ s/);
    g.G.pits.setPinnedStops(2);
    open("monza", false);
    assert.equal(byId("rs-plan-stints").children.length, 3, "a pinned 2-stop draws three stints");
    g.G.pits.setPinnedStops(null);
  }
  g.G.raceTyreWear = "off";
});

test("paintPlan hides STRATEGY when the live model is off, even if the store says wear is on", () => {
  // Cold-boot desync: store/UI "real", model still at create's old "off".
  // paintPlan must not claim a stop plan from planLaps' whole-race branch.
  const src = readFileSync(new URL("../../js/race/race-settings.js", import.meta.url), "utf8");
  const paint = fnSource(src, "function paintPlan(tt, laps)");
  assert.match(paint, /tyres\.on\(\)/,
    "paintPlan must gate on the live model, not only G.raceTyreWear");
  const doc = g.sandbox.document, byId = (id) => doc.getElementById(id);
  const prev = g.G.raceTyreWear;
  try {
    g.G.raceTyreWear = "real";
    g.G.tyres.setLevel("off");
    open("monza", false);
    assert.equal(byId("rs-plan").hidden, true, "store on + model off → no STRATEGY row");
    assert.equal(byId("rs-plan-bar").hidden, true);
    g.G.tyres.setLevel("real");
    open("monza", false);
    assert.equal(byId("rs-plan").hidden, false, "store on + model on → STRATEGY shows");
  } finally {
    g.G.tyres.setLevel(prev === "off" || !prev ? "off" : prev);
    g.G.raceTyreWear = prev;
  }
});
