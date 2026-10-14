# Hockenheimring — circuit survey (2026-10-14)

**Scope:** `js/circuits/hockenheim.js` + `js/circuits/scenery/hockenheim.js` only.  
**Base:** `claude/f1-game-project-26h3ng`.  
**Screenshots:** `artifacts/shots/tracks/hockenheim/` (committed once shared PR `tools: shared shot tooling for circuit surveys` lands the `artifacts/shots/tracks/**` gitignore exception). Captures use stock `shot.mjs` (`--tod` only; batch `wx` pending that PR).

## Code map

| Piece | Path | Role |
|-------|------|------|
| Circuit def | `js/circuits/hockenheim.js` | OSM centreline, `theme: green`, `terrainOuter: 110`, elevation lobes, `hwZones` (Spitzkehre + Motodrom), `dressingExclusions` |
| Scenery | `js/circuits/scenery/hockenheim.js` | Hardtwald `forestEdge`, Motodrom terraces + required `modelGroup` stands, pit bays, gravel, kit rails/fences |
| Brief | `docs/tracks/hockenheim.md` | Palette, landmarks-by-`s`, modelling notes |
| Landmarks | `tests/data/landmarks/hockenheim.json` | Seven required model groups |
| Lighting | `js/lighting/presets.js` | Per `hockenheim\|{dawn,day,dusk,night}\|{dry,wet,rain,overcast,fog}` |
| Runtime weather/TOD | `js/agent/apex.js` `race(track, tod, wx)`; `G.weather()` enum `dry\|wet\|rain\|overcast\|fog` | In-game and `shot.mjs` `--tod`; batch `wx` not in stock shot yet |

**Sectors (racing lap):** `sectors: [0.318, 0.69]` — S1 pit/Nordkurve/Parabolika, S2 Ostkurve–forest, S3 Motodrom.

**Verify:** `node tools/track/verify-track.cjs hockenheim` — OK, 0 surface folds, min radius 6.14 m @ node 705.

## Theme and models

- **Forest:** `furniture.lamp: "none"` — no floodlight masts; night Motodrom relies on ambient/sky only.
- **Motodrom:** Stepped `motodromTerrace`, Südtribüne / Nordtribüne / Mercedes crown / videowall / pit bays (required).
- **Hero IDs:** see `tests/data/landmarks/hockenheim.json`.

## Panel grids — Sector coverage (day / dry)

PNG panels live under `artifacts/shots/tracks/hockenheim/` (PR embeds them; committed after shared shot tooling PR). Three columns per row:

| | | |
|:---:|:---:|:---:|
| `s1-pit-straight-day-dry.png` — S1 pit / start `s≈0.02` | `s1-nordkurve-day-dry.png` — S1 Nordtribüne `s≈0.055` | `s1-parabolika-entry-day-dry.png` — S1 Parabolika entry `s≈0.15` |
| `s1-parabolika-mid-day-dry.png` — S1 Parabolika mid `s≈0.25` | `s2-ostkurve-day-dry.png` — S2 Ostkurve `s≈0.335` | `s2-ostkurve-trackside-day-dry.png` — S2 Ostkurve trackside |
| `s2-spitzkehre-day-dry.png` — S2 Spitzkehre `s≈0.46` | `s2-forest-mid-day-dry.png` — S2 forest `s≈0.52` | `s2-forest-exit-day-dry.png` — S2 forest exit `s≈0.62` |
| `s3-motodrom-entry-day-dry.png` — S3 Motodrom entry `s≈0.76` | `s3-sachskurve-day-dry.png` — S3 Sachskurve in-car `s≈0.88` | `s3-videowall-day-dry.png` — S3 stadium screen `s≈0.882` |
| `s3-suedtribune-day-dry.png` — S3 Südtribüne `s≈0.935` | `lm-mercedes-tribune-day-dry.png` — LM Mercedes crown `s≈0.828` | `lm-mercedes-orbit-day-dry.png` — LM Mercedes orbit |
| `lm-infield-compound-day-dry.png` — LM infield `s≈0.89` | `lm-pit-bays-day-dry.png` — LM pit bays `s≈0.97` | `lm-haupttribune-day-dry.png` — LM Haupttribüne `s≈0.995` |

## Panel grids — Time of day (dry, four anchor views)

Stock `shot.mjs` supports `tod: dawn|day|dusk|night`. **Day** column uses sector frames above.

### Forest corridor (`s≈0.15`)

| Dawn | Day | Dusk |
|:---:|:---:|:---:|
| `tod-forest-dawn-dry.png` | (see S1 Parabolika entry) | `tod-forest-dusk-dry.png` |

| Night |
|:---:|
| `tod-forest-night-dry.png` |

### Spitzkehre (`s≈0.46`)

| Dawn | Day | Dusk |
|:---:|:---:|:---:|
| `tod-spitzkehre-dawn-dry.png` | (see S2 Spitzkehre) | `tod-spitzkehre-dusk-dry.png` |

| Night |
|:---:|
| `tod-spitzkehre-night-dry.png` |

### Motodrom bowl (`s≈0.88`)

| Dawn | Day | Dusk |
|:---:|:---:|:---:|
| `tod-motodrom-dawn-dry.png` | (see S3 videowall / Sachskurve) | `tod-motodrom-dusk-dry.png` |

| Night |
|:---:|
| `tod-motodrom-night-dry.png` |

### Start / pit straight (`s≈0.0`)

| Dawn | Day | Dusk |
|:---:|:---:|:---:|
| `tod-start-dawn-dry.png` | (see S1 pit straight) | `tod-start-dusk-dry.png` |

| Night |
|:---:|
| `tod-start-night-dry.png` |

**Extra TOD:** `s3-motodrom-entry-dusk-dry.png`, `s3-suedtribune-dusk-dry.png`.

## Weather variants — **pending shared shot tooling**

Batch `wx` (`dry|wet|rain|overcast|fog`) is landing in PR **tools: shared shot tooling for circuit surveys**. **Not re-run on this branch.** Planned re-capture on **4 anchors** (start, forest `0.15`, Spitzkehre `0.46`, Motodrom `0.88`) × **5 weather** × **day** (30 frames max for weather slice).

**Provisional local frames** (from aborted pre-revert batch; do not treat as CI evidence):  
`wx-{start,forest,spitzkehre,motodrom}-{wet,rain,overcast,fog}-day.png` (16 files on disk).

## Findings

| ID | Sev | Topic | Detail |
|----|-----|-------|--------|
| H-N1 | High (TOD) | Night lighting | `furniture.lamp: "none"` — Motodrom and pits have **no track lights**; `night` presets darken the bowl with little practical lighting (see TOD night row). |
| H-N2 | Med (TOD) | Dusk colour | Dusk preset warms Motodrom concrete; crowd bands stay readable (`js/lighting/presets.js` `hockenheim\|dusk\|dry`). |
| H-W1 | — | Weather | **Deferred** until shared `shot.mjs` batch `wx`; presets exist for all five wx at each TOD. |
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

1. Rebase → re-run **weather matrix** (4×5 day) via shared shot tooling.  
2. Night readability — optional low masts **only** if brief changes (`lamp: none` is intentional for forest).  
3. Ostkurve `forestEdge` inner offset on `[0.32,0.36]` only.  
4. Migrate `motodromTerrace` → shared `terrace()` (multi-circuit dedupe).  
5. Mercedes-Tribüne placement research (brief UNCERTAIN).

## Verify

```sh
node tools/track/verify-track.cjs hockenheim
node tools/track/audit-circuit.cjs hockenheim
```
