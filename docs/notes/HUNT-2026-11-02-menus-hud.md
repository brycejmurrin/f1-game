# Hunt 2026-11-02 — menus and HUD (js/ui, js/garage, js/career, css) — #4455

Prior art: UI-HUNT-2-HUD, UI-HUNT-3/4/5 notes, DEFECT-LEDGER (KNOWN rows not re-reported).
Hunters (sonnet, read-only) covered only parts of the slice (they ran out of turns); this is not a clean bill.

## Ranked findings

| # | sev | where | claim | status |
|---|---|---|---|---|
| 1 | low (perf) | js/ui/scroll-fade.js:257 | `new MutationObserver(settle)` passes the records array as `immediate`, so every screen `[hidden]` flip runs a synchronous paintAll (forced layout) instead of the 48 ms coalesced path the comments promise | CONFIRMED (re-read; MO callbacks get `(records, observer)`), FIXED here with `() => settle(false)`; test in tests/unit/settings-open-perf.test.mjs (fails before, passes after) |
| 2 | low | js/ui/dock-layout.js:271 | `setEditing(false)` drops an in-flight drag without `save()` | CONFIRMED, FIXED, test in dock-layout.test.mjs |
| 3 | low | js/career/career-planning.js:54 | conflict card prints NaN / undefined for a stored save lacking season/money/rep | CONFIRMED, FIXED, test in career-cross-tab.test.mjs |
| 4 | low | js/career/season-cal.js:215 | no-op APPLY inherits a refused save (invalid/unknown circuit/conflict) as "STORAGE IS FULL" | CONFIRMED, FIXED, test in season-cal.test.mjs (real quota failures still carry through) |
| 5 | low | js/ui/track-maps.js:197 | compute() cached `null` forever after one throw, with no log | CONFIRMED, FIXED (Log.warn, failure not cached); no test |
| 6 | trivial | js/ui/hud-strategy.js:96 | `last.label` never read | CONFIRMED, FIXED (removed) |

### Follow-ups (CONFIRMED, not fixed here; perf figures are estimates, not measured)
| # | sev | where | claim |
|---|---|---|---|
| F1 | med perf | dock-layout.js:364-375,119-141 | every REPOSITION pointermove: 2x getComputedStyle (usablePad) + `GameHud.invalidateFit()`; cache pad at pointerdown, invalidateFit per rAF/pointerup |
| F2 | low perf | hud-arrange.js:241,205,227 | each drag rAF flush calls `rectsNow()` twice (markClashes + paintBar); pass the rects |
| F3 | low perf | hud-elements.js:138,258 | `setMany` persists then applies; the store subscriber applies again (double apply + invalidateFit per toggle) |
| F4 | low perf | scale.js:241-245 | `syncLayout` on window and visualViewport resize, unthrottled |
| F5 | low bug | scale.js:161-165 | "fits N%" suffix on BUTTON SIZE only refreshed in applyBtnScale; stale after a cap change |
| F6 | trivial perf | track-maps.js:475,651 | `sectorColors()` getComputedStyle twice per draw |
| F7 | low leak | results-sheet.js:140-147 | module-level `saidFor` holds the finished race's car array until the next results sheet |

## Checked, no defect found
podium-beat, race-message-history, css-zoom, quali-sheet, hud-minimap draw path; modal, deep-link, layers, live-region, share-code, loading-screen, settings-search Escape; career save-migrate, restore-points, settle/sponsor/rollover math; garage scene release()/previewMesh LRU, setup-camera pointer release; settings-export JSON.parse sites are inside try.
Note (cheat-mode only): `freeMoney` escrow charges nothing but pays `stake*2` on a met brief (career-planning.js:46 / career.js:1278).

## Not covered
See the PR body for the list of files the hunters did not reach; follow-up rows are appended as later hunters report.
