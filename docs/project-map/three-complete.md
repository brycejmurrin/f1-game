# Three renderer source map

Source inspection: 2026-10-27, checkout HEAD `64809115e276d7a2b03ccf5678773a001e817db3`. This report records source reading, not a runtime or visual verification. No source edits or browser runs were made.

## Exact reading ledger

Eight files, **11,310 lines**, were read end to end in bounded, untruncated outputs. The two shader files at the bottom remain assigned to a fresh reader; the directory is **not yet completely read** by this report alone. Header samples in `render.md` are superseded only for the eight completed rows.

| File | Lines | Exact inclusive reads |
| --- | ---: | --- |
| `js/render/three/tlx-chunked.js` | 772 | 1–240, 241–520, 521–772 |
| `js/render/three/tlx-post.js` | 1312 | 1–350, 351–700, 701–1040, 1041–1312 |
| `js/render/three/tlx-shadow.js` | 970 | 1–230, 231–500, 501–750, 751–970 |
| `js/render/three/tlx.js` | 6854 | 1–360, 361–720, 721–1100, 1101–1470, 1471–1840, 1841–2220, 2221–2600, 2601–2980, 2981–3400, 3401–3820, 3821–4240, 4241–4660, 4661–5080, 5081–5500, 5501–5920, 5921–6340, 6341–6720, 6721–6854 |
| `js/render/three/tsl-chunks.js` | 61 | 1–61 |
| `js/render/three/tsl-fx.js` | 417 | 1–250, 251–417 |
| `js/render/three/tsl-sky.js` | 800 | 1–220, 221–510, 511–800 |
| `js/render/three/tsl-viewport.js` | 124 | 1–124 |
| `js/render/three/tsl-lit.js` | 2957 | Pending separate complete reader; factory calls/contracts inspected in `tlx.js` only |
| `js/render/three/tsl-post.js` | 1268 | Pending separate complete reader; factory calls/pass contracts inspected in `tlx-post.js` only |

Additional bounded contract evidence: `AGENTS.md`, `.agents/skills/code-nav/SKILL.md`, `js/render/gfx.js:1–120,245–310`, `tools/manifest.cjs:960–1005`; LSP definition of `G.gfx` and `GfxBackend`, references of `G.gfx`, `TLX.create`, `TLXShaders.postChain`, `.shadowSys`, `.chunked`, `.sky`, `.fx`, `.viewport`, and `.prepareChunksSteps`. This is not a claim to have read the external consumer files completely.

## Load, selection and contract

`tools/manifest.cjs:979` defers the directory as the `three` group, ordered chunks → viewport → lit → sky → FX → post shader → shadow → chunking → post orchestration → backend. Every helper contributes factories to `window.TLXShaders` with `Object.assign`; none requires THREE/TSL at script evaluation. `TLX.create` imports `three/webgpu` and `three/tsl` dynamically and returns an initialized opaque backend or null.

LSP resolves `TLX.create` to `tlx.js:174` with the only external use at `Gfx.create` (`gfx.js:280,284`). `Gfx.create` defaults an omitted preference to `three`, waits for the factory, and returns null for its caller's GLX fallback. Selection earlier in the UI boot is outside this report. The backend object is descriptor-copied onto the stable GLX façade, which makes explicit unsupported members load-bearing: TLX supplies unsupported occlusion/multi-draw results and `undefined` output-target/texture-census members rather than accidentally inheriting closures over an uninitialized GLX context.

The declaration contract is intentionally weak: LSP resolves `G.gfx` to `readonly gfx: GfxBackend | null` (`types/game-ctx.d.ts:674`), and `GfxBackend` to `Opaque` (:150), not a machine-checked renderer interface. LSP's `G.gfx` file census reports 242 references in 21 files: largest consumers are car drawing (111), shared shadow pass (47), shared mirror pass (20), debris world (10), garage prebuild (8), atmosphere/experience/scale (6 each). These are text matches of the façade, as the tool explicitly reports. It cannot prove method parity from that opaque type.

The helper reference results identify their owning factories in `tlx.js` and `tlx-post.js`. LSP explicitly labels `window.TLXShaders` untyped, with multiple member contributions and dynamic overwrite-order uncertainty; these results corroborate source calls, not a precise static namespace type. `prepareChunksSteps` returned its export only; this does not prove that dynamic worker/property consumers are absent.

## Backend ownership and frame flow

`tlx.js` owns the renderer, manually maintained scene/camera, all helper instances, resource handles, drawing records, wrapper pools, warm jobs, failure ladder, capture and diagnostics. It pumps three's internal animation tick from `begin()` so the game remains the frame-loop owner. Automatic API choice probes adapter and a throwaway WebGPU canvas before claiming the live canvas. Explicit pins override automatic WebKit/tab fallback latches. On the WebGL2 route it supplies its own opaque context because three's backend otherwise requests alpha. WebGPU uses opaque output, lite phone/WebKit settings, and error/shader hooks. Device loss spends a shared reload budget; background/return losses have separate uncounted handling. Early repeated GPU errors can steer automatic boots to three's WebGL2 API.

Frame recording is deferred: draw calls copy nonidentity model matrices into reusable arrays, memoize material keys by options identity and values, and push fixed-shape records into a high-water list whose live bound is `.n`. `present()` culls chunked meshes, resolves split-road ranges, exposes instanced records, acquires wrappers keyed by geometry/material/occurrence, and draws the scene followed by post. Manual matrixWorld assignment is essential because world updates are disabled. A pass-specific pool root exposes only acquired wrappers to three. Separate desktop mirror instance streams avoid invalidating main-view cull packs.

Material eviction is deferred until after painting and avoids materials used this frame. Opaque coalescing combines compatible repeated car parts by geometry and determinant sign using named instance attributes; negative transforms retain the correct winding. Blob and decal contiguous runs use separate instanced paths. Stream uploads carry explicit dirty ranges; true InstancedMeshes retain Dynamic usage because three relays their matrices once per frame, whereas named attribute streams can use Stream usage per render.

The normal race path renders shadows before `begin`, optionally records mirror/probe passes, then records world/car/sky/FX and presents. `begin()` latches frame lighting, camera and post matrices; `present()` clears shadow armed flags only after their consumers finish. Keep methods distinguish a cadence skip from an actual stop.

## Geometry, chunking and lifecycle

`tlx-chunked.js` implements synchronous and cooperative generator preparation with serializable CPU-only prepared attributes. Preparation config version/backend/fmt24/packing/padding/merge must match before consuming `_tlxPrepared`. It converts positions before binning, packs normal/color/material channels according to range and API vertex-format rules, and shares static absent-source zero views. Packed IDs use half floats instead of integer attributes to match float shader inputs. WebGL2 packing can pad strides to four bytes; WebGPU leaves unsupported scalar/three-wide small formats wide, except padded normals.

Below 2000 triangles preparation returns one geometry. Larger meshes share one attribute set across per-chunk index buffers. Draw merging defaults to 3×3 original cells, retains original lamp cells, then merges small dust and wide orphan draws under documented caps. Culling combines frustum, radial distance and fog; callers must honor returned count because the reusable visibility list keeps stale tail entries. `free` clears that scratch and releases pooled ownership before disposing geometries. Split-road helpers compute contiguous-index AABBs and merge visible spans into at most four draw ranges, filling only real intervening road triangles.

`tlx.js` retains weak geometry registries for diagnostics, retires wrappers immediately or one scene-render later to preserve pipeline sharing, and queues object disposal while compilation holds references. It pins up to 512 render pipelines through three internals to prevent menu-warmed pipelines vanishing before race entry. Texture sources can be replaced by a stand-in after upload; owned source cleanup remains explicit. A four-entry, ten-second same-size/source-kind texture pool permits garage refill without new GPU texture identities. Material arrays use asynchronous raw-byte readback where available, generation-controlled adoption, placeholder textures and post-upload CPU data release.

CPU geometry release is particularly constrained. Both release implementations actually assign attribute arrays **null** and keep index arrays. General static sweeping is default off, additionally refused on mobile, and suppressed after mirror use. Chunk release is normally held until an opt-in or successful/abandoned env probe and is suppressed after mirror use; env probing itself defaults off. Car-shadow mirror release is a separate two-second sweep allowed on phones, limited to explicitly tagged caster geometries with upload checks and cached bounds. These gates must not be conflated with production-wide memory savings.

## Shadows, sky, FX and post

`tlx-shadow.js` owns sun, desktop car and desktop lamp compare-depth targets, optional desktop PCSS blocker target, per-target caster slot pools, keyed instance casters, and the lamp-static depth-copy cache. Mobile sun is 1024², desktop hardware sun 2048², software sun 512²; software car/lamp targets are 256². Mobile car/lamp targets are absent. Begin/end scopes maintain target identity, cull VP and pass-open flags; a pass failure disables its own subsystem. WebGPU cameras remap GL clip depth to [0,1]. Lamp static caching copies only when the previous static VP matches and a valid lamp render exists; copy failure reverts to full lamp passes. Compile warm uses layout/winding probes plus each target configuration; draw warm uses scratch targets rather than modifying snap-cached maps.

`tsl-chunks.js` provides surface hash/noise/analytic-gradient/IGN leaves with explicit TSL layouts to prevent repeated inline function expansion and oversized WebKit private storage. `tsl-sky.js` has a distinct sky-noise family, frame-derived uniforms and ray reconstruction from the supplied inverse VP. It covers day/twilight/night gradients, clouds, celestial discs, stars, city glow, lightning and dither. Its optional two-target half-float cloud cache bakes sixteen bands, compensates drift per channel, falls back below its elevation/window bounds, and defers disposal through an in-flight warm. TLX integrates its returned node as a **late far-plane triangle**, not the background slot. Software content uses the simpler gradient fallback.

`tsl-fx.js` owns fixed blob/mark/skid/driving-line/glow/particle materials, cached premultiplied decals and live mirror-glass material. Transparent FX preserve destination alpha/tag, do not write depth, and force one pass when double-sided. Frame uniform blocks can share renderGroup; material-specific glow uses materialReference. A memoized MRT tag node prevents per-frame graph identities. Decal retirement is deferred past painting; texture retirement removes associated cache entries.

`tlx-post.js` owns all targets/materials/textures and unwinds partial construction. Scene output is HDR when renderable; eligible phone WebGPU uses packed R11G11B10 color, while the SSR tag remains a separate attachment. Desktop WebGL2 scene MSAA follows format-supported preset caps; WebGPU scene stays single sample. Phone post working size is currently **1× scene size**. AO, shafts and bloom allocate lazily and shed after eight closed presents. The pass sequence is AO+blur or folded AO in godray alpha, godray+blur, bright/down/up bloom, composite, FXAA, optional spatial upscale and mirror composition. Godray lamps are limited to **six** nearest entries. Fixed-target logical viewports and WebGL-only phone orientation cover use `tsl-viewport` mapping; each post chain owns a disposable wrapper scope. Attachment-discard decisions mirror actual depth/tag readers and use WebGL invalidation or vendored WebGPU hints. Post warm compiles stable live quad/target pairs with a three-second local deadline; draw warm uses target scissors.

Warm jobs own render target/MRT state across awaits. Main warm includes scene, late FX/material variants, optional post, caster/sky-cache, mirror and draw stages. Captured cockpit/telemetry draws can queue behind the main warm; mirror work can be deferred by an opt-in. Presentation pauses while compilation is pending. Post-only failure disposes the chain and retries after a delay, up to three automatic reconstruction strikes; deeper failures move through TSL unlit/classic fallback and eventual bounded reload. Recovery construction is synchronous, with the source explicitly recording exclusive warmed recovery as an unresolved design gap.

## Verified stale or misleading comments

These are comment/code discrepancies verified in the completed source, not inferred visual defects:

- `tsl-sky.js:19` describes backgroundNode delivery; `tlx.js:1783–1829,5921–5932` installs and arms a late depth-tested far-plane triangle instead.
- `tlx-chunked.js:620–650` and `tlx.js:4109` describe zero-length views; implementations at chunk release and `releaseGeoMirrors` assign null. Later local comments acknowledge the reversal. The bounds/upload/gating restrictions remain significant.
- `tlx-post.js:7,767` says nearest twelve godray lamps; selection at :791 uses six, matching its immediately following explanation.
- `tlx.js:217` says the vendor carries two patches; its own later paths require patches 17/18 and the current vendor patch document enumerates many more. The nearby r185 data-engine label is historical and is not the installed vendor version.
- `tlx.js:858–879` says WebKit automatic selection is WebGL2 by construction, while `forceWebGL` at :431–433 allows automatic WebGPU and :420 onward explicitly documents that policy change.
- The narrative before `softContent` says the software verdict should avoid carrying an unused WebGPU adapter into WebGL2 classification; actual `softwareGL` at :988 is `_softAdapter || (live WebGL backend && detectSoftwareGL())`. The prose no longer states the expression that executes; this inspection does not establish which affected hardware exists.
- `tlx.js:1346,6306` says post reconstruction waits for target reallocation; `begin()` at :5822 and `_postRetryAt` at :6314 also permit a two-second delayed reconstruction without resize.
- `tlx.js:6378` describes three static-sweep gates including the env gate; the executed call at :6408 deliberately lets the opt-in bypass that gate. Mobile and mirror-use restrictions remain separate.

## Evidence limits and next read

No rendered output, GPU execution, frame-time, memory slope, recovery success, shader equivalence or current handset behavior was measured. Historical measurements in comments are architectural rationale, not repeated evidence. Backend namespace typing and façade opacity limit static caller certainty. Full `tsl-lit.js` and `tsl-post.js` reads remain necessary to complete all **15,535** directory lines and independently verify shading, material-ID branches, lamp grids, SSR, AO, grading, mirror sampling and upscale shader internals; their orchestration contracts above do not substitute for that read.
