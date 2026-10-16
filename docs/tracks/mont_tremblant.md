# Circuit Mont-Tremblant — Visual Design Brief

**Setting:** DAY, green theme (Laurentian forest). ~4.25 km, 15 turns, clockwise.

## 1. Setting

Cut through Laurentian forest in Quebec, at the foot of the ski mountain that names it. Two Canadian Grands Prix, 1968 and 1970, then dropped as too dangerous — hard elevation change, blind crests, and essentially no run-off between the tarmac and the trees. Beautiful and unforgiving.

Sources: [Wikipedia — Circuit Mont-Tremblant](https://en.wikipedia.org/wiki/Circuit_Mont-Tremblant); [RacingCircuits.info](https://www.racingcircuits.info/north-america/canada/mont-tremblant.html).

## 2. Atmosphere & palette

Northern hardwood and conifer mix. In the autumn light this place is famous for, the hardwoods turn — but keep the default a deep summer green and let the lighting presets do the season.

## 3. Elevation

Severe. The lap climbs and drops repeatedly with blind crests at the top of several rises. This is the defining quality. The Hump on the back straight is the famous airborne crest (lowered in the 2000s redevelopment; we keep the character of the historic layout).

## 4. Landmarks & surroundings by lap position

Lap runs CLOCKWISE, so `+1` (right of the centreline) is the infield: pits,
paddock, Bridge abutment, the inside of the Carousel. `-1` is the outfield, and
the outfield is almost always forest at arm's length.

| s | Side | Distance | Box description |
|---|---|---|---|
| 0.005 | +1 | 14 | Infield pit straight: one long low `building` for the garages and timing, two `motorhome`s parked behind the apron, control tower (`tremblant-control-tower`) facing toward Namerow, a single `cameraTower` near the pit exit. Club-scale — a modest paddock, not a modern F1 complex. |
| 0.020 | -1 | 12 | Outside the start line: open-top `grandstandEx` (positive rake; replaced the hollow/reversed 110 m shell), `guardrail` hard in front of it, and forest closing again the moment the stand ends. |
| 0.090 | -1 | 4 | Climb toward Turn 1. `guardrail` right against the tarmac with `pine` ranks starting 4 m behind it — no run-off, nothing between a mistake and the trunks. Repeat this pairing as the default everywhere the table does not say otherwise. |
| 0.150 | +1 | 90 | Skyline, not roadside: the `mountain` mass of the ski hill that names the circuit, with a lower wooded `ridge` stepped in front of it. Visible over the crest before Turn 1 and again off the back straight. Keep the hillside deep summer green in the def — the lighting presets carry autumn. |
| 0.181 | +1 | 5 | Turn 1, apex on the crest. `marshalPost` and a short `tyreWall` on the inside; keep any `billboard` low so the blind downhill exit is not given away from the approach. |
| 0.205 | -1 | 3 | The plunge into the cutting and the esses (T2–T3). Earth banks either side with `tree` crowns leaning in over the `guardrail` — the tightest enclosure on the lap, and it should read as a tunnel of green. |
| 0.255 | +1 | 6 | Esses exit: `groundPatch` of dirt and gravel spill on the inside where cars run wide, `marshalPost`, then mixed `pine` and `tree` ranks straight back to the rail. |
| 0.330 | -1 | 5 | Fast downhill sweep. Nothing built at all — unbroken `forestEdge` behind continuous `guardrail`, with `marshalPost`s the only man-made punctuation for several hundred metres. |
| 0.412 | +1 | 6 | T4, inside: `guardrail` plus `tyreWall` on the apex, and a small natural `spectatorHill` bank a little further in where spectators stand. Forest resumes immediately behind the hill. |
| 0.456 | -1 | 4 | T5 outside: armco with hardwood `tree` ranks 4 m beyond it. No gravel trap, no tarmac apron — the trees are the run-off. |
| 0.503 | +1 | 12 | The Carousel, the long 180 onto the back straight. `marshalPost` and a `cameraTower` on the inside with a `billboard` pair; the outside is a solid wall of `pine` following the whole arc. |
| 0.560 | -1 | 22 | Back straight over The Hump. Trees pull back a touch here — the one place the lap breathes — so a low ridge, the mountain, and the `tremblant-hump-crest` cabin show above the treeline before the forest closes in again. |
| 0.626 | +1 | 6 | The 90-degree bends climbing back up the hillside (T8–T9): `guardrail`, `marshalPost`, `tyreWall` on the inside of the tighter one, `pine` packed behind both rails. |
| 0.776 | +1 | 6 | The Bridge (`tremblant-bridge`). A service crossing over the track — abutments either side of the rail with `forestEdge` running up to both. It should frame the road and briefly darken it. |
| 0.836 | -1 | 6 | Namerow (`tremblant-namerow-bank`), the uphill hairpin. `tyreWall` and `marshalPost` on the outside, a `spectatorHill` on the natural bank above it, `tree` ranks over the top of the bank. |
| 0.897 | +1 | 10 | Paddock Bend (`tremblant-paddock-bend-stand`), the final sweep onto the pit straight. Paddock-side: `grandstandEx` + required fascia, a `motorhome` or two behind the fence, `billboard` on the exit. Outfield stays forest right to the line. |

## 5. Track features

- **Namerow** — uphill hairpin (Turn 14), named for Norm Namerow; slowest point on the lap, then dive downhill into Paddock Bend. ([RacingCircuits.info](https://www.racingcircuits.info/north-america/canada/mont-tremblant.html); [CMHF — Norm Namerow](https://cmhf.ca/norm-namerow/); [Speedtherapy track notes](https://www.speedtherapy.com/wp-content/uploads/Docs/Circuit_Mont_Tremblant_Track_Information.pdf)).
- **The Hump** — crest on the back-straight midpoint; cars went light / airborne in the Can-Am era ([RacingCircuits.info](https://www.racingcircuits.info/north-america/canada/mont-tremblant.html); Wikicars / Can-Am 1966 lore).
- **Paddock Bend** — Turn 15, final sweep onto the pit straight ([Speedtherapy](https://www.speedtherapy.com/wp-content/uploads/Docs/Circuit_Mont_Tremblant_Track_Information.pdf)).
- Blind crests where the exit is invisible on entry.
- Trees close on both sides for most of the lap.

## 6. Modelling notes

- Enclosure is the identity: forest right up to the edge, with only armco between.
- The ski mountain belongs on the skyline.
- Minimal built structure — a small paddock, control tower, bridge, and little else.
- Natural banks over roofed grandstands wherever the terrain already seats the crowd.

## 7. Uncertain / do not build as fact

- **Devil's Elbow / Casino / Le Nordique** are Circuit Gilles Villeneuve (Montreal) names — do **not** use here.
- Exact historic vs post-2002 Hump height: the real crest was lowered ~3.5 m in the Stroll/Wilson redevelopment; this dress keeps the airborne *character* of the F1-era layout without claiming a surveyed elevation.
- Frame debt: `startFrac` 0.6465 with residual `_sceneryShift` ≈ 0.28. Paddock / start-line props use `sl()` so they follow the racing line; Hump / Bridge / Namerow / Paddock Bend stay on authored fracs (corner-locked). Do not retune `sceneryStartFrac` without a full re-probe.
