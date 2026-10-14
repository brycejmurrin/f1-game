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
| Visual (this pass) | 12× headless TLX night orbit/park (`node tools/shot/shot.mjs --batch`, session artifacts) |
| Picker still | `assets/stills/abudhabi.webp` |

### Capture status (course correction 2026-10-14)

- **Committed shots:** Not in this PR — `artifacts/` is gitignored until the shared tooling PR adds `artifacts/shots/tracks/**`.
- **Captured this session (night / dry only):** 12 PNGs under session storage (paths below); PR body embeds them for review.
- **Planned 32-frame pass (after shared `tools: shared shot tooling for circuit surveys` lands):** 12 sector anchors (night dry) + 20 weather/lighting variants on **5 hero views** only (`s≈0.02` pit, `0.18` Ferrari World, `0.55` marina, `0.885` Yas Hotel, `0.42` Turn 9) × (`day/dry`, `dusk/dry`, `night/dry`, `day/overcast`, `day/wet`, `day/fog`, plus `day/rain` and `night/wet` on marina + hotel). Game supports all listed wx/TOD; batch capture waits on shared shot weather + retry tooling.

## Screenshots — by sector (night, dry)

Night is the canonical Abu Dhabi GP look. Images are session captures until `artifacts/shots/tracks/abudhabi/` is committable.

| S1 — Start / esses | S1 — Ferrari World | S1 — North hairpin |
|:---:|:---:|:---:|
| ![S1 pit](/opt/cursor/artifacts/abudhabi-survey/01-pit-straight.png) | ![S1 Ferrari](/opt/cursor/artifacts/abudhabi-survey/03-ferrari-world.png) | ![S1 hairpin](/opt/cursor/artifacts/abudhabi-survey/04-north-hairpin.png) |
| `01-pit-straight.png` | `03-ferrari-world.png` | `04-north-hairpin.png` |

| S1 — Turn 1 | S2 — Back straight | S2 — Turn 9 |
|:---:|:---:|:---:|
| ![T1](/opt/cursor/artifacts/abudhabi-survey/02-turn1-esses.png) | ![S2 straight](/opt/cursor/artifacts/abudhabi-survey/05-back-straight.png) | ![T9](/opt/cursor/artifacts/abudhabi-survey/06-turn9-banked.png) |
| `02-turn1-esses.png` | `05-back-straight.png` | `06-turn9-banked.png` |

| S2 — Marina water | S2 — Marina hotel | S3 — Marsa |
|:---:|:---:|:---:|
| ![Marina](/opt/cursor/artifacts/abudhabi-survey/07-marina-water.png) | ![Marina hotel](/opt/cursor/artifacts/abudhabi-survey/08-marina-hotel.png) | ![Marsa](/opt/cursor/artifacts/abudhabi-survey/09-marsa-curve.png) |
| `07-marina-water.png` | `08-marina-hotel.png` | `09-marsa-curve.png` |

| S3 — Yas Hotel approach | S3 — Under hotel (chase) | S3 — Final corners |
|:---:|:---:|:---:|
| ![Hotel orbit](/opt/cursor/artifacts/abudhabi-survey/10-yas-hotel-underpass.png) | ![Hotel chase](/opt/cursor/artifacts/abudhabi-survey/11-hotel-chase.png) | ![Final](/opt/cursor/artifacts/abudhabi-survey/12-final-corners.png) |
| `10-yas-hotel-underpass.png` | `11-hotel-chase.png` | `12-final-corners.png` |

**Track select:** `assets/stills/abudhabi.webp` (hotel gridshell over track).

## Screenshots — by weather / lighting (planned)

| Condition | TOD | Weather | Status |
|-----------|-----|---------|--------|
| Dry midday | `day` | `dry` | Blocked — rebatch after shared shot PR |
| Golden hour | `dusk` | `dry` | Blocked |
| Night GP | `night` | `dry` | **Partial** — sector set above |
| Overcast | `day` | `overcast` | Blocked |
| Wet | `day` | `wet` | Blocked |
| Rain | `day` | `rain` | Blocked |
| Fog / mist | `day` | `fog` | Blocked |

### Weather / lighting backlog (review when matrix ships)

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

1. **After shared shot PR:** Run 32-frame matrix; commit under `artifacts/shots/tracks/abudhabi/`; fill weather tables above.
2. Hotel survey camera in `track-stills` / shot preset at `s≈0.885` trackside (engine-adjacent, not scenery).
3. Trim redundant pool discs on back straight if perf budget tightens (keep `floodMast` registrations).
4. Investigate severe clip @ 0.147 without widening clip baseline (likely paddock / hero interaction).

## Verification

```text
node tools/track/verify-track.cjs abudhabi          → OK
node tools/track/audit-circuit.cjs abudhabi --json  → ok (clip severe 1 @ baseline)
npm test -- tests/specs/abudhabi-foundation.spec.js   → 2/2 passed
```
