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
| lastrace | `loadLastRace` | 60 min |
| live | `loadLive` | 5 min |
| telemetry | `loadTelemetry` | 15 min |
| export | `loadExport` | 24 h |

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
node tools/test-bg.mjs hooks
```

`js/data/` routes to `api` + `hooks`. Layout of the hub chrome →
**ui-menu-a11y** / **survey-ui-matrix**.
