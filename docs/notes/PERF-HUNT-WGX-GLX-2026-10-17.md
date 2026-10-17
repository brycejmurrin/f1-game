# WGX / GLX CPU-side perf hunt — 2026-10-17

Instrument: `scratch/wgx-count.mjs`-style Playwright census (Chromium + SwiftShader WebGPU flags, `apex26.gfxBackend=webgpu`),
wrapping `GPUQueue.writeBuffer`, `GPURenderPassEncoder.*`, `GPUDevice.create*` and attributing each call to its JS caller
stack. Monza, 320x180, 20-30 rAF frames after a 25-frame warm-up, car at 55 m/s. Counts only: SwiftShader time is not evidence.

## Baseline per frame (WGX)
setVertexBuffer 131, setBindGroup 124, drawIndexed 114, writeBuffer 80, setIndexBuffer 75, setPipeline 55, draw 38,
beginRenderPass 31, submit 4.3. `writeBuffer` by caller: 43 were `cullInstances` instBuf uploads (24 from the mirror pass,
19 from the main pass).

## W1 — mirror pass evicts the main pass's instance cache (FIXED, this PR)
`cullInstances` keyed ONE cell-set memo and ONE `instBuf` per batch; the rear-view pass and the main pass cull the same
prop batches with different frustums, so each cull missed, re-packed and `writeBuffer`'d (every frame, every batch).
GLX already splits this per view (`_instPerPass`, hunt 2 G8); WGX never got the port. Inside mirrorBegin..mirrorEnd the cull
now targets `batch._mir` (own pack, own buffer, own key), and `drawInstanced` binds it for that pass only.

| per frame | before | after |
|---|---|---|
| `queue.writeBuffer` | 81.1 | 39.6 |
| instBuf uploads (cullInstances) | 43 | 0 (steady cells) |
| drawIndexed / setBindGroup / submit | 113.9 / 126.3 / 4.4 | 113.5 / 126.5 / 4.4 |

Also removes the per-instance JS copy loop on every hit. Cost: one extra instance buffer + CPU pack per batch, created on
first mirror cull (props only). Test: `webgpu-lifecycle` "WGX mirror-pass cull gets its own pack…" fails on the base, passes here.

Not measured: pixel identity (the bytes uploaded per pass are unchanged by construction; a mirror-on capture A/B was not run)
and real-GPU effect (needs gpu-census on macos-latest).

## Seen, not acted on
`setIndexBuffer` 75/frame (`_setIB`): consecutive draws mostly use different meshes' index buffers; no redundancy left.
`beginRenderPass` 31/frame is the post chain; GPU-facing, out of this lane's evidence rule.
