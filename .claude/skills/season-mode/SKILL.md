---
name: season-mode
description: Use when the standalone Season screen — calendar, weekend format, sprint, quali-on/off, points table, Season SETUP (#season-setup), season-cal.js, or season-ui.js — is being changed, and only that screen. A season, sprint or quali bug reported from inside a DRIVER CAREER / MY TEAM save is career-mode, even when it says sprint — career always races Tracks.SEASON.
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
node --test tests/unit/season-cal.test.mjs   # 46 tests, <1 s, VM, no browser: gates, award(), sprint table
node tools/ci/test-bg.mjs modes              # BROWSER group (season.spec.js, season-format.spec.js, ...): background it, AGENTS.md rule 4
```

Sprint points are scored in `SeasonCal.award()` (`SPRINT_POINTS`, `stage()`); the
results sheet reads `race.sprint` in `js/ui/results-sheet.js` `buildResults`.
"Sprint points missing" is a scoring bug only if the unit test's `a sprint scores
its own table` fails; otherwise look at the sheet/standings, not the SETUP screen.

Quali on/off: SETUP chip `ss-quali` (`season-ui.js` buildPool) -> `draft.quali` -> `normalize()` (only an explicit `false` turns it off) -> `SeasonCal.quali()` / `qualiNext(season)` / `qualiLabel(season)`. `stage()` is `"race"|"sprint"` only and never reads `quali`, so a "qualifying stage" that survives quali-OFF is a consumer, not the SETUP screen: `js/race/race-settings.js` (START label, GRID row locked to QUALIFYING when `quali()`), `js/ui/quali-sheet.js`, `js/game.js` (`gridFromQuali`, ~L9232 `openQuali`). Unit tests: `a season with qualifying off never qualifies` and `a no-qualifying sprint weekend...` in `season-cal.test.mjs`; the chip itself is browser-only (`season.spec.js`, `season-format.spec.js`).

`modes` is real-race + season + career + quali + TT. `season-(cal|ui).js` also
routes to `ui` (the SETUP screen) and `state-unit`.
