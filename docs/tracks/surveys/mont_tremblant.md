# Mont-Tremblant — circuit survey (2026-10-14)

**Circuit id:** `mont_tremblant`  
**Brief:** `docs/tracks/mont_tremblant.md`  
**Live:** [brycejmurrin.github.io/f1-game](https://brycejmurrin.github.io/f1-game/) (picker → MONT-TREMBLANT)

**Capture policy:** Shots live at `artifacts/shots/tracks/mont_tremblant/` (gitignored until the shared tooling PR *tools: shared shot tooling for circuit surveys* adds `!artifacts/shots/tracks/**`). This branch commits the **22-frame day-dry sector + landmark set** via the PR artifact bundle; **weather/TOD matrix is deferred** until that PR lands and this branch rebases (see [Weather / lighting (deferred)](#weather--lighting-deferred)).

## Code map

| Piece | Path | Role |
|--------|------|------|
| Centreline + metadata | `js/circuits/mont_tremblant.js` | OSM-stitched path (`path.len` 4243 m), `startFrac` 0.6465, `sceneryStartFrac` 0, `theme: "green"`, `terrainOuter` 110, `furniture.tree: "fir"`, `furniture.lamp: "none"`, 15 `turns[]` |
| Scenery closure | `js/circuits/scenery/mont_tremblant.js` | Armco, forest wall, esses tunnel, ski massif, Lac Ouimet, five `modelGroup` landmarks |
| Registry | `tests/data/landmarks/mont_tremblant.json` | Required model ids |
| Lighting | `js/lighting/presets.js` | Full grid; day dry donor from Montreal (`docs/LIGHTING.md`) |

**Frame debt:** `_sceneryShift` ≈ 0.28 — paddock/start use `sl()`; Hump, Bridge, Namerow, esses use authored `K(s)`.

**Harness weather (for follow-up):** `__apex.race(track, tod, weather)` and `__apex.weather("dry"|"wet"|"rain"|"overcast"|"fog")` (`js/agent/apex.js`). Batch `shot.mjs` on deploy branch supports `--tod` only until the shared tooling PR.

## Theme and models

Laurentian enclosure (armco + conifers), club-scale paddock, natural banks over bleachers, Lac Ouimet outfield water, ski-mountain skyline. Fir/pine instancing + hardwood at lit edges; five required landmarks per `landmarks/mont_tremblant.json`.

---

## By sector — day dry (22 frames)

Sectors per def: S1 `s < 0.305`, S2 `0.305–0.666`, S3 `> 0.666`.  
Command (after tooling PR): `node tools/shot/shot.mjs mont_tremblant --batch scratch/mont_tremblant-survey-day-dry.json`

### Sector 1 — pit straight, T1, esses

| Frame | Frame | Frame |
|-------|-------|-------|
| `s1-01-paddock-orbit__day-dry.png` — s≈0.01 paddock | `s1-02-start-stand__day-dry.png` — start grandstandEx | `s1-03-turn1-crest__day-dry.png` — T1 crest |
| `s1-04-ski-skyline__day-dry.png` — infield massif | `s1-05-esses-chase__day-dry.png` — esses chase | `s1-06-esses-tunnel__day-dry.png` — cutting canopy |

### Sector 2 — downhill, T4–T5, Carousel, Lac Ouimet

| Frame | Frame | Frame |
|-------|-------|-------|
| `s2-07-downhill-sweep__day-dry.png` — fast sweep | `s2-08-t4-spectator-bank__day-dry.png` — T4 spectatorHill | `s2-09-t5-hardwood__day-dry.png` — T5 run-off |
| `s2-10-lac-ouimet__day-dry.png` — Lac Ouimet waterBand | `s2-11-carousel__day-dry.png` — Carousel arc | |

### Sector 3 — Hump, climb, Bridge, Namerow, Paddock Bend

| Frame | Frame | Frame |
|-------|-------|-------|
| `s3-12-hump-chase__day-dry.png` — The Hump | `s3-13-hump-skyline__day-dry.png` — treeline + ridge | `s3-14-climbing-90s__day-dry.png` — T8–T9 |
| `s3-15-bridge-chase__day-dry.png` — service bridge | `s3-16-namerow__day-dry.png` — Namerow hairpin | `s3-17-paddock-bend__day-dry.png` — Paddock Bend |

### Landmarks — day dry

| Frame | Frame | Frame |
|-------|-------|-------|
| `lm-control-tower__day-dry.png` — tremblant-control-tower | `lm-hump-crest-cabin__day-dry.png` — tremblant-hump-crest | `lm-bridge-deck__day-dry.png` — tremblant-bridge |
| `lm-namerow-bank__day-dry.png` — tremblant-namerow-bank | `lm-paddock-bend-stand__day-dry.png` — tremblant-paddock-bend-stand | |

All filenames are under `artifacts/shots/tracks/mont_tremblant/` once the shared tooling PR enables committing that tree; the open PR embeds the day-dry set as image panels.

---

## Weather / lighting (deferred)

**Status:** Not shipped on this PR. Rebase onto *tools: shared shot tooling for circuit surveys*, then capture **4–6 anchor views** × `{dusk-dry, night-dry, day-overcast, day-rain, day-fog, day-wet}` (30–36 frames total with sector coverage).

| Anchor | Frac | Cam | Planned variants |
|--------|------|-----|------------------|
| Paddock | 0.012 | orbit | dusk, night, overcast, rain |
| The Hump | 0.560 | park | dusk, night, wet, fog, rain |
| Bridge | 0.776 | park | dusk, night, overcast |
| Esses | 0.220 | eye | fog, overcast, rain |
| Namerow | 0.836 | trackside | dusk, wet |
| Carousel | 0.503 | orbit | night, overcast |

**Local-only WIP captures** (42-frame batch with experimental `--weather` patch, **not** on deploy `shot.mjs`; do not treat as regression baselines): `wx-paddock__*`, `wx-hump__*`, `wx-bridge__*`, `wx-esses__*` under the same directory.

### Weather / lighting backlog (fix after matrix re-run)

| Issue | Where | Notes |
|--------|--------|--------|
| No track lamps | Night anchors | `night: false`, `furniture.lamp: "none"` — forest reads black; expect Montreal-donor night grade only |
| Rain particles vs forest | wx-hump / esses | Check SSR wet mul + rain count vs canopy depth |
| Fog density vs ski massif | wx-hump fog | Preset `fogDensityMul` may flatten skyline contrast |
| Wet road without rain | day-wet | Damp shader only; verify kerb/runoff read |
| Sky/fog mismatch | overcast/rain | Donor from Montreal; look-survey deferred in `docs/LIGHTING.md` |

---

## Findings (geometry + dress)

| Severity | Topic | Evidence |
|----------|--------|----------|
| Low | Clip T5/Carousel | `clip-audit` 1 severe @ frac 0.473 (baseline cap 1); bush×trunk — triaged T5 understory, still at cap |
| Fixed | Paddock Bend vans | `motorhome()` low on grade → `terrainYAt` hand-seat boxes (same as pit apron) |
| Info | Tree guard drops | `verify-track`: suppressed tree=14 (fold guard) |
| Info | Props tris | 208396 tris post-fix, within ratchet |
| Watch | Start orbit framing | Orbit through `grandstandEx` shell — camera choice, not missing mesh |

### Ranked improvements (circuit-scoped)

1. Done — Paddock Bend van footing.  
2. After tooling PR — weather matrix + lighting backlog above.  
3. Clip 0.473 — further bush winnow on −1 s∈[0.46,0.50] if baseline ever tightens.  
4. Montreal donor replacement when look-survey slot opens.

## Verification

```text
node tools/track/verify-track.cjs mont_tremblant
→ OK mont_tremblant (surface folds 0, tree guard drops 14)

node tools/track/audit-circuit.cjs mont_tremblant
→ ok true; float 0; clip severe 1/1; coplanar 0; ground buried 1 (within baseline)
```
