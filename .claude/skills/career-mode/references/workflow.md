# Career-mode workflow — active-save gate, weekend flow, settlement, common mistakes

Load from the SKILL.md index when the task needs this detail.

## Contents
- Workflow / Implementation
- Common Mistakes
- Sponsor payout / double-pay trace (node trace; browser repro)
- Research / facility / budget spend vs settle trace (node-only)

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
     `retirements()` (the plan itself → skill race-incidents-control; this
     skill owns what the DNF does to points and money).
   - Career points reuse the same season shape so results, standings, and HUD
     remain shared.

5. **Keep economy changes tied to the catalog.**
   - Credits are in the same unit as `Parts.CATALOG` costs.
   - Research unlocks ownership permanently; fitting is constrained by budget
     cap and owned parts.
   - Use `tools/car/career-economy.mjs` to measure what one or more seasons can buy
     instead of reasoning from raw credit totals.

6. **Preserve determinism.**
   - Career draws use stateless `Career.rnd(...parts)`.
   - Do not use `Date.now`, `Math.random`, or the physics `simRnd` stream for
     career markets, objectives, development, or reliability plans.
   - If you must add a draw, include stable varying parts in the key.
   - `tests/unit/career-determinism.test.mjs` fails on any `simRnd` or a new
     `Math.random()` in `js/career/*.js` (two allowlisted non-draw sites).

7. **Verify through hooks before UI assertions.** Browser steps are session
   only (a subagent reports them unverified); reproduce hub/HUD UI at Bryce's
   phone profile first (844×390 landscape, touch).
   - Start with `careerState()`, `careerSlots()`, `careerSim()`, and
     `qualiSim()` to prove the rule.
   - **`careerSim()` needs the career hub plus a loaded track/grid first** — stage
     qualifying/race context before calling it.
   - Garage locked rows: `#cs-options .cs-opt.locked`, or assert owned parts vs
     `Parts.CATALOG` via `__apex.career().owned` / `Career.isOwned()`.
   - Then assert UI flow through `tests/specs/career.spec.js` / `tests/specs/quali.spec.js`.
   - One spec in the background: `node tools/ci/test-bg.mjs --spec tests/specs/career.spec.js`;
     the whole `modes` group (career + quali + season + TT) on the pushed branch:
     `node tools/ci/remote-group.mjs modes`.

8. **Check the generated shell.**
   - Career often touches `js/career/career*.js`, `js/race/quali-model.js`,
     `js/race/reliability.js`, or `css/career.css`; run `node tools/gen/gen-shell.mjs --check` ([shell/cache](../../check-changes/references/bump.md): `?v=dev`, no bump).

9. **Sprint / quali format inside a career.** The weekend FORMAT is season-only:
   `js/career/season-cal.js` gates it on `fmtActive()` (`flow === "season"`), the
   calendar on `calCustom()` (`flow !== "career"`). Trace: `js/game.js` `setFlow()`
   calls `SeasonCal.engage(flow)`; `SeasonCal.sprintOn/stage/quali/formatLaps/pointsTable`
   all return the neutral value in a career. Pins: `tests/unit/season-cal.test.mjs`
   (`the calendar is the player's in season AND in gp, but never in career`,
   `format accessors are neutral outside a season, whatever the config holds`,
   `a retired fastest-lap setter earns nothing, and a career never pays the point`).
   A sprint appearing in a career means a gate was widened; do not "fix" it by
   giving career a format (that is a feature, and the file header explains why not).

## Common Mistakes

- Confusing **research facility** with **fitted budget cap**: facility =
  `facilityDiscount()` on research cost; cap = `Career.budget()` /
  `budgetLvl` (separate ladder; `Career.upgradeBudget()` in `js/career/career.js`). When the user says
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
- Verifying `sponsorPay` or `careerState().sponsor` as "just paid": see Sponsor payout below.

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
