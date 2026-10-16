# Live debugger career hunt — 2026-10-16

Lane: career / saves / imports / key rebinding, driven through the js-debugger MCP (debug Chrome on :9222, page served from the working tree, `__apex` page, viewport 844x408 headless — not a physical phone, no touch emulation used). PR #2550.

Method: the page ran the OLD source (`git checkout <parent> -- <files>`, reload) and the FIXED source (restored, reload); the same `debugger_run` expression ran against both.

## Seed findings

| id | verdict | old behaviour (live) | fixed behaviour (live) |
|---|---|---|---|
| S1 | CONFIRMED-LIVE | `CareerBackup.validate` ok:true for `team:{toString:1}`; `` `${team}` `` throws "Cannot convert object to primitive value" | reason `team-not-string` / `year-not-number` / `custom-team-name` |
| S2 | CONFIRMED-LIVE | `applyCareer` with `money:"abc"` wrote a slot with `money:0` | slot skipped (`skipped:1, applied:0`) |
| S3 | CONFIRMED-LIVE | local round-5 season + backup round 250: preview says "restore backup progress" (would overwrite) | "keep newer local progress" |
| S4 | CONFIRMED-LIVE | armed key-bind chip + PageDown keydown: `defaultPrevented:true` (MenuNav consumed it), chip stayed armed, no binding | `defaultPrevented:false` |
| proto | static only | `roundMap`/`finishMap` lacked the `__proto__` skip | fixed; unit test |

S4 caveat: the panel was un-hidden by script and the keydown synthesised; focus stayed off the chip in both runs, so "chip off-screen" is not shown, only that MenuNav handled the key meant for the binder.

## Beyond the seeds: import fuzz (new finding F1)

35 hand-crafted payloads, then 912 single-field mutations (2 flavours x 57 field paths x 8 hostile values) against `CareerBackup.validate/preview/apply` and `SettingsExport.applyCareer`.

F1 — `{"toString":1}` (valid JSON) in numeric fields made `Number()` / `x | 0` throw out of `SaveMigrate.migrateCareer`, so `CareerBackup.apply()` and `SettingsExport.applyCareer()` threw AFTER `validate()` said ok. Sites: `tally.*`, `rep`, `year`, `seed`, `budgetLvl`, `facility`, `seat`, `v`, `rankBefore/After`, plus `futureSave()` in career-backup. Stack (debugger): `Number <- finiteNumber (save-migrate.js:20) <- cleanTally <- migrateCareer`. Storage was byte-identical before and after (the throw precedes any write), so no half-restored career; the symptom is an uncaught error in the import callback.
Fix: `toNum()` try/catch in save-migrate, `finiteNumber` used for the `| 0` sites, try/catch in `futureSave`. After the fix: 912 mutations x 4 entry points, 0 throws, no prototype pollution.

Test artefact, not a bug: removing a key with `localStorage.removeItem` leaves `GameStore.store`'s cache (the store has no `remove`), so a deleted slot reads back.

## Not done

Season play-through with NaN breakpoints, slot-isolation switching, garage open/close x20 with listener counts, phone-landscape touch loops, share-code (designer/livery) fuzz, settings round-trip. The browser time went to S1–S4 and the import fuzz; these remain open for a follow-up lane.
