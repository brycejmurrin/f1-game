# Hunt 2026-11-02 — menus and HUD (js/ui, js/garage, js/career, css) — #4455

Prior art: UI-HUNT-2-HUD, UI-HUNT-3/4/5 notes, DEFECT-LEDGER (KNOWN rows not re-reported).
Hunters (sonnet, read-only) covered only parts of the slice (they ran out of turns); this is not a clean bill.

## Ranked findings

| # | sev | where | claim | status |
|---|---|---|---|---|
| 1 | low (perf) | js/ui/scroll-fade.js:257 | `new MutationObserver(settle)` passes the records array as `immediate`, so every screen `[hidden]` flip runs a synchronous paintAll (forced layout) instead of the 48 ms coalesced path the comments promise | CONFIRMED (re-read; MO callbacks get `(records, observer)`), FIXED here with `() => settle(false)`; test in tests/unit/settings-open-perf.test.mjs (fails before, passes after) |

## Checked, no defect found
podium-beat, race-message-history, css-zoom, quali-sheet, hud-minimap draw path; modal, deep-link, layers, live-region, share-code, loading-screen, settings-search Escape; career save-migrate, restore-points, settle/sponsor/rollover math; garage scene release()/previewMesh LRU, setup-camera pointer release; settings-export JSON.parse sites are inside try.
Note (cheat-mode only): `freeMoney` escrow charges nothing but pays `stake*2` on a met brief (career-planning.js:46 / career.js:1278).

## Not covered
See the PR body for the list of files the hunters did not reach; follow-up rows are appended as later hunters report.
