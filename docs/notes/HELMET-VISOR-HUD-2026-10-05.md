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

After, same cell (dock zoom 0.865): ENERGY 359..491 y198-213, centred over the
wheel's top edge (the rim from y215); TYRES 59..189 y233-273, between STRATEGY
(bottom 211) and the steer buttons (top 289); speed 392..457 y309-340 over the
LCD; gearbox, OT, AERO, BB hidden by the helmet touch hide. The only finding is
the pre-existing TRACK LIMITS × STRATEGY 2.8 px touch, present in the before
cell too. The first offsets (ENERGY x-12 y-29, TYRES y-10) put ENERGY at
257..389 y229-244, over the wheel's left grip, and TYRES 9 px over STRATEGY;
the retune to ENERGY y-37 / TYRES y-2 cleared both.

`desktop-1280 · helmet` after: gear 4..266 y438-504 (fit() pinned it at the
left edge), speed 123..210 y376-423, ENERGY 327..517 y577-595, TYRES 4..134
y619-661, OT 1067..1156 and AERO 1176..1297 y494-535. One finding: AERO crosses
the right edge by 17 px — the cockpit strip's own re-fit timing (a moved piece
whose words change width), fixed on `claude/hud-aero-edge` (843db7219); not
this change's.

The gearbox chip stays hidden on a touch helmet on purpose: at 844x390 it is
~106x61 px and no free region beside the wheel holds it, while the LCD's gear
glyph is the one read that survives the shrink. A placed gearbox (MOVE & SIZE,
`data-hl-user`) shows.
