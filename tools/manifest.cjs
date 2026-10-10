// manifest.cjs — the single source of truth for script load order.
// @doc Load-order truth: `FULL`, `DEFERRED`, `LAZY_AGENT`, `HARD_EDGES`, `TRACK_VM`; index.html must match.
// @skill check-changes
//
// index.html's tag blocks, tools/carview.html's tags, sw.js's optional
// precache seed and js/roster.js (the lazy rosters js/game.js injects) are all
// GENERATED from this file by tools/gen/gen-shell.mjs; tests/unit/load-order.test.mjs
// asserts the generated blocks are byte-identical to a fresh run. Node VM
// loaders (verify-track.cjs, the track-foundation tests) iterate the subsets
// below instead of keeping their own copies, so adding/moving a file is a
// one-line edit here plus `node tools/gen/gen-shell.mjs`.
//
// Directory map (post-reorg):
//   js/render/    renderer: gfx façade, GLX (WebGL2), shaders, WebGPU backend
//   js/track/     track ENGINE + infra (geometry, surface, scenery kits)
//   js/circuits/  the 52 circuit DEFINITIONS (24 season + 28 classic; one file each)
//   js/car/       car model, liveries, parts, ghost, teams
//   js/data/      data hub (api client + tab modules + shell)
//   js/lighting/, js/race/, js/garage/, js/career/, js/physics/, js/fx/,
//   js/perf/, js/ui/, js/audio/, js/camera/, js/input/, js/net/, js/agent/
//                 the modules extracted from / loaded before game.js
//
// Rules encoded here:
//  - FULL is every TAGGED js/ file, in the exact index.html <script> order.
//  - DEFERRED is renderer backends with no tag, injected at runtime by
//    game.js when selected (GLX also serves as fallback). LAZY_AGENT is the __apex / agentview surface
//    (same "no tag" rule, but NOT SW-optional — V8 full-compiles install
//    puts). FULL ∪ DEFERRED ∪ LAZY_AGENT must cover js/**/*.js.
//  - The circuit tags ("@circuits") stay in their curated order — that
//    order IS Tracks.LIST, which is the track-picker order (NOT the real F1
//    calendar). Tracks.SEASON is `LIST.filter((t) => !t.classic)` — a filter, not
//    a prefix (zandvoort and imola are `classic: true` inside the first 24;
//    istanbul and portimao are season circuits listed among the classics); a
//    stored apex26.track is a positional index, so do not sort or reorder them.
//  - The generated js/track/circuit-elevations.js (tools/gen/bake-elevation.mjs)
//    slots immediately BEFORE js/track/tracks.js, in FULL and in TRACK_VM.
//    It shipped 2026-09-14; it was a forward reference until then.
//  - HARD_EDGES are eval-time dependencies (destructure/call at IIFE
//    evaluation). Violating one is a ReferenceError at load, not a subtle bug.

"use strict";

// Curated circuit order (== Tracks.LIST == picker order; NOT the real
// calendar). Tracks.SEASON = the 24 non-classic ids in this order (a filter of
// the list, not a prefix: a few `classic: true` ids sit among the first 24 and
// two season ids sit below) — a stored apex26.track is a positional index into
// this list, so new ids are appended, never interleaved.
// ONE id per line (section order is load-bearing — never alpha-sort). Two PRs
// appending different classics used to collide on the same multi-id line.
const CIRCUITS = [
  "bahrain",
  "monaco",
  "silverstone",
  "spa",
  "monza",
  "suzuka",
  "singapore",
  "cota",
  "interlagos",
  "vegas",
  "madrid",
  "zandvoort",
  "jeddah",
  "albert_park",
  "shanghai",
  "miami",
  "imola",
  "montreal",
  "redbull",
  "hungaroring",
  "baku",
  "mexico",
  "qatar",
  "abudhabi",
  // ── appended circuits (mostly retired / off-calendar, classic: true) ──
  "hockenheim",
  "nurburgring",
  "catalunya",
  "sepang",
  "istanbul",
  "paul_ricard",
  "portimao",
  "sochi",
  "mugello",
  "magny_cours",
  "estoril",
  "kyalami",
  "watkins_glen",
  "indianapolis",
  "buenos_aires",
  "jacarepagua",
  // ── recovered from OpenStreetMap (tools/track/osm-circuits.json) — the
  //    bacinger/f1-circuits file the 40 above come from has no more features ──
  "fuji",
  "okayama",
  "korea",
  "jerez",
  "donington",
  "anderstorp",
  "brands_hatch",
  "zolder",
  "dijon",
  "buddh",
  "mont_tremblant",
  "mosport",
];

const CIRCUITS_DIR = "js/circuits";
const circuitFiles = CIRCUITS.map((id) => `${CIRCUITS_DIR}/${id}.js`);
// Title/menu wall: one GENERATED meta roster (tools/gen/gen-circuit-meta.mjs)
// instead of all 52 full defs (~146 KiB gz). Full path/physics/dressing payload
// hydrates per pick via LAZY_CIRCUIT (ensureCircuit in js/core/lazy-bundles.js).
const CIRCUIT_META = "js/track/circuit-meta.js";
const LAZY_CIRCUIT = circuitFiles;
// The bespoke scenery closure for each circuit, split out of its def file.
// ~27 KB each; all 40 (52 today) were 1,083 KB of the boot script wall for a session that
// builds ONE circuit. No <script> tag — game.js fetches the one it is about to
// build (RACE_SCENERY / sceneryUrl), and js/track/tracks.js resolves through
// window.TrackScenery[def.id]. The Node build harnesses load the whole dir.
const SCENERY_DIR = "js/circuits/scenery";
const LAZY_SCENERY = CIRCUITS.map((id) => `${SCENERY_DIR}/${id}.js`);

// Every js file, in exact index.html <script> tag order.
const FULL = [
  // Log must be first: every module below may log at evaluation time.
  "js/core/log.js",
  "js/core/mat4.js",
  "js/core/hash32.js",
  "js/core/clipboard.js",   // ApexClipboard: write/read + textarea fallback (call-time; early so panels/lobby can use it)
  "js/core/native.js",      // Native: Electron / Capacitor detect (call-time; SW gate in index.html is a 3-line duplicate)
  "js/core/native-download.js", // NativeDownload: blob:<a download> via Capacitor.Plugins (Android/iOS only)
  // GENERATED by tools/gen/gen-shell.mjs: the tagless rosters below (DEFERRED,
  // LAZY_*) as one frozen global, ApexRoster, read by js/game.js at eval.
  "js/roster.js",
  "js/core/script-loader.js", // ScriptLoader: dependency-aware runtime script injection
  "js/core/lazy-bundles.js", // LazyBundles: data, scenery, network and agent payload lifecycles
  "js/core/wake-lock.js", // RaceWakeLock: race wake-lock acquisition and release
  "js/render/shared/glx-facade.js", // stable GLX identity and eval-time mobile tier; no WebGL/GLSL parsed yet
  "js/render/shared/light-budget.js",   // LightBudget: the one light-slot budget (glx MAX_LIGHTS, lamp-chunks CAP read it at eval)
  "js/render/shared/post-common.js",    // PostCommon: lens-dirt canvas, keepNearest, HDR-grade test, sun-screen, knob defaults — shared by the three post chains
  "js/render/shared/canvas-css-size.js", // CanvasCssSize: cached canvas box + resize/orientation/observer invalidation for all backends
  "js/render/shared/lamp-chunks.js",
  "js/render/shared/frustum.js",
  "js/render/shared/inst-cells.js",  // InstCells: shared cell-set cull cache (GLX+WGX+TLX)
  "js/render/shared/vertex-pack.js",   // VertexPack: the ONE definition of how a world vertex channel is quantised — GLX's interleaved layout plus the snorm/half primitives WGX and TLX pack with
  // GLX's shaders, pass modules and renderer are DEFERRED along with TLX/WGX.
  "js/render/gfx.js",
  "js/render/renderer-boot.js", // RendererBoot: backend selection, canary and fallback boot
  "js/render/shared/gltf.js",
  "js/render/shared/assets.js",
  "js/render/shared/driving-line.js",
  "js/data/teams.js",
  "js/data/driver-ratings.js",
  // Legends sits with the other driver data and AHEAD of js/car/liveries.js,
  // whose forTeam() appends Legends.liveries() to the picker.
  "js/data/legends.js",
  "js/career/save-migrate.js",
  // Persistence sits ahead of every js/game module: the settings panels, the
  // perf sentinel and the Spotify client go through GameStore.store's raw lane,
  // and spotify.js's init() runs at EVAL when the document is already complete
  // (the game-vm harness; a late-injected script), so the store must precede it.
  // Shipped preference defaults, as data. Ahead of the store because
  // GameStore.get/raw consult it on every miss (js/data/settings-defaults.js
  // header), and ahead of everything that reads a preference for the same
  // reason. Pure data with no dependencies of its own.
  "js/data/settings-defaults.js",
  // Shipped GARAGE defaults (parts / liveries / setups / team / driver). Same
  // miss-path as settings-defaults: GameStore.get consults GarageDefaults
  // after SettingsDefaults, so a stored player garage still wins. Generated
  // from an apex26-garage-v1 export via tools/gen/garage-defaults.mjs.
  "js/data/garage-defaults.js",
  "js/core/store.js",
  "js/career/career-backup.js", // CareerBackup: after store + save-migrate; versioned six-slot export/import
  "js/ui/dom.js",            // Dom.el / paintFold / fmtLap — the one DOM-helper home (hub, career-ui, season-ui destructure it at eval)
  "js/ui/title-fx.js",       // <html data-motion> at eval, as early as the store allows: the first menu frame must not animate for a player who said REDUCED
  "js/track/core/geom.js",
  "js/track/core/pit.js",
  "js/track/scenery/data.js",
  "js/track/core/space.js",
  "js/track/core/surface.js",
  "js/track/scenery/models.js",
  "js/track/scenery/graph.js",
  "js/track/scenery/themes.js",
  "js/track/scenery/landmark-kit.js",
  "js/track/scenery/circuit-kit.js",
  "js/track/core/spline.js",
  "js/track/core/line.js",
  "js/track/core/mesh.js",
  "js/track/core/hidden-faces.js",
  "js/track/core/def.js",   // TrackDef: raw def → LIST entry (palettes, realPoints, fromRaw); tracks.js destructures it at eval
  "js/track/scenery/nature.js",
  "js/track/scenery/structures.js",
  "js/track/scenery/city.js",
  "js/track/scenery/identity.js",
  "js/track/scenery/pits.js",
  "js/track/scenery/venue.js",
  // buildProps orchestration (guards nested for a later peel). Tracks.build calls it.
  "js/track/scenery/build-props.js",
  CIRCUIT_META, // GENERATED meta — full defs are LAZY_CIRCUIT
  // RACE SESSION STUB — pit / radio / coach / reliability (~320 KB) is
  // LAZY_RACE_SESSION (loaded before startRace / idle prefetch). The stub keeps
  // title/menus from throwing; real modules reinject via top-level `var`.
  "js/race/session-stub.js",
  "js/race/session-entry.js", // invalidates pending scenery-backed starts on quit or changed selection
  // Generated by tools/gen/bake-elevation.mjs — surveyed SRTM profiles. MUST
  // precede tracks.js, which reads CircuitElevations at LIST build time.
  "js/track/circuit-elevations.js",
  "js/track/tracks.js",
  "js/track/build-client.js", // TrackBuildClient: the build Worker's page side (apex26.buildWorker, default ON when multi-core)
  "js/workers/bitmap-decode-client.js", // BitmapDecode: createImageBitmap in a Worker (js/workers/bitmap-decode-worker.js)
  "js/ui/track-maps.js",
  // THE TRACK DESIGNER'S BOOT HALF (js/editor/): the theme presets and the
  // registry that appends the player's saved circuits to Tracks.LIST at eval,
  // before game.js resolves the stored trackId. The editor itself is LAZY.
  "js/editor/track-themes.js",   // TrackThemes: preset def fields + generated scenery closure (reads TrackSceneryData at eval)
  "js/editor/props.js",          // TrackDesignerProps: capped scenery props (sanitize + dress); FULL so sync()/share see them
  "js/editor/custom-tracks.js",  // CustomTracks: apex26.customTracks → TrackDef.fromRaw → Tracks.LIST tail (`custom: true`); sync() at eval
  "js/car/helmets.js",
  "js/car/car-geometry.js",
  "js/car/car-wheels.js",
  "js/car/car-shade.js",   // CarShade: rounded body sections + smooth shading for Car3D (apex26.carSmooth / ?carsmooth=0 opts out, default ON)
  "js/car/car3d.js",
  "js/input/tilt-roll.js",  // TiltRoll: the one roll-from-orientation function; input.js and controller.html both call it
  "js/input/bindings.js",
  "js/input/pad-menu.js",
  "js/input/haptics.js",
  "js/input/hold-buttons.js",
  "js/input/input.js",
  // AUDIO STUB — the ~449 KB engine/panel/voice stack is LAZY_AUDIO (loaded on
  // first gesture or race start). The stub keeps menus from throwing and is
  // reassigned via top-level `var` when the real bundle lands.
  "js/audio/stub.js",
  // The announcer's authored half. Data only, read at CALL time and guarded on
  // the global, so the order is for tidiness rather than correctness.
  "js/data/circuit-lore.js",
  "js/car/parts.js",
  "js/car/liveries.js",
  "js/car/custom-liveries.js",   // persist/resolve/live-draft (CustomLiveries.create({ store })), peeled from game.js
  "js/car/crest-paths.js",
  "js/car/livery-graphics.js",
  "js/car/liverytex.js",
  "js/car/ghost.js",
  "js/car/ghost-share.js",
  "js/car/input-ghost.js",
  // session-records / duel → LAZY_RACE_SESSION; driving-coach stays FULL
  // (UiExperience.create captures the coach instance for practice-goal rows).
  "js/race/race-insights.js",
  "js/race/driving-coach.js",
  "js/physics/consts.js",
  "js/lighting/knobs.js",
  "js/lighting/track-lights.js",
  "js/lighting/frame-lights.js",
  "js/lighting/lamp-bake.js",           // LampBake: every lamp's diffuse pool baked into a ground light map (TLX/GLX read it)
  "js/lighting/lighting.js",
  "js/lighting/profiles.js",
  "js/car/car-mesh.js",
  "js/garage/experience.js",
  "js/garage/scene-prims.js",
  "js/garage/scene-equipment.js",
  "js/garage/scene-live.js",
  "js/garage/scene.js",
  "js/garage/arrival.js",
  "js/garage/setup-camera.js",
  "js/garage/prebuild.js",              // GaragePrebuild: the garage built while the title/race settings idle
  "js/garage/pit-signs.js",
  "js/physics/body-attitude.js",
  "js/fx/particles.js",
  "js/lighting/atmosphere.js",
  "js/career/regulations.js",
  "js/career/ai-dev.js",
  "js/career/career.js",
  "js/career/season-cal.js",
  "js/career/badges.js",       // after season-cal: reads SeasonCal.REAL_2026 (call time)
  // reliability / damage / engineer / radio stack → LAZY_RACE_SESSION
  "js/physics/tyre-model.js",
  "js/physics/grip-steer.js",
  "js/physics/player-forces.js", // human combined-slip / Fy / yaw integrate (carve-headroom A); uses GripSteer after muF
  "js/physics/ai-drive.js",
  "js/physics/ai-band.js",   // gap catch-up vs scripted fixed pace (carve-headroom D)
  "js/physics/ai-corridor.js",
  "js/camera/offsets.js",
  "js/camera/extra-rigs.js",   // RIVAL LOCK / PIT WALL / DRONE solvers (before vantage)
  "js/camera/flyby-sight.js",   // FlybySight: the flyby planner's (and frame-report's) sightline/occluder model
  "js/camera/flyby-seq.js",
  "js/camera/cam-avoid.js",   // open-circuit wall/building step-in + clearEye for broadcast cams
  "js/camera/trackside.js",   // TRACKSIDE fixed corner cams (CAM_MODES append)
  "js/camera/flyby-panel.js",
  "js/garage/setup-tune.js",
  "js/garage/setup-sheet.js",
  "js/career/experience.js",
  "js/career/career-ui-boot.js", // CareerUI stub; #career body is LAZY_CAREER_UI
  "js/career/season-ui.js",
  "js/ui/flags.js",
  "js/ui/select-screen.js",
  "js/ui/loading-screen.js",
  "js/ui/survey-hud.js",   // APEX_SURVEY_HUD=1: cockpit HUD fixture without race/scenery warm
  "js/ui/scroll-fade.js",
  "js/ui/css-zoom.js",
  "js/ui/sheet-shape.js",
  "js/ui/layers.js",
  "js/ui/modal.js",
  "js/ui/menu-nav.js",
  "js/ui/aria-state.js",
  "js/ui/setting-row.js",
  "js/ui/settings-tabs.js",
  "js/ui/key-binds.js",
  "js/ui/settings-export.js",
  "js/physics/aero-zones.js",
  "js/fx/skidmarks.js",
  "js/fx/car-fx.js",           // CarFx.create(G, { skids }): plank sparks + AI lock-up marks (after skidmarks + particles)
  "js/race/race-control.js",
  "js/race/overtake-mode.js",
  "js/race/sporting-regs.js",  // pure 2026 SR rules (two compounds, SC passes, champ grid); game.js creates its pass watch at eval
  "js/race/broadcast.js",      // Broadcast.create(G, replay): the WATCH timing tower + AUTO director (RealReplay.create makes one)
  "js/camera/director.js",     // Director.create(G): live TV director (CAM_MODES "tv"); reuses Broadcast pure cut policy
  "js/ui/watch-transport.js",
  "js/race/real-replay.js",    // RealReplay.create(G): the field posed from OpenF1 positions — WATCH / HIGHLIGHTS (the director starts it)
  "js/race/real-race.js",      // RealRace.create(G): a real Grand Prix replayed from its timing script (after race-control: it holds its flags)
  // flying-start / start-lights / marshal-panels → LAZY_RACE_SESSION
  "js/race/weather-arc.js",
  "js/camera/photo-kit.js",    // free-cam grids / DoF / bookmarks (before free-cam)
  "js/camera/free-cam.js",
  "js/camera/photo-cam.js",
  "js/camera/replay-buf.js",    // ReplayBuf.create(G): solo 20 s / 30 Hz instant-replay ring + pause scrub
  "js/camera/results-cam.js",   // ResultsCam.create(G): chequered cut, results orbit, highlights reel
  "js/lighting/tuner-panel.js",
  "js/camera/cam-tuner-boot.js", // CamTunerPanel stub; panel body is LAZY_CAM_EDITOR
  "js/physics/brake-cue.js",
  // driving-cues.js is LAZY_AUDIO (SteerTuning and game.js already typeof-guard it).
  "js/input/steer-tuning.js",
  "js/perf/governor.js",
  "js/perf/loop-health.js",
  "js/perf/race-entry-profile.js",
  "js/perf/quality-preset.js",
  "js/perf/renderer-picker.js",
  "js/perf/gfx-debug-overlay.js",
  "js/ui/scale.js",
  "js/ui/dock-layout.js",
  "js/camera/cockpit-opts.js",
  "js/camera/cockpit-preview.js",
  "js/camera/drive-chase.js",      // per-mode live motion (before feel.js dispatches)
  "js/camera/drive-broadcast.js",
  "js/camera/drive-onboard.js",
  "js/camera/feel.js",
  "js/ui/driving-line-opts.js",
  "js/ui/appearance-opts.js",
  "js/ui/hud-elements.js",   // per-element HUD toggles (runtime checklist; body[data-hud-hide])
  "js/ui/hud-tyres.js",      // cold/ok/hot tyre temperature state for GameHud
  "js/ui/hud-damage.js",     // the DAMAGE chip on #hud-damage (paints Damage; display only)
  "js/ui/live-region.js",    // LiveRegion: the one writer of #announce-live (flag > penalty > save > radio > HUD queue)
  "js/ui/hud-readouts.js",   // gap laps, ERS MJ/state, BB, blue flag, race DELTA trace, spoken HUD — for GameHud
  "js/ui/hud-relative.js",   // opt-in RELATIVE box: road neighbours ±2, gaps, laps up/down — for GameHud
  "js/ui/hud-strategy.js",   // opt-in STRATEGY panel: tyre laps, pit loss, next stop, undercut cue — for GameHud
  "js/ui/hud-inputs.js",     // opt-in INPUTS trace: throttle/brake/steer ring buffer on a canvas + gear — for GameHud
  "js/camera/cam-groups.js", // CamGroups: ONBOARD / COCKPIT_LAYOUT camera tables (hud-layout + hud.js read at eval)
  "js/ui/hud-layout.js",     // per-element HUD move/size (profile x cockpit/other layouts); builds DISPLAY › HUD › MOVE & SIZE
  "js/ui/title-layout.js",   // --tl-* tokens at eval (index.html painted the first answer); builds APPEARANCE › TITLE LAYOUT
  "js/ui/pause-opts.js",     // <html data-pause-*> at eval (index.html painted the first answer); APPEARANCE › PAUSE MENU + the QUIT/RESTART confirm
  "js/ui/screen-looks.js",   // <html data-look-*> + --look-* at eval; the per-screen APPEARANCE folds and the see-through PEEK
  "js/ui/debris-opts.js",
  "js/perf/metrics-overlay.js",
  "js/camera/cam-comfort.js", // touch/XR auto comfort preset (before mode-switch boots it)
  "js/camera/vantage.js",
  "js/camera/mode-switch.js",
  // WebXR boot half: SETTINGS › VR rows (call-time; hidden unless caps.vr) and
  // the game.js façade (applyEyes / present no-op until LAZY_XR lands). The
  // session, rig, ENTER VR button and bootPick live in LAZY_XR — title never
  // names them, and a session without navigator.xr never fetches them.
  "js/xr/xr-opts.js",   // SETTINGS › VR rows; call-time GameStore / SettingRow
  "js/xr/xr-boot.js",
  "js/ui/hud.js",
  "js/ui/results-story.js",
  "js/ui/results-sheet.js",
  "js/race/quali-model.js",
  "js/race/daily-challenge.js",
  "js/ui/appearance-studio.js",
  "js/ui/home-world.js",
  "js/ui/photo-studio.js",
  "js/ui/experience.js",
  "js/ui/title-menu.js",
  "js/ui/title-flow.js", // TitleFlow: main-menu race, season, career and ghost entry
  "js/race/quali-net.js",
  "js/race/race-settings.js",
  "js/career/custom-team.js",
  "js/ui/quali-sheet.js",
  "js/ui/onboard.js",
  "js/physics/debris-world.js",
  "js/physics/incident-sim.js",
  "js/physics/contact-geometry.js", // oriented overlap, linear sweep, contact impulse (restitution + Coulomb friction)
  "js/physics/collide.js",   // car-car contact resolver (Collide.create(G, collideFx)), extracted from game.js
  "js/physics/wall-clamp.js", // barrier / pit / gantry hard clamp + human writeback (WallClamp.apply), carve-headroom B
  // agentview* + apex.js are LAZY_AGENT — injected when tests / localhost /
  // ?apex=1 ask for __apex. Not on the player boot wall (PWA memory).
  // Multiplayer wire. Pure logic with no game dependency, so position only
  // has to satisfy "before whatever consumes it" — game.js, last as always.
  "js/car/field-lod.js",  // FieldLod: rival-car distance LOD table + selectors (wheels / flaps / flame / whole-car / shadow casters / mirror cap)
  "js/car/car-draw.js",   // car mesh/atlas caches, decal queue, cockpit rig, planted wheels (CarDraw.create(G, deps)), extracted from game.js
  "js/render/shared/shadow-pass.js",   // sun / car / lamp shadow maps, snap caches, caster pools (ShadowPass.create(G, deps)), extracted from game.js
  "js/render/shared/mirror-pass.js",   // HUD rear-view mirror: second camera + rival poses, gfx.mirrorBegin/End (MirrorPass.create(G, deps))
  "js/ui/platform-session.js", // PlatformSession: platform, phone pairing and tab lifecycle wiring
  "js/ui/update-check.js",  // UpdateCheck: in-session version.json re-check + UPDATE READY chip (call-time; script-loader asks it)
  "js/game.js",
];

// Stylesheet <link> order in index.html.
const CSS = [
  "css/tokens.css", "css/components.css", "css/dialogs.css", "css/settings.css",
  "css/settings-controls.css", "css/dialog-platform.css", "css/tuner.css",
  "css/title.css", "css/menus.css", "css/select.css", "css/race-setup.css",
  "css/carsetup.css", "css/hud.css", "css/fonts-hud.css", "css/touch-controls.css", "css/overlays.css",
  "css/loading.css", "css/responsive.css",
  "css/track-detail.css",   // link order == original style.css source order (cascade-preserving)
  "css/career.css",
  "css/data.css",
  "css/appearance-studio.css", "css/watch-transport.css", "css/career-experience.css",
  "css/garage-experience.css", "css/photo-studio.css", "css/experience.css",
  "css/editor.css",         // the TRACK DESIGNER screen (td-*); deferred like data.css
  "css/cockpit-preview.css",
];
// Title-critical sheets are also <link rel="preload">ed above the stylesheet
// block. Dialogs/settings load print→all without a competing high-priority
// preload (title LCP vs a fast SETTINGS tap: accept no FOUC on a warm cache /
// already-in-flight print sheet, not a second 79 KB of preload contention).
const CSS_PRELOAD = [
  "css/tokens.css", "css/components.css", "css/title.css", "css/menus.css",
  "css/responsive.css",
];
// Sheets that are NOT title-critical load print→all (media="print"
// onload="this.media='all'") so they do not hold LCP; the rest render-block.
// Title paints #overlay / #title / #menu-buttons (tokens, components, title,
// menus, responsive). Everything below is a [hidden] screen or dialog at
// first paint — defer it. Keep every deferred file as rel=stylesheet (sw.js
// essential-set). fonts-hud.css is Barlow + unused Titillium @font-face.
const CSS_DEFERRED = [
  "css/tuner.css", "css/carsetup.css", "css/hud.css", "css/fonts-hud.css", "css/touch-controls.css",
  "css/overlays.css", "css/loading.css",
  "css/track-detail.css", "css/career.css", "css/data.css", "css/editor.css",
  "css/appearance-studio.css", "css/watch-transport.css",
  "css/career-experience.css", "css/garage-experience.css",
  "css/photo-studio.css", "css/experience.css", "css/cockpit-preview.css",
  "css/dialogs.css", "css/settings.css", "css/settings-controls.css",
  "css/dialog-platform.css", "css/select.css", "css/race-setup.css",
];
// Hand comments gen-shell emits inside the index.html script block, keyed by
// the tag they sit before/after. Prose only — the tags themselves are FULL.
const SHELL_NOTES = {
  before: {
    "js/track/circuit-meta.js": "<!-- circuit meta (picker fields) — full defs hydrate via LAZY_CIRCUIT -->",
  },
  after: {
    "js/render/shared/glx-facade.js":
      "<!-- GLX, TLX and WGX implementations have no script tags. game.js injects\n" +
      "     only the selected backend, with GLX available as the lazy fallback. -->\n",
  },
};

// tools/carview.html <script> subset, in order (paths repo-relative; the file
// itself uses ../js/... since it is served from /tools/).
const CARVIEW = [
  "js/core/log.js",
  "js/core/mat4.js",
  "js/render/shared/glx-facade.js",
  "js/render/glx/shaders/glsl-chunks.js",
  "js/render/glx/shaders/glsl-lit.js",
  "js/render/glx/shaders/glsl-sky.js",
  "js/render/glx/shaders/glsl-fx.js",
  "js/render/glx/shaders/glsl-post.js",
  "js/render/shared/light-budget.js",   // LightBudget: the one light-slot budget (glx MAX_LIGHTS, lamp-chunks CAP read it at eval)
  // LightKnobs is the TUNE_DEFS registry PostCommon.knob() reads its defaults
  // from. Without it EVERY post knob resolves to undefined — contrast, vignette,
  // the ACES curve, the lift/gamma/gain triples — and the studio rendered one
  // enormous white radial bloom instead of a car, at every rig and every
  // exposure. Pure data, no dependencies; loads before the post chain reading it.
  "js/lighting/knobs.js",
  "js/render/shared/post-common.js",    // PostCommon: lens-dirt canvas, keepNearest, HDR-grade test, sun-screen, knob defaults — shared by the three post chains
  "js/render/shared/canvas-css-size.js", // CanvasCssSize: cached canvas box + resize/orientation/observer invalidation for all backends
  "js/render/glx/post.js",
  "js/render/glx/shadow.js",
  "js/render/shared/lamp-chunks.js",
  "js/render/shared/frustum.js",
  "js/render/shared/inst-cells.js",  // InstCells: shared cell-set cull cache (GLX+WGX+TLX)
  "js/render/shared/vertex-pack.js",   // VertexPack: the ONE definition of how a world vertex channel is quantised — GLX's interleaved layout plus the snorm/half primitives WGX and TLX pack with
  "js/render/glx/chunked.js",
  "js/render/glx/glx.js",
  "js/data/teams.js",
  "js/car/parts.js",
  "js/car/helmets.js",
  "js/car/car-geometry.js",
  "js/car/car-wheels.js",
  "js/car/car-shade.js",
  "js/car/car3d.js",
  "js/car/liveries.js",
  "js/car/crest-paths.js",
  "js/car/livery-graphics.js",
  "js/car/liverytex.js",
  "js/physics/consts.js",
  "js/car/car-mesh.js",
  "js/camera/cockpit-preview.js",
];

// verify-track.cjs / track-foundation Node-VM subset, in order.
// "@circuits" expands to every file in CIRCUITS_DIR (readdir, sorted — VM
// verification is per-id, so LIST order does not matter there).
const TRACK_VM = [
  "js/core/log.js",
  // mat4.js is not matrix math for the VM's sake — it is the home of the shared
  // scalar helpers (M4.clamp/lerp/wrapDelta), which js/track/ binds at eval.
  // Leaving it out is how the track engine ended up with four private lerps.
  "js/core/mat4.js",
  "js/track/core/geom.js",
  "js/track/core/pit.js",
  "js/track/scenery/data.js",
  "js/track/core/space.js",
  "js/track/core/surface.js",
  "js/track/scenery/models.js",
  "js/track/scenery/graph.js",
  "js/track/scenery/themes.js",
  "js/track/scenery/landmark-kit.js",
  "js/track/scenery/circuit-kit.js",
  "js/track/core/spline.js",
  "js/track/core/line.js",
  "js/track/core/mesh.js",
  "js/track/core/hidden-faces.js",
  "js/track/core/def.js",   // TrackDef: raw def → LIST entry (palettes, realPoints, fromRaw); tracks.js destructures it at eval
  "js/track/scenery/nature.js",
  "js/track/scenery/structures.js",
  "js/track/scenery/city.js",
  "js/track/scenery/identity.js",
  "js/track/scenery/pits.js",
  "js/track/scenery/venue.js",
  "js/track/scenery/build-props.js",
  // The garages ARE the setup screen's bay (GarageScene.buildStatic), placed by
  // js/track/scenery/pits.js at build time; the row is Teams.LIST's. Both load
  // here so a VM build ships the same complex the browser does.
  "js/data/teams.js",
  "js/garage/experience.js",
  "js/garage/scene-prims.js",
  "js/garage/scene-equipment.js",
  "js/garage/scene-live.js",
  "js/garage/scene.js",
  "@circuits",
  "js/track/circuit-elevations.js",
  "js/track/tracks.js",
];

// Eval-time dependencies: [before, after]. Each pair must be ordered in FULL.
const HARD_EDGES = [
  ["js/core/script-loader.js", "js/game.js"],
  ["js/core/lazy-bundles.js", "js/game.js"],
  ["js/core/wake-lock.js", "js/game.js"],
  ["js/race/session-stub.js", "js/game.js"], // stub globals before game.js create() wires
  ["js/render/renderer-boot.js", "js/game.js"],
  ["js/ui/platform-session.js", "js/game.js"],
  ["js/car/car-geometry.js", "js/car/car3d.js"],
  ["js/car/car-wheels.js", "js/car/car3d.js"],
  ["js/car/livery-graphics.js", "js/car/liverytex.js"],
  ["js/input/bindings.js", "js/input/input.js"],
  ["js/input/pad-menu.js", "js/input/input.js"],
  ["js/input/haptics.js", "js/input/input.js"],
  ["js/input/hold-buttons.js", "js/input/input.js"],
  // js/audio's intra-directory pairs moved to LAZY_AUDIO_EDGES when the
  // engine/panel stack left FULL (HARD_EDGES needs both ends in FULL).
  ["js/audio/stub.js", "js/game.js"],   // game.js calls AudioPanel/RadioVoice/Announcer/RivalAudio/CarSfx at eval
  ["js/audio/stub.js", "js/input/steer-tuning.js"], // SteerTuning.create calls DrivingCues.create when present
  ["js/car/car-shade.js", "js/car/car3d.js"],
  ["js/core/store.js", "js/ui/appearance-studio.js"],
  ["js/ui/watch-transport.js", "js/race/real-replay.js"],
  ["js/ui/appearance-studio.js", "js/game.js"],
  ["js/ui/photo-studio.js", "js/game.js"],
  ["js/ui/experience.js", "js/game.js"],
  // js/net's six intra-directory pairs moved to LAZY_NET_EDGES when the
  // multiplayer stack left FULL: a HARD_EDGES pair must have BOTH ends in FULL
  // to be orderable by tag position.
  ["js/core/mat4.js", "js/render/shared/driving-line.js"],           // binds M4.clamp at eval
  // Reads the stored palette / opacity into DrivingLine AT EVAL, so the first
  // frame cannot draw a default the player did not choose.
  ["js/render/shared/driving-line.js", "js/ui/driving-line-opts.js"],
  ["js/core/store.js", "js/ui/driving-line-opts.js"],
  ["js/core/store.js", "js/ui/appearance-opts.js"],
  ["js/ui/setting-row.js", "js/ui/appearance-opts.js"],
  ["js/core/store.js", "js/ui/hud-elements.js"],
  ["js/core/store.js", "js/ui/hud-layout.js"],    // binds GameStore.store and applies the layout at eval
  ["js/camera/cam-groups.js", "js/ui/hud-layout.js"], // camSet reads CamGroups.COCKPIT_LAYOUT at eval
  ["js/camera/cam-groups.js", "js/ui/hud.js"],      // ONBOARD_IDS = CamGroups.ONBOARD at eval
  ["js/ui/hud-tyres.js", "js/ui/hud.js"],
  ["js/ui/hud-readouts.js", "js/ui/hud.js"],      // GameHud.create (game.js eval) builds its lapTrace / speaker
  // js/data/hub.js (LAZY_DATA) binds Dom.el at eval too; dom.js is FULL, so the order holds without an edge.
  ["js/ui/dom.js", "js/career/season-ui.js"],    // season-ui binds Dom.el at eval
  ["js/core/store.js", "js/ui/debris-opts.js"],   // binds GameStore.store at eval
  ["js/core/store.js", "js/ui/title-fx.js"],      // binds GameStore.store and applies data-motion at eval
  ["js/core/store.js", "js/ui/title-layout.js"],  // binds GameStore.store and applies the title layout at eval
  ["js/core/store.js", "js/ui/pause-opts.js"],    // binds GameStore.store and applies data-pause-* at eval
  ["js/core/store.js", "js/ui/screen-looks.js"],  // binds GameStore.store and applies data-look-* at eval
  ["js/core/store.js", "js/career/badges.js"],    // binds GameStore.store at eval
  // M4 is also the home of the shared scalar helpers (clamp/lerp/wrapDelta) and
  // every consumer ALIASES them at eval (`const clamp = M4.clamp;`). mat4.js is
  // the 2nd tag so the order is never in doubt, but these are real eval-time
  // edges and the list is what records them; the toposort check derives the rest.
  ["js/core/mat4.js", "js/game.js"],
  ["js/core/mat4.js", "js/car/input-ghost.js"],                 // aliases M4.clamp at eval
  ["js/core/mat4.js", "js/camera/photo-kit.js"],  // PhotoKit aliases M4.clamp at eval
  ["js/core/mat4.js", "js/camera/free-cam.js"],   // FreeCam aliases M4.clamp at eval
  ["js/roster.js", "js/game.js"],                          // game.js reads ApexRoster's rosters at eval
  ["js/core/mat4.js", "js/track/core/spline.js"],
  ["js/core/mat4.js", "js/track/core/line.js"],                    // TrackLine aliases M4.clamp/lerp at eval
  ["js/core/mat4.js", "js/track/scenery/structures.js"],
  // ["js/core/mat4.js", "js/data/telemetry.js"] was here. telemetry.js is LAZY_DATA
  // now, so the pair crosses rosters and HARD_EDGES cannot order it. The
  // dependency is real and satisfied by CONSTRUCTION rather than by position:
  // mat4.js is the 2nd tag in FULL and the data bundle is injected from a menu
  // click, long after every tag has evaluated.
  // LiveryTex and LightKnobs read the stable GLX mobile tier at evaluation.
  ["js/render/shared/glx-facade.js", "js/car/liverytex.js"],
  ["js/render/shared/glx-facade.js", "js/lighting/knobs.js"],
  // session.js decodes off the same channel as snapshot.js and shares its ONE
  // toView(); the two hand-rolled copies had already diverged over how a
  // DataView argument is handled, which is exactly the bug a shared helper
  // prevents. Call-time, not eval-time, but a session with no NetSnapshot
  // silently drops every state packet rather than throwing — so pin the order.
  // handshake.js calls NetSdp.packChecked/unpack whenever it builds or reads
  // an invite code. Call-time, but a handshake with no NetSdp throws inside
  // the click handler that generates the invite — the one place an error is
  // least visible.
  // lobby.js draws the invite QR through NetQr the moment an invite exists.
  // lobby.js calls NetRendezvous the moment a room-code button is wired.
  // rendezvous.js calls NetNostr whenever no private relay is configured,
  // which is the DEFAULT path — room codes work with nothing deployed.
  // lobby.js creates a NetScan the moment a SCAN button is wired.
  ["js/render/shared/light-budget.js", "js/render/shared/lamp-chunks.js"], // lamp-chunks binds LightBudget.CHUNK at eval
  // GLX subsystem / InstCells edges live in DEFERRED_EDGES — glx.js left FULL.
  ["js/track/core/geom.js", "js/garage/scene-prims.js"],    // the bay's primitives read TrackGeom.MAT at eval for their per-vertex material ids
  ["js/track/core/pit.js", "js/garage/scene-prims.js"],     // the bay's dimensions ARE TrackPit.BAY, read at eval
  ["js/garage/scene-prims.js", "js/garage/scene-equipment.js"],   // the pit equipment destructures GaragePrims at eval
  ["js/garage/scene-prims.js", "js/garage/scene-live.js"],        // the live atlas destructures GaragePrims at eval
  ["js/garage/scene-equipment.js", "js/garage/scene-live.js"],    // ...and GarageEquipment (the timing-screen housing's anchor)
  ["js/garage/scene-prims.js", "js/garage/scene.js"],             // the bay destructures GaragePrims at eval
  ["js/garage/scene-equipment.js", "js/garage/scene.js"],         // ...GarageEquipment (the fan and screen anchors)
  ["js/garage/scene-live.js", "js/garage/scene.js"],              // ...and GarageLive (the atlas size and painters)
  // The garage preview camera eases its flaps at the car's own X_OPEN_RATE /
  // X_CLOSE_RATE, destructured off PhysicsConsts at EVAL time exactly as
  // js/game.js destructures the rest of them.
  ["js/physics/consts.js", "js/garage/setup-camera.js"],
  ["js/track/core/geom.js", "js/track/tracks.js"],               // tracks destructures TrackGeom at eval
  ["js/track/core/spline.js", "js/track/tracks.js"],             // tracks destructures TrackSpline at eval
  ["js/track/core/geom.js", "js/track/core/mesh.js"],                 // mesh destructures TrackGeom at eval
  ["js/track/core/spline.js", "js/track/core/mesh.js"],               // mesh destructures TrackSpline at eval
  ["js/track/core/mesh.js", "js/track/tracks.js"],               // tracks destructures TrackMesh at eval
  ["js/track/core/geom.js", "js/track/core/def.js"],             // def destructures TrackGeom.norm at eval (palettes)
  ["js/track/core/def.js", "js/track/tracks.js"],                // tracks destructures TrackDef at eval (LIST = DEFS.map(fromRaw))
  // build-props.js owns Tracks.buildProps orchestration (Phase 1 peel).
  ["js/core/mat4.js", "js/track/scenery/build-props.js"],        // destructures M4.lerp at eval
  ["js/track/core/geom.js", "js/track/scenery/build-props.js"],  // destructures TrackGeom at eval
  ["js/track/core/spline.js", "js/track/scenery/build-props.js"],
  ["js/track/core/mesh.js", "js/track/scenery/build-props.js"],
  ["js/track/scenery/graph.js", "js/track/scenery/build-props.js"],   // TrackGraph.create at build
  ["js/track/scenery/nature.js", "js/track/scenery/build-props.js"],  // Scenery*.create at build
  ["js/track/scenery/structures.js", "js/track/scenery/build-props.js"],
  ["js/track/scenery/city.js", "js/track/scenery/build-props.js"],
  ["js/track/scenery/identity.js", "js/track/scenery/build-props.js"],
  ["js/track/scenery/pits.js", "js/track/scenery/build-props.js"],    // SceneryPits.build last
  ["js/track/scenery/venue.js", "js/track/scenery/build-props.js"],
  ["js/track/scenery/build-props.js", "js/track/tracks.js"],          // Tracks.build → TrackBuildProps.build
  ["js/track/core/space.js", "js/track/core/surface.js"],
  ["js/track/scenery/models.js", "js/track/scenery/circuit-kit.js"],
  ["js/track/tracks.js", "js/ui/track-maps.js"],               // maps calls Tracks.buildCenterline
  // js/data's own eval-time edges moved to LAZY_DATA_EDGES when the hub left
  // FULL — HARD_EDGES pairs must both be IN FULL to be orderable.
  ["js/physics/consts.js", "js/ui/hud.js"], // hud destructures IDLE_RPM/MAX_RPM at eval
  ["js/camera/mode-switch.js", "js/game.js"],       // game.js destructures CamModes.CAM_MODES at eval
  ["js/camera/director.js", "js/game.js"],          // game.js calls Director.create(G) at eval time
  ["js/camera/replay-buf.js", "js/game.js"],         // game.js calls ReplayBuf.create(G) at eval time
  ["js/camera/results-cam.js", "js/game.js"],        // game.js calls ResultsCam.create(G) at eval time
  ["js/garage/prebuild.js", "js/game.js"],           // game.js calls GaragePrebuild.create(G) at eval time
  ["js/data/teams.js", "js/game.js"],            // game.js destructures Teams (DEFAULT_CUSTOM, TIER_V) at eval
  ["js/physics/consts.js", "js/game.js"],  // game.js destructures PhysicsConsts at eval
  ["js/physics/consts.js", "js/physics/body-attitude.js"], // LAT_MAX read at eval
  ["js/data/teams.js", "js/career/save-migrate.js"], // remapPoints reads Teams (call time; keep ordered)
  ["js/car/parts.js", "js/career/regulations.js"],   // bannedIds() derives the ban from Parts.CATALOG (call time; keep ordered)
  ["js/car/parts.js", "js/career/ai-dev.js"],       // AI winter develops catalog options through Parts
  ["js/data/teams.js", "js/career/ai-dev.js"],
  ["js/core/mat4.js", "js/career/ai-dev.js"],         // aliases M4.clamp at eval
  ["js/career/ai-dev.js", "js/career/career.js"],     // rolloverTeams calls CareerAiDev.developWinter
  ["js/career/save-migrate.js", "js/core/store.js"],
  ["js/career/save-migrate.js", "js/career/career-backup.js"], // migrateCareer on import
  ["js/core/store.js", "js/career/career-backup.js"],          // store.write + keyRevision
  ["js/core/native-download.js", "js/career/career-backup.js"], // Capacitor Share download path
  ["js/data/teams.js", "js/core/store.js"],      // seasonDriverId callers (call time, but keep ordered)
  // liverytex kicks off loadLogos(Teams.LIST ids) at EVAL time — it used to
  // carry its own copy of the roster (a SHORT table that had drifted), and
  // reading the real one makes the order load-bearing rather than tidy.
  ["js/data/teams.js", "js/car/liverytex.js"],
  // crestTraced reads CrestPaths at DRAW time, not eval time, so this is not
  // strictly a hard edge — but a mark that silently falls back to the generic
  // monogram because a tag moved is exactly the kind of quiet regression the
  // load-order guard exists to prevent.
  ["js/car/crest-paths.js", "js/car/liverytex.js"],
  ["js/core/store.js", "js/camera/offsets.js"],  // cam-tune destructures GameStore at eval
  ["js/core/store.js", "js/career/career.js"],    // career destructures GameStore at eval
  ["js/core/store.js", "js/career/season-cal.js"], // season-cal destructures GameStore at eval
  ["js/core/store.js", "js/garage/setup-tune.js"],  // the setup sheet destructures GameStore at eval
  ["js/physics/consts.js", "js/garage/setup-tune.js"],  // …and reads PhysicsConsts.BB_REF at eval
  ["js/career/season-cal.js", "js/career/season-ui.js"], // the screen reads the season rules
  ["js/career/season-ui.js", "js/game.js"],      // game.js calls SeasonUI.create(G) at eval
  ["js/car/parts.js", "js/career/career.js"],     // Career.start seeds owned/fitted from Parts (call time, keep ordered)
  ["js/data/driver-ratings.js", "js/game.js"],   // makeCars reads DriverRatings for every car's skill
  ["js/career/career.js", "js/race/quali-model.js"],    // quali reads Career.rnd/devFor for its spread
  ["js/physics/aero-zones.js", "js/game.js"],      // game.js calls AeroZones.create(G) at eval time
  ["js/fx/skidmarks.js", "js/game.js"],      // game.js calls SkidMarks.create() at eval time
  ["js/fx/car-fx.js", "js/game.js"],         // game.js calls CarFx.create(G, { skids }) at eval time
  ["js/render/shared/mirror-pass.js", "js/game.js"],   // game.js calls MirrorPass.create(G, deps) at eval time
  ["js/race/race-control.js", "js/game.js"],   // game.js calls RaceControl.create(G) at eval time
  ["js/race/sporting-regs.js", "js/game.js"],  // game.js calls SportingRegs.createPassWatch() at eval time
  ["js/core/mat4.js", "js/race/real-replay.js"],   // RealReplay binds M4.clamp at eval
  ["js/race/broadcast.js", "js/race/real-replay.js"],   // RealReplay.create(G) calls Broadcast.create (game.js eval time)
  ["js/race/real-replay.js", "js/race/real-race.js"],   // RealRace.create(G) calls RealReplay.create(G) (game.js eval time)
  ["js/core/mat4.js", "js/race/real-race.js"],   // RealRace binds M4.clamp at eval
  ["js/race/real-race.js", "js/game.js"],      // game.js calls RealRace.create(G) at eval time
  ["js/race/session-entry.js", "js/game.js"], // game.js creates the shared start/quali entry coordinator
  ["js/race/race-control.js", "js/physics/incident-sim.js"], // takeover line crossings share RaceControl semantics
  ["js/race/weather-arc.js", "js/game.js"],    // game.js calls WeatherArc.create(G, deps) at eval time
  // start-lights / marshal-panels → LAZY_RACE_SESSION (ensureRaceSession before startRace)
  ["js/race/daily-challenge.js", "js/game.js"],   // game.js calls DailyChallenge.create(G) at eval time
  ["js/ui/title-menu.js", "js/game.js"],          // game.js calls TitleMenu.create(G) at eval time
  ["js/ui/title-flow.js", "js/game.js"],          // game.js calls TitleFlow.create(G) at eval time
  ["js/race/quali-net.js", "js/game.js"],         // game.js calls QualiNet.create(hooks) after quali wiring
  ["js/race/race-settings.js", "js/game.js"],      // game.js calls RaceSettings.create(G, deps) after quali wiring
  ["js/car/custom-liveries.js", "js/game.js"],    // game.js calls CustomLiveries.create({ store }) at eval time
  ["js/car/liveries.js", "js/car/custom-liveries.js"], // resolve/getLiveries read Liveries at call time; keep ordered
  ["js/data/teams.js", "js/career/custom-team.js"], // DEFAULT_CUSTOM + Teams.LIST
  ["js/career/custom-team.js", "js/game.js"],      // game.js calls CustomTeam.create(hooks) after Menus
  // The track designer's boot half: presets read the ATM/COL packs at eval; the
  // registry binds the store, the engine and the factory at eval and appends the
  // stored customs to Tracks.LIST before game.js reads the saved trackId.
  ["js/track/scenery/data.js", "js/editor/track-themes.js"],
  ["js/core/store.js", "js/editor/custom-tracks.js"],
  ["js/core/hash32.js", "js/editor/custom-tracks.js"],
  ["js/track/tracks.js", "js/editor/custom-tracks.js"],
  ["js/track/core/def.js", "js/editor/custom-tracks.js"],
  ["js/editor/track-themes.js", "js/editor/custom-tracks.js"],
  ["js/editor/props.js", "js/editor/custom-tracks.js"],           // sanitize/canonical props at eval
  ["js/editor/custom-tracks.js", "js/game.js"],    // game.js calls CustomTracks.create(G, { load }) after the DATA door
  ["js/lighting/knobs.js", "js/lighting/track-lights.js"],  // track-lights destructures LightKnobs.LT at eval
  ["js/lighting/knobs.js", "js/lighting/frame-lights.js"],  // frame-lights destructures LightKnobs.LT at eval
  ["js/lighting/knobs.js", "js/lighting/lighting.js"],      // the LightTune façade re-exports TUNE_DEFS/LT at eval
  ["js/lighting/track-lights.js", "js/lighting/lighting.js"],        // …and buildTrackLights/lampStrideNodes
  ["js/lighting/frame-lights.js", "js/lighting/lighting.js"],        // …and setFrameLights/appendCarTailLights
  ["js/lighting/lighting.js", "js/lighting/profiles.js"],  // light-store destructures LightTune's TUNE_DEFS/LT inside create()
  ["js/lighting/profiles.js", "js/game.js"],    // game.js calls LightStore.create(G) at eval time
  ["js/ui/scale.js", "js/game.js"],      // game.js calls UiScale.create(G) at eval time
  ["js/ui/dock-layout.js", "js/game.js"], // game.js calls DockLayout.create(G) at eval time
  ["js/ui/setting-row.js", "js/game.js"],  // game.js wires the Settings rows (SettingRow.wire) at eval time
  ["js/ui/setting-row.js", "js/ui/scale.js"], // UiScale.create wires the RESOLUTION row
  ["js/ui/onboard.js", "js/game.js"],    // game.js calls Onboard.create(G) at eval time
  // reliability → LAZY_RACE_SESSION (Career/Parts are FULL; call-time reads OK after ensure)
  ["js/core/mat4.js", "js/physics/ai-drive.js"],         // AiDrive binds M4.clamp/lerp at eval
  ["js/core/mat4.js", "js/physics/tyre-model.js"],       // TyreModel binds M4.clamp at eval
  ["js/physics/consts.js", "js/physics/tyre-model.js"],  // …and reads PhysicsConsts.BB_REF at eval
  ["js/physics/tyre-model.js", "js/game.js"],            // game.js validates the stored TYRE WEAR level at eval
  ["js/core/mat4.js", "js/physics/grip-steer.js"],       // GripSteer binds M4.clamp/lerp at eval
  ["js/physics/grip-steer.js", "js/physics/player-forces.js"], // PlayerForces.step caps via GripSteer.forPlayer
  ["js/core/mat4.js", "js/physics/player-forces.js"],    // PlayerForces binds M4.clamp at eval
  ["js/physics/consts.js", "js/physics/player-forces.js"], // …and reads PhysicsConsts at eval
  ["js/physics/tyre-model.js", "js/physics/player-forces.js"], // lateralCurve / brakeBeta
  ["js/physics/player-forces.js", "js/game.js"],         // updateCar calls PlayerForces.create(G)

  // pit-lane / engineer / radio → LAZY_RACE_SESSION_EDGES (M4 is FULL; call-time after ensure)
  ["js/core/mat4.js", "js/physics/brake-cue.js"],        // BrakeCue aliases M4.clamp at eval
  ["js/physics/ai-drive.js", "js/physics/contact-geometry.js"],  // the impulse reads AiDrive.bumpRestitution (call time, keep ordered)
  ["js/core/mat4.js", "js/physics/collide.js"],          // Collide binds M4.clamp at eval
  ["js/physics/collide.js", "js/game.js"],                // game.js calls Collide.create(G, …) at eval
  ["js/core/mat4.js", "js/physics/wall-clamp.js"],       // WallClamp binds M4.clamp at eval
  ["js/physics/wall-clamp.js", "js/game.js"],            // updateCar calls WallClamp.apply(…)
  ["js/physics/ai-drive.js", "js/game.js"],         // updateCar calls AiDrive for AI racecraft
  ["js/physics/ai-band.js", "js/game.js"],          // updateCar calls AiBand for pace catch-up
];

// ---------------------------------------------------------------------------
// DEFERRED — js/ files with NO <script> tag, injected at runtime instead.
//
// The stable GLX facade is tagged because eval-time consumers need its device
// tier. All shader/program backends are tagless; game.js injects the selected
// backend, and also GLX if an opt-in renderer refuses or fails to initialise.
//
// The machinery to defer them already existed: game.js resolves `optIn`
// synchronously from localStorage BEFORE it awaits Gfx.create(), and gfx.js
// already treats a missing TLX/WGX global as "not available" (`typeof TLX ===
// "undefined"` / `typeof WGX === "undefined"`). A failed opt-in injection
// then enters the same lazy GLX fallback as an explicit WebGL2 preference.
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
  webgl2: [
    "js/render/glx/shaders/glsl-chunks.js",
    "js/render/glx/shaders/glsl-lit.js",
    "js/render/glx/shaders/glsl-sky.js",
    "js/render/glx/shaders/glsl-fx.js",
    "js/render/glx/shaders/glsl-post.js",
    "js/render/glx/post.js",
    "js/render/glx/shadow.js",
    "js/render/glx/chunked.js",
    "js/render/glx/glx.js",
  ],
  webgpu: [
    "js/render/webgpu/wgsl-chunks.js",
    "js/render/webgpu/wgsl-post.js",
    "js/render/webgpu/wgsl-fx.js",
    "js/render/webgpu/wgx-shadow.js",
    "js/render/webgpu/wgx-chunked.js",
    "js/render/webgpu/wgx-post.js",
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
  "js/agent/agentview-raster.js",
  "js/agent/agentview.js",
  "js/agent/apex.js",
];
const LAZY_EDGES = [
  ["js/agent/agentview-raster.js", "js/agent/agentview.js"],
];

// RACE PAYLOAD. Data a session needs only once a race resolves, never to paint
// a menu — so it must not sit in the boot script wall, which is the one perf
// number this box can measure honestly (docs/PERF-FINDINGS.md §0).
// light-presets.js is 338 KB of baked per-condition lighting whose ONLY reader
// is js/lighting/profiles.js, and that reads window.LightPresets at CALL time
// (base()/layers()), not at eval — so an absent file resolves to TUNE_DEFS
// defaults rather than throwing, and game.js re-applies once it lands.
const LAZY_RACE = [
  "js/lighting/presets.js",
];

// RACE SESSION (~320 KB). Pit lane, radio/coach/engineer, reliability/damage,
// start lights / marshal panels / flying start, session records and duel —
// title never runs a byte of these; the FULL stub (session-stub.js) keeps
// menus from throwing until ensureRaceSession() reinjects via `var`.
// Order IS the eval order. Broadcast / RealReplay / RealRace stay FULL (Data
// Hub WATCH / Director eval SHOTS).
const LAZY_RACE_SESSION = [
  "js/race/reliability.js",
  "js/race/damage.js",
  "js/race/duel.js",
  "js/race/session-records.js",
  "js/race/pit-lane.js",
  "js/race/engineer.js",
  "js/race/radio-lines.js",
  "js/race/race-facts.js",
  "js/race/spotter.js",
  "js/race/race-radio.js",
  "js/race/start-lights.js",
  "js/race/marshal-panels.js",
  "js/race/flying-start.js",
];
const LAZY_RACE_SESSION_EDGES = [
  ["js/race/radio-lines.js", "js/race/race-radio.js"],
  ["js/race/race-facts.js", "js/race/race-radio.js"],
  ["js/race/spotter.js", "js/race/race-radio.js"],
];

// AUDIO ENGINE + PANEL (~449 KB). Title/menus only need the stub in FULL;
// the real WebAudio graph, radio voice, announcer and mixer load on first
// sound gesture or race start (ensureAudio). Order IS the eval order. Exports
// are top-level `var` so reinjection reassigns the stub bindings.
const LAZY_AUDIO = [
  "js/audio/signal.js",
  "js/audio/soundtrack.js",
  "js/audio/radio-fx.js",
  "js/audio/tone-model.js",
  "js/audio/engine.js",
  "js/audio/music-lib.js",
  "js/audio/spotify.js",
  "js/audio/rivals.js",
  "js/audio/car-sfx.js",
  "js/audio/voice-pack.js",
  "js/audio/radio-voice.js",
  "js/audio/announcer-recorded.js",
  "js/audio/announcer.js",
  "js/audio/panel.js",
  "js/audio/driving-cues.js",
];
const LAZY_AUDIO_EDGES = [
  ["js/audio/signal.js", "js/audio/engine.js"],
  ["js/audio/soundtrack.js", "js/audio/engine.js"],
  ["js/audio/radio-fx.js", "js/audio/engine.js"],
  ["js/audio/tone-model.js", "js/audio/engine.js"],
  ["js/audio/engine.js", "js/audio/music-lib.js"],
  ["js/audio/voice-pack.js", "js/audio/radio-voice.js"],
  ["js/audio/radio-voice.js", "js/audio/announcer.js"],
  ["js/audio/announcer-recorded.js", "js/audio/announcer.js"],
  ["js/audio/engine.js", "js/audio/panel.js"],
  ["js/audio/radio-voice.js", "js/audio/panel.js"],
  ["js/audio/announcer.js", "js/audio/panel.js"],
];

// THE DATA HUB (js/data/*), 154 KB behind ONE menu button. Jolpica/OpenF1
// schedule, standings, session results, live timing, telemetry and export — none of
// which a session that never opens DATA will run a byte of. Nothing outside
// js/data/ names any of its eight globals except DataHub.init/.open in
// game.js and a `typeof F1API` read in js/agent/apex.js, so the whole directory
// lifts off the boot wall as one bundle loaded from the #mb-data click.
const LAZY_DATA = [
  "js/data/tab-utils.js",
  "js/data/api-transport.js",
  "js/data/api.js",
  "js/data/telemetry-model.js",
  "js/data/telemetry-render.js",
  "js/data/telemetry-player.js",
  "js/data/telemetry-view.js",
  "js/data/telemetry.js",
  "js/data/export.js",
  "js/data/schedule.js",
  "js/data/standings.js",
  "js/data/results.js",
  "js/data/live.js",
  "js/data/real-race-tab.js",
  "js/data/hub.js",
];
// hub.js calls Data*.create() at EVAL time, so every tab module must have
// evaluated before it — the same meaning HARD_EDGES carries for FULL. These
// pairs moved here from HARD_EDGES when the directory left FULL, and are
// DERIVED from the roster rather than listed: the shape is "everything, then
// the hub", so a hand-written copy can only ever drift out of step with it.
const LAZY_DATA_EDGES = LAZY_DATA.filter((f) => f !== "js/data/hub.js")
  .map((f) => [f, "js/data/hub.js"])
  .concat([
    ["js/data/api-transport.js", "js/data/api.js"],
    ["js/data/tab-utils.js", "js/data/telemetry-model.js"],
    ["js/data/tab-utils.js", "js/data/telemetry-view.js"],
    ["js/data/tab-utils.js", "js/data/live.js"],
    ["js/data/telemetry-model.js", "js/data/telemetry-render.js"],
    ["js/data/telemetry-model.js", "js/data/telemetry-player.js"],
    ["js/data/telemetry-render.js", "js/data/telemetry-player.js"],
    ["js/data/telemetry-model.js", "js/data/telemetry-view.js"],
    ["js/data/telemetry-render.js", "js/data/telemetry-view.js"],
    ["js/data/telemetry-player.js", "js/data/telemetry-view.js"],
    ["js/data/telemetry-model.js", "js/data/telemetry.js"],
    ["js/data/telemetry-render.js", "js/data/telemetry.js"],
    ["js/data/telemetry-player.js", "js/data/telemetry.js"],
    ["js/data/telemetry-view.js", "js/data/telemetry.js"],
  ]);

// THE TRACK DESIGNER (js/editor/*, the part behind the TRACK DESIGNER door).
// The boot half — TrackThemes and the CustomTracks registry — is FULL (the
// picker needs the saved circuits at eval); everything that only matters once
// the designer opens lifts off the boot wall as one bundle: the geometry kit,
// the stamp tools, the randomiser, the validator, the share codec, and (PR4)
// the canvas and the screen. js/editor/custom-tracks.js ensureEditor() loads
// it through game.js's loadBackendScripts, exactly as the DATA door loads
// LAZY_DATA. Order IS the eval order: shape.js first (the others destructure
// TrackShape at eval), the screen last.
const LAZY_EDITOR = [
  "js/editor/shape.js",       // TrackShape: arcs, Dubins, RDP, resample, Menger, crossing + clearance scans
  "js/editor/stamps.js",      // TrackStamps: STRAIGHT / CORNER / HAIRPIN / CHICANE / S-BEND + the Dubins rejoin
  "js/editor/randomise.js",   // TrackRandom: hull + displacement + fixAngles (Maciel), seeded
  "js/editor/validate.js",    // TrackValidate: WYSIWYG rules over Tracks.buildCenterline
  "js/editor/insight.js",     // TrackInsight: TURNS bands, speed profile, passing zones, FIA Grade 1 ambers, TRACK OF THE DAY, START FROM
  "js/editor/fixes.js",       // TrackFixes: one-click remedies for the validator's issues (start, length, spacing, smoothing, bridge, clearance)
  "js/editor/codec.js",       // TrackCodec: APXT1 share code, #track= fragment, file envelope
  "js/editor/scenery-preview.js", // DesignerSceneryPreview: live overhead footprints from theme recipes
  "js/editor/canvas.js",      // DesignerCanvas: the 2D drawing surface (pointer / wheel / keys → callbacks)
  "js/editor/elev-presets.js", // ElevPresets: Flat / Rolling / Hilly → per-node heights[] (no DOM)
  "js/editor/profile.js",     // DesignerProfile: the elevation strip under the canvas (per-node height grips → callbacks)
  "js/editor/selection-panel.js", // DesignerSelection: shared point/range controls
  "js/editor/scenery-panel.js", // DesignerScenery: theme discovery, atmosphere and prop inspector
  "js/editor/designer.js",    // TrackDesigner: the #trackdesigner screen — rail, library, SAVE / RACE; last, it reads every module above at init
];
// stamps / randomise / validate / insight / fixes / canvas / profile destructure TrackShape at eval — the
// same meaning HARD_EDGES carries for FULL, derived so it cannot drift from the
// roster; designer.js (the screen) must follow every other editor module.
// elev-presets is pure (optional CustomTracks.LIMITS at call time) — no shape edge.
const LAZY_EDITOR_EDGES = LAZY_EDITOR.filter((f) => f !== "js/editor/shape.js" && f !== "js/editor/scenery-preview.js" && f !== "js/editor/codec.js" && f !== "js/editor/elev-presets.js" && f !== "js/editor/scenery-panel.js" && f !== "js/editor/selection-panel.js" && f !== "js/editor/designer.js")
  .map((f) => ["js/editor/shape.js", f])
  .concat(LAZY_EDITOR.filter((f) => f !== "js/editor/designer.js").map((f) => [f, "js/editor/designer.js"]));

// WEBXR SESSION (js/xr/* minus the boot façade). ~42 KB behind navigator.xr /
// ENTER VR / an armed apex26.xr — a flat title session runs none of it.
// xr-boot.js / xr-opts.js stay FULL: game.js calls XrBoot every frame (no-op
// until XrSession exists) and SETTINGS paints VR rows at eval.
const LAZY_XR = [
  "js/xr/xr-plan.js",    // XRPlan: pure path selection
  "js/xr/xr-rig.js",     // XrRig: seated eye math
  "js/xr/xr-input.js",   // XrInput: controller → Input.remoteSample
  "js/xr/xr-session.js", // XrSession: immersive-vr owner
  "js/xr/apex-xr.js",    // ApexXR: bootPick / detect (renderer-boot typeof-guards)
  "js/xr/xr-ui.js",      // XrUi: ENTER VR button
];
// Call-time only (mapFrame / start / bootPick); order is the inject order.
const LAZY_XR_EDGES = [
  ["js/xr/xr-plan.js", "js/xr/apex-xr.js"],
  ["js/xr/xr-rig.js", "js/xr/xr-input.js"],
  ["js/xr/xr-rig.js", "js/xr/xr-session.js"],
  ["js/xr/xr-input.js", "js/xr/xr-session.js"],
  ["js/xr/xr-session.js", "js/xr/xr-ui.js"],
  ["js/xr/apex-xr.js", "js/xr/xr-ui.js"],
];

// CAMERA TUNER + FLYBY SHOT EDITOR panels (~48 KB). Pause-menu authoring
// only; title flyby reads FlybyPanel.loadSaved() which stays FULL with the
// shot algebra. Opened from #pm-camtune / #pm-flyby.
const LAZY_CAM_EDITOR = [
  "js/camera/tuner-panel.js",   // CamTunerEditor
  "js/camera/flyby-editor.js",  // FlybyEditor
];
const LAZY_CAM_EDITOR_EDGES = [];

// CAREER screen body (~63 KB). Title buttons call CareerUI.openHub/openSlots
// (FULL stub in career-ui-boot.js); the sheet itself is unreachable until
// CAREER opens. Dom / Career / CareerBackup stay FULL, so the inject needs
// no intra-bundle edges.
const LAZY_CAREER_UI = [
  "js/career/career-ui.js",   // CareerScreen
];
const LAZY_CAREER_UI_EDGES = [];

// MULTIPLAYER (js/net/*). 241 KB of WebRTC — nostr/rendezvous signalling, SDP,
// QR, the transport, handshake, snapshot codec, session, netplay and the VS
// FRIEND lobby — that a solo session never runs a byte of. The biggest single
// block left on the boot wall, and the one that most players never touch.
//
// Unlike js/data this CANNOT simply be absent: netPlay is called at 20 sites in
// js/game.js and only three of them are `netPlay && …` guarded — netPlay.tick
// is in the frame loop. So game.js holds an INERT STUB from boot and swaps in
// the real objects when VS FRIEND opens; see NET_INERT there, and the guard in
// load-order.test.mjs that derives the stub's required surface from the call
// sites rather than from a hand-written roster.
const LAZY_NET = [
  "js/net/bytes.js",        // NetBytes: the one base64url/hex/ascii home (call-time binding, no edge)
  "js/net/nostr.js",
  "js/net/rendezvous.js",
  "js/net/sdp.js",
  "js/net/qr.js",
  "js/net/scan.js",
  "js/net/transport.js",
  "js/net/handshake.js",
  "js/net/lobby-codes.js",  // LobbyCodes: paste/copy/share/scan/QR for invite+answer (before lobby)
  "js/net/snapshot.js",
  "js/net/session.js",
  "js/net/netplay.js",
  "js/net/lobby.js",
  // PHONE AS CONTROLLER rides the same wire (rtc + handshake + rendezvous), so
  // it loads with the stack and ships in the same precache group. Call-time
  // binding only; controller.html's CONTROLLER subset below also carries it.
  "js/input/phone-pad.js",
];

// WORKER SCRIPTS: no <script> tag and never injected into the page — each is
// a `new Worker(url)` entry that importScripts its own list. build-worker.js
// runs the unchanged Tracks.build off the main thread (PROTOTYPE, behind
// apex26.buildWorker; js/track/build-client.js is its page side) and imports
// TRACK_VM, which js/roster.js carries expanded for it.
const LAZY_WORKER = [
  "js/track/build-worker.js",
  "js/workers/bitmap-decode-worker.js",
];

// THE BUILD WORKER'S OWN EXTRAS, imported after TRACK_VM. NOT TRACK_VM itself:
// every Node VM build (verify-track, the audits, the VM tests) reads TRACK_VM
// and runs `assets: false` by design, so adding assets.js there would change
// what every one of them builds. The worker is a browser build and must match
// the page's: without assets.js, bakedModel() returned false in the worker and
// a background build shipped none of the baked pack models (procedural boxes
// where the main-thread build stamps the real ones).
const TRACK_WORKER_EXTRA = [
  "js/render/shared/assets.js",
];

// controller.html (the PHONE AS CONTROLLER page, a root page like bench.html)
// <script> subset, in order: the signalling + transport half of js/net, the
// shared roll math, and the pad module. No game, no renderer, no store.
const CONTROLLER = [
  "js/core/log.js",
  "js/core/hash32.js",      // NetHandshake.offerId: the answer names the offer it answers
  "js/net/bytes.js",
  "js/net/nostr.js",
  "js/net/rendezvous.js",
  "js/net/sdp.js",
  "js/net/transport.js",
  "js/net/handshake.js",
  "js/net/scan.js",         // the pairing screen's SCAN QR CODE (jsQR is injected on demand)
  "js/input/tilt-roll.js",
  "js/input/phone-pad.js",
];
// Eval-time pairs, moved verbatim from HARD_EDGES. Listed, not derived: unlike
// the data hub these are a real graph (rendezvous needs nostr, handshake needs
// sdp, session needs snapshot, the lobby needs qr/scan/rendezvous/lobby-codes),
// not one module gathering the rest.
const LAZY_NET_EDGES = [
  ["js/net/snapshot.js", "js/net/session.js"],
  ["js/net/sdp.js", "js/net/handshake.js"],
  ["js/net/qr.js", "js/net/lobby-codes.js"],
  ["js/net/qr.js", "js/net/lobby.js"],
  ["js/net/rendezvous.js", "js/net/lobby.js"],
  ["js/net/nostr.js", "js/net/rendezvous.js"],
  ["js/net/scan.js", "js/net/lobby-codes.js"],
  ["js/net/scan.js", "js/net/lobby.js"],
  ["js/net/handshake.js", "js/net/lobby-codes.js"],
  ["js/net/lobby-codes.js", "js/net/lobby.js"],
];

const DEFERRED_EDGES = [
  // GLSL files interpolate GLXChunks at evaluation, then core destructures
  // their exports. The pass modules/chunked subsystem precede core init.
  ...["glsl-lit", "glsl-sky", "glsl-fx", "glsl-post"].map((name) =>
    ["js/render/glx/shaders/glsl-chunks.js", `js/render/glx/shaders/${name}.js`]),
  ...["glsl-lit", "glsl-sky", "glsl-fx", "glsl-post"].map((name) =>
    [`js/render/glx/shaders/${name}.js`, "js/render/glx/glx.js"]),
  ...["post", "shadow", "chunked"].map((name) =>
    [`js/render/glx/${name}.js`, "js/render/glx/glx.js"]),
  ["js/render/webgpu/wgsl-chunks.js", "js/render/webgpu/wgsl-post.js"], // string concat at eval
  ["js/render/webgpu/wgsl-chunks.js", "js/render/webgpu/wgsl-fx.js"],
  ["js/render/webgpu/wgsl-post.js", "js/render/webgpu/wgx-post.js"],
  ["js/render/webgpu/wgsl-fx.js", "js/render/webgpu/wgx.js"],
  ["js/render/webgpu/wgx-shadow.js", "js/render/webgpu/wgx.js"],
  ["js/render/webgpu/wgx-chunked.js", "js/render/webgpu/wgx.js"],
  ["js/render/webgpu/wgx-post.js", "js/render/webgpu/wgx.js"],
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
  GAME: "js/game.js",                   // the entry: last FULL tag, owner of `const G`
  GLX: "js/render/glx/glx.js",              // the shipped renderer (game-vm.cjs stubs it)
  APEX_API: "js/agent/apex.js",          // the __apex dev API (LAZY_AGENT; game-vm.cjs hooks ApexApi.create)
  TRACKS_ENGINE: "js/track/tracks.js",
  GLX_CHUNKS: "js/render/glx/shaders/glsl-chunks.js",
  LAMP_CHUNKS: "js/render/shared/lamp-chunks.js",
  FRUSTUM: "js/render/shared/frustum.js",
  GLX_SHADERS_LIT: "js/render/glx/shaders/glsl-lit.js",
  GLX_SHADERS_POST: "js/render/glx/shaders/glsl-post.js", // grade/composite GLSL (image-grade-shaders.test.mjs)
  LIGHT_BUDGET: "js/render/shared/light-budget.js",
  POST_COMMON: "js/render/shared/post-common.js",
  WGSL_CHUNKS: "js/render/webgpu/wgsl-chunks.js",
  WGSL_POST: "js/render/webgpu/wgsl-post.js",
  WGX_SHADOW: "js/render/webgpu/wgx-shadow.js",
  WGX_CHUNKED: "js/render/webgpu/wgx-chunked.js",
  WGX_POST: "js/render/webgpu/wgx-post.js",
  WGX: "js/render/webgpu/wgx.js",
  INST_CELLS: "js/render/shared/inst-cells.js",
  GLTF: "js/render/shared/gltf.js",
  ASSETS: "js/render/shared/assets.js",
  TRACK_SPACE: "js/track/core/space.js",
  TRACK_SURFACE: "js/track/core/surface.js",
  TRACK_MODELS: "js/track/scenery/models.js",
  SCENERY_THEMES: "js/track/scenery/themes.js",
  LANDMARK_KIT: "js/track/scenery/landmark-kit.js",
  CIRCUIT_KIT: "js/track/scenery/circuit-kit.js",
};

const circuitPath = (id) => `${CIRCUITS_DIR}/${id}.js`;
const sceneryPath = (id) => `${SCENERY_DIR}/${id}.js`;
// Authored def filenames in CIRCUITS_DIR (excludes GENERATED meta.js and docs).
const isCircuitDefFile = (name) => typeof name === "string" && name.endsWith(".js") && name !== "meta.js";


// Files moved by tools/gen/move-tree.mjs, old -> new, kept for ONE release so
// tools/ci/deploy.mjs can name the new path when another session's edit to the
// old one conflicts. Prune entries once every in-flight branch has rebased.
const MOVED = {
  "tools/capture/probe-page.mjs": "tools/shot/probe-page.mjs",         // tools/capture/ folded into tools/shot/ 2026-09-10
  "tools/capture/garage-interior.mjs": "tools/shot/garage-interior.mjs",
  "tools/capture/apex-capture.mjs": "tools/shot/apex-capture.mjs",
  "tools/capture/backend-compare.mjs": "tools/shot/backend-compare.mjs",
  "tools/capture/baked-scenery.mjs": "tools/shot/baked-scenery.mjs",
  "tools/capture/motion-capture.mjs": "tools/shot/motion-capture.mjs",
  "tools/capture/shot.mjs": "tools/shot/shot.mjs",
  "tools/apex-eval.mjs": "tools/shot/apex-eval.mjs",
  "tools/agent.mjs": "tools/shot/agent.mjs",
  "tools/profile-gameloop.mjs": "tools/shot/profile-gameloop.mjs",
  "tools/repro-shot.mjs": "tools/shot/repro-shot.mjs",
  "tools/gfx-probe.mjs": "tools/gfx/gfx-probe.mjs",
  "tools/gpu-census.mjs": "tools/gfx/gpu-census.mjs",
  "tools/gpu-game-check.mjs": "tools/gfx/gpu-game-check.mjs",
  "tools/wgpu-flag-test.mjs": "docs/archive/tools/gfx/wgpu-flag-test.mjs",
  "tools/wgx-capture.mjs": "tools/gfx/wgx-capture.mjs",
  "tools/wgx-lavapipe-probe.mjs": "tools/gfx/wgx-lavapipe-probe.mjs",
  "tools/wgx-shot.mjs": "tools/gfx/wgx-shot.mjs",
  "tools/wgx-validate.mjs": "tools/gfx/wgx-validate.mjs",
  "tools/wgx-vid-repro.mjs": "docs/archive/tools/gfx/wgx-vid-repro.mjs",
  "tools/tlx-pack-check.cjs": "tools/gfx/tlx-pack-check.cjs",
  "tools/road-lut-census.mjs": "tools/gfx/road-lut-census.mjs",
  "tools/glx-call-census.mjs": "tools/gfx/glx-call-census.mjs",
  "tools/ssr-probe.mjs": "tools/gfx/ssr-probe.mjs",
  "tools/gltf-selftest.mjs": "tools/gfx/gltf-selftest.mjs",
  "tools/chunk-reach.cjs": "tools/gfx/chunk-reach.cjs",
  "tools/chunk-share-census.mjs": "tools/gfx/chunk-share-census.mjs",
  "tools/mcp-cli.mjs": "tools/mcp/mcp-cli.mjs",
  "tools/mcp-smoke.mjs": "tools/mcp/mcp-smoke.mjs",
  "tools/probe-mcp.py": "tools/mcp/probe-mcp.py",
  "tools/tinyfish-mcp.sh": "tools/mcp/tinyfish-mcp.sh",
  "tools/tinyfish-rpc.py": "tools/mcp/tinyfish-rpc.py",
  "tools/chrome-devtools-mcp.sh": "tools/mcp/chrome-devtools-mcp.sh",
  "tools/playwright-mcp.sh": "tools/mcp/playwright-mcp.sh",
  "tools/apex-tools-mcp.mjs": "tools/mcp/apex-tools-mcp.mjs",
  "tools/apex-tools-mcp.sh": "tools/mcp/apex-tools-mcp.sh",
  "tools/apex-tools-mcp.json": "tools/mcp/apex-tools-mcp.json",
  "tools/cdmcp-bg.mjs": "tools/mcp/cdmcp-bg.mjs",
  "tools/cdmcp-cli.py": "tools/mcp/cdmcp-cli.py",
  "tools/cdmcp-lamps.py": "tools/mcp/cdmcp-lamps.py",
  "tools/cdmcp-lamps-tune.py": "tools/mcp/cdmcp-lamps-tune.py",
  "tools/cdmcp-measure.py": "tools/mcp/cdmcp-measure.py",
  "tools/apex-report.js": "tools/mcp/apex-report.js",
  "tools/report-server.mjs": "tools/mcp/report-server.mjs",
  "tools/ui-readable-survey-mcp.py": "docs/archive/tools/ui-readable-survey-mcp.py",
  "tools/verify-track.cjs": "tools/track/verify-track.cjs",
  "tools/track-verts.cjs": "tools/track/track-verts.cjs",
  "tools/graph-parity.cjs": "tools/track/graph-parity.cjs",
  "tools/float-audit.cjs": "tools/track/float-audit.cjs",
  "tools/float-baseline.json": "tools/track/float-baseline.json",
  "tools/clip-audit.cjs": "tools/track/clip-audit.cjs",
  "tools/clip-baseline.json": "tools/track/clip-baseline.json",
  "tools/coplanar-audit.cjs": "tools/track/coplanar-audit.cjs",
  "tools/coplanar-baseline.json": "tools/track/coplanar-baseline.json",
  "tools/survey-track.mjs": "tools/track/survey-track.mjs",
  "tools/measure-props-over-road.mjs": "tools/track/measure-props-over-road.mjs",
  "tools/startline-probe.cjs": "tools/track/startline-probe.cjs",
  "tools/startline-snap.cjs": "tools/track/startline-snap.cjs",
  "tools/aero-zone-turns.cjs": "tools/track/aero-zone-turns.cjs",
  "tools/rotate-markings.cjs": "tools/track/rotate-markings.cjs",
  "tools/import-circuit-path.mjs": "tools/track/import-circuit-path.mjs",
  "tools/refresh-f1-circuit-reference.mjs": "tools/track/refresh-f1-circuit-reference.mjs",
  "tools/track-accuracy-validator.mjs": "tools/track/track-accuracy-validator.mjs",
  "tools/audit-aero.mjs": "tools/car/audit-aero.mjs",
  "tools/audit-parts.mjs": "tools/car/audit-parts.mjs",
  "tools/parts-sweep.mjs": "tools/car/parts-sweep.mjs",
  "tools/parts-ladder.mjs": "tools/car/parts-ladder.mjs",
  "tools/crest-sweep.mjs": "tools/car/crest-sweep.mjs",
  "tools/logo-authored-sweep.mjs": "tools/car/logo-authored-sweep.mjs",
  "tools/trace-logo.mjs": "tools/car/trace-logo.mjs",
  "tools/cockpit-pale-sweep.mjs": "tools/car/cockpit-pale-sweep.mjs",
  "tools/career-economy.mjs": "tools/car/career-economy.mjs",
  "tools/layout-audit.mjs": "tools/ui/layout-audit.mjs",
  "tools/menu-capture.mjs": "tools/ui/menu-capture.mjs",
  "tools/menu-fit.mjs": "tools/ui/menu-fit.mjs",
  "tools/menu-screens.mjs": "tools/ui/menu-screens.mjs",
  "tools/ui-scale-axis.mjs": "tools/ui/ui-scale-axis.mjs",
  "tools/circuit-axis.mjs": "tools/ui/circuit-axis.mjs",
  "tools/fit-audit.mjs": "tools/ui/fit-audit.mjs",
  "tools/css-play.mjs": "tools/ui/css-play.mjs",
  "tools/lighting-tuner-sweep.mjs": "tools/lighting/lighting-tuner-sweep.mjs",
  "tools/slider-effect.mjs": "tools/lighting/slider-effect.mjs",
  "tools/slider-effect-live.mjs": "tools/lighting/slider-effect-live.mjs",
  "tools/slider-effect-view.py": "tools/lighting/slider-effect-view.py",
  "tools/look-survey-sheet.py": "tools/lighting/look-survey-sheet.py",
  "tools/lighting-campaign/capture.mjs": "tools/lighting/campaign/capture.mjs",
  "tools/lighting-campaign/config.mjs": "tools/lighting/campaign/config.mjs",
  "tools/lighting-campaign/io.mjs": "tools/lighting/campaign/io.mjs",
  "tools/lighting-campaign/metrics.mjs": "tools/lighting/campaign/metrics.mjs",
  "tools/lighting-campaign/tune.mjs": "tools/lighting/campaign/tune.mjs",
  "tools/harness.mjs": "tools/lib/harness.mjs",
  "tools/output-paths.mjs": "tools/lib/output-paths.mjs",
  "tools/game-vm.cjs": "tools/lib/game-vm.cjs",
  "tools/track-build-vm.cjs": "tools/lib/track-build-vm.cjs",
  "tools/webgpu-chrome-args.cjs": "tools/lib/webgpu-chrome-args.cjs",
  "tools/gen-lib.mjs": "tools/gen/gen-lib.mjs",
  "tools/gen-shell.mjs": "tools/gen/gen-shell.mjs",
  "tools/gen-arch-table.mjs": "tools/gen/gen-arch-table.mjs",
  "tools/gen-hooks-table.mjs": "tools/gen/gen-hooks-table.mjs",
  "tools/gen-slider-doc.mjs": "tools/gen/gen-slider-doc.mjs",
  "tools/gen-tools-readme.mjs": "tools/gen/gen-tools-readme.mjs",
  "tools/move-tree.mjs": "tools/gen/move-tree.mjs",
  "tools/assets.mjs": "tools/gen/assets.mjs",
  "tools/import-models.mjs": "tools/gen/import-models.mjs",
  "tools/synth-models.mjs": "tools/gen/synth-models.mjs",
  "tools/bake-elevation.mjs": "tools/gen/bake-elevation.mjs",
  "tools/run-playwright.mjs": "tools/ci/run-playwright.mjs",
  "tools/test-bg.mjs": "tools/ci/test-bg.mjs",
  "tools/test-solo.mjs": "tools/ci/test-solo.mjs",
  "tools/tooling-fast.mjs": "tools/ci/tooling-fast.mjs",
  "tools/verify-change.mjs": "tools/ci/verify-change.mjs",
  "tools/pick-tests.mjs": "tools/ci/pick-tests.mjs",
  "tools/pick-unit-slices.mjs": "tools/ci/pick-unit-slices.mjs",
  "tools/select-specs.mjs": "tools/ci/select-specs.mjs",
  "tools/select-budget.mjs": "tools/ci/select-budget.mjs",
  "tools/select-recall.mjs": "tools/ci/select-recall.mjs",
  "tools/junit-failed.mjs": "tools/ci/junit-failed.mjs",
  "tools/ci-coverage.mjs": "tools/ci/ci-coverage.mjs",
  "tools/ci-verdict.mjs": "tools/ci/ci-verdict.mjs",
  "tools/behind-ship.mjs": "tools/ci/behind-ship.mjs",
  "tools/ci-resolve-before.sh": "tools/ci/ci-resolve-before.sh",
  "tools/ci-select-specs-step.sh": "tools/ci/ci-select-specs-step.sh",
  "tools/test-coverage-audit.mjs": "tools/ci/test-coverage-audit.mjs",
  "tools/test-observed.mjs": "tools/ci/test-observed.mjs",
  "tools/test-honesty.mjs": "tools/ci/test-honesty.mjs",
  "tools/assert-audit.mjs": "tools/ci/assert-audit.mjs",
  "tools/fixture-consumer-audit.mjs": "tools/ci/fixture-consumer-audit.mjs",
  "tools/playwright-occupancy.mjs": "tools/ci/playwright-occupancy.mjs",
  "tools/deploy.mjs": "tools/ci/deploy.mjs",
  "tools/bump-cache.mjs": "tools/ci/bump-cache.mjs",
  "tools/check-gctx.mjs": "tools/check/check-gctx.mjs",
  "tools/scan-globals.mjs": "tools/check/scan-globals.mjs",
  "tools/cross-file-paths.mjs": "tools/check/cross-file-paths.mjs",
  "tools/evaluate-scope-lint.mjs": "tools/check/evaluate-scope-lint.mjs",
  "tools/wait-polling-lint.mjs": "tools/check/wait-polling-lint.mjs",
  "tools/vstd-lint.mjs": "tools/check/vstd-lint.mjs",
  "tools/ratchets.mjs": "tools/check/ratchets.mjs",
  "tools/bloat-scan.mjs": "tools/check/bloat-scan.mjs",
  "tools/trim-comments.mjs": "tools/check/trim-comments.mjs",
  "tools/extract-module.mjs": "tools/check/extract-module.mjs",
  "tools/quick-validate.mjs": "tools/check/quick-validate.mjs",
  "tools/offline-precache-check.cjs": "tools/check/offline-precache-check.cjs",
  "tools/check-physics.mjs": "tools/check/check-physics.mjs",
  "tools/physics-tune-sweep.mjs": "tools/check/physics-tune-sweep.mjs",
  "tools/audio-test.cjs": "tools/check/audio-test.cjs",
  "tools/install-browsers.sh": "tools/env/install-browsers.sh",
  "tools/cloud-agent-install.sh": "tools/env/cloud-agent-install.sh",
  "js/render/lamp-chunks.js": "js/render/shared/lamp-chunks.js",
  "js/render/assets.js": "js/render/shared/assets.js",
  "js/render/gltf.js": "js/render/shared/gltf.js",
  "js/render/glx.js": "js/render/glx/glx.js",
  "js/render/shaders/chunks.js": "js/render/glx/shaders/glsl-chunks.js",
  "js/render/shaders/fx.js": "js/render/glx/shaders/glsl-fx.js",
  "js/render/shaders/lit.js": "js/render/glx/shaders/glsl-lit.js",
  "js/render/shaders/post.js": "js/render/glx/shaders/glsl-post.js",
  "js/render/shaders/sky.js": "js/render/glx/shaders/glsl-sky.js",
  "js/track/spline.js": "js/track/core/spline.js",
  "js/track/mesh.js": "js/track/core/mesh.js",
  "js/track/surface.js": "js/track/core/surface.js",
  "js/track/space.js": "js/track/core/space.js",
  "js/track/geom.js": "js/track/core/geom.js",
  "js/track/scenery-city.js": "js/track/scenery/city.js",
  "js/track/scenery-nature.js": "js/track/scenery/nature.js",
  "js/track/scenery-structures.js": "js/track/scenery/structures.js",
  "js/track/scenery-identity.js": "js/track/scenery/identity.js",
  "js/track/graph.js": "js/track/scenery/graph.js",
  "js/track/models.js": "js/track/scenery/models.js",
  "js/track/themes.js": "js/track/scenery/themes.js",
  "js/track/circuit-kit.js": "js/track/scenery/circuit-kit.js",
  "js/track/landmark-kit.js": "js/track/scenery/landmark-kit.js",
  "js/track/scenery-data.js": "js/track/scenery/data.js",
  "js/game/uilayers.js": "js/ui/layers.js",
  "js/game/topmodal.js": "js/ui/modal.js",
  "js/game/menunav.js": "js/ui/menu-nav.js",
  "js/game/scrollfade.js": "js/ui/scroll-fade.js",
  "js/game/sheetshape.js": "js/ui/sheet-shape.js",
  "js/game/ariastate.js": "js/ui/aria-state.js",
  "js/game/css-zoom.js": "js/ui/css-zoom.js",
  "js/game/hud.js": "js/ui/hud.js",
  "js/game/menus.js": "js/ui/select-screen.js",
  "js/game/results.js": "js/ui/results-sheet.js",
  "js/game/settings-nav.js": "js/ui/settings-tabs.js",
  "js/game/ui-scale.js": "js/ui/scale.js",
  "js/game/dock-layout.js": "js/ui/dock-layout.js",
  "js/track/maps.js": "js/ui/track-maps.js",
  "js/game/garage-scene.js": "js/garage/scene.js",
  "js/game/setup-ui.js": "js/garage/setup-sheet.js",
  "js/game/carmesh.js": "js/car/car-mesh.js",
  "js/car/teams.js": "js/data/teams.js",
  "js/car/driver-ratings.js": "js/data/driver-ratings.js",
  "js/game/apex.js": "js/agent/apex.js",
  "js/game/agentview.js": "js/agent/agentview.js",
  "js/game/agentview-raster.js": "js/agent/agentview-raster.js",
  "js/game/particles.js": "js/fx/particles.js",
  "js/game/skidmarks.js": "js/fx/skidmarks.js",
  "js/game/quali-sheet.js": "js/ui/quali-sheet.js",
  "js/game/light-store.js": "js/lighting/profiles.js",
  "js/game/light-presets.js": "js/lighting/presets.js",
  "js/game/atmosphere.js": "js/lighting/atmosphere.js",
  "js/game/tuner.js": "js/lighting/tuner-panel.js",
  "js/game/cameras.js": "js/camera/vantage.js",
  "js/game/cam-tune.js": "js/camera/offsets.js",
  "js/game/cam-modes.js": "js/camera/mode-switch.js",
  "js/game/cam-tuner.js": "js/camera/tuner-panel.js",
  "js/game/photomode.js": "js/camera/photo-cam.js",
  "js/game/cockpit-opts.js": "js/camera/cockpit-opts.js",
  "js/game/audio.js": "js/audio/engine.js",
  "js/game/audio-panel.js": "js/audio/panel.js",
  "js/game/music-lib.js": "js/audio/music-lib.js",
  "js/game/spotify.js": "js/audio/spotify.js",
  "js/game/perf.js": "js/perf/governor.js",
  "js/game/loop-health.js": "js/perf/loop-health.js",
  "js/game/gfx-quality.js": "js/perf/quality-preset.js",
  "js/game/metrics.js": "js/perf/metrics-overlay.js",
  "js/game/gfx-debug.js": "js/perf/gfx-debug-overlay.js",
  "js/game/input.js": "js/input/input.js",
  "js/game/steer-tuning.js": "js/input/steer-tuning.js",
  "js/game/lighting-knobs.js": "js/lighting/knobs.js",
  "js/game/track-lights.js": "js/lighting/track-lights.js",
  "js/game/frame-lights.js": "js/lighting/frame-lights.js",
  "js/game/lighting.js": "js/lighting/lighting.js",
  "js/game/renderer-picker.js": "js/perf/renderer-picker.js",
  "js/log.js": "js/core/log.js",
  "js/mat4.js": "js/core/mat4.js",
  "js/game/store.js": "js/core/store.js",
  "js/game/physics-consts.js": "js/physics/consts.js",
  "js/game/ai-drive.js": "js/physics/ai-drive.js",
  "js/game/ai-band.js": "js/physics/ai-band.js",
  "js/game/aerozones.js": "js/physics/aero-zones.js",
  "js/game/bodyattitude.js": "js/physics/body-attitude.js",
  "js/game/brake-cue.js": "js/physics/brake-cue.js",
  "js/game/grip-steer.js": "js/physics/grip-steer.js",
  "js/game/driving-cues.js": "js/audio/driving-cues.js",
  "js/game/debrisworld.js": "js/physics/debris-world.js",
  "js/game/incidentsim.js": "js/physics/incident-sim.js",
  "js/game/racecontrol.js": "js/race/race-control.js",
  "js/game/reliability.js": "js/race/reliability.js",
  "js/game/career.js": "js/career/career.js",
  "js/game/career-ui.js": "js/career/career-ui.js",
  "js/game/season-cal.js": "js/career/season-cal.js",
  "js/game/season-ui.js": "js/career/season-ui.js",
  "js/game/quali.js": "js/race/quali-model.js",
};

module.exports = {
  MOVED,
  CIRCUITS, CIRCUITS_DIR, CIRCUIT_META, LAZY_CIRCUIT, FULL, CSS, CSS_PRELOAD, CSS_DEFERRED, SHELL_NOTES, CARVIEW, CONTROLLER, TRACK_VM, HARD_EDGES,
  DEFERRED, DEFERRED_EDGES, LAZY_AGENT, LAZY_EDGES, LAZY_RACE,
  LAZY_RACE_SESSION, LAZY_RACE_SESSION_EDGES,
  LAZY_AUDIO, LAZY_AUDIO_EDGES,
  LAZY_DATA, LAZY_DATA_EDGES, LAZY_NET, LAZY_NET_EDGES, LAZY_WORKER, TRACK_WORKER_EXTRA, LAZY_EDITOR, LAZY_EDITOR_EDGES,
  LAZY_XR, LAZY_XR_EDGES, LAZY_CAM_EDITOR, LAZY_CAM_EDITOR_EDGES,
  LAZY_CAREER_UI, LAZY_CAREER_UI_EDGES,
  SCENERY_DIR, LAZY_SCENERY, sceneryPath,
  PATHS, circuitPath, isCircuitDefFile,
};
