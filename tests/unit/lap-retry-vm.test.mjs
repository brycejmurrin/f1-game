/* lap-retry-vm.test.mjs — RETRY LAP (js/race/lap-retry.js, #6965, #6920 U4.5):
 * a solo Time Trial goes back to the flying-start drop-in AT ONCE, on the real
 * game in the Node VM.
 *
 * WHAT IT PROVES. FlyingStart's drop callback captures the world through SimState
 * in the frame the car is placed; retry() restores it byte for byte (the player's
 * primitive fields, raceT, the sim RNG stream position and the sector state),
 * re-runs the HANDOVER_S run-up, and never rebuilds the grid or re-enters the
 * countdown. A fresh flying start on the same seed lands on the same digest, and
 * the same 10 s of input after two retries ends on the same digest.
 *
 * Run: node --test tests/unit/lap-retry-vm.test.mjs   (one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ storage: { trackId: "monza" } }); });
after(() => { if (g) g.close(); });

const FRAME_MS = 50;
let clock = 0;
function pump(n) {
  if (!clock) clock = g.sandbox.performance.now();
  for (let i = 0; i < n; i++) { clock += FRAME_MS; g.pumpFrame(clock); }
}
const LR = () => vm.runInContext("LapRetry.current()", g.ctx);   // a literal snippet, never a source load
const RUNTIME = () => new Set(vm.runInContext("SimState.RUNTIME", g.ctx));

/** The player's primitive fields (SimState's RUNTIME set excluded), the clock, the RNG and the sectors. */
function digest() {
  const skip = RUNTIME(), p = g.G.player, car = {};
  for (const k of Object.keys(p).sort()) {
    const v = p[k];
    if (skip.has(k)) continue;
    if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") car[k] = Object.is(v, -0) ? "-0" : v;
  }
  return JSON.stringify({ car, raceT: g.G.raceT, rng: [g.G.simSeed(), g.G.simSeed(undefined, true)],
    sectorIdx: g.G.sectorIdx, sectorStartT: g.G.sectorStartT, state: g.G.state });
}
function firstDiff(a, b) {
  const A = JSON.parse(a), B = JSON.parse(b);
  for (const k of new Set([...Object.keys(A.car), ...Object.keys(B.car)])) if (!Object.is(A.car[k], B.car[k])) return `.${k}: ${A.car[k]} vs ${B.car[k]}`;
  for (const k of Object.keys(A)) if (k !== "car" && JSON.stringify(A[k]) !== JSON.stringify(B[k])) return `${k}: ${JSON.stringify(A[k])} vs ${JSON.stringify(B[k])}`;
  return null;
}
const same = (a, b, m) => assert.ok(a === b, m + " — first diff " + firstDiff(a, b));

async function freshTT(seed) {
  try { g.apex.clearInput(); } catch (_) {}
  g.G.simSeed(seed);
  const before = g.G.cars;
  assert.ok(g.apex.tt("monza", "day"), "tt() starts");
  assert.ok(await g.settle(() => g.G.cars !== before && g.G.state === "count", 4000), "the TT grid is built");
  // The first countdown frame arms FlyingStart and drops the car in. pumpFrame runs a whole
  // frame, so the capture (inside flyingStart.update) is followed by that frame's other work:
  // the digest we compare against is the one retry() reaches, read right after it.
  pump(1);
  assert.equal(g.G.state, "race", "a flying start: green in the drop-in frame");
  assert.equal(g.G.flyingStart.active(), true, "the AI holds the run-up");
  assert.ok(LR() && LR().hasSnapshot(), "the drop-in was captured");
}
const drive = () => g.apex.rollout({ seconds: 10, input: { steer: 0.03, throttle: true } });

test("RETRY LAP restores the drop-in byte for byte, replays the same 10 s, and never rebuilds the session", async () => {
  await freshTT(42);
  const cars = g.G.cars;
  assert.equal(cars.length, 1, "a TT grid is the player alone");
  assert.equal(LR().canRetry(), true);
  // D0: the world retry() puts back. Taken through retry() so the comparison is restore-vs-restore.
  assert.ok(LR().retry());
  const d0 = digest();
  assert.equal(g.G.flyingStart.active(), true, "the run-up is re-armed");

  const stageNames = () => JSON.stringify((g.apex.raceEntryStages() || { stages: [] }).stages.map((x) => x.n + ":" + x.ms));
  const stages = stageNames();
  drive();
  const d1 = digest();
  assert.notEqual(d1, d0, "10 s of driving moved the car");

  const t0 = performance.now();
  assert.ok(LR().retry(), "retry from mid-lap");
  const wall = performance.now() - t0;
  same(digest(), d0, "the retry is back at the drop-in");
  assert.ok(wall < 1000, "the retry is instant (" + wall.toFixed(0) + " ms)");
  assert.equal(g.G.cars, cars, "no makeCars: startRace did not run");
  assert.equal(g.G.state, "race", "no countdown re-entry");
  assert.equal(g.G.player.human, false, "the AI holds the run-up again");
  assert.equal(stageNames(), stages, "no race-entry stage (no loadTrackStepped) was recorded");

  drive();
  same(digest(), d1, "the same 10 s of input after a retry ends on the same digest");

  // A fresh flying start on the same seed drops in at the same digest.
  await freshTT(42);
  assert.ok(LR().retry());
  same(digest(), d0, "a fresh flying start on seed 42 is the same lap");
});

test("the TT session survives: lap list and best are kept; outside a TT the button is off", async () => {
  await freshTT(42);
  g.G.player.best = 81.234;   // a lap already set this session
  g.G.player.lastLap = 82.5;
  g.G.sectorLast.splice(0, 3, 27.1, 28.2, 27.2);
  const laps = g.G.ttLaps;
  drive();
  assert.ok(LR().retry());
  assert.equal(g.G.player.best, 81.234, "the session best is kept forward");
  assert.equal(g.G.player.lastLap, 82.5, "the HUD LAST lap is kept forward");
  assert.deepEqual([...g.G.sectorLast], [27.1, 28.2, 27.2], "…and the last splits");
  assert.equal(g.G.ttLaps, laps, "lapRec.ttLaps is not reset");
  assert.ok(LR().hasSnapshot(), "and can be retried again");
  LR().invalidate();
  assert.equal(LR().canRetry(), false, "a coach rewind drops the stale drop-in");

  // A plain race: no drop-in, no retry.
  g.G.timeTrial = false;
  await g.race("monza");
  assert.equal(LR().canRetry(), false, "a race never offers RETRY LAP");
  assert.equal(LR().retry(), false);
});
