# Fuji Speedway — Visual Design Brief

**Setting:** DAY, green theme (conifer plateau under a volcano). ~4.55 km, 16 turns, clockwise.

## 1. Setting

A conifer plateau on the eastern foothills of Mount Fuji, 580 m up. Two things identify it and nothing else needs to: the 1.475 km pit straight, the longest in this roster, and the mountain itself — a snow-capped cone due west that dominates every frame looking back down the straight. The paddock is low, dark and modern; the outfield is dense Japanese cedar.

## 2. Atmosphere & palette

Cool, high-altitude light. Cedar foliage is dark and blue-shifted, not the warm green of a European park. Keep the horizon pale and slightly hazy so the mountain reads as distant.

## 3. Elevation

The racing surface spans 545–585 m above sea level. The steepest descent comes just after braking for TGR (Turn 1). The course rises slightly after ADVAN, descends to its low point at Dunlop, then climbs through the technical final sector. Fuji Speedway gives maximum gradients of 10.05% downhill and 8.88% uphill. [Circuit guide](https://www.fsw.tv/guide/facility/racing.html) · [Operator’s course introduction](https://www.youtube.com/watch?v=cJsmZZnSnWk)

The game uses 64 elevation posts fitted to Japan’s 1 m laser DEM along the built alignment. At ADVAN the signed crossfall across 8 m is about +0.5 m. The fitted road spans 37.13 m with peak grades of −9.38% and +8.70%. [GSI left sample](https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=138.9281195&lat=35.3705699&outtype=JSON) · [GSI right sample](https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=138.9281055&lat=35.3706409&outtype=JSON)

## 4. Landmarks & surroundings by lap position

Clockwise, so the infield is the `+1` side and the pit lane is on it. The first
quarter of the lap is the 1.475 km main straight — `turns[0]` is at `0.2502` —
so s 0.00-0.25 is one continuous built frontage and everything else is
compressed into the back three quarters. Official corner list (2005-present):
TGR (27R), 75R, Coca-Cola (80R), Toyopet (100R), Advan (30R), 120R, 300R,
Dunlop (15R), 30R, 45R, GR Supra (25R), Panasonic (12R).

**Mount Fuji is WEST of the circuit** — Wikipedia places the track in the
"eastern foothills" — and it is the identifying object of the whole place.
Treat it as a single large low-frequency snow-capped cone on the skyline, not a
ridge line, and remember it is hidden by cloud as often as not.

| s | Side | Distance | Box description |
|---|---|---|---|
| 0.005 | +1 | 12 | Pit garages and the modern control tower, a long continuous dark-clad block running most of the straight. |
| 0.005 | -1 | 20 | Main grandstand, the biggest structure at the circuit — capacity here is 110,000, so this reads as a wall of seating, not a stand. |
| 0.060 | -1 | 26 | Grandstand run continues; start gantry and big screens over the straight. |
| 0.120 | — | 900 | **Mount Fuji** on the western skyline, dominating the view back down the straight. Required `modelGroup("fuji-mount-fuji")` — one snow-capped cone, very large and very distant (bearing 266.1°, compressed to ~9.4 km so fog still reads it). |
| 0.150 | +1 | 40 | Paddock and team structures behind the pits, then the **Fuji Speedway Hotel** (Hyatt Unbound Collection; opened 2022-10-07) on the west side beyond the West Gate. The Fuji Motorsports Museum occupies hotel floors 1–2 — not a separate building. |
| 0.230 | -1 | 18 | First-corner grandstand overlooking the braking zone at the end of the straight — the prime overtaking spot and the most-photographed corner after the mountain. |
| 0.250 | -1 | 14 | TGR Corner (27R): wide tarmac run-off, then a low bank and the first cedar rank beyond. |
| 0.282 | 1 | 16 | 75R, dropping away from the stands; cedar closes in on the outside. |
| 0.372 | -1 | 20 | Coca-Cola Corner (80R): sponsor hoarding run and a small spectator terrace. |
| 0.412 | 1 | 24 | Toyopet (100R) — the circuit is fully into the conifer plateau here, dense sugi cedar both sides. |
| 0.470 | -1 | 22 | Advan Corner (30R): tight right, gravel on the outside, cedar behind it. |
| 0.525 | 1 | 30 | 120R sweeping through the trees, the forest at its densest. |
| 0.707 | -1 | 28 | 300R — long fast right; the trees pull back for run-off and the mountain reappears over the treeline on the western side. |
| 0.739 | 1 | 12 | Dunlop Corner (15R): tight hairpin with a marshal post and tyre wall, the slowest point of the lap. |
| 0.808 | -1 | 18 | The 30R/45R flick, tree-lined and enclosed. |
| 0.877 | +1 | 16 | GR Supra Corner (25R): the lap turns back toward the paddock; infield structures come back into view. |
| 0.897 | -1 | 14 | Panasonic Corner (12R), the final slow right onto the straight — grandstand seating resumes on the outside. |
| 0.960 | +1 | 15 | Pit exit and the end of the garage block, closing the loop back onto the straight. |

## 5. Track features

- The pit straight is the feature. Give it length and nothing to break the eye.
- Turn 1 is a long, slow right at the end of it.
- The sector-2 esses are tight and tree-lined.
- 100R and the Netz corner close the lap with a hairpin.

## Turn numbering (#5652 survey, 2026-11-25)

`turns[]` follows the 16-turn WEC/sim-guide numbering: T1 TGR, T2 right kink, T3 Coca-Cola, T4–T5 the 100R double apex, T6 ADVAN hairpin, T7 its left exit, T8 120R, T9 300R, T10–T12 the Dunlop chicane, T13 the off-camber right (30R), T14 the long left (45R), T15 the tight left (GR Supra, 25R) and T16 Panasonic. The built radii match the operator's radius names: Dunlop 15R is built at R15, GR Supra 25R at R21 and 30R at R37. The older list counted 100R three times, skipped 120R and 300R, and put a spare T13 on the 45R exit. Sources: [RaceControl LMU track guide](https://news.racecontrol.gg/tracks/le-mans-ultimate-fuji-speedway-track-guide/), [Fuji Speedway course guide](https://www.fsw.tv/guide/facility/racing.html), [Wikipedia corner list](https://en.wikipedia.org/wiki/Fuji_Speedway).

## 6. Modelling notes

- Mount Fuji is the single most identifying object. It belongs on the WESTERN skyline as a large, low-frequency cone, snow-capped, never a generic ridge. Bearing 266.1 deg at 18.2 km, measured from the circuit (35.3714 N 138.9267 E) to the summit (35.3581 N 138.7311 E) — this brief said "north" for months and the scenery placed the cone at 321 deg to match. Registered as `fuji-mount-fuji` (`tests/data/landmarks/fuji.json`).
- Cedar (sugi) is the tree: tall, narrow, dark. Plant in dense ranks, not scattered.
- The grandstands along the pit straight are modern, dark-clad and continuous.
- **Fuji Speedway Hotel** (`fuji-speedway-hotel` required modelGroup): mid-rise curved block west of the paddock. Sourced 9 floors above ground + basement (Toyota Fudosan / Fujitec / Hyatt), museum inside floors 1–2. Approximate footprint — exact hotel height/footprint not pinned to a surveyed CAD box; do not invent a Hilton (none on site). Sources: https://global.toyota/en/newsroom/corporate/37094898.html ; https://newsroom.hyatt.com/news-releases?item=124297 ; https://www.toyotafudosan.com/new2024/wp-content/uploads/2024/06/10ec98e489446127b278fb35e7e173e7-1.pdf ; https://en.wikipedia.org/wiki/Fuji_Motorsports_Museum
- Circuit length: Wikipedia 4.563 km; game `lengthKm` 4.554 (small authored delta — do not change frame keys).
