# Performance workflow audit, 2026-10-30

## Source and attribution

Fetched `origin/claude/f1-game-project-26h3ng` before creating the isolated
`cursor/perf-lifecycle-a83f` worktree at
`7c6d11c68ad8fd670ee2a882d53bb2eec50c548b`. The prepared shared checkout was
older; it was not pulled or benchmarked as current. Current AGENTS.md SHA256:
`e95178f4de5e33b44471dcc97e252a9e6b88c29cee6df8f18f766213021563ea`.
Node v24.19.0, Linux x86_64, software graphics only. Dependencies reuse the
prepared checkout's node_modules; package-lock is unchanged. Initial loadavg
was 0.06/0.03/0.00, with no browser or Playwright workload. Exact local
conditions and raw evidence are under ignored `artifacts/perf-session/`.

Read the recent hunts before profiling. At this base, hunts 5–8 already include
flap solve reuse, parallel race bundles, HUD caching, audio pooling, snapshot
copy removal and upload-range reductions. Open PR #4262 owns the follow-ups
for SW install ordering/voice eviction, teammate body reuse, mirror release
and build splitting. #4280 owns HUD work, #4227 garage arrival/camera work,
and #3981 shared game/energy-plan work. This audit does not duplicate them.

The hosted F1 MCP status request returned HTTP 429. Local documented
`apex_status` succeeded with lock free and no live browser. The local readiness
check passed, with warnings that the optional DevTools clone tag was missing
and the Chrome channel symlink could not be created; executable Chromium was
found at `/usr/bin/chromium`.

## Current allocation evidence

Reproduce from this base:

```sh
node tools/perf/vm-alloc-census.mjs --json artifacts/perf-session/base-alloc.json
node artifacts/perf-session/alloc-profile.cjs
```

The existing allocation census passed: **167.6 KB/frame**, six GC-free 60-frame
windows after 600 warm frames on Monza: 135.6, 138.4, 148.4, 179.8, 180.4,
223.2 KB/frame. These windows follow different race states; their range is not
a repeat-run noise estimate. The existing budget was unchanged.

An inspector sampling heap profile (4096-byte interval, including collected
allocations) over 600 further frames took 1316 ms. Largest sampled self sites:

| Site | Sampled KB/frame |
| --- | ---: |
| updateCarLateral | 21.57 |
| updateCar | 18.85 |
| updateCarBrakePlan | 11.08 |
| updateCarLongitudinal | 6.48 |
| brakeTarget | 6.42 |
| updateCarAdvance | 3.40 |
| track line at | 3.04 |
| collide _onTrafO | 2.48 |

The VM uses renderer and DOM stubs. Its global lookups and numeric boxing can
inflate costs; these sampled sites do not prove explicit object allocations.
The current brake-target implementation already pools intermediate records and
hoists its shared envelope. No physics change is justified by this evidence.

To recreate the ignored sampling script on a fresh checkout, save this as
`artifacts/perf-session/alloc-profile.cjs` (create the directory first), then
run the command above. Sampling itself is nondeterministic.

```js
const inspector = require('node:inspector'), fs = require('node:fs');
const { createGame } = require('../../tools/lib/game-vm.cjs');
(async () => {
  const g = await createGame({ track: 'monza', carMeshes: false });
  const s = new inspector.Session();
  try {
    await g.race('monza');
    g.apex.headless(true);
    g.apex.setInput({ throttle: true, steer: .02 });
    g.step(600);
    s.connect();
    const call = (method, params = {}) => new Promise((resolve, reject) =>
      s.post(method, params, (err, value) => err ? reject(err) : resolve(value)));
    await call('HeapProfiler.enable');
    await call('HeapProfiler.startSampling', { samplingInterval: 4096,
      includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    const t = performance.now();
    g.step(600);
    const wallMs = performance.now() - t;
    const { profile } = await call('HeapProfiler.stopSampling');
    fs.writeFileSync('artifacts/perf-session/alloc-sampling.json',
      JSON.stringify({ wallMs, frames: 600, profile }));
  } finally { g.close(); s.disconnect(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
```

For each node of `profile.head`, self KB/frame is `selfSize / 1024 / 600`;
sort descending and retain its callFrame URL/line for attribution. Do not sum
inclusive and self counts together.

## Harness defects reproduced and corrected

1. `test-bg --wait <groups>` previously let its waiter set exit 124 on a
deadline, then overwrote that observation result with exit 1 after reading the
still-running group's outcome. `--keep-going` could attempt the next group.
The waiter now returns its status explicitly and the chain returns immediately
on 124. The owned workload remains alive. This changes the observer, not the
test verdict or timeout budget.
2. `select-specs` restricted helper dependency traversal to `.js`. Changes to
`perf-session.mjs`, `perf-frametime.mjs`, `perf-race-entry.mjs` and
`race-cycle-memory.mjs` could miss their actual browser consumers. Traversal now
includes `.mjs` and `.cjs`, retaining the same budget and named exclusions.
3. The structural gate exposed a pre-existing hook-test assumption: it expected
the executing checkout to be primary, so a valid isolated worktree failed.
The replacement uses independent real primary and linked Git fixtures and
asserts both permission outcomes against the unchanged production guard.
The original focused test failed at this base; the replacement's two focused
hook cases passed. No escape hatch or skipped assertion was used.

Both regressions failed on the original implementations. Tests exercise the
chain controller with a running workload and actual consumer imports, rather
than asserting source text. No timing tolerance, budget or ratchet is raised.
These changes improve coverage and terminal-result reliability; they do not
establish a product speedup or a monetary saving.

## Measurement limits and remaining work

The baseline software-GL session spec began at 17:10:49 UTC. A worker's Node
selector tests were already running (17:10:32–approximately 17:11:07), so early
browser timing samples overlap CPU load and cannot support performance claims.
The overlap was discovered after launch; no competing browser was started.

The test finished with `= run passed (1/1 done, 0 failed, 0 skipped)` and
`= bg exit 0` in `artifacts/logs/spec-perf-session-budgets.log`. Identity was
TLX/three, WebGL2, ANGLE Vulkan SwiftShader, 844×390, reduced motion, fresh
profile. It exercised the real garage menu button, grid, throttle input,
pause/quit buttons and quiet post-GC heap reads. Recorded values: garage first
draw 5901 ms, grid 17021 ms, 12 rAF samples covering 23311 ms, p50 149.9 ms,
p95/max 12532.8 ms, quiet post-GC heap 39.32→40.62 MB (+1.30 MB). These are
one-run observations under the stated overlap, not matched A/B distributions.
The test's soft phone targets were exceeded for frame time; passing its hang
ceilings does not mean smooth driving. One quit cycle does not establish a
resource plateau. Boot timing and independent pause cost were not recorded.

The candidate touches only tooling, tests and this note. No served game,
renderer, simulation, audio, protocol or accessibility source changes; thus
there is no product output-equivalence or speedup claim requiring a candidate
render comparison. The completed balance check covers the game-side gfx
contract in the VM, not browser/driver resource retention.

The game-side lifecycle census completed with
`= vm-leak-census clean circuits=monza,spa cycles=3`. Race and menu counts
repeat across cycles: 33 live meshes, 23 textures, 41 batches, 670 listeners
and one interval, with per-phase timer counts stable (Monza menu 2, Spa menu 3).
This uses current code and exact handles, not a heap-size proxy. It does not
exercise real WebAudio, garage DOM, driver caches or actual GPU allocations.

Integrated regression suites: `node --test tests/unit/test-bg-outcome.test.mjs
tests/unit/select-specs.test.mjs` exited 0, **107 passed, 0 failed, 0 skipped**.
The selector reports `reason=infra`, zero browser specs selected for this diff;
`pick-tests` names audit and tooling-fast. The baseline lifecycle spec is
additional evidence, not a substitute for these Node regression suites.

Historical real-GPU census evidence in PERF-HUNT-7-LOAD-MEM identifies program
warmup as the dominant menu preparation cost and reports resource plateaus.
Those are historical observations, not a fresh lifecycle balance verdict for
this base. GPU execution, upload traffic, browser allocation/retention, layout
and loading must remain separate measurements. Software GL and VM results do
not establish iPhone FPS, thermal behavior, WebAudio equivalence or GPU memory.
Boot, pause, quit/re-entry and garage need matched browser/device measurements;
no product performance acceptance is claimed by this harness-only patch.

## Current API documentation read

- https://nodejs.org/api/process.html#processexitcode — setting exitCode controls
  eventual graceful process termination; a later assignment replaces it.
- https://playwright.dev/docs/test-cli — dependency-aware selection and CLI
  execution are distinct from terminal test outcomes.
