// manifest.cjs — the single source of truth for script load order.
//
// index.html cannot be generated (no build step), so it is hand-edited and
// ASSERTED against this file by tests/unit/load-order.test.mjs. Node VM loaders
// (verify-track.cjs, the track-foundation tests) iterate the subsets below
// instead of keeping their own copies, so adding/moving a file is a one-line
// edit here plus the matching <script> tag.
//
// Directory map (post-reorg):
//   js/render/    renderer: gfx façade, GLX (WebGL2), shaders, WebGPU backend
//   js/track/     track ENGINE + infra (geometry, surface, scenery kits)
//   js/circuits/  the 40 circuit DEFINITIONS (24 season + 16 classic; one file each)
//   js/car/       car model, liveries, parts, ghost, teams
//   js/data/      data hub (api client + tab modules + shell)
//   js/game/      game-support modules extracted from / loaded before game.js
//
// Rules encoded here:
//  - FULL is every TAGGED js/ file, in the exact index.html <script> order.
//  - DEFERRED is renderer backends with no tag, injected at runtime by
//    game.js when opted into. LAZY_AGENT is the __apex / agentview surface
//    (same "no tag" rule, but NOT SW-optional — V8 full-compiles install
//    puts). FULL ∪ DEFERRED ∪ LAZY_AGENT must cover js/**/*.js.
//  - The circuit tags ("@circuits") stay in their curated order — that
//    order IS Tracks.LIST, which is the track-picker order. The season
//    calendar is Tracks.SEASON, the `classic: false` prefix of that list, so
//    the 24 season circuits MUST stay first and in calendar order. Do not
//    sort or reorder them.
//  - A future generated js/track/circuit-elevations.js (tools/
//    bake-elevation.mjs) must slot immediately BEFORE js/track/tracks.js.
//  - HARD_EDGES are eval-time dependencies (destructure/call at IIFE
//    evaluation). Violating one is a ReferenceError at load, not a subtle bug.

"use strict";

// Curated circuit order (== Tracks.LIST == picker order).
// The first 24 are the season calendar (Tracks.SEASON, in round order); the
// retired circuits below carry `classic: true` and are appended, never
// interleaved — a stored apex26.track is a positional index into this list.
const CIRCUITS = [
  "bahrain", "monaco", "silverstone", "spa", "monza", "suzuka", "singapore",
  "cota", "interlagos", "vegas", "madrid", "zandvoort", "jeddah",
  "albert_park", "shanghai", "miami", "imola", "montreal", "redbull",
  "hungaroring", "baku", "mexico", "qatar", "abudhabi",
  // ── retired / off-calendar (classic: true) ──
  "hockenheim", "nurburgring", "catalunya", "sepang", "istanbul",
  "paul_ricard", "portimao", "sochi", "mugello", "magny_cours",
  "estoril", "kyalami", "watkins_glen", "indianapolis", "buenos_aires",
  "jacarepagua",
];

const CIRCUITS_DIR = "js/circuits";
const circuitFiles = CIRCUITS.map((id) => `${CIRCUITS_DIR}/${id}.js`);

// Every js file, in exact index.html <script> tag order.
const FULL = [
  // Log must be first: every module below may log at evaluation time.
  "js/log.js",
  "js/mat4.js",
  "js/render/shaders/chunks.js",
  "js/render/shaders/lit.js",
  "js/render/shaders/sky.js",
  "js/render/shaders/fx.js",
  "js/render/shaders/post.js",
  "js/render/glx/post.js",
  "js/render/glx/shadow.js",
  "js/render/lamp-chunks.js",
  "js/render/glx/chunked.js",
  "js/render/glx.js",
  // NB: js/render/webgpu/* and js/render/three/* are NOT here — they are
  // DEFERRED (see below) and injected at boot only when opted into.
  "js/render/gfx.js",
  "js/render/gltf.js",
  "js/render/assets.js",
  "js/car/teams.js",
  "js/car/driver-ratings.js",
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
  "js/game/audio-panel.js",
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
  "js/game/physics-consts.js",
  "js/game/tables.js",
  "js/game/lighting.js",
  "js/game/light-store.js",
  "js/game/carmesh.js",
  "js/game/garage-scene.js",
  "js/game/bodyattitude.js",
  "js/game/particles.js",
  "js/game/atmosphere.js",
  "js/game/store.js",
  "js/game/career.js",
  "js/game/season-cal.js",
  "js/game/reliability.js",
  "js/game/ai-drive.js",
  "js/game/cam-tune.js",
  "js/game/setup-ui.js",
  "js/game/career-ui.js",
  "js/game/season-ui.js",
  "js/game/menus.js",
  "js/game/scrollfade.js",
  "js/game/css-zoom.js",
  "js/game/sheetshape.js",
  "js/game/uilayers.js",
  "js/game/topmodal.js",
  "js/game/menunav.js",
  "js/game/ariastate.js",
  "js/game/settings-nav.js",
  "js/game/aerozones.js",
  "js/game/skidmarks.js",
  "js/game/racecontrol.js",
  "js/game/photomode.js",
  "js/game/tuner.js",
  "js/game/cam-tuner.js",
  "js/game/brake-cue.js",
  "js/game/steer-tuning.js",
  "js/game/perf.js",
  "js/game/gfx-quality.js",
  "js/game/gfx-debug.js",
  "js/game/ui-scale.js",
  "js/game/cockpit-opts.js",
  "js/game/metrics-panel-style.js",
  "js/game/metrics.js",
  "js/game/cameras.js",
  "js/game/cam-modes.js",
  "js/game/hud.js",
  "js/game/results.js",
  "js/game/quali.js",
  "js/game/debrisworld.js",
  "js/game/incidentsim.js",
  // agentview* + apex.js are LAZY_AGENT — injected when tests / localhost /
  // ?apex=1 ask for __apex. Not on the player boot wall (PWA memory).
  // Multiplayer wire. Pure logic with no game dependency, so position only
  // has to satisfy "before whatever consumes it" — game.js, last as always.
  "js/net/nostr.js",
  "js/net/rendezvous.js",
  "js/net/sdp.js",
  "js/net/qr.js",
  "js/net/scan.js",
  "js/net/transport.js",
  "js/net/handshake.js",
  "js/net/snapshot.js",
  "js/net/session.js",
  "js/net/netplay.js",
  "js/net/lobby.js",
  "js/game.js",
];

// Stylesheet <link> order in index.html.
const CSS = [
  "css/tokens.css", "css/components.css", "css/tuner.css", "css/menus.css",
  "css/carsetup.css", "css/hud.css", "css/overlays.css", "css/responsive.css",
  "css/track-detail.css",   // link order == original style.css source order (cascade-preserving)
  "css/career.css",
  "css/data.css",
];

// tools/carview.html <script> subset, in order (paths repo-relative; the file
// itself uses ../js/... since it is served from /tools/).
const CARVIEW = [
  "js/log.js",
  "js/mat4.js",
  "js/render/shaders/chunks.js",
  "js/render/shaders/lit.js",
  "js/render/shaders/sky.js",
  "js/render/shaders/fx.js",
  "js/render/shaders/post.js",
  "js/render/glx/post.js",
  "js/render/glx/shadow.js",
  "js/render/lamp-chunks.js",
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
  "js/log.js",
  // mat4.js is not matrix math for the VM's sake — it is the home of the shared
  // scalar helpers (M4.clamp/lerp/wrapDelta), which js/track/ binds at eval.
  // Leaving it out is how the track engine ended up with four private lerps.
  "js/mat4.js",
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
  // M4 is also the home of the shared scalar helpers (clamp/lerp/wrapDelta) and
  // every consumer ALIASES them at eval (`const clamp = M4.clamp;`). mat4.js is
  // the 2nd tag so the order is never in doubt, but these are real eval-time
  // edges and the list is what records them; the toposort check derives the rest.
  ["js/mat4.js", "js/game.js"],
  ["js/mat4.js", "js/track/spline.js"],
  ["js/mat4.js", "js/track/scenery-structures.js"],
  ["js/mat4.js", "js/data/telemetry.js"],
  // liverytex sizes its atlas from GLX.mobileTier at EVAL time — the one
  // mobile-tier detection now lives in glx.js and nowhere else.
  ["js/render/glx.js", "js/car/liverytex.js"],
  // session.js decodes off the same channel as snapshot.js and shares its ONE
  // toView(); the two hand-rolled copies had already diverged over how a
  // DataView argument is handled, which is exactly the bug a shared helper
  // prevents. Call-time, not eval-time, but a session with no NetSnapshot
  // silently drops every state packet rather than throwing — so pin the order.
  ["js/net/snapshot.js", "js/net/session.js"],
  // handshake.js calls NetSdp.packChecked/unpack whenever it builds or reads
  // an invite code. Call-time, but a handshake with no NetSdp throws inside
  // the click handler that generates the invite — the one place an error is
  // least visible.
  ["js/net/sdp.js", "js/net/handshake.js"],
  // lobby.js draws the invite QR through NetQr the moment an invite exists.
  ["js/net/qr.js", "js/net/lobby.js"],
  // lobby.js calls NetRendezvous the moment a room-code button is wired.
  ["js/net/rendezvous.js", "js/net/lobby.js"],
  // rendezvous.js calls NetNostr whenever no private relay is configured,
  // which is the DEFAULT path — room codes work with nothing deployed.
  ["js/net/nostr.js", "js/net/rendezvous.js"],
  // lobby.js creates a NetScan the moment a SCAN button is wired.
  ["js/net/scan.js", "js/net/lobby.js"],
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
  ["js/render/lamp-chunks.js", "js/render/glx/chunked.js"], // drawChunked resolves LampChunks tables (call-time; keep explicit)
  ["js/render/glx/chunked.js", "js/render/glx.js"],
  ["js/render/glx.js", "js/render/assets.js"],         // Assets feature-detects the backend's createTextureArray
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
  ["js/game/tables.js", "js/game/cam-modes.js"], // cam-modes destructures GameTables at eval
  ["js/game/physics-consts.js", "js/game.js"],  // game.js destructures PhysicsConsts at eval
  ["js/game/physics-consts.js", "js/game/bodyattitude.js"], // LAT_MAX read at eval
  ["js/car/teams.js", "js/game/store.js"],      // seasonRoster reads Teams (call time, but keep ordered)
  // liverytex kicks off loadLogos(Teams.LIST ids) at EVAL time — it used to
  // carry its own copy of the roster (a SHORT table that had drifted), and
  // reading the real one makes the order load-bearing rather than tidy.
  ["js/car/teams.js", "js/car/liverytex.js"],
  ["js/game/store.js", "js/game/cam-tune.js"],  // cam-tune destructures GameStore at eval
  ["js/game/store.js", "js/game/career.js"],    // career destructures GameStore at eval
  ["js/game/store.js", "js/game/season-cal.js"], // season-cal destructures GameStore at eval
  ["js/game/season-cal.js", "js/game/season-ui.js"], // the screen reads the season rules
  ["js/game/season-ui.js", "js/game.js"],      // game.js calls SeasonUI.create(G) at eval
  ["js/car/parts.js", "js/game/career.js"],     // Career.start seeds owned/fitted from Parts (call time, keep ordered)
  ["js/car/driver-ratings.js", "js/game.js"],   // makeCars reads DriverRatings for every car's skill
  ["js/game/career.js", "js/game/quali.js"],    // quali reads Career.rnd/devFor for its spread
  ["js/game/aerozones.js", "js/game.js"],      // game.js calls AeroZones.create(G) at eval time
  ["js/game/skidmarks.js", "js/game.js"],      // game.js calls SkidMarks.create(G) at eval time
  ["js/game/racecontrol.js", "js/game.js"],   // game.js calls RaceControl.create(G) at eval time
  ["js/game/lighting.js", "js/game/light-store.js"],  // light-store destructures LightTune's TUNE_DEFS/LT inside create()
  ["js/game/light-store.js", "js/game.js"],    // game.js calls LightStore.create(G) at eval time
  ["js/game/audio-panel.js", "js/game.js"],   // game.js calls AudioPanel.create(G) at eval time
  ["js/game/ui-scale.js", "js/game.js"],      // game.js calls UiScale.create(G) at eval time
  ["js/game/career.js", "js/game/reliability.js"],  // reliability draws through Career.hash (call time, keep ordered)
  ["js/car/parts.js", "js/game/reliability.js"],    // buildQuality resolves a setup through Parts (call time, keep ordered)
  ["js/game/reliability.js", "js/game.js"],     // game.js validates the stored RELIABILITY level at eval
  ["js/mat4.js", "js/game/ai-drive.js"],         // AiDrive binds M4.clamp/lerp at eval
  ["js/mat4.js", "js/game/brake-cue.js"],        // BrakeCue aliases M4.clamp at eval
  ["js/game/ai-drive.js", "js/game.js"],         // updateCar calls AiDrive for AI racecraft
  ["js/game/career.js", "js/game/career-ui.js"],  // the screen reads the Career rules
];

// ---------------------------------------------------------------------------
// DEFERRED — js/ files with NO <script> tag, injected at runtime instead.
//
// WHY. GLX (WebGL2) is the shipped renderer; TLX (three.js/TSL) and WGX
// (native WebGPU) are opt-in migrations selected by the localStorage key
// `apex26.gfxBackend`, and game.js refuses both on phones outright. So these
// ~550 KB were parsed and evaluated by essentially every visitor to be used by
// essentially none — a tenth of the whole boot payload, spent on nothing.
//
// The machinery to defer them already existed: game.js resolves `optIn`
// synchronously from localStorage BEFORE it awaits Gfx.create(), and gfx.js
// already treats a missing TLX/WGX global as "not available" and hands the
// caller back to GLX (`typeof TLX === "undefined"` / `typeof WGX ===
// "undefined"`). A failed injection is therefore the same no-op as a browser
// that never had the backend.
//
// KEYED BY the apex26.gfxBackend value that selects the group, and ordered —
// the array IS the load order, and DEFERRED_EDGES below pins the eval-time
// dependencies inside each group the way HARD_EDGES does for FULL.
//
// Adding a file here instead of FULL means: no <script> tag in index.html, and
// it MUST also be seeded into sw.js's OPTIONAL precache set (the service worker
// discovers everything else by parsing the shell's own tags, so a deferred file
// is invisible to it). tests/unit/load-order.test.mjs asserts all three.
const DEFERRED = {
  webgpu: [
    "js/render/webgpu/wgsl-chunks.js",
    "js/render/webgpu/wgsl-post.js",
    "js/render/webgpu/wgsl-fx.js",
    "js/render/webgpu/wgx.js",
  ],
  three: [
    "js/render/three/tsl-chunks.js",
    "js/render/three/tsl-lit.js",
    "js/render/three/tsl-sky.js",
    "js/render/three/tsl-fx.js",
    "js/render/three/tsl-post.js",
    "js/render/three/tlx-shadow.js",
    "js/render/three/tlx-chunked.js",
    "js/render/three/tlx-post.js",
    "js/render/three/tlx.js",
  ],
};

// Eval-time dependencies WITHIN a deferred group — same meaning as HARD_EDGES,
// asserted against that group's own array order. The old edges from wgx.js and
// tlx.js to gfx.js are gone on purpose: gfx.js reads those globals inside
// Gfx.create(), which the loader only reaches after the group has evaluated, so
// the ordering is now enforced by the await rather than by tag position.
// Dev/test surface. No <script> tag, no SW install put (full code cache).
// game.js injects these when wantAgentSurface() — __TEST_MODE, localhost,
// ?apex=1 / ?debug= / ?report=, or apex26.devApi=1. Players on Pages skip
// ~350 KB of parse + PWA memory. Fetch-miss still caches on first use.
const LAZY_AGENT = [
  "js/game/agentview-raster.js",
  "js/game/agentview.js",
  "js/game/apex.js",
];
const LAZY_EDGES = [
  ["js/game/agentview-raster.js", "js/game/agentview.js"],
];

const DEFERRED_EDGES = [
  ["js/render/webgpu/wgsl-chunks.js", "js/render/webgpu/wgsl-post.js"], // string concat at eval
  ["js/render/webgpu/wgsl-chunks.js", "js/render/webgpu/wgsl-fx.js"],
  ["js/render/webgpu/wgsl-post.js", "js/render/webgpu/wgx.js"],
  ["js/render/webgpu/wgsl-fx.js", "js/render/webgpu/wgx.js"],
  ["js/render/three/tsl-chunks.js", "js/render/three/tsl-lit.js"],
  ["js/render/three/tsl-lit.js", "js/render/three/tlx.js"],
  ["js/render/three/tsl-sky.js", "js/render/three/tlx.js"],      // TLX.create invokes TLXShaders.sky
  ["js/render/three/tsl-fx.js", "js/render/three/tlx.js"],       // TLX.create invokes TLXShaders.fx
  ["js/render/three/tlx-shadow.js", "js/render/three/tlx.js"],   // TLX.create invokes TLXShaders.shadowSys
  ["js/render/three/tlx-chunked.js", "js/render/three/tlx.js"],  // TLX.create invokes TLXShaders.chunked
  ["js/render/three/tsl-post.js", "js/render/three/tlx-post.js"], // postChain invokes TLXShaders.post
  ["js/render/three/tlx-post.js", "js/render/three/tlx.js"],     // TLX.create invokes TLXShaders.postChain
];

// Named paths for direct single-file consumers (tests/tools that load one
// source file by path). When a file moves, update it here and every consumer
// follows automatically.
const PATHS = {
  TRACKS_ENGINE: "js/track/tracks.js",
  GLX_CHUNKS: "js/render/shaders/chunks.js",
  LAMP_CHUNKS: "js/render/lamp-chunks.js",
  GLX_SHADERS_LIT: "js/render/shaders/lit.js",
  GLX_SHADERS_POST: "js/render/shaders/post.js", // grade/composite GLSL (image-grade-shaders.test.mjs)
  WGSL_CHUNKS: "js/render/webgpu/wgsl-chunks.js",
  WGSL_POST: "js/render/webgpu/wgsl-post.js",
  WGX: "js/render/webgpu/wgx.js",
  GLTF: "js/render/gltf.js",
  ASSETS: "js/render/assets.js",
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
  DEFERRED, DEFERRED_EDGES, LAZY_AGENT, LAZY_EDGES,
  PATHS, circuitPath,
};
