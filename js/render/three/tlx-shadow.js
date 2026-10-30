/* Apex 26 — TLXShaders.shadowSys: the three-map shadow subsystem for the TLX
 * backend (M4). The three.js sibling of js/render/glx/shadow.js: a static SUN
 * map, a dynamic CAR map and a nearest-lamp map, sized off device tier. */
"use strict";

(function () {
  // The smallest InstancedMesh capacity three draws from instance-rate
  // attributes instead of a uniform block named after the node (see the note
  // at iByBatch below): max(n, floor(limit / 64) + 1). Shared by the shadow
  // casters here and TLX's lit instanced batches, which have the same
  // one-program-per-object property. Cached per renderer.
  const _uboCap = new WeakMap();
  // A/B and escape hatch: apex26.tlxInstPad=0 allocates at the real count
  // (the per-object programs come back). Census 224 lost the WebGL context on
  // three's WebGL2 control leg with the pad in; this is how one commit is
  // measured both ways on the same runner.
  let _padOff = null;
  function uboInstCap(renderer, n) {
    if (_padOff === null) {
      try { _padOff = localStorage.getItem("apex26.tlxInstPad") === "0"; } catch (_) { _padOff = false; }
    }
    if (_padOff) return n | 0;
    let cap = _uboCap.get(renderer);
    if (!cap) {
      let lim = 65536;   // WebGPU's default maxUniformBufferBindingSize (TLX requests no limits)
      try {
        const caps = renderer.backend && renderer.backend.capabilities;
        const l = caps && caps.getUniformBufferLimit ? caps.getUniformBufferLimit() : 0;
        if (l > 0) lim = l;
      } catch (_) { /* no capabilities: keep the WebGPU default */ }
      cap = Math.floor(lim / 64) + 1;
      _uboCap.set(renderer, cap);
    }
    return Math.max(n | 0, cap);
  }

  // Sun map edge: phone 1024, software GL 512, desktop 2048. ctx.sunSize > 0 overrides it
  // (TLX's B8 lab tier, ?lab=tlxLite on three's WebGL2 leg of a phone, passes 512).
  function sunMapSize(ctx) {
    if (ctx.sunSize > 0) return ctx.sunSize | 0;
    return ctx.isMobile ? 1024 : (ctx.softwareGL ? 512 : 2048);   // the pre-B8 rule, exactly
  }

  function shadowSys(THREE, TSL, ctx) {
    const renderer = ctx.renderer;
    // Keyed on the DEVICE, not the memory tier — js/render/glx/shadow.js's rule,
    // for its reasons: GRAPHICS: HIGH on a phone must not 4x the snap-cache
    // redraw cost (terrain + road + the whole city into the map, roughly every
    // 10 m of travel — that redraw frame IS the periodic HIGH-tier stall), and
    // the car/lamp maps are per-FRAME depth passes, a fill cost that is "the
    // HIGH-tier lag, not a memory cap". js/perf/governor.js draws the same line
    // (its crash sentinel gates on isMobile, "NOT just the memory-safe
    // STANDARD tier"). These three keyed on mobileTier instead, so a phone that
    // opted into GRAPHICS: HIGH took a 2048² sun map plus two per-frame depth
    // passes that GLX refuses on EVERY phone — i.e. the config most likely to
    // be jetsam-killed got the allocations GLX withholds from it.
    // mobileTier is kept as the fallback for a caller that predates
    // ctx.isMobile: MOBILE_TIER implies IS_MOBILE (js/render/glx/glx.js), so the
    // OR can only ever be conservative, never wrong.
    const isMobile = !!ctx.isMobile || !!ctx.mobileTier;
    // Software GL (SwiftShader / llvmpipe / WARP) is fill-bound: a 2048² sun
    // map plus a 1024² car map is ~5 M depth writes per armed frame, and a
    // Monza present on CI's headless-shell spent minutes in the GPU process
    // (measured 2026-08-17: M4/M5/M9 hit the 360 s test budget with the GPU
    // at 387% and a defunct renderer). Keep the three maps ALLOCATED so
    // carShadowState().enabled stays true — only the texel count drops.
    // Real GPUs keep the authored sizes. PCSS blocker skips software GL
    // (tlxForceGL keeps the fixed-R look); desktop WebGL2 uses the R16F
    // color path. SUN_SIZE/BLOCKER_SIZE staying 1:1 here is fine.
    const softwareGL = !!ctx.softwareGL;

    const SUN_SIZE = sunMapSize(ctx);   // 1024² saves 12 MB on every phone (GLX parity)
    const CAR_SIZE = softwareGL ? 256 : 1024;                      // dynamic car-only map (true desktop only)
    const LAMP_SIZE = softwareGL ? 256 : 512;                      // nearest-floodlight spot map (true desktop only)

    const S = {
      SIZE: SUN_SIZE,
      enabled: false,
      lightVP: new Float32Array(16),
      pcssEnabled: false,        // true once the WebGPU blocker map builds (header note)
      colorDiscards: 0,          // A-P2: WebGL2 depth passes whose unread R8 colour store was dropped
      // True only between a Begin that actually opened a pass and its End —
      // casts gate on THIS, not enabled: on a phone the car/lamp maps
      // are never created, so their Begins no-op but game.js still issues the
      // caster draws, which must be silently swallowed (GLX S.depthPassOn).
      depthPassOn: false,
      castCullVP: null,
      carEnabled: false, carLightVP: new Float32Array(16),
      carBoxScale: 1,            // cBox / default-42m — see carShadowBegin (GLX parity)
      carArmed: false,           // set by carShadowBegin, cleared each present()
      carArms: 0,                // lifetime Begin count (debug introspection)
      lampEnabled: false, lampLightVP: new Float32Array(16),
      lampArmed: false,          // set by lampShadowBegin, cleared each present()
      lampIdx: -1,               // frame.lights record index of the mapped lamp
      lampArms: 0,
      lampStaticBuilds: 0,       // L1: static-props map renders (≈ lamp changes)
      lampCarOnly: 0,            // L1: car-only rebuilds served from the copy
    };

    /** Depth target: a compare-mode DepthTexture the lit pass samples.
     * three r187 (#34782, both backends) builds a depth-only target with
     * `count: 0`, so a non-PCSS map carries no colour attachment; on r186 it
     * was an R8 one (1 B/px) whose store discardColor / apexDiscardColor
     * dropped (docs/notes/TLX-SHADOW-DEPTHONLY-R187-2026-10-28.md, #2649). Only the
     * desktop-WebGL2 sun's R32F PCSS copy (hdrColor) is ever read as colour.
     * LinearFilter + LessEqualCompare = hardware 2x2 PCF per tap on ES 3.0,
     * exactly GLX's setup (js/render/glx/shadow.js). */
    function makeDepthTarget(size, name, hdrColor, floatDepth) {
      const depthTexture = new THREE.DepthTexture(size, size);
      // depth32float: the one depth format WebGPU can copyTextureToTexture
      // (depth24plus cannot); WebGL blits depth between identical formats.
      if (floatDepth) depthTexture.type = THREE.FloatType;
      depthTexture.name = name;
      depthTexture.compareFunction = THREE.LessEqualCompare;
      depthTexture.minFilter = THREE.LinearFilter;
      depthTexture.magFilter = THREE.LinearFilter;
      // wrap defaults to ClampToEdge — matches GLX
      // r187 (#34782): depth-only. The REVISION gate keeps an older three (count:0
      // undefined there) on the R8 attachment. PCSS still needs colour.
      if (!hdrColor && +(THREE.REVISION || 0) >= 187) {
        return new THREE.RenderTarget(size, size, { depthTexture, count: 0 });
      }
      const opts = { depthTexture };
      if (hdrColor) {
        // R32F: the blocker reads this copy of the depth, and a half float
        // steps 2^-11 in [0.5,1) — a ~0.28 m PCSS error at a 570 m span.
        opts.type = THREE.FloatType;
        opts.format = THREE.RedFormat;
      } else {
        opts.type = THREE.UnsignedByteType;
        opts.format = THREE.RedFormat;
      }
      const rt = new THREE.RenderTarget(size, size, opts);
      rt.texture.name = name + ".color";
      rt.texture.generateMipmaps = false;
      // A-P2W (vendored patch 17): WebGPU never writes this colour (depthMat.colorWrite) and
      // its blocker reads the depth texture, so the R8 store is never fetched — discard it
      // on every pass. apex26.tlxTagDiscard="0" keeps it (the WebGL2 leg's A-P2 is endPass).
      if (renderer.backend && renderer.backend.isWebGPUBackend && _colorDiscardOn()) rt.apexDiscardColor = 1;
      return rt;
    }
    function _colorDiscardOn() {
      try { return localStorage.getItem("apex26.tlxTagDiscard") !== "0"; } catch (_) { return true; }
    }

    const isWebGPU = !!(renderer.backend && renderer.backend.isWebGPUBackend);
    // Phones stay on the fixed-R look (GLX mobile compromise). Software GL
    // is fill-bound and never builds the blocker (tlxForceGL path).
    const colorPcss = !isWebGPU && !isMobile && !softwareGL && !!TSL.depth;
    const sunRT = makeDepthTarget(SUN_SIZE, "TLXSunShadow", colorPcss);
    const carRT = isMobile ? null : makeDepthTarget(CAR_SIZE, "TLXCarShadow");
    // LAMP STATIC MAP (TLX-PERF-PLAN L1). Nearly every night lamp rebuild is
    // car-only — the player moved 0.25 m under the same lamp — yet each one
    // re-culled, re-packed, re-uploaded and redrew every static prop. The props
    // now render into lampStaticRT when the LAMP changes; a car-only rebuild
    // copies that depth into lampRT and draws only the cars on top. lampRT stays
    // the sampled map, so no shader, sampler or backend-parity change.
    // AUTO = on, both backends (phones excluded below). three's WebGL
    // copyTextureToTexture saves and restores five UNPACK_* states through
    // WebGLState.getParameter, which calls gl.getParameter only for a key its
    // cache has never held; in Chrome that read is a synchronous GPU-process
    // round trip, and census 289 (real Metal, WebGL2 leg) spent 2 s of spike
    // frames in the first one behind the queued shader links. seedUnpackCache
    // writes the five keys at their GL defaults through WebGLState.pixelStorei
    // (it fills the cache with a write, no read), so no copy ever reads GL; if
    // the seed cannot run, AUTO stays off on WebGL. Only resetState() empties
    // that cache, and nothing calls it (a context restore reloads the page).
    // apex26.tlxLampStatic=0 forces the full rebuild, =1 forces on.
    function seedUnpackCache() {
      try {
        const be = renderer.backend, st = be && be.state, gl = be && be.gl;
        if (!gl || !st || typeof st.pixelStorei !== "function" || !st.parameters) return false;
        const keys = [gl.UNPACK_ROW_LENGTH, gl.UNPACK_IMAGE_HEIGHT, gl.UNPACK_SKIP_PIXELS, gl.UNPACK_SKIP_ROWS, gl.UNPACK_SKIP_IMAGES];
        for (let i = 0; i < keys.length; i++) st.pixelStorei(keys[i], 0);
        return keys.every((k) => st.parameters[k] === 0);
      } catch (_) { return false; }
    }
    let lampStaticOn = true, lampStaticForced = false;
    try {
      const v = localStorage.getItem("apex26.tlxLampStatic");
      if (v === "0" || v === "1") { lampStaticOn = v === "1"; lampStaticForced = true; }
    } catch (_) { /* no storage: AUTO */ }
    if (isMobile || typeof renderer.copyTextureToTexture !== "function") lampStaticOn = false;
    if (lampStaticOn && !isWebGPU && !seedUnpackCache() && !lampStaticForced) lampStaticOn = false;
    const lampRT = isMobile ? null : makeDepthTarget(LAMP_SIZE, "TLXLampShadow", false, lampStaticOn);
    const lampStaticRT = lampStaticOn ? makeDepthTarget(LAMP_SIZE, "TLXLampStatic", false, true) : null;
    const _lampStaticVP = new Float32Array(16);
    let _lampStaticValid = false, _lampRendered = false;
    S.enabled = !!sunRT;
    S.carEnabled = !!carRT;
    S.lampEnabled = !!lampRT;
    // #2649 counted oracle: colour attachment bytes of the phone sun map.
    // r187 depth-only: 0 (r186 carried R8 at SUN_SIZE², 1 B/px). PCSS (desktop) keeps R32F.
    S.depthOnly = !!(sunRT && +(THREE.REVISION || 0) >= 187 && !colorPcss);
    S.sunColorBytes = !sunRT ? 0 : S.depthOnly ? 0 : SUN_SIZE * SUN_SIZE * (colorPcss ? 4 : 1);

    // PCSS blocker map (header note): 512² R32F, the MIN over each dest
    // texel's whole k x k source footprint (k = SUN_SIZE / 512: 16 texels at
    // 2048 — the old lo/hi pair read 4 of them and missed thin casters).
    // WebGPU: textureLoad the compare-mode depth texture (no sampler).
    // Desktop WebGL2: textureLoad the R32F color attachment the sun pass
    // writes TSL.depth into. Guarded: any construction failure leaves the
    // fixed-R look.
    // Phones never build it, on EITHER leg: colorPcss above already
    // excludes them, but the WebGPU leg did not — a WebGPU phone
    // (Safari 26, where WebGPU is default-on) took the 512² R32F target,
    // the extra pass and PCSS sampling that GLX withholds from every
    // phone, against the fixed-R phone rule at colorPcss and §2q's
    // accounting (the shadow pass is already 40.4 MB of TLX's phone
    // excess, and jetsam headroom is the phone constraint).
    const BLOCKER_SIZE = 512;
    let blockerRT = null, blockerQuad = null;
    if (sunRT && !isMobile && (isWebGPU || colorPcss)) {
      try {
        blockerRT = new THREE.RenderTarget(BLOCKER_SIZE, BLOCKER_SIZE, {
          format: THREE.RedFormat, type: THREE.FloatType,
          depthBuffer: false, generateMipmaps: false,
          minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
        });
        blockerRT.texture.name = "TLXSunBlocker";
        const bmat = new THREE.MeshBasicNodeMaterial();
        bmat.fog = false;
        bmat.lights = false;
        bmat.customProgramCacheKey = () => colorPcss ? "tlx-blocker-gl" : "tlx-blocker";
        const k = Math.max(1, (SUN_SIZE / BLOCKER_SIZE) | 0);
        const srcTex = colorPcss ? sunRT.texture : sunRT.depthTexture;
        bmat.colorNode = TSL.Fn(() => {
          const ip = TSL.ivec2(TSL.screenCoordinate.xy).mul(TSL.int(k)).toVar();
          const tap = (x, y) => {
            const raw = TSL.textureLoad(srcTex, ip.add(TSL.ivec2(x, y)), TSL.int(0));
            return colorPcss ? raw.x : raw;
          };
          let d = tap(0, 0);
          for (let y = 0; y < k; y++) for (let x = 0; x < k; x++) if (x || y) d = TSL.min(d, tap(x, y));
          return TSL.vec4(d, 0.0, 0.0, 1.0);
        })();
        blockerQuad = new THREE.QuadMesh(bmat);
        S.pcssEnabled = true;
      } catch (e) {
        try { Log.warn("gfx", "TLX: PCSS blocker setup failed —", e); } catch (_) { /* Log absent */ }
        blockerRT = null; blockerQuad = null;
        S.pcssEnabled = false;
      }
    }

    // Depth camera: matrices set verbatim from the game's column-major
    // lightVP (proj×view combined), identity view — same manual-matrix trick
    // as tlx.js's no-track begin() path. coordinateSystem pinned so the
    // renderer's first-render sync never calls updateProjectionMatrix() and
    // clobbers the manual projection.
    const shadowCam = new THREE.PerspectiveCamera();
    shadowCam.matrixAutoUpdate = false;
    shadowCam.matrixWorldAutoUpdate = false;
    shadowCam.coordinateSystem = renderer.coordinateSystem;
    shadowCam.matrixWorld.identity();
    shadowCam.matrixWorldInverse.identity();

    // Depth-only caster material: constant-black fragment, depth is the
    // payload. DoubleSide == GLX's gl.disable(CULL_FACE) in every shadow pass
    // — back faces land in the map so contact shadows don't peter-pan.
    // NOTE: colorWrite must stay TRUE on WebGL — that backend applies the next
    // render's CLEAR under whatever glColorMask the last draw left, so a
    // colorWrite:false caster ran the main canvas clear fully masked (black
    // sky, geometry unaffected because each lit draw re-enables the mask).
    // A WebGPU clear is an attachment load op no pipeline writeMask touches,
    // so there the unread colour attachment is not written at all.
    const depthMat = new THREE.MeshBasicNodeMaterial();
    depthMat.colorNode = colorPcss ? TSL.vec4(TSL.depth, 0.0, 0.0, 1.0) : TSL.vec3(0.0);
    depthMat.colorWrite = !isWebGPU;
    depthMat.side = THREE.DoubleSide;
    depthMat.fog = false;
    depthMat.lights = false;
    depthMat.customProgramCacheKey = () => "tlx-depth";

    // A-H4 (perf hunt 4) — THE ATTRIBUTE-INSTANCED CASTER. The batch caster was a padded InstancedMesh (past the
    // UBO limit: 1025 x 64 B a batch on WebGPU) with DynamicDrawUsage, because three relays an InstancedMesh's
    // instanceMatrix into the buffer it draws ONCE PER FRAME per render object (Instance.js, the BEFORE_FRAME node
    // update): a Stream caster rewritten between the sun and lamp passes of one frame drew the earlier rows
    // (tlx-hunt4.test.mjs), and only Dynamic re-sent it per render() — the whole padded array, changed or not, on
    // every draw after a pass's first of the frame (~2.1 MB on a WebGPU sun-rebuild frame, hunt 4 G4). It is now a
    // plain Mesh drawing `count` instances from iM0..3 over its OWN instance-rate buffer (tlx.js _aiMesh, the prop
    // batches' path since hunt 3 A2). A geometry attribute is version-checked at EVERY render() that draws it
    // (Geometries.updateForRender), never relayed per frame, so a rewrite before the lamp pass reaches the lamp
    // pass by construction; StreamDrawUsage uploads exactly the rows a cast wrote (the range below) and nothing on
    // a render that wrote none. No UBO pad: the program text names no object (the attributes are read by NAME),
    // so every caster of a vertex layout still shares one depth program, at the batch's real instance count.
    // Depth is identical by construction: the same mat4 x positionLocal as three's instance step (_aiInstance is
    // r186 NodeMaterial.setupPosition's, verbatim in shape — tlx.js's copy), the same identity matrixWorld,
    // material state and colour node. Render objects: one per batch caster, as before. apex26.tlxCasterAttr=0
    // restores the padded Dynamic InstancedMesh exactly (the A/B handle).
    let casterAttr = true;
    try { casterAttr = localStorage.getItem("apex26.tlxCasterAttr") !== "0"; } catch (_) { /* no storage: on */ }
    const _aiInstance = TSL.Fn((_, builder) => {
      const iM = TSL.mat4(TSL.attribute("iM0", "vec4"), TSL.attribute("iM1", "vec4"),
        TSL.attribute("iM2", "vec4"), TSL.attribute("iM3", "vec4"));
      TSL.positionLocal.assign(iM.mul(TSL.positionLocal).xyz);
      if (builder.hasGeometryAttribute("normal")) TSL.normalLocal.assign(TSL.transformNormal(TSL.normalLocal, iM));
    }, "void");
    let depthMatAI = null;   // depthMat's twin on the instance step, made with the first attribute caster
    function attrDepthMat() {
      if (depthMatAI) return depthMatAI;
      const m = new THREE.MeshBasicNodeMaterial();
      m.colorNode = depthMat.colorNode;
      m.colorWrite = depthMat.colorWrite;
      m.side = depthMat.side;
      m.fog = false;
      m.lights = false;
      m.customProgramCacheKey = () => "ai-tlx-depth";
      const setup = m.setupPosition;
      m.setupPosition = function (builder) { _aiInstance(); return setup.call(this, builder); };
      return (depthMatAI = m);
    }
    // A plain Mesh whose `instanceMatrix` IS its instance-rate buffer (array, updateRanges, needsUpdate, count:
    // the surface castInstanced and tlx.js's C5 in-place shadow pack already use).
    function attrCaster(geo, n) {
      const ib = new THREE.InstancedInterleavedBuffer(new Float32Array(Math.max(1, n) * 16), 16, 1);
      ib.setUsage(THREE.StreamDrawUsage);
      for (let c = 0; c < 4; c++) geo.setAttribute("iM" + c, new THREE.InterleavedBufferAttribute(ib, 4, c * 4));
      const m = new THREE.Mesh(geo, attrDepthMat());
      m.instanceMatrix = ib; m.count = n;
      return m;
    }
    // Object disposal drops the renderer's retained RenderObject (tlx.js dropWrapper).
    function disposeCaster(m) {
      try { if (m.isInstancedMesh) m.dispose(); else m.dispatchEvent({ type: "dispose" }); } catch (_) { /* */ }
    }

    // caster scene + pooled mesh wrappers (the tlx.js draw-list pattern)
    const castScene = new THREE.Scene();
    castScene.matrixWorldAutoUpdate = false;
    // ONE SLOT POOL PER TARGET (sun, car, each lamp), not one shared pool. With
    // one pool, slot i held the sun pass's chunk k, then the car pass's car
    // part, then the lamp pass's — at night the car and lamp passes alternate
    // every frame, so every used slot changed .geometry every pass and three
    // re-ran setGeometry on its RenderObject (attribute rescan, pipeline
    // recheck) each time; each short car pass also parked the whole pool the
    // last sun rebuild had grown. Per target, a slot keeps its caster from one
    // pass of that kind to the next, a pass hides only what the previous pass
    // showed, and parks only the slots it stopped using.
    const pools = new Map();   // target -> { pool, used, prevUsed }
    let cur = null, shown = null;
    let pool = [], used = 0;   // the open pass's pool (aliases cur)
    let target = null;    // the pass's render target while open
    let _passKeepsDepth = false;   // L1: the open pass draws onto copied depth (no clear)
    let _passOpen = null;          // the pool a begun-but-not-ended pass drew into (a throw skipped endPass)
    let _lastPassOk = false;       // endPass's own render succeeded (not the sticky S.enabled)
    // Parked wrappers (index >= used after a pass) point at this instead of
    // their last caster: a hidden Mesh still REFERENCES its geometry, so after
    // a track switch the previous track's chunk geometries would stay alive in
    // every slot the new track did not refill. An attribute-less geometry is never
    // rendered (the wrapper is invisible) and costs nothing.
    const parkedGeo = new THREE.BufferGeometry();
    // THE PASS ROOT (tlx.js R6, applied to castScene). castScene holds every
    // slot of every target's pool plus every keyed batch caster, and three's
    // projectObject visits each child of every renderer.render(castScene) —
    // hidden or not — so the per-frame car pass walked the sun and lamp pools
    // the last rebuilds grew. endPass hands three exactly what the pass cast
    // (pool[0..used) + iCast) and restores the full list after the render, so
    // add/remove, the warms (showAllCasters) and prime() still see everything.
    // apex26.tlxPoolRoot=0 (the R6 knob) renders the full list again.
    let _passRoot = true;
    try { _passRoot = localStorage.getItem("apex26.tlxPoolRoot") !== "0"; } catch (_) { /* no storage: on */ }
    const _passKids = [];

    function cast(mesh /* {__tlx, geo} */, model /* column-major mat4 */) {
      if (!S.depthPassOn || !mesh || !mesh.geo) return;
      let m = pool[used];
      if (!m) {
        m = new THREE.Mesh(mesh.geo, depthMat);
        m.matrixAutoUpdate = false;
        m.frustumCulled = false;
        pool[used] = m;
        castScene.add(m);
      }
      m.geometry = mesh.geo;
      m.__lastGeo = mesh.geo;   // parking swaps m.geometry but three's RenderObject keeps this one until the slot renders again
      if (model) m.matrix.fromArray(model); else m.matrix.identity();
      m.matrixWorld.copy(m.matrix);
      m.visible = true;
      used++;
    }

    // Instanced casters (TrackGraph.batches → createInstancedBatch): ONE
    // InstancedMesh per batch, made the first time the batch is cast and kept
    // until freeInstanced() — never a slot pool. A slot pool hands slot i
    // whichever batch the cull put i-th, and swaps in a bigger InstancedMesh
    // whenever a larger batch lands there. Disposing the smaller one releases
    // its pipeline, three deletes a program whose use count reaches 0,
    // and three keys an instanced node build on the object's uuid — so the next
    // caster needing that shader rebuilt and recompiled it on the main thread,
    // inside the sun rebuild. Measured on TLX/WebGL2 (scratch churn probe, 16
    // rebuilds around montreal): 29 fresh casters, still minting at 84% of the
    // lap, and every rebuild that minted one it had to compile took 2.4–3.9 s
    // against 2–6 ms for the rest. Keyed, each batch mints once per session.
    //
    // AND SIZED PAST THE UNIFORM-BUFFER LIMIT, which is what makes the programs
    // shared. Keying alone halved the builds but not the compiles: three puts a
    // small InstancedMesh's matrices in a uniform block whose NAME is the node's
    // id and whose array length is the count (`uniform NodeBuffer_1585 { mat4
    // buffer1585[7]; }`), so every caster's shader text is unique and each one
    // is its own program — 12 programs for 13 casters on the same probe. Past
    // `16 * 4 * count > getUniformBufferLimit()` three switches to instance-rate
    // vertex attributes and the text no longer names the object, so every prop
    // caster shares one depth program. Cost: 64 B per padded instance, ~64 KB a
    // batch on WebGPU's default 64 KiB limit, and only for batches that have
    // ever entered a shadow box. `count` still limits the draw to the culled set.
    const iByBatch = new Map();   // batch -> InstancedMesh (sized past the UBO limit)
    // The caster draws a SHALLOW CLONE of the batch geometry, so each geometry has exactly ONE InstancedMesh. three
    // frees an instance attribute only through the dispose listener of the geometry whose RenderObject initialised
    // it; two meshes on one geometry stranded the second one's ~64 KB instanceMatrix buffer on every free. The clone
    // shares the vertex/index attributes (no copy) and leaves out the lit pass's `instanceTint` (depth never reads it).
    function casterGeo(src) {
      const g = new THREE.BufferGeometry();
      if (src.index) g.setIndex(src.index);
      // ...nor the lit batch's own instance stream (iM0..3, tlx.js A2): the caster is a real InstancedMesh.
      for (const k in src.attributes) if (k !== "instanceTint" && !/^iM[0-3]$/.test(k)) g.setAttribute(k, src.attributes[k]);
      g.drawRange.start = src.drawRange.start; g.drawRange.count = src.drawRange.count;
      for (let i = 0; i < src.groups.length; i++) g.addGroup(src.groups[i].start, src.groups[i].count, src.groups[i].materialIndex);
      g.userData.casterOf = src;
      return g;
    }
    function freeCasterGeo(m) {
      try { m.geometry.dispose(); } catch (_) { /* the clone releases its own instanceMatrix */ }
    }
    const iCast = [];             // this pass's casts, hidden again at the next Begin
    // M-12: phones skip only the shadow caster UBO pad (lit batches keep it).
    const sharedInstCap = (n) => (!casterAttr && isMobile) ? (n | 0) : uboInstCap(renderer, n);
    // Scratch for setMatrixAt — never allocate per cast (was per-instance GC).
    const _castMat = new THREE.Matrix4();
    function castInstanced(batch, count) {
      if (!S.depthPassOn || !batch || !batch.geo) return;
      const culled = count !== undefined;
      const n = culled ? Math.min(count | 0, batch.instances | 0) : (batch.instances | 0);
      if (!(n > 0)) return;
      let m = iByBatch.get(batch);
      if (!m || m.geometry.userData.casterOf !== batch.geo || (!m.isInstancedMesh && m.instanceMatrix.count < (batch.instances | 0))) {
        if (m) { const ix = iCast.indexOf(m); if (ix >= 0) iCast.splice(ix, 1); castScene.remove(m); disposeCaster(m); freeCasterGeo(m); }
        if (casterAttr) {
          // A-H4: a plain Mesh on Stream, sized at the batch, no pad (the note at attrCaster).
          m = attrCaster(casterGeo(batch.geo), Math.max(1, batch.instances | 0));
        } else {
          m = new THREE.InstancedMesh(casterGeo(batch.geo), depthMat, sharedInstCap(batch.instances | 0));
          // DYNAMIC, not Stream (tlx.js A-H1 moved the plain-Mesh batches to Stream): three relays an
          // InstancedMesh's instanceMatrix into its draw buffer once per frame per render object, and a caster
          // is rewritten per cast — a Stream caster redrawn by the same pass after a rewrite keeps the earlier
          // rows (measured, tlx-hunt4.test.mjs). Only Dynamic re-sends it per render(); the price is the whole
          // padded array on every draw after a pass's first of the frame (apex26.tlxCasterAttr=0 only, A-H4).
          m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        }
        m.matrixAutoUpdate = false;
        m.frustumCulled = false;
        // Do not set instanceColor. The lit batch already carries an
        // InstancedBufferAttribute `color` on the shared geometry; a second
        // instance-rate colour slot is what Dawn rejected at slot 5
        // (mcp-probe 2026-08-18). Depth only needs instanceMatrix.
        iByBatch.set(batch, m);
        castScene.add(m);
      }
      const dst = m.instanceMatrix.array;
      // C5: tlx.js cullInstances packs the next shadow cull of this batch
      // straight into this array; when it already did (src === dst), no copy.
      batch._shCasterArr = dst;
      const src = culled && batch.packMatrices ? batch.packMatrices : batch.srcMatrices;
      if (src === dst) { /* packed in place by the shadow cull */ } else if (src && src.length >= n * 16) {
        for (let i = 0, o = 0; i < n; i++, o += 16) {
          for (let k = 0; k < 16; k++) dst[o + k] = src[o + k];
        }
      } else if (batch.imesh && batch.imesh.instanceMatrix) {
        // imesh may be camera-repacked — only safe when visible === instances.
        const isrc = batch.imesh.instanceMatrix.array;
        const copyN = (batch.visible === undefined || batch.visible >= n) ? n
          : (batch.visible | 0);
        for (let i = 0, o = 0; i < copyN; i++, o += 16) {
          for (let k = 0; k < 16; k++) dst[o + k] = isrc[o + k];
        }
      } else if (batch.packMatrices) {
        const psrc = batch.packMatrices;
        for (let i = 0; i < n; i++) {
          _castMat.fromArray(psrc, i * 16);
          if (m.isInstancedMesh) m.setMatrixAt(i, _castMat); else _castMat.toArray(dst, i * 16);   // setMatrixAt's own write
        }
      }
      // Upload only the rows written: the padding above the UBO limit is never
      // drawn, so a full 64 KB write per batch per rebuild would be pure cost.
      // (The setMatrixAt branch never flagged its upload at all before this.)
      const im = m.instanceMatrix;
      // One cached range per attribute, re-pushed (addUpdateRange minted an object per batch per cast).
      const rg = im.__tlxRange || (im.__tlxRange = { start: 0, count: 0 });
      rg.count = n * 16;
      im.updateRanges.length = 0; im.updateRanges.push(rg);
      im.needsUpdate = true;
      m.count = n;
      m.matrix.identity();
      m.matrixWorld.identity();
      m.visible = true;
      iCast.push(m);
    }

    // A geometry the owner released (freeMesh / chunked free): park every slot
    // still pointing at it NOW. Slots are otherwise parked only when their
    // target's next pass runs, and after a track switch that pass cannot run
    // until the next world is built — so every chunk geometry of the old track
    // stayed reachable through a hidden caster exactly across the build peak.
    // Parking alone is not enough for a RELEASED geometry: three's render
    // object for the slot keeps the geometry it last rendered with until the
    // slot renders again, and a parked slot does not. The "dispose" event is
    // what drops that render object (tlx.js dropWrapper has the measurement);
    // the slot stays in the pool and simply builds a fresh one when next cast.
    //
    // NOT WHILE A WARM IS IN FLIGHT (tlx.js dropWrapper has the measurement): compileAsync collects (object, material)
    // pairs up front and awaits them one at a time, so a slot parked here is re-fetched by the warm with its render
    // object gone and its geometry attribute-less. Queue the geometry AND the slots that hold it;
    // flushDropped() disposes those slots on the first present after the warm settles, including a
    // slot the next pass has already retargeted (its render object can still name the freed geometry).
    const dropQ = [];   // { geo, meshes } owed a park. meshes is who held geo when it was queued:
    // a warm can outlive the free, and the next pass retargets the slot before flush, so a
    // later match on m.geometry / __lastGeo misses the render object that still names geo.
    function releaseGeometry(geo) {
      if (!geo) return;
      if (ctx.isWarming && ctx.isWarming()) {
        if (dropQ.some((e) => e.geo === geo)) return;
        const meshes = [];
        for (const pl of pools.values()) {
          for (let i = 0; i < pl.pool.length; i++) {
            const m = pl.pool[i];
            if (m.geometry === geo || (m.geometry === parkedGeo && m.__lastGeo === geo)) meshes.push(m);
          }
        }
        dropQ.push({ geo, meshes });
        return;
      }
      for (const pl of pools.values()) {
        for (let i = 0; i < pl.pool.length; i++) {
          const m = pl.pool[i];
          if (m.geometry !== geo && !(m.geometry === parkedGeo && m.__lastGeo === geo)) continue;   // a PARKED slot's RenderObject still holds __lastGeo (#2693); a re-used slot is left alone
          m.visible = false; m.geometry = parkedGeo; m.__lastGeo = null;
          try { m.dispatchEvent({ type: "dispose" }); } catch (_) { /* no render object yet */ }
        }
      }
    }
    function flushDropped() {
      if (!dropQ.length || (ctx.isWarming && ctx.isWarming())) return;
      const q = dropQ.splice(0);
      for (let i = 0; i < q.length; i++) {
        const e = q[i], meshes = e.meshes;
        // The slot may already be drawing another circuit. Dispose drops the render
        // object that still names the freed geometry; leave a live replacement in place
        // so the next cast rebuilds only that slot's render object.
        if (meshes) for (let k = 0; k < meshes.length; k++) {
          const m = meshes[k];
          if (!m) continue;
          const live = m.geometry !== e.geo && m.geometry !== parkedGeo;
          if (!live) { m.visible = false; m.geometry = parkedGeo; m.__lastGeo = null; }
          try { m.dispatchEvent({ type: "dispose" }); } catch (_) { /* no render object yet */ }
        }
        releaseGeometry(e.geo);
      }
    }
    function parkCasterForGeo(m, geo) {
      if (!m || !geo) return;
      const live = m.geometry !== geo && m.geometry !== parkedGeo && m.__lastGeo !== geo;
      if (live) {
        try { m.dispatchEvent({ type: "dispose" }); } catch (_) { /* stale render object only */ }
        return;
      }
      m.visible = false; m.geometry = parkedGeo; m.__lastGeo = null;
      try { m.dispatchEvent({ type: "dispose" }); } catch (_) { /* no render object yet */ }
    }
    function purgeCastersForGeos(freedGeos) {
      if (!freedGeos || !freedGeos.size) return;
      for (const pl of pools.values()) {
        for (let j = 0; j < pl.pool.length; j++) {
          const m = pl.pool[j];
          if (!m) continue;
          const g = m.geometry, lg = m.__lastGeo;
          if (freedGeos.has(g)) parkCasterForGeo(m, g);
          else if (lg && freedGeos.has(lg)) parkCasterForGeo(m, lg);
        }
      }
      for (let i = 0; i < iCast.length; i++) {
        const m = iCast[i];
        if (!m) continue;
        const g = m.geometry, lg = m.__lastGeo;
        if (freedGeos.has(g)) parkCasterForGeo(m, g);
        else if (lg && freedGeos.has(lg)) parkCasterForGeo(m, lg);
      }
      for (let i = 0; i < castScene.children.length; i++) {
        const m = castScene.children[i];
        if (!m || !m.isMesh) continue;
        const g = m.geometry, lg = m.__lastGeo;
        if (g && freedGeos.has(g)) parkCasterForGeo(m, g);
        else if (lg && freedGeos.has(lg)) parkCasterForGeo(m, lg);
      }
      if (_probePrev) {
        for (const m of _probePrev.meshes) {
          if (!m || !m.isMesh) continue;
          const g = m.geometry;
          if (g && freedGeos.has(g)) disposeCaster(m);
        }
      }
    }
    function flushOwnershipDropped(freedGeos) {
      if (!dropQ.length || !freedGeos || !freedGeos.size) return;
      for (let qi = dropQ.length - 1; qi >= 0; qi--) {
        const e = dropQ[qi];
        if (!freedGeos.has(e.geo)) continue;
        dropQ.splice(qi, 1);
        const meshes = e.meshes;
        if (meshes) for (let k = 0; k < meshes.length; k++) {
          const m = meshes[k];
          if (!m) continue;
          const live = m.geometry !== e.geo && m.geometry !== parkedGeo;
          if (!live) { m.visible = false; m.geometry = parkedGeo; m.__lastGeo = null; }
          try { m.dispatchEvent({ type: "dispose" }); } catch (_) { /* no render object yet */ }
        }
        for (const pl of pools.values()) {
          for (let j = 0; j < pl.pool.length; j++) {
            const m = pl.pool[j];
            if (m.geometry !== e.geo && !(m.geometry === parkedGeo && m.__lastGeo === e.geo)) continue;
            m.visible = false; m.geometry = parkedGeo; m.__lastGeo = null;
            try { m.dispatchEvent({ type: "dispose" }); } catch (_) { /* no render object yet */ }
          }
        }
      }
    }

    // The batch is gone (track switch): its caster goes with it, so a hidden
    // mesh never pins a freed geometry alive (the parkedGeo rule, per batch).
    function freeInstanced(batch) {
      if (batch) batch._shCasterArr = null;   // C5: never pack into a freed caster
      const m = batch && iByBatch.get(batch);
      if (!m) return;
      iByBatch.delete(batch);
      const ix = iCast.indexOf(m);
      if (ix >= 0) iCast.splice(ix, 1);
      castScene.remove(m);
      disposeCaster(m);
      freeCasterGeo(m);
    }

    // three WebGPU rasterises z in [0,1] and adds no remap of its own, so a GL
    // lightVP (z in [-1,1]) clipped every caster nearer than mid-depth and
    // stored raw z where the lit shaders compare 0.5z+0.5. Fold the same Z01
    // tlx.js applies to the main camera into the depth camera only (row 2 :=
    // 0.5*row2 + 0.5*row3); `dst` stays the GL matrix the shaders project with.
    const _lvpZ01 = new Float32Array(16);
    function beginPass(rt, lightVP, dst) {
      dst.set(lightVP);
      if (isWebGPU) {
        _lvpZ01.set(lightVP);
        for (let c = 0; c < 4; c++) _lvpZ01[c * 4 + 2] = 0.5 * lightVP[c * 4 + 2] + 0.5 * lightVP[c * 4 + 3];
      }
      shadowCam.projectionMatrix.fromArray(isWebGPU ? _lvpZ01 : lightVP);
      shadowCam.projectionMatrixInverse.copy(shadowCam.projectionMatrix).invert();
      target = rt;
      cur = pools.get(rt);
      if (!cur) { cur = { pool: [], used: 0, prevUsed: 0 }; pools.set(rt, cur); }
      // Another target's casters are still visible from its pass: hide them,
      // and park them (the parkedGeo rule — a target that never runs again,
      // e.g. a lamp slot after a track switch, must not pin old geometry).
      // Parking is free on the next pass: three compares a mesh's geometry
      // against the one its RenderObject last RENDERED with, and a parked,
      // hidden slot never renders, so cast() restoring the same caster is no
      // setGeometry at all.
      if (shown && shown !== cur) {
        for (let i = 0; i < shown.prevUsed; i++) { shown.pool[i].visible = false; shown.pool[i].geometry = parkedGeo; }
      }
      // A pass that threw before endPass left its casters visible and unrecorded
      // in prevUsed: hide and park that whole pool, or they draw into this target.
      if (_passOpen) {
        const op = _passOpen.pool;
        for (let i = 0; i < op.length; i++) { op[i].visible = false; op[i].geometry = parkedGeo; }
        _passOpen.prevUsed = 0;
      }
      _passOpen = cur;
      // Only lampCarsBegin (after this call) may keep depth; a flag left set by
      // a thrown car-only pass must not skip the next target's clear.
      _passKeepsDepth = false;
      pool = cur.pool; used = 0;
      // Only this pass's instanced casts may draw: hide the previous pass's.
      for (let i = 0; i < iCast.length; i++) iCast[i].visible = false;
      iCast.length = 0;
      S.depthPassOn = true;
    }

    let _invColor0 = null;
    function discardColor(rt) {
      const be = renderer.backend, gl = be && be.gl, st = be && be.state;
      if (rt.textures && rt.textures.length === 0) return false;   // depth-only (r187): no colour to drop
      if (!gl || typeof gl.invalidateFramebuffer !== "function" || !st || !st.currentBoundFramebuffers) return false;
      const d = be.get(rt), fb = st.currentBoundFramebuffers[gl.DRAW_FRAMEBUFFER];
      if (!fb || !d || !d.framebuffers || Object.values(d.framebuffers).indexOf(fb) < 0) return false;
      gl.invalidateFramebuffer(gl.DRAW_FRAMEBUFFER, _invColor0 || (_invColor0 = [gl.COLOR_ATTACHMENT0]));
      return true;
    }
    function endPass(rt) {
      S.depthPassOn = false;
      // Only the pass this End's Begin opened: after a throw between Begin and
      // End the pool is left open, and a LATER End of another kind (a phone's
      // carShadowEnd after a failed sun cast — its Begin was a no-op) would
      // otherwise render that half-filled pool into the sun map.
      if (!target || _passOpen !== cur || (rt !== undefined && rt !== target)) return;
      const wasSun = target === sunRT;
      // Park only what this target used last time and not now; slots past
      // prevUsed were parked when they went out of use.
      for (let i = used; i < cur.prevUsed; i++) { pool[i].visible = false; pool[i].geometry = parkedGeo; }
      cur.prevUsed = used; cur.used = used; shown = cur;
      const prev = renderer.getRenderTarget();
      const keepDepth = _passKeepsDepth, autoClear0 = renderer.autoClear;
      _passKeepsDepth = false; _passOpen = null; _lastPassOk = false;
      try {
        renderer.setRenderTarget(target);
        // autoClear: depth cleared per pass, like GLX's clear(DEPTH_BUFFER_BIT) —
        // except a car-only lamp pass, which draws onto the copied static depth.
        if (keepDepth) renderer.autoClear = false;
        const all = castScene.children;
        if (_passRoot) {
          _passKids.length = 0;
          for (let i = 0; i < used; i++) _passKids.push(pool[i]);
          for (let i = 0; i < iCast.length; i++) _passKids.push(iCast[i]);
          castScene.children = _passKids;
        }
        try { renderer.render(castScene, shadowCam); } finally { castScene.children = all; }
        // A-P2: only the PCSS blocker ever reads a map's colour (the sun map's, colorPcss); every
        // other R8 attachment is written for the pass and fetched by nothing. WebGL2: drop its store
        // while the FBO three just rendered into is still bound. WebGPU never writes it (colorWrite).
        if (!(wasSun && colorPcss) && discardColor(target)) S.colorDiscards++;
        if (target === lampRT) _lampRendered = true;
        _lastPassOk = true;
      } catch (e) {
        // Depth TSL compile must not escape into tick() (full-screen overlay).
        try { Log.warn("gfx", "TLX: shadow pass failed —", e); } catch (_) { /* Log absent */ }
        // Disable only the pass that failed: S.enabled is the SUN flag (the sun map,
        // god-rays), and a car/lamp throw must not freeze it.
        if (target === carRT) S.carEnabled = false;
        else if (target === lampRT || target === lampStaticRT) S.lampEnabled = false;
        else S.enabled = false;
        S.depthPassOn = false;
      } finally { renderer.autoClear = autoClear0; }
      // Blocker refresh rides the SUN pass only (GLX shadowEnd): the snap
      // cache means once per ~10 m of travel, never per frame. Own guard —
      // a blocker compile/render failure drops to the fixed-R look without
      // taking the just-rendered sun map down with it.
      if (wasSun && S.enabled && S.pcssEnabled && blockerQuad) {
        try {
          renderer.setRenderTarget(blockerRT);
          blockerQuad.render(renderer);
        } catch (e) {
          try { Log.warn("gfx", "TLX: PCSS blocker pass failed —", e); } catch (_) { /* Log absent */ }
          S.pcssEnabled = false;
        }
      }
      try { renderer.setRenderTarget(prev); } catch (_) { /* target already unbound */ }
      target = null;
    }

    (function prime() {
      shadowCam.projectionMatrix.identity();
      shadowCam.projectionMatrixInverse.identity();
      const prev = renderer.getRenderTarget();
      const rts = [sunRT, carRT, lampRT];
      for (let i = 0; i < rts.length; i++) {
        if (!rts[i]) continue;
        renderer.setRenderTarget(rts[i]);
        renderer.render(castScene, shadowCam);
      }
      renderer.setRenderTarget(prev);
    })();

    // The seam members (game.js call order: Begin -> cast* -> End).
    function shadowBegin(lightVP) {
      if (!S.enabled) return;
      // The SUN pass owns the whole shadow box, so a castCullVP still up is a
      // leftover from the car or lamp pass — and tlx.js resolves
      // `castCullVP || lightVP` for every chunked and instanced caster, so a
      // stale one culls the sun's map to a ±42 m car box. The Ends clear it on
      // the normal path and on their early returns (see the note at
      // lampShadowEnd); what they cannot cover is a THROW out of a caster draw
      // between Begin and End. Same one-line guard as GLX's shadow.js — this is
      // the DEFAULT backend, so it needs it at least as much.
      S.castCullVP = null;
      beginPass(sunRT, lightVP, S.lightVP);
    }

    function carShadowBegin(lightVP, boxScale) {
      if (!S.carEnabled) return;      // phone: no-op, casts swallowed via depthPassOn
      beginPass(carRT, lightVP, S.carLightVP);
      // Chunked / instanced casters cull against castCullVP || lightVP (tlx.js
      // castShadowChunked, shadowCullVP): without this a chunked caster in the
      // car pass culled against the SUN's ortho while rendering into the car
      // map (GLX shadow.js carShadowBegin parity).
      S.castCullVP = S.carLightVP;
      // GLX parity: SHADOW DISTANCE widens the car box, and the depth bias
      // must scale with the box/texel ratio or the widened map self-shadows
      // (glx/shadow.js carShadowBegin, glsl-lit.js uCarBiasScale).
      S.carBoxScale = boxScale || 1;
      S.carArmed = true;
      S.carArms++;
    }

    function lampShadowBegin(lightVP, lightIdx) {
      if (!S.lampEnabled) return;
      S.lampIdx = lightIdx | 0;
      beginPass(lampRT, lightVP, S.lampLightVP);
      S.castCullVP = S.lampLightVP;   // chunked casters cull to the lamp cone
      S.lampArmed = true;
      S.lampArms++;
    }

    function lampShadowEnd() {
      S.castCullVP = null;
      endPass(lampRT);
    }

    // L1: the static half. Called on a LAMP change, before the lamp map, which
    // lampCarsBegin then builds as this depth plus the cars (shadow-pass.js).
    function lampStaticBegin(lightVP) {
      if (!lampStaticRT || !lampStaticOn) return false;
      _lampStaticValid = false;
      beginPass(lampStaticRT, lightVP, _lampStaticVP);
      S.castCullVP = _lampStaticVP;   // props cull to the lamp cone, as in the full pass
      return true;
    }
    function lampStaticEnd() {
      S.castCullVP = null;
      endPass(lampStaticRT);
      // The static render's OWN result: S.enabled is sticky, so one earlier
      // sun/car failure would otherwise disable L1 for the rest of the session.
      _lampStaticValid = _lastPassOk;
      if (_lampStaticValid) S.lampStaticBuilds++;
    }
    // L1: a car-only rebuild. false = no valid static map (or lampRT never
    // rendered, so its GPU texture may not exist yet) — the caller runs the full
    // pass instead. The copy happens here, before the cars draw.
    function lampCarsBegin(lightVP, lightIdx) {
      if (!S.lampEnabled || !lampStaticRT || !lampStaticOn || !_lampStaticValid || !_lampRendered) return false;
      // The static props were drawn under _lampStaticVP: any other VP (a radius /
      // cone knob rebuilt the set in place) needs the full pass + static refresh.
      for (let i = 0; i < 16; i++) if (Math.fround(lightVP[i]) !== _lampStaticVP[i]) return false;
      try {
        renderer.copyTextureToTexture(lampStaticRT.depthTexture, lampRT.depthTexture);
      } catch (e) {
        try { Log.warn("gfx", "TLX: lamp static depth copy failed — full lamp passes from now on", e); } catch (_) { /* Log absent */ }
        _lampStaticValid = false; lampStaticOn = false;
        return false;
      }
      lampShadowBegin(lightVP, lightIdx);
      _passKeepsDepth = true;
      S.lampCarOnly++;
      return true;
    }

    function carShadowEnd() {
      S.castCullVP = null;   // before endPass's early return — a latched car VP would cull the SUN pass to the car box
      endPass(carRT);
    }

    /** Armed flags: set by the Begins above each frame game.js runs the pass,
     * cleared AFTER the main render (tlx.js present()) — GLX clears them in
     * the post-chain present. The lit uniforms latch the armed state at
     * begin(), so clearing post-render never races the frame that armed. */
    function clearArmed() {
      S.carArmed = false;
      S.lampArmed = false;
    }

    try { Log.info("gfx", "TLX shadow init"); } catch (_) { /* harness */ }
    // KEEP: "the pass did not run this frame, and the map is still good."
    // clearArmed() runs every frame, which is right when game.js STOPS a pass
    // and wrong when it merely skips one for CADENCE (the car pass halves at
    // low speed; the lamp pass is snap-cached to a 12 m eye cell). Only the
    // producer knows which. TLX primes its three targets at init, so unlike
    // GLX and WGX an unwritten map here reads fully LIT rather than fully
    // shadowed — but the arms > 0 guard is kept anyway so all three backends
    // answer this call identically.
    function carShadowKeep() {
      if (!S.carEnabled || S.carArms <= 0) return false;
      S.carArmed = true;
      return true;
    }
    // The caller's snap key is the map's CONTENT — the lamp's world position
    // plus a quantised key over the cars cast into it (js/game.js) — so a keep
    // here means "same lamp, same cars, and the props are a function of the
    // lamp alone". The index is re-stated rather than remembered because
    // frame.lights is re-sorted every frame; it names THIS frame's slot for the
    // lamp the caller has already proved is the same one.
    function lampShadowKeep(lightIdx) {
      if (!S.lampEnabled || S.lampArms <= 0 || !(lightIdx >= 0)) return false;
      S.lampIdx = lightIdx | 0;
      S.lampArmed = true;
      return true;
    }

    // Every caster that holds real geometry, shown for a warm (compile or draw); hideCasters undoes it.
    function showAllCasters() {
      const shown = [];
      for (const pl of pools.values()) {
        for (const m of pl.pool) if (m.geometry !== parkedGeo && !m.visible) { m.visible = true; shown.push([m, -1]); }
      }
      for (const m of iByBatch.values()) {
        if (!m.visible || !(m.count > 0)) { shown.push([m, m.count]); m.visible = true; if (!(m.count > 0)) m.count = 1; }
      }
      return shown;
    }
    function hideCasters(shown) { for (const [m, count] of shown) { m.visible = false; if (count >= 0) m.count = count; } }

    // A·W14 — PROBE CASTERS. The warm compiles only casters that exist when it runs, and at night there are none:
    // no sun pass, and the lamp and car pools fill only once the car is near a lamp. So every night (and the first
    // rain) race built its tlx-depth pipelines synchronously at the first lamp pass, mid-race (lavapipe: 3 at
    // night, 2 in rain, every key equal to one the day race had compiled). Each probe is a 3-vertex geometry
    // with a SOURCE layout's attribute formats (item size, array type, normalisation, interleaving: what the
    // vertex-buffer layout keys on), drawn with depthMat, one per winding sign (the pipeline keys frontFace on the
    // determinant). A FRESH set every warm: three releases a pipeline when its last render object goes (a
    // race's casters and its targets do at every switch), and a probe kept from the last warm is a render object
    // compileAsync does not rebuild, so night after day still built two lamp pipelines mid-race. The set joins
    // castScene only for the warm's compiles, then stays alive (out of every pass) until the NEXT warm has
    // compiled its own: retire the old meshes AND geometries while the new ones still hold the pipelines.
    // Geometry disposal alone frees attributes but leaves three's RenderObjects strongly rooted.
    // Tiny geometries of their own, so a freed track never takes them down.
    let _probePrev = null;   // { meshes, geos } of the last successful warm
    function layoutSig(geo) {
      const a = geo.attributes, out = [];
      for (const k of Object.keys(a).sort()) {
        const v = a[k];
        if (!v) continue;
        const arr = v.isInterleavedBufferAttribute ? v.data.array : v.array;
        out.push(k + ":" + v.itemSize + ":" + (arr && arr.constructor.name) + ":" + !!v.normalized
          + (v.isInterleavedBufferAttribute ? ":i" + v.data.stride + "@" + v.offset : ""));
      }
      if (geo.index) out.push("index:" + geo.index.array.constructor.name);
      return out.join(",");
    }
    function probeGeometry(src) {
      const g = new THREE.BufferGeometry(), ibs = new Map();
      for (const k of Object.keys(src.attributes)) {
        const v = src.attributes[k];
        if (!v) continue;
        if (v.isInterleavedBufferAttribute) {
          let ib = ibs.get(v.data);
          if (!ib) { ib = new THREE.InterleavedBuffer(new v.data.array.constructor(v.data.stride * 3), v.data.stride); ibs.set(v.data, ib); }
          g.setAttribute(k, new THREE.InterleavedBufferAttribute(ib, v.itemSize, v.offset, v.normalized));
        } else {
          g.setAttribute(k, new THREE.BufferAttribute(new v.array.constructor(v.itemSize * 3), v.itemSize, v.normalized));
        }
      }
      // An indexed source keys its pipeline on the index too (the render cache key ends `,index`): match it.
      if (src.index) g.setIndex(new THREE.BufferAttribute(new src.index.array.constructor([0, 1, 2]), 1));
      return g;
    }
    function probeCasters(sources) {
      const meshes = [], geos = [], seen = new Set();
      if (!sources) return { meshes, geos };
      for (const src of sources) {
        if (!src || !src.attributes || !src.attributes.position || src.attributes.iM0) continue;   // instanced casters: their own material
        const sig = layoutSig(src);
        if (seen.has(sig)) continue;
        seen.add(sig);
        const g = probeGeometry(src);
        geos.push(g);
        for (const sx of [1, -1]) {
          const m = new THREE.Mesh(g, depthMat);
          m.matrixAutoUpdate = false; m.matrixWorldAutoUpdate = false; m.frustumCulled = false;
          m.matrix.makeScale(sx, 1, 1); m.matrixWorld.copy(m.matrix);
          meshes.push(m);
        }
      }
      return { meshes, geos };
    }

    return {
      S,
      // WARM THE CASTER PROGRAMS DURING THE LIGHTS. castScene is its own Scene,
      // so tlx.js's compileAsync(scene) never sees it; the first sun pass of a
      // race built 9 programs on the main thread (gpu-census 203/205). Called
      // from startProgramWarm after the scene and post warms, when castScene
      // already holds the grid's casters (sunPass runs before present()).
      // sources (A·W14): geometries whose vertex layouts the casters will have (tlx.js passes the scene's lit
      // meshes'); each gets a pair of probe casters for this warm (probeCasters above).
      async warm(sources) {
        const prev = renderer.getRenderTarget();
        // compileAsync skips INVISIBLE objects (three's _projectObject returns on
        // visible === false), and beginPass hides the previous pass's pool and
        // every instanced caster — so warm() compiled only the last pass's
        // casters. Show every caster that holds real geometry for the compile,
        // then restore. Pipelines key on material + layout + target, so one
        // visible caster per layout is what each target needs.
        const shown = showAllCasters();
        const probes = probeCasters(sources);
        for (const m of probes.meshes) { m.visible = true; castScene.add(m); }
        let compiled = false;
        try {
          if (sunRT) { renderer.setRenderTarget(sunRT); await renderer.compileAsync(castScene, shadowCam); }
          // The lamp maps carry depth32float when L1 is on and the car map its own
          // target: a different pipeline key per target, so warming only the sun's
          // left the first night lamp / car pass compiling mid-race.
          for (const rt of [lampRT, lampStaticRT, carRT]) {
            if (!rt || rt === sunRT) continue;
            renderer.setRenderTarget(rt); await renderer.compileAsync(castScene, shadowCam);
          }
          if (blockerQuad && blockerRT) { renderer.setRenderTarget(blockerRT); await renderer.compileAsync(blockerQuad, blockerQuad.camera); }
          compiled = true;
        } finally {
          for (const m of probes.meshes) { castScene.remove(m); m.visible = false; }
          // A failed partial compile must not evict the last valid pipeline holders.
          const retired = compiled ? _probePrev : probes;
          if (retired) {
            for (const m of retired.meshes) disposeCaster(m);
            for (const g of retired.geos) { try { g.dispose(); } catch (_) { /* device dying */ } }
          }
          if (compiled) { _probePrev = probes; S.probeLayouts = probes.geos.length; }
          hideCasters(shown);
          try { renderer.setRenderTarget(prev); } catch (_) { /* already unbound */ }
        }
      },
      // A-W1 DRAW WARM (tlx.js startProgramWarm's last stage): every caster
      // DRAWN once per distinct depth-target configuration, into a 1x1 scratch
      // target built by makeDepthTarget with the live target's formats — the
      // pipeline keys and three's render context (count:format:type:samples:
      // depth:stencil) are the live ones', so the driver's first-draw work
      // lands here. Never the live maps: the sun map is snap-cached across
      // frames, so even one texel drawn into it would show. Returns the number
      // of configurations drawn.
      drawWarm() {
        const prev = renderer.getRenderTarget(), shown = showAllCasters(), seen = new Set();
        let n = 0;
        try {
          for (const rt of [sunRT, carRT, lampRT, lampStaticRT]) {
            if (!rt) continue;
            const hdr = !!(rt.texture && rt.texture.type === THREE.FloatType), fd = !!(rt.depthTexture && rt.depthTexture.type === THREE.FloatType);
            const key = hdr + "|" + fd;
            if (seen.has(key)) continue;
            seen.add(key);
            const tmp = makeDepthTarget(1, "TLXWarmCast", hdr, fd);
            try { renderer.setRenderTarget(tmp); renderer.render(castScene, shadowCam); n++; }
            finally { tmp.dispose(); }
          }
        } finally {
          hideCasters(shown);
          try { renderer.setRenderTarget(prev); } catch (_) { /* already unbound */ }
        }
        return n;
      },
      carShadowKeep, lampShadowKeep,
      sunSize: SUN_SIZE,
      // EXPORTED FOR THE SAME REASON sunSize IS: tsl-lit's PCF taps are offsets
      // in UV space, so they have to be derived from the map that is actually
      // allocated. The sun map has always done that (U.shadowTexel =
      // 1 / SHD.sunSize); the car and lamp maps shrink to 256² under software
      // GL while staying ENABLED (unlike the mobile path, which nulls them),
      // and their taps were hardcoded to the desktop 1024/512 — so on a
      // software-GL context the filter collapsed to a fraction of a texel and
      // both shadows went hard and aliased while the sun's stayed soft.
      carSize: CAR_SIZE,
      lampSize: LAMP_SIZE,
      sunTex: sunRT ? sunRT.depthTexture : null,
      carTex: carRT ? carRT.depthTexture : null,
      lampTex: lampRT ? lampRT.depthTexture : null,
      // Blocker map for tsl-lit's penumbra search (WebGPU + desktop WebGL2).
      // Presence gates the SHADER branch at build; S.pcssEnabled gates the
      // UNIFORM at runtime so a later blocker failure degrades live.
      blockerTex: blockerRT ? blockerRT.texture : null,
      blockerSize: BLOCKER_SIZE,
      shadowBegin,
      castShadow: cast,
      castInstanced,
      freeInstanced,
      releaseGeometry,
      flushDropped,
      flushOwnershipDropped,
      purgeCastersForGeos,
      castShadowChunked: cast,
      shadowEnd: () => endPass(sunRT),
      carShadowEnd,
      lampShadowEnd,
      carShadowBegin,
      lampShadowBegin,
      lampStaticBegin, lampStaticEnd, lampCarsBegin,
      get lampStaticOn() { return !!(lampStaticRT && lampStaticOn); },
      clearArmed,
    };
  }

  window.TLXShaders = Object.assign(window.TLXShaders || {}, { shadowSys, uboInstCap, sunMapSize });
})();
