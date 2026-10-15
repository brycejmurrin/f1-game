# Nürburgring GP-Strecke — circuit survey (2026-10-15)

**Scope:** Modern **Grand-Prix-Strecke** (`id: nurburgring`) only — not the Nordschleife.  
**Shots:** **35** JPEGs in `artifacts/shots/tracks/nurburgring/` (`git add -f`).  
**Batch:** `node tools/shot/shot.mjs --batch docs/tracks/surveys/nurburgring-capture-jobs.json --jpeg --present-timeout 120 --capture-retries 6 --wait 150` (PR #1862).

## Code map

| Layer | Path | Role |
|--------|------|------|
| Circuit def | `js/circuits/nurburgring.js` | OSM centreline, SRTM elevation, `furniture` (`lamp: "none"`), palette |
| Scenery | `js/circuits/scenery/nurburgring.js` | `forestEdge`, landmarks, Dunlop bridge, Burg, pit/Arena kits |
| Brief | `docs/tracks/nurburgring.md` | Visual design reference |
| Landmarks | `tests/data/landmarks/nurburgring.json` | Burg, Coca-Cola Kurve, race-control |

## Capture plan (35 frames)

| Bucket | Count |
|--------|------:|
| Sector anchors (day · dry) | 5 |
| Hero weather + TOD (5 landmarks) | 30 |

Weather on heroes: `wet`, `rain`, `overcast`, `fog`, `storm` (subset per view). TOD: `dawn`, `day`, `dusk`, `night` on dry.

## Screenshot panels

Paths relative to this file (`../../../artifacts/shots/tracks/nurburgring/`).

### Sector anchors (day · dry)

| | | |
|:---:|:---:|:---:|
| ![s1 haug haken · dry · day](../../../artifacts/shots/tracks/nurburgring/s1-haug-haken-day-dry.jpg) | ![s2 forest loop · dry · day](../../../artifacts/shots/tracks/nurburgring/s2-forest-loop-day-dry.jpg) | ![s3 schumacher s · dry · day](../../../artifacts/shots/tracks/nurburgring/s3-schumacher-s-day-dry.jpg) |
| s1 haug haken; dry; day | s2 forest loop; dry; day | s3 schumacher s; dry; day |
| ![s3 veedol · dry · day](../../../artifacts/shots/tracks/nurburgring/s3-veedol-day-dry.jpg) | ![s3 coca cola · dry · day](../../../artifacts/shots/tracks/nurburgring/s3-coca-cola-day-dry.jpg) | |
| s3 veedol; dry; day | s3 coca cola; dry; day | |

### Mercedes-Arena hero

| | | |
|:---:|:---:|:---:|
| ![mercedes arena · dry · day](../../../artifacts/shots/tracks/nurburgring/hero-mercedes-arena-day-dry.jpg) | ![mercedes arena · dry · dusk](../../../artifacts/shots/tracks/nurburgring/hero-mercedes-arena-dusk-dry.jpg) | ![mercedes arena · dry · night](../../../artifacts/shots/tracks/nurburgring/hero-mercedes-arena-night-dry.jpg) |
| mercedes arena; dry; day | mercedes arena; dry; dusk | mercedes arena; dry; night |
| ![mercedes arena · dry · dawn](../../../artifacts/shots/tracks/nurburgring/hero-mercedes-arena-dawn-dry.jpg) | ![mercedes arena · wet · day](../../../artifacts/shots/tracks/nurburgring/hero-mercedes-arena-day-wet.jpg) | ![mercedes arena · overcast · day](../../../artifacts/shots/tracks/nurburgring/hero-mercedes-arena-day-overcast.jpg) |
| mercedes arena; dry; dawn | mercedes arena; wet; day | mercedes arena; overcast; day |
| ![mercedes arena · fog · day](../../../artifacts/shots/tracks/nurburgring/hero-mercedes-arena-day-fog.jpg) | | |
| mercedes arena; fog; day | | |

### Dunlop bridge hero

| | | |
|:---:|:---:|:---:|
| ![dunlop bridge · dry · day](../../../artifacts/shots/tracks/nurburgring/hero-dunlop-bridge-day-dry.jpg) | ![dunlop bridge · dry · dusk](../../../artifacts/shots/tracks/nurburgring/hero-dunlop-bridge-dusk-dry.jpg) | ![dunlop bridge · dry · night](../../../artifacts/shots/tracks/nurburgring/hero-dunlop-bridge-night-dry.jpg) |
| dunlop bridge; dry; day | dunlop bridge; dry; dusk | dunlop bridge; dry; night |
| ![dunlop bridge · wet · day](../../../artifacts/shots/tracks/nurburgring/hero-dunlop-bridge-day-wet.jpg) | ![dunlop bridge · rain · day](../../../artifacts/shots/tracks/nurburgring/hero-dunlop-bridge-day-rain.jpg) | ![dunlop bridge · fog · day](../../../artifacts/shots/tracks/nurburgring/hero-dunlop-bridge-day-fog.jpg) |
| dunlop bridge; wet; day | dunlop bridge; rain; day | dunlop bridge; fog; day |

### Dunlop-Kehre hero

| | | |
|:---:|:---:|:---:|
| ![dunlop kehre · dry · day](../../../artifacts/shots/tracks/nurburgring/hero-dunlop-kehre-day-dry.jpg) | ![dunlop kehre · dry · dusk](../../../artifacts/shots/tracks/nurburgring/hero-dunlop-kehre-dusk-dry.jpg) | ![dunlop kehre · dry · night](../../../artifacts/shots/tracks/nurburgring/hero-dunlop-kehre-night-dry.jpg) |
| dunlop kehre; dry; day | dunlop kehre; dry; dusk | dunlop kehre; dry; night |
| ![dunlop kehre · wet · day](../../../artifacts/shots/tracks/nurburgring/hero-dunlop-kehre-day-wet.jpg) | ![dunlop kehre · storm · day](../../../artifacts/shots/tracks/nurburgring/hero-dunlop-kehre-day-storm.jpg) | ![dunlop kehre · overcast · day](../../../artifacts/shots/tracks/nurburgring/hero-dunlop-kehre-day-overcast.jpg) |
| dunlop kehre; wet; day | dunlop kehre; storm; day | dunlop kehre; overcast; day |

### Pit complex hero

| | | |
|:---:|:---:|:---:|
| ![pit complex · dry · day](../../../artifacts/shots/tracks/nurburgring/hero-pit-complex-day-dry.jpg) | ![pit complex · dry · dusk](../../../artifacts/shots/tracks/nurburgring/hero-pit-complex-dusk-dry.jpg) | ![pit complex · dry · night](../../../artifacts/shots/tracks/nurburgring/hero-pit-complex-night-dry.jpg) |
| pit complex; dry; day | pit complex; dry; dusk | pit complex; dry; night |
| ![pit complex · wet · day](../../../artifacts/shots/tracks/nurburgring/hero-pit-complex-day-wet.jpg) | ![pit complex · overcast · day](../../../artifacts/shots/tracks/nurburgring/hero-pit-complex-day-overcast.jpg) | ![pit complex · fog · day](../../../artifacts/shots/tracks/nurburgring/hero-pit-complex-day-fog.jpg) |
| pit complex; wet; day | pit complex; overcast; day | pit complex; fog; day |

### Burg Nürburg hero

| | | |
|:---:|:---:|:---:|
| ![burg nurburg · dry · day](../../../artifacts/shots/tracks/nurburgring/hero-burg-nurburg-day-dry.jpg) | ![burg nurburg · dry · dusk](../../../artifacts/shots/tracks/nurburgring/hero-burg-nurburg-dusk-dry.jpg) | ![burg nurburg · dry · dawn](../../../artifacts/shots/tracks/nurburgring/hero-burg-nurburg-dawn-dry.jpg) |
| burg nurburg; dry; day | burg nurburg; dry; dusk | burg nurburg; dry; dawn |
| ![burg nurburg · fog · day](../../../artifacts/shots/tracks/nurburgring/hero-burg-nurburg-day-fog.jpg) | ![burg nurburg · overcast · day](../../../artifacts/shots/tracks/nurburgring/hero-burg-nurburg-day-overcast.jpg) | |
| burg nurburg; fog; day | burg nurburg; overcast; day | |

## Weather / lighting notes (from frames)

| Topic | Evidence |
|-------|----------|
| Night forest very dark | `hero-*-night-dry` — `furniture.lamp: none` |
| Fog reads Eifel-hazy | `hero-*-day-fog` — matches `pal.fogDensity` |
| Storm heavy rain at Kehre | `hero-dunlop-kehre-day-storm` — particles + wet road |
| Pit night lacks flood masts | `hero-pit-complex-night-dry` — only building glow |

## Node VM audit

```text
verify-track: OK — surface folds 0
clip-audit: 2 severe (baseline cap 2)
ground-audit: buried 3 (baseline 3)
```

## Findings (ranked)

| Rank | Topic | Evidence | Action |
|------|--------|----------|--------|
| 1 | Schumacher-S no open tribune | `s3-schumacher-s-day-dry` | Intentional; SRTM fold skirt |
| 2 | Night lighting sparse | `hero-*-night-dry` | `lamp: "none"` — no trackside floods |
| 3 | Motorhomes buried ≤0.45 m | ground-audit | Within baseline |
| 4 | Clip replay vs scatter | clip-audit | Scatter skip `s∈[0.23,0.26]` |

## Changes on this branch

- `js/circuits/scenery/nurburgring.js`: broadleaf scatter skip on guardrail corridor.
- `docs/tracks/surveys/nurburgring.md` + `artifacts/shots/tracks/nurburgring/*.jpg` (35).

## Verification

```sh
node tools/track/verify-track.cjs nurburgring
node tools/track/audit-circuit.cjs nurburgring
```
