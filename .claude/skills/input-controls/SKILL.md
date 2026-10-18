---
name: input-controls
description: "Use when steering, gamepad (stick dead zone, saturation, drift, calibrate centre, axis map), touch steer, tilt/gyro, keyboard leaks into menus, on-screen steer buttons, driving-help/racing-line assists, GRIP STEER, or input.js / steer-tuning.js change. Handling forces (understeer/grip/pace) → tune-physics; menu Escape/focus → ui-menu-a11y."
---

# Driving input — devices, not forces

`js/input/input.js` owns **how a device becomes a steer/throttle/brake
command**. `tune-physics` owns the bicycle model those commands hit.
Mixing the two is the usual miss: a sticky gamepad is not understeer.
The STEER LOCK / LINEARITY / SPEED STEER sliders (`maxSlip` / `expo` / `speedRef`)
are owned HERE as player settings; **tune-physics** owns them only as `setPhysics`
A/B knobs. Phone pairing/connection (QR, room code) → **multiplayer-debug**; the
roll once paired stays here.

## Source priority (`Input.steer()`)

keyboard (held or returning to centre) > gamepad (deflected stick) >
PHONE AS CONTROLLER (`Input.remoteSteers()`: a paired phone's sample under
700 ms old that CARRIED a roll — a sensorless phone is pedals and buttons only
and never sits here, `js/input/phone-pad.js`) > on-screen buttons (`steerMode
"buttons"`) > tilt (fresh gyro) > canvas touch (drag from touch-down). The
phone's roll enters the SAME tilt pipeline (`remoteSample` writes what
`onOrient` writes), so the TILT sliders and RECALIBRATE act on it; the roll
math itself is `js/input/tilt-roll.js`, shared with `controller.html`. An XR
thumbstick rides the same seam as a STICK (`remoteSample({ steer })`): no tilt
filter, slew or recalibration. Digital sources share `KEY_RAMP_IN` /
`KEY_RAMP_OUT` so arrows and finger-up are not a light switch; every ramp
advances per PHYSICS step (`Input.steer(stepDt)`), and opposite arrows held
together resolve last-key-wins.

## Where things live (`js/input/`)

| File | Role |
|---|---|
| `input.js` | `Input` singleton: `steer(stepDt)`, `throttle()` / `braking()`, `poll()`, `onKey` gate (`menuOverlayOpen` → `UiLayers.anyOpen()`), `inputState()` for probes |
| `bindings.js` | `InputBindings.create` — action map (pause, camera, radio, …) wired from `key-binds.js` |
| `steer-tuning.js` | `applySteerTuning`, `STEER_SCHEMA` migrations; pad dead zone / saturation / curve |
| `pad-menu.js` | Menu stick → arrow keys (`PAD_NAV_DEADZONE`) |
| `tilt-roll.js` | Tilt filter + `steerToTilt` / recalibrate shared with `controller.html` |
| `phone-pad.js` | VS FRIEND phone samples → `remoteSample` |
| `hold-buttons.js` | On-screen hold/toggle gas and look-back when enabled |
| `haptics.js` | `Input.vibrate` / `rumble` throttles |

`game.js` reads `steerMode` from store, calls `Input.steer(stepDt)` in the physics step, and
implements assists (`helpFromSlider`, `raceLineAssist`, `gripSteer` → `js/physics/grip-steer.js`).
Settings UI: `js/ui/key-binds.js`, `js/ui/settings-export.js` sliders (`pm-*` ids).

## Assists

| Store / slider | Effect |
|---|---|
| `drivingHelp` | ROAD_FOLLOW gain via `helpFromSlider` — stored default 1 = OFF (gain 0) |
| `raceLine` (slider id `pm-line`) | pull to line / push wide; 0 = off. `G.raceLineAssist = raceLine / 5` |
| `adaptiveButtons` | digital-steer rate half of SPEED STEER (keys + on-screen arrows). v1 = OFF, **unset default 5**; migrated since STEER_SCHEMA step 4. The drag range follows the same mix when DRAG AT SPEED (`touchDragSpeed`, default 10) is above OFF. Not the stick or tilt |
| `brakeCue` | pulse-rate brake warning. v1 = OFF, unset default 1. Never writes throttle/brake |
| `gripSteer` (slider `pm-gripsteer`) | GRIP STEER: notch 1 = OFF; own-state steering cap at the front's peak slip, `js/physics/grip-steer.js`. Its maths and A/B are **tune-physics** |
| `STEER_SCHEMA` | per-version migration ladder in `steer-tuning.js` — do not flatten to one gate |

Changing an assist **default** does not reach existing players
(`store.get` keeps the stored value). A new default and a stored-value
migration are different acts — both are usually needed. See
`docs/PHYSICS.md` (road-follow) and `tests/specs/steer-migration.spec.js`.

## Gamepad stick (dead zone / saturation / drift)

Player knobs, all in `js/input/steer-tuning.js` (`applySteerTuning` + `wireTune`), applied through
`Input.setPadDeadzone` / `setPadSaturation` (`js/input/input.js`, `padAxisShape`):

- `padDeadzone` (slider `pm-paddz`, 0-30 %, **default 5**, was a fixed 0.14); `padSaturation` (`pm-padsat`, default 0);
  `padCurve` (`pm-padcurve`) is the separate response curve.
- Centre: `calibratePad()` / `padRest()` (button `pm-pad-calib`; refuses a stick held past 0.5). `padAxisShape`
  subtracts the rest BEFORE the dead zone; an axis-map change resets it. Stored as `padRest`, reloaded via
  `setPadRest()` by `js/ui/key-binds.js`.
- Menu sticks use a fixed `PAD_NAV_DEADZONE` (`js/input/pad-menu.js`), tilt a fixed dead zone: do not conflate.
- A new default reaches fresh installs only; a stored `padDeadzone` needs a STEER_SCHEMA step.
- Pins: node `tests/unit/ui-improve-pass.test.mjs` "stick dead zone and saturation are adjustable",
  `tests/unit/key-binds.test.mjs` (calibrate persists, full lock both sides); browser
  `tests/specs/gamepad.spec.js` "centre dead zone", `sliders.spec.js`.
- Drifting stick triage (read `inputState()`, wheel vs pad, per-pad rest) → `references/pad-drift.md`.
- No added lag: `padAxisShape` (`input.js`) is STATELESS (rest → dead zone →
  saturation, no filter), so a drift fix belongs there or in `padRest`, never a
  smoothing/slew stage; the response curve is `analogShape` (same file). Full lock:
  each side is divided by its own travel (`1 ± rest`, `|rest| ≤ 0.5` so neither
  divisor is below 0.5) and `span = max(0.05, 1 − dz − sat)` — a worn pad that
  tops out short needs SATURATION, not a bigger rest.

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

- On-screen buttons (`steerMode "buttons"`, `js/input/hold-buttons.js`): a
  button stuck held is the release path — window capture-phase
  `pointerup`/`pointercancel`, and `lostpointercapture` only through
  `lostCaptureShouldRelease`. Spec `touch-buttons.spec.js`
  ("releasing returns to centre", "holding GAS survives tapping a turn arrow").
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
  assist (table above). Fix the held button first; re-check the line only if it outlives the release.
- Reproduce at phone landscape (844×390) with touch first.

## Sharp edges

- Gamepad has **no change events** — `Input.poll()` once per frame.
- iOS tilt: `requestGyro()` only from a user gesture (the start tap); the
  phone page asks inside its CONNECT tap for the same reason.
- A phone cannot pair over Bluetooth from a web page (no peripheral/HID role
  in any browser): PHONE AS CONTROLLER rides the VS FRIEND wire — room code
  on Nostr, WebRTC DataChannel — see `docs/MULTIPLAYER.md` §Phone as controller.
- `UiLayers` must eat keys while a menu is up; a leak is this skill, a
  missing Escape path is **ui-menu-a11y**.
- Escape that opens a `<dialog>` must `preventDefault()` on that keydown
  (`docs/research/PLATFORM-INPUT-NOTES.md`).

```sh
npm test -- tests/specs/tilt-pipeline.spec.js   # prefer ONE spec (touch-buttons/touch-steer/touch-pedals/gamepad/steering), background
node tools/ci/test-bg.mjs input   # whole browser group test:input (also camera specs); background it (AGENTS rule 4)
```

## Load on demand

- Platform traps (iPad tilt, dialog Escape) → `docs/research/PLATFORM-INPUT-NOTES.md`
- Control research → `docs/research/DRIVING-CONTROLS-RESEARCH.md`
- Feel / grip / pace → **tune-physics**
