# Browser specs map — group 07

Static source map; no tests, browser, or runtime executed. All 160,000 assigned text bytes read; six PNG baselines inspected only for metadata. Byte ranges are half-open UTF-8. `specs-07-evidence.json` contains whole-source, part and chunk hashes, structural spans and production usage evidence.

## `tests/specs/lighting-tuner-grade.spec.js`

Bytes [3779, 20046) — partial file; boundaries do not imply complete-case coverage. Image grading section order; COPY ALL arm/fire/undo and condition-disarm; resolved-look copying; registry-derived clamp, persistence, export and shipped reset.

Targets: `js/lighting/lighting.js`, `js/lighting/tuner-panel.js`, `js/lighting/profiles.js`, `js/agent/apex.js`. Headless Bahrain; waits for LightPresets; synchronous DOM dispatch isolates arm timer. One real preview-chip click; storage reads and reload. No rendered grading oracle.

Imports: `../helpers/fixtures.js`.

| Case declaration | Lines | Owned bytes | Coverage |
|---|---:|---:|---|
| IMAGE & COLOUR exposes ordered professional grading sections | 137–145 | [8333, 8918) | Complete declaration; 2 expect subjects intersect |
| COPY ALL arms, spreads the condition to every other track, and undoes | 155–211 | [9519, 12907) | Complete declaration; 8 expect subjects intersect |
| switching the previewed condition disarms a pending COPY ALL | 213–251 | [12910, 15352) | Complete declaration; 4 expect subjects intersect |
| __apex.lightCopy('look') levels every track at that condition, and undoes | 253–275 | [15355, 16626) | Complete declaration; 5 expect subjects intersect |
| new grading controls clamp, persist, reset, and export | 277–327 | [16629, 20044) | Complete declaration; 7 expect subjects intersect |

## `tests/specs/livery-sidewall.spec.js`

Bytes [0, 2409). Creator exposes and edits SIDEWALL INK in WHEELS & BRAKES.

Targets: `js/car/custom-liveries.js`, `js/garage/setup-sheet.js`. Shared page; team 2 custom storage cleared; free-play entry; reveal containing tab. Geometry/colour-array contract delegated to unit twin.

Imports: `../helpers/fixtures.js`, `../helpers/shared-page.js`.

| Case declaration | Lines | Owned bytes | Coverage |
|---|---:|---:|---|
| the creator's WHEELS & BRAKES section offers a SIDEWALL INK colour row | 20–41 | [1011, 2403) | Complete declaration; 3 expect subjects intersect |

## `tests/specs/livery-wheels.spec.js`

Bytes [0, 2353). Creator exposes RIM and CALIPER tint rows and activates edited rim tint.

Targets: `js/car/custom-liveries.js`, `js/garage/setup-sheet.js`. Shared page; same team/custom reset and reveal helper. Does not assert four-wheel mesh colours.

Imports: `../helpers/fixtures.js`, `../helpers/shared-page.js`.

| Case declaration | Lines | Owned bytes | Coverage |
|---|---:|---:|---|
| the creator's WHEELS & BRAKES section offers RIM and CALIPER colour rows | 20–41 | [977, 2347) | Complete declaration; 3 expect subjects intersect |

## `tests/specs/logging.spec.js`

Bytes [0, 5489). Early availability, namespace threshold retention, console tagging, flattened records, track-build events, filters and invalid-level tolerance.

Targets: `js/core/log.js`, `js/agent/apex.js`, `js/track/scenery/build-props.js`. sharedTest racePage/loadTrack/consoleLines; Log.clear in cases; cold toMenu before Monaco unless APEX_VM_PAGE. No performance/memory measurement.

Imports: `../helpers/fixtures.js`, `../helpers/shared-page.js`.

| Case declaration | Lines | Owned bytes | Coverage |
|---|---:|---:|---|
| is live before any game module evaluates | 14–25 | [566, 1151) | Complete declaration; 3 expect subjects intersect |
| retains at the buffer threshold and prints at the console one | 27–43 | [1156, 2149) | Complete declaration; 4 expect subjects intersect |
| prefixes the namespace exactly once | 45–50 | [2154, 2481) | Complete declaration; 2 expect subjects intersect |
| flattens records instead of holding references | 52–66 | [2486, 3196) | Complete declaration; 4 expect subjects intersect |
| a track build reports through it, so the ring explains a build | 68–86 | [3201, 4432) | Complete declaration; 2 expect subjects intersect |
| logs() filters, and a bad spec is ignored rather than thrown | 88–108 | [4437, 5483) | Complete declaration; 5 expect subjects intersect |

## `tests/specs/longitudinal.spec.js`

Bytes [0, 12655). Throttle acceleration, braking/coast ordering, grass drag, speed-sensitive steering, bounded slope response and lap wrap.

Targets: `js/physics/player-forces.js`, `js/game.js`. Factory seat and pace 1; Monza/day/dry; Spa slope scan. Fixed steps; clearInput; lap case restores roadFollow 0. Bounds characterize model rather than exact top speed.

Imports: `../helpers/fixtures.js`, `../helpers/factory-seat.js`.

| Case declaration | Lines | Owned bytes | Coverage |
|---|---:|---:|---|
| throttle accelerates from rest toward a high top speed | 45–74 | [2494, 4176) | Complete declaration; 4 expect subjects intersect |
| braking slows faster than coasting, both slower than throttle | 76–87 | [4181, 4802) | Complete declaration; 3 expect subjects intersect |
| driving onto the grass bleeds speed | 89–107 | [4807, 5821) | Complete declaration; 2 expect subjects intersect |
| steering is speed-sensitive: a tighter line at low speed than high | 109–126 | [5826, 6732) | Complete declaration; 1 expect subjects intersect |
| slope gravity: descents don't overspeed past top speed; climbs aren't a barrier | 128–191 | [6737, 10454) | Complete declaration; 3 expect subjects intersect |
| crossing the start/finish line advances s (wraps) and increments the lap | 193–228 | [10459, 12649) | Complete declaration; 3 expect subjects intersect |

## `tests/specs/map-hooks.spec.js`

Bytes [0, 3295). Normalized map points and world bounds with usable centerFrac orbit input.

Targets: `js/agent/apex-track.js`, `js/ui/track-maps.js`, `js/track/tracks.js`. Headless default preload then Monaco; awaitTrackBuild; 300s. Coordinate-span proxy does not prove geographic north alignment or orbit pixels.

Imports: `../helpers/fixtures.js`.

| Case declaration | Lines | Owned bytes | Coverage |
|---|---:|---:|---|
| mapPts and trackBounds hooks | 7–63 | [318, 3293) | Complete declaration; 13 expect subjects intersect |

## `tests/specs/material-shimmer.spec.js`

Bytes [0, 8935). Compare baked/procedural temporal road luminance delta with motion and nonblank guards.

Targets: `js/render/shared/assets.js`, `js/render/three/tlx.js`, `js/agent/apex.js`. APEX_SHIMMER opt-in; 600s; Monza chase at 70m/s; frozen fixed steps; six frames each; 96×48 crop; restores matTex 1. GPU-sensitive ratio <2; diagnostic not hardware certification.

Imports: `@playwright/test`, `../helpers/fixtures.js`, `../helpers/visual-oracle.js`, `../helpers/soft-capture.js`.

| Case declaration | Lines | Owned bytes | Coverage |
|---|---:|---:|---|
| baked tarmac does not crawl relative to procedural | 106–156 | [5382, 8929) | Complete declaration; 12 expect subjects intersect |

## `tests/specs/menu-baseline.spec.js`

Bytes [0, 12444). Six title/select/garage identity snapshots across phone landscape and desktop.

Targets: `js/ui/title-menu.js`, `js/ui/select-screen.js`, `js/garage/setup-sheet.js`, `css/`. Fixed date; static appearance/headless; canvas hidden; reduced motion; stylesheet/font gates; garage budget cap and ENGINE tab. 1% diff, 60s shot. UI pixels only; renderer/platform-specific PNGs.

Imports: `../helpers/fixtures.js`, `../helpers/garage-sheet.js`, `../helpers/shared-page.js`.

| Case declaration | Lines | Owned bytes | Coverage |
|---|---:|---:|---|
| ${screenName} looks like itself | 64–222 | [3157, 12428) | Complete declaration; parameterized; 1 expect subjects intersect |

## `tests/specs/menu-keyboard.spec.js`

Bytes [0, 46293). Wheel routing, horizontal strip paging/focus, livery virtualization, chip/filter semantics, racing input ownership, modal inertness/order and Escape back/focus restoration.

Targets: `js/ui/menu-nav.js`, `js/ui/layers.js`, `js/ui/modal.js`, `js/input/input.js`, `js/input/pad-menu.js`. Desktop 1440×760; race cases 300s; dispatched wheel events and real keyboard; headless in costly scenes. Scale reset, held keys released; temporary modal probes closed. Some sheets manually revealed; no button actionability proof there.

Imports: `../helpers/fixtures.js`, `../helpers/garage-sheet.js`.

| Case declaration | Lines | Owned bytes | Coverage |
|---|---:|---:|---|
| wheel anywhere on the screen pans the flag strip | 91–111 | [4766, 5798) | Complete declaration; 6 expect subjects intersect |
| a strip already at its end does not swallow the gesture | 113–126 | [5803, 6561) | Complete declaration; 1 expect subjects intersect |
| the first arrow press adopts the current selection | 128–136 | [6566, 7055) | Complete declaration; 2 expect subjects intersect |
| ArrowRight walks the flag strip and scrolls it into view; ArrowDown leaves it for the hero | 138–167 | [7060, 8498) | Complete declaration; 6 expect subjects intersect |
| Home / End jump to the ends of the open menu | 169–178 | [8503, 8975) | Complete declaration; 2 expect subjects intersect |
| PageDown travels about one pane-height at every UI scale | 180–209 | [8980, 10768) | Complete declaration; 2 expect subjects intersect |
| PageDown on the circuit strip hands focus to a visible circuit; the next arrow does not page back | 211–243 | [10773, 12849) | Complete declaration; 5 expect subjects intersect |
| End reaches the last livery card, past the content-visibility render boundary | 245–287 | [12854, 15595) | Complete declaration; 4 expect subjects intersect |
| left/right move along a chip row without leaving it | 289–318 | [15600, 17465) | Complete declaration; 4 expect subjects intersect |
| Enter on a focused circuit selects it | 320–337 | [17470, 18407) | Complete declaration; 1 expect subjects intersect |
| circuit filter tabs and selected circuit expose distinct semantics | 339–361 | [18412, 19994) | Complete declaration; 9 expect subjects intersect |
| with a race running the arrow keys drive the car, not the menu | 363–399 | [19999, 22183) | Complete declaration; 3 expect subjects intersect |
| an open modal is the active layer, not the screen behind it | 415–462 | [23211, 26165) | Complete declaration; 4 expect subjects intersect |
| Tab cannot escape the track-detail dialog into the select screen behind it | 484–534 | [27524, 30510) | Complete declaration; 4 expect subjects intersect |
| with the pause menu up the arrow keys stop reaching the car | 536–560 | [30515, 32194) | Complete declaration; 3 expect subjects intersect |
| every layer's data-esc-close names a real, pressable control | 583–599 | [33255, 34062) | Complete declaration; 1 expect subjects intersect |
| Escape on the circuit picker goes back to the title | 601–608 | [34067, 34586) | Complete declaration; 2 expect subjects intersect |
| Escape in the GARAGE goes back to where it was opened from | 616–629 | [35008, 35957) | Complete declaration; 3 expect subjects intersect |
| Escape on the title screen does nothing at all | 633–645 | [36116, 36780) | Complete declaration; 1 expect subjects intersect |
| Escape closes a sheet without resuming the race under it | 652–684 | [37149, 39145) | Complete declaration; 1 expect subjects intersect |
| a held Escape pauses the race and does not resume it | 690–705 | [39449, 40444) | Complete declaration; 1 expect subjects intersect |
| Escape in the circuit search clears it first, then closes the picker | 708–723 | [40529, 41494) | Complete declaration; 2 expect subjects intersect |
| closing How to Play with Escape returns focus to the title button that opened it | 728–737 | [41724, 42517) | Complete declaration; 1 expect subjects intersect |
| the team picker focuses the current team and a pick returns focus to the garage card | 741–758 | [42681, 44270) | Complete declaration; 1 expect subjects intersect |
| native modal opening order survives reverse DOM order and reopen | 762–792 | [44354, 46291) | Complete declaration; 4 expect subjects intersect |

## `tests/specs/menu-survey.spec.js`

Bytes [0, 13207). Settings mode labels and summaries, tuner rows, touch/button HUD, HUD-off behavior and camera-picker population.

Targets: `js/ui/setting-row.js`, `js/ui/hud.js`, `js/lighting/tuner-panel.js`, `js/game.js`. Portrait and landscape touch; Bahrain/default or Singapore night; in-page clicks and timer polling; gallery screenshots are captures, not golden assertions. Direct hud-hidden mutation tests presentation only.

Imports: `../helpers/fixtures.js`, `../helpers/output-paths.js`.

| Case declaration | Lines | Owned bytes | Coverage |
|---|---:|---:|---|
| 30 settings menu — default (steer TILT) | 79–84 | [4547, 4824) | Complete declaration; 1 expect subjects intersect |
| 31 settings menu — steer BUTTONS | 86–91 | [4829, 5114) | Complete declaration; 1 expect subjects intersect |
| 32 settings menu — steer TOUCH | 93–98 | [5119, 5396) | Complete declaration; 1 expect subjects intersect |
| 33 settings menu — GEARS MANUAL (tilt) | 100–109 | [5401, 5924) | Complete declaration; 2 expect subjects intersect |
| 34 settings menu — SOUND + MUSIC OFF | 111–141 | [5929, 7905) | Complete declaration; 3 expect subjects intersect |
| 35 settings menu — RESOLUTION pinned | 143–148 | [7910, 8186) | Complete declaration; 1 expect subjects intersect |
| 36 lighting tuner | 150–169 | [8191, 9393) | Complete declaration; 1 expect subjects intersect |
| 40 HUD — touch controls | 186–192 | [10022, 10394) | Complete declaration; 1 expect subjects intersect |
| 41 HUD — button steering controls | 194–201 | [10399, 10813) | Complete declaration; 2 expect subjects intersect |
| 42 HUD hidden (clean screen) | 203–226 | [10818, 12285) | Complete declaration; 8 expect subjects intersect |
| 43 camera picker grid | 228–241 | [12290, 13201) | Complete declaration; 2 expect subjects intersect |

## `tests/specs/menu-traversal.spec.js`

Bytes [0, 21932). BFS focus reachability by arrows and simulated D-pad; Escape/B exits; title no-op; fold/select axis handling and garage rail wrap.

Targets: `js/ui/menu-nav.js`, `js/ui/layers.js`, `js/input/pad-menu.js`, `js/input/input.js`. 1280×800 fake standard pad; pinned appearance; headless and fonts settled. Offered MenuNav.items is oracle, so omitted controls escape coverage; synthetic keys lack UA defaults. Real Enter covers folds; filter restored between steps.

Imports: `../helpers/fixtures.js`.

| Case declaration | Lines | Owned bytes | Coverage |
|---|---:|---:|---|
| the title menu, and its lack of a door | 216–222 | [11654, 11987) | Complete declaration; 1 expect subjects intersect |
| the circuit picker: every flag, the filter tabs, the hero and the foot | 224–236 | [11992, 12973) | Complete declaration; 1 expect subjects intersect |
| race settings | 238–250 | [12978, 13711) | Complete declaration; 0 expect subjects intersect |
| settings › ${name}, every fold open | 253–285 | [13979, 15757) | Complete declaration; parameterized; 5 expect subjects intersect |
| a fold opens with Enter and with the pad's A; a select keeps its own axis and leaves on Down | 288–324 | [15766, 18299) | Complete declaration; 9 expect subjects intersect |
| the garage: the category rail reaches every tab, and the panel beside it | 326–348 | [18304, 19840) | Complete declaration; 2 expect subjects intersect |
| in a race: the pause menu, and the DISPLAY page under it | 350–388 | [19845, 21926) | Complete declaration; 0 expect subjects intersect |

## `tests/specs/monaco-foundation.spec.js`

Bytes [0, 9796). Day/night terrain/elevation, source-frame exclusions, tight walls, water projected area, required models, grounding and overhead clearance.

Targets: `js/circuits/monaco.js`, `js/circuits/scenery/monaco.js`, `js/track/tracks.js`. 300s; trackGeometry enabled; await race thenable before diagnostics; 400 profile samples. Geometry assertions do not establish rendered appearance.

Imports: `@playwright/test`, `../helpers/fixtures.js`.

| Case declaration | Lines | Owned bytes | Coverage |
|---|---:|---:|---|
| Monaco owns safe terrain, models, water, overheads, and walls | 5–179 | [113, 9794) | Complete declaration; 25 expect subjects intersect |

## `tests/specs/montreal-foundation.spec.js`

Bytes [0, 4925) — partial file; boundaries do not imply complete-case coverage. Partial setup captures island definition, day/night diagnostics, bridge support footprint grounding, walls, elevation and remote-ground probes.

Targets: `js/circuits/montreal.js`, `js/circuits/scenery/montreal.js`, `js/track/tracks.js`. 300s; scenery-aware nodeAt and footprint-low terrain sample. Assigned span ends inside first expect: no complete assertion is owned here; remaining semantics belong to group08.

Imports: `@playwright/test`, `../helpers/fixtures.js`.

| Case declaration | Lines | Owned bytes | Coverage |
|---|---:|---:|---|
| Montreal island foundation stays grounded, clear, and bounded | 5–205 | [113, 4925) | Partial case; 1 expect subjects intersect |

## Binary provenance and limits

The six Linux PNGs are title/select/garage × desktop (1440×900) / phone landscape (844×390), produced by the parameterized menu baseline test. File identities, sizes, dimensions and SHA-256 values are in the evidence JSON. They are comparison inputs, not proof that current pixels pass.

## Production navigation and cleanup

LSP reference results locate LightTune consumers in photo studio, particles, scenery and game; Log throughout production; MenuNav in pad-menu/modal; UiLayers in modal/input and screen flows; Tracks in game/agent/camera/physics; Liveries in custom-liveries/garage. MenuNav and UiLayers results explicitly use the tool’s untyped-window text fallback. These are ownership clues, not evidence of execution.

No process launched; no runtime or test edit, staging or commit. Persistent changes and resets above are test-source behavior only. Lighting begins mid-comment; Montreal ends mid-assertion, so neighboring groups own missing setup/assertion context.
