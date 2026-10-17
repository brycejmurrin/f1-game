# Live debugger career hunt — 2026-10-16

Lane: career / saves / imports / key rebinding, driven through the js-debugger MCP (debug Chrome on :9222, page served from the working tree, `__apex` page, viewport 844x408 headless — not a physical phone, no touch emulation used). PR #2550.

Method: the page ran the OLD source (`git checkout <parent> -- <files>`, reload) and the FIXED source (restored, reload); the same `debugger_run` expression ran against both.

## Scope covered
S1–S4 old-vs-fixed live; import fuzz (35 crafted payloads, then 912 single-field mutations = 2 flavours x 57 paths x 8 hostile values) through `CareerBackup.validate/preview/apply` and `SettingsExport.applyCareer`.

## Findings
| id | file:line | severity | verdict | debugger evidence | fix commit | test | issue |
|---|---|---|---|---|---|---|---|
| S1 | career-backup.js slotPayloadOk | med | CONFIRMED-LIVE | `validate` ok:true for `team:{toString:1}`; `${team}` throws "Cannot convert object to primitive value" (expression via debugger_run, no breakpoint) | cad467cb | career-backup.test.mjs reason table | none |
| S2 | settings-export.js applyCareer | low | CONFIRMED-LIVE | `money:"abc"` stored as `money:0` | cad467cb | settings-export.test.mjs | none |
| S3 | career-backup.js seasonAhead | low | CONFIRMED-LIVE | local round 5 vs backup round 250: preview "restore backup progress" | cad467cb | career-backup.test.mjs | none |
| S4 | menu-nav.js navKey | low | CONFIRMED-LIVE (synthetic keydown, panel un-hidden by script) | armed chip + PageDown: `defaultPrevented:true`, chip stays armed | cad467cb | none (needs DOM) | none |
| proto | save-migrate.js roundMap/finishMap | low | VM-ONLY | not run live | cad467cb | save-migrate.test.mjs | none |
| F1 | save-migrate.js:20 finiteNumber and the `\| 0` sites; career-backup.js futureSave | med | CONFIRMED-LIVE | stack `Number <- finiteNumber (save-migrate.js:20) <- cleanTally <- migrateCareer (324)`; `{toString:1}` in tally/rep/year/seed/budgetLvl/facility makes `apply()` and `applyCareer()` throw after `validate()` ok; storage unchanged (throw precedes write) | 9ce0c149 | save-migrate.test.mjs, career-backup.test.mjs | none |

Fixed behaviour: S1 reasons `team-not-string`/`year-not-number`/`custom-team-name`; S2 `skipped:1, applied:0`; S3 "keep newer local progress"; S4 `defaultPrevented:false`; F1 0 throws over 912 mutations, no prototype pollution.

## Follow-up round (same day, live, headless debug Chrome)
| area | verdict | evidence |
|---|---|---|
| Fast season play-through | CLEAN | `careerSim(1)` x24 on haas seat 1: every round `Number.isFinite` over the sim row and `careerState()`, money >= 0, rep in 0..100: 0 hits. Money 1531 -> 9626, then `careerRollover()` (year 2027, seasons 1) with 0 non-finite values. Cosmetic only: rep prints `79.99999999999999` / `84.99999999999999` (float noise). `slots()` shows `seasons:2` against `careerState().seasons:1`: BY-DESIGN, the slot summary counts the current season (`tally.seasons + 1`, career.js:313). |
| Slot isolation | CLEAN | driver 0/1/2 + MY TEAM 0 with distinct money and teams; 40 `careerSlots(f,i)` switches in mixed order: live money matched the slot's own value every time, storage of the other three slots never changed, flavour never crossed, `careerSlot` pointer ended on the last switch. |
| Garage open/close x20 | CLEAN | 20 `#mb-garage` -> `#cs-done` cycles, the menu returned every time. DOM nodes 5174 (before first full cycle) -> 5358 at cycle 5 and 5358 at 10/15/20: a one-time lazy build, no growth. `addEventListener` wrapped before the loop: every key went 0 -> 1 once on first init (audio/Spotify/settings panes; `document\|visibilitychange` 0 -> 3), none scales with the cycle count. |
| Share codes | CLEAN (thin on setup) | 155 inputs through `ShareCode.decode`/`apply`/`messageFor`: hostile bodies per field (`{toString:1}`, null, [], 5000-char strings, -1, 1e308, `__proto__`), truncated and padded codes, double-encoded URLs, bad base64, 2 MB tail, junk strings. 13 decoded ok and applied; 0 throws, no prototype pollution. Only the livery and daily seeds encoded; my `setup` tune payloads were rejected by `encode`, so setup-code apply is barely covered. |
| Settings export/import round-trip | CLEAN | `collect("all")` -> `applySettings` (162 applied, 0 failed) -> `collect("all")` identical (minus `exportedAt`). `{toString:1}` in every setting: 0 applied, no throw, state unchanged. `__proto__` key: no pollution. |
| Phone landscape touch | CLEAN | CDP `Emulation.setDeviceMetricsOverride` 844x390 mobile DPR 2 + `setTouchEmulationEnabled` held by a script (confirmed `innerWidth x innerHeight` = 844x390, `pointer: coarse`, `maxTouchPoints` 5). Main menu, career hub, Settings and Settings > Controls: 0 interactive elements under 44 px, no horizontal overflow. Below-the-fold items (WATCH BROADCAST, PRACTICE GOALS, PHOTO STUDIO, GARAGE in `#menu-buttons`; settings tiles) are inside scroll containers and reachable (GARAGE scrolls to bottom 312). No screenshots taken. |

## Clean areas
Everything in the follow-up table, plus: `CareerBackup.validate/preview/apply` and `SettingsExport.applyCareer/applyGarage` over the 35 crafted payloads and 912 mutations: no throw, no prototype pollution, no storage change on a refused payload (after F1).

## Not run, and why
`modes` and `ui` browser groups (Playwright, not part of this lane's local budget); real touch gestures (taps, swipes) on a physical phone; the track designer's own share code (`designer.shareCode`) and a valid setup share code; a driven (not simulated) race for the economy; no breakpoints/pauses were used in this round either.

## js-debugger tool problems hit
- Daemon was down at start (ECONNREFUSED :3714); the orchestrator's debug-Chrome recipe worked.
- `debugger_run` returns an operationId only; results come via `debugger_state`, which replays every completed operation on each call (output grows large).
- No breakpoint or pause was used, so no pause-token evidence exists for any row above.
- `debugger_run` with `awaitPromise` times out (~60 s) on a long async and loses the result while the page keeps running; also a pending evaluation blocks every later call until detach. Workaround: start the loop fire-and-forget and keep progress on `window`, poll with short reads.
- `debugger_state` replays every completed operation on each call, so its output grows; detach/attach resets it.
- Headless `--window-size=844,390` gives a 408 px viewport; used CDP device metrics override instead, which only lasts while the CDP session that set it stays open.
- Software rendering makes the first garage/scene build take minutes and blocks the page thread, so even a trivial read queues behind it.
- My own harness mistakes (not software defects): `offsetParent` is null for fixed-position elements; `#ga-close` is the hidden garage-arrival overlay, the garage close button is `#cs-done`.
- Test artefact: `localStorage.removeItem` leaves the GameStore cache (the store has no `remove`), so a deleted slot reads back.

## Next step
Sweep the F1 class (`Number()` and `| 0` on JSON objects) in other loaders; cover a valid setup share code and the designer share code; a Playwright `modes`/`ui` run once CI queue allows.
