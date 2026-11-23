# TLX WebGPU: who creates a buffer every other frame, and why the mirror target re-allocates

Kind: measurement · Re-measure-by: 2027-02-11
Summary: On Apple Metal the 0.68 createBuffer a frame is three's first draw of geometry and render objects entering view; the mirror target re-allocates on each governor scale step.

Issue #4710 (batch #5400). Background: `docs/notes/PERF-GPU3-2026-10-30.md`.

## What was run, and on what

One `gpu-census.yml` dispatch on this branch: run 42979981148, head d2bb399c, `images=macos-latest`, `track=montreal`,
helmet camera, the TLX WebGPU leg (`game-webgpu-macos-latest.json`).

**Device: GitHub's macos-latest runner, a real GPU (census `anyHardware: true`, adapter vendor `apple`, Metal). It is
not an iPhone.** The window is 476 game frames of driving (23 fps on that runner).

The rows come from `tools/gfx/gpu-mem-webgpu.mjs`, which records EVERY `createBuffer` / `createTexture` in the armed
window with its label, size and stack (the older `uploads` rows sampled one call in eight and kept the top 60 sites).
371 creates were recorded and 371 were counted by the separate call counter (`gpuWork`: 323 createBuffer, 48
createTexture), with none past the site cap.

## 1. The createBuffer calls: 323 in 476 frames, 0.68 a frame

Every one of them is three's own lazy first draw, reached from `present()` (`tlx.js` `_renderTimed`). No game code
asks for a buffer per frame.

| what | group row | per frame | three's path | sizes seen |
|---|---|---|---|---|
| vertex and index buffers of a geometry drawn for the first time | `create:(none)` | 0.54 | `createAttribute` / `createIndexAttribute` from `Geometries.update` | 540 to 1728 B, each size recurring 9 to 27 times (1620 B x27, 1440 B x18, 1260 B x12 ...) |
| the object uniform block of a new render object | `create:object` | 0.13 | `createUniformBuffer` from `Bindings._createBindings` in `getForRender` | 352 B x41, 208 B x15, 80 B x7 |

The second row matches the renderer's own counter: `memState().churn.poolNew` rose 0.088 a frame over the same window
(42 wrappers minted, 41 object blocks of 352 B). So these are meshes coming into view as the car drives, each paying
its buffers once.

What this does NOT show: whether they are released. In the whole session the wrapper counted 1617 buffers created
and 14 destroyed (1603 live, 38 MB requested) at the end of the window. A 20 s window on a first lap cannot tell
streaming-in from a leak; a window of several laps on one circuit would (the count should stop rising after lap 1).
That is the open question, filed as #5447 rather than guessed at here.

## 2. The mirror target: 3 re-allocations between beats, every one a size change

`beat.mir` reads the backend's `allocs` count and the target's size at every beat (about one a second):

| beat | at | re-allocations | target before | target after |
|---|---|---|---|---|
| 2 | 27.0 s | 1 | 461x132, 4 mips | 415x118, 4 mips |
| 5 | 30.0 s | 1 | 415x118, 4 mips | 276x79, 4 mips |
| 8 | 33.1 s | 1 | 276x79, 4 mips | 461x132, 4 mips |

None happened between two beats that read the same size. The three sizes are the mirror at 1, 0.9 and 0.6 of its full
size, and the scene target in the same pass inventory is 1280x720 and then 1152x648 (the 0.9 step), so each
re-allocation is the performance governor stepping the render scale, which `prepareMirrorTarget` follows (`tlx.js`: it re-allocates when width, height
or the mip chain changes). The window's own total is 4 (`mirrorWindow.allocs`); the fourth fell between arming and
the first beat.

So "about 4 per 20 s window" is the governor moving, not the mirror churning on its own. Whether a mirror that
follows every scale step is worth its re-allocation is a design question for the governor's step policy.

## Not measured

- An iPhone. The phone tier uses a smaller, "lite" mirror and a different governor ladder, so neither rate carries
  over. Would settle it: the same leg through the phone bridge on Bryce's iPhone.
- Several laps (the release question above).
