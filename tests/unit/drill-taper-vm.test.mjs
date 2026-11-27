/* drill-taper-vm.test.mjs — LEARN's Monza Taper Hunt (js/learn-drills/taper.js, #6559 step 6, #6550 D1) end to end in
 * the real game VM, through DrillRegistry's host (tests/helpers/taper-drill-vm.mjs). The drill runs solo: two runs on
 * one boot with the same BOOST press score the same speed bought, straight time and medal; a late press and no press
 * score lower; end() reopens the deployment lesson. The tiers are pinned to the 10 VM runs in
 * tests/data/learn-drill-refs.json "taper" (regenerate: node tests/helpers/taper-drill-vm.mjs --write).
 *
 * Run: node --test tests/unit/drill-taper-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { taperDrill, deriveTaperTiers, PRESS_AT, REFS } from "../helpers/taper-drill-vm.mjs";

const refs = JSON.parse(readFileSync(REFS, "utf8")).taper;
const at = (pressAt) => refs.runs.find(r => r.pressAt === pressAt);
let run;
before(async () => { run = await taperDrill(); });
after(() => run?.close());

test("learn-drill-refs.json: 10 clean runs, and the tiers follow from them by the documented rule", () => {
  assert.deepEqual(refs.runs.map(r => r.pressAt), PRESS_AT);
  assert.deepEqual(refs.tiers, deriveTaperTiers(refs.runs));
  assert.ok(refs.tiers.bronze < refs.tiers.silver && refs.tiers.silver < refs.tiers.gold);
  assert.deepEqual({ ...vm.runInContext("DrillRegistry.get('taper').medals", run.g.ctx) }, refs.tiers, "the shipped medals are the VM tiers");
});

test("the lesson the stopwatch settles: the run that bought the most speed is the fastest, a late press is slower", () => {
  const best = refs.runs.reduce((a, r) => (r.bought > a.bought ? r : a));
  assert.equal(best.seconds, Math.min(...refs.runs.map(r => r.seconds)), "the most speed bought is the best straight time");
  const late = at(PRESS_AT[PRESS_AT.length - 1]);
  assert.ok(late.seconds - best.seconds > 0, `late ${late.seconds} s vs best ${best.seconds} s`);
  // Part-load harvest tops the store up below half speed, so pressing at once is not the optimum either (the copy says so).
  assert.ok(at(0).seconds > best.seconds && at(0).bought < best.bought);
});

test("the same press scores the same: gold on the boot's first run and on two RETRY runs, saved under learnMedals.v1", () => {
  const press = 1.5;
  const first = run.drive(press);
  assert.ok(first, "the straight finished");
  assert.equal(first.clean, true, first.reason);
  assert.equal(first.value, at(press).bought);
  assert.equal(first.medal, "gold");
  // The boot's first run ends ONE frame (1/60 s) later than a RETRY run from the same visible state: hidden state
  // begin() does not set (the #6559 B1 reset-leak class). Named here, not widened: the speed bought is identical.
  assert.ok(Math.abs(first.straightS - at(press).seconds) <= 0.02, `first run ${first.straightS} s, refs ${at(press).seconds} s`);
  assert.ok(run.retry(), "RETRY");
  const a = run.drive(press);
  assert.ok(run.retry(), "RETRY");
  const b = run.drive(press);
  assert.equal(a.straightS, at(press).seconds);
  assert.deepEqual([b.value, b.straightS, b.medal, b.clean], [a.value, a.straightS, a.medal, a.clean]);
  assert.deepEqual(b.metrics, a.metrics);
  assert.equal(b.value, first.value);
  assert.equal(b.attempt, 3);
  const row = JSON.parse(run.g.sandbox.localStorage.getItem("apex26.learnMedals.v1"))["taper|classic"];
  assert.deepEqual(row, { best: a.value, medal: "gold", n: 3 });
});

test("a late press earns bronze; no press is not clean and earns nothing", () => {
  assert.ok(run.retry());
  const late = run.drive(4.5);
  assert.equal(late.value, at(4.5).bought);
  assert.equal(late.medal, "bronze");
  assert.ok(run.retry());
  const none = run.drive(null);
  assert.equal(none.value, 0);
  assert.equal(none.clean, false);
  assert.equal(none.reason, "store not spent");
  assert.equal(none.medal, null);
  assert.equal(run.G.store.get("learnMedals.v1", null)["taper|classic"].medal, "gold", "the saved best medal stays");
});

test("BACK TO LESSON: end() restores the session and reopens learn/deployment/ with the last result", () => {
  run.G.quitToMenu();
  assert.equal(run.G.state, "menu");
  assert.equal(run.host.end("quit"), true);
  assert.equal(run.reopened.length, 1);
  assert.equal(run.reopened[0].lesson, "deployment");
  assert.equal(run.reopened[0].payload.id, "taper");
  assert.equal(run.reopened[0].payload.result.unit, "km/h");
  assert.equal(run.host.active(), null);
});

test("sample() and score() are read-only on the car (#6559 §1e rule 1)", () => {
  const T = vm.runInContext("TaperDrill", run.g.ctx);
  const player = Object.freeze({ speed: 30, energy: 0.2, deploying: true, otT: 0, throttleDemand: 1, brakeDemand: 0 });
  const G = { player, raceT: 1, vTop: () => 72, dashKph: v => v * 3.6 };
  const acc = {};
  T.sample(G, acc);
  T.sample({ ...G, raceT: 1.5 }, acc);   // a write to the frozen car would throw in the drill's strict mode
  assert.ok(acc.pushS > 0);
  const r = T.score(G, { clean: true, reason: "", seconds: 9.9 }, acc);
  assert.equal(r.clean, false, "a store not run to empty is not clean");
  assert.ok(r.metrics.length >= 2 && r.metrics.length <= 6);
});
