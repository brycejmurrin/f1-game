# Profiling Apex 26: CPU, retained memory and graphics

Use the existing Apex tools first. Extend their bounded operations where they
leave an evidence gap; installing another browser controller does not fill that
gap. This guide is a diagnostic design, grounded in the repository at `4bc2f4b`
and primary documentation checked on 2026-10-18. It records no new runtime
measurement, leak finding, GPU result or optimization win.

## Choose the measurement before the tool

| Question | Existing entry point | What the evidence can establish |
|---|---|---|
| Which JS subsystem consumes time? | `apex_profile`, `tools/perf/profile.mjs`, `apex_profile_query` | CPU samples and explicit spans; render span includes submission/synchronization |
| What interrupts a frame? | `profile.mjs --mode hitch` or `--mode trace` | Scheduling, GC, layout and user-timing correlation; inspect the saved trace |
| Do circuit changes retain old worlds? | `tools/gfx/mem-census.mjs` | After-GC heap, track WeakRefs, decoded audio and available TLX object counts |
| Are timers or cancellation owners left behind? | `tools/check/lifecycle-census.mjs` | Deterministic VM cleanup; no DOM, real networking or GPU evidence |
| Which allocations remain, and who retains them? | Memory census `--snapshot`, Chrome Memory panel | Snapshot comparison and retaining paths for surviving objects |
| Is allocation churn triggering GC? | Heap allocation sampling or allocation timeline | Allocation sites during a bounded workload; retention and churn require different settings |
| Are DOM nodes/listeners accumulating? | `debugger_listeners`, `debugger_instances`; CDP DOM counters | Scoped instance/listener growth; snapshots locate a retaining owner |
| What graphics resources are requested? | `tools/gfx/gpu-mem-census.mjs`, `gl-object-census.mjs`, `pass-census.mjs` | Instrumented GL allocations/objects/pass counts, with coverage limits |
| Is the real GPU the bottleneck? | `__apex.gpuTimer`, hardware renderer census | Valid GPU timer samples on the actual bound backend/device |
| Why is a draw wrong or redundant? | Renderer hooks, three Inspector; optional SpectorJS capture | Draw commands, shaders and state; capture overhead invalidates timing comparisons |
| Which branch/local causes a defect? | Separate `js-debugger` MCP | Exact source location, stack, scopes, conditional breakpoint/logpoint evidence |

Run from the repository root. Read [AGENTS.md](../../AGENTS.md),
[agent surface](../AGENT-SURFACE.md), [debug hooks](../DEBUG-HOOKS.md), and the
`playwright-probe`, `renderer-debug`, `mcp-probe` or `js-debugger` skill for the
chosen operation. Parent sessions own browsers. Never run a browser tool beside
a Playwright suite; use the shared lock, one disposable profile, and clean up
the owned session. Check `apex_status`, `/proc/loadavg`, and active processes
before interpreting timeouts or timing. Do not modify saved player preferences.

## Memory is several separate budgets

**JS reachability.** Compare after-GC snapshots at the same lifecycle phase.
Constructor counts, shallow size, retained size and a root-to-object retaining
path answer different questions. A detached DOM node is a lead, not by itself
proof that the game leaks. DevTools console results can retain inspected
objects: avoid logging whole worlds or arrays during a census. [Chrome heap
snapshot guide](https://developer.chrome.com/docs/devtools/memory-problems/heap-snapshots).

**CPU backing storage and native objects.** A small typed-array wrapper may own
a large backing store. The current `Runtime.getHeapUsage` response contains
`usedSize`, `totalSize`, `embedderHeapUsedSize` and `backingStorageSize`; the
last field covers array-buffer and external-string storage. It is isolate-wide,
not a per-expression or per-scene total. Feature-detect fields, retain raw units,
and do not sum overlapping accounting categories into an invented process RSS.
[Current Runtime schema](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/json/js_protocol.json).
The game census separately counts reachable decoded `AudioBuffer` PCM: JS heap
alone misses this budget. Track typed arrays, image bitmaps and audio ownership
separately from GPU copies.

**DOM and listeners.** Add plain `Memory.getDOMCounters` for documents, nodes
and JS event listeners at each matching checkpoint. These are renderer counters,
not an attribution to a particular panel. Avoid `prepareForLeakDetection` and
`getDOMCountersForLeakDetection` in a normal reproduction: preparation terminates
workers and drops internal caches. Memory pressure simulation affects processes
beyond the narrow scenario. [Memory domain and current browser
schema](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/json/browser_protocol.json).
Follow counter growth with the existing scoped `debugger_listeners` and a
snapshot retaining path; retain unsupported-method errors rather than zeroes.

**Graphics ownership.** Removing a mesh does not release its geometry/material;
textures and render targets have separate disposal. Shared resources need a
known final owner; disposing them on every transition can cause recompilation.
`ImageBitmap.close()` frees its CPU side when no consumer needs it. Some
three.js internal resources remain cached and reused after scene cleanup.
[three.js disposal guide](https://threejs.org/manual/pages/how-to-dispose-of-objects.html).
Read TLX `renderer.info` through the existing census. Current upstream `Info`
lists counts and byte estimates, but the checked-in vendored revision must
actually expose a field before a report uses it. These statistics are engine
accounting, not driver residency. Preserve frame-reset semantics for multipass
counts. [Current three.js Info reference](https://threejs.org/docs/pages/Info.html).

## Reproducible memory protocol

Start with a browser-free ownership check; this is a recommended command, not
a recorded result:

```sh
node tools/check/lifecycle-census.mjs --track monza --seed 1 --cycles 3 --out artifacts/profiling/lifecycle --plan
node tools/check/lifecycle-census.mjs --track monza --seed 1 --cycles 3 --out artifacts/profiling/lifecycle
```

For track retention, use one browser and repeat the same two circuits, mode,
backend and settlement budget. Three cycles let the final comparison exclude
the first warm-up cycle:

```sh
node tools/gfx/mem-census.mjs --backend three --mode picker --tracks monza,monaco --cycles 3 --settle 10 --snapshot artifacts/profiling/memory/heaps --json artifacts/profiling/memory/census.json
```

Treat that as one bounded census, with an outer job deadline of 15 minutes and
no automatic retry. Stop/report partial evidence at the deadline; a timed-out
boot is not a leak. Repeat the `race` path only as a separate, justified run.
The CLI currently compares the last two cycles; sustained growth across more
visits needs the shared `sustainedGrowthMB` helper or an explicit analysis.
Do not claim the CLI already applies that helper. More than one reachable
built track is its own failure signal. Inspect whether a duplicate row is a
real distinct object before reporting ownership attribution.

Choose a heap-growth threshold before a comparison using a known-good repeated
baseline; `--max-growth-mb N` is available once that threshold exists. Without
it, `verdict:ok` does not establish that every memory category is bounded. The
tool records page errors but does not make their absence part of its exit-code
oracle: inspect `errors` and `summary.pageErrors` independently. Missing heap
or TLX fields stay unknown, never zero. Require the same action to complete and
the same circuit/backend to bind at each checkpoint.

If retained growth persists, compare cycle snapshots in Chrome Memory, find
the constructors and retaining owners, then repeat the minimal action and its
inverse. First-load caches, shader compilation, bounded pools and delayed
finalization explain steps or plateaus; recurring post-warm-up growth plus a
retaining owner makes a stronger case. Browser closure releasing everything
does not establish correct cleanup during an ongoing game session.

For churn rather than retention, use a proposed allocation mode around one
20-second deterministic scenario, starting with a 32 KiB sampling interval.
`HeapProfiler.startSampling` defaults to objects alive at sampling end; request
minor/major collected-object inclusion only for the separate churn recording.
Always stop sampling in cleanup. Full allocation tracking/snapshots perturb the
workload more, so never use that recording as an uninstrumented FPS baseline.
[HeapProfiler protocol](https://chromedevtools.github.io/devtools-protocol/tot/HeapProfiler/),
[Chrome allocation timeline](https://developer.chrome.com/docs/devtools/memory-problems/allocation-profiler).

## CPU, frame hitches and JS debugging

Keep deterministic inputs and a fixed renderer, viewport, track, car count,
weather, camera and render-scale policy. Use the existing profiler rather than
creating a second harness:

```sh
node tools/perf/profile.mjs monza --mode spans --frames 40 --repeat 3 --json
node tools/perf/profile.mjs monza --mode cpu
node tools/perf/profile.mjs monza --mode trace --frames 40
```

Run those sequentially, only when each additional view is needed. Profiles go
under `artifacts/profiles/`; pass the actual returned filename to
`node tools/perf/query.mjs <file> --top 20 --json`. `--base <ref>` supports a
like-for-like comparison for applicable modes; inspect the CLI's supported
mode semantics first. Fewer than three repeats or a delta inside the observed
spread is unproven. A fixed rAF count does not guarantee identical work on a
variable-rate live simulation; record scenario state alongside the profile.

Use CPU bottom-up/call trees for hot JS and traces to correlate GC, tasks,
style/layout and `apex:*` marks. Cold build/compile latency and warm driving
are separate measurements. CPU samples do not directly measure GPU execution;
readbacks and synchronous GL calls can expose waits. [Chrome Performance
reference](https://developer.chrome.com/docs/devtools/performance/reference),
[CDP Profiler](https://chromedevtools.github.io/devtools-protocol/tot/Profiler/).

For a future trace extension, `Tracing.start` can return a stream. Drain it
after `tracingComplete`, close it, and record `dataLossOccurred`; truncated or
wrapped traces need explicit partial status. Discover supported categories,
exclude screenshots by default, and use a bounded recording/buffer. Runtime
metrics come from `Performance.enable/getMetrics`; record only returned fields,
their collection domain and checkpoint deltas. [Tracing
protocol](https://chromedevtools.github.io/devtools-protocol/tot/Tracing/),
[Performance protocol](https://chromedevtools.github.io/devtools-protocol/tot/Performance/).

Use the separate [project debugger](AGENT-JS-DEBUGGER-MCP.md) for causality:
attach an exact local target, find its parsed script URL, set a narrow
conditional breakpoint, inspect the current pause token/scopes, resume and
detach. Do not benchmark while paused or while hot-loop logpoints are enabled.
Non-pausing listener/instance probes already exist; keep reads bounded and
release retained debugger handles. Browser/worker targets require separate
attribution. Chrome also supports exception, DOM and event-listener breakpoints.
[Chrome breakpoint guide](https://developer.chrome.com/docs/devtools/javascript/breakpoints).
The custom `js-debugger` MCP is not Microsoft's Debug Adapter Protocol server;
an editor may separately use [VS Code's JS debugger](https://github.com/microsoft/vscode-js-debug).

## GPU memory, passes and graphics performance

For a bounded allocation census on the existing TLX WebGL2 path:

```sh
node tools/gfx/gpu-mem-census.mjs monza --warm 10 --visits monaco,monza --json artifacts/profiling/gpu-allocations.json
```

This defaults to stubbed shader compilation/linking. It measures instrumented
allocation requests and create/delete counts, not rendered correctness or GPU
speed. Label `realLink:false` in evidence; `--real-link` needs its own runtime
budget. The wrapper covers a specific format/upload set and estimates bytes;
driver tiling/padding, drawing buffers, residency and unknown formats are outside
its total. Its `--mobile` forces the game tier, not a physical phone or touch
input. It forces TLX to WebGL2 and says nothing about WebGPU allocations.
Single-visit net memory is not a leak test. Revisit the same circuit after
warm-up, inspect object types, and account for intentionally shared caches.

For hardware frame time, prefer the existing opt-in `__apex.gpuTimer(true)`.
The WebGL extension requires an available query and non-disjoint state; poll on
later frames, discard invalid readings and delete completed query objects.
Do not use `gl.finish`/readPixels to manufacture an elapsed-GPU estimate.
[Khronos timer specification](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/).
Report valid sample count, invalid/unsupported count, median/tails, actual
backend and `software`. The repository timer's `-1` under software GL is
unavailable, not fast. The existing hardware `gpu-census.yml` workflow and
physical-device reproductions are the follow-up path; no workflow dispatch is
implied by reading this guide.

On WebGPU, pass timestamps need the optional `timestamp-query` feature on the
device. Integrate with the existing renderer/device; requesting another device
would measure a different workload. Resolve timestamps asynchronously and avoid
mapping/waiting in the hot render loop. [GPUQuerySet
reference](https://developer.mozilla.org/en-US/docs/Web/API/GPUQuerySet).
Chrome documents 100 microsecond quantization and development-only flags that
disable it. Record flags and quantization; do not compare development-flag
results to a normal player's browser without qualification. Adapter memory
heap capacity is not the game's live VRAM usage. [Chrome WebGPU developer
features](https://developer.chrome.com/docs/web-platform/webgpu/developer-features).

Use frame captures when the question is pass count, redundant state or a shader,
not timing. SpectorJS can capture a selected WebGL context and JSON command
state; `spyCanvases` must precede relevant uploads for added resource details.
Quick captures omit thumbnails. Its official repository now includes an MCP,
but an independent browser/session controller must not run beside Apex's owner.
A future pinned, opt-in library capture within the existing owned session is
the closer fit. It is WebGL inspection, not a WebGPU frame debugger or a VRAM
resident-set meter. [SpectorJS API](https://github.com/BabylonJS/Spector.js/blob/master/documentation/apis.md),
[official MCP](https://github.com/BabylonJS/Spector.js/blob/master/mcp/README.md).
Start with one frame, at most 10 seconds, no thumbnails; treat instrumentation
failures and capture overhead explicitly. Do not add the library to the shipped
game solely for diagnostics.

## Recommended implementation contract

The bounded facade is `apex_diagnostics`: `memory_census`,
`gpu_memory_census`, `renderer_probe` and `vm_lifecycle` reuse existing
producers. Check the live `apex_catalog` and `dryRun` output for the installed
schema and exact supported fields; an older host attachment may not expose it.
The additional sampling, streaming and hardware recommendations below remain
proposed interfaces, not a claim that every mode is implemented.

1. Add named census routes to Apex's existing job system: `lifecycle`,
   `track-memory`, `gpu-allocation`. Reuse their CLIs; keep one source of truth.
   Validate catalog circuit IDs, backend enums, 1–3 tracks, 1–4 cycles (track
   growth comparisons require at least 3), settlement 0–10 seconds and an outer
   deadline no greater than 15 minutes. VM cycles can retain their existing
   1–12 bound. No arbitrary argv, URLs or CDP method passthrough.
2. Add an optional checkpoint collector for feature-detected heap usage, plain
   DOM counters and renderer counters; return support/error metadata per metric.
   Capture exact bound backend and instrumentation settings. Do not silently
   substitute heap size for total browser or GPU memory.
3. Add allocation sampling only with a narrow scenario and explicit retention
   versus churn mode: 1–30 seconds, bounded sample/stack settings, cleanup in
   `finally`. Snapshot output must stream to artifacts, enforce a byte/time
   budget, and return links/summary instead of a heap payload in tool text.
4. Preserve one lock owner across launch, recording and cleanup. Job status and
   cancellation must work during a recording. Killing a client or timing out an
   MCP request is not proof that browser execution stopped.
5. Reports need source SHA/dirty identity, browser/protocol version, actual
   backend/API, device/software status, viewport/tier, scenario/seed, warm-up,
   repeats/limits, instrumentation, page errors, raw artifact links and cleanup.
   Every claim gets `Pass`, `Fail`, `Skip` or `Unproven` plus its oracle. Reject
   incomparable environments. Never promote allocation counts to GPU timing.

Contract tests should cover bounds, paths/symlinks, unsupported metrics, output
truncation, interrupted recording and lock cleanup. Parent-only browser smoke
must demonstrate actual report creation and cancellation; browser-free tests
cannot establish those behaviors. Hardware timing and long-session leakage
remain separate validation gates. None of these diagnostics starts an
optimization loop or grants authority to merge or deploy.
