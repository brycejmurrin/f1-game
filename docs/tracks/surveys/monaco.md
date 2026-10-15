# Monaco circuit survey — 2026-10-14

**Circuit id:** `monaco` · **Theme:** `street_day` · **Live:** [Monaco on GitHub Pages](https://brycejmurrin.github.io/f1-game/) (track picker → MONACO)

**Evidence:** `node tools/track/audit-circuit.cjs monaco`, `node tools/track/ground-audit.cjs monaco --why`, `node tools/track/verify-track.cjs monaco`, and **32** headless TLX frames under `artifacts/shots/tracks/monaco/` (batch: `scratch/monaco-survey-day32.json`). **Weather variants** (`dry` / `wet` / `rain` / `overcast` / `fog`) are **deferred** until the shared tooling PR (`tools: shared shot tooling for circuit surveys`) lands `--wx` batch support; this pass uses stock `shot.mjs` **time-of-day only** (`day` | `dusk` | `dawn` | `night`).

## Code map

| Layer | Path | Role |
|-------|------|------|
| Circuit def | `js/circuits/monaco.js` | OSM centreline, `reverse: true`, `startFrac` 0.2516, `sceneryCoordinates: "source"`, `barrierGap` 2.0, `dressingExclusions`, `elevations` / `hwZones` / `turns`, `pal`, `cityStyle`, `kit` |
| Scenery callback | `js/circuits/scenery/monaco.js` | `TrackScenery.monaco(api)` — landmarks, `waterField`, yachts, tunnel, Armco, `KRACE` / `KOLD` |
| Engine | `js/track/scenery/build-props.js`, `js/track/circuit-meta.js` | Generic kit + picker meta |
| Shared builders | `js/track/scenery/city.js`, `nature.js`, `structures.js` | Generic city/palms (two buried clusters on this circuit — engine emitters) |
| Brief | `docs/tracks/monaco.md` | Design brief + landmark checklist |
| Tests | `tests/data/landmarks/monaco.json`, `tests/specs/monaco-foundation.spec.js` | Required model ids + browser foundation |

**Sectors (racing arc):** S1 ends ~0.32 (before tunnel), S2 ~0.68 (harbour half), S3 to line.

## Theme and models

Mediterranean pastels, tight Armco, three `waterField` harbour stations (racing 0.365 / 0.545 / 0.59), registered landmarks (Tabac, Mirabeau, Rascasse, Fairmont), mega-yachts + marina pontoons. Props ~258k tris at audit; verify-track reports guard drops (palms/buildings) on the narrow street — expected.

---

## Panels — Sector 1 (dry midday, `tod=day`)

| Pit / start `s1-01-pit-start-day` | Sainte Dévote `s1-02-sainte-devote-day` | Beau Rivage `s1-03-beau-rivage-day` |
|:---:|:---:|:---:|
| ![S1 pit](../../../artifacts/shots/tracks/monaco/s1-01-pit-start-day.jpg) | ![S1 T1](../../../artifacts/shots/tracks/monaco/s1-02-sainte-devote-day.jpg) | ![S1 climb](../../../artifacts/shots/tracks/monaco/s1-03-beau-rivage-day.jpg) |

| Casino Square `s1-04-casino-square-day` | Massenet eye `s1-05-massenet-statue-day` | Sector 1 crest `s1-06-sector1-crest-day` |
|:---:|:---:|:---:|
| ![Casino](../../../artifacts/shots/tracks/monaco/s1-04-casino-square-day.jpg) | ![Massenet](../../../artifacts/shots/tracks/monaco/s1-05-massenet-statue-day.jpg) | ![Crest](../../../artifacts/shots/tracks/monaco/s1-06-sector1-crest-day.jpg) |

---

## Panels — Sector 2 (dry midday)

| Mirabeau `s2-01-mirabeau-day` | Fairmont hairpin `s2-02-fairmont-hairpin-day` | Portier `s2-03-portier-day` |
|:---:|:---:|:---:|
| ![Mirabeau](../../../artifacts/shots/tracks/monaco/s2-01-mirabeau-day.jpg) | ![Hairpin](../../../artifacts/shots/tracks/monaco/s2-02-fairmont-hairpin-day.jpg) | ![Portier](../../../artifacts/shots/tracks/monaco/s2-03-portier-day.jpg) |

| Tunnel interior `s2-04-tunnel-interior-day` | Tunnel exit `s2-05-tunnel-exit-day` | Nouvelle chicane `s2-06-nouvelle-chicane-day` |
|:---:|:---:|:---:|
| ![Tunnel](../../../artifacts/shots/tracks/monaco/s2-04-tunnel-interior-day.jpg) | ![Tunnel exit](../../../artifacts/shots/tracks/monaco/s2-05-tunnel-exit-day.jpg) | ![Chicane](../../../artifacts/shots/tracks/monaco/s2-06-nouvelle-chicane-day.jpg) |

---

## Panels — Sector 3 (dry midday)

| Harbour wide `s3-01-harbour-wide-day` | Tabac `s3-02-tabac-day` | Swimming pool `s3-03-swimming-pool-day` |
|:---:|:---:|:---:|
| ![Harbour](../../../artifacts/shots/tracks/monaco/s3-01-harbour-wide-day.jpg) | ![Tabac](../../../artifacts/shots/tracks/monaco/s3-02-tabac-day.jpg) | ![Pool](../../../artifacts/shots/tracks/monaco/s3-03-swimming-pool-day.jpg) |

| Rascasse `s3-04-rascasse-day` | La Rascasse bar `s3-05-rascasse-bar-day` | Antony Noghès `s3-06-antony-noghes-day` |
|:---:|:---:|:---:|
| ![Rascasse](../../../artifacts/shots/tracks/monaco/s3-04-rascasse-day.jpg) | ![Bar](../../../artifacts/shots/tracks/monaco/s3-05-rascasse-bar-day.jpg) | ![Noghes](../../../artifacts/shots/tracks/monaco/s3-06-antony-noghes-day.jpg) |

---

## Panels — Time of day (dry weather; five landmark views)

Stock `__apex.setTimeOfDay` via batch `tod` field. No `raceWeather` override in this pass.

### Casino Square (frac 0.22)

| Day (sector panel) | Dusk `lv-casino-dusk-dry` | Dawn `lv-casino-dawn-dry` |
|:---:|:---:|:---:|
| ![Casino day](../../../artifacts/shots/tracks/monaco/s1-04-casino-square-day.jpg) | ![Casino dusk](../../../artifacts/shots/tracks/monaco/lv-casino-dusk-dry.jpg) | ![Casino dawn](../../../artifacts/shots/tracks/monaco/lv-casino-dawn-dry.jpg) |

| Night `lv-casino-night-dry` | | |
|:---:|:---:|:---:|
| ![Casino night](../../../artifacts/shots/tracks/monaco/lv-casino-night-dry.jpg) | | |

### Port Hercule (frac 0.65)

| Day | Dusk `lv-harbour-dusk-dry` | Dawn `lv-harbour-dawn-dry` |
|:---:|:---:|:---:|
| ![Harbour day](../../../artifacts/shots/tracks/monaco/s3-01-harbour-wide-day.jpg) | ![Harbour dusk](../../../artifacts/shots/tracks/monaco/lv-harbour-dusk-dry.jpg) | ![Harbour dawn](../../../artifacts/shots/tracks/monaco/lv-harbour-dawn-dry.jpg) |

| Night `lv-harbour-night-dry` | | |
|:---:|:---:|:---:|
| ![Harbour night](../../../artifacts/shots/tracks/monaco/lv-harbour-night-dry.jpg) | | |

### Tabac (frac 0.71)

| Day | Dusk | Dawn |
|:---:|:---:|:---:|
| ![Tabac day](../../../artifacts/shots/tracks/monaco/s3-02-tabac-day.jpg) | ![Tabac dusk](../../../artifacts/shots/tracks/monaco/lv-tabac-dusk-dry.jpg) | ![Tabac dawn](../../../artifacts/shots/tracks/monaco/lv-tabac-dawn-dry.jpg) |

| Night | | |
|:---:|:---:|:---:|
| ![Tabac night](../../../artifacts/shots/tracks/monaco/lv-tabac-night-dry.jpg) | | |

### Tunnel exit (frac 0.55)

| Day | Dusk | Dawn |
|:---:|:---:|:---:|
| ![Tunnel day](../../../artifacts/shots/tracks/monaco/s2-05-tunnel-exit-day.jpg) | ![Tunnel dusk](../../../artifacts/shots/tracks/monaco/lv-tunnel-exit-dusk-dry.jpg) | ![Tunnel dawn](../../../artifacts/shots/tracks/monaco/lv-tunnel-exit-dawn-dry.jpg) |

| Night | | |
|:---:|:---:|:---:|
| ![Tunnel night](../../../artifacts/shots/tracks/monaco/lv-tunnel-exit-night-dry.jpg) | | |

### Fairmont hairpin (frac 0.38)

| Day | Dusk `lv-fairmont-dusk-dry` | Night `lv-fairmont-night-dry` |
|:---:|:---:|:---:|
| ![Fairmont day](../../../artifacts/shots/tracks/monaco/s2-02-fairmont-hairpin-day.jpg) | ![Fairmont dusk](../../../artifacts/shots/tracks/monaco/lv-fairmont-dusk-dry.jpg) | ![Fairmont night](../../../artifacts/shots/tracks/monaco/lv-fairmont-night-dry.jpg) |

---

## Panels — Weather / wet (planned; blocked on shared shot tooling)

After rebase onto **tools: shared shot tooling for circuit surveys**, re-run the same five landmark cameras with `wx` ∈ `overcast`, `rain`, `wet`, `fog` (midday) plus `storm` if desired. Planned ids: `lv-{casino,harbour,tabac,tunnel-exit,fairmont}-{overcast,rain,fog}.jpg`.

---

## Findings

### Audit (`audit-circuit.cjs monaco`)

- Centreline OK, **0 folds**; float 0; clip at baseline (8 severe); coplanar 0; ground buried 4 (within baseline).

### Visual / scenery

| Issue | Severity | Notes |
|-------|----------|-------|
| Hillside blocks floating above green terrain shelf | medium | Casino / Beau Rivage orbit — amphitheatre mesh ends before building bases |
| `terraceStack` single pastel on all tiers | low | **Fixed** — `hash(seedK)` per stack |
| Casino planter `place`+`prop` coplanar | cosmetic | flatCoplanar baseline |
| Yacht hull shallow bury (~0.15 m) | cosmetic | within ground baseline |
| Night: WINLIT bands read; street `lampPost` sparse on harbour promenade | low | expect fuller pass after dusk/night panels |
| Rain/fog/overcast | — | not captured yet (tooling) |

### Weather / lighting backlog (post–shared-PR)

- Capture wx matrix on five landmark views; check rain streaks vs harbour water, fog density vs `pal.fogDensity`, overcast sun mute, night lamp cap / missing pools on quay lamps.
- Compare z-fight on wet reflective road near Tabac chicane.

## Ranked improvements

| Rank | Item | Risk | Scope |
|------|------|------|-------|
| 1 | **Done:** `terraceStack` palette seed | low | `scenery/monaco.js` |
| 2 | Ground terrace / amphitheatre bases to `terrainYAt` | medium | `scenery/monaco.js` |
| 3 | Harbour balcony buried slab guard | low | `scenery/monaco.js` |
| 4 | wx survey panels + night lamp densify on quay | medium | scenery + follow-up shots |
| 5 | Harbour basin polygon (not more `waterField` stations) | high | engine |

## Fix applied (this PR)

`terraceStack`: replace `K(a.c[0] | 0)` (always 0) with `hash(seedK + i * 11)`; pass lap node `k` as `seedK`.

## Verification

```sh
node tools/track/verify-track.cjs monaco
node tools/track/audit-circuit.cjs monaco
# Browser (after capture idle): npm test -- tests/specs/monaco-foundation.spec.js
```
