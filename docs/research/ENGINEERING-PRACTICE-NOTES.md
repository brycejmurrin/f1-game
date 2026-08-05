# Engineering practice — research notes (2026-08)

Reading around while the Phase 5 verification runs finished. Unlike
`CI-RENDERING-PERFORMANCE.md`, most of this is **confirmatory**: the interesting
result is that three things this repo already does turn out to match canonical
practice closely, and the value is in knowing *which* parts are load-bearing so a
future refactor does not casually delete them.

Where something is a real gap it is called out as such. Nothing here was acted
on.

---

## 1. The game loop is right, and here is exactly why

`js/game.js` runs the accumulator pattern. Checked line by line against the
canonical description (Gaffer's "Fix Your Timestep!" and a good 2025 restatement
of it), it matches on every point that matters:

| Canonical requirement | This repo |
|---|---|
| Fixed physics step, decoupled from render | `PHYS_DT = 1/60`, `while (physAcc >= PHYS_DT)` |
| Clamp the frame delta so a tab-resume cannot inject a huge `dt` | `Math.min((now - lastFrame)/1000, 1/4)` — **the 1/4 s figure is exactly the recommended clamp** |
| Guard the spiral of death (physics slower than real time) | `steps < 5`, then `physAcc = 0` to drop the backlog |
| Interpolate the render between the two physics states | `renderAlpha = clamp(physAcc / PHYS_DT, 0, 1)` |

**Do not "simplify" any of these.** Each one is the fix for a specific,
hard-to-reproduce class of bug:

- Removing the `dt` clamp reintroduces **tunneling**: a car that moves 10 m per
  step at 60 Hz moves 120 m in one step after a 2-second tab stall, and discrete
  collision checks never see the barrier in between. This repo is more exposed
  than most because `updateCar` already has a "teleported" branch
  (`Math.abs(ds) > 20`) that exists for the same reason.
- Removing the `steps < 5` cap turns a slow frame into an unresponsive tab: the
  accumulator grows, more steps are needed, each round takes longer.
- Removing `renderAlpha` reintroduces visual stutter whenever the display rate
  is not a multiple of 60 Hz. Note this interacts with the rule in `CLAUDE.md`
  that rendered position must interpolate in **world space**, never lerped
  `(s, x)` — the interpolation has to exist *and* be done in the right space.

One thing the sources warn about that **does not apply here**: using a `double`
for accumulated time degrades to millisecond precision after ~3 hours of
wall-clock. This repo takes `now` from `requestAnimationFrame` in milliseconds
and only ever differences consecutive values, so it never accumulates a large
absolute time in a float. No action needed — recorded so nobody "fixes" it.

## 2. What `__apex.seed()` can and cannot promise

The repo's determinism story — seeded `simRnd()`, `__apex.seed()`, and
`tests/agent-determinism.spec.js` — is sound for its actual use, which is
**same-machine, same-build reproducibility**. Worth writing down that this is a
strictly weaker property than the one the word "deterministic" usually implies:

> Floating-point addition is **not associative**: `(a + b) + c ≠ a + (b + c)` in
> general. Compilers reorder, architectures differ on denormals and rounding, and
> fused multiply-add computes `a*b + c` with one rounding instead of two.

So a seeded run is bit-identical **on the same engine on the same CPU**, and is
*not* guaranteed bit-identical across x86 vs ARM, or across V8 versions. Achieving
that would mean avoiding library transcendentals (own `sin`/`cos` or lookup
tables) or moving to fixed point — both far beyond anything this game needs.

**Where it actually matters here** is multiplayer: `js/net/netplay.js` gives each
peer full authority over its own car and replicates state, rather than running
one lockstep simulation on both sides. That design **does not require
cross-machine bit-identical floats** — and after reading the above, that looks
less like a convenience and more like the correct call. The header in
`js/net/handshake.js` refusing a peer on a different build is the other half of
the same defence. Worth stating plainly in `docs/MULTIPLAYER.md` sometime:
lockstep was never on the table, and floating point is why.

## 3. Legacy-code decomposition — this repo already has the hard part

The standard method for breaking up a large module (Feathers, and every
restatement of it since) is:

1. Identify **change points**.
2. Find **seams** — places you can alter behaviour without editing in place.
3. Write **characterization tests** that lock in what the code does *now*,
   correct or not.
4. Change, then refactor, re-running those tests after each small step.

The step everyone skips is 3, and it is the step that makes the rest safe.
**This repo has an unusually good example of it already**: `tools/graph-parity.cjs`
builds every track from a baseline ref *and* the working tree and diffs prop
geometry vertex for vertex. That is a characterization test in the strict sense —
it asserts nothing about correctness, only that behaviour did not change — and it
is exactly the tool you want pointed at a scenery refactor.

**The gap for Phase 4** (extracting from `js/game.js`) is that no equivalent
exists for the physics/game-loop side. Before extracting anything from
`updateCar` or `render`, the cheap move is a characterization harness in the same
spirit: fix a seed, drive a scripted input sequence through `__apex.act()` for N
steps, and snapshot the resulting `physState()` trace. Any extraction that
changes one number fails. `tests/agent-determinism.spec.js` is close to this
already and may only need a stored baseline.

The other standard advice, which matches the plan already agreed:

- Extract the **easy, low-coupling** pieces first to build confidence and shrink
  the surface (here: aero zones, skid marks, the lighting profile store).
- Leave the genuinely entangled core alone unless there is a reason beyond
  tidiness. `updateCar`'s tyre model is ~470 lines of one continuous integration
  over ~40 interdependent locals; extracting it means inventing a state struct
  and risking the determinism above for no functional gain.

## 4. The no-build bet, revisited

Since `docs/ARCHITECTURE-REVIEW.md` §2 frames the whole codebase as a
consequence of "no build step", it is worth recording what the alternative looks
like in 2026, because it is no longer 2015:

- **Native ES modules + import maps are viable in production** and need no
  bundler. Import maps are supported across current browsers; this repo already
  ships an `<script type="importmap">` block in `index.html` for the vendored
  three.js.
- The old objection — "hundreds of small files will be slow" — is **much weaker
  under HTTP/2** than the folklore suggests, and practitioners report acceptable
  production results. But it is not *zero*: deep import graphs still serialise
  into waterfalls, because a module's dependencies are not discoverable until it
  has been fetched and parsed.
- The honest counter-argument is that ESM's benefits here are mostly **static
  analysis** — real dependency edges instead of a hand-maintained `manifest.cjs`,
  and unused-export detection instead of a review finding "~60 dead exports".

**This is not a recommendation to migrate.** 150 files, 140 script tags and a
load order pinned by `tests/load-order.test.mjs` is a working system, and the
review's own law applies: the invariant has a guard, so it holds. The point of
recording it is that the *reason* for the bet should be "the guard works",
not "ESM would be slow" — the second half of that has quietly stopped being true.

---

## Sources

- [Taming Time in Game Engines](https://andreleite.com/posts/2025/game-loop/fixed-timestep-game-loop/) — accumulator pattern, spiral of death, the 0.25 s clamp, float non-associativity
- [Gaffer on Games — Fix Your Timestep!](https://gafferongames.com/post/fix_your_timestep/) — the canonical statement
- [Working Effectively with Legacy Code — key points](https://understandlegacycode.com/blog/key-points-of-working-effectively-with-legacy-code/) and [seams + characterization tests](https://docs.synapsestudios.com/concepts/legacy/) — the change-point → seam → characterize → refactor loop
- [God Class anti-pattern: how to break it apart](https://eden-technologies.eu/blog/god-class-antipattern/) — Extract Class, incremental verification
- [ES modules in production](https://www.bryanbraun.com/2020/10/23/es-modules-in-production-my-experience-so-far/) and [ES Modules + import maps](https://stevendcoffey.com/blog/esmodules-importmaps-modern-js-stack/) — the no-build ESM case
- [ES Modules are terrible, actually](https://gist.github.com/joepie91/bca2fda868c1e8b2c2caf76af7dfcad3) — the counter-case, incl. request waterfalls
