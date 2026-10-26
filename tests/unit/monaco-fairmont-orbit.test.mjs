/* monaco-fairmont-orbit.test.mjs — #3368 mid-lap orbit must see the racing line.
 *
 * dual_lite / night_pass / scenery orbit at frac 0.50 (az 45, dist ~40–45 m)
 * used to sit behind plane-tree crowns on the Fairmont-cliff corridor
 * (js/circuits/scenery/monaco.js along 0.672–0.728). FlybySight.transmit → T=0;
 * the survey cell showed stairs, two trees and a retaining wall, not asphalt.
 *
 * Run: node --test tests/unit/monaco-fairmont-orbit.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let game;
before(async () => { game = await createGame({ track: "monaco" }); });
after(() => { if (game) game.close(); });

/** dual_lite / night_pass / scenery orbit cells that frame mid-lap. */
const MID_LAP = [
  { name: "dual_lite", frac: 0.5, az: 45, el: 20, dist: 42 },
  { name: "night_pass", frac: 0.5, az: 45, el: 18, dist: 40 },
  { name: "scenery", frac: 0.5, az: 45, el: 22, dist: 45 },
];

test("Monaco mid-lap orbit sightline clears the Fairmont-cliff plane crowns (#3368)", () => {
  const G = game.G, a = game.apex, sb = game.sandbox;
  for (const cell of MID_LAP) {
    const r = a.orbit(cell.frac, cell.az, cell.el, cell.dist, 1.5);
    assert.ok(r && r.eye && r.target, `${cell.name}: orbit returned a pose`);
    const inside = sb.FlybySeq.insideProp(G.track, r.eye, 1);
    assert.equal(inside, null, `${cell.name}: eye must not sit inside a solid (${inside && inside.kind})`);
    const { T } = sb.FlybySight.transmit(G.track, r.eye, r.target);
    assert.ok(T >= 0.5, `${cell.name}: transmit T=${T} (want ≥ 0.5 so asphalt is visible)`);
  }
});
