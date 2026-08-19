# Career-mode contracts and hooks

Load from the SKILL.md index. Weekend flow and common mistakes stay in
[workflow.md](workflow.md).

## Contract table

| Concept | Contract |
|---|---|
| Active career | Gameplay accessors are gated on `Career.inCareer()`, not "a save exists" |
| Flow/session axes | `flow: "gp" \| "season" \| "career"` and `session: "race" \| "tt" \| "quali"` |
| Saves | Six slots: `apex26.career.driver.0..2`, `apex26.career.myteam.0..2` |
| Live slot | `apex26.careerSlot` stores `"flavour:index"` |
| Modes | DRIVER uses an existing team/seat; MY TEAM owns `custom` and hires a second driver |
| Season shape | `career.season` matches standalone `apex26.season` so standings/HUD/results share code |
| Economy | Credits buy research; fitting owned parts is free but capped by budget level |
| Research facility | `Career.facilityDiscount()` — discount on **research cost only**; does NOT raise the fitted part budget cap |
| Fitted budget cap | `Career.budget()` / `budgetLvl` — separate from facility; `Career.upgradeBudget()` lives on `Career` in `js/game/career.js` (the UI in `career-ui.js` only calls it) |
| Sponsors | **MY TEAM only** — `sponsorAt()`/`sponsor()` return `null` whenever `career.flavour !== "myteam"`; a DRIVER career never has one, by design (a driver is paid a salary, an owner is paid by sponsors) |
| Randomness | Use `Career.rnd(...parts)`; do not consume `simRnd` or `Math.random` |
| Ratings | `DriverRatings` apply in all modes; career adds deltas on top |

## `__apex` hooks

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

## sponsorPay is not a `careerState()` read

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
