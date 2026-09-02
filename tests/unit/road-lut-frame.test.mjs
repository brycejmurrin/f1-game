// WGX's road-marking LUT must never hand the shader a rotated track frame.
//
// WHY THIS EXISTS. A phone on the WebGPU backend showed a dashed line painted
// down the LENGTH of the road, on a circuit that renders correctly on WebGL2.
// GLX reads the per-vertex `trk` attribute (s, lateral x, half-width) and
// interpolates it; WGX cannot (a location-3 interpolator shards dashes on Dawn,
// and drawIndexed leaves vertex_index at 0 on that adapter), so it reconstructs
// (s, x, hw) per fragment from world XZ against a baked spatial LUT. Every
// WebGPU road marking comes from that reconstruction, and two things could
// break it:
//
//   1. The bake kept a BAND, not a centreline. `|lat| <= 0.85` admits every
//      vertex within 85% of the half-width, so one cross-section contributed
//      points metres apart ACROSS the ribbon. trkFromWorld builds the frame from
//      the two NEAREST samples, so it regularly picked such a pair: the tangent
//      ran across the road, and lateral x started measuring distance along the
//      lap. Measured: monza 33.9% of ribbon points, at exactly 90 degrees — on a
//      circuit with no folded geometry at all, which is what ruled out every
//      "the track runs back near itself" theory.
//   2. A full cell dropped the rest of the lap. `bin()` returned once a cell
//      held SLOT entries and `raw` is walked in `s` order, so the EARLIEST 16 by
//      lap distance won and later passes over the same ground were discarded. A
//      cell could then hold only a section tens of metres off (median 47.6 m on
//      baku), the search missed, and a LUT miss on a road draw ZEROES trk — x
//      reads 0 across the whole surface and the centre line smears down the road.
//
// WHAT IS ASSERTED. The census replays trkFromWorld's search over the REAL baked
// table (WGX.__roadLutTable, never a copy — a guard that re-derives what it
// audits agrees with itself while the shipped code is wrong) and compares the
// reconstructed tangent against the true centreline direction. The bar is the
// 90-degree class: a frame swap. Tight hairpins genuinely disagree with a 4 m
// chord by up to ~60 degrees and that is geometry, not a defect — the two
// populations are well separated, so the threshold does not need to be tuned.
//
// Pure Node: the bake is device-free and the search is arithmetic. The FULL
// 40-circuit sweep lives in `npm run test:sweeps` (~34 s); this carries a
// representative subset for the edit loop — the two street circuits that showed
// the worst rotation, plus monza, which is where the band defect was proved.

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadBake, censusCircuit } from "../../tools/road-lut-census.mjs";

// A frame SWAP is the defect. Real curvature at a hairpin tops out near 60.
const SWAP_DEG = 75;
const FAST_SET = ["monza", "baku", "singapore"];

test("the road LUT never hands the shader a rotated track frame", () => {
  const bake = loadBake();
  const bad = [];
  for (const id of FAST_SET) {
    const r = censusCircuit(id, bake);
    assert.ok(r.tested > 200, `${id}: only ${r.tested} ribbon points tested — the census stopped measuring`);
    if (r.worstDeg > SWAP_DEG) {
      bad.push(`${id}: worst ${r.worstDeg}deg at s=${r.worstAt && r.worstAt.s} ` +
               `(${r.rotated}/${r.tested} points over 45deg)`);
    }
  }
  assert.deepEqual(bad, [],
    "a baked road LUT can hand trkFromWorld a track frame rotated toward 90 degrees, which " +
    "swaps lateral x with along-track s and paints the centre line down the length of the " +
    "road on WebGPU:\n  " + bad.join("\n  "));
});
