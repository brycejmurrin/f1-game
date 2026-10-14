# Okayama — circuit survey (2026-10-14)

Pacific GP / TI Circuit Aida. **3.70 km**, 11 turns, **green** day theme, `baseHW` 7
(narrowest lap in roster). Clockwise; **+1 = infield** (pits, paddock, club).

**Evidence:** `node tools/track/verify-track.cjs okayama`, `audit-circuit.cjs okayama`,
`node tools/shot/agent.mjs okayama survey`. GLX captures: `shot.mjs --backend webgl2`
(`APEX_GL=llvmpipe`).

**Shots:** committed after rebase onto shared survey tooling PR (`artifacts/shots/tracks/okayama/`).
This pass has **14 day/dry sector frames**; **weather/lighting matrix deferred** (see below).

## Code map

| Piece | Path |
|--------|------|
| Layout + palette | `js/circuits/okayama.js` |
| Scenery | `js/circuits/scenery/okayama.js` |
| Brief | `docs/tracks/okayama.md` |
| Landmarks | `tests/data/landmarks/okayama.json` |

## Theme and models

Humid green enclosure, pale clay banks, low club buildings. Required: control tower,
Dunlop `overheadSpan`, Williams `okayama-paddock-block`. Pit garage `modelGroup` is
**superseded** by engine pit complex (expected `modelsSuppressed`).

## Sector 1 — start/finish (s &lt; 0.371)

Panel filenames (under `artifacts/shots/tracks/okayama/` after shared tooling PR commits them):

| | | |
|:---:|:---:|:---:|
| `00-track-picker-still.webp` | `s1-pit-chase-day-dry.png` | `s1-pit-orbit-day-dry.png` |
| Track select still | Main straight chase | Pit complex orbit (post stand fix) |
| `s1-dunlop-eye-day-dry.png` | — | — |
| Under Dunlop bridge | | |

**Notes:** Main `grandstandEx` was **7.6 m over the racing line** at 10 m offset — fixed to **18 m**
(`propsOverRoadCandidates` 2 → 0). Pit garages model suppressed; live pit mesh reads fine.

## Sector 2 — Attwood → hairpin (0.371 – 0.599)

| | | |
|:---:|:---:|:---:|
| `s2-turn1-ts-day-dry.png` | `s2-williams-orbit-day-dry.png` | `s2-moss-ts-day-dry.png` |
| Turn 1 trackside | Williams paddock orbit | Moss S spectator bank |
| `s2-hairpin-ts-day-dry.png` | — | — |
| Mid-lap hairpin | | |

**Notes:** Trackside frames often include lattice `cameraTower` in foreground (by design).
`ridge()` silent drops on tight fold — terraces use `spectatorHill` / `clayCut` instead.

## Sector 3 — Revolver → last corner (s &gt; 0.599)

| | | |
|:---:|:---:|:---:|
| `s3-revolver-park-day-dry.png` | `s3-climb-park-day-dry.png` | `s3-hobbs-ts-day-dry.png` |
| Revolver | Back-section climb | Hobbs hairpin |
| `s3-mike-park-day-dry.png` | `s3-last-ts-day-dry.png` | — |
| Mike Knight descent | Last corner / pit entry | |

**Notes:** Hobbs stand overlap **0.83 m** — fixed (dist 20 → **22 m**). Agent survey: ground
cliff @ frac **0.75** (terrain step on descent; no terrain-over-road).

## Weather and lighting (planned — blocked on shared tooling)

Target **30–36** total frames: **14 day/dry** (above) + **4–6 anchor views** × **6** conditions.

Anchors: pit orbit, hairpin, Williams paddock, Hobbs, Dunlop eye, main-stand trackside.

| Condition | `tod` | `weather()` |
|-----------|-------|-------------|
| Midday dry | `day` | `dry` |
| Golden hour | `dusk` | `dry` |
| Dawn | `dawn` | `dry` |
| Night | `night` | `dry` |
| Overcast | `day` | `overcast` |
| Rain | `day` | `rain` |
| Wet track | `day` | `wet` |
| Fog | `day` | `fog` |
| Night wet | `night` | `wet` |

Okayama has full `okayama|tod|wx` presets in `js/lighting/presets.js` (incl. night despite
`night: false` on def). **`lamp: "none"`** on def — expect **no floodlight masts** at night;
watch for flat/unlit foliage and rain particle density on enclosed tree walls.

**Watch list when weather batch lands:** z-fight on wet clay banks; fog vs `fogDensity` on
green theme; night lamp cap on a circuit with no authored lamps; Dunlop bridge soffit flicker
(fleet overhead QA — okayama span is single-deck).

## Audits (2026-10-14)

| Check | Result |
|--------|--------|
| verify-track | OK — min radius 11.99 m, 0 surface folds |
| float / clip | 0 / 0 severe |
| coplanar | 3 spots (baseline) — distant crowdBank × grandstand |
| ground | 1 buried @ shared `city.js` detail (0.15 m, within baseline) |
| props tris | ~332k |

## Ranked backlog

| Pri | Item | Status |
|-----|------|--------|
| P0 | Grandstand road overlap S/F + Hobbs | **Fixed** |
| P1 | Weather/lighting panel grid (30–36 frames) | **Blocked** — rebase shared shot tooling PR |
| P2 | `startFrac` vs real S/F | Open |
| P3 | Night lighting without `lamp` furniture | Open (needs lighting pass or accept dark) |
| P4 | ENKEI bridge when frac confirmed | Open |

## Fixes in branch

- `grandstandEx(0.015, -1, 18, …)` — main stand off racing line.
- `grandstandEx(0.6322, -1, 22, …)` — Hobbs stand clearance.
