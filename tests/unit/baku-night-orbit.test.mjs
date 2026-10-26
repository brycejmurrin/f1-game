/* baku-night-orbit.test.mjs — #3340 Caspian night orbit must see the racing line.
 *
 * night_pass cell survey-83-orbit (frac 0.8333, az 45, el 18, dist 40) used to
 * sit inside theme-dress front-row neonTowers (gap 13–25) on Neftchilar +1.
 * Capture classified black-scene-with-edge-content; other night fracs (0–0.67) were fine.
 * Fix: dressingExclusions city on +1 for 0.58–0.97; authored cityFront at gap 48
 * (unlit; towers at 96+) so the eye clears the glass canyon without neon coplanars.
 *
 * Run: node --test tests/unit/baku-night-orbit.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let game;
before(async () => { game = await createGame({ track: "baku" }); });
after(() => { if (game) game.close(); });

/** Survey cells that frame the Caspian / Giz Galasi stretch at night. */
const CASPIAN_NIGHT = [
  { name: "night_pass-83", frac: 0.8333, az: 45, el: 18, dist: 40 },
  { name: "dual_lite-83", frac: 0.8333, az: 45, el: 20, dist: 42 },
  { name: "scenery-83", frac: 0.8333, az: 45, el: 22, dist: 45 },
];

test("Baku Caspian night orbit sightline clears the +1 glass canyon (#3340)", () => {
  const G = game.G, a = game.apex, sb = game.sandbox;
  for (const cell of CASPIAN_NIGHT) {
    const r = a.orbit(cell.frac, cell.az, cell.el, cell.dist, 1.5);
    assert.ok(r && r.eye && r.target, `${cell.name}: orbit returned a pose`);
    const inside = sb.FlybySeq.insideProp(G.track, r.eye, 1);
    assert.equal(inside, null, `${cell.name}: eye must not sit inside a solid (${inside && inside.kind})`);
    const { T } = sb.FlybySight.transmit(G.track, r.eye, r.target);
    assert.ok(T >= 0.5, `${cell.name}: transmit T=${T} (want ≥ 0.5 so asphalt / boulevard is visible)`);
  }
});
