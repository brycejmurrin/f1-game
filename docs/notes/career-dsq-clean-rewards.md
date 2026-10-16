# Disqualified career results are not clean races

A dry Grand Prix player disqualified for using only one compound previously
received zero championship points but still completed a clean-race objective
and advanced a clean sponsor window. Both clean checks omitted the DSQ flag.

The fix excludes disqualified cars from the clean objective and stored clean
fact, without changing points, normal prize money, salary, craft scoring,
classification, or unrelated objectives. Existing historical result rows are
not rewritten: they do not retain enough information to reconstruct a DSQ.

Regression coverage in `tests/unit/career-settle.test.mjs` runs the real
SportingRegs compound rule, RaceControl classification, and Career/SeasonCal
score chain. It covers MY TEAM and driver careers, legal clean-race rewards,
sponsor progress, and the existing retirement/cut/penalty exclusions.

Verify:

```sh
node --test tests/unit/career-settle.test.mjs tests/unit/season-cal.test.mjs tests/unit/sporting-regs.test.mjs
node --check js/career/career.js
git diff --check
```
