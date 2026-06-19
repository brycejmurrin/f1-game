# Autódromo José Carlos Pace (Interlagos) — Visual Design Brief

**Theme:** `urban_day` (São Paulo, green) · **Time:** DAY · **Render:** procedural colored boxes, no textures

## 1. Setting
A hilly urban motor-park in the Cidade Dutra district on the south side of São Paulo, hemmed in by sprawling Brazilian city. The Represa do Guarapiranga lake sits just beyond the infield, and the lap rolls constantly over undulating ground. Beyond the catch-fences: green wooded banks, colourful favela houses stacked up the hillsides, and a hazy ring of São Paulo high-rises on the horizon. Anti-clockwise, compact, intimate.

## 2. Atmosphere & palette
Variable tropical sky — bright sun one moment, brooding grey cloud and rain the next. Lush greens, warm concrete, and bursts of favela colour. Apply a soft low fog for a humid, moody depth on the skyline.
- Sky: `[0.55, 0.68, 0.80]` hazy blue-grey (allow darkening for storm mood)
- Tarmac: `[0.30, 0.31, 0.33]` bumpy grey asphalt
- Grass/banks: `[0.28, 0.50, 0.24]` vivid tropical green
- Lake: `[0.22, 0.42, 0.50]` muddy blue-green
- Favela blocks: scattered saturated boxes — `[0.85,0.35,0.30]`, `[0.95,0.78,0.25]`, `[0.30,0.55,0.80]`, `[0.90,0.90,0.85]`
- City high-rises: desaturated `[0.55,0.58,0.62]` haze-greyed
- Kerbs: red/white `[0.80,0.18,0.18]` + `[0.92,0.92,0.92]`

## 3. Elevation
~43 m of change over the lap. High point is the start/finish straight on the plateau. Sharp **downhill plunge into the Senna S** (s≈0.03→0.10), running low through the fast infield and Reta Oposta. The track stays low through Descida do Lago and Ferradura, then **climbs back hard from the Junção up the long banked drag to the start/finish line** (s≈0.80→1.0).

## 4. Landmarks & surroundings by lap position
| s | Side | Dist | Landmark — box-modelling note |
|------|------|------|-------------------------------|
| 0.00 | R | close | Pit/control tower + pit building — tall slab box w/ stacked window-band boxes |
| 0.02 | L | mid | Main grandstand — long stepped grey box, thin railing slats |
| 0.05 | both | close | Senna S — narrow downhill left-right-left, red/white kerb boxes inside each apex |
| 0.15 | L | far | Colourful favela hillside — clustered small saturated cubes climbing a green slope |
| 0.25 | R | mid | Reta Oposta straight — open green banks, low advert-board boxes |
| 0.35 | L | far | Lago/Guarapiranga water — muddy blue-green plane beyond the trees |
| 0.45 | both | mid | Descida do Lago — downhill left-handers, grass run-off boxes, gravel tan trap |
| 0.60 | R | far | São Paulo high-rise skyline — row of tall haze-grey slab boxes on horizon |
| 0.70 | L | mid | Ferradura / infield esses — green banks, tyre-wall boxes (dark grey stacks) |
| 0.82 | L | close | Junção — tight uphill left, kerb boxes, start of the climb |
| 0.92 | both | mid | Climb to s/f (Subida dos Boxes) — banked grey ramp, pit-wall slab boxes on right |

## 5. Track features
- Anti-clockwise direction — most corners turn left.
- Signature **Senna S**: a downhill left-right-left where each apex differs in radius and camber.
- Cambered/banked corners and the long climbing final straight; constant undulation throughout.
- Aggressive red-and-white kerbs at the S, Junção, and chicane-like apexes.
- Bumpy, old-surface tarmac feel — keep the ground subtly uneven.

## 6. Modelling notes
- Make the **downhill plunge into the Senna S** and the **uphill banked drag to the line** the two defining elevation beats — exaggerate the ramp.
- Cluster bright saturated favela cubes up a green hillside as the instant São Paulo signifier.
- Ring the horizon with desaturated haze-grey high-rise slabs to read as a big-city park, not open countryside.
- Use a muddy blue-green lake plane beyond the trees on the lake side of the infield.
- Lean on vivid tropical-green bank boxes everywhere to contrast the grey tarmac and city haze.
- Keep the pit/control tower a tall distinctive slab — the circuit's most recognisable built structure.
