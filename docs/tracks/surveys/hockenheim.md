# Hockenheimring — circuit survey (2026-10-14)

**Scope:** `js/circuits/hockenheim.js` + `js/circuits/scenery/hockenheim.js` only.  
**Base:** `claude/f1-game-project-26h3ng`.  
**Screenshots:** `artifacts/shots/tracks/hockenheim/*.jpg` (**36** frames, `git add -f`; JPEG q≈80, max width 1280px, &lt;300 KB). Official `shot.mjs` batch (`--jpeg --present-timeout 90 --capture-retries 4 --wait 120`, SwiftShader).

## Code map

| Piece | Path | Role |
|-------|------|------|
| Circuit def | `js/circuits/hockenheim.js` | OSM centreline, `theme: green`, `terrainOuter: 110`, elevation lobes, `hwZones` (Spitzkehre + Motodrom), `dressingExclusions` |
| Scenery | `js/circuits/scenery/hockenheim.js` | Hardtwald `forestEdge`, Motodrom terraces + required `modelGroup` stands, pit bays, gravel, kit rails/fences |
| Brief | `docs/tracks/hockenheim.md` | Palette, landmarks-by-`s`, modelling notes |
| Landmarks | `tests/data/landmarks/hockenheim.json` | Seven required model groups |
| Lighting | `js/lighting/presets.js` | Per `hockenheim\|{dawn,day,dusk,night}\|{dry,wet,rain,overcast,fog}` |
| Runtime weather/TOD | `js/agent/apex.js` `race(track, tod, wx)`; `shot.mjs` `--tod` + `--weather` / batch `weather` | Shared shot tooling on `cursor/shared-shot-tooling-5b45` (merged into this branch) |

**Sectors (racing lap):** `sectors: [0.318, 0.69]` — S1 pit/Nordkurve/Parabolika, S2 Ostkurve–forest, S3 Motodrom.

**Verify:** `node tools/track/verify-track.cjs hockenheim` — OK, 0 surface folds, min radius 6.14 m @ node 705.

## Theme and models

- **Forest:** `furniture.lamp: "none"` — no floodlight masts; night Motodrom relies on ambient/sky only.
- **Motodrom:** Stepped `motodromTerrace`, Südtribüne / Nordtribüne / Mercedes crown / videowall / pit bays (required).
- **Hero IDs:** see `tests/data/landmarks/hockenheim.json`.

## Panel grids — Sector & landmark (day / dry) (12)

| | | |
|:---:|:---:|:---:|
| ![lm-mercedes-tribune-day-dry.jpg](../../../artifacts/shots/tracks/hockenheim/lm-mercedes-tribune-day-dry.jpg)<br/>**lm-mercedes-tribune** · TOD day · wx dry | ![lm-pit-bays-day-dry.jpg](../../../artifacts/shots/tracks/hockenheim/lm-pit-bays-day-dry.jpg)<br/>**lm-pit-bays** · TOD day · wx dry | ![s1-nordkurve-day-dry.jpg](../../../artifacts/shots/tracks/hockenheim/s1-nordkurve-day-dry.jpg)<br/>**s1-nordkurve** · TOD day · wx dry |
| ![s1-parabolika-entry-day-dry.jpg](../../../artifacts/shots/tracks/hockenheim/s1-parabolika-entry-day-dry.jpg)<br/>**s1-parabolika-entry** · TOD day · wx dry | ![s1-pit-straight-day-dry.jpg](../../../artifacts/shots/tracks/hockenheim/s1-pit-straight-day-dry.jpg)<br/>**s1-pit-straight** · TOD day · wx dry | ![s2-ostkurve-day-dry.jpg](../../../artifacts/shots/tracks/hockenheim/s2-ostkurve-day-dry.jpg)<br/>**s2-ostkurve** · TOD day · wx dry |
| ![s2-ostkurve-trackside-day-dry.jpg](../../../artifacts/shots/tracks/hockenheim/s2-ostkurve-trackside-day-dry.jpg)<br/>**s2-ostkurve-trackside** · TOD day · wx dry | ![s2-spitzkehre-day-dry.jpg](../../../artifacts/shots/tracks/hockenheim/s2-spitzkehre-day-dry.jpg)<br/>**s2-spitzkehre** · TOD day · wx dry | ![s3-motodrom-entry-day-dry.jpg](../../../artifacts/shots/tracks/hockenheim/s3-motodrom-entry-day-dry.jpg)<br/>**s3-motodrom-entry** · TOD day · wx dry |
| ![s3-sachskurve-day-dry.jpg](../../../artifacts/shots/tracks/hockenheim/s3-sachskurve-day-dry.jpg)<br/>**s3-sachskurve** · TOD day · wx dry | ![s3-suedtribune-day-dry.jpg](../../../artifacts/shots/tracks/hockenheim/s3-suedtribune-day-dry.jpg)<br/>**s3-suedtribune** · TOD day · wx dry | ![s3-videowall-day-dry.jpg](../../../artifacts/shots/tracks/hockenheim/s3-videowall-day-dry.jpg)<br/>**s3-videowall** · TOD day · wx dry |

## Panel grids — Time of day (dry weather) (12)

| | | |
|:---:|:---:|:---:|
| ![tod-forest-dawn-dry.jpg](../../../artifacts/shots/tracks/hockenheim/tod-forest-dawn-dry.jpg)<br/>**forest** · TOD dawn · wx dry | ![tod-forest-dusk-dry.jpg](../../../artifacts/shots/tracks/hockenheim/tod-forest-dusk-dry.jpg)<br/>**forest** · TOD dusk · wx dry | ![tod-forest-night-dry.jpg](../../../artifacts/shots/tracks/hockenheim/tod-forest-night-dry.jpg)<br/>**forest** · TOD night · wx dry |
| ![tod-motodrom-dawn-dry.jpg](../../../artifacts/shots/tracks/hockenheim/tod-motodrom-dawn-dry.jpg)<br/>**motodrom** · TOD dawn · wx dry | ![tod-motodrom-dusk-dry.jpg](../../../artifacts/shots/tracks/hockenheim/tod-motodrom-dusk-dry.jpg)<br/>**motodrom** · TOD dusk · wx dry | ![tod-motodrom-night-dry.jpg](../../../artifacts/shots/tracks/hockenheim/tod-motodrom-night-dry.jpg)<br/>**motodrom** · TOD night · wx dry |
| ![tod-spitzkehre-dawn-dry.jpg](../../../artifacts/shots/tracks/hockenheim/tod-spitzkehre-dawn-dry.jpg)<br/>**spitzkehre** · TOD dawn · wx dry | ![tod-spitzkehre-dusk-dry.jpg](../../../artifacts/shots/tracks/hockenheim/tod-spitzkehre-dusk-dry.jpg)<br/>**spitzkehre** · TOD dusk · wx dry | ![tod-spitzkehre-night-dry.jpg](../../../artifacts/shots/tracks/hockenheim/tod-spitzkehre-night-dry.jpg)<br/>**spitzkehre** · TOD night · wx dry |
| ![tod-start-dawn-dry.jpg](../../../artifacts/shots/tracks/hockenheim/tod-start-dawn-dry.jpg)<br/>**start** · TOD dawn · wx dry | ![tod-start-dusk-dry.jpg](../../../artifacts/shots/tracks/hockenheim/tod-start-dusk-dry.jpg)<br/>**start** · TOD dusk · wx dry | ![tod-start-night-dry.jpg](../../../artifacts/shots/tracks/hockenheim/tod-start-night-dry.jpg)<br/>**start** · TOD night · wx dry |

## Panel grids — Weather (day TOD) (12)

| | | |
|:---:|:---:|:---:|
| ![wx-forest-fog-day.jpg](../../../artifacts/shots/tracks/hockenheim/wx-forest-fog-day.jpg)<br/>**forest** · TOD day · wx fog | ![wx-forest-rain-day.jpg](../../../artifacts/shots/tracks/hockenheim/wx-forest-rain-day.jpg)<br/>**forest** · TOD day · wx rain | ![wx-forest-wet-day.jpg](../../../artifacts/shots/tracks/hockenheim/wx-forest-wet-day.jpg)<br/>**forest** · TOD day · wx wet |
| ![wx-motodrom-fog-day.jpg](../../../artifacts/shots/tracks/hockenheim/wx-motodrom-fog-day.jpg)<br/>**motodrom** · TOD day · wx fog | ![wx-motodrom-rain-day.jpg](../../../artifacts/shots/tracks/hockenheim/wx-motodrom-rain-day.jpg)<br/>**motodrom** · TOD day · wx rain | ![wx-motodrom-wet-day.jpg](../../../artifacts/shots/tracks/hockenheim/wx-motodrom-wet-day.jpg)<br/>**motodrom** · TOD day · wx wet |
| ![wx-spitzkehre-fog-day.jpg](../../../artifacts/shots/tracks/hockenheim/wx-spitzkehre-fog-day.jpg)<br/>**spitzkehre** · TOD day · wx fog | ![wx-spitzkehre-rain-day.jpg](../../../artifacts/shots/tracks/hockenheim/wx-spitzkehre-rain-day.jpg)<br/>**spitzkehre** · TOD day · wx rain | ![wx-spitzkehre-wet-day.jpg](../../../artifacts/shots/tracks/hockenheim/wx-spitzkehre-wet-day.jpg)<br/>**spitzkehre** · TOD day · wx wet |
| ![wx-start-fog-day.jpg](../../../artifacts/shots/tracks/hockenheim/wx-start-fog-day.jpg)<br/>**start** · TOD day · wx fog | ![wx-start-rain-day.jpg](../../../artifacts/shots/tracks/hockenheim/wx-start-rain-day.jpg)<br/>**start** · TOD day · wx rain | ![wx-start-wet-day.jpg](../../../artifacts/shots/tracks/hockenheim/wx-start-wet-day.jpg)<br/>**start** · TOD day · wx wet |

**Total committed shots:** 36

## Findings

| ID | Topic | Detail |
|----|-------|--------|
| H-N1 | High (TOD) | Night lighting | `furniture.lamp: "none"` — Motodrom and pits have **no track lights**; `night` presets darken the bowl with little practical lighting (see TOD night row). |
| H-N2 | Med (TOD) | Dusk colour | Dusk preset warms Motodrom concrete; crowd bands stay readable (`js/lighting/presets.js` `hockenheim\|dusk\|dry`). |
| H-W1 | Low | Weather | Rain/fog darken forest corridor; wet adds road sheen. **Re-captured** with official `shot.mjs` `weather` jobs (36-frame cap). |
| H1 | Med | Spitzkehre clip | Verge `bush` vs hairpin stands — **fixed** (skip `s∈(0.40,0.50)`, stands +4 m). |
| H2 | Med | Motodrom clip | Outer terrace vs kit `neonTowerBody` @ `s≈0.864` — **fixed** (terrace ends `0.858`, gap 14 m). |
| H3 | Low | Ostkurve camera | Default `trackside` spawns inside `forestEdge` canopy — use orbit or larger `dist` (added trackside frame with `dist:55`). |
| H4 | Low | Süd tribune | `trackside` at `s≈0.935` clips through stand shell — prefer `park` / orbit. |
| H5 | Info | Forest cull | 74 trees + 7 pines suppressed by road cull (expected). |
| H6 | Info | flatCoplanar | 1 spot within baseline (`crowdBank` × shared structure — engine-side). |

**Perf:** ~216k prop verts; forest instancing heavy but stable in 32-frame local batch.

## Fixes applied (this PR, circuit files only)

1. Spitzkehre runoff: no verge `bush`; hairpin temp stands +4 m outward.  
2. Motodrom outer terrace shortened and set back to clear kit tower clip.

No shared baseline edits on this branch (clip cap remains fleet default; post-fix **0 severe** vs cap 2).

## Ranked backlog

1. Optional overcast column if fleet adds a fifth wx slot within cap.  
2. Night readability — optional low masts **only** if brief changes (`lamp: none` is intentional for forest).  
3. Ostkurve `forestEdge` inner offset on `[0.32,0.36]` only.  
4. Migrate `motodromTerrace` → shared `terrace()` (multi-circuit dedupe).  
5. Mercedes-Tribüne placement research (brief UNCERTAIN).

## Verify

```sh
node tools/track/verify-track.cjs hockenheim
node tools/track/audit-circuit.cjs hockenheim
```
