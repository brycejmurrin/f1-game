# Kyalami — circuit survey (2026-10-14)

**Branch survey:** `cursor/kyalami-survey-c736`  
**Layout:** 2016 rebuild, 4.526 m OSM trace, anticlockwise (`reverse: true`).  
**Brief:** `docs/tracks/kyalami.md`  
**Screenshots:** `artifacts/shots/tracks/kyalami/` (**36** JPEG frames, q≈80, ≤1280px; weather variants deferred until shared shot batch lands).

## Code map

| Layer | Path | Role |
|--------|------|------|
| Def | `js/circuits/kyalami.js` | OSM `path`, `elevations` (~45 m relief), `hwZones` / `bankZones`, `turns` (13 apexes), `furniture` (sparse acacia), `pit: { side: -1 }`, `sceneryCoordinates: "racing"`, `terrainOuter: 120`, straw-gold `pal` |
| Scenery | `js/circuits/scenery/kyalami.js` | ~576 lines: Highveld dressing, five `required` `modelGroup`s, iron terraces, kit hospitality, estate houses on `groundUnder` |
| Registry | `js/track/circuit-meta.js` | Meta row mirrors def (`reverse`, theme `green`, `terrainOuter: 120`) |
| Build | `js/track/tracks.js` | Resolves def, applies `transformSceneryApi` when `reverse` (side/range compensation — see scenery `IN = (side) => -side`) |
| Landmarks | `tests/data/landmarks/kyalami.json` | pit-block, race-control, main-grandstand, headgear, windpump, clubhouse |
| Lighting | `js/lighting/presets.js` | Full `kyalami|*` grid; day dry tuned for thin highveld air (`fogDensityMul` 0.55) |

### Scenery structure (by lap fraction, racing space)

1. **Veld scatter** — `every(30)` acacia + `every(24)` scrub; `openArea()` clears start/finish and plateau 0.36–0.48.
2. **Pit straight (s≈0.93–0.02)** — brick pit block + race control, main GS (−1), sponsor hoarding, motorhomes, kit hospitality, clubhouse, gantry.
3. **Crowthorne (s≈0.06–0.12)** — terrace, gravel, red tyre wall, marshal post.
4. **Mid-lap** — Barbecue gravel, spectator hills, guardrails both sides, headgear model (s≈0.34), climb terrace (0.47).
5. **Leeukop / high point (s≈0.56)** — gravel, windpump + dam (0.70).
6. **Plunge (s≈0.88)** — yellow tyre wall, final terrace.
7. **Horizon** — ridge ring, four flat-top mine dumps (`addFrustum`), Midrand houses/office blocks, koppies `mountain()`, firebreak `groundPatch` strips.

## Theme and models

- **Palette:** straw-gold grass `[0.48, 0.43, 0.20]` in def; scenery uses `THORN`, `EARTH`, `BRICK`, `OXIDE`, `DUMP` (cyanided sand).
- **Vegetation:** `api.acacia` flat crowns (not `tree()` umbrellas); columnar blue-gum windbreaks at 52–60 m; `forestEdge` bands; woodlot grids 95–125 m on outside (+1).
- **Architecture:** face brick + corrugated iron terraces; no cantilever grandstands.
- **Hero models (baked when pack live):** `kyalami-pit-block`, `kyalami-race-control`, `kyalami-main-grandstand`, `kyalami-headgear`, `kyalami-windpump`, `kyalami-clubhouse`.


## Offline audit (latest)

```
node tools/track/audit-circuit.cjs kyalami
```

| Check | Result |
|--------|--------|
| verify-track | OK, surface folds 0 |
| float / clip / coplanar | 0 |
| ground | buried **5** (baseline 6) after windpump dam tweak |

## Visual survey — panels

> Paths below are relative to this file. GitHub PR uses `raw.githubusercontent.com` on branch `cursor/kyalami-survey-c736`.

### Sector 1 — landmarks (day, dry)

| | | |
|:---:|:---:|:---:|
| ![S1-01-start](../../../artifacts/shots/tracks/kyalami/S1-01-start__day.jpg) | ![S1-02-main-gs](../../../artifacts/shots/tracks/kyalami/S1-02-main-gs__day.jpg) | ![S1-03-pit](../../../artifacts/shots/tracks/kyalami/S1-03-pit__day.jpg) |
| **Start / main straight (orbit)**<br/>TOD: day · wx: dry | **Main grandstand (trackside)**<br/>TOD: day · wx: dry | **Pit paddock (orbit)**<br/>TOD: day · wx: dry |
| ![S1-04-race-control](../../../artifacts/shots/tracks/kyalami/S1-04-race-control__day.jpg) | ![S1-05-crowthorne](../../../artifacts/shots/tracks/kyalami/S1-05-crowthorne__day.jpg) | ![S1-06-crowthorne-terrace](../../../artifacts/shots/tracks/kyalami/S1-06-crowthorne-terrace__day.jpg) |
| **Race control (trackside)**<br/>TOD: day · wx: dry | **T1 Crowthorne (chase)**<br/>TOD: day · wx: dry | **Crowthorne iron terrace**<br/>TOD: day · wx: dry |
| ![S1-07-jukskei](../../../artifacts/shots/tracks/kyalami/S1-07-jukskei__day.jpg) | ![S1-08-barbecue](../../../artifacts/shots/tracks/kyalami/S1-08-barbecue__day.jpg) | ![S1-09-sector1-mid](../../../artifacts/shots/tracks/kyalami/S1-09-sector1-mid__day.jpg) |
| **Jukskei Sweep**<br/>TOD: day · wx: dry | **Barbecue corner**<br/>TOD: day · wx: dry | **Sector 1 mid-lap**<br/>TOD: day · wx: dry |
| ![S1-10-hospitality](../../../artifacts/shots/tracks/kyalami/S1-10-hospitality__day.jpg) |  |  |
| **Paddock hospitality**<br/>TOD: day · wx: dry |  |  |

### Sector 2 — landmarks (day, dry)

| | | |
|:---:|:---:|:---:|
| ![S2-01-esses](../../../artifacts/shots/tracks/kyalami/S2-01-esses__day.jpg) | ![S2-02-headgear](../../../artifacts/shots/tracks/kyalami/S2-02-headgear__day.jpg) | ![S2-03-sunset](../../../artifacts/shots/tracks/kyalami/S2-03-sunset__day.jpg) |
| **The Esses**<br/>TOD: day · wx: dry | **Mine headgear (orbit)**<br/>TOD: day · wx: dry | **Sunset / climb**<br/>TOD: day · wx: dry |
| ![S2-04-climb-terrace](../../../artifacts/shots/tracks/kyalami/S2-04-climb-terrace__day.jpg) | ![S2-05-sector2](../../../artifacts/shots/tracks/kyalami/S2-05-sector2__day.jpg) | ![S2-06-clubhouse](../../../artifacts/shots/tracks/kyalami/S2-06-clubhouse__day.jpg) |
| **Climb iron terrace**<br/>TOD: day · wx: dry | **Sector 2 overview**<br/>TOD: day · wx: dry | **Clubhouse (orbit)**<br/>TOD: day · wx: dry |
| ![S2-07-broadcast](../../../artifacts/shots/tracks/kyalami/S2-07-broadcast__day.jpg) |  |  |
| **Broadcast compound**<br/>TOD: day · wx: dry |  |  |

### Sector 3 — landmarks (day, dry)

| | | |
|:---:|:---:|:---:|
| ![S3-01-leeukop](../../../artifacts/shots/tracks/kyalami/S3-01-leeukop__day.jpg) | ![S3-02-windpump](../../../artifacts/shots/tracks/kyalami/S3-02-windpump__day.jpg) | ![S3-03-plunge](../../../artifacts/shots/tracks/kyalami/S3-03-plunge__day.jpg) |
| **Leeukop high point**<br/>TOD: day · wx: dry | **Windpump + dam**<br/>TOD: day · wx: dry | **Plunge descent**<br/>TOD: day · wx: dry |
| ![S3-04-final](../../../artifacts/shots/tracks/kyalami/S3-04-final__day.jpg) | ![S3-05-horizon](../../../artifacts/shots/tracks/kyalami/S3-05-horizon__day.jpg) | ![S3-06-final-straight](../../../artifacts/shots/tracks/kyalami/S3-06-final-straight__day.jpg) |
| **Final corner**<br/>TOD: day · wx: dry | **Horizon / mine dumps (eye)**<br/>TOD: day · wx: dry | **Return to pit straight**<br/>TOD: day · wx: dry |
| ![S3-07-sector3-mid](../../../artifacts/shots/tracks/kyalami/S3-07-sector3-mid__day.jpg) |  |  |
| **Sector 3 mid-lap**<br/>TOD: day · wx: dry |  |  |

### Lighting variants (dry weather; four anchor views)

Time-of-day only (`__apex.setTimeOfDay`). Rain/wet/overcast/fog matrix **deferred** — rebase on shared tooling PR `tools: shared shot tooling for circuit surveys`.

| | | |
|:---:|:---:|:---:|
| ![LIT-01-start](../../../artifacts/shots/tracks/kyalami/LIT-01-start__dawn.jpg) | ![LIT-01-start](../../../artifacts/shots/tracks/kyalami/LIT-01-start__dusk.jpg) | ![LIT-01-start](../../../artifacts/shots/tracks/kyalami/LIT-01-start__night.jpg) |
| **Start straight**<br/>TOD: dawn · wx: dry | **Start straight**<br/>TOD: dusk · wx: dry | **Start straight**<br/>TOD: night · wx: dry |
| ![LIT-02-pit](../../../artifacts/shots/tracks/kyalami/LIT-02-pit__dawn.jpg) | ![LIT-02-pit](../../../artifacts/shots/tracks/kyalami/LIT-02-pit__dusk.jpg) | ![LIT-02-pit](../../../artifacts/shots/tracks/kyalami/LIT-02-pit__night.jpg) |
| **Pit complex**<br/>TOD: dawn · wx: dry | **Pit complex**<br/>TOD: dusk · wx: dry | **Pit complex**<br/>TOD: night · wx: dry |
| ![LIT-03-crowthorne](../../../artifacts/shots/tracks/kyalami/LIT-03-crowthorne__dawn.jpg) | ![LIT-03-crowthorne](../../../artifacts/shots/tracks/kyalami/LIT-03-crowthorne__dusk.jpg) | ![LIT-03-crowthorne](../../../artifacts/shots/tracks/kyalami/LIT-03-crowthorne__night.jpg) |
| **Crowthorne T1**<br/>TOD: dawn · wx: dry | **Crowthorne T1**<br/>TOD: dusk · wx: dry | **Crowthorne T1**<br/>TOD: night · wx: dry |
| ![LIT-04-headgear](../../../artifacts/shots/tracks/kyalami/LIT-04-headgear__dawn.jpg) | ![LIT-04-headgear](../../../artifacts/shots/tracks/kyalami/LIT-04-headgear__dusk.jpg) | ![LIT-04-headgear](../../../artifacts/shots/tracks/kyalami/LIT-04-headgear__night.jpg) |
| **Mine headgear**<br/>TOD: dawn · wx: dry | **Mine headgear**<br/>TOD: dusk · wx: dry | **Mine headgear**<br/>TOD: night · wx: dry |

### Findings (visual)

| ID | Severity | Finding |
|----|----------|---------|
| K1 | Low | Pit-straight **motorhomes** up to **0.32 m** buried on falling grade — needs `groundUnder` pads, not gap-only |
| K2 | Fixed | Windpump dam trough +0.12 m (`kyalami.js:406`) — buried 6→5 |
| K3 | Info | **15 trees** guard-dropped (parallel-straight fold at ~52 m gum rows) |
| K4 | Lighting | **Night:** `night: false` + `furniture.lamp: "none"` — expect dark veld; no floodlight pass (by design) |
| K5 | Deferred | Weather panels (rain/wet/fog/overcast) blocked until batch `weather` in shared `shot.mjs` |

## Ranked improvements

1. Motorhome `groundUnder` pads (K1)
2. Windbreak distance / fold guard (K3)
3. Weather survey matrix after shared tooling merge
4. Turn-name signage at Crowthorne / Barbecue / Leeukop

## Fixes in this PR

- Windpump dam approach slab **+0.12 m**
- Survey doc + **36** committed JPEG frames under `artifacts/shots/tracks/kyalami/`

## Verify

```sh
node tools/track/verify-track.cjs kyalami
node tools/track/audit-circuit.cjs kyalami
```
