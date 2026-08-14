# Performance findings — what was measured, what was taken, what is left

A four-way static audit of the renderer, the game loop, the track build and the
DOM/audio layer, plus the measurements that followed. It is written down because
the audit's value is not the list — it is **which kinds of finding survived
measurement and which did not**, and that pattern is reusable.

Every "measured" number below is either a whole-build wall time in the Node VM
harness or a before/after with the change stashed and restored. The GPU-side
claims are still **unverified**, and §3 records the attempt that established
they cannot be verified here — see the env-probe entry.

---

## 0. Which instrument answers which question

Read this before measuring anything. Picking the wrong instrument here does not
give you a worse number — it gives you a **confident number about the wrong
thing**, which is how this project has lost the most time.

| Question | Instrument | Valid on this box? |
|---|---|---|
| Where does physics/AI/CPU time go? | `tools/profile-gameloop.mjs <track> physics` | **Yes** — synchronous `__apex.step()`, no compositor. The honest one. |
| Where does render-path JS time go? | `tools/profile-gameloop.mjs <track> render` | **No** — see below. |
| How long does a track build take? | Node VM harness (`tools/verify-track.cjs`, `track-build-vm.cjs`) | **Yes** — pure CPU, no GPU. Same harness that produced the 14.0 → 4.5 s win. |
| How big is the boot script wall? | Static: sum `stat -c%s` over index.html's `src=`s | **Yes** — no browser needed, fully deterministic. |
| What is boot LCP / DCL made of? | chrome-devtools MCP `performance_start_trace` → `analyze_insight` | **Yes**, with caveats below. |
| Is a frame GPU-bound? | `__apex.gpuTimer()` | **No** — returns `-1` under SwiftShader. Needs Chrome/Android on real hardware. |
| Did a shader/fill change help? | frame timing | **No.** See §3. |
| Does an element overlap another? | Playwright capture, **never** an MCP screenshot | see CHROME-DEVTOOLS-MCP.md trap 6 |

### The three instruments that lie here, and how

1. **`profile-gameloop.mjs … render` reads ~99.9% `(idle)`.** Measured: 30351
   samples, nothing in JS above 0.0%. Under SwiftShader the main thread is
   blocked on software rasterisation, so render-path JS *cannot* show up. This
   is not evidence that render JS is cheap — on a real GPU, where the
   bottleneck is submission rather than fill, the same code may dominate. An
   idle render profile means "ask a different instrument", not "nothing to fix".

2. **Frame timing is misleading in the OPTIMISTIC direction** (the §3
   measurement: 2872 ms median frame on vegas at 640×360). Any change that
   removes geometry posts a large win here that a real GPU would not repeat.

3. **Local-server insights invent problems.** On `python3 -m http.server`,
   Chrome's `Cache` insight reports ~650 ms FCP/LCP savings and 6.2 MB wasted
   because the server sends no cache headers. GitHub Pages plus `sw.js`
   precache do not have that problem. `DocumentLatency` likewise reports failed
   compression. **Both are artifacts of the harness.** Ignore them, or measure
   against a server that sets the real headers.

### Recorded negative result: forced reflow at boot

Chrome's `ForcedReflow` insight fires on a cold boot, and it is **not worth
acting on**: total reflow time **9 ms**, and Chrome's own estimated savings is
**none**. Top attributed frames were `tick` (`js/game.js`), `cssSize`
(`js/render/glx.js`), `updateTrackPreview` (`js/game/menus.js`), `measure`
(`js/game/scrollfade.js`) and `observe` (`js/game/sheetshape.js`); the single
largest bucket (42 ms) is `[unattributed]`. It is a one-time boot cost, not a
per-frame one. Do not re-chase it.

### Measured baseline (2026-08-13, this box)

Kept so the next audit starts from numbers instead of re-deriving them. Taken on
the 4-core container under concurrent load, so treat the **ratios** as the
signal and the absolute ms as an upper bound.

**Physics CPU** — `tools/profile-gameloop.mjs vegas physics`, 2748 samples:

| self | function | file |
|---|---|---|
| 22.2% | `update` | game.js |
| 12.4% | `updateCar` | game.js |
| 5.1% | `pairContact` | game.js |
| 4.4% | `resolveCollisions` | game.js |
| 2.8% | `(garbage collector)` | — |
| 1.1% | `step` | debrisworld.js |
| 0.9% | `evalSeg` | spline.js |

Summing every `wasm-function[…]` entry with `debrisworld.js:step` puts **~16 %
of physics CPU in the Rapier debris side-world** — the largest cost centre after
`update`/`updateCar`, and a subsystem with a recorded history of being the
expensive one (see the `perf.js` crash-sentinel header on shipping `vendor/`).
`pairContact` + `resolveCollisions` is a further ~9.5 %.

*Traced, not a defect:* `buildWorld` also appears at 0.6 %, but
`js/game/debrisworld.js:714` is `if (!world) buildWorld(track, cars);` — the
one-time lazy build landing inside the sample window. Recorded so it is not
re-derived.

**Boot script wall** — every `src=` in index.html, `?v=N` stripped, `stat -c%s`
summed. **146 script tags, 5,466,108 bytes (5.47 MB) of eager JS:**

| dir | bytes | files | share |
|---|---|---|---|
| js/circuits | 1,682,896 | 40 | 31% |
| js/game | 1,377,475 | 46 | 25% |
| js/track | 675,897 | 19 | 12% |
| js (log/mat4/game) | 478,286 | 3 | 9% |
| js/car | 384,223 | 7 | 7% |
| js/net | 304,833 | 11 | 6% |
| js/render/shaders | 191,420 | 5 | 3% |
| js/data | 158,278 | 8 | 3% |
| js/render + glx | 212,800 | 7 | 4% |

These are **uncompressed on-disk** bytes. Pages serves gzip, so *transfer* is
far smaller — but the measured LCP cost is 99.7 % *element render delay*, i.e.
parse and execute of the serial IIFE wall, and that tracks uncompressed bytes.
Do not discount these as "gzip handles it". Note `js/circuits` is 31 % of the
wall for data where a session uses exactly **one of 40** files.

**Boot trace** (chrome-devtools MCP): DCL 4712 ms, 146 scripts, **LCP 2306 ms =
TTFB 7 ms + render delay 2299 ms**, CLS 0.03.

### COUNT THE WORK AVOIDED, DO NOT TIME IT

The most useful thing learned in the 2026-08-14 pass, and it reverses the
conclusion the rest of this section can easily be misread as supporting.

"The GPU is unmeasurable on this box" rules out **timing**. It does not rule out
**measurement**. Almost every renderer finding has a countable mechanism, and a
count is the same number on SwiftShader as on a real GPU — so it transfers,
which is exactly what a millisecond does not.

Worked both ways in one sitting:

- **A claim that vanished.** The audit billed GLX.draw()'s uncached
  `CULL_FACE`/`colorMask`/`POLYGON_OFFSET_FILL` toggles at "~150-250 redundant
  GL calls per frame". Counted directly — patch `WebGL2RenderingContext.prototype`
  before any page script, 12 frames per arm, interleaved on/off — those four
  calls total **63.5 per frame** and a redundancy cache collapses **zero** of
  them: 318 disable / 300 enable / 66 colorMask / 78 polygonOffset, byte-identical
  with the switch on and off. The toggles strictly ALTERNATE (cars are
  doubleSided, their neighbours are not), so there is no run of identical state
  to collapse. The switch was deleted.
- **A claim that held, and grew.** `skyLate`'s saving IS the fraction of the
  frame opaque geometry covers, because those are the SKY_FS invocations early-Z
  rejects. `render({what:"view"})` already reports `coveragePct`, so the number
  was free: **64.3 / 70.8 / 89.0 / 64.3 / 64.3 / 98.5 %** across six views of a
  vegas lap, mean **75.2%** — larger than the 40-70% estimated.

Two rules fall out of that:

1. **Verify the instrument, not just the result.** The `glStateCache` arms
   report `PerfTry.on()` as false then true, so identical counts are a measured
   zero and not a flag that never engaged. Without that check the same numbers
   would have been indistinguishable from a broken harness.
2. **An equivalence claim gets tested as one.** The `pairContact` pre-reject was
   argued from algebra, then run over 3,000,042 pairs — 3M random plus boundary
   cases on 0, LCAR, L/2, L-LCAR — comparing decision AND returned value to
   1e-12. Zero mismatches. Cheap, and it converts "I proved it on paper" into a
   fact.

### More instruments that lie here (2026-08-14)

§0's table lists three. These are the rest, all found the expensive way.

- **`test:baseline` fails on EVERY tree**, including commits predating any local
  change — verified by running it at the session head, at the deploy SHA, and at
  the pre-session SHA: 6/6 failed at all three. The goldens were generated in a
  different container and do not reproduce here. `.github/workflows/ci.yml` says
  so independently in its own words ("golden images are environment-sensitive …
  if GitHub's runner renders even slightly differently … the gate goes
  permanently red"), which is why it is deliberately not in CI. **Do not
  re-bless the goldens to make it green** — that destroys them for the
  environment where they do work.
- **`test:visual` SILENTLY SKIPS all 40 tests** and reports
  `= run passed (40/40 done, 0 failed)`. `tests/specs/tracks-visual.spec.js`
  self-skips when no golden PNGs are committed, and per CLAUDE.md goldens exist
  for the MENUS only. A green line that verifies nothing is more dangerous than
  a red one: the giveaway is that start and finish carry the same timestamp.
- **`test:api` is not in CI at all**, so it rots. Found 11 specs failing on a
  bug that predated the session by weeks: `js/data/telemetry.js` aliases
  `M4.clamp` at EVAL time, and the two standalone js/data harnesses did not load
  `js/mat4.js`, so telemetry.js threw, `DataTelemetry` was stranded in its
  temporal dead zone, and hub.js's top-level `DataTelemetry.create()` threw in
  turn — surfacing three links away as `ReferenceError: DataHub is not defined`.
  Diagnosed by evaluating the eight modules in a **Node VM with DOM stubs**
  (seconds) rather than bisecting a 27-minute browser group.
- **A `cancelled` CI run carries no information about the code.** With several
  sessions pushing one deploy branch, each push supersedes the previous PENDING
  run in the `ci-${{ github.ref }}` group; five jobs then show
  `created_at == started_at == completed_at` with no steps executed at all.
  Four consecutive `pages.yml` runs died that way, so the geometry sweeps did
  not execute on that lineage for hours — which is how a prop-placement change
  reached the live site with nothing red to show for it. **Check the run's
  conclusion after a deploy push; do not treat the push as the deploy.**

### Before believing ANY red run

The three failures chased in this session were, in order: SwiftShader
contention, an environment-sensitive golden, and a pre-existing rot in an
ungated suite. **None was the change under test.** The habit that caught all
three is one question — *does this failure predate my change?* — answered by
running the same thing at an older commit, or by `md5`-ing the files the failing
test actually loads. It costs minutes; believing a red run costs hours and can
end in "fixing" working code.

`tools/test-solo.mjs` exists for the first case and REFUSES to run on a hot box.
Trust it. Two specs that blew a 120 s budget under load 8-9 came back at 68.9 s
and 73.2 s solo.

### The standing conclusion

The GPU half of this game is **unmeasurable on this box**, and no amount of
tooling changes that. So the work that can be justified here is the work whose
cost is CPU-side and deterministic: the boot script wall, track build time,
physics/AI, and allocation/GC. GPU-side findings must be argued from
**mechanism** — work multiplied by zero, a missing guard, a pass that runs
twice — never from a number produced here. §1 is the record of what happens
when that rule is relaxed.

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

### 2026-08-14 round: the shape that keeps paying

Every item below is the *same defect* wearing a different hat: **a producer
whose consumer is gated off, or a value computed and then multiplied by zero.**
When you go looking for work to remove, this is the shape to grep for. It has
now produced eleven separate wins across the shader, the render path and the
build, and not one of them changed a pixel.

- **`sampleShadow` per FRAGMENT, not just per frame.** The entry above took the
  `uShadowStr <= 0.0` case — the frames where the whole pass is dark. It left
  the fragments that face AWAY from the sun on a *bright* frame, where the
  result is multiplied by `NoL == 0`: every back-facing wall, every underside,
  the shadow side of every car. `shadow` has exactly three readers and each is
  zero-or-guarded, so `NoL > 0.0 || clearcoat > 0.001` is exactly sufficient.
  Up to 16 dependent texture fetches, 2 `vnoise`, a `normalize`, a `sqrt` and a
  `sin`/`cos` pair. **The general lesson: a uniform-level gate does not imply
  the per-fragment gate has been taken. Check for both.**
- **The static sun shadow PRODUCER** matched to its consumer. `lit.js` opens
  `sampleShadow` with `if (uShadowStr <= 0.0) return 1.0;`, so on an overcast /
  wet / foggy night nothing reads the map — yet the frame still paid a 2048²
  clear, terrain and road cast unchunked, and a 512² PCSS blocker pass, 300+
  times a lap. The consumer side had been taken; the producer had not.
- **`po.contact` had no tier-4 shed** while `po.ssao` did, and `glx/post.js`
  arms the pass on `aoStr > 0 || contactStr > 0` — so tier 4 kept running SSAO
  and both blurs after `po.ssao` had gone to zero. This is *verbatim* the
  `lampVol` / `haveGR` bug recorded one line above it in `game.js`. **When you
  fix an `||`-armed producer, grep the other operands of that same `||`.**
- **SSAO's 8 taps** ran and were multiplied by `uStrength` — supported at 0,
  because contact shadows ride in the same pass.
- **Lamp-shadow car casters** were unculled while the sun pass's were culled,
  and the sun pass's own comment says the field pays the cost twice at night.
  Note the bound is the lamp RADIUS on a shadow-rays-travel-outward argument,
  NOT the frustum: a 149° cone's far corners reach ~5x its far plane, so a
  frustum-radius cull would have been wrong.
- **`uInstanced` uploaded per draw** in both `litMaterial` (150-300/frame) and
  `castShadow` (up to 46/frame) to clear a flag only the instanced paths set.
  The depth pass's `castShadowInstanced` already had the right shape — bracket
  your own draw — so this was a fix that existed in the tree and had not been
  copied across.
- **Squared-distance lamp range rejects** before the root, in the lit lamp loop
  (up to 32 `sqrt`/fragment) and the god-ray beam march, which is NESTED at
  16 steps x 6 lamps (up to 96 `sqrt`/pixel). Exact, not approximate: the tests
  disagree only within an ulp of the radius, where the window is already 0.
- **`barrierClear`'s cell sweep** widened by the index's largest half-width
  while `barGridInsert` already bucketed by *inflated* bounds — the same
  allowance counted on both sides of the lookup, 4-9 cells swept where 1-4
  suffice, on `clearTreeDist`'s up-to-9 walk-outs per tree. `js/track/tracks.js`
  carries the proof. **This is an equivalence claim, so it was tested as one:**
  `prop-clipping` + `coplanar-faces` + `scenery-grounding` over the 40-circuit
  build, *including* their anti-vacuity guards, which assert the baseline caps
  are tight — i.e. the placement counts are exactly unchanged, not merely
  under a cap.
- **`findStableLoop` memoised** on a `WeakMap` keyed by the buffer: it walked
  ~2.41 M samples on every race start, un-pause and tab return to recompute a
  pure function of a buffer that cannot have changed.
- **`rumble()` missing `pollGamepad`'s `padConnected` guard**: `getGamepads()`
  allocates a fresh `GamepadList` per call, and `game.js` fires `rumble` every
  0.10-0.16 s while kerb-riding, so the keyboard/touch majority was making
  ~8-10 discarded allocations a second.

Two corrections worth keeping, because both agent reports got them wrong in
the same direction — **an isolated bound is not the bound that matters**:

1. The car shadow-caster cull radius is `hypot(cBox, 170)`, not `cBox`. The
   ortho is ±cBox *perpendicular* to the sun but spans ~170 m *along* it, so a
   car far away yet nearly sun-aligned has a small perpendicular offset and its
   stretched low-sun shadow legitimately lands in frame. Culling at `cBox`
   deletes exactly those.
2. `LT.moonShadow` reads must survive the registry default. The gate expression
   was copied verbatim from the two that already shipped rather than rewritten,
   so all three now agree by construction.

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

**NO LONGER AN ESTIMATE (2026-08-14).** "Potentially hundreds of chunk draws"
was a guess; the reach is now COUNTED, by the method this document argues for —
replicate `createChunkedMesh`'s 72 m centroid binning in the Node VM build
harness (`tools/track-build-vm.cjs`) and count what survives, at 12 stations a
lap. Over a full 6-face cube the probe sees every direction, so its coverage is
exactly a SPHERE of the far radius and the count is orientation-independent —
which is what makes this measurable without a GPU at all:

| probe far | vegas chunks / indices | spa | monza |
|---|---|---|---|
| **900 m (shipped)** | **238.3 / 1,256,344** | **373.6 / 344,888** | **195.1 / 516,647** |
| 400 m | 63.2 / 492,715 | 98.4 / 141,175 | 64.4 / 204,214 |
| 300 m | 45.3 / 376,791 | 64.6 / 110,233 | 43.8 / 141,843 |
| 200 m | 29.8 / 267,784 | 33.5 / 67,938 | 26.8 / 85,366 |

A 300 m probe cull removes **68-72% of the indices and 78-83% of the chunks**,
and the three circuits agree closely despite very different scenery (spa is
1594 small tree chunks over 207 k tris; vegas is 914 large building chunks over
885 k tris). That consistency is the useful part — it is a property of the
radius, not of a circuit.

The sub-pixel argument for why 300 m is defensible: a face is 90 deg across 64
pixels = 1.41 deg per pixel. A 20 m building subtends atan(20/300) = 3.8 deg
(~2.7 px) at 300 m, and atan(20/900) = 1.27 deg (**0.9 px**) at 900 m — under
one pixel, in a target that is then mipmapped and blurred for a car-paint
reflection. Everything between 300 m and 900 m is paying full vertex cost to
move less than a pixel.

**This is NOT bit-identical**, unlike everything else taken today, so it does
not get taken the same way: it belongs behind a `PerfTry` default-OFF switch
(`js/game/perf-try.js`) where it can be A/B'd on real hardware, which is the
mechanism that already exists for exactly this class of change.

Everything below was the original note on why this box could not settle it, and
stays because the negative results are still true of frame TIMING here:

- Counting `drawChunked` CALLS separates the passes (1 env / 2 main per frame)
  but not the chunks inside them, which is where the cost is. Useless.
- Frame timing under SwiftShader is worse than useless — it is **misleading in
  the optimistic direction**. Measured baseline on vegas parked, 640x360:
  **2872 ms median frame** (p25 2751, p75 3216). At 0.35 fps the frame is
  dominated by SOFTWARE RASTERISATION of ~1.8 M verts, so any change that
  removes geometry posts a large win that a real GPU — where the bottleneck is
  submission, not fill — would not repeat. A number from that harness would
  have looked like strong evidence and been worth nothing.

A patch was written and reverted unmeasured: save/restore `frame.cullDist`
alongside `viewProj` and `eye`, with a 220 m probe cull. It is defensible on its
face — the save/restore triple is plainly incomplete — but it is not purely a
correctness fix, because narrowing the cull CHANGES what the reflection
contains. Shipping a visible behaviour change whose benefit cannot be measured
here is the trade this document exists to warn against, so it was reverted
rather than shipped on plausibility. It needs a real GPU and a frame capture.

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
