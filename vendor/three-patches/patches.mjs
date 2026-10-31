// vendor/three-patches/patches.mjs — the local patches carried on the vendored
// three.js island, as exact-count string edits against the READABLE npm build
// (build/three.webgpu.js, build/three.core.js). tools/gen/vendor-three.mjs applies
// them before minifying, so a needle that finds the wrong number of sites stops
// the bump instead of silently vendoring a pristine file. Ids keep their
// historical numbers (vendor/three-<ver>/PATCHES.md): 2 and 3 retired in r186;
// 6, 9, 10, 15, 16 and 20 retired in r187.
//
// Adding one: { id, title, file, why, upstream, edits: [{ find, replace, count, file? }] }
// (an edit's own `file` overrides the patch's: r187 moved the node classes into three.tsl.js)
// with `find` copied verbatim from the unminified build (tabs included). The
// canary suite (tests/unit/gfx-backend-canary.test.mjs) pins each patch's
// SURVIVING shape in the minified output — property names and string literals,
// never terser's local names.

export const PATCHES = [
  {
    id: 1,
    title: "swizzle — Chromium 141 rejects the r185+ texture-view descriptor",
    file: "build/three.webgpu.js",
    why: "GPUTextureViewDescriptor stamps swizzle:'rgba' into every createView(); " +
      "Chromium 141 validates the member as a GPUTextureComponentSwizzle dictionary, so the " +
      "pristine bundle throws on every render pass. Identity swizzle carries no information.",
    upstream: "unfixed on dev as of r186 (2026-09-08): no feature gate on 'texture-component-swizzle'",
    edits: [
      { find: "\t\tthis.swizzle = 'rgba';\n", replace: "\t\tthis.swizzle = undefined;\n", count: 2 },
    ],
  },
  {
    id: 4,
    title: "WebKit's 8 KB private address space — render-stage node variables move into main()",
    file: "build/three.webgpu.js",
    why: "iOS/Safari 26 refuses a WGSL module whose module-scope var<private> declarations sum " +
      "past 8,192 bytes; the lit fragment declares ~1,600 node variables. The builder already has " +
      "the function-scope form (compute uses it when allowGlobalVariables is false); the render " +
      "templates never did.",
    upstream: "unfixed on dev as of r186: render templates still emit ${shaderData.vars} at module scope",
    edits: [
      {
        find: "\t\t\tstageData.vars = this.getVars( shaderStage, allowGlobal );\n",
        replace: "\t\t\tstageData.vars = this.getVars( shaderStage, shaderStage === 'compute' && allowGlobal );\n",
        count: 1,
      },
      {
        find: "// vars\n${shaderData.vars}\n\n// codes\n${shaderData.codes}\n\n@vertex\nfn main( ${shaderData.attributes} ) -> VaryingsStruct {\n\n\t// flow\n",
        replace: "// codes\n${shaderData.codes}\n\n@vertex\nfn main( ${shaderData.attributes} ) -> VaryingsStruct {\n\n\t// vars\n\t${shaderData.vars}\n\n\t// flow\n",
        count: 1,
      },
      {
        find: "// vars\n${shaderData.vars}\n\n// codes\n${shaderData.codes}\n\n@fragment\nfn main( ${shaderData.varyings} ) -> ${shaderData.returnType} {\n\n\t// flow\n",
        replace: "// codes\n${shaderData.codes}\n\n@fragment\nfn main( ${shaderData.varyings} ) -> ${shaderData.returnType} {\n\n\t// vars\n\t${shaderData.vars}\n\n\t// flow\n",
        count: 1,
      },
    ],
  },
  {
    id: 5,
    title: "warm-up yields tasks instead of display frames without scheduler.yield",
    file: "build/three.core.js",
    why: "Renderer.compileAsync() awaits yieldToMain() after every render object; the fallback " +
      "used requestAnimationFrame, one display frame per object while Apex holds the loop, and " +
      "hidden tabs stop it entirely. A MessageChannel task yields to input and rendering without " +
      "waiting for a frame; setTimeout(0) where MessageChannel is absent. Never a microtask.",
    upstream: "unchanged on dev as of r186 (src/utils.js yieldToMain)",
    edits: [
      {
        find: "function yieldToMain() {\n\n\tif ( typeof self !== 'undefined' && typeof self.scheduler !== 'undefined' && typeof self.scheduler.yield !== 'undefined' ) {\n\n\t\treturn self.scheduler.yield();\n\n\t}\n\n\treturn new Promise( resolve => {\n\n\t\trequestAnimationFrame( resolve );\n\n\t} );\n",
        replace: "function yieldToMain() {\n\n\tif ( typeof self !== 'undefined' && typeof self.scheduler !== 'undefined' && typeof self.scheduler.yield !== 'undefined' ) {\n\n\t\treturn self.scheduler.yield();\n\n\t}\n\n\treturn new Promise( resolve => {\n\n\t\tif ( typeof MessageChannel === 'undefined' ) { setTimeout( resolve, 0 ); return; }\n\t\tconst channel = new MessageChannel();\n\t\tchannel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); };\n\t\tchannel.port2.postMessage( null );\n\n\t} );\n",
        count: 1,
      },
    ],
  },
  {
    id: 11,
    title: "WebGL MRT MSAA resolve blits the depth buffer once per colour attachment",
    file: "build/three.webgpu.js",
    why: "_resolveRenderTarget builds one blit mask (COLOR | DEPTH [| STENCIL]) and reuses it " +
      "for every MRT attachment, so TLX's two-attachment scene target (output + ssrTag) " +
      "resolved its MSAA depth into the same depth texture twice a frame on desktop WebGL2 " +
      "(HIGH 2x / ULTRA 4x). The second resolve writes identical bytes; ANGLE-D3D11 runs it as " +
      "a full-screen shader pass. Depth/stencil bits are dropped after the first blit.",
    upstream: "unfixed on dev as of r186",
    edits: [
      {
        find: "\t\t\t\t\t\tgl.blitFramebuffer( 0, 0, renderContext.width, renderContext.height, 0, 0, renderContext.width, renderContext.height, mask, gl.NEAREST );\n\n\t\t\t\t\t}\n\n\t\t\t\t}\n\n\t\t\t\tif ( isMRT ) {\n\n\t\t\t\t\t// restore attachments\n",
        replace: "\t\t\t\t\t\tgl.blitFramebuffer( 0, 0, renderContext.width, renderContext.height, 0, 0, renderContext.width, renderContext.height, mask, gl.NEAREST );\n\n\t\t\t\t\t}\n\n\t\t\t\t\tmask &= ~ ( gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT );\n\n\t\t\t\t}\n\n\t\t\t\tif ( isMRT ) {\n\n\t\t\t\t\t// restore attachments\n",
        count: 1,
      },
    ],
  },
  {
    id: 12,
    title: "uniform-array buffers re-upload on every render even when their bytes did not change",
    file: "build/three.webgpu.js",
    why: "A NodeUniformBuffer (uniformArray) inherits Buffer.update() === true, so every " +
      "render-group version bump re-uploads it in full: Apex's lit frame block (4 x 48 lamp " +
      "rows + matTexScale, ~3.3 KB in 5 bindings) went up once per builder state per render, " +
      "~70 states x 2 passes, unchanged all day. The upload is now skipped when the CPU bytes " +
      "equal the last bytes sent to THAT binding's GPU buffer. The copy lives in the backend's " +
      "data for the binding, so it dies with the GPU buffer (destroyUniformBuffer deletes it), " +
      "is per buffer when one node feeds several programs, resets when setup() swaps the typed " +
      "array (resize), is cleared by the WebGL updateBindings full re-upload, and is bypassed " +
      "for update ranges and anything that is not a 4-byte typed array. Bitwise compare: -0/NaN " +
      "payloads count as changes.",
    upstream: "unfixed on dev as of r186",
    edits: [
      {
        find: "class Bindings extends DataMap {\n",
        replace: "function _uniformBufferChanged( backend, binding ) {\n\n\tconst array = binding.buffer;\n\n\tif ( binding.isNodeUniformBuffer !== true || ! array || array.BYTES_PER_ELEMENT !== 4 || binding.updateRanges.length !== 0 ) return true;\n\n\tconst data = backend.get( binding );\n\n\tif ( data.uboSrc !== array ) {\n\n\t\tdata.uboSrc = array;\n\t\tdata.uboWords = new Uint32Array( array.buffer, array.byteOffset, array.length );\n\t\tdata.uboLast = null;\n\n\t}\n\n\tconst words = data.uboWords, last = data.uboLast;\n\n\tif ( ! last ) {\n\n\t\tdata.uboLast = words.slice();\n\t\treturn true;\n\n\t}\n\n\tfor ( let i = 0; i < words.length; i ++ ) {\n\n\t\tif ( words[ i ] !== last[ i ] ) {\n\n\t\t\tlast.set( words );\n\t\t\treturn true;\n\n\t\t}\n\n\t}\n\n\treturn false;\n\n}\n\nclass Bindings extends DataMap {\n",
        count: 1,
      },
      {
        find: "\t\t\t\t\tconst updated = binding.update();\n\n\t\t\t\t\tif ( updated ) {\n\n\t\t\t\t\t\tthis.backend.updateBinding( binding );\n",
        replace: "\t\t\t\t\tconst updated = binding.update();\n\n\t\t\t\t\tif ( updated && _uniformBufferChanged( this.backend, binding ) ) {\n\n\t\t\t\t\t\tthis.backend.updateBinding( binding );\n",
        count: 1,
      },
      {
        find: "\t\t\t\tconst updated = binding.update();\n\n\t\t\t\tif ( updated ) {\n\n\t\t\t\t\tbackend.updateBinding( binding );\n",
        replace: "\t\t\t\tconst updated = binding.update();\n\n\t\t\t\tif ( updated && _uniformBufferChanged( backend, binding ) ) {\n\n\t\t\t\t\tbackend.updateBinding( binding );\n",
        count: 1,
      },
      {
        find: "\t\t\t\tconst array = binding.buffer;\n\t\t\t\tconst bufferGPU = map.bufferGPU;\n",
        replace: "\t\t\t\tconst array = binding.buffer;\n\t\t\t\tconst bufferGPU = map.bufferGPU;\n\t\t\t\tmap.uboLast = null;\n",
        count: 1,
      },
    ],
  },
  {
    id: 13,
    title: "texture bindings in a SHARED uniform group (renderGroup): a cache key they can be part of, and clones that keep the group",
    file: "build/three.webgpu.js",
    why: "Every sampled texture sits in three's per-object group, so every render object in every pass " +
      "walks each of its texture bindings (update, two map gets, a cacheKey string) — ~8-11 on Apex's lit " +
      "shader; a shared group is walked once per render() call (perf hunt 3 R2/B14, bench-tex: 0.7-1.6 us " +
      "per object at K = 10). Two things stop a texture joining renderGroup. (a) NodeBuilder._getBindGroup " +
      "keys a shared group on `binding.nodeUniform.id`, which NodeSampledTexture / NodeSampler do not " +
      "have: a TypeError. The key now names a texture binding by its node id AND its binding name, because " +
      "the group's binding objects come from the FIRST builder that made the key and three's WebGL backend " +
      "sets a program's sampler units by name (_setupBindings: getUniformLocation(program, binding.name)), " +
      "and a texture's `nodeUniformN` name differs between programs of one fragment graph (the AI and " +
      "InstancedMesh lit programs: nodeUniform28 vs 32) — without the name a second program would bind " +
      "the first one's names and sample the wrong units. Ids also get separators (12+3 vs 1+23). (b) " +
      "TextureNode.clone() builds a fresh node, so every .sample() / .compare() / texture(node) tap fell " +
      "back to objectGroup; the clone now keeps its source's group. Nothing in three sets a texture group, " +
      "so both edits are inert until a caller opts a texture in (tsl-lit: apex26.tlxSharedTex).",
    upstream: "unfixed in r187 (Bindings.getSharedBindGroup still keys on `binding.nodeUniform.id`; TextureNode.clone(), now in three.tsl.js, still drops groupNode)",
    edits: [
      {
        // r187 moved the key into Bindings.getSharedBindGroup (#34707) and added the ',' separators (#35226); a
        // standalone uniform keeps its 'u' prefix so it cannot collide with a uniforms group of the same id.
        find: "\t\t\t} else {\n\n\t\t\t\tcacheKeyString += binding.nodeUniform.id + ',';\n\n\t\t\t}\n",
        replace: "\t\t\t} else if ( binding.nodeUniform !== undefined ) {\n\n\t\t\t\tcacheKeyString += 'u' + binding.nodeUniform.id + ',';\n\n\t\t\t} else {\n\n\t\t\t\tcacheKeyString += ( binding.isSampler === true ? 's' : 't' ) + ( binding.textureNode ? binding.textureNode.id : '' ) + ':' + binding.name + ',';\n\n\t\t\t}\n",
        count: 1,
      },
      {
        file: "build/three.tsl.js",
        find: "\t\tconst newNode = new this.constructor( this.value, this.uvNode, this.levelNode, this.biasNode );\n\t\tnewNode.sampler = this.sampler;\n\t\tnewNode.depthNode = this.depthNode;\n\t\tnewNode.compareNode = this.compareNode;\n\t\tnewNode.gradNode = this.gradNode;\n\t\tnewNode.gatherNode = this.gatherNode;\n\t\tnewNode.offsetNode = this.offsetNode;\n\n\t\treturn newNode;\n",
        replace: "\t\tconst newNode = new this.constructor( this.value, this.uvNode, this.levelNode, this.biasNode );\n\t\tnewNode.sampler = this.sampler;\n\t\tnewNode.depthNode = this.depthNode;\n\t\tnewNode.compareNode = this.compareNode;\n\t\tnewNode.gradNode = this.gradNode;\n\t\tnewNode.gatherNode = this.gatherNode;\n\t\tnewNode.offsetNode = this.offsetNode;\n\t\tnewNode.groupNode = this.groupNode;\n\n\t\treturn newNode;\n",
        count: 1,
      },
    ],
  },
  {
    id: 14,
    title: "settle rejected WebGPU pipeline scopes and shader diagnostics",
    file: "build/three.webgpu.js",
    why: "popErrorScope returns a Promise that may reject independently of renderer.render(). " +
      "Both sync pipeline paths omitted rejection handling; async paths resolved an outer Promise " +
      "while leaking the rejected async executor. Await diagnostics in the handled chain, mark the " +
      "affected pipeline failed, and resolve compilation work after reporting a bounded reason.",
    upstream: "present in pristine three 0.186.1 and 0.187.0 (r187 pops the scope before awaiting the pipeline but keeps the async executor and the unhandled sync .then); MDN GPUDevice.popErrorScope and Promise constructor checked 2026-10-15",
    edits: [
      {
        find: "\t\t\tdevice.popErrorScope().then( ( err ) => {\n\n\t\t\t\tif ( err !== null ) {\n\n\t\t\t\t\tpipelineData.error = true;\n\n\t\t\t\t\terror( `WebGPURenderer: Render pipeline creation failed (${ pipelineLabel }): ${ err.message }` );\n\n\t\t\t\t\tthis._reportShaderDiagnostics( stages, pipelineLabel );\n\n\t\t\t\t}\n\n\t\t\t} );",
        replace: "\t\t\tdevice.popErrorScope().then( async ( err ) => {\n\n\t\t\t\tif ( err !== null ) {\n\n\t\t\t\t\tpipelineData.error = true;\n\n\t\t\t\t\terror( `WebGPURenderer: Render pipeline creation failed (${ pipelineLabel }): ${ err.message }` );\n\n\t\t\t\t\tawait this._reportShaderDiagnostics( stages, pipelineLabel );\n\n\t\t\t\t}\n\n\t\t\t} ).catch( ( err ) => {\n\n\t\t\t\tpipelineData.error = true;\n\t\t\t\terror( `WebGPURenderer: Render pipeline scope/diagnostics failed (${ pipelineLabel }): ${ String( err && err.message || err ).slice( 0, 300 ) }` );\n\n\t\t\t} );",
        count: 1,
      },
      {
        find: "\t\t\tconst p = new Promise( async ( resolve /*, reject*/ ) => {\n",
        replace: "\t\t\tconst p = ( async () => {\n",
        count: 1,
      },
      {
        find: "\t\t\t\t} finally {\n\n\t\t\t\t\t// Guarantee resolution so `compileAsync`'s Promise.all cannot hang on an\n\t\t\t\t\t// unexpected throw from any await above.\n\t\t\t\t\tresolve();\n\n\t\t\t\t}\n\n\t\t\t} );\n",
        replace: "\t\t\t\t} catch ( err ) {\n\n\t\t\t\t\tpipelineData.error = true;\n\t\t\t\t\terror( `WebGPURenderer: Async render pipeline scope/diagnostics failed (${ pipelineLabel }): ${ String( err && err.message || err ).slice( 0, 300 ) }` );\n\n\t\t\t\t}\n\n\t\t\t} )();\n",
        count: 1,
      },
      {
        find: "\t\t\tdevice.popErrorScope().then( ( err ) => {\n\n\t\t\t\tif ( err !== null ) {\n\n\t\t\t\t\tpipelineGPU.error = true;\n\n\t\t\t\t\terror( `WebGPURenderer: Compute pipeline creation failed (${ pipelineLabel }): ${ err.message }` );\n\n\t\t\t\t\tthis._reportShaderDiagnostics( [ { program: computeStage, module: computeProgram.module } ], pipelineLabel );\n\n\t\t\t\t}\n\n\t\t\t} );",
        replace: "\t\t\tdevice.popErrorScope().then( async ( err ) => {\n\n\t\t\t\tif ( err !== null ) {\n\n\t\t\t\t\tpipelineGPU.error = true;\n\n\t\t\t\t\terror( `WebGPURenderer: Compute pipeline creation failed (${ pipelineLabel }): ${ err.message }` );\n\n\t\t\t\t\tawait this._reportShaderDiagnostics( [ { program: computeStage, module: computeProgram.module } ], pipelineLabel );\n\n\t\t\t\t}\n\n\t\t\t} ).catch( ( err ) => {\n\n\t\t\t\tpipelineGPU.error = true;\n\t\t\t\terror( `WebGPURenderer: Compute pipeline scope/diagnostics failed (${ pipelineLabel }): ${ String( err && err.message || err ).slice( 0, 300 ) }` );\n\n\t\t\t} );",
        count: 1,
      },
      {
        find: "\t\t\tconst promise = new Promise( async ( resolve /*, reject*/ ) => {\n",
        replace: "\t\t\tconst promise = ( async () => {\n",
        count: 1,
      },
      {
        find: "\t\t\t\t} finally {\n\n\t\t\t\t\t// Guarantee resolution so `compileComputeAsync`'s Promise.all cannot hang on an\n\t\t\t\t\t// unexpected throw from any await above.\n\t\t\t\t\tresolve();\n\n\t\t\t\t}\n\n\t\t\t} );\n",
        replace: "\t\t\t\t} catch ( err ) {\n\n\t\t\t\t\tpipelineGPU.error = true;\n\t\t\t\t\terror( `WebGPURenderer: Async compute pipeline scope/diagnostics failed (${ pipelineLabel }): ${ String( err && err.message || err ).slice( 0, 300 ) }` );\n\n\t\t\t\t}\n\n\t\t\t} )();\n",
        count: 1,
      },
    ],
  },
  {
    id: 17,
    title: "single-sample storeOp discard — a per-pass hint for write-only attachments",
    file: "build/three.webgpu.js",
    why: "WebGPUBackend.beginRender stores every attachment unless the target is MULTISAMPLED and " +
      "storeMultisampled*Buffer is false, so a single-sample attachment nobody reads (the scene ssrTag, " +
      "the shadow R8 colour, the mirror depth/tag, an unread scene depth) is written to memory every " +
      "pass — the WebGL2 leg drops the same bytes with invalidateFramebuffer (#3679). Two opt-in members " +
      "on the RenderTarget, read at every beginRender: apexDiscardColor (bit i = colour attachment i) " +
      "and apexDiscardDepth (true). They change the storeOp only — never the loadOp — so the caller " +
      "sets them around the LAST render into the target of a frame and clears them after.",
    upstream: "unfixed on dev as of 2026-10-24 (discardColor/discardDepth still gate on sampleCount > 1); " +
      "draft in docs/notes/UPSTREAM-THREE-ISSUES.md §4. Array-camera layer descriptors are not patched (XR only).",
    edits: [
      {
        find: "\t\tconst discardDepth = renderContext.sampleCount > 1 && renderTarget?.storeMultisampledDepthBuffer === false;\n\t\tconst discardStencil = renderContext.sampleCount > 1 && renderTarget?.storeMultisampledStencilBuffer === false;\n\n\t\t// A fullscreen pass",
        replace: "\t\tconst discardDepth = renderContext.sampleCount > 1 && renderTarget?.storeMultisampledDepthBuffer === false;\n\t\tconst discardStencil = renderContext.sampleCount > 1 && renderTarget?.storeMultisampledStencilBuffer === false;\n\t\tconst apexDiscardColor = renderTarget ? renderTarget.apexDiscardColor | 0 : 0;\n\t\tconst apexDiscardDepth = renderTarget ? renderTarget.apexDiscardDepth === true : false;\n\n\t\t// A fullscreen pass",
        count: 1,
      },
      {
        find: "\t\t\t\tif ( discardColor ) {\n\n\t\t\t\t\tcolorAttachment.storeOp = GPUStoreOp.Discard;\n",
        replace: "\t\t\t\tif ( discardColor || ( ( apexDiscardColor >> i ) & 1 ) === 1 ) {\n\n\t\t\t\t\tcolorAttachment.storeOp = GPUStoreOp.Discard;\n",
        count: 1,
      },
      {
        find: "\t\t\tif ( discardDepth ) {\n\n\t\t\t\tdepthStencilAttachment.depthStoreOp = GPUStoreOp.Discard;\n",
        replace: "\t\t\tif ( discardDepth || apexDiscardDepth ) {\n\n\t\t\t\tdepthStencilAttachment.depthStoreOp = GPUStoreOp.Discard;\n",
        count: 1,
      },
    ],
  },
  {
    id: 18,
    title: "a 3-component colour target keeps a vec4 WGSL fragment output",
    file: "build/three.webgpu.js",
    why: "NodeBuilder.getOutputType() sizes @location(i) to the target's component count, so an RGBFormat " +
      "target (rg11b10ufloat) gets a vec3 output; WebGPU then refuses any blend factor that reads source " +
      "alpha (gpuweb 'validating GPUFragmentState'), and every blended material's pipeline fails. The spec " +
      "accepts a vec4 output into an RGB attachment (extra components are dropped), so the WGSL builder " +
      "reports vec4 wherever the base answer is vec3. GLSL (WebGL2) is untouched: GL has no such rule.",
    upstream: "unfixed on dev as of 2026-10-24 (NodeUtils.getTextureType RGBFormat -> length 3); #3690 / A·H10 lead",
    edits: [
      {
        find: "\tgetOutputStructName() {\n\n\t\treturn 'output';\n\n\t}\n",
        replace: "\tgetOutputStructName() {\n\n\t\treturn 'output';\n\n\t}\n\n\t/**\n\t * Returns the WGSL type of a colour output: a 3-component target still takes a vec4\n\t * so source-alpha blend factors stay valid (apex patch 18).\n\t *\n\t * @param {number} [index=0] - The index of the render target texture.\n\t * @return {string} The type.\n\t */\n\tgetOutputType( index = 0 ) {\n\n\t\tconst type = super.getOutputType( index );\n\n\t\treturn type === 'vec3' ? 'vec4' : type;\n\n\t}\n",
        count: 1,
      },
    ],
  },
{
  "id": 19,
  "title": "skip repeated shared binding group checks at the same version",
  "file": "build/three.webgpu.js",
  "why": "Homogeneous shared non-object groups have already processed every member at their current version. Preserve array/member/group-node identities, Nodes cache identity and successful completion before skipping repeated ChainMap lookups. State belongs to Bindings DataMap and is released with the group.",
  "upstream": "Local optimization against Nodes.updateGroup semantics, unchanged from r186.1 to r187 (r187 #35120 reshaped the _update tail into one cache-key join); https://github.com/mrdoob/three.js/blob/r187/src/renderers/common/nodes/Nodes.js",
  "edits": [
    {
      "find": "\t_update( bindGroup, bindings ) {\n\n\t\tconst { backend } = this;",
      "replace": "\t_update( bindGroup, bindings ) {\n\n\t\t// Shared groups already checked at this version need no per-binding ChainMap dispatch.\n\t\t// Keep identity checks: these private arrays and their members are mutable.\n\t\tconst groupData = this.get( bindGroup );\n\t\tconst members = bindGroup.bindings;\n\t\tlet shared = groupData.sharedUpdate;\n\t\tlet same = shared !== undefined && shared.array === members && shared.members.length === members.length;\n\t\tif ( same ) {\n\n\t\t\tfor ( let i = 0; i < members.length; i ++ ) {\n\n\t\t\t\tif ( shared.members[ i ] !== members[ i ] || members[ i ].groupNode !== shared.node ) { same = false; break; }\n\n\t\t\t}\n\n\t\t}\n\t\tif ( ! same ) {\n\n\t\t\tshared = undefined;\n\t\t\tconst node = members.length > 0 ? members[ 0 ].groupNode : undefined;\n\t\t\tif ( node && node.shared === true && node.updateType !== NodeUpdateType.OBJECT && members.every( binding => binding.groupNode === node ) ) {\n\n\t\t\t\tshared = { array: members, members: members.slice(), node, seen: false };\n\n\t\t\t}\n\t\t\tgroupData.sharedUpdate = shared;\n\n\t\t}\n\t\tconst eligible = shared !== undefined && shared.node.shared === true && shared.node.updateType !== NodeUpdateType.OBJECT;\n\t\tconst sharedVersion = eligible ? shared.node.version : undefined;\n\t\tconst sharedGroupsData = this.nodes.groupsData;\n\t\tif ( eligible && shared.seen && shared.version === sharedVersion && shared.groupsData === this.nodes.groupsData ) return;\n\t\t// Clear before callbacks: a failed update must never leave a committed skip.\n\t\tif ( shared !== undefined ) shared.seen = false;\n\n\t\tconst { backend } = this;",
      "count": 1
    },
    {
      "find": "\t\t\tthis.backend.updateBindings( bindGroup, bindings, cacheKey, version );\n\n\t\t}\n\n\t}\n\n}\n\nconst _emptyArray",
      "replace": "\t\t\tthis.backend.updateBindings( bindGroup, bindings, cacheKey, version );\n\n\t\t}\n\n\t\tif ( eligible ) {\n\n\t\t\tshared.version = sharedVersion;\n\t\t\tshared.groupsData = sharedGroupsData;\n\t\t\tshared.seen = true;\n\n\t\t}\n\n\t}\n\n}\n\nconst _emptyArray",
      "count": 1
    }
  ]
},
];

/** Retired patches, kept so the canary can assert the UPSTREAM form is present. */
export const RETIRED = [
  { id: 2, title: "#33952 bind-group leak", upstream: "PR #33954, released in r186" },
  { id: 3, title: "#34405 polygonOffset missing from the WebGPU pipeline key", upstream: "PR #34406, released in r186" },
  { id: 6, title: "#34535 getDynamicCacheKey allocates an array per render object per frame", upstream: "PR #34553, released in r187" },
  { id: 9, title: "TextureNode.update rebuilds an unread UV matrix", upstream: "PR #34552, released in r187 (the matrix is rebuilt only inside the base node's onObjectUpdate)" },
  { id: 10, title: "TextureNode: one shared flipY / uv-matrix uniform per base node", upstream: "PR #34552, released in r187" },
  { id: 15, title: "WebGL fallback frees GL programs, shaders and VAOs", upstream: "PRs #34601 and #34610, released in r187" },
  { id: 16, title: "evict shared bind groups when their final owner releases them", upstream: "PR #34707, released in r187" },
  { id: 20, title: "opted-in Uint16 index storage", upstream: "PR #34734, released in r187: every non-storage index buffer stays Uint16 and partial writes go through writeBufferAligned" },
];
