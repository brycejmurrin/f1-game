/* red-flag-pit-vm.test.mjs — a stop in flight is scratch, and a red flag drops it.
 *
 * redFlagRestart() enumerates the racecraft scratch a re-grid must not carry
 * (contactT, wrongWay, offT, wallT, otT, …) and deliberately KEEPS the things
 * that are strategy — energy, tyreClass, phaseRoll. The pit fields were in
 * neither list, and they are both: pitStops/pitNext/pitPlan are strategy and
 * must survive, while pitState/pitArmed/pitCommitted are an in-progress stop
 * and must not.
 *
 * WHY THE OMISSION BIT. The restart teleports every car onto a grid box, and
 * on most circuits the grid sits INSIDE the pit window — so a car that was
 * holding the lane when the flag flew came out of the standing start still
 * reading pits.inLane(). game.js's vmax branch then held it at the pit limiter
 * and laneDrive steered it onto the lane offset. Measured on Monza before the
 * fix: full throttle from lights-out, and the car could not pass ~20 m/s for
 * ~750 physics ticks — about twelve seconds — until the arc finally walked it
 * out of the window, because update()'s "left the window" branch is the only
 * other thing that clears the arm and by construction cannot fire from inside
 * the window.
 *
 * Run: node --test tests/unit/red-flag-pit-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g;
before(async () => { g = await createGame({ track: "monza" }); });
after(() => { if (g) g.close(); });

test("a red flag clears a stop in flight but keeps the strategy behind it", () => {
  const a = g.apex, G = g.G;
  g.step(120);                       // the grid clears the line
  const player = G.player;

  // A stop in flight: armed, committed, holding the lane.
  player.pitState = "lane"; player.pitArmed = true; player.pitCommitted = true;
  player.pitT = 0; player.pitCommitT = 0.4; player.pitAbortT = 0; player.pitOutT = 0;
  // …and the strategy behind it, which must survive.
  player.pitStops = 2;
  player.pitNext = { tyre: "soft" };

  const r = a.redFlag();
  assert.ok(r && r.state === "count", "redFlag() should re-arm the lights");

  assert.equal(player.pitState, "none", "the lane state is scratch");
  assert.equal(player.pitArmed, false, "the arm is scratch");
  assert.equal(player.pitCommitted, false, "the commitment is scratch");
  assert.equal(player.pitCommitT, 0);

  assert.equal(player.pitStops, 2, "stops taken are the RACE's record, not the restart's");
  assert.deepEqual(player.pitNext, { tyre: "soft" }, "the planned stop survives a red flag");
});

test("the car is not held at the pit limiter after the standing restart", () => {
  const a = g.apex, G = g.G;
  const player = G.player;
  a.go();                            // lights out
  a.setInput({ throttle: true, steer: 0 });
  // 450 ticks is 7.5 s — comfortably inside the ~12 s the latch used to hold,
  // and comfortably enough for a real standing start to clear the limiter.
  for (let i = 0; i < 450; i++) g.step(1);
  a.clearInput();
  const limit = G.pits && G.pits.limit ? G.pits.limit() : 22;
  assert.ok(player.speed > limit + 5,
    `full throttle for 7.5 s should beat the pit limiter (${limit.toFixed(1)} m/s), ` +
    `got ${player.speed.toFixed(1)} m/s — the lane latch is back`);
});
