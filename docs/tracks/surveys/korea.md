# Korea International Circuit — survey (2026-10-15)

**Circuit id:** `korea`  
**Brief:** `docs/tracks/korea.md`  
**Data:** `js/circuits/korea.js`, `js/circuits/scenery/korea.js`  
**Shots:** `artifacts/shots/tracks/korea/` (**36** JPEGs, force-added; `shot.mjs --batch` after merge with `cursor/shared-shot-tooling-5b45`)

## Code map

| Layer | Role |
|---|---|
| `js/circuits/korea.js` | OSM centreline, `undulate: false`, `pit: { side: -1 }`, palette, `furniture.lamp: "none"`. |
| `js/circuits/scenery/korea.js` | Pit / grandstand / marina shells / footbridge models; split guardrails (road-occupied bands). |
| `tests/data/landmarks/korea.json` | Required `modelGroup` ids for pit, main stand, marina shells, footbridge. |

**Centreline (2026-10-14):** min node radius **8.03 m** (hw 8 m) at s≈0.665; **surface folds 0**; off `KNOWN_TARMAC_FOLDS`.

**Re-capture (2026-10-15):** **36** JPEGs — `node tools/shot/shot.mjs --batch artifacts/shots/tracks/korea/capture-jobs.jsonl --jpeg --present-timeout 90 --capture-retries 4 --wait 120` (shared shot tooling #1862, SwiftShader).

## Panel grid (36 frames)

| ![key footbridge](../../../artifacts/shots/tracks/korea/key-footbridge__day-dry.jpg) | ![key footbridge](../../../artifacts/shots/tracks/korea/key-footbridge__day-fog.jpg) | ![key footbridge](../../../artifacts/shots/tracks/korea/key-footbridge__dusk-dry.jpg) |
| **key footbridge** · wx=dry · tod=day | **key footbridge** · wx=fog · tod=day | **key footbridge** · wx=dry · tod=dusk |

| ![key footbridge](../../../artifacts/shots/tracks/korea/key-footbridge__night-dry.jpg) | ![key footbridge](../../../artifacts/shots/tracks/korea/key-footbridge__night-rain.jpg) | ![key marina](../../../artifacts/shots/tracks/korea/key-marina__day-dry.jpg) |
| **key footbridge** · wx=dry · tod=night | **key footbridge** · wx=rain · tod=night | **key marina** · wx=dry · tod=day |

| ![key marina](../../../artifacts/shots/tracks/korea/key-marina__day-fog.jpg) | ![key marina](../../../artifacts/shots/tracks/korea/key-marina__dusk-dry.jpg) | ![key marina](../../../artifacts/shots/tracks/korea/key-marina__night-dry.jpg) |
| **key marina** · wx=fog · tod=day | **key marina** · wx=dry · tod=dusk | **key marina** · wx=dry · tod=night |

| ![key marina](../../../artifacts/shots/tracks/korea/key-marina__night-rain.jpg) | ![key marina](../../../artifacts/shots/tracks/korea/key-marina__night-storm.jpg) | ![key pit](../../../artifacts/shots/tracks/korea/key-pit__dawn-dry.jpg) |
| **key marina** · wx=rain · tod=night | **key marina** · wx=storm · tod=night | **key pit** · wx=dry · tod=dawn |

| ![key pit](../../../artifacts/shots/tracks/korea/key-pit__day-dry.jpg) | ![key pit](../../../artifacts/shots/tracks/korea/key-pit__dusk-dry.jpg) | ![key pit](../../../artifacts/shots/tracks/korea/key-pit__night-dry.jpg) |
| **key pit** · wx=dry · tod=day | **key pit** · wx=dry · tod=dusk | **key pit** · wx=dry · tod=night |

| ![key pit](../../../artifacts/shots/tracks/korea/key-pit__night-rain.jpg) | ![key pit](../../../artifacts/shots/tracks/korea/key-pit__night-storm.jpg) | ![key seawall](../../../artifacts/shots/tracks/korea/key-seawall__day-dry.jpg) |
| **key pit** · wx=rain · tod=night | **key pit** · wx=storm · tod=night | **key seawall** · wx=dry · tod=day |

| ![key seawall](../../../artifacts/shots/tracks/korea/key-seawall__day-overcast.jpg) | ![key seawall](../../../artifacts/shots/tracks/korea/key-seawall__day-wet.jpg) | ![key stadium](../../../artifacts/shots/tracks/korea/key-stadium__day-dry.jpg) |
| **key seawall** · wx=overcast · tod=day | **key seawall** · wx=wet · tod=day | **key stadium** · wx=dry · tod=day |

| ![key stadium](../../../artifacts/shots/tracks/korea/key-stadium__day-overcast.jpg) | ![key stadium](../../../artifacts/shots/tracks/korea/key-stadium__day-wet.jpg) | ![key turn3](../../../artifacts/shots/tracks/korea/key-turn3__day-dry.jpg) |
| **key stadium** · wx=overcast · tod=day | **key stadium** · wx=wet · tod=day | **key turn3** · wx=dry · tod=day |

| ![key turn3](../../../artifacts/shots/tracks/korea/key-turn3__day-fog.jpg) | ![key turn3](../../../artifacts/shots/tracks/korea/key-turn3__dusk-dry.jpg) | ![key turn3](../../../artifacts/shots/tracks/korea/key-turn3__night-dry.jpg) |
| **key turn3** · wx=fog · tod=day | **key turn3** · wx=dry · tod=dusk | **key turn3** · wx=dry · tod=night |

| ![key turn3](../../../artifacts/shots/tracks/korea/key-turn3__night-rain.jpg) | ![map context](../../../artifacts/shots/tracks/korea/map-context__day-dry.jpg) | ![s01 grandstand](../../../artifacts/shots/tracks/korea/s01-grandstand__day-dry.jpg) |
| **key turn3** · wx=rain · tod=night | **map context** · wx=dry · tod=day | **s01 grandstand** · wx=dry · tod=day |

| ![s01 pit straight](../../../artifacts/shots/tracks/korea/s01-pit-straight__day-dry.jpg) | ![s02 seawall t7](../../../artifacts/shots/tracks/korea/s02-seawall-t7__day-dry.jpg) | ![s02 turn3 braking](../../../artifacts/shots/tracks/korea/s02-turn3-braking__day-dry.jpg) |
| **s01 pit straight** · wx=dry · tod=day | **s02 seawall t7** · wx=dry · tod=day | **s02 turn3 braking** · wx=dry · tod=day |

| ![s03 footbridge](../../../artifacts/shots/tracks/korea/s03-footbridge__day-dry.jpg) | ![s03 marina shells](../../../artifacts/shots/tracks/korea/s03-marina-shells__day-dry.jpg) | ![sector1 overview](../../../artifacts/shots/tracks/korea/sector1-overview__day-dry.jpg) |
| **s03 footbridge** · wx=dry · tod=day | **s03 marina shells** · wx=dry · tod=day | **sector1 overview** · wx=dry · tod=day |


## Verification

```text
node tools/track/verify-track.cjs korea
```
