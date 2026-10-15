# Kyalami — circuit survey (2026-10-15)

**Branch:** `cursor/kyalami-survey-c736` · **Brief:** `docs/tracks/kyalami.md`  
**Screenshots:** `artifacts/shots/tracks/kyalami/` — **36** JPEG frames (q≈80, ≤1280px, <300 KB), captured with shared `shot.mjs` (`--jpeg --present-timeout 90 --capture-retries 4 --wait 120`).

## Code map

| Layer | Path | Role |
|--------|------|------|
| Def | `js/circuits/kyalami.js` | OSM path, elevations, `reverse: true`, `sceneryCoordinates: "racing"`, straw-gold `pal` |
| Scenery | `js/circuits/scenery/kyalami.js` | Highveld dressing, six required `modelGroup` landmarks |
| Landmarks | `tests/data/landmarks/kyalami.json` | pit-block, race-control, main-grandstand, headgear, windpump, clubhouse |

## Offline audit

```sh
node tools/track/verify-track.cjs kyalami
node tools/track/audit-circuit.cjs kyalami
```

| Check | Result |
|--------|--------|
| verify-track | OK, surface folds 0 |
| float / clip / coplanar | 0 |
| ground | buried **5** (baseline 6) after windpump dam +0.12 m |

## Visual survey — panels

GitHub PR uses `raw.githubusercontent.com` on `cursor/kyalami-survey-c736`.

### Sector landmarks (day, dry)

| | | |
|:---:|:---:|:---:|
| ![SEC-01-start__day__dry.jpg](../../../artifacts/shots/tracks/kyalami/SEC-01-start__day__dry.jpg) | ![SEC-02-main-gs__day__dry.jpg](../../../artifacts/shots/tracks/kyalami/SEC-02-main-gs__day__dry.jpg) | ![SEC-03-pit__day__dry.jpg](../../../artifacts/shots/tracks/kyalami/SEC-03-pit__day__dry.jpg) |
| **Start / main straight (orbit)**<br/>TOD: day · wx: dry | **Main grandstand (trackside)**<br/>TOD: day · wx: dry | **Pit paddock (orbit)**<br/>TOD: day · wx: dry |
| ![SEC-04-crowthorne__day__dry.jpg](../../../artifacts/shots/tracks/kyalami/SEC-04-crowthorne__day__dry.jpg) | ![SEC-05-jukskei__day__dry.jpg](../../../artifacts/shots/tracks/kyalami/SEC-05-jukskei__day__dry.jpg) | ![SEC-06-barbecue__day__dry.jpg](../../../artifacts/shots/tracks/kyalami/SEC-06-barbecue__day__dry.jpg) |
| **T1 Crowthorne (chase)**<br/>TOD: day · wx: dry | **Jukskei Sweep**<br/>TOD: day · wx: dry | **Barbecue corner**<br/>TOD: day · wx: dry |
| ![SEC-07-headgear__day__dry.jpg](../../../artifacts/shots/tracks/kyalami/SEC-07-headgear__day__dry.jpg) | ![SEC-08-climb__day__dry.jpg](../../../artifacts/shots/tracks/kyalami/SEC-08-climb__day__dry.jpg) | ![SEC-09-leeukop__day__dry.jpg](../../../artifacts/shots/tracks/kyalami/SEC-09-leeukop__day__dry.jpg) |
| **Mine headgear (orbit)**<br/>TOD: day · wx: dry | **Climb iron terrace**<br/>TOD: day · wx: dry | **Leeukop high point**<br/>TOD: day · wx: dry |
| ![SEC-10-windpump__day__dry.jpg](../../../artifacts/shots/tracks/kyalami/SEC-10-windpump__day__dry.jpg) | ![SEC-11-plunge__day__dry.jpg](../../../artifacts/shots/tracks/kyalami/SEC-11-plunge__day__dry.jpg) | ![SEC-12-horizon__day__dry.jpg](../../../artifacts/shots/tracks/kyalami/SEC-12-horizon__day__dry.jpg) |
| **Windpump + dam**<br/>TOD: day · wx: dry | **Plunge descent**<br/>TOD: day · wx: dry | **Horizon / mine dumps (eye)**<br/>TOD: day · wx: dry |

#### Start straight — weather & lighting

| | | |
|:---:|:---:|:---:|
| ![HERO-start__day__fog.jpg](../../../artifacts/shots/tracks/kyalami/HERO-start__day__fog.jpg) | ![HERO-start__day__overcast.jpg](../../../artifacts/shots/tracks/kyalami/HERO-start__day__overcast.jpg) | ![HERO-start__day__rain.jpg](../../../artifacts/shots/tracks/kyalami/HERO-start__day__rain.jpg) |
| **Start straight**<br/>TOD: day · wx: fog | **Start straight**<br/>TOD: day · wx: overcast | **Start straight**<br/>TOD: day · wx: rain |
| ![HERO-start__day__wet.jpg](../../../artifacts/shots/tracks/kyalami/HERO-start__day__wet.jpg) | ![HERO-start__dusk__dry.jpg](../../../artifacts/shots/tracks/kyalami/HERO-start__dusk__dry.jpg) | ![HERO-start__night__dry.jpg](../../../artifacts/shots/tracks/kyalami/HERO-start__night__dry.jpg) |
| **Start straight**<br/>TOD: day · wx: wet | **Start straight**<br/>TOD: dusk · wx: dry | **Start straight**<br/>TOD: night · wx: dry |

#### Pit complex — weather & lighting

| | | |
|:---:|:---:|:---:|
| ![HERO-pit__day__fog.jpg](../../../artifacts/shots/tracks/kyalami/HERO-pit__day__fog.jpg) | ![HERO-pit__day__overcast.jpg](../../../artifacts/shots/tracks/kyalami/HERO-pit__day__overcast.jpg) | ![HERO-pit__day__rain.jpg](../../../artifacts/shots/tracks/kyalami/HERO-pit__day__rain.jpg) |
| **Pit complex**<br/>TOD: day · wx: fog | **Pit complex**<br/>TOD: day · wx: overcast | **Pit complex**<br/>TOD: day · wx: rain |
| ![HERO-pit__day__wet.jpg](../../../artifacts/shots/tracks/kyalami/HERO-pit__day__wet.jpg) | ![HERO-pit__dusk__dry.jpg](../../../artifacts/shots/tracks/kyalami/HERO-pit__dusk__dry.jpg) | ![HERO-pit__night__dry.jpg](../../../artifacts/shots/tracks/kyalami/HERO-pit__night__dry.jpg) |
| **Pit complex**<br/>TOD: day · wx: wet | **Pit complex**<br/>TOD: dusk · wx: dry | **Pit complex**<br/>TOD: night · wx: dry |

#### Crowthorne T1 — weather & lighting

| | | |
|:---:|:---:|:---:|
| ![HERO-crowthorne__day__fog.jpg](../../../artifacts/shots/tracks/kyalami/HERO-crowthorne__day__fog.jpg) | ![HERO-crowthorne__day__overcast.jpg](../../../artifacts/shots/tracks/kyalami/HERO-crowthorne__day__overcast.jpg) | ![HERO-crowthorne__day__rain.jpg](../../../artifacts/shots/tracks/kyalami/HERO-crowthorne__day__rain.jpg) |
| **Crowthorne T1**<br/>TOD: day · wx: fog | **Crowthorne T1**<br/>TOD: day · wx: overcast | **Crowthorne T1**<br/>TOD: day · wx: rain |
| ![HERO-crowthorne__day__wet.jpg](../../../artifacts/shots/tracks/kyalami/HERO-crowthorne__day__wet.jpg) | ![HERO-crowthorne__dusk__dry.jpg](../../../artifacts/shots/tracks/kyalami/HERO-crowthorne__dusk__dry.jpg) | ![HERO-crowthorne__night__dry.jpg](../../../artifacts/shots/tracks/kyalami/HERO-crowthorne__night__dry.jpg) |
| **Crowthorne T1**<br/>TOD: day · wx: wet | **Crowthorne T1**<br/>TOD: dusk · wx: dry | **Crowthorne T1**<br/>TOD: night · wx: dry |

#### Mine headgear — weather & lighting

| | | |
|:---:|:---:|:---:|
| ![HERO-headgear__day__fog.jpg](../../../artifacts/shots/tracks/kyalami/HERO-headgear__day__fog.jpg) | ![HERO-headgear__day__overcast.jpg](../../../artifacts/shots/tracks/kyalami/HERO-headgear__day__overcast.jpg) | ![HERO-headgear__day__rain.jpg](../../../artifacts/shots/tracks/kyalami/HERO-headgear__day__rain.jpg) |
| **Mine headgear**<br/>TOD: day · wx: fog | **Mine headgear**<br/>TOD: day · wx: overcast | **Mine headgear**<br/>TOD: day · wx: rain |
| ![HERO-headgear__day__wet.jpg](../../../artifacts/shots/tracks/kyalami/HERO-headgear__day__wet.jpg) | ![HERO-headgear__dusk__dry.jpg](../../../artifacts/shots/tracks/kyalami/HERO-headgear__dusk__dry.jpg) | ![HERO-headgear__night__dry.jpg](../../../artifacts/shots/tracks/kyalami/HERO-headgear__night__dry.jpg) |
| **Mine headgear**<br/>TOD: day · wx: wet | **Mine headgear**<br/>TOD: dusk · wx: dry | **Mine headgear**<br/>TOD: night · wx: dry |


### Findings

| ID | Severity | Finding |
|----|----------|---------|
| K1 | Low | Pit motorhomes ~0.32 m buried — `groundUnder` pads needed |
| K2 | Fixed | Windpump dam trough +0.12 m |
| K3 | Info | 15 trees guard-dropped (parallel-straight fold) |
| K4 | Lighting | Night frames dark — `furniture.lamp: "none"` (expected) |
| K5 | Weather | Rain/wet/fog/overcast verified on hero anchors |

## Fixes in this PR

- Windpump dam approach slab +0.12 m (`js/circuits/scenery/kyalami.js`)
- Survey doc + 36 committed JPEGs
