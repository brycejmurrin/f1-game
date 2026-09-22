
## 7. Lazy render pipelines compile SYNCHRONOUSLY on first draw — the mid-race hitch

`Pipelines.getForRender( renderObject, promises = null )` reaches the backend with
`promises === null` on every path except `Renderer.compileAsync()`, and
`WebGPUPipelineUtils.createRenderPipeline()` then takes the blocking form:

```js
if ( promises === null ) {
	pipelineData.pipeline = device.createRenderPipeline( _renderPipelineDescriptor );
```

So the first draw of any (material, geometry layout, render context) combination the
one-time warm never saw stalls the main thread for the whole compile. TLX warms once,
during the lights (`js/game.js:2737` → `startProgramWarm` → `compileAsync( scene )`),
and `present()` returns early while a warm is in flight, so nothing after the lights
can be warmed without freezing the picture. The shadow casters are not even in
`scene` — `tlx-shadow.js` keeps them in their own `castScene`.

**Measured** on `macos-latest` Metal, real present path (gpu-census 198 and 199):

| leg | sync compiles in the race window | spikes | worst frame |
|---|---|---|---|
| three.js / WebGPU | **25-26** `createRenderPipeline` (+23 async, the warm) | 10-16 | 405-556 ms |
| three.js / WebGL2 | 31-32 `linkProgram`, 224-269 blocking `getProgramParameter` | 31-65 | 6.1-7.5 s |
| WGX | **1** | 1 | 11.5 ms |

Compile count tracks spike count one for one across all three legs. The WebGL2 leg
tagged half its links `async tlx.js:1796` — the warm — and the other half unnamed:
half the programs a race needs are built after the lights.

**The fix**, three exact-count edits: (1) the sync branch is gated behind
`globalThis.__apexSyncPipelines === true`, so the lazy path takes
`createRenderPipelineAsync` like `compileAsync` already does; (2) that branch's
`promises.push( p )` is null-guarded, since the lazy path carries no array; (3)
`WebGPUBackend.draw()` returns when `pipelineData.pipeline` is still `undefined`,
right after the existing `error` skip and before any encoder state is touched — the
object draws a frame or two late instead of `setPipeline( undefined )` throwing. TLX
records no render bundles (a bundle recorded while a pipeline was missing would omit
the object for good), which is the one place this guard would be wrong.

The sync branch stays reachable for an A/B: `globalThis.__apexSyncPipelines = true`
before boot restores r186's behaviour, and the census `work:` row counts the calls.

Unfixed upstream as of r186: only `compileAsync()` passes a promises array. Draft
issue in `docs/notes/UPSTREAM-THREE-ISSUES.md`. Retire when the default path goes
async upstream.
