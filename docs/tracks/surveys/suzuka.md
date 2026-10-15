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

## Sector tour — dry · day

| | | |
|:---:|:---:|:---:|
| ![S/F](../../../artifacts/shots/tracks/suzuka/sector-s1-start-main-day-dry.jpg)<br>**S/F main stand** · trackside · dry · day | ![Ferris](../../../artifacts/shots/tracks/suzuka/sector-s1-ferris-motopia-day-dry.jpg)<br>**Motopia / Circuit Wheel** · orbit · dry · day | ![Esses](../../../artifacts/shots/tracks/suzuka/sector-s1-esses-climb-day-dry.jpg)<br>**Esses climb** · trackside · dry · day |
| ![Dunlop](../../../artifacts/shots/tracks/suzuka/sector-s1-dunlop-arch-day-dry.jpg)<br>**Dunlop arch** · trackside · dry · day | ![Degner](../../../artifacts/shots/tracks/suzuka/sector-s2-degner-day-dry.jpg)<br>**Degner** · eye · dry · day | ![Portal](../../../artifacts/shots/tracks/suzuka/sector-s2-crossover-under-day-dry.jpg)<br>**Crossover portal** · eye · dry · day |
| ![Hairpin](../../../artifacts/shots/tracks/suzuka/sector-s2-hairpin-day-dry.jpg)<br>**Hairpin** · trackside · dry · day | ![Spoon](../../../artifacts/shots/tracks/suzuka/sector-s2-spoon-day-dry.jpg)<br>**Spoon terrace** · trackside · dry · day | ![Shrine](../../../artifacts/shots/tracks/suzuka/sector-s2-shrine-hill-day-dry.jpg)<br>**Shrine / torii** · orbit · dry · day |
| ![Flyover](../../../artifacts/shots/tracks/suzuka/sector-s3-crossover-bridge-day-dry.jpg)<br>**Crossover bridge** · trackside · dry · day | ![130R](../../../artifacts/shots/tracks/suzuka/sector-s3-130r-day-dry.jpg)<br>**130R** · trackside · dry · day | ![Casio](../../../artifacts/shots/tracks/suzuka/sector-s3-casio-chicane-day-dry.jpg)<br>**Casio chicane** · trackside · dry · day |

## Hero weather & lighting (5 views)

### Circuit Wheel (orbit s≈0.02)

| | | |
|:---:|:---:|:---:|
| ![wet](../../../artifacts/shots/tracks/suzuka/wx-ferris-wet-day.jpg)<br>**Ferris** · orbit · **wet** · day | ![rain](../../../artifacts/shots/tracks/suzuka/wx-ferris-rain-day.jpg)<br>**Ferris** · orbit · **rain** · day | ![overcast](../../../artifacts/shots/tracks/suzuka/wx-ferris-overcast-day.jpg)<br>**Ferris** · orbit · **overcast** · day |
| ![fog](../../../artifacts/shots/tracks/suzuka/wx-ferris-fog-day.jpg)<br>**Ferris** · orbit · **fog** · day | ![storm](../../../artifacts/shots/tracks/suzuka/wx-ferris-storm-day.jpg)<br>**Ferris** · orbit · **storm** · day | ![dusk](../../../artifacts/shots/tracks/suzuka/wx-ferris-dusk-dry.jpg)<br>**Ferris** · orbit · dry · **dusk** |
| ![night](../../../artifacts/shots/tracks/suzuka/wx-ferris-night-dry.jpg)<br>**Ferris** · orbit · dry · **night** | | |

### Esses (trackside s≈0.18)

| | | |
|:---:|:---:|:---:|
| ![wet](../../../artifacts/shots/tracks/suzuka/wx-esses-wet-day.jpg)<br>**Esses** · trackside · **wet** · day | ![rain](../../../artifacts/shots/tracks/suzuka/wx-esses-rain-day.jpg)<br>**Esses** · trackside · **rain** · day | ![overcast](../../../artifacts/shots/tracks/suzuka/wx-esses-overcast-day.jpg)<br>**Esses** · trackside · **overcast** · day |
| ![fog](../../../artifacts/shots/tracks/suzuka/wx-esses-fog-day.jpg)<br>**Esses** · trackside · **fog** · day | | |

### Flyover (trackside s≈0.845)

| | | |
|:---:|:---:|:---:|
| ![wet](../../../artifacts/shots/tracks/suzuka/wx-bridge-wet-day.jpg)<br>**Flyover** · trackside · **wet** · day | ![rain](../../../artifacts/shots/tracks/suzuka/wx-bridge-rain-day.jpg)<br>**Flyover** · trackside · **rain** · day | ![overcast](../../../artifacts/shots/tracks/suzuka/wx-bridge-overcast-day.jpg)<br>**Flyover** · trackside · **overcast** · day |
| ![storm](../../../artifacts/shots/tracks/suzuka/wx-bridge-storm-day.jpg)<br>**Flyover** · trackside · **storm** · day | ![dusk](../../../artifacts/shots/tracks/suzuka/wx-bridge-dusk-dry.jpg)<br>**Flyover** · trackside · dry · **dusk** | ![night](../../../artifacts/shots/tracks/suzuka/wx-bridge-night-dry.jpg)<br>**Flyover** · trackside · dry · **night** |

### Casio (trackside s≈0.94)

| | | |
|:---:|:---:|:---:|
| ![wet](../../../artifacts/shots/tracks/suzuka/wx-casio-wet-day.jpg)<br>**Casio** · trackside · **wet** · day | ![rain](../../../artifacts/shots/tracks/suzuka/wx-casio-rain-day.jpg)<br>**Casio** · trackside · **rain** · day | ![overcast](../../../artifacts/shots/tracks/suzuka/wx-casio-overcast-day.jpg)<br>**Casio** · trackside · **overcast** · day |
| ![fog](../../../artifacts/shots/tracks/suzuka/wx-casio-fog-day.jpg)<br>**Casio** · trackside · **fog** · day | | |

### Crossover portal (eye s≈0.437)

| | | |
|:---:|:---:|:---:|
| ![wet](../../../artifacts/shots/tracks/suzuka/wx-portal-wet-day.jpg)<br>**Portal** · eye · **wet** · day | ![rain](../../../artifacts/shots/tracks/suzuka/wx-portal-rain-day.jpg)<br>**Portal** · eye · **rain** · day | ![night](../../../artifacts/shots/tracks/suzuka/wx-portal-night-dry.jpg)<br>**Portal** · eye · dry · **night** |

## Verification

```sh
node tools/track/verify-track.cjs suzuka
node tools/track/audit-circuit.cjs suzuka
```
