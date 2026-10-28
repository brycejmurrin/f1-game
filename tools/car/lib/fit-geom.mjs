// Geometry core for tools/car/car-fit-audit.mjs: how the Car3D parts JOIN.
// @doc Fit-audit geometry core: load/build Car3D cars, weld pieces, grid queries, visibility mask.
// Pure functions over a Car3D mesh ({pos, idx, mat, parts}); no browser, no DOM.
//
// Vocabulary (docs/notes/FIT-AUDIT.md has the long form):
//   section — one Car3D part("…") marker range (chassis, frontWing, wheels, …),
//             from build({measure:true}).parts[].from/to. Vertices past the last
//             section are buildComplete()'s active-aero flaps: section "aeroFlaps".
//   piece   — one connected solid inside a section: triangles joined through
//             WELDED vertex positions. Car3D emits flat-shaded geometry (a box
//             is 24 unshared vertices), so index connectivity alone would split
//             every box into six loose faces. Welding is per section, so two
//             parts that merely touch never fuse into one piece.
//   cluster — pieces joined by surface contact (within FIT.ATTACH_MM), across
//             sections. The car is the cluster holding the chassis; any other
//             visible cluster is a part that floats.
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

// ── thresholds ─────────────────────────────────────────────────────────────
// THE OPTICAL ANCHOR is parts-sweep.mjs's: the audit camera (720x560, 34 deg
// FOV, 3.9-6.4 m) resolves ~6 mm per pixel, and the garage close-up a phone
// player actually sees (~2 m) ~2 mm per pixel. Every distance below is stated
// against those two numbers. Frozen: the unit test asserts them, and widening
// one to shrink a report is the tolerance-widening AGENTS.md prohibits.
export const FIT = Object.freeze({
  // Positions closer than this are one vertex. Car3D builds a box's faces from
  // the same arithmetic, so shared corners agree to ~1e-7 m; 0.05 mm is far
  // above float noise and far below any real feature (the thinnest plate in
  // car3d.js is a 2 mm gurney).
  WELD_MM: 0.05,
  // Two surfaces this close are TOUCHING. 3 mm is ~1.5 px at the 2 m garage
  // close-up: the widest seam that still reads as a joint line, not daylight.
  ATTACH_MM: 3,
  // A floating cluster further than this from the car is a FAIL. Same number:
  // anything that does not touch is, by definition, a visible gap at close-up.
  GAP_MM: 3,
  // How far a floating cluster's gap is searched. Past this it is reported as
  // ">250 mm" — a part that far off is not a fit error, it is a placement one.
  GAP_SEARCH_MM: 250,
  // PENETRATION into a TYRE (surfaces rubber/sidewall). The tyre turns and
  // steers, so nothing may sit inside it; 3 mm is the ATTACH seam — a part
  // resting ON the tread is fine, one sunk into it is the F10 scoop.
  TYRE_PEN_MM: 3,
  // PENETRATION between any other two sections. Box-built bodywork overlaps by
  // design (a pylon foot is sunk into the wing so the seam closes), so a small
  // embed is the join, not a defect. 20 mm is parts-sweep's WEAK_MM (~3 px at
  // the audit camera): deeper than that, one part visibly passes into another
  // instead of meeting it. Reported per section pair, so the table names the
  // pair to look at; only VISIBLE intrusions count (the hidden side of a cover
  // can be full of overlapping internals and nobody sees it).
  PEN_MM: 20,
  // How far below a surface a vertex is still tested for being "inside". The
  // nearest-triangle sign test is local; past this the nearest face can belong
  // to the other side of a thin part and the sign means nothing.
  PEN_SEARCH_MM: 60,
  // Z-FIGHT: two same-facing faces closer than this along their normal flicker.
  // A 24-bit depth buffer with a 0.1 m near plane resolves z^2/(near*2^24):
  // 0.015 mm at the 5 m garage camera, 0.24 mm at a 20 m chase/TV camera. 0.25 mm
  // is the chase-camera figure: coplanar faces closer than that fight on track.
  ZFIGHT_MM: 0.25,
  // Facing agreement for a z-fight pair: within ~2.6 deg (cos 0.999).
  ZFIGHT_COS: 0.999,
  // Overlap below this is invisible; 1 cm^2 is a ~5x5 px patch at close-up.
  ZFIGHT_AREA_M2: 1e-4,
  // Visible boundary edge length (per section) that FAILs OPEN EDGES. 50 mm is
  // ~8 px at the audit camera: a hole edge you can see, not a sliver.
  OPEN_MM: 50,
});

// ── loading ────────────────────────────────────────────────────────────────
// The same module set as parts-sweep.mjs loadParts(), but rooted anywhere so
// --base can build an older tree's cars. A file the older tree lacks is
// skipped (the roster grows; the build only needs what Car3D reads).
export const CAR_FILES = Object.freeze(["js/core/log.js", "js/core/mat4.js", "js/data/teams.js", "js/car/parts.js",
  "js/car/livery-design.js", "js/car/livery-graphics.js", "js/car/crest-draw.js", "js/car/liverytex.js", "js/car/helmets.js",
  "js/car/car-geometry.js", "js/car/car-wheels.js", "js/car/car-material-shade.js", "js/car/car-materials.js",
  "js/car/car-body-geom.js", "js/car/car3d.js", "js/car/cockpit-rig.js", "js/car/car-mesh.js"]);

export function loadCar(root) {
  const ctx = { console, Math, Object, Array, Float32Array, Uint16Array, Uint32Array,
                JSON, Number, String, Boolean, isFinite, isNaN, Map, Set, WeakMap };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of CAR_FILES) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    vm.runInContext(fs.readFileSync(p, "utf8"), ctx, { filename: f });
  }
  // `const X = (function(){})()` is a lexical binding, not a ctx property.
  const grab = (n) => vm.runInContext(n, ctx);
  return { Car3D: grab("Car3D"), Parts: grab("Parts"), Teams: grab("Teams") };
}

// Two far-apart colours, not parts-sweep's two greys: ZFIGHT only counts a
// pair that would SHOW (different colour or surface), and a c1 stripe on a c2
// panel must read as different here.
const C1 = [0.80, 0.10, 0.10], C2 = [0.10, 0.20, 0.85];
// One factory car (setup = its FACTORY_PRESETS row) plus an optional style
// overlay {cat: optionId}. buildComplete: the active-aero flaps are part of
// the shipped silhouette.
// `bodyStyle` is a livery field (Car3D.bodyStyleKey): a BODY_STYLES look
// (needle, brick, …) or another team's TEAM_STYLE body on this team's car.
export function buildCar(M, teamId, overlay = {}, bodyStyle = null) {
  const team = M.Teams.LIST.find((t) => t.id === teamId);
  if (!team) throw new Error(`unknown team ${teamId}`);
  const setup = Object.assign({}, M.Parts.FACTORY_PRESETS[teamId] || {}, overlay);
  const tiers = M.Parts.getVisualTiers(setup, team);
  for (const [cat, id] of Object.entries(overlay))
    if (tiers._ids && tiers._ids[cat] !== id) throw new Error(`${cat}/${id} resolved to ${tiers._ids[cat]} for ${teamId}`);
  if (bodyStyle && M.Car3D.bodyStyleKey(teamId, bodyStyle) !== bodyStyle) throw new Error(`unknown body style ${bodyStyle}`);
  return M.Car3D.buildComplete(C1, C2, { livery: bodyStyle ? { bodyStyle } : {}, num: 44, parts: tiers, teamId, measure: true });
}

// Section of every vertex. parts[] carries from/to since the fit-audit hook;
// an older tree (--base) without it is rebuilt from the vertex counts, which
// is exact because sections are contiguous from vertex 0.
export function sectionsOf(mesh) {
  const nv = mesh.pos.length / 3, names = [], of = new Int16Array(nv).fill(-1);
  let at = 0;
  for (const p of mesh.parts || []) {
    const from = p.from != null ? p.from : at, to = p.to != null ? p.to : at + p.vertices;
    names.push(p.name);
    for (let v = from; v < to; v++) of[v] = names.length - 1;
    at = to;
  }
  if (at < nv) { names.push("aeroFlaps"); for (let v = at; v < nv; v++) of[v] = names.length - 1; }
  for (let v = 0; v < nv; v++) if (of[v] < 0) of[v] = names.length - 1;
  return { names, of };
}

// ── triangles, pieces, edges ───────────────────────────────────────────────
function find(p, i) { while (p[i] !== i) { p[i] = p[p[i]]; i = p[i]; } return i; }

export function analyse(mesh) {
  const S = sectionsOf(mesh);
  const nt = mesh.idx.length / 3;
  const T = { a: new Float64Array(nt * 9), n: nt };
  const area = new Float64Array(nt), nrm = new Float64Array(nt * 3), sec = new Int16Array(nt);
  for (let t = 0; t < nt; t++) {
    for (let k = 0; k < 3; k++) {
      const v = mesh.idx[t * 3 + k] * 3;
      T.a[t * 9 + k * 3] = mesh.pos[v]; T.a[t * 9 + k * 3 + 1] = mesh.pos[v + 1]; T.a[t * 9 + k * 3 + 2] = mesh.pos[v + 2];
    }
    const o = t * 9;
    const ux = T.a[o + 3] - T.a[o], uy = T.a[o + 4] - T.a[o + 1], uz = T.a[o + 5] - T.a[o + 2];
    const wx = T.a[o + 6] - T.a[o], wy = T.a[o + 7] - T.a[o + 1], wz = T.a[o + 8] - T.a[o + 2];
    const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx, L = Math.hypot(cx, cy, cz);
    area[t] = L / 2;
    if (L > 0) { nrm[t * 3] = cx / L; nrm[t * 3 + 1] = cy / L; nrm[t * 3 + 2] = cz / L; }
    sec[t] = S.of[mesh.idx[t * 3]];
  }
  // Weld per section: key = section + quantised position.
  const q = 1000 / FIT.WELD_MM, wid = new Int32Array(mesh.pos.length / 3), keys = new Map();
  for (let v = 0; v < wid.length; v++) {
    const k = S.of[v] + ":" + Math.round(mesh.pos[v * 3] * q) + ":" + Math.round(mesh.pos[v * 3 + 1] * q) + ":" + Math.round(mesh.pos[v * 3 + 2] * q);
    let id = keys.get(k);
    if (id === undefined) { id = keys.size; keys.set(k, id); }
    wid[v] = id;
  }
  const nw = keys.size, par = new Int32Array(nw);
  for (let i = 0; i < nw; i++) par[i] = i;
  const live = (t) => area[t] > 1e-10;   // a zero-area sliver joins nothing and bounds nothing
  for (let t = 0; t < nt; t++) if (live(t)) {
    const a = find(par, wid[mesh.idx[t * 3]]);
    for (let k = 1; k < 3; k++) { const b = find(par, wid[mesh.idx[t * 3 + k]]); if (a !== b) par[b] = a; }
  }
  const pieceOfRoot = new Map(), piece = new Int32Array(nt).fill(-1), pieces = [];
  for (let t = 0; t < nt; t++) if (live(t)) {
    const r = find(par, wid[mesh.idx[t * 3]]);
    let p = pieceOfRoot.get(r);
    if (p === undefined) { p = pieces.length; pieceOfRoot.set(r, p); pieces.push({ id: p, sec: sec[t], tris: [], area: 0, matVotes: new Map() }); }
    piece[t] = p; pieces[p].tris.push(t); pieces[p].area += area[t];
    const m = mesh.mat && mesh.mat[mesh.idx[t * 3]];
    pieces[p].matVotes.set(m, (pieces[p].matVotes.get(m) || 0) + area[t]);
  }
  // Edges on welded ids: 1 use = boundary (open), >2 = non-manifold.
  const edges = new Map();
  for (let t = 0; t < nt; t++) if (live(t)) for (let k = 0; k < 3; k++) {
    const a = wid[mesh.idx[t * 3 + k]], b = wid[mesh.idx[t * 3 + (k + 1) % 3]];
    if (a === b) continue;
    const key = a < b ? a * nw + b : b * nw + a;
    const e = edges.get(key);
    if (e) { e.n++; } else edges.set(key, { n: 1, t, k });
  }
  for (const p of pieces) {
    let best = null, bw = -1;
    for (const [m, w] of p.matVotes) if (w > bw) { bw = w; best = m; }
    p.mat = best; delete p.matVotes;
    p.boundary = 0; p.nonManifold = 0;
  }
  const openEdges = [];
  for (const e of edges.values()) {
    const p = pieces[piece[e.t]];
    if (e.n === 1) { p.boundary++; openEdges.push(e); } else if (e.n > 2) p.nonManifold++;
  }
  for (const p of pieces) p.closed = p.boundary === 0;
  const vis = visibleMask(mesh, T, area);
  const grid = triGrid(T, live);
  return { mesh, S, T, area, nrm, sec, piece, pieces, openEdges, vis, grid, live, wid };
}

// ── spatial grid (CSR, as parts-sweep's) with a filtered radius query ─────
const CELL = 0.04;
function triGrid(T, live) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < T.n * 9; i += 3) {
    const x = T.a[i], y = T.a[i + 1], z = T.a[i + 2];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  const ix0 = Math.floor(x0 / CELL), jy0 = Math.floor(y0 / CELL), kz0 = Math.floor(z0 / CELL);
  const nx = Math.floor(x1 / CELL) - ix0 + 1, ny = Math.floor(y1 / CELL) - jy0 + 1, nz = Math.floor(z1 / CELL) - kz0 + 1;
  const ncell = nx * ny * nz, start = new Int32Array(ncell + 1);
  const box = new Int32Array(T.n * 6);
  for (let t = 0; t < T.n; t++) {
    if (!live(t)) { box[t * 6] = 1; box[t * 6 + 3] = 0; continue; }
    const o = t * 9;
    const xs = [T.a[o], T.a[o + 3], T.a[o + 6]], ys = [T.a[o + 1], T.a[o + 4], T.a[o + 7]], zs = [T.a[o + 2], T.a[o + 5], T.a[o + 8]];
    box[t * 6] = Math.floor(Math.min(...xs) / CELL) - ix0; box[t * 6 + 3] = Math.floor(Math.max(...xs) / CELL) - ix0;
    box[t * 6 + 1] = Math.floor(Math.min(...ys) / CELL) - jy0; box[t * 6 + 4] = Math.floor(Math.max(...ys) / CELL) - jy0;
    box[t * 6 + 2] = Math.floor(Math.min(...zs) / CELL) - kz0; box[t * 6 + 5] = Math.floor(Math.max(...zs) / CELL) - kz0;
    for (let i = box[t * 6]; i <= box[t * 6 + 3]; i++) for (let j = box[t * 6 + 1]; j <= box[t * 6 + 4]; j++) for (let k = box[t * 6 + 2]; k <= box[t * 6 + 5]; k++)
      start[(i * ny + j) * nz + k + 1]++;
  }
  for (let c = 0; c < ncell; c++) start[c + 1] += start[c];
  const fill = new Int32Array(ncell), tris = new Int32Array(start[ncell]);
  for (let t = 0; t < T.n; t++)
    for (let i = box[t * 6]; i <= box[t * 6 + 3]; i++) for (let j = box[t * 6 + 1]; j <= box[t * 6 + 4]; j++) for (let k = box[t * 6 + 2]; k <= box[t * 6 + 5]; k++) {
      const c = (i * ny + j) * nz + k; tris[start[c] + fill[c]++] = t;
    }
  return { start, tris, ix0, jy0, kz0, nx, ny, nz, stamp: new Int32Array(T.n), epoch: 0 };
}

// Visit every triangle whose cell box comes within r of p, once each.
export function eachNear(A, px, py, pz, r, fn) {
  const g = A.grid, e = ++g.epoch;
  const i0 = Math.max(0, Math.floor((px - r) / CELL) - g.ix0), i1 = Math.min(g.nx - 1, Math.floor((px + r) / CELL) - g.ix0);
  const j0 = Math.max(0, Math.floor((py - r) / CELL) - g.jy0), j1 = Math.min(g.ny - 1, Math.floor((py + r) / CELL) - g.jy0);
  const k0 = Math.max(0, Math.floor((pz - r) / CELL) - g.kz0), k1 = Math.min(g.nz - 1, Math.floor((pz + r) / CELL) - g.kz0);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
    const c = (i * g.ny + j) * g.nz + k;
    for (let q = g.start[c], end = g.start[c + 1]; q < end; q++) {
      const t = g.tris[q];
      if (g.stamp[t] === e) continue;
      g.stamp[t] = e;
      if (fn(t) === false) return;
    }
  }
}

// Closest point on triangle t to p (Ericson, as parts-sweep distPointTri), into out[0..2].
export function closestOnTri(T, t, px, py, pz, out) {
  const o = t * 9;
  const ax = T.a[o], ay = T.a[o + 1], az = T.a[o + 2], bx = T.a[o + 3], by = T.a[o + 4], bz = T.a[o + 5];
  const cx = T.a[o + 6], cy = T.a[o + 7], cz = T.a[o + 8];
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  const set = (x, y, z, region) => { out[0] = x; out[1] = y; out[2] = z; out[3] = region; return Math.hypot(px - x, py - y, pz - z); };
  if (d1 <= 0 && d2 <= 0) return set(ax, ay, az, 1);
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return set(bx, by, bz, 1);
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return set(cx, cy, cz, 1);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return set(ax + abx * v, ay + aby * v, az + abz * v, 2); }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return set(ax + acx * w, ay + acy * w, az + acz * w, 2); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return set(bx + (cx - bx) * w, by + (cy - by) * w, bz + (cz - bz) * w, 2);
  }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return set(ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w, 0);
}

// ── visibility ─────────────────────────────────────────────────────────────
// parts-sweep.mjs visibleTris() with a finer raster: 14 orthographic depth
// buffers (six axes, eight body diagonals). Its 192 px / 20 mm slack is right
// for "did this option move anything a player sees"; a fit audit asks whether
// a 30 mm part INSIDE the cover is seen, and at 30 mm per pixel with 20 mm of
// depth slack everything within 2 cm of the skin counts as visible. 448 px is
// ~13 mm per pixel over the 5.8 m car; VIS_EPS 6 mm is half a pixel of depth.
const VIS_N = 448, VIS_EPS = 0.006;
const VIS_DIRS = (() => {
  const d = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) d.push([x, y, z]);
  return d.map((v) => { const n = Math.hypot(v[0], v[1], v[2]); return [v[0] / n, v[1] / n, v[2] / n]; });
})();
function visibleMask(mesh, T, area) {
  const vis = new Uint8Array(T.n);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < T.n * 9; i++) { const c = i % 3; if (T.a[i] < lo[c]) lo[c] = T.a[i]; if (T.a[i] > hi[c]) hi[c] = T.a[i]; }
  // The frame snaps to a 5 cm grid: framed on the exact bbox, a DRS pod 1 mm lower re-centred
  // all 14 rasters and flipped borderline wheel faces visible (B·L25: a 6 cm2 ZFIGHT "WORSE"
  // on byte-identical brake-duct and wheel triangles). A move inside one cell leaves vis unchanged.
  const q = (v) => Math.round(v / 0.05) * 0.05;
  const R = Math.ceil((Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) * 0.5 + 0.05) / 0.05) * 0.05;
  const c = [q((lo[0] + hi[0]) / 2), q((lo[1] + hi[1]) / 2), q((lo[2] + hi[2]) / 2)], S = (VIS_N - 2) / (2 * R);
  const px = new Float64Array(T.n * 3), py = new Float64Array(T.n * 3), pz = new Float64Array(T.n * 3);
  const buf = new Float64Array(VIS_N * VIS_N);
  for (const w of VIS_DIRS) {
    const up = Math.abs(w[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
    const u = [up[1] * w[2] - up[2] * w[1], up[2] * w[0] - up[0] * w[2], up[0] * w[1] - up[1] * w[0]];
    const un = Math.hypot(u[0], u[1], u[2]); u[0] /= un; u[1] /= un; u[2] /= un;
    const v = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
    for (let t = 0; t < T.n; t++) for (let k = 0; k < 3; k++) {
      const o = t * 9 + k * 3, dx = T.a[o] - c[0], dy = T.a[o + 1] - c[1], dz = T.a[o + 2] - c[2];
      px[t * 3 + k] = (dx * u[0] + dy * u[1] + dz * u[2] + R) * S + 1;
      py[t * 3 + k] = (dx * v[0] + dy * v[1] + dz * v[2] + R) * S + 1;
      pz[t * 3 + k] = -(dx * w[0] + dy * w[1] + dz * w[2]);
    }
    buf.fill(Infinity);
    for (let pass = 0; pass < 2; pass++) for (let t = 0; t < T.n; t++) {
      if (!(area[t] > 1e-10) || (pass === 1 && vis[t])) continue;
      const o = t * 3, x0 = px[o], y0 = py[o], x1 = px[o + 1], y1 = py[o + 1], x2 = px[o + 2], y2 = py[o + 2];
      const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      let any = false;
      if (Math.abs(det) > 1e-9) {
        const i0 = Math.max(0, Math.ceil(Math.min(x0, x1, x2))), i1 = Math.min(VIS_N - 1, Math.floor(Math.max(x0, x1, x2)));
        const j0 = Math.max(0, Math.ceil(Math.min(y0, y1, y2))), j1 = Math.min(VIS_N - 1, Math.floor(Math.max(y0, y1, y2)));
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
          const a = ((i - x0) * (y2 - y0) - (x2 - x0) * (j - y0)) / det, b = ((x1 - x0) * (j - y0) - (i - x0) * (y1 - y0)) / det;
          if (a < 0 || b < 0 || a + b > 1) continue;
          any = true;
          const z = pz[o] + a * (pz[o + 1] - pz[o]) + b * (pz[o + 2] - pz[o]), idx = j * VIS_N + i;
          if (pass === 0) { if (z < buf[idx]) buf[idx] = z; } else if (z <= buf[idx] + VIS_EPS) { vis[t] = 1; i = i1 + 1; break; }
        }
      }
      if (!any) {   // a sub-pixel sliver: its centroid stands in (thin trim is not interior by luck)
        const i = Math.round((x0 + x1 + x2) / 3), j = Math.round((y0 + y1 + y2) / 3);
        if (i < 0 || j < 0 || i >= VIS_N || j >= VIS_N) continue;
        const z = (pz[o] + pz[o + 1] + pz[o + 2]) / 3, idx = j * VIS_N + i;
        if (pass === 0) { if (z < buf[idx]) buf[idx] = z; } else if (z <= buf[idx] + VIS_EPS) vis[t] = 1;
      }
    }
  }
  return vis;
}
