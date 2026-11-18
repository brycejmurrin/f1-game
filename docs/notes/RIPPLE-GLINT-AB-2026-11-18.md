# Rain ripples and the sun highlight on puddles: before/after on software pixels (2026-11-18)

Summary: the TLX/WGX fix for #5777 row 1 is pixel-identical when dry and a faint sparkle in rain, because the broad sun patch on a puddle already rippled on all three backends; a moving-camera check found 13% more flicker flips in the glint, inside the agreed bound.

Kind: measurement · Re-measure-by: 2026-12-20

Rendering lane A3, PR #5781. **Evidence class of every number here: `software`** (this container, SwiftShader, no
GPU). Nothing here was measured on a phone or a real GPU.

## What was wrong, exactly

GLX tilts the normal for rain ripples and re-dots the sun-specular terms against it (`keySpecNoL/NoV/NoH`). TLX and
WGX cached `NoL/NoV/NoH` before the tilt. #5777 row 1 described that as "rain ripples do not reach the sun glint".
That overstates what a player sees: the broad sun patch on a puddle is the **env-reflection sun flash**, which reads
the rippled normal on all three backends already. Only the Cook-Torrance key lobe was flat, and on pooled water
roughness is 0.02, so that lobe is a pinpoint.

## The scene

Monza, `day|rain`, `lightTune({wetness: 1})`. The first try (track-level camera, `eyeAt`) showed no sun glint on any
backend: `day|rain` is overcast (sun colour 0.565, 0.475, 0.36; keyMul 0.85) and puddles are sparse (gutters and the
low side of camber). The scene that works is placed on purpose:

1. Start the race in rain and let it run about 20 s at render scale 0.25 before freezing. `frame.rain` eases per
   rendered frame; a freeze right after `weather("rain")` leaves it near 0 and the ripple branch never runs.
2. Find standing water with the shared reference: scan `Puddles.mask(x, z, {wetness: 1, lat})` over the lap at
   3.5 and 4.5 m off the centreline (best: lap fraction 0.048, 4.5 m left, mask 1.0).
3. Put the camera opposite the sun at the sun's own elevation (48 degrees here), 7 m from that point, so the puddle
   mirrors the sun into the lens (`freeCam({eye, target, fov: 40})`).
4. Pin the render clock (`renderClock(123.4, true)`) so the ripple phase is the same in every capture.

## Stills: GLX | TLX before | TLX after (glint box, 1280x720 frame)

![GLX, TLX before the fix, TLX after the fix](img/ripple-glint-glx-tlxbefore-tlxafter.png)

TLX before vs after inside the 400x330 px glint box: 4,879 pixels differ at all, 83 by more than 8 (of 765 summed
RGB), 5 by more than 30, max 41. Luma in the box: mean 83.7 and p99 144.6 in both. The x6 difference image is faint
concentric rings with one small bright spot: the lobe now follows the ripples, as designed.

## Dry identity

Dry Monza, same camera, TLX: the deploy tip (9261395b), this branch, and this branch again produce the same PNG
(sha256 `d1fb0e33…`): 0 of 921,600 pixels differ in all three pairings. This is one scene on software pixels, not a
general bit-identity claim; the op-level argument is in the PR (with the ripple branch not taken the copies equal
`NoL/NoV/NoH` and the glint scale uses the operand order of the diffuse `litNoL`).

## Shimmer in motion (the aliasing risk)

A roughness-0.02 lobe on a tilting normal is what sparkles. Check agreed before running it: 959x414 buffer (the
phone's size at render scale 0.75), `apex26.forceMobileTier=1`, 18 consecutive frames with the render clock stepped
1/60 s and the camera gliding along the track at 60 m/s, rain particles at the knob minimum (20). Metric: per-pixel
frame-to-frame absolute luma difference inside a 160x130 px glint box, racing-line arrow pixels masked out (9,201 of
20,800 pixels kept, 156,417 pixel pairs).

| state | mean | p99 | pairs that flip by more than 30 |
|---|---|---|---|
| TLX before | 5.223 | 31.20 | 1,709 |
| TLX after | 5.513 | 32.80 | 1,924 |
| TLX after, repeated | 5.514 | 32.80 | 1,924 |
| GLX (has shipped with this lobe) | 4.716 | 31.28 | 1,705 |

The repeat shows the capture is deterministic (same-frame difference between the two runs: mean 0.002, no pixel
over 30), so the before/after gap is real: p99 x1.05, flips x1.13. The rule fixed beforehand was "ship default ON
if AFTER's p99 and flip count are within 1.25x of BEFORE, or no worse than GLX"; it passes on the first clause.
AFTER is a little worse than GLX on flips (1,924 against 1,705).

Cut for time: 18 frames rather than 60, and the 831x359 buffer (render scale 0.65) was not run; a phone-sized TLX
frame with a moved camera takes about 35 s here.

## Not run

- Any real GPU or phone. The device check that matters: a wet race in rain with the sun out on the default
  renderer, pause menu RENDER SCALE at 0.75 and then 0.65, watching puddles in the gutters while moving.
- WGX in motion (opt-in backend; stills only).
