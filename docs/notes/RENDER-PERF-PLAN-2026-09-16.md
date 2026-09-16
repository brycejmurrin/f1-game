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

> **WITHDRAWN 2026-09-16 (run 141).** The section below, and every GPU delta
> quoted anywhere in this note, is inside its own noise. Run 141 measured the
> floor for the first time — the SAME state sampled twice — and it came back at
> **17.9 % on one leg and 45.2 % on another**. The draw-call-bound conclusion
> rests on a 2.9 % difference. It is not supported, and neither is
> "occlusion costs 2.1 %", "occlusion costs 15.8 %", or anything else timed
> here. What survives is stated in §6.

### First reading (run 139): DRAW CALLS, and it is not close in direction

    chunked   152 draws, frustum + radial culled   18.75 ms  @0.75 MP  [138, off]
    UNCHUNKED   1 draw,  every prop vertex, no cull 18.21 ms  @0.59 MP  [139]

**One draw call carrying 441,000 vertices with no culling at all beats 152
culled draws.** Three independent results now point the same way: GPU time is
invariant to pixel count (not fragment-bound); occlusion culling, which removes
vertices and adds draws, COSTS 2.1 %; and removing draws while adding every
vertex back SAVES about 3 %.

The honest caveat is that 2.9 % is at the ~3 % noise floor and the two runs used
different canvas sizes, so this is the direction rather than the magnitude. The
confirmation is two runs with `apex26.resMode=high` pinned on both, differing
only in `propsUnchunked` — same canvas, same commit shape, one variable. That is
the next request.

What it already rules out: any plan whose first move is to submit fewer
vertices. The frustum and radial culls this renderer already does are not
earning their draw calls, and a cull that adds draws to remove vertices is
pushing on the wrong end.

## 3. The work, ranked, each with its gate

1. **Answer §2.** One census leg with `propsUnchunked=1` against one without.
   Gate: a GPU delta outside +/-3 %, the noise floor the A/B above showed.
2. **Park the AI field during the pixel diff.** The instrument cannot currently
   resolve a change smaller than the cars moving. Gate: two captures with
   occlusion off diff at under 0.01 %.
3. **`WEBGL_multi_draw` — now the favourite, pending the pinned-resolution
   confirmation.** Collapse the per-chunk
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

---

## 6. What actually survives run 141

**The GPU-time instrument does not work yet.** The floor row, added precisely to
catch this, caught it on its first run:

| leg | effect | its own floor | verdict |
|---|---|---|---|
| occlusion | +20.2 % | 17.9 % | barely above — not significant |
| multi-draw | +14.3 % | 45.2 % | far below — meaningless |

Two blocks of twelve samples cannot resolve a ten-per-cent effect when anything
that drifts between the blocks lands entirely on the difference. Fixed by
interleaving — toggle, settle, one sample, toggle back, settle, one sample,
twenty rounds — so both states are spread over the same wall time and slow drift
cancels to first order. The floor stays, and is now the test of whether the
sampler is good enough.

**What is still true, because it was never timed:**

- Between 56 % and 85 % of prop chunks contribute no pixel
  (`occlusion-estimate.mjs`, exact software visibility, resolution-stable).
- Multi-draw does what it claims mechanically: **2,496 ranges collapsed into 312
  calls, 2,184 `drawElements` avoided** in one settle window.
- Neither feature changes the image: both pixel diffs sit at their own floor.
- All three backends pay a per-draw cost — GLX ~152, TLX 184 measured, WGX per
  chunk (`BACKEND-DRAWCALL-RESEARCH-2026-09-16.md`).

**What is NOT established:** that draw calls bind rather than vertices; that
occlusion culling costs time; that multi-draw saves it. Those need the
interleaved sampler to clear its floor first, and until it does, no default
should move on timing evidence.

The counted oracles remain trustworthy because counting is exact here and timing
is not — which was the lesson twice over before this, and is now the lesson
three times.

## 7. The grouping defect run 143 exposed, and what fixing it was worth

Run 143's counted oracle said multi-draw was issuing **4,709 calls for 4,853
ranges — 1.03 ranges a call**, paying the indirection and collecting none of the
batching. The timing beside it (+20 %, against a 5.9 % floor) invited deleting
the feature; the counter said the grouping was wrong instead, which is a thing
to fix. That is the whole argument for printing a count next to every timing.

**The cause.** The first cut kept the drawElements run-merge's shape and only
let a group survive a culled gap, so it still walked chunks in ARRAY order and
extended while the NEIGHBOUR matched. Multi-draw's one real capability —
carrying ranges that need not be adjacent — was never used. The fix files every
visible chunk under a group id baked once per lamp table (`_groupIds` in
`js/render/glx/chunked.js`) and issues one call per group.

**What it is worth**, measured per frame at vegas with the clock held at 02:00,
player at 0.35 of a lap, counters read through `__apex.multiDraw()`:

| | per frame |
|---|---|
| visible chunk draws in the lamp branch | 108.5 |
| groups by NEIGHBOUR (what the first cut made) | 24.5 |
| groups by SET (what it makes now) | 15.0 |

**9.5 fewer draw calls a frame.** Real, and far too small to be a frame time.
So the fix makes multi-draw correct, not valuable, and nothing here argues for
moving its default.

**Two predictions of mine the measurement refuted**, recorded because both were
stated confidently before the counter existed:

- *"Chunk array order is emission order, so neighbours are spatially unrelated
  and almost never share a set."* They group 108.5 draws into 24.5. Emission
  order tracks space far better than that.
- *"The lists are distance-sorted, so chunks with the same lamps compare
  unequal, and that is the main cause."* The same scene with the unsorted key
  gives 22 → 14. Canonical order is worth about one group a frame. It stays
  because a set is a set, not because it pays.

**Still unexplained:** why run 143 saw 1.03 ranges a call where the same scheme
gives 4.4 locally. The census leg ran `macos-latest` at `resMode=high` and its
counters are cumulative over every `drawChunked` call, env-probe faces included,
and a probe face that sees one chunk contributes a one-range call. Until a
census carries `perChunkDraws`/`consecutiveGroups`/`setGroups`, 1.03 is a number
about that run, not about this branch.

**What the fix also bought, and is worth more than the nine calls:** the lamp
branch now has an equivalence test. Every multi-draw test before this ran
`perChunkLights: 0` — the PLAIN branch — so the branch that actually ships at
night, and the one where a group left open across a culled chunk would undo the
cull, was covered only by a regex on the source. It is now covered by running
both paths over a fixture with a hole in the middle of the chunk array and
requiring the identical index bytes (`tests/unit/glx-multidraw.test.mjs`).
