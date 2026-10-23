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

## 2. Candidates, measured and ranked

Each lit pipeline removed is worth about 1.2 s on a cold iPhone 14. Two candidates from the first pass did not
survive measurement.

- **Deferring the late variants into the grid countdown is not possible as built.** These are the `fx` stage: 5 lit
  pipelines, 2.2 s on the iPhone 14.
  - three r185+ reads the renderer's target and MRT again *after* `compileAsync`'s awaits, while it builds nodes
    (the note above `_warmPending` in `startProgramWarm`).
  - That is why the warm holds `present()` and pauses game.js for its whole run.
  - A compile that overlaps countdown frames would build its programs against whatever context the frame left set.
    That is the wrong-MRT class of defect `mintLateLit` documents.
  - So the late compile can only move to another window that also owns render state. The menu warm in #3633 is one
    such window; Fleet D owns it.
- **One depth bias for floor and terrain saves nothing.** The census reads the bias values:
  - the floor `[4,16]` and the start line `[-2,-4]` fork the plain lit program, and their biases point in opposite
    directions;
  - the terrain `[2,10]` is the CHUNKED program, so it is a separate pipeline whatever its bias.
  - Unifying any of them removes zero pipelines.

What remains, by size:

1. **Shrink the lit fragment program itself, as a mobile-tier variant.** All 14 lit pipelines compile the same
   ~116 KB of WGSL.
   - Compile cost grows faster than size: an 8 KB fx program compiles in ~10 ms on lavapipe, a 116 KB lit program in
     ~1,000 ms.
   - A lite-GPU lit program that constant-folds features the mobile tier doesn't show would cut every lit pipeline at
     once. Candidates: sparkle/flake, clear-coat, ground mist, lamp-bake bounce.
   - Potential: several seconds of the 16.9 s.
   - It changes what phones render, so it's a look decision, and it needs a per-feature size and compile-time
     measurement first.
2. **Drop winding twins no race draws.** `warmLateLit` compiles every late variant for both winding signs.
   - The brake ring is drawn mirrored, so it needs both.
   - The cockpit ERS bar and OT lamp (`_rigFxA`, the `none/cw` twin) are probably never drawn mirrored. That's at
     most 1 pipeline (~1.2 s on the iPhone 14), and needs a runtime check before cutting.
3. **The `draw` stage, 3.85 s on device:** the post chain's first-frame pipelines plus the rig warm (1.12 s, 28
   pairs). The post chain is needed at the first frame. The rig warm is the next thing to break down; this
   lavapipe census doesn't run `draw`.

## 3. Overlap

Fleet D's #3633 (W21b, open, MERGE-HOLD DAD) changes the same warm region of `js/render/three/tlx.js`: a menu warm
in idle chunks plus `where` recording. Its menu warm is the one window that could pre-compile the late variants without blocking entry.
