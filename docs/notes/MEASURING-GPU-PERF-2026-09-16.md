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

## Sources

- [EXT_disjoint_timer_query_webgl2 specification](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/)
- [EXT_disjoint_timer_query — MDN](https://developer.mozilla.org/en-US/docs/Web/API/EXT_disjoint_timer_query)
- [luma.gl Query docs — begin/end constraints](https://tsherif.github.io/luma.gl/docs/api-reference/webgl/query.html)
