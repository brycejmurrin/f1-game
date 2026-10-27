# Unit tests group 05 — complete source map

Read-only mapping dated 2026-10-27. All 12 assigned files (4,431 lines) were read in full, including setup, comments, assertions and teardown. No tests, browser sessions, production edits or commits were performed. This records test intent and inspected source contracts, not passing results.

## Read ledger

SHA-256 identifies the precise reviewed bytes. Ranges are inclusive; file ends include trailing-newline accounting as recorded in the batch.

| File | Lines | Full read ranges | SHA-256 |
|---|---:|---|---|
| [tests/unit/camera-defaults.test.mjs](../../tests/unit/camera-defaults.test.mjs) | 819 | 1–240; 241–530; 531–819 | 76b918cfaf00598c4483cfc467d90a28f3e67ca4f7a0ffcd2fb96ff75e607c63 |
| [tests/unit/camera-feel.test.mjs](../../tests/unit/camera-feel.test.mjs) | 408 | 1–408 | 2283555fcb24e08e5f8af0a856332fa93799a6b81bd998a4f16727d3d5e5be9a |
| [tests/unit/camera-ride.test.mjs](../../tests/unit/camera-ride.test.mjs) | 573 | 1–300; 301–573 | 9f277263725eb7a1323fc61a4a587e6f345da5a4244ad7580d5c65b79253c966 |
| [tests/unit/camera-tuner-a11y.test.mjs](../../tests/unit/camera-tuner-a11y.test.mjs) | 69 | 1–69 | 7b10173bbe51f13f38fd064edf583002b0bb7b7a25d6319dda6fb1f21237b7a9 |
| [tests/unit/captions.test.mjs](../../tests/unit/captions.test.mjs) | 113 | 1–113 | 99a4db66e2590930588ea504710811900328ec717d0fe6a1d156be308c8c0028 |
| [tests/unit/capture-tools-regressions.test.mjs](../../tests/unit/capture-tools-regressions.test.mjs) | 979 | 1–260; 261–520; 521–760; 761–979 | a0af4a0f8b65c76567c08775d86a87da7b9954a1c17292817e636946286e464d |
| [tests/unit/car-draw-decal-budget.test.mjs](../../tests/unit/car-draw-decal-budget.test.mjs) | 313 | 1–313 | d15273ee9881ef9743ead2a5d28cec771bd5ef4eb6f2c8237322427f94aebf00 |
| [tests/unit/car-draw-decal-sweep.test.mjs](../../tests/unit/car-draw-decal-sweep.test.mjs) | 70 | 1–70 | d005ee2af85505692b4855d0ce2bbd88a98f7d968fcae5f0a35a60c3c7bdd1fd |
| [tests/unit/car-fields-vm.test.mjs](../../tests/unit/car-fields-vm.test.mjs) | 495 | 1–260; 261–495 | 9053775c9e735a94241d308245b1346e89c86b8f9c9fa64be5b0f9e3a5a02467 |
| [tests/unit/car-front-wing-width.test.mjs](../../tests/unit/car-front-wing-width.test.mjs) | 77 | 1–77 | 71aad368191beab7c85dae673001256c9b2e3dff0229ca586e3b0eca7598cf89 |
| [tests/unit/car-fx.test.mjs](../../tests/unit/car-fx.test.mjs) | 456 | 1–250; 251–456 | fec51155bd7b4c6e6d99dcb87db0cf3e17d033aee0ef5bce65b7b75d1669d6e4 |
| [tests/unit/car-geometry-decimate.test.mjs](../../tests/unit/car-geometry-decimate.test.mjs) | 59 | 1–59 | aa4347e9e740c5d13912d26bce88ab2b72a8d82019a9b8d143a76beb0e1a3d3e |

## Navigation and evidence limits

Read AGENTS.md and .claude/skills/code-nav/SKILL.md. Attached apex-lsp definitions resolved CamTune, GameCams, CamModes, CamTunerEditor, CockpitOpts, Captions, CarDraw, CarGeometry, Car3D, Particles, CarFields and CarFx; outlines supplied member locations for camera state, geometry and FX. CamModes is reported as a window assignment [use], rather than a lexical declaration. Source reads inspected camera-rig, car-draw-vm, game-source, geometry decimation, CarFx, capture runtime, parts loader and triangle loader seams. Tools below are mapped through their direct ESM imports and source declarations.

Each row is one declared test: the contract column describes the asserted behavior; the assertion column gives source lines of every assert call in its body, including callbacks. Those locations preserve exact comparisons and thresholds without reproducing all expressions. Shared helper assertions and fixture construction are covered by the file-level notes. Rows with static source checks prove text shape/ordering, not a live browser feature. Loop sweeps are a single declared test with multiple samples.

## tests/unit/camera-defaults.test.mjs

Fixture and boundaries: VM CamTune/CockpitOpts storage and mini DOM CamModes, plus camera-rig BEND with 61 live samples. gameSource() is the game plus its derived create-module union; some older checks still read raw game.js.

Assertion semantics: Pins defaults 0.54 lead, 1 hang, 0.4 turn-chase vs legacy 0.35; explicit zero/default edits must survive persistence. Exercises APXC1/JSON/legacy imports, atomic malformed rejection, scope precedence track > car > mode/global, cut durations and CAM ownership cancellation. SSR snippets classify helmet/count views and invert real projection matrices within 1e-5.

Production entry points: `js/camera/offsets.js:2`; `js/camera/vantage.js:441`; `js/camera/mode-switch.js:7`; `js/camera/cockpit-opts.js:2`.

| Test / asserted contract | Test lines | Assertion source lines | Production exercised / inspected |
|---|---|---|---|
| CAM touch release preserves the long-press picker; cancelled holds never consume the next tap | 29–55 | 43, 45, 46, 50, 53 | `js/camera/mode-switch.js:1`; `js/camera/offsets.js:2` |
| setCamMode refuses NaN / Infinity so a poisoned index cannot stick | 57–78 | 67, 68, 69, 70, 73, 74, 75, 76, 77 | `js/camera/mode-switch.js:1`; `js/camera/offsets.js:2` |
| CORNER LEAD's registry default is the shipped lead, so 0 is storable | 121–151 | 126, 130, 131, 136, 138, 143, 145, 146, 150 | `js/camera/vantage.js:1`; `js/camera/offsets.js:2` |
| the CAMERA TUNER tunes HELMET as its own camera, apart from COCKPIT | 156–170 | 159, 160, 163, 166, 168, 169 | `js/camera/tuner-panel.js:1`; `js/camera/offsets.js:2` |
| CORNER HANG ships at 1 and 0 stays stored | 172–191 | 175, 176, 177, 178, 179, 180, 181, 182, 184, 185, 187, 189, 190 | `js/camera/offsets.js:2` |
| the stored CORNER HANG moves the chase and heli eyes in a bend; an unset one is the shipped full hang | 193–199 | 196, 197 | `js/camera/vantage.js:441` |
| the six geometric knobs stay deltas defaulting to 0 | 201–207 | 205 | `js/camera/offsets.js:2` |
| the stored CORNER LEAD swings the chase aim into the bend | 209–212 | 211 | `js/camera/vantage.js:441` |
| cockpit turn chasing is a 0–1 look-ahead blend, shipped at 0.4 | 214–247 | 216, 218, 220, 223, 225, 226, 227, 228, 230, 231, 233, 235, 237, 245 | `js/camera/cockpit-opts.js:1`; `js/camera/cockpit-opts.js:2` |
| VISOR BEAMS is a 0..2 slider factor stored as a percent, with level words and percents both accepted | 249–267 | 251, 252, 253, 254, 255, 256, 257, 258, 259, 260, 265, 266 | `js/camera/cockpit-opts.js:2` |
| broadcast cameras carry per-mode cut ease durations | 271–289 | 277, 278, 282, 283, 284, 287 | `js/camera/mode-switch.js:1`; `js/camera/offsets.js:2` |
| a camera cut publishes HUD classes without waiting for rAF | 291–300 | 295, 298 | `js/camera/mode-switch.js:1`; `js/agent/apex-cam.js:1` |
| HUD applies camera/profile body classes | 302–311 | 304, 305, 306, 308, 309, 310 | `js/ui/hud.js:1`; `css/hud.css:1` |
| every body class the HUD toggles has a rule that reads it | 324–344 | 336, 341 | `js/ui/hud.js:1` |
| CamTune exports player edits as window.CameraEdits and imports them back | 346–388 | 348, 349, 350, 352, 353, 360, 361, 362, 363, 366, 369, 371, 372, 373, 374, 379, 380, 385, 386, 387 | `js/camera/offsets.js:1`; `js/camera/tuner-panel.js:1`; `js/camera/offsets.js:2` |
| malformed camera imports reject atomically without clearing saved tuning | 394–410 | 402, 403, 405, 406, 407, 408, 409 | `js/camera/offsets.js:2` |
| the whole COPY VALUES block imports back (APXC1 token found anywhere) | 412–452 | 434, 435, 439, 440, 441, 442, 443, 447, 448, 449, 451 | `js/camera/offsets.js:2` |
| a modes-only import keeps the global baseline and COMFORT knobs | 458–477 | 466, 467, 468, 469, 470, 471, 475, 476 | `js/camera/offsets.js:2` |
| persist(which) writes only the named CamTune store | 481–511 | 497, 499, 501, 502, 504, 509, 510 | `js/camera/offsets.js:1`; `js/camera/tuner-panel.js:1`; `js/camera/offsets.js:2` |
| CamTune comfort knobs are independent of reduce-motion and default to shipped | 513–527 | 516, 518, 519, 521, 522, 523, 524, 526 | `js/camera/offsets.js:2` |
| CamTune global baseline layers under per-mode; copyFrom and presets work | 529–549 | 532, 534, 535, 539, 541, 542, 543, 544, 545, 546, 547, 548 | `js/camera/offsets.js:2` |
| chase FOV at speed follows the comfort speedFov scale, not the raw speed | 551–554 | 553 | `js/camera/vantage.js:441` |
| explicit camera defaults override global values through export/load until reset | 560–575 | 568, 569, 570, 571, 573, 574 | `js/camera/offsets.js:2` |
| camera overrides resolve track over car over the existing global baseline | 580–605 | 582, 595, 596, 599, 600, 603, 604 | `js/camera/offsets.js:2` |
| live camera scopes override saved menu choices and follow world transitions | 607–640 | 617, 618, 619, 621, 622, 623, 625, 626, 627, 629, 630, 633, 635, 639 | `js/camera/offsets.js:2` |
| game camera context follows WATCH cuts and returns to the menu selection | 642–657 | 645, 652, 654, 656 | `js/game.js:1`; `js/camera/offsets.js:2` |
| JSON and APXC1 camera packs round-trip track and car overrides | 659–675 | 667, 668, 672, 673, 674 | `js/camera/offsets.js:2` |
| helmet inherits the production onboard SSR range and releases it outside race views | 678–716 | 688, 710, 712, 713, 714 | `js/camera/mode-switch.js:1`; `js/game.js:1` |
| inverse projection stays current at measured tier 4, through and after the SSR fade | 718–765 | 722, 737, 750, 751, 757, 758, 763 | `js/core/mat4.js:1`; `js/game.js:1` |
| pending CAM hold is retired on pause/hide/quit, hidden page and blur without pointer cancellation | 767–797 | 780, 788, 790, 791, 795 | `js/camera/mode-switch.js:1`; `js/camera/offsets.js:2` |
| CAM context-menu and late hold cannot open on a paused, hidden or non-race screen | 799–819 | 814, 817 | `js/camera/mode-switch.js:1`; `js/camera/offsets.js:2` |

## tests/unit/camera-feel.test.mjs

Fixture and boundaries: Local straightFixture has live curvature; VM loads real drive-chase/broadcast/onboard, feel, and selected vantage/math scripts. Input, store, track sampling and banking are stubs.

Assertion semantics: Checks exponential following, lens-only speed responses, latches and snap edges, free-look/recentering, helmet equivalence, settings persistence and wiring. Shake RMS compares 30/60/144 Hz (30:144 <1.15; 60 near .111 ±.02), onboard translation <=.03 m. TV-scoped bend state must match isolated player within 1e-9; noLook prevents a rear-view mirror in TV solves.

Production entry points: `js/camera/feel.js:7`; `js/camera/vantage.js:441`.

| Test / asserted contract | Test lines | Assertion source lines | Production exercised / inspected |
|---|---|---|---|
| follow is exact with no dt and eases when a frame has one | 49–56 | 52, 54, 55 | `js/camera/feel.js:7` |
| drive opens the lens with speed and does not move the eye | 58–92 | 62, 63, 65, 66, 67, 68, 69, 71, 72, 73, 74, 77, 86, 87, 88, 89, 90, 91 | `js/camera/feel.js:7` |
| speedFov is one shared curve scaled per mode | 94–110 | 96, 97, 98, 100, 101, 102, 104, 105, 106, 108, 109 | `js/camera/feel.js:7` |
| LOOK BACK skips reverse and rear; latch toggles on rising edge | 112–134 | 114, 115, 116, 119, 122, 123, 127, 131, 133 | `js/camera/feel.js:7` |
| free-look accumulates on stick, recenters on release, respects comfort | 136–165 | 144, 150, 157, 164 | `js/camera/feel.js:7` |
| applyFreeLook is additive yaw on the aim about the eye | 167–178 | 176, 177 | `js/camera/feel.js:7` |
| buzz / free-look scope tables stay aligned | 180–190 | 182, 183, 184, 185, 187, 188, 189 | `js/camera/feel.js:7` |
| helmet drive rates match cockpit so a mode switch does not retune the lens | 192–203 | 202 | `js/camera/feel.js:7` |
| speed vignette defaults off and persists | 205–211 | 207, 209, 210 | `js/camera/feel.js:7` |
| vantage.js routes FOV and look-back through CamFeel | 213–222 | 215, 217, 218, 219, 221 | `js/camera/vantage.js:1`; `js/camera/feel.js:7` |
| game.js buzz uses CamFeel.isBuzzMode; Input exposes look axes | 224–231 | 226, 227, 229, 230 | `js/game.js:1`; `js/input/input.js:1`; `js/camera/feel.js:7` |
| settings export lists the new camera-feel keys | 233–237 | 235, 236 | `js/ui/settings-export.js:1` |
| trauma shake is frame-rate independent through the chase damper (was 2.2x at 30 vs 144 fps) | 242–263 | 256, 258, 261 | `js/camera/feel.js:7` |
| onboard shake stays inside the tub and becomes aim rotation | 265–279 | 274, 275, 278 | `js/camera/feel.js:7` |
| LOOK BACK flips are a cut for the aim: one snap per edge, and the state game.js mirrors the roll by | 281–297 | 285, 287, 288, 289, 291, 293, 294, 296 | `js/camera/feel.js:7` |
| mouse free-look holds while the right button is held still | 299–322 | 304, 306, 308, 315, 318, 321 | `js/camera/feel.js:7` |
| snapGameCam is a cut: hang, speed-FOV follows, free-look and a latched look-back all reset | 324–334 | 328, 331, 332 | `js/camera/feel.js:7` |
| a snapped chase frame clears the bend hang the next live frame eases from | 339–353 | 352 | `js/core/mat4.js:1`; `js/camera/vantage.js:1`; `js/camera/vantage.js:441` |
| a TV-director solve never perturbs the player's bend hang | 359–385 | 384 | `js/core/mat4.js:1`; `js/camera/vantage.js:1`; `js/camera/vantage.js:441`; `js/camera/feel.js:7` |
| look-back mirrors the player's solve only; extra.noLook opts out (bug-hunt 9.5) | 390–408 | 405, 406, 407 | `js/core/mat4.js:1`; `js/camera/vantage.js:1`; `js/camera/vantage.js:441` |

## tests/unit/camera-ride.test.mjs

Fixture and boundaries: tests/helpers/camera-rig.mjs elevation fixture: 4 m nodes, +Z straight, synthetic Monaco-shaped hill plus three harmonics; floor rounds nodes. Height tuning is a deliberately narrow eye-only stub. Real car-mesh dash geometry runs with GaragePrims block stub.

Assertion semantics: Pins flat and gentle-slope framing, steep-climb soft floor, heli/side street compensation. Chase/far pitch ripple must be <1/4 raw reference; hill ascent >28 m. Lowered eye has zero >.2 m steps, <25% flat samples; acceleration spike/RMS <6. Tests visor/helmet seat and rig anchor, chassis pitch sign, reduced motion, head displacement/clamps, eye box culling.

Production entry points: `js/camera/vantage.js:441`; `js/camera/vantage.js:157`; `js/car/car-mesh.js:1`; `js/camera/mode-switch.js:7`.

| Test / asserted contract | Test lines | Assertion source lines | Production exercised / inspected |
|---|---|---|---|
| flat road: the chase rig frames exactly as its constants say | 86–97 | 95, 96 | `js/camera/vantage.js:441` |
| heli and TV side: straight-road pose (eye height, back/out offsets, aim) | 107–140 | 109 | `js/camera/vantage.js:1`; `js/camera/vantage.js:441`; `js/camera/feel.js:7` |
| on a steep climb the lowered chase eye rides the terrain floor, softly | 147–161 | 155, 156, 158 | `js/camera/vantage.js:441` |
| constant slope: unchanged from a raw two-point rig, to the millimetre | 163–183 | 178, 180 | `js/camera/vantage.js:441` |
| a hill with the engine's own undulation does not bob the chase pitch | 185–203 | 200, 201 | `js/camera/vantage.js:441` |
| the eye still follows the hill — smoothing is not flattening | 205–214 | 213 | `js/camera/vantage.js:441` |
| far chase gets the same treatment | 216–228 | 226, 227 | `js/camera/vantage.js:441` |
| a camera LOWERED into the ground clamp does not ride a node staircase | 230–258 | 251, 252, 256 | `js/camera/vantage.js:441` |
| the camera path is C1 — no node-rate or clamp-handover acceleration spikes | 260–287 | 284 | `js/camera/vantage.js:441` |
| VISOR is the cockpit eye, same aim, and the rig is anchored on the same car point | 289–321 | 297, 298, 306, 307, 308, 309, 310, 314, 319 | `js/camera/vantage.js:441` |
| VISOR draws the cockpit rig without the steering wheel, and the column and bulkhead it unclips from | 323–333 | 330, 331 | `js/car/car-mesh.js:1` |
| EVERY world-facing camera mode is C1 on a gradient | 335–361 | 360 | `js/camera/vantage.js:441` |
| the soft floor never lets the eye end up below the hard floor | 373–384 | 381 | `js/camera/vantage.js:441` |
| the ground clamp still catches an eye below the surface | 386–397 | 394 | `js/camera/vantage.js:441` |
| the cockpit viewmodel yaws with heading, not the road tangent | 399–428 | 407, 412, 414, 421, 425, 427 | `js/camera/vantage.js:441` |
| REDUCE MOTION drops the cockpit kerb shiver, and only that | 430–443 | 438, 439, 441 | `js/camera/vantage.js:441` |
| the bolted-on views dip under braking and lift under power, and it is the car's motion, kept under REDUCE MOTION | 449–461 | 455, 456, 460 | `js/camera/vantage.js:441` |
| the driver's head shifts outward in a corner and nods under braking, inside a rig that stays on the car | 467–517 | 482, 483, 484, 485, 488, 491, 492, 495, 498, 499, 500, 504, 511, 515, 516 | `js/camera/vantage.js:441` |
| HELMET is the cockpit from inside the lid: the eye a few cm forward, the same aim and lens, the rig on the same car point | 519–554 | 532, 534, 535, 538, 547, 551, 553 | `js/camera/mode-switch.js:1`; `js/camera/vantage.js:441` |
| near-eye cull: a rival alongside an onboard eye stays drawn; an eye inside a car hides it | 559–573 | 565, 567, 569, 570, 571, 572 | `js/camera/vantage.js:441` |

## tests/unit/camera-tuner-a11y.test.mjs

Fixture and boundaries: mini-dom with select.options alias; real offsets and tuner panel, stubbed two camera roster; store initially Monza/Ferrari while built world is Spa/McLaren.

Assertion semantics: Exactly one of four scope chips exposes aria-pressed=true after every click; all chips have explicit boolean strings. Built track/car context governs scoped writes and follows Suzuka/Ferrari transition.

Production entry points: `js/camera/tuner-panel.js:2`; `js/camera/offsets.js:217`.

| Test / asserted contract | Test lines | Assertion source lines | Production exercised / inspected |
|---|---|---|---|
| camera tuner scope buttons expose exactly one aria-pressed after every click | 45–56 | 48, 50, 53, 54 | `js/camera/tuner-panel.js:2`; `js/camera/offsets.js:217` |
| camera tuner resolves built track definitions instead of saved menu selections | 58–69 | 61, 63, 64, 67, 68 | `js/camera/tuner-panel.js:2`; `js/camera/offsets.js:217` |

## tests/unit/captions.test.mjs

Fixture and boundaries: Handmade document/store with speaker table; actual captions VM, stylesheet read from disk. Query selectors return fresh objects, so this is not DOM rendering validation.

Assertion semantics: Source absence checks prohibit Tracks, curvature and player-dot access. Speaker labels, last-12 ring order, five persisted setting keys and 38ch CSS width budget are checked.

Production entry points: `js/ui/captions.js:5`; `js/ui/captions.js:68`; `js/ui/captions.js:77`; `css/hud.css:1`.

| Test / asserted contract | Test lines | Assertion source lines | Production exercised / inspected |
|---|---|---|---|
| source never names Tracks, curvature, or player. | 68–72 | 69, 70, 71 | `js/ui/captions.js:5`; `js/ui/captions.js:68`; `js/ui/captions.js:77`; `css/hud.css:1` |
| radioWho maps control/coach/comm and driver radio | 74–81 | 76, 77, 78, 80 | `js/ui/captions.js:5`; `js/ui/captions.js:68`; `js/ui/captions.js:77`; `css/hud.css:1` |
| ring keeps the last N records | 83–90 | 87, 88, 89 | `js/ui/captions.js:5`; `js/ui/captions.js:68`; `js/ui/captions.js:77`; `css/hud.css:1` |
| settings keys round-trip through the store API | 92–105 | 100, 101, 102, 103, 104 | `js/ui/captions.js:5`; `js/ui/captions.js:68`; `js/ui/captions.js:77`; `css/hud.css:1` |
| large caption scale fits phone-landscape width budget at 38ch | 107–113 | 111, 112 | `css/hud.css:1` |

## tests/unit/capture-tools-regressions.test.mjs

Fixture and boundaries: Imports real capture/tool modules; most page/CDP/browser/process objects are fakes, callbacks evaluated in VM or directly. sharp creates tiny known images; temporary scratch trees and symlinks exercise real filesystem contracts. CLI children use offline --plan only. Default replay fixture is tests/fixtures/openf1-baku-2026-race.json.

Assertion semantics: Covers startup seed/budget, CDP cleanup/deadlines/encoding, pool ordering and boot rollback, native/soft/copy presentation clocks, owner pause restoration, parser/path containment, menu readiness, pixel/backend evidence, lifecycle VM census, replay preflight/audio sanitation/pointer exit, operation/whole-run deadlines, teardown registry, profiles/GPU flags/provenance, trace streaming and benchmark-owned process escalation. Per-test rows identify the exact helper and assertion lines.

Production entry points: `tools/shot/probe-page.mjs:1`; `tools/shot/capture-runtime.mjs:1`; `tools/shot/replay-camera-probe.mjs:1`.

| Test / asserted contract | Test lines | Assertion source lines | Production exercised / inspected |
|---|---|---|---|
| agent help boots once with the selected seed and measured startup budget | 23–46 | 43, 44, 45 | `tools/shot/capture-contract.mjs:9 (ROOT)`; `tools/lib/harness.mjs:176 (shutdown)`; `tools/shot/agent.mjs:1` |
| successful and rejected CDP capture clear deadline and detach session | 48–62 | 57, 58, 60 | `tools/shot/probe-page.mjs:807 (screenshotPresentedCanvas)` |
| CDP forwards fast PNG opt-out and explicit JPEG quality | 64–80 | 74, 75, 76, 77, 78, 79 | `tools/shot/probe-page.mjs:807 (screenshotPresentedCanvas)` |
| dynamic capture queue stays bounded, preserves job order and keeps going after failure | 82–95 | 92, 93, 94 | `tools/shot/apex-capture.mjs:214 (poolMap)` |
| partial capture pool boot closes both previously ready and failed browsers | 97–105 | 99, 104 | `tools/shot/apex-capture.mjs:175 (startWorkerPool)` |
| capture generation ignores the old readback and stops at the first matching displayed source | 107–116 | 114, 115 | `tools/shot/apex-capture.mjs:130 (waitCaptureFrame)` |
| a matching next source needs only one present and a stalled source rejects capture | 118–128 | 124, 126, 127 | `tools/shot/probe-page.mjs:807 (screenshotPresentedCanvas)`; `tools/shot/probe-page.mjs:427 (awaitCaptureReady)` |
| native frame barrier checks real game render progress rather than a resolved soft promise | 130–138 | 136, 137 | `tools/shot/apex-capture.mjs:130 (waitCaptureFrame)` |
| capture page keeps backend AUTO and closes failed context before a reused browser takes another job | 140–146 | 144, 145 | `tools/shot/apex-capture.mjs:112 (openPage)` |
| CDP render pause restores the previous headless state on success and failure | 148–163 | 155, 159, 160 | `tools/shot/probe-page.mjs:807 (screenshotPresentedCanvas)` |
| paused CDP deadline restores rendering and soft captures avoid the pause entirely | 165–182 | 173, 175, 180 | `tools/shot/probe-page.mjs:807 (screenshotPresentedCanvas)` |
| mode capture failures retain a printable job name | 184–187 | 186 | `tools/shot/apex-capture.mjs:214 (poolMap)` |
| capture parsers reject nonfinite dimensions, scales and unknown flags; seed zero stays explicit | 189–203 | 190, 191, 192, 193, 194, 195, 196, 197, 200, 202 | `tools/ui/css-play.mjs:107 (parseCssPlayArgs)`; `tools/ui/css-play.mjs:332 (screenClicks)`; `tools/ui/css-play.mjs:46 (SCREENS)`; `tools/track/survey-track.mjs:39 (parseSurveyTrackArgs)`; `tools/shot/capture-contract.mjs:10 (parseCaptureArgs)`; `tools/shot/capture-contract.mjs:9 (ROOT)` |
| infinite decorative animation does not block while a finite transition does | 205–215 | 211, 213 | `tools/ui/menu-readiness.mjs:3 (menuReady)` |
| preview-map wait holds on the undrawn 520x300 default, releases on a draw or ink | 222–242 | 234, 235, 236, 237, 238, 239, 240 | `tools/ui/menu-readiness.mjs:25 (previewMapSettled)` |
| single-screen layout dispatch actually forwards 130 percent and rejects scale matrix | 244–252 | 250, 251 | `tools/shot/capture-contract.mjs:9 (ROOT)`; `tools/ui/layout-audit.mjs:1` |
| garage reset plan preserves existing evidence and invalid part enum never creates output | 254–265 | 260, 263 | `tools/shot/capture-contract.mjs:9 (ROOT)`; `tools/shot/garage-angles.mjs:1` |
| pixel evidence distinguishes black and edge-only HUD from presented scene; requested backend alone proves nothing | 267–280 | 271, 272, 274, 275, 276, 277, 278, 279 | `tools/shot/capture-contract.mjs:49 (pixelEvidence)`; `tools/shot/capture-contract.mjs:63 (rendererEvidence)`; `tools/shot/replay-camera-probe.mjs:79 (cameraDelta)` |
| lifecycle pending WATCH cancellation prevents stale trace completion launching replay | 282–289 | 284, 285, 286, 287, 288 | `tools/check/lifecycle-census.mjs:50 (pendingWatchCancellation)` |
| lifecycle soak closes every repeated headless mode cycle | 291–298 | 293, 294, 295, 296, 297 | `tools/check/lifecycle-census.mjs:27 (lifecycleSoak)` |
| lifecycle census accepts a bounded repeat count | 300–303 | 301, 302 | `tools/shot/capture-contract.mjs:10 (parseCaptureArgs)` |
| replay fixture plan is offline and bounded | 305–310 | 307, 308, 309 | `tools/shot/capture-contract.mjs:10 (parseCaptureArgs)`; `tools/shot/capture-contract.mjs:9 (ROOT)`; `tools/shot/replay-camera-probe.mjs:1` |
| survey preserves both signed terrain profiles instead of inventing a cross-side step | 312–322 | 318, 319, 320, 321 | `tools/shot/capture-contract.mjs:9 (ROOT)`; `tools/track/survey-track.mjs:1` |
| stylesheet load, error and deadline all restore handlers and clear owned timer | 324–340 | 330, 333, 336, 337 | `tools/ui/css-play.mjs:283 (swapStylesheet)`; `css/carsetup.css:1` |
| capture runtime obeys actual soft screenshot file and numeric present-wait exports | 342–365 | 352, 361, 362, 363 | `tools/shot/capture-contract.mjs:9 (ROOT)`; `tools/shot/capture-runtime.mjs:163 (recordCapture)`; `tools/shot/capture-runtime.mjs:157 (stageRace)`; `tools/shot/capture-runtime.mjs:28 (visibleScreen)` |
| capture operations cap the remaining whole-run budget without passing zero and clear owned timeout | 367–384 | 369, 370, 371, 372, 375, 379, 380, 381, 382 | `tools/shot/capture-runtime.mjs:63 (captureOperationBudget)`; `tools/shot/capture-runtime.mjs:69 (captureOperation)` |
| recordCapture passes the real CDP helper sixty-second cap or smaller remaining deadline | 386–417 | 397, 409, 410, 412, 413, 415 | `tools/shot/capture-contract.mjs:9 (ROOT)`; `tools/shot/capture-runtime.mjs:163 (recordCapture)`; `tools/shot/capture-runtime.mjs:28 (visibleScreen)` |
| whole-run deadline invokes harness cleanup without awaiting direct browser closes; failure context survives | 419–429 | 423, 424, 426, 428 | `tools/shot/capture-runtime.mjs:40 (runBoundedCapture)` |
| replay fixture rejects oversized regular files before parsing and rejects nonfiles | 431–442 | 437, 438, 440 | `tools/shot/capture-contract.mjs:9 (ROOT)`; `tools/shot/replay-camera-probe.mjs:64 (loadFixture)` |
| replay exit reveals actual HUD pause control before clicks and restores prior HUD state | 444–479 | 460, 462, 464, 465, 467, 470, 471, 472, 473, 474, 475, 476 | `tools/shot/capture-contract.mjs:9 (ROOT)`; `tools/shot/replay-camera-probe.mjs:110 (exitReplayThroughUi)`; `js/agent/apex.js:1` |
| verified replay pointer clicks require actual visible enabled center hit-target, without RAF stability | 481–512 | 486, 489, 490, 494, 496, 498, 501, 502, 503, 506, 507, 509, 510 | `tools/shot/replay-camera-probe.mjs:83 (controlClickGuard)`; `tools/shot/replay-camera-probe.mjs:94 (verifiedControlClick)` |
| replay compositor recording is scoped to output and actual game frame progression is polled | 514–524 | 516, 517, 521, 522 | `tools/shot/capture-contract.mjs:9 (ROOT)`; `tools/shot/capture-runtime.mjs:119 (waitNextGameRender)`; `tools/shot/capture-runtime.mjs:84 (captureContextOptions)` |
| failure snapshot is bounded while preserving exact phase-state data when page is live | 526–531 | 528, 530 | `tools/shot/capture-runtime.mjs:28 (visibleScreen)`; `tools/shot/capture-runtime.mjs:88 (captureFailureSnapshot)` |
| failure snapshot preserves cheap state and screen when GPU diagnostics never resolve | 533–553 | 543, 544, 548, 549, 550, 551 | `tools/shot/capture-runtime.mjs:28 (visibleScreen)`; `tools/shot/capture-runtime.mjs:88 (captureFailureSnapshot)` |
| actual harness registry drains resource acquired during pending shutdown | 555–564 | 559, 562, 563 | `tools/lib/harness.mjs:170 (registerTeardownResource)`; `tools/lib/harness.mjs:176 (shutdown)` |
| replay fixture plan rejects unrelated JSON and validates real builder columns, track and trace schema offline | 566–584 | 569, 571, 573, 574, 576, 578, 581, 583 | `tools/shot/capture-contract.mjs:9 (ROOT)`; `tools/shot/replay-camera-probe.mjs:64 (loadFixture)`; `tools/shot/replay-camera-probe.mjs:11 (preflightReplayFixture)`; `tools/shot/replay-camera-probe.mjs:1` |
| camera-only fixture strips remote radio audio without mutating source and actual replay audio guard prevents fetch | 586–610 | 589, 590, 591, 606, 607, 609 | `tools/shot/capture-contract.mjs:9 (ROOT)`; `tools/shot/replay-camera-probe.mjs:64 (loadFixture)`; `tools/shot/replay-camera-probe.mjs:51 (cameraOnlyFixture)`; `js/race/real-replay.js:1` |
| garage diff takes a shot name or a PNG under artifacts/ or scratch/ only, symlinks resolved | 623–639 | 632, 633, 634, 636 | `tools/shot/capture-contract.mjs:9 (ROOT)`; `tools/shot/garage-angles.mjs:1` |
| track-session diff containment is outDir + separator, not a bare prefix | 641–656 | 650, 651, 653 | `tools/shot/capture-contract.mjs:9 (ROOT)`; `tools/shot/track-session.mjs:1` |
| capture profiles preserve command defaults and validate explicit dimensions/encoding | 658–677 | 660, 661, 662, 663, 664, 666, 667, 668, 669, 670, 672, 673, 675 | `tools/shot/capture-options.mjs:26 (parseCaptureOptions)`; `tools/shot/capture-options.mjs:68 (captureViewport)`; `tools/shot/capture-options.mjs:1 (profileContextOptions)`; `tools/shot/capture-options.mjs:92 (captureScreenshotOptions)`; `tools/shot/capture-options.mjs:96 (captureExtension)` |
| comparison profile pins real render/governor hooks and previews leave them alone | 679–693 | 686, 687, 689, 690, 691, 692 | `tools/shot/capture-options.mjs:101 (applyCaptureProfile)` |
| GPU diagnostics omit raw command lines and reject explicit fallback capabilities | 695–706 | 699, 700, 701, 702, 703, 704, 705 | `tools/shot/capture-diagnostics.mjs:16 (captureBrowserDiagnostics)`; `tools/shot/capture-diagnostics.mjs:37 (assertCaptureGpuCapability)` |
| capture provenance keeps source and deployed shell SHAs distinct | 708–718 | 713, 715, 716, 717 | `tools/shot/capture-runtime.mjs:12 (parseCaptureProvenance)`; `tools/shot/capture-runtime.mjs:21 (capturePageProvenance)` |
| GPU diagnostics clean up sessions created after a timeout without changing returned provenance | 720–732 | 724, 729, 730, 731 | `tools/shot/capture-diagnostics.mjs:16 (captureBrowserDiagnostics)` |
| Chromium capture trace streams bounded data, closes IO, and stop is idempotent | 734–756 | 748, 749, 750, 751, 752, 753, 754 | `tools/shot/capture-contract.mjs:9 (ROOT)`; `tools/shot/capture-diagnostics.mjs:49 (startCaptureTrace)` |
| Chromium capture trace rejects oversized or absent streams and removes partial files | 758–780 | 773, 774, 775, 776, 777 | `tools/shot/capture-contract.mjs:9 (ROOT)`; `tools/shot/capture-diagnostics.mjs:49 (startCaptureTrace)` |
| benchmark validates unique capability cells offline and excludes failures from timing medians | 783–791 | 785, 786, 789, 790 | `tools/shot/capture-benchmark.mjs:12 (parseBenchmarkArgs)`; `tools/shot/capture-benchmark.mjs:35 (summarizeBenchmarkSamples)` |
| benchmark deadline escalates only its IPC-owned browsers and child after graceful teardown stalls | 794–805 | 802, 803, 804 | `tools/shot/capture-benchmark.mjs:48 (captureSample)` |
| benchmark success releases browser ownership and never force-kills a completed sample | 807–816 | 809, 810, 815 | `tools/shot/capture-benchmark.mjs:48 (captureSample)` |
| legacy presentation requires advancing generations and native unsupported clocks fail explicitly | 818–827 | 822, 824, 826 | `tools/shot/probe-page.mjs:427 (awaitCaptureReady)` |
| WGX copy-generation readiness invalidates the previous scene and rejects its pending copy | 830–840 | 838, 839 | `tools/shot/probe-page.mjs:427 (awaitCaptureReady)` |
| atomic capture mutation preserves callback result and accepts a frame already displayed after mutation | 843–856 | 850, 853, 854, 855 | `tools/shot/probe-page.mjs:427 (awaitCaptureReady)`; `tools/shot/probe-page.mjs:408 (mutateCaptureScene)` |
| atomic WGX mutations invalidate exactly once and a renderer reset rebases stale markers | 858–871 | 867, 870 | `tools/shot/probe-page.mjs:427 (awaitCaptureReady)`; `tools/shot/probe-page.mjs:408 (mutateCaptureScene)` |
| an env-chosen GPU stack is explicit, so a SwiftShader fallback fails fast | 873–880 | 874, 875, 876, 877, 879 | `tools/shot/capture-options.mjs:26 (parseCaptureOptions)`; `tools/shot/capture-diagnostics.mjs:37 (assertCaptureGpuCapability)` |
| WebGPU capture launch uses the verified software adapter pins and refuses WebGL-only llvmpipe | 882–888 | 885, 886, 887 | `tools/shot/capture-options.mjs:26 (parseCaptureOptions)`; `tools/shot/capture-options.mjs:79 (captureLaunchOptions)` |
| hardware WebGPU capture selects full Chromium and never pins a software adapter | 890–904 | 892, 894, 895, 896, 897, 899, 901, 902, 903 | `tools/shot/capture-options.mjs:26 (parseCaptureOptions)`; `tools/shot/capture-options.mjs:79 (captureLaunchOptions)` |
| garage capture uses actual native presents when the race camera clock is stationary | 907–920 | 912, 917, 919 | `tools/shot/probe-page.mjs:427 (awaitCaptureReady)` |
| isolated car capture uses the viewer draw clock instead of a race camera clock | 922–929 | 928 | `tools/shot/probe-page.mjs:427 (awaitCaptureReady)` |
| capture rendering restores a live or paused owner after success or capture failure | 931–945 | 937, 942, 943 | `tools/shot/probe-page.mjs:510 (withCaptureRendering)` |
| native readback is submitted before pausing and restores its owner on failure | 948–966 | 953, 954, 957, 958, 960, 961, 963, 964 | `tools/shot/probe-page.mjs:530 (screenshotNativeCanvas)` |
| timed-out native presentation cannot later start a readback or pause its owner | 968–979 | 975, 976, 978 | `tools/shot/probe-page.mjs:530 (screenshotNativeCanvas)` |

## tests/unit/car-draw-decal-budget.test.mjs

Fixture and boundaries: car-draw-vm executes real CarDraw but counting Car3D/Parts/renderer; atlas builders return dimensioned fake canvases. Explicit idle queue and promise ticks control asynchronous swaps. Real team and legends tables.

Assertion semantics: Checks obsolete idle ownership, preview retirement, 160 MiB LRU with 2048x2560 high-resolution atlases, full-field retention, two-attempt retry cap, draft key isolation/no high-res until close, null/throw upload fallbacks, legend helmet keys. Bitmap orientation/premultiply/ownership tested for GLX/TLX/WGX; no pixel parity proven here.

Production entry points: `js/car/car-draw.js:33`; `tests/helpers/car-draw-vm.mjs:36`.

| Test / asserted contract | Test lines | Assertion source lines | Production exercised / inspected |
|---|---|---|---|
| invalidated livery jobs stop retrying when the idle budget stays low | 39–51 | 46, 48, 49 | `js/car/car-draw.js:33` |
| dropping an obsolete idle job preserves a replacement for the same livery | 53–67 | 60, 62, 63, 65, 66 | `js/car/car-draw.js:33` |
| the garage reaps the preview a hi-res swap parked; the race waits for flushDecals | 69–87 | 73, 75, 77, 86 | `js/car/car-draw.js:33` |
| the atlas LRU is bounded by bytes: browsing hi-res liveries cannot hold 36 x 26.7 MB | 89–100 | 97, 98, 99 | `js/car/car-draw.js:33` |
| a rival-sized field still fits the byte budget (nothing live is thrashed) | 102–109 | 108 | `js/car/car-draw.js:33` |
| a failed hi-res build is tried twice per key, not on every draw | 111–125 | 119, 120, 124 | `js/car/car-draw.js:33` |
| no player hi-res while a garage paint draft is live; exactly one after it ends | 130–152 | 142, 143, 149, 151 | `js/car/car-draw.js:33` |
| open the paint editor, edit, cancel: the saved atlas and its 2048 survive | 157–181 | 163, 171, 172, 177, 178, 179, 180 | `js/car/car-draw.js:33` |
| a hi-res createTexture that returns nothing keeps the preview instead of caching a null | 183–190 | 189 | `js/car/car-draw.js:33` |
| the player's LEGENDS slot builds its helmet from the picked legend and keys meshes with it | 192–220 | 200, 207, 208, 209, 211, 217, 218, 219 | `js/car/car-draw.js:33` |
| C-P3: the hi-res atlas uploads as a premultiplied ImageBitmap — flipped for GLX, unflipped for TLX/WGX | 244–260 | 250, 251, 253, 255, 256, 257, 258 | `js/car/car-draw.js:33` |
| C-P3: a bitmap that lands after the livery moved on is closed and never cached | 262–275 | 268, 269, 270, 273, 274 | `js/car/car-draw.js:33` |
| TLX bitmap ownership stays with CarDraw when texture creation fails | 277–290 | 287, 288 | `js/car/car-draw.js:33` |
| a stale TLX bitmap is closed once without transferring it to the renderer | 292–299 | 297, 298 | `js/car/car-draw.js:33` |
| C-P3: a refused bitmap uploads the canvas (the old path), counted as no failure; apex26.liveryAsync=0 never asks | 301–313 | 305, 306, 311, 312 | `js/car/car-draw.js:33` |

## tests/unit/car-draw-decal-sweep.test.mjs

Fixture and boundaries: Same recording car-draw-vm; fake 512-square atlases, no idle callbacks executed. flush helper loops 1,200 frames.

Assertion semantics: Race sweep frees only old nonfield atlases, keeps current/unqueued live field cars, permits re-mint; byte records equal live texture set with 4/3 mip factor. Garage/menu/photo modes never sweep.

Production entry points: `js/car/car-draw.js:33`.

| Test / asserted contract | Test lines | Assertion source lines | Production exercised / inspected |
|---|---|---|---|
| a race frees the atlases it no longer draws and keeps the field's | 37–50 | 40, 43, 45, 46, 47, 49 | `js/car/car-draw.js:33` |
| a rival still in the field keeps its atlas though no decal of it is queued | 52–60 | 58, 59 | `js/car/car-draw.js:33` |
| the garage, the menu and photo mode never sweep | 62–70 | 68 | `js/car/car-draw.js:33` |

## tests/unit/car-fields-vm.test.mjs

Fixture and boundaries: Real game-vm loads manifest and Monza race with disabled frustum hook; controls replace predeclare/warmShape/warmDoubles. V8 native probes are temporarily compiled with natives syntax. Fixed physics/frame loops; full lap plus pit and race-to-results use bounded step caps.

Assertion semantics: Checks key/group order/uniqueness, undefined sentinels, named stores, manifest wiring, shared fast hidden classes, no added keys, representation warm tables, unchanged simulation digests. Controls deliberately demonstrate dictionary maps, no-predeclare map divergence, zero-steer digest divergence and Smi-to-fraction remapping. Lap/pit cap 12,000; result cap 20,000; WARM >60 and MUTABLE <=24.

Production entry points: `js/race/car-fields.js:37`; `js/race/car-fields.js:151`; `js/race/car-fields.js:240`; `js/race/car-fields.js:260`; `tools/lib/game-vm.cjs:1`.

| Test / asserted contract | Test lines | Assertion source lines | Production exercised / inspected |
|---|---|---|---|
| table: unique keys, every group commented, one flat list | 89–97 | 90, 91, 93, 94, 96 | `js/race/car-fields.js:37`; `js/race/car-fields.js:151`; `js/race/car-fields.js:240`; `js/race/car-fields.js:260`; `tools/lib/game-vm.cjs:1` |
| predeclare: undefined values in table order, idempotent, never overwrites | 99–111 | 101, 102, 103, 104, 105, 108, 110 | `js/race/car-fields.js:37`; `js/race/car-fields.js:151`; `js/race/car-fields.js:240`; `js/race/car-fields.js:260`; `tools/lib/game-vm.cjs:1` |
| manifest loads car-fields.js before game.js | 113–117 | 115, 116 | `js/game.js:1` |
| precondition: this Node compiles the V8 natives every hidden-class check uses | 119–128 | 120, 121, 123, 124, 126, 127 | `js/race/car-fields.js:37`; `js/race/car-fields.js:151`; `js/race/car-fields.js:240`; `js/race/car-fields.js:260`; `tools/lib/game-vm.cjs:1` |
| game.js makeCars calls CarFields.predeclare once per spawned car | 130–133 | 132 | `js/race/car-fields.js:37`; `js/race/car-fields.js:151`; `js/race/car-fields.js:240`; `js/race/car-fields.js:260`; `tools/lib/game-vm.cjs:1` |
| every key is present on every car after the race is built, and a plain race adds none | 135–158 | 139, 140, 146, 148, 150, 153, 156 | `js/race/car-fields.js:37`; `js/race/car-fields.js:151`; `js/race/car-fields.js:240`; `js/race/car-fields.js:260`; `tools/lib/game-vm.cjs:1` |
| control: the old KEYED-store predeclare leaves every car in dictionary mode (the fast check discriminates) | 170–178 | 176 | `js/race/car-fields.js:37`; `js/race/car-fields.js:151`; `js/race/car-fields.js:240`; `js/race/car-fields.js:260`; `tools/lib/game-vm.cjs:1` |
| predeclare source: one NAMED store per key, in KEYS order | 180–187 | 184, 185, 186 | `js/race/car-fields.js:37`; `js/race/car-fields.js:151`; `js/race/car-fields.js:240`; `js/race/car-fields.js:260`; `tools/lib/game-vm.cjs:1` |
| without the call the cars DO split into several hidden classes (the check discriminates) | 189–199 | 197 | `js/race/car-fields.js:37`; `js/race/car-fields.js:151`; `js/race/car-fields.js:240`; `js/race/car-fields.js:260`; `tools/lib/game-vm.cjs:1` |
| the simulation is identical with and without the pre-declaration | 201–207 | 205, 206 | `js/race/car-fields.js:37`; `js/race/car-fields.js:151`; `js/race/car-fields.js:240`; `js/race/car-fields.js:260`; `tools/lib/game-vm.cjs:1` |
| control: steerSm pre-declared as 0 (not undefined) moves the simulation | 209–214 | 213 | `js/race/car-fields.js:37`; `js/race/car-fields.js:151`; `js/race/car-fields.js:240`; `js/race/car-fields.js:260`; `tools/lib/game-vm.cjs:1` |
| WARM table: unique keys, every group commented, one flat list | 232–239 | 234, 235, 236, 237, 238 | `js/race/car-fields.js:37`; `js/race/car-fields.js:151`; `js/race/car-fields.js:240`; `js/race/car-fields.js:260`; `tools/lib/game-vm.cjs:1` |
| MUTABLE table: unique keys, every group commented, one flat list, disjoint from WARM | 241–251 | 243, 244, 245, 246, 247, 250 | `js/race/car-fields.js:37`; `js/race/car-fields.js:151`; `js/race/car-fields.js:240`; `js/race/car-fields.js:260`; `tools/lib/game-vm.cjs:1` |
| warmShape: every value and sentinel back exactly, no key added, key order kept | 253–261 | 257, 258, 259, 260 | `js/race/car-fields.js:37`; `js/race/car-fields.js:151`; `js/race/car-fields.js:240`; `js/race/car-fields.js:260`; `tools/lib/game-vm.cjs:1` |
| game.js gridUp calls CarFields.warmShape for every car | 263–268 | 265, 267 | `js/race/car-fields.js:37`; `js/race/car-fields.js:151`; `js/race/car-fields.js:240`; `js/race/car-fields.js:260`; `tools/lib/game-vm.cjs:1` |
| a lap plus a pit stop: warmShape changes no value, no field widens outside WARM, the sim is identical | 312–336 | 323, 324, 326, 327, 329, 330, 331, 332, 334, 335 | `js/race/car-fields.js:37`; `js/race/car-fields.js:151`; `js/race/car-fields.js:240`; `js/race/car-fields.js:260`; `tools/lib/game-vm.cjs:1` |
| a race to the flag and results adds no car key and leaves every car in fast mode | 343–359 | 351, 352, 355, 357 | `js/race/car-fields.js:37`; `js/race/car-fields.js:151`; `js/race/car-fields.js:240`; `js/race/car-fields.js:260`; `tools/lib/game-vm.cjs:1` |
| warmDoubles: every value and sentinel back exactly, no key added, key order kept, returns its object | 367–373 | 370, 371, 372 | `js/race/car-fields.js:37`; `js/race/car-fields.js:151`; `js/race/car-fields.js:240`; `js/race/car-fields.js:260`; `tools/lib/game-vm.cjs:1` |
| scratch objects: the named fields are born Double (a fractional store keeps the map); a Smi control re-maps | 434–465 | 445, 446, 448, 449, 451, 457, 459, 463 | `js/race/car-fields.js:37`; `js/race/car-fields.js:151`; `js/race/car-fields.js:240`; `js/race/car-fields.js:260`; `tools/lib/game-vm.cjs:1` |
| game.js declares its scratch literals through CarFields.warmDoubles, and the sim is identical with it a no-op | 467–495 | 470, 483, 492, 493, 494 | `js/race/car-fields.js:37`; `js/race/car-fields.js:151`; `js/race/car-fields.js:240`; `js/race/car-fields.js:260`; `tools/lib/game-vm.cjs:1` |

## tests/unit/car-front-wing-width.test.mjs

Fixture and boundaries: tools/car/parts-sweep.mjs loadParts loads real geometry/parts/teams modules in Node VM. Measures buildComplete frontWing section for all aero entries and all teams.

Assertion semantics: Wing half-width cannot exceed .95 m tyre outer face. Catalog precondition >=20 prevents a vacuous sweep; default width ratio 0.82–0.95 prevents shrinking geometry away. The tyre reference is intentionally repeated, not dynamically read from wheel geometry.

Production entry points: `js/car/car3d.js:3`; `tools/car/parts-sweep.mjs:100`.

| Test / asserted contract | Test lines | Assertion source lines | Production exercised / inspected |
|---|---|---|---|
| no aero option puts the front wing outboard of the front tyre | 40–52 | 42, 49 | `js/car/car3d.js:3`; `tools/car/parts-sweep.mjs:100` |
| no team wingStyle puts the front wing outboard of the tyre | 54–66 | 60, 64 | `js/car/car3d.js:3`; `tools/car/parts-sweep.mjs:100` |
| the front wing still fills the width a wing should | 68–77 | 74 | `js/car/car3d.js:3`; `tools/car/parts-sweep.mjs:100` |

## tests/unit/car-fx.test.mjs

Fixture and boundaries: Seeded RNG 0xca7f; real consts/skidmarks/particles/car-fx in VM with recording particle draw data and governor stub. Selected cases use recording car-draw-vm; VP fixture projects +Z depth.

Assertion semantics: Spark location/velocity/rate depend on scrape and normalized speed; AI skid cadence excludes player/offroad/nonrace. Pool headroom .6/.75, desktop/mobile capacities 256/96 and flares 48/24. Haze chooses nearest powered car <=40 m, attack/release and one-frame marking, wake projection/depth fade. Recycling preserves newest particles; 10/20/60 Hz emission within 3%; shedding divides emission. Source guards pin one wiring site and visual-only writes.

Production entry points: `js/fx/car-fx.js:48`; `js/fx/car-fx.js:102`; `js/fx/particles.js:8`; `js/fx/skidmarks.js:1`; `js/car/car-draw.js:33`.

| Test / asserted contract | Test lines | Assertion source lines | Production exercised / inspected |
|---|---|---|---|
| a bottoming floor at speed throws embers from its lowest point, carried with the car | 71–101 | 78, 80, 81, 82, 83, 84, 85, 90, 91, 97, 100 | `js/fx/car-fx.js:48`; `js/fx/car-fx.js:102`; `js/fx/particles.js:8`; `js/fx/skidmarks.js:1`; `js/car/car-draw.js:33` |
| the spark gate is a share of the car's envelope: same fraction of top speed, same shower, at any PACE | 103–113 | 111, 112 | `js/fx/car-fx.js:48`; `js/fx/car-fx.js:102`; `js/fx/particles.js:8`; `js/fx/skidmarks.js:1`; `js/car/car-draw.js:33` |
| an AI lock-up lays marks on its own cadence — race only, never the player, never off the road | 115–132 | 121, 130, 131 | `js/fx/car-fx.js:48`; `js/fx/car-fx.js:102`; `js/fx/particles.js:8`; `js/fx/skidmarks.js:1`; `js/car/car-draw.js:33` |
| embers and spray leave pool headroom; the plume lingers; a flare is drawn exactly one frame | 134–179 | 137, 139, 142, 145, 152, 154, 156, 160, 161, 164, 165, 166, 167, 168, 172, 175, 176, 178 | `js/fx/car-fx.js:48`; `js/fx/car-fx.js:102`; `js/fx/particles.js:8`; `js/fx/skidmarks.js:1`; `js/car/car-draw.js:33` |
| the mobile tier keeps a smaller pool, a shorter plume and fewer flares | 181–192 | 183, 186, 188, 191 | `js/fx/car-fx.js:48`; `js/fx/car-fx.js:102`; `js/fx/particles.js:8`; `js/fx/skidmarks.js:1`; `js/car/car-draw.js:33` |
| the arc reaches AI front wheels only; a rival's far brake flare fires 40-240 m out, never from a mirror or the player (car-draw VM) | 194–227 | 211, 212, 214, 217, 218, 221, 222, 223, 224, 225, 226 | `js/fx/car-fx.js:48`; `js/fx/car-fx.js:102`; `js/fx/particles.js:8`; `js/fx/skidmarks.js:1`; `js/car/car-draw.js:33` |
| source guards: game.js emits carFx beside the other emitters, before the cockpit continue | 229–237 | 234, 235, 236 | `js/game.js:1` |
| haze: from an onboard eye the anchor is the nearest car AHEAD on power within 40 m; else the player | 255–268 | 257, 262, 264, 267 | `js/fx/car-fx.js:48`; `js/fx/car-fx.js:102`; `js/fx/particles.js:8`; `js/fx/skidmarks.js:1`; `js/car/car-draw.js:33` |
| haze: strength eases in under power (ERS deploy and revs scale it) and decays smoothly on a lift | 270–294 | 274, 275, 276, 278, 279, 280, 288, 289, 292, 293 | `js/fx/car-fx.js:48`; `js/fx/car-fx.js:102`; `js/fx/particles.js:8`; `js/fx/skidmarks.js:1`; `js/car/car-draw.js:33` |
| haze: nobody on power — no anchor, no plume; and nothing stale reaches the post | 296–318 | 301, 302, 304, 306, 307, 309, 315, 317 | `js/fx/car-fx.js:48`; `js/fx/car-fx.js:102`; `js/fx/particles.js:8`; `js/fx/skidmarks.js:1`; `js/car/car-draw.js:33` |
| haze: at() projects the anchor's wake — up 0.85, back 3.5 m — and fades with depth | 320–336 | 326, 329, 330, 331, 333, 335 | `js/fx/car-fx.js:48`; `js/fx/car-fx.js:102`; `js/fx/particles.js:8`; `js/fx/skidmarks.js:1`; `js/car/car-draw.js:33` |
| haze: one anchor — a new car takes it only once the old plume has faded, never a jump | 338–350 | 342, 347, 348, 349 | `js/fx/car-fx.js:48`; `js/fx/car-fx.js:102`; `js/fx/particles.js:8`; `js/fx/skidmarks.js:1`; `js/car/car-draw.js:33` |
| haze: the on-power gate is a share of the car's envelope (vStd), like the other emitters | 352–356 | 354, 355 | `js/fx/car-fx.js:48`; `js/fx/car-fx.js:102`; `js/fx/particles.js:8`; `js/fx/skidmarks.js:1`; `js/car/car-draw.js:33` |
| haze source guards: visual only, wired once, the post shaders' opts.haze unchanged | 358–373 | 361, 362, 363, 369, 370, 371, 372 | `js/fx/car-fx.js:1`; `js/game.js:1` |
| a full pool recycles its oldest particle: the newest emission is never the one dropped | 375–393 | 382, 384, 390, 391, 392 | `js/fx/car-fx.js:48`; `js/fx/car-fx.js:102`; `js/fx/particles.js:8`; `js/fx/skidmarks.js:1`; `js/car/car-draw.js:33` |
| emission follows the requested rate at any frame rate: plank embers at 10, 20 and 60 fps | 395–409 | 407 | `js/fx/car-fx.js:48`; `js/fx/car-fx.js:102`; `js/fx/particles.js:8`; `js/fx/skidmarks.js:1`; `js/car/car-draw.js:33` |
| tyreSmoke/sparks/kickup/scrape shed with PerfGov.autoShed like spray | 411–444 | 421, 422, 423, 427, 428, 432, 433, 437, 438, 442, 443 | `js/fx/car-fx.js:48`; `js/fx/car-fx.js:102`; `js/fx/particles.js:8`; `js/fx/skidmarks.js:1`; `js/car/car-draw.js:33` |
| game.js: FX emit ball and env-probe cadence ride the governor | 446–456 | 448, 449, 450, 452, 453, 454, 455 | `js/game.js:1` |

## tests/unit/car-geometry-decimate.test.mjs

Fixture and boundaries: tools/car/tri-census.mjs loads real Car3D/Parts/Teams/CarGeometry; builds shared gray far-body recipe with factory parts of first team. A single triangle checks identity fast path.

Assertion semantics: Target 1,500 triangles: result 750..1,500, valid distinct indices, normalized normals (1e-6), aligned attributes, bounds within 3%, repeated positions/indices identical. Input preservation checks index length only; no complete deep snapshot, area-degeneracy, topology or appearance/material fidelity proof.

Production entry points: `js/car/car-geometry.js:376`; `tools/car/tri-census.mjs:38`.

| Test / asserted contract | Test lines | Assertion source lines | Production exercised / inspected |
|---|---|---|---|
| the far body decimates under the target and stays a valid mesh | 27–41 | 29, 31, 33, 34, 35, 38, 40 | `js/car/car-geometry.js:376`; `tools/car/tri-census.mjs:38` |
| the silhouette survives: same bounding box within 3 %, and the result is deterministic | 43–52 | 48, 50, 51 | `js/car/car-geometry.js:376`; `tools/car/tri-census.mjs:38` |
| a body already under the target comes back untouched | 54–59 | 56, 58 | `tools/car/tri-census.mjs:70 (farBody)` |

## Comment and coverage findings

- All 201 declared tests are mapped above. Historical issue/PR numbers and measurements in comments are context; this review did not independently reproduce those historical claims.
- camera-ride's test titled “VISOR draws the cockpit rig without the steering wheel…” only inspects dash/bulkhead vertex extents. It does not assert absence of steering-wheel draw calls or column geometry, despite the wider title.
- camera-feel's “snapGameCam is a cut” test explicitly calls CamFeel reset methods; it verifies their effects, not that the real snapGameCam integration invokes all of them. The following snapped-vantage test does exercise bend reset behavior.
- car-fields' comment says native probes must fail rather than silently skip. nativeFast() asserts a function, so its subsequent “if (!fast) return” branch in the keyed-store control is unreachable on normal assertion behavior; the old skip comment is stale. fracKeepsMap may return null on clone-map mismatch and callers explicitly fail that case. No tests were changed.
- car-geometry-decimate uses distinct vertex indices as its nondegeneracy check; collinear triangles with three distinct indices would pass. Its immutability assertion protects index length, not all input attributes. These are coverage limits, not demonstrated production defects.
- camera-defaults' HUD class relation finds CSS class text across all stylesheets, not parsed selectors/computed styles. Its specific class checks and camera-feel/car-fx raw game.js wiring guards are spelling/order dependent; gameSource union improves extraction coverage only where actually used.
- captions' fresh querySelector objects prevent asserting persistent rendered caption text. The test labeled phone-landscape checks CSS text/constant equality; it does not measure a phone viewport.
- decal byte budgets are estimated from fake atlas dimensions and a 4/3 mip multiplier. Recording texture/bitmap ownership proves lifecycle intent; texel parity, GPU memory reclamation and on-device residency need separate evidence. The source comment correctly delegates pixel parity to livery-tier.
- capture-tools covers real functions with injected CDP/DOM/process fakes and offline plans; it does not launch Chromium in this mapping. Tiny 5/10/20 ms budgets establish unit cancellation contracts and may be scheduling-sensitive when executed. Scratch paths, /fixture, remote.invalid URLs, invalid output paths and mocked executables in test data are fixtures, not existing evidence links.
- car-fields performance-map probes depend on the installed V8 implementation, and simulation equality is scoped to their fixed seeds/Monza inputs and sampled state/digest fields. A passing map check would not itself measure frame-time improvement.

The map deliberately records current source locations rather than asserting runtime results. Parent lane owns documentation checks and any commit.
