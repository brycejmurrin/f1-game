# Perf hunt 7 — GPU uploads on TLX WebGPU (2026-10-30)

Scope: per-frame uploads (writeBuffer, createBuffer, bind groups) on TLX, the default backend and Bryce's iPhone
WebGPU path, plus the hunt 5 leftovers (the WGX mirror chain, TLX exact-zero shader gates). Hunt 5
(`PERF-HUNT-5-GPU-2026-10-30.md`, #4207) cut GPU passes. Hunt 6 (`PERF-HUNT-6-CPU-2026-10-30.md`, #4206, a peer
session) was main-thread CPU. Every number here is a COUNT or a byte total from the macOS census, never a frame
time.

## Method

1. **Baseline.** The census `work:` row on hunt 5's head (41008210504), per race frame: 90.6 writeBuffer carrying
   214 KB, 1.19 createBuffer, 0.41 createBindGroup.
2. **Attribution (new).** `gpu-game-check.mjs` stack-samples 1 in 8 writeBuffer/createBuffer calls in the armed
   window (unbiased `Math.random`, scaled back up). It keys each sample by kind, buffer label + exact bytes,
   three's own function names and our first three `.js` frames, and exports `out.uploads` and
   `out.uploadsSummary` (`analyseUploads` in `frame-hitch.mjs`). The census Verdict prints an `uploads:` row per
   leg. The top-60 cut makes the site totals a floor under `gpu.writeBufferKB`.
3. **Parallel workers** in git worktrees, node-verified only (AGENTS.md rule 10). The parent merged their branches
   and ran every browser and census step:
   - A: the attribution tool
   - B: the WGX mirror chain
   - C: the TLX shader gates
   - D: createBuffer churn sources
4. A census before and after the fixes, with the same inputs (montreal, helmet camera, api entry).

## What the attribution found (census 41021778161, TLX WebGPU, 377 frames)

| class | KB / frame | calls / frame |
|---|---|---|
| attribute (`updateAttribute`) | 111.9 | 4.0 |
| index (`createIndexAttribute`) | 82.5 | 0.2 |
| uniform (`updateBinding`) | 1.8 | 15.6 |

- **Uniforms are tiny.** The code-hunter's top guess, per-program copies of the lamp block (est. 50–120 KB/f),
  measured at 1.8 KB/f. three's ~90 writeBuffer calls a frame are many small uniform writes, not bytes.
- **The bytes are a few large uploads of TLX's merged chunk index** (`tlx-chunked.js` `mergeVisible`; the
  `_renderTimed <- present` and `mirrorEnd <- mirror-pass` stacks):
  - whole-index rewrites of 400–760 KB (763 548 B = 190 887 Uint32 indices) on every change of the visible chunk
    set, in the main pass and the mirror pass
  - a re-created index buffer, a 1.18 MB `createBuffer` (main) or ~500 KB (mirror), whenever the set reached a new
    peak, because the array was allocated at exactly the needed size

## Fix 1 — the merged chunk index (TLX)

- **Growth.** A regrow allocates max(needed, 1.5 × previous), capped at the mesh's whole index, so a race reaches
  its peak in a few steps instead of one buffer per new peak.
- **Range.** The leading chunks that did not change keep their bytes; the upload range starts at the first change.
  A set that only lost tail chunks moves the draw range and uploads nothing.
- **Owed ranges.** three clears `updateRanges` after it uploads, on both backends (read in vendored r186: the
  WebGPU `updateAttribute` loop and WebGL's `bufferSubData` path both end in `clearUpdateRanges()`). So a range
  still queued when `mergeVisible` runs again is a change that never reached the GPU, because its pass did not
  draw. The next range starts no later than it.
- **Bit-identical.** The drawn range holds exactly the indices the old code wrote.
- **Test.** `tlx-chunked-lifecycle.test.mjs` "grows by half…" mirrors three's upload into a GPU copy and asserts the
  drawn indices after every set change, the range start, the tail-only case, the owed range and the cap. It fails
  on the old code.

## Fix 2 — the WGX mirror chain (worker B; hunt 5 W2)

- **Before:** WGX allocated and regenerated the mirror's full mip chain every mirror frame.
- **Now:** the chain holds what is sampled:
  - the inset's explicit LOD: floor(lod) + 2 levels
  - the cockpit glass: ceil(glassLod + 0.25) + 1, from `PostCommon.mipFootprintLod` over the glass mesh, with
    TLX's rules (a zero viewProj is skipped; one unbounded frame does not latch; two do)
- `createTexMesh` keeps the glass's CPU arrays. Growth re-allocates the target on the next `mirrorBegin`.
- **Test.** `webgpu-lifecycle.test.mjs` "perf hunt 6: WGX sizes the mirror chain…": 3 ladder passes with the inset
  alone (8 before; it fails on the old code), growth with a bound, full when unbounded.
- **GLX left as is.** Its ladder is one driver `generateMipmap` call, not app-recorded passes, and the glass bound
  needs CPU arrays GLX does not keep (about 25 lines in glx.js and post.js).

## Worker D — createBuffer churn sources

Counters added: `memState().churn` with `poolNew`, `poolPruned`, `streamNew` and `softReads`. They are held on the
functions and slots, with no new localStorage key.

| lead | verdict |
|---|---|
| particle stream re-wrap (`wrapStream` on an array-identity change) | REFUTED: `particles.js` allocates its vertex arrays once; a test drives 600 frames: 2 builds, 0 disposes |
| blob/decal padded Dynamic runs re-sending 65 600 B on a second render | REFUTED for a race: drawn once a frame (the mirror, env and shadow passes never flush them); only XR's second eye and the load-time warm draw them twice |
| tlx-shadow per-cast caster copy | REFUTED as churn: the cull packs into the caster's own array; one ranged write per shadow re-render |
| pooled wrappers (`acquireMesh`, re-minted after a 20 s prune) | PLAUSIBLE: now counted by `churn.poolNew` / `poolPruned` |
| the census's own headless readback (`softBlit`) | NOT CONFIRMED: the census `path:` row prints `softBlit=no (direct present)` for the TLX WebGPU leg, which contradicts it |

## Result (macOS census, before 41021778161 → after 41024223899, gpuErrors 0 on all four legs)

| leg | metric | before | after |
|---|---|---|---|
| TLX WebGPU | uploaded KB / frame | 193.0 (214.0 on 41008210504) | **67.9** |
| TLX WebGPU | index / attribute KB per frame | 82.5 / 111.9 | **35.8 / 53.5** |
| TLX WebGPU | createBuffer / frame | 1.06 (1.19) | **0.71** |
| TLX WebGPU | createBindGroup / frame | 0.44 (0.41) | **0.32** |
| TLX WebGPU | writeBuffer calls / frame | 90.4 | 89.3 (three's small uniform writes, unchanged) |
| TLX WebGPU | render passes / frame (median) | 22 | 22 |
| WGX | render passes / frame (median) | 31 | **26** |
| WGX | attachments stored / frame | 32.65 | **27.64** |
| WGX | mirror levels | full chain | **4** (glassLod 2.31) |
| WGX | uploaded KB / frame | 64.6 | 47.4 |

- Frames in the window differ (377 → 534); every row is per frame.
- fps is a paravirtual-runner number (PP-19) and is not quoted.

WORKER-C-PLACEHOLDER

## Not run / limits

- **Real iPhone.** BrowserStack offers only a human-driven Live session, and its newest iOS is 18.6, where WebGPU
  is off by default (hunt 5 notes). Device arms belong on #3954.
- **Local gfx-probe (WGX, plain TLX).** It fails on the deploy tip the same way in this container (a soft-present
  wall deadline, gpuErrors 0; hunt 5 notes). The macOS census is the hardware gate.
- **Lavapipe.** It records no frames in the armed window, so it cannot attribute uploads.
- **CI noise.** `perf-hot-bench` failed once on the `step` ceiling on 97cfeffe, a head that changes no game code.
  The runner was slow; the one allowed rerun passed (PR comment).

## Sources

- three.js r186 vendored build (`vendor/three-0.186.1/three.webgpu.min.js`): `updateAttribute` →
  `clearUpdateRanges()` on both backends, the `createIndexAttribute` path, `updateBinding`.
- WebGPU `GPUQueue.writeBuffer`: https://developer.mozilla.org/en-US/docs/Web/API/GPUQueue/writeBuffer
- three.js UBO cost with many render items, mrdoob/three.js#30560: https://github.com/mrdoob/three.js/issues/30560
- Hunt 5's research list (Apple tile memory, Safari 26 WebGPU, Metal counters): `PERF-HUNT-5-GPU-2026-10-30.md`
  §Sources.
