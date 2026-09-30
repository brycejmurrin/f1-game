---
name: input-controls
description: Use when steering, gamepad (stick dead zone, saturation, drift, calibrate centre, axis map), touch steer, tilt/gyro, keyboard leaks into menus, on-screen steer buttons, driving-help/racing-line assists, or input.js / steer-tuning.js are being changed or debugged. For handling forces (understeer/grip/pace) use tune-physics; for menu Escape/focus use ui-menu-a11y.
---

# Driving input — devices, not forces

`js/input/input.js` owns **how a device becomes a steer/throttle/brake
command**. `tune-physics` owns the bicycle model those commands hit.
Mixing the two is the usual miss: a sticky gamepad is not understeer.

## Source priority (`Input.steer()`)

keyboard (held or returning to centre) > gamepad (deflected stick) >
PHONE AS CONTROLLER (`Input.remoteSteers()`: a paired phone's sample under
700 ms old that CARRIED a roll — a sensorless phone is pedals and buttons only
and never sits here, `js/input/phone-pad.js`) > on-screen buttons (`steerMode
"buttons"`) > tilt (fresh gyro) > canvas touch (drag from touch-down). The
phone's roll enters the SAME tilt pipeline (`remoteSample` writes what
`onOrient` writes), so the TILT sliders and RECALIBRATE act on it; the roll
math itself is `js/input/tilt-roll.js`, shared with `controller.html`. Digital sources share `KEY_RAMP_IN` /
`KEY_RAMP_OUT` so arrows and finger-up are not a light switch.

## Assists

| Store / slider | Effect |
|---|---|
| `drivingHelp` | ROAD_FOLLOW gain via `helpFromSlider` — v1 = OFF, ships at 0 |
| `raceLine` (slider id `pm-line`) | pull to line / push wide; 0 = off. `G.raceLineAssist = raceLine / 5` |
| `adaptiveButtons` | digital-steer rate half of SPEED STEER (keys + on-screen arrows). v1 = OFF, **unset default 5**. Schema 4. Not the stick / tilt / drag |
| `brakeCue` | pulse-rate brake warning. v1 = OFF, unset default 1. Never writes throttle/brake |
| `STEER_SCHEMA` | per-version migration ladder in `steer-tuning.js` — do not flatten to one gate |

Changing an assist **default** does not reach existing players
(`store.get` keeps the stored value). A new default and a stored-value
migration are different acts — both are usually needed. See
`docs/PHYSICS.md` (road-follow) and `tests/specs/steer-migration.spec.js`.

## Gamepad stick (dead zone / saturation / drift)

Player knobs, all in `js/input/steer-tuning.js` (`applySteerTuning` + `wireTune`),
applied through `Input.setPadDeadzone` / `setPadSaturation` (`js/input/input.js`,
`padAxisShape`): store `padDeadzone` (slider `pm-paddz`, 0-30 %,
**default 5**, was a fixed 0.14), `padSaturation` (`pm-padsat`, default 0),
per-pad centre via `calibratePad()` / `padRest()`, stored as `padRest` and
reloaded through `setPadRest()` by `js/ui/key-binds.js`. `padCurve` (`pm-padcurve`) is
the separate response curve. Menu sticks use fixed `PAD_NAV_DEADZONE` 0.22 — do
not conflate. Tilt dead zone is a different, fixed 2.5 deg. Pins: node,
`tests/unit/ui-improve-pass.test.mjs` "stick dead zone and saturation are
adjustable" (`node --test` on that file); browser, `tests/specs/gamepad.spec.js`
"centre dead zone" (0.03 -> 0, 0.07 ramps) and `sliders.spec.js`. A new default
reaches fresh installs only; a stored `padDeadzone` needs a STEER_SCHEMA step.

## Keyboard leaks into a menu (or a menu eats the wheel)

Trace, in order: `onKey` (`js/input/input.js`) computes `typing` (focused
INPUT/TEXTAREA/SELECT/BUTTON/A, except `hudControl` = `#btn-cam, #pausebtn,
#hud-restore, #pc-restore, .touchbtn`) and `menuOverlayOpen()` =
`UiLayers.anyOpen()`; either one makes a keydown a no-op and a keyup a
latch-clear only. Pause/Escape sit ABOVE that gate. The layer list and its
`gate: false` entries (`overlay`, `rotate-device`) live only in `js/ui/layers.js`;
arrows inside a menu belong to `js/ui/menu-nav.js` (sliders/selects keep their
own Left/Right); focus return on close is `js/ui/modal.js` `onLayerHide`
(`opener` / `lastFocus`). Two opposite bugs: a NEW layer missing from `DEFS`
leaks arrows to the car; focus left on a slider/button after RESUME reads as
`typing`, so the arrows change the slider and the car is undrivable.
Pins — node: `tests/unit/key-binds.test.mjs` (Input in a VM, `anyOpen` mocked),
`menu-a11y-audit.test.mjs` (layer coverage); browser only: `menu-keyboard.spec.js`
"with the pause menu up the arrow keys stop reaching the car" / "with a race
running the arrow keys drive the car", `steering.spec.js` "keyboard latch".
Record: which of `typing` / `anyOpen` / focus owner (`document.activeElement`)
was true, via `__apex.inputState().key`.

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
node tools/ci/test-bg.mjs input   # browser group test:input; background it (AGENTS rule 4)
```

## Load on demand

- Platform traps (iPad tilt, dialog Escape) → `docs/research/PLATFORM-INPUT-NOTES.md`
- Control research → `docs/research/DRIVING-CONTROLS-RESEARCH.md`
- Feel / grip / pace → **tune-physics**
