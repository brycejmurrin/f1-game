# Vendor batch 06 — Spector capture machinery

## Coverage and evidence

Fully read `vendor/gpu-capture/spector.bundle.js` bytes **[502048,602048)**, exactly 100,000 bytes, as assigned by group `06` in `vendor-batches.json`. Ten consecutive raw UTF-8 reads, each exactly 10,000 bytes, returned untruncated source. This is source inspection, not AST-only coverage; no library was executed. Coordinates below are half-open original file byte offsets. Minified identifiers are scope-local names, not upstream public API names.

Whole file: 682,744 bytes; SHA-256 `5218807ed79ffa6b7753d8d1325d51baef590b27e0a8edd737c55983826ebf58`.
Assigned part SHA-256: `ab48f61ebfa676bed2bfe271f709ba97a8c1bed175e549af3ef0a713c075ad3d`.

| Read | Byte interval | Bytes | SHA-256 |
|---|---|---:|---|
| 1 | [502048,512048) | 10000 | `ff373821eb68a4216dc0821b8a5893769849d6216724f4998c085cfc37a2f820` |
| 2 | [512048,522048) | 10000 | `56ac5b865418f5c5b0b4f9a40e56b33bdb384b7ba67313a4695a4b38e95f5449` |
| 3 | [522048,532048) | 10000 | `c6e09ee59672c2f50f22cb3bc7952a00c4cc5b5194be08570bf5fa7cd61c3692` |
| 4 | [532048,542048) | 10000 | `5c68e50c5cb9c0018bdf38a3ce2538a188c9896585599cf8776dc3c6f0a53ab1` |
| 5 | [542048,552048) | 10000 | `ce40ed4016479a5fd0394e579abdc0961d554d963ff87f93864bf7f6a4ccd257` |
| 6 | [552048,562048) | 10000 | `eab60dadac940c15cbbae14425885ab56c7d75e6ffaa5d1400851c172fc60f46` |
| 7 | [562048,572048) | 10000 | `3c2591b7e920021a2ebda0324d56b80ea4acd8855c2f27a21b3c4e56ef593667` |
| 8 | [572048,582048) | 10000 | `2aebd3d52843f28a5d602c89db3d357445da61cc9fb29b8edd4e26ada73c9078` |
| 9 | [582048,592048) | 10000 | `df3b7bf438bb4916be06f226912b50bd5a9030d6c8f23cfdd78561aea28a7584` |
| 10 | [592048,602048) | 10000 | `81f1ec068fc10d72d9e5b9ef73a9afce3235dff97d6dabff5f1c42498c9acc63` |

## Semantic fragment map

| Interval | Definitions and responsibility |
|---|---|
| [502048,502846) | Tail of primitive analyser `g`: `appendToPrimitives` dispatches POINTS, LINES, LINE_STRIP, LINE_LOOP, TRIANGLES, TRIANGLE_STRIP and TRIANGLE_FAN and accumulates totals. Beginning is inherited from batch 05. `g.analyserName="Primitives"`. |
| [502846,503183) | `f` analysis coordinator: initializes existing `c`, `h`, `g` analysers and calls `appendAnalysis` for each. Definitions of `c` and `h` lie before this interval. |
| [503183,503830) | `E` object-tag helpers read/attach/stringify `__SPECTOR_Object_TAG`, with display text `typeName - ID: id`; `v` base tagger resolves constructor via `window[typeName]`, uses `instanceof`, allocates incrementing per-tagger IDs and preserves existing tags. |
| [503830,506981) | `_` command-capture base: gathers normalized stack frames; snapshots timings, arguments, result, marker and status; abbreviates arrays longer than 50 entries; JSON clones values; formats uniforms, tagged objects, GL enums, image sources and buffer lengths. `C` formats `bufferSubData` numeric arguments as integers. |
| [506981,509478) | `A` origin-function preservation/dispatch: instance and prototype storage/reset under `__SPECTOR_Origin_`; explicit argument-count calls from zero through twenty, then `apply`. |
| [509478,518830) | Command-specific subclasses of `_`: `R` bindAttribLocation, `S` blitFrameBuffer, `T` clear, `x` disableVertexAttribArray, `y` drawArrays, `L` drawArraysInstanced, `I` drawArraysInstancedANGLE, `F` drawElements, `N` drawElementsInstancedANGLE, `M` drawElementsInstanced, `O` drawRangeElements; `B/$` getActiveAttrib/getActiveUniform; `P` getAttribLocation; `k` getExtension; `D` getParameter; `U` getShaderPrecisionFormat; `G` getTransformFeedbackVarying. `W/V/H` format three multiDrawArrays variants; `X/z/K` three multiDrawElements variants; `j/Y` base-instance/base-vertex instanced draws. `q` scissor; `Q/J/ee/te` stencilMask/stencilMaskSeparate/stencilFunc/stencilFuncSeparate; `ne` vertexAttribPointer; `ie` viewport; `re` enableVertexAttribArray. `Z` emits integer plus unsigned binary mask. `b=["lineWidth"]`; generic `w` marks these deprecated captures status 50. |
| [518830,521101) | `se` command spy creates the custom-command constructor registry, substitutes wrappers, restores original commands, times origin calls, and passes raw call records to its callback. Unknown commands use `w`. |
| [521101,525166) | `oe` state tracker base: registers change and consume callbacks, records changed commands by state, compares current/previous state, associates consume command IDs, and classifies unused 10, disabled 20, redundant 30, valid 40. Stores lists of classified IDs. Context reads and enable checks temporarily disable capture to avoid recursion. |
| [525166,526696) | `ae` parameter-state base builds version-aware parameter tables and command-to-state links; reads `getParameter`; reports missing extensions; converts GL enums, masks and array values. |
| [526696,537100) | Parameter trackers `le` AlignmentState, `ce` BlendState, `ue` ClearState, `he` ColorState, `de` CoverageState, `me` CullState, `pe` DepthState, `ge` DrawState, `fe` MipmapHintState, `Ee` PolygonOffsetState, `ve` ScissorState and `_e` StencilState. Each provides GL constants, modifying commands and consume rules. Clear checks the clear mask; scissor also consumes clear; stencil additionally queries attachment stencil bits and holds front/back operation/function/mask constant lists. `ge` visibly spells the viewport change command `viewPort`; this map records source, without asserting runtime correctness. |
| [537100,538339) | `Ce` supported pixel combinations/component-type gate and `readPixels`: reads RGBA unsigned byte or float pixels, checks GL errors, clamps float channels into bytes. Supports selected RGB/RGBA internal formats and common packed/half/float component types. |
| [538339,545014) | `Ae` VisualState: private framebuffer and working/output 2D canvases; reads default framebuffer or color attachments, resolves multisample renderbuffers through blit, handles texture layer/cubemap attachments, makes flipped data-URL thumbnails. Quick capture omits pixel reads; full capture preserves dimensions; default base size is 256. |
| [545014,548877) | `Re` texture-input visual capture: copies custom texture metadata, captures 2D/cube/3D/array textures through a private framebuffer; for deep textures samples first and last three layers. Preserves prior framebuffer, controls smoothing from nearest-filter settings, emits data URLs. Declares base size 64, although resizing code references `Ae.captureBaseSize`. |
| [548877,551331) | `Se` UBO readback helper: resolves indexed buffer/binding start, reads with `getBufferSubData`, returns normal arrays. `uboTypes` maps bool/int/uint/float vectors, matrices and samplers to typed-array constructors and component multipliers. |
| [551331,552354) | `v` subclasses `Te/be/we/xe/ye/Le/Ie/Fe/Ne/Me/Oe/Be` tag Buffer, Framebuffer, Program, Query, Renderbuffer, Sampler, Shader, Sync, Texture, TransformFeedback, UniformLocation and VertexArrayObject. `we.store` retains programs by tag ID and transfers tags on replacement. |
| [552354,553642) | `$e` program/shader introspection: link/validate/compile status, attached shaders, translated source through WEBGL_debug_shaders, length accounting; names from metadata, SHADER_NAME or base64 SHADER_NAME_B64 defines, with Vertex/Fragment defaults. |
| [553642,567719) | `Pe` DrawCall tracker: captures current program/shaders/recompilability, framebuffer attachment metadata, indexed element buffer, active attributes, uniforms and array values, texture-unit/sampler settings and visuals, uniform blocks/readback, transform-feedback buffers and buffer custom data. `samplerTypes` maps float/int/uint/shadow sampler constants to 2D/cube/3D/array targets. No initial/final state required. |
| [567719,568800) | `ke` state-spy coordinator instantiates the fourteen trackers, registers callbacks, fills initial/final states and dispatches captured commands. |
| [568800,572278) | `De` resource recorder base: create/update/delete callback registration, capture-recursion suppression, frame/total memory deltas and per-second history. Static internal-format byte-size table includes uncompressed/depth/compressed formats; missing entries default to four bytes. These are estimates from this code, not measured GPU allocations. |
| [572278,579973) | Resource recorders `Ue` Buffer (bufferData and binding-target metadata); `Ge` Renderbuffer (storage/multisample dimensions and estimated bytes); `We` Texture2d (texImage2D/compressedTexImage2D/texStorage2D, cube multiplier and level-zero metadata); `Ve` Texture3d (3D/array depth and corresponding upload/storage paths); `He` Program (link introspection via `$e`, source length). They save `__SPECTOR_Object_CustomData` and subtract prior sizes. |
| [579973,581156) | `Xe` coordinates recorders and appends frameMemory/memory; `ze` coordinates object taggers over command arguments/results and exposes single-object tagging. |
| [581156,586376) | `Ke` Extensions tracks version-specific extension availability and actual extension objects, including instancing, compression and multi-draw; `je` CompressedTextures formats supported compression enums; `Ye` Capabilities reads versioned limits, framebuffer/channel sizes, renderer/vendor/version, anisotropy and draw-buffer limits. |
| [586376,590784) | `qe` context spy orchestrates command spies, state/recorder/tagger/analysis systems. Builds capture object with commands, initial/final state, times, analyses and memory; supports max commands, markers and LOG records; spies context and extension methods. Suppresses recursive capture via global flag and excludes canvas/drawing-buffer/color-space/glp members. Static snapshot includes context attributes, capabilities, extensions, compressed formats and navigator user agent. |
| [590784,593203) | `Ze` frame/timer spy preserves requestAnimationFrame variants plus setTimeout/setInterval, wraps common timer delays [0,15,16,33,32,40], speed ratio/single stepping, frame start/end/error events, 60-frame FPS history and VR display frame scheduling. |
| [593203,594392) | `Qe` canvas getContext spy handles one canvas or HTMLCanvasElement/OffscreenCanvas prototypes, passes 2D through, and emits requested WebGL context/version. Then webpack-style imports 379/795/569/565/216/589/866 initialize style injection into html. |
| [594392,600081) | UI infrastructure: `mt` compositor traverses pending component changes and children; `pt` hierarchical state store allocates IDs and handles add/update/remove/pending operations (20/40/50); `gt` component/DOM adapter renders, replaces/removes nodes and preserves child containers; `ft` public state-tree renderer schedules composition at 100 ms. |
| [600081,602048) | Anonymous HTML-template base escapes substitutions with a dummy div unless raw interpolation is marked; `Et` adds command-name DOM event wiring, capture/stop-propagation flags and event objects. `vt` capture-menu component begins rendering active menu/log containers; its template continues in batch 07. |

## Bundle and local consumer context

This interval is predominantly contiguous internal capture implementation, followed by style-loader setup and internal UI infrastructure. It does not include the outer UMD export or public `Spector` class. References `a` (clock), `o` (event), `s` (logger), `d/m/p` (GL constant registries), `u` (draw-command list), and `i.isBuildableProgram` are dependencies defined outside this assigned interval; their complete contracts are not inferred here.

Read local consumer `js/agent/apex-gpu-capture.js` through its enable/summary/capture entry. It lazy-loads this exact same-origin vendor path only on explicit query/storage/API enablement, resolves `window["SPECTOR"].Spector`, constructs it and calls optional `spyCanvases`. Its summary projects command names/count and canvas dimensions instead of thumbnails. `js/agent/apex.js:1490` exposes the adapter as `__apex.gpuCapture`; `tools/manifest.cjs` lists the adapter and its ordering ahead of apex.js. These consumers address public Spector APIs, not these minified class names.

## Limits

Coverage is exactly the assigned byte interval, including both partial boundary definitions. Neighboring portions, outer exports and injected CSS module bodies are not claimed read by this report. No execution, network access, browser, tests, runtime correctness claim or commit was performed. Static names/byte anchors were additionally enumerated from source text to support the map; this does not replace the ten complete raw reads.
