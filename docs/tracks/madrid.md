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
| 0.08 | both | mid | T1 chicane + **motorway overpass** — pale concrete portal deck cars pass under |
| 0.20 | L | far | Dry plains scrub — flat straw-tan ground plane, sparse olive shrub cubes |
| 0.35 | both | close | Elevated urban sector — grey concrete deck/wall boxes, ramp up |
| 0.50 | R | close | El Búnker drop — tall grey retaining-wall boxes + bunker-slot band |
| 0.62 | L | far | Sierra de Guadarrama — hazy blue-grey ridge boxes on the horizon |
| 0.75 | both | close | **La Monumental** banked curve — continuous white nested bowl + flood ring |
| 0.80 | both | mid | Monumental flood masts — tall dual-arm cool-white poles on the rim |
| 0.84 | both | mid | **Valdebebas pelouse** — open straw runoff gap (no city facade) post-bowl |
| 0.90 | R | mid | Modern IFEMA grandstands — stepped grey seating boxes, white canopy roofs |
| 0.96 | L | mid | Valdebebas plains edge — straw-tan ground, low scrub, fence-line boxes |
| all | both | close | Street = pale concrete walls; permanent/Monumental = open guardrail |

## 5. Track features
- **La Monumental:** signature ~24% banked stadium curve — render as a steeply tilted asphalt band wrapped 270° by tall grandstand boxes; the lap's hero feature.
- Mix of **street sections** (tight concrete barriers, flat road) and **permanent sections** (wider run-off, kerbs, grandstands).
- Bright red/white kerbs at chicanes and the banked entries; otherwise smooth modern flat tarmac.

## 6. Modelling notes
- Make the banked Monumental ring of **continuous white** grandstand tiers the instant signature — nested bowl + flood ring; keep any Las Ventas brick arcade thin and behind the rim.
- Contrast clean white/glass IFEMA hall boxes against the warm straw-tan dry-plain ground to read as modern Madrid — no lush forest edges.
- Hybrid rhythm: continuous pale-grey concrete walls on street sectors; open guardrail + runoff on the permanent northern loop / Monumental / pelouse.
- El Búnker retaining wall at the mid-lap climb/drop and a motorway overpass at the T1 chicane as silhouette landmarks.
- Float a hazy blue-grey Sierra de Guadarrama ridge on the far horizon for depth; keep it low-detail.
- Keep palette bright and dry — hard sun, sharp shadows, near-zero fog except a faint horizon haze.


## Research pass — verified, already covered

Checked against madring.com, F1.com and racingcircuits.info. The Madring is a
hybrid: public roads around the **IFEMA** halls joined to permanent sections
built on adjacent **Valdebebas** land, with **two short tunnels** linking the
Recinto Ferial to the Valdebebas expansion and back. 5.416 km, main straight
523 m, 12 m wide except the main straight and Turn 1 (15 m). Its single most
distinctive real-world fact is that it sits minutes from **Adolfo Suárez
Madrid-Barajas** airport.

All of that is already modelled — the IFEMA halls, La Monumental banked bowl,
both tunnel portals, and a Barajas control tower with an airliner on approach.
**Nothing added.** The one absent nearby landmark is the Estadio Metropolitano,
~3 km south; judged too far to belong on this skyline.
