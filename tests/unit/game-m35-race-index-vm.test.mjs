/* game-m35-race-index-vm.test.mjs — M35: after lights-out arming, an AI car's
 * raceHash (gridUp launch/tyre/phase) uses the SAME raceRound armReliability and
 * the in-race mistake hash use. Pre-fix, gridUp hashed on raceIndex before
 * raceIndex++, so one-off GP draws disagreed with B6.
 *
 * Run: node --test tests/unit/game-m35-race-index-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

test("M35: AI raceHash matches luckSeed:drawRound:gridSlot:skill (arm's round, pre-bump)", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G, ctx = g.ctx;
    // Boot already ran startRace once: raceRound is post-bump; draws used raceRound-1.
    assert.ok(G.raceRound >= 1, `precondition: a race was armed (raceRound=${G.raceRound})`);
    assert.equal(G.session, "race");
    const drawRound = G.raceRound - 1; // armReliability ran before raceIndex++
    const hash32 = ctx.DriverRatings.hash32;
    const seed = G.simSeed(); // no career / season in this harness → luckSeed() === simSeed()
    let checked = 0;
    for (const c of G.cars) {
      if (c.human || c.raceHash == null) continue;
      const slot = (c.gridPos | 0) - 1;
      assert.ok(slot >= 0, `${c.code}: gridPos set`);
      const expect = hash32(seed + ":" + drawRound + ":" + slot + ":" + c.skill);
      assert.equal(
        c.raceHash,
        expect,
        `${c.code}: raceHash must use drawRound=${drawRound} (gridUp + armReliability), not post-bump raceRound=${G.raceRound}`,
      );
      checked++;
    }
    assert.ok(checked >= 5, `checked ${checked} AI cars`);
  } finally {
    g.close();
  }
});
