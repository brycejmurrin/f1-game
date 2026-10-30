# TLX WebGPU perf pass, 2026-10-30: the merged-chunk index on WebGPU, merged shadow casts, skipped writes

Bryce plays THREE PATH: WEBGPU on an iPhone (Safari/WebKit, Metal, 844×390 touch). This pass looked for work the TLX
frame does on that path and need not do: draw calls, buffer and uniform uploads, bind-group and render-object churn
and JS walks. It also looked for defects on the same path. Method: four read-only code-hunters (tlx.js, the post
chain, shadow plus chunked, and TSL materials), a prior-art scout, the parent's seeds, and then a re-read of each finding
against the vendored three r186. No timing is claimed. The container has no Lavapipe Vulkan ICD, so three's WebGPU
backend cannot run here, and SwiftShader times nothing useful (PERF-FINDINGS). Every number below is a COUNT from
`tests/unit/tlx-webgpu-perf.test.mjs`. That file drives the real vendored code: the WebGPU attribute utility over a
byte-model queue, and `WebGPURenderer` over the no-op WebGL2 for the post chain.

## Fixed (PR branch `cursor/tlx-webgpu-perf-7e3a`)

| id | site | before → after (count) | look |
|---|---|---|---|
| W1 | `tlx-chunked.js` `mergeVisible` | **Defect, WebGPU only.** The merged index of a Uint16 chunked record carried no `__apexUint16Index` mark (PATCHES §20), although every chunk's own index does (`packIndex`). three's `WebGPUAttributeUtils.createAttribute` therefore replaced `attr.array` with a Uint32 copy, and every later visible-set change wrote into the orphaned Uint16 array. `updateAttribute` re-sent the copy, so the GPU kept the FIRST set's indices while `drawRange` followed the new set. Test, base tree: set {4,5,6,7} decoded from the GPU buffer as indices 0–11 (chunks 0–3); after the fix, 12–23. On a phone this shows as missing chunks, or chunks that persist out of view, on every chunked record under 65,536 vertices (terrain, road and glass ribbons) that draws merged. The WebGL2 leg does not widen indices, so it never had the defect. | restores the intended image |
| W2 | `mergeVisible` regrowth | A widening view (2→64 chunks, one step each) created **63 → 10** index attributes, at 1.5× headroom capped at the record's whole index count. Each outgrown one is now released through three's `Attributes.delete`, so its GPU buffer is destroyed (`releaseAttribute`, tlx.js). Before, it stayed live until the GC collected it. | identical |
| W3 | `tlx.js` `castShadowChunked` | Sun and lamp depth passes cast a chunked record's visible chunks as **10 → 1** casters in the test, which means one pool slot, RenderObject, bind group and draw per record instead of one per chunk. The record uses merge slot 2, beside main (0) and mirror (1). An unchanged set reuses the slot with no upload. `apex26.tlxChunkMerge=0` keeps the per-chunk path. Cost: one more merged index per casting record (its visible count, with headroom). | identical depth |
| W4 | `tsl-lit.js` / `tsl-fx.js` `setSsrMrt` | A repeated identical state used to walk every lit and FX material, with a `sharedFragment` call per lit material. On 6 materials, one change plus 3 identical repeats made **24 → 6** `mrtNode` writes, so each repeat now writes 0. tlx.js calls it on and off several times a frame, and in the warm paths with redundant `false` calls. Materials minted later already take `_ssrOn` at birth. | identical |
| W5 | `tlx-post.js` | `hazeTime` was written every frame although the composite reads it only under `hazeStr > 0`, and the phone tier sets no haze. The godray `time` was written every godray frame although `gCloud` reads it only under `cloudCover > 0.001`. Each write is a frame-varying value, so r186 records an update range and pays one `queue.writeBuffer` on that buffer's frame. In the test, 4 presents with no haze on a clear sky make **4 → 0** frame-varying writes to each uniform. Both write again as soon as they are read. | bit-identical |

Gates: `node --test tests/unit/tlx-webgpu-perf.test.mjs` (5 pass; all 5 fail on the base tree) and the neighbouring
TLX suites (hunt3, hunt4/4b/4c, chunked-lifecycle, round2, recovery, cull-shadow-pack, webgpu-uint16-index,
backend-surface-parity: 199 pass). `gfx-backend-canary` is 280 pass. Its chunked-factory pin now accepts the added
`releaseAttribute` callback. No new source pin was added.

## Checked and refuted, or left alone

- **Shadow `textureSampleCompare` and `dpdx` inside non-uniform branches would fail on WebKit** (TSL hunter, two
  rows). Refuted for TLX: r186's WGSL builder prepends `diagnostic( off, derivative_uniformity );` to every shader
  outside Firefox and Deno. The §5a rule in WEBGPU-PARITY binds WGX's hand-written WGSL, not TLX.
- **Seed B5, blob and decal `InstancedMesh` Dynamic usage**: deliberate (tlx.js `_instUsageOf`). three relays an
  InstancedMesh's matrices once per frame per render object, so Stream would draw a stale run on the second pass.
  The real lever is moving these to attribute instancing, as A-H4 did for the casters. That is still open; it is
  sized at most ≈4 KB per run per pass and was not taken here.
- **Mirror target DPR 2 against TLX's phone DPR cap 1.5** (`mirror-pass.js targetSize`): plausible, about 1.78× the
  mirror pixels on an iPhone. Not taken. It changes the mirror's resolution (a look change) and `mirror-pass.js` is
  shared with GLX and WGX. Needs a decision and a device arm.
- **Registry instanced meshes are direct `scene` children** (tlx.js 2286 and others): every render walks hidden runs,
  an estimated 20–120 µs of JS per frame. This is the R6 pool-root pattern applied to `_instRegistry`. Next candidate;
  it needs a count test of the children projectObject visits.
- **`pinSkyMaterial()` per present** can never find a material (`scene.backgroundNode` is always null): dead,
  under 1 µs. **`capMirrorLights`** allocates one object per night mirror frame. **`ssaoU.texel`** is never read.
  All three are small; left for a cleanup pass.
- **Seed B6** (`_webkitStayGL`, one WebGPU failure latches WebKit to WebGL2 until RESET RENDERER) and seeds
  B2–B4/B7/B8 (WebGL2-leg formats, warm and shedding): these are on the WebGL2 leg. They were handed back to the
  parent as WebGL2-leg work and are not changed here.
- Known negatives were not retried: the sky cache at 512² (#3962), godray R11F (opt-in), and batching submits (needs a three past r186).

## Real-GPU follow-up

The unit counts are three's shared core plus the vendored WebGPU attribute utility. They are not a device frame. The
hardware check is `gpu-census.yml` on `macos-latest`: Chromium/Dawn on Metal, **not WebKit**. Its TLX WebGPU leg
exercises W1 (merged chunk draws with Uint16 indices) and W3 (sun-rebuild frames). Read the Verdict step's `gpuErrors`
(must be 0) and, on rebuild frames, `spikeWork` createBindGroup/writeBuffer. A device batch on #3954 is the only
WebKit evidence.

## Sources read

- three.js releases (r186 notes: #34283 shared uniform buffers, #34288 bind-group keys, #34276 bind-group compare;
  r185 #33513 submit, #33704 UBO GC churn): https://github.com/mrdoob/three.js/releases
- three.js WebGPURenderer manual: https://threejs.org/manual/en/webgpurenderer
- WebGPU buffer uploads (writeBuffer as the default, staging rings): https://toji.dev/webgpu-best-practices/buffer-uploads
- WebGPU bind groups: https://toji.dev/webgpu-best-practices/bind-groups
- wgpu dos and don'ts (bind groups by change frequency, few submits a frame):
  https://wgpu.rs/doc/wgpu/documentation/best_practices/dos_and_donts/index.html
- Babylon.js WebGPU bind-group cache (bind groups created per frame should average 0):
  https://doc.babylonjs.com/setup/support/webGPU/webGPUInternals/webGPUCacheBindGroup
- WebKit, Safari 26 beta (WebGPU on iOS, mapped to Metal, validation streamlined):
  https://webkit.org/blog/16993/news-from-wwdc25-webkit-in-safari-26-beta/
- GPUQueue.writeBuffer (alignment; data offset and size in elements for a typed array):
  https://developer.mozilla.org/en-US/docs/Web/API/GPUQueue/writeBuffer
