# Jacarepaguá (`jacarepagua`) — circuit survey (2026-10-14)

Autódromo Internacional Nelson Piquet (1978–89 Brazilian GP, demolished 2012). Visual brief: `docs/tracks/jacarepagua.md`. Implementation map, capture evidence, and backlog.

**Capture status:** 30 JPEG frames on disk at `artifacts/shots/tracks/jacarepagua/` (local agent run; **not committed** until shared PR `tools: shared shot tooling for circuit surveys` adds `!artifacts/shots/**` and batch `weather`/`tod`). **Follow-up:** rebase, re-run capped batch (30–36 frames), commit shots, add dusk/night/fog panels.

**Weather in game (for follow-up batch):** `__apex.weather()` accepts `dry`, `wet`, `rain`, `overcast`, `fog`, `storm` (`js/race/weather-arc.js`). `shot.mjs` batch will accept per-job `weather` + `tod` (`day`|`dusk`|`dawn`|`night`) after shared tooling lands.

## Code map

| Layer | Path | Role |
|--------|------|------|
| Track def | `js/circuits/jacarepagua.js` | OSM centreline (`path.len` 4967 m), `startFrac: 0`, `reverse: false`, `theme: modern`, `terrainOuter: 120`, `dressingExclusions` (`foliage`, `city`), palette, `bankZones`, 11 `turns`, sectors `[0.394, 0.679]` |
| Scenery | `js/circuits/scenery/jacarepagua.js` | Lagoon, morro housing, landmarks, pit/paddock, terraces, `floodMast` (`light: false`) |
| Landmarks | `tests/data/landmarks/jacarepagua.json` | 12 required `modelGroup` ids |
| Lighting | `js/lighting/presets.js` | Per `jacarepagua\|tod\|weather` overrides (incl. night/dusk/fog) |

Frac helpers use authored `K(s)` (`sceneryCoordinates: "racing"`).

## Theme and models

Tropical coastal day palette; lagoon waterField; Pedra Branca + Tijuca ridge; JAC-M3 low scrub + lagoon palms; pit grandstand, bleacher, paddock tents, skiffs, shore reeds (see brief §4).

## Panel grids — dry midday (`day` / `dry`)

Shot files live under `artifacts/shots/tracks/jacarepagua/` (gitignored until shared tooling PR). Tables list filenames only until the shared tooling PR commits JPEGs; then replace cells with markdown image embeds.

### Sector 1 (start / T1 — s ≈ 0–0.39)

| Pit orbit | Pit chase | Flag rank |
|:---:|:---:|:---:|
| `s1-pit-orbit.jpg` | `s1-pit-chase.jpg` | `s1-flags-orbit.jpg` |

| T1 orbit | T1 trackside | *(reserved)* |
|:---:|:---:|:---:|
| `s1-t1-orbit.jpg` | `s1-t1-trackside.jpg` | *dusk/night pit — pending shared shot batch* |

### Sector 2 (lagoon / infield — s ≈ 0.39–0.68)

| Lagoon orbit | Lagoon shore eye | Infield chase |
|:---:|:---:|:---:|
| `s2-lagoon-orbit.jpg` | `s2-lagoon-shore-eye.jpg` | `s2-infield-chase.jpg` |

| T3 chase | Morro housing orbit | Lap overview |
|:---:|:---:|:---:|
| `s2-t3-chase.jpg` | `s2-morro-orbit.jpg` | `lap-overview.jpg` |

### Sector 3 (back straight / late lap — s ≈ 0.68–1.0)

| T9 orbit | Back straight chase | Final trackside |
|:---:|:---:|:---:|
| `s3-t9-orbit.jpg` | `s3-backstraight-chase.jpg` | `s3-final-trackside.jpg` |

| Paddock orbit | *(pending)* | *(pending)* |
|:---:|:---:|:---:|
| `s3-paddock-orbit.jpg` | *pit stand night* | *final rain close-up* |

## Panel grids — weather variants (day TOD, five anchor views)

Captured locally with experimental batch `weather` (re-validate after shared tooling rebase). **Missing:** `fog` on anchors, all `dusk`/`dawn`/`night` panels.

### Pit straight (`s1-pit-orbit`)

| dry | wet | rain |
|:---:|:---:|:---:|
| `s1-pit-orbit.jpg` | `s1-pit-orbit_day_wet.jpg` | `s1-pit-orbit_day_rain.jpg` |

| overcast | fog *(pending)* | night *(pending)* |
|:---:|:---:|:---:|
| `s1-pit-orbit_day_overcast.jpg` | *shared batch* | *shared batch* |

### Turn 1 (`s1-t1-orbit`)

| dry | wet | rain |
|:---:|:---:|:---:|
| `s1-t1-orbit.jpg` | `s1-t1-orbit_day_wet.jpg` | `s1-t1-orbit_day_rain.jpg` |

| overcast | fog *(pending)* | — |
|:---:|:---:|:---:|
| `s1-t1-orbit_day_overcast.jpg` | *shared batch* | |

### Lagoon (`s2-lagoon-orbit`)

| dry | wet | rain |
|:---:|:---:|:---:|
| `s2-lagoon-orbit.jpg` | `s2-lagoon-orbit_day_wet.jpg` | `s2-lagoon-orbit_day_rain.jpg` |

| overcast | fog *(pending)* | night+rain *(pending)* |
|:---:|:---:|:---:|
| `s2-lagoon-orbit_day_overcast.jpg` | *shared batch* | *shared batch* |

### Back straight (`s3-backstraight-chase`)

| dry | wet | rain |
|:---:|:---:|:---:|
| `s3-backstraight-chase.jpg` | `s3-backstraight-chase_day_wet.jpg` | `s3-backstraight-chase_day_rain.jpg` |

| overcast | fog *(pending)* | — |
|:---:|:---:|:---:|
| `s3-backstraight-chase_day_overcast.jpg` | *shared batch* | |

### Lap overview (`lap-overview`)

| dry | wet | rain |
|:---:|:---:|:---:|
| `lap-overview.jpg` | `lap-overview_day_wet.jpg` | `lap-overview_day_rain.jpg` |

| overcast | fog *(pending)* | dusk *(pending)* |
|:---:|:---:|:---:|
| `lap-overview_day_overcast.jpg` | *shared batch* | *shared batch* |

## Findings

### Audits (post-fix tree)

| Check | Result |
|--------|--------|
| `verify-track` | OK — 0 surface folds; `suppressed 3` (kit guards) |
| float | 0 floating |
| clip | 3 severe @ 0.909–0.911 (`motorhome` internals, at baseline) |
| coplanar | 0 |
| ground | buried **1** × 0.04 m @ `floodMast` line 504 (within baseline) |

### Visual / weather-lighting backlog

| Sev | Issue | Evidence | Action |
|-----|--------|----------|--------|
| Med | **Night track lighting** | `floodMast(..., { light: false })`; `def.night: false` | After night panels: consider `light: true` on pit-straight masts only (circuit-scoped); verify lamp cap |
| Med | **Broadcast compound** | Was `rejBox`-suppressed at `K(0.908), gap 78` | **Fixed:** `K(0.898), gap 96` |
| Low | Morro speckle at distance | `s2-morro-orbit` / overview | Art pass — fewer clusters or darker skins |
| Low | Wet road vs lagoon | Rain panels — confirm wet sheen on tarmac not fighting water albedo | Re-check after committed weather batch |
| Low | Overcast haze | Overcast panels vs preset `fogDensityMul` | Compare to `jacarepagua\|day\|overcast` preset after rebase |
| Low | Motorhome clip | clip baseline at paddock RV row | Fleet `structures.js`; jacarepagua excludes RVs `s≈0.90–0.97` |
| Info | Shots not in git | `artifacts/` gitignored | Commit after shared tooling PR |

### Strengths

Lagoon + palms read clearly; T1/T9 sand and terraces match brief; landmarks build; no float/coplanar regression.

## Fixes in this PR (circuit-only)

1. `broadcastCompound` moved to `K(0.898), gap 96, spacing 5.2` so it is not `rejBox`-dropped against paddock geometry.
2. Motorhomes skipped for `s ∈ (0.89, 0.97)` to reduce stacking on paddock `modelGroup`s (clip baseline unchanged — internal motorhome pairs).

## Ranked follow-ups

1. Rebase on shared shot PR → commit 30–36 JPEGs + finish fog / dusk / night panels (6 frames).
2. Night flood masts if panels confirm dark pit straight.
3. Back-straight GA terraces (brief §5) within tris budget.
4. Morro housing LOD/silhouette from `s2-morro-orbit`.

## Verification

```sh
node tools/track/verify-track.cjs jacarepagua
node tools/track/audit-circuit.cjs jacarepagua
```
