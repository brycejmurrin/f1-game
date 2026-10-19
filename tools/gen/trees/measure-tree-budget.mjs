#!/usr/bin/env node
/**
 * measure-tree-budget.mjs — per-circuit procedural tree counts + tris/instance.
 * @doc Read-only: builds via track-build-vm, compacts with TrackHiddenFaces like
 *   tools/track/props-tris.cjs, reports pine/tree/palm counts and post-strip
 *   tris per graph instance (single-mesh compact). Palm tris are the nature.js
 *   part recipe counted through TrackGeom (palms are not graph-instanced).
 * @skill scenery-dress
 *
 *   node tools/gen/trees/measure-tree-budget.mjs [--json] [--circuits spa,suzuka]
 */
"use strict";

const path = require("path");
const { buildContext } = require("../../lib/track-build-vm.cjs");

const TREE_KINDS = new Set(["pine", "tree", "palm", "conifer"]);

function copyGeo(g) {
  const c = {};
  for (const k of ["pos", "nrm", "col", "mat", "uv", "trk", "idx"]) {
    if (g[k]) c[k] = g[k].slice ? g[k].slice() : Array.from(g[k]);
  }
  return c;
}

/** Palm part recipe from nature.js palm() — counted via TrackGeom. */
function palmRecipeTris(TG) {
  const MAT = TG.MAT;
  const out = { pos: [], nrm: [], col: [], mat: [], idx: [], _mat: 0, _matAt: null };
  const b = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  out._mat = MAT.WOOD;
  for (let t = 0; t < 3; t++) TG.addCyl(out, [0, t * 2, 0], 0.3, 2, [0.4, 0.3, 0.2], 6, b);
  out._mat = MAT.FOLIAGE;
  TG.addBox(out, [0, 7, 0], [1.7, 1.2, 1.7], [0.15, 0.35, 0.14], b);
  for (let i = 0; i < 9; i++) TG.addPrism(out, [i * 0.1, 7.2, 0], [1.9, 0.5, 5.5], [0.2, 0.45, 0.18], b);
  for (let i = 0; i < 3; i++) TG.addBox(out, [0.2 * i, 7, 0.2], [0.34, 0.34, 0.34], [0.3, 0.2, 0.1], b);
  return out.idx.length / 3;
}

function measureCircuit(env, id) {
  const def = env.Tracks.LIST.find((d) => d.id === id);
  if (!def) throw new Error(`unknown circuit ${id}`);
  const from = env.mark();
  const track = env.Tracks.build(def, { night: false });
  const THF = env.sandbox.TrackHiddenFaces;

  const propCounts = {};
  for (const p of (track.props && track.props.list) || []) {
    if (!TREE_KINDS.has(p.kind)) continue;
    propCounts[p.kind] = (propCounts[p.kind] || 0) + 1;
  }

  const byKind = {};
  if (track.graph) {
    for (const [key, m] of track.graph.models) {
      let kind = null;
      for (const n of track.graph.nodes) {
        if (n.model === key) { kind = n.meta && n.meta.kind; break; }
      }
      if (!TREE_KINDS.has(kind)) continue;
      const before = copyGeo(m.geo);
      const after = copyGeo(m.geo);
      THF.compact(after);
      const trisBefore = before.idx.length / 3;
      const trisAfter = after.idx.length / 3;
      let e = byKind[kind];
      if (!e) e = byKind[kind] = { count: 0, trisBeforeWeighted: 0, trisAfterWeighted: 0, models: {} };
      e.count += m.uses;
      e.trisBeforeWeighted += trisBefore * m.uses;
      e.trisAfterWeighted += trisAfter * m.uses;
      e.models[key] = { uses: m.uses, trisBefore, trisAfter };
    }
    for (const k of Object.keys(byKind)) {
      const e = byKind[k];
      e.meanTrisBefore = e.trisBeforeWeighted / e.count;
      e.meanTrisAfter = e.trisAfterWeighted / e.count;
    }
  }

  const geo = track.propsGeo;
  const after = copyGeo(geo);
  THF.compact(after);
  let foliageTris = 0;
  for (let t = 0; t < after.idx.length; t += 3) {
    if (Math.round(after.mat[after.idx[t]]) === 6) foliageTris++;
  }

  env.trim(from);
  env.release(track);
  return {
    id,
    propCounts,
    byKind,
    propsTrisAfter: after.idx.length / 3,
    foliageTris,
  };
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const circArg = args.find((a) => a.startsWith("--circuits="));
  const env = buildContext();
  const ids = circArg
    ? circArg.slice("--circuits=".length).split(",").filter(Boolean)
    : env.Tracks.LIST.map((d) => d.id);

  const palmTris = palmRecipeTris(env.sandbox.TrackGeom);
  const rows = ids.map((id) => measureCircuit(env, id));

  const species = {};
  for (const r of rows) {
    for (const [kind, e] of Object.entries(r.byKind || {})) {
      let s = species[kind];
      if (!s) s = species[kind] = { totalCount: 0, trisAfterSum: 0, minTrisAfter: Infinity, maxTrisAfter: 0 };
      s.totalCount += e.count;
      s.trisAfterSum += e.trisAfterWeighted;
      for (const mv of Object.values(e.models)) {
        s.minTrisAfter = Math.min(s.minTrisAfter, mv.trisAfter);
        s.maxTrisAfter = Math.max(s.maxTrisAfter, mv.trisAfter);
      }
    }
  }
  for (const k of Object.keys(species)) {
    species[k].meanTrisAfter = species[k].trisAfterSum / species[k].totalCount;
  }
  species.palm = {
    totalCount: rows.reduce((n, r) => n + (r.propCounts.palm || 0), 0),
    meanTrisAfter: palmTris,
    minTrisAfter: palmTris,
    maxTrisAfter: palmTris,
    source: "nature.js palm() recipe via TrackGeom (not graph-instanced)",
  };

  const out = { tip: null, palmRecipeTris: palmTris, circuits: rows, species };
  try {
    const { execSync } = require("child_process");
    out.tip = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch (_) { /* ignore */ }

  if (json) {
    process.stdout.write(JSON.stringify(out, null, 2));
    return;
  }

  console.log(`# tree budget  tip=${out.tip || "?"}  palmRecipeTris=${palmTris}`);
  console.log("circuit".padEnd(16), "pine".padStart(6), "tree".padStart(6), "palm".padStart(6),
    "pineμΔ".padStart(8), "treeμΔ".padStart(8), "propsTris".padStart(10), "foliageT".padStart(9));
  for (const r of rows) {
    const pc = r.propCounts;
    const pineM = r.byKind.pine ? r.byKind.pine.meanTrisAfter.toFixed(1) : "-";
    const treeM = r.byKind.tree ? r.byKind.tree.meanTrisAfter.toFixed(1) : "-";
    console.log(
      r.id.padEnd(16),
      String(pc.pine || 0).padStart(6),
      String(pc.tree || 0).padStart(6),
      String(pc.palm || 0).padStart(6),
      String(pineM).padStart(8),
      String(treeM).padStart(8),
      String(r.propsTrisAfter).padStart(10),
      String(r.foliageTris).padStart(9),
    );
  }
  console.log("\n# species (graph instances; palm = recipe)");
  for (const [k, s] of Object.entries(species)) {
    console.log(`${k}: count=${s.totalCount} meanTris=${s.meanTrisAfter.toFixed(2)} ` +
      `min=${s.minTrisAfter} max=${s.maxTrisAfter}` +
      (s.source ? `  (${s.source})` : ""));
  }
}

if (require.main === module) main();
module.exports = { measureCircuit, palmRecipeTris, TREE_KINDS };
