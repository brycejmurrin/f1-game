/* drill-wake-vm.test.mjs — LEARN's Wake Footprint drill (js/learn-drills/wake.js, #6559 step 7, #6555 §1) end to end
 * in the game VM, through game.js's host (__apex.drillLaunch). A scripted follow (tests/helpers/wake-drill-vm.mjs)
 * drives the Curva Grande run at a fixed offset from the rival:
 * - the medal tiers are the VM ladder's (tests/data/learn-drill-refs.json "wake"; regenerate with
 *   node tests/helpers/wake-drill-vm.mjs --write), and the shipped MEDALS equal them;
 * - one seed, two runs (RETRY, and a second boot): the same score and medal, to the bit;
 * - centred scores below a 2 m offset, and the score IS the time-weighted mean of the c._dirtyAirMul sampled;
 * - the guide is render-only: the player's trace is identical with its draw() stubbed out;
 * - drillEnd restores the player's dirty air and practice goal.
 *
 * Run: node --test tests/unit/drill-wake-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { wakeDrill, deriveWakeTiers, OFFSETS, REFS } from "../helpers/wake-drill-vm.mjs";

const refs = JSON.parse(readFileSync(REFS, "utf8")).wake;
const FN = { filename: "drill-wake-vm:ev" };
const ref = (o) => refs.runs.find((r) => r.offset === o);
let run;
before(async () => { run = await wakeDrill(); });
after(() => run?.close());

test("learn-drill-refs.json: the offset ladder, and the tiers follow from it by the documented rule", () => {
  assert.deepEqual(refs.runs.map((r) => r.offset), OFFSETS);
  assert.ok(refs.runs.every((r) => r.clean), "every ladder run is clean");
  assert.deepEqual(refs.tiers, deriveWakeTiers(refs.runs));
  assert.ok(refs.tiers.bronze < refs.tiers.silver && refs.tiers.silver < refs.tiers.gold);
  assert.deepEqual({ ...vm.runInContext("DrillRegistry.get('wake').medals", run.g.ctx, FN) }, refs.tiers);
});

test("the drill races Monza with one rival, Classic dirty air, on the corner goal", () => {
  const G = run.G, st = run.g.apex.drillState();
  assert.equal(st.id, "wake");
  assert.equal(st.cars, 2);
  assert.equal(vm.runInContext("Tracks.LIST[" + G.trackIdx + "].id", run.g.ctx, FN), "monza");
  assert.equal(G.raceDirtyAir, "classic");
  assert.equal(G.coach.practiceGoal(), "corner");
  assert.equal(vm.runInContext("DrillRegistry.get('wake').lesson", run.g.ctx, FN), "chassis");
});

test("one seed, two runs: a centred follow scores the same, bit for bit, and its medal is bronze", () => {
  const a = run.drive(0);
  assert.ok(a && a.clean, "run 1 finished clean: " + (a && a.reason));
  assert.ok(run.retry(), "RETRY");
  const b = run.drive(0);
  assert.ok(b && b.clean, "run 2 finished clean: " + (b && b.reason));
  assert.equal(b.value, a.value);
  assert.equal(b.medal, a.medal);
  assert.equal(a.value, ref(0).value, "the ladder's centred run");
  assert.equal(a.medal, "bronze");
});

test("a 2 m offset keeps more grip than centred, takes gold, and the score is the sampled multiplier's mean", () => {
  assert.ok(run.retry());
  const G = run.G, apex = G.track.def.turns[2] * G.track.total, W = vm.runInContext("WakeDrill", run.g.ctx, FN);
  let sum = 0, t = 0, last = null;
  const sampleOff = run.g.apex.act.bind(run.g.apex);
  run.g.apex.act = (input, dt, n) => {   // sample what player-forces applied, frame by frame, inside the window
    const out = sampleOff(input, dt, n), p = G.player;
    if (last != null && p.s >= apex - W.WIN_IN && p.s <= apex + W.WIN_OUT) { sum += p._dirtyAirMul * (G.raceT - last); t += G.raceT - last; }
    last = G.raceT;
    return out;
  };
  let r;
  try { r = run.drive(2); } finally { run.g.apex.act = sampleOff; }
  assert.ok(r && r.clean, r && r.reason);
  assert.ok(r.value > ref(0).value, `offset ${r.value} % vs centred ${ref(0).value} %`);
  assert.equal(r.value, ref(2).value);
  assert.equal(r.medal, "gold");
  assert.ok(Math.abs(100 * sum / t - r.value) < 0.15, `sampled mean ${(100 * sum / t).toFixed(2)} % vs score ${r.value} %`);
});

test("the guide is render-only: the player's trace is identical with its draw() stubbed out", () => {
  const G = run.G, trace = () => {
    const rows = [], act = run.g.apex.act.bind(run.g.apex);
    run.g.apex.act = (i, dt, n) => { const o = act(i, dt, n); rows.push([G.player.s, G.player.x, G.player.speed, G.player._dirtyAirMul]); return o; };
    try { run.drive(1); } finally { run.g.apex.act = act; }
    return rows;
  };
  assert.ok(run.retry());
  const withGuide = trace();
  const guide = G.drills().guide(), draw = guide.draw;
  guide.draw = () => false;
  let without;
  try { assert.ok(run.retry()); without = trace(); } finally { guide.draw = draw; }
  assert.ok(withGuide.length > 300);
  assert.deepEqual(without, withGuide);
});

test("a second boot on the same seed gives the same centred score; drillEnd restores dirty air and the goal", async () => {
  const two = await wakeDrill();
  try {
    const r = two.drive(0);
    assert.ok(r && r.clean);
    assert.equal(r.value, ref(0).value);
    assert.equal(r.medal, "bronze");
    const end = two.g.apex.drillEnd();
    assert.equal(end.ok, true);
    assert.equal(two.G.state, "menu");
    assert.equal(two.G.raceDirtyAir, two.before.dirtyAir, "dirty air is the player's again");
    assert.equal(two.G.coach.practiceGoal(), two.before.goal, "the practice goal is the player's again");
  } finally { two.close(); }
});
