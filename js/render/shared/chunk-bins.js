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
   * (= emission, along the arc) order, key -> { idx: Int32Array [a,b,c,…], mn: [x,y,z], mx: [x,y,z] }.
   */
  function bin(pos, idx, cell) {
    // Two passes over typed arrays rather than one over growable JS arrays: the
    // first files each triangle under its bucket (Map lookup once per triangle)
    // and grows the bucket's AABB, the second copies indices into exact-size
    // Int32Arrays. Same buckets, same first-seen order, same AABBs; on monaco's
    // props the buckets hold ~2.4 MB instead of ~13 MB of JS-array heap
    // (perf P1, 2026-10-18). Int32, not an index type, on purpose:
    // each backend still copies once into its own Uint16/Uint32 array, and the
    // TLX merge pins one index allocation per draw chunk. A trailing partial
    // triangle (idx.length % 3) is dropped, as the GLX/TLX triangle counts are.
    const T = (idx.length / 3) | 0, of = new Int32Array(T);
    const ids = new Map();
    let nb = 0, cnt = new Int32Array(64), box = new Float64Array(64 * 6);
    for (let t = 0; t < T; t++) {
      const a = idx[t*3], b = idx[t*3+1], c = idx[t*3+2];
      const ax=pos[a*3],ay=pos[a*3+1],az=pos[a*3+2], bx=pos[b*3],by=pos[b*3+1],bz=pos[b*3+2],
            cx=pos[c*3],cy=pos[c*3+1],cz=pos[c*3+2];
      const gx = Math.floor(((ax+bx+cx)/3)/cell) + BIAS;
      const gz = Math.floor(((az+bz+cz)/3)/cell) + BIAS;
      const k = gx * STRIDE + gz;
      let id = ids.get(k);
      if (id === undefined) {
        id = nb++; ids.set(k, id);
        if (id === cnt.length) {
          const c2 = new Int32Array(id * 2); c2.set(cnt); cnt = c2;
          const b2 = new Float64Array(id * 12); b2.set(box); box = b2;
        }
        const o = id * 6;
        box[o] = box[o+1] = box[o+2] = Infinity; box[o+3] = box[o+4] = box[o+5] = -Infinity;
      }
      of[t] = id; cnt[id] += 3;
      const o = id * 6;
      if (ax<box[o])box[o]=ax; if (ax>box[o+3])box[o+3]=ax; if (ay<box[o+1])box[o+1]=ay; if (ay>box[o+4])box[o+4]=ay; if (az<box[o+2])box[o+2]=az; if (az>box[o+5])box[o+5]=az;
      if (bx<box[o])box[o]=bx; if (bx>box[o+3])box[o+3]=bx; if (by<box[o+1])box[o+1]=by; if (by>box[o+4])box[o+4]=by; if (bz<box[o+2])box[o+2]=bz; if (bz>box[o+5])box[o+5]=bz;
      if (cx<box[o])box[o]=cx; if (cx>box[o+3])box[o+3]=cx; if (cy<box[o+1])box[o+1]=cy; if (cy>box[o+4])box[o+4]=cy; if (cz<box[o+2])box[o+2]=cz; if (cz>box[o+5])box[o+5]=cz;
    }
    const out = new Array(nb), fill = new Int32Array(nb);
    for (let i = 0; i < nb; i++) out[i] = new Int32Array(cnt[i]);
    for (let t = 0; t < T; t++) {
      const id = of[t], arr = out[id], w = fill[id];
      arr[w] = idx[t*3]; arr[w+1] = idx[t*3+1]; arr[w+2] = idx[t*3+2];
      fill[id] = w + 3;
    }
    const buckets = new Map();
    ids.forEach((id, k) => {
      const o = id * 6;
      buckets.set(k, { idx: out[id], mn: [box[o], box[o+1], box[o+2]], mx: [box[o+3], box[o+4], box[o+5]] });
    });
    return buckets;
  }

  return { CELL, BIAS, STRIDE, cellSize, cellOf, key, gxOf, gzOf, bin };
})();
Object.freeze(ChunkBins);
