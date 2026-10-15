# Catalunya — circuit survey (2026-10-15)

**Circuit id:** `catalunya` · **Shots:** 36 JPEGs in `artifacts/shots/tracks/catalunya/` (≤1280 px, q≈80, ≤300 KB).

**Data:** `js/circuits/catalunya.js` · **Scenery:** `js/circuits/scenery/catalunya.js` · **Brief:** `docs/tracks/catalunya.md`

Captures: `node tools/shot/shot.mjs --batch scratch/catalunya-weather-batch.json --jpeg --present-timeout 90 --capture-retries 4 --wait 120` (SwiftShader, no `APEX_GL=llvmpipe`).

---

## Findings (summary)

| Item | Status |
|------|--------|
| La Caixa / final terrace prop clip | Fixed in scenery |
| Flood-mast night lamps | Fixed (default lamp registration) |
| Weather panels | **36 frames** — wet / rain / overcast / fog / storm on six hero views; dusk / night on three heroes |

---

## Sector anchors (day · dry)

| | | |
| --- | --- | --- |
| ![S1 main straight · day · dry](../../../artifacts/shots/tracks/catalunya/s1-main-straight__day__dry.jpg)<br/>S1 main straight · day · dry | ![S1 Tilke main grandstand · day · dry](../../../artifacts/shots/tracks/catalunya/s1-main-grandstand__day__dry.jpg)<br/>S1 Tilke main grandstand · day · dry | ![S2 T1 Elf · day · dry](../../../artifacts/shots/tracks/catalunya/s2-t1-elf__day__dry.jpg)<br/>S2 T1 Elf · day · dry |
| ![S6 La Caixa hairpin · day · dry](../../../artifacts/shots/tracks/catalunya/s6-la-caixa__day__dry.jpg)<br/>S6 La Caixa hairpin · day · dry |  |  |


## Hero weather & lighting (32 frames)

| | | |
| --- | --- | --- |
| ![S1 Tilke main grandstand · day · fog](../../../artifacts/shots/tracks/catalunya/s1-main-grandstand__day__fog.jpg)<br/>S1 Tilke main grandstand · day · fog | ![S1 Tilke main grandstand · day · overcast](../../../artifacts/shots/tracks/catalunya/s1-main-grandstand__day__overcast.jpg)<br/>S1 Tilke main grandstand · day · overcast | ![S1 Tilke main grandstand · day · rain](../../../artifacts/shots/tracks/catalunya/s1-main-grandstand__day__rain.jpg)<br/>S1 Tilke main grandstand · day · rain |
| ![S1 Tilke main grandstand · day · storm](../../../artifacts/shots/tracks/catalunya/s1-main-grandstand__day__storm.jpg)<br/>S1 Tilke main grandstand · day · storm | ![S1 Tilke main grandstand · day · wet](../../../artifacts/shots/tracks/catalunya/s1-main-grandstand__day__wet.jpg)<br/>S1 Tilke main grandstand · day · wet | ![S1 Tilke main grandstand · dusk · dry](../../../artifacts/shots/tracks/catalunya/s1-main-grandstand__dusk__dry.jpg)<br/>S1 Tilke main grandstand · dusk · dry |
| ![S1 Tilke main grandstand · night · dry](../../../artifacts/shots/tracks/catalunya/s1-main-grandstand__night__dry.jpg)<br/>S1 Tilke main grandstand · night · dry | ![S1 pit terrace · day · fog](../../../artifacts/shots/tracks/catalunya/s1-pit-terrace__day__fog.jpg)<br/>S1 pit terrace · day · fog | ![S1 pit terrace · day · overcast](../../../artifacts/shots/tracks/catalunya/s1-pit-terrace__day__overcast.jpg)<br/>S1 pit terrace · day · overcast |
| ![S1 pit terrace · day · rain](../../../artifacts/shots/tracks/catalunya/s1-pit-terrace__day__rain.jpg)<br/>S1 pit terrace · day · rain | ![S1 pit terrace · day · storm](../../../artifacts/shots/tracks/catalunya/s1-pit-terrace__day__storm.jpg)<br/>S1 pit terrace · day · storm | ![S1 pit terrace · day · wet](../../../artifacts/shots/tracks/catalunya/s1-pit-terrace__day__wet.jpg)<br/>S1 pit terrace · day · wet |
| ![S1 pit terrace · dusk · dry](../../../artifacts/shots/tracks/catalunya/s1-pit-terrace__dusk__dry.jpg)<br/>S1 pit terrace · dusk · dry | ![S1 pit terrace · night · dry](../../../artifacts/shots/tracks/catalunya/s1-pit-terrace__night__dry.jpg)<br/>S1 pit terrace · night · dry | ![S2 T1 Elf · day · fog](../../../artifacts/shots/tracks/catalunya/s2-t1-elf__day__fog.jpg)<br/>S2 T1 Elf · day · fog |
| ![S2 T1 Elf · day · overcast](../../../artifacts/shots/tracks/catalunya/s2-t1-elf__day__overcast.jpg)<br/>S2 T1 Elf · day · overcast | ![S2 T1 Elf · day · rain](../../../artifacts/shots/tracks/catalunya/s2-t1-elf__day__rain.jpg)<br/>S2 T1 Elf · day · rain | ![S2 T1 Elf · day · wet](../../../artifacts/shots/tracks/catalunya/s2-t1-elf__day__wet.jpg)<br/>S2 T1 Elf · day · wet |
| ![S5 Campsa crest · day · fog](../../../artifacts/shots/tracks/catalunya/s5-campsa-crest__day__fog.jpg)<br/>S5 Campsa crest · day · fog | ![S5 Campsa crest · day · overcast](../../../artifacts/shots/tracks/catalunya/s5-campsa-crest__day__overcast.jpg)<br/>S5 Campsa crest · day · overcast | ![S5 Campsa crest · day · rain](../../../artifacts/shots/tracks/catalunya/s5-campsa-crest__day__rain.jpg)<br/>S5 Campsa crest · day · rain |
| ![S5 Campsa crest · day · wet](../../../artifacts/shots/tracks/catalunya/s5-campsa-crest__day__wet.jpg)<br/>S5 Campsa crest · day · wet | ![S6 La Caixa hairpin · day · fog](../../../artifacts/shots/tracks/catalunya/s6-la-caixa__day__fog.jpg)<br/>S6 La Caixa hairpin · day · fog | ![S6 La Caixa hairpin · day · overcast](../../../artifacts/shots/tracks/catalunya/s6-la-caixa__day__overcast.jpg)<br/>S6 La Caixa hairpin · day · overcast |
| ![S6 La Caixa hairpin · day · rain](../../../artifacts/shots/tracks/catalunya/s6-la-caixa__day__rain.jpg)<br/>S6 La Caixa hairpin · day · rain | ![S6 La Caixa hairpin · day · wet](../../../artifacts/shots/tracks/catalunya/s6-la-caixa__day__wet.jpg)<br/>S6 La Caixa hairpin · day · wet | ![S6 La Caixa hairpin · dusk · dry](../../../artifacts/shots/tracks/catalunya/s6-la-caixa__dusk__dry.jpg)<br/>S6 La Caixa hairpin · dusk · dry |
| ![S6 La Caixa hairpin · night · dry](../../../artifacts/shots/tracks/catalunya/s6-la-caixa__night__dry.jpg)<br/>S6 La Caixa hairpin · night · dry | ![S7 final esses · day · fog](../../../artifacts/shots/tracks/catalunya/s7-final-esses__day__fog.jpg)<br/>S7 final esses · day · fog | ![S7 final esses · day · overcast](../../../artifacts/shots/tracks/catalunya/s7-final-esses__day__overcast.jpg)<br/>S7 final esses · day · overcast |
| ![S7 final esses · day · rain](../../../artifacts/shots/tracks/catalunya/s7-final-esses__day__rain.jpg)<br/>S7 final esses · day · rain | ![S7 final esses · day · wet](../../../artifacts/shots/tracks/catalunya/s7-final-esses__day__wet.jpg)<br/>S7 final esses · day · wet |  |


## Verification

```text
node tools/track/verify-track.cjs catalunya
node tools/track/audit-circuit.cjs catalunya
```
