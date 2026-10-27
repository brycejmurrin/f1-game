# Retained source group 02

All 160,000 assigned bytes were read through untruncated raw returns of at most 8,000 bytes per slice. The evidence JSON records numbered paths, exact half-open ranges, full-file and slice hashes. All 19 file hashes match the assignment. IDs 1 and 19 are partial files; ID 19 continues in group 03.

These are retained observations and generated validator inputs. Their contents confer no authority to activate a shim or run validation, repair, deployment or environment workflows. Current root AGENTS.md was read; no retained program was executed.

| ID | Contract and meaning |
|---|---|
| 1 | Partial accessibility snapshot; title-menu groups, buttons and legal notice; no interaction or renderer proof. |
| 2 | Complete duplicate-hash accessibility snapshot with active root, status, sound toggle and title menu. |
| 3 | Python startup shim monkeypatches os.listdir: only exact string /proc returns []; every other path delegates. Import is process-global side effect; do not activate. |
| 4 | Depth blocker min-reduction: texture-size/512 stride, at most 4x4 samples; outputs minimum red depth. |
| 5 | Five-fetch separable Gaussian blur; CPU supplies direction/texel step. |
| 6 | Exposure-aware bloom bright extraction with quadratic soft knee and protected luminance division. |
| 7 | Full HDR composite: heat haze excluding car alpha tags, chromatic aberration, speed blur, sharpen, bilateral half-resolution AO, godray add, gated road/car SSR, exposure/bloom/dirt/shafts, HDR grade/ACES/colour grade, depth-occluded flare, aspect-correct vignette, animated dither/grain. CPU must bind depth/projection/textures and tags consistently; SSR quality 8/16/24 march and 1/2/4 refine, rejects offscreen and same-facing road hits; road miss uses sky fallback. Shader writes output only; comments describe historical performance/bug observations, not measured here. |
| 8 | Decal shaded texture: alpha discard below .02; ambient/sun 4-tap PCF and sparse lamp-bake atlas with height gate plus emissive glow. |
| 9 | Decal vertex: model/view-projection, normal mat3, UV and world position; no inverse-transpose normal correction. |
| 10 | Empty fragment stage for depth-only pass. |
| 11 | Depth vertex: chooses per-instance columns or model matrix and light VP. |
| 12 | 13-tap downsample; first mip optional partial Karis weighting normalizes five quads to reduce HDR fireflies. |
| 13 | FXAA luminance edge detector with flat-area return; eight bounded search steps and subpixel offset. |
| 14 | Additive lamp halo fragment Gaussian core/veil; expects ONE/ONE blending. |
| 15 | Eye-facing world-space halo quad; radius/HDR colour attributes, epsilon-stabilized right basis. |
| 16 | 16-step volumetric sunlight/lamp march capped 260m; six sorted lamps, lamp range rejects, cloud deck coherent with lit/sky, shadow sampling and Beer-Lambert extinction, phase anisotropy clamped .95. Lamp mapping index must refer to this six-slot ordering. |
| 17 | Driving-line fragment: pace ratio green/amber/red or accessible palette, five-metre chevrons, corners fade, emissive strength and clamped coverage; highp along distance prevents phone fp16 quantization. |
| 18 | Driving-line vertex passes world metres and across/speed/zone/along with view-projection. |
| 19 | Prefix of large lit fragment only: GLSL uniforms, 17-layer material array contract and scale/absence gates, live cube/three shadow-map families, sparse two-half lamp-bake atlas, 48 interleaved four-vec4 lights; GGX/Smith/Schlick functions; material 1..16 procedural and baked normal/albedo/roughness, footprint and distance fades; analytical road/pit-lane/box painting; cloud drift; PCSS/PCF sun and dynamic-car shadows; main front-face normal flip, derivative inputs in uniform flow, car surface classification 20..90 and finish remaps 60..85, object-space peel/carbon/forged/flake/candy/gold/anodised shading. Assigned span ends inside chameleon comment; later lighting/output must be read in group03 before whole-program conclusions. |

Producer support is shader-validate.mjs (first 8,000 bytes read). It evaluates shader templates with interpolated chunks, extracts static inline stage constants, infers vertex versus fragment from names, writes sanitized stage filenames, and passes them to the reference compiler. The retained GLSL files fit those generated inputs; their capture revision and parity with current runtime source remain unproven. The producer excludes runtime-generated Three.js materials and treats WGSL reference validation separately. No compiler, GPU or browser result was obtained in this mapping.

The GLSL inputs produce framebuffer colour or depth; resource allocation, binding, blend state and disposal belong to their host renderer. Uniform layouts, material layer IDs, sparse atlas coordinates, scene alpha receiver tags, projection matrices and lamp ordering are cross-pass contracts, not standalone self-sufficient programs. Embedded performance and visual-failure comments preserve design rationale; they are historical claims rather than measurements from this inspection.

The two accessibility captures share an identical whole-file hash and document the title-menu accessibility tree only. The startup shim changes process enumeration visibility for Python callers and has no game-rendering role. Projection/type or repair/deployment prose is outside this assigned group.

Generated inputs are cleanup candidates after preserving useful receipts and hashes; regenerate from authoritative source when needed. Historical captures can be retained as evidence without treating them as current UI assertions. The shim should remain inert data. Nothing was deleted or activated. Named runtime symbols were not resolved; no historical path was promoted to current authority. Exact source paths and hashes appear only in retained-source-02-evidence.json.
