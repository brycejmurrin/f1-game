# Las Vegas GP — circuit survey (`vegas`)

**Date:** 2026-10-15  
**Branch:** `cursor/vegas-survey-b8a0`  
**Brief:** [`docs/tracks/vegas.md`](../vegas.md)  
**Shots:** **36** JPEGs in [`artifacts/shots/tracks/vegas/`](../../../artifacts/shots/tracks/vegas/) (1280px max, q≈80, `shot.mjs --jpeg --present-timeout 90 --capture-retries 4 --wait 120`, SwiftShader).

## Code map

| Layer | Role |
|--------|------|
| `js/circuits/vegas.js` | OSM centreline, `sceneryCoordinates: "racing"`, `theme: street_night`, `dressingExclusions` for Strip/Sphere hand-build |
| `js/circuits/scenery/vegas.js` | `sl(f)` racing-frame landmarks, Strip canyon densify, neon verges, gateway/finish spans |
| `tests/data/landmarks/vegas.json` | Required heroes: Sphere, Wynn/Encore, Caesars, Bellagio, Paris balloon, Grand Prix Plaza |

**Sectors (racing arc):** `sectors: [0.291, 0.62]` → S1 pit–Koval, S2 Sphere–Venetian, S3 Strip–Harmon.

## Audits

`verify-track.cjs vegas` OK · `audit-circuit.cjs vegas` OK (float/clip/ground; palm guard drops 6).

## Findings

| ID | Topic | Shot | Note |
|----|--------|------|------|
| V1 | Day rain sky | `wx-sphere-day-rain.jpg` | White sky on `street_night` + day/rain |
| V2 | Dawn fog | `wx-pit-dawn-fog.jpg` | Heavy but readable |
| V3 | Overcast | `wx-bellagio-day-overcast.jpg` | Flat grey; distant Sphere silhouette OK |
| V4 | Palm drops | verify-track | Six suppressed; Strip gap 25 m (unchanged count) |
| V5 | Night wet | `wx-strip-mid-night-wet.jpg` | Wet sheen + neon |
| V6 | Storm | `wx-pit-dusk-storm.jpg` | Dusk lightning wash; landmarks hold |

## Fix

Strip palm setback +2–3 m (`js/circuits/scenery/vegas.js`).

---

## Sector tour (weather: dry · time: night)

### Sector 1

| | | |
|:---:|:---:|:---:|
| ![Pit plaza](../../../artifacts/shots/tracks/vegas/s1-pit-plaza.jpg) | ![Main stand](../../../artifacts/shots/tracks/vegas/s1-main-stand.jpg) | ![T5](../../../artifacts/shots/tracks/vegas/s1-t5-approach.jpg) |
| Pit · orbit · night · dry | Main stand · chase · night · dry | T5 · chase · night · dry |

### Sector 2

| | | |
|:---:|:---:|:---:|
| ![Sphere orbit](../../../artifacts/shots/tracks/vegas/s2-sphere-orbit.jpg) | ![Sphere chicane](../../../artifacts/shots/tracks/vegas/s2-sphere-chicane.jpg) | ![Wynn Encore](../../../artifacts/shots/tracks/vegas/s2-wynn-encore.jpg) |
| Sphere · orbit · night · dry | Sphere chicane · chase · night · dry | Wynn/Encore · orbit · night · dry |
| ![Venetian](../../../artifacts/shots/tracks/vegas/s2-venetian-entry.jpg) | | |
| Venetian · chase · night · dry | | |

### Sector 3

| | | |
|:---:|:---:|:---:|
| ![High Roller](../../../artifacts/shots/tracks/vegas/s3-high-roller.jpg) | ![Gateway orbit](../../../artifacts/shots/tracks/vegas/s3-strip-gateway-orbit.jpg) | ![Caesars](../../../artifacts/shots/tracks/vegas/s3-caesars.jpg) |
| High Roller · orbit · night · dry | Strip gateway · orbit · night · dry | Caesars · chase · night · dry |
| ![Bellagio](../../../artifacts/shots/tracks/vegas/s3-bellagio.jpg) | ![Paris](../../../artifacts/shots/tracks/vegas/s3-paris-eiffel.jpg) | ![Strip straight](../../../artifacts/shots/tracks/vegas/s3-strip-straight.jpg) |
| Bellagio · chase · night · dry | Paris/Eiffel · orbit · night · dry | Strip straight · chase · night · dry |
| ![Harmon](../../../artifacts/shots/tracks/vegas/s3-harmon-chicane.jpg) | ![S/F](../../../artifacts/shots/tracks/vegas/s3-start-finish.jpg) | |
| Harmon · chase · night · dry | S/F · orbit · night · dry | |

---

## Weather / lighting (5 hero anchors)

### Pit (`s≈0.02` · orbit)

| | | |
|:---:|:---:|:---:|
| ![Pit dusk dry](../../../artifacts/shots/tracks/vegas/wx-pit-dusk-dry.jpg) | ![Pit overcast](../../../artifacts/shots/tracks/vegas/wx-pit-day-overcast.jpg) | ![Pit rain](../../../artifacts/shots/tracks/vegas/wx-pit-day-rain.jpg) |
| Pit · orbit · dusk · dry | Pit · orbit · day · overcast | Pit · orbit · day · rain |
| ![Pit fog](../../../artifacts/shots/tracks/vegas/wx-pit-dawn-fog.jpg) | ![Pit storm](../../../artifacts/shots/tracks/vegas/wx-pit-dusk-storm.jpg) | |
| Pit · orbit · dawn · fog | Pit · orbit · dusk · storm | |

### Sphere (`s≈0.28` · orbit)

| | | |
|:---:|:---:|:---:|
| ![Sphere day dry](../../../artifacts/shots/tracks/vegas/wx-sphere-day-dry.jpg) | ![Sphere overcast](../../../artifacts/shots/tracks/vegas/wx-sphere-day-overcast.jpg) | ![Sphere rain](../../../artifacts/shots/tracks/vegas/wx-sphere-day-rain.jpg) |
| Sphere · orbit · day · dry | Sphere · orbit · day · overcast | Sphere · orbit · day · rain |
| ![Sphere fog](../../../artifacts/shots/tracks/vegas/wx-sphere-dawn-fog.jpg) | ![Sphere storm](../../../artifacts/shots/tracks/vegas/wx-sphere-dusk-storm.jpg) | |
| Sphere · orbit · dawn · fog | Sphere · orbit · dusk · storm | |

### Strip mid (`s≈0.50` · chase)

| | | |
|:---:|:---:|:---:|
| ![Strip night dry](../../../artifacts/shots/tracks/vegas/wx-strip-mid-night-dry.jpg) | ![Strip night wet](../../../artifacts/shots/tracks/vegas/wx-strip-mid-night-wet.jpg) | ![Strip dusk](../../../artifacts/shots/tracks/vegas/wx-strip-dusk-dry.jpg) |
| Strip · chase · night · dry | Strip · chase · night · wet | Strip · chase · dusk · dry |
| ![Strip overcast](../../../artifacts/shots/tracks/vegas/wx-strip-mid-day-overcast.jpg) | ![Strip rain](../../../artifacts/shots/tracks/vegas/wx-strip-mid-day-rain.jpg) | ![Strip fog](../../../artifacts/shots/tracks/vegas/wx-strip-mid-dawn-fog.jpg) |
| Strip · chase · day · overcast | Strip · chase · day · rain | Strip · chase · dawn · fog |

### Bellagio (`s≈0.68` · chase)

| | | |
|:---:|:---:|:---:|
| ![Bellagio night wet](../../../artifacts/shots/tracks/vegas/wx-bellagio-night-wet.jpg) | ![Bellagio dusk](../../../artifacts/shots/tracks/vegas/wx-bellagio-dusk-dry.jpg) | ![Bellagio overcast](../../../artifacts/shots/tracks/vegas/wx-bellagio-day-overcast.jpg) |
| Bellagio · chase · night · wet | Bellagio · chase · dusk · dry | Bellagio · chase · day · overcast |
| ![Bellagio rain](../../../artifacts/shots/tracks/vegas/wx-bellagio-day-rain.jpg) | ![Bellagio fog](../../../artifacts/shots/tracks/vegas/wx-bellagio-dawn-fog.jpg) | |
| Bellagio · chase · day · rain | Bellagio · chase · dawn · fog | |

Night dry Bellagio: `s3-bellagio.jpg` (sector row). Night dry pit/Sphere: `s1-pit-plaza.jpg`, `s2-sphere-orbit.jpg`.
