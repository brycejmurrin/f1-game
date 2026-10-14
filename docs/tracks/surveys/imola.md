# Imola circuit survey (2026-10-14)

Autodromo Enzo e Dino Ferrari — parkland ribbon along the Santerno, anticlockwise,
`classic: true`, DAY / green theme. This note maps the implementation, records
visual findings from local TLX headless captures, and ranks follow-ups.

**Reference brief:** `docs/tracks/imola.md` (FIA 2025 corner table, palette, landmarks).  
**Evidence captures:** `/opt/cursor/artifacts/imola-*.png` (14 frames, ≤15 budget).

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

## 2. Theme, models, and corner read

| Lap fraction (racing) | Corner / zone | Screenshot | Read |
|----------------------|---------------|------------|------|
| 0.00 | Start / pit / Partenza | `imola-00-start-orbit.png`, `imola-00-start-chase.png`, `imola-09-pit-tower.png` | Tilke garages L, Partenza stands R, Racetrack Tower, crimson wordmark; river ribbon R; dense conifers on S/F straight. |
| 0.075 | Tamburello | `imola-01-tamburello-senna.png` | Senna memorial + tribute wall; forest line; some bare / mis-stacked tree trunks in foreground. |
| 0.10 | Santerno bridge | `imola-10-santerno-bridge.png` | `santerno-footbridge` model over river strips. |
| 0.12 | Villeneuve | `imola-02-villeneuve.png` | Chicane kerbs, gravel, outside stand. |
| 0.28 | Tosa | `imola-03-tosa.png`, `imola-03-tosa-after.png` | `tieredBowl` + `grandstandEx`; forestEdge blocks trackside sightlines. |
| 0.35 | Piratella | `imola-04-piratella.png`, `imola-04-piratella-after.png` | Hillside casali + `imola-hill-villas`; colorful bowl stand visible from uphill orbit. |
| 0.48 | Acque Minerali | `imola-05-acque-minerali.png` | Mist patches, dark hollow, stone-pine punctuation, gantry. |
| 0.50 | Park hollow | `imola-11-hollow-cinematic.png` | Emilia town boxes, vineyards, platani avenue. |
| 0.65 | Variante Alta | `imola-06-variante-alta-chase.png` | Sausage kerbs, tight tree walls (cockpit view). |
| 0.80 | Rivazza | `imola-07-rivazza.png` | Terrace + spectator hills; trackside cam can sit inside stand shell (z-fight on fascia). |
| 0.92 | Variante Bassa | `imola-08-variante-bassa.png` | Return to river straight. |

Built lap length: **4871.25 m** (verify-track); FIA reference 4909 m — timing uses built metric (`docs/tracks/imola.md` §7).

---

## 3. Node-VM audit baseline (pre-fix)

```
audit-circuit imola: verify OK, float 0, clip 3 severe (at baseline), coplanar 3,
props 257968 tris, ground buried 13 / unsupported 2 (within baseline).
```

Notable ground-audit sources: hospitality `motorhome` row (~0.7 m bury, by design ≤ baseline), overlapping `riverSurface` slabs (flatCoplanar, intentional ribbon), generic `billboard@city.js` unsupported (2, shared).

Centreline: **0 surface folds**; min radius 6.19 m @ node 852.

---

## 4. Visual findings (from captures)

### Strengths

- Strong **tifosi** palette (crimson stands, Ferrari-home wordmark, red crowd accents).
- **Santerno** reads as a continuous green-brown ribbon on the pit straight.
- Hero landmarks register at race speed: tower, Partenza marker, Senna bronze, footbridge.
- **Elevation story** visible in orbit shots (river flat → Piratella climb → Rivazza drop).
- Acque Minerali **mist planes** and dark `forestEdge` sell the park-in-a-loop mood.

### Issues observed

| ID | Severity | Location | Notes |
|----|----------|----------|-------|
| I1 | Medium | Tosa `tieredBowl` | Thin metal `roof: true` slabs fought crowd geometry — read as a broken brown slab on orbit (`imola-04-piratella.png` before fix). |
| I2 | Medium | S/F – Tamburello trees | `forestEdge` + `tree()` ranks: floating trunks / bare poles in `imola-01-tamburello-senna.png`. |
| I3 | Low | Tosa trackside | `imola-03-tosa.png`: forest wall blocks the hairpin; stand hard to frame from `trackside`. |
| I4 | Low | Rivazza | `imola-07-rivazza.png`: camera inside stand fascia → z-fight (trackside placement, not road). |
| I5 | Low | Paddock | Tan **placeholder pads** on main straight orbit (`imola-00-start-orbit.png`) — likely terrain patch / unfinished verge. |
| I6 | Info | Piratella clip | `clip-audit` severe pairs @ ~0.35: `emiliaCasale` / hillside church `addPrism` overlap (within fleet baseline cap 3). |
| I7 | Info | Perf | ~258k props tris, 77 baked models prefetched on boot; acceptable for a dressed classic circuit. |

No folded road, missing required landmarks, or float-audit failures on this tip.

---

## 5. Fixes applied this survey (branch `cursor/imola-survey-f9bd`)

| Change | File | Rationale |
|--------|------|-----------|
| `tieredBowl` **roof: false** at Tosa | `scenery/imola.js` | Removes fighting metal roof slabs; grandstandEx + bowl tiers retain seating read (`imola-04-piratella-after.png`). |
| Hospitality **motorhome** gaps 34→38, 37→41, 40→44 | same | Slightly shallower bury (ground-audit 13→12 buried) while staying within baseline. |
| **`imola-hill-villas`** base lifted +0.35 m | same | Reduces hillside bury (~0.71 m → ~0.44 m worst) without new coplanar pairs. |

---

## 6. Ranked improvements (not done here)

1. **Tosa camera / forest** — Thin `forestEdge` density on `0.30–0.32` or add a dedicated `trackside` anchor with cleared gap so the hairpin stand reads in replays (I3).
2. **Tamburello tree line** — Audit `tree()` vs `forestEdge` overlap near `0.04–0.08`; align trunk bases to `terrainYAt` (I2).
3. **Rivazza trackside** — Nudge default trackside offset at `0.80` in shot recipes only, or add scenery `rejBox` clearance on fascia (I4) — prefer engine camera table if fleet-wide.
4. **Piratella prop clip** — Separate `emiliaCasale` footprints or stagger church `put()` grid to drop one severe clip pair below baseline (I6).
5. **S/F tan pads** — Identify suppressing `terrainPatch` / pit apron mesh and replace with grass or gravel continuity (I5).
6. **DRS / aero window** — `docs/tracks/imola.md` notes gameplay aero is not the FIA 2025 main-straight DRS zone; separate physics/UI task.

---

## 7. Verification

| Check | Result |
|-------|--------|
| `node tools/track/verify-track.cjs imola` | OK, 0 folds |
| `node tools/track/audit-circuit.cjs imola` | OK (post-fix) |
| `npm test -- tests/specs/imola-foundation.spec.js` | `= run passed` (2/2) |
| Headless shots | 14 PNGs under `/opt/cursor/artifacts/` |

---

*Survey author: Cursor cloud agent, 2026-10-14. Re-run `shot.mjs` batch in `scratch/imola-survey-jobs.json` after scenery edits.*
