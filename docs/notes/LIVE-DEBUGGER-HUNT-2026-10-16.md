# Live debugger hunt — 2026-10-16

Exploratory runtime bug hunt driven by the js-debugger MCP (CDP, headless Chromium + SwiftShader, no real GPU —
nothing here is a player-GPU or long-session claim). Orchestrator `claude:session_013meHKLoGb66QWDCy9zMdPn`, worker
`claude:session_01KXgRNxiNG3mXz2wkEXDbTM`, branch `cursor/live-debugger-hunt-4c7e`.

Not re-reported: `docs/BUGS.md`, `DEFECT-LEDGER.md`, `BUG-HUNT*.md`, and the 7 findings a sibling is fixing (apex.js
aiPlace prog / reset delete, lobby.js pollTimer, hub.js double open, real-race-tab forgetRaw memCache, tlx.js
create-throw listener leak, game.js passHunger alloc).

## Summary (orchestrator report format)

Lane: core race loop (physics integrate, camera, race HUD, restart / circuit switch). PR #2548, branch
`cursor/live-debugger-hunt-4c7e`.

### Scope covered

vegas, monaco, spa, singapore, monza, suzuka (TLX, 300–400 ticks each); GLX load on vegas, monaco, spa; circuit switch ×6
and ×5, restart ×10 (monaco); finish → results → restart; tab hidden / visible; career save + `garageStep`; 150k-tick
soak with 22 cars (monza); closed-loop player on monaco, spa, monza, suzuka (17k ticks); tracepoints at `game.js`
5621 / 5686 / 5761 / 6271.

### Findings

| id | file:line | severity | verdict | debugger evidence | fix commit | test | issue |
|---|---|---|---|---|---|---|---|
| F1 | `js/physics/ai-drive.js` (no brake for a stopped car) + `js/physics/collide.js` (contact response) | medium | CONFIRMED-LIVE (synthetic: parked player) | tick trace, not a pause: car 13 54 m/s, no braking until 14 m, hit at 4.8 m gap, 52.81 → 5.09 m/s in one tick, player 5.1 m/s; neighbours cars 1 / 5 passed in other lanes | none (outside my files, > 20 lines) | none | #2565 |
| X1 | `def.js:70` `realPoints` via `scene-live.js:60` | none | BY-DESIGN | only exception pause (`all`): `id "monaco"`, `path null`, caught at `scene-live.js:56-60`, once per garage-prebuild frame until the circuit hydrates | — | — | — |

### Clean areas (do not re-hunt)

No NaN / Infinity in `physState` or car fields; no `prog` regression within a lap and `prog ≈ (lap−1)·L + s`; no
`NaN|Infinity|undefined` in `#hud-gap-ahead|behind`; camera eye delta ≤ 0.94 m over 25 real frames; DOM garage open /
close ×10 (listeners flat at 6, 0 intervals, DOM bounded); `LoopHealth` 0 faults in every scenario; window + document
listeners flat (9) and 0 live intervals after restart ×10 + switch ×5; tab hidden / visible resumes cleanly; GLX
context + soft-present up with `?gfx=glx`; career save + `garageStep` clean; no swallowed error beyond X1 while pausing on
`all` (the closed-loop pass ran on `uncaught` only).

### Not run, and why

Pit entry / stop and WATCH / replay (other lanes); camera teleport jumps (restart, rescue, pit exit, `jump`) and HUD at real frame rates (round 2 saw only 25 frames in 75 s,
no real GPU; `step()` never moves the camera or HUD, so only the rAF loop counts);
hand-stepped `into` / `over` tick (replaced by tracepoints; ~5 KB per step); dedicated tyre / fuel / ERS breakpoints
(generic non-finite scan only); `prog` trap as a conditional breakpoint (done in-page per tick instead).

### js-debugger tool problems hit

T1–T5 below (script cap hides `game.js`, remove+set leaves the old condition, state replays every past result,
`debugger_run` refused while paused, detach / attach fail after a timed-out evaluate). Passed to #2534 by the orchestrator.

### Next step

A session with a real GPU (or a faster GL) for camera / HUD under motion and the DOM garage; F1 (#2565) goes to the
incidents / racecraft owners.

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

### Third pass (GLX confirmed, closed-loop driving, tracepoints)

Chrome relaunched at `--window-size=844,600` with `?gfx=glx`: `innerWidth×innerHeight` = 844×408 (the 844×390 launch gave
a 198 px-tall viewport, per the orchestrator's note). **GLX positively confirmed**: `logs()` has `gfx: GLX context ready`,
`GLX soft-present on`, `GLX shadow init on=1`.

- **Closed-loop player** (PD on `x` + curvature feed-forward from `scan()` + a `sqrt(22/|k|)` speed target, throttle/brake via
  `setInput`; `window.__drive` in-page, not committed): monaco 8 000 ticks (reached lap 2, wall-pinned `|x|` 5.1 m many
  times, `minSpeed` 0), then spa, monza, suzuka 3 000 ticks each. Per tick: non-finite `physState` field, per-tick |Δv|,
  `prog ≈ (lap−1)·L + s` (held, e.g. monaco lap 2 s 131 → prog 3 426, L ≈ 3 295), HUD gap text. Result: **0 non-finite,
  0 `NaN|Infinity|undefined` in `#hud-gap-*`, worst player |Δv| 13.4 m/s (a wall hit, under the 15 trap), `LoopHealth` 0
  faults.**
- **Tracepoints** (conditional breakpoints whose condition records a non-finite `c.speed|vLat|yawRateCur|x|s|px|pz|accSm|
  kerbGripSm` into `window.__tpBad` and returns false, so nothing pauses) at `game.js` 5621, 5686, 5761 and 6271 inside the
  integrate path: the 6271 tracepoint counted 20 943 hits across the run and `__tpBad` stayed empty. This replaces
  hand-stepping `into`/`over` through a tick, which costs a ~5 KB response per step; no sign flip or saturation was
  looked for beyond non-finiteness.
- **Caught-exception triage (the only exception pause of the hunt):** `realPoints` `def.js:70` throws `Tracks: circuit
  "monaco" has no path` (called with `path: null`) via `paintLive` `scene-live.js:60` → `uploadLive` → `rebuild` →
  `renderSetupPreview` ← `prebuild.js` ← `game.js render:7422`. **Benign, documented**: `scene-live.js:56-60` catches it ("a
  raw Tracks.LIST entry that has not hydrated … THROWS on `.points`"). Cost note: it throws once per prebuild frame
  until the circuit hydrates; I switched to `uncaught` pauses afterwards, so later caught errors in this pass were not
  looked at.
- **Limits found:** (a) with `headless(true)` the camera does not update (`camState().eye` constant over 17 000 driven
  ticks), so the camera-jump trap proves nothing; (b) un-headless `step()` on software GLX at 844×408 queues the GPU
  process at ~350 % CPU and the page stops answering CDP for minutes (`Debugger.enable` timed out) — an environment
  property, not a game fault; camera and HUD-under-motion therefore remain unchecked; (c) `debugger_run` cannot be
  started while a previous `Runtime.evaluate` is "unknown": detach/attach is the only way out (T5 below).
- T5. After a timed-out evaluation, `debugger_detach` itself reports `cleanupErrors` (three timeouts) and
  `debugger_attach` fails until the page frees up; fire-and-forget loops that write to `window.*` and are polled with a
  second short `debugger_run` avoid it.

### Round 2 (camera / HUD under motion, DOM garage ×10)

Chrome at `about:blank` → navigate → `headless(true)`, 844×600 window, TLX (default), SwiftShader.

- **`step()` does not move the camera or the HUD.** 12 single-frame inspections (`headless(false)` → `step` → read
  `camState().eye` → `step` → read → `headless(true)`) over a 3 600-tick closed-loop monza drive gave eye delta 0.00 m
  every time and empty `#hud-gap-*`. The camera and HUD are updated by the render tick, so the earlier "camera trap never
  moved" is by design, not an absent fault; camera / HUD evidence has to come from real rAF frames.
- **Real-loop probe** (my own rAF callback sets controls only; the game's loop advances): 25 frames in 75 s on
  software GL (frame time min 17 ms, median 3.3 s, max 7.1 s). Max camera eye delta **0.94 m/frame**, none > 20 m;
  `#hud-gap-*` read `▲ BOT +1L` / empty with no `NaN|Infinity|undefined|^-`; `LoopHealth` 0 faults. Weak evidence by
  construction: at ~3 s a frame the game's dt clamp keeps every delta small, so teleports (restart, rescue, pit exit,
  `jump`) are not covered.
- **DOM garage open / close ×10** (`#mb-garage` click → 1.5 s → `#cs-done` click → 1.2 s; `#cs-done` visible each time):
  window + document listeners 0 (base) → 11 (first open) → **6 and flat for cycles 1–9**, live `setInterval`s 0, `LoopHealth` 0
  faults, no new warn / error. DOM node count 4 498 → 5 358 on the first open (lazy build, +860), flat for cycles 1–5, one
  +95 step to 5 453 at cycle 6, then flat through cycle 9: bounded, not per-cycle growth.

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
fault. The honest gaps are pit entry/stop and WATCH/replay (assigned to other lanes), garage UI open/close (never opened the
DOM garage), camera and HUD under motion (headless freezes the camera; un-headless software GLX stalls the page — see the
third pass) and a hand-stepped `into`/`over` tick (replaced by tracepoints). A confirmed GLX backend, the `prog`/`lap`
invariant and HUD gap text were closed in the later passes; tyre/fuel/ERS fields were covered only by the generic
non-finite scan of `physState` (`tyreWear`, `tyreGrip`, `ersDeploy`, `energy` …), not by dedicated breakpoints. No fix and no unit test were warranted, so no `tests/unit/**` change; F1 is filed as issue #2565
(T1–T4 belong to the debugger tool, owned by #2534 — summarised for the orchestrator).

### Cleanup

`debugger_detach` ×3 (`cleanupErrors: []`), debug Chrome (`:9222`) and `http.server :3456` killed by PID, no stray
`chrome` left.
