# Live debugger hunt — audio and input (2026-10-16)

Lane: `cursor/live-debug-audio-input-5c2e`. Owned: `js/audio/**`, `js/input/**` (not `bindings.js` key-map
validation), `tests/unit/**`, this note. Evidence is software-browser (SwiftShader), synthetic inputs; no
physical-device, GPU or long-session claim follows.

## Tool observations (js-debugger on SwiftShader, 844x390, no `/dev/dri`)

- **T1 — a 10x `await __apex.race('monza')` in one `debugger_run` wedged the page.** The operation never
  returned, `debugger_detach` reported `Debugger.disable` timed out, and a re-attach timed out on
  `Debugger.setAsyncCallStackDepth`. Recovery: kill the Chrome by PID, relaunch, attach to the new target id.
  Drive one `race()` per call.
- **T2 — a single `race()`+`go()` takes ~3-4 min, and a trivial `debugger_run` queued behind it takes minutes.**
  The page renders while it is driven; call `__apex.headless(true)` early. Budget the number of probes
  accordingly (the lane cap is 40 captures).
- **T3 — harness mistake, not a game defect:** `create*` live on `BaseAudioContext.prototype`, not
  `AudioContext.prototype`; a node counter on the latter reads 0 forever. `GameAudio.init()` must also run
  before the wrapper to count the first graph, or the wrapper must be installed before the first gesture.

## Scenarios — audio

| # | Scenario | Result |
|---|---|---|
| A1 | Non-finite / past-time AudioParam writes (`setValueAtTime`, ramps, `setTargetAtTime` wrapped) | none logged over a gear 1-4 x rev 0.3-1.0 `setEngine` sweep (20 calls) |
| A2 | Node-count growth over 10 restarts | NOT RUN (T1) |
| A3 | Rebuild (`devicechange`) x3 | inconclusive: deferred — no sticky user activation, so no rebuild ran |
| A4 | Pause/resume, hidden/visible, suspend/close | NOT RUN |
| A5 | Pitch continuity across gears and limiter | NOT RUN (`rate()` is 0 on the synth path) |
| A6 | Mute/volume persistence | NOT RUN |

## Scenarios — input

| # | Scenario | Result |
|---|---|---|
| I1 | Synthetic Gamepad: drift, inverted pedals, NaN axes, disconnect, two pads | pending |
| I2 | Touch steer, deviceorientation tilt (rotated screen) | pending |
| I3 | Keyboard leaks menu <-> race, rebind conflicts | pending |

## Caught-exception pauses

pending

## Fixes

none yet.

## Not run

See the NOT RUN rows above; the pick-tests groups are named in the PR body.
