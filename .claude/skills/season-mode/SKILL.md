---
name: season-mode
description: "Use when changing the standalone Season screen or its setup: calendar, weekend format, sprint or qualifying toggles, lap count, or points. Not for: a season inside a career save → career-mode; real F1 data → data-hub; menu layout → ui-menu-a11y."
---

# Standalone Season — calendar vs format

`js/career/season-cal.js` is **rules, no DOM**. `js/career/season-ui.js` is the SETUP screen.
Persist at `apex26.seasonCfg` (`CFG_KEY` in `season-cal.js`; `GameStore` adds the prefix). Symbols:
locate with apex-lsp (skill code-nav).

## Gotchas

- Career is **not** customisable: it races its stamped calendar (`Career.calendar()`, `Tracks.SEASON`
  only when unstamped). Do not wire `SeasonCal` calendar reads into a career weekend, and do not edit
  career saves or `Career.*` from here → **career-mode**.
- A **format** gate of "not career" is a bug: it gives a one-off Grand Prix the season sprint distance
  and points table. Format applies in flow `"season"` only (table below).
- "Toggle ignored" is usually the frozen config: a live season races `activeCfg`, not the SETUP
  preferences, so a chip can read ON while the season races OFF. Only APPLY
  (`SeasonCal.applyConfig`) changes it.
- SETUP DOM is in `season-ui.js`, never `season-cal.js`.
- There is no `test:career` group; do not recommend it.

## Two gates

| Kind | When the player's config applies | Neutral otherwise |
|---|---|---|
| **Calendar** (`trackIds`, circuit ids, never indices) | flow is **not** `"career"` | career uses `Tracks.SEASON` |
| **Format** (`quali` / `sprint` / `sprintIds` / `laps` / `points` / `flPoint` / `drop`) | flow is **`"season"`** only | GP / TT / VS FRIEND keep one-off defaults |

## Workflow

1. Classify the change: calendar or format (table above), and confirm the flow gate it needs.
2. For a toggle bug, run the FIRST CHECK: compare `G.season.config.sprint` / `.sprintIds` / `.quali`
   with `SeasonCal.config()`. They differ → the APPLY step, not the chip or a consumer. Then follow
   the sprint or quali chain in `references/config-and-toggles.md`.
3. For wrong sprint points, start with the unit test `a sprint scores its own table` (a green fixture
   does not exclude other defects), then inspect `award()`'s return (null = refused: `seasonConflict`
   or `!canRace`), stage/config (`fmtActive()` gates the format rules), classification and save
   conflict before the sheet/standings. Sprint points are scored in `SeasonCal.award()`
   (`SPRINT_POINTS`, `stage()`); the results sheet reads `race.sprint` in `js/ui/results-sheet.js`
   `buildResults`. Checklist: `references/sprint-scoring.md`.
4. For a preset, a config value that will not stick, or a points table, check `normalize()` and the
   preset patch first (`references/presets-normalize-points.md`).
5. Verify:

```sh
node --test tests/unit/season-cal.test.mjs                        # VM, no browser: gates, award(), sprint table
node tools/ci/test-bg.mjs --spec tests/specs/season.spec.js        # BROWSER, one spec, background (format chips: season-format.spec.js)
```

   Subagents never run a browser spec (AGENTS.md Session shape rule 10). `node tools/ci/test-bg.mjs modes`
   is the WHOLE group (cost: AGENTS.md §Verification) — only when `node tools/ci/pick-tests.mjs` names
   it, and then preferably `node tools/ci/remote-group.mjs modes` on the pushed branch.

## References

- `references/config-and-toggles.md` — read when a sprint or quali toggle is ignored, a weekend shows
  the wrong sessions, APPLY/restart/resume behaves oddly, or you need the consumers of `sprintOn` /
  `quali()`.
- `references/sprint-scoring.md` — read when sprint points (or the fastest-lap point, or a short-race
  payout) look wrong.
- `references/presets-normalize-points.md` — read when touching "2026 REAL" or another calendar preset,
  `gpName()`, an old save that loads oddly, a lap/drop/points option, or `pointsTable()` / `netPts()`.
