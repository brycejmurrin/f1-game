/* drill-torque-vm.test.mjs — LEARN's Monza Torque Fill Exit (js/learn-drills/torque.js, #6559 step 12, #6550 D3b) end to
 * end in the real game VM, through DrillRegistry's host (tests/helpers/torque-drill-vm.mjs). Solo: two runs on one boot
 * with the same BOOST press score the same gain, exit time and medal; BOOST shortens the run; no press earns nothing.
 * Tiers and base are pinned to tests/data/learn-drill-refs.json "torque" (regenerate: node tests/helpers/torque-drill-vm.mjs --write).
 *
 * Run: node --test tests/unit/drill-torque-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { torqueDrill, deriveTorqueTiers, PRESS_AT, REFS } from "../helpers/torque-drill-vm.mjs";

const refs = JSON.parse(readFileSync(REFS, "utf8")).torque;
const at = (pressAt) => refs.runs.find(r => r.pressAt === pressAt);
let run;
before(async () => { run = await torqueDrill(); });
after(() => run?.close());

test("learn-drill-refs.json: clean runs, the tiers follow from them, and the shipped drill carries them", () => {
  assert.deepEqual(refs.runs.map(r => r.pressAt), PRESS_AT);
  assert.deepEqual(refs.tiers, deriveTorqueTiers(refs.runs, refs.base));
  const T = vm.runInContext("TorqueDrill", run.g.ctx);
  assert.deepEqual({ ...T.MEDALS }, refs.tiers);
  assert.equal(T.NO_BOOST_S, refs.base);
  assert.ok(refs.runs.every(r => r.clean && r.seconds < refs.base), "every BOOST run beats the unboosted run");
});

test("the same press scores the same, twice on one boot: gold, deterministic, saved under learnMedals.v1", () => {
  const press = 0.5;
  assert.ok(run.drive(null), "warm-up run (the boot's first run ends a frame later, the #6559 B1 class)");
  assert.ok(run.retry());
  const a = run.drive(press);
  assert.ok(run.retry());
  const b = run.drive(press);
  assert.equal(a.straightS, at(press).seconds);
  assert.deepEqual([b.value, b.straightS, b.medal, b.clean], [a.value, a.straightS, a.medal, a.clean]);
  assert.deepEqual(b.metrics, a.metrics);
  assert.equal(a.clean, true, a.reason);
  assert.equal(a.medal, "gold");
  assert.equal(a.value, +(refs.base - at(press).seconds).toFixed(2));
  const row = JSON.parse(run.g.sandbox.localStorage.getItem("apex26.learnMedals.v1"))["torque|classic"];
  assert.equal(row.medal, "gold");
});

test("a late press earns less; no press earns nothing and the run is still timed", () => {
  assert.ok(run.retry());
  const late = run.drive(2.5);
  assert.ok(late.value < refs.tiers.gold && late.value > 0);
  assert.ok(run.retry());
  const none = run.drive(null);
  assert.equal(none.value, 0);
  assert.equal(none.medal, null);
  assert.equal(none.straightS, refs.base);
});

test("braking or lifting before the taper is not clean and earns no medal", () => {
  const go = (input, frames) => {
    assert.ok(run.retry());
    for (let i = 0; i < 60 * 30; i++) {
      run.g.apex.act(i < frames ? input : { throttle: true, brake: false, steer: 0 }, 1 / 60, 1);
      const r = run.host.tick();
      if (r) return r;
    }
    return null;
  };
  const braked = go({ throttle: false, brake: true, steer: 0 }, 12);
  assert.equal(braked.clean, false);
  assert.equal(braked.reason, "braked before the taper");
  assert.equal(braked.medal, null);
  const lifted = go({ throttle: false, brake: false, steer: 0 }, 30);
  assert.equal(lifted.clean, false);
  assert.equal(lifted.reason, "lifted before the taper");
});

test("sample() and score() are read-only on the car (#6559 §1e rule 1)", () => {
  const T = vm.runInContext("TorqueDrill", run.g.ctx);
  const player = Object.freeze({ speed: 30, energy: 0.2, deploying: true, throttleDemand: 1, brakeDemand: 0 });
  const G = { player, raceT: 1 };
  const acc = {};
  T.sample(G, acc);
  T.sample({ ...G, raceT: 1.5 }, acc);
  assert.equal(acc.depS, 0.5);
  const r = T.score(G, { clean: true, reason: "", seconds: 4 }, acc, 6);
  assert.equal(r.value, 2);
  assert.ok(r.metrics.length >= 2 && r.metrics.length <= 6);
});
