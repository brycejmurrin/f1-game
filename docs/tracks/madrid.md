# Madring — IFEMA Madrid Circuit — Visual Design Brief

**Theme:** `street_modern_day` (hybrid street/permanent) · **Time:** DAY · **Render:** procedural colored boxes, no textures

## 1. Setting
A hybrid street/permanent circuit (5.47 km, ~20–22 corners) wrapping the IFEMA Madrid exhibition grounds in the Barajas/Valdebebas district, north-east Madrid. The lap mixes wide public-road urban sections with a purpose-built northern loop. Pit and paddock sit inside IFEMA's large rectangular exhibition halls. The defining structure is **La Monumental**, a 550 m, ~270° banked stadium curve ringed by tall grandstands, evoking the city's Las Ventas bullring. Beyond the venue lie open dry Castilian plains and, on the horizon, the **Sierra de Guadarrama** mountain range.

## 2. Atmosphere & palette
Bright, dry Spanish midday — hard sun, crisp shadows, minimal fog (a faint dusty haze low on the plains/Sierra for depth only).
- Sky: `[0.42, 0.66, 0.93]` clear bright blue
- Tarmac: `[0.33, 0.34, 0.36]` fresh modern asphalt
- Modern structures (halls, roofs): white/glass — `[0.90, 0.92, 0.94]` white, `[0.62, 0.74, 0.82]` glass-blue
- Dry plains / scrub ground: `[0.78, 0.70, 0.48]` straw-tan
- Sparse vegetation: muted olive `[0.42, 0.48, 0.30]`
- Sierra de Guadarrama (distant): hazy blue-grey `[0.55, 0.60, 0.66]`
- Barriers/concrete: pale grey `[0.74, 0.75, 0.77]`

## 3. Elevation
~26 m total change. Generally rolling; the urban mid-section climbs and dips ("El Búnker": ~8% rise then a sharp ~5% drop into a right). High point around the elevated urban sector near **s≈0.35–0.45**; the steepest drop follows just after (**s≈0.45–0.55**). The banked Monumental loop sits lower and flatter at the northern end (**s≈0.70–0.85**).

## 4. Landmarks & surroundings by lap position
| s | Side | Dist | Landmark — box-modelling note |
|------|------|------|-------------------------------|
| 0.00 | R | close | Pit wall & main grandstand — long low grey box, thin white-roof cap |
| 0.02 | both | mid | IFEMA exhibition halls — huge flat white rectangular boxes, glass-blue strip |
| 0.08 | R | mid | T1 chicane braking zone — pale concrete wall boxes, red/white kerb strips |
| 0.20 | L | far | Dry plains scrub — flat straw-tan ground plane, sparse olive shrub cubes |
| 0.35 | both | close | Elevated urban sector — grey concrete deck/wall boxes, ramp up |
| 0.50 | R | close | El Búnker drop — sharp grey retaining-wall box, kerb on the dip |
| 0.62 | L | far | Sierra de Guadarrama — hazy blue-grey ridge boxes on the horizon |
| 0.75 | both | close | **La Monumental** banked curve — tilted asphalt band + tall encircling grandstand boxes, white roofs |
| 0.80 | both | mid | Monumental light towers — thin tall grey poles, small bright cap cubes |
| 0.90 | R | mid | Modern IFEMA grandstands — stepped grey seating boxes, white canopy roofs |
| 0.96 | L | mid | Valdebebas plains edge — straw-tan ground, low scrub, fence-line boxes |
| all | both | close | Concrete barriers — continuous pale-grey thin boxes lining the street sections |

## 5. Track features
- **La Monumental:** signature ~24% banked stadium curve — render as a steeply tilted asphalt band wrapped 270° by tall grandstand boxes; the lap's hero feature.
- Mix of **street sections** (tight concrete barriers, flat road) and **permanent sections** (wider run-off, kerbs, grandstands).
- Bright red/white kerbs at chicanes and the banked entries; otherwise smooth modern flat tarmac.

## 6. Modelling notes
- Make the banked Monumental ring of grandstand boxes the instant signature — exaggerate the tilt and encircle it fully.
- Contrast clean white/glass IFEMA hall boxes against the warm straw-tan dry-plain ground to read as modern Madrid.
- Float a hazy blue-grey Sierra de Guadarrama ridge on the far horizon for depth; keep it low-detail.
- Use continuous pale-grey concrete barrier boxes on street sectors vs. open kerbed run-off on the permanent northern loop to sell the hybrid identity.
- Thin tall light-tower poles around the Monumental add modern stadium scale.
- Keep palette bright and dry — hard sun, sharp shadows, near-zero fog except a faint horizon haze.
