# Imola circuit survey (2026-10-14)

Autodromo Enzo e Dino Ferrari — parkland ribbon along the Santerno, anticlockwise,
`classic: true`, DAY / green theme. This note maps the implementation, records
visual findings, and ranks follow-ups.

**Reference brief:** `docs/tracks/imola.md` (FIA 2025 corner table, palette, landmarks).

**Survey shots:** **42** committed JPEGs in `artifacts/shots/tracks/imola/` (`git add -f`;
repo `artifacts/` remains gitignored). Raw URL base:
`https://raw.githubusercontent.com/brycejmurrin/f1-game/cursor/imola-survey-f9bd/artifacts/shots/tracks/imola/`.

---

## 1. Code map
## 1. Code map

| Layer | Path | Role |
|--------|------|------|
| Circuit def | `js/circuits/imola.js` | OSM centreline, `pit.side: -1`, `sceneryStartFrac: 0.495`, `terrainOuter: 120`, FIA sectors/turns, `bankZones`, `elevations`, `dressingExclusions` (foliage + generic lighting — bespoke lamps/trees in scenery). |
| Scenery | `js/circuits/scenery/imola.js` | LAZY `TrackScenery.imola(api)` — Santerno river chain, forestEdge belts, Tilke pit via `sl()` re-key, hero `modelGroup`s, `tieredBowl` / `grandstandEx` / `spectatorHill`, Emilia casali + vineyards. |
| Registry | `tools/manifest.cjs` | `imola` in `Tracks.LIST` (picker order). |
| Landmarks ratchet | `tests/data/landmarks/imola.json` | `imola-partenza-stands`, `imola-racetrack-tower`, `senna-memorial`, `imola-hill-villas`, `imola-tamburello-tribute-wall`. |
| Tests | `tests/specs/imola-foundation.spec.js` | Terrain, elevation, walls, night rebuild. |

### Frame debt (do not “fix” without survey)

- `sceneryStartFrac` 0.495 → `_sceneryShift` ≈ 0.509. Pit / S/F hero geometry uses `sl(f)` = `(f + SL) % 1` so engine fractions match the real start line (`docs/tracks/imola.md` §5).
- `K(s)` and helper `s` arguments stay in the **authored** scenery frame unless wrapped by `sl()`.

### Shared builders used heavily

- `forestEdge`, `grandstandEx`, `tieredBowl`, `spectatorHill`, `terrace` — `js/track/scenery/structures.js` / `nature.js`.
- `modelGroup`, `waterSurface`, `groundPatch` — scenery API (`docs/SCENERY-API.md`).

---

## 2. Screenshot panels (committed JPEGs)

**42 frames** under `artifacts/shots/tracks/imola/` (1280px wide, JPEG q≈80, <300 KB each). Filename weather tags reflect the batch recipe; capture used `shot.mjs` **time-of-day only** on this branch — treat non-`dry` weather filenames as **intent labels** until shared tooling re-shoot applies `__apex.weather()`.

### S1 — by landmark / variant

| | | |
|:---:|:---:|:---:|
| ![Santerno bridge · day · dry](../../../artifacts/shots/tracks/imola/s1-bridge_day-dry.jpg)<br/>Santerno bridge · day · dry | ![Santerno bridge · day · fog](../../../artifacts/shots/tracks/imola/s1-bridge_day-fog.jpg)<br/>Santerno bridge · day · fog | ![Santerno bridge · day · overcast](../../../artifacts/shots/tracks/imola/s1-bridge_day-overcast.jpg)<br/>Santerno bridge · day · overcast |
| ![Santerno bridge · day · rain](../../../artifacts/shots/tracks/imola/s1-bridge_day-rain.jpg)<br/>Santerno bridge · day · rain | ![Santerno bridge · day · wet](../../../artifacts/shots/tracks/imola/s1-bridge_day-wet.jpg)<br/>Santerno bridge · day · wet | ![Start / pit · day · dry](../../../artifacts/shots/tracks/imola/s1-start_day-dry.jpg)<br/>Start / pit · day · dry |
| ![Start / pit · day · fog](../../../artifacts/shots/tracks/imola/s1-start_day-fog.jpg)<br/>Start / pit · day · fog | ![Start / pit · day · overcast](../../../artifacts/shots/tracks/imola/s1-start_day-overcast.jpg)<br/>Start / pit · day · overcast | ![Start / pit · day · rain](../../../artifacts/shots/tracks/imola/s1-start_day-rain.jpg)<br/>Start / pit · day · rain |
| ![Start / pit · day · wet](../../../artifacts/shots/tracks/imola/s1-start_day-wet.jpg)<br/>Start / pit · day · wet | ![Tamburello · day · dry](../../../artifacts/shots/tracks/imola/s1-tamburello_day-dry.jpg)<br/>Tamburello · day · dry | ![Tamburello · day · fog](../../../artifacts/shots/tracks/imola/s1-tamburello_day-fog.jpg)<br/>Tamburello · day · fog |
| ![Tamburello · day · overcast](../../../artifacts/shots/tracks/imola/s1-tamburello_day-overcast.jpg)<br/>Tamburello · day · overcast | ![Tamburello · day · rain](../../../artifacts/shots/tracks/imola/s1-tamburello_day-rain.jpg)<br/>Tamburello · day · rain | ![Tamburello · day · wet](../../../artifacts/shots/tracks/imola/s1-tamburello_day-wet.jpg)<br/>Tamburello · day · wet |
| ![Tosa · day · dry](../../../artifacts/shots/tracks/imola/s1-tosa_day-dry.jpg)<br/>Tosa · day · dry | ![Tosa · day · fog](../../../artifacts/shots/tracks/imola/s1-tosa_day-fog.jpg)<br/>Tosa · day · fog | ![Tosa · day · overcast](../../../artifacts/shots/tracks/imola/s1-tosa_day-overcast.jpg)<br/>Tosa · day · overcast |
| ![Tosa · day · rain](../../../artifacts/shots/tracks/imola/s1-tosa_day-rain.jpg)<br/>Tosa · day · rain | ![Tosa · day · wet](../../../artifacts/shots/tracks/imola/s1-tosa_day-wet.jpg)<br/>Tosa · day · wet | ![Villeneuve · day · dry](../../../artifacts/shots/tracks/imola/s1-villeneuve_day-dry.jpg)<br/>Villeneuve · day · dry |
| ![Villeneuve · day · fog](../../../artifacts/shots/tracks/imola/s1-villeneuve_day-fog.jpg)<br/>Villeneuve · day · fog | ![Villeneuve · day · overcast](../../../artifacts/shots/tracks/imola/s1-villeneuve_day-overcast.jpg)<br/>Villeneuve · day · overcast | ![Villeneuve · day · rain](../../../artifacts/shots/tracks/imola/s1-villeneuve_day-rain.jpg)<br/>Villeneuve · day · rain |
| ![Villeneuve · day · wet](../../../artifacts/shots/tracks/imola/s1-villeneuve_day-wet.jpg)<br/>Villeneuve · day · wet |  |  |

### S2 — by landmark / variant

| | | |
|:---:|:---:|:---:|
| ![Acque Minerali · day · dry](../../../artifacts/shots/tracks/imola/s2-acque_day-dry.jpg)<br/>Acque Minerali · day · dry | ![Acque Minerali · day · fog](../../../artifacts/shots/tracks/imola/s2-acque_day-fog.jpg)<br/>Acque Minerali · day · fog | ![Acque Minerali · day · overcast](../../../artifacts/shots/tracks/imola/s2-acque_day-overcast.jpg)<br/>Acque Minerali · day · overcast |
| ![Acque Minerali · day · rain](../../../artifacts/shots/tracks/imola/s2-acque_day-rain.jpg)<br/>Acque Minerali · day · rain | ![Acque Minerali · day · wet](../../../artifacts/shots/tracks/imola/s2-acque_day-wet.jpg)<br/>Acque Minerali · day · wet | ![Variante Alta · day · dry · park](../../../artifacts/shots/tracks/imola/s2-alta_day-dry_park.jpg)<br/>Variante Alta · day · dry · park |
| ![Park hollow · day · dry](../../../artifacts/shots/tracks/imola/s2-hollow_day-dry.jpg)<br/>Park hollow · day · dry | ![Park hollow · day · overcast](../../../artifacts/shots/tracks/imola/s2-hollow_day-overcast.jpg)<br/>Park hollow · day · overcast | ![Park hollow · day · rain](../../../artifacts/shots/tracks/imola/s2-hollow_day-rain.jpg)<br/>Park hollow · day · rain |
| ![Piratella · day · dry](../../../artifacts/shots/tracks/imola/s2-piratella_day-dry.jpg)<br/>Piratella · day · dry | ![Piratella · day · fog](../../../artifacts/shots/tracks/imola/s2-piratella_day-fog.jpg)<br/>Piratella · day · fog | ![Piratella · day · overcast](../../../artifacts/shots/tracks/imola/s2-piratella_day-overcast.jpg)<br/>Piratella · day · overcast |
| ![Piratella · day · rain](../../../artifacts/shots/tracks/imola/s2-piratella_day-rain.jpg)<br/>Piratella · day · rain | ![Piratella · day · wet](../../../artifacts/shots/tracks/imola/s2-piratella_day-wet.jpg)<br/>Piratella · day · wet |  |

### S3 — by landmark / variant

| | | |
|:---:|:---:|:---:|
| ![Variante Bassa · day · dry · orbit](../../../artifacts/shots/tracks/imola/s3-bassa_day-dry_orbit.jpg)<br/>Variante Bassa · day · dry · orbit | ![Pit tower · day · dry · eye](../../../artifacts/shots/tracks/imola/s3-pit-tower_day-dry_eye.jpg)<br/>Pit tower · day · dry · eye | ![Rivazza · day · dry · trackside](../../../artifacts/shots/tracks/imola/s3-rivazza_day-dry_trackside.jpg)<br/>Rivazza · day · dry · trackside |

### By time-of-day + weather (filename)

#### `day-dry`

| | | |
|:---:|:---:|:---:|
| ![Acque Minerali · day · dry](../../../artifacts/shots/tracks/imola/s2-acque_day-dry.jpg)<br/>Acque Minerali · day · dry | ![Variante Alta · day · dry · park](../../../artifacts/shots/tracks/imola/s2-alta_day-dry_park.jpg)<br/>Variante Alta · day · dry · park | ![Variante Bassa · day · dry · orbit](../../../artifacts/shots/tracks/imola/s3-bassa_day-dry_orbit.jpg)<br/>Variante Bassa · day · dry · orbit |
| ![Santerno bridge · day · dry](../../../artifacts/shots/tracks/imola/s1-bridge_day-dry.jpg)<br/>Santerno bridge · day · dry | ![Park hollow · day · dry](../../../artifacts/shots/tracks/imola/s2-hollow_day-dry.jpg)<br/>Park hollow · day · dry | ![Piratella · day · dry](../../../artifacts/shots/tracks/imola/s2-piratella_day-dry.jpg)<br/>Piratella · day · dry |
| ![Pit tower · day · dry · eye](../../../artifacts/shots/tracks/imola/s3-pit-tower_day-dry_eye.jpg)<br/>Pit tower · day · dry · eye | ![Rivazza · day · dry · trackside](../../../artifacts/shots/tracks/imola/s3-rivazza_day-dry_trackside.jpg)<br/>Rivazza · day · dry · trackside | ![Start / pit · day · dry](../../../artifacts/shots/tracks/imola/s1-start_day-dry.jpg)<br/>Start / pit · day · dry |
| ![Tamburello · day · dry](../../../artifacts/shots/tracks/imola/s1-tamburello_day-dry.jpg)<br/>Tamburello · day · dry | ![Tosa · day · dry](../../../artifacts/shots/tracks/imola/s1-tosa_day-dry.jpg)<br/>Tosa · day · dry | ![Villeneuve · day · dry](../../../artifacts/shots/tracks/imola/s1-villeneuve_day-dry.jpg)<br/>Villeneuve · day · dry |

#### `day-fog`

| | | |
|:---:|:---:|:---:|
| ![Acque Minerali · day · fog](../../../artifacts/shots/tracks/imola/s2-acque_day-fog.jpg)<br/>Acque Minerali · day · fog | ![Santerno bridge · day · fog](../../../artifacts/shots/tracks/imola/s1-bridge_day-fog.jpg)<br/>Santerno bridge · day · fog | ![Piratella · day · fog](../../../artifacts/shots/tracks/imola/s2-piratella_day-fog.jpg)<br/>Piratella · day · fog |
| ![Start / pit · day · fog](../../../artifacts/shots/tracks/imola/s1-start_day-fog.jpg)<br/>Start / pit · day · fog | ![Tamburello · day · fog](../../../artifacts/shots/tracks/imola/s1-tamburello_day-fog.jpg)<br/>Tamburello · day · fog | ![Tosa · day · fog](../../../artifacts/shots/tracks/imola/s1-tosa_day-fog.jpg)<br/>Tosa · day · fog |
| ![Villeneuve · day · fog](../../../artifacts/shots/tracks/imola/s1-villeneuve_day-fog.jpg)<br/>Villeneuve · day · fog |  |  |

#### `day-overcast`

| | | |
|:---:|:---:|:---:|
| ![Acque Minerali · day · overcast](../../../artifacts/shots/tracks/imola/s2-acque_day-overcast.jpg)<br/>Acque Minerali · day · overcast | ![Santerno bridge · day · overcast](../../../artifacts/shots/tracks/imola/s1-bridge_day-overcast.jpg)<br/>Santerno bridge · day · overcast | ![Park hollow · day · overcast](../../../artifacts/shots/tracks/imola/s2-hollow_day-overcast.jpg)<br/>Park hollow · day · overcast |
| ![Piratella · day · overcast](../../../artifacts/shots/tracks/imola/s2-piratella_day-overcast.jpg)<br/>Piratella · day · overcast | ![Start / pit · day · overcast](../../../artifacts/shots/tracks/imola/s1-start_day-overcast.jpg)<br/>Start / pit · day · overcast | ![Tamburello · day · overcast](../../../artifacts/shots/tracks/imola/s1-tamburello_day-overcast.jpg)<br/>Tamburello · day · overcast |
| ![Tosa · day · overcast](../../../artifacts/shots/tracks/imola/s1-tosa_day-overcast.jpg)<br/>Tosa · day · overcast | ![Villeneuve · day · overcast](../../../artifacts/shots/tracks/imola/s1-villeneuve_day-overcast.jpg)<br/>Villeneuve · day · overcast |  |

#### `day-rain`

| | | |
|:---:|:---:|:---:|
| ![Acque Minerali · day · rain](../../../artifacts/shots/tracks/imola/s2-acque_day-rain.jpg)<br/>Acque Minerali · day · rain | ![Santerno bridge · day · rain](../../../artifacts/shots/tracks/imola/s1-bridge_day-rain.jpg)<br/>Santerno bridge · day · rain | ![Park hollow · day · rain](../../../artifacts/shots/tracks/imola/s2-hollow_day-rain.jpg)<br/>Park hollow · day · rain |
| ![Piratella · day · rain](../../../artifacts/shots/tracks/imola/s2-piratella_day-rain.jpg)<br/>Piratella · day · rain | ![Start / pit · day · rain](../../../artifacts/shots/tracks/imola/s1-start_day-rain.jpg)<br/>Start / pit · day · rain | ![Tamburello · day · rain](../../../artifacts/shots/tracks/imola/s1-tamburello_day-rain.jpg)<br/>Tamburello · day · rain |
| ![Tosa · day · rain](../../../artifacts/shots/tracks/imola/s1-tosa_day-rain.jpg)<br/>Tosa · day · rain | ![Villeneuve · day · rain](../../../artifacts/shots/tracks/imola/s1-villeneuve_day-rain.jpg)<br/>Villeneuve · day · rain |  |

#### `day-wet`

| | | |
|:---:|:---:|:---:|
| ![Acque Minerali · day · wet](../../../artifacts/shots/tracks/imola/s2-acque_day-wet.jpg)<br/>Acque Minerali · day · wet | ![Santerno bridge · day · wet](../../../artifacts/shots/tracks/imola/s1-bridge_day-wet.jpg)<br/>Santerno bridge · day · wet | ![Piratella · day · wet](../../../artifacts/shots/tracks/imola/s2-piratella_day-wet.jpg)<br/>Piratella · day · wet |
| ![Start / pit · day · wet](../../../artifacts/shots/tracks/imola/s1-start_day-wet.jpg)<br/>Start / pit · day · wet | ![Tamburello · day · wet](../../../artifacts/shots/tracks/imola/s1-tamburello_day-wet.jpg)<br/>Tamburello · day · wet | ![Tosa · day · wet](../../../artifacts/shots/tracks/imola/s1-tosa_day-wet.jpg)<br/>Tosa · day · wet |
| ![Villeneuve · day · wet](../../../artifacts/shots/tracks/imola/s1-villeneuve_day-wet.jpg)<br/>Villeneuve · day · wet |  |  |


---

## 3. Weather / lighting matrix (filename tags; re-shoot with shared tooling)

**Hero anchors** (4–6 views only): start, Tamburello, Tosa, Acque Minerali, Piratella,
Rivazza.

| Condition | `tod` | `weather` | What to check on re-capture |
|-----------|-------|-----------|------------------------------|
| Dry midday | `day` | `dry` | Baseline palette / green theme |
| Golden hour | `dusk` | `dry` | Sun azimuth vs `pal.sunDir`; stand glass |
| Dawn | `dawn` | `dry` | Fog height vs Acque mist planes |
| Night | `night` | `dry` | Bespoke `lampPost` halogens on pit straight, Tosa belt, Rivazza; tower windows |
| Overcast | `day` | `overcast` | Flat ambient; crowd/readability |
| Rain | `day` | `rain` | Wet road, spray, no rain-streak artifacts |
| Wet road | `day` | `wet` | Grip visual vs dry |
| Fog | `day` | `fog` | Engine fog vs authored `acque-mist-*` patches (double-fog risk) |

Panels for each filename tag are in §2.

### Weather / lighting backlog (findings to confirm on re-capture)

| ID | Severity | Topic | Hypothesis |
|----|----------|-------|------------|
| W1 | Medium | Night + `night: false` | Floodlight gate may dim bespoke lamps — verify `lightState()` / lamp cap on pit and Rivazza `along()` rows. |
| W2 | Medium | Fog + Acque mist | Authored mist `terrainPatch` at 0.45–0.54 may stack with `weather("fog")` — watch grey wash and z-fight on horizontal planes. |
| W3 | Low | Rain on river | Overlapping `riverSurface` slabs may shimmer when wet — coplanar baseline already allows ribbon overlap. |
| W4 | Low | Dusk sky | `pal.zenith` / `horizon` green theme vs warm sunset — acceptable stylization unless HUD clips. |

---

## 4. Node-VM audit (current tip)

```
audit-circuit imola: verify OK, float 0, clip 3 severe (at baseline), coplanar 3,
props ~258k tris, ground buried 12 / unsupported 2 (within baseline).
```

Centreline: **0 surface folds**; min radius 6.19 m @ node 852.

---

## 5. Visual findings (dry captures + audits)

### Strengths

- Strong **tifosi** palette (crimson stands, Ferrari-home wordmark, red crowd accents).
- **Santerno** reads as a continuous green-brown ribbon on the pit straight.
- Hero landmarks register at race speed: tower, Partenza marker, Senna bronze, footbridge.
- **Elevation story** visible in orbit shots (river flat → Piratella climb → Rivazza drop).
- Acque Minerali **mist planes** and dark `forestEdge` sell the park-in-a-loop mood.

### Issues observed

| ID | Severity | Location | Notes |
|----|----------|----------|-------|
| I1 | Medium | Tosa `tieredBowl` | Thin metal `roof: true` slabs fought crowd geometry — **fixed** (`roof: false`). |
| I2 | Medium | S/F – Tamburello trees | `forestEdge` + `tree()` ranks: floating trunks / bare poles. |
| I3 | Low | Tosa trackside | Forest wall blocks the hairpin from `trackside` cameras. |
| I4 | Low | Rivazza | Trackside cam can sit inside stand fascia → z-fight. |
| I5 | Low | Paddock | Tan placeholder pads on main straight orbit — terrain patch / verge. |
| I6 | Info | Piratella clip | Severe pairs @ ~0.35 within baseline cap 3. |
| I7 | Info | Perf | ~258k props tris; acceptable for a dressed classic circuit. |

---

## 6. Fixes applied (`cursor/imola-survey-f9bd`)

| Change | File | Rationale |
|--------|------|-----------|
| `tieredBowl` **roof: false** at Tosa | `scenery/imola.js` | Removes fighting metal roof slabs. |
| Hospitality **motorhome** gaps +4 m | same | Buried 13→12 within baseline. |
| **`imola-hill-villas`** base +0.35 m | same | Shallower hillside bury. |

---

## 7. Ranked improvements (not done here)

1. **Tosa camera / forest** — Thin `forestEdge` on `0.30–0.32` (I3).
2. **Tamburello tree line** — Trunk footing vs `terrainYAt` (I2).
3. **Rivazza trackside** — Camera offset or fascia clearance (I4).
4. **Piratella prop clip** — Stagger casali / church grid (I6).
5. **S/F tan pads** — Verge continuity (I5).
6. **Post-rebase capture** — 32-frame sector sweep + 6-hero weather matrix (§3).

---

## 8. Verification

| Check | Result |
|-------|--------|
| `node tools/track/verify-track.cjs imola` | OK, 0 folds |
| `node tools/track/audit-circuit.cjs imola` | OK |
| `npm test -- tests/specs/imola-foundation.spec.js` | passed (2/2) on scenery tip |
| Committed JPEG panels | **42** in `artifacts/shots/tracks/imola/` (`git add -f`) |

---

*Survey author: Cursor cloud agent, 2026-10-14. Re-capture via `artifacts/shots/tracks/imola/batch.json` after rebasing onto shared shot tooling PR.*
