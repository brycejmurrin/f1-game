"use strict";
// @doc Position-based road-ribbon checks (running width/advance, skirt depth+attachment, vertical continuity) for verify-track.
//
// buildRoad lays the main ribbon as n nodes x V=14 columns, then a seam ring (V verts),
// then two edge skirts (columns 0 and 13) of n top/bottom pairs each. Columns 2..11 are
// the running surface. verify-track's index/duplicate/fold checks prove the triangles
// exist and are not reversed; they cannot tell that a section has collapsed to zero
// area, that every skirt bottom sits on its top, or that one vertex is 50 m high. These
// metrics are read straight from the positions (#1943).
const V = 14;

function roadPositionMetrics(track) {
  const g = track.roadGeo;
  const P = g.pos._data || g.pos, n = track.n;
  const at = (v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
  const col = (k, v) => k * V + v;

  // Running-surface width (XZ, left to right running-surface edge) and zero-area quads.
  let minRunWidth = Infinity, minRunWidthNode = -1;
  for (let k = 0; k < n; k++) {
    const a = at(col(k, 2)), b = at(col(k, 11));
    const w = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (w < minRunWidth) { minRunWidth = w; minRunWidthNode = k; }
  }
  // Longitudinal collapse: the ribbon's own step along the centre columns against the node spacing.
  // (Zero-area triangles are NOT banned: fold-clamped rails and the pit/seam hatch coincide on
  // purpose, 0-18 per circuit.)
  let minAdvance = Infinity, minAdvanceNode = -1;
  const ds = track.total / n;
  for (let k = 0; k < n; k++) {
    const a = at(col(k, 5)), b = at(col((k + 1) % n, 5));
    const r = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / ds;
    if (r < minAdvance) { minAdvance = r; minAdvanceNode = k; }
  }

  // Skirts: n top/bottom pairs per side, right after the seam ring. The top must be the
  // ribbon's own edge vertex and the bottom strictly below it.
  let minSkirtDepth = Infinity, detachedSkirts = 0, skirtPairs = 0;
  const skirtBase = (n + 1) * V;
  if (P.length / 3 >= skirtBase + 4 * n) {
    for (let side = 0; side < 2; side++) {
      const base = skirtBase + side * 2 * n, edge = side ? 13 : 0;
      for (let k = 0; k < n; k++) {
        const top = at(base + 2 * k), bot = at(base + 2 * k + 1), e = at(col(k, edge));
        skirtPairs++;
        if (Math.hypot(top[0] - e[0], top[1] - e[1], top[2] - e[2]) > 1e-3) detachedSkirts++;
        minSkirtDepth = Math.min(minSkirtDepth, top[1] - bot[1]);
      }
    }
  }

  // Vertical continuity: the largest second difference of any running-surface column's
  // height along the lap (a crest/dip is a few decimetres over a 4 m node; a lifted
  // vertex is metres).
  let maxRise = 0, maxRiseNode = -1, maxRiseCol = -1;
  for (let v = 2; v <= 11; v++) {
    for (let k = 0; k < n; k++) {
      const y0 = P[col((k + n - 1) % n, v) * 3 + 1], y1 = P[col(k, v) * 3 + 1], y2 = P[col((k + 1) % n, v) * 3 + 1];
      const d = Math.abs(y0 - 2 * y1 + y2);
      if (d > maxRise) { maxRise = d; maxRiseNode = k; maxRiseCol = v; }
    }
  }
  return { n, minRunWidth, minRunWidthNode, minAdvance, minAdvanceNode, skirtPairs, minSkirtDepth, detachedSkirts,
    maxRise, maxRiseNode, maxRiseCol };
}

// Fleet limits, one set for every circuit (no per-circuit tolerances). Measured 2026-10-16 over
// all 52: running width >= 7.6 m, centre-column advance >= 0.76 of node spacing, skirt depth
// >= 0.30 m with every skirt top on its ribbon edge, worst second difference 0.16 m. Each
// limit sits well clear of the fleet and well inside the injected defects of #1943.
const LIMITS = { minRunWidth: 4, minAdvance: 0.4, minSkirtDepth: 0.25, maxRise: 1 };

// -> array of human-readable failures (empty when the ribbon is sound).
function checkRoadPositions(track) {
  const m = roadPositionMetrics(track), out = [];
  if (!(m.minRunWidth >= LIMITS.minRunWidth))
    out.push(`running surface collapsed: ${m.minRunWidth.toFixed(2)} m wide at node ${m.minRunWidthNode} (< ${LIMITS.minRunWidth} m)`);
  if (!(m.minAdvance >= LIMITS.minAdvance))
    out.push(`running surface collapsed along the lap: centre-column step ${m.minAdvance.toFixed(2)} of node spacing at node ${m.minAdvanceNode} (< ${LIMITS.minAdvance})`);
  if (m.skirtPairs && m.detachedSkirts)
    out.push(`${m.detachedSkirts} skirt tops are not on the ribbon edge`);
  if (m.skirtPairs && !(m.minSkirtDepth >= LIMITS.minSkirtDepth))
    out.push(`skirt depth ${m.minSkirtDepth.toFixed(2)} m (< ${LIMITS.minSkirtDepth} m): the seam filler no longer covers the drop`);
  if (!(m.maxRise <= LIMITS.maxRise))
    out.push(`vertical discontinuity ${m.maxRise.toFixed(2)} m at node ${m.maxRiseNode} column ${m.maxRiseCol} (> ${LIMITS.maxRise} m)`);
  return out;
}

module.exports = { roadPositionMetrics, checkRoadPositions, LIMITS, V };
