# Imola circuit survey (2026-10-14)

Autodromo Enzo e Dino Ferrari — parkland ribbon along the Santerno, anticlockwise,
`classic: true`, DAY / green theme. This note maps the implementation, records
visual findings, and ranks follow-ups.

**Reference brief:** `docs/tracks/imola.md` (FIA 2025 corner table, palette, landmarks).

### Capture status (course correction 2026-10-14)

Shared batch weather/time-of-day support is landing in a separate PR (**tools: shared
shot tooling for circuit surveys**, from `claude/f1-game-project-26h3ng`). Until that
merges, this branch does **not** change `tools/shot/*`, `apex-eval`, `.gitignore`, or
guard baselines.

- **Committed to git:** survey prose + `js/circuits/scenery/imola.js` fixes only.
- **Shot plan:** 32 frames (sector landmarks × dry midday) + **6 hero views** ×
  (dusk, night, overcast, rain, fog, wet) after rebase — cap **30–36** total with
  weather/lighting on **4–6** anchors only.
- **Local only (not committed; `artifacts/` gitignored until shared PR):**
  `artifacts/shots/tracks/imola/`. A partial batch was stopped at 38 files; filenames
  include weather tags but **`shot.mjs` did not apply `__apex.weather()`** on this
  branch — treat every frame as **dry / day** until re-captured after the tooling PR.

Game weather API (for the follow-up pass): `__apex.weather("dry"|"wet"|"rain"|"overcast"|"fog")`;
time of day: `setTimeOfDay("day"|"dawn"|"dusk"|"night")` (`docs/DEBUG-HOOKS.md`). Imola def
has `night: false` but night lighting still exercises bespoke `lampPost` rows in scenery.

---

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

## 2. Sector landmark map (dry midday — intended panels)

Paths below are **relative to repo root**; files land after rebase + `artifacts/shots/tracks/**`
gitignore exception. Early agent captures also exist under `/opt/cursor/artifacts/imola-*.png`
(14-frame pilot set).

| Sector | Fraction | Landmark | Local path (dry midday) |
|--------|----------|----------|-------------------------|
| S1 | 0.00 | Start / pit / Partenza | `artifacts/shots/tracks/imola/s1-start_day-dry.png` |
| S1 | 0.075 | Tamburello / Senna | `artifacts/shots/tracks/imola/s1-tamburello_day-dry.png` |
| S1 | 0.10 | Santerno footbridge | `artifacts/shots/tracks/imola/s1-bridge_day-dry.png` |
| S1 | 0.12 | Villeneuve | `artifacts/shots/tracks/imola/s1-villeneuve_day-dry.png` |
| S1 | 0.28 | Tosa | `artifacts/shots/tracks/imola/s1-tosa_day-dry.png` |
| S2 | 0.35 | Piratella | `artifacts/shots/tracks/imola/s2-piratella_day-dry.png` |
| S2 | 0.48 | Acque Minerali | `artifacts/shots/tracks/imola/s2-acque_day-dry.png` |
| S2 | 0.50 | Park hollow / vineyards | `artifacts/shots/tracks/imola/s2-hollow_day-dry.png` |
| S2 | 0.65 | Variante Alta | *(pending rebase batch)* |
| S3 | 0.80 | Rivazza | *(pending rebase batch)* |
| S3 | 0.92 | Variante Bassa | *(pending rebase batch)* |
| S3 | 0.99 | Pit tower | *(pending rebase batch)* |

Built lap length: **4871.25 m** (verify-track); FIA reference 4909 m — timing uses built metric (`docs/tracks/imola.md` §7).

### S1 — Sector 1 (dry midday panels)

Filenames only until `artifacts/shots/tracks/imola/` is committed (shared tooling PR).

| | | |
|:---:|:---:|:---:|
| `s1-start_day-dry.png` | `s1-tamburello_day-dry.png` | `s1-bridge_day-dry.png` |
| Start / pit straight | Tamburello / Senna | Santerno footbridge |
| `s1-villeneuve_day-dry.png` | `s1-tosa_day-dry.png` | |
| Villeneuve chicane | Tosa hairpin | |

### S2 — Sector 2 (dry midday panels)

| | | |
|:---:|:---:|:---:|
| `s2-piratella_day-dry.png` | `s2-acque_day-dry.png` | `s2-hollow_day-dry.png` |
| Piratella climb | Acque Minerali | Park hollow |

### S3 — Sector 3

*Rivazza, Variante Bassa, and pit-tower frames scheduled in the post-rebase 32-frame batch
(pilot set: `/opt/cursor/artifacts/imola-07-rivazza.png`, `imola-08-variante-bassa.png`,
`imola-09-pit-tower.png`).*

---

## 3. Weather / lighting matrix (blocked — follow-up after shared tooling PR)

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

Planned grid row example (after rebase, 3 per row under `artifacts/shots/tracks/imola/`):

| | | |
|:---:|:---:|:---:|
| Acque dry midday | Acque dusk | Acque night |
| Acque rain | Acque fog | Acque overcast |

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
| Committed PNG panels | **Pending** shared shot tooling + gitignore exception |

---

*Survey author: Cursor cloud agent, 2026-10-14. Re-capture via `artifacts/shots/tracks/imola/batch.json` after rebasing onto shared shot tooling PR.*
