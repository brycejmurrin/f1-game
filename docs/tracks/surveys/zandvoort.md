# Zandvoort — circuit survey (2026-10-14)

**Circuit id:** `zandvoort`  
**Base branch:** `claude/f1-game-project-26h3ng`  
**Design brief:** `docs/tracks/zandvoort.md`  
**Shots (36 frames):** `artifacts/shots/tracks/zandvoort/` (force-added until shared `artifacts/shots/tracks/**` gitignore lands)

> **Tooling note:** Weather/time-of-day batch capture used a **local WIP** `shot.mjs` patch during one background run; shared edits were **reverted** per fleet policy (`tools: shared shot tooling for circuit surveys`). After rebasing that PR, re-run **4–6 hero weather frames** with the supported harness (dawn + full matrix on ferris / Hugenholtz / Scheivlak / Luyendyk).

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

## Sector panels — day, dry (15)

Paths are relative to this file (`../../../artifacts/shots/tracks/zandvoort/...`).

### Sector 1 — pit straight & Tarzan (`s` 0–0.32)

| | | |
|:---:|:---:|:---:|
| ![S1 pit orbit — Ferris + pit](../../../artifacts/shots/tracks/zandvoort/day__dry/s1-01-pit-orbit-ferris.png) | ![Fanzone stage](../../../artifacts/shots/tracks/zandvoort/day__dry/s1-02-fanzone-stage.png) | ![Tarzan trackside](../../../artifacts/shots/tracks/zandvoort/day__dry/s1-03-tarzan-trackside.png) |
| `s1-01` orbit s≈0.048 | `s1-02` eye Fanzone | `s1-03` Tarzan hairpin |

| | | |
|:---:|:---:|:---:|
| ![Tarzan park](../../../artifacts/shots/tracks/zandvoort/day__dry/s1-04-tarzan-park.png) | ![Hugenholtz bank trackside](../../../artifacts/shots/tracks/zandvoort/day__dry/s1-05-hugenholtz-bank.png) | ![Hugenholtz orbit](../../../artifacts/shots/tracks/zandvoort/day__dry/s1-06-hugenholtz-orbit.png) |
| `s1-04` driver T1 | `s1-05` T3 banking | `s1-06` bowl + orange stand |

### Sector 2 — dunes & Scheivlak (`s` 0.32–0.68)

| | | |
|:---:|:---:|:---:|
| ![Mid-lap dunes](../../../artifacts/shots/tracks/zandvoort/day__dry/s2-07-midlap-dunes.png) | ![Watertoren](../../../artifacts/shots/tracks/zandvoort/day__dry/s2-08-watertoren.png) | ![Hunserug sweep](../../../artifacts/shots/tracks/zandvoort/day__dry/s2-09-hunserug-sweep.png) |
| `s2-07` sand-first | `s2-08` inland hero | `s2-09` fast sweep |

| | | |
|:---:|:---:|:---:|
| ![Scheivlak sea eye](../../../artifacts/shots/tracks/zandvoort/day__dry/s2-10-scheivlak-sea.png) | ![Lighthouse horizon](../../../artifacts/shots/tracks/zandvoort/day__dry/s2-11-lighthouse.png) | ![Scheivlak stand](../../../artifacts/shots/tracks/zandvoort/day__dry/s2-12-scheivlak-stand.png) |
| `s2-10` North Sea peek | `s2-11` seaward skyline | `s2-12` modular deck |

### Sector 3 — chicane & Luyendyk (`s` 0.68–1.0)

| | | |
|:---:|:---:|:---:|
| ![Arena chicane](../../../artifacts/shots/tracks/zandvoort/day__dry/s3-13-chicane-arena.png) | ![Luyendyk bank](../../../artifacts/shots/tracks/zandvoort/day__dry/s3-14-luyendyk-bank.png) | ![Pit straight orbit](../../../artifacts/shots/tracks/zandvoort/day__dry/s3-15-pitstraight-orbit.png) |
| `s3-13` bowl walls | `s3-14` T14 banking | `s3-15` exit to S/F |

## Weather & lighting — hero comparisons (21)

Six **key views** repeat across conditions: **Ferris / pit** (s≈0.048), **Tarzan** (0.086), **Hugenholtz** (0.135), **Scheivlak sea** (0.50), **Luyendyk** (0.915), **wet mid-lap** (0.35).

### Dusk (golden hour) — dry

| | | |
|:---:|:---:|:---:|
| ![Dusk Ferris](../../../artifacts/shots/tracks/zandvoort/dusk__dry/wx-dusk-01-ferris.png) | ![Dusk Tarzan](../../../artifacts/shots/tracks/zandvoort/dusk__dry/wx-dusk-02-tarzan.png) | ![Dusk Hugenholtz](../../../artifacts/shots/tracks/zandvoort/dusk__dry/wx-dusk-03-hugenholtz.png) |

| | |
|:---:|:---:|
| ![Dusk Scheivlak sea](../../../artifacts/shots/tracks/zandvoort/dusk__dry/wx-dusk-04-scheivlak-sea.png) | ![Dusk Luyendyk](../../../artifacts/shots/tracks/zandvoort/dusk__dry/wx-dusk-05-luyendyk.png) |

### Night — dry (`def.night: false`; forced `tod=night`)

| | | |
|:---:|:---:|:---:|
| ![Night pit Ferris](../../../artifacts/shots/tracks/zandvoort/night__dry/wx-night-01-pit-ferris.png) | ![Night Fanzone](../../../artifacts/shots/tracks/zandvoort/night__dry/wx-night-02-fanzone.png) | ![Night Hugenholtz](../../../artifacts/shots/tracks/zandvoort/night__dry/wx-night-03-hugenholtz.png) |

| | |
|:---:|:---:|
| ![Night Scheivlak stand](../../../artifacts/shots/tracks/zandvoort/night__dry/wx-night-04-scheivlak-stand.png) | ![Night Luyendyk](../../../artifacts/shots/tracks/zandvoort/night__dry/wx-night-05-luyendyk.png) |

### Overcast — dry

| | | |
|:---:|:---:|:---:|
| ![Overcast Tarzan](../../../artifacts/shots/tracks/zandvoort/day__overcast/wx-overcast-01-tarzan.png) | ![Overcast mid-lap](../../../artifacts/shots/tracks/zandvoort/day__overcast/wx-overcast-02-midlap.png) | ![Overcast lighthouse](../../../artifacts/shots/tracks/zandvoort/day__overcast/wx-overcast-03-lighthouse.png) |

### Wet / rain

| | | |
|:---:|:---:|:---:|
| ![Wet Tarzan](../../../artifacts/shots/tracks/zandvoort/day__wet/wx-wet-01-tarzan.png) | ![Wet Scheivlak](../../../artifacts/shots/tracks/zandvoort/day__wet/wx-wet-03-scheivlak.png) | ![Wet Luyendyk](../../../artifacts/shots/tracks/zandvoort/day__wet/wx-wet-04-luyendyk.png) |

| | |
|:---:|:---:|
| ![Rain Scheivlak](../../../artifacts/shots/tracks/zandvoort/day__rain/wx-rain-01-scheivlak.png) | ![Rain pit straight](../../../artifacts/shots/tracks/zandvoort/day__rain/wx-rain-02-pitstraight.png) |

### Fog

| | | |
|:---:|:---:|:---:|
| ![Fog sea peek](../../../artifacts/shots/tracks/zandvoort/day__fog/wx-fog-01-sea-peek.png) | ![Fog Ferris](../../../artifacts/shots/tracks/zandvoort/day__fog/wx-fog-02-ferris.png) | ![Fog watertoren](../../../artifacts/shots/tracks/zandvoort/day__fog/wx-fog-03-watertoren.png) |

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
| W2 | **Fog:** `def.pal.fogDensity` coastal haze vs `wx=fog` sky — sea band can look **same tone** as sky (low separation) | `wx-fog-01` | Low — palette tune in def `pal` only |
| W3 | **Wet/rain:** tarmac darkening OK; **dune sand does not read wet** (expected — no wet shader on props) | `wx-wet-*`, `wx-rain-*` | Low / optional wet tint on sand boxes |
| W4 | **Dusk:** strong; no issue filed | `wx-dusk-*` | — |
| W5 | **Trackside camera** can clip inside grandstand shell (Hugenholtz) — shot recipe, not mesh | `s1-05` | Info |
| W6 | **Dawn** frames deferred until shared shot batch (not in 36-frame cap) | — | Re-capture after tooling PR |

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
