# Mosport — circuit survey (2026-10-14)

**Branch:** `cursor/mosport-survey-021b` · **Brief:** [`docs/tracks/mosport.md`](../mosport.md) · **Live:** [f1-game on GitHub Pages](https://brycejmurrin.github.io/f1-game/)

Committed captures: `artifacts/shots/tracks/mosport/*.jpg` (JPEG q≈80, max width 1280px). **Weather** variants (wet / overcast / fog / rain) deferred until rebase on the shared shot-tooling PR; all frames here are **dry** with **time-of-day** where noted.

---

## Code map

| Layer | Path | Role |
|--------|------|------|
| Registry | `js/track/tracks.js` | `Tracks.LIST`; lazy scenery |
| Def | `js/circuits/mosport.js` | OSM centreline, `sectors` [0.334, 0.666], `theme: "green"`, `night: false`, `lamp: "none"` |
| Scenery | `js/circuits/scenery/mosport.js` | Landmarks + lap dressing per brief §4 |
| Landmarks | `tests/data/landmarks/mosport.json` | pit garages, Moss bank, Whites tunnel, Event Centre |

**Sectors (clockwise racing `s`):** S1 `s < 0.334` · S2 `0.334–0.666` · S3 `s ≥ 0.666`

---

## Theme and models

Green Ontario summer; mixed woodland on −1; club-scale pit block and Event Centre; `modelGroup` heroes at Moss and Whites; moraine `mountain()` horizon belt.

---

## Findings (summary)

| # | Issue | Severity |
|---|--------|----------|
| 1 | `trackside` at start/finish sits inside `grandstandEx` shell — use orbit/park | Fixed: stands pushed to gap 30/28 |
| 2 | Night TOD very dark (`lamp: "none"`, `night: false`) | Expected; note for weather PR |
| 3 | Weather matrix not shot yet | Follow-up after shared tooling PR |
| 4 | Whites −1 apron | Fixed: tarmac `groundPatch` |
| 5 | `flatCoplanar` 1 tyreWall pair | Fleet baseline; do not loosen |

**Verify:** `node tools/track/verify-track.cjs mosport` · `node tools/track/audit-circuit.cjs mosport`

---

## Ranked backlog

1. Weather/lighting batch (wet, overcast, fog, rain) after shot PR rebase  
2. Optional floodlights on main straight (design)  
3. Event Centre sightline from pit straight  

---

## Panel grid — track picker and sectors (view · dry · day)

| | | |
|:---:|:---:|:---:|
| ![Picker](../../../artifacts/shots/tracks/mosport/00-track-picker-still.jpg)<br>picker · dry · day | ![S1 pit](../../../artifacts/shots/tracks/mosport/sector-s1-pit-day-dry.jpg)<br>pit paddock orbit · dry · day | ![S1 start](../../../artifacts/shots/tracks/mosport/sector-s1-start-day-dry.jpg)<br>start/finish orbit · dry · day |
| ![S1 T1](../../../artifacts/shots/tracks/mosport/sector-s1-turn1-day-dry.jpg)<br>Turn 1 park · dry · day | ![S1 Clayton appr.](../../../artifacts/shots/tracks/mosport/sector-s1-clayton-approach-day-dry.jpg)<br>Clayton approach orbit · dry · day | ![S2 Clayton](../../../artifacts/shots/tracks/mosport/sector-s2-clayton-day-dry.jpg)<br>Clayton T2 park · dry · day |
| ![S2 Quebec](../../../artifacts/shots/tracks/mosport/sector-s2-quebec-day-dry.jpg)<br>Quebec trackside · dry · day | ![S2 Moss run](../../../artifacts/shots/tracks/mosport/sector-s2-moss-run-day-dry.jpg)<br>run to Moss cinematic · dry · day | ![S2 Moss](../../../artifacts/shots/tracks/mosport/sector-s2-moss-bank-day-dry.jpg)<br>Moss bank orbit · dry · day |
| ![S3 Andretti](../../../artifacts/shots/tracks/mosport/sector-s3-andretti-day-dry.jpg)<br>Andretti park · dry · day | ![S3 farm](../../../artifacts/shots/tracks/mosport/sector-s3-farmland-day-dry.jpg)<br>farmland eye · dry · day | ![S3 Esses](../../../artifacts/shots/tracks/mosport/sector-s3-esses-day-dry.jpg)<br>Esses park · dry · day |
| ![S3 Whites](../../../artifacts/shots/tracks/mosport/sector-s3-whites-tunnel-day-dry.jpg)<br>Whites tunnel orbit · dry · day | ![S3 Event](../../../artifacts/shots/tracks/mosport/sector-s3-event-centre-day-dry.jpg)<br>Event Centre orbit · dry · day | |

---

## Panel grid — lighting variants (dry weather; time of day)

### Pit `s≈0.005` — orbit

| | | |
|:---:|:---:|:---:|
| ![pit day](../../../artifacts/shots/tracks/mosport/wx-pit-day-dry.jpg)<br>pit orbit · dry · **day** | ![pit dusk](../../../artifacts/shots/tracks/mosport/wx-pit-dusk-dry.jpg)<br>pit orbit · dry · **dusk** | ![pit dawn](../../../artifacts/shots/tracks/mosport/wx-pit-dawn-dry.jpg)<br>pit orbit · dry · **dawn** |
| ![pit night](../../../artifacts/shots/tracks/mosport/light-pit-night-dry.jpg)<br>pit orbit · dry · **night** | | |

### Clayton `s≈0.1817` — park

| | | |
|:---:|:---:|:---:|
| ![clay day](../../../artifacts/shots/tracks/mosport/wx-clayton-day-dry.jpg)<br>Clayton park · dry · **day** | ![clay dusk](../../../artifacts/shots/tracks/mosport/wx-clayton-dusk-dry.jpg)<br>Clayton park · dry · **dusk** | ![clay dawn](../../../artifacts/shots/tracks/mosport/wx-clayton-dawn-dry.jpg)<br>Clayton park · dry · **dawn** |
| ![clay night](../../../artifacts/shots/tracks/mosport/light-clayton-night-dry.jpg)<br>Clayton park · dry · **night** | | |

### Moss `s≈0.4817` — orbit +1

| | | |
|:---:|:---:|:---:|
| ![moss day](../../../artifacts/shots/tracks/mosport/wx-moss-day-dry.jpg)<br>Moss orbit · dry · **day** | ![moss dusk](../../../artifacts/shots/tracks/mosport/wx-moss-dusk-dry.jpg)<br>Moss orbit · dry · **dusk** | ![moss dawn](../../../artifacts/shots/tracks/mosport/wx-moss-dawn-dry.jpg)<br>Moss orbit · dry · **dawn** |
| ![moss night](../../../artifacts/shots/tracks/mosport/light-moss-night-dry.jpg)<br>Moss orbit · dry · **night** | | |

### Andretti `s≈0.66` — park

| | | |
|:---:|:---:|:---:|
| ![and day](../../../artifacts/shots/tracks/mosport/wx-andretti-day-dry.jpg)<br>Andretti park · dry · **day** | ![and dusk](../../../artifacts/shots/tracks/mosport/light-andretti-dusk-dry.jpg)<br>Andretti park · dry · **dusk** | ![and dawn](../../../artifacts/shots/tracks/mosport/light-andretti-dawn-dry.jpg)<br>Andretti park · dry · **dawn** |
| ![and night](../../../artifacts/shots/tracks/mosport/light-andretti-night-dry.jpg)<br>Andretti park · dry · **night** | | |

### Whites `s≈0.9183` — orbit

| | | |
|:---:|:---:|:---:|
| ![wh day](../../../artifacts/shots/tracks/mosport/sector-s3-whites-tunnel-day-dry.jpg)<br>Whites orbit · dry · **day** | ![wh dusk](../../../artifacts/shots/tracks/mosport/light-whites-dusk-dry.jpg)<br>Whites orbit · dry · **dusk** | ![wh dawn](../../../artifacts/shots/tracks/mosport/light-whites-dawn-dry.jpg)<br>Whites orbit · dry · **dawn** |
| ![wh night](../../../artifacts/shots/tracks/mosport/light-whites-night-dry.jpg)<br>Whites orbit · dry · **night** | | |

---

## Fixes on this branch

`js/circuits/scenery/mosport.js` — start/finish grandstand gap; Whites −1 apron; spectator hill gap (ground-audit).
