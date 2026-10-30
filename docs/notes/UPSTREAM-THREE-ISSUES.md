# Upstream three.js issues to file — drafts (2026-09-22)

Apex 26 vendors three.js r186 with three local patches
(`vendor/three-0.187.0/PATCHES.md`, `vendor/three-patches/patches.mjs`). None of
the three has an upstream issue or PR as of 2026-09-22 (searched mrdoob/three.js
issues and PRs semantically and by code search; each needle still matches `dev`
verbatim; no r187 exists). This session's GitHub access is scoped to this
repository, so the three bodies below are drafts for a human to post at
https://github.com/mrdoob/three.js/issues/new. Once filed, put each URL in the
patch's `upstream:` string in `patches.mjs` and in `PATCHES.md`.

---

## 1. WebGPURenderer: `GPUTextureViewDescriptor.swizzle = 'rgba'` is set unconditionally and needs a `texture-component-swizzle` feature gate

**Title:** WebGPURenderer: texture view `swizzle` is stamped on every `createView()` without the `texture-component-swizzle` feature gate

**Description**

`src/renderers/webgpu/descriptors/GPUTextureViewDescriptor.js` sets
`this.swizzle = 'rgba'` in the constructor and in `reset()`, and the descriptor is
passed as-is into every `device.createView()` call. The doc comment on `dev` now
reads "Requires the `'texture-component-swizzle'` feature; ignored otherwise", but
there is no runtime gate anywhere under `src/renderers/webgpu/` (the string
`texture-component-swizzle` appears once in the repository, in that comment).

Where the member is *not* ignored the renderer dies on its first pass: Chromium
141 validates `swizzle` as a `GPUTextureComponentSwizzle` dictionary, so the string
throws on every render pass — shadow-map allocation, the environment probe and
the main pass all fail, and a game that reloads on a renderer fault loops. The
feature ships behind a DevTrial from Chrome 142
(https://chromestatus.com/feature/5110223547269120), so the exposed browser
population is "every Chromium that validates the member but does not yet expose
the feature", and the identity swizzle carries no information in any case.

**Proposed fix**

Set `swizzle` only when the feature was requested and is present, e.g. in
`GPUTextureViewDescriptor` leave the member `undefined` and let the texture
utils write `'rgba'` (or a caller-supplied value) when
`device.features.has( 'texture-component-swizzle' )`. Our local patch simply
makes the member `undefined` at both sites, which is what the renderer behaves
like on every browser today that ignores it.

**Reproduction**

Any `WebGPURenderer` scene on Chromium 141 (Windows/macOS/Android) — the first
`renderer.render()` throws from `createView`. Downstream reference:
Apex 26 (`brycejmurrin/f1-game`), `vendor/three-0.187.0/PATCHES.md` §1.

**three.js version:** r185, r186, `dev` (2026-09-22).

---

## 2. WGSLNodeBuilder: render-stage node variables are module-scope `var<private>`, which exceeds WebKit's 8 KiB private address space on large fragment graphs

**Title:** WGSLNodeBuilder: emit vertex/fragment node variables inside `main()` — module-scope `var<private>` exceeds WebKit's 8192-byte limit on iOS/Safari 26

**Description**

`WGSLNodeBuilder.getVars( shaderStage, global )` emits every node variable
(`.toVar()`, property nodes, inlined `Fn` temporaries) as a module-scope
`var<private>` when `global` is true, and `buildCode()` passes
`allowGlobalVariables` (default true) for every stage. The compute template
already places the function-scope form inside `main()` when
`allowGlobalVariables` is false; the vertex and fragment templates never do.

WebKit (iOS 26 / Safari 26) refuses any WGSL module whose `var<private>`
declarations sum past 8,192 bytes:

```
Render pipeline creation failed (renderPipeline_MeshBasicNodeMaterial_41):
The combined byte size of all variables in the private address space exceeds 8192 bytes
```

A lit TSL fragment with a few hundred nodes crosses that easily (ours declared
~1,600 variables, ~12.4 KB), so the pipeline never builds and the scene draws
only what has no such material. Dawn does not check the sum, so no Chromium
run sees it; it only surfaces on Apple devices.

**Proposed fix**

Emit render-stage vars at function scope: `buildCode()` passes
`shaderStage === 'compute' && allowGlobal` to `getVars`, and the vertex and
fragment templates move their `// vars` block from module scope to the top of
`main()` (the indent form `getVars` already produces for `global = false`).
`varyings`, `output` and `instanceIndex` stay `var<private>` (a few dozen bytes).
Caveat we checked on our own graphs: a layouted helper `fn` (`setLayout`) that
reads a node variable would no longer see it; none of three's `tsl_*` helpers
do, and our diff is three string edits against `dev`.

**Reproduction**

Any `MeshStandardNodeMaterial`/`MeshPhysicalNodeMaterial` graph large enough to
declare >8 KiB of node vars, opened in Safari 26 on iOS 26 with WebGPU on.
Downstream reference: Apex 26 (`brycejmurrin/f1-game`),
`vendor/three-0.187.0/PATCHES.md` §4 (WGSL dumps from the affected iPhone,
2026-09-03).

**three.js version:** r185, r186, `dev` (2026-09-22).

---

## 3. `yieldToMain()` falls back to `requestAnimationFrame`, so `compileAsync()` stalls in hidden tabs and costs one display frame per render object without `scheduler.yield`

**Title:** utils.yieldToMain: use a MessageChannel task, not requestAnimationFrame, as the fallback when `scheduler.yield` is absent

**Description**

`src/utils.js`:

```js
function yieldToMain() {
	if ( typeof self !== 'undefined' && typeof self.scheduler !== 'undefined' && typeof self.scheduler.yield !== 'undefined' ) {
		return self.scheduler.yield();
	}
	return new Promise( resolve => {
		requestAnimationFrame( resolve );
	} );
}
```

`Renderer.compileAsync()` awaits `yieldToMain()` after every projected render
object, cached pipelines included. Where `scheduler.yield` is missing (Safari,
Firefox, older Chromium) each await is a display-frame wait, so a warm-up of a
few hundred objects takes a few hundred frames even when every pipeline is
already cached, and a hidden tab (where rAF does not fire) never finishes
compiling at all — an app that holds its loop until `compileAsync` resolves
hangs when the player switches tabs during loading.

**Proposed fix**

Keep the native `scheduler.yield()` branch. For the fallback, post a task:

```js
return new Promise( resolve => {
	if ( typeof MessageChannel === 'undefined' ) { setTimeout( resolve, 0 ); return; }
	const channel = new MessageChannel();
	channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); };
	channel.port2.postMessage( null );
} );
```

A macrotask yields to input and rendering without waiting for a frame and runs
in hidden tabs; a resolved promise (microtask) would not yield at all, which is
why it is not the proposal.

**Reproduction**

`renderer.compileAsync( scene, camera )` on a scene with ~300 meshes in Safari,
with the tab backgrounded before the call resolves. Downstream reference:
Apex 26 (`brycejmurrin/f1-game`), `vendor/three-0.187.0/PATCHES.md` §5.

**three.js version:** r184–r186, `dev` (2026-09-22).

## 4. WebGPURenderer: no way to discard a single-sample attachment's store (draft, 2026-10-24; carried as vendored patch 17)

**Title:** WebGPUBackend: allow `storeOp: 'discard'` for single-sample render-target attachments

**Body:**

`RenderTarget.storeMultisampledColorBuffer` / `storeMultisampledDepthBuffer` (r183+) let an
app skip the store of an MSAA attachment, but `WebGPUBackend.beginRender` gates both on
`renderContext.sampleCount > 1`:

```js
const discardColor = renderContext.sampleCount > 1 && renderTarget?.storeMultisampledColorBuffer === false;
const discardDepth = renderContext.sampleCount > 1 && renderTarget?.storeMultisampledDepthBuffer === false;
```

A single-sample attachment is always `GPUStoreOp.Store`. On tile-based GPUs (Apple, most
Android) a store is a full write of the tile memory to RAM. Common attachments that nobody
reads after the pass:

- an MRT side output that is only conditionally sampled (e.g. a reflection mask that the
  composite reads only when wet);
- the colour of a depth-only pass. WebGPU can render colourless, but a `RenderTarget`
  always carries a texture;
- a depth buffer used only for the depth test, when the app uses a `DepthTexture` so it
  *can* sample it on some frames.

WebGL apps get this today with `gl.invalidateFramebuffer`. The WebGPU path has no
equivalent.

**Proposal:** keep the MSAA semantics and add single-sample flags that change the
storeOp only (not the loadOp, so a cleared pass stays cleared and a loaded pass still
loads). Either generalise the existing members (`storeColorBuffer` / `storeDepthBuffer`, or
drop the `sampleCount > 1` guard when the target is single-sample and the user opted
in), or accept a per-attachment array for MRT, e.g. `renderTarget.storeColorBuffers = [true, false]`.
Our local patch (vendor/three-patches/patches.mjs id 17) uses a bitmask and a
boolean read at every `beginRender`. It is three edits in `beginRender`.

**Related, not part of this ask:** #30560 (per-object UBO / bind-group cost) is the other
WebGPU-on-phone cost we see (about 9 `queue.submit` and 38 `writeBuffer` per frame in our
census). It is open and High priority with no linked PR as of 2026-10-24
(https://github.com/mrdoob/three.js/issues/30560); sunag (2026-01-06): sharing buffers across groups of
similar objects is in progress. r186 already ships `BundleGroup` (render bundles), which
TLX does not use yet, so that is the lever to measure first. See
`docs/archive/notes/RENDERER-ALTERNATIVES-2026-10-24.md`.

## 5. WGSLNodeBuilder: a 3-component colour target gets a `vec3` fragment output, which makes alpha blending invalid (draft, 2026-10-24; carried as vendored patch 18)

**Title:** WebGPURenderer: rendering a blended material into an `RGBFormat` (e.g. `rg11b10ufloat`) target fails pipeline validation

**Body:** `NodeBuilder.getOutputType()` derives the fragment output type from the render
target texture (`getTextureType()`: `RGBFormat` → length 3), so the WGSL output is
`@location(0) color: vec3<f32>`. WebGPU then rejects any blend state whose source factor
reads alpha (`src-alpha`, `one-minus-src-alpha`, …): "validating GPUFragmentState" requires
the output to have an alpha component when a blend factor uses it. Every `NormalBlending`
transparent material fails to build its pipeline against such a target. The WebGPU spec
accepts a `vec4` output for an RGB attachment, so the builder can keep `vec4` for 3-component
colour targets. A one-method override in `WGSLNodeBuilder`, as in our local patch
(vendor/three-patches/patches.mjs id 18), fixes it. `rg11b10ufloat` halves an HDR scene
target's bandwidth against `rgba16float`, which matters on tile GPUs.
