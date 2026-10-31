# Career traces

Moved out of workflow.md. Read for a sponsor double-pay or a research/facility spend that does not add up.

## Sponsor payout / double-pay trace (node trace; browser repro)

Entry points. A driven race settles through `Career.scoreRound()` (`js/game.js` endRace → `js/career/career.js`),
which stages `SeasonCal.award` on a copy, calls `settleRound()`, and, when the save is not ok, RESTORES THE WHOLE
CAREER (money and `paidSponsors` included) and returns null: `G.careerSettlement` is then null and the balance reverts.
`careerSim(n)` goes through the same `scoreRound()`; each returned row carries `sponsorPay` and `sponsorVerdict`.
`careerState().sponsor` is read after the round counter advanced, so it is the NEXT window.

What the player sees. `js/ui/results-sheet.js` shows `sponsorPay` (pay actually credited) and the `sponsorVerdict`
row (MET/MISSED). The verdict is built in `settleRound()` BEFORE `settleSponsor()`'s `paidSponsors` guard, so
MET with no Sponsor-bonus line means the window was already in `paidSponsors`.

Double pay. `settleRound()` -> `settleSponsor()`. Two guards make a second pay a bug to look for in THESE lines:
(1) `settleRound` returns null when `career.results` already has row `r === season.round - 1`;
(2) `settleSponsor` pushes the window `idx` onto `career.paidSponsors` BEFORE checking `met`, so a window pays once.
`rollover()` resets `paidSponsors`; `save-migrate.js` normalises it to `[]` on old saves.

Pins: `career-settle.test.mjs` "MY TEAM completing a sponsor window through settleRound cannot pay twice" and
"sponsor settlement records one payout even when settlement is retried"; `tests/specs/career-hub.spec.js`
"a window pays at most once across a whole season" (browser: no double pay, ledger cleared at rollover);
`docs/CAREER.md` §Sponsors — MY TEAM's second income. Those units use `dnf: false` rows only: a PAYOUT window
whose rows include a DNF is unpinned.

DNF and the money ("wrong sponsor money after a DNF"). A DNF row is always `clean:false`, so a clean window is never
met. It scores 0 pts UNLESS it is classified: `settleRound()`'s `scored()` counts a car that retired past 90 %
distance (`c.classified`, set in `js/race/race-control.js` at the finish), which keeps its points, counts as a finish and can make a `double`. So a
points/finishes/double window can still be met after a late DNF. Other modifiers that change the amount:
- `sponsorAt()`: `career.sponsorPicks[year:idx] === 1` swaps the window's kind, target and pay;
- a season's LAST window is cut at the finale and asks and pays pro rata (`window / kind.window`);
- pay lands only on the window's last round (`raced >= sp.end`).

To repro: `__apex.retire()` in a driven race (browser), or `careerSim(n)` (its draws include DNFs).
Hand-off: record which guard or modifier the repro hits (rollback, results row, `paidSponsors`, pick, pro rata)
and the `paidSponsors` value before/after.

## Research / facility / budget spend vs settle trace (node-only)

Spends and settlement never share a code path, so a "balance off after
`settleRound`" is one of these, in `js/career/career.js`:
1. Spends debit `career.money` at once and `save()`: `research(opt)` (cost
   `researchCost(opt)` = `opt.cost × RESEARCH_MULT × (1 − facilityDiscount())`),
   `upgradeFacility()` (`facilityCost()`), `upgradeBudget()`
   (`budgetUpgradeCost()`). Each goes through `charge()` — 0 under
   `freeMoney()` — and refuses when `blocked()` or the cost exceeds the balance.
   The discount is applied ONCE, inside `researchCost`; a caller that discounts
   again double-counts.
2. `settleRound()` credits `prize + matePrize + salary + bonus + (obj.done ? OBJ_BONUS + 2·stake : 0) − wages`
   (floor 0; `stake` is the planning escrow, `planning().escrow(raced)`), then `settleSponsor()`; it never reads research/facility state and
   returns null for an already-settled round (`career.results` row).
3. `careerState().money` is a snapshot after `save()`; compare it with the
   `money` field `settleRound` returns, not with a value read before the spend.
Test home: `tests/unit/career-settle.test.mjs` (template: `the budget ladder
raises the fitted cap, three rungs then stops`); blocked spends:
`career-cross-tab.test.mjs`.
