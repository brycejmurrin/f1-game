#!/usr/bin/env node
// verify-track.cjs — headless build check for Apex 26 track definitions.
// Loads the full TRACK_VM manifest list (the track engine — geom, mesh,
// surface, graph, the scenery-* files — plus every circuit and tracks.js) in a
// Node.js VM, stubs GLX so that
// buildRoad / buildTerrain / buildProps / buildGate actually run and their
// vertex counts are captured.  Any THROW during the build is a hard failure —
// the game would strand on the menu with the same error.
//
// Usage:
//   node tools/verify-track.cjs <trackId>     # verify one track
//   node tools/verify-track.cjs --all         # verify every track in js/track/tracks.js
//
// Success: prints "OK <id>: props N verts (road Y, terrain Z)"
// Failure: prints the error and exits 1.

"use strict";

const fs   = require("fs");
const path = require("path");
const vm   = require("vm");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST = require("./manifest.cjs");

// --all mode: run verification for every track id found in Tracks.LIST
if (require.main === module) main();

function main() {
if (process.argv[2] === "--all") {
  // Extract ids by loading the script once and reading LIST
  let uniqueIds;
  try {
    uniqueIds = loadTrackIds();
  } catch (e) {
    console.error("FAIL: could not load track ids:", e.message);
    process.exit(1);
  }

  let failures = 0;
  for (const id of uniqueIds) {
    try {
      verifyTrack(id);
    } catch (e) {
      failures++;
      console.error(`FAIL ${id}: ${e.message}`);
    }
  }
  if (failures) {
    console.error(`\n${failures} track(s) failed`);
    process.exit(1);
  } else {
    console.log(`\nAll ${uniqueIds.length} tracks OK`);
    process.exit(0);
  }
} else {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: node tools/verify-track.cjs <trackId>  |  --all");
    process.exit(1);
  }
  try {
    verifyTrack(id);
  } catch (e) {
    console.error(`FAIL ${id}: ${e.message}`);
    if (process.env.VERBOSE) console.error(e.stack);
    process.exit(1);
  }
}
}

// ---------------------------------------------------------------------------

// Build a fresh VM context with GLX stubbed, load circuits + tracks, return Tracks
// `rootOverride` loads the same manifest file list from a DIFFERENT checkout —
// tools/graph-parity.cjs points it at a baseline worktree so two builds can be
// compared vertex-for-vertex in one process.
function buildContext(rootOverride, opts) {
  opts = opts || {};
  const useInstancing = opts.instancing !== false;
  // Locals, NOT a reassignment of the module-level consts, and NOT read back off
  // module.exports: this file calls main() at load time when run directly, which
  // is before the export assignment at the bottom has executed.
  const root = rootOverride || ROOT;
  // A baseline checkout carries its OWN load order — reading the working tree's
  // manifest against an older tree asks it for files that do not exist there.
  const manifest = rootOverride
    ? require(path.join(rootOverride, "tools/manifest.cjs"))
    : MANIFEST;
  const GLX = {
    createMesh: function (buf) {
      const verts    = buf && buf.pos ? buf.pos.length / 3 : 0;
      const idxCount = buf && buf.idx ? buf.idx.length     : 0;
      if (!buf || !buf.pos || buf.pos.length % 3) throw new Error("mesh has invalid position layout");
      if (buf.nrm && (buf.nrm.length !== buf.pos.length || buf.nrm.some(v => !Number.isFinite(v))))
        throw new Error("mesh has invalid/non-finite normals");
      if (buf.pos.some(v => !Number.isFinite(v))) throw new Error("mesh has non-finite positions");
      if (buf.idx && buf.idx.some(i => !Number.isInteger(i) || i < 0 || i >= verts))
        throw new Error("mesh has invalid indices");
      return { verts, idxCount };
    },
  };
  if (useInstancing) {
    Object.assign(GLX, {
      createInstancedBatch: function (geo, matrices) {
        const n = matrices && matrices.length ? matrices.length / 16 : 0;
        const verts = geo && geo.pos ? geo.pos.length / 3 : 0;
        return { verts, instances: n, idxCount: 0 };
      },
      freeInstancedBatch: function () {},
    });
  }

  const sandbox = {
    // Browser globals the scripts reference
    Math, Array, Float32Array, Float64Array, Uint16Array, Uint32Array, Object, JSON,
    isNaN, isFinite, parseInt, parseFloat,
    GLX,
    // console silenced — a track's scenery() may log; stub every method it might call.
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {},
               debug: () => {}, trace: () => {}, assert: () => {}, group: () => {},
               groupEnd: () => {}, table: () => {}, dir: () => {}, count: () => {},
               time: () => {}, timeEnd: () => {} },
  };
  // Many IIFEs reference `window.Foo` — make window an alias for the sandbox
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);

  // Run a source file in the context, converting top-level `const` declarations
  // to `var` so they become properties on the sandbox (VM const is block-scoped
  // and NOT visible as ctx.Foo after execution).
  function runFile(relPath) {
    const src = fs.readFileSync(path.join(root, relPath), "utf8");
    // Replace only `const` at the very start of a line (no indent = top-level).
    const patched = src.replace(/^const\b/gm, "var");
    vm.runInContext(patched, ctx, { filename: relPath });
  }

  // The load list lives in tools/manifest.cjs (TRACK_VM) — the same source of
  // truth the load-order test asserts index.html against. "@circuits" expands
  // to every js/circuits/<id>.js: each pushes itself onto window.TrackDefs, and
  // tracks.js reads that list at load time, so they must run BEFORE it.
  for (const entry of manifest.TRACK_VM) {
    if (entry === "@circuits") {
      for (const f of fs.readdirSync(path.join(root, manifest.CIRCUITS_DIR))
                        .filter((f) => f.endsWith(".js")).sort()) {
        runFile(path.join(manifest.CIRCUITS_DIR, f));
      }
      // …and the split-out scenery closures, which the .js filter above skips
      // because they sit in js/circuits/scenery/. Miss them and the circuit
      // still builds — just bare, which is the failure this tool exists to see.
      for (const f of manifest.LAZY_SCENERY) runFile(f);
    } else {
      runFile(entry);
    }
  }

  const Tracks = ctx.Tracks;
  if (!Tracks || !Tracks.LIST) {
    throw new Error("js/track/tracks.js did not define global Tracks.LIST");
  }
  // The whole context, not just Tracks: the built LIST is a field-by-field COPY
  // of the authored defs, so anything checking the copy for completeness needs
  // both sides. Stashed on the returned object rather than changing what
  // buildContext returns, which every existing caller treats as Tracks itself.
  //
  // NOTE for anyone reusing this: the circuits are loaded by readdirSync().sort(),
  // i.e. ALPHABETICALLY, not in the manifest's curated order. Fine for asking
  // "does this field survive the copy" of each def independently; do NOT use it
  // to assert LIST ordering or Tracks.SEASON, which depend on load order.
  try {
    Object.defineProperty(Tracks, "_vmContext", { value: ctx, enumerable: false });
  } catch (_) {}
  return Tracks;
}

function loadTrackIds() {
  const Tracks = buildContext();
  return Tracks.LIST.map(d => d.id);
}

function verifyTrack(id) {
  const Tracks = buildContext();

  const def = Tracks.LIST.find(d => d.id === id);
  if (!def) {
    throw new Error(`track id "${id}" not found — available: ${Tracks.LIST.map(d => d.id).join(", ")}`);
  }

  // Run the full build — exercises buildRoad, buildTerrain, buildProps, buildGate
  // via the GLX stub.  Any throw here means the game strands on the menu.
  const track = Tracks.build(def);
  const diagnostics = track.modelDiagnostics;
  if (diagnostics) {
    const hard = diagnostics.invalid.filter(d => d.required)
      .concat(diagnostics.unsafe.filter(d => d.required))
      .concat(diagnostics.suppressed.filter(d => d.required));
    if (hard.length) throw new Error(`required model diagnostics: ${JSON.stringify(hard)}`);
  }

  // A mesh that fails validateGeometry is not an exception — Tracks.build's
  // safe() logs a console.warn (which this harness swallows) and substitutes an
  // EMPTY buffer, so the build "succeeds" while the circuit ships with nothing
  // in it. Silverstone shipped that way for three days across five commits,
  // reported OK by this very tool, because one NaN vertex from a tree at node
  // -1 poisoned all 783 066 of its prop vertices. Read the diagnostics.
  const geo = track.geometryDiagnostics || [];
  const rejected = geo.filter((g) => !g.ok);
  if (rejected.length)
    throw new Error(`mesh rejected by validateGeometry — SHIPS EMPTY: ` +
      rejected.map((g) => `${g.name} (${g.reason})`).join(", "));

  const road    = track.meshes.road    ? track.meshes.road.verts    : 0;
  const terrain = track.meshes.terrain ? track.meshes.terrain.verts : 0;
  const props   = track.meshes.props   ? track.meshes.props.verts   : 0;
  let inst = 0;
  if (track.meshes.propBatches) {
    for (let i = 0; i < track.meshes.propBatches.length; i++) {
      inst += track.meshes.propBatches[i].instances || 0;
    }
  }
  const total   = road + terrain + props;

  // Belt and braces: every circuit dresses itself, so zero props means the
  // scenery pass produced nothing even if validation passed.
  if (props === 0) throw new Error("props mesh is EMPTY — the circuit has no scenery");

  // Fleet prop-vert budget. iOS starts jetting the page near ~100 MB of
  // interleaved GPU buffer (~44 B/vert at the real interleave, so ~2.2 M
  // verts); the old tripwire capped only Vegas at 1.85 M, and instancing has
  // since taken Vegas to ~370 k while the real hogs went uncapped. Measured
  // 2026-09-01 (props verts, instancing on): mexico 991 k, miami 794 k,
  // jacarepagua 775 k, albert_park 570 k, catalunya 542 k, watkins_glen 496 k;
  // the fleet median is ~340 k. The cap is one number, ~10 % over the largest,
  // so a circuit that balloons toward the jetsam line fails here in 2 s rather
  // than on a phone. Raise it in a commit that says which circuit and why.
  const PROP_VERT_CAP = 1100000;
  if (props > PROP_VERT_CAP) {
    throw new Error(`${id} props ${props} verts exceed the fleet cap ${PROP_VERT_CAP}`);
  }

  console.log(`OK ${id}: props ${props} verts (road ${road}, terrain ${terrain})` +
    (inst ? ` — ${inst} instanced` : "") + ` — ${total} total`);
}

// Reusable VM harness — consumed by tests (scenery-api-contract, foundation).
module.exports = { buildContext, loadTrackIds, verifyTrack };
