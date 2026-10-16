# TLX shader upgrade survey — waving trees, better rain, and more (2026-10-01)

Status: **RESEARCH / PROPOSAL** — no code changed. Scope: the three.js (TLX)
backend `js/render/three/`, with the GLX/WGX parity cost named per item
(`docs/ARCHITECTURE.md` §Cross-backend parity: a look is not done until it is
mirrored on all three backends or recorded as a gap).

## What exists today (the surprising parts)

- **Rain is not a shader.** Falling rain is a CPU Canvas2D overlay
  (`js/fx/particles.js:196-303`): a `position:fixed` canvas over `#game` strokes
  ~450-650 one-pixel lines per frame (140 on the mobile tier). It has no depth,
  no fog, no bloom, no lighting, is absent from the rear-view mirror and from
  every canvas screenshot in the test suite, and sheds with `PerfGov.autoShed`.
  The knobs (`rainCount/Streak/Speed/Opacity/Wind/ShearWind/ShearLen`,
  `drizzle*`, `knobs.js:177-186`) are CPU-read; none has a `u:` uniform.
- **Wet road is a shader and is decent**: `tsl-lit.js:1487-1521` (port of
  `glsl-lit.js:1128-1185`) darkens up-facing surfaces, carves value-noise
  puddles (`vnoise(wp.xz*0.13)`), drops roughness to 0.30 (0.06 in puddles),
  adds a water-film f0, and `wetSheen` feeds lamp specular and the env mirror.
  SSR in the composite pass is scaled by `frame.wetness*LT.ssrWetMul`
  (`game.js:8190`, off at perf tier ≥ 2). **Missing:** any animation — no rain
  ripples on puddles, no droplet streaks on vertical surfaces, no splashes.
- **Trees never move.** All broadleaf/palm/cypress/hedge/bush geometry is
  low-poly cones and cylinders baked in WORLD space into the props soup
  (`nature.js:228-415`, `out._mat = MAT.FOLIAGE`, drawn by `drawChunked`).
  Only pines, crowd and some structures are instanced (`TrackGraph.instance`).
  No billboards, no alpha cards, no height or sway-weight attribute.
- **Vertex animation already has a precedent**: the FLAG cloth wave.
  `structures.js:398` writes `MAT.FLAG + ft*0.4` — the per-vertex wave weight
  rides in the FRACTION of the material id — and `tsl-lit.js:1945-1956`
  (`flagPositionNode`, the single shared `_sharedPos`) displaces along the
  normal with `U.time`. The fragment side rounds the id
  (`surfaceId = floor(mat+0.5)`, `tsl-lit.js:1294`), so a fraction < 0.5 on
  FOLIAGE (6) is free to carry a weight. `vertex-pack.js:42-63` keeps the
  id exact at a step of 1/771. WGX has NO flag wave (`wgsl-chunks.js:719-763`) —
  an existing parity gap.
- **The post chain is already rich** (`tsl-post.js:408-860`): exhaust heat
  haze, chromatic aberration, radial speed blur, sharpen, SSAO, god rays
  (sun + 6 lamps), SSR, bloom + lens dirt, screen sun-shafts, grade zones,
  parameterised ACES, anamorphic flare with ghosts, vignette, dither, film
  grain. Sky (`tsl-sky.js`): FBM clouds, Mie, sun disc/corona, stars, moon,
  light-pollution dome, `lightning` bleach. **Not present:** depth of field,
  per-object motion blur, any rain/lens-droplet pass.
- **No wind model exists anywhere.** `rainWind` is a CPU knob; the audio
  "gust" is a decel signal (`engine.js:1584`); the flag phase is hard-coded
  `time*5.5`. A shared `frame.wind` (direction, speed, gust) would be the one
  new piece of plumbing that trees, flags, rain slant, spray drift and smoke
  could all read.
- **Active plan to coordinate with:** `docs/plans/2026-09-30-wetness-lighting.md`
  is building one shared `trackWetness` for grip + shaders. Any new wet
  shader term should read that value, not `LT.wetness` directly.

## Proposals, ranked by payoff ÷ cost

### 1. Foliage wind sway (vertex shader) — SMALL, high payoff
Reuse the flag mechanism. In `nature.js`, give crown vertices a weight in the
mat fraction: `MAT.FOLIAGE + clamp((y - trunkTop)/crownH, 0, 1) * 0.45`
(trunk stays WOOD, weight 0 at the crown base so the tree stays planted).
Extend `flagPositionNode()` with a second branch:

```
isLeaf = round(mat)==6 && fract(mat)>0
w      = fract(mat) / 0.45
phase  = time*wind.speed*k + dot(wp.xz, wind.dir)*0.05  (+ per-tree hash from wp)
sway   = wind.dir * (sin(phase) + 0.5*sin(2.3*phase+1.7)) * w*w * amp   // main bend, GPU Gems 3 ch.16
flutter= normal * sin(phase*4.1 + wp.y*2.0) * w * ampSmall             // detail bend
```
Crysis's rule (GPU Gems 3 ch.16): main bending scales with normalised height
(quadratic keeps the base planted), detail bending uses a per-vertex phase so
leaves don't move in lockstep; triangle waves are cheaper than sin but TSL `sin`
is fine at these vertex counts. Instanced pines can use `positionGeometry.y`
(trunk base at y = 0, `nature.js:215`) instead of a packed weight — confirm
r186's `setupPosition` order (instance transform before `positionNode`) with a
one-liner probe before relying on it.
- Cost: ~40 lines TLX + GLSL mirror in `LIT_VS` (`glsl-lit.js:56-79`); WGX
  gets the flag wave at the same time (closes the existing gap).
- Caveats: shadow casters have no `positionNode` and the sun map is
  snap-cached (`shared/shadow-pass.js`), so shadows stay still — acceptable at
  racing speed; note it. Test: `vertex-pack.test.mjs` pins the fraction
  encoding; add one assert that FOLIAGE fractions stay < 0.5. Gate per rule:
  `gfx-probe --backend three` ×2 with `gpuErrors` 0, then `gpu-census.yml`.
- Sources: https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-16-vegetation-procedural-animation-and-shading-crysis ,
  https://threejs.org/docs/pages/TSL.html (`positionLocal`, `time`, `attribute`).

### 2. Rain rewrite: streaks IN the frame — MEDIUM, the biggest visual gap
Replace the Canvas2D overlay with a GPU rain pass on the FX material family
(`tsl-fx.js` already has additive camera-facing billboards with `forceSinglePass`):
- **Layered rain cylinder** (Lagarde, Water Drop 2a): 3-4 concentric
  camera-centred shells with a scrolling streak texture at different speeds and
  parallax, slanted by `wind + speed shear` (today's `rainWind`/`rainShearWind`
  become uniforms). Depth-tested against the scene so rain stops at the car and
  walls, fogged and bloomed like everything else, and present in the mirror.
  ~3 draws, trivially cheap; sheds by dropping shells.
- **Puddle ripples**: an animated procedural normal in the wet block
  (`tsl-lit.js:1504`): 2-3 expanding rings per noise cell with staggered
  phase (the classic Lagarde ripple layer), gated on `puddle > 0` so dry roads
  pay nothing. GLX/WGX mirror is ~20 lines each in the same block.
- **Splashes**: spawn tiny ring sprites in the existing CPU particle pool
  (`particles.js` MAX 256/96) at random road points near the camera while
  `isRaining()` — no compute needed (Lagarde's depth-map occlusion is overkill
  for an open-cockpit camera).
- **Lens droplets** for chase/TV cameras only: a fullscreen composite term
  (`tsl-post.js` COMPOSITE) with a small droplet-cell normal map distorting
  `sceneT` (the "Heartfelt"/Rain-on-a-Window approach) — the game.js comment at
  `:8277-8285` deliberately skips water-on-visor for the cockpit, keep that.
- Cost: medium (new FX records + 3 shader blocks mirrored). Removes a full-
  screen CPU surface and the second compositor layer — a net perf WIN on phones.
- Sources: https://seblagarde.wordpress.com/2012/12/27/water-drop-2a-dynamic-rain-and-its-effects/ ,
  https://seblagarde.wordpress.com/2012/12/10/observe-rainy-world/ ,
  https://seblagarde.wordpress.com/2013/04/14/water-drop-3b-physically-based-wet-surfaces/ ,
  https://www.shadertoy.com/view/MlfBWr , https://www.shadertoy.com/view/WfdyRX ,
  https://github.com/ektogamat/threejs-conference (three.js WebGPU rainy
  alley: ripples + planar reflections; its compute-shader collision is
  WebGPU-only and NOT needed here).

### 3. A shared wind state — SMALL, unlocks 1 + 2 + flags + smoke
`frame.wind = {dir: vec2, speed, gust}` on `G` (add to `types/game-ctx.d.ts`,
`check-gctx.mjs` enforces), driven per track|weather from the lighting
profile (a `windSpeed`/`windDir` knob pair in `knobs.js` so the tuner panel
can set it). Consumers: tree sway, flag phase (replace the hard-coded 5.5),
rain slant, spray/smoke drift in `particles.js`, cloud drift direction in
`tsl-sky.js`. One uniform `U.wind` in the shared `renderGroup`.

### 4. Rubbered-in racing line and marbles — SMALL (data exists?)
The lit shader already has "racing-line rubber wear" (`tsl-lit.js:969`). The
upgrade is dynamic: a lap-count/weather-driven `rubberAmt` uniform that
darkens and lowers roughness along the line through a race, and a marbles
band (a sparse dark speckle noise 1-2 m off-line) that grows with laps and
resets on rain. rFactor 2's "RealRoad" is the reference model (rubber in,
rain washes it off, drying line emerges).
- Sources: https://www.studio-397.com/wp-content/uploads/2016/12/rF2_Track_Technologyv3.pdf

### 5. Brake-disc glow — SMALL, car-only
Emissive on the disc surface id as a function of a brake-temperature proxy
(decel × speed, decaying) — orange → yellow-white, bloom picks it up for free.
WGX/GLX mirror is one `select` on the car surface ids.
- Source: https://github.com/ac-custom-shaders-patch/acc-extension-config/wiki/Cars-%E2%80%93-Brake-Disc-FX

### 6. Valley / ground mist (volumetric-lite) — MEDIUM
A depth-reconstructed height-fog term in COMPOSITE (density ∝ exp(-(y-y0)/h),
integrated along the view ray analytically — no raymarch) gives Spa/Suzuka
morning mist in the dips. The full raymarched version (Heckel) is a later
step and should stay off below tier 2.
- Source: https://blog.maximeheckel.com/posts/shaping-light-volumetric-lighting-with-post-processing-and-raymarching/

### 7. Spectator / flag detail — SMALL
Crowd risers are instanced (`nature.js:637-987`): a per-instance phase
(hash of instance index) on a tiny vertical bob + a "wave" that travels along a
grandstand when the player passes. Flags: swap the single sine for the GPU
Gems two-wave form and read `frame.wind`.

### Considered and NOT recommended now
- **Atmospheric scattering sky (Hillaire / Hosek-Wilkie)** — the current
  procedural sky is already tuned per track|tod|weather by 17k lines of
  presets; a physical sky would invalidate them. Revisit only with the
  lighting-grid plan.
- **Per-object motion blur / DoF** — racing readability; the radial speed
  blur already covers the "speed" feel.
- **Compute-shader rain collision / GPU particles** — WebGPU-only; TLX must
  look the same on its WebGL2 fallback (`apex26.tlxForceGL=1` is what tests
  pin), and WGX/GLX would have no mirror.

## Suggested order
1 (sway) + 3 (wind) in one PR, since the sway wants a wind direction.
Then 2 in three slices: streak shells (replaces the canvas) → puddle ripples
→ lens droplets. 4, 5, 7 are independent one-afternoon items. 6 last.

## Sources read this session
GPU Gems 3 ch.16 (above); three.js TSL docs; Heckel's TSL field guide
https://blog.maximeheckel.com/posts/field-guide-to-tsl-and-webgpu/ ;
Lagarde Water Drop 1/2a/3b; Shadertoy MlfBWr, WfdyRX; ektogamat/threejs-conference;
GPU Gems 3 ch.27 motion blur
https://developer.nvidia.com/gpugems/gpugems3/part-iv-image-effects/chapter-27-motion-blur-post-processing-effect ;
Hillaire 2020 sky slides
https://blog.selfshadow.com/publications/s2020-shading-course/hillaire/s2020_pbs_hillaire_slides.pdf ;
rF2 track tech; ACC brake-disc FX; Unreal SimpleGrassWind thread
https://forums.unrealengine.com/t/another-way-for-waving-foliage-than-simple-grass-wind/25887 .
