# Performance findings — what was measured, what was taken, what is left

A four-way static audit of the renderer, the game loop, the track build and the
DOM/audio layer, plus the measurements that followed. It is written down because
the audit's value is not the list — it is **which kinds of finding survived
measurement and which did not**, and that pattern is reusable.

Nothing here was profiled in a browser. Every "measured" number below is either
a whole-build wall time in the Node VM harness or a before/after with the change
stashed and restored; the GPU-side claims are all still **unverified**.

---

## 1. The pattern, which matters more than the list

| Finding | Claimed | Measured | Outcome |
|---|---|---|---|
| `firstNonFinite` reading bare `Infinity` under `vm.createContext` | 14 → 5.7 s | **14.0 → 4.5 s** | taken |
| `addBox` rebuilding its face table per call | 8–15 % | **1–4 %** | taken |
| `nodeGrid` CELL split for the one wide query | 40–60 % off `buildTerrain` | **0–7 %** | **reverted** |

Findings whose mechanism was **provable by reading** held up: work multiplied by
zero, an async write killed by `process.exit`, a global read going through a
contextified-global interceptor. Findings **estimated from operation counts**
came in at a fraction of their billing or vanished. Two of my own predictions
were in the second category as well — see `nodeGrid`'s note in
`js/track/mesh.js` and the terrain-normal scope note in the same file.

Apply that discount to everything in §3.

## 2. Taken (see the commits for the reasoning at each site)

- **God-ray sun march** ran every night frame with `uStr == 0`. The lamp half
  was gated; the sun half was not. `accum` has exactly one consumer, so the
  guard is provably equivalent. `js/render/shaders/post.js`.
- **`sampleShadow`** ran its full PCF — up to 16 dependent texture fetches per
  opaque fragment — when `uShadowStr == 0`, whose only non-trivial exit is
  `max(0.0, mix(1.0, sh, uShadowStr * edgeFade))`. `js/render/shaders/lit.js`.
- **ACTIVE AERO flaps** had no distance gate while the brake rings twelve lines
  above did. Gated at 150 m for rivals. `js/game.js`.
- **`UiLayers.anyOpen()`** ran a 24-selector `querySelectorAll` every frame with
  a gamepad connected. Resolved by id instead. `top()` deliberately keeps its
  query — it breaks z-index ties by document order.
- **Audio**: one shared white-noise buffer for the one-shots instead of a fresh
  main-thread `Math.random()` fill per hit; five provably-constant
  `setTargetAtTime` calls per frame removed. `js/game/audio.js`.
- **Four `backdrop-filter` chips** over the garage's live turntable canvas — the
  rule `hud.css` and `overlays.css` already state, applied to the one screen
  that missed it.
- **Pooled `_ringOpts`** on the player brake-ring path (the AI path already had
  it).

## 3. Left on the table

Ranked by how much I would trust the estimate, most first.

**Env probe inherits the main camera's `cullDist`** (`js/render/glx.js`,
`envFaceBegin`). It swaps `viewProj` and `eye` but not `cullDist`, which
`js/game.js` sets to 0 (no radial cull) below PerfGov tier 3 — so a 64×64
reflection target re-draws the city through a 900 m frustum, potentially
hundreds of chunk draw calls for 4096 pixels of blurred reflection. This is the
only finding where the win is draw-call submission rather than a shaved
constant, and game.js already calls this pass "the biggest per-frame load
multiplier" — the mitigation that shipped halved its *rate*, not its *reach*.
**Profile before touching**: the size depends entirely on chunk counts.

**Two full-field O(n²) AI scans** at `js/game.js` — traffic awareness and
lateral separation, ~370 lines apart. The second loop's window (`|Δp| ≤ 6.5`)
is strictly inside the first's (`−13…+34`), and both carry a comment defending
"the O(n) pass is the price of seeing lapped traffic", written independently.
Deliberately NOT merged: ~55k simple float ops/s is ~0.05 % of a core, and the
second loop nests a brace deeper, so merging risks changing racing behaviour for
no measurable return.
The two loops DO skip self differently — loop 1 by identity, loop 2 by
`ranked[(c.rank||1)-1]` — and this file first claimed that as a latent bug on
the theory that a stale `rank` makes a car repel itself sideways. **Traced, and
it is not reachable.** `rank` is assigned from `ranked` every physics step
immediately before the `updateCar` loop; nothing reorders or mutates `ranked`
inside it; and `updateCar` early-returns for `retired` (the only cars excluded
from `ranked`) and for `finished`. So every car that reaches the separation loop
satisfies `ranked[ci2] === c`. Left as written. Recorded because the claim was
made without tracing it, which is the same error this document is otherwise
about.

**`massBlocked` is O(buildings²)** (`js/track/tracks.js`) — `masses` is a flat
array with no spatial index, unlike `barSegs` which got one. It is the one place
cost is quadratic in prop count specifically. Measured trivial today: ~420k
inner iterations on vegas (~4–25 ms of a 4059 ms build), 419 on monza. Below the
bar that reverted `nodeGrid`. Worth doing when the skyline gets denser.

**Emitter ring recomputation** (`js/track/geom.js`) — `addCyl` calls `lo(a0)` /
`lo(a1)` three times each per segment where two suffice; same in `addCone` and
`addFrustum`. The `addBox` half of this finding measured 1–4 %, so expect less.
Keep the angle as `(i+1)/seg*6.2832`, **not** `(i+1)%seg` — 6.2832 ≠ 2π, so
wrapping changes the last segment's coordinates.

**Typed accumulators for the props buffers** (`js/track/tracks.js`) — `pos`,
`nrm`, `col`, `mat`, `idx` are plain arrays grown by `push`, ~27 M push
arguments on vegas. Reported at 15–31 %. Three hard edges if attempted: a
variadic `push()` shim measured SLOWER than native (the win needs fixed arity);
`idx` must be `Uint32Array`; and `TrackModels.validateGeometry` gates on
`Array.isArray(geo.pos)`, so the props mesh ships EMPTY if that is missed.

**Non-passive capture-phase `wheel` listener on `window`**
(`js/game/menunav.js`) — flagged by the audit as "the single highest-leverage
item adjacent to scope", on the standard reasoning that a non-passive wheel
listener at window/capture stops the browser starting a scroll on the
compositor thread. **Audited, and it does not apply here.** Two independent
reasons:

- `css/tokens.css` sets `html, body { overflow: hidden }`, so the DOCUMENT
  never scrolls. The only scrollable things are `.pane` regions inside menus.
  Mid-race there is no scroll for the listener to delay, because there is no
  scroll.
- Inside a menu the handler is load-bearing, not overhead: it calls
  `e.preventDefault()` (menunav.js) to redirect a wheel that landed on no
  scroll region — a sheet head, a stats block, a circuit map — onto the nearest
  pane. It cannot be made passive without deleting the feature.

The only residue is that `onWheel` calls `activeLayer()` → `UiLayers.top()`,
which is the 24-selector `querySelectorAll` plus a `getComputedStyle` per
match. That is the same query `anyOpen()` was moved off, but wheel events are
user-driven and occasional rather than per-frame, so it is not worth the same
treatment. Left alone.

**Frame-invariant uniforms** — ~95 tuner uniforms re-uploaded per frame across
`begin()`, `drawSky()` and the composite. The file already has the pattern to
fix it (`_frameToken`). Honest arithmetic: ~0.05 ms on a 16.7 ms budget, so
hygiene rather than a win.

## 4. Recorded negative results

Do not re-investigate these; they were checked and are fine.

`js/game/particles.js` (struct-of-arrays pool, zero steady-state allocation),
`js/game/skidmarks.js`, `js/game/perf.js`, `js/game/bodyattitude.js`,
`js/game/hud.js` (fully write-cached via WeakMaps, no layout reads anywhere —
the best-behaved file audited), the `LIT_FS` point-light loop, `GLXChunked`
frustum culling, the bloom skip, `cssSize()` caching, and the spatial grid
itself — measured candidate counts are 0.5–19 per query, so nothing degenerates
to a full scan.

`GLX.drawInstanced` / `cullInstances` allocate a `Float32Array` view **per
instance**, which would be serious if they ran. They do not: the only callers
are in `tests/`. Fix before wiring `TrackGraph.batches()` up.
