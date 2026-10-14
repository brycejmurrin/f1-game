# Las Vegas GP — circuit survey (`vegas`)

**Date:** 2026-10-14  
**Branch:** `cursor/vegas-survey-b8a0`  
**Brief:** [`docs/tracks/vegas.md`](../vegas.md)  
**Data:** `js/circuits/vegas.js` · `js/circuits/scenery/vegas.js` (lazy `TrackScenery.vegas`)  
**Hero models:** `tests/data/landmarks/vegas.json` (`vegas-sphere`, `vegas-wynn-encore`, `vegas-caesars`, `vegas-bellagio`, `vegas-paris-balloon`, `vegas-grand-prix-plaza`)

Screenshots live under `artifacts/shots/tracks/vegas/` (committed once the shared survey tooling PR adds the `artifacts/shots/tracks/**` gitignore exception). Captured headless GLX (`--backend webgl2`, `APEX_GL=llvmpipe`), 1280×720, night default TOD unless noted.

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
- **Perf:** ~343k prop tris after compaction; heaviest circuit in fleet — expect long single-browser capture (~35 frames ≈ 1 h wall on SwiftShader; ~35 min with llvmpipe batch).

## Node audits (2026-10-14)

```
verify-track.cjs vegas → OK (0 surface folds; palm guard drops 6)
audit-circuit.cjs vegas → OK (float 0, clip 0, ground within baseline, coplanar 12/12 cap)
```

## Findings (visual + weather)

| ID | Severity | Topic | Evidence | Notes |
|----|----------|--------|----------|-------|
| V1 | Low | Day + rain sky | `wx-sphere-day-rain.png` | `street_night` circuit under `day`/`rain` blows out sky; Sphere reads flat — expect engine/theme blend, not scenery-only |
| V2 | Low | Fog density | `wx-pit-dawn-fog.png`, `wx-strip-mid-dawn-fog.png` | Heavy ground fog at dawn; landmarks remain readable; no z-fight observed |
| V3 | Low | Overcast flattening | `wx-bellagio-day-overcast.png` | Grey sky + muted neon; distant Sphere silhouette visible from Strip — acceptable depth cue |
| V4 | Info | Palm guard drops | verify-track | Six Strip `palm()` still suppressed (hoarding clearance); gap nudged 22→25 m in scenery (2026-10-14) — count unchanged, kept for setback |
| V5 | Info | Night wet Strip | `wx-strip-mid-night-rain.png` | Rain streaks + wet sheen on tarmac; barrier neon still pops |
| V6 | None | Geometry | audits | No float/clip/ground regressions; 12 coplanar spots at baseline |

## Ranked improvements (backlog)

1. **After shared shot PR:** Re-run weather matrix with `weather` batch field (4 anchors × dry/overcast/rain/fog × day/dusk/night) — replace ad-hoc track-session driver.
2. **Day/rain sky (V1):** Tune circuit `pal` / theme hooks when engine exposes per-weather presets (avoid whiteout at Sphere).
3. **Palm drops (V4):** Re-audit after hoarding mesh tweak or sparser palm cadence on Strip (do not weaken guards).
4. **Strip gateway readability:** Add low orbit framing at `sl(0.66)` in survey set (`s3-strip-gateway-orbit.png` covers).
5. **High Roller:** Optional landmarks.json registration when batch window allows.

## Fix applied this branch

- Strip palm setback +2–3 m past neon hoarding (`js/circuits/scenery/vegas.js`, survey 2026-10-14) — guard drop count unchanged; keeps palms off barrier band.

---

## Sector panels (night dry, unless noted)

### Sector 1 — Pit / Koval / T5 (`s ≈ 0.00–0.29`)

| Panel | Panel | Panel |
|:---:|:---:|:---:|
| `s1-pit-plaza.png` — pit plaza orbit | `s1-main-stand.png` — main grandstand chase | `s1-t5-approach.png` — T5 approach |
| `s1-koval-right.png` — Koval right-hander | | |

### Sector 2 — Sphere loop / Venetian (`s ≈ 0.29–0.62`)

| Panel | Panel | Panel |
|:---:|:---:|:---:|
| `s2-sphere-orbit.png` — MSG Sphere orbit | `s2-sphere-chicane.png` — Sphere chicane | `s2-wynn-encore.png` — Wynn / Encore twins |
| `s2-venetian-entry.png` — Venetian / campanile entry | | |

### Sector 3 — Strip / Harmon / S/F (`s ≈ 0.62–1.00`)

| Panel | Panel | Panel |
|:---:|:---:|:---:|
| `s3-high-roller.png` — High Roller wheel | `s3-strip-gateway.png` — Strip gateway chase | `s3-strip-gateway-orbit.png` — gateway arch orbit |
| `s3-caesars.png` — Caesars Palace | `s3-bellagio.png` — Bellagio + lake | `s3-paris-eiffel.png` — Paris / Eiffel |
| `s3-strip-straight.png` — Strip straight | `s3-harmon-chicane.png` — Harmon chicane | `s3-start-finish.png` — start / finish |

---

## Weather / lighting matrix (4 anchors)

Anchors: **pit** `s≈0.02`, **Sphere** `s≈0.28`, **Strip mid** `s≈0.50`, **Bellagio** `s≈0.68`.  
API: `__apex.weather('dry'|'overcast'|'rain'|'fog')`, `__apex.setTimeOfDay('day'|'dawn'|'dusk'|'night')` ([`docs/DEBUG-HOOKS.md`](../../DEBUG-HOOKS.md)).

### Pit plaza

| Panel | Panel | Panel |
|:---:|:---:|:---:|
| `wx-pit-day-overcast.png` — overcast · day | `wx-pit-day-rain.png` — rain · day | `wx-pit-dawn-fog.png` — fog · dawn |
| `wx-pit-dusk-dry.png` — dusk · dry | | |

### MSG Sphere

| Panel | Panel | Panel |
|:---:|:---:|:---:|
| `wx-sphere-day-dry.png` — day · dry | `wx-sphere-day-overcast.png` — overcast · day | `wx-sphere-day-rain.png` — rain · day |
| `wx-sphere-dawn-fog.png` — fog · dawn | | |

### Strip mid (Las Vegas Blvd)

| Panel | Panel | Panel |
|:---:|:---:|:---:|
| `wx-strip-mid-day-dry.png` — day · dry | `wx-strip-mid-day-overcast.png` — overcast · day | `wx-strip-mid-day-rain.png` — rain · day |
| `wx-strip-mid-dawn-fog.png` — fog · dawn | `wx-strip-dusk-dry.png` — dusk · dry | `wx-strip-mid-night-rain.png` — rain · night |

### Bellagio / fountains

| Panel | Panel | Panel |
|:---:|:---:|:---:|
| `wx-bellagio-day-overcast.png` — overcast · day | `wx-bellagio-day-rain.png` — rain · day | `wx-bellagio-dawn-fog.png` — fog · dawn |
| `wx-bellagio-night-dry.png` — night · dry | | |

---

## Capture manifest

35 PNGs + `manifest.json` / `results.json` under `artifacts/shots/tracks/vegas/`.  
**Follow-up:** Rebase on `tools: shared shot tooling for circuit surveys` and re-capture weather rows with supported `weather` batch jobs + retries; commit PNGs when gitignore exception lands.
