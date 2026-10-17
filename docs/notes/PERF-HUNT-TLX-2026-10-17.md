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

## Round 2: chunk draw merge factor 2 -> 3 (branch `cursor/tlx-perf-r2-9b3e`)

Re-census after the dust merge (monaco, chase): the main pass is 89 draws, of which 40 are still chunked-world
(29 + 11 in a second record); the other ~49 are single unique meshes (sky, road, cars, props). Checked and dry:
the 195 ms `set` self time under `render/gfx.js:247` (the canvas-lease Proxy) is ONE `setSize` from a governor step
(canvas width/height set once in 100 frames, counted by wrapping the setters), not per-frame work; `shownLayer`
(`ui/layers.js`, 143 ms) is the HUD lane's.

`apex26.tlxChunkMerge` already accepts 3 and 4, and 2 was never compared with them. Same tree, `MERGE=n`
env on the probe (localStorage `apex26.tlxChunkMerge`), 3 alternating runs per arm, 150 frames, stubbed links:

| circuit | merge | draw calls/frame p50 | render JS p50 ms (3 runs) | render JS mean ms | main-pass triangles |
|---|---|---|---|---|---|
| monaco | 2 | 144, 144, 144 | 9.7, 8.1, 8.5 | 10.8, 9.2, 9.7 | 172.6 k |
| monaco | 3 | 123, 124, 123 | 7.6, 7.2, 7.1 | 8.3, 7.8, 7.8 | 175.4 k (+1.7 %) |
| spa | 2 | 178, 177, 177 | 8.8, 9.8, 9.3 | 10.6, 11.1, 10.9 | 179.3 k |
| spa | 3 | 151, 150, 150 | 7.9, 8.3, 7.8 | 9.6, 10.0, 9.9 | 183.4 k (+2.3 %) |

Draw calls −14 % on both (exact); p50 ranges disjoint on both circuits. Merge 4 buys less and costs more
triangles (monaco +8 %, 186 k), so the default moves to 3 only. The lamp table stays on the 72 m cells
(`lampCells`), so night lighting does not depend on the factor.

Pixel identity (`shot.mjs`, deploy tip vs this tree, one-job batches): monaco 0.1 park day 921 600 of 921 600 px
identical (max diff 0). Vegas 0.2 park night: base vs this tree 961 px > 5 levels; base vs a second base run 60 978
px > 5 levels (night frames move with lamp flicker and AI lights), i.e. the difference is inside the same-tree floor.

Not run: `gpu-census.yml` (hardware effect of ~2 % more triangles in fewer draws), `gfx-probe`, browser groups.
Off-switch unchanged: `apex26.tlxChunkMerge=2` restores the previous shape, `=1` the original.
