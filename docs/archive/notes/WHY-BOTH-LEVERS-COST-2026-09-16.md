# Why both levers cost time on this hardware (2026-09-16)

Occlusion culling measured +5 % and multi-draw +21.3 % on `macos-latest`
(census 146, GLX, interleaved, vegas at noon). Both were built expecting a
saving. The research below says neither result is surprising, and that one of
them was never measurable by the instrument used.

## 1. Multi-draw is a CPU-side optimisation, and the census measures GPU time

`WEBGL_multi_draw` exposes ANGLE's `MultiDrawElementsANGLE`. MDN states the
benefit plainly: it "reduces binding costs in the renderer and speeds up GPU
thread time with uniform data" — the saving is the **driver and submission
overhead of issuing N calls**, not the work the GPU does once they arrive. The
vertices submitted, the fragments shaded and the state the GPU resolves are
identical either way; that is exactly what
`tests/unit/glx-multidraw.test.mjs` proves by requiring both paths to cover the
same index bytes.

The census A/B samples `EXT_disjoint_timer_query_webgl2`, which measures **GPU**
time. So:

> A GPU timer cannot show a saving from an optimisation that does not change
> GPU work. The +21.3 % is not evidence that multi-draw is slow; it is evidence
> that the wrong quantity was measured, and what leaked through is the
> extension's own indirection plus a floor of 18.9 %.

This is the fourth instrument defect this session and the most consequential,
because unlike the others it cannot be fixed by sampling harder. Interleaving
took the floor from 45.2 % to 18.9 % and would not have helped at any floor:
the effect is not in this signal at all.

**What to measure instead:** wall-clock CPU time in the submission path — a
`performance.now()` bracket around the chunked draw loop, or the frame-time
percentiles `PerfGov.frameStats()` already keeps. Multi-draw's claim is
`consecutiveGroups - setGroups` fewer driver calls per frame; the question is
what one `drawElements` costs the CPU here, and that is a number the GPU clock
never sees.

## 2. `macos-latest` is a tile-based deferred renderer, so occlusion culling is
   redundant there by construction

Apple Silicon GPUs are TBDR, and Chrome reaches them through ANGLE's Metal
backend. TBDR bins all geometry of a render pass into tiles first, then shades
**only the fragments that survive hidden surface removal**, in on-chip tile
memory. PowerVR's documentation makes the consequence explicit for its own HSR:
you do not need a depth pre-pass, because overdraw is removed entirely for
opaque geometry in hardware. Arm says the same of Mali's Forward Pixel Kill.

Per-object occlusion queries ask the GPU to do, in software and a frame late,
the job its rasteriser already does for free and exactly. What the queries add
on top is real: a proxy-box draw per chunk, a query object per chunk, and a
result read. So on this runner occlusion culling is **all cost and no saving**,
and +5 % against a 9.9 % floor is the expected shape of that.

It does not follow that occlusion culling is worthless. It follows that
**`macos-latest` cannot answer the question**, because:

- Apple Silicon and every phone are TBDR — hardware HSR, occlusion culling
  redundant.
- Most desktop players are on immediate-mode GPUs (NVIDIA, AMD, Intel), which
  shade fragments as they arrive and where removing hidden geometry does pay.
- GitHub's `ubuntu-latest` and `windows-latest` runners have no GPU at all —
  llvmpipe and WARP, which are software and answer for neither.

So the project's only real-GPU runner is the one architecture on which this
feature is expected to be pointless. That is worth knowing before another run
is spent on it.

## 3. What this changes

- **Stop pricing multi-draw with the GPU timer.** The measurement is not noisy,
  it is the wrong signal. Either instrument the CPU submission path or drop the
  claim; do not run another census A/B for it.
- **Stop pricing occlusion culling on `macos-latest`.** A TBDR runner cannot
  show a saving that only exists on immediate-mode hardware. The counted
  oracles stay valid and are the honest thing to quote: 56-85 % of chunks
  contribute no pixel, 75-93 % skipped in motion.
- **Both flags stay OFF**, now for a better reason than "unproven": for
  multi-draw, because its benefit is CPU-side and unmeasured; for occlusion,
  because its benefit is architecture-dependent and this project cannot reach
  the architecture where it would appear.
- **The night leg still matters**, but for what it counts, not what it times:
  it is the first run in which the per-chunk lamp branch executes at all, so
  `perChunkDraws -> consecutiveGroups -> setGroups` from real hardware is the
  result to read. Its GPU deltas are subject to everything above.

## Sources

- MDN, `WEBGL_multi_draw` — the benefit is binding cost in the renderer.
- Khronos WebGL extension registry, `WEBGL_multi_draw` (wraps
  `ANGLE_multi_draw`).
- Apple, "Harness Apple GPUs with Metal" / "Tailor your Metal apps for Apple
  M1" — TBDR, on-chip depth, shade only visible primitives.
- Imagination Technologies, PowerVR TBDR and HSR documentation — HSR removes
  opaque overdraw in hardware; no depth pre-pass needed.
- Arm, "Hidden Surface Removal in Immortalis-G925" — Forward Pixel Kill.
- Vulkan Documentation Project, "Tile Based Rendering (TBR) Best Practices".
