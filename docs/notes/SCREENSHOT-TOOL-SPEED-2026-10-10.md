# Screenshot / Playwright tool speed (2026-10-10)

Research + landed knobs for making Chromium / Playwright / screenshot tools
faster without thrashing SwiftShader. External sources cited in the session;
repo measurements stay in `CI-RENDERING-PERFORMANCE.md`.

## What already worked

- CI `APEX_GL=llvmpipe` (~8–12× vs SwiftShader) via `browser-group.yml` /
  `remote-group.mjs`
- Worker caps (1 local on ≤4 cores; render-heavy stays low)
- `apex-capture`: N Chromium *processes* (tabs share one GPU process)
- `garage-angles`: one boot, many angles
- Soft-present / `#game-soft` instead of hung `page.screenshot`
- Cached Playwright Chromium action (avoids ~25 s re-download per job)

## Landed this pass

| Change | Why |
|---|---|
| `tools/lib/browser-workers.mjs` | One place for GL-aware worker defaults |
| `apex-capture` uses `defaultCaptureWorkers` | Higher pool on `APEX_GL=llvmpipe` (cap 4) |
| `remote-group` / `browser-group` plan emits `workers=` | Empty input → 1 for RENDER_SPECS groups, 2 for headless-ish on llvmpipe |
| `shot.mjs --batch` / `--jpeg` / `--raster` | One Chromium; JPEG for review; character raster skips pixels |
| Unit tests in tooling-fast | `browser-workers`, `shot-jobs`, updated `remote-group` |

## Docker (deliberately not)

Playwright’s CI docs recommend `mcr.microsoft.com/playwright:v…-noble`. This
repo already caches Chromium keyed on `package-lock.json` + runner image
(`.github/actions/playwright-chromium`). On Linux, restore time is comparable
to download ([Playwright CI — Caching browsers](https://playwright.dev/docs/ci#caching-browsers)),
and llvmpipe still needs Mesa + Xvfb on the **host** (`mesa-xvfb` composite).
Putting shards in the Playwright container would re-solve apt/Xvfb/DISPLAY
inside the image without removing the Mesa step — net win unproven. Revisit
only if cache-miss rate or install flakes dominate wall clock.

## Capture encoding and concurrency

Controlled software capture on Chromium 154.0.8037.57, four CPU cgroup quota,
2026-10-14, game tree `882cfae04` plus capture-tool changes:

| Probe | Result | Scope |
|---|---|---|
| Frozen Monza, 1280×720, CDP PNG; three samples per encoder, alternating order after one warm-up | Normal median 366.7 ms; fast median 60.0 ms (6.1×); 1,114,726 vs 1,401,755 bytes (+25.7%) | Every decoded RGBA byte equal; rendering/boot excluded |
| Monza + Spa, sequential captures, one Chromium worker | 42.384 s, two meaningful images | One cold sweep, soft canvas capture |
| Same track pair, two independent Chromium workers | 50.943 s, two meaningful images | One cold sweep; two workers were slower on this CPU budget |

These are local observations, not hardware GPU results or repeated estimates
of whole-sweep throughput. The untouched capture command produced an entirely
black Monza image in 24.013 s; that invalid frame is not a speed baseline.
Mesa/Xvfb was unavailable here, so llvmpipe throughput remains unverified.

The shared CDP helper now sets `optimizeForSpeed: true` for PNG. It uses a
lossless encoder with lower compression; JPEG quality and the preferred soft
canvas path are unchanged. `optimizeForSpeed: false` provides an encoding A/B.
The parallel capture tool optionally pauses the Apex render loop during CDP
fallback and restores its previous headless state in `finally`.

Capture pools now honor `APEX_WORKERS` in cameras and modes as well as tracks.
They cap at actual job count and use affinity plus cgroup quota rather than
host CPU count. SwiftShader defaults to one worker per four CPUs (cap two);
llvmpipe keeps a half-CPU budget (cap four), and its launcher now actually
uses the same ANGLE GL flags as `playwright.config.js`. Explicit overrides
still permit up to eight workers. Modes reuse a bounded browser pool. Compatible race/time-trial jobs reuse a
warm page; menu/results remain isolated, and `--isolated` restores fresh
contexts for every job. Retained pages pause while idle. Cameras use independent
browser processes.

`manifest.json` records requested GL stack, CPU budget, worker boot time,
track job/race time, presentation time, encoding/capture time, bytes and capture
path. The original GL stack field was a request; the expanded manifest now also records
Chromium version, executable source, actual GPU renderer/vendor, feature status,
backend/API, seed, viewport/DPR, governor state, render clocks and source generations. Saved image
bytes are checked for black or HUD-only output on both soft and CDP paths.
Native canvases wait for two actual game render frames. Soft canvases now wait for
a displayed source generation submitted after a camera move. TLX tags actual
readback submissions; WGX exposes copy generations; GLX captures synchronously.
Older backends keep a strict two-present fallback with advancing generations.
This preserves fixed `orbit`/`view`/`eyeAt` cameras without `snapCam()`.

No browser-engine fork is necessary for the measured PNG improvement. Chromium
already exposes the fast encoder in [CDP](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-captureScreenshot).
Its [capture implementation](https://chromium.googlesource.com/chromium/src/+/main/content/browser/devtools/protocol/page_handler.cc)
selects low-compression PNG and runs screenshot encoding synchronously in the
browser process. [Playwright's Chromium implementation](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/chromium/crPage.ts)
does not expose that parameter, but this repository already uses CDP directly.
An upstream thread-pool encoding experiment would only be justified after
profiling shows encoding still dominates with fast PNG and bounded workers.
The common soft canvas path already took only 17–38 ms in the one-worker sweep;
first presentation took 4.9–24.5 s. Software rendering is the larger remaining
cost ([SwiftShader architecture](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md)).

## Capture profiles, browser ownership and repeatable benchmarks

The shared `capture-options.mjs` controls `apex-capture`, `shot --batch` and
`track-session --serve`. Defaults preserve existing viewport/encoding behavior.
`--profile preview` renders at 640×360, DPR 1 and JPEG quality 80.
`--profile comparison` uses 1280×720 lossless PNG, defaults seed 1, pins render
scale 1, holds the render clock at zero, and holds the governor's current feature tier. Record that tier when
comparing different runs; a hold cannot retroactively restore a shed feature.
Explicit width/height/DPR/type/quality/seed override a profile. Preview output
can hide small material/geometry defects and is not pixel-equivalent to comparison.

Scene-only captures read the presented 2D canvas; `--scope page` includes DOM
HUD and overlays. CSS animation disabling does not stop the JavaScript game
loop. Strict readiness rejects missing/stale presentation rather than saving
old bytes; shared defaults allow 30 seconds, with explicit larger budgets in
sweep/session tools. Camera and race fixed sleeps were replaced by construction
and presentation barriers. Same-track batches avoid redundant time-of-day
rebuilds, and team/backend/viewport/seed boundaries create fresh contexts.

`--gpu hardware|swiftshader|llvmpipe|lavapipe` and
`--browser auto|chromium|shell` select independent rendering and binary profiles.
GPU requests are checked against Chromium's actual renderer; software fallback
is an unavailable capability, not a successful hardware benchmark. Mesa workers
share the CPU quota through `LP_NUM_THREADS`; lavapipe uses `VK_DRIVER_FILES`.
Executable environment/path overrides remain authoritative and are recorded.

The harness owns a supported Playwright `BrowserServer` process handle while
returning the familiar `Browser`. This fixes the old `Browser.process()` no-op,
retains ownership until close finishes, bounds hung close, and reaps late
acquisitions/disconnects. The benchmark's IPC child explicitly reports owned
browser PIDs; a timed-out sample gets graceful termination followed by bounded
cleanup of only those owners. No process-name sweep is used.

`--cache-assets` opts into a namespaced immutable static snapshot. First reads
must match file metadata captured at startup, then bytes stay pinned. Absolute
asset URLs use the same bytes with no-store; changed unread files fail 409.
Start a new server after edits. Live tools keep no-store by default, and request
routing is not introduced because Playwright routing disables HTTP caching.

`--trace` records bounded Chromium traces starting before navigation, including
first-scene warmup. Trace streams have time/size caps and partial-file cleanup;
default filenames are unique. Tracing adds overhead and is disabled in timing
benchmarks. Explicit traces should be used only to explain a slow capture.

`capture-benchmark.mjs` runs cold scenes sequentially, alternating GPU/browser/
profile cells by sample round, with one worker and fixed seed. It records
unavailable cells separately and never treats their missing timings as speed
wins. It reports medians for elapsed/presentation time and image bytes. Browser
version and actual backend matter: headless shell and unified Chromium may bind
different game APIs even with the same GPU flags.

Local two-sample cold Monza preview comparison, Playwright 1.63 and its matching
Chromium/headless shell 153.0.8010.12, four-CPU quota:

| Browser | Median whole sweep | Median presentation | Scope |
|---|---:|---:|---|
| Full Chromium | 32.017 s | 21.290 s | 640×360 JPEG, two successful cold samples |
| Headless shell | 34.376 s | 23.838 s | Same requested profile/seed, two successful samples |

This small sample does not establish a universal winner. Hardware and llvmpipe
requests fell back to SwiftShader and were rejected; lavapipe had no installed
Mesa Vulkan ICD. Hardware/Mesa throughput remains unverified on this machine.
A separate three-camera warm-session capture with immutable assets and optional
tracing saved distinct meaningful aerial/tour/eye images. First presentation
was 21.254 s; later views were 2.202 s and 1.995 s. Its 39.806 s total includes
trace overhead and should not be compared to an untraced timing run.

Controlled barrier A/B on one warm Monza page (Chromium 153.0.8010.12),
640×360 PNG, fixed seed/render clock/scale/tier, three matching cameras,
three samples per barrier with alternating order:
legacy two-present wait median 2.608 s; generation wait median
2.562 s (1.02× for the presentation barrier).
Decoded RGBA matched for 3/3 paired images; all six were meaningful.
This is a warm presentation-only comparison, not a whole-run multiplier.

The atomic mutation marker records the wait target in the same page callback
as camera/settings changes. A target that lands during the return trip is
already fresh and needs no additional readback. The later timing-only A/B
(three matching warm cameras, same controls/order) measured legacy median
2.627 s versus atomic-generation median 1.303 s
(2.02× for this small presentation-only sample). All displayed
generations met their requested target; one individual camera was slower, so
this is not a universal multiplier. Atomic marker regressions exercise already
completed targets and older deferred reads. A real WGX screenshot with the
verified Vulkan/SwiftShader adapter pins also passed copy-generation freshness,
meaningful pixels and requested-backend evidence with zero GPU errors.

## Operator cheatsheet

```sh
# Many frames, one boot (compatible scenes grouped automatically):
node tools/shot/shot.mjs --batch jobs.json
# Human-review JPEGs:
node tools/shot/shot.mjs monza 0.1 orbit --profile preview
# Keep a built circuit resident and pause it between JSON-line commands:
node tools/shot/track-session.mjs --serve --track monza --profile preview
# Scene/HUD comparison, immutable assets, optional startup trace:
node tools/shot/apex-capture.mjs tracks artifacts/capture monza --profile comparison --scope page --cache-assets --trace
# GPU/browser profile matrix, sequential cold samples (offline --plan available):
node tools/shot/capture-benchmark.mjs --track monza --samples 3 --out artifacts/capture-benchmark
# No pixels — __apex.render character raster only:
node tools/shot/shot.mjs monza 0.1 --raster
# Headless-ish group on CI llvmpipe (plan defaults workers=2):
node tools/ci/remote-group.mjs physics-core
# Force override:
node tools/ci/remote-group.mjs ui --workers 1
```

## Sources

- [Playwright CI](https://playwright.dev/docs/ci) — workers, sharding, Docker, `--only-changed`
- [Playwright test sharding](https://playwright.dev/docs/test-sharding)
- [Optimize Playwright workers (TestDino)](https://testdino.com/blog/optimize-playwright-workers)
- [Headless vs headed / headless-shell (Currents, 2026-02)](https://currents.dev/posts/when-tests-should-run-headless-vs-headed-in-playwright)
- [Playwright #33566](https://github.com/microsoft/playwright/issues/33566) — chromium-headless-shell
- In-repo: `docs/notes/CI-RENDERING-PERFORMANCE.md`, `docs/notes/TESTING-FIELD-NOTES.md` (2026-09-30 workers=4 timeout)

- [Playwright screenshots API](https://playwright.dev/docs/api/class-page#page-screenshot) — CSS/output scale, encoding and composited page scope
- [Playwright Chromium headless modes](https://playwright.dev/docs/browsers#chromium-new-headless-mode) — shell versus full Chromium selection
- [Playwright BrowserServer](https://playwright.dev/docs/api/class-browserserver) — supported process/close/kill ownership
- [Playwright BrowserType.launchServer](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-server) — owned launcher with loopback connection
- [Playwright routing](https://playwright.dev/docs/api/class-browsercontext#browser-context-route) — routing disables HTTP cache
- [CDP SystemInfo](https://chromedevtools.github.io/devtools-protocol/tot/SystemInfo/#method-getInfo) — actual GPU and feature diagnostics
- [CDP Tracing](https://chromedevtools.github.io/devtools-protocol/tot/Tracing/#method-start) — streamed optional startup traces
- [Mesa environment variables](https://docs.mesa3d.org/envvars.html) — software worker thread limits
- [Vulkan driver selection](https://vulkan.lunarg.com/doc/view/latest/linux/LoaderDriverInterface.html) — VK_DRIVER_FILES
