# Catalunya — circuit survey (2026-10-14)

**Circuit id:** `catalunya` · **GP:** Spanish GP (Montmeló) · **Length:** ~4.657 km · **Theme:** `green`

**Data:** `js/circuits/catalunya.js` · **Scenery:** `js/circuits/scenery/catalunya.js` · **Brief:** `docs/tracks/catalunya.md`

**Shots:** 32 JPEGs in `artifacts/shots/tracks/catalunya/` (q≈80, ≤1280 px wide, ≤300 KB). Weather variants (wet / rain / overcast / fog) deferred until shared shot tooling PR.

---

## Findings (summary)

| Area | Action |
|------|--------|
| La Caixa / final terrace prop clip | **Fixed** in `scenery/catalunya.js` (terrace spans, mast/sail spacing) |
| Night pit straight dark | **Fixed** — flood masts use default lamp registration |
| Weather matrix | **Pending** shared `--wx` batch tooling |

Offline: `audit-circuit catalunya` clip severe 0 (cap 5, unchanged).

---

## Panel grid — by sector (day · dry)

| | | |
| --- | --- | --- |
| ![S1 main straight · day · dry](../../../artifacts/shots/tracks/catalunya/s1-main-straight__day.jpg)<br/>S1 main straight · day · dry | ![S1 Tilke main grandstand · day · dry](../../../artifacts/shots/tracks/catalunya/s1-main-grandstand__day.jpg)<br/>S1 Tilke main grandstand · day · dry | ![S1 Tribuna J · day · dry](../../../artifacts/shots/tracks/catalunya/s1-grandstand-j__day.jpg)<br/>S1 Tribuna J · day · dry |
| ![S1 pit-end scoreboard · day · dry](../../../artifacts/shots/tracks/catalunya/s1-pit-scoreboard__day.jpg)<br/>S1 pit-end scoreboard · day · dry | ![S1 pit terrace · day · dry](../../../artifacts/shots/tracks/catalunya/s1-pit-terrace__day.jpg)<br/>S1 pit terrace · day · dry | ![S1 race control · day · dry](../../../artifacts/shots/tracks/catalunya/s1-race-control__day.jpg)<br/>S1 race control · day · dry |
| ![S1 paddock club · day · dry](../../../artifacts/shots/tracks/catalunya/s1-paddock-club__day.jpg)<br/>S1 paddock club · day · dry | ![S2 T1 Elf (trackside) · day · dry](../../../artifacts/shots/tracks/catalunya/s2-t1-elf__day.jpg)<br/>S2 T1 Elf (trackside) · day · dry | ![S2 T1 orange stand (orbit) · day · dry](../../../artifacts/shots/tracks/catalunya/s2-t1-stand__day.jpg)<br/>S2 T1 orange stand (orbit) · day · dry |
| ![S3 Renault sector · day · dry](../../../artifacts/shots/tracks/catalunya/s3-renault__day.jpg)<br/>S3 Renault sector · day · dry | ![S4 Repsol · day · dry](../../../artifacts/shots/tracks/catalunya/s3-repsol__day.jpg)<br/>S4 Repsol · day · dry | ![S3 Repsol approach · day · dry](../../../artifacts/shots/tracks/catalunya/s3-repsol-approach__day.jpg)<br/>S3 Repsol approach · day · dry |
| ![S4 Seat infield · day · dry](../../../artifacts/shots/tracks/catalunya/s4-seat-infield__day.jpg)<br/>S4 Seat infield · day · dry | ![S5 Campsa crest · day · dry](../../../artifacts/shots/tracks/catalunya/s5-campsa-crest__day.jpg)<br/>S5 Campsa crest · day · dry | ![S6 La Caixa hairpin · day · dry](../../../artifacts/shots/tracks/catalunya/s6-la-caixa__day.jpg)<br/>S6 La Caixa hairpin · day · dry |
| ![S7 final esses · day · dry](../../../artifacts/shots/tracks/catalunya/s7-final-esses__day.jpg)<br/>S7 final esses · day · dry | ![S7 broadcast compound · day · dry](../../../artifacts/shots/tracks/catalunya/s7-broadcast__day.jpg)<br/>S7 broadcast compound · day · dry | ![Mid-lap chase cam · day · dry](../../../artifacts/shots/tracks/catalunya/s7-midlap-chase__day.jpg)<br/>Mid-lap chase cam · day · dry |


## Panel grid — lighting variants (dry)

| | | |
| --- | --- | --- |
| ![S1 Tilke main grandstand · day · dry](../../../artifacts/shots/tracks/catalunya/s1-main-grandstand__day.jpg)<br/>S1 Tilke main grandstand · day · dry | ![S1 Tilke main grandstand · dusk · dry](../../../artifacts/shots/tracks/catalunya/s1-main-grandstand__dusk.jpg)<br/>S1 Tilke main grandstand · dusk · dry | ![S1 Tilke main grandstand · dawn · dry](../../../artifacts/shots/tracks/catalunya/s1-main-grandstand__dawn.jpg)<br/>S1 Tilke main grandstand · dawn · dry |
| ![S1 Tilke main grandstand · night · dry](../../../artifacts/shots/tracks/catalunya/s1-main-grandstand__night.jpg)<br/>S1 Tilke main grandstand · night · dry | ![S1 pit terrace · day · dry](../../../artifacts/shots/tracks/catalunya/s1-pit-terrace__day.jpg)<br/>S1 pit terrace · day · dry | ![S1 pit terrace · dusk · dry](../../../artifacts/shots/tracks/catalunya/s1-pit-terrace__dusk.jpg)<br/>S1 pit terrace · dusk · dry |
| ![S1 pit terrace · night · dry](../../../artifacts/shots/tracks/catalunya/s1-pit-terrace__night.jpg)<br/>S1 pit terrace · night · dry | ![S2 T1 Elf (trackside) · day · dry](../../../artifacts/shots/tracks/catalunya/s2-t1-elf__day.jpg)<br/>S2 T1 Elf (trackside) · day · dry | ![S2 T1 Elf (trackside) · dusk · dry](../../../artifacts/shots/tracks/catalunya/s2-t1-elf__dusk.jpg)<br/>S2 T1 Elf (trackside) · dusk · dry |
| ![S2 T1 Elf (trackside) · night · dry](../../../artifacts/shots/tracks/catalunya/s2-t1-elf__night.jpg)<br/>S2 T1 Elf (trackside) · night · dry | ![S5 Campsa crest · day · dry](../../../artifacts/shots/tracks/catalunya/s5-campsa-crest__day.jpg)<br/>S5 Campsa crest · day · dry | ![S5 Campsa crest · dusk · dry](../../../artifacts/shots/tracks/catalunya/s5-campsa-crest__dusk.jpg)<br/>S5 Campsa crest · dusk · dry |
| ![S5 Campsa crest · night · dry](../../../artifacts/shots/tracks/catalunya/s5-campsa-crest__night.jpg)<br/>S5 Campsa crest · night · dry | ![S6 La Caixa hairpin · day · dry](../../../artifacts/shots/tracks/catalunya/s6-la-caixa__day.jpg)<br/>S6 La Caixa hairpin · day · dry | ![S6 La Caixa hairpin · dusk · dry](../../../artifacts/shots/tracks/catalunya/s6-la-caixa__dusk.jpg)<br/>S6 La Caixa hairpin · dusk · dry |
| ![S6 La Caixa hairpin · dawn · dry](../../../artifacts/shots/tracks/catalunya/s6-la-caixa__dawn.jpg)<br/>S6 La Caixa hairpin · dawn · dry | ![S6 La Caixa hairpin · night · dry](../../../artifacts/shots/tracks/catalunya/s6-la-caixa__night.jpg)<br/>S6 La Caixa hairpin · night · dry | ![S7 final esses · day · dry](../../../artifacts/shots/tracks/catalunya/s7-final-esses__day.jpg)<br/>S7 final esses · day · dry |
| ![S7 final esses · dusk · dry](../../../artifacts/shots/tracks/catalunya/s7-final-esses__dusk.jpg)<br/>S7 final esses · dusk · dry | ![S7 final esses · night · dry](../../../artifacts/shots/tracks/catalunya/s7-final-esses__night.jpg)<br/>S7 final esses · night · dry |  |


## Verification

```text
node tools/track/verify-track.cjs catalunya
node tools/track/audit-circuit.cjs catalunya
```
