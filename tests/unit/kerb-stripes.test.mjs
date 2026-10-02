// kerb-stripes — the kerb ribbon's stripes are hard-edged, and the asphalt's
// rubber band follows the baked racing line.
//
// Kerb colour is per vertex and interpolates across each quad. buildKerbs's
// first cut laid SUB evenly spaced sub-rings per node span, each coloured by
// its own arc: ~1.33 m apart against a 1.6 m stripe, so three kerb quads in
// four were red<->white RAMPS with an irregular period (measured 2026-10-01:
// monza 1606 of 2052 kerb triangles, silverstone 2838 of 3630). Now a ring
// lands exactly on every stripe boundary and is emitted twice (the colour
// ending there, then the colour starting there), so every kerb triangle is one
// colour. The racing-line wear was a fixed centre band (columns 5-8) that
// ignored track.line; it now darkens the asphalt within ~1.2 m of the line,
// so through a corner the rubber sits where the cars actually run.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { buildContext } = require(path.join(ROOT, "tools/track/verify-track.cjs"));

let Tracks = null;
const build = (id) => {
  Tracks = Tracks || buildContext(null, { quiet: true });
  const def = Tracks.LIST.find((d) => d.id === id);
  assert.ok(def, `${id} is not in Tracks.LIST`);
  return { def, track: Tracks.build(def) };
};

const near = (a, b) => Math.abs(a - b) < 1e-6;

test("every kerb triangle is one colour — stripes have hard edges, not ramps", () => {
  for (const id of ["monza", "silverstone"]) {
    const { def, track } = build(id);
    const g = track.roadGeo, pal = def.palette;
    const same = (i, c) => near(g.col[i * 3], c[0]) && near(g.col[i * 3 + 1], c[1]) && near(g.col[i * 3 + 2], c[2]);
    const kind = (i) => same(i, pal.kerbA) ? 1 : same(i, pal.kerbB) ? 2 : 0;
    let kerbTris = 0, mixed = 0, degenerate = 0;
    for (let t = 0; t < g.idx.length; t += 3) {
      const ia = g.idx[t], ib = g.idx[t + 1], ic = g.idx[t + 2];
      const a = kind(ia), b = kind(ib), c = kind(ic);
      if (!a || !b || !c) continue;
      kerbTris++;
      if (!(a === b && b === c)) mixed++;
      // The boundary's two coincident rings must not be stitched: a zero-area
      // quad is a free triangle count and a z-fighting seam.
      const P = (i) => [g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]];
      const pa = P(ia), pb = P(ib), pc = P(ic);
      const ux = pb[0] - pa[0], uy = pb[1] - pa[1], uz = pb[2] - pa[2];
      const vx = pc[0] - pa[0], vy = pc[1] - pa[1], vz = pc[2] - pa[2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      if (cx * cx + cy * cy + cz * cz < 1e-12) degenerate++;
    }
    assert.ok(kerbTris > 1000, `${id}: only ${kerbTris} kerb triangles found — the colour match is broken`);
    assert.equal(mixed, 0, `${id}: ${mixed} of ${kerbTris} kerb triangles blend two stripe colours`);
    assert.equal(degenerate, 0, `${id}: ${degenerate} zero-area kerb triangles (the boundary pair was stitched)`);
    // Both colours are present: a one-colour kerb would pass the test above vacuously.
    const kinds = new Set();
    for (let i = 0; i < g.col.length / 3 && kinds.size < 2; i++) { const k = kind(i); if (k) kinds.add(k); }
    assert.equal(kinds.size, 2, `${id}: the kerb ribbon carries only one of its two stripe colours`);
  }
});

test("the asphalt's rubber band sits on the racing line's side, not the road centre", () => {
  const { track } = build("monza");
  const g = track.roadGeo, n = track.n, V = 14;
  assert.ok(track.line && track.line.length === n, "TrackLine.bake must have run before buildRoad");
  // buildRoad emits V vertices per node, in column order, before any ribbon.
  // The asphalt columns sit at the centre (5-8) and the edges (2-3, 10-11), so
  // the band cannot be read at metre resolution; what it must get right is the
  // SIDE: where the line runs toward one edge, that edge's inner column (3 or
  // 10) is darker than the opposite one. (Centre-vs-edge is not asserted: with
  // the line 2-3 m out, the centre columns are often the nearer ones.)
  const lum = (i) => g.col[i * 3] + g.col[i * 3 + 1] + g.col[i * 3 + 2];
  let checked = 0, side = 0;
  for (let k = 0; k < n; k += 5) {
    const lx = track.line[k];
    if (Math.abs(lx) < 2.0) continue;   // near the centre there is no side to pick
    const near = lx < 0 ? 3 : 10, far = lx < 0 ? 10 : 3;
    const lNear = lum(k * V + near), lFar = lum(k * V + far);
    checked++;
    if (lNear < lFar) side++;
  }
  assert.ok(checked > 30, `only ${checked} off-centre nodes sampled on monza`);
  assert.ok(side / checked > 0.95,
    `the line's edge column was darker than the opposite edge at only ${side}/${checked} off-centre nodes`);
});
