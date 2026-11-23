# Graphics tiers above ULTRA for desktop GPUs: inventory, web research, design (2026-11-20)

Summary: ULTRA draws the same picture as HIGH on the default desktop path; this note inventories every detail ceiling, records web research on models, lighting and textures, and proposes two desktop-only tiers built in five phases.

Kind: research · Re-measure-by: 2026-12-20

Asked by Bryce 2026-11-20: the laptop runs ULTRA easily, so design higher graphics levels for desktops (more
triangles, more textures, better lighting). Nothing here is built. **Evidence class: `read`** (code and docs read on
`claude/trusting-clarke-01d9ui`, no browser, no GPU) plus `web` (sources at the end; a claim marked *unverified* has
one secondary source). No GPU cost in this note is measured: this container has no GPU, so every cost is a question
for the laptop bench (Phase 0).

## 1. What ULTRA is today

- `js/perf/quality-preset.js:23-28`: HIGH and ULTRA share governor floor 0. ULTRA adds only a boot-time bit.
- That bit buys scene MSAA 4× on GLX, WGX and TLX's WebGL2 backend. On **TLX native WebGPU, the default desktop
  path, scene MSAA is 0 on every preset** (`js/render/three/tlx.js:7397-7416`); edges get FXAA only. So on Bryce's
  laptop ULTRA and HIGH render the same frame.
- The "ULTRA-night per-chunk rung" comment at `quality-preset.js:199` is stale: every preset gets the night layer
  (`js/lighting/profiles.js:113-152`).
- The governor only sheds. It measures rAF frame time, never raises quality above the preset, and clamps the user
  tier to 0..4 (`js/perf/governor.js:590-591`). The TLX GPU timer exists (`tlx.js:1328-1375`) but the governor does
  not read it.
- The archived survey already asked for this ("Give ULTRA a meaning", item 20,
  [GRAPHICS-DETAIL-SURVEY-2026-10-01](../archive/notes/GRAPHICS-DETAIL-SURVEY-2026-10-01.md)); it was never built.

## 2. Today's ceilings (the desktop maximum)

### Geometry
| Item | Today | Where |
|---|---|---|
| Car | fully procedural, 9,548 triangles default (9,396 to 13,900 across parts); wheel 772; cockpit 1,603 | `js/car/car3d.js`, `tests/data/car-wing-foil-tris.json` |
| Tyre / helmet / wing foil | 24 radial segments / 20×28 rings / 5×5 per flap | `js/car/car-wheels.js:145`, `js/car/helmets.js:175`, `js/car/car-body-geom.js:824` |
| Rival LOD | lite wheels at 50 m, shared 4,500-triangle body at 120 m, 1,500 at 250 m | `js/car/field-lod.js:19-32` |
| Road | centreline step about 4 m, 14 cross-section columns | `js/track/tracks.js:106`, `js/track/core/mesh.js:746` |
| Trees | 45 to 156 triangles; baked `*_lod1` models have no reader | `docs/notes/TREE-BUDGET-2026-10-19.md` |
| Crowd | one static 12-triangle box per seat | `docs/plans/2026-10-19-crowd-vat.md` (open, no code) |
| Far terrain | flat floor, not a heightfield | survey item 21 |
| Model loader | positions, normals, vertex colour only; no UVs, textures, skins, meshopt or Draco | `js/render/shared/gltf.js:109-386` |

### Textures and materials
| Item | Today | Where |
|---|---|---|
| Material pack | 14 procedural layers, 256² (128² low), two arrays: albedo+roughness, normal+AO | `assets/pack/manifest.json`, `tools/gen/assets.mjs:551` |
| Sampling | one hard-switched plane (not triplanar), one tile scale, no detail layer, anisotropy 4 | `js/render/glx/shaders/glsl-lit.js:361-378`, `tlx.js:5229` |
| Player livery | 2048×2560 canvas atlas; rivals 512×640 | `js/car/liverytex.js:10-59` |
| Environment reflections | 64 px live cube, off by default on TLX (`apex26.tlxEnvProbe=1`); only car clearcoat samples it | `tlx.js:1548,1727` |
| Compression | none; every texture is RGBA8 in GPU memory | [ASSET-COMPRESSION-2026-10-24](ASSET-COMPRESSION-2026-10-24.md) |
| Measured desktop GPU memory | 146 to 158 MB textures, 52 to 56 MB buffers (real macOS GPU) | [GPUMEM-HUNT-2026-10-24](GPUMEM-HUNT-2026-10-24.md) |

### Lighting, shadows, post, resolution (TLX)
| Item | Today | Where |
|---|---|---|
| Resolution | DPR cap 2; `renderScale` never above 1.0; no temporal upscaler | `tlx.js:194-204,5262` |
| Anti-aliasing | FXAA; no TAA/TRAA/SMAA | `js/render/three/tlx-post.js:18` |
| Sun shadow | one 2048² map over a ±80 m box, PCSS-lite; no cascades | `js/render/three/tlx-shadow.js:49-80` |
| Car / lamp shadow | 1024² / one 512² spot for the nearest floodlight | `tlx-shadow.js:81-82` |
| SSAO | half resolution, 8 taps | `js/render/three/tsl-post.js:270` |
| SSR | 24 march + 4 refine steps inside composite | `tsl-post.js:766-795` |
| God rays / lamp beams | half resolution, 16 steps, nearest 12 lamps | `tsl-post.js:409-437` |
| Dynamic lights | 48 slots, 24 per chunk | `js/render/shared/light-budget.js:13-18` |
| Mirror | capped 1024×512 | `js/render/shared/mirror-pass.js:231-243` |
| Output | SDR canvas, hand-written ACES fit | `tsl-post.js:530-556` |
| Sky | procedural gradient + FBM clouds | `js/render/three/tsl-sky.js` |
| three.js | r187, full builds; only the Inspector add-on is vendored | `tools/gen/vendor-three.mjs:39-62` |

## 3. Web research

**Lighting and post.** three r187 ships these stock TSL nodes in `examples/jsm/tsl/display`: `GTAONode`, `SSRNode`,
`SSGINode`, `SSSNode`, `TRAANode`, `TAAUNode`, `FSR1Node`, `SMAANode`, `DenoiseNode`, `RecurrentDenoiseNode`,
`DepthOfFieldNode`, `MotionBlur`, `GodraysNode`, `Lut3DNode`, `LensflareNode`, `ImportanceSampledEnvironment`
(directory listing read at the r187 tag). None is vendored here; each needs one `ADDONS` row in
`tools/gen/vendor-three.mjs` or a hand port into `tsl-post.js`, which is how bloom, SSAO, SSR and FXAA exist today.
`CSMShadowNode` (`three/addons/csm/CSMShadowNode.js`) is the WebGPU cascaded-shadow path; `TileShadowNode` splits
one map into tiles. Clustered or tiled lighting showed up only in third-party demos in this search. One secondary
source says r187 added a meshlet drawing pipeline (64-triangle clusters) — *unverified*, check the r187 release
notes before planning on it. Secondary sources disagree on how finished SSR and SSGI are; treat both as "try on the
laptop", not as known-good.

**HDR output.** Chrome 129+ shows true HDR from a WebGPU canvas configured `rgba16float` with
`toneMapping: { mode: "extended" }`. Safari on macOS accepted the setting but did not display HDR as of a 2025
WebKit bug comment. So HDR is a Chrome/Electron feature behind a capability check; the desktop app (Electron 44,
[DESKTOP-TEST-PLAN](DESKTOP-TEST-PLAN.md)) is the surest home for it.

**Textures.** PNG/WebP decode to raw RGBA in GPU memory whatever the file size; a 4096² texture with mips is about
90 MB. GPU block formats stay compressed: BC7 and UASTC are 8 bits per pixel, a 4× saving. Usual split: ETC1S for
colour, UASTC for normals. Repetition is fought with hex tiling (Mikkelsen, JCGT 2022: three samples per pixel, no
precomputed assets, normals blended as derivatives) and distance-based dual-scale blends. Parallax occlusion mapping
needs a height channel; no source combined it with hex tiling, so parallax would run on a single un-tiled layer
(kerbs, gravel, cobbles), which is my inference.

**Models.** Sim-racing hero cars are far above ours: Gran Turismo 7 states about 500,000 polygons per car;
Assetto Corsa is reported at about 300,000 (forum figure). Ours is 9,548. Forza's LOD guidance: weight detail to
the rear of the car (what the player sees), protect normals on glossy paint, use a single-material proxy for far
cars, and let speed hide LOD switches. For delivery, the common web recipe is quantise, then meshopt for geometry,
then KTX2 for textures.

**Crowds and trees.** Octahedral impostors (Brucks, 2018) have three.js ports, including a 200,000-tree forest demo
and a WebGPU/TSL crowd demo ("Horde"). Vertex-animation textures replay baked animation per instance in the vertex
shader, which matches the open crowd plan.

**Sky.** `@takram/three-atmosphere` (Bruneton precomputed scattering) has a WebGPU/TSL entry point for three ≥ r182.
Its volumetric clouds package is still GLSL-only, WebGPU "work in progress".

**What a commercial F1 title adds on PC.** F1 25 ships ray-traced shadows, reflections and DDGI, plus path tracing
on RTX 30-class hardware. WebGPU has no ray-tracing API, so our equivalents are screen-space: SSGI for bounce light,
SSR for reflections, cascades plus contact shadows for shadow reach.

## 4. Design

### Shape
Two new desktop-only stops above ULTRA, on the default TLX WebGPU path only (D-013 names it the path to measure
first). GLX, WGX and TLX-on-WebGL2 stop at ULTRA.

| Preset | Meaning | New downloads |
|---|---|---|
| ULTRA (redefined) | today's features with the constants raised | none |
| EXTREME | new render features and the HD asset pack | lazy, desktop only |
| CINEMA | replay, photo mode and garage only: image quality over frame rate | none beyond EXTREME |

Mechanics:
- A **detail level** (0 = today, 1 = ULTRA, 2 = EXTREME) decided at boot, passed into the track build key the way
  `mobileTier` is (`js/track/build-client.js:232`), so density changes rebuild cleanly. Phones stay at 0.
- A **cost ladder above tier 0** in the governor: when frame time slips, the extras shed first (SSGI, then
  supersampling, then shadow cascades), before any of today's tier 1-4 sheds. The governor gains a GPU-time input
  from the existing TLX timer so it can tell headroom from a frame-rate cap.
- Tests that measure budgets (props-triangle ratchet, car triangle baseline, pass census) stay pinned at detail 0.

### Phase 0 — measure and plumb (no look change)
Laptop bench of ULTRA with GPU timestamps (`bench.html`, `js/perf/bench-run.js`): GPU ms per pass at native
resolution. That number sizes everything below. Add the detail level, the preset rows and the governor's upper
ladder, all inert.

### Phase 1 — ULTRA means something (constants only, small)
| Change | From → to |
|---|---|
| Anti-aliasing on WebGPU | FXAA only → 4× MSAA or TRAA (Phase 2) |
| Supersampling | `renderScale` ≤ 1.0 → up to 1.5 when DPR ≤ 1.25 |
| Material anisotropy | 4 → 16 |
| Sun shadow | 2048² ±80 m → 4096², longer reach |
| Car shadow / lamp shadow | 1024² / one lamp → 2048² / nearest three |
| Environment probe | off, 64 px → on, 256 px, all faces each frame; glass, metal and wet road sample it too |
| SSAO, god rays | half resolution, 8 taps / 16 steps → full resolution, 16 taps / 32 steps |
| Mirror | 1024×512 → 2048×1024 |
| Rival LOD distances | 50 / 120 / 250 m → doubled |
| Rival livery | 512×640 → 1024×1280 (about +100 MB uncompressed) |
| Baked normal / albedo reach | 22-80 m / 90-260 m → doubled |
| Procedural segments | tyre 24 → 48, helmet rings and wing foils ×2 |

### Phase 2 — lighting features (EXTREME)
1. Cascaded sun shadows (3-4 cascades) replacing the single ±80 m box: shadows to the horizon on long straights.
2. TRAA with a velocity target, replacing FXAA: removes shimmer on fences, kerbs and carbon weave.
3. GTAO in place of the 8-tap SSAO.
4. Stock SSR with denoise for wet road and paint; SSGI for bounce light at the top rung.
5. More real lights at night (Singapore, Las Vegas, Bahrain): raise the 48-slot budget with clustered or tiled
   culling, and shadow more than one floodlight.
6. HDR canvas output on Chrome and the desktop app; AgX or Neutral as tone-map options (already in the bundle).
7. Physically based sky from `three-atmosphere`; volumetric clouds when its WebGPU port lands.

### Phase 3 — textures (EXTREME)
1. **HD material pack**: 1024² layers, desktop only, fetched at idle through the existing pack path
   (`sw.js:1182-1189`), stored as pre-encoded BC7. 17 layers × 2 arrays at 1024² with mips is about 45 MB in GPU
   memory as BC7 against about 180 MB as RGBA8. Pre-encoded BC7 needs no wasm transcoder; a device without
   `texture-compression-bc` keeps the 256² PNG pack. (Apple-silicon Macs expose BC to WebGPU as far as I know;
   confirm on Bryce's laptop in Phase 0.)
2. **Real scanned sources** through the existing Poly Haven bake (`assets/pack/webbake.js`), which only Bryce runs.
3. **A third array** (height + metalness) enabling parallax on kerbs, gravel and cobbles.
4. **Hex tiling** for asphalt, grass and sand; **biplanar walls** (survey item 18); a close-range detail normal.
5. Rival liveries at full 2048 once compression makes room.

### Phase 4 — models (the largest gap, the largest work)
1. **Hero car**: an authored generic 2026-regulation car at 150,000 to 250,000 triangles for the player on EXTREME,
   with a modelled cockpit, suspension, brake ducts and wheel nuts. The procedural car becomes LOD1 and the rival
   mesh. It must carry UVs laid out to the existing livery atlas so all liveries keep working, and it must stay
   generic (no real team's car; see [EXTERNAL-MODEL-SOURCES](../archive/research/EXTERNAL-MODEL-SOURCES.md)).
   Needs the model loader to read UVs and meshopt, or three's `GLTFLoader` add-on on the TLX path only.
2. **Crowd**: build the open vertex-animation crowd plan near the camera, octahedral impostors beyond.
3. **Trees**: real LOD0 trees near the track (the baked `*_lod1` models already exist), impostors far.
4. **Far terrain heightfield** (survey item 21) and **kerb profiles per circuit** (item 19).
5. Density through the detail level: forest edge depth, bushes, grandstand and city facade detail.

### Phase 5 — CINEMA
Replay, photo mode and garage: 2× supersampling, SSGI at full resolution, depth of field, per-object motion blur,
all rivals at LOD0. No frame-rate floor.

### Order by look gained per unit of work
Phase 1 (days, no assets) → cascaded shadows + TRAA → HD pack → environment reflections everywhere → hero car →
crowd and trees → SSGI and HDR.

## 5. Constraints a builder will hit
- **Backend parity**: `backend-surface-parity`, `shading-leaf-parity` and `docs/GFX-CONTRACT.md:185` require GLX,
  TLX and WGX to match. TLX-only tiers need an explicit carve-out.
- **KTX2 was declined on 2026-10-16** (`docs/research/ASSET-API-RESEARCH.md:380`), reopen "only if texture size or
  load time is a measured problem". A 1024² pack is that problem; pre-encoded BC7 avoids the transcoder that the
  refusal was about.
- **Pack budget** is 8 MB for `assets/pack/` (`tools/gen/assets.mjs:60`); an HD pack must live outside it or the
  budget must be per tier.
- **Eager shell and line ratchets are full** (`tests/data/ratchets.json`): new code goes in lazy lists.
- **Preset list is pinned** by `quality-preset-phone.test.mjs`, `perf-governor.test.mjs` and
  `gfx-backend-canary.test.mjs`.
- **CI has no GPU**: software CI skips instanced batches (`tlx.js:928`), so every look and cost claim for these
  tiers needs Bryce's laptop or the GPU census workflow.

## 6. Decisions for Bryce
1. Tiers above ULTRA on TLX WebGPU only, with GLX and WGX capped at ULTRA?
2. Two new stops (EXTREME, CINEMA) plus a redefined ULTRA, or one?
3. Reopen compressed textures as pre-encoded BC7 for a desktop-only HD pack?
4. An authored hero car model as a new asset type, and its download weight?

## Sources
- three.js r187 TSL display nodes: https://github.com/mrdoob/three.js/tree/r187/examples/jsm/tsl/display
- three.js WebGPU post-processing manual: https://threejs.org/manual/en/webgpu-postprocessing
- CSMShadowNode: https://threejs.org/docs/pages/CSMShadowNode.html · TileShadowNode: https://threejs.org/docs/pages/TileShadowNode.html
- CSM on WebGPU (forum): https://discourse.threejs.org/t/cascaded-shadow-maps-csm-on-webgpu/84235
- r187 meshlets (unverified): https://techora.ru/news/three-js-r187-renderit-pochti-2-2026-11-04
- Chrome 129 HDR canvas: https://developer.chrome.com/blog/new-in-webgpu-129 · WebKit: https://bugs.webkit.org/show_bug.cgi?id=272702
- Web texture formats (McCurdy): https://www.donmccurdy.com/2024/02/11/web-texture-formats/
- KTX2Loader: https://threejs.org/docs/pages/KTX2Loader.html
- Hex tiling (Mikkelsen, JCGT 2022): https://jcgt.org/published/0011/03/05/paper.pdf
- MeshPhysicalNodeMaterial: https://threejs.org/docs/pages/MeshPhysicalNodeMaterial.html
- GT7 car polygon count: https://www.gtplanet.net/forum/threads/gran-turismo-7s-car-models-use-500-000-polygons-each.404567
- Vehicle LODs for racing games: https://developer.microsoft.com/en-us/games/articles/2025/12/level-of-detail-vehicle-models-simplygon/
- meshopt / gltfpack: https://raw.githubusercontent.com/zeux/meshoptimizer/master/gltf/README.md
- Octahedral impostors for three.js: https://discourse.threejs.org/t/octahedral-impostors-for-three-js/80318 · forest: https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735
- three-atmosphere / three-clouds: https://www.npmjs.com/package/@takram/three-clouds
- F1 25 PC features: https://www.ea.com/games/f1/f1-25/news/f1-25-pc-features
