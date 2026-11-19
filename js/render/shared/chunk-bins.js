"use strict";

const ChunkBins = (function () {
  const CELL = 72;
  const BIAS = 1024;
  const STRIDE = 4096;

  function cellSize(c) { return c > 0 ? c : CELL; }
  function cellOf(v, cell) { return Math.floor(v / cell) + BIAS; }
  function key(gx, gz) { return gx * STRIDE + gz; }
  function gxOf(k) { return (k / STRIDE) | 0; }
  function gzOf(k) { return k - ((k / STRIDE) | 0) * STRIDE; }

  function bin(pos, idx, cell) {
    const steps = binSteps(pos, idx, cell);
    let next; do { next = steps.next(); } while (!next.done);
    return next.value;
  }
  function* binSteps(pos, idx, cell) {
    const T = (idx.length / 3) | 0, of = new Int32Array(T);
    const ids = new Map();
    let nb = 0, cnt = new Int32Array(64), box = new Float64Array(64 * 6);
    for (let t = 0; t < T; t++) {
      if ((t & 2047) === 0) yield;
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
    for (let i = 0; i < nb; i++) { if ((i & 2047) === 0) yield; out[i] = new Int32Array(cnt[i]); }
    for (let t = 0; t < T; t++) {
      if ((t & 2047) === 0) yield;
      const id = of[t], arr = out[id], w = fill[id];
      arr[w] = idx[t*3]; arr[w+1] = idx[t*3+1]; arr[w+2] = idx[t*3+2];
      fill[id] = w + 3;
    }
    const buckets = new Map();
    for (const [k, id] of ids) {
      if ((id & 2047) === 0) yield;
      const o = id * 6;
      buckets.set(k, { idx: out[id], mn: [box[o], box[o+1], box[o+2]], mx: [box[o+3], box[o+4], box[o+5]] });
    }
    return buckets;
  }

  return { CELL, BIAS, STRIDE, cellSize, cellOf, key, gxOf, gzOf, bin, binSteps };
})();
Object.freeze(ChunkBins);
