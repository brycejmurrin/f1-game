/* drill-aero-medals-vm.test.mjs — LEARN's Monza Aero drill end to end in the real game VM (#7039, #6559 step 2).
 * The drill launches through DrillRegistry's host (tests/helpers/learn-drill-vm.mjs), drives two runs with RETRY
 * between them, scores each finish on metres closed, persists the medal under apex26.learnMedals.v1 (it survives a
 * store reload), and end() reopens the lesson with the result. The medal tiers are pinned to the 20 VM runs in
 * tests/data/learn-drill-refs.json (regenerate: node tests/helpers/learn-drill-vm.mjs --write).
 *
 * Run: node --test tests/unit/drill-aero-medals-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { aeroDrill, deriveAeroTiers, DUTIES, REFS } from "../helpers/learn-drill-vm.mjs";

const refs = JSON.parse(readFileSync(REFS, "utf8")).aero;
let run;
/** The VM stub DOM makes a fresh element for any id, so find the card the page holds (focus is a stub no-op there;
 *  tests/unit/drill-registry.test.mjs pins focus on RETRY in mini-dom). */
const card = () => run.g.sandbox.document.body.children.find(c => c.id === "drill-card") || null;
const button = (id) => card()?.children.find(c => c.id === "drill-card-actions")?.children.find(b => b.id === id);
before(async () => { run = await aeroDrill(); });
after(() => run?.close());

test("learn-drill-refs.json: 20 runs, and the tiers follow from them by the documented rule", () => {
  assert.deepEqual(refs.runs.map(r => r.duty), DUTIES);
  assert.deepEqual(refs.tiers, deriveAeroTiers(refs.runs));
  assert.ok(refs.tiers.bronze < refs.tiers.silver && refs.tiers.silver < refs.tiers.gold);
});

test("the Aero drill's shipped medals are the VM-derived tiers", () => {
  assert.deepEqual({ ...vm.runInContext("DrillRegistry.get('aero').medals", run.g.ctx) }, refs.tiers);
});

test("a flat-out run closes to the wake: gold, saved under learnMedals.v1, the card up", () => {
  const r = run.drive(1);
  assert.ok(r, "the slipstream run finished");
  assert.equal(r.clean, true, r.reason);
  assert.ok(Math.abs(r.value - refs.runs[0].closed) < 0.05, `closed ${r.value} m, refs ${refs.runs[0].closed} m`);
  assert.equal(r.medal, "gold");
  const { localStorage } = run.g.sandbox;
  assert.deepEqual(JSON.parse(localStorage.getItem("apex26.learnMedals.v1"))["aero|classic"], { best: +r.value.toFixed(2), medal: "gold", n: 1 });
  assert.ok(card(), "the card is in the page");
  assert.ok(button("drill-card-retry") && button("drill-card-back"));
  assert.equal(vm.runInContext("SaveSchemaRegistry.resolve('apex26.learnMedals.v1')?.owner", run.g.ctx), "js/learn-drills/drill-card.js");
});

test("RETRY runs again from the start; a lifted run keeps the saved gold, and the store survives a reload", () => {
  button("drill-card-retry").click();
  assert.equal(card(), null, "RETRY takes the card down");
  assert.equal(run.host.state().attempt, 1);
  const r = run.drive(0.5);
  assert.ok(r);
  assert.equal(r.clean, false);
  assert.ok(Math.abs(r.value - refs.runs[10].closed) < 0.05, `closed ${r.value} m, refs ${refs.runs[10].closed} m`);
  assert.equal(r.medal, null);
  assert.equal(r.attempt, 2);
  run.G.store._cache.clear();   // the next read goes to localStorage
  const row = run.G.store.get("learnMedals.v1", null)["aero|classic"];
  assert.equal(row.medal, "gold");
  assert.equal(row.n, 2);
  assert.ok(row.best > 15);
  assert.equal(run.G.store.get("circuitMastery", null)?.entries?.some(e => /learn|aero/.test(e.key)) ?? false, false);
});

test("BACK TO LESSON quits; end() restores the session and reopens learn/aero/ with the last result", () => {
  button("drill-card-back").click();
  assert.equal(card(), null, "the card leaves with BACK");
  assert.equal(run.G.state, "menu");
  assert.equal(run.host.end("quit"), true, "game.js's quitToMenu ends its drill");
  assert.equal(run.reopened.length, 1);
  const { lesson, payload } = run.reopened[0];
  assert.equal(lesson, "aero");
  assert.equal(payload.id, "aero");
  assert.equal(payload.result.medal, null, "the last run, not the best");
  assert.equal(payload.result.unit, "m");
  assert.equal(run.host.active(), null);
});
