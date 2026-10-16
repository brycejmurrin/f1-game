# TUMFTM racetrack-database → Apex track designer

Assessment + importer note, 2026-10-01.

Upstream: [TUMFTM/racetrack-database](https://github.com/TUMFTM/racetrack-database)
(LGPL-3.0). Centreline + left/right width CSVs for 25 circuits, plus
minimum-curvature racelines. Mesh reference from the same format:
[ivankarez/RacetrackGenerator](https://github.com/ivankarez/RacetrackGenerator).
Original GPS from OpenStreetMap (ODbL).

## What landed

| piece | path | role |
|---|---|---|
| Pure converter | `tools/lib/tumftm.mjs` | parse CSV → designer design + attribution envelope |
| CLI | `tools/track/tumftm-import.mjs` | `--list` / `--missing` / `--fetch` / `--source` / `--self-check` |
| Unit tests | `tests/unit/tumftm-import.test.mjs` | synthetic oval only (no network, no LGPL bytes in tree) |

Designer presets are **produced by the tool**, not committed:

```sh
node tools/track/tumftm-import.mjs --missing
node tools/track/tumftm-import.mjs Norisring --fetch -o artifacts/tumftm/
# then TRACK DESIGNER › IMPORT → artifacts/tumftm/Norisring.track.json
```

Each envelope is `format: "apex26.track"` (same as EXPORT) and carries an
`attribution` block naming LGPL-3.0 + OSM. Do not commit converted designs
without that block and the upstream licence texts.

## Roster overlap

Of the 25 upstream stems, **22 already have a shipped Apex circuit**
(`status: overlap`). The useful designer-preset candidates are:

| TUMFTM | status | why |
|---|---|---|
| MoscowRaceway | missing | not in `js/circuits/` |
| Norisring | missing | not in `js/circuits/` |
| Oschersleben | missing | not in `js/circuits/` |
| Nuerburgring | layout-diff | Apex ships the GP layout; TUMFTM's file is the DTM layout |

`--list` prints the full map (`tumftm` stem → `apexId` / theme suggestion).

## Racing lines — deliberately NOT wired in

`TrackLine.bake` (`js/track/core/line.js`) already relaxes the knot seed toward
a minimum-curvature + shortest-path objective — the same literature as TUMFTM's
`mincurv` / `global_racetrajectory_optimization` (measured write-up:
`docs/notes/RACING-LINE-RESEARCH.md`). Option C in that note ("ship TUMFTM QP
tables per circuit") was closed as not worth a browser QP or a data file per
circuit once the Gauss-Seidel bake landed.

Wiring upstream racelines into AI targets or the suggested-line assist would:

1. Fight the existing bake (and its `lineHints` authoring path).
2. Touch `js/game.js` / `AiDrive` / driving-line paths that other sessions are
   actively editing (assist-line, AI racecraft).
3. Pull LGPL-derived geometry into the shipped runtime.

`--raceline` therefore writes an **offline** `.line.json` sidecar (lateral
offsets at designer control points) for research / `line-audit` comparison only.
Nothing in the game reads it.

## Licence / attribution

- **TUMFTM database:** LGPL-3.0 — keep notices when redistributing converted
  designs; the converter stamps `attribution.license` + `attribution.notice`.
- **OSM centreline source:** ODbL share-alike on the OpenStreetMap data.
- **This repo:** does **not** vendor the CSV files or converted presets, so the
  tree stays free of a Combined Work over the database. Agents/players fetch
  at convert time (`--fetch`) or pass `--source`.

## What was not verified

- Live `--fetch` of every upstream CSV against TRACK DESIGNER IMPORT in a
  browser (network + Playwright cost; synthetic envelope round-trip is covered).
- Geometric fidelity of a TUMFTM layout vs the matching shipped Apex circuit
  (overlaps are catalogued, not diffed metre-by-metre).
- Whether a player-imported Norisring survives a full race group under
  SwiftShader (designer import path is the existing codec / CustomTracks gate).
