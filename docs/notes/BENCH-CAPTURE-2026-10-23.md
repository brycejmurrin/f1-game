# BENCHMARK profiling capture (apex26.bench/2), 2026-10-23

Bryce's ask (OrchA 26, 2026-10-23): "make these benchmark store way more info for profiling like heap, logs, gpu, etc".
`js/perf/bench-capture.js` (BenchCapture) records it. `js/perf/bench-run.js` calls it from three places: legStart/legEnd around each leg,
`step()` inside `measure()`, and `budget()` at finish. A leg that died under a reload gets `leg.crumb` from `recover()`.

## Where it lands in the results file
- `legs[i].capture`: `device`, `gpu` (adapter, timer, per-render-call `passes`), `start` / `end` memory, `compiles`
  (`entry` = until state "race", `after`, `top`), `longTasks`, `loaf`, `rafGaps`, `entry` (RaceEntryProfile snapshot),
  `errors`, `events` (visibility/pageshow/pagehide/resize), `logs`, `timeline` (every 5 s), `uaMemory`, `observers`.
- `legs[i].steps[j].cap`: heap, renderer geo/tex/programs/calls/triangles, `gpuPasses`, compiles, errors and long tasks since the previous step.
- `legs[i].crumb`: the last breadcrumb (`apex26.benchCapture`) of a leg the page never finished.
- `plan.capture`: `{ bytes, trimmed }` from `budget()`. The cap is 900 kB: logs are trimmed first, then the timeline, then step caps.

## What WebKit / Safari exposes (research before build)
| signal | iPhone Safari 27 | source |
|---|---|---|
| WebGPU timestamp-query | exposed on Bryce's phone (`webgpuTimestamp: true` in his GARAGE file). WebKit removed it in May 2024 and restored it for M3+/iOS in Oct 2025 | https://bugs.webkit.org/show_bug.cgi?id=268244, https://bugs.webkit.org/show_bug.cgi?id=299487, https://lists.webkit.org/pipermail/webkit-changes/2024-May/301576.html |
| Long Animation Frames | unsupported (Chromium 123+ only), recorded `"unsupported"`. `longtask` is recorded where present | https://developer.chrome.com/docs/web-platform/long-animation-frames |
| measureUserAgentSpecificMemory | needs crossOriginIsolated (COOP+COEP). GitHub Pages sends neither header, and the API is Chromium-only | https://developer.mozilla.org/docs/Web/API/Performance/measureUserAgentSpecificMemory, https://web.dev/articles/monitor-total-page-memory-usage |
| performance.memory | Chromium-only; WebKit returns `"unsupported"` | MDN |
| Battery Status | unsupported in every Safari | https://caniuse.com/battery-status |
| GPUAdapter.info | vendor/architecture can be empty strings on Apple (trimmed). Recorded as given | https://developer.mozilla.org/en-US/docs/Web/API/GPUAdapterInfo |
| thermal / memory pressure | no web API on iOS: recorded `"unavailable"`. PressureObserver (Compute Pressure) is read where it exists (Chromium) | https://developer.mozilla.org/en-US/docs/Web/API/Compute_Pressure_API |

## Per-pass GPU time
three r186 keeps resolved timestamps in `renderer.backend.timestampQueryPool.render.timestamps`, keyed
`r:<frameCall>:<ctx>:f<frame>`. `passTimes()` reads the newest frame and groups it by render call (scene, mirror, shadow, post…),
because three does not name its passes. The GPU timer is switched on for the length of each leg where `gpuTimer().supported` is true,
then put back. This is read-only: it never calls `resolveTimestampsAsync`.

## Not personal data
The capture stores no storage values or input, and no URL query strings or hashes (`clean()`). Messages are capped at 200 characters.

## Evidence limits
A desktop/SwiftShader boot shows the shape only. Its numbers are not phone evidence.
