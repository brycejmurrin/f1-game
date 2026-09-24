import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

test("red-flag replay preserves burned fuel and burns the repeated lap", async () => {
  const g = await createGame({ track: "monza", storage: { tyreWear: "real" } });
  try {
    const { G } = g, c = G.player, L = G.track.total;
    c.lap = 2; c.fuelLap = 2; c.s = L * 0.4; c.prog = L + c.s; G.state = "race";
    const beforeA = G.tyres.fuelAccelMul(c), beforeV = G.tyres.fuelVmaxMul(c);
    assert.equal(G.redFlagRestart(), true);
    assert.equal(c.lap, 1, "classification replays its interrupted lap");
    assert.equal(G.tyres.fuelAccelMul(c), beforeA, "restart does not add fuel");
    assert.equal(G.tyres.fuelVmaxMul(c), beforeV, "top-speed fuel load stays put");
    const R = vm.runInContext("RaceControl", g.ctx);
    R.lineTransition(c, L - 1, 1, 2, L, G.lapsTarget, G.cars, G.raceT);
    assert.equal(c.lap, 2);
    assert.ok(G.tyres.fuelAccelMul(c) > beforeA, "repeated physical lap burns fuel");
    // A backward recross can undo scoring, but must not refill the car.
    const after = G.tyres.fuelAccelMul(c);
    R.lineTransition(c, 1, L - 1, -2, L, G.lapsTarget, G.cars, G.raceT);
    assert.equal(G.tyres.fuelAccelMul(c), after);
  } finally { g.close(); }
});
