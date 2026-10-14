# Hungaroring — circuit survey (2026-10-14)

**Live:** [brycejmurrin.github.io/f1-game](https://brycejmurrin.github.io/f1-game/)  
**Evidence:** headless TLX captures under `artifacts/hungaroring-survey/` (15 frames, local path `/opt/cursor/artifacts/hungaroring-survey/` on the survey VM).

## Code map

| Piece | Path | Role |
|-------|------|------|
| Circuit def | `js/circuits/hungaroring.js` | OSM centreline, `sceneryStartFrac` 0.9825, `sceneryCoordinates: "racing"`, SRTM elevation, 14 FIA-aligned `turns`, `bankZones`, `ATM.dustyBowl` palette via `furniture` |
| Scenery closure | `js/circuits/scenery/hungaroring.js` | Lazy-loaded `TrackScenery.hungaroring`; frame helpers `sl()` / `au()` / `TURN()` for racing vs scenery origin |
| Engine entry | `js/track/tracks.js` → `buildProps` | Merges `def.scenery(api)` with generic kit; Hungaroring excludes generic foliage/lighting (`dressingExclusions`) |
| Brief | `docs/tracks/hungaroring.md` | Landmarks, 2025 T5 gravel note, frame audit table |
| Landmarks | `tests/data/landmarks/hungaroring.json` | Required `modelGroup`s: pit complex, main tribune, start gantry, village church |
| Verify | `node tools/track/verify-track.cjs hungaroring` | Build + centreline sanity |
| Audit | `node tools/track/audit-circuit.cjs hungaroring` | float / clip / coplanar / ground baselines |

**Frame debt:** `_sceneryShift` ≈ 0.903 — start-line hero props use `sl()` / `au(def.turns[i])`; do not drop `sceneryStartFrac` without a full reprobe (Estoril lesson).

## Theme and models

- **Theme:** `green`, **day**, hot Pannonian bowl — `pal` + `ATM.dustyBowl` (straw-olive grass, warm fog).
- **Elevation:** baked SRTM in `js/track/circuit-elevations.js` (~30 m peak-to-trough); `terrainOuter: 90` limits ribbon chord across the s≈0.56 crest.
- **Signature dressing:** poplar windbreak rows + airy akác crowns; stepped `spectatorHill` / `blanket` crowd on banking; 2024–25 pit slab + covered main tribune (`modelGroup`); tunnel stairheads; T5 exit gravel band (2025 FIA); countryside village + church outside the loop.
- **Asset pack:** generic Kenney pit props suppressed in favour of hand-built pit/tribune; 77 pack models prefetch on boot (shot harness).

## Screenshot index

| File | Lap `s` (racing) | View | Notes |
|------|------------------|------|-------|
| `01-start-park.png` | 0.00 | park | Pit building (L), tribune (R), start gantry |
| `02-pit-orbit.png` | 0.00 | orbit | Pit row + engine garages; dusty outfield |
| `03-main-straight-tribune.png` | 0.02 | trackside | Covered tribune terraces |
| `04-t1-downhill.png` | 0.09 | orbit | T1 plunge, amphitheatre banking, crowd patches |
| `05-t2-complex.png` | 0.12 | eye | Slow complex inside stands |
| `06-mid-sector.png` | 0.25 | orbit | Tree-lined middle sector |
| `07-t4-banked-left.png` | 0.36 | trackside | Banked left T4 |
| `08-t5-mogyorod-stand.png` | 0.43 | orbit | Turn 5 “Mogyoród” grandstand + hills |
| `09-t5-exit-gravel.png` | 0.45 | eye | Gravel margin (subtle at this distance) |
| `10-t67-chicane.png` | 0.49 | orbit | T6/T7 Driving Centre stand |
| `11-twisty-jumbotron.png` | 0.55 | orbit | Mid-sector jumbotron truss |
| `12-back-sector.png` | 0.66 | cinematic | Back of bowl, terraces |
| `13-t14-club-stand.png` | 0.882 | orbit | Club corner stand into main straight |
| `14-bowl-overview.png` | 0.97 | orbit | Wide bowl read |
| `15-t1-basin-amphitheatre.png` | 0.08 | orbit high | T1 basin grass patch, no water |

## Findings (visual + audits)

### Strengths

- Amphitheatre read is strong: banking backdrops, `spectatorHill` rings, and dusty palette sell the Hungarian summer bowl.
- Start/finish cluster matches the 2025 brief: long pit slab, deep covered tribune, gantry with start lights, tunnel mouths.
- Corner stands align to curated apex fractions (`T5`, `T67`, `T14`) after the 2026 frame audit.
- Centreline: **0 surface folds**; no floating props (float-audit 0).

### Issues observed

| Severity | Finding | Evidence |
|----------|---------|----------|
| Med | **Pit side vs real-world tribune** — def keeps `pit.side: -1` (paddock left); some photo sources show the opposite; flipping is a TrackPit / foundation blast-radius change. | Brief §pit note; `02-pit-orbit.png` |
| Med | **Pit building length** — authored ~128 m vs sourced >340 m (vertex budget); reads as a block, not full 2025 length. | `02-pit-orbit.png`, scenery comments |
| Low | **T5 exit gravel** — six narrow `groundPatch` strips; correct side (racing-left) but easy to miss at driving height. | `09-t5-exit-gravel.png`, audit OK |
| Low | **T1 area stands vs engine pit** — inside stands at authored 0.10/0.12 sit in `pit.keep` and are dropped (documented). | verify `guard drops` |
| Low | **Clip baseline** — 1 severe spot remains (≈1.34 m, `addPrism` × `addCone` @ racing 0.608, countryside church / tree class); within ratchet cap 1. | `clip-audit --why` |
| Low | **Blanket crowd overlap** — minor self-pairs at s≈0.856 (final sector); thinned in this pass. | clip pairing `blanket × blanket` |
| Perf | **Props ~238k tris** — dense but within identical compaction baseline; generic trees heavily suppressed (`tree=167` guard drops). | verify-track line |

No folded road, sunk water in T1 basin, or widespread floating lamps in this build (entry lamp float class was pits.js sweep metadata — S4 fixed fleet-wide).

## Ranked improvements (not all done here)

1. **Pit-side flip + TrackPit reprobe** — only if product accepts foundation churn; aligns tribune/pit with 2025 photos.
2. **Hero pit length** — extend `modernPit` LEN with a props-tris ratchet bump + LOD strip (garage door rhythm already at 16 bays).
3. **T5 gravel readability** — slightly wider patches or contrasting `MAT.ROCK` albedo; keep bounded (not surveyed 2025 dimensions).
4. **Turn 14 FIA concrete barrier** — needs located bridge endpoint (brief defers).
5. **Resolve church/tree severe clip** — separate cottage `addPrism` stacks from scattered conifers near s≈0.61 outside loop.
6. **Dynamics sculpture / entrance office** — unsourced GPS; skip until references exist.

## Fixes in this survey PR

- Restored **Hungarian tricolour** accent billboards (red / white / green) on main straight.
- **Village church:** lifted spire / separated roof prism (clears `ground-audit` flatCoplanar 1 → 0).
- **Final-sector crowd blankets:** sparser hashing above s≈0.84 to reduce blanket×blanket overlap.
- Removed one **akác** cluster that competed with the distant village silhouette (clip unchanged at baseline cap).

## Verification (this branch)

```text
node tools/track/verify-track.cjs hungaroring          → OK
node tools/track/audit-circuit.cjs hungaroring         → ok (ground flatCoplanar 0, coplanar 3/4 cap)
npm test -- tests/specs/hungaroring-foundation.spec.js   → 1/1 passed
```

Screenshots: 15 PNGs in survey artifacts folder (see index above).
