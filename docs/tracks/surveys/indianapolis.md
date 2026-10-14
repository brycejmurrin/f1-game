# Indianapolis Motor Speedway (road course) — circuit survey

**Date:** 2026-10-14  
**Circuit id:** `indianapolis`  
**Live:** https://brycejmurrin.github.io/f1-game/  
**Brief:** `docs/tracks/indianapolis.md`  
**Shots on disk:** `artifacts/shots/tracks/indianapolis/` (34 frames, day default + six time-of-day variants; **weather matrix deferred** until shared shot tooling PR lands — see PR handoff)

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

- **Tool:** `node tools/shot/shot.mjs --batch` (stock CLI: `tod` only; no batch `weather` until shared tooling PR).
- **Count:** 34 PNGs — 28 sector landmarks @ `tod: day`, plus 6 `dusk` / `night` repeats on key views (SF, banked T1, pagoda, pit).
- **Pending:** dry/wet/rain/overcast/fog matrix on 4–6 anchors after rebase on `tools: shared shot tooling for circuit surveys`.

## Sector panels (day / dry)

Paths are repo-relative; PNGs live under `artifacts/shots/tracks/indianapolis/` (gitignored until shared `.gitignore` exception).

### A — Start / finish & paddock (s ≈ 0.00–0.05, 0.92–0.98)

| Panel | Panel | Panel |
|-------|-------|-------|
| `sf-orbit.png` — SF orbit s=0 | `sf-trackside-bricks.png` — bricks + pylon | `sf-orbit-pagoda-face.png` — pagoda from SF |
| `pagoda-hero.png` — pagoda s≈0.005 | `scoring-pylon.png` — pylon s≈0.03 | `pit-stalls.png` — pit stalls s≈0.955 |
| `gasoline-alley.png` — Gasoline Alley s≈0.92 | `sf-parking-infield.png` — infield parking s≈0.04 | |

### B — Oval bowl & banking (s ≈ 0.76–0.91)

| Panel | Panel | Panel |
|-------|-------|-------|
| `oval-stand-wall.png` — stand wall s≈0.78 | `oval-short-chute.png` — short chute s≈0.76 | `banked-t1-chase.png` — banked T1 chase s≈0.88 |
| `banked-t1-orbit.png` — banked T1 orbit | `banked-t1-trackside.png` — banked T1 trackside | `spectator-hill-t1.png` — spectator hill s≈0.11 |

### C — Road-course infield (s ≈ 0.14–0.74)

| Panel | Panel | Panel |
|-------|-------|-------|
| `f1-t1-chase.png` — F1 T1 off straight s≈0.145 | `f1-t1-orbit.png` — F1 T1 orbit | `infield-t2.png` — infield s≈0.25 |
| `infield-gravel-a.png` — gravel s≈0.30 | `infield-aerial.png` — aerial s≈0.40 | `infield-mid-orbit.png` — mid s≈0.50 |
| `infield-scaffold-stand.png` — scaffold s≈0.52 | `sector2-apex.png` — sector 2 s≈0.55 | `infield-late-chase.png` — late s≈0.66 |
| `infield-gravel-c.png` — gravel s≈0.66 | `sector3-rejoin.png` — rejoin s≈0.74 | |

### D — Museum / golf / horizon (s ≈ 0.08, 0.60, 0.805)

| Panel | Panel | Panel |
|-------|-------|-------|
| `museum-golf-campus.png` — museum + golf s≈0.805 | `golf-pond-b.png` — pond s≈0.60 | `speedway-town-horizon.png` — town horizon s≈0.08 |

## Time-of-day variants (key views only)

Stock `shot.mjs` supports `tod` in batch jobs (`dawn|day|dusk|night`). Weather (`dry|wet|rain|overcast|fog`) batch support is **blocked** on this branch.

| Panel | Panel | Panel |
|-------|-------|-------|
| `sf-orbit.png` — SF **day** | `sf-orbit-dusk.png` — SF **dusk** | `sf-orbit-night.png` — SF **night** |
| `banked-t1-orbit.png` — bank **day** | `banked-t1-orbit-dusk.png` — bank **dusk** | `banked-t1-orbit-night.png` — bank **night** |
| `pagoda-hero.png` — pagoda **day** | `pagoda-hero-dusk.png` — pagoda **dusk** | `pit-stalls-night.png` — pits **night** |

### Lighting-specific backlog (from TOD passes)

| Issue | Severity | Evidence | Notes |
|-------|----------|----------|-------|
| Oval flood masts dark at night | Med | `sf-orbit-night.png`, `banked-t1-orbit-night.png` | `floodMast(..., { light: false, pool: false })` — lattice geometry only; presets exist in `presets.js` but lamps do not emit |
| Pit / pagoda readable at night | Low | `pit-stalls-night.png` | Ambient night preset sufficient for silhouettes; no dedicated pit lighting |
| Dusk warmth on stands | Info | `sf-orbit-dusk.png` | `indianapolis\|dusk\|dry` preset tints read well on navy/crimson seats |
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
| **Fixed** | Flood mast vs stand roof clip | `banked-t1-orbit.png` (pre-fix) | `floodMast` gap 48→56 m, h 34→32 m in scenery |
| **Fixed** | Retaining-wall coplanar | `coplanar-audit` | Alternate slab radial offset 30→48 mm |
| Med | Inner bowl stands missing | Brief §4; SF orbit | IN-side terraces s 0.90–0.20 not authored; bleacher trial → unsupported legs (ground-audit) — use `spectatorHill` + footing |
| Med | Night oval lighting | TOD night panels | Enable lamp pools on flood masts when `night` race allowed, or gate via lighting-tuner |
| Low | Gasoline Alley terrain wedge | `gasoline-alley.png` | Dark inner-edge splice ~0.92; centreline clean — likely terrain/road join near pit complex |
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
