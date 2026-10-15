# Madrid (Madring) — circuit survey

**Date:** 2026-10-14  
**Branch:** `cursor/madrid-survey-fixes-8e02`  
**Live:** [brycejmurrin.github.io/f1-game](https://brycejmurrin.github.io/f1-game/)  
**Brief:** `docs/tracks/madrid.md`

## Scope note

**36** committed survey JPEGs (q≈80, ≤1280 px wide, &lt;300 KB each) under `artifacts/shots/tracks/madrid/`: **30** sector tour frames (**day · dry**) plus **6** hero **weather / time-of-day** frames captured with shared `shot.mjs` (`--jpeg --present-timeout 90 --capture-retries 4 --wait 120`, WebGL2 / SwiftShader).

## Code map

| Layer | Path | Role |
|--------|------|------|
| Track def | `js/circuits/madrid.js` | OSM centreline, `bankZones`, El Búnker elevations, `dressingExclusions` |
| Scenery | `js/circuits/scenery/madrid.js` | IFEMA, Monumental, overpasses, urban blocks, Cuatro Torres, Barajas |
| Landmarks | `tests/data/landmarks/madrid.json` | `madrid-monumental-stands`, `madrid-sf-tribuna` |

**Built centreline:** ~5.34 km; min radius 9.43 m @ node 329; **surface folds 0**.

## Sector tour — panel grid (30 shots)

Paths are relative to this file. Each cell: **view · weather · time of day · s**.

| | | |
|:---:|:---:|:---:|
| ![s01](../../../artifacts/shots/tracks/madrid/s01-sf-day-dry-park.jpg)<br>**s01** park · dry · day · s=0.00<br>S/F pit | ![s02](../../../artifacts/shots/tracks/madrid/s02-ifema-barajas-day-dry-orbit.jpg)<br>**s02** orbit · dry · day · s=0.02<br>IFEMA / Barajas bearing | ![s03](../../../artifacts/shots/tracks/madrid/s03-overpass-day-dry-eye.jpg)<br>**s03** eye · dry · day · s=0.085<br>Motorway overpass |
| ![s04](../../../artifacts/shots/tracks/madrid/s04-deck-avenue-day-dry-park.jpg)<br>**s04** park · dry · day · s=0.135<br>Deck avenue | ![s05](../../../artifacts/shots/tracks/madrid/s05-chicane-day-dry-orbit.jpg)<br>**s05** orbit · dry · day · s=0.12<br>Chicane | ![s06](../../../artifacts/shots/tracks/madrid/s06-plains-day-dry-orbit.jpg)<br>**s06** orbit · dry · day · s=0.22<br>Plains |
| ![s07](../../../artifacts/shots/tracks/madrid/s07-urban-s2-day-dry-orbit.jpg)<br>**s07** orbit · dry · day · s=0.32<br>Urban S2 | ![s08](../../../artifacts/shots/tracks/madrid/s08-cuatro-torres-day-dry-orbit.jpg)<br>**s08** orbit · dry · day · s=0.40<br>Cuatro Torres | ![s09](../../../artifacts/shots/tracks/madrid/s09-el-bunker-day-dry-park.jpg)<br>**s09** park · dry · day · s=0.48<br>El Búnker |
| ![s10](../../../artifacts/shots/tracks/madrid/s10-el-bunker-day-dry-trackside.jpg)<br>**s10** trackside · dry · day · s=0.50<br>Búnker wall | ![s11](../../../artifacts/shots/tracks/madrid/s11-s2-exit-day-dry-orbit.jpg)<br>**s11** orbit · dry · day · s=0.58<br>S2 exit | ![s12](../../../artifacts/shots/tracks/madrid/s12-sierra-plains-day-dry-orbit.jpg)<br>**s12** orbit · dry · day · s=0.62<br>Sierra plains |
| ![s13](../../../artifacts/shots/tracks/madrid/s13-monumental-entry-day-dry-park.jpg)<br>**s13** park · dry · day · s=0.72<br>Monumental entry | ![s14](../../../artifacts/shots/tracks/madrid/s14-monumental-bank-day-dry-eye.jpg)<br>**s14** eye · dry · day · s=0.78<br>Banked bowl | ![s15](../../../artifacts/shots/tracks/madrid/s15-pelouse-day-dry-orbit.jpg)<br>**s15** orbit · dry · day · s=0.84<br>Pelouse |
| ![s16](../../../artifacts/shots/tracks/madrid/s16-ifema-bridge-day-dry-eye.jpg)<br>**s16** eye · dry · day · s=0.885<br>IFEMA bridge | ![s17](../../../artifacts/shots/tracks/madrid/s17-ifema-stands-day-dry-park.jpg)<br>**s17** park · dry · day · s=0.90<br>IFEMA stands | ![s18](../../../artifacts/shots/tracks/madrid/s18-closing-day-dry-orbit.jpg)<br>**s18** orbit · dry · day · s=0.96<br>Closing sector |
| ![s19](../../../artifacts/shots/tracks/madrid/s19-pit-lane-day-dry-park.jpg)<br>**s19** park · dry · day · s=0.04<br>Pit lane | ![s20](../../../artifacts/shots/tracks/madrid/s20-t1-chicane-day-dry-eye.jpg)<br>**s20** eye · dry · day · s=0.07<br>T1 chicane | ![s21](../../../artifacts/shots/tracks/madrid/s21-avenue-day-dry-orbit.jpg)<br>**s21** orbit · dry · day · s=0.18<br>Avenue offices |
| ![s22](../../../artifacts/shots/tracks/madrid/s22-urban-crest-day-dry-orbit.jpg)<br>**s22** orbit · dry · day · s=0.38<br>Urban crest | ![s23](../../../artifacts/shots/tracks/madrid/s23-bunker-crest-day-dry-park.jpg)<br>**s23** park · dry · day · s=0.45<br>Búnker crest | ![s24](../../../artifacts/shots/tracks/madrid/s24-bunker-drop-day-dry-trackside.jpg)<br>**s24** trackside · dry · day · s=0.52<br>Búnker drop |
| ![s25](../../../artifacts/shots/tracks/madrid/s25-s3-entry-day-dry-orbit.jpg)<br>**s25** orbit · dry · day · s=0.66<br>S3 entry | ![s26](../../../artifacts/shots/tracks/madrid/s26-monumental-outside-day-dry-orbit.jpg)<br>**s26** orbit · dry · day · s=0.74<br>Monumental outside | ![s27](../../../artifacts/shots/tracks/madrid/s27-monumental-mid-day-dry-park.jpg)<br>**s27** park · dry · day · s=0.81<br>Monumental mid |
| ![s28](../../../artifacts/shots/tracks/madrid/s28-pelouse-bridge-day-dry-trackside.jpg)<br>**s28** trackside · dry · day · s=0.88<br>Pelouse / bridge | ![s29](../../../artifacts/shots/tracks/madrid/s29-valdebebas-day-dry-orbit.jpg)<br>**s29** orbit · dry · day · s=0.93<br>Valdebebas | ![s30](../../../artifacts/shots/tracks/madrid/s30-barajas-horizon-day-dry-orbit.jpg)<br>**s30** orbit · dry · day · s=0.025<br>Barajas horizon |

## Hero weather & lighting (6 shots)

Same caption order: **view · weather · time of day · s**.

| | | |
|:---:|:---:|:---:|
| ![wx01](../../../artifacts/shots/tracks/madrid/wx-monumental-night-dry-eye.jpg)<br>**wx01** eye · dry · night · s=0.78<br>Monumental bowl | ![wx02](../../../artifacts/shots/tracks/madrid/wx-monumental-day-rain-eye.jpg)<br>**wx02** eye · rain · day · s=0.78<br>Monumental rain | ![wx03](../../../artifacts/shots/tracks/madrid/wx-sf-dusk-dry-park.jpg)<br>**wx03** park · dry · dusk · s=0.00<br>S/F dusk |
| ![wx04](../../../artifacts/shots/tracks/madrid/wx-sf-night-dry-park.jpg)<br>**wx04** park · dry · night · s=0.00<br>S/F night | ![wx05](../../../artifacts/shots/tracks/madrid/wx-overpass-day-fog-eye.jpg)<br>**wx05** eye · fog · day · s=0.085<br>Overpass fog | ![wx06](../../../artifacts/shots/tracks/madrid/wx-bunker-day-wet-park.jpg)<br>**wx06** park · wet · day · s=0.48<br>El Búnker wet |

## Findings & fixes

Foliage exclusions (urban + IFEMA), El Búnker plaza nudge. Weather heroes: Monumental (night / rain), S/F (dusk / night), overpass (fog), Búnker (wet).

## Verification

```sh
node tools/track/verify-track.cjs madrid
node tools/track/audit-circuit.cjs madrid --json
```
