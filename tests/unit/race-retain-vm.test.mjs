/* race-retain-vm.test.mjs — a finished race must not outlive its own teardown.
 *
 * LIVE-MEMORY-H12-2026-10-20: every circuit raced stayed in the heap (stale traffic buckets, step
 * scratch, then one-generation scratch reaching car._lk.track). On a phone the session grew ~24 MB
 * per two races. These tests drive the real game in the VM harness and ask the garbage collector:
 *
 *   1. After a qualifying weekend, QUIT TO MENU leaves the RACE's field in `cars`, not the
 *      qualifying field (qualiField was never cleared when qualifying handed over to the race, so
 *      quitToMenu's mid-quali branch swapped the finished race's field for the stale one).
 *   2. monza -> quitToMenu -> spa: once spa is BUILT (before its first step overwrites any scratch), the
 *      monza track object is collectable — not merely after the next race happens to write over it.
 *
 * Run: node --test tests/unit/race-retain-vm.test.mjs   (npm run test:game-vm)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import v8 from "node:v8";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const { createGame, settle } = require("../../tools/lib/game-vm.cjs");

// The flag is set at first use, after the game VM exists: set at import time, before createGame(),
// the runner's child was SIGKILLed.
let gc = null;
const collect = async () => {
  if (!gc) { v8.setFlagsFromString("--expose-gc"); gc = vm.runInNewContext("gc"); }
  for (let i = 0; i < 4; i++) { gc(); await new Promise((r) => setImmediate(r)); }
};

let g;
before(async () => { g = await createGame({ track: "monza" }); });
after(() => { if (g) g.close(); });

function drive(steps) {
  const A = g.apex;
  A.headless(true); A.setInput({ throttle: true, steer: 0.02 });
  A.step(1 / 60, steps);
  A.clearInput(); A.headless(false);
}

test("after qualifying -> race -> QUIT TO MENU, cars is the race's field, not the qualifying field", async () => {
  // q-drive's path: `session = "quali"`, then start. (apex.race() sets timeTrial = false, which forces
  // session back to "race", and the session is part of the start's staleness key.)
  await g.race("monza");
  const before = g.G.cars;
  g.G.session = "quali";
  g.G.startRace();
  assert.ok(await settle(() => g.G.cars !== before, 6000), "the qualifying session never built");
  g.apex.go();
  assert.equal(g.G.cars.length, 1, "a qualifying session drives the player alone");
  drive(60);
  g.apex.finishRace();   // endRace's quali branch restores the full field for the sheet
  g.G.session = "race";
  await g.race("monza");
  const raceCars = g.G.cars;
  assert.ok(raceCars.length > 1, "the race fields the grid");
  drive(120);
  g.G.quitToMenu();
  // assert.ok on identity, never assert.equal: a failing equal renders both fields, and a car reaches a
  // whole track — the diff alone ran the runner out of memory (SIGKILL).
  assert.ok(g.G.cars === raceCars, "QUIT TO MENU after a race must not restore the qualifying field");
});

test("monza -> QUIT TO MENU -> spa: the monza track object is collected", async () => {
  g.G.session = "race";
  await g.race("monza");
  drive(300);
  const ref = new WeakRef(g.G.track);
  assert.ok(ref.deref().def.id === "monza");
  g.G.quitToMenu();
  await g.race("spa");   // built, not yet stepped: one-generation scratch has not been overwritten by a spa step
  await collect();
  assert.ok(ref.deref() === undefined, "the previous circuit is still reachable after the next one is built");
});

// Five circuits raced in a row (race → drive → QUIT TO MENU each time): once the last one is built,
// every earlier circuit is collectable. The cross-race leak kept them ALL (one per stale traffic bucket).
test("five circuits raced in a row: only the last stays reachable", async () => {
  const ids = ["monza", "spa", "suzuka", "monaco", "silverstone"];
  const refs = [];
  for (const id of ids) {
    g.G.session = "race";
    await g.race(id);
    drive(240);
    refs.push([id, new WeakRef(g.G.track)]);
    g.G.quitToMenu();
  }
  await g.race("monza");   // build one more so the last raced circuit is not merely the menu's backdrop
  await collect();
  const alive = refs.filter(([, r]) => r.deref() !== undefined).map(([id]) => id);
  assert.ok(alive.length === 0, "circuits still reachable after a sixth build: " + alive.join(", "));
});

// finishRace builds the results sheet (the share chip) before QUIT. Hiding that
// sheet used to leave the chip — and the circuit it closed over — in the document.
test("finishRace → QUIT TO MENU → spa: the results sheet does not keep monza", async () => {
  g.G.session = "race";
  await g.race("monza");
  drive(120);
  g.apex.finishRace();
  assert.equal(g.G.state, "results", "the flag builds the results sheet before the quit");
  const ref = new WeakRef(g.G.track);
  assert.ok(ref.deref().def.id === "monza");
  g.G.quitToMenu();
  await g.race("spa");
  await collect();
  assert.ok(ref.deref() === undefined, "the results sheet still holds the circuit from the race before this one");
});

// A garage visit between races is covered by tests/specs/race-cycle-memory.spec.js: BACK rebuilds the
// car-select DOM, which the VM harness does not carry.
