---
name: season-mode
description: "Use when the standalone Season screen — calendar, weekend format, sprint, quali-on/off, points table, Season SETUP (#season-setup), season-cal.js, or season-ui.js — is being changed, and only that screen. A season, sprint or quali bug reported from inside a DRIVER CAREER / MY TEAM save is career-mode, even when it says sprint — career always races Tracks.SEASON."
---

# Standalone Season — calendar vs format

`js/career/season-cal.js` is **rules, no DOM**. `js/career/season-ui.js` is
the SETUP screen. Career is **not** customisable and stays on
`Tracks.SEASON` — do not wire `SeasonCal` calendar reads into a career
weekend.

## Two gates (getting this wrong is a real bug)

| Kind | When the player's config applies | Neutral otherwise |
|---|---|---|
| **Calendar** (`rounds` / `track` / `trackIndex`) | flow is **not** `"career"` | career uses `Tracks.SEASON` |
| **Format** (`quali` / `laps` / `stage` / `pointsTable` / `grid`) | flow is **`"season"`** only | GP / TT / VS FRIEND keep one-off defaults |

A `"not career"` gate on format would give a one-off Grand Prix the
season sprint distance and its points table. Persist at `apex26.seasonCfg`
(`CFG_KEY` in `season-cal.js`; `GameStore` adds the prefix).

## Do not

- Edit career saves or `Career.*` from here → **career-mode**
- Assume SETUP DOM lives in `season-cal.js`
- Recommend `test:career` — there is no such group

```sh
node --test tests/unit/season-cal.test.mjs   # focused VM checks, no fixed count; <1 s, VM, no browser: gates, award(), sprint table
node tools/ci/test-bg.mjs modes              # BROWSER group (season.spec.js, season-format.spec.js, ...): background it, AGENTS.md rule 4
```

Sprint points are scored in `SeasonCal.award()` (`SPRINT_POINTS`, `stage()`); the
results sheet reads `race.sprint` in `js/ui/results-sheet.js` `buildResults`.
Start with `a sprint scores its own table`; a green fixture does not exclude
other scoring defects. Inspect `award()` return, stage/config, classification
and save conflict before checking the sheet/standings.

Sprint on/off: SETUP chip `ss-sprint` (`season-ui.js` buildPool; per-round toggles via `sprintIds`) -> `draft.sprint` (`false|true|"rounds"`) + `draft.sprintIds` -> `normalize()` -> `sprintOn(season)` (false unless flow is `"season"`) -> `stage(season)`. A weekend that shows no sprint session: check the flow gate and `sprintIds` for the round's track before the screen; consumers are `game.js`, `pit-lane.js`, `announcer.js`, `results-sheet.js` `midWeekend`.

Quali on/off: SETUP chip `ss-quali` (`season-ui.js` buildPool) -> `draft.quali` -> `normalize()` (only an explicit `false` turns it off) -> `SeasonCal.quali()` / `qualiNext()` / `qualiLabel(season)`. `stage()` is `"race"|"sprint"` only and never reads `quali`, so a "qualifying stage" that survives quali-OFF is a consumer, not the SETUP screen: `js/race/race-settings.js` (START label, GRID row locked to QUALIFYING when `quali()`), `js/ui/quali-sheet.js`, `js/game.js` (`gridFromQuali`, `openQuali`; locate with `rg -n "gridFromQuali|openQuali" js/game.js`). Unit tests: `a season with qualifying off never qualifies` and `a no-qualifying sprint weekend...` in `season-cal.test.mjs`; the chip itself is browser-only (`season.spec.js`, `season-format.spec.js`).

`modes` is real-race + season + career + quali + TT + track-designer. `season-(cal|ui).js` also
routes to `ui` (the SETUP screen) and `state-unit`.

## Config and save lifecycle

`config()` / `setConfig()` manage setup preferences. An active season uses its
own frozen `season.config`, so preference changes cannot rewrite its rules.
`applyConfig(next)` replaces the championship and returns `{season,ok,durable,reason}`;
use that guarded operation rather than `setConfig()` + `restart()` + `save()`.
A foreign-save conflict rejects APPLY; the UI loads the latest save for review.
Quota failure may be `ok:true,durable:false` (session-only). `resetWeekend()`
resets the last-scored marker; `restart()` creates a blank season. Completed
standings remain readable while `canRace()` / `award()` refuse further scoring.
