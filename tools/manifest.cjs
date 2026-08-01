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
  "js/render/shaders/chunks.js",
  "js/render/shaders/lit.js",
  "js/render/shaders/sky.js",
  "js/render/shaders/fx.js",
  "js/render/shaders/post.js",
  "js/render/glx/post.js",
  "js/render/glx/shadow.js",
  "js/render/glx/chunked.js",
  "js/render/glx.js",
  "js/render/webgpu/wgsl-chunks.js",
  "js/render/webgpu/wgsl-post.js",
  "js/render/webgpu/wgsl-fx.js",
  "js/render/webgpu/wgx.js",
  "js/render/three/tsl-chunks.js",
  "js/render/three/tsl-lit.js",
  "js/render/three/tsl-sky.js",
  "js/render/three/tsl-fx.js",
  "js/render/three/tsl-post.js",
  "js/render/three/tlx-shadow.js",
  "js/render/three/tlx-chunked.js",
  "js/render/three/tlx-post.js",
  "js/render/three/tlx.js",
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
  "js/track/graph.js",
  "js/track/themes.js",
  "js/track/landmark-kit.js",
  "js/track/circuit-kit.js",
  "js/track/spline.js",
  "js/track/mesh.js",
  "js/track/scenery-nature.js",
  "js/track/scenery-structures.js",
  "js/track/scenery-city.js",
  "js/track/scenery-identity.js",
  ...circuitFiles,
  "js/track/tracks.js",
  "js/track/maps.js",
  "js/car/car3d.js",
  "js/game/input.js",
  "js/game/audio.js",
  "js/game/music-lib.js",
  "js/game/spotify.js",
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
  "js/game/bodyattitude.js",
  "js/game/particles.js",
  "js/game/atmosphere.js",
  "js/game/store.js",
  "js/game/cam-tune.js",
  "js/game/setup-ui.js",
  "js/game/menus.js",
  "js/game/scrollfade.js",
  "js/game/menunav.js",
  "js/game/ariastate.js",
  "js/game/photomode.js",
  "js/game/tuner.js",
  "js/game/cam-tuner.js",
  "js/game/steer-tuning.js",
  "js/game/perf.js",
  "js/game/cameras.js",
  "js/game/hud.js",
  "js/game/results.js",
  "js/game/debrisworld.js",
  "js/game/incidentsim.js",
  "js/game/agentview.js",
  "js/game/apex.js",
  "js/game.js",
];

// Stylesheet <link> order in index.html.
const CSS = [
  "css/tokens.css", "css/components.css", "css/tuner.css", "css/menus.css",
  "css/carsetup.css", "css/hud.css", "css/overlays.css", "css/responsive.css",
  "css/track-detail.css",   // link order == original style.css source order (cascade-preserving)
  "css/data.css",
];

// tools/carview.html <script> subset, in order (paths repo-relative; the file
// itself uses ../js/... since it is served from /tools/).
const CARVIEW = [
  "js/mat4.js",
  "js/render/shaders/chunks.js",
  "js/render/shaders/lit.js",
  "js/render/shaders/sky.js",
  "js/render/shaders/fx.js",
  "js/render/shaders/post.js",
  "js/render/glx/post.js",
  "js/render/glx/shadow.js",
  "js/render/glx/chunked.js",
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
  "js/track/graph.js",
  "js/track/themes.js",
  "js/track/landmark-kit.js",
  "js/track/circuit-kit.js",
  "js/track/spline.js",
  "js/track/mesh.js",
  "js/track/scenery-nature.js",
  "js/track/scenery-structures.js",
  "js/track/scenery-city.js",
  "js/track/scenery-identity.js",
  "@circuits",
  "js/track/tracks.js",
];

// Eval-time dependencies: [before, after]. Each pair must be ordered in FULL.
const HARD_EDGES = [
  ["js/mat4.js", "js/render/glx.js"],                       // glx uses M4 at init
  // chunks.js before every shader file (lit/sky/post interpolate GLXChunks at
  // eval; fx.js is chunk-free today but keeps the uniform ordering contract).
  ["js/render/shaders/chunks.js", "js/render/shaders/lit.js"],
  ["js/render/shaders/chunks.js", "js/render/shaders/sky.js"],
  ["js/render/shaders/chunks.js", "js/render/shaders/fx.js"],
  ["js/render/shaders/chunks.js", "js/render/shaders/post.js"],
  // every shader file before glx.js (it destructures GLXShaders at eval)
  ["js/render/shaders/lit.js", "js/render/glx.js"],
  ["js/render/shaders/sky.js", "js/render/glx.js"],
  ["js/render/shaders/fx.js", "js/render/glx.js"],
  ["js/render/shaders/post.js", "js/render/glx.js"],
  // glx/ subsystem modules before glx.js (GLX.init calls GLXPost/GLXShadow/
  // GLXChunked.init — call-time, but the globals must exist by then; keep the
  // ordering explicit)
  ["js/render/glx/post.js", "js/render/glx.js"],
  ["js/render/glx/shadow.js", "js/render/glx.js"],
  ["js/render/glx/chunked.js", "js/render/glx.js"],
  ["js/render/webgpu/wgsl-chunks.js", "js/render/webgpu/wgsl-post.js"], // string concat at eval
  ["js/render/webgpu/wgsl-chunks.js", "js/render/webgpu/wgsl-fx.js"],
  ["js/render/webgpu/wgsl-post.js", "js/render/webgpu/wgx.js"],
  ["js/render/webgpu/wgsl-fx.js", "js/render/webgpu/wgx.js"],
  ["js/render/webgpu/wgx.js", "js/render/gfx.js"],
  // TSL shader factories before tlx.js (TLX.create invokes TLXShaders.chunks/
  // .lit — call-time, but keep the ordering explicit like the glx/ modules)
  ["js/render/three/tsl-chunks.js", "js/render/three/tsl-lit.js"],
  ["js/render/three/tsl-lit.js", "js/render/three/tlx.js"],
  ["js/render/three/tsl-sky.js", "js/render/three/tlx.js"],   // TLX.create invokes TLXShaders.sky
  ["js/render/three/tsl-fx.js", "js/render/three/tlx.js"],    // TLX.create invokes TLXShaders.fx
  ["js/render/three/tlx-shadow.js", "js/render/three/tlx.js"],  // TLX.create invokes TLXShaders.shadowSys
  ["js/render/three/tlx-chunked.js", "js/render/three/tlx.js"], // TLX.create invokes TLXShaders.chunked
  ["js/render/three/tsl-post.js", "js/render/three/tlx-post.js"], // postChain invokes TLXShaders.post
  ["js/render/three/tlx-post.js", "js/render/three/tlx.js"],   // TLX.create invokes TLXShaders.postChain
  ["js/render/three/tlx.js", "js/render/gfx.js"],      // gfx.create branches on the TLX global
  ["js/track/geom.js", "js/track/tracks.js"],               // tracks destructures TrackGeom at eval
  ["js/track/spline.js", "js/track/tracks.js"],             // tracks destructures TrackSpline at eval
  ["js/track/geom.js", "js/track/mesh.js"],                 // mesh destructures TrackGeom at eval
  ["js/track/spline.js", "js/track/mesh.js"],               // mesh destructures TrackSpline at eval
  ["js/track/mesh.js", "js/track/tracks.js"],               // tracks destructures TrackMesh at eval
  ["js/track/graph.js", "js/track/tracks.js"],               // buildProps calls TrackGraph.create at build
  ["js/track/scenery-nature.js", "js/track/tracks.js"],     // buildProps calls Scenery*.create (build time, keep ordered)
  ["js/track/scenery-structures.js", "js/track/tracks.js"],
  ["js/track/scenery-city.js", "js/track/tracks.js"],
  ["js/track/scenery-identity.js", "js/track/tracks.js"],
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
  ["js/game/tables.js", "js/game/hud.js"],      // hud destructures GameTables at eval
  ["js/car/teams.js", "js/game/store.js"],      // seasonRoster reads Teams (call time, but keep ordered)
  ["js/game/store.js", "js/game/cam-tune.js"],  // cam-tune destructures GameStore at eval
];

// Named paths for direct single-file consumers (tests/tools that load one
// source file by path). When a file moves, update it here and every consumer
// follows automatically.
const PATHS = {
  TRACKS_ENGINE: "js/track/tracks.js",
  GLX_CHUNKS: "js/render/shaders/chunks.js",
  GLX_SHADERS_LIT: "js/render/shaders/lit.js",
  GLX_SHADERS_POST: "js/render/shaders/post.js", // grade/composite GLSL (image-grade-shaders.test.mjs)
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
