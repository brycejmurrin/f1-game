---
name: input-controls
description: Use when steering, gamepad, touch steer, tilt/gyro, keyboard leaks into menus, on-screen steer buttons, driving-help/racing-line assists, or input.js / steer-tuning.js are being changed or debugged. For handling forces (understeer/grip/pace) use tune-physics; for menu Escape/focus use ui-menu-a11y.
---

# Driving input — devices, not forces

`js/input/input.js` owns **how a device becomes a steer/throttle/brake
command**. `tune-physics` owns the bicycle model those commands hit.
Mixing the two is the usual miss: a sticky gamepad is not understeer.

## Source priority (`Input.steer()`)

keyboard (held or returning to centre) > gamepad (deflected stick) >
on-screen buttons (`steerMode "buttons"`) > tilt (fresh gyro) > canvas
touch (drag from touch-down). Digital sources share `KEY_RAMP_IN` /
`KEY_RAMP_OUT` so arrows and finger-up are not a light switch.

## Assists

| Store / slider | Effect |
|---|---|
| `drivingHelp` | ROAD_FOLLOW gain via `helpFromSlider` — v1 = OFF, ships at 0 |
| `pm-line` / racing line | pull to line / push wide; 0 = off |
| `adaptiveButtons` | digital-steer rate half of SPEED STEER (keys + on-screen arrows). v1 = OFF, **unset default 6**. Schema 4. Not the stick / tilt / drag |
| `brakeCue` | pulse-rate brake warning. v1 = OFF, unset default 6. Never writes throttle/brake |
| `STEER_SCHEMA` | per-version migration ladder in `steer-tuning.js` — do not flatten to one gate |

Changing an assist **default** does not reach existing players
(`store.get` keeps the stored value). A new default and a stored-value
migration are different acts — both are usually needed. See
`docs/PHYSICS.md` (road-follow) and `tests/specs/steer-migration.spec.js`.

## Sharp edges

- Gamepad has **no change events** — `Input.poll()` once per frame.
- iOS tilt: `requestGyro()` only from a user gesture (the start tap).
- `UiLayers` must eat keys while a menu is up; a leak is this skill, a
  missing Escape path is **ui-menu-a11y**.
- Escape that opens a `<dialog>` must `preventDefault()` on that keydown
  (`docs/research/PLATFORM-INPUT-NOTES.md`).

```sh
node tools/test-bg.mjs input
```

## Load on demand

- Platform traps (iPad tilt, dialog Escape) → `docs/research/PLATFORM-INPUT-NOTES.md`
- Control research → `docs/research/DRIVING-CONTROLS-RESEARCH.md`
- Feel / grip / pace → **tune-physics**
