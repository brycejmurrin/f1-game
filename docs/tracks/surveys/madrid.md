# Madrid (Madring) — circuit survey

**Date:** 2026-10-14  
**Branch:** `cursor/madrid-survey-fixes-8e02`  
**Live:** [brycejmurrin.github.io/f1-game](https://brycejmurrin.github.io/f1-game/)  
**Brief:** `docs/tracks/madrid.md`

## Scope note (2026-10-14)

**Weather / TOD matrix deferred:** batch `wx` + reliable multi-condition captures land in the shared PR *tools: shared shot tooling for circuit surveys* (from `claude/f1-game-project-26h3ng`). This branch keeps **circuit-only** edits and **day · dry** frames only (30 planned). After rebase, add **4–6** weather/lighting variants on Monumental, S/F, overpass, and Búnker (cap **36** total).

**Repro (day/dry, current `shot.mjs`):**

```sh
node tools/shot/shot.mjs --batch artifacts/shots/tracks/madrid/capture-jobs.json --backend webgl2 --gpu llvmpipe --wait 10
```

Captures commit with the shared PR’s `artifacts/shots/tracks/**` gitignore exception (not on this branch).

## Code map

| Layer | Path | Role |
|--------|------|------|
| Track def | `js/circuits/madrid.js` | OSM centreline, `bankZones`, El Búnker elevations, `dressingExclusions` |
| Scenery | `js/circuits/scenery/madrid.js` | IFEMA, Monumental, overpasses, urban blocks, Cuatro Torres, Barajas |
| Landmarks | `tests/data/landmarks/madrid.json` | `madrid-monumental-stands`, `madrid-sf-tribuna` |

**Built centreline:** ~5.34 km; min radius 9.43 m @ node 329; **surface folds 0**.

## Sector tour — day · dry (30 frames)

Paths below are relative to this file (`docs/tracks/surveys/`).

| | | |
|:---:|:---:|:---:|
| ![s01](../../../artifacts/shots/tracks/madrid/s01-sf-day-dry-park.png)<br>**s01** s=0.00 park | ![s02](../../../artifacts/shots/tracks/madrid/s02-ifema-barajas-day-dry-orbit.png)<br>**s02** s=0.02 | ![s03](../../../artifacts/shots/tracks/madrid/s03-overpass-day-dry-eye.png)<br>**s03** s=0.085 eye |
| ![s04](../../../artifacts/shots/tracks/madrid/s04-deck-avenue-day-dry-park.png)<br>**s04** s=0.135 | ![s05](../../../artifacts/shots/tracks/madrid/s05-chicane-day-dry-orbit.png)<br>**s05** s=0.12 | ![s06](../../../artifacts/shots/tracks/madrid/s06-plains-day-dry-orbit.png)<br>**s06** s=0.22 |
| ![s07](../../../artifacts/shots/tracks/madrid/s07-urban-s2-day-dry-orbit.png)<br>**s07** s=0.32 | ![s08](../../../artifacts/shots/tracks/madrid/s08-cuatro-torres-day-dry-orbit.png)<br>**s08** s=0.40 | ![s09](../../../artifacts/shots/tracks/madrid/s09-el-bunker-day-dry-park.png)<br>**s09** s=0.48 |
| ![s10](../../../artifacts/shots/tracks/madrid/s10-el-bunker-day-dry-trackside.png)<br>**s10** s=0.50 | ![s11](../../../artifacts/shots/tracks/madrid/s11-s2-exit-day-dry-orbit.png)<br>**s11** s=0.58 | ![s12](../../../artifacts/shots/tracks/madrid/s12-sierra-plains-day-dry-orbit.png)<br>**s12** s=0.62 |
| ![s13](../../../artifacts/shots/tracks/madrid/s13-monumental-entry-day-dry-park.png)<br>**s13** s=0.72 | ![s14](../../../artifacts/shots/tracks/madrid/s14-monumental-bank-day-dry-eye.png)<br>**s14** s=0.78 eye | ![s15](../../../artifacts/shots/tracks/madrid/s15-pelouse-day-dry-orbit.png)<br>**s15** s=0.84 |
| ![s16](../../../artifacts/shots/tracks/madrid/s16-ifema-bridge-day-dry-eye.png)<br>**s16** s=0.885 | ![s17](../../../artifacts/shots/tracks/madrid/s17-ifema-stands-day-dry-park.png)<br>**s17** s=0.90 | ![s18](../../../artifacts/shots/tracks/madrid/s18-closing-day-dry-orbit.png)<br>**s18** s=0.96 |
| ![s19](../../../artifacts/shots/tracks/madrid/s19-pit-lane-day-dry-park.png)<br>**s19** s=0.04 | ![s20](../../../artifacts/shots/tracks/madrid/s20-t1-chicane-day-dry-eye.png)<br>**s20** s=0.07 | ![s21](../../../artifacts/shots/tracks/madrid/s21-avenue-day-dry-orbit.png)<br>**s21** s=0.18 |
| ![s22](../../../artifacts/shots/tracks/madrid/s22-urban-crest-day-dry-orbit.png)<br>**s22** s=0.38 | ![s23](../../../artifacts/shots/tracks/madrid/s23-bunker-crest-day-dry-park.png)<br>**s23** s=0.45 | ![s24](../../../artifacts/shots/tracks/madrid/s24-bunker-drop-day-dry-trackside.png)<br>**s24** s=0.52 |
| ![s25](../../../artifacts/shots/tracks/madrid/s25-s3-entry-day-dry-orbit.png)<br>**s25** s=0.66 | ![s26](../../../artifacts/shots/tracks/madrid/s26-monumental-outside-day-dry-orbit.png)<br>**s26** s=0.74 | ![s27](../../../artifacts/shots/tracks/madrid/s27-monumental-mid-day-dry-park.png)<br>**s27** s=0.81 |
| ![s28](../../../artifacts/shots/tracks/madrid/s28-pelouse-bridge-day-dry-trackside.png)<br>**s28** s=0.88 | ![s29](../../../artifacts/shots/tracks/madrid/s29-valdebebas-day-dry-orbit.png)<br>**s29** s=0.93 | ![s30](../../../artifacts/shots/tracks/madrid/s30-barajas-horizon-day-dry-orbit.png)<br>**s30** s=0.025 NE horizon |

## Findings (day · dry)

- **Road:** no folds; walls tight in foundation spec.
- **Scenery:** generic plane trees clipped urban blocks (fixed via foliage exclusions). Plaza/mansard overlap @ s≈0.55 (plaza moved). IFEMA stand vs trees @ s≈0.89 (foliage band).
- **Landmarks:** Monumental banking + fins legible; Barajas tower subtle from driving cameras (s30 orbit).
- **Overpass:** soffit plate holds (no underside z-fight in dry captures).

## Weather / lighting backlog (post–shared-shot PR)

| View | Planned variants |
|------|------------------|
| s14 Monumental @ 0.78 | dusk, night, overcast, rain, fog (pick 4–5) |
| s01 S/F @ 0.00 | dusk, night, rain |
| s03 overpass @ 0.085 | night, fog |
| s09 Búnker @ 0.48 | dusk, wet |

Watch for: missing flood fill at Monumental when generic `lighting` is excluded (s=0.68–0.83); rain on dry Madrid palette; fog vs Sierra haze.

## Fixes on this branch

1. `dressingExclusions` — `foliage` off s **0.26–0.58** and **0.87–0.93**.
2. El Búnker straw plaza **s 0.53**, gap **108**.

## Verification

```sh
node tools/track/verify-track.cjs madrid
node tools/track/audit-circuit.cjs madrid --json
```
