# Estoril — circuit survey (2026-10-14)

**Circuit id:** `estoril` · **Layout:** 4.182 km official (built ~4.14 km) · **Theme:** `green` / day · **Classic:** yes (last F1 GP 1996)

Live: [Apex 26 on GitHub Pages](https://brycejmurrin.github.io/f1-game/) · Brief: [`docs/tracks/estoril.md`](../estoril.md)

## Code map

| Layer | Path | Role |
|--------|------|------|
| Def | `js/circuits/estoril.js` | OSM centreline (`path`), `startFrac` 0, four elevation bumps, three `hwZones`, `bankZones` (T1, T7, T14 Parabolica via `turn: 14`), palette, `furniture`/`kit`/`standSet`, `dressingExclusions` |
| Scenery | `js/circuits/scenery/estoril.js` | Lazy `TrackScenery.estoril(api)` — stone-pine helper, scaffold stands, required `modelGroup`s, Serra de Sintra `mountain()`, inland ridge ring, gravel/tyre walls, Parabolica crowd |
| Registry | `js/track/tracks.js` | `LIST` entry loads def + resolves scenery callback |
| Landmarks | `tests/data/landmarks/estoril.json` | `estoril-pit-terrace`, `estoril-timing-tower`, `estoril-aldeia`, `estoril-deposito`, `estoril-moinho` |
| Shared builders | `js/track/scenery/build-props.js`, `nature.js` (`forestEdge`, `spectatorHill`), `models.js` | Engine merges def furniture (`tree: "broad"`, `treeCrown: "vase"`) with hand scenery |

**Frame rule:** No `sceneryStartFrac`. Fracs in scenery use engine space (`K()` only where the table is authored-frame; pit block documents engine fracs). See `docs/BUGS.md` / DEFECT-LEDGER estoril wave.

**Turn table:** 14 curated apexes; T14 (0.8225) is Parabolica Ayrton Senna — added after peak-picker missed the long constant-radius right.

**Weather / TOD API (game):** `__apex.setTimeOfDay("dawn"|"day"|"dusk"|"night")`, `__apex.weather("dry"|"wet"|"rain"|"overcast"|"fog")` (`docs/DEBUG-HOOKS.md`). Batch capture recipe: [`estoril-capture-jobs.json`](estoril-capture-jobs.json) (34 frames). **Committed PNG/JPEG path (after shared tooling PR):** `artifacts/shots/tracks/estoril/*.jpg`.

## Theme and models

- **Palette:** Atlantic haze — limewash, terracotta pantile, azulejo band, rust tube scaffold (`LIME`, `TILE`, `AZUL`, `TUBE` in scenery).
- **Vegetation:** Custom `stonePine()` (leaning trunk + parasol crown); `forestEdge` belts; hairpin `acacia()` cork-oak meadow; engine broad trees with vase crown.
- **Hero landmarks:** 30-bay pit terrace + timing tower on pit straight; `estoril-aldeia` church row; `estoril-deposito` water tank; `estoril-moinho` (contract landmark, **uncertain** on-site).
- **Backdrop:** Inland only — Serra de Sintra massif NW; no ocean sheet (`docs/tracks/estoril.md` §4).
- **Night:** `furniture.lamp: "none"` on the def — expect **no floodlight pass** on night shots until a circuit-scoped lamp plan exists (`lighting-tuner`).

## Measurements (node VM)

| Check | Baseline | After scenery fixes |
|--------|----------|---------------------|
| `verify-track` | OK | OK, 0 surface folds |
| Float | 0 | 0 |
| Clip severe | **2** | **1** (within baseline — aldeia×engine-tree cleared) |
| Coplanar | 0 | 0 |
| Ground | 0/0/0 | 0/0/0 |
| Props tris | 197 469 | ~177k (compaction `identical=true`) |

Centreline: min radius **7.49 m** @ node 115 (hw 7 m). Built length **4.140 km** vs official 4.182 km (OSM trace).

Command: `node tools/track/audit-circuit.cjs estoril`

---


## Survey panels (36 frames, JPEG ≤1280×, ~80 q)

Repo path: `artifacts/shots/tracks/estoril/`. Raw URL base: `https://raw.githubusercontent.com/brycejmurrin/f1-game/cursor/estoril-survey-ec36/artifacts/shots/tracks/estoril/`

### Sector coverage — day · dry

| ![s01-sf-straight-day-dry.jpg](../../../artifacts/shots/tracks/estoril/s01-sf-straight-day-dry.jpg) **s01** sf-straight · day · dry | ![s02-pit-terrace-day-dry.jpg](../../../artifacts/shots/tracks/estoril/s02-pit-terrace-day-dry.jpg) **s02** pit-terrace · day · dry | ![s03-timing-tower-day-dry.jpg](../../../artifacts/shots/tracks/estoril/s03-timing-tower-day-dry.jpg) **s03** timing-tower · day · dry |
| ![s04-t1-trackside-day-dry.jpg](../../../artifacts/shots/tracks/estoril/s04-t1-trackside-day-dry.jpg) **s04** t1-trackside · day · dry | ![s05-t1-apex-day-dry.jpg](../../../artifacts/shots/tracks/estoril/s05-t1-apex-day-dry.jpg) **s05** t1-apex · day · dry | ![s06-scaffold-main-day-dry.jpg](../../../artifacts/shots/tracks/estoril/s06-scaffold-main-day-dry.jpg) **s06** scaffold-main · day · dry |
| ![s07-aldeia-day-dry.jpg](../../../artifacts/shots/tracks/estoril/s07-aldeia-day-dry.jpg) **s07** Aldeia village · day · dry | ![s08-hairpin-day-dry.jpg](../../../artifacts/shots/tracks/estoril/s08-hairpin-day-dry.jpg) **s08** Hairpin · day · dry | ![s09-hairpin-camera-day-dry.jpg](../../../artifacts/shots/tracks/estoril/s09-hairpin-camera-day-dry.jpg) **s09** hairpin-camera · day · dry |
| ![s10-mid-gravel-day-dry.jpg](../../../artifacts/shots/tracks/estoril/s10-mid-gravel-day-dry.jpg) **s10** mid-gravel · day · dry | ![s11-moinho-day-dry.jpg](../../../artifacts/shots/tracks/estoril/s11-moinho-day-dry.jpg) **s11** Moinho landmark · day · dry | ![s12-esses-day-dry.jpg](../../../artifacts/shots/tracks/estoril/s12-esses-day-dry.jpg) **s12** Esses sector · day · dry |
| ![s13-deposito-day-dry.jpg](../../../artifacts/shots/tracks/estoril/s13-deposito-day-dry.jpg) **s13** Water tank (depósito) · day · dry | ![s14-late-sector-day-dry.jpg](../../../artifacts/shots/tracks/estoril/s14-late-sector-day-dry.jpg) **s14** late-sector · day · dry | ![s15-parabolica-stand-day-dry.jpg](../../../artifacts/shots/tracks/estoril/s15-parabolica-stand-day-dry.jpg) **s15** parabolica-stand · day · dry |
| ![s16-parabolica-chase-day-dry.jpg](../../../artifacts/shots/tracks/estoril/s16-parabolica-chase-day-dry.jpg) **s16** parabolica-chase · day · dry | ![s17-parabolica-gravel-day-dry.jpg](../../../artifacts/shots/tracks/estoril/s17-parabolica-gravel-day-dry.jpg) **s17** parabolica-gravel · day · dry | ![s18-terrace-stand-day-dry.jpg](../../../artifacts/shots/tracks/estoril/s18-terrace-stand-day-dry.jpg) **s18** terrace-stand · day · dry |
| ![s19-sintra-ridge-day-dry.jpg](../../../artifacts/shots/tracks/estoril/s19-sintra-ridge-day-dry.jpg) **s19** sintra-ridge · day · dry | ![s20-grid-eye-day-dry.jpg](../../../artifacts/shots/tracks/estoril/s20-grid-eye-day-dry.jpg) **s20** grid-eye · day · dry | — |

### Time of day — key landmarks · dry

| ![s21-pit-dusk-dry.jpg](../../../artifacts/shots/tracks/estoril/s21-pit-dusk-dry.jpg) **s21** pit · dusk · dry | ![s22-pit-dawn-dry.jpg](../../../artifacts/shots/tracks/estoril/s22-pit-dawn-dry.jpg) **s22** pit · dawn · dry | ![s24-parabolica-dusk-dry.jpg](../../../artifacts/shots/tracks/estoril/s24-parabolica-dusk-dry.jpg) **s24** parabolica · dusk · dry |
| ![s25-parabolica-dawn-dry.jpg](../../../artifacts/shots/tracks/estoril/s25-parabolica-dawn-dry.jpg) **s25** parabolica · dawn · dry | ![s27-aldeia-dusk-dry.jpg](../../../artifacts/shots/tracks/estoril/s27-aldeia-dusk-dry.jpg) **s27** Aldeia village · dusk · dry | ![s40-deposito-dusk-dry.jpg](../../../artifacts/shots/tracks/estoril/s40-deposito-dusk-dry.jpg) **s40** Water tank (depósito) · dusk · dry |

### Weather / lighting variants

| ![s29-pit-day-wet.jpg](../../../artifacts/shots/tracks/estoril/s29-pit-day-wet.jpg) **s29** Pit complex · day · wet | ![s30-pit-day-rain.jpg](../../../artifacts/shots/tracks/estoril/s30-pit-day-rain.jpg) **s30** Pit complex · day · rain | ![s31-pit-day-overcast.jpg](../../../artifacts/shots/tracks/estoril/s31-pit-day-overcast.jpg) **s31** Pit complex · day · overcast |
| ![s32-pit-day-fog.jpg](../../../artifacts/shots/tracks/estoril/s32-pit-day-fog.jpg) **s32** Pit complex · day · fog | ![s33-parabolica-day-wet.jpg](../../../artifacts/shots/tracks/estoril/s33-parabolica-day-wet.jpg) **s33** Parabolica · day · wet | ![s34-parabolica-day-rain.jpg](../../../artifacts/shots/tracks/estoril/s34-parabolica-day-rain.jpg) **s34** Parabolica · day · rain |
| ![s35-parabolica-day-overcast.jpg](../../../artifacts/shots/tracks/estoril/s35-parabolica-day-overcast.jpg) **s35** Parabolica · day · overcast | ![s36-parabolica-day-fog.jpg](../../../artifacts/shots/tracks/estoril/s36-parabolica-day-fog.jpg) **s36** Parabolica · day · fog | ![s37-esses-day-wet.jpg](../../../artifacts/shots/tracks/estoril/s37-esses-day-wet.jpg) **s37** Esses · day · wet |
| ![s38-aldeia-day-fog.jpg](../../../artifacts/shots/tracks/estoril/s38-aldeia-day-fog.jpg) **s38** Aldeia · day · fog | — | — |


---

## Findings

### Strengths
- Pit straight reads as Estoril: limewash terrace, azulejo band, timing tower, open scaffold stands with spectator blocks.
- Parabolica banking (`turn: 14`), triple gravel patches, striped awning stand, `spectatorHill` crowd bank.
- Inland Sintra backdrop; stone pines lean with wind hash; no ocean sheet.

### Issues (ranked)
| P | Issue | Sector | Status |
|---|--------|--------|--------|
| 1 | Engine broad trees through `estoril-aldeia` (55 m³ clip) | 2 | **Fixed** — `dressingExclusions` + scenery `openArea` / `forestEdge` asymmetry |
| 2 | Night racing dark — no lamps (`lamp: "none"`) | all | Backlog — needs lighting pass, not a quick scenery tweak |
| 3 | `estoril-deposito` low salience at 150 m | 2 | Backlog — nudge anchor or add sightline prop |
| 4 | Parabolica pine vs awning scaffold overlap | 3 | Minor clip @ s≈0.895 |
| 5 | `estoril-moinho` uncertain landmark | 2 | Document only |
| 6 | Clip @ s≈0.479 (`spectatorHill` tread × scenery box) | 2 | 1 severe within baseline 2 — terrace `step` tweak deferred |
| 7 | Night TOD frames missing (s23/s26/s28); weather batch may need re-verify after shared shot PR | — | Partial — 36 JPEGs committed |

### Performance
Props ~177k tris post-fix; float/ground clean. `broadcastCompound` + tree suppressions are verify-track warnings only.

---

## Fixes applied (circuit-scoped only)

- `js/circuits/estoril.js` — `dressingExclusions` for foliage at aldeia (s 0.18–0.37) and mid-lap buffer (s 0.45–0.53).
- `js/circuits/scenery/estoril.js` — `openArea` for aldeia/hairpin/mid-lap; scrub `every()` skips `forestEdge` spans; +1-only `forestEdge` on back straight; later belt from s 0.55; tighter hairpin acacia span.

**Not changed:** `tools/shot/*`, `.gitignore`, `clip-baseline.json` (severe 1 ≤ baseline 2).

## Verify

```sh
node tools/track/verify-track.cjs estoril
node tools/track/audit-circuit.cjs estoril
node tools/ci/pick-tests.mjs   # → test:circuits, test:tiny, test:tooling-fast
```

Re-capture after shared PR:

```sh
node tools/shot/shot.mjs --batch docs/tracks/surveys/estoril-capture-jobs.json --jpeg
```
