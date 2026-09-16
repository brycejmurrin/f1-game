/* engineer.test.mjs — the race engineer's ladder, in a VM.
 *
 * The module exists so the tyre model is LEGIBLE: a player who feels the car go
 * away needs to know which of five different things happened, because the
 * answer changes what they do next. So what this file pins is not "a message
 * appeared" but the ORDER and the WORDS — specifically:
 *
 *  1. ADVICE, NEVER A DECISION. Nothing here arms a stop. The AI has a plan and
 *     PitLane.think executes it; the player has an engineer and decides for
 *     themselves, which is §11 decision 1 ("live, not pre-planned") made good.
 *  2. GRAINING AND BLISTERING SAY DIFFERENT THINGS, because one of them heals
 *     if you ease off and the other does not. That distinction is the entire
 *     reason the thermal layer has two states, and this is where a driver
 *     finally sees it.
 *  3. EVERY LINE NAMES SOMETHING TO DO. "Tyres at 40%" is a status bar read
 *     aloud; "fronts going — brake earlier" is a lap you can drive differently.
 *
 * Run: node --test tests/unit/engineer.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function load() {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, JSON, isFinite });
  seedLog(ctx);
  ctx.window = ctx;
  for (const f of ["js/core/mat4.js", "js/physics/consts.js", "js/data/teams.js",
                   "js/car/parts.js", "js/physics/tyre-model.js", "js/race/engineer.js"]) {
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  return { E: vm.runInContext("RaceEngineer", ctx), T: vm.runInContext("TyreModel", ctx) };
}
const { E, T } = load();

// A G stand-in with the tyre model armed. The engineer reads it and nothing else.
function sessionFor({ weather = "dry", cautionLevel = 0, arc = null, laps = 25 } = {}) {
  const said = [];
  const tyres = T.create({
    lapsTarget: laps, track: { total: 5386, def: {} }, LAT_MAX: 22,
    aTop: () => 7, vTop: () => 60, raceWeather: weather,
  });
  tyres.setLevel("real");
  const G = {
    tyres, raceWeather: weather, weatherArc: arc,
    cautionInfo: () => ({ level: cautionLevel }),
    announce: (msg) => said.push(msg),
  };
  return { eng: E.create(G), tyres, said, G };
}
// A car three laps INTO its stint, and up to temperature. Both matter: a car
// still on its out-lap is legitimately told its tyres are cold, and that call
// outranks the wear ladder — so a fixture that never left the pit exit would
// test the cold line over and over while claiming to test everything else.
function carOn(tyres, { life = 0.88, wear = 0, ...rest } = {}) {
  const c = Object.assign({ human: true, local: true, speed: 60, lap: 5, consistency: 0.75,
                            accSm: 0, lastLap: 90 }, rest);
  tyres.fit(c, { id: "t", code: "M", life, off: 0, tread: 0, colour: [1, 1, 1] });
  c.lap = (c.lap || 0) + 3;
  c.tyreTs = T.optTemp(life); c.tyreTb = T.optTemp(life);
  c.tyreWear = wear; c.tyreWearF = wear; c.tyreWearR = wear;
  return c;
}
// Drive the engineer past its own quiet timers so the NEXT call can land.
function quiet(eng, c) { eng.update(c, E.QUIET_S + 1); }

// ── 1. It advises; it never decides ─────────────────────────────────────────

test("nothing the engineer says arms a stop or touches the car's pit state", () => {
  const { eng, tyres, said } = sessionFor({ cautionLevel: 3 });
  const c = carOn(tyres, { wear: 0.9 });
  for (let i = 0; i < 40; i++) eng.update(c, 1);
  assert.ok(said.length > 0, "the engineer said nothing at all on a worn set under a caution");
  assert.equal(c.pitArmed, undefined, "the engineer armed a stop — that is the player's call");
  assert.equal(c.pitState, undefined);
  assert.equal(c.pitNext, undefined);
});

test("it speaks to the LOCAL player and to nobody else", () => {
  const { eng, tyres, said } = sessionFor();
  const ai = carOn(tyres, { wear: 0.95, human: false, local: false });
  for (let i = 0; i < 40; i++) eng.update(ai, 1);
  assert.equal(said.length, 0, "an AI car got a radio message");
});

test("one voice: while the pit cue gives a DIRECTION the engineer waits, and the line it owes is not spent", () => {
  // Both write to the same driver; an engineer that talks over KEEP LEFT at
  // the pit limit is worse than one that says nothing.
  const { eng, tyres, said, G } = sessionFor();
  const c = carOn(tyres, { wear: 0.8 });     // past the 0.75 step: a line is owed
  let phase = "keep";
  G.pits = { lastCue: () => ({ phase }), estimate: () => null };
  for (let i = 0; i < 20; i++) eng.update(c, 1);
  assert.equal(said.length, 0, "the engineer talked over the cue");
  phase = "near";                             // a countdown is information, not a direction
  eng.update(c, 1);
  assert.equal(said.length, 1, "the owed line was not said once the cue let go");
  assert.match(said[0], /TYRES AT/);
  for (const p of E.DIRECTIONAL) assert.ok(["enter", "keep", "stop", "merge"].includes(p), p);
});

test("OFF: the engineer is silent, because there is nothing to be legible about", () => {
  const { eng, tyres, said } = sessionFor();
  tyres.setLevel("off");
  const c = carOn(tyres, { wear: 1.5 });
  for (let i = 0; i < 60; i++) eng.update(c, 1);
  assert.equal(said.length, 0);
});

// ── 2. The ladder is ordered by what a driver needs first ───────────────────

const sense = (over) => Object.assign({
  wear: 0, step: -1, axle: 0, front: true, graining: 0, blistering: 0,
  belowWindow: 0, outLap: false, wrongTread: false, freeStop: false,
  wet: false, rainInLaps: null,
  lap: 5, lapsToStop: null, nextCode: null, rivalBoxed: null, marginS: null,
}, over);
const line = (over) => (E.create({}).callFor(sense(over)) || ["", ""])[0];

test("the wrong tread outranks everything — it is the one that costs whole seconds", () => {
  assert.match(line({ wrongTread: true, wet: true, blistering: 1, wear: 1.5, graining: 1 }), /BOX FOR WETS/);
  assert.match(line({ wrongTread: true, wet: false }), /BOX FOR SLICKS/);
});

test("a reduced-cost stop under caution outranks tyre complaints without promising a free stop", () => {
  assert.match(line({ freeStop: true, wear: 0.9, graining: 1, axle: 1 }), /CHEAPER STOP/);
});

test("graining and blistering say DIFFERENT things, and that is the point", () => {
  // The whole justification for two temperature states, finally visible.
  const grain = line({ graining: 1 });
  const blister = line({ blistering: 1 });
  assert.match(grain, /EASE OFF/, "graining must tell the driver it is recoverable");
  assert.match(blister, /DONE/, "blistering must tell the driver it is not");
  assert.notEqual(grain, blister);
  // …and blistering outranks graining, because a set that is finished is more
  // urgent news than one that can be cleaned up.
  assert.match(line({ graining: 1, blistering: 1 }), /DONE/);
});

test("the axle call names an END of the car and what to do about it", () => {
  assert.match(line({ axle: 0.5, front: true }), /FRONTS.*BRAKE EARLIER/);
  assert.match(line({ axle: 0.5, front: false }), /REARS.*THROTTLE/);
  // Below the threshold the split is noise, and naming an end would be a lie.
  assert.equal(line({ axle: E.AXLE_SPLIT - 0.01, step: -1 }), "");
});

test("a defect outranks the axle call — 'brake earlier' is the wrong answer to graining", () => {
  assert.match(line({ graining: 1, axle: 1, front: true }), /GRAINING/);
});

test("cold tyres are called on the out-lap and never after it", () => {
  assert.match(line({ outLap: true, belowWindow: E.COLD_CALL + 5 }), /COLD/);
  assert.equal(line({ outLap: false, belowWindow: 40 }), "", "the driver knows by lap three");
});

test("rain is called in LAPS, singular and plural, because a driver counts laps", () => {
  assert.match(line({ rainInLaps: 1 }), /RAIN IN 1 LAP —/);
  assert.match(line({ rainInLaps: 4 }), /RAIN IN 4 LAPS/);
});

test("the wear ladder counts DOWN — a driver wants life left, not life spent", () => {
  assert.match(line({ step: 0 }), /TYRES AT 50%/);
  assert.match(line({ step: 1 }), /TYRES AT 25%/);
  assert.match(line({ step: 2 }), /TYRES AT 10%/);
  assert.match(line({ wear: 1 }), /GONE/);
});

test("a clean, fresh set gets no radio at all", () => {
  assert.equal(line({}), "");
});

// ── 3. It does not nag ──────────────────────────────────────────────────────

test("one line at a time: a second call inside the quiet window is swallowed", () => {
  const { eng, tyres, said } = sessionFor();
  const c = carOn(tyres, { wear: 0.95 });
  eng.update(c, 1);
  assert.equal(said.length, 1);
  for (let i = 0; i < 5; i++) eng.update(c, 1);
  assert.equal(said.length, 1, "the engineer talked over itself");
});

test("the same line does not repeat, even long after the quiet window", () => {
  const { eng, tyres, said } = sessionFor();
  const c = carOn(tyres, { wear: 0.95 });
  for (let i = 0; i < 30; i++) eng.update(c, 1);
  const gone = said.filter((m) => /GONE|TYRES AT/.test(m));
  assert.equal(new Set(gone).size, gone.length, `a line repeated: ${said.join(" | ")}`);
});

test("a wear step is only SPENT when it is actually said", () => {
  // A threshold crossed while the banner was busy must still be waiting, not
  // silently consumed — otherwise the one warning that mattered is the one lost.
  const { eng, tyres, said } = sessionFor();
  const c = carOn(tyres, { wear: 0 });
  c.tyreWear = 0.55;
  eng.update(c, 1);                       // says "TYRES AT 50%"
  c.tyreWear = 0.95;                      // two steps crossed while quiet
  for (let i = 0; i < 3; i++) eng.update(c, 1);   // still inside QUIET_S
  assert.equal(said.length, 1);
  quiet(eng, c);
  eng.update(c, 1);
  assert.ok(said.length >= 2, "the step crossed during the quiet window was lost");
});

test("a NEW SET restarts the ladder, worked out from the stint counter alone", () => {
  const { eng, tyres, said } = sessionFor();
  const c = carOn(tyres, { wear: 0.95 });
  for (let i = 0; i < 40; i++) eng.update(c, 1);
  const before = said.length;
  assert.ok(before > 0);
  // A stop. The engineer is never told; it reads c.tyreStints.
  tyres.fit(c, { id: "t", code: "S", life: 0.5, off: 0, tread: 0, colour: [1, 1, 1] });
  c.lap += 3; c.tyreTs = T.optTemp(0.5); c.tyreTb = T.optTemp(0.5);
  c.tyreWear = 0.95; c.tyreWearF = 0.95; c.tyreWearR = 0.95;
  for (let i = 0; i < 40; i++) eng.update(c, 1);
  assert.ok(said.length > before, "the new set inherited the old set's spent ladder");
});

// ── 5. The plan-aware lines (the player's reference plan) ────────────────────

test("the plan lines sit between the tread and the tyre complaints, and each names a lap or a compound", () => {
  // A tread call still beats BOX NEXT LAP; BOX THIS LAP beats the wear ladder.
  assert.match(line({ wrongTread: true, wet: true, lapsToStop: 1, nextCode: "H" }), /BOX FOR WETS/);
  assert.match(line({ lapsToStop: 0, nextCode: "H", step: 1, wear: 0.8 }), /^BOX THIS LAP — H$/);
  assert.match(line({ lapsToStop: 1, nextCode: "S", step: 1, wear: 0.8 }), /^BOX NEXT LAP — S$/);
  assert.match(line({ lapsToStop: 2, step: 1, wear: 0.8 }), /TYRES AT/, "two laps out the wear ladder speaks");
  // The undercut: a rival behind, inside the pit loss, has boxed.
  assert.match(line({ rivalBoxed: "VER", lapsToStop: 3 }), /^VER HAS BOXED — UNDERCUT ON, BOX NOW OR PUSH 2 LAPS$/);
  // Rain before the planned stop names the lap; rain after it is the old line.
  assert.match(line({ rainInLaps: 2, lapsToStop: 4, lap: 10 }), /^RAIN BEFORE THE STOP — BOX LAP 12 FOR WETS$/);
  assert.match(line({ rainInLaps: 5, lapsToStop: 4, lap: 10 }), /^RAIN IN 5 LAPS — BE READY$/);
  // A caution that fits the plan with margin says so; without margin, the cost.
  assert.match(line({ freeStop: true, marginS: 3, pitLoss: 20 }), /STOP NOW LOSES NOTHING/);
  assert.match(line({ freeStop: true, marginS: -3, pitLoss: 20 }), /CHEAPER STOP/);
  // …and a stop already called silences all of it (senseOf nulls lapsToStop).
  assert.equal(line({ lapsToStop: null, rivalBoxed: null }), "");
});

test("senseOf reads the plan and the field: the next stop lap, its compound, and a rival's undercut", () => {
  const { eng, tyres, said, G } = sessionFor();
  const c = carOn(tyres, { wear: 0.2, lap: 6, prog: 5000 });   // carOn adds the three laps of the stint: lap 9
  c.pitPlan = { stops: 1, seq: ["medium", "hard"], stints: [12, 13], lapsAt: [12] };
  c.pitStops = 0;
  const rival = { code: "VER", prog: 4900, speed: 50, pitStops: 0, human: false };
  G.cars = [c, rival];
  G.pits = { estimate: () => ({ lossS: 22, gapS: 2, marginS: -20, caution: false }), lastCue: () => null };
  let s = eng.senseOf(c);
  assert.equal(s.lapsToStop, 3, "12 - 9");
  assert.equal(s.nextCode, "H");
  assert.equal(s.rivalBoxed, null, "nobody has boxed yet");
  rival.pitStops = 1;                          // VER boxed this tick, 2 s behind: the undercut is on
  s = eng.senseOf(c);
  assert.equal(s.rivalBoxed, "VER");
  s = eng.senseOf(c);
  assert.equal(s.rivalBoxed, null, "…said once: the rise is consumed");
  c.lap = 12;
  assert.equal(eng.senseOf(c).lapsToStop, 0);
  eng.update(c, 1);
  assert.ok(said.some((m) => /^BOX THIS LAP — H$/.test(m)), `the stop lap is called: ${said.join(" | ")}`);
  c.pitArmed = true;
  assert.equal(eng.senseOf(c).lapsToStop, null, "a called stop needs no calling");
});
