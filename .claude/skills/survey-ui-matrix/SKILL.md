---
name: survey-ui-matrix
description: "Use when reviewing the whole UI across orientations, viewport shapes, UI/HUD scale and pointer type: enumerate every screen from source, measure each cell for clipping, truncation, tap targets and overflow, capture screenshots — before a restructure, to prove a CSS change regressed no other shape, or to check every menu on every device. Not a single cramped screen (ui-menu-a11y) or the restructure itself (css-play)."
---

# Surveying the whole UI across the whole matrix

The parent runs the browser matrix with one Chromium session. Delegate only
browser-free catalog checks and artifact analysis. Subagents return defect tables
with screenshot paths and missing cells; the parent applies fixes via `css-play`
or `ui-menu-a11y`. This follows AGENTS.md rule 10.

## Prerequisites (always)

Playwright MCP + Chromium must be installed before interactive resize/DOM work:

```bash
bash tools/env/cloud-agent-install.sh      # AGENTS.md §Verification 1
bash tools/mcp/playwright-mcp.sh status 2>/dev/null || true
```

Missing browsers / wrapper: the SessionStart hook installs them (AGENTS.md
§Verification 1); fallback `bash tools/env/cloud-agent-install.sh`.

A layout bug is never "on a screen" — it is a **cell of a matrix**: screen ×
viewport × scale × pointer. **One CLI:** `tools/ui/layout-audit.mjs`.

```sh
# BROWSER-FREE (safe anywhere; exits before any launch): --help, --list, --report
node tools/ui/layout-audit.mjs --help
node tools/ui/layout-audit.mjs --list            # screens × viewports catalog (browser-free; 49×11 as of 2026-10-01)
# BROWSER-ONLY (launch Chromium: check /proc/loadavg < 3, no Playwright run live):
node tools/ui/layout-audit.mjs --survey          # title-path + shots (npm run ui:survey)
node tools/ui/layout-audit.mjs --gallery         # fast PNG+DOM all menus (npm run ui:gallery)
node tools/ui/layout-audit.mjs --screen=settings # one cell
node tools/ui/layout-audit.mjs                   # full geometry matrix (npm run ui:audit)
# Numbers companion (type/spacing floors): node tools/ui/fit-audit.mjs
# Notch insets only: node tools/ui/menu-fit.mjs 852x393 --safe=59,0,59,21
# Both of those LAUNCH CHROMIUM unless `--help` is passed (added 2026-10-01);
# a bare probe for usage used to start a browser. Prefer `layout-audit.mjs --list`
# for the catalog without launching.
```

## Fastest look at the RACE HUD layout: `tools/shot/hud-mock.mjs` (~1 s a shot)

The HUD on BLACK with every widget mocked (radio card, flag, limits chip, damage), a labelled box per
element (readouts cyan, taps yellow, overlapping pairs RED), report.json + index.md + sheet.jpg. One race
boot per pointer type (~37 s), then DOM-only cells: 48 shots in 143 s. Use it FIRST to see a layout or
to before/after a CSS change; use hud-survey (below) when the 3D frame behind matters (occlusion).

```sh
node tools/shot/hud-mock.mjs                                              # phone 844x390: 5 cams x shipped/all-on
node tools/shot/hud-mock.mjs --devices phone-se-667x375,phone-max-932x430 --cams cockpit,chase --hud-scale 70,200
node tools/shot/hud-mock.mjs --matrix scratch/cells.json                  # hud-survey cell schema
```
Approximate by design: the mirror frame follows its own show rule (no rendered frame, no side placement).
`--format jpeg` is ~5x smaller; a cell whose definition AND `js/` `css/` `index.html` are unchanged is served from
`artifacts/ui-mock-cache` (`--no-cache` re-shoots), so a re-run after a docs/tools edit costs ~1 s.

## Fastest look at the MENUS and sheets: `tools/ui/menu-mock.mjs` (~1-2 s a cell)

The same trick for every `menu-screens.mjs` screen: 3D off, one boot per pointer shape (touch-mobile / pointer-desktop),
viewport + safe-area insets changed in place, JPEG at device scale 1, labelled boxes (controls yellow, tap/off-screen red),
`index.md` with tap / off-screen / clipped / small-text per cell and a `sheet.jpg`. 24 cells (8 screens x 3 viewports)
took 57 s cold and 1 s warm. Look-fast only: `layout-audit` / `fit-audit` stay the numbers of record.

```sh
node tools/ui/menu-mock.mjs                                                                  # title,settings,racesettings,results,quali,pause @ 844x390
node tools/ui/menu-mock.mjs --screens=select,garage --viewports='ios-*,desktop-1280x800' --format jpeg
node tools/ui/menu-mock.mjs --screens='*' --viewports=ios-iphone-landscape-844 --list         # cells, no browser
```
Shared pieces (held rAF, boxes, CDP capture, contact sheet, content-hash cache) live in `tools/lib/ui-mock-core.mjs`.

## Fast path for the RACE HUD: `apex_hud_survey` / `tools/shot/hud-survey.mjs`

The menus above are `layout-audit`; the in-race HUD (devices × cameras × MOVE &
SIZE presets × theme / CVD / contrast / text × HUD / UI / BUTTON size × MAP /
GAPS / MIRROR × HudElements toggles × night × track) is one CLI that boots a
race, measures every HUD box (overlap, missing-vs-expected, offscreen, unsafe,
tiny text, page errors) and writes `report.json`, `findings.md`, `index.html`
and contact sheets under `artifacts/hud-survey/<stamp>/`. Browser-free first:

```sh
node tools/shot/hud-survey.mjs --self-test               # pure logic, no browser
node tools/shot/hud-survey.mjs --list --matrix leads     # cells + cost, no browser
node tools/shot/hud-survey.mjs --matrix quick --only chase-default   # 1 boot, ~2 min
node tools/shot/hud-survey.mjs --matrix quick            # 13 cells / 3 boots, ~10 min
node tools/shot/hud-survey.mjs --matrix quick --no-shots --gl llvmpipe   # MEASURE FIRST: 5.4 min, then --only <cells with findings> for pixels
node tools/shot/hud-survey.mjs --matrix leads            # static-audit repros with numeric checks
# full ≈ 45 min (pairwise); exhaustive ≈ 4 h → shard it: --shard i/n, then --merge <dirs>,
# or dispatch .github/workflows/hud-survey.yml (llvmpipe shards + one merged artifact)
```

MCP: `apex_hud_shot` (one cell's knobs → `structuredContent` {shot, findings,
measurements} + a `resource_link` to the PNG) and `apex_hud_survey` (`matrix`,
`only`, `shard`, `noShots` → findings summary + links to findings.md /
index.html). Both take `scratch/apex-browser.lock` — `apex_status` first. A
`missing` finding is the point: an element the settings promise but the page
hides (the expected-visible rules live in `tools/lib/hud-survey-matrix.mjs`).

This skill is the **interactive** complement: Playwright MCP for resize / DOM /
CSS survey (`tools/mcp/playwright-mcp.sh`) or Chrome DevTools MCP; enumerate screens from source, measure each cell, capture.

Flags (header of `layout-audit.mjs`): `--screens=a,b` / `--viewports=ios-*`
(wildcard = prefix), `--scale=100,130` (40-200), `--circuits=`, `--shots`, `--dom`,
`--jobs=N`, `--gallery`, `--screen=ID` + `--viewport=NAME`, `--force`, `--report`
(summarize the last gallery, no browser), `--out=DIR`.

`--scale` takes a PERCENT (`--scale=125`; `1.25` throws). Viewports are catalog
names only (`VIEWPORTS`, `menu-screens.mjs`; shortest is 852x344), so a free-form
size such as 568x320 is `menu-fit.mjs 568x320 --scale=125` (its own 18 screens,
not the 49) or `fit-audit.mjs --sizes=568x320 --scale=125` (12), or a new
`VIEWPORTS` row for the full catalog.

Order: 1. `--list` and diff against `index.html` dialogs (browser-free, setup.md
§Enumerate). 2. Measure/capture (browser-only). 3. Stop when every cell of
screens x viewports x scales you scoped has a row or a "clean" mark; the verdict
is the defect table sorted by failure mode (probes.md §6), not a pass count.

**Proving a CSS change regressed no other shape** (no diff form exists; `--report`
only counts skipped gallery cells). Before editing: `cp artifacts/layout-audit/audit.json
artifacts/layout-audit/audit.before.json` (a run MERGES into audit.json by screen|viewport, so
the baseline is gone once you re-run). After: re-run the same `--screens/--viewports/--scale`
scope, compare rows by hand or `jq`. Pass rule: the geometry run always exits 0 - read its
`N cells, B with something to look at, S skipped` line; pass = no cell went clean -> bad
(clipped/offscreen/docOverflowX/tinyTaps/underHardware/starved); skips are not passes. Add
`fit-audit.mjs --scale=` for type/spacing floors (no exit code either), and `test:baseline`
(6 pixel PNGs) for identity. Record baseline path, scope, bad-count before/after.

## Load on demand

- Probe recipes and viewport catalogue: [`references/probes.md`](references/probes.md)
- Environment setup (browsers, MCP): [`references/setup.md`](references/setup.md)
