"use strict";
// solid-in-road.cjs — find GROUNDED solids standing on the tarmac a car races on.
// @doc Solid-in-the-road audit: `solidsInRoad(track, prims)` lists shipped prop/glass primitives whose XZ hull stands on the tarmac.
// @skill scenery-dress
//
// The sibling of tests/unit/props-over-road.test.mjs's surface audit, for the
// case that one is blind to: a pillar, post or box footed ON the road. That
// audit asks "is there a face over the sample, below CEIL?", reading the
// barycentric height of props triangles — a vertical box whose top face is
// above CEIL and whose side faces project to slivers reads nothing there. The
// suzuka crossover pillar (fixed in 30359c708) stood in the racing line and
// passed it.
//
// THE RULE. For every SHIPPED primitive (tools/lib/track-build-vm.cjs
// `shipped()`) whose buffer is track.propsGeo or track.glassGeo:
//   - take the convex hull of its real XZ vertices (an oriented footprint, not
//     an AABB — a diagonal wall's bbox covers the road it runs beside);
//   - sample the tarmac at lateral -0.9..+0.9 * track.hw in 0.1 steps, every
//     <= 1 m along the arc (linear between centreline nodes);
//   - road height = centreline py, raised by |s| * lift / 2 on banked nodes —
//     conservative: it can only put the road HIGHER, so a grounded test
//     against it never misses a footing on the low side of a bank;
//   - a HIT is a sample inside the hull by >= INSET, with the primitive
//     GROUNDED (minY <= road + TOL) and its y-span reaching into
//     [road + TOL, road + CEIL] — a solid a car would hit. Overhead gantries
//     (minY above the band) and ground-level dressing (maxY below TOL) are not.
//
// Returns one record per offending primitive, its representative sample the
// one nearest the centreline.

const TOL = 0.2, CEIL = 5.0, INSET = 0.05, CELL = 20, STEP_M = 1.0;
const LAD = []; for (let s = -0.9; s <= 0.9001; s += 0.1) LAD.push(+s.toFixed(2));

/** Andrew's monotone chain on [x, z] pairs; CCW, no collinear points. */
function hull(pts) {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop();
    up.push(p);
  }
  up.pop(); lo.pop(); return lo.concat(up);
}

/** Inside a CCW hull by at least `inset` metres (a degenerate hull holds nothing). */
function inHull(h, x, z, inset) {
  if (h.length < 3) return false;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length];
    const ex = b[0] - a[0], ez = b[1] - a[1], L = Math.hypot(ex, ez) || 1;
    if ((ex * (z - a[1]) - ez * (x - a[0])) / L < inset) return false;
  }
  return true;
}

/** Tarmac samples in a uniform XZ grid: {x, z, y, k, s}. */
function tarmacGrid(t) {
  const n = t.n, lift = t.bankP && t.bankP.lift, g = new Map();
  const SUB = Math.max(1, Math.ceil(t.total / n / STEP_M));
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    for (let j = 0; j < SUB; j++) {
      const f = j / SUB, L = (a) => a[k] + (a[k1] - a[k]) * f;
      const cx = L(t.px), cz = L(t.pz), rx = L(t.rx), rz = L(t.rz), hw = L(t.hw), py = L(t.py);
      const bank = lift && lift[k] > 0 ? lift[k] / 2 : 0;
      for (const s of LAD) {
        const x = cx + rx * s * hw, z = cz + rz * s * hw;
        const key = Math.floor(x / CELL) * 1e6 + Math.floor(z / CELL);
        let a = g.get(key); if (!a) g.set(key, a = []);
        a.push({ x, z, k, s, y: py + Math.abs(s) * bank });
      }
    }
  }
  return g;
}

/** Every shipped props/glass primitive of `track` standing on its tarmac.
 *  `prims` = shipped(ctx.prims, ctx.liveBufs) for that build (others are skipped). */
function solidsInRoad(track, prims) {
  const t = track, g = tarmacGrid(t), hits = [];
  for (const p of prims) {
    if (!p.buf || (p.buf !== t.propsGeo && p.buf !== t.glassGeo)) continue;
    const cand = [];
    for (let ix = Math.floor(p.minX / CELL); ix <= Math.floor(p.maxX / CELL); ix++)
      for (let iz = Math.floor(p.minZ / CELL); iz <= Math.floor(p.maxZ / CELL); iz++) {
        const a = g.get(ix * 1e6 + iz); if (!a) continue;
        for (const q of a) {
          if (q.x < p.minX || q.x > p.maxX || q.z < p.minZ || q.z > p.maxZ) continue;
          if (p.minY > q.y + TOL) continue;                         // not grounded here
          if (p.maxY > q.y + TOL && p.minY < q.y + CEIL) cand.push(q); // reaches into the band
        }
      }
    if (!cand.length) continue;
    const pos = p.buf.pos._data || p.buf.pos, pts = [];
    for (let i = p.s; i < p.e; i += 3) pts.push([pos[i], pos[i + 2]]);
    const h = hull(pts);
    const inside = cand.filter((q) => inHull(h, q.x, q.z, INSET));
    if (!inside.length) continue;
    const w = inside.reduce((a, b) => (Math.abs(a.s) < Math.abs(b.s) ? a : b));
    hits.push({
      name: p.name, frac: +(w.k / t.n).toFixed(3), lat: w.s, samples: inside.length,
      yspan: [+(p.minY - w.y).toFixed(2), +(p.maxY - w.y).toFixed(2)],
      xz: [+(p.maxX - p.minX).toFixed(1), +(p.maxZ - p.minZ).toFixed(1)], mat: p.mat,
    });
  }
  return hits;
}

module.exports = { solidsInRoad, hull, inHull, TOL, CEIL, INSET };
