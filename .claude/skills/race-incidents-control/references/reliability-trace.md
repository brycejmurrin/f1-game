# Reliability: "a team's car retires on lap 1 / every race"

All node-level. Trace in this order:

- `Reliability.arm` (`js/race/reliability.js`, called by `armReliability` in game.js) plans `dnfAt` in [`AT_LO`, `AT_HI`] of race DISTANCE: a draw lands on lap 1 only when `AT_LO` x laps < 1 (a short race).
- Per-team inputs (`retirementRisk`): `TIER_RISK[car.tier]` x `1 - DEV_RELIEF*development` (from `Career.paceMult`), player-only `BUILD_RELIEF` (off when networked), x `LEVELS[level]`.
- Draw = `Career.hash(seed,"dnf",round,driverId)`: same seed, same field.
- Other lap-1 sources to rule out first: `real-race.js` `DNS_AT` (a game seat with no real driver retires on the first metres), `apex.js` grid setup retiring every planned car at once, `checkRetirements` (game.js) firing on `prog/(lapsTarget*track.total)`.
- Observe: `__apex.retirements()` (browser) or `Reliability.plan(cars)` in a VM; `node --test tests/unit/reliability.test.mjs` (OFF clears, seed-pure, tier/LOW rate, `at` bounds, anonymous cars).
- NOT pinned by any unit test: team-dev relief, build relief, `checkRetirements`, DNS_AT. A fix there needs a new case in that file (stub `Career.paceMult`).
