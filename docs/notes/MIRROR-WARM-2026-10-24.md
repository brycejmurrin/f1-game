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
  `Pipelines.delete` calls `_releasePipeline` once `usedTimes` reaches 0 (`vendor/three-0.187.0/three.webgpu.min.js`).
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

## On the device after #3713 (Device Farm ledger row 29, 2026-10-25)

iPhone 14 Pro 20ACE5A3, fresh unit, WebGPU, live build 21432 (#3713 in). A·D2's `coldrace` scenario, arm `menu30`
(menu prep, then 30 s idle on RACE SETTINGS, then START), Monza day. Only that first arm is cold.

| stage | before (s1-gputimer, 30 s menu idle) | after #3713 |
|---|---|---|
| `mirrorPrepare` at race start | 4.7 s | **67 ms** |
| `programWarm` at race start | 4.7 s | **none**: no warm record has `where: "race"` |
| `rigWarm` at race start | not separated | **5.7 s** (28 pairs, `mirror: true`) |

Both warm records are `where: "menu"`: the world warm (28.8 s total, mirror 7.3 s) and the garage warm (17.0 s). 92
pipelines are pinned. Later arms in the same session (Safari cache warm) read `rigWarm` 81–121 ms. So the cold
race-start cost left on the menu path is the cockpit rig's own pipelines. The rig warm needs the race's player car,
so no menu or title warm builds them. That is the next item (issue #3673's first-race lane).

## The title warm (follow-up, 2026-10-25)

Device Farm S5 (iPhone 14 Pro WebGPU, ~8:53 PM PT 2026-10-24): 45 s of TITLE idle advanced nothing. `menuPrep()`
read world, done and warmed false in all 9 samples, so a cold title → START still compiled at the lights:
`mirrorPrepare` 34.7 s, worst hitch 9.2 s. The prep's `current()` (`game.js` `scheduleFlybyTrack`) accepted only the
track picker, RACE SETTINGS or a circuit Home.

Bryce chose "once per update" (2026-10-25, via OrchA 32). `js/perf/title-warm.js` (`TitleWarm`) polls the title once a
second. When the title has been idle for `MENU_IDLE_MS`, it calls `scheduleFlybyTrack(true)`, and `current()` also
accepts a title warm in progress (`titleWarm.wants()`). Everything after that is the existing menu prep: stepped
build, car assets, `warmPrograms`, hidden warm frames.

- **Once per update on a phone.** `apex26.titleWarm` holds the build (`<meta name="apex-build">`) whose title warm
  completed. A phone (GaragePrebuild's `phoneHold`) with that build skips it. Safari keeps compiled pipelines across
  sessions (row 10 of the ledger: 7.3 s, then 0.24 s), so only the first title session after a deploy pays for
  the speculative world. Desktop and hardware warm every session.
- **Never** under Save-Data / prefers-reduced-data, behind a hidden tab, under a menu sheet, during the title intro,
  headless, without a `gfx.warm` (GLX, WGX), or where the title draws a 3D Home. Garage, night and studio own the
  frames the hidden warm needs; a circuit Home already preps its world. The default Home (`photo`) draws no 3D
  scene, so the warm's hidden frames run behind it.
- **Cancellable.** It only widens `current()`, so leaving the title stops the prep at its next step and an open sheet
  pauses it (`MenuSheetGate`). Tapping RACE carries it on through the picker. Leaving for another screen re-arms it.
- **Done** is `census-entry`'s `menuPrepReady` test: world built, `menuFinish` done, warmed, no warm frames owed, no
  compile in flight.
- **With the pipeline pin** (above), the warm's pipelines survive until race entry even when the player idles on
  the title for minutes. They also survive a different track pick in the picker, which reuses most lit programs.

Test: `tests/unit/title-warm.test.mjs` (the real module in a VM: the once-per-build gate, the blockers, re-arming,
the `game.js` wiring).

Lavapipe census, `scratch/w50/census.mjs title`, Bahrain, 90 s of title idle with no input, then RACE → picker →
RACE SETTINGS → START with no waiting:

| tree | title idle built the world | pipelines built during the idle | pipelines built after START |
|---|---|---|---|
| deploy tip 0b1bc59c (pin only) | no: `world`, `done` and `warmed` false (the S5 symptom) | 46 (the garage) | 18, during the intro build and lamp bake |
| + title warm | yes: `world`, `done` and `warmed` true | 48 | 6 (`programWarm` 150 ms) |


## The last two first-frame pipelines (#3673, 2026-10-26)

After the pin, a driven lavapipe census found that race entry still built two pipelines **synchronously** on the first
race frame. That is the same census as above plus a 120 s driven first lap, with a probe on the pin wrapper naming
each RenderObject. The 120 s of driving after the lights built **0** pipelines.

| pipeline | object | why the warm missed it |
|---|---|---|
| `tlx-fx-line-mrt` | the driving line (`position, lineAcross, lineSpeed, lineZone, lineAlong`) | the race draws it **indexed** (`drawDrivingLine`'s strip index). three keys a WebGPU render pipeline on the geometry too (`getGeometryCacheKey` appends `index,`), so the warm's unindexed probe built a pipeline the race never used |
| `tlx-fx-blob-mrt` | the per-record blob shadow, drawn with a **mirrored** model (cw) | the fx warm compiled only the instanced blob run |

Fix (`js/render/three/tlx.js`):
- `lineIndex(slot)` builds the line's full-capacity index for both `drawDrivingLine` and the fx warm's probe.
- `warmFxPrograms` compiles the per-record blob on both windings.

After: race entry builds **0** synchronous pipelines. Only the rig warm's two async ones are left, under its
cover, and the menu builds 68 instead of 66. Test: `tests/unit/tlx-fx-warm.test.mjs` reads three's own
`getGeometryCacheKey` on the probe against the race geometry.

These were #3673's prime suspects for "two frames over 100 ms in every first race". The device run with A·W54's
hitch recorder (#3676) is what can confirm it.

## The cold rig warm: one pipeline (A·W56, 2026-10-26)

`memState().warm.rig` now splits the job into `pairsMs`, `mirrorMs` and `settleMs`, and lists the four slowest pairs
in `worst` as `[ms, material id, matKey, vertices, winding]`. A probe (SwiftShader WebGPU, which this container's
Chromium picks even with the lavapipe ICD and flags; Bahrain, RACE SETTINGS idle 70 s, then START) wraps
`createShaderModule` / `createRenderPipeline(Async)` from the START click:

| | before | after `warmCockpitTelemetry` |
|---|---|---|
| rig pairs at race entry | 28 | 25 |
| `pairsMs` | 4823 (one pair 4356, the rest ≤ 67) | **553** |
| pipelines built at race entry | `MeshBasicNodeMaterial_89`: one async of **4.34 s**, plus its sync twin | two sync, no async |
| `rig.ms` | 7823–9476 | 3553 (`settleMs` 3000 of it) |
| `mirrorMs` | 0 (no key on this path) | 0 |

- The slow pair is the wheel telemetry's material, `_rigFx` (`o,0.9,0,0,0,0,0,1|ds|na`: double-sided, no alpha
  write), on a 48-vertex gear digit. No menu draw uses that state, and it is the same for every car. So race entry
  built its pipeline, and nothing else in the job is new. The per-probe CPU of the target-scene walk (lead 1 in the
  handoff list) is ≤ 67 ms a pair. The mirror stage did not run on this path.
- Fix: `car-draw.js` `warmCockpitTelemetry()` captures the gear digit, a speed digit and the LED strip with
  `_rigFx` and no car. `game.js` `warmPrograms` queues it with every menu (and title) program warm, and
  `warmCockpitRig` then skips those pairs (`_rigDone`).
- Two `warmDraws` fixes go with it, because the menu job now runs ahead of the race's:
  - A queued job's 20 s drop timer re-arms while presents keep arriving (`job.seen`). The menu world warm runs
    ~29 s on the phone, so the timer would have dropped the telemetry job before it started.
  - A `warmDraws` that meets a job in flight waits for it (`job.finished`) instead of returning false. The race's
    `warmCockpitRig` can arrive while the menu job runs, and refusing skipped the car's own pairs.
- `settleMs` 3000 is `_gpuSettled`'s cap: `onSubmittedWorkDone` does not resolve within 3 s on SwiftShader. It is the
  same before and after, and a device record shows whether a GPU pays it.
- Lead 4 (`warmIdleChunks()` at race entry) costs 14 × 32 ms idle yields at most, inside the 553 ms.

## Still open

- **The cold rig warm on the device**: A·D2's `coldrace` `menu30`, fresh unit, WebGPU. `rigWarm` should drop from
  5.7 s. `warm.rig.worst` names whatever pair is left; `pairsMs` / `mirrorMs` / `settleMs` say which stage it is in.
- Device confirmation of #3761 (the two first-frame pipelines as #3673's two >100 ms frames): A·W54's hitch
  recorder (#3676) plus A·D2, on Bryce's Go.
- The part-2 dose on device: A·D2's `coldrace` `quick0` vs `quick45`, one fresh unit per arm (see #3757).
