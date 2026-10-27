# Browser specs map — batch 11

Mapped all 160,000 assigned bytes across 23 text parts with individually returned reads of at most 8,000 bytes. Whole-file manifest hashes match; evidence JSON records distinct whole/part/chunk hashes and every intersecting case/assertion span. Static inspection only; no test or browser execution.

The setup-camera tail begins inside a case; the Qatar prefix ends inside its single case. Enclosing AST spans outside assigned bytes provide boundaries only. Shared helpers are support dependencies, not independently audited here. All files import fixtures; hooks and imported support names are indexed in the evidence.

## tests/specs/parts-setup-ids.spec.js

Camera tail only: distance clamps at 4.55–15.05; dragging stops spin, changes azimuth >0.15 and preserves distance. Setup and earlier assertions belong to the preceding batch.

Assigned [19441,20559), partial file.

| Case lines | Contract | Assertion sites intersecting assignment |
|---|---|---:|
| 365–410 (partial) | zoom is clamped and drag orbits without touching distance | 6 |

## tests/specs/perf-boost-press-pipelines-gl.spec.js

TLX forced WebGL2 landscape touch: backend count reachable, all presses deploy ERS, boostVerdict rejects repeat BOOST pipelines and excess background streams; first press is annotation only.

Assigned [0,3150), whole file.

| Case lines | Contract | Assertion sites intersecting assignment |
|---|---|---:|
| 26–38 | TLX WebGL2: BOOST presses 2..N re-mint no BOOST pipelines and add no background ones | 3 |

## tests/specs/perf-boost-press-pipelines.spec.js

TLX requested WebGPU landscape touch: same BOOST contract, with explicit WebGL2 fallback annotation. Counts are software-valid; phone latency is not measured.

Assigned [0,3579), whole file.

| Case lines | Contract | Assertion sites intersecting assignment |
|---|---|---:|
| 28–41 | TLX WebGPU: BOOST presses 2..N re-mint no BOOST pipelines and add no background ones | 3 |

## tests/specs/perf-frametime.spec.js

Pinned factory seat and seeded closed-loop driver: warm/sample intervals collect frametime percentiles, long tasks and heap. Snapshot >4 frames; baseline regressions only fail in STRICT mode. Updating requires a reason/blessing. Interval and input cleared after sampling.

Assigned [0,7605), whole file.

| Case lines | Contract | Assertion sites intersecting assignment |
|---|---|---:|
| 35–219 | records p50/p95/p99, long tasks, and heap vs baseline | 4 |

## tests/specs/perf-idle-pipeline-churn.spec.js

GAS held, 120 warm frames and six 60-frame idle windows: reachable backend and zero new pipelines per window. WebGPU fallback is annotated.

Assigned [0,2347), whole file.

| Case lines | Contract | Assertion sites intersecting assignment |
|---|---|---:|
| 19–30 | TLX WebGPU: steady driving builds no render pipelines after warm-up | 2 |

## tests/specs/perf-race-entry.spec.js

Full-intro menu race versus practice profiles: entry identity, populated marks, intro/flyby and distinct handoff ownership. Wall-time cap is strict only when configured; emits stage/diff artifact.

Assigned [0,5302), whole file.

| Case lines | Contract | Assertion sites intersecting assignment |
|---|---|---:|
| 63–130 | race vs practice menu entry stages (full intro) | 12 |

## tests/specs/perf-sw-cache-hit.spec.js

Real service-worker settled install caches are snapshotted before Monza race; shell >50 entries, race loads code, no checked same-origin script/style misses. Runtime opt-ins and manifest-derived dev agent files excluded; does not prove offline networking.

Assigned [0,4875), whole file.

| Case lines | Contract | Assertion sites intersecting assignment |
|---|---|---:|
| 34–68 | a first race loads no script or stylesheet the service worker install did not precache | 4 |

## tests/specs/persistence-dom.spec.js

Injected apex26 storage quota failures: collapsible SESSION ONLY warning, race suppression, and downloaded recovery JSON containing live career rather than storage cache.

Assigned [0,3187), whole file.

| Case lines | Contract | Assertion sites intersecting assignment |
|---|---|---:|
| 25–44 | the warning names the session-only consequence and folds away | 10 |
| 46–68 | the recovery export contains game progress, not the storage cache | 8 |

## tests/specs/persistence.spec.js

Healthy and quota/security-failing storage: persistState exception identity, retained warning/reload consequence, session-cache readback and console warning deduplication. Init-script monkeypatch is context-local.

Assigned [0,5289), whole file.

| Case lines | Contract | Assertion sites intersecting assignment |
|---|---|---:|
| 51–55 | a healthy page reports ok | 2 |
| 57–76 | a failing write is recorded, logged, and reported by persistState() | 4 |
| 78–90 | the exception's own name is reported, not a generic flag | 2 |
| 92–100 | the session still reads back what it wrote (a lost save is not a lost session) | 1 |
| 102–115 | the loud warning fires once, not once per write | 2 |

## tests/specs/phone-recorder.spec.js

Mobile landscape navigator share stub: RECORD starts cadence/badge; SHARE sends one valid phone-soak JSON with 120 cadence frames, positive DPR, valid GL, samples and stop marker, then recorder is off.

Assigned [0,2745), whole file.

| Case lines | Contract | Assertion sites intersecting assignment |
|---|---|---:|
| 9–48 | shares one valid JSON soak file and shows the REC badge | 15 |

## tests/specs/photo-studio-conditions.spec.js

Headless paused Bahrain and Home circuit photos: temporary lighting/time/weather changes resolve live, reset and close restore conditions/physics; phone sheets hit-test and fit controls at >=40px. Garage hides track conditions.

Assigned [0,8668), whole file.

| Case lines | Contract | Assertion sites intersecting assignment |
|---|---|---:|
| 28–98 | Paused race photo changes time of day and weather live, resets, and leaves the race untouched | 23 |
| 100–134 | Time & weather controls fit the phone sheet at 852x393 and 390x844 | 6 |
| 136–165 | Title circuit photo changes time and weather for the shoot and restores Home | 8 |

## tests/specs/photo-studio.spec.js

Photo lifecycles cover placed title car, rotation/200% layout, full-resolution captures despite live renderScale, restored camera/focus, durable garage mood, scrolling isolation and accent keyboard navigation. Two native IndexedDB tabs concurrently retain six JPEG photos; other tab closed in finally; CDP detached in finally.

Assigned [0,19281), whole file.

| Case lines | Contract | Assertion sites intersecting assignment |
|---|---|---:|
| 48–96 | Title circuit photo provides a car to place without starting a race | 14 |
| 98–147 | Home photo retains its shot across rotation at 200%, captures, and returns its camera | 10 |
| 149–176 | Garage photo offers the Team tab's room, crew and lighting at phone size and saves the pick | 10 |
| 177–233 | Paused race photo keeps controls reachable at 200% and isolates panel scrolling | 15 |
| 235–267 | Accent lists receive real keyboard events through menu navigation | 11 |
| 271–347 | Two tabs atomically retain six durable photos after concurrent saves | 8 |

## tests/specs/physics-boot.spec.js

Headless Monza short steering drive and braking to standstill: finite combined-slip fields, bounded axFrac/slipFactor, nonzero lateral response and min speed <5. Clears scripted input.

Assigned [0,4018), whole file.

| Case lines | Contract | Assertion sites intersecting assignment |
|---|---|---:|
| 28–60 | player forces write finite combined-slip state after a short drive | 7 |
| 62–90 | brake-to-standstill keeps physState readable (no NaN through dirS blend) | 4 |

## tests/specs/physics-characterization.spec.js

Factory dry Monza fixed seeds: nine acceleration/corner/braking/off-track/BOOST/X/kerb/AI/wet traces compared after 1e-4 rounding. Soft assertions report all scenario drifts; update mode requires blessed reason. Characterization preserves behavior rather than proving realistic physics.

Assigned [0,10211), whole file.

| Case lines | Contract | Assertion sites intersecting assignment |
|---|---|---:|
| 107–187 | the driving model produces the same numbers it did before | 4 |

## tests/specs/physics-fixes.spec.js

Monaco robustness with caution disabled: finite/unwrapped lap distance and backward jump <5m; gentle barrier steering retains >8m/s more than hard steering. Input cleared; timeout 300s.

Assigned [0,6426), whole file.

| Case lines | Contract | Assertion sites intersecting assignment |
|---|---|---:|
| 42–88 | lap distance stays continuous driving wide through Monaco | 4 |
| 95–109 | wall scrub scales with how hard you steer into it (not a flat stop) | 1 |

## tests/specs/physics-hotpath.spec.js

Classic-script AiDrive helper wrappers prove stable scratch identity, firing/nonvacuity, finite >8-car field and wrapped cost <4x reference +250ms; originals restored. Seeded 22-car Collide buckets match full scan to 1e-9 including lap seam/chaser.

Assigned [0,11692), whole file.

| Case lines | Contract | Assertion sites intersecting assignment |
|---|---|---:|
| 14–118 | AiDrive ctx scratches stay reused across physics steps | 9 |
| 120–236 | arc-bucket traffic scan matches full-field on a seeded 22-car pack | 5 |

## tests/specs/picker-edit-button.spec.js

Four phone/desktop viewports seed/save custom track: EDIT is >=36px and in viewport, absent for built-ins, opens matching origin design and returns picker. Cleans custom storage once per session.

Assigned [0,4119), whole file.

| Case lines | Contract | Assertion sites intersecting assignment |
|---|---|---:|
| 10–53 | `EDIT beside CIRCUIT DETAIL on custom circuits only, ${vp.width}x${vp.height}` | 9 |

## tests/specs/picker-tab-inplace.spec.js

Landscape touch seeded custom circuit: switching four filter chips preserves bar/node identity, focus/pressed state and one selected row, with no view transition or child-list mutation. Observer/stub live only within page.

Assigned [0,3684), whole file.

| Case lines | Contract | Assertion sites intersecting assignment |
|---|---|---:|
| 9–57 | circuit tabs swap the strip in place: no view transition, same bar, focus kept | 9 |

## tests/specs/pit-lane.spec.js

Factory Monza/Bahrain pit integration: unarmed free running, armed lane limiter, fresh timed service, racing-line refusal with actual arrival/standstill, drive-through miss, wear-off disabled model, autonomous AI lane use, six crew people and tyre swap mid-hold submitted in chase/cockpit. Mostly headless stepping; rendered crew leg is explicit.

Assigned [0,25752), whole file.

| Case lines | Contract | Assertion sites intersecting assignment |
|---|---|---:|
| 56–118 | the limiter fires only for a car that called a stop | 9 |
| 120–190 | a stop fits fresh tyres and is held for the box time | 8 |
| 192–250 | stopping on the racing line is not stopping in the box | 8 |
| 252–269 | blowing through the box misses the stop | 1 |
| 271–296 | with TYRE WEAR off there is no pit lane at all | 4 |
| 298–350 | an AI car serving a stop drives the lane, not the racing line | 7 |
| 352–493 | during a stop the crew draws and the tyres visibly swap | 15 |

## tests/specs/pit-signs.spec.js

Low preset half-scale Albert Park: 12 atlas cells, uploaded mesh/texture; draw counter advances, meshToggle prevents draws despite calls, clearMeshes resumes submission. Geometry numbers remain companion-unit responsibility.

Assigned [0,2567), whole file.

| Case lines | Contract | Assertion sites intersecting assignment |
|---|---|---:|
| 10–44 | every bay wears its team's sign as one decal, and meshToggle hides it | 5 |

## tests/specs/presets.spec.js

Named preset relative assistance/steering ordering, active persisted selection, ROOKIE stronger than RELAX and manual lock slider returns custom. No hardcoded tuning values; timeout 300s.

Assigned [0,6040), whole file.

| Case lines | Contract | Assertion sites intersecting assignment |
|---|---|---:|
| 47–59 | RELAX is more forgiving than PRO (more help, calmer steering) | 4 |
| 61–66 | clicking a preset marks it active and persists | 2 |
| 68–88 | STANDARD sits between RELAX and PRO on every feel axis | 5 |
| 90–96 | ROOKIE helps at least as much as RELAX and also pulls to the racing line | 2 |
| 98–108 | a manual slider edit drops the preset back to custom | 3 |

## tests/specs/props-over-road.spec.js

Per dynamically discovered circuit, captured props/glass triangles sampled at 1200 centerline points x five track-width rungs: height band 0.20–5m, near-vertical triangle rejection and capped max overlap (Miami 4.2, otherwise 0.20). Empty scope rejected; finite discrete samples do not prove continuous clearance.

Assigned [0,12167), whole file.

| Case lines | Contract | Assertion sites intersecting assignment |
|---|---|---:|
| 184–202 | `${trk}: no prop geometry on/above the racing line` | 4 |

## tests/specs/qatar-foundation.spec.js

Qatar prefix only: night/day shared foundation metadata, authored relief >3 and <7.5m, grade <3.5%, finite geometry. Ends inside explanatory geometry-budget comment; subsequent assertions excluded.

Assigned [0,6178), partial file.

| Case lines | Contract | Assertion sites intersecting assignment |
|---|---|---:|
| 6–157 (partial) | Qatar uses the shared track foundation contracts | 10 |

## Production navigation and limits

LSP resolves PhotoStudio.create at photo-studio.js:85 and its game.js:8844 integration. PitLane.laneX returned a module fallback (definition 1069, export 2067), so caller coverage remains unverified. Collide.forArcNear returned module fallback with scanTraffic, scanOtAhead and scanTow internal uses; no direct named external use was established. Support tools and fixtures were not executed.

Most page mutations rely on fixture context disposal; explicit cleanup includes driver interval/input clearing, restored AiDrive methods, detached CDP sessions and closing the second photo tab. Baseline update branches write data only when their flags/reasons are supplied; mapping executed none. Software pipeline counts and geometry probes establish bounded contracts, not hardware frame latency or pixel quality.
