# Monza — circuit survey (2026-10-14)

End-to-end survey of **MONZA** (`js/circuits/monza.js` + `js/circuits/scenery/monza.js`) against
`docs/tracks/monza.md`, node-VM audits, and headless TLX captures (`node tools/shot/shot.mjs --batch
docs/tracks/surveys/monza-capture-jobs.json`). **Weather batch capture is deferred** until the shared
tools PR (`tools: shared shot tooling for circuit surveys`) lands `weather` on batch jobs and the
`artifacts/shots/tracks/**` gitignore exception; this pass uses **`--tod` only** (day / dawn / dusk / night, dry).

## Capture plan (34 frames, dry)

All committed as JPEG (q≈80, max width 1280px) under `artifacts/shots/tracks/monza/` (`git add -f`).

## Panel grids (view · time of day · weather)

### Sector 1

| | | |
|:---:|:---:|:---:|
 ![Start / Tribuna · day · dry](../../../artifacts/shots/tracks/monza/s1-start_day-dry.jpg) | ![Start / Tribuna · dawn · dry](../../../artifacts/shots/tracks/monza/s1-start_dawn-dry.jpg) | ![Start / Tribuna · dusk · dry](../../../artifacts/shots/tracks/monza/s1-start_dusk-dry.jpg) |
 Start / Tribuna<br>day / dry | Start / Tribuna<br>dawn / dry | Start / Tribuna<br>dusk / dry |

| | | |
|:---:|:---:|:---:|
 ![Start / Tribuna · night · dry](../../../artifacts/shots/tracks/monza/s1-start_night-dry.jpg) | ![Rettifilo chicane · day · dry](../../../artifacts/shots/tracks/monza/s1-rettifilo_day-dry.jpg) | ![Rettifilo chicane · dusk · dry](../../../artifacts/shots/tracks/monza/s1-rettifilo_dusk-dry.jpg) |
 Start / Tribuna<br>night / dry | Rettifilo chicane<br>day / dry | Rettifilo chicane<br>dusk / dry |

| | | |
|:---:|:---:|:---:|
 ![Curva Grande · day · dry](../../../artifacts/shots/tracks/monza/s1-grande_day-dry.jpg) | ![Curva Grande · dusk · dry](../../../artifacts/shots/tracks/monza/s1-grande_dusk-dry.jpg) | ![Curva Grande (mid) · day · dry](../../../artifacts/shots/tracks/monza/s1-grande-mid_day-dry.jpg) |
 Curva Grande<br>day / dry | Curva Grande<br>dusk / dry | Curva Grande (mid)<br>day / dry |

| | | |
|:---:|:---:|:---:|
 ![Curva Grande (mid) · dusk · dry](../../../artifacts/shots/tracks/monza/s1-grande-mid_dusk-dry.jpg) | | |
 Curva Grande (mid)<br>dusk / dry | | |

### Sector 2

| | | |
|:---:|:---:|:---:|
 ![Variante Roggia · day · dry](../../../artifacts/shots/tracks/monza/s2-roggia_day-dry.jpg) | ![Variante Roggia · dawn · dry](../../../artifacts/shots/tracks/monza/s2-roggia_dawn-dry.jpg) | ![Variante Roggia · dusk · dry](../../../artifacts/shots/tracks/monza/s2-roggia_dusk-dry.jpg) |
 Variante Roggia<br>day / dry | Variante Roggia<br>dawn / dry | Variante Roggia<br>dusk / dry |

| | | |
|:---:|:---:|:---:|
 ![Variante Roggia · night · dry](../../../artifacts/shots/tracks/monza/s2-roggia_night-dry.jpg) | ![West park lake · day · dry](../../../artifacts/shots/tracks/monza/s2-lake-west_day-dry.jpg) | ![West park lake · dusk · dry](../../../artifacts/shots/tracks/monza/s2-lake-west_dusk-dry.jpg) |
 Variante Roggia<br>night / dry | West park lake<br>day / dry | West park lake<br>dusk / dry |

| | | |
|:---:|:---:|:---:|
 ![Villa Reale lake · day · dry](../../../artifacts/shots/tracks/monza/s2-villa-lake_day-dry.jpg) | ![Villa Reale lake · dusk · dry](../../../artifacts/shots/tracks/monza/s2-villa-lake_dusk-dry.jpg) | ![Villa Reale lake · night · dry](../../../artifacts/shots/tracks/monza/s2-villa-lake_night-dry.jpg) |
 Villa Reale lake<br>day / dry | Villa Reale lake<br>dusk / dry | Villa Reale lake<br>night / dry |

| | | |
|:---:|:---:|:---:|
 ![Lesmo · day · dry](../../../artifacts/shots/tracks/monza/s2-lesmo_day-dry.jpg) | | |
 Lesmo<br>day / dry | | |

### Sector 3

| | | |
|:---:|:---:|:---:|
 ![Banking ruin · day · dry](../../../artifacts/shots/tracks/monza/s3-banking_day-dry.jpg) | ![Banking ruin · dusk · dry](../../../artifacts/shots/tracks/monza/s3-banking_dusk-dry.jpg) | ![Banking ruin · night · dry](../../../artifacts/shots/tracks/monza/s3-banking_night-dry.jpg) |
 Banking ruin<br>day / dry | Banking ruin<br>dusk / dry | Banking ruin<br>night / dry |

| | | |
|:---:|:---:|:---:|
 ![Sopraelevata flyover · day · dry](../../../artifacts/shots/tracks/monza/s3-flyover_day-dry.jpg) | ![Sopraelevata flyover · dawn · dry](../../../artifacts/shots/tracks/monza/s3-flyover_dawn-dry.jpg) | ![Sopraelevata flyover · dusk · dry](../../../artifacts/shots/tracks/monza/s3-flyover_dusk-dry.jpg) |
 Sopraelevata flyover<br>day / dry | Sopraelevata flyover<br>dawn / dry | Sopraelevata flyover<br>dusk / dry |

| | | |
|:---:|:---:|:---:|
 ![Sopraelevata flyover · night · dry](../../../artifacts/shots/tracks/monza/s3-flyover_night-dry.jpg) | ![Variante Ascari · day · dry](../../../artifacts/shots/tracks/monza/s3-ascari_day-dry.jpg) | ![Park gateway · day · dry](../../../artifacts/shots/tracks/monza/s3-park-gate_day-dry.jpg) |
 Sopraelevata flyover<br>night / dry | Variante Ascari<br>day / dry | Park gateway<br>day / dry |

### Sector 4

| | | |
|:---:|:---:|:---:|
 ![Parabolica · day · dry](../../../artifacts/shots/tracks/monza/s4-parabolica_day-dry.jpg) | ![Parabolica · dawn · dry](../../../artifacts/shots/tracks/monza/s4-parabolica_dawn-dry.jpg) | ![Parabolica · dusk · dry](../../../artifacts/shots/tracks/monza/s4-parabolica_dusk-dry.jpg) |
 Parabolica<br>day / dry | Parabolica<br>dawn / dry | Parabolica<br>dusk / dry |

| | | |
|:---:|:---:|:---:|
 ![Parabolica · night · dry](../../../artifacts/shots/tracks/monza/s4-parabolica_night-dry.jpg) | ![Milan skyline · day · dry](../../../artifacts/shots/tracks/monza/s4-milan_day-dry.jpg) | |
 Parabolica<br>night / dry | Milan skyline<br>day / dry | |


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
