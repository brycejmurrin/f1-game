# Live debugger hunt — audio and input (2026-10-16)

Lane `cursor/live-debug-audio-input-5c2e`, PR #2558. Owned: `js/audio/**`, `js/input/**` (not `bindings.js` key-map
validation), `tests/unit/**`, this note. Evidence is software-browser (SwiftShader, 844x390) with synthetic
inputs; no physical-device, GPU or long-session claim follows.

## Scope covered

- Live (js-debugger, debug Chrome, `headless(true)` from boot, one `race()` per call, each measurement inside one
  `debugger_run`): `AudioParam` non-finite/past-time wrappers + `BaseAudioContext.create*` counters; engine
  start/stop x4 (node counts); suspend/resume and close/rebuild of the context; pitch over a 3rd->4th gear
  shift and the limiter (54 `setEngine` calls with the engine running); mute/volume persistence across a
  reload; synthetic `navigator.getGamepads` pads (NaN/Infinity axes, NaN button values,
  drift, unplug, A-button gas, RT analog); one `race('monza')` boot.
- VM (unit test, not a live pause): non-finite `deviceorientation` through `Input.steer()`.
- Source read: `js/input/input.js` pad pipeline (`readPadAxis`, `padAxisShape`, `padPedalAxis`, `pickPad`,
  `notePadUse`), `tilt-roll.js`, `engine.js` rebuild/resume paths.

## Findings

| id | file:line | severity | verdict | debugger evidence | fix commit | test | issue# |
|---|---|---|---|---|---|---|---|
| F1 | `js/input/input.js` `onOrient` (~249) | low | VM-ONLY | no pause: `TiltRoll.rollDeg(0, Infinity, ...)` = NaN (`cos(Infinity)`) passed the `roll === null` guard and seeded the One-Euro state, so `Input.steer()` returned NaN for every later reading (`steer stayed NaN`). Needs a broken sensor/WebView; real `beta`/`gamma` are finite or null | bcf62cea | `tests/unit/digital-steer.test.mjs` "one non-finite orientation reading does not poison the TILT filter" (red before, green after) | none |
| F2 | `js/audio/stub.js` AudioPanel.create (~135) | low | CONFIRMED-LIVE | page reloaded with `apex26.sound=false`: before the first gesture `#soundbtn` read `♪ SOUND ON`, `aria-pressed="true"`, `GameAudio._stub` true, `G.soundOn` false (stub `init()` is a no-op and index.html's static label is SOUND ON). The first `pointerdown` loaded the real panel, which then flipped it to `♪ SOUND OFF`. A muted player's first tap on the "SOUND ON" button runs `stubClick` (`next = !G.soundOn = true`) and turns the sound ON | this PR | `tests/unit/session-stub-surface.test.mjs` "the stub AudioPanel paints a saved SOUND OFF…" (red before: expected `♪ SOUND OFF`, actual `♪ SOUND ON`; green after); re-checked live after the fix: stub phase reads `♪ SOUND OFF`, aria false | none |

## Clean areas (do not re-hunt)

- Gamepad, live: NaN and Infinity axes steer 0; a NaN trigger `value` gives throttle/brake level 0 (no NaN
  leak); drift 0.1 under the 5 % dead zone steers 0.053 (rescaled, continuous); unplugging zeroes steer and
  pedals; RT 0.6 reads `throttleLevel` 0.545; A button reads gas 1.
- RETRACTED: an earlier "AudioParam writes over a 20-call setEngine sweep are clean" row was vacuous —
  `setEngine` returns at once unless `engineOn`, and `startEngine()` had not run. Redone below.
- Engine start/stop x4 (`startEngine`/`stopEngine`): nodes created per start 109 (first, one-time extras) then
  83, 83, 83; `disconnect()` calls per stop 59, 59, 59; no growth, no page error, no unhandled rejection.
- Context lifecycle: `ctx.close()` then two gestures >700 ms apart: first gesture no-op, second rebuilds a new
  running context (32 nodes) with the old one `closed`; `rej` stayed empty (the `close()` rejection is caught).
- Pitch (54 `setEngine` calls, engine running, samples in use): the playbackRate target is a pure function of
  rev (0.50 -> 0.4408, 0.98 -> 0.7208, 1.0 -> 0.7324); across the gear 3 -> 4 shift at rev 0.98 -> 0.72 the
  only step is the rev drop itself (0.7208 -> 0.5691), all values finite, no non-finite or past-time
  `setValueAtTime`/ramp/`setTargetAtTime` write on any AudioParam.
- Persistence: `#soundbtn` toggles `apex26.sound` both ways and `GameAudio.enabled()` follows; after a reload
  with sound/sfx/music = false and volSfx 0.5, volMusic 0.3 stored, the real panel (after the first gesture)
  reports `enabled() === false`, button `SOUND OFF`, `volumes() = {sfx: 0.5, music: 0.3}`.

## Not run, and why

- `ctx.suspend()` while running: the state stayed `running` after 400 ms in the headless page, so suspend/resume
  and the hidden/visible `visibilitychange` path are inconclusive (the close/rebuild path above ran).
- A `devicechange`-driven rebuild: deferred without a sticky user activation in this page, so no rebuild ran.
- Rotated-screen tilt driven live (math only read), touch steer at 844x390, inverted pedals, two pads,
  keyboard leaks menu <-> race, rebind conflicts. Next round.
- Caught-exception pauses: `debugger_exceptions all` was never enabled; the unhandled `error`/`unhandledrejection`
  counters stayed at 0 over every audio probe.
- Browser group `input`: 146/147; the one failure is `sliders.spec.js › OVERALL SPEED lifts BOTH…`, a 120 s
  timeout on this SwiftShader box that also times out solo (166 s; llvmpipe CI ~17 s); it never reaches the code
  changed here. CI is the verdict.

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
- **T5** `GameAudio` is a stub (no `enabled()`, `debug().contextState` `uninitialised`, `init()` creates nothing)
  until the first gesture/`ensureAudio()` loads LAZY_AUDIO: an `init()` before that is a silent no-op, and a
  reload returns to the stub. Probe the real engine only after `GameAudio.enabled` exists. Also
  `GameAudio.setEngine` is a no-op until `startEngine()` (`engineOn`).
- **T4** the debug Chrome on SwiftShader drove the box to loadavg 61 and timed out the commit hook
  (`bash-guard.sh`). Stop the debug Chrome before committing.

## Next step

Keyboard leaks into menus during a race, touch steer at 844x390 (`Emulation.setDeviceMetricsOverride` + touch
emulation), the `visibilitychange` path with a real hidden tab, and a `devicechange` rebuild after a gesture.
