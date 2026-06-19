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
| 0.30 | L | near | MSG Sphere: huge sphere faked as faceted glowing cube, color-cycling `[0.2,0.4,0.9]`→`[0.9,0.3,0.6]` |
| 0.35 | R | mid | Venetian tower cluster: tall warm-cream box stack with lit grid |
| 0.45 | R | far | Distant red-rock mountains: low flat dark-maroon `[0.18,0.08,0.07]` silhouette boxes |
| 0.50 | L | mid | Strip casino wall — Strip straight begins; Mirage/Caesars: stacked warm-glow towers |
| 0.58 | L | mid | Caesars Palace: wide ivory box, gold up-lights `[1.0,0.8,0.4]` |
| 0.64 | L | near | Paris Las Vegas — Eiffel replica: tapering lattice of thin dark boxes, amber spotlights |
| 0.70 | R | near | High Roller observation wheel: tall ring approximated by thin boxes ringed with cyan LED dots |
| 0.74 | L | mid | Bellagio: long low elegant box, soft warm wash + blue fountain-pool strip |
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
- The Sphere is the hero landmark: oversize it, give it a slow color cycle so it reads instantly even as a faceted cube.
- Make the Strip straight feel vast — taller, denser, warmer box clusters than the Sphere sector to contrast the canyon vs. the open paddock.
- Saturate accents (magenta/cyan/gold) but keep asphalt and sky near-black so glow pops.
- Mirror lights with faint ground reflection strips (dim emissive boxes on the asphalt) to imply wet-look Strip shine.
