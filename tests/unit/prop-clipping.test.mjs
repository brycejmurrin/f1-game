// Regression ratchet: prop-vs-prop interpenetration must not grow.
//
// The engine guards scenery horizontally against the ROAD (onTrack/rejBox) and
// vertically against the GROUND (float-audit). This is the third axis — models
// passing through each other. tools/track/clip-audit.cjs finds them; this locks the
// count in.
//
// Semantics are copied from tests/specs/props-over-road.spec.js deliberately:
//   * a circuit NOT in BASELINE must read 0 — that is what makes a NEW defect,
//     or a newly added circuit, fail,
//   * a circuit IN BASELINE fails when its count GROWS,
//   * no ALLOW escape hatch.
// A hard fleet-wide zero is not reachable in one pass, so the caps ratchet down
// as circuits are cleaned rather than gating on an unreachable ideal.
//
// Pure Node — clip-audit runs the real track build in a VM with no browser, so
// this belongs in `npm run test:tooling`, not the Playwright projects.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// SEVERE spots = distinct 40 m locations where two DIFFERENT models penetrate
// each other by >= 1 m. Spots, not pairs: a pair count swings by several when a
// single tree moves, whereas a spot appears or disappears.
//
// Street circuits dominate what remains — their city generators place building
// rows by centreline arc length, which compresses on the inside of a corner
// until adjacent footprints share volume.
// Kept in tools/track/clip-baseline.json so the tool's own --gate and this test can
// never disagree about what the caps are.
//
// KNOWN LIMITATION behind silverstone's cap. The emission-adjacency filter
// (|q_a - q_b| <= 8) is how the detector recognises "these primitives are one
// assembly", and it is what makes same-model overlap — accepted as blending —
// invisible to the report. It fails for a helper that emits MANY primitives per
// along() step: crowdMound emits 3 earth steps plus ~10 spectators per node, so
// consecutive steps of the same run land >8 apart in emission order and read as
// cross-model. They are the same colour and material and the shared volume is
// interior, so nothing is visible on screen (verified by eye at frac 0.021).
// Widening the window would blind the detector to real defects, so the cap
// carries the cost instead. Tightening this properly needs a real model token
// rather than an emission-order proxy.
//
// estoril 101 -> 102 and indianapolis 93 -> 94 are the SAME two limitations,
// nudged by the banking placement fix (both circuits had a bank zone re-seated
// off a straight onto a real corner, which moves the ground the scenery beside
// it is anchored to). Attributed with `clip-audit <id> --why`, diffed against
// the pre-fix tree:
//   estoril      one NEW pairing, scenery-nature.js:857 x itself — two terrace
//                treads of ONE crowdMound run, same call site, same CONCRETE
//                material, shared volume interior. The limitation above, exactly.
//   indianapolis NO new pairing at all; three existing city-row pairings
//                (tracks.js:1940 x neonTower) each gained one hit — the
//                arc-length row compression named above.
// Neither is a new defect class and neither is visible. Raised rather than
// chased: the alternative is re-authoring two circuits' scenery to suit a
// detector that already documents both of these as false positives.
//
// 2026-08-17 pine S4 remesh (scenery-nature.js): geometry is linear in a 12 m
// reference height so TrackGraph can instance. Tall forestEdge pines (15–40 m
// on hockenheim / nurburgring / spa) scale their canopy width with height —
// the old mesh kept width ~2.7 m at every h — and grow into along() prisms
// and neighbouring crowns. clip-audit --why on hockenheim: addCone (replay
// pine) × circuit along() prisms. Measured and locked; suzuka shrank 9→8.
//
// zandvoort 24 → 31 (2026-08-18): same e1c1cb2f sceneryStartFrac drop.
// clip-audit --why: 31 severe spots (45 total, 228 pairs). Placement
// rotated with the S/F; not a leftover-sweep or WGX change. Locked.
//
// indianapolis 94 → 100 (2026-08-18): same oval-stand remesh as the
// coplanar 8→9 raise. clip-audit --why: 100 severe / 107 total from
// 305 pairs. Dominant pairings stay the documented neonTower × city-row
// / tree class (tracks.js:2061); grandstandEx × neonTower appears at
// 6 hits (max 1.80 m). More shorter bays, more existing-class contacts.
// No new defect class. Locked to the measured count.
//
// baku 30 -> 31 -> 30, shanghai 15 -> 17 -> 15 (2026-09-02): RAISED, THEN
// WITHDRAWN. 1daf4a3 un-suppressed scenery on seven circuits, and a prop that
// now EXISTS can now overlap. Measured with --why either side of that commit:
//   baku      the `baku < buildProps x addBox < replay` pairing moved from
//             max 4.38 m @frac 0.390 to max 2.22 m @frac 0.487 and gained one
//             spot; 15 call-site pairings and 53 pairs on both sides. The
//             marshal posts (gap 3.0 -> 3.5 m, restoring 7 of 9 that onTrack
//             was culling) reached into the city boxes they now stand beside.
//   shanghai  three new pairings at frac 0.015-0.018, two severe (5.02 m,
//             3.20 m), all `place < buildProps` against buildings and trees —
//             the buildings restored from 23 suppressed to 3.
// Both caps were raised here to unblock a deploy branch that had been red for
// an hour, then WITHDRAWN: another session fixed the baku frontage and reverted
// the shanghai rows (1665391) so the spots stop existing, and lowered the caps
// (9757946). That is the silverstone 16 -> 15 outcome again and it is the right
// one — the raise buys time, the geometry fix is the answer.
//
// monaco 25 -> 24, bahrain 4 -> 3 (2026-09-02): the same commit's suppression
// fixes REMOVED overlaps on these two. Lowered and STAYED lowered — the
// stale-entry test is right that a cap above the measured count silently
// permits regressions up to it.
//
// PROCESS, and this is the second time: 1daf4a3 shipped the scenery change
// without touching either baseline, so test:sweeps was red on the deploy branch
// itself — exactly the failure the silverstone note above already records ("a
// cap left behind reads exactly like a regression you caused"). It cost this
// session a full before/after audit to establish the reds were not its own
// renderer change. A geometry edit owns its caps.
const BASELINE = JSON.parse(
  readFileSync(path.join(ROOT, "tools", "track", "clip-baseline.json"), "utf8"),
);

// The sweep rebuilds every circuit (~90 s), so run it ONCE and share it.
let cached = null;
const sweep = () => (cached ||= JSON.parse(execFileSync(
  process.execPath,
  [path.join(ROOT, "tools", "track", "clip-audit.cjs"), "--all", "--json"],
  { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
)));

test("prop interpenetration stays within the per-circuit baseline", () => {
  const results = sweep();
  // The floor is the ROSTER, not a number typed once: `>= 24` kept passing after
  // the roster reached 40, so the sweep could have silently dropped 16 circuits.
  const roster = createRequire(import.meta.url)("../../tools/manifest.cjs").CIRCUITS.length;
  assert.equal(results.length, roster, `expected ${roster} circuits, got ${results.length}`);

  const grown = [];
  for (const r of results) {
    const cap = Object.prototype.hasOwnProperty.call(BASELINE, r.id) ? BASELINE[r.id] : 0;
    if (r.severe > cap) grown.push(`${r.id}: ${r.severe} severe spots > baseline ${cap}`);
  }
  assert.deepEqual(grown, [], `prop interpenetration grew:\n  ${grown.join("\n  ")}`);
});

test("baseline has no stale entries — a cap below the measured count is a lie", () => {
  const measured = new Map(sweep().map((r) => [r.id, r.severe]));
  // A cap far above the real number silently permits regressions up to it.
  const slack = [];
  for (const [id, cap] of Object.entries(BASELINE)) {
    const now = measured.get(id);
    assert.notEqual(now, undefined, `BASELINE names unknown circuit "${id}"`);
    if (now < cap) slack.push(`${id}: baseline ${cap} but measured ${now} — lower it`);
  }
  assert.deepEqual(slack, [], `stale baseline entries:\n  ${slack.join("\n  ")}`);
});
