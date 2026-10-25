# BOOST hitch on every press: deploy-only meshes lost their pipeline to the 20 s prune (A·W45, 2026-10-24)

Bryce (2026-10-24 ~00:30Z): "the game lags and slows whenever I hit the boost button", "every press, a hitch",
helmet cam, iPhone, three.js WebGPU, BUTTONS steering. PR #3677. The FIRST press (a cold pipeline compile,
734–934 ms) is #3611 / #3640 (`TOUCH-BOOST-FIRST-PRESS-2026-10-23.md`); this note is presses 2..N.

## Mechanism

1. `js/render/three/tlx.js` `prunePool` drops a pool wrapper (one `THREE.Mesh` per (geometry, material, k))
   unseen for `PRUNE_IDLE_MS` = 20 s, and `dropWrapper` dispatches `dispose`, so three disposes its
   RenderObject.
2. Vendored three r186: when a pipeline's last RenderObject goes (`usedTimes` 0), `_releasePipeline` destroys
   the pipeline and `_releaseProgram` the shader module. The next draw builds both again, synchronously, in
   the frame (on WebGPU a `createRenderPipeline`; Safari's Metal cache makes it cheaper than the cold first
   press, but it is still frame work).
3. The cockpit dash ERS bar's pulse (`_rigFxA`), the ERS strip (`_ersLightOpts`, two alpha phases), the active
   OT lamp and the throttle-lift flame draw only while ERS deploys or GAS lifts. Between two boosts (a straight
   apart, > 20 s) their wrappers are pruned. On WebGPU those wrappers were their pipelines' only holders: the
   entry warm's probe meshes (`compileWarmProbe`) did not share the live draw's pipeline key there, so nothing
   else kept it.

## Evidence

| run | backend | result |
|---|---|---|
| `ers-deploy-census --presses 4 --gap 25` (48cf20d4) | three WebGL2, SwiftShader | BOOST-off control windows: `pool -92 / rObj -85` per 20 s (the prune is live); first deploy `lazy=0` |
| `ers-deploy-census --presses 3 --gap 25` (5270d96a, jump settled 6 frames) | three WebGL2 | presses 2 and 4: **0** pipelines; press 3's 5 are particle / scenery programs the control windows build too (4, 12, 17). WebGL2 shares the warm probe's program, so BOOST costs nothing extra there |
| `perf-boost-press-pipelines.spec.js` (A·H17), deploy tip | three WebGPU | presses 2..4 each build ≥ 1 pipeline: a transparent lit `MeshBasicNodeMaterial` (attrs `color,mat,normal,position,trk`, main pass), press 2 also two fx quads; no-BOOST windows build 0 |
| same spec (5da53799 single-file form), this branch | three WebGPU | presses 2/3/4: **0 / 0 / 2** (baseline 3/1/1); press 4's two land 27 frames apart, press 1's pattern: one more deploy-only draw still loses its pipeline over a long gap |
| same, second leg in the same Chromium | three WebGL2 | 0 / 2 / 1 — the second TLX boot in one process, which A·H17 measured to stall (>4 min); 089a9bfa splits it into its own spec file |

## Fix

- `tlx.js`: `gfx.pinMesh(handle)` (feature-detected, TLX only) marks the geometry; `prunePool` keeps a pinned
  geometry's wrappers. `freeMesh` still frees it (`releaseGeometry` drops its wrappers directly). GLX and WGX
  keep no such pool and do not export it.
- `car-draw.js`: a WeakSet-guarded `pin()` pins the ERS bar, active OT lamp, ERS strip and lift flame once,
  at their first draw. The look is unchanged: same meshes, same opts.
- Pins: `tests/unit/tlx-prune-pin.test.mjs` lifts the real `prunePool` (3 fail before, 3 pass after);
  `tests/specs/perf-boost-press-pipelines.spec.js` counts pipelines on presses 2..4 (group `perf-budget`).

## Not covered here

- **Still red:** the remaining press-4 rebuild. Best candidate: the player's rear lights, which the 2026 ERS
  light code (`CarMesh.ersLightCode`, 1.25 Hz / 18 % duty) flashes only while deploying on a dry day
  (`js/car/car-mesh.js` drawRearLights, outside this PR's paths; scope asked of OrchA 32). The general fix is
  A·W50's #3713, which keeps three's render pipelines alive across a wrapper drop; with it, these pins also
  save the RenderObject and bind-group rebuild.

- `car-mesh.js` retro telemetry draws the same ERS bar geometry; it is pinned through that shared geometry
  only once the cockpit dash has drawn it.
- Per-press HUD and audio work (`#btn-boost.on` 20 px glow + opacity, the energy-bar pulse animation start,
  `deployBoost`'s ~5 WebAudio nodes) was read, not measured on the device. If the device AFTER still shows a
  per-press hitch at 25 s spacing, those are next.
- Device proof: A·D1 runs the scenario in PR #3677 (≥ 25 s ON presses vs a 3 s control, BEFORE live, AFTER this
  branch).
