#!/usr/bin/env node
// coplanar-audit.cjs — SAME-FACING coplanar faces, the z-fighting detector.
// @doc Z-fighting detector — same-facing coplanar faces (`dot ≥ 0.999`); `--gate` ratchets against `coplanar-baseline.json`.
// @skill scenery-dress
//
// Sibling to clip-audit.cjs, and deliberately NOT a flag on it: clip-audit
// measures interpenetration DEPTH and two of its filters are actively wrong here.
//   * DEPTH_MIN = 0.5 discards everything shallower as `shallow` — but z-fighting
//     lives at penetration ~= 0, precisely that bucket. On Qatar clip-audit
//     reports severe:1 while carrying shallow:107 / separated:55.
//   * ADJ = 8 (emission-order "same assembly") must NOT be reused. On Qatar most
//     coplanar pairs ARE q-adjacent — including the pit-wall/pit-garage pair this
//     tool was written to find. "Same assembly" means benign for interpenetration
//     and is exactly where the defect lives for coplanarity.
//
// THE LOAD-BEARING IDEA: only SAME-FACING coplanarity can fight.
//
// gl.enable(CULL_FACE) + cullFace(BACK) is on (js/render/glx/glx.js, GL state setup) and
// addBox reverses winding so the OUTWARD face survives (js/track/core/geom.js addBox).
// So for an ANTI-parallel coplanar pair — a window pane's inner face against the
// wall it sits on, a stacked mass section, an abutting terrace facade, a kerb on
// terrain — exactly one face is ever rasterised, and it cannot fight. Gating on
// dot(nA,nB) >= 0.999 removes that entire legitimate population BY CONSTRUCTION
// rather than by heuristics: the renderer already tells us which touches are
// benign. What remains is two faces pointing the same way at the same depth,
// both drawn, both writing depth.
//
// Severity is reported as a DISTANCE, not a millimetre count: the range beyond
// which the pair starts to fight, from the depth buffer's own resolution. That
// re-derives itself if js/game.js ever changes the near/far planes — the drift
// that produces this bug class in the first place.
//
// Usage:
//   node tools/coplanar-audit.cjs <trackId> [--why]
//   node tools/coplanar-audit.cjs --all [--json] [--gate]
//   flags: --gap <m>  --area <m2>  --fight <m>  --horizontal

"use strict";

const fs = require("fs");
const path = require("path");
const { buildContext, shipped, primKey, ROOT, RAW_FRAME } = require("./track-build-vm.cjs");

// Local site formatter — deliberately NOT track-build-vm's siteOf, which strips
// the parenthesised location. For coplanarity the file:line IS the finding: two
// faces at the same depth are only actionable once you know which two lines put
// them there, and "buildProps < build" names every prop in the game.
function site(stack) {
  const fr = (stack || "?").split("  <-  ")
    .map((f) => {
      const m = /^(\S+)\s+\((.*)\)$/.exec(f);
      if (!m) return { fn: f, loc: "" };
      const l = m[2].replace(/^.*\/(js|tools)\//, "");
      return { fn: m[1].replace(/^Object\./, ""), loc: l };
    })
    // Scene-graph plumbing names the replay machinery, never the emitter that
    // wanted a model — walk past it exactly as RAW_FRAME walks past addBox.
    .filter((f) => !RAW_FRAME.test(f.fn) && !/graph\.js/.test(f.loc) &&
                   !/^(instance|replay)$/.test(f.fn));
  if (!fr.length) return "?";
  return fr.slice(0, 2).map((f) => (f.loc ? `${f.fn}@${f.loc}` : f.fn)).join(" < ");
}

// ---------------------------------------------------------------------------
// Tunables. Defaults are the measured values; each is overridable so a number in
// a report can be re-derived rather than taken on trust.

const SAME_FACING = 0.999;   // dot(nA,nB) — the cull-based legitimacy gate
const GAP_MAX = 0.020;       // plane separation worth looking at (m)
const AREA_MIN = 2.0;        // overlap area on the shared plane (m2)
const FIGHT_MAX = 150;       // gate: fights within this distance (m)
const NEAR_TRACK = 300;      // beyond this, fog+framing make it moot (m)
// Big is not benign here. clip-audit caps primitive span at 25 m because
// landforms are BUILT to interpenetrate — a depth-of-penetration argument. It
// does not carry over: a grandstand wall coplanar with the band inside it is a
// worse fight than a fencepost, not a lesser one, because the fighting area
// scales with the face. Capping at 25 hid Qatar's 2000 m2 stand walls entirely.
// The cap survives only to keep terrain skirts and skyline slabs from drowning
// the report; --maxdim raises it.
const MAX_DIM = 220;
const MAX_FACES = 64;        // per primitive — cones/spheres must not dominate
const PLANAR_TOL = 0.020;    // reject non-planar vertex fans (m)
const SPOT = 40;             // spot clustering cell (m), same as clip-audit

// Depth-buffer resolution. 24-bit non-reversed; cockpit/hood near plane is the
// worst case (js/game.js `_nearM` — 0.3 for cockpit|hood, 0.9 otherwise,
// `farPlane` 900).
const NEAR = 0.3, FAR = 900, DEPTH_BITS = 24;
const K = (1 / NEAR - 1 / FAR) / Math.pow(2, DEPTH_BITS);
// Distance at which a plane gap collapses to one depth unit. gap 0 => 0 => it
// fights everywhere, which is the worst case and sorts first.
const fightDist = (gap) => Math.sqrt(Math.max(0, gap) / K);

const ck = (ix, iz) => ix * 4000003 + iz;
const span = (p) => Math.max(p.maxX - p.minX, p.maxY - p.minY, p.maxZ - p.minZ);

// An in-plane basis derived from the normal ALONE, so two faces that pass the
// SAME_FACING test get the same axes and their extents are directly comparable.
// Needed because scenery is laid on the track's Frenet basis: a stand on a
// diagonal straight is axis-aligned to nothing, and measuring its face by AABB
// axes returns the ground FOOTPRINT (len x len) instead of the face (len x
// height) — off by an order of magnitude on exactly the biggest offenders.
function planeBasis(n) {
  const up = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let e1 = [n[1] * up[2] - n[2] * up[1], n[2] * up[0] - n[0] * up[2], n[0] * up[1] - n[1] * up[0]];
  const l = Math.hypot(e1[0], e1[1], e1[2]) || 1;
  e1 = [e1[0] / l, e1[1] / l, e1[2] / l];
  const e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
  return [e1, e2];
}

// ---------------------------------------------------------------------------
// Face extraction. Walk a primitive's [s,e) vertex range and group CONSECUTIVE
// vertices sharing an exactly-equal normal — which is how the emitters write
// (addBox emits 4 verts per face with one normal, emit() k verts per polygon),
// so the grouping is exact and needs no shape re-derivation.
function facesOf(p, pos, nrm) {
  const out = [];
  if (!nrm) return out;
  let i = p.s;
  while (i < p.e && out.length < MAX_FACES) {
    const nx = nrm[i], ny = nrm[i + 1], nz = nrm[i + 2];
    let j = i + 3;
    while (j < p.e && nrm[j] === nx && nrm[j + 1] === ny && nrm[j + 2] === nz) j += 3;
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-6 && j - i >= 9) {         // >= 3 verts, real normal
      const ux = nx / len, uy = ny / len, uz = nz / len;
      const [e1, e2] = planeBasis([ux, uy, uz]);
      let dMin = Infinity, dMax = -Infinity, dSum = 0, n = 0;
      let mnx = Infinity, mny = Infinity, mnz = Infinity;
      let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
      let a1 = Infinity, b1 = -Infinity, a2 = Infinity, b2 = -Infinity;
      for (let v = i; v < j; v += 3) {
        const x = pos[v], y = pos[v + 1], z = pos[v + 2];
        const d = ux * x + uy * y + uz * z;
        if (d < dMin) dMin = d; if (d > dMax) dMax = d;
        dSum += d; n++;
        if (x < mnx) mnx = x; if (x > mxx) mxx = x;
        if (y < mny) mny = y; if (y > mxy) mxy = y;
        if (z < mnz) mnz = z; if (z > mxz) mxz = z;
        const u1 = e1[0] * x + e1[1] * y + e1[2] * z;
        const u2 = e2[0] * x + e2[1] * y + e2[2] * z;
        if (u1 < a1) a1 = u1; if (u1 > b1) b1 = u1;
        if (u2 < a2) a2 = u2; if (u2 > b2) b2 = u2;
      }
      // A fan whose vertices do not share a plane is not a face.
      if (dMax - dMin <= PLANAR_TOL)
        out.push({ pi: p.__i, n: [ux, uy, uz], d: dSum / n,
                   mn: [mnx, mny, mnz], mx: [mxx, mxy, mxz],
                   u1: [a1, b1], u2: [a2, b2] });
    }
    i = j;
  }
  return out;
}

// Overlap area of two coplanar faces, measured in the shared plane's own axes.
// Exact for the axis-aligned quads the emitters produce, and — unlike an AABB
// product — independent of how the piece is rotated in the world.
function overlapArea(a, b) {
  const o1 = Math.min(a.u1[1], b.u1[1]) - Math.max(a.u1[0], b.u1[0]);
  const o2 = Math.min(a.u2[1], b.u2[1]) - Math.max(a.u2[0], b.u2[0]);
  return o1 <= 0 || o2 <= 0 ? 0 : o1 * o2;
}

function analyse(track, prims, opt) {
  const stats = { prims: prims.length, faces: 0, buckets: 0, antiParallel: 0,
                  tooFar: 0, tooSmall: 0, notFighting: 0 };

  // Centreline proximity — a coarse grid over the track nodes, same idea as
  // clip-audit's NEAR_TRACK gate but wider (a skyline is still on camera).
  const near = (x, z) => {
    for (let k = 0; k < track.n; k++) {
      const dx = x - track.px[k], dz = z - track.pz[k];
      if (dx * dx + dz * dz < NEAR_TRACK * NEAR_TRACK) return true;
    }
    return false;
  };

  const faces = [];
  for (let i = 0; i < prims.length; i++) {
    const p = prims[i];
    if (span(p) > opt.maxDim) continue;
    p.__i = i;
    // Each primitive indexes into ITS OWN buffer. Faces must be pooled across
    // all of them: props and glass are separate meshes but are rasterised into
    // the same depth buffer, so a pane coplanar with the wall behind it fights
    // exactly like two props do. Bucketing per-buffer made that pair invisible.
    for (const f of facesOf(p, p.buf.pos, p.buf.nrm)) faces.push(f);
  }
  stats.faces = faces.length;

  // Bucket by (quantised normal, quantised plane distance). Insert into the
  // neighbouring d-buckets too so a pair straddling a bucket edge is still seen.
  const bucket = new Map();
  const q = (v) => Math.round(v * 100) / 100;
  for (const f of faces) {
    const db = Math.round(f.d / opt.gap);
    for (const off of [-1, 0, 1]) {
      const key = `${q(f.n[0])},${q(f.n[1])},${q(f.n[2])}|${db + off}`;
      let arr = bucket.get(key);
      if (!arr) bucket.set(key, (arr = []));
      arr.push(f);
    }
  }
  stats.buckets = bucket.size;

  const hits = [];
  const seen = new Set();
  for (const [, arr] of bucket) {
    if (arr.length < 2 || arr.length > 500) continue;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        if (a.pi === b.pi) continue;                       // same primitive
        const dot = a.n[0] * b.n[0] + a.n[1] * b.n[1] + a.n[2] * b.n[2];
        if (dot < SAME_FACING) { stats.antiParallel++; continue; }
        if (!opt.horizontal && Math.abs(a.n[1]) >= 0.5) continue;   // vertical only
        const gap = Math.abs(a.d - b.d);
        if (gap > opt.gap) continue;
        const area = overlapArea(a, b);
        if (area < opt.area) { stats.tooSmall++; continue; }
        const fd = fightDist(gap);
        if (fd > opt.fight) { stats.notFighting++; continue; }
        const cx = (Math.max(a.mn[0], b.mn[0]) + Math.min(a.mx[0], b.mx[0])) / 2;
        const cz = (Math.max(a.mn[2], b.mn[2]) + Math.min(a.mx[2], b.mx[2])) / 2;
        if (!near(cx, cz)) { stats.tooFar++; continue; }
        const key = a.pi < b.pi ? `${a.pi}:${b.pi}` : `${b.pi}:${a.pi}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({ a: prims[a.pi], b: prims[b.pi], gap, area, fight: fd, x: cx, z: cz });
      }
    }
  }

  // Cluster into 40 m spots so one grandstand is one finding, not forty.
  const spots = new Map();
  for (const h of hits) {
    const key = ck(Math.floor(h.x / SPOT), Math.floor(h.z / SPOT));
    const s = spots.get(key);
    if (!s) spots.set(key, { n: 1, minGap: h.gap, maxArea: h.area, minFight: h.fight, x: h.x, z: h.z });
    else {
      s.n++;
      if (h.gap < s.minGap) s.minGap = h.gap;
      if (h.area > s.maxArea) s.maxArea = h.area;
      if (h.fight < s.minFight) s.minFight = h.fight;
    }
  }
  const list = [...spots.values()].sort((p, r) => p.minFight - r.minFight);
  return { pairs: hits.length, spots: list.length, hits, spotList: list, stats };
}

function run(env, id, opt) {
  const Tracks = env.Tracks;
  const def = Tracks.LIST.find((d) => d.id === id);
  if (!def) throw new Error(`no such track: ${id}`);
  const from = env.mark();
  const track = Tracks.build(def, {});
  const prims = shipped(env.prims.slice(from), env.liveBufs);
  // See the comment on trim() in track-build-vm.cjs: without this, a shared
  // context accumulates every circuit's full mesh buffers for the life of the
  // sweep (measured 4157 MB -> 97 MB for the 40-circuit --all run).
  env.trim(from);
  return Object.assign({ id }, analyse(track, prims, opt));
}

// ---------------------------------------------------------------------------
function main() {
  const argv = process.argv.slice(2);
  const flag = (name, def) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : def;
  };
  const opt = {
    gap: flag("gap", GAP_MAX),
    area: flag("area", AREA_MIN),
    fight: flag("fight", FIGHT_MAX),
    maxDim: flag("maxdim", MAX_DIM),
    horizontal: argv.includes("--horizontal"),
  };
  const wantJson = argv.includes("--json");
  const wantGate = argv.includes("--gate");
  const why = argv.includes("--why");

  const env = buildContext();
  const ids = argv.includes("--all")
    ? env.Tracks.LIST.map((d) => d.id)
    // Skip any token consumed as a flag's VALUE, or `--site scenery-city.js:109`
    // is read as a track id.
    : argv.filter((a, i) => !a.startsWith("--") && isNaN(Number(a)) &&
                            !(i > 0 && argv[i - 1].startsWith("--")));

  const out = [];
  for (const id of ids) {
    const r = run(env, id, opt);
    out.push({ id, pairs: r.pairs, spots: r.spots, stats: r.stats });
    if (!wantJson) {
      console.log(`${id}: ${r.spots} spot(s), ${r.pairs} same-facing coplanar pair(s)` +
        (r.spotList.length ? `  worst fights from ${r.spotList[0].minFight.toFixed(0)} m` : ""));
      for (const s of r.spotList.slice(0, why ? 8 : 4))
        console.log(`   n=${String(s.n).padStart(4)}  gap ${(s.minGap * 1000).toFixed(1).padStart(6)} mm` +
          `  area ${s.maxArea.toFixed(1).padStart(6)} m2  fights from ${s.minFight.toFixed(0).padStart(4)} m`);
    }
  }

  if (why) {
    // Second deterministic pass with stack capture on exactly the flagged prims,
    // same protocol as clip-audit --why. Across --all this aggregates by call
    // site GLOBALLY, which is the point: the leverage is in the shared emitters
    // (one flush-face bug reaching twenty circuits), not in per-track lists.
    const want = new Set();
    const firsts = new Map();
    for (const id of ids) {
      const r = run(env, id, opt);
      firsts.set(id, r);
      for (const h of r.hits) { want.add(primKey(h.a)); want.add(primKey(h.b)); }
    }
    const env2 = buildContext({ stackFor: want });
    const pairs = new Map();
    const rawHits = [];
    for (const id of ids) {
      const r2 = run(env2, id, opt);
      const at = new Map();
      for (const p of env2.prims) if (p.stack) at.set(primKey(p), p.stack);
      for (const h of r2.hits) {
        const sa = site(at.get(primKey(h.a))), sb = site(at.get(primKey(h.b)));
        const key = sa < sb ? `${sa}  X  ${sb}` : `${sb}  X  ${sa}`;
        const e = pairs.get(key) || { n: 0, maxArea: 0, minGap: Infinity, tracks: new Set() };
        e.n++; e.maxArea = Math.max(e.maxArea, h.area); e.minGap = Math.min(e.minGap, h.gap);
        e.tracks.add(id);
        pairs.set(key, e);
        if (rawHits.length < 400) rawHits.push({ id, h, at });
      }
    }
    if (argv.includes("--raw")) {
      // --site <substr> narrows the dump to one call site, which is the only way
      // to look at a bucket that is not the biggest one.
      const si = argv.indexOf("--site");
      const want2 = si >= 0 ? argv[si + 1] : null;
      let sel = rawHits;
      if (want2) sel = rawHits.filter(({ h, at }) =>
        (site(at.get(primKey(h.a))) + site(at.get(primKey(h.b)))).includes(want2));
      sel = sel.slice().sort((p, q) => q.h.area - p.h.area);
      console.log(`\nraw stacks (top ${Math.min(3, sel.length)} by area of ${sel.length}):`);
      for (const { h, at } of sel.slice(0, 3)) {
        const ext = (p) => `${p.name} [${p.minX.toFixed(1)},${p.minY.toFixed(1)},${p.minZ.toFixed(1)}]` +
          `..[${p.maxX.toFixed(1)},${p.maxY.toFixed(1)},${p.maxZ.toFixed(1)}] q=${p.q}`;
        console.log(`  area ${h.area.toFixed(1)} gap ${(h.gap * 1000).toFixed(2)}mm`);
        console.log(`  A ${ext(h.a)}\n    ${at.get(primKey(h.a)) || "?"}`);
        console.log(`  B ${ext(h.b)}\n    ${at.get(primKey(h.b)) || "?"}\n`);
      }
    }
    console.log("\nby call site:");
    for (const [k, e] of [...pairs].sort((a, b) => b[1].n - a[1].n).slice(0, 30))
      console.log(`  ${String(e.n).padStart(5)}  ${String(e.tracks.size).padStart(2)} trk` +
        `  maxArea ${e.maxArea.toFixed(1).padStart(7)} m2` +
        `  minGap ${(e.minGap * 1000).toFixed(1).padStart(6)} mm   ${k}`);
  }

  if (wantJson) console.log(JSON.stringify(out, null, 1));

  if (wantGate) {
    const bp = path.join(ROOT, "tools", "coplanar-baseline.json");
    const base = fs.existsSync(bp) ? JSON.parse(fs.readFileSync(bp, "utf8")) : {};
    const grew = out.filter((r) => r.spots > (base[r.id] || 0))
      .map((r) => `${r.id}: ${r.spots} spots > baseline ${base[r.id] || 0}`);
    if (grew.length) { console.error("\ncoplanar faces grew:\n  " + grew.join("\n  ")); process.exit(1); }
    console.log(`\n✓ all ${out.length} circuit(s) within the coplanar baseline`);
  }
}

if (require.main === module) main();
module.exports = { fightDist, overlapArea, facesOf, SAME_FACING };
