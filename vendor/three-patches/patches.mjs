// vendor/three-patches/patches.mjs — the local patches carried on the vendored
// three.js island, as exact-count string edits against the READABLE npm build
// (build/three.webgpu.js, build/three.core.js). tools/gen/vendor-three.mjs applies
// them before minifying, so a needle that finds the wrong number of sites stops
// the bump instead of silently vendoring a pristine file. Ids keep their
// historical numbers (vendor/three-<ver>/PATCHES.md): 2 and 3 retired in r186.
//
// Adding one: { id, title, file, why, upstream, edits: [{ find, replace, count }] }
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
    id: 6,
    title: "#34535 getDynamicCacheKey allocates an array PER RENDER OBJECT PER FRAME",
    file: "build/three.webgpu.js",
    why: "`hash$1` is `( ...params ) => cyrb53( params )`, so every call mints a rest array. " +
      "RenderObject.getDynamicCacheKey() calls it up to three times, and `get needsUpdate()` " +
      "calls getDynamicCacheKey() for EVERY render object on EVERY draw — so the array count " +
      "is (objects x frames), and the arrays are pure garbage the moment cyrb53 returns. " +
      "Measured here before the patch: 255 KB/frame of JS allocation on the three.js/WebGPU " +
      "path, 28.4 MB/s, a collection about once a second freeing a median 25.8 MB " +
      "(artifacts/hitch-native-tlxwgpu.json, tools/gfx/frame-hitch.mjs). Upstream measured the " +
      "same shape at 120,000 arrays/s for 1,000 meshes at 120 fps. The fix is upstream\'s: one " +
      "module-scope scratch array, filled by index and hashed with hashArray (already in this " +
      "bundle, and already used this way by Nodes.getCacheKey a few thousand lines down). " +
      "The key VALUE changes — a flat hash of five slots replaces three nested hashes — which " +
      "is safe because every producer and every consumer of it is this one method, and " +
      "upstream made exactly this change.",
    upstream: "PR #34553 (issue #34535), milestone r187 — RETIRE THIS ON THE r187 BUMP",
    edits: [
      {
        find: "class RenderObject {\n",
        replace: "const _dynamicCacheKeyValues = [ 0, 0, 0, 0, 0 ];\n\nclass RenderObject {\n",
        count: 1,
      },
      {
        find: "\t\tif ( this.camera.isArrayCamera ) {\n\n\t\t\tcacheKey = hash$1( cacheKey, this.camera.cameras.length );\n\n\t\t}\n\n\t\tif ( this.object.receiveShadow ) {\n\n\t\t\tcacheKey = hash$1( cacheKey, 1 );\n\n\t\t}\n\n\t\tcacheKey = hash$1( cacheKey, this.renderer.contextNode.id, this.renderer.contextNode.version );\n\n\t\treturn cacheKey;\n",
        replace: "\t\t_dynamicCacheKeyValues[ 0 ] = cacheKey;\n\t\t_dynamicCacheKeyValues[ 1 ] = this.camera.isArrayCamera ? this.camera.cameras.length : 0;\n\t\t_dynamicCacheKeyValues[ 2 ] = this.object.receiveShadow ? 1 : 0;\n\t\t_dynamicCacheKeyValues[ 3 ] = this.renderer.contextNode.id;\n\t\t_dynamicCacheKeyValues[ 4 ] = this.renderer.contextNode.version;\n\n\t\treturn hashArray( _dynamicCacheKeyValues );\n",
        count: 1,
      },
    ],
  },
  {
    id: 9,
    title: "TextureNode.update rebuilds an unread UV matrix for every sampled texture on every draw",
    file: "build/three.webgpu.js",
    why: "TextureNode.update() runs per render OBJECT whenever the node has a matrix OR a flipY " +
      "uniform, and it calls texture.updateMatrix() (Matrix3.setUvTransform: a cos, a sin, nine " +
      "writes) whenever texture.matrixAutoUpdate is true, even when this node has no matrix " +
      "uniform, so nothing reads the result. On three's WebGL2 backend every texture node gets " +
      "a flipY uniform, so every shadow-map compare, material-array and lamp-bake sample pays it " +
      "on every draw: census 289 (real Metal, montreal night) sampled 293 ms of setUvTransform " +
      "self time in a 21.9 s WebGL2 leg. The matrix is still rebuilt for any node that samples " +
      "through it, so texture offset/repeat/rotation behave exactly as before.",
    upstream: "unfixed on dev as of r186",
    edits: [
      {
        find: "\t\tif ( matrixUniform !== null ) matrixUniform.value = texture.matrix;\n\n\t\tif ( texture.matrixAutoUpdate === true ) {\n",
        replace: "\t\tif ( matrixUniform !== null ) matrixUniform.value = texture.matrix;\n\n\t\tif ( matrixUniform !== null && texture.matrixAutoUpdate === true ) {\n",
        count: 1,
      },
    ],
  },
  {
    id: 10,
    title: "TextureNode: one shared flipY / uv-matrix uniform per BASE node, not one per sample clone",
    file: "build/three.webgpu.js",
    why: "Every TextureNode made its OWN flipY uniform (three's WebGL2 backend always flips) and " +
      "matrix uniform, and marked itself OBJECT-update to feed them — so each .sample() clone " +
      "added an entry to the per-object update set and the object UBO. Apex's lit shader samples " +
      "~27 texture nodes per draw (20 of them PCF taps on four shadow maps), ~33 per-object updates " +
      "per lit draw on WebGL2 (census 289: updateForRender + update + updateReference ~28 % of the " +
      "leg's CPU). Upstream's fix (#34552, r187) moves both uniforms onto the base node as " +
      "onObjectUpdate uniforms reading base.value, so clones share one. This backports that shape: " +
      "the uniforms live on getBase(), read the base's CURRENT value each object update (a node " +
      "whose .value is swapped still reports the new texture), and the node itself no longer needs " +
      "an OBJECT update. sample() also carries the base's updateMatrix to the clone, so a base " +
      "marked setUpdateMatrix(false) yields clones without the uv matrix.",
    upstream: "PR #34552 (TextureNode: Simplify and optimize uniforms), r187 — RETIRE THIS AND PATCH 9 ON THE r187 BUMP",
    edits: [
      {
        find: "\t\tif ( this._matrixUniform === null ) this._matrixUniform = uniform( this.value.matrix );\n\n\t\treturn this._matrixUniform.mul( vec3( uvNode, 1 ) ).xy;\n",
        replace: "\t\tconst base = this.getBase();\n\n\t\tif ( base._matrixUniform === null ) base._matrixUniform = uniform( base.value.matrix ).onObjectUpdate( () => {\n\n\t\t\tconst texture = base.value;\n\n\t\t\tif ( texture.matrixAutoUpdate === true ) texture.updateMatrix();\n\n\t\t\treturn texture.matrix;\n\n\t\t} );\n\n\t\treturn base._matrixUniform.mul( vec3( uvNode, 1 ) ).xy;\n",
        count: 1,
      },
      {
        find: "\t\t\tif ( this._flipYUniform === null ) this._flipYUniform = uniform( false );\n\n\t\t\tuvNode = uvNode.toVar();\n\n\t\t\tif ( this.sampler ) {\n\n\t\t\t\tuvNode = this._flipYUniform.select( uvNode.flipY(), uvNode );\n\n\t\t\t} else {\n\n\t\t\t\tuvNode = this._flipYUniform.select(",
        replace: "\t\t\tconst base = this.getBase();\n\n\t\t\tif ( base._flipYUniform === null ) base._flipYUniform = uniform( false ).onObjectUpdate( () => {\n\n\t\t\t\tconst texture = base.value;\n\n\t\t\t\treturn ( ( texture.image instanceof ImageBitmap && texture.flipY === true ) || texture.isRenderTargetTexture === true || texture.isFramebufferTexture === true || texture.isDepthTexture === true );\n\n\t\t\t} );\n\n\t\t\tuvNode = uvNode.toVar();\n\n\t\t\tif ( this.sampler ) {\n\n\t\t\t\tuvNode = base._flipYUniform.select( uvNode.flipY(), uvNode );\n\n\t\t\t} else {\n\n\t\t\t\tuvNode = base._flipYUniform.select(",
        count: 1,
      },
      {
        find: "\t\t\tthis.updateType = ( this._matrixUniform !== null || this._flipYUniform !== null ) ? NodeUpdateType.OBJECT : NodeUpdateType.NONE;\n",
        replace: "\t\t\tthis.updateType = NodeUpdateType.NONE;\n",
        count: 1,
      },
      {
        find: "\t\tconst textureNode = this.clone();\n\t\ttextureNode.uvNode = nodeObject( uvNode );\n\t\ttextureNode.referenceNode = this.getBase();\n",
        replace: "\t\tconst textureNode = this.clone();\n\t\ttextureNode.uvNode = nodeObject( uvNode );\n\t\ttextureNode.referenceNode = this.getBase();\n\t\ttextureNode.updateMatrix = this.updateMatrix;\n",
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
    upstream: "unfixed on dev as of 2026-10-13 (the key moved to Bindings.getSharedBindGroup, same `binding.nodeUniform.id`; TextureNode.clone() still drops groupNode)",
    edits: [
      {
        find: "\t\t\t\t\t\tcacheKeyString += uniform.nodeUniform.node.id;\n",
        replace: "\t\t\t\t\t\tcacheKeyString += uniform.nodeUniform.node.id + ',';\n",
        count: 1,
      },
      {
        find: "\t\t\t\t} else {\n\n\t\t\t\t\tcacheKeyString += binding.nodeUniform.id;\n\n\t\t\t\t}\n",
        replace: "\t\t\t\t} else if ( binding.nodeUniform !== undefined ) {\n\n\t\t\t\t\tcacheKeyString += 'u' + binding.nodeUniform.id + ',';\n\n\t\t\t\t} else {\n\n\t\t\t\t\tcacheKeyString += ( binding.isSampler === true ? 's' : 't' ) + ( binding.textureNode ? binding.textureNode.id : '' ) + ':' + binding.name + ',';\n\n\t\t\t\t}\n",
        count: 1,
      },
      {
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
    upstream: "present in pristine three 0.186.1; MDN GPUDevice.popErrorScope and Promise constructor checked 2026-10-15",
    edits: [
      {
        find: "\t\t\tdevice.popErrorScope().then( ( err ) => {\n\n\t\t\t\tif ( err !== null ) {\n\n\t\t\t\t\tpipelineData.error = true;\n\n\t\t\t\t\terror( `WebGPURenderer: Render pipeline creation failed (${ pipelineLabel }): ${ err.message }` );\n\n\t\t\t\t\tthis._reportShaderDiagnostics( stages, pipelineLabel );\n\n\t\t\t\t}\n\n\t\t\t} );",
        replace: "\t\t\tdevice.popErrorScope().then( async ( err ) => {\n\n\t\t\t\tif ( err !== null ) {\n\n\t\t\t\t\tpipelineData.error = true;\n\n\t\t\t\t\terror( `WebGPURenderer: Render pipeline creation failed (${ pipelineLabel }): ${ err.message }` );\n\n\t\t\t\t\tawait this._reportShaderDiagnostics( stages, pipelineLabel );\n\n\t\t\t\t}\n\n\t\t\t} ).catch( ( err ) => {\n\n\t\t\t\tpipelineData.error = true;\n\t\t\t\terror( `WebGPURenderer: Render pipeline scope/diagnostics failed (${ pipelineLabel }): ${ String( err && err.message || err ).slice( 0, 300 ) }` );\n\n\t\t\t} );",
        count: 1,
      },
      {
        find: "\t\t\tconst p = new Promise( async ( resolve /*, reject*/ ) => {\n\n\t\t\t\ttry {\n\n\t\t\t\t\tlet asyncError = null;\n\t\t\t\t\tlet pipelinePromise = null;\n\n\t\t\t\t\ttry {\n\n\t\t\t\t\t\tpipelinePromise = device.createRenderPipelineAsync( _renderPipelineDescriptor );\n\n\t\t\t\t\t} catch ( err ) {\n\n\t\t\t\t\t\tasyncError = err;\n\n\t\t\t\t\t}\n\n\t\t\t\t\t_renderPipelineDescriptor.reset();\n\n\t\t\t\t\tif ( pipelinePromise !== null ) {\n\n\t\t\t\t\t\ttry {\n\n\t\t\t\t\t\t\tpipelineData.pipeline = await pipelinePromise;\n\n\t\t\t\t\t\t} catch ( err ) {\n\n\t\t\t\t\t\t\tasyncError = err;\n\n\t\t\t\t\t\t}\n\n\t\t\t\t\t}\n\n\t\t\t\t\tconst errorScope = await device.popErrorScope();\n\n\t\t\t\t\tif ( errorScope !== null || asyncError !== null ) {\n\n\t\t\t\t\t\tpipelineData.error = true;\n\n\t\t\t\t\t\tconst reason = ( errorScope && errorScope.message ) || ( asyncError && asyncError.message ) || 'unknown';\n\t\t\t\t\t\terror( `WebGPURenderer: Async render pipeline creation failed (${ pipelineLabel }): ${ reason }` );\n\n\t\t\t\t\t\tawait this._reportShaderDiagnostics( stages, pipelineLabel );\n\n\t\t\t\t\t}\n\n\t\t\t\t} finally {\n\n\t\t\t\t\t// Guarantee resolution so `compileAsync`'s Promise.all cannot hang on an\n\t\t\t\t\t// unexpected throw from any await above.\n\t\t\t\t\tresolve();\n\n\t\t\t\t}\n\n\t\t\t} );",
        replace: "\t\t\tconst p = ( async () => {\n\n\t\t\t\ttry {\n\n\t\t\t\t\tlet asyncError = null;\n\t\t\t\t\tlet pipelinePromise = null;\n\n\t\t\t\t\ttry {\n\n\t\t\t\t\t\tpipelinePromise = device.createRenderPipelineAsync( _renderPipelineDescriptor );\n\n\t\t\t\t\t} catch ( err ) {\n\n\t\t\t\t\t\tasyncError = err;\n\n\t\t\t\t\t}\n\n\t\t\t\t\t_renderPipelineDescriptor.reset();\n\n\t\t\t\t\tif ( pipelinePromise !== null ) {\n\n\t\t\t\t\t\ttry {\n\n\t\t\t\t\t\t\tpipelineData.pipeline = await pipelinePromise;\n\n\t\t\t\t\t\t} catch ( err ) {\n\n\t\t\t\t\t\t\tasyncError = err;\n\n\t\t\t\t\t\t}\n\n\t\t\t\t\t}\n\n\t\t\t\t\tconst errorScope = await device.popErrorScope();\n\n\t\t\t\t\tif ( errorScope !== null || asyncError !== null ) {\n\n\t\t\t\t\t\tpipelineData.error = true;\n\n\t\t\t\t\t\tconst reason = ( errorScope && errorScope.message ) || ( asyncError && asyncError.message ) || 'unknown';\n\t\t\t\t\t\terror( `WebGPURenderer: Async render pipeline creation failed (${ pipelineLabel }): ${ reason }` );\n\n\t\t\t\t\t\tawait this._reportShaderDiagnostics( stages, pipelineLabel );\n\n\t\t\t\t\t}\n\n\t\t\t\t} catch ( err ) {\n\n\t\t\t\t\tpipelineData.error = true;\n\t\t\t\t\terror( `WebGPURenderer: Async render pipeline scope/diagnostics failed (${ pipelineLabel }): ${ String( err && err.message || err ).slice( 0, 300 ) }` );\n\n\t\t\t\t}\n\n\t\t\t} )();",
        count: 1,
      },
      {
        find: "\t\t\tdevice.popErrorScope().then( ( err ) => {\n\n\t\t\t\tif ( err !== null ) {\n\n\t\t\t\t\tpipelineGPU.error = true;\n\n\t\t\t\t\terror( `WebGPURenderer: Compute pipeline creation failed (${ pipelineLabel }): ${ err.message }` );\n\n\t\t\t\t\tthis._reportShaderDiagnostics( [ { program: computeStage, module: computeProgram.module } ], pipelineLabel );\n\n\t\t\t\t}\n\n\t\t\t} );",
        replace: "\t\t\tdevice.popErrorScope().then( async ( err ) => {\n\n\t\t\t\tif ( err !== null ) {\n\n\t\t\t\t\tpipelineGPU.error = true;\n\n\t\t\t\t\terror( `WebGPURenderer: Compute pipeline creation failed (${ pipelineLabel }): ${ err.message }` );\n\n\t\t\t\t\tawait this._reportShaderDiagnostics( [ { program: computeStage, module: computeProgram.module } ], pipelineLabel );\n\n\t\t\t\t}\n\n\t\t\t} ).catch( ( err ) => {\n\n\t\t\t\tpipelineGPU.error = true;\n\t\t\t\terror( `WebGPURenderer: Compute pipeline scope/diagnostics failed (${ pipelineLabel }): ${ String( err && err.message || err ).slice( 0, 300 ) }` );\n\n\t\t\t} );",
        count: 1,
      },
      {
        find: "\t\t\tconst promise = new Promise( async ( resolve /*, reject*/ ) => {\n\n\t\t\t\ttry {\n\n\t\t\t\t\tlet asyncError = null;\n\t\t\t\t\tlet pipelinePromise = null;\n\n\t\t\t\t\ttry {\n\n\t\t\t\t\t\tpipelinePromise = device.createComputePipelineAsync( _computePipelineDescriptor );\n\n\t\t\t\t\t} catch ( err ) {\n\n\t\t\t\t\t\tasyncError = err;\n\n\t\t\t\t\t}\n\n\t\t\t\t\t_computePipelineDescriptor.reset();\n\n\t\t\t\t\tif ( pipelinePromise !== null ) {\n\n\t\t\t\t\t\ttry {\n\n\t\t\t\t\t\t\tpipelineGPU.pipeline = await pipelinePromise;\n\n\t\t\t\t\t\t} catch ( err ) {\n\n\t\t\t\t\t\t\tasyncError = err;\n\n\t\t\t\t\t\t}\n\n\t\t\t\t\t}\n\n\t\t\t\t\tconst errorScope = await device.popErrorScope();\n\n\t\t\t\t\tif ( errorScope !== null || asyncError !== null ) {\n\n\t\t\t\t\t\tpipelineGPU.error = true;\n\n\t\t\t\t\t\tconst reason = ( errorScope && errorScope.message ) || ( asyncError && asyncError.message ) || 'unknown';\n\t\t\t\t\t\terror( `WebGPURenderer: Async compute pipeline creation failed (${ pipelineLabel }): ${ reason }` );\n\n\t\t\t\t\t\tawait this._reportShaderDiagnostics( [ { program: computeStage, module: computeProgram.module } ], pipelineLabel );\n\n\t\t\t\t\t}\n\n\t\t\t\t} finally {\n\n\t\t\t\t\t// Guarantee resolution so `compileComputeAsync`'s Promise.all cannot hang on an\n\t\t\t\t\t// unexpected throw from any await above.\n\t\t\t\t\tresolve();\n\n\t\t\t\t}\n\n\t\t\t} );",
        replace: "\t\t\tconst promise = ( async () => {\n\n\t\t\t\ttry {\n\n\t\t\t\t\tlet asyncError = null;\n\t\t\t\t\tlet pipelinePromise = null;\n\n\t\t\t\t\ttry {\n\n\t\t\t\t\t\tpipelinePromise = device.createComputePipelineAsync( _computePipelineDescriptor );\n\n\t\t\t\t\t} catch ( err ) {\n\n\t\t\t\t\t\tasyncError = err;\n\n\t\t\t\t\t}\n\n\t\t\t\t\t_computePipelineDescriptor.reset();\n\n\t\t\t\t\tif ( pipelinePromise !== null ) {\n\n\t\t\t\t\t\ttry {\n\n\t\t\t\t\t\t\tpipelineGPU.pipeline = await pipelinePromise;\n\n\t\t\t\t\t\t} catch ( err ) {\n\n\t\t\t\t\t\t\tasyncError = err;\n\n\t\t\t\t\t\t}\n\n\t\t\t\t\t}\n\n\t\t\t\t\tconst errorScope = await device.popErrorScope();\n\n\t\t\t\t\tif ( errorScope !== null || asyncError !== null ) {\n\n\t\t\t\t\t\tpipelineGPU.error = true;\n\n\t\t\t\t\t\tconst reason = ( errorScope && errorScope.message ) || ( asyncError && asyncError.message ) || 'unknown';\n\t\t\t\t\t\terror( `WebGPURenderer: Async compute pipeline creation failed (${ pipelineLabel }): ${ reason }` );\n\n\t\t\t\t\t\tawait this._reportShaderDiagnostics( [ { program: computeStage, module: computeProgram.module } ], pipelineLabel );\n\n\t\t\t\t\t}\n\n\t\t\t\t} catch ( err ) {\n\n\t\t\t\t\tpipelineGPU.error = true;\n\t\t\t\t\terror( `WebGPURenderer: Async compute pipeline scope/diagnostics failed (${ pipelineLabel }): ${ String( err && err.message || err ).slice( 0, 300 ) }` );\n\n\t\t\t\t}\n\n\t\t\t} )();",
        count: 1,
      },
    ],
  },
  {
    id: 15,
    title: "WebGL fallback frees GL programs, shaders and VAOs (three #34597)",
    file: "build/three.webgpu.js",
    why: "Pipelines._releaseProgram only called the stats-only info.destroyProgram and WebGLBackend " +
      "never deleted a program, shader or VAO, so every track switch left ~50 VAOs, ~4 programs and " +
      "~8 shaders alive (tools/gfx/gl-object-census.mjs: deleted = 0 across 9 visits). Backport of " +
      "#34601 (backend.destroyProgram / destroyPipeline delete the shader and program) and a reduced " +
      "#34610: the VAO cache stays keyed by attribute ids, each render object holds one counted " +
      "reference, and the VAO is deleted when the last holder is released (render object dispose or " +
      "geometry dispose). Compute VAOs are pinned, never released.",
    upstream: "fixed on dev for r187 (#34601 program/pipeline, #34610 VAO, issue #34597); npm latest is still 0.186.1",
    edits: [
      {
        find: "\tdestroyProgram( /*program*/ ) { }\n",
        replace: "\tdestroyProgram( /*program*/ ) { }\n\n\t/**\n\t * Destroys the given pipeline.\n\t *\n\t * @abstract\n\t * @param {Pipeline} pipeline - The pipeline.\n\t */\n\tdestroyPipeline( /*pipeline*/ ) { }\n\n\t/**\n\t * Releases the vertex state of the given render object.\n\t *\n\t * @abstract\n\t * @param {RenderObject} renderObject - The render object.\n\t */\n\tdeleteVertexState( /*renderObject*/ ) { }\n",
        count: 1,
      },
      {
        find: "\t_releasePipeline( pipeline ) {\n\n\t\tthis.caches.delete( pipeline.cacheKey );\n",
        replace: "\t_releasePipeline( pipeline ) {\n\n\t\tthis.backend.destroyPipeline( pipeline );\n\n\t\tthis.caches.delete( pipeline.cacheKey );\n",
        count: 1,
      },
      {
        find: "\t\tthis.programs[ stage ].delete( code );\n\n\t\tthis.info.destroyProgram( program );\n",
        replace: "\t\tthis.programs[ stage ].delete( code );\n\n\t\tthis.backend.destroyProgram( program );\n\t\tthis.info.destroyProgram( program );\n",
        count: 1,
      },
      {
        find: "\t\trenderObject.onDispose = () => {\n\n\t\t\tthis.pipelines.delete( renderObject );\n",
        replace: "\t\trenderObject.onDispose = () => {\n\n\t\t\tthis.pipelines.backend.deleteVertexState( renderObject );\n\t\t\tthis.pipelines.delete( renderObject );\n",
        count: 1,
      },
      {
        find: "\t\t\t// clear geometry cache attributes\n\n\t\t\tthis.attributes = null;\n",
        replace: "\t\t\tthis.renderer.backend.deleteVertexState( this );\n\n\t\t\t// clear geometry cache attributes\n\n\t\t\tthis.attributes = null;\n",
        count: 1,
      },
      {
        find: "\t\tthis.vaoCache = {};\n",
        replace: "\t\tthis.vaoCache = {};\n\t\tthis.vaoUsed = {};\n",
        count: 1,
      },
      {
        find: "\t\tif ( vaoGPU === undefined ) {\n\n\t\t\tthis.vaoCache[ vaoKey ] = this._createVao( attributes );\n",
        replace: "\t\tif ( vaoGPU === undefined ) {\n\n\t\t\tthis.vaoCache[ vaoKey ] = this._createVao( attributes );\n\t\t\tthis.vaoUsed[ vaoKey ] = ( this.vaoUsed[ vaoKey ] || 0 ) + 1; // compute VAOs are pinned\n",
        count: 1,
      },
      {
        find: "\t\t\tvaoGPU = this.vaoCache[ vaoKey ];\n\n\t\t\tif ( vaoGPU === undefined ) {\n\n\t\t\t\tvaoGPU = this._createVao( attributes );\n\n\t\t\t\tthis.vaoCache[ vaoKey ] = vaoGPU;\n\t\t\t\tattributesData.vaoGPU = vaoGPU;\n\n\t\t\t}\n",
        replace: "\t\t\tvaoGPU = this.vaoCache[ vaoKey ];\n\n\t\t\tif ( vaoGPU === undefined ) {\n\n\t\t\t\tvaoGPU = this._createVao( attributes );\n\n\t\t\t\tthis.vaoCache[ vaoKey ] = vaoGPU;\n\n\t\t\t}\n\n\t\t\tattributesData.vaoGPU = vaoGPU;\n\t\t\tattributesData.vaoKey = vaoKey;\n\t\t\tthis.vaoUsed[ vaoKey ] = ( this.vaoUsed[ vaoKey ] || 0 ) + 1;\n",
        count: 1,
      },
      {
        find: "\tdestroyProgram( program ) {\n\n\t\tthis.delete( program );\n\n\t}\n\n\t/**\n\t * Creates a render pipeline for the given render object.\n",
        replace: "\tdestroyProgram( program ) {\n\n\t\tconst data = this.get( program );\n\n\t\tif ( data.shaderGPU !== undefined ) this.gl.deleteShader( data.shaderGPU );\n\n\t\tthis.delete( program );\n\n\t}\n\n\t/**\n\t * Destroys the given pipeline.\n\t *\n\t * @param {Pipeline} pipeline - The pipeline.\n\t */\n\tdestroyPipeline( pipeline ) {\n\n\t\tconst data = this.get( pipeline );\n\n\t\tif ( data.programGPU !== undefined ) this.gl.deleteProgram( data.programGPU );\n\n\t\tthis.delete( pipeline );\n\n\t}\n\n\t/**\n\t * Releases the VAO reference held by the given render object; the VAO is\n\t * deleted once its last holder let go.\n\t *\n\t * @param {RenderObject} renderObject - The render object.\n\t */\n\tdeleteVertexState( renderObject ) {\n\n\t\tconst attributes = renderObject.attributes;\n\n\t\tif ( attributes === null || this.has( attributes ) === false ) return;\n\n\t\tconst attributesData = this.get( attributes );\n\t\tconst vaoKey = attributesData.vaoKey;\n\n\t\tif ( vaoKey === undefined ) return;\n\n\t\tattributesData.vaoKey = undefined;\n\t\tattributesData.vaoGPU = undefined;\n\n\t\tif ( -- this.vaoUsed[ vaoKey ] > 0 ) return;\n\n\t\tconst vaoGPU = this.vaoCache[ vaoKey ];\n\n\t\tdelete this.vaoUsed[ vaoKey ];\n\t\tdelete this.vaoCache[ vaoKey ];\n\n\t\tif ( this.state.currentVAO === vaoGPU ) this.state.resetVertexState();\n\n\t\tthis.gl.deleteVertexArray( vaoGPU );\n\n\t}\n\n\t/**\n\t * Creates a render pipeline for the given render object.\n",
        count: 1,
      },
    ],
  },
];

/** Retired patches, kept so the canary can assert the UPSTREAM form is present. */
export const RETIRED = [
  { id: 2, title: "#33952 bind-group leak", upstream: "PR #33954, released in r186" },
  { id: 3, title: "#34405 polygonOffset missing from the WebGPU pipeline key", upstream: "PR #34406, released in r186" },
];
