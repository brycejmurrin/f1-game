# Perf hunt: boot, loading, track switch (2026-10-17) — round 1, no landed fix

Tip 29f82756, local `npx serve`, headless Chromium + SwiftShader, 844x390, fresh context per sample.
Scripts (not committed): a PerformanceObserver `longtask` boot probe, a CDP `Profiler` boot capture, a `race(track)` loop with `performance.memory` (precise-memory-info, `gc()` before each read).

| Probe | Result | Verdict |
|---|---|---|
| Boot to `__apex`, 3 fresh pages | 3.2 / 3.8 / 8.2 s (first page cold); DCL 1.6-3.1 s; 211 scripts; 6-8 long tasks, 2.0-5.7 s total, max 1.2-4.6 s | noise-bound, nothing to claim |
| Boot CPU profile by file | `glx/glx.js` 4.6 s of 9.3 s (`init`, `createTextureArray`, `checkLink`, `drainGlErrors`) = SwiftShader driver time; `glx/shadow.js` 0.27 s; every owned `js/ui`, `js/core` file under 0.2 s | GPU-side, not evidence; renderer code is lane P2 |
| Same-circuit rebuild x8 (spa, after the first build) | heap 144.2, 144.2, 144.8, 145.5, 145.7, 145.9, 146.0, 146.1 MB: +0.6-0.8 MB per rebuild; rebuild wall 39 -> 26 -> 14 -> 8-9 s (SwiftShader, warm caches) | no leak at the JS-heap level; 0.7 MB/rebuild is the residual to chase only with `renderer.info.memory` |
| Cross-circuit switch (monza/spa/monaco x2-3) | heap 140-165 MB, `race()` 21-47 s | SwiftShader-bound; wall time not separable |

Not covered (next round): `renderer.info.memory` geometries/textures across rebuilds, menu screen-transition long tasks via a DevTools trace, lazy-bundle waterfall on a cold SW.
`profile.mjs --mode spans` profiles per-frame gameplay, not the build; use the VM harness (`track-build-vm.cjs`) for CPU-only build time.
