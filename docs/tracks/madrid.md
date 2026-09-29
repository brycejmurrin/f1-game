# Madring — IFEMA Madrid Circuit — Visual Design Brief

**Theme:** `modern` (hybrid street/permanent) · **Time:** DAY · **Render:** procedural colored boxes, no textures

## 1. Setting
A hybrid street/permanent circuit (`lengthKm` 5.47 in the def; official **5.414 km**
per F1.com — do not “fix” the def length) with 22 corners wrapping the IFEMA
Madrid exhibition grounds in the Barajas/Valdebebas district, north-east Madrid.
The lap mixes wide public-road urban sections with a purpose-built northern loop.
Pit and paddock sit inside IFEMA's large rectangular exhibition halls. The defining
structure is **La Monumental**, a ~550 m, ~270° banked stadium curve ringed by tall
grandstands, evoking the city's Las Ventas bullring. Beyond the venue lie open dry
Castilian plains and, on the horizon, the **Sierra de Guadarrama** mountain range.

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
Recinto Ferial to the Valdebebas expansion and back. Official length is
**5.414 km** (F1.com / Wikipedia); the game def keeps `lengthKm` 5.47 and the
OSM trace builds ~5.343 km — **UNCERTAIN / do not “fix” length here**.
Main straight ~523 m; 12 m wide except the main straight and Turn 1 (15 m).
Its single most distinctive real-world fact is that it sits minutes from
**Adolfo Suárez Madrid-Barajas** airport. Designer: Studio Dromo (Jarno
Zaffelli). First GP weekend: 11–13 Sep 2026.

Already modelled: IFEMA halls, La Monumental banked bowl, both tunnel portals,
and a Barajas control tower with an airliner on approach. The Estadio
Metropolitano (~3 km south) stays off the skyline — too far.

## Wave 6 scenery (landmark)

- **`madrid-monumental-stands`** (required `modelGroup`): raked seating on the
  **inside** of the banked curve (positive slope — rows rise away from the
  track) with rim flood masts. Capacity context: ~45,000 across the Monumental
  sector (madring.com Curve 12; F1.com guide). Banking 24% / ~13.5°, ~550 m
  (F1.com; madring.com lists 547.82 m).
- Outside bowl ring retained denser (Motor Sport Magazine: hospitality inside,
  grandstand mass on the outside). Ticket grandstand numbers 9 / 9A / 10 / 10A /
  11 / 12 are from seating guides, **not** the organiser — place by the
  Monumental sector only; do not label as fact.
- Geometry: IFEMA stand roof prism seated on its spine (was 11.4 m unsupported);
  madringDeck fascia hung off the front row (was buried on the rising verge);
  wrap-around wall split away from engine corner tyre-caps (coplanar fights).

### Sources
- https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-madring.NF7Mh3iag3w9GUPlihwJA
- https://en.wikipedia.org/wiki/Madring
- https://www.madring.com/en/circuit
- https://www.motorsportmagazine.com/articles/single-seaters/f1/madrings-la-monumental-the-banked-corner-thats-unlike-anything-else-in-f1/
- https://www.tracksideseats.com/f1/guides/madring-grandstand-guide (grandstand numbering — UNCERTAIN vs turns)
