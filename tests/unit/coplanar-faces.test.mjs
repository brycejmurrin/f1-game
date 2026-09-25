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
// face rasterised and cannot fight. tools/track/coplanar-audit.cjs gates on
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
const { overlapArea } = createRequire(import.meta.url)("../../tools/track/coplanar-audit.cjs");

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
// fuji 16 -> 17, hungaroring 18 -> 20, istanbul 4 -> 5, magny_cours 1 -> 2,
// redbull 8 -> 9 (2026-09-16), and albert_park 8 -> 7 for the stale-cap test:
// NOT raised to admit new work. Bisected to 80acf93's pit-lane lengths alone
// (TrackPit ENTRY_MAX 400 -> 260, EXIT_M 130 -> 110; the same tree with only
// those two constants restored reads istanbul 4 again, while its mesh.js and
// pits.js hunks restored one at a time move nothing). A shorter lane slides
// every circuit's complex along the road, and on these five two engine mesh
// faces meet on one plane where the complex newly lands — istanbul's is 18 m
// before the new entry road, 35 m off the pit side, both faces from the
// track builder (no emitter stack). The lane length is a deliberate design
// change, the coincidences are positional, and the fix is per-circuit or an
// engine standoff between the complex and the landform: the pit-lane
// lineage's to make. Recorded so the caps stop lying about the tree.
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
//
// fuji 16→17, hungaroring 18→20, istanbul 4→5, magny_cours 1→2, redbull 8→9,
// albert_park 8→7 (2026-09-16): the pit window shrank (TrackPit ENTRY_MAX
// 400→260, EXIT_M 130→110, 80acf93), so the complex supersedes ~160 m less of
// each circuit's own scenery and the kit/city masses that stood there stand
// again, carrying the same-plane seams they always had. Bisected, not
// assumed: the deployed tree with only the old window restored reads every
// one of these at its old cap (albert_park back to 8), and the raw pairs are
// stacked building sections (41 x 4.8 x 7.6 m, 49 x 6.7 x 35 m), not pit
// prims. Restored scenery is the point of the shorter lane; the seams are the
// generators' open defect, as the header says.
//
// hockenheim 47→48 (2026-09-16, evening): the SAME cause one cut further on.
// `TrackPit.window` now leaves MOUTH_RUN (20 m) of straight between the last
// corner and the entry road's mouth, so on the 21 circuits whose mouth sat
// inside a corner the window opens later and is shorter still — Hockenheim's
// among them. One more of its own kit masses stands where the complex used to
// supersede it. Measured, and bisected against the lamp work in the same
// commit: `coplanar-audit hockenheim --why` reads 48 spots / 62 pairs, ONE
// `trk` call site, maxArea 73.1 m², minGap 0.0 mm — stacked building sections,
// the same class as the six above, no pit prim among them; and the count read
// 48 on both sweeps of that commit, before and after the entrance lamps moved
// from the mouth to the entry line, so the lamps are not in it.
//
// EVERY cap lowered on 2026-09-22 (fleet 541 -> 321 spots, 30 circuits down,
// none up) when overlapArea stopped measuring in-plane bounding rectangles and
// started intersecting the real convex hulls — see the metric tests at the foot
// of this file. Nothing moved in js/; the old numbers counted pairs whose faces
// never overlapped. The biggest corrections are the circuits richest in rotated
// faces: hockenheim 48 -> 5, madrid 65 -> 25, sochi 42 -> 12, dijon 33 -> 4,
// hungaroring 20 -> 1. The tail that survives the honest metric is real
// geometry, and the notes above still describe how each circuit earned it.
//
// 2026-09-22, second pass — 321 -> 199 fleet spots, 12 circuits down, ONE up:
//   * spectatorHill's layered banks get a per-CALL slot (nature.js), not a hash
//     of opts.h: okayama 25 -> 1, and the three clayCut() pairs that owned 400
//     of its coplanar pairs are gone.
//   * along() carries a seam TAG (structures.js): abutting runs share their end
//     node and the second, byte-identical panel there is dropped. jeddah's
//     six-block canyon, silverstone 12 -> 4, donington 5 -> 2.
//   * jeddah's canyon moved from gap 3.50 to 4.35 — at 3.50 it stood inside the
//     engine's own street barrier. 56 -> 3.
//   * madrid's arcade openings and ifema stand tiers no longer share a plane
//     with the facade / with each other. 25 -> 5.
//   * indianapolis's oval retaining wall uses along()'s pitch, not a padded
//     9.6 m constant that overlapped its neighbour by 0.6 m. 9 -> 2.
// spa 1 -> 2 is the one RAISE and it is paid for: the hill slot slides a bank
// 3-43 mm outward, and on spa one tread's face lands 1.8 mm from a place()
// prop it used to clear. Two pairs, fighting from 96 m, against 122 spots
// removed everywhere else. Measured, not assumed — coplanar-audit --why names
// the prop (js/track/scenery/build-props.js:1597).
// 2026-09-24: FIGHT_MAX 150 -> 300 m re-baselined every circuit at the wider
// window (584 spots measured at 300 m before TrackGeom.MIN_SEP, 289 after). At
// the old 150 m window no circuit grew (106 -> 99); every raise here is a pair
// the wider window now SEES, not a new fight.
// Same day, the 11 surveyed-elevation circuits got their road heights from
// the survey by ARC fraction instead of point index (fuji's profile was 0.29
// lap out of place, 15 m wrong): their ground moved by metres and the counts
// reshuffled — anderstorp/dijon/okayama down, fuji 19 -> 21 (a crowd band
// 7.5 mm off its stand, fighting from 194 m); fleet 289 -> 287.
// 2026-09-24: SRTM bake for interlagos/suzuka/redbull/hungaroring/cota —
// hungaroring 3 -> 5, redbull 10 -> 11 (ground moved under existing props;
// floaters fixed separately; coplanar spots are residual same-facing pairs).
// Batch 2 (same day): stepped multi-tier shells + MIN_SEP slots for place(),
// crowdBand and stands, draped groundPatch, the run-off shelf and the R3
// centreline fixes: fleet 286 -> 245 (fuji 21 -> 10, watkins_glen 4 -> 0,
// madrid 11 -> 7). Seven circuits rose by 1-3, each a slot or a moved road
// landing a prop by chance on an unrelated face (baku, donington, indianapolis,
// istanbul, jerez, nurburgring, portimao) — a fixed slot moves coincidences,
// it cannot remove them.
// Both re-measured together on the merged tree.
const BASELINE = JSON.parse(
  readFileSync(path.join(ROOT, "tools", "track", "coplanar-baseline.json"), "utf8"),
);

// The sweep rebuilds every circuit, so run it ONCE and share it — and run the
// default AND the --overhead analysis on that one build per circuit (`--both`):
// the two used to be separate `--all` runs, rebuilding the fleet twice. Each
// half is exactly what its own `--json` / `--json --overhead` run prints.
let cached = null;
const bothSweeps = () => (cached ||= JSON.parse(execFileSync(
  process.execPath,
  [path.join(ROOT, "tools", "track", "coplanar-audit.cjs"), "--all", "--json", "--both"],
  { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
)));
const sweep = () => bothSweeps().default;

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

// --- overhead undersides and tops (2026-09-24) ------------------------------
//
// The sweep above skips every face with |n.y| >= 0.5, so no deck underside,
// soffit, gantry bottom or tunnel roof had ever been checked. Two madrid bridges
// drew a thin soffit span at their deck's own clearance: both undersides in one
// plane, 0.0 mm apart, 216 and 203 m2, flickering overhead as a car drove under.
// monaco's tunnel roof, haunch and springing all topped out at exactly 7.80 m
// (124 pairs) and miami's Turnpike pier shafts shared their caps' top plane.
// `--overhead` audits only horizontal faces above road + 3 m within hw + 8 m,
// up- and down-facing, and this holds it at the exception list below — ZERO
// everywhere else, so a new overhead layer drawn in its neighbour's plane fails.
//
// The one exception is not an overhead structure: on madrid a generic street
// lamp's arm (buildProps, js/track/tracks.js) stands 2.1 mm off a sloped face of
// the El Bunker wall (madrid.js groundedSegments "madrid-el-bunker"), 0.4 m2,
// fighting only beyond 102 m. Exact, both ways, like the baselines above.
// At the 300 m window (FIGHT_MAX, 2026-09-24) its sibling arm 4.8 mm off the
// same wall (0.3 m2, fights from 155 m) counts too: madrid 2. Both cleared the
// same day when the terrain stopped trenching the verge of a descending road
// (mesh.js channel carve): the lamps ground on that terrain. None left.
const OVERHEAD_BASELINE = {};
const overheadSweep = () => bothSweeps().overhead;

test("overhead structures: no horizontal face shares its neighbour's plane", () => {
  const results = overheadSweep();
  const roster = createRequire(import.meta.url)("../../tools/manifest.cjs").CIRCUITS.length;
  assert.equal(results.length, roster, `expected ${roster} circuits, got ${results.length}`);
  const off = [];
  for (const r of results) {
    const cap = OVERHEAD_BASELINE[r.id] || 0;
    if (r.spots !== cap) off.push(`${r.id}: ${r.spots} overhead spot(s), expected ${cap}`);
  }
  assert.deepEqual(off, [], "overhead coplanar faces changed — run " +
    "`node tools/track/coplanar-audit.cjs <id> --overhead --why` to name the emitters:\n  " +
    off.join("\n  "));
});

// --- the overlap metric itself (2026-09-22) --------------------------------
//
// `spots` above is only as honest as the area that gates them: AREA_MIN drops a
// pair under 2 m2, and until this was fixed the area was the intersection of the
// two faces' in-plane BOUNDING RECTANGLES. A face rotated within its own plane —
// a ferris-wheel spoke, a diagonal brace, a canted panel — has an in-plane AABB
// far larger than itself, so two 0.28 m bars crossing near a hub reported
// 1052 m2 (vegas). The pair was real; the number was fiction, and it sorted a
// lattice above a genuinely flush wall. overlapArea now intersects the two
// convex hulls, which is exact for every face the emitters produce.
const rect = (x0, y0, x1, y1) => ({ u1: [x0, x1], u2: [y0, y1], pts: [x0, y0, x1, y0, x1, y1, x0, y1] });

test("overlapArea is the real overlap, exact on the shapes the emitters emit", () => {
  const near = (got, want, msg) => assert.ok(Math.abs(got - want) < 1e-9, `${msg}: got ${got}, want ${want}`);
  near(overlapArea(rect(0, 0, 1, 1), rect(0, 0, 1, 1)), 1, "identical unit squares");
  near(overlapArea(rect(0, 0, 1, 1), rect(0.5, 0, 1.5, 1)), 0.5, "half-offset squares");
  near(overlapArea(rect(0, 0, 1, 1), rect(2, 2, 3, 3)), 0, "disjoint squares");
  // A cross: two 0.1 m bars at right angles meet in one 0.1 x 0.1 square.
  near(overlapArea(rect(0, 0.45, 1, 0.55), rect(0.45, 0, 0.55, 1)), 0.01, "crossed bars");
});

test("two crossing diagonal bars report their crossing, not their bounding boxes", () => {
  // The vegas ferris-wheel case, reduced: 10 m x 0.28 m members at +-0.4 rad.
  const bar = (ang) => {
    const c = Math.cos(ang), s = Math.sin(ang);
    const pts = [];
    for (const [x, y] of [[-5, -0.14], [5, -0.14], [5, 0.14], [-5, 0.14]])
      pts.push(x * c - y * s, x * s + y * c);
    const xs = pts.filter((_, i) => i % 2 === 0), ys = pts.filter((_, i) => i % 2 === 1);
    return { u1: [Math.min(...xs), Math.max(...xs)], u2: [Math.min(...ys), Math.max(...ys)], pts };
  };
  const a = bar(0.4), b = bar(-0.4);
  const boxProduct = (a.u1[1] - a.u1[0]) * (a.u2[1] - a.u2[0]);
  const real = overlapArea(a, b);
  assert.ok(real > 0.05 && real < 0.2, `a 0.28 m crossing is ~0.1 m2, got ${real}`);
  assert.ok(boxProduct > 30, "the in-plane bounding box really is that much bigger");
  assert.ok(real < boxProduct / 100, "the old metric over-reported this by two orders of magnitude");
});
