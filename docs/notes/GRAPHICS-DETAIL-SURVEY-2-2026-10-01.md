# Graphics detail survey, round two — models, life, sky and weather (2026-10-01)

Status: **RESEARCH / PROPOSAL** — no code changed. Second pass after
[GRAPHICS-DETAIL-SURVEY-2026-10-01.md](GRAPHICS-DETAIL-SURVEY-2026-10-01.md), whose
first eight slices have shipped or are open as drafts (tangent frame #658, kerb
stripes and wear band #659, sun glint range and env probe #660, crown rounding
#661, carbon weave #662, wheel spin blur #664, FXAA 3.11 #666, TLX scene MSAA
#693). Those items are not re-proposed. Method: four read-only hunts (the model
and asset pipeline; life and motion in the world; sky, weather and presentation;
a web pass over CC0 model sources, tree and crowd techniques and glTF delivery in
three.js r186), each claim re-read in the source before it was kept. Line numbers
are the deploy tip `35ef73af`. The parity rule binds every item: a look ships on
GLX, TLX and WGX or is recorded as a gap (`docs/ARCHITECTURE.md` §Cross-backend
parity). Plans that already cover a neighbouring slice are linked rather than
repeated: [broadcast feel](../plans/2026-09-30-broadcast-feel.md),
[flyby improvements](../plans/2026-09-24-flyby-improvements.md),
[wetness lighting](../plans/2026-09-30-wetness-lighting.md).

## What exists today — the findings that matter

Five of these are correctness problems, not tuning. They are listed first.

### Correctness
- **The baked model pack races the first build.** `Assets.loadModels()` is
  fire-and-forget at boot (`js/game.js:444`) and `ensureScenery()`
  (`js/game.js:150-159`) awaits only the circuit's scenery script. Prop placement
  is synchronous by design, so a circuit whose `bakedModel(...)` call runs before
  the manifest and the model file land gets the box fallback for the whole
  session — the comment at `js/game.js:439-443` accepts this as "nothing placed
  rather than a differently-built track", but the fallback is a different look,
  and a fast boot (service-worker cache, direct deep link) hits it most. Only five
  circuits place baked models today (`js/circuits/scenery/{monza,monaco,spa,
  silverstone,vegas}.js`), so the race is rarely seen; it will be seen the moment
  item 1 below spreads models to the other 46.
- **The asset pack's environment entries override every circuit's authored
  ambient.** `js/lighting/atmosphere.js:241-251` looks up `<track>|<tod>` then
  `*|<tod>` and copies ambientSky, ambientGround, zenith and horizon over the
  time-of-day base. The shipped manifest carries only the wildcard keys
  (`*|default`, `*|day`, `*|dusk`, `*|dawn` in `assets/pack/manifest.json`), so
  on every non-night race the same four baked colours replace the per-circuit
  palette ambient set at `js/lighting/atmosphere.js:162-174`. Bahrain's dusk and
  Spa's overcast grey are the same ambient. Either the per-track keys need baking
  or the wildcard must blend, not replace.
- **The moon does not hang where the moonlight comes from.** The sky disc uses a
  constant `normalize(vec3(0.42, 0.72, 0.55))` (`js/render/glx/shaders/glsl-sky.js:375`,
  `js/render/three/tsl-sky.js:422`, `js/render/webgpu/wgsl-chunks.js:2021`) while
  the night key light, moon specular on the wet road and the shadow pass use the
  palette's sun direction. At Singapore the moon is up-left of the pit straight
  and the shadows fall toward it.
- **Marshal flags are baked at build time by hash.** `hash(k) < 0.72` picks
  yellow or blue per post (`js/track/scenery/structures.js:455-456`) and the quad
  never changes. A yellow-flag sector, the blue flag for a lapped car and the
  chequered flag exist in the race logic and the HUD but never reach the posts
  the player drives past.
- **The start gantry is three static grey boxes.** `js/track/scenery/structures.js:379-385`
  adds three `RAW.addBox` lamps per gantry (brighter at night) and nothing drives
  them: the five-light start sequence is HUD-only. The gantry sits in the first
  frame every player sees.

### Limits that stop the world looking inhabited
- **Every "kenney_*" model in the pack is synthetic.** All 36 models in
  `assets/pack/models/` come from `tools/gen/synth-models.mjs` (box, prism and
  cylinder recipes), not from the Kenney kits whose names they borrow. They have
  no UVs (so the material array's relief never reaches them), no LOD, no normals
  beyond face normals, are placed once per call (never instanced) and ten of
  them are referenced by no circuit. The baked path is a working pipeline with
  placeholder content.
- **Only generic scenery exists off the five flagship circuits.** 46 circuits
  draw grandstands, pit buildings, bridges and huts from the procedural tables in
  `js/track/scenery/structures.js`; the result is correct but identical in
  character from Melbourne to Yas Marina.
- **Weather is three discrete states that pop.** `js/race/weather-arc.js:7-17`
  walks a dry→wet→rain ladder; `js/race/weather-arc.js:49-58` flips the rain
  layer, the audio and the lighting at once, and only the wetness ramp and the
  rain overlay interpolate. Cloud cover, sun strength and fog step.
- **Clouds never hide the sun.** The sky shader damps the sun's brightness under
  overcast as a global factor (`js/render/glx/shaders/glsl-sky.js:220`) but the
  disc and the directional light are not occluded by the cloud field that is
  drawn in front of them: a cumulus passes over the sun and the ground stays lit.
- **Particles are unlit, unfogged and unshadowed.** Tyre smoke, sparks, gravel,
  spray and now rain (`js/fx/particles.js:1`, `js/fx/particles.js:205-212`)
  share one alpha batch with no lighting term and no fog: smoke in the Monaco
  tunnel is as bright as smoke in the sun, and night smoke glows white next to
  near-black ambient.
- **Puddles are value noise on a flat mask.** `js/render/glx/shaders/glsl-lit.js:1161-1194`
  carves pools with a noise threshold and never reads the road's lateral position
  (`vTrk.y`) or its camber, so water pools equally on the crown and in the
  gutter, and a banked turn holds standing water on its high side.
- **Three modules are at their ratchets.** `js/game.js` 9669 of 9691 lines,
  `js/car/car3d.js` 4093 of 4097, `js/render/glx/glx.js` 2776 of 2777
  (`tests/data/ratchets.json`). Any item below that touches them must extract a
  module first; the 40-line auto-raise is spent.

## Proposals, ranked by payoff ÷ cost

Each entry: what, where, cost, how to verify. Items that touch a ratcheted file
say what they extract.

1. **Wait for the model manifest before the first build.** Make `ensureScenery`
   also await `Assets.loadModels()`'s promise (memoise it in `js/render/shared/assets.js`
   next to the manifest fetch, `js/render/shared/assets.js:254-340`), with a
   short timeout so an offline boot still builds. One file plus one `ensureScenery`
   line; `js/game.js` is at its ratchet, so the await goes in the loader, not the
   entry. Verify: a unit test that resolves the manifest late and asserts the
   graph bake contains the model's vertices, then `tests/specs` for one flagship
   circuit.
2. **Per-circuit environment keys, or a blended wildcard.** Short term: change
   `js/lighting/atmosphere.js:246-249` to `mix(base, baked, envStr)` behind the
   existing env-strength knob so the palette ambient survives. Long term: bake
   `<track>|<tod>` keys for the circuits whose palettes were authored (the picker
   hero already reads a per-circuit sky). Verify: `__apex.frame` ambient differs
   between Bahrain and Spa at the same time of day.
3. **Moon direction from the palette.** Replace the three constants with the
   night sun direction uniform the lit shader already receives. One line per
   backend; add a parity row. Verify: a shader-source test that the sky chunk
   contains no literal moon vector (the pattern the tangent-frame parity test
   uses).
4. **Marshal flags driven by race control.** Keep the quad, make its colour a
   per-post uniform array (or a 1D texture of 64 entries indexed by post id in
   the vertex colour's spare channel) written each frame from the sector flag
   state: none, yellow, double yellow, blue for the car behind, green, chequered.
   Sway it with the foliage wind (`js/track/scenery/nature.js` swayOn is the
   contract). Structures stays data; the per-frame write is a 30-line module.
   Verify: `__apex.world()` exposes post flags; a spec triggers a yellow and reads
   the post colour.
5. **Start gantry lights that run the start sequence.** Replace the three boxes
   with five emissive discs on the span whose intensity comes from the same
   countdown the HUD reads, red then out, and at night as the lamp fixtures
   already are. On GLX/TLX/WGX the emissive material id exists (the lamp fixture
   anchor). Verify: a spec reads the gantry emissive at each countdown step.
6. **Real CC0 models in the pack.** Kenney's Racing Kit (CC0: grandstands at
   128–1302 triangles, pit boxes, tents, a start gantry, TV cameras, billboards,
   tyre stacks) and Poly Haven's model library (CC0, high-poly, no LOD) are
   licence-clean for bundling. Bake through the existing `tools/gen/assets.mjs`
   path (quantised v2 records, UVs added to the record so the material array
   applies), start with grandstand, pit box and gantry, and replace the synthetic
   recipes of the same name so the five circuits that already call them change
   look without a scenery edit. The bake step is permission-gated in cloud
   sessions; it needs a local or permitted run. Verify: `tools/gen/assets.mjs
   verify` for licences; vertex counts per model in a unit test; the five
   flagship foundation specs.
7. **Instance the baked models.** A model placed N times is baked N times into
   the graph. Add an instance list per model id to the graph record (position,
   yaw, scale) and expand it at replay through the existing `inst-cells`
   instancing (`js/render/shared/inst-cells.js`). Lets item 6's tri counts scale
   to a full grandstand ring. Verify: graph bake size for Monza drops; parity
   test on instance expansion across GLX/TLX/WGX.
8. **Spread models and signature scenery to the other 46 circuits.** With items
   1, 6 and 7 in place, a per-circuit pass (the `track-surveyor` agent, one
   circuit at a time, editing only `js/circuits/scenery/<id>.js`) places the
   grandstands, pit complex and one landmark each. Verify: `verify-track` and the
   circuit's foundation spec.
9. **Lit, fogged particles.** Give the particle shaders the ambient pair and
   the sun colour times a hemisphere term, plus the frame fog (the same uniforms
   the lit program binds); smoke takes ambient, sparks stay emissive. Three
   shader files plus the particle draw's uniform block. Verify: a shader test
   that the particle fragment reads the fog uniform; a night screenshot for
   sign-off only.
10. **Lock-up smoke and flat-spot flicker.** `c.wheelLock` already freezes the
    front spin (`js/car/car-draw.js:633`); emit a dense white smoke burst from the
    locked wheel's contact patch while it lasts and a short skid mark. The
    particle pool and skid marks exist; the hook is one branch in the car
    update. Verify: a spec forces a lock-up and reads the particle count.
11. **Blended weather.** Make the arc interpolate cloud cover, sun strength, fog
    density and ambient over the same ramp wetness uses (`js/race/weather-arc.js`
    `set` plus a per-frame lerp in `js/lighting/atmosphere.js`), so overcast
    arrives as a darkening sky, not a cut. Verify: `__apex.frame` sampled across
    a transition shows monotonic cloud and sun values.
12. **Clouds occlude the sun.** Sample the cloud density at the sun's sky
    position once per frame on the CPU (the same noise, evaluated in JS at one
    point) and scale the sun colour and the disc by `1 - density`; the shadow
    map keeps its direction. One function in atmosphere, one uniform. Verify:
    the sun intensity read from `__apex.frame` drops when the cloud phase puts a
    cumulus over the sun.
13. **Puddles that follow the road shape.** Multiply the puddle mask by a
    camber term from `vTrk.y` and the road's half-width (low side pools, crown
    drains) and by a per-node drainage weight the circuit can author (gutters,
    drains). Three lit shaders. Verify: puddle coverage integrated across the
    ribbon is higher on the inside of a banked turn.
14. **Bake-time trees from a procedural generator.** ez-tree (MIT) generates
    branching trees with leaf cards and wind vertex weights; bake three species
    at two LODs into the pack and feed the existing sway path. Replaces the
    current crown-and-trunk recipes on the circuits that ask for them. Verify:
    graph bake test on vertex counts; the sway parity test.
15. **Wind encoded per vertex, Crysis-style.** Store trunk stiffness, branch
    phase and leaf flutter in the vertex colour's spare channels (GPU Gems 3
    ch. 16) so the sway is per-branch, not per-crown. Needs item 14's trees or
    a channel in the current recipes. Verify: the sway test's amplitude varies
    across a crown.
16. **Crowds that move.** Grandstand occupants are static coloured quads today.
    A vertex-animation-texture crowd (GPU Gems 3 ch. 2: a few poses, a per-seat
    phase, flipbook cards on mobile) from Quaternius' CC0 animated people, baked
    to a 64×64 pose texture, sampled in the vertex shader. Worth a plan of its
    own; the payoff is the broadcast and flyby cameras (see the broadcast-feel
    plan). Verify: a shader test that the crowd vertex program reads the pose
    texture; frame-time budget in `apex_frame_report`.
17. **glTF delivery with a decoder, for a later real-asset pack.** r186's loader
    supports draco, meshopt and KTX2 and `EXT_mesh_gpu_instancing`; meshopt's
    decoder is about 6 KB gzipped against draco's 63 KB and basis' 245 KB. If the
    pack ever moves from the quantised records to glTF, gltfpack with meshopt is
    the fit; `MSFT_lod` is not built in, so LOD stays our own. The three.js
    `BatchedMesh` (draw offsets fixed in r186) is the TLX side of item 7. No code
    now; recorded so item 6 does not pick draco by default.

## Suggested order (one PR per line, each small enough to bisect)
1. Item 3 (moon direction) — three lines, a parity row, a source test.
2. Item 2 short form (blend, not replace) — one function.
3. Item 1 (wait for models) — the prerequisite for everything model-shaped.
4. Item 5 (gantry lights), then item 4 (marshal flags) — the two the player
   looks straight at.
5. Item 9 (lit particles), then item 10 (lock-up smoke).
6. Items 12 and 11 (sun occlusion, blended weather) — the wetness-lighting plan
   owns the wet half.
7. Item 13 (puddle shape).
8. Items 6, 7, 8 (real models, instancing, spread) — needs a permitted bake.
9. Items 14, 15, 16 as their own plans.

## Not recommended
- **Sketchfab's download API at runtime** needs an OAuth token per user and
  rate-limits; its licences vary per model. Bake-time only, and then the pack
  licence check must record each model's author.
- **BlenderKit free assets**: the free licence bars redistribution in another
  package, which is exactly what `assets/pack/` is.
- **Poly Haven models as shipped**: 50 k-triangle props with 4 K textures; fine
  as a bake source after decimation, never as a runtime fetch.
- **A far shadow cascade** stays with the first survey's item 9: a dedicated
  session, not a slice.
- **Re-rendering the synthetic pack with more detail**: the shapes are not the
  problem; the absence of UVs and real silhouettes is. Spend the bake on item 6.

## Sources read this session
- Kenney Racing Kit (CC0): https://kenney.nl/assets/racing-kit
- Quaternius CC0 characters and props: https://quaternius.com/
- Poly Haven models (CC0): https://polyhaven.com/models
- Sketchfab Download API: https://sketchfab.com/developers/download-api
- BlenderKit licences: https://www.blenderkit.com/
- ez-tree procedural trees (MIT): https://github.com/dgreenheck/ez-tree
- GPU Gems 3 ch. 16, vegetation procedural animation (Crysis wind):
  https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-16-vegetation-procedural-animation-and-shading-crysis
- GPU Gems 3 ch. 2, animated crowd rendering:
  https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-2-animated-crowd-rendering
- three.js GLTFLoader (draco, meshopt, KTX2, EXT_mesh_gpu_instancing):
  https://threejs.org/docs/#examples/en/loaders/GLTFLoader
- three.js BatchedMesh: https://threejs.org/docs/#api/en/objects/BatchedMesh
- three.js r186 release notes: https://github.com/mrdoob/three.js/releases/tag/r186
- meshoptimizer / gltfpack: https://github.com/zeux/meshoptimizer
- glTF EXT_mesh_gpu_instancing:
  https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/EXT_mesh_gpu_instancing
- glTF MSFT_lod: https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Vendor/MSFT_lod/README.md
