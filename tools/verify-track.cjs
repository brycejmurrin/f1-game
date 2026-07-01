#!/usr/bin/env node
// verify-track.cjs — headless build check for Apex 26 track definitions.
// Loads js/tracks.js (+ js/circuits.js) in a Node.js VM, stubs GLX so that
// buildRoad / buildTerrain / buildProps / buildGate actually run and their
// vertex counts are captured.  Any THROW during the build is a hard failure —
// the game would strand on the menu with the same error.
//
// Usage:
//   node tools/verify-track.cjs <trackId>     # verify one track
//   node tools/verify-track.cjs --all         # verify every track in js/tracks.js
//
// Success: prints "OK <id>: props N verts (road Y, terrain Z)"
// Failure: prints the error and exits 1.

"use strict";

const fs   = require("fs");
const path = require("path");
const vm   = require("vm");

const ROOT = path.resolve(__dirname, "..");

// --all mode: run verification for every track id found in Tracks.LIST
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

// ---------------------------------------------------------------------------

// Build a fresh VM context with GLX stubbed, load circuits + tracks, return Tracks
function buildContext() {
  const GLX = {
    createMesh: function (buf) {
      const verts    = buf && buf.pos ? buf.pos.length / 3 : 0;
      const idxCount = buf && buf.idx ? buf.idx.length     : 0;
      return { verts, idxCount };
    },
  };

  const sandbox = {
    // Browser globals the scripts reference
    Math, Array, Float32Array, Uint16Array, Uint32Array, Object, JSON,
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
    const src = fs.readFileSync(path.join(ROOT, relPath), "utf8");
    // Replace only `const` at the very start of a line (no indent = top-level).
    const patched = src.replace(/^const\b/gm, "var");
    vm.runInContext(patched, ctx, { filename: relPath });
  }

  runFile("js/circuits.js");  // provides CircuitPaths
  // Each circuit's definition lives in js/tracks/<id>.js and pushes itself onto
  // window.TrackDefs; tracks.js reads that list at load time (DEFS = window.
  // TrackDefs), so these must run BEFORE it — mirroring the <script> order in
  // index.html. Without them Tracks.LIST is empty and every id is "not found".
  for (const f of fs.readdirSync(path.join(ROOT, "js/tracks"))
                    .filter((f) => f.endsWith(".js")).sort()) {
    runFile(path.join("js/tracks", f));
  }
  // The Tracks engine spans four files sharing the TracksKit namespace —
  // load in the same order as index.html (spline -> mesh -> scenery -> registry).
  runFile("js/tracks-spline.js");
  runFile("js/tracks-mesh.js");
  runFile("js/tracks-scenery.js");
  runFile("js/tracks.js");    // provides Tracks (reads TrackDefs, depends on GLX)

  const Tracks = ctx.Tracks;
  if (!Tracks || !Tracks.LIST) {
    throw new Error("js/tracks.js did not define global Tracks.LIST");
  }
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

  const road    = track.meshes.road    ? track.meshes.road.verts    : 0;
  const terrain = track.meshes.terrain ? track.meshes.terrain.verts : 0;
  const props   = track.meshes.props   ? track.meshes.props.verts   : 0;
  const total   = road + terrain + props;

  console.log(`OK ${id}: props ${props} verts (road ${road}, terrain ${terrain}) — ${total} total`);
}
