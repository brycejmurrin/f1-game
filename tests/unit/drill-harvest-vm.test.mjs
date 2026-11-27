/* drill-harvest-vm.test.mjs — LEARN's Monza Harvest Stop (js/learn-drills/harvest.js, #6559 step 11, #6550 D3a) end to
 * end in the real game VM, through DrillRegistry's host (tests/helpers/harvest-drill-vm.mjs). The drill runs solo: two
 * RETRY runs on one boot with the same brake point score the same accuracy, metres and medal; a late brake earns less,
 * no brake fails; the store fills part way down the stop and the harvest is clipped from then on (shown, not scored);
 * the display-only brake split sums to the deceleration and gives the motor nothing at a full store; end() reopens the
 * brake-blend lesson. The tiers are pinned to the VM runs in tests/data/learn-drill-refs.json "harvest" (regenerate:
 * node tests/helpers/harvest-drill-vm.mjs --write).
 *
 * Run: node --test tests/unit/drill-harvest-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { harvestDrill, deriveHarvestTiers, SLIP, REFS } from "../helpers/harvest-drill-vm.mjs";

const refs = JSON.parse(readFileSync(REFS, "utf8")).harvest;
const at = (slip) => refs.runs.find(r => r.slip === slip);
let run;
before(async () => { run = await harvestDrill(); assert.ok(run.drive(null), "warm-up run"); });
after(() => run?.close());

test("learn-drill-refs.json: the best stop and its ±SLIP neighbours, all clean, and the tiers follow by the documented rule", () => {
  assert.deepEqual(refs.runs.map(r => r.slip), [-SLIP.bronze, -SLIP.silver, -SLIP.gold, 0, SLIP.gold, SLIP.silver, SLIP.bronze]);
  assert.ok(refs.runs.every(r => r.clean), "every calibration run is a clean stop");
  assert.ok(Math.abs(at(0).offM) < 1, `the best brake point stops on the marker (${at(0).offM} m)`);
  assert.deepEqual(refs.tiers, deriveHarvestTiers(refs.runs));
  assert.ok(refs.tiers.bronze < refs.tiers.silver && refs.tiers.silver < refs.tiers.gold && refs.tiers.gold < at(0).value);
  assert.deepEqual({ ...vm.runInContext("DrillRegistry.get('harvest').medals", run.g.ctx) }, refs.tiers, "the shipped medals are the VM tiers");
});

test("the same brake point scores the same: gold on two RETRY runs, saved under learnMedals.v1", () => {
  const frame = at(0).frame;
  assert.ok(run.retry(), "RETRY");
  const a = run.drive(frame);
  assert.ok(run.retry(), "RETRY");
  const b = run.drive(frame);
  assert.equal(a.clean, true, a.reason);
  assert.equal(a.value, at(0).value);
  assert.equal(a.offM, at(0).offM);
  assert.equal(a.medal, "gold");
  assert.deepEqual([b.value, b.offM, b.medal, b.clean], [a.value, a.offM, a.medal, a.clean]);
  assert.deepEqual(b.metrics, a.metrics);
  const row = JSON.parse(run.g.sandbox.localStorage.getItem("apex26.learnMedals.v1"))["harvest|classic"];
  assert.equal(row.medal, "gold");
  assert.equal(row.best, a.value);
});

test("the store fills part way down the stop: harvest then clips, shown on the card and never in the score", () => {
  assert.ok(run.retry());
  const r = run.drive(at(0).frame);
  const metric = (label) => r.metrics.find(m => m[0] === label)[1];
  const harvested = +metric("Harvested (Apex MJ)"), clipped = +metric("Clipped at a full store"), brakeS = +metric("Brake time");
  // From 0.85 the store can take 0.15 (0.60 Apex MJ) and no more: it filled, so the rest of the stop was clipped.
  assert.equal(harvested.toFixed(2), (0.15 * 4).toFixed(2));
  assert.ok(clipped > 0.2 && clipped < brakeS, `clipped ${clipped} s of a ${brakeS} s stop`);
  assert.ok(+metric("Motor share of braking") > 0 && +metric("Motor share of braking") < 50);
});

test("a late brake earns less, a much later one bronze; no brake overruns the marker and earns nothing", () => {
  assert.ok(run.retry());
  const late = run.drive(at(0).frame + SLIP.silver);
  assert.equal(late.value, at(SLIP.silver).value);
  assert.ok(late.offM > 0, "late is long");
  assert.equal(late.medal, "silver");
  assert.ok(run.retry());
  const later = run.drive(at(0).frame + SLIP.bronze);
  assert.equal(later.medal, "bronze");
  assert.ok(run.retry());
  const none = run.drive(null);
  assert.equal(none.clean, false);
  assert.equal(none.reason, "ran 100 m past the marker");
  assert.equal(none.value, 0);
  assert.equal(none.medal, null);
  assert.equal(run.G.store.get("learnMedals.v1", null)["harvest|classic"].medal, "gold", "the saved best medal stays");
});

test("HarvestDrill.brakeSplit is display-only arithmetic: motor + discs is the deceleration, the motor gets nothing at a full store", () => {
  const H = vm.runInContext("HarvestDrill", run.g.ctx), P = vm.runInContext("PaceMath", run.g.ctx);
  for (const [decel, vs, e] of [[30, 60, 0.5], [2, 60, 0.5], [30, 5, 0.2], [30, 60, 1], [0, 40, 0.3]]) {
    const { motor, friction } = H.brakeSplit(decel, vs, e);
    assert.equal(motor + friction, decel);
    assert.ok(motor >= 0 && motor <= H.REGEN_DECEL_CAP * P.regenSpeedAt(vs) + 1e-12);
    if (e >= 1) assert.equal(motor, 0);
  }
  assert.equal(H.brakeSplit(2, 60, 0.5).friction, 0, "a light stop is all motor below the cap");
});

test("BACK TO LESSON: end() restores the session and reopens learn/brake-blend/ with the last result", () => {
  run.G.quitToMenu();
  assert.equal(run.G.state, "menu");
  assert.equal(run.host.end("quit"), true);
  assert.equal(run.reopened.length, 1);
  assert.equal(run.reopened[0].lesson, "brake-blend");
  assert.equal(run.reopened[0].payload.id, "harvest");
  assert.equal(run.reopened[0].payload.result.unit, "%");
  assert.equal(run.host.active(), null);
});

test("sample() and score() are read-only on the car (#6559 §1e rule 1)", () => {
  const H = vm.runInContext("HarvestDrill", run.g.ctx);
  const player = Object.freeze({ speed: 50, s: 300, energy: 0.9, brakeDemand: 1, axEstSm: -35, throttleDemand: 0 });
  const G = { player, raceT: 1, vTop: () => 72, wrapS: s => s, track: { total: 5800 }, dashKph: v => v * 3.6 };
  const acc = {};
  H.sample(G, acc);
  H.sample({ ...G, raceT: 1.5 }, acc);   // a write to the frozen car would throw in the drill's strict mode
  assert.equal(acc.off, 300 - (H.START_M + H.MARK_M));
  const r = H.score(G, { clean: true, reason: "" }, acc);
  assert.ok(r.metrics.length >= 2 && r.metrics.length <= 6);
  assert.equal(r.value, 0, "50 m short scores 0 %");
});
