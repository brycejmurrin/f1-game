# Monza — circuit survey (2026-10-14)

End-to-end survey of **MONZA** (`js/circuits/monza.js` + `js/circuits/scenery/monza.js`) against
`docs/tracks/monza.md`, node-VM audits, and headless TLX captures (`node tools/shot/shot.mjs --batch
docs/tracks/surveys/monza-capture-jobs.json`). **Weather batch capture is deferred** until the shared
tools PR (`tools: shared shot tooling for circuit surveys`) lands `weather` on batch jobs and the
`artifacts/shots/tracks/**` gitignore exception; this pass uses **`--tod` only** (day / dawn / dusk / night, dry).

Screenshots target path: `artifacts/shots/tracks/monza/` (committed after rebase on that tools PR).
Regenerate: `node tools/shot/shot.mjs --batch docs/tracks/surveys/monza-capture-jobs.json`.

## Code map

| Layer | Path | Role |
|-------|------|------|
| Circuit def | `js/circuits/monza.js` | OSM path, `theme: "green"`, `terrainOuter: 120`, FIA `sectors`/`turns`, chicane `hwZones`, `bankZones`, `dressingExclusions`, `furniture.tree: stonePine`. |
| Scenery | `js/circuits/scenery/monza.js` | Lazy `TrackScenery.monza`: Muro wall, Tribuna/podium heroes, chicanes, lakes, banking, flyover, tifosi bowls, Milan backdrop. |
| Engine | `js/track/scenery/*`, `js/track/core/*` | Shared `buildProps` / `api` helpers (`docs/SCENERY-API.md`). |
| Brief | `docs/tracks/monza.md` | Palette, landmarks-by-`s`, flyover position caveat. |
| Tests | `tests/data/landmarks/monza.json`, `tests/specs/monza-foundation.spec.js` | Required model groups + boot contracts. |

**Racing fractions (curated):** Rettifilo ~0.096–0.103; Curva Grande ~0.10–0.18; Roggia ~0.30; Lesmo 1/2 ~0.37 / 0.432; banking ~0.50–0.58; flyover authored **s=0.73**; Ascari ~0.618–0.650; Parabolica ~0.838.

## Theme and models

- **Royal park:** dense stone-pine + broadleaf ranks, brick estate wall (three arcs + `monza-park-gate`), hedges, gravel FIA margins, red/white chicane kerbs.
- **Hero `modelGroup` (required):** `monza-tribuna-centrale`, `monza-podium-tower`, `monza-pit-canopy`.
- **Other registered scenery:** `monza-sopraelevata-flyover` (`overheadSpan`), villa/west lakes (`waterSurface`), `monza-vedano-gate`, tifosi camps, Kenney barrier fallbacks.
- **Game weather API (not shot in this pass):** `raceWeather` / `__apex.weather("dry"|"wet"|"rain"|"overcast"|"fog")` (`js/game.js`). **Time of day:** `__apex.setTimeOfDay("day"|"dawn"|"dusk"|"night")` — works on Monza even though `def.night: false` (explicit TOD overrides default-day).

## Capture plan (36 frames)

| Group | Count | Notes |
|-------|------:|-------|
| All sectors, **day / dry** | 14 | One frame per landmark (S1–S4). |
| **Lighting variants** (6 heroes) | 22 | Start, Roggia, Villa lake, Banking, Flyover, Parabolica — dusk/night/dawn where noted in jobs JSON. |
| **Weather variants** | 0 | **Pending** shared shot tooling (`weather` batch + commit path). Planned: wet/fog/overcast/rain on Roggia, Rettifilo, Flyover, Parabolica. |

---

## Panel grids — by sector (day / dry)

Filenames below live under `artifacts/shots/tracks/monza/` (gitignored until the shared
shot-tools PR); the draft PR embeds the rendered PNGs. After rebase, replace filename
cells with standard markdown image links into that directory.

### Sector 1 — Start / Rettifilo / Curva Grande

| | | |
|:---:|:---:|:---:|
| `s1-start_day-dry.png` | `s1-rettifilo_day-dry.png` | `s1-grande_day-dry.png` |
| Tribuna, gantry, pit tower | First chicane kerbs/gravel | Pine corridor |

| | | |
|:---:|:---:|:---:|
| `s1-grande-mid_day-dry.png` | | |
| Mid-straight tree wall | | |

### Sector 2 — Roggia / lakes / Lesmo

| | | |
|:---:|:---:|:---:|
| `s2-roggia_day-dry.png` | `s2-lake-west_day-dry.png` | `s2-villa-lake_day-dry.png` |
| Chicane + mist wedges | Open park lake | Villa Reale pond |

| | | |
|:---:|:---:|:---:|
| `s2-lesmo_day-dry.png` | | |
| Woodland tightening | | |

### Sector 3 — Banking / flyover / Ascari / gate

| | | |
|:---:|:---:|:---:|
| `s3-banking_day-dry.png` | `s3-flyover_day-dry.png` | `s3-ascari_day-dry.png` |
| Sopraelevata ruin tiers | Under Sopraelevata deck | Ascari chicane |

| | | |
|:---:|:---:|:---:|
| `s3-park-gate_day-dry.png` | | |
| Muro gateway | | |

### Sector 4 — Parabolica / Milan

| | | |
|:---:|:---:|:---:|
| `s4-parabolica_day-dry.png` | `s4-milan_day-dry.png` | |
| Outer gravel + stand | Back-straight towers | |

---

## Panel grids — lighting (dry weather)

Six hero viewpoints; `shot.mjs --tod` only.

### Start / finish straight

| | | |
|:---:|:---:|:---:|
| `s1-start_day-dry.png` | `s1-start_dusk-dry.png` | `s1-start_night-dry.png` |
| day | dusk | night |

| | | |
|:---:|:---:|:---:|
| `s1-start_dawn-dry.png` | | |
| dawn | | |

### Variante della Roggia

| | | |
|:---:|:---:|:---:|
| `s2-roggia_day-dry.png` | `s2-roggia_dusk-dry.png` | `s2-roggia_night-dry.png` |
| day | dusk | night |

| | | |
|:---:|:---:|:---:|
| `s2-roggia_dawn-dry.png` | | |
| dawn (mist reads stronger at low sun) | | |

### Villa lake

| | | |
|:---:|:---:|:---:|
| `s2-villa-lake_day-dry.png` | `s2-villa-lake_dusk-dry.png` | `s2-villa-lake_night-dry.png` |
| day | dusk | night (Villa window bands + lamp pool TBD) |

### Banking ruin

| | | |
|:---:|:---:|:---:|
| `s3-banking_day-dry.png` | `s3-banking_dusk-dry.png` | `s3-banking_night-dry.png` |
| day | dusk | night |

### Ascari flyover

| | | |
|:---:|:---:|:---:|
| `s3-flyover_day-dry.png` | `s3-flyover_dusk-dry.png` | `s3-flyover_night-dry.png` |
| day | dusk | night |

| | | |
|:---:|:---:|:---:|
| `s3-flyover_dawn-dry.png` | | |
| dawn | | |

### Parabolica

| | | |
|:---:|:---:|:---:|
| `s4-parabolica_day-dry.png` | `s4-parabolica_dusk-dry.png` | `s4-parabolica_night-dry.png` |
| day | dusk | night |

| | | |
|:---:|:---:|:---:|
| `s4-parabolica_dawn-dry.png` | | |
| dawn | | |

### Weather / wet / fog (pending tools PR)

| | | |
|:---:|:---:|:---:|
| *planned* | *planned* | *planned* |
| Roggia `fog` / `overcast` | Rettifilo `rain` | Parabolica `wet` |

---

## Findings

### Strengths

- Park identity reads clearly: pine walls, brick Muro, lakes, banking + flyover, Tribuna/podium heroes.
- Centreline healthy (no surface folds); required models present; FIA gravel hints at Rettifilo/Roggia.
- Flyover uses `overheadSpan` + seated piers (no fleet overhead coplanar class).

### Visual / audit issues

| ID | Severity | Finding | Notes |
|----|----------|---------|-------|
| M1 | fixed | Rettifilo tree/prop clip (severe @ 0.07–0.11) | `rettifiloChicane` skip on Rank A/B/C + bushes. |
| M2 | fixed | Cypress × tifosi bowl @ 0.961 | Removed back-straight cypress row; bowl owns plane. |
| M3 | open | Residual clip 7 severe (cap 9) | Mostly `nature.js` × `grandstandEx` crowd @ ~0.109 — engine/stand setback. |
| M4 | open | Flyover frac vs brief | Game `bridgeS=0.73`; brief 0.70–0.76 unverified — needs aerial registration. |
| M5 | open | Night lamps | Chicane/pit `addCyl` lamp posts exist; floodlit grandstand faces rely on window bands — verify after night captures land. |
| M6 | deferred | Weather | Wet road, rain particles, fog density — need `weather` on batch shot + compare Roggia mist prisms under `fog` wx. |
| M7 | low | Ascari flyover soffit | Flat grey slab; acceptable at speed (no Madrid-style dual soffit). |
| M8 | low | Hedge blocks | Manicured edges are coarse boxes — style limit, not float. |

### Audit (post-fix, 2026-10-14)

```
verify-track: OK, surface folds 0, min radius 5.07 m @ node 138
audit-circuit: float 0 | clip 7 severe (cap 9) | coplanar 3 | ground clean | props ~302375 tris
```

## Ranked backlog

| P | Item | Scope |
|---|------|--------|
| 1 | Rebase on shared shot PR; commit `artifacts/shots/tracks/monza/*.png`; add 8–12 weather frames on 4–6 heroes | tools + this survey |
| 2 | Register Sopraelevata crossing; then adjust `bridgeS` / wings | def + scenery |
| 3 | Ease `grandstandEx(0.109)` crowd vs forest edge (clip @ 0.109) | scenery only |
| 4 | Night pass: lamp reach on Parabolica stands / Villa face | scenery + lighting-tuner |
| 5 | Weather pass: Roggia mist under `fog`/`overcast` — avoid double-fog with wx sky | scenery |

## PR-scoped fixes (this branch)

- `rettifiloChicane` clearance band in `js/circuits/scenery/monza.js`.
- Removed colliding back-straight cypress row.
- Clip severe **9 → 7**; all baselines unchanged.
