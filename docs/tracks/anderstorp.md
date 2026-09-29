# Scandinavian Raceway — Visual Design Brief

**Setting:** DAY, green theme (Småland pine and an airfield). ~4.02 km, 8 turns, clockwise.

## 1. Setting

Built around a working airfield in the Småland pine forest (marshland, 1968). The long back straight **is** the Flight Straight runway — ICAO ESMP, ~1,000 × 20 m, directions 04/22, still open for light aircraft with PPR. Sole Nordic venue to host a Formula One World Championship GP (Swedish GP 1973–78). Flat, fast and strange, with dense pine right up to the edge everywhere except the runway corridor.

Sources: [Wikipedia — Anderstorp Raceway](https://en.wikipedia.org/wiki/Scandinavian_Raceway), [RacingCircuits.info](https://www.racingcircuits.info/europe/sweden/anderstorp.html), [official airfield page](https://www.scandinavianraceway.se/en/anderstorp-airfield/), [Jönköpings läns museum Byggnadsvårdsrapport 2017:10](https://jonkopingslansmuseum.se/wp-content/uploads/2017/12/2017-10-1.pdf).

## 2. Atmosphere & palette

Northern light: cool, blue-shifted, long shadows even at midday. Pine is dark and desaturated. Sand run-off is pale grey, not golden. Falu red (`faluröd`) on timber sheds; dull silver-grey corrugated hangars.

## 3. Elevation

Flat. This is among the flattest circuits in the roster — do not add relief or knife-edge terrain steps.

## 4. Landmarks & surroundings by lap position

| s | Side | Distance | Box description |
|---|---|---|---|
| 0.005 | +1 | 14–56 | Start/finish. Timber `grandstandEx` banks on the infield; a required concrete **pressläktare** (`anderstorp-press-stand`) behind them; original **speakertorn** (`anderstorp-speaker-tower`); 1968 **stationsbyggnad** (`anderstorp-stations-1968`, lockpanel timber clubhouse). Race control / timing / pit-garage rank behind. |
| 0.020 | -1 | 6 | Outside of the pit straight: armco, then pine colonnade, weathered hoarding. |
| 0.045 | -1 | 22 | **Turn 1.** Pale grey sand run-off, tyre wall, marshal hut, camera tower. |
| 0.095 | +1 | 28 | Infield paddock — corrugated shed ranks on grey hardstanding (working site). |
| 0.150 | -1 | 5 | Pine right up to the armco. |
| 0.185 | +1 | 26 | **Turns 2–3, Södra Kurvan.** Mown infield, low public-side sheds / billboards. |
| 0.245 | -1 | 9 | Back into the trees: flag/timing hut. |
| 0.330 | -1 | 20 | **Turn 4, Opel Kurvan.** Sponsor hoarding, tyre wall, grey sand, camera tower. |
| 0.400 | +1 | 32 | Infield scrub between the loops — sightlines open toward the hangars. |
| 0.480 | -1 | 18 | **Turn 5.** Long constant-radius corner, slightly banked. |
| 0.556 | +1 | 30 | **Turn 6 — onto the runway.** Corridor opens; aged concrete apron; runway edge / threshold / touchdown paint (seated, not sunk). |
| 0.640 | +1 | 52 | Airfield apron: required **flight hangars** (`anderstorp-flight-hangars`), flying club, parked light aircraft, taxi stubs. |
| 0.740 | -1 | 55 | Runway far side: mown grass to a distant treeline, falu barn, windsocks. |
| 0.820 | +1 | 35 | End of the apron: smaller corrugated shed, concrete gives way to grass. |
| 0.860 | -1 | 16 | **Turn 7 — off the runway.** Corridor narrows, pine closes in. |
| 0.920 | -1 | 24 | **Turn 8 / Norra approach.** Long banked sweep onto the pit straight; timber terracing outside. |

### Required landmark ids (wave 6)

- `anderstorp-press-stand` — concrete pressläktare (museum 2017:10).
- `anderstorp-speaker-tower` — original speakertorn by the stands (museum 2017:10).
- `anderstorp-stations-1968` — 1968 stationsbyggnad / clubhouse (museum 2017:10).
- `anderstorp-flight-hangars` — classic corrugated hangars on Flight Straight (museum hangar form; Wikipedia / official ESMP airfield).

### UNCERTAIN / not built as fact

- **Historical F1 pit lane halfway round the lap** (Wikipedia, RacingCircuits.info): true for 1970s GPs, when the S/F straight was too short for pits. The game def uses `startFrac: 0` with the working paddock / modern pit-garage rank on this straight (consistent with the post-1991 / 2006 permanent pit building on the pit straight). Do **not** relocate pits to mid-lap without a frame-key change. Flagged here; not authored as halfway pits.

## 5. Track features

- The runway back straight, noticeably wider than the rest of the lap.
- A long final corner onto the pit straight.
- Dense pine everywhere else; airfield identity = open corridor on Flight Straight.

## 6. Modelling notes

- The width change at the runway is the identifying feature. Make it visible.
- Scots pine in dense ranks — tall bare trunks, canopy only at the top — but keep the infield paddock / S-F complex clear of the near rank so landmarks are not grown through.
- Low wooden and corrugated buildings, nothing grand.
- Runway paint must use seated boxes (`seatBox`), never thin `place()` slabs (0.8 m sink buries them).
