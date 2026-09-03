#!/usr/bin/env node
// How much does each catalog option ACTUALLY change the car? Offline, no browser.
// @doc How much does each catalog option change the car? Builds all options offline via `node:vm` against the right baseline.
// @skill garage-parts-livery
//
// AUTHOR-TIME + guard. tests/unit/parts-visual-distinctness.test.mjs imports
// sweep()/classify()/THRESHOLDS from here.
//
// Why this exists: 128 of the catalog's 297 options are SIGNATURE clones — same
// cost, same four stat multipliers as the option they name as `equivalent`,
// existing only to carry a different `visual` recipe. Nothing checked that they
// do. tests/specs/parts-physics.spec.js:874 hashes each option's mesh and fails
// on a collision, which proves options are not byte-IDENTICAL; a one-vertex
// 0.001 m change passes it. tyres/sig_alpine_tyre passes it today with a 2.4 mm
// maximum displacement, because its only real delta (bandWidth 0.085 -> 0.092)
// is eaten by the band clamp at js/car/car3d.js:579.
//
// THE OPTICAL ANCHOR. Every threshold below hangs off one measurement:
// tools/audit-parts.mjs shoots 720x560 at a 34 deg vertical FOV from dist
// 3.9-6.4 m, so 2*dist*tan(17deg)/560 is about 6 MM PER PIXEL. A displacement
// under ~5 mm cannot move a silhouette edge by one pixel at the camera these
// parts are actually reviewed from, and 0.010 m2 is a 10 cm patch (~17x17 px on
// a frame where the car covers ~150k px) — about the smallest patch a person
// reliably notices when flipping two shots.
//
//   node tools/parts-sweep.mjs                    all 12 categories
//   node tools/parts-sweep.mjs --cats=tyres,fuel  a subset
//   node tools/parts-sweep.mjs --only=INVISIBLE,WEAK
//   node tools/parts-sweep.mjs --calibrate        deciles, no classification
//   node tools/parts-sweep.mjs --attribute        per-key effect on flagged rows
//   node tools/parts-sweep.mjs --clamp-scan       which registry keys are dead
//   node tools/parts-sweep.mjs --novis            skip the visibility mask
//   node tools/parts-sweep.mjs --json
//
// Exits non-zero when any row is INVISIBLE or BROKEN.
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// CALIBRATION, 2026-08-29, `--calibrate` over all 12 categories, 285 scored
// rows (artifacts/parts-sweep-calibrate.log). dHaus deciles in mm:
//
//   p0     p10    p20    p30    p40    p50    p60    p70    p80    p90    max
//   0.00  14.98  24.53  51.43  81.09 102.06 114.34 130.04 155.51 169.12 300.0
//
//   <= 1 mm:  3    <= 5 mm:  7 (2 SIG)    <= 10 mm: 16 (7 SIG)
//   <= 20 mm: 46 (17 SIG)                 <= 50 mm: 84 (42 SIG)
//
// CLAMP SCAN, same date, `--clamp-scan` (artifacts/parts-clamp-scan.log):
// 111 registry keys, 3 flat over the range the catalog ships —
// `brakes/rim` (matl), `tyres/grooved` (geom), `fuel/flame` (matl) — plus 8
// keys only one option ever sets, which have no range to scan. The FIRST pass
// said 15 dead; twelve of those were the scan's own fault for varying each key
// against a bare default recipe with its gate shut. Read the host-recipe note
// on clampScan() before trusting any number it prints.
//
// The thresholds below are NOT read off that table — they come from the optical
// anchor, and the table is here to show what they cost. 5 mm is one pixel and
// 20 mm is three at the audit camera; the distribution merely confirms they sit
// where a catalog this wide has a genuine thin tail (16% of rows under 3 px)
// rather than cutting through its bulk. Frozen because the guard test asserts
// against them, and a threshold widened to shrink a workload is the
// tolerance-widening AGENTS.md prohibits.
export const THRESHOLDS = Object.freeze({
  INVISIBLE_MM: 5,        // under one pixel at the audit cameras
  WEAK_MM: 20,            // ~3 px
  EPS_MM: 3,              // "this triangle moved" floor for the area measure
  MOVED_AREA_M2: 0.010,   // a 10 cm patch
  INVISIBLE_AREA_M2: 0.002,
  COLOUR_DELTA: 0.06,     // ~15/255 in sRGB, the smallest flat-patch difference
  // "This option is genuinely a different COLOUR." Raised from 0.005 once the
  // full sweep showed 0.005 sits INSIDE the noise: palette transport has a
  // floor proportional to the geometry change (areas move between buckets when
  // triangles move), and the measured floor for options that recolour nothing
  // runs 0.008-0.031 m2 — suspension/sport 0.010, tyres/sig_haas_tyre 0.031.
  // Everything that really does recolour lands an order up: the fuel grades at
  // 0.102, an ERS LED at 0.126, a brake caliper at 0.947, a tyre band at 0.749.
  // 0.05 is the middle of that gap and a 22 cm patch. RAISING this makes the
  // INVISIBLE gate stricter, never laxer.
  COLOUR_AREA_M2: 0.05,
  SLIDE_RATIO: 3,
});

const GREY1 = [0.50, 0.50, 0.50], GREY2 = [0.55, 0.55, 0.55];

// ── loading ────────────────────────────────────────────────────────────────
export function loadParts() {
  const ctx = { console, Math, Object, Array, Float32Array, Uint16Array, Uint32Array,
                JSON, Number, String, Boolean, isFinite, isNaN, Map, Set, WeakMap };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  // liverytex + carmesh are here for the DECAL side of the mesh: CarMesh
  // .carDecalData() dereferences LiveryTex.REGIONS at call time, so both must be
  // in the context or the sponsor-board assertions cannot run headless. Neither
  // touches the DOM on the mesh-data path (carmesh.js has no `document`/`window`
  // reference at all; liverytex.js has five, none of them reached by
  // carDecalData) — but that is the boundary: anything that RASTERISES a livery
  // texture still needs a browser and stays in tests/specs/.
  for (const f of ["js/core/log.js", "js/core/mat4.js", "js/data/teams.js", "js/car/parts.js",
                   "js/car/liverytex.js", "js/car/car3d.js", "js/car/car-mesh.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  // Every one of these is `const X = (function(){})()` at script level — a
  // LEXICAL binding, which never becomes a property of the vm's global object,
  // so ctx.Parts is undefined however the file looks. Evaluate the bare name in
  // the same context instead (the pattern in tools/cockpit-pale-sweep.mjs).
  const grab = (n) => vm.runInContext(n, ctx);
  return { Car3D: grab("Car3D"), Parts: grab("Parts"), Teams: grab("Teams"),
           CarMesh: grab("CarMesh"), LiveryTex: grab("LiveryTex") };
}

// The one way this whole sweep can lie in the direction that looks like a
// catalog bug. Car3D memoises the flap solve on `aLvl + flapSig(style)`
// (js/car/car3d.js:1003), and flapSig hashes SIX named fields. This tool is the
// first thing that ever builds ~430 aero styles in one process: a field the
// solver reads but flapSig omits would let two different recipes share one
// cached record, and the affected options would report as a FALSE INVISIBLE
// that is indistinguishable from a real dead knob. So assert the two sets agree
// before measuring anything. Source-scanned rather than probed because the
// failure is a missing field, and only the text says which fields exist.
export function assertFlapSig(src) {
  const s = src || fs.readFileSync(path.join(ROOT, "js/car/car3d.js"), "utf8");
  const cut = (from, to) => {
    const a = s.indexOf(from);
    if (a < 0) throw new Error(`assertFlapSig: ${from} not found — car3d.js moved`);
    const b = s.indexOf(to, a);
    if (b < 0) throw new Error(`assertFlapSig: ${to} not found after ${from}`);
    return s.slice(a, b);
  };
  const hashed = new Set([...cut("function flapSig(", "function aeroFlapsGeom(")
    .matchAll(/st0\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
  // solveFlapsGeom binds the recipe to `st`; hinged()/elemRecord() take explicit
  // planform arguments and read no style at all, so this range is the whole
  // surface the solve depends on.
  const read = new Set([...cut("function solveFlapsGeom(", "function buildFlapGeom(")
    .matchAll(/\bst\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
  const missing = [...read].filter((k) => !hashed.has(k)).sort();
  if (missing.length)
    throw new Error("flapSig does not hash " + missing.join(",") +
      " — two aero recipes can share a cached flap solve, which this sweep " +
      "would report as a false INVISIBLE. Add them to flapSig (js/car/car3d.js:1003).");
  return { hashed: [...hashed].sort(), read: [...read].sort() };
}

// ── catalog ────────────────────────────────────────────────────────────────
// Which team can actually SEE a gated option. Mirrors eligibleTeam() in
// tools/audit-parts.mjs:69-75 — a SIGNATURE built under the wrong team is
// rejected by isOptionAvailable() and silently falls back to the default.
function eligibleTeam(Parts, Teams, option, fallback) {
  const teams = Teams.LIST.filter((t) => Parts.FACTORY_PRESETS[t.id]);
  const byId = Object.fromEntries(teams.map((t) => [t.id, t]));
  if (option.teams && option.teams.length) return byId[option.teams[0]] && option.teams[0];
  if (option.team) return byId[option.team] && option.team;
  const sup = option.suppliers || (option.supplier ? [option.supplier] : []);
  if (sup.length) { const t = teams.find((x) => sup.includes(x.engine)); return t && t.id; }
  return byId[fallback] ? fallback : teams[0].id;
}

export function catalogRows(Parts, Teams, fallback = "mclaren") {
  const rows = [];
  for (const cat of Parts.CATALOG) {
    for (const opt of cat.options) {
      const teamId = eligibleTeam(Parts, Teams, opt, fallback);
      if (!teamId) throw new Error(`no eligible team for ${cat.id}/${opt.id}`);
      const sig = opt.tag === "SIGNATURE" && opt.equivalent;
      rows.push({
        cat: cat.id, optionId: opt.id, label: opt.label, teamId,
        signature: !!sig, equivalent: sig || null,
        isDefault: Parts.DEFAULTS[cat.id] === opt.id,
        // A SIGNATURE's baseline is the twin it exists to differ from; a
        // universal option's is the category default.
        baseSetup: sig ? { [cat.id]: sig } : {},
        setup: { [cat.id]: opt.id },
      });
    }
  }
  return rows;
}

// TRAP: an unknown or unavailable id resolves to DEFAULTS with no warning
// (js/car/parts.js:594), so a typo photographs the default car and reports a
// false "identical". Assert the RESOLVED id, which also catches the gate.
export function assertResolves(Parts, Teams, teamId, cat, optionId) {
  // The TEAM OBJECT, not team.engine. teamContext (js/car/parts.js:576) reads
  // .id for the `teams:[...]` gate and only treats a bare string as an engine
  // supplier — so passing the engine makes every SIGNATURE fail its own gate and
  // silently resolve to the category default.
  const team = Teams.LIST.find((t) => t.id === teamId);
  const got = Parts.getVisualTiers({ [cat]: optionId }, team)._ids[cat];
  if (got !== optionId) throw new Error(`${cat}/${optionId} resolved to ${got} for ${teamId}`);
}

// ── build ──────────────────────────────────────────────────────────────────
// The DRS-open pose, which buildComplete cannot give us.
//
// buildComplete bakes the movable flaps with no rotation at all — it undoes
// buildFlapGeom's hinge translation and stops. drawAeroFlaps (js/game.js:1364)
// instead spins each element about the car's local X by
// `zAngle + (xAngle - zAngle) * blend` and then hangs it at its own pivot. So
// two aero options that differ ONLY in flap travel are byte-identical in the
// baked mesh and visibly different on track, and an aero sweep that never
// leaves the closed pose systematically under-measures the whole category.
// This reproduces the draw-time transform for a chosen blend.
function appendFlaps(M, out, blend) {
  const info = out.flapInfo;
  if (!info) return out;
  for (const el of M.Car3D.aeroFlaps(info.aLvl, info.style)) {
    const g = M.Car3D.buildFlapGeom(el, info.col, info.finish);
    const ang = el.zAngle + (el.xAngle - el.zAngle) * blend;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const base = out.pos.length / 3;
    for (let i = 0; i < g.pos.length; i += 3) {
      // Local +Y maps to u*ca + f*sa and local +Z to -u*sa + f*ca, exactly as
      // drawAeroFlaps writes columns 4 and 8 of the model matrix.
      const y = g.pos[i + 1], z = g.pos[i + 2];
      out.pos.push(g.pos[i], y * ca - z * sa + el.y, y * sa + z * ca + el.z);
      const ny = g.nrm[i + 1], nz = g.nrm[i + 2];
      out.nrm.push(g.nrm[i], ny * ca - nz * sa, ny * sa + nz * ca);
      out.col.push(g.col[i], g.col[i + 1], g.col[i + 2]);
    }
    if (g.mat) for (const m of g.mat) out.mat.push(m);
    for (const k of g.idx) out.idx.push(base + k);
  }
  return out;
}

const _cache = new Map();
export function buildCar(M, teamId, setup, pose) {
  const key = teamId + "|" + (pose || "baked") + "|" + JSON.stringify(setup);
  if (_cache.has(key)) return _cache.get(key);
  const team = M.Teams.LIST.find((t) => t.id === teamId);
  const tiers = M.Parts.getVisualTiers(setup, team);
  const opts = { livery: {}, num: 44, parts: tiers, teamId, measure: true };
  // buildComplete, NOT build: the active-aero top flaps live outside build()'s
  // mesh (tools/carview.html re-derives them), so an aero sweep on build()
  // alone is blind to every rear-wing top element. And NO noWheels: five knobs
  // are wheel-side, and a wheel knob cannot deform a wheel-less mesh.
  const mesh = pose === "open"
    ? appendFlaps(M, M.Car3D.build(GREY1, GREY2, opts), 1)
    : M.Car3D.buildComplete(GREY1, GREY2, opts);
  // LRU: 430 meshes at ~17.5k verts each is over a gigabyte. Sweeping
  // category-by-category keeps each baseline hot inside a window this small.
  if (_cache.size > 8) _cache.delete(_cache.keys().next().value);
  _cache.set(key, mesh);
  return mesh;
}

// Build straight from a tiers object, bypassing the catalog. --attribute needs
// this to fit ONE recipe key at a time, which no catalog id names.
export function buildTiers(M, teamId, tiers, pose) {
  const opts = { livery: {}, num: 44, parts: tiers, teamId, measure: true };
  return pose === "open"
    ? appendFlaps(M, M.Car3D.build(GREY1, GREY2, opts), 1)
    : M.Car3D.buildComplete(GREY1, GREY2, opts);
}

// ── geometry ───────────────────────────────────────────────────────────────
function triangles(mesh) {
  const n = mesh.idx.length / 3, out = { a: new Float64Array(n * 9), area: new Float64Array(n), n };
  for (let t = 0; t < n; t++) {
    for (let k = 0; k < 3; k++) {
      const v = mesh.idx[t * 3 + k] * 3;
      out.a[t * 9 + k * 3] = mesh.pos[v];
      out.a[t * 9 + k * 3 + 1] = mesh.pos[v + 1];
      out.a[t * 9 + k * 3 + 2] = mesh.pos[v + 2];
    }
    const ax = out.a[t * 9], ay = out.a[t * 9 + 1], az = out.a[t * 9 + 2];
    const ux = out.a[t * 9 + 3] - ax, uy = out.a[t * 9 + 4] - ay, uz = out.a[t * 9 + 5] - az;
    const wx = out.a[t * 9 + 6] - ax, wy = out.a[t * 9 + 7] - ay, wz = out.a[t * 9 + 8] - az;
    const cx = uy * wz - uz * wy, cy2 = uz * wx - ux * wz, cz = ux * wy - uy * wx;
    out.area[t] = 0.5 * Math.hypot(cx, cy2, cz);
  }
  return out;
}
const centroid = (T, t) => [
  (T.a[t * 9] + T.a[t * 9 + 3] + T.a[t * 9 + 6]) / 3,
  (T.a[t * 9 + 1] + T.a[t * 9 + 4] + T.a[t * 9 + 7]) / 3,
  (T.a[t * 9 + 2] + T.a[t * 9 + 5] + T.a[t * 9 + 8]) / 3];

// Closest point on a triangle (Ericson): barycentric region test with the three
// edge segments as fallback. Point-to-TRIANGLE, not point-to-point — the latter
// over-reports by roughly the vertex spacing, which here is the same order as
// the 5 mm threshold, so it would flag healthy options and hide dead ones.
function distPointTri(px, py, pz, T, t) {
  const o = t * 9;
  const ax = T.a[o], ay = T.a[o + 1], az = T.a[o + 2];
  const bx = T.a[o + 3], by = T.a[o + 4], bz = T.a[o + 5];
  const cx = T.a[o + 6], cy = T.a[o + 7], cz = T.a[o + 8];
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return Math.hypot(apx, apy, apz);
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return Math.hypot(bpx, bpy, bpz);
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return Math.hypot(cpx, cpy, cpz);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return Math.hypot(apx - abx * v, apy - aby * v, apz - abz * v);
  }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return Math.hypot(apx - acx * w, apy - acy * w, apz - acz * w);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return Math.hypot(px - (bx + (cx - bx) * w), py - (by + (cy - by) * w), pz - (bz + (cz - bz) * w));
  }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return Math.hypot(px - (ax + abx * v + acx * w), py - (ay + aby * v + acy * w), pz - (az + abz * v + acz * w));
}

const CELL = 0.04;
function triGrid(T) {
  const g = new Map();
  const key = (i, j, k) => i + "," + j + "," + k;
  for (let t = 0; t < T.n; t++) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < 3; k++) {
      const x = T.a[t * 9 + k * 3], y = T.a[t * 9 + k * 3 + 1], z = T.a[t * 9 + k * 3 + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let j = Math.floor(y0 / CELL); j <= Math.floor(y1 / CELL); j++)
        for (let k = Math.floor(z0 / CELL); k <= Math.floor(z1 / CELL); k++) {
          const kk = key(i, j, k);
          let a = g.get(kk); if (!a) g.set(kk, a = []);
          a.push(t);
        }
  }
  return g;
}
function nearest(T, grid, px, py, pz, cap) {
  const ci = Math.floor(px / CELL), cj = Math.floor(py / CELL), ck = Math.floor(pz / CELL);
  let best = cap, bestT = -1;
  for (let r = 0; r <= 8; r++) {
    // Stop as soon as the ring cannot beat what we have: a triangle in ring r
    // is at least (r-1)*CELL away.
    if (r > 1 && best <= (r - 1) * CELL) break;
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) for (let k = ck - r; k <= ck + r; k++) {
      if (r > 0 && Math.abs(i - ci) !== r && Math.abs(j - cj) !== r && Math.abs(k - ck) !== r) continue;
      const a = grid.get(i + "," + j + "," + k);
      if (!a) continue;
      for (const t of a) {
        const d = distPointTri(px, py, pz, T, t);
        if (d < best) { best = d; bestT = t; }
      }
    }
  }
  return { d: best, t: bestT };
}

// ── visibility ─────────────────────────────────────────────────────────────
// Which triangles a player can ever see. Without this a knob that only moves an
// internal rib — a radiator core behind a closed cover, a chassis member under
// the bodywork — measures exactly like one that reshapes the silhouette, and
// gets waved through as OK.
//
// 14 orthographic depth buffers: the six axes plus the eight body diagonals.
// The -Y view is not optional — the entire `floor` category is only ever seen
// from below, and dropping it would bury every floor knob as INTERNAL. The mask
// is deliberately coarse (192 px over a 5.8 m car is ~30 mm per pixel), so it
// can wrongly bury a small surface glimpsed through a duct; that is why BOTH
// dHaus and dHausVis are always printed and --novis exists.
const VIS_N = 192;
const VIS_EPS = 0.02;        // depth slack, ~0.7 px of the 30 mm pixel
const VIS_DIRS = (() => {
  const d = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) d.push([x, y, z]);
  return d.map((v) => { const n = Math.hypot(v[0], v[1], v[2]); return [v[0] / n, v[1] / n, v[2] / n]; });
})();

const _visCache = new WeakMap();
export function visibleTris(mesh, T) {
  const hit = _visCache.get(mesh);
  if (hit) return hit;
  const vis = new Uint8Array(T.n);
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.pos.length; i += 3) for (let k = 0; k < 3; k++) {
    if (mesh.pos[i + k] < lo[k]) lo[k] = mesh.pos[i + k];
    if (mesh.pos[i + k] > hi[k]) hi[k] = mesh.pos[i + k];
  }
  const R = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) * 0.5 + 0.05;
  const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const px = new Float64Array(T.n * 3), py = new Float64Array(T.n * 3), pz = new Float64Array(T.n * 3);
  const buf = new Float64Array(VIS_N * VIS_N);
  for (const w of VIS_DIRS) {
    // Any vector not parallel to w gives a usable basis; +Y unless w IS +/-Y.
    const up = Math.abs(w[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
    const u = [up[1] * w[2] - up[2] * w[1], up[2] * w[0] - up[0] * w[2], up[0] * w[1] - up[1] * w[0]];
    const un = Math.hypot(u[0], u[1], u[2]); u[0] /= un; u[1] /= un; u[2] /= un;
    const v = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
    const S = (VIS_N - 2) / (2 * R);
    for (let t = 0; t < T.n; t++) for (let k = 0; k < 3; k++) {
      const o = t * 9 + k * 3;
      const dx = T.a[o] - c[0], dy = T.a[o + 1] - c[1], dz = T.a[o + 2] - c[2];
      px[t * 3 + k] = (dx * u[0] + dy * u[1] + dz * u[2] + R) * S + 1;
      py[t * 3 + k] = (dx * v[0] + dy * v[1] + dz * v[2] + R) * S + 1;
      // Depth grows AWAY from the eye, and the eye sits at +w.
      pz[t * 3 + k] = -(dx * w[0] + dy * w[1] + dz * w[2]);
    }
    buf.fill(Infinity);
    for (let pass = 0; pass < 2; pass++) {
      for (let t = 0; t < T.n; t++) {
        if (pass === 1 && vis[t]) continue;
        const o = t * 3;
        const x0 = px[o], y0 = py[o], x1 = px[o + 1], y1 = py[o + 1], x2 = px[o + 2], y2 = py[o + 2];
        const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
        let any = false;
        if (Math.abs(det) > 1e-9) {
          const i0 = Math.max(0, Math.ceil(Math.min(x0, x1, x2))), i1 = Math.min(VIS_N - 1, Math.floor(Math.max(x0, x1, x2)));
          const j0 = Math.max(0, Math.ceil(Math.min(y0, y1, y2))), j1 = Math.min(VIS_N - 1, Math.floor(Math.max(y0, y1, y2)));
          for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
            const a = ((i - x0) * (y2 - y0) - (x2 - x0) * (j - y0)) / det;
            const b = ((x1 - x0) * (j - y0) - (i - x0) * (y1 - y0)) / det;
            if (a < 0 || b < 0 || a + b > 1) continue;
            any = true;
            const z = pz[o] + a * (pz[o + 1] - pz[o]) + b * (pz[o + 2] - pz[o]);
            const idx = j * VIS_N + i;
            if (pass === 0) { if (z < buf[idx]) buf[idx] = z; }
            else if (z <= buf[idx] + VIS_EPS) { vis[t] = 1; i = i1 + 1; break; }
          }
        }
        // A sliver thinner than a pixel covers no sample. Fall back to its
        // centroid so thin trim (wing gurneys, brake-duct fins) is not
        // classified as interior purely by rasterisation luck.
        if (!any) {
          const i = Math.round((x0 + x1 + x2) / 3), j = Math.round((y0 + y1 + y2) / 3);
          if (i < 0 || j < 0 || i >= VIS_N || j >= VIS_N) continue;
          const z = (pz[o] + pz[o + 1] + pz[o + 2]) / 3, idx = j * VIS_N + i;
          if (pass === 0) { if (z < buf[idx]) buf[idx] = z; }
          else if (z <= buf[idx] + VIS_EPS) vis[t] = 1;
        }
      }
    }
  }
  _visCache.set(mesh, vis);
  return vis;
}

// ── the comparison ─────────────────────────────────────────────────────────
export function compare(A, B, opts = {}) {
  const eps = (opts.epsMm != null ? opts.epsMm : THRESHOLDS.EPS_MM) / 1000;
  const cap = 0.30;
  const TA = triangles(A), TB = triangles(B);
  const GA = triGrid(TA), GB = triGrid(TB);
  let dA = 0, dB = 0, movedA = 0, movedB = 0;
  const nearIdx = new Int32Array(TA.n).fill(-1), nearD = new Float64Array(TA.n);
  for (let t = 0; t < TA.n; t++) {
    const c = centroid(TA, t);
    const r = nearest(TB, GB, c[0], c[1], c[2], cap);
    nearIdx[t] = r.t; nearD[t] = r.d;
    if (r.d > dA) dA = r.d;
    if (r.d > eps) movedA += TA.area[t];
  }
  for (let t = 0; t < TB.n; t++) {
    const c = centroid(TB, t);
    const r = nearest(TA, GA, c[0], c[1], c[2], cap);
    if (r.d > dB) dB = r.d;
    if (r.d > eps) movedB += TB.area[t];
  }
  // Vertices too, not just centroids: a box's extreme corner is the thing that
  // moves when a span grows, and a centroid can sit still while it does.
  for (let v = 0; v < A.pos.length; v += 3) {
    const r = nearest(TB, GB, A.pos[v], A.pos[v + 1], A.pos[v + 2], cap);
    if (r.d > dA) dA = r.d;
  }
  const bb = (m) => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) {
      if (m.pos[i + k] < lo[k]) lo[k] = m.pos[i + k];
      if (m.pos[i + k] > hi[k]) hi[k] = m.pos[i + k];
    }
    return { lo, hi };
  };
  const ba = bb(A), bbb = bb(B);
  let bboxMax = 0;
  for (let k = 0; k < 3; k++)
    bboxMax = Math.max(bboxMax, Math.abs(ba.lo[k] - bbb.lo[k]), Math.abs(ba.hi[k] - bbb.hi[k]));

  // Colour and material, measured as PALETTE TRANSPORT, never on the geometric
  // correspondence.
  //
  // The first version compared each triangle against its nearest neighbour in
  // the other mesh, and the calibration run showed why that cannot work: the
  // suspension options, which recolour nothing, reported 0.71-0.81 m2 of colour
  // change, and tyres/sig_alpine_tyre — whose one knob is clamped dead — came
  // out COLOUR-ONLY rather than INVISIBLE. A 2 mm shift across a hard colour
  // edge (a tyre band, a livery seam) lands the correspondence on the far side
  // of the edge, so the measure was reading geometry as colour.
  //
  // Area-weighted colour histograms have no correspondence to get wrong. Half
  // the L1 distance between them is the area that had to CHANGE COLOUR to turn
  // one car into the other, which is the quantity the class actually means, and
  // it is bounded by the total area difference, so a pure reshape cannot fake
  // it. Clamp to display range first — out.col carries HDR values above 1.0 for
  // emissive parts, and a 1.2 -> 1.8 glow is a night change, not a daylight one.
  const srgb = (v) => Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2);
  // 32 rungs per channel: one rung is 8/255, comfortably under the 0.06 sRGB
  // delta below which two flat patches read as the same colour.
  const Q = (v) => Math.min(31, Math.floor(srgb(v) * 32));
  const hist = (m, T, key) => {
    const h = new Map();
    for (let t = 0; t < T.n; t++) {
      const k = key(m, T, t);
      h.set(k, (h.get(k) || 0) + T.area[t]);
    }
    return h;
  };
  const colKey = (m, T, t) => {
    let r = 0, g = 0, b = 0;
    for (let k = 0; k < 3; k++) { const v = m.idx[t * 3 + k] * 3; r += m.col[v]; g += m.col[v + 1]; b += m.col[v + 2]; }
    return (Q(r / 3) << 10) | (Q(g / 3) << 5) | Q(b / 3);
  };
  const matKey = (m, T, t) => (m.mat ? m.mat[m.idx[t * 3]] : 0);
  const transport = (ha, hb) => {
    let s = 0;
    for (const k of new Set([...ha.keys(), ...hb.keys()]))
      s += Math.abs((ha.get(k) || 0) - (hb.get(k) || 0));
    return s / 2;
  };
  const colArea = transport(hist(A, TA, colKey), hist(B, TB, colKey));
  const matArea = transport(hist(A, TA, matKey), hist(B, TB, matKey));
  // colMax stays correspondence-based but only over triangles that BARELY
  // moved, where the correspondence is trustworthy. Diagnostic only — no class
  // hangs off it.
  const triCol = (m, T, t) => {
    let r = 0, g = 0, b = 0;
    for (let k = 0; k < 3; k++) { const v = m.idx[t * 3 + k] * 3; r += m.col[v]; g += m.col[v + 1]; b += m.col[v + 2]; }
    return [r / 3, g / 3, b / 3];
  };
  let colMax = 0;
  for (let t = 0; t < TA.n; t++) {
    const u = nearIdx[t];
    if (u < 0 || nearD[t] > eps) continue;
    const ca = triCol(A, TA, t), cb = triCol(B, TB, u);
    const d = Math.hypot(srgb(ca[0]) - srgb(cb[0]), srgb(ca[1]) - srgb(cb[1]), srgb(ca[2]) - srgb(cb[2]));
    if (d > colMax) colMax = d;
  }

  // Visible-only distance. A knob that only moves an internal rib scores the
  // same dHaus as one that reshapes the silhouette; this is what separates them.
  let dHausVis = 0;
  if (opts.vis !== false) {
    const VA = visibleTris(A, TA), VB = visibleTris(B, TB);
    for (let t = 0; t < TA.n; t++) {
      if (!VA[t]) continue;
      const c = centroid(TA, t);
      const r = nearest(TB, GB, c[0], c[1], c[2], cap);
      if (r.d > dHausVis && (r.t < 0 || VB[r.t])) dHausVis = r.d;
    }
    for (let t = 0; t < TB.n; t++) {
      if (!VB[t]) continue;
      const c = centroid(TB, t);
      const r = nearest(TA, GA, c[0], c[1], c[2], cap);
      if (r.d > dHausVis && (r.t < 0 || VA[r.t])) dHausVis = r.d;
    }
  } else dHausVis = Math.max(dA, dB);

  const w = whereMoved(A, B, eps);
  return {
    dHaus: Math.max(dA, dB), dHausVis, movedArea: Math.max(movedA, movedB), bboxMax,
    colMax, colArea, matArea, dCorr: w.dCorr,
    dTri: A.idx.length / 3 - B.idx.length / 3,
    dVert: A.pos.length / 3 - B.pos.length / 3,
    where: w.names,
  };
}

// Which named part() section owns the change, and how far its vertices moved
// INDEX-WISE. A running sum over out.parts reproduces each section's [from,to)
// exactly; anything past the last `to` is the aeroFlaps tail buildComplete
// appends.
//
// dCorr is the only thing that sees a tangential SLIDE: vertices walking along
// a surface that itself does not move leave dHaus at zero, because every point
// still lands on the other mesh. Meaningful only where the section's vertex
// count aligns — the catalog splices counts, so most rows return 0 here and the
// SLIDE class simply cannot fire for them. That is the honest answer, not a
// gap: where the count changed, dHaus already has real work to measure.
function whereMoved(A, B, eps) {
  if (!A.parts || !B.parts) return { names: "", dCorr: 0 };
  const byName = new Map();
  let dCorr = 0;
  const walk = (m) => { let at = 0; const r = new Map();
    for (const p of m.parts) { r.set(p.name, [at, at + p.vertices]); at += p.vertices; }
    if (at < m.pos.length / 3) r.set("aeroFlaps", [at, m.pos.length / 3]);
    return r; };
  const ra = walk(A), rb = walk(B);
  for (const [name, [a0, a1]] of ra) {
    const rbb = rb.get(name);
    if (!rbb) { byName.set(name, 1); continue; }
    if (a1 - a0 !== rbb[1] - rbb[0]) { byName.set(name, 1); continue; }
    let mv = 0;
    for (let i = 0; i < a1 - a0; i++) {
      const u = (a0 + i) * 3, v = (rbb[0] + i) * 3;
      const d = Math.hypot(A.pos[u] - B.pos[v], A.pos[u + 1] - B.pos[v + 1], A.pos[u + 2] - B.pos[v + 2]);
      if (d > eps) mv++;
      if (d > dCorr) dCorr = d;
    }
    if (mv) byName.set(name, mv);
  }
  return { names: [...byName.keys()].join(",") || "-", dCorr };
}

// ── classify ───────────────────────────────────────────────────────────────
export function classify(row, TH = THRESHOLDS) {
  if (row.isDefault && !row.signature) return "BASELINE";
  if (row.broken) return "BROKEN";
  const mm = row.dHaus * 1000, vis = (row.dHausVis != null ? row.dHausVis : row.dHaus) * 1000;
  const colour = row.colArea >= TH.COLOUR_AREA_M2 || row.matArea >= TH.COLOUR_AREA_M2;
  if (mm < TH.INVISIBLE_MM) {
    // Vertices walked a long way along a surface that stayed put. Reads exactly
    // like INVISIBLE on screen; named apart because the fix is different — the
    // recipe IS reaching the builder, it just moves nothing outward.
    if (!colour && row.dCorr * 1000 >= TH.WEAK_MM && row.dCorr > TH.SLIDE_RATIO * row.dHaus) return "SLIDE";
    if (!colour && row.movedArea < TH.INVISIBLE_AREA_M2) return "INVISIBLE";
    if (colour) return "COLOUR-ONLY";
    return "WEAK";
  }
  // Moved enough to matter, but only where nobody can see it.
  if (vis < TH.INVISIBLE_MM && !colour) return "INTERNAL";
  // A large, separately measured RECOLOUR settles distinctness on its own.
  // Without this the whole `tyres` category reads WEAK — 25 rows pinned at
  // 15.0-15.2 mm — because every tyre knob it owns tops out near 15 mm at full
  // range, which is not a thin catalog but the shape of the part: F1 compounds
  // ARE geometrically identical and differ by sidewall colour. Checked against
  // renders rather than asserted: scratch/renders/parts/tyres/compound_c4.png
  // (bold orange band) beside hard.png (thin white) is not a marginal
  // difference, and the band alone transports 0.749 m2. The threshold is the
  // same COLOUR_AREA_M2 the INVISIBLE gate uses, so nothing is rescued that the
  // noise analysis above could not tell from a geometry artefact.
  if (colour) return "OK";
  if (mm < TH.WEAK_MM || row.movedArea < TH.MOVED_AREA_M2) return "WEAK";
  return "OK";
}

// ── sweep ──────────────────────────────────────────────────────────────────
export function sweep({ cats, M, vis } = {}) {
  const mods = M || loadParts();
  assertFlapSig();
  const rows = catalogRows(mods.Parts, mods.Teams)
    .filter((r) => !cats || cats.includes(r.cat));
  const zero = { dHaus: 0, dHausVis: 0, movedArea: 0, colMax: 0, colArea: 0, matArea: 0,
                 bboxMax: 0, dCorr: 0, dTri: 0, dVert: 0, where: "-" };
  const out = [];
  for (const r of rows) {
    const rec = { ...r };
    try {
      assertResolves(mods.Parts, mods.Teams, r.teamId, r.cat, r.optionId);
      if (r.isDefault && !r.signature) {
        Object.assign(rec, zero);
      } else {
        Object.assign(rec, compare(buildCar(mods, r.teamId, r.setup),
                                   buildCar(mods, r.teamId, r.baseSetup), { vis }));
        // The aero category is the one place the baked pose is not the whole
        // truth: two options can differ only in how far the flaps travel, which
        // the closed pose cannot show. Take the better of the two poses — an
        // option visible in either is visible.
        if (r.cat === "aero") {
          const o = compare(buildCar(mods, r.teamId, r.setup, "open"),
                            buildCar(mods, r.teamId, r.baseSetup, "open"), { vis });
          rec.openMm = o.dHaus * 1000;
          if (o.dHaus > rec.dHaus) {
            rec.dHaus = o.dHaus; rec.dHausVis = o.dHausVis;
            rec.movedArea = Math.max(rec.movedArea, o.movedArea);
            rec.where = rec.where === "-" ? o.where : rec.where;
          }
        }
      }
    } catch (e) { rec.broken = String(e.message || e); Object.assign(rec, zero); }
    rec.cls = classify(rec);
    out.push(rec);
  }
  return out;
}

// ── attribution ────────────────────────────────────────────────────────────
// For a flagged row: which recipe key is doing the work, and which is inert?
// Fits the baseline car with exactly ONE of the differing keys at a time, so
// tyres/sig_alpine_tyre resolves to "bandWidth 0.085 -> 0.092 buys 2.4 mm
// because the band radius is clamped" instead of a guess about which of its
// four keys mattered.
//
// Diff the RESOLVED recipe (getVisualTiers()._visual), never the literal
// opt.visual: the category merge fills defaults, so the literal object names
// keys that were never different and omits keys that are.
export function attribute(M, row, opts = {}) {
  const team = M.Teams.LIST.find((t) => t.id === row.teamId);
  const tA = M.Parts.getVisualTiers(row.setup, team);
  const tB = M.Parts.getVisualTiers(row.baseSetup, team);
  const cat = row.cat;
  const vA = (tA._visual && tA._visual[cat]) || {}, vB = (tB._visual && tB._visual[cat]) || {};
  // `id` and `tier` ride along in the resolved recipe as bookkeeping, not knobs
  // — `id` names the option and `tier` is the same number `(tier)` already
  // measures, so listing them just pads every report with two guaranteed zeros.
  const keys = [...new Set([...Object.keys(vA), ...Object.keys(vB)])]
    .filter((k) => k !== "id" && k !== "tier")
    .filter((k) => JSON.stringify(vA[k]) !== JSON.stringify(vB[k]));
  const pose = cat === "aero" ? "open" : undefined;
  const base = buildTiers(M, row.teamId, tB, pose);
  const out = [];
  if (tA[cat] !== tB[cat]) {
    // The tier NUMBER is a knob in its own right — buildAeroParts and friends
    // branch on it before they ever look at the recipe.
    const one = { ...tB, [cat]: tA[cat] };
    out.push({ key: "(tier)", from: tB[cat], to: tA[cat],
               ...compare(buildTiers(M, row.teamId, one, pose), base, { vis: opts.vis }) });
  }
  for (const k of keys) {
    const one = { ...tB, _visual: { ...tB._visual, [cat]: { ...vB, [k]: vA[k] } } };
    out.push({ key: k, from: vB[k], to: vA[k],
               ...compare(buildTiers(M, row.teamId, one, pose), base, { vis: opts.vis }) });
  }
  return out.sort((a, b) => b.dHaus - a.dHaus);
}

// ── clamp scan ─────────────────────────────────────────────────────────────
// A knob can be registered, consumed, and still dead — because the consumer
// clamps it away. car3d.js:579 pins the tyre band radius with
// `Math.max(0.76 * edgeRm, outer - bandWidth)`, which eats almost the whole
// range the catalog uses for bandWidth; that is why sig_alpine_tyre exists to
// look different and moves 2.4 mm. That is a CATALOG-WIDE finding, worth more
// than any single row: the per-option sweep can only say "this option is thin",
// while this says "no option using this key can ever be thick".
//
// Drives each registry key from one end of the range the catalog ACTUALLY uses
// to the other, everything else held at the category default.
export function clampScan(M, cats, opts = {}) {
  const reg = M.Parts.VISUAL_FIELD_REGISTRY;
  const out = [];
  for (const cat of M.Parts.CATALOG) {
    if (cats && !cats.includes(cat.id)) continue;
    const kind = (k) => (reg.geometry[cat.id] || []).includes(k) ? "geom"
      : (reg.material[cat.id] || []).includes(k) ? "matl"
      : (reg.runtime[cat.id] || []).includes(k) ? "runt" : "?";
    const keys = [...(reg.geometry[cat.id] || []), ...(reg.material[cat.id] || []),
                  ...(reg.runtime[cat.id] || [])];
    const pose = cat.id === "aero" ? "open" : undefined;
    for (const k of keys) {
      // HOST RECIPE, not the category default. Most knobs are gated by another
      // knob — strakeH does nothing unless `strakes` is nonzero, caseWidth
      // nothing unless `casing` is — so varying a key against a bare default
      // recipe measures the GATE, not the key, and reports a perfectly live
      // knob as dead. The first pass of this scan called 15 keys DEAD that way.
      // Vary each key inside the RICHEST recipe that sets it, which is the
      // recipe an author would have had in mind, with its gates open.
      const hosts = cat.options.filter((o) => o.visual && o.visual[k] !== undefined);
      if (!hosts.length) { out.push({ cat: cat.id, key: k, kind: kind(k), n: 0, mm: 0, col: 0, host: "-", note: "unused" }); continue; }
      const host = hosts.reduce((a, b) =>
        Object.keys(b.visual).length > Object.keys(a.visual).length ? b : a);
      const teamId = eligibleTeam(M.Parts, M.Teams, host, "mclaren");
      const team = M.Teams.LIST.find((t) => t.id === teamId);
      const base = M.Parts.getVisualTiers({ [cat.id]: host.id }, team);
      const vB = (base._visual && base._visual[cat.id]) || {};
      // The range the AUTHORS wrote, not a synthetic one: a knob is only dead
      // if it is dead over the values the catalog ships.
      const seen = new Map();
      for (const o of cat.options)
        if (o.visual && o.visual[k] !== undefined) seen.set(JSON.stringify(o.visual[k]), o.visual[k]);
      const vals = [...seen.values()];
      const nums = vals.filter((v) => typeof v === "number");
      const probe = nums.length === vals.length && nums.length > 1
        ? [Math.min(...nums), Math.max(...nums)]
        : vals.slice(0, opts.max || 4);
      let mm = 0, col = 0, ref = null;
      for (const v of probe) {
        const one = { ...base, _visual: { ...base._visual, [cat.id]: { ...vB, [k]: v } } };
        const built = buildTiers(M, teamId, one, pose);
        if (!ref) { ref = built; continue; }
        const c = compare(built, ref, { vis: false });
        if (c.dHaus > mm) mm = c.dHaus;
        if (c.colArea > col) col = c.colArea;
      }
      const dead = probe.length > 1 &&
        mm * 1000 < THRESHOLDS.INVISIBLE_MM && col < THRESHOLDS.COLOUR_AREA_M2;
      out.push({ cat: cat.id, key: k, kind: kind(k), n: probe.length, host: host.id,
                 mm: mm * 1000, col, note: dead ? "DEAD" : (probe.length < 2 ? "one-value" : "") });
    }
  }
  return out;
}

// ── CLI ────────────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  const flag = (n, d) => { const i = args.indexOf("--" + n); return i < 0 ? d : args[i + 1]; };
  const has = (n) => args.includes("--" + n);
  const catsArg = args.find((a) => a.startsWith("--cats="));
  const cats = catsArg ? catsArg.slice(7).split(",") : null;
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const only = onlyArg ? onlyArg.slice(7).split(",") : null;

  const vis = !has("novis");
  const M = loadParts();

  if (has("clamp-scan")) {
    assertFlapSig();
    const s = clampScan(M, cats);
    const F = (v, w) => String(v).padEnd(w);
    console.log(F("cat", 12) + F("key", 18) + F("kind", 6) + F("n", 4) + F("range dHaus", 13) + F("colArea", 10) + "note");
    for (const r of s)
      console.log(F(r.cat, 12) + F(r.key, 18) + F(r.kind, 6) + F(r.n, 4) +
        F(r.mm.toFixed(2) + "mm", 13) + F(r.col.toFixed(4), 10) + r.note);
    const dead = s.filter((r) => r.note === "DEAD" && r.kind !== "runt");
    console.log(`\n${s.length} keys · ${dead.length} DEAD (flat over the range the catalog ships)`);
    for (const r of dead) console.log("  " + r.cat + "/" + r.key + " (" + r.kind + ")");
    return;
  }

  const rows = sweep({ cats, M, vis });

  if (has("attribute")) {
    const flagged = rows.filter((r) => only ? only.includes(r.cls)
      : !["OK", "BASELINE"].includes(r.cls));
    for (const r of flagged) {
      console.log(`\n${r.cat}/${r.optionId}  ${r.cls}  ` +
        `${(r.dHaus * 1000).toFixed(2)}mm vs ${r.signature ? r.equivalent : "default"}`);
      const keys = attribute(M, r, { vis });
      if (!keys.length) { console.log("   (no resolved recipe key differs — the whole delta is the tier)"); continue; }
      for (const k of keys)
        console.log(`   ${String(k.key).padEnd(16)}${JSON.stringify(k.from)} -> ${JSON.stringify(k.to)}`.padEnd(58) +
          `${(k.dHaus * 1000).toFixed(2).padStart(8)}mm  area ${k.movedArea.toFixed(4)}  col ${k.colArea.toFixed(4)}`);
    }
    return;
  }

  if (has("calibrate")) {
    const real = rows.filter((r) => !(r.isDefault && !r.signature) && !r.broken)
      .sort((a, b) => a.dHaus - b.dHaus);
    const q = (p) => (real[Math.min(real.length - 1, Math.floor(p * real.length))].dHaus * 1000).toFixed(2);
    console.log("rows scored:", real.length);
    console.log("dHaus deciles (mm):", [0, .1, .2, .3, .4, .5, .6, .7, .8, .9].map(q).join("  "),
                " max", (real[real.length - 1].dHaus * 1000).toFixed(1));
    for (const t of [1, 2, 3, 5, 8, 10, 15, 20, 30, 50]) {
      const u = real.filter((r) => r.dHaus * 1000 <= t);
      console.log(`  <= ${String(t).padStart(2)} mm : ${String(u.length).padStart(3)}  (SIGNATURE ${u.filter((r) => r.signature).length})`);
    }
    console.log("\n40 smallest:");
    for (const r of real.slice(0, 40))
      console.log(`  ${r.cat.padEnd(11)}${r.optionId.padEnd(26)}${(r.signature ? "SIG " : "    ")}` +
        `${(r.dHaus * 1000).toFixed(2).padStart(7)}mm  vis ${(r.dHausVis * 1000).toFixed(2).padStart(7)}` +
        `  area ${r.movedArea.toFixed(4)}  col ${r.colArea.toFixed(4)}  mat ${r.matArea.toFixed(4)}` +
        `  corr ${(r.dCorr * 1000).toFixed(1).padStart(6)}  ${r.where}`);
    return;
  }

  const show = only ? rows.filter((r) => only.includes(r.cls)) : rows;
  if (has("json")) { console.log(JSON.stringify(show, null, 1)); return; }

  const F = (v, w) => String(v).padEnd(w);
  console.log(F("cat", 12) + F("option", 26) + F("base", 20) + F("dHaus", 9) + F("vis", 9) +
              F("area", 9) + F("col", 8) + F("mat", 8) + F("dtri", 7) + "where");
  for (const r of show) {
    const base = r.signature ? r.equivalent : (r.isDefault ? "(self)" : "default");
    console.log(F(r.cat, 12) + F(r.optionId, 26) + F(base, 20) +
      F((r.dHaus * 1000).toFixed(1) + "mm", 9) + F((r.dHausVis * 1000).toFixed(1) + "mm", 9) +
      F(r.movedArea.toFixed(4), 9) +
      F(r.colArea.toFixed(3), 8) + F(r.matArea.toFixed(3), 8) + F(r.dTri, 7) +
      (r.where || "-") + (r.cls === "OK" || r.cls === "BASELINE" ? "" : "   << " + r.cls));
  }
  const tally = {};
  for (const r of rows) tally[r.cls] = (tally[r.cls] || 0) + 1;
  console.log("\n" + rows.length + " rows: " +
    Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => v + " " + k).join(" · "));
  if (rows.some((r) => r.cls === "INVISIBLE" || r.cls === "BROKEN")) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
