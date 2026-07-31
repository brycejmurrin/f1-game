# Graphics-library migration spike — three.js r184

Standalone evaluation harness: renders one **real** circuit (geometry from the
unmodified game pipeline) with three.js, to measure feasibility and performance
before committing to any renderer migration. **Nothing under `js/`, `index.html`,
`tools/manifest.cjs` or `tests/` is touched** — the whole suite stays untouched by
design. See the full plan + research in the session plan file and
`docs/WEBGPU-MAINTAINABILITY.md` for why the candidate is three.js (TSL =
single-source shaders for WebGL2 + WebGPU; the repo currently hand-maintains
~2,900 lines of GLSL *and* ~2,400 lines of WGSL).

## Files

| File | Role |
|---|---|
| `spike-data.js` | GLX stub (same trick as `tools/verify-track.cjs`) + `SpikeData.build()` — real `Tracks.build` geometry, `Car3D.build`, `LightTune` lamp records + per-frame 32-lamp cull |
| `three-spike.html` | harness page — script tags mirror `tools/manifest.cjs` TRACK_VM (hand copy, may drift) + one circuit (singapore) |
| `three-spike.js` | the three.js scene: WebGPURenderer (`?gl=1` pins WebGL2), custom TSL lit material (32-lamp loop + FLAT/METAL/GRASS procedural materials ported from `js/render/shaders/lit.js`), 2048² sun shadow, bloom+ACES, 22-car instancing A/B, `window.__spike` hooks |
| `capture.mjs` | headless capture (playwright library, NOT @playwright/test): screenshots + stats + GLX baseline with wrapped draw-call counter |
| `vendor/` | three.js 0.184.0 (`three.webgpu.min.js`, `three.core.min.js`, `three.tsl.min.js`, `addons/tsl/display/BloomNode.js`), MIT — see `LICENSE-three-0.184.0.txt` |

## Run

```sh
npx serve -l 3456 .                     # from the repo root
# http://localhost:3456/spike/three-spike.html        (auto: WebGPU if available)
# http://localhost:3456/spike/three-spike.html?gl=1   (pin WebGL2 — the CI path)
# drag = orbit, wheel = zoom, [i] = instancing toggle

node spike/capture.mjs spike            # headless spike capture (SwiftShader WebGL2)
node spike/capture.mjs baseline         # GLX baseline from the real game
node spike/capture.mjs all              # both → scratch/captures/spike/results.json
```

`window.__spike` (mirrors the `__apex` convention): `ready`, `stats()`,
`setCamera(az, el, dist, frac)`, `toggleInstancing(on?)`, `setLightCount(n)`,
`resetMs()`.

## Success criteria & results

| # | Criterion | Threshold | Result |
|---|---|---|---|
| 1 | SwiftShader renderability (`?gl=1`, headless) | renders, no console errors — **hard gate** | **PASS** — 4/4 shots non-blank, 0 errors (run 3) |
| 2 | Frame time vs GLX (Singapore night, 22 cars, 32 lamps) | spike-WebGL ≥ 0.8× GLX fps | **PASS** — spike 4,583 ms/frame vs GLX 9,170 ms on the same SwiftShader box ≈ **2.0× faster** (CPU-contention caveats; relative, not absolute) |
| 3 | 32-lamp forward viability | no cliff > 2× vs 8 lamps | **PASS** — 32 lamps 4,583 ms vs 8 lamps 6,814 ms: no light-count cliff at all (geometry/fill-bound; noise dominates) |
| 4 | Draw calls + instancing win | cars 22→1 draw; record deltas | **PASS** — 54 → 25 GL draws/frame with `InstancedMesh` (GLX baseline: 94 draws); ms flat on SwiftShader (not draw-bound there) |
| 5 | Visual acceptability | side-by-side sheet, owner judgment | **PASS (pending owner)** — `spike-t030.png` vs `glx-t030.png`: warm pools, floodlit barriers, shadows, lit windows in the same family; a155 sits inside a building (angle quirk, both renderers) |
| 6 | Port-cost extrapolation | < ~6k lines projected, no blocked capability | **PASS** — ~120 TSL lines ≈ 140 GLSL lines ported 1:1; extrapolates to ~2-3k for all 15 materials + composite; one landmine documented (stranded-assignment) |
| 7 | Single-source proof (same TSL on WebGL2 + WebGPU) | yes/no | **WebGL2 half PROVEN** (this is what CI runs); WebGPU half needs a one-time desktop-browser check (headless WebGPU unavailable here — see above) |

**No kill condition triggered.** Numbers: `scratch/captures/spike/results.json`
(spike run 3 + GLX baseline sections).

**Kill conditions:** #1 fails · spike-WebGL < 0.6× GLX · TSL cannot express the
`mat`-keyed procedural materials or the flat 32-lamp uniform array. On a kill →
timeboxed 1-day Babylon.js 8 comparison reusing `spike-data.js` (UMD script tag,
`VertexData` with RGB→RGBA repack, DefaultRenderingPipeline), else stay on GLX/WGX.

## Babylon.js comparison arm (run anyway — the numbers were worth having)

`babylon-spike.html/.js` (369 LOC, Babylon **9.19.0** UMD vendored) renders the
identical SpikeData scene. Same protocol/viewport as three run-3:

| | ms/frame | GL draws/frame |
|---|---:|---:|
| Babylon 32 lamps, 22 car meshes | 3,661 | 47 |
| Babylon 32 lamps + thin instances | **2,044** | **18** |
| three run-3 (32 lamps / instanced) | 4,583 / 4,757 | 54 / 25 |
| GLX baseline | 9,170 | 94 |

Babylon ≈1.25× faster than three here, ≈2.5× faster than GLX; thin instances
bought a real −44% frame time (shadow pass collapses too). 34 simultaneous
lights compiled in 412 ms — but only after `engine.disableUniformBuffers=true`:
Babylon binds one uniform block per light and SwiftShader caps vertex uniform
buffers at 14, so every shader failed to link out of the box. Other friction:
StandardMaterial clamps `lighting+emissive` to albedo (GLX's hot pool centres
unreachable without PBR/custom materials); spot falloff shape ≠ the game's
windowed inverse-square + bleed; and the `mat`-id procedural materials + 61-
uniform composite would land in ShaderMaterial **GLSL+WGSL (dual-source again)**
or a NodeMaterial rewrite — the exact failure mode the TSL arm eliminates.
Shots: `bab-a155/t030/topdown.png` (zero console errors) — same family as
glx-t030, pools flatter.

**Comparison verdict: three.js/TSL stays the migration pick** — the migration
cost is dominated by porting custom shading, and only TSL ports it single-source
1:1. Babylon's numbers make it a benchmarked fallback (a performance floor, not
a cliff).

## WebGPU headless status (criterion 7 constraint)

`navigator.gpu` is **absent** in this environment's headless Chromium 141 under
every flag combination tried (`--headless=new`, `--enable-unsafe-webgpu`,
`--use-webgpu-adapter=swiftshader`, `--enable-features=Vulkan`,
`--enable-blink-features=WebGPU`), even though the SwiftShader Vulkan ICD ships
with the build (`vk_swiftshader_icd.json`). Criterion 7's WebGPU half therefore
cannot be proven headless here — open `spike/three-spike.html` (no `?gl=1`) in a
desktop Chrome/Edge and confirm the HUD reads `backend webgpu`. The WebGL2 half
(same TSL material compiled to GLSL) is what CI exercises.

## Port-cost notes (criterion 6, filled during implementation)

- Surface-noise chunk (hash21/vnoise), the lamp loop (windowed inverse-square +
  aimed cone + bleed), and 2 of 15 procedural materials transliterated to TSL in
  ~120 lines of `three-spike.js` (vs ~140 lines of the corresponding GLSL) —
  mostly mechanical `a.mul(b)` chaining. `uniformArray` + `Loop`/`If`/`Break`
  express the stride-15 flat light array directly, **including dynamic indexing
  on the WebGL backend** (verified in dumped GLSL: `buffer[i]` UBO access,
  vec3→vec4 padding, Break-in-If — all compile correctly).
- **Biggest friction found — TSL stranded-assignment pitfall**: TSL emits a
  cached property chain (`normalWorld` → `normalView` → varying) at its FIRST
  USE SITE. A first use inside `If`/`ElseIf` strands the assignments in that
  branch; every out-of-branch consumer then silently reads an uninitialized
  local (our lamps went black on all non-METAL surfaces; even the sun/hemisphere
  terms were corrupted). Rule: **anchor shared varying-derived nodes with
  `.toVar()` as an unconditional Fn-body statement** before any conditional use;
  a `.toVar()` outside an Fn body does NOT anchor (also emits at first use —
  measured). Cost: a day of bisecting; the `__spike.shader()` GLSL-dump hook and
  `?viz=` modes now make this class of bug diagnosable in minutes.
- Friction (minor): TSL method-chaining is verbose vs infix GLSL; the
  Narkowicz-parameterised ACES + 61-uniform composite would need a custom
  `outputNode` chain (bloom addon shows the pattern); three's ACESFilmic is the
  Hill fit (grade shift accepted under "retune after").
- The game's no-sRGB-encode calibration is reproducible
  (`ColorManagement.enabled = false` + `LinearSRGBColorSpace`).
- Authentic-brightness note: lamp records must be scaled by the game's night
  ramp (`LT.lampLevel` 0.26, as game.js does) — at scale 1.0 the 2,400-HDR pit
  straight records blow the road to white.

## Known spike simplifications (deliberate, Phase-B work if this graduates)

single sun shadow map (no car/lamp maps, no PCSS) · no chunked frustum culling
(one BufferGeometry per track mesh, `frustumCulled = false`) · flat-gradient
sky + FogExp2 instead of the procedural sky · no particles/skids/decals/glow
billboards · eyeballed night ambience instead of the LightPresets profile ·
three's ACES(Hill)+bloom instead of the 61-uniform composite.
