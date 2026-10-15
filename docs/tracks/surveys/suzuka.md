# Suzuka — circuit survey (2026-10-14)

**Branch:** `cursor/suzuka-survey-b92a` · **Brief:** [`docs/tracks/suzuka.md`](../suzuka.md)  
**Data:** `js/circuits/suzuka.js` · **Dressing:** `js/circuits/scenery/suzuka.js`  
**Shots:** **36** JPEGs in `artifacts/shots/tracks/suzuka/` (`git add -f`; tracked via shared tooling `.gitignore` exception on merge).

Capture: `shot.mjs --batch` with `--jpeg --present-timeout 90 --capture-retries 4 --wait 120` (SwiftShader / default backend). Weather via `__apex.weather()` (`dry|wet|rain|overcast|fog|storm`); time via `setTimeOfDay` (`day|dawn|dusk|night`).

## Code map

| Layer | Notes |
|---|---|
| `suzuka.js` | Figure-8 `bridges` at s≈0.845, racing-frame scenery, SRTM elevation, crossover `dressingExclusions` |
| `scenery/suzuka.js` | Motopia wheel, Dunlop arch, crossover deck/portal, Spoon terrace, shrine, cedar/bamboo/sakura |

## Findings

| ID | Finding |
|---|---|
| F1 | `verify-track` OK — no surface folds |
| F2 | `audit-circuit` OK — float 0; ground within baseline |
| F3 | Crossover reads correctly under all sampled weather |
| F4 | Night/dusk: hand `lampWarm` posts visible; no fleet flood masts (`furniture.lamp: "none"`) |
| F5 | Storm/rain show wet road + particles; fog softens distant mountains (Ferris orbit) |

## Panel grid (36 frames)

| ![sector s1 dunlop arch](../../../artifacts/shots/tracks/suzuka/sector-s1-dunlop-arch-day-dry.jpg) | ![sector s1 esses climb](../../../artifacts/shots/tracks/suzuka/sector-s1-esses-climb-day-dry.jpg) | ![sector s1 ferris motopia](../../../artifacts/shots/tracks/suzuka/sector-s1-ferris-motopia-day-dry.jpg) |
| **sector s1 dunlop arch** · wx=dry · tod=day | **sector s1 esses climb** · wx=dry · tod=day | **sector s1 ferris motopia** · wx=dry · tod=day |

| ![sector s1 start main](../../../artifacts/shots/tracks/suzuka/sector-s1-start-main-day-dry.jpg) | ![sector s2 crossover under](../../../artifacts/shots/tracks/suzuka/sector-s2-crossover-under-day-dry.jpg) | ![sector s2 degner](../../../artifacts/shots/tracks/suzuka/sector-s2-degner-day-dry.jpg) |
| **sector s1 start main** · wx=dry · tod=day | **sector s2 crossover under** · wx=dry · tod=day | **sector s2 degner** · wx=dry · tod=day |

| ![sector s2 hairpin](../../../artifacts/shots/tracks/suzuka/sector-s2-hairpin-day-dry.jpg) | ![sector s2 shrine hill](../../../artifacts/shots/tracks/suzuka/sector-s2-shrine-hill-day-dry.jpg) | ![sector s2 spoon](../../../artifacts/shots/tracks/suzuka/sector-s2-spoon-day-dry.jpg) |
| **sector s2 hairpin** · wx=dry · tod=day | **sector s2 shrine hill** · wx=dry · tod=day | **sector s2 spoon** · wx=dry · tod=day |

| ![sector s3 130r](../../../artifacts/shots/tracks/suzuka/sector-s3-130r-day-dry.jpg) | ![sector s3 casio chicane](../../../artifacts/shots/tracks/suzuka/sector-s3-casio-chicane-day-dry.jpg) | ![sector s3 crossover bridge](../../../artifacts/shots/tracks/suzuka/sector-s3-crossover-bridge-day-dry.jpg) |
| **sector s3 130r** · wx=dry · tod=day | **sector s3 casio chicane** · wx=dry · tod=day | **sector s3 crossover bridge** · wx=dry · tod=day |

| ![wx bridge](../../../artifacts/shots/tracks/suzuka/wx-bridge-dusk-dry.jpg) | ![wx bridge](../../../artifacts/shots/tracks/suzuka/wx-bridge-night-dry.jpg) | ![wx bridge overcast day](../../../artifacts/shots/tracks/suzuka/wx-bridge-overcast-day.jpg) |
| **wx bridge** · wx=dry · tod=dusk | **wx bridge** · wx=dry · tod=night | **wx bridge overcast day** · wx=dry · tod=day |

| ![wx bridge rain day](../../../artifacts/shots/tracks/suzuka/wx-bridge-rain-day.jpg) | ![wx bridge storm day](../../../artifacts/shots/tracks/suzuka/wx-bridge-storm-day.jpg) | ![wx bridge wet day](../../../artifacts/shots/tracks/suzuka/wx-bridge-wet-day.jpg) |
| **wx bridge rain day** · wx=dry · tod=day | **wx bridge storm day** · wx=dry · tod=day | **wx bridge wet day** · wx=dry · tod=day |

| ![wx casio fog day](../../../artifacts/shots/tracks/suzuka/wx-casio-fog-day.jpg) | ![wx casio overcast day](../../../artifacts/shots/tracks/suzuka/wx-casio-overcast-day.jpg) | ![wx casio rain day](../../../artifacts/shots/tracks/suzuka/wx-casio-rain-day.jpg) |
| **wx casio fog day** · wx=dry · tod=day | **wx casio overcast day** · wx=dry · tod=day | **wx casio rain day** · wx=dry · tod=day |

| ![wx casio wet day](../../../artifacts/shots/tracks/suzuka/wx-casio-wet-day.jpg) | ![wx esses fog day](../../../artifacts/shots/tracks/suzuka/wx-esses-fog-day.jpg) | ![wx esses overcast day](../../../artifacts/shots/tracks/suzuka/wx-esses-overcast-day.jpg) |
| **wx casio wet day** · wx=dry · tod=day | **wx esses fog day** · wx=dry · tod=day | **wx esses overcast day** · wx=dry · tod=day |

| ![wx esses rain day](../../../artifacts/shots/tracks/suzuka/wx-esses-rain-day.jpg) | ![wx esses wet day](../../../artifacts/shots/tracks/suzuka/wx-esses-wet-day.jpg) | ![wx ferris](../../../artifacts/shots/tracks/suzuka/wx-ferris-dusk-dry.jpg) |
| **wx esses rain day** · wx=dry · tod=day | **wx esses wet day** · wx=dry · tod=day | **wx ferris** · wx=dry · tod=dusk |

| ![wx ferris fog day](../../../artifacts/shots/tracks/suzuka/wx-ferris-fog-day.jpg) | ![wx ferris](../../../artifacts/shots/tracks/suzuka/wx-ferris-night-dry.jpg) | ![wx ferris overcast day](../../../artifacts/shots/tracks/suzuka/wx-ferris-overcast-day.jpg) |
| **wx ferris fog day** · wx=dry · tod=day | **wx ferris** · wx=dry · tod=night | **wx ferris overcast day** · wx=dry · tod=day |

| ![wx ferris rain day](../../../artifacts/shots/tracks/suzuka/wx-ferris-rain-day.jpg) | ![wx ferris storm day](../../../artifacts/shots/tracks/suzuka/wx-ferris-storm-day.jpg) | ![wx ferris wet day](../../../artifacts/shots/tracks/suzuka/wx-ferris-wet-day.jpg) |
| **wx ferris rain day** · wx=dry · tod=day | **wx ferris storm day** · wx=dry · tod=day | **wx ferris wet day** · wx=dry · tod=day |

| ![wx portal](../../../artifacts/shots/tracks/suzuka/wx-portal-night-dry.jpg) | ![wx portal rain day](../../../artifacts/shots/tracks/suzuka/wx-portal-rain-day.jpg) | ![wx portal wet day](../../../artifacts/shots/tracks/suzuka/wx-portal-wet-day.jpg) |
| **wx portal** · wx=dry · tod=night | **wx portal rain day** · wx=dry · tod=day | **wx portal wet day** · wx=dry · tod=day |


## Verification

```text
node tools/track/verify-track.cjs suzuka
```
