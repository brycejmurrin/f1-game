# Reliability: "a team's car retires on lap 1 / every race"

All node-level. Trace in this order:

- `Reliability.arm` (`js/race/reliability.js`, called by `armReliability` in game.js) plans `dnfAt` in [0.06, 0.94] of race DISTANCE: in a 25-lap race a Reliability draw cannot land on lap 1 (a 3-lap race can: 0.06 x 3 = 0.18 lap).
- Per-team inputs: `TIER_RISK[car.tier]` x `1 - 0.40*devNorm(team)` (`Career.paceMult`/`tdev`), player-only `BUILD_RELIEF` (off when networked), x `LEVELS` (off 0 / low .5 / real 1).
- Draw = `Career.hash(seed,"dnf",round,driverId)`: same seed, same field.
- Other lap-1 sources to rule out first: `real-race.js` `DNS_AT = 0.002` (a game seat with no real driver retires on the first metres), `apex.js` grid setup retiring every planned car at once, `checkRetirements` (game.js) firing on `prog/(lapsTarget*track.total)`.
- Observe: `__apex.retirements()` (browser) or `Reliability.plan(cars)` in a VM; `node --test tests/unit/reliability.test.mjs` (OFF clears, seed-pure, tier/LOW rate, `at` bounds, anonymous cars).
- NOT pinned by any unit test: team-dev relief, build relief, `checkRetirements`, DNS_AT. A fix there needs a new case in that file (stub `Career.paceMult`).
