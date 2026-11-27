/* drill-rain-vm.test.mjs — the Wet Weather Lines drill (#6559 step 15, #6551 §5) in the real game VM.
 * 1. THE HELD-WETNESS HOOK (#6551 left it unproven). A drill holds the road at one wetness with the EXISTING
 *    G.weatherArc setter: a lap-wide arc whose w0 is the hold and whose dur is a billion seconds, so its lag never
 *    moves the road by more than ~1e-8 a minute. No WeatherArc code changes for the hold; the arc is an ordinary live
 *    arc, so its dry groove (the surface channel, docs/PHYSICS.md) acts on every car, and quitToMenu's endSession()
 *    clears it. Pinned here: the hold holds over 120 s of driving, the groove changes the player's grip, quit clears it.
 *
 * Run: node --test tests/unit/drill-rain-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");

const HOLD = 0.18;   // below bestTread's slick→inter crossover (0.20, WET_GRIP): the field stays on slicks, on a drying road
const held = () => ({ from: "wet", to: "wet", w0: HOLD, i0: 0.5, seq: ["wet"], wetIn: null, t: 0, dur: 1e9 });

test("held-wetness hook: G.weatherArc holds the road, its groove reaches grip, quit clears it", { timeout: 240000 }, async () => {
  const g = await createGame({ carMeshes: false });
  try {
    const G = g.G;
    await g.apex.race("monza", "default", "dry", { laps: 1 });
    assert.ok((await g.stepUntil(() => G.state === "race", { maxSteps: 2000 })).ok, "the race never started");
    assert.equal(G.trackWetness(), 0, "a dry race: no arc, a dry road");
    G.weatherArc = held();
    g.apex.headless(true);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 120 * 60; i++) {
      g.apex.act({ throttle: true, brake: false, steer: 0 }, 1 / 60, 1);
      const w = G.trackWetness();
      lo = Math.min(lo, w); hi = Math.max(hi, w);
    }
    assert.ok(Math.abs(lo - HOLD) < 1e-6 && Math.abs(hi - HOLD) < 1e-6, `the hold drifted: ${lo}..${hi}`);
    assert.ok(G.weatherArc, "a held arc never settles");
    // The groove is lateral surface state: the same car, two offsets, two grips (read-only through G.gripMult).
    const p = G.player, x0 = p.x, grips = [];
    for (let x = -6; x <= 6; x += 0.5) { p.x = x; grips.push(G.gripMult(p)); }
    p.x = x0;
    const spread = Math.max(...grips) - Math.min(...grips);
    assert.ok(spread > 0.02, "the dry groove changes the player's grip across the road: spread " + spread);
    G.quitToMenu();
    assert.equal(G.weatherArc, null, "quitToMenu's endSession() clears the held arc");
    assert.equal(G.trackWetness(), 0, "the player's dry weather is back");
  } finally { g.close(); }
});
