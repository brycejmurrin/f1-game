#!/usr/bin/env node
// clip-audit.cjs — PROP-VS-PROP interpenetration detector for Apex 26.
// @doc PROP-VS-PROP interpenetration detector (emission-order adjacency); `--gate` ratchets against `clip-baseline.json`.
// @skill scenery-dress
//
// The engine guards scenery horizontally against the ROAD (onTrack, rejBox,
// blockAt) and vertically against the GROUND (float-audit). Nothing guards a
// prop against another prop, so models pass visibly through each other.
//
// The hard part is not finding overlaps — it is telling a defect from the very
// large amount of geometry that is BUILT to interpenetrate. float-audit's old
// --clip mode reported 15 962 pairs on Monza and said so itself. Four filters
// separate the two populations, each justified by measurement:
//
//   soft-material   both sides foliage/wood -> a forest, by design.
//                   (Monza 15 962 -> 1 874.)
//   adjacency       primitives emitted within ADJ of each other are one
//                   assembly: a bush's lobes, a tree's canopy tiers, a
//                   building's sections, one along() step's members.
//                   (Monza 1 874 -> 1 194, Zandvoort 2 265 -> 529.)
//   convex SAT      an axis-aligned box over a diagonal wall is a fat
//                   over-approximation, worst exactly where the defects are.
//                   Rejects ~59% of Monaco's pairs, ~42% of Monza's.
//   depth gate      severity is PENETRATION DEPTH, not overlap volume: a large
//                   overlap between two slabs can be invisible, 3 m of
//                   penetration never is. 0.5 m is the measured knee — below
//                   it every bucket is barrier-ribbon graze or facade mullion.
//
// Usage:
//   node tools/track/clip-audit.cjs <trackId> [--why] [--depth M] [--adj N]
//   node tools/track/clip-audit.cjs --all [--json] [--gate]
//
// --gate exits 1 if any circuit exceeds its BASELINE severe-spot count.

"use strict";

const { buildContext, shipped, siteOf, primKey } = require("../lib/track-build-vm.cjs");

// ---------------------------------------------------------------------------
// Tunables. Defaults are the measured values; every one is overridable so a
// number in a report can be re-derived rather than taken on trust.

const MIN_VOL = 0.05;      // ignore slivers (m3)
const MAX_DIM = 25;        // landforms are BUILT to interpenetrate (m)
const NEAR_TRACK = 70;     // off-camera scenery is not a player-visible defect (m)
const ADJ = 8;             // emission-order distance that counts as one model
const DEPTH_MIN = 0.5;     // report threshold (m)
const SEVERE = 1.0;        // gate threshold (m)
const SPOT = 40;           // spot clustering cell (m) — 20 over-fragments
const MAX_AXES = 24;       // SAT axis cap per primitive

const ck = (ix, iz) => ix * 4000003 + iz;
const vol = (p) => (p.maxX - p.minX) * (p.maxY - p.minY) * (p.maxZ - p.minZ);
const span = (p) => Math.max(p.maxX - p.minX, p.maxY - p.minY, p.maxZ - p.minZ);

// ---------------------------------------------------------------------------
// Convex narrowphase.
//
// Point-set SAT over each primitive's OWN vertices, not an OBB reconstructed
// from constructor arguments: addPrism is triangular, addPyramid and addCone
// taper, and raw emit() polygons are arbitrary — an OBB over a cone
// over-reports about as badly as an AABB over a diagonal wall. One function,
// no per-shape dispatch, exact for every primitive kind the engine emits.
// (addMountain is non-convex, but the MAX_DIM gate excludes it.)

function axesOf(p) {
  const nrm = p.buf && p.buf.nrm;
  const out = [];
  if (!nrm) return out;
  const seen = new Set();
  for (let i = p.s; i < p.e && out.length < MAX_AXES; i += 3) {
    let x = nrm[i], y = nrm[i + 1], z = nrm[i + 2];
    const L = Math.hypot(x, y, z);
    if (!(L > 1e-6)) continue;
    x /= L; y /= L; z /= L;
    // Canonical sign — an axis and its negation are the same separating axis.
    if (x < -1e-9 || (Math.abs(x) <= 1e-9 && (y < -1e-9 ||
        (Math.abs(y) <= 1e-9 && z < -1e-9)))) { x = -x; y = -y; z = -z; }
    const key = `${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([x, y, z]);
  }
  return out;
}

function project(p, ax) {
  const pos = p.buf.pos;
  let lo = Infinity, hi = -Infinity;
  for (let i = p.s; i < p.e; i += 3) {
    const d = pos[i] * ax[0] + pos[i + 1] * ax[1] + pos[i + 2] * ax[2];
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  return [lo, hi];
}

// Penetration depth along the least-overlapping separating-axis candidate, or
// 0 when any candidate axis separates the two.
function satDepth(a, b) {
  const A = axesOf(a), B = axesOf(b);
  if (!A.length || !B.length) return 0;
  const axes = A.concat(B);
  // Edge-edge configurations are only caught by cross-product axes. Omitting
  // them can only ever OVER-state depth (more axes can only lower the minimum),
  // so they matter for severity, not just for rejection.
  for (let i = 0; i < Math.min(3, A.length); i++)
    for (let j = 0; j < Math.min(3, B.length); j++) {
      const u = A[i], v = B[j];
      const x = u[1] * v[2] - u[2] * v[1];
      const y = u[2] * v[0] - u[0] * v[2];
      const z = u[0] * v[1] - u[1] * v[0];
      const L = Math.hypot(x, y, z);
      if (L > 1e-6) axes.push([x / L, y / L, z / L]);
    }
  let best = Infinity;
  for (const ax of axes) {
    const [al, ah] = project(a, ax), [bl, bh] = project(b, ax);
    const ov = Math.min(ah, bh) - Math.max(al, bl);
    if (ov <= 0) return 0;                 // separated — not touching at all
    if (ov < best) best = ov;
  }
  return best === Infinity ? 0 : best;
}

// ---------------------------------------------------------------------------

function analyse(env, track, prims, opt) {
  const MAT = env.TrackGeom.MAT || {};
  const soft = (p) => p.mat === MAT.FOLIAGE || p.mat === MAT.WOOD;
  const nearTrack = (p) => {
    const cx = (p.minX + p.maxX) / 2, cz = (p.minZ + p.maxZ) / 2;
    for (let k = 0; k < track.n; k += 4) {
      const dx = cx - track.px[k], dz = cz - track.pz[k];
      if (dx * dx + dz * dz < NEAR_TRACK * NEAR_TRACK) return true;
    }
    return false;
  };

  const G = 10, grid = new Map();
  prims.forEach((p, i) => {
    if (vol(p) < MIN_VOL || span(p) > MAX_DIM || !nearTrack(p)) return;
    for (let gx = Math.floor(p.minX / G); gx <= Math.floor(p.maxX / G); gx++)
      for (let gz = Math.floor(p.minZ / G); gz <= Math.floor(p.maxZ / G); gz++) {
        const k = ck(gx, gz);
        let a = grid.get(k); if (!a) grid.set(k, a = []);
        a.push(i);
      }
  });

  const seen = new Set(), hits = [];
  const stats = { broad: 0, softPair: 0, adjacent: 0, shapeGate: 0, separated: 0, shallow: 0 };
  for (const [, arr] of grid) {
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const ia = arr[i], ib = arr[j];
      const a = prims[ia], b = prims[ib];
      // AABB FIRST, `seen` SECOND. `seen` exists only to stop a pair being
      // processed twice when both primitives span more than one 10 m cell, so
      // it needs to hold the pairs that reach the EXPENSIVE stage — not every
      // pair that happens to share a cell. The overlap test below is pure in a
      // and b, so running it before the dedup costs a duplicate three repeated
      // min/max pairs and saves storing a key for the rest of the circuit.
      // Verified output-identical: all 40 circuits, byte for byte against the
      // previous code.
      //
      // THIS IS NOT WHY `--all` RAN OUT OF MEMORY, though the first OOM stack
      // pointed straight at it (Runtime_SetGrow under OrderedHashSet::Rehash)
      // and that was mistaken for the cause. With this in place the sweep still
      // died at the same ~4090 MB, 215 s against 227 s — twelve seconds bought.
      // What settled it was measuring one circuit alone: Las Vegas, the densest
      // on the calendar at ~1.8 M prop verts, finishes in 11.7 s inside the same
      // 4 GB ceiling. No single circuit is anywhere near the limit, so the cost
      // is CUMULATIVE across the 40-circuit sweep — the one shared VM context
      // above (kept because per-track contexts made --all 24x more expensive)
      // never releases a circuit it has finished with. Raising the ceiling in
      // .github/workflows/ci.yml is what makes the sweep survive; it is not what
      // makes it frugal, and the retention is still there to be fixed.
      const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
      const oy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
      const oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
      if (ox <= 0.02 || oy <= 0.02 || oz <= 0.02) continue;
      const key = ia < ib ? ia * 1e7 + ib : ib * 1e7 + ia;
      if (seen.has(key)) continue; seen.add(key);
      stats.broad++;
      if (soft(a) && soft(b)) { stats.softPair++; continue; }
      if (Math.abs(a.q - b.q) <= opt.adj) { stats.adjacent++; continue; }
      const ov = ox * oy * oz, va = vol(a), vb = vol(b), small = Math.min(va, vb);
      if (ov < 0.5 ||                          // incidental
          ov > small * 0.85 ||                 // containment: deliberate detail
          ov / small < 0.30 ||                 // grazing touch
          Math.max(va, vb) / small > 8) {      // detail inside a mass
        stats.shapeGate++; continue;
      }
      const depth = satDepth(a, b);
      if (depth <= 0) { stats.separated++; continue; }
      if (depth < opt.depth) { stats.shallow++; continue; }
      hits.push({ depth, ov, a, b });
    }
  }
  hits.sort((x, y) => y.depth - x.depth);

  const fracOf = (x, z) => {
    let best = Infinity, bk = 0;
    for (let k = 0; k < track.n; k++) {
      const dx = x - track.px[k], dz = z - track.pz[k], d = dx * dx + dz * dz;
      if (d < best) { best = d; bk = k; }
    }
    return bk / track.n;
  };
  const spotKey = (h) =>
    `${Math.round((h.a.minX + h.a.maxX) / 2 / SPOT)}|${Math.round((h.a.minZ + h.a.maxZ) / 2 / SPOT)}`;
  const spots = new Map();
  for (const h of hits) {
    h.frac = fracOf((h.a.minX + h.a.maxX) / 2, (h.a.minZ + h.a.maxZ) / 2);
    const k = spotKey(h);
    const e = spots.get(k);
    if (!e || h.depth > e.depth) spots.set(k, h);
  }
  const severeSpots = [...spots.values()].filter((h) => h.depth >= SEVERE);
  return { hits, spots: [...spots.values()], severeSpots, stats };
}

function run(id, opt, env) {
  const own = !env;
  if (own) env = buildContext();
  const from = env.mark();
  const track = env.Tracks.build(env.Tracks.LIST.find((d) => d.id === id));
  const prims = shipped(env.prims.slice(from), env.liveBufs);
  // Release this circuit's primitives (and the mesh buffers they keep alive)
  // now that shipped() has copied out what analyse() needs — see the comment
  // on trim() in track-build-vm.cjs. Harmless when `own`: env is discarded
  // right after this function returns either way.
  env.trim(from);
  const res = analyse(env, track, prims, opt);
  return Object.assign({ id, prims: prims.length }, res);
}

// ---------------------------------------------------------------------------
// CLI

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] != null ? +args[i + 1] : def;
};
const opt = { depth: flag("--depth", DEPTH_MIN), adj: flag("--adj", ADJ) };
const asJson = args.includes("--json");
const gate = args.includes("--gate");
const why = args.includes("--why");

// Per-circuit SEVERE spot caps. Same semantics as tests/specs/props-over-road.spec.js:
// a circuit NOT in this map must read 0, and a capped circuit fails when its
// number GROWS. Lower each cap as circuits are cleaned — that is the ratchet.
const BASELINE = require("./clip-baseline.json");

function report(r) {
  console.log(`\n${r.id.padEnd(13)} ${String(r.severeSpots.length).padStart(4)} severe spot(s) ` +
              `(>=${SEVERE}m)  ${String(r.spots.length).padStart(4)} total spot(s) ` +
              `(>=${opt.depth}m)  from ${r.hits.length} pair(s)`);
  for (const h of r.spots.slice(0, why ? 4 : 8)) {
    const tag = h.depth >= SEVERE ? "SEVERE" : "minor ";
    console.log(`   ${tag} ${h.depth.toFixed(2).padStart(6)}m  ov ${h.ov.toFixed(0).padStart(5)}m3  ` +
                `@(${((h.a.minX + h.a.maxX) / 2).toFixed(0)},${((h.a.minZ + h.a.maxZ) / 2).toFixed(0)})  ` +
                `frac ${h.frac.toFixed(3)}  ${h.a.name} x ${h.b.name}`);
  }
}

function attribute(id, r) {
  // Second deterministic pass with stack capture on exactly the flagged prims.
  const want = new Set();
  for (const h of r.hits) { want.add(primKey(h.a)); want.add(primKey(h.b)); }
  const env = buildContext({ stackFor: want });
  env.Tracks.build(env.Tracks.LIST.find((d) => d.id === id));
  const at = new Map();
  for (const p of env.prims) if (p.stack) at.set(primKey(p), p.stack);
  const pairs = new Map();
  for (const h of r.hits) {
    const sa = siteOf(at.get(primKey(h.a))), sb = siteOf(at.get(primKey(h.b)));
    // Sorted, so `A x B` and `B x A` collapse into one bucket.
    const k = sa <= sb ? `${sa}   x   ${sb}` : `${sb}   x   ${sa}`;
    const e = pairs.get(k) || { n: 0, depth: 0, frac: 0 };
    e.n++;
    if (h.depth > e.depth) { e.depth = h.depth; e.frac = h.frac; }
    pairs.set(k, e);
  }
  console.log(`  call-site pairings (${pairs.size}) — triage these, not the spots:`);
  for (const [k, e] of [...pairs].sort((a, b) => b[1].n - a[1].n).slice(0, 14))
    console.log(`   x${String(e.n).padStart(4)} max ${e.depth.toFixed(2)}m @frac ${e.frac.toFixed(3)}  ${k}`);
}

const ids = args.includes("--all")
  ? buildContext().Tracks.LIST.map((d) => d.id)
  : [args.find((a) => !a.startsWith("-") && isNaN(+a))];

if (!ids[0]) {
  console.error("usage: clip-audit.cjs <trackId> [--why] | --all [--json] [--gate]");
  process.exit(2);
}

const out = [];
// One VM context for the whole sweep: buildContext re-evaluates every engine
// source, so per-track contexts made --all 24x more expensive than it needed
// to be.
const env = ids.length > 1 ? buildContext() : null;
let failed = 0;
for (const id of ids) {
  const r = run(id, opt, env);
  out.push({ id, severe: r.severeSpots.length, spots: r.spots.length,
             pairs: r.hits.length, stats: r.stats });
  if (!asJson) { report(r); if (why) attribute(id, r); }
  if (gate) {
    const cap = BASELINE[id] != null ? BASELINE[id] : 0;
    if (r.severeSpots.length > cap) {
      failed++;
      console.error(`FAIL ${id}: ${r.severeSpots.length} severe spots > baseline ${cap}`);
    }
  }
}
if (asJson) console.log(JSON.stringify(out, null, 1));
else if (ids.length > 1) {
  const tot = out.reduce((s, o) => s + o.severe, 0);
  console.log(`\n${"=".repeat(72)}\n${tot} severe spot(s) across ${ids.length} circuits`);
}
process.exit(gate && failed ? 1 : 0);
