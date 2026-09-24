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
];

/** Retired patches, kept so the canary can assert the UPSTREAM form is present. */
export const RETIRED = [
  { id: 2, title: "#33952 bind-group leak", upstream: "PR #33954, released in r186" },
  { id: 3, title: "#34405 polygonOffset missing from the WebGPU pipeline key", upstream: "PR #34406, released in r186" },
];
