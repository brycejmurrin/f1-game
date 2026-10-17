# TLX perf hunt, 2026-10-17 — draw-call census and the chunk "dust" merge

Branch `cursor/tlx-chunk-dust-merge-4f7a` (cut from deploy tip `29f82756`). CPU-side only: this container is
SwiftShader, so GPU time is not claimed; `gpu-census.yml` is the follow-up for hardware (not dispatched here).

## Method

`scratch/drawcalls.mjs` (untracked): headless TLX WebGL2 (`apex26.gfxBackend=three`, `tlxForceGL=1`), the
program-link stub and `recordVideo` tick from `TLX-PERF-HUNT-5-2026-10-16.md` §Method, chase camera, 22 cars.
It wraps `GLX.__tlx.renderer.render`, and records per call the render target, `info.render.drawCalls`,
`info.render.triangles` and JS ms, then walks the biggest scene's visible meshes. With the stub the GPU work is
empty, so `render ms` is three's + TLX's JS (updateForRender, `_renderObjects`, bind/state). `draw calls` is exact.

## Census (monaco, chase, before)

| pass | per frame | draw calls | triangles |
|---|---|---|---|
| main scene (`output`) | 1 | 144–146 | 176 k |
| rear-view mirror | 0.85 | 37 | 148 k |
| sun shadow rebuild | 0.05–0.2 | 49 | 78 k |
| car shadow | 1 | 1 | 15 k |
| post chain | ~15 quads | 1 each | — |

Of the 146 main-pass draws, 96 are chunked-world draws (`tlx-chunked.js`: one shared 377 120-vertex buffer, one
index list per chunk) and **61 of those 96 hold ≤ 33 triangles** (20 hold ≤ 10). Spa 21 of 74, vegas 2 of 48.
Every one is its own three RenderObject (bind group, per-object uniforms) in the main, mirror and sun passes.

Why they are tiny: `ChunkBins` bins a triangle by its centroid, so a big ground triangle whose centroid lands in a
street cell leaves a chunk with a single triangle but a 300–3500 m AABB. At build, monaco has 770 chunks, 657 of
them ≤ 48 triangles, 156 with a box > 1 km. Locality buys nothing for those (their boxes are visible nearly everywhere).

## Fix: DUST MERGE (`tlx-chunked.js` `build`, after the existing draw merge)

Chunks with ≤ 48 triangles are folded into shared draw chunks: local dust per 8×8-lamp-cell block (union box ≤
`cell*mergeK*7`), and "wide" dust (own box already > that) in key order, each group ≤ 384 triangles. Same
triangles, same `lampCells` (the lamp table never reads draw chunks), union AABB so the cull cannot drop a member.
`apex26.tlxChunkMerge=1` still switches it off with the rest of the merge. No new flag.

## Result (3 alternating base/new runs, 150 frames each, monaco chase, stubbed links)

| metric | before | after |
|---|---|---|
| chunks built (monaco) | 792 | 245 |
| main-pass draw calls | 132–134 (sampled pass) / 145–146 (census) | 87–88 / 90 |
| draw calls per frame, all passes, p50 | 190, 191, 192 | 144, 144, 143 |
| render JS ms per frame, p50 | 9.4, 9.4, 9.0 | 8.6, 7.6, 7.8 |
| render JS ms per frame, mean | 10.2, 10.6, 9.8 | 9.5, 9.1, 8.9 |
| triangles, main pass | 176.36 k | 176.77 k (+0.2 %: boxes of merged dust cull a little coarser) |

Draw calls: exact, −25 % per frame. Render JS: ranges are disjoint at p50 and at the mean (new max 8.6 < base min
9.0; p90 overlaps, 12.2–13.4 vs 13.1–13.2: noise, not claimed). Other circuits, main pass: spa 123 → 110, vegas
105 → 104 (little dust there).

Pixel identity (`tools/shot/shot.mjs`, monaco 0.1 park cam, one-job batches, base worktree vs this tree): 921 562 of
921 600 pixels exactly equal, 38 differ by 1 level. Spa 0.3: 0.58 mean level difference spread uniformly (a ±1–2
dither floor; the first monaco run of this tree showed the same 0.59 against both, i.e. the floor), 519 px > 5 levels
scattered singly, no region-shaped diff.

## Not run

`gpu-census.yml` (hardware effect of fewer, coarser draws), the TLX gate probe (`gfx-probe --backend three`) and the
four browser groups are left to CI; the fix only changes how index buffers are grouped at build.

## Other findings, not fixed (do-not-re-report)

- Mirror pass 37–47 draws, sun rebuild 49: both drop with the same chunk list (counted above), no separate change.
- Post chain: 15 full-screen draws at 1 call each; nothing to cut without changing the look (`TLX-PERF-HUNT-2026-10-11.md` §D).
