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

- **Tool:** `node tools/shot/shot.mjs --batch` (stock CLI; `tod` only — no `weather` batch field until shared survey tooling lands).
- **Renderer:** TLX / SwiftShader headless; local `npx serve -l 3456`.
- **Count:** 33 JPEG frames under `artifacts/shots/tracks/buddh/` (max width 1280 px, q≈80, target 30–36).
- **Time-of-day:** `day`, `dusk`, `night`, `dawn` on six key landmarks; other sector views **day only**.
- **Weather:** `dry` only in filenames (`*-dry.jpg`). **Deferred:** `wet`, `rain`, `overcast`, `fog`, `storm` (engine supports via `__apex.race(id, tod, wx)` — see `js/race/weather-arc.js` `VALID` list). Re-capture after rebasing on PR *tools: shared shot tooling for circuit surveys*.

**Note:** `night: false` on the def; night TOD still runs for lighting survey — flood lamps and grandstand read darker; no wet-line or storm particles in this pass.

---

## Sector 1 — pit straight, main stand, T1–T3 (s ≈ 0–0.33)

| | | |
|:---:|:---:|:---:|
| ![Overview](../../../artifacts/shots/tracks/buddh/overview-track-picker-day-dry.jpg) | ![Pit day](../../../artifacts/shots/tracks/buddh/s1-pit-day-dry.jpg) | ![Pit dusk](../../../artifacts/shots/tracks/buddh/s1-pit-dusk-dry.jpg) |
| *overview / picker* | *s0.005 pit block* | *pit dusk* |
| ![Grandstand day](../../../artifacts/shots/tracks/buddh/s1-grandstand-day-dry.jpg) | ![Grandstand dusk](../../../artifacts/shots/tracks/buddh/s1-grandstand-dusk-dry.jpg) | ![Grandstand night](../../../artifacts/shots/tracks/buddh/s1-grandstand-night-dry.jpg) |
| *main grandstand* | *golden hour* | *night lamps* |
| ![Grandstand dawn](../../../artifacts/shots/tracks/buddh/s1-grandstand-dawn-dry.jpg) | ![T1 brake day](../../../artifacts/shots/tracks/buddh/s1-t1-brake-day-dry.jpg) | ![T1 dusk](../../../artifacts/shots/tracks/buddh/s1-t1-brake-dusk-dry.jpg) |
| *dawn* | *T1 braking zone* | *T1 dusk* |
| ![T1 night](../../../artifacts/shots/tracks/buddh/s1-t1-brake-night-dry.jpg) | ![T3 day](../../../artifacts/shots/tracks/buddh/s1-t3-day-dry.jpg) | ![Outfield day](../../../artifacts/shots/tracks/buddh/s1-outfield-day-dry.jpg) |
| *T1 night* | *T2–3 infield* | *farmstead / temple band* |
| ![Outfield dusk](../../../artifacts/shots/tracks/buddh/s1-outfield-dusk-dry.jpg) | | |
| *outfield dusk* | | |

---

## Sector 2 — drop and double apex (s ≈ 0.33–0.67)

| | | |
|:---:|:---:|:---:|
| ![T6 day](../../../artifacts/shots/tracks/buddh/s2-t6-day-dry.jpg) | ![Drop day](../../../artifacts/shots/tracks/buddh/s2-drop-day-dry.jpg) | ![Drop dusk](../../../artifacts/shots/tracks/buddh/s2-drop-dusk-dry.jpg) |
| *T6–7 earthwork* | *run into bowl* | *drop dusk* |
| ![Drop night](../../../artifacts/shots/tracks/buddh/s2-drop-night-dry.jpg) | ![Double apex day](../../../artifacts/shots/tracks/buddh/s2-double-apex-day-dry.jpg) | ![Double apex dusk](../../../artifacts/shots/tracks/buddh/s2-double-apex-dusk-dry.jpg) |
| *drop night* | *T10–11 terrace* | *double apex dusk* |
| ![Double apex night](../../../artifacts/shots/tracks/buddh/s2-double-apex-night-dry.jpg) | ![T12 day](../../../artifacts/shots/tracks/buddh/s2-t12-day-dry.jpg) | ![T12 dusk](../../../artifacts/shots/tracks/buddh/s2-t12-dusk-dry.jpg) |
| *double apex night* | *climb out* | *T12 dusk* |

---

## Sector 3 — back straight, east stands, final corner (s ≈ 0.67–1.0)

| | | |
|:---:|:---:|:---:|
| ![Haze day](../../../artifacts/shots/tracks/buddh/s3-haze-day-dry.jpg) | ![Haze dusk](../../../artifacts/shots/tracks/buddh/s3-haze-dusk-dry.jpg) | ![East stands day](../../../artifacts/shots/tracks/buddh/s3-east-stands-day-dry.jpg) |
| *outfield haze band* | *haze dusk* | *east grandstands* |
| ![East dusk](../../../artifacts/shots/tracks/buddh/s3-east-stands-dusk-dry.jpg) | ![East night](../../../artifacts/shots/tracks/buddh/s3-east-stands-night-dry.jpg) | ![Final day](../../../artifacts/shots/tracks/buddh/s3-final-day-dry.jpg) |
| *east dusk* | *east night* | *final corner* |
| ![Final dusk](../../../artifacts/shots/tracks/buddh/s3-final-dusk-dry.jpg) | ![Final night](../../../artifacts/shots/tracks/buddh/s3-final-night-dry.jpg) | ![Main straight day](../../../artifacts/shots/tracks/buddh/s3-main-straight-day-dry.jpg) |
| *final dusk* | *final night* | *main straight* |
| ![Straight dusk](../../../artifacts/shots/tracks/buddh/s3-main-straight-dusk-dry.jpg) | ![Straight night](../../../artifacts/shots/tracks/buddh/s3-main-straight-night-dry.jpg) | |
| *straight dusk* | *straight night* | |

---

## Lighting matrix (key landmarks)

| View | Day | Dusk | Night | Dawn |
|------|-----|------|-------|------|
| Main grandstand | ![](../../../artifacts/shots/tracks/buddh/s1-grandstand-day-dry.jpg) | ![](../../../artifacts/shots/tracks/buddh/s1-grandstand-dusk-dry.jpg) | ![](../../../artifacts/shots/tracks/buddh/s1-grandstand-night-dry.jpg) | ![](../../../artifacts/shots/tracks/buddh/s1-grandstand-dawn-dry.jpg) |
| T1 brake | ![](../../../artifacts/shots/tracks/buddh/s1-t1-brake-day-dry.jpg) | ![](../../../artifacts/shots/tracks/buddh/s1-t1-brake-dusk-dry.jpg) | ![](../../../artifacts/shots/tracks/buddh/s1-t1-brake-night-dry.jpg) | — |
| Double apex | ![](../../../artifacts/shots/tracks/buddh/s2-double-apex-day-dry.jpg) | ![](../../../artifacts/shots/tracks/buddh/s2-double-apex-dusk-dry.jpg) | ![](../../../artifacts/shots/tracks/buddh/s2-double-apex-night-dry.jpg) | — |
| East stands | ![](../../../artifacts/shots/tracks/buddh/s3-east-stands-day-dry.jpg) | ![](../../../artifacts/shots/tracks/buddh/s3-east-stands-dusk-dry.jpg) | ![](../../../artifacts/shots/tracks/buddh/s3-east-stands-night-dry.jpg) | — |
| Final corner | ![](../../../artifacts/shots/tracks/buddh/s3-final-day-dry.jpg) | ![](../../../artifacts/shots/tracks/buddh/s3-final-dusk-dry.jpg) | ![](../../../artifacts/shots/tracks/buddh/s3-final-night-dry.jpg) | — |
| Main straight | ![](../../../artifacts/shots/tracks/buddh/s3-main-straight-day-dry.jpg) | ![](../../../artifacts/shots/tracks/buddh/s3-main-straight-dusk-dry.jpg) | ![](../../../artifacts/shots/tracks/buddh/s3-main-straight-night-dry.jpg) | — |

---

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

### Weather / lighting (deferred capture)

| Condition | Status | Notes |
|-----------|--------|-------|
| Dry + TOD variants | **Captured** (33 frames) | See grids above |
| Wet / rain | **Not captured** | Await shared `shot.mjs` weather batch |
| Overcast / fog / storm | **Not captured** | Same; check fog density vs `pal.fogDensity` on haze band |
| Wet road shader + rain particles | **Not verified** | Backlog: kerb/runoff darkening, spray, sky mismatch |

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
