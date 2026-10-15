# Istanbul Park — circuit survey (2026-10-15)

**Circuit id:** `istanbul` · **Brief:** [`docs/tracks/istanbul.md`](../istanbul.md) · **Data:** `js/circuits/istanbul.js` · **Scenery:** `js/circuits/scenery/istanbul.js`

## Code map

| Layer | Role |
|--------|------|
| `js/circuits/istanbul.js` | OSM centreline (5313 m), anticlockwise; T1/T8 elevation; Turn 8 banking (7°, 300 m); `ownPitStraight` |
| `js/circuits/scenery/istanbul.js` | T8 amphitheatre, stands, hospitality, pit models, sparse `forestEdge` |
| `tests/data/landmarks/istanbul.json` | `istanbul-turn8-hospitality`, `istanbul-race-control`, `istanbul-stone-portal` |

## Capture set

**36 JPEG frames** in `artifacts/shots/tracks/istanbul/` (SwiftShader / TLX, `shot.mjs --jpeg --present-timeout 90 --capture-retries 4`).  
**Hero views** (weather + TOD): Turn 8 apex orbit · pit straight eye · T1 plunge park · stone portal trackside.

Relative image root: `../../../artifacts/shots/tracks/istanbul/`

### Sector lap — day · dry

| | | |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/istanbul/s1-pit-main-grandstand-day-dry-park.jpg)<br>**park · dry · day**<br>Main grandstand | ![](../../../artifacts/shots/tracks/istanbul/s1-t1-plunge-day-dry-park.jpg)<br>**park · dry · day**<br>T1 plunge | ![](../../../artifacts/shots/tracks/istanbul/s1-t1-silver1-day-dry-trackside.jpg)<br>**trackside · dry · day**<br>Silver 1 |
| ![](../../../artifacts/shots/tracks/istanbul/s1-t3-4-complex-day-dry-park.jpg)<br>**park · dry · day**<br>T3–4 pinch | ![](../../../artifacts/shots/tracks/istanbul/s2-silver3-day-dry-trackside.jpg)<br>**trackside · dry · day**<br>Silver 3 | ![](../../../artifacts/shots/tracks/istanbul/s2-t8-entry-day-dry-park.jpg)<br>**park · dry · day**<br>T8 entry |
| ![](../../../artifacts/shots/tracks/istanbul/s2-t8-exit-day-dry-park.jpg)<br>**park · dry · day**<br>T8 exit | ![](../../../artifacts/shots/tracks/istanbul/s2-t8-hospitality-day-dry-orbit.jpg)<br>**orbit · dry · day**<br>T8 hospitality | ![](../../../artifacts/shots/tracks/istanbul/s2-t8-silver4-day-dry-orbit.jpg)<br>**orbit · dry · day**<br>Silver 4 |
| ![](../../../artifacts/shots/tracks/istanbul/s2-t8-apex-day-dry-orbit.jpg)<br>**orbit · dry · day**<br>Turn 8 apex | ![](../../../artifacts/shots/tracks/istanbul/s3-t9-10-gravel-day-dry-park.jpg)<br>**park · dry · day**<br>T9–10 gravel | ![](../../../artifacts/shots/tracks/istanbul/s3-t12-banked-day-dry-park.jpg)<br>**park · dry · day**<br>T12 banked |
| ![](../../../artifacts/shots/tracks/istanbul/s3-t13-14-gravel-day-dry-park.jpg)<br>**park · dry · day**<br>T13–14 | ![](../../../artifacts/shots/tracks/istanbul/s3-stone-portal-day-dry-trackside.jpg)<br>**trackside · dry · day**<br>Stone portal | ![](../../../artifacts/shots/tracks/istanbul/s3-silver8-day-dry-trackside.jpg)<br>**trackside · dry · day**<br>Silver 8 |
| ![](../../../artifacts/shots/tracks/istanbul/s3-pit-straight-day-dry-eye.jpg)<br>**eye · dry · day**<br>Pit straight | | |

### Hero — Turn 8 apex (orbit s≈0.395)

| | | |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/istanbul/s2-t8-apex-dawn-dry-orbit.jpg)<br>**orbit · dry · dawn** | ![](../../../artifacts/shots/tracks/istanbul/s2-t8-apex-dusk-dry-orbit.jpg)<br>**orbit · dry · dusk** | ![](../../../artifacts/shots/tracks/istanbul/s2-t8-apex-night-dry-orbit.jpg)<br>**orbit · dry · night** |
| ![](../../../artifacts/shots/tracks/istanbul/s2-t8-apex-day-overcast-orbit.jpg)<br>**orbit · overcast · day** | ![](../../../artifacts/shots/tracks/istanbul/s2-t8-apex-day-fog-orbit.jpg)<br>**orbit · fog · day** | ![](../../../artifacts/shots/tracks/istanbul/s2-t8-apex-day-rain-orbit.jpg)<br>**orbit · rain · day** |
| ![](../../../artifacts/shots/tracks/istanbul/s2-t8-apex-day-wet-orbit.jpg)<br>**orbit · wet · day** | ![](../../../artifacts/shots/tracks/istanbul/s2-t8-apex-day-storm-orbit.jpg)<br>**orbit · storm · day** | |

### Hero — pit straight (eye s≈0.965)

| | | |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/istanbul/s3-pit-dusk-dry-eye.jpg)<br>**eye · dry · dusk** | ![](../../../artifacts/shots/tracks/istanbul/s3-pit-night-dry-eye.jpg)<br>**eye · dry · night** | ![](../../../artifacts/shots/tracks/istanbul/s3-pit-day-overcast-eye.jpg)<br>**eye · overcast · day** |
| ![](../../../artifacts/shots/tracks/istanbul/s3-pit-day-rain-eye.jpg)<br>**eye · rain · day** | ![](../../../artifacts/shots/tracks/istanbul/s3-pit-day-wet-eye.jpg)<br>**eye · wet · day** | ![](../../../artifacts/shots/tracks/istanbul/s3-pit-day-storm-eye.jpg)<br>**eye · storm · day** |

### Hero — T1 plunge (park s≈0.055)

| | | |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/istanbul/s1-t1-plunge-dusk-dry-park.jpg)<br>**park · dry · dusk** | ![](../../../artifacts/shots/tracks/istanbul/s1-t1-plunge-day-overcast-park.jpg)<br>**park · overcast · day** | ![](../../../artifacts/shots/tracks/istanbul/s1-t1-plunge-day-rain-park.jpg)<br>**park · rain · day** |

### Hero — stone portal (trackside s≈0.930)

| | | |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/istanbul/s3-stone-portal-night-dry-trackside.jpg)<br>**trackside · dry · night** | ![](../../../artifacts/shots/tracks/istanbul/s3-stone-portal-day-overcast-trackside.jpg)<br>**trackside · overcast · day** | ![](../../../artifacts/shots/tracks/istanbul/s3-stone-portal-day-fog-trackside.jpg)<br>**trackside · fog · day** |

## Findings

| Item | Notes |
|------|--------|
| Weather | T8 storm/rain darken banking read; pit storm readable; fog softens ridgelines |
| Night | Flood masts lit at T8/pit/portal; circuit meta `night: false` but TOD night works |
| T1 Silver 1 | Still monolithic block — backlog |
| Scenery branch | `forestEdge` sparser; T8 crowd lip; motorhome distance on paddock grade |
| Audit | `verify-track` / `audit-circuit` within baselines (no baseline edits) |

## Verification

```sh
node tools/track/verify-track.cjs istanbul
node tools/track/audit-circuit.cjs istanbul
```
