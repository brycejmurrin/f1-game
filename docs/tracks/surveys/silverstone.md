# Silverstone — circuit survey (2026-10-14)

**Live:** https://brycejmurrin.github.io/f1-game/  
**Branch:** `cursor/silverstone-survey-745b`  
**Frames:** 36 committed under `artifacts/shots/tracks/silverstone/` (18 sector landmarks · day, 18 hero lighting/weather variants on five signatures).

### Capture status (course correction)

- **In this PR:** sector sweep + hero variants captured headless (`APEX_GL=llvmpipe`, `shot.mjs --backend webgl2 --tod`). Rain/wet frames used a **local-only** batch `weather` field — **not** merged here; shared tooling PR *tools: shared shot tooling for circuit surveys* will land `weather` batch support, retries, and `artifacts/shots/tracks/**` gitignore. **Follow-up:** rebase on that PR, re-run the weather matrix (4–6 heroes × dry/dusk/night/rain/wet/overcast/fog), trim to the fleet cap.
- **Circuit edits only:** `js/circuits/silverstone.js` pair — T2 hangars inward, museum/marshal/helipad grounding.

## Weather and time-of-day (engine reference)

| Control | API | Values |
|---|---|---|
| Time of day | `__apex.setTimeOfDay`, shot `--tod` | `dawn`, `day`, `dusk`, `night` |
| Weather | `__apex.weather(wx)` | `dry`, `wet`, `rain`, `overcast`, `fog` |
| Def | `night: false` | Menu-default day circuit; night still probe-able |

## Code map

| Layer | Path |
|---|---|
| Def | `js/circuits/silverstone.js` — `startFrac 0.5224`, `sceneryStartFrac 0.02`, `flatTerrain`, `terrainOuter 110` |
| Scenery | `js/circuits/scenery/silverstone.js` — Wing, T2 hangars, campsites, grandstands |
| Brief | `docs/tracks/silverstone.md` |
| Landmarks | `tests/data/landmarks/silverstone.json` |

## Sector and landmark coverage (dry · day)

Racing sector splits ≈ `[0.30, 0.62]`. Scenery-frame fractions below.

### Sector 1 — Copse → Hangar

| | | |
|---|---|---|
| ![](../../../artifacts/shots/tracks/silverstone/s1-chapel__day-dry.jpg) | ![](../../../artifacts/shots/tracks/silverstone/s1-copse__day-dry.jpg) | ![](../../../artifacts/shots/tracks/silverstone/s1-hangar-t2__day-dry.jpg) |
| s1-chapel · day-dry | s1-copse · day-dry | s1-hangar-t2 · day-dry |
| ![](../../../artifacts/shots/tracks/silverstone/s1-hangar-wide__day-dry.jpg) | ![](../../../artifacts/shots/tracks/silverstone/s1-maggotts__day-dry.jpg) |   |
| s1-hangar-wide · day-dry | s1-maggotts · day-dry |

### Sector 2 — Stowe → Hamilton

| | | |
|---|---|---|
| ![](../../../artifacts/shots/tracks/silverstone/s2-club__day-dry.jpg) | ![](../../../artifacts/shots/tracks/silverstone/s2-hamilton-stand__day-dry.jpg) | ![](../../../artifacts/shots/tracks/silverstone/s2-pit-park__day-dry.jpg) |
| s2-club · day-dry | s2-hamilton-stand · day-dry | s2-pit-park · day-dry |
| ![](../../../artifacts/shots/tracks/silverstone/s2-stowe__day-dry.jpg) | ![](../../../artifacts/shots/tracks/silverstone/s2-vale__day-dry.jpg) | ![](../../../artifacts/shots/tracks/silverstone/s2-wing-hero__day-dry.jpg) |
| s2-stowe · day-dry | s2-vale · day-dry | s2-wing-hero · day-dry |

### Sector 3 — Abbey → Woodcote + landmarks

| | | |
|---|---|---|
| ![](../../../artifacts/shots/tracks/silverstone/lm-museum__day-dry.jpg) | ![](../../../artifacts/shots/tracks/silverstone/lm-start-gantry__day-dry.jpg) | ![](../../../artifacts/shots/tracks/silverstone/s3-abbey__day-dry.jpg) |
| lm-museum · day-dry | lm-start-gantry · day-dry | s3-abbey · day-dry |
| ![](../../../artifacts/shots/tracks/silverstone/s3-brooklands__day-dry.jpg) | ![](../../../artifacts/shots/tracks/silverstone/s3-farm__day-dry.jpg) | ![](../../../artifacts/shots/tracks/silverstone/s3-village-loop__day-dry.jpg) |
| s3-brooklands · day-dry | s3-farm · day-dry | s3-village-loop · day-dry |
| ![](../../../artifacts/shots/tracks/silverstone/s3-woodcote__day-dry.jpg) |   |   |
| s3-woodcote · day-dry |

## Hero viewpoints — lighting and weather (5 signatures)

Copse, Maggotts, Hangar/T2, Wing, Abbey, Village — subset of dusk/night/rain/wet retained (36-frame cap). Full matrix after shared shot PR.

### abbey

| | | |
|---|---|---|
| ![](../../../artifacts/shots/tracks/silverstone/hero-abbey__dusk-dry.jpg) | ![](../../../artifacts/shots/tracks/silverstone/hero-abbey__night-dry.jpg) |   |
| dusk · dry | night · dry |

### copse

| | | |
|---|---|---|
| ![](../../../artifacts/shots/tracks/silverstone/hero-copse__dusk-dry.jpg) | ![](../../../artifacts/shots/tracks/silverstone/hero-copse__night-dry.jpg) | ![](../../../artifacts/shots/tracks/silverstone/hero-copse__day-rain.jpg) |
| dusk · dry | night · dry | day · rain |
| ![](../../../artifacts/shots/tracks/silverstone/hero-copse__day-wet.jpg) |   |   |
| day · wet |

### hangar

| | | |
|---|---|---|
| ![](../../../artifacts/shots/tracks/silverstone/hero-hangar__dusk-dry.jpg) | ![](../../../artifacts/shots/tracks/silverstone/hero-hangar__night-dry.jpg) | ![](../../../artifacts/shots/tracks/silverstone/hero-hangar__day-rain.jpg) |
| dusk · dry | night · dry | day · rain |

### maggotts

| | | |
|---|---|---|
| ![](../../../artifacts/shots/tracks/silverstone/hero-maggotts__day-dry.jpg) | ![](../../../artifacts/shots/tracks/silverstone/hero-maggotts__dusk-dry.jpg) | ![](../../../artifacts/shots/tracks/silverstone/hero-maggotts__night-dry.jpg) |
| day · dry | dusk · dry | night · dry |

### village

| | | |
|---|---|---|
| ![](../../../artifacts/shots/tracks/silverstone/hero-village__dusk-dry.jpg) | ![](../../../artifacts/shots/tracks/silverstone/hero-village__night-dry.jpg) |   |
| dusk · dry | night · dry |

### wing

| | | |
|---|---|---|
| ![](../../../artifacts/shots/tracks/silverstone/hero-wing__dusk-dry.jpg) | ![](../../../artifacts/shots/tracks/silverstone/hero-wing__night-dry.jpg) | ![](../../../artifacts/shots/tracks/silverstone/hero-wing__day-rain.jpg) |
| dusk · dry | night · dry | day · rain |
| ![](../../../artifacts/shots/tracks/silverstone/hero-wing__day-wet.jpg) |   |   |
| day · wet |

## Findings

### Strengths
- `audit-circuit`: 0 folds, 0 float, 0 severe clip; props ~428k tris.
- Wing + Hamilton read on `s2-wing-hero__day-dry` / `s2-pit-park__day-dry`.
- T2 hangars moved ~10 m inward (F1 fix).

### Weather / lighting backlog (not fixed this PR)

| ID | Evidence | Note |
|---|---|---|
| W1 | `hero-hangar__night-dry` | Outfield black; pit doubles carry night |
| W2 | `hero-wing__day-rain` | Rain particles; weak wet specular (engine) |
| W3 | `hero-copse__day-wet` | Wet road read subtle vs authored green runoff |
| W4 | def `night: false` | No circuit-specific night lamp pass |
| W5 | — | **Pending shared shot PR** for reproducible weather batch + committed `artifacts/shots/**` |

### Circuit fixes (this PR)

| Item | Change |
|---|---|
| T2 hangars | dist 88–92 m (was 96–104 m) |
| Heritage museum | fascia band lifted (flatCoplanar ↓) |
| Marshal bay | orange roof raised |
| Helipad | H markings raised |

### Deferred
- Legacy infield `silverstone-camping-field-*` (blocked by `scenery-api-contract` test).

## Verification

```sh
node tools/track/verify-track.cjs silverstone
node tools/track/audit-circuit.cjs silverstone
```
