# Hunt 2026-11-02 — car, data, editor, perf, agent API (#4457)

Slice: `js/car/ js/data/ js/editor/ js/perf/ js/agent/ js/share/ js/overlay/`. Method: prior-art scout, then five
read-only code-hunters (sonnet; no browser, nothing measured), then finding-verifier on the 13 top rows. Hunters read
the big files in full only in `js/perf/`, `js/editor/` (5 files), `js/agent/` (5 files) and most of `js/data/`; most of
`js/car/` build-time code (car3d, car-mesh, car-body-geom, liverytex, helmets…) was only grep-scanned: **not covered**.
Do-not-re-report list used: PERF-HUNT-3/7/9, BUG-HUNT PASS3, DEFECT-LEDGER, BUGS.md M24–M28.

## Fixed in this PR (CONFIRMED, each with a test)
| # | where | defect | test |
|---|---|---|---|
| 1 | `js/agent/apex-bridge.js` pollOnce | `since` advanced before commands served; a failing reply POST skipped the queued commands behind it for good | `apex-bridge.test.mjs` |
| 2 | `js/agent/apex-bridge.js` schedule | after stop()+start() during an in-flight poll the old chain re-armed on the new run: two poll chains | (guard `_run === run`; no test) |
| 3 | `js/agent/apex.js` jump / aiPlace | `null` lateral/speed written as values (`x.toFixed` then throws); aiPlace had no non-finite guard | `hunt-apex-aiplace-reset-vm.test.mjs` |
| 4 | `js/overlay/publisher.js` tick | peers expired only on an incoming message, so a crashed overlay tab never stopped the 4 Hz publish loop | `overlay-publisher.test.mjs` |

## Confirmed, not fixed (ranked follow-ups)
1. `js/agent/agentview-raster.js:574` plan(): road stamped every `max(2, mPerCol/2)` m; holes at small radius / many cols; also walks the whole lap per call. (med)
2. `js/editor/designer.js:222-249` + `canvas.js:735` setters each call `render()` synchronously: ~3 redraws per edit, 4 more after preview; coalesce on rAF. (perf, est., unmeasured)
3. `js/agent/apex-bridge.js:71-98` frames()/snap() have no timeout; a hidden tab stalls the whole link. (low)
4. `js/perf/renderer-picker.js:156-188` two-tap race confirm cannot complete from the `<select>`. (low; needs browser)
5. `js/perf/governor.js:558` sentinelArm(true) leaves `_downHold`/`_upBackoff` (state not exposed, no accessor to test; a 1-line reset was prepared and dropped for lack of a test).
6. `js/data/telemetry-player.js:292` playback dt unclamped after a hidden tab.
7. `js/car/custom-liveries.js:92` null array element passes `getCustomLiveries`; `resolveLivery` find() throws.
8. `js/editor/designer.js:472` UNDO drops a country change; `:1598` fresh open leaves an UNDO entry of the blank design.
9. `js/editor/custom-tracks.js:527` rejected `_editorLoad` promise cached for the session.
10. `js/agent/apex.js:2358` stats overlay calls non-lite `renderScale()` every 250 ms (sorts 2048 frames).
11. `js/agent/apex.js` rival/rivals pass Infinity / NaN `spec.speed`.
12. `js/data/ics.js:110` SEQUENCE is per-day; same-day correction may be ignored by clients (plausible).
13. `js/data/hub.js:807` results `showTab` resets scrollTop on each publish (plausible).
14. `js/perf/loop-health.js:176` shed→reload edge only when the cover held `slowRun` ≥9 (claim REFUTED as worded); `:248` watchOn cache stays after a failed storage write (benign).
15. `js/car/input-ghost.js:526` per-step step-object allocation (est.); `js/car/parts.js:913` `Parts.tread` dead outside one spec.

Verifier verdict: 12 of 13 checked claims CONFIRMED, 1 REFUTED (loop-health shed→reload as worded).
