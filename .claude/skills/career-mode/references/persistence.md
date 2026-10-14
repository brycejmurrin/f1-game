# Career persistence — "I lost my upgrades / save after reload"

Source of truth: `docs/CAREER.md` ("The durable mirror (IndexedDB)", the backup section, `acceptOffer`, `scrubFitted`).

Where state lives and what can drop it:
- `Career.save()` / `Career.load()` (`js/career/career.js`) write through `store.write()`; a quota hit returns
  `durable:false` (cached for the session, gone at reload). `js/core/store.js` mirrors `apex26.career*` / `apex26.season*`
  into IndexedDB and restores keys localStorage lacks at boot (asynchronously, after the first `Career.load()` read).
- `js/career/save-migrate.js` normalises old saves (`owned`, `paidSponsors`); a migration can drop a field.
- `Career.acceptOffer(i)` RE-SEEDS `owned`/`fitted` from the new team's factory preset (moving seats is not a bug).
- `scrubFitted` heals a `fitted` works id missing from `owned`; era legality (`Parts.setLegality`) never touches `owned`.
- Stale second tab: `Career.save()` refuses a stale revision (`Career.armedRevision()`); `career-cross-tab` pins it.
- `js/career/career-backup.js` export/import goes through `SaveMigrate.migrateCareer` and `store.write`.

Hook repro (owned lost after slot reload):
1. `__apex.career({flavour:"driver"})`, `careerGrant(n)`, buy a part; note `__apex.career().owned` (list, not the count).
2. `__apex.persistState()` — `ok:false` / `broken` means the write never persisted; check `mirror.failed`.
3. `__apex.careerSlots("driver", other)` then back (switching saves the leaving career first); re-read `career().owned`.
4. Reload (`page.reload()`, then wait for `__apex`) and re-read; diff against step 1 to see which of the causes above fired.

Pins: `tests/unit/career-backup.test.mjs`, `career-cross-tab.test.mjs`, `apex-career-delete.test.mjs`, `career-settle.test.mjs`.
