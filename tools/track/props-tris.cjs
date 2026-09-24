#!/usr/bin/env node
// props-tris.cjs — per-circuit props triangle / vertex counts after the
// hidden-face strip and the vertex compaction, with an identity check.
// @doc Per-circuit props triangles after hidden-face strip + vertex compaction; proves compaction render-identical.
// @skill scenery-dress
//
//   node tools/track/props-tris.cjs <id>|--all [--json]
//
// Builds through tools/lib/track-build-vm.cjs UNCOMPACTED (the harness default,
// so the audits keep their raw [s,e) ranges), then runs the engine's own
// TrackHiddenFaces.compact on a COPY of the props buffer — the exact call
// js/track/tracks.js makes in a browser build — and compares triangle by
// triangle: the k-th corner of triangle t must read the same position, normal,
// colour and material before and after. Ordered equality, so the multiset of
// triangle vertex positions is identical a fortiori.
//
// GPU bytes: the chunked VBO is packed at 28 B a vertex for props
// (js/render/shared/vertex-pack.js; no track coords), and the index buffer is
// unchanged in length.
"use strict";

const { buildContext } = require("../lib/track-build-vm.cjs");

const VBO_BYTES_PER_VERT = 28;
const COLS = [["pos", 3], ["nrm", 3], ["col", 3], ["mat", 1]];

function copyGeo(g) {
  const c = {};
  for (const k of ["pos", "nrm", "col", "mat", "uv", "trk", "idx"])
    if (g[k]) c[k] = g[k].slice ? g[k].slice() : Array.from(g[k]);
  return c;
}

// First mismatch as a string, or null when every kept triangle is identical.
function identity(before, after) {
  const bi = before.idx, ai = after.idx;
  if (bi.length !== ai.length) return `index count ${bi.length} -> ${ai.length}`;
  for (const [k, n] of COLS) {
    const b = before[k], a = after[k];
    if (!b) continue;
    if (!a) return `${k} column dropped`;
    for (let i = 0; i < bi.length; i++) {
      const ob = bi[i] * n, oa = ai[i] * n;
      for (let j = 0; j < n; j++) {
        if (b[ob + j] !== a[oa + j]) return `${k} differs at corner ${i} (tri ${(i / 3) | 0})`;
      }
    }
  }
  return null;
}

function measureAll(ids) {
  const env = buildContext();
  const THF = env.sandbox.TrackHiddenFaces;
  const out = [];
  for (const id of ids) {
    const def = env.Tracks.LIST.find((d) => d.id === id);
    if (!def) throw new Error(`unknown circuit ${id}`);
    const from = env.mark();
    const track = env.Tracks.build(def, { night: false });
    const geo = track.propsGeo;
    const before = copyGeo(geo);
    const after = copyGeo(geo);
    const c = THF.compact(after);
    const bad = identity(before, after);
    out.push({
      id,
      trisBefore: geo._hidden ? geo._hidden.trisBefore : before.idx.length / 3,
      tris: before.idx.length / 3,
      vertsBefore: c.vertsBefore,
      vertsAfter: c.vertsAfter,
      vboBytesSaved: (c.vertsBefore - c.vertsAfter) * VBO_BYTES_PER_VERT,
      identical: bad === null,
      mismatch: bad,
    });
    env.trim(from);
    env.release(track);
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const pos = args.filter((a) => !a.startsWith("--"));
  const env = args.includes("--all") ? null : pos;
  const ids = env || buildContext().Tracks.LIST.map((d) => d.id);
  if (!ids.length) { console.error("usage: props-tris.cjs <id>|--all [--json]"); process.exit(2); }
  const rows = measureAll(ids);
  if (json) { process.stdout.write(JSON.stringify(rows)); return; }
  let vb = 0, va = 0;
  for (const r of rows) {
    vb += r.vertsBefore; va += r.vertsAfter;
    console.log(`${r.id.padEnd(16)} tris ${String(r.tris).padStart(8)} (pre-strip ${r.trisBefore})  ` +
      `verts ${r.vertsBefore} -> ${r.vertsAfter} (-${(100 * (1 - r.vertsAfter / r.vertsBefore)).toFixed(1)} %)  ` +
      `VBO -${(r.vboBytesSaved / 1048576).toFixed(2)} MB  ${r.identical ? "identical" : "MISMATCH " + r.mismatch}`);
  }
  if (rows.length > 1) {
    console.log(`fleet ${rows.length}: verts ${vb} -> ${va}, mean ${Math.round(vb / rows.length)} -> ` +
      `${Math.round(va / rows.length)}, VBO -${((vb - va) * VBO_BYTES_PER_VERT / 1048576).toFixed(1)} MB total`);
  }
  if (rows.some((r) => !r.identical)) process.exit(1);
}

if (require.main === module) main();
module.exports = { measureAll, identity, VBO_BYTES_PER_VERT };
