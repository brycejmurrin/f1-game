# Silverstone — circuit survey (2026-10-15 re-shoot)

**Shots:** **42 / 42** JPEGs in `artifacts/shots/tracks/silverstone/` (SwiftShader / TLX; shared shot tooling #1862).  
**Batch:** [`silverstone-capture-jobs.json`](silverstone-capture-jobs.json) — runs 1–2 (jobs 1–42).  
**Capture:** `APEX_GL=swiftshader node tools/shot/shot.mjs --batch docs/tracks/surveys/silverstone-capture-jobs.json --jpeg --gpu swiftshader --present-timeout 120 --capture-retries 6 --wait 150` (budgeted runs: `scratch/europe-west-reshoot.mjs slice … <limit> <out> <offset>`).

**Def / scenery:** `js/circuits/silverstone.js`, `js/circuits/scenery/silverstone.js`

## Code map

| Layer | Path |
|---|---|
| Landmarks | `tests/data/landmarks/silverstone.json` |
| Verify | `node tools/track/verify-track.cjs silverstone` |

## Survey panels

Path prefix: `../../../artifacts/shots/tracks/silverstone/`

### Lap / sector coverage (day · dry)

| **s1 copse orbit dry day** | **s1 maggotts orbit dry day** | **s1 chapel orbit dry day** |
| ![s1-copse-orbit-dry-day.jpg](../../../artifacts/shots/tracks/silverstone/s1-copse-orbit-dry-day.jpg) | ![s1-maggotts-orbit-dry-day.jpg](../../../artifacts/shots/tracks/silverstone/s1-maggotts-orbit-dry-day.jpg) | ![s1-chapel-orbit-dry-day.jpg](../../../artifacts/shots/tracks/silverstone/s1-chapel-orbit-dry-day.jpg) |
| s1 copse orbit dry day<br/>s1 maggotts orbit dry day<br/>s1 chapel orbit dry day |

| **s1 hangar t2 orbit dry day** | **s1 hangar wide orbit dry day** | **s2 stowe orbit dry day** |
| ![s1-hangar-t2-orbit-dry-day.jpg](../../../artifacts/shots/tracks/silverstone/s1-hangar-t2-orbit-dry-day.jpg) | ![s1-hangar-wide-orbit-dry-day.jpg](../../../artifacts/shots/tracks/silverstone/s1-hangar-wide-orbit-dry-day.jpg) | ![s2-stowe-orbit-dry-day.jpg](../../../artifacts/shots/tracks/silverstone/s2-stowe-orbit-dry-day.jpg) |
| s1 hangar t2 orbit dry day<br/>s1 hangar wide orbit dry day<br/>s2 stowe orbit dry day |

| **s2 vale trackside dry day** | **s2 club orbit dry day** | **s2 wing hero orbit dry day** |
| ![s2-vale-trackside-dry-day.jpg](../../../artifacts/shots/tracks/silverstone/s2-vale-trackside-dry-day.jpg) | ![s2-club-orbit-dry-day.jpg](../../../artifacts/shots/tracks/silverstone/s2-club-orbit-dry-day.jpg) | ![s2-wing-hero-orbit-dry-day.jpg](../../../artifacts/shots/tracks/silverstone/s2-wing-hero-orbit-dry-day.jpg) |
| s2 vale trackside dry day<br/>s2 club orbit dry day<br/>s2 wing hero orbit dry day |

| **s2 hamilton stand orbit dry day** | **s2 pit park park dry day** | **s3 abbey orbit dry day** |
| ![s2-hamilton-stand-orbit-dry-day.jpg](../../../artifacts/shots/tracks/silverstone/s2-hamilton-stand-orbit-dry-day.jpg) | ![s2-pit-park-park-dry-day.jpg](../../../artifacts/shots/tracks/silverstone/s2-pit-park-park-dry-day.jpg) | ![s3-abbey-orbit-dry-day.jpg](../../../artifacts/shots/tracks/silverstone/s3-abbey-orbit-dry-day.jpg) |
| s2 hamilton stand orbit dry day<br/>s2 pit park park dry day<br/>s3 abbey orbit dry day |

| **s3 farm orbit dry day** | **s3 village loop orbit dry day** | **s3 brooklands orbit dry day** |
| ![s3-farm-orbit-dry-day.jpg](../../../artifacts/shots/tracks/silverstone/s3-farm-orbit-dry-day.jpg) | ![s3-village-loop-orbit-dry-day.jpg](../../../artifacts/shots/tracks/silverstone/s3-village-loop-orbit-dry-day.jpg) | ![s3-brooklands-orbit-dry-day.jpg](../../../artifacts/shots/tracks/silverstone/s3-brooklands-orbit-dry-day.jpg) |
| s3 farm orbit dry day<br/>s3 village loop orbit dry day<br/>s3 brooklands orbit dry day |

| **s3 woodcote trackside dry day** | **lm museum orbit dry day** | **lm start gantry orbit dry day** |
| ![s3-woodcote-trackside-dry-day.jpg](../../../artifacts/shots/tracks/silverstone/s3-woodcote-trackside-dry-day.jpg) | ![lm-museum-orbit-dry-day.jpg](../../../artifacts/shots/tracks/silverstone/lm-museum-orbit-dry-day.jpg) | ![lm-start-gantry-orbit-dry-day.jpg](../../../artifacts/shots/tracks/silverstone/lm-start-gantry-orbit-dry-day.jpg) |
| s3 woodcote trackside dry day<br/>lm museum orbit dry day<br/>lm start gantry orbit dry day |

### Weather & lighting — Copse

| **hero copse orbit dawn dry** | **hero copse orbit dusk dry** | **hero copse orbit night dry** |
| ![hero-copse-orbit-dawn-dry.jpg](../../../artifacts/shots/tracks/silverstone/hero-copse-orbit-dawn-dry.jpg) | ![hero-copse-orbit-dusk-dry.jpg](../../../artifacts/shots/tracks/silverstone/hero-copse-orbit-dusk-dry.jpg) | ![hero-copse-orbit-night-dry.jpg](../../../artifacts/shots/tracks/silverstone/hero-copse-orbit-night-dry.jpg) |
| hero copse orbit dawn dry<br/>hero copse orbit dusk dry<br/>hero copse orbit night dry |

| **hero copse orbit day wet** | **hero copse orbit day overcast** | **hero copse orbit day storm** |
| ![hero-copse-orbit-day-wet.jpg](../../../artifacts/shots/tracks/silverstone/hero-copse-orbit-day-wet.jpg) | ![hero-copse-orbit-day-overcast.jpg](../../../artifacts/shots/tracks/silverstone/hero-copse-orbit-day-overcast.jpg) | ![hero-copse-orbit-day-storm.jpg](../../../artifacts/shots/tracks/silverstone/hero-copse-orbit-day-storm.jpg) |
| hero copse orbit day wet<br/>hero copse orbit day overcast<br/>hero copse orbit day storm |

### Weather & lighting — Maggotts (cinematic)

| **hero maggotts cinematic dawn dry** | **hero maggotts cinematic dusk dry** | **hero maggotts cinematic night dry** |
| ![hero-maggotts-cinematic-dawn-dry.jpg](../../../artifacts/shots/tracks/silverstone/hero-maggotts-cinematic-dawn-dry.jpg) | ![hero-maggotts-cinematic-dusk-dry.jpg](../../../artifacts/shots/tracks/silverstone/hero-maggotts-cinematic-dusk-dry.jpg) | ![hero-maggotts-cinematic-night-dry.jpg](../../../artifacts/shots/tracks/silverstone/hero-maggotts-cinematic-night-dry.jpg) |
| hero maggotts cinematic dawn dry<br/>hero maggotts cinematic dusk dry<br/>hero maggotts cinematic night dry |

| **hero maggotts cinematic day wet** | **hero maggotts cinematic day overcast** | **hero maggotts cinematic day storm** |
| ![hero-maggotts-cinematic-day-wet.jpg](../../../artifacts/shots/tracks/silverstone/hero-maggotts-cinematic-day-wet.jpg) | ![hero-maggotts-cinematic-day-overcast.jpg](../../../artifacts/shots/tracks/silverstone/hero-maggotts-cinematic-day-overcast.jpg) | ![hero-maggotts-cinematic-day-storm.jpg](../../../artifacts/shots/tracks/silverstone/hero-maggotts-cinematic-day-storm.jpg) |
| hero maggotts cinematic day wet<br/>hero maggotts cinematic day overcast<br/>hero maggotts cinematic day storm |

### Weather & lighting — Hangar

| **hero hangar orbit dawn dry** | **hero hangar orbit dusk dry** | **hero hangar orbit night dry** |
| ![hero-hangar-orbit-dawn-dry.jpg](../../../artifacts/shots/tracks/silverstone/hero-hangar-orbit-dawn-dry.jpg) | ![hero-hangar-orbit-dusk-dry.jpg](../../../artifacts/shots/tracks/silverstone/hero-hangar-orbit-dusk-dry.jpg) | ![hero-hangar-orbit-night-dry.jpg](../../../artifacts/shots/tracks/silverstone/hero-hangar-orbit-night-dry.jpg) |
| hero hangar orbit dawn dry<br/>hero hangar orbit dusk dry<br/>hero hangar orbit night dry |

| **hero hangar orbit day wet** | **hero hangar orbit day overcast** | **hero hangar orbit day storm** |
| ![hero-hangar-orbit-day-wet.jpg](../../../artifacts/shots/tracks/silverstone/hero-hangar-orbit-day-wet.jpg) | ![hero-hangar-orbit-day-overcast.jpg](../../../artifacts/shots/tracks/silverstone/hero-hangar-orbit-day-overcast.jpg) | ![hero-hangar-orbit-day-storm.jpg](../../../artifacts/shots/tracks/silverstone/hero-hangar-orbit-day-storm.jpg) |
| hero hangar orbit day wet<br/>hero hangar orbit day overcast<br/>hero hangar orbit day storm |

### Weather & lighting — Wing

| **hero wing orbit dawn dry** | **hero wing orbit dusk dry** | **hero wing orbit night dry** |
| ![hero-wing-orbit-dawn-dry.jpg](../../../artifacts/shots/tracks/silverstone/hero-wing-orbit-dawn-dry.jpg) | ![hero-wing-orbit-dusk-dry.jpg](../../../artifacts/shots/tracks/silverstone/hero-wing-orbit-dusk-dry.jpg) | ![hero-wing-orbit-night-dry.jpg](../../../artifacts/shots/tracks/silverstone/hero-wing-orbit-night-dry.jpg) |
| hero wing orbit dawn dry<br/>hero wing orbit dusk dry<br/>hero wing orbit night dry |

| **hero wing orbit day wet** | **hero wing orbit day overcast** | **hero wing orbit day storm** |
| ![hero-wing-orbit-day-wet.jpg](../../../artifacts/shots/tracks/silverstone/hero-wing-orbit-day-wet.jpg) | ![hero-wing-orbit-day-overcast.jpg](../../../artifacts/shots/tracks/silverstone/hero-wing-orbit-day-overcast.jpg) | ![hero-wing-orbit-day-storm.jpg](../../../artifacts/shots/tracks/silverstone/hero-wing-orbit-day-storm.jpg) |
| hero wing orbit day wet<br/>hero wing orbit day overcast<br/>hero wing orbit day storm |
