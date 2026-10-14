# Nürburgring GP-Strecke — circuit survey (2026-10-14)

**Scope:** Modern **Grand-Prix-Strecke** (`id: nurburgring`) only — not the Nordschleife.  
**Evidence:** Headless TLX captures (`node tools/shot/shot.mjs --batch scratch/nurburgring-survey-day.json`), node VM audits (`audit-circuit.cjs`, `float-audit`, `clip-audit`, `ground-audit`).  
**Shot storage:** `artifacts/shots/tracks/nurburgring/` (33 JPEGs force-added on branch (`git add -f`)).

## Code map

| Layer | Path | Role |
|--------|------|------|
| Circuit def | `js/circuits/nurburgring.js` | OSM centreline (`path.len` 5141 m), `startFrac` 0.02, `theme: green`, SRTM elevation, `hwZones` / `bankZones`, `dressingExclusions`, `furniture` (`lamp: "none"`), palette |
| Scenery | `js/circuits/scenery/nurburgring.js` | `TrackScenery.nurburgring` — `forestEdge` belts, landmarks, Dunlop `overheadSpan`, Burg Nürburg, pit/Arena/Dunlop/Schumacher/Veedol/Coca-Cola kits |
| Brief | `docs/tracks/nurburgring.md` | Visual design reference |
| Landmarks | `tests/data/landmarks/nurburgring.json` | `nurburgring-burg-nurburg`, `nurburgring-coca-cola-kurve`, `nurburgring-race-control` |

Sectors (racing lap, curated splits `sectors: [0.346, 0.667]`): **S1** start → ~0.35, **S2** ~0.35 → ~0.67, **S3** ~0.67 → finish.

## Theme and models

Muted Eifel green palette, heavy fog density, dark spruce (`fir`). Hero pieces: Mercedes-Arena bowl, Dunlop bridge + yellow fascia, Dunlop-Kehre open scaffold tribune, race-control drum (pit-offset `required`), ring°boulevard halls, Burg Nürburg on NW cone. Schumacher-S has gravel + `indexSolid` only (scaffold feet hit fold on SRTM mesh).

## Capture plan (33 frames)

| Bucket | Count | Notes |
|--------|------:|-------|
| Sector coverage, day dry | 22 | Every sector + landmarks |
| Time-of-day variants (dry) | 11 | 5 key views × dusk/night/dawn subsets |
| Weather variants | 0 | **Deferred** — needs shared `shot.mjs` batch `weather` + `artifacts/shots/tracks/**` gitignore exception |

**Planned weather follow-up (4–6 views):** Mercedes-Arena, Dunlop bridge, Dunlop-Kehre, pit complex, Burg — `dry`, `overcast`, `wet`, `fog`, `rain` at `day` (and `night` for pits if lamps added later).


## Screenshot panels

Committed JPEGs (1280px, q≈80) under `artifacts/shots/tracks/nurburgring/` — paths relative to this file.

### Sector 1 — day dry

| | | |
|:---:|:---:|:---:|
| ![s1 start finish · dry · day](../../../artifacts/shots/tracks/nurburgring/s1-start-finish-day-dry.jpg) | ![s1 pit straight · dry · day](../../../artifacts/shots/tracks/nurburgring/s1-pit-straight-day-dry.jpg) | ![s1 haug haken · dry · day](../../../artifacts/shots/tracks/nurburgring/s1-haug-haken-day-dry.jpg) |
| s1 start finish; dry; day | s1 pit straight; dry; day | s1 haug haken; dry; day |
| ![s1 mercedes arena · dry · day](../../../artifacts/shots/tracks/nurburgring/s1-mercedes-arena-day-dry.jpg) | ![s1 arena bowl · dry · day](../../../artifacts/shots/tracks/nurburgring/s1-arena-bowl-day-dry.jpg) | ![s1 dunlop bridge · dry · day](../../../artifacts/shots/tracks/nurburgring/s1-dunlop-bridge-day-dry.jpg) |
| s1 mercedes arena; dry; day | s1 arena bowl; dry; day | s1 dunlop bridge; dry; day |
| ![s1 arena exit · dry · day](../../../artifacts/shots/tracks/nurburgring/s1-arena-exit-day-dry.jpg) | | |
| s1 arena exit; dry; day | | |

### Sector 2 — day dry

| | | |
|:---:|:---:|:---:|
| ![s2 infield hairpin · dry · day](../../../artifacts/shots/tracks/nurburgring/s2-infield-hairpin-day-dry.jpg) | ![s2 forest loop · dry · day](../../../artifacts/shots/tracks/nurburgring/s2-forest-loop-day-dry.jpg) | ![s2 ga banks · dry · day](../../../artifacts/shots/tracks/nurburgring/s2-ga-banks-day-dry.jpg) |
| s2 infield hairpin; dry; day | s2 forest loop; dry; day | s2 ga banks; dry; day |
| ![s2 forest camp · dry · day](../../../artifacts/shots/tracks/nurburgring/s2-forest-camp-day-dry.jpg) | ![s2 bit kurve · dry · day](../../../artifacts/shots/tracks/nurburgring/s2-bit-kurve-day-dry.jpg) | ![s2 mid forest · dry · day](../../../artifacts/shots/tracks/nurburgring/s2-mid-forest-day-dry.jpg) |
| s2 forest camp; dry; day | s2 bit kurve; dry; day | s2 mid forest; dry; day |
| ![s2 dunlop kehre · dry · day](../../../artifacts/shots/tracks/nurburgring/s2-dunlop-kehre-day-dry.jpg) | | |
| s2 dunlop kehre; dry; day | | |

### Sector 3 + landmark — day dry

| | | |
|:---:|:---:|:---:|
| ![s3 approach schumacher · dry · day](../../../artifacts/shots/tracks/nurburgring/s3-approach-schumacher-day-dry.jpg) | ![s3 schumacher s · dry · day](../../../artifacts/shots/tracks/nurburgring/s3-schumacher-s-day-dry.jpg) | ![s3 back straight · dry · day](../../../artifacts/shots/tracks/nurburgring/s3-back-straight-day-dry.jpg) |
| s3 approach schumacher; dry; day | s3 schumacher s; dry; day | s3 back straight; dry; day |
| ![s3 veedol · dry · day](../../../artifacts/shots/tracks/nurburgring/s3-veedol-day-dry.jpg) | ![s3 coca cola · dry · day](../../../artifacts/shots/tracks/nurburgring/s3-coca-cola-day-dry.jpg) | ![s3 boulevard · dry · day](../../../artifacts/shots/tracks/nurburgring/s3-boulevard-day-dry.jpg) |
| s3 veedol; dry; day | s3 coca cola; dry; day | s3 boulevard; dry; day |
| ![s3 pit complex · dry · day](../../../artifacts/shots/tracks/nurburgring/s3-pit-complex-day-dry.jpg) | ![landmark burg nurburg · dry · day](../../../artifacts/shots/tracks/nurburgring/landmark-burg-nurburg-day-dry.jpg) | |
| s3 pit complex; dry; day | landmark burg nurburg; dry; day | |

### Mercedes-Arena — time of day (dry)

| | | |
|:---:|:---:|:---:|
| ![s1 mercedes arena · dry · day](../../../artifacts/shots/tracks/nurburgring/s1-mercedes-arena-day-dry.jpg) | ![s1 mercedes arena · dry · dusk](../../../artifacts/shots/tracks/nurburgring/s1-mercedes-arena-dusk-dry.jpg) | ![s1 mercedes arena · dry · night](../../../artifacts/shots/tracks/nurburgring/s1-mercedes-arena-night-dry.jpg) |
| s1 mercedes arena; dry; day | s1 mercedes arena; dry; dusk | s1 mercedes arena; dry; night |
| ![s1 mercedes arena · dry · dawn](../../../artifacts/shots/tracks/nurburgring/s1-mercedes-arena-dawn-dry.jpg) | | |
| s1 mercedes arena; dry; dawn | | |

### Dunlop bridge — time of day (dry)

| | | |
|:---:|:---:|:---:|
| ![s1 dunlop bridge · dry · day](../../../artifacts/shots/tracks/nurburgring/s1-dunlop-bridge-day-dry.jpg) | ![s1 dunlop bridge · dry · dusk](../../../artifacts/shots/tracks/nurburgring/s1-dunlop-bridge-dusk-dry.jpg) | ![s1 dunlop bridge · dry · night](../../../artifacts/shots/tracks/nurburgring/s1-dunlop-bridge-night-dry.jpg) |
| s1 dunlop bridge; dry; day | s1 dunlop bridge; dry; dusk | s1 dunlop bridge; dry; night |

### Dunlop-Kehre — time of day (dry)

| | | |
|:---:|:---:|:---:|
| ![s2 dunlop kehre · dry · day](../../../artifacts/shots/tracks/nurburgring/s2-dunlop-kehre-day-dry.jpg) | ![s2 dunlop kehre · dry · dusk](../../../artifacts/shots/tracks/nurburgring/s2-dunlop-kehre-dusk-dry.jpg) | ![s2 dunlop kehre · dry · night](../../../artifacts/shots/tracks/nurburgring/s2-dunlop-kehre-night-dry.jpg) |
| s2 dunlop kehre; dry; day | s2 dunlop kehre; dry; dusk | s2 dunlop kehre; dry; night |

### Pit complex — time of day (dry)

| | | |
|:---:|:---:|:---:|
| ![s3 pit complex · dry · day](../../../artifacts/shots/tracks/nurburgring/s3-pit-complex-day-dry.jpg) | ![s3 pit complex · dry · dusk](../../../artifacts/shots/tracks/nurburgring/s3-pit-complex-dusk-dry.jpg) | ![s3 pit complex · dry · night](../../../artifacts/shots/tracks/nurburgring/s3-pit-complex-night-dry.jpg) |
| s3 pit complex; dry; day | s3 pit complex; dry; dusk | s3 pit complex; dry; night |

### Burg Nürburg — time of day (dry)

| | | |
|:---:|:---:|:---:|
| ![landmark burg nurburg · dry · day](../../../artifacts/shots/tracks/nurburgring/landmark-burg-nurburg-day-dry.jpg) | ![landmark burg nurburg · dry · dusk](../../../artifacts/shots/tracks/nurburgring/landmark-burg-nurburg-dusk-dry.jpg) | ![landmark burg nurburg · dry · dawn](../../../artifacts/shots/tracks/nurburgring/landmark-burg-nurburg-dawn-dry.jpg) |
| landmark burg nurburg; dry; day | landmark burg nurburg; dry; dusk | landmark burg nurburg; dry; dawn |


## Weather / lighting backlog (not captured yet)

| Priority | View | Conditions to shoot | Issue to watch |
|----------|------|---------------------|----------------|
| P1 | Pit complex | day `overcast`, `wet`, `fog` | `furniture.lamp: "none"` — night/wet already dark; no flood masts |
| P1 | Mercedes-Arena | day `overcast`, `rain` | Fog preset vs `pal.fogDensity` — ensure Eifel haze, not generic grey |
| P2 | Dunlop bridge | day `fog`, `wet` | Under-bridge soffit (fleet QA); yellow fascia legibility in rain |
| P2 | Dunlop-Kehre | day `wet`, `rain` | Wet road + scaffold readability |
| P3 | Burg wide | day `fog`, `overcast` | Distant terrain slab / horizon at extreme orbit |
| P3 | Forest loop | day `fog` | Trench readability when fog multiplies `fogDensity` |

---

## Node VM audit (this branch)

```text
verify-track: OK — surface folds 0
float-audit: 0 floating
clip-audit: 2 severe (baseline cap 2), 4 spots ≥0.5 m after scenery tweak
ground-audit: buried 3 (baseline 3) @ motorhome paddock row
```

## Findings (ranked)

| Rank | Topic | Evidence | Action |
|------|--------|----------|--------|
| 1 | Schumacher-S no open tribune | `s3-schumacher-s-day-dry` | Intentional (`indexSolid`); restore with per-foot `groundUnder` |
| 2 | Night lighting sparse | `*-night-dry` panels | `lamp: "none"` in def — expect dark forest; race-control windows only |
| 3 | Paddock motorhomes buried ≤0.45 m | ground-audit `:286` | Within baseline; gap increase worsened burial (measured) |
| 4 | Clip replay vs scatter | clip-audit @0.383, 0.235 | Baseline cap; skipped `every(32)` on `s∈[0.23,0.26]` (−1 minor pair) |
| 5 | Weather panels missing | — | Follow-up after shared shot tooling PR |

## Changes on this branch

- `js/circuits/scenery/nurburgring.js`: skip broadleaf scatter `s ∈ [0.23, 0.26]` where `forestEdge` owns the treeline (clip-audit minor pair removed).
- `docs/tracks/surveys/nurburgring.md`: this survey.

## Verification

```sh
node tools/track/verify-track.cjs nurburgring
node tools/track/audit-circuit.cjs nurburgring
```
