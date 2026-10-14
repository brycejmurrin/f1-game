# Brands Hatch — circuit survey (2026-10-14)

**Circuit id:** `brands_hatch` · **Theme:** `green` (Kent chalk downland) · **Length:** 3.899 km GP · **Laps:** clockwise, 11 turns  
**Brief:** [`docs/tracks/brands_hatch.md`](../brands_hatch.md) · **Data:** `js/circuits/brands_hatch.js` · **Scenery:** `js/circuits/scenery/brands_hatch.js`

## Code map

| Layer | Role |
|---|---|
| `js/circuits/brands_hatch.js` | OSM centreline (`path.len` 3899 m), `startFrac` 0.1226, `sceneryStartFrac` 0, `terrainOuter` 110, sectors `[0.27, 0.703]`, `furniture.lamp: "none"`, `night: false` |
| `js/circuits/scenery/brands_hatch.js` | Seven blocks: bowl banking, Brabham frontage + required stands, infield (pits/Kentagon), Druids/Pilgrims footbridges, GP woods (`WOODS_A` 0.378–`WOODS_B` 0.845), furniture, Kent backdrop (`ridge` + `mountain`) |
| `js/track/tracks.js` | Lazy `scenery(api)` via `TrackScenery["brands_hatch"]` (no inline scenery in def) |
| `tests/data/landmarks/brands_hatch.json` | Required `modelGroup` ids: pit straight, Desire Wilson, Paddock Hill, Hailwoods, Kentagon |

**Frame debt:** Hero stands on the start complex use `sl()` (start-line frame); bowl/woods use authored `K(s)` / `ID`. Do not pre-shift `K()`.

**Models / kits:** `standSet` steel/concrete/darkSteel; marshal `cabin`, armco/mesh barriers; no baked lamp kit (`lamp: "none"`).

## Capture method

36 headless frames via `scratch/brands-hatch-capture.mjs` driving `tools/shot/track-session.mjs` (SwiftShader). Weather set with `__apex.race(track, tod, wx)` (`wx`: `dry` \| `rain` \| `overcast` \| `fog`; `tod`: `day` \| `dawn` \| `dusk` \| `night`).

> **Repo note:** `artifacts/` is gitignored until the shared shot-tooling PR adds `artifacts/shots/tracks/**`. PNGs live at `artifacts/shots/tracks/brands_hatch/` locally; rebase that PR to commit them.

Image root on disk: `artifacts/shots/tracks/brands_hatch/` (PNG panels land in git after rebase on shared shot-tooling PR).

---

## Sector coverage (day / dry)

Sector splits from def: S1 `s` 0–27%, S2 27–70.3%, S3 70.3–100%.

### Sector 1 — Brabham, Paddock Hill, Druids

| Frame | Frame | Frame |
|---|---|---|
| `s1-01-pit-straight-day-dry.png` — pit straight | `s1-02-paddock-hill-day-dry.png` — Paddock Hill | `s1-03-kentagon-day-dry.png` — Kentagon (+1) |
| `s1-04-druids-day-dry.png` — Druids | `s1-05-druids-bridge-day-dry.png` — footbridge | `s1-06-hailwoods-day-dry.png` — Hailwoods dip |

### Sector 2 — Cooper, Surtees, woods

| Frame | Frame | Frame |
|---|---|---|
| `s2-01-graham-hill-day-dry.png` — Graham Hill | `s2-02-cooper-day-dry.png` — Cooper | `s2-03-surtees-day-dry.png` — Surtees exit |
| `s2-04-pilgrims-bridge-day-dry.png` — Pilgrims Drop | `s2-05-hawthorn-day-dry.png` — Hawthorns | `s2-06-westfield-day-dry.png` — Westfield |
| `s2-07-dingle-dell-day-dry.png` — Dingle Dell | | |

### Sector 3 — Sheene, Stirlings, Clark

| Frame | Frame | Frame |
|---|---|---|
| `s3-01-sheene-day-dry.png` — Sheene | `s3-02-stirlings-day-dry.png` — Stirlings | `s3-03-clark-day-dry.png` — Clark |
| `s3-04-start-gantry-day-dry.png` — race control / gantry | | |

---

## Weather & lighting (hero views)

Variants on **pit straight**, **Paddock Hill**, **Druids**, **Dingle Dell**, plus **Clark** dusk/rain. Circuit has `night: false` and `lamp: "none"` — night frames are engine default sky only (no floodlit grandstands).

### Pit straight / Brabham

| Frame | Frame | Frame |
|---|---|---|
| `hero-pit-dusk-dry.png` | `hero-pit-dawn-dry.png` | `hero-pit-night-dry.png` |
| `hero-pit-day-overcast.png` | `hero-pit-day-rain.png` | `hero-pit-day-fog.png` |

### Paddock Hill

| Frame | Frame | Frame |
|---|---|---|
| `hero-paddock-dusk-dry.png` | `hero-paddock-night-dry.png` | `hero-paddock-day-rain.png` |
| `hero-paddock-day-overcast.png` | | |

### Druids & Dingle Dell

| Frame | Frame | Frame |
|---|---|---|
| `hero-druids-dusk-dry.png` | `hero-druids-night-dry.png` | `hero-druids-day-fog.png` |
| `hero-dingle-dusk-dry.png` | `hero-dingle-night-dry.png` | `hero-dingle-day-rain.png` |
| `hero-dingle-day-overcast.png` | | |

### Clark Curve

| Frame | Frame | Frame |
|---|---|---|
| `hero-clark-dusk-dry.png` | `hero-clark-day-rain.png` | |

---

## Findings

| ID | Severity | Topic | Evidence |
|---|---|---|---|
| F1 | Low | Car park cars buried on steep banking | `ground-audit` had 2× buried @ `carPark` line 113 (≤1.3 m); tightened `terrainYAt` skip to 0.28 m |
| F2 | Low | Kentagon terrace hut buried | `house` @ `sl(0.008)`; added grade check before emit |
| F3 | Low | Chalk/worn patch overlap | Duplicate chalk @ `s=0.030` overlapped worn path @ 0.030/22 m; removed chalk row |
| F4 | Baseline | Prop clip ≥1 m | `clip-audit`: 1 severe @ frac ~0.943 (`addFrustum` pair) — at retail/entrance frontage; unchanged (at cap) |
| F5 | Baseline | Coplanar ground patches | 3 flatCoplanar spots (worn vs bar decking); within baseline |
| F6 | Info | Tree guard drops | `verify-track`: 339 trees + 1 mountain suppressed (tight bowl / cross-loop clearance) |
| F7 | Weather | Night lighting | `night: false`, no lamp furniture — night shots read as unlit bowl; expected until lighting pass |
| F8 | Weather | Rain/fog | Wet road + particles OK; no circuit-specific night lamps to validate |
| F9 | Perf | Prop budget | ~326k prop tris post-strip; heavy but within fleet ratchet; SwiftShader ~15–25 s/frame |

**Visual read (day dry):** Bowl amphitheatre, named stands, Kentagon silhouette, woods contrast on GP loop, Paddock Hill drop reads well. No road surface folds. Minor z-fight risk on overlapping asphalt patches at Paddock Hill bar (F5).

---

## Ranked improvements (backlog)

1. **Clip at Clark/pit frontage (~0.943)** — triage severe pair; likely trim tree belt or shift entrance `building` @ `sl(1.014)` (engine-safe spacing).
2. **Night / lamps** — if MSV night events matter, enable `night: true` + targeted `lampPost` on pit straight only (needs lighting-tuner; def change).
3. **Coplanar worn vs decking** — merge `groundPatch` spans @ Paddock Hill bar (`0.030`/`0.042`) into one patch.
4. **Woods thinning at Stirlings** — optional density tweak in `every(14)` fourth rank as bowl reopens (visual only).
5. **Follow-up weather matrix** — after shared shot-tooling PR: commit PNGs, add track-picker still, standardize wx batch without scratch driver.

---

## Fixes applied (this PR)

- `carPark`: stricter slope filter (`0.35` → `0.28` m) — **buried/unsupported car clusters 0**.
- Kentagon terrace `house`: `terrainYAt` footing guard.
- Removed redundant chalk `groundPatch` at `s=0.030` (overlap with worn path).

## Verification

```
node tools/track/verify-track.cjs brands_hatch   → OK
node tools/track/audit-circuit.cjs brands_hatch → ok (6 checks); ground buried 0 unsupported 0
```

Foundation spec not run this session (scenery-only); run `node tools/ci/pick-tests.mjs` before ready.
