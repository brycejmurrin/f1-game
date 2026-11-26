# Synthetic legacy save files (#6602 phase 0)

Frozen copies of the four legacy file formats other than settings, read by
`tests/unit/save-file-golden.test.mjs`. Bryce's real settings exports stay in
`tests/data/settings-live-export-*.json` and are never rewritten (#6602 P6).

| file | format | written by | door that reads it |
|---|---|---|---|
| `garage-v1.json` | `apex26-garage-v1` | `SettingsExport.collectGarage` | LOAD GARAGE FILE (`applyGarage`) |
| `career-v1.json` | `apex26-career-v1` | `SettingsExport.collectCareer` | SAVES & DATA › LOAD CAREER FILE (`applyCareer`) |
| `career-backup-v1.json` | `apex26-career-backup-v1` | `CareerBackup.build` | CAREER MODES › RESTORE … SAVES (`validate`, `applyWithUndo`) |
| `recovery-v1.json` | `apex26-recovery-v1` | the shape `select-screen.js` `exportRecovery` writes | CAREER MODES › RECOVER SLOT (`recoveryEnvelope`) |

Each was written once, on 2026-11-26 from deploy tip `6de4bc80`, by that writer in a node VM over a seeded
store: six careers (`driver` and `myteam`, slots 0-2, money 110/120/130 and 210/220/230, stored at
`v: 1`), `careerSlot` `driver:1`, badges, one parts sheet, one setup, one career setup, one custom
livery and its selection, `team` and `driver`. `exportedAt` is frozen at `2026-11-25T00:00:00.000Z` and
`build` at `golden`. The recovery file carries the stored (unmigrated, `v: 1`) `career.driver.1`.

These are LEGACY files: once the `apex26-save` envelope ships (#6602 phase 8) they must keep loading,
so do not regenerate them to match a newer writer. Add a new file instead. The corrupt variants are
built from these in the test, not stored.
