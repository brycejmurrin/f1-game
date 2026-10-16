# Brands Hatch (Grand Prix circuit) — Visual Design Brief

**Setting:** DAY, green theme (Kent chalk downland). ~3.90 km, 11 turns, clockwise.

> **GEOMETRY CAVEAT: this trace is the MODERN 3.908 km Grand Prix circuit. Formula One raced a 4.207 km version; the corners are the same but the lap is not.**

## 1. Setting

A natural amphitheatre in Kent chalk downland. The start line sits on the rim and the track falls immediately and steeply into Paddock Hill Bend — the most identifying single piece of geometry on any British circuit. The Indy loop stays in the bowl; the Grand Prix loop escapes into woodland at the back before dropping back in. Hosted twelve British Grands Prix.

## 2. Atmosphere & palette

English green with chalk showing through. Grass banks rather than grandstands over most of the bowl.

## 3. Elevation

The bowl is everything. Paddock Hill drops hard off the start line, the track climbs to Druids, falls again to Graham Hill Bend, then runs out along Cooper Straight. **Do not flatten hills or add knife-edge terrain steps** to seat props.

## 4. Landmarks & surroundings by lap position

The GP loop runs clockwise, so the infield (pits, paddock, Kentagon) is the
`+1` side and the public banks are mostly `-1`. Turn fractions from the def:
`0.0143` Paddock Hill, `0.0762` Druids, `0.1903` Graham Hill, `0.3782` Surtees,
`0.4612`/`0.4748` Hawthorns, `0.5323` Westfield, `0.6362` Dingle Dell,
`0.8323`/`0.8448` Sheene/Stirlings, `0.9137` Clark Curve.

**Frame debt:** `startFrac` 0.1226 with `sceneryStartFrac: 0` leaves residual
`_sceneryShift` ≈ 0.836. Brabham / pit / stand / Kentagon props use `sl()` so
they travel with the line; bowl banking stays in the authoring frame. Probe
before moving any `K()`.

### Required landmarks (wave 6)

Named Indy-circuit stands (MSV Viewing Guide / BTCC grandstand maps /
[oversteer48 grandstands guide](https://oversteer48.com/brands-hatch-grandstands/)),
all `modelGroup(..., {required:true})` with positive seating rake:

| id | Place | Notes |
|---|---|---|
| `brands-pit-straight-stand` | Brabham / pit straight (−1) | Closest to the start/finish line |
| `brands-desire-wilson-stand` | Just short of Paddock Hill lip (−1) | Partial cover (only covered Indy stand) |
| `brands-paddock-hill-stand` | Lip of Paddock Hill Bend (−1) | Best amphitheatre view |
| `brands-hailwoods-stand` | Dip at the bottom of Paddock Hill (−1) | Cars plunging downhill |
| `brands-kentagon` | Infield opposite Paddock Hill (+1, outside pit band) | Clubhouse / bar silhouette with roof lantern |

| s | Side | Distance | Box description |
|---|---|---|---|
| 0.005 | -1 | 18 | Main grandstand run down Brabham Straight (`brands-pit-straight-stand`), with the merchandise/retail units behind it — a continuous built frontage, not isolated stands. |
| 0.005 | +1 | 14 | Pit garages. They sit INSIDE the loop, in the middle of the circuit, and block the view across to Cooper Straight from the main banks — that blocking is correct, not a mistake to design around. |
| 0.014 | -1 | 12 | Paddock Hill Grandstand (`brands-paddock-hill-stand`), at the end of the retail row right on the lip of the drop. The single most-photographed viewpoint at the circuit. Desire Wilson (`brands-desire-wilson-stand`) sits between Pit Straight and this lip. |
| 0.014 | +1 | 38 | The Kentagon (`brands-kentagon`) — the circuit's bar/clubhouse building, opposite the Paddock Hill grandstand. Placed outside the pit-complex preflight band so the required `modelGroup` is not superseded. |
| 0.025 | -1 | 14 | Hailwoods Grandstand (`brands-hailwoods-stand`) in the dip at the bottom of Paddock Hill, plus grass spectator bank. Standing crowd on grass beyond the stand. |
| 0.040 | +1 | 30 | Paddock/team area on the infield, stepping down the hill behind the pits — awnings, transporters, hospitality units. |
| 0.076 | -1 | 14 | Druids: terraced grass banking wrapping the outside of the hairpin, the natural amphitheatre's high point. |
| 0.070 | +1 | 8 | Spectator footbridge over the climb to Druids, carrying the public to the infield. |
| 0.190 | -1 | 16 | Graham Hill Bend: bank on the outside, looking back up the hill at Druids. |
| 0.260 | +1 | 12 | Cooper Straight runs back along the foot of the bowl under the pit buildings; keep this side built-up and close. |
| 0.378 | -1 | 20 | Surtees — the GP loop leaves the bowl here. Last of the open grass banking; the tree line starts. |
| 0.430 | -1 | 8 | Footbridge over Pilgrims Drop, then woodland closes in on both sides. No spectator terracing beyond this point. |
| 0.461 | 1 | 14 | Hawthorn Hill / Hawthorns Bend: mature broadleaf woodland tight to the edge, armco and a catch fence, nothing built. |
| 0.532 | -1 | 12 | Westfield Bend: woodland both sides, a small marshal post and a gravel trap on the outside. |
| 0.636 | 1 | 15 | Dingle Dell: the deepest point into the trees, and the classic "in the woods" frame of the GP loop. |
| 0.760 | -1 | 18 | Dingle Dell Corner into Sheene Curve — woodland thinning as the track turns back toward the bowl. |
| 0.832 | -1 | 20 | Stirlings Bend: the trees give out and the bowl reopens; grass banking resumes on the outside. |
| 0.914 | -1 | 16 | Clark Curve: long right back onto the pit straight, with terraced banking on the outside and the paddock entrance beyond. |
| 0.960 | +1 | 25 | Race control / timing building and the start gantry over the line. Nigel Mansell / Media Centre sits above the pit complex (MSVC venue doc). |

## 5. Track features

- Paddock Hill Bend: a downhill right immediately after the line, falling away under braking.
- Druids, a tight uphill hairpin at the top (Hailwoods Hill climb).
- The GP loop through Westfield, Dingle Dell and Sheene in the woods.
- Clark Curve closing the lap back into the bowl.

## 6. Modelling notes

- The bowl must read as a bowl — spectators on grass banks looking down into it from every side.
- The drop at Paddock Hill is the one piece of terrain that cannot be approximated.
- Woodland only on the GP loop; the bowl itself is open grass.
- Stand seating rows must rise away from the track (positive rake); do not ship hollow/backwards shells.

## 7. Sourced vs uncertain

**Sourced**

- 3.899 km GP / Indy amphitheatre, named corners (Paddock Hill, Druids, Graham Hill, Clearways, Brabham, Cooper): [racingcircuits.info](https://www.racingcircuits.info/europe/united-kingdom/brands-hatch.html), [Wikipedia](https://en.wikipedia.org/wiki/Brands_Hatch), MSV Venue Document 2022.
- Four public Indy grandstands — Paddock Hill, Hailwoods, Desire Wilson, Pit Straight: MSV Viewing Guide / BTCC maps; [oversteer48](https://oversteer48.com/brands-hatch-grandstands/) (Hailwoods in the dip; Desire Wilson just right of Paddock Hill; Desire Wilson the only partially covered stand).
- Nigel Mansell Centre / Media Centre above the pits; 34 pit garages; Hailwoods Restaurant (MSVC): MSV Venue Document 2022 PDF.
- Desire Wilson stand named for her 1980 Aurora F1 win at Brands Hatch: [Wikipedia — Desiré Wilson](https://en.wikipedia.org/wiki/Desir%C3%A9_Wilson).

**Uncertain / not built as fact**

- Exact 2026 seat-block subdivision of each named stand on the MSV ticket map — hero blocks only.
- Whether “Kentagon” (fan / older brief name for the clubhouse opposite Paddock Hill) is the same building MSV lists as Hailwoods Restaurant — both sit by the lower paddock; we keep the Kentagon silhouette as the infield clubhouse hero and do **not** invent a second restaurant mass.
- 1956 Northolt pony-trotting grandstand (history only; long since replaced) — not modelled.
