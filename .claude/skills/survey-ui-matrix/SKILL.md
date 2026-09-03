---
name: survey-ui-matrix
description: Use when systematically reviewing Apex 26's UI across orientations, viewport shapes, UI/HUD scale and pointer type — enumerating every screen from source, measuring each cell for clipping/truncation/tap-targets/overflow, and capturing screenshots. Use it to find layout defects before a restructure, to prove a CSS change did not regress another shape, or when asked to "check every menu on every device". For a single known layout bug use ui-menu-a11y; for the restructure decisions themselves use restructure-screens-css.
---

# Surveying the whole UI across the whole matrix

## Prerequisites (always)

Playwright MCP + Chromium must be installed before interactive resize/DOM work:

```bash
bash tools/env/cloud-agent-install.sh      # AGENTS.md §Verification 1
bash tools/playwright-mcp.sh status 2>/dev/null || true
```

Missing browsers / wrapper: AGENTS.md §Verification 1 (`npm install`, then
`npx playwright install chromium-headless-shell`).

A layout bug is never "on a screen" — it is a **cell of a matrix**: screen ×
viewport × scale × pointer. **One CLI:** `tools/ui/layout-audit.mjs`.

```sh
node tools/ui/layout-audit.mjs --help
node tools/ui/layout-audit.mjs --list
node tools/ui/layout-audit.mjs --survey          # title-path + shots (npm run ui:survey)
node tools/ui/layout-audit.mjs --gallery         # fast PNG+DOM all menus (npm run ui:gallery)
node tools/ui/layout-audit.mjs --screen=settings # one cell
node tools/ui/layout-audit.mjs                   # full geometry matrix (npm run ui:audit)
```

This skill is the **interactive** complement: Playwright MCP for resize / DOM /
CSS survey (`tools/playwright-mcp.sh`) or Chrome DevTools MCP; enumerate screens from source, measure each cell, capture.

## Load on demand

- Probe recipes and viewport catalogue: [`references/probes.md`](references/probes.md)
- Environment setup (browsers, MCP): [`references/setup.md`](references/setup.md)
