# Perf hunt fixes — design (2026-08-17)

Approved via user “Do all” on `artifacts/perf-hunt/11-SYNTHESIS.md`.

## Scope (this PR)

| ID | Change | Risk |
|---|---|---|
| A | PerfGov `clearStrikes`/`safeMode(false)` also reset `_perfTier` to floor | Low — match `cleanRace` |
| B | Hoist `pairContact`, human `tyre`, replace `cars.some` | Low |
| C | AI ERS: energy check before curvature LUT | Low |
| D | Pool `floodScale` + hoist `fl` in lighting path | Low |
| E | `cullInstances`: reuse scratch views (no per-instance `subarray`) | Low–med |
| F | Wire race draw to `graph.batches()` / `drawInstanced` where `full` nodes exist; keep fuse fallback | Med — parity via existing graph tools / instanced-draw spec |
| G | Enable road/terrain chunk path for camera when `envCull` (not only lamp-gated) | Med — visual; keep shadow path careful |
| H | WGX: cache particle/MSAA bind groups; reduce redundant writeBuffer where safe | Med |
| I | Shadow depth: enable back-face cull where geometry is closed | Med — acne risk; gate or test |
| J | `__apex.perf()` thin snapshot; agentHelp | Low |
| K | SW: don’t precache unused deferred backends eagerly if already conditional | Low–med |

Out of scope this PR (authoring / product): thinner cityFront, pine re-param, `?v=N` scheme, `defer` tags, lampDensity auto, UI ScrollFade.

## Landed

| ID | Status |
|---|---|
| A | Done — `clearStrikes` resets `_perfTier` to floor; unit test |
| B–D | Done — pairContact/tyre/cars.some + AI ERS order + floodScale/`fl` pools |
| E | Done — GLX+WGX cullInstances no per-instance `subarray` |
| F | Done — `_preferInstance` skip-fuse when `createInstancedBatch` exists; VM audits keep full fuse |
| G | Done — road chunk when `envCull` && tier < 3 |
| H | Done — WGX particle BG + MSAA depthResolve BG cache; cullInstances pack |
| I | Skipped — shadow depth cull stays off (peter-panning; comments in glx/shadow.js) |
| J | Done — `__apex.perf()` + `userTier`/`autoTier` on renderScale report |
| K | Skipped — SW still seeds DEFERRED (load-order guard); offline risk |

## Success

- `test:tooling-fast` green; perf-governor unit covers latch
- `verify-track` for a dense city track (props verts drop vs pre-S3 fuse)
- Cache bump last
- Note: `test:graph-parity` vs pre-S3 BASE expects props soup shrink — compare bake equivalence via track-graph unit / instanced-draw spec, not fused vert identity