# Perf options after the race-entry measurement (2026-09-16)

Web research plus repo investigation, read against numbers rather than in the
abstract — run 128/129 measured race entry on real Apple/Metal hardware, and
every option below is ranked against what those runs actually say
(`MULTITHREADING-PLAN-2026-09-16.md` §7-8).

The measurement that governs everything here: at race entry on `vegas`, the
main thread blocks for **2193 ms contiguous / 4856 ms total** on GLX, the
default backend. The track build is **1114 ms of that — 23 %**. Uploads are
**119-318 ms**. So roughly **3.7 s of blocking is neither the build nor the
GPU**, and nothing yet says what it is.

## 1. Three candidates for the 3.7 s, two already dead

Ruled out before proposing anything, because a wrong target is worse than no
target:

- **Shader compilation — DEAD.** `js/render/glx/glx.js` already takes
  `KHR_parallel_shader_compile` and defers the status read, which is exactly
  the fix the literature prescribes. Nothing to win.
- **The lazy scenery fetch and parse — DEAD.** `ensureScenery()` pulls
  `js/circuits/scenery/<id>.js` on demand, and that looked like a strong
  candidate until it was weighed: `vegas.js` is 32 KB and the largest in the
  tree (`monaco.js`) is 58 KB. Tens of kilobytes of script is tens of
  milliseconds, not seconds.
- **Still open**: car and helmet meshes (the perf ledger puts them at about
  800 ms, once, on first draw), the baked asset pack, and whatever the renderer
  does on its first frames. The next instrument is the stopwatch already in
  `tracks.js` applied to the race-entry path OUTSIDE the build. Until that
  runs, any fix here is aimed at a quarter of the problem.

## 2. Multithreading, the version that is actually available

The plan rejected workers-for-physics on COOP/COEP grounds and kept only
"the build in a worker", which §8 then measured as a poor trade. **There is a
third option the plan never considered, and it needs no cross-origin
isolation at all.**

`scheduler.yield()` breaks a long task into a chain of shorter ones, handing
control back to the browser between them. Chrome 129+, Edge 129+ and
Firefox 142+ ship it; Safari does not, so it needs a feature check and a
`setTimeout`/`MessageChannel` fallback — which is the pattern the Chrome team
itself documents, and the same shape `js/car/ghost.js` already uses for
`requestIdleCallback`.

**Why it fits this problem better than a worker.** A worker needs the build to
be MOVABLE: duplicated module loading, transferable typed arrays, a track graph
with methods that cannot be cloned, and a mobile detail flag that lives on a
façade the worker does not have (the plan's own §3 lists all four). Yielding
needs the build only to be INTERRUPTIBLE — and the build profile added in
`c85e9b0` already marks twelve natural interruption points, because a `lap()`
boundary is exactly a place where nothing is half-written.

**What it would buy, in the measured numbers.** Yielding between phases caps
any one task at the largest single phase. That is `props/geo` at 484-798 ms.
So a 2193 ms GLX block becomes roughly an 800 ms block plus change — a 2.7x
improvement in the worst task, without touching the inside of `buildProps`.
Going under the 400 ms bar needs `props` itself split, which the emitter loop
makes straightforward.

**What it would NOT buy:** any reduction in total work. Race entry still takes
as long; it stops being a freeze. That is a user-experience change and must be
sold as one — the plan is right that converting a freeze into a spinner is a
different product decision from making something faster.

**The one design problem, and its answer.** `Tracks.build()` is synchronous at
ten call sites, six of them tools that must keep working (`verify-track.cjs`,
`graph-parity.cjs`, `line-audit.mjs`, `road-lut-census.mjs`, `chunk-reach.cjs`,
`tlx-pack-check.cjs`). Making it async breaks every one. The clean answer is a
**generator**: the build body becomes `function* buildSteps(def, opts)` that
yields at the existing `lap()` points, `build()` drives it to completion in a
plain `for (const _ of steps);` loop, and `buildAsync()` drives the same
generator with an `await` between steps. One body, two drivers, byte-identical
output by construction, and every synchronous caller keeps its contract.

## 3. Fewer faces and vertices, ranked against the same numbers

1. **The box emitter's bottom face** — already the collision-and-culling note's
   one unclaimed item, and the measurement promotes it. It is about 13 % of
   prop vertices at vegas, gated on a grounding test because 37 of 40 circuits
   have known floaters. It now pays TWICE: `props/geo` is 484-798 ms of build
   time, so vertices not emitted are also milliseconds not spent. It is the
   only item on this page that improves the freeze AND the frame.
2. **Vertex quantization** (16-bit positions, 8-bit normals — the meshoptimizer
   and gltfpack standard). Every attribute in `js/render/glx/glx.js` is
   `gl.FLOAT` today. This is real and well-trodden, and the measurement says it
   is NOT a fix for the freeze: uploads are 119-318 ms of a 4856 ms block.
   What it addresses is graphics memory and upload back-pressure, which the
   perf ledger names as the real real-device cost — a different problem, worth
   doing on its own terms, not this one.
3. **`meshopt_simplify` LOD for distant props.** The standard answer to vertex
   count, and it collides with a hard constraint: this project has no build
   step, and simplification is a bake-time wasm dependency. It would mean
   shipping generated geometry, which §5 of the multithreading plan already
   rejected with arithmetic (one circuit is 28.7 MB packed; there are fifty).
4. **Voxel-style hidden-face removal between adjacent primitives.** The
   technique the literature offers for exactly "stop emitting faces nobody can
   see", and it assumes a voxel grid where neighbours share faces exactly. This
   scene is scattered boxes at arbitrary bases; they rarely abut. Low yield for
   a per-face neighbour query over 85,000 boxes. Rejected.

## 4. What to do next, in order

1. **Attribute the other 3.7 s.** Same stopwatch, applied outside the build.
   Cheap, and everything else is guesswork until it lands.
2. **The bottom-face cull**, because it is the only item that helps both halves
   and it is already specified.
3. **The generator split of the build**, which is worth doing even if the
   yielding driver never ships: it is the same restructuring the worker plan
   wanted, without the worker, and it makes the build interruptible for free.
4. **`scheduler.yield()` between phases**, once 1 says the build is worth
   interrupting. If the 3.7 s turns out to be car meshes, the yield points
   belong there instead and this whole section moves with it.

Quantization is a separate track against a separate measurement, and should
not be sold as a fix for race entry.

## Sources

- [Use scheduler.yield() to break up long tasks](https://developer.chrome.com/blog/use-scheduler-yield)
- [Scheduler: yield() method — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield)
- [Optimize long tasks — web.dev](https://web.dev/articles/optimize-long-tasks)
- [meshoptimizer](https://meshoptimizer.org/)
- [gltfpack](https://meshoptimizer.org/gltf/)
- [LearnOpenGL — Face culling](https://learnopengl.com/Advanced-OpenGL/Face-culling)
- [How to Optimize WebGL Performance](https://www.geeksforgeeks.org/how-to-optimize-webgl-performance/)
