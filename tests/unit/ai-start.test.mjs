import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ctx = vm.createContext({ Math, console, Object, Array, Number, isFinite });
for (const f of ["js/core/mat4.js", "js/physics/ai-start.js"])
  vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: absSrc(f) });
const A = vm.runInContext("AiStart", ctx);

test("AiStart is frozen and exposes the launch + start-calm policy", () => {
  assert.ok(Object.isFrozen(A));
  assert.deepEqual(Object.keys(A).sort(), ["LAUNCH_FADE", "START_ATTACK", "START_CALM", "START_GAP_T",
    "launchDone", "launchMul", "launchPlan", "startCalm", "startCalmS", "startGapT"]);
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
    assert.ok(p.react >= 0.05 && p.react <= 0.78, `react out of range: ${p.react}`);
    assert.ok(p.grip >= 0.69 && p.grip <= 1.08, `grip out of range: ${p.grip}`);
  }
  // Two different rolls are two different launches (the per-race hash matters).
  assert.notEqual(A.launchPlan(sharp, 0.2).react, A.launchPlan(sharp, 0.8).react);
  const reactEarly = A.launchPlan(sharp, 0.05).react;
  const reactLate = A.launchPlan(sharp, 0.95).react;
  assert.ok(reactLate - reactEarly > 0.2, `launch reaction spread must string the grid: ${reactLate - reactEarly}`);
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
  assert.equal(A.launchMul(3.5, plan), 1);
  assert.equal(A.launchMul(10, plan), 1);
  assert.equal(A.launchMul(0, null), 1, "no plan (a human, or before gridUp) is no effect");
  assert.equal(A.launchDone(3.49, plan), false);
  assert.equal(A.launchDone(3.51, plan), true);
  assert.equal(A.launchDone(0, null), true);
});

test("startCalm: full while launching, fades out by calmUntil, never for a car that did not launch", () => {
  assert.equal(A.startCalm(true, undefined, 1), 1);
  assert.equal(A.startCalm(false, 24, 5), 1, "well inside the window");
  const fade = A.startCalm(false, 24, 20);
  assert.ok(fade > 0 && fade < 1, `fading: ${fade}`);
  assert.equal(A.startCalm(false, 24, 24), 0, "and gone at calmUntil");
  assert.equal(A.startCalm(false, undefined, 3), 0, "placed at speed, no launch: no calm");
  assert.equal(A.startCalmS(), 24);
  assert.ok(A.startGapT(1) > 0.4 && A.startGapT(0) === 0);
  assert.equal(A.startGapT(1), 0.42, "lap-1 headway bump is pinned");
  assert.equal(A.startCalm(false, 32, 30), 0.2, "calm fades over 10 s, not a step");
  assert.equal(A.START_ATTACK, 0.45);
});
