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

## Capture protocol

- **Tool:** `node tools/shot/shot.mjs --batch` on `origin/cursor/shared-shot-tooling-5b45` (`--weather`, `--tod`, `--jpeg`, `--present-timeout 90`, `--capture-retries 4`, `--wait 120`; SwiftShader default, no `APEX_GL=llvmpipe`).
- **Count:** **34** JPEG frames under `artifacts/shots/tracks/buddh/` (≤1280 px, q≈80, &lt;300 KB each).
- **Hero views (5):** main grandstand, T1 brake, double apex, east stands, final corner — TOD (**dawn/day/dusk/night**) and weather (**wet, rain, overcast, fog, storm** where listed below).
- **Note:** `night: false` on def; night TOD still drives lamp/flood lighting. Labels match filename `{view}-{tod}-{weather}.jpg`.

---

## Survey panels (34 frames)

| | | |
|:---:|:---:|:---:|
| ![overview-track-picker-day-dry.jpg](../../../artifacts/shots/tracks/buddh/overview-track-picker-day-dry.jpg) | ![s1-grandstand-dawn-dry.jpg](../../../artifacts/shots/tracks/buddh/s1-grandstand-dawn-dry.jpg) | ![s1-grandstand-day-dry.jpg](../../../artifacts/shots/tracks/buddh/s1-grandstand-day-dry.jpg) |
| *Track overview · day · dry* | *grandstand · dawn · dry* | *grandstand · day · dry* |

| | | |
|:---:|:---:|:---:|
| ![s1-grandstand-day-fog.jpg](../../../artifacts/shots/tracks/buddh/s1-grandstand-day-fog.jpg) | ![s1-grandstand-day-overcast.jpg](../../../artifacts/shots/tracks/buddh/s1-grandstand-day-overcast.jpg) | ![s1-grandstand-day-rain.jpg](../../../artifacts/shots/tracks/buddh/s1-grandstand-day-rain.jpg) |
| *grandstand · day · fog* | *grandstand · day · overcast* | *grandstand · day · rain* |

| | | |
|:---:|:---:|:---:|
| ![s1-grandstand-day-storm.jpg](../../../artifacts/shots/tracks/buddh/s1-grandstand-day-storm.jpg) | ![s1-grandstand-dusk-dry.jpg](../../../artifacts/shots/tracks/buddh/s1-grandstand-dusk-dry.jpg) | ![s1-grandstand-night-dry.jpg](../../../artifacts/shots/tracks/buddh/s1-grandstand-night-dry.jpg) |
| *grandstand · day · storm* | *grandstand · dusk · dry* | *grandstand · night · dry* |

| | | |
|:---:|:---:|:---:|
| ![s1-t1-brake-day-dry.jpg](../../../artifacts/shots/tracks/buddh/s1-t1-brake-day-dry.jpg) | ![s1-t1-brake-day-overcast.jpg](../../../artifacts/shots/tracks/buddh/s1-t1-brake-day-overcast.jpg) | ![s1-t1-brake-day-rain.jpg](../../../artifacts/shots/tracks/buddh/s1-t1-brake-day-rain.jpg) |
| *t1 brake · day · dry* | *t1 brake · day · overcast* | *t1 brake · day · rain* |

| | | |
|:---:|:---:|:---:|
| ![s1-t1-brake-day-wet.jpg](../../../artifacts/shots/tracks/buddh/s1-t1-brake-day-wet.jpg) | ![s1-t1-brake-dusk-dry.jpg](../../../artifacts/shots/tracks/buddh/s1-t1-brake-dusk-dry.jpg) | ![s1-t1-brake-night-dry.jpg](../../../artifacts/shots/tracks/buddh/s1-t1-brake-night-dry.jpg) |
| *t1 brake · day · wet* | *t1 brake · dusk · dry* | *t1 brake · night · dry* |

| | | |
|:---:|:---:|:---:|
| ![s2-double-apex-day-dry.jpg](../../../artifacts/shots/tracks/buddh/s2-double-apex-day-dry.jpg) | ![s2-double-apex-day-overcast.jpg](../../../artifacts/shots/tracks/buddh/s2-double-apex-day-overcast.jpg) | ![s2-double-apex-day-rain.jpg](../../../artifacts/shots/tracks/buddh/s2-double-apex-day-rain.jpg) |
| *double apex · day · dry* | *double apex · day · overcast* | *double apex · day · rain* |

| | | |
|:---:|:---:|:---:|
| ![s2-double-apex-day-storm.jpg](../../../artifacts/shots/tracks/buddh/s2-double-apex-day-storm.jpg) | ![s2-double-apex-day-wet.jpg](../../../artifacts/shots/tracks/buddh/s2-double-apex-day-wet.jpg) | ![s2-double-apex-dusk-dry.jpg](../../../artifacts/shots/tracks/buddh/s2-double-apex-dusk-dry.jpg) |
| *double apex · day · storm* | *double apex · day · wet* | *double apex · dusk · dry* |

| | | |
|:---:|:---:|:---:|
| ![s2-double-apex-night-dry.jpg](../../../artifacts/shots/tracks/buddh/s2-double-apex-night-dry.jpg) | ![s3-east-stands-day-dry.jpg](../../../artifacts/shots/tracks/buddh/s3-east-stands-day-dry.jpg) | ![s3-east-stands-day-fog.jpg](../../../artifacts/shots/tracks/buddh/s3-east-stands-day-fog.jpg) |
| *double apex · night · dry* | *east stands · day · dry* | *east stands · day · fog* |

| | | |
|:---:|:---:|:---:|
| ![s3-east-stands-day-overcast.jpg](../../../artifacts/shots/tracks/buddh/s3-east-stands-day-overcast.jpg) | ![s3-east-stands-day-rain.jpg](../../../artifacts/shots/tracks/buddh/s3-east-stands-day-rain.jpg) | ![s3-east-stands-dusk-dry.jpg](../../../artifacts/shots/tracks/buddh/s3-east-stands-dusk-dry.jpg) |
| *east stands · day · overcast* | *east stands · day · rain* | *east stands · dusk · dry* |

| | | |
|:---:|:---:|:---:|
| ![s3-east-stands-night-dry.jpg](../../../artifacts/shots/tracks/buddh/s3-east-stands-night-dry.jpg) | ![s3-final-day-dry.jpg](../../../artifacts/shots/tracks/buddh/s3-final-day-dry.jpg) | ![s3-final-day-fog.jpg](../../../artifacts/shots/tracks/buddh/s3-final-day-fog.jpg) |
| *east stands · night · dry* | *final · day · dry* | *final · day · fog* |

| | | |
|:---:|:---:|:---:|
| ![s3-final-day-overcast.jpg](../../../artifacts/shots/tracks/buddh/s3-final-day-overcast.jpg) | ![s3-final-day-rain.jpg](../../../artifacts/shots/tracks/buddh/s3-final-day-rain.jpg) | ![s3-final-dusk-dry.jpg](../../../artifacts/shots/tracks/buddh/s3-final-dusk-dry.jpg) |
| *final · day · overcast* | *final · day · rain* | *final · dusk · dry* |

| | | |
|:---:|:---:|:---:|
| ![s3-final-night-dry.jpg](../../../artifacts/shots/tracks/buddh/s3-final-night-dry.jpg) | | |
| *final · night · dry* | | |



## Findings

### Layout / road (R3)

- `verify-track`: **OK** — `min node radius 7.05 m`, **`surface folds 0`**; `knownTarmacFolds` already empty.
- Residual centreline kink ~s **0.863–0.87** (final-corner exit) remains in data; trial `path.pts` colinear inserts **raised `flatCoplanar` 2→3** (ground audit) — **not shipped**; needs path/terrain pass without loosening baselines.
- `startFrac: 0` not verified vs real S/F (`docs/tracks/START-LINES.md`).

### Scenery / dressing

- **Strengths:** Main grandstand, pit wall, double-apex terrace, east stand pair, rural depth (kilns/pylons/bunds) read in sector passes.
- **Night:** Lamps illuminate straights; outfield stays very dark (expected for `green` theme). No obvious missing emissive on grandstand roof at night in captures.
- **Guard drops:** `runoffApron=2`, `tree=6` (theme/scenery overlap guard) — unchanged band.
- **Clip audit:** **2 severe** (baseline): spectator terrace `addBox` ~s **0.494**; T4–5 scaffold `addCyl` ~s **0.310**. Minor farmstead cone ~s **0.13**.
- **Float / ground:** 0 floating; `flatCoplanar 2` within baseline.

### Weather / lighting (captured)

- Dry + TOD matrix on all five hero views; day-time **rain, overcast, fog, storm, wet** on subsets (see panels).
- **Backlog:** runoff darkening vs wetness on kerbs; storm intensity vs east-stand visibility; fog + `pal.fogDensity` on haze band (no dedicated haze-frame after trim).

### Performance

- Verify build ~1.2 s; props ~240k verts total — normal for dressed classic circuit.

---

## Ranked backlog

| P | Item | Risk | Owner |
|---|------|------|-------|
| P0 | Weather matrix re-shoot (wet/rain/overcast/fog) after shared tooling PR | Low | Survey follow-up |
| P1 | R3 final-corner `path.pts` without `flatCoplanar` regression | Medium | `buddh.js` + engine review |
| P2 | Spectator terrace box overlap (~1.5 m) | Low | `scenery/buddh.js` |
| P3 | T4–5 scaffold vs tyre-wall cylinders (~1.2 m) | Low | `scenery/buddh.js` (gap 38→42 tried; still at baseline severe) |
| P4 | `startFrac` vs real S/F | Medium | def + markings tools |
| P5 | Run-off shelf (fleet V1) | High | `surface.js` |

## Changes in this PR

- **Survey:** this document + 33 PNGs under `artifacts/shots/tracks/buddh/` (force-added until shared `.gitignore` exception merges).
- **Scenery:** T4–5 `scaffoldStand` gap 38→42 m (clip hygiene attempt; severe count still at baseline 2).
- **Path:** no change (R3 trial reverted — ground baseline).

## Verification

```sh
node tools/track/verify-track.cjs buddh
node tools/track/audit-circuit.cjs buddh --json
```
