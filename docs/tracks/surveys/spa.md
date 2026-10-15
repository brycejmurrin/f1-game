# Spa-Francorchamps — circuit survey (2026-10-14)

**Circuit id:** `spa`  
**Live:** https://brycejmurrin.github.io/f1-game/  
**Branch:** `cursor/spa-survey-fixes-a5b0` → `claude/f1-game-project-26h3ng`

## Capture status

| Item | Status |
|------|--------|
| Survey grid | **36 frames** in `artifacts/shots/tracks/spa/` (JPEG q≈80, ≤1280 px, `git add -f`). |
| Time of day | **day**, **dusk**, **dawn**, **night** (night partial — `night: false` on def). |
| Weather | **dry** lap sweep + hero **overcast**, **fog**, **rain**, **wet** (`shot.mjs --weather`). |

**Night note:** `furniture.lamp: "none"` — night frames are very dark; no floodlight pass.

---

## Code map

| Layer | Path | Role |
|--------|------|------|
| Circuit def | `js/circuits/spa.js` | OSM centreline, elevation, `terrainOuter` 90 / `terrainFalloffStart` 54, damp-Ardennes `pal`. |
| Scenery | `js/circuits/scenery/spa.js` | Mountains, `forestRank`, Gold 3, Bus Stop, brook, N62, church, kits. |
| Meta | `js/track/circuit-meta.js` | Picker: theme `green`, 7 km. |
| Engine | `js/track/tracks.js` | Builds defs, `buildProps` → `def.scenery(api)`. |
| Brief | `docs/tracks/spa.md` | Visual design brief. |

---

## Theme and models

- **Atmosphere:** `ATM.dampArdennes`, grey sky/fog, mown-grass runoff.
- **Hero IDs:** Gold 3 jumbotron, timing tower, Francorchamps church, footbridges, RV camps.
- **Audit:** `verify-track` OK; clip **3 severe** (cap 4); float 0; ground clean.

---

## Screenshots by weather / lighting (6 hero views)

| | | |
|:---:|:---:|:---:|
| ![Pit / start · overcast · day (s≈0)](../../../artifacts/shots/tracks/spa/pit-start_day_overcast.jpg) | ![Eau Rouge · fog · day (s≈0.14)](../../../artifacts/shots/tracks/spa/eau-rouge_day_fog.jpg) | ![Eau Rouge · rain · day (s≈0.14)](../../../artifacts/shots/tracks/spa/eau-rouge_day_rain.jpg) |
| ![Kemmel straight · dry · dawn (s≈0.245)](../../../artifacts/shots/tracks/spa/kemmel_dawn_dry.jpg) | ![Pouhon · wet · day (s≈0.564)](../../../artifacts/shots/tracks/spa/pouhon_day_wet.jpg) | ![Bus Stop · wet · dusk (s≈0.943)](../../../artifacts/shots/tracks/spa/bus-stop_dusk_wet.jpg) |

---

## Full panel grid (36 frames)

| | | |
|:---:|:---:|:---:|
| ![Pit / start · dry · day (s≈0)](../../../artifacts/shots/tracks/spa/pit-start_day_dry.jpg) | ![Pit / start · overcast · day (s≈0)](../../../artifacts/shots/tracks/spa/pit-start_day_overcast.jpg) | ![Pit / start · dry · dusk (s≈0)](../../../artifacts/shots/tracks/spa/pit-start_dusk_dry.jpg) |
| ![Pit / start · dry · night (s≈0)](../../../artifacts/shots/tracks/spa/pit-start_night_dry.jpg) | ![La Source · dry · day (s≈0.035)](../../../artifacts/shots/tracks/spa/la-source_day_dry.jpg) | ![La Source · dry · dusk (s≈0.035)](../../../artifacts/shots/tracks/spa/la-source_dusk_dry.jpg) |
| ![La Source · dry · night (s≈0.035)](../../../artifacts/shots/tracks/spa/la-source_night_dry.jpg) | ![Village / church · dry · day (s≈0.062)](../../../artifacts/shots/tracks/spa/village-church_day_dry.jpg) | ![Eau Rouge · dry · day (s≈0.14)](../../../artifacts/shots/tracks/spa/eau-rouge_day_dry.jpg) |
| ![Eau Rouge · fog · day (s≈0.14)](../../../artifacts/shots/tracks/spa/eau-rouge_day_fog.jpg) | ![Eau Rouge · rain · day (s≈0.14)](../../../artifacts/shots/tracks/spa/eau-rouge_day_rain.jpg) | ![Eau Rouge · dry · dusk (s≈0.14)](../../../artifacts/shots/tracks/spa/eau-rouge_dusk_dry.jpg) |
| ![Eau Rouge · dry · night (s≈0.14)](../../../artifacts/shots/tracks/spa/eau-rouge_night_dry.jpg) | ![Gold 3 stands · dry · day (s≈0.15)](../../../artifacts/shots/tracks/spa/gold3-stands_day_dry.jpg) | ![Gold 3 stands · dry · dusk (s≈0.15)](../../../artifacts/shots/tracks/spa/gold3-stands_dusk_dry.jpg) |
| ![Raidillon · dry · day (s≈0.165)](../../../artifacts/shots/tracks/spa/raidillon_day_dry.jpg) | ![Raidillon · dry · dusk (s≈0.165)](../../../artifacts/shots/tracks/spa/raidillon_dusk_dry.jpg) | ![Raidillon · dry · night (s≈0.165)](../../../artifacts/shots/tracks/spa/raidillon_night_dry.jpg) |
| ![Kemmel straight · dry · dawn (s≈0.245)](../../../artifacts/shots/tracks/spa/kemmel_dawn_dry.jpg) | ![Kemmel straight · dry · day (s≈0.245)](../../../artifacts/shots/tracks/spa/kemmel_day_dry.jpg) | ![Kemmel straight · dry · dusk (s≈0.245)](../../../artifacts/shots/tracks/spa/kemmel_dusk_dry.jpg) |
| ![Kemmel straight · dry · night (s≈0.245)](../../../artifacts/shots/tracks/spa/kemmel_night_dry.jpg) | ![Old N62 ribbon · dry · day (s≈0.105)](../../../artifacts/shots/tracks/spa/old-n62_day_dry.jpg) | ![Les Combes · dry · day (s≈0.326)](../../../artifacts/shots/tracks/spa/les-combes_day_dry.jpg) |
| ![Les Combes · dry · dusk (s≈0.326)](../../../artifacts/shots/tracks/spa/les-combes_dusk_dry.jpg) | ![Bruxelles · dry · day (s≈0.45)](../../../artifacts/shots/tracks/spa/bruxelles_day_dry.jpg) | ![Bruxelles · dry · dusk (s≈0.45)](../../../artifacts/shots/tracks/spa/bruxelles_dusk_dry.jpg) |
| ![Pouhon · dry · day (s≈0.564)](../../../artifacts/shots/tracks/spa/pouhon_day_dry.jpg) | ![Pouhon · wet · day (s≈0.564)](../../../artifacts/shots/tracks/spa/pouhon_day_wet.jpg) | ![Pouhon · dry · dusk (s≈0.564)](../../../artifacts/shots/tracks/spa/pouhon_dusk_dry.jpg) |
| ![Stavelot · dry · day (s≈0.715)](../../../artifacts/shots/tracks/spa/stavelot_day_dry.jpg) | ![Blanchimont · dry · day (s≈0.857)](../../../artifacts/shots/tracks/spa/blanchimont_day_dry.jpg) | ![Blanchimont · dry · dusk (s≈0.857)](../../../artifacts/shots/tracks/spa/blanchimont_dusk_dry.jpg) |
| ![Bus Stop · dry · day (s≈0.943)](../../../artifacts/shots/tracks/spa/bus-stop_day_dry.jpg) | ![Bus Stop · dry · dusk (s≈0.943)](../../../artifacts/shots/tracks/spa/bus-stop_dusk_dry.jpg) | ![Bus Stop · wet · dusk (s≈0.943)](../../../artifacts/shots/tracks/spa/bus-stop_dusk_wet.jpg) |

---

## Findings

### Layout / road

- Centreline **0 surface folds**; ~101 m relief reads well (Eau Rouge, Raidillon, Gold 3).
- **Bus Stop** inner kerb: sharp terrain fold (ribbon overlap) — engine/terrain consumer, not centreline.

### Scenery

- **Strengths:** Gold 3 amphitheatre, deep `forestRank`, N62 ribbon, brook, damp palette.
- **Pine tiers:** occasional horizontal banding on crowns (engine tier cull) — shot Eau Rouge day.
- **Gold 3:** stand spacing tightened; ~1.2 m box clip @ s≈0.130 remains (within clip cap).
- **Pit loop:** deep-rank pine vs motorhome ~2.1 m clip @ s≈0.957 (track doubles back); `OPEN` widened, still one severe spot.

### Lighting / weather-specific (from day/dusk/night only)

| Issue | Where | Severity |
|-------|-------|----------|
| No floodlights / very dark night | Whole lap (`night: false`, `lamp: none`) | Expected until optional lamp pass |
| Dusk sky still readable | Gold 3, Eau Rouge | OK — matches damp brief |
| Wet/rain/overcast/fog | Hero frames committed | Rain streaks visible Eau Rouge; wet sheen Pouhon/Bus Stop |

---

## Ranked backlog

| P | Item | Scope |
|---|------|--------|
| P1 | Bus Stop terrain fold | Terrain / def — likely not scenery-only |
| P2 | Night visibility (`night: true` or selective `lampPost`) | `spa.js` def + scenery |
| P3 | Pit-loop forest vs motorhome clip | `spa.js` `OPEN` / motorhome anchor |
| P4 | Gold 3 stand overlap | `grandstandEx` spacing |
| P5 | Storm hero frame | Optional follow-up |

---

## Fixes on this branch (`js/circuits/scenery/spa.js` only)

1. Gold 3 `grandstandEx` spacing; `spectatorHill` shift.
2. Timing-tower clock on glazing (ground unsupported → 0).
3. Church spire 6 cm offset (flatCoplanar → 0).
4. `forestRank` `OPEN` windows (Kemmel, Bus Stop loop, Blanchimont); Kemmel accent pines `s` 0.16→0.22.
5. Clip severe **4 → 3** (Kemmel forest vs terrace cleared).

---

## Verification

```sh
node tools/track/verify-track.cjs spa
node tools/track/audit-circuit.cjs spa
# Browser (post-push): tests/specs/spa-foundation.spec.js
```
