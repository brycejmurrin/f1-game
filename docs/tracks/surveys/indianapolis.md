# Indianapolis Motor Speedway (road course) — circuit survey

**Date:** 2026-10-14  
**Circuit id:** `indianapolis`  
**Live:** https://brycejmurrin.github.io/f1-game/  
**Brief:** `docs/tracks/indianapolis.md`  
**Shots:** 36 JPEGs in `artifacts/shots/tracks/indianapolis/` (1280px max, q≈80, under 300 KB; `git add -f`). Six hero views × six `tod`/`weather` combinations each (shared `shot.mjs` batch after rebase on `cursor/shared-shot-tooling-5b45`).

## Code map

| Layer | Path | Role |
|-------|------|------|
| Track def | `js/circuits/indianapolis.js` | OSM centreline (`path.len` 4088 m), `startFrac` 0, `pit.side` +1, `bankZones` @ 0.88 (9° oval T1), `dressingExclusions` (no generic city; foliage bands), Midwest `pal`, `cityStyle` brick/slab |
| Scenery | `js/circuits/scenery/indianapolis.js` | Oval `grandstandEx` wall, required modelGroups (pagoda, pylon, pits, main stands, museum), bricks, Gasoline Alley, infield gravel/stands, retaining wall, flood masts, golf campus, Speedway town ring |
| Landmarks | `tests/data/landmarks/indianapolis.json` | `indy-pagoda`, `indy-scoring-pylon`, `indy-pit-stalls`, `indy-main-stands`, `indy-museum` |
| Lighting presets | `js/lighting/presets.js` | Full `indianapolis|{dawn,day,dusk,night}|{dry,wet,rain,overcast,fog}` table; def has `night: false` (calendar) but `setTimeOfDay` still applies in probes |

**Sides (built centreline):** IN = +1 infield, OUT = −1 outer oval; F1 road course runs clockwise.

## Theme and models

- **Palette:** Hazy summer sky/grass per def `pal`; IMS navy / white / crimson seat bands on stands.
- **Hero landmarks:** Pagoda (tiered core), scoring pylon (amber digits), yard of bricks @ K(0), open pit stalls, Paddock stand opposite pagoda, museum + Brickyard Crossing ponds/fairways.
- **Oval stadium:** Continuous outside grandstand bays, white concrete retaining wall, lattice flood masts (`light: false`, `pool: false` — day-authored).
- **Infield:** 6.4 m hw zones, guardrail, sparse trees, temporary bleachers/scaffold, gravel + tyre walls.

## Capture method

- **Tool:** `node tools/shot/shot.mjs --batch /tmp/indy-weather-jobs.json --jpeg --present-timeout 90 --capture-retries 4 --wait 120` (SwiftShader default; no `APEX_GL=llvmpipe`).
- **Count:** 36 JPEGs — six hero views, six labelled `tod`/`weather` frames each (`dry` + `wet|rain|overcast|fog|storm` and `day|dawn|dusk|night` as listed per hero).
- **Paths in panels:** `../../../artifacts/shots/tracks/indianapolis/<file>.jpg` from this file.

## Survey panels (hero views × weather / time of day)

### Hero A — Start/finish orbit (s=0)

| | | |
|:---:|:---:|:---:|
| ![sf-orbit__day-dry.jpg](../../../artifacts/shots/tracks/indianapolis/sf-orbit__day-dry.jpg)<br/>*orbit · dry · day* | ![sf-orbit__dawn-dry.jpg](../../../artifacts/shots/tracks/indianapolis/sf-orbit__dawn-dry.jpg)<br/>*orbit · dry · dawn* | ![sf-orbit__dusk-dry.jpg](../../../artifacts/shots/tracks/indianapolis/sf-orbit__dusk-dry.jpg)<br/>*orbit · dry · dusk* |
| ![sf-orbit__night-dry.jpg](../../../artifacts/shots/tracks/indianapolis/sf-orbit__night-dry.jpg)<br/>*orbit · dry · night* | ![sf-orbit__day-rain.jpg](../../../artifacts/shots/tracks/indianapolis/sf-orbit__day-rain.jpg)<br/>*orbit · rain · day* | ![sf-orbit__day-fog.jpg](../../../artifacts/shots/tracks/indianapolis/sf-orbit__day-fog.jpg)<br/>*orbit · fog · day* |

### Hero B — Banked oval Turn 1 (s≈0.88)

| | | |
|:---:|:---:|:---:|
| ![banked-t1-orbit__day-dry.jpg](../../../artifacts/shots/tracks/indianapolis/banked-t1-orbit__day-dry.jpg)<br/>*orbit · dry · day* | ![banked-t1-orbit__dawn-dry.jpg](../../../artifacts/shots/tracks/indianapolis/banked-t1-orbit__dawn-dry.jpg)<br/>*orbit · dry · dawn* | ![banked-t1-orbit__dusk-dry.jpg](../../../artifacts/shots/tracks/indianapolis/banked-t1-orbit__dusk-dry.jpg)<br/>*orbit · dry · dusk* |
| ![banked-t1-orbit__night-dry.jpg](../../../artifacts/shots/tracks/indianapolis/banked-t1-orbit__night-dry.jpg)<br/>*orbit · dry · night* | ![banked-t1-orbit__day-wet.jpg](../../../artifacts/shots/tracks/indianapolis/banked-t1-orbit__day-wet.jpg)<br/>*orbit · wet · day* | ![banked-t1-orbit__day-overcast.jpg](../../../artifacts/shots/tracks/indianapolis/banked-t1-orbit__day-overcast.jpg)<br/>*orbit · overcast · day* |

### Hero C — Pagoda (s≈0.005)

| | | |
|:---:|:---:|:---:|
| ![pagoda-hero__day-dry.jpg](../../../artifacts/shots/tracks/indianapolis/pagoda-hero__day-dry.jpg)<br/>*orbit · dry · day* | ![pagoda-hero__dawn-dry.jpg](../../../artifacts/shots/tracks/indianapolis/pagoda-hero__dawn-dry.jpg)<br/>*orbit · dry · dawn* | ![pagoda-hero__dusk-dry.jpg](../../../artifacts/shots/tracks/indianapolis/pagoda-hero__dusk-dry.jpg)<br/>*orbit · dry · dusk* |
| ![pagoda-hero__night-dry.jpg](../../../artifacts/shots/tracks/indianapolis/pagoda-hero__night-dry.jpg)<br/>*orbit · dry · night* | ![pagoda-hero__day-rain.jpg](../../../artifacts/shots/tracks/indianapolis/pagoda-hero__day-rain.jpg)<br/>*orbit · rain · day* | ![pagoda-hero__day-wet.jpg](../../../artifacts/shots/tracks/indianapolis/pagoda-hero__day-wet.jpg)<br/>*orbit · wet · day* |

### Hero D — Mid infield (s≈0.50)

| | | |
|:---:|:---:|:---:|
| ![infield-mid-orbit__day-dry.jpg](../../../artifacts/shots/tracks/indianapolis/infield-mid-orbit__day-dry.jpg)<br/>*orbit · dry · day* | ![infield-mid-orbit__dusk-dry.jpg](../../../artifacts/shots/tracks/indianapolis/infield-mid-orbit__dusk-dry.jpg)<br/>*orbit · dry · dusk* | ![infield-mid-orbit__night-dry.jpg](../../../artifacts/shots/tracks/indianapolis/infield-mid-orbit__night-dry.jpg)<br/>*orbit · dry · night* |
| ![infield-mid-orbit__day-rain.jpg](../../../artifacts/shots/tracks/indianapolis/infield-mid-orbit__day-rain.jpg)<br/>*orbit · rain · day* | ![infield-mid-orbit__day-fog.jpg](../../../artifacts/shots/tracks/indianapolis/infield-mid-orbit__day-fog.jpg)<br/>*orbit · fog · day* | ![infield-mid-orbit__day-overcast.jpg](../../../artifacts/shots/tracks/indianapolis/infield-mid-orbit__day-overcast.jpg)<br/>*orbit · overcast · day* |

### Hero E — Museum & golf (s≈0.805)

| | | |
|:---:|:---:|:---:|
| ![museum-golf-campus__day-dry.jpg](../../../artifacts/shots/tracks/indianapolis/museum-golf-campus__day-dry.jpg)<br/>*orbit · dry · day* | ![museum-golf-campus__dawn-dry.jpg](../../../artifacts/shots/tracks/indianapolis/museum-golf-campus__dawn-dry.jpg)<br/>*orbit · dry · dawn* | ![museum-golf-campus__dusk-dry.jpg](../../../artifacts/shots/tracks/indianapolis/museum-golf-campus__dusk-dry.jpg)<br/>*orbit · dry · dusk* |
| ![museum-golf-campus__night-dry.jpg](../../../artifacts/shots/tracks/indianapolis/museum-golf-campus__night-dry.jpg)<br/>*orbit · dry · night* | ![museum-golf-campus__day-fog.jpg](../../../artifacts/shots/tracks/indianapolis/museum-golf-campus__day-fog.jpg)<br/>*orbit · fog · day* | ![museum-golf-campus__day-wet.jpg](../../../artifacts/shots/tracks/indianapolis/museum-golf-campus__day-wet.jpg)<br/>*orbit · wet · day* |

### Hero F — Pit stalls (s≈0.955)

| | | |
|:---:|:---:|:---:|
| ![pit-stalls__day-dry.jpg](../../../artifacts/shots/tracks/indianapolis/pit-stalls__day-dry.jpg)<br/>*trackside · dry · day* | ![pit-stalls__dusk-dry.jpg](../../../artifacts/shots/tracks/indianapolis/pit-stalls__dusk-dry.jpg)<br/>*trackside · dry · dusk* | ![pit-stalls__night-dry.jpg](../../../artifacts/shots/tracks/indianapolis/pit-stalls__night-dry.jpg)<br/>*trackside · dry · night* |
| ![pit-stalls__day-rain.jpg](../../../artifacts/shots/tracks/indianapolis/pit-stalls__day-rain.jpg)<br/>*trackside · rain · day* | ![pit-stalls__day-overcast.jpg](../../../artifacts/shots/tracks/indianapolis/pit-stalls__day-overcast.jpg)<br/>*trackside · overcast · day* | ![pit-stalls__day-storm.jpg](../../../artifacts/shots/tracks/indianapolis/pit-stalls__day-storm.jpg)<br/>*trackside · storm · day* |

### Weather / lighting backlog (from captures)

| Issue | Severity | Evidence | Notes |
|-------|----------|----------|-------|
| Oval flood masts dark at night | Med | `sf-orbit__night-dry.jpg`, `banked-t1-orbit__night-dry.jpg` | `floodMast(..., { light: false, pool: false })` — lattice only |
| Rain readability | Low | `sf-orbit__day-rain.jpg`, `pit-stalls__day-rain.jpg` | Wet road + rain particles read; stands stay legible |
| Fog / overcast horizon | Info | `museum-golf-campus__day-fog.jpg`, `banked-t1-orbit__day-overcast.jpg` | Fog washes distant town treeline; overcast flattens contrast on seat bands |
| Storm at pits | Info | `pit-stalls__day-storm.jpg` | Dark sky + rain streaks; pit roof silhouette holds |

## Node-VM audit

```sh
node tools/track/verify-track.cjs indianapolis
node tools/track/audit-circuit.cjs indianapolis
```

| Check | Result (post-fix branch) |
|-------|---------------------------|
| verify-track | OK; surface folds 0 |
| float | 0 |
| clip | 0 severe |
| coplanar | 1 spot (retaining-wall neighbours, within baseline) |
| ground | flatCoplanar 1 @ `indy-main-stands` seats (within baseline) |
| props tris | 272 707 (unchanged) |

## Findings (geometry & dressing)

| Severity | Topic | Evidence | Action |
|----------|-------|----------|--------|
| **Fixed** | Flood mast vs stand roof clip | `banked-t1-orbit__day-dry.jpg` (pre-fix sector shot) | `floodMast` gap 48→56 m, h 34→32 m in scenery |
| **Fixed** | Retaining-wall coplanar | `coplanar-audit` | Alternate slab radial offset 30→48 mm |
| Med | Inner bowl stands missing | Brief §4; SF hero | IN-side terraces s 0.90–0.20 not authored |
| Med | Night oval lighting | Night hero frames | Enable lamp pools on flood masts or lighting-tuner gate |
| Low | Main-stand seat coplanar | ground-audit | 12.4 m² @ `emitMain` (baseline) |

## Ranked improvements

1. Inner bowl stands (`spectatorHill` or grounded bleachers) facing front stretch.
2. Night flood-mast lamp emission when `night` races are enabled.
3. Gasoline Alley / pit terrain splice (needs sector capture if revisited).
4. Main-stand coplanar micro-lift between seat tiers.

## Fixes in this PR (circuit-scoped only)

- `js/circuits/scenery/indianapolis.js`: flood mast setback; retaining-wall stagger (see audit table).
