# Mosport — Visual Design Brief

**Setting:** DAY, green theme (Ontario drumlin farmland). 3.948 km, 10 turns, clockwise.

## 1. Setting

450 acres of rolling Ontario farmland at Bowmanville, ~75 km east of Toronto,
opened June 1961 and — uniquely among many historic venues — never rebuilt as a
Tilke redesign. Eight World Championship Canadian Grands Prix between 1967 and
1977. Mature mixed woodland on the outside of almost every corner, almost no
run-off, and a club-scale paddock. It should read closer to Donington than to
Fuji: fast, narrow, wooded, and old.

## 2. Atmosphere & palette

Bright North American summer green, warmer and more saturated than Donington's
overcast English green. Deciduous and conifer mixed, not a pine monoculture.
Dry sandy shoulders rather than kerbing everywhere.

## 3. Elevation

**This is the circuit.** ~47 m of relief, and the shape matters more than the
number: the start line sits at the HIGHEST point of the lap, the track falls
continuously for the first ~1.8 km to ~45 m below the line just before Moss
Corner, then climbs without relief for the remaining ~2.1 km back to the line.
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
| 0.005 | +1 | 13 | Pit block: `modelGroup("mosport-pit-garages")` — ONE long, low, flat-roofed garage run, club scale, no tower stack. `broadcastCompound`, `cameraTower` at the gantry line (motorhome row omitted — verge bury). Highest point of the lap. |
| 0.010 | -1 | 18 | Start/finish `grandstandEx`, modest steel, two shallow banks. `sponsorHoarding` along the debris fence, `gantry` over the line. |
| 0.0183 | -1 | 11 | **Turn One.** The straight turns into a rapid downhill charge: `guardrail` hard on the outside with `tyreWall` at the apex, `marshalPost`, and mature `forestEdge` tight behind the barrier so the corner reads as enclosed. |
| 0.0467 | +1 | 16 | Turn 1 infield — open mown grass falling away, a `ridge` running with the slope, a scatter of specimen `tree`. Keep it open: this is where the drop first shows. |
| 0.1483 | -1 | 10 | Approach to Clayton, the steepest pitch on the lap. `guardrail` and a continuous `forestEdge`; nothing built. A pedestrian `bridge` crosses here (real: footbridge at Turn 2). |
| 0.1817 | -1 | 14 | **Clayton Corner (T2)** — a dramatic plunging left. `tyreWall` on the outside, `spectatorHill` set back behind it in the trees, `marshalPost` at the apex. |
| 0.2800 | +1 | 18 | Between Clayton and Quebec: woodland both sides, a small `spectatorHill` on the inside, `guardrail` continuous. Dark and enclosed. |
| 0.3117 | -1 | 12 | **Quebec Corner (T3).** `guardrail` then `tyreWall`, `marshalPost`, `forestEdge` hard behind. A single `billboard` on the exit fence. |
| 0.4200 | -1 | 22 | The run down to Moss, still falling. Continuous `forestEdge`, sandy shoulder `groundPatch`, one `marshalPost`. The lowest, most enclosed part of the lap. |
| 0.4817 | +1 | 15 | **Moss Corner (T5a/5b)** — `modelGroup("mosport-moss-corner-bank")` positive-rake seat tiers on the inside; `tyreWall` on both apexes. Signature corner (Stirling Moss redesign of the original hairpin). |
| 0.5400 | -1 | 20 | Moss exit onto the back straight: `guardrail`, a low `ridge` carrying the ground up, `forestEdge` set back as the trees open out. The climb starts here. |
| 0.6600 | -1 | 26 | **Mario Andretti Straightaway** — the fastest part of the lap, climbing. Trees set back on both sides, `sponsorHoarding` on the fence, two `billboard`. The one place the sky opens. |
| 0.7400 | +1 | 30 | Back-straight infield: farmland. Mown grass, a `hedge` field boundary, isolated `tree`, a shallow `ridge`. Rural and empty. |
| 0.8017 | -1 | 12 | **Turn 8**, entry to the Esses. `tyreWall` at the apex, `marshalPost`, `forestEdge` tight. A pedestrian `bridge` crosses near here (real: footbridge at Turn 7). |
| 0.8817 | -1 | 10 | **The Esses** — a downhill flick with the woods closed right in. `guardrail` both sides, `tyreWall` on the blind apex, nothing built. The most claustrophobic stretch. |
| 0.9183 | +1 | 16 | **Whites Corner (T10)** — `modelGroup("mosport-whites-tunnel")` spectator underpass portals; exit `grandstandEx` and `sponsorHoarding`; `marshalPost` at the apex. |
| 0.9600 | +1 | 34 | **Event Centre** — `modelGroup("mosport-event-centre")`: Grand Prix Track Event Centre (~23k sq ft, rooftop overlooking the track). Visitor apron + hedge screen. |

### Required landmark ids (wave 6)

- `mosport-pit-garages`
- `mosport-moss-corner-bank`
- `mosport-whites-tunnel`
- `mosport-event-centre`

### Sourced vs uncertain

**Sourced (built):**

- Moss Corner = Turns 5A/5B double-apex complex named for Stirling Moss
  ([Wikipedia](https://en.wikipedia.org/wiki/Canadian_Tire_Motorsport_Park),
  [IMSA](https://www.imsa.com/news/2022/06/30/moss-corner-can-create-most-chaos-at-ctmp/)).
- Mario Andretti Straightaway between Moss and Turn 8 (IMSA / canadianracer).
- Clayton Corner (T2), Quebec Corner (T3), Whites Corner (T10) — CTMP merchandise
  corner names + canadianracer track database.
- Grand Prix Event Centre with rooftop views
  ([CTMP facilities](https://canadiantiremotorsportpark.com/pages/facilities);
  canadianracer: built 2013 outside turn 10 / front straight).
- Pedestrian bridges / Whites tunnel noted in the circuit brief and Wikipedia turn list.

**UNCERTAIN / not built as fact:**

- Turn numbering labels: some club maps call Moss "Turn 2" or "Turn 5" alone —
  this repo follows `def.turns` (Moss = T5a/5b at frac ~0.4817).
- Mosport Speedway (0.5 mi oval, two 8,500-seat stands at the NW corner) is
  **outside** the road course and was closed / redeveloped — do **not** dress
  it as an active oval landmark on the GP circuit
  ([Wikipedia](https://en.wikipedia.org/wiki/Canadian_Tire_Motorsport_Park)).
- Exact portal dimensions / underpass alignment at Whites — portals are
  representative headwalls, not surveyed FIA drawings.

## 5. Track features

- The ~47 m fall-and-climb: the whole first half descends, the whole second half climbs.
- Moss Corner, the double-apex complex, named for the driver who redesigned it.
- Almost no run-off anywhere — armco and trees are the edge of the world.
- Blind, fast corners: the reason F1 left after 1977.

## 6. Modelling notes

- Woodland is MIXED — broadleaf and conifer together, not a pine wall.
- Keep the infield open where the drop shows (Turn 1, the run to Moss); the
  enclosure belongs on the OUTSIDE of the corners.
- Buildings are few and small. One pit block, one Event Centre, two modest
  stands. Nothing else is built.
- The paddock is club scale. Do not dress this as a Grand Prix facility.
- Keep real hills; no knife-edge elevation jolts. Do not flatten terrain to seat props.

## 7. Reference

- [Canadian Tire Motorsport Park (Wikipedia)](https://en.wikipedia.org/wiki/Canadian_Tire_Motorsport_Park)
- [CTMP facilities](https://canadiantiremotorsportpark.com/pages/facilities)
- [IMSA — Moss Corner](https://www.imsa.com/news/2022/06/30/moss-corner-can-create-most-chaos-at-ctmp/)
- [canadianracer Mosport database](https://www.canadianracer.com/track-detail.php?trackid=mosport-r&view=history)
- [tracklife.ca overview](https://www.tracklife.ca/tracks-in-canada/canadian-tire-motorsports-park-mosport/)
- Provenance and measured corner fractions: `docs/notes/MOSPORT-PLAN-2026-09-14.md`.

## 8. Status

Geometry, elevation, turns and start line all measured and shipped.
Scenery: wave-6 landmarks + clip/ground cleanup (2026-09). `startFrac` /
`sceneryStartFrac` frame keys left untouched.
