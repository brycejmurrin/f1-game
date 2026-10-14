# Fuji Speedway — circuit survey (2026-10-14)

**Branch:** `cursor/fuji-survey-fixes-17d3` · **Base:** `claude/f1-game-project-26h3ng`  
**Brief:** `docs/tracks/fuji.md` · **Audits:** `node tools/track/audit-circuit.cjs fuji`

### Capture status

| Item | Status |
|------|--------|
| Frames on disk | **43** survey JPEGs under `artifacts/shots/tracks/fuji/` (plus `_smoke.jpg`; not in git until [shared survey tooling PR](https://github.com/brycejmurrin/f1-game) lands `!artifacts/shots/**`) |
| Harness | `node tools/shot/shot.mjs --batch scratch/fuji-survey-batch.json --jpeg --wait 20` (local run; **weather** fields used a pre-revert prototype — **re-capture after rebase** on shared `shot` batch support) |
| Renderer | TLX / SwiftShader, 1280×720 |

Game weather chips (for follow-up): `dry` · `wet` · `rain` · `overcast` · `fog` via `__apex.weather()`. Time of day: `day` · `dawn` · `dusk` · `night` via `__apex.setTimeOfDay()`. Fuji def has `night: false` and `furniture.lamp: "none"` — night frames are probe-only.

---

## Code map

| Layer | Path | Role |
|--------|------|------|
| Circuit def | `js/circuits/fuji.js` | OSM centreline, 16 turns, green palette (`fogDensity` 0.0022), `terrainOuter` 110. |
| Scenery | `js/circuits/scenery/fuji.js` | Pit straight, `fuji-mount-fuji`, `fuji-speedway-hotel`, cedar plateau, sector dressing. |
| Landmarks | `tests/data/landmarks/fuji.json` | Required `modelGroup` ids. |
| Engine | `js/track/tracks.js` | Centreline build / fold detection. |

**R3 folded road:** `surface folds 0` (colinear `path.pts` sample before 300R). Do not move path without re-pinning cedar spans (`docs/notes/SCENERY-QA-PLAN.md`).

**Fix this PR (scenery only):** Mount Fuji compressed **3.2 km → 2.5 km**, height **900 m**, so the snow cap reads through circuit fog on the main-straight look-back.

---

## Sector 1 — pit straight & Turn 1 (s ≈ 0.00–0.33)

| | | |
|:---:|:---:|:---:|
| `s01-pit-straight-orbit__wx-dry__tod-day.jpg` | `s02-mount-fuji-west__wx-dry__tod-day.jpg` | `s03-driver-straight__wx-dry__tod-day.jpg` |
| s01 pit orbit · day dry | s02 Mount Fuji · day dry | s03 driver · day dry |
| `s04-hotel-paddock__wx-dry__tod-day.jpg` | `s05-tgr-turn1__wx-dry__tod-day.jpg` | `s06-sector1-aerial__wx-dry__tod-day.jpg` |
| s04 hotel · day dry | s05 TGR · day dry | s06 sector aerial · day dry |

---

## Sector 2 — forest plateau & 300R (s ≈ 0.33–0.67)

| | | |
|:---:|:---:|:---:|
| `s07-coca-cola__wx-dry__tod-day.jpg` | `s08-toyopet-forest__wx-dry__tod-day.jpg` | `s09-advan__wx-dry__tod-day.jpg` |
| s07 Coca-Cola · day dry | s08 Toyopet · day dry | s09 Advan · day dry |
| `s10-120r-forest__wx-dry__tod-day.jpg` | `s11-sector2-aerial__wx-dry__tod-day.jpg` | `s12-300r__wx-dry__tod-day.jpg` |
| s10 120R · day dry | s11 sector aerial · day dry | s12 300R · day dry |

---

## Sector 3 — Dunlop, flick, final corner (s ≈ 0.67–1.0)

| | | |
|:---:|:---:|:---:|
| `s13-dunlop-hairpin__wx-dry__tod-day.jpg` | `s14-flick__wx-dry__tod-day.jpg` | `s15-panasonic__wx-dry__tod-day.jpg` |
| s13 Dunlop · day dry | s14 flick · day dry | s15 Panasonic · day dry |
| `s16-pit-exit__wx-dry__tod-day.jpg` | | |
| s16 pit exit · day dry | | |

---

## Lighting — key views (dry)

Six hero angles repeated across `day` / `dawn` / `dusk` / `night` where captured.

### Mount Fuji look-back (s02)

| | | |
|:---:|:---:|:---:|
| `s02-mount-fuji-west__wx-dry__tod-day.jpg` | `s02-mount-fuji-west__wx-dry__tod-dawn.jpg` | `s02-mount-fuji-west__wx-dry__tod-dusk.jpg` |
| day | dawn | dusk |
| `s02-mount-fuji-west__wx-dry__tod-night.jpg` | | |
| night (no lamps) | | |

### Pit straight driver (s03)

| | | |
|:---:|:---:|:---:|
| `s03-driver-straight__wx-dry__tod-day.jpg` | `s03-driver-straight__wx-dry__tod-dusk.jpg` | `s03-driver-straight__wx-dry__tod-night.jpg` |
| day | dusk | night |

### Hotel (s04)

| | | |
|:---:|:---:|:---:|
| `s04-hotel-paddock__wx-dry__tod-day.jpg` | `s04-hotel-paddock__wx-dry__tod-dusk.jpg` | |
| day | dusk | |

### 300R (s12)

| | | |
|:---:|:---:|:---:|
| `s12-300r__wx-dry__tod-day.jpg` | `s12-300r__wx-dry__tod-dusk.jpg` | `s12-300r__wx-dry__tod-night.jpg` |
| day | dusk | night |

### 120R forest (s10)

| | | |
|:---:|:---:|:---:|
| `s10-120r-forest__wx-dry__tod-day.jpg` | `s10-120r-forest__wx-dry__tod-dusk.jpg` | |
| day | dusk | |

### Pit straight orbit (s01)

| | | |
|:---:|:---:|:---:|
| `s01-pit-straight-orbit__wx-dry__tod-day.jpg` | `s01-pit-straight-orbit__wx-dry__tod-dusk.jpg` | |
| day | dusk | |

---

## Weather — key views (day TOD)

**Re-run on shared tooling** before committing these paths to git. Provisional local captures:

### Mount Fuji (s02)

| | | |
|:---:|:---:|:---:|
| `s02-mount-fuji-west__wx-dry__tod-day.jpg` | `s02-mount-fuji-west__wx-overcast__tod-day.jpg` | `s02-mount-fuji-west__wx-wet__tod-day.jpg` |
| dry | overcast | wet |
| `s02-mount-fuji-west__wx-rain__tod-day.jpg` | `s02-mount-fuji-west__wx-fog__tod-day.jpg` | |
| rain | fog | |

### Straight / hotel / 300R / Dunlop / 120R

| | | |
|:---:|:---:|:---:|
| `s03-driver-straight__wx-wet__tod-day.jpg` | `s03-driver-straight__wx-rain__tod-day.jpg` | `s01-pit-straight-orbit__wx-overcast__tod-day.jpg` |
| s03 wet | s03 rain | s01 overcast |
| `s04-hotel-paddock__wx-wet__tod-day.jpg` | `s04-hotel-paddock__wx-overcast__tod-day.jpg` | `s12-300r__wx-wet__tod-day.jpg` |
| s04 wet | s04 overcast | s12 wet |
| `s12-300r__wx-fog__tod-day.jpg` | `s13-dunlop-hairpin__wx-wet__tod-day.jpg` | `s13-dunlop-hairpin__wx-rain__tod-day.jpg` |
| s12 fog | s13 wet | s13 rain |
| `s10-120r-forest__wx-wet__tod-day.jpg` | `s10-120r-forest__wx-fog__tod-day.jpg` | `s13-dunlop-hairpin__wx-dry__tod-night.jpg` |
| s10 wet | s10 fog | s13 night dry |

---

## Findings & backlog

| ID | Finding | Severity | Notes |
|----|---------|----------|-------|
| F1 | **Mount Fuji** weak on straight until distance compress | Fixed | Scenery `FAR` 2500 m; re-verify after shot rebase |
| F2 | **Night** essentially unlit | Medium | `lamp: "none"`, `night: false` — grandstands/pits read flat; needs lamp policy or classic exception |
| F3 | **Fog + pal.fogDensity** stack | Low | `fog` weather + circuit fog washes distant cone further; expected |
| F4 | **Wet/rain** | Low | Reflections OK; no major streak artifacts in probe frames |
| F5 | **300R / Dunlop kerb** dark wedge at tight inner radius | Low | `surface folds 0`; orbit camera / lap doubling (~12 m), not R3 |
| F6 | `trackside` cam at Dunlop | Low | Can clip through terrace mesh — use orbit/park for sign-off |
| F7 | Clip/coplanar baselines | Baseline | 2 severe clip, 7 coplanar — unchanged; forestEdge gaps already carved |
| F8 | T4 `crowdBand` vs `grandstandEx` 7.5 mm | Cosmetic | Shared `structures.js`; defer |
| F9 | Weather batch not on shipped `shot.mjs` | Process | Re-capture § weather grids after shared tooling PR |

---

## Verification

```text
node tools/track/verify-track.cjs fuji
  → OK, surface folds 0
node tools/track/audit-circuit.cjs fuji
  → ok (float 0, clip/coplanar/ground within baselines)
```

Not run: browser foundation group (CI fast tier on push).
