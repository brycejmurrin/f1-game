# Live debugger hunt — 2026-10-16

Exploratory runtime bug hunt driven by the js-debugger MCP (CDP, headless Chromium + SwiftShader, no real GPU —
nothing here is a player-GPU or long-session claim). Orchestrator `claude:session_013meHKLoGb66QWDCy9zMdPn`, worker
`claude:session_01KXgRNxiNG3mXz2wkEXDbTM`, branch `cursor/live-debugger-hunt-4c7e`.

Not re-reported: `docs/BUGS.md`, `DEFECT-LEDGER.md`, `BUG-HUNT*.md`, and the 7 findings a sibling is fixing (apex.js
aiPlace prog / reset delete, lobby.js pollTimer, hub.js double open, real-race-tab forgetRaw memCache, tlx.js
create-throw listener leak, game.js passHunger alloc).

## Setup

- `python3 -m http.server 3456`; Chrome `--remote-debugging-port=9222 --user-data-dir=scratch/debug-chrome`, headless
  new, SwiftShader. Attached via `debugger_attach`; `debugger_exceptions all` (caught included).
- Trap 1: `game.js?v=dev` line 6271 (`updateCarBicycle`, after `c.px/c.pz` integrate; resolves to 6274:14), condition
  `!Number.isFinite(c.speed) || !Number.isFinite(c.px) || !Number.isFinite(c.pz)`.
  Liveness proven by swapping the condition to `c.speed > 25`: it paused on the natural rAF loop (`tick` → `tickBody`
  → `update` → `updateCar` → `updateCarBicycle`), then the NaN condition was restored.

## Scenario matrix

All runs: `debugger_exceptions all`, the NaN trap armed, `LoopHealth.state()` and warn/error `__apex.logs()` read after
each scenario. Result for every cell below: **no NaN/Infinity trap hit, no caught or uncaught exception pause,
`LoopHealth` faults 0 and not stopped, no new warn/error log** other than the benign `scenery:<id>: suppressed …`
warnings. Software renderer (SwiftShader), `headless(true)` stepping, 844×390 window — a clean run is evidence about
the logic paths exercised, not about a player's GPU.

| scenario | circuits | result |
|---|---|---|
| race + `go()` + 300–400 `step()` with throttle/steer changes (TLX) | vegas, monaco, spa, singapore, monza, suzuka (6) | clean; `physState` all finite |
| race + `go()` + 300 steps on the GLX load (`?gfx=glx`, page href confirmed) | vegas, monaco, spa | clean; backend identity NOT positively confirmed (no hook names it; `Gfx` exposes only `create`) |
| circuit switch mid-session | 6 sequential `race()` calls on one page, then a reload to GLX and 3 more | clean |
| pit: `pit({arm:true})`, 3900 steps (65 s) | monaco | clean, but the throttle-only car never entered the lane (`state:"none"`, `stops:0`) — **pit entry/box/exit not exercised** |
| finish + restart | monaco (`finishRace()` → results, then `race()` again) | clean; fresh grid `prog −150.6` |
| tab hidden → visible (`visibilitychange`, 1.5 s each) | singapore | clean; player resumed, `prog` continuous |
| career: `career({})` + `careerState()` + `garageStep` ×90 | (career save, haas) | clean; no DOM garage open (menu was not on screen) |
| WATCH/replay | — | **not exercised** (no `__apex` entry; needs the Data Hub UI) |
| garage open/close via `#mb-garage` | — | **not exercised** (button exists; race screen was up, only `garageStep` ran) |

Checked and consistent (not bugs): `prog` is negative before the start line (`prog = s − L` on the grid, e.g. vegas
−6088 at s 83); a post-finish `info().track` is `null` in the results state.

## Findings

### Tool observations (js-debugger MCP — not patched, `tools/mcp/` is forbidden)

- T1. `debugger_scripts {filter:"game.js"}` returned `[]` after a race build while the page was still running game.js:
  the 200-row cap fills with ~200 anonymous (`url:""`) scripts and the real script drops out; the breakpoint then
  reports `locations: []` yet is still armed (it paused). Misleading for an agent that trusts `locations`.
- T2. Every `debugger_state` / `debugger_control` response repeats all completed operation results (a 10 KB
  `Object.keys(__apex)` result is re-sent each time). Response-size problem; sibling #2534 owns it.
- T3. `debugger_run` is refused while paused (`Use debugger_evaluate while paused`) — correct, but means a step-driven
  repro must be started before the breakpoint is armed.

- T4. Changing a breakpoint's condition by `debugger_remove_breakpoint` + `debugger_breakpoint` (same url/line) after
  its `locations` had gone `[]` (T1) left the OLD condition armed in Chrome: with the new condition
  `!isFinite(c.speed)||…` it still paused on every step with all values finite (`c.speed` 33.1 m/s, matching the
  previous `c.speed > 25`). `debugger_detach` then re-attach cleared it (`cleanupErrors: []`). Workaround: detach and
  re-attach to change a condition. Likely cause: the tool's registry no longer holds the Chrome breakpoint id once
  `locations` empties, so the remove is a registry-only no-op.

### Deeper pass (core race loop, after the orchestrator narrowed scope)

Same debug Chrome recipe, `debugger_exceptions all` for the whole pass (no pause fired in any of it).

- **Restart storm** (monaco → `race()` ×10 → circuit switch ×5 over spa, vegas, singapore, monza, suzuka): window +
  document listeners flat at 9 before and after (wrapped `addEventListener`/`removeEventListener` after the first
  race), live `setInterval`s 0, `LoopHealth` 0 faults. No listener/timer growth in the restart or switch path.
- **Soak** (monza, `laps:30`, player parked, 22 cars via `cars()` every tick, 150 000 ticks ≈ 41 min of race time, AI
  field reached lap 21): no non-finite `speed`/`prog`, no `prog` regression > 1 m within a lap, HUD gap text never
  contained `NaN`/`Infinity`/`undefined`, `LoopHealth` 0 faults. Camera jump trap never moved (camera follows the
  parked player) so it proves nothing. Only trip: |Δspeed| > 15 m/s in a tick — see F1.
- **Not done:** the stepped physics tick (`into`/`over` through `updateCarBicycle`) and the soak on 3 circuits (monza
  only); the soak needs a driving player to exercise camera/HUD under motion — there is no player autopilot hook.

### F1 — AI does not brake for a stationary human car; the contact deletes ~48 m/s in one tick (medium confidence)

Filed as issue [#2565](https://github.com/brycejmurrin/f1-game/issues/2565) (`bug`, `ready`).

Repro (synthetic: the player is parked, a real player can stall/spin): `__apex.race("monza",null,null,{laps:30})`,
`headless(true)`, `go()`, never give input, `step(1/60)` ~8 000 ticks while watching `cars()` for |Δspeed| > 30.
Hit at tick 7 943 / 8 314 / 8 403 (varies run to run) on lap 1 at the pit straight, the player sitting on its grid
slot (s ≈ 5755.6, x +3.0, `rank 22`).

- Approach trace (car 13, every 6th tick, gap to the player in m / speed m/s): 79.1/54.0, 52.1/54.1, 25.0/54.3,
  14.2/53.6, 9.0/51.2, then the hit at 4.8 m. No braking until ~14 m, speed even rises 54.0 → 54.3 on the way.
- Contact (tick 8 314): car 13 `s 5750.9 x 2.96` 52.81 → **5.09 m/s**; the human car `v 5.1`; both end at the same speed
  (perfectly inelastic, momentum not conserved: the striker loses 47.7 m/s, the target gains 5.1). Neighbours cars
  1 and 5 passed at x −0.12 / 0.4 at ~57 m/s — they avoided the lane, car 13 did not. 2 984 m/s² for one 16.7 ms tick.
- Where to look: AI obstacle awareness for a stationary car ahead in its own lane (`js/physics/ai-drive.js`, racecraft
  session) and the contact response (`js/physics/collide.js`, the incidents session owns it). No fix attempted: > 20
  lines, outside my files, and whether a parked human car should be braked for is a design call.
- Confidence medium: the scenario is synthetic (a player that never moves) and I could not tell from the trace whether
  the one-tick speed collapse is intended "no pass-through" behaviour. The first soak's 60 m/s drop (65.7 → 5.3 on lap
  6, car 7) was the same mechanism but was not captured at the pause.

### Faults

None in game code beyond F1. Six circuits × the driven scenarios above produced no NaN, no exception pause and no LoopHealth
fault. The honest gaps are the cells marked **not exercised** (pit entry/stop, WATCH/replay, garage UI open/close, a
confirmed GLX backend) and prog/lap-inconsistency traps (`c.prog < (c.lap-1)*L - 1`), tyre/fuel/ERS, camera matrix and
HUD gap-format breakpoints, which were not armed (the deeper pass checked HUD gap text and `prog` regressions
in-page instead). No fix and no unit test were warranted, so no `tests/unit/**` change; F1 is filed as issue #2565
(T1–T4 belong to the debugger tool, owned by #2534 — summarised for the orchestrator).

### Cleanup

`debugger_detach` ×3 (`cleanupErrors: []`), debug Chrome (`:9222`) and `http.server :3456` killed by PID, no stray
`chrome` left.
