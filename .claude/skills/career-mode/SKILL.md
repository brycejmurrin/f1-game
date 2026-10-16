---
name: career-mode
description: "Use when DRIVER CAREER, MY TEAM, career saves or slots, contracts, sponsors, R&D economy, career qualifying, reliability/DNFs, career hooks or tests change — including season, sprint and quali behaviour INSIDE a career save (career always races Tracks.SEASON). The standalone Season screen with no career save open is season-mode."
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
| Regulation eras | `Regulations.ERAS` — the dearest `BAN_TOP` options in three categories go illegal for `ERA_SEASONS`. Applied via `Parts.setLegality()` so the AI's FACTORY builds re-resolve too; `career.owned` is never touched. Only a career installs one, so GP/Season stay unregulated |
| Season target | `deal.ambition` indexes `AMBITION` (0 modest / 1 expected / 2 ambitious). **Rung 1 is the pre-existing behaviour**, so an absent field resolves byte-identically. `career.amb` is the PENDING pick, `deal.ambition` what was signed — `rollover()` prices by the signed one |
| Weekend format in a career | NONE: `SeasonCal` gates (`calCustom`, `fmtActive`) keep sprint/quali/laps/points at defaults and the calendar `Tracks.SEASON`; a "wrong sprint in my career" is a widened gate or a stale `career.season` field — [workflow step 9](references/workflow.md) |
| Randomness | Use `Career.rnd(...parts)`; do not consume `simRnd` or `Math.random` |
| Ratings | `DriverRatings` apply in all modes; career adds deltas on top |

Hooks:

| Hook | Use |
|---|---|
| `__apex.career(opts?)` | Read, resume, or start a career — e.g. `{ flavour:"myteam", hire, seed, … }` |
| `__apex.careerState()` | Compact snapshot; prefer over raw save reads. **`owned` is a COUNT** — full part ids live on `__apex.career().owned` / `Career.isOwned()` |
| `__apex.careerMoney(n?)` | Get/set balance for tests |
| `__apex.careerGrant(n?)` | Grant live career credits |
| `__apex.careerSim(n)` | Settle rounds through real `Career.settleRound()` |
| `__apex.careerSlots(flavour?, i?)` | List/switch slots |
| `__apex.careerSlotDelete(flavour, i)` | Delete one slot |
| `__apex.careerFacility(up?)` | Inspect/buy research facility level |
| `__apex.careerHire(what?)` | Resolve MY TEAM second-seat decisions |
| `__apex.careerAmbition(i?)` | Read/set the season-target rung. `pick` is pending, `signed` is what the CURRENT deal carries |
| `__apex.careerEra()` | The regulation era: what is outlawed this cycle, and the cap under it. `null` outside a career |
| `__apex.careerRollover()` | Run `Career.rollover()` (season end) and refresh the career button |
| `__apex.persistState()` | Is storage actually persisting: `ok`, `broken`, `mirror` — first check for "lost after reload" |
| `__apex.qualiSim(playerTime?)` | Simulate qualifying for the loaded track |
| `__apex.retirements()` | Inspect staged reliability/DNF plan |
| `__apex.ratings(code?)` | Driver ratings with career deltas folded in |

**Proving a sponsor was just paid is NOT a `careerState()` read**: no `__apex` hook surfaces `sponsorPay` (it lives in
`G.careerSettlement`), and `careerState().sponsor` already describes the NEXT window. Use `careerSim(n)` or see
[workflow "Sponsor payout"](references/workflow.md).

Commands:

```sh
node tools/car/career-economy.mjs            # launches Playwright/Chromium
node tools/car/career-economy.mjs --years 3
node tools/ci/test-bg.mjs modes              # career + quali + season + TT — there is no test:career
npm run test:tooling-fast
node --test tests/unit/season-cal.test.mjs     # ~1 s, VM: the calendar/format gates (career neutral)
node --test tests/unit/career-settle.test.mjs  # ~VM: settleRound, mid-weekend `stage`
```

Node-VM unit tests (no browser; also in `test:tooling-fast`): `season-cal`,
`career-settle`, `career-regulations`, `career-legends`, `career-seat-rollover`,
`career-cross-tab`.

Deep references:

- `docs/CAREER.md`
- `docs/DEBUG-HOOKS.md` Career & qualifying section.


## Load on demand

- Active-save gate, weekend/quali/reliability flow, settlement, common mistakes → [references/workflow.md](references/workflow.md).
- Lost upgrades / save not surviving reload → [references/persistence.md](references/persistence.md).
