// @ts-check
// Track boundary consistency — fleet shard 2/2 (contiguous second half).
// Split so select-specs can pack ~26 tests instead of dropping the 63-test
// original (CI 2026-10-05: tracks-walls over-budget 6 times in one day).
// Body shared with the other shard: tests/helpers/tracks-walls-fleet.js.
// Honours process.env.APEX_CIRCUITS via inScope() in tests/helpers/tracks-walls-roster.js.
import { sharedTest as test, expect } from "../helpers/fixtures.js";
import { allCircuitIds, inScope, shardIds } from "../helpers/tracks-walls-roster.js";
import { readBoundaryStats, boundaryViolations } from "../helpers/tracks-walls-fleet.js";

const IDS = shardIds(allCircuitIds(), 1, 2).filter((id) => inScope(id));

test.describe("Apex 26 — track boundaries (fleet B)", () => {
  for (const id of IDS) {
    test(`${id}: finite, sane driving boundary on both sides`, async ({ page }) => {
      const s = await readBoundaryStats(page, id);
      expect(boundaryViolations(id, s), `${id} driving boundary`).toEqual([]);
    });
  }
});
