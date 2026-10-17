# Per-frame allocation hunt, 2026-10-17

Lane: perf hunter, branch `cursor/perf-alloc-hunt-5d2c`, PR #2591. Baseline: `TLX-PERF-HUNT-5-2026-10-16.md`
(130–260 KB allocated per frame). Container is SwiftShader; this is JS heap only, no GPU claim.

## Method

`scratch/allocprobe.mjs` (untracked; headless Chromium + `recordVideo` so rAF ticks + program-link stub from the TLX
note §Method). 20 s settle, then `HeapProfiler.startSampling` (interval 4096 B) with `includeObjectsCollectedByMajorGC`
and `includeObjectsCollectedByMinorGC`, so garbage counts. Each sample is scaled by `size / (1 - exp(-size/interval))`
and divided by rAF frames. Builtin frames (`next`, `max`, `hypot`) are attributed to their caller. Monaco, chase
camera, 22 cars, 20 s window.

Caveat found on the way: a run on a loaded box (the commit hook's guards) gave 322 frames and 591 KB/frame, because
fewer frames per second means more physics substeps per frame. **Per-frame bytes are only comparable on an idle box**;
total KB/frame also moves with that, so wins are claimed per site, not on the total.

## Result (Monaco, 3 interleaved runs per arm, idle box)

| site | base | scalar test (74411625) | + Float64Array bounds (3fa5b584) |
|---|---|---|---|
| `js/ui/hud-layout.js` (clearReadouts/findSlot) KB/frame | 52 (47–58) | 24 (21–25) | 11 (11–11) |
| `js/physics/collide.js` `fillArcBuckets` KB/frame | 6.5 (5.9–7.3) | 0 | 0 |
| whole frame KB/frame | 273 (257–283) | 229 (224–234) | 229 (211–244) |

The whole-frame row after the second fix overlaps the first; only the per-site rows clear the spread.

Fixes (behaviour-neutral: same candidate order and comparisons, same buckets visited in the same order):

- `hud-layout.js clearReadouts`: `findSlot` built an object and a `blocks.some` closure for each of ~1000 candidate
  slots; now a scalar overlap test over a reused `Float64Array` of EDGE-inflated obstacle bounds, one result object.
- `collide.js`: `arr.length = 0` on each bucket every frame frees V8's backing store, and `push` regrew it. Buckets
  now keep their arrays with a per-bucket count `_arcN`. `traffic-arc-buckets.test.mjs` had asserted the literal
  `arr.length = 0` as "reuses arrays"; it now asserts the opposite.

## Remaining sites, ranked (fix arm, mean KB/frame of 3 runs)

| KB | site | owner / action |
|---|---|---|
| 17.5 | `js/game.js:5781` updateCarLateral | **report row**: game.js needs a claim; per-car per-step temporaries |
| 16.7 | `js/game.js:5389` updateCarBrakePlan | **report row**, same |
| 16.6 | `js/game.js:4908` updateCar | **report row**, same |
| 6.4 | `js/track/core/spline.js:135` curvature | not in OWNED (`js/track/`) |
| 6.4 | `js/game.js:7378` render | report row |
| 5.9 | `js/render/glx/glx.js:2142` litMaterial | not in OWNED (`glx/`) |
| 5.7 | `js/physics/tyre-model.js:870` update | candidate: needs per-field representation check (cars are built in game.js) |
| 5.7 | `js/game.js:6328` updateCarAdvance | report row |
| 4.0 + 3.4 | `js/lighting/frame-lights.js` `_rankSet`, `_byDistAsc` | not in OWNED (`js/lighting/`) |
| 3.4 | `next <- js/game.js:4559` update | report row: `for…of` over an array/Map in the hot path |
| 3.2 | `next <- collide.js:717` resolveCollisions | candidate: an iterator in `resolveCollisions` |
| 2.7 | `js/render/shared/frustum.js:18` extractPlanes | candidate: `Math.hypot(a,b,c)` boxes; `sqrt(a*a+b*b+c*c)` is not bit-identical, so not taken |
| 3.7 | `next <- hud-layout.js findSlot` | remaining `for…of` over `xs`/`ys` (could be indexed loops) |

Nothing outside `js/game.js`, `glx`, `track`, `lighting` was left above 6 KB/frame in my paths.
`hud-layout.js` still runs a full fit whenever `_fitKey` changes; why it changes that often is a behaviour question and
was not touched.

## Not run

Spa, Vegas night, Singapore night profiles; any phone-GPU or GC-pause measurement (this box cannot time it);
physics-characterization (no physics maths changed, but the group was not run here).
