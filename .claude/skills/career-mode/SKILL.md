---
name: career-mode
description: "Use when changing DRIVER CAREER or MY TEAM: saves and slots, contracts, sponsors, R&D or DNF money, or a season, sprint or qualifying inside a career save. Not for: the Season screen → season-mode; reliability failures → race-incidents-control; parts → garage-parts-livery."
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
- Career weekend flow: qualifying, race, settlement (incl. what a DNF pays), standings,
  rollover. WHY a car retired (the reliability plan) → **race-incidents-control**.
- Debugging `__apex.career*`, `qualiSim`, `ratings`, or career persistence.

Do **not** use this for:

- One-off Grand Prix, standalone Season, or Time Trial unless career state leaks
  into them (standalone Season → **season-mode**).
- Generic parts physics; use this only for the economy/cap that buys and fits
  parts in career.
- Race-control/debris incidents and the reliability retirement plan (`Reliability.plan`) → **race-incidents-control**.

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
| Calendar and weekend format | A career races its STAMPED calendar (`Career.calendar()` → `calendarOf` / `stampCalendar` in `js/career/career.js`; `Tracks.SEASON` only when unstamped); `SeasonCal` never customises it (`calCustom`, `fmtActive`). Sprint bugs: [workflow step 9](references/workflow.md) |
| Randomness | Use `Career.rnd(...parts)`; never `simRnd` or `Math.random` (pinned: `career-determinism.test.mjs`) |
| Ratings | `DriverRatings` apply in all modes; career adds deltas on top |

Hooks: `__apex.career*` (`careerState`, `careerSim`, `careerSlots`, `careerFacility`, `careerHire`,
`careerAmbition`, `careerEra`, `careerRollover`, …), `persistState`, `qualiSim`, `retirements`, `ratings` —
arguments and returns in `docs/DEBUG-HOOKS.md` §Career & qualifying (`__apex.agentHelp()` at runtime).
Gotchas: `careerState().owned` is a COUNT (part ids: `__apex.career().owned` / `Career.isOwned()`);
`careerSim(n)` settles through the real `Career.scoreRound()` → `settleRound()` (rolls the whole career back when the
save is refused) and needs a loaded track/grid first; each row returns `sponsorPay` and `sponsorVerdict`.

Sponsor "just paid" / double pay, and research or facility credits that do not add up: traces in
[references/workflow.md](references/workflow.md) (`careerSim(n)` rows carry `sponsorPay`; a driven race
stashes it in `G.careerSettlement`).

Commands:

```sh
node tools/car/career-economy.mjs            # launches Chromium: session only (AGENTS.md rule 10)
node tools/car/career-economy.mjs --years 3
node tools/ci/test-bg.mjs --spec tests/specs/career-hub.spec.js   # one spec (or career.spec.js); background, session only
node tools/ci/remote-group.mjs modes         # the whole group (career + quali + season + TT) on the pushed branch
node tools/ci/tooling-fast.mjs --changed --jobs=3 --quiet
node --test tests/unit/season-cal.test.mjs     # ~1 s, VM: the calendar/format gates (career neutral)
node --test tests/unit/career-settle.test.mjs  # VM: settleRound, mid-weekend `stage`
```

Node-VM unit tests (no browser; also in `test:tooling-fast`): `season-cal`,
`career-settle`, `career-regulations`, `career-legends`, `career-seat-rollover`,
`career-cross-tab`, `career-determinism`.

Deep reference: `docs/CAREER.md`.

## Load on demand

- Active-save gate, weekend/quali/reliability flow, settlement, common mistakes → [references/workflow.md](references/workflow.md).
- Lost upgrades / save not surviving reload → [references/persistence.md](references/persistence.md).
