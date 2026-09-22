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
];

/** Retired patches, kept so the canary can assert the UPSTREAM form is present. */
export const RETIRED = [
  { id: 2, title: "#33952 bind-group leak", upstream: "PR #33954, released in r186" },
  { id: 3, title: "#34405 polygonOffset missing from the WebGPU pipeline key", upstream: "PR #34406, released in r186" },
];
