# Las Vegas Strip Circuit — Visual Design Brief

**Setting:** NIGHT race · theme `street_night` · ~6.2 km, 17 corners, anticlockwise.

## 1. Setting
A late-night street race threading the neon canyon of the Las Vegas Strip. Cars launch from a purpose-built pit/paddock zone, weave a technical sector around the MSG Sphere, then blast down Las Vegas Boulevard past the great casinos before snapping back through a tight final chicane. Pure spectacle over a pitch-black desert.

## 2. Atmosphere & Palette
Black, starless desert sky overhead. The world below is built entirely from light: saturated neon signage, white LED facades, and the Sphere's shifting color wash. Asphalt reads near-black, walls cool grey, glow is warm and electric.
- Sky / ambient: `[0.02, 0.02, 0.05]`
- Asphalt: `[0.10, 0.10, 0.12]`
- Warm casino glow: `[1.0, 0.78, 0.35]`
- Neon accents: magenta `[0.95, 0.15, 0.65]`, cyan `[0.15, 0.85, 0.95]`

## 3. Elevation
Essentially flat — Strip and surrounding streets sit at one grade. Only trivial dips under the bridges/overpasses near the Sphere sector (~s 0.30–0.40). Model as a level plane; no meaningful gradient.

## 4. Landmarks & Surroundings by Lap Position

| s (0–1) | Side | Distance | Box-model description |
|---------|------|----------|------------------------|
| 0.00 | R | near | Pit/paddock grandstand: long low white-LED box block, bright rim |
| 0.05 | L | mid | Illuminated billboard towers: thin tall boxes, magenta/cyan faces |
| 0.15 | both | near | Concrete barriers + debris fence: continuous low grey box wall |
| 0.30 | L | near | MSG Sphere: single-hue cyan-blue LED orb (few frustum bands + equatorial wash) |
| 0.49 | L | mid | Venetian / Palazzo at Strip entry: warm-cream tower cluster + campanile |
| 0.55 | L | mid | High Roller (LINQ, east of Blvd): tall cyan-lit observation wheel |
| 0.62 | R | mid | Caesars Palace: wide ivory box, gold up-lights `[1.0,0.8,0.4]` |
| 0.68 | R | mid | Bellagio + fountains + reflective lake: long elegant box, blue pool strip |
| 0.74 | L | near | Paris Las Vegas — Eiffel replica: tapering tower, amber spotlights |
| 0.85 | both | near | Strip-side neon billboards + barrier walls flanking final straight |
| 0.95 | R | near | Harmon Ave chicane grandstands: tiered dark boxes with bright crowd-light flecks |

## 5. Track Features
- **The Strip straight** (~s 0.50–0.78): ~1.9 km dead-straight, top speeds >340 km/h — widest, longest box corridor, DRS.
- **90-degree corners**: hard right at T5 (~s 0.18) and the T12 left onto the Strip (~s 0.48); sharp box-wall apexes.
- **Sphere technical sector** (~s 0.28–0.40): tight chicane (T7/8) hugging the Sphere.
- **Walls everywhere**: continuous concrete barrier boxes line both sides — it's a street track, no run-off.
- **Kerbs**: red/white striped low boxes at every apex and chicane.

## 6. Modelling Notes
- Light does the work: keep geometry blocky and let emissive tints sell the neon. Buildings are simple tall boxes with bright self-lit faces.
- Layer three depth bands: barrier walls (near), casino facades (mid), mountain silhouette (far) — mountains nearly black against the void sky.
- The Sphere is the hero of its sector: one oversized single-hue LED orb (not a rainbow onion); keep Venetian off ~s 0.30.
- Strip corridor order (southbound): Venetian L → High Roller L/east → Caesars R → Bellagio+lake R → Paris/Eiffel L → Harmon. Cull off-route Luxor / Welcome / MGM.
- Make the Strip straight feel vast — taller, denser, warmer box clusters than the Sphere sector to contrast the canyon vs. the open paddock.
- Saturate accents (magenta/cyan/gold) but keep asphalt and sky near-black so glow pops.
- Wet-look neon as thin emissive strips on the verge only (never centerline / tarmac pools).

## Research pass — findings (not yet built)

Wikipedia's own landmark list for the Las Vegas Strip Circuit: **MSG Sphere,
Caesars Palace, Bellagio, and Paris Las Vegas**. Add from the venue's own
materials:

- **The Bellagio fountains** — the circuit runs right past the fountain lake,
  and the Bellagio Fountain Club is built around that view. The lake, the
  fountain jets and the arc of the hotel behind it are one composed landmark,
  not three props.
- **The Sphere** at T-Mobile Turn 5 — the whole exterior is an LED display, so
  the ledFacadeBands treatment applies here more literally than anywhere else
  on the calendar.
- **Paris Las Vegas** — half-scale Eiffel Tower and Montgolfier balloon sign,
  directly trackside; a very cheap and very unmistakable silhouette.
- **East Harmon Zone** holds the Main Grandstand, opposite the pit lane, and is
  where the pre/post-race ceremonies happen.


## Outcome

Most of the researched list was already built: the Sphere, the Bellagio hotel
with its lake and an 18-jet fountain show spread across the full frontage,
Caesars, the Venetian, the High Roller, the Eiffel replica / Montgolfier
balloon, and the Harmon grandstands.

**2026-10-05 — Shanghai-style frac drift.** After `startFrac` moved to 0.9899
with `sceneryStartFrac` held at 0.8575, bare authored fracs (Sphere `K(0.30)`,
Strip canyon `0.485–0.815`, Caesars/Bellagio/Paris) landed ~0.16 lap early —
Sphere on Koval, Strip densify on Sands Ave — so the racing Strip read thin
(PR #928 follow-up). Re-keyed heroes + Strip canyon through `sl()` onto the
racing frame; registered `tests/data/landmarks/vegas.json`.

**2026-10-06 — DETAIL pass.** Strengthened Sphere LED meridians (chunky ribs + magenta equator), Caesars pediment/columns, Bellagio crown + lake-edge posts, Paris tower rings, Wynn/Encore copper twins on Sands, Strip storefront pods with pylon signs + sidewalk pads, street-level Strip billboards, and far-skyline width variety. Hollow grey open-face buildings stay on shared `building()` (#1056); not closed here.

**2026-10-09 — Strip setback review (PR #1221).** `dressingExclusions` are AUTHORED-frame (`TrackSpace.sceneryRange` adds
`_sceneryShift` 0.8433), unlike the `sl()` racing fracs the hand-placed Strip uses: the Strip window is authored 0.642-0.972
(racing 0.485-0.815) and the Sphere/Koval one authored 0.377-0.497 (racing 0.22-0.34); the first draft wrote the racing numbers
and excluded racing 0.328-0.658 instead. With the window right, Strip towers j=1/5/7 and the Paris-side hotel are no longer
silently `massBlocked` by generic city units. Campanile moved clear of the Venetian twin's second slab (sl 0.495), High Roller
at lateral 132 with its screen building at gap 38 (they overlapped at 87-97 vs 72-108), mid-Strip skywalk centred on its piers.
Tall hotel massing sits at the pit (racing 0.096 / 0.136); the S/F approach keeps billboards, the Harmon stand and low
back-of-house `cityFront` rows (authored 0.12-0.20 = racing 0.963-0.04). The 90 m "screen" tower at racing 0.062 still yields
to a generic unit (as before this PR); only its megascreen board stands there.
