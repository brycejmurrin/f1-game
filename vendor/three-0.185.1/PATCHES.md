# Local patches carried on the vendored three.js 0.185.1 build

The island is otherwise byte-identical to the pristine npm `three@0.185.1`
tarball (`build/three.{webgpu,core,tsl}.min.js` + `examples/jsm/tsl/display/
BloomNode.js` → `addons/tsl/display/BloomNode.js`). All three patches below live in
`three.webgpu.min.js` only, and each is asserted by
`tests/unit/gfx-backend-canary.test.mjs` — a vendor re-drop that silently
reverts any one fails the guard suite, not production. Re-apply ALL THREE on any
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
