# Apex 26 — engineering reference

Unofficial WebGL2 F1 fan game. No build step, no frameworks. Pure IIFE modules
loaded via `<script>` tags. Static files — runs on GitHub Pages.

---

## Key commands

```sh
npx serve -l 3456 .               # run locally (or: python3 -m http.server 3456)
node tools/verify-track.cjs <id>  # headless build check (no browser) — catches a
                                  #   scenery/buildRoad/buildProps THROW that would
                                  #   strand the game on the menu (e.g. a bad ref).
                                  #   Fast pre-push guard for tracks.js scenery edits.
npx playwright test               # run all specs
npx playwright test tests/<file>.spec.js   # single spec
npx playwright test tests/ui-audit.spec.js # → tests/ui-screenshots/
npx playwright test tests/visual-regression-*.spec.js  # pixel-diff regression

# Named test groups (via npm run <script>):
npm run test:smoke      # page load + __apex available
npm run test:api        # __apex contract: dev-tools + headless + obs/act edge cases
npm run test:headless   # headless control loop only (fast, no rendering)
npm run test:physics    # physics regression + elevation
npm run test:collision  # collision, drift, offtrack
npm run test:behaviour  # collision + drift + offtrack + collision-ai-fixes (all behaviour)
npm run test:barriers   # track wall geometry + AI-fixes barrier tests
npm run test:parts      # parts catalog, budget, persistence, physics
npm run test:steering   # presets, sliders, steering modes
npm run test:ui         # all UI screenshots (slow, ~5 min)
npm run test:visual     # pixel-diff visual regression (slow)
npm run test:modes      # season + time-trial game modes
npm run test:circuit    # walls + autopilot + elevation (all circuit-level tests)
npm run test:fast       # curated fast subset: smoke + api + collision + parts (~3 min)
```

---

## File layout

```
js/mat4.js       M4, V3         matrix math
js/glx.js        GLX            WebGL2 renderer
js/teams.js      Teams          2026 grid (11 teams, 22 drivers, engine supplier per team)
js/tracks/*.js   TrackDefs      24 circuits (one file each, registers on Tracks.LIST)
js/tracks.js     Tracks         spline engine, mesh builder
js/parts.js      Parts          upgrade catalog (8 categories, getMods, getCost, statMult)
js/car3d.js      Car3D          procedural F1 car geometry + liveries
js/input.js      Input          keyboard / gamepad / touch / tilt
js/audio.js      GameAudio      WebAudio synth: engine, sfx, music
js/api.js        F1API          Jolpica + OpenF1 clients, localStorage cache
js/data.js       DataHub        data hub DOM overlay
js/game.js       (main)         game loop, physics, AI, race logic, __apex API
css/style.css                   all styles
index.html                      shell — script tags, DOM structure, cache-bust version
tests/*.spec.js                 Playwright test suite (50+ files)
docs/            developer docs (ARCHITECTURE.md, DEBUG-HOOKS.md, SCENERY-API.md, …)
```

---

## Critical conventions

- **Cache busting**: `index.html` uses `?v=N` on every asset URL (currently v=263).
  **Always increment N when changing any JS or CSS file** — search `?v=` and replace
  all instances (`sed -i -E 's/\?v=[0-9]+/?v=N/g' index.html`).
- **No ES modules** — everything is `"use strict"` IIFE, assigns one global. No
  `import`/`export`.
- **localStorage keys** are all prefixed `apex26.` (e.g. `apex26.team`,
  `apex26.parts.mercedes`).
- **Coordinates**: +Y up, distances in metres, angles in radians, arc position `s`
  in metres (0 → track.total), lateral `x` in metres (+right of centreline).

---

## Parts system (`js/parts.js`)

`Parts.CATALOG` — 8 categories: `engine`, `aero`, `suspension`, `brakes`, `tyres`,
`ers`, `gearbox`, `fuel`. Each option has
`{ id, label, cost, desc, speed?, accel?, cornering?, braking?, supplier? }`.
Budget = 600 cr. `Parts.getMods(setup, teamEngine)` returns
`{speed, accel, cornering, braking}` multipliers. Supplier-exclusive options
(e.g. `manu_mercedes`) are only shown when `team.engine` matches.
`unlimitedBudget` (localStorage `apex26.unlimitedBudget`) removes the 600 cr cap.

---

## Physics

Per-axle bicycle model. Key tuning variables in `game.js`: `WHEELBASE`,
`STEER_EXPO`, `STEER_MAX_SLIP`, `STEER_SPEED_REF`, `DRIFT`, `ROAD_FOLLOW`,
`PLAYER_GRIP`, `FRONT_GRIP`, `YAW_DAMP`, `YAW_INERTIA`, `PACE`. Modify via
`__apex.setPhysics(o)` for A/B tests.

**Combined-slip (friction ellipse)**: `LONG_GRIP = 34 m/s²` is the longitudinal
axis of the traction circle. Braking or accelerating consumes longitudinal grip;
`slipFactor = sqrt(1 − (axEstSm/LONG_GRIP)²)` scales lateral grip. Trail-braking
rotates the car; hard braking mid-corner understeers. Exposed via `physState()`
fields `axEstSm`, `axFrac`, `slipFactor`.

**Road-follow assist + off-track**: the `ROAD_FOLLOW` driving-help assist steers
toward the track curvature `k`. It **fades to zero off-track** (`offAssistFade`,
tapering over ~3 m of grass past the edge) so the driver keeps full manual
authority to recover — otherwise the curvature assist keeps steering toward the
corner and the car feels "pushed" one way on the grass. The assist also fades
under hard braking (`brakeFade`) to kill the turn-in snap.

---

## Lighting & sky (`js/glx.js` + `applyRaceSettings` in `game.js`)

Lit shader = directional sun (shadow map) + hemisphere ambient (`uAmbSky`/`uAmbGround`)
+ up to 32 point lights (UBO). Composite: ACES tone-map + `colourGrade` + bloom +
lens flare + vignette. Night: ambient floored+capped, sun dimmed to moonlight,
floodlights on. Day: `_trackAtmoBias` per circuit. `buildTrackLights()` places
floodlights every ~40 m; `setFrameLights()` culls to nearest 32 per frame.

```js
__apex.lightState()           // { ambientSky, ambientGround, sunColor, numLights, … }
__apex.setTimeOfDay('night')  // 'dawn'|'day'|'dusk'|'night'|'default'
```

See `docs/LIGHTING-REF.md` for UBO layout, shader uniforms, time-of-day branches, masts.

---

## City & scenery dressing (`buildProps` / `buildRoad` in `js/tracks.js`)

Procedural per-circuit dressing on top of each track's `scenery(api)` callback.
Session-time-aware (rebuilt on day↔night flip). Street/modern themes get the city
generator (`STYLES[def.id]`): building silhouettes, neon palettes, reflective glass
mesh (`track.meshes.glass`). All 24 tracks get furniture (`FURN`): trees and street
lamps (glow HDR at night). Street circuits get armco barrier liveries (`BARRIER`).
`buildRoad` tints tarmac/verge via a stable per-track hash.

See `docs/SCENERY-API.md` for the `scenery(api)` reference, building kinds, tables.

---

## `window.__apex` dev API  — see `docs/DEBUG-HOOKS.md` for the full reference.

```js
__apex.race("monza")          // load track, skip menus
__apex.park(0.1)              // stationary at 10% lap, frozen for screenshot
__apex.jump(0.5, 60, 0)       // teleport to 50% lap at 60 m/s
__apex.go()                   // start race, grid intact
__apex.finishRace()           // trigger results screen
__apex.freeze(bool?)          // get/set physics-frozen state
__apex.hud(show?)             // toggle HUD visibility
__apex.weather("wet"|"dry")   // live weather change
__apex.setTimeOfDay("night")  // live dawn|day|dusk|night|default — no asset reload (rebuilds only on day↔dark flip)
__apex.resetPlayer()          // force immediate rescue
__apex.carAt(idx?)            // detailed telemetry for one car
__apex.tracks()               // list all circuit ids
__apex.teams()                // list all teams + engine suppliers
__apex.camera("cockpit")      // switch camera mode (clears any view() free-cam)
__apex.view({ s:0.3, side:"L" }) // free debug camera (camera()/snapCam() clear it)
__apex.eyeAt(0.116, 0, 2.5)   // track-relative free-cam: eye at frac/lat/height, look ahead
__apex.orbit(0.116, 45, 15, 35) // orbit a track point (az,el,dist) — inspect from all sides
__apex.carOrbit(0, 40, 10, 4)  // orbit a CAR (idx, az, el, dist) — az 0 = behind, 180 = head-on
__apex.studio({intensity:3})  // studio light rig around the player car (false = off)
__apex.groundY(0.11, 12)      // rendered terrain height + road height + gap at frac/lat (gap finder)
__apex.viewState()            // combined scene/camera snapshot
__apex.camState()             // active camera {eye,tgt,fov,debug} (debug=true under a view() override)
__apex.lightState()           // lighting snapshot: ambientSky/Ground, sunColor, exposure, numLights
__apex.setPhysics({pace:0.8}) // override physics params
__apex.probe()                // player telemetry (x, angle, k, hw, speed, s)
__apex.physState()            // full state (slip, wrongWay, lap, rescueT)
__apex.cars()                 // all car telemetry sorted by prog
__apex.scan([10,30,60])       // look-ahead curvature/width at distances
__apex.corners()              // apex fractions for the loaded track
__apex.wallStats()            // barrier geometry audit
__apex.setInput({steer:1,throttle:true}) // override input
__apex.step(1/60, 10)         // pump physics deterministically
__apex.clearInput()
__apex.tiltSim.step(deg, dt)  // tilt pipeline emulation (for autopilot harness)
// ── Timing & field ──
__apex.timing()               // compact race clock: raceT, lapTime, best, lap, pos, energy, gear, sector
__apex.sectorState()          // live S1/S2/S3 splits: {idx, elapsed, bests[3], last[3]}
__apex.lapHistory()           // completed lap times — full array in TT, best/lastLap in race
__apex.fieldState()           // full grid sorted by race position with gap (m)
__apex.aiPlace(idx,frac,v?,x?) // teleport any AI car (by cars[] index) to a track position
__apex.setEnergy(v)           // set player ERS charge 0–1 (clamped)
__apex.setLap(n)              // override player lap counter (for results-screen tests)
__apex.trackProfile(n?)       // [{frac,y,k,hw,slope}] — elevation/curvature profile (default 100 pts)
// ── Headless / RL control loop ──
__apex.headless(true)         // skip render() — physics runs uncapped
__apex.obs()                  // full debug observation (pos, slip, clearances, scan, reward, gear)
__apex.act({steer,throttle,brake}, dt, n) // set input + step n ticks → obs (1 round-trip)
__apex.reset(frac, speed, x)  // fast episode reset without reloading assets → obs
```

**Note:** `obs()` / `physState()` require `player.px` initialised (`jump()` or one
tick). After `race()` + `go()`, call `jump(frac, speed)` or `step(1/60, 1)` first.

---

## Testing

100+ Playwright specs (50+ files). Run groups with `npm run test:<group>` (see Key
commands). Assert behaviour and geometry via `__apex` hooks — not brittle rendering
magnitudes. Use `obs()`/`act()`/`reset()` for physics, `groundY()` for terrain
geometry, `eyeAt()`/`orbit()` for camera framing. Viewport: `hasTouch: true` for
`#pm-steer`/`#pm-calib` tests; landscape `{width:844, height:390}` for in-race.

See `docs/TESTING.md` for spec coverage table, fixture docs, and philosophy.

---

## Steering modes

`steerMode`: `"tilt"` | `"buttons"` | `"touch"`. Set via `#pm-steer` in pause
menu. `autoThrottle()` returns true when mode is `"buttons"` or `"touch"` (hides
the gas pedal). Calibrate button (`#pm-calib`) hidden unless mode is `"tilt"`.

---

## Git branch

Active development branch: `claude/f1-game-project-26h3ng`. Never push to main
without review.
