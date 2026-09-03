/* Apex 26 — TLXShaders.shadowSys: the three-map shadow subsystem for the TLX backend (M4). The three.js sibling of js/render/glx/shadow.js: - STATIC SUN map 2048²… */
"use strict";

(function () {
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
    };

    /** Depth target: color attachment unused (colorWrite off on the caster
     * material; three's RenderTarget always carries one — its own shadow
     * pipeline pays the same) + a compare-mode DepthTexture the lit pass
     * samples. LinearFilter + LessEqualCompare = guaranteed hardware 2x2 PCF
     * per tap on ES 3.0, exactly GLX's setup (js/render/glx/shadow.js). */
    function makeDepthTarget(size, name, hdrColor) {
      const depthTexture = new THREE.DepthTexture(size, size);
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
    const lampRT = isMobile ? null : makeDepthTarget(LAMP_SIZE, "TLXLampShadow");
    S.enabled = !!sunRT;
    S.carEnabled = !!carRT;
    S.lampEnabled = !!lampRT;

    // ── PCSS blocker map (header note): 512² R16F min-of-4 downsample.
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

    // ── depth camera: matrices set verbatim from the game's column-major
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

    // ── depth-only caster material: constant-black fragment, depth is the
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

    // ── caster scene + pooled mesh wrappers (the tlx.js draw-list pattern) ──
    const castScene = new THREE.Scene();
    castScene.matrixWorldAutoUpdate = false;
    const pool = [];
    let used = 0;
    let target = null;    // the pass's render target while open
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

    // Instanced casters (TrackGraph.batches → createInstancedBatch). Separate
    // pool from discrete Meshes: InstancedMesh.count must match the culled
    // visible set, and instanceMatrix is already packed on the batch handle.
    const iPool = [];
    let iUsed = 0;
    // Scratch for setMatrixAt — never allocate per cast (was per-instance GC).
    const _castMat = new THREE.Matrix4();
    function castInstanced(batch, count) {
      if (!S.depthPassOn || !batch || !batch.geo) return;
      const culled = count !== undefined;
      const n = culled ? Math.min(count | 0, batch.instances | 0) : (batch.instances | 0);
      if (!(n > 0)) return;
      let m = iPool[iUsed];
      if (!m || (m.userData.tlxInstCap || 0) < batch.instances) {
        if (m) { castScene.remove(m); try { m.dispose(); } catch (_) { /* */ } }
        m = new THREE.InstancedMesh(batch.geo, depthMat, batch.instances);
        m.matrixAutoUpdate = false;
        m.frustumCulled = false;
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.userData.tlxInstCap = batch.instances;
        // Do not set instanceColor. The lit batch already carries an
        // InstancedBufferAttribute `color` on the shared geometry; a second
        // instance-rate colour slot is what Dawn rejected at slot 5
        // (mcp-probe 2026-08-18). Depth only needs instanceMatrix.
        iPool[iUsed] = m;
        castScene.add(m);
      }
      m.geometry = batch.geo;
      m.material = depthMat;
      const dst = m.instanceMatrix.array;
      const src = culled && batch.packMatrices ? batch.packMatrices : batch.srcMatrices;
      if (src && src.length >= n * 16) {
        for (let i = 0, o = 0; i < n; i++, o += 16) {
          for (let k = 0; k < 16; k++) dst[o + k] = src[o + k];
        }
        m.instanceMatrix.needsUpdate = true;
      } else if (batch.imesh && batch.imesh.instanceMatrix) {
        // imesh may be camera-repacked — only safe when visible === instances.
        const isrc = batch.imesh.instanceMatrix.array;
        const copyN = (batch.visible === undefined || batch.visible >= n) ? n
          : (batch.visible | 0);
        for (let i = 0, o = 0; i < copyN; i++, o += 16) {
          for (let k = 0; k < 16; k++) dst[o + k] = isrc[o + k];
        }
        m.instanceMatrix.needsUpdate = true;
      } else if (batch.packMatrices) {
        const psrc = batch.packMatrices;
        for (let i = 0; i < n; i++) {
          _castMat.fromArray(psrc, i * 16);
          m.setMatrixAt(i, _castMat);
        }
      }
      m.count = n;
      m.matrix.identity();
      m.matrixWorld.identity();
      m.visible = true;
      iUsed++;
    }

    function beginPass(rt, lightVP, dst) {
      dst.set(lightVP);
      shadowCam.projectionMatrix.fromArray(lightVP);
      shadowCam.projectionMatrixInverse.copy(shadowCam.projectionMatrix).invert();
      target = rt;
      used = 0;
      iUsed = 0;
      S.depthPassOn = true;
    }

    function endPass() {
      S.depthPassOn = false;
      if (!target) return;
      const wasSun = target === sunRT;
      for (let i = used; i < pool.length; i++) { pool[i].visible = false; pool[i].geometry = parkedGeo; }
      for (let i = iUsed; i < iPool.length; i++) if (iPool[i]) { iPool[i].visible = false; iPool[i].geometry = parkedGeo; }
      const prev = renderer.getRenderTarget();
      try {
        renderer.setRenderTarget(target);
        renderer.render(castScene, shadowCam);   // autoClear: depth cleared per pass, like GLX's clear(DEPTH_BUFFER_BIT)
      } catch (e) {
        // Depth TSL compile must not escape into tick() (full-screen overlay).
        try { Log.warn("gfx", "TLX: shadow pass failed —", e); } catch (_) { /* Log absent */ }
        S.enabled = false;
        S.depthPassOn = false;
      }
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

    // ── the seam members (game.js call order: Begin → cast* → End) ──────────
    function shadowBegin(lightVP) {
      if (!S.enabled) return;
      beginPass(sunRT, lightVP, S.lightVP);
    }

    function carShadowBegin(lightVP, boxScale) {
      if (!S.carEnabled) return;      // phone: no-op, casts swallowed via depthPassOn
      beginPass(carRT, lightVP, S.carLightVP);
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
      carShadowKeep, lampShadowKeep,
      sunSize: SUN_SIZE,
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
      castShadowChunked: cast,
      shadowEnd: endPass,
      carShadowEnd: endPass,
      lampShadowEnd,
      carShadowBegin,
      lampShadowBegin,
      clearArmed,
    };
  }

  window.TLXShaders = Object.assign(window.TLXShaders || {}, { shadowSys });
})();
