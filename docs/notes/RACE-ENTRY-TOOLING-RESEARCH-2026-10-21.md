# Race-entry tooling research — 2026-10-21 (B·H14)

Context: the 2026-10-20 Pages red (monza-foundation 8 → 26 s on llvmpipe at #3221, fixed by #3356) was found by a
red deploy run, three failures in, not by a gate. OrchB 24 asked (Bryce, quoted: "do a bunch of web research on how
to help profile debug test this stuff") for three things: how to pace work on the main thread without idling on
frames, how to capture and diff CPU profiles in CI, and how to detect a timing regression statistically so the
next 8 → 26 s jump is caught by a gate. This note rides PR #3385 (the race-entry cover PR). Sources are at the end;
what this repo already has is named so the ideas land on it rather than beside it.

## 1. Yielding on the main thread: scheduler.yield / postTask / isInputPending

What the sources say:

- `scheduler.yield()` pauses the current task and resumes it "as a prioritized task": the continuation goes to
  the FRONT of its priority level's queue, after `user-blocking` postTask tasks and before `user-visible` ones, and
  "the first to yield continues first". A `setTimeout(0)` or `postTask` continuation goes to the BACK of the
  queue, behind whatever was queued meanwhile (MDN, Chrome blog). Chrome/Edge 129 shipped it; Safari has not;
  MDN marks it "limited availability". The recommended fallback is feature detection plus `setTimeout(0)` (or
  the `scheduler-polyfill`, which drops priority inheritance).
- `scheduler.postTask()` is for deferring NEW work with an explicit priority, not for splitting the task you are
  in.
- `navigator.scheduling.isInputPending()` reports whether input events are queued (`includeContinuous` adds
  mousemove/wheel/pointermove). MDN now marks it deprecated/experimental, warns it "may incorrectly return false",
  and recommends `scheduler.yield()` instead. Chromium only.

Where the repo stands (measured on this PR): `Tracks.buildPaced` yielded to a whole FRAME after every 8 ms slice,
so 1.5 s of track-build CPU took 3.9–4.4 s of wall under the race cover (SwiftShader) and would cost a 60 Hz phone
~190 frames ≈ 3 s of idle. #3385 keeps a frame every third 16 ms slice and uses `scheduler.yield()` (else
`setTimeout(0)`) between. `warmCarAssetsAsync`, `prepareMenuCarAssets` (rAF-then-0 ms), the lamp bake (8 ms timer)
and `assets.js` `_yieldDecode` each have their own yield helper; `global-registry.test.mjs` documents every
`scheduler` read.

Ideas:

- I1. One `Yield` helper in `js/core/` (`Yield.task()` = scheduler.yield else setTimeout 0; `Yield.frame()` = rAF
  then 0 ms; `Yield.paced(budgetMs, rafEvery)`), used by the five sliced loops above, so the policy lives in one
  place and the registry documents one read. Low risk; a unit test per caller already pins the slice shape.
- I2. Do NOT adopt `isInputPending`: deprecated, Chromium-only, false negatives; under a cover there is no input to
  protect anyway. The frame-every-Nth-slice rule is the equivalent for the cover animation.
- I3. Under the race cover the only consumer of frames is the cover itself. A `rafEvery` that adapts to the measured
  frame cost (a frame that took > 40 ms earns two task slices before the next) keeps ~20 fps on a phone and ~5 fps
  on SwiftShader without a constant; the pace function #3385 added (read before every slice) is the hook.

## 2. CPU profiles in CI and diffing them

What the sources say:

- Playwright exposes raw CDP: `const cdp = await page.context().newCDPSession(page); await cdp.send("Profiler.enable");
  await cdp.send("Profiler.start"); … const { profile } = await cdp.send("Profiler.stop")` — Chromium only. The
  result is the `.cpuprofile` JSON DevTools loads (nodes with callFrame url/line, samples, timeDeltas).
- There is no maintained diff tool for two `.cpuprofile` files; the libraries that exist parse one file and
  compute self/total time (npm `cpuprofile`). A diff is a small script: aggregate self (and inclusive) time per
  `function url:line` in each file and compare.

Where the repo stands: `tests/helpers/`, `tools/perf/profile.mjs` and `apex_profile` profile the sim in Node;
`gpu-census.yml` records race-entry marks on real GPUs; nothing captures a browser `.cpuprofile` of a race entry
in CI. This session's `race-timer.mjs` (scratchpad) does exactly the sequence above with `APEX_PROFILE=<file>`,
and `cpuprofile-summary.mjs` prints self time by file and function plus inclusive time; both found the #3385
costs and the GLX `_ensureScratchGl` row in minutes.

Ideas:

- I4. A `race-entry-profile` tool under `tools/perf/` (proposed, not yet written): boot → `race("monza")` → `info().track` under a CDP profile, writing
  `artifacts/perf/race-entry-<sha>.cpuprofile` plus a `summary.json` (self ms by file, top 40 functions,
  `raceEntryStages()`), on the headless project's launch args, with `APEX_PIN=webgl2|three` and `APEX_GL`.
  The `gpu-census.yml` macos leg should take the same profile on Metal, where the SwiftShader-only rows
  (copyExternalImageToTexture, program links) shrink and the real ones (Car3D.build, flap solves) stay.
- I5. A `cpuprofile-diff` tool under `tools/perf/` (proposed) taking `<base> <head>`: per-function self-time table with deltas, sorted by |delta|,
  and a per-file roll-up; print the top 15 and write the full table to artifacts. Run it in `ci.yml` on the
  deploy branch (not per PR) against the previous deploy's profile artifact, and post the table into the run
  summary. It would have named `rigWarm` → `warmDraws` at #3221 directly.
- I6. Keep the profile sampling interval at 500 µs for race entry (11 s windows → ~16 k samples, 0.9 MB); 100 µs
  files are 5× larger for no extra signal at this scale.

## 3. A timing-regression gate for CI

What the sources say:

- Single pairwise tests on noisy CI timings are weak: Student's t and F-tests "have poor power for benchmark data"
  (Chen & Revels); rank tests (Mann–Whitney U) do not assume normality; Bencher's threshold catalogue offers
  static, percentage, z-score, t-test, log-normal, IQR and delta-IQR tests over a baseline window, with a
  minimum of 2 samples for the variance tests and ~30 recommended for z-score.
- Change-point detection over a WINDOW of runs is what MongoDB (E-divisive means) and DataStax's Hunter (modified
  E-divisive, Student's t for significance because the permutation test was non-deterministic) use in production;
  Mozilla and the 2026 evaluation paper compare the same family. The point of the window is that one outlier does
  not alert while a step does.

Where the repo stands: `tools/ci/spec-timings.mjs` already keeps a per-spec series — `{ s: [[ts, env, sec, tests]],
t: { title: [[ts, env, sec]] } }`, `env` ∈ swiftshader|llvmpipe|local, the last `keep` = 10 samples — merged from
every deploy-branch run's junit by `spec-timings.yml` onto the `bot/spec-timings` side branch (never into the
deploy branch: "evidence that edits the branch it describes"). Tonight's series for monza-foundation read
6.2, 8.4 (llvmpipe) … then 26.2, 20.9, 73.5, 58.1 — a step of 3× that no gate saw because nothing READS the
series except the shard packer. `docs/BUGS.md:356` notes the record bills a failed testcase at its timeout.

Ideas (the one OrchB called most valuable first):

- I7. **A spec-timing step gate in `spec-timings.yml`.** After merging a run's junit, for every spec with ≥ 4
  prior llvmpipe samples: compare the new sample with the prior window using a robust rule —
  `new > median(prior) + max(3 × MAD(prior), 0.5 × median(prior), 3 s)` — and when the run has reps (the selected
  shard runs each spec once, so usually not) a Mann–Whitney U on the last 3 vs the prior window. A hit writes a
  `STEP` row (spec, prior median, new, factor, the deploy sha and the merged PRs since the last sample) to the
  run summary and opens or updates ONE issue labelled `timing-step`, and the bus gets an INCIDENT line; it does
  not fail the deploy (the gate's false-positive rate on a 10-sample window is unknown until it has run for a
  week). Two consecutive hits on the same spec promote the issue to `blocked` for the merge desk. The data file
  change is zero: the series exists. Tonight it would have flagged 26.2 s against a median of 6.8 s (factor 3.9)
  at the 21:35Z run, forty minutes after #3221 merged and two deploys before the first Pages failure.
- I8. Change-point view for the humans: `node tools/ci/spec-timings.mjs --steps` prints, per spec, the E-divisive
  style split of its window (the single best split point by mean difference with Student's t, as Hunter does)
  so a reviewer can see WHEN a spec moved, not only that it did. 10 samples is short for E-divisive proper;
  raise `keep` to 30 for llvmpipe only (the file grows ~3×, still < 1 MB).
- I9. Fix the known bias first (`docs/BUGS.md:356`): a failed testcase is billed at its timeout, which inflates the
  window after a red and masks the next step; bill it as a miss (skip) in the series and keep the failure count
  separately.
- I10. The same rule over `RaceEntryProfile` marks from `gpu-census.yml` on macos (rigWarm, warmCarAssets, loadTrack
  spans per run, already uploaded as artifacts): a per-stage step gate catches a regression in the stage that
  moved, and on real hardware, which the llvmpipe series cannot (the GLX-vs-TLX mode split shows why: the same
  tree reads 9 s or 28 s depending on which backend the adapter probe picked).

## 4. Rows from the hunters, for PR C (code-traced, not measured)

Two read-only subagents (prior-art-scout, code-hunter on the race-entry slice) and B·H8's hunter/verifier pass
produced these; they are listed so nobody re-finds them. OrchB 24 routes F1 to H8's warm lane and the rest to a
follow-up PR after #3385.

- F1. A race-entry program warm never records into `_warmed`/`_warmKey` (`RaceEntryProfile.requestWarm` calls
  `gfx.warm()`; only `warmPrograms()` writes the bookkeeping), so quali → grid, a pm-restart and NEXT RACE re-warm
  the same world; `js/game.js` already measured a repeat TLX warm at 7.5 s SwiftShader that links nothing.
- F6. `startRace()` from Daily, Data Hub or season-continue does not stand the menu build down (introBuild does:
  `clearTimeout(flybyBuildTimer); _menuGate.generation++`), so the menu's timer can abandon the race's build and
  `startRaceBody` bounces to the title. Plausible; needs a VM repro first.
- F4/F5. `prepareMenuCarAssets` preps all 12 LEGENDS seats (makeCars fields one) and the whole field for a DUEL
  (two cars race), eating the intro's 1.5 s car-prep cap.
- F2 (H8's row 2). introBuild awaits `loadTrackStepped`, THEN `prepareMenuCarAssets` with its 1.5 s cap measured
  from after the build; the car prep is track-independent and could fill the build's frame gaps.
- F3 (H8's row 3). `menuSlice` is a fixed `setTimeout(32)` used by introPlan (a 32 ms sleep per ≥ 3 ms of planning),
  awaitIntroWarm, studioDone, menuFinish and prebuild — the same shape #3216 removed from the car prep.
- F7. rigWarm and mirrorPrepare are awaited one after the other; the mirror's priming frame could overlap the rig's.
- F8. `ensureScenery` awaits the build toolkit before `sceneryModels(def)`, which needs only the resident closure.
- F9. `RaceEntryProfile.continueWindow`'s resume branch does not reset `lapT0`, so a `beginUi` race's first leg
  ("scenery") absorbs the garage-out, flyby and intro build in `raceProfile()`.
- F10 (closed in #3385's 12e3832dc). The deferred car-warm queue drains through the caches, never a kept texture
  handle, so a leftover drained by a later countdown cannot upload a texture the LRU dropped.

## Sources

- MDN, `Scheduler.yield()`: https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield
- Chrome blog, "Use scheduler.yield() to break up long tasks": https://developer.chrome.com/blog/use-scheduler-yield
- MDN, `Scheduling.isInputPending()`: https://developer.mozilla.org/en-US/docs/Web/API/Scheduling/isInputPending
- Playwright, CDPSession: https://playwright.dev/docs/api/class-cdpsession
- npm `cpuprofile` (parse, self/total time): https://www.npmjs.com/package/cpuprofile
- Bencher, thresholds and alerts: https://bencher.dev/docs/explanation/thresholds/
- Fleming et al., "Hunter: Using Change Point Detection to Hunt for Performance Regressions" (arXiv 2301.03034):
  https://arxiv.org/abs/2301.03034
- MongoDB, "Using Change Point Detection to Find Performance Regressions":
  https://www.mongodb.com/blog/post/using-change-point-detection-find-performance-regressions
- Daly et al., "Change Point Detection in Software Performance Testing" (arXiv 2003.00584): https://arxiv.org/pdf/2003.00584
- Chen & Revels, "Robust benchmarking in noisy environments" (arXiv 1608.04295): https://arxiv.org/pdf/1608.04295
- "Evaluating Change Point Detection Methods for Software Performance Regression Analysis" (arXiv 2610.09023):
  https://arxiv.org/html/2610.09023
- In-repo: `tools/ci/spec-timings.mjs`, `.github/workflows/spec-timings.yml`, `tests/data/spec-timings.json`,
  `js/perf/race-entry-profile.js`, `docs/BUGS.md` §spec-timings, this PR's `artifacts/logs/h14-*.log`.
