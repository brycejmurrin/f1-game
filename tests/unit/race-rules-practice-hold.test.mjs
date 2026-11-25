/* race-rules-practice-hold.test.mjs — two race-rule pins, in a VM.
 *
 * #6612: an armed PRACTICE session ("NOT SCORED") must never fine a false start
 *   (js/race/jump-start-penalty.js standingRace()), nor show the grid's lift cue.
 * #6628: a hold easing (storm or hold(0)) must not drop a safety car the HAZARD
 *   loop raised (js/race/race-control.js rehold()); only a flag the hold owns
 *   steps down with it.
 *
 * Run: node --test tests/unit/race-rules-practice-hold.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const runFile = (ctx, rel) => vm.runInContext(readFileSync(join(ROOT, rel), "utf8"), ctx, { filename: absSrc(rel) });

// ── #6612 ────────────────────────────────────────────────────────────────────
function bootJump(practice) {
  const notes = [];
  const ctx = vm.createContext({ Math, Number, Object, Input: { throttleLevel: () => 1 }, GameAudio: { penalty() {} } });
  seedLog(ctx);
  runFile(ctx, "js/race/sporting-regs.js");
  runFile(ctx, "js/race/jump-start-penalty.js");
  const G = {
    session: "race", practice, track: {}, raceT: 0.05, resultT: 1,
    vTop: () => 90,
    announce: (m) => { notes.push(m); return true; },
  };
  const jsp = vm.runInContext("JumpStartPenalty", ctx).create(G, {
    autoThrottle: () => false, inputOf: () => null, launchT0: () => 0, soundOn: () => false,
    isQuali: () => false, isTimeTrial: () => false,
  });
  // The player: throttle held (Input stub reads 1) and already launching fast.
  const car = { human: true, isPlayer: true, code: "PLY", penalty: 0, speed: 30 };
  return { jsp, car, notes };
}

test("#6612: an armed practice session fines no false start and shows no grid cue", () => {
  const { jsp, car, notes } = bootJump(true);
  jsp.tickGrid(car);
  jsp.tickAtGreen(car);
  jsp.tickReaction(car);
  assert.equal(car.penalty, 0, "practice is not scored: no +5 s");
  assert.equal(car.jumpStartFined, undefined);
  assert.deepEqual(notes, [], "no LIFT cue, no +5s FALSE START banner");
});

test("#6612: the same start in a scored race is still fined, with the cue", () => {
  const { jsp, car, notes } = bootJump(false);
  jsp.tickGrid(car);
  assert.deepEqual(notes, [jsp.GRID_CUE], "throttle held on the grid: the engineer says lift");
  jsp.tickAtGreen(car);
  assert.equal(car.penalty, 5, "throttle at lights-out: +5 s");
  assert.ok(notes.includes("+5s FALSE START"), notes.join("|"));
  // tickReaction alone fines a fast launch too (a fresh car, throttle released at green).
  const b = bootJump(false);
  b.jsp.tickReaction(b.car);
  assert.equal(b.car.penalty, 5, "launch inside the reaction window: +5 s");
});

// ── #6628 ────────────────────────────────────────────────────────────────────
const SC_PILE = { total: 10, redTotal: 1, sectors: [0, 10, 0], worst: { count: 10, sector: 1, frac: 0.4 } };
const QUIET = { total: 0, redTotal: 0, sectors: [0, 0, 0], worst: { count: 0, sector: -1, frac: 0 } };

function bootRC(pic = { hz: SC_PILE }) {
  const ctx = vm.createContext({ Math, JSON, Object, Array, String, Number, isNaN, isFinite,
    DebrisWorld: { active: () => true, hazards: () => pic.hz } });
  seedLog(ctx);
  runFile(ctx, "js/core/hash32.js");
  runFile(ctx, "js/race/storm.js");
  runFile(ctx, "js/race/race-control.js");
  const saved = new Map([["caution", true]]);
  const G = {
    state: "race", ranked: [], raceT: 0, raceWeather: "rain", announce: () => true,
    netPlay: { active: () => false, ownsRaceControl: () => true, reportCaution() {} },
    store: { get: (k, d) => (saved.has(k) ? saved.get(k) : d), set: (k, v) => saved.set(k, v) },
  };
  const rc = vm.runInContext("RaceControl", ctx).create(G);
  const levels = [];
  const adv = (secs) => {
    for (let i = 0; i < secs * 60; i++) { G.raceT += 1 / 60; rc.update(1 / 60); levels.push(rc.level); }
  };
  return { rc, G, adv, levels };
}

function hazardSC() {
  const b = bootRC();
  b.adv(1);
  assert.equal(b.rc.level, 3, "anti-vacuity: the debris pile raised a safety car");
  assert.equal(b.rc.info().cause, "SAFETY CAR");
  return b;
}

test("#6628: a storm easing leaves a hazard-raised safety car out", () => {
  const { rc, G, adv, levels } = hazardSC();
  G.raceWeather = "storm";
  adv(2);
  assert.equal(rc.level, 3);
  const before = rc.info().sinceT;
  G.raceWeather = "rain";
  levels.length = 0;
  adv(2);
  assert.ok(levels.every((l) => l >= 3), "never GREEN for a tick after the storm eased: " + levels.join(","));
  assert.ok(rc.info().sinceT > before, "the same flag keeps ageing (no restart at sinceT 0): " + rc.info().sinceT + " vs " + before);
  assert.equal(rc.otEnabled(), false, "Overtake stays off: the SC never came in");
});

test("#6628: hold(3) then hold(0) over a hazard safety car leaves it out", () => {
  const { rc, adv, levels } = hazardSC();
  assert.equal(rc.hold(3, "SCRIPT"), 3);
  adv(1);
  const before = rc.info().sinceT;
  rc.hold(0);
  assert.equal(rc.level, 3, "release does not drop the hazard's flag");
  levels.length = 0;
  adv(2);
  assert.ok(levels.every((l) => l >= 3), levels.join(","));
  assert.ok(rc.info().sinceT > before);
});

test("#6628: a flag the hold itself raised still steps straight down on release", () => {
  const { rc, adv } = bootRC({ hz: QUIET });
  rc.hold(2, "SCRIPT");
  adv(1);
  assert.equal(rc.level, 2, "the script's VSC, nothing on the road");
  rc.hold(0);
  assert.equal(rc.level, 0, "hold-owned flag drops on release (hold()'s rule)");
});
