# Local patches carried on the vendored three.js 0.185.1 build

The island is otherwise byte-identical to the pristine npm `three@0.185.1`
tarball (`build/three.{webgpu,core,tsl}.min.js` + `examples/jsm/tsl/display/
BloomNode.js` → `addons/tsl/display/BloomNode.js`). Patches 1–4 below live in
`three.webgpu.min.js`; patch 5 lives in `three.core.min.js`. Each is asserted by
`tests/unit/gfx-backend-canary.test.mjs` — a vendor re-drop that silently
reverts any one fails the guard suite, not production. Re-apply ALL FIVE on any
vendor bump, then re-run `npm run test:tlx` and the TLX WebGPU boot diag.

## 1. swizzle — Chromium 141 rejects the r185 texture-view descriptor

Upstream r185 added `src/renderers/webgpu/descriptors/GPUTextureViewDescriptor.js`
with `this.swizzle = 'rgba'` in the constructor AND `reset()`, passed
unconditionally into every `createView()`. Chromium 141 validates `swizzle` as a
`GPUTextureComponentSwizzle` dictionary, so the string throws on every render
pass: shadow alloc dead, env probe dead, `present()` throws on the first race
frame → TLX refuses the tab and reloads. Identity swizzle carries no
information, so omitting the member is behavior-identical everywhere.

Still unfixed upstream as of `186dev` (2026-08-27): no feature gate
(`device.features.has('texture-component-swizzle')` is checked nowhere), and no
upstream issue filed. The correct upstream fix is that feature gate — worth
filing so the patch can eventually retire.

Recipe (length-preserving, 2 sites):

```sh
sed -i 's/this\.swizzle="rgba"/this.swizzle=void 0/g' three.webgpu.min.js
```

A bump where this sed finds ZERO sites means upstream changed the descriptor —
re-read it before assuming the patch is obsolete.

## 2. #33952 bind-group leak — backport of PR #33954 (milestoned r186, unreleased)

`Bindings._destroyBindings()` releases sampled-texture bindings without removing
the destroyed bind group from the shared texture's `bindGroups` Set, so the Set
grows unboundedly holding `NodeSampledTexture` refs — exactly TLX's
shared-texture-node + material-churn pattern. Backport = the merged upstream
form of the `isSampler` branch (see `src/renderers/common/Bindings.js` on
`dev`), translated into the minified body:

```
before: e.isSampler&&(!0!==e.isSampledTexture&&this.backend.destroySampler(e),e.release())
after:  e.isSampler&&(!0!==e.isSampledTexture?this.backend.destroySampler(e):null!==e.texture&&(r=>{void 0!==r.bindGroups&&r.bindGroups.delete(t)})(this.textures.get(e.texture)),e.release())
```

(`e` = binding, `t` = bindGroup, `this.textures` = the Textures manager — all
property names survive minification; only the locals are mangled, so verify the
local names against the surrounding `_destroyBindings(e){for(const t of e){...}`
shape on a new bundle.) This unblocked the deferred material `dispose()` pass in
`js/render/three/tlx.js` (materialFor eviction → `_matDispose`, flushed in
`present()` after paint) and `js/render/three/tsl-fx.js` (`flushEvicted`).
Drop this patch on the first release that contains PR #33954 (r186+), and keep
the deferred-dispose game code as-is — it is correct against fixed upstream too.

## 3. #34405 polygonOffset missing from the WebGPU pipeline key — backport of PR #34406 (milestoned r186, unreleased)

`WebGPUBackend.getRenderCacheKey()` / `needsRenderUpdate()` on r185 key a
pipeline on blend, depth, stencil, side, sample count and formats — but NOT on
`polygonOffset` / `polygonOffsetFactor` / `polygonOffsetUnits`. Two materials
that differ only in depth bias therefore share ONE `GPURenderPipeline`, and
whichever was built first decides the bias for both. TLX creates exactly such
bias-only variants: the road decals in `js/render/three/tsl-fx.js` (−4/−8) and
the `o.depthBias` material variants in `js/render/three/tsl-lit.js` — on the
WebGPU backend one of each pair drew with the other's bias (z-fighting or a
decal buried under the road, depending on build order). The WebGL2 backend is
unaffected (polygonOffset is GL state there, not pipeline state).

Backport = the three merged sites, in minified form (locals `r`/`s`/`t`
survive unchanged on this bundle; re-verify against the surrounding
`getRenderCacheKey(e){const{object:t,material:r}=e` and
`needsRenderUpdate(e){const t=this.get(e),{object:r,material:s}=e` shapes):

```
key:     r.stencilWriteMask,r.side,        → r.stencilWriteMask,r.polygonOffset,r.polygonOffsetFactor,r.polygonOffsetUnits,r.side,
compare: t.stencilWriteMask===s.stencilWriteMask&&t.side===s.side
         → …&&t.polygonOffset===s.polygonOffset&&t.polygonOffsetFactor===s.polygonOffsetFactor&&t.polygonOffsetUnits===s.polygonOffsetUnits&&t.side===s.side
assign:  t.stencilWriteMask=s.stencilWriteMask,t.side=s.side
         → …,t.polygonOffset=s.polygonOffset,t.polygonOffsetFactor=s.polygonOffsetFactor,t.polygonOffsetUnits=s.polygonOffsetUnits,t.side=s.side
```

Drop this patch on the first release that contains PR #34406 (r186+).

## 4. WebKit's 8 KB private address space — node variables move into main()

iOS/Safari 26 (WebKit WGSL compiler) refuses any module whose module-scope
`var<private>` declarations sum past 8,192 bytes:

```
Render pipeline creation failed (renderPipeline_MeshBasicNodeMaterial_41):
The combined byte size of all variables in the private address space exceeds 8192 bytes
```

r185's `WGSLNodeBuilder` emits EVERY node variable (`.toVar()`, property nodes,
inlined `Fn` temporaries) as a module-scope `var<private>`, in the `// vars`
block above `fn main`. Apex's lit fragment declared 1,597 of them (~12.4 KB
natural size); the small sky shader stayed under the cap, so the owner's iPhone
drew the sky and nothing else (2026-09-03), with zero GPU errors reported
until the `uncapturederror` listener form landed. Dawn (Chromium) does not
check the sum, so no software or Metal Chromium run ever saw it.

The builder already has the function-scope form: `getVars(stage, false)`
emits `var name : type;` with a tab indent, and the COMPUTE template places
it inside `main()` when `allowGlobalVariables` is false. The render templates
never did. Backport = make the render stages use the function-scope form and
move the block into `main()` (3 minified sites):

```
call site:  s.vars=this.getVars(t,r),s.codes=            → s.vars=this.getVars(t,"compute"===t&&r),s.codes=
vertex:     …varyings : VaryingsStruct;\n\n// vars\n${e.vars}\n\n// codes\n${e.codes}\n\n@vertex\nfn main( … ) -> VaryingsStruct {\n\n\t// flow
            → …varyings : VaryingsStruct;\n\n// codes\n${e.codes}\n\n@vertex\nfn main( … ) -> VaryingsStruct {\n\n\t// vars\n\t${e.vars}\n\n\t// flow
fragment:   // uniforms\n${e.uniforms}\n\n// vars\n${e.vars}\n\n// codes\n${e.codes}\n\n@fragment\nfn main( … ) -> ${e.returnType} {\n\n\t// flow
            → // uniforms\n${e.uniforms}\n\n// codes\n${e.codes}\n\n@fragment\nfn main( … ) -> ${e.returnType} {\n\n\t// vars\n\t${e.vars}\n\n\t// flow
```

Safe for every shader this game generates: across the 37 dumped modules no
helper `fn` (three's `tsl_*` layouted functions) reads a node variable — only
`main` does (`artifacts/wgsl-dump-iphone`, checked 2026-09-03). A TSL graph
that reads a `.toVar()` from inside a `setLayout` function would break under
this patch; none of ours does, and `js/render/three/tsl-chunks.js` keeps the
layouted noise helpers pure. `varyings`, `output` and `instanceIndex` stay
`var<private>` (a few dozen bytes). Pair with the `setLayout` on the shared
noise helpers (same commit) — that is what took the lit shader from 1,597
node variables to a compilable size; this patch is what makes the remainder
not count. Drop when upstream emits render-stage vars at function scope (no
such change on `dev` as of 2026-09-03; worth filing).


## 5. Warm-up yields tasks instead of display frames without scheduler.yield

`Renderer.compileAsync()` walks every projected render object and awaits
`yieldToMain()` after each one, including objects with cached pipelines. The
r185 fallback in `three.core.min.js` (`li`, exported as `yieldToMain`) used
`requestAnimationFrame`. Without native `scheduler.yield`, that imposes a
separate display-frame wait per object while Apex deliberately holds the game
loop during compilation. Hidden tabs can stop the fallback entirely.

Keep native `self.scheduler.yield()` unchanged, including its method receiver.
Replace only the fallback with a MessageChannel task; close both ports before
resolving. Environments without MessageChannel use `setTimeout(resolve, 0)`.
Do not substitute a resolved Promise/microtask, which does not yield to browser
input or rendering. This fallback does not promise native scheduler priority.

Recipe in the pinned bundle: replace the body of `function li()` with:

```js
function li() {
  return typeof self !== "undefined" && self.scheduler !== undefined &&
    self.scheduler.yield !== undefined ? self.scheduler.yield() : new Promise(resolve => {
      if (typeof MessageChannel === "undefined") { setTimeout(resolve, 0); return; }
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close(); channel.port2.close(); resolve();
      };
      channel.port2.postMessage(null);
    });
}
```

Regression tests exercise the actual vendored function body: native method
preservation, asynchronous/concurrent completion, both-port cleanup, absence
of animation-frame waits, and the timer fallback. No GPU commands, shader
content, compilation ordering, or render-target ownership change. Real iPhone
latency remains to be measured; this patch removes the frame-based scheduling
cost, not the underlying shader compilation work.
