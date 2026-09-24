/* Apex 26 — build-time strip of prop triangles no camera can see (enclosed in an opaque box, buried under terrain, down-facing on the ground). Index buffer only; vertices untouched. */
// TrackHiddenFaces.strip(geo, groundY) rewrites geo.idx WITHOUT the triangles
// that no camera can ever see, and leaves pos/nrm/col/mat exactly as they were,
// so every audit that reads a primitive's vertex range [s, e) (coplanar, clip,
// float — tools/lib/track-build-vm.cjs) sees the same data as before. Measured
// by scratch/perf/unseen.cjs (docs/notes/SCENERY-QA-PLAN.md §2b "P1").
//
// Three classes, each CONSERVATIVE (a doubt keeps the triangle):
//   enclosed  all 3 corners strictly (1 cm) inside another closed box — found
//             in the sealed buffer by its addBox signature (24 verts, 6 quads,
//             outward normals, winding agreeing with the normals). The
//             encloser must be opaque and static: never GLASS, never the FLAG
//             band (its vertices wave in the shader), never HDR-bright colour.
//   buried    corners, centroid and edge midpoints all > 5 cm below the drawn
//             terrain (groundY = Tracks.terrainY: the max over REAL terrain
//             triangles, null over a hole, and a null keeps the triangle).
//   bottom    front face points down (n.y < -0.95) and the same five points sit
//             no more than 10 cm above the terrain directly beneath them — the
//             eye would have to be under the face to see it.
// FLAG triangles are never stripped (their vertices move at draw time).
const TrackHiddenFaces = (function () {
  "use strict";

  // Local scalar helpers, not Math.*: the track VM harness hands the build a
  // host-context Math whose calls V8 cannot inline across contexts (measured
  // 3x on this pass), and in the browser these compile to the same thing.
  const abs = (x) => (x < 0 ? -x : x);
  const floor = (x) => { const t = x | 0; return t > x ? t - 1 : t; };   // |x| < 2^31
  const min = (a, b) => (a < b ? a : b), max = (a, b) => (a > b ? a : b);
  const isFlag = (m) => m >= MAT_FLAG - 0.5 && m < MAT_FLAG + 0.5;
  const IN_EPS = 0.01, MIN_HALF = 0.03, BURY = 0.05, BOTTOM = 0.10, BOTTOM_NY = -0.95;
  const CELL = 8, TCELL = 8;
  const MAT_GLASS = 3, MAT_FLAG = 15;

  const now = () => (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  const arr = (a) => (a && a._data) ? a._data : a;

  // Scratch for boxAt: axes (3x3), half extents, per-corner axis signs.
  const ax = new Float64Array(9), h = new Float64Array(3), sg = new Int8Array(72);
  const REC = new Float64Array(15);

  // Is [v, v+24) an addBox? Fills REC = [cx,cy,cz, ax0(3), ax1(3), ax2(3), h0,h1,h2]
  // and returns true. firstTri[v] is the first triangle whose FIRST index is v.
  function boxAt(pos, nrm, col, mat, idx, firstTri, v) {
    const o = v * 3;
    // cheap reject: face 0 and face 1 are four equal, mutually opposite normals
    if (nrm[o] !== nrm[o + 3] || nrm[o] !== nrm[o + 9] || nrm[o + 1] !== nrm[o + 7]) return null;
    if (abs(nrm[o] + nrm[o + 12]) > 1e-6 || abs(nrm[o + 1] + nrm[o + 13]) > 1e-6 ||
        abs(nrm[o + 2] + nrm[o + 14]) > 1e-6) return null;
    const m0 = mat ? mat[v] : 0;
    if ((m0 >= MAT_GLASS - 0.5 && m0 < MAT_GLASS + 0.5) || isFlag(m0)) return null;
    for (let k = 0; k < 24; k++) {
      const q = (v + k) * 3;
      if (mat && mat[v + k] !== m0) return null;
      if (col && (col[q] > 1 || col[q + 1] > 1 || col[q + 2] > 1)) return null;
      const f = (k >> 2) * 12 + o;             // this face's first normal
      if (nrm[q] !== nrm[f] || nrm[q + 1] !== nrm[f + 1] || nrm[q + 2] !== nrm[f + 2]) return null;
    }
    // three face pairs, opposite within a pair, orthogonal across pairs
    for (let p = 0; p < 3; p++) {
      const a = o + p * 24, b = a + 12;
      if (abs(nrm[a] + nrm[b]) > 1e-6 || abs(nrm[a + 1] + nrm[b + 1]) > 1e-6 ||
          abs(nrm[a + 2] + nrm[b + 2]) > 1e-6) return null;
      const L2 = nrm[a] * nrm[a] + nrm[a + 1] * nrm[a + 1] + nrm[a + 2] * nrm[a + 2];
      if (abs(L2 - 1) > 2e-4) return null;
      ax[p * 3] = nrm[a]; ax[p * 3 + 1] = nrm[a + 1]; ax[p * 3 + 2] = nrm[a + 2];
    }
    for (let p = 0; p < 3; p++) for (let r = p + 1; r < 3; r++)
      if (abs(ax[p * 3] * ax[r * 3] + ax[p * 3 + 1] * ax[r * 3 + 1] + ax[p * 3 + 2] * ax[r * 3 + 2]) > 1e-4) return null;
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 24; k++) { const q = (v + k) * 3; cx += pos[q]; cy += pos[q + 1]; cz += pos[q + 2]; }
    cx /= 24; cy /= 24; cz /= 24;
    h[0] = h[1] = h[2] = 0;
    for (let k = 0; k < 24; k++) {
      const q = (v + k) * 3;
      for (let p = 0; p < 3; p++) {
        const d = (pos[q] - cx) * ax[p * 3] + (pos[q + 1] - cy) * ax[p * 3 + 1] + (pos[q + 2] - cz) * ax[p * 3 + 2];
        sg[k * 3 + p] = d < 0 ? -1 : 1;
        if (abs(d) > h[p]) h[p] = abs(d);
      }
    }
    if (h[0] < MIN_HALF || h[1] < MIN_HALF || h[2] < MIN_HALF) return null;
    // every vertex a true corner; each face's quad on its own outward side,
    // four DISTINCT corners with 0 and 2 diagonal, drawn as (0,1,2)+(0,2,3)
    // with winding agreeing with the outward normal.
    const tol = 1e-4 * (1 + h[0] + h[1] + h[2]);
    for (let k = 0; k < 24; k++) {
      const q = (v + k) * 3;
      for (let p = 0; p < 3; p++) {
        const d = (pos[q] - cx) * ax[p * 3] + (pos[q + 1] - cy) * ax[p * 3 + 1] + (pos[q + 2] - cz) * ax[p * 3 + 2];
        if (abs(abs(d) - h[p]) > tol) return null;
      }
    }
    for (let fc = 0; fc < 6; fc++) {
      const base = v + fc * 4, p = fc >> 1;
      const n = base * 3;
      // outward: the quad lies on the side its normal points to
      const d = (pos[n] - cx) * nrm[n] + (pos[n + 1] - cy) * nrm[n + 1] + (pos[n + 2] - cz) * nrm[n + 2];
      if (d <= 0) return null;
      let mask = 0;
      for (let i = 0; i < 4; i++) {
        const k = fc * 4 + i;
        if (sg[k * 3 + p] !== ((nrm[n] * ax[p * 3] + nrm[n + 1] * ax[p * 3 + 1] + nrm[n + 2] * ax[p * 3 + 2]) < 0 ? -1 : 1)) return null;
        let bit = 0, b = 0;
        for (let r = 0; r < 3; r++) if (r !== p) { if (sg[k * 3 + r] > 0) bit |= 1 << b; b++; }
        mask |= 1 << bit;
      }
      if (mask !== 15) return null;
      const k0 = fc * 4, k2 = fc * 4 + 2;
      let diag = true;
      for (let r = 0; r < 3; r++) if (r !== p && sg[k0 * 3 + r] === sg[k2 * 3 + r]) diag = false;
      if (!diag) return null;
      const t = firstTri[base];
      if (t < 0 || (t + 1) * 3 + 2 >= idx.length) return null;
      for (let u = t; u <= t + 1; u++) {
        const a = idx[u * 3], b = idx[u * 3 + 1], c = idx[u * 3 + 2];
        if (a !== base || b < base || b > base + 3 || c < base || c > base + 3 || b === c) return null;
        const lo = min(b, c) - base, hi = max(b, c) - base;
        if (!((lo === 1 && hi === 2) || (lo === 2 && hi === 3))) return null;
        if (u === t + 1 && min(idx[t * 3 + 1], idx[t * 3 + 2]) === min(b, c)) return null;
        const A = a * 3, B = b * 3, C = c * 3;
        const e1x = pos[B] - pos[A], e1y = pos[B + 1] - pos[A + 1], e1z = pos[B + 2] - pos[A + 2];
        const e2x = pos[C] - pos[A], e2y = pos[C + 1] - pos[A + 1], e2z = pos[C + 2] - pos[A + 2];
        const gx = e1y * e2z - e1z * e2y, gy = e1z * e2x - e1x * e2z, gz = e1x * e2y - e1y * e2x;
        if (gx * nrm[n] + gy * nrm[n + 1] + gz * nrm[n + 2] <= 0) return null;
      }
    }
    REC[0] = cx; REC[1] = cy; REC[2] = cz;
    for (let i = 0; i < 9; i++) REC[3 + i] = ax[i];
    REC[12] = h[0]; REC[13] = h[1]; REC[14] = h[2];
    return true;
  }

  // Upper bound on the drawn terrain's height per coarse XZ cell: the max
  // vertex y of every terrain triangle whose AABB touches the cell. A prop
  // vertex above it cannot be buried (nor resting under a down face), so the
  // exact groundY lookups only run on the few that pass. -Infinity = no terrain.
  function terrainCeil(terrain) {
    const tp = terrain && arr(terrain.pos), ti = terrain && arr(terrain.idx);
    if (!tp || !ti || !ti.length) return null;
    let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
    for (let i = 0; i < tp.length; i += 3) {
      if (tp[i] < mnx) mnx = tp[i]; if (tp[i] > mxx) mxx = tp[i];
      if (tp[i + 2] < mnz) mnz = tp[i + 2]; if (tp[i + 2] > mxz) mxz = tp[i + 2];
    }
    const C = TCELL, nx = floor((mxx - mnx) / C) + 1, nz = floor((mxz - mnz) / C) + 1;
    const top = new Float64Array(nx * nz).fill(-Infinity);
    for (let t = 0; t + 2 < ti.length; t += 3) {
      const a = ti[t] * 3, b = ti[t + 1] * 3, c = ti[t + 2] * 3;
      const y = max(max(tp[a + 1], tp[b + 1]), tp[c + 1]);
      const i0 = floor((min(min(tp[a], tp[b]), tp[c]) - mnx) / C), i1 = floor((max(max(tp[a], tp[b]), tp[c]) - mnx) / C);
      const j0 = floor((min(min(tp[a + 2], tp[b + 2]), tp[c + 2]) - mnz) / C), j1 = floor((max(max(tp[a + 2], tp[b + 2]), tp[c + 2]) - mnz) / C);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * nx + i; if (y > top[k]) top[k] = y; }
    }
    return (x, z) => {
      const i = floor((x - mnx) / C), j = floor((z - mnz) / C);
      return (i < 0 || j < 0 || i >= nx || j >= nz) ? -Infinity : top[j * nx + i];
    };
  }

  // strip(geo, { groundY(x, z) -> y|null, terrain: terrainGeo }) -> stats.
  function strip(geo, opts) {
    const t0 = now();
    const stats = { trisBefore: 0, trisAfter: 0, enclosed: 0, buried: 0, bottom: 0, boxes: 0, ms: 0 };
    if (!geo || !geo.pos || !geo.idx) return stats;
    const pos = arr(geo.pos), nrm = arr(geo.nrm), col = arr(geo.col), mat = arr(geo.mat), idx = arr(geo.idx);
    const V = (pos.length / 3) | 0, T = (idx.length / 3) | 0;
    stats.trisBefore = stats.trisAfter = T;
    if (!T || !nrm || nrm.length !== pos.length) return stats;
    const groundY = opts && opts.groundY;
    const ceil = groundY ? terrainCeil(opts.terrain) : null;

    const firstTri = new Int32Array(V).fill(-1);
    for (let t = T - 1; t >= 0; t--) firstTri[idx[t * 3]] = t;

    // boxes → flat records (+ their XZ AABBs), then a dense CSR grid over them
    const B0 = [], BB0 = [];
    for (let v = 0; v + 24 <= V;) {
      if (!boxAt(pos, nrm, col, mat, idx, firstTri, v)) { v++; continue; }
      for (let i = 0; i < 15; i++) B0.push(REC[i]);
      let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity, mnz = Infinity, mxz = -Infinity;
      for (let q = v * 3; q < (v + 24) * 3; q += 3) {
        if (pos[q] < mnx) mnx = pos[q]; if (pos[q] > mxx) mxx = pos[q];
        if (pos[q + 1] < mny) mny = pos[q + 1]; if (pos[q + 1] > mxy) mxy = pos[q + 1];
        if (pos[q + 2] < mnz) mnz = pos[q + 2]; if (pos[q + 2] > mxz) mxz = pos[q + 2];
      }
      BB0.push(mnx, mxx, mnz, mxz, mny, mxy);
      v += 24;
    }
    const B = new Float64Array(B0), BB = new Float64Array(BB0), NB = B.length / 15;
    stats.boxes = NB;
    let gx0 = Infinity, gz0 = Infinity, gnx = 0, gnz = 0, start = null, list = null;
    if (NB) {
      let gx1 = -Infinity, gz1 = -Infinity;
      for (let k = 0; k < NB; k++) {
        if (BB[k * 6] < gx0) gx0 = BB[k * 6]; if (BB[k * 6 + 1] > gx1) gx1 = BB[k * 6 + 1];
        if (BB[k * 6 + 2] < gz0) gz0 = BB[k * 6 + 2]; if (BB[k * 6 + 3] > gz1) gz1 = BB[k * 6 + 3];
      }
      gnx = floor((gx1 - gx0) / CELL) + 1; gnz = floor((gz1 - gz0) / CELL) + 1;
      start = new Int32Array(gnx * gnz + 1);
      const span = (k, fn) => {
        const i0 = floor((BB[k * 6] - gx0) / CELL), i1 = floor((BB[k * 6 + 1] - gx0) / CELL);
        const j0 = floor((BB[k * 6 + 2] - gz0) / CELL), j1 = floor((BB[k * 6 + 3] - gz0) / CELL);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * gnx + i);
      };
      for (let k = 0; k < NB; k++) span(k, (c) => { start[c + 1]++; });
      for (let c = 0; c < gnx * gnz; c++) start[c + 1] += start[c];
      const fill = start.slice(0, gnx * gnz);
      list = new Int32Array(start[gnx * gnz]);
      for (let k = 0; k < NB; k++) span(k, (c) => { list[fill[c]++] = k; });
    }
    const inBox = (k, q) => {
      const o = k * 15;
      const dx = pos[q] - B[o], dy = pos[q + 1] - B[o + 1], dz = pos[q + 2] - B[o + 2];
      return abs(dx * B[o + 3] + dy * B[o + 4] + dz * B[o + 5]) < B[o + 12] - IN_EPS &&
             abs(dx * B[o + 6] + dy * B[o + 7] + dz * B[o + 8]) < B[o + 13] - IN_EPS &&
             abs(dx * B[o + 9] + dy * B[o + 10] + dz * B[o + 11]) < B[o + 14] - IN_EPS;
    };

    // exact ground under a point; NaN over a hole (a NaN comparison is false,
    // so a hole never strips anything)
    const gPt = (x, z) => { const h = groundY(x, z); return (h == null || !isFinite(h)) ? NaN : h; };
    const gy = new Map();                               // per-vertex cache; few vertices get here
    const gAt = (v) => { let g = gy.get(v); if (g === undefined) gy.set(v, g = gPt(pos[v * 3], pos[v * 3 + 2])); return g; };
    const cAt = (q) => ceil(pos[q], pos[q + 2]);
    // centroid and edge midpoints all satisfy y < ground + off (strictly)
    const interiorUnder = (A, Bq, C, off) => {
      for (let s = 0; s < 4; s++) {
        const wa = s === 0 ? 1 / 3 : s === 2 ? 0 : 0.5, wb = s === 0 ? 1 / 3 : s === 3 ? 0 : 0.5, wc = 1 - wa - wb;
        const x = pos[A] * wa + pos[Bq] * wb + pos[C] * wc, y = pos[A + 1] * wa + pos[Bq + 1] * wb + pos[C + 1] * wc;
        const z = pos[A + 2] * wa + pos[Bq + 2] * wb + pos[C + 2] * wc;
        if (!(y < gPt(x, z) + off)) return false;
      }
      return true;
    };

    const keep = new Uint8Array(T);
    let kept = 0;
    for (let t = 0; t < T; t++) {
      const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
      let hide = 0;
      if (!(mat && (isFlag(mat[a]) || isFlag(mat[b]) || isFlag(mat[c])))) {
        const A = a * 3, Bq = b * 3, C = c * 3;
        if (NB) {
          const mx = (pos[A] + pos[Bq] + pos[C]) / 3, my = (pos[A + 1] + pos[Bq + 1] + pos[C + 1]) / 3;
          const mz = (pos[A + 2] + pos[Bq + 2] + pos[C + 2]) / 3;
          const i = floor((mx - gx0) / CELL), j = floor((mz - gz0) / CELL);
          if (i >= 0 && j >= 0 && i < gnx && j < gnz) {
            const cell = j * gnx + i;
            for (let n = start[cell], e = start[cell + 1]; n < e; n++) {
              const k = list[n], o = k * 6;
              if (mx <= BB[o] || mx >= BB[o + 1] || mz <= BB[o + 2] || mz >= BB[o + 3] || my <= BB[o + 4] || my >= BB[o + 5]) continue;
              if (inBox(k, A) && inBox(k, Bq) && inBox(k, C)) { hide = 1; stats.enclosed++; break; }
            }
          }
        }
        if (!hide && ceil) {
          const ya = pos[A + 1], yb = pos[Bq + 1], yc = pos[C + 1];
          if (ya < cAt(A) - BURY && yb < cAt(Bq) - BURY && yc < cAt(C) - BURY &&
              ya < gAt(a) - BURY && yb < gAt(b) - BURY && yc < gAt(c) - BURY &&
              interiorUnder(A, Bq, C, -BURY)) { hide = 1; stats.buried++; }
          else if (ya <= cAt(A) + BOTTOM && yb <= cAt(Bq) + BOTTOM && yc <= cAt(C) + BOTTOM) {
            const e1x = pos[Bq] - pos[A], e1y = yb - ya, e1z = pos[Bq + 2] - pos[A + 2];
            const e2x = pos[C] - pos[A], e2y = yc - ya, e2z = pos[C + 2] - pos[A + 2];
            const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
            const L2 = nx * nx + ny * ny + nz * nz;
            if (L2 > 1e-24 && ny < 0 && ny * ny > BOTTOM_NY * BOTTOM_NY * L2 &&
                ya <= gAt(a) + BOTTOM && yb <= gAt(b) + BOTTOM && yc <= gAt(c) + BOTTOM &&
                interiorUnder(A, Bq, C, BOTTOM + 1e-9)) { hide = 1; stats.bottom++; }
          }
        }
      }
      if (!hide) { keep[t] = 1; kept++; }
    }
    if (kept !== T) {
      const out = new Uint32Array(kept * 3);
      let w = 0;
      for (let t = 0; t < T; t++) if (keep[t]) { out[w++] = idx[t * 3]; out[w++] = idx[t * 3 + 1]; out[w++] = idx[t * 3 + 2]; }
      geo.idx = out;
    }
    stats.trisAfter = kept;
    stats.ms = now() - t0;
    return stats;
  }

  return Object.freeze({ strip });
})();
