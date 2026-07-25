// manifest.cjs — the single source of truth for script load order.
//
// index.html cannot be generated (no build step), so it is hand-edited and
// ASSERTED against this file by tests/load-order.test.mjs. Node VM loaders
// (verify-track.cjs, the track-foundation tests) iterate the subsets below
// instead of keeping their own copies, so adding/moving a file is a one-line
// edit here plus the matching <script> tag.
//
// Rules encoded here:
//  - FULL is every js/ file in the exact index.html <script> order.
//  - The 24 circuit tags ("@circuits") stay in their curated order — that
//    order IS Tracks.LIST, which is the track-picker and season-calendar
//    order. Do not sort or reorder them.
//  - A future generated js/circuit-elevations.js (tools/bake-elevation.mjs)
//    must slot immediately BEFORE js/tracks.js.
//  - HARD_EDGES are eval-time dependencies (destructure/call at IIFE
//    evaluation). Violating one is a ReferenceError at load, not a subtle bug.

"use strict";

// Curated circuit order (== Tracks.LIST == picker + season calendar order).
const CIRCUITS = [
  "bahrain", "monaco", "silverstone", "spa", "monza", "suzuka", "singapore",
  "cota", "interlagos", "vegas", "madrid", "zandvoort", "jeddah",
  "albert_park", "shanghai", "miami", "imola", "montreal", "redbull",
  "hungaroring", "baku", "mexico", "qatar", "abudhabi",
];

const CIRCUITS_DIR = "js/tracks";
const circuitFiles = CIRCUITS.map((id) => `${CIRCUITS_DIR}/${id}.js`);

// Every js file, in exact index.html <script> tag order.
const FULL = [
  "js/mat4.js",
  "js/shaders/glx-shaders.js",
  "js/glx.js",
  "js/webgpu/wgsl-chunks.js",
  "js/webgpu/wgsl-post.js",
  "js/webgpu/wgsl-fx.js",
  "js/webgpu/wgx.js",
  "js/gfx.js",
  "js/gltf.js",
  "js/teams.js",
  "js/circuits.js",
  "js/track-geom.js",
  "js/track-scenery-data.js",
  "js/circuit-markings.js",
  "js/track-space.js",
  "js/track-surface.js",
  "js/track-models.js",
  "js/scenery-themes.js",
  "js/landmark-kit.js",
  "js/circuit-kit.js",
  ...circuitFiles,
  "js/tracks.js",
  "js/trackmaps.js",
  "js/car3d.js",
  "js/input.js",
  "js/audio.js",
  "js/api.js",
  "js/data-telemetry.js",
  "js/data-export.js",
  "js/data-schedule.js",
  "js/data-standings.js",
  "js/data-lastrace.js",
  "js/data-live.js",
  "js/data.js",
  "js/parts.js",
  "js/liveries.js",
  "js/liverytex.js",
  "js/ghost.js",
  "js/light-presets.js",
  "js/game/tables.js",
  "js/game/lighting.js",
  "js/game/carmesh.js",
  "js/game/particles.js",
  "js/game.js",
];

// Stylesheet <link> order in index.html.
const CSS = ["css/style.css", "css/data.css"];

// tools/carview.html <script> subset, in order (paths repo-relative; the file
// itself uses ../js/... since it is served from /tools/).
const CARVIEW = [
  "js/mat4.js",
  "js/shaders/glx-shaders.js",
  "js/glx.js",
  "js/teams.js",
  "js/parts.js",
  "js/car3d.js",
  "js/liveries.js",
  "js/liverytex.js",
  "js/game/carmesh.js",
];

// verify-track.cjs / track-foundation Node-VM subset, in order.
// "@circuits" expands to every file in CIRCUITS_DIR (readdir, sorted — VM
// verification is per-id, so LIST order does not matter there).
const TRACK_VM = [
  "js/circuits.js",
  "js/track-geom.js",
  "js/track-scenery-data.js",
  "js/circuit-markings.js",
  "js/track-space.js",
  "js/track-surface.js",
  "js/track-models.js",
  "js/scenery-themes.js",
  "js/landmark-kit.js",
  "js/circuit-kit.js",
  "@circuits",
  "js/tracks.js",
];

// Eval-time dependencies: [before, after]. Each pair must be ordered in FULL.
const HARD_EDGES = [
  ["js/mat4.js", "js/glx.js"],                          // glx uses M4 at init
  ["js/shaders/glx-shaders.js", "js/glx.js"],           // glx destructures GLXShaders at eval
  ["js/webgpu/wgsl-chunks.js", "js/webgpu/wgsl-post.js"], // string concat at eval
  ["js/webgpu/wgsl-chunks.js", "js/webgpu/wgsl-fx.js"],
  ["js/webgpu/wgsl-post.js", "js/webgpu/wgx.js"],
  ["js/webgpu/wgsl-fx.js", "js/webgpu/wgx.js"],
  ["js/webgpu/wgx.js", "js/gfx.js"],
  ["js/track-geom.js", "js/tracks.js"],                 // tracks destructures TrackGeom at eval
  ["js/circuits.js", "js/tracks.js"],                   // CircuitPaths read by LIST build
  ["js/track-space.js", "js/track-surface.js"],
  ["js/track-models.js", "js/circuit-kit.js"],
  ["js/tracks.js", "js/trackmaps.js"],                  // trackmaps calls Tracks.buildCenterline
  ["js/api.js", "js/data.js"],
  ["js/data-telemetry.js", "js/data.js"],               // data.js calls Data*.create at eval
  ["js/data-export.js", "js/data.js"],
  ["js/data-schedule.js", "js/data.js"],
  ["js/data-standings.js", "js/data.js"],
  ["js/data-lastrace.js", "js/data.js"],
  ["js/data-live.js", "js/data.js"],
];

// Named paths for direct single-file consumers (tests/tools that load one
// source file by path). When a file moves, update it here and every consumer
// follows automatically.
const PATHS = {
  GLX_SHADERS: "js/shaders/glx-shaders.js",
  WGSL_CHUNKS: "js/webgpu/wgsl-chunks.js",
  WGSL_POST: "js/webgpu/wgsl-post.js",
  WGX: "js/webgpu/wgx.js",
  GLTF: "js/gltf.js",
  TRACK_SPACE: "js/track-space.js",
  TRACK_SURFACE: "js/track-surface.js",
  TRACK_MODELS: "js/track-models.js",
  SCENERY_THEMES: "js/scenery-themes.js",
  LANDMARK_KIT: "js/landmark-kit.js",
  CIRCUIT_KIT: "js/circuit-kit.js",
};

const circuitPath = (id) => `${CIRCUITS_DIR}/${id}.js`;

module.exports = {
  CIRCUITS, CIRCUITS_DIR, FULL, CSS, CARVIEW, TRACK_VM, HARD_EDGES,
  PATHS, circuitPath,
};
