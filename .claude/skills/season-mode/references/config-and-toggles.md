# Config lifecycle and the sprint / quali chains

Symbols are in `js/career/season-cal.js` unless named; locate them with apex-lsp (skill code-nav).

## Config and save lifecycle

`config()` / `setConfig()` are the SETUP PREFERENCES. A live season races its OWN frozen config:
`activeCfg` (= `season.config`), and every format accessor reads `rulesConfig()`, which returns
`activeCfg` in flow `"season"`, never the preferences. Only APPLY changes it:
`#ss-apply` → `SeasonCal.applyConfig(draft)` (returns `{season,ok,durable,reason}`; it sets the
preferences AND `activeCfg`). Use it rather than `setConfig()` + `restart()` + `save()`.

- Changed rules on a season in progress only ARM a two-tap confirm ("RESTART? — SEASON IS LOST",
  `G.armConfirm`, called from `season-ui.js`; defined in `js/game.js`); one tap, or BACK (which
  discards the draft), changes nothing.
- The SETUP draft opens from `SeasonCal.config()` (preferences), not `G.season.config`: a resumed
  save freezes its own config, and a foreign `seasonCfg` write reloads the preferences. So a chip can
  read ON while the live season races OFF.
- A foreign-save conflict rejects APPLY (`ok:false`); the UI loads the latest save for review.
  Quota failure may be `ok:true,durable:false` (session-only).
- `resetWeekend()` resets the last-scored marker; `restart()` creates a blank season. Completed
  standings remain readable while `canRace()` / `award()` refuse further scoring.

## Sprint on/off

- Chain: SETUP chip `ss-sprint` (`season-ui.js` buildPool; per-round toggles: `buildCalendar` /
  `toggleSprint`) → `draft.sprint` (`false|true|"rounds"`) + `draft.sprintIds` → APPLY
  (`applyConfig`: `normalize()` + `setConfig` + `activeCfg = snap`) → `rulesConfig()` →
  `sprintOn(season)` (false unless flow is `"season"`) → `stage(season)`.
- A weekend that shows no sprint session: check the flow gate, the frozen config (FIRST CHECK in
  SKILL.md), and `sprintIds` for the round's track. `sprint:"rounds"` with no round marked is
  `sprintOn` false (the SETUP note counts the marked rounds).
- Sprint distance: `lapsFor()` divides the race laps (`SPRINT_FRAC`, floor `SPRINT_MIN`) only on the
  sprint stage; NEXT ROUND's distance is `roundLaps()` (both called from `js/game.js`).
- Consumers: `js/game.js`, `js/race/pit-lane.js`, `js/audio/announcer.js`, `js/ui/results-sheet.js` `midWeekend`.

## Quali on/off

- Chain: SETUP chip `ss-quali` (`season-ui.js` buildPool) → `draft.quali` → APPLY (`applyConfig`;
  `normalize()`: only an explicit `false` turns it off) → `rulesConfig().quali` → `SeasonCal.quali()` /
  `qualiNext()` / `qualiLabel(season)`.
- `stage()` is `"race"|"sprint"` only and never reads `quali`, so a "qualifying stage" that survives
  quali-OFF is a consumer, not the SETUP screen.
- Consumers: `js/race/race-settings.js` (START label, GRID row locked to QUALIFYING when `quali()`),
  `js/ui/quali-sheet.js`, `js/game.js` (`gridFromQuali`, `openQuali`).
- Unit tests: `a season with qualifying off never qualifies` and `a no-qualifying sprint weekend...` in
  `season-cal.test.mjs`; the chip itself is browser-only (`season.spec.js`, `season-format.spec.js`).
