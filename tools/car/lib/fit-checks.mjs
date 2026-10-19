// The four fit checks over an analyse()d car (tools/car/lib/fit-geom.mjs).
// @doc Fit-audit checks over an analysed car: GAP, PENETRATION, ZFIGHT, OPEN edges.
// Each returns rows { check, a, b, value, unit, fail, where, note }; `a`/`b`
// are SECTION names, so a row key survives vertex renumbering between trees
// (the --base comparison keys on car|style|check|a|b).
import { FIT, eachNear, closestOnTri } from "./fit-geom.mjs";

const TYRE_MATS = new Set([22, 33]);   // SURFACES.rubber, SURFACES.sidewall (js/car/car-materials.js)
const r3 = (v) => Math.round(v * 1000) / 1000;
const mm = (m) => Math.round(m * 10000) / 10;   // metres -> mm, 0.1 mm
const at = (p) => p ? [r3(p[0]), r3(p[1]), r3(p[2])] : null;

function find(p, i) { while (p[i] !== i) { p[i] = p[p[i]]; i = p[i]; } return i; }

// Unique welded vertices of a piece, as positions [x,y,z,...].
function pieceVerts(A, p) {
  const seen = new Set(), out = [];
  for (const t of p.tris) for (let k = 0; k < 3; k++) {
    const v = A.mesh.idx[t * 3 + k], w = A.wid[v];
    if (seen.has(w)) continue;
    seen.add(w); out.push(A.mesh.pos[v * 3], A.mesh.pos[v * 3 + 1], A.mesh.pos[v * 3 + 2]);
  }
  return out;
}
const pieceVisible = (A, p) => p.tris.some((t) => A.vis[t]);

// ── GAP ────────────────────────────────────────────────────────────────────
// Union pieces that touch (vertex within ATTACH_MM of another piece's
// surface). The cluster holding the biggest chassis piece IS the car; every
// other VISIBLE cluster floats, and its gap is its nearest distance to any
// triangle outside it. Also returns the contact table (which sections touch),
// the "joints" of the report.
export function gaps(A) {
  const P = A.pieces, par = new Int32Array(P.length);
  for (let i = 0; i < P.length; i++) par[i] = i;
  const r = FIT.ATTACH_MM / 1000, cp = new Float64Array(4), contacts = new Map();
  const verts = P.map((p) => pieceVerts(A, p));
  for (const p of P) {
    const V = verts[p.id];
    for (let i = 0; i < V.length; i += 3) {
      eachNear(A, V[i], V[i + 1], V[i + 2], r, (t) => {
        const q = A.piece[t];
        if (q === p.id || find(par, q) === find(par, p.id) && A.sec[t] === p.sec) return;
        if (closestOnTri(A.T, t, V[i], V[i + 1], V[i + 2], cp) > r) return;
        const ra = find(par, p.id), rb = find(par, q);
        if (ra !== rb) par[rb] = ra;
        if (A.sec[t] !== p.sec) {
          const a = A.S.names[p.sec], b = A.S.names[A.sec[t]], k = a < b ? a + "|" + b : b + "|" + a;
          contacts.set(k, (contacts.get(k) || 0) + 1);
        }
      });
    }
  }
  const chassisIdx = A.S.names.indexOf("chassis");
  let main = -1, bestA = -1;
  for (const p of P) if (p.sec === chassisIdx && p.area > bestA) { bestA = p.area; main = p.id; }
  if (main < 0) for (const p of P) if (p.area > bestA) { bestA = p.area; main = p.id; }
  const mainRoot = find(par, main), clusters = new Map();
  for (const p of P) {
    const root = find(par, p.id);
    if (root === mainRoot) continue;
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(p);
  }
  const rows = [];
  for (const members of clusters.values()) {
    if (!members.some((p) => pieceVisible(A, p))) continue;   // sealed inside the body: nobody sees it float
    const inC = new Set(members.map((p) => p.id));
    let best = FIT.GAP_SEARCH_MM / 1000, bestT = -1, from = null;
    for (const p of members) {
      const V = verts[p.id];
      for (let i = 0; i < V.length; i += 3) {
        eachNear(A, V[i], V[i + 1], V[i + 2], best, (t) => {
          if (inC.has(A.piece[t])) return;
          const d = closestOnTri(A.T, t, V[i], V[i + 1], V[i + 2], cp);
          if (d < best) { best = d; bestT = t; from = [V[i], V[i + 1], V[i + 2]]; }
        });
      }
    }
    const secs = [...new Set(members.map((p) => A.S.names[p.sec]))].sort();
    const b = bestT >= 0 ? A.S.names[A.sec[bestT]] : "(nothing within " + FIT.GAP_SEARCH_MM + " mm)";
    const gapMM = bestT >= 0 ? mm(best) : FIT.GAP_SEARCH_MM;
    const bb = bbox(A, members);
    rows.push({ check: "GAP", a: secs.join("+"), b, value: gapMM, unit: "mm", fail: gapMM > FIT.GAP_MM,
      where: at(from || bb.c), note: `floating cluster of ${members.length} piece(s), size ${bb.s.map((v) => mm(v)).join("x")} mm` });
  }
  const joints = [...contacts.entries()].map(([k, n]) => ({ pair: k, contacts: n })).sort((x, y) => x.pair < y.pair ? -1 : 1);
  return { rows, joints };
}

function bbox(A, members) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of members) for (const t of p.tris) for (let k = 0; k < 9; k++) {
    const v = A.T.a[t * 9 + k], c = k % 3;
    if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v;
  }
  return { c: [0, 1, 2].map((c) => (lo[c] + hi[c]) / 2), s: [0, 1, 2].map((c) => hi[c] - lo[c]) };
}

// ── PENETRATION ────────────────────────────────────────────────────────────
// The normal-sign test: for each vertex of section A, take the nearest
// triangle of any OTHER section within PEN_SEARCH_MM. If that triangle
// belongs to a CLOSED piece (no boundary edges: an open shell has no inside)
// and the vertex lies behind it (dot(v - closest, normal) < 0, with the
// summed normals of every tied face when the closest point is an edge or a
// corner), the vertex is inside that piece at depth = the distance. Only
// intrusions under a VISIBLE face count. Rows are per (A into B) pair.
export function penetration(A) {
  const R = FIT.PEN_SEARCH_MM / 1000, cp = new Float64Array(4), agg = new Map();
  for (const p of A.pieces) {
    const V = pieceVerts(A, p);
    for (let i = 0; i < V.length; i += 3) {
      const x = V[i], y = V[i + 1], z = V[i + 2];
      let best = R, bestT = -1;
      const ties = [];
      eachNear(A, x, y, z, R, (t) => {
        if (A.sec[t] === p.sec) return;
        const d = closestOnTri(A.T, t, x, y, z, cp);
        if (d < best - 1e-7) { best = d; bestT = t; ties.length = 0; ties.push([t, cp[0], cp[1], cp[2]]); }
        else if (d <= best + 1e-7 && bestT >= 0) ties.push([t, cp[0], cp[1], cp[2]]);
      });
      if (bestT < 0 || best < 1e-6) continue;
      const q = A.pieces[A.piece[bestT]];
      if (!q.closed || !A.vis[bestT]) continue;
      let nx = 0, ny = 0, nz = 0;
      for (const [t] of ties) if (A.piece[t] === q.id) { nx += A.nrm[t * 3]; ny += A.nrm[t * 3 + 1]; nz += A.nrm[t * 3 + 2]; }
      const [, cx, cy, cz] = ties[0];
      if ((x - cx) * nx + (y - cy) * ny + (z - cz) * nz >= 0) continue;
      const a = A.S.names[p.sec], b = A.S.names[q.sec], tyre = TYRE_MATS.has(q.mat);
      const key = a + ">" + b + (tyre ? ":tyre" : "");
      const g = agg.get(key) || { a, b: tyre ? b + " (tyre)" : b, tyre, depth: 0, n: 0, where: null };
      g.n++;
      if (best > g.depth) { g.depth = best; g.where = [x, y, z]; }
      agg.set(key, g);
    }
  }
  return [...agg.values()].map((g) => {
    const lim = g.tyre ? FIT.TYRE_PEN_MM : FIT.PEN_MM, v = mm(g.depth);
    return { check: "PENETRATION", a: g.a, b: g.b, value: v, unit: "mm", fail: v > lim, where: at(g.where),
             note: `${g.n} vertex(es) inside; limit ${lim} mm` };
  });
}

// Same colour (within parts-sweep COLOUR_DELTA 0.06) and same surface id.
function sameLook(A, t, u) {
  const m = A.mesh, a = m.idx[t * 3], b = m.idx[u * 3];
  if (m.mat && m.mat[a] !== m.mat[b]) return false;
  return Math.abs(m.col[a * 3] - m.col[b * 3]) + Math.abs(m.col[a * 3 + 1] - m.col[b * 3 + 1]) + Math.abs(m.col[a * 3 + 2] - m.col[b * 3 + 2]) < 0.06;
}

// ── Z-FIGHT ────────────────────────────────────────────────────────────────
// Two VISIBLE, same-facing faces (cos > ZFIGHT_COS) that share no vertex and
// lie within ZFIGHT_MM of each other: four samples per face (centroid and the
// three centroid-vertex midpoints), each hit worth a quarter of the smaller
// face. Summed per section pair (a section may fight itself: two plates of
// one part).
export function zfight(A) {
  const r = FIT.ZFIGHT_MM / 1000, cp = new Float64Array(4), agg = new Map(), T = A.T;
  for (let t = 0; t < T.n; t++) {
    if (!A.vis[t] || !A.live(t)) continue;
    const o = t * 9, w0 = A.wid[A.mesh.idx[t * 3]], w1 = A.wid[A.mesh.idx[t * 3 + 1]], w2 = A.wid[A.mesh.idx[t * 3 + 2]];
    const gx = (T.a[o] + T.a[o + 3] + T.a[o + 6]) / 3, gy = (T.a[o + 1] + T.a[o + 4] + T.a[o + 7]) / 3, gz = (T.a[o + 2] + T.a[o + 5] + T.a[o + 8]) / 3;
    const samples = [[gx, gy, gz]];
    for (let k = 0; k < 3; k++) samples.push([(gx + T.a[o + k * 3]) / 2, (gy + T.a[o + k * 3 + 1]) / 2, (gz + T.a[o + k * 3 + 2]) / 2]);
    const hits = new Map();
    for (const [x, y, z] of samples) {
      eachNear(A, x, y, z, r, (u) => {
        if (u <= t || !A.vis[u]) return;   // each unordered pair once
        const dot = A.nrm[t * 3] * A.nrm[u * 3] + A.nrm[t * 3 + 1] * A.nrm[u * 3 + 1] + A.nrm[t * 3 + 2] * A.nrm[u * 3 + 2];
        if (dot < FIT.ZFIGHT_COS) return;
        for (let k = 0; k < 3; k++) { const w = A.wid[A.mesh.idx[u * 3 + k]]; if (w === w0 || w === w1 || w === w2) return; }
        if (closestOnTri(T, u, x, y, z, cp) > r) return;
        if (sameLook(A, t, u)) return;   // identical colour and surface: the fight cannot show
        hits.set(u, (hits.get(u) || 0) + 1);
      });
    }
    for (const [u, n] of hits) {
      const a = A.S.names[A.sec[t]], b = A.S.names[A.sec[u]], key = a < b ? a + "|" + b : b + "|" + a;
      const g = agg.get(key) || { a: a < b ? a : b, b: a < b ? b : a, area: 0, n: 0, where: null, big: 0 };
      const add = Math.min(A.area[t], A.area[u]) * n / 4;
      g.area += add; g.n++;
      if (add > g.big) { g.big = add; g.where = [gx, gy, gz]; }
      agg.set(key, g);
    }
  }
  return [...agg.values()].map((g) => ({ check: "ZFIGHT", a: g.a, b: g.b, value: Math.round(g.area * 1e6) / 100, unit: "cm2",
    fail: g.area > FIT.ZFIGHT_AREA_M2, where: at(g.where), note: `${g.n} face pair(s) within ${FIT.ZFIGHT_MM} mm` }));
}

// ── OPEN EDGES ─────────────────────────────────────────────────────────────
// Welded boundary edges (one face) on VISIBLE faces, summed per section: a
// hole or a paper-thin unclosed rim the player can see. Non-manifold counts
// (edges of 3+ faces: welded primitives sharing a rim) ride along in `note`;
// they render fine and never fail.
export function openEdges(A) {
  const agg = new Map(), T = A.T;
  for (const e of A.openEdges) {
    if (!A.vis[e.t]) continue;
    const o = e.t * 9, k2 = (e.k + 1) % 3;
    const len = Math.hypot(T.a[o + e.k * 3] - T.a[o + k2 * 3], T.a[o + e.k * 3 + 1] - T.a[o + k2 * 3 + 1], T.a[o + e.k * 3 + 2] - T.a[o + k2 * 3 + 2]);
    const s = A.S.names[A.sec[e.t]], g = agg.get(s) || { len: 0, n: 0, big: 0, where: null };
    g.len += len; g.n++;
    if (len > g.big) { g.big = len; g.where = [T.a[o + e.k * 3], T.a[o + e.k * 3 + 1], T.a[o + e.k * 3 + 2]]; }
    agg.set(s, g);
  }
  const nm = new Map();
  for (const p of A.pieces) nm.set(p.sec, (nm.get(p.sec) || 0) + p.nonManifold);
  return [...agg.entries()].map(([s, g]) => ({ check: "OPEN", a: s, b: "-", value: mm(g.len), unit: "mm",
    fail: mm(g.len) > FIT.OPEN_MM, where: at(g.where),
    note: `${g.n} visible boundary edge(s); ${nm.get(A.S.names.indexOf(s)) || 0} non-manifold` }));
}
