
## 8. TSL → WGSL codegen runs synchronously inside `render()` on a node-builder cache miss — the mid-race hitch

`Renderer._renderObjectDirect()` calls `_nodes.updateBefore( renderObject )` before
anything else, and that calls `renderObject.getNodeBuilderState()`, which on a cache
miss runs `NodeBuilder.build()` — the whole TSL graph generated into WGSL —
synchronously, inside the frame.

**Measured** (gpu-census 202, macos-latest Metal, the three.js/WebGPU leg, race
window, 16.2 s sampled, 67% idle): `build` is the top non-idle function at **663 ms**,
and its traversal helpers (`_getChildren`, `getChildren`, `getDataFromNode`, `n`,
`setup`, `addNode`, `getNodeFromHash`, `setData`) add **~1,010 ms** — about 1.7 s of
code generation, roughly a third of all busy main-thread time, ~35 ms per program
across the 48 modules the race builds, clustering when streamed content brings
several new programs into view on one frame. Those are the 258–556 ms callbacks.
Patch 7 moved the GPU compile off the thread and census 201 proved that was not where
the time was: codegen precedes it on the same call.

three already ships the yielding half. `Nodes.getForRender( renderObject, true )`
builds through `NodeBuilder.buildAsync()` (which yields between nodes — patch 5 makes
that yield a MessageChannel task rather than a display frame), fills
`nodeBuilderCache` and the render object's data on resolve, and
`_renderObjectDirect` already gates `backend.draw` on `_pipelines.isReady()`. Only
`compileAsync()` ever asks for it.

**The fix**, one exact-count edit at the top of `_renderObjectDirect`: on a
node-builder cache miss outside `compileAsync` (`this._compilationPromises === null`)
and outside render-bundle recording (`this._currentRenderBundle === null` — a skipped
object would be omitted from the bundle for good), start
`this._nodes.getForRender( renderObject, true )` once (a flag on the render object's
node data stops re-entry while it builds) and `return`. The object is skipped until
its state exists, then takes the ordinary cached path; patch 7's `draw()` guard and
upstream's `isReady()` cover the pipeline side. `_nodeBuilderState` is initialised to
`null`, so the miss test is `=== null`, not `undefined`. The sync path stays reachable
behind `globalThis.__apexSyncCodegen === true` for an A/B.

Visible cost: an object that needs a program the warm never built appears a few
frames late instead of stalling the frame it appears in. Unfixed upstream as of r186;
draft in `docs/notes/UPSTREAM-THREE-ISSUES.md` §5. Retire when the default path can
build asynchronously upstream.

Amended 2026-09-22 (gpu-census 210): the yielding build now STARTS from a
`yieldToMain()` task rather than at the call site. An async function runs
synchronously to its first `await`, and `buildAsync()` runs `prebuild()` — the
material's whole setup traversal, the heaviest part of the codegen — before its
first yield, so the first version still put `build`/`getChildren` under `setup`
inside the rAF callback (17% of the time inside the ≥ 100 ms frames of a driven
window on real Metal, caller chain `_renderObjectDirect` → … → `setup` → `build`).
