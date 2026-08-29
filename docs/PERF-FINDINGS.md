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
> builds Catmull-Rom control points for **all 40** circuits at boot (**24.0 ms**),
> and `js/game/apex.js` + `agentview*` is **346 KB of dev/test surface** no player
> reaches. Also note DCL 4712 ms predates the flyby deferral (`de5d202`) and has
> not been re-measured. See §3.

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
hits. DEFAULT OFF pending a real-GPU pixel run — the failure mode is props
drawn from the wrong resident pack, which is why the hit path deliberately does
NOT stamp `_cullPlanes` (that snapshot must keep describing whichever frustum
physically wrote the buffer). `gfx-backend-canary.test.mjs` now pins that.

`uniform1f` 167.4 is the ~30 frame-scalars in `begin()` times the 5-6 passes a
frame; low value, named so it is not mistaken for a per-draw leak.

## 3. Left on the table

Ranked by how much I would trust the estimate, most first.

The env-probe 300 m cull and world-then-sky order already shipped — see
**Stale entry corrected** above. Do not re-open that item from this list.

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

> **SUPERSEDED 2026-08-18.** `massBlocked` now uses a 24 m XZ grid
> (`MASS_CELL`, incremental `massGridInsert` on `massAdd`). SAT stays exact;
> only candidate gathering is culled.

**Emitter ring recomputation** (`js/track/geom.js`) — `addCyl` calls `lo(a0)` /
`lo(a1)` three times each per segment where two suffice; same in `addCone` and
`addFrustum`. The `addBox` half of this finding measured 1–4 %, so expect less.
Keep the angle as `(i+1)/seg*6.2832`, **not** `(i+1)%seg` — 6.2832 ≠ 2π, so
wrapping changes the last segment's coordinates.

> **SUPERSEDED 2026-08-18.** `addCyl` / `addCone` / `addFrustum` cache ring
> ends once per segment. Angle stays `(i+1)/seg*6.2832`.

**Typed accumulators for the props buffers** (`js/track/tracks.js`) — `pos`,
`nrm`, `col`, `mat`, `idx` are plain arrays grown by `push`, ~27 M push
arguments on vegas. Reported at 15–31 %. Three hard edges if attempted: a
variadic `push()` shim measured SLOWER than native (the win needs fixed arity);
`idx` must be `Uint32Array`; and `TrackModels.validateGeometry` gates on
`Array.isArray(geo.pos)`, so the props mesh ships EMPTY if that is missed.

> **TAKEN 2026-08-18.** `TrackModels.scratch()` / `makeAccum` grow
> Float64 (pos/nrm/col/mat — same values as the old Array fuse) and
> Uint32 (`idx`) with named-arity `push` (not rest/arguments).
> `sealGeometry` copies to exact-length typed arrays before
> `validateGeometry`, which now accepts `BYTES_PER_ELEMENT` views as
> well as `Array.isArray`. Stages from `emptyBuffer()` stay plain arrays.

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

> **TAKEN 2026-08-18 (GLX).** `uf1` / `_litUf` / `_skyUf` / `_compUf` skip
> equal tuner-knob re-uploads. `envFaceBegin()` + the main `begin()` share
> the same LIGHTING TUNER scalars in one game frame; WebGL uniforms persist
> on the program. View / eye / env / lights / time / grainTime still upload
> every call. WGX writes a whole UBO per `begin()` — no per-field skip.
> Do not invent a millisecond claim from this.

### Added 2026-08-14, second round

Ranked as above. **Provenance note:** the counts below came out of a read-only
audit pass and were NOT re-derived by hand afterwards, unlike everything in §2.
Treat them as this document treats operation-count estimates — see §1.

**Road and terrain never get a frustum cull, in any pass.** They are the only
large world meshes built with `G.createMesh` where their twin (props, glass)
gets `G.createChunkedMesh(…, 72)` — `js/track/tracks.js` builds both, a few
lines apart. `js/render/glx/chunked.js` only declines to chunk under 2000
triangles; road is 51-61 k tris and terrain 25-58 k, so the capability is there
and simply is not asked for. Counted by binning the ribbons into the same 72 m
cells `createChunkedMesh` uses and counting triangles within radius R of the
driver at 12 stations a lap (a frustum with far plane R is a subset of the
sphere of radius R, so these are **lower** bounds):

| pass | vegas | spa | monza |
|---|---|---|---|
| ribbon tris submitted, camera pass | 78,676 | 116,940 | 108,722 |
| provably outside the 900 m far plane | **53 %** | **43 %** | **45 %** |
| provably outside the ±80 m shadow ortho | **89 %** | **88 %** | **89 %** |

> **SUPERSEDED 2026-08-17 (render-audit follow-ups).** Camera-pass road AND
> terrain now lazy-build `*Chunked` under the baked 300 m env-probe cull +
> `PerfGov.tier() < 3` (`js/game.js` drawWorldMeshes). Shadow ribbons already
> chunked independently. The table above remains a valid *pre-chunk* reach
> measurement; do not re-derive “unreachable” from it.

Three things make this worth writing down rather than doing:

1. **The shadow half is bit-identical; the camera half is not.** The AABB-vs-
   light-frustum test is exactly the one `castShadowChunked` already applies to
   props, and a triangle outside the ortho writes no depth. But chunking
   reorders submission *within* the mesh, so coplanar LEQUAL ties inside the
   road could flip — the class of change `floorLast` would have been (draw the
   base floor last among opaque world meshes) already flags. That needs a
   rendered lap, not a frame.
2. **The fix already exists in the tree and is unreachable.** `js/game.js`
   lazily builds `track.meshes.roadChunked` and draws it via `drawChunked` —
   but only under `LT.roadChunkLamps && LT.perChunkLights`, a *lamp* feature
   that is default-off and now tier-shed. Same shape as the `uInstanced` entry
   in §2: a fix that existed and had not been copied across.
   (**Also superseded:** envCull now opens the camera path without lamp knobs.)
3. **It sharpens a §3 entry above.** `frameCullDist` is read in exactly one
   place, inside the chunked path. `draw()` never reads it — so the 300 m
   env-probe cull **cannot remove a single ribbon triangle from the probe.**
   It only ever touched props and glass.

**Two `Δprog` wraps with no pre-reject, where `pairContact` has one.**
`pairContact` opens with an exact cheap reject before its two float modulos,
with a comment saying the modulos "were being spent almost entirely to prove
'not touching'". The identical wrap idiom, on the same `prog` values, appears
twice more inside `updateCar` — the traffic-awareness scan and the lateral
separation scan — with no such guard, so every one of ~20x19 iterations per
step pays two `Float64Mod` calls to discard. Line-attributed: **129 of 2575
samples = 5.01 %** of physics CPU, the largest identified JS line-group after
the collision solver, and a floor (it excludes the inlined executions).
Bit-identical with a 0.1 m margin on the reject, which sidesteps the one
unprovable part — the wrap expression can differ from the raw delta by ~1 ulp.
**This is NOT the "merge the two loops" idea §3 already declined**; it is the
missing guard on each, independently, and it is ~10x the size that entry
estimated.

> **SUPERSEDED 2026-08-18.** Both scans now pre-reject before wrap (windows
> 34.1 m and 6.5 m), same form as `pairContact`. Do not re-implement.

**AI brake-look + traits allocate every physics step.** vegas
`profile-gameloop … physics` (2026-08-18) still has `update` 24.6 %,
`updateCar` 13.3 %, `brakeTarget` 1.4 %. The math is the look-ahead; the
GC is not: every AI car built a fresh `samples[]` of `{d,k,bank}` rows
(~10), plus `AiDrive.traits()` and `brakeDecision()` object literals.
~20 cars × ~12 objects × 60 Hz ≈ 14 k short-lived objects/s, same class
`pairContact` already left (`_ct` / `_sep`).

> **TAKEN 2026-08-18.** `AiDrive.traits` / `brakeDecision` write reused
> scratches (read-before-next-call, same as `_ct`). `beginLook` /
> `pushLook` / `endLook` recycle the look-ahead rows. Values are
> bit-identical; do not re-allocate those three.
>
> **TAKEN 2026-08-19.** The leftover call-site ctx literals are gone too.
> `updateCar` fills `_aiBoost` / `_aiOtFire` / `_aiBr` / `_aiLane` /
> `_aiWantX` / `_aiOtPull` / `_aiDefend` / `_aiBoxed` then passes the
> scratch. `simRnd()` stays behind the `otArmed` short-circuit. Guarded
> by `tests/unit/ai-drive.test.mjs` (no `AiDrive.*( {` in `updateCar`)
> and `tests/specs/physics-hotpath.spec.js` (ctx identity across steps).
> Do not re-introduce object literals at those eight call sites.
>
> **TAKEN 2026-08-18 (leftover sweep).** WGX road `createChunkedMesh` now
> expand-once + spatial bins. Props/glass share one IBO with `firstIndex`
> run-merge. TLX `uf1` skips unchanged tuner scalars. `resolveCollisions`
> rebuilds buckets only after `shiftLong`. AI scans skip `finished`
> rivals. SW install no longer precaches `apex.js` / `agentview*`
> (fetch-miss still caches them).
>
> **TAKEN 2026-08-19 (render leftover).** WGX `drawChunked` now frustum +
> radial-culls the road (surfaceId 16) — near is GL clip `w+z`, the old
> exemption threw away the env-probe 300 m cap. WGSL/TSL sky skip the
> night corona/disc (GLX already had the gate); TSL also gates the
> day-band `atan`+`vnoise`. TLX shadow `cullInstances(..., {upload:false})`
> packs CPU-side only (shadow has its own InstancedMesh). WGX skid
> expand 5→9 only when the VBO is dirty. Still open: lazy circuit tags,
> script-tag `defer`, WGX whole-UBO skip, TLX road `trk` so
> `chunkedTrackCoords` can flip on.
>
> **TAKEN 2026-08-19 (render leftover 2).** Countable dummy-producer /
> multiplied-by-zero leftovers on the draw path, all three backends:
> - Sun Cook-Torrance + clearcoat sun lobe gated on `NoL` / `NoLg`
>   (lamp `NoLl` twin). Backfaces skip two GGX evals for a result of 0.
> - Composite else-path no longer fetches the 1×1 white SSAO / black
>   bloom; `uHaveGodray` skips the god-ray fetch on GLX/TLX. WGX leftover 6
>   packs haveGR in CompositeU `lift.w` and skips the same fetch.
> - SSAO centre uses `viewPosD` / `ssaoViewPosFromD` — one depth sample,
>   not two. GLSL ES 3.00 has no overloads; the 1-arg `viewPos` wrapper
>   stays for contact-shadow sites.
> - MSAA depth resolve / blit only when SSAO, godray, SSR or flare will
>   read it (auto-tier 4 night sheds all four).
> - WGX no longer `_clearTarget`s unread SSAO-white / bloom-mip0.
> - AI cars after the behind-camera / near-eye tests skip an 8 m sphere
>   outside the same 6 planes as `propBatches`. Player never culled.
>   The side-frustum `continue` is **after** `_shadowCount++` so a rival
>   just off a chase FOV still casts into the ±42 m car map (a look-wrong
>   the first hoist introduced). GLX/TLX `makeFrustumPlanes` honour the
>   pooled `out`. `needDepth` / WGX `_ssrEarly` treat omitted
>   `carReflect` as the 0.05 tuner default — otherwise a dry night
>   skipped the MSAA depth resolve while car-paint SSR still marched.
>   Guarded by `tests/unit/perf-try.test.mjs`.
>   Do not invent a millisecond claim. Do not re-open the 08-18 union
>   banner items (WGX road cull, UBO skip, defer, pine unit-Y, merging
>   AI loops).
>
> **TAKEN 2026-08-19 (render leftover 3).** Fog `pow`/`exp` dummy-producer
> gate, all three backends. `uFogDensity==0` made `fd==0` / `f==0` so the
> mix was identity, but every lit fragment still paid `pow(sunAmt,4)`,
> `pow(sunAmt,16)`, tint, and `1-exp(-fd²)`. Outer gate is
> `density>0 || mist>0` (mist reuses `sunAmount` / `lampFogC`); inner
> gate wraps the height/`pow`/mix so a density-0 + mist-on tuner frame
> still tints. Race sessions keep density > 0 (clear day 0.0008) — this
> is the setup-preview / carview / tuner-zero path. Uniform-coherent
> (WebGPU Fundamentals + MDN: skip unused ALU; no warp divergence).
> Do not invent a millisecond claim. Still open: lazy circuit tags,
> script `defer`, WGX whole-UBO skip, TLX road `trk` / `chunkedTrackCoords`.
>
> **TAKEN 2026-08-19 (render leftover 4).** Window-sun-flash `pow(_,22)`
> dummy-producer, all three backends. The term is
> `* (1-wetSheen) * envBlend * uWindowSunFlash * uKeyMul`. Wet road
> forces `envBlend` high, then multiplies the flash by 0 — every wet
> tarmac fragment paid the 22-exponent for identity. Gate is
> `(1-wetSheen)*uWindowSunFlash*uKeyMul > 0.001` (tuner-zero and
> keyMul-0 too). Dry glass is unchanged. Do not invent a millisecond
> claim. Do not re-open the 08-18 union banner. Still open: lazy
> circuit tags, script `defer`, WGX whole-UBO skip, TLX road `trk`.
>
> **TAKEN 2026-08-19 (render leftover 5).** Sky golden-hour + low-sun
> band dummy-producer, all three backends. First factor is
> `(1-smoothstep(0, 0.72, sunE))` / `(1-smoothstep(0, 0.60, sunE))` —
> both identically 0 when `sunE >= 0.72` (default day ~0.95, night
> moon-key ~1). Gate is `if (sunE < 0.72)` / `If(sunE.lessThan(0.72))`
> wrapping `goldenAmt` + `lowBand`. `sunE` is a uniform (`uSunDir.y`).
> Dawn/dusk still enter. Uniform-coherent. Do not invent a millisecond
> claim. Still open: lazy circuit tags, script `defer`, WGX whole-UBO
> skip, TLX road `trk`.
>
> **TAKEN 2026-08-19 (render leftover 6).** WGX composite godray fetch
> dummy-producer. After SSR remul, `U.lift.w` (s[47]) is dead — wetness
> lives in the SSR pass `.a`. Pack `s[47] = haveGR ? 1 : 0` and gate
> `if (U.lift.w > 0.5) { c += textureSampleLevel(godrayTex…) }`. Keep
> `let ssrWet = U.lift.w` so Dawn still compiles a leftover use. Delete
> the dummy `_clearTarget(godrayView)` (stale contents unread, same as
> leftover-2 SSAO/bloom) and the now-dead `_clearTarget` helper. Do not grow CompositeU past 256 B. Do not
> zero `gain.w` carReflect when `!_ssrReady`. Do not invent a
> millisecond claim. Still open: lazy circuit tags, script `defer`,
> WGX whole-UBO skip, TLX road `trk`.
>
> **TAKEN 2026-08-19 (render leftover 7).** Sky twilight cloud wash
> `pow(sd, 2.5) * twilight`. `twilight` is a uniform
> (`smoothstep(0.02,0.22,sunE) * (1-dayGate) * (1-nightSky)`) —
> identically 0 on default day (~0.95) and night. Default `cloud` is
> 0.4 so the cloud block is live; the pow was `* 0`. Gate
> `if (twilight > 0.001)` on GLSL + TSL. WGSL cloud path has no
> twilight wash. Dawn/dusk still enter.
>
> **TAKEN 2026-08-19 (render leftover 8).** TSL godray sun-half +
> `hLamp` parity with GLSL/WGSL. Night `haveGR` is `lampVol` with
> `uStr=0` (moon-key `sunDir.y ~ 0.97`) — TSL still paid 16 shadow
> compares + 16× `gCloud` FBM then `* str`. `hLamp` exp sat outside
> `lampStr>0` (every daytime sun-shaft frame). Move both behind the
> existing uniform gates; `trans` stays outside. Also reorder TSL
> heat-haze: Gaussian first, scene-tag fetch second (GLX/WGSL already
> had this — ~92% of pixels are off-plume).
>
> **TAKEN 2026-08-19 (render leftover 9).** Godray Henyey-Greenstein
> `sqrt` dummy-producer, all three backends. The phase's only
> consumer is `* uStr`. Night lamp-vol frames skip it. Uniform-coherent.
>
> **TAKEN 2026-08-19 (render leftover 10).** WGX SSR pass omitted
> `carReflect` defaulted to 0 while leftover-2's `_ssrEarly` and
> composite `gain.w` already use the 0.05 tuner default. HIGH dry paid
> the MSAA depth resolve, skipped the march, then COMPOSITE fetched a
> target that never ran. The pass now defaults to 0.05 like GLX
> `_carReflPre`. Do not zero `gain.w`.

**`uCarReflect` is not shed with `po.reflect`.** Tier 2 sets `po.reflect = 0`
and the source says "Tier 2 drops the wet-road SSR march" — but the SSR gate is
`(uReflect > 0.001 || carPx > 0.3)` and `uCarReflect` keeps its 0.05 default,
so every car-paint pixel still runs the full march (~36-40 dependent fetches).
Verbatim the `po.contact` / `lampVol` defect, on the third operand-pair nobody
grepped. **Not taken because it is not bit-identical** — it removes a visible
reflection — though it is the same trade tier 2 already makes for the road. The
strictly-equivalent half of this site WAS taken; see §2.

> **SUPERSEDED 2026-08-17.** `game.js` now sets `po.carReflect = tier >= 2 ? 0 :
> undefined` and `glx/post.js` prefers `opts.carReflect`. Do not re-open.

**The boot script wall, re-measured — and the headline is not what it looks
like.** Corrected counts: **148 tags, 5,638,215 B** on this commit (§0's
146 / 5,466,108 B predates two added files, and this commit's own comments);
`js/circuits` is 1,729,016 B / 40 files / **30.7 %**
of it, for data where a session uses exactly one file. But V8 compile of all 148
files measured **97.3 ms total** (25.8 ms for the circuits) and executing all 40
circuit IIFEs is **2.5 ms** — so parse+execute of the circuit wall is ~1 % of a
2299 ms render delay, not the bulk of it. "Render delay" is the browser's bucket
for everything between TTFB and the paint; here that is serial EXECUTION of the
wall plus eager top-level work.

> **CORRECTION to the sentence above, which first read "148 serialised
> render-blocking fetches".** That was wrong, and wrong in a way that would send
> the next person after the request COUNT instead of the execution. Classic
> parser-blocking scripts are still **downloaded in parallel** — the preload
> scanner keeps scanning and triggers the fetches ahead of the parser
> (web.dev, *Deep dive into the murky waters of script loading*), and GitHub
> Pages serves HTTP/2, so they multiplex on one connection. Only EXECUTION is
> serial and ordered. This also kills `defer` as a lever from a second
> direction, on top of the eight `readyState === "loading"` guards below:
> `defer` cannot fix a serialisation that is not happening.

**The `?v=N` bump throws away Chrome's code cache for all 148 scripts, every
deploy.** v8.dev's *Code caching for JavaScript developers*: "Code caches are
(currently) associated with the URL of a script… changing the URL of a script
(**including any query parameters!**) creates a new resource entry in our
resource cache, and with it a new cold cache entry." AGENTS.md mandates bumping
EVERY `?v=N` after ANY js/css change, so a one-line CSS edit costs every
returning player a full re-download and a cold compile of the whole wall.
Per-file content hashing would fix it and is a convention change, not a code
change — but it touches the index.html/manifest guard and the `version.json`
shell guard, so it is its own commit. (SUPERSEDED: SHIPPED — index.html now
carries per-file `?v=<12-hex-sha>` on every src tag; only edited files go cold
per deploy, exactly the fix this paragraph asks for.)

**And the same article reframes the 97.3 ms figure.** `sw.js` precaches inside
the `install` event, and V8 treats that path specially: "the code cache is
immediately created when the resource is put into the service worker cache. In
addition, we generate a **'full' code cache** — we no longer compile functions
lazily, but instead compile everything… at the cost of increased memory use."
Both preconditions hold here (classic scripts, UTF-8). So 97.3 ms is a LAZY
compile number, and the installed-PWA path eagerly compiles all 5.64 MB —
including the 346 KB of dev surface no player reaches and all 40 circuit files.
That is a MEMORY cost on exactly the device class the crash sentinel exists for,
and it is an argument for trimming the eager wall that has nothing to do with
parse time. Not measured here — attributed to v8.dev.

Two eager costs found that are
NOT bytes: `js/track/tracks.js` builds Catmull-Rom control points for **all 40**
circuits at boot (**24.0 ms**, an order of magnitude more than parsing them),
and `js/game/apex.js` + `agentview*` is **346 KB of dev/test surface** that no
player reaches.

**`defer` is not the one-attribute change it looks like.** Every external tag
sits at the very end of `<body>` with no markup after it, and deferred classic
scripts keep document order — so it reads as free. It is not: **eight**
self-initialising modules guard on
`if (document.readyState === "loading") …DOMContentLoaded… else init();`
— enumerate them with `grep -rl 'readyState === "loading"' js/`, which gives
`js/game/ariastate.js`, `gfx-quality.js`, `menunav.js`, `music-lib.js`,
`scrollfade.js`, `sheetshape.js`, `spotify.js`, `topmodal.js`.
Parser-blocking,
`readyState` is `"loading"`, so all eight defer `init()` until after the whole
wall has run — which `sheetshape.js` states as a deliberate choice. Under
`defer`, `readyState` is `"interactive"` and all eight take the `else` branch and
initialise **mid-wall**, so a module at tag 50 can init before one it reads at
tag 100 exists. The prepared form of the change is
`readyState !== "complete"`, which is behaviour-preserving today and correct
under `defer` — do that first, separately, and prove it green before touching a
single tag. (SUPERSEDED: the prepared form SHIPPED — all eight named modules
now read `readyState !== "complete"`, and the quoted grep matches only
`cockpit-opts.js` and `metrics.js`. `defer` itself remains untaken.)

**And the boot A/B run to settle it was VOID — recorded because the way it
failed is reusable.** Interleaved base / defer / no-script arms, fresh
`browser.newContext({serviceWorkers: "block"})` per run, 5 rounds. The
**no-script control arm** — a page with zero external scripts — returned FCP of
140, 168, 7660 and 11440 ms across its runs. Variance on a page that does
nothing exceeded the entire effect being measured, so every number in the run is
machine contention (five audit agents were running; loadavg 4-11). **The control
arm is the anti-vacuity guard, and it is what caught this** — without a
do-nothing arm the base/defer medians would have looked like a clean, damning
result. Two further traps found the same way: an earlier pass was silently
served by a registered service worker (`apex26-1225` precache) on every arm
including the control, and arm ORDER was itself a confound — the first arm in
each round ran clean while later arms measured the previous arm's teardown.
Re-run it on a quiet box (`loadavg < 2`, nothing else in flight), rotating arm
order per round, and report the MINIMUM as well as the median — the fastest a
run has actually gone is the least contaminated estimate, which is the same
argument `PerfGov._floorMs` already makes about frame intervals.

### Added 2026-08-18 — hunt after the 08-17 board shipped

Re-walked the 08-17 survey against cache **1388**, then merged deploy tip
`11d972d2` (cache **1421**). Full board:
[research/PERF-HUNT-2026-08-18.md](research/PERF-HUNT-2026-08-18.md).

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
