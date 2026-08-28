# Local patches carried on the vendored three.js 0.185.1 build

The island is otherwise byte-identical to the pristine npm `three@0.185.1`
tarball (`build/three.{webgpu,core,tsl}.min.js` + `examples/jsm/tsl/display/
BloomNode.js` → `addons/tsl/display/BloomNode.js`). Both patches below live in
`three.webgpu.min.js` only, and both are asserted by
`tests/unit/gfx-backend-canary.test.mjs` — a vendor re-drop that silently
reverts either one fails the guard suite, not production. Re-apply BOTH on any
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
