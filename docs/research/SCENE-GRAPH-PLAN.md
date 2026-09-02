# Scene graph + detailed models — staged plan

> **Status: S0–S2 infrastructure has LANDED** (`js/track/graph.js`,
> `tools/graph-parity.cjs`, `tests/unit/track-graph.test.mjs`), with sixteen emitters
> migrated: `windowPane`, `crowd`, `fence`, `guardrail`, `tyreWall`, `wall`,
> `facadeRail`, `streetLamp`, `facadeMullion`, `streetBarrier`, `facadeNeon`,
> `crowdRiser`, `billboard`, `marshalPost`, `buildingMass`, `pine`. All 24 circuits are at exact geometry parity — nothing renders
> differently, by design. §6 has the measured per-emitter reuse: **54% of the
> fleet's entire scenery mass (9.67 M vertices) collapses to 24,585**, while
> `pine` sits at 1.00× for a structural reason that changes the S4 plan.

Companion to the model and scenery research indexed in `docs/README.md`. This asks the prior question: **why can't we afford detailed models
today, and what has to change first.**

Answer: the cost of detail currently scales with the number of *placements*, not
the number of *models*. A scene graph flips that. Detail must come last, not
first — added now it makes a known iOS crash worse.

---

## 1. The measurement that decides everything

Every scenery emitter appends triangles into one shared buffer. There is no
instancing anywhere in GLX (that parenthetical used to read "`grep
drawElementsInstanced js/render/` → nothing" and is now FALSE — see the S3 note
in §6: the GLX consumer was written after this section and the same grep now
returns `glx.js:1254` and `glx/shadow.js:218`);
`createChunkedMesh` only *spatially bins* an already-fused soup for frustum
culling. So a prop placed 1,788 times costs 1,788 × its full vertex count.

Spa, from the semantic prop registry (`track.props.list`, built headlessly):

| kind | placements |
|---|---|
| pine | **1,788** |
| tree | 199 |
| structure | 153 |
| prop | 119 |
| mountain | 82 |
| marshalPost | 64 |
| *(all kinds)* | 2,465 |

And a pine is `addCyl(seg 6)` + 4 × `addCone(seg 7)` — measured against the real
emitters: 42 + 84 = **126 verts**.

```
1,788 pines × 126 verts          = ~225,000 verts
Spa's ENTIRE props buffer         =  446,414 verts
```

**Over half of Spa's scenery geometry is clones of one 126-vertex model.** At 40
bytes/vertex interleaved (`pos+nrm+col+mat`) that is **~9.0 MB of VRAM spent on
trees**. The same geometry as instances: three silhouette variants
(FULL/LEAN/SPARSE, already in `pine()`) × 126 verts ≈ 15 KB of models, plus
1,788 × 64 B of `mat4` ≈ 114 KB of transforms. **~130 KB — a 69× reduction**, for
identical pixels.

> **Corrected by measurement — see §6.** Those 1,788 pines do *not* reduce to
> three models: `pine`'s dimensions are affine in `h` (`0.35 + h*0.02`, a fixed
> 0.5 m trunk sink), and a per-node scale expresses `k·h` but not `a + b·h`. The
> reduction is real but has a prerequisite the estimate missed — re-parameterising
> the emitter to be scale-linear, which moves vertices and so belongs in S4.

Whole-track totals (`node tools/verify-track.cjs <id>`):

| track | props verts | ≈ props VBO | placements |
|---|---|---|---|
| monaco | 445,290 | ~18 MB | 950 |
| spa | 446,414 | ~18 MB | 2,465 |
| vegas | 1,822,578 | **~73 MB** | 2,466 |

Vegas matches the comment in `buildProps` — "the props VBO is ~88 MB on Vegas,
~73 on Baku" — and the mitigation already in the code is a **build-time global
detail cut**: `CITY_LOD = 0.72` on phones, coarsening the window grid to stop
iOS jetsam OOM-kills. That is the current state of the art here: when we can't
afford detail, we delete it everywhere at build time.

**So "more detailed models across the board" is not affordable today.** Doubling
prop detail doubles a 73 MB allocation on the exact track that already crashes
phones. Instancing is not a nice-to-have that makes detail faster; it is the
precondition that makes detail *possible*.

---

## 2. What a scene graph actually buys

Five things, in descending order of value here:

1. **Detail decouples from placement count.** `O(placements × verts)` becomes
   `O(unique models × verts + placements × 64 B)`. This is the whole argument.
2. **Per-instance LOD.** Today `CITY_LOD` is one build-time constant applied to
   the entire track. Nodes carry a distance, so the near grandstand can be the
   detailed model and the far one a shell — instead of every grandstand
   everywhere being coarsened because phones exist.
3. **Semantic identity for free.** `note()` (js/track/tracks.js:436) exists only
   because fused triangles are anonymous — it maintains a *parallel* registry,
   capped at `PROP_CAP = 40000`, purely so `__apex.scene()` can answer "is there
   a grandstand on my left". In a graph the node *is* the record. That whole
   bookkeeping layer collapses, and the agent view gets exact rather than
   sampled data.
4. **Transforms mean motion.** Ferris wheels turn, crane booms track, flags wave
   without the `MAT.FLAG` fractional-material-id vertex-shader hack (geom.js:22).
5. **Cheaper, better guards.** The on-track `rejBox` Minkowski test runs
   per-primitive today. Per-node it runs once against the model's canonical AABB
   — strictly fewer tests, and it can no longer disagree with itself across the
   primitives of one composite.

---

## 3. The two halves, which are independent

This is the part worth getting right, because it decides whether this work
collides with the three.js migration.

**(a) The data half — renderer-independent.** `scenery()` stops emitting
triangles and starts emitting *nodes*: `{ model, variant, transform, material,
kind }`. Nothing about this requires a renderer change. GLX can bake the graph
straight back down to the identical triangle soup it draws today.

**(b) The render half — renderer-specific.** Actually drawing nodes as
instances. Two possible homes:
- **bespoke in GLX** — WebGL2 has `drawElementsInstanced` in core (no
  extension); the lit shader uses attribute locations 0–4, so 5–8 are free for a
  per-instance `mat4` via `vertexAttribDivisor`. Needs the same treatment in the
  three shadow passes and a per-instance cull replacing the per-chunk one.
  Estimate: a few hundred lines, contained.
- **three.js / TLX Phase B** — `spike/ADOPTION-PLAN.md` already commits to
  "`InstancedMesh` for cars/wheels/props (the spike's clearest win)", with the
  measured result **94 GLX draws/frame → 25 instanced**.

**The important consequence: (a) is required either way, and doing it first is
what makes (b) possible at all.** three.js cannot instance props that
`buildProps` has already fused into a single 1.8 M-vertex buffer. If the graphics
migration happens before the scenery data becomes a graph, Phase B inherits the
same soup and the instancing win applies only to cars.

So (a) is not a competing plan to the migration — it is its missing prerequisite.

---

## 4. Staged plan

Ordered so every stage is shippable and independently verifiable, and so nothing
visual changes until the budget exists to pay for it.

### S0 — model factories (no behaviour change)
Extract the composite emitters (`pine`, `tree`, `palm`, `conifer`, `bush`,
`streetLamp`, `marshalPost`, `billboard`, guardrail post, tyre stack, crowd
body, window pane) into factories that emit **at origin in canonical
orientation** into a local buffer, keyed `id + variant`. The existing helpers
keep their signatures and blit the factory output at the placement transform.

*Gate:* `node tools/verify-track.cjs --all` reports **identical vertex counts**
for all 24 circuits. Byte-identical geometry or the extraction is wrong.

### S1 — the node graph
`buildProps` grows `track.graph = { models: { id → geo }, nodes: [...] }`.
Placement helpers push nodes; `note()` folds into node creation. `rejBox` moves
to per-node AABB. The 84-member `api` contract is unchanged from the circuits'
side — this is entirely inside the engine.

*Gate:* `npm run test:circuits` (props-over-road, terrain-over-road),
`npm run test:hooks` (scene/worldModel now read the graph).

### S2 — bake path, default on
`TrackGraph.bake(graph)` → `{pos,nrm,col,idx,mat}`, reproducing today's soup;
`Tracks.build` uploads it exactly as now.

**This is the safe landing point: zero pixels change, `tracks-visual` baselines
hold, and the scenery data is now a graph.** Everything after this is optional
and can be sequenced against the graphics migration.

### S3 — instanced draw
Group nodes by `(model, variant, material)` → one instanced draw each. Per-frame
frustum cull fills the instance buffer (the existing 72 m chunk grid becomes an
instance-bucket grid — the culling logic in `js/render/glx/chunked.js` ports
almost directly). Shadow passes take the same buffers. `bake()` stays as the
fallback for any backend without instancing and for the Node VM build guard.

*Gate:* `npm run test:gfx`; draw-call and VRAM deltas
recorded per track.

### S4 — LOD, then detail
Per-instance distance LOD replaces the global `CITY_LOD` cut. **Only now** raise
model detail: bark and needle cards on the pine, real seats and stair towers on
the grandstand, parapets/plant/balconies on city buildings, proper armco profile
on the guardrail. Each detail bump is a change to one model, not to 24 circuit
files — which is the actual payoff of the whole exercise.

*Gate:* per-track VBO bytes must stay **at or below** today's numbers; Vegas is
the ceiling test.

### S5 — motion
Nodes have transforms, so animate them: ferris wheel, crane booms, marshal
flags, crowd sway. Retire the `MAT.FLAG` vertex-displacement hack.

### Non-goals
- Not a general retained-mode scene graph for the whole game. Cars, road,
  terrain and the floor stay as they are; this is scoped to `buildProps`.
- Not skinning/animation rigs. Node transforms only.
- No new runtime dependency. Everything here is plain IIFE modules under
  `js/track/`, per the no-build-step rule.

---

## 5. Where imported models fit

[`../archive/research/EXTERNAL-MODEL-SOURCES.md`](../archive/research/EXTERNAL-MODEL-SOURCES.md) concluded that external assets need an offline bake
to vertex colours. That conclusion is unchanged, but the sequencing shifts: with
a model library (S0) there is a **named slot** to drop an imported mesh into —
`models["grandstand-a"]` is just geometry, and nothing cares whether it came
from `grandstandEx()` or from a decimated `.glb`. Instancing then means one
imported model is paid for once regardless of how many times a circuit places
it.

Without S0–S2, an imported model is fused into the soup at every placement and
is the *worst* case for the vertex budget. **Scene graph first, imported assets
second.**

---

## 6. What landed, and what it measured

### The shape that made it safe

The migration records **primitive ops in canonical space**, not baked vertices.
A model is `[{op:"cyl", c:[0,-0.5,0], rad, h, col, seg, mat}, …]` at origin in an
identity basis; a placement is a node `{model, o, r, u, t, s?}`. Replaying a
model runs its ops back through **buildProps's own guarded emitters**, so the
on-track `rejBox`/`rejRad` decisions, the `absorb*` occupancy writes and the
emitted geometry are the same as when the helper emitted inline. Recording
triangles instead would have bypassed all of that.

`tools/graph-parity.cjs` is the gate: it materialises a baseline git ref with
`git archive`, builds every track twice in one process — baseline tree and
working tree — and diffs `propsGeo`/`glassGeo`/`waterGeo`/`roadGeo`/`terrainGeo`
vertex for vertex, plus the `note()` registry count.

```
24/24 tracks at parity with HEAD
```

Positions are exact on 15 circuits and differ by at most **5.7e-14 m** on the
rest. That residue is entirely the leaning-pine case: the original composed the
cone centre as `(c + u·y) + r·lean`, the replay as `c + r·lean + u·y + t·0`, and
IEEE-754 addition is not associative. Normals, colours, material ids and indices
match exactly everywhere.

### The finding: instanceable vs. continuous

`graph.stats().byKind` splits migrated emitters by how much reuse they actually
have. Across all 24 circuits, for the sixteen emitters migrated so far:

| emitter | nodes | models | fused verts | instanced | reuse |
|---|---|---|---|---|---|
| `windowPane` | 144,249 | 21* | 3,461,976 | 504 | **6,869.00×** |
| `crowd` | 85,273 | 32 | 2,046,552 | 768 | **2,664.78×** |
| `fence` | 54,277 | 77 | 1,601,375 | 2,266 | **706.70×** |
| `guardrail` | 30,465 | 50 | 792,104 | 1,288 | **614.99×** |
| `facadeRail` | 15,060 | 21* | 361,440 | 504 | **717.14×** |
| `tyreWall` | 8,157 | 85 | 297,843 | 2,615 | **113.90×** |
| `streetLamp` | 3,368 | 66 | 297,792 | 6,468 | **46.04×** |
| `facadeMullion` | 8,871 | 21* | 212,904 | 504 | **422.43×** |
| `wall` | 7,500 | 28 | 180,000 | 672 | **267.86×** |
| `streetBarrier` | 6,404 | 7 | 153,696 | 168 | **914.86×** |
| `facadeNeon` | 5,430 | 7* | 130,320 | 168 | **775.71×** |
| `crowdRiser` | 2,792 | 109 | 67,008 | 2,616 | **25.61×** |
| `billboard` | 1,188 | 152 | 31,680 | 3,952 | **8.02×** |
| `marshalPost` | 343 | 43 | 26,068 | 3,268 | **7.98×** |
| `pine` | 9,486 | 9,474 | 1,159,599 | 1,158,108 | **1.00×** |
| `buildingMass` | 540 | 21* | 12,960 | 504 | **25.71×** |
| **total** | **383,403** | **10,144** | **10,833,317** | **1,182,693** | **9.16×** |

\* `windowPane`, `facadeRail`, `facadeMullion`, `facadeNeon` and `buildingMass`
all resolve to the SAME model — one unit cube per build — so the per-kind
`models` column counts it five times while the total counts it once. Every one of
them is an axis-aligned box on a building's basis differing only in size and
tint, which the node scale and node colour already carry. The whole city across
24 circuits — glazing, floor rails, mullions, neon strips AND the building masses
themselves — is **one 24-vertex model**, placed 173,949 times.

**`windowPane` is the headline: every glazed pane in the game — 143,083 of them
across seven city circuits, 3,433,992 fused vertices — is the same unit box.**
It collapses to seven models (one per build) totalling 168 vertices. The
trackside barrier family (`fence`/`guardrail`/`wall`/`tyreWall`/`streetBarrier`)
is the second block: 3,024,802 vertices down to 7,009.

`crowd` is the second: every spectator in the game — seated in a grandstand or
standing on a grass bank — is one unit box, with per-person height on the node
scale and shirt colour on the node colour. 85,273 of them cost 768 vertices.

For scale: all 24 circuits together build **17,978,812** prop vertices. The
sixteen migrated emitters account for 10,833,317 of them (**60.3%**), and the
fifteen non-`pine` ones for 9,673,718 (**53.8%**) — which an instanced renderer
would draw from **24,585 vertices** of models plus one `mat4` per node. Over half
the game's entire scenery mass, currently paid for in full VBO bytes, is a
handful of shapes repeated.

Vegas is the sharpest case, because it is the track whose ~73 MB props VBO forced
the global `CITY_LOD = 0.72` mobile detail cut: **80,796 nodes across 35 models —
2,006,738 fused vertices that instance from 1,448.**

Five structural properties made that possible, and they generalise:

1. **Split fixed geometry from length-scaled geometry.** `guardrail` was one
   emitter writing a fixed post plus a rail whose length follows the node
   spacing. Fused, that forces a model per distinct spacing. Split into
   `guardrail-post` (no scale) and `guardrail-rail` (scaled on Z), the post
   collapses to ONE model per circuit and the rail to one per colour. Same for
   `fence`, `tyreWall` and `wall`.
2. **Don't put a radial primitive under a non-uniform scale.** `radScale()` takes
   `max(|sx|,|sz|)` because a cylinder cannot be elliptical, so a fused
   post-plus-rail model would have stretched the post's radius with the rail's
   length. The split avoids the question entirely.

3. **Give the node a colour when only the tint varies.** Every lit window pane
   carries a hash-jittered warm/neon tint, which would have minted a model per
   pane and instanced at 1.00×. `TrackGraph.NODE_COLOR` marks a primitive's
   colour as "supplied by the node" — the shared model bakes white and the tint
   rides the placement, which is precisely what a per-instance colour attribute
   does on the GPU. `instance()` also takes a target buffer, so a pane's unlit
   half still routes to `glassBuf` for the reflective material.
4. **Promote a repeated offset to a node.** A billboard's two posts sit at
   ±0.4·width along the track. Folding that into one model mints a model per
   width (252 models for 792 placements, 2.71×); a z-scale would instead stretch
   the post radius. Emitting each post as its OWN node leaves one model per
   height — 8.02×, and exactly, since the offset is computed by the same `vadd`
   the original used.
5. **Replay unguarded where the emitter already was.** Crowd spectators are
   thousands of tiny boxes behind a stand's shell and deliberately skip the
   on-road test for speed (`RAW.addBox`). `instance(..., { unguarded: true })`
   replays through the raw set, so migrating them culls nothing that ships
   today. Routing them through the guarded set instead would have quietly
   started dropping geometry.

`marshalPost` instances for the simpler reason that every dimension is a
constant and the only per-placement variable is which side of the track the pole
stands on. (Its flag and night beacon stay inline: the flag is animated
`MAT.FLAG` cloth, not a rigid primitive, and both are separate node kinds in a
full graph.)

`pine` does not instance at all — and **that is a structural property, not a
tuning problem.** §1 assumed 1,788 pines would collapse to three silhouette
variants. They do not, because pine's dimensions are **affine in `h`, not
linear**: the trunk radius is `0.35 + h*0.02`, the trunk sinks a fixed 0.5 m
below the anchor, and the tier heights carry absolute constants. A per-node
scale can express `k·h`; it cannot express `a + b·h`. With `h` and the jitter `j`
both continuous, every tree is its own model.

**So §1's headline "69× reduction for the tree layer" is not available for
free.** It requires re-parameterising `pine` so its geometry is purely linear in
its scale parameters — which moves vertices, i.e. it is a deliberate look change
that belongs in S4 with the detail pass, behind regenerated visual baselines. It
is not a bug and not a blocker; it is the actual worklist. The graph's value here
is that it turned an estimate into a per-emitter measurement, and the same
`byKind` table will score every emitter migrated after this.

### S3 is now unblocked from the data side: `graph.batches()`

When this was written neither candidate backend could instance — GLX had no
`drawElementsInstanced` anywhere, and TLX's own header says *"InstancedMesh
batching of repeated geometries lands with the lit material (M3+)"*.
**GLX's half has since been written and this paragraph did not keep up.** Rather than pick one and write
the same thing twice, the graph now emits the handoff **both** need:

```js
const { batches, bakeOnly } = track.graph.batches();
// batches[i] = { model, geo, verts, count, matrices: Float32Array(16n),
//                colors: Float32Array(3n) | null }
```

Matrices are **column-major** — the layout `M4` and `THREE.Matrix4` share —
with columns 0–2 the scaled basis vectors `r`/`u`/`t` and column 3 the origin.
That is exactly `xform()`'s `world = o + R·(local·s)`, so an instanced draw of
`geo` under the matrix lands where `replay()` put the geometry;
`tests/unit/track-graph.test.mjs` asserts that vertex-for-vertex against a rotated,
translated, non-uniformly scaled placement rather than trusting the derivation.

Two classes of node **cannot** be instanced, and are returned in `bakeOnly`
instead of being silently mis-drawn:

- **partially suppressed placements** — if the on-track guard dropped some of a
  model's primitives but not all, drawing the whole mesh at that transform puts
  the dropped ones back;
- **radial geometry under a non-uniform XZ scale** — `replay()` keeps a cylinder
  round via `max(|sx|,|sz|)` because the primitive emitters cannot make an
  ellipse, but an instance matrix scales x and z independently.

Measured across all 24 circuits: **383,402 of 383,403 nodes instance; exactly
one falls back to the bake.** That is the split rules (§6) holding empirically —
they were derived to keep radial primitives out from under non-uniform scale,
and the count says they do.

What it is worth, at 40 interleaved bytes/vertex, summed over the fleet:

| | fused (today) | instanced |
|---|---|---|
| all migrated emitters | 413 MB | 45 MB models + 26 MB transforms = **71 MB** (5.8×) |
| excluding `pine` | 369 MB | 0.9 MB models + 26 MB transforms = **27 MB** (13.9×) |

Once geometry collapses, the **transforms dominate** — 64 B per instance against
~2.8 KB of fused geometry for a 70-vertex prop. A `mat4` is more than the data
needs (the transform is an orthonormal basis plus scale and origin), so packing
it to 3×4 or quaternion+scale+position is worth doing if that 26 MB ever
matters; it is a pure encoding change on both sides of this API.

`bake()` remains the fallback path, so adopting this is additive: a backend
instances what it can and bakes `bakeOnly`, and nothing is a flag day.

### Where this leaves the stages

- **S0/S1/S2 — done for the migrated subset.** Model library, node graph, guarded
  replay, `bake()` reconstruction, parity gate, unit tests, sixteen emitters.
- **Remaining S1 work is mechanical**: `tree`/`palm`/`conifer`/`bush`, building
  masses and the baked models the asset pack now places — one at a time, each gated by `npm run test:graph-parity`. Apply the
  five rules above. The broadleaf vegetation will likely hit `pine`'s
  affine-parameter wall; the city masses and facade furniture should not.
- **S3's data side is DONE** — `graph.batches()` above. **So is GLX's consumer
  side**, which this list previously described as remaining work: `glx.js:1128`
  `createInstancedBatch`, `:1211` `cullInstances`, `:1254`
  `drawElementsInstanced`, `glx/shadow.js:212` `castShadowInstanced`, the
  divisor attributes documented at `shaders/lit.js:21`, the façade entries in
  `render/gfx.js`, and five real assertions in
  `tests/specs/instanced-draw.spec.js` (batches > 0, instance count matches the
  payload, colour buffer matches, an empty frustum culls everything, a
  containing frustum keeps everything). Note the implementation used attribute
  9 for the per-instance colour, not the "attributes 5–8" this list predicted —
  which is itself evidence it was written after this paragraph.

  What ACTUALLY remains for S3 on GLX is one call site: the
  `gfx.drawChunked(track.meshes.props, …)` in game.js's render loop still draws
  scenery against the fused soup, and `drawInstanced` has NEVER appeared in
  game.js in this repo's
  history — so this is unwired, not wired-and-reverted. Before wiring it, fix
  `cullInstances` (`glx.js:1211-1234`): it calls `src.subarray()` per visible
  instance per frame off a growable JS array, which on Vegas's 80,796 nodes is
  tens of thousands of allocations a frame — the GC churn `glx.js:98-104` keeps
  scratch arrays to avoid. TLX still needs `InstancedMesh` at M3.
- **S4 gains a prerequisite it did not have**: re-parameterise affine emitters to
  be scale-linear *before* raising their detail, or the detail will not instance
  either.

## 7. Risks

- **Big refactor of shared code.** `js/track/scenery-*.js` is ~2,500 lines
  serving a frozen 84-member contract consumed by 24 circuit files. S0's
  "identical vertex counts" gate is what makes it safe; do not skip it.
- **Instance variation.** Several emitters jitter per placement (`pine`'s size
  jitter `j`, `lean` shear, sparse/full variants). Uniform scale and the lean
  shear fold into the instance matrix; discrete variants become separate
  instanced draws. Colour jitter needs a per-instance colour attribute — cheap,
  but it must be designed in at S1, not bolted on at S3.
- **Backend parity.** WGX (WebGPU) and any future TLX need the instanced path or
  the `bake()` fallback. `bake()` existing from S2 is what keeps this from being
  a flag day.
- **Baselines.** S3/S4 will move pixels. `tests/*-snapshots/` needs a deliberate
  Linux/SwiftShader regeneration — and `CLAUDE.md` already notes the consolidated
  visual suite has no tracked replacement baselines yet, so that regeneration is
  a prerequisite for using `npm run test:visual` as a gate here at all.
- **Collision with the graphics migration.** S3 in GLX is work that Phase D
  deletes. S0–S2 are not.
