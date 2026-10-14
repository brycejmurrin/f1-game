# Mexico City (Hermanos Rodríguez) — circuit survey

**Date:** 2026-10-14  
**Branch:** `cursor/mexico-survey-76c5`  
**Live:** https://brycejmurrin.github.io/f1-game/  
**Brief:** `docs/tracks/mexico.md`  
**Shots:** 31 frames (`artifacts/shots/tracks/mexico/`, dry only; wet/rain/overcast/fog blocked until shared survey shot tooling lands).

Relative image root: `../../../artifacts/shots/tracks/mexico/`

## Code map

| Layer | Path | Role |
|-------|------|------|
| Circuit def | `js/circuits/mexico.js` | OSM centreline, `startFrac` 0, `theme: modern`, thin-air fog, Peraltada `bankZones`, `dressingExclusions` for park vs city |
| Scenery | `js/circuits/scenery/mexico.js` | Foro Sol bowls, paddock suites, volcanoes, airliner, `avenue` planting, `cityFront` |
| Landmarks | `tests/data/landmarks/mexico.json` | Foro entry/exit, Peraltada stand, scoreboard, paddock suite, Palacio |

## Findings (summary)

| Severity | Topic | Notes |
|----------|-------|-------|
| Low | Airliner floaters | 2 clusters @ cap (`s≈0.20`, intentional hero) |
| Low | Buried papel-picado | `place()` strips on steep verges (~0.3 m) |
| Fixed | Peraltada terrace | `gap` 16, 3 rows — unsupported back rows cleared |
| Fixed | Horquilla clip | `SOLID` 0.38–0.46 blocks avenue vs `cityFront` (severe 5→4) |
| Low | Night Foro | `dressingExclusions` suppress generic lamps 0.70–0.89; local masts only — stadium reads dim at night |
| Deferred | Weather matrix | `__apex.race(_, tod, wx)` batch capture waits on shared `tools/shot` PR |

**Verification:** `node tools/track/verify-track.cjs mexico` OK; `node tools/track/audit-circuit.cjs mexico --json` all checks OK (float 2/2, clip severe 4/5, ground within baseline).

---

## Sector 1 — start / T1 / esses (day, dry)

| Start / S-F orbit · day · dry | Main straight · park · day · dry | Paddock suites · eye · day · dry |
|:---:|:---:|:---:|
| ![S/F orbit](../../../artifacts/shots/tracks/mexico/s1-00-start-orbit__day-dry.jpg) | ![S/F park](../../../artifacts/shots/tracks/mexico/s1-00-start-park__day-dry.jpg) | ![Paddock](../../../artifacts/shots/tracks/mexico/s1-03-paddock-eye__day-dry.jpg) |

| DRS park belt · orbit · day · dry | Turn 1 · orbit · day · dry | Esses · eye · day · dry |
|:---:|:---:|:---:|
| ![DRS park](../../../artifacts/shots/tracks/mexico/s1-08-drs-park-orbit__day-dry.jpg) | ![T1](../../../artifacts/shots/tracks/mexico/s1-12-t1-orbit__day-dry.jpg) | ![Esses](../../../artifacts/shots/tracks/mexico/s1-20-esses-eye__day-dry.jpg) |

| Airliner approach · orbit · day · dry | | |
|:---:|:---:|:---:|
| ![Airliner](../../../artifacts/shots/tracks/mexico/s1-20-airliner-orbit__day-dry.jpg) | | |

---

## Sector 2 — mid-park / Horquilla (day, dry)

| Mid-park · orbit · day · dry | Esses mid · orbit · day · dry | Volcano horizon · orbit · day · dry |
|:---:|:---:|:---:|
| ![Mid park](../../../artifacts/shots/tracks/mexico/s2-26-mid-orbit__day-dry.jpg) | ![Esses mid](../../../artifacts/shots/tracks/mexico/s2-30-esses-mid-orbit__day-dry.jpg) | ![Volcanoes](../../../artifacts/shots/tracks/mexico/s2-34-volcanoes-orbit__day-dry.jpg) |

| Horquilla · trackside · day · dry | Hairpin · orbit · day · dry | Sports belt · orbit · day · dry |
|:---:|:---:|:---:|
| ![Horquilla](../../../artifacts/shots/tracks/mexico/s2-42-horquilla-trackside__day-dry.jpg) | ![Hairpin](../../../artifacts/shots/tracks/mexico/s2-45-hairpin-orbit__day-dry.jpg) | ![Sports](../../../artifacts/shots/tracks/mexico/s2-51-sports-orbit__day-dry.jpg) |

| Palacio de los Deportes · orbit · day · dry | Mid-lap · orbit · day · dry | |
|:---:|:---:|:---:|
| ![Palacio](../../../artifacts/shots/tracks/mexico/s2-58-palacio-orbit__day-dry.jpg) | ![Mid-lap](../../../artifacts/shots/tracks/mexico/s2-62-midlap-orbit__day-dry.jpg) | |

---

## Sector 3 — Foro Sol / Peraltada (day, dry)

| Lucha statue · orbit · day · dry | Stadium approach · orbit · day · dry | Foro entry · eye · day · dry |
|:---:|:---:|:---:|
| ![Lucha](../../../artifacts/shots/tracks/mexico/s3-66-lucha-orbit__day-dry.jpg) | ![Stadium approach](../../../artifacts/shots/tracks/mexico/s3-70-stadium-approach-orbit__day-dry.jpg) | ![Foro entry](../../../artifacts/shots/tracks/mexico/s3-72-foro-entry-eye__day-dry.jpg) |

| Inside Foro Sol · park · day · dry | Foro exit · eye · day · dry | Peraltada approach · orbit · day · dry |
|:---:|:---:|:---:|
| ![Foro interior](../../../artifacts/shots/tracks/mexico/s3-78-foro-park__day-dry.jpg) | ![Foro exit](../../../artifacts/shots/tracks/mexico/s3-85-foro-exit-eye__day-dry.jpg) | ![Peraltada approach](../../../artifacts/shots/tracks/mexico/s3-90-peraltada-approach-orbit__day-dry.jpg) |

| Peraltada banking · orbit · day · dry | Final corner · park · day · dry | |
|:---:|:---:|:---:|
| ![Peraltada](../../../artifacts/shots/tracks/mexico/s3-92-peraltada-orbit__day-dry.jpg) | ![Final corner](../../../artifacts/shots/tracks/mexico/s3-97-final-park__day-dry.jpg) | |

---

## Time-of-day variants (dry) — key landmarks

| S/F · dusk · dry · orbit | S/F · dawn · dry · orbit | S/F · night · dry · orbit |
|:---:|:---:|:---:|
| ![S/F dusk](../../../artifacts/shots/tracks/mexico/lm-start__dusk-dry-orbit.jpg) | ![S/F dawn](../../../artifacts/shots/tracks/mexico/lm-start__dawn-dry-orbit.jpg) | ![S/F night](../../../artifacts/shots/tracks/mexico/lm-start__night-dry-orbit.jpg) |

| Foro Sol · dusk · dry · park | Foro Sol · night · dry · park | Horquilla · night · dry · trackside |
|:---:|:---:|:---:|
| ![Foro dusk](../../../artifacts/shots/tracks/mexico/lm-foro__dusk-dry-park.jpg) | ![Foro night](../../../artifacts/shots/tracks/mexico/lm-foro__night-dry-park.jpg) | ![Horquilla night](../../../artifacts/shots/tracks/mexico/lm-horquilla__night-dry-trackside.jpg) |

| Peraltada · dusk · dry · orbit | Peraltada · night · dry · orbit | |
|:---:|:---:|:---:|
| ![Peraltada dusk](../../../artifacts/shots/tracks/mexico/lm-peraltada__dusk-dry-orbit.jpg) | ![Peraltada night](../../../artifacts/shots/tracks/mexico/lm-peraltada__night-dry-orbit.jpg) | |

### Lighting notes

- **Night Foro:** bowl seat colours read; overhead lighting sparse vs real baseball stadium (generic lamp pass excluded in def).
- **Dusk/dawn:** thin-air palette + `fogDensity` 0.0022 keep volcanoes subtle; golden hour readable on main straight fascia.
- **Weather (wet / rain / overcast / fog):** not captured this PR — re-run after rebasing on shared shot tooling with `__apex.weather()` batch support.

---

## Ranked follow-ups

1. Weather panel grid (wet, rain, overcast, fog) on S/F, Foro, Horquilla, Peraltada after tooling PR.
2. Papel-picado footing without `place()` sink on slopes.
3. Night flood pass inside Foro Sol corridor (local `lightMast` density vs exclusion band).
4. Mid-lap left treeline extension `s 0.28–0.50` without city towers.
