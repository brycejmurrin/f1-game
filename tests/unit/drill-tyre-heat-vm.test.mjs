/* drill-tyre-heat-vm.test.mjs — LEARN's Tyre Thermal Lab end to end in the real game VM (#6559 step 8, #6551 §1).
 * The drill launches through __apex.drillLaunch (game.js's own DrillRegistry host: the trimmed 2-car field, begin()
 * where game.js runs it), stages REAL tyre wear on a fresh MEDIUM set from the blankets, and a scripted driver runs it
 * solo. Pins: two runs at one pace on one boot give the SAME score and medal (deterministic); the score is the share
 * of the run with the surface in optTemp +- T_WINDOW; a weaving out-lap (load) reaches the window sooner and scores
 * higher; the medal tiers are the VM rollouts in tests/data/learn-drill-refs.json "tyre-heat" (regenerate with
 * node tests/helpers/tyre-heat-drill-vm.mjs --write); quitting restores the player's tyre wear level.
 *
 * Run: node --test tests/unit/drill-tyre-heat-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { thermalDrill, deriveThermalTiers, PACES, REFS } from "../helpers/tyre-heat-drill-vm.mjs";

const refs = JSON.parse(readFileSync(REFS, "utf8"))["tyre-heat"];
const ref = (pace) => refs.runs.find((r) => r.pace === pace);
let run;
before(async () => { run = await thermalDrill(); });
after(() => run?.close());

test("learn-drill-refs.json: the calibration runs, and the tiers follow from them by the documented rule", () => {
  assert.deepEqual(refs.runs.map((r) => r.pace), PACES);
  assert.deepEqual(refs.tiers, deriveThermalTiers(refs.runs));
  assert.ok(refs.tiers.bronze < refs.tiers.silver && refs.tiers.silver < refs.tiers.gold);
  // the lesson in the model: more pace is more load x speed, and more of the lap in the window
  const v = refs.runs.map((r) => r.inWindow);
  assert.ok(v.every((x, i) => i === 0 || x <= v[i - 1] + 1e-9), "slower runs never spend more of the lap in the window: " + v);
});

test("the drill stages its race: Monza, 2 cars, real tyre wear, a fresh medium out of the blankets", () => {
  const G = run.G, ev = (src) => vm.runInContext(src, run.g.ctx, { filename: "drill-tyre-heat-vm:ev" });
  assert.equal(run.wearBefore, "light");
  assert.equal(ev("Tracks.LIST[" + G.trackIdx + "].id"), "monza");
  assert.equal(G.cars.length, 2);
  assert.equal(G.raceTyreWear, "real");
  assert.equal(G.store.get("tyreWear", null), "light", "REAL is live only: a tab closed mid-drill keeps the saved option (#7346 row 7)");
  assert.equal(G.tyres.on(), true);
  assert.equal(G.player.tyre.id, "medium");
  assert.ok(G.player.tyreTs < 80 && G.player.tyreTb < 80, "a set out of the blankets: " + G.player.tyreTs + "/" + G.player.tyreTb);
  assert.equal(G.coach.practiceGoal(), "thermal");
  assert.deepEqual({ ...vm.runInContext("DrillRegistry.get('tyre-heat').medals", run.g.ctx) }, refs.tiers, "the shipped medals are the VM tiers");
});

test("two runs on one seed: the same score and medal; RETRY restores the cold set", () => {
  const a = run.drive(1);
  assert.ok(a, "the run reached the gate");
  assert.equal(a.clean, true, a.reason);
  assert.equal(a.unit, "%");
  assert.ok(Math.abs(a.value - ref(1).inWindow) < 0.05, `in window ${a.value} %, refs ${ref(1).inWindow} %`);
  assert.ok(run.retry(), "RETRY");
  assert.ok(run.G.player.tyreTs < 80, "the checkpoint put the cold set back: " + run.G.player.tyreTs);
  const b = run.drive(1);
  assert.ok(b);
  assert.equal(b.value, a.value);
  assert.equal(b.medal, a.medal);
  assert.equal(a.medal, a.value >= refs.tiers.silver ? "silver" : a.value >= refs.tiers.bronze ? "bronze" : null);
  assert.equal(b.attempt, a.attempt + 1);
  assert.equal(b.metrics.length, 6);
  assert.equal(b.metrics[0][1], b.value.toFixed(0), "the card's first row is the score");
  assert.ok(Number(b.metrics[1][1]) > 0, "the window was reached, in seconds: " + b.metrics[1][1]);
  assert.ok(b.series.surface.length > 60 && b.series.core.length === b.series.surface.length, "the card's 1 Hz chart");
  const row = run.G.store.get("learnMedals.v1", null)["tyre-heat|classic"];
  assert.equal(row.n, 2);
});

test("a weaving out-lap loads the tyre: the window comes sooner and the lap spends more of it there", () => {
  assert.ok(run.retry());
  const plain = run.drive(1);
  assert.ok(run.retry());
  const weave = run.drive(1, { amp: 1, hz: 1.5, s: 10 });
  assert.ok(plain && weave && weave.clean, weave && weave.reason);
  const reached = (r) => Number(r.metrics[1][1]);
  assert.ok(reached(weave) < reached(plain), `window at ${reached(weave)} s weaving vs ${reached(plain)} s`);
  assert.ok(weave.value > plain.value, `${weave.value} % weaving vs ${plain.value} %`);
  assert.equal(weave.medal, weave.value >= refs.tiers.gold ? "gold" : "silver");
});

test("quitting ends the drill, restores the player's tyre wear level", () => {
  const G = run.G;
  G.quitToMenu();
  assert.equal(G.state, "menu");
  assert.equal(G.drills().active(), null);
  assert.equal(G.raceTyreWear, "light", "stage()'s undo put the player's level back");
  assert.equal(G.store.get("tyreWear", null), "light", "the saved option never moved");
});
