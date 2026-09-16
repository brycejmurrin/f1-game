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

---

## 5. Both of §4's first two items were built, measured, and came back negative

### The other 3.7 s is NOT the load path (run 130, macos-latest, vegas)

`startRace` now keeps the same stopwatch, `__apex.raceProfile()`. Across the
four legs:

| | webgpu | webgl2 | glx | wgx |
|---|---|---|---|---|
| startRace total | 1291 ms | 942 ms | 1021 ms | 1066 ms |
| of which `loadTrack` | 1249 | 922 | 971 | 1037 |
| `scenery` | 33 | 10.9 | 38.3 | 13.7 |
| `makeCars` | 2.7 | — | 4.0 | 4.7 |
| ALL blocking in the window | 2825 | 3893 | 4345 | 4385 |

**The entire race-entry load path is about one second of a three-to-four second
block.** `loadTrack` is essentially all of `startRace`, and the build is
essentially all of `loadTrack` — so the build IS the load path, and the load
path is only a quarter to a third of the freeze. Two to three and a half
seconds of main-thread blocking happen inside the race-entry window and OUTSIDE
`startRace` entirely.

Two candidates die here with numbers rather than by argument. The lazy scenery
fetch is 11 to 38 ms, so §1 was right to rule it out. And `makeCars` is 2.7 to
4.7 ms, which means the roughly 800 ms of car and helmet meshes the perf ledger
describes is **not in the load path at all** — it lands on first draw. That is
consistent with what is left: the remaining blocking is the renderer's FIRST
FRAMES, not the loading of anything.

That reframes the whole target. A worker for the build was already a poor trade
at 23 %; it is aimed at a quarter of a problem whose other three quarters are
first-frame work — shader link completion, first texture upload, first mesh
draw — which a worker cannot touch and yielding during the build cannot touch
either. **Anything aimed at race entry should be aimed at the first frames.**

### The bottom-face cull is worth 0.27 %, not 13 % — BUILT AND REVERTED

Implemented exactly as specified: `addBox` skips face 5 when the caller
supplies a predicate proving the underside is buried, and `buildProps` supplies
one that samples the ground at all four footprint corners through the basis and
answers only when the bottom is at or below every one of them.

    vegas props   441,096 -> 439,912 verts     1,184 saved, 0.27 %

The collision-and-culling note put this at about 13 %. It is 0.27 %, and the
reason is the difference between "sits on the ground" and "is buried". Scenery
placers set a box bottom TO the ground, usually the ground sampled at the
centre; on any slope at all, two of its four corners then have ground BELOW the
bottom, the underside is genuinely visible from downhill, and keeping the face
is correct. The 13 % figure assumed every box bottom is hidden. Almost none are
provably hidden.

A first cut was stricter still — it sampled a square circumscribing the
footprint, which for a 20 m box means sampling 14 m outside it — and returned
0.13 %. Using the real corners through the basis doubled the yield to 0.27 %.
Neither is worth four terrain queries on each of about 85,000 boxes, and the
build-time cost cannot be resolved against run-to-run noise, which means it
cannot be shown NOT to be a net loss on the very phase it was meant to help.

**Reverted.** The code was correct and the measurement was against it. What
survives is the number: this optimisation is not there, and the note that
claimed it should be corrected rather than left to be rediscovered.

### So the ranking in §4 is wrong and is replaced

1. **Attribute the first frames.** Everything above says that is where the
   freeze is. Nothing else should be built until it has a name.
2. Vertex quantization stays where it was — a real win against graphics memory,
   still not a race-entry fix.
3. The generator split of the build stays worth doing on its own merits
   (interruptible, byte-identical, no worker), but it is now explicitly NOT
   sold as a race-entry fix either: it can only ever reach the quarter.
4. The bottom-face cull is dead, with a number.

---

## 6. "Only render what we can see" — the rejection was wrong, with numbers

The culling review closed occlusion culling with: there is no depth pre-pass,
and adding one doubles vertex submission to save fragment work in a frame whose
measured cost is draw calls and uploads. Both halves of that fail.

**It rejects a technique WebGL2 does not make you use.** A depth pre-pass is one
way to occlusion-cull and not the way available here. WebGL2 has hardware
occlusion queries — `ANY_SAMPLES_PASSED` — which answer "did any fragment of
this proxy box survive the depth test" with no pre-pass, and the standard
algorithm around them (CHC++) consumes the PREVIOUS frame result so nothing
stalls. One proxy box per 72 m chunk is twelve triangles against the hundred-odd
chunks already culled per frame. `createQuery` appears once in this renderer and
it is the GPU timer, so this has never been tried.

**And its premise is the argument FOR it.** If the frame cost really is draw
calls, and most draw calls produce no pixel, then draw calls are exactly what
occlusion culling removes.

### How much is wasted (`tools/check/occlusion-estimate.mjs`)

Exact software visibility: every prop triangle rasterised into a depth buffer
carrying the cell id that won each pixel, so the cells present at the end are
exactly the cells that contribute a visible pixel. Four cameras on the racing
line, 512x288.

| circuit | cells submitted | cells that show a pixel | wasted cells | wasted vertices |
|---|---|---|---|---|
| vegas (city) | 152 | 23 | **84.9 %** | **58.2 %** |
| monza (parkland) | 207 | 41 | **80.1 %** | **54.9 %** |
| spa (open, forest) | 359 | 158 | **55.9 %** | **18.0 %** |

Stable under resolution, which is the check a rasterised estimate has to pass:
vegas reads 85.9 / 84.9 / 84.4 % of cells wasted at 256x144, 512x288 and
1024x576 on identical cameras. An earlier cut rasterised chunk bounding RECTS
and reported 93 %; that was optimistic nonsense, because a 72 m cell projects to
a solid rectangle while the buildings in it have sky and streets between them.
That is why this rasterises triangles.

### And the frame is GPU-bound (run 131, macos-latest, vegas)

The GPU timer now runs during the settle beats. On the GLX leg — the default
backend, the one players get — **median 19.17 ms of GPU per frame over 14
samples, at scale 0.9 on a 1152x648 canvas (0.75 megapixels)**, against a CPU
frame time of 17.3 ms. GPU time exceeds CPU time, so the frame waits on the GPU,
and 19 ms for three quarters of a megapixel is a lot. The other three legs
report no samples: `EXT_disjoint_timer_query_webgl2` is a WebGL2 extension and
those legs are the TLX and WGX paths.

### What is still unproven, and the honest bound

- **Whether the 19 ms is fragments or geometry.** Leg B pins `apex26.resMode`
  low; GPU time that falls with pixel count is fragment-bound. Until it lands,
  the split is unknown — though occlusion culling removes fragments, vertices
  AND draw calls together, so it is the one lever that pays either way.
- **The baseline is generous.** The estimator's far plane is 1500 m, so any cell
  the shipped radial and fog cull already drops still counts as submitted. The
  saving above is an upper bound on what occlusion culling ALONE would add.
- **Props only**, and a driving camera only.
- **Spa is the floor and it still wastes 56 % of its draw calls.** An open
  circuit is the worst case for this technique and it is not a small number
  there either.

### The case, plainly

Between 18 % and 58 % of submitted prop vertices, and 56 % to 85 % of prop draw
calls, are spent on geometry that contributes no pixel — on a frame that waits
on the GPU. That is worth the query path, and it is the first item on this page
with a measured upside rather than an argued one.

---

## 7. Built, and the first live boot works (run 133)

`ANY_SAMPLES_PASSED_CONSERVATIVE` queries in GLX, one proxy box per candidate
chunk at the top of `present()`, results read a frame or more later. It SHIPS
OFF behind `apex26.occlusionCull`.

macos-latest, vegas, Apple/Metal:

    glx   occl: ON  tested=155  culled=146  passes=408  -> 94 % of candidate chunks skipped
          gpuErrors=0   meanLuma=27.3

Three things in that line, in order of what they settle:

1. **The pass runs and the queries answer.** `tested=155` against the software
   estimator's ~152 submitted chunks is the same scene counted two entirely
   different ways, which is the check that the pass is looking at what it
   should.
2. **`gpuErrors=0`.** A new GL pass is exactly where a state leak shows up, and
   none did.
3. **`meanLuma=27.3`, unchanged from runs 128 and 130 with the flag off.** This
   is the one that matters: 94 % of prop chunks skipped and the image the same.
   It is evidence, not proof — a whole-frame average to one decimal would not
   catch a hole smaller than 0.05 — so it says "no gross over-cull", not
   "pixel-identical". The census keeps the screenshots; a diff is the next
   check before this flag goes on by default.

94 % against the estimator's 84.9 % is the expected direction: the real depth
buffer has road, terrain and cars occluding as well, and the estimator only ever
had props.

One reading to watch rather than celebrate: `queries=0` on the sampled pass
means every chunk already had a query in flight that frame. Harvesting
demonstrably works — nothing reaches `culled=146` otherwise — but the sample
says nothing about how MANY frames a result takes to land, and a flag that
updates slowly is a flag that pops. That needs its own measurement.

**Still not on by default, and should not be until:** a screenshot diff against
the flag off, a moving-camera check rather than a parked one (`park()` gives a
static view, and the popping risk is entirely in motion), and a second circuit —
spa is the floor of the range at 55.9 % and the one most likely to spend more on
queries than it saves.
