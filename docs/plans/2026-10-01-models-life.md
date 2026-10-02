# Models and life — real CC0 scenery, instancing, trees, crowds

Status: **PLAN** (docs-only first). Items 6, 7, 8, 14, 15, 16 and 17 of the
second graphics-detail survey
([`../notes/GRAPHICS-DETAIL-SURVEY-2-2026-10-01.md`](../notes/GRAPHICS-DETAIL-SURVEY-2-2026-10-01.md)),
sized as independently shippable slices. The survey's smaller items (1–5,
9–13) are already open as their own PRs and are not repeated here. A path
written `js/<new>/x.js` is a PROPOSED file, as in the broadcast and flyby
plans. Ship branch: `claude/f1-game-project-26h3ng`; one PR per slice, drafts
until the gate (AGENTS.md §The loop).

## Where the pipeline stands

- **The pack format is AX26 v2** (`js/render/shared/assets.js`, written by
  `tools/gen/assets.mjs`): positions f32, normals i16, colour u8, material u8,
  u16 indices. **No UVs and no instance list**, so the baked material arrays'
  relief never reaches a baked model and a model placed N times is baked N
  times into the scenery graph.
- **Every shipped model is synthetic** (`tools/gen/synth-models.mjs`, 36 box /
  prism / cylinder recipes named after Kenney kits); five circuits place them
  (`js/circuits/scenery/{monza,monaco,spa,silverstone,vegas}.js`).
- **A real-pack importer already exists and runs where the network is**:
  `tools/gen/import-models.mjs` (glTF/GLB, POSITION / NORMAL / TEXCOORD_0,
  colour from `baseColorFactor` or a palette-texture sample, `--height`
  normalisation, `--max-verts`) behind `.github/workflows/import-models.yml`
  (`workflow_dispatch`: `url`, `mat`, `height`, `prefix`, `author`,
  `commit_branch`; it downloads, unzips, imports, commits to a bot branch).
  This container's proxy cannot reach kenney.nl's zips, the runner can.
- **Boot fetches every model in the manifest** (`Assets.loadModels()`), and
  since #710 the first build waits for them (4 s cap). The manifest is
  therefore a download budget, not a catalogue: an imported kit must be
  pruned to what circuits place.
- **The budget**: `tools/gen/assets.mjs verify` caps the whole pack at 8 MB
  (now ~1.6 MB of models + the material arrays).
- **Instancing exists for the graph's own repeats** (the TrackGraph instancing
  family, `js/render/shared/inst-cells.js`), not for baked models.

## Slice A — import the Kenney Racing Kit (item 6, part 1) — S

Source: https://kenney.nl/assets/racing-kit, CC0, author "Kenney". The zip's
`GLTF format/` folder holds 112 `.glb` files (grandstands, pits garage, tents,
light posts, banner towers, tyre stacks, cones, flags, barriers).

1. **Measured 2026-10-01** (the zip's accessor bounds): the kit is a toy
   scale with pivots at the base — a race car is 1.49 units long and 0.47
   tall, grandstands 0.90–1.39 tall and 1.0–1.64 wide, trees 1.07–1.51, flags
   1.25, cones 0.13; 101 of 112 files colour by `baseColorFactor` (four flat
   materials), 11 embed a texture (billboards, fences, checker flags, the pits
   garages). Scaled by the car (5.5 m / 1.49) the grandstands come out 3.3–5.1 m,
   too low for a stand; scaled ×5 they are 4.5–7 m with trees 5–7.5 m, which
   is the kit's own proportion. The importer's `--height` normalises EVERY
   model to one height, wrong for a mixed kit, so first add a uniform
   `--scale` (a workflow input beside `height`; `height 0` + `scale 5`) —
   a tooling PR — then dispatch `import-models.yml` with the kit's direct zip
   URL, `prefix k_`, `author Kenney`, `mat CONCRETE`,
   `commit_branch bot/kenney-racing-kit`.
2. On the bot branch, **prune the manifest to the placeable set** (keep:
   grandstands, pits garage, tents, light posts, banner/overhead towers, tyre
   stacks, barriers; drop: road pieces, cars, flags) by deleting the unwanted
   `assets/pack/models/*.bin` and re-running `assets.mjs verify` (md5 +
   budget). Record the kit in `assets/pack/CREDITS.md` (the workflow does).
3. **Found 2026-10-02 (the Slice D survey):** a kit GLB shares one POSITION
   accessor across its per-material primitives and the importer copied it
   whole per primitive, so the 41 kept models carried 53,995 vertices for
   15,822 referenced (3.4×). The importer now emits only what each primitive
   indexes; re-dispatch the import once that lands and re-prune, so the pack
   and any instanced upload (Slice D) carry the referenced vertices only.
4. Verify: `tests/unit/import-models.test.mjs` (determinism),
   `tests/unit/model-pack-format.test.mjs` (every shipped model v2),
   `assets-pack.test.mjs` (licence allow-list CC0). Open as a draft PR; the
   models are inert until Slice B references them.

## Slice B — per-model material and UVs (item 6, part 2) — M — NOT NEEDED (2026-10-02)

The premise was wrong: the lit shaders' `matTexUV` (GLX `glsl-lit.js`,
mirrored on TLX and WGX) is TRIPLANAR in world space — a baked material layer
tiles `vWorldPos.xz` for floors and `vWorldPos.{x|z},y` for wall-like MATs by
the normal — so a baked model gets the material arrays' relief today from its
per-vertex `mat` alone, without UVs. The 41 kit models carry `CONCRETE`; an
authored UV stream would only matter for a per-model albedo texture, which
the pack format does not carry and the flat-coloured kit does not have. Left
here as the record; the rest of the slice is moot.

1. **AX26 v3**: append an optional `uv` stream (u16 ×2, normalised) after the
   index block, flagged in the header's version word. The reader
   (`_parseModel`) returns `uv` when present; v1/v2 still parse. The writer
   (`writeAX26`) emits v3 only when the mesh carries TEXCOORD_0.
2. The graph's `bakedModel` placement (`js/track/scenery/build-props.js`)
   copies `uv` into the scenery buffer; the lit shaders already pick a UV per
   material (`matTexUV`) — add the "authored UV" branch for mesh-carried UVs
   on GLX, TLX and WGX (parity row).
3. Verify with a unit test on a v3 round trip and the `gfx` browser group.

## Slice C — swap the synthetic recipes for the kit (item 6, part 3) — S

Rename on the five placing circuits: `kenney_grandstand` → `k_grandstand…`
etc. (one table in `js/track/scenery/build-props.js`, so the circuits do not
change), delete the matching synthetic recipes from `synth-models.mjs`, and
drop the ten synthetic models no circuit references. Verify: the five
foundation specs; `verify-track` for each; the index-strip pins in
`tests/unit/track-build-vm-release.test.mjs` are re-measured (they will move:
real grandstands are 128–1302 triangles against the boxes' 12).

## Slice D — instance baked models (item 7) — M — DONE 2026-10-02

A model placed N times was N copies in the props soup. `bakedModel()` now
records every placement (`track.modelInstances[key] = {id, mat, verts, tris,
n, inst, xf: [x, y, z, yaw, scale] × n, tint}`) and, when the backend draws
instanced batches (`G.createInstancedBatch` — the graph's primitive models
already go that way), `flushModels` keeps a key as ONE compacted geometry
(`TrackGraph.meshModel`: referenced vertices only, `mat` forced when the
placement asks) plus N transforms (`meshPlace`), which `batches()` returns
as `mesh:<key>` records beside the primitive batches — so `tracks.js`
uploads them, `instTop` folds them into the shadow span, and GLX, TLX and
WGX draw and shadow them with NO backend change. A key is batched only when
it saves ≥ 1024 vertices (two 28-triangle barriers are cheaper copied than
as a draw + shadow caster + TLX's ~64 KB padded instance block). Off without
the batch API (every VM sweep, `verify-track`, the build worker) and under
`apex26.modelInst=0`, so the fleet audits still measure the copies and the
`track-build-vm-release` pins did not move. Measured on this tree: Monza's
30 construction barriers + 13 cones, Silverstone's 19 + 15, Spa's 23 + 10
become two batches each (~2 k triangles a circuit); the point is Slice E,
where grandstands (128–1302 triangles) and pits garages are placed tens of
times per circuit. Verify: `tests/unit/baked-model-instancing.test.mjs`.
Known: TLX on software WebGPU skips every instanced batch (`skipBatches`),
so CI soft-present frames do not show instanced models; browser-side
`props-over-road.spec` / `__apex.trackGeometry()` no longer see them (the
VM sweeps, which do the geometry audits, still do).

## Slice E — spread to the other 46 circuits (item 8) — S × 46 — needs a rendered look first

**Measured 2026-10-02** (every kit model's AX26 geometry, `scratchpad/model-front.cjs`
on the compacted pack): the kit's FRONT is +Z in model space — the grandstands'
tiers rise toward −Z and their riser normals sum to +Z (k_grandstand nrmΣz +75,
awning +91, covered +81; the round stands rise along −X−Z), the pits garages'
and offices' door faces sum to +Z (+36 / +83 / +24), the light posts' heads
lean +Z. `bakedModel`'s default yaw already turns model +Z toward the road
(`atan2(t.x, t.z) ± π/2` by side), so the kit faces the track with NO engine
change and no `rotY`. Sizes at ×5: grandstands 5.0 wide × 4.5–6.9 tall
(round 8.2), pits garage 5.0 × 3.5 × 5.4, tents 5–10 × 3.5, light posts
3.2–4.0, banner towers 6.2, billboards 5.0 × 5.0.

What still blocks a blind pass: the placing circuits are already dense
(Monza's paddock has motorhomes 55–65 m off the line for s < 0.10 / > 0.90,
a broadcast compound and four synthetic yards), props carry no prop-vs-prop
overlap guard (only the road guard and the pit complex), and the kit's
grandstands are 4.5–7 m toy stands beside 40 m procedural ones, so swapping
the authored stands would shrink them. The pass that is safe without eyes is
paddock FURNITURE (tents, banner towers, billboards, light posts, TV camera,
radar) in gaps a rendered look confirms, one circuit per `track-surveyor`
run; the `k_` barrier/pylon swap (#744) is the template.

With A–D in, a per-circuit pass by the `track-surveyor` agent, one circuit per
run, editing only `js/circuits/scenery/<id>.js`: grandstands at the authored
stands, the pits garage along the pit lane, one landmark. Verify per circuit:
`node tools/track/verify-track.cjs <id>` and the circuit's foundation spec.

## Slice F — bake-time trees (item 14) — M — design notes 2026-10-02

`@dgreenheck/ez-tree` 1.1.0 is reachable from the container (`npm view`), so
the bake can run here (`npm i --no-save @dgreenheck/ez-tree three`, never a
`package.json` dependency: the bake is a manual tool whose output is
committed). Two things the plan under-sized:

1. **Sway weights need the format.** The procedural crowns carry wind as the
   FRACTION of the per-vertex `mat` (`MAT.FOLIAGE + w × SWAY_FRAC`, nature.js
   `swayOn`); AX26 v2 stores `mat` as u8, so a baked tree loses it. AX26 v3 =
   v2 + a trailing u8 `sway` stream (w × 255), read back as `mat + sway/255 ×
   SWAY_FRAC` in `_parseModel`, its node mirror `tools/lib/pack-assets.cjs`
   and `tests/helpers/ax26.mjs`; `model-pack-format.test.mjs` must admit v3
   for the tree ids. That is Slice G's encoding delivered with F.
2. **The VM measures copies.** Slice D instances baked models only where the
   batch API exists; every sweep (`props-tri-ratchet`, `track-build-vm-release`,
   `coplanar-faces`, …) builds on the copy path, so a 200-triangle tree in
   place of a ~70-triangle cone pine, placed thousands of times by
   `forestEdge`, raises the measured props triangles ~3× on forested
   circuits (Spa, Suzuka) and trips the tri ratchets even though the browser
   draws one geometry per species. Either the sweeps' VM grows a
   `createInstancedBatch` stub (then `baked-model-instancing.test.mjs`'s
   copy-path pins move to a flag) or the tree LOD stays within the cone's
   budget (~70 tris: 8 leaf cards + a 4-segment trunk) and the win is shape,
   not detail. Decide before baking.

ez-tree (MIT, https://github.com/dgreenheck/ez-tree) generates branching
trees with leaf cards and per-vertex wind weights. A bake script under
`tools/gen/<new>/bake-trees.mjs` renders three species × two LODs to AX26 v3
(leaf cards as a FOLIAGE-material quad set) and the existing sway path
(`js/track/scenery/nature.js` `swayOn`) drives them. Verify: a graph bake
vertex-count test; the sway parity test; `verify-track` on a forested
circuit (Spa).

## Slice G — per-vertex wind, Crysis style (item 15) — S after F

Encode trunk stiffness, branch phase and leaf flutter in the vertex colour's
spare channels (GPU Gems 3 ch. 16) and read them in the FOLIAGE sway on all
three backends, so the sway is per branch, not per crown. Verify: the sway
test's amplitude varies across a crown.

## Slice H — crowds that move (item 16) — L, its own plan

Vertex-animation-texture crowds (GPU Gems 3 ch. 2): a few poses from
Quaternius' CC0 animated people baked to a small pose texture, a per-seat
phase, sampled in the vertex shader; flipbook cards on mobile. The payoff is
the broadcast and flyby cameras
([`2026-09-30-broadcast-feel.md`](2026-09-30-broadcast-feel.md)). Budget it
in `apex_frame_report` before design.

## Item 17 — glTF delivery, recorded, no code

If the pack ever moves from AX26 to glTF: three r186's loader supports draco,
meshopt and KTX2 and `EXT_mesh_gpu_instancing`; meshopt's decoder (~6 KB
gzipped) is the fit over draco (~63 KB) and basis (~245 KB); `MSFT_lod` is
not built in, so LOD stays ours. Not recommended now: AX26 v2 is 22 B a
vertex and already smaller than a quantised glTF with its JSON.

## Order

A → C (the look changes on five circuits with real geometry) → D (so E can
scale) → B (relief on the kit) → E → F → G → H.

**Status 2026-10-02 08:50 UTC:** A (#743, re-imported compact in #752 + #756),
C's first step (#744: Monza and Silverstone barriers and pylons) and D (#753)
are merged and live. B is not needed (triplanar material UVs). E, F, G and H
wait on the two decisions above (a rendered look for E; the sway stream and
the VM tri budget for F/G).

## Sources

- Kenney Racing Kit (CC0): https://kenney.nl/assets/racing-kit
- Quaternius (CC0): https://quaternius.com/
- ez-tree (MIT): https://github.com/dgreenheck/ez-tree
- GPU Gems 3 ch. 16 (vegetation wind): https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-16-vegetation-procedural-animation-and-shading-crysis
- GPU Gems 3 ch. 2 (crowds): https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-2-animated-crowd-rendering
- three.js BatchedMesh: https://threejs.org/docs/#api/en/objects/BatchedMesh
- meshoptimizer / gltfpack: https://github.com/zeux/meshoptimizer
