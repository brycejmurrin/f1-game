# Hungaroring — circuit survey (2026-10-15)

**Shots:** **36** JPEGs in `artifacts/shots/tracks/hungaroring/` (`git add -f`; SwiftShader / TLX).  
**Batch:** `node tools/shot/shot.mjs --batch docs/tracks/surveys/hungaroring-capture-jobs.json --jpeg --present-timeout 120 --capture-retries 6 --wait 150` (shared shot tooling from PR #1862).

**Brief:** `docs/tracks/hungaroring.md` · **Def / scenery:** `js/circuits/hungaroring.js`, `js/circuits/scenery/hungaroring.js`

## Code map

| Piece | Path |
|-------|------|
| Landmarks | `tests/data/landmarks/hungaroring.json` |
| Verify | `node tools/track/verify-track.cjs hungaroring` |
| Audit | `node tools/track/audit-circuit.cjs hungaroring` |

Frame debt: `sceneryStartFrac` 0.9825 — hero props use `sl()` / `au()`; do not drop without a full reprobe.

## Survey panels

Path prefix: `../../../artifacts/shots/tracks/hungaroring/`
### Lap / sector coverage (day · dry)

| **01 sf park dry day** | **02 pit orbit dry day** | **03 tribune trackside dry day** |
| ![01 sf park dry day](../../../artifacts/shots/tracks/hungaroring/01-sf-park-dry-day.jpg) | ![02 pit orbit dry day](../../../artifacts/shots/tracks/hungaroring/02-pit-orbit-dry-day.jpg) | ![03 tribune trackside dry day](../../../artifacts/shots/tracks/hungaroring/03-tribune-trackside-dry-day.jpg) |
| 01 sf park dry day<br/>02 pit orbit dry day<br/>03 tribune trackside dry day |

| **04 t1 orbit dry day** | **05 t2 eye dry day** | **06 mid orbit dry day** |
| ![04 t1 orbit dry day](../../../artifacts/shots/tracks/hungaroring/04-t1-orbit-dry-day.jpg) | ![05 t2 eye dry day](../../../artifacts/shots/tracks/hungaroring/05-t2-eye-dry-day.jpg) | ![06 mid orbit dry day](../../../artifacts/shots/tracks/hungaroring/06-mid-orbit-dry-day.jpg) |
| 04 t1 orbit dry day<br/>05 t2 eye dry day<br/>06 mid orbit dry day |

| **07 t4 trackside dry day** | **08 t5 orbit dry day** |  |
| ![07 t4 trackside dry day](../../../artifacts/shots/tracks/hungaroring/07-t4-trackside-dry-day.jpg) | ![08 t5 orbit dry day](../../../artifacts/shots/tracks/hungaroring/08-t5-orbit-dry-day.jpg) |  |
| 07 t4 trackside dry day<br/>08 t5 orbit dry day<br/> |

### Weather & lighting variants

| **hero sf orbit day wet** | **hero sf orbit day rain** | **hero sf orbit day overcast** |
| ![hero sf orbit day wet](../../../artifacts/shots/tracks/hungaroring/hero-sf-orbit-day-wet.jpg) | ![hero sf orbit day rain](../../../artifacts/shots/tracks/hungaroring/hero-sf-orbit-day-rain.jpg) | ![hero sf orbit day overcast](../../../artifacts/shots/tracks/hungaroring/hero-sf-orbit-day-overcast.jpg) |
| hero sf orbit day wet<br/>hero sf orbit day rain<br/>hero sf orbit day overcast |

| **hero sf orbit day fog** | **hero sf orbit day storm** | **hero sf orbit dusk dry** |
| ![hero sf orbit day fog](../../../artifacts/shots/tracks/hungaroring/hero-sf-orbit-day-fog.jpg) | ![hero sf orbit day storm](../../../artifacts/shots/tracks/hungaroring/hero-sf-orbit-day-storm.jpg) | ![hero sf orbit dusk dry](../../../artifacts/shots/tracks/hungaroring/hero-sf-orbit-dusk-dry.jpg) |
| hero sf orbit day fog<br/>hero sf orbit day storm<br/>hero sf orbit dusk dry |

| **hero sf orbit night dry** | **hero t1 orbit day wet** | **hero t1 orbit day rain** |
| ![hero sf orbit night dry](../../../artifacts/shots/tracks/hungaroring/hero-sf-orbit-night-dry.jpg) | ![hero t1 orbit day wet](../../../artifacts/shots/tracks/hungaroring/hero-t1-orbit-day-wet.jpg) | ![hero t1 orbit day rain](../../../artifacts/shots/tracks/hungaroring/hero-t1-orbit-day-rain.jpg) |
| hero sf orbit night dry<br/>hero t1 orbit day wet<br/>hero t1 orbit day rain |

| **hero t1 orbit day overcast** | **hero t1 orbit day fog** | **hero t1 orbit day storm** |
| ![hero t1 orbit day overcast](../../../artifacts/shots/tracks/hungaroring/hero-t1-orbit-day-overcast.jpg) | ![hero t1 orbit day fog](../../../artifacts/shots/tracks/hungaroring/hero-t1-orbit-day-fog.jpg) | ![hero t1 orbit day storm](../../../artifacts/shots/tracks/hungaroring/hero-t1-orbit-day-storm.jpg) |
| hero t1 orbit day overcast<br/>hero t1 orbit day fog<br/>hero t1 orbit day storm |

| **hero t1 orbit dusk dry** | **hero t1 orbit night dry** | **hero t5 orbit day wet** |
| ![hero t1 orbit dusk dry](../../../artifacts/shots/tracks/hungaroring/hero-t1-orbit-dusk-dry.jpg) | ![hero t1 orbit night dry](../../../artifacts/shots/tracks/hungaroring/hero-t1-orbit-night-dry.jpg) | ![hero t5 orbit day wet](../../../artifacts/shots/tracks/hungaroring/hero-t5-orbit-day-wet.jpg) |
| hero t1 orbit dusk dry<br/>hero t1 orbit night dry<br/>hero t5 orbit day wet |

| **hero t5 orbit day rain** | **hero t5 orbit day overcast** | **hero t5 orbit day fog** |
| ![hero t5 orbit day rain](../../../artifacts/shots/tracks/hungaroring/hero-t5-orbit-day-rain.jpg) | ![hero t5 orbit day overcast](../../../artifacts/shots/tracks/hungaroring/hero-t5-orbit-day-overcast.jpg) | ![hero t5 orbit day fog](../../../artifacts/shots/tracks/hungaroring/hero-t5-orbit-day-fog.jpg) |
| hero t5 orbit day rain<br/>hero t5 orbit day overcast<br/>hero t5 orbit day fog |

| **hero t5 orbit day storm** | **hero t5 orbit dusk dry** | **hero t5 orbit night dry** |
| ![hero t5 orbit day storm](../../../artifacts/shots/tracks/hungaroring/hero-t5-orbit-day-storm.jpg) | ![hero t5 orbit dusk dry](../../../artifacts/shots/tracks/hungaroring/hero-t5-orbit-dusk-dry.jpg) | ![hero t5 orbit night dry](../../../artifacts/shots/tracks/hungaroring/hero-t5-orbit-night-dry.jpg) |
| hero t5 orbit day storm<br/>hero t5 orbit dusk dry<br/>hero t5 orbit night dry |

| **hero t14 orbit day wet** | **hero t14 orbit day rain** | **hero t14 orbit day overcast** |
| ![hero t14 orbit day wet](../../../artifacts/shots/tracks/hungaroring/hero-t14-orbit-day-wet.jpg) | ![hero t14 orbit day rain](../../../artifacts/shots/tracks/hungaroring/hero-t14-orbit-day-rain.jpg) | ![hero t14 orbit day overcast](../../../artifacts/shots/tracks/hungaroring/hero-t14-orbit-day-overcast.jpg) |
| hero t14 orbit day wet<br/>hero t14 orbit day rain<br/>hero t14 orbit day overcast |

| **hero t14 orbit day fog** | **hero t14 orbit day storm** | **hero t14 orbit dusk dry** |
| ![hero t14 orbit day fog](../../../artifacts/shots/tracks/hungaroring/hero-t14-orbit-day-fog.jpg) | ![hero t14 orbit day storm](../../../artifacts/shots/tracks/hungaroring/hero-t14-orbit-day-storm.jpg) | ![hero t14 orbit dusk dry](../../../artifacts/shots/tracks/hungaroring/hero-t14-orbit-dusk-dry.jpg) |
| hero t14 orbit day fog<br/>hero t14 orbit day storm<br/>hero t14 orbit dusk dry |

| **hero t14 orbit night dry** |  |  |
| ![hero t14 orbit night dry](../../../artifacts/shots/tracks/hungaroring/hero-t14-orbit-night-dry.jpg) |  |  |
| hero t14 orbit night dry<br/><br/> |

