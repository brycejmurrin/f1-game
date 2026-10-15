# Zandvoort — circuit survey (2026-10-14)

**Circuit id:** `zandvoort`  
**Base branch:** `claude/f1-game-project-26h3ng`  
**Design brief:** `docs/tracks/zandvoort.md`  
**Shots (36 JPEGs, q≈80, ≤1280px wide):** `artifacts/shots/tracks/zandvoort/` (`git add -f`; fleet gitignore exception pending)

> **Capture:** `node tools/shot/shot.mjs --batch scratch/zandvoort-survey-final.json --jpeg --present-timeout 90 --capture-retries 4 --wait 120` on merged `cursor/shared-shot-tooling-5b45` (SwiftShader default).

## Code map

| Layer | Path | Notes |
|-------|------|--------|
| Def | `js/circuits/zandvoort.js` | OSM centreline, `bankZones` on turns 1/3/7/11/14, `terrainOuter` 120, `classic: true`, **no** `sceneryStartFrac` |
| Scenery | `js/circuits/scenery/zandvoort.js` | Dunes, orange stands, Fanzone + Ferris, lighthouse / watertoren, sea peeks, banked kerbs |
| Landmarks | `tests/data/landmarks/zandvoort.json` | Required: `zandvoort-ferris-wheel` |
| Spec | `tests/specs/zandvoort-foundation.spec.js` | Banking, clearance, hero models |

**Sectors (racing `s`):** S1 `0–0.32`, S2 `0.32–0.68`, S3 `0.68–1.0`.  
**Turn apex fractions:** Tarzan 0.086, Hugenholtz 0.167, Scheivlak ~0.50, Hans Ernst ~0.73–0.78, Arie Luyendyk 0.911.

## Audit snapshot (post-fix)

| Check | Result |
|-------|--------|
| `verify-track` | OK — **0** surface folds |
| float | 0 floating |
| clip | 0 severe |
| ground buried | **2** (within baseline; was 4) |
| props tris | 276268 (unchanged band) |

## Survey panels (36 frames)

Caption row: **view** · time of day · weather. Paths relative to this file.

| | | |
|:---:|:---:|:---:|
| ![pit orbit ferris](../../../artifacts/shots/tracks/zandvoort/day__dry/s1-01-pit-orbit-ferris.jpg) | ![fanzone stage](../../../artifacts/shots/tracks/zandvoort/day__dry/s1-02-fanzone-stage.jpg) | ![tarzan trackside](../../../artifacts/shots/tracks/zandvoort/day__dry/s1-03-tarzan-trackside.jpg) |
| **pit orbit ferris** · day · dry | **fanzone stage** · day · dry | **tarzan trackside** · day · dry |

| | | |
|:---:|:---:|:---:|
| ![tarzan park](../../../artifacts/shots/tracks/zandvoort/day__dry/s1-04-tarzan-park.jpg) | ![hugenholtz bank](../../../artifacts/shots/tracks/zandvoort/day__dry/s1-05-hugenholtz-bank.jpg) | ![hugenholtz orbit](../../../artifacts/shots/tracks/zandvoort/day__dry/s1-06-hugenholtz-orbit.jpg) |
| **tarzan park** · day · dry | **hugenholtz bank** · day · dry | **hugenholtz orbit** · day · dry |

| | | |
|:---:|:---:|:---:|
| ![midlap dunes](../../../artifacts/shots/tracks/zandvoort/day__dry/s2-07-midlap-dunes.jpg) | ![watertoren](../../../artifacts/shots/tracks/zandvoort/day__dry/s2-08-watertoren.jpg) | ![hunserug sweep](../../../artifacts/shots/tracks/zandvoort/day__dry/s2-09-hunserug-sweep.jpg) |
| **midlap dunes** · day · dry | **watertoren** · day · dry | **hunserug sweep** · day · dry |

| | | |
|:---:|:---:|:---:|
| ![scheivlak sea](../../../artifacts/shots/tracks/zandvoort/day__dry/s2-10-scheivlak-sea.jpg) | ![lighthouse](../../../artifacts/shots/tracks/zandvoort/day__dry/s2-11-lighthouse.jpg) | ![scheivlak stand](../../../artifacts/shots/tracks/zandvoort/day__dry/s2-12-scheivlak-stand.jpg) |
| **scheivlak sea** · day · dry | **lighthouse** · day · dry | **scheivlak stand** · day · dry |

| | | |
|:---:|:---:|:---:|
| ![chicane arena](../../../artifacts/shots/tracks/zandvoort/day__dry/s3-13-chicane-arena.jpg) | ![luyendyk bank](../../../artifacts/shots/tracks/zandvoort/day__dry/s3-14-luyendyk-bank.jpg) | ![pitstraight orbit](../../../artifacts/shots/tracks/zandvoort/day__dry/s3-15-pitstraight-orbit.jpg) |
| **chicane arena** · day · dry | **luyendyk bank** · day · dry | **pitstraight orbit** · day · dry |

| | | |
|:---:|:---:|:---:|
| ![ferris orbit](../../../artifacts/shots/tracks/zandvoort/dawn__dry/wx-dawn-01-ferris-orbit.jpg) | ![tarzan park](../../../artifacts/shots/tracks/zandvoort/dawn__dry/wx-dawn-02-tarzan-park.jpg) | ![hugenholtz bank](../../../artifacts/shots/tracks/zandvoort/dawn__dry/wx-dawn-03-hugenholtz-bank.jpg) |
| **ferris orbit** · dawn · dry | **tarzan park** · dawn · dry | **hugenholtz bank** · dawn · dry |

| | | |
|:---:|:---:|:---:|
| ![scheivlak sea](../../../artifacts/shots/tracks/zandvoort/dawn__dry/wx-dawn-04-scheivlak-sea.jpg) | ![luyendyk bank](../../../artifacts/shots/tracks/zandvoort/dawn__dry/wx-dawn-05-luyendyk-bank.jpg) | ![ferris orbit](../../../artifacts/shots/tracks/zandvoort/dusk__dry/wx-dusk-ferris-orbit.jpg) |
| **scheivlak sea** · dawn · dry | **luyendyk bank** · dawn · dry | **ferris orbit** · dusk · dry |

| | | |
|:---:|:---:|:---:|
| ![ferris orbit](../../../artifacts/shots/tracks/zandvoort/night__dry/wx-night-ferris-orbit.jpg) | ![hugenholtz bank](../../../artifacts/shots/tracks/zandvoort/dusk__dry/wx-dusk-hugenholtz-bank.jpg) | ![hugenholtz bank](../../../artifacts/shots/tracks/zandvoort/night__dry/wx-night-hugenholtz-bank.jpg) |
| **ferris orbit** · night · dry | **hugenholtz bank** · dusk · dry | **hugenholtz bank** · night · dry |

| | | |
|:---:|:---:|:---:|
| ![scheivlak sea](../../../artifacts/shots/tracks/zandvoort/dusk__dry/wx-dusk-scheivlak-sea.jpg) | ![scheivlak sea](../../../artifacts/shots/tracks/zandvoort/night__dry/wx-night-scheivlak-sea.jpg) | ![luyendyk bank](../../../artifacts/shots/tracks/zandvoort/dusk__dry/wx-dusk-luyendyk-bank.jpg) |
| **scheivlak sea** · dusk · dry | **scheivlak sea** · night · dry | **luyendyk bank** · dusk · dry |

| | | |
|:---:|:---:|:---:|
| ![luyendyk bank](../../../artifacts/shots/tracks/zandvoort/night__dry/wx-night-luyendyk-bank.jpg) | ![hugenholtz bank](../../../artifacts/shots/tracks/zandvoort/day__overcast/wx-overcast-hugenholtz-bank.jpg) | ![luyendyk bank](../../../artifacts/shots/tracks/zandvoort/day__wet/wx-wet-luyendyk-bank.jpg) |
| **luyendyk bank** · night · dry | **hugenholtz bank** · day · overcast | **luyendyk bank** · day · wet |

| | | |
|:---:|:---:|:---:|
| ![scheivlak sea](../../../artifacts/shots/tracks/zandvoort/day__rain/wx-rain-scheivlak-sea.jpg) | ![ferris orbit](../../../artifacts/shots/tracks/zandvoort/day__fog/wx-fog-ferris-orbit.jpg) | ![scheivlak sea](../../../artifacts/shots/tracks/zandvoort/day__fog/wx-fog-scheivlak-sea.jpg) |
| **scheivlak sea** · day · rain | **ferris orbit** · day · fog | **scheivlak sea** · day · fog |

| | | |
|:---:|:---:|:---:|
| ![ferris orbit](../../../artifacts/shots/tracks/zandvoort/day__storm/wx-storm-ferris-orbit.jpg) | ![luyendyk bank](../../../artifacts/shots/tracks/zandvoort/day__storm/wx-storm-luyendyk-bank.jpg) | ![scheivlak sea](../../../artifacts/shots/tracks/zandvoort/day__storm/wx-storm-scheivlak-sea.jpg) |
| **ferris orbit** · day · storm | **luyendyk bank** · day · storm | **scheivlak sea** · day · storm |

## Findings & backlog

### Strengths

- Coastal dunes + orange crowd read strongly across sectors; banked Hugenholtz / Luyendyk visible in dry and dusk frames.
- Festival heroes (Ferris, stage) silhouette on pit straight; watertoren + lighthouse identifiable on S2 panels.
- Node VM: **0** floats, **0** clip severe, **0** road folds.

### Scenery fixes (this PR)

1. Backdrop `peak()` foot uses `terrainYAt` (buried dunes 4→2).
2. `zandvoort-surf-*` lifted to local terrain; wider Ferris foot probe grid.

### Weather / lighting backlog (no baseline changes)

| ID | Issue | Seen in | Risk to fix |
|----|--------|---------|-------------|
| W1 | **Night:** hand `every(35)` lamp posts emit geometry but **no lamp gate** — masts are dark; grandstand emissive strips help only near stands | `wx-night-*` | Medium — needs `lampPost` / lighting-tuner pass, not a one-line scenery tweak |
| W2 | **Fog:** `def.pal.fogDensity` coastal haze vs `wx=fog` sky — sea band can look **same tone** as sky (low separation) | `wx-fog-scheivlak-sea` | Low — palette tune in def `pal` only |
| W3 | **Wet/rain:** tarmac darkening OK; **dune sand does not read wet** (expected — no wet shader on props) | `wx-wet-*`, `wx-rain-*` | Low / optional wet tint on sand boxes |
| W4 | **Dusk:** strong; no issue filed | `wx-dusk-*` | — |
| W5 | **Trackside camera** can clip inside grandstand shell (Hugenholtz) — shot recipe, not mesh | `s1-05` | Info |
| W7 | **Storm:** heavy sky read; track wetness visible on tarmac | `wx-storm-*` | Info |

### Ranked future work (circuit-scoped)

1. `pal.fog` / `fogDensity` tweak for fog chip vs coastal brief (W2).
2. Night: replace raw lamp boxes with `lampPost()` on pit straight + Hugenholtz / Luyendyk straights (W1).
3. Register lighthouse + watertoren in `landmarks/zandvoort.json` if hero ratchet should match foundation spec.

## Verify

```sh
node tools/track/verify-track.cjs zandvoort
node tools/track/audit-circuit.cjs zandvoort
npm test -- tests/specs/zandvoort-foundation.spec.js
```
