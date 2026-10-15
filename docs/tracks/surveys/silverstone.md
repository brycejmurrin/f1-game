# Silverstone — circuit survey (2026-10-14)

**Branch:** `cursor/silverstone-survey-745b` · **Frames:** 36 (`artifacts/shots/tracks/silverstone/`, JPEG ≤1280 px, q≈80, <300 KB)

Captured with shared `shot.mjs` batch (`--present-timeout 90 --capture-retries 4 --wait 120`, SwiftShader). Sector sweep **day · dry**; six hero signatures with **dawn/dusk/night** and **wet/rain/overcast/fog/storm** mix.

## Code map

| Layer | Path |
|---|---|
| Def | `js/circuits/silverstone.js` |
| Scenery | `js/circuits/scenery/silverstone.js` |

## Sector panels (day · dry)

### Sector 1

| | | |
|---|---|---|
| ![chapel · day · dry](../../../artifacts/shots/tracks/silverstone/s1-chapel__day-dry.jpg) | ![copse · day · dry](../../../artifacts/shots/tracks/silverstone/s1-copse__day-dry.jpg) | ![hangar t2 · day · dry](../../../artifacts/shots/tracks/silverstone/s1-hangar-t2__day-dry.jpg) |
| chapel · day · dry | copse · day · dry | hangar t2 · day · dry |
| ![hangar wide · day · dry](../../../artifacts/shots/tracks/silverstone/s1-hangar-wide__day-dry.jpg) | ![maggotts · day · dry](../../../artifacts/shots/tracks/silverstone/s1-maggotts__day-dry.jpg) |
| hangar wide · day · dry | maggotts · day · dry |

### Sector 2

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

## Hero panels (weather · time of day)

### copse

| | | |
|---|---|---|
| ![copse · dawn · dry](../../../artifacts/shots/tracks/silverstone/hero-copse__dawn-dry.jpg) | ![copse · day · rain](../../../artifacts/shots/tracks/silverstone/hero-copse__day-rain.jpg) | ![copse · night · dry](../../../artifacts/shots/tracks/silverstone/hero-copse__night-dry.jpg) |
| copse · dawn · dry | copse · day · rain | copse · night · dry |

### maggotts

| | | |
|---|---|---|
| ![maggotts · day · storm](../../../artifacts/shots/tracks/silverstone/hero-maggotts__day-storm.jpg) | ![maggotts · dusk · dry](../../../artifacts/shots/tracks/silverstone/hero-maggotts__dusk-dry.jpg) | ![maggotts · night · dry](../../../artifacts/shots/tracks/silverstone/hero-maggotts__night-dry.jpg) |
| maggotts · day · storm | maggotts · dusk · dry | maggotts · night · dry |

### hangar

| | | |
|---|---|---|
| ![hangar · day · fog](../../../artifacts/shots/tracks/silverstone/hero-hangar__day-fog.jpg) | ![hangar · dusk · dry](../../../artifacts/shots/tracks/silverstone/hero-hangar__dusk-dry.jpg) | ![hangar · night · dry](../../../artifacts/shots/tracks/silverstone/hero-hangar__night-dry.jpg) |
| hangar · day · fog | hangar · dusk · dry | hangar · night · dry |

### wing

| | | |
|---|---|---|
| ![wing · day · overcast](../../../artifacts/shots/tracks/silverstone/hero-wing__day-overcast.jpg) | ![wing · day · wet](../../../artifacts/shots/tracks/silverstone/hero-wing__day-wet.jpg) | ![wing · night · dry](../../../artifacts/shots/tracks/silverstone/hero-wing__night-dry.jpg) |
| wing · day · overcast | wing · day · wet | wing · night · dry |

### abbey

| | | |
|---|---|---|
| ![abbey · dawn · dry](../../../artifacts/shots/tracks/silverstone/hero-abbey__dawn-dry.jpg) | ![abbey · day · rain](../../../artifacts/shots/tracks/silverstone/hero-abbey__day-rain.jpg) | ![abbey · dusk · dry](../../../artifacts/shots/tracks/silverstone/hero-abbey__dusk-dry.jpg) |
| abbey · dawn · dry | abbey · day · rain | abbey · dusk · dry |

### village

| | | |
|---|---|---|
| ![village · day · fog](../../../artifacts/shots/tracks/silverstone/hero-village__day-fog.jpg) | ![village · dusk · dry](../../../artifacts/shots/tracks/silverstone/hero-village__dusk-dry.jpg) | ![village · night · dry](../../../artifacts/shots/tracks/silverstone/hero-village__night-dry.jpg) |
| village · day · fog | village · dusk · dry | village · night · dry |

## Verification

```sh
node tools/track/verify-track.cjs silverstone
node tools/track/audit-circuit.cjs silverstone
```
