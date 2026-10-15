# Sochi Autodrom — circuit survey (2026-10-14)

**Scope:** `classic: true` GP layout (2014–21), not the post-2023 short loop.  
**Live:** [Sochi on GitHub Pages](https://brycejmurrin.github.io/f1-game/) (select SOCHI).  
**Shots:** 30 JPEGs in `artifacts/shots/tracks/sochi/` (1280px wide, q≈80); captured via `node tools/shot/shot.mjs --batch` with `tod` only (weather batch deferred).

## Code map

| Piece | Path | Role |
|--------|------|------|
| Circuit def | `js/circuits/sochi.js` | OSM centreline (`path.len` 5839 m), palette, `dressingExclusions`, `bankZones` (Turn 2 5° / 260 m), `hwZones`, `kit` / `cityStyle` |
| Scenery closure | `js/circuits/scenery/sochi.js` | Olympic venues (`modelGroup` + `tests/data/landmarks/sochi.json`), plazas, arc stands, Caucasus ridges, pit complex |
| Registry | `js/track/circuit-meta.js` + `js/roster.js` | `theme: modern`, `terrainOuter: 100` |
| Brief | `docs/tracks/sochi.md` | Landmark table by lap fraction |
| Lighting | `js/lighting/presets.js` | `sochi|day|*` … `sochi|night|*` coastal presets |

## Theme and models

- **Palette:** humid Black Sea haze; pale plaza paving; subtropical green outside the Olympic park band.
- **Hero models (10):** Fisht, Bolshoy, Adler, flame tower + pool, Iceberg, rings, Shayba, Ice Cube, Olympic Park station, race control.
- **Terrain:** nearly flat; bumps at s≈0.34 (+3.5 m) and s≈0.68 (−3 m).

## Survey panels (30 shots)

### Sector 1 — Olympic park (s≈0–0.34), day / dry

| **s1 start orbit · day · dry** | **s1 grid eye · day · dry** | **s1 rings eye · day · dry** |
| ![s1 start orbit · day · dry](../../../artifacts/shots/tracks/sochi/00-s1-start-orbit-day-dry.jpg) | ![s1 grid eye · day · dry](../../../artifacts/shots/tracks/sochi/01-s1-grid-eye-day-dry.jpg) | ![s1 rings eye · day · dry](../../../artifacts/shots/tracks/sochi/02-s1-rings-eye-day-dry.jpg) |
| **s1 t2 eye · day · dry** | **s1 flame orbit · day · dry** | **s1 bolshoy orbit · day · dry** |
| ![s1 t2 eye · day · dry](../../../artifacts/shots/tracks/sochi/03-s1-t2-eye-day-dry.jpg) | ![s1 flame orbit · day · dry](../../../artifacts/shots/tracks/sochi/04-s1-flame-orbit-day-dry.jpg) | ![s1 bolshoy orbit · day · dry](../../../artifacts/shots/tracks/sochi/05-s1-bolshoy-orbit-day-dry.jpg) |
| **s1 fisht eye · day · dry** | **s1 adler eye · day · dry** | **s1 shayba eye · day · dry** |
| ![s1 fisht eye · day · dry](../../../artifacts/shots/tracks/sochi/06-s1-fisht-eye-day-dry.jpg) | ![s1 adler eye · day · dry](../../../artifacts/shots/tracks/sochi/07-s1-adler-eye-day-dry.jpg) | ![s1 shayba eye · day · dry](../../../artifacts/shots/tracks/sochi/08-s1-shayba-eye-day-dry.jpg) |
| **s1 iceberg eye · day · dry** | **s1 t5 trackside · day · dry** | |
| ![s1 iceberg eye · day · dry](../../../artifacts/shots/tracks/sochi/09-s1-iceberg-eye-day-dry.jpg) | ![s1 t5 trackside · day · dry](../../../artifacts/shots/tracks/sochi/10-s1-t5-trackside-day-dry.jpg) | |

### Sector 2 — outer loop (s≈0.34–0.67), day / dry

| **s2 outer park · day · dry** | **s2 mid cine · day · dry** | **s2 t13 eye · day · dry** |
| ![s2 outer park · day · dry](../../../artifacts/shots/tracks/sochi/11-s2-outer-park-day-dry.jpg) | ![s2 mid cine · day · dry](../../../artifacts/shots/tracks/sochi/12-s2-mid-cine-day-dry.jpg) | ![s2 t13 eye · day · dry](../../../artifacts/shots/tracks/sochi/13-s2-t13-eye-day-dry.jpg) |

### Sector 3 — paddock funnel (s≈0.67–1.0), day / dry

| **s3 elev cine · day · dry** | **s3 t17 eye · day · dry** | **s3 icecube eye · day · dry** |
| ![s3 elev cine · day · dry](../../../artifacts/shots/tracks/sochi/14-s3-elev-cine-day-dry.jpg) | ![s3 t17 eye · day · dry](../../../artifacts/shots/tracks/sochi/15-s3-t17-eye-day-dry.jpg) | ![s3 icecube eye · day · dry](../../../artifacts/shots/tracks/sochi/16-s3-icecube-eye-day-dry.jpg) |
| **s3 pit eye · day · dry** | | |
| ![s3 pit eye · day · dry](../../../artifacts/shots/tracks/sochi/17-s3-pit-eye-day-dry.jpg) | | |

### Lap overview — day / dry

| **overview orbit · day · dry** | | |
| ![overview orbit · day · dry](../../../artifacts/shots/tracks/sochi/18-overview-orbit-day-dry.jpg) | | |

### Time-of-day variants (dry weather only)

| **s1 start orbit · dusk · dry** | **s1 start orbit · night · dry** | **s1 start orbit · dawn · dry** |
| ![s1 start orbit · dusk · dry](../../../artifacts/shots/tracks/sochi/20-s1-start-orbit-dusk-dry.jpg) | ![s1 start orbit · night · dry](../../../artifacts/shots/tracks/sochi/21-s1-start-orbit-night-dry.jpg) | ![s1 start orbit · dawn · dry](../../../artifacts/shots/tracks/sochi/22-s1-start-orbit-dawn-dry.jpg) |
| **s1 flame orbit · dusk · dry** | **s1 flame orbit · night · dry** | **s1 fisht eye · dusk · dry** |
| ![s1 flame orbit · dusk · dry](../../../artifacts/shots/tracks/sochi/23-s1-flame-orbit-dusk-dry.jpg) | ![s1 flame orbit · night · dry](../../../artifacts/shots/tracks/sochi/24-s1-flame-orbit-night-dry.jpg) | ![s1 fisht eye · dusk · dry](../../../artifacts/shots/tracks/sochi/26-s1-fisht-eye-dusk-dry.jpg) |
| **s1 fisht eye · night · dry** | **s3 pit eye · dusk · dry** | **s3 pit eye · night · dry** |
| ![s1 fisht eye · night · dry](../../../artifacts/shots/tracks/sochi/27-s1-fisht-eye-night-dry.jpg) | ![s3 pit eye · dusk · dry](../../../artifacts/shots/tracks/sochi/28-s3-pit-eye-dusk-dry.jpg) | ![s3 pit eye · night · dry](../../../artifacts/shots/tracks/sochi/29-s3-pit-eye-night-dry.jpg) |
| **s2 t13 eye · dusk · dry** | **overview orbit · dusk · dry** | |
| ![s2 t13 eye · dusk · dry](../../../artifacts/shots/tracks/sochi/30-s2-t13-eye-dusk-dry.jpg) | ![overview orbit · dusk · dry](../../../artifacts/shots/tracks/sochi/31-overview-orbit-dusk-dry.jpg) | |

> **Weather backlog (not captured):** `wet`, `rain`, `overcast`, and `fog` need the landing shared shot batch (`--weather`) and `.gitignore` exception. Re-run the same hero fracs after rebase. **Lighting notes from dusk/night:** park lamp columns read correctly at night on the start straight and Medals Plaza; pit lane is darker but legible; no z-fighting observed on committed frames.

## Findings

| Severity | Issue | Evidence |
|----------|--------|----------|
| Fixed | Jersey kit rails buried on camber | `kit.rail` → `armco`; ground-audit buried 5→≤4 |
| Fixed | Sponsor hoarding footings buried on funnel | gap 5.0→6.5 m |
| Low | Landmarks clearer in orbit than eye along straights | panels 04–06 vs 03 |
| Low | Coplanar arc-stand ↔ city slab (9 spots, at baseline) | shared engine; not changed |
| Low | 242 trees suppressed in park (intentional) | `dressingExclusions` |
| Deferred | Weather-specific fog/sky/wet-road checks | tooling PR |

## Fixes applied

1. `js/circuits/sochi.js`: `kit.rail` `jersey` → `armco`.
2. `js/circuits/scenery/sochi.js`: `sponsorHoarding` gap 6.5 m.

## Verification

```sh
node tools/track/verify-track.cjs sochi
node tools/track/audit-circuit.cjs sochi --json   # ok
```
