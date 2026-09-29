# Autódromo Internacional do Algarve (Portimão) — Visual Design Brief

**Setting:** DAY, green theme (Algarve hillside above Portimão). ~4.65 km, 15 turns, clockwise.

## 1. Setting
A rollercoaster cut into a steep hillside in the Algarve interior, opened 2008. It has more blind brows than anything else in this set: the pit straight plunges downhill into Turn 1, the middle sector falls off a cliff, and half the corners arrive over a crest with no view of the exit. The soil is **red Algarve earth** and it is everywhere — in the run-off, on the cut banks, on the car after any off. Spectators sit in broad concrete terraces cut straight into the slope (raw red escarpment above the top row) and in freestanding stands at the pit straight and the Turn 1 downhill.

## 2. Atmosphere & palette
Dry, bright, faintly dusty. Whitewash and terracotta against red earth and thin dark pine.
- Sky: zenith `[0.22, 0.44, 0.78]`, horizon `[0.82, 0.78, 0.68]`; sun `[1.0, 0.95, 0.78]`
- Fog `[0.78, 0.74, 0.64]`; grass `[0.30, 0.40, 0.20]`
- **Red earth run-off** `[0.66, 0.44, 0.30]`, shadowed `[0.54, 0.34, 0.23]` — the signature colour
- Umbrella pine `[0.14, 0.31, 0.16]` / `[0.11, 0.25, 0.14]`; dry scrub `[0.34, 0.38, 0.21]`
- Lime render `[0.95, 0.94, 0.90]`; terracotta pantile `[0.68, 0.36, 0.26]`; concrete `[0.76, 0.74, 0.70]`
- Kerbs red `[0.80, 0.14, 0.14]` / white `[0.92, 0.92, 0.90]`

## 3. Elevation
The defining feature — real Algarve hills from the SRTM bake in
`js/track/circuit-elevations.js` (~24 m continuous range). Keep the
rollercoaster character (blind brows into T1, the middle-sector plunge, the
climb back onto the pit-straight ridge); the bake removes knife-edge grade
jolts from the old sparse cosine bumps, not the hills themselves.

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box description |
|------|------|----------|-----------------|
| 0.938–0.998 | R | near | **Six independent paddock blocks (A–F)** — whitewashed masses with separate wave-roof slices and dilatation joints (Dimeconsult). Continuous roof phase across all six. Blocks A–D boxes+VIP; F taller media; race-control tower stays its own landmark |
| 0.992 | R | near | Race control: slim white shaft, dark cantilevered cab, Portuguese green/red band beneath it, standing proud of the ridge |
| 0.005 | L | near | Main grandstand (140 m) — covered, opposite the paddock (real AIA main stand is four dilatation blocks) |
| 0.055 | R | mid | **Grandstand Norte / T1 stands** — uncovered multi-tier outside the Turn 1 downhill braking zone; rows rise away from the track, past the amphitheatre terraces |
| 0.050 | L | near | **Turn 1** red-earth gravel apron (34×46) + red tyre wall, at the foot of the plunge |
| 0.035–0.095 | R | near | Hillside amphitheatre terraces cut into the slope (retaining wall + concrete steps + red escarpment) |
| 0.300 | R | near | Gravel apron + blue tyre wall at the Turn 3 crest |
| 0.30–0.42 | both | mid | Sparse pine and bare red banks only — no treeline; the crests ARE the view |
| 0.415 | R | far | **Moinho**: whitewashed drum windmill, conical cap, four bare sail arms on the skyline |
| 0.50 | L | mid | Camera tower over the middle-sector plunge |
| 0.55–0.70 | R | far | Whitewashed hillside **hamlet**: lime cubes with shallow pantile roofs, a squat chimney on every one, dry-stone yard wall |
| 0.62–0.70 | L | near | Second run of hillside terracing on the opposite slope |
| 0.640 | L | near | Gravel apron + yellow tyre wall |
| 0.86 | R | mid | Camera tower above the final complex |
| 0.900 | R | near | Final-corner gravel apron; crest marker boards on the skyline |
| 0.905–0.94 | R | far | Circuit's own **hillside apartments**: staggered terraces stepping DOWN the slope behind the paddock, each set back and dropped from the one above |
| — | ring | far | Monchique foothills rolling away inland, dry and pale |

## 5. Track features
- Blind crests everywhere — Turn 1, Turn 3, the middle sector, the run to the line. The marker boards standing on the skyline at each brow are half the information a driver gets.
- Cambered corners: T1 4°, T3 3.5°, the mid-lap right 4.5°, the final complex 3.5°.
- Three pinch points at s≈0.16, 0.49 and 0.845.
- Run-off and verge are **bare red earth**, not grass, the whole way round; the cut banks on the uphill sides show the same colour.

## 6. Modelling notes
- Exaggerate the vertical. Every crest should visibly hide the road beyond it — this circuit is unreadable if it plays flat.
- Keep planting deliberately thin. A wall of trees would hide every brow, which is the one thing that must not happen here.
- Corner gravel `groundPatch` + cut-bank `groundedSegments` carry the red earth; a continuous `runoffApron` loop buried into the terraces and was removed in wave 6.
- Spectator terracing is cut INTO the hill, with the escarpment as its back shell — plus freestanding stands at the line and Grandstand Norte at T1.
- Carry the pit roof's wave phase across all six blocks so it reads as one continuous undulation, not six identical humps.
- The moinho and the whitewashed hamlet belong on the skyline above the crests, not in the trackside dressing — they place the circuit in the Algarve at a glance.

## Research pass — montado

**The circuit is 22 km inland**, on the rolling hills of the Algarve interior
(racingcircuits.info, lapmeta) — not on the coast. So the absence of any
Atlantic in this file is *correct* and should stay that way; the "Algarve →
beach" instinct is wrong here.

What that interior actually is: **montado** — open, grazed, sparsely treed
country of cork oak and olive. The lap had generic scatter, which gave it trees
but not *these* trees.

- **Cork oak** is the giveaway and nearly free to draw. Short thick trunk, a
  broad **low** spreading crown wider than the tree is tall, and — where the
  bark has been stripped — a bare **rust-red lower trunk** under corky grey
  above. That two-tone trunk exists nowhere else on the calendar and reads at
  distance. Scattered, never in rows: montado is grazed woodland, so spacing is
  wide and irregular and the ground between stays open.
- **Olive terraces**, which unlike the oaks *are* ordered — planted on the grid.
  Tilled soil pads under each tree were dropped when they buried into the
  hillside cut banks (wave 6 ground-audit); the trunks still seat on grade.

## Landmark wave 6 — sourced vs uncertain

**Sourced (built):**
- Six structurally independent paddock blocks A–F with dilatation joints —
  Dimeconsult project notes for the 2008 AIA paddock
  (https://dimeconsult.pt/projectos_desenv2.php?ano=2008&id=9&m=3).
- Grandstands concentrated on the pit straight and Turn 1 downhill —
  https://3ddigitalvenue.com/3dmap/clients/f1/algarve-international-circuit/ ;
  seating plans list Grandstand Norte / MEO at T1–T2.
- Main stand as four dilatation blocks (same Dimeconsult page) — modelled as
  one long `grandstandEx` opposite the paddock (block subdivision not split).
- Capacity ~90k seated (official AIA event guide) / ~100k often cited
  (Wikipedia / Autosport).
- Craig Jones corner naming is real; the roundabout statue was removed in 2009
  (portugalresident.com) — **not built**.

**Uncertain / not built as fact:**
- Exact per-block height / VIP floor counts beyond Dimeconsult's "2–4 storeys"
  and A–D / E / F programme labels — proportions are interpretive.
- Precise GPS footprint of Grandstand Norte vs amphitheatre terraces — stands
  are placed outside the terrace belt so they do not coplanar-fight the steps.
