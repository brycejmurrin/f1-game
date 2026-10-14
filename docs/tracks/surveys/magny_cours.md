# Magny-Cours (`magny_cours`) — scenery survey (2026-10-14)

**Live:** [brycejmurrin.github.io/f1-game](https://brycejmurrin.github.io/f1-game/) · **Brief:** `docs/tracks/magny_cours.md`  
**Setting:** day default, `green` theme, `classic: true`, 4.4 km, 17 turns, clockwise (`startFrac: 0.99`).  
**Evidence:** headless TLX `node tools/shot/shot.mjs` (SwiftShader) + `node tools/track/audit-circuit.cjs magny_cours`.

### Capture status

| Batch | Frames | Path | Status |
|--------|--------|------|--------|
| Sector + landmarks (day dry) | 16 | `scratch/captures/magny-cours-survey/s1-*-day-dry.jpg` … `s3-*` | In flight (stock `shot.mjs`, `--tod day` only) |
| Time-of-day on 6 hero views | 18 | `scratch/captures/magny-cours-survey/tod-*-{dusk,dawn,night}-dry.jpg` | Same batch (34 total) |
| Weather matrix (dry / wet / rain / overcast / fog) | 24–30 planned | `artifacts/shots/tracks/magny_cours/` (committed) | **Blocked** — rebase on shared PR `tools: shared shot tooling for circuit surveys` (`--weather` batch + `artifacts/shots/tracks/**` gitignore exception) |

Session walkthrough PNGs (pre-expansion): `/opt/cursor/artifacts/magny_cours/01-*.png` … `13-*.png` (agent VM, not in git).

Engine weather enum (`js/game.js`): `dry` | `wet` | `rain` | `overcast` | `fog`. Time of day: `dawn` | `day` | `dusk` | `night`. Circuit `furniture.lamp: "none"` and `night: false` — expect **no floodlight pass** at night until a dressing change.

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

## Panel grid — Sector S1 (day dry)

Filenames: `scratch/captures/magny-cours-survey/` (local) → `artifacts/shots/tracks/magny_cours/` after tooling PR. Embedded images are in the PR description.

| Frame A | Frame B | Frame C |
|---------|---------|---------|
| `s1-pit-complex-day-dry.jpg` — `s≈0.99` orbit | `s1-main-tribuna-day-dry.jpg` — `s≈0.005` trackside | `s1-control-block-day-dry.jpg` — `s≈0.998` orbit |
| `s1-conservatoire-day-dry.jpg` — `s≈0.055` | `s1-estoril-day-dry.jpg` — `s≈0.172` | `s1-esses-day-dry.jpg` — `s≈0.12` park |

## Panel grid — Sector S2 (day dry)

| Frame A | Frame B | Frame C |
|---------|---------|---------|
| `s2-spectator-hill-day-dry.jpg` — `s≈0.25` | `s2-ferme-day-dry.jpg` — `s≈0.34` | `s2-grande-courbe-day-dry.jpg` — `s≈0.41` |
| `s2-midfield-day-dry.jpg` — `s≈0.52` | `s2-adelaide-day-dry.jpg` — `s≈0.58` | `s2-bourg-day-dry.jpg` — `s≈0.62` |

## Panel grid — Sector S3 (day dry)

| Frame A | Frame B | Frame C |
|---------|---------|---------|
| `s3-imola-seq-day-dry.jpg` — `s≈0.76` | `s3-chateau-deau-day-dry.jpg` — `s≈0.82` | `s3-lycee-day-dry.jpg` — `s≈0.92` |
| `s3-main-straight-day-dry.jpg` — `s≈0.97` | — | — |

## Panel grid — Time of day (dry; 6 hero views)

| View | day | dusk | dawn |
|------|-----|------|------|
| Pit `s≈0.99` | `s1-pit-complex-day-dry.jpg` | `tod-pit-dusk-dry.jpg` | `tod-pit-dawn-dry.jpg` |
| | night: `tod-pit-night-dry.jpg` | | |
| Ferme `s≈0.34` | `s2-ferme-day-dry.jpg` | `tod-ferme-dusk-dry.jpg` | `tod-ferme-dawn-dry.jpg` |
| | night: `tod-ferme-night-dry.jpg` | | |
| Adelaide `s≈0.58` | `s2-adelaide-day-dry.jpg` | `tod-adelaide-dusk-dry.jpg` | `tod-adelaide-dawn-dry.jpg` |
| | night: `tod-adelaide-night-dry.jpg` | | |
| Château `s≈0.82` | `s3-chateau-deau-day-dry.jpg` | `tod-chateau-dusk-dry.jpg` | `tod-chateau-dawn-dry.jpg` |
| | night: `tod-chateau-night-dry.jpg` | | |
| Lycée `s≈0.92` | `s3-lycee-day-dry.jpg` | `tod-lycee-dusk-dry.jpg` | `tod-lycee-dawn-dry.jpg` |
| | night: `tod-lycee-night-dry.jpg` | | |
| Main straight `s≈0.97` | `s3-main-straight-day-dry.jpg` | `tod-pit-straight-dusk-dry.jpg` | `tod-pit-straight-dawn-dry.jpg` |
| | night: `tod-pit-straight-night-dry.jpg` | | |

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
