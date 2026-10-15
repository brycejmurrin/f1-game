# Magny-Cours (`magny_cours`) — scenery survey (2026-10-14)

**Live:** [brycejmurrin.github.io/f1-game](https://brycejmurrin.github.io/f1-game/) · **Brief:** `docs/tracks/magny_cours.md`  
**Setting:** day default, `green` theme, `classic: true`, 4.4 km, 17 turns, clockwise (`startFrac: 0.99`).  
**Evidence:** headless TLX `node tools/shot/shot.mjs` (SwiftShader) + `node tools/track/audit-circuit.cjs magny_cours`.

### Capture status

| Batch | Frames | Path | Status |
|--------|--------|------|--------|
| Sector + landmarks (day · dry) | 16 | `artifacts/shots/tracks/magny_cours/s1-*` … `s3-*` | **Committed** (`git add -f`) |
| Hero weather / lighting (5 views) | 20 | `pit-*`, `ferme-*`, `adelaide-*`, `chateau-*`, `lycee-*` | **Committed** — `shot.mjs --batch` after rebase on shared shot tooling |

**36** JPEGs total (`--jpeg --present-timeout 90 --capture-retries 4 --wait 120`, SwiftShader). Each q≈80, max width 1280px, &lt;300 KB. Labels: `view · time-of-day · weather`.

Engine weather: `dry` | `wet` | `rain` | `overcast` | `fog` | `storm`. Time of day: `dawn` | `day` | `dusk` | `night`. Circuit `furniture.lamp: "none"` — night heroes stay very dark (W1).

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

## Panel grids (committed shots, 36 frames)

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

### Hero weather and lighting (pit · ferme · Adelaide · Château · Lycée)

#### pit

| | | |
|:---:|:---:|:---:|
| ![pit · day · rain](../../../artifacts/shots/tracks/magny_cours/pit-day-rain.jpg)<br/>pit · day · rain | ![pit · day · wet](../../../artifacts/shots/tracks/magny_cours/pit-day-wet.jpg)<br/>pit · day · wet | ![pit · dusk · dry](../../../artifacts/shots/tracks/magny_cours/pit-dusk-dry.jpg)<br/>pit · dusk · dry |
| ![pit · night · dry](../../../artifacts/shots/tracks/magny_cours/pit-night-dry.jpg)<br/>pit · night · dry | — | — |

#### ferme

| | | |
|:---:|:---:|:---:|
| ![ferme · dawn · dry](../../../artifacts/shots/tracks/magny_cours/ferme-dawn-dry.jpg)<br/>ferme · dawn · dry | ![ferme · day · fog](../../../artifacts/shots/tracks/magny_cours/ferme-day-fog.jpg)<br/>ferme · day · fog | ![ferme · day · overcast](../../../artifacts/shots/tracks/magny_cours/ferme-day-overcast.jpg)<br/>ferme · day · overcast |
| ![ferme · night · wet](../../../artifacts/shots/tracks/magny_cours/ferme-night-wet.jpg)<br/>ferme · night · wet | — | — |

#### adelaide

| | | |
|:---:|:---:|:---:|
| ![adelaide · day · storm](../../../artifacts/shots/tracks/magny_cours/adelaide-day-storm.jpg)<br/>adelaide · day · storm | ![adelaide · day · wet](../../../artifacts/shots/tracks/magny_cours/adelaide-day-wet.jpg)<br/>adelaide · day · wet | ![adelaide · dusk · dry](../../../artifacts/shots/tracks/magny_cours/adelaide-dusk-dry.jpg)<br/>adelaide · dusk · dry |
| ![adelaide · night · dry](../../../artifacts/shots/tracks/magny_cours/adelaide-night-dry.jpg)<br/>adelaide · night · dry | — | — |

#### chateau

| | | |
|:---:|:---:|:---:|
| ![chateau · dawn · dry](../../../artifacts/shots/tracks/magny_cours/chateau-dawn-dry.jpg)<br/>chateau · dawn · dry | ![chateau · day · fog](../../../artifacts/shots/tracks/magny_cours/chateau-day-fog.jpg)<br/>chateau · day · fog | ![chateau · day · rain](../../../artifacts/shots/tracks/magny_cours/chateau-day-rain.jpg)<br/>chateau · day · rain |
| ![chateau · night · dry](../../../artifacts/shots/tracks/magny_cours/chateau-night-dry.jpg)<br/>chateau · night · dry | — | — |

#### lycee

| | | |
|:---:|:---:|:---:|
| ![lycee · day · overcast](../../../artifacts/shots/tracks/magny_cours/lycee-day-overcast.jpg)<br/>lycee · day · overcast | ![lycee · day · storm](../../../artifacts/shots/tracks/magny_cours/lycee-day-storm.jpg)<br/>lycee · day · storm | ![lycee · dusk · dry](../../../artifacts/shots/tracks/magny_cours/lycee-dusk-dry.jpg)<br/>lycee · dusk · dry |
| ![lycee · night · dry](../../../artifacts/shots/tracks/magny_cours/lycee-night-dry.jpg)<br/>lycee · night · dry | — | — |

## Weather / lighting notes (from hero frames)

| ID | Condition | Observed / expected | Severity |
|----|-----------|---------------------|----------|
| W1 | `night` + `dry` | Pit and Adelaide heroes **very dark** — no circuit lamps (`lamp: "none"`) | Medium — optional flood masts |
| W2 | `night` + `wet` | Ferme night-wet: wet road read but outfield trees silhouette only | Medium |
| W3 | `fog` / `storm` day | Ferme fog and Adelaide/Lycée storm: sky desaturates; landmarks still readable | Low |
| W4 | `overcast` / `rain` day | Grass stays vivid; Technopôle grey reads well under flat light | Low |
| W5 | Wet / rain day | No new prop z-fight in captures; road sheen only | Low |

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
| 2 | Weather + committed shot grid (36 frames) | — | **Done** |
| 3 | `startFrac` / grid | Medium | Open |
| 4 | Hedge coplanar split | Low | Open |
| 5 | Optional flood masts (night) | Medium | Open |

## Verify

```sh
node tools/track/verify-track.cjs magny_cours
node tools/track/audit-circuit.cjs magny_cours
```
