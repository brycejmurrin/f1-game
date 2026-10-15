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

36 JPEG frames (`shot.mjs --batch`, SwiftShader, `--jpeg --present-timeout 90 --capture-retries 4 --wait 120`), 1280 px wide, ≤300 KB each. Weather via `--weather` (`dry`, `wet`, `rain`, `overcast`, `fog`, `storm`); time via `--tod` (`day`, `dawn`, `dusk`, `night`).

---

## Sector coverage (day / dry)

Sector splits from def: S1 `s` 0–27%, S2 27–70.3%, S3 70.3–100%.

### Sector 1 — Brabham, Paddock Hill, Druids

| | | |
|---|---|---|
| ![Pit straight — orbit, day, dry](../../../artifacts/shots/tracks/brands_hatch/s1-01-pit-straight-day-dry.jpg)<br>**Pit straight** · orbit · day · dry | ![Paddock Hill — trackside, day, dry](../../../artifacts/shots/tracks/brands_hatch/s1-02-paddock-hill-day-dry.jpg)<br>**Paddock Hill** · trackside · day · dry | ![Kentagon — orbit, day, dry](../../../artifacts/shots/tracks/brands_hatch/s1-03-kentagon-day-dry.jpg)<br>**Kentagon (+1)** · orbit · day · dry |
| ![Druids — orbit, day, dry](../../../artifacts/shots/tracks/brands_hatch/s1-04-druids-day-dry.jpg)<br>**Druids** · orbit · day · dry | ![Druids footbridge — cinematic, day, dry](../../../artifacts/shots/tracks/brands_hatch/s1-05-druids-bridge-day-dry.jpg)<br>**Druids footbridge** · cinematic · day · dry | ![Hailwoods — trackside, day, dry](../../../artifacts/shots/tracks/brands_hatch/s1-06-hailwoods-day-dry.jpg)<br>**Hailwoods dip** · trackside · day · dry |

### Sector 2 — Cooper, Surtees, woods

| | | |
|---|---|---|
| ![Graham Hill — trackside, day, dry](../../../artifacts/shots/tracks/brands_hatch/s2-01-graham-hill-day-dry.jpg)<br>**Graham Hill** · trackside · day · dry | ![Cooper — orbit, day, dry](../../../artifacts/shots/tracks/brands_hatch/s2-02-cooper-day-dry.jpg)<br>**Cooper Straight** · orbit · day · dry | ![Surtees — trackside, day, dry](../../../artifacts/shots/tracks/brands_hatch/s2-03-surtees-day-dry.jpg)<br>**Surtees exit** · trackside · day · dry |
| ![Pilgrims — orbit, day, dry](../../../artifacts/shots/tracks/brands_hatch/s2-04-pilgrims-bridge-day-dry.jpg)<br>**Pilgrims Drop** · orbit · day · dry | ![Hawthorn — eye, day, dry](../../../artifacts/shots/tracks/brands_hatch/s2-05-hawthorn-day-dry.jpg)<br>**Hawthorns** · eye · day · dry | ![Westfield — trackside, day, dry](../../../artifacts/shots/tracks/brands_hatch/s2-06-westfield-day-dry.jpg)<br>**Westfield** · trackside · day · dry |
| ![Dingle Dell — cinematic, day, dry](../../../artifacts/shots/tracks/brands_hatch/s2-07-dingle-dell-day-dry.jpg)<br>**Dingle Dell** · cinematic · day · dry | | |

### Sector 3 — Sheene, Stirlings, Clark

| | | |
|---|---|---|
| ![Sheene — orbit, day, dry](../../../artifacts/shots/tracks/brands_hatch/s3-01-sheene-day-dry.jpg)<br>**Sheene** · orbit · day · dry | ![Stirlings — trackside, day, dry](../../../artifacts/shots/tracks/brands_hatch/s3-02-stirlings-day-dry.jpg)<br>**Stirlings** · trackside · day · dry | ![Clark — trackside, day, dry](../../../artifacts/shots/tracks/brands_hatch/s3-03-clark-day-dry.jpg)<br>**Clark Curve** · trackside · day · dry |
| ![Start gantry — orbit, day, dry](../../../artifacts/shots/tracks/brands_hatch/s3-04-start-gantry-day-dry.jpg)<br>**Race control / gantry** · orbit · day · dry | | |

---

## Weather & lighting (hero views)

Hero landmarks: pit straight, Paddock Hill, Druids, Dingle Dell, Clark. Circuit `night: false`, `lamp: "none"` — night is sky-only (no floodlit stands).

### Pit straight / Brabham

| | | |
|---|---|---|
| ![Pit — orbit, dusk, dry](../../../artifacts/shots/tracks/brands_hatch/hero-pit-dusk-dry.jpg)<br>**Pit straight** · orbit · dusk · dry | ![Pit — orbit, night, dry](../../../artifacts/shots/tracks/brands_hatch/hero-pit-night-dry.jpg)<br>**Pit straight** · orbit · night · dry | ![Pit — orbit, day, overcast](../../../artifacts/shots/tracks/brands_hatch/hero-pit-day-overcast.jpg)<br>**Pit straight** · orbit · day · overcast |
| ![Pit — orbit, day, rain](../../../artifacts/shots/tracks/brands_hatch/hero-pit-day-rain.jpg)<br>**Pit straight** · orbit · day · rain | ![Pit — orbit, day, fog](../../../artifacts/shots/tracks/brands_hatch/hero-pit-day-fog.jpg)<br>**Pit straight** · orbit · day · fog | ![Pit — orbit, day, wet](../../../artifacts/shots/tracks/brands_hatch/hero-pit-day-wet.jpg)<br>**Pit straight** · orbit · day · wet |
| ![Pit — orbit, day, storm](../../../artifacts/shots/tracks/brands_hatch/hero-pit-day-storm.jpg)<br>**Pit straight** · orbit · day · storm | | |

### Paddock Hill

| | | |
|---|---|---|
| ![Paddock — trackside, dusk, dry](../../../artifacts/shots/tracks/brands_hatch/hero-paddock-dusk-dry.jpg)<br>**Paddock Hill** · trackside · dusk · dry | ![Paddock — trackside, night, dry](../../../artifacts/shots/tracks/brands_hatch/hero-paddock-night-dry.jpg)<br>**Paddock Hill** · trackside · night · dry | ![Paddock — trackside, day, rain](../../../artifacts/shots/tracks/brands_hatch/hero-paddock-day-rain.jpg)<br>**Paddock Hill** · trackside · day · rain |
| ![Paddock — trackside, day, overcast](../../../artifacts/shots/tracks/brands_hatch/hero-paddock-day-overcast.jpg)<br>**Paddock Hill** · trackside · day · overcast | | |

### Druids & Dingle Dell

| | | |
|---|---|---|
| ![Druids — orbit, dusk, dry](../../../artifacts/shots/tracks/brands_hatch/hero-druids-dusk-dry.jpg)<br>**Druids** · orbit · dusk · dry | ![Druids — orbit, night, dry](../../../artifacts/shots/tracks/brands_hatch/hero-druids-night-dry.jpg)<br>**Druids** · orbit · night · dry | ![Druids — orbit, day, fog](../../../artifacts/shots/tracks/brands_hatch/hero-druids-day-fog.jpg)<br>**Druids** · orbit · day · fog |
| ![Dingle — cinematic, dusk, dry](../../../artifacts/shots/tracks/brands_hatch/hero-dingle-dusk-dry.jpg)<br>**Dingle Dell** · cinematic · dusk · dry | ![Dingle — cinematic, night, dry](../../../artifacts/shots/tracks/brands_hatch/hero-dingle-night-dry.jpg)<br>**Dingle Dell** · cinematic · night · dry | ![Dingle — cinematic, day, rain](../../../artifacts/shots/tracks/brands_hatch/hero-dingle-day-rain.jpg)<br>**Dingle Dell** · cinematic · day · rain |
| ![Dingle — cinematic, day, storm](../../../artifacts/shots/tracks/brands_hatch/hero-dingle-day-storm.jpg)<br>**Dingle Dell** · cinematic · day · storm | | |

### Clark Curve

| | | |
|---|---|---|
| ![Clark — trackside, day, rain](../../../artifacts/shots/tracks/brands_hatch/hero-clark-day-rain.jpg)<br>**Clark Curve** · trackside · day · rain | | |

---

## Findings

| ID | Severity | Topic | Evidence |
|---|---|---|---|
| F1 | Low | Car park cars buried on steep banking | `ground-audit` had 2× buried @ `carPark` line 113; tightened `terrainYAt` skip to 0.28 m |
| F2 | Low | Kentagon terrace hut buried | `house` @ `sl(0.008)`; added grade check before emit |
| F3 | Low | Chalk/worn patch overlap | Removed duplicate chalk @ `s=0.030` |
| F4 | Baseline | Prop clip ≥1 m | `clip-audit`: 1 severe @ frac ~0.943; unchanged (at cap) |
| F5 | Baseline | Coplanar ground patches | 3 flatCoplanar spots; within baseline |
| F6 | Info | Tree guard drops | `verify-track`: 339 trees + 1 mountain suppressed |
| F7 | Weather | Night lighting | `night: false`, no lamps — night frames unlit bowl |
| F8 | Weather | Storm/wet | `hero-pit-day-storm`, `hero-pit-day-wet`, `hero-dingle-day-storm` via `shot.mjs --weather` |

**Visual read (day dry):** Bowl amphitheatre, named stands, Kentagon, woods contrast, Paddock Hill drop. No surface folds.

---

## Ranked improvements (backlog)

1. Clip at Clark/pit frontage (~0.943) — baseline cap; spacing tweak on entrance row.
2. Night lamps if MSV night events matter (`night: true` + lighting-tuner).
3. Coplanar worn vs decking at Paddock Hill bar.
4. Woods thinning at Stirlings reopening.

---

## Fixes applied (this PR)

- `carPark`: stricter slope filter — buried/unsupported **0**.
- Kentagon terrace `house`: `terrainYAt` footing guard.
- Removed overlapping chalk `groundPatch` at `s=0.030`.

## Verification

```
node tools/track/verify-track.cjs brands_hatch   → OK
node tools/track/audit-circuit.cjs brands_hatch → ok (6 checks)
```

Foundation spec not run; run `pick-tests` before ready.
