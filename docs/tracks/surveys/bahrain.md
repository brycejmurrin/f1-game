# Bahrain International Circuit — scenery survey (2026-10-14)

**Circuit id:** `bahrain` · **Theme:** `desert` · **Night GP:** yes  
**Live:** https://brycejmurrin.github.io/f1-game/ · **Brief:** `docs/tracks/bahrain.md`

## Capture status

| Item | Detail |
|------|--------|
| **Committed shots** | **34** JPEGs under `artifacts/shots/tracks/bahrain/` (`git add -f`) — night sector pass + day/dawn/dusk on six hero views + wet/rain/overcast/fog on four landmarks |
| **Capture** | Rebased on shared shot tooling (#1862): `shot.mjs --batch capture-jobs.jsonl --jpeg --present-timeout 90 --capture-retries 4 --wait 120` (SwiftShader / TLX default; no `APEX_GL=llvmpipe`) |

## Code map

| Layer | Path |
|--------|------|
| Def | `js/circuits/bahrain.js` |
| Scenery | `js/circuits/scenery/bahrain.js` |
| Landmarks | `tests/data/landmarks/bahrain.json` |

## Panel grids — all 34 committed shots

Relative paths from this file.

### Night · dry (sector pass)

| | | |
|:---:|:---:|:---:|
| ![S1 chase](../../../artifacts/shots/tracks/bahrain/s1-pit-chase-night-dry.jpg) **S1 chase** · dry · night | ![S1 pit straight](../../../artifacts/shots/tracks/bahrain/s1-pit-straight-night-dry.jpg) **S1 pit straight** · dry · night | ![S1 Sakhir Tower](../../../artifacts/shots/tracks/bahrain/s1-sakhir-tower-night-dry.jpg) **S1 Sakhir Tower** · dry · night |

| | | |
|:---:|:---:|:---:|
| ![S1 T1](../../../artifacts/shots/tracks/bahrain/s1-t1-schumacher-night-dry.jpg) **S1 T1** · dry · night | ![S2 T4](../../../artifacts/shots/tracks/bahrain/s2-t4-university-night-dry.jpg) **S2 T4** · dry · night | ![S2 sweep](../../../artifacts/shots/tracks/bahrain/s2-t567-sweep-night-dry.jpg) **S2 sweep** · dry · night |

| | | |
|:---:|:---:|:---:|
| ![S2 T8](../../../artifacts/shots/tracks/bahrain/s2-t8-hairpin-night-dry.jpg) **S2 T8** · dry · night | ![S3 final](../../../artifacts/shots/tracks/bahrain/s3-final-corner-night-dry.jpg) **S3 final** · dry · night | ![S3 midfield](../../../artifacts/shots/tracks/bahrain/s3-midfield-dunes-night-dry.jpg) **S3 midfield** · dry · night |

| | | |
|:---:|:---:|:---:|
| ![S3 T10](../../../artifacts/shots/tracks/bahrain/s3-t10-beyon-night-dry.jpg) **S3 T10** · dry · night |  |  |


### Day · dry

| | | |
|:---:|:---:|:---:|
| ![S1 pit straight](../../../artifacts/shots/tracks/bahrain/s1-pit-straight-day-dry.jpg) **S1 pit straight** · dry · day | ![S1 Sakhir Tower](../../../artifacts/shots/tracks/bahrain/s1-sakhir-tower-day-dry.jpg) **S1 Sakhir Tower** · dry · day | ![S1 T1](../../../artifacts/shots/tracks/bahrain/s1-t1-schumacher-day-dry.jpg) **S1 T1** · dry · day |

| | | |
|:---:|:---:|:---:|
| ![S2 T4](../../../artifacts/shots/tracks/bahrain/s2-t4-university-day-dry.jpg) **S2 T4** · dry · day | ![S2 sweep](../../../artifacts/shots/tracks/bahrain/s2-t567-sweep-day-dry.jpg) **S2 sweep** · dry · day | ![S2 T8](../../../artifacts/shots/tracks/bahrain/s2-t8-hairpin-day-dry.jpg) **S2 T8** · dry · day |

| | | |
|:---:|:---:|:---:|
| ![S3 final](../../../artifacts/shots/tracks/bahrain/s3-final-corner-day-dry.jpg) **S3 final** · dry · day | ![S3 T10](../../../artifacts/shots/tracks/bahrain/s3-t10-beyon-day-dry.jpg) **S3 T10** · dry · day |  |


### Dawn · dry

| | | |
|:---:|:---:|:---:|
| ![S1 pit straight](../../../artifacts/shots/tracks/bahrain/s1-pit-straight-dawn-dry.jpg) **S1 pit straight** · dry · dawn | ![S1 T1](../../../artifacts/shots/tracks/bahrain/s1-t1-schumacher-dawn-dry.jpg) **S1 T1** · dry · dawn | ![S2 T4](../../../artifacts/shots/tracks/bahrain/s2-t4-university-dawn-dry.jpg) **S2 T4** · dry · dawn |

| | | |
|:---:|:---:|:---:|
| ![S2 sweep](../../../artifacts/shots/tracks/bahrain/s2-t567-sweep-dawn-dry.jpg) **S2 sweep** · dry · dawn | ![S2 T8](../../../artifacts/shots/tracks/bahrain/s2-t8-hairpin-dawn-dry.jpg) **S2 T8** · dry · dawn | ![S3 T10](../../../artifacts/shots/tracks/bahrain/s3-t10-beyon-dawn-dry.jpg) **S3 T10** · dry · dawn |


### Dusk · dry

| | | |
|:---:|:---:|:---:|
| ![S1 pit straight](../../../artifacts/shots/tracks/bahrain/s1-pit-straight-dusk-dry.jpg) **S1 pit straight** · dry · dusk | ![S1 T1](../../../artifacts/shots/tracks/bahrain/s1-t1-schumacher-dusk-dry.jpg) **S1 T1** · dry · dusk | ![S2 T4](../../../artifacts/shots/tracks/bahrain/s2-t4-university-dusk-dry.jpg) **S2 T4** · dry · dusk |

| | | |
|:---:|:---:|:---:|
| ![S2 sweep](../../../artifacts/shots/tracks/bahrain/s2-t567-sweep-dusk-dry.jpg) **S2 sweep** · dry · dusk | ![S2 T8](../../../artifacts/shots/tracks/bahrain/s2-t8-hairpin-dusk-dry.jpg) **S2 T8** · dry · dusk | ![S3 T10](../../../artifacts/shots/tracks/bahrain/s3-t10-beyon-dusk-dry.jpg) **S3 T10** · dry · dusk |


### Weather variants (day)

| | | |
|:---:|:---:|:---:|
| ![S1 pit straight](../../../artifacts/shots/tracks/bahrain/s1-pit-straight-day-wet.jpg) **S1 pit straight** · wet · day | ![S1 T1](../../../artifacts/shots/tracks/bahrain/s1-t1-schumacher-day-rain.jpg) **S1 T1** · rain · day | ![S2 sweep](../../../artifacts/shots/tracks/bahrain/s2-t567-sweep-day-overcast.jpg) **S2 sweep** · overcast · day |

| | | |
|:---:|:---:|:---:|
| ![S3 T10](../../../artifacts/shots/tracks/bahrain/s3-t10-beyon-day-fog.jpg) **S3 T10** · fog · day |  |  |


## Audit & fix (this branch)

- `duneWedge` → `terrainYAt` footing; `ground-audit` **unsupported 0**
- `verify-track` / `audit-circuit` OK; coplanar 1 at baseline (`groundPatch` midfield)

## Weather / lighting backlog

| ID | Condition | Notes |
|----|-----------|--------|
| W-L1 | Night dry (captured) | Floods + LED tower read well |
| W-L2 | Day / dusk / dawn | Not captured — mast emissive vs sky TBD |
| W-L3 | Wet / rain / overcast / fog | Deferred — shared batch `weather()` |

## Verify

```sh
node tools/track/verify-track.cjs bahrain
node tools/track/audit-circuit.cjs bahrain
```
