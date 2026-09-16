# Render performance — plan (2026-09-16)

Written after the measurements, not before them. Every number below was taken
on `macos-latest` (Apple/Metal, the one image the census calls
`anyHardware: true`), on the GLX leg, which is the backend players get.

## 1. What is established

**The frame waits on the GPU, and pixel count does not move it.**
GPU 19.17 ms at 0.75 MP against 20.34 ms at 0.45 MP — 1.67x the pixels, 0.94x
the time. That rules out fragment-bound. It does NOT separate vertex-bound from
draw-call-bound, and a previous round of this work treated it as if it did.

**Most of what the renderer submits is invisible.**
`tools/check/occlusion-estimate.mjs` rasterises every prop triangle into a depth
buffer carrying the cell id that won each pixel, so the surviving ids are exactly
the chunks that show something. Four cameras, 512x288:

| circuit | cells submitted | show a pixel | wasted |
|---|---|---|---|
| vegas | 152 | 23 | 84.9 % |
| monza | 207 | 41 | 80.1 % |
| spa | 359 | 158 | 55.9 % |

**Occlusion culling works and costs 2.1 %.** The in-run A/B — same commit, same
runner, render clock pinned, seconds apart — on GLX:

    gpu off=18.75 ms   on=19.15 ms   delta +2.1 %
    pixels 1413 of 921600 differ (0.153 %), meanAbs 0.192

Two readings, and the second is the one that matters.

*Correctness: it does not break the picture.* The three legs where occlusion is
unsupported (WGX, TLX x2) diff at 0.088 %, 0.271 % and 7.533 % between their own
two captures, because pinning the render clock freezes sky and cloud but NOT the
AI field, which keeps driving between shots. Those legs are the control: GLX's
0.153 % sits inside the range of "nothing changed except the cars", so the pixel
diff shows no hole. It also shows that this diff cannot resolve better than the
field's own motion, which is a limitation of the instrument and is fixed by
parking the field, not by reading more into the number.

*Cost: it is a small loss, not a win.* +2.1 %, measured properly. The earlier
"10 % slower" was across separate commits and is withdrawn.

**The design is the superseded one.** NVIDIA's reference sample says of itself
that it is "not based on individual occlusion queries anymore, but uses shaders
to cull many boxes at once". Per-object queries are what the field moved away
from and what this repo now has: 155 proxy draws and 155 queries a frame to skip
146 real draws. That is a draw-call cost paid to buy a vertex saving.

## 2. The one open question

**Vertex-bound or draw-call-bound?** They want opposite fixes and nothing has
separated them. `apex26.propsUnchunked` (already in the tree, default off)
uploads the props as ONE mesh — every vertex submitted, no frustum cull, no
occlusion, exactly one draw call.

- **Faster than chunked** -> draw calls bind. `WEBGL_multi_draw` is the first
  lever (92.6 % support, 100 % iOS and Safari; Firefox 1.4 % needs the
  fallback), because it collapses the per-chunk draws themselves.
- **Slower** -> vertices bind. Batched culling is the first lever, and the
  per-object query overhead is the thing to remove.

Nothing below should be built before this answers.

## 3. The work, ranked, each with its gate

1. **Answer §2.** One census leg with `propsUnchunked=1` against one without.
   Gate: a GPU delta outside +/-3 %, the noise floor the A/B above showed.
2. **Park the AI field during the pixel diff.** The instrument cannot currently
   resolve a change smaller than the cars moving. Gate: two captures with
   occlusion off diff at under 0.01 %.
3. **If draw-call-bound: `WEBGL_multi_draw`.** Collapse the per-chunk
   `drawElements` run into one `multiDrawElementsWEBGL`. The chunk ranges
   already exist — `tests/unit/chunked-index-ranges.test.mjs` proves they tile
   the buffer exactly — so this is a call-shape change, not a data change. Gate:
   the existing equivalence test unchanged, plus an in-run A/B showing the GPU
   delta beyond the noise floor. Fallback path required for Firefox.
4. **If vertex-bound: batched occlusion.** One instanced draw of every proxy box
   into a small target, depth-tested against the scene, the fragment shader
   writing the surviving instance id; one readback gives the visible set. 155
   draws and 155 queries become 1 and 1. It is the GPU form of what the software
   estimator already does. Gate: same counted oracle, plus the A/B, plus the
   parked-field pixel diff.
5. **Then reconsider the per-object path.** Batched culling and multi-draw
   compose; per-object queries compete with both. Expect to delete it.

## 4. Rejected, with reasons

- **Shipping the current per-object cull ON.** It costs 2.1 % and the reference
  implementation abandoned the technique. The flag and the settings row stay,
  defaulted off, because they are how the successor gets measured.
- **A depth pre-pass.** The original rejection was right about this specific
  technique and wrong to generalise from it; WebGL2 needs no pre-pass for either
  successor above.
- **Vertex quantization as a frame fix.** Real, but aimed at graphics memory:
  uploads are 119-318 ms of a race-entry block, not frame time.
- **The box bottom-face cull.** Built, measured at 0.27 % of prop vertices
  against a claimed 13 %, reverted.

## 5. Risks

- **Every number here is one runner.** An Apple Paravirtual device is not a
  player's GPU, and the phone leg remains unreachable from CI entirely.
- **The noise floor is about 3 %.** Two of this session's conclusions were
  drawn from differences smaller than that across separate runs, and both were
  wrong. In-run A/B or it does not count.
- **Counted oracles measure work avoided, not time saved.** 94 % of chunks
  skipped read as a triumph and was a 2 % loss. Keep both instruments; believe
  the clock.
