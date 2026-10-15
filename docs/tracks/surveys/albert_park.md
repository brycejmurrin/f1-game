# Albert Park — scenery survey (2026-10-15)

Circuit pair only: `js/circuits/albert_park.js`, `js/circuits/scenery/albert_park.js`.

**36 survey JPEGs** in `artifacts/shots/tracks/albert_park/` (1280px, q≈80, &lt;300 KB). Captured with shared `shot.mjs` (`--weather`, `--tod`, `--jpeg`, `--present-timeout 90`, `--capture-retries 4`, SwiftShader default).

## Audit

| Check | Result |
|-------|--------|
| `verify-track` | OK |
| float | 0 |
| ground buried | 1 (shared jersey post sink) |
| clip severe | 1 @ baseline cap |

## Fixes on branch

- Greener `pal.runoff`; boathouse ramp +0.06 m (buried 3→1).

## Weather / lighting notes

| Issue | Panels | Notes |
|-------|--------|-------|
| Park lamp masts are mesh-only at **night** | `*__night-dry` | Hand `addCyl`/`addBox` lamps; no `lampPost()` flood emit |
| **Fog** + low `pal.fogDensity` | `*__day-fog` | Engine fog dominates; circuit haze stays light |
| **Storm** rain streaks | `*__day-storm` | Arc wetness + particles; road sheen OK |
| Chicane grandstand clip | `s11-chicane__day-dry` | At fleet baseline; not circuit-only fix |

---

## Track picker

| | | |
|:---:|:---:|:---:|
| ![picker](../../../artifacts/shots/tracks/albert_park/picker-track-card.jpg)<br>**view:** picker · **weather:** dry · **tod:** day | | |

---

## Reference sectors — dry · day

| | | |
|:---:|:---:|:---:|
| ![MSAC](../../../artifacts/shots/tracks/albert_park/s03-msac__day-dry.jpg)<br>**view:** MSAC orbit · **weather:** dry · **tod:** day | ![Lake/CBD](../../../artifacts/shots/tracks/albert_park/s07-lake-cbd__day-dry.jpg)<br>**view:** lake/CBD orbit · **weather:** dry · **tod:** day | ![Stadium](../../../artifacts/shots/tracks/albert_park/s09-stadium__day-dry.jpg)<br>**view:** Lakeside Stadium · **weather:** dry · **tod:** day |
| ![Chicane](../../../artifacts/shots/tracks/albert_park/s11-chicane__day-dry.jpg)<br>**view:** chicane orbit · **weather:** dry · **tod:** day | | |

---

## Hero — S/F (`s00-sf`) orbit

| | | |
|:---:|:---:|:---:|
| ![day dry](../../../artifacts/shots/tracks/albert_park/s00-sf__day-dry.jpg)<br>**view:** S/F orbit · **weather:** dry · **tod:** day | ![day wet](../../../artifacts/shots/tracks/albert_park/s00-sf__day-wet.jpg)<br>**view:** S/F orbit · **weather:** wet · **tod:** day | ![day rain](../../../artifacts/shots/tracks/albert_park/s00-sf__day-rain.jpg)<br>**view:** S/F orbit · **weather:** rain · **tod:** day |
| ![day overcast](../../../artifacts/shots/tracks/albert_park/s00-sf__day-overcast.jpg)<br>**view:** S/F orbit · **weather:** overcast · **tod:** day | ![day fog](../../../artifacts/shots/tracks/albert_park/s00-sf__day-fog.jpg)<br>**view:** S/F orbit · **weather:** fog · **tod:** day | ![day storm](../../../artifacts/shots/tracks/albert_park/s00-sf__day-storm.jpg)<br>**view:** S/F orbit · **weather:** storm · **tod:** day |
| ![dawn dry](../../../artifacts/shots/tracks/albert_park/s00-sf__dawn-dry.jpg)<br>**view:** S/F orbit · **weather:** dry · **tod:** dawn | ![dusk dry](../../../artifacts/shots/tracks/albert_park/s00-sf__dusk-dry.jpg)<br>**view:** S/F orbit · **weather:** dry · **tod:** dusk | ![night dry](../../../artifacts/shots/tracks/albert_park/s00-sf__night-dry.jpg)<br>**view:** S/F orbit · **weather:** dry · **tod:** night |

---

## Hero — Lake / CBD (`s07-lake-cbd`) orbit

| | | |
|:---:|:---:|:---:|
| ![day dry](../../../artifacts/shots/tracks/albert_park/s07-lake-cbd__day-dry.jpg)<br>**view:** lake/CBD orbit · **weather:** dry · **tod:** day | ![day wet](../../../artifacts/shots/tracks/albert_park/s07-lake-cbd__day-wet.jpg)<br>**view:** lake/CBD orbit · **weather:** wet · **tod:** day | ![day rain](../../../artifacts/shots/tracks/albert_park/s07-lake-cbd__day-rain.jpg)<br>**view:** lake/CBD orbit · **weather:** rain · **tod:** day |
| ![day overcast](../../../artifacts/shots/tracks/albert_park/s07-lake-cbd__day-overcast.jpg)<br>**view:** lake/CBD orbit · **weather:** overcast · **tod:** day | ![day fog](../../../artifacts/shots/tracks/albert_park/s07-lake-cbd__day-fog.jpg)<br>**view:** lake/CBD orbit · **weather:** fog · **tod:** day | ![day storm](../../../artifacts/shots/tracks/albert_park/s07-lake-cbd__day-storm.jpg)<br>**view:** lake/CBD orbit · **weather:** storm · **tod:** day |
| ![dawn dry](../../../artifacts/shots/tracks/albert_park/s07-lake-cbd__dawn-dry.jpg)<br>**view:** lake/CBD orbit · **weather:** dry · **tod:** dawn | ![dusk dry](../../../artifacts/shots/tracks/albert_park/s07-lake-cbd__dusk-dry.jpg)<br>**view:** lake/CBD orbit · **weather:** dry · **tod:** dusk | ![night dry](../../../artifacts/shots/tracks/albert_park/s07-lake-cbd__night-dry.jpg)<br>**view:** lake/CBD orbit · **weather:** dry · **tod:** night |

---

## Hero — Chicane (`s11-chicane`) orbit

| | | |
|:---:|:---:|:---:|
| ![day dry](../../../artifacts/shots/tracks/albert_park/s11-chicane__day-dry.jpg)<br>**view:** chicane orbit · **weather:** dry · **tod:** day | ![day wet](../../../artifacts/shots/tracks/albert_park/s11-chicane__day-wet.jpg)<br>**view:** chicane orbit · **weather:** wet · **tod:** day | ![day rain](../../../artifacts/shots/tracks/albert_park/s11-chicane__day-rain.jpg)<br>**view:** chicane orbit · **weather:** rain · **tod:** day |
| ![day overcast](../../../artifacts/shots/tracks/albert_park/s11-chicane__day-overcast.jpg)<br>**view:** chicane orbit · **weather:** overcast · **tod:** day | ![day fog](../../../artifacts/shots/tracks/albert_park/s11-chicane__day-fog.jpg)<br>**view:** chicane orbit · **weather:** fog · **tod:** day | ![day storm](../../../artifacts/shots/tracks/albert_park/s11-chicane__day-storm.jpg)<br>**view:** chicane orbit · **weather:** storm · **tod:** day |
| ![dawn dry](../../../artifacts/shots/tracks/albert_park/s11-chicane__dawn-dry.jpg)<br>**view:** chicane orbit · **weather:** dry · **tod:** dawn | ![dusk dry](../../../artifacts/shots/tracks/albert_park/s11-chicane__dusk-dry.jpg)<br>**view:** chicane orbit · **weather:** dry · **tod:** dusk | ![night dry](../../../artifacts/shots/tracks/albert_park/s11-chicane__night-dry.jpg)<br>**view:** chicane orbit · **weather:** dry · **tod:** night |

---

## Hero — MSAC (`s03-msac`) orbit

| | | |
|:---:|:---:|:---:|
| ![day dry](../../../artifacts/shots/tracks/albert_park/s03-msac__day-dry.jpg)<br>**view:** MSAC orbit · **weather:** dry · **tod:** day | ![day wet](../../../artifacts/shots/tracks/albert_park/s03-msac__day-wet.jpg)<br>**view:** MSAC orbit · **weather:** wet · **tod:** day | ![day rain](../../../artifacts/shots/tracks/albert_park/s03-msac__day-rain.jpg)<br>**view:** MSAC orbit · **weather:** rain · **tod:** day |
| ![day overcast](../../../artifacts/shots/tracks/albert_park/s03-msac__day-overcast.jpg)<br>**view:** MSAC orbit · **weather:** overcast · **tod:** day | ![day fog](../../../artifacts/shots/tracks/albert_park/s03-msac__day-fog.jpg)<br>**view:** MSAC orbit · **weather:** fog · **tod:** day | ![day storm](../../../artifacts/shots/tracks/albert_park/s03-msac__day-storm.jpg)<br>**view:** MSAC orbit · **weather:** storm · **tod:** day |
| ![night dry](../../../artifacts/shots/tracks/albert_park/s03-msac__night-dry.jpg)<br>**view:** MSAC orbit · **weather:** dry · **tod:** night | | |
