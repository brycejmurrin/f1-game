---
name: survey-ui-matrix
description: "Use when reviewing every screen across phone landscape (844x390), orientations, viewport sizes, UI scale and touch vs mouse, or proving a CSS change broke nothing. Not for: one cramped screen → ui-menu-a11y; restructuring → css-play; game screenshots → playwright-probe."
---

# Surveying the whole UI across the whole matrix

A layout bug is never "on a screen": it is a **cell** of screen × viewport × scale × pointer.
One CLI owns the menu matrix: `tools/ui/layout-audit.mjs`. The race HUD has its own (`apex_hud_survey`, below).

## Gotchas

- **Parent-only.** Every `layout-audit.mjs` / `menu-mock.mjs` call except `--help` belongs to the parent:
  `bash-guard.sh` matches the tool name in a subagent, so `--list`, `--report` and `--diff` (no browser) are
  parent-only too (AGENTS.md rule 10). Subagents analyse finished artifacts only.
- **Bryce's cell is not the default.** `--viewport` defaults to `ios-iphone-landscape` (852x393); Bryce's
  profile is `ios-iphone-landscape-844` (AGENTS.md §Coordination). Name it explicitly, and run it first.
- **Sizes are catalog names, scale is a percent.** `--scale=125` (`1.25` throws, range 40-200); viewports are
  `VIEWPORTS` names in `tools/ui/menu-screens.mjs` only. A free-form size (568x320) needs a new `VIEWPORTS`
  row. `menu-fit.mjs` is DEPRECATED except `--safe=` notch insets.
- **A run MERGES into `artifacts/layout-audit/audit.json`** by screen|viewport(|theme, `--theme=dark,light`): copy it to `audit.before.json`
  BEFORE the edit, or the regression baseline is gone.
- **Zero findings is not green.** `ui-audit.spec.js` asserts nothing; thumbnails and an empty inspector are
  insufficient. A skipped or timed-out cell is unmeasured, never a pass.
- **Hand-rolled probes lie in known ways:** read `--tap` off `<body>` not `:root`, divide by `currentCSSZoom`,
  hide `#game` before any capture, wait out the dialog transition ([probes.md](references/probes.md) §1).

## Workflow

1. **Plan the matrix** (no browser, parent-only): `node tools/ui/layout-audit.mjs --list`, and cross-check
   the screen roots in `index.html` against `SCREENS` ([setup.md](references/setup.md) §Enumerate).
2. **Baseline** (if proving a CSS change): `cp artifacts/layout-audit/audit.json artifacts/layout-audit/audit.before.json`.
3. **Bryce's cell first**, pictures AND DOM, as ONE background task (AGENTS.md rule 4), after
   `mkdir -p artifacts/logs`:
   `node tools/ui/layout-audit.mjs --viewports=ios-iphone-landscape-844 --screens='*' --shots --dom > artifacts/logs/layout-audit-844.log 2>&1`.
   Browser runs need `/proc/loadavg` < 3 and no live Playwright run (AGENTS.md rules 5, 7).
4. **Widen to the scoped axes**, e.g. the whole "0.8-1.5x, touch + mouse" ask in one run:
   `node tools/ui/layout-audit.mjs --screens='*' --viewports='ios-*,desktop-*' --scale=80,100,150 --shots`.
   Fast look first with `menu-mock.mjs`; title-path only is `--survey` (`npm run ui:survey`), all menus fast
   is `--gallery` ([cli.md](references/cli.md)).
5. **Interactive checkpoints** layout-audit cannot give (scroll both ways, final action, focus, rotation /
   roundtrip): `apex_ui_inspect`, `tools/ui/explorer.mjs`, or MCP after the batch job exits
   ([verification.md](references/verification.md) §Default-first).
6. **Stop** when every scoped cell has a row or a "clean" mark. The verdict is the defect table sorted by
   failure mode ([probes.md](references/probes.md) §4), not a pass count. Fixes go through `css-play` or `ui-menu-a11y`.
7. **Prove no regression**: re-run the same scope, then
   `node tools/ui/layout-audit.mjs --diff=artifacts/layout-audit/audit.before.json` (exit 1 on a new finding;
   [verification.md](references/verification.md) §Regression).
8. **Hand off**: publish selected captures with
   `node tools/shot/publish-evidence.mjs --dir artifacts/layout-audit --label <slug> --publish`; the PR body
   lists unmeasured cells as not run and records the `= diff` line. At most two read-only reviewers, over finished artifacts.

## References

- [references/cli.md](references/cli.md): read when choosing a tool or flag: layout-audit flags, the axes,
  free-form sizes, pseudo-locale, `menu-mock.mjs`, which tool does what.
- [references/setup.md](references/setup.md): read before the first MCP measurement (server port, the
  four-step ritual, instrument check) or when enumerating screens from source.
- [references/probes.md](references/probes.md): read when a hand-rolled measurement looks wrong, when
  reaching or resetting a screen, or when a CSS change "did nothing".
- [references/verification.md](references/verification.md): read when judging usability from captures,
  proving no regression, recording device-profile identity, or writing the evidence hand-off.
- [references/hud-mock.md](references/hud-mock.md): read when you need a fast look at the race HUD layout
  (MCP `apex_hud_mock`).
- [references/hud-survey.md](references/hud-survey.md): read when the HUD must be measured across devices ×
  cameras × settings with the 3D frame behind it (MCP `apex_hud_survey` / `apex_hud_shot`).
- Other skills: cache-bust rules [../check-changes/references/bump.md](../check-changes/references/bump.md);
  Chrome MCP setup and park-before-Playwright [../mcp-probe/references/traps.md](../mcp-probe/references/traps.md) §1;
  dead-space-beside-cramped design findings [../css-play/references/restructure.md](../css-play/references/restructure.md).
