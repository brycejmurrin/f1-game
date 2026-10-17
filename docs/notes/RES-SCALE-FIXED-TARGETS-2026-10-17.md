# Resolution scaling without target reallocation (#2655) — baseline and design findings, 2026-10-17

Status: baseline measured, design sized, NOT implemented (stopped at the ~90 min cap; see "Why stop").

## Baseline (exact counts)
`node tools/gfx/res-scale-census.mjs` (monza race, TLX WebGL2 on SwiftShader, 960x540, scale 1 → .9 → .8 → .7 → .6 → .5 → .7 → 1):

| step | targets | rtResizes delta |
|---|---|---|
| 1 → 0.9 … 0.7 → 1.0 (7 effective steps) | 864x486 … 960x540 | 11 each, 77 total |

`renderer.info.memory.textures` stays 54–56 (old textures are disposed on resize, so the peak is transient, not visible at rest).
Every step reallocates all 11 post targets (scene, LDR, 2 SSAO, 2 godray, 5 bloom levels); the counter is `post.state().rtResizes`
(`tlx-post.js` `rtSetSize`). The wall `callMs` the probe also prints (8–22 s) is a SwiftShader artefact and is not a claim.
Oracle for the "after": 0 resizes per step at any scale in [0.5, 1] once the cap-size set exists.

## Findings that size the work
- three's `screenUV` = `screenCoordinate / screenSize`, and `screenSize` is the bound RENDER TARGET size, not the viewport
  (vendored 0.186.1, `ScreenNode`); with `flipY` the coordinate is `size.y - frag.y`. So a sub-viewport anchored bottom-left
  makes `screenUV` span x in [0, rx], y in [1-ry, 1]. Passes that sample a same-layout source at `screenUV` stay consistent
  by construction; anything treating `screenUV` as 0..1 breaks: the sky ray build (`tsl-sky.js` 320, 481, 772), SSAO/SSR/godray
  ray reconstruction in `tsl-post.js` (10 `vec2(screenUV)` sites), and every `screenCoordinate` consumer (`tlx-shadow.js` 196, mirror in `tsl-fx.js`).
- Edge clamp is needed at every bilinear/blur/bloom tap (about 50 `.sample(` sites in `tsl-post.js`), per target, from the integer viewport.
- The canvas must stay present-sized (today the drawing buffer is `W x H` unless SGSR is on), so the final pass becomes an upscale:
  the fixed-target mode has to ride the existing `wantSpatialUpscale` path, whose source rect (`P.sgsr.U.viewport`) must become the sub-rect.
- Capture, soft-blit readback, viz, mirror inset and `drawWarm` (1x1 scissor) all assume target size == render size.
- The flag-off graph can be byte-identical by building the extra nodes only when the flag is on, so "identity at 1.0" is then structural.

## Why stop
Touching sky, post (about 50 sites), shadow dither, mirror, capture and SGSR in files three sibling sessions are also editing
(#2661, #2649, #2656), each verification a 5–40 min SwiftShader cycle, does not fit the cap, and the issue itself sequences this after
the phone soak (#1633) that shows steps really hitch on a device. Recommended plan for whoever takes it: (1) flag `apex26.tlxFixedTargets`,
(2) a `tlx-viewport.js` module owning per-target ratio uniforms and a `remapUV`/`clampUV` helper, (3) migrate passes in the order
bright → bloom → blur/SSAO → composite → FXAA → SGSR, comparing each against legacy scale 0.7 frames (same-tree noise floor),
(4) sky/SSR/godray last. Measure with the probe above.
