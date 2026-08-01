# Scene graph + detailed models — staged plan

Companion to `EXTERNAL-MODEL-SOURCES.md`, which asked "where do models come
from". This asks the prior question: **why can't we afford detailed models
today, and what has to change first.**

Answer: the cost of detail currently scales with the number of *placements*, not
the number of *models*. A scene graph flips that. Detail must come last, not
first — added now it makes a known iOS crash worse.

---

## 1. The measurement that decides everything

Every scenery emitter appends triangles into one shared buffer. There is no
instancing anywhere in GLX (`grep drawElementsInstanced js/render/` → nothing);
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

*Gate:* `npm run test:scenery` (props-over-road, terrain-over-road),
`npm run test:agent` (scene/worldModel now read the graph).

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

*Gate:* `npm run test:visual` + `npm run test:webgl`; draw-call and VRAM deltas
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

`EXTERNAL-MODEL-SOURCES.md` concluded that external assets need an offline bake
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

## 6. Risks

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
