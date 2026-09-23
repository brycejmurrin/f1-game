# Upstream three.js issues to file — drafts (2026-09-22)

Apex 26 vendors three.js r186 with three local patches
(`vendor/three-0.186.0/PATCHES.md`, `vendor/three-patches/patches.mjs`). None of
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
Apex 26 (`brycejmurrin/f1-game`), `vendor/three-0.186.0/PATCHES.md` §1.

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
`vendor/three-0.186.0/PATCHES.md` §4 (WGSL dumps from the affected iPhone,
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
Apex 26 (`brycejmurrin/f1-game`), `vendor/three-0.186.0/PATCHES.md` §5.

**three.js version:** r184–r186, `dev` (2026-09-22).

## 4. WebGPUBackend: a render pipeline first needed outside `compileAsync()` is built with the synchronous `device.createRenderPipeline`, so every new material/geometry/context combination stalls the frame that introduces it

**Title:** WebGPURenderer: use `createRenderPipelineAsync` on the lazy path too, and skip the draw until the pipeline lands

**Description**

`src/renderers/common/Pipelines.js` reaches the backend with `promises = null` on
every path except `Renderer.compileAsync()`, and
`src/renderers/webgpu/utils/WebGPUPipelineUtils.js` then takes the blocking form:

```js
if ( promises === null ) {
	pipelineData.pipeline = device.createRenderPipeline( _renderPipelineDescriptor );
	...
} else {
	const p = new Promise( async ( resolve ) => {
		pipelinePromise = device.createRenderPipelineAsync( _renderPipelineDescriptor );
		...
	} );
	promises.push( p );
}
```

So an application that warms with `compileAsync()` once still pays a synchronous
compile on the first draw of any (material, geometry layout, render context)
combination the warm did not contain — and in a scene that streams content, most
combinations arrive after the warm. `compileAsync()` cannot be re-run mid-scene
without the renderer refusing to draw over the in-flight build.

**Evidence** (racing game, three r186, macOS Metal, headless Chromium, real
present path; counts from wrapping `GPUDevice.prototype.createRenderPipeline`):
in a ~30 s window after the start of a race, **25–26 synchronous
`createRenderPipeline` calls** alongside the 23 async ones the warm issued, and
10–16 rAF callbacks costing **258–556 ms** — each one a compile. The same scene
on a hand-rolled WebGPU backend that builds its pipelines up front: 1 compile,
1 spike, 11.5 ms. The WebGL backend shows the same shape through `linkProgram`
plus a blocking `getProgramParameter( LINK_STATUS )`, at 6–7 s worst case.

**Proposed fix** (carried locally as vendor patch 7, three edits):

1. Take the `createRenderPipelineAsync` branch when `promises === null` as well;
   null-guard the trailing `promises.push( p )`.
2. In `WebGPUBackend.draw()`, return early while `pipelineData.pipeline` is
   still `undefined`, next to the existing `pipelineData.error` skip and before
   any encoder state is touched. The object draws a frame or two late instead
   of the frame stalling; `setPipeline( undefined )` is never reached.

Caveat for the general case: a render bundle recorded while a pipeline was
still building would omit that object for the bundle's lifetime, so a bundle
path needs either to wait or to invalidate the bundle when a pending pipeline
resolves. This application records no bundles.

Related: #34632 / PR #34506 made `compileAsync()` itself non-blocking (r184);
this is the same request for the default path.

## 5. Renderer: a node-builder cache miss during `render()` generates the object's WGSL synchronously inside the frame, although `NodeBuilder.buildAsync()` exists and is only reachable through `compileAsync()`

**Title:** Renderer: build a missing NodeBuilderState asynchronously on the render path and skip the object until it lands

**Description**

`_renderObjectDirect()` calls `this._nodes.updateBefore( renderObject )` first, which
calls `renderObject.getNodeBuilderState()`:

```js
getNodeBuilderState() {
	return this._nodeBuilderState || ( this._nodeBuilderState = this._nodes.getForRender( this ) );
}
```

and `Nodes.getForRender( renderObject, useAsync = false )` on a cache miss runs
`nodeBuilder.build()` synchronously. The `useAsync` branch — `buildAsync()`, which
yields between nodes — is reached only from `getForRenderAsync()`, i.e. from
`compileAsync()`. An application that warms once with `compileAsync()` and then
streams content therefore pays the full code generation of every new (material,
geometry layout, render context) combination inside the frame that introduces it.

**Evidence** (racing game, r186, macOS Metal, headless Chromium, CDP CPU profile over
a ~30 s race window, 67% idle): `build` is the top non-idle function at 663 ms and its
traversal helpers add ~1,010 ms — ~1.7 s of synchronous codegen at ~35 ms per program
across 48 programs, clustering into 258–556 ms frames when several new programs come
into view together. Making the pipeline creation async first (issue §4) left those
frames unchanged, which is how the codegen was isolated.

**Proposed fix** (carried locally as vendor patch 8): at the top of
`_renderObjectDirect()`, when `_compilationPromises === null`, no render bundle is being
recorded, and `nodeBuilderCache` has no entry for `getForRenderCacheKey( renderObject )`,
call `this._nodes.getForRender( renderObject, true )` once (guarding re-entry with a
flag on the object's node data) and return; the existing `_pipelines.isReady()` gate
already skips the draw until a pipeline exists. The object appears a few frames late
instead of stalling the frame. Render bundles need either to wait or to invalidate
the bundle when a pending state resolves; this application records none.
