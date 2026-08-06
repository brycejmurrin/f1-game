# Adoption plan — graphics library + additive Rapier physics

> **Status (2026-08):** Phase A shipped (`js/render/three/`, opt-in); TLX has
> since grown its own chunked/shadow/post path; Phase D (flip + delete GLX/WGX)
> has not happened. R0–R1 shipped as `js/game/debrisworld.js` (default-on), the
> R2 takeover layer as `js/game/incidentsim.js`, and Part 3's B1 as
> `js/game/racecontrol.js`.

Written after the evaluation spikes (see `spike/README.md` criteria table and
`spike/physics/README.md`). This is the working plan for what comes next; the
follow-on phases only start when explicitly picked up, and each phase leaves
the game shippable.

## Inputs (measured, not assumed)

- **three.js r184 spike: all 7 criteria pass, no kill condition.** 2.0× faster
  than GLX on the same SwiftShader box, 54→25 draws with instancing (GLX: 94),
  no 32-lamp cliff, TSL ports GLSL ~1:1, CI-testable on the WebGL2 fallback.
  One landmine documented (stranded-assignment: anchor varying-derived nodes
  with `.toVar()` as unconditional Fn-body statements) plus working debug
  tooling (`__spike.shader()` GLSL dump, `?viz=` bisect modes).
- **Babylon.js comparison arm: measured, and the pick stands — three.js/TSL.**
  Babylon 9.19.0 rendered the same scene ≈1.25× faster than three (2,044 ms
  instanced vs 4,757; 18 vs 25 draws) and compiled 34 lights in 412 ms — but
  needed `disableUniformBuffers` to link on SwiftShader at all, fights the
  target look at the material level (StandardMaterial clamps pools to albedo;
  different spot falloff), and our custom materials/composite would be
  dual-source GLSL+WGSL (or a NodeMaterial rewrite) — the exact WGX failure
  mode the migration exists to end. Babylon = benchmarked fallback; its speed
  is a floor, not a cliff. Full numbers in spike/README.md.
- **Rapier 0.19.3: additive-only adoption recommended.** Bitwise deterministic
  (124 contact-rich bodies, 600 steps, bit-identical), ≤1.5 ms worst-case step
  with vehicle + 22 cars + 100 debris on the real 42k-tri road trimesh.
  **Deep-dive corrections (spike/physics/DEEP-DIVE.md):** the baseline's "~2×
  understeer" is retracted — that measurement caught a car already off the road
  and falling; on a flat plane the controller corners at exactly the kinematic
  radius. The structural finding is worse for replacement, not better: grip is
  a binary load-scaled clamp (rigid rails below it), near-limit tunes
  limit-cycle violently, and mid-corner braking is either inert or a divergent
  spin — the **inverse** of the bespoke model's graduated trail-braking. No
  tuning regime reproduces the friction ellipse. **Player and AI handling stay
  bespoke** — for corrected, stronger reasons.
  Deep-dive also measured: **R1 browser tax fits with margin** (side-world
  total ~0.36 ms mean / ~1.1 ms p95 in-browser incl. mirror sync; load+init
  ~90 ms; ~27 MB JS heap) and **R2 handover is clean** (|Δs| ≤ 0.37 m,
  |Δhead| 0°, bitwise-deterministic across 20-episode suites) but needs an
  explicit **rollover policy** — 8/20 moderate-energy episodes settle inverted
  (clamp imparted roll at hand-to; route inverted-rest to the rescue flow; and
  reconstruct y from road height at handback, never the proxy body's y).

## Part 1 — Graphics migration (three.js/TSL — verdict landed; Phase A shipped as `js/render/three/`)

Phases A–D as in the approved spike plan, refined with what the spike taught:

- **Phase A — TLX backend behind the Gfx seam.** `js/render/three/` implementing
  the ~30-member contract (`js/render/gfx.js:16-86`); opt-in via
  `apex26.gfxBackend=three`; installed by the existing descriptor-copy pattern
  (game.js:57) so tracks.js's direct `GLX.*` calls keep working. One
  `<script type="module">` island sets `window.THREE` + a ready promise.
  Manifest/load-order/`?v=`/version.json churn happens here, once.
  *Spike carry-overs:* `ColorManagement.enabled=false` + `LinearSRGBColorSpace`
  (no-sRGB calibration); lamp records scaled by `LT.lampLevel` exactly as
  game.js does; port the `__spike.shader()` dump + viz modes as permanent TLX
  debug hooks; **coding rule: every shared varying-derived node gets an
  unconditional Fn-body `.toVar()` anchor before conditional use.**
- **Phase B — world parity.** Full 15-material TSL lit shader (incl. FLAG
  cloth-wave vertex displacement), chunked frustum culling, the three shadow
  maps + PCSS-lite, glow billboards, particles, skids, decals, env probe;
  `InstancedMesh` for cars/wheels/props (the spike's clearest win).
- **Phase C — composite + tuner.** The 61-uniform composite as a custom post
  node chain (parameterised Narkowicz ACES — do NOT keep three's Hill fit
  beyond the spike); all 176 `TUNE_DEFS` knobs through `frame.tune` unchanged.
  Retire `tests/image-grade-shaders.test.mjs` (obsolete by construction —
  single source) in favour of pixel assertions.
- **Phase D — flip + delete.** Rewire tracks.js/carmesh.js onto the façade
  (end the monkey-patch era), TLX default, delete GLX+WGX (~10.6k lines + both
  shader trees), retune LightPresets, regenerate visual baselines, update
  webgl-probes/lighting-ab.
- **Gate before Phase A:** one-time desktop-browser check that
  `spike/three-spike.html` (no `?gl=1`) reports `backend webgpu` and looks
  right — the WebGPU half of criterion 7 that headless CI cannot cover.

## Part 2 — Rapier, additive only

Ordering principle: start where the risk to the sacred physics invariants is
zero, end where it touches them. Every phase ships behind a flag and the
physics regression suite must pass unchanged with the flag off.

- **R0 — loading + sync layer (prereq).** The 2.2 MB compat bundle must never
  block boot: lazy-load `spike/physics/vendor/rapier.mjs`-style module the
  first time a feature needs it (module island like three's, or
  dynamic-import on demand). Side-world design: Rapier steps on the same fixed
  tick as the game (`__apex.step` compatible); game cars mirror in as
  KINEMATIC bodies each tick (pose write), Rapier owns only its own dynamic
  bodies; results flow back as render transforms or bounded impulses. State
  snapshot/restore via `world.takeSnapshot()` for episode resets.
- **R1 — debris & impact set pieces (render-only writeback, zero gameplay
  risk).** Barrier impacts and car-car contacts above a severity threshold
  spawn debris (endplate shards, cones, boards) into the Rapier world; they
  tumble on the real road trimesh and never push a car. Budget from the spike:
  100 debris ≈ 0.24 ms mean / 1.5 ms worst — fits even alongside night lamp
  cost. Pooled, capped (mobileTier lower), swept by sleeping. New spec:
  determinism of a seeded debris episode via act/obs.
- **R2 — airborne / rollover moments (bounded takeover).** When the bespoke
  model detects a launch condition (kerb strike over threshold, major
  collision), hand THAT car to Rapier 6-DoF until touchdown+settle, then hand
  back to the bicycle model (blend pose, resync `(s,x)` via trackFrom). The
  takeover window is bounded and flagged; ghosts/laps invalidated during it if
  needed. New spec: handover invariants (no teleports, `(s,x)` continuity,
  deterministic under act/obs). *Deep-dive-mandated additions:* *(1)* clamp the
  imparted roll energy at hand-to and route inverted-rest outcomes into the
  existing rescue flow (8/20 moderate-energy episodes settled upside-down);
  *(2)* at handback reconstruct y from road height, never the proxy body's
  resting y (cuboid rests ~0.36 m vs the model's ~0.6 m ride height);
  *(3)* handback speed retention 0.43–0.71× measured — tune the blend against
  that range.
- **R3 — car-car / wall contact resolution (the careful one, optional).**
  Replace the `(prog,x)`-plane car-car resolution and barrier clamp writeback
  with Rapier contact resolution. This touches the ONLY two things allowed to
  move the player in road coordinates, so it comes last, behind an A/B flag,
  gated on R1/R2 experience, with `npm run test:collision` +
  `test:behaviour` + `test:barriers` green in both flag states before flip.
- **Non-goals (measured reasons):** player handling (combined-slip
  irreplaceable), AI traffic as Rapier vehicles (affordable but changes AI
  character for no gain).

## Sequencing

R1 is independent of the graphics migration and could start any time (debris
renders fine as GLX meshes). R2 benefits from Phase B instancing (debris/car
pieces). R3 waits for R1+R2 field experience. Graphics Phases A→D are strictly
ordered. Suggested next concrete steps: (1) Babylon verdict → lock the graphics
pick; (2) desktop WebGPU check; (3) Phase A; (4) R1 in parallel with Phase B.

## Open items

- ~~Babylon comparison verdict~~ — landed; folded into `spike/README.md` and the Inputs above.
- ~~Pre-existing `tests/baku-migration.test.mjs` failure~~ — since fixed; the suite passes.
- Rapier determinism is per-platform (standard build) — fine for the game's
  replay/ghost uses; revisit `enhanced-determinism` only if cross-platform
  ghost sharing ever matters. **UPDATE (doc research, see Part 3):** Dimforge
  now ships a prebuilt `@dimforge/rapier3d-deterministic(-compat)` variant with
  `enhanced-determinism` baked in — cross-platform bit-identity is now a
  vendoring choice (swap `RAPIER_URL`), not a build project. Mutually exclusive
  with `simd`/`parallel`: pick bit-identity OR SIMD speed.

## Part 3 — Further Rapier uses (research, additive to R0–R3)

Grounded in the R0+R1 side-world (`js/game/debrisworld.js`: live `World` with
the road trimesh, a pooled 48/16 dynamic-body set, 22 kinematic car mirrors,
seeded spawns, `positions()`/`reset()` determinism hooks, one guarded
`step()`/`draw()`). Most of these are "add another consumer of that world," not
"add a world." Sources: Rapier JS3D API (World, DynamicRayCastVehicleController),
Advanced collision-detection & Determinism guides, rapier.js CHANGELOG 0.16.0,
Dimforge 2025-review post.

**Doc corrections to this plan:**
1. Cross-platform determinism is now a prebuilt bundle (see Open items above).
2. A SIMD compat build (`rapier3d-simd-compat`) exists — swapping the vendored
   URL is the first lever before shedding features if body counts climb.
3. **Deformable barriers via Rapier's 2025 voxel colliders are NOT feasible
   here:** voxels can't collide with a trimesh/heightfield and can't be
   shape-cast, and our whole world is a road *trimesh*. Crushable barriers, if
   ever wanted, must be compound rigid pieces (B2), never voxels.

**Group A — cheap wins, render-only, zero risk, reuse the R1 pool** (gate:
`test:physics` + a `debris.spec.js`-style determinism case):
- **A1 real contact-force severity** — replace the synthesised `xOver*60 +
  speed*0.15` severity with Rapier's actual solved impulse via `EventQueue` +
  `ActiveEvents.CONTACT_FORCE_EVENTS` + `setContactForceEventThreshold`. Lives
  entirely inside `DebrisWorld`; makes all downstream FX (and future damage)
  scale with the real hit. Enables B1/C3. Negligible cost, no new bodies.
- **A3 clippable cones/boards** — promote the near-apex subset of `FURN`/
  `BARRIER` scenery (`js/track/scenery-data.js`) to dynamic bodies the kinematic
  mirror punts (KINEMATIC↔DYNAMIC is on by default). Highest "world reacts to
  me" payoff per line. ≤~24 items, distance-culled.
- **A2 marbles** — tiny pooled cuboids spawned from lock-up/slip (near the
  combined-slip block), settling off-line via `isSleeping()`. The most "TV F1"
  texture the game lacks; pure pool reuse. Keep cosmetic here (grip coupling is
  B3).

**Group B — gameplay-adjacent, flag-gated, read-only triggers** (never write
`px/pz/head` or `(s,x)`; gate: `test:physics` + `test:behaviour`/`test:modes`;
vendor the deterministic build so triggers are replay-safe):
- **B1 debris → yellow/SC/VSC** — sensor colliders / `intersectionPairsWith`
  per sector detect at-rest shards on the racing surface; race logic near
  `rescuePlayer`/`rescueT` sets caution, HUD renders the flag. Turns existing
  deterministic debris into a real race-mode feature.
- **B2 breakable/knocked-back barriers** — promote `BARRIER` panels near an
  impact to `ImpulseJoint`-anchored bodies; break by monitoring the solved
  joint impulse and calling `removeImpulseJoint` past a fixed threshold. The
  player still gets the same bespoke `xPinned` clamp (so it is NOT R3); gate on
  `test:barriers` (clamp line unchanged with flag off).
- **B3 marbles-affect-grip** — the gameplay half of A2: a marble-zone sensor
  query feeds a scalar into the *existing* `gripMult()` pipeline — never
  `LONG_GRIP`/`slipFactor`. Closest to the sacred edge in this group; most
  caution, full behaviour/collision gates.

**Group C — bigger bets** (new body classes or player authority):
- **C2 visual suspension read-back** — a passive vehicle controller / 4-spring
  proxy read ONLY for per-corner compression to drive body pitch/roll/squat in
  `carmesh.js`/`car3d.js`; driving model untouched (the controller's own docs
  warn its traction "can flip the car if too strong" — corroborates our
  binary-grip finding, and is fine because we never let it steer/drive).
  Zero-risk by construction, but a new subsystem. 4 raycasts × 22 ≈ trivial.
- **C1 multi-car pile-ups** — extend R2's single-car handover to a whole
  tangled cluster handed to Rapier 6-DoF at once, then handed back per car.
  Touches player authority (highest tier, R3-adjacent); pre-measured — the
  spike's 123-body / 1.5 ms worst case *is* this scenario. Invalidate
  ghosts/laps for involved cars.
- **C3 event-scoped R3** — not a new phase: use A1's contact-force events as
  the principled trigger so R3 only takes over car-car resolution above a force
  threshold, keeping the cheap `(prog,x)` plane for gentle running and shrinking
  R3's blast radius on the sacred writeback.

**Recommended order:** A1 → A3 → A2 (cheap, reuse the pool) → B1 → B2 → B3
(flag-gated, need the deterministic build) → C2 → C1/C3 (after R1/R2 field
experience). Non-goals stand: player/AI handling stays bespoke; anything that
feeds grip (B3) or moves the player (C1/C3) routes through the existing
`gripMult`/clamp/`(prog,x)` seams only.
