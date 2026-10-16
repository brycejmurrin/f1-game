# Sprint points look wrong — checklist

Work in this order; each step is one read in `js/career/season-cal.js` unless noted.

1. `award()` picks `scoring = stage(season)`, then `payTable(table, scoring, run)`.
2. `run` is `RaceControl.shortRun` (null for a race that saw the flag). `payTable`: under 2 laps pays
   nothing; a SPRINT pays nothing below 50 % of its laps, otherwise the full `SPRINT_POINTS` table. Only a
   Grand Prix uses `SHORT_POINTS` (25/50/75 % columns; CLASSIC halves below 75 %); `SHORT_POINTS` is GP-only.
   Unit test `a race nobody took the flag in pays the shortened-race scale...`.
   `award()` returns null before any table when `fmtActive() && seasonConflict` or `!canRace(season)`.
3. The fastest-lap point (`flPoint` in the config, read only when `fmtActive()`) is Grand Prix only, top-ten only, and
   needs `shortFrac(run) >= 0.5`; test `the fastest-lap point pays +1 to a top-ten finisher only, and never on a sprint`.
4. Consumer order in `js/game.js` `endRace`: `wasSprint` is read BEFORE `award()` advances the
   stage; `buildResults(order, { sprint: wasSprint })` takes it explicitly.
5. `js/ui/results-sheet.js` falls back to `SeasonCal.scored()` for the sprint flag, which is
   stale after a season save conflict — check the conflict before blaming the table.
6. `resetWeekend()` sets the stage back to `"race"`; a reload mid-weekend must keep the stage
   (test `resume keeps a mid-weekend stage, so a reload cannot re-pay a sprint`).
