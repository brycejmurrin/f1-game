# Tree budget decision — 2026-10-19

Refs [#1619](https://github.com/brycejmurrin/f1-game/issues/1619). Measured on
deploy tip `484d7ea10` with `node tools/gen/trees/measure-tree-budget.mjs`
(`tools/lib/track-build-vm.cjs` + `TrackHiddenFaces.compact`, same path as
`tools/track/props-tris.cjs`).

## Decision (option B)

**Stay within the cone / procedural budget.** Reject the
`createInstancedBatch` VM stub for now: TLX on software WebGPU skips instanced
batches (`docs/plans/2026-10-01-models-life.md` Slice D), so CI frames would
lose every tree and the props-tri ratchets would stop seeing tree cost.

Constraints for baked trees (this slice and the later placement slice):

- LOD0 ≤ measured post-strip triangle mean of the procedural species it replaces
- LOD1 ≤ half of LOD0 (integer floor)
- Placements 1:1 (no new trees)
- No raise of `tools/track/props-tris-baseline.json`
- Pack stays inside `tools/gen/assets.mjs verify` cap when models land

This slice changes no circuit and commits no model (bakes go to ignored
`artifacts/trees/` only).

## Focus circuits (prop counts + graph mean tris)

| circuit | pine | tree | palm | pine μ tris | tree μ tris | props tris (post-strip) |
|---|---:|---:|---:|---:|---:|---:|
| spa | 5028 | 266 | 0 | 44.67 | 51.00 | 399525 |
| suzuka | 1355 | 1322 | 0 | 44.74 | — | 285313 |
| monza | 325 | 310 | 0 | 44.85 | — | 294760 |
| silverstone | 431 | 899 | 0 | 44.55 | — | 427691 |
| fuji | 1624 | 96 | 0 | 44.73 | — | 564732 |
| monaco | 0 | 0 | 59 | — | — | 256198 |

Graph-instanced pines/trees: compacting a single canonical mesh is a no-op
(coplanar strip needs neighbouring copies in the soup), so post-strip tris per
instance = the graph model's `idx.length/3`.

Non-graph broadleaf `tree()` and `palm()` use `track.props.list` counts; palm
tris are the `nature.js` part recipe counted through `TrackGeom` (3×seg-6
cylinders + crown box + 9 prisms + 3 boxes = **156** tris).

## Fleet species means → LOD caps

| species | source | mean tris | LOD0 cap | LOD1 cap |
|---|---|---:|---:|---:|
| pine | graph instances (n=29904) | 44.73 | **45** | **22** |
| tree | graph lobed instances (n=561); round-crown crown-only also 51 | 51 | **51** | **25** |
| palm | nature.js recipe via TrackGeom | 156 | **156** | **78** |

Caps live in `tools/gen/trees/caps.mjs`. Plan reference (~70 tris = 8 leaf
cards + 4-segment trunk) remains the design intent for *look*; measured pine
and broadleaf means are already under that, so the bake fails closed on the
tighter numbers.

Orchestrator tip note (pre-strip FOLIAGE verts on an earlier tip): Spa ~5,517
crowns / 45% of props verts — consistent with this tip's 5,294 pine+tree
placements and Spa props tris ≈ 399.5k (baseline 399,040).

## Format

AX26 **v3** = v2 packed body + trailing `u8` sway (`w×255`), decoded as
`mat = id + (sway/255)×SWAY_FRAC` (`SWAY_FRAC = 0.45`). Writer:
`tools/lib/pack-assets.cjs` `writeAX26v3`. Reader: `js/render/shared/assets.js`
`_parseModel` (v2 files unchanged). Bake:
`node tools/gen/trees/bake-trees.mjs` after
`npm i --no-save @dgreenheck/ez-tree three`.

## Remaining (not this PR)

- Commit baked models into `assets/pack/`, CREDITS, manifest
- Swap scenery placements 1:1 once kenney / stands hunters land
- `verify-track spa` against the swapped pack
