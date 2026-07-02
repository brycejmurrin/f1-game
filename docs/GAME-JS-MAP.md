# game.js — structural map

`js/game.js` (~3,590 lines) is the main game module: one anonymous IIFE that
assigns **no global** — its only public surface is `window.__apex` (see
`docs/DEBUG-HOOKS.md`). This doc is the section-by-section guide. Line numbers
are approximate anchors — grep the banner comments (`// ---------- X ----------`)
rather than trusting exact offsets.

Dependencies (globals): the engine + data modules `M4, V3, GLX, GLTF, Teams,
Tracks, TrackMaps, Car3D, Input, GameAudio, F1API, DataHub, Parts, Ghost,
CircuitPaths`, plus the game-subsystem split: `AXC` (config/knobs), `AX` (shared
state) — read directly — and `AXWeather / AXTrack / AXUi / AXHud`, wired at boot
via `.init(deps)`.

## Extracted subsystems (formerly in game.js)

The old ~5,400-line monolith was split; these now live in sibling files (game.js
still drives all boot-time invocation). See `docs/MODULE-GRAPH.md` /
`docs/ARCHITECTURE.md`.

| Was in game.js | Now in | Global |
|----------------|--------|--------|
| Physics constants, gear table, `DIFF`, `CAM_MODES`, tunable knobs | `game-config.js` | `AXC` |
| Shared mutable state, `store`, TT leaderboard, custom team | `game-state.js` | `AX` |
| `applyRaceSettings()`, per-track atmo bias, rain overlay | `game-weather.js` | `AXWeather` |
| `loadTrack()`, `makeCars()`, `gridUp()` | `game-track.js` | `AXTrack` |
| Car-setup panel + all menu/slider/settings wiring | `game-ui.js` | `AXUi` |
| `updateHud()`, `drawMinimap()` | `game-hud.js` | `AXHud` |

## Section index (current game.js)

| # | Section | Anchor | What lives here |
|---|---------|--------|-----------------|
| 1 | Shared namespaces | `// ---------- shared namespaces ----------` (~8) | Destructures constants from `AXC` and state from `AX` into locals |
| 2 | DOM cache | `// ---------- DOM ----------` (~26) | `$()` helper, `els` element cache, canvas, `mm` minimap ctx |
| 3 | Sky/weather anim state | `// ---------- sky / weather animation state ----------` (~101) | `frame`/`frameSky` lighting (on `AX`), lightning, clouds, paint materials, scratch sample buffers (`smp/smp2/smpC`) |
| 4 | Helpers | `// ---------- helpers ----------` (~163) | `clamp/lerp/damp/fmtTime/wrapS/cssCol/smpHw` …, plus closures handed to `AX*.init` |
| 5 | Parts / player mods | `// ---------- parts / player mods ----------` (~209) | `playerMods` from `Parts.getMods`, `recomputePlayerMods()` |
| 6 | Race flow | `// ---------- race flow ----------` (~307) | `startRace`, countdown/start lights, results, season points, `quitToMenu` (lighting now in `AXWeather.applyRaceSettings`) |
| 7 | Per-frame update | `// ---------- per-frame update ----------` (~609) | `update(dt)` field driver (~613) + **`updateCar()`** (~789, the physics/AI core — see below) |
| 8 | Render | `// ---------- render ----------` (~1618) | `camVantage()` (~1629, 12 camera modes), `render()` (~1736): camera damping/roll, projection, sky, per-car draw, GLX calls |
| 9 | Main loop | `// ---------- main loop ----------` (~2240) | `tick()` (~2244): fixed-step physics accumulator (`physAcc`), render interpolation (`rPrevS/rPrevX`), rAF |
| 10 | Boot | `// ---------- boot ----------` (~2279) | `GLX.init` guard, `AXHud/AXWeather/AXTrack/AXUi.init(deps)` wiring, `Input.init`, `DataHub.init`, initial state, rAF start |
| 11 | Debug API | `// --- debug / test hook ----` (~2310) | `window.__apex = { … }` — ~50 methods (race/park/jump/obs/act/…) |

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
