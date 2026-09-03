# Career-mode workflow — active-save gate, weekend flow, settlement, common mistakes

Load from the SKILL.md index when the task needs this detail.

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
     `js/game/reliability.js`, or `css/career.css`; run `node tools/gen-shell.mjs --check` (no cache bump: tags read `?v=dev` and the deploy stamps the hashes; after a `tools/manifest.cjs` change run `node tools/gen-shell.mjs`).

## Common Mistakes

- Confusing **research facility** with **fitted budget cap**: facility =
  `facilityDiscount()` on research cost; cap = `Career.budget()` /
  `budgetLvl` (separate ladder; `Career.upgradeBudget()` in `js/game/career.js`). When the user says
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
