# First BOOST press: the cockpit ERS bar's mirrored back pass was never warmed (#4514, 2026-11-03)

Kind: incident · Re-measure-by: 2027-02-01

Bryce (2026-11-03, iPhone 15, Home Screen web app, THREE PATH: WEBGPU, BUTTONS controls): "when I hit the boost
button for the first time regardless of when in the race … there's a lag or frame freeze for a few seconds".
It still freezes with sound off, so the audio unlock path in `TLX-WEBGPU-PERF-3-2026-10-30.md` §6 is not the cause.
That section left "a WebGPU-only key difference" unchecked because the container was thought unable to run three's
WebGPU leg. It can: `perf-boost-press-pipelines.spec.js` reads `hook: ok webgpu` on the software adapter.

## Finding

Every three `createRenderPipeline` of one WebGPU race was logged with the RenderObject's material side, the
object's determinant sign and whether a `compileAsync` was on the stack (a local diagnostic patch of
`tools/perf/boost-press-census.mjs` `hookPipelines`, not committed). The race built exactly one lit pipeline
live, on the first deploy:

| row | when | material | pass (side) | mirrored | built by |
|---|---|---|---|---|---|
| 21, 22 | entry warm | `_LATE_LIT[0]` (single-sided) | front (0) | no, yes | `compileAsync` |
| 23 | entry warm | `_LATE_LIT[1]` (double-sided, the cockpit `_rigFxA`) | back (1) | **no** | `compileAsync` |
| 38 | **press 1** | the same double-sided material | back (1) | **yes** | the live draw |

- three draws a transparent `DoubleSide` material as a `BackSide` pass and then a `FrontSide` pass, and
  WebGPU keys a pipeline on the winding (`determinantAffine() < 0`).
- The cockpit dash ERS bar draws `_rigFxA` through the wheel's mirrored matrix (`_rigB`).
- `warmLateLit` compiled the double-sided variant with `sx = 1` only. Its comment said the variant is "never drawn
  mirrored", on a census that ran three's WebGL2 path, where winding is not part of the program key.
- So the first deploy's back pass built a whole lit pipeline synchronously, mid-race. On the phone that is a
  Metal pipeline build in the GPU process.

## Fix and evidence

`js/render/three/tlx.js` `warmLateLit` compiles every `_LATE_LIT` entry in both winding signs (`lateLayouts` is 1
on Montreal, so this is one more pipeline during the lights). `boostVerdict` (`tools/perf/boost-press-census.mjs`)
now fails a press 1 that builds any lit-layout (`trk`) pipeline.

| run (`perf-boost-press-pipelines.spec.js`, three WebGPU, software adapter) | press 1 | presses 2–4 | verdict |
|---|---|---|---|
| base tree, run 1 | 1 lit | 0 | (reported only) |
| base tree, run 2 | 0 | press 2: 1 lit (side 1, mirrored) | (reported only) |
| base tree, run 3 | 1 lit (side 1, mirrored, `warm: false`) | 0 | (reported only) |
| new verdict, base `tlx.js` | 1 lit | 0 | **failed**: "press 1 built 1 lit pipelines" |
| new verdict, fixed `tlx.js` | **0** | 0 / 0 / 0 | passed |

`gfx-probe --backend three --tlx-webgpu --lavapipe montreal` (also with `--ls apex26.tlxForceHw=env`):
`api webgpu`, `gpuErrors 0`, `warm.lateLayouts 1`. Both runs ended on the probe's own "presentation wall deadline
exceeded: evaluate" after soft-present succeeded (software adapter speed).

## Not proven here

- **The phone.** A software adapter counts pipelines exactly but does not time a Metal build. Only Bryce's iPhone
  can show the freeze is gone. Ask him to tap BOOST in a race, or link the bridge on #4459.
- **The hypothesis that did not hold.** Drawing the late probes once in the warm draw stage (not only compiling them)
  was tried first. It is unproven, and it is not what the census shows, so it was dropped.

## Step 2 (#4514, #4523): DRAW the rig pairs under the race-entry cover

Compile-warming never draws (WebKit bug 324043 leaves work after `compileAsync` resolves), and the first boost minted a
new pool wrapper, RenderObject, bind groups and uniform buffers in-frame. `warmCockpitRig` now captures the rig with
BOOST and OVERTAKE forced on; `drawRigPairs` (`tlx.js`) draws every pair once through the real pool under a 1×1 scissor.
`apex26.tlxDrawWarm="rig"` forces only this draw; `0` is compile-only. `boostVerdict` rule (d): press 1 creates no
double-sided transparent lit RenderObject.

| run (`perf-boost-press-pipelines.spec.js`, software WebGPU) | press 1 | verdict |
|---|---|---|
| `APEX_BOOST_DRAW_WARM=0` | creates the 24-vertex ERS bar backSide+front RenderObject pair | **failed** rule (d) |
| `tlxDrawWarm="rig"` (head `0f9a4b55`) | 0 pipelines, no double-sided pair; rig job `drawn: 18` | `= run passed` |

Forcing the WHOLE draw warm (`tlxDrawWarm=1`) on the software adapter reloads the page ("present failed: null
BYTES_PER_ELEMENT in getVertexBufferLayout", 3/3). Not investigated on the base tree. `gpu-census.yml` on
macos-latest (real Metal, default path, run 41597756876): `gpuErrors=0`, `entryWarm=warm:request`, no reload. That run
does not drive the boost press, so it is not proof the first press is smooth. Only the iPhone shows that.
