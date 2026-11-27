/* drill-charge-vm.test.mjs — LEARN's Monza Charge-Sustaining Lap (js/learn-drills/charge.js, #6559 step 13, #6550 D2)
 * end to end in the real game VM, launched through __apex.drillLaunch (tests/helpers/charge-drill-vm.mjs). The drill
 * runs solo on one seed: two RETRY laps on the same plan score the same mean speed, lap and medal; a plan that borrows
 * earns no medal; the display-only ledger adds up to the measured change in the store; end() restores the player's
 * own plan. The tiers are pinned to the 27-plan VM rollout in tests/data/learn-drill-refs.json "charge" (regenerate:
 * node tests/helpers/charge-drill-vm.mjs --write).
 *
 * Run: node --test tests/unit/drill-charge-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { chargeDrill, deriveChargeTiers, PLANS, REFS } from "../helpers/charge-drill-vm.mjs";

const refs = JSON.parse(readFileSync(REFS, "utf8")).charge;
const at = (plan) => refs.runs.find(r => r.plan === plan.join("/"));
const PLAYER_PLAN = ["save", "deploy", "manual"];
let run;
before(async () => { run = await chargeDrill({ planBefore: PLAYER_PLAN }); });
after(() => run?.close());

test("learn-drill-refs.json: all 27 plans, and the tiers follow from them by the documented rule", () => {
  assert.deepEqual(refs.runs.map(r => r.plan), PLANS.map(p => p.join("/")));
  assert.deepEqual(refs.tiers, deriveChargeTiers(refs.runs));
  assert.ok(refs.tiers.bronze < refs.tiers.silver && refs.tiers.silver < refs.tiers.gold);
  assert.deepEqual({ ...vm.runInContext("ChargeDrill.MEDALS", run.g.ctx) }, refs.tiers, "the shipped medals are the VM tiers");
});

test("the lesson the stopwatch settles: spending the surplus is quicker, borrowing is quicker still and earns nothing", () => {
  const manual = at(["manual", "manual", "manual"]), all = at(["deploy", "deploy", "deploy"]);
  const best = refs.runs.filter(r => r.clean).reduce((a, r) => (r.kmh > a.kmh ? r : a));
  assert.ok(manual.clean && manual.netMJ > 0, "no BOOST at all sustains the store with surplus");
  assert.ok(best.lapS < manual.lapS, `best sustaining ${best.lapS} s vs all-MANUAL ${manual.lapS} s`);
  assert.ok(!all.clean && all.netMJ < 0 && all.lapS <= best.lapS, "DEPLOY everywhere borrows from the next lap");
  assert.ok(refs.runs.some(r => !r.clean) && refs.runs.some(r => r.clean));
});

test("the same plan scores the same: two RETRY laps on one boot, gold, saved under learnMedals.v1", () => {
  assert.deepEqual([...run.EnergyPlan.plan()], ["manual", "manual", "manual"], "stage() starts the drill on a neutral plan");
  const plan = ["manual", "deploy", "manual"];
  const warm = run.drive(plan);   // the boot's first lap can end a frame later (the #6559 B1 reset-leak class): not pinned
  assert.ok(warm, "the lap finished");
  assert.ok(run.retry(), "RETRY");
  const a = run.drive(plan);
  assert.ok(run.retry(), "RETRY");
  const b = run.drive(plan);
  assert.equal(a.clean, true, a.reason);
  assert.deepEqual([a.value, a.lapS, a.netMJ], [at(plan).kmh, at(plan).lapS, at(plan).netMJ]);
  assert.deepEqual([b.value, b.lapS, b.netMJ, b.medal, b.clean], [a.value, a.lapS, a.netMJ, a.medal, a.clean]);
  assert.deepEqual(b.metrics, a.metrics);
  assert.deepEqual(b.ledger, a.ledger);
  assert.equal(a.medal, "gold");
  assert.equal(b.attempt, 3);
  const row = JSON.parse(run.g.sandbox.localStorage.getItem("apex26.learnMedals.v1"))["charge|classic"];
  assert.equal(row.medal, "gold");
  assert.equal(row.n, 3);
});

test("the ledger adds up: deploy + brake + coast + part per sector sum to the measured change in the store", () => {
  assert.ok(run.retry());
  const r = run.drive(["deploy", "deploy", "deploy"]);
  const ES = vm.runInContext("PhysicsConsts.ES_MJ", run.g.ctx);
  const sum = r.ledger.reduce((a, row) => a + row.deploy + row.brake + row.coast + row.part, 0);
  assert.ok(Math.abs(sum * ES - r.netMJ) < 1e-3 + 1e-6, `ledger ${sum * ES} MJ vs net ${r.netMJ} MJ`);   // netMJ is rounded to 1e-3
  assert.ok(r.ledger.every(row => row.deploy < 0), "every sector deployed on an all-DEPLOY plan");
  assert.equal(r.clean, false);
  assert.equal(r.reason, "borrowed " + (-r.netMJ).toFixed(2) + " MJ");
  assert.equal(r.medal, null, "a lap that borrowed earns no medal (cleanRequired), however quick");
  assert.ok(r.value >= refs.tiers.gold - 1, "it was quick");
});

test("a plan chip on the live card cycles the sector's policy: MANUAL -> DEPLOY -> SAVE -> MANUAL", () => {
  const doc = run.g.sandbox.document, chip = doc.getElementById("learn-charge-s2");
  assert.ok(chip, "the card's S2 chip");
  run.EnergyPlan.setPlan(["manual", "manual", "manual"]);
  for (const want of ["deploy", "save", "manual"]) {
    chip.click();
    assert.equal(run.EnergyPlan.plan()[1], want);
  }
});

test("BACK TO LESSON: end() restores the player's own plan and session", () => {
  run.G.quitToMenu();
  assert.equal(run.G.state, "menu");
  assert.equal(run.host.active(), null);
  assert.deepEqual([...run.EnergyPlan.plan()], PLAYER_PLAN, "stage()'s undo put the player's plan back");
});

test("sample() and score() are read-only on the car (#6559 §1e rule 1)", () => {
  const C = vm.runInContext("ChargeDrill", run.g.ctx);
  const car = (o) => Object.freeze({ speed: 70, energy: 0.5, deploying: false, throttleDemand: 1, brakeDemand: 0, _secIdx: 0, prog: 100, boostOn: false, ...o });
  const acc = {};
  C.sample({ player: car({}), raceT: 1 }, acc);
  C.sample({ player: car({ energy: 0.45, deploying: true, prog: 170 }), raceT: 2 }, acc);   // a write to a frozen car would throw (strict mode)
  C.sample({ player: car({ energy: 0.47, brakeDemand: 0.8, _secIdx: 1, prog: 230 }), raceT: 3 }, acc);
  assert.ok(Math.abs(acc.L.sec[0].deploy + 0.05) < 1e-9 && Math.abs(acc.L.sec[1].brake - 0.02) < 1e-9);
  const r = C.score({ dashKph: v => v * 3.6 }, { clean: true, reason: "", seconds: 2 }, acc);
  assert.equal(r.clean, false, "the store fell: borrowed");
  assert.ok(r.metrics.length >= 2 && r.metrics.length <= 6);
  assert.deepEqual(["deploy", "brake", "coast", "part"].map(k => C.classOf(car(k === "deploy" ? { deploying: true } : k === "brake" ? { brakeDemand: 1 } : k === "coast" ? { throttleDemand: 0 } : {}))), ["deploy", "brake", "coast", "part"]);
});
