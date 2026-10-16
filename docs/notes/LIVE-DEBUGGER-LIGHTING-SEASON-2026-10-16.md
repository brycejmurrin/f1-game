# Live debugger hunt — lighting and standalone Season (2026-10-16)

Lane: `cursor/live-debug-lighting-season-8d2f` (PR #2567). Debug Chrome (SwiftShader, headless=new,
844x600) on a local `serve`, driven through the `js-debugger` MCP. Software-browser evidence only: no
claim about a player's GPU. **Result: no confirmed defect in either area; no source change.**

## Scope covered
Lighting (day/dusk/night/dawn on 10 circuits, 191 lightTune knobs, lamp cap, mid-race time-of-day) and
standalone Season rules (`SeasonCal` resume, ranking, drop, sprint/classic/FL scoring). Pauses on caught
exceptions during circuit switches.

## Findings table
| id | file:line | severity | verdict | debugger evidence | fix commit | test | issue# |
|---|---|---|---|---|---|---|---|
| L1 Madrid→Bahrain night shows `numLights 0`, `bakedLights 0` for 6 s | none (no lighting code implicated) | low | REFUTED as a lighting defect: `info()` read `state:"menu"`, `track:null` when read back, so `bakedLights` (derived from `G.track`) was 0 | `debugger_run` samples i0..i5 all 0; later `info().state` = `menu`; Singapore→Bahrain run held 40 lights, baked 163 | none | none | none |
| L2 game fell back to `menu` after scripted `race()`+`go()`+`setTimeOfDay()` (Spa, exception pass) | unknown | low | UNCONFIRMED (cause unknown; `Log` ring wrapped past it) | no game-code exception pause; `Log.records` had no `->menu`/error entry in the surviving 500 | none | none | none |
| L1b / L2 root cause: `info()` reads `state: "menu"`, `track: null` for the whole BUILD of every `race()` (log: `State menu->count why=race-start`); a build took 15-64 s under SwiftShader (Madrid 37 s, Monza ~38 s). My scripts waited 10-20 s, then read `lightState()` mid-build | js/game.js `startRace` (no code implicated) | none | BY-DESIGN (harness timeout) | watcher on `info().state`: menu->race Madrid 177386 ms after a 139872 ms race->menu; rows with `st menu` show the PREVIOUS track's lights (nl 40, baked 291); rows with `st race nl 0 baked 0` are tracks still building (heap 146-231 MB) | none | none | none |
| L3 caught-exception pause in game code | js/track/build-client.js:256 `checkLive` throws the `canceled` sentinel | none | BY-DESIGN | pause reason `exception`, frame `checkLive` <- `replay` <- `loadTrackStepped` (game.js:2195) <- `startRaceBody` <- `race()` (apex.js:1466): a newer `race()` superseded a build still replaying; `replay` catches it | none | none | none |
| S2 `sprintIds` keeps a circuit after it is removed from the calendar | js/career/season-cal.js:71 `normalize` | low | BY-DESIGN | SETUP: 2026 REAL + SPRINT ROUNDS, remove Shanghai, APPLY -> config.sprintIds still lists `shanghai`, trackIds (22) does not; re-adding Shanghai shows its SPRINT toggle on again | none | none | none |
| S1 `SeasonCal.resume` with an all-unknown calendar → default 24-round calendar at the stored round | js/career/season-cal.js:263-306 | low | VM-ONLY (in-page call, stale-shell only) | `resume({round:2,config:{trackIds:['x','y']}})` → `round 2, cal 24` | none | none | none |

## Lighting

| probe | result |
|---|---|
| 10 circuits x day/dusk/night/dawn (`race()`, wait for `info().track === id`, `lightState()` NaN scan) | no NaN in any field; `floodEmit` 0 / 0.069 / 0.13-0.175 / 0.233 for day / dawn / dusk / night (Spa night 0.327 and day 0 on every circuit); 31 of 40 rows built within the 10 s wait, the other 9 timed out on SwiftShader and are not evidence |
| all 191 `lightTune` knobs set to NaN, Infinity, -1e9, 1e9, `"x"`, `null` on Singapore night | no throw, no NaN in `lightState()` or `lightTune()`, every knob restored exactly |
| lamp cap: rendered night on Singapore, Vegas, Monaco, Madrid, Jeddah, Bahrain | `numLights` = 40 = `lampCull` wherever a track was loaded (baked 163-271); the cap holds |
| mid-race `setTimeOfDay` day/dusk/night/dawn | each change rebuilds the track (`build start … night=false`), as designed |
| caught-exception pausing (`all`) across 3 circuit switches with time-of-day changes | no pause from game code; the only pause was my own probe script reading a sparse `Log.records` ring |

### Follow-up round

| probe | result |
|---|---|
| lamp-bake across 10 rendered night switches (spa, bahrain, madrid, monza, singapore, spa, vegas, jeddah, monaco, spa) | per-circuit baked counts are stable across repeats (Spa 294 twice with the third read mid-build, Singapore 248, Vegas 263, Jeddah 271, Madrid 241, Monza 291); JS heap returns to 85-106 MB at steady state, no growth. The `lamp bake` Log line was not in the surviving ring (the ring is cleared per race), so atlas size and bake ms were not read |
| frame-lights per-frame cost, steady night scene (Singapore) | INCONCLUSIVE: SwiftShader rendered 3 frames in 15 s (`rankStats`: 3 rebuilds, 0 reuses), too few to show reuse or allocation per frame; `frame-lights-rank-cache.test.mjs` owns the cache behaviour |
| LightEdits bake round trip: `merge-proposals.mjs --dry-run --json` | a valid delta (`singapore|night|dry`, `*|dusk`) reports 2 changed, 0 added, 0 deleted of 1053 profiles; a hostile blob is rejected whole with 5 named errors (value 9999 outside [0, 0.687], unknown knob id, non-number, 2 bad keys); the `__proto__` key of a JS literal is never an own key and is dropped |
| Season SETUP at 844x390 (CDP `Emulation.setDeviceMetricsOverride` mobile, `innerWidth x innerHeight` read back 844x390) | screen fills 844x390, no horizontal overflow, 127 buttons all >= 32 px, none clipped, APPLY/BACK in the header (y 20-64); both panes scroll internally (322 px of 1306 / 1205). Driving the chips: 2026 REAL, SPRINT ROUNDS, quali OFF, 5 laps, FL +1, DROP 2, classic, remove Shanghai, APPLY -> 22 rounds, config persisted as set, screen closed |

Not covered: the `lamp bake` atlas numbers and ms, per-frame allocations (needs a faster renderer than
SwiftShader), the SETUP screen on a real touch device.

## Season (standalone)

Probed in-page against `SeasonCal` with `flow` set to `"season"`:

| probe | result |
|---|---|
| saved season, calendar `[t0, ghost, t1, t2, t3]`, round 3, stage `race`, drop 2 | `resume()` maps to round 2 (t2) and compacts `roundPts` to `[5,3,2]`: correct |
| 3-way tie on 20 points, countback, drop 2 of 6 | order a, c, b: correct |
| sprint-per-round + classic table + flPoint, 12-car order | sprint 8 pts, then GP 10 + FL 1 (d4: 4 + 2 + 1 = 7): correct |
| short race 2 of 5 laps at a sprint round | 0 points (under 50 %): by design |

Not covered: a reload with a round finished mid-way through the real save path.

## Clean areas (do not re-hunt)
NaN in `lightState` across 40 condition cells; every `lightTune` knob under NaN/Infinity/±1e9/string/null; lamp cap at `lampCull`; `resume()` calendar compaction, tie countback, drop, sprint/classic/FL scoring.

## Not run
Browser specs and `test:tooling-fast` (docs-only diff). Per-frame allocation counts (SwiftShader too slow), the `lamp bake` atlas/ms numbers, mid-weekend reload through the real save path.

## Observations (detail)

- O1 `SeasonCal.resume()` of a save whose calendar holds ONLY unknown circuit ids: `remap` is null, the
  config normalises to the full default calendar (24 rounds) and the stored round is kept, so a finished
  2-round season reads as round 2 of 24. The load is flagged lossy, so it cannot be written back.
  Reachable only with a stale cached shell. Not fixed: it needs a product call (restart vs keep).
- O2 RESOLVED (row L1b): in rendered runs the game twice sat in `state: "menu"` with `track: null` after a
  scripted `race()` + `go()` + `setTimeOfDay()` (Madrid then Bahrain; Spa in the exception pass), and
  `lightState()` then read `numLights 0`. Not reproduced on demand (Singapore then Bahrain stayed in
  the race with 40 lights), and the 500-record `Log` ring had wrapped past the transition, so the cause
  is unknown. It is a harness-sequencing suspect (a `race()` issued while the previous build or
  rebuild was still settling), not a lighting defect.

## js-debugger tool problems hit

- The sim keeps running in real time between `debugger_run` calls: take a measurement inside ONE synchronous call. `debugger_source` takes `scriptId` + `startLine` only (no `endLine`/URL). `Log.records` is cleared per race.

- A long `awaitPromise` loop under `headless(false)` on SwiftShader makes `Runtime.evaluate` time out
  and the page refuse `Debugger.enable` until the render settles; one run needed the debug Chrome
  killed and relaunched. A fire-and-forget async script that stores into a `window` global, read back
  later, is reliable.
- `debugger_state` returns every past operation, so its output grows with each probe; reading a result
  costs more context the longer the session runs.
- `Log.records` can hold holes (`undefined` entries): `Array.from(Log.records).map(x => x.level)` throws.

## Next step
Nothing open. A faster renderer (llvmpipe CI box) is needed for per-frame allocation counts.

## Cleanup

Debugger detached (`cleanupErrors: []`), exception pausing set to `none`, debug Chrome and `serve`
stopped by PID, load back under 1.
