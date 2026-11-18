# Phone sharpness: the trace, the arms and a software A/B (2026-11-18)

Summary: On the phone tier the scaled buffer is the canvas and the browser does the only upscale; of five arms compared on software pixels, a lower FXAA sub-pixel blend is the only one that raised edge contrast, and the two existing upscale keys lowered it.

Kind: measurement · Re-measure-by: 2026-12-20

Rendering lane, branch `claude/render-sharpness-parity-1118`. Path: TLX on three's WebGPU backend, phone tier
(D-013). Follows [RENDER-FRAME-COST-2026-11-18](RENDER-FRAME-COST-2026-11-18.md).

**Evidence class.** The trace is code-read by two independent readers. Sizes and pass counts are counts and
carry to a phone. Every picture and metric below is **software pixels** (Dawn over Lavapipe; the compositor is
modelled as one bilinear stretch): they rank the arms, they do not show what the phone shows. No device ran.

## The trace (both readers agree)

- Present size is `round(cssW * min(devicePixelRatio, 1.5))`; render size is `round(present * scale)`
  (`js/render/three/tlx.js`, the resize path). At 852x368 CSS: 1278x552 present, 959x414 at scale 0.75, 831x359 at
  0.65. Confirmed live here: the canvas is 959x414.
- With UPSCALE off and fixed targets off the canvas drawing buffer is the render size. The composite and FXAA run
  at that size and FXAA draws to the canvas, so the browser stretches 959x414 to 2556x1104: 2.665x (3.076x at
  0.65), not an integer.
- FXAA is unconditional and last; its sub-pixel blend was the compile-time constant 0.75 on all three backends.
- SHARPEN runs in the composite, before FXAA, on all three backends. Its default is 0; the only shipped non-zero
  value is one dawn-wet lighting preset.
- SGSR is off by default on every device (`apex26.spatialUpscale`, the pause-menu UPSCALE row). Its input target
  exists only while upscaling, so its pipeline is never warmed: enabling it mid-race compiles at that moment.

## The arms

| arm | how to open it | buffer | extra cost (count) |
|---|---|---|---|
| base | nothing | 959x414 | none |
| fxaaSub50 / fxaaSub25 | `?lab=fxaaSub50`, `?lab=fxaaSub25` (new, URL only, default off) | 959x414 | none: same passes, same taps |
| fixed | localStorage `apex26.tlxFixedTargets=1` (exists) | 1278x552 | +1 pass at 705k px, 5 taps a pixel; census +10.7 MB here |
| sgsr | localStorage `apex26.spatialUpscale=1` or UPSCALE (exists) | 1278x552 | +1 pass at 705k px, 5 taps flat / 17 on edges; census +3.8 MB here |

## Software A/B

`node tools/gfx/sharpness-ab.mjs capture …` per arm, then `sheet`. Monza, parked helmet camera, one frame per arm.
Each capture is stretched to 2556x1104 and cropped; `lap` is the mean absolute Laplacian of luma and `g99` the
99th-percentile luma gradient, in device pixels (higher is crisper; ringing also raises them).

| crop | base | fxaaSub50 | fxaaSub25 | fixed | sgsr |
|---|---|---|---|---|---|
| dash display (lap / g99) | 2.32 / 36.4 | 2.50 / 37.3 | 2.65 / 38.5 | 1.98 / 30.3 | 2.09 / 31.4 |
| marker board | 1.97 / 35.0 | 2.02 / 36.4 | 2.08 / 37.2 | 1.68 / 33.1 | 1.84 / 29.3 |
| tree line | 2.23 / 27.3 | 2.40 / 29.0 | 2.54 / 30.4 | 1.86 / 23.6 | 2.01 / 23.5 |

Run-to-run noise: a second capture of `base` scored within 0.001 `lap` and 0.00 `g99` of the first on all three
crops, so every difference in the table is far outside it.

Read with the 400% sheets (`artifacts/sharpness-ab/sheet-*.png`, not committed):

- A lower sub-pixel blend raises the edge metric by 3 to 14% for no cost. What it gives up is not in a still: sub-pixel
  blend exists to calm crawl on thin moving detail, so the judgement needs motion on a device.
- `fixed` is the softest arm. It resamples twice (a 1.333x bilinear in the engine, then the compositor's 2.0x); the
  integer second step does not buy back the first.
- `sgsr` recovers part of that and shows ringing on a bright vertical edge (the dash's yellow bar).

So on this evidence the cheap arm is the promising one, and "upscale in the final pass" as it exists today is not.
An upscale that would help has to add detail the bilinear step cannot (a sharper filter, or FXAA after the upscale
at output resolution, 754k px); neither is built.

## Not run

A phone. Two page opens per comparison: with and without `?lab=fxaaSub50`; then the two storage keys above.
Nothing here measured frame time.
