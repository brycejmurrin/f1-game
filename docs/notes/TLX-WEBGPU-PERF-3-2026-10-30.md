# TLX WebGPU perf, round 3 (2026-10-30): three r187, the mid-race post and sky builds, the submit count

Bryce plays THREE PATH: WEBGPU on an iPhone (Safari/WebKit, Metal, 844×390 touch). This round works issue #4269's
ranked list (PR #4313). Rounds 1–2 are in `TLX-WEBGPU-PERF-2026-10-30.md`; their refuted and dropped items were not
retried. No timing is claimed. The container has no Lavapipe Vulkan ICD, so three's WebGPU leg cannot run here.
Every number below is either a COUNT from node over the real vendored three, or a figure read from the macOS census.
The census is Chromium/Dawn on Metal, **not WebKit**.

## 1. three r187 vendored (0.186.1 → 0.187.0)

- Release notes: https://github.com/mrdoob/three.js/releases/tag/r187 (npm `three@0.187.0`, tarball sha256
  `ff540832…0728`).
- Patches: `vendor/three-0.187.0/PATCHES.md` §Bump history is the per-patch record.
  - **Retired** because upstream now carries them: 6 (#34553), 9 and 10 (#34552), 15 (#34601 and #34610),
    16 (#34707) and 20 (#34734).
  - **Re-derived** against moved source: 13, 14 and 19.
  - **Kept** unchanged: 1, 4, 5, 11, 12, 17 and 18.
- **Layout change.** three.tsl.js is now the node library (317 KB minified) that three.webgpu.js imports. In r186
  it was a 26 KB re-export of `three/webgpu`.
  - `tools/gen/vendor-three.mjs` now rewrites both chunk imports to .min.js.
  - An edit in `vendor/three-patches/patches.mjs` may now name its own file. Patch 13's `TextureNode.clone()` edit now
    lands in three.tsl.js.
- **Size.** The three minified chunks went from 1,129 KB to 1,158 KB.
- **Depth-only shadow maps** (#34782; works on both backends per the PR). `tlx-shadow.js`'s existing `REVISION >= 187`
  gate now builds every non-PCSS map with `count: 0`.
  - Phone sun map: `S.sunColorBytes` is 1,048,576 on the base tree and **0** here (`tlx-hunt4b`).
  - The WebGL2 colour invalidate skips a target that has no colour attachment.
- **Parallel `compileAsync` (#34816).** Under r187, `compileAsync` records each item's target, MRT and depth when it is
  queued (`item.precompilationState`). It creates pipelines with `createRenderPipelineAsync` concurrently.
  - That synchronous capture is what makes §2's un-awaited canvas compiles safe.
  - The race-entry warm's wall time on hardware is a census readout, not a node count. See §5.
- **Upstream changes that turned unit controls into records.** Each control had pinned an r186 hazard:
  - the geometry cache key no longer carries `index,` (`tlx-fx-warm`);
  - an InstancedMesh reads its matrix columns from `instanceMatrix`'s own buffer, so the per-frame relay is gone and
    a Stream rewrite reaches the GPU (`tlx-hunt4`, `tlx-hunt4c`). The attribute caster stays the default;
  - `grad()` on an unfilterable texture now declares its sampler, #35169 (`tlx-mirror-inset`).
- **New helper.** `tests/helpers/vendor-class.mjs` finds a vendor class by its method names and pulls in the
  module-level declarations it reads. r187 moved `writeBufferAligned`, the scratch arrays and the id counters out of
  the classes.

## 2. Mid-race builds on the TLX WebGPU leg (census 41021224706)

The census showed two mid-race builds: `createShaderModule` ×2 from `tlx-post.js runPass`, and `createRenderPipeline`
from `tsl-sky.js cacheStep`. Both are fixed. Each fix has a count test in `tests/unit/tlx-webgpu-perf.test.mjs` that
fails on the base tree.

| id | cause | fix | count, base → fix |
|---|---|---|---|
| W6 | **The canvas passes were never warmed.** A draw to the canvas presents, so the A-W1 draw warm skips null targets, and the WebGPU post `warm()` is gated off (`tlx.js`). Worse, **no quad compile warm ever matched a draw**: `QuadMesh.render()` swaps three's quad vertex node in for the draw only, so `compileAsync(quad)` built the material's null-`vertexNode` program instead. This is true on r186 and r187, on both backends. | `tlx-post.js setQuadMat` pins the quad's vertex node on each pass material, so render() swaps in the same node and a compile keys the same program. The draw warm compiles each canvas pass in place: FXAA, SGSR, and the mirror over SGSR. It also re-runs the chain once with the upscale switch flipped, canvas passes only, because a render scale that crosses 1.0 mid-race swaps FXAA→canvas for SGSR→canvas. | pipelines built by the two live presents after the warm: **2 → 0** |
| W7 | **The sky cache's bake pipeline was compiled with the wrong depth state.** r187 `compileAsync` takes `renderContext.depth` from `renderer.depth` (true, three.webgpu.js l.23328); `render()` takes it from `renderTarget.depthBuffer` (l.24401), and the cache targets have none. So `cacheWarm` built a depth pipeline, and the first `cacheStep` built the real one mid-race. | `tsl-sky.js cacheDrawWarm` draws one zero-height band (y0 = y1 = −1, no texel written) into the back target from `drawWarmStage`, so `render()` builds the pipeline exactly as `cacheStep` keys it. | bake render-context depth states the warm covers: **{true} → {true, false}**; live `{false}` |

Follow-on, not taken: post `warm()` (the compile stage) has the same depth mismatch, because every post target is
`depthBuffer: false`. It stays off on WebGPU, and the draw warm now covers those targets, so the only mismatch left is
inert.

## 3. Spike frames: ~31 createBuffer and ~18 createBindGroup

They were the compile frames. In census 41021224706 the TLX WebGPU leg had 2 spike frames (≥ 100 ms). Between them
they held every in-window compile:
- 2 createRenderPipeline and 2 createPipelineLayout;
- 4 createTexture and 2 createSampler;
- 63 createBuffer and 37 createBindGroup;
- 2.0 MB of writeBuffer.

With §2's warms (census 41100189154, below), the same leg has **0 spike frames** in 541. Outside spikes, creation runs
at 0.64 createBuffer and 0.24 createBindGroup per frame. The largest single create site is the mirror pass's index
attribute (`tlx.js` `mirrorEnd` → `createIndexAttribute`, 8 creates, 431 KB in the window): the merged-chunk index
regrowth that `PERF-HUNT-8-UPLOADS-2026-10-30.md` already tracks. Nothing new to pool or prewarm here.

## 4. Submits per frame under r187

No change. r187 `WebGPUBackend.finishRender` still calls `submit( this.device, renderContextData.encoder.finish() )`
once per render context (three.webgpu.js r187 l.50171). `TLX-WEBGPU-PASS-AUDIT-2026-10-27.md` §5's write-ordering
limit therefore stands: `queue.writeBuffer` executes in queue order against submits, so batching command buffers would
reorder uniform writes. The lever is still fewer `render()` calls.

## 5. Real-GPU check: census 41100189154 against 41021224706

`gpu-census.yml` on `macos-latest` (montreal, helmet, api entry): Chromium/Dawn on Metal, **not WebKit**.
- **After:** run 41100189154, head `4c32efff`. The later commits change tests only.
- **Before:** run 41021224706, the round-2 baseline. It ran an older tip, so frame-rate and frame-count rows mix this
  PR with what merged in between. The compile, warm and pass rows are this PR's.
- `tools/gfx/census-verdict.mjs` exits 0 on the after run, and every leg reports `gpuErrors=0`.

| TLX WebGPU leg | before | after |
|---|---|---|
| gpuErrors (all four legs) | 0 | **0** |
| programs built in the driven window (`mats: progs`) | 48→50 (**+2**) | 51→51 (**+0**) |
| compile stacks in the window | createShaderModule ×2 (`tlx-post` runPass), createRenderPipeline (`tsl-sky` cacheStep) | **none** |
| spike frames ≥ 100 ms | 2 | **0** |
| hitch spikes / frames, worst | 23 / 315, 126.9 ms | 11 / 541, 27.9 ms |
| race-entry warm: scene / post / total | 7,121 / 0 / 13,733 ms | **1,581 / 1,236 / 4,812 ms** |
| draw warm drawn (post, sky) | 15, — | 15, **1** |
| attachments stored / discarded per frame | 30.21 / 3.09 | 23.77 / 2 |
| submits per frame | 20 | 20 (§4) |

Reading the warm rows:
- **Scene stage, 7.1 s → 1.6 s.** This is r187's parallel `compileAsync` (#34816).
- **Post stage, which runs again.** Its 3 s budget is no longer spent on the scene stage.
- **The three.js/WebGL2 leg** shows the same effect: warm total 15,254 → 8,194 ms.

The drop in stored attachments includes the depth-only shadow maps (§1); the census does not split out the rest.

**Device evidence is still owed.** After the deploy, Bryce runs PHONE TEST › GPU TEST (`PHONE-GPU-TEST-2026-10-21.md`).
Nothing in rounds 1–3 has run on WebKit.

## Gates run

- `node --test` over tlx-*, webgpu-*, gfx-backend-canary, backend-surface-parity, three-shared-binding-update,
  tlx-post-fixed-mats and every suite that imports the vendored three: all pass.
- `test:service-worker`, `test:desktop-unit`, `vendor-three.mjs --check`, `test:guards`.

## Sources read

- three.js r187 release: https://github.com/mrdoob/three.js/releases/tag/r187
- three.js #34782, depth-only render targets on both backends: https://github.com/mrdoob/three.js/pull/34782
- The vendored r187 source itself (`scratch/three-r187/x/package/build/*.js` in the session), for every line cited above.
- GPUQueue.writeBuffer alignment: https://developer.mozilla.org/en-US/docs/Web/API/GPUQueue/writeBuffer
