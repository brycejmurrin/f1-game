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
