# Shanghai International Circuit — survey (2026-10-14)

**Circuit id:** `shanghai` · **Theme:** `modern` · **Live:** [f1-game Shanghai](https://brycejmurrin.github.io/f1-game/)  
**Captures:** 32 headless TLX JPEGs in `artifacts/shots/tracks/shanghai/` (weather **dry** throughout; time-of-day varies).  
**Weather matrix (wet / rain / overcast / fog):** deferred until shared shot-tooling PR lands (`wx` batch support).

## Code map

| Layer | Path | Role |
|-------|------|------|
| Circuit def | `js/circuits/shanghai.js` | OSM centreline, `sceneryStartFrac`, elevations, `bankZones`, palette, `dressingExclusions`. |
| Scenery | `js/circuits/scenery/shanghai.js` | Wings, stands, Yu lakes, snail runoff, lotus stand, Pudong, paddies, midfield, back straight. |
| Brief | `docs/tracks/shanghai.md` | Authoritative landmark + palette notes. |

## Sector panels — dry · day

### Sector 1 (racing s ≈ 0.00–0.32)

| | | |
|:---:|:---:|:---:|
| ![Pit straight orbit](../../../artifacts/shots/tracks/shanghai/s1-pit-day-orbit.jpg) | ![Start gantry eye](../../../artifacts/shots/tracks/shanghai/s1-grid-day-eye.jpg) | ![Lotus stand orbit](../../../artifacts/shots/tracks/shanghai/s1-lotus-day-orbit.jpg) |
| **View:** orbit · s≈0.00 pit/wings · **Wx:** dry · **TOD:** day | **View:** eye · s≈0.004 grid · **Wx:** dry · **TOD:** day | **View:** orbit · s≈0.075 lotus stand · **Wx:** dry · **TOD:** day |
| ![T1 snail trackside](../../../artifacts/shots/tracks/shanghai/s1-snail-day-trackside.jpg) | ![Yu lakes orbit](../../../artifacts/shots/tracks/shanghai/s1-yu-day-orbit.jpg) | |
| **View:** trackside · s≈0.08 snail · **Wx:** dry · **TOD:** day | **View:** orbit · s≈0.02 Yu Garden · **Wx:** dry · **TOD:** day | |

### Sector 2 (s ≈ 0.32–0.68)

| | | |
|:---:|:---:|:---:|
| ![Midfield orbit](../../../artifacts/shots/tracks/shanghai/s2-infield-day-orbit.jpg) | ![Mid stands eye](../../../artifacts/shots/tracks/shanghai/s2-stands-day-eye.jpg) | ![Arena bridge trackside](../../../artifacts/shots/tracks/shanghai/s2-bridge-day-trackside.jpg) |
| **View:** orbit · s≈0.35 infield · **Wx:** dry · **TOD:** day | **View:** eye · s≈0.45 stands · **Wx:** dry · **TOD:** day | **View:** trackside · s≈0.472 bridge · **Wx:** dry · **TOD:** day |
| ![Pudong orbit](../../../artifacts/shots/tracks/shanghai/s2-pudong-day-orbit.jpg) | ![Marsh eye](../../../artifacts/shots/tracks/shanghai/s2-marsh-day-eye.jpg) | |
| **View:** orbit · s≈0.30 Pudong · **Wx:** dry · **TOD:** day | **View:** eye · s≈0.62 marsh · **Wx:** dry · **TOD:** day | |

### Sector 3 (s ≈ 0.68–1.00)

| | | |
|:---:|:---:|:---:|
| ![Back straight orbit](../../../artifacts/shots/tracks/shanghai/s3-straight-day-orbit.jpg) | ![Hairpin trackside](../../../artifacts/shots/tracks/shanghai/s3-hairpin-day-trackside.jpg) | ![Pit entry eye](../../../artifacts/shots/tracks/shanghai/s3-pit-in-day-eye.jpg) |
| **View:** orbit · s≈0.78 straight · **Wx:** dry · **TOD:** day | **View:** trackside · s≈0.90 T14 · **Wx:** dry · **TOD:** day | **View:** eye · s≈0.96 pit in · **Wx:** dry · **TOD:** day |

## Time-of-day panels — dry weather

### Pit straight (s≈0.00)

| | | |
|:---:|:---:|:---:|
| ![Pit dawn orbit](../../../artifacts/shots/tracks/shanghai/tod-pit-dawn-orbit.jpg) | ![Pit dusk orbit](../../../artifacts/shots/tracks/shanghai/tod-pit-dusk-orbit.jpg) | ![Pit night cinematic](../../../artifacts/shots/tracks/shanghai/tod-pit-night-cinematic.jpg) |
| **View:** orbit · **Wx:** dry · **TOD:** dawn | **View:** orbit · **Wx:** dry · **TOD:** dusk | **View:** cinematic · **Wx:** dry · **TOD:** night |

### Lotus stand (s≈0.075)

| | | |
|:---:|:---:|:---:|
| ![Lotus dawn](../../../artifacts/shots/tracks/shanghai/tod-lotus-dawn-orbit.jpg) | ![Lotus dusk](../../../artifacts/shots/tracks/shanghai/tod-lotus-dusk-orbit.jpg) | ![Lotus night](../../../artifacts/shots/tracks/shanghai/tod-lotus-night-orbit.jpg) |
| **View:** orbit · **Wx:** dry · **TOD:** dawn | **View:** orbit · **Wx:** dry · **TOD:** dusk | **View:** orbit · **Wx:** dry · **TOD:** night |

### Arena bridge (s≈0.472)

| | | |
|:---:|:---:|:---:|
| ![Bridge dawn](../../../artifacts/shots/tracks/shanghai/tod-bridge-dawn-trackside.jpg) | ![Bridge dusk](../../../artifacts/shots/tracks/shanghai/tod-bridge-dusk-trackside.jpg) | ![Bridge night](../../../artifacts/shots/tracks/shanghai/tod-bridge-night-trackside.jpg) |
| **View:** trackside · **Wx:** dry · **TOD:** dawn | **View:** trackside · **Wx:** dry · **TOD:** dusk | **View:** trackside · **Wx:** dry · **TOD:** night |

### T14 hairpin (s≈0.90)

| | | |
|:---:|:---:|:---:|
| ![Hairpin dawn](../../../artifacts/shots/tracks/shanghai/tod-hairpin-dawn-trackside.jpg) | ![Hairpin dusk](../../../artifacts/shots/tracks/shanghai/tod-hairpin-dusk-trackside.jpg) | ![Hairpin night](../../../artifacts/shots/tracks/shanghai/tod-hairpin-night-trackside.jpg) |
| **View:** trackside · **Wx:** dry · **TOD:** dawn | **View:** trackside · **Wx:** dry · **TOD:** dusk | **View:** trackside · **Wx:** dry · **TOD:** night |

### Pudong backdrop (s≈0.30)

| | | |
|:---:|:---:|:---:|
| ![Pudong dawn](../../../artifacts/shots/tracks/shanghai/tod-pudong-dawn-orbit.jpg) | ![Pudong dusk](../../../artifacts/shots/tracks/shanghai/tod-pudong-dusk-orbit.jpg) | ![Pudong night](../../../artifacts/shots/tracks/shanghai/tod-pudong-night-orbit.jpg) |
| **View:** orbit · **Wx:** dry · **TOD:** dawn | **View:** orbit · **Wx:** dry · **TOD:** dusk | **View:** orbit · **Wx:** dry · **TOD:** night |

### Additional TOD

| | | |
|:---:|:---:|:---:|
| ![Straight dusk cinematic](../../../artifacts/shots/tracks/shanghai/tod-straight-dusk-cinematic.jpg) | ![Straight night cinematic](../../../artifacts/shots/tracks/shanghai/tod-straight-night-cinematic.jpg) | ![Snail dusk eye](../../../artifacts/shots/tracks/shanghai/tod-snail-dusk-eye.jpg) |
| **View:** cinematic · s≈0.78 · **Wx:** dry · **TOD:** dusk | **View:** cinematic · s≈0.78 · **Wx:** dry · **TOD:** night | **View:** eye · s≈0.08 · **Wx:** dry · **TOD:** dusk |
| ![Mid night orbit](../../../artifacts/shots/tracks/shanghai/tod-mid-night-orbit.jpg) | | |
| **View:** orbit · s≈0.45 · **Wx:** dry · **TOD:** night | | |

## Findings (summary)

- **Surface fold** at node 702 (def/banking; not scenery-only).
- **Night:** wing/lotus/bridge areas need lamp fill (`tod-pit-night-cinematic.jpg`, `tod-lotus-night-orbit.jpg`).
- **Clip:** scenery dedupe improved severe spots; two engine `city.js` pairs remain @ s≈0.12 and 0.56.
- **Follow-up:** wet/rain/overcast/fog panels after shared `wx` shot batch lands.

## Verification

```sh
node tools/track/verify-track.cjs shanghai
node tools/track/audit-circuit.cjs shanghai
```
