#!/usr/bin/env node
// @doc Scene-graph migration gate: builds every circuit twice (baseline ref vs tree) and diffs prop geometry vertex for vertex.
// @skill scenery-dress
/* graph-parity.cjs — the gate for the scene-graph migration.
 *
 * Migrating an emitter from "emit primitives inline" to "record a model + place
 * a node" must not change what ships. This builds each track TWICE — once from
 * a baseline git ref, once from the working tree — and compares the prop
 * geometry vertex for vertex. It also reports the graph's model/node accounting,
 * which is the number the migration exists to move.
 *
 * Usage:
 *   node tools/track/graph-parity.cjs <trackId> [...]     # named tracks
 *   node tools/track/graph-parity.cjs --all
 *   BASE=<ref> node tools/track/graph-parity.cjs --all    # baseline ref (default HEAD)
 *
 * Exit 1 on any parity failure. Tolerance is on POSITION only, and tight
 * (1e-6 m): replaying a model through a composed basis reassociates the same
 * floating-point sum, so a leaning pine's cone centre can differ in the last
 * ulp. Counts, indices, normals and colours must match exactly.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const { buildContext } = require("./verify-track.cjs");

const POS_TOL = 1e-6;

function materialiseBaseline(ref) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-graph-parity-"));
  // `git archive` gives a clean tree at `ref` without touching the working copy
  // or the index — safe to run mid-edit, which is exactly when this tool is used.
  const tar = execFileSync("git", ["archive", "--format=tar", ref], {
    cwd: ROOT, maxBuffer: 1 << 30,
  });
  execFileSync("tar", ["-x", "-C", dir], { input: tar, maxBuffer: 1 << 30 });
  return dir;
}

function buildTrack(Tracks, id) {
  const def = Tracks.LIST.find((d) => d.id === id);
  if (!def) throw new Error(`no such track: ${id}`);
  return Tracks.build(def, {});
}

function compareGeo(name, a, b) {
  const problems = [];
  const la = a && a.pos ? a.pos.length : 0;
  const lb = b && b.pos ? b.pos.length : 0;
  if (la !== lb) {
    problems.push(`${name}: vertex count ${lb / 3} vs baseline ${la / 3}`);
    return { problems, maxPos: Infinity };
  }
  let maxPos = 0;
  for (let i = 0; i < la; i++) {
    const d = Math.abs(a.pos[i] - b.pos[i]);
    if (d > maxPos) maxPos = d;
  }
  if (maxPos > POS_TOL) problems.push(`${name}: max |Δpos| ${maxPos.toExponential(2)} m > ${POS_TOL}`);

  for (const field of ["nrm", "col", "mat", "idx"]) {
    const fa = a[field], fb = b[field];
    if (!fa && !fb) continue;
    if (!fa || !fb || fa.length !== fb.length) {
      problems.push(`${name}: ${field} length ${fb ? fb.length : "none"} vs baseline ${fa ? fa.length : "none"}`);
      continue;
    }
    let bad = 0, worst = 0;
    for (let i = 0; i < fa.length; i++) {
      const d = Math.abs(fa[i] - fb[i]);
      // normals/colours are derived from positions, so allow the same ulp drift;
      // indices and material ids are integers and must be exact.
      const tol = field === "idx" || field === "mat" ? 0 : 1e-6;
      if (d > tol) { bad++; if (d > worst) worst = d; }
    }
    if (bad) problems.push(`${name}: ${field} differs at ${bad} slot(s), worst ${worst.toExponential(2)}`);
  }
  return { problems, maxPos };
}

function main() {
  const args = process.argv.slice(2);
  const baseRef = process.env.BASE || "HEAD";
  // The default baseline is HEAD vs the WORKING TREE — meaningful only while
  // there are uncommitted engine/circuit edits. On a clean tree it diffs HEAD
  // against itself and "passes" vacuously, which has been mistaken for a real
  // parity result. Refuse that run instead of blessing it.
  if (!process.env.BASE) {
    const dirty = require("child_process")
      .execSync("git status --porcelain -- js/track js/circuits", { cwd: ROOT })
      .toString().trim();
    if (!dirty) {
      console.error(
        "graph-parity: nothing to compare — the working tree matches HEAD under " +
        "js/track/ and js/circuits/, so the default BASE=HEAD would diff a tree " +
        "against itself and always pass.\n" +
        "Pass the baseline explicitly: BASE=<ref> node tools/track/graph-parity.cjs --all");
      process.exit(2);
    }
  }
  const baseDir = materialiseBaseline(baseRef);

  let baseTracks, headTracks;
  try {
    baseTracks = buildContext(baseDir, { instancing: false });
  } catch (e) {
    console.error(`FAIL: baseline ${baseRef} did not load: ${e.message}`);
    process.exit(1);
  }
  headTracks = buildContext(ROOT, { instancing: false });

  const ids = args.includes("--all") || !args.length
    ? headTracks.LIST.map((d) => d.id)
    : args;

  let failures = 0;
  let totUnique = 0, totFused = 0, totNodes = 0, totModels = 0;
  // Per-emitter roll-up across tracks. Models are per-BUILD, so the same emitter
  // on two circuits mints two model sets — summing them is the honest total
  // (each track uploads its own library).
  const kindTotals = {};
  let totInst = 0, totBake = 0, totBatch = 0, totModelVerts = 0, totInstBytes = 0;

  for (const id of ids) {
    let base, head;
    try {
      base = buildTrack(baseTracks, id);
      head = buildTrack(headTracks, id);
    } catch (e) {
      console.error(`FAIL ${id}: build threw — ${e.message}`);
      failures++;
      continue;
    }

    const problems = [];
    let maxPos = 0;
    for (const buf of ["propsGeo", "glassGeo", "waterGeo", "roadGeo", "terrainGeo"]) {
      const r = compareGeo(buf, base[buf], head[buf]);
      problems.push(...r.problems);
      if (r.maxPos > maxPos) maxPos = r.maxPos;
    }
    // The semantic registry must not drift either — it is what the agent view reads.
    if (base.props && head.props && base.props.count !== head.props.count)
      problems.push(`props.count ${head.props.count} vs baseline ${base.props.count}`);

    const g = head.graph ? head.graph.stats() : null;
    // Exercise the instanced-draw handoff on every real track: it must cover the
    // nodes, and the un-instanceable remainder is the number worth watching.
    if (head.graph) {
      const b = head.graph.batches();
      let inst = 0, mverts = 0, bytes = 0;
      for (const batch of b.batches) {
        inst += batch.count; mverts += batch.verts;
        bytes += batch.matrices.byteLength + (batch.colors ? batch.colors.byteLength : 0);
      }
      totInst += inst; totBake += b.bakeOnly.length; totBatch += b.batches.length;
      totModelVerts += mverts; totInstBytes += bytes;
    }
    if (g) {
      totUnique += g.uniqueVerts; totFused += g.fusedVerts;
      totNodes += g.nodes; totModels += g.models;
      for (const kind in g.byKind) {
        const src = g.byKind[kind];
        const dst = kindTotals[kind] || (kindTotals[kind] = { nodes: 0, models: 0, fusedVerts: 0, uniqueVerts: 0, reuse: 0 });
        dst.nodes += src.nodes; dst.models += src.models;
        dst.fusedVerts += src.fusedVerts; dst.uniqueVerts += src.uniqueVerts;
        dst.reuse = dst.uniqueVerts ? dst.fusedVerts / dst.uniqueVerts : 0;
      }
    }
    const gTxt = g
      ? `graph ${g.nodes} nodes / ${g.models} models, ${g.fusedVerts} fused -> ${g.uniqueVerts} unique verts (reuse ${g.reuse.toFixed(2)}x)`
      : "graph absent";

    if (problems.length) {
      failures++;
      console.error(`FAIL ${id}: ${problems.join("; ")}`);
    } else {
      console.log(`OK   ${id}: parity exact (max |Δpos| ${maxPos.toExponential(1)} m) — ${gTxt}`);
    }
  }

  fs.rmSync(baseDir, { recursive: true, force: true });

  console.log(`\n${ids.length - failures}/${ids.length} tracks at parity with ${baseRef}`);
  if (totModels) {
    console.log(`graph totals: ${totNodes} nodes across ${totModels} models — ` +
      `${totFused} fused verts would be ${totUnique} instanced (reuse ${(totFused / totUnique).toFixed(2)}x)`);
    if (totInst || totBake) {
      const VB = 40;   // interleaved bytes/vertex in the shipped VBO (pos+nrm+col+mat)
      console.log(`instanced handoff: ${totBatch} batches, ${totInst} instances ` +
        `(+${totBake} un-instanceable -> bake), ` +
        `${(totModelVerts * VB / 1048576).toFixed(2)} MB of models + ` +
        `${(totInstBytes / 1048576).toFixed(2)} MB of transforms`);
    }
    const kinds = Object.keys(kindTotals).sort((a, b) => kindTotals[b].fusedVerts - kindTotals[a].fusedVerts);
    if (kinds.length) {
      console.log("\nby emitter (reuse 1.00x = continuous parameters, needs re-parameterising before it instances):");
      for (const kind of kinds) {
        const e = kindTotals[kind];
        console.log(`  ${kind.padEnd(14)} ${String(e.nodes).padStart(6)} nodes  ${String(e.models).padStart(6)} models  ` +
          `${String(e.fusedVerts).padStart(9)} -> ${String(e.uniqueVerts).padStart(9)} verts  reuse ${e.reuse.toFixed(2)}x`);
      }
    }
  }
  process.exit(failures ? 1 : 0);
}

if (require.main === module) main();
module.exports = { compareGeo };
