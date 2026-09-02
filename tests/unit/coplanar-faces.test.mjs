// Regression ratchet: SAME-FACING coplanar faces must not grow.
//
// Sibling to prop-clipping.test.mjs, and deliberately a separate gate. That one
// measures interpenetration DEPTH and discards everything shallower than 0.5 m
// as noise — but z-fighting lives at penetration ~= 0, exactly the bucket it
// throws away. Two faces at the same depth, both pointing the same way, both
// drawn, both writing depth: they flicker at EVERY distance, because no depth
// buffer can separate two identical depths.
//
// Only same-facing pairs count. Back-face culling is on and addBox winds the
// outward face, so an anti-parallel coplanar pair — a window pane's inner face
// against its wall, a stacked mass section, a kerb on terrain — has exactly one
// face rasterised and cannot fight. tools/coplanar-audit.cjs gates on
// dot(nA,nB) >= 0.999 so that entire legitimate population is excluded by
// construction rather than by heuristic.
//
// Semantics match prop-clipping deliberately:
//   * a circuit NOT in BASELINE must read 0 — that is what makes a NEW defect,
//     or a newly added circuit, fail,
//   * a circuit IN BASELINE fails when its count GROWS,
//   * no ALLOW escape hatch.
//
// Pure Node — coplanar-audit runs the real track build in a VM with no browser.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// SPOTS = distinct 40 m locations carrying at least one same-facing coplanar
// pair. Spots, not pairs, for the same reason prop-clipping uses them: a pair
// count swings by several when one prop moves, whereas a spot appears or
// disappears.
//
// What remains is dominated by the street circuits' city generator, which
// places building rows by centreline arc length; on the inside of a corner that
// compresses until adjacent footprints share volume and their facades — panes,
// rails, mullions — end up on one plane. That needs a PLACEMENT fix, not a
// standoff constant, so the caps carry it until then.
//
// paul_ricard 9 -> 12 and montreal 7 -> 9 (2026-08-14): NOT raised to admit new
// work. Both were already failing on the deploy lineage before the grounding
// branch met it — measured on `origin/claude/f1-game-project-26h3ng` in an
// isolated worktree, which reads 12 and 9 against its own caps of 9 and 7. The
// grounding branch measures the same two numbers, so it neither caused nor
// worsened them, and reverting the whole engine half of it (place()'s terrainYAt
// anchor) moved neither. Recorded here so the caps stop lying about the tree;
// the underlying same-facing pairs are a real open defect on that lineage.
//
//
// vegas 66 -> 67 (2026-08-08): the street-barrier chord-cut fix splits apex
// spans into two single-node panels that follow the curve, and the new joint
// abuts two same-height panel tops — the identical seam class every existing
// panel joint on the lap already contributes. The alternative was a 1.1 m
// barrier hanging over the racing surface (the props-over-road failure this
// baseline's +1 paid for). A deliberate trade, not drift.
//
// silverstone 16 -> 15 (2026-08-17, same day as the 15 -> 16 raise): the +1
// from the start-gantry crossbar fix (4f109f76) was not the mast-cap seam the
// raise recorded — measured with --why before/after, it was the crossbar
// sharing the typed overheadSpan's exact planes at the same frac (top at
// clearance+thickness = H+0.70, front/back at ±depth/2 = ±0.7): two
// same-facing ~18 m² faces at 0.0 mm over the start grid. Sizing the crossbar
// 0.1 m inside the span on those axes ([50,2.0,1.2] centred 0.75 below the
// beam) removes the pair outright, so the baseline goes back down instead of
// carrying a real z-fight as a recorded trade. Worth keeping from the raise:
// 4f109f76 shipped the geometry change WITHOUT touching this cap, so
// test:sweeps was red on the deploy branch itself for the whole window — two
// sessions independently measured 16 in isolated worktrees and each assumed it
// was their own merge. A cap left behind reads exactly like a regression you
// caused.
//
// 2026-08-17 pine S4 remesh: hockenheim 53→54 (one new spot from scaled
// forestEdge canopies). monza 12→11, istanbul 6→5, mugello 1→0 — lower.
//
// zandvoort 3 → 5 (2026-08-18): e1c1cb2f dropped sceneryStartFrac so
// dressing matches the real S/F. The shift re-seats existing dunes /
// grandstands; coplanar-audit --why is still 5 same-facing `trk` spots
// (maxArea 16.7 m², minGap 0). No new defect class. Cap raised to the
// measured count so it stops lying about the tree.
//
// indianapolis 8 → 9 (2026-08-18): oval-stand remesh that pulled the
// long infield chords off the racing line (OUTER_BAYS 30→40, inner
// 6×96 m → 12×46 m). coplanar-audit --why: 9 spots / 25 same-facing
// pairs, all `trk`, maxArea 3.5 m², minGap 0 — adjacent shorter-bay
// tops on one plane. Same seam class as the previous 8-bay joints;
// the extra spot is the extra joint. Trade for props-over-road.
// paul_ricard 12→6, montreal 9→7, redbull 9→7 (2026-08-26): along()'s full-lap
// walk revisited its start node (`|| n` span with i <= n) and emitted a second
// byte-identical panel there — a coincident duplicate at the seam on every
// circuit whose step divides n. Fixed in scenery-structures.js (span n-1 on a
// full lap); these spots were those duplicates. Lowered to the measured counts.
//
// baku 13 -> 14 -> 13 (2026-09-02): RAISED, THEN WITHDRAWN. 1daf4a3 restored
// scenery the guards had been suppressing — baku's marshal posts were culled
// 7 of 9 by `onTrack(c, 3)`, which measures to the hut CENTRE, so the gap went
// 3.0 -> 3.5 m. Seven posts that did not exist now did, and one shared a plane
// with a roadside city box. This session measured that (13 -> 14 spots, 23 -> 24
// pairs, same `trk` call site, maxArea unchanged 245.9 m2, minGap 0.0 mm) and
// raised the cap to unblock a deploy branch that had been red for an hour.
// Another session then did the better thing and fixed the FRONTAGE so the spot
// stops existing (1665391), and lowered the cap back (9757946). Kept as a note
// rather than deleted, because the ordering is the lesson: a raise is the
// fallback, not the first move, and "restored props cost overlap spots" is a
// trade worth one more attempt at the geometry before it is written down.
const BASELINE = JSON.parse(
  readFileSync(path.join(ROOT, "tools", "coplanar-baseline.json"), "utf8"),
);

// The sweep rebuilds every circuit, so run it ONCE and share it.
let cached = null;
const sweep = () => (cached ||= JSON.parse(execFileSync(
  process.execPath,
  [path.join(ROOT, "tools", "coplanar-audit.cjs"), "--all", "--json"],
  { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
)));

test("same-facing coplanar faces stay within the per-circuit baseline", () => {
  const results = sweep();
  // The floor is the ROSTER, not a number typed once: `>= 24` kept passing after
  // the roster reached 40, so the sweep could have silently dropped 16 circuits.
  const roster = createRequire(import.meta.url)("../../tools/manifest.cjs").CIRCUITS.length;
  assert.equal(results.length, roster, `expected ${roster} circuits, got ${results.length}`);

  const grown = [];
  for (const r of results) {
    const cap = Object.prototype.hasOwnProperty.call(BASELINE, r.id) ? BASELINE[r.id] : 0;
    if (r.spots > cap) grown.push(`${r.id}: ${r.spots} spots > baseline ${cap}`);
  }
  assert.deepEqual(grown, [], `coplanar faces grew:\n  ${grown.join("\n  ")}`);
});

test("baseline has no stale entries — a cap above the measured count is a lie", () => {
  const measured = new Map(sweep().map((r) => [r.id, r.spots]));
  const slack = [];
  for (const [id, cap] of Object.entries(BASELINE)) {
    const now = measured.get(id);
    assert.notEqual(now, undefined, `BASELINE names unknown circuit "${id}"`);
    if (now < cap) slack.push(`${id}: baseline ${cap} but measured ${now} — lower it`);
  }
  assert.deepEqual(slack, [], `stale baseline entries:\n  ${slack.join("\n  ")}`);
});
