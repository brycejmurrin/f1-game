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

| RESULTS year pills 2025 → 2024 → 2023 → 2025 within 600 ms, 1.5 s responses | exactly one pill active (the last, 2025), pickers settle, 0 errors |

Caveat: STANDINGS in the first two rows reused a cached `empty` node ("updated 1m ago"), so those prove the tab
switching and visibility, not a fresh load race; RESULTS/TELEMETRY (dropped on close) did reload.

## Area 3 — telemetry record / compare / export round-trip

The hub's TELEMETRY tab is an OpenF1 fastest-lap viewer (`fetchDriverTel` → `DataTelemetryModel`), not the in-race
trace buffer, and EXPORT is gather-and-zip only: there is no import path, so a re-import round-trip does not exist
(the write side is pinned by `tests/unit/data-export.test.mjs`, 9 pass). Probed `telemetry-model.js` directly with
synthetic laps of different length (120 x 0.25 s vs 95 x 0.30 s; scratch/data-hunt/telemetry-check.mjs):

- `brakingDuel` with an interval past the shorter lap, an empty lane, duplicate timestamps and a zero-width interval:
  each answers `available:false` with its reason, or a finite result; no NaN reaches `deltaBefore/After`.
- `cumDist` with a missing `speed` sample turns everything after it into NaN by design; `brakingDuel` then rejects
  the lane ("Distance must increase"), and the gauges render "—" (`telemetry-player.js` isFinite guards).
- `distAtT(cum, NaN)` is NaN and `sampleAt(car, NaN)` returns the first sample; callers never pass NaN (cursor is clamped).
- Live: gauges/summary paint under `empty`, `null` and `[]` payloads (the NO_TELEM_MSG card); a non-empty lane could not
  be built without the real OpenF1 feed, so a recorded-lap vs reference-lap compare through the real DOM is **not run**.

## Area 4 — legends / driver ratings edge cases

Fuzzed in a Node VM (scratch/data-hunt/legends-check.mjs): no duplicate legend ids/codes; every `ratingsFor` finite;
`byId/byCode/team/parts/seatOf` on `constructor`, `__proto__`, `toString`, `null`, `undefined`, `""`, `0` all answer
null / -1 (they use `find`, not property lookup); every legend's era has a PERIOD setup and an ERA_YEAR; no code is in
both `BASE` and `HIRES`; `DriverRatings.get` on prototype keys and on tier `NaN/undefined/"x"/-5/99/Infinity` is
finite on all seven axes. One defect found (F1 below).

## Pause triage (caught-exception pauses)

One session, `debugger_exceptions all`, `reject` mode, RESULTS opened (the path every fault mode shares):

| # | pause | stack | triage |
|---|---|---|---|
| 1 | promiseRejection | injected `window.fetch` -> `fetchTimed` (`api-transport.js:208`) -> `fetchOnce` -> `attempt` | the harness's own `Promise.reject(TypeError)`; the transport's `.catch` in `attempt()` handles it. Not a defect |

Resume produced no second pause, so the rest of the failure path (transport -> hub `loadTab` rejection arm ->
`errorBlock`) throws nothing that is caught-and-ignored. Telemetry/picker loaders were not paused separately (they share
this transport). One browser session only; not exhaustive.

## Fixes

- **F1 (low)** `DriverRatings.get(code, tier, deltas)` added a persisted delta with `+`: a string `"5"` concatenated
  (`82 + "5"` = `"825"`, clamped to 100) and `Infinity` pinned the axis. Career saves are the only source and are
  validated elsewhere, so reach is a corrupt save. Now only finite numbers apply. Test: appended to
  `tests/unit/driver-ratings-personality.test.mjs` (fails on the old code, 1 of 8; passes after).

## Not run
- Browser groups `pick-tests` names for these files: `hooks` (data-lifecycle, telemetry-compare), `lifecycle-unit`, `tiny`.
  Not run: the diff is a pure-data module plus a unit test, and the debug Chrome owns the one browser slot.
- Recorded-lap vs reference-lap compare through the real DOM (needs a live OpenF1 lap).
- Caught-exception pause triage (see above).
- 30 s delay and 429 modes live.
