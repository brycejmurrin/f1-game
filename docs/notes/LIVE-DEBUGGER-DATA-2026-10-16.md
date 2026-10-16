# Live-debugger hunt: Data Hub and telemetry (2026-10-16)

Lane `cursor/live-debug-data-8f3a`. Debug Chrome headless=new at 844x600, SwiftShader, driven through the
js-debugger MCP (`debugger_run` for the page-side harness, `debugger_state` for results). Source tree = deploy tip.
Evidence is VM / software-browser; no physical-device or GPU claim follows.

Harness: `window.fetch` wrapped for api hosts (jolpi.ca, openf1.org) with a `__mode` switch
(`reject`, `delay`, `500`, `trunc`, `schema`, `empty`, `null`, `arr`, `429`); `apex26.api.*` localStorage cleared
between modes; each tab opened through `DataHub.open(id)` after `DataHub.close()`; DOM snapshot of the tab body.

## Area 1 — network fault injection

Harness note (a false start, kept so nobody repeats it): the first matrix was launched while an earlier
`debugger_run` was still looping in the page (its response timed out but the JavaScript kept running), so two loops
fought over `__mode`. Rows from that pass (STANDINGS "season hasn't started" under `reject`) were discarded;
`debugger_detach` does not stop page JS, only `location.reload()` does. Also: `DataHub.close()` keeps `ready`/`empty`
tab nodes (MAX_AGE), so a second mode sees the first mode's SCHEDULE node unless the page is reloaded.

| mode | tab | observed | verdict |
|---|---|---|---|
| 500 | SCHEDULE | LOADING ~30 s (3 attempts, 10 s + 20 s backoff, MAX_RETRY=2), then SERVICE UNAVAILABLE + RETRY | by design; no progress hint during the 30 s |
| reject | STANDINGS, RESULTS, TELEMETRY | SERVICE UNAVAILABLE + RETRY | ok |
| reject | EXPORT | tab description renders (no network until the user acts) | ok |
| truncated JSON | STANDINGS, RESULTS, TELEMETRY | SERVICE UNAVAILABLE + RETRY (a JSON parse failure is a failure, not an empty answer) | ok |
| wrong schema `{"foo":[..]}` | STANDINGS | "No driver standings yet — season hasn't started." | observation: indistinguishable from pre-season; the mappers (`jStandingsList`, `jRaces`) are deliberately lenient |
| empty / `null` / `[]` | STANDINGS, RESULTS, TELEMETRY | the tab's empty copy (`no data`, "No classification…", "No telemetry available yet…") | ok; no NaN, no stuck spinner |

No NaN / `undefined` / `Infinity` text in any tab under any mode (checked by regex on the tab body); no spinner left
behind once a request settled. Not exercised live: the 30 s delay and 429 modes (a 429 takes the same retry/backoff branch as the 500 row,
`api-transport.js` attempt()); unit coverage of the status paths is in `tests/unit/data-api-status.test.mjs`.

## Area 2 — tab switching races

Mode `slow` (valid empty payload after 1.5 s, abort-aware). Page-side `unhandledrejection`/`error` listeners armed.

| scenario | result |
|---|---|
| standings → results → standings → live → standings in 600 ms | ends on STANDINGS, content is STANDINGS, no spinner, 0 errors |
| open RESULTS, close at 300 ms, reopen on STANDINGS | hub hidden after close; STANDINGS painted, 0 errors |
| open RESULTS, close at 300 ms, reopen RESULTS at 350 ms | one RESULTS body, no spinner left, 0 errors |
| open TELEMETRY, close at 500 ms, reopen after the original fetch would have landed | one TELEMETRY body, 0 errors (generation counter drops the stale resolve) |

Caveat: STANDINGS in the first two rows reused a cached `empty` node ("updated 1m ago"), so those prove the tab
switching and visibility, not a fresh load race; RESULTS/TELEMETRY (dropped on close) did reload.

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
