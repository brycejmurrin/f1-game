# tests/manual — the suites a human runs on purpose

Everything here is excluded from default discovery (`testIgnore: ["**/manual/**"]`
in `playwright.config.js`) and gates nothing. These suites either render hundreds
of SwiftShader frames or emit images for review, so they are run deliberately, by
path, when someone is looking at a circuit.

The regression suite lives one directory up in `tests/specs/*.spec.js` and
`tests/unit/*.test.mjs`; if a check should fail a build, it belongs there, not here.

| Suite | What it does |
|---|---|
| `blank-scan.spec.js` | one test per circuit: 25 frames round the lap, fail if any PNG is suspiciously small (camera inside scenery / staring into a void) |
| `inspect.spec.js` | one test per circuit: the same 25 frames composited into a 5×5 contact sheet, for the on-track intrusions a blank scan cannot see — a roof over the racing line renders a perfectly bright frame |
| `galleries/track-trace.spec.js` | a driven-lap frame trace for one circuit |
| `galleries/track-lap-audit.spec.js` | per-lap audit sheet |
| `galleries/all-tracks-buildings.spec.js` | building survey across every circuit |
| `timeout-probe.spec.js` | **Does `{ timeout: N }` actually bound a Playwright wait?** Not an M6 detail — a property of how the whole suite fails. `tlx-probes`' M6 skid declares `waitForFunction(..., { timeout: 30_000 })` and a probe measured that call running **344.4 s** before dying on the test budget instead. Reasoning of the form "this test's explicit waits total 120 s, so the time must be elsewhere" is only sound if declared timeouts fire — and that deduction sent two probes chasing `act()`, which turned out to take 309 ms. Three cases with unsatisfiable predicates and a short declared bound: a quiet page, a THROWING predicate (M6's shape when TLX is absent), and a busy rendering page (raf polling starved). Elapsed time measured Node-side, because Playwright's own bound is the thing in question |
| `banking-probe.spec.js` | **which term of the Nürburgring racing-line failure diverges between browser and node?** `terrain-over-road` reports ROAD 0.37 m over the line at the Schumacher-S bank, but reproducing its arithmetic in a Node VM gives a banking dy of −0.335 where the browser's failing sample implies −0.681 — a factor of two. Prints every term (built-track dy, centreline dy, the test's reference y, and `groundY().roadY` — the real mesh surface) side by side at seven laterals, so the diverging term is named rather than guessed. If the test's reference line sits ~0.35 below `roadY`, the test under-models the bank; if they agree, the mesh genuinely steps |
| `skid-probe.spec.js` | **which of the four links breaks?** `tlx-probes`' M6 skid waits on `fxState().skidVerts > 0` and has never seen it move; four proposed mechanisms — a hanging `act()`, a slow prediction, arithmetic in an un-timeouted evaluate, rAF starvation — were all disproved, and every one of them was a theory about the WAIT. This asks whether the value can ever change: it wraps `GLX.drawSkidBatch` before the stint and records call count, max `vertCount` offered, and the `dirty` flag. That splits the pipeline (car slips → marks accumulate → batch drawn → probe latches on a presented frame) in one run, because from outside "called with 0" and "never called" are indistinguishable and have opposite fixes |
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
