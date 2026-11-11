# Device Farm batch #3954 (2026-10-27): #3681, #3657, #2649, #3673 step 3

One paid session, approved by Bryce 2026-10-27 (comments on the four issues). Device: **iPhone 14, iOS 27.0, unit 131A8714**
(first session in `units.json`), TLX, live build `01e64933` (deploy tip, includes #3685 patch 17 and #3659). Session
`e7248d2e-92b9-4ff9-8bdd-067e91251b11` (run id: the `session:` ARN segment; project `apex-profiler`, us-west-2). Thermal 0 on every row.
Command (harness change: `tracks` can now be chained, with a path pin):

```
devicefarm-iphone.mjs run --device "iPhone 14" --scenario tracks,lsab,visor --pins webgpu --tracks monza:day --ls-pin webgpu \
  --ls-arms "A=apex26.tlxTagDiscard:0,apex26.tlxDepthDiscard:0|B=|S=apex26.tlxSkyCache512:1|B=|A=apex26.tlxTagDiscard:0,apex26.tlxDepthDiscard:0" \
  --visor-pins webgl2 --arms off,on,on-add,off
```
Wall 15:21:49–15:35:52Z (about 12.5 min). `deviceMinutes` still read 0 while STOPPING. Raw: `artifacts/devicefarm/batch-3954/report.json` (not committed).

## #3681 WebGPU store discard (monza night, helmet, 30 s, TLX WebGPU, A = both discards off, B = default on)
| arm | fps | p95 / p99 / max ms | n50 | tag / depth discards counted |
|---|---|---|---|---|
| A (off) | 59.7 | 17 / 21 / 53 | 2 | 0 / 0 |
| B (on) | 59.6 | 17 / 26 / 80 | 1 | 2156 / 2156 |
| B (on) | 59.6 | 18 / 24 / 68 | 2 | 2120 / 2120 |
| A (off) | 59.6 | 17 / 21 / 51 | 2 | 0 / 0 |

The switch works on device (counters moved only in B). Frame rate does not separate the arms: the iPhone 14 WebGPU path
sits on the 60 Hz cap at the default scale, as in AWS-DEVICE-FARM-IPHONE §6. The bandwidth saving is not visible in rAF
here; **no regression, no measurable gain at default scale**. A fill-bound reading needs `--pin-scale 1` (not run: one batch).

## #3657 visor on WebGL2 (bahrain night, helmet, 20 s, `crashStrikes` read per arm)
| arm | fps | p95 | autoTier before → after | crashStrikes |
|---|---|---|---|---|
| off | 37.4 | 36 | 3 → 0 | 0 |
| on (default, `visorblend=over`) | 37.5 | 38 | 3 → 0 | 0 |
| on-add (old plus-lighter) | 27.7 | 111 | 0 → **4** | 0 |
| off | 38.7 | 35 | 3 → 0 | 0 |

The shipped plain-over layer costs nothing and never raises autoTier; forcing the old `add` blend reproduces the trip (autoTier 4,
p95 111 ms, 20 hitches). `crashStrikes` 0 on all four arms. The `autoTier` 3 at the start of off/on rows is the post-boot
governor state after a fresh load, and it settles to 0 in the window.

## #2649 `apex26.tlxSkyCache512=1` (monza night, helmet, WebGPU)
S: 59.7 fps, p95 17, p99 20, n50 0 against B 59.6/17/26 and 59.6/18/24. Within the A/B noise; no measurable fps win at default scale, so it
**does not clear the floor and is not made default-on** (look-changing flag, no gain). Frozen pixel diff NOT done: software GL takes the fallback
sky and never builds the cache (tlx.js sky comment), and the device screenshots are live frames (B1-vs-S 6.0 mean abs diff, B1-vs-B3 5.6: noise).
Left open: a frozen-frame diff needs a hardware renderer; the stale 'iOS Safari stays RGBA16F' comment at `tlx-post.js:121` is not fixed here.

## #3673 step 3, first race on the unit (monza day, WebGPU, entry 29.8 s, `first: true`)
n100 frames: **2**, both in race state, from the first race frame:
1. at 117 ms, dt 117 ms: `matMiss` +11 in that frame. Keys (all new pipelines at first draw): the `ds` family (`o,0.92,0,0.06,0,0,0,1|ds`,
   `o,0.88,0.04,0.14,…|ds`, `o,0.55,0.3,0.45,…|ds`, `o,0.5,0.04,0.4,0,0.7,0,1|ds`, `o,0.85,0,0.2,0.22,0,0,1|ds`), the `cf|ds` pair
   (`o,0.6285714285714287,0.12,0.85,0,0.045,1,1|cf|ds`), `…|ds|ai` variants, `o,0.9,0,0,0,0,0,1|na`, `o,0.97,0,0.06,0.42,0,0,1|db2,10|ch`,
   `o,0.1,0.05,0.92,0,0,0,1`. Spans show physics 65 ms and render 22 ms in the frame.
2. at 2164 ms, dt 210 ms: `matMiss` 0, no open stage in the ring (the frame began at `frame<210`): not a pipeline build. Unattributed by the
   recorder (could be GC or the compositor).

Pre-mint candidate: the 11 keys of hitch 1 (`_LATE_LIT` pattern of #3640); hitch 2 needs a different probe. Max frame 44 ms outside those two.
