---
name: survey-ui-matrix
context: fork
agent: general-purpose
description: Use when reviewing the whole UI systematically across orientations, viewport shapes, UI/HUD scale and pointer type: enumerate every screen from source, measure each cell for clipping, truncation, tap targets and overflow, capture screenshots — to find layout defects before a restructure, prove a CSS change regressed no other shape, or check every menu on every device.
---

# Surveying the whole UI across the whole matrix

Runs FORKED (`context: fork`, `agent: general-purpose`): a matrix walk is
dozens of `browser_*` snapshots, so the cells and their measurements stay in the
fork and the parent gets the defect table (screen × shape × scale × pointer,
one row per finding, screenshot paths under `artifacts/`). The fork edits
nothing: fixes are the parent's, one cell at a time, via `css-play` or
`ui-menu-a11y`.

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
node tools/ui/layout-audit.mjs --list            # 48 screens x 11 viewports (2026-09-30); the enumeration step
# BROWSER-ONLY (launch Chromium: check /proc/loadavg < 3, no Playwright run live):
node tools/ui/layout-audit.mjs --survey          # title-path + shots (npm run ui:survey)
node tools/ui/layout-audit.mjs --gallery         # fast PNG+DOM all menus (npm run ui:gallery)
node tools/ui/layout-audit.mjs --screen=settings # one cell
node tools/ui/layout-audit.mjs                   # full geometry matrix (npm run ui:audit)
# Numbers companion (type/spacing floors): node tools/ui/fit-audit.mjs
# Notch insets only: node tools/ui/menu-fit.mjs 852x393 --safe=59,0,59,21
# Both of those LAUNCH CHROMIUM on any argv — they have no --help, so a
# probe for usage starts a browser. `layout-audit.mjs --list` is the
# browser-free way to see what a sweep would cover.
```

This skill is the **interactive** complement: Playwright MCP for resize / DOM /
CSS survey (`tools/mcp/playwright-mcp.sh`) or Chrome DevTools MCP; enumerate screens from source, measure each cell, capture.

Flags (header of `layout-audit.mjs`): `--screens=a,b` / `--viewports=ios-*`
(wildcard = prefix), `--scale=100,130` (40-200), `--circuits=`, `--shots`, `--dom`,
`--jobs=N`, `--gallery`, `--screen=ID` + `--viewport=NAME`, `--force`, `--report`
(summarize the last gallery, no browser), `--out=DIR`.

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
