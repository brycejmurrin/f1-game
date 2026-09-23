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
    id: 7,
    title: "lazy render pipelines compile SYNCHRONOUSLY on first draw — the mid-race hitch",
    file: "build/three.webgpu.js",
    why: "Pipelines.getForRender() calls the backend with promises === null on every path " +
      "except Renderer.compileAsync(), and WebGPUPipelineUtils.createRenderPipeline() then " +
      "calls device.createRenderPipeline — the blocking form — so the first draw of any " +
      "(material, geometry layout, render context) the one-time warm never saw stalls the " +
      "main thread for the compile. Measured on macos-latest Metal (gpu-census 198/199): " +
      "25-26 synchronous compiles in the race window on the three.js/WebGPU leg against 1 on " +
      "WGX, and the spike counts track them one for one — 10-16 frames of 258-556 ms " +
      "against WGX's max of 11.5 ms. The warm accounts for the 23 async ones; the rest are " +
      "programs it never built. Fix: always take the createRenderPipelineAsync branch, and " +
      "have draw() skip an object whose pipeline has not landed yet — it draws a frame or two " +
      "late instead of stalling every frame. The sync branch stays reachable behind " +
      "globalThis.__apexSyncPipelines === true so the census can A/B it.",
    upstream: "unfixed on dev as of r186: only compileAsync() passes a promises array (issue draft in docs/notes/UPSTREAM-THREE-ISSUES.md)",
    edits: [
      {
        find: "\t\tif ( promises === null ) {\n\n\t\t\tpipelineData.pipeline = device.createRenderPipeline( _renderPipelineDescriptor );",
        replace: "\t\tif ( promises === null && globalThis.__apexSyncPipelines === true ) {\n\n\t\t\tpipelineData.pipeline = device.createRenderPipeline( _renderPipelineDescriptor );",
        count: 1,
      },
      {
        find: "\t\t\tpromises.push( p );\n\n\t\t}\n\n\t}\n\n\t/**\n\t * Creates GPU render bundle encoder",
        replace: "\t\t\tif ( promises !== null ) promises.push( p );\n\n\t\t}\n\n\t}\n\n\t/**\n\t * Creates GPU render bundle encoder",
        count: 1,
      },
      {
        find: "\t\tconst pipelineGPU = pipelineData.pipeline;\n\n\t\t// Skip if pipeline has error\n\t\tif ( pipelineData.error === true ) return;\n",
        replace: "\t\tconst pipelineGPU = pipelineData.pipeline;\n\n\t\t// Skip if pipeline has error\n\t\tif ( pipelineData.error === true ) return;\n\n\t\t// Apex patch 7: the pipeline is still compiling asynchronously — draw this object next frame.\n\t\tif ( pipelineGPU === undefined ) return;\n",
        count: 1,
      },
    ],
  },
  {
    id: 8,
    title: "TSL -> WGSL codegen runs synchronously inside render() on a node-builder cache miss — the mid-race hitch",
    file: "build/three.webgpu.js",
    why: "Renderer._renderObjectDirect() calls _nodes.updateBefore() before anything else, and " +
      "that calls renderObject.getNodeBuilderState(), which on a cache miss runs NodeBuilder.build() " +
      "— the whole TSL graph generated into WGSL — synchronously, inside the frame. gpu-census 202 on " +
      "macos-latest Metal, the WebGPU leg, race window: `build` is the top non-idle function at 663 ms " +
      "and its traversal helpers add ~1,010 ms — ~1.7 s of codegen, a third of all busy main-thread " +
      "time, ~35 ms per program — clustering when streamed content brings several new programs into " +
      "view on one frame (the 258-556 ms callbacks). Patch 7 moved the GPU compile off the thread and " +
      "census 201 proved that was not where the time was. three already ships the yielding half: " +
      "Nodes.getForRender( renderObject, true ) builds through NodeBuilder.buildAsync(), fills the " +
      "cache on resolve, and _renderObjectDirect already gates backend.draw on _pipelines.isReady(). " +
      "So on a cache miss outside compileAsync, start the yielding build and return: the object is " +
      "skipped until its state exists, then takes the ordinary cached path. Never while a render " +
      "bundle is being recorded (a skipped object would be omitted from the bundle for good); the " +
      "sync path stays reachable behind globalThis.__apexSyncCodegen === true for an A/B. " +
      "The build STARTS from a yielded task, not at the call site: an async function runs " +
      "synchronously to its first await, and buildAsync() runs prebuild() -- the material's " +
      "whole setup traversal, the heaviest part -- before its first yieldToMain(). gpu-census " +
      "210 (driven window, real Metal) put 17% of the time inside the >= 100 ms callbacks in " +
      "build/getChildren under setup, reached from _renderObjectDirect. yieldToMain is " +
      "imported into three.webgpu.js already. The deferred build holds the renderer state of the " +
      "requesting pass -- render target, MRT, cube face, mip level -- for its synchronous part " +
      "(prebuild, the setup stage reads them): gpu-census 211 ran the first deferral and drew " +
      "black on WebGPU (luma 3.2, WebGL2 52) because between frames the render target is null " +
      "and the MRT unset, so every lit material built the wrong variant or threw. A failed " +
      "build warns (console.warn, three times at most) rather than retrying in silence.",
    upstream: "unfixed on dev as of r186: buildAsync() is reachable only through compileAsync() (issue draft in docs/notes/UPSTREAM-THREE-ISSUES.md 5)",
    edits: [
      {
        find: "\t\t\trenderObject.bundle = this._currentRenderBundle.bundleGroup;\n\n\t\t}\n\n\t\t//\n\n\t\tconst refreshType = this._nodes.needsRefresh( renderObject );\n",
        replace: "\t\t\trenderObject.bundle = this._currentRenderBundle.bundleGroup;\n\n\t\t}\n\n\t\t// Apex patch 8: a node-builder cache MISS here would generate this object\'s WGSL synchronously\n\t\t// inside the frame. Build it yielding instead and draw the object once its state exists.\n\t\tif ( globalThis.__apexSyncCodegen !== true && this._compilationPromises === null && this._currentRenderBundle === null && renderObject._nodeBuilderState === null ) {\n\n\t\t\tif ( this._nodes.nodeBuilderCache.get( this._nodes.getForRenderCacheKey( renderObject ) ) === undefined ) {\n\n\t\t\t\tconst pending = this._nodes.get( renderObject );\n\n\t\t\t\tif ( pending.apexBuilding !== true ) {\n\n\t\t\t\t\tpending.apexBuilding = true;\n\t\t\t\t\tconst done = () => { pending.apexBuilding = false; };\n\t\t\t\t\t// The material setup reads the renderer\'s render target and MRT as it builds; a task runs\n\t\t\t\t\t// between frames where they are not this pass\'s. Snapshot them here and hold them for the\n\t\t\t\t\t// synchronous part of the build (prebuild: the setup stage), then put them back.\n\t\t\t\t\tconst apexRT = this._renderTarget, apexMRT = this._mrt, apexFace = this._activeCubeFace, apexMip = this._activeMipmapLevel;\n\t\t\t\t\tconst apexFail = ( e ) => { done(); globalThis.__apexCodegenFailures = ( globalThis.__apexCodegenFailures || 0 ) + 1; if ( globalThis.__apexCodegenFailures <= 3 ) console.warn( \'Apex patch 8: async node build failed\', e ); };\n\t\t\t\t\tyieldToMain().then( () => {\n\n\t\t\t\t\t\tconst prevRT = this._renderTarget, prevMRT = this._mrt, prevFace = this._activeCubeFace, prevMip = this._activeMipmapLevel;\n\t\t\t\t\t\tthis._renderTarget = apexRT; this._mrt = apexMRT; this._activeCubeFace = apexFace; this._activeMipmapLevel = apexMip;\n\t\t\t\t\t\ttry { return this._nodes.getForRender( renderObject, true ); }\n\t\t\t\t\t\tfinally { this._renderTarget = prevRT; this._mrt = prevMRT; this._activeCubeFace = prevFace; this._activeMipmapLevel = prevMip; }\n\n\t\t\t\t\t} ).then( done, apexFail );\n\n\t\t\t\t}\n\n\t\t\t\treturn;\n\n\t\t\t}\n\n\t\t}\n\n\t\t//\n\n\t\tconst refreshType = this._nodes.needsRefresh( renderObject );\n",
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
