---
name: career-mode
description: "Use when DRIVER CAREER, MY TEAM, career saves or slots, contracts, sponsors, R&D economy, career qualifying, reliability/DNFs, career hooks, or career tests are being changed or debugged."
---

## Overview

Career mode is a long-form championship flow, not a separate race engine: loaded
saves are inert until `Career.inCareer()`/`flow === "career"` makes the rules
active.

## When to Use

Use this for:

- DRIVER CAREER or MY TEAM setup, hub, saves, slot switching, or delete flows.
- Credits, R&D ownership, fitted budget cap, research facility, sponsors, offers,
  contracts, driver/team development, or MY TEAM hires.
- Career weekend flow: qualifying, race, reliability/DNFs, settlement, standings,
  rollover.
- Debugging `__apex.career*`, `qualiSim`, `ratings`, or career persistence.

Do **not** use this for:

- One-off Grand Prix, standalone Season, or Time Trial unless career state leaks
  into them (standalone Season → **season-mode**).
- Generic parts physics; use this only for the economy/cap that buys and fits
  parts in career.
- Race-control/debris incidents except the reliability retirement plan surface.

```sh
node tools/career-economy.mjs            # launches Playwright/Chromium
node tools/career-economy.mjs --years 3
node tools/test-bg.mjs modes              # career + quali + season + TT — there is no test:career
npm run test:tooling-fast
```

`Career.upgradeBudget()` lives on `Career` in `js/game/career.js` (the UI only
calls it). Deep references: `docs/CAREER.md`, `docs/DEBUG-HOOKS.md`.

## Load on demand

- Contract table, `__apex` hooks, sponsorPay settlement trap → [references/contracts.md](references/contracts.md).
- Active-save gate, weekend/quali/reliability flow, settlement, common mistakes → [references/workflow.md](references/workflow.md).
