# F1 25 research — the merged roadmap

Four research passes ran against EA Sports F1 25 (and its 2026 Season Pack, the
closest commercial reference for a 2026-regs game). This file is the index and
the merged priority list; the reasoning lives in the four documents.

| Document | Scope |
|---|---|
| `F1-25-GAME-STUDY.md` | The whole game: mode roster, reception, what to take and refuse |
| `F1-25-DRIVER-CAREER.md` | DRIVER CAREER vs F1 24's Driver Recognition stack |
| `F1-25-MY-TEAM.md` | MY TEAM vs My Team 2.0 |
| `F1-25-WEEKEND-STRUCTURE.md` | The weekend/season shell both modes sit on |

---

## What the research changed about the plan

Three findings reframed the work, and none of them was the expected one.

**1. We already ship the 2026 car.** EA sold the 2026 Season Pack on Overtake
Mode and active aerodynamics. `js/game.js:3489` is `c.otT` with the free-of-battery
push the real reg has; `js/game.js:536` `aeroDfMult()` and `c.aeroX` are active
aero, drawn on the car at `:1863`. **The gap is the weekend and the management
layer, not the car.**

**2. F1 25's Driver Career is F1 24's.** EA's own deep dive gives it two lines.
So there is no 2025 Driver Career to copy — the reference is F1 24's Driver
Recognition stack, and its single most-complained-about rule (development gated
behind recognition) is one we should refuse outright.

**3. The cheapest big feature is already written.** `js/game/quali.js:91`
`lapTime()` is a pure quasi-steady lap simulation, exported, calibrated against
driven laps, and already run 22 times a weekend. Practice programmes are a call
to a function we already trust.

---

## Defects found while grounding (fix regardless of what else ships)

| Where | What | Found by |
|---|---|---|
| `js/game.js:1468` | `resolvedParts = isP ? savedParts : factoryParts` — in MY TEAM your hire runs the custom team's all-cost-0 defaults; `mods`/`aeroLoad`/ERS at `:1486-1491` are player-only. Your R&D reaches one of your two cars, while `js/game/career-ui.js:440` tells the player "Both cars run your build." | MY TEAM |
| `js/game/career.js:1165` + `career-ui.js:686`, `:1045` | `deal.goal` is written and rendered twice and evaluated nowhere. The contract's season goal is decoration. | DRIVER CAREER |
| `js/game/career.js:1214` vs `:1219` | `deal.left--` runs, then `makeOffers()` runs unconditionally — a 3-season contract re-signs every winter, so the CONTRACT card lies. | DRIVER CAREER |
| `js/game/career.js:571` | The budget ladder says in its own comment that it has no UI caller, so `budgetLvl` is permanently 0 and the fitted cap never moves for the life of a career. | both career passes |
| `js/game.js:3741` | +5 s for **every** track-limits cut from the 4th onward, and the count stops being announced past 3. The real ladder is three warnings → one penalty → reset — and it feeds the career `clean` objective at `js/game/career.js:785`. | WEEKEND |
| `js/game.js:7259` | `57 (FULL)` on all 40 circuits. Monaco is 78 laps, Spa 44. | WEEKEND |

---

## Merged priority list

Ranked across all three areas. Effort is the originating document's estimate.

### Tier 1 — small, self-contained, and two passes asked for them independently

| # | Item | Effort | Where |
|---|---|---|---|
| 1 | **Wire the budget ladder.** Rules are complete and unreachable; needs one card cloned from the FACILITY card at `career-ui.js:787-802`, and `docs/CAREER.md:241-243` insists the guide text lands in the same change. Re-measure with `tools/career-economy.mjs`. | S | both |
| 2 | **Give the second car the build.** Either make the claim at `career-ui.js:440` true (a `buildPace` channel baked into `tierV` at `game.js:1497`, never at `:3417`) or change the sentence. Today the guide is wrong. | M | MY TEAM |
| 3 | **Make the contract bind.** Resolve `deal.goal` at rollover; gate the offer sheet on `deal.left`. | M | DRIVER |
| 4 | **Track-limits ladder + per-circuit `gpLaps`.** Two isolated corrections; the first also corrects a career objective. | S | WEEKEND |

### Tier 2 — the features that change how a season plays

| # | Item | Effort | Where |
|---|---|---|---|
| 5 | **Qualifying formats** — SIMULATE / ONE-SHOT / SHORT / FULL. `Quali.compute()` is pure, so a knockout is calling it three times with a shrinking field. No axis change, no migration. | S | WEEKEND |
| 6 | **Practice programmes** — new `js/game/practice.js` taking `G`, paying in credits (never a second currency, or `career-economy.mjs` stops measuring anything). Needs an `isSolo()` predicate that makes `game.js` *smaller* — it sits at 8185 against a ratchet of 8186 (`tests/unit/module-size.test.mjs:224`). | M | WEEKEND |
| 7 | **Two rostered drivers, choose who you race.** The actual thesis of My Team 2.0. Plumbing is ready: `game.js:7135` already sets the player car from `career.seat`, points key by seat, `gridDrivers()` already fields two. Ships as a *choice* — deleting the created driver is F1 25's most-criticised change. | M | MY TEAM |
| 8 | **Accolades, derived.** Milestone predicates over `career.history`/`career.results`, evaluated at render. `careerTotals()` (`career-ui.js:1073`) already walks that data and its comment forbids storing totals. Zero save change. | S | DRIVER |

### Tier 3 — the economy's missing subtraction, and the missing spine

| # | Item | Effort | Where |
|---|---|---|---|
| 9 | **A regulation reset.** Every 3 seasons retire the non-zero-cost owned options in a few seeded categories. F1 25's loudest My Team complaint is everything maxed by mid-season 2, and `career.owned` only grows (`career.js:566`) with the only re-seed path unreachable in MY TEAM (`makeOffers()` returns `[]` at `:1116`). Provable with `career-economy.mjs --years 6`. | M | MY TEAM |
| 10 | **Inverted constructors' payout.** Leaders earn fewer resources, backmarkers more — the real 2026 handicap, and an anti-runaway term. | S | both |
| 11 | **Tyres, phase 1** — compounds and wear as a grip multiplier derived from the car's own `Fyf`/`Fyr`, **never** `Tracks.curvature()` (the arc must not reach the driver). | L | WEEKEND |
| 12 | **Tyres, phase 2** — a stop as a timed service reusing `retireCar()`'s parking machinery. **Do not build a pit lane**: no `js/track/` file has any pit concept and the 20 s loss is 95 % of the gameplay. | L | WEEKEND |
| 13 | **Fan Rating** as a team-public channel with no input or output overlapping `rep`. | M | MY TEAM |
| 14 | **Scenario events** — seeded, standardised short situations. `gridUp(preOrder)` already accepts a forced grid and `Career.hash()` gives a backend-free weekly rotation on static Pages. | S–M | WEEKEND |

---

## Refused, with reasons

Consolidated from all four passes. These are decisions, not backlog.

| Refused | Why |
|---|---|
| Battle pass, currency store, cosmetic loot, timed live-service seasons | Both F1 25 reviews we read named this as the game's weak half; we have no backend, no clock, and no reason for a player to trust one |
| Voiced, cutscene-driven story mode | Its value is animation and voice acting — the two things we cannot afford. Take the scenario format, leave the cinema |
| Reversed circuit layouts | "Left me largely indifferent" (IGN), "hardly a headline feature" (Traxion) — and our `+k = LEFT` convention and `_sceneryShift` frac keys make it far riskier for us than for EA |
| Development gated behind reputation | F1 25's one career rule players are still filing complaints about two games later |
| Owner-only MY TEAM (deleting the created driver) | The most-criticised part of My Team 2.0. If we field two drivers it is as a choice |
| A pit lane | No `js/track/` file has any pit concept; the time loss is the gameplay |
| Sprint weekends, formation laps, red flags, flashbacks | A race here is 3–25 laps; `standingLoss()` already charges the modelled field the launch cost the driven car pays |
| Driver Icons, a second fictional constructor | Rights |
| A season spend cap; per-part failure rolls | Our fitted cap already makes every weekend a choice; our economy is too small to absorb a lost race |
| Full manager mode | Even F1 25 stopped short — you cannot watch a race as principal. We stop in the same place, for stronger reasons |

---

## Rules any of this work inherits

- `js/game.js` is at 8185 lines against a ratchet of 8186 — new code lands in a
  `js/game/*` module taking the `G` façade.
- Career draws use the stateless `Career.rnd`; never `simRnd`, whose stream
  position after `makeCars()` is a hard determinism contract.
- Save-shape changes need a `CAREER_V` rung; `dev`/`tdev`/`seats` stay deltas.
- Anything touching money is re-measured with `tools/career-economy.mjs` —
  `RESEARCH_MULT` is the single knob, and the figure that matters is how many
  complete cars-worth of research a season buys.
- `npm run test:modes` after career changes, `npm run test:parts` after garage
  changes, and the cache bump is the last edit before commit.
