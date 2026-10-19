---
name: survey-ui-matrix
description: "Use when reviewing the whole UI across orientations, viewport shapes, UI/HUD scale and pointer type: enumerate every screen from source, measure each cell for clipping, truncation, tap targets and overflow, capture screenshots — before a restructure, to prove a CSS change regressed no other shape. Not a single cramped screen (ui-menu-a11y) or the restructure itself (css-play)."
---

# Surveying the whole UI across the whole matrix

The parent runs the browser matrix with one Chromium session — and `--list` /
`--report` too: `bash-guard.sh` refuses `layout-audit.mjs` / `menu-mock.mjs` in a
subagent unless `--help` is passed. Delegate only artifact analysis. Subagents return defect tables
with screenshot paths and missing cells; the parent applies fixes via `css-play`
or `ui-menu-a11y`. This follows AGENTS.md rule 10.

## Default-first visual verification

Follow AGENTS.md’s UI review baseline: fresh shipped appearance and device input defaults first; stress scales,
imported settings and legacy looks are separately labelled comparisons. Record requested scale and painted zoom.
Inspect original full-size images with DOM/computed-style evidence. Thumbnails and zero inspector findings are
insufficient. Exercise real scrolling both ways, the final action, keyboard focus visibility, and state retention
through resizing and disclosure changes. Capture initial, mid-scroll, end, return, open/closed, and focus/rotation checkpoints. Show individual original captures when reporting usability.

## Prerequisites

Browsers and Playwright MCP come from the SessionStart hook (AGENTS.md rule 1).

A layout bug is never "on a screen" — it is a **cell of a matrix**: screen ×
viewport × scale × pointer. **One CLI:** `tools/ui/layout-audit.mjs`.

```sh
# NO BROWSER (exits before any launch; all but --help still parent-only): --help, --list, --report, --diff
node tools/ui/layout-audit.mjs --help
node tools/ui/layout-audit.mjs --list            # screens × viewports catalog (counts are in its output)
# BROWSER (Chromium, as do fit-audit/menu-fit below unless --help; /proc/loadavg < 3, no Playwright run live):
node tools/ui/layout-audit.mjs --survey          # title-path + shots (npm run ui:survey)
node tools/ui/layout-audit.mjs --gallery         # fast PNG+DOM all menus (npm run ui:gallery)
node tools/ui/layout-audit.mjs --screen=settings # one cell
node tools/ui/layout-audit.mjs                   # full geometry matrix (npm run ui:audit)
# Numbers companion (type/spacing floors): node tools/ui/fit-audit.mjs
# Notch insets only: node tools/ui/menu-fit.mjs 852x393 --safe=59,0,59,21
```

Phone landscape 844x390 touch (NOT the default `ios-iphone-landscape`, 852x393):
`node tools/ui/layout-audit.mjs --viewports=ios-iphone-landscape-844 --screens='*'`.
Axes: pointer = viewport family (`ios-*` touch/coarse, `desktop-*` mouse/fine);
orientation = `*-portrait` / `*-landscape` names; no ultrawide row exists — add one to
`VIEWPORTS` (`tools/ui/menu-screens.mjs`). The whole "0.8-1.5x, touch + mouse" ask is one run:
`node tools/ui/layout-audit.mjs --screens='*' --viewports='ios-*,desktop-*' --scale=80,100,150 --shots`.
Which tool: menu-mock = look fast; layout-audit = numbers of record; fit-audit = type/spacing floors; menu-fit = free-form size.

Flags (header of `layout-audit.mjs`): `--screens=a,b` / `--viewports=ios-*`
(wildcard = prefix), `--scale=100,130` (40-200), `--circuits=`, `--shots`, `--dom`,
`--jobs=N`, `--gallery`, `--screen=ID` + `--viewport=NAME`, `--force`, `--report`
(summarize the last gallery), `--diff=` (below), `--out=DIR`.

`--scale` takes a PERCENT (`--scale=125`; `1.25` throws). Viewports are catalog
names only (`VIEWPORTS`, `menu-screens.mjs`; shortest is 852x344), so a free-form
size such as 568x320 is `menu-fit.mjs 568x320 --scale=125` (its own 18 screens,
not the full catalog) or `fit-audit.mjs --sizes=568x320 --scale=125` (12), or a new
`VIEWPORTS` row for the full catalog.

Order: 1. `--list` and diff against `index.html` dialogs (no browser, but parent-only; setup.md
§Enumerate). 2. Measure/capture (browser-only). 3. Stop when every cell of
screens x viewports x scales you scoped has a row or a "clean" mark; the verdict
is the defect table sorted by failure mode (probes.md §6), not a pass count.

**Proving a CSS change regressed no other shape.** Before editing: `cp artifacts/layout-audit/audit.json
artifacts/layout-audit/audit.before.json` (a run MERGES into audit.json by screen|viewport, so
the baseline is gone once you re-run). After: re-run the same `--screens/--viewports/--scale`
scope, then `node tools/ui/layout-audit.mjs --diff=artifacts/layout-audit/audit.before.json`
(no browser, parent-only): `+`/`-` lines per cell, `= diff ok|NEW` last, exit 1 on any new
clipped/offscreen/docOverflowX/tinyTaps/underHardware/starved/error finding; a skipped cell is
listed as unmeasured, never a pass. Add `fit-audit.mjs --scale=` for type/spacing floors (no
exit code) and `test:baseline` (6 pixel PNGs) for identity. Record baseline path, scope and the
`= diff` line.

## Fastest look at the MENUS and sheets: `tools/ui/menu-mock.mjs` (~1-2 s a cell)

The same trick for every `menu-screens.mjs` screen: 3D off, one boot per pointer shape (touch-mobile / pointer-desktop),
viewport + safe-area insets changed in place, JPEG at device scale 1, labelled boxes (controls yellow, tap/off-screen red),
`index.md` with tap / off-screen / clipped / small-text per cell and a `sheet.jpg`. 24 cells (8 screens x 3 viewports)
took 57 s cold and 1 s warm. Look-fast only: `layout-audit` / `fit-audit` stay the numbers of record.

```sh
node tools/ui/menu-mock.mjs                                                                  # title,settings,racesettings,results,quali,pause @ 844x390
node tools/ui/menu-mock.mjs --screens=select,garage --viewports='ios-*,desktop-1280x800' --format jpeg
node tools/ui/menu-mock.mjs --screens='*' --viewports=ios-iphone-landscape-844 --list         # cells, no browser (parent-only)
```
Shared pieces (held rAF, boxes, CDP capture, contact sheet, content-hash cache) live in `tools/lib/ui-mock-core.mjs`.

Interactive poking: Playwright MCP (`tools/mcp/playwright-mcp.sh`) or Chrome DevTools MCP.

## Load on demand

- Race HUD: [`references/hud-mock.md`](references/hud-mock.md) (look-fast), [`references/hud-survey.md`](references/hud-survey.md) (devices x cameras x settings; MCP `apex_hud_survey` / `apex_hud_shot` / `apex_hud_mock`)
- Probe recipes and viewport catalogue: [`references/probes.md`](references/probes.md)
- Environment setup (browsers, MCP): [`references/setup.md`](references/setup.md)
