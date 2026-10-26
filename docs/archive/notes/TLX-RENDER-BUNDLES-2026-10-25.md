# TLX render-bundle prototype: measured, no win, closed unmerged (2026-10-25)

Lever B of #3681 (PERF-KNOWN-WINS-2026-10-23 row 14, "WebGPU leg submit/bind cost"). Bryce chose "Build a
flagged prototype" in A·W47's session on 2026-10-24. #3719 built it behind `apex26.tlxBundles=1` (WebGPU path
only, default off). This note keeps the answer, so the idea is not re-run blind. The code is on the branch
`cursor/tlx-bundles-proto-w47d` (head `f31a684d`, synced to the deploy tip on 2026-10-25), and it can be revived
from there.

## What the prototype did

TLX re-culls every frame, rebinds the visible chunks to pooled wrappers (`acquireMesh`) and swaps
`poolRoot.children` per pass. A three r186 `BundleGroup` replays exactly what it recorded (children are projected
once), honours its own `.visible`, and draws before the opaque and transparent lists. So the prototype
(`tlx-chunked.js` `chunkBundles`) kept persistent per-chunk meshes in per-region `BundleGroup`s (4×4 grid cells,
288 m). The main pass kept its per-chunk cull and added a region's group when any of its chunks survived. A
region re-recorded only on a material change. The scope was opaque, identity-matrix chunked records, in the main
pass only. `bundleState()` exposed the counters to `gpu-game-check.mjs` and `bench-run.js`.

## Measurements (`gpu-census.yml`, macos-latest, Montreal, TLX WebGPU leg)

| pair | bundles ON | bundles OFF |
|---|---|---|
| A·W47, `ac5385bf` | run 40058516789: 22.9 fps, `queue.submit` 1.21 ms/frame, `writeBuffer` 0.38 ms/frame | run 40059114907: 27.1 fps, 0.64 / 0.26 ms/frame |
| A·O4, `f31a684d` | run 40243027205: 15.1 fps, CPU-sampled `submit` 211.6 ms | run 40243029246: 14.1 fps, 214.4 ms |

In both pairs the path engaged (`regions 46, meshes 74, rerecords 38`), `gpuErrors` was 0 and mean luma matched
to 0.1. Submit and writeBuffer calls per frame were unchanged (about 19 and 85). The second pair ran on a slower
runner: the governor sat at scale 0.7 on both legs, and OFF reached 14 fps against 27 in the first pair. Its
±1 fps difference is inside run-to-run noise.

Verdict: the first pair is slower and the second is neutral. Neither pair shows a gain, so the flag was not
shipped as dead weight (a store key, a WRITERLESS ceiling raise, and a branch in `tlx.js` and `tlx-chunked.js`).

## Why it does not pay (likely, not separated)

- A region bundle draws all of its chunks, including ones the per-chunk cull rejected. There is no cull inside a
  bundle.
- 38 recordings landed in a short window: each region's first record, plus re-records whenever the dynamic
  resolution changed the render context.
- three's bundle replay still refreshes every object's uniforms, so the per-object CPU work the idea was meant
  to remove stays.
- At about 81 draws per frame there was little encoding cost to save (#3685's census).

## Revisit only if

- three gains a bundle replay that skips per-object uniform refresh, or TLX moves to persistent per-object
  bindings (the #30560 direction in row 14). Or:
- the draw count per main pass grows by an order of magnitude, so that encoding cost dominates.
