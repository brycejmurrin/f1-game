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

## Panel grids — Sector 1 (s ≈ 0.00–0.33)

Pit straight, T1, main scaffold stands. Midday dry unless noted. JPEGs live at repo-root
`artifacts/shots/tracks/estoril/` once the shared shot tooling PR lands.

| Row | Shot A | Shot B | Shot C |
|-----|--------|--------|--------|
| 1 | `s01-sf-straight-day-dry.jpg` — S/F straight | `s02-pit-terrace-day-dry.jpg` — pit terrace | `s03-timing-tower-day-dry.jpg` — timing tower |
| 2 | `s04-t1-trackside-day-dry.jpg` — T1 trackside | `s05-t1-apex-day-dry.jpg` — T1 apex | `s06-scaffold-main-day-dry.jpg` — main stands |
| 3 | `s20-grid-eye-day-dry.jpg` — grid eye | `s18-terrace-stand-day-dry.jpg` — masonry terrace | `s19-sintra-ridge-day-dry.jpg` — Sintra backdrop |

---

## Panel grids — Sector 2 (s ≈ 0.33–0.66)

Aldeia, hairpin, moinho, esses.

| Row | Shot A | Shot B | Shot C |
|-----|--------|--------|--------|
| 1 | `s07-aldeia-day-dry.jpg` — aldeia | `s08-hairpin-day-dry.jpg` — hairpin | `s09-hairpin-camera-day-dry.jpg` — hairpin camera |
| 2 | `s10-mid-gravel-day-dry.jpg` — mid gravel | `s11-moinho-day-dry.jpg` — moinho | `s12-esses-day-dry.jpg` — esses |

---

## Panel grids — Sector 3 (s ≈ 0.66–1.00)

Depósito, Parabolica, pit straight finish.

| Row | Shot A | Shot B | Shot C |
|-----|--------|--------|--------|
| 1 | `s13-deposito-day-dry.jpg` — water tank | `s14-late-sector-day-dry.jpg` — late sector | `s15-parabolica-stand-day-dry.jpg` — Parabolica stand |
| 2 | `s16-parabolica-chase-day-dry.jpg` — chase cam | `s17-parabolica-gravel-day-dry.jpg` — Parabolica gravel | `s21-pit-dusk-dry.jpg` — pit dusk |

---

## Panel grids — Time of day (key views)

`shot.mjs` supports `--tod` today. **Follow-up after shared tooling PR:** re-run jobs `s22`–`s28`, `s34` from [`estoril-capture-jobs.json`](estoril-capture-jobs.json).

| Row | Shot A | Shot B | Shot C |
|-----|--------|--------|--------|
| 1 | `s21-pit-dusk-dry.jpg` — pit dusk (captured) | `s22-pit-dawn-dry.jpg` — pit dawn (pending) | `s23-pit-night-dry.jpg` — pit night (pending) |
| 2 | `s24-parabolica-dusk-dry.jpg` — Parabolica dusk (pending) | `s25-parabolica-dawn-dry.jpg` — Parabolica dawn (pending) | `s26-parabolica-night-dry.jpg` — Parabolica night (pending) |
| 3 | `s27-aldeia-dusk-dry.jpg` — aldeia dusk (pending) | `s28-hairpin-night-dry.jpg` — hairpin night (pending) | `s34-deposito-dusk-dry.jpg` — depósito dusk (pending) |

**TOD backlog:** Night frames likely **under-lit** (`lamp: "none"`). Dusk/dawn palette matches `pal` zenith/horizon; verify lamp caps after any `furniture.lamp` change.

---

## Panel grids — Weather (deferred)

Weather batch fields need the landing **shared shot tooling PR** (`tools: shared shot tooling for circuit surveys`). Provisional local frames (WIP hook, **re-capture after rebase**):

| Row | Shot A | Shot B | Shot C |
|-----|--------|--------|--------|
| 1 | `s29-pit-day-wet.jpg` — pit wet (re-verify) | `s30-parabolica-day-rain.jpg` — Parabolica rain* | `s31-esses-day-overcast.jpg` — esses overcast* |
| 2 | `s32-aldeia-day-fog.jpg` — aldeia fog* | `s33-sf-night-rain.jpg` — S/F night rain* | — |

\*Target filenames from [`estoril-capture-jobs.json`](estoril-capture-jobs.json); provisional local captures used an unreleased weather hook.

Planned post-rebase weather set (6 key views only): jobs `s29`–`s33` in capture JSON — pit wet/rain, Parabolica rain, esses overcast, aldeia fog, S/F night rain.

**Weather backlog:** Confirm wet road reflectance vs `pal.runoff`; rain particle density at Parabolica crowd bank; fog vs `fogDensity` 0.003 — sky may read too bright under `overcast` if ambient dominates.

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
| 7 | Weather/TOD matrix incomplete in repo | — | **Blocked** on shared shot PR |

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
