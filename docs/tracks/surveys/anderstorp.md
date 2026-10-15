# Anderstorp (Scandinavian Raceway) — circuit survey

**Date:** 2026-10-15  
**Brief:** `docs/tracks/anderstorp.md`  
**Shots:** **36** JPEGs in `artifacts/shots/tracks/anderstorp/` (SwiftShader / TLX, `shot.mjs --batch`, `--present-timeout 90`, `--capture-retries 4`).

## Code map

| Layer | Path |
|-------|------|
| Def | `js/circuits/anderstorp.js` — OSM ~4.02 km, `theme: green`, 8 turns |
| Scenery | `js/circuits/scenery/anderstorp.js` — runway corridor, four `modelGroup` landmarks |
| Landmarks | `tests/data/landmarks/anderstorp.json` |

**Weather / TOD:** `dry`, `wet`, `rain`, `overcast`, `fog`, `storm` × `day`, `dawn`, `dusk`, `night` (`js/race/race-settings.js`, `__apex.weather` / `setTimeOfDay`). Def `night: false` — night is sky/fog only, no dedicated night race lighting.

## Audits & fixes (circuit-only)

| Check | Result |
|-------|--------|
| `verify-track` | OK |
| `audit-circuit` | float/clip 0; coplanar 0 (cap 2, baseline unchanged) |

Scenery: `FOOT_SPAN` for S/F + T8 stands; removed duplicate hardstand patch; removed T8 `spectatorHill`.

## Lighting backlog

| Issue | Frames |
|-------|--------|
| Sparse floodlights on Flight Straight (`furniture.lamp: "none"`) | `*-dry-night` heroes |
| Fog lowers runway marking contrast | `*-fog-day` |
| Storm/rain darken pine mass (expected) | `*-storm-day`, `*-rain-day` |

---

## Panel grids

Path prefix: `../../../artifacts/shots/tracks/anderstorp/`

### UI (day · dry)

| | | |
|:---:|:---:|:---:|
| Circuit select · orbit n/a · **day** · **dry**<br/>![01](../../../artifacts/shots/tracks/anderstorp/01-ui-circuit-select-dry-day.jpg) | Track detail · **day** · **dry**<br/>![02](../../../artifacts/shots/tracks/anderstorp/02-ui-track-detail-dry-day.jpg) | |

### Lap coverage (day · dry)

| | | |
|:---:|:---:|:---:|
| S/F grandstands · **orbit** · dry · day<br/>![03](../../../artifacts/shots/tracks/anderstorp/03-sf-grandstands-orbit-dry-day.jpg) | Landmarks · **eye** · dry · day<br/>![04](../../../artifacts/shots/tracks/anderstorp/04-sf-landmarks-eye-dry-day.jpg) | T1 · **trackside** · dry · day<br/>![05](../../../artifacts/shots/tracks/anderstorp/05-t1-trackside-dry-day.jpg) |
| Paddock · **orbit** · dry · day<br/>![06](../../../artifacts/shots/tracks/anderstorp/06-paddock-orbit-dry-day.jpg) | Södra · **trackside** · dry · day<br/>![07](../../../artifacts/shots/tracks/anderstorp/07-sodra-trackside-dry-day.jpg) | Bog · **eye** · dry · day<br/>![08](../../../artifacts/shots/tracks/anderstorp/08-bog-eye-dry-day.jpg) |
| Opel · **trackside** · dry · day<br/>![09](../../../artifacts/shots/tracks/anderstorp/09-opel-trackside-dry-day.jpg) | T5 · **orbit** · dry · day<br/>![10](../../../artifacts/shots/tracks/anderstorp/10-t5-orbit-dry-day.jpg) | Runway entry · **orbit** · dry · day<br/>![11](../../../artifacts/shots/tracks/anderstorp/11-runway-entry-orbit-dry-day.jpg) |
| Hangars · **eye** · dry · day<br/>![12](../../../artifacts/shots/tracks/anderstorp/12-hangars-eye-dry-day.jpg) | Runway far · **trackside** · dry · day<br/>![13](../../../artifacts/shots/tracks/anderstorp/13-runway-far-trackside-dry-day.jpg) | T8 terrace · **orbit** · dry · day<br/>![14](../../../artifacts/shots/tracks/anderstorp/14-t8-terrace-orbit-dry-day.jpg) |

### Hero — Start/finish (orbit)

| | | |
|:---:|:---:|:---:|
| dry · **dawn**<br/>![15](../../../artifacts/shots/tracks/anderstorp/15-hero-sf-orbit-dry-dawn.jpg) | dry · **dusk**<br/>![16](../../../artifacts/shots/tracks/anderstorp/16-hero-sf-orbit-dry-dusk.jpg) | dry · **night**<br/>![17](../../../artifacts/shots/tracks/anderstorp/17-hero-sf-orbit-dry-night.jpg) |
| **overcast** · day<br/>![18](../../../artifacts/shots/tracks/anderstorp/18-hero-sf-orbit-overcast-day.jpg) | **wet** · day<br/>![19](../../../artifacts/shots/tracks/anderstorp/19-hero-sf-orbit-wet-day.jpg) | **rain** · day<br/>![20](../../../artifacts/shots/tracks/anderstorp/20-hero-sf-orbit-rain-day.jpg) |
| **fog** · day<br/>![21](../../../artifacts/shots/tracks/anderstorp/21-hero-sf-orbit-fog-day.jpg) | **storm** · day<br/>![22](../../../artifacts/shots/tracks/anderstorp/22-hero-sf-orbit-storm-day.jpg) | |

### Hero — Flight Straight (orbit)

| | | |
|:---:|:---:|:---:|
| dry · **dawn**<br/>![23](../../../artifacts/shots/tracks/anderstorp/23-hero-runway-orbit-dry-dawn.jpg) | dry · **dusk**<br/>![24](../../../artifacts/shots/tracks/anderstorp/24-hero-runway-orbit-dry-dusk.jpg) | dry · **night**<br/>![25](../../../artifacts/shots/tracks/anderstorp/25-hero-runway-orbit-dry-night.jpg) |
| **overcast** · day<br/>![26](../../../artifacts/shots/tracks/anderstorp/26-hero-runway-orbit-overcast-day.jpg) | **wet** · day<br/>![27](../../../artifacts/shots/tracks/anderstorp/27-hero-runway-orbit-wet-day.jpg) | **rain** · day<br/>![28](../../../artifacts/shots/tracks/anderstorp/28-hero-runway-orbit-rain-day.jpg) |
| **fog** · day<br/>![29](../../../artifacts/shots/tracks/anderstorp/29-hero-runway-orbit-fog-day.jpg) | **storm** · day<br/>![30](../../../artifacts/shots/tracks/anderstorp/30-hero-runway-orbit-storm-day.jpg) | |

### Hero — Hangars (eye) & T8 (orbit)

| | | |
|:---:|:---:|:---:|
| hangars · dry · **dusk**<br/>![31](../../../artifacts/shots/tracks/anderstorp/31-hero-hangars-eye-dry-dusk.jpg) | hangars · dry · **night**<br/>![32](../../../artifacts/shots/tracks/anderstorp/32-hero-hangars-eye-dry-night.jpg) | hangars · **wet** · day<br/>![33](../../../artifacts/shots/tracks/anderstorp/33-hero-hangars-eye-wet-day.jpg) |
| hangars · **storm** · day<br/>![34](../../../artifacts/shots/tracks/anderstorp/34-hero-hangars-eye-storm-day.jpg) | T8 · dry · **dusk**<br/>![35](../../../artifacts/shots/tracks/anderstorp/35-hero-t8-orbit-dry-dusk.jpg) | T8 · dry · **night**<br/>![36](../../../artifacts/shots/tracks/anderstorp/36-hero-t8-orbit-dry-night.jpg) |
