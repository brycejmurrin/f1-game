---
name: data-hub
description: Use when Data Hub tabs (schedule/standings/last race/live/telemetry/export), F1API / Jolpica / OpenF1 wiring, js/data/*, or data-lifecycle / telemetry-compare tests are being changed or a tab is empty/stale/wrong year. Not for menu layout of the hub (ui-menu-a11y) or in-race physState telemetry (agent-view).
---

# Data Hub / F1API

`js/data/hub.js` is the overlay (`#datahub`). Tab loaders live in the
split `js/data/*` modules. Styles in `css/data.css` (`dh-` prefix).
In-race slip/grip/timing is **agent-view** (`references/state.md`), not this overlay.

## Tabs

| id | Loader | Cache age (`MAX_AGE`) |
|---|---|---|
| schedule | `loadSchedule` | 6 h |
| standings | `loadStandings` | 60 min |
| results | `loadResults` | 60 min |
| live | `loadLive` | 5 min |
| telemetry | `loadTelemetry` | 15 min |
| race | `loadRealRace` | 60 min |
| export | `loadExport` | 24 h |

RACE IT (`js/data/real-race-tab.js`) builds one Grand Prix's timing into the
script `js/race/real-race.js` replays (grid, per-lap pace, stops, flags,
retirements, rain, passes), shows the race LAP BY LAP (`raceBook` / `lapBoard`,
both pure) with a JUMP IN and a WATCH on every lap, loads the real positions
(`fetchTraces`: OpenF1 `/location` per car → IndexedDB) for WATCH / HIGHLIGHTS
(`js/race/real-replay.js` poses the field), and hands it to `RealRace.launch(script, {seat, laps,
startLap})` — the one call from `js/data/` into the game. A script is cached
only when `complete` (a winner classified, every lap in). Design and the pace loop:
`docs/notes/REAL-RACE-2026-09-27.md`.

Lazy closures on `TABS` — a direct reference at IIFE init is a TDZ throw
that kills DataHub.

## Rules

- API-derived DOM: `createElement` / `textContent` only. **Never
  `innerHTML` with API strings.**
- Empty-tab copy is the `NO_LIVE_MSG` / `NO_TELEM_MSG` constants — delayed
  free data is expected, not a fetch bug.
- Tests mock the hub (`tests/helpers/f1-api-mock.js`); a missed path
  rewrite fails **open** (empty hub, green UI).

```sh
node tools/ci/test-bg.mjs hooks
```

`js/data/` routes to `hooks` + `lifecycle-unit` (there is no `api` group).
An empty tab with no error is usually `NO_RESULT_MSG` / `NO_LIVE_MSG` /
`NO_TELEM_MSG`, not a fetch failure. Layout of the hub chrome →
**ui-menu-a11y** / **survey-ui-matrix**.
