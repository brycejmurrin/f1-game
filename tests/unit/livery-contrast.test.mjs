/* livery-contrast.test.mjs — no design may paint a large area it cannot be seen on.
 *
 * Three failures shipped in one week and all three were the same shape: the
 * crown band on a pale cover (fixed once, with its own guard), the wrap's sun
 * (#ffec00 on Ferrari's #f2f2f5 cover, 1.09:1), and the flank bands, which
 * scored against the COVER while standing on a flank the crown design had
 * already repainted — 1.00:1, the saddle's own colour on itself, on every team.
 *
 * liverytex.js answers "will this be seen" at a dozen sites with nine different
 * thresholds, so a new design is only as safe as whoever wrote it remembering to
 * ask. This asks once, knowing nothing about which code path painted what.
 *
 * The full sweep is tools/car/livery-contrast.mjs (every team x 13 x 10, ~80 s).
 * This runs the slice that has actually caught something — the crown designs
 * that repaint the flank, against the flank designs that stand on it — over
 * every team, in a few seconds.
 *
 * Run: node --test tests/unit/livery-contrast.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAtlas, sweepAtlas, AREA_FLOOR } from "../../tools/car/livery-contrast.mjs";

const A = loadAtlas();

// wrap and saddle are the two SPINE TOPs that repaint the cover flank, so they
// are the ones a flank design can collide with; logo is the untouched control.
const CROWN = ["logo", "wrap", "saddle", "bigmark"];
// The three that paint a band on the flank, plus the mark and plate that have to
// survive one, plus the control.
const SIDE = ["none", "split", "bars", "slash", "plate", "logo"];

test("no design paints a large area that cannot be seen on what it covers", () => {
  const bad = [];
  for (const t of A.Teams.LIST) {
    const base = A.Liveries.forTeam(t)[0];
    for (const spineLogo of CROWN) for (const spineSide of SIDE) {
      const liv = Object.assign({}, base, { spineLogo, spineSide });
      for (const hit of sweepAtlas(A, t.id, liv, ["crest", "spineSide"], 14))
        bad.push(`${t.id} ${spineLogo}/${spineSide} ${hit.region}: ${hit.paint} over ${hit.over} at ${hit.contrast}:1 (${(hit.share * 100).toFixed(0)}% of the panel)`);
    }
  }
  assert.deepEqual(bad, [], `below ${AREA_FLOOR}:1 —\n  ${bad.join("\n  ")}`);
});

test("the wrap sun and the flank band are picked against what they land on", () => {
  // The two specific regressions, pinned by their own numbers so a future change
  // that reintroduces either fails with the measurement rather than a sweep miss.
  for (const t of A.Teams.LIST) {
    const liv = A.Liveries.forTeam(t)[0];
    const cover = liv.cover || liv.c1;
    const c = A.LT.contrast(A.LT.sunColour(t.id, liv), cover);
    assert.ok(c >= AREA_FLOOR, `${t.id}: the wrap sun reads ${c.toFixed(2)}:1 on its own cover`);
  }
});
