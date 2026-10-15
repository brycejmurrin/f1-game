# Magny-Cours (`magny_cours`) — scenery survey (2026-10-14)

**Live:** [brycejmurrin.github.io/f1-game](https://brycejmurrin.github.io/f1-game/) · **Brief:** `docs/tracks/magny_cours.md`  
**Setting:** day default, `green` theme, `classic: true`, 4.4 km, 17 turns, clockwise (`startFrac: 0.99`).  
**Evidence:** headless TLX `node tools/shot/shot.mjs` (SwiftShader) + `node tools/track/audit-circuit.cjs magny_cours`.

### Capture status

| Batch | Frames | Path | Status |
|--------|--------|------|--------|
| Sector + landmarks (day · dry) | 16 | `artifacts/shots/tracks/magny_cours/s1-*` … `s3-*` | **Committed** (`git add -f`) |
| Time-of-day heroes (dawn / dusk / night · dry) | 18 | `artifacts/shots/tracks/magny_cours/tod-*` | **Committed** |
| Weather matrix (wet / rain / overcast / fog) | ~20 planned | same tree | **Deferred** — needs shared `shot.mjs --weather` batch after tooling PR |

**34** JPEGs total (q≈80, max width 1280px, each &lt;300 KB). Labels: `view · time-of-day · weather`.

Engine weather enum (`js/game.js`): `dry` | `wet` | `rain` | `overcast` | `fog`. Time of day: `dawn` | `day` | `dusk` | `night`. Circuit `furniture.lamp: "none"` and `night: false` — night frames are intentionally dark (backlog W1).

---

## Code map

| Layer | Path | Role |
|--------|------|------|
| Registry | `js/track/tracks.js` | `Tracks.LIST`; lazy `TrackScenery[id]` via `buildProps` |
| Def | `js/circuits/magny_cours.js` | OSM `path`, palette, `elevations`, `hwZones`, `dressingExclusions`, `turns` / `sectors` |
| Scenery | `js/circuits/scenery/magny_cours.js` | Technopôle pits, landmarks, poplars, fields, `vaultStand` corners |
| Landmarks | `tests/data/landmarks/magny_cours.json` | Required `modelGroup` ids (tribuna, control, conservatoire, château, ferme, bourg) |
| Lighting presets | `js/lighting/presets.js` | Full `magny_cours|{tod}|{weather}` grid (1 040-key fleet pattern) |

Sectors (racing lap `s`, curated splits `sectors: [0.335, 0.693]`):

| Sector | `s` range (approx.) | Landmarks / notes |
|--------|---------------------|-------------------|
| S1 | 0.99 → 0.335 | Pit Technopôle, main tribuna, Conservatoire, Estoril complex |
| S2 | 0.335 → 0.693 | Ferme, Grande Courbe, midfield straights, **Adelaide**, bourg horizon |
| S3 | 0.693 → 1.0 | Imola sequence, **Château d'Eau**, **Lycée**, pit straight |

---

## Node VM audit (baseline → this branch)

| Check | Before | After |
|--------|--------|--------|
| verify-track | OK, 0 folds | OK |
| float | 0 | 0 |
| clip severe | 9 (cap) | **7** |
| coplanar | 0 | 0 |
| ground flatCoplanar | 3 (in baseline) | 3 |
| props tris | 254 025 | 251 314 |

---

## Panel grids (committed shots, 34 frames)

Path: `artifacts/shots/tracks/magny_cours/` (JPEG q80, max width 1280px).

### Sector S1 (day · dry)

| | | |
|:---:|:---:|:---:|
| ![conservatoire · day · dry](../../../artifacts/shots/tracks/magny_cours/s1-conservatoire-day-dry.jpg)<br/>conservatoire · day · dry | ![control block · day · dry](../../../artifacts/shots/tracks/magny_cours/s1-control-block-day-dry.jpg)<br/>control block · day · dry | ![esses · day · dry](../../../artifacts/shots/tracks/magny_cours/s1-esses-day-dry.jpg)<br/>esses · day · dry |
| ![estoril · day · dry](../../../artifacts/shots/tracks/magny_cours/s1-estoril-day-dry.jpg)<br/>estoril · day · dry | ![main tribuna · day · dry](../../../artifacts/shots/tracks/magny_cours/s1-main-tribuna-day-dry.jpg)<br/>main tribuna · day · dry | ![pit complex · day · dry](../../../artifacts/shots/tracks/magny_cours/s1-pit-complex-day-dry.jpg)<br/>pit complex · day · dry |

### Sector S2 (day · dry)

| | | |
|:---:|:---:|:---:|
| ![adelaide · day · dry](../../../artifacts/shots/tracks/magny_cours/s2-adelaide-day-dry.jpg)<br/>adelaide · day · dry | ![bourg · day · dry](../../../artifacts/shots/tracks/magny_cours/s2-bourg-day-dry.jpg)<br/>bourg · day · dry | ![ferme · day · dry](../../../artifacts/shots/tracks/magny_cours/s2-ferme-day-dry.jpg)<br/>ferme · day · dry |
| ![grande courbe · day · dry](../../../artifacts/shots/tracks/magny_cours/s2-grande-courbe-day-dry.jpg)<br/>grande courbe · day · dry | ![midfield · day · dry](../../../artifacts/shots/tracks/magny_cours/s2-midfield-day-dry.jpg)<br/>midfield · day · dry | ![spectator hill · day · dry](../../../artifacts/shots/tracks/magny_cours/s2-spectator-hill-day-dry.jpg)<br/>spectator hill · day · dry |

### Sector S3 (day · dry)

| | | |
|:---:|:---:|:---:|
| ![chateau deau · day · dry](../../../artifacts/shots/tracks/magny_cours/s3-chateau-deau-day-dry.jpg)<br/>chateau deau · day · dry | ![imola seq · day · dry](../../../artifacts/shots/tracks/magny_cours/s3-imola-seq-day-dry.jpg)<br/>imola seq · day · dry | ![lycee · day · dry](../../../artifacts/shots/tracks/magny_cours/s3-lycee-day-dry.jpg)<br/>lycee · day · dry |
| ![main straight · day · dry](../../../artifacts/shots/tracks/magny_cours/s3-main-straight-day-dry.jpg)<br/>main straight · day · dry | — | — |

### Time of day (dry weather)

| | | |
|:---:|:---:|:---:|
| ![adelaide · dawn · dry](../../../artifacts/shots/tracks/magny_cours/tod-adelaide-dawn-dry.jpg)<br/>adelaide · dawn · dry | ![adelaide · dusk · dry](../../../artifacts/shots/tracks/magny_cours/tod-adelaide-dusk-dry.jpg)<br/>adelaide · dusk · dry | ![adelaide · night · dry](../../../artifacts/shots/tracks/magny_cours/tod-adelaide-night-dry.jpg)<br/>adelaide · night · dry |
| ![chateau · dawn · dry](../../../artifacts/shots/tracks/magny_cours/tod-chateau-dawn-dry.jpg)<br/>chateau · dawn · dry | ![chateau · dusk · dry](../../../artifacts/shots/tracks/magny_cours/tod-chateau-dusk-dry.jpg)<br/>chateau · dusk · dry | ![chateau · night · dry](../../../artifacts/shots/tracks/magny_cours/tod-chateau-night-dry.jpg)<br/>chateau · night · dry |
| ![ferme · dawn · dry](../../../artifacts/shots/tracks/magny_cours/tod-ferme-dawn-dry.jpg)<br/>ferme · dawn · dry | ![ferme · dusk · dry](../../../artifacts/shots/tracks/magny_cours/tod-ferme-dusk-dry.jpg)<br/>ferme · dusk · dry | ![ferme · night · dry](../../../artifacts/shots/tracks/magny_cours/tod-ferme-night-dry.jpg)<br/>ferme · night · dry |
| ![lycee · dawn · dry](../../../artifacts/shots/tracks/magny_cours/tod-lycee-dawn-dry.jpg)<br/>lycee · dawn · dry | ![lycee · dusk · dry](../../../artifacts/shots/tracks/magny_cours/tod-lycee-dusk-dry.jpg)<br/>lycee · dusk · dry | ![lycee · night · dry](../../../artifacts/shots/tracks/magny_cours/tod-lycee-night-dry.jpg)<br/>lycee · night · dry |
| ![pit · dawn · dry](../../../artifacts/shots/tracks/magny_cours/tod-pit-dawn-dry.jpg)<br/>pit · dawn · dry | ![pit · dusk · dry](../../../artifacts/shots/tracks/magny_cours/tod-pit-dusk-dry.jpg)<br/>pit · dusk · dry | ![pit · night · dry](../../../artifacts/shots/tracks/magny_cours/tod-pit-night-dry.jpg)<br/>pit · night · dry |
| ![pit straight · dawn · dry](../../../artifacts/shots/tracks/magny_cours/tod-pit-straight-dawn-dry.jpg)<br/>pit straight · dawn · dry | ![pit straight · dusk · dry](../../../artifacts/shots/tracks/magny_cours/tod-pit-straight-dusk-dry.jpg)<br/>pit straight · dusk · dry | ![pit straight · night · dry](../../../artifacts/shots/tracks/magny_cours/tod-pit-straight-night-dry.jpg)<br/>pit straight · night · dry |

## Weather / lighting backlog (post–tooling PR)

| ID | Condition | Expected issue | Severity |
|----|-----------|----------------|----------|
| W1 | `night` + `dry` | No `lamp` furniture — pit straight and Adelaide likely **too dark**; no mast glow | Medium — dress or accept for `night:false` classic |
| W2 | `night` + `wet` | Wet sheen without lamps — readability loss on grey Technopôle | Medium |
| W3 | `fog` / `rain` at dawn | Presets bump `mistDensity` / `fogDensityMul` — check sky vs `pal.fogColor` mismatch | Low (lighting-tuner) |
| W4 | `overcast` midday | Intended look per brief; verify grass saturation not neon | Low |
| W5 | Wet / rain | Spray and grip HUD only; scenery props should be unchanged — watch **z-fight** on wet reflective road | Low |

Weather panels (planned filenames after rebase):  
`wx-pit-day-{rain,wet,fog,overcast}.jpg`, same for `adelaide`, `ferme`, `chateau`, `lycee` (5 views × 4 wx = 20 frames).

---

## Findings (visual + measured)

**Strengths:** Technopôle pit read; landmarks at correct `s`; flat Nivernais identity (poplars, fields, single ferme); centreline 0 folds.

**Fixed this PR**

1. **Adelaide vault stand floating** — `vaultStand` rows now foot with `terrainYAt` per lateral step (`js/circuits/scenery/magny_cours.js`).
2. **Ferme silo clipping** — bush skip `s∈(0.31,0.39)`, `forestEdge` delayed past ferme, silos shifted outfield (clip severe 9→7).

**Open**

3. Hedge `flatCoplanar` 3 @ lines 65–66 — within baseline.  
4. `startFrac` / grid slots — see `docs/notes/BUG-HUNT-OPUS-2026-10-10.md`.  
5. ~2.9 m silo vs tree clip remains (under previous cap).  
6. Night lighting — no circuit lamps until scoped dress change.

## Ranked improvements

| P | Item | Risk | Status |
|---|------|------|--------|
| 0 | `vaultStand` terrain footing | Low | Done |
| 1 | Ferme yard clearance | Low | Done |
| 2 | Weather + committed shot grid | — | **Follow-up** after tooling PR |
| 3 | `startFrac` / grid | Medium | Open |
| 4 | Hedge coplanar split | Low | Open |
| 5 | Optional flood masts (night) | Medium | Open |

## Verify

```sh
node tools/track/verify-track.cjs magny_cours
node tools/track/audit-circuit.cjs magny_cours
```
