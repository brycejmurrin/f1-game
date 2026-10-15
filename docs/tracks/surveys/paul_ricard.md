# Paul Ricard (`paul_ricard`) — circuit survey (2026-10-15)

**Base brief:** `docs/tracks/paul_ricard.md`  
**Live:** https://brycejmurrin.github.io/f1-game/  
**Captures:** `../../../artifacts/shots/tracks/paul_ricard/` — **36 JPEGs** (q≈80, max width 1280px, under 300 KB), force-added. Captured with shared `shot.mjs` (`--weather`, `--jpeg`, `--present-timeout 90`, `--capture-retries 4`, `--wait 120`).  
**VM audits:** `node tools/track/audit-circuit.cjs paul_ricard` — OK on branch tip.

## Code map

| Layer | Path | Role |
|--------|------|------|
| Circuit def | `js/circuits/paul_ricard.js` | OSM centreline, `reverse: true`, `sceneryCoordinates: "racing"`, `hwZones`, `bankZones` |
| Scenery | `js/circuits/scenery/paul_ricard.js` | Draped Blue/Red runoff, pit mirror, aerodrome, landmarks |
| Landmarks | `tests/data/landmarks/paul_ricard.json` | Eight required `modelGroup` ids |
| Lighting | `js/lighting/presets.js` | `paul_ricard|<tod>|<wx>` |

## Capture set (36 frames)

| Bucket | Count |
|--------|------:|
| Sector anchor (Verrerie, day dry) | 1 |
| Five hero views × six weathers @ day | 30 |
| Extra TOD on pit (dawn/dusk/night) + chicane (dusk/night) | 5 |

Hero views: pit straight, Mistral chicane, aerodrome, Signes, Le Village. Weathers: dry, wet, rain, overcast, fog, storm.

## Sector panel

| Verrerie T1 |
|:---:|
| ![verrerie](../../../artifacts/shots/tracks/paul_ricard/s1-verrerie-day-dry.jpg) |
| verrerie · day · dry |

## Hero weather — pit straight (day)

| dry | wet | rain |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/paul_ricard/s1-pit-straight-day-dry.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s1-pit-straight-day-wet.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s1-pit-straight-day-rain.jpg) |
| pit straight · day · dry | pit straight · day · wet | pit straight · day · rain |

| overcast | fog | storm |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/paul_ricard/s1-pit-straight-day-overcast.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s1-pit-straight-day-fog.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s1-pit-straight-day-storm.jpg) |
| pit straight · day · overcast | pit straight · day · fog | pit straight · day · storm |

## Hero weather — Mistral chicane (day)

| dry | wet | rain |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/paul_ricard/s2-mistral-chicane-day-dry.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s2-mistral-chicane-day-wet.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s2-mistral-chicane-day-rain.jpg) |
| mistral chicane · day · dry | mistral chicane · day · wet | mistral chicane · day · rain |

| overcast | fog | storm |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/paul_ricard/s2-mistral-chicane-day-overcast.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s2-mistral-chicane-day-fog.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s2-mistral-chicane-day-storm.jpg) |
| mistral chicane · day · overcast | mistral chicane · day · fog | mistral chicane · day · storm |

## Hero weather — aerodrome (day)

| dry | wet | rain |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/paul_ricard/s2-aerodrome-wide-day-dry.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s2-aerodrome-wide-day-wet.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s2-aerodrome-wide-day-rain.jpg) |
| aerodrome wide · day · dry | aerodrome wide · day · wet | aerodrome wide · day · rain |

| overcast | fog | storm |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/paul_ricard/s2-aerodrome-wide-day-overcast.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s2-aerodrome-wide-day-fog.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s2-aerodrome-wide-day-storm.jpg) |
| aerodrome wide · day · overcast | aerodrome wide · day · fog | aerodrome wide · day · storm |

## Hero weather — Signes (day)

| dry | wet | rain |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/paul_ricard/s3-signes-day-dry.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s3-signes-day-wet.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s3-signes-day-rain.jpg) |
| signes · day · dry | signes · day · wet | signes · day · rain |

| overcast | fog | storm |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/paul_ricard/s3-signes-day-overcast.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s3-signes-day-fog.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s3-signes-day-storm.jpg) |
| signes · day · overcast | signes · day · fog | signes · day · storm |

## Hero weather — Le Village (day)

| dry | wet | rain |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/paul_ricard/s3-le-village-day-dry.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s3-le-village-day-wet.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s3-le-village-day-rain.jpg) |
| le village · day · dry | le village · day · wet | le village · day · rain |

| overcast | fog | storm |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/paul_ricard/s3-le-village-day-overcast.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s3-le-village-day-fog.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s3-le-village-day-storm.jpg) |
| le village · day · overcast | le village · day · fog | le village · day · storm |

## Time of day panels (dry)

### Pit straight

| day | dusk | night |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/paul_ricard/s1-pit-straight-day-dry.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s1-pit-straight-dusk-dry.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s1-pit-straight-night-dry.jpg) |
| pit straight · day · dry | pit straight · dusk · dry | pit straight · night · dry |

| dawn | | |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/paul_ricard/s1-pit-straight-dawn-dry.jpg) | | |
| pit straight · dawn · dry | | |

### Mistral chicane

| day | dusk | night |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/paul_ricard/s2-mistral-chicane-day-dry.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s2-mistral-chicane-dusk-dry.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s2-mistral-chicane-night-dry.jpg) |
| mistral chicane · day · dry | mistral chicane · dusk · dry | mistral chicane · night · dry |

## Weather / lighting notes

| Issue | Frames | Notes |
|-------|--------|--------|
| Runoff shimmer | chicane/signes day dry/wet | Less after runoff abut fix; SwiftShader still shows crawl |
| Night exposure | pit/chicane night dry | `night: false` on def — plateau reads very dark |
| Fog / storm | aerodrome, pit | Sky/fog tint matches presets; apron contrast drops in fog |
| Wet sheen | all heroes day wet | Road darker; runoff hue still readable |

## Scenery fixes (this PR)

Runoff `along` abut; shorter chicane bleacher brace; motorhome gap 70 m; airfield marker `terrainYAt`.

## Verification

```sh
node tools/track/verify-track.cjs paul_ricard
node tools/track/audit-circuit.cjs paul_ricard
```
