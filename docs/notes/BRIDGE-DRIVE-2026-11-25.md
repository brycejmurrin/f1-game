# Bridge drive: the agent drives the car into its pit box (2026-11-25)

Kind: measurement · Re-measure-by: 2027-02-25

Bryce, 2026-11-25: "I want you to be able to update the bridge to be able to do all the driving for me too". During a
Claude Link device check he cannot leave the game to talk to the orchestrator, and END TIME TRIAL (#6390 / #6396)
only shows while the car sits in its box, so the check needed a human to drive into the pits.

## What was built

- `SoakRun.drive()` / `SoakRun.policy()` (`js/perf/soak-run.js`): the AUTO SOAK law, given an optional `aim`
  (a lateral to pursue, a speed cap, a car meant to stop), and two named policies. `box` races the soak law until the
  approach, then takes PitLane's OWN lines and envelopes, the ones the AI is steered by: the pit side of the road
  (`ROAD_IN`) for the last `APPROACH_M`, `laneDrive` down the entry road under `entryV`, `laneX` (the fast lane)
  under the limiter and `approachV`, then the bay's `laneCentre` at most 10 m/s, crawling until `boxSquare` holds.
  It arms the stop with `pits.arm` (what `__apex.pit({arm:true})` does). Input seam only.
- The bridge command `drive` (`js/agent/apex-bridge.js`): `{to:"box"}`, `{laps:n}`, `{seconds:n}`, `{stop:true}`,
  `{status:true}`, `wait:false`. Recipes: `.claude/skills/phone-bridge/references/commands.md`.
- `__apex.rollout({policy:"box"|"autopilot"})`: the same policies, named so JSON can carry them.

## Measured (Node VM, `tools/lib/game-vm.cjs`, the tree this PR branches from, 2d63d699)

Time Trial, `jump(0.5, 40 m/s, x 0)`, `policy("box")` at 60 Hz with `setInput` + `step(1/60)`:
**52 of 52 circuits reached `pitState: "box"` with `canWork` true**, in 57–107 s of sim time (mean 84 s), about 1 s
of wall time each. Also Monza from frac 0.3 (a whole lap first: 119 s) and a 5-lap Bahrain / Monza race with the
field running and real wear. Scripts: `scratch/drive-sweep.cjs`, `scratch/drive-probe.cjs` (regenerable, not
committed); the pinned subset is `tests/unit/drive-to-box-vm.test.mjs`.

Not measured: the live rAF path on the phone (a real frame rate, not 60 Hz steps), and a busy box (a team-mate on the
jacks; the policy queues and either latches on the next pass of it or ends `missed`).

## Why no `to:"grid"`

Nothing in the game reads a car parked on its grid slot: `race()` places the grid, a red-flag restart re-grids the
field by itself, and a Time Trial has no grid. There is no state for the drive to reach.
