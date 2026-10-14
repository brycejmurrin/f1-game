# Spa-Francorchamps — circuit survey (2026-10-14)

**Circuit id:** `spa`  
**Live:** https://brycejmurrin.github.io/f1-game/  
**Branch:** `cursor/spa-survey-fixes-a5b0` → `claude/f1-game-project-26h3ng`

## Capture status

| Item | Status |
|------|--------|
| Dry **day / dusk / night** (`shot.mjs --tod`) | **31 frames** captured headless TLX; paths below (`artifacts/shots/tracks/spa/`). Not committed yet — blocked on shared PR *tools: shared shot tooling for circuit surveys* (`.gitignore` exception for `artifacts/shots/tracks/**`). |
| **Weather** (`dry` / `wet` / `rain` / `overcast` / `fog` via `__apex.weather`) | **Deferred** — same shared PR adds batch `wx` + retries. Planned on **4–6 hero views** after rebase: Eau Rouge, Pouhon, Bus Stop, pit straight (+ optional Blanchimont fog, Kemmel dawn). |
| Prior pilot (15 frames) | `/opt/cursor/artifacts/spa-survey/` on the survey agent VM (not in repo). |

**Night note:** `js/circuits/spa.js` sets `night: false` and `furniture.lamp: "none"`. Night shots are intentionally dark; no circuit floodlight pass — expect missing trackside lamps (backlog P2).

---

## Code map

| Layer | Path | Role |
|--------|------|------|
| Circuit def | `js/circuits/spa.js` | OSM centreline (`path.len` 6979 m), 64-knot elevation, `sceneryStartFrac` 0.9875, `terrainOuter` 90 / `terrainFalloffStart` 54, damp-Ardennes `pal`, bank zones, sectors `[0.28, 0.68]`, 20 turn markers. |
| Scenery | `js/circuits/scenery/spa.js` | Lazy `TrackScenery["spa"]`: mountains, `forestEdge` + `forestRank`, Gold 3, terraces, Bus Stop, brook, N62 ribbon, church, kits. |
| Meta | `js/track/circuit-meta.js` | Picker: theme `green`, 7 km, `sunAzimBias` 0.44. |
| Engine | `js/track/tracks.js` | Builds defs, `_sceneryShift`, `buildProps` → `def.scenery(api)`. |
| Brief | `docs/tracks/spa.md` | Palette, landmarks, research (old course, village). |

Authored scenery fractions ≈ racing + 0.0423 (see `OPEN` comments in scenery).

---

## Theme and models

- **Atmosphere:** `ATM.dampArdennes`, grey sky/fog, mown-grass runoff override.
- **Hero IDs:** `spa-raidillon-gold-dual-jumbotron`, `spa-timing-tower`, `spa-francorchamps-church`, Kemmel footbridges, RV camps.
- **Audit (this branch):** `verify-track` OK; clip **3 severe** (cap 4); float 0; ground unsupported 0, flatCoplanar 0.

---

## Screenshots by sector (dry weather, day unless noted)

Filenames below are under `artifacts/shots/tracks/spa/` on disk; they will be committed after the shared tooling PR adds the gitignore exception. The open PR embeds the panel grids as images.

### Sector 1 — La Source → Kemmel (racing s ≈ 0–0.28)

| Frame A | Frame B | Frame C |
|---------|---------|---------|
| `pit-start_day_dry.jpg` — pit **day** | `pit-start_dusk_dry.jpg` — pit **dusk** | `pit-start_night_dry.jpg` — pit **night** |
| `la-source_day_dry.jpg` — La Source **day** | `la-source_dusk_dry.jpg` — **dusk** | `la-source_night_dry.jpg` — **night** |
| `eau-rouge_day_dry.jpg` — Eau Rouge **day** | `eau-rouge_dusk_dry.jpg` — **dusk** | `eau-rouge_night_dry.jpg` — **night** |
| `raidillon_day_dry.jpg` — Raidillon **day** | `raidillon_dusk_dry.jpg` — **dusk** | `raidillon_night_dry.jpg` — **night** |
| `gold3-stands_day_dry.jpg` — Gold 3 **day** | `gold3-stands_dusk_dry.jpg` — **dusk** | `kemmel_day_dry.jpg` — Kemmel **day** |
| `kemmel_dusk_dry.jpg` — Kemmel **dusk** | `village-church_day_dry.jpg` — village **day** | `village-church_dusk_dry.jpg` — **dusk** |

### Sector 2 — Les Combes → Stavelot (s ≈ 0.28–0.68)

| Frame A | Frame B | Frame C |
|---------|---------|---------|
| `les-combes_day_dry.jpg` — **day** | `les-combes_dusk_dry.jpg` — **dusk** | `bruxelles_day_dry.jpg` — Bruxelles **day** |
| `bruxelles_dusk_dry.jpg` — **dusk** | `pouhon_day_dry.jpg` — Pouhon **day** | `pouhon_dusk_dry.jpg` — **dusk** |
| `stavelot_day_dry.jpg` — **day** | `stavelot_dusk_dry.jpg` — **dusk** | `old-n62_day_dry.jpg` — N62 **day** |
| `old-n62_dusk_dry.jpg` — N62 **dusk** | — | — |

### Sector 3 — Blanchimont → Bus Stop (s ≈ 0.68–1.0)

| Frame A | Frame B | Frame C |
|---------|---------|---------|
| `blanchimont_day_dry.jpg` — **day** | `blanchimont_dusk_dry.jpg` — **dusk** | `bus-stop_day_dry.jpg` — Bus Stop **day** |
| `bus-stop_dusk_dry.jpg` — **dusk** | — | — |

---

## Screenshots by time of day (same dry weather)

### Midday (`tod: day`)

| | | |
|---------|---------|---------|
| `pit-start_day_dry.jpg` s≈0.00 | `eau-rouge_day_dry.jpg` s≈0.14 | `pouhon_day_dry.jpg` s≈0.56 |
| `les-combes_day_dry.jpg` s≈0.33 | `blanchimont_day_dry.jpg` s≈0.86 | `bus-stop_day_dry.jpg` s≈0.94 |

### Golden hour (`tod: dusk`)

| | | |
|---------|---------|---------|
| `pit-start_dusk_dry.jpg` | `gold3-stands_dusk_dry.jpg` | `eau-rouge_dusk_dry.jpg` |
| `raidillon_dusk_dry.jpg` | `pouhon_dusk_dry.jpg` | `bus-stop_dusk_dry.jpg` |

### Night (`tod: night` — partial lap; lamps not authored)

| | | |
|---------|---------|---------|
| `pit-start_night_dry.jpg` | `la-source_night_dry.jpg` | `eau-rouge_night_dry.jpg` |
| `raidillon_night_dry.jpg` | *Remaining sectors: capture after shared PR* | |

### Weather / mist (planned after shared tooling PR)

| Planned view | `wx` | Purpose |
|--------------|------|---------|
| Eau Rouge | `fog`, `rain` | Ardennes mist + wet valley read |
| Pouhon | `wet` | Mid-lap spray / dark forest |
| Bus Stop | `wet` | Chicane runoff |
| Pit straight | `overcast` | Default damp palette vs sky |
| Blanchimont | `fog` | High-speed mist |
| Kemmel | `dawn` + `dry` | Low sun on straight |

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
| Wet/rain/overcast/fog | — | **Not shot yet** (tooling PR) |

---

## Ranked backlog

| P | Item | Scope |
|---|------|--------|
| P1 | Bus Stop terrain fold | Terrain / def — likely not scenery-only |
| P2 | Night visibility (`night: true` or selective `lampPost`) | `spa.js` def + scenery |
| P3 | Pit-loop forest vs motorhome clip | `spa.js` `OPEN` / motorhome anchor |
| P4 | Gold 3 stand overlap | `grandstandEx` spacing |
| P5 | Weather panel (6 frames) | After shared `shot` PR |
| P6 | Commit shot grid to `artifacts/shots/tracks/spa/` | After `.gitignore` PR |

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
