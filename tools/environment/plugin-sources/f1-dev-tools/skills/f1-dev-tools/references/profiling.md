# CPU, memory, graphics and JS debugging

Read the checkout’s `playwright-probe`, `renderer-debug`, `mcp-probe` and debugger instructions for the chosen operation. Check `tools/list` first. Existing `apex_profile`/`apex_profile_query` remain the profiling implementation; capability-detected `apex_diagnostics` supplies selected bounded local census routes. A package update does not add missing checkout tools. Use that tool’s current capabilities/schema rather than inventing mode names. Keep arbitrary shell/eval and general test execution out of MCP.

## Bounded diagnostic operations

When `tools/list` exposes `apex_diagnostics`, call `{"op":"capabilities"}` first. The current bounded routes are:

| Kind | Example run arguments beyond `op:"run"` | Saved report |
|---|---|---|
| Browser-free owner cleanup | `{"kind":"vm_lifecycle","track":"monza","cycles":3,"seed":1,"out":"artifacts/diagnostics/vm-unique"}` | `census.json` |
| After-GC track retention | `{"kind":"memory_census","tracks":["monza","monaco"],"cycles":3,"mode":"picker","backend":"three","settle":2,"out":"artifacts/diagnostics/memory-unique"}` | `report.json` |
| Requested GPU allocations | `{"kind":"gpu_memory_census","track":"monaco","visits":["monza","monaco"],"warm":30,"realLink":false,"out":"artifacts/diagnostics/gpu-unique"}` | `report.json` |
| Backend boot/state evidence | `{"kind":"renderer_probe","backend":"three","track":"monza","cam":"park","out":"artifacts/diagnostics/render-unique"}` | `state.json` |

Use fresh/empty output directories for each run. Runs return shared job IDs; poll `apex_job_status`, cancel with `apex_job_cancel`, and wait for exit. `run.json` records source/arguments/limits/evidence. Memory cycles are bounded to 3–5 and tracks to 1–4; no raw heap snapshots are exposed through this tool. Renderer probes get one attempt and establish boot/errors, not hardware speed. Preview the discovered plan/limits before starting. Query saved results without launching a browser:

```json
{"op":"query","kind":"memory_census","file":"artifacts/diagnostics/memory-unique/report.json","limit":12}
```

An optional `compare` names the matching saved report from the other revision/run. Preserve identical scenarios before interpreting the comparison. Do not reuse the example output names if they already contain evidence. Full snapshots and allocation recordings remain documented manual follow-ups, not implemented MCP capabilities.

## CPU and frame time

Use one fixed track, camera, car count, weather, viewport, backend and render-scale policy. Record cold build/compile separately from warm driving. Start a bounded baseline with `apex_profile`:

```json
{"track":"monza","mode":"spans","frames":40,"repeat":3,"target":"local"}
```

It returns a background job ID and owns the browser lock until completion. Poll `apex_job_status`; cancel with the discovered cancel tool and wait for exit before another browser task. Use `apex_profile_query` with the actual returned file path. CPU mode saves `.cpuprofile`; query bounded top-N self/total samples and optional function/file filters. Use `hitch` or `trace` only when the extra recording answers a specific question. `base` requests an applicable same-scenario git-ref comparison; inspect current mode support first. Fewer than three repeats, or a delta inside the observed spread, remains unproven. A fixed rAF count need not perform identical work in a live variable-rate simulation.

CPU samples and render spans do not measure GPU execution. Traces correlate tasks, GC, style/layout and game timing marks. Instrumentation perturbs work: never call a heap snapshot, paused breakpoint run or graphics capture an uninstrumented FPS baseline. See [Chrome Performance](https://developer.chrome.com/docs/devtools/performance/reference) and [CDP Profiler](https://chromedevtools.github.io/devtools-protocol/tot/Profiler/).

## Heap, memory and leaks

Choose the budget first: JS reachable objects, typed-array/external backing stores, decoded audio, DOM/listeners, and graphics resources have separate ownership/accounting. Do not sum overlapping counters into an invented process/VRAM total.

1. Start browser-free with the checkout lifecycle census for owner cleanup; this does not cover DOM or GPU lifetime. Capability-discover the diagnostics route and preview its plan.
2. For real track retention, use a fixed pair of tracks for at least three cycles at matching lifecycle checkpoints. Exclude the first warm-up cycle. Set one outer deadline, no automatic retries. Compare after-GC data and inspect console/page errors separately from the CLI exit code. A boot timeout is not a leak. Without a known-good growth threshold, an `ok` command verdict does not certify bounded memory.
3. If growth repeats, compare heap snapshots and inspect constructors, retained sizes and retaining paths. A detached node is a lead, not proof of a defect. Avoid logging complete worlds/arrays: DevTools console and debugger handles can retain them. Close scoped handles when finished. Full snapshots can be large and sensitive; retain them as local artifacts and return summaries, never raw dumps through MCP.
4. For allocation churn, record a separate bounded allocation sampling workload (for example 20 seconds). HeapProfiler sampling normally records survivors at recording end; minor/major collected-object inclusion is a different recording used for churn, not retained-growth evidence. Always stop sampling in cleanup. These allocation modes are a follow-up design unless discovered capabilities implement them.

Current CDP `Runtime.getHeapUsage` fields include `usedSize`, `totalSize`, `embedderHeapUsedSize` and `backingStorageSize` (array-buffer/external-string storage). Feature-detect fields; isolate-wide totals do not attribute memory to one panel. Plain `Memory.getDOMCounters` reports renderer documents, nodes and listeners; missing methods remain unknown. Do not automatically use `prepareForLeakDetection` or `getDOMCountersForLeakDetection`: they terminate workers and drop caches, altering the workload.

Sources: [heap snapshots](https://developer.chrome.com/docs/devtools/memory-problems/heap-snapshots), [current Runtime schema](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/json/js_protocol.json), [current Memory schema](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/json/browser_protocol.json), [HeapProfiler](https://chromedevtools.github.io/devtools-protocol/tot/HeapProfiler/).

## GPU allocations, rendering and graphics time

Discover bounded GPU/GL census routes and inspect the plan. The repository GPU-memory census defaults to stubbed shader compile/link: label `realLink:false` as allocation-only evidence. Requested GL bytes and create/delete counts are estimates, not driver residency or physical VRAM use. Unknown formats, padding, drawing buffers and driver overhead may be outside coverage. Single-visit net bytes are not a leak test; revisit after warm-up and account for deliberate caches. A forced mobile tier is not a physical phone.

For GPU execution, use the actual existing renderer/device and opt-in `__apex.gpuTimer` after reading current hooks. WebGL timer results require available queries and non-disjoint state; poll asynchronously and release completed queries. Never use `gl.finish`/readPixels to fabricate elapsed GPU time. Software GL, unsupported queries and `-1` timings are unavailable, not fast. Report backend, hardware/software, valid and invalid sample counts and tails. Hardware measurements require real hardware; a CI software renderer cannot establish player-device performance.

For WebGPU, `timestamp-query` is optional. Use the existing device and asynchronous resolution, not a separate device or a blocking hot-loop map. Record quantization and browser flags; Chrome documents 100 microsecond quantization and development flags that change it. Heap capacity is not the game’s live VRAM use. Frame captures answer draw/pass/state/shader questions; their overhead invalidates timing comparisons. Optional SpectorJS captures belong inside the existing owned WebGL session, not a second browser MCP controller; they do not cover WebGPU or VRAM residency.

Removing a mesh does not dispose geometry, materials, textures or render targets. Shared assets need a known final owner; repeated disposal can cause recompilation. Close CPU-side ImageBitmaps only after their consumers are done. Engine caches and renderer counters are accounting, not residency; feature-detect the vendored engine’s fields and preserve multipass reset semantics.

Sources: [Khronos timer query](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/), [Chrome WebGPU features](https://developer.chrome.com/docs/web-platform/webgpu/developer-features), [three.js disposal](https://threejs.org/manual/pages/how-to-dispose-of-objects.html), [SpectorJS API](https://github.com/BabylonJS/Spector.js/blob/master/documentation/apis.md).

## Source-level JS debugging

Use the existing `apex-lsp` for definitions/references before stepping runtime code. For stack/locals, read `docs/research/AGENT-JS-DEBUGGER-MCP.md` and use the separate `js-debugger` connection (`debugger_*`). Attach to the exact target in the one existing disposable, parent-owned browser; the debugger does not launch Chromium. Do not attach during another browser-owning job or Playwright suite.

Find the parsed script URL, use a narrow conditional breakpoint or bounded logpoint, inspect the current pause token/scopes, resume and detach in cleanup. Do not benchmark while paused or while hot-loop logpoints are active. Use scoped listener/instance probes for growth attribution and release retained handles. Workers/other targets require separate attribution. This custom MCP is distinct from an editor’s Debug Adapter Protocol server. If only CLI is available, use the checkout’s persistent debugger fallback and label it CLI evidence.

Source: [Chrome breakpoint guide](https://developer.chrome.com/docs/devtools/javascript/breakpoints). Primary sources reviewed 2026-10-18; current checkout schemas and docs remain authoritative.
