# Madrid (Madring) — circuit survey

**Date:** 2026-10-14 (expanded weather pass)  
**Branch:** `cursor/madrid-survey-fixes-8e02`  
**Live:** [brycejmurrin.github.io/f1-game](https://brycejmurrin.github.io/f1-game/)  
**Brief:** `docs/tracks/madrid.md`  
**Captures:** `../../../artifacts/shots/tracks/madrid/` (39 frames, `capture-jobs.json` reproducible via `node tools/shot/shot.mjs --batch … --backend webgl2 --gpu llvmpipe`)

## Code map

| Layer | Path | Role |
|--------|------|------|
| Track def | `js/circuits/madrid.js` | OSM centreline, `bankZones` (La Monumental 13.5° @ s≈0.75), elevations (El Búnker), `dressingExclusions` (lap-wide generic `city` off; foliage cuts in urban + IFEMA sectors) |
| Scenery | `js/circuits/scenery/madrid.js` | IFEMA halls, S/F tribuna, overpasses, El Búnker wall, urban blocks, Cuatro Torres, Barajas tower/airliner, Monumental hero + banking fins |
| Engine | `js/track/tracks.js` | Generic city/foliage/lighting passes honour `dressingExclusions` |
| Landmarks | `tests/data/landmarks/madrid.json` | `madrid-monumental-stands`, `madrid-sf-tribuna` |

**Built centreline:** ~5.34 km; min radius 9.43 m @ node 329; **surface folds 0**.

**Weather / TOD API:** `__apex.race(track, tod, wx)` with `tod` ∈ `day|dawn|dusk|night`, `wx` ∈ `dry|wet|rain|overcast|fog` (`js/agent/apex.js`, `js/race/weather-arc.js`). Shots use `tools/shot/shot.mjs` batch `wx` / `tod` fields (2026-10-14).

## Sector tour — day / dry (baseline)

| | | |
|:---:|:---:|:---:|
| ![S/F pit](../../../artifacts/shots/tracks/madrid/s01-sf-day-dry-park.png)<br>**s01** s=0.00 park | ![IFEMA / Barajas bearing](../../../artifacts/shots/tracks/madrid/s02-ifema-barajas-day-dry-orbit.png)<br>**s02** s=0.02 orbit | ![Motorway overpass](../../../artifacts/shots/tracks/madrid/s03-overpass-day-dry-eye.png)<br>**s03** s=0.085 eye |
| ![Deck avenue](../../../artifacts/shots/tracks/madrid/s04-deck-avenue-day-dry-park.png)<br>**s04** s=0.135 | ![Chicane sector](../../../artifacts/shots/tracks/madrid/s05-chicane-day-dry-orbit.png)<br>**s05** s=0.12 | ![Plains runoff](../../../artifacts/shots/tracks/madrid/s06-plains-day-dry-orbit.png)<br>**s06** s=0.22 |
| ![Urban S2](../../../artifacts/shots/tracks/madrid/s07-urban-s2-day-dry-orbit.png)<br>**s07** s=0.32 | ![Cuatro Torres horizon](../../../artifacts/shots/tracks/madrid/s08-cuatro-torres-day-dry-orbit.png)<br>**s08** s=0.40 | ![El Búnker](../../../artifacts/shots/tracks/madrid/s09-el-bunker-day-dry-park.png)<br>**s09** s=0.48 |
| ![Búnker trackside](../../../artifacts/shots/tracks/madrid/s10-el-bunker-day-dry-trackside.png)<br>**s10** s=0.50 | ![S2 exit](../../../artifacts/shots/tracks/madrid/s11-s2-exit-day-dry-orbit.png)<br>**s11** s=0.58 | ![Sierra plains](../../../artifacts/shots/tracks/madrid/s12-sierra-plains-day-dry-orbit.png)<br>**s12** s=0.62 |
| ![Monumental entry](../../../artifacts/shots/tracks/madrid/s13-monumental-entry-day-dry-park.png)<br>**s13** s=0.72 | ![Banked bowl](../../../artifacts/shots/tracks/madrid/s14-monumental-bank-day-dry-eye.png)<br>**s14** s=0.78 eye | ![Pelouse](../../../artifacts/shots/tracks/madrid/s15-pelouse-day-dry-orbit.png)<br>**s15** s=0.84 |
| ![IFEMA bridge](../../../artifacts/shots/tracks/madrid/s16-ifema-bridge-day-dry-eye.png)<br>**s16** s=0.885 | ![IFEMA stands](../../../artifacts/shots/tracks/madrid/s17-ifema-stands-day-dry-park.png)<br>**s17** s=0.90 | ![Closing sector](../../../artifacts/shots/tracks/madrid/s18-closing-day-dry-orbit.png)<br>**s18** s=0.96 |

## La Monumental (s≈0.78) — weather & lighting

| | | |
|:---:|:---:|:---:|
| ![day dry](../../../artifacts/shots/tracks/madrid/s14-monumental-bank-day-dry-eye.png)<br>day · dry | ![dusk dry](../../../artifacts/shots/tracks/madrid/wx-monumental-dusk-dry-eye.png)<br>dusk · dry | ![night dry](../../../artifacts/shots/tracks/madrid/wx-monumental-night-dry-eye.png)<br>night · dry |
| ![overcast](../../../artifacts/shots/tracks/madrid/wx-monumental-day-overcast-eye.png)<br>day · overcast | ![rain](../../../artifacts/shots/tracks/madrid/wx-monumental-day-rain-eye.png)<br>day · rain | ![fog](../../../artifacts/shots/tracks/madrid/wx-monumental-day-fog-eye.png)<br>day · fog |
| ![wet](../../../artifacts/shots/tracks/madrid/wx-monumental-day-wet-eye.png)<br>day · wet | | |

**Lighting notes:** Custom `floodMast` ring reads at night; `dressingExclusions` removes generic `lighting` s=0.68–0.83 so rim relies on bespoke masts (acceptable). Fog/overcast flatten Sierra backdrop — expected. Rain streaks readable; no new z-fight under overpass from this pass.

## Start / finish (s≈0.00)

| | | |
|:---:|:---:|:---:|
| ![day dry](../../../artifacts/shots/tracks/madrid/s01-sf-day-dry-park.png)<br>day · dry | ![dusk](../../../artifacts/shots/tracks/madrid/wx-sf-dusk-dry-park.png)<br>dusk · dry | ![night](../../../artifacts/shots/tracks/madrid/wx-sf-night-dry-park.png)<br>night · dry |
| ![overcast](../../../artifacts/shots/tracks/madrid/wx-sf-day-overcast-park.png)<br>day · overcast | ![rain](../../../artifacts/shots/tracks/madrid/wx-sf-day-rain-park.png)<br>day · rain | ![fog](../../../artifacts/shots/tracks/madrid/wx-sf-day-fog-park.png)<br>day · fog |

**Lighting notes:** Pit straight lamps present at night; crimson tribuna loses sun accent at night (preset-driven). Rain darkens tarmac without obvious shader pops.

## Motorway overpass (s≈0.085)

| | | |
|:---:|:---:|:---:|
| ![day dry](../../../artifacts/shots/tracks/madrid/s03-overpass-day-dry-eye.png)<br>day · dry | ![night](../../../artifacts/shots/tracks/madrid/wx-overpass-night-dry-eye.png)<br>night · dry | ![rain](../../../artifacts/shots/tracks/madrid/wx-overpass-day-rain-eye.png)<br>day · rain |
| ![fog](../../../artifacts/shots/tracks/madrid/wx-overpass-day-fog-eye.png)<br>day · fog | | |

**Lighting notes:** Soffit fix (2026-09) holds — no underside z-fight in dry/night/fog captures. Under-deck still reads dark (intended `soffit` plate).

## El Búnker (s≈0.48)

| | | |
|:---:|:---:|:---:|
| ![day dry](../../../artifacts/shots/tracks/madrid/s09-el-bunker-day-dry-park.png)<br>day · dry | ![dusk](../../../artifacts/shots/tracks/madrid/wx-bunker-dusk-dry-park.png)<br>dusk · dry | ![overcast](../../../artifacts/shots/tracks/madrid/wx-bunker-day-overcast-park.png)<br>day · overcast |
| ![wet](../../../artifacts/shots/tracks/madrid/wx-bunker-day-wet-park.png)<br>day · wet | | |

**Notes:** Retaining wall + slot bands legible; urban blocks continuous (seam fix s=0.27–0.30). Generic trees suppressed in sector (dressing fix).

## Cuatro Torres skyline (s≈0.40)

| | | |
|:---:|:---:|:---:|
| ![day dry](../../../artifacts/shots/tracks/madrid/s08-cuatro-torres-day-dry-orbit.png)<br>day · dry | ![dawn dry](../../../artifacts/shots/tracks/madrid/wx-torres-dawn-dry-orbit.png)<br>dawn · dry | ![dusk overcast](../../../artifacts/shots/tracks/madrid/wx-torres-dusk-overcast-orbit.png)<br>dusk · overcast |

**Notes:** CTBA cluster visible as blue-grey mass; dawn warms horizon; overcast merges towers into haze (acceptable for Madrid summer heat).

## IFEMA access bridge (s≈0.885)

| | | |
|:---:|:---:|:---:|
| ![day dry](../../../artifacts/shots/tracks/madrid/s16-ifema-bridge-day-dry-eye.png)<br>day · dry | ![night](../../../artifacts/shots/tracks/madrid/wx-bridge-night-dry-eye.png)<br>night · dry | ![rain](../../../artifacts/shots/tracks/madrid/wx-bridge-day-rain-eye.png)<br>day · rain |

## Geometry & audit (2026-10-14)

| Check | Result |
|--------|--------|
| `verify-track` | OK — folds **0**, props **216207** verts |
| `audit-circuit` | OK — float **2** (cap), clip severe **1** (baseline 2), coplanar **6**, ground within baseline |
| Props tris | **217906** (−14k vs pre-foliage-cut) |

## Findings backlog

| Priority | Issue | Weather/TOD | Scope |
|----------|--------|-------------|--------|
| P1 | Generic plane trees vs urban blocks (was 2 m clip @ s≈0.47) | day dry | **Fixed** — `foliage` exclusion s=0.26–0.58 |
| P1 | Plaza vs mansard overlap @ s≈0.55 | day dry | **Fixed** — plaza moved to s=0.53, gap 108 |
| P1 | IFEMA stand vs trees @ s≈0.89 | day dry | **Fixed** — `foliage` exclusion s=0.87–0.93 |
| P2 | Barajas tower/airliner hard to spot from driving cameras | all | scenery bearing OK; consider taller tower silhouette |
| P2 | Monumental buttress fins read as chunky pylons | day dry | scenery fin mesh |
| P2 | Night Monumental: rely on sparse bespoke floods (generic lighting excluded) | night | def exclusion or add lamp pass in scenery only |
| P3 | Urban concrete wall vertical seams | day dry | local wall emitters |
| P3 | Avenue office vs trees @ s≈0.14–0.18 (0.5–0.7 m clip) | day dry | foliage band or gap |
| P3 | Barajas airliner float @ 90 m (intentional backdrop) | all | baselined float cap 2 |

## Fixes in this PR

1. `js/circuits/madrid.js` — `dressingExclusions` foliage bands (urban + IFEMA pelouse).
2. `js/circuits/scenery/madrid.js` — El Búnker plaza patch reposition.
3. `tools/shot/shot.mjs` + `shot-jobs.mjs` — batch `wx` / `weather` for survey captures.
4. `.gitignore` — allow `artifacts/shots/tracks/**` for committed survey PNGs.

## Verification

```sh
node tools/track/verify-track.cjs madrid
node tools/track/audit-circuit.cjs madrid --json
node --test tests/unit/shot-jobs.test.mjs
```
