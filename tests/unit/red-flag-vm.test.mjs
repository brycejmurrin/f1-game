/* red-flag-vm.test.mjs — the standing restart re-runs the lap the field was on.
 *
 * game.js redFlagRestart re-grids every car BEHIND the line. `lap` counts line
 * crossings, so a car re-gridded with its lap kept crossed into lap n+1 at the
 * restart without driving lap n — a leader on its last lap was classified
 * finished 14 m after the lights. The restart now steps lap back by one
 * (prog consistent with gridUp: lap 0 <-> prog just under 0), derives the
 * player's heading from the road tangent as gridUp does, and drops the
 * racecraft scratch a re-grid must not carry.
 *
 * Run: node --test tests/unit/red-flag-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g;
before(async () => { g = await createGame({ track: "monza" }); });
after(() => { if (g) g.close(); });

const SCR = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };

test("red flag: laps step back one, prog sits behind the line, the player faces down the road", () => {
  const a = g.apex, G = g.G;
  g.step(120);                        // the grid clears the line
  a.jump(0.985, 50, 0);
  const lap0 = a.physState().lap;
  a.setInput({ throttle: true, steer: 0 });
  for (let i = 0; i < 300 && a.physState().lap === lap0; i++) g.step(1);
  a.clearInput();
  const player = G.player;
  assert.equal(player.lap, lap0 + 1, "the player should be on the lap after the crossing");
  const L = G.track.total;
  const before = G.cars.map((c) => ({ c, lap: c.lap }));
  // Leave something a re-grid must clear on an AI car.
  const ai = G.cars.find((c) => !c.human && !c.retired);
  ai.passOf = player; ai.defendSide = 1; ai.zoneKey = 3; ai.errT = 1.5;

  const r = a.redFlag();
  assert.ok(r && r.state === "count", "redFlag() should re-arm the lights");
  for (const { c, lap } of before) {
    if (c.retired) continue;
    assert.equal(c.lap, Math.max(0, lap - 1), `${c.code}: the lap it was on is re-run`);
    assert.ok(c.prog < c.lap * L && c.prog > c.lap * L - 200,
      `${c.code}: prog ${c.prog.toFixed(1)} must sit just behind the line of lap ${c.lap}`);
    assert.equal(c.speed, 0, `${c.code}: stationary on the box`);
  }
  assert.equal(ai.passOf, null); assert.equal(ai.defendSide, 0); assert.equal(ai.zoneKey, -1); assert.equal(ai.errT, 0);
  // The player's heading follows the grid tangent (gridUp's rule), not world +Z.
  g.sandbox.Tracks.sample(G.track, player.s, SCR);
  const want = Math.atan2(SCR.t[0], SCR.t[2]);
  assert.ok(Math.abs(player.head - want) < 1e-6, `head ${player.head} vs tangent ${want}`);
  assert.equal(player.rPrevHead, player.head);
});

test("after the restart the first crossing puts the field back on the lap it was on, not one further", () => {
  const a = g.apex, G = g.G;
  const player = G.player;
  const lapAtFlag = player.lap + 1;   // what it was before the re-grid (see above)
  a.go();                             // lights out
  a.setInput({ throttle: true, steer: 0 });
  let crossed = false;
  for (let i = 0; i < 600 && !crossed; i++) { g.step(1); crossed = player.lap !== lapAtFlag - 1; }
  a.clearInput();
  assert.ok(crossed, "never re-crossed the line after the restart");
  assert.equal(player.lap, lapAtFlag, "the restart crossing re-enters the same lap");
  assert.equal(player.finished, false);
});
