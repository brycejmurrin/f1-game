# Model detail algorithms for procedural meshes: web research (2026-11-20)

Summary: Ranked techniques for giving the procedural car, wheels, cockpit, props and trees more visible detail on desktop WebGPU without authored models, with algorithm steps, pitfalls and sources.

Kind: research · Re-measure-by: 2026-12-20

Companion to [DESKTOP-GRAPHICS-TIERS-2026-11-20](DESKTOP-GRAPHICS-TIERS-2026-11-20.md) (§4 Phase 4 proposes an
authored hero car; this note is the procedural alternative and the shading work that helps either path). Nothing
here is built or measured. **Evidence class: `read` + `web`.** A claim marked *unverified* has one secondary source
or a forum figure; every cost below is an estimate for the laptop bench, not a measurement (no GPU here).

What the code already does, so the ranking starts from the right place (read on this branch):
- The car body is lofted from `{z, y, w, h, t, x}` stations swept as superellipses (`CarShade.loft`,
  `js/car/car-shade.js:133`), then `smooth()` (`car-shade.js:815`) averages normals under a 55° crease angle. Several
  parts already carry hand chamfers (`addTopBevel`, `addBeveledSpan`, `js/car/car-body-geom.js:24-25`).
- The body has **no UVs**; only decal quads carry UVs into the livery atlas (`js/car/car-mesh.js:50-58`).
- TLX already has clearcoat lobes, an analytic clearcoat env mirror and metallic-flake sparkle (`js/render/three/tsl-lit.js:7-8`).

## 1. Ranked table

Cost = extra GPU time on a desktop/laptop GPU at 1080p-1440p (estimate). Effort = this codebase.
Fit: B car body, W wheels/tyres, C cockpit, P props/buildings, T trees/crowd.

| # | Technique | What it buys | Desktop cost | Effort | Fits |
|---|---|---|---|---|---|
| 1 | Loft-parametric UVs (station arc length × section arc length) emitted by `loft()` | unlocks every texture-space detail below on the body; no new geometry | none (one vec2 attribute) | S: the loft already knows both parameters | B C |
| 2 | Geometric edge bevels on remaining hard edges + face-weighted normals | the edge highlight that makes hard-surface read as "real"; fixes the boxy wing/endplate/floor edges | +10-30 % car tris (about +1-3k) | M: generic chamfer pass in the builder | B W C P |
| 3 | Shader micro-detail via SDF/procedural masks in TSL: panel lines, fasteners, louvres, carbon twill, sidewall lettering | dense close-up detail at zero triangles; resolution-independent | 0.1-0.5 ms per car at hero size | M per feature; needs #1 | B W C |
| 4 | Refine-on-build: Loop or Catmull-Clark (1-2 levels) with semi-sharp creases on the hero car, or Phong tessellation for cheap rounding | smooth silhouettes on nose, pods, halo, helmet; ×4 / ×16 tris per level | 9.5k → 38k (1 level) → 150k (2): trivial on desktop | M (Loop on the existing triangle soup) to L (CC needs quad cages) | B C |
| 5 | Baked per-vertex AO / bent normal into vertex colour alpha (ray cast against the car's own BVH at build) | contact darkening in the cockpit, under wings, in pod undercuts; reads as depth | zero at runtime; build-time CPU (worker) | S-M | B C P |
| 6 | Paint/material upgrade: separate clearcoat vs base normal, anisotropic GGX for carbon and machined metal, orange-peel | the "showroom" highlight split and streak highlights on carbon | small; anisotropy is one extra lobe term | S (three r187 has `anisotropy` / `clearcoatNormal` on physical materials; TSL port into `tsl-lit.js`) | B W C |
| 7 | meshoptimizer `simplifyWithAttributes` LOD chain from the refined hero mesh (replaces hand rival LODs) | one high mesh → consistent LODs for rivals; error-driven switching | none at runtime; WASM decoder about 100 KB lazy | M | B W P T |
| 8 | Detail normal / height layer (surface-gradient blend) for tyre rubber grain, kerb, grandstand concrete | near-camera grain without UVs on the base layer via triplanar | 2-3 texture taps per pixel | M | W P |
| 9 | Parallax occlusion mapping on single flat layers (kerbs, gravel, building facades, cockpit floor) | apparent depth on flat panels | 8-32 taps per pixel on affected pixels | M | P C |
| 10 | three r187 `MeshletDrawingPipeline` (64-tri clusters, GPU cull, per-cluster LOD) for dense static scenery | lets scenery and track dressing go 5-10× denser where vertex-bound | gains only when vertex-bound; renderer-wide opt-in | M-L (untested with our custom TSL materials) | P T |
| 11 | Octahedral impostors for trees, distant buildings and crowd blocks | far density at quad cost | one quad + 1-4 atlas taps | M (third-party ports exist) | T P |
| 12 | Mesh decals (projected/conformed geometry) for stickers, stencils, wear | sharp print detail without enlarging the atlas | a few hundred tris each | S (`DecalGeometry` add-on) | B P |
| 13 | SDF modelling + dual contouring for organic props (helmet, seat, kerb sausages) | shapes lofts cannot make, with sharp features | CPU: 10-100 ms per mesh at 64³-128³ (estimate) | L | C P |
| 14 | Virtual geometry (Nanite-style) | billions of instanced triangles | WebGPU lacks 64-bit atomics; needs software raster | XL, research only | P |

Recommended order for an EXTREME car: 1 → 2 → 6 → 3 → 4 → 5, then 7 to rebuild rival LODs from the result.
Scenery: 11 → 9 → 10.

## 2. Subdivision and curved-surface refinement (topic 1)

**Why it fits.** Subdivision runs once at car build, on the CPU, on about 10k triangles: no compute shader is
needed. Two levels of Loop take 9.5k to about 150k triangles, the range the tiers note wants for a hero car.

**Loop (triangles; works on our existing output).** Steps:
1. Weld the triangle soup by position into a half-edge or edge map (the builder emits split vertices for hard
   normals; weld by position, keep a per-edge `sharp` flag where the dihedral angle exceeds the crease threshold
   already used by `smooth()`).
2. New edge vertex: interior edge `3/8 (a+b) + 1/8 (c+d)` (c, d the opposite vertices); crease or boundary edge
   `1/2 (a+b)`.
3. Update old vertex of valence n: `(1 - nβ) v + β Σ neighbours`, Warren's `β = 3/(8n)` for n > 3, `3/16` for n = 3.
   A vertex on exactly two crease edges uses `3/4 v + 1/8 (e1+e2)`; three or more crease edges (a corner): keep v.
4. Split each triangle into four; child edges of a crease edge stay crease.
5. Semi-sharp (DeRose 1998): give each crease a sharpness s; for the first ⌊s⌋ levels apply the sharp rule, then
   blend sharp and smooth by the fractional part; child sharpness is `s - 1` (Chaikin variant averages neighbours).
   s = 1-2 gives the "machined fillet" look; RenderMan/OpenSubdiv treat s ≥ 10 as infinitely sharp.
6. Recompute normals from the limit surface or simply re-run `smooth()`; interpolate vertex colour linearly.

**Catmull-Clark** needs a quad-dominant cage; our lofts are naturally quads (station × section ring), so a CC path
is possible only if lofts emit quads before triangulation. OpenSubdiv: "Catmull-Clark is more widely used and suited
to quad-dominant meshes"; Loop "requires purely triangulated meshes". Face-varying data (UVs) can be linear or
smooth per OpenSubdiv's `FVarLinearInterpolation` modes; for decal UVs choose `ALL` (linear) so atlas rects do not
drift.

**Interpolating schemes (modified Butterfly, Zorin 1996).** Keeps the original vertices fixed (useful: every
placement datum on the skin stays put), regular 8-point edge stencil `1/2(a+b) + 1/8(c+d) - 1/16(e+f+g+h)`, with
special stencils around valence ≠ 6. Only C1 and prone to ripples near irregular vertices; prefer Loop unless a
datum must not move.

**PN triangles (Vlachos 2001) / Phong tessellation (Boubekeur & Alexa 2008).** Need only positions and vertex
normals per triangle, no adjacency, so they work on any part. Phong: for barycentric (u,v,w),
`p* = (1-α) p_lin + α (u π_i(p_lin) + v π_j(p_lin) + w π_k(p_lin))`, with `π_i(q) = q - ((q - p_i)·n_i) n_i`; the
paper fixes **α = 3/4** (verified in the paper PDF). PN builds a cubic Bézier triangle (10 control points: corners,
two edge points per edge projected onto the vertex tangent planes, one centre) plus a quadratic normal; smoother than
Phong but costlier. Both need **split normals at hard edges or the crease balloons**; on a split edge, two
triangles bend differently and open a crack unless both sides use the same edge curve (average the normals for
position, keep split normals for shading).

**Verdict for a lofted car.** The cheapest win is not subdividing the loft output at all but **raising the loft's
own resolution** (more stations, more section segments): the loft is already an analytic surface, so its "limit" is
known. Use Loop with crease tags for the parts that are not lofts (blocks, foils, plates) where the shape is only a
cage, and Phong tessellation for small round parts (mirrors, halo, helmet) where adjacency is awkward.

## 3. Micro-detail without tessellation shaders (topic 2)

WebGPU has no hull/domain stages; detail is per-pixel or baked into vertices.

**Loft UVs first (rank 1).** For a station loft, `u = Σ station spacing` (metres along z) and `v = arc length around
the section` (metres). Metric UVs mean a carbon weave or rivet spacing is the same size everywhere. Add the attribute
in `loft()`/`loftRings()`; parts without a parameterisation use object-space triplanar.

**Procedural detail in TSL (rank 3), all from (u, v) or object position:**
- *Panel lines*: a 1D SDF per seam (`d = abs(v - v_seam)`), line mask `1 - smoothstep(w - fw, w + fw, d)` with
  `fw = fwidth(d)` for antialiasing; perturb the normal with the SDF gradient (a groove) and darken AO by the mask.
- *Fasteners / Dzus clips*: cell `c = floor(uv / pitch)`, local `q = fract(uv / pitch) - 0.5`, disc SDF `length(q) - r`,
  domed normal `normalize(q, sqrt(r² - |q|²))` inside the disc; hash `c` to drop or jitter heads.
- *Louvres / vents*: periodic SDF along one axis, slanted normal per slat; alpha-test or darken the gap.
- *Carbon 2×2 twill*: `i = floor(u·N), j = floor(v·N)`, tow on top `t = ((i + j) mod 4) < 2`; tangent = u or v
  axis by t (feeds the anisotropic lobe, rank 6); roughness and normal bulge vary as `sin(π·fract)` across the tow.
  Fade to the average colour/roughness as `fwidth(uv·N) > 0.5` to stop moiré (needs TRAA from the tiers note to hold).
- *Tyre*: F1 slicks have no tread; the detail is the sidewall. Polar coords `θ = atan2(y, x)`, `r = length(x, y)`
  on the sidewall annulus; lettering from an MSDF atlas sampled at `(θ·R / glyphPitch, (r - r0)/h)`, compound colour
  band as an `r` SDF; slight raised normal from the MSDF gradient. Wets: tread grooves as a periodic SDF in
  (θ, axial) with a groove normal.
- Normals from several sources combine by **surface-gradient addition** (Mikkelsen, JCGT 2020): convert each bump
  to a surface gradient, sum, resolve once. Blending tangent-space normals directly flattens them.

**Detail normal maps and POM (ranks 8, 9).** POM steps (Tatarchuk 2006): transform view to tangent space; sample
count `n = mix(nMax, nMin, |dot(N, V)|)`; march the height field from the top along `-V.xy / V.z · scale` in n
steps; on the first crossing intersect the line between the last two samples (linear refinement); use the hit UV for
all taps; optional soft self-shadow by marching toward the light. Fade out with distance and grazing angle; it needs
a height channel (our pack has none, see the tiers note §3) and a coherent UV (not hex tiling).

**Decals (rank 12).** three's `DecalGeometry` clips the target mesh against an oriented box and emits a conformed
patch with its own UVs; draw with polygon offset. Cheaper and sharper than growing the 2048×2560 livery atlas.

**Baked AO / bent normals to vertex colour (rank 5).** At build (worker): BVH over the car (three-mesh-bvh or a
small hand BVH), for each vertex cast 32-64 cosine-distributed rays over the hemisphere, offset by ε along the normal,
max distance about 0.5 m; AO = unoccluded fraction; bent normal = normalised mean unoccluded direction. Store AO in
colour alpha (or a second attribute), use bent normal for the env/diffuse lookup. 10k vertices × 64 rays is about
640k ray casts: tens to hundreds of ms in JS (estimate), so cache per part-set key. Vertex AO needs enough vertices
in concave areas; do it after subdivision (rank 4).

## 4. LOD generation and dense rendering (topic 3)

**meshoptimizer (npm `meshoptimizer`, WASM).** JS API (verified, repo `js/`):
`MeshoptSimplifier.simplify(indices, positions, stride, targetIndexCount, targetError, flags?)`,
`simplifyWithAttributes(indices, positions, stride, attrs, attrStride, attrWeights, vertexLock, target, error, flags?)`,
`simplifySloppy(indices, positions, stride, vertexLock, target, error)`, flags `LockBorder | ErrorAbsolute | Sparse |
Prune | Regularize | RegularizeLight | Permissive`; `MeshoptClusterizer.buildMeshlets(indices, positions, stride,
maxVerts, maxTris, coneWeight?)` plus `buildMeshletsFlex` / `buildMeshletsSpatial`. Recipe for the car:
1. Build the hero mesh (after ranks 2 and 4). Weld by position+normal+colour (the simplifier needs shared vertices).
2. `simplifyWithAttributes` with normal weight about 1 and colour weight about 0.5-1; lock livery seam/decal
   vertices with `vertexLock`; targets 50 %, 20 %, 8 %, 3 % of triangles; keep the returned error per level.
3. Pick LOD per car from projected error: `pixels = error · scale · screenH / (2 · dist · tan(fov/2))`, switch when
   below about 1 px; bias the error with speed (Microsoft's Simplygon article: speed hides LOD switches) and weight
   rear vertices (players see the car ahead from behind).
4. `simplifySloppy` only for far proxies: it ignores topology and seams.
Microsoft's guidance also: raise "ShadingImportance" (protect normals) on glossy paint, and use a remeshed proxy
with one baked material for far cars.

**three.js r187 meshlets (verified in the r187 release notes and PR #35191).** r187 added
`StandardDrawingPipeline`, `MeshletDrawingPipeline` and `VisibilityBufferDrawingPipeline`; examples were renamed
`webgpu_meshlets_*`. Opt-in is renderer-wide: `renderer.drawingPipeline = new MeshletDrawingPipeline()`.
`examples/jsm/utils/MeshletGeometryUtils.js` splits a geometry into 64-triangle clusters (padded with degenerate
triangles) and up to six LODs (ratios 1.0 → 0.015) using bundled meshoptimizer `simplifyWithAttributes` (normal
and UV weighted) with a `simplifySloppy` fallback. Per frame a compute pass does frustum, normal-cone and two-phase
occlusion culling with a depth pyramid; draws are indirect. Supports Mesh, InstancedMesh, LOD, material groups,
shadow maps, alpha test and node materials (`colorNode`, `normalNode`, `emissiveNode`, `opacityNode`, `positionNode`
with fitted bounds); unsupported content and the WebGL backend fall back. The PR says gains are largest when
vertex-bound and Sponza GPU time "stayed about the same". *Unverified for us*: whether our custom TSL materials
(`tsl-lit.js`), chunked track meshes and vertex colours pass through; whether LOD switching between clusters can crack
(the helper builds whole-mesh LOD levels, not a cluster DAG; read the source before relying on it).
**Fit:** our cars (about 10k × 22) are not vertex-bound; dense static scenery could be.

**Virtual geometry.** `nanite-webgpu` (Scthe) builds a meshlet DAG in the browser with WASM meshoptimizer + METIS
and reports 1.2-1.7 billion instanced triangles, nearly 98 % software-rasterised; it notes WebGPU has no
`atomic<u64>` (no visibility buffer; depth packed to u16), "no early-z", and a 128 MB default storage-buffer limit.
No fps or GPU named. `three-virtual-geometry` (npm, three ≥ r180) exists; numbers self-reported, *unverified*.
Research only for this game.

**Impostors (rank 11).** Octahedral (Brucks 2018): render the object from directions on a hemi-octahedron grid
(e.g. 8×8 or 16×16) into an atlas with albedo, normal and depth; at runtime map view direction to octahedral UV,
blend the three nearest frames by barycentric weights, use depth for parallax and correct shadow-map depth. three.js
ports exist (agargaro `octahedral-impostor`, author says still WIP). Pairs with the baked tree `*_lod1` models
([TREE-BUDGET-2026-10-19](TREE-BUDGET-2026-10-19.md)) and the crowd VAT plan ([crowd VAT](../plans/2026-10-19-crowd-vat.md)).

## 5. Procedural modelling approaches (topic 4)

**Lofting (what we have).** Upgrades that add visible detail cheaply: (a) stations from a spline (Catmull-Rom or
monotone cubic through the current stations) sampled adaptively by curvature, instead of straight spans between
stations; (b) section curves with per-corner superellipse exponents and per-corner radii so one section can be
crisp on top and round underneath; (c) emit quads + UVs (rank 1) so Catmull-Clark and texture detail are both
available; (d) keep "envelope" invariants (`car-shade.js` header) so placement data still hold.

**Edge bevel / chamfer (rank 2).** For an edge flagged sharp (dihedral above the threshold):
1. Offset each adjacent face plane inward by radius r; the new edge line lies on both offset planes.
2. Replace the edge with a strip of k segments (k = 1 chamfer, 2-3 rounded) sampled on the arc between the two
   faces; at a vertex where three sharp edges meet, fill the corner with a spherical triangle patch (or k=1 triangle).
3. Normals: large faces keep their face normal (face-weighted normals: weight by area so flats stay flat), strip
   vertices interpolate between the two face normals. Autodesk's Weighted Normals doc states the effect: with a
   zero-segment chamfer, "shading is blended across the chamfered faces rather than across the whole model".
4. Radius ≈ 3-8 mm at car scale, clamp to 1/3 of the shortest adjacent edge to avoid self-intersection.
Pitfall: the Polycount threads note bevels on curved loops cost as many vertices as hard splits; bevel only edges a
highlight should run along (wing edges, endplates, floor edge, halo, pod inlets).

**CSG / SDF.** `manifold-3d` (WASM, Apache-2.0) gives guaranteed-manifold booleans but needs closed input; a blog
claims a large union can block the event loop (*unverified*); run it in a worker. `three-bvh-csg` (JS) keeps
UVs/normals/groups. SDF modelling: compose primitives with smooth-min, sample on a grid, extract with marching cubes
(no sharp features, many triangles) or **dual contouring** (Ju 2002): per cell with a sign change, place one vertex at
the QEF minimiser of the edge-crossing planes (Hermite data), connect cells around each crossing edge; reproduces sharp
creases; use the QR form for stability. Cost grows with grid³; then meshopt-simplify the result. Fit: helmet, seat,
steering wheel, kerb profiles; not the main body (lofts already beat it).

## 6. Shading that makes low-poly read as detailed (topic 5)

- **Rounded-edge shader.** Blender's Bevel node does it by ray-traced normal sampling and is called slow (offline
  only). Real-time options: (a) bake the bevel into geometry (rank 2, best); (b) per-pixel *curvature* from
  `fwidth(N)` / normal-buffer differences used as an edge mask to brighten convex edges and darken concave ones
  (screen-space cavity, e.g. the URP ScreenSpaceCavity project). This is a look, not geometry; it fails in
  reflections and flickers without TAA.
- **Anisotropic GGX (rank 6).** three r187 `MeshPhysicalMaterial` has `anisotropy`, `anisotropyRotation`,
  `anisotropyMap` (RG direction, B strength) and clearcoat with its own `clearcoatNormalMap`. For our TSL path, the
  lobe needs a tangent: use the loft u direction, or the twill tow direction for carbon; brushed/machined metal
  (wheel rims, uprights) uses the radial or circumferential direction.
- **Car paint layers.** Common model: pigment base, metallic flakes in the base, glossy clear coat (renderer docs,
  Unreal Automotive Materials Pack: flakes, orange peel, chameleon, clear coat). Unreal 4.25 adds a separate
  "Clear Coat Bottom Normal" so flakes have their own normals under a smooth coat. A Forza Motorsport 5 GDC 2014
  talk covers their material engine; detail (capture maps for undercoats, real-time reflections only on the clear
  coat) is from a forum post, *unverified*. Stochastic glints (Jakob 2014 and follow-ups) are the high end of flakes;
  our existing sparkle is the cheap version. Orange peel: a low-amplitude noise normal on the clearcoat only.

## 7. What racing games and browser demos do (topic 6)

- **Gran Turismo 7:** about 500,000 polygons per car (official social post via GTPlanet); Yamauchi later cited about
  1,000,000 at the highest LOD; 270 days to build one car; Polyphony reduces by hand (Jaguar Vision GT 7M → 70k).
- **Forza:** forum estimate 50-60k LOD0, 30k LOD1 (*unverified*). FM6 GDC talk: grid 16 → 24 cars with no extra GPU
  budget via faster low-LOD car rendering (no triangle counts published).
- **Codemasters F1:** no published polygon counts found; CAD-sourced dimensions; a generic forum note describes LOD0
  cockpit, LOD1 chase/replay, LOD2 distance (*unverified*, game unnamed).
- **Browser:** no source gave triangles-at-60-fps on integrated vs discrete GPUs. Nearest: nanite-webgpu's instanced
  billions (no fps/GPU), the r187 meshlet PR's "vertex-bound" caveat, and a three.js forum estimate of about 60,000
  same-material draws per frame at 60 fps (*unverified*). Our own bench (tiers note Phase 0) must supply the number.
- Practical budget implied (my inference): a 150-250k triangle player car at LOD0 is cheap for a desktop GPU;
  cost moves to shadows (the car draws in 2-3 shadow passes) and the mirror pass, so cap the shadow/mirror LOD at the
  rival LOD.

## 8. Pitfalls

1. Subdivision moves vertices: anything placed on the skin (stripes, numbers, sponsor quads, `bodyAnchors`) must be
   re-projected or use an interpolating scheme. Keep placement on the analytic loft, not the refined mesh.
2. Triangle-count baselines (`tests/data/car-wing-foil-tris.json`, props ratchet) must stay at detail 0; the higher
   detail level is a separate build key, as the tiers note proposes.
3. Phong/PN on split normals cracks; weld positions for geometry, split only shading normals.
4. Procedural micro-detail aliases (moiré, sparkle) without TRAA; always fade by `fwidth` and ship TRAA first.
5. Vertex colour cannot hold texture-rate detail; baked AO needs vertex density in concave regions.
6. meshopt needs welded input; our builder emits per-face vertices at creases. Use `vertexLock` on decal seams.
7. Meshlet pipeline is renderer-wide and falls back silently; prove our materials actually run through it before
   counting on gains (live probe, not a unit test: see `docs/ARCHITECTURE.md` §Boot evidence).
8. Livery atlas UVs must survive every step (subdivision with linear face-varying interpolation, simplify with locks).
9. Build time on phones: every refinement runs only when the desktop detail level is set, in a worker, cached.

## Sources

- three.js r187 release notes: https://github.com/mrdoob/three.js/releases/tag/r187
- three.js PR #35191 (drawing pipelines, meshlets): https://github.com/mrdoob/three.js/pull/35191
- MeshletGeometryUtils r187: https://github.com/mrdoob/three.js/blob/r187/examples/jsm/utils/MeshletGeometryUtils.js
- three.js MeshPhysicalMaterial docs: https://threejs.org/docs/pages/MeshPhysicalMaterial.html
- meshoptimizer README: https://github.com/zeux/meshoptimizer
- meshoptimizer JS API: https://github.com/zeux/meshoptimizer/tree/master/js
- OpenSubdiv subdivision surfaces doc: https://github.com/PixarAnimationStudios/OpenSubdiv/blob/release/documentation/subdivision_surfaces.rst
- DeRose, Kass, Truong 1998, Subdivision Surfaces in Character Animation: https://graphics.pixar.com/library/Geri/paper.pdf
- RenderMan subdivision mesh app note (sharpness 0-10): https://renderman.pixar.com/resources/RenderMan_20/appnote.28.html
- Zorin, Schröder, Sweldens 1996, modified Butterfly: https://mrl.cs.nyu.edu/~dzorin/papers/zorin1996ism.pdf
- Vlachos et al. 2001, Curved PN Triangles (summary): https://en.wikipedia.org/wiki/Point-normal_triangle
- Boubekeur & Alexa 2008, Phong Tessellation: https://perso.telecom-paristech.fr/boubek/papers/PhongTessellation/
- Phong vs PN comparison (SBGames 2011): https://www.sbgames.org/sbgames2011/proceedings/sbgames/papers/comp/full/12-92248_2.pdf
- Tatarchuk 2006, Parallax Occlusion Mapping: https://www.advances.realtimerendering.com/s2006/Tatarchuk-POM.pdf
- Mikkelsen 2020, Surface Gradient Based Bump Mapping: https://jcgt.org/published/0009/03/04/paper.pdf
- Surface gradient explainer: https://zero-radiance.github.io/post/surface-gradient
- Ju et al. 2002, Dual Contouring of Hermite Data: https://www.cs.wustl.edu/~taoju/research/dualContour.pdf
- manifold-3d: https://npmjs.com/package/manifold-3d
- three-bvh-csg thread: https://discourse.threejs.org/t/three-bvh-csg-a-library-for-performing-fast-csg-operations/42713
- Autodesk 3ds Max Weighted Normals: https://help.autodesk.com/cloudhelp/2023/ENU/3DSMax-Modifiers/files/GUID-6BFC22D5-D9DA-45BC-87A7-D95BFAD083E1.htm
- Polycount face-weighted-normals discussion: https://polycount.com/discussion/comment/2577214/
- Blender Bevel shader node: https://docs.blender.org/manual/en/4.2/render/shader_nodes/input/bevel.html
- URP ScreenSpaceCavity: https://github.com/malyawka/URP-ScreenSpaceCavity
- Unreal Automotive Materials Pack: https://dev.epicgames.com/documentation/en-us/unreal-engine/automotive-materials-pack-in-unreal-engine
- Unreal 4.25 shading models (clear coat bottom normal): https://www.unrealengine.com/en-US/tech-blog/improved-shading-models-in-unreal-engine-4-25-and-beyond
- Forza Motorsport 5 shader talk (GDC Vault): https://gdcvault.com/play/1020556/contactUs
- Forza Motorsport 6 low-LOD cars (GDC Vault): https://www.gdcvault.com/play/1023973/contactUs
- Microsoft, vehicle LODs with Simplygon: https://developer.microsoft.com/en-us/games/articles/2025/12/level-of-detail-vehicle-models-simplygon/
- GT7 500k polygons: https://gtplanet.net/gran-turismo-7s-car-models-use-500000-polygons-each
- GT7 270 days per car: https://80.lv/articles/one-gran-turismo-7-car-takes-270-days-to-make
- Forza LOD forum estimate: https://discussions.unity.com/t/what-would-be-an-ideal-poly-count-for-a-mobile-racing-game/673701
- nanite-webgpu: https://github.com/Scthe/nanite-webgpu
- three-virtual-geometry: https://unpkg.com/three-virtual-geometry@0.1.3/README.md
- Octahedral impostors for three.js: https://discourse.threejs.org/t/octahedral-impostors-for-three-js/80318
- Octahedral impostor forest: https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735
