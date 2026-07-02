# game.js — structural map

`js/game.js` (~580 lines, down from the original ~5,400-line monolith) is now
just the boot orchestrator: one anonymous IIFE that assigns **no global**.
This doc is the section-by-section guide. Line numbers are approximate
anchors — grep the banner comments (`// ---------- X ----------`) rather than
trusting exact offsets.

Dependencies (globals): the engine + data modules `M4, V3, GLX, GLTF, Teams,
Tracks, TrackMaps, Car3D, Input, GameAudio, F1API, DataHub, Parts, Ghost,
CircuitPaths`, plus the full game-subsystem split: `AXC` (config/knobs), `AX`
(shared state) — read directly — and `AXWeather / AXTrack / AXUi / AXHud /
AXPhysics`, wired at boot via `.init(deps)`, plus `AXRender` (no init needed)
and `AXDebug` (wired via `.install(deps)`, builds `window.__apex`).

## Extracted subsystems (formerly in game.js)

The original monolith was split across nine sibling files (game.js still
drives all boot-time invocation, but the `AX*` modules call each other
directly at runtime — see `docs/MODULE-GRAPH.md` / `docs/ARCHITECTURE.md`).

| Was in game.js | Now in | Global |
|----------------|--------|--------|
| Physics constants, gear table, `DIFF`, `CAM_MODES`, tunable knobs | `game-config.js` | `AXC` |
| Shared mutable state, `store`, TT leaderboard, custom team | `game-state.js` | `AX` |
| `applyRaceSettings()`, per-track atmo bias, rain overlay | `game-weather.js` | `AXWeather` |
| `loadTrack()`, `makeCars()`, `gridUp()` | `game-track.js` | `AXTrack` |
| Car-setup panel + all menu/slider/settings wiring | `game-ui.js` | `AXUi` |
| `updateHud()`, `drawMinimap()` | `game-hud.js` | `AXHud` |
| `camVantage()`, `render()`, floodlights, car-mesh builders | `game-render.js` | `AXRender` |
| `update()`, `updateCar()`, collisions, `rescuePlayer()` | `game-physics.js` | `AXPhysics` |
| `window.__apex` (~50 debug/test methods) | `game-debug.js` | `AXDebug` |

## Section index (current game.js)

| # | Section | Anchor | What lives here |
|---|---------|--------|-----------------|
| 1 | Shared namespaces | `// ---------- shared namespaces ----------` (~8) | Destructures constants from `AXC`, state helpers from `AX`, and exports from every `AX*` module into locals `game.js` still calls (`render`, `update`, `buildTrackLights`, …) |
| 2 | DOM cache | `// ---------- DOM ----------` (~28) | `$()` helper, `els` element cache, canvas, `mm` minimap ctx |
| 3 | Sky/weather anim state | `// ---------- sky / weather animation state ----------` (~103) | `frame`/`frameSky` lighting init (on `AX`), lightning/cloud state `game-render.js` reads each frame |
| 4 | Helpers | `// ---------- helpers ----------` (~155) | `clamp/lerp/damp/fmtTime/wrapS/announce/gearsManual/autoThrottle/gripMult` — pure helpers; each `game-*` module keeps its own local copy of the ones it needs rather than importing these |
| 5 | Parts / player mods | `// ---------- parts / player mods ----------` (~183) | `playerMods` from `Parts.getMods`, `recomputePlayerMods()`, `syncCustomTeam()` (also invalidates `AXRender.teamMeshes`/`playerBodies` on a livery change) |
| 6 | Race flow | `// ---------- race flow ----------` (~202) | `startRace()`, `endRace()` — the two closures `game.js` still owns that `AXPhysics.init`/`AXDebug.install` need — countdown/results wiring, season points, `quitToMenu` |
| 7 | Main loop | `// ---------- main loop ----------` (~504) | `tick()`: fixed-step physics accumulator (`physAcc`) calling `AXPhysics.update`, render interpolation (`rPrevS/rPrevX`), calls `AXRender.render`, rAF |
| 8 | Boot | `// ---------- boot ----------` (~543) | `GLX.init` guard, every `AXHud/AXWeather/AXTrack/AXPhysics/AXUi.init(deps)` call, `AXDebug.install({ els, endRace, startRace })` (builds `window.__apex`), `Input.init`, `DataHub.init`, initial state, `requestAnimationFrame(tick)` |

For the physics/AI core (`updateCar()` sub-steps, determinism requirements)
see `js/game-physics.js` and the **Physics** section of `CLAUDE.md`. For the
render hot path (`camVantage()`, `render()`) see `js/game-render.js`. For the
full `window.__apex` surface see `js/game-debug.js` and `docs/DEBUG-HOOKS.md`.

## State machine

```
menu ──(RACE/TT/SEASON)──► select ──(GO)──► count ──(lights out)──► race ──► results
  ▲                                                                             │
  └─────────────────────────────────────────────────────────────────────────────┘
```
`AX.state` gates `AXPhysics.update()` and `AXRender.render()` behaviour;
`__apex.race()` and `__apex.go()` drive it programmatically for tests.

## Hot paths

`AXPhysics.updateCar()` and `AXRender.render()` run every frame (22 cars ×
60 Hz physics). Both snapshot shared state into locals at function entry —
keep that pattern; avoid allocating in these paths (GC spikes are visible on
night tracks). **Determinism matters** for `updateCar()`: the headless
`obs()/act()/reset()` loop and many specs assume bit-reproducible stepping —
don't reorder float operations or the car iteration order casually.
