// race-session-fixes — three session-timing holes from the 2026-10-03 audit,
// pinned where each one lives. Under a second.
//
// 1. Sprint and GP qualifying of one weekend drew the IDENTICAL simulated
//    field: quali-model.js hashed season.round, which both sessions share.
//    SeasonCal.drawRound() (sprint = round + 1000) is what reliability, the
//    launch, AI mistakes and the weather already draw on.
// 3. A quali lap deleted for any reason but a cut (an incident takeover, a
//    practice rewind) fell through to driven(0) — the model's time, possibly
//    pole. Any deleted quali lap now sets qualiCut: NO TIME.
// 5. S3 closed in the sector block with the full step's lapTime, BEFORE
//    RaceControl.lineTransition took off the time past the line, so
//    S1+S2+S3 ran up to one physics step longer than the lap.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const GAME = read("js/game.js");

test("1: sprint and GP qualifying draw on different rounds", () => {
  const src = read("js/race/quali-model.js");
  assert.match(src, /SeasonCal\.drawRound\(G\.season\)/, "the season branch draws on drawRound()");
  assert.doesNotMatch(src, /const round = inCareer \? Career\.round\(\) : \(G\.seasonMode \? G\.seasonRound : 0\);/);
  // …and drawRound really separates the two sessions of one round.
  const ctx = vm.createContext({ Math, JSON, Object, Array, String, Number, Date, isNaN, isFinite, console, Log: { info() {}, warn() {}, debug() {} } });
  const sc = read("js/career/season-cal.js");
  const fn = sc.slice(sc.indexOf("const SPRINT_SEED_OFFSET"), sc.indexOf("\n}\n", sc.indexOf("function drawRound")) + 2);
  vm.runInContext("function stage(s) { return s.stage; }\n" + fn + "\n;globalThis.drawRound = drawRound;", ctx);
  assert.notEqual(ctx.drawRound({ round: 3, stage: "sprint" }), ctx.drawRound({ round: 3, stage: "race" }));
  assert.equal(ctx.drawRound({ round: 3, stage: "race" }), 3, "the GP keeps the round it always drew");
});

test("3: ANY deleted quali lap is NO TIME, never the model's", () => {
  assert.match(GAME, /if \(lapValid\) c\.lastLap = lapDone;\n\s+else if \(c\.isPlayer && isQuali\(\)\) c\.qualiCut = true;/);
  assert.match(GAME, /quali\.simulate\(qualiNet\.driven\(myLap > 0 \? myLap : player\.qualiCut \? Infinity : 0\)\)/,
    "the sheet still maps qualiCut to Infinity (NO TIME)");
});

test("5: S3 (player and field) is closed at the line, not a whole step past it", () => {
  // The same overshoot RaceControl.lineTransition subtracts from the lap.
  assert.match(GAME, /const s3Past = dLine > 0 && oldS > L \* 0\.5 && c\.s < L \* 0\.5 && dt > 0 \? dt \* \(1 - Math\.min\(1, Math\.max\(0, \(L - oldS\) \/ dLine\)\)\) : 0;/);
  assert.match(GAME, /const e = c\.lapTime - \(ns === 0 \? s3Past : 0\) - c\._secT0;/, "field sector bests");
  assert.match(GAME, /const elapsed = c\.lapTime - \(newSector === 0 \? s3Past : 0\) - sectorStartT;/, "the player's split");
  const rc = read("js/race/race-control.js");
  assert.match(rc, /const frac = \(total - oldS\) \/ ds;\n\s+if \(Number\.isFinite\(frac\)\) over = dt \* \(1 - Math\.min\(1, Math\.max\(0, frac\)\)\);/,
    "the lap's own overshoot, which s3Past mirrors — change both together");
  // The arithmetic: a step that ends 3 m past the line out of 6 m loses half its time.
  const L = 5000, oldS = 4997, dLine = 6, dt = 1 / 60, s = 3;
  const s3Past = dLine > 0 && oldS > L * 0.5 && s < L * 0.5 && dt > 0 ? dt * (1 - Math.min(1, Math.max(0, (L - oldS) / dLine))) : 0;
  assert.ok(Math.abs(s3Past - dt / 2) < 1e-12);
});
