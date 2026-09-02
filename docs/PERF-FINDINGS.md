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
`js/game/debrisworld.js` has `if (!world) buildWorld(track, cars);` — the
one-time lazy build landing inside the sample window. Recorded so it is not
re-derived.

> **SUPERSEDED — this call was a defect, and this entry is how it was missed.**
> 0.6 % is `buildWorld`'s **self** time. Its **inclusive** time is 467 of 2575
> samples (~216 ms), and it landed entirely inside the LIGHTS-OUT frame. See the
> second-round entry in §2. **A self-time reading answers "where is steady-state
> CPU going" and says nothing about a one-shot stall; for a hitch, read
> inclusive time and ask which frame it lands on.**

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

> **Two corrections to the block above, both from 2026-08-14 — read them before
> acting on these numbers.** (1) The counts are stale: it is **148 tags /
> 5,638,215 B** (measured on this commit), `js/circuits` **1,729,016 B / 30.7 %**. (2) More importantly the
> attribution is wrong. "Render delay tracks uncompressed bytes" does not hold:
> V8 compile of all 148 files measures **97.3 ms** and executing all 40 circuit
> IIFEs **2.5 ms**, so parse+execute of the circuit wall is ~1 % of the 2299 ms,
> not the bulk. "Render delay" is the browser's bucket for everything between
> TTFB and the paint. Two eager costs that are NOT bytes: `js/track/tracks.js`
> built Catmull-Rom control points for **all 40** circuits at boot (**24.0 ms**)
> — **TAKEN**, see below — and `js/game/apex.js` + `agentview*` is **346 KB of
> dev/test surface** no player reaches. Also note DCL 4712 ms predates the flyby
> deferral (`de5d202`) and has not been re-measured. See §3.

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
- **`test:visual` was retired** (suite parked under `tests/manual/tracks-visual.spec.js`).
  Historically it SILENTLY SKIPPED all 40 tests and reported
  `= run passed (40/40 done, 0 failed)`. The parked spec
  `tests/manual/tracks-visual.spec.js`
  self-skips when no golden PNGs are committed, and per AGENTS.md goldens exist
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

### Wrap the FUNCTION, don't read the PIXELS (2026-08-14)

A player reported "the road section in front of me gets darker, and the lighting
depends on where I'm looking/turning" (at night). Two instruments were tried:

1. **Pixel readback.** Force `preserveDrawingBuffer` in an init script, pin the
   eye with `__apex.view({eye, yaw, pitch})`, sweep yaw, and read a window that
   TRACKS one world patch (`ndcX = tan(t0 - d)/tanHalfX`, ndcY unchanged — a pure
   yaw leaves points on the optical axis' horizontal plane on it). Two traps
   cost a run each: **`M4.perspectiveTo` takes a VERTICAL fov**, so `tanHalfX`
   needs `* aspect` — get it wrong and the window slides onto different content
   and the run is noise; and **a dense night circuit under SwiftShader can miss
   every frame in a 2 s sleep**, which reports as "no lamps" rather than as slow.
   Wait on a signal (`waitForFunction` on a generation counter), never a timer.
2. **Wrapping the producer.** `game.js` calls `LightTune.setFrameLights(...)` as
   a LIVE property read, so replacing that property from the page captures the
   exact lamp set the shader will get — identity, position and final intensity —
   with no rendering, no noise, and no SwiftShader in the loop. It found the bug
   in one run and graded the fix in one more.

**Prefer (2).** The engine's per-frame data structures are reachable by name;
pixels are a lossy re-derivation of them. (1) is only needed when the question is
about the SHADER, not about what the shader was handed.

The bug itself: the night lamp cull ranks lamps by a camera-forward-BIASED
distance, then faded their brightness against that same biased set's edge — so a
stationary lamp changed brightness when the player only turned. Measured with the
eye pinned and the aim swept ±60°: lamps swinging 5.01×, 2.99×, 2.86×, 2.77×,
2.55×. Fixed in `js/game/lighting.js` (fade on the lamp's own geometric distance
against a direction-free radius; the biased edge survives only as a narrow
continuity guard) — the same five lamps then measured 2.07×, 1.07×, 1.01×, 1.00×,
1.00×. **A "control" run is only a control if it varied the thing you think it
varied**: the first baseline here snapshotted before the free camera took effect,
so the camera never yawed and every lamp read a flat 1.00× — a clean bill of
health from an experiment that did nothing.

### FIXED: the sun shadow fade is camera-ORIENTATION dependent (2026-08-15)

The daytime sibling of the night lamp bug. `js/game.js` still anchors the **box**
at `camEye + 20 m` along the camera's horizontal look (texel allocation — invisible
on yaw). The fade used to read that same point, so a pinned-eye yaw swept the fade
front around a 40 m circle. Measured (bahrain, day, eye pinned, aim ±40°,
`shadowRange` 80):

| distance ahead | edgeFade range | note |
|---|---|---|
| 40 m | 1.000 – 1.000 | unaffected |
| 60 m | 1.000 – 1.000 | unaffected |
| **70 m** | **0.625 – 0.986** | 58% of shadow strength, from camera yaw alone |
| 80 m | 0.004 – 0.308 | faint either way |

**Repair.** Fade from eye XZ + look-target Y (`vec3(uEye.x, uShadowCtr.y, uEye.z)`
in `js/render/shaders/lit.js`; same in `tsl-lit.js` / `wgsl-chunks.js`). Height
stays on the look target so aerial cameras do not erase ground shadows. At the
default 80 m box / 20 m bias, `0.84·range` from the eye equals the 90° box edge
(`sqrt(70²−20²)≈67`), so the 0.62/0.84 ratios stay. Box snap and car-map lookAt
are unchanged. Source-contracted in `tests/unit/perf-governor.test.mjs`.

### The VM build harness is a valid TIMER and an invalid PROFILER (2026-08-14)

§0's table lists the Node VM harness (`tools/verify-track.cjs`,
`tools/track-build-vm.cjs`) as a valid instrument for track-build cost. That is
true of **whole-build A/B timing** and false of **attribution**, and the
difference has already cost two candidate findings.

Both build inside `vm.createContext`, so every bare global read goes through the
contextified global's interceptor — the ~150-250 ns effect `js/track/models.js`
documents for `firstNonFinite`. The same vegas build profiled in the VM and in a
plain realm (identical `TRACK_VM` manifest, loaded by indirect eval):

| self % | VM harness | plain realm |
|---|---|---|
| `addBox` (geom.js) | 26.7 % | **41.2 %** |
| `emit` (geom.js) | 11.3 % | 10.1 % |
| GC | 9.1 % | 10.4 % |
| `isVec3` (graph.js) | 2.70 % | **0.88 %** |
| `finiteVec` (tracks.js) | 1.31 % | **0.50 %** |
| whole build, quiet box | ~2810 ms | **~1890 ms** |

The harness **inflates exactly the functions that read bare globals**, which is
the same population you are hunting when you look for hot leaf functions. Two
candidates that looked like ~4 % of the build in the VM measured ~1.4 %
combined in a plain realm and were dropped before being written up.

**So: A/B a change in the VM, but rank what to work on from a plain realm.**
The whole-build number is ~1.5x pessimistic too, so a VM build time is an upper
bound, not the figure to quote.

A worked negative result from the same pass, kept so it is not re-derived:
`geom.js`'s `emit()` allocates four arrays per call and is called 86,565 times
on vegas. A scalar rewrite was verified **bit-identical by MD5 over every mesh
buffer on four circuits** — and then measured **0-4 % on emit-heavy circuits and
NEGATIVE on vegas**, which is `addBox`-dominated. The equivalence was proven and
the win was not there. §1's pattern again: mechanism-by-reading held, the
operation count did not.

### A worked example of the rule below (2026-08-14)

`tests/specs/lighting-tuner-grade.spec.js` came back **4 failed / 31** in the
`webgl` group right after a perf change landed. It would have been very easy to
read that as the change's fault. It was not, and the two steps that established
that are the whole point of the next section:

1. **`tools/test-solo.mjs`** re-ran it alone on a gated-quiet box (load 1.55) and
   returned *"FAIL on a quiet box is REAL. It is not the machine. Bisect it."*
   So it was not contention — three of the four were genuine.
2. **The same spec was then run at the PREVIOUS DEPLOY SHA**, which had already
   shipped. Identical three tests, identical errors, identical durations. The
   failures predated the change entirely.

Two distinct defects were hiding in there, and both are worth knowing:

- **`window.LightTune` is undefined, and always was.** `js/game/lighting.js`
  declares `const LightTune = (function () {`, and a top-level `const` in a
  CLASSIC script creates a **script-scoped binding, not a property of `window`**
  — unlike `var` or the explicit `window.X =` form that `ariastate.js`,
  `css-zoom.js` and `sheetshape.js` use. The spec's `page.evaluate` reached for
  `window.LightTune.TUNE_DEFS` and threw. It was the ONLY `window.LightTune` in
  the tree; every other reader uses the bare identifier, as `js/game/apex.js`
  does itself. **When a page global is missing under `page.evaluate`, check how
  it is DECLARED before assuming a load-order break** — `const` and `window.X =`
  are both "one global per file" and only one of them is on `window`.
- **Three tests are genuinely over the 120 s budget** (158.4 / 120.4 / 160.7 s
  solo), not flaky. Each boots the game, races, walks four menu levels and fans a
  lighting profile across all 40 circuits under SwiftShader. Now `test.slow()`.
  Note CI already concedes this globally — its Smoke job runs with
  `--timeout=420000`. **It was four tests, not three**, and the fourth is the
  instructive one: it had been dying at 66.5 s on the `window.LightTune` error,
  and 66.5 s was mistaken for its cost. Fixing the error let it run to
  completion for the first time — 173.7 s. **A failing test's duration is only a
  LOWER BOUND on the work it does**, so never size a budget from a red run.

**Two more defects that only CI could show, and both are worth the general
lesson.** The first fix passed 5/5 locally and still came back 3/5 on a CI
runner, with failures the local box never produced:

- **`test.slow()` cannot cover the fixture phase.** CI failed with
  `Test timeout of 120000ms exceeded while setting up "context"` at exactly
  120.0 s — the BASE budget, un-multiplied. `test.slow()` is called inside the
  test BODY, and context setup runs before the body, so the multiplier is not in
  effect yet. Replaced with `test.describe.configure({ timeout: 360_000 })`,
  which is set at collection time, covers setup, and survives CI passing an
  explicit `--timeout=120000` on the command line (which the change-aware job
  does). Precedent: `zandvoort-foundation.spec.js`.
- **A 5 s `expect` default masquerading as a functional bug.**
  `playwright.config.js` declares no `expect` block, so assertions get 5 s. The
  COPY ALL chip only flips to `COPIED n ✓` once the fan-out has written a
  profile for all 39 other circuits — real work, not a render. On a loaded
  runner that passes 5 s, so the assertion fired while the label still read the
  ARMED text, and the failure printed
  `Received string: "COPY TO 39?"` — the exact state the line above had just
  asserted. That reads like a broken feature and is a budget. **When an assertion
  reports the previous step's expected value, suspect the expect timeout before
  the app.** Then grep the rest of the file: the UNDO check below it read
  localStorage exactly once with no retry, the same race one step later, and is
  now `expect.poll`.

Verified after all four fixes: **5/5 pass** solo on a quiet box at
177.8 / 175.4 / 155.0 / 140.7 / 52.3 s.

**Why it rotted:** `tools/pick-tests.mjs` maps `js/game/lighting.js` to the
`webgl` group correctly, so a local `pick-tests` run would have named it.
(SUPERSEDED since: ci.yml's `selected` job is now the change-aware gate and is
BLOCKING on branch pushes and pull requests, so this class of red no longer
sits invisibly — but only for specs the selector picks; unselected suites still
need a human to run them, and the `test:api` entry above keeps that caveat.)

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

### 2026-08-14, second round: the same shape, plus one real hitch

Six taken. Five are the section heading above wearing new hats; the sixth is a
different animal and is the one worth reading.

**The hitch: the Rapier side-world was built on the LIGHTS-OUT frame.**
`js/game/debrisworld.js` `step()` builds lazily on first call, and `update()`
returns at `if (state !== "race") return;` (`js/game.js`) for the whole
countdown — so "first call" was always the first RACE step. Line-attributed
from a `profile-gameloop.mjs vegas physics` profile (`positionTicks`):
`buildWorld` is **467 of 2575 samples INCLUSIVE, ~216 ms**, of which
`createCollider` is 410 — `ColliderDesc.trimesh` copying the road mesh and
building its BVH in wasm. That is **~13 dropped frames at the exact instant the
player is reacting to the lights.** Fixed by `DebrisWorld.prime()`, called from
`startRace()` where the track build is already being paid for. Sim-identical:
construction order is the determinism contract and depends only on `track` and
`cars.length`, both fixed before the countdown, and `step()`'s own prologue
re-checks and rebuilds if either moved — so priming changes WHEN the same world
is built, never WHICH.

**VERIFIED AFTER THE FIX, with the instrument that found it.** Re-ran
`tools/profile-gameloop.mjs vegas physics` on a quiet box and searched the raw
profile by function name: `buildWorld`, `createCollider` and `trimesh` are
**completely ABSENT** from the sampled window, against 467 inclusive samples
before. Total samples for the identical 600-step workload fell **2575 -> 2093**,
i.e. 482 fewer — which matches buildWorld's 467-sample inclusive cost to within
noise. `prime` is absent too, and that is the point: it now runs inside
`startRace()`, before the step loop the profiler samples.

**With its anti-vacuity check, because "the work disappeared" is exactly what a
silently-broken world also looks like.** The side-world is still running in the
same profile — `step` (debrisworld.js) at 2.9 % plus `wasm-function[37]` 7.2 %,
`[184]` 2.2 %, `[64]` 2.0 % and `isSleeping` (rapier.mjs) 0.9 %. So the world
exists and is being stepped; only its CONSTRUCTION left the frame window. Had
`prime()` failed, `step()`'s lazy build would have reappeared in the profile
instead.

**This entry corrects an earlier one in this file.** §0's baseline says of
`buildWorld`: *"Traced, not a defect … 0.6%"*. That was its **SELF** time. The
inclusive cost is 30x larger, and inclusive is the number that matters for a
one-shot call that lands inside a single frame. The general lesson, and it is
the mirror of the one this document already teaches: **a self-time reading
answers "where is steady-state CPU going", and says nothing about a one-shot
stall. For a hitch, read inclusive time and ask which frame it lands on.**

The five multiplied-by-zero ones, all bit-identical, all argued from mechanism
and counted rather than timed:

- **`sky.js` sun corona + disc** ran on every NIGHT frame. `coronaDamp` is
  `(1.0 - overcast * 0.92) * (1.0 - nightSky)` and `overcast <= 1` keeps the
  first factor `>= 0.08`, so `coronaDamp == 0` **exactly when** `nightSky == 1`
  — and all three `c +=` add nothing. SKY_FS drew BEFORE the opaque world at
  the time (`skyLate` has since shipped default-ON), so there was no early-Z
  relief: 2 `pow`, 2 `sqrt` and ~85 ALU on **100 % of the pixels** of every
  night frame. Every local in the block is dead after it, so the skip is
  unobservable. (Late-sky footnote: the reorder only holds if the sky pipeline
  actually depth-tests — WGX's declared `depthCompare:"always"` and the late
  sky erased the whole WebGPU world; fixed to `"less-equal"`, pinned by
  tests/unit/webgpu-lifecycle.test.mjs.)
- **`sky.js` day gradient band** — an **`atan2`**, one of the costliest GPU
  transcendentals, feeding a `vnoise`, per pixel, whole frame, multiplied by
  `daytime`. `daytime` is exactly 0 on every night frame AND every dawn/dusk
  frame with the sun under ~14.5°. `daytime` itself stays live; two later
  readers still need it.
- **`post.js` SSAO tap setup outside its own gate.** The 8 taps were moved
  inside `if (uStrength > 0.0)` in the previous round; `scr`, `a`, `ca`, `sa`
  — which exist only to feed them, one consumer each — were left outside. So
  the *supported* AO-slider-at-zero + contact-shadows-on frame still paid
  `sin`/`cos`/`sin` + `fract` + `dot` per half-res pixel. **When you gate a
  loop, gate the loop's setup with it.**
- **`uSunShaft` uploaded without the bloom gate** (`js/render/glx/post.js`).
  The shaft pass READS THE BLOOM CHAIN — its loop's only input is
  `texture(uBloom, suv)` — and with bloom off the 1x1 `blackTex` is bound to
  `uBloom` 50 lines above. The shader gates only on `uSunShaft > 0.0`, so the
  producer has to say zero. 8 dependent **full-res** fetches + `ignoise` per
  pixel, on a daytime tier-4 frame: the frame that has already shed god-rays,
  SSAO and SSR. Another operand of an armed producer — the third time that
  exact grep has paid.
- **`lit.js` lamp-shadow PCF had the uniform gate but not the per-fragment
  one.** `lampSh` has two readers: one multiplied by `NoLl`, one already inside
  `if (NoLl > 0.0)`. So a fragment facing AWAY from the mapped floodlight paid
  4 dependent `sampler2DShadow` fetches, a `mat4` transform, a perspective
  divide and 5 bounds compares for a result multiplied by zero. This was the
  **last ungated per-fragment texture fetch in LIT_FS** — every other
  `texture()` in the file already sits behind a per-fragment reject. It is
  verbatim the sun map's own fix, never copied across; the GGX block 30 lines
  below already makes the argument in prose.

Plus one exact reorder, in the same composite gate: `vUV.y < uSsrTopUV` — a
varying compared against a uniform, free — sat BEHIND a full-res
`texture(uDepth, vUV)`. GLSL ES 3.00 §5.9 gives `&&` short-circuit semantics,
so **operand order is cost order**; `uSsrTopUV` is 0.62 chase / 0.82 onboard,
so 38 % / 18 % of full-res pixels each dropped a discarded fetch. The same gate
also gained `&& uCarReflect > 0.001` beside `carPx > 0.3`: exactly equivalent,
because `ssrGate` is `max(roadMask * uReflect, carMask * uCarReflect)` and both
masks are products of `smoothstep()`s, hence in [0,1].

Two more taken away from the renderer, both "a writer nobody re-checked":

- **`js/game/audio.js` had a SIXTH constant `setTargetAtTime`**, missed by the
  pass that removed five from the same function. `lfoG.gain` has exactly two
  writers — `.value = 0` at node creation and this line — so while the car is
  on-track (the overwhelming majority of frames) it scheduled target 0 onto a
  value already converged to 0, 60x a second for a whole race: a main-thread
  call plus a cross-thread timeline insertion each time. Guarded on the TARGET
  (not on `usingSamples` — `offroad` genuinely flips). The cache lives **on the
  node**, deliberately: `stopEngine()` nulls `lfo`/`lfoG` and `startEngine()`
  builds a fresh `GainNode` at `.value = 0`, so a module-level variable would go
  stale across a restart and silence the wobble; a new node has no cached
  property, so the first call after any restart always re-issues.
  **The general lesson: when you sweep a function for a repeated defect, the
  sweep needs a grep, not a read — the sixth instance was 50 lines below the
  fifth.**
- **`js/game/sheetshape.js` watched one attribute that four things write.** Its
  `MutationObserver` keys on `documentElement`'s `style` attribute to catch
  `--ui-scale`, but `--hud-scale` and the HUD's own `--hud-z-top`/`--hud-z-bot`
  zoom caps land on that same inline attribute (`js/game/hud.js`'s `fitHud`),
  and an observer cannot tell one custom property from another. So every HUD
  zoom-cap tweak ran a full `reclassify()` — a `getBoundingClientRect` on all 21
  `.sheet` elements, each followed by `CssZoom.localBox` and two
  `getComputedStyle` calls — for menus that are all hidden, **mid-race**.
  Bounded at ~2 Hz by `updateHud`'s throttle plus `_fitWait`, but `capTop`
  tracks the gap-readout width and changes continuously on a constrained
  viewport or a high HUD SIZE — i.e. exactly when the frame budget is tightest.
  Fixed by comparing the inline `--ui-scale` before doing anything, which is
  free: the `attributeFilter` means only an inline write can fire the observer,
  so an unchanged inline value implies an unchanged computed one, and no layout
  is read to decide.

**A process note, recorded because it cost a browser round-trip.** All three
shader files store GLSL in **backtick template literals**. Comments added
inside them must not contain backticks — a backtick terminates the literal and
the rest of the shader is parsed as JavaScript, surfacing as
`Uncaught SyntaxError: Unexpected token 'if'` and a `GLX shader compile failed:
ERROR: 0:1: 'undefined' : syntax error` with no hint of the real cause.
`node --check js/render/shaders/*.js` finds it in under a second and should be
the first thing run after any shader edit.

### 2026-08-14, third round: two defects that made the governor's ladder DEAD CODE

The biggest finding of the whole exercise, and the one most worth the method
note: it was found by reading a control loop as arithmetic, and settled in
thirty seconds by a float trace.

**`js/game/perf.js` — with `_autoRes` on (the shipped default) the governor
could scale down and then did nothing, forever. No tier was ever shed by
evidence.** The structure was:

```js
if (_autoRes && cur > 0.5) { if (_gfx.setRenderScale(cur - 0.1)) {…} }
else if (…) { /* shed a feature */ }
```

Step 1.0 down by 0.1 in IEEE doubles and you get
`1 → 0.9 → 0.8 → 0.7000000000000001 → 0.6000000000000001 → 0.5000000000000001`.
That last value is **one ULP ABOVE 0.5**, so `cur > 0.5` is true forever. The
request then clamps to 0.5 and `setRenderScale` (`js/render/glx.js`) rejects it against its own
`Math.abs(s - renderScale) < 0.02` dead zone — and because the outer `if` was
ENTERED, the `else if` that sheds a feature was **never evaluated**. Only the
GRAPHICS preset's `_userTier` still bit, because that is a separate term in
`tier()`'s `max()`.

**The same epsilon closed the door from the other side.** Climbing back at
+0.06 reaches `0.9800000000000004`; the next request, `Math.min(1, cur + 0.06)`
= 1, is a delta of `0.019999999999999574` — just inside the dead zone. The scale
pinned at 0.98 for the session, and since the tier-restore branch sat under
`if (_autoRes && cur < 1)`, **a shed feature could never come back either.** That
is the one-way door the `RESTORE_UNDER = 4.2` post-mortem in this file's own
header was written to close, reintroduced by a float epsilon.

**Fixes.** Ask the renderer instead of predicting it — `setRenderScale`'s boolean
already IS the "lever exhausted" signal — and fall through to the ladder when it
returns false. On the restore side, snap to 1 **a step early**: the last 0.02 of
range is unreachable by any step starting inside it, so `(1 - cur) < 0.09 ? 1 :
cur + 0.06` takes it in one 0.08 move that clears the zone.

**A/B, same device, same frames, rungs that genuinely save 3 ms:**
**before, final tier 0; after, final tier 4.**

**Why the suite did not catch it, which is the transferable part.**
`tests/unit/perf-governor.test.mjs` faked `setRenderScale` as `if (s === scale)
return false` — **not the shipped contract**, which rejects any change under
0.02. Both defect values (0.5000000000000001 and 0.9800000000000004) live inside
the real dead zone and outside `s === scale`. A second fake pinned the floor at
exactly `0.5`, a value the real down-chain never produces, so the test written to
cover "scale floor hit" tested a state that cannot occur. Both fakes now mirror
`setRenderScale`'s dead-zone clamp in `js/render/glx.js` verbatim, and the
recovery test fails on the old code.
**A fake that is easier than the contract will hide exactly the bugs the
contract's hard edges cause.**

**Related, and fixed in the same pass: `envReady` is a one-way latch.**
`js/game.js` stops calling `envFaceBegin` at `tier() >= 1`, but `js/render/glx.js`
sets `envReady = true` on a completed cube and only ever clears it in
`envProbeReset()` — whose sole caller was the track switch. So `uEnvStr` stayed
at `carEnvCube` (0.3 on desktop) and every car-paint fragment kept paying a
4x-anisotropic dependent `textureLod` on a **frozen** cube. Worse than the wasted
fetch: `js/game/perf.js` documents tier 1 as *"env probe off (car paint falls
back to the analytic sky mirror)"* and **that fallback never happened** — the
paint mirrored wherever the car was when the last 6-face cycle completed. One
line at the gate now resets it, and the dev-API `envProbe` status field reports
honestly as a side effect.

### A latent bug found while costing the ribbon cull — DO NOT flip these knobs

`docs/PERF-FINDINGS.md` §3 (and an audit pass) described
`track.meshes.roadChunked` as "a fix that exists in the tree and is unreachable".
That is wrong and the correction matters, because the suggested action was to
reach it. `createChunkedMesh` (`js/render/glx/chunked.js`) **never carried
`data.trk`** — the fifth attribute `createMesh` builds (`js/render/glx.js`)
for road-marking coordinates. Without it the shader reads the generic default,
`float hw = vTrk.z` is 0, and `lit.js`'s `if (hw <= 0.5) return;` guard fires — its
own comment even says *"(or no trk attribute)"*. **Every edge line, centre dash
and marking would silently disappear.** (SUPERSEDED: this fix SHIPPED —
`chunked.js` now reads and interleaves `data.trk`, and GLX/WGX publish
`chunkedTrackCoords: true`; only TLX remains `false`, which the 08-19 banners'
"still open: TLX road trk" reflects.)

### Stale entry corrected: the env-probe cull already shipped

§3's "Env probe inherits the main camera's `cullDist`" entry is out of date. It
is now the baked product path: `ENV_CULL_M = 300` in `js/render/glx.js`
`envFaceBegin`, applied as a `min` and never an override, with the same cap
on WGX and TLX. The pause-menu `PerfTry.envCull` toggle is gone — these were
renderer A/B flags, not lighting knobs, so they were not moved into the
lighting tuner. What remains true is the
sharpener:
`frame.cullDist` is read in exactly one place, inside the chunked path, so the
switch **cannot remove a single road or terrain triangle** from the probe — it
reaches props and glass only. That makes it a synergy argument for chunking the
ribbons, not an independent item.

The probe face also drew sky **before** the world (`js/game.js` env-probe
block). The main camera is already opaque → sky → glow. **Taken 2026-08-18:**
the probe now draws world then sky, same early-Z order. No glow on the probe.

Do **not** copy the probe's 300 m cull onto the chase cam. A 20 m building is
still ~18 px at 900 m / ~1280 px; that is a look change. `cullDist = farPlane`
is also not look-identical: frustum far-plane *corners* sit farther from the
eye than `farPlane` (`far / cos(halfFov)`).

> **TAKEN 2026-08-18 (look-identical half).** Clear-day `cullDist` is now
> the far-corner distance (`farPlane * hypot(1, tan(fovY/2)*hypot(1,aspect))`),
> a sphere that contains the frustum. Fog / tier-3 still win when tighter.
> Not 300 m.

## 2b. Closed by measurement: the per-chunk adjacent-run merge (2026-08-29)

Recorded because **two independent audits have now proposed it**, and a third
would too. In per-chunk lamp mode both backends give up the adjacent-run draw
merge that is worth 76-87 % fewer scenery draws in the normal path, on the
strength of one sentence in `js/render/webgpu/wgx.js`: *"adjacent chunks almost
never share an index list"*. That sentence was load-bearing and unmeasured.

It is now measured, `tools/chunk-share-census.mjs` (vegas night, LOW, knob 0.3):

| mesh | chunks | empty | adjacent-equal pairs | of which BOTH empty | genuinely shared | longest run |
|---|---|---|---|---|---|---|
| props | 909 | 723 (79.5 %) | 714 | 711 | **3** | 577 |
| glass | 195 | 55 (28.2 %) | 43 | 43 | **0** | 18 |

So the claim is TRUE for chunks that actually bind lamps. The seductive part is
the other column: 79.5 % of chunks share a list by being EMPTY, one run is 577
long, and empty chunks merge with no baked identity signal at all. That looks
like a large free win and is not one — **those chunks are the outfield the
frustum never draws.**

The visible side, counted at the GL calls (`artifacts/perchunk-cost.mjs`,
same circuit and preset):

| | uniform4fv / frame | drawElements / frame |
|---|---|---|
| knob 0 | 4 | 55.1 |
| knob 0.3 | 148 | 94 |

`148 / 4 = 37` visible chunks bind a NON-empty list, against `94 - 55.1 ≈ 39`
extra chunk draws — so **visible empty chunks are about two a frame** and
merging them saves two draws. Both merge variants are dead. Do not re-open
either without re-running the census first; the whole-track empty fraction is
the trap.

What remains real on this path is the structural option: port WGX's addressing
model (lamp table + index table in a UBO or float texture, `(offset,count)` per
chunk) to WebGL2, which removes the per-chunk upload rather than avoiding it.
That is a shader change mirrored across three backends and wants its own round.

## 2c. GLX per-frame call baseline, and the instance cell-set cache (2026-08-29)

First full GL-call census of a RUNNING race (`tools/glx-call-census.mjs`,
vegas night, full field, driving — not parked):

| call | per frame |
|---|---|
| drawElements | 144.2 |
| uniform1f | 167.4 |
| uniform4fv | 147.3 |
| uniform1i | 142.5 |
| uniformMatrix4fv | 103 |
| bindVertexArray | 80.1 |
| **bufferSubData** | **27.9 calls / 426.7 KiB** |

426.7 KiB a frame is ~25.6 MB/s of CPU->GPU traffic for props that mostly did
not move. Cause: `cullInstances` memoises on frustum-plane equality, and three
callers use three different frusta inside one frame, so while driving it never
hits (see §2b's neighbour — this is the same "the condition no longer holds"
shape).

`apex26.instCellCache=1` keys the resident pack on the surviving CELL SET
instead. Sound because the pack is a deterministic function of that set:
`batch.cells` order and each cell's `idx` order are fixed at build time and
never mutated. Measured A/B, same box, same instrument, flag the only change:

| | off | on |
|---|---|---|
| bufferSubData calls | 27.9 | **17.8** (-36%) |
| bufferSubData KiB | 426.7 | **326.8** (-23.4%) |
| bindBuffer | 33.4 | 23.4 (-30%) |
| draws / uniforms | — | identical |

The residual 326.8 KiB is real work: the shadow ortho, the probe faces and the
camera genuinely select different cells, so only same-caller-across-frames
hits. The failure mode is props drawn from the wrong resident pack, which is
why the hit path deliberately does NOT stamp `_cullPlanes` (that snapshot must
keep describing whichever frustum physically wrote the buffer).
`gfx-backend-canary.test.mjs` now pins that.

**Now ON by default (2026-08-29), on real-GPU evidence.** It shipped default
OFF pending a hardware run, and the workflow that was supposed to gate it could
not: both `gpu-census.yml` game-check steps passed `--backend three`, and their
only `--ls` was hardcoded to `apex26.tlxForceHw`, so **GLX — the default
backend, and the one this change lives in — was never exercised on real
hardware at all**. The tool was always capable (`tools/gpu-game-check.mjs`
takes `--backend webgl2` and repeatable `--ls apex26.k=v`); only the workflow
was hardcoded. So the gate was built first: a GLX leg plus a generic `ls`
dispatch input threaded to all three legs, and the Verdict loop widened to
`["webgpu", "webgl2", "glx"]`. Run **9** (id 33262100579) on `macos-latest`
(Apple/Metal), commit `da82104`, GLX leg with `apex26.instCellCache=1`:
conclusion **success**, `gpuErrors` 0 — and that Verdict step exits non-zero on
missing JSON, `ok !== true`, `phase !== "done"`, or any GPU error, so a green
run is a real assertion and not an absent one. The localStorage key stays as
the OFF switch (`=0`), the escape-hatch shape `__apex.matTex(0)` already gives
the baked-material path.

Second measurement, the `pack` scenario (field bunched around the player, where
the instance work is highest) rather than `jump(0.30)`'s empty-track start —
see the note in §2b about the first wheel measurement being meaningless for
exactly this reason:

| vegas night, `pack` | off | on |
|---|---|---|
| bufferSubData calls | 36.4 | **14.5** (-60%) |
| bufferSubData KiB | 948 | **489.2** (-48.4%) |
| bindBuffer | 41.6 | 19.8 (-52%) |
| drawElements | 163 | 162.8 (jitter) |
| uniforms | 277.7 / 197.2 | 277.7 / 196.6 (jitter) |

The win is roughly twice the size it looked on the empty-track start, and that
is the expected direction: bunched traffic keeps more cells resident across
frames, so more of the repacking is redundant. This is now the default path for
every WebGL2 player.

**CORRECTION (2026-08-29).** The sentence that stood here — "`uniform1f` 167.4
is the ~30 frame-scalars in `begin()` times the 5-6 passes a frame" — was an
arithmetic guess written up as if measured, and it is wrong. `begin()` runs
**~1.25x/frame**, not 5-6: the shadow passes bind `depthProg` and their own FBO
and never call it (`js/render/glx/shadow.js:151,224,254`), and the env probe is
one face every 4th frame (`js/game.js:6729`). The real distribution, traced to
source:

- `uniform1f` 167.4 is dominated by **`litMaterial`** (`glx.js:1385-1393`) — up
  to 9 scalars per lit draw against 144.2 `drawElements`. `begin()` contributes
  ~19 of it. Reducing this means SORTING DRAWS BY MATERIAL, not more caching.
- `uniform4fv` 147.3 and a quarter of `uniform1i` 142.5 are **`uploadLightSet`**
  per visible chunk (`chunked.js:233`) — 147.3/4 = ~37 calls. That is the
  structural item in 2b, not a caching problem.

So the whole `begin()` class is worth ~3 calls/frame, not 165. Left here as a
correction rather than an edit because the wrong number was acted on.

## 2d. One interleaved lamp array: uniform4fv 277.7 -> 69.4 (2026-08-29)

`uniform4fv` was the largest single call class on the default backend — 277.7 a
frame, vegas night, full field in a pack. The cause was arithmetic, not
algorithmic: `uploadLightSet` issued **exactly four** calls per chunk, one per
scratch array (`uLightA/B/C/D`), and ~69 chunks upload a frame.

**The obvious fix was the wrong instrument.** The plan of record was to port
WGX's storage-buffer lamp table + `(offset,count)` addressing to WebGL2. That
was dropped on a measurement: there is **zero** UBO precedent in this tree —
`uniformBlockBinding`, `bindBufferBase`, `UNIFORM_BUFFER`,
`getUniformBlockIndex`, `std140` and data-texture `texelFetch` all return no
hits across `js/`. The port would have invented a GL concept the codebase has
never used, inside the shader every surface renders through, for the last 25 %.

Interleaving the four arrays into one `vec4[MAX_LIGHTS * 4]` (stride 4 vec4s
per light) makes it **one** call per chunk:

| | before | after |
|---|---|---|
| **uniform4fv** | **277.7** | **69.4** (-75.0 %) |
| every other counter | — | byte-identical |

Free in uniform pressure: `4 x vec4[48]` and `vec4[192]` are the same 192
default-block rows (the WebGL2 fragment floor is 224), which the shader's own
header comment already noted. GLX-only — TLX (`three/tsl-lit.js`) and WGX
(`webgpu/wgx.js`) carry their own light paths and never read these names. The
godray pass's `uLightPos/Col/Rad/Dir/Cone` at `GR_MAX_LIGHTS = 6` is a separate
system and is untouched.

### Verifying it needed a real oracle, and the first two were not

Call counts cannot see this change's failure mode. A mis-indexed lane keeps
every counter byte-identical and simply moves or recolours the lamp pools. Two
attempts at an oracle were wrong before one worked, and both failure modes are
worth knowing:

1. **`drawImage` of the WebGL canvas into a 2D canvas read solid black** (mean
   RGB 0,0,0). That is the drawing buffer being invalid outside the frame, not
   a broken shader. Reading it as evidence either way would have been wrong.
   Use Playwright's element screenshot (the compositor path) instead.
2. **Byte-comparing the PNGs is invalid here.** Two runs of the *identical*
   build produce different bytes — the scene is time-dependent. Checked before
   trusting it; otherwise the cross-build difference would have been reported
   as a regression that does not exist. **Always shoot the same build twice
   first and let that pair be the noise floor.**

The working oracle is image statistics against that floor (`sharp`, mean RGB +
16-bucket luminance histogram, `scratch/png-stats.mjs`):

| pair | max abs Δmean RGB | histogram L1 |
|---|---|---|
| same build, two runs (**noise floor**) | 0.0026 | 0.00015 |
| **before vs after** | **0.0011** | **0.00011** |

The cross-build delta is *smaller than the same-build noise*, with mean RGB
agreeing to two decimals (19.61, 7.12, 11.10) and `gpuErrors` 0. Pixel-neutral.

`gfx-backend-canary.test.mjs` now pins the lane order across both halves —
proven by swapping lane +7 for +11 and watching it fail, then restoring. A
guard for an invisible failure mode is worth nothing until it has been made to
bite.

## 2e. The material-grouping ceiling is 8.7 — the win was the instancing gate (2026-08-29)

Planned as "sort draws by material": `litMaterial` already caches every scalar
and uploads only on change, so `uniform1f` ~197/frame looked like alternation
between consecutive draws, and grouping looked like the lever.

**Measured the ceiling first, and the premise was wrong.** Per frame, vegas
night, full field in a pack (`scratch/material-headroom.mjs` — replays each
frame's draws grouped by material signature and counts the uploads that would
remain):

| | per frame |
|---|---|
| draws | 176.4 |
| distinct material signatures | 16.1 |
| lane changes, actual order | 126.4 |
| lane changes, PERFECTLY grouped | 117.6 |
| **ceiling saving** | **8.7** (4.8 %) |

176 draws already collapse into ~16 material runs — the draws are close to
grouped as they stand. There is no alternation to fix, and the planned reorder
was abandoned on this number, per the abort condition written before measuring.
(The neighbouring precedent at `glx.js` §setCull — the doubleSided toggles that
"MEASURED and found to save NOTHING" — was the right prior.)

**But naming the uniforms found the real one.** Resolving each location back to
its name (wrap `getUniformLocation` in an init script — locations are opaque and
may be fresh objects per call, so the map must be built as GLX fetches them):

| uniform | uploads/frame |
|---|---|
| **uInstanced** (lit + depth programs) | **54.8** |
| uRoughness | 15.1 |
| uSpecular | 15.1 |
| uEmissive | 12.6 |

`uInstanced` alone was 30 % of the class — and it is a value that changes **3.1
times a frame**: 26.4 instanced draws arrive in ~2 contiguous runs. It cost 54.8
uploads because `drawInstanced` bracketed each draw with 1-then-0.

That bracket was itself a fix (it replaced clearing the flag on every lit draw),
but 1,0,1,0 alternates, so a redundancy cache collapses **none** of it — exactly
the shape retired near `setCull`. The fix is to stop bracketing and let
`litMaterial` — the funnel every lit draw already passes through — declare its
kind through the cached setter. A run of instanced draws then costs one call,
and the next ordinary draw one more.

| | before | after |
|---|---|---|
| **uniform1f** | **197.2** | **153.1** (-22.4 %) |
| every other counter | — | identical |

## 2f. The Windows GPU-census outage was a path bug, and a widened timeout hid it (2026-08-29)

Round 12's real-GPU dispatch failed on **windows-latest**: all three legs —
three/WebGPU, three/WebGL2, GLX/WebGL2 — `phase=failed ok=false`, every other
field `undefined`, ~5 minutes each. ubuntu and macOS passed all three.

The job log had the shape:

```
[game-check] browser-launched +0.2s
[game-check] navigated        +0.9s
[game-check] failed         +300.9s
"error": "page.waitForFunction: Timeout 300000ms exceeded."
```

`out.crashed` is set by a `page.on("crash")` handler and is ABSENT from that
JSON, so the renderer never crashed; `pageClosed`/`browserGone` are teardown
artifacts. The run reached `navigated` and never `booted`.

**Cause** — `tools/gpu-game-check.mjs`:

```js
const ROOT = resolve(new URL("..", import.meta.url).pathname);
```

On Windows that pathname is `/D:/a/f1-game/f1-game/`, and `path.win32.resolve`
sees a leading `/` with no device, so it prefixes the cwd's drive. Demonstrated:

| | value |
|---|---|
| old idiom, win32 | `\D:\a\f1-game\f1-game` — cannot exist |
| new idiom, win32 | `D:\a\f1-game\f1-game` |

The tool's own static server was therefore rooted at nothing, answered every
request `404 nope`, and `window.__apex` could never be defined. It explains all
of it: three legs identical, and the census step — which launches the same
Chromium but serves an inline HTML string and touches no repo path — passing on
the same machine.

### The tolerance was widened to accommodate the bug

The comment above that wait read:

> 120 s is not enough on a software rasteriser that is ALSO a slow disk:
> windows-latest (WARP …) timed out here on both backends while ubuntu booted
> the same tree in 3 s. … so give it room.

A previous session hit this exact failure at 120 s, blamed the machine, and
raised the timeout to 300 s. The premise is false — a 404 never boots at ANY
timeout — so the raise converted a 2-minute failure into a 5-minute one and
taught nothing. AGENTS.md forbids widening a tolerance to make something pass;
this is that, and the revert to 120 s is part of the fix.

### Three places threw the answer away

The reason it survived two sessions is that a wrong server root is
**indistinguishable from a slow boot** — both are silence until a timeout. The
same shape as §2e's vacuous `gpuErrors`: absence reading as normal.

1. **The gate never printed the reason.** `gpu-game-check` records `out.error`
   on every caught failure — the Windows artifacts literally contained
   `"error": "page.waitForFunction: Timeout 300000ms exceeded."` — and the
   Verdict row printed `phase / ok / gpuErrors / envFail / … / meanLuma` and not
   `error`. That is why the failure read as contentless. It now prints `error`
   and `root`; against a fixture the row reads
   `root: \D:\a\f1-game`, which would have named the bug on day one.
2. **The server never validated its own root.** It now asserts
   `ROOT/index.html` exists and throws naming ROOT — verified to fire in
   milliseconds — and registers the `s.on("error")` handler it lacked, so a bind
   failure cannot produce a zero-artifact crash.
3. **A failed run discarded the console buffer.** `out.console` was assigned on
   the success path, so the catch dropped it. Moved to `finally`, alongside
   `out.root`; the evidence is wanted most when the run failed.

### The idiom is retired repo-wide

23 sites used `new URL(…, import.meta.url).pathname` — 20 other tools and 3
tests. Only `gpu-game-check` runs on Windows, so the rest were latent, but the
form also mishandles percent-encoding: a checkout path containing a space breaks
it on Linux too. All converted to `fileURLToPath`, and
`tools-runnable.test.mjs` now bans the idiom, naming the offending file and the
replacement. Proven by reintroducing it in `tools/agent.mjs` and watching the
guard name it.

### Part 2 — a failed diagnostic read was reporting `ok: true`

The path fix worked. Windows went from `phase=failed` on all three legs (~16 min
of timeouts) to:

```
webgpu  phase=done ok=true  gpuErrors=undefined
webgl2  phase=done ok=true  gpuErrors=0 envFail=0 envReady=false softAdapter=false headless=true
glx     phase=done ok=true  gpuErrors=0
```

The game boots, races and parks on Windows for the first time. The job stayed
red for a different reason, and it is the same disease again: `bounded()`
(`gpu-game-check.mjs:130`) turns ANY failure into a value —

```js
.catch((err) => ({ error: String((err && err.message) || err).slice(0, 120) }))
```

— so a `gfx` read that threw or timed out still left `phase: "done", ok: true`
while every field derived from `gfx` came out `undefined`. That is
indistinguishable from a backend with nothing to report. Two shapes produce it:
`{error: …}` (the read failed) and `{glx: false}` (the page had no GLX). The
tool now records `gfxReadFailed` / `overlayReadFailed` naming which, and the
Verdict prints it.

**Answered by run 13** (`af79780`, windows-latest, conclusion success):

```
webgpu  phase=done ok=true gpuErrors=undefined
        gfx:   read failed: gfx timeout
        ovl:   read failed: overlay timeout
webgl2  phase=done ok=true gpuErrors=0 envFail=0 envReady=false softAdapter=false headless=true
glx     phase=done ok=true gpuErrors=0
```

It was `{error: …}` — BOTH bounded reads hit their 20 s caps, so the page had
stopped answering `evaluate` after `settled`. Not `{glx: false}`: GLX was there,
the page simply would not talk. The webgpu leg is also the FASTEST of the three
(~2 min vs 4.4 and 4.7) because it times out rather than doing work.

**That is a new finding, not this fix's.** `three/WebGPU on windows-latest
(WARP) leaves the page unresponsive to evaluates after park.` It is the same
shape as the macOS "went silent after park() on BOTH three paths" that motivated
the bounded waits in the first place — and those bounds are doing exactly their
job here, turning a 20-minute hang into a 2-minute report. It predates
everything in §2f and was simply unreadable until now. Its own round.

**Scoping, stated deliberately** because this document otherwise forbids
loosening a failing check. Two clauses are now `hardware &&`: the missing-count
check from §2e, and the new read-failure check. They exist to protect the
REAL-GPU answer; a software image may legitimately not bring a backend up, and
failing the job for that is noise. `softAdapter` and the env-probe checks were
already scoped exactly this way — this is that precedent applied consistently,
not a widened threshold, and the reason is PRINTED on every image either way.
Everything else stays unconditional: a run that did not finish, a missing
artifact, and `gpuErrors > 0` are defects anywhere.

`gfx-backend-canary` pins the split in both directions — proven by un-scoping a
hardware check and by over-scoping `ok`/`phase`, each of which fails it.
Verified against three fixtures with the Verdict body extracted from the YAML:
software prints the reasons and exits 0, hardware prints them and exits 1, a
healthy set is silent.

## 2g. uNumLights was 111 uploads a frame for 53.7 values (2026-08-29)

With `uniform4fv` down to 69.4 (§2d) and `uniform1f` to 153.1 (§2e),
**`uniform1i` at 146.4 became the largest uniform class on the default
backend.** Resolving the locations to names — the same `getUniformLocation`
wrap §2e introduced — puts three quarters of it in one uniform:

| uniform | uploads/frame |
|---|---|
| **uNumLights** | **111** |
| uLampShadowIdx | 10.7 |
| uTex | 6 |
| everything else | < 2.5 each |

`uploadLightSet` sets the count unconditionally and only then returns early on
zero, so the per-chunk path (~69 visible chunks) pays a `uniform1i` for every
chunk INCLUDING the many with no lamps — which is why 111 exceeds the 69.4
`uLight[0]` uploads beside it.

**Ceiling measured before writing any code**, per §2e's rule, because the two
neighbouring caches that were retired (`setCull`, the `uInstanced` bracket)
died on alternation rather than on volume:

| vegas night, pack | per frame |
|---|---|
| uNumLights uploads | 111 |
| distinct VALUES | 53.7 |
| **collapsible** | **57.3 (52 %)** |

Not alternation. The sequence is chunk lamp counts in spatial order, so it runs
— `45, 8, 7, 2, 5, 5, 7, 6, 8, 6, 6, 6, 7, 7, …` then a long tail of `0` where
the count is set and the array never touched.

A `_luNL` cache in `uploadLightSet`, measured A/B on the same instrument with
the cache as the only change:

| | before | after |
|---|---|---|
| **uniform1i** | **146.4** | **87.9** (-40 %) |
| drawElements | 163 | 163 |
| uniform1f / uniform4fv / uniformMatrix4fv | 153.1 / 69.4 / 118.2 | identical |
| bufferSubData KiB | 512.6 | 512.6 |

**Why it is sound, and what pins it.** A WebGL uniform is per-PROGRAM state, so
the cached value survives every unbind — this cache is deliberately NOT cleared
per frame the way the `_mat*` caches are, and clearing it in `begin()` would
give the whole saving back. It can only go stale two ways, and
`gfx-backend-canary.test.mjs` asserts against both: a SECOND writer of
`litU.uNumLights` (post.js's godray pass has its own uNumLights on its own
program and cannot collide), and a relink, which resets every uniform and is
where `_luNL` is cleared. Both halves of the guard were confirmed red against
sources with the respective piece removed.

*Instrument note.* A canvas mean-RGB was tried as a cheap correctness oracle
and is useless here: `drawImage` from a WebGL canvas with no
`preserveDrawingBuffer` reads an empty buffer, so it reported `[0,0,0]` and a
histogram entirely in bucket 0 — a confident number about nothing. Recorded so
the next person does not spend the boot on it.

### The GLX real-GPU gate cannot see GPU errors — corrected

While reading run 10's macOS verdict for this change, the GLX row said:

```
glx  phase=done ok=true gpuErrors=null
```

**`null`, not `0`.** `gpuErrors` is defined only on WGX (`webgpu/wgx.js`); plain
GLX has no error counter at all. `gpu-game-check.mjs` reads
`g.gpuErrors ? g.gpuErrors() : null`, and the Verdict tests
`(gfx.gpuErrors || 0) > 0` — so on the GLX leg that clause can never fire. It
passes vacuously, forever.

That matters because round 11 flipped the instance cell-set cache citing
"gpuErrors 0" from this leg, and AGENTS.md's renderer row tells agents to
require `gpuErrors` 0 from the dispatch. For GLX that has never been an
assertion. What the leg DOES prove is real and not nothing — `ok=true`,
`phase=done` means the game booted, raced and parked on Metal without wedging,
which is what caught the two defects that justified building the surface — but
the error check specifically is a hole.

The same trap bit the local probe: `(window.GLX && GLX.gpuErrors &&
GLX.gpuErrors()) || 0` yields 0 when the method is ABSENT, so its reported
"gpuErrors 0" was equally empty. An absence test that reports the same value as
a success test is not a test — the same shape as `sessionStorage["apex26.gfxBound"]`
being an ABSENCE signal, which AGENTS.md already warns needs a positive
confirmation beside it.

**Fixed.** GLX now drains `getError()` once per `present()` into
`GLX.gpuErrors()` / `gpuFirstError()` (WebGL has no `onuncapturederror`), and
the Verdict fails on a MISSING count instead of reading absent as clean.

Proven to be an assertion rather than another absence
(`scratch/glx-error-counter.mjs`) — a counter that never counts would be the
same bug wearing a different hat:

| | methodExists | count | firstError |
|---|---|---|---|
| clean run | **true** | **0** | null |
| after a deliberate `bindBuffer(0x0BAD, …)` | true | **1** | `INVALID_ENUM @ present` |

The `methodExists` column is the one that matters: the original trap was
`(GLX.gpuErrors && GLX.gpuErrors()) || 0`, which yields 0 for a method that is
not there. A clean GLX run now genuinely reports zero GPU errors — including
for the two changes in this round.

### Pixels were the wrong oracle here; the invariant is the right one

The PNG statistics were inconclusive: cross-build max |Δmean RGB| 0.0135 against
same-build noise floors of 0.0051 and 0.0026 — above both, with a consistent
sign. Undersampled noise, but not something to wave through.

The change has an exact correctness property instead, so assert that:
**at every instanced draw the gate must read 1, at every ordinary lit draw 0.**
If that holds, the GPU saw the same value at every draw as it did when the
value was bracketed — pixel-identical by construction, whatever the PNG says.
Measured over 20 frames: **528 instanced draws, 2914 plain, zero violations**
(`scratch/instanced-gate-invariant.mjs`), and the probe was proven non-vacuous
by sabotaging the clear and watching it report 181.

The invariant holds only while EVERY lit draw funnels through `litMaterial`, so
`gfx-backend-canary` pins that too: `useProg(litProg)` must appear exactly twice
(frame setup, and litMaterial). A third bind is a lit draw that skips the
declaration, and the guard says so by name.

One accepted cost: a zero-instance batch now claims the gate, because
`litMaterial` runs before the `n > 0` check. It can never reach a draw — the
next lit draw re-declares — so it is at most one extra call, never a wrong pixel.

## 2h. The three unattributed counters, and a side-world drawn one body at a time (2026-08-31)

2c left three counters with no attribution: `uniform1i` 142.5/frame (only ~35
explained), `uniformMatrix4fv` 103, `bindVertexArray` 80.1 against 144.2 draws.
This round named them, and found a fourth thing nobody had counted at all.

**The baseline reproduced first.** `glx-call-census vegas night 40 pack` on the
unchanged tree: 162.8 draws, 14.5 `bufferSubData` / 489.2 KiB, `uniform4fv`
69.4. Those match 2c/2d/2e exactly, so the instrument and the tree agree before
anything is attributed. Do not skip this step — an after-number is worthless
against a before-number you did not personally reproduce.

**Naming a uniform means wrapping `getUniformLocation` in an INIT script.**
Locations are opaque and may be fresh objects per call, so the only way to
name one is to catch it at lookup, before the page links its programs
(`scratch/r12-attribution.mjs` — Playwright `addInitScript`, not
`page.evaluate`). Then bucket every upload by name and count how many carried
a value the program did not already hold.

| uniform | uploads/frame | distinct values | redundant |
|---|---|---|---|
| `uNumLights` | 111 | 51.5 | **59.5** |
| `uModel` | 103.2 | 50.3 | **52.9** |
| `uTex` | 6 | 0.1 | 5.9 |
| everything else | ≤ 4 | — | ≤ 2 |

Both mechanisms are structural, not accidental. `uploadLightSet` runs once per
visible chunk and neighbouring chunks repeatedly resolve to the same lamp
COUNT; `drawChunked` calls `litMaterial` once per chunk RUN and every run of
one mesh shares that mesh's model matrix.

**TWO LINEAGES FOUND `uNumLights` INDEPENDENTLY, and 2g is the one that shipped
it.** That session measured 111 uploads against 53.7 distinct values and landed
`_luNL`; this one measured 111 against 51.5 and wrote `ufi`. Same defect, same
mechanism, the same 146 -> 87.9. On the deploy merge `_luNL` won on the simple
ground that it was already shipped and already canary-pinned, and `ufi` was
deleted rather than left as a second cache on one uniform. What survives from
this side is `ufM4`, the mat4 twin, for `uModel` — which the other lineage did
not look at. Convergence like this is worth recording: it says the attribution
METHOD (wrap `getUniformLocation` at init, count uploads against distinct
values) is reliable enough that two independent runs of it agree to within a
rounding error.

**`ufM4` COPIES the sixteen floats and that is load-bearing.** Callers hand in
scratch matrices they mutate in place — game.js's `_wheelWorld`/`_ringWorld`,
DebrisWorld's `_mat` — so a cache retaining the caller's array would compare a
value against itself and skip a REAL change. That is a wrong transform, which
no call counter would ever catch; the canary pins the copy.

**The thing nobody had counted: `DebrisWorld.draw()` was four per-body loops.**
One `gfx.draw` per live body across shards/marbles/cones/panels — 48+16+24+10 =
98 draws at desktop caps. Measured on vegas night with **no incident debris at
all** (`live 0, marbles 0, panels 0`): **17 draws a frame, every one a CONE**.
`registerFurniture` places a cone at every corner of every circuit and the cone
loop has no liveness test, so this is a cost on every frame of every lap. That
is exactly why five rounds of steady-state censuses never saw it — it is not a
pileup-only cost, but it looks like one until you attribute the draws by call
site. Each pool is one shared mesh, one constant opaque material and N mat4s:
the shape `drawInstanced` exists for. `updateInstances` hands a batch a
caller-packed set, and the side-world becomes four draws whatever happens.

| counter (vegas night, pack) | before | after |
|---|---|---|
| `drawElements` | 162.8 | **146.0** |
| `uniformMatrix4fv` | 118.1 | **48.5** (-58.9%) |
| `uniform1i` | 146.3 | **87.9** (-39.9%) |
| `drawElementsInstanced` | 25 | 26.3 |
| `bufferSubData` | 14.5 | 15.6 |
| `uniform4fv` | 69.4 | 69.4 |
| `bindVertexArray` | 83.8 | 84.2 |

~141 GL calls a frame, measured on this side's tree before the deploy merge —
so the `uniform1i` column here and 2g's are the SAME win found twice, not two
wins to be added. Every delta is accounted for: draws fall by the 17 debris
bodies; `uniformMatrix4fv` falls by 52.9 (the `uModel` redundancy) plus the same
17 (each body used to upload its own model matrix), which is the measured 69.6;
`uniform1i` falls by the 59.5 `uNumLights` redundancy that 2g also reports. The
`bufferSubData` cost is +1.1 calls — one instance upload a frame, 17x64 = 1.06
KiB by construction. **The KiB total moved 489.2 -> 513.6 and that is NOT the
debris upload**: it is run-to-run variance in the prop repack, which depends on
where the camera settles. Report the call delta, which is exact; do not claim
the byte delta, which is not.

**The oracle was an invariant, not pixels.** Every body the loop would have
drawn must appear as an INSTANCE, so sum `instanceCount` over the instanced
draws issued inside `DebrisWorld.draw` and compare against the live-body count
from `__apex.debris()`: **1 draw carrying exactly 17 bodies against 17 live
cones, and per-body draws inside that call fell to 0.** 2d already recorded why
a PNG compare is the wrong instrument here (the scene is time-dependent and the
drawing buffer reads black outside the frame); a count that must match a count
is better than a picture that must look similar.

### The abort condition I wrote was the wrong instrument, and I am recording that

Before measuring, this round committed to acting on a uniform only where
uploads exceeded distinct values by **more than 3x** — the `uInstanced` shape
from 2e (54.8 / 3.1 = 17.7x). `uNumLights` came in at 2.2x and `uModel` at
2.1x. Applied literally, that gate would have killed both.

It was the wrong test. What a redundancy cache collapses is the ABSOLUTE count
of uploads carrying a value the program already holds, not the ratio of uploads
to values. A uniform that genuinely changes 50 times and is uploaded 110 times
has a poor ratio and 60 free calls. The gate was calibrated on a case where the
value barely changed and it silently assumed that shape. **The measured saving
here (112 calls/frame from the two) is larger than the 44.1 that 2e shipped as
a real win.** The right pre-registered condition is an absolute-excess floor;
the ratio is only the right test when asking whether a value is frame-invariant.

### What was verified, and what this box could not verify

Green: `tooling-fast` (the parity guard caught a real defect — see below),
`instanced-draw.spec.js` 4/5 including "ordinary draws are unaffected", and
`webgl-probes`'s mobile-tier GL-error scrape.

NOT verified here: five tests across those two files time out on this
container. **They fail identically on an unmodified HEAD checked out in a
second worktree**, which is what separated the box from the diff — run that
check before believing any red renderer run. Two separate causes, both
pre-existing:

1. `loadRace` allowed **8 s** for `window.__apex` to exist where
   `smoke.spec.js` allows 60 s for the identical wait. Every test in the file
   goes through it, so one tight boot wait fails all five and reads as a
   renderer regression. Matched to smoke's numbers; the test then gets 37 s
   further before failing on something else.
2. That something else is the monza day `numLights === 0` wait. **The asserted
   behaviour is correct** — probing the same page directly
   (`scratch/r12-monza-day.mjs`) reports `numLights: 0` on monza in both
   `default` and `day`. The spec cannot reach it because boot alone is eating
   ~60 s on this container right now (a 25 s smoke test measured 134 s here the
   same day). Its 5 s budget is left ALONE: nothing here is evidence that it is
   wrong, and widening an assertion to make a red run green is the move this
   file exists to prevent.

**The parity guard earned its keep.** `updateInstances` on GLX alone failed
`backend-surface-parity.test.mjs`: because game.js installs a backend by
descriptor-copy onto GLX, an undeclared name leaves GLX's OWN closure live on a
WGX-bound `gfx` — so DebrisWorld's feature test would have passed on WebGPU and
then called a GLX function with no device. WGX and TLX now declare
`updateInstances: undefined`. Porting it to WGX means expanding stride-16
matrices into its stride-20 instance layout and deciding what the colour lanes
mean for a batch built without `srcColors`; that is a perf task, never a
correctness one, because the per-body loop those backends keep is exactly what
they ship today.

### Closed by measurement: cross-car wheel batching

The plan of record for this round's second win was to extend the per-car
two-pass wheel deferral (`6b233ae`) across cars, on the theory that the field's
AI cars share wheel meshes through `fieldWheelCache` and rebind the same VAO
once per car. **Measured: 83.8 `bindVertexArray` a frame, of which 0 are
redundant back-to-back.** `bindVAO`'s cache already collapses every consecutive
duplicate, so there is no free win — only a reorder, and 2e already put the
ceiling on reordering at 8.7 draws (4.8%). Dropped. Do not re-open without a
new measurement.

## 2i. The instrument was blind in one eye and blank in the other (2026-08-31)

A round-13 perf hunt found no perf win and two defects instead. Both were
invisible for the same reason: **the thing doing the measuring said nothing was
wrong.**

### `glx-call-census.mjs` reported an empty frame as a success

Every counter zero, `per: {}`, exit code 0. Not an error — a confident answer
about nothing. The unmodified tool did it too (checked out at `ba7ceb8` in a
second worktree and re-run), so it was the tree, not the edit.

Cause: the boot round made `startRace` **async** (it awaits `ensureScenery` for
the split `js/circuits/scenery/` files). The tool did

```js
await page.evaluate(() => { __apex.race(t, d, "clear"); __apex.go(); });
```

in ONE evaluate, so `go()` landed in the window where `race()` had returned but
`makeCars` had not run. It flipped state to "race" on a game whose `player` was
still null, and `update()`'s engine-audio block dereferenced it.

### A throw in `update()` does not cost a frame — it ends the session

`js/game.js` `if (soundOn) { … player.rpm … }` had no null test, while
`startRace` twenty lines away explicitly tolerates a null player ("roster/team
resolution miss") and guards itself. The throw escapes `tick()` **before** the
`requestAnimationFrame` re-schedule, so the render loop never runs again.

> **Superseded in §2k (round 14).** The sentence above describes the loop policy
> as it stood, and fixing this one dereference left every *other* transient
> fault exactly as fatal. `tick()` now tolerates a bounded run of consecutive
> faults that any clean frame pays back, and still reports and rethrows at the
> cap. Read §2k before quoting this paragraph as current behaviour.

| `__apex.race()` + `go()` | draws over 20 frames | page errors |
|---|---|---|
| before | **0** | `Cannot read properties of null (reading 'rpm')` |
| after (`soundOn && player`) | **6371** | none |

**Not player-facing, and that was checked rather than assumed**: the real menu
walk (`#mb-race` → `#sel-go` → `#cs-done` → `#rs-go`) renders 10,415 draws over
20 frames with no errors on the same tree. The dev API reached a state the UI
cannot. Build 1679 was fine for players; the fix is robustness, not a hotfix.

### What the census could never see: ~152 calls a frame

It wrapped **15 methods**. The renderer calls a dozen more that mutate state per
draw, so five rounds of GLX work optimised against a partial frame. Now counted,
with `enable`/`disable` bucketed BY CAP (one number for all caps is what let §0's
toggle question be answered once and then forgotten):

| previously uncounted | /frame |
|---|---|
| `enable` + `disable` — of which **CULL_FACE 55.7** | 75.0 |
| `uniform2f` | 17.9 |
| `viewport` | 14.9 |
| `polygonOffset` | 9.9 |
| `colorMask` / `depthMask` / `blendFunc` | 26.8 |
| `uniform1fv`, `uniform2fv`, `clear`, `texParameteri` | 7.3 |

Report ~152, not the 226.9 a naive sum gives: the per-cap buckets are the SAME
calls as `enable`/`disable`, and double-counting them would inflate the finding.

CULL_FACE dominates and is exactly the toggle pair §0 measured and retired — it
alternates because `doubleSided` car draws sit between single-sided neighbours,
so a cache collapses none of it. Nothing here reopens that.

### Closed by measurement: hoisting the blob-shadow loop state

The plan for this round was to hoist `drawShadow`'s per-call `uniform2f(uSize)`
and its `setPolyOffset` on/off bracket out of the flush loop at
`js/game.js:7249`, on the estimate that a full grid draws ~20 blob shadows.

**Measured: 1.8 a frame.** The r=8 m frustum gate plus the behind-eye test cull
almost the whole field in that camera. The hoist would save ~9 calls a frame and
would cost a new API member on all three backends (the parity guard requires it),
three module-size raises and its own canary assertions. Dropped — the same call
§2e made on material sorting, for the same reason.

Two stale claims fall out of that number: `js/render/glx.js`'s comment that
`drawDecal` runs "~22x/frame" predates the frustum gate, and this file's own
framing of the per-car block as the bulk of `drawElements` is wrong — chunked
scenery is ~94 of it.

### The transferable rule

Three instruments in this file have now failed the same way: `gpuErrors` read
`null` and passed vacuously, `readdirSync` harnesses built circuits bare and
reported confident geometry, and this census printed an empty frame as a result.
**An instrument must be able to say "I measured nothing".** The census now exits
non-zero on a frame with no `drawElements`, and both that and the null guard are
pinned in `tests/unit/source-integrity.test.mjs`, each proven to bite by
sabotage.

## 2j. Sweeping the class: three more instruments that could not say "I measured nothing" (2026-08-31)

§2i wrote the rule down and never swept for it. A read-only audit found three
more live instances, all confirmed at source, all in `tools/` — which
`tests/unit/silent-catch.test.mjs` has never walked (it is scoped to `js/`).

### `verify-change.mjs` returned `pass` for a diff no rule claimed

`tools/pick-tests.mjs` computes a three-way `reason` whose own comment says
*"unmatched — files changed but no rule claimed them, so the selection is NOT
trustworthy and the caller must fall back to a full run."* `verify-change.mjs`
called the raw `pick()` Map API and never saw it, so `!batches.length` collapsed
"nothing to test" and "no rule matched" into the same `pass`. A `.github/`,
`playwright.config.js`, `package.json`, `icons/` or `vendor/` edit ran one
advisory cache-check and reported green — and this is the default for
`verify-agent` and what `apex_verify_change_fast` runs, so an agent asking "did
I break anything?" was told no.

Fixed by computing the same reason and giving it its own verdict. `finish()`
already exits 0/1/2 for pass/fail/other and `apex-tools-mcp.mjs` already
tolerates exit 2, so this needed no new mechanism and no caller change.

### The real-GPU gate could silently disable its own strongest checks

`tools/gpu-census.mjs` set `anyHardware` from `runs.some(...)` and exited 0
**unconditionally**, so four failed launches were indistinguishable from "this
machine is software". `gpu-census.yml` read that as `hardware = false`, which
turns the `hardware &&` clauses — a missing `gpuErrors` count, `softAdapter` on
hardware — into no-ops. A census that measured nothing therefore **downgraded
the real-GPU gate to a software gate and let it report success**, printing
`census anyHardware: false` for a verdict it never reached. Reproduced against
the reverted script: cases C and D below exit 0.

`anyHardware` is now tri-state (`null` when nothing launched) and the tool exits
1 when every run failed to launch; the workflow fails on `null` rather than
coercing it.

### `(env.fail || 0) > 0`, twelve lines below the comment explaining the bug

The same banned idiom as the `gpuErrors` fix, on the same object, in the same
file: a build that stops exporting `envState().fail` read as clean. **This
session cited that gate twice as evidence.**

Scoping it was the interesting part. The naive fix — fail on an absent count —
would have failed macOS forever: `gpu-game-check.mjs` reads `envState` only when
`g.__tlx` exists, so the **GLX leg has no env probe to report and never will**.
The check is scoped to the two TLX legs, which are `--backend three` by
construction. Scoping on the leg NAME rather than on "does this row have a
`__tlx`" is deliberate: a TLX leg that fell back to GLX also loses `envState`,
and that is a regression to fail on, not a reason to go quiet.

### The gate had never been executed by a test

Every guard on the Verdict step was a regex over its source, because it is a
`node -e` script embedded in YAML — which is how three vacuous clauses lived in
it at once. `tests/unit/gfx-backend-canary.test.mjs` now lifts the real script
out of the workflow and **runs it** against fixtures shaped like what
`gpu-game-check` actually writes. Seven cases, and the one that earns its keep
is the counter-test: a healthy hardware run whose GLX leg reports no env probe
must PASS. Without it, "fail on absence" looks free.

Four sabotages, each confirmed red then restored: coerce `anyHardware` back
(2 tests red), restore `(env.fail || 0) > 0` (1), drop the `tlxLeg` scope (the
counter-test catches it — this is the false-failure that would otherwise have
shipped), and rename the workflow step so the extractor finds nothing (all 3,
proving the extractor cannot silently hand back an empty script).

### Confirmed on real silicon, and the two rows that make it evidence

Dispatched `gpu-census.yml` on `cc7846d` (run 33411690913) — all four jobs
success. A green tick is not the point; these two rows are:

```
census anyHardware: true
webgpu  phase=done ok=true gpuErrors=0 envFail=0 ... softAdapter=false
webgl2  phase=done ok=true gpuErrors=0 envFail=0 ... softAdapter=false
glx     phase=done ok=true gpuErrors=0 envFail=undefined softAdapter=undefined
```

`anyHardware: true` says the tri-state resolved to a MEASURED hardware verdict,
so the three hardware-only clauses were **armed** for this run. That is the
distinction the old code could not express: it printed `anyHardware: false` for
a census that never launched, and false is what switches those clauses off — a
green job that had quietly stopped gating.

`glx envFail=undefined`, passing, is the other half. That is the exact false
failure the naive fix would have shipped: the GLX leg has no env probe and never
will, so an unscoped absence check would have failed macOS on every run for a
leg behaving as designed. It passes here because the check is scoped to the two
TLX legs, while `webgpu`/`webgl2` report a real `envFail=0` that the same clause
would have caught had it gone missing.

ubuntu (SwiftShader) and windows (WARP) passed on the same commit with
`anyHardware` false — a genuinely measured software verdict, which is the third
state and must stay green.

## 2k. A transient fault costs a frame; a deterministic one still stops (2026-08-31)

§2i's finding has a tail. Fixing the null dereference fixed one *instance*; the
*policy* — one throw ends the session — left every other transient fault just as
fatal, and `startRace` is async now, so that window is real.

`tick()` now delegates to `js/game/loop-health.js`: a run of consecutive faults
is tolerated and **any clean frame pays the run back to zero**; at the cap it
reports through `window.__apexReportError` and rethrows exactly as before, so a
deterministic fault still stops loudly instead of repainting the error overlay
60x/s. This follows the retry shape the codebase already uses — `js/game/perf.js`
caps crash-sentinel strikes and lets clean races pay them back, `js/render/glx.js`
bounds context-loss reloads at two per tab session.

A run counter that any clean frame resets can never stop a fault that
*alternates* clean/throw, so there is an absolute ceiling too (240 faults, four
seconds of a half-broken loop).

### The heartbeat, and why it is not `fpsEMA` and not `lastFrame`

When the loop dies, every existing surface reports health: `PerfGov.fpsEMA()` is
written only inside `PerfGov.tick`, whose sole caller is the dead loop, so it
freezes at its last healthy value while the METRICS and `?gfxdebug=1` overlays —
both on their own `setInterval` — keep painting a plausible 60 fps over a frozen
canvas.

Decaying `fpsEMA` is **not** the fix: `PerfGov.tick` is gated on `!paused &&
(race || count)`, so a frozen fps is correct in a menu and a decay would report
false stalls there. Measured in the menu: `fpsEMA` 16.7 and frozen, loop
demonstrably alive.

`lastFrame` looks like the honest candidate and is not — it is assigned at the
**top** of `tickBody`, before the body runs, so a loop throwing on every frame
keeps refreshing it and reads perfectly alive. The stamp has to be taken by a
frame that *finished*.

**And liveness is a COUNT, not a deadline.** The first version of the repro
asserted `staleMs < 1000` and failed on healthy code: rAF in this container runs
at a fraction of a Hz — a 500 ms `setTimeout` took 9.8 s, and a perfectly healthy
page reported `staleMs` 6993. Any "stalled if > 1 s" rule would call that machine
dead, and a struggling phone too. A frame counter that does not advance between
two observations is a stall at any frame rate, on any hardware. The `?gfxdebug=1`
overlay reports the delta between its own paints for the same reason.

### Verified on a live page, not in the source

`tools/loop-fault-repro.mjs` injects throws into `Input.poll` (a global
`tickBody` calls unconditionally every frame) and reads what the game does.
Seven checks, all green:

| check | measured |
|---|---|
| menu loop alive while `fpsEMA` is legitimately frozen | frames 7 → 9, `fpsEMA` 16.7 |
| 7 consecutive faults survived, still drawing | `stopped:false`, frames kept advancing |
| a clean frame paid the run back | `run=0 faults=7` |
| faults reached the `__apex.logs()` ring | 5 entries |
| permanent fault stopped AT the cap, no spin | exactly 8 throws, then none |
| the heartbeat reports the stall the frozen surfaces hide | frames flat, `staleMs` 3521 → 5022 |
| the real error reported once, not 60x/s | 7 console lines |

Three sabotages on the source guards, each confirmed red then restored: drop the
tolerance branch (the old policy), drop `clean()` (the run never pays back), and
never rethrow at the cap (unbounded tolerance).

## 2l. The gate reported appearance it never measured, and its diagnostics were dead (2026-09-01)

Asked "can we actually verify WebGPU and three.js?", the answer turned out to be
worse than expected. The macOS census that gated round 14 printed
`meanLuma=n/a` on **every leg of every image** — so the real-GPU run proved the
backends boot with zero GPU errors and produced **no pixel evidence at all**.

### The appearance column was never wired

`tools/gpu-game-check.mjs` did not contain the string `frame` anywhere. It never
wrote `out.frame`. `gpu-census.yml` reads `const frame = g.frame || {}` and
prints `meanLuma=${frame.meanLuma != null ? … : "n/a"}`, so that column was
structurally empty from the day it was added. `meanLuma` exists in
`gfx-probe.mjs` and `wgx-capture.mjs` — just not in the tool the gate calls.

It is read from the **screenshot** the tool already takes, and every in-page
alternative was disproved by an actual run rather than by argument:

| candidate | why not |
|---|---|
| `getContext("2d")` (gfx-probe's method) | only works where WGX/TLX route through the soft-present blit; a native canvas has no 2D context |
| `GLX.capturePixels()` | **does not exist on GLX** (WGX and TLX only) — and GLX is the default backend the gate most needs appearance for |
| `capturePixels` on the TLX/WebGL2 leg | reported `maxLuma=0` on a frame that is demonstrably a complete scene — the readback lies, the screenshot does not |
| `drawImage` of a WebGL canvas | solid black outside the frame (§2d) |

Cross-validated: `sharp` read `meanLuma 44.0` from the WGX PNG; gfx-probe's
independent in-page read of the same frame reported `44`.

### The diagnostics added to explain failures had never once run

The verification run left a stack trace, and it was pre-existing:

```
ReferenceError: console_ is not defined
    at tools/gpu-game-check.mjs:273   (in the finally)
```

`const console_ = []` was declared INSIDE the `try` while the `finally` read it.
Sibling scopes — so the `finally` threw on **every run, success or failure**, at
its first statement. Everything after it was dead:

- `out.console` — the filtered console lines a previous round moved into the
  `finally` *precisely* so a failing run would keep them;
- `out.root` — added to name the Windows path bug, with the claim it "would have
  named this on day one". It has never once been set on a real run;
- the bounded `browser.close()` / `server.close()` teardown, so browsers leaked;
- `process.exit(out.ok ? 0 : 1)` — the tool always exited non-zero, even on
  `ok:true`, so its exit code carried no information.

Nothing looked wrong because `continue-on-error: true` on all four census steps
swallowed the exit code, and `checkpoint()` had already written the JSON after
every phase, so the artifact was complete.

**The fix that preserved the diagnostics is what destroyed them** — the
assignment moved into `finally` and the declaration did not follow. That is the
sharpest form of this file's recurring rule: the machinery added to make
failures legible was itself silently dead.

Measured before → after, same command:

| | before | after |
|---|---|---|
| exit code | non-zero always | **0** |
| `frame.meanLuma` | absent (`n/a`) | **69.3** |
| `root` | absent | set |
| `console` lines | absent | **7** |

### The backends, verified in-container for the first time

Not inferred from "no errors" — rendered, with images:

| backend | evidence |
|---|---|
| WGX (WebGPU) | `wgx-validate` Dawn `gpuErrors 0` / `wgslParseErrors 0`; probe `ok`, `meanLuma 44`, coverage road 42.9 / tree 30.3 / player 6.1 |
| TLX (three/WebGL2) | probe `ok`, `gpuErrors 0`, coverage ground 27.4 / player 17.5 — full scene with car and HUD |
| TLX + `tlxForceHw=env` | `exit=0` |
| TLX (three/WebGPU) **in software** | hung 66 min on `awaitSoftPresent` after a 60 s timeout and a retry. NOT a backend defect: AGENTS.md documents SwiftShader Dawn dying on three's `mappedAtCreation` uploads, and that leg passed on real Apple silicon in the census. Verified on hardware, not reproducible in software here — do not spend an hour rediscovering this. |

Guards in `gfx-backend-canary.test.mjs`, both sabotage-proven: putting
`console_` back inside the `try` fails the scope test, and renaming the
`frameReadFailed` branch fails the appearance test.

## 2m. three never lets go of a geometry, and phones pay for it (2026-09-01)

The player reported the car rendering **see-through in the garage** on the
three.js backend, on an iPhone. Two separate defects, one behind the other.

### First: a uniform array that cost 48 rows, not 12

`tsl-lit.js` declared `MAX_LIGHTS = 48`. WebGL2's guaranteed floor is **224
fragment uniform vectors**, and a uniform ARRAY packs vertically — a 48-element
array of `vec4` costs 48 rows, not 12. The lit program overran the floor and
failed to **link** on iOS, so every lit surface drew nothing: the car vanished
while textured and emissive surfaces (which use other programs) kept drawing.
That reads as "see-through", which is why the first diagnosis went at
translucency and was wrong — the player's screenshots corrected it.

Fixed by making the ceiling device-aware: 16 on `_liteGpu` (mobile / WebKit /
software adapter), 48 elsewhere, passed from `tlx.js` into `TLXShaders.lit()`.
Confirmed by the player on the handset.

### Then: the tab started dying mid-race instead

With the shader linking, the same device began showing iOS Safari's **"A
problem repeatedly occurred"** — a jetsam OOM, not a renderer error. Heap
snapshots, same track and viewport:

| backend | JSArrayBufferData | buffers | JS heap |
|---|---|---|---|
| GLX | 17.8 MB | 253 | 80.8 MB |
| TLX | 71.5 MB | 5,665 | 148.1 MB |

three retains the CPU copy of every geometry attribute after upload; GLX
uploads and drops. That +53.7 MB — against 52.8 MB actually uploaded — is the
gap, and 483 scenery chunks are what fill it.

### Releasing those arrays: DISPROVED, twice, live

The obvious fix is to null `attribute.array` once the backend holds a GPU
buffer. Do not spend the afternoon on it — it was built, gated, A/B'd and it
does not work. Three findings, in the order they cost time:

1. **`BufferAttribute.onUpload` is not the hook.** It is a legacy
   `WebGLRenderer` API: the string `onUploadCallback` appears **ZERO times** in
   `three.webgpu.min.js`. The WebGPU renderer's backends never call it. Shipping
   that would have been a no-op that looked like a fix.
2. **A frame counter is not a clock.** The first sweep gate was
   `(++_relSweep % 90) === 0`. The A/B came back with `relSweeps: 22` and
   `relCount: 0` across a 40 s run — only 22 presents happened, `22 % 90` never
   hits zero, and **the sweep never executed once**. The heap was identical in
   both arms because the code never ran, which reads exactly like "the fix does
   nothing". Only the `relSweeps` / `relPending` counters told the two apart.
   Same defect as every other frame-as-a-clock here; throttle on
   `performance.now()`.
3. **three re-reads `.array` after upload, in two places, and each one takes
   the renderer down.** Both reproduced live, both fatal:

   | site | code | crash |
   |---|---|---|
   | `draw()` | `firstVertex *= index.array.BYTES_PER_ELEMENT` — every indexed draw | `Cannot read properties of null (reading 'BYTES_PER_ELEMENT')` |
   | `updateAttribute()` | `bufferSubData(target, 0, attribute.array)` on a version bump | `parameter 3 is not of type 'ArrayBuffer'` |

   Excluding the index cleared the first and hit the second on the next run.
   TLX then refuses and the tab reloads into GLX — which surfaces as Playwright's
   `Execution context was destroyed, most likely because of a navigation`, so
   the *probe* error was never the real message. The renderer's own
   `[gfx] TLX: present failed — …` console line was.

### What shipped instead

A phone that picks three gets GLX, via the existing `_fail()` seam, with the
reason recorded in `apex26.gfxTlxFail` where SETTINGS shows it;
`apex26.tlxMobile="1"` overrides. GLX at ~113 MB total is measured working on
the same handset. TLX is untouched on desktop.

Making TLX itself viable on a phone means the chunk system has to **stream** —
build near, drop far — instead of building all 483 chunks up front. That is
real work, not a flag, and it is the entry in §3 for it.

## 2n. The bytes were not where the plan said they were (2026-09-02)

§2m ended by naming a streaming chunk system as the way to make TLX viable on a
phone. That entry was wrong, and it was wrong in this document's own favourite
way: an inference written down in the register kept for measurements.

### The inference, and what one measurement did to it

"483 scenery chunks built up front" reads like an attribution. It was arithmetic
over a number from a different instrument. `tlx-chunked.build()` gives every
chunk of a mesh the **same** `position` / `normal` / `color` / `mat`
`BufferAttribute` objects and only the index differs — so chunk residency can
free index arrays and nothing else. Building montreal in a VM and totalling the
buffers by kind (`tools/tlx-pack-check.cjs` shares the harness):

| | vertex | index | chunks |
|---|---|---|---|
| all meshes | 12.24 MB | 1.65 MB | 303 |
| chunked only | 10.30 MB shared, **not** freeable by streaming | **1.24 MB** | |

The whole track is 13.89 MB. The plan targeted a 53.7 MB gap with a mechanism
that could reach 1.24 MB of it.

### Where they actually were

`__tlx.geoCensus()` — a weak registry of every geometry the backend builds,
deduped **on the underlying ArrayBuffer**, because counting per geometry
multiplies a chunked mesh's shared set by its chunk count and invents tens of
megabytes that do not exist. Montreal, iPhone profile, in race:

| attribute | MB | |
|---|---|---|
| position | 11.44 | must stay Float32 — world metres |
| normal | 11.44 | unit vectors in Float32 |
| color | 11.43 | Float32 |
| trk | 6.45 | **5.88 of it entirely zero** |
| index | 4.86 | Uint32 everywhere, even under 65536 verts |
| mat | 3.80 | a 0..16 id in Float32 |
| **total** | **49.84** | across 1,037 live geometries |

Not chunk residency. Format.

### The pack, and why it range-scans first

`TLXShaders.packAttr` quantises only what provably fits and keeps Float32
otherwise. The scan is the whole point — the first draft's fixed rules would
have been silently wrong three separate ways, each caught by making the code
report what it refused:

- **normals** refused Int16 on four arrays (1.29 M values). Maximum value
  `1.0000000560427362` — float noise a hair over 1.0. An EPS, not a bare
  compare.
- **colours** refused Uint8 on 21 arrays. Maximum **3.4**: emissive above 1 is
  real, and clamping it would have dimmed every glowing surface.
- **MAT ids** refused Uint8 on two arrays. Maximum **15.4** — ids are not whole
  numbers; `tsl-lit:1527` carries the flag material's wave phase in the
  fraction.

Colours and ids therefore go to **half-float** (2 bytes, no shader change —
three maps `Float16BufferAttribute` straight to `GL_HALF_FLOAT`), normals to
normalised Int16, indices to Uint16 under 65536 verts, and every absent source
to a view into one shared zero buffer. `trk` is excluded from half by name: its
arc length reaches 5382 m, where a half's 11-bit mantissa is worth about ±2.6 m
and road markings need far better.

| | before | after |
|---|---|---|
| deduped attribute bytes | 49.84 MB | **28.68 MB** |
| JS heap, iPhone profile in race | 136.4 MB | **119.1 MB** |

`gpuErrors` 0 and no page errors throughout; the race renders (car, field, HUD,
touch controls).

**2026-09-02 — the pack broke TLX's WebGPU path, and no software test saw it.**
gpu-census runs 21 and 22 on macos-latest reported the three.js/WebGPU leg with
`envFail=undefined` — not "no failures" but "no `__tlx` surface": the overlay
read `TLX REFUSED: Failed to execute 'createRenderPipeline' … The provided
value 'float16x3' is not a valid enum value of type GPUVertexFormat`. WebGPU's
8- and 16-bit vertex formats come only 2- and 4-wide (`unorm8x2/x4`,
`snorm16x2/x4`, `float16x2/x4`); three names the format straight from
`itemSize`, so a packed 3-wide colour reached Dawn as `float16x3` and the whole
pipeline was refused, after which TLX stood down to GLX. WebGL2 accepts any
width, which is why the WebGL2 control leg (and every SwiftShader/WebGL2 spec)
stayed green. The refusal reproduces under Dawn/SwiftShader locally
(`node tools/gpu-game-check.mjs montreal --backend three --path webgpu`), so
it was a missing probe, not a missing GPU. A `createRenderPipeline` hook
(scratch, `scratch/wgpu-fmt-probe.mjs`) then listed every format three named:
3-wide Int16 normals arrive as `snorm16x4` (three pads the width for 2-byte
arrays — accepted), 3-wide Uint8 colours as `unorm8x4` (accepted), but a
1-wide `mat` id goes through three's itemSize-1 table, which maps a Uint16
array to **`uint32`** regardless of the Float16 class — the pipeline is created
and then fails validation ("Attribute base type Uint … does not match the
shader's base type Float"), and the half-float colours arrive as `float16x3`.
Fix: `packAttr` takes `fmt24` (the renderer's `isWebGPU`, read per build) and
keeps 1- and 3-wide attributes Float32 under it — at BOTH pack sites, the
chunked builder and `tlx.js` `buildGeometry` (`_pk`); the first fix covered
only the chunked one and the props still refused. Padding x3 to x4 is not the fix — three reads a 4-wide
`color` attribute as RGBA. The WebGPU path therefore forgoes the colour /
normal / id savings above; a 4-wide pack with an explicit `vec3` read is the
follow-up, gated on the same probe.

### Verifying it with decode, not with a screenshot

Two frames differ for a dozen reasons that are not the change under test —
the A/B tried first drifted the camera and the countdown between arms, and the
OFF frame showed trees the ON frame did not for reasons that had nothing to do
with packing. Screenshots could not settle this.

`tools/tlx-pack-check.cjs` settles it: it **lifts the real packer out of the
shipping file** (a reimplementation drifts, then verifies its own copy), feeds
it the real attribute arrays from a real build, decodes what the GPU would read
back, and gates on the three things `tsl-lit` actually DOES with `mat` —
`floor(mat+0.5)` for the material layer, `mat >= 15 && mat < 16` for the flag
branch, `fract(mat)` for the wave phase.

Zero error is the WRONG gate here and the first draft used it, failing on a
legitimately fractional 15.4. "Same decision" is the right one. All 40 circuits:

```
normal  60,599,541 values   max abs error 1.526e-5
color   60,599,541 values   max abs error 1.961e-3   (under the 1/255 an 8-bit channel already quantises to)
mat     20,172,423 values   max abs error 1.563e-3
  material layer  floor(mat+0.5) changed : 0
  flag branch     15<=mat<16 flipped     : 0
  integer ids     not exact after decode : 0
  index narrowed to Uint16               : 248 of 320 meshes, 35,455,179 values, 0 altered
```

### What it costs to build

Not free, and not measured before it shipped — which it should have been.
The pack is two passes over every attribute (range-scan, then convert), and
`_toHalf` round-trips each value through a Float32Array view:

| | |
|---|---|
| 1 M vertices (nrm + col + mat, 7 M values) | ~1.9 s |
| montreal TLX track build, added | ~0.6 s |

One-time, at mesh creation, on the opt-in TLX path only — GLX and WGX never
call it, and `tlx-chunked.js` is a DEFERRED file with no script tag, so nothing
on the default path even loads the code. Traded for 21 MB. If it ever needs to
come down, the scan and the convert are fusable for the fits-anyway case, and
`_toHalf`'s Float32Array round-trip is the hot line.

### What this does NOT settle

TLX at 119 MB is still well above GLX's 49.6 MB on the same phone profile, and
attributes are now only 28.7 MB of it — ~~the rest is three's own machinery and
the TSL node graphs, which no amount of attribute packing reaches~~. **WRONG,
corrected 2026-09-02 by the first heap snapshot anyone took (§2r).** Every
named three object class TOGETHER — `RenderObject`, `NodeBuilder`, every TSL
node, materials, the lot — is **+3.75 MB** of TLX's excess over GLX.
`JSArrayBufferData` is **+31.6 MB of the +50.5 MB gap**. The remainder was
still CPU mirrors, exactly as §2m said before this sentence talked the next
round out of looking. Written from subtraction — "total minus attributes must
be machinery" — which is not an attribution, and this register is for
measurements. **Whether TLX clears an iPhone's jetsam limit cannot be
determined from this container.** The phone default therefore stays GLX (§2m);
`apex26.tlxMobile=1` is how a player finds out on the actual handset, and
`apex26.tlxPack=0` turns the packing off if it is ever suspected.

## 2o. TLX leaks ~30 MB a minute while you race, and it is three's render-object cache (2026-09-02)

The player could not test the handset, so: Chromium cannot reproduce iOS
jetsam, but it can answer the question underneath it — **does TLX's memory
plateau, or climb?** Four-minute race soak, iPhone UA, montreal, driving
throughout, `window.gc()` before every sample so the number is RETAINED memory
and not garbage:

| backend | start | end | drift |
|---|---|---|---|
| GLX | 47.0 MB | 47.5 MB | **+0.5 MB** |
| TLX | 119.9 MB | 244.2 MB | **+124 MB, still climbing** |

That is the bug. Everything before it — §2m's phone decline, §2n's 21 MB of
attribute packing — was working on the BASELINE while the slope went unmeasured.
119 MB was never what killed the tab; ~30 MB/min is, and it reaches any
handset's ceiling in a couple of minutes of racing. Which is exactly the report:
"it's fucked when we race."

### It is not the geometry, and it is not the packing

Same build, `apex26.tlxPack` the only difference:

| arm | start | drift | geometry registry | attribute MB |
|---|---|---|---|---|
| pack ON | 117.2 | +137.6 | 1841 → 1850 | 28.68 → 30.16 |
| pack OFF | 135.5 | +88.1 | 1841 → 1850 | 49.78 → 52.89 |

Both leak. The registry and the attribute bytes are FLAT across the whole soak
while the heap climbs 90–140 MB, so geometry is not it. (Run-to-run drift
varies widely with machine load — 30.8 MB on one earlier run — so do not read a
packing penalty into the difference between those two numbers. What is solid is
that the leak survives with packing off.)

`__tlx.memState()` was added to check the next tier, and cleared it too:

```
 22s  heap 120.7  mats 21  pool 342  rGeo 228  rTex 34
257s  heap 243.1  mats 22  pool 342  rGeo 243  rTex 37
```

Material cache, mesh pool, three's own geometry and texture counts: all flat
against +122 MB.

### V8 names it

Nothing tracked was growing, so stop guessing and ask the sampling heap
profiler, which attributes retained allocations to the function that made them.
Two minutes of racing, heap 121.5 → 200.6 MB:

```
 13.25 MB  updateByType         three.webgpu.min.js
  6.29 MB  _createBindings
  4.26 MB  VE
  4.14 MB  createRenderObject
  3.12 MB  qE
  1.99 MB  createBindings
  1.94 MB  getAttributes
  1.60 MB  updateBindings
```

Every top site is inside three, in the render-object and binding path.
`createRenderObject` and `_createBindings` running hot mean the renderer is
MINTING render objects and bind groups continuously rather than hitting its
cache.

### Why TLX and not GLX

TLX recycles a pool of `THREE.Mesh` wrappers (`meshPool`, measured 342, flat)
and reassigns `geometry` and `material` on them every frame — the pooling that
keeps allocation down on the Apex side. three's WebGPURenderer caches render
objects and their bindings in a chained map keyed on the object together with
its material and geometry, so a recycled Mesh carrying a different pair each
frame mints a NEW entry every time and the old ones are never released. The
pool is bounded; the cache behind it is not. GLX has no such cache and stays
flat on the same game loop.

### The keyed pool: a measured 28%, and NOT a cure

The pool now keys on (geometry, material) — a given wrapper always carries the
same pair — with a clock-based prune (5 s cadence, 20 s idle) so the map cannot
pin a freed geometry alive and trade three's unbounded cache for one of ours.
It does what it was designed to do: the pool went from 342 entries flat to 198
rising and falling with the working set (198 → 165 across one soak, `geoKeys`
tracking it), and the allocation profile moved exactly where the diagnosis said
it would, same probe and duration:

| site | flat pool | keyed pool | |
|---|---|---|---|
| `createRenderObject` | 4.14 MB | 2.26 MB | **−45%** |
| `_createBindings` | 6.29 MB | 4.61 MB | −27% |
| `updateByType` | 13.25 MB | 10.13 MB | −24% |
| heap, 2 min racing | +79.1 MB | +56.6 MB | −28% |

The targeted functions fell the furthest, which is what makes this causal
rather than a coincidence of load.

**It is still not the fix.** ~28 MB/min remains, and the four-minute soak drifted
+88.6 MB — inside the run-to-run band of the UNFIXED builds (30.8 / 88.1 /
124.3 / 137.6 across comparable runs). Total heap on this box is too noisy to
separate 88 from 124; only the allocation profile could, which is why the claim
above rests on that and not on the soak.

### The remaining lead — a HYPOTHESIS, not a finding

`createRenderObject` is still running at 2.26 MB with the object, geometry and
material all now stable, so three's cache key must include something else that
changes per frame. `_createBindings` staying high points the same way. The
obvious suspect is the per-chunk lamp binding: the lit material binds a
different lamp list per chunk (§R5), so if that reaches three as a changing
lights node, the binding set is new every chunk every frame and no amount of
mesh pooling will settle it. **Not verified.** The next round should test that
before writing any more code, the way this round should have tested the slope
before shipping two baseline fixes.

The acceptance test stays: **drift, not a snapshot.** Any TLX memory claim
reporting a single heap number without a slope is measuring the wrong thing —
this entry exists because two rounds did exactly that.

## 2p. The leak was one `mrt()` call inside the frame loop (2026-09-02)

§2o found the slope (~30 MB/min while racing) and named the mechanism (three
minting render objects continuously). §2n's keyed mesh pool took 45% of the
render-object churn and left the rest. This is the rest, and it is one line.

### Ruling out the hypothesis §2o wrote down

§2o guessed per-chunk lamp bindings. Checked before writing any code, as that
entry insists: `tlx.js` declares `hasPerChunkLights: false` (GLX and WGX are
`true`), and `js/game/lighting.js` says so in prose too — "WebGL2 and WebGPU —
three.js keeps the single global set". **The hypothesis was dead on arrival.**
It cost one grep instead of a round.

### Asking the cache what changed, instead of guessing again

three's render-object key is `[object, material, renderContext, lightsNode]`.
Rather than reason about which one moved, hook `createRenderObject` at runtime
— minified names are not stable, so find the instance by looking for the method
— and count DISTINCT identities per key. A bounded set saturates; a recreated
one climbs. Four 15 s samples while racing:

| | 15 s | 30 s | 45 s | 60 s |
|---|---|---|---|---|
| objects first seen | 216 | 217 | 218 | 218 |
| distinct material | 39 | 40 | 40 | 40 |
| distinct passId / lightsNode | 2 / 2 | 2 / 2 | 2 / 2 | 2 / 2 |
| **distinct renderContext** | **40** | **76** | **112** | **148** |
| createRenderObject | 2,362 | 4,514 | 6,688 | 8,843 |

Dead linear, 36 new contexts per interval, forever. Everything else flat —
which also confirms §2n's keyed pool is doing its job.

### Why a new context every frame

`RenderContexts.get` builds its key as a STRING and stores the result in a
plain object:

```js
const i = `${textures}:${format}:${type}:${samples}:${depth}:${stencil}`
        + "-" + (mrt !== null ? mrt.id : "default") + "-" + level;
if (this._renderContexts[i] === undefined) this._renderContexts[i] = new RenderContext();
```

`mrt.id`. And `tlx.js` present() did this every frame:

```js
renderer.setMRT(TSL.mrt({ output: TSL.output, ssrTag: TSL.float(1) }));
```

A new node, a new id, a new key, a new permanent context — and every object and
material re-created against it. `_renderContexts` never evicts.

### The fix

Build the node once. Its contents are frame-invariant (`output`, a constant
1.0), so this is not a cache — it is the correct lifetime.

| | before | after | GLX control |
|---|---|---|---|
| distinct renderContexts, 60 s | 40 → 148 | **1 → 2** | — |
| createRenderObject, 60 s | 8,843 | **15** | — |
| per 15 s | ~2,150 | **2** | — |
| **4-minute race drift** | **+124 MB** | **+4.5 MB** | +1.3 MB |

TLX now drifts within ~3 MB of GLX over four minutes of racing. `gpuErrors` 0,
no page errors, the race renders unchanged (car, field, HUD, touch controls).

### What this says about the two rounds before it

§2m routed phones to GLX and §2n packed attributes down 21 MB. Both were real,
both moved the BASELINE, and neither touched the slope — because nobody had
measured a slope. The lesson is already written at the end of §2o and it holds:
**drift, not a snapshot.** A leak of 30 MB/min makes any baseline work
irrelevant within two minutes, and the whole of §2m/§2n bought about forty
seconds of extra runway.

Whether TLX may now default on a phone is a SEPARATE question and is not
settled here: the baseline is still ~97 MB against GLX's ~47, and no iPhone has
run this build. `apex26.tlxMobile=1` is how that gets answered.

## 2q. The shadow pass is 40 MB on a phone, and it still is not enough (2026-09-02)

§2n closed with the honest limit: TLX after packing is ~119 MB against GLX's
~49.6 MB on the same phone profile, "the rest is three's own machinery and the
TSL node graphs, which no amount of attribute packing reaches". This entry asks
what the machinery is made of, and answers two thirds of it.

### Where the question came from

three.js **#32409** — override-material `RenderObject`s keep meshes strongly
referenced — was fixed by **#33682** (Mugen87, merged 2026-05-30, `r185`
milestone), and that fix is in our vendored r185. On the PR thread **yisky**
(2026-06-29) reported a residue after retesting r185:

> with shadows enabled, some released resources still remain reachable in
> Chrome heap snapshots after cleanup … with shadows disabled in the same
> `WebGPURenderer` setup, cleanup appears to behave normally … the
> stronger-looking path in my snapshots now seems closer to:
> `DirectionalLightShadow -> shadow.camera -> RenderList -> render item ->
> geometry/material/object`

**Three things about that citation, because the first draft of this entry got
all three wrong and they change what it is worth.** (a) It is on **PR #33682**,
posted by **yisky** — not by #32409's reporter, who is querielo; yisky is the
app author Mugen87 asked to verify the fix. (b) yisky explicitly qualifies it:
"I do not think I have identified the exact root cause yet … please treat it
only as a tentative observation rather than a confirmed diagnosis." (c) It is a
**`WebGPURenderer`** report, and **every leg of the measurement below ran on
three's WebGL2 path** (`api: "webgl2"`). So the upstream thread is what
PROMPTED the measurement; it is not evidence for it, and the mechanism behind
our 40.4 MB is unproven. The number stands on its own.

The env probe is the other override pass this backend runs, and it was already
worth 54.4 MB of a 197.1 MB desktop-profile heap. So: measure both, on the
profile that actually matters.

### The measurement

`scratch/cockpit3/heap-mobile2.mjs`. iPhone UA, `isMobile: true`, 844×390,
montreal, day/dry, in race, 12 s settle, `performance.memory.usedJSHeapSize`.
Every leg is a fresh browser context and a reload after the keys are set, and
every leg's backend is **confirmed** from `GLX.__tlx.backendState()` rather than
assumed — three earlier attempts at this number used `window.__tlx`, which does
not exist, and silently measured GLX in both arms of a TLX A/B.

| arm | backend confirmed | JS heap | Δ |
|---|---|---|---|
| GLX — what phones get today | `tlx:false` | **48.0 MB** | — |
| TLX mobile | `webgl2`, `liteGpu:true`, `isMobile:true` | **149.0 MB** | +101.0 |
| TLX mobile, `tlxShadowOff=1` | same | **108.6 MB** | **−40.4** |
| TLX mobile, `+ envProbeOff=1` | same | **95.8 MB** | −12.8 (−53.2 total) |

Zero page errors in all four. The lite ladder is genuinely engaged — this is not
a desktop profile wearing a phone's viewport, which is what the earlier 197.1 MB
figure was.

**40.4 MB from the shadow pass alone** — nearly twice what the whole attribute
pack won (§2n, 21 MB), from one boolean. Whether it is the same retention
yisky sees is unknown and this entry does not claim it: they measured
WebGPURenderer, these legs are WebGL2.

**Is a software adapter allowed to answer this?** Here, yes, and the check is
not optional — `tlx.js` passes `softwareGL: softContent("shadow")` into the
shadow factory and `softContent` is TRUE in this container, which is exactly
the shape of "a software probe is not evidence about a player's machine". But
`tlx-shadow.js:33-35` only SHRINKS maps on that flag, it never skips the pass,
and the sun map is `isMobile ? 1024 : (softwareGL ? 512 : 2048)` — the mobile
branch wins, so the arm ran at **the same 1024² sun map a phone gets**. Only
`CAR_SIZE` (1024 -> 256) and `LAMP_SIZE` (512 -> 256) are under-sized here, and
both are true-desktop-only sizes irrelevant to the profile under test. A
pass that was stubbed out would have made the 40.4 MB meaningless; this one
is not.

### And it still does not close

95.8 MB is **exactly 2×** GLX's 48.0 MB — with shadows *and* environment
reflections both switched off. Two visible features surrendered, and TLX is
still double the backend that already fits. The remaining ~48 MB over GLX is
not attributable to anything this round found a lever for.

So **the phone gate in `tlx.js` does not move.** A knob that gets a handset from
149 MB to 96 MB is worth having and is not worth flipping a default over: the
number that matters is whether the tab survives iOS jetsam, this container
cannot answer it (§2n said so and it is still true), and 2× the known-good
backend is not the side of that line to guess from.

### What shipped

`apex26.tlxShadowOff` — a MEMORY lever, sibling of `envProbeOff` /
`perChunkOff`, off by default, reachable by a player who has already opted in
with `apex26.tlxMobile=1`. It is also the instrument: the 40.4 MB above cannot
be re-measured without it.

Visual cost, since a memory knob that quietly removes a feature is a trap —
measured, not eyeballed, because the eyeball got it backwards (the OFF frame
reads "flatter and brighter"; it is 5.8/255 DARKER). Same camera, same park
frac, both arms confirmed TLX/webgl2/lite/mobile, zero page errors:

| | |
|---|---|
| pixels differing > 2/255 | 1,158,921 of 1,316,640 — **88.0 %** |
| mean delta of those | 9.3/255 |
| max delta | 166/255 |
| mean luma ON -> OFF | 76.8 -> **71.0** |

The amplified diff (`artifacts/shadow-diff.png`) puts the change on every lit
surface — road, grass, car body, tree canopies — not on discrete cast-shadow
shapes. The pass contributes a shading term to the whole image, so dropping it
flattens and darkens the scene globally. 40.4 MB buys a visible difference on
88 % of the frame; this is a real trade, not free memory.

**The shot needed its own instrument.** `gfx-probe` cannot take it:
it uses `locator.screenshot`, which waits for the element to be stable across
two animation frames, and a TLX page on SwiftShader does not land two rAFs
inside the 46 s budget — 3/3 retries died in "waiting for element to be
stable" while the scene was already frozen by `park()`. `page.screenshot` with
an explicit clip does no such wait (`scratch/cockpit3/shadow-shot.mjs`). One
more entry for §0's list of instruments that report a renderer problem when
they have a harness problem.

### The transferable bit

The three arms that mattered were all *subtractive*, and each one is a pass the
renderer can be told not to run. When a heap is dominated by "the framework's
own machinery", the cheapest decomposition is not a profiler — it is turning off
one pass at a time and re-reading `usedJSHeapSize`. Two knobs and forty minutes
attributed 53 MB of 101; a heap snapshot of three's internals attributed none of
it in three previous sessions.

## 2t. All four render paths, measured on a real GPU for the first time (2026-09-02)

`gpu-census.yml` run 25, `macos-latest` (Apple silicon / Metal), commit
`64a98dd`, job green. This is the first census whose appearance column carries
numbers: until the fix in §2l, `tools/gpu-game-check.mjs` never wrote
`out.frame`, so `meanLuma` printed `n/a` on every leg of every run.

```
census anyHardware: true
webgpu  ok=true gpuErrors=0 envFail=0 envReady=false softAdapter=false meanLuma=46.9   TLX -> three/WebGPU
webgl2  ok=true gpuErrors=0 envFail=0 envReady=true  softAdapter=false meanLuma=66.2   TLX -> three/WebGL2
glx     ok=true gpuErrors=0                                            meanLuma=67.8   GLX  (the default)
wgx     ok=true gpuErrors=0                                            meanLuma=76.4   WGX  (native WebGPU)
        wgx: bound=true softPresent=true headlessUa=true (expected under a headless UA)
```

Four paths, four non-blank frames, zero GPU errors. Before this run the same job
could only say "no errors" — which it also said on the day it rendered nothing,
because there was no pixel to disagree with.

### What it settles

**WGX binds and renders on hardware.** `bound=true`, no `softAdapter`, luma
76.4. Every in-container claim that WGX showed a frozen canvas or the wrong
framing was a SwiftShader artifact from a screenshot taken without
`GLX.awaitSoftPresent()` (the trap `tools/gfx-probe.mjs:301` already guards
against and an ad-hoc CDP `Page.captureScreenshot` does not). Those claims are
retracted.

`softPresent=true` here is not a defect: WGX sniffs a HeadlessChrome UA as
software and blits by design, so a headless hardware run proves bind + render
and says nothing about the swapchain. Only a HEADED hardware run proves that
path, and the Verdict step already encodes the distinction.

### The open lead — a 30% luma gap between three's two backends

TLX renders the identical scene at 46.9 on WebGPU and 66.2 on WebGL2: same
commit, same machine, same track, same TSL materials. GLX (67.8) sits with the
WebGL2 leg, so the odd one out is three's WebGPU backend alone.

The likely mechanism is in the same row: `envReady=false` on the WebGPU leg,
`true` on the WebGL2 leg. `tlx.js` gates the environment cube on `envReady`, so
a leg whose 6-face probe has not latched renders with no image-based ambient —
a darker frame, in the direction measured.

**This is NOT yet a defect, and the confound is named:** the WebGPU leg ran 33 s
against the WebGL2 leg's 45 s, and the env bake is progressive across frames.
`envFail=0` and `gaveUp=false` say it was still working, not that it failed. To
settle it, hold the WebGPU leg until `envProbeReady()` and re-read luma; if the
gap survives an equal soak it is real, and the census should GATE on `envReady`
rather than only reporting it — the same reporting-not-gating class as §2l.

### On WebGPU alternatives, since the question was asked

Surveyed three.js WebGPURenderer vs native WebGPU, Babylon 9, PlayCanvas and the
2026 migration write-ups. Nothing argues for a change. Safari 26+ ships WebGPU on
iOS, so both opt-in backends are live on a phone. The write-ups agree with what
was measured here directly: three carries higher per-object metadata overhead,
which is exactly what OOM-killed the tab on iOS before §2n and §2p. Babylon and
PlayCanvas are full engines with build steps — adopting either means discarding
GLX and the no-build constraint. The right phone WebGPU path is WGX, which
already exists.

## 2u. The renderer cached the canvas size and never noticed the viewport move (2026-09-02)

Reported as "the WebGPU path shows the garage from outside, so too far". It is
not a WebGPU defect. It is in **GLX, the default WebGL2 backend every visitor
runs**, and it needs a VIEWPORT CHANGE to appear — which is why several probes
found nothing: each booted at one size and stayed there.

### The measurement

One page, no reload (`boot=852217` on every row), walking orientations in the
garage (`artifacts/aspect-verdict.log`):

```
start   1280x720   true=1.7778  loop=1.7778  buf=1280x720   ok
portrait 390x844   true=0.4621  loop=1.7778  buf=1280x720   STALE (a hand-called resize() did not fix it)
landscape 844x390  true=2.1641  loop=2.1641  buf=844x390    ok
portrait 390x844   true=0.4621  loop=2.1641  buf=844x390    STALE (a hand-called resize() did not fix it)
landscape 844x390  true=2.1641  loop=2.1641  buf=844x390    ok
back    1280x720   true=1.7778  loop=1.7778  buf=1280x720   ok
```

`GLX.aspect` holds the PREVIOUS viewport's ratio. Two container explanations are
excluded by the data rather than by argument: the same boot id on every row rules
out the `webglcontextrestored` reload in `glx.js`, and a perfect alternation with
orientation rules out a random SwiftShader context loss.

`artifacts/aspect-why.log` names the mechanism:

```
PORTRAIT css=390x844 rect=390x844 hiddenAncestor=null true=0.4621
         loop=1.7778 | plain resize()=1.7778  synthResize=0.4621  synthOrient=0.4621
```

`hiddenAncestor=null` and `rect == css` rule out a hidden or mis-measured canvas.
Dispatching the exact `resize` event `markCssDirty` listens for corrects the
aspect on the very next `resize()` call.

### Why the flag was not enough

The cache is deliberate and its reason is sound: `clientWidth`/`clientHeight` are
layout reads at the top of every frame and the HUD dirties layout constantly, so
reading them per frame forced a reflow every tick. `watchCanvasSize()` wires
`markCssDirty` to `resize`, `orientationchange` and a `ResizeObserver`.

The defect is that the flag is **edge-triggered and consumed unconditionally**.
One `resize()` that lands before the canvas box has reflowed caches the old box,
clears the flag, and nothing sets it again. `cssSize()`'s only other escape is
the `cssW <= 0` zero-guard, which a laid-out canvas never trips. The leading
suspect for who reads too early is `game.js`'s own
`window.addEventListener("resize", () => gfx.resize())`, which runs
synchronously inside the resize event — but that is a hypothesis and the fix
does not rest on it.

### It is not a garage bug

Eight sites read `aspect`, and the garage fit distance is the mildest:

| site | effect of a stale aspect |
|---|---|
| the main scene projection | the whole world stretches |
| `fovYCap` | wrong horizontal-FOV cap, so wrong vertical FOV |
| `_farCull` frustum cull radius | **a too-small aspect under-sizes the cull sphere and pops geometry out of the world while driving** |
| `spFitD` (garage) | the reported symptom |
| setup-preview projection, agent-view projection, agent-view grid rows | mis-framed |

### The fix: `cssSize()` verifies instead of trusting

Keep the cache and every listener; add a bounded re-check keyed on
`window.innerWidth`/`innerHeight`. Those are VIEWPORT metrics, not element
layout, so reading them per frame does not force the reflow the cache exists to
avoid, and they move at the same instant the box does whatever order the events
arrive in. A change arms a countdown of 30 FRAMES during which the box is
re-read, so a read that was too early self-corrects on the next one.

Two shapes were rejected, each by a measurement rather than by argument:

- **A one-shot re-mark.** It caches the old box AND records the new viewport,
  after which nothing differs and the staleness latches exactly as before.
- **A 500 ms wall-clock window.** Shipped, measured, and it left one rotation of
  six still stale (`artifacts/r16-accept.log`) — on a box where a frame can take
  seconds the window expired before the render loop ran a single frame. The
  signature had flipped, which is what gave it away: before the fix a
  hand-called `resize()` could not correct the aspect, and with the window a
  hand-called `resize()` fixed it instantly, so the cache was already sound and
  the problem was that no frame had run inside the window. A countdown of CALLS
  is immune: N calls is N frames however slow they are, and at 60fps it is the
  same half second.

The first observation records the viewport WITHOUT arming — there is nothing to
differ from at boot, and arming there makes the frames right after `init()`
re-read the box for no reason. `webgpu-lifecycle.test.mjs` already pinned that
for WGX ("unchanged frames must not force canvas layout reads") and caught this
version of the fix doing it.

Also folded in: GLX now has WGX's `_canWatchCss` fallback (with no listeners
attached at all it never trusts the cache), and TLX's `ResizeObserver` moved
outside its `addEventListener` check — an engine with one and not the other was
getting no invalidation signal at all.

Applied to all three backends. Cost is ~30 forced reflows spread over half a
second, only right after a viewport change, when the browser is reflowing anyway.

### Two observations left open

Neither is explained, and the fix is deliberately chosen to be correct without
knowing either:
- the main menu tracked every viewport correctly in the same walk
  (`artifacts/aspect-latch.log`) while the garage did not;
- which of the three invalidation signals is the one arriving early.

### Nothing in the suite could have caught it

`tests/specs/ui-resize.spec.js` was the only live-resize spec, and it calls
`headless(true)` so no frame renders during its resize walk — its own comment
already conceded that this "leaves rendering ... untested". `tlx-probes.spec.js`
read `GLX.aspect` and asserted only `> 0`, which a stale value passes.
`agent-view.spec.js` compares the ASCII grid against a value itself derived from
`gfx.aspect`, so a stale aspect is self-consistent and passes. A grep for
`canvas.width` or `drawingBufferWidth` across `tests/` returned zero hits: the
suite had never read the backing store.

Now guarded three ways, each sabotage-proven: a behavioural node test on the
WebGL2 mock driving the exact too-early-read sequence (and asserting the window
CLOSES, so the cache is still a cache); shape pins for WGX and TLX; and one live
test in `ui-resize.spec.js` that keeps the render loop running and asserts
`GLX.aspect` equals the canvas's own live box across five viewport changes.

## 3. Left on the table

The pre-08-18 narrative behind this list — the O(n²) AI scans that were
traced and left alone, the `wheel` listener that is load-bearing, the ten
"render leftover" dummy-producer gates, the boot-wall / code-cache / `defer`
analysis and the boot A/B run that was VOID — moved verbatim to
[archive/research/PERF-LEDGER-2026-08.md](archive/research/PERF-LEDGER-2026-08.md)
on 2026-09-01. What stays here is what source comments and tests cite by name,
each with its status, and the open list.

The env-probe 300 m cull and world-then-sky order already shipped — see
**Stale entry corrected** above. Do not re-open that item from this list.

**Two `Δprog` wraps with no pre-reject** — the traffic-awareness and lateral
separation scans in `updateCar` paid two `Float64Mod` per pair to discard
(**129 of 2575 samples = 5.01 %** of physics CPU, line-attributed).
> **SUPERSEDED 2026-08-18.** Both scans pre-reject before wrap (windows
> 34.1 m and 6.5 m), same form as `pairContact`. Bit-identical with a 0.1 m
> margin. Do not re-implement, and do not merge the two loops (declined:
> ~0.05 % of a core, and it risks racing behaviour).

**AI brake-look + traits allocated every physics step** (~20 cars × ~12
objects × 60 Hz ≈ 14 k short-lived objects/s).
> **TAKEN 2026-08-18 / 2026-08-19.** `AiDrive.traits` / `brakeDecision`
> write reused scratches; `beginLook` / `pushLook` / `endLook` recycle the
> look-ahead rows; the eight call-site ctx literals in `updateCar` became
> `_ai*` scratches. Guarded by `tests/unit/ai-drive.test.mjs` and
> `tests/specs/physics-hotpath.spec.js`. Do not re-introduce object literals
> at those call sites.

**`massBlocked` was O(buildings²)** (`js/track/tracks.js`; ~420k inner
iterations on vegas, 419 on monza).
> **SUPERSEDED 2026-08-18.** 24 m XZ grid (`MASS_CELL`, incremental
> `massGridInsert` on `massAdd`). SAT stays exact; only candidate gathering
> is culled.

**Emitter ring recomputation** (`js/track/geom.js`: `addCyl` / `addCone` /
`addFrustum` called `lo()` three times per segment where two suffice).
> **SUPERSEDED 2026-08-18.** Ring ends cached once per segment. Keep the
> angle as `(i+1)/seg*6.2832`, **not** `(i+1)%seg` — 6.2832 ≠ 2π.

**Typed accumulators for the props buffers** (`pos` / `nrm` / `col` / `mat` /
`idx` were plain arrays grown by `push`, ~27 M push arguments on vegas).
> **TAKEN 2026-08-18.** `TrackModels.scratch()` / `makeAccum` grow Float64
> and Uint32 (`idx`) with named-arity `push`; `sealGeometry` copies to
> exact-length typed arrays before `validateGeometry`, which accepts
> `BYTES_PER_ELEMENT` views. A variadic `push()` shim measured SLOWER than
> native; stages from `emptyBuffer()` stay plain arrays.

**Frame-invariant uniforms — the tuner-knob upload cache** (~95 tuner
uniforms re-uploaded per frame across `begin()`, `drawSky()` and the
composite; honest arithmetic ~0.05 ms, hygiene rather than a win).
> **TAKEN 2026-08-18 (GLX).** `uf1` / `_litUf` / `_skyUf` / `_compUf` skip
> equal tuner-knob re-uploads; `envFaceBegin()` + the main `begin()` share
> the same scalars in one game frame (WebGL uniforms persist on the
> program). View / eye / env / lights / time / grainTime still upload every
> call. WGX writes a whole UBO per `begin()` — no per-field skip. Do not
> invent a millisecond claim from this.

**Stream the chunk system, so TLX can run on a phone** — ~~the one thing that
would undo §2m's decline~~. **WRONG, and withdrawn 2026-09-02 (§2n).** Written
from an inference — "483 chunks built up front" — that was never measured. When
it was: a chunked mesh shares ONE position/normal/colour/mat set across all its
chunks and carries only the INDEX per chunk, so build-near/drop-far can free
the index half and nothing else. Montreal's entire track geometry is 13.89 MB
and its per-chunk index total is **1.24 MB** — against a 53.7 MB gap. The
streaming work would have been weeks for about a fortieth of the target.

What the bytes actually were, once `__tlx.geoCensus()` existed to ask:
49.84 MB of deduped live attribute data, half of it Float32 holding values that
never needed 32 bits. Taken in §2n — 49.84 → 28.68 MB — by packing rather than
streaming.

**The ~48 MB that is still unattributed** (§2q). On the iPhone profile TLX is
149.0 MB to GLX's 48.0. The shadow pass is 40.4 of the gap and the env probe
12.8 — both now switchable, both measured — and with BOTH off TLX is still
95.8 MB, almost exactly double GLX. Nothing in three rounds of heap snapshots
has attributed that remainder; the two things that did attribute anything were
subtractive A/Bs over whole render passes, so the next attempt should be more
of those (the post chain, the TSL node graphs per material, the mesh pool) and
not another snapshot. Until it is attributed the phone default stays GLX — 2x
the known-good backend is not a margin to guess iOS jetsam from.

**Road and terrain had no frustum cull in any pass.** Counted by binning the
ribbons into the same 72 m cells `createChunkedMesh` uses (a frustum with far
plane R is a subset of the sphere of radius R, so these are **lower** bounds):

| pass | vegas | spa | monza |
|---|---|---|---|
| ribbon tris submitted, camera pass | 78,676 | 116,940 | 108,722 |
| provably outside the 900 m far plane | **53 %** | **43 %** | **45 %** |
| provably outside the ±80 m shadow ortho | **89 %** | **88 %** | **89 %** |

> **SUPERSEDED 2026-08-17.** Camera-pass road AND terrain lazy-build
> `*Chunked` under the baked 300 m env-probe cull + `PerfGov.tier() < 3`
> (`js/game.js` drawWorldMeshes); shadow ribbons were already chunked. The
> table remains a valid *pre-chunk* reach measurement — do not re-derive
> "unreachable" from it. `frameCullDist` is read only inside the chunked
> path, so the env-probe cull never touched a ribbon triangle via `draw()`.

**`uCarReflect` was not shed with `po.reflect`** (tier 2 still ran the
car-paint SSR march).
> **SUPERSEDED 2026-08-17.** `po.carReflect = tier >= 2 ? 0 : undefined`
> in `game.js`; `glx/post.js` prefers `opts.carReflect`. Do not re-open.

**Boot wall — the parts that shipped.** Per-file content-hash `?v=<sha>` (a
bump no longer cold-compiles every script); the eight `readyState ===
"loading"` guards became `!== "complete"` (the prepared form for `defer`);
`Tracks.LIST` `points` is a lazy getter (the 24.0 ms all-40-circuits
Catmull-Rom boot cost). `defer` itself and the 346 KB dev surface continued
in the 08-18 hunt below.

**Still open** (repeated at the end of every leftover round; do not re-open the
08-18 union banner items): lazy circuit tags, script-tag `defer`, WGX
whole-UBO skip, TLX road `trk` so `chunkedTrackCoords` can flip on. Any boot
A/B needs a quiet box (`loadavg < 2`), a do-nothing control arm, rotated arm
order, and the MINIMUM reported beside the median — the ledger records how the
first attempt was VOID without those.

### Added 2026-08-18 — hunt after the 08-17 board shipped

Re-walked the 08-17 survey against cache **1388**, then merged deploy tip
`11d972d2` (cache **1421**). Full board:
[research/PERF-HUNT-2026-08-18.md](research/PERF-HUNT-2026-08-18.md).

Boot wall **at 1655 (2026-08-29):** **156** tags, **3,633,081 B** (3.55 MB) —
down from **157 / 5,082,769 B** the same day. **1,415 KB, 28.5%**, in one round:

| move | KB | how |
|---|---|---|
| circuit `scenery: function (api)` × 40 | 1,083 | `js/circuits/scenery/<id>.js`, LAZY_SCENERY |
| `light-presets.js` | 338 | LAZY_RACE |
| `defer` on all 157 tags | 0 | stops blocking the parser |

The two lazy payloads need DIFFERENT mechanisms, and the reason is worth
keeping. Presets need **no gate**: `light-store.js` reads `window.LightPresets`
at call time, so an absent file resolves to TUNE_DEFS defaults and
`applyLightTune()` re-walks the knobs when it lands. Scenery needs a **real
gate**: `Tracks.build()` is synchronous and every `loadTrack()` caller touches
`track` on the next line, so the closure must be resident BEFORE the call —
hence `ensureScenery()` awaited at the three entries that can reach a circuit
not yet built (menu flyby, `startRace`, `openQuali`).

**The trap, measured.** FIVE separate harnesses load circuits with
`readdirSync(CIRCUITS_DIR).filter(f => f.endsWith(".js"))`, which does not
descend into the new subdirectory. A harness that misses it builds every
circuit BARE and still reports confident numbers: `tools/float-audit.cjs` put
cota at **3,988 prop cells instead of 32,897**, which surfaced as
`scenery-grounding` "floating scenery grew" — i.e. it reads as a scenery
REGRESSION, not as a missing include. Four of the five had to be found by
chasing red tests. `load-order.test.mjs` now asserts that any file which runs
circuit files also loads `LAZY_SCENERY`, reading source with comments stripped
(the first cut of that guard was satisfied by the word appearing in its own
explanatory comment).

**And it shipped a silent offline regression (fixed 2026-09-01).** `sw.js`
builds its precache from the shell's `<script>` tags plus an explicit
`optional` list. Taking 41 files off the tags took them out of the install with
nothing putting them back, so an installed PWA that went offline requested
`js/circuits/scenery/<id>.js?v=<build>`, missed, and — because
`loadBackendScripts` sets `el.onload = el.onerror = resolve` — carried on and
built the circuit BARE. No exception, no console line, no red test.

The lesson is that **the boot wall and the precache are the same list read
twice**, so any move off one is a move off the other unless it is put back
deliberately. Both new rosters are now seeded `optional` (not `essential`: an
install must not fail over a circuit the player may never race) and stamped
`?v=<build>`, because the injector requests them with that query and the SW
matches without `ignoreSearch` — a bare key is one nothing ever asks for.
`load-order.test.mjs` now asserts both: that every `LAZY_RACE` / `LAZY_SCENERY`
file is seeded, and that the SW's own stamping predicate — extracted from
source and RUN, not pattern-matched — covers every path it seeds.
`tools/offline-precache-check.cjs` is the behavioural half; see its README row
and `docs/TESTING.md` for why `setOffline(true)` alone measures nothing here.

**Round 16 (2026-09-01): 3,715,772 -> 3,319,340 B, another 396,432 B / 10.7%,
in two lifts.** `js/data` (154,412 B, 8 files) and `js/net` (242,020 B, 11
files). 156 tags -> 137. Cumulative over rounds 15-16: **4,964 KB -> 3,241 KB**.

They needed different mechanisms, and the reason is the general rule for this
lever. `js/data` is an ISLAND — eight globals, and nothing outside the
directory names any of them except `DataHub.init/.open` and one already-guarded
`typeof F1API` — so it can simply be absent until the DATA button asks for it.
`js/net` is the opposite: `netPlay` is called at 20 sites in game.js and only
three are `netPlay && …` guarded, with `netPlay.tick()` in the frame loop. The
choice there was 17 new guards scattered through the loop and the result path,
or ONE inert null object; the null object wins because a missed guard is a
crash mid-race while a missing stub member is a red test.

**The stub's dangerous line is not a method, it is a VALUE.**
`ownsRaceControl`/`ownsClassification` are `!active || role === "host"` in
js/net/netplay.js, so with no session they are TRUE — a solo game owns
everything. A stub returning false there would silently stop a solo race
classifying its own result: no crash, no console line.
`tests/unit/net-stub-surface.test.mjs` pins both, checks them against the real
module's shape so it cannot pin a fossil, and derives the rest of the required
surface from the CALL SITES rather than a hand-written roster.

**Measured, and the measurement needed a control.** VS FRIEND from the menu
loaded the bundle in **39.7 s** on this box — alarming until decomposed: 11
files, **150 ms of actual fetch**, 19.5 s from first request to last byte. The
same click with `#game` hidden: **0.1 s**. It is the rAF starvation
docs/TESTING.md already records (an identical click at 80-113 s rendering,
0.3-0.6 s not), not the payload — and the 241 KB it parses is the same parse
boot used to pay unconditionally, now paid by the players who ask for it.

Boot wall **at 1421:** **153** `src=` tags, **5,909,851 B** (5.91 MB).
`apex.js` + `agentview*` is **350,083 B** of eager dev/test surface.
Circuit IIFE parse is still cheap; LIST `points` is already a lazy getter.

**Taken on deploy after the 1388 write-up:** TLX shadow `count`,
content-hash `?v=<sha256>` + `readyState !== "complete"`, typed
accumulators, `massBlocked` grid, emitter `lo()` cache, baked PerfTry ON
paths. Do not re-open those from the hunt file.

**Taken 2026-08-18:** WGX `_flushShadowModelUBO` — one `writeBuffer` per
shadow pass, same ring as `_flushDrawUBO`. Same pass also batched
`_writeQuadFx` / `drawDecal` via `_flushLitRings()`. `apex.js` +
`agentview*` are `LAZY_AGENT` (no tagged script; Pages players skip
~350 KB). DebrisWorld skips `world.step` when live bodies are asleep and
no car is in `FURN_WAKE_M`, with JS despawn + panel `force = 0` hoisted.

## 4a. The main-menu layout shift was a CSS rule defending a state that never happens (2026-08-29)

Measured earlier this session: a **0.0681 layout shift at +784 ms** on the title
screen, on top of the one already fixed by pre-painting `data-shape`.

The culprit was `#mb-career-sub:empty { display: none; }` (`css/menus.css`),
whose own comment explained it:

> The live save line is empty (and therefore zero-height) until a save
> exists, so a first-time title screen is exactly as it was.

**That comment was stale against the code beside it.** `refreshCareerButton`
(`js/game.js`) never leaves the line empty — a player with no save gets a
literal:

```js
if (!c) { sub.textContent = "DRIVER CAREER  ·  MY TEAM"; return; }
```

So the "first-time player sees a blank line" state the rule was defending
**does not exist for any player**. The rule could only ever apply in the window
between first paint and game.js's tail running, where it collapsed the button —
which then grew when the text arrived. The rule produced the exact shift it was
written to prevent, and the stale comment is why it survived: reading it, the
fix looked like it needed a design call about the first-time look.

The fix needed no invention, because **the sibling button already did it
right**. `#mb-season`, in the same row, ships its sub-label statically
(`<span class="mb-sub">A CHAMPIONSHIP, YOUR RULES</span>`) and
`seasonUi.refreshTitle()` only rewrites the button's own text node — a width
change on one line, never a height change. CAREER was the only button in the
row shipping an empty sub, and the `:empty` rule was written for it
specifically (`#mb-career-sub`, not `.mb-sub`). Making CAREER match SEASON:

- shell ships `DRIVER CAREER  ·  MY TEAM` inside the existing span (no new DOM
  nodes, so the `NODE_CEILING` ratchet is untouched);
- the `:empty` rule is replaced by one-line containment (`nowrap` + ellipsis),
  so the longer returning-player string (`YOU · MERCEDES · 2026 R5 · 2 SAVED`)
  cannot wrap and reintroduce a smaller shift.

**The transferable lesson is about the comment, not the CSS.** A rule justified
by a state the code makes unreachable is invisible to every test — nothing
asserts "this selector still matches something" — and its comment actively
argues against investigating it. When a comment explains why a defensive rule
exists, check that the state it defends is still reachable.

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

> **SUPERSEDED 2026-08-17.** Instancing is live on the race path
> (`game.js` → `propBatches`); GLX/WGX/TLX element-copy (no `.subarray`);
> dual-sig cull cache skips redundant GPU uploads when the frustum is unchanged.
> Do not defer work based on the “tests only” line above.

## R5 — per-chunk lamps: shared bake, WGX native, ULTRA-night default (2026-08-27)

SwiftShader is the CPU oracle throughout; wall-clock rAF means GPU-blocking
cost on GLX (GL blocks in draw calls) but only CPU-side cadence on WGX
(Dawn queues asynchronously — its truth is validation + pixels).

| circuit | backend | off ms/f | perChunk 0.3 ms/f | delta | first-on (bake) |
|---|---|---|---|---|---|
| vegas | GLX | 7910.6 | 6441.8 | **-18.6%** | 7874 ms (≤ one off-frame — bake is free) |
| singapore | GLX | 7478.1 | 5719.1 | **-23.5%** | 7034 ms (ditto) |
| vegas | WGX | 16.6 (rAF) | 16.1 | CPU-neutral | 37.3 ms |
| singapore | WGX | 16.8 (rAF) | 16.7 | CPU-neutral | 25.9 ms |

- Look: GLX luma 70.2→73.8 (vegas), 60.1→65.2 (singapore) — brighter as
  designed (more lamps genuinely reach), no wash-out.
- WGX: gpuErrors 0 at knob 0.3 AND 1.0; watchdog guard (cockpit + knob=1,
  10 frames) completed in 181 ms both circuits — the round-1 380%-CPU /
  22-minute shape did not reproduce. Pixel gate: gfx-probe webgpu vegas
  PASS (#game road coverage 43.6%, roadLutReady).
- Commands: mcp-cli raw batches (detached page-side measurement + pollers,
  MCP_CLI_TIMEOUT_MS=170000) in artifacts/r5-{glx,wgx}-ab*.log;
  node tools/gfx-probe.mjs --backend webgpu --lite vegas.
- DECISION: ULTRA-night conditional layer ships `perChunkLights: 0.3`
  (light-presets.js "*|night"), predicate in light-store condLayer.

roadChunkLamps def->1 decision input (next round): reachable lamps per
72 m road cell at default knobs — abudhabi 12, jeddah 14, vegas 10,
qatar 25 (ONE cell over CAP 24 by one lamp), baku 10, singapore 12,
bahrain 16 (artifacts/r5-road-lamp-count.txt; harness in the session
scratchpad). Capacity says def->1 is safe everywhere except one qatar
cell dropping its single FARTHEST-reaching lamp at a boundary.

## 5a. Portrait: the canvas already filled; the touch dock was visible and inert (2026-08-30)

Two reports off one phone screenshot (iPhone, **Home Screen / standalone**):
portrait "doesn't fill my screen", and driving + HUD buttons don't work there.
They turned out to be one real defect and one misattribution, so they are
recorded separately.

### The buttons: one media query, and a failure mode a screenshot cannot see

`#hud` is `pointer-events: none` (`css/hud.css`) — a deliberate pass-through
layer, so **every** control under it must grant itself `auto` or it renders
perfectly and swallows nothing. All of those grants — `.dock`, `.dock-grp`,
`.dock .touchbtn` — lived inside one `@media (orientation: landscape)` block in
`css/overlays.css`. The portrait ladder is the BASE layout in that file and is
authored and measured ("428px fits with 239px to spare"), so in portrait the
buttons drew at their correct coordinates and passed every press straight to
the canvas.

Measured at 393×852 with the 59/34 notch insets injected:

| element | rect | `pointer-events` | hit test |
|---|---|---|---|
| `#btn-throttle` | 16, 726, 76×76 | **`none`** | blocked by `#rotate-device` |
| `#btn-brake` | 16, 642, 76×76 | **`none`** | blocked by `#rotate-device` |
| `#pausebtn` | 331, 67, 52×52 | `auto` | blocked by `#rotate-device` |
| `#btn-cam` | 307, 114, 76×52 | `auto` | blocked by `#rotate-device` |

Note the two columns disagreeing. `#pausebtn` and `#btn-cam` are not `.dock`
children, so they kept `auto` and were only ever hidden by the blocker; the two
dock buttons were inert *underneath* it. Delete the blocker alone and half the
controls stay dead — which is why **the oracle here has to be
`document.elementFromPoint` at the button centre, not a screenshot**. A
screenshot of the broken build and a screenshot of the fixed build are
identical. The same trap as the vacuous GPU gate in §2e: the instrument
returned a plausible value for a state it could not distinguish.

The fix is one line, moved: `pointer-events: auto` now sits on the base
`.touchbtn` rule, with the landscape block keeping only what is genuinely
landscape (row layout, `--tap`/`--hold` down-sizing, `zoom: var(--hud-z-dock)`,
the 3×2 `.hud-bottom` grid).

### Steering felt twice as sharp, off one `innerWidth`

`touchRangePx()` in `js/game/input.js` scaled the anchored-drag range by
`innerWidth`. That is the LONG edge in landscape and the SHORT edge in
portrait, so the identical thumb gesture meant twice as much lock the moment
the phone turned: `393 x 0.12` = 47.2px to full lock against `852 x 0.12` =
102.2px. Not broken, but unusable at speed, and it would have read as "portrait
driving is bad" rather than as a units bug.

Keying the range off `max(innerWidth, innerHeight)` makes it orientation-free
and leaves landscape bit-identical, because landscape's long edge already IS
`innerWidth`. Measured live on the same build, `Input.debugState().touchRangePx`:

| viewport | before (arithmetic on the old formula) | after (measured) |
|---|---|---|
| 393x852 portrait | 47.2 | **102.24** |
| 852x393 landscape | 102.24 | **102.24** |

`tests/specs/touch-steer.spec.js` reads the range out of `debugState()` and
asserts ORDER and bounds rather than pixel counts, so it covers the new value
without a retune — which is exactly why it was written that way.

### Nothing in the engine was orientation-gated

Worth recording because it is the natural suspicion and it is wrong. The
fixed-step loop has no orientation term; `#rotate-device` is `{gate:false}` in
`js/game/uilayers.js`, so keyboard and canvas-drag steering already drove
straight through the blocker; and the tilt axis mapping already handles all
four screen angles with portrait as its `default` case (`js/game/input.js`).
Portrait racing was blocked by exactly one CSS rule and one opaque div.

### The blocker stays; portrait becomes an opt-in

`#rotate-device` exists for a real case — a phone rotation-locked *mid-race*
(`tests/specs/rotation-recovery.spec.js`) — so it remains the default. It gains
a third button, `#rotate-race` "RACE IN PORTRAIT", which sets `body.rotate-ok`
and persists `apex26.portraitOk`; the blocker rule in `css/responsive.css`
gains `:not(.rotate-ok)`. The class deliberately reuses the existing `rotate-`
family (`rotate-inner`/`-icon`/`-help-open`) so `component-inventory` needs no
new `docs/COMPONENTS.md` row.

After clicking it (the player's path — `el.click()`, not a faked class): blocker
`display: none`, `apex26.portraitOk` = `"1"`, and `btn-throttle`, `btn-brake`,
`pausebtn`, `btn-cam` all hit-test **HIT**. `manifest.json` `"orientation"` goes
`"landscape"` → `"any"`, since a platform that honours the lock would otherwise
make the opt-in unreachable.

### The "doesn't fill" half — NOT a canvas bug, and NOT fixed

Measured, and the honest answer is that the shell fills exactly. At 393×852 in
both menu and race, `#game` and `#overlay` are both `{x:0, y:0, w:393, h:852}`,
with `--sat` 59 / `--sab` 34 resolved and honoured; `fit-audit` reports no
clipping at 393×852, 375×667 or 430×932. `viewport-fit=cover` is present, `#game`
is `position: fixed; inset: 0` with no aspect clamp or letterbox, and there is
no stale `--vh` JS shim anywhere in the tree. The usual iOS cause — Safari never
retracting its chrome because `html,body{overflow:hidden}` kills the root
scroll — does not apply in standalone.

What reads as bands is two cosmetic facts stacking:

1. `.screen` pads by `--safe-t` (`--sat` + 12px `--gut` = 71px at this notch),
   which is correct for a dialog but shows near-black `--bg` above the panel.
2. `--compact-at: 600px` means an 852-tall phone classifies as
   `data-density="normal"`, so the `tall`+`compact` stretch rule in
   `css/menus.css` does not match and the panel stays centred with `--bg` above
   and below.

Neither was changed in this round. Both are `.screen`-level layout, and moving
`.screen` padding moves the landscape pixel goldens in `menu-baseline.spec.js`
— a browser group this change does not otherwise need. Left on the table with
the mechanism written down rather than guessed at later.

### One pre-existing overflow, ruled out rather than assumed

`fit-audit` on this tree reports `#mb-season.bigbtn` overflowing its parent by
8.8px at 375x667 (and 14px at 932x430, 4px at 1024x768). The obvious suspicion
was §4a's career sub-label, which now ships text with `nowrap` in the same row.
It is not: measured live at 375x667, `#mb-season`'s right edge sits at 342.5
against a parent right of 333.8 in **all four** states — as shipped, with
`#mb-career-sub` emptied, restored, and re-wrapped. The overflow is independent
of that label and predates it. It also does not clip (342.5 < 375 viewport), so
it is a container overflow, not lost pixels. Left for a menu-layout round; noted
here so the next reader does not re-suspect §4a.

### Two instrument notes

`page.click("#rotate-race")` timed out at 30 s with the locator resolved and
the log reading "element is visible, enabled and stable". The tempting reading
is a layout problem — `.rotate-icon` animates `transform: rotate()`. It is not:
that transform does not affect layout, `elementFromPoint` at the button centre
returns the button itself, and this is the second sighting of the shape already
written up in `docs/TESTING.md` §Field notes ("A saturated main thread looks
exactly like a missing element"). `el.click()` drives the same handler and is
the right probe under a live race.

`tests/specs/hud-layout.spec.js` excludes `.hud-top` × `#pausebtn` via
`HUD_LANDSCAPE_ONLY` on the strength of a measured 8.7px portrait overlap. At
393×852 that collision **does not reproduce** — overlapX is −43.9, i.e. 43.9px
of clearance. The exclusion is at some other viewport, so it stays, and no
claim is made here about having fixed it. An exclusion whose reason has moved
is still the vacuous-guard shape from §2e, but retiring it needs the viewport
that actually collides, measured.


## 2r. The first heap snapshot: it was never three's machinery (2026-09-02)

Every TLX memory number in §2m, §2n, §2p and §2q came from subtracting
`performance.memory` readings. A total is not an attribution, and §2n's closing
paragraph turned one into a conclusion — "the rest is three's own machinery and
the TSL node graphs" — that sent this round hunting a `RenderObject` /
`NodeBuilder` retention that does not exist.

A real V8 heap snapshot over CDP (`HeapProfiler.takeHeapSnapshot`, shallow
`self_size` aggregated by constructor), montreal, in race, iPhone profile
(844x390, `isMobile`, `tlxForceGL=1`), **`HeapProfiler.collectGarbage` first**:

| | TLX | GLX | gap |
|---|---|---|---|
| `JSArrayBufferData` | **49.43** | **17.82** | **+31.61** |
| `array` | 12.61 | 7.69 | +4.92 |
| every three object class combined | 5.79 | 2.04 | **+3.75** |
| `code` | 8.42 | 5.32 | +3.10 |
| `ExternalStringData` | 11.57 | 9.77 | +1.80 |
| total self_size | 99.41 | 48.89 | **+50.52** |

**Typed-array data is 63 % of the entire gap. Three's own object graph is 7 %.**
The node system is not the cost and never was; the CPU mirrors are, which is
what §2m found before §2n mis-attributed them.

### Forcing a GC moves TLX by a third, and GLX not at all

Same page, same 12 s settle, the only difference being the forced collection
before the read:

| | no GC | after GC |
|---|---|---|
| TLX | 149.0 | **96.8** |
| GLX | 48.0 | **47.5** |

So ~52 MB of what this document has been calling TLX's footprint was
uncollected garbage, and the retention ratio is **2.04x, not 3.1x**. Every
earlier figure here overstates TLX. That churn is its own mobile problem — GC
pressure and frame jank — but it is a DIFFERENT problem from retention and the
two must not be quoted as one number again. **Any heap instrument in this repo
forces a collection before reading, or it is measuring garbage.**

### The instrument, and what it caught first

`scratch/tlx/heap-attribute.mjs` (gitignored; the recipe is above and is four
CDP calls). Its first use was not the table — it was catching the fix written
FOR the table: a static-geometry mirror sweep that reported
`sweeps:0 geos:0 freedMB:0`. It had never executed, and the heap was byte-identical
with it in. That is §2m's frame-counter failure a second time, in the same
lever, caught only because the counters report what was FREED rather than that
the code ran. Do not ship a memory lever whose instrument cannot tell "did
nothing" from "never ran".