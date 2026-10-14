# Zolder — circuit survey (2026-10-14)

**Layout:** 4.010 km OSM trace (2002–present), 10 turns, clockwise, `theme: green`, day.  
**Evidence:** local TLX headless captures (`npx serve -l 3456`, `shot.mjs` batch); node VM audits.  
**Brief:** `docs/tracks/zolder.md` · **Data:** `js/circuits/zolder.js` · **Dressing:** `js/circuits/scenery/zolder.js`

## Code map

| Piece | Role |
| --- | --- |
| `js/circuits/zolder.js` | `TrackDefs` entry: OSM centreline, `startFrac: 0.1226`, `sceneryStartFrac: 0`, `ownPitStraight: true`, `terrainOuter: 110`, Limburg palette, 10 `turns[]` apex fractions, `furniture.tree: "fir"`. |
| `js/circuits/scenery/zolder.js` | Lazy `TrackScenery.zolder(api)` — global heath (sand verges, pine ranks, `forestEdge`, armco, depth plantation), then 16 named blocks + fast-sweeper pass + distant `mountain()` terril. |
| `js/track/tracks.js` | Registers `zolder` in `Tracks.LIST`; `buildProps` loads scenery closure; applies generic furniture unless def overrides. |
| `tests/data/landmarks/zolder.json` | Required `modelGroup` ids: `zolder-main-grandstand`, `zolder-sf-museum`, `zolder-villeneuve-poles`, `zolder-sterrenwacht`. |
| Shared builders | `js/track/scenery/nature.js` (`pine`, `forestEdge`, `spectatorHill` / `crowdBank`), `city.js` (`building`, facade `detail`), `structures.js` (`guardrail`, `tyreWall`, `grandstandEx`). |
| Frame debt | `_sceneryShift ≈ 0.844`: pit/S/F props use `sl()`; corner landmarks use authored `K()`. Sterrenwacht clubhouse is intentionally behind pit offices on the racing fold (`docs/tracks/zolder.md` §6). |

## Theme and models

- **Identity:** pale sand run-off on Scots pine heath; club-circuit greys, not glamour.
- **Hero models (required):** open-rake S/F tribune (`emitOpenStand` in `zolder-main-grandstand`), museum hall, five-pole Villeneuve paddock memorial, Sterrenwacht drum building.
- **Kit:** armco rails, mesh debris fence, stacked tyres, panel hoardings; no night lamps (`furniture.lamp: "none"`).
- **Skyline:** soft `mountain()` terril NW of outer loop (~s 0.14, gap 280 m) — bearing uncertain, reads in paddock orbit shots.

## Screenshots (≤15)

Captured at `/opt/cursor/artifacts/zolder-survey/` (TLX, working tree, Oct 2026).

| # | File | Frac / cam | Notes |
| --- | --- | --- | --- |
| 1 | `01-pit-straight-orbit.png` | 0.0 orbit | Pit lane, garages, S/F gantry, outer-loop curve; terril mound visible infield. |
| 2 | `02-sf-grandstand.png` | 0.012 trackside | Camera too tight on stand cladding — use orbit for tribune read. |
| 3 | `03-villeneuve-poles.png` | 0.028 trackside | Five-pole memorial + paddock; plinth seating adjusted in this PR. |
| 4 | `04-earste-chicane-park.png` | 0.035 park | T1 sand traps, tyres, spectator hill outside. |
| 5 | `05-t1-orbit.png` | 0.0376 orbit | Earste chicane context in pine bowl. |
| 6 | `06-sterrenwacht.png` | 0.18 trackside | Forest wall; clubhouse not in frame (frame-debt placement). |
| 7 | `07-kanaalbocht-park.png` | 0.194 park | Kanaalbocht sand ridge + barriers. |
| 8 | `08-bianchi-park.png` | 0.35 park | Lucien Bianchi infield corner. |
| 9 | `09-villeneuve-chicane.png` | 0.433 trackside | Villeneuve chicane stand + pine; memorial set back. |
| 10 | `10-kleine-chicane.png` | 0.567 park | T6 enclosed chicane. |
| 11 | `11-hairpin-park.png` | 0.715 park | Bolderberg hairpin cockpit — stand + pine outside. |
| 12 | `12-terlamen.png` | 0.863 trackside | Terlamen entry grandstand + hoarding. |
| 13 | `13-back-sweeper-eye.png` | 0.55 eye | Mid-lap pine corridor. |
| 14 | `14-pine-cinematic.png` | 0.75 cinematic | Fast section through plantation. |
| 15 | `15-layout-orbit.png` | 0.5 orbit high | Lap geometry + sand patches; good layout QA frame. |

## Findings

### Geometry / road

- **Centreline:** `verify-track` OK — min node radius 7.28 m @ node 23 (hw 7.5 m), **surface folds 0**.
- **Layout caveat:** Game ships 4.01 km / 10-turn present layout; historic 15-turn F1 layout is documented only (`docs/tracks/zolder.md`).

### Scenery / landmarks

- **S/F read:** Permanent tribune + museum + camera tower present; `ownPitStraight` suppresses generic 7-box stand clip.
- **Villeneuve:** Paddock five-pole sculpture present; chicane memorial remains single low plaque building (correct restraint).
- **Sterrenwacht:** Model builds, but **frame debt** hides it from corner trackside views — visible only from pit-fold probes, not from T2 driving line.
- **Terril:** Soft mountain visible from pit orbit; not obvious on back-straight eye-level shots (acceptable skyline cue).
- **Suppressed vegetation:** `verify-track` warns `suppressed pine=1 tree=3` (guard drops on tight fold) — within fleet norms.

### Audits (pre-fix baseline → post-fix)

| Check | Baseline (survey) | After PR fixes |
| --- | --- | --- |
| float | 0 | 0 |
| clip severe | 0 | 0 |
| buried (ground) | 7 (within baseline cap 7) | **5** (pit offices off audit; poles 0.27 m — trade vs floating plinth) |
| flatCoplanar | 1 (tyre stack self-pair @ structures.js) | 1 |
| props tris | 307418 | ~307k (unchanged band) |

### Visual / perf

- **Strengths:** Sand verges read distinctly; outer `forestEdge` + depth pines sell Limburg plantation; chicanes have graded sand + tyres.
- **Issues noted:** Earste `spectatorHill` `crowdBank` still ~0.30 m buried (engine helper; within baseline). S/F `trackside` capture framing poor. Hairpin/Terlamen stands read as simple blocks at distance (acceptable for club scale).
- **Perf:** ~252k total verts / ~206k props — typical classic circuit; no extra browser groups run this session.

## Ranked improvements

1. **Frame / Sterrenwacht visibility** — Needs coordinated `startFrac` / `sceneryStartFrac` probe (`docs/tracks/START-LINES.md`), not scenery-only nudge. High player value, **high risk**.
2. **Terril bearing** — Reposition or strengthen silhouette once a sourced bearing exists. Medium value, low risk.
3. **Earste crowd bank seating** — Pass terrain lift into `spectatorHill` opts (likely shared `nature.js` knob). Low–medium value, medium risk (fleet API).
4. **Suppressed pine/tree at fold** — Hand-place or widen `OWNED` near T1 outside trees. Low value, low risk.
5. **Chicane memorial legibility** — Optional subtle sign texture; keep restraint. Low value.

## Fixes in this PR (zolder files only)

- Terrain-seated **pit team offices** (`clubBuilding` modelGroups) — ground-audit removed ~0.51 m burial on `building()` calls.
- **Villeneuve poles** plinth/pole base re-seated on terrain (survey floating plinth).
- **S/F tribune** `emitOpenStand` plinth lift +0.03 m (0.03 m stand burial).

## Verification

```sh
node tools/track/verify-track.cjs zolder
node tools/track/audit-circuit.cjs zolder
```
