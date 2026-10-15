# Buddh International Circuit — survey (2026-10-14)

**Circuit id:** `buddh`  
**Branch:** `cursor/buddh-survey-b345`  
**Live:** [brycejmurrin.github.io/f1-game](https://brycejmurrin.github.io/f1-game/)  
**Design brief:** [`docs/tracks/buddh.md`](../buddh.md)

## Code map

| Layer | Path | Role |
|-------|------|------|
| Circuit def | `js/circuits/buddh.js` | OSM centreline (`path.pts`), `theme: "green"`, `terrainOuter: 110`, sectors/turns, furniture/kit |
| Scenery | `js/circuits/scenery/buddh.js` | Lazy `scenery(api)` — 18 lap blocks + farmland scatter + rural depth |
| Engine | `js/track/tracks.js` | `Tracks.build()` / centreline spline |
| Meta | `js/track/circuit-meta.js` | Picker (`classic: true`, Indian GP) |
| Elevation | `js/track/circuit-elevations.js` | Engineered drop into T10–12 |
| Landmarks | `tests/data/landmarks/buddh.json` | `buddh-main-grandstand`, `buddh-pit-complex`, `buddh-temple-hill` |

Centreline: OpenStreetMap stitch; ~5138 m; `reverse: false` (projected CCW for real CW lap).

## Theme and models

- **Theme:** `green` — Greater Noida plain (not urban `modern` skyline).
- **Hero models:** sea-wave main grandstand, closed pit complex, temple-hill silhouette (invented outfield cue).
- **Invalid on this def:** `groundPatch`, `motorhome`, `backdrop` — scenery uses `runoffApron`, `place`, chained `ridge`.

**Re-capture (2026-10-15):** **34** JPEGs — `node tools/shot/shot.mjs --batch artifacts/shots/tracks/buddh/capture-jobs.jsonl --jpeg --present-timeout 90 --capture-retries 4 --wait 120` (shared shot tooling #1862, SwiftShader).

## Panel grid (34 frames)

| ![overview track picker](../../../artifacts/shots/tracks/buddh/overview-track-picker-day-dry.jpg) | ![s1 grandstand](../../../artifacts/shots/tracks/buddh/s1-grandstand-dawn-dry.jpg) | ![s1 grandstand](../../../artifacts/shots/tracks/buddh/s1-grandstand-day-dry.jpg) |
| **overview track picker** · wx=dry · tod=day | **s1 grandstand** · wx=dry · tod=dawn | **s1 grandstand** · wx=dry · tod=day |

| ![s1 grandstand](../../../artifacts/shots/tracks/buddh/s1-grandstand-day-fog.jpg) | ![s1 grandstand](../../../artifacts/shots/tracks/buddh/s1-grandstand-day-overcast.jpg) | ![s1 grandstand](../../../artifacts/shots/tracks/buddh/s1-grandstand-day-rain.jpg) |
| **s1 grandstand** · wx=fog · tod=day | **s1 grandstand** · wx=overcast · tod=day | **s1 grandstand** · wx=rain · tod=day |

| ![s1 grandstand](../../../artifacts/shots/tracks/buddh/s1-grandstand-day-storm.jpg) | ![s1 grandstand](../../../artifacts/shots/tracks/buddh/s1-grandstand-dusk-dry.jpg) | ![s1 grandstand](../../../artifacts/shots/tracks/buddh/s1-grandstand-night-dry.jpg) |
| **s1 grandstand** · wx=storm · tod=day | **s1 grandstand** · wx=dry · tod=dusk | **s1 grandstand** · wx=dry · tod=night |

| ![s1 t1 brake](../../../artifacts/shots/tracks/buddh/s1-t1-brake-day-dry.jpg) | ![s1 t1 brake](../../../artifacts/shots/tracks/buddh/s1-t1-brake-day-overcast.jpg) | ![s1 t1 brake](../../../artifacts/shots/tracks/buddh/s1-t1-brake-day-rain.jpg) |
| **s1 t1 brake** · wx=dry · tod=day | **s1 t1 brake** · wx=overcast · tod=day | **s1 t1 brake** · wx=rain · tod=day |

| ![s1 t1 brake](../../../artifacts/shots/tracks/buddh/s1-t1-brake-day-wet.jpg) | ![s1 t1 brake](../../../artifacts/shots/tracks/buddh/s1-t1-brake-dusk-dry.jpg) | ![s1 t1 brake](../../../artifacts/shots/tracks/buddh/s1-t1-brake-night-dry.jpg) |
| **s1 t1 brake** · wx=wet · tod=day | **s1 t1 brake** · wx=dry · tod=dusk | **s1 t1 brake** · wx=dry · tod=night |

| ![s2 double apex](../../../artifacts/shots/tracks/buddh/s2-double-apex-day-dry.jpg) | ![s2 double apex](../../../artifacts/shots/tracks/buddh/s2-double-apex-day-overcast.jpg) | ![s2 double apex](../../../artifacts/shots/tracks/buddh/s2-double-apex-day-rain.jpg) |
| **s2 double apex** · wx=dry · tod=day | **s2 double apex** · wx=overcast · tod=day | **s2 double apex** · wx=rain · tod=day |

| ![s2 double apex](../../../artifacts/shots/tracks/buddh/s2-double-apex-day-storm.jpg) | ![s2 double apex](../../../artifacts/shots/tracks/buddh/s2-double-apex-day-wet.jpg) | ![s2 double apex](../../../artifacts/shots/tracks/buddh/s2-double-apex-dusk-dry.jpg) |
| **s2 double apex** · wx=storm · tod=day | **s2 double apex** · wx=wet · tod=day | **s2 double apex** · wx=dry · tod=dusk |

| ![s2 double apex](../../../artifacts/shots/tracks/buddh/s2-double-apex-night-dry.jpg) | ![s3 east stands](../../../artifacts/shots/tracks/buddh/s3-east-stands-day-dry.jpg) | ![s3 east stands](../../../artifacts/shots/tracks/buddh/s3-east-stands-day-fog.jpg) |
| **s2 double apex** · wx=dry · tod=night | **s3 east stands** · wx=dry · tod=day | **s3 east stands** · wx=fog · tod=day |

| ![s3 east stands](../../../artifacts/shots/tracks/buddh/s3-east-stands-day-overcast.jpg) | ![s3 east stands](../../../artifacts/shots/tracks/buddh/s3-east-stands-day-rain.jpg) | ![s3 east stands](../../../artifacts/shots/tracks/buddh/s3-east-stands-dusk-dry.jpg) |
| **s3 east stands** · wx=overcast · tod=day | **s3 east stands** · wx=rain · tod=day | **s3 east stands** · wx=dry · tod=dusk |

| ![s3 east stands](../../../artifacts/shots/tracks/buddh/s3-east-stands-night-dry.jpg) | ![s3 final](../../../artifacts/shots/tracks/buddh/s3-final-day-dry.jpg) | ![s3 final](../../../artifacts/shots/tracks/buddh/s3-final-day-fog.jpg) |
| **s3 east stands** · wx=dry · tod=night | **s3 final** · wx=dry · tod=day | **s3 final** · wx=fog · tod=day |

| ![s3 final](../../../artifacts/shots/tracks/buddh/s3-final-day-overcast.jpg) | ![s3 final](../../../artifacts/shots/tracks/buddh/s3-final-day-rain.jpg) | ![s3 final](../../../artifacts/shots/tracks/buddh/s3-final-dusk-dry.jpg) |
| **s3 final** · wx=overcast · tod=day | **s3 final** · wx=rain · tod=day | **s3 final** · wx=dry · tod=dusk |

| ![s3 final](../../../artifacts/shots/tracks/buddh/s3-final-night-dry.jpg) |
| **s3 final** · wx=dry · tod=night |


## Verification

```text
node tools/track/verify-track.cjs buddh
```
