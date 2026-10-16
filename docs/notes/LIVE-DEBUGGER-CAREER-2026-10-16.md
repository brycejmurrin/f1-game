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

## Clean areas
`CareerBackup.validate/preview/apply` and `SettingsExport.applyCareer/applyGarage` over the 35 crafted payloads and 912 mutations: no throw, no prototype pollution, no storage change on a refused payload (after F1).

## Not run, and why
Season play-through with NaN breakpoints; slot isolation incl. MY TEAM; garage open/close x20 with listener/DOM counts; phone-landscape touch loops (headless viewport was 844x408, no touch emulation); share-code (designer/livery) fuzz; settings round-trip; `modes` and `ui` browser groups. Browser time went to S1–S4 and the fuzz.

## js-debugger tool problems hit
- Daemon was down at start (ECONNREFUSED :3714); the orchestrator's debug-Chrome recipe worked.
- `debugger_run` returns an operationId only; results come via `debugger_state`, which replays every completed operation on each call (output grows large).
- No breakpoint or pause was used, so no pause-token evidence exists for any row above.
- Test artefact: `localStorage.removeItem` leaves the GameStore cache (the store has no `remove`), so a deleted slot reads back.

## Next step
A follow-up lane for the unrun scenarios above; sweep the F1 class (`Number()` / `| 0` on JSON objects) in other loaders.
