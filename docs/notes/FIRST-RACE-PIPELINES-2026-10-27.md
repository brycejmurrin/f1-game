# First-race pipeline census — TLX WebGPU (#3673)

Issue #3673: on an iPhone 14 (TLX WebGPU) the first race gets two frames over
100 ms that a second race does not, with or without `apex26.tlxWarmPlus=1`.
This note records what the Lavapipe census found and why the pre-mint waits
on the device run.

## Tool

`node tools/perf/first-race-census.mjs` (PR #3897) boots TLX WebGPU on
Lavapipe, drives a first lap and records every `createRenderPipeline` with its
TLX matCache key (`__tlx.matKeyOf`), state, target and whether the build was
`async` (`compileAsync`) or synchronous. Synchronous builds are the ones that
can block a frame; the summary line counts them as `sync=`. About 6 min here.
The harness recorder in `tools/perf/devicefarm-iphone.mjs` keeps every
over-100 ms race frame's open PerfSpans, spans and matMiss delta, so the
device run can attribute the hitch.

## BEFORE (eeded3f9, monza day, `api` entry, 5.06 km driven)

`pre=3 post=39 groups=31 misses=0`. 30 of the 39 post-lights builds are
`async`: the entry warm's own `compileAsync`, which runs after the state is
already `race`, so they do not stall a frame. The synchronous builds are
all the post chain, at +14.1–14.3 s:

| builds | material | target |
|---|---|---|
| 4 | NodeMaterial (fullscreen quad, attrs position,uv) | rt 316x146 (bloom mip) |
| 2 | NodeMaterial | rt 158x73 (bloom mip) |
| 1 | NodeMaterial | TLXPostLDR 633x293 |
| 2 | NodeMaterial | rt 633x293 |

That is the WebGPU race/loading post gate (`warmPlusOn()` is false off the
menu path on WebGPU), about 14 s in, not at lights-out.

## Decision (2026-10-27)

Do not pre-mint from this census alone. On the iPhone `tlxWarmPlus=1` did not
remove the hitches, and Lavapipe's timing is not a phone's, so a post-chain
pre-mint is a guess until the device names the stalled stage. The device
measurement (#3673 step 3) is in the one approved Device Farm batch, #3954,
which runs with the recorder above. The pre-mint follows that result as its
own change. A cheap next Lavapipe check: re-run with
`--ls "apex26.tlxWarmPlus=1"` and compare `sync=`.

## Correction: the census and the device recorder both mis-read the entry (2026-10-27, later)

Two measurement faults; the census fix is on `cursor/first-race-premint-5c1e`, the recorder fix follows once PR
#3957 (which owns `devicefarm-iphone.mjs`) has merged:

1. **The census skipped the countdown.** It called `__apex.go()` right after
   `race()`, which sets state `race` before the entry warm has even started, so
   the warm's own `compileAsync` builds (and the post chain it gates) read as
   "post-lights". The device harness (`devicefarm-iphone.mjs` `KICK_API`) calls
   `race(track, tod, "dry")` and lets the lights run out. The census now does the
   same by default (`--go` keeps the old mode) and prints `matMiss` / `matEvict`
   deltas over the lap plus per-stage ms of the last count frames and the first
   race frames.
2. **The device recorder's miss baseline was armed before the entry.** `HITCH_ARM`
   runs before `timedEntry`, and the first hitch's `matMiss` delta is "since the
   previous hitch", so #3954's "+11 at the first race frame" was every material
   the entry warm minted during loading. Its keys are the same list the `--go`
   census shows as warm builds (`|ds` rig family, `cf|ds`, `|na`, `db2,10|ch`,
   `o,0.1,0.05,0.92`). The fix re-arms the baseline at each sampler's first race
   frame. The 65 ms of physics in that frame was real (spans are filtered
   to the frame).

### AFTER: device entry path, Lavapipe (merged tip a60228e4, monza day, helmet)

`node tools/perf/first-race-census.mjs --track monza --tod day`:
`pre=42 post=0 sync=0 groups=0 misses=0 dist=5035m matMiss=+0 matEvict=+0`.
**Zero pipelines built after lights-out** and no material minted or evicted over
a 5 km lap: on the leg this container can run, the entry warm already covers
every first-race pipeline. No pre-mint is added; one with nothing to cover would
be untestable here. The `--go` mode still shows the old rows (pre=3 post=39
sync=8), which is the warm racing the race, not a player path.

### The first race frame's real cost: the sim, cold

Per-stage ms from the same run (PerfSpans, V8 on this box):

| frame | state | frame ms | physics | of which ai | collide | audio | render |
|---|---|---|---|---|---|---|---|
| last count | count | 10.9 | 2.8 | – | – | – | 7.8 |
| race 1 | race | 32.1 | 28.4 | 20.1 | 1.2 | 2.7 | 3.1 |
| race 2 | race | 8.8 | 7.2 | 6.0 | 0.4 | 0.5 | 1.4 |
| race 3 | race | 4.7 | 3.2 | 2.0 | 0.4 | 0.4 | 1.3 |

During the countdown `update()` returns before the per-car step, so the first
race frame is the first time `updateCar` (AI + player) runs for the field: 10x
its steady cost here, 65 ms on the iPhone 14 (JavaScriptCore starts in its
interpreter). See the profile section below for what inside it is cold.

### Profile of the first race frames (`--cpu`, V8 100 µs sampling)

`node tools/perf/first-race-census.mjs --track monza --tod day --cpu --lap 30` writes
`artifacts/profiles/first-race-{first,steady}.cpuprofile` (race frames 1-3 and 120-122;
`console.profile()` start costs the first frame ~800 ms of its own, read the game rows only).
Self ms, `node tools/perf/cpuprofile-summary.mjs`:

| function | first 3 frames | frames 120-122 |
|---|---|---|
| `updateCar` (game.js) | 17 | 1 |
| `update` (game.js) | 10 | 1 |
| `updateCarBrakePlan` | 8 | 1 |
| `updateCarLateral` | 6 | 1 |
| `ai-corridor choose` | 6 | 0 |
| `brakeDecision`, `launchMul`, `lateralScale` (ai-drive) | 7 | 0 |

The cost is spread over every function of the per-car step, 5-15x each, with no
single lazy build or allocation behind it: it is first-execution code (V8's lazy
compile and baseline tiers here, JavaScriptCore's interpreter tiers on the phone),
not a table a loading stage could build early.

**Decision (2026-10-27, delegated):** do not move it in this lane. The only way to
run that code before the lights is to step the real field under the cover and then
restore it, and the sim has no snapshot/restore (`__apex.rollout()` advances the race
and keeps the result). A partial restore would break the determinism the physics
gates pin (`physics-characterization.spec.js`, replays, netplay lockstep). It
belongs to the CPU frame-cost lane (#3104) as a scoped design: snapshot every
per-car field `__apex.carState()` lists plus the RNG, step N ticks during the
cover, restore, and prove the field digest unchanged.

## What a future device batch should measure

Posted on #3954. With the recorder fix (miss baseline at the first race frame,
per-stage `ms`, GC canary, long timer callbacks, LoAF where present): hitch 1's
`matMiss` should read 0 and its `ms` split `physics` into `ai` / `collide` /
`audio`; hitch 2's `gc` / `tasks` say whether a collection or a timer callback
filled the 210 ms.
