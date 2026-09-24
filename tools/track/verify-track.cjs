#!/usr/bin/env node
// verify-track.cjs — headless build check for Apex 26 track definitions.
// @doc Headless build guard: runs `buildRoad/Terrain/Props/Gate` for one circuit (or `--all`) in a VM; any THROW fails.
// @skill agent-view
// Loads the full TRACK_VM manifest list (the track engine — geom, mesh,
// surface, graph, the scenery-* files — plus every circuit and tracks.js) in a
// Node.js VM, stubs GLX so that
// buildRoad / buildTerrain / buildProps / buildGate actually run and their
// vertex counts are captured.  Any THROW during the build is a hard failure —
// the game would strand on the menu with the same error.
//
// Usage:
//   node tools/track/verify-track.cjs <trackId>     # verify one track
//   node tools/track/verify-track.cjs --all         # verify every track in js/track/tracks.js
//   node tools/track/verify-track.cjs <id> --quiet  # OK line only (no diagnostics report)
//
// Success: prints "OK <id>: props N verts (road Y, terrain Z)" and, unless
// --quiet, a diagnostics report: modelDiagnostics counts (suppressed / invalid /
// unsafe), the per-kind guard drops, and every UNIQUE console.warn/error line
// the build logged. The VM used to stub console to silence, so a build that
// warned "suppressed backdrop=295" reported plain OK.
// Failure: prints the error and exits 1. The report never changes the exit code.

"use strict";

const fs   = require("fs");
const path = require("path");
const vm   = require("vm");

const ROOT = path.resolve(__dirname, "../..");
const MANIFEST = require("../manifest.cjs");

// --all mode: run verification for every track id found in Tracks.LIST
if (require.main === module) main();

function main() {
const quiet = process.argv.includes("--quiet");
const args = process.argv.slice(2).filter((a) => a !== "--quiet");
if (args[0] === "--all") {
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
      verifyTrack(id, { quiet });
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
  const id = args[0];
  if (!id) {
    console.error("Usage: node tools/track/verify-track.cjs <trackId>  |  --all   [--quiet]");
    process.exit(1);
  }
  try {
    verifyTrack(id, { quiet });
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
// tools/track/graph-parity.cjs points it at a baseline worktree so two builds can be
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

  // console never prints from the VM — a track's scenery() may log — but
  // warn/error are CAPTURED (opts.quiet: false, the default) so verifyTrack can
  // report them after its OK line. Every other method is a no-op stub.
  const captured = [];
  const keep = opts.quiet ? () => {} : (...a) => { captured.push(a.map(String).join(" ")); };
  const sandbox = {
    // Browser globals the scripts reference
    Math, Array, Float32Array, Float64Array, Uint16Array, Uint32Array, Object, JSON,
    isNaN, isFinite, parseInt, parseFloat,
    GLX,
    console: { log: () => {}, warn: keep, error: keep, info: () => {},
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
    // Absolute filename so V8 coverage attributes the run to the source file.
    vm.runInContext(patched, ctx, { filename: path.join(root, relPath) });
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
    // The console.warn/error lines the VM swallowed, in order (empty under quiet).
    Object.defineProperty(Tracks, "_vmConsole", { value: captured, enumerable: false });
  } catch (_) {}
  return Tracks;
}

function loadTrackIds() {
  const Tracks = buildContext();
  return Tracks.LIST.map(d => d.id);
}

function verifyTrack(id, opts) {
  opts = opts || {};
  const Tracks = buildContext(null, { quiet: !!opts.quiet });

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

  const folds = roadGeoChecks(id, track);

  console.log(`OK ${id}: props ${props} verts (road ${road}, terrain ${terrain})` +
    (inst ? ` — ${inst} instanced` : "") + ` — ${total} total`);
  if (folds) console.log(folds);
  if (!opts.quiet) reportDiagnostics(diagnostics, Tracks._vmConsole || []);
}

// Circuits whose CENTRELINE kinks tighter than the half-width somewhere (turn
// radius R < hw), so a racing-surface rail runs backwards and the tarmac folds
// over itself. That is circuit data, not mesh.js (docs/notes/SCENERY-QA-PLAN.md
// §R3): these WARN; any other circuit that grows a fold FAILS. Remove an id once
// its data is fixed — the check says so.
// Measured 2026-09-24 (19 of 52; SCENERY-QA-PLAN named only the first four);
// 16 fixed the same day by moving path.pts points (start + every turns apex
// held within 2 m, lap within 0.1 %). bahrain's fix (points 2-4 by the pit
// exit) moved the pit-exit merge cue (tests/unit/pit-lane-vm.test.mjs) and was
// reverted. buddh and korea need more than a point
// move: a hairpin of 5-10 m point spacing at the end of a 0.7-1.2 km
// one-segment straight, where the Catmull-Rom tangent overshoots, and every fix
// found shifts a turns apex or the start line past 2 m. fuji's fold moves
// cleanly, but every variant tried re-rolled its scenery into 2-6 floating
// tree canopies (float-audit, baseline 0), so it waits on that.
function knownTarmacFolds() {   // a function, not a const: main() runs above this line
  return new Set(["bahrain", "buddh", "fuji", "korea"]);
}

// Road-ribbon geometry checks on track.roadGeo (the 14-column main ribbon, then
// skirts, kerbs and pit hatch). Throws on a hard failure; returns a warning
// string (or "") for the known tarmac-fold circuits.
//  1. DUPLICATE TRIANGLES past the main ribbon (same rounded vertices, same
//     winding — the skirts' back faces are the opposite winding): every local curvature peak used
//     to lay its own kerb ribbon, stacking up to 9 bit-identical copies (55 % of
//     all kerb triangles). buildKerbs now lays each covered quad once.
//  2. TARMAC FOLDS: a rail in columns 2..11 whose step P(k+1)-P(k) has a
//     non-positive component along the tangent t_k runs backwards.
function roadGeoChecks(id, track) {
  const KNOWN_TARMAC_FOLDS = knownTarmacFolds();
  const g = track.roadGeo;
  if (!g || !g.pos || !g.idx) return "";
  const P = g.pos._data || g.pos, I = g.idx._data || g.idx, n = track.n, V = 14;
  const key = (v) => Math.round(P[v * 3] * 200) + "," + Math.round(P[v * 3 + 1] * 200) + "," + Math.round(P[v * 3 + 2] * 200);
  const seen = new Set();
  let dups = 0, firstDup = -1;
  for (let ti = n * (V - 1) * 2; ti < I.length / 3; ti++) {
    const a = key(I[ti * 3]), b = key(I[ti * 3 + 1]), c = key(I[ti * 3 + 2]);
    if (a === b || b === c || a === c) continue;                  // zero-area: harmless
    // cyclic order kept: the skirts are deliberately two-sided (a,b,c + a,c,b)
    const ks = a < b && a < c ? a + "|" + b + "|" + c : b < c ? b + "|" + c + "|" + a : c + "|" + a + "|" + b;
    if (seen.has(ks)) { if (!dups++) firstDup = ti; } else seen.add(ks);
  }
  if (dups) throw new Error(`roadGeo has ${dups} duplicate kerb/skirt/hatch triangles (first at tri ${firstDup}) — ` +
    "a kerb quad laid twice (see buildKerbs in js/track/core/mesh.js)");

  const { px, pz, tx, tz } = track;
  const runs = [];
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    let bad = false;
    for (let v = 2; v <= 11 && !bad; v++) {
      const i0 = (k * V + v) * 3, i1 = (k1 * V + v) * 3;
      if ((P[i1] - P[i0]) * tx[k] + (P[i1 + 2] - P[i0 + 2]) * tz[k] <= 0) bad = true;
    }
    if (!bad) continue;
    const last = runs[runs.length - 1];
    if (last && last.k1 === k - 1) { last.k1 = k; continue; }
    runs.push({ k0: k, k1: k });
  }
  if (!runs.length) {
    return KNOWN_TARMAC_FOLDS.has(id) ? `  note: ${id} has no tarmac fold any more — drop it from KNOWN_TARMAC_FOLDS` : "";
  }
  const turnDeg = (k) => {   // heading change across node k, from the centreline chords either side
    const a = (k - 1 + n) % n, b = (k + 1) % n;
    const h0 = Math.atan2(pz[k] - pz[a], px[k] - px[a]), h1 = Math.atan2(pz[b] - pz[k], px[b] - px[k]);
    let d = Math.abs(h1 - h0); if (d > Math.PI) d = 2 * Math.PI - d;
    return d * 180 / Math.PI;
  };
  const desc = runs.map((r) => {
    let worst = r.k0;
    for (let k = r.k0; k <= r.k1 + 1; k++) if (turnDeg(k % n) > turnDeg(worst % n)) worst = k % n;
    return `frac ${(r.k0 / n).toFixed(3)} (nodes ${r.k0}-${r.k1 + 1}, turn ${turnDeg(worst).toFixed(0)} deg at node ${worst})`;
  }).join("; ");
  const msg = `tarmac fold (centreline kink R < hw, rail in columns 2..11 runs backwards): ${desc}`;
  if (!KNOWN_TARMAC_FOLDS.has(id)) throw new Error(`${msg} — fix the circuit data (SCENERY-QA-PLAN §R3)`);
  return `  WARNING known ${msg}`;
}

// The report behind the OK line. Informational only: a required-model failure
// already threw above, and everything here is what the build logged and moved
// on from — the guard drops are the number that says a circuit is asking for
// props the engine refuses every build (redbull once asked for 295 backdrops it
// never got, invisible under the old console stub).
function reportDiagnostics(diagnostics, consoleLines) {
  if (diagnostics) {
    const d = diagnostics;
    console.log(`  diagnostics: suppressed ${d.suppressed.length}, invalid ${d.invalid.length}, unsafe ${d.unsafe.length}`);
    const drops = d.suppressedCounts || {};
    const kinds = Object.keys(drops).sort();
    if (kinds.length)
      console.log(`  guard drops: ${kinds.map((k) => `${k}=${drops[k]}`).join(" ")}`);
  }
  const uniq = [...new Set(consoleLines)];
  if (uniq.length) {
    console.log(`  warnings (${consoleLines.length}, ${uniq.length} unique):`);
    for (const line of uniq) console.log(`    ${line}`);
  }
}

// Reusable VM harness — consumed by tests (scenery-api-contract, foundation).
module.exports = { buildContext, loadTrackIds, verifyTrack };
