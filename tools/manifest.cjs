// manifest.cjs — the single source of truth for script load order.
//
// index.html cannot be generated (no build step), so it is hand-edited and
// ASSERTED against this file by tests/load-order.test.mjs. Node VM loaders
// (verify-track.cjs, the track-foundation tests) iterate the subsets below
// instead of keeping their own copies, so adding/moving a file is a one-line
// edit here plus the matching <script> tag.
//
// Directory map (post-reorg):
//   js/render/    renderer: gfx façade, GLX (WebGL2), shaders, WebGPU backend
//   js/track/     track ENGINE + infra (geometry, surface, scenery kits)
//   js/circuits/  the 24 circuit DEFINITIONS (data; one file per circuit)
//   js/car/       car model, liveries, parts, ghost, teams
//   js/data/      data hub (api client + tab modules + shell)
//   js/game/      game-support modules extracted from / loaded before game.js
//
// Rules encoded here:
//  - FULL is every js/ file in the exact index.html <script> order.
//  - The 24 circuit tags ("@circuits") stay in their curated order — that
//    order IS Tracks.LIST, which is the track-picker and season-calendar
//    order. Do not sort or reorder them.
//  - A future generated js/track/circuit-elevations.js (tools/
//    bake-elevation.mjs) must slot immediately BEFORE js/track/tracks.js.
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

const CIRCUITS_DIR = "js/circuits";
const circuitFiles = CIRCUITS.map((id) => `${CIRCUITS_DIR}/${id}.js`);

// Every js file, in exact index.html <script> tag order.
const FULL = [
  "js/mat4.js",
  "js/render/shaders/glx-shaders.js",
  "js/render/glx.js",
  "js/render/webgpu/wgsl-chunks.js",
  "js/render/webgpu/wgsl-post.js",
  "js/render/webgpu/wgsl-fx.js",
  "js/render/webgpu/wgx.js",
  "js/render/gfx.js",
  "js/render/gltf.js",
  "js/car/teams.js",
  "js/track/geo-paths.js",
  "js/track/geom.js",
  "js/track/scenery-data.js",
  "js/track/markings.js",
  "js/track/space.js",
  "js/track/surface.js",
  "js/track/models.js",
  "js/track/themes.js",
  "js/track/landmark-kit.js",
  "js/track/circuit-kit.js",
  ...circuitFiles,
  "js/track/tracks.js",
  "js/track/maps.js",
  "js/car/car3d.js",
  "js/game/input.js",
  "js/game/audio.js",
  "js/data/api.js",
  "js/data/telemetry.js",
  "js/data/export.js",
  "js/data/schedule.js",
  "js/data/standings.js",
  "js/data/lastrace.js",
  "js/data/live.js",
  "js/data/hub.js",
  "js/car/parts.js",
  "js/car/liveries.js",
  "js/car/liverytex.js",
  "js/car/ghost.js",
  "js/game/light-presets.js",
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
  "js/render/shaders/glx-shaders.js",
  "js/render/glx.js",
  "js/car/teams.js",
  "js/car/parts.js",
  "js/car/car3d.js",
  "js/car/liveries.js",
  "js/car/liverytex.js",
  "js/game/carmesh.js",
];

// verify-track.cjs / track-foundation Node-VM subset, in order.
// "@circuits" expands to every file in CIRCUITS_DIR (readdir, sorted — VM
// verification is per-id, so LIST order does not matter there).
const TRACK_VM = [
  "js/track/geo-paths.js",
  "js/track/geom.js",
  "js/track/scenery-data.js",
  "js/track/markings.js",
  "js/track/space.js",
  "js/track/surface.js",
  "js/track/models.js",
  "js/track/themes.js",
  "js/track/landmark-kit.js",
  "js/track/circuit-kit.js",
  "@circuits",
  "js/track/tracks.js",
];

// Eval-time dependencies: [before, after]. Each pair must be ordered in FULL.
const HARD_EDGES = [
  ["js/mat4.js", "js/render/glx.js"],                       // glx uses M4 at init
  ["js/render/shaders/glx-shaders.js", "js/render/glx.js"], // glx destructures GLXShaders at eval
  ["js/render/webgpu/wgsl-chunks.js", "js/render/webgpu/wgsl-post.js"], // string concat at eval
  ["js/render/webgpu/wgsl-chunks.js", "js/render/webgpu/wgsl-fx.js"],
  ["js/render/webgpu/wgsl-post.js", "js/render/webgpu/wgx.js"],
  ["js/render/webgpu/wgsl-fx.js", "js/render/webgpu/wgx.js"],
  ["js/render/webgpu/wgx.js", "js/render/gfx.js"],
  ["js/track/geom.js", "js/track/tracks.js"],               // tracks destructures TrackGeom at eval
  ["js/track/geo-paths.js", "js/track/tracks.js"],          // CircuitPaths read by LIST build
  ["js/track/space.js", "js/track/surface.js"],
  ["js/track/models.js", "js/track/circuit-kit.js"],
  ["js/track/tracks.js", "js/track/maps.js"],               // maps calls Tracks.buildCenterline
  ["js/data/api.js", "js/data/hub.js"],
  ["js/data/telemetry.js", "js/data/hub.js"],               // hub calls Data*.create at eval
  ["js/data/export.js", "js/data/hub.js"],
  ["js/data/schedule.js", "js/data/hub.js"],
  ["js/data/standings.js", "js/data/hub.js"],
  ["js/data/lastrace.js", "js/data/hub.js"],
  ["js/data/live.js", "js/data/hub.js"],
];

// Named paths for direct single-file consumers (tests/tools that load one
// source file by path). When a file moves, update it here and every consumer
// follows automatically.
const PATHS = {
  TRACKS_ENGINE: "js/track/tracks.js",
  GLX_SHADERS: "js/render/shaders/glx-shaders.js",
  WGSL_CHUNKS: "js/render/webgpu/wgsl-chunks.js",
  WGSL_POST: "js/render/webgpu/wgsl-post.js",
  WGX: "js/render/webgpu/wgx.js",
  GLTF: "js/render/gltf.js",
  TRACK_SPACE: "js/track/space.js",
  TRACK_SURFACE: "js/track/surface.js",
  TRACK_MODELS: "js/track/models.js",
  SCENERY_THEMES: "js/track/themes.js",
  LANDMARK_KIT: "js/track/landmark-kit.js",
  CIRCUIT_KIT: "js/track/circuit-kit.js",
};

const circuitPath = (id) => `${CIRCUITS_DIR}/${id}.js`;

module.exports = {
  CIRCUITS, CIRCUITS_DIR, FULL, CSS, CARVIEW, TRACK_VM, HARD_EDGES,
  PATHS, circuitPath,
};
