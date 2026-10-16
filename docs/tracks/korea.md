# Korea International Circuit — Visual Design Brief

**Setting:** DAY, modern theme (reclaimed tidal flats). 5.615 km, 18 turns,
anti-clockwise. Tilke; Yeongam, South Jeolla, near Mokpo. Capacity 135,000.
Korean Grand Prix 2010–2013; pit exit lengthened around T1 for 2013
([Wikipedia](https://en.wikipedia.org/wiki/Korea_International_Circuit)).

## 1. Setting

Tilke-designed on reclaimed land beside the Yeongam tidal flats. Intended as
part permanent, part temporary harbour-side course
([RacingCircuits.info](https://www.racingcircuits.info/asia/south-korea/korea-international-circuit.html);
Wikipedia). The planned hotels / restaurants / marina village never arrived —
the identity is EMPTINESS: wide grey asphalt run-off, salt-bleached fill,
blank unglazed apartment shells, seawall and open water
([NYT 2015](https://www.nytimes.com/2015/02/16/world/asia/a-korean-auto-racing-debacle-but-hope-around-the-bend.html)).

## 2. Atmosphere & palette

Flat coastal light, high haze, low contrast. Water on the horizon. Grass is
sparse and salt-bleached over reclaimed fill.

## 3. Elevation

Essentially flat. Reclaimed land — resist the urge to add relief. (SRTM
measures ~0 m of relief; `undulate:false` on the def.)

## 4. Landmarks & surroundings by lap position

Anti-clockwise: **-1 is the infield** (pit complex, unfinished marina towers)
and **+1 is the outfield** (seawall, open water). Do not carry over the sign
convention from clockwise circuits.

| s | Side | Distance | Box description |
|---|---|---|---|
| 0.005 | -1 | 12 | **`korea-pit-complex`** (required): F1-standard permanent pit/paddock on the harbour-side half (RacingCircuits.info). Pale fascia garage run, motorhome row, camera tower. |
| 0.020 | +1 | 22 | **`korea-main-grandstand`** (required): permanent covered steel stand facing the pit straight; sponsor hoarding; estuary `waterBand` behind. |
| 0.065 | +1 | 30 | Turn 1 exit: wide grey `runoffApron` (not gravel), `tyreWall` then `guardrail`, `marshalPost`. Pit exit lengthened around T1 in 2013 (Wikipedia). |
| 0.083 | -1 | 15 | Turn 1–2 infield: `marshalPost`, lone `billboard`, thin `bush` on salt-bleached fill. |
| 0.190 | +1 | 45 | Mid back straight — emptiest view: bleached `groundPatch`, distant mast, `waterBand`. No stands/trees/crowd. |
| 0.300 | +1 | 25 | Turn 3 braking: temporary `grandstandEx`, huge apron, tyre wall, camera tower. |
| 0.306 | -1 | 18 | Turn 3 hairpin infield: `broadcastCompound` + marshal on open fill. |
| 0.430 | -1 | 20 | Turns 4–6 infield scrub; unfinished shells first show as distant grey slabs. |
| 0.549 | +1 | 35 | Turn 7 seawall embankment + open water (hazy, no far shore). |
| 0.589 | -1 | 16 | Turn 8 small uncovered `grandstandEx` + hoarding. |
| 0.663 | -1 | 22 | **`korea-marina-shells`** (required): blank unglazed apartment shells — the marina/hotel village that never happened (RacingCircuits.info, Wikipedia, NYT). |
| 0.723 | +1 | 6 | Turns 11–12 stadium entry: tight armco + tyres. |
| 0.760 | -1 | 8 | Turn 14: tower blocks / `cityFront` close behind the barrier. |
| 0.797 | +1 | 10 | Turn 15: tyre wall + hoarding; water over the barrier. |
| 0.864 | -1 | 10 | Turn 17: wall moved back for pit-entry visibility (2011, Wikipedia). |
| 0.885 | +1 | 18 | **`korea-final-footbridge`** (required): Tilke pedestrian footbridge inspired by local architecture (RacingCircuits.info). |

## 5. Track features

- One of the longest full-throttle runs into a heavy braking zone at Turn 3.
- Tight walled stadium section through the back half.
- Anti-clockwise.

## 6. Modelling notes

- Half-built marina shells on the infield are the landmark. Blank, unlit, unfinished.
- Seawall and open water beyond the outfield.
- Wide grey asphalt run-off, not gravel.
- Deliberately NO tree line: bare fill reads correct.

## Sourced vs uncertain

**Sourced (built):**
- 5.615 km / 18 turns / Tilke / Yeongam near Mokpo / capacity 135,000 / F1 2010–13 / pit exit extended 2013 — Wikipedia.
- Part permanent / part temporary harbour-side intent; permanent F1 pit+paddock; marina/hotel village never delivered — RacingCircuits.info, Wikipedia, NYT.
- Final-turn footbridge with local-architecture styling — RacingCircuits.info.
- Turn 17 wall moved back 2011 for pit-entry visibility — Wikipedia.

**UNCERTAIN (not built as fact):**
- Named harbour hotels, yacht clubs, or specific tower brands — Wikipedia’s “hotels and yachts” phrasing describes the *planned* temporary section, not delivered buildings. Model only generic unfinished shells.
