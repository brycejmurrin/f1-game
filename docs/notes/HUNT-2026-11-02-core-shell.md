# Hunt 2026-11-02 — core and shell (issue #4458)

Slice: `js/core/`, `js/workers/`, `sw.js`, `index.html`, `tools/ci/`, `tools/lib/`. Method: prior-art scout, four read-only
code-hunters, one finding-verifier (13 claims, 0 refuted). Not measured: no timing was taken; perf rows are estimates.
`js/workers/` and `script-loader.js` were read in full and came back clean.

## Fixed in this PR (each with a test)
| # | file | finding |
|---|---|---|
| 1 | `js/core/i18n.js` loadCatalog | Overlapping `set("fr")` then `set("en")`: the late fr fetch installed a French catalogue while `activeLang` was en. A generation token now drops the stale load (`i18n.test.mjs`). |
| 2 | `js/core/log.js` flatten | `JSON.stringify(undefined/fn)` is `undefined`, recorded as a blank; now `String(a)` (`log-namespaces.test.mjs`). |
| 3 | `tools/lib/deploy-status.mjs`, `run-pid.mjs` | `pidAlive` was true for a zombie, so `wait-for --pid-gone` waited out its timeout; now reads `/proc/<pid>/stat` state Z (`run-pid.test.mjs`). |
| 4 | `tools/lib/stale-rows.mjs` | `git diff --name-only` missed rename sources; now `changedPaths` (the M36 class). |

## Refuted on closer reading
- `i18n.js:116` double placeholder expansion: the plural parser only accepts `[^}]*` forms, so a form cannot hold `{x}`; no reachable case.

## Follow-ups, ranked (CONFIRMED, not fixed here)
1. **med** `index.html:489-496` shell-script retry deletes every `apex26-*` cache including `apex26-voice` (up to ~111 MB), then reloads without reinstalling the SW; the recreated generation has no INSTALL_COMPLETE/SETTLED marker, so offline status is `known:false` and `sweepStaleCaches` never runs. Small fix: delete only `/^apex26-\d+$/`; the full fix re-seeds the SW. Not done: it edits an inline script, so CSP hashes need `npm run gen`.
2. **low** `js/core/native-download.js:150` export failure logged at `Log.info`: a dead click with no feedback; use `Log.warn` plus a toast.
3. **low** `js/core/log.js:174` `persist(null)` leaves the live level tables untouched until reload (judgement call).
4. **low** `sw.js:1229` music is cached into each build generation and re-downloaded per deploy (desktop only; phones use Range, uncached). Needs a fixed cache design.
5. **low** `sw.js:201` `matchPreferCurrent` does up to 2N lookups on a miss.
6. **low** `tools/ci/live-run-check.mjs:36` repo regex stops at a dot; queued runs not counted (maybe intended).
7. **low** `tools/ci/nightly-group.mjs:100` main guard breaks on a path needing URL-encoding; `sweep-shards.mjs:70` unguarded argv[1]. Also `tools/mcp/js-debugger-session.mjs:72` has the zombie `pidAlive` pattern (outside the slice).
8. **low** `tools/ci/test-coverage-audit.mjs:31` coverage matched by basename only (a full-path match may expose existing orphans).
9. **low** `tools/ci/selected-gate-verdict.mjs:106` `DROPPED=""` reads as "dropped N" (fails closed, wrong message).
10. **perf, est.** `tools/lib/pr-snapshot.mjs:73` serialises the store twice per save; `js/core/store.js:217` `raw()` allocates a closure per call (no hot caller found).

Not covered by any hunter: `tools/ci/` deploy, select-specs, tooling-fast, test-bg, ci-watch, merge-gate, ready-gate, sync-pr and most of `tools/lib`; `index.html` lines 656-3660 (markup).
Already known: DEFECT-LEDGER:1778 (sw activate sweep), DEFECT-LEDGER:1539 (no CSP), BUGS.md:88 (IDB flush).
