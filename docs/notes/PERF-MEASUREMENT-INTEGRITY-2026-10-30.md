# Performance measurement integrity follow-up, 2026-10-30

## Source and scope

Fetched the deploy branch before creating the isolated worktree
`cursor/perf-lifecycle-next-5395` at
`539528b913e9d6fb0b9f0a8993d9ceaa9cc25aa7` (includes PR #4311).
The prepared shared checkout was not pulled or benchmarked as current.
Implementation commit: `cda370fdc840e7a6b0feab4e90950088dd6f2193`.
Node 24.19.0, Chromium 154.0.8037.57, Linux x86_64. The dependency lock
matches the prepared checkout. Raw conditions, regressions and logs are under
ignored `artifacts/perf-next/` in the measurement worktree.

Reviewed recent findings and current PR paths first. Product leads overlap
#4262 (loading/release), #4316 (CPU/audio/netplay), #4308 (renderer churn),
and the garage owners. This patch changes measurement tools and tests only.
No game rendering, simulation, protocol, quality or accessibility behavior
changes. No FPS, thermal, monetary saving or product speedup is claimed.

## Reproduced defects and regression protection

The CPU/hitch profiler wrapper converted a null child exit status to zero.
Real inert subprocesses reproduce this for SIGTERM and a missing executable
(ENOENT). The wrapper now returns nonzero and names the signal/spawn error;
numeric exits 0 and 7 and inherited child diagnostics remain unchanged.
The regression runs the actual CLI dispatch against copied inert child
programs; any unexpected browser/server launch throws.

The race-cycle slope helper returned `ok:true` when both heap readings were
null, bypassing every growth assertion. Null, nonfinite, negative and
nonnumeric post-warm heap/audio readings now make the measurement incomplete.
The existing hard/soft limits and five-cycle warm-up remain unchanged.
Tests exercise the actual helper, including signed shrinkage and original
threshold boundaries.

The browser soak previously discarded renderer identity and runtime counters.
It now saves the complete census and requires observed TLX plus a usable
WebGL2/WebGPU API, track hooks, finite heap/audio readings and geometry/texture
counters. Counter availability is distinct from balanced resources.

Reproduce from the implementation commit:

```sh
node --test tests/unit/profile-lib.test.mjs tests/unit/mem-census-growth.test.mjs
node tools/ci/tooling-fast.mjs --changed --jobs=3 --quiet
node tools/ci/test-bg.mjs --spec tests/specs/race-cycle-memory.spec.js --workers 1
node tools/ci/test-bg.mjs --wait --timeout 30
```

Focused tests: **44 passed, 0 failed**. Required structural floor:
**732 files passed, 0 failed**, 636.5 seconds, unchanged implementation tree
`c80911430e05ed68c1637dd7fc1b7e067fb9c6da`. Commit guards passed in 58 seconds.
The before-fix profiler regression failed; the before-fix memory tests had
one failure and one pass. Logs retain those failures.

## Fresh browser retention observations

The selected browser spec passed **1/1, 0 failed, 0 skipped**, exit 0,
101.6 seconds. It ran alone after the structural suite and commit guards.
Launch load averages were 2.48/3.05/1.88; no competing local workload was
started. This is retention evidence, not an uninstrumented timing benchmark.
Viewport 844x390, touch; test fixture pins wind and tyre wear off. The fresh
browser context serves the isolated checkout and mocks external race-data APIs.

Six Monza/Spa cycles cover twelve API race entries, synchronous headless
driving steps, results, menu, and six garage visits. All 24 race/menu census
rows positively report `three/webgpu`. Every race reading retained exactly
the current observed track root; menu readings retained at most one.

Final menu after Spa, one reading per cycle:

| Cycle | Compatibility heap, MiB | CDP used heap, bytes | Decoded PCM, MiB | Attribute byte bookkeeping |
| --- | ---: | ---: | ---: | ---: |
| 1 | 143.7 | 62,888,756 | 65.6 | 39,865,916 |
| 2 | 144.3 | 62,064,056 | 65.6 | 62,261,632 |
| 3 | 146.1 | 64,576,388 | 65.6 | 87,681,588 |
| 4 | 146.6 | 65,474,508 | 65.6 | 109,747,632 |
| 5 | 147.0 | 66,400,360 | 65.6 | 131,408,856 |
| 6 | 147.6 | 66,616,080 | 65.6 | 152,383,884 |

The existing cycle-6 minus cycle-5 compatibility heap delta is +0.6 MiB;
decoded PCM delta is zero. These six stateful observations are not independent
repeat-run distributions, and one post-warm pair is not a plateau proof.
Compatibility `performance.memory` and CDP counters are separate measurements;
do not combine them into a process-memory total.

At those six menu checkpoints DOM listeners remain 2,231; nodes range
18,847-18,859. Textures reach 54 at cycle 2 and stay there; programs remain 47.
Geometry counts grow 134 to 188. Renderer attribute bookkeeping keeps growing;
it does not establish balanced GPU resources.

In vendored `three-0.187.0/three.webgpu.min.js`, Info records attribute creation
and subtracts its saved size on explicit destruction. Attribute finalization
removes a tracked WeakRef without subtracting Info counters. Abandoned
attributes can therefore leave accounting totals behind. Distinguishing stale
accounting from retained resources requires weak identity records, creation/
explicit-destruction counts and surviving attribute-byte inventories under
the same lifecycle. No renderer fix is justified by this counter alone.

Artifacts: `artifacts/logs/spec-race-cycle-memory.log` and
`artifacts/logs/race-cycle-memory.json`. The latter retains actual API identity,
CDP heap/backing storage/DOM counters and expanded renderer accounting.

## Remaining gaps

This run does not establish garage presentation, full AudioNode or GPU resource
balance, physical GPU residency, pause cost, upload/layout attribution or
real iPhone FPS/thermal behavior. The browser uses software graphics on this
host. Its observed WebGPU path differs from the earlier WebGL2 baseline, so
their durations cannot support a speedup comparison. No output-equivalence or
product optimization claim is made. Resource attribution belongs with the
existing renderer/release owners before changes to their paths.

References: [Node spawnSync](https://nodejs.org/api/child_process.html#child_processspawnsynccommand-args-options),
[CDP Runtime counters](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-getHeapUsage),
[Three disposal](https://threejs.org/manual/en/how-to-dispose-of-objects.html).
