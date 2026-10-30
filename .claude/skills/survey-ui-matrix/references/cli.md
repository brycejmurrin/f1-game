# UI-matrix CLIs: commands, flags, axes, which tool

Every `layout-audit.mjs` / `menu-mock.mjs` call except `--help` is parent-only (SKILL.md §Gotchas).

## Contents
- layout-audit commands
- Flags
- Axes and free-form sizes
- Pseudo-locale stress
- Which tool
- menu-mock: the fastest look at the menus

## layout-audit commands

```sh
# NO BROWSER (exits before any launch; all but --help still parent-only): --help, --list, --report, --diff
node tools/ui/layout-audit.mjs --help
node tools/ui/layout-audit.mjs --list            # screens × viewports catalog (counts are in its output)
# BROWSER (Chromium, as do fit-audit/menu-fit below unless --help; /proc/loadavg < 3, no Playwright run live;
#   at >= 3 reap your own Chrome (AGENTS.md rule 7), wait once, else report the cells unmeasured):
node tools/ui/layout-audit.mjs --survey          # 6 title-path screens @852x393 + shots (npm run ui:survey): NOT Bryce's cell, NOT every screen
node tools/ui/layout-audit.mjs --gallery         # fast PNG+DOM all menus (npm run ui:gallery)
node tools/ui/layout-audit.mjs --screen=settings # one cell
node tools/ui/layout-audit.mjs                   # full geometry matrix (npm run ui:audit)
# Numbers companion (type/spacing floors): node tools/ui/fit-audit.mjs
# Notch insets only: node tools/ui/menu-fit.mjs 852x393 --safe=59,0,59,21
```

`apex_ui_mission_plan` is NOT a matrix planner: it takes a named player mission (first-race,
customize-car, return-settings) and writes one explorer replay scenario. Use it only for a guided flow;
plan the matrix with `--list`.

## Flags

From `node tools/ui/layout-audit.mjs --help`: `--screens=a,b` / `--viewports=ios-*` (wildcard = prefix),
`--scale=100,130` (percent, 40-200), `--circuits=`, `--shots`, `--dom`, `--lang=TAG`, `--json`,
`--jobs=N`, `--gallery`, `--screen=ID` + `--viewport=NAME` (default `ios-iphone-landscape`), `--survey`,
`--force`, `--report` (summarize the last gallery), `--diff=BEFORE.json [--after=F]` (no browser; exit 1 on a
new finding), `--out=DIR`.

Single-cell (`--screen=`) mode forwards its one scale and rejects multiple scales rather than dropping them;
gallery mode expands scale cells. `--report` reads the standard gallery manifest by default. A
readiness/transition timeout records the cell/root and the failure; incomplete or skipped cells stay absent
evidence in the report, never full matrix green.

## Axes and free-form sizes

- pointer = viewport family (`ios-*` touch/coarse, `desktop-*` mouse/fine);
- orientation = `*-portrait` / `*-landscape` names;
- scale = `--scale=` percent (axis code: `tools/ui/ui-scale-axis.mjs`);
- no ultrawide row exists: add one to `VIEWPORTS` (`tools/ui/menu-screens.mjs`).

Viewports are catalog names only (shortest is 852x344). For a free-form size such as 568x320:

- full catalog of screens: add a `VIEWPORTS` row in `tools/ui/menu-screens.mjs`, then
  `node tools/ui/layout-audit.mjs --viewports=<new-name> --scale=125`;
- type/spacing floors only: `node tools/ui/fit-audit.mjs --sizes=568x320 --scale=125` (its own screen subset);
- `menu-fit.mjs` is DEPRECATED (its header): use it ONLY for `--safe=` notch-inset simulation, which
  layout-audit does not yet own (headless Chromium reports every `env(safe-area-inset-*)` as 0).

## Pseudo-locale stress

Pass `--lang=en-XA` on any layout-audit run (geometry, `--gallery`, or `--screen=`). The harness boots with
`?lang=en-XA` so `I18n` expands strings via `js/core/i18n-pseudo.js`: use it when hunting clipping,
truncation and tap targets on longer labels before translating real locales.

## Which tool

| tool | role |
|---|---|
| `menu-mock.mjs` | look fast (~1-2 s a cell), not a number of record |
| `layout-audit.mjs` | numbers of record: geometry matrix, gallery, diff |
| `fit-audit.mjs` | type/spacing floors (`--sizes=`, `--scale=`; no exit code) |
| `menu-fit.mjs` | `--safe=` notch insets only (deprecated otherwise) |
| `reach-score.mjs` | offline (no browser): two-thumb reach zone of each screen's primary, tap share per zone, dead space, from `--dom` dumps or an inspection (`--in DIR --svg`) |
| `test:baseline` | 6 pixel PNGs, identity check |
| `flows.mjs` | interaction FLOWS, not layout: door/Escape, double-tap bleed, focus, Back, persistence, search, rotation, D-pad; `--diff=<old flows.json>` exits 1 on a pass → fail |

## menu-mock: the fastest look at the menus

`tools/ui/menu-mock.mjs` covers every `menu-screens.mjs` screen: 3D off, one boot per pointer shape
(touch-mobile / pointer-desktop), viewport + safe-area insets changed in place, JPEG at device scale 1,
labelled boxes (controls yellow, tap/off-screen red), `index.md` with tap / off-screen / clipped / small-text
per cell and a `sheet.jpg`; a warm re-run is served from the content-hash cache. Look-fast only.

```sh
node tools/ui/menu-mock.mjs                                                                  # title,settings,racesettings,results,quali,pause @ 844x390
node tools/ui/menu-mock.mjs --screens=select,garage --viewports='ios-*,desktop-1280x800' --format jpeg
node tools/ui/menu-mock.mjs --screens='*' --viewports=ios-iphone-landscape-844 --list         # cells, no browser (parent-only)
```

Shared pieces (held rAF, boxes, CDP capture, contact sheet, content-hash cache) live in `tools/lib/ui-mock-core.mjs`.
