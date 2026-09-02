# Browser graphics, outside knowledge — 2026-09-02

What the wider world knows that this project did not. Gathered by a read-only
web agent; **every claim carries its confidence** because the container's egress
proxy blocks most of the canonical hosts (`w3.org`, `gpuweb.github.io`,
`developer.chrome.com`, `developer.mozilla.org`, `threejs.org`,
`discourse.threejs.org`, `khronos.org`, `web3dsurvey.com`). `github.com` and
`raw.githubusercontent.com` ARE reachable, which is why the strongest rows below
are all read straight out of a repository.

- **CONFIRMED** — the primary artifact was fetched and read (spec proposal,
  issue, PR, wiki, source file).
- **CONFIRMED\*** — primary source, but reached through a search engine's page
  extraction rather than a direct fetch. The surrounding text was not visible.
- **REPORTED** — blog, forum, secondary summary, or an unreproduced benchmark.

A CONFIRMED\* row is not a licence to quote a number as measured. Before any of
this becomes an argument for a change, re-read it from an unrestricted browser.

## The one that changed a shipped decision

**three.js draws `scene.backgroundNode` FIRST, with the depth test off.**
`Background.js` builds a `BackSide` `SphereGeometry(1, 32, 32)` with
`depthTest = false`, `depthWrite = false`, `frustumCulled = false`, and inserts
it with `renderList.unshift(...)` — the head of the opaque list, no
`renderOrder`. And `Renderer._renderScene` runs `renderList.sort(...)` **before**
`this._background.update(...)`, so the unshift cannot be undone by sorting.
CONFIRMED, read verbatim from
`raw.githubusercontent.com/mrdoob/three.js/dev/src/renderers/common/Background.js`
and `.../Renderer.js`.

That is the opposite of what `js/game.js` asks every backend to do and of what
GLX and WGX actually do (opaque → sky, depth write off, LEQUAL). It is the
mechanism behind the TLX sky item, and the reason that item is a **parity
defect** and not only a cost. The full three-way case, and the patch, are in
[RENDERER-PERF-AUDIT-2026-09-02.md](RENDERER-PERF-AUDIT-2026-09-02.md)
§"The sky, settled three ways".

Related and NOT verified: `_renderBundles()` runs before the opaque list, which
would put bundled geometry *behind* the depth-test-off background. That is an
inference from the call order, not an observation — test before relying on it
either way.

## WebGPU engine costs

1. `writeBuffer()`/`writeTexture()` got **up to 2× faster in Chrome 144**
   (2026-01-07), Dawn Wire users included. CONFIRMED\*. This invalidates the
   arithmetic behind most pre-2026 "build a staging belt" advice.
2. `writeBuffer` stays the recommended default — it finds staging space
   internally and issues a queued `copyBufferToBuffer`. A staging belt only pays
   when the data is not already in an `ArrayBuffer`. CONFIRMED
   (gpuweb/gpuweb#1428; thread opened 2021, still live — **partly stale**).
3. PlayCanvas measured bump-allocated staging + one batched copy at
   **57 → 48 ms CPU, 12.8 → 11.8 ms GPU** on a ~5,000-mesh scene. CONFIRMED
   (playcanvas/engine#5438, merged 2023-06-27) — **predates row 1**, so the
   remaining delta today is probably much smaller. Measure before building one.
4. The win is the **buffer layout, not the binding mechanism**: one large buffer
   + dynamic offsets took 3,000 → 15,000 cubes on an M1, while dynamic offsets
   versus a bind group per object is only ~7%. A uniform buffer may exceed
   64 KB — only the *bound range* must respect `maxUniformBufferBindingSize`,
   via `GPUBufferBinding.size`. CONFIRMED (mrdoob/three.js#30560, 2025-11).
5. Render bundles reset pipeline / bind group / vertex + index state **before
   and after** each execution, so a bundle must fully re-specify its state;
   `setViewport`/`setScissorRect`, blend constants, stencil reference and
   nested bundles are disallowed; resources are **re-bound**, not snapshotted,
   so buffer contents may change freely between executions. CONFIRMED
   (toji.dev source on GitHub). They are not *guaranteed* faster — the WG issue
   asking for that guarantee is still open (gpuweb#4104, 2023): author's own
   numbers were 45 ms → 9.5 ms (dedup) → 5.5 ms (bundles) for 40,000 objects.
6. **Immediates (push constants) shipped in Chrome 149-150.**
   `setImmediateData()`, WGSL `var<immediate>`, **`maxImmediateSize` 64 bytes**,
   scalars/vectors/matrices only — **arrays forbidden**, including inside
   structs. Gated on `wgslLanguageFeatures.has('immediate_address_space')`.
   CONFIRMED (gpuweb#5423, merged 2026-05-07).
7. **Transient (memoryless) attachments shipped in Chrome 146.** Keeps
   depth-stencil and MSAA colour in tile memory and skips the VRAM allocation.
   Constraints tightened in 149-150: `viewFormats` must be empty, views cannot
   narrow usage, and **a transient texture cannot be a `resolveTarget`**.
   CONFIRMED (gpuweb#5396, open in Milestone 2).
8. Timestamp queries are **quantized to 100 µs** in Chrome by default and need
   an isolated context. CONFIRMED\*. A 60 fps frame is ~16,000 µs, so this is
   fine for whole-pass timing and useless per-pass — accumulate over frames.
9. Shipping matrix (WG wiki, read 2026-09-02, CONFIRMED): Chrome 113
   Mac/Win/ChromeOS, 121 Android 12+, **144 Linux Intel**, **147 Linux NVIDIA**;
   Firefox **141 Windows, 147 all macOS**, Linux/Android expected 2026; Safari
   **26, all platforms, on by default**.
10. Multi-draw-indirect is **still not standard** — Canary flag only. Do not
    plan a shipping path on it. CONFIRMED\* (gpuweb/cts#3961 tracks the gap).
11. Subgroups shipped stable **Chrome 134** (2025-03). CONFIRMED\*.

## three.js r185+

1. **A 33-finding CPU audit of the per-frame hot path landed in r185**
   (mrdoob/three.js#33797, filed 2026-06-13, closed 2026-06-16 "every point
   addressed"). CONFIRMED. What it fixed tells you what the per-object cost
   *was*: a full 4×4 `matrixWorld.determinant()` per object per frame before the
   dirty check; **static render bundles fully re-projected every frame with the
   result unused**; `FrustumArray` recomputing planes per object × sub-camera;
   the material cache key **walking the prototype chain with a regex per
   property**; and **4-6 separate `writeBuffer` calls for contiguous matrix
   ranges**. TLX is pinned at r185, so it has these.
2. The headline **UBO/bind-group issue is still OPEN**: 20,000 non-instanced
   cubes run ~60 fps on WebGLRenderer against ~15 fps on WebGPURenderer (M1
   Pro), root-caused to per-object UBO bind + update. CONFIRMED (#30560, last
   active 2026-03).
3. **Memory: ~1,300 meshes → WebGL ~80 MB vs WebGPU ~211 MB (2.6×)**, closed as
   a duplicate so the memory half is not separately tracked. CONFIRMED
   (#33194). This is upstream corroboration for §2q's unattributed ~48 MB and
   for keeping the phone default on GLX.
4. `BatchedMesh` on WebGPU is **not** indirect-drawn — the `drawIndexedIndirect`
   PR is a never-merged draft, and the author reports it is *more* expensive
   than plain `drawIndexed` on Chrome macOS. CONFIRMED (#30645, 2025-03). A
   2024 report has `BatchedMesh` losing to WebGL on a Galaxy S20 FE (13 vs
   25 fps) — r169-era, re-measure before believing it (#29580).
5. `BufferAttribute.updateRange` is now `updateRanges` (an array) with
   `addUpdateRange()` / `clearUpdateRanges()`; r185 **merges adjacent ranges**.
   CONFIRMED (r185 changelog).
6. Open TSL retention issues as of r182: `StorageBufferAttribute` has **no
   disposal path**; `getArrayBufferAsync` allocates per call. CONFIRMED
   (#32969, still open).

## Mobile / tile-based GPUs — the best numbers here

Khronos' own measured Vulkan samples on real Mali silicon. These are the
strongest figures in this document.

- **Load/store actions.** `LOAD_OP_LOAD` vs `LOAD_OP_CLEAR` on colour costs
  **+600 MiB/s of reads**; `STORE_OP_STORE` vs `DONT_CARE` on depth costs
  **+555 MiB/s of writes**. An explicit clear command instead of `LOAD_OP_CLEAR`
  costs **~6 M extra fragment cycles/s**. CONFIRMED
  (KhronosGroup/Vulkan-Samples, `performance/render_passes`).
- **MSAA on Mali-G76 at 2168×1080/60.** 1× attachment 562 MB/s; 4× 2247 MB/s.
  With an **in-pass write-back resolve** the extra samples never reach external
  memory: ~3% bandwidth, ~500 mW. With a **separate resolve pass**: +2366 MiB/s
  read and +3951 MiB/s write (**~6.3 GB/s**) and +630 mW. CONFIRMED
  (`performance/msaa`).
- **Web translation of those two (INFERENCE, not cited).** WebGPU: `loadOp:
  "clear"` never `"load"`; `storeOp: "discard"` for anything not read after the
  pass; MSAA only through the pass's `resolveTarget`, never a manual blit.
  WebGL2: `invalidateFramebuffer` on depth/stencil at end of pass, and
  `blitFramebuffer` for the resolve. Apex 26 already does the WebGL2 half.
- **Sky/background last, depth test on, depth write off, at the far plane** so
  the depth test rejects covered pixels — worst precisely on tile-based
  hardware. REPORTED (no 2025+ primary found), and it is exactly what three.js's
  WebGPU background does NOT do.
- **`R11F_G11F_B10F` is 32 bpp against `RGBA16F`'s 64.** CONFIRMED\* as
  arithmetic. **No measured Mali/Adreno A/B was found** — treat the 2× as a
  bit count, not a frame-time delta.

## Frame pacing

- **rAF deltas cannot measure GPU headroom.** Inside budget the delta is pinned
  to the display interval — ~16.6 ms at 60 Hz whether the GPU spent 2 ms or
  14 ms. REPORTED, and it independently restates why `bench.html` exists.
- **Long Animation Frames (LoAF)** is the current main-thread jank instrument,
  shipped Chrome 123: `PerformanceObserver` on `long-animation-frame`, with
  render timing, style/layout breakdown, script attribution and
  `blockingDuration`. CONFIRMED\*.
- There is **no usable WebGL2 timer query for real users** —
  `EXT_disjoint_timer_query_webgl2` was disabled over timing-attack concerns and
  sits behind a developer flag. REPORTED. So GLX cannot self-report GPU time,
  and WGX's timestamp queries are the only in-page GPU number available.
- Do **not** `await queue.onSubmittedWorkDone()` between independent workloads —
  it serializes on the content timeline. REPORTED.

## What this says Apex 26 should do, ranked

1. **Move TLX's sky out of `scene.backgroundNode`.** Rows above make this the
   only item with three independent confirmations and a measured mobile cost
   model behind it. LANDED as a finding; the patch is in the audit doc.
2. **Keep `storeOp:"discard"` / `invalidateFramebuffer` discipline and resolve
   MSAA only via `resolveTarget`.** GLX already invalidates; WGX already uses
   `storeOp:"discard"` with a `resolveTarget`. This row is a *don't regress*.
3. **Consider `TRANSIENT_ATTACHMENT` for WGX's depth and MSAA colour**, feature
   detected, Chrome 146+. Watch the constraint that a transient texture cannot
   be a `resolveTarget`.
4. **Do not build a WebGPU staging belt on 2023 numbers.** Chrome 144 halved
   `writeBuffer` cost; coalescing adjacent writes into one span is the cheap
   part and is where three.js got its win.
5. **Render bundles are a real but conditional win** for the static half of the
   scene. Bundle boundaries must line up with viewport changes, and every
   bundle re-specifies its whole state.
6. **Immediates (64 B) suit a per-draw constant set** — but `DRAW_STRIDE`
   carries 144 B used, so WGX would have to split, and arrays are forbidden.
   Noted, not recommended.
7. **Nothing here argues for changing engine.** The upstream memory numbers
   (2.6×) agree with this repo's own measurements and with keeping GLX the
   default and the phone default.

## Named as unverified

`minUniformBufferOffsetAlignment = 256` as a spec default (widely repeated,
consistent with all three native APIs, but the spec table was unreadable from
here) — **this one matters**, because WGX backlog item 7 rests on Apple
reporting 32. Real-world extension support percentages for `WEBGL_multi_draw`
and `KHR_parallel_shader_compile`. A measured `R11F_G11F_B10F` vs `RGBA16F`
A/B. The exact date WebGPU reached W3C Candidate Recommendation (sources give
March, May and August 2026; only the 2026-08-20 CR Draft looks solid). Whether
`BundleGroup` geometry is actually painted over by the background. And every
CONFIRMED\* row, all of which rest on search extraction of a blocked page.
