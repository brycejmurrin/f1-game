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
  const soft = A.brakeDecision({ ...base, speed: lim + 2 });
  const hard = A.brakeDecision({ ...base, speed: lim + 10 });
  const ok = A.brakeDecision({ ...base, speed: lim - 1 });
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
