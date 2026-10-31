# Keyboard leaks, touch and tilt

## Keyboard leaks into a menu (or a menu eats the wheel)

Trace, in order: `onKey` (`js/input/input.js`) computes `typing` (focused
INPUT/TEXTAREA/SELECT/BUTTON/A, except `hudControl` = `#btn-cam, #pausebtn,
#hud-restore, #pc-restore, .touchbtn`) and `menuOverlayOpen()` =
`UiLayers.anyOpen()`; either one makes a keydown a no-op and a keyup a
latch-clear only. Pause/Escape sit ABOVE that gate. The layer list and its
`gate: false` entries (`overlay`, `rotate-device`) live only in `js/ui/layers.js`;
arrows inside a menu belong to `js/ui/menu-nav.js` (sliders/selects keep their
own Left/Right; a menu gamepad stick is turned into arrow keys by `js/input/pad-menu.js`); focus return on close is `js/ui/modal.js` `onLayerHide`
(`opener` / `lastFocus`). Two opposite bugs: a NEW layer missing from `DEFS`
leaks arrows to the car; focus left on a slider/button after RESUME reads as
`typing`, so the arrows change the slider and the car is undrivable.
Pins — node: `tests/unit/key-binds.test.mjs` (Input in a VM, `anyOpen` mocked),
`menu-a11y-audit.test.mjs` (layer coverage); browser only: `menu-keyboard.spec.js`
"with the pause menu up the arrow keys stop reaching the car" / "with a race
running the arrow keys drive the car", `steering.spec.js` "keyboard latch".
Read held latches from `__apex.inputState().key`; read
`__apex.inputState().gate` for `anyOpen`, `typing`, `hudControl` and
`focus:{id,tag,editable}`. These are separate from held-key latches.
Cross-check `UiLayers.anyOpen()` and `document.activeElement` when debugging focus.

## Touch and tilt (phone)

- Probe first: `__apex.inputState().steerMode`, then `.btn.{left,right,leftVal,rightVal,steerVal}`
  (buttons) or `.touchSteer` / `.touchActive` (drag). `btn.left` false with `steerVal` decaying is
  `KEY_RAMP_OUT` by design; `btn.left` still true after the lift is a stuck latch.
- On-screen buttons (`steerMode "buttons"`): the steer buttons are wired in `js/input/input.js` init
  (`wireHold("btn-steer-left"/"btn-steer-right")`); `js/input/hold-buttons.js` is the factory. A button
  stuck held is a release-net miss. The four nets:
  1. window capture-phase `pointerup`/`pointercancel` (`input.js` init) → `holdReleasePointer`;
  2. `lostpointercapture`, only through `lostCaptureShouldRelease` (hold-buttons.js);
  3. `reset()` on window `blur` / `visibilitychange` hidden (OS interruptions with no pointer event);
  4. passive window `touchend`/`touchcancel` with `touches.length === 0` → release all + clear the drag
     `touches` (`input.js`; the WebKit ghost-pointer case, w3c/pointerevents#407) — the net for
     "sticks after I lift".
  Spec `touch-buttons.spec.js` ("releasing returns to centre", "holding GAS survives tapping a turn arrow").
- Canvas drag: relative from touch-down, the most recently MOVED finger
  steers — `touch-steer.spec.js`. Pedal travel: `touch-pedals.spec.js`.
- Tilt: One-Euro filter → dead zone → `MAX_TILT` map → slew
  (`input.js`; `clampDeadzone()` keeps `DEADZONE < MAX_TILT` so the map cannot
  invert). Rotating the phone (`onScreenRotate`) resets the filter only, not the
  centre: an offset after rotation needs RECALIBRATE (`calibrate()` takes the
  RAW angle). Spec `tilt-pipeline.spec.js` (dead zone, full lock at MAX_TILT,
  slew, calibrate).
- "Racing-line help stays highlighted" is not an input latch. The on-track ribbon is
  `js/render/shared/driving-line.js` (mode OFF / CORNERS / FULL from RACE SETTINGS; green →
  amber → red from the player's speed, so it stays red while you are over the target);
  colour/opacity/brake-cue prefs are `js/ui/driving-line-opts.js`; pins
  `tests/unit/driving-line*.test.mjs`. The steering PULL toward the line is the `raceLine`
  assist (table in `assists.md`). Fix the held button first; re-check the line only if it outlives the release.
- Reproduce at phone landscape (844×390) with touch first.
