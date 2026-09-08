/* replay-determinism-vm.test.mjs — "same seed + same inputs => same result",
 * in the Node VM (tools/lib/game-vm.cjs). A twin of the FIRST test in
 * tests/specs/agent-determinism.spec.js, deliberately: that spec is the only
 * guard on this invariant and it costs a browser group, so a leak lands, ships,
 * and is found by CI going red on someone else's push days later.
 *
 * WHY A TWIN IS WORTH IT HERE. The invariant has now been broken FOUR times,
 * every time by the same shape of mistake — a field that reads like a per-tick
 * output is actually carried across ticks, and it sits outside a clear list
 * next to fields that are in it:
 *
 *   1. gridUp() cleared the race-level fields but not the DRIVETRAIN, so gear /
 *      rpm / smoothed steering leaked across episodes.
 *   2. `prog` accumulates from `c._prevS`, which reset() never cleared.
 *   3. `c.accSm` — "what this car is pulling". AiDrive.otWant reads it off the
 *      BLOCKER, so it is one tick stale BY DESIGN and a re-grid inherited the
 *      last race's ~6.7 m/s²: at lights-out "is the car ahead pulling away?"
 *      answered differently and lap 1 was dealt differently (2026-09-08,
 *      docs/notes/DEFECT-LEDGER.md §7).
 *   4. `c.lane`, the AI's preferred line, walked off `lanePref` by adaptLane
 *      under traffic with nothing to put it back — same class, same commit.
 *
 * The first run is the one that differs, every time: the first episode CREATES
 * per-car scratch that no re-grid restores, so runs 2..n agree with each other
 * and disagree with run 1. Three runs, not two, is what makes that legible.
 *
 * This asserts nothing about WHICH field leaks — it cannot, and that is the
 * point. Whatever the fifth one turns out to be, this fails in seconds in
 * test:tooling-fast instead of in a browser group on the deploy branch.
 *
 * It is in the toolingFast list on purpose: that list runs UNCONDITIONALLY in
 * the deploy gate, and the browser spec holding this invariant is selected only
 * when the change-aware gate happens to pick it — which is exactly how leak 3
 * reached the deploy tip and went red on somebody else's push.
 *
 * Run: node --test tests/unit/replay-determinism-vm.test.mjs   (~10 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ track: "monza" }); });
after(() => { if (g) g.close(); });

// One scripted episode at a given seed, digested down to what a leak moves:
// the driving, and the field order the grid dealt. Same script as the spec.
function episode(seed) {
  const A = g.apex;
  A.headless(true);
  A.reset(0.02, 55, 0, seed);
  const r = A.rollout({ seconds: 4, input: { steer: 0.05, throttle: true } });
  const f = A.field({ detail: "full" });
  A.headless(false);
  return {
    distanceM: r.distanceM,
    speed: r.speedKph,
    to: r.to,
    grid: f.positions.map((p) => p.code + ":" + p.pace).join(","),
  };
}

test("the same seed replays an episode exactly", async () => {
  await g.race("monza");
  const runs = [episode(42), episode(42), episode(42)];

  // Byte-identical, not merely close. A leak of this class moves one car by a
  // few metres over 4 s — inside any tolerance worth writing, and enough to
  // swap two positions in the order, which is what the grid digest catches.
  assert.equal(JSON.stringify(runs[1]), JSON.stringify(runs[0]),
    "run 2 diverged from run 1 — a re-grid did not restore some per-car state");
  assert.equal(JSON.stringify(runs[2]), JSON.stringify(runs[0]),
    "run 3 diverged from run 1 — a re-grid did not restore some per-car state");

  // ...and it actually drove. A frozen car replays trivially, which would make
  // the two assertions above pass on a completely broken build.
  assert.ok(runs[0].distanceM > 50,
    "the episode covered " + runs[0].distanceM + " m — it has to actually drive");
});

test("a different seed deals a different grid", async () => {
  await g.race("monza");
  // Without this the test above is satisfied by a constant: a build that
  // ignored the seed entirely would replay perfectly and prove nothing.
  assert.notEqual(episode(7).grid, episode(42).grid,
    "two seeds dealt the same grid — the seed is not reaching the simulation");
});
