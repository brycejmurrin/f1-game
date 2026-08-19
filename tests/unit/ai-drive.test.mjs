/* AiDrive unit tests — pure decision helpers, no browser.
   Run: node --test tests/unit/ai-drive.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// `const AiDrive` lands in the context's global LEXICAL scope, not on the
// global object — read it back by evaluating its name (same as career-settle).
function load() {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, isFinite });
  seedLog(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/mat4.js"), "utf8"), ctx, { filename: "js/mat4.js" });
  vm.runInContext(readFileSync(join(ROOT, "js/game/ai-drive.js"), "utf8"), ctx,
    { filename: "js/game/ai-drive.js" });
  return vm.runInContext("AiDrive", ctx);
}

const A = load();

const mid = { craft: 0.75, awareness: 0.75, experience: 0.75, skill: 0.97 };
const ace = { craft: 0.96, awareness: 0.92, experience: 1.0, skill: 0.99 };
const rook = { craft: 0.70, awareness: 0.66, experience: 0.12, skill: 0.95 };

test("traits defaults match the mid-grid fallback", () => {
  const t = A.traits({});
  assert.equal(t.craft, 0.75);
  assert.equal(t.awareness, 0.75);
  assert.equal(t.experience, 0.75);
  assert.equal(t.consistency, 0.75);
});

test("traits writes a reused scratch (read before the next call)", () => {
  const a = A.traits({ craft: 0.1, awareness: 0.2, experience: 0.3, skill: 0.4 });
  assert.equal(a.craft, 0.1);
  const b = A.traits({ craft: 0.9 });
  assert.equal(a, b);
  assert.equal(b.craft, 0.9);
  assert.equal(b.awareness, 0.75);
});

test("look sample pool reuses rows across beginLook", () => {
  A.beginLook();
  A.pushLook(10, 0.01, 0.1);
  A.pushLook(24, 0.02, 0.2);
  const first = A.endLook();
  assert.equal(first.length, 2);
  assert.equal(first[0].d, 10);
  const row0 = first[0];
  A.beginLook();
  A.pushLook(12, 0.03, 0);
  const second = A.endLook();
  assert.equal(second, first);
  assert.equal(second.length, 1);
  assert.equal(second[0], row0);
  assert.equal(second[0].d, 12);
  assert.equal(second[0].k, 0.03);
});

test("awareness shortens the stuck dig-out threshold", () => {
  assert.ok(A.stuckThreshold(ace) < A.stuckThreshold(rook));
  assert.ok(A.stuckThreshold(mid) > 0.4 && A.stuckThreshold(mid) < 1.2);
});

test("awareness widens the following pad", () => {
  assert.ok(A.followPad(ace) > A.followPad(rook));
  assert.ok(A.followPad(ace, true) < A.followPad(ace, false));
  assert.equal(A.followBase(false), 6);
  assert.equal(A.followBase(true), 8);
});

test("aware drivers yield more on contact", () => {
  assert.ok(A.contactGive(true, ace) < A.contactGive(true, rook));
  assert.equal(A.contactGive(false, ace), 1);
  assert.ok(A.contactGive(true, mid, true) < A.contactGive(true, mid, false),
    "streets yield more so a player lean-on pass sticks");
});

test("experience smooths steer and softens panic unstuck", () => {
  assert.ok(A.steerDamp(ace) > A.steerDamp(rook));
  assert.ok(A.unstuckPull(ace) < A.unstuckPull(rook));
  assert.ok(A.unstuckPull(rook, true) < A.unstuckPull(rook, false),
    "street unstuck must not yank a car into the Armco");
});

test("OT fire rate rises with craft and a clean window", () => {
  const clean = {
    traits: ace, blockerGap: 4, gapAhead: 4, roomL: 4, roomR: 1.5,
    speed: 60, aheadSpeed: 55, kAhead: 0.001, street: false,
  };
  const dirty = {
    traits: rook, blockerGap: 8, gapAhead: 8, roomL: 0.8, roomR: 0.8,
    speed: 55, aheadSpeed: 56, kAhead: 0.02, street: true,
  };
  assert.ok(A.otFireRate(clean) > A.otFireRate(dirty));
  // Mid-grid open window should sit near the historical λ≈0.7 ballpark.
  const midOpen = {
    traits: mid, blockerGap: 5, gapAhead: 5, roomL: 3, roomR: 2,
    speed: 58, aheadSpeed: 54, kAhead: 0.002, street: false,
  };
  const r = A.otFireRate(midOpen);
  assert.ok(r > 0.25 && r < 1.8, `mid-open rate ${r} out of band`);
});

test("otShouldFire respects the roll and dt (deterministic)", () => {
  const ctx = {
    traits: mid, blockerGap: 5, gapAhead: 5, roomL: 3, roomR: 2,
    speed: 58, aheadSpeed: 54, kAhead: 0.002, street: false,
  };
  const rate = A.otFireRate(ctx);
  const p = 1 - Math.exp(-rate * (1 / 60));
  assert.equal(A.otShouldFire(0, 1 / 60, ctx), true);          // roll 0 always fires
  assert.equal(A.otShouldFire(0.999, 1 / 60, ctx), p > 0.999); // near-1 almost never
  assert.equal(A.otShouldFire(p - 1e-9, 1 / 60, ctx), true);
  assert.equal(A.otShouldFire(p + 1e-9, 1 / 60, ctx), false);
});

test("wantBoost catches and defends; banks when aware and rich-not-needed", () => {
  // Catching on a straight with mid charge
  assert.equal(A.wantBoost({
    traits: mid, energy: 0.3, kAhead60: 0.001, otActive: false,
    towCar: true, towGap: 12, towSpeed: 55, speed: 57,
  }), true);
  // Aware driver with lowish charge and nobody around → bank
  assert.equal(A.wantBoost({
    traits: ace, energy: 0.3, kAhead60: 0.001, otActive: false,
    towCar: false, chaser: false,
  }), false);
  // Rich clear straight → deploy
  assert.equal(A.wantBoost({
    traits: mid, energy: 0.7, kAhead60: 0.001, otActive: false,
  }), true);
  // Corner ahead → no
  assert.equal(A.wantBoost({
    traits: mid, energy: 0.9, kAhead60: 0.02, otActive: false,
  }), false);
  // OT window always deploys
  assert.equal(A.wantBoost({
    traits: mid, energy: 0.05, kAhead60: 0.02, otActive: true,
  }), true);
});

test("brakeDecision soft-pedals small excess and full-pedals big excess", () => {
  const samples = [
    { d: 40, k: 0.02, bank: 0 },
    { d: 80, k: 0.01, bank: 0 },
  ];
  const base = { traits: mid, samples, latMax: 22, brake: 22, grip: 1 };
  const lim = A.brakeTarget(base);
  // brakeDecision returns a reused scratch (pairContact/_ct contract) — copy
  // fields before the next call.
  const soft = Object.assign({}, A.brakeDecision({ ...base, speed: lim + 2 }));
  const hard = Object.assign({}, A.brakeDecision({ ...base, speed: lim + 10 }));
  const ok = Object.assign({}, A.brakeDecision({ ...base, speed: lim - 1 }));
  assert.equal(ok.braking, false);
  assert.equal(soft.braking, true);
  assert.ok(soft.brakeLvl < hard.brakeLvl);
  assert.equal(hard.brakeLvl, 1);
});

test("craft late-brake raises the limit when attacking with room", () => {
  const samples = [{ d: 50, k: 0.018, bank: 0 }];
  const plain = A.brakeTarget({
    traits: mid, samples, latMax: 22, brake: 22, grip: 1,
  });
  const attack = A.brakeTarget({
    traits: ace, samples, latMax: 22, brake: 22, grip: 1,
    blocker: true, blockerGap: 8, blockerSpeed: 50, speed: 55,
    roomL: 3, roomR: 1,
  });
  assert.ok(attack > plain);
});

test("adaptLane nudges toward the freer side under density", () => {
  const a = A.adaptLane(0, {
    traits: mid, nearby: 3, roomL: 0.5, roomR: 3.5, baseLane: 0,
  }, 0.5);
  const b = A.adaptLane(0, {
    traits: mid, nearby: 3, roomL: 3.5, roomR: 0.5, baseLane: 0,
  }, 0.5);
  assert.ok(a > 0, `expected rightward nudge, got ${a}`);
  assert.ok(b < 0, `expected leftward nudge, got ${b}`);
  // Sparse traffic: no move
  assert.equal(A.adaptLane(0.2, { traits: mid, nearby: 1, roomL: 0.5, roomR: 4, baseLane: 0.2 }, 0.5), 0.2);
  // Dense traffic must not accumulate forever — damp toward home±step, not lane+step.
  let lane = 0;
  for (let i = 0; i < 120; i++) {
    lane = A.adaptLane(lane, {
      traits: mid, nearby: 4, roomL: 0.4, roomR: 3.5, baseLane: 0,
    }, 1 / 60);
  }
  assert.ok(Math.abs(lane) < 0.5, `lane crept too far: ${lane}`);
});

test("isBoxed: a street follow-train is not a wedge", () => {
  // Permanent: in-lane car within 6 m still counts as boxed (old rule).
  assert.equal(A.isBoxed({
    contactT: 0, roomL: 4, roomR: 4, blocker: true, blockerGap: 5, street: false,
  }), true);
  // Street: same train with open sides is just following, not stuck.
  assert.equal(A.isBoxed({
    contactT: 0, roomL: 4, roomR: 4, blocker: true, blockerGap: 5, street: true,
  }), false);
  // Street: train PLUS tight sides is a real wedge.
  assert.equal(A.isBoxed({
    contactT: 0, roomL: 1.2, roomR: 1.1, blocker: true, blockerGap: 4, street: true,
  }), true);
  // Sandwich or contact still boxes anywhere.
  assert.equal(A.isBoxed({ contactT: 0.2, roomL: 4, roomR: 4, street: true }), true);
  assert.equal(A.isBoxed({ contactT: 0, roomL: 1.0, roomR: 1.0, street: false }), true);
});

test("minLatGap and racingLineMix keep street home seats", () => {
  assert.equal(A.minLatGap(8, false), 2.8);
  const monaco = A.minLatGap(5, true);
  assert.ok(monaco >= 2.12 && monaco <= 2.3, `monaco gap ${monaco}`);
  assert.ok(monaco < 2.8, "street gap must be tighter than the permanent 2.8");
  assert.equal(A.racingLineMix(false), 0.55);
  assert.ok(A.racingLineMix(true) < 0.55, "streets must hold the grid seat more");
});

test("street OT scale still uses a clean gap after the seating fix", () => {
  assert.ok(A.streetOtScale(rook) >= 0.72);
  assert.ok(A.streetOtScale(ace) > A.streetOtScale(rook));
});

test("street tow is half-size and queue brake eases in", () => {
  assert.equal(A.towGain(false), 0.045);
  assert.ok(A.towGain(true) > 0 && A.towGain(true) < A.towGain(false));
  assert.equal(A.queueBrake(60, 56.9, false), 1);
  assert.equal(A.queueBrake(60, 57.5, false), 0, "permanent still waits for +3");
  assert.equal(A.queueBrake(60, 57.5, true), 0, "street +2.5 is still a follow close");
  const soft = A.queueBrake(60, 54.5, true);
  assert.ok(soft > 0 && soft < 1, `street ease-in ${soft}`);
  assert.equal(A.queueBrake(60, 50, true), 1);
});

test("street sep/mass/wall keep the player from bouncing into Armco", () => {
  assert.ok(A.sepClamp(true) < A.sepClamp(false));
  assert.ok(A.humanInvMass(true) < A.humanInvMass(false));
  assert.equal(A.humanInvMass(false), 0.5);
  assert.ok(A.wallHitLoss(true) < 0.36);
  assert.ok(A.wallSteerScrub(true) < 26);
  assert.equal(A.wallAiScrub(true), A.wallAiScrub(false));
});

test("otPull and defendPull: streets use an open gap, not an Armco dive", () => {
  const open = {
    traits: ace, speed: 58, blockerSpeed: 52, blockerGap: 8,
    roomL: 1.2, roomR: 3.4,
  };
  const perm = A.otPull({ ...open, street: false });
  const street = A.otPull({ ...open, street: true });
  assert.ok(perm > 0 && street > 0);
  assert.ok(street < perm, "street OT must stay gentler than a permanent dive");
  assert.equal(A.otPull({ ...open, street: true, blockerGap: 15 }), 0);
  const cover = {
    traits: ace, speed: 50, chaser: true, chaserGap: 6, chaserSpeed: 54,
    kA: 0.01, roomL: 3.0, roomR: 1.0,
  };
  const dPerm = A.defendPull({ ...cover, street: false });
  const dStreet = A.defendPull({ ...cover, street: true });
  assert.ok(dPerm < 0, `permanent cover inside (k>0 → -x), got ${dPerm}`);
  assert.ok(Math.abs(dStreet) < Math.abs(dPerm));
  assert.equal(A.defendPull({ ...cover, street: true, roomL: 1.5 }), 0);
});

test("houseStyle: Mercedes attacks more than Cadillac; missing stats are neutral", () => {
  const mer = { stats: { speed: 96, accel: 91, cornering: 93, braking: 90 } };
  const cad = { stats: { speed: 73, accel: 73, cornering: 73, braking: 72 } };
  const mcl = { stats: { speed: 93, accel: 94, cornering: 96, braking: 91 } };
  assert.equal(A.houseStyle({}).attack, 0);
  assert.equal(A.houseStyle({}).hold, 0);
  const merH = Object.assign({}, A.houseStyle(mer));
  const cadH = Object.assign({}, A.houseStyle(cad));
  const mclH = Object.assign({}, A.houseStyle(mcl));
  assert.ok(merH.attack > cadH.attack, `mercedes attack ${merH.attack} vs cadillac ${cadH.attack}`);
  assert.ok(mclH.hold > cadH.hold, "McLaren cornering/braking should hold more");
  const midOpen = {
    traits: mid, blockerGap: 5, gapAhead: 5, roomL: 3, roomR: 2,
    speed: 58, aheadSpeed: 54, kAhead: 0.002, street: false,
  };
  const rMer = A.otFireRate({ ...midOpen, team: mer });
  const rCad = A.otFireRate({ ...midOpen, team: cad });
  const rNone = A.otFireRate(midOpen);
  assert.ok(rMer > rNone && rNone > rCad, `OT mer ${rMer} none ${rNone} cad ${rCad}`);
  const openOt = {
    traits: ace, speed: 58, blockerSpeed: 52, blockerGap: 8,
    roomL: 1.2, roomR: 3.4, street: false,
  };
  assert.ok(A.otPull({ ...openOt, team: mer }) > A.otPull(openOt));
  assert.ok(A.followPad(ace, false, mcl) > A.followPad(ace, false),
    "hold-car teams leave a wider follow pad");
});

test("seat 0 attacks more than seat 1; omitted seat stays the factory card", () => {
  const mer = { stats: { speed: 96, accel: 91, cornering: 93, braking: 90 } };
  const base = Object.assign({}, A.houseStyle(mer));
  const lead = Object.assign({}, A.houseStyle(mer, 0));
  const second = Object.assign({}, A.houseStyle(mer, 1));
  assert.equal(A.houseStyle(mer).attack, base.attack);
  assert.ok(lead.attack > base.attack, "lead seat should attack more");
  assert.ok(second.attack < base.attack, "second seat should hold more");
  assert.ok(second.hold > lead.hold);
});

test("career tdev stats shift houseStyle without a new team card", () => {
  const stock = { stats: { speed: 80, accel: 80, cornering: 80, braking: 80 } };
  const developed = { speed: 90, accel: 90, cornering: 90, braking: 90 };
  const a = Object.assign({}, A.houseStyle(stock));
  const b = Object.assign({}, A.houseStyle(stock, undefined, developed));
  assert.ok(b.attack > a.attack);
  assert.ok(b.hold > a.hold);
});

test("team orders: #2 holds vs #1; #1 may pass #2", () => {
  const team = { id: "mercedes", stats: { speed: 96, accel: 91, cornering: 93, braking: 90 } };
  const lead = { team, seat: 0 };
  const second = { team, seat: 1 };
  const rival = { team: { id: "ferrari" }, seat: 0 };
  assert.equal(A.isMate(team, lead), true);
  assert.equal(A.isMate(team, rival), false);
  assert.equal(A.ordersMul(team, 1, lead, "ot"), 0.22);
  assert.equal(A.ordersMul(team, 0, second, "ot"), 1.18);
  assert.equal(A.ordersMul(team, 1, rival, "ot"), 1);
  const midOpen = {
    traits: mid, blockerGap: 5, gapAhead: 5, roomL: 3, roomR: 2,
    speed: 58, aheadSpeed: 54, kAhead: 0.002, street: false, team,
  };
  const vsLead = A.otFireRate({ ...midOpen, seat: 1, other: lead });
  const vsSecond = A.otFireRate({ ...midOpen, seat: 0, other: second });
  const vsRival = A.otFireRate({ ...midOpen, seat: 1, other: rival });
  assert.ok(vsLead < vsRival, `#2 vs #1 ${vsLead} should be colder than vs rival ${vsRival}`);
  assert.ok(vsSecond > vsRival, `#1 vs #2 ${vsSecond} should be hotter than vs rival ${vsRival}`);
  assert.ok(A.followPad(mid, false, team, 1, lead) > A.followPad(mid, false, team, 0, second),
    "#2 leaves #1 more space than #1 leaves #2");
  const cover = {
    traits: ace, chaser: true, chaserGap: 6, chaserSpeed: 58, speed: 54,
    kA: 0.01, roomL: 3, roomR: 3, street: false, team, seat: 1, other: lead,
  };
  assert.ok(Math.abs(A.defendPull(cover)) < Math.abs(A.defendPull({ ...cover, other: rival })),
    "#2 should not cover against #1");
});

test("consistency widens the brake band without moving the mid default", () => {
  const samples = [{ d: 40, k: 0.02, bank: 0 }];
  const base = { traits: mid, samples, latMax: 22, brake: 22, grip: 1 };
  const lim = A.brakeTarget(base);
  const midDec = Object.assign({}, A.brakeDecision({ ...base, speed: lim + 4 }));
  const rookDec = Object.assign({}, A.brakeDecision({
    ...base, traits: { ...mid, consistency: 0.2 }, speed: lim + 4,
  }));
  const aceDec = Object.assign({}, A.brakeDecision({
    ...base, traits: { ...mid, consistency: 1 }, speed: lim + 4,
  }));
  assert.equal(midDec.braking, true);
  assert.ok(rookDec.brakeLvl < midDec.brakeLvl, "rookie eases in later");
  assert.ok(aceDec.brakeLvl > midDec.brakeLvl, "ace commits sooner");
});

test("factory wing and hold change the AI corner limit; midpoint stays put", () => {
  const samples = [{ d: 40, k: 0.02, bank: 0 }];
  const base = { traits: mid, samples, latMax: 22, brake: 22, grip: 1 };
  const midLim = A.brakeTarget(base);
  assert.equal(A.brakeTarget({ ...base, aeroLoad: 0.5 }), midLim);
  assert.ok(A.brakeTarget({ ...base, aeroLoad: 1 }) > midLim, "ground-effect carries more");
  assert.ok(A.brakeTarget({ ...base, aeroLoad: 0 }) < midLim, "low-drag brakes earlier");
  const holdTeam = { stats: { speed: 80, accel: 80, cornering: 96, braking: 94 } };
  assert.ok(A.brakeTarget({ ...base, team: holdTeam }) < midLim, "hold cars brake earlier");
});

test("ERS map and wantX: harvest banks, attack opens X", () => {
  const bankish = {
    traits: ace, energy: 0.3, kAhead60: 0.001, otActive: false, towCar: false, chaser: false,
  };
  const fringe = { ...bankish, energy: 0.51 };
  assert.equal(A.wantBoost(bankish), false);
  assert.equal(A.wantBoost(fringe), false, "midpoint still banks at 0.51");
  assert.equal(A.wantBoost({ ...fringe, ersDeploy: 1 }), true, "overcharge spends at 0.51");
  assert.equal(A.wantBoost({ ...bankish, ersRegen: 1 }), false, "harvest still banks");
  assert.equal(A.wantX({}), true);
  assert.equal(A.wantX({ armed: false }), false);
  assert.equal(A.wantX({ energy: 0.12 }), false);
  assert.equal(A.wantX({ energy: 0.12, catching: true }), true);
  const att = { stats: { speed: 96, accel: 96, cornering: 80, braking: 80 } };
  assert.equal(A.wantX({ energy: 0.18, team: att }), true);
});

test("hold cars mix less racing line; omitted hold keeps the street/permanent defaults", () => {
  assert.equal(A.racingLineMix(false), 0.55);
  assert.equal(A.racingLineMix(true), 0.32);
  assert.ok(A.racingLineMix(false, 0.6) < 0.55);
  assert.ok(A.racingLineMix(true, 0.6) < 0.32);
});

test("adaptLane on streets will not crawl toward a tight wall", () => {
  const tight = A.adaptLane(0, {
    traits: mid, nearby: 4, roomL: 0.4, roomR: 1.5, baseLane: 0, street: true,
  }, 0.5);
  assert.equal(tight, 0);
  const open = A.adaptLane(0, {
    traits: mid, nearby: 4, roomL: 0.4, roomR: 3.5, baseLane: 0, street: true,
  }, 0.5);
  assert.ok(open > 0 && open < 0.2, `street fan-out ${open}`);
});

test("updateCar does not allocate AiDrive ctx literals", () => {
  // Source contract for the PERF-FINDINGS leftover: the eight helpers used
  // to take a fresh `{ ... }` every physics step. They now read reused
  // scratches (_aiBoost etc.). A new literal at those call sites is the
  // defect coming back — catch it here without a browser.
  const src = readFileSync(join(ROOT, "js/game.js"), "utf8");
  const fn = src.match(/function updateCar\([\s\S]*?\nfunction /);
  console.log("[ai-drive] updateCar body found:", !!fn);
  assert.ok(fn, "updateCar body present");
  const hits = fn[0].match(
    /AiDrive\.(wantBoost|otShouldFire|brakeDecision|wantX|adaptLane|otPull|defendPull|isBoxed)\s*\((?:[^()]*?,)?\s*\{/,
  );
  console.log("[ai-drive] inline literal at call sites:", hits ? hits[0] : "none (good)");
  assert.equal(hits, null, `updateCar still passes an object literal: ${hits && hits[0]}`);
  const scratches = ["_aiBoost", "_aiOtFire", "_aiBr", "_aiLane", "_aiWantX", "_aiOtPull", "_aiDefend", "_aiBoxed"];
  for (const s of scratches) {
    const found = src.includes(`const ${s} = {`);
    console.log(`[ai-drive] scratch ${s} declared:`, found);
  }
  assert.match(src, /const _aiBoost = \{/);
  assert.match(src, /const _aiOtFire = \{/);
  assert.match(src, /const _aiBr = \{/);
  assert.match(src, /const _aiLane = \{/);
  assert.match(src, /const _aiWantX = \{/);
  assert.match(src, /const _aiOtPull = \{/);
  assert.match(src, /const _aiDefend = \{/);
  assert.match(src, /const _aiBoxed = \{/);
});
