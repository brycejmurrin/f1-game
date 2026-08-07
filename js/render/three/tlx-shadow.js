/* Apex 26 — TLXShaders.shadowSys: the three-map shadow subsystem for the TLX
 * backend (M4). The three.js sibling of js/render/glx/shadow.js:
 *
 *   - STATIC SUN map   2048² desktop / 1024² mobile tier — snap-cached by
 *     game.js (shadowBegin only runs on a recentre / sun change), terrain +
 *     road + props casters.
 *   - CAR map          1024², desktop only — cleared + redrawn every armed
 *     frame so moving cars get live sun shadows (direction/length correct,
 *     car-on-car works). Armed by carShadowBegin, cleared in tlx present().
 *   - LAMP spot map    512², desktop only — per-frame depth render down the
 *     nearest floodlight's PERSPECTIVE beam; lampIdx tags which frame.lights
 *     record the lit pass gates its PCF to.
 *
 * game.js DRIVES all three passes (snap cache, caster selection, light VPs —
 * game.js:3334-3445 + 3636-3691); this file only implements the seam members.
 * Each pass follows the tlx.js draw-list pattern: Begin sets the depth camera
 * from the column-major lightVP, castShadow accumulates pooled THREE.Mesh
 * casters, End renders once into the pass's depth target. Casters render
 * DOUBLE-SIDED (GLX disables CULL_FACE: back faces into the map avoid
 * peter-panning).
 *
 * The depth textures are sampled by tsl-lit.js via texture(...).compare(z) —
 * hardware sampler2DShadow PCF on the WebGL backend (LinearFilter +
 * LessEqualCompare == GLX's LINEAR + COMPARE_REF_TO_TEXTURE), WGSL
 * textureSampleCompare on WebGPU.
 *
 * TODO M4-PCSS: GLX builds a 512² R16F min-of-4 blocker map from the sun
 * depth texture through a COMPARE-OFF sampler object (glx/shadow.js:151-182)
 * for the PCSS-lite penumbra search. three has no per-use sampler override —
 * a texture with compareFunction set is ALWAYS declared sampler2DShadow /
 * textureSampleCompare, so the same depth texture cannot also be read as a
 * plain texture in another pass. Porting PCSS needs either a second
 * depth-in-color caster pass or a three-level sampler hack; skipped for M4 —
 * tlx.js pcss() stays false and tsl-lit uses the fixed near radius (R = 3).
 *
 * SHAPE CONTRACT (see tlx.js header): publishes a FACTORY,
 *     TLXShaders.shadowSys = (THREE, TSL, ctx) => ({ S, sunTex, … })
 * ctx = { renderer, mobileTier }. NEVER touches THREE/TSL at script eval —
 * three exists only inside TLX.create().
 */
"use strict";

(function () {
  function shadowSys(THREE, TSL, ctx) {
    const renderer = ctx.renderer;
    const mobileTier = !!ctx.mobileTier;

    const SUN_SIZE = mobileTier ? 1024 : 2048;   // 1024² saves 12 MB on the mobile tier (GLX parity)
    const CAR_SIZE = 1024;                        // dynamic car-only map (desktop tier)
    const LAMP_SIZE = 512;                        // nearest-floodlight spot map (desktop tier)

    // Shared state, field names 1:1 with GLXShadow's S so tlx.js's state
    // introspection (carShadowState/lampShadowState) and tsl-lit's updateFrame
    // read the same shape on either backend.
    const S = {
      SIZE: SUN_SIZE,
      enabled: false,
      lightVP: new Float32Array(16),
      pcssEnabled: false,        // TODO M4-PCSS (see header)
      // True only between a Begin that actually opened a pass and its End —
      // casts gate on THIS, not enabled: on the mobile tier the car/lamp maps
      // are never created, so their Begins no-op but game.js still issues the
      // caster draws, which must be silently swallowed (GLX S.depthPassOn).
      depthPassOn: false,
      // Light frustum the chunked shadow caster culls against: null = the
      // static sun box (S.lightVP); lampShadowBegin points it at the lamp's
      // perspective frustum for the duration of that pass (GLXShadow
      // S.castCullVP 1:1 — consumed by tlx.js castShadowChunked, M7).
      castCullVP: null,
      carEnabled: false, carLightVP: new Float32Array(16),
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
     * per tap on ES 3.0, exactly GLX's setup (glx/shadow.js:83-88). */
    function makeDepthTarget(size, name) {
      const depthTexture = new THREE.DepthTexture(size, size);
      depthTexture.name = name;
      depthTexture.compareFunction = THREE.LessEqualCompare;
      depthTexture.minFilter = THREE.LinearFilter;
      depthTexture.magFilter = THREE.LinearFilter;
      // wrap defaults to ClampToEdge — matches GLX
      const rt = new THREE.RenderTarget(size, size, { depthTexture });
      rt.texture.name = name + ".color";
      rt.texture.generateMipmaps = false;
      return rt;
    }

    const sunRT = makeDepthTarget(SUN_SIZE, "TLXSunShadow");
    const carRT = mobileTier ? null : makeDepthTarget(CAR_SIZE, "TLXCarShadow");
    const lampRT = mobileTier ? null : makeDepthTarget(LAMP_SIZE, "TLXLampShadow");
    S.enabled = !!sunRT;
    S.carEnabled = !!carRT;
    S.lampEnabled = !!lampRT;

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
    depthMat.colorNode = TSL.vec3(0.0);
    depthMat.side = THREE.DoubleSide;
    depthMat.fog = false;

    // ── caster scene + pooled mesh wrappers (the tlx.js draw-list pattern) ──
    const castScene = new THREE.Scene();
    castScene.matrixWorldAutoUpdate = false;
    const pool = [];
    let used = 0;
    let target = null;    // the pass's render target while open

    function beginPass(rt, lightVP, dst) {
      dst.set(lightVP);
      shadowCam.projectionMatrix.fromArray(lightVP);
      shadowCam.projectionMatrixInverse.copy(shadowCam.projectionMatrix).invert();
      target = rt;
      used = 0;
      S.depthPassOn = true;
    }

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

    function endPass() {
      S.depthPassOn = false;
      if (!target) return;
      for (let i = used; i < pool.length; i++) pool[i].visible = false;
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(castScene, shadowCam);   // autoClear: depth cleared per pass, like GLX's clear(DEPTH_BUFFER_BIT)
      renderer.setRenderTarget(prev);
      target = null;
      // TODO M4-PCSS: this is where GLX refreshes the 512² blocker map from
      // the just-rendered sun depth (glx/shadow.js shadowEnd) — see header.
    }

    // Prime each target once (empty render) so the depth textures exist on the
    // GPU before the lit pass ever binds them — the sun map may not render
    // until the first recentre, and the car/lamp maps not at all by day/menu.
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

    function carShadowBegin(lightVP) {
      if (!S.carEnabled) return;      // mobile tier: no-op, casts swallowed via depthPassOn
      beginPass(carRT, lightVP, S.carLightVP);
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

    return {
      S,
      sunSize: SUN_SIZE,
      sunTex: sunRT ? sunRT.depthTexture : null,
      carTex: carRT ? carRT.depthTexture : null,
      lampTex: lampRT ? lampRT.depthTexture : null,
      pcss: false,               // TODO M4-PCSS (see header)
      shadowBegin,
      castShadow: cast,
      // M7: tlx.js castShadowChunked owns the per-chunk light-frustum cull
      // (tlx-chunked.js) and feeds each visible chunk through castShadow.
      // This member stays the plain caster as the FALLBACK for the M2
      // single-geometry chunked shape (chunked factory missing).
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
