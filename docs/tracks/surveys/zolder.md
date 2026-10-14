# Zolder — circuit survey (2026-10-14)

**Layout:** 4.010 km OSM trace (2002–present), 10 turns, clockwise, `theme: green`, day default.  
**Evidence:** `../../../artifacts/shots/tracks/zolder/*.png` (TLX headless, `shot.mjs` batch, local serve :3456); node VM audits.  
**Brief:** `docs/tracks/zolder.md` · **Data:** `js/circuits/zolder.js` · **Dressing:** `js/circuits/scenery/zolder.js`

> **Weather batch capture:** Game supports `raceWeather` `dry|wet|rain|overcast|fog` and `raceTimeOfDay` `day|dawn|dusk|night` (`js/game.js`). Batch **time-of-day** shots below use existing `shot.mjs` `--tod`. **Rain/overcast/fog matrix** is deferred until rebase on the shared tooling PR (*tools: shared shot tooling for circuit surveys*) so `artifacts/shots/tracks/**` can be committed and weather fields apply reliably. Two early `wx-*` frames in this folder were taken during a partial batch before that split; treat as provisional.

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

## Panel grids — by sector (day, dry)

*Sector splits: S1 0–0.36, S2 0.36–0.613, S3 0.613–1 (`sectors` in def).*

### Sector 1 — pit straight, Earste chicane, outer loop entry

| | | |
|:---:|:---:|:---:|
| ![Pit orbit](../../../artifacts/shots/tracks/zolder/s1-01-pit-orbit.png) | ![S/F stand orbit](../../../artifacts/shots/tracks/zolder/s1-02-sf-stand.png) | ![Villeneuve poles](../../../artifacts/shots/tracks/zolder/s1-03-villeneuve-poles.png) |
| `s1-01-pit-orbit` | `s1-02-sf-stand` | `s1-03-villeneuve-poles` |
| ![Earste chicane](../../../artifacts/shots/tracks/zolder/s1-04-earste-chicane.png) | ![T1 orbit](../../../artifacts/shots/tracks/zolder/s1-05-t1-orbit.png) | ![Kanaalbocht](../../../artifacts/shots/tracks/zolder/s1-06-kanaalbocht.png) |
| `s1-04-earste-chicane` | `s1-05-t1-orbit` | `s1-06-kanaalbocht` |
| ![Forest edge](../../../artifacts/shots/tracks/zolder/s1-07-forest-edge.png) | ![S/F stand close](../../../artifacts/shots/tracks/zolder/s1-02b-sf-stand-close.png) | |
| `s1-07-forest-edge` | `s1-02b-sf-stand-close` | |

### Sector 2 — Bianchi, Villeneuve chicane, service, Kleine chicane

| | | |
|:---:|:---:|:---:|
| ![Bianchi](../../../artifacts/shots/tracks/zolder/s2-01-bianchi.png) | ![Villeneuve chicane](../../../artifacts/shots/tracks/zolder/s2-02-villeneuve-chicane.png) | ![Memorial](../../../artifacts/shots/tracks/zolder/s2-03-memorial.png) |
| `s2-01-bianchi` | `s2-02-villeneuve-chicane` | `s2-03-memorial` |
| ![Service area](../../../artifacts/shots/tracks/zolder/s2-04-service-area.png) | ![Kleine chicane](../../../artifacts/shots/tracks/zolder/s2-05-kleine-chicane.png) | ![Villeneuve orbit](../../../artifacts/shots/tracks/zolder/s2-02b-villeneuve-orbit.png) |
| `s2-04-service-area` | `s2-05-kleine-chicane` | `s2-02b-villeneuve-orbit` |

### Sector 3 — back sweepers, hairpin, Terlamen, Rindt

| | | |
|:---:|:---:|:---:|
| ![Back sweeper](../../../artifacts/shots/tracks/zolder/s3-01-back-sweeper.png) | ![Hairpin park](../../../artifacts/shots/tracks/zolder/s3-02-hairpin.png) | ![Fast pine](../../../artifacts/shots/tracks/zolder/s3-03-fast-pine.png) |
| `s3-01-back-sweeper` | `s3-02-hairpin` | `s3-03-fast-pine` |
| ![Terlamen](../../../artifacts/shots/tracks/zolder/s3-04-terlamen.png) | ![Rindt paddock](../../../artifacts/shots/tracks/zolder/s3-05-rindt-paddock.png) | ![Layout high](../../../artifacts/shots/tracks/zolder/s3-06-layout-high.png) |
| `s3-04-terlamen` | `s3-05-rindt-paddock` | `s3-06-layout-high` |
| ![Hairpin orbit](../../../artifacts/shots/tracks/zolder/s3-02b-hairpin-orbit.png) | | |
| `s3-02b-hairpin-orbit` | | |

### Required landmarks (day, dry)

| | | |
|:---:|:---:|:---:|
| ![Museum](../../../artifacts/shots/tracks/zolder/lm-sf-museum.png) | ![Main grandstand](../../../artifacts/shots/tracks/zolder/lm-main-grandstand.png) | ![Sterrenwacht probe](../../../artifacts/shots/tracks/zolder/lm-sterrenwacht-probe.png) |
| `lm-sf-museum` | `lm-main-grandstand` | `lm-sterrenwacht-probe` |
| ![Terril](../../../artifacts/shots/tracks/zolder/lm-terril.png) | | |
| `lm-terril` | | |

---

## Panel grids — time of day (dry; six key views)

| | | |
|:---:|:---:|:---:|
| ![S/F dawn](../../../artifacts/shots/tracks/zolder/tod-sf-dawn.png) | ![S/F dusk](../../../artifacts/shots/tracks/zolder/tod-sf-dusk.png) | ![S/F night](../../../artifacts/shots/tracks/zolder/tod-sf-night.png) |
| S/F `dawn` | S/F `dusk` | S/F `night` |
| ![Poles dusk](../../../artifacts/shots/tracks/zolder/tod-poles-dusk.png) | ![Hairpin dusk](../../../artifacts/shots/tracks/zolder/tod-hairpin-dusk.png) | ![Terlamen night](../../../artifacts/shots/tracks/zolder/tod-terlamen-night.png) |
| Poles `dusk` | Hairpin `dusk` | Terlamen `night` |

### Weather / lighting backlog (post–shared-shot-PR)

| Issue | Notes |
| --- | --- |
| **Missing night lighting** | `furniture.lamp: "none"` — pits and stands are dark at `night`; no floodlight masts. Fix = circuit `lampPost` pass (evaluate lamp cap / lighting-tuner), not shared engine. |
| **Wet road without lamps** | Wet sheen reads on tarmac; run-off sand stays matte — acceptable. Full rain/overcast/fog matrix not re-shot on current `shot.mjs` tip. |
| **Night + fog combo** | Not captured; likely very flat without emissive windows on club buildings. |
| **Sky/fog vs palette** | `pal.fogDensity` 0.003 — overcast/fog need batch weather to validate horizon match. |
| **Z-fighting** | No new coplanar spots vs baseline; tyre self-pair at Villeneuve/hairpin unchanged (structures.js). |

**Provisional wet frames** (re-capture after shared PR): `wx-sf-day-wet.png`, `wx-villeneuve-wet.png`.

---

## Findings (summary)

| Area | Result |
| --- | --- |
| Road | `verify-track` OK; surface folds **0**; min radius 7.28 m @ hw 7.5 m |
| Audits | float 0, clip 0, buried **5** (within baseline 7), flatCoplanar 1 |
| Identity | Sand + pine reads well; four required models present |
| Frame debt | Sterrenwacht model on pit fold — poor T2 sightline (`lm-sterrenwacht-probe` orbit only) |
| Night | Functional sky/dusk grades; **no track lights** (by kit choice) |

## Ranked improvements

1. **Sterrenwacht / start line** — frame probe (`docs/tracks/START-LINES.md`). High value, high risk.  
2. **Weather survey completion** — after shared shot PR: rain/overcast/fog on S/F, Villeneuve, hairpin.  
3. **Optional pit lamps** — sparse `lampPost` on pit straight for night credibility. Medium value, low risk (circuit-only).  
4. **Terril bearing** — reposition when sourced.  
5. **Earste crowdBank burial** — shared `spectatorHill` terrain lift (~0.30 m, within baseline).

## Fixes in this PR (zolder scenery only)

- `clubBuilding` terrain-seated pit offices (buried 7→5 ground-audit).  
- Villeneuve poles plinth seating; S/F `emitOpenStand` plinth +0.03 m.

## Verification

```sh
node tools/track/verify-track.cjs zolder
node tools/track/audit-circuit.cjs zolder
```
