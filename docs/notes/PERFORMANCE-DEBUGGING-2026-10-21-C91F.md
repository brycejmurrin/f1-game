# Fresh performance and transition debugging

## Source and published identities

Investigation baseline: deploy `e44df10d00a700a17127f4409284c0e07655b4f9`.
The initial public HTML advertised `apex-sha=2fc7a8fe86a682170f119dd4b7ac15d6ded9cfce`
and build 20145. GitHub's compare API placed deploy ten commits ahead of that
published revision, including boot/title work in #3382, timing tooling in #3401,
and hook parity in #3359. Local `?v=dev` build numbers identify the development
shell, not the published revision; the source SHA identifies these reproductions.

PR #3407 was open/draft at `0dcb92eadf425e29e365f010b90918dc042d81d4` with
its merge hold intact. Its only non-skipped check was the draft opt-out job.
The compare API reported one unique PR commit and 33 deploy-side commits from
merge base `cfefcbf7fd3f972ce2adaaf1c5579946acbbd085`. Comparing all of that
PR's paths against deploy since its base found only generated
`tests/data/impact-map.json` changed: none of its product patches had reached
this baseline. Its measurements are prior context, not this pass's baseline.

At a second observation, 2026-10-21 05:19 UTC, deploy had advanced to
`50cc71ddaffd7e9e1824bc9b563a95a90b6f59ce`, while public build 20157 served
`7b6a3a75158f8061d43b7b4c9618042f4a7de1a1`; the compare API placed that
deploy eleven commits ahead of Pages. PR #3407 still had the same draft head,
hold and skipped checks, and refreshed open PR paths still did not overlap the
five patched modules or their five unit files. None of the measured baseline
identities were changed when the release train moved.

The final identity refresh at 06:18 UTC observed deploy
`3d13be811ad33884a583493ea6a2e141d958842a` and Pages
`b24574841d111b87d22e084fc811b2cf17bf3707`. GitHub's compare API placed deploy
18 commits ahead of Pages. The refreshed list of 20 open PRs had no overlap on
our five modules or six edited unit files. These later revisions were not
substituted for the pinned reproduction baseline.

## Ranked findings

| Rank | Trigger | Hotspot or bug | Evidence and likely impact | Ownership and action | Validation |
| --- | --- | --- | --- | --- | --- |
| 1 | Early repeated GLX context loss while session storage throws | Overescaped fallback marker regex forgets previous reloads | Three simulated page boots previously restart at attempt 1; can repeatedly reload instead of exhausting the existing two retries | Free GLX paths patched; analogous held TLX literals handed to #3408 | Failure/restore and healthy-marker regression fixtures |
| 2 | Controller stick loses pointer capture and lifts outside its element | Stick is missing from global per-pointer release fanout | Repeat timer and pointer ownership remain latched; subsequent presses are blocked | Free `phone-pad.js` patched | Wrong-pointer, matching release/cancel, surviving pedal and repeat fixtures |
| 3 | WheelState enabled, locked front releasing at crawl speed | Low-speed yaw substeps omit combined-slip axle scales | At 4 m/s front force retains about 34% while old yaw retains 65%; corrected yaw retains about 34% | Free `player-forces.js` patched; feature default and tuning preserved | Actual WheelState fixture fails before fix; raw default-state parity below |
| 4 | QR scan cancelled/restarted before detector promise settles | Old completion clears replacement's busy flag | Both old resolution and rejection permit a third detect call while the second is pending | Free `net/scan.js` patched | Deferred real-module fixtures: 3 calls before, 2 after; stale code never delivered |
| 5 | Fresh frame-time benchmark after startup/build tasks | Buffered observer imports historical long tasks | Retained browser fixture counted five historical tasks after reset, corrupting a fresh measurement window | Free `metrics-overlay.js` patched | Historical/current/retired-observer fixtures and browser check |
| 6 | Secondary mouse press on controller pedals or navigation | Right/middle press actuates controls | Baseline GAS becomes 1 on secondary press; can also navigate/repeat | Free `phone-pad.js` patched, following existing hold-button contract | Primary mouse/touch/pen and secondary-button regressions |
| 7 | Ordinary unarmed AI lateral planning | PitLane computes road-window records before returning unchanged target | Fresh profile attributes CPU to PitLane; prototype reduces 21-car facade reads 126 to 21, with 2,040 exact output comparisons | Held by #3377/#3391; owner handoff only | Static 42 to 0 window-record constructions is not measured allocation/GC or end-to-end gain |
| 8 | Drag steering reset, then fresh anchored touch before next steering tick | Old smoothing state survives reset | Unmoved touch with raw value 0 produces steering 0.7880222259386307 | `input.js` held by #3388; reproduced and handed off, no patch here | Existing touch-drag harness; device frequency unmeasured |

Path ownership was checked through fleet claims and current open PR file lists.
When `fleet-owner`'s direct HTTP transport returned 401, authenticated `gh`
provided the complete open PR file snapshot; unknown ownership was not treated
as free. Workers used isolated worktrees, and only the parent launched Chromium.

## Workload and evidence limits

Fresh CPU diagnosis used the existing debug browser launcher, one persistent
Chromium, and CDP Profiler at 200 microseconds. Monza, day/dry, 20 laps, 22 cars,
helmet camera, 844 by 390 landscape, DPR 2, touch 5, reduced motion false.
Drawing was disabled. Seed 42 preceded awaited race construction, then `go`,
`headless(true)`, `reset(0.02,55,0,42)` and fixed throttle/steer 0.02. After
3,000 warm-up ticks, 6,000 ticks advanced the actual field at 1/60 s.
Race state, intended track and 22-car field were asserted.

The selected Three backend actually ran GLX/WebGL2, ANGLE Vulkan SwiftShader.
The installed tooling was Playwright Core 1.63.0 with system Chromium
154.0.8037.57; the user agent alone does not identify that engine version.
This is software-rendered Chromium with an iPhone user agent, not Safari or a
physical phone. The diagnostic run collected 6,786 samples; leading self-time
sites were updateCar (593), update (372), updateCarLateral (260) and
updateCarBrakePlan (222), in held `game.js`. PitLane had think (113), update
(62 plus 1 in another frame), and laneX (49 plus 1). Sampling identifies places
to investigate; its instrumented elapsed time is not a comparison benchmark.
Workers' source reading and focused tests were allowed during diagnosis;
all worker CPU work stopped for unprofiled comparisons.

With WheelState OFF, 6,650,913 primitive per-car values match with `Object.is`
across Monza/Vegas, dry/wet, 300 advancing ticks each, 22 cars, active real tyre
wear, seed 42 before construction and reset. This is raw VM behavior evidence;
the intentional WheelState ON low-speed correction changes yaw behavior.

### Unprofiled control comparisons

Three repeats per version per scenario used reload order baseline, candidate,
candidate, baseline, baseline, candidate. Each race used the setup above and
3,000 warm-up plus 6,000 measured steps in batches of 100. Vegas used day/wet.
Baseline sources came from the pinned deploy SHA by response substitution;
candidate sources were the saved five-module diff. All initial and final raw
browser car-state JSON matched within each track, supplementing the stronger
VM `Object.is` check. Raw batch timings and source diff are in the evidence.

| Scenario | Baseline total median [range], ms | Candidate total median [range], ms | Baseline / candidate 100-step p95, ms | Baseline / candidate p99, ms |
| --- | --- | --- | --- | --- |
| Monza dry | 1633.1 [1622.7,1784.7] | 1559.0 [1526.0,1686.2] | 49.2 / 44.5 | 67.7 / 57.5 |
| Vegas wet | 1444.5 [1411.0,1536.0] | 1557.3 [1275.6,1571.0] | 34.3 / 36.5 | 47.3 / 45.3 |

These controls are **inconclusive for performance**: ranges overlap, medians
move in opposite directions, and host load averaged above 3 during many arms
despite stopped workers. Browser boot/build/raster work remained on this host;
the quiet-worker rule alone did not establish a quiet machine. No speedup or
proven performance regression follows. Correctness failures justify these
patches independently. A phone/GPU frame-time claim needs a separate workload.

### Browser bug reproductions

- A real GLX context and `WEBGL_lose_context` produced trusted context-loss
  events. With marker 2 inherited before load and targeted session-storage
  denial, baseline rewrote marker 1 and scheduled another reload; candidate
  wrote marker 3, scheduled none, and reported the exhausted budget. Only the
  automatic retry timer was suppressed to keep the baseline inspectable;
  the healthy-reset timer and native context event remained real. Both arms
  fired inside the early-loss window. This verifies recovery logic, not a
  physical driver failure rate.
- On the real controller DOM, synthetic pointer events plus injected capture
  refusal left baseline's repeat timer at 1 and stick active after matching
  document release/cancel. Candidate cleared both; wrong pointer left the
  stick held, and the other finger's throttle stayed 1. Secondary mouse
  throttle changed 1 to 0; primary throttle stayed 1. No network pairing was
  needed or claimed.
- A controlled historical 80 ms task followed by reset yielded historical
  counts 5 before and 0 after. One new 80 ms task then yielded 6 before and 1
  after. A separate debugger logpoint confirmed the baseline reset callback
  received old `startTime` entries. Its logpoint was removed and debugger
  detached with no cleanup errors before timing. Zero frame samples in this
  frozen fixture are expected; it measures observer counts, not frame rate.

## Review and rejected hypotheses

Rendering reviewed simulation; simulation reviewed input; lifecycle reviewed
GLX; replay/audio reviewed benchmark reset; loading reviewed QR cancellation.
No actionable source defects remained in those reviews. Absolute VM filename
metadata omissions in two new fixtures were corrected before integration.

The first full structural gate ran all 811 files: 810 passed and
`validation-cli.test.mjs` failed its stage-child reaping assertion. That
unchanged fixture killed its detached child and immediately exited; this
container's PID 1 does not reap adopted zombies, and `kill(pid,0)` correctly
still sees that PID. The isolated fixture repair waits for the child's `exit`
event before exiting. It preserves production `runStage`, the 1,500 ms timeout,
3,000 ms polling deadline and exact PID assertion. Focused evidence failed
before and passed after. Mutating only production `killSignal` to SIGKILL still
leaves a genuinely live sleeping child and fails the original assertion;
the probe then killed and reaped that child. Independent cross-review found no
weakening. This repair is test infrastructure, not an additional gameplay fix;
the first full gate remains a recorded failure, not a green retry.

On the repaired tree, `node tools/ci/deploy.mjs --gate-only` completed with
exit 0 in 3,234 seconds: all 811 tooling-floor files, all sixteen pure-Node
suites and the thirteen-test parts census passed. Its final verdict explicitly
excludes browser smoke groups and `test:sweeps` (the diff cannot move geometry).
The separate selected coverage audit passed for all 1,110 test files. This is
a local pre-push result, not a full GitHub CI or browser/hardware verdict.

Browser physics characterization passed on its first run (one specification,
81.3 seconds; no retries/skips). The existing rendered
`perf-frametime.spec.js` failed its sample adequacy assertion: four frames,
where more than four were required. A separate, clean worktree at the exact
baseline SHA failed with the same four-frame result. Both started below the
runner's 2.5 load gate (candidate 1.29, baseline 1.73); individual Evaluate
stalls reached 18.5 and 21.9 seconds on software GL. This is recorded as an
inherited software-rendering verification failure, not a candidate performance
regression or a passed integration gate. Its thresholds/settings/baseline were
not changed. The governor owner received the evidence on the fleet bus.

An initial baseline comparison launch used the wrong working directory; it
and the subsequent cleanup attempt were interrupted before retaining results.
One owned Chromium child survived the initial sweep briefly, was terminated
by its verified process-group identity, and absence of live browsers was
checked before the retained clean-baseline run. Those operator attempts are
not comparison evidence.

No speculative loader rewrite was retained: BitmapDecode has no product
consumer, the inspected bake caller supplies synchronous ImageData, and track
worker cancellation/transfer paths already have ownership and cleanup guards.
Soundtrack decode is serialized and its caches bounded. ReplayBuf's bounded
search did not justify a rewrite. Droplets/skidmarks pools and weak CarFx
cadence ownership did not show a new retention defect. Incident-window
allocation work needs an active-incident profile before proposing changes.
HUD/WATCH/telemetry/appearance, race-entry/garage/atlas and WGX work were held
by existing owners and were excluded.

`ContactGeometry.wallLimits` had 51 self samples, but already writes pooled
scratch and gates post scans. Its paired wall-node lookup opportunity was
explicitly rejected in #3407's prior measurements, so it was dropped here.
SAT trigonometry belongs to separately gated contact paths; these samples do
not establish SAT cost. Skipping post-collision boundary calls would require
proof against position mutation and edits to held collision code.

A late #3428 source lead identified a separate WheelState normalization
mismatch: its nominal `KAPPA_PEAK=0.10` is multiplied by a curve whose actual
front peak implies approximately 0.08095. The rear pure-lateral force still
retains its plateau; the concern is the combined-slip normalization. This was
handed back for per-axle force characterization and enabled-feature dynamics
checks. No patch or measured handling claim follows from that source review.

## Primary references

- [CDP CPU profiler](https://chromedevtools.github.io/devtools-protocol/tot/Profiler/).
- [Playwright CDP connection](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp)
  and [route fulfilment](https://playwright.dev/docs/api/class-route#route-fulfill).
- [Window.name](https://developer.mozilla.org/en-US/docs/Web/API/Window/name).
- [BarcodeDetector.detect promises](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector/detect).
- [Pointer button semantics](https://www.w3.org/TR/pointerevents3/#the-button-property).
- [PerformanceObserver buffering](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver/observe).
- [Performance Timeline buffered flag](https://w3c.github.io/performance-timeline/#buffered-flag).
- [Long Tasks start times and processing](https://w3c.github.io/longtasks/).
- [Node ChildProcess exit event](https://nodejs.org/api/child_process.html#event-exit).
