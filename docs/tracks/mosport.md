# Mosport — Visual Design Brief

**Setting:** DAY, green theme (Ontario drumlin farmland). 3.948 km, 10 turns, clockwise.

## 1. Setting

450 acres of rolling Ontario farmland at Bowmanville, 75 km east of Toronto,
opened June 1961 and — uniquely among the circuits added this round — never
rebuilt. Eight World Championship Canadian Grands Prix between 1967 and 1977.
Mature mixed woodland on the outside of almost every corner, almost no run-off,
and a club-scale paddock. It should read closer to Donington than to Fuji:
fast, narrow, wooded, and old.

## 2. Atmosphere & palette

Bright North American summer green, warmer and more saturated than Donington's
overcast English green. Deciduous and conifer mixed, not a pine monoculture.
Dry sandy shoulders rather than kerbing everywhere.

## 3. Elevation

**This is the circuit.** 47 m of relief, and the shape matters more than the
number: the start line sits at the HIGHEST point of the lap, the track falls
continuously for the first 1.8 km to 45 m below the line just before Moss
Corner, then climbs without relief for the remaining 2.1 km back to the line.
"A tale of two tracks — an accelerated fast descent for the first 2 km followed
by an unceasing uphill endurance test back to the finish."

The steepest single pitch is the plunge into Clayton.

## 4. Landmarks & surroundings by lap position

Clockwise, so `+1` (right of the centreline) is the INFIELD — paddock and pit
block are on that side. `-1` is the outside, which is where the woodland lives.

**Fractions are MEASURED, not estimated.** OSM carries Mosport's corners as
individually named ways, so Clayton, Quebec, Moss, the Andretti Straight, the
Esses and Whites are projected onto this centreline rather than guessed
(docs/notes/MOSPORT-PLAN-2026-09-14.md §2).

| s | Side | Distance | Box description |
|---|---|---|---|
| 0.005 | +1 | 13 | Pit block: ONE long, low, flat-roofed garage run — club scale, no tower stack. A short `motorhome` row behind it, a `broadcastCompound`, and a `cameraTower` at the gantry line. Highest point of the lap. |
| 0.010 | -1 | 18 | Start/finish `grandstandEx`, modest steel, two shallow banks. `sponsorHoarding` along the debris fence, `gantry` over the line. |
| 0.0183 | -1 | 11 | **Turn One.** The straight turns into a rapid downhill charge: `guardrail` hard on the outside with `tyreWall` at the apex, `marshalPost`, and mature `forestEdge` tight behind the barrier so the corner reads as enclosed. |
| 0.0467 | +1 | 16 | Turn 1 infield — open mown grass falling away, a `ridge` running with the slope, a scatter of specimen `tree`. Keep it open: this is where the drop first shows. |
| 0.1483 | -1 | 10 | Approach to Clayton, the steepest pitch on the lap. `guardrail` and a continuous `forestEdge`; nothing built. A pedestrian `bridge` crosses here (real: footbridge at Turn 2). |
| 0.1817 | -1 | 14 | **Clayton Corner (T2)** — a dramatic plunging left, a 20 m drop through the corner. `tyreWall` on the outside, `spectatorHill` behind it in the trees, `marshalPost` at the apex. |
| 0.2800 | +1 | 18 | Between Clayton and Quebec: woodland both sides, a small `spectatorHill` on the inside, `guardrail` continuous. Dark and enclosed. |
| 0.3117 | -1 | 12 | **Quebec Corner (T3).** `guardrail` then `tyreWall`, `marshalPost`, `forestEdge` hard behind. A single `billboard` on the exit fence. |
| 0.4200 | -1 | 22 | The run down to Moss, still falling. Continuous `forestEdge`, sandy shoulder `groundPatch`, one `marshalPost`. The lowest, most enclosed part of the lap. |
| 0.4817 | +1 | 15 | **Moss Corner (T5a/5b)** — the double-apex left Stirling Moss asked for when he saw the original single hairpin. `tyreWall` on both apexes, `spectatorHill` on the inside with a crowd, `marshalPost` between the two apexes. The signature corner. |
| 0.5400 | -1 | 20 | Moss exit onto the back straight: `guardrail`, a low `ridge` carrying the ground up, `forestEdge` set back as the trees open out. The climb starts here. |
| 0.6600 | -1 | 26 | **Mario Andretti Straightaway** — the fastest part of the lap, climbing. Trees set back on both sides, `sponsorHoarding` on the fence, two `billboard`. The one place the sky opens. |
| 0.7400 | +1 | 30 | Back-straight infield: farmland. Mown grass, a `hedge` field boundary, isolated `tree`, a shallow `ridge`. Rural and empty. |
| 0.8017 | -1 | 12 | **Turn 8**, entry to the Esses. `tyreWall` at the apex, `marshalPost`, `forestEdge` tight. A pedestrian `bridge` crosses near here (real: footbridge at Turn 7). |
| 0.8817 | -1 | 10 | **The Esses** — a downhill flick with the woods closed right in. `guardrail` both sides, `tyreWall` on the blind apex, nothing built. The most claustrophobic stretch. |
| 0.9183 | +1 | 16 | **Whites Corner (T10)**, the last corner onto the pit straight, still climbing. `tyreWall` inside, `grandstandEx` and `sponsorHoarding` on the exit, `marshalPost` at the apex. A spectator TUNNEL passes under the track here. |
| 0.9600 | +1 | 34 | The **Event Centre** — the site's one substantial public building. A long, low, flat-roofed hall set back inside the loop with a visitor `groundPatch` apron and a `hedge` screening it from the track. |

## 5. Track features

- The 47 m fall-and-climb: the whole first half descends, the whole second half climbs.
- Moss Corner, the double-apex left, named for the driver who redesigned it.
- Almost no run-off anywhere — armco and trees are the edge of the world.
- Blind, fast corners: the reason F1 left after 1977.

## 6. Modelling notes

- Woodland is MIXED — broadleaf and conifer together, not a pine wall.
- Keep the infield open where the drop shows (Turn 1, the run to Moss); the
  enclosure belongs on the OUTSIDE of the corners.
- Buildings are few and small. One pit block, one Event Centre, two modest
  stands. Nothing else is built.
- The paddock is club scale. Do not dress this as a Grand Prix facility.

## 7. Reference

Wikipedia (Canadian Tire Motorsport Park), racingcircuits.info, the circuit's
own Grand Prix track page, and OpenStreetMap's named corner ways. Provenance and
the measured corner fractions: `docs/notes/MOSPORT-PLAN-2026-09-14.md`.

## 8. Status

Geometry, elevation, turns and start line all measured and shipped.
Scenery: PLACEHOLDER until this table is built.
