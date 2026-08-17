---
name: survey-ui-matrix
description: Use when systematically reviewing Apex 26's UI across orientations, viewport shapes, UI/HUD scale and pointer type — enumerating every screen from source, measuring each cell for clipping/truncation/tap-targets/overflow, and capturing screenshots. Use it to find layout defects before a restructure, to prove a CSS change did not regress another shape, or when asked to "check every menu on every device". For a single known layout bug use ui-menu-a11y; for the restructure decisions themselves use restructure-screens-css.
---

# Surveying the whole UI across the whole matrix

A layout bug is never "on a screen" — it is a **cell of a matrix**: screen ×
viewport × scale × pointer. Batch instrument: `tools/layout-audit.mjs`.
Title-path recipe (six screens at iPhone landscape, with shots):
`node tools/ui-survey.mjs` / `npm run ui:survey` — a layout-audit alias;
`tools/ui-mcp-survey.mjs` is a forwarder to that file. This skill is the
**interactive** one (Chrome DevTools MCP, canvas hidden).

Single known bug → **ui-menu-a11y**. Restructure decisions →
**restructure-screens-css**.

**Measure with the MCP; capture with either — but read the traps first.**

## Axes

| axis | values worth running | why |
|---|---|---|
| viewport | `852x393`, `393x852`, `834x1194`, `1194x834`, `1440x900`, `1920x1080`, `1080x1920` | a portrait WINDOW can hold a landscape SHEET |
| orientation | both, per device | not a proxy for sheet shape — see `data-shape` |
| UI scale | 80, 100, **115**, 130, 150 | `__apex.uiScale(n)`; default is 100 on every pointer |
| HUD scale | same range, independently | `__apex.hudScale(n)` — they must not move together |
| pointer | `mobile,touch` vs desktop | `body.desktop` flips the density ladder |

`emulate` string: `"<w>x<h>x<dpr>[,mobile][,touch][,landscape]"`.
**Always test 115**, not just 100 — several confirmed defects were invisible
at 100%. Default is 1.0 on every pointer now (`css/tokens.css`).

## Load on demand

- Setup ritual, instrument check, screen enumeration →
  [references/setup.md](references/setup.md).
- Probe JS (clip/trunc/tap/overflow) + routes + CSS-cache diagnosis +
  measured mistakes → [references/probes.md](references/probes.md).
- Chrome park-before-Playwright → [.claude/skills/mcp-probe/references/traps.md](../mcp-probe/references/traps.md) §1.
