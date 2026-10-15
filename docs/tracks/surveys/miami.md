# Miami International Autodrome — circuit survey (2026-10-14)

**Circuit id:** `miami` · **Branch:** `cursor/miami-survey-92bc`  
**Brief:** `docs/tracks/miami.md` · **Data:** `js/circuits/miami.js` · **Dressing:** `js/circuits/scenery/miami.js`

## Code map

| Layer | Role |
|--------|------|
| `js/circuits/miami.js` | OSM centreline (~5.4 km), `flatTerrain`, aqua brake aprons via per-zone `runoffApron` (grey `pal.runoff` verge), Turnpike humps at s≈0.662 / 0.8605, `dressingExclusions` for marina/tech generic city |
| `js/circuits/scenery/miami.js` | Hard Rock bowl, marina `waterSurface` + `drape`, MSC / beach club heroes, Turnpike spans, kit pit + race control |
| `tests/data/landmarks/miami.json` | `miami-hard-rock-neon`, `msc-yacht-club`, `beach-club-cabana`, `miami-mia-sign` |

## Survey shots (32 committed JPEGs)

**Path:** `artifacts/shots/tracks/miami/tod-day/*.jpg` (forced into git with `git add -f`; q≈80, max width 1280px, each &lt;300 KB).  
**Captured:** dry weather, `day` time-of-day only (`shot.mjs --tod day`). Dusk/dawn/night batches hit `awaitSoftPresent` timeout after `setTimeOfDay` reload on this VM — follow-up after shared shot-tooling PR.

### By sector (dry · day)

### S1 pit straight & T1 (7 frames)

| View | View | View |
|:---:|:---:|:---:|
| ![sf-orbit](../../../artifacts/shots/tracks/miami/tod-day/s1-pit-straight__sf-orbit.jpg)<br/>**sf-orbit** · dry · day | ![sf-stadium](../../../artifacts/shots/tracks/miami/tod-day/s1-pit-straight__sf-stadium.jpg)<br/>**sf-stadium** · dry · day | ![sf-trackside](../../../artifacts/shots/tracks/miami/tod-day/s1-pit-straight__sf-trackside.jpg)<br/>**sf-trackside** · dry · day |
| ![pit-complex](../../../artifacts/shots/tracks/miami/tod-day/s1-pit__pit-complex.jpg)<br/>**pit-complex** · dry · day | ![pit-eye](../../../artifacts/shots/tracks/miami/tod-day/s1-pit__pit-eye.jpg)<br/>**pit-eye** · dry · day | ![t1-stands](../../../artifacts/shots/tracks/miami/tod-day/s1-t1__t1-stands.jpg)<br/>**t1-stands** · dry · day |
| ![t1-trackside](../../../artifacts/shots/tracks/miami/tod-day/s1-t1__t1-trackside.jpg)<br/>**t1-trackside** · dry · day | | |

### S2 marina (6 frames)

| View | View | View |
|:---:|:---:|:---:|
| ![marina-orbit-wide](../../../artifacts/shots/tracks/miami/tod-day/s2-marina__marina-orbit-wide.jpg)<br/>**marina-orbit-wide** · dry · day | ![marina-sweep](../../../artifacts/shots/tracks/miami/tod-day/s2-marina__marina-sweep.jpg)<br/>**marina-sweep** · dry · day | ![msc-eye](../../../artifacts/shots/tracks/miami/tod-day/s2-marina__msc-eye.jpg)<br/>**msc-eye** · dry · day |
| ![msc-marina](../../../artifacts/shots/tracks/miami/tod-day/s2-marina__msc-marina.jpg)<br/>**msc-marina** · dry · day | ![ped-bridge-eye](../../../artifacts/shots/tracks/miami/tod-day/s2-marina__ped-bridge-eye.jpg)<br/>**ped-bridge-eye** · dry · day | ![ped-bridge](../../../artifacts/shots/tracks/miami/tod-day/s2-marina__ped-bridge.jpg)<br/>**ped-bridge** · dry · day |

### S3 beach & stadium lot (5 frames)

| View | View | View |
|:---:|:---:|:---:|
| ![beach-club](../../../artifacts/shots/tracks/miami/tod-day/s3-beach__beach-club.jpg)<br/>**beach-club** · dry · day | ![beach-orbit](../../../artifacts/shots/tracks/miami/tod-day/s3-beach__beach-orbit.jpg)<br/>**beach-orbit** · dry · day | ![t11-brake](../../../artifacts/shots/tracks/miami/tod-day/s3-beach__t11-brake.jpg)<br/>**t11-brake** · dry · day |
| ![lot-orbit](../../../artifacts/shots/tracks/miami/tod-day/s3-stadium-lot__lot-orbit.jpg)<br/>**lot-orbit** · dry · day | ![stadium-lot](../../../artifacts/shots/tracks/miami/tod-day/s3-stadium-lot__stadium-lot.jpg)<br/>**stadium-lot** · dry · day | |

### S4 Turnpike & chicane (7 frames)

| View | View | View |
|:---:|:---:|:---:|
| ![chicane-crest](../../../artifacts/shots/tracks/miami/tod-day/s4-chicane__chicane-crest.jpg)<br/>**chicane-crest** · dry · day | ![chicane-eye](../../../artifacts/shots/tracks/miami/tod-day/s4-chicane__chicane-eye.jpg)<br/>**chicane-eye** · dry · day | ![tech-sector](../../../artifacts/shots/tracks/miami/tod-day/s4-tech__tech-sector.jpg)<br/>**tech-sector** · dry · day |
| ![tech-trackside](../../../artifacts/shots/tracks/miami/tod-day/s4-tech__tech-trackside.jpg)<br/>**tech-trackside** · dry · day | ![chicane-approach](../../../artifacts/shots/tracks/miami/tod-day/s4-turnpike__chicane-approach.jpg)<br/>**chicane-approach** · dry · day | ![deck-orbit](../../../artifacts/shots/tracks/miami/tod-day/s4-turnpike__deck-orbit.jpg)<br/>**deck-orbit** · dry · day |
| ![under-deck](../../../artifacts/shots/tracks/miami/tod-day/s4-turnpike__under-deck.jpg)<br/>**under-deck** · dry · day | | |

### S5 DRS back straight (3 frames)

| View | View | View |
|:---:|:---:|:---:|
| ![back-straight](../../../artifacts/shots/tracks/miami/tod-day/s5-drs__back-straight.jpg)<br/>**back-straight** · dry · day | ![drs-eye](../../../artifacts/shots/tracks/miami/tod-day/s5-drs__drs-eye.jpg)<br/>**drs-eye** · dry · day | ![drs-trackside](../../../artifacts/shots/tracks/miami/tod-day/s5-drs__drs-trackside.jpg)<br/>**drs-trackside** · dry · day |

### S6 final & paddock (4 frames)

| View | View | View |
|:---:|:---:|:---:|
| ![final-eye](../../../artifacts/shots/tracks/miami/tod-day/s6-final__final-eye.jpg)<br/>**final-eye** · dry · day | ![final-sector](../../../artifacts/shots/tracks/miami/tod-day/s6-final__final-sector.jpg)<br/>**final-sector** · dry · day | ![paddock-orbit](../../../artifacts/shots/tracks/miami/tod-day/s6-paddock__paddock-orbit.jpg)<br/>**paddock-orbit** · dry · day |
| ![paddock](../../../artifacts/shots/tracks/miami/tod-day/s6-paddock__paddock.jpg)<br/>**paddock** · dry · day | | |

### By weather / lighting

All 32 frames above are **dry · day**. Planned follow-up (after shared `wx` batch + TOD reload fix): repeat six key views at dusk, dawn, night, plus wet, rain, overcast, fog.

## Findings (code + dry captures)

### Strengths

- Hard Rock bowl + `miami-hard-rock-neon` read at S/F; marina vinyl + MSC hero; beach club at s≈0.52; twin Turnpike decks.
- `verify-track`: 0 surface folds; float/clip clean post-fixes.

### Issues & backlog

| Pri | Issue | Notes |
|-----|--------|-------|
| P1 | **TOD / weather matrix** | Dusk/dawn/night + wx variants not captured (soft-present timeout on `setTimeOfDay` in batch) |
| P2 | Generic conifers vs palms | Marina straight: suppressed generic trees vs authored `forestEdge` palms |
| P3 | Turnpike underside flicker | motion-capture under s=0.635/0.685 if reported |
| P3 | Suppressed kit props | verify warns ~156 palms dropped — `rejBox`, not a throw |

## Fixes in this PR (`js/circuits/scenery/miami.js` only)

- Removed outer-ring stadium hospitality cubes (11 m unsupported vs terrain).
- Terrain-foot DRS flood masts; terrain-sampled campus arrival plaza.
- Deduped palm scatter at s≈0.18 (flatCoplanar).

Post-fix: `node tools/track/audit-circuit.cjs miami` → **ok** (ground within baseline; no baseline loosening).

## Verify

```sh
node tools/track/verify-track.cjs miami
node tools/track/audit-circuit.cjs miami
```
