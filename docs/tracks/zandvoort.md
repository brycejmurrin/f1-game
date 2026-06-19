# Circuit Zandvoort — Visual Design Brief

**Setting:** DAY, green theme (coastal dunes). ~4.26 km, 14 turns, clockwise. Two **banked** corners.

## 1. Setting
Threaded directly through the North Sea coastal dunes of the Netherlands, just a few metres from the beach at Zandvoort. Sandy, wind-blown terrain of rolling dune ridges capped with marram grass. Open sky, salt haze, and constantly shifting wind/sand conditions.

## 2. Atmosphere & palette
Bright, breezy seaside daylight with a soft sea haze on the horizon. Pale sandy ground, tan-and-green dune grass, and a fanatic orange crowd presence (Verstappen fans).
- Sky/sea haze: `[0.70, 0.80, 0.85]` (pale coastal blue-grey)
- North Sea blue: `[0.20, 0.42, 0.58]`
- Dune sand: `[0.80, 0.74, 0.56]`; marram grass: tan `[0.66, 0.62, 0.40]`, green `[0.34, 0.50, 0.26]`
- Tarmac: `[0.27, 0.28, 0.30]`; gravel traps: `[0.62, 0.55, 0.42]`
- Kerbs: red `[0.80, 0.14, 0.14]` / white `[0.90, 0.90, 0.90]`
- Crowd orange: `[0.95, 0.45, 0.05]`

## 3. Elevation
Continuous dune undulation — short rises and dips throughout, plus two heavily banked corners.
- s≈0.00–0.06: flat pit straight into Tarzan hairpin.
- s≈0.12–0.18: **Hugenholtz** (T3) — bowl-shaped banked left, ~18°, slingshots up over a dune crest.
- s≈0.20–0.55: rolling dune ridges (Hunserug, Scheivlak) — fast up-and-over undulations.
- s≈0.90–1.00: **Arie Luyendyk** (T14) — banked right, up to ~32% grade, feeding the pit straight.

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box description |
|------|------|----------|-----------------|
| 0.00 | L | near | Pit building: long low white-grey box, repeated garage bays |
| 0.00 | R | mid | Main grandstand: tall tiered slab box, dense orange crowd-tint top rows |
| 0.04 | R | near | Tarzan hairpin grandstand: steep stack of orange seat-boxes wrapping the turn |
| 0.06 | both | far | Sand dunes: low rolling tan/green box ridges hemming the track |
| 0.14 | L | near | Hugenholtz banked bowl: tilted curved kerb-boxes, orange grandstand behind |
| 0.20 | R | far | Wind turbines: tall thin white pole-boxes with three-blade caps on the dune horizon |
| 0.35 | both | mid | Dune ridges: undulating tan box humps, grass-green caps |
| 0.45 | L | far | North Sea horizon: flat blue band box low behind the dunes, haze-faded |
| 0.50 | R | far | Beach huts: tiny low pastel box row at the dune base near the shore |
| 0.65 | both | mid | Scheivlak run-off: pale gravel-trap box apron, marshal pole-boxes |
| 0.92 | R | near | Arie Luyendyk banked corner: steeply tilted curved box wall, kerb stripe |
| 0.96 | L | mid | Pit-straight grandstand: tiered grey box, orange crowd-tint |

## 5. Track features
- Two steep **banked corners** — Hugenholtz (~18°) and Arie Luyendyk (up to ~32% / 18°): tilt the corner box geometry hard.
- Near-constant dune undulation — the track rises and falls over sandy ridges, never long-flat.
- Tan gravel traps instead of asphalt run-off at most corner exits.
- Bold red/white kerbs, exaggerated and tilted on the banked turns.

## 6. Modelling notes
- Bank the two named corners visibly: rotate/raise the kerb and edge boxes so the camera reads the tilt.
- Surround everything with low rolling tan-and-green dune boxes — sand should dominate the ground plane.
- Drop a flat blue North Sea band on one far horizon, softened by pale sea haze; fade distant boxes early.
- Tint grandstand top rows orange to evoke the Dutch crowd; concentrate stands at Tarzan, the bankings, and pit straight.
- Scatter tall thin wind-turbine pole-boxes and a few tiny beach-hut boxes on the seaward horizon for coastal flavour.
- Keep undulation alive: vary box heights along the ground so no stretch reads dead flat.
