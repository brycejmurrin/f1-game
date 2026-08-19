/* Apex 26 — rendered-terrain height query (grid + barycentric).
   TrackTerrain.terrainY is the public seam Tracks.terrainY re-exports.
   Extracted from js/track/tracks.js. Must load BEFORE tracks.js. */
const TrackTerrain = (function () {
  "use strict";
  const __M = Math;

// Uniform XZ bucket grid over the terrain triangles, built once per track and
// keyed on the geometry object so a rebuild invalidates it. Every triangle is
// inserted into every cell its XZ bounding box touches, so querying one cell
// sees exactly the triangles the linear scan would have found containing the
// point — the answer is identical, not approximate.
function terrainGrid(track) {
  const g = track.terrainGeo;
  if (!g || !g.pos || !g.idx) return null;
  if (track._terrGrid && track._terrGrid.geo === g) return track._terrGrid;
  const pos = g.pos, idx = g.idx, CELL = 24;
  let mnx = Infinity, mnz = Infinity, mxx = -Infinity, mxz = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    if (pos[i] < mnx) mnx = pos[i]; if (pos[i] > mxx) mxx = pos[i];
    if (pos[i + 2] < mnz) mnz = pos[i + 2]; if (pos[i + 2] > mxz) mxz = pos[i + 2];
  }
  if (!isFinite(mnx)) return null;
  const nx = Math.max(1, Math.ceil((mxx - mnx) / CELL));
  const nz = Math.max(1, Math.ceil((mxz - mnz) / CELL));
  const cells = new Array(nx * nz);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const x0 = __M.min(pos[a], pos[b], pos[c]), x1 = __M.max(pos[a], pos[b], pos[c]);
    const z0 = __M.min(pos[a + 2], pos[b + 2], pos[c + 2]);
    const z1 = __M.max(pos[a + 2], pos[b + 2], pos[c + 2]);
    const i0 = __M.max(0, __M.floor((x0 - mnx) / CELL));
    const i1 = __M.min(nx - 1, __M.floor((x1 - mnx) / CELL));
    const j0 = __M.max(0, __M.floor((z0 - mnz) / CELL));
    const j1 = __M.min(nz - 1, __M.floor((z1 - mnz) / CELL));
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = j * nx + i;
        (cells[k] || (cells[k] = [])).push(t);
      }
    }
  }
  track._terrGrid = { geo: g, mnx, mnz, nx, nz, cell: CELL, cells };
  return track._terrGrid;
}

// Rendered-terrain height at a world XZ, or null where the ribbon doesn't
// cover. Was a linear scan of EVERY terrain triangle — ~58k on Monza — and
// buildProps anchors every prop through it, so the cost landed on track build
// as well as on callers. The grid keeps the same answer 23-177x faster.
function terrainY(track, x, z) {
  const g = track.terrainGeo; if (!g) return null;
  const pos = g.pos, idx = g.idx; let best = null;
  const G = terrainGrid(track);
  if (G) {
    const i = __M.floor((x - G.mnx) / G.cell), j = __M.floor((z - G.mnz) / G.cell);
    if (i < 0 || j < 0 || i >= G.nx || j >= G.nz) return null;
    const list = G.cells[j * G.nx + i];
    if (!list) return null;
    for (let n = 0; n < list.length; n++) {
      const t = list[n];
      best = _triY(pos, idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3, x, z, best);
    }
    return best;
  }
  for (let t = 0; t < idx.length; t += 3) {
    best = _triY(pos, idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3, x, z, best);
  }
  return best;
}

// Barycentric containment in XZ, returning the higher of `best` and this
// triangle's interpolated height. Shared by both terrainY paths so the grid
// cannot drift from the scan.
function _triY(pos, a, b, c, x, z, best) {
  const ax = pos[a], az = pos[a + 2], bx = pos[b], bz = pos[b + 2], cx = pos[c], cz = pos[c + 2];
  const v0x = cx - ax, v0z = cz - az, v1x = bx - ax, v1z = bz - az, v2x = x - ax, v2z = z - az;
  const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z, d11 = v1x * v1x + v1z * v1z, d20 = v2x * v0x + v2z * v0z, d21 = v2x * v1x + v2z * v1z;
  const den = d00 * d11 - d01 * d01; if (__M.abs(den) < 1e-9) return best;
  const u = (d11 * d20 - d01 * d21) / den, vv = (d00 * d21 - d01 * d20) / den;
  if (u < -0.01 || vv < -0.01 || u + vv > 1.01) return best;
  const y = pos[a + 1] + u * (pos[c + 1] - pos[a + 1]) + vv * (pos[b + 1] - pos[a + 1]);
  return best === null || y > best ? y : best;
}

  return { terrainY };
})();
