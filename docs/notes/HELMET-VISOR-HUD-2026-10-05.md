# HELMET camera: the visor HUD (2026-10-05)

Reported from a phone: "the HUD isn't really showing with helmet camera". HELMET
had borrowed the cockpit's HUD treatment wholesale — `body.cockpit-cam` (gear and
speed left to the wheel's LCD) and the cockpit MOVE & SIZE set (on a touch
screen: ENERGY, TYRES, OVERTAKE, AERO and BRAKE BIAS hidden, "no room beside the
wheel"). On an 844x390 phone that left the top timing row, the sectors, the map
and a floating speed — and an LCD whose digits are a few pixels tall.

## What changed

- `js/camera/cam-groups.js`: `COCKPIT_LAYOUT` is COCKPIT alone; `HELMET_LAYOUT`
  and `layoutSet(id)` ("cockpit" | "helmet" | "other") are new.
- `js/ui/hud-layout.js`: a third set, `helmet`. Desktop ships the cockpit strip
  plus GEAR (x-30, y-20) and SPEED (x-30, y-30) stacked left of the wheel. A
  touch screen reads `TOUCH_SHIPPED.helmet` instead: ENERGY (x-12, y-29) above
  the wheel's top edge, TYRES (y-10) in the left corner above the steer
  buttons. The LAYOUT FOR stepper gains HELMET CAM.
- `js/camera/mode-switch.js`: `cockpit-cam` for COCKPIT only; HELMET keeps
  `data-helmet-cam` (the visor frame).
- `css/track-detail.css`: a touch helmet hides only the gearbox chip (the LCD's
  one large glyph), OVERTAKE / AERO (their buttons carry the state) and BRAKE
  BIAS (hidden on every touch screen); a placed piece (`data-hl-user`) shows.
- `tools/lib/hud-survey-matrix.mjs`: `HELMET_LAYOUT_IDS`, the helmet facts and
  the expected-visibility rules above.

## Measured (hud-survey, one cell each, SwiftShader)

Before, `phone-landscape-844x390 · helmet`: visible = tower, map, gaps, sectors,
mirror, speed, strat; hidden by display = gearbox, energy, tyre, ot, aero, bb.

After: see the PR body (the cells are re-run on every change to the offsets).
