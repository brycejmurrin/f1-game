# WebGL lint: complete readable-source continuation

Snapshot: 2026-10-27. Supplements [vendor-readable-tail.md](vendor-readable-tail.md) and [vendor-map.md](vendor-map.md), superseding their partial lint coverage and the unreferenced-helper inference below. This lane read AGENTS.md and the previous handoff, then received every source byte directly. It did not execute the library, use network/browser tools, install dependencies, run tests or commit. Vendor source is unchanged.

## Exact reading and identity ledger

`vendor/gpu-capture/webgl-lint.js`: 150,774 bytes, SHA-256 `17b14abb3ccd4aa57f379c374dc0bb395b31c7ecdb99adb7d6fa5581ddd3572d`. The assigned remaining interval `[12000,150774)` is fully read (138,774 bytes). The prefix `[0,12000)` was also reread here, so this lane directly read the complete `[0,150774)` file. Each source call returned one <=12,000-byte UTF-8 slice with a 7,500-token budget and no truncation; every boundary decoded successfully. The prefix call additionally printed the mechanical hash ledger after its source. Offsets below are zero-based, end-exclusive; hashes identify bytes, not upstream authenticity or correctness.

| Byte interval | SHA-256 |
| --- | --- |
| `[0,12000)` | `a3d896e12f173c3503c2c511b6a8ffd7914d78ef3cfe40829fd42c71016dc0db` |
| `[12000,24000)` | `725719dc1eae87ba03b1c9589b763b8c7cf798daa793c40daf5df7686038fcf6` |
| `[24000,36000)` | `59aca437b2ef112ec9b45fcda84c0347d3df00ec02de79c008a0120d12e224a4` |
| `[36000,48000)` | `26f92e353376b4f3f9d0b3b0ad8dbb33808d9b55040460a0d01a0e9109c6dd45` |
| `[48000,60000)` | `773b53b8d04786bc166842b5abfd224324d843f22fd170153767dbf847abfb51` |
| `[60000,72000)` | `c09a0a67fcb939fe693c7dbcabaa1fc484f4b1689151d3b39e5c2bbfacb978d3` |
| `[72000,84000)` | `effab409793e8a4f39b2215d30dce7b5f1986051f97396a167a00700a628cd1e` |
| `[84000,96000)` | `2a01a9073958188277d16c6321ce50dd16b9e144028b9d48793281794694b263` |
| `[96000,108000)` | `fc8732589b11277c63bb477f73f04277b7ee08a968c1563cb695fc0e6067833b` |
| `[108000,120000)` | `80e5572e130a02ce7f1b16cbe293286750d8584384096aa9b902792f2e4185cc` |
| `[120000,132000)` | `808bd31635dc8098d399962011a1aeaae70d7a7e1af63ca1a529060ab7a71f08` |
| `[132000,144000)` | `f0caa30b53ecf934793b39da8e849f9e0d49ca639711b7428fd2bae2eef8483a` |
| `[144000,150774)` | `ae9797b291d29023da3eb3b0a69f363a92139d0f46b9b4c349c94789e60f4363` |

The local `vendor/gpu-capture/MANIFEST.json` is 709 bytes, SHA-256 `99e0f178845e50bf80de00c3f998126ea21abdb440d4cbfe23f8d59cd5109eae`; its webglLint version 1.11.4 and webgl-lint.js bytes/hash match this snapshot. It dates capture 2026-10-19 and names “hunter #2964” as generatedBy. The source header also says 1.11.4 / MIT, with embedded Gregg Tavares and Khronos notices. This manifest contains no upstream URL or tarball hash; no upstream comparison was made.

## Installation, hooks and lifecycle

The AMD-or-immediate-factory wrapper exports no ordinary library namespace. At evaluation it logs `webgl-lint running` and replaces `HTMLCanvasElement.prototype.getContext` and, when present, `OffscreenCanvas.prototype.getContext`. A returned context with `bindTexture` is treated as WebGL; `texImage3D` determines WebGL2 internally. Consequently injection does not immediately discover or wrap every already-existing context: wrapping happens on a subsequent getContext call. The offscreen branch still queries global document for configuration, so constructor detection alone does not establish worker support.

`augmentAPI` skips already-augmented objects via a global Set, enumerates context functions, saves originals and replaces them. Wrapper order is prechecks, argument validation, draw attribute bounds, original API call, original getError, then successful-call postchecks. An error is shadowed and reported; draw GL errors additionally trigger framebuffer feedback diagnosis. The replacement getError returns shadowed keys (strings from Object.keys) then NO_ERROR; it does not preserve repeated occurrences or exact native ordering. With throwOnError false, reporting logs and generally continues, so validation is diagnostic rather than a universal call blocker.

getExtension lowercases names, returns cached synthetic/real extension contexts, and wraps newly requested extensions with shared state. getSupportedExtensions appends `GMAN_debug_helper`. `GMAN_debug_helper` exposes tagObject, untagObject, getTagForObject, disable, setConfiguration and getAndResetRedundantCallInfo. Object-tag validation is intentionally shallow (arrays, typed arrays and nonobjects rejected, no authentic WebGL-object check). setConfiguration rejects unknown option names, otherwise does not validate value types; ignoreUniforms entries accumulate in a Set.

Defaults: maxDrawCalls 1000; throwOnError, failBadShadersAndPrograms, failUnsetUniforms, failZeroMatrixUniforms, failUnrenderableTextures, warnUndefinedUniforms and makeDefaultTags true; failUnsetSamplerUniforms and failUndefinedUniforms false; ignoreUniforms empty. Every `[data-gman-debug-helper]` element's JSON is applied on getContext; malformed JSON throws with element context. Successful draw postchecks warn about zero vertex/instance counts and decrement maxDrawCalls; exactly zero removes checks. Zero/negative initial budgets do not mean immediate removal.

Helper disable / draw-budget removal restores saved methods on tracked contexts and extensions, removes those contexts from the augmentation Set, marks the helper record and deletes sharedState properties. It does not restore canvas prototype getContext wrappers, remove injected scripts, or prevent later getContext from augmenting the context again. Restored extension originals are maintained per API. Redundancy results after removal have an intended invalid-marker path, but it reads `this._checksRemoved` on helper ctx while removal sets the enclosing API record's flag; that intent is not established as working.

## Validation and state/resource contracts

Function metadata covers WebGL1/2 and selected extensions by argument count: enum formatting, required numeric arguments, optional object-or-number arguments, allowed undefined positions and array validators. Numeric checks allow booleans/boxed Number and reject NaN, without generally enforcing finiteness/ranges; native GL retains its own checks. Uniform validators understand scalar/vector/matrix element width, flat arrays, offsets/lengths and uniform array bounds. Built-in gl_/webgl_ uniforms/attributes are skipped. All-zero matrices can be rejected after a successful GL setter. Shader compile/link failures include logs and numbered shader source, using browser-dependent stack/log parsers.

Successful program linking rebuilds active-uniform metadata, array aliases, unset-element Sets and sampler values (initial unit zero); uniform-block entries without ordinary locations are skipped. Locations obtained by the caller map back to names and per-program Sets. Uniform setters mark elements set; selected integer setters also record sampler units. Draw prechecks require a current program and optionally all tracked uniforms set, renderable sampler textures, and matching sampler types per unit (the different-type check looks only at values[0] of each sampler record). Ignored uniforms affect unset and zero-matrix checks; configuring ignores after link does not rebuild existing unset maps.

Element buffer data/subdata is mirrored in CPU ArrayBuffers to obtain the highest referenced draw index. Draw checks compare index byte range and enabled active-attribute offset/stride/component sizes against actual buffer sizes, including divisor-derived instance usage and matrix columns, restoring ARRAY_BUFFER afterward. The bookkeeping does not represent all ways native GPU buffers can change (for example copyBufferSubData has metadata but no mirror update). deleteBuffer discards the mirror even though the comment acknowledges VAO/native reference counting can preserve use. Thus this is not a complete resource-lifetime model.

TextureManager tracks texture objects in Maps, unit bindings, sampler objects/parameters, mip faces/dimensions/internal formats and cached renderability reasons. Successful create/delete/bind/image/storage/parameter/mipmap calls maintain it; extension acquisition alters float filterability. Validation checks base/max levels, required mip existence/shape/format, WebGL1 power-of-two/wrap limits, cube shape, filtering and integer-vs-normalized sampler compatibility. Compressed-format filterability is explicitly skipped when its format is unknown. Sampler-bound checks recompute with sampler parameters. VertexArrayManager uses a WeakMap for VAOs and WeakRefs for buffer bindings, tracking default/current VAO and pointer shapes for redundancy counts. Texture and VAO manager postchecks are both gated by failUnrenderableTextures.

Redundancy counters cover useProgram, bindBuffer/framebuffer/renderbuffer/sampler/texture/vertexArray, enableDisable and vertexAttribPointer. getAndResetRedundantCallInfo snapshots then zeroes them; these are tracked calls, not measured CPU/GPU savings. Maps hold tags, locations, program metadata, texture/sampler metadata and buffer mirrors until deletion/removal; not every structure has weak ownership. No heap or timing measurements were performed.

Framebuffer feedback diagnostics inspect current framebuffer color/depth/stencil texture attachments and active program samplers, temporarily changing/restoring active texture. They run after an actual draw GL error rather than proactively on every draw. The slow sampler-to-binding lookup omits integer sampler types even though other sampler tables include them; full feedback coverage is not established.

## Local consumers and comment limits

`js/agent/apex-gpu-capture.js` was read in full. It injects this same-origin payload only through explicit query/storage/API selection, then attaches a window error collector capped at 64 matching webgl/GMAN/lint messages. `lintReport` calls canvas.getContext (which can initiate augmentation), obtains GMAN_debug_helper and reads/reset redundancy counts. It catches context/helper errors. `__apex.gpuCapture` is registered from `js/agent/apex.js`; `js/core/save-schema-registry.js` declares the persistent toggle and `tools/ci/pick-tests.mjs` routes its tests. Those latter edges were text-reference evidence, not complete file readings.

The game's disable clears mode/load state/storage and detaches its error collector; it does not call the helper's disable and leaves script/prototype side effects. The collector receives matching uncaught window errors, not every console error/warning or caught exception; an empty findings array does not prove a clean GL session. The off-by-default “zero cost when off” comment describes initial non-injection, not guaranteed restoration after prior enable. Repeated native getContext calls are relevant to when this side-effect instrumentor takes effect.

Source findings, not runtime reproductions:

- Correction to vendor-readable-tail.md: enumArrayToString is referenced by metadata for invalidateFramebuffer, invalidateSubFramebuffer, drawBuffersWebGL and drawBuffers. Error formatting invokes it. Its loop appends to the input normal array while using that array's growing length, so nonempty normal arrays on that formatting path can loop without termination; a typed array instead lacks push and can throw. It is not an apparently unreferenced helper.
- TextureManager copyTexImage2D destructures width/height from the native x/y positions. Its generateMipmap loop halves dimensions before writing starting at the base level, overwriting the base metadata with half-size information. These can produce misleading validation state without proving a game failure.
- “no base level mip ${baseLevel}” is a plain quoted string, so that message contains a literal placeholder.
- The sampler compatibility TODO says integer-type checking is still needed, but getTextureUnitUnrenderableReason already compares number types. The comment understates that implemented check.
- bindFramebuffer's FRAMEBUFFER redundancy condition compares currentDrawFramebuffer twice, omitting currentReadFramebuffer; independent read binding can therefore make its count inaccurate.
- checkBufferSubDataOverflow compares dst byte offset plus typed-array element count, while actual data bookkeeping multiplies by BYTES_PER_ELEMENT. Its precheck can undercount multi-byte typed data.
- Function metadata contains concrete gaps/typos (`numberS` for stencilFuncSeparate, texStorage3D number index 6 beyond its six args, texSubImage2D ten-argument array validator attached to offset argument 9). Broad “checks every command” prose does not guarantee every overload is correctly validated.
- The extension dispatch table spells OES_texture_half_float with uppercase characters while extension class names are lowercased; that branch does not match through the normal getExtension route.

No source repair is included. This complete read establishes this snapshot's contracts and maintenance leads, not runtime correctness, browser portability, security/legal certification or upstream conformance.
