# Interlagos — circuit survey (2026-10-15)

Autódromo José Carlos Pace (`interlagos`). **36** JPEG survey frames on branch `cursor/interlagos-survey-fixes-8dee`. Brief: [`docs/tracks/interlagos.md`](../interlagos.md).

## Code map

| Piece | Path |
| --- | --- |
| Circuit def | `js/circuits/interlagos.js` |
| Scenery | `js/circuits/scenery/interlagos.js` |
| Landmarks | `tests/data/landmarks/interlagos.json` |

## Audits

`node tools/track/verify-track.cjs interlagos` · `node tools/track/audit-circuit.cjs interlagos`

## Fixes (this branch)

Junção arquibancada **0.7414**; Subida foliage exclusion **s 0.80–0.90**; arquibancada rail spacing.

## Screenshots (36)

Captured with `node tools/shot/shot.mjs` (`--jpeg --present-timeout 90 --capture-retries 4 --wait 120`, SwiftShader).

### Dry · day — full lap (18)

| | | |
| --- | --- | --- |
| ![S1 favela hillside orbit](../../../artifacts/shots/tracks/interlagos/dry-day_s1-favela.jpg)<br>**View:** S1 favela hillside orbit<br>**Weather:** dry · **ToD:** day | ![S1 pit / start–finish orbit](../../../artifacts/shots/tracks/interlagos/dry-day_s1-pit.jpg)<br>**View:** S1 pit / start–finish orbit<br>**Weather:** dry · **ToD:** day | ![S1 Senna S trackside](../../../artifacts/shots/tracks/interlagos/dry-day_s1-senna.jpg)<br>**View:** S1 Senna S trackside<br>**Weather:** dry · **ToD:** day |
| ![S2 Guarapiranga orbit](../../../artifacts/shots/tracks/interlagos/dry-day_s2-lake.jpg)<br>**View:** S2 Guarapiranga orbit<br>**Weather:** dry · **ToD:** day | ![S2 Reta Oposta park](../../../artifacts/shots/tracks/interlagos/dry-day_s2-reta.jpg)<br>**View:** S2 Reta Oposta park<br>**Weather:** dry · **ToD:** day | ![S2 São Paulo skyline orbit](../../../artifacts/shots/tracks/interlagos/dry-day_s2-skyline.jpg)<br>**View:** S2 São Paulo skyline orbit<br>**Weather:** dry · **ToD:** day |
| ![S3 Arquibancadas orbit](../../../artifacts/shots/tracks/interlagos/dry-day_s3-arq.jpg)<br>**View:** S3 Arquibancadas orbit<br>**Weather:** dry · **ToD:** day | ![S3 Ferradura trackside](../../../artifacts/shots/tracks/interlagos/dry-day_s3-ferradura.jpg)<br>**View:** S3 Ferradura trackside<br>**Weather:** dry · **ToD:** day | ![S3 Junção trackside](../../../artifacts/shots/tracks/interlagos/dry-day_s3-juncao.jpg)<br>**View:** S3 Junção trackside<br>**Weather:** dry · **ToD:** day |
| ![Mid-lap overview orbit](../../../artifacts/shots/tracks/interlagos/dry-midday_overview.jpg)<br>**View:** Mid-lap overview orbit<br>**Weather:** dry · **ToD:** day | ![S1 Curva 1 orbit](../../../artifacts/shots/tracks/interlagos/dry-midday_s1-curva1.jpg)<br>**View:** S1 Curva 1 orbit<br>**Weather:** dry · **ToD:** day | ![S1 favela wide orbit](../../../artifacts/shots/tracks/interlagos/dry-midday_s1-favela-wide.jpg)<br>**View:** S1 favela wide orbit<br>**Weather:** dry · **ToD:** day |
| ![S1 pit gantry cinematic](../../../artifacts/shots/tracks/interlagos/dry-midday_s1-pit-gantry.jpg)<br>**View:** S1 pit gantry cinematic<br>**Weather:** dry · **ToD:** day | ![S1 Curva do Sol park](../../../artifacts/shots/tracks/interlagos/dry-midday_s1-sol.jpg)<br>**View:** S1 Curva do Sol park<br>**Weather:** dry · **ToD:** day | ![S2 lake wide orbit](../../../artifacts/shots/tracks/interlagos/dry-midday_s2-lake-wide.jpg)<br>**View:** S2 lake wide orbit<br>**Weather:** dry · **ToD:** day |
| ![S2 Reta Oposta trackside](../../../artifacts/shots/tracks/interlagos/dry-midday_s2-reta-ts.jpg)<br>**View:** S2 Reta Oposta trackside<br>**Weather:** dry · **ToD:** day | ![S3 Bico de Pato park](../../../artifacts/shots/tracks/interlagos/dry-midday_s3-bico.jpg)<br>**View:** S3 Bico de Pato park<br>**Weather:** dry · **ToD:** day | ![S3 Subida dos Boxes park](../../../artifacts/shots/tracks/interlagos/dry-midday_s3-subida.jpg)<br>**View:** S3 Subida dos Boxes park<br>**Weather:** dry · **ToD:** day |


### Hero views — weather & lighting (18)

| | | |
| --- | --- | --- |
| ![S1 pit / start–finish orbit](../../../artifacts/shots/tracks/interlagos/dry-dawn_s1-pit.jpg)<br>**View:** S1 pit / start–finish orbit<br>**Weather:** dry · **ToD:** dawn | ![S1 pit / start–finish orbit](../../../artifacts/shots/tracks/interlagos/dry-dusk_s1-pit.jpg)<br>**View:** S1 pit / start–finish orbit<br>**Weather:** dry · **ToD:** dusk | ![S1 Senna S trackside](../../../artifacts/shots/tracks/interlagos/dry-dusk_s1-senna.jpg)<br>**View:** S1 Senna S trackside<br>**Weather:** dry · **ToD:** dusk |
| ![S1 pit / start–finish orbit](../../../artifacts/shots/tracks/interlagos/dry-night_s1-pit.jpg)<br>**View:** S1 pit / start–finish orbit<br>**Weather:** dry · **ToD:** night | ![S1 Senna S trackside](../../../artifacts/shots/tracks/interlagos/dry-night_s1-senna.jpg)<br>**View:** S1 Senna S trackside<br>**Weather:** dry · **ToD:** night | ![S2 Guarapiranga orbit](../../../artifacts/shots/tracks/interlagos/dry-night_s2-lake.jpg)<br>**View:** S2 Guarapiranga orbit<br>**Weather:** dry · **ToD:** night |
| ![S3 Arquibancadas orbit](../../../artifacts/shots/tracks/interlagos/dry-night_s3-arq.jpg)<br>**View:** S3 Arquibancadas orbit<br>**Weather:** dry · **ToD:** night | ![S1 Senna S trackside](../../../artifacts/shots/tracks/interlagos/fog-day_s1-senna.jpg)<br>**View:** S1 Senna S trackside<br>**Weather:** fog · **ToD:** day | ![S2 Guarapiranga orbit](../../../artifacts/shots/tracks/interlagos/fog-day_s2-lake.jpg)<br>**View:** S2 Guarapiranga orbit<br>**Weather:** fog · **ToD:** day |
| ![S1 Senna S trackside](../../../artifacts/shots/tracks/interlagos/overcast-day_s1-senna.jpg)<br>**View:** S1 Senna S trackside<br>**Weather:** overcast · **ToD:** day | ![S3 Junção trackside](../../../artifacts/shots/tracks/interlagos/overcast-day_s3-juncao.jpg)<br>**View:** S3 Junção trackside<br>**Weather:** overcast · **ToD:** day | ![S1 Senna S trackside](../../../artifacts/shots/tracks/interlagos/rain-day_s1-senna.jpg)<br>**View:** S1 Senna S trackside<br>**Weather:** rain · **ToD:** day |
| ![S2 Guarapiranga orbit](../../../artifacts/shots/tracks/interlagos/rain-day_s2-lake.jpg)<br>**View:** S2 Guarapiranga orbit<br>**Weather:** rain · **ToD:** day | ![S3 Junção trackside](../../../artifacts/shots/tracks/interlagos/rain-day_s3-juncao.jpg)<br>**View:** S3 Junção trackside<br>**Weather:** rain · **ToD:** day | ![S1 Senna S trackside](../../../artifacts/shots/tracks/interlagos/storm-day_s1-senna.jpg)<br>**View:** S1 Senna S trackside<br>**Weather:** storm · **ToD:** day |
| ![S3 Arquibancadas orbit](../../../artifacts/shots/tracks/interlagos/storm-day_s3-arq.jpg)<br>**View:** S3 Arquibancadas orbit<br>**Weather:** storm · **ToD:** day | ![S1 Senna S trackside](../../../artifacts/shots/tracks/interlagos/wet-day_s1-senna.jpg)<br>**View:** S1 Senna S trackside<br>**Weather:** wet · **ToD:** day | ![S2 Guarapiranga orbit](../../../artifacts/shots/tracks/interlagos/wet-day_s2-lake.jpg)<br>**View:** S2 Guarapiranga orbit<br>**Weather:** wet · **ToD:** day |


