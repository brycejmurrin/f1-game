# Watkins Glen (`watkins_glen`) — circuit survey

**Date:** 2026-10-14  
**Branch:** `cursor/watkins-glen-survey-e49b` → `claude/f1-game-project-26h3ng`  
**Live:** https://brycejmurrin.github.io/f1-game/  
**Shots (committed):** `artifacts/shots/tracks/watkins_glen/*.jpg` (23 frames, day-dry sector pass + pit-terrace wet/rain/overcast samples)

## Code map

| Layer | Path | Role |
|--------|------|------|
| Registry | `js/track/tracks.js` → `Tracks.LIST` | Classic US GP; `theme: green`, `terrainOuter: 120`. |
| Circuit def | `js/circuits/watkins_glen.js` | OSM centreline 5454 m; Esses / Boot elevation; sectors `[0.334, 0.666]`; 11 `turns`; `dressingExclusions` pit + Esses; `broadleafFall` furniture. |
| Scenery | `js/circuits/scenery/watkins_glen.js` | Autumn maples, pit complex, blue Armco, footbridge, camps, RV lot, dairy, gate, Seneca `waterBand`. |
| Landmarks | `tests/data/landmarks/watkins_glen.json` | `glen-timing-tower`, `glen-pit-terrace`, `glen-esses-hill`. |
| Brief | `docs/tracks/watkins_glen.md` | Palette, elevation, landmark table. |

**Build health:** `verify-track` OK; `audit-circuit` ok — float/clip/coplanar 0; ground buried **0** (within baseline cap 1); ~339.6k props tris.

## Theme and models

- **Look:** Finger Lakes autumn — scarlet/amber `maple()` rank, `forestEdge` colour bands, weathered timber / concrete club infrastructure.
- **Hero groups:** pit garages, 2006 lattice tower, Nazareth pit terrace, Esses hill stand, footbridge, Boot/climb camps, RV field, dairy farm, main gate.

---

## Panel grids — Sector 1 (s ≈ 0.00–0.33, day / dry)

| | | |
|:---:|:---:|:---:|
| ![Pit straight orbit](../../../artifacts/shots/tracks/watkins_glen/sector1-start-orbit-day-dry.jpg) | ![Start trackside](../../../artifacts/shots/tracks/watkins_glen/sector1-start-trackside-day-dry.jpg) | ![Turn 1](../../../artifacts/shots/tracks/watkins_glen/sector1-turn1-orbit-day-dry.jpg) |
| Pit straight — orbit, day, dry | Start line — trackside, day, dry | Turn 1 — orbit, day, dry |
| ![Esses approach](../../../artifacts/shots/tracks/watkins_glen/sector1-esses-approach-orbit-day-dry.jpg) | ![Esses driving](../../../artifacts/shots/tracks/watkins_glen/sector1-esses-drive-day-dry.jpg) | ![Dairy farm](../../../artifacts/shots/tracks/watkins_glen/sector1-dairy-farm-orbit-day-dry.jpg) |
| Esses approach — orbit, day, dry | Esses — chase, day, dry | Dairy farm — orbit, day, dry |
| ![Seneca lake band](../../../artifacts/shots/tracks/watkins_glen/sector1-seneca-lake-orbit-day-dry.jpg) | | |
| Seneca backdrop — orbit, day, dry | | |

## Panel grids — Sector 2 (s ≈ 0.33–0.66, day / dry)

| | | |
|:---:|:---:|:---:|
| ![Esses exit](../../../artifacts/shots/tracks/watkins_glen/sector2-esses-exit-orbit-day-dry.jpg) | ![Footbridge](../../../artifacts/shots/tracks/watkins_glen/sector2-footbridge-orbit-day-dry.jpg) | ![RV camp](../../../artifacts/shots/tracks/watkins_glen/sector2-rv-camp-orbit-day-dry.jpg) |
| Esses exit — orbit, day, dry | Footbridge — orbit, day, dry | RV camp — orbit, day, dry |
| ![Boot entry](../../../artifacts/shots/tracks/watkins_glen/sector2-boot-entry-orbit-day-dry.jpg) | ![Boot mid](../../../artifacts/shots/tracks/watkins_glen/sector2-boot-mid-orbit-day-dry.jpg) | ![Boot toe](../../../artifacts/shots/tracks/watkins_glen/sector2-boot-toe-orbit-day-dry.jpg) |
| Boot entry — orbit, day, dry | Boot mid — orbit, day, dry | Boot toe — orbit, day, dry |
| ![Boot camp](../../../artifacts/shots/tracks/watkins_glen/sector2-camp-boot-orbit-day-dry.jpg) | | |
| Boot woodland camp — orbit, day, dry | | |

## Panel grids — Sector 3 (s ≈ 0.66–1.00, day / dry)

| | | |
|:---:|:---:|:---:|
| ![Climb out](../../../artifacts/shots/tracks/watkins_glen/sector3-climb-orbit-day-dry.jpg) | ![Climb camp](../../../artifacts/shots/tracks/watkins_glen/sector3-climb-camp-orbit-day-dry.jpg) | ![Anvil](../../../artifacts/shots/tracks/watkins_glen/sector3-anvil-orbit-day-dry.jpg) |
| Climb out of Boot — orbit, day, dry | Climb camp — orbit, day, dry | The Anvil — orbit, day, dry |
| ![Pit terrace](../../../artifacts/shots/tracks/watkins_glen/sector3-pit-terrace-orbit-day-dry.jpg) | ![Timing tower](../../../artifacts/shots/tracks/watkins_glen/sector3-timing-tower-orbit-day-dry.jpg) | ![Main gate](../../../artifacts/shots/tracks/watkins_glen/sector3-main-gate-orbit-day-dry.jpg) |
| Pit terrace — orbit, day, dry | Timing tower — orbit, day, dry | Main gate — orbit, day, dry |

## Panel grids — Weather / lighting samples (pit terrace anchor)

Captured with manual `__apex.weather()` before shared batch tooling; Esses / Boot / Anvil matrix deferred.

| | | |
|:---:|:---:|:---:|
| ![Pit wet](../../../artifacts/shots/tracks/watkins_glen/landmark-pit-terrace-orbit-day-wet.jpg) | ![Pit rain](../../../artifacts/shots/tracks/watkins_glen/landmark-pit-terrace-orbit-day-rain.jpg) | ![Pit overcast](../../../artifacts/shots/tracks/watkins_glen/landmark-pit-terrace-orbit-day-overcast.jpg) |
| Pit terrace — orbit, day, **wet** | Pit terrace — orbit, day, **rain** | Pit terrace — orbit, day, **overcast** |

**Picker (repo asset):** `assets/stills/watkins_glen.webp`

---

## Findings (day, dry)

**Strengths:** Fall colour in Esses/Boot; pit complex readable; blue double Armco; audits clean.

**Visual issues:** Generic tree row on Esses outside; busy pit hoarding panels; Seneca lake not track-visible (expected).

**Weather samples:** Wet/rain/overcast at pit terrace show particle rain and muted sun; night/dusk matrix not captured on this branch yet.

### Weather / lighting backlog

| Issue | Notes |
|-------|--------|
| Night pit dark | `furniture.lamp: "none"` — no flood masts |
| Dusk / night matrix | Follow-up after shared `shot.mjs` weather batch |
| Rain on foliage | Tune after full wet matrix |

## Fix applied (circuit-only)

| Change | File |
|--------|------|
| OB `broadcastCompound` gap 110 → **125 m** | `js/circuits/scenery/watkins_glen.js` |

## Ranked improvements

| P | Item |
|---|------|
| 1 | Esses generic tree bleed |
| 2 | Complete 36-frame weather matrix (4 anchors) |
| 3 | `api.bleacher` migration |
| 4 | Night lamps policy |

## Verification

```sh
node tools/track/verify-track.cjs watkins_glen
node tools/track/audit-circuit.cjs watkins_glen
```
