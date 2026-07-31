# Adoption plan — graphics library + additive Rapier physics

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
  with vehicle + 22 cars + 100 debris on the real 42k-tri road trimesh. The
  raycast vehicle controller cannot express the combined-slip bicycle model
  (no friction ellipse, no slip-angle tyres, ~2× understeer out of the box) —
  **player and AI handling stay bespoke.**

## Part 1 — Graphics migration (three.js/TSL, pending the Babylon verdict)

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
  deterministic under act/obs).
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

- Babylon comparison verdict (in flight) → fold into `spike/README.md` + here.
- Pre-existing `tests/baku-migration.test.mjs` failure on main (missing
  `baku-caspian-*` landmark) — unrelated to the spikes; fix separately.
- Rapier determinism is per-platform (standard build) — fine for the game's
  replay/ghost uses; revisit `enhanced-determinism` only if cross-platform
  ghost sharing ever matters.
