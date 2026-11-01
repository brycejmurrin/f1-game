---
name: data-hub
description: "Use when a Data Hub tab is empty, stale or the wrong year, the F1 data feeds (Jolpica, OpenF1) change, or WATCH/HIGHLIGHTS loads the wrong race. Not for: season setup → season-mode; menu layout → ui-menu-a11y; in-race telemetry → agent-view."
---

# Data Hub / F1API

`js/data/hub.js` is the overlay (`#datahub`). Tab loaders live in the
split `js/data/*` modules. Styles in `css/data.css` (`dh-` prefix).
In-race slip/grip/timing is [agent-view state hooks](../agent-view/references/state.md), not this overlay.
WATCH/HIGHLIGHTS loading the wrong driver/race after a picker change is here; a camera
that snaps or keeps an old anchor after a SEEK, follow change or exit/re-entry is
follow-owner state → [f1-animation-cameras replay workflow](../f1-animation-cameras/references/replay.md).

## Tabs

| id | Loader |
|---|---|
| schedule | `loadSchedule` |
| standings | `loadStandings` |
| results | `loadResults` |
| live | `loadLive` |
| telemetry | `loadTelemetry` |
| race | `loadRealRace` |
| export | `loadExport` |

`MAX_AGE` (per tab, `js/data/hub.js`) controls reuse of tab DOM nodes (the check is `showTab`:
`st.node` younger than `maxAge` and not past its own `nextFlipAt`); it is independent of the
API cache TTLs (`TTL_*` in `js/data/api.js`). Refreshing a tab can reuse a cached API response.
Standings tagged `LAST SEASON · <y> FINAL` are intended only January → opener; mid-season it is a bug →
`references/season-year.md`.

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
- Empty-tab copy is the `NO_RESULT_MSG` / `NO_LIVE_MSG` / `NO_TELEM_MSG` constants — an
  empty tab with no error is delayed free data, not a fetch bug.
- Tests mock the hub (`tests/helpers/f1-api-mock.js`); a missed path
  rewrite fails **open** (empty hub, green UI).

Export tab (`loadExport`) → `references/export.md`.
Season/year, stale-standings triage → `references/season-year.md`.

Start with `tests/specs/data-lifecycle.spec.js` or `tests/specs/telemetry-compare.spec.js`
through `node tools/ci/test-bg.mjs --spec <path>` (AGENTS.md §The loop). Reserve the
`test-bg.mjs hooks` group for changes that need its wider surface. Node-only, seconds, run first:
`node --test tests/unit/data-api-status.test.mjs` (also `data-standings`, `data-results`,
`data-schedule-tz`, `data-lazy-loader`, `telemetry-trace`). The group
`lifecycle-unit` is not the hub spec: its file list is `tests/groups.json`
`test:lifecycle-unit` (only `async-lifecycle` reads `api.js`/`live.js`).
