# TLX draw-order audit for hidden-surface removal (#2649, item 5)

Question (PERF-RESEARCH-2026-10-17 §2 item 5): does TLX submit opaque draws in an order that defeats a tile GPU's
hidden-surface removal (WWDC20 10602: opaque first, then discard/alpha-test, then translucent; do not interleave)?
Would front-to-back sorting help?

## Method
Read-only probe (a throwaway `drawOrder()` snapshot on `GLX.__tlx`, taken in `present()` before `resetRecs()`, then
reverted — it is not in the tree). montreal, race started, 80 stepped frames, `--backend three` (SwiftShader, so this is a
COUNT of submission order, not a timing). Classes: T-* = `material.transparent`; O-plain = opaque, depth test+write,
`NoBlending`; O-blended = opaque list but a blend equation set.

## Measured (one frame, 37 records; a chunked record fans out to many meshes of the same material)
O-plain 26, O-blended 7, T-blend 2, T-alphaTest 2. Run-length sequence:
`plain×19, T-alphaTest, T-blend, plain, O-blended, plain×6, O-blended×6, T-alphaTest, T-blend`.

## Findings
1. Every `Discard`/`alphaTest` material is an FX material (`tsl-fx.js:103,217,343`) with `transparent = true`; lit
   world materials never discard. three's render list puts all of them in the transparent list, drawn after every opaque
   whatever their `renderOrder`. So the "alpha-test after opaque" rule already holds by construction.
2. three's opaque comparator is `groupOrder, renderOrder, z (ascending), id` (vendored 0.186.1 `Cb`). `renderOrder = i`
   is unique per record, so z never breaks a tie: the opaque order IS the emit order, and the sky is drawn last at the
   far plane with `LessEqual` (`tlx.js` makeSkyMat), which is the HSR-friendly late-sky shape.
3. The only interleaving inside the opaque list is the 7 `O-blended` records: opaque draws with `noAlphaWrite`
   (`tsl-lit.js:2384-2391`, colour One/Zero, dst alpha kept so the SSR tag survives). One sits between two plain runs.
   Moving them last would change nothing visible, but three has no alpha-only colour mask, so they cannot become
   `NoBlending` without losing the tag. Whether blending-enabled opaque draws cost HSR on ANGLE-Metal is unknown.
4. Front-to-back adds nothing on a TBDR (HSR is order independent for opaque geometry) and only early-Z on an IMR
   desktop GPU, where the world is already roughly ordered by emit sequence. 26 opaque records is far too few for a
   sort to move a frame.

## Verdict: negative result, nothing to ship
No code change. A reorder would be a guess about ANGLE-Metal that this container cannot test (SwiftShader has no tile
memory); if it is wanted, the experiment is one `gpu-census.yml` A/B (macos-latest) that moves the 7 `O-blended`
records after the plain run, counted by `fragmentsDrawn`-style counters, not by fps.

Remaining #2649 trims (sky cache 512, godray R11F) are look changes whose win is a GPU claim; the sky cache flag
already exists default-off, and flipping it for mobileTier needs a frozen pixel diff plus a census A/B, not done here.
