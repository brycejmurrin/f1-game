# Sepang — circuit survey (2026-10-14)

**Circuit id:** `sepang` · **Theme:** green (equatorial plantation) · **Length:** ~5.55 km · **Branch:** `cursor/sepang-survey-30aa`

**Evidence:** 28 headless TLX frames under `artifacts/shots/tracks/sepang/` (regen: `scratch/sepang-survey-day-jobs.json` + `scratch/sepang-survey-remaining-jobs.json`, `node tools/shot/shot.mjs --batch …`). Shots are gitignored until the shared tooling PR tracks `artifacts/shots/tracks/**`. **Weather** panels (rain, wet, overcast, fog) deferred until rebasing on shared shot batch support.

**Audits:** `node tools/track/verify-track.cjs sepang` · `node tools/track/audit-circuit.cjs sepang`

## Code map

| Layer | Path | Role |
|--------|------|------|
| Def | `js/circuits/sepang.js` | OSM `path`, `startFrac` 0, `ownPitStraight`, palm `furniture`, `dressingExclusions`, equatorial `pal` |
| Scenery | `js/circuits/scenery/sepang.js` | Plantation grid, hibiscus canopy, K1/F stands, paddock, KLIA skyline, runoff |
| Brief | `docs/tracks/sepang.md` | Landmarks-by-`s`, palette, modelling notes |
| Landmarks | `tests/data/landmarks/sepang.json` | Required `modelGroup` ids for verify |

**Sectors (approx.):** S1 pit → T4 (~0.38), S2 mid-lap (~0.64), S3 back straight → T15.

## Theme and models

Humid haze day palette; ordered oil-palm ranks; hibiscus tensile canopy opposite pits; teal venue accents on pit bays; KLIA tower silhouette outside lap at s≈0.42.

## Sector panels — day / dry / midday

| Frame | File | Caption |
|:---:|:---|:---|
| S1-a | `s1-pit-orbit-day-dry.png` | Pit orbit — layout width |
| S1-b | `s1-pit-chase-day-dry.png` | Pit chase — main straight |
| S1-c | `s1-hibiscus-canopy-day-dry.png` | Hibiscus canopy trackside |
| S1-d | `s1-paddock-pits-day-dry.png` | Cockpit — canopy + terrace |
| S1-e | `s1-race-control-day-dry.png` | Race-control fin |
| S2-a | `s2-t1-k1-stand-day-dry.png` | K1 grandstand T1–T2 |
| S2-b | `s2-palm-plantation-day-dry.png` | Plantation grid |
| S2-c | `s2-t5-stand-day-dry.png` | Mid-lap teal shelter |
| S2-d | `s2-t7-f-stand-day-dry.png` | F grandstand T7–T8 |
| S2-e | `s2-klia-skyline-day-dry.png` | KLIA skyline (subtle) |
| S2-f | `s2-infield-wide-day-dry.png` | Infield openness |
| S2-g | `s3-midlap-cinematic-day-dry.png` | Mid-lap width (cinematic) |
| S3-a | `s3-t9-hairpin-day-dry.png` | T9 hairpin runoff |
| S3-b | `s3-spectator-hill-day-dry.png` | Earth bank |
| S3-c | `s3-back-straight-day-dry.png` | Back straight / LED hoarding |
| S3-d | `s3-t15-hairpin-day-dry.png` | T15 final hairpin |

All paths relative to `artifacts/shots/tracks/sepang/`. Full image grids are in the draft PR description.

## Time-of-day panels — dry (no weather enum yet)

| Frame | File | Caption |
|:---:|:---|:---|
| WX-a | `wx-pit-straight-dusk-dry.png` | Pit — golden hour |
| WX-b | `wx-pit-straight-night-dry.png` | Pit — night flood masts |
| WX-c | `wx-hibiscus-dusk-dry.png` | Hibiscus — dusk |
| WX-d | `wx-hibiscus-night-dry.png` | Hibiscus — night |
| WX-e | `wx-turn1-dusk-dry.png` | T1 — dusk |
| WX-f | `wx-turn1-night-dry.png` | T1 — night |
| WX-g | `wx-turn9-dusk-dry.png` | T9 — dusk |
| WX-h | `wx-turn9-night-dry.png` | T9 trackside — night |
| WX-i | `wx-turn9-park-night-dry.png` | T9 chase — night |
| WX-j | `wx-turn15-dusk-dry.png` | T15 — dusk |
| WX-k | `wx-turn15-night-dry.png` | T15 — night |
| WX-l | `wx-infield-night-dry.png` | Infield orbit — night |

**Not captured (batch timeout):** `wx-pit-straight-dawn-dry.png`, `wx-hibiscus-dawn-dry.png`, `wx-turn1-dawn-dry.png`, `wx-turn15-dawn-dry.png`, `wx-infield-dusk-dry.png` — retry after shared shot PR.

## Findings

| Severity | Finding | Notes |
|----------|---------|--------|
| Fixed | Paddock motorhomes buried on slope (≤0.91 m) | Stricter `terrainYAt` gate in scenery |
| Fixed | K1 stand riser flatCoplanar | Riser stagger in `emitT1Stand` |
| Low | `verify-track`: suppressed `grandstand=1` | One `grandstandEx` shelter rejected |
| Low | T1 trackside billboard clutter | Visual noise |
| Info | KLIA landmark subtle at driving height | Orbit helps |
| Deferred | Weather rain/wet/overcast/fog | Shared `shot.mjs --weather` |
| Deferred | Dawn + infield-dusk frames | `awaitSoftPresent` timeout |

## Lighting / weather backlog (post–shared tooling)

| Condition | Sepang watch |
|-----------|----------------|
| Rain / wet | Tropical downpour read; drain channels visible |
| Overcast | Keep humid palette, not flat grey |
| Fog | Avoid double-fog with authored `pal.fogDensity` |
| Night | Lamp pools on straights / stands |
| Dawn | Warm rim on hibiscus fabric |

## Audits (post-fix)

- `verify-track`: OK, surface folds 0
- `audit-circuit`: ok — float/clip/coplanar 0; ground buried 0, flatCoplanar 0
- Baseline tightened: `buried` 7→0, `flatCoplanar` 1→0 in `tests/data/scenery-audit-baseline.json`

## Ranked follow-ups

1. Re-seat suppressed grandstand.
2. Rebase on shared shot PR → weather matrix + failed dawn/dusk frames.
3. KLIA sightline tweak (scenery-only).
4. FIA sector splits (def metadata).
