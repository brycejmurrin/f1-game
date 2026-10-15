# Suzuka — circuit survey (2026-10-14)

**Branch:** `cursor/suzuka-survey-b92a` · **Brief:** [`docs/tracks/suzuka.md`](../suzuka.md)  
**Data:** `js/circuits/suzuka.js` · **Dressing:** `js/circuits/scenery/suzuka.js`  
**Landmarks:** `tests/data/landmarks/suzuka.json`  
**Shots (31 JPEG, committed):** `artifacts/shots/tracks/suzuka/` (`git add -f`; repo `.gitignore` still ignores `artifacts/` until shared tooling PR).

Weather variants (`wet` / `rain` / `overcast` / `fog`) deferred until shared shot batch `wx` support lands; this pass is **dry** only, with **day / dusk / dawn / night** on hero views.

## Code map

| Layer | Role |
|---|---|
| `suzuka.js` | OSM path, `startFrac` 0.9942, racing-frame scenery, SRTM elevation, figure-8 `bridges` at s≈0.845, `dressingExclusions` over crossover sectors |
| `scenery/suzuka.js` | Motopia wheel, crossover deck/portal, Dunlop arch, Spoon terrace, shrine, cedar/bamboo/sakura, kit pit/rc/hospitality |
| Engine | `tracks.js` centreline + bridge lift; shared `overheadSpan`, `circuitKit`, `forestEdge` |

## Findings (summary)

| ID | Finding |
|---|---|
| F1 | `verify-track` OK — no surface folds; min radius 9.26 m (Casio, hw 6.1 m) |
| F2 | `audit-circuit` OK — float 0; ground within baseline (buried mountain bases + tyre cap anchors) |
| F3 | Figure-8 crossover reads correctly (green upper parapets, dark soffit, lower portal) |
| F4 | Night: `furniture.lamp: "none"` + crossover `lighting` exclusions — hand lamps only; Esses/130R floodlight gap |
| F5 | Weather matrix not shot this pass (tooling); re-run after shared PR |

## By sector — dry · day · midday

| | | |
|:---:|:---:|:---:|
| ![S/F main stand](../../../artifacts/shots/tracks/suzuka/sector-s1-start-main-day-dry.jpg)<br>**S/F main stand** · trackside · dry · day | ![Ferris & Motopia](../../../artifacts/shots/tracks/suzuka/sector-s1-ferris-motopia-day-dry.jpg)<br>**Motopia / Circuit Wheel** · orbit · dry · day | ![Pit complex](../../../artifacts/shots/tracks/suzuka/sector-s1-pit-complex-day-dry.jpg)<br>**Pit & RC** · orbit · dry · day |
| ![Esses climb](../../../artifacts/shots/tracks/suzuka/sector-s1-esses-climb-day-dry.jpg)<br>**Esses climb** · trackside · dry · day | ![Dunlop arch](../../../artifacts/shots/tracks/suzuka/sector-s1-dunlop-arch-day-dry.jpg)<br>**Dunlop arch** · trackside · dry · day | ![Esses footbridge](../../../artifacts/shots/tracks/suzuka/sector-s1-esses-footbridge-day-dry.jpg)<br>**Esses footbridge** · eye · dry · day |
| ![Degner](../../../artifacts/shots/tracks/suzuka/sector-s2-degner-day-dry.jpg)<br>**Degner** · eye · dry · day | ![Crossover under](../../../artifacts/shots/tracks/suzuka/sector-s2-crossover-under-day-dry.jpg)<br>**Crossover portal** · eye · dry · day | ![Hairpin](../../../artifacts/shots/tracks/suzuka/sector-s2-hairpin-day-dry.jpg)<br>**Hairpin** · trackside · dry · day |
| ![200R](../../../artifacts/shots/tracks/suzuka/sector-s2-200r-day-dry.jpg)<br>**200R** · trackside · dry · day | ![Spoon](../../../artifacts/shots/tracks/suzuka/sector-s2-spoon-day-dry.jpg)<br>**Spoon terrace** · trackside · dry · day | ![Shrine hill](../../../artifacts/shots/tracks/suzuka/sector-s2-shrine-hill-day-dry.jpg)<br>**Shrine / torii** · orbit · dry · day |
| ![Flyover deck](../../../artifacts/shots/tracks/suzuka/sector-s3-crossover-bridge-day-dry.jpg)<br>**Crossover bridge** · trackside · dry · day | ![130R](../../../artifacts/shots/tracks/suzuka/sector-s3-130r-day-dry.jpg)<br>**130R** · trackside · dry · day | ![Casio](../../../artifacts/shots/tracks/suzuka/sector-s3-casio-chicane-day-dry.jpg)<br>**Casio chicane** · trackside · dry · day |
| ![Lap overview](../../../artifacts/shots/tracks/suzuka/sector-overview-day-dry.jpg)<br>**Lap overview** · orbit · dry · day | | |

## By lighting — hero views · dry weather

| | | |
|:---:|:---:|:---:|
| ![Ferris dusk](../../../artifacts/shots/tracks/suzuka/light-ferris-dusk.jpg)<br>**Ferris** · orbit · dry · **dusk** | ![Ferris night](../../../artifacts/shots/tracks/suzuka/light-ferris-night.jpg)<br>**Ferris** · orbit · dry · **night** | ![Ferris dawn](../../../artifacts/shots/tracks/suzuka/light-ferris-dawn.jpg)<br>**Ferris** · orbit · dry · **dawn** |
| ![Esses dusk](../../../artifacts/shots/tracks/suzuka/light-esses-dusk.jpg)<br>**Esses** · trackside · dry · **dusk** | ![Esses night](../../../artifacts/shots/tracks/suzuka/light-esses-night.jpg)<br>**Esses** · trackside · dry · **night** | ![Esses dawn](../../../artifacts/shots/tracks/suzuka/light-esses-dawn.jpg)<br>**Esses** · trackside · dry · **dawn** |
| ![Dunlop dusk](../../../artifacts/shots/tracks/suzuka/light-dunlop-dusk.jpg)<br>**Dunlop** · trackside · dry · **dusk** | ![Dunlop night](../../../artifacts/shots/tracks/suzuka/light-dunlop-night.jpg)<br>**Dunlop** · trackside · dry · **night** | |
| ![Bridge dusk](../../../artifacts/shots/tracks/suzuka/light-crossover-bridge-dusk.jpg)<br>**Flyover** · trackside · dry · **dusk** | ![Bridge night](../../../artifacts/shots/tracks/suzuka/light-crossover-bridge-night.jpg)<br>**Flyover** · trackside · dry · **night** | ![Bridge dawn](../../../artifacts/shots/tracks/suzuka/light-crossover-bridge-dawn.jpg)<br>**Flyover** · trackside · dry · **dawn** |
| ![Under night](../../../artifacts/shots/tracks/suzuka/light-crossover-under-night.jpg)<br>**Portal** · eye · dry · **night** | ![Casio dusk](../../../artifacts/shots/tracks/suzuka/light-casio-dusk.jpg)<br>**Casio** · trackside · dry · **dusk** | ![Casio night](../../../artifacts/shots/tracks/suzuka/light-casio-night.jpg)<br>**Casio** · trackside · dry · **night** |
| ![Casio dawn](../../../artifacts/shots/tracks/suzuka/light-casio-dawn.jpg)<br>**Casio** · trackside · dry · **dawn** | | |

## Verification

```sh
node tools/track/verify-track.cjs suzuka
node tools/track/audit-circuit.cjs suzuka
```
