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

## EA Sports F1 25 in detail (the closest reference for an F1 game)

Second pass, 2026-09-08, from EA's own pages and player guides.

- **The setting.** "Dynamic Racing Line: Off, Corners Only, or Full. The
  default is set to Full." A second setting, "Dynamic Racing Line Type", is
  3D or 2D, **default 3D** (EA F1 22 assists page; unchanged through F1 25).
- **What it shows.** "The optimal positioning of the car in the track, along
  with visual aids on when to brake" (EA F1 25 accessibility resources). The
  colours are red = brake, yellow/orange = lift or prepare (the transition
  between braking and accelerating), green = you can apply throttle
  (f125game.com; simracingsetup's F1 23 guide: "changes colour from green to
  orange to red"). It is DYNAMIC — evaluated against the player's current
  speed, so the same corner reads differently at different speeds, and the
  line "doesn't know your exact tyres or mistakes, so it can be early/late".
- **2D vs 3D.** The 2D type is a flat stripe on the road that still changes
  colour. The 3D type STANDS UP: it "pops up and then goes flat as you slow
  down / speed up" — the raised section is the braking cue, visible over a
  crest and through the car ahead, and it lies down again once the player is
  on pace (r/F1Game, "Small tip for Racing Line users who want to graduate").
  Players stepping off the assist go 3D FULL → 2D CORNERS ONLY → off, because
  2D corners-only is "way less intrusive, particularly in cockpit view".
- **How players read it.** The braking cue is conservative: the AI "brake
  quite a bit before the red line", beginners are told to "brake as soon as
  you hit the yellow", and quicker players brake after the red begins, or
  turn the line off once they know the circuit.
- **Accessibility.** Colour-blind variants for protanopia, deuteranopia and
  tritanopia (one of them paints the line white with the braking parts still
  red — a "cleaner" look some players choose on purpose), an **increased
  opacity** option, and in F1 25 audio driving assists: a Braking Assist tone
  (constant = hard braking, beeps = lighter) and an Audio Steering Assist that
  pans engine audio toward the racing line.
- **What this game takes from it.** The three modes and their default
  (FULL), the green → amber → red grammar against the player's speed, and the
  conservative braking cue (the sweep uses `BRAKE·0.85`, the AI's own margin),
  the colour-blind palette, the opacity option and the audio braking cue. Not
  yet: the 3D raised type, listed in "Not done" below.

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
  RACING LINE row already uses — one vocabulary. Default FULL, which is F1's
  own default (EA's F1 22 assists page: "Off, Corners Only, or Full. The
  default is set to Full") and Forza's; CORNERS is the reduced form the F1 and
  Forza guides recommend once a player knows the circuit, and it holds the
  line 60 m past each exit and fades over ~70 m so it never reads as cut off.
- **Where** RACE SETTINGS, beside DIFFICULTY: a property of the race a player
  is about to run, offered in every flow including time trial.
- **The line** is the circuit's baked racing line (`js/track/core/line.js`,
  outside-inside-outside, the line the AI drives since 2026-09-08), so the
  picture and the field are one truth; a track without one falls back to the
  steering assist's lateral formula (`lineX` in game.js).
- **The speed profile** is a cornering cap `sqrt(LAT_MAX·grip/|k|)` capped at
  `vTop()`, swept backwards under `BRAKE·0.85` and forwards under `ACCEL` — the
  AI's own brake-target model (`AiDrive.brakeTarget`), so the braking zones
  shown are the ones the field brakes in.
- **The look** a row of chevrons every 5 m pointing the way the lap runs
  (tip on the centre, wings trailing 1.6 m at the edges, 1.1 m stroke), each
  bending with the road because the pattern lives in the strip's (along,
  across) space — F1's form; a first cut of staggered pill dashes was replaced
  the same day at the owner's request. No derivatives, so WebKit-safe and the
  same maths on GLX / WGX / TLX.
- **Colour** F1's grammar against the player's speed: green at or under the
  line's speed, amber a little over, red clearly over. Forza's blue was not
  used: this HUD already uses blue for ERS and DRS.
- **On three.js it was invisible until the evening.** The real-GPU census that
  signed the port off drew the chevrons on GLX and WGX and none on TLX: three
  honours the road's own depth bias, GLX does not, so the fx decal offset
  copied from GLX put the ribbon (and every blob shadow and skid) behind the
  road. Fixed in `tsl-fx.js` (`-12/-24`); the story is in
  `docs/research/WEBGPU-PARITY.md` §Driving line and the defect ledger.
- **Colour** is now a CHOICE, and had to be (2026-09-08). F1's grammar —
  green on pace, amber a little over, red clearly over — puts the two ends of
  the scale on exactly the pair the common red-green deficiencies cannot
  separate, on a cue whose whole value is being readable at a glance. Roughly
  8 % of men have one of those deficiencies. SETTINGS › LINE COLOUR offers the
  IBM design library's colour-blind-safe triple instead: blue `#648FFF` on
  pace, orange `#FE6100` a little over, magenta `#DC267F` clearly over.
  Blue against orange is the classic safe pair; orange against magenta
  separates on the BLUE channel, which both deficiencies keep. It is one flag
  through the shared module into all three backends, and each shader MIXES
  between the two triples rather than branching, so the three stay identical
  and nothing depends on control flow. F1 25 ships the same choice, which is
  what prompted looking.
- **LINE OPACITY** (2026-09-08) F1 25 offers an *increased* opacity option;
  the complaint it answers runs both ways, so this row does too — SUBTLE
  (0.65), NORMAL (1.0, the line exactly as it shipped) and SOLID (1.35). The
  multiplier scales the emissive feed and the coverage TOGETHER, because a
  subtle line that keeps its bloom is not subtle. The alpha is clamped in all
  three shaders: SOLID takes the 0.85 base past 1, and a source alpha over 1
  over-blends. WGX's `params` vec4 was full (speed, cornersOnly, str,
  palette), so `LineU` gained a `params2` — 80 → 96 bytes, `_lineU` 20 → 24
  floats, validated against real Dawn (`wgx-validate`: ok, 0 WGSL parse
  errors, 0 GPU errors) rather than read-verified.
- **BRAKE CUE** (2026-09-08) F1 25's audio braking assist, built on the CUE
  rung of the ladder already designed in
  `docs/research/DRIVING-CONTROLS-RESEARCH.md` (OFF / CUE / LIGHT / FULL).
  `DrivingLine.cue()` returns the urgency from the SAME `over =
  playerSpeed / lineSpeed` the three shaders colour with, so ear and eye agree;
  `GameAudio.brakeCue()` turns it into a 520 Hz click whose interval closes
  from 0.4 s to 0.07 s. Two things it does NOT do, both on purpose: no pitch
  ramp (Forza's published BDA mechanics say the rate is the signal, and that
  doc flags the pitch ramp as the easy mistake — the first cut here made it),
  and no tone below `over` 1.0, where the ribbon's amber already opens at 0.98,
  because a faint tint at on-pace is fine and a beep is not. Still open from
  that research: the LOOKAHEAD should be a player setting rather than "read the
  line at the car's own position", which is what this ships with.
- **Not done** F1's raised 3D type (the shipped line is F1's 2D form); GT7's
  dotted style and corner-side indicators; Forza's off-track white; the LIGHT
  and FULL rungs of the braking ladder. (WGX and
  TLX gained their passes the same day — `docs/research/WEBGPU-PARITY.md`
  §Driving line.)
