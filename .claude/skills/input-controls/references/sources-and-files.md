# Steer sources and where input lives

## Source priority (`Input.steer()`)

keyboard (held or returning to centre) > gamepad (deflected stick) >
PHONE AS CONTROLLER (`Input.remoteSteers()`: a paired phone's sample younger than
`REMOTE_STALE_MS` that CARRIED a roll — a sensorless phone is pedals and buttons only
and never sits here, `js/input/phone-pad.js`) > on-screen buttons (`steerMode
"buttons"`) > tilt (fresh gyro) > canvas touch (drag from touch-down).

- The phone's roll enters the SAME tilt pipeline (`remoteSample` writes what `onOrient` writes), so the TILT
  sliders and RECALIBRATE act on it; the roll math itself is `js/input/tilt-roll.js`, shared with `controller.html`.
- An XR thumbstick rides the same seam as a STICK (`remoteSample({ steer })`): no tilt filter, slew or recalibration.
- Digital sources share `KEY_RAMP_IN` / `KEY_RAMP_OUT` so arrows and finger-up are not a light switch. Every ramp
  advances per PHYSICS step (`Input.steer(stepDt)`); opposite arrows held together resolve last-key-wins.
- A phone cannot pair over Bluetooth from a web page (no peripheral/HID role in any browser): PHONE AS CONTROLLER
  rides the VS FRIEND wire — room code on Nostr, WebRTC DataChannel — see `docs/MULTIPLAYER.md` §Phone as controller.

## Files (`js/input/`)

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
