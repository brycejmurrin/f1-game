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
  vm.runInContext(readFileSync(join(ROOT, "js/core/mat4.js"), "utf8"), ctx, { filename: "js/core/mat4.js" });
  vm.runInContext(readFileSync(join(ROOT, "js/physics/ai-drive.js"), "utf8"), ctx,
    { filename: "js/physics/ai-drive.js" });
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

test("the follow gap is a time headway: s0 + v·T, awareness widens T", () => {
  assert.equal(A.followBase(false), 6);
  assert.equal(A.followBase(true), 8);
  assert.ok(A.followTime(ace) > A.followTime(rook), "awareness leaves more time");
  const T = A.followTime(mid, false);
  assert.ok(T >= 0.15 && T <= 0.30, `T ${T} s outside the 0.15..0.30 s band`);
  // IN SECONDS AT SPEED: the gap grows with speed (it was a flat ~7.5 m, 0.1 s at 75 m/s)
  const g40 = A.followGap(mid, false, 40), g20 = A.followGap(mid, false, 20);
  assert.ok(Math.abs(g40 - (6 + 40 * T)) < 1e-9 && g40 > g20, `gap at 40 m/s ${g40}`);
  assert.ok((g40 - 6) / 40 > 0.15, "more than 0.15 s of headway at racing speed (the old pad was ~0.04 s)");
  // a latched/armed pass or a tow tightens it to 0.05 s; `extra` adds seconds
  assert.ok(Math.abs(A.followGap(mid, false, 40, 1) - (6 + 40 * 0.05)) < 1e-9);
  // STREETS keep the metre gap (8 m + the old awareness pad, halved), only the first-lap `extra` is time
  assert.ok(Math.abs(A.followGap(mid, true, 40, 1) - (8 + (-0.8 + 3 * 0.75) * 0.5)) < 1e-9, "street: the old gap, tight or not");
  assert.equal(A.followGap(mid, true, 40, 0), A.followGap(mid, true, 20, 1), "street: not a headway");
  assert.ok(Math.abs(A.followGap(mid, true, 40, 0, null, 0, null, null, 0.2) - A.followGap(mid, true, 40, 0) - 8) < 1e-9, "street: the first lap still adds time");
  assert.ok(A.followGap(ace, true, 30) > A.followGap(rook, true, 30), "street: awareness still widens it");
  assert.ok(Math.abs(A.followGap(mid, false, 40, 0, null, 0, null, null, 0.1) - (6 + 40 * (T + 0.1))) < 1e-9);
  // ...and it stays inside the tow's reach (TOW_RANGE 34 m) at any speed
  assert.ok(A.followGap(ace, false, 95) <= 28, `capped: ${A.followGap(ace, false, 95)}`);
  assert.equal(A.followGap(mid, false, 0), 6, "at a standstill it is s0");
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

// verify-physics #3 (2026-10-04): the pedal is FEED-FORWARD + a P trim. The
// planner budgets 0.85·brake of deceleration over each sample's distance, so a
// car riding its own envelope needs pedal 0.85 there — a pure P band (0.2 at
// 1 m/s over, 1.0 at 7) reached that only at ~6 m/s of standing overspeed and
// the AI arrived 12-41 % above its planned corner speed (VM, monza).
test("brakeDecision: no pedal under the envelope, the planner's 0.85 budget on it, full pedal far over it", () => {
  const samples = [
    { d: 40, k: 0.02, bank: 0 },
    { d: 80, k: 0.01, bank: 0 },
  ];
  const base = { traits: mid, samples, latMax: 22, brake: 22, grip: 1 };
  const lim = A.brakeTarget(base);
  // brakeDecision returns a reused scratch (pairContact/_ct contract) — copy
  // fields before the next call.
  const on = Object.assign({}, A.brakeDecision({ ...base, speed: lim + 1.05 }));
  const hard = Object.assign({}, A.brakeDecision({ ...base, speed: lim + 10 }));
  const ok = Object.assign({}, A.brakeDecision({ ...base, speed: lim - 1 }));
  assert.equal(ok.braking, false);
  assert.equal(ok.ff, 0);
  assert.equal(on.braking, true);
  assert.ok(on.ff > 0.85 && on.ff < 0.95, `on the envelope the feed-forward is the planner's budget (ff ${on.ff})`);
  assert.ok(on.brakeLvl >= on.ff && on.brakeLvl < 0.96, `and the P trim only trims (pedal ${on.brakeLvl})`);
  assert.ok(on.brakeLvl <= hard.brakeLvl);
  assert.equal(hard.brakeLvl, 1);
});

test("brakeDecision's P trim compares the overspeed on the standard (pace) scale", () => {
  const samples = [{ d: 160, k: 0.004, bank: 0 }];
  const decisions = [1, 0.84, 0.5].map((pace) => {
    const base = { traits: mid, samples, latMax: 22, brake: 22, grip: 1, pace, vmax: 72 };
    const lim = A.brakeTarget(base);
    return Object.assign({}, A.brakeDecision({ ...base, speed: lim + 1.3 * pace }));
  });
  for (const d of decisions) {
    assert.equal(d.braking, true);
    assert.ok(d.brakeLvl < 1, `anti-vacuity: unclamped (${d.brakeLvl})`);
    assert.ok(Math.abs((d.brakeLvl - d.ff) - (decisions[0].brakeLvl - decisions[0].ff)) < 1e-12,
      `same trim at every pace (${d.brakeLvl - d.ff} vs ${decisions[0].brakeLvl - decisions[0].ff})`);
  }
});

test("closed loop: braking into one corner arrives within 1 m/s of the planned corner speed", () => {
  // The executor game.js runs: v -= brake·brakeLvl·dt while braking. One
  // corner 300 m ahead (k 0.02, vC ~33 m/s) approached at 70 m/s.
  const k = 0.02, dt = 1 / 60, brake = 22;
  let v = 70, s = 0, vAtCorner = null;
  const vC = A.cornerSpeed(k, 22, 1, 72);
  for (let i = 0; i < 60 * 20 && vAtCorner === null; i++) {
    const d = 300 - s;
    if (d <= 1) { vAtCorner = v; break; }
    const samples = [];
    for (let x = 4; x <= Math.min(d, 160); x += 4) samples.push({ d: x, k: x >= d - 2 ? k : 0.0001, bank: 0 });
    if (d < 160) samples.push({ d, k, bank: 0 });
    const br = A.brakeDecision({ traits: mid, samples, latMax: 22, brake, grip: 1, speed: v, pace: 1, vmax: 72 });
    if (br.braking) v = Math.max(0, v - brake * br.brakeLvl * dt);
    s += v * dt;
  }
  assert.ok(vAtCorner !== null, "reached the corner");
  assert.ok(vAtCorner - vC < 1.0, `arrived at ${vAtCorner.toFixed(2)} m/s for a planned ${vC.toFixed(2)} (old P band: +5.9 m/s)`);
  assert.ok(vAtCorner > vC - 2, `and did not stop short (${vAtCorner.toFixed(2)})`);
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

test("aggression raises otFireRate and shortens queue patience (fire half)", () => {
  const base = {
    traits: { ...mid, aggression: 0 }, blockerGap: 5, gapAhead: 5, roomL: 3, roomR: 2,
    speed: 58, aheadSpeed: 54, kAhead: 0.002, street: false,
  };
  const hot = { ...base, traits: { ...mid, aggression: 1 } };
  const cold = { ...base, traits: { ...mid, aggression: -1 } };
  assert.ok(A.otFireRate(hot) > A.otFireRate(base));
  assert.ok(A.otFireRate(base) > A.otFireRate(cold));
  assert.ok(A.queuePatience(hot.traits) < A.queuePatience(base.traits));
  assert.ok(A.passHold(hot.traits) > A.passHold(base.traits));
});

test("optimism raises brakeTarget entry speed (late markers)", () => {
  const samples = [{ d: 50, k: 0.018, bank: 0 }];
  const neut = A.brakeTarget({ traits: { ...mid, optimism: 0 }, samples, latMax: 22, brake: 22, grip: 1 });
  const opt = A.brakeTarget({ traits: { ...mid, optimism: 1 }, samples, latMax: 22, brake: 22, grip: 1 });
  const shy = A.brakeTarget({ traits: { ...mid, optimism: -1 }, samples, latMax: 22, brake: 22, grip: 1 });
  assert.ok(opt > neut);
  assert.ok(neut > shy);
});

test("traits defaults style axes to neutral", () => {
  const t = A.traits({});
  assert.equal(t.aggression, 0);
  assert.equal(t.optimism, 0);
});

test("compound-corner brake limits exactly match the tightest individual sample", () => {
  let seed = 8556;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let run = 0; run < 200; run++) {
    const samples = Array.from({ length: 40 }, () => ({
      d: 12 + rnd() * 148, k: (rnd() - 0.5) * 0.16, bank: rnd() * 0.45,
    }));
    const ctx = { traits: { ...mid, skill: 0.8 + rnd() * 0.2 }, samples,
      aeroLoad: rnd(), latMax: 22, brake: 22, grip: 0.4 + rnd(),
      pace: [0.05, 0.5, 1, 2, undefined][run % 5], vmax: [1, 72, 120, undefined][run % 4],
      blocker: run % 2 === 0, blockerGap: 8, blockerSpeed: 50, speed: 55,
      roomL: 3, roomR: 1, errMul: run % 3 === 0 ? 1.05 : 1 };
    const expected = Math.min(...samples.map(s => A.brakeTarget({ ...ctx, samples: [s] })));
    assert.equal(A.brakeTarget(ctx), expected);
    assert.equal(A.brakeTarget({ ...ctx, samples: samples.slice().reverse() }), expected);
  }
  assert.equal(A.brakeTarget({ traits: mid, samples: [] }), 1e6);
});

test("brake planner carries the public corner envelope across consecutive pace settings", () => {
  for (const pace of [undefined, 0.05, 0.5, 1, 2, 0.5]) {
    for (const vmax of [undefined, 1, 72, 120]) {
      const sample = { d: 4, k: 0.03, bank: 0.2 };
      const corner = A.cornerSpeed(sample.k, 22 * (1 + Math.sin(sample.bank) * 0.8), pace, vmax) * mid.skill;
      const expected = Math.sqrt(corner * corner + 2 * 22 * 0.85 * sample.d);
      assert.equal(A.brakeTarget({ traits: mid, samples: [sample], latMax: 22, brake: 22, pace, vmax }), expected);
    }
  }
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
  // Sparse traffic: no move on permanents
  assert.equal(A.adaptLane(0.2, { traits: mid, nearby: 1, roomL: 0.5, roomR: 4, baseLane: 0.2 }, 0.5), 0.2);
  // Streets: held in a train behind ONE car still fans once queue pressure builds.
  const pressed = A.adaptLane(0, {
    traits: mid, nearby: 1, queueT: 60, street: true, roomL: 0.5, roomR: 3.5, baseLane: 0,
  }, 0.5);
  assert.ok(pressed > 0,
    `street queue pressure must fan a one-car train toward the freer side, got ${pressed}`);
  assert.equal(A.adaptLane(0.2, {
    traits: mid, nearby: 1, queueT: 60, street: false, roomL: 0.5, roomR: 4, baseLane: 0.2,
  }, 0.5), 0.2, "permanents keep the dens≥2 gate");
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
  // A sandwich boxes anywhere.
  assert.equal(A.isBoxed({ contactT: 0, roomL: 1.0, roomR: 1.0, street: false }), true);
});

test("isBoxed: contact needs the room to be gone too", () => {
  // THE DEFECT: `contactT > 0` was the first line of isBoxed, so any rub — even
  // side by side on a 15 m permanent — read as wedged. Boxed feeds stuckT feeds
  // unstuckActive, which cancels braking and yanks the car sideways, so leaning
  // on an AI switched it into dig-out mode with a whole lane still free.
  assert.equal(A.isBoxed({ contactT: 0.22, roomL: 5, roomR: 5, street: false }), false);
  assert.equal(A.isBoxed({ contactT: 0.22, roomL: 5, roomR: 5, street: true }), false);
  // Contact with the room actually gone is still a wedge, on both surfaces.
  assert.equal(A.isBoxed({ contactT: 0.22, roomL: 1.4, roomR: 1.5, street: false }), true);
  assert.equal(A.isBoxed({ contactT: 0.22, roomL: 1.4, roomR: 1.5, street: true }), true);
  // …and the contact clause is the ONLY thing separating those two rows: with
  // it cleared, the same tight-but-not-sandwiched room is not boxed.
  assert.equal(A.isBoxed({ contactT: 0, roomL: 1.4, roomR: 1.5, street: false }), false);
});

test("aiRescueDelay: contact is patience, never a veto", () => {
  const free = A.aiRescueDelay(false), held = A.aiRescueDelay(true);
  assert.ok(Number.isFinite(held), "a contacting car must still be rescuable");
  assert.ok(held > free, `contact should wait longer, got ${held} vs ${free}`);
  assert.equal(free, 4, "the no-contact delay is the one that shipped");
  // Escalated dig-out: short arm — contact patience already ran while digging.
  assert.ok(A.aiRescueDelay(false, true) < free);
  assert.ok(A.aiRescueDelay(true, true) < held);
});

test("dig-out has a budget — past it, rescue must be allowed to arm", () => {
  // THE DEFECT: unstuckActive permanently vetoed aiStuck (`!unstuckActive`), so
  // a car boxed at 0 m/s on monaco climbed stuckT to 7.6 s with rescueT = 0
  // forever. Dig-out is the first recovery; when it fails, rescue is the second.
  const budget = A.digOutBudget(mid);
  assert.ok(budget > 1.5 && budget < 5,
    `dig-out budget must be a few seconds, got ${budget}`);
  assert.ok(A.digOutBudget(ace) < A.digOutBudget(rook),
    "aware drivers escalate to rescue sooner");
  assert.ok(A.digOutBudget(mid, true) < A.digOutBudget(mid, false),
    "streets escalate sooner — walls leave less room for dig-out");
  const thresh = A.stuckThreshold(mid);
  assert.equal(A.digOutEscalated(thresh, mid), false, "just armed: still digging");
  assert.equal(A.digOutEscalated(thresh + budget - 0.05, mid), false);
  assert.equal(A.digOutEscalated(thresh + budget + 0.05, mid), true,
    "past dig-out budget: escalate to rescue");
});

test("dig-out escalation holds until dig-out ends — a partial yank cannot re-veto rescue", () => {
  // THE DEFECT (monaco, stalled pole car, 2026-10-07): dig-out's sideways yank
  // dipped stuckT just under thresh + budget while the car still crawled, so
  // digEsc flickered false, `!unstuckActive` vetoed rescue again and rescueT
  // bled from 1.23 to 0 — a 5.3 s crawl against a 5 s cap.
  assert.equal(A.digOutHeld(false, false, true), false, "digging, never escalated: dig-out keeps its budget");
  assert.equal(A.digOutHeld(false, true, true), true, "escalates past the budget");
  assert.equal(A.digOutHeld(true, false, true), true, "stuckT dipped under the line mid-dig: still escalated");
  assert.equal(A.digOutHeld(true, false, false), false, "dig-out ended (free or rescued): latch clears");
  assert.equal(A.digOutHeld(true, true, false), true, "escalatedNow always wins");
});

test("otSide: a tie does not send the whole queue one way", () => {
  const flat = { roomL: 4, roomR: 4, kAhead: 0, lane: 0 };
  // Clearly freer side always wins, whatever the corner or the lane says.
  assert.equal(A.otSide({ ...flat, roomR: 6, kAhead: 0.01, lane: -0.5 }), 1);
  assert.equal(A.otSide({ ...flat, roomL: 6, kAhead: -0.01, lane: 0.5 }), -1);
  // Even room: the inside of the next corner. +k is a LEFT-hander (measured,
  // AGENTS.md), so the inside is -x — the same -sign(k) the racing line uses.
  assert.equal(A.otSide({ ...flat, kAhead: 0.01 }), -1);
  assert.equal(A.otSide({ ...flat, kAhead: -0.01 }), 1);
  // Even room on a straight: the car's own lane sign, so a pack fans out both
  // ways instead of every car picking the same side (the old `>=` default).
  assert.equal(A.otSide({ ...flat, lane: 0.4 }), 1);
  assert.equal(A.otSide({ ...flat, lane: -0.4 }), -1);
});

test("otPull: a queue-limited car pulls out even though it is slower", () => {
  const base = {
    street: false, traits: { craft: 0.8, awareness: 0.7, experience: 0.8 },
    blockerSpeed: 40, blockerGap: 8, roomL: 4, roomR: 4, kAhead: 0, lane: 0,
    team: null, seat: null, stats: null, other: null,
  };
  // THE DEFECT: the trigger was "I am ALREADY faster than the car ahead", which
  // a queued car can never be — the queue cap holds it ~6 m/s BELOW the
  // blocker's pace by construction, so the one car that most needed to pull out
  // never did and the train never broke up.
  assert.equal(A.otPull({ ...base, speed: 34, freeSpeed: 0 }), 0, "the old trigger, unchanged");
  assert.notEqual(A.otPull({ ...base, speed: 34, freeSpeed: 55 }), 0,
    "a car whose free pace clears the blocker must commit even while capped");
  // …and a car that is genuinely no quicker still stays put, capped or not.
  assert.equal(A.otPull({ ...base, speed: 34, freeSpeed: 41 }), 0);
  // The already-closing path is untouched.
  assert.notEqual(A.otPull({ ...base, speed: 46, freeSpeed: 0 }), 0);
});

test("letPass: awareness commits earlier, yield fits a permanent lane", () => {
  const shy = { craft: 0.5, awareness: 0.2, experience: 0.2 };
  const alert = { craft: 0.5, awareness: 0.95, experience: 0.9 };
  assert.ok(A.letPassDelay(alert) < A.letPassDelay(shy), "awareness yields sooner");
  assert.ok(A.letPassDelay(shy) < 6, "a patience window, not a race-long one");
  // The pull must fit inside the room the caller gates on (freeRoom > 1.6).
  for (const t of [shy, alert]) {
    assert.ok(A.letPassPull(t, false) > 0 && A.letPassPull(t, false) < 1.6);
    assert.ok(A.letPassPull(t, true) < A.letPassPull(t, false), "streets yield less");
  }
  // The ease is a nudge off the throttle, not a lift.
  for (const t of [shy, alert]) {
    const e = A.letPassEase(t);
    assert.ok(e > 0.9 && e < 1, `letPassEase out of band: ${e}`);
  }
});

test("minLatGap and lineFollow keep street home seats", () => {
  assert.equal(A.minLatGap(8, false), 2.8);
  const monaco = A.minLatGap(5, true);
  assert.ok(monaco >= 2.12 && monaco <= 2.3, `monaco gap ${monaco}`);
  assert.ok(monaco < 2.8, "street gap must be tighter than the permanent 2.8");
  assert.equal(A.lineFollow(false), 0.92);
  assert.ok(A.lineFollow(true) < 0.92, "streets must hold the grid seat more");
});

test("street OT scale still uses a clean gap after the seating fix", () => {
  assert.ok(A.streetOtScale(rook) >= 0.72);
  assert.ok(A.streetOtScale(ace) > A.streetOtScale(rook));
});

test("street tow is half-size and queue brake eases in", () => {
  assert.equal(A.towGain(false), 0.045);
  assert.ok(A.towGain(true) > 0 && A.towGain(true) < A.towGain(false));
  // Permanents GRADE now, like streets always did. Full brakes at +3.1 m/s
  // (22 m/s², and it takes the throttle branch away) killed every run at the
  // car ahead: the pursuer arrived at the follow distance with no differential.
  const hard = A.queueBrake(60, 56.9, false);
  assert.ok(hard > 0 && hard < 1, `permanent +3.1 eases in, not full brake: ${hard}`);
  assert.equal(A.queueBrake(60, 57.5, false), 0, "permanent still waits for +3");
  assert.equal(A.queueBrake(60, 57.5, true), 0, "street +2.5 is still a follow close");
  const soft = A.queueBrake(60, 54.5, true);
  assert.ok(soft > 0 && soft < 1, `street ease-in ${soft}`);
  assert.equal(A.queueBrake(60, 50, true), 1);
  assert.equal(A.queueBrake(60, 50, false), 1, "a real closing rate still gets full brake");
  // TIME-TO-CONTACT GATE: closing at +4 from 15 m back with a 6 m follow
  // distance is a car being CAUGHT, not hit — no brake until the gap can no
  // longer absorb the closing rate.
  assert.equal(A.queueBrake(44, 40, false, 15, 6), 0, "15 m back at +4: still absorbable");
  assert.ok(A.queueBrake(44, 40, false, 8, 6) > 0, "8 m back at +4: brake");
});

test("otWant compares PACE with pace, scaled to the top speed", () => {
  const base = { street: false, speed: 40, blockerSpeed: 40, vTop: 72 };
  // A blocker slow THIS INSTANT (a corner) but with the same pace: no incentive.
  assert.equal(A.otWant({ ...base, speed: 30, freeSpeed: 70, blockerSpeed: 30, blockerVmax: 70 }), false);
  // A blocker with genuinely less pace: incentive, even while both are slow.
  assert.equal(A.otWant({ ...base, speed: 30, freeSpeed: 70, blockerSpeed: 30, blockerVmax: 60 }), true);
  // Margin rides the top speed: 7 % of 72 is ~5; at half pace it is ~2.5.
  assert.equal(A.otWant({ ...base, vTop: 36, freeSpeed: 35, blockerVmax: 32 }), true);
  assert.equal(A.otWant({ ...base, vTop: 72, freeSpeed: 35, blockerVmax: 32 }), false);
  // Already closing fast still counts.
  assert.equal(A.otWant({ ...base, speed: 46, freeSpeed: 0, blockerVmax: 0 }), true);
});

test("otWant treats a crawling car as an obstacle whatever its pace", () => {
  // Measured: an AI on the 3 m/s queue floor behind a PARKED player (whose
  // model top speed read as pace 60) failed both the closing and the held test
  // and crept into its back. Under 12 % of the top speed the blocker is passed.
  const base = { street: false, speed: 3, freeSpeed: 55, vTop: 60, blockerVmax: 60 };
  assert.equal(A.otWant({ ...base, blockerSpeed: 0 }), true);
  assert.equal(A.otWant({ ...base, blockerSpeed: 7 }), true);
  assert.equal(A.otWant({ ...base, blockerSpeed: 7.3 }), false, "12 % of 60 is 7.2");
  // A human blocker has no ceiling: the caller passes 0 and their SPEED is the pace.
  assert.equal(A.otWant({ street: false, speed: 40, freeSpeed: 55, vTop: 60, blockerVmax: 0, blockerSpeed: 40 }), true);
  assert.equal(A.otWant({ street: false, speed: 40, freeSpeed: 43, vTop: 60, blockerVmax: 0, blockerSpeed: 40 }), false);
});

test("passTarget is a position beside the passed car, inside the road", () => {
  assert.equal(A.passTarget(0, 1, 2.8, 7), 2.8);
  assert.equal(A.passTarget(-1.5, -1, 2.8, 7), -4.3);
  // Clamped to the drivable width, never past the edge.
  assert.equal(A.passTarget(5.5, 1, 2.8, 7), 6.4);
  // Independent of where WE are — that is the anti-mirror property. This line
  // used to compare passTarget(1,1,2.8,7) WITH ITSELF, which is 3.8 === 3.8 and
  // cannot fail: proven 2026-09-22 by scaling the body's offset, after which
  // the call returned 6.4 and this assertion still passed. The named property
  // was never asserted, and could not be — the signature carries no "our x".
  // What it can assert is that the target is built from the OPPONENT's line
  // plus a fixed side offset, identically at two different opponent positions.
  assert.equal(A.passTarget(1, 1, 2.8, 7), 3.8);
  // -1 + 2.8 is 1.7999999999999998 in binary floating point, so this one needs
  // a tolerance where its exact-valued neighbours above do not.
  assert.ok(Math.abs(A.passTarget(-1, 1, 2.8, 7) - 1.8) < 1e-9,
    "same side, same clearance — the offset must not vary with where the opponent sits");
});

test("pass patience and cooldown are per-car and bounded", () => {
  const shy = { craft: 0.2, awareness: 0.5, experience: 0.2 }, sharp = { craft: 0.95, awareness: 0.5, experience: 0.95 };
  assert.ok(A.passHold(sharp) > A.passHold(shy), "craft commits longer");
  assert.ok(A.passHold(shy) >= 2 && A.passHold(sharp) <= 5, "a few seconds, not a lap");
  assert.ok(A.passCooldown(sharp) < A.passCooldown(shy), "experience retries sooner");
  assert.ok(A.passCooldown(sharp) > 1 && A.passCooldown(shy) < 5);
});

test("sideYieldsA: the car less than half alongside yields; level, the outer car does", () => {
  assert.equal(A.sideYieldsA(-3, 0, 0), true, "A behind -> A yields");
  assert.equal(A.sideYieldsA(3, 0, 0), false, "A ahead -> B yields");
  assert.equal(A.sideYieldsA(0.2, 3.0, 1.0), true, "level: A is outer");
  assert.equal(A.sideYieldsA(0.2, 1.0, 3.0), false, "level: B is outer");
  // Half a car (2.4 m of 4.8) is the line — the FIA's "significant portion
  // alongside". A bumper ahead is NOT ahead: measured, a player 0.6 m back was
  // "behind" and paid the whole rub.
  assert.equal(A.sideYieldsA(0.63, -1.9, 0.0), true, "A 0.63 m ahead but outer: A yields");
  assert.equal(A.sideYieldsA(2.0, 1.0, 3.0), false, "2 m ahead, B outer: B yields");
  assert.equal(A.sideYieldsA(2.0, 3.0, 1.0), true, "2 m ahead, A outer: A yields");
  assert.equal(A.sideYieldsA(2.6, 3.0, 1.0), false, "past half a car: A is simply ahead");
  // Deterministic and exhaustive: exactly one of the pair yields, always.
  for (const dp of [-3, -0.6, 0, 0.6, 3]) for (const [xa, xb] of [[1, 2], [2, 1], [-3, 0.5]])
    assert.equal(A.sideYieldsA(dp, xa, xb), !A.sideYieldsA(-dp, xb, xa), `symmetric ${dp} ${xa} ${xb}`);
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
  assert.ok(A.followTime(ace, false, mcl) > A.followTime(ace, false),
    "hold-car teams leave a wider follow gap");
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
  assert.ok(A.followTime(mid, false, team, 1, lead) > A.followTime(mid, false, team, 0, second),
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
  // With the feed-forward (verify-physics #3) the pedal sits near the planner's
  // 0.85 budget the moment braking starts, so consistency acts where the band
  // still decides: the ONSET (soft) and the size of the trim.
  const at = lim + 1.2;
  const midDec = Object.assign({}, A.brakeDecision({ ...base, speed: at }));
  const rookDec = Object.assign({}, A.brakeDecision({
    ...base, traits: { ...mid, consistency: 0.2 }, speed: at,
  }));
  const aceDec = Object.assign({}, A.brakeDecision({
    ...base, traits: { ...mid, consistency: 1 }, speed: at,
  }));
  assert.equal(midDec.braking, true);
  assert.ok(midDec.brakeLvl < 1, `anti-vacuity: mid is unclamped (${midDec.brakeLvl})`);
  assert.equal(rookDec.braking, false, "rookie eases in later");
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

test("hold cars follow less racing line; omitted hold keeps the street/permanent defaults", () => {
  assert.equal(A.lineFollow(false), 0.92);
  assert.equal(A.lineFollow(true), 0.86);
  assert.ok(A.lineFollow(false, 0.6) < 0.92);
  assert.ok(A.lineFollow(true, 0.6) < 0.86);
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

test("launchPlan: awareness reads the lights, hands manage the getaway, the roll is the day", () => {
  const sharp = { craft: 0.9, awareness: 0.95, experience: 0.8, skill: 0.99, consistency: 0.8 };
  const green = { craft: 0.4, awareness: 0.3, experience: 0.3, skill: 0.92, consistency: 0.5 };
  const a = A.launchPlan(sharp, 0.5), b = A.launchPlan(green, 0.5);
  assert.ok(a.react < b.react, `awareness must shorten the reaction: ${a.react} vs ${b.react}`);
  assert.ok(a.grip > b.grip, `craft+skill must improve the getaway: ${a.grip} vs ${b.grip}`);
  // Bounded whatever the roll — a reaction is never instant and never a nap.
  for (const r of [0, 0.13, 0.5, 0.87, 0.999]) for (const t of [sharp, green]) {
    const p = A.launchPlan(t, r);
    assert.ok(p.react >= 0.05 && p.react <= 0.75, `react out of range: ${p.react}`);
    assert.ok(p.grip >= 0.7 && p.grip <= 1.08, `grip out of range: ${p.grip}`);
  }
  // Two different rolls are two different launches (the per-race hash matters).
  assert.notEqual(A.launchPlan(sharp, 0.2).react, A.launchPlan(sharp, 0.8).react);
  // Returned by value: the next plan does not rewrite the last car's.
  const p1 = A.launchPlan(sharp, 0.2); A.launchPlan(green, 0.9);
  assert.equal(p1.react, A.launchPlan(sharp, 0.2).react);
});

test("launchMul: nothing before the reaction, the getaway at it, ordinary after three seconds", () => {
  const plan = { react: 0.3, grip: 0.85 };
  assert.equal(A.launchMul(0, plan), 0);
  assert.equal(A.launchMul(0.29, plan), 0);
  assert.equal(A.launchMul(0.3, plan), 0.85);
  const mid = A.launchMul(1.8, plan);
  assert.ok(mid > 0.85 && mid < 1, `fade must be monotone: ${mid}`);
  assert.equal(A.launchMul(3.3, plan), 1);
  assert.equal(A.launchMul(10, plan), 1);
  assert.equal(A.launchMul(0, null), 1, "no plan (a human, or before gridUp) is no effect");
  assert.equal(A.launchDone(3.29, plan), false);
  assert.equal(A.launchDone(3.31, plan), true);
  assert.equal(A.launchDone(0, null), true);
});

test("pacePhase is a zero-mean drift whose amplitude falls with consistency", () => {
  const sample = (cons, roll) => {
    let mn = Infinity, mx = -Infinity, sum = 0, n = 0;
    for (let t = 0; t < 600; t += 0.25) { const v = A.pacePhase(t, cons, roll); mn = Math.min(mn, v); mx = Math.max(mx, v); sum += v; n++; }
    return { mn, mx, mean: sum / n };
  };
  const rookie = sample(0.3, 0.4), metronome = sample(1.0, 0.4);
  assert.ok(rookie.mx - rookie.mn > metronome.mx - metronome.mn, "a consistent driver drifts less");
  assert.ok(rookie.mx <= 1.0165 && rookie.mn >= 0.9835, `rookie amplitude past 1.6 %: ${rookie.mn}..${rookie.mx}`);
  assert.ok(metronome.mx <= 1.0055 && metronome.mn >= 0.9945, `metronome amplitude past 0.5 %: ${metronome.mn}..${metronome.mx}`);
  assert.ok(Math.abs(rookie.mean - 1) < 0.001, `not zero-mean over ten minutes: ${rookie.mean}`);
  // Two cars with different rolls are out of phase — that is the whole point.
  let same = 0; for (let t = 0; t < 120; t += 1) if (Math.sign(A.pacePhase(t, 0.5, 0.1) - 1) === Math.sign(A.pacePhase(t, 0.5, 0.7) - 1)) same++;
  assert.ok(same < 100, `two rolls moved together ${same}/120 s`);
  assert.equal(A.pacePhase(0, undefined, undefined), 1, "no consistency, no roll: phase zero at t=0");
});

test("otWant: a blocker that is slow but PULLING AWAY is a launching car, not an obstacle", () => {
  const base = { street: false, speed: 3, freeSpeed: 55, vTop: 60, blockerVmax: 60, blockerSpeed: 4 };
  assert.equal(A.otWant({ ...base, blockerAccel: 0 }), true, "parked: pass it");
  assert.equal(A.otWant({ ...base, blockerAccel: 0.5 }), true, "creeping: still an obstacle");
  assert.equal(A.otWant({ ...base, blockerAccel: 5 }), false, "launching at 5 m/s^2: leave it");
  // Scaled to the top speed like the rest: at half pace both thresholds halve
  // (crawl speed 3.6 m/s, acceleration 0.48 m/s^2).
  assert.equal(A.otWant({ ...base, vTop: 30, blockerSpeed: 2, blockerAccel: 0.6 }), false);
  assert.equal(A.otWant({ ...base, vTop: 30, blockerSpeed: 2, blockerAccel: 0.4 }), true);
  assert.equal(A.otWant({ ...base, vTop: 30, blockerSpeed: 4, blockerAccel: 0 }), false, "4 m/s is not a crawl at half pace");
});

test("rubDecel is a small absolute deceleration, a touch firmer on streets", () => {
  assert.equal(A.rubDecel(false), 3);
  assert.ok(A.rubDecel(true) > A.rubDecel(false));
  // Sanity: a second of rub at any speed costs a few m/s, not a third of it —
  // the proportional 0.995/frame it replaced took 26 % a second (x4 per pass).
  assert.ok(A.rubDecel(true) * 1 < 5);
});

test("bumpRestitution: resting below 1 m/s, a tenth from 3 m/s, a ramp between", () => {
  assert.equal(A.bumpRestitution(0), 0);
  assert.equal(A.bumpRestitution(0.9), 0);
  assert.equal(A.bumpRestitution(2), 0.05);
  assert.equal(A.bumpRestitution(3), 0.1);
  assert.equal(A.bumpRestitution(30), 0.1, "never bouncier than a tenth");
  assert.equal(A.bumpRestitution(undefined), 0);
  assert.ok(A.humanPuntCap() >= 5 && A.humanPuntCap() <= 12, "a cap a player notices but is not launched by");
});

test("squeezeEase drops a pinned yielder under the other car's speed, more so on a street", () => {
  assert.ok(A.squeezeEase(false) < 1 && A.squeezeEase(false) >= 0.85);
  assert.ok(A.squeezeEase(true) < A.squeezeEase(false));
  // A dab, not a stop: a quarter of BRAKE ends a rub in under a second without
  // parking the car in the pack behind.
  assert.ok(A.squeezeBrake() > 0.1 && A.squeezeBrake() <= 0.4);
});

test("queueBrake: the time-to-collision gate catches a slow creep the closing-rate gate misses", () => {
  // 2.5 m/s closing, half a metre past the follow distance: 6.25 m/s^2 needed, catch in 0.2 s.
  const creep = A.queueBrake(42.5, 40, false, 6.5, 6, 22);
  assert.ok(creep > 0, "a creep that needs 6 m/s^2 must brake");
  assert.ok(creep < 0.5, `in proportion to the need, not a stamp: ${creep}`);
  // The same closing rate with room to lift: nothing.
  assert.equal(A.queueBrake(42.5, 40, false, 20, 6, 22), 0);
  // Under 5 m/s^2 required, or over 3 s away: nothing (the lift band).
  assert.equal(A.queueBrake(42, 40, false, 8, 6, 22), 0, "4 m/s^2 is a lift");
  assert.equal(A.queueBrake(41, 40, false, 10, 6, 22), 0, "4 s away");
  // The original gate is unchanged where it fired before.
  assert.equal(A.queueBrake(60, 50, true, undefined, undefined, 22), 1);
  assert.ok(A.queueBrake(44, 40, false, 8, 6, 22) >= 0.2);
  // Monotone in the need: closer is harder.
  assert.ok(A.queueBrake(43, 40, false, 6.6, 6, 22) > A.queueBrake(43, 40, false, 7.5, 6, 22));
});

test("holdLineGap is a second behind, floored at eight metres", () => {
  assert.equal(A.holdLineGap(60), 60);
  assert.equal(A.holdLineGap(5), 8);
  assert.equal(A.holdLineGap(undefined), 8);
});

test("defendOnce: the first pull fixes the side, the other way is refused, no pull keeps the side", () => {
  // Field-wise: the module lives in a VM realm, so its objects fail strict deep equality on prototype.
  const eq = (got, defend, side, why) => { assert.equal(got.defend, defend, why); assert.equal(got.side, side, why); };
  let st = A.defendOnce(0.6, 0);
  eq(st, 0.6, 1, "a fresh straight: the first pull fixes the side");
  st = A.defendOnce(0.4, st.side);
  eq(st, 0.4, 1, "same side: allowed");
  st = A.defendOnce(-0.7, st.side);
  eq(st, 0, 1, "the second change of direction is refused");
  st = A.defendOnce(0, st.side);
  eq(st, 0, 1, "no pull leaves the side latched until the braking zone");
  eq(A.defendOnce(-0.7, 0), -0.7, -1, "a fresh straight may go either way once");
});

test("attackOK: a straight is always a place to pass; a corner entry only at its zone's quality", () => {
  const t = { craft: 0.75 };
  const base = { traits: t, speed: 46, blockerSpeed: 40, roll: 0.5, kAhead: 0, toTurnIn: 1e9, attackQ: 0 };
  assert.equal(A.attackOK(base), true, "a straight with a 6 m/s closing rate");
  assert.equal(A.attackOK({ ...base, speed: 41 }), false, "barely closing on a straight: shadow it");
  assert.equal(A.attackOK({ ...base, kAhead: 0.02 }), false, "mid-corner, no zone: not on");
  // A car with real pace deficit is passed wherever, and a crawling one anywhere.
  assert.equal(A.attackOK({ ...base, kAhead: 0.02, vTop: 72, freeSpeed: 70, blockerVmax: 58 }), true, "17 % of pace in hand: on, even mid-corner");
  assert.equal(A.attackOK({ ...base, kAhead: 0.02, vTop: 72, freeSpeed: 70, blockerVmax: 66.5 }), false, "5 % — the tier spread — is not a licence to pass mid-corner");
  assert.equal(A.attackOK({ ...base, kAhead: 0.02, speed: 5, blockerSpeed: 3, vTop: 72, freeSpeed: 70, blockerVmax: 70 }), true, "a crawling car is passed anywhere");
  // Inside a zone the baked quality decides.
  assert.equal(A.attackOK({ ...base, toTurnIn: 80, attackQ: 0.9 }), true, "a prime braking zone");
  assert.equal(A.attackOK({ ...base, toTurnIn: 80, attackQ: 0.15 }), false, "a poor one (short straight or narrow road)");
  // Craft and the roll widen or narrow the window.
  assert.equal(A.attackOK({ ...base, toTurnIn: 80, attackQ: 0.35, traits: { craft: 0.2 } }), false, "a rookie does not see the marginal move");
  assert.equal(A.attackOK({ ...base, toTurnIn: 80, attackQ: 0.35, traits: { craft: 1.0 }, roll: 1 }), true, "a great one, on a good day, does");
  assert.equal(A.sideLevel(), 2.4);
});

// THE FIRST LAP (2026-10-01): a launching car, and for 20 s from the green,
// leaves more headway and attacks at half the quality; nothing after.
test("startCalm: full while launching, fades out by 20 s from the green, never for a car that did not launch", () => {
  assert.equal(A.startCalm(true, undefined, 1), 1);
  assert.equal(A.startCalm(false, 20, 5), 1, "well inside the window");
  const fade = A.startCalm(false, 20, 16);
  assert.ok(fade > 0 && fade < 1, `fading: ${fade}`);
  assert.equal(A.startCalm(false, 20, 20), 0, "and gone at 20 s");
  assert.equal(A.startCalm(false, undefined, 3), 0, "placed at speed, no launch: no calm");
  assert.equal(A.startCalmS(), 20);
  assert.ok(A.startGapT(1) > 0.1 && A.startGapT(0) === 0);
  const t = { craft: 0.75 };
  const zone = { traits: t, speed: 46, blockerSpeed: 40, roll: 0.5, kAhead: 0, toTurnIn: 80, attackQ: 0.55 };
  assert.equal(A.attackOK(zone), true, "a good zone on lap 20");
  assert.equal(A.attackOK({ ...zone, calm: 1 }), false, "the same zone into turn 1");
  assert.equal(A.attackOK({ ...zone, attackQ: 1, calm: 1 }), true, "a prime one is still on");
});

test("mistakeChance: rarer with consistency, commoner under pressure, in the F1-not-F1-22 band", () => {
  const top = { consistency: 1.0 }, rookie = { consistency: 0.5 };
  // Hard / default errMul=1 keeps the 0.004 base (Slice 4 lift is em>1 only).
  assert.ok(Math.abs(A.mistakeChance(top, 0) - 0.0012) < 1e-6, "a metronome unpressured: 0.12 % a zone");
  assert.ok(Math.abs(A.mistakeChance(rookie, 1) - 0.0096) < 1e-6, "a rookie under sustained pressure: ~1 % a zone");
  assert.ok(A.mistakeChance(rookie, 0) > A.mistakeChance(top, 0));
  assert.ok(A.mistakeChance(top, 1) > A.mistakeChance(top, 0));
  assert.ok(A.mistakeChance(top, 1) === A.mistakeChance(top, 2), "pressure saturates at 1");
  assert.ok(A.mistakeChance(undefined, 0) > 0, "no traits: the default driver still errs");
  // Phases: late/wide first, then gathering, then nothing.
  const T = A.mistakeTotal();
  assert.equal(A.mistakePhase(T), 1); assert.equal(A.mistakePhase(1.0), 2); assert.equal(A.mistakePhase(0), 0); assert.equal(A.mistakePhase(undefined), 0);
  assert.ok(A.mistakeBrakeMul() > 1 && A.mistakeBrakeMul() < 1.1, "late by a few per cent, not a crash");
  assert.ok(A.mistakeGatherMul() < 1 && A.mistakeGatherMul() > 0.7);
});

test("mistakeChance: errMul is the difficulty-ladder rate scale, default 1", () => {
  const top = { consistency: 1.0 };
  const base = A.mistakeChance(top, 0);
  assert.equal(A.mistakeChance(top, 0, 1), base, "errMul 1 keeps the old value");
  // Slice 4: em>1 also lifts the base, so rate grows faster than linear in em.
  assert.ok(A.mistakeChance(top, 0, 2) > base * 2, "easy/normal visibility lift on top of DIFF.err");
  assert.ok(A.mistakeChance(top, 0, 3.5) > A.mistakeChance(top, 0, 1.8), "easy > normal");
  assert.equal(A.mistakeChance(top, 0, undefined), base, "errMul undefined falls back to 1");
  assert.equal(A.mistakeChance(top, 0, 0), base, "errMul 0 falls back to 1 (never zeroes the rate)");
  assert.equal(A.mistakeChance(top, 0), base, "the old 2-arg call is unchanged");
});

test("mistakeChance: optimism raises rate under pressure only (Slice 4)", () => {
  const mid = { consistency: 0.75, optimism: 0 };
  const hot = { consistency: 0.75, optimism: 1 };
  const shy = { consistency: 0.75, optimism: -1 };
  assert.equal(A.mistakeChance(hot, 0), A.mistakeChance(mid, 0), "unpressured: optimism is inert");
  assert.ok(A.mistakeChance(hot, 1) > A.mistakeChance(mid, 1));
  assert.ok(A.mistakeChance(shy, 1) < A.mistakeChance(mid, 1));
});

test("PhysicsConsts.DIFF.err is a monotonic ladder: easy >= normal >= hard = 1", () => {
  const src = readFileSync(join(ROOT, "js/physics/consts.js"), "utf8");
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(src, ctx, { filename: "js/physics/consts.js" });
  const DIFF = ctx.window.PhysicsConsts.DIFF;
  assert.ok(DIFF.easy.err >= DIFF.normal.err, "easy errs at least as often as normal");
  assert.ok(DIFF.normal.err >= DIFF.hard.err, "normal errs at least as often as hard");
  assert.equal(DIFF.hard.err, 1, "hard stays the unscaled baseline rate");
});

test("tyres: sprints start on softs, long races mix; a soft is up and fades, a hard is down and lasts", () => {
  assert.equal(A.tyreClass(0.5, 3), "soft"); assert.equal(A.tyreClass(0.9, 3), "medium");
  assert.equal(A.tyreClass(0.9, 25), "hard"); assert.equal(A.tyreClass(0.1, 25), "soft");
  assert.ok(A.tyrePace("soft", 0) > A.tyrePace("medium", 0) && A.tyrePace("medium", 0) > A.tyrePace("hard", 0));
  assert.ok(A.tyrePace("soft", 12) < A.tyrePace("hard", 12), "by lap 12 the hard-starter is ahead on pace: a crossover");
  assert.ok(A.tyrePace("soft", 8) > A.tyrePace("hard", 8), "and at lap 8 the soft still is");
  assert.ok(A.tyrePace("soft", 60) >= 1.004 - 0.025 - 1e-9, "deg is capped");
  assert.equal(A.tyrePace("nonsense", 0), 1, "an unknown class is a medium");
  // The three fresh offsets are zero-mean over a mixed field.
  assert.ok(Math.abs(A.tyrePace("soft", 0) + A.tyrePace("hard", 0) - 2 * A.tyrePace("medium", 0)) < 1e-9);
});

// verify-physics #14: tyrePace takes laps DONE, and c.lap counts line
// crossings (1 on the opening lap — TyreModel's lapsDone fixed the same
// off-by-one). Fed c.lap, the wear-off AI carried one lap of deg from the start.
test("game.js feeds tyrePace laps done (c.lap - 1), not the crossing count", () => {
  const game = readFileSync(join(ROOT, "js/game.js"), "utf8");
  assert.match(game, /AiDrive\.tyrePace\(c\.tyreClass, Math\.max\(0, c\.lap - 1\)\)/);
  assert.doesNotMatch(game, /AiDrive\.tyrePace\(c\.tyreClass, c\.lap\)/);
});

/* ── a straight is defendable ──────────────────────────────────────────────
 *
 * defendPull used to `return 0` whenever |kA| <= 0.004. kA is a lookahead
 * (game.js samples it 0.7 s / 18-70 m ahead), so that is "no corner soon" —
 * i.e. a straight, which is precisely where a slipstream pass gets set up. The
 * guard was there because the cover side came from -Math.sign(kA), and on a
 * straight that is not a direction. The fix supplies the other direction a
 * straight has: the side the attacker is lining up on.
 *
 * The tell that this was a defect rather than a choice is in game.js beside
 * the call — "One defensive move per straight (AiDrive.defendOnce); the side
 * resets in the braking zone" — a limiter that could never limit anything,
 * because no move could ever be made on a straight.
 */
const onStraight = {
  traits: ace, speed: 62, chaser: true, chaserGap: 6, chaserSpeed: 66,
  kA: 0, roomL: 3.0, roomR: 3.0, street: false, x: 0,
};

test("on a straight the AI covers the side the attacker is lining up on", () => {
  const fromRight = A.defendPull({ ...onStraight, other: { x: 1.4 } });
  const fromLeft  = A.defendPull({ ...onStraight, other: { x: -1.4 } });
  assert.ok(fromRight > 0, `attacker on the right (+x) is covered right, got ${fromRight}`);
  assert.ok(fromLeft < 0, `attacker on the left is covered left, got ${fromLeft}`);
  assert.ok(Math.abs(fromRight - -fromLeft) < 1e-9, "and symmetrically");
});

test("dead behind is not a move to cover — hold the line", () => {
  assert.equal(A.defendPull({ ...onStraight, other: { x: 0 } }), 0);
  assert.equal(A.defendPull({ ...onStraight, other: { x: 0.2 } }), 0,
    "still within the same tyre tracks");
  assert.ok(A.defendPull({ ...onStraight, other: { x: 0.5 } }) > 0,
    "committed to a side => cover it");
});

test("a straight cover is a lane move, not a corner chop", () => {
  const straightPull = Math.abs(A.defendPull({ ...onStraight, other: { x: 1.4 } }));
  const cornerPull = Math.abs(A.defendPull({
    ...onStraight, kA: 0.01, other: { x: 1.4 },
  }));
  assert.ok(straightPull > 0 && cornerPull > 0);
  assert.ok(straightPull < cornerPull,
    `straight cover ${straightPull} must stay under the corner cover ${cornerPull}`);
});

test("the straight branch respects the gates the corner branch already had", () => {
  // too far back — in TIME: past the cover window (0.7 s at the most aware), not a flat 12 m
  assert.equal(A.defendPull({ ...onStraight, chaserGap: 0.72 * 62, other: { x: 1.4 } }), 0);
  // not actually closing
  assert.equal(A.defendPull({ ...onStraight, chaserSpeed: 55, other: { x: 1.4 } }), 0);
  // a blocker ahead means this car is not the one defending
  assert.equal(A.defendPull({ ...onStraight, blocker: {}, other: { x: 1.4 } }), 0);
  // no room that side on a street
  assert.equal(A.defendPull({ ...onStraight, street: true, roomR: 1.5, other: { x: 1.4 } }), 0);
});

// ── DEFENDING (2026-10-01) ───────────────────────────────────────────────────
test("mid-train: a car defends when the attack behind is nearer than the car ahead", () => {
  const near = { ...onStraight, chaserGap: 6, other: { x: 1.4 } };
  assert.ok(A.defendPull({ ...near, blocker: {}, blockerGap: 20 }) > 0, "attacker 6 m back, car ahead 20 m: cover");
  assert.equal(A.defendPull({ ...near, blocker: {}, blockerGap: 5 }), 0, "the car ahead is the nearer business");
});

test("dead behind, the cover goes to the inside of the next corner it will attack into", () => {
  const behind = { ...onStraight, other: { x: 0 } };
  assert.equal(A.defendPull({ ...behind, kTurn: 0.01, toTurnIn: 400 }), 0, "the corner is far: hold the line");
  assert.ok(A.defendPull({ ...behind, kTurn: 0.01, toTurnIn: 90 }) < 0, "left-hander near: cover the inside (-x)");
  assert.ok(A.defendPull({ ...behind, kTurn: -0.01, toTurnIn: 90 }) > 0, "right-hander near: cover +x");
});

test("the cover leaves a car's width at the road edge", () => {
  const p = A.defendPull({ ...onStraight, kA: 0.01, other: { x: 1.4 }, roadL: 2.9 });
  assert.ok(p < 0 && -p <= 0.4 + 1e-9, `cover ${p} must stop 2.5 m from the edge`);
  assert.equal(A.defendPull({ ...onStraight, kA: 0.01, other: { x: 1.4 }, roadL: 2.0 }), -0, "no room for a car: no move");
});

/* THE HUMAN-YIELD GRACE.
 *
 * sideYieldsA elects exactly ONE car of an alongside pair to concede, and only
 * the elected car backs off (the rubClamp in js/game.js). Between two AI cars
 * that resolves, because both run the rule. A human runs no yield logic at all
 * — and must not, since the arc may not reach the driver — so when the rule
 * elects the player the pair has NO yielder: the AI keeps aiming at the racing
 * line through a car that was never going to move.
 *
 * Measured before the fix (monza, 240 s, scripted player holding the line at
 * racing pace): of 276 frames alongside inside the clear gap, the rule elected
 * the HUMAN 276 times and the AI zero, while AI-AI pairs resolved at
 * +0.169 m/s over 22,524 frames.
 *
 * js/physics/collide.js already encodes this principle at the CONTACT layer
 * ("with a HUMAN in the pair there is no planner to mirror"); the steering
 * layer had no equivalent. The grace is what keeps it from becoming a blanket
 * exemption, so these assertions are about its SHAPE, not just its existence.
 */
test("the human-yield grace is a real reaction window, not zero and not a lap", () => {
  const A = load();
  const g = A.humanYieldGrace();
  assert.equal(typeof g, "number");
  assert.ok(Number.isFinite(g) && g > 0,
    "a zero or non-finite grace makes the AI an instant pushover against a player");
  // Long enough to be a genuine side-by-side rather than an instant concession,
  // short enough that a lean cannot persist. A driver's reaction is ~0.25 s.
  assert.ok(g >= 0.15 && g <= 0.8, `grace ${g}s is outside the reaction-time band`);
});

test("the grace does not disturb who the rule elects between two AI cars", () => {
  const A = load();
  // The election rule itself is untouched — the grace acts only in game.js, and
  // only when the elected car is a human. Pin the three branches so a future
  // edit to sideYieldsA cannot quietly change AI-vs-AI racing.
  assert.equal(A.sideYieldsA(-5, 0, 0), true, "behind on arc yields");
  assert.equal(A.sideYieldsA(5, 0, 0), false, "ahead on arc does not");
  assert.equal(A.sideYieldsA(0, 3, 1), true, "level: the outer car concedes");
  assert.equal(A.sideYieldsA(0, 1, 3), false, "level: the inner car holds");
});

test("the grace arms only when it is OUR aim intruding, and only inside the band", () => {
  const A = load();
  const dt = 1 / 60, G = A.humanYieldGrace();
  // Not alongside at all -> nothing to concede, and the timer is cleared.
  assert.equal(A.humanYieldT(5, false, false, true, true, dt), 0);
  // Alongside another AI -> the normal election already covers it.
  assert.equal(A.humanYieldT(5, true, false, false, true, dt), 0);
  // The rule already elected US -> we are yielding on the normal path.
  assert.equal(A.humanYieldT(5, true, true, true, true, dt), 0);
  // THE REGRESSION collision-contact-vm caught. A player leaning on an AI that
  // is holding its own line is a RUB, not a free lane: with `intruding` false
  // the timer holds where it is and never reaches the grace on its own.
  assert.equal(A.humanYieldT(0, true, false, true, false, dt), 0,
    "a car that is not steering into anyone must not arm the takeover");
  // ...and the case the fix is for: alongside a human, not elected, our aim is
  // going through them. This is the only combination that accumulates.
  assert.ok(A.humanYieldT(0, true, false, true, true, dt) > 0);
  // It takes the whole grace, not one frame.
  let t = 0;
  for (let i = 0; i < Math.round(G / dt) - 2; i++) t = A.humanYieldT(t, true, false, true, true, dt);
  assert.equal(A.humanYieldTakes(t), false, `took the role after ${t}s, before the ${G}s grace`);
  for (let i = 0; i < 4; i++) t = A.humanYieldT(t, true, false, true, true, dt);
  assert.equal(A.humanYieldTakes(t), true, "never took the role at all");
});

test("the intrusion band leaves a settled pair settled", () => {
  const A = load();
  // The band is why a pair sitting AT the clean gap is not perpetually
  // re-arming: traced on the start straight, an AI that had already conceded
  // (x 1.19 -> 0.58, gap exactly on CLEAR) drifted 0.08 m back toward its line
  // and that read as a fresh intrusion. The band must be a real distance and
  // must stay under the gap it is measured inside.
  const band = A.humanYieldBand();
  assert.ok(band > 0.05 && band < A.minLatGap(5, false),
    `band ${band} must be a real margin inside the clear gap`);
});

// HOLDING IS NOT YIELDING (2026-10-01): a held line inside the band arms the
// timer too — at a quarter rate, so a player's lean is a contest (1.2 s) and
// not a free lane, but the pair is never left with nobody yielding.
test("a held line inside the band arms the human-yield timer at a quarter rate", () => {
  const A = load();
  const dt = 1 / 60, G = A.humanYieldGrace();
  // at the gap (not inside the band) and not intruding: settled, holds
  assert.equal(A.humanYieldT(0.1, true, false, true, false, dt, false), 0.1);
  // inside the band, holding: arms, slower than an intrusion
  const hold = A.humanYieldT(0, true, false, true, false, dt, true);
  const lean = A.humanYieldT(0, true, false, true, true, dt, true);
  assert.ok(hold > 0 && hold < lean, `hold ${hold} must arm, slower than an intrusion ${lean}`);
  let t = 0, n = 0;
  while (!A.humanYieldTakes(t) && n < 600) { t = A.humanYieldT(t, true, false, true, false, dt, true); n++; }
  assert.ok(n * dt > 3 * G && n * dt < 2, `a held lean concedes after ${(n * dt).toFixed(2)} s`);
});

// A HUMAN'S PACE (AiDrive.paceSample): AI cars in free air teach speed/vmax per
// node; a human is judged by its own speed/vmax against that — not by the
// live speed a corner gives it.
test("paceSample: the field teaches the profile, a human is judged against it", () => {
  const A = load();
  const ref = new Float32Array(4), dt = 1 / 60;
  const ai = { speed: 40, human: false };
  A.paceSample(ref, 1, ai, 80, true, dt);
  assert.ok(Math.abs(ref[1] - 0.5) < 1e-6, "the first sample seeds the node");
  A.paceSample(ref, 1, { speed: 60, human: false }, 80, false, dt);
  assert.ok(Math.abs(ref[1] - 0.5) < 1e-6, "a car in traffic does not teach");
  // a human as quick as the field at this metre: paceF stays 1; 10 % slower: falls toward 0.9
  const same = { speed: 40, human: true }, slow = { speed: 36, human: true };
  for (let i = 0; i < 60 * 30; i++) { A.paceSample(ref, 1, same, 80, true, dt); A.paceSample(ref, 1, slow, 80, true, dt); }
  assert.ok(Math.abs(same.paceF - 1) < 0.01, `same pace read as ${same.paceF}`);
  assert.ok(Math.abs(slow.paceF - 0.9) < 0.01, `10 % slow read as ${slow.paceF}`);
  // an unlearned node never moves a human's estimate
  const fresh = { speed: 10, human: true };
  A.paceSample(ref, 3, fresh, 80, true, dt);
  assert.equal(fresh.paceF, undefined);
});

// ── TACTICAL PASSING (2026-10-01) ────────────────────────────────────────────
test("repassLock: twice the cooldown for an equal car, shorter with a pace edge, never under 30 %", () => {
  const base = A.repassLock(mid, 0);
  assert.ok(Math.abs(base - 2 * A.passCooldown(mid)) < 1e-9);
  assert.ok(A.repassLock(mid, 0.03) < base && A.repassLock(mid, 0.03) > A.repassLock(mid, 0.06));
  assert.ok(Math.abs(A.repassLock(mid, 0.5) - 0.3 * base) < 1e-9, "floored");
  assert.equal(A.repassLock(mid, -0.05), base, "a slower car gets the full lockout");
});

test("attemptRoll: deterministic, uniform-ish, and a fresh roll per zone and lap", () => {
  assert.equal(A.attemptRoll(12345, 2, 800), A.attemptRoll(12345, 2, 800));
  assert.notEqual(A.attemptRoll(12345, 2, 800), A.attemptRoll(12345, 2, 1600));
  assert.notEqual(A.attemptRoll(12345, 2, 800), A.attemptRoll(12345, 3, 800));
  let sum = 0, lo = 0, n = 2000;
  for (let i = 0; i < n; i++) { const r = A.attemptRoll(987654321, i % 7, i * 37); assert.ok(r >= 0 && r < 1); sum += r; if (r < 0.25) lo++; }
  assert.ok(Math.abs(sum / n - 0.5) < 0.03, `mean ${sum / n}`);
  assert.ok(Math.abs(lo / n - 0.25) < 0.04, `lower quartile share ${lo / n}`);
  // a car is no longer timid in EVERY attempt: some zones roll high, some low
  const rolls = Array.from({ length: 20 }, (_, z) => A.attemptRoll(42, 1, z * 300));
  assert.ok(Math.min(...rolls) < 0.3 && Math.max(...rolls) > 0.7);
});

test("get a run: hang back through the corner onto a passing straight, pull out late", () => {
  assert.ok(A.runExtra(0.02, 0.6, true) > 0, "in the corner before a good zone, wanting the move");
  assert.equal(A.runExtra(0.02, 0.6, false), 0, "not wanting the move");
  assert.equal(A.runExtra(0.001, 0.6, true), 0, "already on the straight");
  assert.equal(A.runExtra(0.02, 0.2, true), 0, "a poor zone is not worth a run");
  assert.equal(A.runExtra(0.02, 0.6, true, true), 0, "never on a street");
  assert.equal(A.latchLate({ traits: mid, toTurnIn: 400, kAhead: 0, vTop: 72, speed: 70, blockerSpeed: 70, blockerGap: 20, street: true }), true, "a street latches as before");
  const st = { traits: mid, toTurnIn: 400, kAhead: 0, vTop: 72, speed: 70, blockerSpeed: 70, blockerGap: 20, queueT: 0 };
  assert.equal(A.latchLate(st), false, "far down a straight with no closing rate: wait");
  assert.equal(A.latchLate({ ...st, speed: 72 }), true, "closing in the tow: go");
  assert.equal(A.latchLate({ ...st, blockerGap: 10 }), true, "on the gearbox (the tight gap): go");
  assert.equal(A.latchLate({ ...st, toTurnIn: 120 }), true, "the braking zone is near: as before");
  assert.equal(A.latchLate({ ...st, kAhead: 0.01 }), true, "not a straight: as before");
  assert.equal(A.latchLate({ ...st, queueT: 60 }), true, "held for its whole patience: go");
  assert.equal(A.latchLate({ ...st, blockerGap: 6 + 0.08 * 70 - 0.1 }), true, "the tight gap in the tow");
  assert.equal(A.cornerK(0.0003, 0.012, 0.009), 0.012, "the corner, not its entry spiral");
  assert.equal(A.cornerK(-0.001, 0.0005, -0.02), -0.02);
});

test("sideYieldsA: level, the car on the OUTSIDE of the next corner concedes (kTurn)", () => {
  // +k = LEFT turn: inside is -x, outside +x
  assert.equal(A.sideYieldsA(0, 1, -1, 0.01), true, "right of the other car into a left-hander: outside");
  assert.equal(A.sideYieldsA(0, -1, 1, 0.01), false);
  assert.equal(A.sideYieldsA(0, 1, -1, -0.01), false, "into a right-hander the right car is inside");
  // behind / ahead are untouched by the corner, and no kTurn is the old rule
  assert.equal(A.sideYieldsA(-5, -1, 1, 0.01), true);
  assert.equal(A.sideYieldsA(5, 1, -1, 0.01), false);
  assert.equal(A.sideYieldsA(0, 3, 1), true);
  assert.equal(A.sideYieldsA(0, 3, 1, 0.001), true, "a straight is no corner");
});

test("commit or yield is a couple of seconds and a small lift", () => {
  assert.ok(A.sbsCommitT() >= 1.5 && A.sbsCommitT() <= 3);
  assert.ok(A.sbsEase() > 0.9 && A.sbsEase() < 1);
});

test("otSide breaks a tie toward the inside of the corner the pass is for", () => {
  const tie = { roomL: 3, roomR: 3, kAhead: 0, lane: 0.3 };
  assert.equal(A.otSide({ ...tie, kTurn: 0.01 }), -1);
  assert.equal(A.otSide({ ...tie, kTurn: -0.01 }), 1);
  assert.equal(A.otSide({ ...tie, kTurn: 0 }), 1, "no corner: the car's own lane, as before");
});

// --- difficulty's second dimension -----------------------------------------
// Until 2026-09-15 difficulty was ONE number: every level braked, defended,
// deployed and erred identically and differed only in top speed. `corner`
// scales the corner-speed target, so an easier field drives further from the
// limit rather than merely slower down the straight.
test("a lower difficulty corner factor lowers the brake target, and 1 is the default", () => {
  const samples = [{ d: 50, k: 0.018, bank: 0 }];
  const base = { traits: mid, samples, latMax: 22, brake: 22, grip: 1 };
  const full = A.brakeTarget(base);
  assert.equal(A.brakeTarget({ ...base, diffCorner: 1 }), full, "1 is a no-op");
  const easy = A.brakeTarget({ ...base, diffCorner: 0.93 });
  assert.ok(easy < full, `easy ${easy} corners below hard ${full}`);
  // The corner term must scale the CORNER speed, not the whole entry budget:
  // the entry limit is sqrt(vC² + 2·brake·0.85·d), so a 7% cut in vC moves the
  // limit by less than 7%.
  assert.ok(full - easy < full * 0.07, "the braking budget is not scaled with it");
});

test("queueBrake: a small closing rate INSIDE the follow distance gets a light brake", () => {
  // +1.5 m/s at 8 m with a 6 m follow: outside the follow distance, absorbable.
  assert.equal(A.queueBrake(41.5, 40, false, 8, 6, 22), 0);
  // the same excess at 5 m — inside it, closing on the tail — is braked for,
  // lightly, and harder the deeper inside we are.
  const at5 = A.queueBrake(41.5, 40, false, 5, 6, 22), at3 = A.queueBrake(41.5, 40, false, 3, 6, 22);
  assert.ok(at5 > 0 && at5 <= 0.6, `light brake at 5 m: ${at5}`);
  assert.ok(at3 > at5, `deeper inside brakes harder: ${at3} vs ${at5}`);
  // not closing: no brake, however close
  assert.equal(A.queueBrake(40, 40, false, 3, 6, 22), 0);
  // a real closing rate still gets the full brake the creep gate gives
  assert.equal(A.queueBrake(50, 40, false, 5, 6, 22), 1);
});

// --- the aim, not the contact ----------------------------------------------
// aimIntrudes(desiredX, x, otherX, clear): true only when the AIM is inside the
// other car's clear gap AND on the other car's side of where we are — steering
// into them, as opposed to holding our line while they come to us.
test("aimIntrudes: an aim into the other car's gap, on their side of us, intrudes", () => {
  const CLEAR = 2.8;
  // other car a lane to our LEFT (x −1), we sit at +1.5
  assert.equal(A.aimIntrudes(0.5, 1.5, -1, CLEAR), true, "aiming left, into the gap");
  assert.equal(A.aimIntrudes(1.5, 1.5, -1, CLEAR), false, "holding our line is their move, not ours");
  assert.equal(A.aimIntrudes(2.5, 1.5, -1, CLEAR), false, "aiming away never intrudes");
  assert.equal(A.aimIntrudes(-3.9, 1.5, -1, CLEAR), false, "an aim clear on the far side is not inside the gap");
  assert.equal(A.aimIntrudes(0.5, 1.5, -5, CLEAR), false, "a car two lanes over: the aim is clear of it");
  // mirror: other car to our RIGHT
  assert.equal(A.aimIntrudes(-0.5, -1.5, 1, CLEAR), true);
  assert.equal(A.aimIntrudes(-2.5, -1.5, 1, CLEAR), false);
  // already inside the gap: still only an aim TOWARD them intrudes
  assert.equal(A.aimIntrudes(0.2, 0.5, -1, CLEAR), true, "inside the gap and still closing");
  assert.equal(A.aimIntrudes(0.9, 0.5, -1, CLEAR), false, "inside the gap but opening it");
});

test("queue pressure: time held behind one car lowers the pass bar, craft spends patience faster", () => {
  // queueTime counts up while held, decays at twice the rate when free, never below 0.
  assert.equal(A.queueTime(0, true, 0.5), 0.5);
  assert.equal(A.queueTime(1, false, 0.25), 0.5);
  assert.equal(A.queueTime(0.1, false, 1), 0);
  assert.ok(A.queuePatience({ craft: 1 }) < A.queuePatience({ craft: 0.2 }), "a racer tries sooner than a rookie");
  assert.equal(A.queuePress({ traits: mid, queueT: 0 }), 0);
  assert.equal(A.queuePress({ traits: mid, queueT: 60 }), 1);
  // THE TRAIN: two equal cars, the follower in the tow (+4.5 %). Fresh, the 7 %
  // margin refuses it; after the patience window, it wants the pass.
  const tow = { street: false, speed: 60, blockerSpeed: 60, vTop: 72, freeSpeed: 66 * 1.045, blockerVmax: 66, traits: mid };
  assert.equal(A.otWant({ ...tow, queueT: 0 }), false, "not the moment a car arrives behind another");
  assert.equal(A.otWant({ ...tow, queueT: A.queuePatience(mid) }), true, "held long enough: the tow is enough");
  // Equal pace alone still refuses (the 30 % margin floor) — but with a CLEAR
  // side open, full pressure takes the move so packs can split without tow.
  assert.equal(A.otWant({ ...tow, freeSpeed: 66, queueT: 60, roomL: 1, roomR: 1 }), false,
    "equal pace, no room: still no pass");
  assert.equal(A.otWant({ ...tow, freeSpeed: 66, queueT: 60, roomL: 1, roomR: 4 }), true,
    "full pressure + clear side: equal pace splits the train");
  assert.equal(A.otWant({ ...tow, freeSpeed: 65, speed: 55, queueT: 60, roomL: 1, roomR: 4 }), false,
    "slower free pace with no closing still refuses");
  // attackOK: a queued car shows no closing rate; pressure stands in for it on a straight.
  const st = { traits: mid, speed: 40, blockerSpeed: 40, roll: 0.5, kAhead: 0, toTurnIn: 1e9, attackQ: 0 };
  assert.equal(A.attackOK({ ...st, queueT: 0 }), false);
  assert.equal(A.attackOK({ ...st, queueT: 60 }), true);
  assert.equal(A.attackOK({ ...st, queueT: 60, kAhead: 0.02 }), false, "never mid-corner on pressure alone");
});

test("the AI's lateral envelope carries the car's downforce, and the yaw budget does not", () => {
  // Rising with speed like the player's aeroGrip (1 + 0.65 (v/vTop)^2).
  assert.equal(A.lateralScale(0, 0.5, 1, 1, 72), 1);
  assert.ok(Math.abs(A.lateralScale(72, 0.5, 1, 1, 72) - 1.65) < 1e-9);
  assert.ok(A.lateralScale(50, 0.5, 1, 1, 72) > A.lateralScale(30, 0.5, 1, 1, 72));
  // Yaw keeps the old calm taper: falling with speed, 0.72 at the top.
  assert.ok(Math.abs(A.yawScale(72, 0.5, 1, 1, 72) - 0.72) < 1e-9);
  assert.ok(A.yawScale(50, 0.5, 1, 1, 72) < A.yawScale(30, 0.5, 1, 1, 72));
  // A fast corner the old flat envelope took well under the top speed is now
  // flat out; a hairpin barely moves.
  assert.ok(A.cornerSpeed(0.004, 22, 1, 72) > 72 * 0.99);
  assert.ok(Math.abs(A.cornerSpeed(0.05, 22, 1, 72) / Math.sqrt(22 / 0.05) - 1) < 0.05);
});

test("passSideClosed: the lane closes only when the car can no longer REACH it", () => {
  // Still 2.4 m to go and only 1.5 m left: closed.
  assert.equal(A.passSideClosed(1.5, 2.4, 2), true);
  // Arrived in the pass lane beside the outside edge (0.1 m of road left): hold it.
  assert.equal(A.passSideClosed(0.1, 0, 2), false);
  assert.equal(A.passSideClosed(0.8, 0.5, 2), false);
  // A car that has moved INTO our path (room gone negative) closes it.
  assert.equal(A.passSideClosed(-0.3, 0, 2), true);
  // Never asks for more than a car width.
  assert.equal(A.passSideClosed(1.95, 5, 2), false);
});

test("passReach: no move that cannot be half alongside by the turn-in", () => {
  const b = { vTop: 72, speed: 60, blockerSpeed: 58, blockerGap: 8.4, freeSpeed: 61, blockerVmax: 60 };
  // 6 m to gain at 2 m/s closing = 3 s = 180 m at 60 m/s.
  assert.equal(A.passReach({ ...b, toTurnIn: 200 }), true);
  assert.equal(A.passReach({ ...b, toTurnIn: 60 }), false, "a lunge");
  assert.equal(A.passReach({ ...b, toTurnIn: 1e9 }), true, "no corner ahead");
  assert.equal(A.passReach({ ...b, blockerGap: 2, toTurnIn: 5 }), true, "already alongside");
  assert.equal(A.passReach({ ...b, blockerSpeed: 3, toTurnIn: 5 }), true, "a crawling car is an obstacle");
  // attackOK carries it: a prime zone is still no place for a hopeless lunge.
  const z = { traits: { craft: 0.75 }, speed: 46, blockerSpeed: 40, roll: 0.5, kAhead: 0, attackQ: 0.9, vTop: 72 };
  assert.equal(A.attackOK({ ...z, toTurnIn: 80, blockerGap: 8 }), true);
  assert.equal(A.attackOK({ ...z, toTurnIn: 20, blockerGap: 14 }), false);
});

// THE OVERTAKE "CAR AHEAD" SCAN (game.js updateCar) skips the modulo wrap for a
// pair farther apart than OT_GAP·speed + 1 m — the traffic scan's cheap reject.
// A car past that window can never arm OVERTAKE, and `ahead` is read only once
// armed, so the pre-reject must leave every armed outcome — armed or not, WHICH
// car, and the exact gap — identical to the unfiltered scan. Randomised fields
// with wrap-around, lapped (2L) cars, finished cars, NaN progress and speeds
// from reversing to 95 m/s; the scan is lifted out of game.js, not copied.
test("the overtake car-ahead pre-reject is result-identical to the full wrap scan", () => {
  const ctx = vm.createContext({
    Math, Number, Object, WeakMap, console,
    Log: { info() {}, enabled() { return false; } },
    IncidentSim: { owns: () => false, notifyCar() {} },
    DebrisWorld: { active: () => false },
    Tracks: { wallAt: () => 100 },
  });
  for (const path of ["js/core/mat4.js", "js/physics/ai-drive.js", "js/physics/contact-geometry.js", "js/physics/collide.js"]) {
    vm.runInContext(readFileSync(join(ROOT, path), "utf8"), ctx, { filename: path });
  }
  const Collide = vm.runInContext("Collide", ctx);
  const pits = { inLane: (o) => !!o.inLane };
  const skip = (o) => pits.inLane(o);
  const ref = (c, ranked, track) => {
    let ahead = null, gapAhead = Infinity;
    for (const o of ranked) {
      if (o === c || o.finished || o.retired || pits.inLane(o)) continue;
      const d = ((o.prog - c.prog + track.total / 2) % track.total + track.total) % track.total - track.total / 2;
      if (d > 0.5 && d < gapAhead) { ahead = o; gapAhead = d; }
    }
    gapAhead = ahead && c.speed > 1 ? gapAhead / c.speed : Infinity;
    return { ahead, gapAhead };
  };
  let seed = 7;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const OT_GAP = 1.0;
  let armed = 0, rejected = 0;
  for (let trial = 0; trial < 4000; trial++) {
    const track = { total: 3000 + rnd() * 4000 };
    const L = track.total, n = 2 + Math.floor(rnd() * 21);
    const cluster = rnd() * L;
    const cars = Array.from({ length: n }, () => {
      const r = rnd();
      const prog = r < 0.02 ? NaN
        : (r < 0.5 ? cluster + (rnd() - 0.5) * 300 : rnd() * L) + Math.floor(rnd() * 3) * L;
      return { prog, _snapProg: prog, finished: rnd() < 0.05, retired: rnd() < 0.03, inLane: rnd() < 0.05, speed: [-3, 0, 1, 1.5][Math.floor(rnd() * 8)] ?? rnd() * 95 };
    });
    Collide.fillArcBuckets(cars, L, 34, (car) => car._snapProg);
    for (const c of cars) {
      const want = ref(c, cars, track);
      const otW = OT_GAP * c.speed + 1;
      const raw = Collide.scanOtAhead(c, L, otW, skip);
      const got = { ahead: raw.ahead, gapAhead: raw.ahead && c.speed > 1 ? raw.gapAhead / c.speed : Infinity };
      const wantArmed = want.gapAhead < OT_GAP, gotArmed = got.gapAhead < OT_GAP;
      assert.equal(gotArmed, wantArmed, `trial ${trial}: armed differs`);
      if (wantArmed) {
        armed++;
        assert.equal(got.ahead, want.ahead, `trial ${trial}: a different car ahead`);
        assert.equal(Object.is(got.gapAhead, want.gapAhead), true, `trial ${trial}: gap ${got.gapAhead} vs ${want.gapAhead}`);
      } else if (want.ahead && !got.ahead) rejected++;
    }
  }
  assert.ok(armed > 500 && rejected > 500, `the field exercised both sides (armed ${armed}, rejected ${rejected})`);
});

/* MIRRORS. The traffic scan used to stop at a flat 13 m behind, which at 60 m/s is
 * 0.2 s: the attacker was on the gearbox before the defender knew it was there, and
 * the two rules written in TIME (holdLineGap, a second behind; the pressure timer,
 * 0.6 s) could never see past it. The reach and the cover window are times now, and
 * awareness is how far back a driver looks. */
test("mirrorReach is a time behind scaled by awareness, floored at the old 13 m and capped", () => {
  const dull = { ...mid, awareness: 0 }, sharp = { ...mid, awareness: 1 };
  assert.ok(Math.abs(A.mirrorReach(sharp, 60) - 60 * 1.05) < 1e-9, "a sharp driver watches a second back");
  assert.ok(Math.abs(A.mirrorReach(dull, 60) - 60 * 0.6) < 1e-9, "a dull one about 0.6 s");
  assert.ok(A.mirrorReach(ace, 60) > A.mirrorReach(mid, 60), "awareness is the reach");
  assert.equal(A.mirrorReach(mid, 5), 13, "never shorter than the old flat window, even crawling");
  assert.equal(A.mirrorReach(sharp, 200), 72, "and capped: a long scan is paid per car per frame");
  assert.ok(A.mirrorReach(mid, 60) >= A.holdLineGap(60) * 0.8, "the scan now reaches most of holdLineGap's second");
});

test("the cover starts a time behind, grows as the attacker closes, and awareness widens it", () => {
  const at = (gap, traits = ace) => Math.abs(A.defendPull({ ...onStraight, traits, chaserGap: gap, other: { x: 1.4 } }));
  const v = onStraight.speed;
  // 0.4 s back at 62 m/s = 25 m: covered now (the flat 12 m gate said nothing until 0.19 s)
  assert.ok(at(0.4 * v) > 0, "0.4 s back is inside an aware driver's window");
  assert.ok(at(0.1 * v) > at(0.4 * v), "the cover grows as the attacker closes");
  assert.equal(at(0.5 * v, { ...ace, awareness: 0 }), 0, "a dull driver's window is shorter");
  assert.ok(at(0.5 * v, { ...ace, awareness: 1 }) > 0, "a sharp one's reaches it");
  assert.ok(Math.abs(A.defendWindowT({ awareness: 0 }) - 0.35) < 1e-9 && Math.abs(A.defendWindowT({ awareness: 1 }) - 0.7) < 1e-9);
});

/* LET PASS IS A BLUE FLAG. The move-aside used to wave ANY quicker car through after a
 * few seconds on the gearbox, so a same-lap rival (the player included) was handed the
 * place instead of having to take it. Only a car LAPPING us is waved through now. */
test("letPassCase: a lapping car closing on the gearbox is waved through; a same-lap rival never is", () => {
  const on = (o = {}) => A.letPassCase(o.racing ?? true, o.blocker ?? null, "chaser" in o ? o.chaser : {}, o.gap ?? 6,
    o.vC ?? 60, o.v ?? 55, o.vs ?? 1, o.lapping ?? true);
  assert.equal(on(), true, "lapping, 6 m back, 5 m/s quicker: blue flag");
  assert.equal(on({ lapping: false }), false, "the same car on the SAME lap is raced, not waved through");
  assert.equal(on({ gap: 12 }), false, "not yet on the gearbox");
  assert.equal(on({ vC: 57 }), false, "not closing fast enough (under 2.5 m/s at pace 5)");
  assert.equal(on({ vC: 57, vs: 0.5 }), true, "the closing band rides the pace scale");
  assert.equal(on({ blocker: {} }), false, "a car ahead of US is holding it up anyway");
  assert.equal(on({ racing: false }), false, "only in the race");
  assert.equal(on({ chaser: null }), false);
  const game = readFileSync(new URL("../../js/game.js", import.meta.url), "utf8");
  assert.match(game, /AiDrive\.letPassCase\([\s\S]{0,200}chaser\._snapProg - c\.prog > track\.total \* 0\.5\)/,
    "game.js asks the rule with LAPPING = a lap or more ahead in progress");
});

// The optimized controller shares grip only AFTER longitudinal speed and wake
// settle. Exercise the actual game block against the original steering equations,
// with exact comparisons and dependency counts: a source-shaped cache assertion
// alone would miss a changed heading, or stale grip on the fallback paths.
test("AI heading reuses current grip without changing normal or recovery steering", () => {
  const game = readFileSync(join(ROOT, "js/game.js"), "utf8");
  const decl = game.match(/\/\/ --- lateral ---\s*(let steer[^;]*;)/);
  const start = game.indexOf("    const err = desiredX - c.x;");
  const end = game.indexOf("  // Riding a kerb loses a little grip", start);
  assert.ok(decl && start > 0 && end > start, "the production controller is present");
  const constants = { window: {} };
  vm.runInNewContext(readFileSync(join(ROOT, "js/physics/consts.js"), "utf8"), constants);
  const K = { ...constants.window.PhysicsConsts };
  for (const name of ["AI_HEAD_VMIN", "AI_XTRACK_GAIN", "AI_HEAD_MAX", "AI_YAW_LAT", "AI_YAW_MAX"]) {
    const m = game.match(new RegExp("const " + name + " = ([^;]+);"));
    assert.ok(m, name); K[name] = Number(m[1]);
  }
  const clamp = (x, lo, hi) => x < lo ? lo : x > hi ? hi : x;
  const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
  const control = new Function("v", "deps", `
    const { c, desiredX, tanT, unstuckActive, rubClamp, dt, PACE, inputSteer } = v;
    const { AiDrive, gripMult, tyres, dirtyAirMul, aeroDfMult, clamp, damp, K, aiT } = deps;
    const { VMAX, LAT_MAX, STEER_VMAX, AI_HEAD_VMIN, AI_XTRACK_GAIN, AI_HEAD_MAX, AI_YAW_LAT, AI_YAW_MAX } = K;
    const vStd = speed => speed * VMAX / (VMAX * Math.max(PACE, 0.05));
    ${decl[1]}
    if (c.human) steer = inputSteer; else {
    ${game.slice(start, end)}
    return { steer, gripScale, latFac, aiHead: c.aiHead, steerSm: c.steerSm };
  `);
  let seed = 9271;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const modes = ["normal", "contact", "unstuck", "rub", "crawl", "stopped", "human"];
  for (let i = 0; i < 280; i++) {
    const mode = modes[i % modes.length], PACE = [0.05, 0.5, 1, 2][i % 4];
    const speed = (mode === "stopped" ? 0 : mode === "crawl" ? 3 : 12 + 90 * rnd()) * PACE * (i % 9 ? 1 : -1);
    const c = { human: mode === "human", x: rnd() * 8 - 4, speed, aeroLoad: rnd(),
      wake: i % 3 ? rnd() : 0, aiHead: rnd() * 0.6 - 0.3, steerSm: i % 4 ? rnd() - 0.5 : undefined,
      contactT: mode === "contact" ? 0.3 : 0, aeroX: i % 5 ? 0 : rnd() };
    const original = { ...c };
    const weatherGrip = [1, 0.72, 0.45][i % 3], tyreGrip = 0.4 + rnd() * 0.6;
    const air = (wake, velocity) => 1 - 0.2 * wake * Math.min(1, Math.abs(velocity) / (K.VMAX * Math.max(PACE, 0.05))) ** 2;
    const v = { c, PACE, dt: [1 / 120, 1 / 60, 1 / 30][i % 3], desiredX: rnd() * 10 - 5,
      tanT: rnd() * 0.2 - 0.1, unstuckActive: mode === "unstuck", rubClamp: mode === "rub", inputSteer: 0.23 };
    const calls = { weather: 0, tyre: 0, air: 0, lateral: 0, yaw: 0 };
    const deps = { K, clamp, damp, aiT: mid,
      AiDrive: { ...A,
        yawScale(...args) { calls.yaw++; return A.yawScale(...args); },
        lateralScale(...args) { calls.lateral++; return A.lateralScale(...args); } },
      gripMult() { calls.weather++; return weatherGrip; },
      tyres: { gripMul() { calls.tyre++; return tyreGrip; } },
      // X-mode's downforce cost reaches the AI's lateral envelope (verify-physics #11), never the yaw budget.
      aeroDfMult(car) { return 1 - 0.3 * (car.aeroX || 0); },
      dirtyAirMul(wake, velocity) { calls.air++; return air(wake, velocity); } };
    const got = control(v, deps);
    const grip = weatherGrip * tyreGrip * air(original.wake, original.speed);
    const lateral = A.lateralScale(speed, original.aeroLoad, grip, PACE, K.VMAX, 1 - 0.3 * (original.aeroX || 0));
    const vStd = speed * K.VMAX / (K.VMAX * Math.max(PACE, 0.05));
    const latFac = clamp(Math.abs(vStd) / 18, 0, 1), err = v.desiredX - original.x, vAbs = Math.abs(speed);
    let head = original.aiHead, sm = original.steerSm, steer = v.inputSteer;
    const recovery = mode !== "normal" && mode !== "human";
    if (!c.human && recovery) {
      const e = Math.abs(err) < 0.3 ? err * (Math.abs(err) / 0.3) : err;
      const want = clamp(e * 0.9, -1, 1);
      steer = sm = damp(sm === undefined ? want : sm, want, A.steerDamp(mid), v.dt);
      const vl = steer * K.STEER_VMAX * latFac;
      head = vAbs > 1 ? clamp(Math.asin(clamp(vl / vAbs, -1, 1)), -K.AI_HEAD_MAX, K.AI_HEAD_MAX) : 0;
    } else if (!c.human) {
      const want = clamp(Math.atan(v.tanT) + Math.atan(K.AI_XTRACK_GAIN * err / Math.max(vAbs, 1)), -K.AI_HEAD_MAX, K.AI_HEAD_MAX);
      const max = Math.min(K.AI_YAW_MAX, K.AI_YAW_LAT * K.LAT_MAX * A.yawScale(speed, original.aeroLoad, grip, PACE, K.VMAX) / vAbs);
      head = (head || 0) + clamp(want - (head || 0), -max * v.dt, max * v.dt);
      steer = sm = clamp(vAbs * Math.sin(head) / Math.max(K.STEER_VMAX * latFac * lateral, 1), -1, 1);
    }
    assert.deepEqual(got, { steer, gripScale: lateral, latFac, aiHead: head, steerSm: sm }, mode + " case " + i);
    assert.deepEqual(calls, { weather: 1, tyre: 1, air: 1, lateral: 1, yaw: mode === "normal" ? 1 : 0 },
      mode + ": one current grip calculation; yaw only for the normal AI controller");
  }
});

// ── PACE-SCALED CLOSING MARGINS (round-3 4-F5, BUGS M34) ─────────────────────
// PACE is a ground-speed scale, so a closing tolerance written as a bare m/s is
// a different fraction of the envelope at every OVERALL SPEED setting: at pace
// 0.469 (vTop 33.8 m/s) a 2 m/s "still closing" band is 6 % of top speed, at
// pace 1 it is 3 %. Each band is written on the pace-5 scale and rides
// vScale = vTop()/VMAX, the convention letPassCase and queueBrake use. At the
// reference pace 1.0 (notch 14) vScale is exactly 1 and the AI is bit-identical;
// the shipped default notch 11 (0.840) is one of the settings this corrects.
for (const p of [1, 0.469]) {
  const vTop = 72 * p, v = 62 * p;
  test(`wantBoost: catching/defending tolerances ride the pace scale (pace ${p})`, () => {
    // ace + 0.3 charge on a straight banks unless catching or defending, so the
    // answer IS the gate.
    const base = { traits: ace, energy: 0.3, kAhead60: 0.001, otActive: false, speed: v, vTop };
    assert.equal(A.wantBoost({ ...base, chaser: true, chaserGap: 8, chaserSpeed: v - 1.5 * p }), true,
      "a chaser 1.5 m/s (pace-5) slower is still a threat: defend");
    assert.equal(A.wantBoost({ ...base, chaser: true, chaserGap: 8, chaserSpeed: v - 2.5 * p }), false,
      "a chaser 2.5 m/s (pace-5) slower is falling back: bank");
    assert.equal(A.wantBoost({ ...base, towCar: true, towGap: 12, towSpeed: v + 0.5 * p }), true,
      "0.5 m/s (pace-5) slower than the tow car is still catching: deploy");
    assert.equal(A.wantBoost({ ...base, towCar: true, towGap: 12, towSpeed: v + 1.5 * p }), false,
      "1.5 m/s (pace-5) slower than the tow car is not catching: bank");
  });
  test(`defendPull: the not-closing gate rides the pace scale (pace ${p})`, () => {
    const c = { ...onStraight, speed: v, vTop, other: { x: 1.4 } };
    assert.ok(A.defendPull({ ...c, chaserSpeed: v - 2 * p }) > 0, "2 m/s (pace-5) slower, inside the window: cover");
    assert.equal(A.defendPull({ ...c, chaserSpeed: v - 4 * p }), 0, "4 m/s (pace-5) slower: not an attack");
  });
  test(`brakeTarget: the attacking late-brake gate rides the pace scale (pace ${p})`, () => {
    const ctx = { traits: ace, samples: [{ d: 50, k: 0.018, bank: 0 }], latMax: 22, brake: 22 * p, grip: 1,
      pace: p, vmax: 72, blocker: true, blockerGap: 8, speed: v, roomL: 3, roomR: 1 };
    const plain = A.brakeTarget({ ...ctx, blocker: false });
    assert.ok(A.brakeTarget({ ...ctx, blockerSpeed: v + 0.5 * p }) > plain, "0.5 m/s (pace-5) slower: attacking");
    assert.equal(A.brakeTarget({ ...ctx, blockerSpeed: v + 1.5 * p }), plain, "1.5 m/s (pace-5) slower: not attacking");
  });
}

test("game.js hands wantBoost and defendPull the pace envelope (vTop)", () => {
  const game = readFileSync(new URL("../../js/game.js", import.meta.url), "utf8");
  assert.match(game, /_aiBoost\.vTop = vTop\(\)/, "wantBoost's tolerances need vTop");
  assert.match(game, /_aiDefend\.vTop = vTop\(\)/, "defendPull's not-closing gate needs vTop");
  assert.match(game, /_aiBr\.pace = PACE; _aiBr\.vmax = VMAX/, "brakeTarget reads vScale from pace");
});
