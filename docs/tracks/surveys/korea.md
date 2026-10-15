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

## Capture

| Set | Count | Tooling |
|---|---|---|
| Sector landmarks | 8 | `day` / `dry` |
| Hero anchors | 6 | `day` / `dry` |
| Hero weather / TOD | 22 | `shot.mjs --jpeg --present-timeout 90 --capture-retries 4 --wait 120` (SwiftShader default) |

Weathers used: `dry`, `wet`, `rain`, `overcast`, `fog`, `storm`. TOD: `day`, `dawn`, `dusk`, `night`. Filenames: `<view>__<tod>-<weather>.jpg` (e.g. `key-pit__dusk-dry.jpg`).

---

## Sector coverage — day / dry

| | | |
|---|---|---|
| ![Pit straight](../../../artifacts/shots/tracks/korea/s01-pit-straight__day-dry.jpg) | ![Grandstand](../../../artifacts/shots/tracks/korea/s01-grandstand__day-dry.jpg) | ![Turn 3 braking](../../../artifacts/shots/tracks/korea/s02-turn3-braking__day-dry.jpg) |
| Pit straight orbit · day · dry | Main grandstand · day · dry | Turn 3 braking · day · dry |
| ![Seawall T7](../../../artifacts/shots/tracks/korea/s02-seawall-t7__day-dry.jpg) | ![Marina shells](../../../artifacts/shots/tracks/korea/s03-marina-shells__day-dry.jpg) | ![Footbridge sector](../../../artifacts/shots/tracks/korea/s03-footbridge__day-dry.jpg) |
| Turn 7 seawall · day · dry | Marina shells · day · dry | Footbridge · day · dry |
| ![Map](../../../artifacts/shots/tracks/korea/map-context__day-dry.jpg) | ![Sector 1 overview](../../../artifacts/shots/tracks/korea/sector1-overview__day-dry.jpg) | |
| Map park cam · day · dry | Sector 1 overview · day · dry | |

---

## Hero anchors — day / dry

| | | |
|---|---|---|
| ![Key pit](../../../artifacts/shots/tracks/korea/key-pit__day-dry.jpg) | ![Key Turn 3](../../../artifacts/shots/tracks/korea/key-turn3__day-dry.jpg) | ![Key marina](../../../artifacts/shots/tracks/korea/key-marina__day-dry.jpg) |
| Key pit orbit · day · dry | Key Turn 3 orbit · day · dry | Key marina orbit · day · dry |
| ![Key stadium](../../../artifacts/shots/tracks/korea/key-stadium__day-dry.jpg) | ![Key seawall](../../../artifacts/shots/tracks/korea/key-seawall__day-dry.jpg) | ![Key footbridge](../../../artifacts/shots/tracks/korea/key-footbridge__day-dry.jpg) |
| Key stadium orbit · day · dry | Key seawall orbit · day · dry | Key footbridge cinematic · day · dry |

---

## Hero — dusk / dry

| | | |
|---|---|---|
| ![Pit dusk](../../../artifacts/shots/tracks/korea/key-pit__dusk-dry.jpg) | ![Turn 3 dusk](../../../artifacts/shots/tracks/korea/key-turn3__dusk-dry.jpg) | ![Marina dusk](../../../artifacts/shots/tracks/korea/key-marina__dusk-dry.jpg) |
| Key pit orbit · dusk · dry | Key Turn 3 orbit · dusk · dry | Key marina orbit · dusk · dry |
| ![Footbridge dusk](../../../artifacts/shots/tracks/korea/key-footbridge__dusk-dry.jpg) | | |
| Key footbridge cinematic · dusk · dry | | |

---

## Hero — night / dry

| | | |
|---|---|---|
| ![Pit night](../../../artifacts/shots/tracks/korea/key-pit__night-dry.jpg) | ![Turn 3 night](../../../artifacts/shots/tracks/korea/key-turn3__night-dry.jpg) | ![Marina night](../../../artifacts/shots/tracks/korea/key-marina__night-dry.jpg) |
| Key pit orbit · night · dry | Key Turn 3 orbit · night · dry | Key marina orbit · night · dry |
| ![Footbridge night](../../../artifacts/shots/tracks/korea/key-footbridge__night-dry.jpg) | | |
| Key footbridge cinematic · night · dry | | |

---

## Hero — dawn / dry

| | | |
|---|---|---|
| ![Pit dawn](../../../artifacts/shots/tracks/korea/key-pit__dawn-dry.jpg) | | |
| Key pit orbit · dawn · dry | | |

---

## Hero — day / rain

| | | |
|---|---|---|
| ![Pit rain](../../../artifacts/shots/tracks/korea/key-pit__day-rain.jpg) | ![Turn 3 rain](../../../artifacts/shots/tracks/korea/key-turn3__day-rain.jpg) | ![Marina rain](../../../artifacts/shots/tracks/korea/key-marina__day-rain.jpg) |
| Key pit orbit · day · rain | Key Turn 3 orbit · day · rain | Key marina orbit · day · rain |
| ![Footbridge rain](../../../artifacts/shots/tracks/korea/key-footbridge__day-rain.jpg) | | |
| Key footbridge cinematic · day · rain | | |

---

## Hero — day / fog

| | | |
|---|---|---|
| ![Turn 3 fog](../../../artifacts/shots/tracks/korea/key-turn3__day-fog.jpg) | ![Marina fog](../../../artifacts/shots/tracks/korea/key-marina__day-fog.jpg) | ![Footbridge fog](../../../artifacts/shots/tracks/korea/key-footbridge__day-fog.jpg) |
| Key Turn 3 orbit · day · fog | Key marina orbit · day · fog | Key footbridge cinematic · day · fog |

---

## Hero — day / overcast & wet

| | | |
|---|---|---|
| ![Seawall overcast](../../../artifacts/shots/tracks/korea/key-seawall__day-overcast.jpg) | ![Stadium overcast](../../../artifacts/shots/tracks/korea/key-stadium__day-overcast.jpg) | ![Seawall wet](../../../artifacts/shots/tracks/korea/key-seawall__day-wet.jpg) |
| Key seawall orbit · day · overcast | Key stadium orbit · day · overcast | Key seawall orbit · day · wet |
| ![Stadium wet](../../../artifacts/shots/tracks/korea/key-stadium__day-wet.jpg) | | |
| Key stadium orbit · day · wet | | |

---

## Hero — day / storm

| | | |
|---|---|---|
| ![Pit storm](../../../artifacts/shots/tracks/korea/key-pit__day-storm.jpg) | ![Marina storm](../../../artifacts/shots/tracks/korea/key-marina__day-storm.jpg) | |
| Key pit orbit · day · storm | Key marina orbit · day · storm | |

---

## Findings (ranked)

| ID | Severity | Topic | Notes |
|---|---|---|---|
| K1 | Fixed | Legacy R3 fold | Chord inserts + fold clamp; 0 surface folds; min R 8.03 m. |
| K2 | Low | Road-occupied bands | Keep split guardrails (scenery header). |
| K3 | Info | Night lighting | `lamp: "none"` — night frames are dark; city glow only (see night/dry row). |
| K4 | Watch | Storm / rain | Falling rain visible on hero frames; no extra circuit edits. |
| K5 | Watch | Wet vs rain | Wet = damp road without heavy rain particles; labels match `weather()` mode. |

## Verified

- `node tools/track/verify-track.cjs korea` — OK  
- `node tools/track/audit-circuit.cjs korea` — OK  
