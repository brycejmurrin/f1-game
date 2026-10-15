# Okayama — circuit survey (2026-10-14)

Pacific GP / TI Circuit Aida. **3.70 km**, 11 turns, **green** theme, `baseHW` 7.
Clockwise; **+1 = infield**.

**Evidence:** `verify-track`, `audit-circuit`, agent `survey`. Captures: GLX
`shot.mjs --backend webgl2` (`APEX_GL=llvmpipe`). **33** committed JPEGs in
`artifacts/shots/tracks/okayama/` (q≈80, ≤1280 px wide). Weather variants on
anchors still **dry** only until shared `weather()` batch lands.

## Code map

| Piece | Path |
|--------|------|
| Layout + palette | `js/circuits/okayama.js` |
| Scenery | `js/circuits/scenery/okayama.js` |
| Brief | `docs/tracks/okayama.md` |
| Landmarks | `tests/data/landmarks/okayama.json` |

## Sector 1 — start/finish (s &lt; 0.371)

| | | |
|:---:|:---:|:---:|
| ![Track select](../../../artifacts/shots/tracks/okayama/00-track-picker-still.jpg) | ![Pit chase day](../../../artifacts/shots/tracks/okayama/s1-pit-chase__day-dry.jpg) | ![Pit orbit day](../../../artifacts/shots/tracks/okayama/s1-pit-orbit__day-dry.jpg) |
| Track select · day · dry | Pit chase · day · dry | Pit orbit · day · dry |
| ![Pit orbit dusk](../../../artifacts/shots/tracks/okayama/s1-pit-orbit__dusk-dry.jpg) | ![Pit orbit dawn](../../../artifacts/shots/tracks/okayama/s1-pit-orbit__dawn-dry.jpg) | ![Pit orbit night](../../../artifacts/shots/tracks/okayama/s1-pit-orbit__night-dry.jpg) |
| Pit orbit · dusk · dry | Pit orbit · dawn · dry | Pit orbit · night · dry |
| ![Pit chase dusk](../../../artifacts/shots/tracks/okayama/s1-pit-chase__dusk-dry.jpg) | ![Paddock orbit](../../../artifacts/shots/tracks/okayama/s1-paddock-orbit__day-dry.jpg) | ![Main stand](../../../artifacts/shots/tracks/okayama/s1-stand-ts__day-dry.jpg) |
| Pit chase · dusk · dry | Paddock orbit · day · dry | Main stand trackside · day · dry |
| ![Dunlop day](../../../artifacts/shots/tracks/okayama/s1-dunlop-eye__day-dry.jpg) | ![Dunlop dusk](../../../artifacts/shots/tracks/okayama/s1-dunlop-eye__dusk-dry.jpg) | |
| Dunlop bridge eye · day · dry | Dunlop bridge eye · dusk · dry | |

**Notes:** Main grandstand pushed **10→18 m** (was 7.6 m props-over-road). Pit garage model suppressed by engine pit complex.

## Sector 2 — Attwood → hairpin (0.371 – 0.599)

| | | |
|:---:|:---:|:---:|
| ![Turn 1 day](../../../artifacts/shots/tracks/okayama/s2-turn1-ts__day-dry.jpg) | ![Turn 1 dusk](../../../artifacts/shots/tracks/okayama/s2-turn1-ts__dusk-dry.jpg) | ![Attwood](../../../artifacts/shots/tracks/okayama/s2-attwood-park__day-dry.jpg) |
| Turn 1 trackside · day · dry | Turn 1 trackside · dusk · dry | Attwood park · day · dry |
| ![Williams day](../../../artifacts/shots/tracks/okayama/s2-williams-orbit__day-dry.jpg) | ![Williams dawn](../../../artifacts/shots/tracks/okayama/s2-williams-orbit__dawn-dry.jpg) | ![Williams dusk](../../../artifacts/shots/tracks/okayama/s2-williams-orbit__dusk-dry.jpg) |
| Williams paddock orbit · day · dry | Williams paddock orbit · dawn · dry | Williams paddock orbit · dusk · dry |
| ![Moss day](../../../artifacts/shots/tracks/okayama/s2-moss-ts__day-dry.jpg) | ![Moss dusk](../../../artifacts/shots/tracks/okayama/s2-moss-ts__dusk-dry.jpg) | ![Hairpin day](../../../artifacts/shots/tracks/okayama/s2-hairpin-ts__day-dry.jpg) |
| Moss S trackside · day · dry | Moss S trackside · dusk · dry | Hairpin trackside · day · dry |
| ![Hairpin dusk](../../../artifacts/shots/tracks/okayama/s2-hairpin-ts__dusk-dry.jpg) | ![Hairpin night](../../../artifacts/shots/tracks/okayama/s2-hairpin-ts__night-dry.jpg) | |
| Hairpin trackside · dusk · dry | Hairpin trackside · night · dry | |

**Notes:** Trackside `cameraTower` often fills foreground. `lamp: "none"` — night panels show unlit foliage (no flood masts).

## Sector 3 — Revolver → last corner (s &gt; 0.599)

| | | |
|:---:|:---:|:---:|
| ![Revolver day](../../../artifacts/shots/tracks/okayama/s3-revolver-park__day-dry.jpg) | ![Revolver dusk](../../../artifacts/shots/tracks/okayama/s3-revolver-park__dusk-dry.jpg) | ![Climb day](../../../artifacts/shots/tracks/okayama/s3-climb-park__day-dry.jpg) |
| Revolver chase · day · dry | Revolver chase · dusk · dry | Back climb chase · day · dry |
| ![Climb dusk](../../../artifacts/shots/tracks/okayama/s3-climb-park__dusk-dry.jpg) | ![Hobbs day](../../../artifacts/shots/tracks/okayama/s3-hobbs-ts__day-dry.jpg) | ![Hobbs dusk](../../../artifacts/shots/tracks/okayama/s3-hobbs-ts__dusk-dry.jpg) |
| Back climb chase · dusk · dry | Hobbs trackside · day · dry | Hobbs trackside · dusk · dry |
| ![Hobbs night](../../../artifacts/shots/tracks/okayama/s3-hobbs-ts__night-dry.jpg) | ![Mike day](../../../artifacts/shots/tracks/okayama/s3-mike-park__day-dry.jpg) | ![Mike night](../../../artifacts/shots/tracks/okayama/s3-mike-park__night-dry.jpg) |
| Hobbs trackside · night · dry | Mike Knight chase · day · dry | Mike Knight chase · night · dry |
| ![Last day](../../../artifacts/shots/tracks/okayama/s3-last-ts__day-dry.jpg) | ![Last dusk](../../../artifacts/shots/tracks/okayama/s3-last-ts__dusk-dry.jpg) | |
| Last corner trackside · day · dry | Last corner trackside · dusk · dry | |

**Notes:** Hobbs stand **20→22 m** (0.83 m overlap fixed). Ground cliff @ frac 0.75 on descent (terrain step).

## Weather backlog (not yet captured)

Rain, wet, overcast, fog need shared `__apex.weather()` batch. Watch: wet clay z-fight, fog vs green `fogDensity`, rain particles in tree walls.

## Audits

| Check | Result |
|--------|--------|
| verify-track | OK — min radius 11.99 m, 0 folds |
| audit-circuit | OK — float 0, clip 0 |

## Fixes in branch

- `grandstandEx(0.015, -1, 18, …)` — main stand clearance.
- `grandstandEx(0.6322, -1, 22, …)` — Hobbs stand clearance.
