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

    const SUN_SIZE = isMobile ? 1024 : (softwareGL ? 512 : 2048);   // 1024² saves 12 MB on every phone (GLX parity)
    const CAR_SIZE = softwareGL ? 256 : 1024;                      // dynamic car-only map (true desktop only)
    const LAMP_SIZE = softwareGL ? 256 : 512;                      // nearest-floodlight spot map (true desktop only)

    const S = {
      SIZE: SUN_SIZE,
      enabled: false,
      lightVP: new Float32Array(16),
      pcssEnabled: false,        // true once the WebGPU blocker map builds (header note)
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

    /** Depth target: color attachment unused (colorWrite off on the caster
     * material; three's RenderTarget always carries one — its own shadow
     * pipeline pays the same) + a compare-mode DepthTexture the lit pass
     * samples. LinearFilter + LessEqualCompare = guaranteed hardware 2x2 PCF
     * per tap on ES 3.0, exactly GLX's setup (js/render/glx/shadow.js). */
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
      const opts = { depthTexture };
      if (hdrColor) {
        opts.type = THREE.HalfFloatType;
        opts.format = THREE.RedFormat;
      }
      const rt = new THREE.RenderTarget(size, size, opts);
      rt.texture.name = name + ".color";
      rt.texture.generateMipmaps = false;
      return rt;
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
    // AUTO = WebGPU only: three's WebGL copyTextureToTexture reads five UNPACK_*
    // states with gl.getParameter (cached after the first copy); in Chrome that
    // first read is a synchronous GPU-process round trip, and census 289 (real
    // Metal, WebGL2 leg) spent 2 s of spike frames in it behind the queued shader
    // links. apex26.tlxLampStatic=0 is the old full rebuild, =1 forces on.
    let lampStaticOn = isWebGPU;
    try {
      const v = localStorage.getItem("apex26.tlxLampStatic");
      if (v === "0" || v === "1") lampStaticOn = v === "1";
    } catch (_) { /* no storage: AUTO */ }
    if (isMobile || typeof renderer.copyTextureToTexture !== "function") lampStaticOn = false;
    const lampRT = isMobile ? null : makeDepthTarget(LAMP_SIZE, "TLXLampShadow", false, lampStaticOn);
    const lampStaticRT = lampStaticOn ? makeDepthTarget(LAMP_SIZE, "TLXLampStatic", false, true) : null;
    const _lampStaticVP = new Float32Array(16);
    let _lampStaticValid = false, _lampRendered = false;
    S.enabled = !!sunRT;
    S.carEnabled = !!carRT;
    S.lampEnabled = !!lampRT;

    // PCSS blocker map (header note): 512² R16F min-of-4 downsample.
    // WebGPU: textureLoad the compare-mode depth texture (no sampler).
    // Desktop WebGL2: textureLoad the R16F color attachment the sun pass
    // writes TSL.depth into. Guarded: any construction failure leaves the
    // fixed-R look.
    const BLOCKER_SIZE = 512;
    let blockerRT = null, blockerQuad = null;
    if (sunRT && (isWebGPU || colorPcss)) {
      try {
        blockerRT = new THREE.RenderTarget(BLOCKER_SIZE, BLOCKER_SIZE, {
          format: THREE.RedFormat, type: THREE.HalfFloatType,
          depthBuffer: false, generateMipmaps: false,
          minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
        });
        blockerRT.texture.name = "TLXSunBlocker";
        const bmat = new THREE.MeshBasicNodeMaterial();
        bmat.fog = false;
        bmat.lights = false;
        bmat.customProgramCacheKey = () => colorPcss ? "tlx-blocker-gl" : "tlx-blocker";
        const k = SUN_SIZE / BLOCKER_SIZE;
        const lo = (k >> 1) - 1, hi = (k >> 1) + 1;
        const srcTex = colorPcss ? sunRT.texture : sunRT.depthTexture;
        bmat.colorNode = TSL.Fn(() => {
          const ip = TSL.ivec2(TSL.screenCoordinate.xy).mul(TSL.int(k)).toVar();
          const tap = (x, y) => {
            const raw = TSL.textureLoad(srcTex, ip.add(TSL.ivec2(x, y)), TSL.int(0));
            return colorPcss ? raw.x : raw;
          };
          const d = TSL.min(TSL.min(tap(lo, lo), tap(hi, lo)),
                            TSL.min(tap(lo, hi), tap(hi, hi)));
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
    // NOTE: colorWrite must stay TRUE — the WebGL backend applies the next
    // render's CLEAR under whatever glColorMask the last draw left, so a
    // colorWrite:false caster ran the main canvas clear fully masked (black
    // sky, geometry unaffected because each lit draw re-enables the mask).
    // The maps' color attachments are throwaway, so writing black is free.
    const depthMat = new THREE.MeshBasicNodeMaterial();
    depthMat.colorNode = colorPcss ? TSL.vec4(TSL.depth, 0.0, 0.0, 1.0) : TSL.vec3(0.0);
    depthMat.side = THREE.DoubleSide;
    depthMat.fog = false;
    depthMat.lights = false;
    depthMat.customProgramCacheKey = () => "tlx-depth";

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
    // a track switch the old track's chunk geometries stayed alive in every
    // slot the new track did not refill. An attribute-less geometry is never
    // rendered (the wrapper is invisible) and costs nothing.
    const parkedGeo = new THREE.BufferGeometry();

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
      if (model) m.matrix.fromArray(model); else m.matrix.identity();
      m.matrixWorld.copy(m.matrix);
      m.visible = true;
      used++;
    }

    // Instanced casters (TrackGraph.batches → createInstancedBatch): ONE
    // InstancedMesh per batch, made the first time the batch is cast and kept
    // until freeInstanced() — never a slot pool. The slot pool this replaces
    // handed slot i whichever batch the cull put i-th, and swapped in a bigger
    // InstancedMesh whenever a larger batch landed there. Disposing the old one
    // released its pipeline, three deletes a program whose use count reaches 0,
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
    const iCast = [];             // this pass's casts, hidden again at the next Begin
    const sharedInstCap = (n) => uboInstCap(renderer, n);
    // Scratch for setMatrixAt — never allocate per cast (was per-instance GC).
    const _castMat = new THREE.Matrix4();
    function castInstanced(batch, count) {
      if (!S.depthPassOn || !batch || !batch.geo) return;
      const culled = count !== undefined;
      const n = culled ? Math.min(count | 0, batch.instances | 0) : (batch.instances | 0);
      if (!(n > 0)) return;
      let m = iByBatch.get(batch);
      if (!m || m.geometry !== batch.geo) {
        if (m) { castScene.remove(m); try { m.dispose(); } catch (_) { /* */ } }
        m = new THREE.InstancedMesh(batch.geo, depthMat, sharedInstCap(batch.instances | 0));
        m.matrixAutoUpdate = false;
        m.frustumCulled = false;
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // Do not set instanceColor. The lit batch already carries an
        // InstancedBufferAttribute `color` on the shared geometry; a second
        // instance-rate colour slot is what Dawn rejected at slot 5
        // (mcp-probe 2026-08-18). Depth only needs instanceMatrix.
        iByBatch.set(batch, m);
        castScene.add(m);
      }
      const dst = m.instanceMatrix.array;
      const src = culled && batch.packMatrices ? batch.packMatrices : batch.srcMatrices;
      if (src && src.length >= n * 16) {
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
          m.setMatrixAt(i, _castMat);
        }
      }
      // Upload only the rows written: the padding above the UBO limit is never
      // drawn, so a full 64 KB write per batch per rebuild would be pure cost.
      // (The setMatrixAt branch never flagged its upload at all before this.)
      const im = m.instanceMatrix;
      im.clearUpdateRanges();
      im.addUpdateRange(0, n * 16);
      im.needsUpdate = true;
      m.count = n;
      m.matrix.identity();
      m.matrixWorld.identity();
      m.visible = true;
      iCast.push(m);
    }

    // The batch is gone (track switch): its caster goes with it, so a hidden
    // mesh never pins a freed geometry alive (the parkedGeo rule, per batch).
    function freeInstanced(batch) {
      const m = batch && iByBatch.get(batch);
      if (!m) return;
      iByBatch.delete(batch);
      const ix = iCast.indexOf(m);
      if (ix >= 0) iCast.splice(ix, 1);
      castScene.remove(m);
      try { m.dispose(); } catch (_) { /* */ }
    }

    function beginPass(rt, lightVP, dst) {
      dst.set(lightVP);
      shadowCam.projectionMatrix.fromArray(lightVP);
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

    function endPass() {
      S.depthPassOn = false;
      if (!target) return;
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
        renderer.render(castScene, shadowCam);
        if (target === lampRT) _lampRendered = true;
        _lastPassOk = true;
      } catch (e) {
        // Depth TSL compile must not escape into tick() (full-screen overlay).
        try { Log.warn("gfx", "TLX: shadow pass failed —", e); } catch (_) { /* Log absent */ }
        S.enabled = false;
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
      // (glx/shadow.js carShadowBegin, lit.js uCarBiasScale).
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
      endPass();
    }

    // L1: the static half. Called on a LAMP change, after the full pass.
    function lampStaticBegin(lightVP) {
      if (!lampStaticRT || !lampStaticOn) return false;
      _lampStaticValid = false;
      beginPass(lampStaticRT, lightVP, _lampStaticVP);
      S.castCullVP = _lampStaticVP;   // props cull to the lamp cone, as in the full pass
      return true;
    }
    function lampStaticEnd() {
      S.castCullVP = null;
      endPass();
      // The static render's OWN result: S.enabled is sticky, so one earlier
      // sun/car failure used to disable L1 for the rest of the session.
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
      endPass();
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

    return {
      S,
      // WARM THE CASTER PROGRAMS DURING THE LIGHTS. castScene is its own Scene,
      // so tlx.js's compileAsync(scene) never sees it; the first sun pass of a
      // race built 9 programs on the main thread (gpu-census 203/205). Called
      // from startProgramWarm after the scene and post warms, when castScene
      // already holds the grid's casters (sunPass runs before present()).
      async warm() {
        const prev = renderer.getRenderTarget();
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
        } finally { try { renderer.setRenderTarget(prev); } catch (_) { /* already unbound */ } }
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
      castShadowChunked: cast,
      shadowEnd: endPass,
      carShadowEnd,
      lampShadowEnd,
      carShadowBegin,
      lampShadowBegin,
      lampStaticBegin, lampStaticEnd, lampCarsBegin,
      get lampStaticOn() { return !!(lampStaticRT && lampStaticOn); },
      clearArmed,
    };
  }

  window.TLXShaders = Object.assign(window.TLXShaders || {}, { shadowSys, uboInstCap });
})();
