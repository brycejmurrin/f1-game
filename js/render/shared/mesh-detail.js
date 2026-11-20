/* Apex 26 — MeshDetail: the shared geometry-refinement kit for procedural meshes (subdivide, bevel, normals,
 * simplify). Pure functions over indexed triangle meshes; no renderer, no DOM, no store. Lazy: LAZY_TRACK_BUILD
 * and TRACK_VM (so the build worker and the Node VM builds have it too). Callers gate on GfxQuality.detail().
 *
 * MESH SHAPE (every function takes and returns this; inputs are never mutated):
 *   { positions: Float32Array(3n), indices: Uint32Array(3t),
 *     attrs: { <name>: { data: TypedArray(n*size), size, id: bool } } }
 * A plain attr (id false: uv, col, nrm …) is interpolated linearly. An ID attr (id true: material id) is CARRIED,
 * never blended: a new vertex copies one parent's value, and a vertex whose faces disagree is split. Topology is
 * read on positions welded exactly (opts.eps widens it), so a UV or material seam (two vertices at one point) is
 * still one surface point: both sides move together and the seam survives every operation.
 * `fromGeom` / `toGeom` convert the game's {pos, nrm, col, idx, mat[, uv]} builder output (js/car, js/track).
 *
 * ALGORITHMS AND SOURCES
 * - subdivide "loop": Loop 1987 (MS thesis, Univ. of Utah) with the crease / boundary / corner rules of
 *   Hoppe, DeRose, Duchamp, Halstead, Jin, McDonald, Schweitzer, Stuetzle, "Piecewise smooth surface
 *   reconstruction", SIGGRAPH 1994 (https://hhoppe.com/psrecon.pdf): smooth vertex (1-nβ)v + βΣ with Loop's
 *   β = (5/8 - (3/8 + cos(2π/n)/4)²)/n; crease vertex 3/4 v + 1/8 (two crease neighbours), i.e. the crease is a
 *   cubic B-spline curve; corner (≥3 crease edges, or listed in opts.corners) fixed; crease edge midpoint;
 *   smooth edge 3/8,3/8,1/8,1/8. Semi-sharp creases follow DeRose, Kass, Truong, "Subdivision surfaces in
 *   character animation", SIGGRAPH 1998: a crease of sharpness s uses the sharp rules for floor(s) levels,
 *   blends by the fraction, then turns smooth (children inherit s-1). `limit: true` projects onto the Loop
 *   limit surface (Hoppe 1994 §A: χ = 1/(3/(8β) + n); crease 2/3 v + 1/6 Σ; corner fixed).
 *   Simplification vs Hoppe: the extra rules for smooth edges next to irregular crease vertices are not
 *   applied (those edges use the plain 3/8,1/8 mask; C0 there, measured visually unseen — no GPU here).
 * - subdivide "butterfly": modified Butterfly, Zorin, Schröder, Sweldens, "Interpolating subdivision for
 *   meshes with arbitrary topology", SIGGRAPH 1996 (https://mrl.cs.nyu.edu/~dzorin/papers/zorin1996ism.pdf):
 *   regular edge (both ends valence 6) 1/2,1/2 + 1/8,1/8 - 1/16 ×4 wings; an extraordinary end of valence K
 *   uses 3/4 v + Σ s_j ring_j (K=3: 5/12,-1/12,-1/12; K=4: 3/8,0,-1/8,0; K≥5: (1/4 + cos(2πj/K) +
 *   cos(4πj/K)/2)/K), two extraordinary ends average. Crease / boundary edges use the 4-point curve rule
 *   (-1/16, 9/16, 9/16, -1/16) along the crease (a missing outer point is the reflection 2a-b). Simplification:
 *   an interior edge whose ends both touch a crease takes the midpoint. ORIGINAL VERTICES NEVER MOVE (bit
 *   exact), so use it where dimensions matter (wheels, anything physics-adjacent).
 * - normals: angle-weighted vertex normals, Thürmer & Wüthrich, "Computing vertex normals from polygonal
 *   facets", JGT 3(1) 1998, split into WEDGES: the faces round a vertex are cut at crease edges (dihedral >
 *   creaseAngle, boundary, non-manifold, or a supplied crease set) and each wedge gets its own normal.
 * - bevel: crease edges become a rounded chamfer strip. Each wedge copy of a crease vertex slides `width` into
 *   its own face plane along the wedge bisector (distance width / sin(θ/2), so it sits `width` from BOTH
 *   bounding creases); the strip between the two sides is a quadratic Bézier arc through the original sharp
 *   point, `segments` quads wide, with normals nlerped from one wedge normal to the other (tangent-continuous
 *   with the flat faces: this is what catches highlights). Corners where ≥3 creases meet get a triangle fan.
 *   Slides are clamped to 0.45 of the shortest edge at that vertex, so a narrow face cannot fold.
 * - simplify: quadric error metrics, Garland & Heckbert SIGGRAPH 1997 (area-weighted plane quadrics) with the
 *   border-constraint planes of their §5 and of Garland & Heckbert, "Simplifying surfaces with color and texture
 *   using quadric error metrics", IEEE Vis 1998 (https://mgarland.org/files/papers/quadric2.pdf) applied to
 *   attribute seams too. HALF-EDGE collapses (the survivor keeps its own position and attributes, so no attribute
 *   is ever re-interpolated and ids stay exact); seam / border vertices only slide along their seam / border, a
 *   vertex where seams or borders branch is locked; link condition + normal-flip test. The attribute term is a
 *   penalty (attributeWeight × fan area × edge² × |Δattr|²), not the full 1998 extended quadric.
 * - BOUNDS: Loop is approximating. A box whose 90° edges are creases (creaseEdges at ≤ 89°) keeps its exact
 *   bounding box; an UNCREASED closed mesh shrinks toward its limit surface (unit cube, 3 levels: bbox extent 0.87, -13 %;
 *   tests/unit/mesh-detail.test.mjs measures it). Crease what must keep its size, use "butterfly", or pass
 *   keepBounds: true (a per-axis affine rescale back to the input box after subdividing).
 *
 * PERFORMANCE: typed arrays and CSR edge tables, no per-triangle objects. CPU time in Node 22 for a 153.6k-triangle
 * output (tests/unit/mesh-detail-perf.test.mjs, 2026-11-20, a box at load 47 on 4 cores, so wall was 3-4× this):
 * subdivide ×3 ~0.1 s, normals ~0.12 s, bevel ~0.55 s, simplify 150k → 15k ~2 s. Unseen: any GPU or phone cost.
 */
"use strict";

const MeshDetail = (function () {
  const NRM = "nrm";
  const TAU = Math.PI * 2;

  // ---------- mesh plumbing ----------

  function vcount(m) { return (m.positions.length / 3) | 0; }
  function names(m) { return m.attrs ? Object.keys(m.attrs).sort() : []; }

  function identity(n) { const a = new Uint32Array(n); for (let i = 0; i < n; i++) a[i] = i; return a; }

  // Build a mesh from arrays. attrs: { name: { data, size, id } }. Indices omitted = a triangle soup.
  function mesh(positions, indices, attrs) {
    const P = positions instanceof Float32Array ? positions : Float32Array.from(positions);
    if (P.length % 3) throw new Error("MeshDetail.mesh: positions length not a multiple of 3");
    const n = P.length / 3;
    const I = indices == null ? identity(n) : (indices instanceof Uint32Array ? indices : Uint32Array.from(indices));
    if (I.length % 3) throw new Error("MeshDetail.mesh: indices length not a multiple of 3");
    for (let i = 0; i < I.length; i++) if (I[i] >= n) throw new Error("MeshDetail.mesh: index " + I[i] + " out of range");
    const A = {};
    if (attrs) for (const k of Object.keys(attrs).sort()) {
      const a = attrs[k];
      if (!a) continue;
      const size = (a.size | 0) || 1;
      const data = ArrayBuffer.isView(a.data) ? a.data : Float32Array.from(a.data);
      if (data.length !== n * size) throw new Error("MeshDetail.mesh: attr " + k + " length " + data.length + " != " + n + "×" + size);
      A[k] = { data, size, id: !!a.id };
    }
    return { positions: P, indices: I, attrs: A };
  }

  // The game's builder shape → mesh. nrm is dropped unless keepNormals (every op recomputes it).
  function fromGeom(g, opts) {
    const o = opts || {};
    const n = g.pos.length / 3;
    const attrs = {};
    if (g.col && g.col.length) attrs.col = { data: g.col, size: 3 };
    if (g.uv && g.uv.length) attrs.uv = { data: g.uv, size: 2 };
    if (g.mat && g.mat.length) attrs.mat = { data: g.mat, size: 1, id: true };
    if (o.keepNormals && g.nrm && g.nrm.length === n * 3) attrs[NRM] = { data: g.nrm, size: 3 };
    return mesh(g.pos, g.idx && g.idx.length ? g.idx : null, attrs);
  }

  // mesh → { pos, nrm, col, idx[, mat][, uv] } as plain arrays (opts.typed: the typed arrays themselves).
  function toGeom(m, opts) {
    const typed = !!(opts && opts.typed);
    const cv = (a) => (typed ? a : Array.from(a));
    let mm = m;
    if (!mm.attrs[NRM]) mm = normals(mm, { creaseAngle: (opts && opts.creaseAngle) != null ? opts.creaseAngle : 40 });
    const n = vcount(mm);
    const g = { pos: cv(mm.positions), nrm: cv(mm.attrs[NRM].data), idx: cv(mm.indices) };
    g.col = mm.attrs.col ? cv(mm.attrs.col.data) : cv(new Float32Array(n * 3).fill(1));
    if (mm.attrs.mat) g.mat = cv(mm.attrs.mat.data);
    if (mm.attrs.uv) g.uv = cv(mm.attrs.uv.data);
    return g;
  }

  function withoutAttr(m, name) {
    if (!m.attrs || !m.attrs[name]) return m;
    const A = {};
    for (const k of names(m)) if (k !== name) A[k] = m.attrs[k];
    return { positions: m.positions, indices: m.indices, attrs: A };
  }

  // A new attr store sized for n vertices, same layout (ids keep their array type).
  function newAttrs(m, n) {
    const A = {};
    for (const k of names(m)) {
      const a = m.attrs[k];
      const Ctor = a.id ? a.data.constructor : Float32Array;
      A[k] = { data: new Ctor(n * a.size), size: a.size, id: a.id };
    }
    return A;
  }

  function attrsDiffer(m, i, j, eps, idOnly) {
    for (const k of names(m)) {
      const a = m.attrs[k];
      if (idOnly && !a.id) continue;
      const s = a.size, d = a.data;
      for (let c = 0; c < s; c++) {
        const x = d[i * s + c], y = d[j * s + c];
        if (a.id ? x !== y : Math.abs(x - y) > eps) return true;
      }
    }
    return false;
  }

  // ---------- hashing / weld ----------

  const _f32 = new Float32Array(1), _u32 = new Uint32Array(_f32.buffer);
  function fbits(x) { _f32[0] = x === 0 ? 0 : x; return _u32[0] | 0; }
  function mix(h, k) {
    k = Math.imul(k, 0xcc9e2d51); k = (k << 15) | (k >>> 17); k = Math.imul(k, 0x1b873593);
    h ^= k; h = (h << 13) | (h >>> 19); return (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  function fin(h) {
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  }

  // remap[i] = the representative (lowest index) vertex i merges into. same(i, r) may veto a merge.
  function weldCore(P, n, eps, same) {
    let cap = 16; while (cap < n * 2) cap <<= 1;
    const mask = cap - 1;
    const head = new Int32Array(cap).fill(-1), next = new Int32Array(n).fill(-1);
    const remap = new Uint32Array(n);
    const e2 = eps * eps;
    for (let i = 0; i < n; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      let found = -1;
      if (eps > 0) {
        const cx = Math.floor(x / eps), cy = Math.floor(y / eps), cz = Math.floor(z / eps);
        for (let dx = -1; dx <= 1 && found < 0; dx++) for (let dy = -1; dy <= 1 && found < 0; dy++) for (let dz = -1; dz <= 1 && found < 0; dz++) {
          const slot = fin(mix(mix(mix(0x2545f491, cx + dx), cy + dy), cz + dz)) & mask;
          for (let r = head[slot]; r >= 0; r = next[r]) {
            const ax = P[r * 3] - x, ay = P[r * 3 + 1] - y, az = P[r * 3 + 2] - z;
            if (ax * ax + ay * ay + az * az <= e2 && (!same || same(i, r))) { found = r; break; }
          }
        }
        if (found < 0) {
          const slot = fin(mix(mix(mix(0x2545f491, cx), cy), cz)) & mask;
          next[i] = head[slot]; head[slot] = i;
        }
      } else {
        const slot = fin(mix(mix(mix(0x2545f491, fbits(x)), fbits(y)), fbits(z))) & mask;
        for (let r = head[slot]; r >= 0; r = next[r]) {
          if (P[r * 3] === x && P[r * 3 + 1] === y && P[r * 3 + 2] === z && (!same || same(i, r))) { found = r; break; }
        }
        if (found < 0) { next[i] = head[slot]; head[slot] = i; }
      }
      remap[i] = found < 0 ? i : found;
    }
    return remap;
  }

  // Geometry welding for topology: gOf[v] = compact surface-point id; gPos = its position (first vertex's).
  function geomOf(m, eps) {
    const n = vcount(m), P = m.positions;
    const rep = weldCore(P, n, eps || 0, null);
    const gOf = new Uint32Array(n), id = new Int32Array(n).fill(-1);
    let nG = 0;
    for (let i = 0; i < n; i++) { const r = rep[i]; if (id[r] < 0) id[r] = nG++; gOf[i] = id[r]; }
    const gPos = new Float64Array(nG * 3);
    for (let i = n - 1; i >= 0; i--) { const g = gOf[i]; gPos[g * 3] = P[i * 3]; gPos[g * 3 + 1] = P[i * 3 + 1]; gPos[g * 3 + 2] = P[i * 3 + 2]; }
    return { gOf, nG, gPos };
  }

  // Drop triangles that collapse to a line on the welded geometry (repeated surface point).
  function clean(m, gOf) {
    const I = m.indices, T = I.length / 3;
    let bad = 0;
    for (let t = 0; t < T; t++) {
      const a = gOf[I[t * 3]], b = gOf[I[t * 3 + 1]], c = gOf[I[t * 3 + 2]];
      if (a === b || b === c || a === c) bad++;
    }
    if (!bad) return m;
    const J = new Uint32Array((T - bad) * 3);
    let o = 0;
    for (let t = 0; t < T; t++) {
      const a = gOf[I[t * 3]], b = gOf[I[t * 3 + 1]], c = gOf[I[t * 3 + 2]];
      if (a === b || b === c || a === c) continue;
      J[o++] = I[t * 3]; J[o++] = I[t * 3 + 1]; J[o++] = I[t * 3 + 2];
    }
    return { positions: m.positions, indices: J, attrs: m.attrs };
  }

  // Keep only referenced vertices (in first-use order) — every op ends here, so outputs are deterministic.
  function compact(P, I, A) {
    const n = P.length / 3, map = new Int32Array(n).fill(-1);
    let k = 0;
    const J = new Uint32Array(I.length);
    for (let i = 0; i < I.length; i++) { const v = I[i]; if (map[v] < 0) map[v] = k++; J[i] = map[v]; }
    const Q = new Float32Array(k * 3);
    const B = {};
    for (const name of Object.keys(A).sort()) {
      const a = A[name];
      const Ctor = a.id ? a.data.constructor : Float32Array;
      B[name] = { data: new Ctor(k * a.size), size: a.size, id: a.id };
    }
    for (let v = 0; v < n; v++) {
      const w = map[v];
      if (w < 0) continue;
      Q[w * 3] = P[v * 3]; Q[w * 3 + 1] = P[v * 3 + 1]; Q[w * 3 + 2] = P[v * 3 + 2];
      for (const name in B) { const s = A[name].size, src = A[name].data, dst = B[name].data; for (let c = 0; c < s; c++) dst[w * s + c] = src[v * s + c]; }
    }
    return { positions: Q, indices: J, attrs: B };
  }

  // weld: merge vertices whose positions are within eps AND whose attributes match (plain attrs within
  // opts.attrEps, default 1e-6; ids exactly). A seam stays split — that IS the split by attribute discontinuity.
  function weld(m, eps, opts) {
    const ae = opts && opts.attrEps != null ? opts.attrEps : 1e-6;
    const n = vcount(m);
    const rep = weldCore(m.positions, n, eps || 0, (i, r) => !attrsDiffer(m, i, r, ae, false));
    const I = new Uint32Array(m.indices.length);
    let o = 0;
    for (let t = 0; t < m.indices.length; t += 3) {
      const a = rep[m.indices[t]], b = rep[m.indices[t + 1]], c = rep[m.indices[t + 2]];
      if (a === b || b === c || a === c) continue;
      I[o++] = a; I[o++] = b; I[o++] = c;
    }
    return compact(m.positions, I.subarray(0, o), m.attrs);
  }

  // unweld: every triangle corner its own vertex (faceted; the inverse of weld).
  function unweld(m) {
    const I = m.indices, N = I.length;
    const P = new Float32Array(N * 3), A = newAttrs(m, N);
    for (let c = 0; c < N; c++) {
      const v = I[c];
      P[c * 3] = m.positions[v * 3]; P[c * 3 + 1] = m.positions[v * 3 + 1]; P[c * 3 + 2] = m.positions[v * 3 + 2];
      for (const k in A) { const s = A[k].size, src = m.attrs[k].data, dst = A[k].data; for (let j = 0; j < s; j++) dst[c * s + j] = src[v * s + j]; }
    }
    return { positions: P, indices: identity(N), attrs: A };
  }

  // ---------- edge tables (CSR by lower endpoint) ----------

  // tri: corner → vertex id (3 per triangle), nV vertex count. Edge k of a triangle runs corner k → k+1.
  function buildEdges(tri, nV) {
    const N = tri.length, T = N / 3;
    const start = new Uint32Array(nV + 1);
    for (let c = 0; c < N; c++) {
      const a = tri[c], b = tri[c - (c % 3) + ((c % 3) + 1) % 3];
      start[(a < b ? a : b) + 1]++;
    }
    for (let v = 0; v < nV; v++) start[v + 1] += start[v];
    const fill = start.slice(0, nV), bucket = new Uint32Array(N);
    for (let c = 0; c < N; c++) {
      const a = tri[c], b = tri[c - (c % 3) + ((c % 3) + 1) % 3];
      bucket[fill[a < b ? a : b]++] = c;
    }
    const cornerEdge = new Int32Array(N);
    const eA = new Uint32Array(N), eB = new Uint32Array(N), eFc = new Uint32Array(N);
    const eF0 = new Int32Array(N).fill(-1), eF1 = new Int32Array(N).fill(-1);
    const bucketEdge = new Int32Array(N);
    let ne = 0;
    for (let v = 0; v < nV; v++) {
      for (let j = start[v]; j < start[v + 1]; j++) {
        const c = bucket[j];
        const a = tri[c], b = tri[c - (c % 3) + ((c % 3) + 1) % 3];
        const hi = a < b ? b : a;
        let e = -1;
        for (let q = start[v]; q < j; q++) {
          const c2 = bucket[q];
          const a2 = tri[c2], b2 = tri[c2 - (c2 % 3) + ((c2 % 3) + 1) % 3];
          if ((a2 < b2 ? b2 : a2) === hi) { e = bucketEdge[q]; break; }
        }
        if (e < 0) { e = ne++; eA[e] = v; eB[e] = hi; }
        bucketEdge[j] = e;
        cornerEdge[c] = e;
        const f = (c / 3) | 0;
        if (eFc[e] === 0) eF0[e] = f; else if (eFc[e] === 1) eF1[e] = f;
        eFc[e]++;
      }
    }
    return { count: ne, eA, eB, eFc, eF0, eF1, cornerEdge, start, bucket, bucketEdge, tri, nV, T };
  }

  function findEdge(E, a, b) {
    const lo = a < b ? a : b, hi = a < b ? b : a;
    if (lo >= E.nV) return -1;
    for (let j = E.start[lo]; j < E.start[lo + 1]; j++) {
      const e = E.bucketEdge[j];
      if (E.eB[e] === hi) return e;
    }
    return -1;
  }

  function geomTris(I, gOf) { const tg = new Uint32Array(I.length); for (let i = 0; i < I.length; i++) tg[i] = gOf[I[i]]; return tg; }

  // corner of triangle f sitting on vertex v (in the tri table), or -1
  function cornerAt(tri, f, v) { const b = f * 3; return tri[b] === v ? b : tri[b + 1] === v ? b + 1 : tri[b + 2] === v ? b + 2 : -1; }
  function thirdOf(tri, f, a, b) { const o = f * 3; for (let k = 0; k < 3; k++) { const x = tri[o + k]; if (x !== a && x !== b) return x; } return a; }

  // Per-vertex corner lists (CSR) on the tri table.
  function vertexCorners(tri, nV) {
    const start = new Uint32Array(nV + 1);
    for (let c = 0; c < tri.length; c++) start[tri[c] + 1]++;
    for (let v = 0; v < nV; v++) start[v + 1] += start[v];
    const fill = start.slice(0, nV), list = new Uint32Array(tri.length);
    for (let c = 0; c < tri.length; c++) list[fill[tri[c]]++] = c;
    return { start, list };
  }

  // Face unit normals (Float64 3T) and corner angles (Float64 3T) on geometry positions.
  function faceFrames(tg, G) {
    const T = tg.length / 3, fn = new Float64Array(T * 3), ang = new Float64Array(T * 3), fa = new Float64Array(T);
    for (let t = 0; t < T; t++) {
      const i0 = tg[t * 3] * 3, i1 = tg[t * 3 + 1] * 3, i2 = tg[t * 3 + 2] * 3;
      const ax = G[i1] - G[i0], ay = G[i1 + 1] - G[i0 + 1], az = G[i1 + 2] - G[i0 + 2];
      const bx = G[i2] - G[i0], by = G[i2 + 1] - G[i0 + 1], bz = G[i2 + 2] - G[i0 + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      fa[t] = l * 0.5;
      if (l > 0) { nx /= l; ny /= l; nz /= l; }
      fn[t * 3] = nx; fn[t * 3 + 1] = ny; fn[t * 3 + 2] = nz;
      for (let k = 0; k < 3; k++) {
        const p = tg[t * 3 + k] * 3, q = tg[t * 3 + (k + 1) % 3] * 3, r = tg[t * 3 + (k + 2) % 3] * 3;
        const ux = G[q] - G[p], uy = G[q + 1] - G[p + 1], uz = G[q + 2] - G[p + 2];
        const vx = G[r] - G[p], vy = G[r + 1] - G[p + 1], vz = G[r + 2] - G[p + 2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        ang[t * 3 + k] = Math.atan2(Math.sqrt(cx * cx + cy * cy + cz * cz), ux * vx + uy * vy + uz * vz);
      }
    }
    return { fn, ang, fa };
  }

  // ---------- creases ----------

  // A crease set: vertex-index pairs of THIS mesh (either side of a seam names the same edge) + sharpness.
  function creases(pairs, sharpness) {
    const flat = [];
    for (const p of pairs) { if (Array.isArray(p)) flat.push(p[0], p[1]); else flat.push(p); }
    const P = Uint32Array.from(flat);
    const k = P.length / 2;
    const S = new Float64Array(k);
    for (let i = 0; i < k; i++) S[i] = sharpness == null ? Infinity : (typeof sharpness === "number" ? sharpness : sharpness[i]);
    return { pairs: P, sharpness: S, count: k };
  }

  // creaseEdges(mesh, angleDeg = 30, { seams = true }): boundary, non-manifold, dihedral > angle, material-id
  // seams always, other attribute seams (uv, colour) while opts.seams is on.
  function creaseEdges(m, angleDeg, opts) {
    const ang = angleDeg == null ? 30 : angleDeg;
    const seams = !(opts && opts.seams === false);
    const G = geomOf(m, opts && opts.eps);
    const mm = clean(m, G.gOf);
    const tg = geomTris(mm.indices, G.gOf);
    const E = buildEdges(tg, G.nG);
    const { fn } = faceFrames(tg, G.gPos);
    const cosT = Math.cos(ang * Math.PI / 180);
    const out = [];
    for (let e = 0; e < E.count; e++) {
      const f0 = E.eF0[e], f1 = E.eF1[e], a = E.eA[e], b = E.eB[e];
      const ca0 = cornerAt(tg, f0, a), cb0 = cornerAt(tg, f0, b);
      let hit = E.eFc[e] !== 2;
      if (!hit) {
        const d = fn[f0 * 3] * fn[f1 * 3] + fn[f0 * 3 + 1] * fn[f1 * 3 + 1] + fn[f0 * 3 + 2] * fn[f1 * 3 + 2];
        if (d < cosT - 1e-12) hit = true;
      }
      if (!hit) {
        const ca1 = cornerAt(tg, f1, a), cb1 = cornerAt(tg, f1, b);
        const ua0 = mm.indices[ca0], ua1 = mm.indices[ca1], ub0 = mm.indices[cb0], ub1 = mm.indices[cb1];
        if ((ua0 !== ua1 && attrsDiffer(mm, ua0, ua1, 1e-6, !seams)) || (ub0 !== ub1 && attrsDiffer(mm, ub0, ub1, 1e-6, !seams))) hit = true;
      }
      if (hit) out.push(mm.indices[ca0], mm.indices[cb0]);
    }
    return creases(out, null);
  }

  // Sharpness per edge of E (geometry ids via gOf). spec: crease set | number (angle) | null. fc ≠ 2 → ∞.
  function sharpFor(m, gOf, E, spec) {
    const s = new Float64Array(E.count);
    let set = spec;
    if (typeof spec === "number") set = creaseEdges(m, spec);
    if (set && set.pairs) {
      for (let i = 0; i < set.count; i++) {
        const e = findEdge(E, gOf[set.pairs[i * 2]], gOf[set.pairs[i * 2 + 1]]);
        if (e >= 0) { const v = set.sharpness ? set.sharpness[i] : Infinity; if (v > s[e]) s[e] = v; }
      }
    }
    for (let e = 0; e < E.count; e++) if (E.eFc[e] !== 2) s[e] = Infinity;
    return s;
  }

  // ---------- subdivision ----------

  function loopBeta(n) { const c = 0.375 + 0.25 * Math.cos(TAU / n); return (0.625 - c * c) / n; }

  function zorinWeights(K) {
    if (K === 3) return [5 / 12, -1 / 12, -1 / 12];
    if (K === 4) return [3 / 8, 0, -1 / 8, 0];
    const w = new Array(K);
    for (let j = 0; j < K; j++) w[j] = (0.25 + Math.cos(TAU * j / K) + 0.5 * Math.cos(2 * TAU * j / K)) / K;
    return w;
  }
  const _zw = new Map();
  function zw(K) { let w = _zw.get(K); if (!w) { w = zorinWeights(K); _zw.set(K, w); } return w; }

  // Per-vertex accumulations the vertex rules read.
  function vertexSums(E, nG, P, sharp) {
    const sum = new Float64Array(nG * 3), val = new Uint32Array(nG), csum = new Float64Array(nG * 3);
    const cn = new Uint32Array(nG), cs = new Float64Array(nG), open = new Uint8Array(nG);
    const cnb = new Int32Array(nG * 2).fill(-1);
    for (let e = 0; e < E.count; e++) {
      const a = E.eA[e], b = E.eB[e];
      for (let k = 0; k < 3; k++) { sum[a * 3 + k] += P[b * 3 + k]; sum[b * 3 + k] += P[a * 3 + k]; }
      val[a]++; val[b]++;
      if (E.eFc[e] !== 2) { open[a] = 1; open[b] = 1; }
      if (sharp[e] > 0) {
        for (let k = 0; k < 3; k++) { csum[a * 3 + k] += P[b * 3 + k]; csum[b * 3 + k] += P[a * 3 + k]; }
        if (cn[a] < 2) cnb[a * 2 + cn[a]] = b;
        if (cn[b] < 2) cnb[b * 2 + cn[b]] = a;
        cn[a]++; cn[b]++; cs[a] += sharp[e]; cs[b] += sharp[e];
      }
    }
    return { sum, val, csum, cn, cs, open, cnb };
  }

  function loopEven(nG, P, V, corner, out) {
    for (let v = 0; v < nG; v++) {
      const n = V.val[v], o = v * 3;
      if (n === 0 || corner[v]) { out[o] = P[o]; out[o + 1] = P[o + 1]; out[o + 2] = P[o + 2]; continue; }
      const be = loopBeta(n), w = 1 - n * be;
      let sx = w * P[o] + be * V.sum[o], sy = w * P[o + 1] + be * V.sum[o + 1], sz = w * P[o + 2] + be * V.sum[o + 2];
      const c = V.cn[v];
      if (c >= 2) {
        let rx, ry, rz;
        if (c === 2) { rx = 0.75 * P[o] + 0.125 * V.csum[o]; ry = 0.75 * P[o + 1] + 0.125 * V.csum[o + 1]; rz = 0.75 * P[o + 2] + 0.125 * V.csum[o + 2]; }
        else { rx = P[o]; ry = P[o + 1]; rz = P[o + 2]; }
        const vs = V.cs[v] / c;
        if (vs >= 1) { sx = rx; sy = ry; sz = rz; }
        else { sx += (rx - sx) * vs; sy += (ry - sy) * vs; sz += (rz - sz) * vs; }
      }
      out[o] = sx; out[o + 1] = sy; out[o + 2] = sz;
    }
  }

  function loopOdd(E, tg, P, sharp, nG, out) {
    for (let e = 0; e < E.count; e++) {
      const a = E.eA[e] * 3, b = E.eB[e] * 3, o = (nG + e) * 3, s = sharp[e];
      const mx = 0.5 * (P[a] + P[b]), my = 0.5 * (P[a + 1] + P[b + 1]), mz = 0.5 * (P[a + 2] + P[b + 2]);
      if (s >= 1 || E.eFc[e] !== 2) { out[o] = mx; out[o + 1] = my; out[o + 2] = mz; continue; }
      const c = thirdOf(tg, E.eF0[e], E.eA[e], E.eB[e]) * 3, d = thirdOf(tg, E.eF1[e], E.eA[e], E.eB[e]) * 3;
      let lx = 0.375 * (P[a] + P[b]) + 0.125 * (P[c] + P[d]);
      let ly = 0.375 * (P[a + 1] + P[b + 1]) + 0.125 * (P[c + 1] + P[d + 1]);
      let lz = 0.375 * (P[a + 2] + P[b + 2]) + 0.125 * (P[c + 2] + P[d + 2]);
      if (s > 0) { lx += (mx - lx) * s; ly += (my - ly) * s; lz += (mz - lz) * s; }
      out[o] = lx; out[o + 1] = ly; out[o + 2] = lz;
    }
  }

  // Ordered one-ring of v starting at neighbour b (CCW by triangle winding) into ring[]; K or -1 if not a disc.
  function ringOf(VC, tg, v, b, K, ring) {
    let cur = b;
    for (let i = 0; i < K; i++) {
      ring[i] = cur;
      let nx = -1;
      for (let j = VC.start[v]; j < VC.start[v + 1]; j++) {
        const c = VC.list[j], base = c - (c % 3), k = c % 3;
        if (tg[base + (k + 1) % 3] === cur) { nx = tg[base + (k + 2) % 3]; break; }
      }
      if (nx < 0) return -1;
      cur = nx;
    }
    return cur === b ? K : -1;
  }

  function butterflyOdd(E, tg, P, sharp, nG, V, corner, out) {
    const VC = vertexCorners(tg, nG);
    const ra = new Int32Array(64), rb = new Int32Array(64);
    const acc = [0, 0, 0];
    function crossOuter(v, other, k) { // the far point beyond v along its crease, or the reflection 2v - other
      if (V.cn[v] === 2 && !corner[v]) {
        const w = V.cnb[v * 2] === other ? V.cnb[v * 2 + 1] : V.cnb[v * 2];
        if (w >= 0) return P[w * 3 + k];
      }
      return 2 * P[v * 3 + k] - P[other * 3 + k];
    }
    function stencil(v, other, K, ring, wgt) { // 3/4 v + Σ s_j ring_j (Zorin), accumulated × wgt
      const s = zw(K);
      for (let k = 0; k < 3; k++) acc[k] += wgt * 0.75 * P[v * 3 + k];
      for (let j = 0; j < K; j++) { const r = ring[j] * 3, wj = wgt * s[j]; acc[0] += wj * P[r]; acc[1] += wj * P[r + 1]; acc[2] += wj * P[r + 2]; }
    }
    for (let e = 0; e < E.count; e++) {
      const a = E.eA[e], b = E.eB[e], o = (nG + e) * 3;
      if (sharp[e] > 0 || E.eFc[e] !== 2) {
        for (let k = 0; k < 3; k++) out[o + k] = (9 * (P[a * 3 + k] + P[b * 3 + k]) - crossOuter(a, b, k) - crossOuter(b, a, k)) / 16;
        continue;
      }
      const okA = V.cn[a] === 0 && !V.open[a] && V.val[a] <= 64 ? ringOf(VC, tg, a, b, V.val[a], ra) : -1;
      const okB = V.cn[b] === 0 && !V.open[b] && V.val[b] <= 64 ? ringOf(VC, tg, b, a, V.val[b], rb) : -1;
      acc[0] = acc[1] = acc[2] = 0;
      if (okA === 6 && okB === 6) {
        // regular 8-point butterfly (w = 0): ra[1], ra[5] are the two opposite vertices; ra[2], ra[4], rb[2], rb[4] the wings
        for (let k = 0; k < 3; k++) {
          acc[k] = 0.5 * (P[a * 3 + k] + P[b * 3 + k]) + 0.125 * (P[ra[1] * 3 + k] + P[ra[5] * 3 + k])
            - 0.0625 * (P[ra[2] * 3 + k] + P[ra[4] * 3 + k] + P[rb[2] * 3 + k] + P[rb[4] * 3 + k]);
        }
      } else if (okA > 0 && okB > 0) {
        if (okA !== 6 && okB !== 6) { stencil(a, b, okA, ra, 0.5); stencil(b, a, okB, rb, 0.5); }
        else if (okA !== 6) stencil(a, b, okA, ra, 1);
        else stencil(b, a, okB, rb, 1);
      } else if (okA > 0) stencil(a, b, okA, ra, 1);
      else if (okB > 0) stencil(b, a, okB, rb, 1);
      else for (let k = 0; k < 3; k++) acc[k] = 0.5 * (P[a * 3 + k] + P[b * 3 + k]);
      out[o] = acc[0]; out[o + 1] = acc[1]; out[o + 2] = acc[2];
    }
  }

  function loopLimit(nG, P, V, corner) {
    const out = new Float64Array(nG * 3);
    for (let v = 0; v < nG; v++) {
      const n = V.val[v], o = v * 3, c = V.cn[v];
      if (n === 0 || corner[v] || c >= 3) { out[o] = P[o]; out[o + 1] = P[o + 1]; out[o + 2] = P[o + 2]; continue; }
      if (c === 2 && V.cs[v] / c >= 1) {
        for (let k = 0; k < 3; k++) out[o + k] = (2 / 3) * P[o + k] + (1 / 6) * V.csum[o + k];
        continue;
      }
      const be = loopBeta(n), chi = 1 / (3 / (8 * be) + n);
      for (let k = 0; k < 3; k++) out[o + k] = (1 - n * chi) * P[o + k] + chi * V.sum[o + k];
    }
    return out;
  }

  // subdivide(mesh, { levels = 1, scheme = "loop" | "butterfly", creases (set | angle), corners: [vertex],
  //   limit, keepBounds, eps }) → mesh (+ .creases: the child crease set, + nrm when the input had one).
  function subdivide(m0, opts) {
    const o = opts || {};
    const levels = o.levels == null ? 1 : Math.max(0, o.levels | 0);
    const scheme = o.scheme || "loop";
    if (scheme !== "loop" && scheme !== "butterfly") throw new Error("MeshDetail.subdivide: scheme " + scheme);
    const hadNrm = !!(m0.attrs && m0.attrs[NRM]);
    const G0 = geomOf(m0, o.eps);
    let m = clean(withoutAttr(m0, NRM), G0.gOf);
    let gOf = G0.gOf, nG = G0.nG, gPos = G0.gPos;
    let idx = m.indices, nV = vcount(m);
    let A = {};
    for (const k of names(m)) A[k] = m.attrs[k];
    let tg = geomTris(idx, gOf);
    let E = buildEdges(tg, nG);
    let sharp = sharpFor(m, gOf, E, o.creases);
    let corner = new Uint8Array(nG);
    if (o.corners) for (const v of o.corners) if (v < gOf.length) corner[gOf[v]] = 1;

    for (let L = 0; L < levels; L++) {
      const V = vertexSums(E, nG, gPos, sharp);
      const nG2 = nG + E.count;
      const P2 = new Float64Array(nG2 * 3);
      if (scheme === "loop") { loopEven(nG, gPos, V, corner, P2); loopOdd(E, tg, gPos, sharp, nG, P2); }
      else { P2.set(gPos.subarray(0, nG * 3)); butterflyOdd(E, tg, gPos, sharp, nG, V, corner, P2); }
      // attribute level: one new vertex per attribute edge (a seam edge gets one per side)
      const AE = buildEdges(idx, nV);
      const nV2 = nV + AE.count;
      const gOf2 = new Uint32Array(nV2);
      gOf2.set(gOf);
      for (let c = 0; c < idx.length; c++) gOf2[nV + AE.cornerEdge[c]] = nG + E.cornerEdge[c];
      const A2 = {};
      for (const k of Object.keys(A).sort()) {
        const a = A[k], s = a.size, Ctor = a.id ? a.data.constructor : Float32Array;
        const d = new Ctor(nV2 * s);
        d.set(a.data);
        for (let e = 0; e < AE.count; e++) {
          const u = AE.eA[e], w = AE.eB[e], to = (nV + e) * s;
          if (a.id) for (let j = 0; j < s; j++) d[to + j] = a.data[u * s + j];   // carried from the lower index
          else for (let j = 0; j < s; j++) d[to + j] = 0.5 * (a.data[u * s + j] + a.data[w * s + j]);
        }
        A2[k] = { data: d, size: s, id: a.id };
      }
      const T = idx.length / 3, idx2 = new Uint32Array(T * 12);
      for (let t = 0; t < T; t++) {
        const u0 = idx[t * 3], u1 = idx[t * 3 + 1], u2 = idx[t * 3 + 2];
        const m01 = nV + AE.cornerEdge[t * 3], m12 = nV + AE.cornerEdge[t * 3 + 1], m20 = nV + AE.cornerEdge[t * 3 + 2];
        const q = t * 12;
        idx2[q] = u0; idx2[q + 1] = m01; idx2[q + 2] = m20;
        idx2[q + 3] = m01; idx2[q + 4] = u1; idx2[q + 5] = m12;
        idx2[q + 6] = m20; idx2[q + 7] = m12; idx2[q + 8] = u2;
        idx2[q + 9] = m01; idx2[q + 10] = m12; idx2[q + 11] = m20;
      }
      // children of every sharp edge, sharpness - 1
      const ca = [], cb = [], cs = [];
      for (let e = 0; e < E.count; e++) {
        const s = sharp[e];
        if (!(s > 0) || E.eFc[e] !== 2) continue;   // fc ≠ 2 edges are re-derived as ∞ from topology
        const ns = s - 1;
        if (ns <= 0) continue;
        ca.push(E.eA[e], nG + e); cb.push(nG + e, E.eB[e]); cs.push(ns, ns);
      }
      const corner2 = new Uint8Array(nG2); corner2.set(corner);
      gOf = gOf2; nG = nG2; gPos = P2; idx = idx2; nV = nV2; A = A2; corner = corner2;
      tg = geomTris(idx, gOf);
      E = buildEdges(tg, nG);
      sharp = new Float64Array(E.count);
      for (let i = 0; i < ca.length; i++) { const e = findEdge(E, ca[i], cb[i]); if (e >= 0 && cs[i] > sharp[e]) sharp[e] = cs[i]; }
      for (let e = 0; e < E.count; e++) if (E.eFc[e] !== 2) sharp[e] = Infinity;
    }
    if (o.limit && scheme === "loop") gPos = loopLimit(nG, gPos, vertexSums(E, nG, gPos, sharp), corner);
    const P = new Float32Array(nV * 3);
    for (let u = 0; u < nV; u++) { const g = gOf[u] * 3; P[u * 3] = gPos[g]; P[u * 3 + 1] = gPos[g + 1]; P[u * 3 + 2] = gPos[g + 2]; }
    if (o.keepBounds) rescaleTo(P, bbox(m0.positions), bbox(P));
    // crease set of the output, named by a representative vertex per surface point
    const rep = new Int32Array(nG).fill(-1);
    for (let u = 0; u < nV; u++) if (rep[gOf[u]] < 0) rep[gOf[u]] = u;
    const cp = [], csh = [];
    for (let e = 0; e < E.count; e++) if (sharp[e] > 0) { cp.push(rep[E.eA[e]], rep[E.eB[e]]); csh.push(sharp[e]); }
    let out = { positions: P, indices: idx, attrs: A };
    const cset = creases(cp, csh);
    if (hadNrm) out = normals(out, { creases: cset, creaseAngle: o.creaseAngle != null ? o.creaseAngle : 180 });
    out.creases = cset;
    return out;
  }

  function bbox(P) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { const v = P[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
    return { min: mn, max: mx };
  }
  function rescaleTo(P, want, have) {
    for (let k = 0; k < 3; k++) {
      const eh = have.max[k] - have.min[k], ew = want.max[k] - want.min[k];
      const s = eh > 0 ? ew / eh : 1;
      for (let i = k; i < P.length; i += 3) P[i] = want.min[k] + (P[i] - have.min[k]) * s;
    }
  }

  // ---------- wedges (faces round a vertex, cut at creases) ----------

  // isCrease: Uint8Array per edge. Returns wOf (wedge per corner) and nW. Wedge ids follow first corner order.
  function wedges(E, tg, isCrease) {
    const N = tg.length, par = new Int32Array(N);
    for (let i = 0; i < N; i++) par[i] = i;
    const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    const join = (x, y) => { x = find(x); y = find(y); if (x !== y) { if (x < y) par[y] = x; else par[x] = y; } };
    for (let e = 0; e < E.count; e++) {
      if (isCrease[e] || E.eFc[e] !== 2) continue;
      const f0 = E.eF0[e], f1 = E.eF1[e], a = E.eA[e], b = E.eB[e];
      join(cornerAt(tg, f0, a), cornerAt(tg, f1, a));
      join(cornerAt(tg, f0, b), cornerAt(tg, f1, b));
    }
    const wOf = new Int32Array(N), id = new Int32Array(N).fill(-1);
    let nW = 0;
    for (let c = 0; c < N; c++) { const r = find(c); if (id[r] < 0) id[r] = nW++; wOf[c] = id[r]; }
    return { wOf, nW };
  }

  function wedgeNormals(tg, W, fr) {
    const wn = new Float64Array(W.nW * 3);
    for (let c = 0; c < tg.length; c++) {
      const f = (c / 3) | 0, w = W.wOf[c] * 3, a = fr.ang[c];
      wn[w] += a * fr.fn[f * 3]; wn[w + 1] += a * fr.fn[f * 3 + 1]; wn[w + 2] += a * fr.fn[f * 3 + 2];
    }
    for (let w = 0; w < W.nW; w++) {
      const x = wn[w * 3], y = wn[w * 3 + 1], z = wn[w * 3 + 2], l = Math.sqrt(x * x + y * y + z * z);
      if (l > 0) { wn[w * 3] = x / l; wn[w * 3 + 1] = y / l; wn[w * 3 + 2] = z / l; } else wn[w * 3 + 1] = 1;
    }
    return wn;
  }

  // One output vertex per (source vertex, wedge) pair actually used; outIdx per corner, src/wedge per output.
  function splitByWedge(I, nV, W) {
    const first = new Int32Array(nV).fill(-1), firstOut = new Int32Array(nV);
    const extra = new Map();
    const outIdx = new Uint32Array(I.length), src = [], wed = [];
    for (let c = 0; c < I.length; c++) {
      const u = I[c], w = W.wOf[c];
      let o;
      if (first[u] < 0) { first[u] = w; o = firstOut[u] = src.length; src.push(u); wed.push(w); }
      else if (first[u] === w) o = firstOut[u];
      else {
        const key = u * W.nW + w;
        o = extra.get(key);
        if (o === undefined) { o = src.length; extra.set(key, o); src.push(u); wed.push(w); }
      }
      outIdx[c] = o;
    }
    return { outIdx, src, wed };
  }

  function creaseFlags(m, gOf, E, tg, fr, angleDeg, set) {
    const fl = new Uint8Array(E.count);
    const cosT = Math.cos((angleDeg == null ? 40 : angleDeg) * Math.PI / 180);
    for (let e = 0; e < E.count; e++) {
      if (E.eFc[e] !== 2) { fl[e] = 1; continue; }
      const f0 = E.eF0[e], f1 = E.eF1[e];
      const d = fr.fn[f0 * 3] * fr.fn[f1 * 3] + fr.fn[f0 * 3 + 1] * fr.fn[f1 * 3 + 1] + fr.fn[f0 * 3 + 2] * fr.fn[f1 * 3 + 2];
      if (d < cosT - 1e-12) fl[e] = 1;
    }
    if (set != null) {
      const s = sharpFor(m, gOf, E, set);
      for (let e = 0; e < E.count; e++) if (s[e] > 0) fl[e] = 1;
    }
    return fl;
  }

  // normals(mesh, { creaseAngle = 40, creases }) → mesh with attr nrm (angle-weighted, split per wedge).
  function normals(m0, opts) {
    const o = opts || {};
    const G = geomOf(m0, o.eps);
    const m = clean(withoutAttr(m0, NRM), G.gOf);
    const tg = geomTris(m.indices, G.gOf);
    const E = buildEdges(tg, G.nG);
    const fr = faceFrames(tg, G.gPos);
    const W = wedges(E, tg, creaseFlags(m, G.gOf, E, tg, fr, o.creaseAngle, o.creases));
    const wn = wedgeNormals(tg, W, fr);
    const S = splitByWedge(m.indices, vcount(m), W);
    const n = S.src.length, P = new Float32Array(n * 3), A = newAttrs(m, n), Nn = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) {
      const u = S.src[v], w = S.wed[v];
      P[v * 3] = m.positions[u * 3]; P[v * 3 + 1] = m.positions[u * 3 + 1]; P[v * 3 + 2] = m.positions[u * 3 + 2];
      Nn[v * 3] = wn[w * 3]; Nn[v * 3 + 1] = wn[w * 3 + 1]; Nn[v * 3 + 2] = wn[w * 3 + 2];
      for (const k in A) { const s = A[k].size, sd = m.attrs[k].data, dd = A[k].data; for (let j = 0; j < s; j++) dd[v * s + j] = sd[u * s + j]; }
    }
    A[NRM] = { data: Nn, size: 3, id: false };
    return { positions: P, indices: S.outIdx, attrs: A };
  }

  // ---------- bevel ----------

  // bevel(mesh, { creases (set | angle, default 30°), width (default 1 % of the bbox diagonal), segments = 2 })
  // → mesh with nrm. Only crease edges between exactly two faces whose ends have closed fans are bevelled.
  function bevel(m0, opts) {
    const o = opts || {};
    const segs = Math.max(1, o.segments == null ? 2 : o.segments | 0);
    const G = geomOf(m0, o.eps);
    const m = clean(withoutAttr(m0, NRM), G.gOf);
    const gPos = G.gPos, nG = G.nG, I = m.indices;
    const tg = geomTris(I, G.gOf);
    const E = buildEdges(tg, nG);
    const fr = faceFrames(tg, gPos);
    const bb = bbox(m.positions);
    const diag = Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]);
    const width = o.width == null ? 0.01 * diag : o.width;
    const spec = o.creases == null ? 30 : o.creases;
    const cr = new Uint8Array(E.count);
    {
      const s = typeof spec === "number" ? null : sharpFor(m, G.gOf, E, spec);
      const fl = typeof spec === "number" ? creaseFlags(m, G.gOf, E, tg, fr, spec, null) : null;
      const open = new Uint8Array(nG);
      for (let e = 0; e < E.count; e++) if (E.eFc[e] !== 2) { open[E.eA[e]] = 1; open[E.eB[e]] = 1; }
      for (let e = 0; e < E.count; e++) {
        if (E.eFc[e] !== 2 || open[E.eA[e]] || open[E.eB[e]]) continue;
        if (fl ? fl[e] : s[e] > 0) cr[e] = 1;
      }
    }
    const W = wedges(E, tg, cr);
    const wn = wedgeNormals(tg, W, fr);
    // bounding crease entries per wedge: [edge, other endpoint, starts-CCW flag] ×2
    const bEdge = new Int32Array(W.nW * 2).fill(-1), bOther = new Int32Array(W.nW * 2), bStart = new Uint8Array(W.nW * 2);
    const bCount = new Uint8Array(W.nW);
    const wVert = new Int32Array(W.nW).fill(-1), wMinLen = new Float64Array(W.nW).fill(Infinity);
    for (let c = 0; c < tg.length; c++) {
      const w = W.wOf[c], base = c - (c % 3), k = c % 3;
      wVert[w] = tg[c];
      for (const nb of [tg[base + (k + 1) % 3], tg[base + (k + 2) % 3]]) {
        const l = Math.hypot(gPos[nb * 3] - gPos[tg[c] * 3], gPos[nb * 3 + 1] - gPos[tg[c] * 3 + 1], gPos[nb * 3 + 2] - gPos[tg[c] * 3 + 2]);
        if (l < wMinLen[w]) wMinLen[w] = l;
      }
    }
    let nCr = 0;
    const vCr = new Uint32Array(nG);
    for (let e = 0; e < E.count; e++) {
      if (!cr[e]) continue;
      nCr++;
      vCr[E.eA[e]]++; vCr[E.eB[e]]++;
      for (const f of [E.eF0[e], E.eF1[e]]) for (const v of [E.eA[e], E.eB[e]]) {
        const c = cornerAt(tg, f, v), w = W.wOf[c], other = v === E.eA[e] ? E.eB[e] : E.eA[e];
        const i = bCount[w]++;
        if (i < 2) { bEdge[w * 2 + i] = e; bOther[w * 2 + i] = other; bStart[w * 2 + i] = tg[c - (c % 3) + ((c % 3) + 1) % 3] === other ? 1 : 0; }
      }
    }
    // slid position of every wedge copy
    const wPos = new Float64Array(W.nW * 3);
    for (let w = 0; w < W.nW; w++) {
      const v = wVert[w], px = gPos[v * 3], py = gPos[v * 3 + 1], pz = gPos[v * 3 + 2];
      wPos[w * 3] = px; wPos[w * 3 + 1] = py; wPos[w * 3 + 2] = pz;
      if (bCount[w] !== 2 || bEdge[w * 2] === bEdge[w * 2 + 1]) continue;   // smooth, dart or tangled: stays put
      const si = bStart[w * 2] ? 0 : (bStart[w * 2 + 1] ? 1 : -1);
      if (si < 0) continue;
      const nx = wn[w * 3], ny = wn[w * 3 + 1], nz = wn[w * 3 + 2];
      const dir = (other) => {
        let x = gPos[other * 3] - px, y = gPos[other * 3 + 1] - py, z = gPos[other * 3 + 2] - pz;
        const d = x * nx + y * ny + z * nz; x -= d * nx; y -= d * ny; z -= d * nz;
        const l = Math.hypot(x, y, z); return l > 0 ? [x / l, y / l, z / l] : null;
      };
      const us = dir(bOther[w * 2 + si]), ue = dir(bOther[w * 2 + 1 - si]);
      if (!us || !ue) continue;
      const cx = us[1] * ue[2] - us[2] * ue[1], cy = us[2] * ue[0] - us[0] * ue[2], cz = us[0] * ue[1] - us[1] * ue[0];
      let th = Math.atan2(cx * nx + cy * ny + cz * nz, us[0] * ue[0] + us[1] * ue[1] + us[2] * ue[2]);
      if (th <= 0) th += TAU;
      const h = th * 0.5, ch = Math.cos(h), sh = Math.sin(h);
      const px2 = ny * us[2] - nz * us[1], py2 = nz * us[0] - nx * us[2], pz2 = nx * us[1] - ny * us[0];   // n × us
      const bx = ch * us[0] + sh * px2, by = ch * us[1] + sh * py2, bz = ch * us[2] + sh * pz2;
      const dist = Math.min(width / Math.max(sh, 0.25), 0.45 * wMinLen[w]);
      wPos[w * 3] = px + bx * dist; wPos[w * 3 + 1] = py + by * dist; wPos[w * 3 + 2] = pz + bz * dist;
    }
    // output vertices: (source, wedge) copies, then strip and corner vertices appended
    const S = splitByWedge(I, vcount(m), W);
    const nm = names(m);
    const P = [], Nn = [], AT = {};
    for (const k of nm) AT[k] = [];
    const nOut0 = S.src.length;
    for (let v = 0; v < nOut0; v++) {
      const u = S.src[v], w = S.wed[v];
      P.push(wPos[w * 3], wPos[w * 3 + 1], wPos[w * 3 + 2]);
      Nn.push(wn[w * 3], wn[w * 3 + 1], wn[w * 3 + 2]);
      for (const k of nm) { const a = m.attrs[k], s = a.size; for (let j = 0; j < s; j++) AT[k].push(a.data[u * s + j]); }
    }
    const outW = S.wed.slice();
    const tris = Array.from(S.outIdx);
    const idDiffer = (x, y) => {
      for (const k of nm) { const a = m.attrs[k]; if (!a.id) continue; for (let j = 0; j < a.size; j++) if (AT[k][x * a.size + j] !== AT[k][y * a.size + j]) return true; }
      return false;
    };
    const addVertex = (x, y, t, cx, cy, cz) => {   // on the arc from output vertex x (t=0) to y (t=1), control C
      const s0 = (1 - t) * (1 - t), s1 = 2 * t * (1 - t), s2 = t * t;
      const id = P.length / 3;
      P.push(s0 * P[x * 3] + s1 * cx + s2 * P[y * 3], s0 * P[x * 3 + 1] + s1 * cy + s2 * P[y * 3 + 1], s0 * P[x * 3 + 2] + s1 * cz + s2 * P[y * 3 + 2]);
      let nx = (1 - t) * Nn[x * 3] + t * Nn[y * 3], ny = (1 - t) * Nn[x * 3 + 1] + t * Nn[y * 3 + 1], nz = (1 - t) * Nn[x * 3 + 2] + t * Nn[y * 3 + 2];
      let l = Math.hypot(nx, ny, nz);
      if (l < 1e-6) {   // knife edge (opposite normals): point away from the chord midpoint
        nx = cx - 0.5 * (P[x * 3] + P[y * 3]); ny = cy - 0.5 * (P[x * 3 + 1] + P[y * 3 + 1]); nz = cz - 0.5 * (P[x * 3 + 2] + P[y * 3 + 2]);
        l = Math.hypot(nx, ny, nz) || 1;
      }
      Nn.push(nx / l, ny / l, nz / l);
      for (const k of nm) {
        const a = m.attrs[k], s = a.size, d = AT[k];
        for (let j = 0; j < s; j++) d.push(a.id ? d[x * s + j] : (1 - t) * d[x * s + j] + t * d[y * s + j]);
      }
      outW.push(-1);
      return id;
    };
    const rowKey = new Map();
    const rowAt = (v, x, y, e) => {   // S+1 output ids from x (side f0) to y (side f1) at geometry vertex v
      const row = new Array(segs + 1);
      row[0] = x; row[segs] = y;
      if (x === y) { for (let i = 1; i < segs; i++) row[i] = x; return row; }
      const shared = !idDiffer(x, y);
      const lo = Math.min(x, y), hi = Math.max(x, y);
      for (let i = 1; i < segs; i++) {
        const fromLo = x === lo ? i : segs - i;
        const key = shared ? (lo * nOut0 + hi) * (segs + 1) + fromLo : -((e * 2 + (v === E.eA[e] ? 0 : 1)) * (segs + 1) + i) - 1;
        let id = rowKey.get(key);
        if (id === undefined) { id = addVertex(x, y, i / segs, gPos[v * 3], gPos[v * 3 + 1], gPos[v * 3 + 2]); rowKey.set(key, id); }
        row[i] = id;
      }
      return row;
    };
    const tooSmall = 1e-10 * Math.max(width * width, 1e-12);
    const emit = (a, b, c) => {
      if (a === b || b === c || a === c) return;
      const ax = P[b * 3] - P[a * 3], ay = P[b * 3 + 1] - P[a * 3 + 1], az = P[b * 3 + 2] - P[a * 3 + 2];
      const bx = P[c * 3] - P[a * 3], by = P[c * 3 + 1] - P[a * 3 + 1], bz = P[c * 3 + 2] - P[a * 3 + 2];
      if (Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) <= tooSmall) return;
      tris.push(a, b, c);
    };
    const arcs = new Map();   // geometry vertex → [{ row, w0, w1 }] for corner fills
    // the output slot sat at corner c (corner index is the same as the source corner)
    for (let e = 0; e < E.count; e++) {
      if (!cr[e]) continue;
      let a = E.eA[e], b = E.eB[e];
      const f0 = E.eF0[e], f1 = E.eF1[e];
      const ca0 = cornerAt(tg, f0, a);
      if (tg[ca0 - (ca0 % 3) + ((ca0 % 3) + 1) % 3] !== b) { const t = a; a = b; b = t; }   // f0 runs a → b
      const xa = S.outIdx[cornerAt(tg, f0, a)], ya = S.outIdx[cornerAt(tg, f1, a)];
      const xb = S.outIdx[cornerAt(tg, f0, b)], yb = S.outIdx[cornerAt(tg, f1, b)];
      const RA = rowAt(a, xa, ya, e), RB = rowAt(b, xb, yb, e);
      for (let i = 0; i < segs; i++) { emit(RB[i], RA[i], RA[i + 1]); emit(RB[i], RA[i + 1], RB[i + 1]); }
      for (const [v, R, x, y] of [[a, RA, xa, ya], [b, RB, xb, yb]]) {
        if (vCr[v] < 3) continue;
        let list = arcs.get(v);
        if (!list) arcs.set(v, (list = []));
        list.push({ row: R, w0: outW[x], w1: outW[y] });
      }
    }
    // corner fans where ≥3 creases meet
    for (const [v, list] of arcs) {
      const used = new Uint8Array(list.length), loop = [];
      let cur = 0, wNext = list[0].w1;
      used[0] = 1; loop.push(...list[0].row);
      let ok = true;
      for (let n = 1; n < list.length; n++) {
        let j = -1, rev = false;
        for (let q = 0; q < list.length; q++) {
          if (used[q]) continue;
          if (list[q].w0 === wNext) { j = q; break; }
          if (list[q].w1 === wNext) { j = q; rev = true; break; }
        }
        if (j < 0) { ok = false; break; }
        used[j] = 1; cur = j;
        const r = rev ? list[j].row.slice().reverse() : list[j].row;
        loop.push(...r);
        wNext = rev ? list[j].w0 : list[j].w1;
      }
      if (!ok || wNext !== list[0].w0) continue;   // not one closed cycle: leave the corner open (stats shows it)
      const ring = [];
      for (const id of loop) if (ring[ring.length - 1] !== id) ring.push(id);
      if (ring.length > 1 && ring[0] === ring[ring.length - 1]) ring.pop();
      if (ring.length < 3) continue;
      // centre: halfway between the sharp corner and the mean slid copy; normal: the wedge normals' mean
      let mx = 0, my = 0, mz = 0, nx = 0, ny = 0, nz = 0, k = 0;
      for (const it of list) for (const w of [it.w0]) { mx += wPos[w * 3]; my += wPos[w * 3 + 1]; mz += wPos[w * 3 + 2]; nx += wn[w * 3]; ny += wn[w * 3 + 1]; nz += wn[w * 3 + 2]; k++; }
      const cx = 0.5 * gPos[v * 3] + 0.5 * mx / k, cy = 0.5 * gPos[v * 3 + 1] + 0.5 * my / k, cz = 0.5 * gPos[v * 3 + 2] + 0.5 * mz / k;
      const cid = P.length / 3;
      P.push(cx, cy, cz);
      const nl = Math.hypot(nx, ny, nz) || 1;
      Nn.push(nx / nl, ny / nl, nz / nl);
      for (const key of nm) {
        const a = m.attrs[key], s = a.size, d = AT[key];
        for (let j = 0; j < s; j++) {
          if (a.id) { d.push(d[ring[0] * s + j]); continue; }
          let acc = 0; for (const id of ring) acc += d[id * s + j];
          d.push(acc / ring.length);
        }
      }
      outW.push(-1);
      // orientation from the ring's Newell normal against the corner normal
      let sx = 0, sy = 0, sz = 0;
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i] * 3, q = ring[(i + 1) % ring.length] * 3;
        sx += (P[p + 1] - P[q + 1]) * (P[p + 2] + P[q + 2]);
        sy += (P[p + 2] - P[q + 2]) * (P[p] + P[q]);
        sz += (P[p] - P[q]) * (P[p + 1] + P[q + 1]);
      }
      const flip = sx * nx + sy * ny + sz * nz < 0;
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i], q = ring[(i + 1) % ring.length];
        if (flip) emit(cid, q, p); else emit(cid, p, q);
      }
    }
    // drop original faces the slide collapsed
    const keep = [];
    for (let t = 0; t < tris.length; t += 3) {
      const a = tris[t], b = tris[t + 1], c = tris[t + 2];
      const ax = P[b * 3] - P[a * 3], ay = P[b * 3 + 1] - P[a * 3 + 1], az = P[b * 3 + 2] - P[a * 3 + 2];
      const bx = P[c * 3] - P[a * 3], by = P[c * 3 + 1] - P[a * 3 + 1], bz = P[c * 3 + 2] - P[a * 3 + 2];
      if (a === b || b === c || a === c || Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) <= tooSmall) continue;
      keep.push(a, b, c);
    }
    const A = {};
    for (const k of nm) {
      const a = m.attrs[k], Ctor = a.id ? a.data.constructor : Float32Array;
      A[k] = { data: Ctor.from(AT[k]), size: a.size, id: a.id };
    }
    A[NRM] = { data: Float32Array.from(Nn), size: 3, id: false };
    const out = compact(Float32Array.from(P), Uint32Array.from(keep), A);
    out.bevelled = nCr;
    return out;
  }

  // ---------- simplify (QEM, half-edge collapse) ----------

  function addPlane(Q, v, a, b, c, d, w) {
    const o = v * 10;
    Q[o] += w * a * a; Q[o + 1] += w * a * b; Q[o + 2] += w * a * c; Q[o + 3] += w * a * d;
    Q[o + 4] += w * b * b; Q[o + 5] += w * b * c; Q[o + 6] += w * b * d;
    Q[o + 7] += w * c * c; Q[o + 8] += w * c * d; Q[o + 9] += w * d * d;
  }
  function qEval(Q, u, v, x, y, z) {
    const p = u * 10, q = v * 10;
    const q0 = Q[p] + Q[q], q1 = Q[p + 1] + Q[q + 1], q2 = Q[p + 2] + Q[q + 2], q3 = Q[p + 3] + Q[q + 3];
    const q4 = Q[p + 4] + Q[q + 4], q5 = Q[p + 5] + Q[q + 5], q6 = Q[p + 6] + Q[q + 6];
    const q7 = Q[p + 7] + Q[q + 7], q8 = Q[p + 8] + Q[q + 8], q9 = Q[p + 9] + Q[q + 9];
    return q0 * x * x + 2 * q1 * x * y + 2 * q2 * x * z + 2 * q3 * x + q4 * y * y + 2 * q5 * y * z + 2 * q6 * y + q7 * z * z + 2 * q8 * z + q9;
  }

  // simplify(mesh, { targetTris | ratio | error, lockBorders, attributeWeight = 1, locked: [vertex] })
  // → mesh (+ .reached: the face count hit the target, .maxError: the largest RMS plane distance accepted).
  function simplify(m0, opts) {
    const o = opts || {};
    const G = geomOf(m0, 0);
    const m = clean(m0, G.gOf);
    const nG = G.nG, gp = G.gPos;
    const T = m.indices.length / 3;
    let target = o.targetTris != null ? Math.max(0, o.targetTris | 0) : (o.ratio != null ? Math.round(T * o.ratio) : (o.error != null ? 0 : (T >> 1)));
    const maxErr2 = o.error != null ? o.error * o.error : Infinity;
    const aw = o.attributeWeight == null ? 1 : o.attributeWeight;
    const ai = Uint32Array.from(m.indices);           // attribute corners (mutable)
    const tg = geomTris(m.indices, G.gOf);   // Uint32Array like every other caller: keeps cornerAt monomorphic
    const fAlive = new Uint8Array(T).fill(1);
    const E = buildEdges(tg, nG);
    const fr = faceFrames(tg, gp);
    const Q = new Float64Array(nG * 10), Wt = new Float64Array(nG), area = new Float64Array(nG);
    for (let t = 0; t < T; t++) {
      const a = fr.fn[t * 3], b = fr.fn[t * 3 + 1], c = fr.fn[t * 3 + 2], p = tg[t * 3] * 3;
      const d = -(a * gp[p] + b * gp[p + 1] + c * gp[p + 2]), w = fr.fa[t];
      for (let k = 0; k < 3; k++) { const v = tg[t * 3 + k]; addPlane(Q, v, a, b, c, d, w); Wt[v] += w; area[v] += w; }
    }
    const nb = new Uint8Array(nG), ns = new Uint8Array(nG), locked = new Uint8Array(nG);
    if (o.locked) for (const v of o.locked) if (v < G.gOf.length) locked[G.gOf[v]] = 1;
    const constrain = (e, f, wgt) => {   // plane through edge e, perpendicular to face f
      const a = E.eA[e] * 3, b = E.eB[e] * 3;
      const ex = gp[b] - gp[a], ey = gp[b + 1] - gp[a + 1], ez = gp[b + 2] - gp[a + 2];
      const fx = fr.fn[f * 3], fy = fr.fn[f * 3 + 1], fz = fr.fn[f * 3 + 2];
      let px = ey * fz - ez * fy, py = ez * fx - ex * fz, pz = ex * fy - ey * fx;
      const l = Math.hypot(px, py, pz);
      if (!(l > 0)) return;
      px /= l; py /= l; pz /= l;
      const d = -(px * gp[a] + py * gp[a + 1] + pz * gp[a + 2]), w = wgt * (ex * ex + ey * ey + ez * ez);
      addPlane(Q, E.eA[e], px, py, pz, d, w); addPlane(Q, E.eB[e], px, py, pz, d, w);
    };
    for (let e = 0; e < E.count; e++) {
      const a = E.eA[e], b = E.eB[e];
      if (E.eFc[e] > 2) { locked[a] = locked[b] = 1; continue; }
      if (E.eFc[e] === 1) { nb[a]++; nb[b]++; constrain(e, E.eF0[e], 100); continue; }
      const f0 = E.eF0[e], f1 = E.eF1[e];
      const seam = ai[cornerAt(tg, f0, a)] !== ai[cornerAt(tg, f1, a)] || ai[cornerAt(tg, f0, b)] !== ai[cornerAt(tg, f1, b)];
      if (seam) { ns[a]++; ns[b]++; constrain(e, f0, 100); constrain(e, f1, 100); }
    }
    for (let v = 0; v < nG; v++) {
      if ((nb[v] && nb[v] !== 2) || (ns[v] && ns[v] !== 2) || (nb[v] && ns[v]) || (o.lockBorders && nb[v])) locked[v] = 1;
    }
    // face lists per surface point
    const VC = vertexCorners(tg, nG);
    const vf = new Array(nG);
    for (let v = 0; v < nG; v++) { const l = []; for (let j = VC.start[v]; j < VC.start[v + 1]; j++) l.push((VC.list[j] / 3) | 0); vf[v] = l; }
    const alive = new Uint8Array(nG).fill(1), ver = new Uint32Array(nG);
    const mark = new Uint32Array(nG);
    let stamp = 0;
    const mapX = [], mapY = [];
    const nm = names(m);
    const attrD2 = (x, y) => {
      let d2 = 0;
      for (const k of nm) { const a = m.attrs[k]; if (a.id) continue; for (let j = 0; j < a.size; j++) { const d = a.data[x * a.size + j] - a.data[y * a.size + j]; d2 += d * d; } }
      return d2;
    };
    // Cost of moving u onto v, or -1 when the collapse is not allowed. Fills mapX → mapY (u's corners → v's).
    // quick: the cost and the cheap topology checks only (queueing); the full check runs when it is popped.
    function evaluate(u, v, quick) {
      if (!alive[u] || !alive[v] || locked[u] || u === v) return -1;
      mapX.length = 0; mapY.length = 0;
      let shared = 0;
      const fu = vf[u];
      for (let i = 0; i < fu.length; i++) {
        const f = fu[i];
        if (!fAlive[f]) continue;
        const cv = cornerAt(tg, f, v);
        if (cv < 0) continue;
        shared++;
        const x = ai[cornerAt(tg, f, u)], y = ai[cv];
        let j = mapX.indexOf(x);
        if (j < 0) { mapX.push(x); mapY.push(y); } else if (mapY[j] !== y) return -1;
      }
      if (shared === 0 || shared > 2) return -1;
      if (nb[u] && shared !== 1) return -1;
      if (!nb[u] && shared !== 2) return -1;
      if (ns[u]) {   // must slide along its seam: both sides' corners differ here
        if (mapX.length !== 2) return -1;
      }
      const vx = gp[v * 3], vy = gp[v * 3 + 1], vz = gp[v * 3 + 2];
      let cost = qEval(Q, u, v, vx, vy, vz);
      if (cost < 0) cost = 0;
      if (aw > 0 && nm.length) {
        let d2 = 0;
        for (let i = 0; i < mapX.length; i++) d2 = Math.max(d2, attrD2(mapX[i], mapY[i]));
        const ex = vx - gp[u * 3], ey = vy - gp[u * 3 + 1], ez = vz - gp[u * 3 + 2];
        cost += aw * area[u] * (ex * ex + ey * ey + ez * ez) * d2;
      }
      if (quick) return cost;
      // every corner of u must have a destination
      for (let i = 0; i < fu.length; i++) { const f = fu[i]; if (fAlive[f] && mapX.indexOf(ai[cornerAt(tg, f, u)]) < 0) return -1; }
      // link condition
      stamp++;
      for (let i = 0; i < fu.length; i++) { const f = fu[i]; if (!fAlive[f]) continue; for (let k = 0; k < 3; k++) mark[tg[f * 3 + k]] = stamp; }
      let common = 0;
      stamp++;
      const s1 = stamp - 1;
      const fv = vf[v];
      for (let i = 0; i < fv.length; i++) {
        const f = fv[i]; if (!fAlive[f]) continue;
        for (let k = 0; k < 3; k++) { const w = tg[f * 3 + k]; if (w !== u && w !== v && mark[w] === s1) { common++; mark[w] = stamp; } }
      }
      if (common !== shared) return -1;
      // flips: every face of u that survives keeps its orientation (within ~78°) and some area
      for (let i = 0; i < fu.length; i++) {
        const f = fu[i];
        if (!fAlive[f]) continue;
        const b0 = f * 3;
        const t0 = tg[b0], t1 = tg[b0 + 1], t2 = tg[b0 + 2];
        if (t0 === v || t1 === v || t2 === v) continue;
        // rotate so u is first: (u, p, q)
        const p = t0 === u ? t1 : t1 === u ? t2 : t0, q = t0 === u ? t2 : t1 === u ? t0 : t1;
        const ux = gp[u * 3], uy = gp[u * 3 + 1], uz = gp[u * 3 + 2];
        const px = gp[p * 3], py = gp[p * 3 + 1], pz = gp[p * 3 + 2], qx = gp[q * 3], qy = gp[q * 3 + 1], qz = gp[q * 3 + 2];
        const ax = px - ux, ay = py - uy, az = pz - uz, bx = qx - ux, by = qy - uy, bz = qz - uz;
        const n0x = ay * bz - az * by, n0y = az * bx - ax * bz, n0z = ax * by - ay * bx;
        const cx = px - vx, cy = py - vy, cz = pz - vz, dx = qx - vx, dy = qy - vy, dz = qz - vz;
        const n1x = cy * dz - cz * dy, n1y = cz * dx - cx * dz, n1z = cx * dy - cy * dx;
        const l0 = Math.sqrt(n0x * n0x + n0y * n0y + n0z * n0z), l1 = Math.sqrt(n1x * n1x + n1y * n1y + n1z * n1z);
        if (!(l1 > 1e-20) || (n0x * n1x + n0y * n1y + n0z * n1z) < 0.2 * l0 * l1) return -1;
      }
      return cost;
    }
    // binary heap of entries (cost, from, to, ver-from, ver-to); ties break on entry order → deterministic
    let cap = Math.max(1024, E.count * 2), nE = 0, nH = 0;
    let hc = new Float64Array(cap), hu = new Int32Array(cap), hv = new Int32Array(cap), hsu = new Uint32Array(cap), hsv = new Uint32Array(cap), heap = new Int32Array(cap);
    const grow = (a) => { const b = new a.constructor(cap); b.set(a); return b; };
    const less = (i, j) => hc[i] < hc[j] || (hc[i] === hc[j] && i < j);
    function push(u, v, c) {
      if (nE === hc.length || nH === heap.length) {
        cap *= 2;
        hc = grow(hc); hu = grow(hu); hv = grow(hv); hsu = grow(hsu); hsv = grow(hsv); heap = grow(heap);
      }
      const id = nE++;
      hc[id] = c; hu[id] = u; hv[id] = v; hsu[id] = ver[u]; hsv[id] = ver[v];
      let i = nH++;
      heap[i] = id;
      while (i > 0) { const p = (i - 1) >> 1; if (!less(heap[i], heap[p])) break; const t = heap[i]; heap[i] = heap[p]; heap[p] = t; i = p; }
    }
    function pop() {
      const top = heap[0], last = heap[--nH];
      if (nH) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1; let s = i;
          if (l < nH && less(heap[l], heap[s])) s = l;
          if (r < nH && less(heap[r], heap[s])) s = r;
          if (s === i) break;
          const t = heap[i]; heap[i] = heap[s]; heap[s] = t; i = s;
        }
      }
      return top;
    }
    const errOf = (u, v, c) => c / Math.max(Wt[u] + Wt[v], 1e-30);
    function offer(a, b) {
      const c1 = evaluate(a, b, true), c2 = evaluate(b, a, true);
      if (c1 < 0 && c2 < 0) return;
      if (c2 < 0 || (c1 >= 0 && c1 <= c2)) push(a, b, c1); else push(b, a, c2);
    }
    function neighbours(v, out) {
      stamp++;
      out.length = 0;
      const fv = vf[v];
      for (let i = 0; i < fv.length; i++) {
        const f = fv[i]; if (!fAlive[f]) continue;
        for (let k = 0; k < 3; k++) { const w = tg[f * 3 + k]; if (w !== v && mark[w] !== stamp) { mark[w] = stamp; out.push(w); } }
      }
      return out;
    }
    let faces = T, maxErr = 0;
    const nbuf = [];
    for (let pass = 0; pass < 4 && faces > target; pass++) {
      nE = 0; nH = 0;
      for (let v = 0; v < nG; v++) {
        if (!alive[v]) continue;
        neighbours(v, nbuf);
        for (const w of nbuf.slice()) if (w > v) offer(v, w);
      }
      let did = 0;
      while (nH && faces > target) {
        const id = pop(), u = hu[id], v = hv[id];
        if (!alive[u] || !alive[v] || hsu[id] !== ver[u] || hsv[id] !== ver[v]) continue;
        const c = evaluate(u, v, false);
        if (c < 0) {   // this direction is blocked now: queue the reverse if it is allowed
          const r = evaluate(v, u, false);
          if (r >= 0) push(v, u, r);
          continue;
        }
        if (c > hc[id] * (1 + 1e-9) + 1e-30) { push(u, v, c); continue; }
        const err = errOf(u, v, c);
        if (err > maxErr2) continue;
        // apply u → v
        const fu = vf[u], fv = vf[v];
        for (let i = 0; i < fu.length; i++) {
          const f = fu[i];
          if (!fAlive[f]) continue;
          if (cornerAt(tg, f, v) >= 0) { fAlive[f] = 0; faces--; continue; }
          const cu = cornerAt(tg, f, u);
          ai[cu] = mapY[mapX.indexOf(ai[cu])];
          tg[cu] = v;
          fv.push(f);
        }
        vf[u] = [];
        vf[v] = fv.filter((f) => fAlive[f]);
        for (let k = 0; k < 10; k++) Q[v * 10 + k] += Q[u * 10 + k];
        Wt[v] += Wt[u]; area[v] += area[u];
        alive[u] = 0; ver[v]++;
        if (err > maxErr) maxErr = err;
        did++;
        neighbours(v, nbuf);
        for (const w of nbuf.slice()) offer(v, w);
      }
      if (!did) break;
    }
    const out = [];
    for (let t = 0; t < T; t++) if (fAlive[t]) out.push(ai[t * 3], ai[t * 3 + 1], ai[t * 3 + 2]);
    const res = compact(m.positions, Uint32Array.from(out), m.attrs);
    res.reached = faces <= target;
    res.maxError = Math.sqrt(maxErr);
    return res;
  }

  // ---------- stats ----------

  // stats(mesh) → { tris, verts, degenerate, unreferenced, bbox, edges, boundaryEdges, manifoldEdges,
  //   nonManifoldEdges, watertight, openIndexEdges } (edges counted on the exactly-welded surface).
  function stats(m) {
    const G = geomOf(m, 0);
    const I = m.indices, T = I.length / 3;
    const bb = bbox(m.positions);
    const diag = Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]);
    const tiny = 1e-12 * diag * diag;
    let degenerate = 0;
    for (let t = 0; t < T; t++) {
      const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2], P = m.positions;
      if (G.gOf[a] === G.gOf[b] || G.gOf[b] === G.gOf[c] || G.gOf[a] === G.gOf[c]) { degenerate++; continue; }
      const ax = P[b * 3] - P[a * 3], ay = P[b * 3 + 1] - P[a * 3 + 1], az = P[b * 3 + 2] - P[a * 3 + 2];
      const bx = P[c * 3] - P[a * 3], by = P[c * 3 + 1] - P[a * 3 + 1], bz = P[c * 3 + 2] - P[a * 3 + 2];
      if (Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) <= tiny) degenerate++;
    }
    const used = new Uint8Array(vcount(m));
    for (let i = 0; i < I.length; i++) used[I[i]] = 1;
    let unreferenced = 0;
    for (let i = 0; i < used.length; i++) if (!used[i]) unreferenced++;
    const tg = geomTris(clean(m, G.gOf).indices, G.gOf);
    const E = buildEdges(tg, G.nG);
    let b = 0, mf = 0, nmf = 0;
    for (let e = 0; e < E.count; e++) { const c = E.eFc[e]; if (c === 1) b++; else if (c === 2) mf++; else nmf++; }
    // the same count on vertex INDICES: an open index edge with a closed surface edge is a seam (or a crack in
    // an op that should have shared the vertex); 0 means index-level closed
    const IE = buildEdges(clean(m, G.gOf).indices, vcount(m));
    let ib = 0;
    for (let e = 0; e < IE.count; e++) if (IE.eFc[e] === 1) ib++;
    return { tris: T, verts: vcount(m), degenerate, unreferenced, bbox: bb, edges: E.count, boundaryEdges: b, manifoldEdges: mf, nonManifoldEdges: nmf, watertight: b === 0 && nmf === 0, openIndexEdges: ib };
  }

  return { NRM, mesh, fromGeom, toGeom, weld, unweld, creases, creaseEdges, subdivide, normals, bevel, simplify, stats };
})();
Object.freeze(MeshDetail);
