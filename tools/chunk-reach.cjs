#!/usr/bin/env node
/*
 * @doc How much chunked scenery a pass reaches, counted headlessly: re-bins triangles into 72 m cells like `createChunkedMesh`.
 * @skill perf-profile
 * chunk-reach — how much chunked scenery a pass actually reaches, counted
 * headlessly, with no GPU and no timing.
 *
 * WHY THIS EXISTS. docs/PERF-FINDINGS.md §0 records that on this box every
 * frame-timing instrument lies (SwiftShader software rasterisation, gpuTimer()
 * returns -1), and §"COUNT THE WORK AVOIDED, DO NOT TIME IT" records the way
 * out: counts transfer between machines, milliseconds do not. But the env-probe
 * finding still sat in "left on the table" for weeks behind the note "profile
 * before touching, and note that this box cannot do it" — a dead end dressed as
 * a next step, because nobody had noticed the question did not need a profiler.
 *
 * The question — "how much geometry does a pass with far plane R rasterise?" —
 * is answerable from the BUILD alone. js/render/glx/chunked.js bins scenery
 * triangles into 72 m XZ cells by centroid and culls whole cells against a
 * frustum; that binning is deterministic, depends on nothing but the built
 * geometry, and is ~20 lines to replicate. So: build the track in the Node VM
 * harness, re-bin exactly as the renderer does, and count what survives.
 *
 * THE TRICK THAT MAKES IT ORIENTATION-FREE. A cube-map probe renders six 90 deg
 * faces, so over a full cube it looks in EVERY direction — its coverage is
 * exactly a SPHERE of the far radius. That removes the camera orientation from
 * the problem entirely and makes the count a function of radius alone, which is
 * why this needs no view matrix, no frustum planes, and no assumptions about
 * where the driver is looking. For a single-direction pass you would need the
 * real frustum (see chunked.js `_aabbInFrustum`); for the probe you do not.
 *
 * WHAT IT MEASURED (2026-08-14, and the reason the env-probe entry is no longer
 * an estimate): the probe's shipped 900 m far plane reaches 238.3 chunks /
 * 1.26 M indices per cube on vegas, 373.6 / 345 k on spa, 195.1 / 517 k on
 * monza. At 300 m that is 68-72% fewer indices and 78-83% fewer chunks, and the
 * three circuits agree closely despite completely different scenery — spa is
 * 1594 small tree chunks over 207 k tris, vegas 914 large building chunks over
 * 885 k. The agreement is the useful part: it is a property of the radius, not
 * of a circuit, so it should transfer to real hardware.
 *
 *   node tools/chunk-reach.cjs               # default: vegas
 *   node tools/chunk-reach.cjs spa
 *   node tools/chunk-reach.cjs monza 900,600,300,150
 *
 * WHAT IT DOES NOT TELL YOU. Only the geometry a pass SUBMITS. It says nothing
 * about fill cost, shader cost, or whether the result is visible — a chunk that
 * survives at 900 m may still be sub-pixel (for the 64 px probe it is: a 20 m
 * building subtends 0.9 px at 900 m). Deciding a radius needs that angular
 * argument as well as this count; the count only tells you what the change is
 * worth if you make it.
 */
"use strict";

const { buildContext } = require("./track-build-vm.cjs");

const CELL = 72;   // must track createChunkedMesh's default cellSize

// Bin triangles by centroid cell — byte-for-byte the rule in
// js/render/glx/chunked.js createChunkedMesh. If that changes, change this.
function binChunks(geo, cell) {
  const pos = geo.pos, idx = geo.idx, m = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const cx = (pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3;
    const cz = (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3;
    const key = (Math.floor(cx / cell) + 1024) * 4096 + (Math.floor(cz / cell) + 1024);
    let bk = m.get(key);
    if (!bk) m.set(key, bk = { mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9], n: 0 });
    for (const v of [a, b, c]) {
      for (let j = 0; j < 3; j++) {
        const p = pos[v * 3 + j];
        if (p < bk.mn[j]) bk.mn[j] = p;
        if (p > bk.mx[j]) bk.mx[j] = p;
      }
    }
    bk.n += 3;
  }
  return [...m.values()];
}

// Squared distance from a point to the nearest point on an AABB — the same
// test chunked.js `_aabbDist2` applies for frame.cullDist.
function aabbDist2(mn, mx, ex, ey, ez) {
  const dx = ex < mn[0] ? mn[0] - ex : ex > mx[0] ? ex - mx[0] : 0;
  const dy = ey < mn[1] ? mn[1] - ey : ey > mx[1] ? ey - mx[1] : 0;
  const dz = ez < mn[2] ? mn[2] - ez : ez > mx[2] ? ez - mx[2] : 0;
  return dx * dx + dy * dy + dz * dz;
}

function reach(id, radii, stations) {
  const { Tracks } = buildContext();
  const def = Tracks.LIST.find((d) => d.id === id);
  if (!def) throw new Error(`no such circuit: ${id}`);
  const T = Tracks.build(def);
  const geo = T.meshes.props && T.meshes.props.__cap;
  if (!geo || !geo.idx) throw new Error(`${id} built no chunked props geometry`);

  const chunks = binChunks(geo, CELL);
  const n = T.px.length;
  const step = Math.max(1, Math.floor(n / stations));

  const rows = [];
  for (const R of radii) {
    let chunkSum = 0, idxSum = 0, samples = 0;
    for (let i = 0; i < n; i += step) {
      // Eye at the driver's head height above the centreline — the probe is
      // anchored to the player (js/game.js env-probe block).
      const ex = T.px[i], ey = (T.py ? T.py[i] : 0) + 0.9, ez = T.pz[i];
      let c = 0, v = 0;
      for (const ch of chunks) {
        if (aabbDist2(ch.mn, ch.mx, ex, ey, ez) <= R * R) { c++; v += ch.n; }
      }
      chunkSum += c; idxSum += v; samples++;
    }
    rows.push({ R, chunks: chunkSum / samples, indices: Math.round(idxSum / samples) });
  }
  return { id, totalChunks: chunks.length, tris: (geo.idx.length / 3) | 0, rows, stations: Math.ceil(n / step) };
}

if (require.main === module) {
  const id = process.argv[2] || "vegas";
  const radii = (process.argv[3] || "900,400,300,200,150").split(",").map(Number);
  const r = reach(id, radii, 12);
  console.log(`${r.id} — ${r.totalChunks} chunks, ${r.tris} tris, ${r.stations} stations`);
  console.log("  far(m)   chunks/cube   indices/cube    vs 900m");
  const base = r.rows[0];
  for (const row of r.rows) {
    const pct = base ? ((1 - row.indices / base.indices) * 100).toFixed(0) + "%" : "";
    console.log(String(row.R).padStart(8), row.chunks.toFixed(1).padStart(13),
                String(row.indices).padStart(14), pct.padStart(10));
  }
}

module.exports = { reach, binChunks, aabbDist2, CELL };
