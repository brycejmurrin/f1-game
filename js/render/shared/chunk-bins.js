/* Apex 26 — ChunkBins: the ONE spatial binning of chunked world meshes.
 *
 * A chunked mesh (the city props, glass, terrain — millions of triangles) is
 * cut into XZ cells: each triangle goes to the cell holding its CENTROID, and
 * each cell keeps the AABB of every vertex binned into it. The cell key is
 * `gx * STRIDE + gz` with both coordinates biased by BIAS, and it IS the
 * chunk's identity across backends: TLX's lamp grid (LampChunks.buildGrid) and
 * the TSL fragment lookup find a chunk from a WORLD position through it. Until
 * 2026-10-10 (R3-ARCHITECTURE-5) GLX, TLX and WGX (twice) each carried a copy of
 * this loop "verbatim"; a change to the cell size, bias or packing in one copy
 * would have desynchronised per-chunk lamps on that backend only.
 * tests/unit/lamp-chunks.test.mjs pins the key and that the backends bin here.
 * (WGX's two copies migrate with the WGX lane; js/render/three/tsl-lit.js
 * spells the same floor(x / cell) + 1024 in TSL.)
 */
"use strict";

const ChunkBins = (function () {
  const CELL = 72;      // default cell edge, metres
  const BIAS = 1024;    // keeps gx/gz positive for |x| < BIAS * cell
  const STRIDE = 4096;  // key = gx * STRIDE + gz

  /** The cell edge a caller asked for, or the default. */
  function cellSize(c) { return c > 0 ? c : CELL; }
  /** Biased cell coordinate of a world X or Z. */
  function cellOf(v, cell) { return Math.floor(v / cell) + BIAS; }
  function key(gx, gz) { return gx * STRIDE + gz; }
  function gxOf(k) { return (k / STRIDE) | 0; }
  function gzOf(k) { return k - ((k / STRIDE) | 0) * STRIDE; }

  /**
   * Bin triangles by centroid. `pos` is xyz per vertex, `idx` three indices per
   * triangle (indices stay ABSOLUTE into `pos`). Returns a Map, in first-seen
   * (= emission, along the arc) order, key -> { idx: [a,b,c,…], mn: [x,y,z], mx: [x,y,z] }.
   */
  function bin(pos, idx, cell) {
    const buckets = new Map();
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t+1], c = idx[t+2];
      const ax=pos[a*3],ay=pos[a*3+1],az=pos[a*3+2], bx=pos[b*3],by=pos[b*3+1],bz=pos[b*3+2],
            cx=pos[c*3],cy=pos[c*3+1],cz=pos[c*3+2];
      const gx = Math.floor(((ax+bx+cx)/3)/cell) + BIAS;
      const gz = Math.floor(((az+bz+cz)/3)/cell) + BIAS;
      const k = gx * STRIDE + gz;
      let bk = buckets.get(k);
      if (!bk) { bk = { idx: [], mn: [Infinity,Infinity,Infinity], mx: [-Infinity,-Infinity,-Infinity] }; buckets.set(k, bk); }
      bk.idx.push(a, b, c);
      const mn = bk.mn, mx = bk.mx;
      if (ax<mn[0])mn[0]=ax; if (ax>mx[0])mx[0]=ax; if (ay<mn[1])mn[1]=ay; if (ay>mx[1])mx[1]=ay; if (az<mn[2])mn[2]=az; if (az>mx[2])mx[2]=az;
      if (bx<mn[0])mn[0]=bx; if (bx>mx[0])mx[0]=bx; if (by<mn[1])mn[1]=by; if (by>mx[1])mx[1]=by; if (bz<mn[2])mn[2]=bz; if (bz>mx[2])mx[2]=bz;
      if (cx<mn[0])mn[0]=cx; if (cx>mx[0])mx[0]=cx; if (cy<mn[1])mn[1]=cy; if (cy>mx[1])mx[1]=cy; if (cz<mn[2])mn[2]=cz; if (cz>mx[2])mx[2]=cz;
    }
    return buckets;
  }

  return { CELL, BIAS, STRIDE, cellSize, cellOf, key, gxOf, gzOf, bin };
})();
Object.freeze(ChunkBins);
