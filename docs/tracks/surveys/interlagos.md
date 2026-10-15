# Interlagos — circuit survey (2026-10-14)

Autódromo José Carlos Pace (`interlagos`). Survey + low-risk dressing fixes. Reference brief: [`docs/tracks/interlagos.md`](../interlagos.md).

## Code map

| Piece | Path | Role |
| --- | --- | --- |
| Circuit def | `js/circuits/interlagos.js` | OSM centreline, `bankZones`, palette, `dressingExclusions`, sectors `[0.3, 0.65]` |
| Scenery closure | `js/circuits/scenery/interlagos.js` | Favela patches, hero `modelGroup` landmarks, stands, lake, SP bowl ring |
| Engine hook | `js/track/tracks.js` → `buildProps` | Lazy `TrackScenery.interlagos`; generic belts honour exclusions |
| Landmarks gate | `tests/data/landmarks/interlagos.json` | Required: Senna S, main tribuna, SP skyline, Guarapiranga + shore pier |
| Elevation | `js/track/circuit-elevations.js` | SRTM bake (~40 m peak–trough) |

## Theme and models

- **Theme:** `green` (subtropical); **`night: false`** on def.
- **Hero groups:** `interlagos-senna-s`, `interlagos-main-tribuna`, `interlagos-sp-skyline`, `interlagos-guarapiranga`, `interlagos-guarapiranga-shore`, `interlagos-favela-*`, arquibancada terraces.

## Audits

```sh
node tools/track/verify-track.cjs interlagos
node tools/track/audit-circuit.cjs interlagos
```

## Findings (summary)

- **Road:** 0 surface folds; min radius ~11.7 m.
- **S1:** Pit tribuna, Senna S terrace, favela hillside read well (dry midday).
- **S2:** Guarapiranga + shore pier; Reta Oposta; SP skyline cluster.
- **S3:** Ferradura at `bankZones` 0.4547; Junção terrace at **0.7414**; Arquibancadas on Subida.
- **Weather matrix:** deferred until shared shot tooling PR (`weather` + `tod` batch). This branch: **18 dry midday** frames only.
- **Backlog:** night flood pass (`furniture.lamp: "none"`); 2 coplanar terrace-rail pairs within baseline; support-graph-aware crowd-on-bench fix.

## Fixes (circuit files only)

1. Yellow/green arquibancada rails separated vertically (coplanar 3→2, within baseline).
2. `interlagos-arq-juncao` at **0.7414**.
3. Foliage exclusion **s 0.80–0.90** on Subida (generic conifer belt).

## Screenshots (18) — dry · day

JPEG q80, max width 1280 px, under `artifacts/shots/tracks/interlagos/`.

### Sector 1

| | | |
| --- | --- | --- |
| ![S1 pit · dry · day](../../../artifacts/shots/tracks/interlagos/dry-day_s1-pit.jpg)<br>**View:** pit / start–finish orbit<br>**Weather:** dry · **ToD:** day | ![S1 Senna · dry · day](../../../artifacts/shots/tracks/interlagos/dry-day_s1-senna.jpg)<br>**View:** Senna S trackside<br>**Weather:** dry · **ToD:** day | ![S1 favela · dry · day](../../../artifacts/shots/tracks/interlagos/dry-day_s1-favela.jpg)<br>**View:** favela hillside orbit<br>**Weather:** dry · **ToD:** day |
| ![S1 Curva 1 · dry · day](../../../artifacts/shots/tracks/interlagos/dry-midday_s1-curva1.jpg)<br>**View:** Curva 1 orbit<br>**Weather:** dry · **ToD:** day | ![S1 Curva do Sol · dry · day](../../../artifacts/shots/tracks/interlagos/dry-midday_s1-sol.jpg)<br>**View:** Curva do Sol park<br>**Weather:** dry · **ToD:** day | ![S1 favela wide · dry · day](../../../artifacts/shots/tracks/interlagos/dry-midday_s1-favela-wide.jpg)<br>**View:** favela wide orbit<br>**Weather:** dry · **ToD:** day |
| ![S1 pit gantry · dry · day](../../../artifacts/shots/tracks/interlagos/dry-midday_s1-pit-gantry.jpg)<br>**View:** pit gantry cinematic<br>**Weather:** dry · **ToD:** day | | |

### Sector 2

| | | |
| --- | --- | --- |
| ![S2 Reta · dry · day](../../../artifacts/shots/tracks/interlagos/dry-day_s2-reta.jpg)<br>**View:** Reta Oposta park<br>**Weather:** dry · **ToD:** day | ![S2 lake · dry · day](../../../artifacts/shots/tracks/interlagos/dry-day_s2-lake.jpg)<br>**View:** Guarapiranga orbit<br>**Weather:** dry · **ToD:** day | ![S2 skyline · dry · day](../../../artifacts/shots/tracks/interlagos/dry-day_s2-skyline.jpg)<br>**View:** SP skyline orbit<br>**Weather:** dry · **ToD:** day |
| ![S2 Reta TS · dry · day](../../../artifacts/shots/tracks/interlagos/dry-midday_s2-reta-ts.jpg)<br>**View:** Reta Oposta trackside<br>**Weather:** dry · **ToD:** day | ![S2 lake wide · dry · day](../../../artifacts/shots/tracks/interlagos/dry-midday_s2-lake-wide.jpg)<br>**View:** lake wide orbit<br>**Weather:** dry · **ToD:** day | ![Overview · dry · day](../../../artifacts/shots/tracks/interlagos/dry-midday_overview.jpg)<br>**View:** mid-lap overview orbit<br>**Weather:** dry · **ToD:** day |

### Sector 3

| | | |
| --- | --- | --- |
| ![S3 Ferradura · dry · day](../../../artifacts/shots/tracks/interlagos/dry-day_s3-ferradura.jpg)<br>**View:** Ferradura trackside<br>**Weather:** dry · **ToD:** day | ![S3 Junção · dry · day](../../../artifacts/shots/tracks/interlagos/dry-day_s3-juncao.jpg)<br>**View:** Junção trackside<br>**Weather:** dry · **ToD:** day | ![S3 Arq · dry · day](../../../artifacts/shots/tracks/interlagos/dry-day_s3-arq.jpg)<br>**View:** Arquibancadas orbit<br>**Weather:** dry · **ToD:** day |
| ![S3 Bico · dry · day](../../../artifacts/shots/tracks/interlagos/dry-midday_s3-bico.jpg)<br>**View:** Bico de Pato park<br>**Weather:** dry · **ToD:** day | ![S3 Subida · dry · day](../../../artifacts/shots/tracks/interlagos/dry-midday_s3-subida.jpg)<br>**View:** Subida dos Boxes park<br>**Weather:** dry · **ToD:** day | |
