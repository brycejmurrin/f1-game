# Browser specs map — batch 02

Mapped all 160,000 assigned bytes in 13 parts through 26 individually returned raw chunks of at most 8,000 bytes. Whole-file hashes match the assignment manifest. `specs-02-evidence.json` records whole/part/chunk hashes and intersecting case/assertion ranges. UTF-8 byte ranges are half-open; source line ranges are inclusive. Static mapping only; no tests or browser runs.

Two files are partial: assets-api tail [5707,11242) begins inside the unload case; career-hub prefix [0,11554) ends at the guide describe opener. Enclosing AST spans beyond these boundaries are structural context only, never raw-read evidence.

## `tests/specs/assets-api.spec.js`

Partial tail: starts inside Assets unload case; setup/imports and earlier assertions belong to batch 01. Checks upload teardown, baked-material GL error reader/counter, credits provenance, diagnostic shape/save and stats timer update/teardown. The render-named case checks upload and GL errors, not image nonuniformity despite its comment.

| Case lines | Contract / scenario | Assigned assertion sites |
|---|---|---:|
| 123–133 (partial) | unload returns to the procedural state without erroring | 3 |
| 135–163 | the game still renders with the baked materials fully on | 3 |
| 165–178 | credits cover every baked asset | 4 |
| 180–204 | diag() returns a stable, complete snapshot and can save files | 8 |
| 206–240 | stats() overlay mounts, updates and tears down | 8 |

## `tests/specs/audio-smoke.spec.js`

sharedTest, toMenu, BOOT_MS; one cold localStorage reload and lazy-audio ready mark. Covers sound-off boot, volume clamping, recorded voice/preset persistence and decoded preview interception, narrow layout, race-music restart spy and real AudioContext/engine centroid. Headless rendering preserves audio update; mocks are not an audibility oracle.

| Case lines | Contract / scenario | Assigned assertion sites |
|---|---|---:|
| 37–52 | GameAudio initialises without console errors | 3 |
| 58–127 | persisted SOUND OFF and out-of-range volumes apply on first load | 8 |
| 129–178 | recorded voice choices, radio presets and previews work in the settings panel | 12 |
| 180–211 | re-enabling sound during a race restarts race music | 1 |
| 213–258 | real GameAudio unlock and engine synthesis run after a user gesture | 3 |

## `tests/specs/audit.spec.js`

Fresh fixture loadTrack; afterEach restores physics. Deterministic stepped grid/corner/contact/wall/finite-state regressions, reverse crossing symmetry and lap retiming, explicitly opt-in Bahrain road-follow comparison. Barrier title says full race but samples ten seconds only.

| Case lines | Contract / scenario | Assigned assertion sites |
|---|---|---:|
| 12–30 | race start (bunched grid) settles with no NaN or launched cars | 3 |
| 32–51 | hard cornering forward never false-triggers WRONG WAY | 1 |
| 53–67 | driving backwards across the line does NOT count a lap | 1 |
| 88–131 | crossing the line, reversing back over it and re-crossing counts ONE lap | 3 |
| 133–176 | a lap given back and re-taken is re-timed, not recorded as a sliver | 5 |
| 178–192 | rear-ending a car ahead never INCREASES the player's speed | 1 |
| 194–207 | no car ever clips through a barrier during a full race (Suzuka: ferris + bridge) | 1 |
| 209–228 | extreme tuning + abuse keeps the car finite (tan/grip guards) | 2 |
| 230–254 | road-following: entering Bahrain T1 at speed with no steer stays within track limits | 1 |
| 256–281 | road-following: ROAD_FOLLOW=0 reverts to straight-line in corners | 1 |

## `tests/specs/autopilot.spec.js`

Fresh fixture boot, awaitTrackBuild, headless and pace=1; seeded solo pure-pursuit/braking controller, reset/rivals cleared. Monza/Suzuka require finite state, wall overshoot <1 m and >40% progress; tilt >30%, command jitter and off-road cap. Full lap completion and human driving quality are deliberately unproved.

| Case lines | Contract / scenario | Assigned assertion sites |
|---|---|---:|
| 208–233 | autopilot drives safely and makes progress at ${…} | 4 |
| 240–270 | can drive safely via emulated tilt input | 6 |

## `tests/specs/bahrain-foundation.spec.js`

Plain Playwright plus BOOT_MS. Samples 1200 longitudinal road stations at five lateral offsets against props/glass triangles, excuses overhead clearance; validates trace anchors, relief, walls/ground, geometry and exact required model inventory. Night rebuild repeats validity/suppression checks. Sampling is not exhaustive triangle intersection.

| Case lines | Contract / scenario | Assigned assertion sites |
|---|---|---:|
| 5–222 | Bahrain props stay clear of the racing surface | 20 |
| 224–241 | Bahrain night rebuild keeps geometry valid and models unsuperseded | 5 |

## `tests/specs/boot-guard.spec.js`

Plain Playwright, isolated production-CSP context holding deferred scripts, prepaint storage preferences, context finally cleanup. Routed season-cal failure witnesses exactly one repair navigation; permanent failure pins root-cause overlay. Routes simulate deployment failure, not CDN caching behavior.

| Case lines | Contract / scenario | Assigned assertion sites |
|---|---|---:|
| 40–90 | production CSP allows prepaint preferences before deferred modules load | 7 |
| 93–111 | a ONE-OFF 404 is repaired: one reload, then the game boots | 3 |
| 113–132 | a PERMANENT 404 names the file instead of looping | 4 |

## `tests/specs/browser-ui-hunt.spec.js`

Plain Playwright, uiTestOptions touch/rotation and BOOT_MS. Settings search/cross-links preserve value, focus, scroll and launcher visibility; race Duel help placement and Daily clearing. dataReady injects LAZY_DATA scripts, minimal DOM/styles and deterministic F1API stubs for results/live/export/telemetry. These hub checks do not exercise network integration.

| Case lines | Contract / scenario | Assigned assertion sites |
|---|---|---:|
| 17–33 | settings Back reveals its launcher after rotating the phone | 5 |
| 34–56 | settings cross-links restore their page, scroll and focus before returning to search | 13 |
| 57–82 | search opens caption and hold controls without changing them, and Escape restores the result | 9 |
| 135–178 | Duel help belongs to the Duel control at every grid width | 4 |
| 180–194 | choosing a free Time Trial circuit clears Daily Standard chrome | 5 |
| 196–222 | Results preserves complete driver and team names without table overflow | 2 |
| 224–243 | Results never ellipsises a driver surname on a phone at UI SIZE 200% | 2 |
| 245–279 | Live uses the hub content as its only stacked scroll owner | 7 |
| 281–293 | Export explains the Gather prerequisite before Download is ready | 6 |
| 295–306 | Telemetry explains driver selection and comparison before using lane terms | 6 |

## `tests/specs/camera-driving-hooks.spec.js`

sharedTest headless, awaited race and reset at 844×390; fresh navigation for pre-player rejection. Orbit/cinematic/carOrbit shape/FOV/clamps, corner-side sign, AI target and invalid-index fallback; setSpeed, signed spin/reset of lateral/yaw and additive nudge bounds. Single evaluate prevents live simulation races; no pixel framing oracle.

| Case lines | Contract / scenario | Assigned assertion sites |
|---|---|---:|
| 40–46 | orbit returns fov in result | 2 |
| 48–53 | orbit default fov is 55 | 1 |
| 55–62 | orbit fov clamped to 1–170 | 2 |
| 66–77 | cinematic returns eye/target/fov/az/k | 7 |
| 79–84 | cinematic default fov is 52 | 1 |
| 86–91 | cinematic fov overrideable via opts | 1 |
| 93–111 | cinematic camera outside left corner (k>0) | 2 |
| 113–126 | cinematic camera outside right corner (k<0) | 2 |
| 130–145 | carOrbit returns eye/target/fov/carIdx/speed | 6 |
| 147–152 | carOrbit fov defaults to 55 | 1 |
| 154–159 | carOrbit fov customisable | 1 |
| 161–168 | carOrbit eye different from target | 2 |
| 170–194 | carOrbit works for AI car (non-player) | 7 |
| 196–215 | carOrbit out-of-range falls back to player and sets fallback | 6 |
| 219–236 | setSpeed sets player speed | 3 |
| 238–243 | setSpeed clamps to 0 minimum | 1 |
| 245–250 | setSpeed clamps to 200 maximum | 1 |
| 252–257 | setSpeed false without initialised player | 1 |
| 261–283 | spin rotates heading by deg | 2 |
| 285–304 | spin zeroes vLat and yawRate | 3 |
| 306–311 | spin false without initialised player | 1 |
| 318–324 | nudge adds lateral velocity | 2 |
| 326–331 | nudge adds to forward speed | 1 |
| 333–338 | nudge speed clamped at 0 minimum | 1 |
| 340–346 | nudge both args | 2 |
| 348–353 | nudge false without initialised player | 1 |

## `tests/specs/camera-hooks.spec.js`

Plain Playwright, pinFactorySeat Monaco, awaited race/go, freeze and hidden HUD. Dolly/roadside/tourShots/preview/view contracts, unmoved car and off-centre ground clearance. Camera vectors and debug flags establish geometry, not visual composition. Setup retains a 200ms sleep after go.

| Case lines | Contract / scenario | Assigned assertion sites |
|---|---|---:|
| 29–43 | dolly() places camera in local track frame | 5 |
| 45–57 | roadside() look modes all return valid camera | 5 |
| 59–78 | tourShots() returns n descriptors spanning the full circuit | 10 |
| 80–96 | tourShots({atCorners}) frames each apex from the outside | 6 |
| 98–118 | previewCam() frames any in-game mode without moving the car | 9 |
| 120–135 | view() with no args frames the whole track (not chase) | 7 |
| 137–154 | orbit() never sinks the eye underground at low/negative elevation | 3 |

## `tests/specs/camera-tuner.spec.js`

Plain Playwright 300s describe budget; factory Monza freeze resets all mode tuning. Delayed-script doors block service workers and release gate in finally. Registry defaults, corner-lead dose response, geometric/aim offsets, cross-mode isolation, storage clamps/reset and live panel/global/comfort scopes. previewCam uses road-frame solver; corner lead deliberately uses live pose.

| Case lines | Contract / scenario | Assigned assertion sites |
|---|---|---:|
| 49–94 | a delayed ${…} door cannot reopen after resume and can be opened later | 6 |
| 98–118 | camTune() reports the knob registry; the six offsets default to zero | 6 |
| 143–180 | CORNER LEAD only applies to chase/far, and leads the chase into corners | 9 |
| 182–196 | HEIGHT / DISTANCE / FOV move the solved vantage by the tuned amount | 5 |
| 198–217 | PITCH and YAW rotate the aim without moving the eye | 3 |
| 219–240 | a tuned camera never touches any other mode | 6 |
| 242–257 | values clamp to the slider range, persist, and reset | 5 |
| 259–336 | the pause-menu panel edits the camera you are looking through | 24 |

## `tests/specs/camera.spec.js`

Fixture loadTrack mostly headless; mode registry/CAM/KeyC cycling, storage reload and grid pose. All fixed rigs require finite distinct poses; chase/cockpit/overhead sample presented nonblank, distinct frames using visual-oracle and presented-canvas helpers. TV meta-mode excluded from fixed-vantage comparison; this is not exhaustive pixel quality.

| Case lines | Contract / scenario | Assigned assertion sites |
|---|---|---:|
| 13–26 | camera() reports all modes and switches by id, index and label | 4 |
| 28–42 | the CAM button cycles through every mode and wraps | 1 |
| 44–51 | camera choice persists across a reload | 1 |
| 53–116 | camera rigs have finite distinct poses and representative views render distinct frames | 4 |
| 123–139 | the player has a world pose on the grid, so the chase rig doesn't switch at lights-out | 2 |
| 141–153 | the C key cycles the camera during a race | 2 |

## `tests/specs/car-effects.spec.js`

sharedTest plus freshTest for isolated TLX allocation case; toMenu/pinFreePlay, factory-seat helper, BOOT_MS/awaitTrackBuild. Stepped actual throttle/energy/heat and countdown state witness deploy, exhaust/brake/grid lamps and strobe; no boostFlame behavior claim. TLX memState/flap cache sampled after advance permits +2 live geometry, not long-duration leak proof.

| Case lines | Contract / scenario | Assigned assertion sites |
|---|---|---:|
| 52–64 | exposes a minimal boolean effect-state contract | 1 |
| 66–80 | ERS deployment lights the deploy lamp | 1 |
| 82–101 | brake glow stays off until braking heat crosses its draw threshold | 5 |
| 103–133 | ERS indicator follows actual deployment rather than the boost toggle | 2 |
| 135–142 | steady throttle does not leave the exhaust continuously flaming | 1 |
| 144–166 | a throttle-lift transient can activate the exhaust flame | 3 |
| 185–189 | the rear lights come on for the grid, dry and in daylight | 1 |
| 191–215 | the grid strobe actually animates on the countdown clock | 3 |
| 217–223 | the lights stop once the race goes green | 2 |
| 275–302 | geoLive does not grow over the first stretch of a race (TLX) | 6 |

## `tests/specs/career-hub.spec.js`

Partial prefix: plain Playwright parallel describes, LANDSCAPE and career-boot helpers. Modes screen, backup native download/reapply preserving merged daily classes, separate flavour slot addresses, continue/back/form selection and two-press scoped deletion. readFile checks downloaded JSON; no guide test body is assigned. Prefix ends at guide describe opener.

| Case lines | Contract / scenario | Assigned assertion sites |
|---|---|---:|
| 13–26 | the title button opens it, with or without a save | 8 |
| 28–66 | Daily class merges still allow a native career backup download | 7 |
| 68–82 | an empty slot starts that mode, in that slot | 6 |
| 84–99 | a used slot continues that career | 3 |
| 101–109 | the hub gets back to it | 2 |
| 111–132 | changing mode on the setup form moves the slot with it | 3 |
| 152–163 | a full DRIVER set does not cost MY TEAM its room | 4 |
| 165–183 | deleting frees that slot, and only that slot | 6 |
| 185–201 | arming a delete in one mode does not arm the same slot in the other | 2 |
| 203–223 | deleting everything leaves a screen you can still start from | 4 |

## Production dependencies and cleanup

LSP resolves `GameAudio` to real engine and lazy stub, `CareerBackup` to the backup module, `CamTune` to offsets, `AgentView` to agentview, and `CarMesh.flapState` to car-mesh. `CamTune` references connect tuner-panel, vantage, extra-rigs, apex-cam and game; `CareerBackup` connects career-ui and settings-export. Exact locations and file counts are in the evidence JSON. Dynamic page hooks and stubs limit static call tracing.

No dependencies or comments changed. Cleanup candidates: shorten measured incident narratives in audio/autopilot into durable evidence notes; align the assets render comment with its actual error-state oracle; rename the ten-second barrier scenario; replace the camera setup sleep with a relevant readiness condition if needed. Keep anti-vacuity and same-evaluate reasoning near the assertions. The career shard summary covers more than this assigned prefix.
