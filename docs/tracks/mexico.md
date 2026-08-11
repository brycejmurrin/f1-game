# Autódromo Hermanos Rodríguez (Mexico City) — Visual Design Brief

**Setting:** DAY · Modern theme (high-altitude city park)
**Layout:** 4.30 km, 17 corners, clockwise, very flat — but at ~2,285 m altitude.

## 1. Setting
A flat circuit threaded through the **Magdalena Mixhuca** public sports park in the
heart of Mexico City. Surrounded by mature park trees, sports facilities and, beyond
them, a dense low-rise urban sprawl fading into distant mountains. The signature
feature is the track ducking **through a real baseball stadium** (Foro Sol) for its
slowest section — concrete bowls packed with tens of thousands of close, loud fans.
Engineered, festive, and unmistakably *city park* rather than wilderness or street.

## 2. Atmosphere & Palette
Brilliant, slightly washed high-altitude sky — thin air gives a clean but hazy
horizon. Park greens dominate the verges; bold, festive Mexican accents (papel
picado banners, flags, pink/green/orange signage) everywhere. Suggested tints:
sky `[0.56,0.72,0.92]`, cool horizon `[0.68,0.72,0.78]`, park grass
`[0.34,0.52,0.26]`, tree green `[0.22,0.40,0.20]`, asphalt `[0.21,0.21,0.23]`,
festive pink `[0.92,0.28,0.55]`, marigold orange `[0.98,0.55,0.12]`, flag green
`[0.10,0.55,0.30]`. Thin-air haze: denser cool fog (`fogDensity≈0.0022`) so the
far **Sierra Nevada** volcano ring (Popocatépetl / Iztaccíhuatl blue-grey rock +
snowcaps) reads behind a pale city sprawl.

## 3. Elevation
Near-flat — only two long, gentle swells (~5 m and ~3 m) over the lap. The defining
"altitude" reads visually (thin haze, washed sky), not as slope. The old
Peraltada line survives as real **banking** into the final corners (6° at
`s≈0.97`, easing to 5° at the exit).

## 4. Landmarks & Surroundings by Lap Position

| s | Side | Distance | Box-model description |
|------|------|----------|-----------------------|
| 0.00 | R | near | Main grandstand: long tall stepped box, grey seats + festive banner trim |
| 0.02 | L | near | Pit/paddock block: low wide white box with flat roof slab |
| 0.06 | both | mid | **DRS Mixhuca park corridor**: dense forestEdge / hedge — park before city |
| 0.12 | R | near | Turn 1 right-hander grandstand: stepped seating box, big red/white kerb |
| 0.20 | both | mid | Moises Solana Esses stands: low thin seating boxes flanking flat infield |
| 0.34 | L | far | Distant city sprawl (pushed back): low pale skyline behind park green |
| 0.42 | R | near | Horquilla hairpin: wide grey runoff box, tight kerb, small fan stand box |
| 0.55 | both | mid | Park greenery + sports facility: green grass plane + scattered low boxes |
| 0.66 | R | far | Lucha-libre tribute statue: small masked-wrestler box on a plinth box |
| 0.72 | both | near | **Foro Sol entry gap**: bright aperture into the baseball bowl |
| 0.74–0.86 | both | near | Stadium bowl: continuous seat wall + field floor + nested tiers |
| 0.88 | both | near | **Foro Sol exit gap**: bright opening back to open park track |
| 0.92 | R | near | Peraltada / Estadio stand: long curved grandstand box on faint banked edge |
| 0.99 | R | near | Final-corner grandstand: stepped seating box feeding the main straight |
| far | all | horizon | **Sierra Nevada** cool blue-grey mountain ring under thin-air haze |

## 5. Track Features
- **Long start/finish straight:** ~1.29 km flat-out DRS run, one of F1's longest.
- **Foro Sol stadium section (`s≈0.74–0.88`):** slow left-right-left squeezed between
  two packed baseball-stadium grandstand bowls — the iconic enclosed corridor.
- **The Peraltada (`s≈0.90–0.97`):** the legendary banked sweep, now split into the
  Estadio corners — the road itself carries 6° of camber, easing to 5° at the exit.
- **Kerbs:** bold red/white striped low boxes at every apex; deep at Turn 1 and Horquilla.

## 6. Modelling Notes
- Sell the track with the **Foro Sol baseball bowl**: continuous eye-height seat
  walls both sides, nested tiers, green/dirt bowl floor off tarmac, and clear
  bright **entry/exit apertures** (do not wall the corridor ends shut).
- Keep the ground plane **green and flat** — it is a leafy park, not a desert.
  **Park-first**: dense Mixhuca `forestEdge` on the DRS/mid-lap; push/thin
  `cityFront` so CDMX sprawl sits as backdrop, not street canyon.
- Scatter **festive accents**: pink/orange/green banner and flag boxes on stands and
  fences for the fiesta atmosphere.
- Ring the horizon with a **far Sierra Nevada mountain ring** (cool blue-grey rock +
  snowcaps) under denser thin-air haze; keep city towers secondary and further back.
- Lead the entry with the **lucha-libre statue** box as a small cultural Easter egg.
- Bank the final Peraltada/Estadio corners with the road (6° easing to 5°), kerbs tilted with it.


## Research pass — verified, already covered

The Foro Sol stadium section, the Peralta banking, the crowd, the jacarandas
and the **Popocatépetl / Iztaccíhuatl** twin-volcano silhouette on the
high-altitude Sierra Nevada horizon are all modelled. **Nothing added.**

Note for a future pass: *cactus would be wrong here.* The Autódromo Hermanos
Rodríguez is inside the urban Magdalena Mixhuca sports park at 2,240 m, not in
desert — the generic "Mexico = cacti" instinct should be resisted.
