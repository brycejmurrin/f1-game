---
name: career-mode
description: "Use when DRIVER CAREER, MY TEAM, career saves or slots, contracts, sponsors, R&D economy, career qualifying, reliability/DNFs, career hooks/tests change — including season, sprint and quali behaviour INSIDE a career save (career always races Tracks.SEASON). The standalone Season screen with no career save open is season-mode."
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

## Quick Reference

| Concept | Contract |
|---|---|
| Active career | Gameplay accessors are gated on `Career.inCareer()`, not "a save exists" |
| Flow/session axes | `flow: "gp" | "season" | "career"` and `session: "race" | "tt" | "quali"` |
| Saves | Six slots: `apex26.career.driver.0..2`, `apex26.career.myteam.0..2`. Slot mutations (`careerSlotDelete`) keep `ok`/`durable`/`reason`; a session-only deletion is not permanent (pin: `apex-career-delete.test.mjs`) |
| Live slot | `apex26.careerSlot` stores `"flavour:index"` |
| Lost state | `store.write()` `durable:false` on quota, IndexedDB mirror, `save-migrate.js`, `acceptOffer` re-seed — [references/persistence.md](references/persistence.md) |
| Modes | DRIVER uses an existing team/seat; MY TEAM owns `custom` and hires a second driver |
| Season shape | `career.season` matches standalone `apex26.season` so standings/HUD/results share code |
| Economy | Credits buy research; fitting owned parts is free but capped by budget level |
| Research facility | `Career.facilityDiscount()` — discount on **research cost only**; does NOT raise the fitted part budget cap |
| Fitted budget cap | `Career.budget()` / `budgetLvl` — separate from facility; `Career.upgradeBudget()` lives on `Career` in `js/career/career.js` (the UI in `career-ui.js` only calls it) |
| Sponsors | **MY TEAM only** — `sponsorAt()`/`sponsor()` return `null` whenever `career.flavour !== "myteam"`; a DRIVER career never has one, by design (a driver is paid a salary, an owner is paid by sponsors) |
| Regulation eras | `Regulations.ERAS` legality filter, career-only; `career.owned` never touched — `docs/CAREER.md` §Regulation eras |
| Season target | `deal.ambition` (signed) vs `career.amb` (pending); absent = rung 1 — `docs/CAREER.md` (`AMBITION`) |
| Weekend format in a career | NONE: `SeasonCal` gates (`calCustom`, `fmtActive`) keep the defaults and `Tracks.SEASON`; a career sprint bug is a widened gate or stale `career.season` field — [workflow step 9](references/workflow.md), `docs/CAREER.md` §In career |
| Randomness | Use `Career.rnd(...parts)`; never `simRnd` or `Math.random` (pinned: `career-determinism.test.mjs`) |
| Ratings | `DriverRatings` apply in all modes; career adds deltas on top |

Hooks: `__apex.career*` (`careerState`, `careerSim`, `careerSlots`, `careerFacility`, `careerHire`,
`careerAmbition`, `careerEra`, `careerRollover`, …), `persistState`, `qualiSim`, `retirements`, `ratings` —
arguments and returns in `docs/DEBUG-HOOKS.md` §Career & qualifying (`__apex.agentHelp()` at runtime).
Gotchas: `careerState().owned` is a COUNT (part ids: `__apex.career().owned` / `Career.isOwned()`);
`careerSim(n)` settles through the real `Career.settleRound()` and needs a loaded track/grid first.

Sponsor "just paid" / double pay, and research or facility credits that do not add up: traces in
[references/workflow.md](references/workflow.md) (no hook exposes `sponsorPay`).

Commands:

```sh
node tools/car/career-economy.mjs            # launches Playwright/Chromium — parent session only, never a subagent
node tools/car/career-economy.mjs --years 3
node tools/ci/test-bg.mjs modes              # career + quali + season + TT — there is no test:career
npm run test:tooling-fast
node --test tests/unit/season-cal.test.mjs     # ~1 s, VM: the calendar/format gates (career neutral)
node --test tests/unit/career-settle.test.mjs  # ~VM: settleRound, mid-weekend `stage`
```

Node-VM unit tests (no browser; also in `test:tooling-fast`): `season-cal`,
`career-settle`, `career-regulations`, `career-legends`, `career-seat-rollover`,
`career-cross-tab`, `career-determinism`.

Deep reference: `docs/CAREER.md`.

## Load on demand

- Active-save gate, weekend/quali/reliability flow, settlement, common mistakes → [references/workflow.md](references/workflow.md).
- Lost upgrades / save not surviving reload → [references/persistence.md](references/persistence.md).
