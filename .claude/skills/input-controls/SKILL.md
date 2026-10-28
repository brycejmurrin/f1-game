---
name: input-controls
description: "Use when steering or controls misbehave: stuck touch steering or buttons on iPhone, phone-as-controller, gamepad dead zone or drift, tilt, keys leaking into menus, assists or the GRIP STEER slider. Not for: grip or understeer → tune-physics; menu focus → ui-menu-a11y; screenshots → playwright-probe."
---

# Driving input — devices, not forces

`js/input/input.js` owns **how a device becomes a steer/throttle/brake
command**. `tune-physics` owns the bicycle model those commands hit.
Mixing the two is the usual miss: a sticky gamepad is not understeer.
The STEER LOCK / LINEARITY / SPEED STEER sliders (`maxSlip` / `expo` / `speedRef`)
are owned HERE as player settings; **tune-physics** owns them only as `setPhysics`
A/B knobs. Phone pairing/connection (QR, room code) → **multiplayer-debug**; the
roll once paired stays here.

## Phone first (Bryce: iPhone, 844×390 landscape, touch)

Reproduce at that profile before any desk device (parent session only: skill **mcp-probe** or Playwright MCP
`browser_*` with touch at 844×390, or one spec via `node tools/ci/test-bg.mjs --spec tests/specs/touch-buttons.spec.js`;
a subagent reports it unverified). Read the live state with `__apex.inputState()`: `steerMode` first (buttons / drag /
tilt), then `btn.*` (buttons) or `touchSteer`/`touchActive` (drag). Touch steering is on-screen buttons (wired in
`input.js` init via `wireHold`; factory `hold-buttons.js`), canvas drag, or tilt; stuck buttons, the four release
nets and drag → `references/menu-leak-touch.md`. Specs: `touch-buttons`, `touch-steer`,
`touch-pedals`, `tilt-pipeline`. iOS user activation comes only from
`touchend` / `pointerup` / `click` (not a touch `pointerdown` or `touchstart`),
so a gyro or audio request tied to `input.js`'s pointerdown handlers fails on
the first tap.

## Source priority (`Input.steer()`)

keyboard (held or returning to centre) > gamepad (deflected stick) >
PHONE AS CONTROLLER (`Input.remoteSteers()`: a paired phone's sample younger than
`REMOTE_STALE_MS` that CARRIED a roll — a sensorless phone is pedals and buttons only
and never sits here, `js/input/phone-pad.js`) > on-screen buttons (`steerMode
"buttons"`) > tilt (fresh gyro) > canvas touch (drag from touch-down). The
phone's roll enters the SAME tilt pipeline (`remoteSample` writes what
`onOrient` writes), so the TILT sliders and RECALIBRATE act on it; the roll
math itself is `js/input/tilt-roll.js`, shared with `controller.html`. An XR
thumbstick rides the same seam as a STICK (`remoteSample({ steer })`): no tilt
filter, slew or recalibration. Digital sources share `KEY_RAMP_IN` /
`KEY_RAMP_OUT` so arrows and finger-up are not a light switch (a short decay after lift is the ramp, not a
stuck latch: `btn.left` false with `btn.steerVal` falling = ramp; `btn.left` still true = latch); every ramp
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
| `phone-pad.js` | PHONE AS CONTROLLER: phone samples → `remoteSample`; the send path caps at `MIN_SAMPLE_GAP_MS` and forces a send only on edges; pins `phone-pad.test.mjs`, `phone-touch-surface.test.mjs`, `phone-pad-netplay-vm.test.mjs` |
| `controller.html` (repo root) | the phone's own page: tilt via `tilt-roll.js`, steering strip, CONNECT tap (gyro permission) |
| `controller-profiles.js` | `ControllerProfiles`: per-device pad maps (`padProfiles`, bounded); pin `controller-profiles.test.mjs` |
| `hold-buttons.js` | Hold-button FACTORY (hold sets, `lostCaptureShouldRelease`, `reset()`); the steer buttons and window release nets are wired in `input.js` init |
| `haptics.js` | `Input.vibrate` / `rumble` throttles |

`game.js` reads `steerMode` from store, calls `Input.steer(stepDt)` in the physics step, and
implements assists (`helpFromSlider`, `raceLineAssist`, `gripSteer` → `js/physics/grip-steer.js`).
Settings UI: `js/ui/key-binds.js`, `js/ui/settings-export.js` sliders (`pm-*` ids).

## Assists

| Store / slider | Effect |
|---|---|
| `drivingHelp` | ROAD_FOLLOW gain via `helpFromSlider` — stored default 1 = OFF (gain 0) |
| `raceLine` (slider id `pm-line`) | pull to line / push wide; 0 = off. `G.raceLineAssist = raceLine / 5` |
| `adaptiveButtons` | digital-steer rate half of SPEED STEER (keys + on-screen arrows). v1 = OFF, **unset default 5**; migrated since STEER_SCHEMA step 4. The drag range follows the same mix when DRAG AT SPEED (`touchDragSpeed`, default 1 = OFF; `def` in `settings-export.js`) is above OFF. Not the stick or tilt |
| `brakeCue` | pulse-rate brake warning. v1 = OFF, unset default 1. Never writes throttle/brake |
| `gripSteer` (slider `pm-gripsteer`) | GRIP STEER: notch 1 = OFF. This skill owns the slider, its default and migration only; the cap maths, A/B and which lock it receives (the shaped `og.shaped`, so expo/maxSlip reach it) are **tune-physics** |
| `STEER_SCHEMA` | per-version migration ladder in `steer-tuning.js` — do not flatten to one gate |

Changing an assist **default** does not reach existing players
(`store.get` keeps the stored value). A new default and a stored-value
migration are different acts — both are usually needed. See
`docs/PHYSICS.md` (road-follow) and `tests/specs/steer-migration.spec.js`.

## Gamepad stick (dead zone / saturation / drift)

Player knobs, all in `js/input/steer-tuning.js` (`applySteerTuning` + `wireTune`), applied through
`Input.setPadDeadzone` / `setPadSaturation` (`js/input/input.js`, `padAxisShape`):

- `padDeadzone` (slider `pm-paddz`, default `PAD_DZ_DEFAULT`, was a fixed 0.14); `padSaturation` (`pm-padsat`);
  `padCurve` (`pm-padcurve`) is the separate response curve.
- Centre: `calibratePad()` / `padRest()` (button `pm-pad-calib`; refuses a stick held off centre). `padAxisShape`
  subtracts the rest BEFORE the dead zone; an axis-map change resets it. Stored as `padRest`, reloaded via
  `setPadRest()` by `js/ui/key-binds.js`.
- Menu sticks use a fixed `PAD_NAV_DEADZONE` (`js/input/pad-menu.js`), tilt a fixed dead zone: do not conflate.
- A new default reaches fresh installs only; a stored `padDeadzone` needs a STEER_SCHEMA step.
- Pins: node `tests/unit/ui-improve-pass.test.mjs` "stick dead zone and saturation are adjustable",
  `tests/unit/key-binds.test.mjs` (calibrate persists, full lock both sides); browser
  `tests/specs/gamepad.spec.js` "centre dead zone", `sliders.spec.js`.
- Drifting stick triage, the stateless `padAxisShape` and full-lock maths → `references/pad-drift.md`.

## Sharp edges

- Gamepad has **no change events** — `Input.poll()` once per frame.
- iOS tilt: `requestGyro()` only from an activating gesture (the start tap's
  `touchend`/`click`, §Phone first); the phone page asks inside its CONNECT tap.
- A phone cannot pair over Bluetooth from a web page (no peripheral/HID role
  in any browser): PHONE AS CONTROLLER rides the VS FRIEND wire — room code
  on Nostr, WebRTC DataChannel — see `docs/MULTIPLAYER.md` §Phone as controller.
- `UiLayers` must eat keys while a menu is up; a leak is this skill, a
  missing Escape path is **ui-menu-a11y**.
- Escape that opens a `<dialog>` must `preventDefault()` on that keydown
  (`docs/research/PLATFORM-INPUT-NOTES.md`).

```sh
node tools/ci/test-bg.mjs --spec tests/specs/tilt-pipeline.spec.js   # ONE spec (touch-buttons/touch-steer/touch-pedals/gamepad/steering); session only, background
# a subagent runs the node pins above and reports the spec unverified. The whole group
# (test:input, camera specs too) only when one spec is not enough: remote-group.mjs input, or
# node tools/ci/test-bg.mjs input (background, when Actions is jammed; AGENTS.md rule 4)
```

## Load on demand

- Keyboard leaks into a menu, on-screen buttons stuck, canvas drag, tilt pipeline, racing-line ribbon → [references/menu-leak-touch.md](references/menu-leak-touch.md)
- Drifting gamepad stick, `padAxisShape`, full-lock maths → [references/pad-drift.md](references/pad-drift.md)
- Platform traps (iPad tilt, dialog Escape) → `docs/research/PLATFORM-INPUT-NOTES.md`
- Control research → `docs/research/DRIVING-CONTROLS-RESEARCH.md`
- Feel / grip / pace → **tune-physics**
