# iOS & GitHub Pages compatibility notes

How Apex 26's input and rendering choices map onto iOS Safari and a static
GitHub Pages host, plus the reasoning behind the controller support added from
the racing-game input research.

## Everything here runs on a static host

The whole game is script-tag IIFE modules, no build step, no server code, so
GitHub Pages serves it verbatim. The only hard requirement is **HTTPS**, which
Pages provides — `DeviceOrientationEvent.requestPermission()` (tilt) and the
Web Audio context both need a secure context. Cache-busting is handled by the
`?v=NN` query string on every `<script>`/`<link>` in `index.html`; bump it on
deploy so Safari's aggressive disk cache doesn't serve stale modules.

## Input on iOS

| Method | iOS support | Notes |
|--------|-------------|-------|
| Tilt (DeviceOrientation) | iOS 13+ | Permission prompt on first tap; One-Euro filtered |
| Touch pedals / steer | all | `pointerup`/`pointercancel`/`pointerleave` release so a held button can't stick |
| **Gamepad** | **iOS 14.5+** | PS5 DualSense / Xbox Series / MFi over Bluetooth, "standard" mapping |
| Keyboard | iPad + HW keyboard | Same bindings as desktop |

### Why gamepad support

The input-latency research ranked a controller as the lowest-latency,
lowest-variance option (≈36–51 ms end to end vs 45–138 ms for filtered tilt),
and it costs nothing on a static host: the Gamepad API is pure client JS with
no permission gate. iOS 14.5+ pairs PS5/Xbox controllers over Bluetooth and
reports the W3C "standard" mapping, so the same code path serves desktop and
iOS.

Key implementation points (`js/input.js`):

- **Poll once per frame.** The Gamepad API has no change events — you read a
  fresh snapshot each frame. `Input.poll()` runs at the top of the game loop,
  before the physics step and before the paused gate (so Start can un-pause),
  keeping input to a single frame of latency.
- **Analog steering passes through raw.** The left stick (axis 0) gets a 0.14
  dead zone, re-scaled to still reach full lock; the game's own `STEER_EXPO`
  curve and slip model shape it from there, so there's no double-expo.
- **Idle pad never fights other inputs.** A connected-but-centered controller
  returns 0 steering, so tilt/touch still work; the pad only "wins" steering
  when the stick is actually deflected.
- **Edge-triggered buttons reuse the keyboard latches** (boost, overtake,
  shift, camera, pause) via rising-edge detection against the previous frame's
  snapshot — one press fires exactly once.
- **Rumble is best-effort.** `Input.rumble()` drives `vibrationActuator`
  ("dual-rumble") on contact and kerbs alongside the existing
  `navigator.vibrate` calls. Most iOS controllers don't expose an actuator, so
  it silently no-ops there — haptics degrade gracefully.

Standard mapping used:

```
axis 0   left-stick X  steer        btn 7 RT / btn 0 A   throttle
btn 14/15 d-pad L/R    steer         btn 6 LT / btn 1 B   brake
btn 2 X  boost toggle                btn 3 Y   overtake
btn 4 LB shift down                  btn 5 RB  shift up
btn 8 View/Back  camera              btn 9 Menu/Start  pause
```

## Rendering & power

- WebGL2 with procedural geometry and almost no texture uploads keeps memory
  bandwidth low — comfortable inside the A15/A16 budget at 60 fps landscape.
- Physics runs as a **fixed 1/60 s step** with a substep cap (`js/game.js`
  `tick()`), so handling is identical whether Safari renders at 30, 60, or
  120 fps and a janky frame can never enlarge the integration step.
- Web Audio synthesis (no codecs) keeps audio latency low; the context is
  resumed from the first user gesture, as iOS requires.

## On-device checklist

```
[ ] Tilt prompt appears and is honored on first tap
[ ] Paired controller steers, pedals, and pauses; idle pad doesn't block tilt
[ ] 60 fps holds in landscape; device doesn't get hot over a ~15 min race
[ ] Rotation-lock (Control Center) is respected
[ ] Hard-refresh after deploy picks up the new ?v= assets
```
