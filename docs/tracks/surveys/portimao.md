# Portimão (`portimao`) — circuit survey (2026-10-14)

**Branch:** `cursor/portimao-survey-cd05` · **Base:** `claude/f1-game-project-26h3ng`  
**Live:** https://brycejmurrin.github.io/f1-game/ · **Design brief:** `docs/tracks/portimao.md`

## Code map

| Layer | Path | Role |
|--------|------|------|
| Registry | `js/track/tracks.js` | `Tracks.LIST` / `build()` — def + lazy `TrackScenery[id]` |
| Def | `js/circuits/portimao.js` | OSM `path`, `startFrac: 0`, palette, SRTM elevation ref, `bankZones`, `hwZones`, `dressingExclusions`, `ownPitStraight`, `terrainOuter: 125`, `night: false` |
| Scenery | `js/circuits/scenery/portimao.js` | Terraces, montado cork/olive, paddock A–F, landmarks, kerbs, cut banks |
| Meta | `js/track/circuit-meta.js` | Picker row |
| Elevation | `js/track/circuit-elevations.js` | Baked profile (~24 m range) |
| Lighting presets | `js/lighting/presets.js` | `portimao\|<tod>\|<wx>` for dawn/day/dusk/night × dry/wet/rain/overcast/fog |
| Landmarks | `tests/data/landmarks/portimao.json` | Five required `modelGroup` ids |

**Sectors (racing lap):** `sectors: [0.33, 0.657]` — Sector 1 ≈ start→T5, Sector 2 ≈ mid-lap plunge/moinho/T11, Sector 3 ≈ final complex→line.

## Theme and models

Algarve interior **montado** (cork oak, olive grids), red-earth runoff, lime whitewash paddock, skyline moinho + quinta hamlets, thin stone-pine scatter with `openArea` crest clearance. Hero groups: pit blocks, race control, main tribuna, T1 stands, moinho.

## Capture plan

| Batch | Count | Status |
|--------|------:|--------|
| Sector + landmark tour (`day` / `dry`) | **32** | Committed as `artifacts/shots/tracks/portimao/*.jpg` (JPEG q80, ≤1280 px, ≤300 KB) |
| Weather / TOD variants (5 heroes × ~6 conditions) | **~24** | **Blocked** until rebase on shared PR *tools: shared shot tooling for circuit surveys* (`weather` batch field, retries, `artifacts/shots/tracks/**` gitignore exception) |

**Game weather API (for follow-up):** `__apex.weather("dry"|"wet"|"rain"|"overcast"|"fog")` + `setTimeOfDay("dawn"|"day"|"dusk"|"night")` (`js/game.js` `raceWeather`, `js/lighting/presets.js`).

### Sector 1 — start / T1 / esses / T3 / T5 (s ≈ 0–0.33)

| ![sf paddock](../../../artifacts/shots/tracks/portimao/s1-sf-paddock__day__dry.jpg) | ![main stand](../../../artifacts/shots/tracks/portimao/s1-main-stand__day__dry.jpg) | ![t1 downhill](../../../artifacts/shots/tracks/portimao/s1-t1-downhill__day__dry.jpg) |
| *sf paddock · day · dry* | *main stand · day · dry* | *t1 downhill · day · dry* |
| ![t1 braking](../../../artifacts/shots/tracks/portimao/s1-t1-braking__day__dry.jpg) | ![t1 stands](../../../artifacts/shots/tracks/portimao/s1-t1-stands__day__dry.jpg) | ![amphitheatre](../../../artifacts/shots/tracks/portimao/s1-amphitheatre__day__dry.jpg) |
| *t1 braking · day · dry* | *t1 stands · day · dry* | *amphitheatre · day · dry* |
| ![esses](../../../artifacts/shots/tracks/portimao/s1-esses__day__dry.jpg) | ![t3 crest](../../../artifacts/shots/tracks/portimao/s1-t3-crest__day__dry.jpg) | ![t5 gravel](../../../artifacts/shots/tracks/portimao/s1-t5-gravel__day__dry.jpg) |
| *esses · day · dry* | *t3 crest · day · dry* | *t5 gravel · day · dry* |
| ![t1 kerb](../../../artifacts/shots/tracks/portimao/s1-t1-kerb__day__dry.jpg) | ![t2 complex](../../../artifacts/shots/tracks/portimao/s1-t2-complex__day__dry.jpg) | |
| *t1 kerb · day · dry* | *t2 complex · day · dry* | |

### Sector 2 — moinho / plunge / T11 (s ≈ 0.33–0.66)

| ![quinta north](../../../artifacts/shots/tracks/portimao/s2-quinta-north__day__dry.jpg) | ![cut t3 bank](../../../artifacts/shots/tracks/portimao/s2-cut-t3-bank__day__dry.jpg) | ![moinho](../../../artifacts/shots/tracks/portimao/s2-moinho__day__dry.jpg) |
| *quinta north · day · dry* | *cut t3 bank · day · dry* | *moinho · day · dry* |
| ![mid plunge](../../../artifacts/shots/tracks/portimao/s2-mid-plunge__day__dry.jpg) | ![mid trackside](../../../artifacts/shots/tracks/portimao/s2-mid-trackside__day__dry.jpg) | ![chicane](../../../artifacts/shots/tracks/portimao/s2-chicane__day__dry.jpg) |
| *mid plunge · day · dry* | *mid trackside · day · dry* | *chicane · day · dry* |
| ![mid crest](../../../artifacts/shots/tracks/portimao/s2-mid-crest__day__dry.jpg) | ![t10 approach](../../../artifacts/shots/tracks/portimao/s2-t10-approach__day__dry.jpg) | ![t11](../../../artifacts/shots/tracks/portimao/s2-t11__day__dry.jpg) |
| *mid crest · day · dry* | *t10 approach · day · dry* | *t11 · day · dry* |
| ![terrace left](../../../artifacts/shots/tracks/portimao/s2-terrace-left__day__dry.jpg) | ![quinta south](../../../artifacts/shots/tracks/portimao/s2-quinta-south__day__dry.jpg) | ![late sector](../../../artifacts/shots/tracks/portimao/s2-late-sector__day__dry.jpg) |
| *terrace left · day · dry* | *quinta south · day · dry* | *late sector · day · dry* |

### Sector 3 — final / paddock (s ≈ 0.66–1.0)

| ![penultimate](../../../artifacts/shots/tracks/portimao/s3-penultimate__day__dry.jpg) | ![final](../../../artifacts/shots/tracks/portimao/s3-final__day__dry.jpg) | ![crest boards](../../../artifacts/shots/tracks/portimao/s3-crest-boards__day__dry.jpg) |
| *penultimate · day · dry* | *final · day · dry* | *crest boards · day · dry* |
| ![camera tower](../../../artifacts/shots/tracks/portimao/s3-camera-tower__day__dry.jpg) | ![paddock blocks](../../../artifacts/shots/tracks/portimao/s3-paddock-blocks__day__dry.jpg) | ![race control](../../../artifacts/shots/tracks/portimao/s3-race-control__day__dry.jpg) |
| *camera tower · day · dry* | *paddock blocks · day · dry* | *race control · day · dry* |
| ![apartments](../../../artifacts/shots/tracks/portimao/s3-apartments__day__dry.jpg) | ![pit gantry](../../../artifacts/shots/tracks/portimao/s3-pit-gantry__day__dry.jpg) | ![overview](../../../artifacts/shots/tracks/portimao/s3-overview__day__dry.jpg) |
| *apartments · day · dry* | *pit gantry · day · dry* | *overview · day · dry* |

### Weather / lighting (planned — not captured on this branch)

Repeat **five** hero views after shared tooling lands:

| Hero | Frac | Planned conditions |
|------|------|-------------------|
| `wx-sf` | 0.0 | dusk/dry, night/dry, day/overcast, day/rain, day/fog, day/wet |
| `wx-t1` | 0.055 | dusk/dry, night/dry, day/rain |
| `wx-t3` | 0.20 | dusk/dry, day/overcast, day/fog |
| `wx-mid` | 0.50 | dusk/dry, night/dry, day/fog, day/rain |
| `wx-final` | 0.90 | dusk/dry, night/dry, day/wet |

| Panel A | Panel B | Panel C |
|---------|---------|---------|
| `wx-sf__*` (pending) | `wx-t1__*` (pending) | `wx-t3__*` (pending) |

## Findings (geometry / scenery)

| Severity | Finding | Evidence |
|----------|---------|----------|
| — | Centreline OK, **0 surface folds** | `verify-track`, audit |
| Low | Min radius 7.16 m @ node 167 | verify summary |
| — | Float / clip / coplanar / ground **0** vs baselines | `audit-circuit` 2026-10-14 |
| Low | 13 trees suppressed by terrace `dressingExclusions` | verify |
| Med | Service-road `groundPatch` slabs read as floating gray foundations (orbit) | survey captures → **fixed** (thinner/darker/more samples) |
| Med | Pit facades read solid green from orbit | capture → **fixed** (thin identity stripes) |
| Low | Terrace step gaps at tight inside radius (T5 chase) | visual only |
| Low | `terrainOuter` hard ring at extreme aerial | engine scope |

## Weather / lighting backlog (survey-only — no circuit fix yet)

| Issue | Notes |
|--------|--------|
| **Night unlit** | `night: false`, `furniture.lamp: "none"` — night presets exist but no floodlight masts; expect dark outfield / unlit paddock unless shared lighting adds lamps |
| **Rain particles** | `raceWeather` rain tier drives streaks in `particles.js`; verify streak density vs Algarve dry brief |
| **Fog vs horizon** | `portimao\|day\|fog` raises fog density — check zenith/horizon match `pal` fogColor |
| **Wet sheen** | `portimao\|day\|wet` only `fogDensityMul` — road wetness may look dry until arc wets track |
| **Z-fighting** | None in node audits; re-check overhead gantries under rain/night after weather batch |

## Fixes applied (this PR)

1. Pit block Algarve fascia → thin stripes (lime body reads from TV/orbit).
2. Service-road patches → thinner, darker asphalt, extra samples on `mid-shelf` / `t11-cut`.

## Ranked follow-ups

| Rank | Item | Risk |
|------|------|------|
| 1 | Weather/TOD batch (5 heroes) after shared shot PR | — |
| 2 | Terrace inside-corner sky slits | Med |
| 3 | Optional floodlight dress if night GP enabled | Med |
| 4 | Motorhome / broadcast row (ground-audit deferred) | Med |

## Verification

```text
node tools/track/verify-track.cjs portimao
= audit-circuit portimao: ok (6 checks)
```

Browser groups deferred until after capture + shared tooling rebase (`test:circuits` interrupted per course correction).
