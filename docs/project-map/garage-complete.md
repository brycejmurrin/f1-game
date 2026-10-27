# Garage complete source map

## Evidence and coverage

Read-only source analysis on 2026-10-27 at `212adc24b985b120a63507c988abea69e7740e74`. All 22 files under `js/garage/`, 8,822 physical lines, were read end to end, including embedded Blender tables. Initial oversized combined outputs were discarded as coverage evidence and affected material was reread in bounded, untruncated outputs. The ranges below record the completed reads, not just outlines. SHA-256 identifies the exact bytes reviewed. Read `AGENTS.md`, `.agents/skills/code-nav/SKILL.md`, the applicable game-code rule, manifest edges and the garage GameCtx declarations. This report changes documentation only; no runtime edits, browser runs or commits were made.

| File | Lines | Completed read ranges | SHA-256 |
|---|---:|---|---|
| `js/garage/arrival.js` | 279 | 1–279 | `f4f1f7ba4c7442f6e55ae06c95489843f7a37ad20b44a66b4a0c615a3455eb22` |
| `js/garage/crew-choreo.js` | 137 | 1–24; 25–137 | `94f9cc014018db9a8652efda6d5f391c514c54b5fa4209782cc5ce663bf85b9b` |
| `js/garage/crew-motion.js` | 96 | 1–96 | `9e36704e586ed7318e0b9c2bdd53c9821ef03fdb292d5b656f887dd06df4f768` |
| `js/garage/crew-service.js` | 149 | 1–149 | `0f6150517234fac7461c049235bdb8e4ec3ce7edeb6cbbb4e0cb1a9aa02d4b18` |
| `js/garage/experience.js` | 181 | 1–181 | `d056d7825af79b0a79518aec34e0e3184a134b3a45a6f52fc63418249a51598d` |
| `js/garage/livery-design-editor.js` | 336 | 1–336 | `3136040bffa230743810cc988e9649e7827a525358b6e5b8bd16d0b3dfe59d0a` |
| `js/garage/pit-crew.js` | 63 | 1–63 | `f24bfc6c1a06b83dfb99ff34b201026275d37509e5b12e2e3387bd69d43bd64d` |
| `js/garage/pit-signs.js` | 206 | 1–206 | `1ed76b2fc23db5a41f5fe5612880cd75e5689751de38ae328057a996e665f600` |
| `js/garage/prebuild.js` | 354 | 1–354 | `f747ff4c1359d367a335e45b238e55fe17f47c5ec0179225a8b929bc03b89696` |
| `js/garage/scene-crew.js` | 356 | 1–356 | `49d45c984b35f10ffdce57cdde76814eaea571f8874740ffe123223907195801` |
| `js/garage/scene-dress.js` | 644 | 1–330; 331–644 | `9b4c16e4f14d2669c8320bbe0b14b9d1c4d069260d6ce51c2ba7efbc84a64cee` |
| `js/garage/scene-equipment.js` | 374 | 1–374 | `c0f5d72820c82fb8b049085852f4a0df8b6f5cd65fa5c6504e6459b39f0bef61` |
| `js/garage/scene-live.js` | 215 | 1–215 | `f37ab403ccabe33c92bd23d4088a102897dc028541af839213ecbe00195bd5bf` |
| `js/garage/scene-prims.js` | 314 | 1–314 | `227201c803f8f1db3385016437c72e1c0c6fe38b3eb125a63ef6036f28e1335c` |
| `js/garage/scene.js` | 1532 | 1–400; 401–800; 801–1200; 1201–1532 | `43e2ba3b86ea7e2a74cf2d2d14b45a403d5a515320de597c9170a2d7e3fd20d9` |
| `js/garage/setup-camera.js` | 1153 | 1–400; 401–800; 801–1153 | `15edc407088a93398cfa04a8ec828867e956d2d832c1cfffafb2c94589843637` |
| `js/garage/setup-experiments.js` | 170 | 1–170 | `37f58c215d81e1da25743aafded99336ad06ca13e4101ce930babad038221d4a` |
| `js/garage/setup-presets.js` | 166 | 1–119; 120–166 | `bd0a0203b2971241f7302c9112e426ebb6587259ce2277a2729e5647ba78fc47` |
| `js/garage/setup-sheet.js` | 1725 | 1–350; 351–700; 701–1050; 1051–1400; 1401–1725 | `4c6302ec91946cfb134e8155d314e421844d73524d6f3dac5e679efba699f4da` |
| `js/garage/setup-trials.js` | 145 | 1–145 | `c7599e8cb1fe3c237cd840d1d4cd0d821150de5414480767b488803fb9452921` |
| `js/garage/setup-tune.js` | 153 | 1–153 | `8d9029dab3d314e10ad6a4be8845c5af04176d8ff4945606e326a1c46c0723ae` |
| `js/garage/surface-inspection.js` | 74 | 1–74 | `ba9883e05089ccbc71c9df9af067e67d051fa3f83624c6b33fc5a312236cb690` |

## File ownership

- `arrival.js`: GarageArrival — normalized arrival settings, persisted per-visit crew rotation, pure in/out path poses, angle SVG and sheet playback lifecycle.
- `crew-choreo.js`: GarageCrewChoreo — embedded Blender clips, channel sampling/mirroring, actor buffers, reusable props and optional parent basis.
- `crew-motion.js`: GarageCrewMotion — sampled planted gait, shared seven-mesh articulated body, arm/knee solvers and parent-relative submit.
- `crew-service.js`: GarageCrewService — seven service actors, blankets, rolling chassis-aware jack, connector/hose and engineer choreography.
- `experience.js`: GarageExperience — reversible Home camera sessions, ambient clock, available-pane fit, career stats/comparisons and facility dress.
- `livery-design-editor.js`: GarageLiveryDesignEditor — draft history/compare, area tabs, adjustable patterns, dependency explanations and palette actions.
- `pit-crew.js`: PitCrewAnim — player-only near-box animated pit crew using stopAnim service fraction; static fallback, A/B switch and submit counters.
- `pit-signs.js`: PitSigns — track fascia/board/crest/signal atlas, UVs, GPU upload/free, distance-gated decal submit and counters.
- `prebuild.js`: GaragePrebuild — quiet/menu-gated car/room/program preparation, key readiness, release and tap-to-first-frame telemetry.
- `scene-crew.js`: GarageCrew — persisted crew looks, static posed bodies/tools, lollipop, chassis nose/jack geometry and animated crew dispatch.
- `scene-dress.js`: GarageDress — seat resolution, cached board data, team identity and mechanical-board atlas painters, wall quads and room look builders.
- `scene-equipment.js`: GarageEquipment — reusable procedural workshop equipment recipes and context-aware per-wall equipment assembly.
- `scene-live.js`: GarageLive — 512px map/trace/banner/shadow/lamp-pool/flag atlas and grouped textured quads.
- `scene-prims.js`: GaragePrims — bay dimensions/materials, winding-aware geometry primitives, wall-keyed material guards and persisted room-look table.
- `scene.js`: GarageScene — room cache/resource owner, shell/floor/props/fixtures, mood/light animation, decals/reflection, preview hull and mesh LRUs.
- `setup-camera.js`: SetupCamera — isolated garage render path, camera/gesture state, arrival/drive-out/preview clocks, aero demo, Home framing and prebuild bridge.
- `setup-experiments.js`: SetupExperiments — visit baseline, tune sliders, reversible symptom experiments, aero bench and trial UI lifecycle.
- `setup-presets.js`: SetupPresets — bounded versioned per-team mechanical preset library, context provenance, preview/apply revision guards and UI.
- `setup-sheet.js`: SetupUI — garage tabs, identity/parts/research/budget UI, livery draft conversion/save/preview and exit guards.
- `setup-trials.js`: SetupTrials — session-only baseline/control/candidate receipts, setup ownership, context checks and pause/garage comparison controls.
- `setup-tune.js`: SetupTune — stored normalized mechanical sheet, team defaults, aggregate mods, axle load transfer, rake and brake-bias channels.
- `surface-inspection.js`: GarageSurfaceInspection — transient five-second camera/outline inspection and reversible controls; no paint mutation.

## Architecture and contracts

`game.js:3513` constructs `SetupUI.create(G)`; `3532` constructs `SetupCamera.create(G, deps)` after the shared car-drawing helpers; `3538` constructs `GaragePrebuild.create` with the menu gate, setup camera, idle/slice functions and live UI/studio/world queries. The prebuild wraps the camera renderer with first-frame timing and starts its title poll. The manifest (`tools/manifest.cjs:267`, `311`, `767`) owns script ordering and explicit eval edges: TrackGeom/TrackPit before GaragePrims; primitives before equipment/dress/live/crew; equipment before live; dress/equipment/live before scene; physics constants before camera; store/constants before tune. Do not infer ordering from source headers.

The G contract (`types/game-ctx.d.ts:551`) exposes draft override, mesh bust key, setup-preview enablement and read-only camera/aero/fit telemetry. `G._spMeshKey = ""` is an invalidation request: SetupCamera's setter invokes `spMeshBust`, dropping all six cached preview meshes and deferring old flap cleanup until a newly painted frame has stamped its flap set. `livDraftOverride` carries unsaved paint into the same shared resolver that builds the car. The camera takes stable shared car-drawing functions through `deps`; it does not reach back into game.js scope.

SetupUI writes identity/parts immediately and enforces supplier/team/era/career availability and the fitted cost cap. Permanent incompatible choices are remapped to equivalent universal options with era legality temporarily suspended, then restored in `finally`. A research purchase may succeed while fitting fails; the UI reports that split explicitly. Team/driver identity locks during race pit work and active career contracts. The mechanical sheet is independent of parts/paint; SetupExperiments captures visit baselines and owns reversible experiments, while SetupTune owns normalization and the numerical channels consumed by physics.

Livery editing has one draft schema and one reverse conversion for both live preview and save. Create, edit and copy feed that schema; own-team mark colors are materialized so saved custom paint matches the draft. Every save mints a new livery id to invalidate id-keyed caches. Draft-only atlas keys are dropped without destroying the saved atlas. Atlas-only edits skip mesh rebuilding; other edits bust preview meshes. Color input is debounced 75 ms and flushed at change. Hidden-screen observation, team changes, Escape/CANCEL and guarded footer exits clear the draft. The design-editor WeakMap preserves draft history across DOM rebuilds; write-on-change helpers reduce observer churn. Surface inspection saves/restores camera state and asks the rendering outline adapter for an eligible contour, ending on edit/tab/exit.

SetupCamera owns three playback paths: sheet arrival (`GarageArrival.create`), pre-race drive-out and explicit settings preview. The first uses a bounded wall-gap/render-dt combination; drive-out uses wall time capped to 0.1 s per frame, with held build frames advancing no pose time; explicit preview uses capped render dt. Reduced motion skips automatic sheet arrival, still plays the enabled race drive-out at configured pace, and suppresses decorative ambient motion. Automation skips drive-out. Arrival poses are independent of simulation; crew selection for MIX is memoized per config object and persisted visits rotate across authored crews.

The isolated garage frame does pack gating, mirror stand-down, phone render-scale pinning, input/aero/pose stepping, panel-aware projection, environment begin, room/reflection draw, car/flaps/decals, optional surface outline, glare and present. Panel coverage is signed for left/right docking and uses a separate portrait band. Home temporarily borrows/restores camera state and fits the projected hull into the uncovered pane; photo mode retains user framing and normal resolution. Auto fit caps distance separately from manual zoom. The effective fit/distance/panel fields are telemetry, not new user settings.

GarageScene is the lifetime owner for room meshes, both atlas textures/canvases, dynamic prop meshes and preview LRUs. Geometry, live atlas, dress identity and mechanical boards have distinct cache identities. Geometry rebuild frees replaced meshes while retaining roof and decal geometry where reusable. Texture refill reuses handles when the backend supports it; canvas/upload failures are bounded to three attempts with retry timing. Release frees all room/preview GPU handles, drops canvases/caches and resets readiness. Preview meshes have six LRU slots; hulls have twelve slots and survive hue-only mesh busts. Hull construction uses eight support directions plus monotone-chain hull; the lens recenters the projected silhouette during automatic rotation.

Room walls face inward for a cutaway outside-camera view. Solid props, emissive wall fixtures and double-sided decals use matching per-wall visibility groups. Shutter geometry/branding share its transform; arrival hides the doorway barrier. Floor reflection resolves mirrored car geometry against room depth, then fades with authored floor geometry. Stride-15 light records share fixture anchors, mood gains and per-frame inspection lamp/gantry/pulse updates; zero-energy records are removed before submitting. Live trace uploads tick at 1.5 s desktop / 4 s phone; ambient and studio gates control animation.

Trackside bays reuse `GarageScene.buildStatic`, with cheap optional furniture, rather than the live room renderer. `PitSigns` separately paints track atlas cells and uploads sign/signal meshes. `PitCrewAnim` is another simulation-facing boundary: only a nearby player held in its pit box uses articulated crew. Clip time derives from `G.pits.stopAnim(c).u`; it cannot change stop duration. AI/distant/missing-dependency cases fall through to CarDraw's static crew. Crew rigs and props are cached by team colors/backend. Garage motion uses shared rigid meshes and actor tables; no simulation writes or per-frame mesh generation occur in the choreography sampler.

GaragePrebuild separates CPU preparation from drawn readiness. Title plans depend on the visible Home kind: track Home permits CPU car+room preparation but no hidden frames; garage/studio Home avoids rebuilding the shared room; settings can build and draw both hidden warm frames. Readiness requires matching car/room identity and cached car; title-only `prepped` is insufficient for settings drive-out readiness. Quiet time, hidden tabs, sheets, race starts, software/headless and world warming are blockers; Save-Data and phones/low RAM suppress speculative title retention. Pack settlement gates program frames rather than CPU construction. Release is refused while setup is visible.

Named setups validate all five numerical values, protect incompatible libraries, cap at twelve entries, store provenance, and guard preview/apply/delete with key revisions and value comparisons. SetupTrials additionally owns its temporary setup write, restores only while still owner, binds launch callbacks to the current run, checks static/dynamic context and excludes unclean attempts. A conclusion requires three clean baseline/control/candidate attempts, context consistency and repeatable identical-setup control; receipts remain session-only.

## LSP consumer evidence

Used checkout-local `bash tools/mcp/lsp-mcp.sh` (the code-nav fallback) for symbol-aware references/definitions; no grep-derived symbol call graph. File-count pages were complete (no offset needed). References include definitions/exports, so totals are navigation evidence rather than counts of runtime calls.

| Symbol | Reference result | Consumers outside its own implementation |
|---|---|---|
| GarageScene | 56 refs / 7 files | setup-camera, setup-sheet, prebuild, agent/apex, track/scenery/pits, game |
| SetupCamera | 3 / 2 | game |
| SetupUI | 2 / 2 | game |
| SetupTune | 70 / 10 | experiments, presets, sheet, trials, game, physics/player-forces, race/setup-trial-session, ui/settings-export, ui/hud |
| PitSigns | 17 / 5 | track/build-client, track/tracks, game, agent/apex |
| SetupTrials | 22 / 4 | race/driving-coach, experiments, game |
| GarageArrival | 10 / 2 | setup-camera |
| GarageCrewChoreo | 24 / 5 | arrival, scene-crew, pit-crew, crew-motion |
| GarageCrewMotion | 13 / 5 | scene-crew, crew-service, pit-crew, crew-choreo |
| GarageCrewService | 6 / 2 | scene-crew |
| GarageExperience | 15 / 6 | setup-camera, scene, sheet, dress, ui/experience |
| GarageLiveryDesignEditor | 5 / 2 | setup-sheet |
| GarageCrew | 16 / 4 | scene, sheet, pit-crew |
| GarageDress | 9 / 2 | scene |
| GarageEquipment | 19 / 3 | scene, live |
| GarageLive | 4 / 2 | scene |
| GaragePrims | 26 / 12 | garage scene/crew/dress/equipment/live/experience/sheet, car/car-mesh |
| SetupExperiments | 3 / 2 | setup-sheet |
| SetupPresets | 7 / 3 | ui/settings-export, setup-experiments |
| GarageSurfaceInspection | 17 / 3 | setup-sheet, setup-camera |

Member queries corroborated `GarageScene.buildStatic` → `SceneryPits.bayMesh` at `js/track/scenery/pits.js:38,44`; `PitCrewAnim.draw` → `CarDraw.drawPitCrew` at `js/car/car-draw.js:1748`; `SetupTune.axleGrip` → `PlayerForces.step` at `js/physics/player-forces.js:207`; `GaragePrebuild.create` → `game.js:3538`; and the two create seams above. `G._spMeshKey` resolved to the GameCtx declaration at line 553. `Parts.resolveSetup` definition returned `js/car/parts.js:883–907`, including its optional tune multiplier at 904–905. Duplicate `window` export declarations for GarageScene/Prims/Equipment/Live were explicitly distinguished by the LSP declaration location; results above target the lexical module declaration.

## Corroborated comment discrepancies

These are source/documentation discrepancies, not browser-verified visual defects. No source was changed.

- `scene-prims.js:168–170` says shared material ids are read lazily and need no HARD_EDGES pair. The following top-level `const MAT` reads TrackGeom immediately, and `tools/manifest.cjs:767` explicitly lists that eval dependency. The file header already states eval-time behavior correctly.
- `pit-signs.js:154–155` calls the second mesh RED aspects drawn only under a red flag. `draw` at 197–198 instead overlays it when `called` is true, and the atlas/signal comments specify GREEN call-in aspects. The upload comment describes the opposite behavior.
- `scene.js:1352–1355` says the pruning pass uses four axis-extreme points and a quadrilateral. The body at 1362 onward uses `M = 8`, eight directions and octagon edge tests; the adjacent newer comment explains why four retained too many corners.
- `setup-camera.js:345–347` says default orbit/aim reproduce old separate offset numbers exactly. The next explanatory block and `SP_CAR_CTR = [0, 0.45, 0.245]` instead deliberately unify orbit and aim at the measured car center. The introductory compatibility statement is superseded.
- `setup-camera.js:177` calls drive-out advancement clamped frame dt. `stepDriveOut` at 185 derives `gap` from `performance.now()` and caps wall-gap credit to 0.1 s. Its following comment documents the newer wall-clock behavior correctly. Explicit preview remains render-dt based, unlike the current sheet-arrival wall-gap hybrid, so `225–226`'s “as the WORK ON CAR arrival runs” comparison is also stale.
- `scene-dress.js:289–290` promises the same stat numbers as the DOM panel. `boardInfo` at 48 resolves parts without the optional tune argument; `setup-sheet.js:29–30` passes `SetupTune.mods(team.id)` into the DOM stat calculation. LSP's `Parts.resolveSetup` body confirms tune is applied only when supplied. Therefore the promise is not generally true after mechanical tuning; this is a concrete contract discrepancy requiring a scoped follow-up, not a measured rendering claim.
- GameCtx's `spEffFit` comment (`types/game-ctx.d.ts:562`) says the telemetry is before its cap/clamp, while `setup-camera.js:786` assigns the already `Math.min(SP_FIT_DIST_MAX, …)`-capped fit (or capped Home fit) to `_spEffFit`. The report records the source behavior rather than the declaration comment.

## Verification boundary

Full source read and LSP navigation complete for the listed byte hashes. No rendering, timing, memory census, gameplay or browser behavior was executed or asserted. Existing test names in comments are navigation pointers, not results from this audit. Documentation integrity checks are left to the parent task's combined docs-only verification pass.
