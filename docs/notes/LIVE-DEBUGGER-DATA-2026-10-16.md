# Live-debugger hunt: Data Hub and telemetry (2026-10-16)

Lane `cursor/live-debug-data-8f3a`. Debug Chrome headless=new at 844x600, SwiftShader, driven through the
js-debugger MCP (`debugger_run` for the page-side harness, `debugger_state` for results). Source tree = deploy tip.
Evidence is VM / software-browser; no physical-device or GPU claim follows.

Harness: `window.fetch` wrapped for api hosts (jolpi.ca, openf1.org) with a `__mode` switch
(`reject`, `delay`, `500`, `trunc`, `schema`, `empty`, `null`, `arr`, `429`); `apex26.api.*` localStorage cleared
between modes; each tab opened through `DataHub.open(id)` after `DataHub.close()`; DOM snapshot of the tab body.

## Area 1 — network fault injection

| mode | tab | observed | verdict |
|---|---|---|---|
| 500 | SCHEDULE | LOADING ~30 s (3 attempts, 10 s + 20 s backoff, `api-transport.js` MAX_RETRY=2), then "SERVICE UNAVAILABLE … RETRY" | by design; no progress hint during the 30 s |

(rows for the remaining modes are added as they are triaged)

## Area 2 — tab switching races
_pending_

## Area 3 — telemetry record / compare / export round-trip
_pending_

## Area 4 — legends / driver ratings edge cases
_pending_

## Pause triage (caught-exception pauses)
_pending_

## Fixes
_none yet_

## Not run
- Data-hub browser specs (named by `pick-tests`): pending.
