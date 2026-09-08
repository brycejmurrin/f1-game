/* Point → triangle distance, for decal-placement guards.
 *
 * A decal is "on the car" only if every one of its vertices is within a few
 * millimetres of a real triangle. A bounding box will not do: tests/unit and
 * tests/specs both shipped a guard that measured a decal against an element's
 * axis-aligned BOX, and a 19.5-degree rotation made that box tall enough to
 * swallow a 100 mm error (the rear-wing sponsor band). Measure the surface.
 *
 * Ericson, Real-Time Collision Detection §5.1.5.
 */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.sqrt(dot(a, a));

export function ptTri(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return len(ap);
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return len(bp);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return len(sub(p, [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v])); }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return len(cp);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return len(sub(p, [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w])); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return len(sub(p, [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]));
  }
  const n = cross(ab, ac), nl = len(n);
  return nl < 1e-12 ? len(ap) : Math.abs(dot(n, ap)) / nl;
}

// Nearest distance from a point to any triangle in a [[a,b,c], …] list.
export const nearest = (p, tris) => {
  let best = Infinity;
  for (const T of tris) { const d = ptTri(p, T[0], T[1], T[2]); if (d < best) best = d; }
  return best;
};

// Triangles of a {pos, idx} mesh, optionally filtered by a per-vertex predicate
// (every vertex must pass) so a search stays cheap and honest.
export function trisOf(mesh, keep) {
  const out = [];
  for (let i = 0; i + 2 < mesh.idx.length; i += 3) {
    const T = [0, 1, 2].map((k) => {
      const j = mesh.idx[i + k];
      return [mesh.pos[j * 3], mesh.pos[j * 3 + 1], mesh.pos[j * 3 + 2]];
    });
    if (!keep || T.every(keep)) out.push(T);
  }
  return out;
}
