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
