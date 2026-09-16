# Multithreading — plan (2026-09-16)

A plan, not a change. Read against the frame loop, the track build, the
existing performance ledger and the constraints that actually bind here.

**Verdict: one candidate survives, and it is gated on a measurement this
container cannot take. Everything else is rejected, most of it by an
existing measurement rather than an argument.**

## 1. The hard blocker, established first

Shared memory requires the document to be cross-origin isolated, which
requires two response headers. GitHub Pages cannot set response headers.
**Shared array buffers and WebAssembly threads are therefore off the table**,
which in turn disqualifies any parallel physics: a worker inside a fixed
60 Hz loop would need a synchronous round trip, and without shared memory
and atomics there is no such thing.

The service-worker shim that fakes isolation is rejected on its own terms:
it registers a second service worker against a design whose whole premise is
one worker whose precache derives from the shell's own tags, forces a reload
on first visit, and then governs every subresource. It buys a capability
nothing that survives below actually needs.

## 2. What the performance notes already establish

- **The frame loop is already clean.** A brace-matched audit over the render
  and car-update functions found no per-frame array methods, no object
  literals and no array growth. There is no main-thread JavaScript fat left
  in the steady state for a thread to absorb.
- **Steady-state physics is about 3.13 milliseconds per step** with 22 cars,
  and roughly 37 % of a step exists only because 21 AI cars are on track.
  The obvious allocations and duplicate scans were already taken a month ago.
- **The one big main-thread stall is the track build**, at 0.8 to 1.2
  seconds per circuit, of which about two thirds is vertex emission. The
  physics-bearing half is only 130 to 240 milliseconds.
- **Car and helmet meshes cost about 800 milliseconds, once, on first draw.**
- **The real-device costs are graphics memory and upload back-pressure, not
  main-thread JavaScript.** One 9.66 megabyte upload measured at 4.6 seconds
  was queue back-pressure; in isolation it was 30 milliseconds.
- **Node-side parallelism is already taken**: the test harness pool runs four
  worker threads and cut a suite from 399 to about 200 seconds.

## 3. The one candidate: the track build in a worker

Move the geometry half of the build — floor, road, terrain, props, gate,
start line, sealing and batching — into a classic worker that loads the
existing modules with the ordered-script mechanism the manifest already
models. No bundling is needed, because every file here is already a plain
script assigning one global. Geometry returns as transferable typed arrays,
where transfer cost is independent of size: the published comparison is
32 megabytes at 302 milliseconds cloned against 6.6 transferred.

It can be bit-deterministic. The build consumes nothing from the seeded
random stream; it uses hashes seeded off the circuit identifier, and a
worker is the same engine, so the physics-bearing outputs come back
byte-identical.

**What breaks first**, in order: the barrier arrays the driving boundary
reads are produced inside the prop build, so the simulation cannot take its
first step until the worker returns, which means the win is overlap and
responsiveness rather than less total work. The track graph is an object
with methods that several developer hooks read, and it cannot be cloned. And
the mobile detail flag lives on a façade the worker does not have, so
passing it wrong silently changes phone geometry.

**The honest ceiling**: this moves work, it does not remove it. On a
single-core phone the net could be zero or slightly negative, because a
worker adds a parse and a second heap.

## 4. The gate, before a line of worker code

The question this container cannot answer is whether there is anything on
the main thread worth overlapping with. So the first step is not a worker at
all. It is a race-entry attribution leg added to the existing real-device
benchmark page, reporting wall time from the race click to the first grid
frame, and the count and duration of tasks over 50 milliseconds attributed
to the build, the car meshes and the uploads. Run it on a real desktop
graphics card and on a phone.

Three conditions, all of which must hold:

1. Race entry costs more than 400 milliseconds of contiguous main-thread
   block on a real device. If a desktop is near 200, the item is dead and
   should be recorded as dead.
2. The track build is more than half of that block, rather than upload
   back-pressure wearing a costume, which this repository has already caught
   once.
3. There are at least 300 milliseconds of other main-thread work in the same
   window to overlap with. Without this a worker converts a freeze into a
   wait and buys a spinner, which is a user-experience change and should be
   sold as one.

If those hold, the first implementation commit is still not the worker. It
is splitting the build into a geometry function returning plain typed arrays
and an upload function, with the inline path calling both back to back and
byte-identical output proven on three circuits. The worker comes after that
split ships green.

## 5. Rejected, each with its reason

- **The renderer in a worker via an offscreen canvas.** Browser support is
  fine, but the target is wrong: the frame loop is already allocation-clean
  and the measured real-device costs are graphics-side. A thread does not
  make a graphics card faster. The cost is severe: pointer events do not
  exist in a worker, the three.js backend reaches its library through an
  inline import map a classic worker cannot use, and every developer hook
  and probe tool in the repository binds to main-thread globals.
- **Physics or AI in a worker.** The car update reads rival state within the
  same step, so it needs a synchronous round trip that shared memory would
  have provided and cannot. The alternative, a one-frame-delayed AI, changes
  racing behaviour, invalidates the physics baseline and desynchronises
  multiplayer. Disqualified by the determinism contract, not by cost.
- **Shared memory, WebAssembly threads, a parallel physics engine.** Three
  independent blockers, any one fatal; the vendored engine build is
  single-threaded and its parallel path needs the shared memory that is
  unavailable.
- **Asset decoding.** Already off-thread through the browser's own image
  decode; the remaining main-thread work measured at 7 milliseconds.
- **Data fetching and parsing.** Already lazy and already asynchronous, with
  payloads far below the threshold where a worker pays.
- **Audio analysis.** Synthesis already runs on the browser's audio thread;
  there is no JavaScript signal processing to move.
- **Baking props offline instead of threading.** Rejected with arithmetic:
  one circuit is 28.7 megabytes of packed attribute data, and there are more
  than fifty circuits.

## 6. Registration mechanics, for whenever it happens

A worker file is not a free-form drop. It needs its own manifest set; no
script tag, since the shell is generated and a worker must not have one; an
entry in the optional precache block, or offline silently loses the feature;
an entry in the roster so the game can read its path; a build token on the
worker URL and on its own inner load list, never a hardcoded development
token; and updates to the load-order guard and the global scanner, which is
manifest-driven and must exclude a file that lives in a different scope.

One naming caution: the existing top-level worker directory is a server-side
relay, not a browser worker. A browser worker must not land there.

## 7. The gate was taken, 2026-09-16 — and the item is NOT dead

§4 said the question this container cannot answer is whether there is anything
on the main thread worth overlapping with, and treated a real device as out of
reach. It is not, and the plan simply did not use two facts this repository had
already written down.

- **`macos-latest` is real hardware.** The census measured it: apple/Metal,
  `anyHardware: true`, 2 GiB `maxBufferSize` against SwiftShader's 1,
  `shader-f16` and `subgroups` present (`CI-RENDERING-PERFORMANCE.md`).
- **An agent can trigger it.** `workflow_dispatch` is a 403 for a GitHub App
  token, but `gpu-census.yml` also fires on a push of
  `.github/gpu-census-request.json` to a `claude/**` branch, and runs THAT
  branch's tree.

And a framing correction the workflow's name invites: **this gate is about
main-thread JavaScript, not the GPU.** Conditions 1 and 3 need only a real CPU.
Only condition 2 needs the GPU, because its rival explanation is upload
back-pressure, which exists only with a real driver.

`gpu-game-check.mjs` grew a `longtask` PerformanceObserver, marks at
`raceCall` / `trackReady` / `parked`, and a per-leg report of the window, the
CONTIGUOUS longest block (a worker overlaps a freeze, not a window that is
already yielding, so a sum answers a different question), and the other
blocking time. Run 128, track `vegas` — the prop-heaviest circuit, chosen
because the worst case is the decisive experiment.

| leg | macos-latest (Metal) | ubuntu-latest (SwiftShader) |
|---|---|---|
| webgpu | **1796 ms** block / 2594 ms window | 1566 ms / 3015 ms |
| wgx | **1845 ms** / 2460 ms | 2373 ms / 2921 ms |
| glx (the DEFAULT backend) | **3009 ms** / 6644 ms | 32762 ms / 95539 ms |
| webgl2 | 2661 ms / 5316 ms | not measured — the leg died before the read |

**Condition 1 does not merely hold, it is blown out.** The threshold is 400 ms
of contiguous block, with "if a desktop is near 200, the item is dead". It is
1796 to 3009 ms on real hardware — four to seven times the bar, and worst on
GLX, which is the backend players actually get. **Condition 3 holds on every
leg** (559 to 3490 ms of other blocking work, against a 300 ms bar).

**Condition 2 is half answered, and the control is what answered it.**
`ubuntu-latest` was requested as a sanity check and turned out to carry the
argument: on the two legs where both images produced a number, the block is
within a factor of 1.3 of each other across a real Metal GPU and a software
rasteriser (1796 vs 1566; 1845 vs 2373). A cost that insensitive to the GPU
cannot be upload back-pressure — there are no real uploads to be
back-pressured on SwiftShader. So the specific rival hypothesis §4 named, the
one this repository has already been fooled by once, is eliminated: the block
is main-thread JavaScript. What is still NOT established is the positive half —
that the TRACK BUILD is more than half of that JavaScript, rather than car
meshes, parsing or anything else in the window. That needs per-subsystem
attribution, which is the next measurement, not an inference from these
numbers.

What these numbers are not:

- **A CI runner is not a player's machine, and a slow runner inflates them.**
  Two macOS legs carry the harness's own `ONLY n frames rendered —
  INCONCLUSIVE` warning. Even discounted hard, 3009 ms does not fall to 400.
- **The macOS GPU is an Apple Paravirtual device** — virtualised, so upload
  behaviour is not bare metal.
- **The window is a LOWER BOUND.** It runs `race()` to track-ready, which
  excludes the roughly 800 ms of car and helmet mesh cost §2 puts on first
  draw. What a player feels is larger than what was measured.
- **The ubuntu GLX row is junk** and is listed only for completeness: 95 s with
  a `gfx timeout` beside it is SwiftShader falling over, not a measurement.
- **The phone leg is still unreachable** and always will be from CI. §3's
  honest ceiling — that on a single-core phone the net could be zero or
  negative — is untouched by any of this.

**So the item advances rather than dying.** The next step is unchanged in shape
but now justified: split the build into a geometry function returning plain
typed arrays and an upload function, with the inline path calling both back to
back and byte-identical output proven on three circuits — and add per-subsystem
marks while doing it, because that split is exactly what makes condition 2
answerable.

One defect in this instrumentation, found by the run and fixed the same day:
the ubuntu webgl2 leg timed out before the read, `bounded()` returned an
`{error}` object that matched neither reporting branch, and the row vanished
instead of saying so. Absence reading as normal is the shape this file keeps
relearning; every absence prints now.
