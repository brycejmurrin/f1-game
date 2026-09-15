# Mechanics coherence implementation

Baseline: `b8eb25af8f984396128f0636c0fe9611eabb3f36` on
`claude/f1-game-project-26h3ng`. Work branch: `claude/mechanics-coherence`.

The [complete survey](../research/MECHANICS-OPPORTUNITY-SURVEY-2026-09-14.md)
records the inspected mechanics, reproduced defect, primary web references,
priorities, and exploratory ideas. This checklist distinguishes implemented
behavior from hypotheses and future work. It does not mark the whole survey
implemented.

## Implemented changes

| Area | Behavior | Evidence / limitation |
|---|---|---|
| Contact candidates | Conservative 5.2 m bound covers both rotated human bodies, including the lap seam | Actual `Collide.pairContact` regression; existing approximate narrowphase retained |
| AI grip | Planner corner speeds solve the same speed taper used by steering and yaw authority; tyre grip, wear, wake and aero load feed the envelope | Analytic envelope checks and unchanged Monza racing-line/stability thresholds; this is the AI envelope, not identical player/AI physics |
| Setup | Front/rear roll stiffness redistributes lateral transfer across four load-sensitive contact patches | Works setup remains exactly neutral; a calibrated approximation, not a suspension solver |
| Weather | One continuous global wetness drives grip, tyre suitability and rendered road wetness | Dry/rain transition checks; explicit weather override cancels the transition |
| Records | Physics/layout/car/tuning/control/weather identity separates TT records and ghosts | Mid-lap configuration changes reject the lap; scheduled weather evolution retains one identity; legacy records remain stored |
| Daily | Standard McLaren works class and open setup class are both selectable | Standard applies runtime physics and factory parts, restores preferences on exit; controls and tyre-wear modes remain separate comparable classes |
| Driving feedback | Optional front/rear/brake-limit advice, actual steering/pedal/slip/force trace at 10 Hz | Off by default; bounded to 60 seconds and downloadable from pause menu; no driving intervention |
| Practice | Solo TT checkpoint/retry restores car pose and scalar dynamics, clears incident/debris state | Practice laps cannot set best laps, ghosts or records; unavailable in daily, multiplayer or normal races; not whole-world rewind |
| Pit strategy | Owned next-compound selection plus automatic fallback; estimated loss and trailing gap | Lane travel plus stationary time, using estimated road pace; not a guaranteed rejoin position or full undercut simulation |
| Engineer | Caution advice reports cheaper stops instead of promising free stops | Red flags excluded from stop-discount calls; critical announcements take priority over coach cues |
| Multiplayer strategy | Reliable bounded tyre/pit state on periodic refresh and state transitions | Receiver race epoch rejects stale same-track events; host accepts only sender-owned car; reliable relay covers guests |
| Compatibility | Physics/event revisions exchanged when race sessions bind | Existing deployment handshake remains; mismatched model ends the session with reload guidance |
| Interpolation | Arrival jitter adjusts presentation delay up to 180 ms | Presentation clock cannot rewind; collision prediction remains independent; fixed-delay test mode preserved |
| Performance | Raw frame p50/p95/p99/max and dropped simulation backlog exposed through `__apex.renderScale()` | 2,048-frame rolling window, cumulative step/drop counters reset per race; not GPU timings or a sustained hardware benchmark |

## Player flow

- Time Trial circuit selection offers **DAILY STANDARD** and **DAILY OPEN**.
- Pause → **DRIVING & PRACTICE** enables the coach, downloads its trace, sets or
  retries an unscored practice checkpoint, and selects the next pit compound.
- A checkpoint makes the rest of that session practice. Restart the session to
  return to scored laps. Retry restores the car, not the whole race clock.
- Results compare the current setup and conditions. Menu bests explicitly span
  setups; old records are retained rather than silently promoted into new classes.

## Complete remaining opportunity register

These are not shipped by this change. The survey intentionally included
experiments and larger product features; each has an explicit prerequisite.

| Opportunity | Next concrete work / acceptance |
|---|---|
| Tyre-curve shoulder, post-peak drop, relaxation | Use exported constant-radius, brake-release and slalom traces to establish a complaint and tune one opt-in model; retain original stability thresholds |
| Wheel angular dynamics, true lockup/wheelspin, brake temperature | Introduce torque-balanced wheel state and combined slip before claiming physical lockup or brake fade; validate stopping distances and low-speed stability |
| SAT contacts, angular response, swept driving contacts | Stable contact point/normal, separation without energy creation, high closing-speed scenarios and ownership/handback checks |
| Progressive handling damage | Depends on stable contact response; explicit damage components, optional mode and repair consequences |
| AI corridor scoring and decision overlay | Score stay/inside/outside/yield/exit using reachable paths and commitment; measure clean passes, contacts, aborted attacks and recovery separately |
| Rival tendencies and team orders | Expose existing traits and team cooperation with visible reasons; avoid hidden pace changes |
| Sector wetness, drainage, drying line, puddles | Extend the shared global wetness contract to a spatial field consumed by physics, graphics and strategy |
| Separate pit road | Branching path geometry, entry/exit merge rules and scenery clearance per circuit; prior failed prototypes are documented in `pit-lane.js` |
| Undercut/overcut and stint life forecast | Calibrate actual tyre pace versus wear and lap count; combine with current pit-loss estimate and display uncertainty |
| Race-length wear calibration and optional weekend allocations | Compare short/full race strategies; distinguish weekend sets from garage inventory |
| Energy forecast and sector deployment | Learn consumption from completed sectors; forecast confidence and explicit manual override |
| Sector retry, braking/trail-braking drills, ghost speed delta | Build on unscored checkpoints and trace; target maneuvers with measurable completion criteria |
| Incident/penalty timeline | Persist ordered event reasons and clock references; include invalid-lap explanation and avoid duplicate settlement |
| Hazard severity | Blocked road width and approach speed with spun-car, debris and restart scenarios |
| Career practice, circuit mastery | Versioned sector objectives and clean-race goals using the records foundation |
| Sponsors, reliability forecasts, season regulations | Explicit competing goals and maintenance choices; multi-season balance and persistence migration before optional regulation changes |
| Result cards and short highlights | Class identity on cards; bounded event/replay capture and deterministic restoration before highlights |
| Axle/proximity audio and engineer verbosity | Prioritized scrub, rear slip and spotter sounds; critical calls interrupt flavor without stacking |
| Accessibility and device profiles | Audit existing remapping, tilt, touch, camera shake, captions and photo mode; add missing equivalents with real keyboard/touch/gamepad checks |
| Connection-quality UI and reconnect | Surface existing lag plus new interpolation timing; honest connection states; actual multi-peer disconnect/rejoin validation |
| Future ranked authority | Separate product/protocol design from the existing casual peer-owned driving model; no claim of anti-cheat authority |
| Material reference scene and renderer parity | Fixed camera/exposure, neutral matte/metal/clearcoat samples and identical weather across GLX/WGX/TLX; positive live boot evidence for each |
| Sustained desktop/mobile graphics | Fixed 10-minute busy wet race with device, adapter, resolution, quality, frame percentiles, backlog and memory recorded |
| Shimmer / temporal rendering | Road markings, fences, specular highlights and camera cuts; mip/filter/roughness work before a complete motion/history-aware TAA implementation |
| Compressed textures | Preserve material-array indexing, color space and fallback; compare peak decoded memory, GPU allocation and upload stalls |
| Trackside art and contact shadows | Concentrate readable markers and detail at braking/passing zones with a frame-time budget |
| Photo mode | Already present in this checkout; reuse and verify existing camera controls instead of creating a duplicate |

## Repeatable measurement protocol

Driving trace JSON includes physical revision, complete record configuration,
race time, speed, steering command and angle, pedal demands, axle slip/force
utilization, yaw, longitudinal use, energy, wetness and practice status. Enable
the coach, record a maneuver, pause and download. Use the same setup, controls,
track position and initial speed for comparisons. Four maneuvers: steady radius,
straight braking into brake release/turn-in, slalom, and exit acceleration.
A trace is observational; it does not establish subjective driving quality.

Use the existing graphics harnesses (`tools/gfx/gfx-probe.mjs`,
`tools/gfx/gpu-census.mjs`, `tests/specs/material-shimmer.spec.js`) rather than
creating another renderer or benchmark runner. For sustained measurements,
sample `__apex.renderScale()` repeatedly through a fixed 10-minute race and
retain each 2,048-frame window with adapter/quality/viewport identity. Do not
average percentiles and call that the full-run percentile. `droppedSimS` and
`physicsSteps` are cumulative within that race. Backlog loss counts discarded accumulator time, excluding paused time and the separate wall-time clamp after long frame gaps. Real-device validation remains
required; a software renderer is useful for correctness, not hardware FPS.

## Verification

Focused Node/VM checks cover the reproduced contact, planner/controller envelope,
works setup neutrality, record identity/history, weather continuity, checkpoints,
pit advice, frame statistics, strategy authority/epoch and jitter. The existing
AI racing-line and stability suite passed without loosening its thresholds.
The initial AI conversion regression was fixed before this result.

Focused validation logs:

- `artifacts/logs/ai-coherent.log`: 4/4 existing AI racing-line/stability cases.
- `artifacts/logs/coherence-final-unit.log`: 68/68 physics, record, daily and network tests.
- `artifacts/logs/coherence-gate-repair.log`: 152/152 focused guards and integration checks after fixing the first gate's five metadata/UI-contract failures.
- Final full fast gate: **188/188 test files passed**; cache consistent. `artifacts/logs/coherence-verify-final.json` is partial only because deferred groups were not run.
- Precommit guards: **178/178 tests passed** (`artifacts/logs/coherence-guards.log`).
- Publication follow-up: upstream `693cef10` added physical pit-lane placement and lamp rendering changes. The pit API merge preserves both its lane-position exports and this change’s strategy controls. Combined structural ceilings retain both branches’ exact additions. The original 188-file verdict predates this follow-up; merged-tree verification is recorded in `artifacts/logs/coherence-upstream-verify.json`.

Rendered validation was blocked. Cloud Browser rejected the local URL
`http://127.0.0.1:3456` with `ERR_BLOCKED_BY_CLIENT`. The repository's Chromium
installer then exhausted its CDN download attempts with 30-second timeouts;
no local browser was available. No screenshot, real GPU, touch, visual
layout or subjective driving-feel sign-off is claimed. The existing time-trial
browser spec now contains desktop (1280×800) and mobile landscape (844×390)
coach/checkpoint/compound coverage, but it has not run here.

Deferred selection: car, circuits, collisions, hooks, modes, net, physics-core,
tiny, ui, agent-contract, audit, garage-unit, net-unit and state-unit. Some
underlying Node tests were run individually; this does not imply those entire
groups passed. Run the time-trial and physics-characterization browser specs
first when Chromium is available.

## Structural budget changes

`game.js` gains four façade members for the extracted records/coach and shared
wetness/control identity. Time-trial settlement and weather math moved out of
that file; its source/code-line ceilings do not grow. The dev API gains one line
that invalidates a lap when physics is changed. The shell gains 12 real nodes
for accessible practice/strategy controls, and the shared button binder adds
one dynamic-ID read site. Ratchet ceilings are raised only by those exact
structural deltas; no physics or AI test tolerance is raised.
