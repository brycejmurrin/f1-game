/* season-seat-move-vm.test.mjs — season points FOLLOW THE PLAYER across a team change
 * (#5877, decision B), in the Node VM (tools/lib/game-vm.cjs), on Monza.
 *
 * Points are keyed by seat (seasonDriverId "team:driver"); the team setting is shared
 * with single races, so switching team between rounds left the player's points on the
 * old seat, credited to the AI now in it. The grid build (game.js) now calls
 * SeasonCal.seatPlayer, which moves the tally with the player (season-cal.test.mjs
 * pins the bookkeeping; this pins the hook).
 *
 * Run: node --test tests/unit/season-seat-move-vm.test.mjs   (~10 s, one boot)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

test("score a round, change team, start the next round: the points are on the player's new seat", async () => {
  const g = await createGame({ track: "monza", storage: { seasonCfg: { quali: false } } });
  try {
    const G = g.G;
    G.daily.stop(); G.timeTrial = false; G.practice = false;
    G.quitToMenu();
    G.seasonMode = true;
    await G.startRace();
    g.apex.go(); g.step(60);
    g.apex.park(0.9); g.apex.finishRace();
    assert.equal(G.state, "results");
    const oldSeat = G.player.driverId, mine = G.season.pts[oldSeat] || 0;
    assert.ok(mine > 0, "the player scored in round 1");
    assert.equal(G.season.round, 1, "round 1 scored");
    const total = Object.values(G.season.pts).reduce((a, b) => a + b, 0);
    assert.ok(total > 0, "the round paid points");
    // A different team (the team setting is the one single races share).
    const teams = g.sandbox.Teams.LIST;
    const cur = G.teamIdx;
    G.teamIdx = teams.findIndex((t, i) => i !== cur && !t.legends && !t.custom);
    G.quitToMenu();
    G.seasonMode = true;
    await G.startRace();
    const newSeat = G.player.driverId;
    assert.notEqual(newSeat, oldSeat, "the player is in another seat");
    assert.equal(G.season.pts[newSeat] || 0, mine, "the player's round-1 points moved with them");
    assert.equal(G.season.pts[oldSeat] || 0, 0, "the AI now in the old seat is not credited with them");
    assert.equal(Object.values(G.season.pts).reduce((a, b) => a + b, 0), total, "no point lost or made");
  } finally { g.close(); }
});
