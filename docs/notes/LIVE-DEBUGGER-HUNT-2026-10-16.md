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

### Faults

None in game code. Six circuits × the driven scenarios above produced no NaN, no exception pause and no LoopHealth
fault. The honest gaps are the cells marked **not exercised** (pit entry/stop, WATCH/replay, garage UI open/close, a
confirmed GLX backend) and prog/lap-inconsistency traps (`c.prog < (c.lap-1)*L - 1`), tyre/fuel/ERS, camera matrix and
HUD gap-format breakpoints, which were not armed. No fix and no unit test were warranted, so no `tests/unit/**`
change; no GitHub issues filed (T1–T4 belong to the debugger tool, owned by #2534 — summarised for the orchestrator).

### Cleanup

`debugger_detach` ×3 (`cleanupErrors: []`), debug Chrome (`:9222`) and `http.server :3456` killed by PID, no stray
`chrome` left.
