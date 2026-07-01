# game.js — structural map

`js/game.js` (~5,400 lines) is the main game module: one anonymous IIFE that
assigns **no global** — its only public surface is `window.__apex` (see
`docs/DEBUG-HOOKS.md`). This doc is the section-by-section guide. Line numbers
are approximate anchors — grep the banner comments (`// ---------- X ----------`)
rather than trusting exact offsets.

Dependencies (globals): `M4, V3, GLX, GLTF, Teams, Tracks, TrackMaps, Car3D,
Input, GameAudio, F1API, DataHub, Parts, Ghost, CircuitPaths`.

## Section index

| # | Section | Anchor / lines | What lives here |
|---|---------|---------------|-----------------|
| 1 | DOM cache | `// ---------- DOM ----------` (~7–40) | `$()` helper, `els` element cache, canvas |
| 2 | Rain overlay | ~41–75 | 2D canvas rain animation (`initRainDrops`, `drawRain`) |
| 3 | Settings & leaderboards | ~76–142 | `store` (localStorage, `apex26.` prefix — see STORAGE-SCHEMA.md), TT leaderboard (`ttlb.<track>`), custom team |
| 4 | Physics constants | ~143–266 | Tuning knobs (`WHEELBASE`, `STEER_*`, `DRIFT`, `PACE`, `LONG_GRIP` …), gear table, `DIFF` difficulty tiers, `CAM_MODES` |
| 5 | Shared state | ~267–310 | ~30 module-scoped vars — the glue: `state` ("menu"\|"select"\|"count"\|"race"\|"results"), `track`, `player`, `cars[]`, `raceT`, sector timing, camera (`camEye/camTgt/camFov/camMode/dbgCam`), mode flags (`timeTrial`, `seasonMode`, `frozen`) |
| 6 | Sky/weather state | ~311–372 | `frame`/`frameSky` lighting state, lightning, clouds, paint materials, scratch sample buffers (`smp/smp2/smpC`) |
| 7 | Helpers | ~373–418 | `clamp/lerp/damp/fmtTime/wrapS` … |
| 8 | Parts / player mods | ~419–434 | `playerMods` from `Parts.getMods` |
| 9 | Car setup | ~435–568 | `makeCars()`, `gridUp()` — build 22-car field, meshes, liveries |
| 10 | Track loading | ~569–628 | async `loadTrack()`, menu flyby scheduling |
| 11 | Race flow | ~629–1272 | **`applyRaceSettings()`** (~630–972: time-of-day/weather → lighting, lightning, paint, per-track atmo bias), countdown, start lights, results, season points |
| 12 | Per-frame update | ~1273–2281 | `update(dt)` field driver + **`updateCar()`** (~1453–2106, the physics/AI core — see below) |
| 13 | Render | ~2282–2914 | `camVantage()` (12 camera modes), `render()`: camera damping/roll, projection, sky, per-car draw, GLX calls |
| 14 | HUD | ~2915–3040 | `updateHud()`, `drawMinimap()` |
| 15 | Main loop | ~3041–3078 | `tick()`: fixed-step physics accumulator (`physAcc`), render interpolation (`rPrevS/rPrevX`), rAF |
| 16 | Car setup panel | ~3080–3270 | Team/parts selection UI |
| 17 | UI wiring | ~3271–4129 | All menu/slider/settings `addEventListener` plumbing |
| 18 | Boot | ~4130–4160 | GLX.init guard, initial state, rAF start |
| 19 | Debug API | ~4161–end | `window.__apex = { … }` — ~50 methods (race/park/jump/obs/act/…) |

## updateCar() sub-steps (in order)

The 650-line heart. All physics and AI for one car, one fixed timestep:

1. Speed targets — `vmax`, AI rubberband
2. AI traffic awareness — lateral clearance L/R, blocker detection, unstuck
3. ERS deploy / overtake-mode arming
4. Braking & throttle decision (player input vs AI)
5. Gear/RPM management
6. Longitudinal integration — accel, slope, drag
7. Steering input — player expo + driving-help assist / AI lane choice
8. Lateral authority vs speed, kerb penalty
9. Banking & grip modulation
10. World-space bicycle model — yaw rate, lateral velocity
11. Per-axle slip angles & forces; combined-slip friction ellipse (`LONG_GRIP`)
12. Yaw/lateral integration
13. Track-frame `(s, x)` update from world velocity
14. Lap & sector timing
15. Collision contact flags (resolution happens field-wide after all cars step)
16. World-position mirror (`px`, `pz`) for telemetry
17. Off-road/grass effects (incl. `offAssistFade` for the road-follow assist)
18. Wrong-way detection & rescue

**Determinism matters**: the headless `obs()/act()/reset()` loop and many specs
assume bit-reproducible stepping. Don't reorder float operations or the car
iteration order casually.

## State machine

```
menu ──(RACE/TT/SEASON)──► select ──(GO)──► count ──(lights out)──► race ──► results
  ▲                                                                             │
  └─────────────────────────────────────────────────────────────────────────────┘
```
`state` gates `update()` and `render()` behaviour; `__apex.race()` and
`__apex.go()` drive it programmatically for tests.

## Hot paths

`updateCar()` and `render()` run every frame (22 cars × 60 Hz physics). Both
snapshot shared state into locals at function entry — keep that pattern; avoid
allocating in these paths (GC spikes are visible on night tracks).
