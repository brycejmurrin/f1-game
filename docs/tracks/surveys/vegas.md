# Las Vegas GP — circuit survey (`vegas`)

**Date:** 2026-10-14  
**Branch:** `cursor/vegas-survey-b8a0`  
**Brief:** [`docs/tracks/vegas.md`](../vegas.md)  
**Data:** `js/circuits/vegas.js` · `js/circuits/scenery/vegas.js` (lazy `TrackScenery.vegas`)  
**Hero models:** `tests/data/landmarks/vegas.json` (`vegas-sphere`, `vegas-wynn-encore`, `vegas-caesars`, `vegas-bellagio`, `vegas-paris-balloon`, `vegas-grand-prix-plaza`)

**Shots:** 35 JPEGs in [`artifacts/shots/tracks/vegas/`](../../../artifacts/shots/tracks/vegas/) (1280px max, q≈80). Captured headless GLX (`webgl2`, `APEX_GL=llvmpipe`).

## Code map

| Layer | Role |
|--------|------|
| `js/circuits/vegas.js` | OSM centreline, `startFrac` 0.9899, `sceneryStartFrac` 0.8575, `sceneryCoordinates: "racing"`, `theme: street_night`, `night: true`, desert `terrainMat: SAND`, `dressingExclusions` for hand-built Strip/Sphere windows |
| `js/circuits/scenery/vegas.js` | All dressing: `sl(f)` racing-frame helper (`SL ≈ 0.1567`), landmarks, Strip canyon densify (racing 0.485–0.815), lamps, neon verges, `overheadSpan` gateway + finish halo |
| `js/track/tracks.js` | Registers def; builds props via `def.scenery(api)` after generic city/foliage pass |
| Engine | `building()` / `cityFront` for generic massing; exclusions prevent double-fill in Strip/Sphere sectors |

**Sector splits (racing arc):** FIA lines at `sectors: [0.291, 0.62]` → S1 pit/Koval/T5, S2 Sphere loop → Venetian entry, S3 Strip southbound → Harmon chicane → S/F.

## Theme and models

- **Palette:** near-black sky/asphalt; neon magenta/cyan/gold on barriers, hoardings, and facades (`docs/tracks/vegas.md` §2).
- **Required `modelGroup` heroes:** Sphere (LED frustum stack), Wynn/Encore twins, Caesars ivory mass, Bellagio + `waterSurface` lakes + fountain jets, Paris Montgolfier balloon, Grand Prix Plaza glass podium.
- **High Roller:** `ferrisWheel` + `vegas-high-roller` model (runtime required; not in landmarks batch window).
- **Perf:** ~343k prop tris after compaction; heaviest circuit in fleet.

## Node audits (2026-10-14)

```
verify-track.cjs vegas → OK (0 surface folds; palm guard drops 6)
audit-circuit.cjs vegas → OK (float 0, clip 0, ground within baseline, coplanar 12/12 cap)
```

## Findings (visual + weather)

| ID | Severity | Topic | Evidence | Notes |
|----|----------|--------|----------|-------|
| V1 | Low | Day + rain sky | `wx-sphere-day-rain.jpg` | `street_night` circuit under `day`/`rain` blows out sky; Sphere reads flat — expect engine/theme blend, not scenery-only |
| V2 | Low | Fog density | `wx-pit-dawn-fog.jpg`, `wx-strip-mid-dawn-fog.jpg` | Heavy ground fog at dawn; landmarks remain readable; no z-fight observed |
| V3 | Low | Overcast flattening | `wx-bellagio-day-overcast.jpg` | Grey sky + muted neon; distant Sphere silhouette visible from Strip — acceptable depth cue |
| V4 | Info | Palm guard drops | verify-track | Six Strip `palm()` still suppressed (hoarding clearance); gap nudged 22→25 m in scenery (2026-10-14) — count unchanged, kept for setback |
| V5 | Info | Night wet Strip | `wx-strip-mid-night-rain.jpg` | Rain streaks + wet sheen on tarmac; barrier neon still pops |
| V6 | None | Geometry | audits | No float/clip/ground regressions; 12 coplanar spots at baseline |

## Ranked improvements (backlog)

1. **After shared shot PR:** Re-run weather matrix with `weather` batch field (4 anchors × dry/overcast/rain/fog × day/dusk/night).
2. **Day/rain sky (V1):** Tune circuit `pal` / theme hooks when engine exposes per-weather presets (avoid whiteout at Sphere).
3. **Palm drops (V4):** Re-audit after hoarding mesh tweak or sparser palm cadence on Strip (do not weaken guards).
4. **Strip gateway readability:** Orbit framing at `sl(0.66)` — `s3-strip-gateway-orbit.jpg`.
5. **High Roller:** Optional landmarks.json registration when batch window allows.

## Fix applied this branch

- Strip palm setback +2–3 m past neon hoarding (`js/circuits/scenery/vegas.js`, survey 2026-10-14) — guard drop count unchanged; keeps palms off barrier band.

---

## Sector panels (weather: dry · time: night)

### Sector 1 — Pit / Koval / T5 (`s ≈ 0.00–0.29`)

| | | |
|:---:|:---:|:---:|
| ![Pit plaza orbit](../../../artifacts/shots/tracks/vegas/s1-pit-plaza.jpg) | ![Main stand chase](../../../artifacts/shots/tracks/vegas/s1-main-stand.jpg) | ![T5 approach](../../../artifacts/shots/tracks/vegas/s1-t5-approach.jpg) |
| Pit plaza · orbit · night · dry | Main stand · chase · night · dry | T5 · chase · night · dry |
| ![Koval right](../../../artifacts/shots/tracks/vegas/s1-koval-right.jpg) | | |
| Koval T5 · orbit · night · dry | | |

### Sector 2 — Sphere loop / Venetian (`s ≈ 0.29–0.62`)

| | | |
|:---:|:---:|:---:|
| ![Sphere orbit](../../../artifacts/shots/tracks/vegas/s2-sphere-orbit.jpg) | ![Sphere chicane](../../../artifacts/shots/tracks/vegas/s2-sphere-chicane.jpg) | ![Wynn Encore](../../../artifacts/shots/tracks/vegas/s2-wynn-encore.jpg) |
| MSG Sphere · orbit · night · dry | Sphere chicane · chase · night · dry | Wynn/Encore · orbit · night · dry |
| ![Venetian entry](../../../artifacts/shots/tracks/vegas/s2-venetian-entry.jpg) | | |
| Venetian · chase · night · dry | | |

### Sector 3 — Strip / Harmon / S/F (`s ≈ 0.62–1.00`)

| | | |
|:---:|:---:|:---:|
| ![High Roller](../../../artifacts/shots/tracks/vegas/s3-high-roller.jpg) | ![Strip gateway chase](../../../artifacts/shots/tracks/vegas/s3-strip-gateway.jpg) | ![Strip gateway orbit](../../../artifacts/shots/tracks/vegas/s3-strip-gateway-orbit.jpg) |
| High Roller · orbit · night · dry | Strip gateway · chase · night · dry | Strip gateway · orbit · night · dry |
| ![Caesars](../../../artifacts/shots/tracks/vegas/s3-caesars.jpg) | ![Bellagio](../../../artifacts/shots/tracks/vegas/s3-bellagio.jpg) | ![Paris Eiffel](../../../artifacts/shots/tracks/vegas/s3-paris-eiffel.jpg) |
| Caesars · chase · night · dry | Bellagio · chase · night · dry | Paris/Eiffel · orbit · night · dry |
| ![Strip straight](../../../artifacts/shots/tracks/vegas/s3-strip-straight.jpg) | ![Harmon chicane](../../../artifacts/shots/tracks/vegas/s3-harmon-chicane.jpg) | ![Start/finish](../../../artifacts/shots/tracks/vegas/s3-start-finish.jpg) |
| Strip straight · chase · night · dry | Harmon chicane · chase · night · dry | S/F · orbit · night · dry |

---

## Weather / lighting matrix (4 anchors)

Anchors: **pit** `s≈0.02`, **Sphere** `s≈0.28`, **Strip mid** `s≈0.50`, **Bellagio** `s≈0.68`.  
API: `__apex.weather('dry'|'overcast'|'rain'|'fog')`, `__apex.setTimeOfDay('day'|'dawn'|'dusk'|'night')` ([`docs/DEBUG-HOOKS.md`](../../DEBUG-HOOKS.md)).

### Pit plaza

| | | |
|:---:|:---:|:---:|
| ![Pit overcast](../../../artifacts/shots/tracks/vegas/wx-pit-day-overcast.jpg) | ![Pit rain](../../../artifacts/shots/tracks/vegas/wx-pit-day-rain.jpg) | ![Pit fog](../../../artifacts/shots/tracks/vegas/wx-pit-dawn-fog.jpg) |
| Pit · orbit · day · overcast | Pit · orbit · day · rain | Pit · orbit · dawn · fog |
| ![Pit dusk](../../../artifacts/shots/tracks/vegas/wx-pit-dusk-dry.jpg) | | |
| Pit · orbit · dusk · dry | | |

### MSG Sphere

| | | |
|:---:|:---:|:---:|
| ![Sphere day dry](../../../artifacts/shots/tracks/vegas/wx-sphere-day-dry.jpg) | ![Sphere overcast](../../../artifacts/shots/tracks/vegas/wx-sphere-day-overcast.jpg) | ![Sphere rain](../../../artifacts/shots/tracks/vegas/wx-sphere-day-rain.jpg) |
| Sphere · orbit · day · dry | Sphere · orbit · day · overcast | Sphere · orbit · day · rain |
| ![Sphere fog](../../../artifacts/shots/tracks/vegas/wx-sphere-dawn-fog.jpg) | | |
| Sphere · orbit · dawn · fog | | |

### Strip mid (Las Vegas Blvd)

| | | |
|:---:|:---:|:---:|
| ![Strip day dry](../../../artifacts/shots/tracks/vegas/wx-strip-mid-day-dry.jpg) | ![Strip overcast](../../../artifacts/shots/tracks/vegas/wx-strip-mid-day-overcast.jpg) | ![Strip rain day](../../../artifacts/shots/tracks/vegas/wx-strip-mid-day-rain.jpg) |
| Strip mid · chase · day · dry | Strip mid · chase · day · overcast | Strip mid · chase · day · rain |
| ![Strip fog](../../../artifacts/shots/tracks/vegas/wx-strip-mid-dawn-fog.jpg) | ![Strip dusk](../../../artifacts/shots/tracks/vegas/wx-strip-dusk-dry.jpg) | ![Strip night rain](../../../artifacts/shots/tracks/vegas/wx-strip-mid-night-rain.jpg) |
| Strip mid · chase · dawn · fog | Strip mid · chase · dusk · dry | Strip mid · chase · night · rain |

### Bellagio / fountains

| | | |
|:---:|:---:|:---:|
| ![Bellagio overcast](../../../artifacts/shots/tracks/vegas/wx-bellagio-day-overcast.jpg) | ![Bellagio rain](../../../artifacts/shots/tracks/vegas/wx-bellagio-day-rain.jpg) | ![Bellagio fog](../../../artifacts/shots/tracks/vegas/wx-bellagio-dawn-fog.jpg) |
| Bellagio · chase · day · overcast | Bellagio · chase · day · rain | Bellagio · chase · dawn · fog |
| ![Bellagio night](../../../artifacts/shots/tracks/vegas/wx-bellagio-night-dry.jpg) | | |
| Bellagio · chase · night · dry | | |

---

## Capture manifest

**35** committed JPEGs under `artifacts/shots/tracks/vegas/`. Optional re-capture after shared shot-tooling PR (batch `weather` + retries).
