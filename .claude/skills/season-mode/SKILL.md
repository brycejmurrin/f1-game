---
name: season-mode
description: "Use when the standalone Season screen changes — calendar, weekend format, sprint, quali-on/off, lap count, points table, fastest-lap point (flPoint), Season SETUP (#season-setup), season-cal.js, season-ui.js. A season, sprint or quali bug inside a DRIVER CAREER / MY TEAM save is career-mode (career always races Tracks.SEASON)."
---

# Standalone Season — calendar vs format

`js/career/season-cal.js` is **rules, no DOM**. `js/career/season-ui.js` is
the SETUP screen. Career is **not** customisable and stays on
`Tracks.SEASON` — do not wire `SeasonCal` calendar reads into a career
weekend.

## Two gates (getting this wrong is a real bug)

| Kind | When the player's config applies | Neutral otherwise |
|---|---|---|
| **Calendar** (`trackIds`, circuit ids, never indices) | flow is **not** `"career"` | career uses `Tracks.SEASON` |
| **Format** (`quali` / `sprint` / `sprintIds` / `laps` / `points` / `flPoint` / `drop`) | flow is **`"season"`** only | GP / TT / VS FRIEND keep one-off defaults |

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
other scoring defects. Inspect `award()` return (null = refused: `seasonConflict` or
`!canRace`), stage/config (`fmtActive()` gates the format rules), classification
and save conflict before checking the sheet/standings.

Sprint on/off:
- Chain: SETUP chip `ss-sprint` (`season-ui.js` buildPool; per-round toggles via `sprintIds`) -> `draft.sprint` (`false|true|"rounds"`) + `draft.sprintIds` -> `normalize()` -> `sprintOn(season)` (false unless flow is `"season"`) -> `stage(season)`.
- A weekend that shows no sprint session: check the flow gate and `sprintIds` for the round's track before the screen.
- Consumers: `js/game.js`, `js/race/pit-lane.js`, `js/audio/announcer.js`, `js/ui/results-sheet.js` `midWeekend`.
- Wrong sprint points: `references/sprint-scoring.md`.

Quali on/off:
- Chain: SETUP chip `ss-quali` (`season-ui.js` buildPool) -> `draft.quali` -> `normalize()` (only an explicit `false` turns it off) -> `SeasonCal.quali()` / `qualiNext()` / `qualiLabel(season)`.
- `stage()` is `"race"|"sprint"` only and never reads `quali`, so a "qualifying stage" that survives quali-OFF is a consumer, not the SETUP screen: `js/race/race-settings.js` (START label, GRID row locked to QUALIFYING when `quali()`), `js/ui/quali-sheet.js`, `js/game.js` (`gridFromQuali`, `openQuali`; locate with `rg -n "gridFromQuali|openQuali" js/game.js`).
- Unit tests: `a season with qualifying off never qualifies` and `a no-qualifying sprint weekend...` in `season-cal.test.mjs`; the chip itself is browser-only (`season.spec.js`, `season-format.spec.js`).

`modes` is a browser group; `node tools/ci/pick-tests.mjs` names the rest.

## Presets — "2026 REAL" and the calendar chips

`PRESETS` (`season-cal.js` ~661; chips `#ss-presets` in `season-ui.js`) →
`preset(id)` → a draft patch. Only `real2026` ("2026 REAL") sets format too:
`trackIds` from `REAL_2026` (the frozen 23-round table at ~650, each
`{id, from, to, sprint}`), `sprint: "rounds"` and `sprintIds` from its sprint
rows (~680-683). Every other preset is a calendar only (`CLASSICS` = `t.classic`).
`gpName()` (~168-176, `REAL_2026_GP`) renames Sepang to "Bahrain GP" and
Catalunya to "Barcelona-Catalunya GP" only under `fmtActive()` AND an unedited
calendar (exact ids, in order) — one reorder drops the names, by design.
Tests: `2026 REAL: every round is a shipped circuit…` and `presets slice the
championship…` in `season-cal.test.mjs`; `badges.test.mjs` and
`real-race-script.test.mjs` also read `REAL_2026`. A new 2026 venue needs its
circuit shipped first (`knownIds` drops an unknown id).

## Config normalisation — old saves still load

`normalize()` (~63-77) keeps only legal values; check it before blaming the UI:
- `trackIds` / `sprintIds` go through `knownIds()`: unknown ids and repeats
  are dropped, never fatal (test `normalise drops unknown ids…`); empty →
  the default calendar.
- `quali`: only an explicit `false` turns it off. `sprint`: `true`,
  `"rounds"` or `false` (a pre-per-round save has no `sprintIds` and means
  what it meant).
- `laps` must be in `LAP_OPTS` (`[3,5,10,25,57]`, ~24), else the default — a
  "20 laps" ask needs a new option, not a looser check. `drop` must be in
  `DROP_OPTS` (`[0,2,3]`), `flPoint` must be `=== true`, `points` is
  `"classic"` or `"modern"`.
- Old season saves: tests `an OLD mid-weekend save…` and `an old save without
  roundPts…`. Persisted config is the normalised one (`setConfig persists the
  NORMALISED config…`).

## Scoring

`pointsTable()` (~442): `CLASSIC_POINTS` (1991-2002) when `fmtActive()` and
`points === "classic"`, else `Teams.POINTS`; `payTable()` scales short races
(`SHORT_POINTS`); sprints: `references/sprint-scoring.md`. Standings use
`netPts(season, id)` (~538-550): with `drop`, only the best
`trackIds.length − drop` rounds count (test `DROP WORST 2 ranks on the best
rounds…`).

## Config and save lifecycle

`config()` / `setConfig()` manage setup preferences. An active season uses its
own frozen `season.config`, so preference changes cannot rewrite its rules.
`applyConfig(next)` replaces the championship and returns `{season,ok,durable,reason}`;
use that guarded operation rather than `setConfig()` + `restart()` + `save()`.
A foreign-save conflict rejects APPLY; the UI loads the latest save for review.
Quota failure may be `ok:true,durable:false` (session-only). `resetWeekend()`
resets the last-scored marker; `restart()` creates a blank season. Completed
standings remain readable while `canRace()` / `award()` refuse further scoring.
