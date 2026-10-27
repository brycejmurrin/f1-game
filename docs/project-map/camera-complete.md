# Camera complete source map

## Source and coverage
GPT-6.1 Sol complete_car_camera fully read all 28 camera files at c4dc493d9. Source lines were read in bounded untruncated chunks, with module-level LSP references for every file. No source/browser changes. Parent persists agent report due old read-only agent mount.

| File | Lines | Coverage |
|---|---:|---|
| js/camera/cam-avoid.js | 98 | Full |
| js/camera/cam-comfort.js | 132 | Full |
| js/camera/cam-groups.js | 44 | Full |
| js/camera/cam-tuner-boot.js | 34 | Full |
| js/camera/cockpit-finishes.js | 74 | Full |
| js/camera/cockpit-opts.js | 404 | Full |
| js/camera/cockpit-preview.js | 179 | Full |
| js/camera/director.js | 265 | Full |
| js/camera/drive-broadcast.js | 34 | Full |
| js/camera/drive-chase.js | 24 | Full |
| js/camera/drive-onboard.js | 23 | Full |
| js/camera/extra-rigs.js | 328 | Full |
| js/camera/feel.js | 459 | Full |
| js/camera/flyby-editor.js | 666 | Full |
| js/camera/flyby-panel.js | 387 | Full |
| js/camera/flyby-seq.js | 2145 | Full |
| js/camera/flyby-sight.js | 606 | Full |
| js/camera/fov-fit.js | 82 | Full |
| js/camera/free-cam.js | 524 | Full |
| js/camera/mode-switch.js | 305 | Full |
| js/camera/offsets.js | 721 | Full |
| js/camera/photo-cam.js | 296 | Full |
| js/camera/photo-kit.js | 189 | Full |
| js/camera/replay-buf.js | 559 | Full |
| js/camera/results-cam.js | 281 | Full |
| js/camera/trackside.js | 140 | Full |
| js/camera/tuner-panel.js | 518 | Full |
| js/camera/vantage.js | 968 | Full |

## Contracts and integration
CamAvoid handles broadcast obstruction escape. CamComfort owns touch auto policy and future FX preference. CamGroups owns onboard/layout families. CamModes uses append-only persisted mode indexes and temporary owners, tap/hold UI and WATCH AUTO. GameCams in vantage solves pooled per-mode eye/target/basis using raw onboard and smoothed exterior ground, then tune/look/lens/avoid/floor stages. ExtraRigs supplies rival/pitwall/drone and ephemeral pit camera. CamFeel supplies FOV, lens response, free look and deterministic shake. Drive family files supply degree FOV deltas without pose motion. Trackside caches fixed per-corner eyes with hysteresis and distance lens.

CockpitOpts supplies immutable cached seat/wheel layout and persisted onboard preferences; CockpitFinishes applies revision-aware livery views; preview owns isolated iframe context teardown. Offsets/CamTune supplies global/mode/car/track precedence, presets and bounded APXC1 interchange. TunerPanel and CamTunerPanel own lazy knob UI and editor opening.

FlybyPanel defines shot grammar/algebra and saved form. FlybySeq resolves track-relative poses, seeded plans, caches, clearance and sightline scoring, warmed planning and pooled cut output. FlybySight supplies opacity boxes, spatial index and terrain/ray visibility. FlybyEditor owns saved shots and guarded freecam preview. FreeCam and PhotoCam own fly-mode input, callbacks, bookmarks/DoF and dbgCam lifecycle. PhotoKit supplies transient looks/grid/bookmarks. ReplayBuf captures solo pose/status ring, teleport-safe interpolation and bit-exact live restore; ResultsCam acquires/relinquishes scrub ownership. Director owns only its own debug-camera identity during solo TV cuts.

## LSP evidence
All 28 globals queried at module level, matching game, car drawing, audio, replay/mirror, studio and agent consumers. CamModes references explicitly used text fallback because untyped; Director.decideCut member query returned module fallback, so member coverage is not claimed.

## Verified comment discrepancies
- CamComfort says stored choice always wins/already-set boot is no-op; boot removes saved on for non-touch.
- Director decideCut doc says battle waits for max unless explicit event kind; body cuts new battles between min/max and accepts no event-kind argument.
- CamGroups says helmet floating speed paints; mode-switch LCD marker and touch CSS hide it.
- Vantage curvature comment lists only three modes while condition includes others; onboard-attitude comment omits visor/helmet/tcam; corner lead shipped .35 conflicts default .4; two-neighbor floor wording precedes four-point interpolation.
- Offsets says only chase/far use cornerLead while droneFollow does too; moved-from-default count actually counts explicit default keys.
- FlybyPanel duration sum exactly one claim ignores six-decimal rounding.
- FlybySeq default/variation headers say nine shots, actual default has eleven.

## Limits and next goal
All camera bodies read; device motion/comfort and actual rendered output untested. Continue remaining car files, render backends and outstanding project scopes.
