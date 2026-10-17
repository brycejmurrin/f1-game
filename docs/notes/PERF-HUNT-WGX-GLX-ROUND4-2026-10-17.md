# WGX / GLX CPU hunt, round 4 — 2026-10-17 (lane P4): the last #2688 rows, all REFUTED

Same census as rounds 2-3 (prototype-wrapped GPU calls attributed by JS caller stack, counts only).

## WGX group-1 bind filter (drawDecal / drawChunked) — not worth a PR
WGX Vegas **night** (the case with the night-mask and per-chunk lamp paths), per frame: `setBindGroup` 326.7 of which
- 163 at `wgx-chunked.js:358` (per-chunk lamp path: one dynamic-offset DrawU slot per visible chunk, 84 + 59 + 20 across
  props / terrain / glass) — each chunk binds its OWN slot (different `lampRange`), so none of these is redundant. The
  adjacent-chunk merge that would remove them was measured in `PERF-FINDINGS.md` §2b (3 shared non-empty pairs of 909) and the
  source comment says "Do not re-open it"; this census agrees.
- 31 at `wgx-chunked.js:243/447` (night-mask runs: each run owns a mask slot) — needed for the same reason.
- 42 at `wgx.js:5145` (`drawInstanced`: one DrawU slot per prop batch) — needed.
- `drawDecal`'s `setBindGroup(1, _activeFrameBG)` (wgx.js:5386) fires about once per frame (Monza); a `__bg1` filter would save
  <= 1 call/frame, and the base-slot bind at `wgx-chunked.js:268` ahead of the per-chunk branch is <= 1 per chunked mesh (~4/frame
  of 327). Neither pays for a new expando that every one of the seven group-1 bind sites would have to maintain.

## GLX decal constant state, particle frame uniforms — below the noise
After #2697 the attributed GLX top-28 sites on Monza (day) are: 66 per-batch VAO binds, 14 `uModel`, and `uniform1f` sites at
2-5 per frame. `drawDecal` and `drawParticles` do not appear in it (each < 3 calls/frame in this scene). Dropped.

## State of #2688 after this round
All WGX/GLX rows are either landed (#2660, #2675, #2682, #2691, #2694, #2697) or refuted with a number
(round 2 light-set restore, round 3 descriptor pooling, this round). What remains in the backends is structural
(one VAO / bind group / draw slot per batch or chunk), i.e. a data-side change (merge batches, fewer chunks), not a CPU-side
backend fix.
