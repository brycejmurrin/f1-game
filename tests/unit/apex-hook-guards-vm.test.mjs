/* apex-hook-guards-vm.test.mjs — hunt #7225 rows 1-2 (issue #7226): pair/jam guard before flipping state,
 * argument hardening for careerMoney / tourShots / cinematic. Each assertion fails on the base. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");

test("pair()/jam() with no grid refuse and leave the state alone", async () => {
  const g = await createGame({ track: "monza" });
  try {
    await g.race("monza");
    const A = g.apex, G = g.G;
    A.headless(true);
    const cars = G.cars.splice(0);   // no grid
    G.cmd.setState("menu", "test");
    const menu = G.state;
    assert.equal(A.pair(), false);
    assert.equal(G.state, menu, "pair() flipped state with no grid");
    assert.equal(A.jam(3), false);
    assert.equal(G.state, menu, "jam() flipped state with no grid");
    G.cars.push(...cars);
  } finally { g.close(); }
});

test("careerMoney: no int32 wrap, NaN refused", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const A = g.apex;
    A.career({ team: "ferrari" });
    assert.notEqual(A.careerMoney(), null, "career save did not open");
    assert.equal(A.careerMoney(3e9), 3e9);
    A.careerMoney(100);
    assert.equal(A.careerMoney(NaN), 100);
  } finally { g.close(); }
});

test("tourShots is capped at 500; cinematic/tourShots accept null opts", async () => {
  const g = await createGame({ track: "monza" });
  try {
    await g.race("monza");
    const A = g.apex;
    assert.ok(A.tourShots(1e7).length <= 500);
    assert.doesNotThrow(() => A.tourShots(3, null));
    assert.doesNotThrow(() => A.cinematic(0, null));
  } finally { g.close(); }
});
