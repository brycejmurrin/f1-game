# Monza — circuit survey (2026-10-14)

End-to-end survey of **MONZA** (`js/circuits/monza.js` + `js/circuits/scenery/monza.js`) against
`docs/tracks/monza.md`, node-VM audits, and headless TLX captures (`node tools/shot/shot.mjs --batch
docs/tracks/surveys/monza-capture-jobs.json`). **Weather batch capture is deferred** until the shared
tools PR (`tools: shared shot tooling for circuit surveys`) lands `weather` on batch jobs and the
`artifacts/shots/tracks/**` gitignore exception; this pass uses **`--tod` only** (day / dawn / dusk / night, dry).

## Capture plan (36 frames)

Rebased on `cursor/shared-shot-tooling-5b45`. Batch: `node tools/shot/shot.mjs --batch docs/tracks/surveys/monza-capture-jobs.json --jpeg --present-timeout 90 --capture-retries 4 --wait 120` (SwiftShader, no `APEX_GL=llvmpipe`).

- **8** sector landmarks (day / dry)
- **4** hero views (start, Roggia, flyover, Parabolica): day × wet/rain/overcast/fog/storm + dusk/night dry

JPEG q≈80, max width 1280px, `git add -f artifacts/shots/tracks/monza/`.

## Panel grids (view · time of day · weather)

### Landmarks (day / dry)

| | | |
|:---:|:---:|:---:|
| ![Curva Grande · day · dry](../../../artifacts/shots/tracks/monza/s1-grande_day-dry.jpg) | ![Rettifilo chicane · day · dry](../../../artifacts/shots/tracks/monza/s1-rettifilo_day-dry.jpg) | ![Start / Tribuna · day · dry](../../../artifacts/shots/tracks/monza/s1-start_day-dry.jpg) |
| Curva Grande<br>day / dry | Rettifilo chicane<br>day / dry | Start / Tribuna<br>day / dry |

| | | |
|:---:|:---:|:---:|
| ![Variante Roggia · day · dry](../../../artifacts/shots/tracks/monza/s2-roggia_day-dry.jpg) | ![Villa Reale lake · day · dry](../../../artifacts/shots/tracks/monza/s2-villa-lake_day-dry.jpg) | ![Banking ruin · day · dry](../../../artifacts/shots/tracks/monza/s3-banking_day-dry.jpg) |
| Variante Roggia<br>day / dry | Villa Reale lake<br>day / dry | Banking ruin<br>day / dry |

| | | |
|:---:|:---:|:---:|
| ![Sopraelevata flyover · day · dry](../../../artifacts/shots/tracks/monza/s3-flyover_day-dry.jpg) | ![Parabolica · day · dry](../../../artifacts/shots/tracks/monza/s4-parabolica_day-dry.jpg) | |
| Sopraelevata flyover<br>day / dry | Parabolica<br>day / dry | |

### Hero — Start / Tribuna

| | | |
|:---:|:---:|:---:|
| ![Start / Tribuna · day · dry](../../../artifacts/shots/tracks/monza/s1-start_day-dry.jpg) | ![Start / Tribuna · day · fog](../../../artifacts/shots/tracks/monza/s1-start_day-fog.jpg) | ![Start / Tribuna · day · overcast](../../../artifacts/shots/tracks/monza/s1-start_day-overcast.jpg) |
| Start / Tribuna<br>day / dry | Start / Tribuna<br>day / fog | Start / Tribuna<br>day / overcast |

| | | |
|:---:|:---:|:---:|
| ![Start / Tribuna · day · rain](../../../artifacts/shots/tracks/monza/s1-start_day-rain.jpg) | ![Start / Tribuna · day · storm](../../../artifacts/shots/tracks/monza/s1-start_day-storm.jpg) | ![Start / Tribuna · day · wet](../../../artifacts/shots/tracks/monza/s1-start_day-wet.jpg) |
| Start / Tribuna<br>day / rain | Start / Tribuna<br>day / storm | Start / Tribuna<br>day / wet |

| | | |
|:---:|:---:|:---:|
| ![Start / Tribuna · dusk · dry](../../../artifacts/shots/tracks/monza/s1-start_dusk-dry.jpg) | ![Start / Tribuna · night · dry](../../../artifacts/shots/tracks/monza/s1-start_night-dry.jpg) | |
| Start / Tribuna<br>dusk / dry | Start / Tribuna<br>night / dry | |

### Hero — Variante Roggia

| | | |
|:---:|:---:|:---:|
| ![Variante Roggia · day · dry](../../../artifacts/shots/tracks/monza/s2-roggia_day-dry.jpg) | ![Variante Roggia · day · fog](../../../artifacts/shots/tracks/monza/s2-roggia_day-fog.jpg) | ![Variante Roggia · day · overcast](../../../artifacts/shots/tracks/monza/s2-roggia_day-overcast.jpg) |
| Variante Roggia<br>day / dry | Variante Roggia<br>day / fog | Variante Roggia<br>day / overcast |

| | | |
|:---:|:---:|:---:|
| ![Variante Roggia · day · rain](../../../artifacts/shots/tracks/monza/s2-roggia_day-rain.jpg) | ![Variante Roggia · day · storm](../../../artifacts/shots/tracks/monza/s2-roggia_day-storm.jpg) | ![Variante Roggia · day · wet](../../../artifacts/shots/tracks/monza/s2-roggia_day-wet.jpg) |
| Variante Roggia<br>day / rain | Variante Roggia<br>day / storm | Variante Roggia<br>day / wet |

| | | |
|:---:|:---:|:---:|
| ![Variante Roggia · dusk · dry](../../../artifacts/shots/tracks/monza/s2-roggia_dusk-dry.jpg) | ![Variante Roggia · night · dry](../../../artifacts/shots/tracks/monza/s2-roggia_night-dry.jpg) | |
| Variante Roggia<br>dusk / dry | Variante Roggia<br>night / dry | |

### Hero — Sopraelevata flyover

| | | |
|:---:|:---:|:---:|
| ![Sopraelevata flyover · day · dry](../../../artifacts/shots/tracks/monza/s3-flyover_day-dry.jpg) | ![Sopraelevata flyover · day · fog](../../../artifacts/shots/tracks/monza/s3-flyover_day-fog.jpg) | ![Sopraelevata flyover · day · overcast](../../../artifacts/shots/tracks/monza/s3-flyover_day-overcast.jpg) |
| Sopraelevata flyover<br>day / dry | Sopraelevata flyover<br>day / fog | Sopraelevata flyover<br>day / overcast |

| | | |
|:---:|:---:|:---:|
| ![Sopraelevata flyover · day · rain](../../../artifacts/shots/tracks/monza/s3-flyover_day-rain.jpg) | ![Sopraelevata flyover · day · storm](../../../artifacts/shots/tracks/monza/s3-flyover_day-storm.jpg) | ![Sopraelevata flyover · day · wet](../../../artifacts/shots/tracks/monza/s3-flyover_day-wet.jpg) |
| Sopraelevata flyover<br>day / rain | Sopraelevata flyover<br>day / storm | Sopraelevata flyover<br>day / wet |

| | | |
|:---:|:---:|:---:|
| ![Sopraelevata flyover · dusk · dry](../../../artifacts/shots/tracks/monza/s3-flyover_dusk-dry.jpg) | ![Sopraelevata flyover · night · dry](../../../artifacts/shots/tracks/monza/s3-flyover_night-dry.jpg) | |
| Sopraelevata flyover<br>dusk / dry | Sopraelevata flyover<br>night / dry | |

### Hero — Parabolica

| | | |
|:---:|:---:|:---:|
| ![Parabolica · day · dry](../../../artifacts/shots/tracks/monza/s4-parabolica_day-dry.jpg) | ![Parabolica · day · fog](../../../artifacts/shots/tracks/monza/s4-parabolica_day-fog.jpg) | ![Parabolica · day · overcast](../../../artifacts/shots/tracks/monza/s4-parabolica_day-overcast.jpg) |
| Parabolica<br>day / dry | Parabolica<br>day / fog | Parabolica<br>day / overcast |

| | | |
|:---:|:---:|:---:|
| ![Parabolica · day · rain](../../../artifacts/shots/tracks/monza/s4-parabolica_day-rain.jpg) | ![Parabolica · day · storm](../../../artifacts/shots/tracks/monza/s4-parabolica_day-storm.jpg) | ![Parabolica · day · wet](../../../artifacts/shots/tracks/monza/s4-parabolica_day-wet.jpg) |
| Parabolica<br>day / rain | Parabolica<br>day / storm | Parabolica<br>day / wet |

| | | |
|:---:|:---:|:---:|
| ![Parabolica · dusk · dry](../../../artifacts/shots/tracks/monza/s4-parabolica_dusk-dry.jpg) | ![Parabolica · night · dry](../../../artifacts/shots/tracks/monza/s4-parabolica_night-dry.jpg) | |
| Parabolica<br>dusk / dry | Parabolica<br>night / dry | |


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
