# Live debugger hunt — audio and input (2026-10-16)

Lane `cursor/live-debug-audio-input-5c2e`, PR #2558. Owned: `js/audio/**`, `js/input/**` (not `bindings.js` key-map
validation), `tests/unit/**`, this note. Evidence is software-browser (SwiftShader, 844x390) with synthetic
inputs; no physical-device, GPU or long-session claim follows.

## Scope covered

- Live (js-debugger, debug Chrome): `AudioParam` non-finite/past-time wrappers over a gear 1-4 x rev 0.3-1.0
  `setEngine` sweep (20 calls); synthetic `navigator.getGamepads` pads (NaN/Infinity axes, NaN button values,
  drift, unplug, A-button gas, RT analog); one `race('monza')` boot.
- VM (unit test, not a live pause): non-finite `deviceorientation` through `Input.steer()`.
- Source read: `js/input/input.js` pad pipeline (`readPadAxis`, `padAxisShape`, `padPedalAxis`, `pickPad`,
  `notePadUse`), `tilt-roll.js`, `engine.js` rebuild/resume paths.

## Findings

| id | file:line | severity | verdict | debugger evidence | fix commit | test | issue# |
|---|---|---|---|---|---|---|---|
| F1 | `js/input/input.js` `onOrient` (~249) | low | VM-ONLY | no pause: `TiltRoll.rollDeg(0, Infinity, ...)` = NaN (`cos(Infinity)`) passed the `roll === null` guard and seeded the One-Euro state, so `Input.steer()` returned NaN for every later reading (`steer stayed NaN`). Needs a broken sensor/WebView; real `beta`/`gamma` are finite or null | bcf62cea | `tests/unit/digital-steer.test.mjs` "one non-finite orientation reading does not poison the TILT filter" (red before, green after) | none |

## Clean areas (do not re-hunt)

- Gamepad, live: NaN and Infinity axes steer 0; a NaN trigger `value` gives throttle/brake level 0 (no NaN
  leak); drift 0.1 under the 5 % dead zone steers 0.053 (rescaled, continuous); unplugging zeroes steer and
  pedals; RT 0.6 reads `throttleLevel` 0.545; A button reads gas 1.
- AudioParam writes during a 20-call `setEngine` sweep: no non-finite value, no past-time write (wrappers on
  `setValueAtTime`, both ramps, `setTargetAtTime`).

## Not run, and why

- Audio: node-count growth over 10 restarts, AudioContext rebuild (a `devicechange` was deferred: no sticky
  user activation in the headless page, so no rebuild ran), pause/resume, hidden/visible, suspend/close,
  pitch continuity across gears and the limiter (`rate()` is 0 on the synth path), mute/volume persistence.
  Cause: T1/T2 below.
- Input: touch steer, rotated-screen tilt driven live (math only read), inverted pedals, two pads, keyboard
  leaks menu <-> race, rebind conflicts.
- Caught-exception pauses: `debugger_exceptions all` was never enabled.
- Browser group `input`: see the PR body for its verdict.

## js-debugger tool problems hit

- **T1** a 10x `await __apex.race('monza')` in one `debugger_run` wedged the page: the operation never
  returned, `debugger_detach` reported `Debugger.disable` timed out, a re-attach timed out on
  `Debugger.setAsyncCallStackDepth`. Recovery: kill the Chrome by PID, relaunch, attach to the new target id.
  Drive one `race()` per call.
- **T2** one `race()`+`go()` took ~3-4 min and a trivial `debugger_run` queued behind it took minutes
  (SwiftShader). A hunt needs `__apex.headless(true)` from boot.
- **T3** harness mistakes, not game defects: `create*` live on `BaseAudioContext.prototype` (wrapping
  `AudioContext.prototype` counts 0 forever) and the wrapper must be installed before the first graph;
  `navigator.getGamepads` defined with `defineProperty` is non-writable by default, so later plain
  assignments silently kept the old pad; the boolean `Input.throttle()` hides the analog value, use
  `throttleLevel()` / `brakeLevel()`.
- **T4** the debug Chrome on SwiftShader drove the box to loadavg 61 and timed out the commit hook
  (`bash-guard.sh`). Stop the debug Chrome before committing.

## Next step

A follow-up lane starts Chrome with rendering off from boot (`headless(true)` before the first `race()`),
installs the `BaseAudioContext` wrappers before `GameAudio.init()`, and runs the audio lifecycle list
(restart x10 one per call, `ctx.suspend()`/`close()` + a keydown gesture, hidden/visible, mute persistence)
and the keyboard-leak scenario.
