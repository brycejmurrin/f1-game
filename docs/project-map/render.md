# Render, car, camera and performance map

## Goal
Map the render-side subsystems from current source, with bounded inspection and explicit limits. This is a navigation map, not a runtime certification or exhaustive code review.

## Source identity
- Checkout: `/workspace/f1-game`; branch `cursor/project-map-a84f`.
- Inspected HEAD: `ae73c67669bbb7fe4b54f58f78bcfb9c8b00aebb` (2026-10-27 UTC).
- Read repository `AGENTS.md` and `.claude/skills/code-nav/SKILL.md`; used attached apex-lsp for named-symbol navigation. No browser, tests, backend initialization or source changes in this lane.

## Inventory
Recursive `*.js` inventory: render 47 files / 43,863 lines; car 24 / 20,586; camera 28 / 10,485; perf 20 / 7,277. Counts describe this checkout, not a ratchet. Every file appears below. Most large implementations remain unread.

## Architecture and data flow
- Renderer selection: `RendererBoot.create(deps).start()` resolves storage preference, probes adapters, injects deferred files from `ApexRoster.DEFERRED`, then invokes `Gfx.create`. The unset UI boot preference is THREE only when an adapter resolves; otherwise GLX. Explicit THREE can still select TLX, whose documented internal fallback is WebGL2. WGX is opt-in. Factory failure returns null; boot owns fallback and unavailable UI.
- Canvas initialization is leased: `Gfx.createInitOwner` proxies context access and canvas writes, tracks claims, and can synchronously revoke them. A backend returning after revocation is discarded using dispose/destroy when available. This is visible source behavior; browser cancellation itself is not established.
- The seam documented in `gfx.js` centralizes opaque mesh/texture resources and frame order: shadow passes, optional probe/mirror, begin, opaque draws, sky, glow, present. The shared directory holds backend-neutral math, resource preparation and pass orchestration. GLX owns raw WebGL2 and GLSL; TLX owns Three/TSL; WGX owns WebGPU/WGSL. Backend implementation parity was not checked.
- Car source headers and LSP show procedural mesh data from `Car3D.build`, geometry/material/wheel helpers, renderer-bound mesh creation via `CarMesh`, and bounded caches/submission through `CarDraw.create(G,deps)`. `CarDraw` receives state through the game facade, including graphics, cars, camera, track and race state. Livery atlas/decal, helmets, parts and ghost systems sit alongside geometry; their bodies remain mostly unread.
- `CamModes` defines an append-only persisted mode index and owns camera controls and temporary camera ownership. `GameCams.vantage` is the pose solver used by game and mirror code (LSP evidence below). The three `Drive*` helpers inspected fully return FOV deltas and do not mutate eye/target. Free/photo/results/replay/flyby modules are separate camera concerns; only their names/headers were inventoried.
- `PerfGov` describes a two-stage controller (render scale, then feature tiers) and a crash sentinel. Its outline exposes frame statistics, tier controls, crash/recovery and thermal controls. `RenderRate` independently gates rendered frames: auto half-rate on fast phone displays; explicit half/45/30 modes; XR bypass. It accumulates skipped elapsed time and exposes the preceding draw verdict for governor accounting. Game-loop integration was not fully read.

## File-by-file coverage
“Header sample” means at most the first three lines were mechanically extracted; body unread. Some combined tool output was truncated, so the conservative default below is metadata/header sample, not a claim that all header text reached the reviewer. “Full” means complete visible body. Line numbers are inclusive.

| File | Lines | Coverage |
|---|---:|---|
| `js/render/gfx.js` | 318 | Full |
| `js/render/glx/chunked.js` | 848 | Metadata/header sample; body unread |
| `js/render/glx/glx.js` | 2887 | Metadata/header sample; body unread |
| `js/render/glx/post.js` | 1354 | Metadata/header sample; body unread |
| `js/render/glx/shaders/glsl-chunks.js` | 69 | Metadata/header sample; body unread |
| `js/render/glx/shaders/glsl-fx.js` | 327 | Metadata/header sample; body unread |
| `js/render/glx/shaders/glsl-lit.js` | 2295 | Metadata/header sample; body unread |
| `js/render/glx/shaders/glsl-post.js` | 1620 | Metadata/header sample; body unread |
| `js/render/glx/shaders/glsl-sky.js` | 460 | Metadata/header sample; body unread |
| `js/render/glx/shadow.js` | 409 | Metadata/header sample; body unread |
| `js/render/glx/soft.js` | 216 | Metadata/header sample; body unread |
| `js/render/renderer-boot.js` | 533 | Partial: 1–320 (output beyond this was truncated; tail unread) |
| `js/render/shared/assets.js` | 1011 | Metadata/header sample; body unread |
| `js/render/shared/canvas-css-size.js` | 68 | Metadata/header sample; body unread |
| `js/render/shared/chunk-bins.js` | 97 | Metadata/header sample; body unread |
| `js/render/shared/compatibility-recovery.js` | 123 | Metadata/header sample; body unread |
| `js/render/shared/driving-line.js` | 288 | Metadata/header sample; body unread |
| `js/render/shared/frustum.js` | 126 | Metadata/header sample; body unread |
| `js/render/shared/gltf.js` | 483 | Metadata/header sample; body unread |
| `js/render/shared/glx-facade.js` | 26 | Full |
| `js/render/shared/inst-cells.js` | 80 | Metadata/header sample; body unread |
| `js/render/shared/lamp-chunks.js` | 313 | Metadata/header sample; body unread |
| `js/render/shared/light-budget.js` | 31 | Full |
| `js/render/shared/mirror-pass.js` | 830 | Metadata/header sample; body unread |
| `js/render/shared/post-common.js` | 215 | Metadata/header sample; body unread |
| `js/render/shared/puddles.js` | 93 | Metadata/header sample; body unread |
| `js/render/shared/shadow-pass.js` | 725 | Metadata/header sample; body unread |
| `js/render/shared/vertex-pack.js` | 143 | Metadata/header sample; body unread |
| `js/render/three/tlx-chunked.js` | 772 | Metadata/header sample; body unread |
| `js/render/three/tlx-post.js` | 1312 | Metadata/header sample; body unread |
| `js/render/three/tlx-shadow.js` | 970 | Metadata/header sample; body unread |
| `js/render/three/tlx.js` | 6854 | Metadata/header sample; body unread |
| `js/render/three/tsl-chunks.js` | 61 | Metadata/header sample; body unread |
| `js/render/three/tsl-fx.js` | 417 | Metadata/header sample; body unread |
| `js/render/three/tsl-lit.js` | 2957 | Metadata/header sample; body unread |
| `js/render/three/tsl-post.js` | 1268 | Metadata/header sample; body unread |
| `js/render/three/tsl-sky.js` | 800 | Metadata/header sample; body unread |
| `js/render/three/tsl-viewport.js` | 124 | Metadata/header sample; body unread |
| `js/render/webgpu/wgsl-chunks.js` | 2636 | Metadata/header sample; body unread |
| `js/render/webgpu/wgsl-fx.js` | 551 | Metadata/header sample; body unread |
| `js/render/webgpu/wgsl-post.js` | 1494 | Metadata/header sample; body unread |
| `js/render/webgpu/wgx-chunked.js` | 508 | Metadata/header sample; body unread |
| `js/render/webgpu/wgx-debug-labels.js` | 117 | Metadata/header sample; body unread |
| `js/render/webgpu/wgx-post.js` | 209 | Metadata/header sample; body unread |
| `js/render/webgpu/wgx-roadlut.js` | 180 | Metadata/header sample; body unread |
| `js/render/webgpu/wgx-shadow.js` | 560 | Metadata/header sample; body unread |
| `js/render/webgpu/wgx.js` | 6085 | Metadata/header sample; body unread |
| `js/car/car-body-geom.js` | 2184 | Metadata/header sample; body unread |
| `js/car/car-draw.js` | 2174 | Partial: 1–85 |
| `js/car/car-geometry.js` | 425 | Metadata/header sample; body unread |
| `js/car/car-material-shade.js` | 198 | Metadata/header sample; body unread |
| `js/car/car-materials.js` | 218 | Metadata/header sample; body unread |
| `js/car/car-mesh.js` | 2105 | Partial: 1–100 |
| `js/car/car-shade.js` | 892 | Metadata/header sample; body unread |
| `js/car/car-wheels.js` | 724 | Metadata/header sample; body unread |
| `js/car/car3d.js` | 2899 | Partial: LSP first 25 exports only |
| `js/car/crest-draw.js` | 481 | Metadata/header sample; body unread |
| `js/car/crest-paths.js` | 85 | Metadata/header sample; body unread |
| `js/car/custom-liveries.js` | 196 | Metadata/header sample; body unread |
| `js/car/field-lod.js` | 136 | Partial: tail visible in truncated combined output; conservatively partial |
| `js/car/ghost-share.js` | 395 | Metadata/header sample; body unread |
| `js/car/ghost.js` | 413 | Metadata/header sample; body unread |
| `js/car/helmets.js` | 898 | Metadata/header sample; body unread |
| `js/car/input-ghost.js` | 608 | Metadata/header sample; body unread |
| `js/car/liveries.js` | 669 | Metadata/header sample; body unread |
| `js/car/livery-design.js` | 377 | Metadata/header sample; body unread |
| `js/car/livery-graphics.js` | 507 | Metadata/header sample; body unread |
| `js/car/livery-stations.js` | 192 | Metadata/header sample; body unread |
| `js/car/liverytex.js` | 2676 | Metadata/header sample; body unread |
| `js/car/parts.js` | 1043 | Metadata/header sample; body unread |
| `js/car/surface-outline.js` | 91 | Metadata/header sample; body unread |
| `js/camera/cam-avoid.js` | 98 | Metadata/header sample; body unread |
| `js/camera/cam-comfort.js` | 132 | Metadata/header sample; body unread |
| `js/camera/cam-groups.js` | 44 | Metadata/header sample; body unread |
| `js/camera/cam-tuner-boot.js` | 34 | Metadata/header sample; body unread |
| `js/camera/cockpit-finishes.js` | 74 | Metadata/header sample; body unread |
| `js/camera/cockpit-opts.js` | 404 | Metadata/header sample; body unread |
| `js/camera/cockpit-preview.js` | 179 | Metadata/header sample; body unread |
| `js/camera/director.js` | 265 | Metadata/header sample; body unread |
| `js/camera/drive-broadcast.js` | 34 | Full |
| `js/camera/drive-chase.js` | 24 | Full |
| `js/camera/drive-onboard.js` | 23 | Full |
| `js/camera/extra-rigs.js` | 328 | Metadata/header sample; body unread |
| `js/camera/feel.js` | 459 | Metadata/header sample; body unread |
| `js/camera/flyby-editor.js` | 666 | Metadata/header sample; body unread |
| `js/camera/flyby-panel.js` | 387 | Metadata/header sample; body unread |
| `js/camera/flyby-seq.js` | 2145 | Metadata/header sample; body unread |
| `js/camera/flyby-sight.js` | 606 | Metadata/header sample; body unread |
| `js/camera/fov-fit.js` | 82 | Metadata/header sample; body unread |
| `js/camera/free-cam.js` | 524 | Metadata/header sample; body unread |
| `js/camera/mode-switch.js` | 305 | Partial: 1–305 visible in combined output; conservatively partial |
| `js/camera/offsets.js` | 721 | Metadata/header sample; body unread |
| `js/camera/photo-cam.js` | 296 | Metadata/header sample; body unread |
| `js/camera/photo-kit.js` | 189 | Metadata/header sample; body unread |
| `js/camera/replay-buf.js` | 559 | Metadata/header sample; body unread |
| `js/camera/results-cam.js` | 281 | Metadata/header sample; body unread |
| `js/camera/trackside.js` | 140 | Metadata/header sample; body unread |
| `js/camera/tuner-panel.js` | 518 | Metadata/header sample; body unread |
| `js/camera/vantage.js` | 968 | Partial: LSP outline only |
| `js/perf/bench-capture.js` | 344 | Metadata/header sample; body unread |
| `js/perf/bench-run.js` | 592 | Metadata/header sample; body unread |
| `js/perf/gfx-debug-overlay.js` | 291 | Metadata/header sample; body unread |
| `js/perf/gfx-escalation.js` | 114 | Metadata/header sample; body unread |
| `js/perf/governor.js` | 1244 | Partial: 1–80 + LSP first 25 exports |
| `js/perf/gpu-test-run.js` | 197 | Metadata/header sample; body unread |
| `js/perf/loop-health.js` | 225 | Metadata/header sample; body unread |
| `js/perf/menu-quit-tail.js` | 29 | Metadata/header sample; body unread |
| `js/perf/menu-teardown.js` | 104 | Metadata/header sample; body unread |
| `js/perf/metrics-overlay.js` | 1201 | Metadata/header sample; body unread |
| `js/perf/phone-recorder.js` | 524 | Metadata/header sample; body unread |
| `js/perf/quality-preset.js` | 259 | Metadata/header sample; body unread |
| `js/perf/race-entry-profile.js` | 453 | Metadata/header sample; body unread |
| `js/perf/render-rate.js` | 135 | Full |
| `js/perf/renderer-picker.js` | 978 | Metadata/header sample; body unread |
| `js/perf/soak-run.js` | 166 | Metadata/header sample; body unread |
| `js/perf/spans.js` | 129 | Metadata/header sample; body unread |
| `js/perf/thermal-drift.js` | 64 | Metadata/header sample; body unread |
| `js/perf/three-inspector.js` | 121 | Metadata/header sample; body unread |
| `js/perf/title-warm.js` | 107 | Metadata/header sample; body unread |

## LSP evidence
Attached `f1_cloud_mcp_apex_lsp` tools returned:
- `lsp_outline(file: js/render/gfx.js, limit:40)`: Gfx at 217; exports createInitOwner at 239 and create at 267; two internals.
- `lsp_outline(file: js/car/car3d.js, limit:25)`: 49 exports, 68 internals; build at 237, buildComplete at 2867; output explicitly has seven more rows beyond page. Only this first page inspected.
- `lsp_outline(file: js/camera/vantage.js, limit:25)`: GameCams with 19 exports / 69 internals; vantage at 441, listener basis and viewmodel helpers. Internals not requested.
- `lsp_outline(file: js/perf/governor.js, limit:25)`: PerfGov with 35 exports / 76 internals; tick at 669; 12 more rows beyond page. No inference of exhaustive API coverage.
- `lsp_references(Gfx.create, files:true)`: 3 references in 2 files: gfx.js (2), renderer-boot.js (1), query at renderer-boot.js:319:71. This supports extracted boot orchestration.
- `lsp_references(GameCams.vantage, files:true)`: 4 references in 3 files: vantage.js (2), game.js (1), mirror-pass.js (1). This establishes a mirror integration edge, not its correctness.

## Comment findings with proof
1. **Stale ownership wording in renderer seam.** `js/render/gfx.js:15–23` says game.js injects backends and owns fallback; actual observed `js/render/renderer-boot.js:283–319` picks the roster group, fetches it and calls the factory. LSP finds its only external factory use in renderer-boot.js. Update the header to distinguish top-level game ownership from extracted implementation. No runtime defect inferred.
2. **Default selection comment needs the boot qualification.** `js/render/gfx.js:5–6` describes THREE as the unset default; `js/render/renderer-boot.js:224–230` explicitly changes unset THREE to WebGL2 when adapter probing fails. Direct Gfx callers do default to THREE (`gfx.js:273–279`), so neither comment alone explains the two levels. Clarify the difference instead of changing behavior.
3. **Literal truncated documentation.** `js/car/car-mesh.js:1` ends with `the effe…`; this is present in the actual first-line source output, not just tool truncation. It omits the remainder of the module responsibility description and is a useful small documentation repair candidate.
4. **Supported load-bearing explanation.** `js/camera/drive-chase.js:1–5` claims lens-only behavior; complete `apply` returns arithmetic deltas and never assigns eye/tgt. Same pattern verified in complete onboard and broadcast helpers. Preserve that separation when changing camera feel.
5. **Speculative cache assertion requires measurement.** `js/car/car-mesh.js:11–16` explains FIFO and claims its 24-entry eviction cap is never reached in practice. The cap/comment are visible, but workload evidence and all insertion paths were not inspected. Treat “never” as an unverified performance assumption rather than a proven invariant.

## Risks/unknowns
- This scope exceeds 82,000 source lines; shaders and all three renderer cores were not read. No GPU, visual, memory or backend parity conclusions follow from this map.
- GPU availability, canaries, storage exceptions, deferred loading and init-timeout ownership form interacting state machines. Only initial boot source was inspected, not full recovery/present lifetimes.
- LSP results describe the connected F1 workspace; symbol locations matched inspected files, but this lane did not independently prove server HEAD identity. Local HEAD is recorded above.
- Car caches, decal anchors, LOD thresholds, material parity, atlas lifetime and mirror batching need targeted follow-up. Outlines/headers do not establish disposal correctness.
- Camera saved indices are a compatibility contract; temporary-owner priorities and replay/XR interactions need full integration review before changes.
- Governor timing and rate-gate integration are not validated by reading helper source. No tests were run in this lane; parent owns documentation verification.

## Next steps
1. Follow boot start/proved/recovery to completion and inspect fallback/context-claim tests before changing renderer selection.
2. Read each backend lifecycle/pass implementation against the seam, including `free*`, resize and present behavior; run backend-specific live gates only in the parent lane.
3. Follow CarDraw cache insertion/eviction/clear and CarMesh decal insertion paths with LSP before investigating memory or first-race stalls.
4. Follow GameCams.vantage callers and complete PerfGov.tick with game-loop timing before camera or cadence changes.
5. Repair the proven header issues as a separately scoped documentation change; retain source behavior until validated.
