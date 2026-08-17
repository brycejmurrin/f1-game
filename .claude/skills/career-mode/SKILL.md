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
  into them.
- Generic parts physics; use this only for the economy/cap that buys and fits
  parts in career.
- Race-control/debris incidents except the reliability retirement plan surface.

## Quick Reference

| Concept | Contract |
|---|---|
| Active career | Gameplay accessors are gated on `Career.inCareer()`, not "a save exists" |
| Flow/session axes | `flow: "gp" | "season" | "career"` and `session: "race" | "tt" | "quali"` |
| Saves | Six slots: `apex26.career.driver.0..2`, `apex26.career.myteam.0..2` |
| Live slot | `apex26.careerSlot` stores `"flavour:index"` |
| Modes | DRIVER uses an existing team/seat; MY TEAM owns `custom` and hires a second driver |
| Season shape | `career.season` matches standalone `apex26.season` so standings/HUD/results share code |
| Economy | Credits buy research; fitting owned parts is free but capped by budget level |
| Research facility | `Career.facilityDiscount()` — discount on **research cost only**; does NOT raise the fitted part budget cap |
| Fitted budget cap | `Career.budget()` / `budgetLvl` — separate from facility; may be unwired in UI (always `budgetLvl` 0 today) |
| Sponsors | **MY TEAM only** — `sponsorAt()`/`sponsor()` return `null` whenever `career.flavour !== "myteam"`; a DRIVER career never has one, by design (a driver is paid a salary, an owner is paid by sponsors) |
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
| `__apex.qualiSim(playerTime?)` | Simulate qualifying for the loaded track |
| `__apex.retirements()` | Inspect staged reliability/DNF plan |
| `__apex.ratings(code?)` | Driver ratings with career deltas folded in |

**Proving a sponsor was just paid is NOT a `careerState()` read.**
`Career.settleRound()`'s return value (including `sponsorPay`, the amount paid
this round) is stashed in `js/game.js`'s `careerSettlement` and reached only via
the `G` façade (`G.careerSettlement`, consumed by `js/game/results.js` for the
results screen) — **there is no `__apex` hook that surfaces `sponsorPay`
directly.** And `careerState().sponsor` reads `sponsor()`, which resolves off
`career.season.round` — the round counter **already incremented** by the time
settlement finishes — so right after a raced round it describes the *next*
sponsor window, not the one that (maybe) just paid. To confirm a sponsor paid
out for the round just raced: read the results screen / `G.careerSettlement`
path in a driven race, or use `__apex.careerSim(n)` for simulated rounds, which
runs the real `settleRound()` and you can inspect the return per round.

Commands:

```sh
node tools/career-economy.mjs            # launches Playwright/Chromium
node tools/career-economy.mjs --years 3
node tools/test-bg.mjs career
npm run test:tooling-fast
```

Deep references:

- `docs/CAREER.md`
- `docs/DEBUG-HOOKS.md` Career & qualifying section.

## Workflow / Implementation

1. **Decide whether the save is active.**
   - Boot may load a save so the title screen can offer career modes.
   - Gameplay changes must use `Career.inCareer()` or the `G` facade's career
     flow, not merely the presence of saved data.
   - If a Grand Prix inherits career team development or garage parts, this is
     the first invariant to audit.

2. **Keep the two axes distinct.**
   - `flow` says why the run exists (`gp`, `season`, `career`).
   - `session` says what is happening now (`race`, `tt`, `quali`).
   - A career qualifying lap is `flow === "career"` and
     `session === "quali"`; do not flatten that into one enum.

3. **Respect slot ownership.**
   - A career's own `flavour` decides whether it lives in `driver` or `myteam`
     slots.
   - Switching slots saves the career being left first.
   - Slot index alone is not an address; always carry flavour plus index.
   - Do not resurrect legacy keys except through the migration ladder.

4. **Model career weekends through existing race surfaces.**
   - Qualifying is a session layered on the time-trial path.
   - Reliability/DNFs are planned at race staging and inspected with
     `retirements()`.
   - Career points reuse the same season shape so results, standings, and HUD
     remain shared.

5. **Keep economy changes tied to the catalog.**
   - Credits are in the same unit as `Parts.CATALOG` costs.
   - Research unlocks ownership permanently; fitting is constrained by budget
     cap and owned parts.
   - Use `tools/career-economy.mjs` to measure what one or more seasons can buy
     instead of reasoning from raw credit totals.

6. **Preserve determinism.**
   - Career draws use stateless `Career.rnd(...parts)`.
   - Do not use `Date.now`, `Math.random`, or the physics `simRnd` stream for
     career markets, objectives, development, or reliability plans.
   - If you must add a draw, include stable varying parts in the key.

7. **Verify through hooks before UI assertions.**
   - Start with `careerState()`, `careerSlots()`, `careerSim()`, and
     `qualiSim()` to prove the rule.
   - **`careerSim()` needs the career hub plus a loaded track/grid first** — stage
     qualifying/race context before calling it.
   - Garage locked rows: `#cs-options .cs-opt.locked`, or assert owned parts vs
     `Parts.CATALOG` via `__apex.career().owned` / `Career.isOwned()`.
   - Then assert UI flow through `tests/specs/career.spec.js` / `tests/specs/quali.spec.js`.
   - Run `test:modes` in the background via `tools/test-bg.mjs` (covers career + quali).

8. **Cache-bust JS/CSS edits.**
   - Career often touches `js/game/career*.js`, `js/game/quali.js`,
     `js/game/reliability.js`, or `css/career.css`; use `bump-cache`.

## Common Mistakes

- Confusing **research facility** with **fitted budget cap**: facility =
  `facilityDiscount()` on research cost; cap = `Career.budget()` /
  `budgetLvl` (separate ladder, may be unwired in UI). When the user says
  "budget cap wrong after facility upgrade", check this split first — upgrading
  the facility does not raise the cap.
- Treating "save exists" as "career rules are active", leaking development or
  owned parts into Grand Prix.
- Persisting career standings with standalone season storage instead of
  `Career.save()`.
- Addressing slots by number only and overwriting the other flavour's career.
- Putting MY TEAM state (roster/wages) into DRIVER careers or assuming DRIVER
  teams own the custom team.
- Consuming `simRnd` inside career code and shifting seeded race results.
- Adding absolute driver/team values to saves instead of deltas over shipped
  teams/ratings.
- Simulating economy with approximations when `careerSim()` exercises the real
  settlement path.
- Running browser career tests before staging a loaded track/grid for hooks that
  depend on qualifying or `careerSim()`.
- Reading `careerState().owned` as part ids — it is a count; use
  `__apex.career().owned` / `Career.isOwned()` for the list.
- Trying to verify a driven race's `sponsorPay` off `__apex` directly — it is
  not exposed there; use the results screen / `G.careerSettlement`, or
  `careerSim()` for simulated rounds.
- Reading `careerState().sponsor` right after a settlement as "what the sponsor
  just paid" — the round counter has already advanced, so it describes the
  NEXT window, not the one just settled.
