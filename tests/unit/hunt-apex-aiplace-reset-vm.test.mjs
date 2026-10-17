/* hunt-apex-aiplace-reset-vm.test.mjs — two live-confirmed js/agent/apex.js defects (hunt F1, F2).
 *  F1  aiPlace() ranked a placed car one lap ahead: c.prog must follow the engine's (lap-1)*L + s.
 *  F2  reset() `delete`d CarFields-predeclared keys, dropping every car to V8 dictionary mode. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import v8 from "node:v8";

const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");
v8.setFlagsFromString("--allow-natives-syntax");
const isFast = new Function("o", "return %HasFastProperties(o)");

test("aiPlace: prog follows (lap-1)*L + s at lap 0 and lap 2", async () => {
  const g = await createGame({ track: "monza" });
  try {
    await g.race("monza");
    const A = g.apex, G = g.G, L = G.track.total;
    A.headless(true);
    for (const lap of [0, 2]) {
      G.cars[3].lap = lap;
      assert.ok(A.aiPlace(3, 0.5, 40));
      const c = G.cars[3];
      assert.ok(Math.abs(c.prog - ((lap - 1) * L + c.s)) < 1e-6, `lap ${lap}: prog ${c.prog} vs ${(lap - 1) * L + c.s}`);
    }
  } finally { g.close(); }
});

test("reset(): cars keep fast properties and CarFields keys read undefined", async () => {
  const g = await createGame({ track: "monza" });
  try {
    await g.race("monza");
    const A = g.apex, G = g.G;
    A.headless(true);
    A.reset(0.02, 55, 0, 42); A.step(10); A.reset(0.02, 55, 0, 42);
    const slow = G.cars.filter((c) => !isFast(c)).length;
    assert.equal(slow, 0, `${slow} of ${G.cars.length} cars fell to dictionary mode after reset()`);
    assert.equal(G.cars[5].kCur, undefined);
  } finally { g.close(); }
});
