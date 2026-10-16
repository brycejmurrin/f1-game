# How to measure GPU performance here (2026-09-16)

Written after getting it wrong repeatedly on one day. Four conclusions in this
session were drawn from timings and three have been withdrawn; the method below
is what survived, with the run that taught each rule.

## 1. The floor comes first, always

Sample the SAME state twice and report the difference before reporting any
effect. That single row is worth more than the effect row, because without it
an effect has no scale.

Measured floors on `macos-latest` (Apple/Metal, the one census image with real
hardware), GLX leg:

| sampler | GPU floor |
|---|---|
| two blocks of 12 samples (runs 138-141) | **17.9 % and 45.2 %** |
| interleaved, 20 rounds, 40 samples (run 143) | **5.9 % and 9.5 %** |

Before the floor row existed, this session reported occlusion at +2.1 %, then
+15.8 %, then +20.2 %. All three were inside their own noise. So was the -2.9 %
that a whole branch of the render plan had been built on.

## 2. Interleave the two states; never measure them in blocks

Two blocks put every slow drift — clock, thermal, scheduler, another job on the
runner — entirely onto the difference. Toggle, settle, take ONE sample, toggle
back, settle, one sample, repeat; then compare paired medians. Both states then
span the same wall time and drift cancels to first order.

That one change took the floor from 17.9-45.2 % to 5.9-9.5 %, which is the
difference between an instrument and a random number generator.

## 3. Freeze everything the flag does not control

Pinning the render clock (`__apex.renderClock(t, true)`) stops sky and cloud.
It does NOT stop the AI field, and run 138 measured what that costs: legs where
the feature under test did nothing still diffed at 0.088 %, 0.271 % and 7.533 %
of pixels against their own second capture, purely from cars moving.
`__apex.freeze(true)` parks the simulation, and it sharpened the GPU numbers as
well as the pixel ones — traffic was adding frame-to-frame variance to both.

## 4. Trust counted oracles over timed ones, and keep both

Counting is exact in this container and timing is not. Every conclusion that
survived this session came from a counter:

- chunks that contribute no pixel (exact software rasterisation)
- `drawElements` avoided
- ranges per multi-draw call
- draw calls per frame per backend

And the counter is what DIAGNOSES a timing result. Run 143 found multi-draw
20 % slower against a 5.9 % floor — a real effect — and the counted row said
why in one line: **4,709 multi-draw calls for 4,853 ranges, 1.03 ranges per
call.** It was not batching at all, so it paid multi-draw's indirection for
none of its benefit. A timing number alone would have said "multi-draw is
slower"; the counter says "the GROUPING is wrong", which is a fixable thing.

## 5. The GPU timer's own rules

`EXT_disjoint_timer_query_webgl2` is the only real GPU clock available, and it
has sharp edges. `glx.js` already handles the important one — it reads
`GPU_DISJOINT_EXT` and throws away every in-flight result when set, because a
power-state change makes them meaningless. Three more worth knowing:

- Only one query of a target may be open at a time; begin/end cannot nest or
  interleave across instances.
- Results arrive asynchronously; polling `QUERY_RESULT_AVAILABLE` on a pending
  query and waiting is a stall, which is why the ring here reads only what has
  landed.
- Mobile implementations vary and some (Mali is the usual example) never give
  useful numbers. A missing or absent timer must read as "not measured", never
  as zero — the census prints `no GPU timer samples` for exactly that reason.

And `getParameter(GPU_DISJOINT_EXT)` is itself a synchronous round trip to the
GPU process, so it belongs behind the on-switch: this repo once paid that stall
every frame on every Chrome desktop and Android device for a feature that ships
off.

## 6. The checklist

1. Pin the render clock and freeze the simulation.
2. Interleave states, 20+ rounds.
3. Report the floor (same state twice) before the effect.
4. An effect under the floor is not a result. Say so; do not round it up.
5. Print a counted oracle beside every timed one.
6. One runner is one runner: Apple Paravirtual is not a player's GPU, and the
   phone leg is unreachable from CI entirely.

## 7. The census runs the player's path (hunt 4, 2026-10-14)

The source is `docs/notes/PERF-HUNT-4-2026-10-14.md` §C (I1–I7) and §A (instrument gaps).

**Every leg presents natively (I1, I3).** All four game checks in `gpu-census.yml` pin `apex26.wgxCapture=0`, ahead of the dispatcher's `ls`.
- GLX now honours that pin: no `preserveDrawingBuffer` and no `#game-soft` overlay.
- WGX stops its per-frame readback blit. Pinned by hand at spa dusk, WGX went from 20.8 to 36.7 fps in the driven window.
- The HeadlessChrome UA still forces WGX MSAA 1 (`_softAdapter`).
- Before each A/B capture and before the final shot, `gpu-game-check` takes a fresh frame:
  - on a soft-presenting backend, it invalidates and then awaits a newer blit;
  - on a native one, it waits two rAFs.
- Each capture records `{mode, gen}`. The Verdict prints `frames:` and flags STALE when the soft gens did not advance. Census 450–455 had shot one gen-1 frame for every capture.

**GL errors are drained once per beat (I2).** The census no longer sets `apex26.glErrDrain=1`.
- It calls `GLX.drainGpuErrors()` at about 1 Hz and once more before the gate reads the counter.
- GL error flags are sticky until read, so the `gpuErrors > 0` gate loses nothing.
- At spa dusk, getError cost 4.92 ms/frame with the per-present drain and 1.37 ms with the pin off.
- `--gl-err-drain` restores the per-present drain.

**Read the window, not the governor (I4).** `out.window` counts LoopHealth's finished game frames between `arm()` and a `disarm()` at the last beat. It holds fps, ms/frame and the frame-interval p50/p95/p99/max.
- The governor's end snapshot is a 2048-frame ring that also holds the frozen A/B phases.
- On the WebGPU legs the rAF series counts about 2 callbacks per game frame.
- A/Bs whose feature reports `supported: false` are skipped. Today that is WGX and both three.js legs.

**Uploads and gaps (§A).** On WebGL2, `bufferData`, `bufferSubData`, `texImage2D/3D`, `texSubImage2D/3D` and `generateMipmap` are now counted, timed and sized (KB). This is the same treatment `writeBuffer` gets on WebGPU.
- `out.gapWork` covers every rAF interval of 500 ms or more since page load.
- For each gap it names the phase, the work of the rendering step before it, the work done between steps, and the long tasks that overlap it.
- A 4 s first-draw stall is attributable this way. `spikeWork`, which keys on callbacks of 100 ms or more, cannot see it.

**Race-entry marks (B-F3.3, lane TOOLS-J).** `out.raceEntryProfile` saves `__apex.raceEntryProfile()` right after the race gate: `legs` (`{n, ms}`), `marks` (`{n, t}`, ms from the window's begin), `blockMs`, `maxBlockMs`, `supported`, and `winT0`, the window origin on the page clock.
- The snapshot carries no origin, so the census derives it: `windowMs` is `now() - winT0` at the read, so `winT0` is the read's midpoint minus `windowMs`, good to `clockErrMs` (microseconds).
- `out.raceEntrySpans` joins every long task and every rAF gap from `race()` to the end of race entry to a named span: a leg (cumulative from `winT0`; `resets` = the `ensureRaceSession` / `ensureAudio` lazy bundles, `settings` = `applyRaceSettings`), a `:start`/`:end` mark pair (`warmCarAssets`, `debrisPrime`, `mirrorPrepare`, `ensureScenery`), or a TLX warm stage (`warm:scene/fx/post/shadow/mirror/draw`, sequential from `memState().warm.at`).
- Each event names the span it overlaps most, its share, up to three other overlaps, and the marks either side. A tie goes to the shorter span, so a mark span nested in a leg wins.
- `bySpan` sums long-task time per span; gaps are listed but not summed (they are the same blocked time seen from rAF). The Verdict prints a `marks:` row and the six longest events.
- Example: `{ kind: "longtask", atMs: 2425, ms: 2090, span: "warmCarAssets", share: 1, after: "warmCarAssets:start (+5 ms)", before: "warmCarAssets:end" }`.
- Not split: the `loadTrack` leg's build phases (`buildProfile` rows carry no timestamps) and the sky cache warm, which `tlx.js` folds into `warm:mirror` (its stage clock starts after the shadow stage) and leaves untimed when the mirror warm is off (then only the `warm (other)` envelope covers it).

**Depth discard (A-P1, lane TOOLS-J).** `out.depth` reads TLX's `post.state().depth` (`{ discard, kept, discards }`, lane TLX-W) at `arm()` and again at the end of the driven window, so the count is the window's own.
- Fields: `supported`, `discard` (the `apex26.tlxDepthDiscard` knob), `keptLastFrame`, `discards` (cumulative), `windowDiscards`, `windowFrames` (LoopHealth), `discardShare`, `summary`.
- Example: `{ supported: true, discard: true, keptLastFrame: false, discards: 500, windowDiscards: 380, windowFrames: 400, discardShare: 0.95 }`.
- `discards` counts WebGL2 invalidations only. On three's WebGPU path r186 has no lever, so 0 there is expected, and the summary says so.
- GLX and WGX have no TLX post: `{ supported: false, note }`, and the Verdict prints no row. A TLX leg without the row prints `depth: NOT MEASURED — <why>`.

**The camera is an input (H5, lane TOOLS-J).** `gpu-census.yml` has a `cam` dispatch input: a choice of `helmet` (the default, the game's own camera, so a default dispatch measures what it did before) or `chase`. A push request may carry `"cam"` too; the plan job re-checks it against the same list.
- It reaches all four game checks as `gpu-game-check --cam <id>`, which calls `__apex.camera(id)` after boot and before `race()`, so no frame of race entry draws through another camera.
- Helmet and cockpit glass latch TLX's full mirror mip chain for the session, so the mirror-mip cap (`apex26.tlxMirMips`, A-H5) shows only on a chase leg. In `passKinds`, expect about 8 → 2 mip passes per mirror frame.
- `out.cam = { asked, set, atWindowEnd }`. Example: `{ asked: "chase", set: "chase", atWindowEnd: "chase" }`; `asked: null` means the game default. An unknown id comes back with `error`.
- `out.mirror = { mode, shown, cam, drawn, backend: { ready, renders, glass, w, h, mips, mipCap, mipFull } }` is read at the window's end.
- The Verdict prints a `cam:` row per leg and flags `CAMERA NOT AS ASKED` when the camera did not take or moved during the window.
- In AUTO, the mirror is not drawn in chase at all (`ONBOARD` views only). To time the capped chain in chase, add `apex26.hudMirror="on"` to `ls` (a JSON-lane key: the quotes are part of the value, and a bare `on` is dropped as corrupt), and check that the `cam:` row reads `shown=true`.

**Follow-up, not built (I5).** WGX `gpuMs` times only the lit pass, while GLX's covers main plus post. A per-pass GLX timer would put sequential `TIME_ELAPSED` queries around the sun, lamp, car, env, mirror, main and post groups. Only one such query may be active at a time.
- Those groups are sequenced from `js/game.js`, which this lane may not edit, so it is not a small change behind a flag.
- It needs a query ring per group in `glx.js`, with begin/end hooks called from the pass sites.
- WGX would need `timestampWrites` that begin on the first pass and end on the last.

**I5 re-checked by lane TOOLS-J: still not built, and only labelled.** The per-pass timer is renderer work, not census work, for three reasons:
- The span edges are in renderer and engine files. The GLX query opens in `glx.js` `begin()` and closes at the end of post (`post.js`, `core.gpuTimerEnd()`). The shadow, env and mirror passes run before `begin()`, sequenced from `js/game.js` (claim required). WGX's query is the `timestampWrites` on `litPass` in `wgx.js`. A tools lane can read these spans, not move them.
- GLX allows one active `TIME_ELAPSED` query at a time, so a per-group mode needs a query ring per group and begin/end hooks at each pass site. That is a new `gpuTimer` mode with its own disjoint handling, not a flag.
- The real-GPU runner cannot time WGX's other passes anyway: hunt 4 G3 found no `timestamp-query` there, so a WGX per-pass mode would read null on the one machine that matters.

What landed instead is a label. Every leg's `gpuFrame` carries `span` and `spanNote`, and the Verdict's `gpu:` row prints `span=… (compare within a backend only)`:
- `main+post` on GLX: one query from `begin()` to the end of post.
- `lit-pass` on WGX: the lit scene pass only.
- `three-render-passes` on TLX: three's summed render-pass timestamps for the latest frame, via `resolveTimestampsAsync('render')`, which includes shadow, mirror and post.

`gfx-backend-canary` pins the three source sites, so a backend that moves its timer fails the label test instead of silently mislabelling.

## Sources

- [EXT_disjoint_timer_query_webgl2 specification](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/)
- [EXT_disjoint_timer_query — MDN](https://developer.mozilla.org/en-US/docs/Web/API/EXT_disjoint_timer_query)
- [luma.gl Query docs — begin/end constraints](https://tsherif.github.io/luma.gl/docs/api-reference/webgl/query.html)
