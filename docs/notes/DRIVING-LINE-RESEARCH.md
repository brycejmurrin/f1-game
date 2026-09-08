# The driving line — how the other racing games draw it (2026-09-08)

Evidence behind `js/render/shared/driving-line.js` and the RACE SETTINGS ›
DRIVING LINE row. Read when the line's look, modes or colours are questioned.

## What each game offers

| game | setting | modes | the ribbon | colour grammar |
|---|---|---|---|---|
| Forza Motorsport / Horizon | Suggested Line (Driving Line) | FULL · BRAKING ONLY · OFF | one solid ribbon on the road, whole lap in FULL; BRAKING ONLY draws only the red parts | **dynamic against the player's speed**: blue where it is ideal to accelerate, red where the driver should slow down (older Motorsport titles: yellow = slow down, red = too fast); turns **white** when the car is off the track |
| EA / Codemasters F1 (2017 → F1 25) | Dynamic Racing Line | FULL · CORNERS ONLY · OFF, plus TYPE 2D (flat on the road) / 3D (raised) | ribbon; CORNERS ONLY fades in before a braking zone and out after the exit | green (on pace) → yellow/amber (lift) → red (brake), evaluated against the player's current speed, so the same corner reads differently at 300 and 200 km/h; a colour-blind alternative palette exists |
| Gran Turismo 7 | Driving Line + Corner Indicators + Braking Area (three separate assists) | each ON/OFF | a **dotted** line; corner indicators are markers on the sides of the track; Braking Area is a separate marker on the road | the line itself is not colour-coded; the Braking Indicator turns the speedometer red and flashes it |

Sources: Forza support "Forza Motorsport Accessibility Support" (Suggested Line
definitions); Forza Wiki "Driver Assists"; Gran Turismo 7 manual "Assistance
Settings"; simracingsetup.com "F1 25 assists guide" and the F1 24 settings
round-ups (Dynamic Racing Line: Corners Only / Full, type 2D / 3D).

## How engines draw it

- The geometry is a **polystrip laid on the road** — the same shape as a
  generated mesh decal (Sam Driver, "Introduction to decal rendering": a mesh
  matching the target surface, rendered without special shaders). Real-time
  engines' decal projectors (Unity URP/HDRP Decal Projector, Unreal mesh decals)
  do the same job for painted markings; a strip that already knows the road's
  surface skips the projection.
- Depth-tested, **no depth write**, biased off the surface, alpha-blended —
  exactly this game's batched skid-mark path (`drawSkidBatch`).
- The "glow" is emissive colour above 1.0 in an HDR pipeline, so the bloom
  pass lifts it; the strip has a soft rim so it reads as a line, not a slab.

## What this game does

- **Modes** OFF · CORNERS · FULL, the F1 names, which the STEERING assist's
  RACING LINE row already uses — one vocabulary. Default CORNERS (every game
  ships its line on for a new player; CORNERS is the form both F1 and Forza
  guides recommend once a player knows the basics).
- **Where** RACE SETTINGS, beside DIFFICULTY: a property of the race a player
  is about to run, offered in every flow including time trial.
- **The line** is the same lateral formula as the RACING LINE steering assist
  (`lineX` in game.js), so the picture and the pull agree.
- **The speed profile** is a cornering cap `sqrt(LAT_MAX·grip/|k|)` capped at
  `vTop()`, swept backwards under `BRAKE·0.85` and forwards under `ACCEL` — the
  AI's own brake-target model (`AiDrive.brakeTarget`), so the braking zones
  shown are the ones the field brakes in.
- **Colour** F1's grammar against the player's speed: green at or under the
  line's speed, amber a little over, red clearly over. Forza's blue was not
  used: this HUD already uses blue for ERS and DRS.
- **Not done** GT7's dotted style and corner-side indicators; F1's raised 3D
  type; Forza's off-track white. WGX and TLX have no pass yet (parity gap
  recorded in `docs/research/WEBGPU-PARITY.md`).
