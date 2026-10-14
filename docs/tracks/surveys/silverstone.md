# Silverstone — circuit survey (2026-10-14)

**Live:** https://brycejmurrin.github.io/f1-game/  
**Branch:** `cursor/silverstone-survey-745b`  
**Frames:** 36 under `artifacts/shots/tracks/silverstone/` (JPEG q≈80, ≤1280 px, ≤300 KB each).

### Capture status

Sector **dry · day** sweep plus hero **lighting/weather** on five signatures. Reproducible `weather` batch + `artifacts/shots/**` gitignore lands in shared PR *tools: shared shot tooling for circuit surveys* — follow-up rebase for fog/overcast matrix.

## Code map

| Layer | Path |
|---|---|
| Def | `js/circuits/silverstone.js` |
| Scenery | `js/circuits/scenery/silverstone.js` |
| Brief | `docs/tracks/silverstone.md` |

## Sector and landmark panels (dry · day)

### Sector 1 — Copse → Hangar

| | | |
|---|---|---|
| ![chapel · day · dry](../../../artifacts/shots/tracks/silverstone/s1-chapel__day-dry.jpg) | ![copse · day · dry](../../../artifacts/shots/tracks/silverstone/s1-copse__day-dry.jpg) | ![hangar t2 · day · dry](../../../artifacts/shots/tracks/silverstone/s1-hangar-t2__day-dry.jpg) |
| chapel · day · dry | copse · day · dry | hangar t2 · day · dry |
| ![hangar wide · day · dry](../../../artifacts/shots/tracks/silverstone/s1-hangar-wide__day-dry.jpg) | ![maggotts · day · dry](../../../artifacts/shots/tracks/silverstone/s1-maggotts__day-dry.jpg) |
| hangar wide · day · dry | maggotts · day · dry |

### Sector 2 — Stowe → Hamilton

| | | |
|---|---|---|
| ![club · day · dry](../../../artifacts/shots/tracks/silverstone/s2-club__day-dry.jpg) | ![hamilton stand · day · dry](../../../artifacts/shots/tracks/silverstone/s2-hamilton-stand__day-dry.jpg) | ![pit park · day · dry](../../../artifacts/shots/tracks/silverstone/s2-pit-park__day-dry.jpg) |
| club · day · dry | hamilton stand · day · dry | pit park · day · dry |
| ![stowe · day · dry](../../../artifacts/shots/tracks/silverstone/s2-stowe__day-dry.jpg) | ![vale · day · dry](../../../artifacts/shots/tracks/silverstone/s2-vale__day-dry.jpg) | ![wing hero · day · dry](../../../artifacts/shots/tracks/silverstone/s2-wing-hero__day-dry.jpg) |
| stowe · day · dry | vale · day · dry | wing hero · day · dry |

### Sector 3 + landmarks

| | | |
|---|---|---|
| ![lm museum · day · dry](../../../artifacts/shots/tracks/silverstone/lm-museum__day-dry.jpg) | ![lm start gantry · day · dry](../../../artifacts/shots/tracks/silverstone/lm-start-gantry__day-dry.jpg) | ![abbey · day · dry](../../../artifacts/shots/tracks/silverstone/s3-abbey__day-dry.jpg) |
| lm museum · day · dry | lm start gantry · day · dry | abbey · day · dry |
| ![brooklands · day · dry](../../../artifacts/shots/tracks/silverstone/s3-brooklands__day-dry.jpg) | ![farm · day · dry](../../../artifacts/shots/tracks/silverstone/s3-farm__day-dry.jpg) | ![village loop · day · dry](../../../artifacts/shots/tracks/silverstone/s3-village-loop__day-dry.jpg) |
| brooklands · day · dry | farm · day · dry | village loop · day · dry |
| ![woodcote · day · dry](../../../artifacts/shots/tracks/silverstone/s3-woodcote__day-dry.jpg) |
| woodcote · day · dry |

## Hero viewpoint panels (lighting / weather)

### Copse

| | | |
|---|---|---|
| ![copse · day · rain](../../../artifacts/shots/tracks/silverstone/hero-copse__day-rain.jpg) | ![copse · day · wet](../../../artifacts/shots/tracks/silverstone/hero-copse__day-wet.jpg) | ![copse · dusk · dry](../../../artifacts/shots/tracks/silverstone/hero-copse__dusk-dry.jpg) |
| copse · day · rain | copse · day · wet | copse · dusk · dry |
| ![copse · night · dry](../../../artifacts/shots/tracks/silverstone/hero-copse__night-dry.jpg) |
| copse · night · dry |

### Maggotts

| | | |
|---|---|---|
| ![maggotts · day · dry](../../../artifacts/shots/tracks/silverstone/hero-maggotts__day-dry.jpg) | ![maggotts · dusk · dry](../../../artifacts/shots/tracks/silverstone/hero-maggotts__dusk-dry.jpg) | ![maggotts · night · dry](../../../artifacts/shots/tracks/silverstone/hero-maggotts__night-dry.jpg) |
| maggotts · day · dry | maggotts · dusk · dry | maggotts · night · dry |

### Hangar

| | | |
|---|---|---|
| ![hangar · day · rain](../../../artifacts/shots/tracks/silverstone/hero-hangar__day-rain.jpg) | ![hangar · dusk · dry](../../../artifacts/shots/tracks/silverstone/hero-hangar__dusk-dry.jpg) | ![hangar · night · dry](../../../artifacts/shots/tracks/silverstone/hero-hangar__night-dry.jpg) |
| hangar · day · rain | hangar · dusk · dry | hangar · night · dry |

### Wing

| | | |
|---|---|---|
| ![wing · day · rain](../../../artifacts/shots/tracks/silverstone/hero-wing__day-rain.jpg) | ![wing · day · wet](../../../artifacts/shots/tracks/silverstone/hero-wing__day-wet.jpg) | ![wing · dusk · dry](../../../artifacts/shots/tracks/silverstone/hero-wing__dusk-dry.jpg) |
| wing · day · rain | wing · day · wet | wing · dusk · dry |
| ![wing · night · dry](../../../artifacts/shots/tracks/silverstone/hero-wing__night-dry.jpg) |
| wing · night · dry |

### Abbey

| | | |
|---|---|---|
| ![abbey · dusk · dry](../../../artifacts/shots/tracks/silverstone/hero-abbey__dusk-dry.jpg) | ![abbey · night · dry](../../../artifacts/shots/tracks/silverstone/hero-abbey__night-dry.jpg) |
| abbey · dusk · dry | abbey · night · dry |

### Village

| | | |
|---|---|---|
| ![village · dusk · dry](../../../artifacts/shots/tracks/silverstone/hero-village__dusk-dry.jpg) | ![village · night · dry](../../../artifacts/shots/tracks/silverstone/hero-village__night-dry.jpg) |
| village · dusk · dry | village · night · dry |

## Findings (summary)

- **audit-circuit:** 0 folds, 0 float, 0 severe clip; ~428k tris.
- **Fixes (scenery):** T2 hangars inward; museum/marshal/helipad grounding.
- **W1 night:** outfield dark except pit lamps (`hero-hangar__night-dry`).
- **W2 rain/wet:** particles read; weak wet specular (engine).
- **Pending:** full weather matrix after shared shot PR.

## Verification

```sh
node tools/track/verify-track.cjs silverstone
node tools/track/audit-circuit.cjs silverstone
```
