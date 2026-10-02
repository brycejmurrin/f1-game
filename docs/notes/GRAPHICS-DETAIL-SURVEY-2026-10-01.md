# Graphics, detail and texture survey — where the look is lost (2026-10-01)

Status: **RESEARCH / PROPOSAL** — no code changed. Companion to
[TLX-SHADER-IDEAS-2026-10-01.md](TLX-SHADER-IDEAS-2026-10-01.md) (its first slices —
foliage sway #636, rain streak field #646, puddle ripples #649 — have shipped and
are not re-proposed here). Method: three read-only code hunts (materials and
textures; lighting, shadows, AA and post; geometry, scenery, cars and LOD) plus a
web pass over current techniques and the three.js r186 TSL surface, each claim
re-read in the source before it was kept. Line numbers are the deploy tip
`8a3d867f`. The parity rule binds every item: a look ships on GLX, TLX and WGX or
is recorded as a gap (`docs/ARCHITECTURE.md` §Cross-backend parity).

## What exists today — the findings that matter

Three of these are bugs, not tuning. They are listed first.

### Bugs
- **The baked normal map is applied in a wrong tangent frame.** All three backends
  build `T = normalize(cross(up, N) + 1e-5)` (`glsl-lit.js:396`, `tsl-lit.js:953`,
  `wgsl-chunks.js:199`). On the ground the UV is world `xz` and `N ≈ up`, so
  `cross(up, N)` is the residual tilt left by the procedural bump that ran first:
  the scan's relief is rotated per pixel by noise and reads as noise. On walls the
  UV `x` runs along world `+z` for ±x faces and `+x` for ±z faces, while `T`
  comes out `−ẑ` on `+x` faces and `−x̂` on `−z` faces — the horizontal relief is
  mirrored on two of the four wall orientations. The procedural wall bump uses the
  same `T` (`glsl-lit.js:430-436`) so mortar and plank seams read as ridges on those
  faces. WGX perturbs with epsilon `(1e-5,0,0)` where GLX/TLX use `vec3(1e-5)`.
- **The normal texture's B channel is written and never read.** The bake stores
  height (synthetic, `tools/gen/assets.mjs:486`) or AO (`bake-material`) in B; every
  backend samples `.xy` only (`glsl-lit.js:395`, `tsl-lit.js:949-952`,
  `wgsl-chunks.js:198`). A free cavity term is sitting in VRAM.
- **The albedo A channel (roughness) is near-constant per layer, yet the shader
  mixes 80 % toward it** (`matSurface`, `assets.mjs:401-440`; `glsl-lit.js:598-600`,
  `tsl-lit.js:976-979`, `wgsl-chunks.js:346-347`). It overrides the procedural
  roughness variation including the repair-patch term (`glsl-lit.js:1131`): the
  channel removes detail instead of adding it.

### Limits that flatten the picture
- **The shipped default renderer has no geometric anti-aliasing.** TLX's scene
  target is single-sample (`tlx-post.js:161`); `antialias: !_liteGpu` (`tlx.js:350`)
  multisamples only the canvas, which receives one fullscreen FXAA quad (the comment
  at `tlx.js:338-347` says so). GLX has MSAA 2×/4× on desktop (`glx/post.js:166-188`).
  Both then run a compact 5-tap FXAA (`glsl-post.js:1300-1329`).
- **Sun shadows end about 67 m from the eye.** One snap-cached map over a ±80 m
  box (2048² desktop, 1024² mobile, 512² on software GL), fading out between 0.62
  and 0.84 of the range (`glsl-lit.js:782-784`, `tsl-lit.js:566`,
  `wgsl-chunks.js:1242`; `shadow-pass.js:198-204`). Grandstands, buildings and
  tree lines beyond that are unshadowed and read flat. Night: only the nearest
  floodlight casts (`glx/shadow.js:16`).
- **Sun specular is hard-capped at 1.0** by `specCol/(1+specCol)` (`glsl-lit.js:1462`,
  `tsl-lit.js:1772`, `wgsl-chunks.js:1340`) against a day bloom threshold of 0.78
  (`game.js:8179`): sun glints on wet tarmac, chrome and visors barely bloom.
- **Only the car clearcoat sees the real environment.** The live 64 px env cube
  (`glx.js:142`) is sampled by clearcoat alone (`glsl-lit.js:1556-1571`). Glass,
  METAL and the wet road reflect a two-colour `mix(horizon, zenith)` gradient
  (`glsl-lit.js:1626-1663`, `tsl-lit.js:1867-1886`, `wgsl-chunks.js:1520`); rough
  dielectrics (> 0.4) get no ambient specular at all.
- **Ambient is a per-time-band constant** (`atmosphere.js:82-152`), never
  occluded at large scale: the Monaco tunnel, pit garages and under-stand areas
  get full open-sky ambient. SSAO (half-res, 8 taps) and the contact march multiply
  the whole HDR colour (`glsl-post.js:743`), so they darken direct sun and emissives
  too.
- **"Triplanar" is one hard-switched plane**: wall-like MATs use
  `(an.x > an.z ? z : x, y)`, everything else `xz` (`glsl-lit.js:369-378`). Buildings
  at arbitrary yaw stretch up to 1.41×; rock, foliage and snow on steep faces smear.
  TLX/WGX pick the plane from the already-bumped N, GLX from `vNrm` — a parity gap
  near 45°.
- **Kerbs are `MAT.FLAT`** with per-vertex stripe colour on rings ~1.33 m apart
  against a 1.6 m stripe (`mesh.js:306-360`): most kerb segments are red↔white
  ramps with an irregular period, not crisp stripes, and the profile is one flat
  0.9 m ribbon on every circuit.
- **The racing-line wear is a fixed centre band** — `wearF(v)` darkens columns 5–8
  (`mesh.js:536,627-629`) and ignores `track.line`, although `TrackLine.bake` runs
  before `buildRoad` (`tracks.js:171` vs `:316`).
- **No geometry LOD anywhere.** Culling is frustum plus the far plane; instanced
  cells (72 m, `tracks.js:373`) have no distance test (`inst-cells.js:14`,
  `tlx.js:1562-1600`). AI cars are full detail (7.8k tris, ~21k verts body +
  2.6k-vert wheels) at 900 m (`car-draw.js:645-652` gates only brake rings and
  compound stripes). Twenty-one AI cars ≈ 0.7 M verts a frame before shadow passes.
- **Vegetation is faceted cone stacks with flat per-face normals**
  (`geom.js:126-147`, `nature.js:236-332`); only pines are instanced
  (`nature.js:209`). Fleet-wide, 31k broadleaf trees, 4k palms and 4k bushes are
  baked into the props soup. Density per km runs from 5 (Bahrain, Qatar) through a
  median ~300 to 2,250 (Zolder); Spa sits at 493 and Catalunya at 41.
- **Terrain is a 120 m ribbon on a flat floor** (`surface.js:39,138-140`); past it
  the world is one 4-vertex flat-coloured quad with no material id
  (`mesh.js:940-962`). Spa's 102 m elevation range sits on a plateau with skirts.
- **Wheels have no spin blur**: a rotation matrix at ~3.7 rad/frame at 80 m/s
  (`car-draw.js:632-664`) aliases past π, so spokes stall or run backwards.
- **ULTRA equals HIGH**: both are tier 0 (`quality-preset.js:14-19`); render scale
  is clamped ≤ 1 (`glx.js:1103`), anisotropy ≤ 4× everywhere (`glx.js:667`,
  `tlx.js:2954`, `wgx.js:1483`), scenery density never reads the preset.
- **Car paint is already rich** (clearcoat, orange peel, flakes, pearl, satin). The
  carbon weave exists only on finish 31 with no footprint fade (3.3 cm `sin·sin`
  moirés at range; `glsl-lit.js:1106`); the real carbon surface 21 gets roughness
  and spec only.
- **Pack facts**: 14 synthetic 256² layers (128² mobile), ~2.2 MB PNG; GLASS and
  FLAG are never baked; `assets.mjs:27-30` still says ASPHALT is a Poly Haven scan
  (stale). Raising the array to 512² would put the normal PNG alone near 5 MB of the
  8 MB budget and VRAM from ~11 to ~47 MB — not for the mobile tier.
- **Line budgets are full**: `glx.js` 2776/2777, `game.js` 9660/9661, `car3d.js`
  4096/4097. New code lands in shader files, `mesh.js`, `shadow-pass.js`,
  `car-mesh.js` or a new module, none of which is ratcheted at the limit.

## Proposals, ranked by payoff ÷ cost

Sizes: XS < 20 lines per backend, S < 60, M < 200, L more. "Verify" names what
this GPU-less CI can judge (SwiftShader pixel A/B is deterministic for pure maths)
versus what needs `gpu-census.yml` on macOS (MSAA, anisotropy, shadow resolution,
frame time).

### Tier A — bugs and near-free wins (one PR each, or two paired)

1. **Fix the material tangent frame and the wall-bump sign** — XS × 3 backends,
   zero perf. In `applyMaterialTexNormal` perturb along the axes the UV actually
   maps to: ground `N += (dx·x̂ + dy·ẑ)·amt`; walls `T = an.x > an.z ? ẑ : x̂`,
   `B = ŷ`; same `T` for the procedural wall bump; pick the plane from `vNrm` on
   TLX/WGX as GLX does. Every baked surface changes how it is lit — intended, but
   look at it. Verify: `wgx-validate.mjs --static`; `backend-compare` of one brick
   building from a `+x` and a `−x` face; `__apex.matTex(0/1)` A/B; a static
   assertion in `surface-id-parity.test.mjs` that the three frame expressions match.
2. **One rebake: cavity in B, real roughness in A** — S, generator plus ~6 shader
   lines × 3. Bake mean-normalised cavity `h − blur(h)` into B (`bakeOneSize`,
   `assets.mjs:486`); shader `albedo *= mix(1, cav, k·0.6)` and scale ambient by it
   (WGX already has `litNrm` in scope at `wgsl-chunks.js:1127`; GLX/TLX pass the
   normal sample into `applyMaterial`). Give `matSurface` real variation: aggregate
   chips −0.12, binder +0.04, mortar +0.08, worn brick −0.06, rust and scuffs;
   asphalt within ±0.05 (the road is viewed edge-on all race — `geom.js`
   MAT.ASPHALT note). Turn the 80 % replace into replace-plus-offset so patch
   roughness survives. This is the term that makes texture read under overcast and
   at night, where hemisphere ambient ignores N. Verify: `assets-pack.test.mjs`,
   `tools/gen/assets.mjs verify` (budget, md5), overcast and night A/B shots, a
   dawn `backend-compare` and a `motion-capture` flicker clip on a straight.
3. **Give TLX's scene the samples** — S, TLX only (GLX/WGX already do this).
   `samples: 4` on `sceneRT` (`tlx-post.js:161`) with `resolveDepthBuffer: true`
   (r186 WebGL2 resolves depth via `blitFramebuffer(DEPTH_BUFFER_BIT)`), and
   `antialias: false` at `tlx.js:350` whenever post is up. Two RGBA16F attachments
   at 4× ≈ 130 MB at 1080p: shrink the SSR-tag attachment to R8 and gate 4× to
   desktop tier 0 (WebGPU allows 1 or 4 only). Risk: core WebGPU cannot resolve
   depth, so the WebGPU backend may need view depth in an MRT channel; a resolved
   SSR tag averages across edges. Verify: `material-shimmer.spec.js`, `render-boot`;
   software adapters force MSAA 1, so the proof is `gpu-census.yml` on macOS. This
   is the highest-payoff single item: the default renderer has no geometric AA.
4. **Let the sun specular go HDR** — XS × 3. Replace the hard Reinhard with a knee
   `spec/(1+spec/K)` behind a LightTune knob (`knobs.js`, default K ≈ 4) at the
   three cap sites. Fireflies are held by the existing specular AA and Karis
   bloom. Verify: `tools/lighting/ab-lighting.mjs`, `lighting-ab.spec.js`
   (deterministic on SwiftShader).
5. **Rounded normals on foliage crowns** — XS, no extra vertices, all backends
   automatically. An `out._nrmAt` callback in `emit` (`geom.js:144`), after the
   `out._matAt` sway hook (`nature.js:234`, `graph.js:44`), blends each crown
   vertex's normal toward "away from crown centre" so faceted cones light like soft
   volumes; set it in `tree`, `pine`'s recorder, `bush`, `stonePine`, `cypress`.
   Verify: `track-verts --diff` and `props-tri-ratchet` unchanged; before/after
   shots.
6. **Crisp kerbs and a rubber line that follows the real line** — S, `mesh.js`
   only, free on every backend. In `ribbon()` insert rings exactly at `m·STRIPE_M`
   and emit each boundary ring twice (colour A, then B) so stripes are hard-edged;
   node endpoints unchanged so terrain seams and coplanar audits hold; optionally
   `mat = CONCRETE` for grain. Replace `wearF(v)` with a function of
   `|o − track.line[k]|`: dark band ±1.2 m, slightly cleaner off-line, a dusty
   marbles tint > 3 m off-line at corner exits (`track.lineCorners`). Render-only,
   so the "arc must not reach the driver" rule holds (surface column). Verify:
   `verify-track` on 2–3 circuits, a kerb close-up via `shot.mjs`, a top-down
   `render({what:"map"})`, `npm run test:sweeps` (fleet geometry).
7. **Env cube for world glossy surfaces** — S, ~10 lines × 3. In the `envBlend`
   block mix `textureLod(uEnvCube, R, rough·2.5)` over the analytic gradient by
   `uEnvStr`, weighted down with distance from the probe (~150 m, parallax); keep
   the gradient as the fallback when the probe is shed at tier ≥ 1. Wet tarmac
   outside SSR coverage, glass and METAL then show clouds, sun tint and stands.
   Check first whether the probe excludes the player car. Verify: wet-race A/B
   shots, `gfx-probe --backend three` ×2 with `gpuErrors 0`, then
   `gpu-census.yml` (the TLX/WGX rule).
8. **Carbon weave: footprint fade and surface 21** — S, ~4 lines × 3. Fade the
   finish-31 weave by `fwidth(wv)`; extend a subtler weave plus a tiny twill
   normal tilt to surface 21 so floor, wings and halo read as carbon in cockpit and
   close-up. Verify: `carview.html` close-up, a clip at 30 m for moiré.

### Tier B — medium, the big look changes

9. **Far shadow cascade** — M (150–250 lines), desktop tier ≤ 2. A second
   snap-cached sun map (1024–2048² over ±400–600 m, step 100–150 m so rebuilds are
   rare); lit fragments past the near fade take 4 hardware-PCF taps, and the near
   fade cross-fades into it instead of into "no shadow". Where: `shadow-pass.js`
   `sunPass`, `glx/shadow.js`, `tlx-shadow.js`, `wgx-shadow.js`, three lit shaders.
   `LIT_FS_ROWS` (286, `glx.js:791`) needs +5; TLX-lite has a 224-row ceiling; the
   `glx.js` ratchet forces the code into `shadow.js`/`shadow-pass.js`. Verify:
   `shadow-pass-depth.test.mjs` extended for the span; quality on `gpu-census`.
   Reference: GPU Gems 3 ch. 10 (parallel-split shadow maps); r186's `SunLight`
   addon does 2 cascades but is ESM-only (see §Not recommended).
10. **FXAA 3.11 Quality (edge walk) or SMAA 1×** — M, ~80 shader lines × 3,
    0.2–0.4 ms on phones, all tiers (keep the compact one at tier 4). Phones and
    TLX rely on FXAA alone and the 5-tap version fails on long near-horizontal
    edges (barrier tops, kerbs, horizon). Verify: pure maths, so
    `image-grade-visual.spec.js` / `material-shimmer.spec.js` pixel diffs here.
11. **Distance cull per instanced batch** — S, shared code (`InstCells.collectVisible`
    gets an eye position and a per-batch `maxDist` scaled to model size: crowd
    ~250 m, posts ~300 m). The enabler for 13, 16 and 17; judge with draw/instance
    counters plus a `gpu-census` A/B, not local timing — the perf plan has not
    settled whether frames are vertex- or draw-bound.
12. **Pre-baked rubber and skid streaks at braking zones** — S–M, built once per
    track from `toTurnIn` / `lineCorners`, offset above the road like the grid-box
    paint (`mesh.js:1025`); the rubber-wear shader exists (`tsl-lit.js:969`). The
    cheapest decal form for a track is a strip mesh along arc `s` using the lateral
    `x` already available, identical on all backends. Verify: `verify-track`,
    `coplanar-audit` baseline (z-fighting), sweeps.
13. **Car LOD for the AI field** — M. A far body ~4k verts and a plain ~150-vert
    wheel beyond ~60 m with hysteresis, also for shadow casters beyond ~40 m. A new
    car-LOD module under `js/car/` (manifest entry + `gen-shell`), a `:lod` key in
    `car-draw.js` `teamMesh` (`:146`). Verify: a vertex-count node test,
    `car-mesh-anchors.test.mjs`, one car spec.
14. **Wheel spin-blur layer** — S–M. Above ~1.5 rad/frame draw a blurred-rim alpha
    disc (queued like the brake rings in `_rq`) instead of the spoked rotating
    layer. Builder in `car-mesh.js` (`car3d.js` is full), swap in
    `car-draw.js:653-668`. Verify: carview shots, a builder vertex-count test.
15. **Route AO to ambient and contact shadows to the sun term** — M. The lit pass
    exports an ambient fraction (TLX: spare channel of MRT attachment 1; GLX: a new
    MRT, alpha holds the SSR tag; WGX likewise); the composite does
    `c *= mix(1, ao, ambFrac)`. Changes the calibrated look, so ship behind a knob
    at the old behaviour and A/B. Removes AO halos on sunlit surfaces and neon.
16. **Large-scale sky visibility for tunnels and roofs** — M. At track load bake a
    top-down min-height map into the XZ tile atlas `lamp-bake.js` already builds
    and samples (`glsl-lit.js:1299-1318`); scale `amb` by ~0.3 under cover. Monaco's
    tunnel, garages and under-stand areas finally go dark. Deterministic via
    `__apex` probes.
17. **Instance the remaining vegetation** — M. Quantised variant keys for
    broadleaf, palm, bush, stone pine and cypress as pine does (`nature.js:209`);
    move the terrain-culled understorey wedges (`nature.js:292-306`) out of the
    model so nodes stay `full` (`graph.js:291`). `props-tris-baseline.json` drops
    and needs lowering; TLX skips instanced batches on software adapters
    (`tlx.js:573-588`), so screenshots here need `apex26.tlxForceBatches=1` and the
    proof is hardware TLX. Verify: `graph-parity.cjs`, `props-tri-ratchet`.
18. **Biplanar walls and anti-tiling for ground layers** — M, desktop tier ≤ 1.
    Walls: blend the x- and z-planes by `an^k` for wall-like layers (+1 sample on
    wall pixels), mirrored in the procedural `matBumpHeight` coordinates so pattern
    and scan agree. Ground: a second sample at ~×0.37 scale rotated ~37°, blended by
    low-frequency noise, for SAND, GRASS, ASPHALT; or Quilez's 2-fetch variant.
    Measure the payoff with an aerial/TV-cam shot first — the existing
    low-frequency tints already hide some repetition.
19. **Kerb profiles per circuit** — M. A `def.kerbStyle` (flat, sawtooth, sausage,
    double with a green astro band), 3–4 lateral verts with a crowned top and outer
    lip, a real pack material. Keep the peak ≤ today's +9 cm or wheels sink
    (physics reads only `onKerb`). Add the field to `circuit-def-fields.test.mjs`;
    no `scenery(api)` member needed. Verify: `verify-track`, `coplanar-audit`,
    `clip-audit`, sweeps.
20. **Give ULTRA a meaning** — S for the constants, M for density. Anisotropy 4→8
    (or 16) on the MAT array at the three cap sites; `renderScale` up to 1.5 on
    DPR ≤ 1 displays when the governor has headroom (lift `glx.js:1103` and its
    twins); optionally a 4096² sun map; a desktop detail tier that raises
    `forestEdge` depth, bushes and crowd through engine generics reading a def or
    theme key, passed into the build key (`build-client.js:87`) like `mobileTier`.
    The props-tri ratchet stays measured at the default preset. Judge on
    `gpu-census`.

### Tier C — large or speculative
21. **Far-terrain heightfield in place of the flat floor** — M–L, the biggest look
    change on hilly tracks (Spa, Red Bull Ring, Nürburgring, Interlagos, Suzuka). A
    ~48 m grid over the bbox plus margin (~15k verts), height from the nearby
    ribbon plus low-frequency noise, `MAT.GRASS`, stitched to the ribbon's last
    rail instead of easing to `floorY` (`mesh.js:940`, `surface.js:113-141`). High
    risk: `floorY` is a shared datum for `pyMin`, banking, `Tracks.terrainY`, the
    buried-face strip and the ground/float audits. A horizon silhouette ring in the
    three sky passes is the cheap alternative for hiding the floor seam.
22. **Limited auto-exposure** (log-average from the deepest bloom mip, ±1 stop,
    game-clock driven, "darkening only" default for tunnels), **shadows from 2–4
    lamps at night** (a 1024² atlas of 512² tiles, desktop tier 0–1),
    **hue-preserving tone curve option** (Khronos PBR Neutral or AgX exist in
    vendored three but need GLSL/WGSL ports), **a GRAVEL material id 17** (the
    runoff is `MAT.ROCK`, `mesh.js:857`; touches `MAT_LAYERS`, `uMatTexScale`,
    the TLX layer clamp, WGX packing, the MAT lockstep test), **crowd figures**
    (~40-vert torso-plus-head in near cells, boxes far; needs item 11 — Fuji has
    17k instances), **instanced verge grass clumps** (ULTRA only, solid prisms
    because there is no alpha-cutout path, reusing the FOLIAGE sway weight; shimmer
    risk), **data-only dressing of sparse circuits** (Catalunya 41 trees/km, Spa
    493, Jacarepaguá and Paul Ricard ~20; Qatar 49 crowd bodies) via the
    `scenery-dress` skill, one circuit per PR.

### Considered and NOT recommended now
- **three r186 display addons as the TLX implementation** (`FXAANode`, `SMAANode`,
  `TRAANode`, the new `SSAONode`, `GTAONode`, `SSRNode`, `DepthOfFieldNode`,
  `SSSNode`, `SunLight`/`CSMShadowNode`): every one is an ES module importing
  `three/webgpu` and `three/tsl`, loadable only through the import-map island
  (`index.html:3303-3309` maps `three/addons/` to the generated
  `vendor/three-0.186.0/addons/`, which only `tools/gen/vendor-three.mjs` may
  extend). Using them would make the look TLX-only — a parity gap by construction.
  Read them as reference ports instead (the r186 `SSAONode` Vogel disk and the
  `SMAANode` fixes are the two worth porting by hand).
- **Linear/sRGB workflow conversion**: breaks the stated no-sRGB calibration
  invariant (`tlx.js:1113/1152/2874`) and would re-tune ~17k lines of presets.
- **TAA**: no motion vectors on any backend; vertex-animated foliage and flags; the
  dither is deliberately world-anchored because there is no TAA
  (`glsl-lit.js:846-850`).
- **Parallax occlusion mapping**: 8–32 taps per pixel, not for phones; a contact
  pass or baked cavity (item 2) buys most of the effect.
- **512² texture array** (budget and VRAM above) and **real CC0 scans** as a
  blanket replacement: the synthetic bake plus items 1–2 should be A/B'd first;
  a Poly Haven asphalt or concrete scan via `fetch` + `bake-material` is a
  follow-up that needs CREDITS rows (`assets.mjs verify` gates licences).
- **`MeshPhysicalNodeMaterial` clearcoat/anisotropy/iridescence**: the car paint
  already has its own hand-written clearcoat on all three backends; adopting
  three's would be TLX-only.

## Suggested order (one PR per line, each small enough to bisect)
1. Item 1 (tangent frame + wall-bump sign) — a bug fix, no perf, lands first.
2. Item 2 (one rebake: cavity B, roughness A) — pairs naturally with 1.
3. Item 4 (specular knee) with item 7 (env cube for world gloss) — the wet-race
   payoff, both deterministic here.
4. Item 6 (kerb stripes + line-following rubber) — `mesh.js` only.
5. Item 5 (rounded foliage normals) and item 8 (carbon weave).
6. Item 3 (TLX MSAA) — needs a census leg; keep it alone so a regression bisects
   to it (the garage blackout of 2026-10-01 is the reminder).
7. Items 9–11, then 12–20 as capacity allows; 21 only with a dedicated audit plan.

## Sources read this session
- three r186 TSL: the TriplanarTextures node
  (https://raw.githubusercontent.com/mrdoob/three.js/r186/src/nodes/utils/TriplanarTextures.js),
  the BumpMap node (…/src/nodes/display/BumpMapNode.js), the PMREM generator
  (…/src/renderers/common/extras/PMREMGenerator.js), display addons
  (https://github.com/mrdoob/three.js/tree/r186/examples/jsm/tsl/display),
  the SunLight and CSMShadowNode addons (…/examples/jsm/lights, …/examples/jsm/csm),
  release notes (https://github.com/mrdoob/three.js/releases/tag/r186),
  `MeshPhysicalNodeMaterial` (https://threejs.org/docs/pages/MeshPhysicalNodeMaterial.html),
  `DecalGeometry` (https://threejs.org/docs/pages/DecalGeometry.html).
- Surface detail: Inigo Quilez, texture repetition
  (https://iquilezles.org/articles/texturerepetition/) and fog
  (https://iquilezles.org/articles/fog/); Mikkelsen, hex-tiling, JCGT 11(3)
  (https://jcgt.org/published/0011/03/05/); Catlike Coding, triplanar mapping
  (https://catlikecoding.com/unity/tutorials/advanced-rendering/triplanar-mapping/);
  LearnOpenGL, parallax mapping (https://learnopengl.com/Advanced-Lighting/Parallax-Mapping);
  Unity URP decals
  (https://docs.unity3d.com/Packages/com.unity.render-pipelines.universal@17.0/manual/renderer-feature-decal.html);
  blue noise (https://momentsingraphics.de/BlueNoise.html).
- Specular AA and shading: Toksvig mipmapping normal maps
  (https://developer.download.nvidia.com/whitepapers/2006/Mipmapping_Normal_Maps.pdf);
  Tokuyoshi & Kaplanyan, geometric specular AA, JCGT 10(2)
  (https://jcgt.org/published/0010/02/02/); Filament
  (https://google.github.io/filament/Filament.md.html); Ramamoorthi & Hanrahan,
  irradiance environment maps (https://graphics.stanford.edu/papers/envmap/);
  Hillaire, scalable sky (https://diglib.eg.org/items/8a3e5350-18b3-46bd-9274-3add5af88c75).
- Shadows, AO, grass, impostors: GPU Gems 3 ch. 10
  (https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-10-parallel-split-shadow-maps-programmable-gpus);
  Unreal contact shadows
  (https://dev.epicgames.com/documentation/en-us/unreal-engine/contact-shadows-in-unreal-engine);
  GPU Gems ch. 7, grass
  (https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-7-rendering-countless-blades-waving-grass);
  octahedral impostors (https://shaderbits.com/blog/octahedral-impostors — title
  only confirmed, body did not fetch).
- Licences: ambientCG CC0 (https://docs.ambientcg.com/license/), Poly Haven CC0
  (https://polyhaven.com/license), Kenney CC0 (https://kenney.nl/support) — none
  carries an attribution clause; every import still needs a CREDITS row.
