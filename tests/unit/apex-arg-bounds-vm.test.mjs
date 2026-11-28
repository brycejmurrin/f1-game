/* apex-arg-bounds-vm.test.mjs — hunt #7490 rows 11, 12, 14, 15 (issue #7511): pair/jam refuse a
 * non-finite argument BEFORE the state flip, race({laps}) and step(dt, n) are bounded, renderClock
 * refuses a non-finite t. Each refusal assertion fails on the base. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");
const MAX_STEPS = 60 * 60 * 60;   // ApexLobby.MAX_STEPS (js/agent/apex-lobby.js)

test("pair()/jam() refuse a non-finite argument and leave state and progress alone", async () => {
  const g = await createGame({ track: "monza" });
  try {
    await g.race("monza");
    const A = g.apex, G = g.G;
    A.headless(true);
    G.cmd.setState("menu", "test");
    const menu = G.state;
    for (const [call, args] of [["pair", ["x"]], ["pair", [0.3, "fast"]], ["pair", [NaN]], ["jam", ["x"]], ["jam", [Infinity]]]) {
      const r = A[call](...args);
      assert.equal(r && r.ok, false, `${call}(${args}) did not refuse`);
      assert.equal(r.error, "bad_argument");
      assert.equal(G.state, menu, `${call}(${args}) flipped state`);
      assert.ok(G.cars.every((c) => Number.isFinite(c.prog)), `${call}(${args}) wrote a NaN prog`);
    }
    const p = A.pair(0.3);
    assert.equal(typeof p.a, "number", "a valid pair() no longer places the pair");
    assert.equal(G.state, "race");
    assert.ok(A.jam(3).length === 3, "a valid jam(3) no longer stacks three cars");
  } finally { g.close(); }
});

test("race({laps}) is rounded and bounded; step(dt, n) is capped and says so", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const A = g.apex, G = g.G;
    A.race("monza", "day", "dry", { laps: 3e9 });
    assert.ok(G.raceLaps > 0 && G.raceLaps <= 200, "raceLaps " + G.raceLaps);
    A.race("monza", "day", "dry", { laps: 2 ** 32 + 5 });
    assert.equal(G.raceLaps, 200, "2**32+5 laps wrapped");
    A.race("monza", "day", "dry", { laps: 4.6 });
    assert.equal(G.raceLaps, 5);
    A.race("monza", "day", "dry", { laps: 7 });
    assert.equal(G.raceLaps, 7, "a valid lap count changed");
    await g.race("monza");
    A.headless(true);
    // Count ticks without running physics: tick() reads G.update each call.
    const real = G.update;
    let ticks = 0;
    G.update = () => { ticks++; };
    try {
      const r = A.step(1 / 60, 1e9);
      assert.deepEqual({ ...r }, { capped: true, steps: MAX_STEPS });   // spread: the VM realm's Object
      assert.equal(ticks, MAX_STEPS);
      ticks = 0;
      assert.equal(A.step(1 / 60, 3), undefined, "an uncapped step() now returns a value");
      assert.equal(ticks, 3);
    } finally { G.update = real; }
  } finally { g.close(); }
});

test("renderClock refuses a non-finite t and keeps G.skyT", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const A = g.apex, G = g.G;
    assert.equal(A.renderClock(42, true), 42);
    for (const bad of [NaN, "noon", Infinity]) {
      const r = A.renderClock(bad);
      assert.equal(r && r.ok, false, `renderClock(${bad}) did not refuse`);
      assert.equal(G.skyT, 42, `renderClock(${bad}) changed skyT`);
    }
    assert.equal(A.renderClock(), 42);
    assert.equal(A.renderClock(null, false), 42, "null should release the pin, not clear the clock");
    assert.equal(G.skyHold, false);
  } finally { g.close(); }
});
