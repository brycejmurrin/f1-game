# Presets, config normalisation and points tables

Symbols are in `js/career/season-cal.js` unless named; locate them with apex-lsp (skill code-nav).

## Presets — "2026 REAL" and the calendar chips

`PRESETS` (chips `#ss-presets` in `season-ui.js`) → `preset(id)` → a draft patch. Only `real2026`
("2026 REAL") sets format too: `trackIds` from `REAL_2026` (the frozen 2026 table — each
`{id, from, to, sprint}`), `sprint: "rounds"` and `sprintIds` from its sprint rows (the `real2026`
entry of `PRESETS`). Every other preset is a calendar only (`CLASSICS` = `t.classic`).

`gpName()` (`REAL_2026_GP`) renames Sepang to "Bahrain GP" and Catalunya to "Barcelona-Catalunya GP"
only under `fmtActive()` AND an unedited calendar (exact ids, in order) — one reorder drops the names,
by design.

Tests: `2026 REAL: every round is a shipped circuit…` and `presets slice the championship…` in
`season-cal.test.mjs`; `badges.test.mjs` and `real-race-script.test.mjs` also read `REAL_2026`. A new
2026 venue needs its circuit shipped first (`knownIds` drops an unknown id).

## Config normalisation — old saves still load

`normalize()` keeps only legal values; check it before blaming the UI:
- `trackIds` / `sprintIds` go through `knownIds()`: unknown ids and repeats are dropped, never fatal
  (test `normalise drops unknown ids…`); empty → the default calendar.
- `quali`: only an explicit `false` turns it off. `sprint`: `true`, `"rounds"` or `false` (a
  pre-per-round save has no `sprintIds` and means what it meant).
- `laps` must be in `LAP_OPTS`, else the default — a "20 laps" ask needs a new option, not a looser
  check. `drop` must be in `DROP_OPTS`, `flPoint` must be `=== true`, `points` is `"classic"` or
  `"modern"`.
- Old season saves: tests `an OLD mid-weekend save…` and `an old save without roundPts…`. Persisted
  config is the normalised one (`setConfig persists the NORMALISED config…`).

## Points tables and standings

`pointsTable()`: `CLASSIC_POINTS` (1991-2002) when `fmtActive()` and `points === "classic"`, else
`Teams.POINTS`; `payTable()` scales short races (`SHORT_POINTS`). Standings use `netPts(season, id)`:
with `drop`, only the best `trackIds.length − drop` rounds count (test `DROP WORST 2 ranks on the best
rounds…`). Sprint scoring: see SKILL.md References.
