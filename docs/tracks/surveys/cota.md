# COTA — circuit survey (2026-10-14)

**Branch:** `cursor/cota-survey-fc61` · **Live:** [brycejmurrin.github.io/f1-game](https://brycejmurrin.github.io/f1-game/)  
**Brief:** `docs/tracks/cota.md` · **Data:** `js/circuits/cota.js` · **Dressing:** `js/circuits/scenery/cota.js`  
**Shots:** `artifacts/shots/tracks/cota/*.jpg` — **36** hero frames (4 views × full weather at day + dawn/dusk/night dry)

## Code map

| Layer | Role |
|--------|------|
| `js/circuits/cota.js` | OSM centreline, `pit: { side: -1 }`, `theme: "green"`, SRTM elevation, `terrainOuter: 60`, sectors/turns, palette |
| `js/circuits/scenery/cota.js` | Lazy `TrackScenery.cota`: grandstands, Big Red, tower + amphitheater, pit garages, barriers, skyline haze |
| `tests/data/landmarks/cota.json` | Heroes: `cota-main-grandstand`, `cota-turn1-big-red`, `cota-amphitheater` |
| `tests/specs/cota-foundation.spec.js` | Terrain-under-road + required models |

## Capture set

- **Tooling:** `node tools/shot/shot.mjs --batch capture-jobs-weather.jsonl --jpeg --present-timeout 90 --capture-retries 4 --wait 120` (SwiftShader default).
- **36 JPEGs** on branch (`git add -f`); max width 1280, q≈80, each &lt;300 KB.
- **Four hero views:** main straight (orbit), Turn 1 (trackside), T12 (trackside), observation tower (orbit).
- **Per view:** `dry`, `wet`, `rain`, `overcast`, `fog`, `storm` at **day**; **dawn / dusk / night** at **dry** only.

### All frames (view · weather · time of day)

| | | |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/cota/hero-main-000-dawn-dry.jpg)<br/>*Main straight · orbit · s≈0.00 · dry · dawn* | ![](../../../artifacts/shots/tracks/cota/hero-main-000-day-dry.jpg)<br/>*Main straight · orbit · s≈0.00 · dry · day* | ![](../../../artifacts/shots/tracks/cota/hero-main-000-day-fog.jpg)<br/>*Main straight · orbit · s≈0.00 · fog · day* |
| ![](../../../artifacts/shots/tracks/cota/hero-main-000-day-overcast.jpg)<br/>*Main straight · orbit · s≈0.00 · overcast · day* | ![](../../../artifacts/shots/tracks/cota/hero-main-000-day-rain.jpg)<br/>*Main straight · orbit · s≈0.00 · rain · day* | ![](../../../artifacts/shots/tracks/cota/hero-main-000-day-storm.jpg)<br/>*Main straight · orbit · s≈0.00 · storm · day* |
| ![](../../../artifacts/shots/tracks/cota/hero-main-000-day-wet.jpg)<br/>*Main straight · orbit · s≈0.00 · wet · day* | ![](../../../artifacts/shots/tracks/cota/hero-main-000-dusk-dry.jpg)<br/>*Main straight · orbit · s≈0.00 · dry · dusk* | ![](../../../artifacts/shots/tracks/cota/hero-main-000-night-dry.jpg)<br/>*Main straight · orbit · s≈0.00 · dry · night* |
| ![](../../../artifacts/shots/tracks/cota/hero-t1-100-dawn-dry.jpg)<br/>*Turn 1 · trackside · s≈0.10 · dry · dawn* | ![](../../../artifacts/shots/tracks/cota/hero-t1-100-day-dry.jpg)<br/>*Turn 1 · trackside · s≈0.10 · dry · day* | ![](../../../artifacts/shots/tracks/cota/hero-t1-100-day-fog.jpg)<br/>*Turn 1 · trackside · s≈0.10 · fog · day* |
| ![](../../../artifacts/shots/tracks/cota/hero-t1-100-day-overcast.jpg)<br/>*Turn 1 · trackside · s≈0.10 · overcast · day* | ![](../../../artifacts/shots/tracks/cota/hero-t1-100-day-rain.jpg)<br/>*Turn 1 · trackside · s≈0.10 · rain · day* | ![](../../../artifacts/shots/tracks/cota/hero-t1-100-day-storm.jpg)<br/>*Turn 1 · trackside · s≈0.10 · storm · day* |
| ![](../../../artifacts/shots/tracks/cota/hero-t1-100-day-wet.jpg)<br/>*Turn 1 · trackside · s≈0.10 · wet · day* | ![](../../../artifacts/shots/tracks/cota/hero-t1-100-dusk-dry.jpg)<br/>*Turn 1 · trackside · s≈0.10 · dry · dusk* | ![](../../../artifacts/shots/tracks/cota/hero-t1-100-night-dry.jpg)<br/>*Turn 1 · trackside · s≈0.10 · dry · night* |
| ![](../../../artifacts/shots/tracks/cota/hero-t12-635-dawn-dry.jpg)<br/>*T12 hairpin · trackside · s≈0.63 · dry · dawn* | ![](../../../artifacts/shots/tracks/cota/hero-t12-635-day-dry.jpg)<br/>*T12 hairpin · trackside · s≈0.63 · dry · day* | ![](../../../artifacts/shots/tracks/cota/hero-t12-635-day-fog.jpg)<br/>*T12 hairpin · trackside · s≈0.63 · fog · day* |
| ![](../../../artifacts/shots/tracks/cota/hero-t12-635-day-overcast.jpg)<br/>*T12 hairpin · trackside · s≈0.63 · overcast · day* | ![](../../../artifacts/shots/tracks/cota/hero-t12-635-day-rain.jpg)<br/>*T12 hairpin · trackside · s≈0.63 · rain · day* | ![](../../../artifacts/shots/tracks/cota/hero-t12-635-day-storm.jpg)<br/>*T12 hairpin · trackside · s≈0.63 · storm · day* |
| ![](../../../artifacts/shots/tracks/cota/hero-t12-635-day-wet.jpg)<br/>*T12 hairpin · trackside · s≈0.63 · wet · day* | ![](../../../artifacts/shots/tracks/cota/hero-t12-635-dusk-dry.jpg)<br/>*T12 hairpin · trackside · s≈0.63 · dry · dusk* | ![](../../../artifacts/shots/tracks/cota/hero-t12-635-night-dry.jpg)<br/>*T12 hairpin · trackside · s≈0.63 · dry · night* |
| ![](../../../artifacts/shots/tracks/cota/hero-tower-780-dawn-dry.jpg)<br/>*Observation tower · orbit · s≈0.78 · dry · dawn* | ![](../../../artifacts/shots/tracks/cota/hero-tower-780-day-dry.jpg)<br/>*Observation tower · orbit · s≈0.78 · dry · day* | ![](../../../artifacts/shots/tracks/cota/hero-tower-780-day-fog.jpg)<br/>*Observation tower · orbit · s≈0.78 · fog · day* |
| ![](../../../artifacts/shots/tracks/cota/hero-tower-780-day-overcast.jpg)<br/>*Observation tower · orbit · s≈0.78 · overcast · day* | ![](../../../artifacts/shots/tracks/cota/hero-tower-780-day-rain.jpg)<br/>*Observation tower · orbit · s≈0.78 · rain · day* | ![](../../../artifacts/shots/tracks/cota/hero-tower-780-day-storm.jpg)<br/>*Observation tower · orbit · s≈0.78 · storm · day* |
| ![](../../../artifacts/shots/tracks/cota/hero-tower-780-day-wet.jpg)<br/>*Observation tower · orbit · s≈0.78 · wet · day* | ![](../../../artifacts/shots/tracks/cota/hero-tower-780-dusk-dry.jpg)<br/>*Observation tower · orbit · s≈0.78 · dry · dusk* | ![](../../../artifacts/shots/tracks/cota/hero-tower-780-night-dry.jpg)<br/>*Observation tower · orbit · s≈0.78 · dry · night* |

### Backlog (from survey)

| Issue | Notes |
|--------|--------|
| Night tower/amphi floods | `furniture.lamp: "none"` — cluster dark except main-straight hand lamps |
| Storm / rain spray | Visible on wet road; watch exposure on tower orbit |
| Pit garage footing | Terrain-footed bays; glass in ground-audit baseline |
| T1 hill physics | `rise: 18` vs ~40 m real — separate physics pass |

## Verification

```text
node tools/track/verify-track.cjs cota          → OK
node tools/track/audit-circuit.cjs cota         → ok (6 checks)
```

## Scenery fixes (this PR)

- `cota-pit-garages` on paddock straight with `terrainYAt` + `seat.box` bays.
- T1 `spectatorHill` rise 1.45 for outer-row grounding.
