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
follow-owner state → **replay-camera** (new camera motion → **f1-animation-cameras**).

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
  `innerHTML` with API strings.**
- Empty-tab copy is the `NO_LIVE_MSG` / `NO_TELEM_MSG` constants — delayed
  free data is expected, not a fetch bug.
- Tests mock the hub (`tests/helpers/f1-api-mock.js`); a missed path
  rewrite fails **open** (empty hub, green UI).

Export tab (`js/data/export.js`, `loadExport`): NOT a CSV and NOT the in-race
trace buffer. Gather = OpenF1 only (`meetings` -> `sessionsForMeeting` ->
`sessionDrivers` -> `fastestLap` -> `locationData`, paced 2-5 s/call, ~10 min,
429 waits 90 s, misses retried once after 2 min) into `{circuits:{key:{trace,sf}}}`;
Download = hand-rolled `makeZip` of `startlines-<year>.json` + `img/<circuit>.png`
(canvas). "Empty" export = Download disabled until Gather completes, or every
circuit logged `· no lap/loc` (OpenF1 delayed/429 - read the status box), or
PNGs skipped (`toBlob` null). In-race samples: **agent-view**; OpenF1 vs game
comparison is the TELEMETRY tab (`telemetry.js`, `telemetry-compare.spec.js`).
No unit test pins zip/CRC/gather (only `data-lazy-loader` load order and a browser-ui-hunt
"Gather prerequisite" check): a change here is browser-only unverified - say so.
Export status is a `.dh-export-status` `<div>` (not `<pre>`).

Season/year: schedule and results take NO year argument and standings take an
OPTIONAL one. `F1API` derives the Jolpica season from the clock per call
(`season()`, `js/data/api.js` ~L18; URL = `/<year>/driverstandings.json`;
a past year caches 7 d). `loadStandings` (`standings.js`) asks for the current
year and, when that table is empty (Jan to the opener), falls back to last
season's FINAL table, headings tagged `LAST SEASON · <y> FINAL` (pinned by
`tests/unit/data-standings.test.mjs`). Only the OpenF1 pickers carry a year
(`hub.js` `apiYears()` / `sel.year`; `export.js` its own); the year/GP/SESSION
picker drives RESULTS, LIVE and TELEMETRY (`invalidateOther`), never STANDINGS
or SCHEDULE. So "standings show last year after a picker change" = the
`LAST SEASON` tag above (intended), a wrong system clock, a stale
`apex26.api.*` cache entry, a 60 min `MAX_AGE` node, or the mock
(`tests/helpers/f1-api-mock.js` pins `season: "2026"` and answers EVERY
year's path with it).

Start with `tests/specs/data-lifecycle.spec.js` or the telemetry comparison
spec through `test-solo.mjs <path>` in the background with a log (parent-owned browser). Reserve the
`test-bg.mjs hooks` group for changes that need its wider surface. Node-only, seconds, run first:
`node --test tests/unit/data-api-status.test.mjs` (also `data-standings`, `data-results`,
`data-schedule-tz`, `data-lazy-loader`, `telemetry-trace`). The group
`lifecycle-unit` is `async-lifecycle` + `tlx-chunked-lifecycle` (the first
does read `api.js`/`live.js`), not the hub spec.

`pick-tests` for `js/data/` names `hooks`, `lifecycle-unit`, `tiny`,
`tooling-fast` (there is no `api` group). An empty tab with no error is usually
`NO_RESULT_MSG` / `NO_LIVE_MSG` / `NO_TELEM_MSG`, not a fetch failure. Layout of
the hub chrome → **ui-menu-a11y** / **survey-ui-matrix**.
