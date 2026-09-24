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
];

/** Retired patches, kept so the canary can assert the UPSTREAM form is present. */
export const RETIRED = [
  { id: 2, title: "#33952 bind-group leak", upstream: "PR #33954, released in r186" },
  { id: 3, title: "#34405 polygonOffset missing from the WebGPU pipeline key", upstream: "PR #34406, released in r186" },
];
