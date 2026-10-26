# Live debugger hunt — cars, ghosts, field LOD (2026-10-16)

Lane: `cursor/live-debug-cars-9b4f`. Tool: js-debugger MCP on a SwiftShader headless Chrome (844x600). Software-browser
evidence only: no GPU, device or long-session claim follows.

## Scope covered

Ghost share encode/decode/fuzz and Ghost record/finish (live page); FieldLod selector (live page, plus a logging breakpoint on
a real 22-car Bahrain start); Car3D builds, Parts and Helmets APIs (node vm over the real files); car-mesh cache bounds
(read-through); input-ghost validation (read-through).

## Findings

| id | file:line | severity | verdict | debugger evidence | fix commit | test | issue |
|---|---|---|---|---|---|---|---|
| C1 | js/car/ghost.js `record`/`finishLap` | medium | CONFIRMED-LIVE | `debugger_run` in the page: a NaN frame at i=5 -> `finishLap` true, `at(0.55).s` null (NaN), snapshot `[30,40,NaN,60,70]`, `GhostShare.fileExport(...).ok` false | c46a007d | `tests/unit/ghost.test.mjs` (2 new, failed before) | none |
| C2 | js/car/helmets.js `designFor` | low | BY-DESIGN (unreachable: only caller passes the roster's numeric number) | node vm: `designFor("constructor"/"__proto__")` returns a non-design object | none | none | none |
| C3 | js/car/input-ghost.js `finishLap` | low | BY-DESIGN (callers always supply context + initialState) | read-through only | none | none | none |

## Clean areas (do not re-hunt)

`GhostShare.decode` against 16 malformed inputs; `FieldLod` tier/parts/nearest/lensK2 incl. NaN/Inf/negative; Car3D geometry
for 11 presets x 4 variants and every team x catalog option (3 267 builds, no NaN/index/normal/determinism defect, flat heap);
`Parts` API garbage fuzz; car-mesh caches `_compoundRings`, `_mirrorFbMeshes`, `_mirrorGlassMeshes`, `_flapSets`, `_crewMeshes`.

## Not run, and why

Live whole-race LOD with camera cycling, `renderer.info.memory` over 20 team switches, input-ghost replay drift at lap end,
ghost on a reversed/shifted circuit: SwiftShader renders ~0.4 fps here. Browser groups `audit car modes tiny` from pick-tests:
the fix is a 3-line guard covered by the unit test.

## Ghost share decode (live, `GhostShare.decode`)

Round trip of a 200-sample lap: ok. Rejected as `corrupt` (no throw): truncated by 10 chars and by half, garbage body,
empty, null, number, magic only, one flipped character (hash mismatch), `%`-bad URL fragment, 100 zero chars, 70 000-char
body, `{"v":1}`, `[]`, a `__proto__` body, a 5 000-deep nested string. A `#ghost=` URL decodes. A file export for another
circuit decodes with its own track and `hasGuest()` follows the circuit.

## Field LOD

Pure selector, driven in the live page (the same `FieldLod.tier` the render loop calls, with a per-car `_lodTier`):
132 000 car-frames (22 cars, a camera orbiting at 200 m, the lens switching 60 deg <-> 18 deg every 1 000 frames): 494 tier
changes, all at a real boundary or a lens switch (a lens change moves every car's reference distance at once, so
hysteresis cannot and should not absorb it). A car jittering +-6 % around 120 m: 0 flips; +-15 % around 50 m: 315 flips,
which is correct because the hysteresis band is +-10 %. NaN/negative/undefined/null distance -> tier 0 (full detail, the safe
side; a stuck tier 2 resets to 0 for that frame only); Infinity -> tier 2; `nearest()` never keeps a NaN-distance car.
`lensK2` of NaN/0/3.2 -> 1. A conditional logging breakpoint at `game.js` tier call collected 274 samples of a real 22-car
Bahrain start (12-15 distinct cars, 0 NaN, 0 flips, all tier 0 on the grid).
**Limit:** SwiftShader renders ~0.4 fps in this container, so a long live race with camera cycling was not feasible; the
whole-race LOD behaviour is covered by the pure sweep above, not by a live lap. `renderer.info.memory` growth over 20 team
switches was not measured for the same reason (the GPU process pegs two cores).

## Car builds (node vm over the real Car3D, 3 267 builds x2)

Every FACTORY preset (11) x {default, silhouette, field, cockpit-noWheels}: no NaN/Inf in pos/nrm/col, every index in
range, indices a multiple of 3, normals unit length. Then every team x every catalog category x every option (3 267 builds,
each built twice): 0 NaN, 0 out-of-range index, 0 non-unit normals, 0 builds whose vertex/index count differs between two
identical calls (no hidden state), process heap flat at 61 MB (no retained geometry). `Parts` fuzz (null, `__proto__`,
`constructor`, polluted prototypes, NaN ids) through `resolveSetup/getMods/getCost/aeroLoad/ersProfile/legality`: no throw,
no prototype pollution. Mesh caches reviewed for unbounded growth: `_compoundRings` (keyed by tyre colour, a handful),
`_mirrorFbMeshes/_mirrorGlassMeshes` (keyed by the memoised `cockpitMirrorGlass` quads, bounded by the clamped mirror scale),
`_flapSets` (capped at 64), `_crewMeshes` (capped): none grow with team switches.

Observation (not fixed, unreachable): `Helmets.designFor("constructor" | "__proto__" | "toString")` returns a non-design
object because `DESIGNS[num]` finds an inherited property; the only caller passes the roster's numeric driver number.

## Input ghost / reversed circuits

Read-through of `input-ghost.js` validation: a v3 lap whose first step lacks `initialState`, or recorded with no
`context`, fails `valid()` in `finishLap` and the lap is dropped silently (returns false, one Log.warn path only for the
storage budget). `session-records.js` always passes a context key and the native adapter always sends `initialState`, so this
is not reachable today. Replay determinism at lap end needs a live lap and was **not run** (see Limit above); the replay
specs cover it. A ghost for another circuit is refused by id (`hasGuest(trackId)`), and `validGhost` bounds `s` to three laps
of the declared circuit length, so a shifted/reversed layout cannot index outside the trace.

## Round 2 (short focused live runs, headless page, 22-car Bahrain grid)

| id | area | verdict | evidence |
|---|---|---|---|
| R1 | field LOD, 600 ticks | CLEAN (CONFIRMED-LIVE) | `__apex.step` 600 ticks of the real 22-car field; camera orbit radius 10-430 m with the lens switching 60 deg <-> 18 deg every 150 ticks; `FieldLod.tier` per car with its own `_lodTier`: 13 200 car-frames, tiers [840, 2542, 9818], 0 NaN distances, 87 tier changes total, worst car 9 in 600 ticks (every one at a radius or lens change; no every-frame flip). Positions were approximated as (lateral x, prog) because `__apex.cars()` has no world position. A consistency probe using `parts(d2)` showed 2 921 "mismatches" that were my probe: `parts()` takes no fov (lens 1) while my `tier` used the swept fov. |
| R2 | memory over team swaps | NOT MEASURED (GPU) / JS side CLEAN | `__apex.garageTeam` returns `garage_closed` without the garage UI open; `renderer.info` is unreachable. In-page JS heap over 10 rounds of all 11 factory builds is a sawtooth (2.4, 50.3, 47.0, 15.3, 37.4 MB over baseline, no GC forced), not monotonic; the node run (3 267 builds, flat 61 MB) is the stronger evidence. |
| R3 | input-ghost replay drift | CLEAN (CONFIRMED-LIVE) | 600-step tape (seeded random steer/throttle/brake, partial pedals, 8-bit quantised), `reset(0.02, 55, 0, 4242)`: original `physState` s = 267.7161807241751, x = 7.593483937139032, speed 4.534561177369502; replay through `IG.atStep` identical to the last bit (dS = 0, dX = 0), two replays identical, and identical again after `flush()` + `setTrack()` reload from storage. |
| R3b | input-ghost v3 gate | BY-DESIGN (see C3) | the same tape with `aero/overtake/shiftUp/shiftDown` flags made `finishLap` return false (flags > 3 select v3, which needs `context` + `initialState`); the game supplies both. Confirms C3 live: a silent drop, not reachable from `session-records.js`. |
| R4 | ghost on a reversed/shifted circuit | CLEAN (CONFIRMED-LIVE) | `GhostShare.contextNotice` with `layout` "v1" vs "v1-rev": "Rival settings differ: circuit version."; cyclic, `{{`, null, `[1]` and `__proto__` contexts: "Rival settings are unavailable to compare." (no throw). A guest whose `s` starts at 5 300 m interpolates; `timeAt(5436)` = 4.533 s, `timeAt(0)` = 0, `timeAt(1e9)` = 9 (clamped). `GhostShare.at()` returns a pooled object (read it synchronously); my first probe read three results after the fact and saw the last value three times. |

## Debugger tool observations

- `debugger_evaluate` while not paused returns "Missing argument: pauseToken"; use `debugger_run` for page-level evals.
- `debugger_run` has no `allowSideEffects`; a 25 s `awaitPromise` sleep returned status `unknown` ("Runtime.evaluate
  response timed out") and the following `detach` and `attach` both timed out until Chrome was killed (a conditional
  breakpoint plus a 0.4 fps SwiftShader page).
- `debugger_state` replays every past operation result on each call, so the reply grows with the session.
- `debugger_scripts` takes no filter argument and returns all ~270 scripts.
- `debugger_state` keeps reporting the pre-navigation `about:blank` URL/title after `location.href=...`; evaluation runs in the real page.
- Navigating a blank target and calling `headless(true)` before `race()` kept the page responsive (load < 1): a 600-tick step loop returned in seconds where the rendered page managed 0.4 fps.

## Next step

Fast-tier CI (run-ci label, run #38972529773), `ready-gate.mjs --pr 2564`, then mark ready and report CI-GREEN. Only GPU-side memory over team swaps remains unmeasured.
