# Opus hunt: js/game.js + js/core (2026-10-27)
F1 low bug js/core/save-schema-registry.js:38 — `setupPresets.<team>` keys match no registry pattern → every preset save warns "unregistered save key"; throws under strict. Fix: add /^setupPresets\./ entry + test PREFIX_WRITES pattern. CONFIRMED (VM)
F2 low dead js/core/save-schema-registry.js:229 — validators/validateKey/lane never used at runtime; noteWrite ignores lane. Wire lane check or mark test-only. CODE-TRACED
F3 low latent js/core/i18n.js:47 — navigator language detection never fires (manifest not loaded at boot); boot() not serialised (stale catalog overwrite). Only en ships today. CODE-TRACED
F4 low js/core/menu-sheet-gate.js:108 — watch() misses Settings close while focus returns to the door → warm/garage prewarm stay parked. PLAUSIBLE
Not covered: almost all of game.js (652 KB) — needs a sectioned pass.
