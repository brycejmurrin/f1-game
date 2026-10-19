/**
 * Pass-completion: faster AI stuck behind slower AI.
 * Pins passHunger / coverConcede / tow & fire / latch / run extras, plus the
 * #2356 attack-zone soft pull (otWant trail / otPull reach / attackOK edgeDrive).
 * Streets must stay at the pre-change baselines (monaco gates untouched).
 * Run: node --test tests/unit/ai-pass-complete.test.mjs
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
  const ctx = vm.createContext({ Math, console, Object, Array, Number, isFinite });
  seedLog(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/core/mat4.js"), "utf8"), ctx, { filename: "js/core/mat4.js" });
  vm.runInContext(readFileSync(join(ROOT, "js/physics/ai-drive.js"), "utf8"), ctx,
    { filename: "js/physics/ai-drive.js" });
  return vm.runInContext("AiDrive", ctx);
}
const A = load();

const mid = { craft: 0.75, awareness: 0.75, experience: 0.75, skill: 0.97, consistency: 0.75, aggression: 0 };
const ace = { craft: 0.95, awareness: 0.95, experience: 0.95, skill: 1.0, consistency: 0.9, aggression: 0.2 };
const dull = { craft: 0.45, awareness: 0.35, experience: 0.40, skill: 0.94, consistency: 0.55, aggression: -0.2 };

const vTop = 72;
// ~1.2 % pace edge (matches LEC<BOT baseline stuck pair)
const us = 72 * 1.0;
const them = 72 * (1 - 0.012);
// Scripted pace on the simulation's real scale: scriptPace() = tierV × skill, a
// unitless multiplier near 1 (NOT m/s) — the same ~1.2 % edge.
const usP = 1.0 * 0.97;
const themP = usP * (1 - 0.012);

test("passHunger: streets always 1; equal pace always 1", () => {
  assert.equal(A.passHunger({ street: true, traits: mid, vTop, ourVmax: us, blockerVmax: them, queueT: 30 }), 1);
  assert.equal(A.passHunger({ street: false, traits: mid, vTop, ourVmax: us, blockerVmax: us, queueT: 30 }), 1);
  assert.equal(A.passHunger({ street: false, traits: mid, vTop, ourVmax: us, blockerVmax: us * 0.999, queueT: 30 }), 1,
    "sub-0.7 % edge is noise, not hunger");
  // Scripted pace (tierV×skill) alone is enough when vmax is equalised.
  assert.ok(A.passHunger({
    street: false, traits: mid, vTop, ourVmax: us, blockerVmax: us,
    ourPace: usP, blockerPace: themP, queueT: 12,
  }) > 1, "scripted pace edge (tierV×skill scale) still hungers");
  assert.equal(A.passHunger({
    street: false, traits: mid, vTop, ourVmax: us, blockerVmax: us,
    ourPace: usP, blockerPace: usP * 0.999, queueT: 12,
  }), 1, "sub-0.7 % scripted edge is noise");
});

test("passHunger: sub-0.7 % edge stays 1; soft edge does not tow", () => {
  // Soft edges feed the attack-zone pull, not towGain. A mild soft tow raised
  // monza longest / contact (after2); same shape as the reverted #2783 floor.
  assert.equal(A.passHunger({
    street: false, traits: mid, vTop, ourVmax: us, blockerVmax: us * 0.995, queueT: 0,
  }), 1, "0.5 % edge is below PASS_EDGE hunger");
  const real = {
    street: false, traits: mid, vTop, ourVmax: us, blockerVmax: them, queueT: 12,
  };
  const h = A.passHunger(real);
  assert.ok(h > 1, `≥0.7 % edge hungers: ${h}`);
  const hot = A.passHunger({ ...real, traits: { ...mid, aggression: 1 } });
  const cold = A.passHunger({ ...real, traits: { ...mid, aggression: -1 } });
  assert.equal(hot, h, "aggression does not scale passHunger");
  assert.equal(cold, h, "aggression does not scale passHunger");
});

test("passHunger: ≥0.7 % edge + queue time raises fire hunger (bounded)", () => {
  const cold = A.passHunger({ street: false, traits: mid, vTop, ourVmax: us, blockerVmax: them, queueT: 0 });
  const hot = A.passHunger({ street: false, traits: mid, vTop, ourVmax: us, blockerVmax: them, queueT: 12 });
  assert.ok(cold > 1, `even a fresh 1.2 % edge has a floor: ${cold}`);
  assert.ok(hot > cold, `queue time raises hunger ${cold} -> ${hot}`);
  assert.ok(hot <= 2.6, `bounded: ${hot}`);
  const aceH = A.passHunger({ street: false, traits: ace, vTop, ourVmax: us, blockerVmax: them, queueT: 12 });
  assert.ok(aceH >= hot, "craft raises hunger");
});

test("coverConcede: streets 0; faster chaser concedes; awareness/experience raise it", () => {
  assert.equal(A.coverConcede({ street: true, traits: ace, vTop, ourVmax: them, chaserVmax: us }), 0);
  assert.equal(A.coverConcede({ street: false, traits: mid, vTop, ourVmax: us, chaserVmax: them }), 0,
    "we are faster: no concede");
  const dullC = A.coverConcede({ street: false, traits: dull, vTop, ourVmax: them, chaserVmax: us });
  const aceC = A.coverConcede({ street: false, traits: ace, vTop, ourVmax: them, chaserVmax: us });
  assert.ok(dullC > 0 && aceC > dullC, `aware/exp concede more: dull=${dullC} ace=${aceC}`);
  assert.ok(aceC >= 0.80, `ace against 1.2 % faster zeros the cover: ${aceC}`);
  const mid08 = A.coverConcede({
    street: false, traits: mid, vTop, ourVmax: us * (1 - 0.008), chaserVmax: us,
  });
  assert.ok(mid08 >= 0.70, `mid vs 0.8 % concedes enough to drop cover: ${mid08}`);
  // Human chaser: keep the cover so humanYieldT still sees an intruding lean
  // (ai-racecraft-vm "opens the gap itself").
  assert.equal(A.coverConcede({
    street: false, traits: ace, vTop, ourVmax: them, chaserVmax: us,
    other: { human: true, x: 1.4 },
  }), 0, "human chaser never cover-concedes");
});

test("defendPull: cover concede zeros the pull against a clearly faster attacker", () => {
  const base = {
    street: false, traits: ace, speed: 62, vTop,
    chaser: true, chaserGap: 8, chaserSpeed: 63,
    kA: 0, roomL: 4, roomR: 4, roadL: 6, roadR: 6, x: 0,
    other: { x: 1.4 },
  };
  const equal = A.defendPull({ ...base, ourVmax: us, chaserVmax: us });
  const beaten = A.defendPull({ ...base, ourVmax: them, chaserVmax: us });
  assert.ok(equal > 0, "equal pace still covers the lined-up side");
  assert.equal(beaten, 0, "ace beaten by 1.2 % fully concedes (no cover spend)");
  const midBeaten = A.defendPull({
    ...base, traits: mid, ourVmax: us * (1 - 0.008), chaserVmax: us,
  });
  assert.equal(midBeaten, 0, "mid beaten by 0.8 % drops the cover");
  // Streets ignore concede even with the same pace numbers.
  const street = A.defendPull({ ...base, street: true, ourVmax: them, chaserVmax: us, roomR: 3 });
  assert.ok(street > 0, "street cover unchanged by pace concede");
});

test("otFireRate: hunger does NOT raise λ (tactics.md); streets unchanged too", () => {
  const midOpen = {
    traits: mid, blockerGap: 5, gapAhead: 5, roomL: 3, roomR: 2,
    speed: 58, aheadSpeed: 54, kAhead: 0.002, street: false, vTop,
  };
  const base = A.otFireRate(midOpen);
  const hungry = A.otFireRate({
    ...midOpen, ourVmax: us, blockerVmax: them, queueT: 12,
  });
  assert.equal(hungry, base, "hunger leaves the fire rate alone (the reverted bump raised contact)");
  const streetBase = A.otFireRate({ ...midOpen, street: true });
  const streetHungry = A.otFireRate({
    ...midOpen, street: true, ourVmax: us, blockerVmax: them, queueT: 12,
  });
  assert.equal(streetHungry, streetBase, "street fire rate ignores hunger ctx");
});

test("otWant: permanent pace edge lowers the margin so a ~1 % car wants the move", () => {
  const ctx = {
    street: false, traits: mid, vTop, speed: 60, blockerSpeed: 60,
    freeSpeed: us, blockerVmax: them, ourVmax: us, queueT: 4,
    roomL: 3, roomR: 3, blockerAccel: 1,
  };
  assert.equal(A.otWant(ctx), true, "1.2 % edge + some queue → want");
  assert.equal(A.otWant({ ...ctx, street: true, freeSpeed: us * 0.99 }), false,
    "street keeps the higher margin (no edgeN cut)");
});

test("attack-zone pull (#2356): soft edge wants and pulls from the dirty-air band", () => {
  // Tip diagnosis: longest stuck pairs sit 20–45 m back at +0.3–0.6 %, outside
  // the 16 m otPull window, with queueT ≈ 0. Soft edge (PULL_EDGE 0.3 %) arms
  // the aside move inside TOW_RANGE; streets and equal pace stay at the old gates.
  assert.ok(A.PULL_REACH >= 34 && A.PULL_EDGE === 0.003);
  const softUs = vTop;
  const softThem = vTop * (1 - 0.005); // +0.5 % → softN = 0.5 (clear of float edge)
  const trail = {
    street: false, traits: mid, vTop, speed: 50, blockerSpeed: 50,
    freeSpeed: softUs, ourVmax: softUs, blockerVmax: softThem,
    blockerGap: 28, roomL: 3.5, roomR: 3.5, blockerAccel: 1, queueT: 0,
    kAhead: 0, toTurnIn: 200, attackQ: 0.7, roll: 0.5,
  };
  assert.equal(A.passHunger(trail), 1, "0.5 % stays below PASS_EDGE hunger (pull, not tow)");
  assert.ok(A.softPairEdgeN(softUs, softThem, 0, 0, vTop) > 0, "soft edge sees 0.5 %");
  assert.equal(A.otWant(trail), true, "soft trail wants without queueT");
  assert.equal(A.otWant({ ...trail, street: true }), false, "street ignores soft trail");
  assert.equal(A.otWant({ ...trail, ourVmax: softThem, freeSpeed: softThem }), false,
    "equal pace still needs the old path");
  assert.notEqual(A.otPull(trail), 0, "otPull reaches 28 m on a soft edge");
  assert.equal(A.otPull({ ...trail, ourVmax: softThem, freeSpeed: softThem, blockerVmax: softThem }), 0,
    "equal pace still caps at 16 m");
  assert.equal(A.otPull({ ...trail, street: true, blockerGap: 20, speed: 58, blockerSpeed: 52 }), 0,
    "street keep the 14 m ceiling");
  assert.equal(A.attackOK(trail), true, "soft edgeDrive clears attackOK on a straight");
  assert.equal(A.passReach(trail), true, "aside-first allows 28 m with runway");
  assert.equal(A.passReach({ ...trail, toTurnIn: 40 }), false, "no aside-first without runway");
  // Sub-PULL_EDGE: no trail.
  const noise = { ...trail, blockerVmax: softUs * (1 - 0.002), ourVmax: softUs, freeSpeed: softUs };
  assert.equal(A.otWant(noise), false, "0.2 % does not trail-pull");
  assert.equal(A.coverConcede({
    street: false, traits: mid, vTop, ourVmax: softThem, chaserVmax: softUs,
  }), 0, "soft edge does not cover-concede (PASS_EDGE/CONCEDE only)");
});

test("latchLate + runExtra: hunger does not latch but stretches the run; streets untouched", () => {
  const st = {
    traits: mid, toTurnIn: 400, kAhead: 0, vTop, speed: 70, blockerSpeed: 70,
    blockerGap: 20, street: false, queueT: 12, ourVmax: us, blockerVmax: them,
  };
  assert.equal(A.latchLate({ ...st, queueT: 0, ourVmax: us, blockerVmax: us }), false,
    "equal pace far down a straight still waits");
  assert.ok(A.passHunger({ ...st, queueT: 0 }) > 1, "a fresh 1.2 % edge is hungry");
  assert.equal(A.latchLate({ ...st, queueT: 0 }), false, "hunger alone does not latch (tactics.md)");
  assert.equal(A.latchLate({ ...st, street: true }), true, "street latches as before");

  const baseRun = A.runExtra(0.02, 0.6, true, false);
  const hungRun = A.runExtra(0.02, 0.6, true, false, A.passHunger(st));
  assert.ok(hungRun > baseRun, `run stretches with hunger ${baseRun} -> ${hungRun}`);
  assert.equal(A.runExtra(0.02, 0.6, true, true, 2), 0, "street run stays 0");
});

test("towGain: hunger lifts permanent tow; street and no-arg stay base", () => {
  assert.equal(A.towGain(false), 0.045);
  assert.equal(A.towGain(true), 0.022);
  assert.ok(A.towGain(false, 1.8) > A.towGain(false));
  assert.equal(A.towGain(true, 1.8), 0.022, "street ignores hunger");
  assert.ok(A.towGain(false, 2.5) <= 0.045 * 1.65 + 1e-9, "capped at +65 %");
});

test("sbsCommitT / sbsEase: conceding defender tucks sooner; streets and no-arg stay", () => {
  assert.equal(A.sbsCommitT(), 2);
  assert.equal(A.sbsEase(), 0.97);
  const beaten = { street: false, traits: mid, vTop, ourVmax: them, ourPace: themP, otherVmax: us, otherPace: usP };
  assert.ok(A.sbsCommitT(beaten) < 2, "0.8 %+ concede shortens the alongside");
  assert.ok(A.sbsEase(beaten) < 0.97, "conceding yielder eases more");
  assert.equal(A.sbsCommitT({ ...beaten, street: true }), 2);
  assert.equal(A.sbsEase({ ...beaten, street: true }), 0.97);
  assert.equal(A.sbsCommitT({ ...beaten, other: { human: true } }), 2, "human alongside keeps 2 s");
});

test("wantBoost: pace edge on the tow car arms catch when live speeds are level", () => {
  // Live catch needs speed >= towSpeed - 1*vs; sit 2 m/s behind so only catchEdge fires.
  const level = {
    traits: mid, energy: 0.3, kAhead60: 0.001, otActive: false, street: false, vTop,
    towCar: true, towGap: 12, towSpeed: 62, speed: 60,
    ourVmax: us, towVmax: them,
  };
  assert.equal(A.wantBoost(level), true, "catchEdge arms ERS");
  assert.equal(A.wantBoost({ ...level, street: true }), false,
    "street ignores catchEdge; live speeds alone do not catch");
  assert.equal(A.wantBoost({ ...level, ourVmax: 0, towVmax: 0 }), false,
    "without pace vmax, no catchEdge");
});
