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
still permit up to eight workers. Modes reuse a bounded browser pool with a
fresh context for each scene; cameras use independent browser processes.

`manifest.json` records requested GL stack, CPU budget, worker boot time,
track job/race time, presentation time, encoding/capture time, bytes and capture
path. The GL stack is a request, not a measured adapter identity. Saved image
bytes are checked for black or HUD-only output on both soft and CDP paths.
Native canvases wait for two actual game render frames. Soft canvases wait for
two presents: the first can complete an older in-flight readback after a camera
move. This preserves fixed `orbit`/`view`/`eyeAt` cameras without `snapCam()`.

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

## Operator cheatsheet

```sh
# Many frames, one boot (same track grouped automatically):
node tools/shot/shot.mjs --batch jobs.json
# Human-review JPEGs:
node tools/shot/shot.mjs monza 0.1 orbit out.jpg
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
