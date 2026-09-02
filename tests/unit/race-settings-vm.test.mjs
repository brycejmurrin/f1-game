/* race-settings-vm.test.mjs — RACE SETTINGS lap ladder as BEHAVIOUR in the
 * game-vm harness (tools/game-vm.cjs runs the real game.js on an inert DOM).
 *
 * FULL moves with the circuit (def.gpLaps: Monaco 78, Spa 44, Silverstone 52),
 * so a lap count picked on one circuit can sit OFF the ladder on the next —
 * above full (78 at Spa) or BELOW it (52 (FULL) at Monaco). The old clamp only
 * handled "above": a Silverstone full race opened Monaco's sheet with no LAPS
 * chip lit (setup-screens audit 2026-09-02, finding 11). Any off-ladder value
 * now snaps to this circuit's FULL — a full race stays a full race.
 *
 * Run: node --test tests/unit/race-settings-vm.test.mjs   (npm run test:game-vm)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ storage: { trackId: "monza" } }); });
after(() => { if (g) g.close(); });

const tracks = () => (g.sandbox && g.sandbox.Tracks) || (g.ctx && g.ctx.Tracks);
const idx = (id) => tracks().LIST.findIndex((t) => t.id === id);
const full = (id) => tracks().LIST[idx(id)].gpLaps;
// openRaceSettings() runs buildRaceSettings() on the inert DOM; the state it
// leaves in G.raceLaps is the assertion, the chips are not. Outside the VS
// FRIEND room every visit resets the chips to the default (3, or a season
// format's distance), so the carried-over case is the ROOM's: the host picks a
// distance, changes circuit, and comes back to the sheet.
function open(trackId, room = true) {
  g.G.setNetRoom(room);
  try { g.G.trackIdx = idx(trackId); g.G.openRaceSettings("select"); return g.G.raceLaps; }
  finally { g.G.setNetRoom(false); }
}

test("FULL is the circuit's own distance and differs between circuits", () => {
  assert.ok(full("monaco") > full("spa"), `monaco ${full("monaco")} > spa ${full("spa")}`);
  assert.ok(full("silverstone") < full("monaco"), `silverstone ${full("silverstone")} < monaco ${full("monaco")}`);
});

test("a lap count on the ladder survives a circuit change", () => {
  g.G.timeTrial = false; g.G.seasonMode = false;
  g.G.raceLaps = 25;
  assert.equal(open("silverstone"), 25);
  assert.equal(open("monaco"), 25, "25 is on every circuit's ladder");
});

test("a FULL race picked on a shorter circuit is FULL on a longer one (below-full snap)", () => {
  g.G.raceLaps = full("silverstone");
  assert.equal(open("silverstone"), full("silverstone"), "FULL at Silverstone is FULL there");
  assert.equal(open("monaco"), full("monaco"), "…and Monaco's own FULL, not an unlit ladder");
});

test("a FULL race picked on a longer circuit is FULL on a shorter one (above-full snap)", () => {
  g.G.raceLaps = full("monaco");
  assert.equal(open("monaco"), full("monaco"));
  assert.equal(open("spa"), full("spa"));
});

test("time trial keeps its own ladder and never snaps to a grand prix distance", () => {
  g.G.timeTrial = true;
  g.G.raceLaps = 4;
  assert.equal(open("monaco"), 4, "TT default 4 stays lit");
  g.G.timeTrial = false;
});

test("outside the room a visit still resets to the default, which is on every ladder", () => {
  g.G.raceLaps = full("monaco");
  assert.equal(open("spa", false), 3, "the solo flow's default (GAME_LAPS) — a preselection, not a carry-over");
});
