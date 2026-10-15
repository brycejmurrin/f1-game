# Indianapolis Motor Speedway (road course) — circuit survey

**Date:** 2026-10-14  
**Circuit id:** `indianapolis`  
**Live:** https://brycejmurrin.github.io/f1-game/  
**Brief:** `docs/tracks/indianapolis.md`  
**Shots:** 34 JPEGs in `artifacts/shots/tracks/indianapolis/` (1280px max, q≈80, under 300 KB each; committed on branch via `git add -f`). **Weather matrix** (wet/rain/fog/overcast) deferred until shared shot batch tooling lands.

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

- **Tool:** `node tools/shot/shot.mjs --batch` (stock CLI: `tod` in batch; batch `weather` pending shared tooling PR).
- **Count:** 34 JPEGs — 28 sector frames @ day/dry, plus 6 dusk/night repeats (SF, banked T1, pagoda, pits).
- **Paths in panels:** relative from this file → `../../../artifacts/shots/tracks/indianapolis/<file>.jpg`.

## Survey panels (by sector)

### A — Start / finish & paddock

| | | |
|:---:|:---:|:---:|
| ![SF orbit s=0](../../../artifacts/shots/tracks/indianapolis/sf-orbit.jpg)<br/>*orbit · dry · day* | ![SF bricks & pylon](../../../artifacts/shots/tracks/indianapolis/sf-trackside-bricks.jpg)<br/>*trackside · dry · day* | ![Pagoda from SF](../../../artifacts/shots/tracks/indianapolis/sf-orbit-pagoda-face.jpg)<br/>*orbit · dry · day* |
| ![Pagoda s≈0.005](../../../artifacts/shots/tracks/indianapolis/pagoda-hero.jpg)<br/>*orbit · dry · day* | ![Scoring pylon s≈0.03](../../../artifacts/shots/tracks/indianapolis/scoring-pylon.jpg)<br/>*orbit · dry · day* | ![Pit stalls s≈0.955](../../../artifacts/shots/tracks/indianapolis/pit-stalls.jpg)<br/>*trackside · dry · day* |
| ![Gasoline Alley s≈0.92](../../../artifacts/shots/tracks/indianapolis/gasoline-alley.jpg)<br/>*orbit · dry · day* | ![Infield parking s≈0.04](../../../artifacts/shots/tracks/indianapolis/sf-parking-infield.jpg)<br/>*orbit · dry · day* | |

### B — Oval bowl & banking

| | | |
|:---:|:---:|:---:|
| ![Oval stand wall s≈0.78](../../../artifacts/shots/tracks/indianapolis/oval-stand-wall.jpg)<br/>*orbit · dry · day* | ![Short chute s≈0.76](../../../artifacts/shots/tracks/indianapolis/oval-short-chute.jpg)<br/>*orbit · dry · day* | ![Banked T1 s≈0.88](../../../artifacts/shots/tracks/indianapolis/banked-t1-chase.jpg)<br/>*park chase · dry · day* |
| ![Banked T1](../../../artifacts/shots/tracks/indianapolis/banked-t1-orbit.jpg)<br/>*orbit · dry · day* | ![Banked T1](../../../artifacts/shots/tracks/indianapolis/banked-t1-trackside.jpg)<br/>*trackside · dry · day* | ![Spectator hill s≈0.11](../../../artifacts/shots/tracks/indianapolis/spectator-hill-t1.jpg)<br/>*orbit · dry · day* |

### C — Road-course infield

| | | |
|:---:|:---:|:---:|
| ![F1 T1 off straight s≈0.145](../../../artifacts/shots/tracks/indianapolis/f1-t1-chase.jpg)<br/>*park chase · dry · day* | ![F1 T1](../../../artifacts/shots/tracks/indianapolis/f1-t1-orbit.jpg)<br/>*orbit · dry · day* | ![Infield s≈0.25](../../../artifacts/shots/tracks/indianapolis/infield-t2.jpg)<br/>*orbit · dry · day* |
| ![Gravel s≈0.30](../../../artifacts/shots/tracks/indianapolis/infield-gravel-a.jpg)<br/>*orbit · dry · day* | ![Aerial s≈0.40](../../../artifacts/shots/tracks/indianapolis/infield-aerial.jpg)<br/>*eye · dry · day* | ![Mid infield s≈0.50](../../../artifacts/shots/tracks/indianapolis/infield-mid-orbit.jpg)<br/>*orbit · dry · day* |
| ![Scaffold stand s≈0.52](../../../artifacts/shots/tracks/indianapolis/infield-scaffold-stand.jpg)<br/>*orbit · dry · day* | ![Sector 2 s≈0.55](../../../artifacts/shots/tracks/indianapolis/sector2-apex.jpg)<br/>*orbit · dry · day* | ![Late infield s≈0.66](../../../artifacts/shots/tracks/indianapolis/infield-late-chase.jpg)<br/>*park chase · dry · day* |
| ![Gravel s≈0.66](../../../artifacts/shots/tracks/indianapolis/infield-gravel-c.jpg)<br/>*trackside · dry · day* | ![Rejoin s≈0.74](../../../artifacts/shots/tracks/indianapolis/sector3-rejoin.jpg)<br/>*orbit · dry · day* | |

### D — Museum / golf / horizon

| | | |
|:---:|:---:|:---:|
| ![Museum & golf s≈0.805](../../../artifacts/shots/tracks/indianapolis/museum-golf-campus.jpg)<br/>*orbit · dry · day* | ![Golf pond s≈0.60](../../../artifacts/shots/tracks/indianapolis/golf-pond-b.jpg)<br/>*orbit · dry · day* | ![Speedway town s≈0.08](../../../artifacts/shots/tracks/indianapolis/speedway-town-horizon.jpg)<br/>*orbit · dry · day* |

### Time-of-day variants (dry)

| | | |
|:---:|:---:|:---:|
| ![SF orbit s=0](../../../artifacts/shots/tracks/indianapolis/sf-orbit-dusk.jpg)<br/>*orbit · dry · dusk* | ![SF orbit s=0](../../../artifacts/shots/tracks/indianapolis/sf-orbit-night.jpg)<br/>*orbit · dry · night* | ![Banked T1 s≈0.88](../../../artifacts/shots/tracks/indianapolis/banked-t1-orbit-dusk.jpg)<br/>*orbit · dry · dusk* |
| ![Banked T1 s≈0.88](../../../artifacts/shots/tracks/indianapolis/banked-t1-orbit-night.jpg)<br/>*orbit · dry · night* | ![Pagoda s≈0.005](../../../artifacts/shots/tracks/indianapolis/pagoda-hero-dusk.jpg)<br/>*orbit · dry · dusk* | ![Pit stalls s≈0.955](../../../artifacts/shots/tracks/indianapolis/pit-stalls-night.jpg)<br/>*trackside · dry · night* |

### Lighting-specific backlog (from TOD passes)

| Issue | Severity | Evidence | Notes |
|-------|----------|----------|-------|
| Oval flood masts dark at night | Med | `sf-orbit-night.jpg`, `banked-t1-orbit-night.jpg` | `floodMast(..., { light: false, pool: false })` — lattice geometry only; presets exist in `presets.js` but lamps do not emit |
| Pit / pagoda readable at night | Low | `pit-stalls-night.jpg` | Ambient night preset sufficient for silhouettes; no dedicated pit lighting |
| Dusk warmth on stands | Info | `sf-orbit-dusk.jpg` | `indianapolis\|dusk\|dry` preset tints read well on navy/crimson seats |
| Weather not surveyed | — | — | After shared tooling: repeat SF, bank, pagoda, infield-mid, museum, pit @ rain/fog/wet/overcast |

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
| **Fixed** | Flood mast vs stand roof clip | `banked-t1-orbit.jpg` (pre-fix) | `floodMast` gap 48→56 m, h 34→32 m in scenery |
| **Fixed** | Retaining-wall coplanar | `coplanar-audit` | Alternate slab radial offset 30→48 mm |
| Med | Inner bowl stands missing | Brief §4; SF orbit | IN-side terraces s 0.90–0.20 not authored; bleacher trial → unsupported legs (ground-audit) — use `spectatorHill` + footing |
| Med | Night oval lighting | TOD night panels | Enable lamp pools on flood masts when `night` race allowed, or gate via lighting-tuner |
| Low | Gasoline Alley terrain wedge | `gasoline-alley.jpg` | Dark inner-edge splice ~0.92; centreline clean — likely terrain/road join near pit complex |
| Low | Main-stand seat coplanar | ground-audit | 12.4 m² @ `emitMain` line 90 (baseline) |
| Low | Infield sparsity | Mid-orbit panels | Intentional golf openness; could add fairway signage |

## Ranked improvements

1. Rebase → capture **weather matrix** (6 anchors × dry/wet/rain/overcast/fog) with shared shot batch + commit PNGs via gitignore exception.
2. Inner bowl stands (`spectatorHill` or grounded bleachers) facing front stretch.
3. Night flood-mast lamp emission (scenery `light`/`pool` or lighting preset) — circuit is `night: false` but TOD night is used in menus/replays.
4. Gasoline Alley / pit terrain splice investigation (engine terrain step).
5. Main-stand coplanar micro-lift between seat tiers.

## Fixes in this PR (circuit-scoped only)

- `js/circuits/scenery/indianapolis.js`: flood mast setback; retaining-wall stagger (see audit table).
