---
name: data-hub
description: "Use when Data Hub tabs (schedule/standings/last race/live/telemetry/export), F1API / Jolpica / OpenF1 wiring, js/data/*, or data-lifecycle / telemetry-compare specs change, a tab is empty/stale/wrong season or year, or WATCH/HIGHLIGHTS loads the wrong driver/race after a picker change. Not standalone Season setup (season-mode), hub menu layout (ui-menu-a11y) or in-race physState telemetry (agent-view)."
---

# Data Hub / F1API

`js/data/hub.js` is the overlay (`#datahub`). Tab loaders live in the
split `js/data/*` modules. Styles in `css/data.css` (`dh-` prefix).
In-race slip/grip/timing is **agent-view** (`references/state.md`), not this overlay.
WATCH/HIGHLIGHTS loading the wrong driver/race after a picker change is here; a camera
that snaps or keeps an old anchor after a SEEK, follow change or exit/re-entry is
follow-owner state → **f1-animation-cameras** (`references/replay.md`).

## Tabs

| id | Loader | Overlay node reuse age (`MAX_AGE`) |
|---|---|---|
| schedule | `loadSchedule` | 6 h |
| standings | `loadStandings` | 60 min |
| results | `loadResults` | 60 min |
| live | `loadLive` | 5 min |
| telemetry | `loadTelemetry` | 15 min |
| race | `loadRealRace` | 60 min |
| export | `loadExport` | 24 h |

`MAX_AGE` controls reuse of tab DOM nodes; it is independent of the API cache
TTL in `js/data/api.js` (schedule responses: 24 h). Refreshing a tab can reuse
a cached API response.

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
  `innerHTML` with API strings** (gated by `tools/check/html-sink-lint.mjs`, in `test:guards`).
- Empty-tab copy is the `NO_LIVE_MSG` / `NO_TELEM_MSG` constants — delayed
  free data is expected, not a fetch bug.
- Tests mock the hub (`tests/helpers/f1-api-mock.js`); a missed path
  rewrite fails **open** (empty hub, green UI).

Export tab (`loadExport`): not a CSV, not the in-race trace buffer; OpenF1-only gather, hand-rolled zip,
no unit test pins it (browser-only unverified: say so) → `references/export.md`.

Season/year (schedule/results take no year, standings an optional one; `LAST SEASON` tag, wrong clock,
stale `apex26.api.*` cache, mock answering every year as 2026) → `references/season-year.md`.

Start with `tests/specs/data-lifecycle.spec.js` or the telemetry comparison
spec through `test-solo.mjs <path>` as one background task with a log in `artifacts/logs/`
(parent-owned browser, AGENTS.md rule 4). Reserve the
`test-bg.mjs hooks` group for changes that need its wider surface. Node-only, seconds, run first:
`node --test tests/unit/data-api-status.test.mjs` (also `data-standings`, `data-results`,
`data-schedule-tz`, `data-lazy-loader`, `telemetry-trace`). The group
`lifecycle-unit` is `async-lifecycle` + `tlx-chunked-lifecycle` (the first
does read `api.js`/`live.js`), not the hub spec.

Run `pick-tests js/data/hub.js` for the groups (AGENTS.md rules 4-5). An empty tab with no error is usually
`NO_RESULT_MSG` / `NO_LIVE_MSG` / `NO_TELEM_MSG`, not a fetch failure. Layout of
the hub chrome → **ui-menu-a11y** / **survey-ui-matrix**.
