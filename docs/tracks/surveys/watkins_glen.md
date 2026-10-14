# Watkins Glen (`watkins_glen`) — circuit survey

**Date:** 2026-10-14  
**Branch:** `cursor/watkins-glen-survey-e49b` → `claude/f1-game-project-26h3ng`  
**Live:** https://brycejmurrin.github.io/f1-game/

## Capture status

| Phase | Frames | Status |
|-------|--------|--------|
| **A — sector / landmark (day, dry)** | 24 planned | **15 captured** (SwiftShader TLX, `shot.mjs --wait 35`). Evidence on this agent run: `/opt/cursor/artifacts/watkins_glen/01–15.png`. After rebase on shared tooling PR, commit under `artifacts/shots/tracks/watkins_glen/` (see manifest below). |
| **A — remainder** | 9 | Not captured this pass (boot gate, RV field, climb camp, main gate, tower close-up, etc.). |
| **B — weather / lighting** | 12 planned | **Blocked** until `tools: shared shot tooling for circuit surveys` lands (`weather` + `tod` batch on `shot.mjs`). Matrix: 4 anchors × (dusk dry, night dry, day wet, day rain). |
| **Total cap** | **36** | 24 + 12; no shared `tools/shot/*` or `.gitignore` edits on this PR. |

**Game weather / time API (for phase B):** `__apex.weather("dry"|"wet"|"rain"|"overcast"|"fog"|"storm")`, `__apex.setTimeOfDay("dawn"|"day"|"dusk"|"night")` (`js/race/weather-arc.js`, `js/agent/apex.js`). Watkins def: `night: false`, `furniture.lamp: "none"` — night presets exist in `js/lighting/presets.js` but **no lamp masts** are emitted (`build-props.js` respects `lamp: "none"`).

## Code map

| Layer | Path | Role |
|--------|------|------|
| Registry | `js/track/tracks.js` → `Tracks.LIST` | Classic US GP; `theme: green`, `terrainOuter: 120`. |
| Circuit def | `js/circuits/watkins_glen.js` | OSM centreline 5454 m; Esses / Boot elevation; sectors `[0.334, 0.666]`; 11 `turns`; `dressingExclusions` pit + Esses; `broadleafFall` furniture. |
| Scenery | `js/circuits/scenery/watkins_glen.js` | Autumn maples, pit complex, blue Armco, footbridge, camps, RV lot, dairy, gate, Seneca `waterBand`. |
| Landmarks | `tests/data/landmarks/watkins_glen.json` | `glen-timing-tower`, `glen-pit-terrace`, `glen-esses-hill`. |
| Brief | `docs/tracks/watkins_glen.md` | Palette, elevation, landmark table. |

**Build health (2026-10-14, post scenery fix):** `verify-track` OK; `audit-circuit` ok — float/clip/coplanar 0; ground buried **0** (within baseline cap 1); ~339.6k props tris; `suppressed tree=254`.

## Theme and models

- **Look:** Finger Lakes autumn — scarlet/amber `maple()` rank, `forestEdge` colour bands, weathered timber / concrete club infrastructure.
- **Hero groups:** pit garages, 2006 lattice tower, Nazareth pit terrace, Esses hill stand, footbridge, Boot/climb camps, RV field, dairy farm, main gate.

---

## Panel grids — Phase A (day, dry)

Paths are the **target** names under `artifacts/shots/tracks/watkins_glen/` after the follow-up capture commit. Captured frames map 1:1 from agent `01`–`15` where noted.

### Sector 1 (s ≈ 0.00–0.33)

| Frame | Filename (under `artifacts/shots/tracks/watkins_glen/`) | Agent capture |
|-------|--------------------------------------------------------|---------------|
| Start / pit straight | `sector1-start-orbit-day-dry.png` | `01-pit-straight.png` |
| Turn 1 | `sector1-turn1-orbit-day-dry.png` | `03-turn1.png` |
| Esses approach | `sector1-esses-approach-orbit-day-dry.png` | `04-esses-approach.png` |
| Esses driving | `sector1-esses-drive-day-dry.png` | `05-esses-driving.png` |
| Dairy farm | `sector1-dairy-farm-orbit-day-dry.png` | *planned* |
| Start trackside | `sector1-start-trackside-day-dry.png` | `02-start-line.png` |
| Seneca band | `sector1-seneca-lake-orbit-day-dry.png` | `15-seneca-lake-band.png` |

### Sector 2 (s ≈ 0.33–0.66)

| Frame | Filename | Agent capture |
|-------|----------|---------------|
| Esses exit | `sector2-esses-exit-orbit-day-dry.png` | `06-esses-exit.png` |
| Footbridge | `sector2-footbridge-orbit-day-dry.png` | `07-footbridge.png` |
| Boot entry | `sector2-boot-entry-orbit-day-dry.png` | `08-boot-entry.png` |
| Boot mid | `sector2-boot-mid-orbit-day-dry.png` | `09-boot-mid.png` |
| Boot toe | `sector2-boot-toe-orbit-day-dry.png` | `10-boot-toe.png` |
| Boot camp | `sector2-camp-boot-orbit-day-dry.png` | `11-camp-boot.png` |

### Sector 3 (s ≈ 0.66–1.00)

| Frame | Filename | Agent capture |
|-------|----------|---------------|
| Climb out | `sector3-climb-orbit-day-dry.png` | `12-climb-out.png` |
| Anvil | `sector3-anvil-orbit-day-dry.png` | `13-anvil.png` |
| Pit terrace | `sector3-pit-terrace-orbit-day-dry.png` | `14-pit-terrace.png` |
| Timing tower | `sector3-timing-tower-orbit-day-dry.png` | *planned* |
| Main gate | `sector3-main-gate-orbit-day-dry.png` | *planned* |

**Picker (committed asset):** `assets/stills/watkins_glen.webp`

---

## Panel grids — Phase B (weather / lighting) — deferred

Re-capture after rebasing on shared shot tooling. **Anchors:** pit terrace (0.975), Esses drive (0.245), Boot mid (0.52), Anvil (0.90).

| Condition | Pit terrace | Esses | Boot | Anvil |
|-----------|-------------|-------|------|-------|
| Dusk, dry | `landmark-pit-terrace-orbit-dusk-dry.png` | `landmark-esses-drive-dusk-dry.png` | `landmark-boot-mid-orbit-dusk-dry.png` | `landmark-anvil-orbit-dusk-dry.png` |
| Night, dry | `…-night-dry.png` | … | … | … |
| Day, wet | `…-day-wet.png` | … | … | … |
| Day, rain | `…-day-rain.png` | … | … | … |

Optional add-ons (stay within 36 total): day overcast + day fog on **one** anchor each if time permits.

### Weather / lighting backlog (survey only — no fixes this PR)

| Issue | Evidence / cause | Fix lane |
|-------|------------------|----------|
| **Night pit / straight dark** | `lamp: "none"` + no hand `lampPost` on Glen | Def `furniture.lamp` or selective `lampPost` in scenery — needs lighting-tuner pass |
| **Rain on autumn foliage** | Wet presets + particle rain; foliage MAT unchanged | Compare wet/rain shots after phase B; tune `pal` / wetness exposure if trunks blow out |
| **Fog / overcast flat fall colour** | Atmospheric presets mute sun | Phase B shots; may need per-circuit preset pin in `presets.js` (shared) |
| **Dusk golden hour vs brief** | `watkins_glen\|dusk\|dry` pins sunElev −5 | Validate against phase B dusk frames |
| **Z-fighting** | VM coplanar 0 at day dry | Re-check under rain/night after B (no overhead soffit debt on this circuit) |

---

## Findings (day, dry)

**Strengths:** Fall colour in Esses/Boot; pit complex readable; blue double Armco; no road fold / float / clip in audits.

**Visual issues:** Generic tree row on Esses outside (`05`); busy sponsor hoarding silhouette (`14`); Seneca lake backdrop not track-visible (expected); orbit cameras clip foreground pines (camera dist, not props).

**Performance:** ~680k prop verts CI class; 77 model pack ids; first soft-present ~30–35 s SwiftShader; 254 suppressed trees at exclusions.

## Fix applied (circuit-only)

| Change | File |
|--------|------|
| OB `broadcastCompound` gap 110 → **125 m** | `js/circuits/scenery/watkins_glen.js` |

Ground-audit buried one van skirt 0.10 m; now **0** buried (still within existing baseline cap **1** — baseline file untouched per fleet policy).

## Ranked improvements (not done)

| P | Item | Notes |
|---|------|-------|
| 1 | Esses generic tree bleed | Widen `dressingExclusions` or thin `every(20)` in 0.20–0.35 |
| 2 | `api.bleacher` migration | Fleet duplication; watch props-tris |
| 3 | Pit hoarding silhouette | Dist / height tune at start seam |
| 4 | Phase B weather capture | After shared shot PR |
| 5 | Night lamps | Def + scenery policy |

## Verification

```sh
node tools/track/verify-track.cjs watkins_glen
node tools/track/audit-circuit.cjs watkins_glen
```

Phase B: `node tools/shot/shot.mjs --batch artifacts/shots/tracks/watkins_glen/survey-jobs.json --wait 35` (after shared tooling merge).
