# Cold first-race freeze on TLX WebGPU: the menu warm was being thrown away (2026-10-24)

A·W50, Fleet A (OrchA 32). Bryce, relayed by DAD from the Apex BrowserStack Profiler at 7:29 PM PT 2026-10-23: fix the
iPhone 14 Pro WebGPU cold first-race freeze by warming the race and mirror pipelines during the menu warm-up.

## Device numbers (before)

Device Farm run `apex-suite-s1-gputimer`, iPhone 14 Pro, iOS 27.0, three.js WebGPU, GPU timer on. Numbers from DAD
(the raw files are on the Profiler box).

| entry | window | frozen | longest | `mirrorPrepare` | `programWarm` |
|---|---|---|---|---|---|
| cold first race | 35.6 s | 10.7 s | 8.0 s | 32.3 s | 32.3 s |
| after 30 s of menu idle | 7.2 s | 2.3 s | 232 ms | 4.7 s | 4.7 s |
| second race, same session | 0.2 s | 0.2 s | 76 ms | 89 ms | 59 ms |

`gpuMs` reads −1 for the whole time `mirrorPrepare` is open: no frame completes. Steady race afterwards: ~60 fps.

`programWarm` is the part of `mirrorPrepare` spent waiting on the race entry's program warm
(`js/render/shared/mirror-pass.js` `warmWaitMark`), so the freeze is pipeline compilation, not the mirror pass.

## Census method

`scratch/w50/census.mjs` (not committed). It boots the game on lavapipe (TLX WebGPU, Dawn on Mesa's Vulkan ICD:
`apt-get install mesa-vulkan-drivers`), wraps `GPUDevice.createRenderPipeline(Async)` and `createShaderModule`, and
hashes every module's WGSL. It walks the player's path: title → RACE → select (Monza) → RACE SETTINGS. It waits for
`__apex.menuPrep()` to report the world built, `menuFinish` done, the garage prewarm settled and nothing compiling,
then presses START. Pins: `hudMirror` on (the mirror pass runs on a software adapter) and `tlxDrawWarm=1` (the draw
warm a real GPU runs).

## Root cause: `prunePool` destroyed the menu warm's pipelines

Before the fix (`base2`): the menu built 79 render pipelines, and race entry built **14 more**.

**13 of the 14 were byte-identical to pipelines the menu had already built.** Same vertex and fragment WGSL hash, same
targets (`rgba16float+r16float`), same depth bias (`[4,16]` floor, `[2,10]` terrain, `[-2,-4]` start line), same
cull and winding. They were built, destroyed, and built again.

How they were destroyed:

- three r186 destroys a render pipeline, and its programs, when the last RenderObject using it is deleted.
  `Pipelines.delete` calls `_releasePipeline` once `usedTimes` reaches 0 (`vendor/three-0.186.1/three.webgpu.min.js`).
  Switching a RenderObject to another pipeline frees the old one in the same way (`getForRender`).
- TLX's `prunePool` (`js/render/three/tlx.js`) drops every pooled wrapper not drawn for 20 s (`PRUNE_IDLE_MS`).
  `dropWrapper` dispatches `dispose`, which deletes the wrapper's RenderObject.
- The menu warm compiles the world while the garage or RACE SETTINGS is on screen, so the world's wrappers are not
  drawn. 20 s later they are dropped, and their pipelines go with them.
- The garage warm 20 s later rebuilt ten of them, and race entry rebuilt the rest synchronously on its first frames
  (`createRenderPipeline`, not the async variant).

On the iPhone 14 a lit pipeline costs about 1.2 s (`docs/archive/notes/COLD-FIRST-RACE-WARM-2026-10-23.md` §1), so 13 rebuilds
are roughly the 4.7 s "after menu idle" residue. The second race in a session is fast (89 ms) only because it starts
less than 20 s after the first race's frames last drew those wrappers.

## Fix: pin the pipelines

`pinPipelines` (`js/render/three/tlx.js`, next to `prunePool`) gives every render pipeline one extra use, so neither
`_releasePipeline` nor `_releaseProgram` reaches 0.

- It pins at creation: an instance-level wrap of `renderer._pipelines._getRenderPipeline`, armed at the first
  present. A sweep alone, at each warm's end, left 3 of the 4 remaining rebuilds, because a RenderObject switching
  pipeline mid-warm frees the old one before any sweep runs.
- A sweep at each warm's end (program, deferred mirror and rig warms) and before each prune pins anything built
  before the wrap was armed.
- It is capped at 512 pipelines and cleared on device loss.
- `__tlx.memState().warm.pinned` reports the count. There is no off switch: the A/B is this build against the one
  before it (a URL or storage knob would change the track-build VM digest or add a writer-less key).
- `vendor/three` is untouched, and `prunePool` still drops wrappers (and their geometry), so A·W45's #3677 pool
  behaviour is unchanged.

Test: `tests/unit/tlx-pipe-pin-warm.test.mjs` runs three r186's real renderer over the fake WebGL2 context. In the
control, dropping the last wrapper destroys the pipeline and the next draw links it again. With the pin, 0 links, and
a pipeline switched away from and back keeps its first build.

## After (lavapipe, same census)

| run | menu pipelines | race-entry pipelines | identical to a menu-built one | pinned |
|---|---|---|---|---|
| base | 79 | 14 | 13 | — |
| sweep pin only (`fix1`) | 69 | 4 | 3 | 67 |
| create-time pin (`fix2`) | 66 | 4 | 3 on the recorded fields (a field not recorded differs) | 68 |
| + rig both windings (`fix5`) | 66 | 4 (2 async under the rig cover, 2 cheap sync decals) | — | 68 |

With the create-time pin, `programWarm` inside `mirrorPrepare` fell from 1.1 s to 25 ms.

The 4 left:

- `none/ccw` and `none/cw` double-sided pairs of one lit program;
- two `-8`-biased decal states.

Three of them match a pinned pipeline on everything the census recorded (shaders, targets, bias, cull, winding), yet
three keyed them as new, so they differ in a field it did not record: the vertex-buffer layout or the blend.

The extended census (`fix3`) records the vertex buffers, blend, depth write and sample count. It names all four:

| pipeline | state | menu built | cost |
|---|---|---|---|
| `_90` lit, ccw | double-sided, opaque with an explicit `one/zero` blend that keeps alpha (the rig's no-alpha-write material) | the same program only with blend `null` or alpha blend | built async by the rig warm, under the cover |
| `_90` lit, cw | the same, mirrored | no | **synchronous on the first race frame** (a lit pipeline: about 1.2 s on an iPhone 14) |
| `_53` decal, `-8` bias | identical to its menu build on every GPU descriptor field; three's cache key differs | yes (same descriptor) | synchronous, cheap program |
| `_50` decal, `-8` bias, back/cw | position only, alpha blend, mirrored | no | synchronous, cheap program |

Fix for the lit one: the rig warm (`startRigWarm`) compiles a `DoubleSide` pair on both windings, because the race
also draws the rig's double-sided keep material mirrored. After it (`fix5`), the `_90` cw twin is built async by the
rig warm under the cover, not on the first race frame. The count stays 4, and only the two cheap decal states are
still built synchronously on the first race frame. Test: `tests/unit/tlx-rig-warm.test.mjs` (fails before, passes
after).

Lavapipe-only artifacts, not on a phone:

- `mirrorPrepare`'s tail: `mirrorBegin` refuses while the soft-present readback is pending (`_softReadPending`),
  hundreds of frames in a row.
- The rig warm's 9–11 s for 28 pairs, which builds 0 pipelines.

## Still open

- The 4 race-only states: warm them in the menu, or give them a state the menu already builds.
- **When** the menu warm starts. A·H15's lead: prep runs only on select, RACE SETTINGS or a home world that wants a
  track. Title → quick race starts the full compile at START. Starting the selected track's prep during title idle
  would move the cold compile out of race entry.
- The device before/after: gpu-census.yml on macos-latest (Dawn/Metal), then A·D2's iPhone 14 Pro cold entry,
  WebGPU then WebGL2.
