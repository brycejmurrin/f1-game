# Rendering & geometry improvements — analysis and options

Status: **research**, 2026-07-31. Nothing here is a commitment; it records how the
generation pipeline actually works today, what it measurably costs, and which
external techniques are worth adopting *given this codebase's constraints*.

Read `docs/ARCHITECTURE.md` first for the module map. This doc is about the
geometry/shading pipeline specifically.

> **Sourcing caveat.** The external research behind Part 3 was gathered under an
> egress proxy that returned 403 to most non-GitHub hosts, so several citations
> come from search-result extracts rather than full page reads. The Filament and
> Lazarov/Karis GLSL was fetched verbatim from GitHub raw. Verify a link before
> leaning on it.

---

## Part 1 — how it works today

### The pipeline

| stage | where | what happens |
|---|---|---|
| def normalisation | `tracks.js:1917-1970` | palette resolved; `def.points = realPoints(id) \|\| centerline(segs)`. Most shipped circuits resolve to **OSM traces** via `CircuitPaths` — `segs` is the fallback, not the primary path. |
| centreline | `spline.js:21-64` | heading walk at `SCALE = 1.45`, ~14 m / 13° step cap, closure deficit redistributed toward net ±360°, residual ramped out, 2 Laplacian smoothing passes. |
| node bake | `tracks.js:34-174` | Catmull-Rom at `SUB = 16`, then **uniform resample to ~4 m nodes** (`n = max(200, total/4)`). Bakes 11 parallel `Float32Array`s + curvature LUT + bank. |
| mesh build | `tracks.js:178-225` | floor → road → terrain → props → gate → startline, each wrapped in `safe()`. |
| upload | `glx.js:401-445`, `chunked.js:62-141` | `createMesh` for road/terrain/floor; `createChunkedMesh(geo, 72)` for props and glass. |

Build-order coupling is real but implicit: `buildProps` raycasts the **built
terrain mesh** for grounding, and the physics barrier limits `barL`/`barR` are a
**side effect of scenery emission** (`tracks.js:499-515`, read by
`spline.js:190`). A cosmetic prop change can move where the car may drive.

### Road

Fixed **14-vertex cross-section per node** (`mesh.js:336-346`) — 78 indices +
14 verts per node. Every painted marking is *geometry*: vertex columns 2-3 and
10-11 exist purely to make a hard paint edge by placing two verts at line colour
then stepping 5 cm into asphalt.

Known artefacts that fall out of this:

- Banking is applied as a **vertical shear**, and the emitted normal is the
  unmodified node up-vector (`mesh.js:388`) — banked corners are *shaded as if
  flat*.
- The centre dash is `floor(s/7) % 2` sampled on a 4 m node grid
  (`mesh.js:343`) — the dash pattern aliases against the sampling grid.
- `stripeNodes = max(1, round(1.6/ds))` evaluates to 1 at ds≈4 m
  (`mesh.js:158`), so an intended 1.6 m kerb stripe renders at ~8 m.

### Terrain

Rails at lateral seeds `[2.2, 7, 14, 48, outerW]` (street: `[5,10,16,22,28]`),
subdivided to ≤16 m (`surface.js:28-34`). Height is a closed-form
`heightAt(k, dist)` (`surface.js:77-97`), not a heightfield.

There is **no shared-vertex stitching with the road**. The ~0.3 m step is hidden
by a double-sided vertical **skirt** (`mesh.js:419-461`) costing 4n extra verts
and 24 indices/node. Terrain is then carved against the road by a heuristic clip
with ~8 tuned constants (`mesh.js:591-673`), and `faceSafe` (`mesh.js:683-695`)
resolves conflicts by **deleting** triangles whose centroid sits over tarmac —
punching holes rather than re-triangulating. Terrain normals are literally
`(0,1,0)` for every vertex (`mesh.js:675`) *after* that carving.

Depth ordering is handled by magic epsilons throughout — road `+0.02`, shoulders
`-0.05/-0.02`, kerb `+0.06/+0.03`, start line `+0.05` — with no polygon offset.

### Props

Box/cylinder/cone composites with **zero vertex sharing**: `addBox` pushes 24
verts for an 8-corner box (`geom.js:65-72`), forced by flat shading (one face
normal per vertex). Placement is fully deterministic — the only randomness is
`hash(i) = fract(sin(i*12.9898)*43758.5453)`, always seeded from `k`/`side`/
`dist` — so a day↔night rebuild reproduces byte-identical layout.

Two occupancy systems arbitrate: `masses[]` rectangle-vs-rectangle SAT, and
`barSegs`, a world-XZ segment index. All foliage is deferred until after
`def.scenery()` returns so the barrier index is complete when the guard runs.

City dressing runs three `every()` sweeps at fixed intervals: front row every
**18 m**, back row every **26 m**, sign blades every 34 m, billboards every 80 m
(`tracks.js:1461-1527`). Silhouettes come from 18 archetypes
(`scenery-data.js:42`), only 4 of them non-boxy; window grids are hard-capped at
6 columns × 10 rows (`scenery-city.js:52-53`).

### Car & renderer

Car is **11,064 verts / 3,880 tris** — 2.85 verts per triangle, because `addTri`
(`car3d.js:116-130`) writes 3 fresh vertices per triangle. Wings are
zero-thickness single quads. Base paint is vertex colour; sponsors are a
*separate* textured mesh over a canvas-2D atlas, drawn by a decal shader
(`fx.js:77-96`) that is **lambert + ambient only** — no shadow, no point lights,
no fog. Logos read as stickers, brightest where the paint is darkest.

The lit shader is more sophisticated than the geometry feeding it: Cook-Torrance
GGX + height-correlated Smith, clearcoat, metallic flake, analytic env mirror,
plus SSAO / godrays / 5-level Karis bloom / SSR / FXAA in the post chain. But:

- **Not energy-conserving** — `lit.js:757` adds full Lambert diffuse and then
  adds specular with no `kD = 1-F` split.
- **32 point lights in loose uniform arrays**, refilled per frame, no clustering.
- **Single non-cascaded 2048² shadow map**, snap-cached, plus a 1024² car-only
  map. Exactly **one** floodlight in the scene casts (`lit.js:821`).
- **No instancing anywhere** — `drawElementsInstanced` / `vertexAttribDivisor`
  return zero hits in the WebGL2 path.

### Measured budgets

Vegas, measured live by wrapping `GLX.createMesh`/`createChunkedMesh`:

| buffer | verts | tris |
|---|---:|---:|
| **props** | **1,801,292** | 877,644 |
| **glass** | 537,408 | 268,704 |
| road | 29,398 | 53,990 |
| terrain | 15,430 | 24,688 |
| car (per team) | 11,064 | 3,880 |

Props run **20-60× road+terrain** across circuits (Vegas 1.80 M, Singapore
1.25 M, Baku 1.02 M, Spa 0.41 M).

Vegas props material histogram — vertices per `MAT` id:

| MAT | verts | share |
|---|---:|---:|
| **0 FLAT** | **1,204,448** | **66.9%** |
| 4 METAL | 306,216 | 17.0% |
| 5 WOOD | 95,760 | 5.3% |
| 7 FABRIC | 87,960 | 4.9% |
| 6 FOLIAGE | 60,340 | 3.4% |
| 1 CONCRETE | 39,816 | 2.2% |
| 3 GLASS | 6,264 | 0.3% |

**Two-thirds of the largest buffer in the game gets no procedural material
treatment at all.** And `buildRoad`/`buildTerrain` never create a `mat` array
(`mesh.js:302, 468`), so road and terrain are *permanently* `MAT.FLAT` — the
surface on screen 100% of the time is the one surface the material system never
touches.

Procedural detail also fades with distance: bump dies at ~80 m (`lit.js:242`),
albedo at ~260 m (`lit.js:281`). The mid- and far-field city is flat vertex
colour by construction.

---

## Part 2 — already solved, or actively wrong for us

Recorded so future work doesn't re-derive these.

**Already implemented — don't "add" them:**

- *Arc-length / spatial culling of scenery.* `chunked.js:145-168` already bins
  into 72 m XZ cells with frustum planes **and** a radial `cullDist`, plus
  light-frustum culling for the shadow pass.
- *GGX, clearcoat, analytic env reflection, SSR, SSAO, bloom, triplanar
  procedural noise with normal perturbation.* All shipped.
- *Physically-motivated wet remap.* `lit.js:720-742` already darkens albedo
  ~0.42×, drives `rough → 0.15`, blends `f0 → 0.04`, and pools puddles on a
  world-space noise — close to Lagarde's numbers already.

**Recommended by external sources but wrong here:**

- **Rotation-minimizing frames (Wang double-reflection).** Moot. `buildCenterline`
  uses a world-up reference frame (`right = norm(cross(t, UP))`) and applies bank
  as an explicit roll about the tangent. For a circuit that never goes vertical
  that is *more* stable than an RMF. Leave it.
- **Octahedral / billboard impostors.** Require a baked RGBA atlas and UVs.
  Violates no-external-assets, no-build-step.
- **Alpha-tested billboard vegetation.** `discard` disables Early-Z entirely on
  Mali and forces re-HSR on Apple TBDR. The current *opaque low-poly* trees are
  strictly better on mobile. Cut triangles at distance instead.
- **Dithered LOD cross-fade.** Same `discard` problem. Use scale-fade over ~5 m
  plus distance hysteresis — free, no alpha, no branch.
- **Uniform buffer objects for the light arrays.** Safari emulates WebGL UBOs
  over Metal with reported ~150 ms hitches. The 32 loose uniform arrays are the
  safer choice on iOS.
- **GPU-driven culling, multi-draw, indirect draw.** No compute in WebGL2;
  `WEBGL_multi_draw*` has limited availability. This belongs in the WebGPU
  backend (`js/render/webgpu/wgx.js`), not GLX.
- **Instancing for draw-call reduction.** We are already at ~1 draw per visible
  chunk. Instanced *small* meshes can lose to a merged buffer. The reason to
  instance is memory and LOD headroom, not draw calls.

---

## Part 3 — ranked opportunities

### Tier 1 — shader/table work, no new assets

**1. Give road and terrain `MAT` ids.** `mesh.js:302, 468` never allocate a `mat`
array, so the entire existing procedural material path is unavailable to the
racing surface — which is why tarmac grain is currently faked with per-vertex
hash tints. Emitting `MAT.CONCRETE`/`SAND`/`GRASS`/`ROCK` per cross-section
column costs one array and unlocks bump + roughness variation that is already
written and shipping for props. Cheapest real win in the codebase.

**2. Move road markings from geometry to a shader SDF.** Road vertices already
carry `(s, x)`. Passing them as varyings and evaluating dashes / kerb stripes /
edge lines analytically with `fwidth` anti-aliasing fixes three things at once:
the 7 m dash aliasing against the 4 m grid, the 1.6 m→8 m kerb stripe
degradation, and it deletes cross-section columns 2-3 and 10-11 (~30% of road
verts). Zero z-fighting, because the marking lives in the same triangles.
Ref: [iq, filtering procedural textures](https://iquilezles.org/articles/filtering/),
[bandlimiting](https://iquilezles.org/articles/bandlimiting/bandlimiting.htm).
Avoid coplanar decal geometry — `glPolygonOffset` is explicitly
implementation-dependent ([Khronos](https://www.khronos.org/opengl/wiki/Basics_Of_Polygon_Offset)).

**3. Bake vertex AO at generation time.** Compute a per-vertex occlusion scalar
during the build (hemisphere ray or a proximity/curvature heuristic), pack it in
the unused 4th colour channel, multiply into **ambient only**. Free at runtime,
replaces the fake `N.y` AO at `lit.js:1086`, and is the documented largest
"premium" delta for flat-shaded low-poly.

**4. `EnvBRDFApprox` + energy conservation.** Confirmed absent. The Lazarov/Karis
analytic fit needs no LUT texture (which is the point — it exists to avoid a
dependent texture fetch on mobile):

```glsl
// [Lazarov 2013, Black Ops II] — also in UE4 mobile
const vec4 c0 = vec4(-1,-0.0275,-0.572,0.022), c1 = vec4(1,0.0425,1.04,-0.04);
vec4 r = Roughness*c0 + c1;
float a004 = min(r.x*r.x, exp2(-9.28*NoV))*r.x + r.y;
vec2 AB = vec2(-1.04,1.04)*a004 + r.zw;
return SpecularColor*AB.x + AB.y;
```

Weight the existing analytic-sky reflection by this instead of an ad-hoc blend,
and add the `1-F` diffuse split. Also worth replacing the hemisphere ambient
(`lit.js:745`) with SH2/SH3 — 9 CPU-computed uniforms buy directional colour
bleed for a handful of ALU.
Refs: [Filament](https://google.github.io/filament/Filament.md.html),
[UE4 mobile PBR](https://www.unrealengine.com/en-US/blog/physically-based-shading-on-mobile),
[Ravi/Hanrahan SH irradiance](https://cseweb.ucsd.edu/~ravir/papers/envmap/envmap.pdf).

### Tier 2 — geometry quality (touches the build)

**5. Curvature-adaptive node spacing.** Chord-deviation gives step length
directly: sagitta ≈ ℓ²/8R, so `ℓ = √(8εR)`. At ε = 0.05 m that is ~14 m at
R = 500 m but ~2.2 m at R = 12 m — the current uniform 4 m is "correct for
straights only". Grade step length ≤1.5× between neighbouring rings to avoid
shading discontinuities.
Ref: [GPU Gems 2 ch.7](https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-7-adaptive-tessellation-subdivision-surfaces).

**6. Switch to centripetal Catmull-Rom (α = 0.5).** `spline.js:67` is uniform
despite the "centripetal-ish" comment. Uniform parameterization *provably*
produces cusps and self-intersections on uneven control spacing — which is
exactly what the Laplacian smoothing at `spline.js:52-62` is papering over at
chicane reversals. Fix the cause, drop the hack.
Ref: [Yuksel, Schaefer & Keyser](https://www.cemyuksel.com/research/catmullrom_param/catmullrom_cad.pdf).

**7. Make the terrain's first ring the road's own edge vertices.** Sharing those
positions deletes the seam, the double-sided skirt, and `faceSafe`'s
hole-punching *structurally*. Beyond that ring, blend to the free surface over a
cosine falloff band and clamp `h = min(h_terrain, roadEdgeY − margin)` — against
the **banked** road plane, not centreline height, or the outside of a banked
corner re-emerges. Also fix the `(0,1,0)` terrain normals.
Ref: [UE Landscape Splines](https://dev.epicgames.com/documentation/en-us/unreal-engine/landscape-splines-in-unreal-engine).

**8. Pinching guard.** Offset self-intersection occurs where half-width exceeds
the local radius of curvature. Compute κ_max per segment at build and clamp
half-width to ~0.8/κ, or flag the authored segment.
Ref: [MIT Patrikalakis–Maekawa–Cho](https://web.mit.edu/hyperbook/Patrikalakis-Maekawa-Cho/node228.html).

### Tier 3 — scenery variety

**9. CGA-style split grammar for facades.** The operator that matters is `split`
with three size modes — absolute (`2`), relative (`'0.3`), floating (`~1`,
absorbs remainder) — plus `repeat` (`*`), which tiles a pattern as many times as
fits with least stretching. That single helper, recursively feeding the existing
box emitter, replaces 18 fixed archetypes and the hard-capped 6×10 window grid,
and stays proportionally correct at any building size.
Refs: [Müller et al., Procedural Modeling of Buildings](https://dl.acm.org/doi/10.1145/1141911.1141931),
[CGA split](https://doc.arcgis.com/en/cityengine/latest/cga/cga-split.htm).

**10. Blue-noise placement.** Current city rows are uniform every 18 m / 26 m,
which reads as rhythm. Mitchell's best-candidate is ~15 lines, needs no grid, and
works directly on the arc-length parameter.
Ref: [demofox](https://blog.demofox.org/2017/10/20/generating-blue-noise-sample-points-with-mitchells-best-candidate-algorithm/).

**11. Layered aerial perspective.** Lerp vertex colour toward the sky/fog hue by
distance and desaturate — a depth cue *and* a LOD budget, with no extra pass.
Note sense of speed comes from **near-camera parallax**, so props at 3-15 m from
the barrier (lamps, marshal posts, fence posts) buy more than midfield density.

**12. Distance LOD, done our way.** Re-run the existing `TrackGeom` emitters at
lower radial/segment counts to generate LOD tiers **at build time** — no assets,
no build step, just parameters. Far tier = a 2-triangle vertex-coloured
billboard, still textureless. Combine with scale-fade, not dither.

**13. Selective instancing** for high-repeat kinds only (trees, lamps, cones,
fence posts). Pack `vec4(x,y,z,yaw)` + `vec4(scaleXZ, scaleY, tint, lodFade)` =
2 attribute slots at divisor 1, not a mat4. Keep the baked buffer for genuinely
unique geometry. Expect the win in memory and LOD headroom.

### Also worth fixing

- **Decals are unlit relative to the body** (`fx.js:88-96`) — no shadow, no
  lamps, no fog. Cheapest fix: fold the body's shadow term and fog into the
  decal shader.
- **Car has 2.85 verts/tri.** Indexing the body mesh would cut vertex bandwidth
  ~2.9×, but flat shading depends on per-face normals — needs authored normals,
  not a free win.
- **Alpha is overloaded** as the SSR car-paint tag (`lit.js:1174`), forcing every
  transparent draw to mask alpha writes. Blocks future coverage/OIT use.
