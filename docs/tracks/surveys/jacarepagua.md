# Jacarepaguá (`jacarepagua`) — circuit survey (2026-10-14)

Autódromo Internacional Nelson Piquet (1978–89 Brazilian GP, demolished 2012). Visual brief: `docs/tracks/jacarepagua.md`. Implementation map, capture evidence, and backlog.

**Capture status:** **31** JPEG survey frames committed under `artifacts/shots/tracks/jacarepagua/` (1280px max width, q≈80). Dusk / dawn / night panels still pending a follow-up batch after shared shot tooling.

**Weather in game:** `__apex.weather()` — `dry`, `wet`, `rain`, `overcast`, `fog`, `storm` (`js/race/weather-arc.js`). Time of day via `setTimeOfDay` — `day`, `dusk`, `dawn`, `night`.

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

Paths: `../../../artifacts/shots/tracks/jacarepagua/<file>.jpg`

### Sector 1 (start / T1 — s ≈ 0–0.39)

| Pit orbit · dry · day | Pit chase · dry · day | Flag rank orbit · dry · day |
|:---:|:---:|:---:|
| ![Pit orbit](../../../artifacts/shots/tracks/jacarepagua/s1-pit-orbit.jpg) | ![Pit chase](../../../artifacts/shots/tracks/jacarepagua/s1-pit-chase.jpg) | ![Flags](../../../artifacts/shots/tracks/jacarepagua/s1-flags-orbit.jpg) |

| T1 orbit · dry · day | T1 trackside · dry · day | *(dusk/night pit — pending)* |
|:---:|:---:|:---:|
| ![T1 orbit](../../../artifacts/shots/tracks/jacarepagua/s1-t1-orbit.jpg) | ![T1 trackside](../../../artifacts/shots/tracks/jacarepagua/s1-t1-trackside.jpg) | — |

### Sector 2 (lagoon / infield — s ≈ 0.39–0.68)

| Lagoon orbit · dry · day | Lagoon shore eye · dry · day | Infield chase · dry · day |
|:---:|:---:|:---:|
| ![Lagoon](../../../artifacts/shots/tracks/jacarepagua/s2-lagoon-orbit.jpg) | ![Shore](../../../artifacts/shots/tracks/jacarepagua/s2-lagoon-shore-eye.jpg) | ![Infield](../../../artifacts/shots/tracks/jacarepagua/s2-infield-chase.jpg) |

| T3 chase · dry · day | Morro housing orbit · dry · day | Lap overview orbit · dry · day |
|:---:|:---:|:---:|
| ![T3](../../../artifacts/shots/tracks/jacarepagua/s2-t3-chase.jpg) | ![Morro](../../../artifacts/shots/tracks/jacarepagua/s2-morro-orbit.jpg) | ![Overview](../../../artifacts/shots/tracks/jacarepagua/lap-overview.jpg) |

### Sector 3 (back straight / late lap — s ≈ 0.68–1.0)

| T9 orbit · dry · day | Back straight chase · dry · day | Final trackside · dry · day |
|:---:|:---:|:---:|
| ![T9](../../../artifacts/shots/tracks/jacarepagua/s3-t9-orbit.jpg) | ![Back straight](../../../artifacts/shots/tracks/jacarepagua/s3-backstraight-chase.jpg) | ![Final](../../../artifacts/shots/tracks/jacarepagua/s3-final-trackside.jpg) |

| Paddock orbit · dry · day | *(night pit stand — pending)* | *(final rain close-up — pending)* |
|:---:|:---:|:---:|
| ![Paddock](../../../artifacts/shots/tracks/jacarepagua/s3-paddock-orbit.jpg) | — | — |

## Panel grids — weather variants (`day` TOD)

### Pit straight orbit anchor

| dry · day | wet · day | rain · day |
|:---:|:---:|:---:|
| ![pit dry](../../../artifacts/shots/tracks/jacarepagua/s1-pit-orbit.jpg) | ![pit wet](../../../artifacts/shots/tracks/jacarepagua/s1-pit-orbit_day_wet.jpg) | ![pit rain](../../../artifacts/shots/tracks/jacarepagua/s1-pit-orbit_day_rain.jpg) |

| overcast · day | fog · day | *(night — pending)* |
|:---:|:---:|:---:|
| ![pit overcast](../../../artifacts/shots/tracks/jacarepagua/s1-pit-orbit_day_overcast.jpg) | ![pit fog](../../../artifacts/shots/tracks/jacarepagua/s1-pit-orbit_day_fog.jpg) | — |

### Turn 1 orbit anchor

| dry · day | wet · day | rain · day |
|:---:|:---:|:---:|
| ![t1 dry](../../../artifacts/shots/tracks/jacarepagua/s1-t1-orbit.jpg) | ![t1 wet](../../../artifacts/shots/tracks/jacarepagua/s1-t1-orbit_day_wet.jpg) | ![t1 rain](../../../artifacts/shots/tracks/jacarepagua/s1-t1-orbit_day_rain.jpg) |

| overcast · day | *(fog — pending)* | — |
|:---:|:---:|:---:|
| ![t1 overcast](../../../artifacts/shots/tracks/jacarepagua/s1-t1-orbit_day_overcast.jpg) | — | — |

### Lagoon orbit anchor

| dry · day | wet · day | rain · day |
|:---:|:---:|:---:|
| ![lagoon dry](../../../artifacts/shots/tracks/jacarepagua/s2-lagoon-orbit.jpg) | ![lagoon wet](../../../artifacts/shots/tracks/jacarepagua/s2-lagoon-orbit_day_wet.jpg) | ![lagoon rain](../../../artifacts/shots/tracks/jacarepagua/s2-lagoon-orbit_day_rain.jpg) |

| overcast · day | *(fog / night+rain — pending)* | — |
|:---:|:---:|:---:|
| ![lagoon overcast](../../../artifacts/shots/tracks/jacarepagua/s2-lagoon-orbit_day_overcast.jpg) | — | — |

### Back straight chase anchor

| dry · day | wet · day | rain · day |
|:---:|:---:|:---:|
| ![back dry](../../../artifacts/shots/tracks/jacarepagua/s3-backstraight-chase.jpg) | ![back wet](../../../artifacts/shots/tracks/jacarepagua/s3-backstraight-chase_day_wet.jpg) | ![back rain](../../../artifacts/shots/tracks/jacarepagua/s3-backstraight-chase_day_rain.jpg) |

| overcast · day | *(fog — pending)* | — |
|:---:|:---:|:---:|
| ![back overcast](../../../artifacts/shots/tracks/jacarepagua/s3-backstraight-chase_day_overcast.jpg) | — | — |

### Lap overview orbit anchor

| dry · day | wet · day | rain · day |
|:---:|:---:|:---:|
| ![overview dry](../../../artifacts/shots/tracks/jacarepagua/lap-overview.jpg) | ![overview wet](../../../artifacts/shots/tracks/jacarepagua/lap-overview_day_wet.jpg) | ![overview rain](../../../artifacts/shots/tracks/jacarepagua/lap-overview_day_rain.jpg) |

| overcast · day | *(fog / dusk — pending)* | — |
|:---:|:---:|:---:|
| ![overview overcast](../../../artifacts/shots/tracks/jacarepagua/lap-overview_day_overcast.jpg) | — | — |

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
| Med | **Night track lighting** | `floodMast(..., { light: false })`; `def.night: false` | Night panels + optional `light: true` on pit masts |
| Med | **Broadcast compound** | Was `rejBox`-suppressed at `K(0.908), gap 78` | **Fixed:** `K(0.898), gap 96` |
| Low | Morro speckle at distance | `s2-morro-orbit` / overview | Art pass — fewer clusters or darker skins |
| Low | Wet road vs lagoon | Rain panels | Wet sheen on tarmac vs lagoon albedo |
| Low | Overcast haze | Overcast panels | Compare to `jacarepagua\|day\|overcast` preset |
| Low | Motorhome clip | clip baseline at paddock RV row | Fleet `structures.js`; jacarepagua excludes RVs `s≈0.90–0.97` |

### Strengths

Lagoon + palms read clearly; T1/T9 sand and terraces match brief; landmarks build; no float/coplanar regression.

## Fixes in this PR (circuit-only)

1. `broadcastCompound` moved to `K(0.898), gap 96, spacing 5.2` so it is not `rejBox`-dropped against paddock geometry.
2. Motorhomes skipped for `s ∈ (0.89, 0.97)` to reduce stacking on paddock `modelGroup`s (clip baseline unchanged — internal motorhome pairs).

## Ranked follow-ups

1. Dusk / dawn / night panels (~6 frames) after shared shot batch tooling.
2. Night flood masts if night panels confirm dark pit straight.
3. Back-straight GA terraces (brief §5) within tris budget.
4. Morro housing LOD/silhouette from `s2-morro-orbit`.

## Verification

```sh
node tools/track/verify-track.cjs jacarepagua
node tools/track/audit-circuit.cjs jacarepagua
```
