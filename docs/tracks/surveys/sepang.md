# Sepang — circuit survey (2026-10-14)

**Circuit id:** `sepang` · **Branch:** `cursor/sepang-survey-30aa` · **Shots:** 28 JPEGs in `artifacts/shots/tracks/sepang/`

Weather variants (rain/wet/overcast/fog) deferred until shared shot batch tooling lands.

## Code map

| Layer | Path |
|--------|------|
| Def | `js/circuits/sepang.js` |
| Scenery | `js/circuits/scenery/sepang.js` |
| Brief | `docs/tracks/sepang.md` |

## Sector panels — dry · day

| | | |
|:---:|:---:|:---:|
| ![s1-hibiscus-canopy-day-dry.jpg](../../../artifacts/shots/tracks/sepang/s1-hibiscus-canopy-day-dry.jpg) | ![s1-paddock-pits-day-dry.jpg](../../../artifacts/shots/tracks/sepang/s1-paddock-pits-day-dry.jpg) | ![s1-pit-chase-day-dry.jpg](../../../artifacts/shots/tracks/sepang/s1-pit-chase-day-dry.jpg) |
| *hibiscus canopy · day · dry* | *paddock pits · day · dry* | *pit chase · day · dry* |
| ![s1-pit-orbit-day-dry.jpg](../../../artifacts/shots/tracks/sepang/s1-pit-orbit-day-dry.jpg) | ![s1-race-control-day-dry.jpg](../../../artifacts/shots/tracks/sepang/s1-race-control-day-dry.jpg) | ![s2-infield-wide-day-dry.jpg](../../../artifacts/shots/tracks/sepang/s2-infield-wide-day-dry.jpg) |
| *pit orbit · day · dry* | *race control · day · dry* | *infield wide · day · dry* |
| ![s2-klia-skyline-day-dry.jpg](../../../artifacts/shots/tracks/sepang/s2-klia-skyline-day-dry.jpg) | ![s2-palm-plantation-day-dry.jpg](../../../artifacts/shots/tracks/sepang/s2-palm-plantation-day-dry.jpg) | ![s2-t1-k1-stand-day-dry.jpg](../../../artifacts/shots/tracks/sepang/s2-t1-k1-stand-day-dry.jpg) |
| *klia skyline · day · dry* | *palm plantation · day · dry* | *t1 k1 stand · day · dry* |
| ![s2-t5-stand-day-dry.jpg](../../../artifacts/shots/tracks/sepang/s2-t5-stand-day-dry.jpg) | ![s2-t7-f-stand-day-dry.jpg](../../../artifacts/shots/tracks/sepang/s2-t7-f-stand-day-dry.jpg) | ![s3-back-straight-day-dry.jpg](../../../artifacts/shots/tracks/sepang/s3-back-straight-day-dry.jpg) |
| *t5 stand · day · dry* | *t7 f stand · day · dry* | *back straight · day · dry* |
| ![s3-midlap-cinematic-day-dry.jpg](../../../artifacts/shots/tracks/sepang/s3-midlap-cinematic-day-dry.jpg) | ![s3-spectator-hill-day-dry.jpg](../../../artifacts/shots/tracks/sepang/s3-spectator-hill-day-dry.jpg) | ![s3-t15-hairpin-day-dry.jpg](../../../artifacts/shots/tracks/sepang/s3-t15-hairpin-day-dry.jpg) |
| *midlap cinematic · day · dry* | *spectator hill · day · dry* | *t15 hairpin · day · dry* |
| ![s3-t9-hairpin-day-dry.jpg](../../../artifacts/shots/tracks/sepang/s3-t9-hairpin-day-dry.jpg) |   |   |
| *t9 hairpin · day · dry* |   |   |

## Time-of-day panels — dry weather

| | | |
|:---:|:---:|:---:|
| ![wx-hibiscus-dusk-dry.jpg](../../../artifacts/shots/tracks/sepang/wx-hibiscus-dusk-dry.jpg) | ![wx-hibiscus-night-dry.jpg](../../../artifacts/shots/tracks/sepang/wx-hibiscus-night-dry.jpg) | ![wx-infield-night-dry.jpg](../../../artifacts/shots/tracks/sepang/wx-infield-night-dry.jpg) |
| *hibiscus · dusk · dry* | *hibiscus · night · dry* | *infield · night · dry* |
| ![wx-pit-straight-dusk-dry.jpg](../../../artifacts/shots/tracks/sepang/wx-pit-straight-dusk-dry.jpg) | ![wx-pit-straight-night-dry.jpg](../../../artifacts/shots/tracks/sepang/wx-pit-straight-night-dry.jpg) | ![wx-turn1-dusk-dry.jpg](../../../artifacts/shots/tracks/sepang/wx-turn1-dusk-dry.jpg) |
| *pit straight · dusk · dry* | *pit straight · night · dry* | *turn1 · dusk · dry* |
| ![wx-turn1-night-dry.jpg](../../../artifacts/shots/tracks/sepang/wx-turn1-night-dry.jpg) | ![wx-turn15-dusk-dry.jpg](../../../artifacts/shots/tracks/sepang/wx-turn15-dusk-dry.jpg) | ![wx-turn15-night-dry.jpg](../../../artifacts/shots/tracks/sepang/wx-turn15-night-dry.jpg) |
| *turn1 · night · dry* | *turn15 · dusk · dry* | *turn15 · night · dry* |
| ![wx-turn9-dusk-dry.jpg](../../../artifacts/shots/tracks/sepang/wx-turn9-dusk-dry.jpg) | ![wx-turn9-night-dry.jpg](../../../artifacts/shots/tracks/sepang/wx-turn9-night-dry.jpg) | ![wx-turn9-park-night-dry.jpg](../../../artifacts/shots/tracks/sepang/wx-turn9-park-night-dry.jpg) |
| *turn9 · dusk · dry* | *turn9 · night · dry* | *turn9 park · night · dry* |

## Findings

| Item | Status |
|------|--------|
| Motorhome burial on paddock slope | Fixed (terrain gate) |
| K1 stand flatCoplanar | Fixed (riser stagger) |
| Suppressed grandstand=1 | Open |
| Weather matrix | Deferred (shared shot PR) |
