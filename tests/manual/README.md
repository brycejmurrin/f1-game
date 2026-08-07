# tests/manual — the suites a human runs on purpose

Everything here is excluded from default discovery (`testIgnore: ["**/manual/**"]`
in `playwright.config.js`) and gates nothing. These suites either render hundreds
of SwiftShader frames or emit images for review, so they are run deliberately, by
path, when someone is looking at a circuit.

The regression suite lives one directory up in `tests/*.spec.js` and
`tests/*.test.mjs`; if a check should fail a build, it belongs there, not here.

| Suite | What it does |
|---|---|
| `blank-scan.spec.js` | one test per circuit: 25 frames round the lap, fail if any PNG is suspiciously small (camera inside scenery / staring into a void) |
| `inspect.spec.js` | one test per circuit: the same 25 frames composited into a 5×5 contact sheet, for the on-track intrusions a blank scan cannot see — a roof over the racing line renders a perfectly bright frame |
| `galleries/track-trace.spec.js` | a driven-lap frame trace for one circuit |
| `galleries/track-lap-audit.spec.js` | per-lap audit sheet |
| `galleries/all-tracks-buildings.spec.js` | building survey across every circuit |
| `act-probe.spec.js` | **a measurement, not a suite.** Times `__apex.act()` one frame at a time, recording `x`/`speed`/`rescueT` per step, to find WHERE full lock stops returning — `tlx-probes`' M6 skid never returns from `act({steer:1,throttle:true}, 1/60, 120)` and tripling its budget changed only the number in the error. Two controls (`steer 0.3` ×120, `steer 1.0` ×25 — the longest full lock anywhere else in the suite) decide whether the variable is step count or leaving the road. Its console output is the result; it asserts only that it produced data, because a probe that silently returns nothing must not read as "nothing wrong" |

## Running

```sh
npm test -- tests/manual/blank-scan.spec.js                  # all 40 circuits (slow)
npm test -- tests/manual/blank-scan.spec.js --grep monza     # one circuit
CIRCUITS=monza,spa npm test -- tests/manual/inspect.spec.js  # a named subset
TRACK=suzuka FRAMES=60 npm test -- tests/manual/galleries/track-trace.spec.js
```

Images land in `artifacts/galleries-<port>/`.

## The circuit list is derived, not written down

`circuits.js` reads `js/circuits/*.js`. This used to be 80 three-line stub files
— one per circuit, per suite — and nothing kept that list in step with the
circuit definitions, so adding a track meant remembering to add two stubs and
forgetting meant the new track silently went unscanned. Adding a circuit now
adds its tests automatically.
