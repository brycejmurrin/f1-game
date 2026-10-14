# Anderstorp (Scandinavian Raceway) — circuit survey

**Date:** 2026-10-14  
**Brief:** `docs/tracks/anderstorp.md`  
**Shots (committed):** `artifacts/shots/tracks/anderstorp/` — **30** JPEG frames (1280px max, q≈80).

## Code map

| Layer | Path | Role |
|-------|------|------|
| Circuit def | `js/circuits/anderstorp.js` | OSM centreline (~4.02 km), `theme: "green"`, `classic: true`, 8 turns, `terrainOuter: 110` |
| Scenery | `js/circuits/scenery/anderstorp.js` | Blocks 0–20; runway `RW0–RW1`; four required `modelGroup` landmarks |
| Landmarks | `tests/data/landmarks/anderstorp.json` | press stand, speaker tower, stations 1968, flight hangars |

**Weather / TOD in game:** `G.raceWeather` — dry, wet, rain, overcast, fog (`js/race/race-settings.js`); `setTimeOfDay` — dawn, day, dusk, night. Lighting presets include `anderstorp|night|*` (`js/lighting/presets.js`). Circuit meta marks `night: false` but night TOD still runs for surveys.

## Audits (circuit-only fixes on branch)

| Check | Result |
|-------|--------|
| `verify-track` | OK, 0 surface folds |
| float / clip | 0 |
| coplanar | 0 spots (baseline cap remains 2 — not lowered on this branch) |
| ground | buried 2 (shared `city.js` detail), flatCoplanar within baseline |

**Scenery fixes (this PR):** extended `FOOT_SPAN` for S/F and T8 stands; removed duplicate wrapped hardstand patch; removed redundant T8 `spectatorHill`.

## Backlog (weather / lighting)

| ID | Issue | Seen in |
|----|--------|---------|
| L1 | **Night floodlights** sparse on Flight Straight / forest sections (`lamp: "none"` in def) | `wx-*-night-dry-*` |
| L2 | **Fog** thickens horizon; runway edge paint low contrast | `wx-*-day-fog-*` |
| L3 | **Rain/wet** darkens pine mass; wet sheen on apron OK | `wx-*-day-rain/wet-*` |
| L4 | **UI track detail** may not assert selected circuit in automation | `ui-track-detail.jpg` |
| L5 | **T8 / hangars weather matrix** incomplete until shared batch tooling lands | only S/F + runway + one hangars dusk frame |

---

## Panel grids

Relative image root: `../../../artifacts/shots/tracks/anderstorp/`

### UI

| | | |
|:---:|:---:|:---:|
| Circuit select<br/>![Circuit select](../../../artifacts/shots/tracks/anderstorp/ui-circuit-select.jpg) | Track detail modal<br/>![Track detail](../../../artifacts/shots/tracks/anderstorp/ui-track-detail.jpg) | |

### Sector 1 — T1, paddock, Södra, bog (day, dry)

| | | |
|:---:|:---:|:---:|
| T1 trackside<br/>day · dry<br/>![T1](../../../artifacts/shots/tracks/anderstorp/sector1-t1-day-dry-trackside.jpg) | Infield paddock orbit<br/>day · dry<br/>![Paddock](../../../artifacts/shots/tracks/anderstorp/sector1-paddock-day-dry-orbit.jpg) | Södra Kurvan trackside<br/>day · dry<br/>![Södra](../../../artifacts/shots/tracks/anderstorp/sector1-sodra-day-dry-trackside.jpg) |
| Anderstorpsån bog eye<br/>day · dry<br/>![Bog](../../../artifacts/shots/tracks/anderstorp/sector1-bog-aan-day-dry-eye.jpg) | | |

### Sector 2 — Opel, T5, scrub, runway entry (day, dry)

| | | |
|:---:|:---:|:---:|
| Opel Kurvan trackside<br/>day · dry<br/>![Opel](../../../artifacts/shots/tracks/anderstorp/sector2-opel-day-dry-trackside.jpg) | Turn 5 orbit<br/>day · dry<br/>![T5](../../../artifacts/shots/tracks/anderstorp/sector2-t5-day-dry-orbit.jpg) | Infield scrub → hangars orbit<br/>day · dry<br/>![Scrub](../../../artifacts/shots/tracks/anderstorp/sector2-scrub-hangars-day-dry-orbit.jpg) |
| Runway entry orbit<br/>day · dry<br/>![Runway entry](../../../artifacts/shots/tracks/anderstorp/sector2-runway-entry-day-dry-orbit.jpg) | | |

### Sector 3 — S/F, hangars, runway far, T8 (day, dry)

| | | |
|:---:|:---:|:---:|
| S/F grandstands orbit<br/>day · dry<br/>![S/F stands](../../../artifacts/shots/tracks/anderstorp/sector3-sf-grandstands-day-dry-orbit.jpg) | Landmarks eye (press/tower)<br/>day · dry<br/>![Landmarks](../../../artifacts/shots/tracks/anderstorp/sector3-sf-landmarks-day-dry-eye.jpg) | Pit garages orbit<br/>day · dry<br/>![Pit garages](../../../artifacts/shots/tracks/anderstorp/sector3-pit-garages-day-dry-orbit.jpg) |
| Flight hangars eye<br/>day · dry<br/>![Hangars](../../../artifacts/shots/tracks/anderstorp/sector3-flight-hangars-day-dry-eye.jpg) | Runway far trackside<br/>day · dry<br/>![Runway far](../../../artifacts/shots/tracks/anderstorp/sector3-runway-far-day-dry-trackside.jpg) | Off-runway T7 trackside<br/>day · dry<br/>![Off runway](../../../artifacts/shots/tracks/anderstorp/sector3-off-runway-day-dry-trackside.jpg) |
| T8 terrace orbit<br/>day · dry<br/>![T8](../../../artifacts/shots/tracks/anderstorp/sector3-t8-terrace-day-dry-orbit.jpg) | | |

### Weather / lighting — Start/finish hero (orbit)

| | | |
|:---:|:---:|:---:|
| dusk · dry<br/>![S/F dusk](../../../artifacts/shots/tracks/anderstorp/wx-sf-dusk-dry-orbit.jpg) | night · dry<br/>![S/F night](../../../artifacts/shots/tracks/anderstorp/wx-sf-night-dry-orbit.jpg) | overcast · day<br/>![S/F overcast](../../../artifacts/shots/tracks/anderstorp/wx-sf-day-overcast-orbit.jpg) |
| wet · day<br/>![S/F wet](../../../artifacts/shots/tracks/anderstorp/wx-sf-day-wet-orbit.jpg) | rain · day<br/>![S/F rain](../../../artifacts/shots/tracks/anderstorp/wx-sf-day-rain-orbit.jpg) | fog · day<br/>![S/F fog](../../../artifacts/shots/tracks/anderstorp/wx-sf-day-fog-orbit.jpg) |

### Weather / lighting — Flight Straight hero (orbit)

| | | |
|:---:|:---:|:---:|
| dusk · dry<br/>![Runway dusk](../../../artifacts/shots/tracks/anderstorp/wx-runway-dusk-dry-orbit.jpg) | night · dry<br/>![Runway night](../../../artifacts/shots/tracks/anderstorp/wx-runway-night-dry-orbit.jpg) | overcast · day<br/>![Runway overcast](../../../artifacts/shots/tracks/anderstorp/wx-runway-day-overcast-orbit.jpg) |
| wet · day<br/>![Runway wet](../../../artifacts/shots/tracks/anderstorp/wx-runway-day-wet-orbit.jpg) | rain · day<br/>![Runway rain](../../../artifacts/shots/tracks/anderstorp/wx-runway-day-rain-orbit.jpg) | fog · day<br/>![Runway fog](../../../artifacts/shots/tracks/anderstorp/wx-runway-day-fog-orbit.jpg) |

### Weather / lighting — Hangars (partial matrix)

| | | |
|:---:|:---:|:---:|
| hangars eye · dusk · dry<br/>![Hangars dusk](../../../artifacts/shots/tracks/anderstorp/wx-hangars-dusk-dry-eye.jpg) | | |

---

## Ranked improvements (future)

1. Complete T8 + hangars weather grid after shared survey shot tooling PR.  
2. Sparse night lamps on runway corridor (`furniture.lamp: "none"`).  
3. Shared `building()` footing bury (2 prims) — engine or per-building opts.  
4. Historical halfway F1 pits — documented UNCERTAIN, not built.
