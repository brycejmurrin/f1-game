# Input / HUD / settings testing: research and a hunt (B·H11, 2026-10-21)

Context: Bryce, relayed by OrchB 24 — "Hunters should use subagents to come up with new ideas to test or holes also
do a hunch of web research on how to help profile debug test this stuff". This note holds the web research (with
the URLs read), what a code-hunter pass over the input/HUD/settings slice found, and what to adopt. Lane evidence
for the perf work is `docs/notes/LIVE-INPUT-H11-2026-10-20.md`.

## What the hunt found (code-hunter over js/input + the HUD/settings slice)

- **Bug, fixed (PR #3384):** `js/ui/settings-export.js` `padRest` — LOAD SETTINGS skipped a calibrated stick rest. The
  row's default is the legacy scalar `0`; CALIBRATE STICK stores a per-pad map, and `typeOk(map, 0)` refused it.
- **Bug, fixed (PR #3384):** `js/input/steer-tuning.js` `matchPreset` — an unset key compared as the candidate
  preset's own value, so FEEL › SIM on a fresh install lit and stored PRO over STANDARD assists.
- **Coverage false negative:** `tests/unit/hud-relative.test.mjs`, `hud-strategy.test.mjs`, `hud-inputs.test.mjs` load
  the source with `vm.runInContext(SRC + "; this.X = X;", ctx)` and no `filename`, so V8 coverage cannot attribute
  the run to `js/ui/hud-*.js` and their pure helpers read as never entered. A coverage pass must pass `{ filename }`.
- Lower-confidence leads, not yet reproduced: `hud-strategy.js` treats "no pit plan" as "a stop is left" (an
  UNDERCUT cue without a plan); `input.js` `unlockLandscape` returns early before a pending `orientation.lock()`
  resolves, leaving the menu pinned; `collect("all")` exports only the changed fields of object-valued keys.

## Mutation testing: StrykerJS

- `node --test` runs under the **tap runner** (`testRunner: "tap"`, default `nodeArgs` `--test-reporter=tap -r
  {{hookFile}} {{testFile}}`); a "test" is a whole file, so coverage analysis is per file
  (https://stryker-mutator.io/docs/stryker-js/tap-runner/). The **command runner** runs `npm test` per mutant with
  no coverage analysis (https://stryker-mutator.io/docs/stryker-js/configuration/).
- Mutant switching: every mutant is compiled in behind `stryMutAct_9fa48(id)`, which reads `__stryker__.activeMutant`
  from the global object (or `process.env.__STRYKER_ACTIVE_MUTANT__`)
  (https://raw.githubusercontent.com/stryker-mutator/stryker-js/master/packages/instrumenter/src/util/syntax-helpers.ts).
  **Our vm harnesses have their own global**, so a mutant would never activate inside a sandbox and every mutant
  would "survive". A trial needs one line per harness: `ctx.__stryker__ = globalThis.__stryker__` (inference from
  the source above).
- Scope with `mutate` globs (line ranges allowed) and `incremental: true`
  (https://stryker-mutator.io/docs/stryker-js/incremental/); score = (killed + timeout) / valid
  (https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/).
- Until a trial lands, hand mutation checks stay the rule for new pins: this lane's pins were each shown to fail
  against a planted defect (a dropped `applySteerTuning` line, a no-op `setTimeScale`, a rotation that wipes the
  calibrated zero or skips the filter reset).

## Property-based testing: fast-check

- `npm i -D fast-check` (dependency `pure-rand` only); call `fc.assert(fc.property(…))` inside a `node:test` test
  (https://fast-check.dev/docs/tutorials/setting-up-your-test-environment/property-based-testing-with-nodejs-test-runner/).
  Failures print `{seed, path}` to replay the shrunk case (https://fast-check.dev/docs/tutorials/quick-start/read-test-reports/).
- Properties that fit `padAxisShape` / `analogShape` / the tilt map over generated slider settings: odd symmetry,
  monotonic, dead zone ⇒ 0, |out| ≤ 1 with ±1 at full lock, no NaN. For gap/time formatters: sign iff non-zero,
  `fmt(-g)` mirrors `fmt(g)`, bounded length, a placeholder for NaN/Infinity
  (https://fast-check.dev/docs/core-blocks/arbitraries/primitives/number/).

## Measuring touch latency in the browser

- Event Timing (`PerformanceEventTiming`): input delay = `processingStart − startTime`, handler = `processingEnd −
  processingStart`, `duration` runs to the next paint (8 ms granularity; `durationThreshold` down to 16)
  (https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEventTiming). Safari ships it from 26.2
  (https://webkit.org/blog/17640/webkit-features-for-safari-26-2/).
- Long Animation Frames attribute scripts and `forcedStyleAndLayoutDuration` — Chrome 123+ only
  (https://developer.chrome.com/docs/web-platform/long-animation-frames). This lane's probes used it to find the
  `hud-layout.js` and `hud.js` forced layouts.
- Chrome dispatches `touchmove`/`pointermove` just before rAF and `touchstart` immediately
  (https://developer.chrome.com/blog/aligning-input-events); `getCoalescedEvents` / `getPredictedEvents` are in iOS
  Safari 18.2+ (https://caniuse.com/mdn-api_pointerevent_getcoalescedevents).
- No web API gives a canvas's presentation time; input-to-photon on the phone needs a 240 fps video. In page:
  `event.timeStamp` → the physics step that consumes it → the next rAF timestamp, p50/p95.

## Playwright touch emulation vs a real iPhone

- `page.touchscreen.tap` is the only touchscreen API (https://playwright.dev/docs/api/class-touchscreen);
  `dispatchEvent('touchmove', …)` events are untrusted (https://playwright.dev/docs/touch-events). Chromium's CDP
  `Input.dispatchTouchEvent` sends trusted multi-touch
  (https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Input.pdl) — the probes in
  this lane used it.
- Playwright's WebKit is not Safari (https://playwright.dev/docs/browsers). Emulation cannot show digitizer latency,
  iOS gesture arbitration, ProMotion pacing (Safari holds rAF near 60 by default,
  https://www2.webkit.org/show_bug.cgi?id=294338) or an iPhone GPU's limits. Real-device evidence: Safari Web
  Inspector Timelines over a tethered iPhone (https://webkit.org/web-inspector/timelines-tab/).

## Adopt, in order

1. fast-check properties for the input curves and the HUD formatters (S).
2. A shared CDP touch helper for Chromium specs instead of untrusted `dispatchEvent` drags (S–M).
3. An `__apex` latency probe: `timeStamp` → consuming physics step → rAF, with an Event Timing observer (M).
4. A StrykerJS trial on two or three `js/input/` files through the tap runner, with the `__stryker__` bridge (M).
5. A real-iPhone pass with Web Inspector Timelines when Bryce's phone is tethered (S–L).
