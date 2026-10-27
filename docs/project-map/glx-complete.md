# GLX complete source map

Read at checkout HEAD `c4dc493d96e7948404202dada23ca125e577297d`, 2026-10-27 UTC. Scope: every file recursively under `js/render/glx/`, including every GLSL template, comment, registration and inline occlusion shader. Source was read only; this report is the only authored output of this lane. No browser, rendering, GPU timing, source edit or commit was performed.

## Complete read ledger

All 10 files / 10,485 lines were read to EOF. The successful bounded reads below replace two initially oversized/truncated reads; neither truncated output counts toward completeness. Ranges are inclusive and gap-free. Hashes identify the exact source read (the shared checkout can change independently).

| File | Lines | Successful complete read ranges | SHA-256 |
| --- | ---: | --- | --- |
| `js/render/glx/chunked.js` | 848 | 1–450; 451–848 | `7ad6e66ee44b7868051ef18426848bd3203cf5dd0256dac2207398fed90efee3` |
| `js/render/glx/glx.js` | 2887 | 1–250; 251–750; 751–1250; 1251–1750; 1751–2250; 2251–2887 | `9453e308fc6f88160634c29d2d4bee36ec6ca7074fc8b8381ce26f457baf553f` |
| `js/render/glx/post.js` | 1354 | 1–450; 451–900; 901–1354 | `bee401242ac69ab9a0529848d324b43ba16cd6ea257f9dce73eaafef5b6c86d1` |
| `js/render/glx/shaders/glsl-chunks.js` | 69 | 1–69 | `4573d49f92ab51d3f767b1246c75f23508b165c538dce5aba0344bdd09e757fa` |
| `js/render/glx/shaders/glsl-fx.js` | 327 | 1–327 | `191bfa039e49a7eebb5292ba112465538fc295097981214c41f44edac594b8e4` |
| `js/render/glx/shaders/glsl-lit.js` | 2295 | 1–300; 301–750; 751–1200; 1201–1650; 1651–2050; 2051–2295 | `8b1364935ccf293ecd336c76c67203cb633eed77fc5bdc421fe1bb1e90f8d352` |
| `js/render/glx/shaders/glsl-post.js` | 1620 | 1–250; 251–700; 701–1150; 1151–1620 | `a4a4b0e94dd4087164fb43e679c549e11eab171b70f3845352f6e09ff37f9239` |
| `js/render/glx/shaders/glsl-sky.js` | 460 | 1–240; 241–460 | `1b505f57a1eafb35940abd59423b04c5c3af17cd049e30b56d380bca30150685` |
| `js/render/glx/shadow.js` | 409 | 1–230; 231–409 | `ebc10e724c6f35c1d42c760a61a66b689e6a975eadedec9f9073adc61c29d0bb` |
| `js/render/glx/soft.js` | 216 | 1–216 | `448e29f42a06205cce956f0fb5d8a01618380bfa1c7e7c84d96c081bfd425976` |

## Architecture and contracts

`tools/manifest.cjs:957` lists the deferred bundle: chunks → lit/sky/fx/post shader data → post/shadow/chunked/soft modules → backend. Hard ordering edges at `tools/manifest.cjs:1364` enforce the template interpolation and backend destructuring dependencies. `GLXChunks` supplies hash, noise, dither and ACES text; the other shader files extend `window.GLXShaders`. These are JavaScript strings compiled by WebGL2, not standalone shader modules.

`glx.js:10` owns the single backend and installs its property descriptors onto the eager, stable `GLX` object at EOF. `js/render/shared/glx-facade.js:21` preserves live getters and object identity. `js/render/gfx.js:1` documents GLX as explicit WebGL2 choice/fallback and TLX as default. `init` acquires the context, detects capabilities, batches core shader linking, builds a live `core` dependencies object, initializes post/shadow/chunked, creates dynamic FX VAOs and then resizes. Context loss gates rendering and uses bounded reload/escalation rather than rebuilding the entire resource graph.

`glx.js:786` builds the private core seam: shared program/VAO/blend/depth/offset helpers, shader compiler, mesh/material helpers, output target accessors, and getters onto current frame state. `core.post` and `core.shadow` are attached after initialization. All subsystem state belongs to that initialized context; the module globals are factories or immutable shader data. The per-chunk upload wrapper deliberately forwards only three arguments (`glx.js:805`), despite chunked callers passing dynamic tail-light arguments: this is an explicitly recorded reverted behavior, not an accidental omission to repair during a map.

Mesh handles own VAO, vertex and index buffers. VertexPack defines the packed attribute layout: position 0, normal 1, color/material 2, optional track coordinates 4; instanced matrices occupy 5–8 and color 9. Generic attribute 9 is initialized to white. Static instancing culls spatial cells and repacks visible transforms because WebGL2 lacks baseInstance. Source matrices, camera pack, shadow pack and desktop mirror pack have distinct ownership/cache keys; updateInstances invalidates camera cull snapshots. Matching free methods release the corresponding resources.

`chunked.js:305` bins large meshes by triangle centroid into shared vertex/index storage with bounded per-chunk index uploads; small meshes fall back to ordinary meshes. Uint16 index ranges receive degenerate padding to keep offsets aligned while retaining contiguity. Camera and shadow draws merge adjacent visible ranges. Optional multi-draw groups visible chunks by baked lamp set, uploads one set per group and restores the frame light set and shadow slot in nested finally blocks. Optional occlusion queries harvest asynchronously and redraw conservative AABB proxies against completed opaque depth. Both optimization toggles ship off. All culling relies on shared Frustum/ChunkBins/InstCells helpers; world-coordinate chunk bounds assume the intended world-mesh draw usage.

`shadow.js` allocates static sun depth (2048 desktop / 1024 phone), desktop car depth (1024), desktop nearest-lamp depth (512), and desktop PCSS blocker reduction (512 R32F). Begin/cast/end own the active depth program and cull VP. Keep methods distinguish cached-map cadence skips from a stopped pass; they require at least one previous rasterization. Armed flags are consumed/disarmed by post present. A shadow instance VAO points at the dedicated light-culled matrix pack and leaves the lit camera VAO untouched.

`post.js` owns scene color/depth, optional MSAA, bloom mip chain, half-resolution AO/contact and volumetric targets, LDR/FXAA and optional SGSR intermediate, procedural dirt and mirror resources. Mobile target allocation uses a square cover with logical dimensions and UV scale to avoid orientation reallocations. Present resolves only required depth, runs AO/contact, volumetrics and bloom, composites scene/SSR/grade/exposure/flare, resolves FXAA and optional SGSR to the caller output, composites the HUD mirror, invalidates disposable depth and closes GPU timing. Scene/post failure falls back to direct rendering; mirror failure disables that feature. Mirror glass samples the same mirror target in the main scene before tone mapping, while the HUD inset grades its HDR target separately.

The lit shader implements material IDs 0–16, car surfaces and finishes, packed map layers, procedural relief and track-space road/pit paint; then wet/porous/puddle/ripple treatment, sun and baked/live lamps, clearcoat/environment response, emissive radiance and atmosphere. Scene alpha is metadata: .35 car paint, .75 porous opaque world, 1 sealed world. Blended draw/FX paths preserve this tag; chunked and instanced paths explicitly require opaque use. The post shader uses receiver tags to separate road/car SSR; bloom samples the pre-composite scene, so volumetrics and SSR substitutions do not feed bloom. Shader leaves mirror selected formulas across backend families; textual parity is not execution proof.

`soft.js` is an on-demand screenshot bridge, enabled under automation unless native capture is requested. It reads the presented LDR framebuffer, flips rows and forces opaque alpha onto `#game-soft`, skipping near-black captures. A generation wait normally requires a newer blit; the software UI defer branch intentionally satisfies waiters without GPU readback. Headed frame waiters resolve inside present, before compositor clearing. Therefore a generation bump alone is not proof of fresh image pixels.

## LSP evidence and consumer boundaries

Used the checkout-local `bash tools/mcp/lsp-mcp.sh` fallback after reading `.claude/skills/code-nav/SKILL.md`; attached cloud tools were not used because this audit identifies the local checkout. The queries completed successfully:

| Query | Result and implication |
| --- | --- |
| `refs GLXBackend --files` | 2 references / 1 file: backend definition and install stay local. |
| `refs GLXPost --files`, `refs GLXShadow --files`, `refs GLXChunked --files`, `refs GLXSoft --files` | Each 3 references / 2 files: its own factory/freeze plus glx initialization. |
| `refs GLXShaders --files` | 11 references / 7 files: four shader registrations plus core/post/shadow consumers. LSP explicitly labels this a text fallback because window registrations are untyped and ambiguous. |
| `refs GLX --files` | 161 references / 35 files. Includes renderer boot/picker, cockpit preview, garage prebuild, agent tools, performance/quality modules and eval-time device-tier readers (audio, livery, lighting, scenery). |
| `hover G.gfx` | Contract definition `types/game-ctx.d.ts:674`, `readonly gfx: GfxBackend | null`; hover display is `Opaque | null`. |
| `refs G.gfx --files` | 242 matches / 21 files, explicitly a facade text-match result: car-draw 111, shared shadow-pass 47, mirror-pass 20, debris-world 10, garage prebuild 8; remaining users include atmosphere, UI, cameras and agent views. |
| `hover GLXBackend.begin` | `begin(frame: any): false | undefined`; LSP reports module-file fallback and export/caller coverage unverified. |
| `def GLX.install --body --max-lines=30` | Descriptor installation at shared/glx-facade.js:21; also explicitly fallback with direct-use coverage unverified. |

Those fallbacks establish navigation limits: no claim that LSP proves every dynamic property consumer or validates GLSL types. Full source reads establish the private seam and actual exports; `gfx.js` and the facade establish intended selection/identity. Only supporting snippets and navigation results outside the scoped tree were read; this is not a full audit of their implementations.

## Evidence-backed comment issues

These are documentation findings, not source changes or runtime bug claims.

| Location | Issue | Source evidence / correction direction |
| --- | --- | --- |
| glx.js:2–12 | Header says 32 spot lamps, ~13 programs, and old `js/render/shaders/` paths. | LIT_FS declares 48; the actual shader files are this tree. Init links nine core programs, eight eager post programs, depth/blocker plus lazy paths, so a fixed old total misleads. |
| glx.js:31–39 | HIGH is described as opting a phone out of memory caps and restoring full shadows/MSAA. | shared/glx-facade.js:16–18 sets mobileTier to isMobile; shadow size, car/lamp/PCSS eligibility and MSAA use IS_MOBILE directly. State current phone cap and separate physical-device gates. |
| glx.js:1494, 2828 | Environment failure/reset comments still say 120 boot error-drain presents. | DRAIN_PRESENTS is 30 at glx.js:81, reset uses that constant. Historical comparison at :78 is intentional; present-tense counts here should follow the constant. |
| glx.js:1814 | Blocker allocation described as R16F. | shadow.js:183 allocates R32F. |
| glx.js:2751 | Calls GLX the DEFAULT backend. | gfx.js:6 names TLX default; GLX is explicit/fallback. |
| shadow.js:127–128, 336–337, 374–375 | Says WGX has no car shadow pass / silently keeps blob-only or unshadowed lamps. | WGX exports carShadowBegin and lampShadowBegin at wgx.js:5926/5971; corresponding implementations are in wgx-shadow.js:391/415. |
| chunked.js:707–713 | Occlusion rationale concludes pixel-count invariance proves vertices bind and extra proxy draws are a good trade. | Same file :96–105 records subsequent one-mesh evidence and concludes draw calls bind. Preserve chronology or point to newer evidence; do not present the superseded inference as established current cost. |
| post.js:232 | Dirt-generator comment says repository ships no image assets. | glx.js:120–124 and texture-array code explicitly load assets/pack. Narrow to procedural lens dirt. |
| glsl-lit.js:1552 | Says there are no per-light shadows. | Loop at :1663 performs PCF for the one mapped floodlight; later prose already describes this exception. |
| glsl-fx.js:218 | Particle sun uniform documented as keyMul-scaled like decals. | glx.js:2669 uploads frameSunColor; scaled frameDecalSun is used by drawDecal instead. Correct comment or investigate intended parity separately. |
| glsl-post.js:244 | Five steps at 0.04 are described as reaching ~0.32m. | Maximum current distance is 0.20m. The comment survived the 8→5 reduction. |
| glsl-post.js:1117–1125 | Claims SSR could not pass bright threshold even if order allowed, citing soft clip ~2.86 and mix cap .80. | These upper bounds do not prove below-threshold radiance (bright default .75 in post.js:581). The actual, sufficient fact is pass order: bright extraction precedes SSR composition. Remove unsupported numerical impossibility claim. |

Many longer comments explain historical measurements or guards and remain useful: copied matrix/vector cache values, shadow/camera pack separation, sampler-type unit invariants, opaque alpha tags, padded chunk contiguity and shadow keep semantics are supported by adjacent executable logic. Their historical timing/percentage claims were read, not re-measured. Relative references to old line numbers inside GLSL explanation blocks drift after edits; prefer named expressions or function anchors when revising them.

## Limits and verification

Complete static reading and LSP navigation: **Pass**. All scoped source files read, including comments/shaders; oversized read gaps were retried. Source changes/browser/GPU validation: **Skip**, by task scope. No claim of visual correctness, driver support, extension adoption percentages, shader-link success, performance improvement or absence of runtime defects follows from this map. No source comments were corrected here. Documentation integrity checks are left to the coordinating parent, which owns the aggregate report verification.
