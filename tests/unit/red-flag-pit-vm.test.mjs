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
  // PEAK over the window, not the last tick: the latch capped the car for the
  // whole window, but the grid melee can put it in a turn-1 contact near the
  // end, and a car that has just been touched reads slower than it was (the
  // end-of-window speed moved 0.7 m/s with an unrelated AI-cover change).
  let peak = 0;
  for (let i = 0; i < 450; i++) { g.step(1); if (player.speed > peak) peak = player.speed; }
  a.clearInput();
  const limit = G.pits && G.pits.limit ? G.pits.limit() : 22;
  assert.ok(peak > limit + 5,
    `full throttle for 7.5 s should beat the pit limiter (${limit.toFixed(1)} m/s), ` +
    `peak ${peak.toFixed(1)} m/s — the lane latch is back`);
});

test("a stop the red flag interrupts before the set is fitted is not counted", () => {
  // pitStops is counted at the box latch (pit-lane.js) and the set is fitted
  // mid-hold. A re-grid in between sent the car out on its OLD tyres with the
  // stop already spent: think() read lapsAt[pitStops] as done, one short.
  const a = g.apex, G = g.G;
  assert.equal(G.state, "race");
  const [early, fitted] = G.cars.filter((c) => !c.human && !c.retired);
  early.pitState = "box"; early.pitFitted = false; early.pitStops = 1; early.pitT = 1.5;
  fitted.pitState = "box"; fitted.pitFitted = true; fitted.pitStops = 1; fitted.pitT = 0.5;
  const r = a.redFlag();
  assert.ok(r && r.state === "count", "redFlag() should re-arm the lights");
  assert.equal(early.pitStops, 0, "the wheels never came off: the stop did not happen");
  assert.equal(fitted.pitStops, 1, "a set already fitted is a stop taken");
  assert.equal(early.pitState, "none");
});


test("red-flag grids and their first crossing preserve physical tyre age", async () => {
  const game = await createGame({ track: "monza", storage: { tyreWear: "real" } });
  try {
    await game.race("monza", "day", "dry", { laps: 12 });
    const G = game.G, L = G.track.total;
    G.tyres.setLevel("real");
    for (const c of G.cars) {
      c.lap = 2; c.prog = L + 200; c.s = 200; c._progGift = 0;
      G.tyres.fit(c, c.tyre);
      c.lap = 6; c.fuelLap = 6; c.prog = 5 * L + 200; c.s = 200;
      c.tyreWear = c.tyreWearF = c.tyreWearR = 0.5;
    }
    const p = G.player, age = G.tyres.lapsOn(p);
    assert.equal(age, 4);
    for (let restart = 0; restart < 2; restart++) {
      game.apex.go();
      const lifeBefore = G.tyres.lapsLeft(p), wearBefore = p.tyreWear;
      assert.equal(game.apex.redFlag().state, "count");
      for (const c of G.cars) assert.equal(G.tyres.lapsOn(c), age);
      assert.equal(G.tyres.lapsLeft(p), lifeBefore);
      assert.equal(p.tyreWear, wearBefore);
      game.apex.go(); game.apex.setInput({ throttle: true, steer: 0 });
      for (let tick = 0; tick < 600 && p.s > L / 2; tick++) game.step(1);
      game.apex.clearInput();
      assert.ok(p.s < L / 2, "actually crossed the restart line");
      assert.equal(G.tyres.lapsOn(p), age, "first crossing is only metres driven");
    }
    G.tyres.fit(p, p.tyre);
    assert.equal(G.tyres.lapsOn(p), 0);
    p.prog += L;
    assert.equal(G.tyres.lapsOn(p), 1);
  } finally { game.close(); }
});
