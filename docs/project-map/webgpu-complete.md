# WebGPU implementation source map

Read on 2026-10-27 UTC at checkout HEAD `64809115e276d7a2b03ccf5678773a001e817db3`. This lane completed the six renderer implementation files and the foreground shader registry: **7 files / 8,210 lines**. The other two shader registries are inventoried and outlined but await their own full reads; despite the report filename, this is not a claim that all of WebGPU has been read. No source edit, browser, GPU run, or commit was performed.

## Read and hash ledger

All listed successful reads were bounded and untruncated. Ranges are inclusive. SHA-256 covers the entire named file, including files whose bodies remain unread; a hash is identity evidence, not read coverage.

| File under `js/render/webgpu/` | Lines | Full source read ranges | SHA-256 |
| --- | ---: | --- | --- |
| `wgx.js` | 6085 | 1–260; 261–650; 651–1050; 1051–1450; 1451–1850; 1851–2250; 2251–2650; 2651–3050; 3051–3450; 3451–3850; 3851–4250; 4251–4650; 4651–5050; 5051–5450; 5451–5850; 5851–6085 | `7ce7dd4b81578e15a31cd102eb36229a8c2b7c8e59f65aed837cbfbe1888d855` |
| `wgx-shadow.js` | 560 | 1–280; 281–560 | `9634a8f4895cef1b236aac806f17324bdf00ab5e74d91c12bbf261bec632543b` |
| `wgx-chunked.js` | 508 | 1–270; 271–508 | `bd51ea5391167d4055fc5a8c6374a782aa4d53475a5071343008367b37806b2b` |
| `wgx-post.js` | 209 | 1–209 | `1bf8353b7a2d85631d400ef2a14d20603da2b9cc3ea6cf30b386df857f9c8859` |
| `wgx-roadlut.js` | 180 | 1–180 | `40c386ce6eb9dff1da9f903e15b5ec4b2c69a1f92692bf1800424508a843bff8` |
| `wgx-debug-labels.js` | 117 | 1–117 | `3ccfcdd71876488f88798186d0e48a4721dfa12dcb103a27cc13d07c5e14d122` |
| `wgsl-fx.js` | 551 | 1–280; 281–551 | `7bd6caf082f03483e4e820dfb26b8b770b89bead507883cb7190b62eb77540de` |
| `wgsl-chunks.js` | 2636 | **Body unread in this lane; LSP outline only** | `b292f62c1e082cc021ac6c566f9ac03a10c1e9b39dae2be6217fc8c645b060ee` |
| `wgsl-post.js` | 1494 | **Body unread in this lane; LSP outline only** | `da85d59d7f223f6bb030a60f47c79730925c80d843910cf20ec2fc0509b40e79` |

Total inventory: 9 files / 12,340 lines; remaining full-read gap: 4,130 lines in the two named shader files. Supporting snippets outside this tree were read only to establish the seam, load order, and navigation limits.

## Selection, lifetime, and private seams

`tools/manifest.cjs:969` orders chunks → post/fx shader registries → shadow/chunked/post/roadlut/labels → WGX; hard edges at :1372–1380 protect evaluation-time string composition and the road-LUT destructuring. `WGX` is opt-in; `Gfx.create` at `js/render/gfx.js:303` awaits it and returns null to its caller for WebGL2 fallback. The eager `js/render/shared/glx-facade.js:21` installs a backend by property descriptors, preserving live size getters and stable identity. Runtime backend objects must explicitly replace unsupported facade names with undefined or honest unsupported results: omission can retain a different backend's closure.

`WGX.create(canvas, opts)` is asynchronous and ownership-aware. It checks `opts.initOwner.active` across awaited adapter/device/self-test work and destroys cancelled initialization resources. Evaluation samples GLX device tier and storage preferences; WGX_LITE combines phone, WebKit, or persisted loss rung, while MINIMAL comes only from rung 2. Software sniffing uses explicit adapter properties/known markers and automation; it forces MSAA 1 and normally selects a hidden GPU canvas plus visible 2D presentation. Hardware's native swapchain is acquired late, after offscreen validation, to preserve fallback opportunities. The static `isSupported()` is only navigator.gpu detection, not adapter or boot proof.

The factory owns device, targets, uniform/storage buffers, pipeline caches and asynchronous readback state. It returns the GLX-compatible drawing surface at `wgx.js:5873`; outer WGX exports are only create, lastFailure, gpuErrors, isSupported and the device-free __roadLutTable alias. An instance exposes resize/render scale/spatial upscale; resource factories/free methods; frame begin/draw/sky/FX/present; shadow/env/mirror passes; material arrays; instancing; capture/soft-present and diagnostics. There is no instance disposal method in this returned object. Static `_gpuErrors` and `_gpuFirstMsg` survive create calls; they are module-lifetime diagnostic state rather than independent per-device counters.

The private subsystem dependencies are live getter/setter objects, not copies of mutable state. `WGXShadow.init` at :1177 receives device/loss, formats, identity/Z01, layouts, ring cap, matrix math, vertex/index/draw helpers, instance identity and shared frustum scratch. `WGXChunked.init` at :1196 receives current lit pass/frame, cull/light state, draw ring and allocation callbacks, geometry packing, LUT ownership, bind/pipeline caches and segment capacity. `WGXPost.init` at :1738 receives formats, tier, shader registry, fullscreen pipeline builder, all post pipeline/buffer setters and an onSpatialReady callback that resizes/rebinds after asynchronous SGSR compilation.

## Geometry, illumination, and pass ordering

Lit vertices occupy **28 bytes**: float32 position, snorm16x4 normal/material code and float16x4 color. Instance records occupy 80 bytes (16 matrix floats, RGB, pad). Integer views copy packed words so NaN-looking half/short lanes are not canonicalized by float copies. DrawU uses 144 bytes but each dynamic uniform slot costs 256 bytes; the ring holds 4096 draws. FrameU is 672 bytes, a ranked light is 64 bytes, and 48 ranked lights fit the main set. Full baked lights use a separate 1024-record storage buffer; concatenated per-chunk lamp indices have a 16384-entry bound. `_writeFrame` maps CPU stride-15 lamps to shader stride-16 storage; baked live value updates are paced to 30 Hz while set/cap changes govern chunk-table invalidation independently.

Road geometry avoids the historically unreliable extra vertex attribute/index path with expanded non-indexed triangles and a world-XZ LUT. `WGXRoadLut.table` is device-free: filter usable asphalt samples, collapse stations to lat-0 interpolation, decimate to at most 2000 samples, fill a padded 32×32 grid with 16 nearest candidates/cell, ensure two distinct tangent candidates where possible, and emit magic 12345 plus extent/spacing/header. `_makeRoadLUT` uploads it; the current global LUT overrides authored per-mesh group 2 bindings. Mesh/free paths own and clear the matching LUT buffer/bind group, preventing track switches from retaining destroyed resources.

Chunked upload uses triangle-centroid XZ cells (default 72 m) and AABBs; <2000 triangles use createMesh. Road chunks share one vertex buffer with range-based draws; ordinary chunks share indexed storage. Upload failures release partial GPU storage and attempt synchronous plain meshes while source arrays remain intact. Successful uploads may relinquish caller geometry according to retention flags. Draws frustum/radial/fog-cull cells, optionally bind per-chunk lamp ranges, or merge contiguous ranges with compatible buffers/bind groups. Ranked lamp masks are cached by pass-specific light position/radius generations; road night mask runs deliberately avoid union-merging. Segment append cursors rewind when the last owning chunks array is freed or a relevant set/cap reset occurs.

Shadows use static sun depth (2048 desktop / 1024 lite), desktop car depth 1024 and lamp depth 512, with 1×1 car/lamp placeholders on lite. PCSS blocker output is r32float 512. Shadow model slots are 256-byte aligned, regioned across passes and deduplicated when model floats match. Prior pending shadow encoders submit at the next Begin so shared light-culled instance buffers cannot be overwritten before their earlier draws execute. The final pending shadow encoder precedes the main encoder at frame submit. Car/lamp armed flags are consumed then reset by present; Keep requires a previously rendered map and distinguishes a cadence skip from a stopped pass.

CPU culling uses raw GL-convention view/light projection planes. Uploaded depth matrices are remapped with Z01 to WebGPU z∈[0,1]; depth reconstruction uses invProj·Z01INV, while sky inverse view-projection remains raw. Off-axis camera code derives/remaps projection/view explicitly. Environment captures submit one cube face separately before main begin; after six faces they regenerate mips and replace the placeholder cube. They bind a placeholder while rendering into the real cube to avoid feedback; lite/minimal refuse the probe. Mirror captures have their own encoder, mipped HDR 2D target, independent instance pack/cache and forward-shadow-slot suppression. Mirror HUD tonemapping/grade rides the last present pass when enabled; cockpit mirror glass samples the same target through a separate opaque FX pipeline.

`begin` respects device loss and software readback back-pressure, allocates/maintains targets, writes frame state and starts the lit pass. Ordinary/instanced/chunked draws share pipeline/bind/vertex/index state caches. All three lit CPU rings (draw, stamp, decal) flush before pass end. `present` conditionally resolves MSAA depth, runs SSR → SSAO/contact+blur → volumetric sun/lamp+blur → bloom down/up → composite → FXAA → optional SGSR, then inset and readback copies. Missing/broken post state falls back to a plain tonemap blit. The bloom chain precedes composite additions. Scene alpha is preserved by blended FX because it carries SSR surface metadata.

Growth reallocations are transactional and validation/OOM-scoped when an old set exists; old targets remain usable until a clean candidate is swapped. Shrinks free the larger set first to reduce peak memory. Same-size failures back off exponentially to 30 seconds and stop after eight tries until dimensions change. Render and present dimensions differ when SGSR is ready; a compile failure keeps spatial reconstruction off. WebGPU's optional rg11b10ufloat-renderable feature governs post HDR format; without it scene rgba16float is used. SGSR tries gather then 4-tap in error scopes and publishes only a valid variant.

Instanced batches retain source matrices/colors, camera packs, optional mirror packs and separate shadow packs. Cull caches combine planes/radial parameters and visible-cell keys. updateInstances expands caller stride-16 transforms to stride-20 packed records, optionally updates color, and invalidates cull caches. Free releases main/shadow/mirror buffers plus base geometry. Material arrays similarly have explicit token ownership, generation-controlled asynchronous adoption, supersession cleanup and procedural placeholders until all expected layers fill. PBO/fence-backed Assets readback avoids synchronous pack byte extraction; the optional fallback still uses straight alpha.

## Foreground shaders and diagnostics

Fully read `wgsl-fx.js` provides blob/mark stamp quads (144-byte uniforms), skid triangles (36-byte vertices / 64-byte uniform), glow billboards (36 / 80), textured decals and mirror glass (32 / 224), particles (40 / 144), and driving-line strips (28 / 96). Decals use frame shadow/baked-pool bindings in group 1, premultiplied atlases and a small alpha test. Mirror glass uses the same module's opaque fs_glass with depth writes. Particle smoke is lit/fogged while sparks use additive premultiplied output; RGB-only writes retain scene metadata. Driving-line colors depend on player speed versus authored target speed, support an alternate palette and corner-only fade, and draw world-distance chevrons.

Debug labels wrap GPU create methods and encoder passes once, preserve existing labels, auto-number missing descriptor labels, and push/pop pass debug groups. These are diagnostic wrappers, not validation itself. `createCommandEncoder()` with no descriptor does not receive a generated encoder label because the wrapper forwards undefined; pass descriptors still receive labels.

Boot self-test checks compilation information for four core modules, forces base/MSAA lit pipeline construction, then renders and reads a white HDR source through the actual blit. It races an 8-second timer plus elapsed synchronous-work check; failure precedes canvas claim where possible. An additional desktop native swapchain check is best-effort with a 4-second bound; lite/soft paths skip it. Runtime uncaptured errors are counted, prefix-logged and escalate only after a run spanning three frames; two quiet frames reset flood state. JS begin/present throws accumulate three strikes; successful submits clear them. Desktop runtime output probing reads all rows/RGB of a 4×4 half-float patch; three dark results can escalate, but capture/lite/software paths suppress that probe.

Loss recovery preserves the WebGPU pick while climbing full→lite→minimal; at the end it arms a per-tab GLX skip and reloads only after storage readback confirms persistence. Hidden/background-return losses reload without rung degradation; visible crashes also latch off expensive environment/per-chunk opt-ins. Five clean presented sessions can heal a persisted rung. A submit counts for healing; this is not proof of a visible compositor frame.

Software present copies final rgba8 into one in-flight staging buffer, waits/maps, strips row padding and forces opaque ImageData onto the visible canvas, rejecting dim results. Generations and resize epochs prevent stale reads from satisfying freshness checks; a 20-second hold bounds frame submission while readback waits. capturePixels permits one request, lazily requests COPY_SRC reconfiguration at the next begin, maps after submit, and swizzles BGRA when necessary. These paths are observability mechanisms and carry software-specific cost/ordering constraints, not real-GPU performance evidence.

## LSP evidence and consumer boundaries

Read `.claude/skills/code-nav/SKILL.md` before navigation; used attached apex-lsp tools. All nine module outlines were requested with all:true and limit 200, and returned without pagination. WGX outline exposes 5 outer exports / 77 internal entries; it does **not** enumerate the large returned backend instance or nested factory internals. WGXChunked/Shadow/Post outlines show only init: full reads establish their returned private APIs. Shader outlines establish names, byte-size exports and registry composition only, not WGSL correctness.

| Query | Evidence |
| --- | --- |
| definition/references `WGX.create` | Definition :342, export :6076, guard and awaited call in gfx.js:301/:303; 4 rows / 2 files. |
| references `WGXChunked.init`, `WGXShadow.init`, `WGXPost.init` | Each 3 rows / 2 files: own factory/export and sole WGX initialization. |
| references `WGXDebugLabels.install` | 4 rows / 2 files: own definition/export and guarded WGX installation. |
| references `WGSLChunks` | 17 rows / 3 files: chunks definition/export, wgx.js and wgx-shadow.js; tool reports duplicate lexical/window declarations. |
| references `WGSLFx`, `WGSLPost` | Only 2 lexical rows each. Direct window registration positions returned no resolvable references. These are not proof of no consumers: wgx.js captures window.WGSLFx/Post; wgsl-fx itself reads window.WGSLChunks.FRAME_U. |
| references `WGXRoadLut.table` | Checker could not see alias member. Position query for _roadLutTable returned definition/export only; full source at wgx.js:313 proves destructured consumer and :6080 audit alias. |
| symbols `updateInstances`, then position refs wgx.js:5199 | Three backend implementations found; WGX position query returns definition and instance export :5990 only. Dynamic facade consumer coverage is not proved. |
| references `GLX.begin/updateInstances/envFaceBegin/mirrorBegin/castShadowInstanced` | Rejected: the eager facade's checker type exposes none of those members. This is an explicit navigation limitation, not absence from the runtime surface. |
| hover/references `G.gfx` | types/game-ctx.d.ts:674 declares readonly gfx: GfxBackend or null; hover displays Opaque or null. Text-match facade references: 242 / 21 files, led by car-draw 111, shared shadow-pass 47, mirror-pass 20, debris-world 10 and garage prebuild 8. |

Thus Gfx is the direct factory consumer; the stable renderer facade and GameCtx.gfx connect instance operations to car drawing, shared shadow/mirror orchestration, debris, garage, atmosphere, UI and agent capture. LSP's textual facade/alias limitations prevent claiming a fully semantic call graph or complete dead-code proof. No named-symbol lookup here used grep as a substitute for LSP.

## Evidence-backed comment issues

These are source-documentation findings only; no comment was changed and no runtime behavior was inferred from a stale comment alone.

| Location | Comment issue | Executable evidence / correction direction |
| --- | --- | --- |
| wgx.js:14–16 | Says WGX loads long after glx.js's script tag. | gfx.js header and manifest show all three implementations deferred, eager stable GLX facade. Reference that facade rather than an implementation script tag. |
| wgx.js:155 | BLIT_BYTES annotation says 48. | It reads shader BLIT_UNIFORM_BYTES; LSP outline locates exported value 96 at wgsl-chunks.js:2611; mirror writer uses 24 floats. Correct annotation to 96. |
| wgx.js:476 onward, device-loss prose | Says loss clears opt-in and reloads stable WebGL2. | _wgxEscalate preserves preference, persists rung, eventually arms gfxClaimFail per-tab skip (:651–689). Later comments describe the actual ladder. |
| wgx.js:1326–1329 and :3436 onward | Claims baked light SBO is static between bakes/zero per-frame upload and applies knob once. | _writeFrame :3451–3498 handles allLightsGen live RGB updates at TL_VALUES_DT=1/30; comments later explicitly say knob is not an upload key and values are copied verbatim. State current generation/pacing split. |
| wgx.js:2763 | _interleave described as pos3/nrm3/col3 stride 36. | VERTEX_STRIDE=28 and quantized writes inside that function. |
| wgx.js:2887 onward | _attrOrZero cost prose uses old 36-byte VBO ratio (~44%). | Packed VBO is 28 bytes, so 16-byte attributes are ~57% of packed VBO bytes. Historical measured MB should remain dated rather than extrapolated. |
| wgx.js:2972 onward and :3764 onward | Says road pieces bind authored coordinates and dashes need interpolated storage. | _bindLitVerts always selects current global world LUT when present and explicitly ignores authored. Explain storage as fallback/ownership, not active normal-road path. |
| wgx.js:3165 | Claims Z01·(P·V) differs from (Z01·P)·V under shear. | Matrix multiplication is associative; adjacent implementation may differ numerically or rely on explicit view, but the stated algebra is false. Preserve the numerical/context reason without the inequality. |
| wgx.js:3764 | Vertex slot 0 still described as stride 36. | Layout at :203–210 is stride 28. |
| wgx.js:3807 onward | Diagnoses doubleSided as allowing underside/skirts to z-fight the top. | Same surfaceId===16 branch sets dbl=true. Explain actual choice/reason without implying that diagnosed state was disabled. |
| wgx.js:3851 onward; :4840 onward | Orphan explanatory blocks remain after extracted chunk/shadow code. | Chunked merge state lives in wgx-chunked.js; shadow implementation in wgx-shadow.js. Move/cross-link comments to the owner. |
| wgx.js:5362 onward | Driving-line description advertises opts.str. | drawDrivingLine hardcodes emissive 1.6; source comment explains no producer sends strength. Remove nonexistent option. |
| wgx.js:5982–5989 | Calls updateInstances unimplemented and DebrisWorld per-body fallback current. | Actual function :5199 expands stride-16 transforms and invalidates caches, and is exported :5990. This paragraph directly contradicts the implementation and earlier functional comment. |
| wgx.js:6061 onward | lastFailure called only way to distinguish stored pick from running backend. | Returned backendState, backend string, ctxLost, and bound-state events/storage already expose live state. Narrow historical claim. |
| wgsl-fx.js:125 | SKID color offset documented 24. | Packed pos3 (12) + UV2 (8) means offset 20; pipeline at wgx.js:1563 uses offset 20, and stride is 36. |
| wgx-shadow.js:194 onward | Opening says one encoder for all shadow passes. | _shadowEncoderBegin submits prior pending encoder at every next Begin; ensuing explanation correctly documents separate submits. Lead with actual ordering. |
| wgx-chunked.js:90 onward | Road piece staging says <=147 KB each. | PIECE4095 × packed stride28 =114660 bytes, about112 KiB; old36-byte layout produced147420 bytes. |

Long measured historical notes were read but not re-measured. References to Dawn/WebKit behavior, driver winding, software hangs and jetsam remain claims documented by the source; this static map does not establish their current universality.

## Verification and continuation

**Pass:** full contiguous source reads of the seven completed files, all module outlines, bounded LSP consumer queries, whole-tree hash inventory. **Skip:** browser/driver/WGSL execution, images, performance, code edits, commit, and full shader bodies in wgsl-chunks.js/wgsl-post.js. Source reading is not boot evidence. Documentation checks are owned by the coordinating parent after the shader continuation adds its findings and read ledger. This lane leaves no source modifications.
