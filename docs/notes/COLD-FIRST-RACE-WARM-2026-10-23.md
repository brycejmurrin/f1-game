# Cold first-race warm on three.js WebGPU: where 16.9 s goes, ranked (2026-10-23)

A·W14, Fleet A (OrchA 31's lane). Device data (A·D1, #3652 ledger row 17): on a cold iPhone 14, the first race is
Monza night on three.js WebGPU and its warm takes 16.9 s.

| stage | time |
|---|---|
| `scene` | 10.8 s |
| `draw` | 3.85 s (rig 1.12 s) |
| `fx` | 2.2 s |
| post, shadow, mirror | about 0 |

The mirror preparation is not part of this cost (#3631).

## 1. Headless census: which pipelines a cold first race builds

`scratch/df/cold-warm-census.mjs monza night dry` boots one fresh page on lavapipe (TLX WebGPU). It tags every
`createRenderPipeline(Async)` with the TLX program it was built for (via the backend call stack), its vertex buffers,
targets, depth/bias, cull/winding and blend. It times each async compile, and attributes each one to the warm stage
running at the time.

Warm: scene 10.4 s, fx 5.3 s. 44 pipelines, 21 fragment modules.

| program | pipelines | layouts | fragment modules | compile sum (lavapipe) | stages |
|---|---|---|---|---|---|
| `tlx-lit-mrt-keep` | 7 | 1 | 1 | 7.2 s | scene 1, **fx 5**, shadow 1 |
| `tlx-lit-mrt` | 5 | 1 | 1 | 5.3 s | scene |
| `tlx-lit-ch-mrt` | 2 | 1 | 1 | 2.1 s | scene |
| `tlx-sky-fb` | 1 | 1 | 1 | 0.28 s | scene |
| every fx/depth/blocker program together | 21 | | | 0.15 s | |
| post chain (8) | 8 | | | built at the first frame (the `draw` warm) | |

**The unit of cost is one lit pipeline: about 1 s on lavapipe, about 1.2 s on the iPhone 14** (scene 10.8 s ÷ ~9
lit pipelines). The 14 lit pipelines are about 95 % of the compile time. They share ONE fragment program per
family, ~116 KB of WGSL, and ONE vertex layout. Only pipeline STATE differs between them. On WebKit every distinct
`GPURenderPipeline` compiles its own Metal function, which the device measurements bear out: each costs 300–600 ms
on the 18 Pro Max, and nothing is shared across states.

The lit pipeline states, and what forks each one:

| state | count | from |
|---|---|---|
| back/ccw, depth write | 2 (mrt, ch) | ordinary opaque geometry |
| back/ccw + depth bias | 3 (mrt ×2, ch) | three distinct biases: floor `[4,16]`, terrain `[2,10]`, start line `[-2,-4]` (game.js `_wm*`) |
| none (DoubleSide) / ccw and cw | 2 | double-sided props; the `cw` twin is for mirrored (negative-determinant) draws |
| `-keep` (noAlphaWrite) opaque, back/cw / back/ccw / none/ccw | 3 | rig fx, lamps, flames: the separate keep program |
| `-keep` **transparent**, back/ccw, back/cw, none/ccw, none/cw | **4** | the LATE variants (`warmLateLit`, `_LATE_LIT` / `_LATE_FX`): brake ring, cockpit ERS bar / OT lamp, both windings |

## 2. Candidates, ranked by measured cost

Each removed lit pipeline is worth about 1.2 s on a cold iPhone 14.

1. **Take the late variants off the blocking warm. Compile them during the grid countdown.** This covers the `fx`
   stage: 5 lit pipelines, 5.3 s on lavapipe, 2.2 s on the iPhone 14.
   - Their first draw is always after lights-out: hot brakes, the first ERS deploy, a throttle lift. The countdown
     (`COUNTDOWN_S` lights plus `startHold`) gives at least ~5 s, more than the 2.2 s they take.
   - The look is unchanged and the mid-race stall stays covered. The compile just stops holding the entry.
   - Mechanics: each compile sets the warm's render context (scene target + ssrTag MRT), starts `compileAsync`
     (three fixes the context synchronously), restores the context, and only then awaits. A race frame can't
     interleave.
   - **Expected: −2.2 s of the 16.9 s.**
2. **One depth bias for floor and terrain.** Use one value for both `[4,16]` and `[2,10]`.
   - Saves 1 scene pipeline, about 1.2 s.
   - Risk: their relative order where floor meets terrain changes, so it needs a z-fight check on the circuits
     that use both.
3. **Drop the speculative winding twins nobody draws.** `warmLateLit` compiles every late variant for both
   winding signs.
   - The cockpit ERS bar and OT lamp (`_rigFxA`, `none/cw`) are not drawn mirrored, so their twin is likely dead:
     0–1 pipeline.
   - Measure which twins a real race uses before cutting any.
4. **Merge the chunked and plain lit programs.** Saves 2 pipelines, but it's a large refactor of tlx-chunked and
   tsl-lit. Not proposed.
5. **The `draw` stage (3.85 s).** It covers the post chain's first-frame pipelines plus the rig warm (1.12 s, 28
   pairs). The post chain is needed at the first frame. The rig warm is the next thing to break down. It isn't
   measured here, because `draw` does not run on the lavapipe census.

The scene set (8 lit pipelines, ~9.6 s on the iPhone 14) is what the first frame draws. Shrinking it beyond
candidates 2 and 3 means fewer pipeline states: fewer biases, fewer double-sided or mirrored draws. That's a
content and look decision, not a renderer change.

## 3. Overlap

Fleet D's #3633 (W21b, open, MERGE-HOLD DAD) changes the same warm region of `js/render/three/tlx.js`: a menu warm
in idle chunks plus `where` recording. Candidate 1 touches `runProgramWarmStages`, so whichever lands second merges
the other.
