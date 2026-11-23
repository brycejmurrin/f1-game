# R2 Opus hunt: js/game.js, js/core
F1 low js/core/dom-apply.js:44 — I18n.set("en") after another language never restores data-i18n-default (shouldApply false for en); attr fallback is the translated value. CODE-TRACED (latent: only en ships)
F2 low js/core/i18n.js:218 — boot()/loadCatalog has no generation token: de then fr, slow de lands last. CODE-TRACED
F3 low perf js/core/i18n.js:260 — set() applies DOM twice (onChange listener + direct call). Delete :260. CODE-TRACED
F4 MED js/game.js:2487 — Career.markWeekendStarted() runs before ensureRaceSession / conflict / canRace / context-loss checks; a failed bundle load + BACK locks the round's brief and escrows planning with no race. Move after the checks (or to setState("count")). PLAUSIBLE
F5 low dead — MenuSheetGate.parkedWarm test-only; I18nDom.applyNode/shouldApply, I18n.dir no caller; game.js:5796 `if (!c.human)` always true. CODE-TRACED
Clean: endRace, tickBody, render prefix, updateCarLateral, startRaceBody, RaceWakeLock, ScriptLoader.
Not covered: store.js, save-schema-registry, native*, clipboard, dev-flags, lazy-bundles 260+, most of game.js.
