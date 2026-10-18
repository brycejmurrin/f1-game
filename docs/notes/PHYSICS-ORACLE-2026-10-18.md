# Physics oracle — the apex-26 port gate (2026-10-18)

apex-26 (github.com/brycejmurrin/apex-26) is porting this game to TypeScript.
Its plan (apex-26 PR #1, `PLAN.md` tasks T1.3 and T1.4) admits the port's
physics and track engine only when they reproduce THIS repo's numbers bit for
bit. These two tools produce those numbers. They are read-only on the game:
they boot the real `js/game.js` in the Node VM (`tools/lib/game-vm.cjs`), drive
it through `__apex`, and write JSON under `artifacts/oracle/`.

| tool | writes | what it holds |
|---|---|---|
| `tools/check/physics-oracle.mjs` | `artifacts/oracle/<track>-<trace>.json` | per FIXED_DT step: the player's raw state, the input applied, and that step's track queries at the car |
| `tools/check/track-oracle.mjs` | `artifacts/oracle/track-<track>.json` | `Tracks.sample`/`banking`/`onKerb`/`wallAt`/`inPitLane` on an s × lateral grid |

## Why a golden trace and not the characterization baseline
`tests/data/physics-baseline.json` rounds to 1e-4 and samples every 15th step:
fine for catching a regression here, useless for proving a port, where a
last-bit difference at step 3 is exactly the bug to find. The oracle keeps
every step and every double (JSON's shortest round-trip form is exact; `-0`,
`NaN` and `±Infinity` are written as strings because JSON cannot hold them).
It also records the track queries per step, so a port divergence can be
split at once into "the track engine disagrees" or "the car model disagrees".

## The pinned world
Everything that is not the driving model is pinned or removed, and the tool
refuses to run if a pin does not hold:

- factory seat (`seat: "pin"`: McLaren, empty parts sheet);
- tyre wear, wind, reliability and cautions off;
- every assist off: `drivingHelp` 1, `gripSteer` 1, `raceLine` 0,
  `autoThrottle`/`throttleLatch` false, and `ROAD_FOLLOW` asserted 0;
- dry, wetness asserted 0;
- every AI car retired after each `reset()` (reset re-grids and un-retires);
- the boot circuit's `TrackScenery[id]` resident before stepping — a bare
  build has no collidable props and `wallAt` falls back, and the VM recorded
  a divergence at step 75 of "steady corner load" without it.

Because the field is retired, these traces are NOT the characterization
baseline's numbers (that spec races a full field). They are their own golden.

## Inputs
1. The four physics-characterization recipes, parsed from the `SCENARIOS`
   literal of `tests/specs/physics-characterization.spec.js` (one copy). Stages
   play in order and the last stage's input is held until `--steps` (default
   600); a smaller `--steps` truncates.
2. `--ghost <file>`: an InputGhost v3 envelope (unpacked, `packedV3` as stored
   on disk, or a store object holding one). The car starts from
   `initialState` (s, x, speed via `reset()`, then seed and RNG stream via
   `G.simSeed`), and each step applies `rawSteer`/`rawThrottle`/`rawBrake`
   plus the flag bits through `__apex.setInput`. The tool refuses a ghost
   whose `physRev` is not this tree's `REVISION`. This replays the recorded
   COMMANDS through the test-input seam; it is a golden of that replay, not a
   claim to reproduce the original lap's pose.

## Header
Every file starts with `header`: `schema`, `REVISION`, `seed`, `gitSha`,
`track`, `FIXED_DT`, `seat`, the pinned `storage`, and `files` — the sha256 of
every js file the VM evaluated, in load order. A port compares against a
golden only when the header's `REVISION` and file hashes are the ones it
ported from; regenerate on the same sha otherwise.

## Determinism
`tests/unit/physics-oracle.test.mjs` (group `game-vm`) runs both CLIs twice,
30 steps and 50 samples, in fresh processes, and asserts byte-identical
output. Measured 2026-10-18 on this container: 4.8 s per physics run (four
recipes, 30 steps), 4.5 s per track run (2,000 samples, 1.27 MB), the test
10.5 s.
