# Zolder — circuit survey (2026-10-14)

**Layout:** 4.010 km OSM trace (2002–present), 10 turns, clockwise, `theme: green`, day default.  
**Evidence:** `../../../artifacts/shots/tracks/zolder/*.jpg` (TLX headless, `shot.mjs --batch` with `--weather` / `--tod`, SwiftShader, serve :3456); node VM audits.  
**Brief:** `docs/tracks/zolder.md` · **Data:** `js/circuits/zolder.js` · **Dressing:** `js/circuits/scenery/zolder.js`

## Code map

| Piece | Role |
| --- | --- |
| `js/circuits/zolder.js` | `TrackDefs` entry: OSM centreline, `startFrac: 0.1226`, `sceneryStartFrac: 0`, `ownPitStraight: true`, `terrainOuter: 110`, Limburg palette, 10 `turns[]` apex fractions, `furniture.tree: "fir"`, `furniture.lamp: "none"`. |
| `js/circuits/scenery/zolder.js` | Lazy `TrackScenery.zolder(api)` — global heath, 16 named blocks, fast sweeper pass, terril `mountain()`. |
| `js/track/tracks.js` | `Tracks.LIST` registration; `buildProps` → scenery closure. |
| `tests/data/landmarks/zolder.json` | Required models: `zolder-main-grandstand`, `zolder-sf-museum`, `zolder-villeneuve-poles`, `zolder-sterrenwacht`. |
| Frame debt | `_sceneryShift ≈ 0.844`: pit/S/F use `sl()`; corners use authored `K()`. |

## Theme and models

Pale sand + Scots pine heath; club greys; four required landmarks; distant mine terril (`mountain()` ~s 0.14). No circuit floodlight masts (`lamp: "none"`).

---

## Panel grids (36 JPEGs, ≤1280px, q≈80)

Committed on branch `cursor/zolder-survey-696f` under `artifacts/shots/tracks/zolder/`. PR review uses [raw GitHub URLs](https://raw.githubusercontent.com/brycejmurrin/f1-game/cursor/zolder-survey-696f/artifacts/shots/tracks/zolder/).

#### Sector coverage (day / dry)

| ![Pit straight (orbit)](../../../artifacts/shots/tracks/zolder/s1-01-pit-orbit.jpg)<br>**Pit straight (orbit)** · wx dry · day<br>`s1-01-pit-orbit.jpg` | ![S/F tribune (orbit)](../../../artifacts/shots/tracks/zolder/s1-02-sf-stand.jpg)<br>**S/F tribune (orbit)** · wx dry · day<br>`s1-02-sf-stand.jpg` | ![Villeneuve paddock poles](../../../artifacts/shots/tracks/zolder/s1-03-villeneuve-poles.jpg)<br>**Villeneuve paddock poles** · wx dry · day<br>`s1-03-villeneuve-poles.jpg` |
| --- | --- | --- |
| ![Earste chicane T1 (park)](../../../artifacts/shots/tracks/zolder/s1-04-earste-chicane.jpg)<br>**Earste chicane T1 (park)** · wx dry · day<br>`s1-04-earste-chicane.jpg` | ![Kanaalbocht T3 (park)](../../../artifacts/shots/tracks/zolder/s1-06-kanaalbocht.jpg)<br>**Kanaalbocht T3 (park)** · wx dry · day<br>`s1-06-kanaalbocht.jpg` | ![Lucien Bianchi T4 (park)](../../../artifacts/shots/tracks/zolder/s2-01-bianchi.jpg)<br>**Lucien Bianchi T4 (park)** · wx dry · day<br>`s2-01-bianchi.jpg` |
| --- | --- | --- |
| ![Villeneuve chicane T5 (trackside)](../../../artifacts/shots/tracks/zolder/s2-02-villeneuve-chicane.jpg)<br>**Villeneuve chicane T5 (trackside)** · wx dry · day<br>`s2-02-villeneuve-chicane.jpg` | ![Kleine chicane T6 (park)](../../../artifacts/shots/tracks/zolder/s2-05-kleine-chicane.jpg)<br>**Kleine chicane T6 (park)** · wx dry · day<br>`s2-05-kleine-chicane.jpg` | ![Bolderberg hairpin T7 (park)](../../../artifacts/shots/tracks/zolder/s3-02-hairpin.jpg)<br>**Bolderberg hairpin T7 (park)** · wx dry · day<br>`s3-02-hairpin.jpg` |
| --- | --- | --- |
| ![Terlamen T8 (trackside)](../../../artifacts/shots/tracks/zolder/s3-04-terlamen.jpg)<br>**Terlamen T8 (trackside)** · wx dry · day<br>`s3-04-terlamen.jpg` | ![Full layout (high orbit)](../../../artifacts/shots/tracks/zolder/s3-06-layout-high.jpg)<br>**Full layout (high orbit)** · wx dry · day<br>`s3-06-layout-high.jpg` |    |
| --- | --- | --- |

#### Landmarks (day / dry)

| ![S/F museum hall](../../../artifacts/shots/tracks/zolder/lm-sf-museum.jpg)<br>**S/F museum hall** · wx dry · day<br>`lm-sf-museum.jpg` | ![Permanent grandstand](../../../artifacts/shots/tracks/zolder/lm-main-grandstand.jpg)<br>**Permanent grandstand** · wx dry · day<br>`lm-main-grandstand.jpg` | ![Mine terril skyline](../../../artifacts/shots/tracks/zolder/lm-terril.jpg)<br>**Mine terril skyline** · wx dry · day<br>`lm-terril.jpg` |
| --- | --- | --- |

#### Time-of-day (dry)

| ![S/F tribune (orbit)](../../../artifacts/shots/tracks/zolder/tod-sf-dawn.jpg)<br>**S/F tribune (orbit)** · wx dry · dawn<br>`tod-sf-dawn.jpg` | ![S/F tribune (orbit)](../../../artifacts/shots/tracks/zolder/tod-sf-dusk.jpg)<br>**S/F tribune (orbit)** · wx dry · dusk<br>`tod-sf-dusk.jpg` | ![S/F tribune (orbit)](../../../artifacts/shots/tracks/zolder/tod-sf-night.jpg)<br>**S/F tribune (orbit)** · wx dry · night<br>`tod-sf-night.jpg` |
| --- | --- | --- |
| ![Villeneuve poles (trackside)](../../../artifacts/shots/tracks/zolder/tod-poles-dusk.jpg)<br>**Villeneuve poles (trackside)** · wx dry · dusk<br>`tod-poles-dusk.jpg` | ![Hairpin (park)](../../../artifacts/shots/tracks/zolder/tod-hairpin-dusk.jpg)<br>**Hairpin (park)** · wx dry · dusk<br>`tod-hairpin-dusk.jpg` | ![Terlamen (trackside)](../../../artifacts/shots/tracks/zolder/tod-terlamen-night.jpg)<br>**Terlamen (trackside)** · wx dry · night<br>`tod-terlamen-night.jpg` |
| --- | --- | --- |

#### Weather — S/F tribune (orbit)

| ![S/F tribune (orbit)](../../../artifacts/shots/tracks/zolder/wx-sf-day-wet.jpg)<br>**S/F tribune (orbit)** · wx wet · day<br>`wx-sf-day-wet.jpg` | ![S/F tribune (orbit)](../../../artifacts/shots/tracks/zolder/wx-sf-day-rain.jpg)<br>**S/F tribune (orbit)** · wx rain · day<br>`wx-sf-day-rain.jpg` | ![S/F tribune (orbit)](../../../artifacts/shots/tracks/zolder/wx-sf-day-overcast.jpg)<br>**S/F tribune (orbit)** · wx overcast · day<br>`wx-sf-day-overcast.jpg` |
| --- | --- | --- |
| ![S/F tribune (orbit)](../../../artifacts/shots/tracks/zolder/wx-sf-day-fog.jpg)<br>**S/F tribune (orbit)** · wx fog · day<br>`wx-sf-day-fog.jpg` | ![S/F tribune (orbit)](../../../artifacts/shots/tracks/zolder/wx-sf-day-storm.jpg)<br>**S/F tribune (orbit)** · wx storm · day<br>`wx-sf-day-storm.jpg` |    |
| --- | --- | --- |

#### Weather — Villeneuve chicane (trackside)

| ![Villeneuve chicane (trackside)](../../../artifacts/shots/tracks/zolder/wx-villeneuve-wet.jpg)<br>**Villeneuve chicane (trackside)** · wx wet · day<br>`wx-villeneuve-wet.jpg` | ![Villeneuve chicane (trackside)](../../../artifacts/shots/tracks/zolder/wx-villeneuve-rain.jpg)<br>**Villeneuve chicane (trackside)** · wx rain · day<br>`wx-villeneuve-rain.jpg` | ![Villeneuve chicane (trackside)](../../../artifacts/shots/tracks/zolder/wx-villeneuve-overcast.jpg)<br>**Villeneuve chicane (trackside)** · wx overcast · day<br>`wx-villeneuve-overcast.jpg` |
| --- | --- | --- |
| ![Villeneuve chicane (trackside)](../../../artifacts/shots/tracks/zolder/wx-villeneuve-fog.jpg)<br>**Villeneuve chicane (trackside)** · wx fog · day<br>`wx-villeneuve-fog.jpg` | ![Villeneuve chicane (trackside)](../../../artifacts/shots/tracks/zolder/wx-villeneuve-storm.jpg)<br>**Villeneuve chicane (trackside)** · wx storm · day<br>`wx-villeneuve-storm.jpg` |    |
| --- | --- | --- |

#### Weather — Hairpin (park)

| ![Hairpin (park)](../../../artifacts/shots/tracks/zolder/wx-hairpin-wet.jpg)<br>**Hairpin (park)** · wx wet · day<br>`wx-hairpin-wet.jpg` | ![Hairpin (park)](../../../artifacts/shots/tracks/zolder/wx-hairpin-rain.jpg)<br>**Hairpin (park)** · wx rain · day<br>`wx-hairpin-rain.jpg` | ![Hairpin (park)](../../../artifacts/shots/tracks/zolder/wx-hairpin-fog.jpg)<br>**Hairpin (park)** · wx fog · day<br>`wx-hairpin-fog.jpg` |
| --- | --- | --- |
| ![Hairpin (park)](../../../artifacts/shots/tracks/zolder/wx-hairpin-storm.jpg)<br>**Hairpin (park)** · wx storm · day<br>`wx-hairpin-storm.jpg` |    |    |
| --- | --- | --- |

#### Weather — Terlamen (trackside)

| ![Terlamen (trackside)](../../../artifacts/shots/tracks/zolder/wx-terlamen-wet.jpg)<br>**Terlamen (trackside)** · wx wet · day<br>`wx-terlamen-wet.jpg` | ![Terlamen (trackside)](../../../artifacts/shots/tracks/zolder/wx-terlamen-rain.jpg)<br>**Terlamen (trackside)** · wx rain · day<br>`wx-terlamen-rain.jpg` |    |
| --- | --- | --- |

## Weather / lighting backlog

| Issue | Notes |
| --- | --- |
| **Missing night lighting** | `furniture.lamp: "none"` — pits and stands are dark at `night`; optional future `lampPost` pass in `zolder.js` only. |
| **Night + fog combo** | Not captured (day weather matrix complete on four hero views). |
| **Z-fighting** | No new coplanar spots vs baseline. |

## Findings (summary)

| Area | Result |
| --- | --- |
| Road | `verify-track` OK; surface folds **0** |
| Audits | float 0, clip 0, buried **5** (within baseline 7) |
| Identity | Sand + pine reads well; four required models present |
| Frame debt | Sterrenwacht on pit fold — poor T2 sightline |

## Ranked improvements

1. **Sterrenwacht / start line** — frame probe. High value, high risk.  
2. **Night + fog combo** — optional extra frame if lamps added.  
3. **Optional pit lamps** — circuit-only.  
4. **Terril bearing** — when sourced.  

## Fixes in this PR (zolder scenery only)

- `clubBuilding` terrain-seated pit offices.  
- Villeneuve poles plinth seating; S/F `emitOpenStand` plinth +0.03 m.

## Verification

```sh
node tools/track/verify-track.cjs zolder
node tools/track/audit-circuit.cjs zolder
```
