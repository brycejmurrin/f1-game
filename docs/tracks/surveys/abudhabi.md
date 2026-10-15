# Abu Dhabi (Yas Marina) — circuit survey

**Date:** 2026-10-14  
**Circuit id:** `abudhabi`  
**Live:** https://brycejmurrin.github.io/f1-game/  
**Branch:** `cursor/abudhabi-survey-149e`

## Code map

| Layer | Path | Role |
|--------|------|------|
| Circuit def | `js/circuits/abudhabi.js` | OSM centreline (`path.len` 5299 m), `night: true`, `theme: "desert"`, `sceneryStartFrac: 0.075`, pale sand palette, `bankZones` (T9 ~0.58), `elevations` (~9 m), `dressingExclusions`, FIA `sectors` / `turns` |
| Scenery | `js/circuits/scenery/abudhabi.js` | Lazy `scenery(api)` — Yas dressing, required landmarks, marina/hotel heroes |
| Registry | `tools/manifest.cjs` | `abudhabi` in `Tracks.LIST` (picker order) |
| Brief | `docs/tracks/abudhabi.md` | Theme, palette, landmarks by lap `s` |
| Landmarks | `tests/data/landmarks/abudhabi.json` | Required `modelGroup` ids |
| Foundation | `tests/specs/abudhabi-foundation.spec.js` | Elevation, hotel arches, water, models |

### Theme and models

- **Setting:** Night GP (`def.night`); palette tuned for pale sand runoff and dusk sky in `pal`.
- **Scenery theme:** `desert` resolved via `SceneryThemes` (night-event window tints when built at night).
- **Required heroes:** `abudhabi-ferrari-world`, `abudhabi-marina`, `abudhabi:pit-exit-tunnel-portal`, `yas-hotel-left-tower`, `yas-hotel-right-tower`, `yas-hotel-gridshell`, seven `yas-hotel-gridshell-arch-*`, bridge spans + piers.
- **Weather / TOD in game:** `__apex.race(id, timeOfDay, weather)` — TOD `dawn|day|dusk|night`; weather `dry|wet|rain|overcast|fog|storm` (`js/race/weather-arc.js`, `js/agent/apex.js`).

## Survey method

| Step | Command / source |
|------|------------------|
| Build | `node tools/track/verify-track.cjs abudhabi` |
| Audits | `node tools/track/audit-circuit.cjs abudhabi --json` |
| Clip detail | `node tools/track/clip-audit.cjs abudhabi --why` |
| Contracts | `npm test -- tests/specs/abudhabi-foundation.spec.js` |
| Visual | **36** JPEGs in `artifacts/shots/tracks/abudhabi/` (`git add -f`; max 1280×, q≈80, &lt;300 KB) |
| Capture tool | `node tools/shot/shot.mjs --batch scratch/abudhabi-wx-batch.json --jpeg --present-timeout 90 --capture-retries 4 --wait 120` (SwiftShader; dry sector frames from earlier batch) |

## Committed screenshots (36 frames)

Panel captions: **view · weather · time of day** (camera noted when not orbit).

### Track select (night, dry)

| track select (still) · dry · night |
| :---: |
| ![track-select_still_night_dry.jpg](../../../artifacts/shots/tracks/abudhabi/track-select_still_night_dry.jpg) |

### Sector lap — night, dry

| S1 ferrari · dry · night | S1 pit · dry · night | S2 marina · dry · night |
| :---: | :---: | :---: |
| ![s1-ferrari_orbit_night_dry.jpg](../../../artifacts/shots/tracks/abudhabi/s1-ferrari_orbit_night_dry.jpg) | ![s1-pit_orbit_night_dry.jpg](../../../artifacts/shots/tracks/abudhabi/s1-pit_orbit_night_dry.jpg) | ![s2-marina_orbit_night_dry.jpg](../../../artifacts/shots/tracks/abudhabi/s2-marina_orbit_night_dry.jpg) |

| S2 turn9 · dry · night | S3 final · dry · night |
| :---: | :---: |
| ![s2-turn9_orbit_night_dry.jpg](../../../artifacts/shots/tracks/abudhabi/s2-turn9_orbit_night_dry.jpg) | ![s3-final_orbit_night_dry.jpg](../../../artifacts/shots/tracks/abudhabi/s3-final_orbit_night_dry.jpg) |

### Key views — dusk, dry

| S1 ferrari · dry · dusk | S1 pit · dry · dusk | S2 marina · dry · dusk |
| :---: | :---: | :---: |
| ![s1-ferrari_orbit_dusk_dry.jpg](../../../artifacts/shots/tracks/abudhabi/s1-ferrari_orbit_dusk_dry.jpg) | ![s1-pit_orbit_dusk_dry.jpg](../../../artifacts/shots/tracks/abudhabi/s1-pit_orbit_dusk_dry.jpg) | ![s2-marina_orbit_dusk_dry.jpg](../../../artifacts/shots/tracks/abudhabi/s2-marina_orbit_dusk_dry.jpg) |

| S2 turn9 · dry · dusk | S3 hotel (trackside) · dry · dusk |
| :---: | :---: |
| ![s2-turn9_orbit_dusk_dry.jpg](../../../artifacts/shots/tracks/abudhabi/s2-turn9_orbit_dusk_dry.jpg) | ![s3-hotel_trackside_dusk_dry.jpg](../../../artifacts/shots/tracks/abudhabi/s3-hotel_trackside_dusk_dry.jpg) |

### Hero — Pit straight (weather / TOD)

| Pit straight · fog · day | Pit straight · overcast · day | Pit straight · rain · day |
| :---: | :---: | :---: |
| ![hero-pit_orbit_day_fog.jpg](../../../artifacts/shots/tracks/abudhabi/hero-pit_orbit_day_fog.jpg) | ![hero-pit_orbit_day_overcast.jpg](../../../artifacts/shots/tracks/abudhabi/hero-pit_orbit_day_overcast.jpg) | ![hero-pit_orbit_day_rain.jpg](../../../artifacts/shots/tracks/abudhabi/hero-pit_orbit_day_rain.jpg) |

| Pit straight · wet · day | Pit straight · storm · dusk |
| :---: | :---: |
| ![hero-pit_orbit_day_wet.jpg](../../../artifacts/shots/tracks/abudhabi/hero-pit_orbit_day_wet.jpg) | ![hero-pit_orbit_dusk_storm.jpg](../../../artifacts/shots/tracks/abudhabi/hero-pit_orbit_dusk_storm.jpg) |

### Hero — Ferrari World (weather / TOD)

| Ferrari World · fog · day | Ferrari World · overcast · day | Ferrari World · rain · day |
| :---: | :---: | :---: |
| ![hero-ferrari_orbit_day_fog.jpg](../../../artifacts/shots/tracks/abudhabi/hero-ferrari_orbit_day_fog.jpg) | ![hero-ferrari_orbit_day_overcast.jpg](../../../artifacts/shots/tracks/abudhabi/hero-ferrari_orbit_day_overcast.jpg) | ![hero-ferrari_orbit_day_rain.jpg](../../../artifacts/shots/tracks/abudhabi/hero-ferrari_orbit_day_rain.jpg) |

| Ferrari World · wet · day | Ferrari World · storm · night |
| :---: | :---: |
| ![hero-ferrari_orbit_day_wet.jpg](../../../artifacts/shots/tracks/abudhabi/hero-ferrari_orbit_day_wet.jpg) | ![hero-ferrari_orbit_night_storm.jpg](../../../artifacts/shots/tracks/abudhabi/hero-ferrari_orbit_night_storm.jpg) |

### Hero — Marina (weather / TOD)

| Marina · storm · dawn | Marina · fog · day | Marina · overcast · day |
| :---: | :---: | :---: |
| ![hero-marina_orbit_dawn_storm.jpg](../../../artifacts/shots/tracks/abudhabi/hero-marina_orbit_dawn_storm.jpg) | ![hero-marina_orbit_day_fog.jpg](../../../artifacts/shots/tracks/abudhabi/hero-marina_orbit_day_fog.jpg) | ![hero-marina_orbit_day_overcast.jpg](../../../artifacts/shots/tracks/abudhabi/hero-marina_orbit_day_overcast.jpg) |

| Marina · rain · day | Marina · wet · day |
| :---: | :---: |
| ![hero-marina_orbit_day_rain.jpg](../../../artifacts/shots/tracks/abudhabi/hero-marina_orbit_day_rain.jpg) | ![hero-marina_orbit_day_wet.jpg](../../../artifacts/shots/tracks/abudhabi/hero-marina_orbit_day_wet.jpg) |

### Hero — Yas hotel trackside (weather / TOD)

| Yas hotel (trackside) · fog · day | Yas hotel (trackside) · overcast · day | Yas hotel (trackside) · rain · day |
| :---: | :---: | :---: |
| ![hero-hotel_trackside_day_fog.jpg](../../../artifacts/shots/tracks/abudhabi/hero-hotel_trackside_day_fog.jpg) | ![hero-hotel_trackside_day_overcast.jpg](../../../artifacts/shots/tracks/abudhabi/hero-hotel_trackside_day_overcast.jpg) | ![hero-hotel_trackside_day_rain.jpg](../../../artifacts/shots/tracks/abudhabi/hero-hotel_trackside_day_rain.jpg) |

| Yas hotel (trackside) · wet · day | Yas hotel (trackside) · storm · night |
| :---: | :---: |
| ![hero-hotel_trackside_day_wet.jpg](../../../artifacts/shots/tracks/abudhabi/hero-hotel_trackside_day_wet.jpg) | ![hero-hotel_trackside_night_storm.jpg](../../../artifacts/shots/tracks/abudhabi/hero-hotel_trackside_night_storm.jpg) |

### Hero — Turn 9 (weather / TOD)

| Turn 9 (cinematic) · wet · day | Turn 9 (cinematic) · storm · dusk | Turn 9 · fog · day |
| :---: | :---: | :---: |
| ![hero-turn9_cinematic_day_wet.jpg](../../../artifacts/shots/tracks/abudhabi/hero-turn9_cinematic_day_wet.jpg) | ![hero-turn9_cinematic_dusk_storm.jpg](../../../artifacts/shots/tracks/abudhabi/hero-turn9_cinematic_dusk_storm.jpg) | ![hero-turn9_orbit_day_fog.jpg](../../../artifacts/shots/tracks/abudhabi/hero-turn9_orbit_day_fog.jpg) |

| Turn 9 · overcast · day | Turn 9 · rain · day |
| :---: | :---: |
| ![hero-turn9_orbit_day_overcast.jpg](../../../artifacts/shots/tracks/abudhabi/hero-turn9_orbit_day_overcast.jpg) | ![hero-turn9_orbit_day_rain.jpg](../../../artifacts/shots/tracks/abudhabi/hero-turn9_orbit_day_rain.jpg) |

Total: 36 frames


### Weather / lighting backlog (review captures)

| Issue | Where to check | Risk |
|-------|----------------|------|
| Night flood pools vs emissive windows | Pit straight, back straight (`floodMast` + pool discs) | Watch for blown highlights in `day/dry` |
| Marina dark water + rain particles | `s≈0.55–0.62` | Rain on `waterBand` — reflection streaks may z-fight |
| Fog density vs desert `pal.fogDensity` | Whole lap | Fog may read brown/warm; compare sky gradient to brief |
| Overcast flatness on LED hotel | `s≈0.885` | Gridshell emissive may need relative boost (scenery-only tune later) |
| Wet road grip visuals only | T9 bank | Should not change physics; check shader wetness on pale runoff |

## Findings

### Strengths

- Yas identity at night: LED fascia cycle, pale runoff, marina basin, Ferrari World + hotel heroes read in captures.
- **0** surface folds; elevation contract ~9 m (`abudhabi-foundation` day/night).
- Float/ground audits clean (0 unsupported / 0 buried on heroes).
- Hero weather matrix covers wet, rain, overcast, fog, storm plus dawn/dusk/night on five landmarks.

### Issues

| Sev | Topic | Evidence | Notes |
|-----|--------|----------|--------|
| Med | Hotel framing | S10 vs S11 | Orbit at `s≈0.88` is straight-heavy; chase / trackside better for gridshell |
| Med | Marina visual noise | S7 | Many pool discs + masts; perf OK but busy |
| Low | Clip (at baseline) | `clip-audit` | 1 severe @ ~0.147 (`modelGroup` × `motorhome`); 1 minor @ ~0.801 (Marsa bleacher `crowdBand`) — severe count unchanged vs baseline |
| Low | Guard drops | `verify-track` | `backdrop=9`, `tree=33`, `palm=1`, `building=1` |

### Fixes in this PR (scenery only)

- Ferrari World anchor `gap` 118 (was 100) — reduces overlap pressure near T1 backdrop slot.
- Backdrop at scenery `s=0.14` pushed to `dist` 145+.
- Marsa bleacher seated `gap` 20, fewer/dimmer crowd bands (`step` 22, `density` 0.32).
- Paddock motorhomes: 8 units, `gap` 42, slightly tighter spacing along pit.

## Ranked improvements

1. Hotel survey camera in `track-stills` / shot preset at `s≈0.885` trackside (engine-adjacent, not scenery).
2. Trim redundant pool discs on back straight if perf budget tightens (keep `floodMast` registrations).
3. Investigate severe clip @ 0.147 without widening clip baseline (likely paddock / hero interaction).

## Verification

```text
node tools/track/verify-track.cjs abudhabi          → OK
node tools/track/audit-circuit.cjs abudhabi --json  → ok (clip severe 1 @ baseline)
npm test -- tests/specs/abudhabi-foundation.spec.js   → 2/2 passed
```
