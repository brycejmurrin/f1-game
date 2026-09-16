# Making the Node VM harness and the circuit build faster

Research only — the repo was read-only for this pass. Every number below came
from a read-only probe I ran against `tools/lib/game-vm.cjs` in the scratchpad
(`probe1..7.cjs`, `--cpu-prof` twice); `/proc/loadavg` was 0.27–2.72 before each.
Claims I could **not** measure are marked UNVERIFIED.

## 1. Where the ~10 s per circuit actually goes

`docs/plans/2026-09-16-process-speedup-next.md` item 3 guesses "ensureScenery +
makeCars, not the centreline build". **All three guesses are wrong.** The cost is
physics stepping.

Measured budget for one circuit in `tests/unit/elevation-tracks-vm.test.mjs`:

| phase | measured | share |
|---|---|---|
| ~2200 `A.step(1/60,1)` calls @ 3.13 ms | **~6.9 s** | **~70 %** |
| `Tracks.build` (per race) | 0.80–1.23 s | ~13 % |
| rest of `race()` (makeCars, loadTrack, applyRaceSettings) | 0.13–0.27 s | ~2 % |
| LAZY_SCENERY injection + the bespoke `scenery(api)` closure | ~30 ms | ~0.4 % |
| `trackProfile()`, `corners()`, `probe()`, `physState()`, `jump()` | < 60 ms | ~0.5 % |
| manifest script evaluation (once per FILE, not per circuit) | 178 ms | — |

Step counts per circuit from the spec body (`elevation-tracks-vm.test.mjs:161`
onward): 180 flat-reference + 300 jump+step slope scan + 150 descent + 150 climb
+ `corners().length`×70 (≈15–20 corners ⇒ 1050–1400). ~2200 total. 40 circuits ×
(6.9 + 1.2) ≈ 325 s, plus the two banked tests and the boot — consistent with the
observed 399 s.

Evidence, probe by probe:

- **probe1** (boot + 4 races, `record.scripts` timings). Boot to `__apex` =
  **214 ms**. Evaluating all **193 FULL manifest files / 4.80 MB** = **178 ms**
  total (`js/game.js` 46.6 ms, `js/lighting/presets.js` 20.6, `js/car/parts.js`
  8.3, `js/track/tracks.js` 4.1). Script evaluation is a rounding error — kill
  the "how many files, how big" hypothesis. First race (monza) 2388 ms;
  later races spa 1323, zandvoort 1183, monaco 923, silverstone 1453, of which
  `Tracks.build` 1056 / 1026 / 795 / 1234. Injected scenery file eval:
  **0.5–0.9 ms**.
- **probe4**. `Car3D.build` is called **0 times** during a second race — car
  meshes/liveries/helmets are memoised in `js/car/car-draw.js` (`putBoundedMesh`,
  line 460) and built once per VM, on the first draw. That one-time cost is the
  ~1.0 s gap between monza's 2388 ms first race and spa's 1323 ms: the boot
  profile shows `js/car/helmets.js` 542 ms (`pointAt`/`tab`, the Catmull-Rom lid
  shell) + `js/car/car3d.js` 204 ms + `js/car/liverytex.js` 55 ms. So `makeCars`
  is **per-file**, not per-circuit.
- **probe4**, scenery share: silverstone dressed **596 ms** vs the same build
  with `window.TrackScenery.silverstone` deleted **566 ms**. The bespoke closure
  is **5 %** of the build. A `scenery:false` boot (plan item 3 step 2) would save
  ~30 ms/circuit — **1.2 s off a 399 s file**. Not worth doing.
- **probe7**. `Tracks.build` with a `gfx` that has no `createMesh` (the
  `if (G && G.createMesh)` gate at `js/track/tracks.js:224`) costs **218 / 241 /
  133 ms** for silverstone / spa / monaco vs **689 / 648 / 513 ms** warm. So
  **~65–75 % of the build is vertex emission**, and the physics-bearing half
  (`buildCenterline` + `TrackPit.build` + `TrackSurface.profile`) is ~130–240 ms.
- **probe5**, step-only CPU profile (marker-sliced, 2000 steps, spa, 22 cars):
  **3.13 ms/step**. Self time: `js/game.js` 46.5 % (`updateCar` 29.2 %,
  `update` 11.0 %), `js/physics/ai-drive.js` 21.0 % (`cornerSpeed` 9.5 %,
  `brakeTarget` 7.1 %), `js/physics/collide.js` 15.6 % (`sweepContacts` 8.6 %),
  `js/track/core/spline.js` 6.9 % (`curvature`), `mesh.js` 3.4 % (`bankAngle`),
  `line.js` 2.6 %. ~37 % of a step is work that exists only because 21 AI cars
  are on track.
- **probe2**, dead ends: `A.headless(true)` does **not** make stepping cheaper
  (3403 ms vs 3085 ms per 1000 steps — noise or slightly worse). `physState()`
  13 µs, `probe()` 3 µs, `jump()` 40 µs, `trackProfile(300)` 1 ms — all free.
- **probe6**, memory: RSS 44 MB → 258 MB after boot+monza → **453 MB after 6
  circuits** (~40 MB retained per circuit). 40 circuits in one process is a
  ~1.5–2 GB process; that is also an argument for splitting the file.

## 2. Ranked proposals

### R1. Run the circuits in parallel — `worker_threads` pool (top pick)

**What.** Keep one test file. Add `tools/lib/game-vm-pool.cjs`: a pool of
`os.availableParallelism()-1` workers, each `require`ing `game-vm.cjs` and
booting its own game. The parent dispatches `{circuit, probe:"gradient"}`, the
worker runs the *verbatim* `gradientProbe()` body and posts the plain result
object back; every `assert` stays in the parent `test()`. Physics is untouched —
same code, same order, same field, just four contexts.

**Evidence.** 4 cores; the file is one serial process today. Per-worker fixed
cost is 214 ms boot + ~1.0 s first-race car meshes (probe1/probe4), amortised
over 10 circuits.

**Fit.** `physics-characterization-vm` is untouched: it keeps its own single
`createGame`. Determinism holds because each worker is a fresh, independent VM
and `simRnd()` is seeded per race — but see risks.

**Plan.** New `tools/lib/game-vm-pool.cjs` (`createPool({size})`,
`pool.run(circuitId, probeName)`, `pool.close()`); move `gradientProbe()` /
`bankedProbe()` into `tests/helpers/elevation-probes.cjs` so worker and parent
share one copy; `elevation-tracks-vm.test.mjs` becomes dispatch + assert. The
four banking-geometry tests stay in the parent (they only need
`Tracks.buildCenterline`, ~200 ms).

**Verify.** `node --test tests/unit/elevation-tracks-vm.test.mjs` wall time;
`node tools/ci/twinned-specs.mjs` (test count unchanged — this is why a pool
beats a 4-way file split, which would need the tool to accept many twins per
spec); diff the probe result objects worker-vs-inline for 3 circuits before
landing; then `node --test tests/unit/physics-characterization-vm.test.mjs`
unchanged as the parity anchor.

**Saves.** 399 s → **~110–130 s** local; `vm-a` ~6.5 min → ~2 min on a 4-vCPU
runner, on every deploy push's fast tier. Effort 3–4 h.

**Risks.** Memory: 4 × ~450 MB if each worker takes 10 circuits (probe6) —
acceptable on a 16 GB runner, tight on a loaded local box; cap the pool at 3 and
call `pool.close()` in `after()`. A worker crash must fail the test, not hang:
give every `pool.run` a timeout. Failure messages must carry the circuit id.

### R2. Stub car meshes in the VM (`createGame({carMeshes:false})`)

**What.** After the manifest loads, replace `ctx.Car3D.build` /
`buildWheelLayers` with a cheap stub returning an empty geometry, unless the
caller opts in.

**Evidence.** ~0.75–1.0 s once per VM process (probe1 monza 2388 vs spa 1323;
profile: helmets 542 ms + car3d 204 + liverytex 55). Nothing in the physics path
reads a car mesh — `js/physics/collide.js` works from extents
(`extLong`/`extLat`, lines 54/59), and probe4 shows `Car3D.build` is reached only
from the draw path in `js/car/car-draw.js`.

**Fit.** Must be **opt-in-to-stub, default off**, and `physics-characterization
-vm` never sets it, so the parity anchor runs the shipped path. With R1 it is
~1 s per worker, i.e. ~4 s of the 110 s.

**Plan.** `game-vm.cjs` `createGame(opts)` → after the manifest loop, if
`opts.carMeshes === false` and `ctx.Car3D`, wrap the three builders. Guard: throw
if a test then calls a mesh-reading hook (`__apex.carMesh`/garage hooks), so a
wrong opt-in fails loudly instead of silently reporting 0 verts.

**Verify.** `node --test tests/unit/game-vm.test.mjs` and the vm-b group;
`physics-characterization-vm` must be byte-identical.

**Saves.** ~1 s × ~29 VM test files ≈ **25–30 s per CI node run**, and ~1 s off
every local single-file VM loop. Effort ~1 h. Low risk.

### R3. Stop searching for the steepest grade by driving to it

**What.** `gradientProbe()` burns **1029 ms/circuit** (probe2) on
`for (i<300) { jump(i/300); step(); read slope }` — a *search*, not an assertion.
`A.trackProfile(300)` already returns per-frac `y` and `k` in **1 ms**. Narrow to
the ~12 steepest candidates from the profile's own dy/ds, then jump+step only
those to read `physState().slope` (the asserted quantity, unchanged).

**Evidence.** probe2: 300×(jump+step) = 1029 ms; `trackProfile(300)` = 1 ms;
`jump()` = 40 µs.

**Fit.** `dn`/`up` are asserted only for sign (`lt(r.dn,0)`, `gt(r.up,0)`) and
are then used as launch points; the read is still a real `physState().slope`.
The browser twin must get the same edit or the pair drifts — this is the one
proposal that touches `tests/specs/elevation-tracks.spec.js` too.

**Verify.** Land it behind a one-circuit A/B first: assert the new `dnAt`/`upAt`
match the old search's for all 40 circuits in a throwaway script, then edit both
sides; `twinned-specs.mjs` counts unchanged.

**Saves.** ~0.9 s × 40 = **~36 s** on top of R1 (≈ 10 s after parallelism).
Effort 2 h. Medium risk (it is a test-semantics change; needs the A/B).

### R4. Browser: a `?boot=bare` flag for JSON-only specs — UNVERIFIED

**What.** `js/game.js:205` already reads `location.search` in
`wantAgentSurface()`. Add, gated on `wantAgentSurface()` so no Pages player can
reach it: `?boot=bare` ⇒ (a) `scheduleFlybyTrack()` returns immediately, (b)
`G.headlessMode = true` at boot so the rAF loop composites nothing until a spec
clears it, (c) skip `prepareMenuCarAssets()` and the asset-pack fetch.

**Evidence I have.** `js/game.js:2159` — the menu flyby does a full
`loadTrack(want)` 120 ms after the picker settles, *and* the rAF loop renders it
every frame; `docs/notes/CI-RENDERING-PERFORMANCE.md` is why that is expensive
under SwiftShader/llvmpipe. **UNVERIFIED**: I could not run a browser to measure
the saving (no test runs allowed this session).

**Fit.** Physics untouched; specs opt in per `page.goto`. The parity anchor
(`tests/specs/physics-characterization.spec.js`, which regenerates
`tests/data/physics-baseline.json`) must **not** use it.

**Plan.** `js/game.js`: one `const BARE = /[?&]boot=bare\b/.test(q) && wantAgentSurface()`
next to the existing param read; three guards at the call sites above.
`tests/helpers/fixtures.js`: a `bareBoot(page)` helper. `tests/unit/shell-ids`/
`agent-surface` guards unaffected.

**Verify.** Dispatch `ci.yml` with one JSON-only group and compare shard time
against the note's table; a screenshot spec must still show the flyby without
the flag.

**Saves.** UNVERIFIED; plausibly 5–20 s per JSON-only spec boot. Effort 2 h.

### R5. `vm.Script` code cache for the manifest — marginal

Write `cachedData` for the 193 files into `artifacts/vm-code-cache/` keyed by
mtime+size, reuse in `runFile()`. Ceiling is the measured 178 ms/file-boot, so
~3–4 s across the ~30 VM files per CI run. Do it only if R1/R2 land and it is
still the next thing. Risk: a stale cache silently running old source — key on a
content hash, not mtime.

## 3. Ideas I recommend **against**, with the measurement that kills them

- **`scenery:false` boot** (plan item 3 step 2): 30 ms/circuit, 5 % of a build
  (probe4). Not worth the seam — and `game-vm.cjs:551` already records that a
  bare build is a *different physics world* (collidable props gone).
- **Caching track geometry to disk** (JSON/binary keyed by a hash of
  `js/track` + `js/circuits/<id>.js`): the physics-bearing part of the build is
  only 130–240 ms (probe7) and is what a cache could safely restore; the
  expensive 65–75 % is vertex emission — millions of floats per circuit that
  would cost more to read, parse and re-typed-array than to rebuild, and whose
  prop/collider list (`js/track/tracks.js:634`, `track.props`) is produced
  *inside* the `createMesh` gate, so a cache that skipped it would change the
  physics. The game would need a `Tracks.hydrate(blob)` entry plus a guarantee
  that `track.surface`, `track.pit`, `track.props` and `_gfx` handles reconstruct
  identically — a large seam for ≤ 0.2 s/circuit.
- **V8 startup snapshots** (`--build-snapshot`/`--snapshot-blob`): they snapshot
  the *main* context, not a `vm.createContext` sandbox, so the harness would have
  to be rearchitected away from `vm`; and the entire eval cost it could remove is
  178 ms (probe1). Wrong tool for a 3.13 ms/step problem.
- **Serving precomputed geometry JSON to the browser**: same arithmetic as the
  disk cache, plus a second code path that would not be the one players run.
- **`headless(true)` earlier in the VM**: measured no saving (probe2).
- **Shrinking the field to 1 car** to drop the ~37 % AI share of a step: this is
  the biggest single lever left, but `__apex.tt()` (`js/agent/apex.js:1181`) sets
  `cars=[player]` and therefore removes dirty-air (`dirtyAirMul`, game.js:865)
  and car-car contact from the traces. That is a physics change in a twin whose
  whole claim is "the same assertions and thresholds as the browser spec". Do not
  do it for the twins. (Note: setting `G.cars=[player]` from outside has **no
  effect** — probe4 measured 1030 ms vs 1026 ms for 300 steps — because the
  façade setter does not rebind game.js's module-scope `cars`.)

## 4. Suggested order

R1 (4×, no physics change) → R2 (cheap, per-file) → R3 (needs an A/B and a
browser-spec edit) → R4 (browser, needs a CI dispatch to measure) → R5 if still
worth it. Expected end state for `elevation-tracks-vm`: **399 s → ~100 s local,
`vm-a` ~6.5 min → ~2 min on CI**, with `physics-characterization-vm` running the
unmodified path throughout as the parity anchor.

## 5. Probes I ran (all read-only, scratchpad only)

1. `probe1.cjs` — boot + 4 races; per-file eval times, `Tracks.build` wrap.
2. `probe2.cjs` — per-hook and per-step microbenchmarks, `headless(true)` A/B.
3. `probe3.cjs` + `--cpu-prof` — whole-run profile (boot+build+1500 steps).
4. `probe4.cjs` — `Car3D.build` call counts per phase; `G.cars` field A/B;
   dressed-vs-bare `Tracks.build`.
5. `probe5.cjs` + `--cpu-prof` — marker-sliced **step-only** profile, 2000 steps.
6. `probe6.cjs` — RSS growth across 6 circuits.
7. `probe7.cjs` — `Tracks.build` with and without a `createMesh`-bearing gfx.

No test suite, no browser, no edits to the repo.
