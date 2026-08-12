# Indianapolis Motor Speedway (road course) — Visual Design Brief

**Setting:** DAY, modern theme (the Speedway infield, Indiana). ~4.19 km, 13 turns, clockwise.

> This is the **F1 road course** — the infield section joined to the oval's front straight and banked Turn 1, run **CLOCKWISE**, the opposite direction to the Indianapolis 500. Nothing here should imply an oval lap.

## 1. Setting
Two completely different worlds in one lap. The oval portion is a walled bowl: a **continuous two- and three-tier wall of grandstand** running the whole front straight and both oval turns, enclosing the track like a stadium — nothing else on the calendar looks remotely like it — with the **Pagoda** control tower over the start line and the preserved **yard of bricks** at the line itself. Then the circuit turns into the infield and becomes an ordinary flat, grassy, open road course with temporary furniture. The site was graded level on Indiana farmland in 1909 and is deliberately, famously flat.

## 2. Atmosphere & palette
Flat Midwestern summer: high hazy sun, humid near-white horizon, no relief anywhere.
- Sky: zenith `[0.28, 0.48, 0.76]`, horizon `[0.84, 0.84, 0.80]`; sun `[1.0, 0.96, 0.84]`
- Fog `[0.82, 0.82, 0.80]`; grass `[0.24, 0.44, 0.20]`
- Concrete `[0.74, 0.73, 0.70]`; infield trees `[0.22, 0.44, 0.20]` / `[0.16, 0.36, 0.17]`
- **Bucket seat bands**: blue `[0.30, 0.42, 0.66]`, white `[0.86, 0.86, 0.84]`, red `[0.72, 0.20, 0.18]` — what makes an empty Speedway stand read as a Speedway stand
- Yard of bricks: alternating warm brick tones across the full track width
- Gravel `[0.66, 0.62, 0.50]`

## 3. Elevation
Essentially none. This is the flattest circuit in the game and that is a design decision, not an omission.
- s≈0.40: +1.8 m.
- s≈0.68: −1.5 m.
- Vary ground-box tops by ≤1 unit; the only vertical interest comes from the 9° banking at Turn 1 and from the grandstand wall itself.

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box description |
|------|------|----------|-----------------|
| 0.86–0.22 | R | near | **THE GRANDSTAND WALL**: unbroken two- and three-tier seating running the entire oval portion, banded blue/white/red. Continuous — no daylight between segments |
| 0.90–0.20 | L | near | Inner infield stands facing back across the front straight |
| 0.005 | L | near | **THE PAGODA**: solid base housing under five diminishing glass tiers, each with an overhanging eave, crowned by a mast — the most recognisable structure in American motor racing |
| 0.00 | — | on road | **THE YARD OF BRICKS**: a metre-wide band of alternating brick tones laid across the full track width at the start/finish line |
| 0.955 | L | near | **Pit stalls**: open-fronted boxes under one long flat roof on slim posts — back wall and dividing fins, no fronts. NOT enclosed garages |
| 0.92–0.98 | L | far | Infield garage/paddock blocks behind the pit lane |
| 0.115 | — | — | **Oval Turn 1**: 9° banking held over a 320 m width zone, taken flat — the only real banking on the lap |
| 0.86–0.22 | R | near | Continuous white concrete **retaining wall** along the whole oval section — a solid barrier, not armco |
| 0.84–0.99 | R | far | Tall lattice **light towers** ringing the oval, tallest things for miles |
| 0.24–0.70 | both | — | The infield: half-width drops to 6.4 m, world changes completely — low, open, grassy |
| 0.300 | R | near | Infield gravel apron + red tyre wall; scaffold stand opposite on L |
| 0.500 | L | near | Infield gravel + blue tyre wall; scaffold stand on R |
| 0.660 | R | near | Infield gravel apron; aluminium stand on L at 0.680 |
| 0.30–0.70 | both | mid | Sparse ornamental tree clumps only — the golf course and service roads occupy the middle |
| — | ring | far | Flat Indiana: a low treeline and the Speedway's own light towers are the whole horizon. No hills at all |

## 5. Track features
- The banked oval Turn 1, entered flat off the front straight — the transition from 15 m-wide oval to a 6.4 m infield road course is abrupt and is the circuit's whole rhythm.
- Barriers change character: solid concrete on the oval, ordinary armco in the infield. Show the contrast.
- Slow, tight, low-grip infield sequence with heavy braking zones and modest kerbs.
- The final banked sweep (s≈0.88, 6°) rejoins the front straight.

## 6. Modelling notes
- Build the grandstand as ONE continuous wall, not a row of stands. Any daylight between segments and the Speedway stops being a Speedway.
- Band the seating blue/white/red; an unbanded grey terrace reads as generic even when it is the right shape.
- The Pagoda must be a stack of DIMINISHING tiers with overhanging eaves and a glass band per tier — the profile is the recognition, not the size.
- Pit boxes are open stalls under one flat roof, not enclosed garage bays. Every road course has the latter; this one never did.
- Keep the ground plane dead level. Nothing grows inside the oval and there are no hills anywhere on the horizon — resist adding either.
- The yard of bricks is a tiny detail and the one every broadcast opens with. Lay it across the full width at the line.


## Research pass — verified, already covered

The **Pagoda** is modelled as the hero (correctly called out in the code as the Speedway's single most recognisable structure), along with the oval, the yard of bricks, the infield and the golf course. **Nothing added.**
