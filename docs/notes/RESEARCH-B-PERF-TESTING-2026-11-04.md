# Research B: new ways to measure and test performance (2026-11-04)

Kind: measurement · Re-measure-by: 2027-01-15

Lane B of the two research sessions Bryce asked for (dispatcher chat, 2026-11-04 ~07:23Z): **new ways to measure and
test performance, and ideas we have not tried**. Lane A owns untested paths and bug hunting; nothing here is a bug
report, and the few defects that fell out are filed as measurement gaps. Base: deploy tip `3be4c319`. Method:
`prior-art-scout` for the do-not-re-report list; four read-only `code-hunter` passes (physics/AI loop, TLX WebGPU
submission, HUD/DOM, boot/assets/SW/audio) and one `deploy-research` web pass, all on opus; one Chromium driven by this
session through the chrome-devtools MCP (TLX on the WebGPU API over SwiftShader, 844×390 touch landscape); every
claim below that names a file went through `finding-verifier` (15 rows: 14 confirmed, 1 refuted, 0 stale). Raw
evidence (two traces, five heap snapshots, the census scripts) is under ignored `artifacts/perf-research/`.

Prior art read and not re-reported: `PERFTEST-HUNT-2026-10-24.md` (the "count, don't time" rule and its gap list),
`PERF-SESSION-BUDGETS.md`, `PERF-MEASUREMENT-INTEGRITY-2026-10-30.md`, `PERF-WORKFLOW-2026-10-30.md`,
`LIVE-DEBUGGER-PHONEPERF-2026-10-24.md` (PP-1..19), `PERF-GPU3-2026-10-30.md`, `PHONE-GPU-TEST-2026-10-21.md`,
`CI-RENDERING-PERFORMANCE.md`, `PERF-HUNT-P8-2026-11-03.md`, issues #4272, #4710, #4680, #3100, #3104, #3115, #3117.

## 1. What measures performance today, and where it is blind

| Layer | Instrument | Gate? | Blind spot |
|---|---|---|---|
| In-game | `__apex.perf({on})` PerfSpans (9 spans, p50/p95/p99/max), LoAF ring (32), `gpuTimer()` (timestamp-query / EXT_disjoint), governor `frameTimes` (2048-frame ring) and `open` (first 600 frames) | report only | LoAF `scripts[].sourceURL` names `js/xr/xr-boot.js` for every game-tick frame (§2.4); `frameTimes.maxMs` and `open.maxMs` absorb the profiler-attach pause (§2.5); nothing persists a record across sessions except PHONE TEST |
| Node VM | `perf-vm-alloc-budget` (188 KB/frame, monza, frames 600–960 of a cold process), `perf-vm-leak-cycles` (exact handle/listener/interval counts), `hot-bench` (step/physState/nodeAt, 6× ceiling), `frame-hotpath-alloc` (source shape) | yes | one circuit, cold JIT, cruise only (§3.1); DOM stub counts no writes and MutationObserver is inert; the VM is a 1280×720 non-touch page (§3.3) |
| Browser CI (software GL) | `perf-frametime`, `perf-race-entry`, `perf-session-budgets` (hang ceilings), `race-cycle-memory` / `track-switch-*` / `session-quit-memory` (heap slope + WeakRef identity), `perf-boost-press-pipelines*`, `perf-idle-pipeline-churn` (exact pipeline counts), `perf-sw-cache-hit` (precache snapshot) | ms soft; counts hard | long tasks on race entry are collected (`RaceEntryProfile.blockMs`) but never asserted; no layout / style / GC count from a trace; renderer.info counts logged, never asserted; the resource-timing buffer overflows at 250 entries (§2.6) |
| Census CLIs | `tools/perf/*` (mesh, first-race, idle-pipeline, lit-wgsl, live-render-matrix, runtime-memory, garage), `tools/gfx/pass-census`, `gpu-mem-census`, `res-scale-census`, `frame-hitch`, `gpu-game-check` | report | the three `tools/gfx` censuses pin `apex26.tlxForceGL=1`, so per-pass draws, GPU bytes and resize settle are never measured on the three WebGPU backend — Bryce's path (§3.5); writeBuffer bytes per group and `createBindGroup` after warm are reported by `gpu-game-check`, gated nowhere |
| Real GPU | `gpu-census.yml` (macOS paravirtual Metal: fps, interval p50, governor tier), PHONE TEST › GPU TEST (phone, 7 phases, fill fit, mirror cost, drift) via skill `phone-bridge` | verdict on errors | no scheduled phone run; no GPU-side per-pass time anywhere (`gpuTimer` is the frame sum); no byte budget on `renderer.info.memory` |
| Size | `boot-load-budget` (raw bytes, 8,264,268 of 8,300,000), ratchets.json (lines, CSS classes, shell nodes…) | yes | raw not gzip (§3.6); per-circuit lazy bytes unratcheted (manifest comment "~27 KB each" is stale, average 42.8 KB) |

The blind spots group into four: **(i) nothing turns a Chrome trace into counts**, so layout, style, paint, GC and
long-task behaviour of the DOM HUD is unmeasured in CI although it is deterministic; **(ii) the WebGPU leg of TLX is
counted only by `gpu-game-check`/`frame-hitch` on the Mac census**, never by a CI gate; **(iii) the VM harness cannot see
DOM writes or a phone viewport**; **(iv) size budgets measure the wrong bytes** (raw, not what a phone downloads).

## 2. Measured here (ranked by what it would mean on Bryce's iPhone, TLX on WebGPU)

Setup: `__apex.race("monza")`, `go()`, `headless(true)` + full throttle, 844×390 DPR 2 touch; two 26–29 s traces
(`performance_start_trace`, no reload), five heap snapshots (menu → race 1 → menu → race 2 → menu). SwiftShader
renders on the soft-blit path, so the rAF cadence here is a clean 60 Hz (p50 16.7, p99 16.8 ms) and **the render and
GPU columns are not phone evidence**; the CPU, DOM and GC counts are what repeats on real silicon.

### 2.1 The DOM HUD schedules ~26 layouts and ~55 style recalcs per second during a steady race
`tools/perf/trace-census.mjs` (this PR) over both traces: UpdateLayoutTree 51.7–58.1/s, Layout 25.9–28.8/s, Paint
94–108/s, Commit 58/s; each Layout dirties 9.1 of ~135 objects, each recalc touches 6.8–8 elements. Who invalidated:

| site | count / 26 s | per s |
|---|---:|---:|
| `ScheduleStyleRecalculation` (no JS stack: engine-side, animations and the text mutations' style side) | 1312 | 50 |
| `InvalidateLayout` ← `hText` `js/ui/hud.js:79` (speed digits, time, gaps) | 700 | 27 |
| `ScheduleStyleRecalculation` ← `hStyle` `js/ui/hud.js:81` (rpm fill, bars) | 171 | 6.6 |
| `live-region.js:82`, `updateHud` 1871/1872, `hud-damage.js:61`, `announce-banner.js:54`, `towerGapsPaintedClash` 671 | ≤ 10 each | — |

A 3 s MutationObserver census agrees: 245 mutations (94 attribute, 146 text), led by `hud-speed-n` 85 and
`hud-rpm-fill` 82. The HUD agent's reading (confirmed): `#hud-tach` has `contain: strict` (`css/hud.css:357`) but
`#hud-speed` / `#hud-speed-n` have no `contain`, so each km/h change invalidates layout outside its slot. The cost
here is small (Layout max 3.5 ms, mean 0.38 ms on a 2-vCPU box) and **a WebKit number is needed before anyone calls it
a win**; what matters for this lane is that the count is exact and cheap to gate (§4.1). The HUD agent's claim that the
tyre fill transitions "every step" was REFUTED by the verifier: `hStyle` skips equal writes and the percent is whole-number.

### 2.2 GC pressure: 67 scavenges in 26 s on the second race, none over 6.3 ms
Race 2 trace: 67 MinorGC (2.6/s, 60 ms total, max 6.2 ms), 0 MajorGC. Race 1 (heap still large from the build): 6
scavenges, 2 MajorGC (26.6 ms, max 13.4 ms) plus 473 incremental-marking slices (58 ms) and 1177 CppGC sweeps (58 ms).
At the VM's 130–190 KB/frame this is one scavenge every ~23 frames; a phone's smaller young generation scavenges more
often. **Scavenges per 1000 frames is a count the trace census gives for free** and the per-frame allocation budget
cannot (§4.1). Allocation itself: `(garbage collector)` is 0.1–0.2 % of samples.

### 2.3 No JS-heap growth across one race → menu → race → menu cycle on the WebGPU leg
Heap snapshot diffs (chrome-devtools `compare_heapsnapshots`):

| pair | size delta | what moved |
|---|---:|---|
| menu (fresh) → menu after race 1 | +58.1 MB | warm-up: `JSArrayBufferData` +54 MB (+1976), `(compiled code)` +7 MB, `GPUBuffer` +481, `Float32Array` +1919 |
| menu after race 1 → menu after race 2 | **−0.37 MB** | `GPURenderBundle` +81 (502 new / 421 freed), `GPUTextureView` +81, ~2.9 k closure scopes added and 0 removed (~100 KB), `LayoutShift` entries +51 |
| race 1 → race 2 (in-race) | +0.05 MB | `(compiled code)` −2688 objects |

So the existing `race-cycle-memory` slope conclusion holds on this leg too. Two things the slope spec cannot see and a
heap-snapshot class count can: **WebGPU wrapper objects** (`GPUBuffer`, `GPUTexture`, `GPUTextureView`,
`GPURenderBundle`, `GPUBindGroup` are heap classes in Chrome, countable on SwiftShader) and the **closure-scope
rows that only ever grow** (same shape in both diffs: 552, 544, 344, 295, 229 contexts per cycle). Two cycles cannot
tell a plateau from a slow leak; §4.3 proposes the three-cycle class-count census.

### 2.4 LoAF attribution is useless for the game tick, and useful for race entry
Chrome's Long Animation Frames API (`__apex.perf().loaf`) attributed 18 of 25 entries ≥ 50 ms to
`js/xr/xr-boot.js` (confirmed: `xr-boot.js:155` defines the rAF callback the tick runs in, so every long game
frame is "xr-boot"). In the same ring the **race-entry** frames were attributed correctly because they run outside the
tick: `tracks.js` 104 ms, `game.js` 258 ms (188 ms blocking), then 13 consecutive frames of 105–200 ms from
`js/car/car-draw.js` (livery/mesh warm) over ~2.2 s before lights-out. That is the "laggy for the first few seconds"
report in numbers, from an API the phone's Safari does not have (Chrome 123+ only) but CI's Chromium does. §4.2
proposes the gate; the fix lane (if any) is lane A's.

### 2.5 The profiler itself is the worst frame in every trace
`CpuProfiler::StartProfiling` costs 602–665 ms on the main thread (`V8.StackGuard` max 672 ms) and lands in the
governor's `open.maxMs` (683 ms, `slow: 4`) and in `frameTimes.maxMs`. Any spec that starts a CDP trace or profile
after `go()` records a fake worst frame. With `measure:true`, PerfSpans emitted 15,495 `UserTiming::Measure` events
(527/s, 223 ms wall, ~9 % of CPU samples in `measure`) — but a direct micro-benchmark shows `performance.measure`
with the `detail.devtools` object costs 3.1 µs per call when no trace is attached (1.2 µs without detail), i.e. ~28
µs/frame for nine spans: the overhead is a **tracing** artefact. Rule for any new trace-based gate: arm the trace,
then `race()`, and exclude the first 60 frames; never read `open` or `frameTimes` from a traced run.

### 2.6 Second visit is fully service-worker served; the resource-timing buffer is too small to prove it
Reload with the worker active: 250 `PerformanceResourceTiming` entries, every one `transferSize 0`, FCP 664 ms,
`load` 2.4 s, `workerStart` 5.3 ms — and `document.scripts.length` is 431 (334 shell tags + lazy injects). The buffer
is Chrome's default 250; nothing calls `performance.setResourceTimingBufferSize` (only `tests/specs/debris.spec.js`
does, to 3000). Any boot measurement that reads resource timing (bytes on the race-entry path, SW hit ratio, duplicate
fetches) is truncated at 250 today. One line in `js/core/log.js` fixes the instrument (§4.5).

### 2.7 Steady-race CPU self time, by module (both traces agree)
Non-idle samples: `js/game.js` 1.5–1.6 % (`updateCar` 0.4, `updateCarLateral` 0.2, `update` 0.2), `collide.js` and
`ai-drive.js` 0.4–0.5 % each, `hud.js` 0.4–0.5 %, `tyre-model.js` 0.2–0.3 %, `audio/engine.js` 0.2 %, then
`race-control`, `spline`, `pit-lane`, `crowd`, `race-facts`, `rivals` ≤ 0.2 %. The ranking matches
LIVE-DEBUGGER-PHONEPERF PP-18 (VM) and adds nothing new; it is recorded so the next trace has a baseline shape. Native
`set data` (0.5–0.7 %), `setProperty`, `getBoundingClientRect` and `querySelectorAll` (0.1 % each) are the DOM HUD.

## 3. What the code hunters found that no test measures (verified rows only)

1. **Allocation census is monza-only, cold-JIT, cruise-only** (`vm-alloc-census.mjs:30`, CONFIRMED). The physics
   hunter measured spa cruise at 128–172 KB/frame against monza 82–109 and singapore ~78 in one warm process, and a
   2× cold-vs-warm effect (monza first race 101–190, second 82–109). A spa-only or start-phase regression passes today.
2. **Car-count scaling is never measured.** `collide.js:786` `useBuckets = ranked.length > 12`: a 12-car field runs
   all-pairs and does more pair work than 13 or 22 (reproduced by the verifier in the VM: `netPlay.owns` calls per
   step 22 cars 82, 13 cars 37, **12 cars 160**, 6 cars 42). A count ladder over N = 6..22 is an exact gate (§4.4).
3. **The VM DOM stub counts nothing** (`game-vm.cjs:142-221`, MutationObserver inert at :530) and runs a 1280×720,
   `maxTouchPoints 0` page (:444, :457), so no VM test can pin HUD writes per tick or forced layouts, and the phone
   touch paths (`phoneFitStampSync`, `_hitPedalSteer`) never run in a gate.
4. **Deterministic AI counters exist but are unused**: `Tracks.curvature` 156.5 / 146.1 / 133.7 calls per step and
   `Tracks.bankAngle` 51.5 / 20.6 / 33.5 on monza / monaco / spa (21 AI; the look-window cache at `game.js:5399`
   refills on every node change rather than shifting, CONFIRMED), `Tracks.sample` ~47, `wallAt` ~88 per step. These
   repeat exactly with the seeded field.
5. **Three `tools/gfx` censuses force WebGL2** (`pass-census.mjs:73`, `gpu-mem-census.mjs:54`,
   `res-scale-census.mjs:50`, CONFIRMED): per-pass draws/triangles, GPU bytes and scale-change settle are unmeasured
   on the three WebGPU backend. `memState().calls` reads `renderer.info.render.calls`, which r187's `Info.reset()` never
   zeroes (a lifetime count; `frameCalls` is the per-frame one — CONFIRMED).
6. **Size budgets count raw bytes.** `boot-load-budget.test.mjs:45` sums `statSync` (8,264,268 of 8,300,000); the
   eager scripts are 2,886,308 B gzip / 2,469,275 B brotli; eager CSS 1,425,407 raw / 459,829 gzip; LAZY_AUDIO 629 KB
   raw (includes `spotify.js` 69 KB for everyone); per-circuit lazy bytes unratcheted (monaco 108 KB raw / 35 KB gzip).
7. **Race entry long tasks are collected and never asserted** (`race-entry-profile.js:182,435`; the spec's only
   assertion is `wallMs` under STRICT — CONFIRMED; the spec does not even annotate `blockMs`).
8. **PNG unfiltering of the asset pack runs on the main thread** one layer per task (`assets.js:245-247`; the worker
   lane is off unless `apex26.packDecodeWorker=1`). Node micro-bench: normal-256 85 ms total, worst layer 14.9 ms;
   phone estimate 4–6× slower. Nothing pins layer bytes or the filter types.
9. TLX WebGPU rows from the render hunter, code-traced and plausible, none measured here (software adapters skip the
   batches): writeBuffer **bytes** per buffer group per frame (`census-verdict.mjs:233` reports, no gate; object UBO
   bytes should equal drawCalls × stride), `createBindGroup`/`createBuffer` after warm in an idle window (the
   pipeline-churn spec's twin), post-chain byte estimator vs `renderer.info.memory.texturesSize`, shadow-target
   colour attachment `storeOp` on WebGPU (the WebGL side has `S.colorDiscards`, the WebGPU side nothing), env-probe
   draws per face (`softContent("env")` clears instead of drawing on software, so a software census reads 0), warm
   coverage as a set difference (pipelines drawn in N laps minus pipelines compiled before lights-out), the lamp-grid
   `writeTexture` height latch (`tlx.js:1813-1826`: 16 KB vs 64 KB per upload, unpinned).

## 4. Proposed tests and harnesses

Each row: what it catches · cost · where it runs. "Count" rows are hard gates on any rasteriser; "ms" rows are reports.

### 4.1 Trace census gate (built here: `tools/perf/trace-census.mjs` + `tests/unit/trace-census.test.mjs`)
A Chrome trace → counts: layouts / style recalcs / paints per second, the invalidation call sites with their top
frame, GC scavenges and majors per second with max pause, long tasks, sampled self time by function and file, and the
trace's own overhead. Verified on the two live traces (`seconds` from main-thread complete events only, so metadata
rows do not stretch the window). **Next step (issue):** a browser spec that records 20 s of steady race through
`CDPSession Tracing.start` (categories `devtools.timeline,disabled-by-default-devtools.timeline,v8.cpu_profiler,
disabled-by-default-devtools.timeline.invalidationTracking`) and asserts counts against a committed baseline: `Layout`
per second ≤ baseline + slack, `InvalidateLayout` sites a frozen list (a new site is a reviewed diff), scavenges per
1000 frames ≤ baseline × 1.25, `longOver50ms` after frame 60 = 0. Catches: a HUD write that dirties layout per
frame, a new per-frame allocator, a long task. Cost: one SwiftShader shard job, ~90 s. Runs: CI shard (counts) and
the macOS census (same census, hardware). Pairs with `profile.mjs --mode trace`, which already writes the trace.

### 4.2 Race-entry long-frame gate (CI, Chrome only)
`RaceEntryProfile` already rings `longtask`; add `long-animation-frame` (scripts attribution works here because race
entry runs outside the tick, §2.4) and assert on `perf-race-entry`: blocking ms sum ≤ baseline × 1.3, longest frame ≤
baseline × 1.3, and the attributed script set ⊆ an allow-list (`tracks.js`, `game.js`, `car-draw.js`, three). Catches
the "first seconds lag" class with a name attached. Cost: edits to one spec and one helper. Runs: the existing
`perf-race-entry` group.

### 4.3 WebGPU object census across race cycles (heap-snapshot class counts)
Extend `race-cycle-memory` (or a sibling nightly): after each menu, `HeapProfiler.takeHeapSnapshot` and count the
classes `GPUBuffer`, `GPUTexture`, `GPUTextureView`, `GPURenderBundle`, `GPUBindGroup`, `GPURenderPipeline`, plus
`system / Context` scopes; assert cycle 3 == cycle 2 (exact) for the GPU classes and ≤ +5 % for scopes. SwiftShader
creates the same wrapper objects as Metal, so the count is real on CI. Catches a renderer-side retention the JS-heap
slope cannot see (§2.3 saw +81 render bundles and +81 texture views per cycle, unexplained). Cost: ~3 min per cycle
on software GL; nightly. Alternative without snapshots: `Runtime.queryObjects` on the `GPUBuffer` prototype.

### 4.4 Car-count and circuit ladders in the VM (exact counters)
One unit file, game VM, seeded: for N ∈ {6, 12, 13, 22} on monza, count `netPlay.owns` (or a debug pair counter) per
step and assert monotone in N (catches the 12-car all-pairs cliff and any broadphase regression); for monza, monaco,
spa count `Tracks.curvature`, `Tracks.bankAngle`, `Tracks.sample`, `wallAt` per step against committed exact numbers
(a new look-ahead read is +21 calls per step and invisible to ms or KB gates). Cost: ~10 s, no browser. Runs:
`tooling-fast`. Also extend `vm-alloc-census` SCENARIO to `[monza, spa, singapore]` with a per-circuit baseline and a
second warm race in the same process (steady-state row), per §3.1.

### 4.5 Measurement-integrity fixes (one line each)
- `performance.setResourceTimingBufferSize(2000)` in `js/core/log.js` (first script) so boot instruments see all 431
  entries; then a unit/VM check that no URL is fetched twice in a session and a spec row for SW hit ratio.
- `profile.mjs`/spans: document that `open`/`frameTimes` are invalid in a traced run; have `--mode trace` start the
  trace before `race()` and drop the first 60 frames.
- `memState().calls` → `frameCalls` (the lifetime counter is misread as per-frame).

### 4.6 Size budgets in the bytes a phone downloads
`boot-load-budget`: add `MAX_EAGER_GZIP` (2,886,308 today) beside the raw cap; `MAX_EAGER_CSS_GZIP` (459,829);
ratchets for gzip(path + scenery) per circuit (cap at monaco 35,104) and for LAZY_AUDIO; a golden list of the
race-entry lazy file set from `game-vm` `record.scripts` (159 non-tag files, 3,330,535 B) so a new file on the race
path is a reviewed diff. Cost: unit VM, seconds. Brotli stays unmeasured until deploy-research confirms Pages serves it.

### 4.7 VM DOM probe and phone viewport
`createDom({ domProbe: true })` in `game-vm.cjs`: count writes per element and kind, flag a layout read while dirty
(`forced++` with the reader), and an `onSandbox` preset for 844×390 DPR 3 touch with an iPhone UA. Then
a HUD DOM-budget VM test (new file): steady tick forced ≤ 1, non-tick frame forced 0, writes per tick ≤ ratchet, on desktop and
phone844. Catches read-after-write thrash in any HUD module without a browser. Cost: a day of harness work.

### 4.8 WebGPU-leg censuses on Lavapipe
Give `pass-census`, `gpu-mem-census` and `res-scale-census` a `--webgpu` arm (drop `tlxForceGL`, Lavapipe args from
`tools/lib/harness.mjs`); commit per-circuit × camera × tier baselines of `frameCalls`, `drawCalls`, `triangles` per
pass and `renderer.info.memory.*Size`; add the writeBuffer-bytes-per-group and `createBindGroup`-after-warm counts the
render hunter listed. Exact counts, so a software adapter is a valid gate for everything except the batches it skips
(`skipBatches: true` on software: say so in the baseline). Cost: a CI Lavapipe shard, ~5 min.

### 4.9 GPU time per pass on real hardware
three r187: `WebGPURenderer({ trackTimestamp: true })`, `await renderer.resolveTimestampsAsync("render")` once per
frame, read `renderer.info.render.timestamp`. Wrap `renderer.render` to resolve after each pass and report mirror /
shadow / env / post shares. iOS WebGPU adapters expose `timestamp-query` (web3dsurvey: 100 %), WebGL2
`EXT_disjoint_timer_query_webgl2` does not exist on iOS, Chrome rounds to 100 µs. Surface it in PHONE TEST › GPU TEST
as `phases[].gpuByPass` and in `gpu-census.yml`. Catches a pass whose GPU share grows (mirror, env) which no CPU
count sees. Cost: a `tlx.js` hook behind `?gpuTimer=1`; phone run through skill `phone-bridge`.

### 4.10 A/B with a statistical floor, in one job
For ms gates that must stay ms (step time, race entry): interleave base and head ≥ 10 times in the same job, Welch's t
or Mann–Whitney at p < 0.01 plus a minimum effect (5 % and 0.5 ms), threshold calibrated from A/A runs. `profile.mjs
--base --repeat` already has the scaffolding (median + spread, "unproven" under 3 repeats); add the test and the
interleaving. Runs: a manual-dispatch CI job on PRs labelled `perf-ab`. Comment, never fail, for the first month.

## 5. Untried ideas (not measured; ranked by expected value)

1. **Scheduled real-iPhone run through BrowserStack's open-source plan** (free, 5 parallels; Playwright on real iOS
   Safari since June 2025): nightly `__apex.race("monza")` + 5-minute soak, record `frameTimes` p50/p95/p99,
   `renderer.info.memory.total`, `gpuTimer`, thermal drift as p50 of the last minute minus the first. The only route
   to iOS numbers without Bryce's hands. Needs an application and secrets (Bryce's decision).
2. **memlab-style scenario leak check** (Meta's `memlab`: action = race, back = menu; retained objects grouped by
   retainer path, with a `leakFilter` for `THREE.Texture` / `BufferGeometry` alive after quit). Reuses the race-cycle
   spec's driver; gives names instead of a slope.
3. **`Memory.getDOMCountersForLeakDetection`** (CDP; runs GC and drops caches first) per cycle: documents, nodes,
   listeners — exact, cheaper than a snapshot, complements `perf-vm-leak-cycles` which cannot see Blink's counters.
4. **Deterministic frame stepping in headless** (`chrome-headless-shell --enable-begin-frame-control`, CDP
   `HeadlessExperimental.beginFrame`): render exactly N frames per test, so draw-call and layout counts per frame are
   reproducible without timing at all. Unverified on current Chrome.
5. **Frame-pacing summary as the perf record** (from rAF timestamps: p50/p95/p99, % frames > 1.5 × display interval,
   max) emitted in `benchmark-action/github-action-benchmark`'s `customSmallerIsBetter` JSON with `adapter.info` and
   `isFallbackAdapter` in the same record, so SwiftShader and Metal rows never get compared. The history chart is free.
6. **iOS memory budget line**: WebKit's soft per-process limit is ~1.5 GB on non-Pro iPhones (WebKit bugs 277848,
   279637); gate `renderer.info.memory.total` + decoded PCM + JS heap under 1 GB on the phone record, warn in CI.
7. **E-divisive change-point detection** (Apache Otava / Hunter) over the perf-record history instead of per-PR
   thresholds: finds the commit where a slow drift started. Needs ~30 points of history first.
8. **`PressureObserver` (Compute Pressure API, Chromium)** as a CI "runner is busy" guard: skip the ms assertions
   when the host reports `critical`, instead of quarantining flakes.
9. **Event Timing / INP for touch controls** (`PerformanceObserver {type:'event', durationThreshold:16}`) on the
   steer and pedal buttons at 844×390: input-to-paint latency is the one perf number a phone player feels most and
   nothing records it.
10. **WebGPU Inspector** (Brendan Duncan's extension) frame captures of the Mac census as a manual tool for the §3.9
    rows; not CI.

## 6. Not run / limits
- No real GPU: every render/GPU number above is SwiftShader soft-blit (`skipBatches: true`, `softBlit: true`), kept
  only where it is a count.
- js-debugger `debugger_profile` was not used: the chrome-devtools trace carries the sampling profile and the hitch
  data, and one browser per session (AGENTS.md rule 5) made a second attach pointless. The `apex-lsp` pass was one
  `lsp_callers` on `hText` (27 uses: `paintInstruments` ×4 per frame, `updateHud` ×22 per tick).
- Two race cycles, not three: §2.3's +81 GPURenderBundle / +81 GPUTextureView per cycle is a question, not a leak.
- No browser groups were run locally (rule 5); the pushed branch gets the fast tier plus a selected shard.

## Handoff
Issues filed from §4 (all `area:perf`): #4776 trace-census gate (§4.1), #4777 race-entry long frames + PNG
unfilter cap (§4.2), #4778 WebGPU wrapper-object census (§4.3), #4779 VM car-count / AI-count ladders + multi-circuit
alloc census (§4.4), #4780 measurement integrity (§4.5), #4781 gzip budgets (§4.6), #4782 VM DOM probe + phone preset
(§4.7), #4783 Lavapipe arm for the TLX censuses (§4.8), #4784 GPU time per pass (§4.9), #4785 `needs-decision`: a
nightly real-iPhone run through a device cloud (§5.1). The two subagent-only sections (§3.9 render rows, §5) carry no
measurement from this session; a worker should measure before fixing. Re-measure §2.1–2.2 after any HUD or
allocation change with `node tools/perf/trace-census.mjs <trace>`.
