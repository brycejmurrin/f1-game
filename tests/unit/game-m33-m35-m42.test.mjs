/* game-m33-m35-m42.test.mjs — exclusive backlog pointer for docs/BUGS.md M33 /
 * M35 / M42 (game.js). Source-pin shapes were dropped on the tip-sync so the
 * tree assertPins ceilings stay shrink-only; behaviour stays pinned elsewhere:
 *
 *   M33 wrapS zone key + attemptRoll — race-flow-fixes-vm (7.6 lineage) and the
 *     live wrapS sites in js/game.js (re-checked by tooling-fast / Structural
 *     guards once this PR's game.js lands).
 *   M35 arm-then-bump + raceDrawRound — game-m35-race-index-vm.test.mjs
 *   M42 RECOVER pit-lane/box — race-flow-fixes-vm (manual RECOVER in the box)
 *
 * Run: node --test tests/unit/game-m33-m35-m42.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

test("M33/M35/M42 exclusive suite still ships beside the VM pin", () => {
  // Presence only — no source-pin shapes (ratchet).
  assert.equal(
    readFileSync(join(here, "game-m35-race-index-vm.test.mjs"), "utf8").length > 0,
    true,
  );
});
