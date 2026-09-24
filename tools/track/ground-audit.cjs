#!/usr/bin/env node
// ground-audit.cjs — the SMALL-SCALE vertical checks float-audit is too coarse for.
// @doc Buried slabs, unsupported prims, flat coplanar faces; `--all --gate`/`--update` ratchet `scenery-audit-baseline.json`.
// @skill scenery-dress
//
// Three checks, one track build each, all ratcheted per circuit:
//
//   buried       a prop primitive whose TOP lies below Tracks.terrainY by more
//                than BURY_EPS at every sample of its top (the top-face vertices
//                and their centroid). Its whole height is under the terrain, so
//                it is invisible: paint, decals or a slab laid at the wrong
//                height. A foundation whose top clears the ground is NOT
//                flagged — only prims with no visible part, which makes an
//                allowlist unnecessary.
//   unsupported  a prop primitive whose bottom stands more than GAP above the
//                ground under it (terrain, road or water) and that is not
//                CONNECTED to the ground through a chain of touching prims
//                (AABBs within TOUCH in XZ and GAP vertically). float-audit only
//                flags bases > 1.2 m up with a 6 m support radius, so a lamp
//                head 0.5 m off its yoke or a sign 1.1 m in the air passed.
//   flatCoplanar coplanar-audit's analyse() over HORIZONTAL faces only (--flat):
//                same-facing tops/undersides in one plane. The default coplanar
//                gate skips |n.y| >= 0.5, so this population was unratcheted.
//
// Counts are PRIMITIVES for the two new checks (one detached lamp head is one
// new count) and 40 m SPOTS for flatCoplanar (as coplanar-faces.test.mjs).
//
// Usage:
//   node tools/track/ground-audit.cjs <id>... [--why] [--json]
//   node tools/track/ground-audit.cjs --all [--gate] [--update] [--why] [--json]
//   --gate    exit 1 when any count exceeds tests/data/scenery-audit-baseline.json
//   --update  LOWER the baseline to the measured counts (never raises; a raise is
//             a hand edit with a reason, as for every other ratchet here)
//   --why     second deterministic pass naming each flagged prim's scenery line

"use strict";

const fs = require("fs");
const path = require("path");
const { buildContext, shipped, primKey, ROOT, RAW_FRAME } = require("../lib/track-build-vm.cjs");
const coplanar = require("./coplanar-audit.cjs");

const BASELINE = path.join(ROOT, "tests", "data", "scenery-audit-baseline.json");
const CHECKS = ["buried", "unsupported", "flatCoplanar"];

const BURY_EPS = 0.02;   // top this far under the terrain = buried (m)
const GAP = 0.15;        // bottom this far above ground/any touching prim = unsupported (m)
const TOUCH = 0.05;      // XZ slack for "touching" AABBs (m)
const TOP_BAND = 0.02;   // vertices within this of maxY form the top face (m)
const HASH = 8;          // spatial hash cell (m)
const BIG = 160;         // prims wider than this skip the hash (landforms, skyline)
const PROP_MESHES = ["props", "glass", "gate", "startline"];

const ck = (ix, iz) => ix * 4000003 + iz;

// Ground triangles of the named meshes on an XZ grid: the highest surface at a
// point, the way Tracks.terrainY reads the terrain, extended to road and water.
function surfaceOf(meshes, names) {
  const C = 8, grid = new Map(), T = [];
  for (const nm of names) {
    const m = meshes[nm];
    if (!m || !m.__cap || !m.__cap.idx) continue;
    const pos = m.__cap.pos, idx = m.__cap.idx;
    for (let t = 0; t + 2 < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const base = T.length;
      T.push(pos[a], pos[a + 1], pos[a + 2], pos[b], pos[b + 1], pos[b + 2], pos[c], pos[c + 1], pos[c + 2]);
      const x0 = Math.min(pos[a], pos[b], pos[c]), x1 = Math.max(pos[a], pos[b], pos[c]);
      const z0 = Math.min(pos[a + 2], pos[b + 2], pos[c + 2]), z1 = Math.max(pos[a + 2], pos[b + 2], pos[c + 2]);
      if (x1 - x0 > 400 || z1 - z0 > 400) continue;
      for (let gx = Math.floor(x0 / C); gx <= Math.floor(x1 / C); gx++)
        for (let gz = Math.floor(z0 / C); gz <= Math.floor(z1 / C); gz++) {
          const k = ck(gx, gz);
          let arr = grid.get(k); if (!arr) grid.set(k, (arr = []));
          arr.push(base);
        }
    }
  }
  return (x, z) => {
    const arr = grid.get(ck(Math.floor(x / C), Math.floor(z / C)));
    if (!arr) return null;
    let best = null;
    for (const b of arr) {
      const ax = T[b], az = T[b + 2], bx = T[b + 3], bz = T[b + 5], cx = T[b + 6], cz = T[b + 8];
      const v0x = cx - ax, v0z = cz - az, v1x = bx - ax, v1z = bz - az, v2x = x - ax, v2z = z - az;
      const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z, d11 = v1x * v1x + v1z * v1z;
      const d20 = v2x * v0x + v2z * v0z, d21 = v2x * v1x + v2z * v1z;
      const den = d00 * d11 - d01 * d01; if (Math.abs(den) < 1e-9) continue;
      const u = (d11 * d20 - d01 * d21) / den, v = (d00 * d21 - d01 * d20) / den;
      if (u < -0.01 || v < -0.01 || u + v > 1.01) continue;
      const y = T[b + 1] + u * (T[b + 7] - T[b + 1]) + v * (T[b + 4] - T[b + 1]);
      if (best === null || y > best) best = y;
    }
    return best;
  };
}

// Vertices of p within `band` of its min (bottom) or max (top) Y, plus their
// centroid — the samples a face is judged by.
function faceSamples(p, top) {
  const pos = p.buf.pos._data || p.buf.pos;
  const out = [];
  let sx = 0, sz = 0, sy = 0, n = 0;
  for (let i = p.s; i < p.e; i += 3) {
    const y = pos[i + 1];
    if (top ? y < p.maxY - TOP_BAND : y > p.minY + TOP_BAND) continue;
    out.push(pos[i], y, pos[i + 2]);
    sx += pos[i]; sy += y; sz += pos[i + 2]; n++;
  }
  if (n) out.push(sx / n, sy / n, sz / n);
  return out;
}

function analyse(env, track, prims, opt) {
  const M = track.meshes;
  const propBuf = new Set(PROP_MESHES.filter((k) => M[k] && M[k].__cap).map((k) => M[k].__cap.pos));
  const props = prims.filter((p) => propBuf.has(p.buf.pos));
  const terrainY = (x, z) => env.Tracks.terrainY(track, x, z);
  const other = surfaceOf(M, ["road", "water"]);
  const groundY = (x, z) => {
    const a = terrainY(x, z), b = other(x, z);
    return a === null ? b : b === null ? a : Math.max(a, b);
  };

  // ---- buried ---------------------------------------------------------------
  const buried = [];
  for (const p of props) {
    const s = faceSamples(p, true);
    let minDepth = Infinity, seen = 0;
    for (let i = 0; i < s.length; i += 3) {
      const g = terrainY(s[i], s[i + 2]);
      if (g === null) continue;
      seen++;
      const d = g - s[i + 1];
      if (d < minDepth) minDepth = d;
    }
    if (seen && minDepth > BURY_EPS) buried.push({ p, depth: minDepth });
  }

  // ---- unsupported: BFS from grounded prims over touching AABBs --------------
  const grounded = new Uint8Array(props.length);
  const gapOf = new Float64Array(props.length);
  const hash = new Map(), big = [];
  props.forEach((p, i) => {
    if (p.maxX - p.minX > BIG || p.maxZ - p.minZ > BIG) { big.push(i); return; }
    for (let ix = Math.floor((p.minX - TOUCH) / HASH); ix <= Math.floor((p.maxX + TOUCH) / HASH); ix++)
      for (let iz = Math.floor((p.minZ - TOUCH) / HASH); iz <= Math.floor((p.maxZ + TOUCH) / HASH); iz++) {
        const k = ck(ix, iz);
        let arr = hash.get(k); if (!arr) hash.set(k, (arr = []));
        arr.push(i);
      }
  });
  const queue = [];
  props.forEach((p, i) => {
    const s = faceSamples(p, false);
    let gap = Infinity;
    for (let k = 0; k < s.length; k += 3) {
      const g = groundY(s[k], s[k + 2]);
      if (g !== null && s[k + 1] - g < gap) gap = s[k + 1] - g;
    }
    gapOf[i] = gap;
    // No ground reference at all (off the terrain skirt): not judged.
    if (gap === Infinity || gap <= GAP) { grounded[i] = 1; queue.push(i); }
  });
  const touches = (a, b) =>
    a.minX - TOUCH <= b.maxX && b.minX - TOUCH <= a.maxX &&
    a.minZ - TOUCH <= b.maxZ && b.minZ - TOUCH <= a.maxZ &&
    a.minY - GAP <= b.maxY && b.minY - GAP <= a.maxY;
  const visit = (q, j) => {
    if (grounded[j] || !touches(q, props[j])) return;
    grounded[j] = 1; queue.push(j);
  };
  for (let h = 0; h < queue.length; h++) {
    const q = props[queue[h]];
    if (q.maxX - q.minX > BIG || q.maxZ - q.minZ > BIG) {
      // A landform: test every prim once (rare, a handful per circuit).
      for (let j = 0; j < props.length; j++) visit(q, j);
      continue;
    }
    for (let ix = Math.floor((q.minX - TOUCH) / HASH); ix <= Math.floor((q.maxX + TOUCH) / HASH); ix++)
      for (let iz = Math.floor((q.minZ - TOUCH) / HASH); iz <= Math.floor((q.maxZ + TOUCH) / HASH); iz++) {
        const arr = hash.get(ck(ix, iz));
        if (arr) for (const j of arr) visit(q, j);
      }
    for (const j of big) visit(q, j);
  }
  const unsupported = [];
  props.forEach((p, i) => { if (!grounded[i]) unsupported.push({ p, gap: gapOf[i] }); });

  // ---- flat coplanar ---------------------------------------------------------
  const flat = opt.coplanar === false ? null
    : coplanar.analyse(track, prims, Object.assign({}, coplanar.DEFAULTS, { horizontal: true, flat: true }));

  return {
    props: props.length,
    buried, unsupported, flat,
    counts: { buried: buried.length, unsupported: unsupported.length,
              flatCoplanar: flat ? flat.spots : 0 },
  };
}

function run(env, id, opt, sink) {
  const def = env.Tracks.LIST.find((d) => d.id === id);
  if (!def) throw new Error(`no such track: ${id}`);
  const from = env.mark();
  const track = env.Tracks.build(def, {});
  const prims = shipped(env.prims.slice(from), env.liveBufs);
  if (sink) for (const p of prims) if (p.stack) sink.set(primKey(p), p.stack);
  const r = analyse(env, track, prims, opt || {});
  env.trim(from);
  env.release(track);
  return Object.assign({ id }, r);
}

// The scenery line that asked for a prim: the first non-plumbing frame, with its
// file:line kept (siteOf strips it; the line IS the finding here).
function lineOf(stack) {
  const fr = (stack || "").split("  <-  ")
    .map((f) => {
      const m = /^(\S+)\s+\((.*)\)$/.exec(f);
      const loc = (s) => s.replace(/^.*?\bjs\//, "").replace(/:\d+$/, "");
      // An anonymous frame is a bare location: keep it as the loc.
      return m ? { fn: m[1].replace(/^Object\./, ""), loc: loc(m[2]) } : { fn: "", loc: loc(f) };
    })
    .filter((f) => (f.fn || f.loc) && !RAW_FRAME.test(f.fn) && !/graph\.js|core\/geom\.js/.test(f.loc) &&
                   !/^(instance|replay)$/.test(f.fn));
  // Prefer a circuit's own scenery file; else the innermost builder.
  const own = fr.find((f) => /circuits\//.test(f.loc));
  const f = own || fr[0];
  return f ? (f.fn ? `${f.fn}@${f.loc}` : f.loc) : "?";
}

function readBaseline() {
  return fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")) : {};
}

// Checks each measured count against the baseline. Absent circuit => cap 0.
function overBaseline(results, base) {
  const out = [];
  for (const r of results)
    for (const c of CHECKS) {
      const cap = (base[c] || {})[r.id] || 0;
      if (r.counts[c] > cap) out.push(`${r.id} ${c}: ${r.counts[c]} > baseline ${cap}`);
    }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const why = argv.includes("--why"), asJson = argv.includes("--json");
  const gate = argv.includes("--gate"), update = argv.includes("--update");
  const env = buildContext();
  const ids = argv.includes("--all") ? env.Tracks.LIST.map((d) => d.id)
    : argv.filter((a) => !a.startsWith("--"));
  if (!ids.length) { console.error("usage: ground-audit.cjs <id>... | --all [--gate|--update] [--why] [--json]"); process.exit(2); }

  const results = [];
  const t0 = Date.now();
  for (const id of ids) {
    const r = run(env, id);
    results.push(r);
    if (!asJson) console.log(`${id.padEnd(14)} props ${String(r.props).padStart(6)}  buried ${String(r.counts.buried).padStart(4)}` +
      `  unsupported ${String(r.counts.unsupported).padStart(4)}  flatCoplanar ${String(r.counts.flatCoplanar).padStart(3)} spot(s)`);
  }

  if (why) {
    const want = new Set();
    for (const r of results) {
      for (const b of r.buried) want.add(primKey(b.p));
      for (const u of r.unsupported) want.add(primKey(u.p));
      for (const h of r.flat ? r.flat.hits : []) { want.add(primKey(h.a)); want.add(primKey(h.b)); }
    }
    const env2 = buildContext({ stackFor: want });
    const agg = { buried: new Map(), unsupported: new Map(), flatCoplanar: new Map() };
    const add = (m, key, id, v) => {
      const e = m.get(key) || { n: 0, worst: 0, tracks: new Set() };
      e.n++; e.worst = Math.max(e.worst, v); e.tracks.add(id); m.set(key, e);
    };
    for (const r of results) {
      const at = new Map();
      run(env2, r.id, { coplanar: false }, at);
      for (const b of r.buried) add(agg.buried, lineOf(at.get(primKey(b.p))), r.id, b.depth);
      for (const u of r.unsupported) add(agg.unsupported, lineOf(at.get(primKey(u.p))), r.id, u.gap);
      for (const h of r.flat ? r.flat.hits : []) {
        const a = lineOf(at.get(primKey(h.a))), b = lineOf(at.get(primKey(h.b)));
        add(agg.flatCoplanar, a < b ? `${a}  X  ${b}` : `${b}  X  ${a}`, r.id, h.area);
      }
    }
    const unit = { buried: "m deep", unsupported: "m gap", flatCoplanar: "m2" };
    for (const c of CHECKS) {
      console.log(`\n${c} — by source line (worst = max ${unit[c]}):`);
      for (const [k, e] of [...agg[c]].sort((a, b) => b[1].n - a[1].n).slice(0, 25))
        console.log(`  ${String(e.n).padStart(5)}  worst ${e.worst.toFixed(2).padStart(7)}  ${k}` +
          `\n         on: ${[...e.tracks].sort().slice(0, 8).join(" ")}${e.tracks.size > 8 ? ` +${e.tracks.size - 8} more` : ""}`);
    }
  }

  if (asJson) fs.writeSync(1, JSON.stringify(results.map((r) => ({ id: r.id, props: r.props, counts: r.counts })), null, 1) + "\n");
  else console.log(`\n${results.length} circuit(s) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  if (update) {
    // LOWER only. A circuit not measured this run keeps its cap.
    const base = readBaseline();
    let lowered = 0;
    for (const c of CHECKS) {
      base[c] = base[c] || {};
      for (const r of results) {
        const had = Object.prototype.hasOwnProperty.call(base[c], r.id);
        if (!had && argv.includes("--seed")) { base[c][r.id] = r.counts[c]; continue; }
        if (had && r.counts[c] < base[c][r.id]) { base[c][r.id] = r.counts[c]; lowered++; }
      }
      base[c] = Object.fromEntries(Object.entries(base[c]).filter(([, v]) => v > 0).sort((a, b) => a[0] < b[0] ? -1 : 1));
    }
    fs.writeFileSync(BASELINE, JSON.stringify(base, null, 2) + "\n");
    console.log(`baseline: ${lowered} cap(s) lowered -> ${path.relative(ROOT, BASELINE)}`);
  }
  if (gate) {
    const over = overBaseline(results, readBaseline());
    if (over.length) { console.error("\nscenery audits grew:\n  " + over.join("\n  ")); process.exit(1); }
    console.log(`✓ ${results.length} circuit(s) within ${path.relative(ROOT, BASELINE)}`);
  }
}

if (require.main === module) main();
module.exports = { run, analyse, overBaseline, readBaseline, lineOf, CHECKS, BASELINE,
  BURY_EPS, GAP, TOUCH };
