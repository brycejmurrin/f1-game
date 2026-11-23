/* Apex 26 — TLXShaders.postChain: the post-processing ORCHESTRATION for the
 * TLX backend (M8). The three.js sibling of js/render/glx/post.js: owns the
 * render targets (full-res HDR scene + sampleable depth, the 5-level bloom
 * mip chain, half-res SSAO + godray pairs, the full-res LDR FXAA input), the
 * pass order, target ping-pong, and the whole CPU side of present(opts) —
 * per-block gating, tune-knob defaults (TUNE_DEFS mirrors), the sun-UV /
 * _sunGate projection, and the godray nearest-12 lamp selection.
 *
 * PASS ORDER (glx/post.js present() 1:1):
 *   0.  SSAO (half res)  -> separable blur H+V          (aoStr|contact gated)
 *   0b. GODRAY (half res, world-space sun-map march) -> double blur H+V x2;
 *       with both live, SSAO rides in the godray alpha + blur pair 1 (D7)
 *   1.  BRIGHT pass  scene -> bloom level 0 (half res)  (bloomAmt gated)
 *   2.  DOWN x(n-1)  13-tap Jimenez mip chain; Karis on the first mip only
 *       UP   x(n-1)  9-tap tent, ADDITIVE into each larger level; the FINAL
 *                    pass into level 0 OVERWRITES (js/render/glx/shaders/glsl-post.js)
 *   3.  COMPOSITE    -> LDR target (all 58 uniforms; ACES/grade/SSR/flare)
 *   4.  FXAA         -> canvas (+ the mirror inset in the same pass, D8)
 *
 * PER-BLOCK BAIL: a disabled block allocates NOTHING — the SSAO pair, the
 *   godray pair and the bloom chain are created lazily on the first frame
 *   their gate opens (ensure*()); until then the composite reads the 1x1
 *   white/black no-op fallbacks, exactly like GLX's whiteTex/blackTex binds.
 *   A block that later stays shut for SHED_FRAMES presents (a governor shed,
 *   day after night shafts) disposes those targets. The next open frame
 *   allocates them again. One closed frame does not: a sun that clips the
 *   frame edge must not free and rebuild the godray pair every other present.
 *
 * LAMP-MAP SNAPSHOT: present() reads S.lampArmed for the godray lamp-index
 *   mapping BEFORE tlx.js clears the armed flags (clearArmed runs after this
 *   chain returns) — the GLX ordering where the godray pass consumes the
 *   armed state that present() then retires.
 *
 * SCENE MSAA (2026-10-01; was a documented deviation): the scene target takes
 *   ctx.sceneSamples (desktop WebGL2: 2, or 4 on ULTRA, as GLX; 0 elsewhere — tlx.js
 *   decides). r186's WebGL backend resolves the colour attachments AND the
 *   depth texture by blitFramebuffer when resolveDepthBuffer is set, so the
 *   SSAO/SSR/godray blocks read a resolved depth. The old note ("three's MSAA
 *   resolve doesn't expose the resolved DEPTH") described r184. Phones and
 *   the native-WebGPU path keep the single-sample recipe (FXAA carries the
 *   AA): core WebGPU cannot resolve a depth attachment. The ssrTag attachment
 *   is resolved too, so a tag averages across an edge (accepted). Scene
 *   depth/tag: depthEnd() invalidates (WebGL2) or discardHint (WebGPU patch 17)
 *   when no post reader needs them; three's MSAA resolve path also invalidates.
 *   Post ping-pong colour targets clear on every overwrite (runPass autoClear),
 *   so a tile GPU never reloads their prior contents — see
 *   docs/notes/TLX-FB-INVALIDATE-AUDIT-2026-10-28.md (#2649).
 *
 * SHAPE CONTRACT (see tlx.js header): publishes a FACTORY,
 *     TLXShaders.postChain = (THREE, TSL, ctx) => ({ enabled, hdrOk,
 *         sceneTarget, resize, present, state, viz }) | throws -> caller
 * disables post (tlx.js renders direct to canvas, the M7 look).
 * ctx = { renderer, isMobile, chunks, shadow, viz }. NEVER touches THREE/TSL
 * at script eval — three exists only inside TLX.create().
 */
"use strict";

(function () {
  // Knob read with the TUNE_DEFS default, hoisted so present() allocates no closure per frame (#4674).
  const _gk = (T, id) => PostCommon.knob(T, id);
  const POST_VIZ = ["ssao", "bloom", "shafts", "godray", "composite-off", "scene"];

  function postChain(THREE, TSL, ctx) {
    const renderer = ctx.renderer;
    // Manual experiment, read once per chain; opt-in takes effect on reload.
    let sharpenLimit = 0;
    try { sharpenLimit = localStorage.getItem("apex26.tlxSharpenLimit") === "1" ? 1 : 0; } catch (_) { /* storage unavailable */ }
    // Every resource created by this chain stays owned here, including lazy
    // targets. The renderer keeps GPU-side state after JS references disappear,
    // so runtime degradation and partial construction both need an explicit,
    // idempotent unwind.
    const ownedRTs = new Set();
    const ownedTextures = new Set();
    const ownedMaterials = new Set();
    let quad = null;
    let disposed = false;
    let viewportScope = null;
    let AA = null;   // traa: the TLXAA.taa controller (built below, after the pass set)
    function ownRT(rt) { ownedRTs.add(rt); return rt; }
    function ownTexture(tex) { if (tex) ownedTextures.add(tex); return tex; }
    function trackMaterial(mat) { if (mat) ownedMaterials.add(mat); return mat; }
    function dispose() {
      if (disposed) return;
      disposed = true;
      if (quad) quad.material = null;
      if (viewportScope) viewportScope.dispose();
      if (AA) AA.dispose();
      // A warm may be suspended with one of these targets still bound.
      try {
        if (ownedRTs.has(renderer.getRenderTarget())) renderer.setRenderTarget(null);
      } catch (_) { /* device already dying */ }
      for (const mat of ownedMaterials) {
        try { mat.dispose(); } catch (_) { /* device already dying */ }
      }
      // RenderTarget.dispose owns all MRT colour attachments and its depth
      // texture. Do not separately dispose those textures here.
      for (const rt of ownedRTs) {
        try { rt.dispose(); } catch (_) { /* device already dying */ }
      }
      for (const tex of ownedTextures) {
        try { tex.dispose(); } catch (_) { /* device already dying */ }
      }
      ownedMaterials.clear(); ownedRTs.clear(); ownedTextures.clear();
    }
    try {
    // Phone post working size = PHONE_POST_SCALE × the scene (W×H). #3479 cut
    // it to 1/2 (BrowserStack iPhone 15 deep profile 2026-10-22: JS 3.8–6.4 ms
    // of 17–28 ms frames → GPU/fill-bound) and #3670 raised it to 5/8; both read
    // as a blurry image on Bryce's iPhone (TLX WebGPU), so it is back at 1 —
    // the pre-#3479 full-res composite. Frame cost is the governor's job: its
    // renderScale step shrinks W×H (and so pW×pH), and the look-post shed /
    // phone slow latch drop the passes. LDR + bloom L0 + SSAO/godray base off
    // pW×pH. Desktop keeps pW===W. Scene MSAA remains the caller's (ctx.sceneSamples).
    // Block gates still come from present(opts) / PerfGov — this only shrinks
    // the surfaces those blocks draw into. FORMATS: the SSAO pair is R8
    // and bloom R11F_G11F_B10F (when renderable) on both; the godray pair stays
    // RGBA16F here (GLX: R11F_G11F_B10F) because its alpha carries the folded
    // SSAO term (hunt D7).
    const shadow = ctx.shadow || null;
    const viz = (ctx.viz && POST_VIZ.indexOf(ctx.viz) >= 0) ? ctx.viz : null;
    // The RT the viz branch last wrote — see presentedTarget().
    let _vizDest = null;

    // HDR capability. RGBA16F needs a *renderable* half-float colour
    // buffer. iOS Safari WebGL2 typically exposes EXT_color_buffer_half_float
    // and NOT EXT_color_buffer_float (the 32-bit one). Checking only the
    // latter forced UnsignedByteType + ACES on an 8-bit scene — the pale
    // washed ground. A query that throws must not keep hdr=true on a phone
    // (incomplete HalfFloat framebuffer = black / half-black frame).
    let hdr = !!(renderer.backend && renderer.backend.isWebGPUBackend);
    // BLOOM FORMAT (hunt D6): R11F_G11F_B10F as GLX when it is RENDERABLE (and
    // blendable — the UP passes add): WebGL2 needs EXT_color_buffer_float (not
    // the half-float one; the probe below decides per device, and iOS is
    // reported to expose it, web3dsurvey ~100 %, so do not assume RGBA16F
    // there); WebGPU the
    // "rg11b10ufloat-renderable" feature three requests whenever the adapter
    // has it. Every bloom reader takes .rgb only. apex26.tlxBloom11=0 reverts.
    let bloom11 = false;
    try {
      const gl = renderer.backend && renderer.backend.gl;
      if (gl) {
        bloom11 = !!gl.getExtension("EXT_color_buffer_float");
        hdr = bloom11 || !!gl.getExtension("EXT_color_buffer_half_float");
      } else if (hdr) {
        const dev = renderer.backend.device;
        bloom11 = !!(dev && dev.features && dev.features.has("rg11b10ufloat-renderable"));
      }
    } catch (_) { hdr = !!(renderer.backend && renderer.backend.isWebGPUBackend); bloom11 = false; }
    // The probe's verdict, before the bloom knob: the scene target below shares it.
    const r11Renderable = bloom11 && hdr && THREE.UnsignedInt101111Type != null && THREE.RGBFormat != null;
    try { if (localStorage.getItem("apex26.tlxBloom11") === "0") bloom11 = false; } catch (_) { /* no storage: on */ }
    const hdrType = hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    bloom11 = bloom11 && hdr && THREE.UnsignedInt101111Type != null && THREE.RGBFormat != null;
    // SCENE COLOUR FORMAT (phoneperf 2026-10-24, PERF-KNOWN-WINS row 15): R11F_G11F_B10F / rg11b10ufloat for
    // the scene target where it is renderable (the bloom probe above), 4 B/px instead of RGBA16F's 8 for the
    // one target every 3D fragment is written to and that the composite, SSR, haze and the mirror fold read
    // back at full res — on a tile GPU that is the store plus every read of the frame's biggest surface. No
    // reader takes scene alpha (tsl-post.js samples .rgb; the car tag is attachment 1, which keeps its own
    // half-float type), lit colour is never negative, and the composite's sceneHdr uniform is unchanged: the
    // scene is still float HDR. PHONES ONLY by default (the bandwidth-bound tier; a desktop keeps RGBA16F so
    // its goldens and env/mirror parity stay as they were). apex26.tlxScene11="1" forces it on, "0" keeps
    // RGBA16F — the Device Farm A/B pair. 11/11/10 keeps 6/6/5 mantissa bits: a banding check on a night
    // gradient is the device evidence this still owes (docs/notes/PERF-KNOWN-WINS-2026-10-23.md row 15).
    // WEBGPU LEG ONLY (revert of the WebGL2 leg, 2026-10-25: Device Farm iPhone 14 WebGL2, rg11b10 42.5 fps vs
    // RGBA16F 45.7 / 47.0, 55 vs 13-19 frames over 33 ms; docs/notes/LIVE-DEBUGGER-PHONEPERF-2026-10-24.md
    // §Reverted). WebGL2 keeps RGBA16F whatever the knob says. Stock three sizes the WebGPU fragment output to the target's three components, and the
    // spec refuses a src-alpha blend factor when the fragment output has no alpha (gpuweb "validating
    // GPUFragmentState"): every blended material's pipeline failed on the real-GPU census (macos-latest run
    // 40052670537 on 886e476f — decals, glass and particles would vanish). Vendored three patch 18 keeps a
    // vec4 output for RGB targets (the spec allows "RGB requires vec3 or vec4"); with it the same census is
    // green (run 40056676327, #3711). Renderability still gates WebGPU on the adapter's
    // "rg11b10ufloat-renderable" feature (bloom11 above); gfx-backend-canary pins patch 18 by behaviour.
    const _r11Blendable = r11Renderable && !!(renderer.backend && renderer.backend.isWebGPUBackend);
    let scene11 = _r11Blendable && !!ctx.isMobile;
    try {
      const k = localStorage.getItem("apex26.tlxScene11");
      if (k === "0") scene11 = false; else if (k === "1") scene11 = _r11Blendable;
    } catch (_) { /* no storage: the default above */ }
    // PHONE FORMAT TRIMS (#2649, docs/notes/TLX-WEBGPU-PASS-AUDIT-2026-10-27.md). WebGPU leg only, each OFF
    // until a device A/B (they change stored precision; the arms are listed on #3954), latched for the chain:
    //   apex26.tlxMir11=1 (scene11 only): the mirror's colour takes the scene's rg11b10, so three's pipeline
    //     key (it holds attachment 0's format) matches the scene's again and the mirror reuses its pipelines
    //     (A·W14), which an rgba16float mirror under an rg11b10 scene cannot; also 4 B/px instead of 8.
    //   apex26.tlxTag8=1: ssrTag r8unorm (1 B/px) on scene AND mirror (three keys on attachment 0 only, so
    //     the two must agree). Tags are 0.35 / 0.75 / alpha / 1 against 0.42-0.55 / 0.85-0.95 steps.
    //   apex26.tlxGodray11=1: the godray pair rg11b10 on frames whose alpha carries no folded AO (night).
    const _isWgpu = !!(renderer.backend && renderer.backend.isWebGPUBackend);
    const _fmtOn = (k) => { try { return localStorage.getItem(k) === "1"; } catch (_) { return false; } };
    const mir11 = scene11 && _fmtOn("apex26.tlxMir11");
    const tag8 = _isWgpu && _fmtOn("apex26.tlxTag8");
    const gr11Knob = _r11Blendable && _fmtOn("apex26.tlxGodray11");
    // sceneHdr is fixed for the chain's life — hdr is decided once at factory time.
    let _sceneHdr = hdr ? 1 : 0;

    // 1x1 no-op fallbacks (glx/post.js whiteTex/blackTex)
    function onePx(v) {
      const t = ownTexture(new THREE.DataTexture(new Uint8Array([v, v, v, 255]), 1, 1));
      t.colorSpace = THREE.NoColorSpace;
      t.needsUpdate = true;
      return t;
    }
    const whiteTex = onePx(255);
    const blackTex = onePx(0);
    // FXAA's explicit-gradient mirror tap needs a sampler even when compiled
    // with this constant 1x1 fallback (before the first mirror, or after off).
    blackTex.minFilter = blackTex.magFilter = THREE.LinearFilter;

    // LENS DIRT smudge map: the glx/post.js makeDirtTex canvas port —
    // deterministic LCG seed, value-noise base + grime blobs + dust specks +
    // wipe streaks. A failed canvas leaves the black fallback (knob no-ops).
    function makeDirtTex() {
      try {
        const cv = PostCommon.makeDirtCanvas();   // shared generator (GLX / WGX / TLX)
        if (!cv) return null;
        // Plain Texture over the canvas (CanvasTexture isn't exported by the
        // vendored webgpu bundle — same object, needsUpdate set by hand).
        const t = ownTexture(new THREE.Texture(cv));
        t.minFilter = THREE.LinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.generateMipmaps = false;
        t.colorSpace = THREE.NoColorSpace;
        t.needsUpdate = true;
        return t;
      } catch (_) { return null; }   // no canvas 2D → knob becomes a no-op (black fallback)
    }
    const dirtTex = makeDirtTex();

    // FIXED TARGETS (#2655, apex26.tlxFixedTargets; tlx.js decides, tsl-viewport.js
    // is the shader half). On: every target is allocated ONCE at the PRESENT size
    // (PW x PH; half and bloom levels derive from it exactly as they did from the
    // render size) and a resolution step only moves the LOGICAL rect (W x H) the
    // chain draws into — rt.viewport (0, 0, lw, lh), the top-left of the target on
    // both backends — and the ratio uniforms of the VP.tex readers. Off: place()
    // is rtSetSize and nothing else here changes.
    //
    // ORIENT COVER (#3311): on phones an equal-pixel orientation swap (422×195 ↔
    // 195×422) used to miss the same-size early-out, dispose+realloc every post
    // target, hitch the frame, and climb PerfGov. When the governor fixed-targets
    // flag is off we still stand up a local VP and keep a square physical cover
    // of max(w,h) so a transpose only moves logical viewports. fixedOk() stays
    // false unless ctx.fixedTargets — tlx.js canvas sizing must not flip.
    // Not on WebGPU: three r186 keeps rt.viewport only when it differs from the
    // CANVAS rect, and the cover's logical rect IS the canvas, so the scene filled
    // the square and every reader stretched it h/side (iPhone, 2026-10-26).
    const webgpu = !!(renderer && renderer.backend && renderer.backend.isWebGPUBackend);
    if (ctx.fixedTargets && ctx.vp && ctx.vp.enabled && ctx.vp.scope) viewportScope = ctx.vp.scope();
    let VP = viewportScope || ctx.vp || null;
    const fixed = !!(ctx.fixedTargets && VP && VP.enabled);
    const phonePost = !!ctx.isMobile;
    let orientCover = false;
    if (!fixed && phonePost && !webgpu && window.TLXShaders && TLXShaders.viewport) {
      try {
        VP = TLXShaders.viewport(THREE, TSL, { enabled: true });
        orientCover = !!(VP && VP.enabled);
      } catch (_) { VP = ctx.vp || null; orientCover = false; }
    }
    const phys = fixed || orientCover;   // place() uses physical + viewport
    let PW = 1, PH = 1;   // the physical (present) size; phys mode only
    // Post working size. Phones use PHONE_POST_SCALE of the scene dimensions;
    // aux passes (SSAO/godray/bloom) then halve that again. Desktop keeps pW===W.
    let pW = 1, pH = 1;

    // render-target helpers
    function makeRT(w, h, type, format) {
      const rt = ownRT(new THREE.RenderTarget(w, h, {
        type, depthBuffer: false,
        format: format || THREE.RGBAFormat,
      }));
      rt.texture.generateMipmaps = false;
      rt.texture.colorSpace = THREE.NoColorSpace;
      return rt;
    }

    // The CRITICAL target: every 3D pixel goes through it. Full-res HDR +
    // a SAMPLEABLE depth texture (NO compareFunction — raw reads for SSAO/
    // SSR/godray reconstruction; the shadow maps keep their own compare ones).
    let W = 1, H = 1;
    let compositeSizeDirty = true;
    // Track depth independently until the RenderTarget adopts it, so a target
    // constructor throw still releases a partially-created depth texture.
    const sceneDepthTex = ownTexture(new THREE.DepthTexture(1, 1));
    sceneDepthTex.name = "TLXSceneDepth";
    // R3 (perf hunt 3): ctx.ssrTag false builds the scene target with ONE
    // colour attachment. tlx.js passes false only while nothing can read the
    // tag for the session (eligible phones at tier >= 3, where both SSR paths
    // are shed and heat haze is mobileTier-gated off), so every scene
    // fragment stops writing — and a tile GPU stops storing — an attachment
    // the composite never fetches. The tag slot then binds its OWN 1x1 white
    // ("sealed world", the tag's background value): three merges texture nodes
    // that share a texture into one sampler (hunt-1 lesson 4).
    // DESKTOP TIERS: the extras this chain BUILDS, decided once from GfxQuality (tsl-gi.js buildPlan; null = none,
    // which is every phone, HIGH and below, and fixed / orient-cover targets). hiLive() says which are LIVE a frame.
    const GIM = (window.TLXShaders && TLXShaders.gi) || null;
    let HI = null;
    try {
      const plan = GIM ? GIM.buildPlan(GIM.gfxEnv({ webgpu, mobile: !!ctx.isMobile, phys, hdr })) : null;
      if (plan && GIM.anyBuilt(plan)) HI = plan;
    } catch (_) { HI = null; }
    const tagOn = ctx.ssrTag !== false;
    // PER-OBJECT VELOCITY (EXTREME, native WebGPU, tsl-aa.js velocityMrt): a third scene attachment, rg16f, written
    // by three's VelocityNode through tlx.js's scene MRT (each mesh's previous model matrix, the camera's previous
    // view, the unjittered projection), read by TRAA, SSGI accumulation and CINEMA motion blur. Only when one of them
    // is built; never with the tag off, on a phone, on WebGL2 or with fixed / cover targets: today's two attachments.
    const velOn = !!(tagOn && webgpu && !phys && !ctx.isMobile && TSL.velocity && TSL.mrt
      && (ctx.traa || (HI && (HI.ssgi || HI.motionBlur))));
    const sceneRT = ownRT(new THREE.RenderTarget(1, 1, {
      type: hdrType, count: tagOn ? (velOn ? 3 : 2) : 1, depthBuffer: true, depthTexture: sceneDepthTex,
      samples: ctx.sceneSamples || 0, resolveDepthBuffer: true,   // SCENE MSAA (header)
    }));
    ownedTextures.delete(sceneDepthTex); // sceneRT.dispose owns it from here
    if (scene11) { sceneRT.texture.type = THREE.UnsignedInt101111Type; sceneRT.texture.format = THREE.RGBFormat; }   // attachment 0 only
    sceneRT.texture.name = "output";
    sceneRT.texture.generateMipmaps = false;
    sceneRT.texture.colorSpace = THREE.NoColorSpace;
    // Attachment 1: SSR car-paint tag (0.35). r185 cannot store that in
    // scene alpha (NoBlending → isOpaque false → output.a is coverage).
    // Only .r is read: one channel of the SAME type (R16F / R8) holds the
    // same bytes as RGBA's .r. A RED target makes the tag output a float, so
    // on WebGL2 without per-attachment blending (no OES_draw_buffers_indexed)
    // material blending would read an undefined src alpha — keep RGBA there.
    let sceneTagTex = tagOn ? sceneRT.texture : onePx(255);
    const bk = renderer.backend || {};
    if (tagOn && sceneRT.textures && sceneRT.textures[1]) {
      if (bk.isWebGPUBackend || bk.drawBuffersIndexedExt) sceneRT.textures[1].format = THREE.RedFormat;
      if (tag8) sceneRT.textures[1].type = THREE.UnsignedByteType;
      sceneRT.textures[1].name = "ssrTag";
      sceneRT.textures[1].generateMipmaps = false;
      sceneRT.textures[1].colorSpace = THREE.NoColorSpace;
      sceneTagTex = sceneRT.textures[1];
    }
    const velTex = velOn && sceneRT.textures && sceneRT.textures[2] ? sceneRT.textures[2] : null;
    if (velTex) {
      velTex.format = THREE.RGFormat; velTex.type = THREE.HalfFloatType; velTex.name = "velocity";
      velTex.generateMipmaps = false; velTex.colorSpace = THREE.NoColorSpace;
      velTex.minFilter = velTex.magFilter = THREE.NearestFilter;
    }
    // LDR target: composite output, FXAA input (always allocated — FXAA is
    // the unconditional resolve, like GLX's ldrFBO).
    // hdrOut (tsl-aa.js hdrPeak): above 1 the composite writes highlights past SDR white, so its target is half-float.
    const hdrPeak = webgpu && ctx.hdrPeak > 1 ? +ctx.hdrPeak : 1;
    const ldrRT = makeRT(1, 1, hdrPeak > 1 ? THREE.HalfFloatType : THREE.UnsignedByteType);
    ldrRT.texture.name = "TLXPostLDR";
    // SGSR intermediate (render res): FXAA writes here when upscaling.
    let aaRT = null;

    // Lazily-created blocks (per-block bail: nothing until the gate opens).
    let ssaoRT = null, ssaoBlurRT = null, aoW = 1, aoH = 1;
    let godrayRT = null, godrayBlurRT = null, grW = 1, grH = 1;
    let _grLite = true;   // G1 — see the godray blur loop in present()
    try { _grLite = localStorage.getItem("apex26.grLite") !== "0"; } catch (_) { /* no storage: on */ }
    // D7: SSAO rides in the godray target's alpha when both run; =0 restores the pair.
    let _aoFold = true;
    try { _aoFold = localStorage.getItem("apex26.tlxAoFold") !== "0"; } catch (_) { /* no storage: on */ }
    // P2 / audit #6: fixed per-pair post materials (no .tex.value ping-pong).
    // apex26.tlxPostFixedMats=0 restores the shared-material swaps.
    let _fixedMats = true;
    try { _fixedMats = localStorage.getItem("apex26.tlxPostFixedMats") !== "0"; } catch (_) { /* on */ }
    const BLOOM_DIV = 2, BLOOM_LEVELS_MAX = 5;
    let bloomLv = null;    // [{rt,w,h}] x5, sized by layoutBloom
    let nLv = 0;

    function bindFixedAO() {
      if (!_fixedMats || !P.blurAOH || !ssaoRT) return;
      P.blurAOH.tex.value = ssaoRT.texture;
      P.blurAOV.tex.value = ssaoBlurRT.texture;
    }
    function bindFixedGR() {
      if (!_fixedMats || !P.blurGRH || !godrayRT) return;
      P.blurGRH.tex.value = godrayRT.texture;
      P.blurGRV.tex.value = godrayBlurRT.texture;
    }
    function bindFixedBloom() {
      if (!_fixedMats || !bloomLv || !P.downFixed) return;
      for (let i = 0; i < P.downFixed.length; i++) {
        if (bloomLv[i]) P.downFixed[i].tex.value = bloomLv[i].rt.texture;
      }
      if (P.upFinalFixed && bloomLv[1]) P.upFinalFixed.tex.value = bloomLv[1].rt.texture;
      if (P.upAddFixed) {
        for (let i = 0; i < P.upAddFixed.length; i++) {
          const src = i + 2;
          if (bloomLv[src]) P.upAddFixed[i].tex.value = bloomLv[src].rt.texture;
        }
      }
    }
    function ensureAO() {
      if (!ssaoRT) {
        // R8, as GLX: r8unorm / R8 are core renderable + filterable on both
        // backends, and every reader (blur, composite, ?viz=ssao) uses .r only.
        ssaoRT = makeRT(1, 1, THREE.UnsignedByteType, THREE.RedFormat);
        ssaoBlurRT = makeRT(1, 1, THREE.UnsignedByteType, THREE.RedFormat);
        layoutHalf();
        bindFixedAO();
      }
      return true;
    }
    let _gr11 = false;   // the live godray pair is rg11b10 (apex26.tlxGodray11)
    function ensureGR(r11) {
      if (godrayRT && _gr11 !== r11) releaseGR();   // a fold arriving needs the alpha back
      if (!godrayRT) {
        _gr11 = r11;
        godrayRT = r11 ? makeRT(1, 1, THREE.UnsignedInt101111Type, THREE.RGBFormat) : makeRT(1, 1, hdrType);
        godrayBlurRT = r11 ? makeRT(1, 1, THREE.UnsignedInt101111Type, THREE.RGBFormat) : makeRT(1, 1, hdrType);
        layoutHalf();
        bindFixedGR();
      }
      return true;
    }
    function ensureBloom() {
      if (!bloomLv) {
        bloomLv = [];
        for (let i = 0; i < BLOOM_LEVELS_MAX; i++) {
          const rt = bloom11 ? makeRT(1, 1, THREE.UnsignedInt101111Type, THREE.RGBFormat) : makeRT(1, 1, hdrType);
          bloomLv.push({ rt, w: 1, h: 1 });
        }
        layoutBloom();
        bindFixedBloom();
      }
      return nLv > 0;
    }
    // three r185+ (#33511): RenderTarget.setSize updates image dims then calls
    // this.dispose(), which frees GPU memory via the renderer while keeping the
    // Texture objects on the RT. The r184 workaround disposed those Texture
    // objects AFTER setSize; on r186 that destroys the textures the RT still
    // holds, so the next draw mints replacements while the disposed ones can
    // linger in three's caches — a permanent cost after every renderScale step
    // (BrowserStack iPhone 2026-10-21: return to 0.5 never recovered).
    let _rtResizes = 0;   // state().rtResizes: target reallocations (#2655 evidence)
    function rtSetSize(rt, w, h) {
      if (rt.width === w && rt.height === h) return;
      _rtResizes++;
      rt.setSize(w, h);
    }
    // Give rt its logical size lw x lh inside the physical pw x ph. Off: a plain
    // resize. On (fixed or #3311 orient cover): the allocation only changes when
    // the physical size does; the viewport and the readers' ratio follow the
    // logical size every time.
    function place(rt, lw, lh, pw, ph) {
      if (!phys) { rtSetSize(rt, lw, lh); return; }
      rtSetSize(rt, pw, ph);                 // no-op once allocated at this size
      rt.viewport.set(0, 0, lw, lh);         // rtSetSize/setSize resets it: set AFTER
      const ts = rt.textures || (rt.texture ? [rt.texture] : []);
      for (let i = 0; i < ts.length; i++) VP.layout(ts[i], lw, lh, pw, ph);
      if (rt.depthTexture) VP.layout(rt.depthTexture, lw, lh, pw, ph);
    }
    const halfOf = (v) => Math.max(1, Math.floor(v / 2));
    // DESKTOP TIERS (tsl-gi.js): ssaoHi / gtao put the AO pair at the full post size (never with phys targets: the
    // build plan is empty there); SSGI's pair is half size; DoF / motion blur ping-pong two LDR targets at post size.
    let _aoFull = false;
    let giRT = null, giBlurRT = null, giW = 1, giH = 1, cineA = null, cineB = null;
    // SSGI accumulation (tsl-gi.js giAccPass): a half-float history pair at the GI size; alpha holds view depth.
    let giHist = null, giHi = 0, giPrevOk = false, giFrames = 0, giResets = 0, _giN = 0;
    const _giPrevVP = new Float32Array(16), _giEye = [0, 0, 0], _giFwd = [0, 0, 1], _giFwdNow = [0, 0, 1], _giPh = [0, 0];
    const PHONE_POST_SCALE = 1;   // phone post size × scene; 1 = full res (pre-#3479)
    const postSize = (v) => Math.max(1, Math.floor(Math.max(1, v | 0) * (phonePost ? PHONE_POST_SCALE : 1)));
    function layoutHalf() {
      // Base AO/GR off the post working size, including physical allocations.
      aoW = _aoFull ? Math.max(1, pW) : halfOf(pW);
      aoH = _aoFull ? Math.max(1, pH) : halfOf(pH);
      grW = halfOf(pW); grH = halfOf(pH);
      const physBaseW = fixed ? postSize(PW) : (orientCover ? PW : pW);
      const physBaseH = fixed ? postSize(PH) : (orientCover ? PH : pH);
      const pw = phys ? halfOf(physBaseW) : aoW, ph = phys ? halfOf(physBaseH) : aoH;
      if (ssaoRT) { place(ssaoRT, aoW, aoH, pw, ph); place(ssaoBlurRT, aoW, aoH, pw, ph); }
      if (godrayRT) { place(godrayRT, grW, grH, pw, ph); place(godrayBlurRT, grW, grH, pw, ph); }
      if (giRT) { giW = grW; giH = grH; rtSetSize(giRT, giW, giH); rtSetSize(giBlurRT, giW, giH); }
      if (giHist && (giHist[0].width !== giW || giHist[0].height !== giH)) {   // a resize resets the accumulation
        rtSetSize(giHist[0], giW, giH); rtSetSize(giHist[1], giW, giH); giPrevOk = false;
      }
      if (cineA) { rtSetSize(cineA, pW, pH); rtSetSize(cineB, pW, pH); }
    }
    function layoutBloom() {
      if (!bloomLv) return;
      let bw = Math.max(1, Math.floor(pW / BLOOM_DIV));
      let bh = Math.max(1, Math.floor(pH / BLOOM_DIV));
      const physBloomW = fixed ? postSize(PW) : (orientCover ? PW : pW);
      const physBloomH = fixed ? postSize(PH) : (orientCover ? PH : pH);
      let pbw = Math.max(1, Math.floor(physBloomW / BLOOM_DIV)), pbh = Math.max(1, Math.floor(physBloomH / BLOOM_DIV));
      nLv = 0;
      for (let i = 0; i < bloomLv.length; i++) {
        // Phys: a level exists while the PHYSICAL one does; the logical count can only be lower.
        if (bw >= 8 && bh >= 8) {
          place(bloomLv[i].rt, bw, bh, pbw, pbh);
          bloomLv[i].w = bw; bloomLv[i].h = bh;
          nLv++;
        } else if (phys && pbw >= 8 && pbh >= 8) {
          place(bloomLv[i].rt, 1, 1, pbw, pbh);   // allocated, unused at this scale
          bloomLv[i].w = 1; bloomLv[i].h = 1;
        }
        bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
        pbw = Math.max(1, pbw >> 1); pbh = Math.max(1, pbh >> 1);
      }
    }

    // the TSL pass set (tsl-post.js) — needs the REAL scene textures
    // AgX (tsl-post.js toneMap): an EXTREME opt-in of its own, apex26.tlxAgx=1 read ONCE here (setAgx below writes
    // it; the next chain build reads it). The tone-map knob stays numeric and shared with GLX; ACES is the default.
    let agx = false;
    try {
      agx = webgpu && !ctx.isMobile && !phys && typeof GfxQuality !== "undefined" && typeof TSL.agxToneMapping === "function";
      const preset = agx && GfxQuality.detail() >= 2 && localStorage.getItem("apex26.tlxAgx") === "1";
      agx = agx && (GfxQuality.option ? GfxQuality.option("agx", preset) : preset);
    } catch (_) { agx = false; }
    // SSGI temporal accumulation (tsl-gi.js giAccPass): wherever SSGI is built on native WebGPU.
    const giTemporal = !!(HI && HI.ssgi && webgpu);
    const EX0 = agx || velTex || giTemporal ? { agx, velTex, giTemporal } : null;
    const postCtx = (hi, ex) => Object.assign({
      chunks: ctx.chunks, shadow,
      sceneTex: sceneRT.texture, sceneTagTex, sceneDepthTex,
      dirtTex, whiteTex, blackTex,
      trackMaterial, vp: phys ? VP : null, hdrPeak,
      hi, ownTexture,
    }, ex || {});
    // A desktop extra that fails to build must not cost the chain: first without this PR's extras (velocity, SSGI
    // accumulation, AgX), then today's pass set with nothing extra. With neither, a throw is the chain's (as before).
    const attempts = [];
    if (EX0) attempts.push([HI, EX0]);
    attempts.push([HI, null]);
    if (HI) attempts.push([null, null]);
    let P = null, EX = null;
    for (let i = 0; i < attempts.length && !P; i++) {
      try { P = TLXShaders.post(THREE, TSL, postCtx(attempts[i][0], attempts[i][1])); HI = attempts[i][0]; EX = attempts[i][1]; } catch (e) {
        if (i === attempts.length - 1) throw e;
        try { Log.warn("gfx", "TLX post: desktop-tier passes failed to build, falling back: " + (e && e.message)); } catch (_) { /* harness */ }
      }
    }
    if (!EX) agx = false;
    ownTexture(P.composite && P.composite.giOffTex);
    let _hiLive = null, _hiAge = 0, _hiLatched = false;
    // feature() reads storage; a 15-present cadence keeps it off the hot path (a shed or the cinema flag lands <0.25 s late).
    function hiLive() {
      if (!HI) return null;
      if (_hiLive && _hiAge++ < 15) return _hiLive;
      _hiAge = 0;
      try { _hiLive = GIM.livePlan(HI, GIM.gfxFeature); } catch (_) { _hiLive = null; }
      return _hiLive;
    }
    ownTexture(P.composite && P.composite.grOffTex);   // the godray slot's own "off" black
    if (P.composite && P.composite.U) P.composite.U.sceneHdr.value = _sceneHdr;
    if (P.composite && P.composite.U && P.composite.U.hdrPeak) P.composite.U.hdrPeak.value = hdrPeak;
    // traa (tsl-aa.js): TEMPORAL AA in place of FXAA on native WebGPU when tlx.js passes ctx.traa. A build throw
    // keeps FXAA: AA stays null and nothing below changes.
    if (ctx.traa && webgpu && window.TLXAA && TLXAA.taa) {
      try {
        const aaCtx = { runPass: (m, t) => runPass(m, t), ownRT, trackMaterial, ldrTex: ldrRT.texture, depthTex: sceneDepthTex };
        // Per-object velocity first; a throw keeps the camera-only TRAA, a second throw FXAA.
        if (velTex) { try { AA = TLXAA.taa(THREE, TSL, Object.assign({ velTex }, aaCtx)); } catch (_) { AA = null; } }
        if (!AA) AA = TLXAA.taa(THREE, TSL, aaCtx);
      } catch (e) { AA = null; try { Log.warn("gfx", "TLX TRAA build failed, FXAA kept —", e); } catch (_) { /* harness */ } }
    }
    // The TAA runs on a frame with nothing else claiming the final pass: no ?viz=, no fixed/cover targets, no SGSR.
    const taaLive = () => !!(AA && !viz && !phys && !(typeof PhotoStudioBody !== "undefined" && PhotoStudioBody.sampling) && !(ctx.wantSpatialUpscale && ctx.wantSpatialUpscale()));

    // Frames a lazy block may stay shut before its targets are disposed.
    // Eight presents is ~130 ms at 60 Hz: long enough that a one-frame gate
    // flicker keeps the pair, short enough that a shed does not hold the
    // half-res surfaces for the rest of the session (plan M-11).
    const SHED_FRAMES = 8;
    let aoIdle = 0, grIdle = 0, bloomIdle = 0, giIdle = 0, cineIdle = 0;
    function dropRT(rt) {
      if (!rt) return;
      ownedRTs.delete(rt);
      try { rt.dispose(); } catch (_) { /* device already dying */ }
    }
    function unbind(slot, fallback) {
      if (slot) slot.value = fallback;
    }
    function releaseAO() {
      if (!ssaoRT && !ssaoBlurRT) return;
      if (P.gi && P.gi.gtaoH) { unbind(P.gi.gtaoH.tex, whiteTex); unbind(P.gi.gtaoV.tex, whiteTex); }
      if (P.blurAOH) unbind(P.blurAOH.tex, whiteTex);
      if (P.blurAOV) unbind(P.blurAOV.tex, whiteTex);
      if (P.blurAO) unbind(P.blurAO.tex, whiteTex);
      if (P.composite && P.composite.tex) unbind(P.composite.tex.ssao, whiteTex);
      dropRT(ssaoRT); dropRT(ssaoBlurRT);
      ssaoRT = null; ssaoBlurRT = null;
    }
    function releaseGR() {
      if (!godrayRT && !godrayBlurRT) return;
      if (P.blurGRH) unbind(P.blurGRH.tex, blackTex);
      if (P.blurGRV) unbind(P.blurGRV.tex, blackTex);
      if (P.blurGR) unbind(P.blurGR.tex, blackTex);
      if (P.godray) unbind(P.godray.tex, blackTex);
      if (P.composite && P.composite.tex) unbind(P.composite.tex.godray, P.composite.grOffTex || blackTex);
      dropRT(godrayRT); dropRT(godrayBlurRT);
      godrayRT = null; godrayBlurRT = null;
    }
    function releaseBloom() {
      if (!bloomLv) return;
      if (P.bright) unbind(P.bright.tex, blackTex);
      if (P.down) unbind(P.down.tex, blackTex);
      if (P.upFinal) unbind(P.upFinal.tex, blackTex);
      if (P.upAdd) unbind(P.upAdd.tex, blackTex);
      if (P.downFixed) for (let i = 0; i < P.downFixed.length; i++) if (P.downFixed[i]) unbind(P.downFixed[i].tex, blackTex);
      if (P.upFinalFixed) unbind(P.upFinalFixed.tex, blackTex);
      if (P.upAddFixed) for (let i = 0; i < P.upAddFixed.length; i++) if (P.upAddFixed[i]) unbind(P.upAddFixed[i].tex, blackTex);
      if (P.composite && P.composite.tex) unbind(P.composite.tex.bloom, blackTex);
      for (let i = 0; i < bloomLv.length; i++) dropRT(bloomLv[i].rt);
      bloomLv = null;
      nLv = 0;
    }
    function releaseGI() {
      if (!giRT) return;
      const G = P.gi;
      if (G && G.giH) { unbind(G.giH.tex, blackTex); unbind(G.giV.tex, blackTex); }
      if (P.composite.tex.gi) unbind(P.composite.tex.gi, P.composite.giOffTex || blackTex);
      dropRT(giRT); dropRT(giBlurRT);
      giRT = null; giBlurRT = null;
      if (G && G.giAcc) { unbind(G.giAcc.cur, blackTex); unbind(G.giAcc.hist, blackTex); }
      if (giHist) { dropRT(giHist[0]); dropRT(giHist[1]); giHist = null; }
      giPrevOk = false;
    }
    let focusRT = null, _fi = 0, _focusOk = false, _focusT = 0, _prevOk = false;
    const _prevVP = new Float32Array(16);
    function releaseCine() {
      const G = P.gi;
      if (G && G.motionBlur) unbind(G.motionBlur.src, blackTex);
      if (G && G.dof) { unbind(G.dof.src, blackTex); unbind(G.dof.focusTex, blackTex); }
      if (G && G.focus) unbind(G.focus.prevTex, blackTex);
      if (cineA) { dropRT(cineA); dropRT(cineB); cineA = null; cineB = null; }
      if (focusRT) { dropRT(focusRT[0]); dropRT(focusRT[1]); focusRT = null; }
      _focusOk = false;
    }
    function ensureGI() {
      if (!giRT || (P.gi && P.gi.giAcc && !giHist)) {
        if (!giRT) { giRT = makeRT(1, 1, hdrType); giBlurRT = makeRT(1, 1, hdrType); }
        if (P.gi && P.gi.giAcc && !giHist) giHist = [makeRT(1, 1, THREE.HalfFloatType), makeRT(1, 1, THREE.HalfFloatType)];
        layoutHalf();
      }
      return true;
    }
    function ensureCine() {
      if (!cineA) { cineA = makeRT(1, 1, ldrRT.texture.type); cineB = makeRT(1, 1, ldrRT.texture.type); layoutHalf(); }
      return true;
    }
    function ensureFocus() {
      if (!focusRT) { focusRT = [makeRT(1, 1, hdrType), makeRT(1, 1, hdrType)]; _focusOk = false; }
      return true;
    }
    function setAoFull(on) {
      if (_aoFull === on) return;
      _aoFull = on;
      layoutHalf();
    }
    // CINEMA (dof / motionBlur live): composite output -> motion blur -> depth of field, ping-ponging cineA / cineB.
    // Returns the target the AA resolve reads (src itself when neither runs, which is every frame below EXTREME).
    function cinemaPost(src, F, o) {
      const HV = _hiLive, G = P.gi;
      _last.dof = false; _last.mblur = false;
      if (!HV || !G || viz || !F || !(HV.dof || HV.motionBlur)) { _focusOk = false; return src; }
      let cur = src;
      const next = () => (cur === cineA ? cineB : cineA);
      if (HV.motionBlur && G.motionBlur && F.invVP && F.viewProj) {
        ensureCine();
        const M = G.motionBlur;
        M.U.invVP.value.fromArray(F.invVP);
        M.U.prevVP.value.fromArray(_prevOk ? _prevVP : F.viewProj);
        M.src.value = cur.texture;
        const out = next();
        runPass(M.mat, out); cur = out; _last.mblur = true;
      }
      if (HV.dof && G.dof && G.focus && F.invProj && F.proj) {
        ensureCine(); ensureFocus();
        const FU = G.focus.U, D = G.dof;
        setPersp(FU, F.invProj, F.proj);
        const now = typeof performance !== "undefined" ? performance.now() : 0;
        FU.blend.value = GIM.focusBlend((now - _focusT) / 1000, !_focusOk);
        _focusT = now; _focusOk = true;
        FU.fixed.value = o && o.focusDist > 0 ? o.focusDist : 0;
        G.focus.prevTex.value = focusRT[_fi ^ 1].texture;
        runPass(G.focus.mat, focusRT[_fi]);
        setPersp(D.U, F.invProj, F.proj);
        D.U.texel.value.set(1 / pW, 1 / pH);
        D.U.maxPx.value = GIM.DOF.maxPx1080 * pH / 1080;
        D.focusTex.value = focusRT[_fi].texture;
        _fi ^= 1;
        D.src.value = cur.texture;
        const out = next();
        runPass(D.mat, out); cur = out; _last.dof = true;
      } else _focusOk = false;
      return cur;
    }
    // have* is this frame's gate. A shut block counts; an open one resets.
    function shedIdle(live, idle, release) {
      if (live) return 0;
      idle++;
      if (idle >= SHED_FRAMES) { release(); return 0; }
      return idle;
    }

    // fullscreen runner
    quad = new THREE.QuadMesh();
    // QuadMesh.render() swaps three's own full-screen vertex node in for the
    // draw only; compileAsync(quad) builds the material's (null) one, a
    // different program, so no quad compile warm ever matched a draw (W6).
    // Capture that node once and pin it on each pass material (setQuadMat):
    // render() then swaps in the same node, and a compile keys its program.
    let _quadVN = null;
    quad.render({ render(q) { _quadVN = q.material.vertexNode; } });
    function setQuadMat(mat) {
      if (_quadVN && mat && !mat.vertexNode) mat.vertexNode = _quadVN;
      quad.material = mat;
    }
    let compileJobs = null;
    // load=false CLEARS first (only called inside present(), which restores
    // autoClear): a full-viewport NoBlending quad overwrites every pixel, so a
    // clear is byte-identical and spares a tile GPU the read of the old target.
    // Only the additive UP passes and the mirror inset (a viewport rect) load.
    // A-W1 draw warm (drawWarm below): every pass DRAWS once into its own
    // target under a 1x1 scissor, so the driver's first-draw work (ANGLE-Metal's
    // pipeline state, vertex/format conversion) lands in the warm, not on the
    // race's first frames. Never a DRAW to the canvas (target null): it would
    // present a fresh, black drawing buffer for the rest of the warm. A canvas
    // pass (FXAA, SGSR, the mirror over SGSR) is COMPILED there instead:
    // compileAsync takes the target, MRT and depth synchronously, so it keys
    // the pipeline present() draws. Census 41021224706 (Dawn/Metal) built
    // FXAA's mid-race (createShaderModule x2 from runPass): the WebGPU post
    // warm() is off and no warm reached a canvas pass.
    let _scissorWarm = false, _warmDraws = 0, _warmSc = null, _warmCanvas = 0, _warmCanvasOnly = false, _warmFlipUp = false;
    // Canvas compiles run ONE AT A TIME: compileAsync parks its context, handler and promise list on the renderer for
    // its whole run, so the two a draw warm issues (SGSR, then FXAA, across the upscale switch) overlapped and one
    // pipeline went unbuilt (W6 flaked ~1 in 10). Each job sets the state it keys on, calls, and puts it back at once.
    let _warmCompiles = Promise.resolve();
    function compileCanvas(mat) {
      const mrt = renderer.getMRT();
      const job = () => {
        if (disposed) return;
        const rt = renderer.getRenderTarget(), mrt0 = renderer.getMRT();
        setQuadMat(mat); renderer.setRenderTarget(null); renderer.setMRT(mrt);
        try { return renderer.compileAsync(quad, quad.camera); } finally { renderer.setRenderTarget(rt); renderer.setMRT(mrt0); }
      };
      _warmCompiles = _warmCompiles.then(job).catch(() => { /* the live draw builds it then */ });
    }
    // SUBMIT HOLD (vendor PATCHES.md §21; docs/notes/RENDER-FRAME-COST-2026-11-18.md). three submits once per render
    // context, so this chain is one queue.submit per pass (ten at the phone tier) and WebKit does not coalesce
    // command buffers. While ctx.postSubmitHold() is on (WebGPU only, default off: ?lab=postSubmit or
    // __tlx.postSubmit(true)), present() parks the chain's finished command buffers on device.apexSubmitHold and
    // submits them in ONE call, in order, before any target is shed. A held buffer reads its uniforms at submit,
    // so a material drawn twice in one chain (the unfixed blur / bloom materials, the second godray blur pair)
    // would see its LAST values in both passes: runPass submits what is held before a repeat. The same holds for
    // three's screenSize, ONE shared render-group buffer rewritten at every render() with that target's size (it
    // is what screenUV divides by): passes of different sizes cannot share a submit, so runPass also submits when
    // the target size changes. The phone chain then goes out as 6 submits (AO trio + bright, down, down, up, up,
    // composite + FXAA), not 10.
    const _hold = [], _holdSeen = new Set();
    let _holdDev = null, _holdSize = -1;
    function holdBegin() {
      _last.held = 0; _last.submits = 0;
      if (_holdDev || !webgpu || compileJobs || _scissorWarm || !(ctx.postSubmitHold && ctx.postSubmitHold())) return;
      const dev = renderer.backend && renderer.backend.device;
      if (!dev || !dev.queue) return;
      _holdDev = dev; _hold.length = 0; _holdSeen.clear(); _holdSize = -1;
      dev.apexSubmitHold = _hold;
    }
    function holdFlush(again) {
      const dev = _holdDev;
      if (!dev) return;
      dev.apexSubmitHold = null;
      _holdSeen.clear();
      try { if (_hold.length) { _last.held += _hold.length; _last.submits++; dev.queue.submit(_hold); } }
      finally { _hold.length = 0; if (again) dev.apexSubmitHold = _hold; else _holdDev = null; }
    }
    function runPass(mat, target, load) {
      if (compileJobs) { compileJobs.push({ mat, target }); return; }
      if (_scissorWarm) {
        if (!target) {
          compileCanvas(mat);
          _warmCanvas++;
          return;
        }
        if (_warmCanvasOnly) return;
        // r187 scissors a bound target by its OWN scissorTest, not renderer.setScissorTest (which gates the canvas).
        const st0 = target.scissorTest;
        (_warmSc || (_warmSc = target.scissor.clone())).copy(target.scissor); target.scissor.set(0, 0, 1, 1); target.scissorTest = true;
        setQuadMat(mat);
        renderer.setRenderTarget(target);
        renderer.autoClear = false;   // a clear (WebGPU loadOp) ignores the scissor
        try { quad.render(renderer); _warmDraws++; } finally { target.scissor.copy(_warmSc); target.scissorTest = st0; }
        return;
      }
      if (_holdDev) {
        // The canvas pass is keyed on its DRAWING BUFFER (what three writes to screenSize), not the present size:
        // at a render scale under 1 with no upscale the two differ.
        const cv = target ? null : renderer.domElement, size = target ? target.width * 65536 + target.height : (cv ? cv.width * 65536 + cv.height : -2);
        if (_holdSeen.has(mat) || (size !== _holdSize && _hold.length)) holdFlush(true);
        _holdSeen.add(mat); _holdSize = size;
      }
      setQuadMat(mat);
      renderer.setRenderTarget(target);
      renderer.autoClear = !load;
      quad.render(renderer);
    }

    // Rear-view mirror (tlx.js mirrorBegin/End render it; present() composites
    // it LAST — inside the FXAA pass, or over the SGSR output — into the rect
    // tlx.js hands over in present-target pixels, top-left origin). null tex =
    // no mirror this frame.
    let _mirTex = null, _mirHdr = true, _mirComposites = 0, _mirFlip = true;
    const _mirRect = [0, 0, 0, 0];
    let _mirPrevVP = null;   // the canvas viewport to restore (made on first use)
    function setMirror(tex, rect, hdr, flip) {
      _mirTex = tex && rect && rect[2] >= 2 && rect[3] >= 2 ? tex : null;
      if (_mirTex) { _mirRect[0] = rect[0]; _mirRect[1] = rect[1]; _mirRect[2] = rect[2]; _mirRect[3] = rect[3]; }
      _mirHdr = !!hdr;
      _mirFlip = flip !== false;
    }
    // Quit-to-menu (#4219): tlx.js disposes the mirror target, so no texture node may keep naming it.
    function releaseMirror() {
      _mirTex = null;
      if (P && P.mirror) P.mirror.tex.value = blackTex;
      if (P && P.fxaa && P.fxaa.mirTex) P.fxaa.mirTex.value = blackTex;
    }
    // The rect / hdr / flip uniforms are shared by the mirror pass and the
    // FXAA fold (tsl-post.js mirrorU); false = no mirror this frame.
    function mirrorUniforms() {
      const M = P.mirror;
      if (!_mirTex || !M) return false;
      M.U.rect.value.set(_mirRect[0], _mirRect[1], _mirRect[2], _mirRect[3]);
      M.U.hdr.value = _mirHdr ? 1 : 0;
      if (M.U.flip) M.U.flip.value = _mirFlip ? 1 : 0;
      return true;
    }
    // D8 (TLX-PERF-HUNT): on the FXAA -> canvas path the inset is drawn inside
    // the FXAA pass (same target, filter, implicit LOD and overwrite), so the
    // canvas takes ONE render pass. apex26.tlxMirFold=0 restores the second
    // pass. Returns whether the FXAA pass carries it this frame.
    let _mirFold = true;
    try { _mirFold = localStorage.getItem("apex26.tlxMirFold") !== "0"; } catch (_) { /* no storage: on */ }
    function fxaaMirror(on) {
      const FX = P.fxaa;
      const fold = !!(on && _mirFold && FX.mirTex && mirrorUniforms());
      FX.U.mir.value = fold ? 1 : 0;
      FX.mirTex.value = fold ? _mirTex : blackTex;   // never hold a dead mirror target
      return fold;
    }
    // Viewport, not scissor: the quad covers exactly the viewport. A target's
    // own .viewport is what three reads when one is bound; the renderer's is
    // the canvas's (pixelRatio 1, tlx.js).
    function mirrorPass(dest, count = true) {
      const M = P.mirror;
      if (!mirrorUniforms()) return;
      M.tex.value = _mirTex;
      if (dest) dest.viewport.set(_mirRect[0], _mirRect[1], _mirRect[2], _mirRect[3]);
      else { renderer.getViewport(_mirPrevVP || (_mirPrevVP = new THREE.Vector4())); renderer.setViewport(_mirRect[0], _mirRect[1], _mirRect[2], _mirRect[3]); }
      try { runPass(M.mat, dest, true); if (count) _mirComposites++; }
      finally {
        if (dest) dest.viewport.set(0, 0, dest.width, dest.height);
        else renderer.setViewport(_mirPrevVP);
      }
    }

    // D11: the shader-side scalars of a perspective proj / invProj (tsl-post.js
    // perspU). Anything else (skew, ortho) would break the scalar form: say so
    // once rather than silently mis-reconstruct every SSAO / SSR tap.
    let _perspWarned = false;
    function setPersp(U, ip, p) {
      U.ipXY.value.set(ip[0], ip[5], ip[12], ip[13]);
      U.ipZW.value.set(ip[14], ip[11], ip[15]);
      if (!p) return;
      U.pXY.value.set(p[0], p[5], p[8], p[9]);
      U.pW.value = p[11];
      if (!_perspWarned && (p[1] || p[2] || p[3] || p[4] || p[6] || p[7] || p[12] || p[13] || p[15])) {
        _perspWarned = true;
        try { Log.warn("gfx", "TLX post: non-perspective projection; SSAO/SSR assume a perspective proj"); } catch (_) { /* harness */ }
      }
    }

    // God-ray lamp-selection scratch (present() only) — no per-frame allocs.
    const _grSel = [];
    const _sunScr = { visible: false, ndcx: -5, ndcy: -5, flare: 0, shaft: 0 };   // PostCommon.sunScreen scratch
    // Partial select nearest-K over _grSel — PostCommon.keepNearest (one copy for
    // GLX / WGX / TLX; swap-not-overwrite eviction).
    const _grKeepNearest = (total, k) => PostCommon.keepNearest(_grSel, total, k);

    // Last-presented-frame block states (__tlx.postState()).
    const _last = { ssao: false, bloom: false, shafts: false, ssr: false, fxaa: false, sgsr: false, taa: false, held: 0, submits: 0,
      aoHi: 0, rays: 0, gi: false, ssrHi: false, dof: false, mblur: false };   // the desktop-tier extras that ran
    let _lastPresentRT = null;

    // w x h: the render (logical) size; pw x ph: the present size (phys mode).
    // Orient cover (#3311): physical is a square max(w,h) so a transpose fits
    // with no realloc.
    function resize(w, h, pw, ph) {
      let nPW = 0, nPH = 0;
      if (fixed) {
        nPW = Math.max(1, pw | 0, w | 0);
        nPH = Math.max(1, ph | 0, h | 0);
        // #3311: equal-pixel orientation — grow physical to cover both axes so a
        // 422×195 ↔ 195×422 swap does not dispose the chain (PerfGov hitch).
        if (PW > 1 && PH > 1 && Math.abs(nPW - PH) <= 1 && Math.abs(nPH - PW) <= 1) {
          nPW = Math.max(PW, nPW); nPH = Math.max(PH, nPH);
        }
      } else if (orientCover) {
        const side = Math.max(1, w | 0, h | 0);
        nPW = side; nPH = side;
        // Grow-only across flips: never shrink the cover on a transpose (the
        // new side equals the old max). A real shrink (scale step) may reduce.
        if (PW > 1 && PH > 1) {
          const transpose = Math.abs((w | 0) - H) <= 1 && Math.abs((h | 0) - W) <= 1;
          if (transpose) { nPW = Math.max(PW, nPW); nPH = Math.max(PH, nPH); }
        }
      }
      const nPostW = postSize(w);
      const nPostH = postSize(h);
      if (w === W && h === H && nPW === PW && nPH === PH && nPostW === pW && nPostH === pH) {
        // Still may need aaRT when flag toggles at same render size.
        syncAaRT();
        return;
      }
      W = Math.max(1, w | 0); H = Math.max(1, h | 0);
      compositeSizeDirty = true;
      PW = nPW; PH = nPH;
      pW = nPostW; pH = nPostH;
      // Fixed: LDR physical tracks present. Orient cover: same square as scene.
      const ldrPW = fixed ? postSize(PW) : (orientCover ? PW : pW);
      const ldrPH = fixed ? postSize(PH) : (orientCover ? PH : pH);
      place(sceneRT, W, H, PW, PH);
      place(ldrRT, pW, pH, ldrPW, ldrPH);
      layoutHalf();
      layoutBloom();
      syncAaRT();
    }
    function syncAaRT() {
      // Fixed: the AA target always exists (the upscale reads it the moment the
      // logical size drops below the present size — allocating then would be the realloc).
      const want = !!(P.sgsr && (fixed || (ctx.wantSpatialUpscale && ctx.wantSpatialUpscale())));
      if (want) {
        if (!aaRT) {
          aaRT = makeRT(phys ? 1 : pW, phys ? 1 : pH, ldrRT.texture.type);
          aaRT.texture.name = "TLXPostAA";
        }
        const aaPW = fixed ? postSize(PW) : (orientCover ? PW : pW);
        const aaPH = fixed ? postSize(PH) : (orientCover ? PH : pH);
        place(aaRT, pW, pH, aaPW, aaPH);
      } else if (aaRT) {
        // _lastPresentRT may still BE this target (present() stores `dest ||
        // aaRT`), and presentedTarget() hands it to a capture. Disposing
        // without clearing it left a screenshot after setSpatialUpscale(false)
        // reading a destroyed render target; null it so the getter falls back
        // to ldrRT, which is the honest answer once the AA target is gone.
        if (_lastPresentRT === aaRT) _lastPresentRT = null;
        unbind(P.sgsr.tex, blackTex);
        dropRT(aaRT);
        aaRT = null;
      }
    }

    // hdrOut: a capture (screenshot, soft present) unpacks RGBA8 rows, so a half-float source is first copied
    // through the debug blit (which clamps to 0..1: the SDR view of the HDR frame) into an 8-bit target.
    let cap8RT = null;
    function cap8(rt) {
      if (!rt || !rt.texture || rt.texture.type === THREE.UnsignedByteType || !P.blit) return rt;
      try {
        if (!cap8RT) { cap8RT = makeRT(rt.width, rt.height, THREE.UnsignedByteType); cap8RT.texture.name = "TLXPostCap8"; }
        rtSetSize(cap8RT, rt.width, rt.height);
        const B = P.blit, t0 = renderer.getRenderTarget(), ac = renderer.autoClear, tex0 = B.tex.value;
        try {
          B.U.mono.value = 0; B.U.gain.value = 1; B.tex.value = rt.texture;
          runPass(B.mat, cap8RT);
        } finally { B.tex.value = tex0; renderer.setRenderTarget(t0); renderer.autoClear = ac; }
        return cap8RT;
      } catch (_) { return rt; }
    }

    // Lens textures belong to this post chain. Update each at its source cadence.
    let bendTexture = null, lightTexture = null, lightRevision = -1, lightW = 0, lightH = 0;
    function bindLens(lens) {
      if (!P.fxaa.bendTex) return;
      const field = lens && lens.bend;
      if (lens && lens.light) {
        if (lightTexture && (lens.light.width !== lightW || lens.light.height !== lightH)) {
          ownedTextures.delete(lightTexture);
          lightTexture.dispose();
          lightTexture = null;
        }
        if (!lightTexture) {
          lightW = lens.light.width; lightH = lens.light.height;
          lightTexture = ownTexture(new THREE.CanvasTexture(lens.light));
          lightTexture.generateMipmaps = lightTexture.flipY = false;
          lightTexture.minFilter = lightTexture.magFilter = THREE.LinearFilter;
          lightTexture.premultiplyAlpha = true;
        }
        if (lightRevision !== lens.revision) {
          lightTexture.needsUpdate = true;
          lightRevision = lens.revision;
        }
        P.fxaa.lightTex.value = lightTexture;
      }
      P.fxaa.U.lightBlend.value = lens && lens.light ? (lens.additive ? 2 : 1) : 0;
      if (field) {
        if (!bendTexture) {
          bendTexture = ownTexture(new THREE.DataTexture(field.data, field.size, field.size));
          bendTexture.minFilter = bendTexture.magFilter = THREE.LinearFilter;
          bendTexture.needsUpdate = true;
        } else if (bendTexture.image.data !== field.data) {
          bendTexture.image.data = field.data;
          bendTexture.needsUpdate = true;
        }
        P.fxaa.bendTex.value = bendTexture;
      }
      P.fxaa.U.bend.value.set(field ? field.x : 0, field ? field.y : 0);
    }
    // Direct-to-canvas presentation retains the final pass input. Replay only
    // the final pass(es) on a screenshot request, then let three read the target asynchronously.
    let fxaaCaptureRT = null;
    function captureTarget() {
      if (viz) return _vizDest;
      const direct = _lastPresentRT && _lastPresentRT === (_last.sgsr ? aaRT : ldrRT);
      if (!direct || !(_last.fxaa || _last.taa)) return cap8(_lastPresentRT || ldrRT);
      const w = renderer.domElement.width, h = renderer.domElement.height;
      if (!fxaaCaptureRT) {
        fxaaCaptureRT = makeRT(w, h, THREE.UnsignedByteType);
        fxaaCaptureRT.texture.name = "TLXPostFXAACapture";
      }
      rtSetSize(fxaaCaptureRT, w, h);
      const target = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
      const mrt = renderer.getMRT(), ac = renderer.autoClear, mat = quad.material;
      try {
        renderer.setMRT(null);
        const bend = P.fxaa.U.bend && P.fxaa.U.bend.value;
        const x = bend && bend.x, y = bend && bend.y;
        const blend = P.fxaa.U.lightBlend, previousBlend = blend && blend.value;
        if (blend) blend.value = 0;
        if (bend) bend.set(0, 0);   // captures contain the world without helmet optics
        try {
          if (_last.taa) AA.copyLast(fxaaCaptureRT);
          else runPass(_last.sgsr ? P.sgsr.mat : P.fxaa.mat, fxaaCaptureRT);
        } finally { if (bend) bend.set(x, y); if (blend) blend.value = previousBlend; }
        if (_last.taa || _last.sgsr || !P.fxaa.mirTex || !P.fxaa.U.mir.value) mirrorPass(fxaaCaptureRT, false);
      } finally {
        quad.material = mat;
        renderer.setMRT(mrt);
        renderer.setRenderTarget(target, face, mip);
        renderer.autoClear = ac;
      }
      return fxaaCaptureRT;
    }

    // Output logical size of a pass (phys mode; the shaders' VP.uv reads it).
    function vset(pass, w, h) { if (phys && pass && pass.V) pass.V.set(w, h); }
    // ONE scratch pair, read at once by every caller (up to once a present on a
    // fixed phone target): a fresh [w, h] and {width, height} a frame (#5057).
    const _psOut = { width: 0, height: 0 }, _ps = [0, 0];
    function presentSize() {
      const ps = ctx.getPresentSize ? ctx.getPresentSize(_psOut) : null;
      _ps[0] = ps && ps.width ? ps.width : PW; _ps[1] = ps && ps.height ? ps.height : PH;
      return _ps;
    }

    /** Resolve the HDR scene to the canvas — the glx/post.js present() port.
     * F = tlx.js's latched frame state (proj/invProj/invVP/sunVS/upVS/skyHi/
     * skyLo/viewProj/sunDir/sunColor/eye/time/cloud/cloudSpeed/lights). */
    function present(opts, F) {
      const S = shadow ? shadow.S : null;
      // Lamp-map snapshot BEFORE tlx.js clears the armed flags (see header).
      const lampArmed = !!(S && S.lampArmed);
      const o = opts || {};
      const GT = o.tune || null;
      // Knob read with the TUNE_DEFS default (PostCommon.knob), never a literal.
      const prevAutoClear = renderer.autoClear;
      renderer.autoClear = false;   // runPass sets it per pass (overwrite clears, UP/mirror load)
      let dest = null;
      // try/finally, not a plain restore at the end: tlx.js catches around
      // post.present() and repaints direct-to-canvas — without the finally, a
      // throw mid-chain latches autoClear=false for every later classic-path
      // frame, which skips three's clear and smears the canvas until reload.
      try {
      holdBegin();
      if (phys) VP.sync();   // the readers' logical/physical ratio for the targets as bound NOW

      const threshold = o.threshold !== undefined ? o.threshold : 0.75;
      const bloomAmt = o.bloom !== undefined ? o.bloom : 0.55;
      let aoStr = o.ssao !== undefined ? o.ssao : 0;
      const contactStr = o.contact !== undefined ? o.contact : 0;
      let grStr = o.godray !== undefined ? o.godray : 0;
      // The godray march multiplies lamp in-scatter by the mist uniform, so
      // with GROUND MIST at 0 it computes an exact 0 — skip arming it.
      const lampVol = (o.mist || 0) > 0 ? (o.lampVol || 0) : 0;
      // ?viz= bisect: force the inspected block live so there is something
      // to look at even on a frame whose gate would be closed.
      if (viz === "ssao") aoStr = Math.max(aoStr, 0.95);
      if (viz === "shafts" || viz === "godray") grStr = Math.max(grStr, 0.8);

      // 0) SSAO + separable blur (js/render/glx/shaders/glsl-post.js). Runs when EITHER
      // knob is live — contact shadows ride in this pass.
      const wantAO = !!((aoStr > 0 || contactStr > 0) && F.invProj);
      const sunGR = !!(S && S.enabled) && grStr > 0;
      const wantGR = !!(P.godray && F.invVP && (sunGR || lampVol > 0));
      // D7 (TLX-PERF-HUNT): with both blocks live the godray march writes the AO
      // term to its target's alpha and blur pair 1 blurs it with the AO kernel:
      // -3 half-res passes. ?viz=ssao keeps the standalone pair it blits. The
      // warm (compileJobs) still queues the standalone pair: AO without god-rays
      // (no sun shadow, GOD-RAY knob 0) keeps the program set it had.
      // Desktop tiers: 2 = GTAO + bilateral denoise, 1 = the 16-tap SSAO, both at full post size and never folded.
      const HV = _hiLatched ? _hiLive : hiLive();
      _hiLatched = false;
      const aoHi = !HV || viz ? 0 : HV.gtao && P.gi && P.gi.gtao ? 2 : HV.ssaoHi && P.ssaoHi ? 1 : 0;
      if (wantAO) setAoFull(aoHi > 0);
      const aoFold = _aoFold && wantAO && wantGR && viz !== "ssao" && !aoHi;
      const haveAO = wantAO && (!aoFold || !!compileJobs) && ensureAO();
      if (wantAO) {
        const U = P.ssao.U;
        setPersp(U, F.invProj, F.proj);
        const sv = F.sunVS || [0, 0, -1];
        U.sunVS.value.set(sv[0], sv[1], sv[2]);
        U.strength.value = aoStr;
        U.radius.value = _gk(GT, "ssaoRadius");          // AO RADIUS knob
        const csOn = contactStr > 0 && F.proj && F.sunVS;
        U.contact.value = csOn ? contactStr : 0;
      }
      if (haveAO) {
        vset(P.ssao, aoW, aoH); vset(P.blurAOH, aoW, aoH); vset(P.blurAOV, aoW, aoH); vset(P.blurAO, aoW, aoH);
        if (aoHi === 2) {
          const G = P.gi;
          G.gtao.U.texel.value.set(1 / aoW, 1 / aoH);
          G.gtao.U.halfH.value = aoH * 0.5;
          runPass(G.gtao.mat, ssaoRT);
          G.gtaoH.tex.value = ssaoRT.texture; G.gtaoH.U.dir.value.set(1 / aoW, 0);
          runPass(G.gtaoH.mat, ssaoBlurRT);
          G.gtaoV.tex.value = ssaoBlurRT.texture; G.gtaoV.U.dir.value.set(0, 1 / aoH);
          runPass(G.gtaoV.mat, ssaoRT);
        } else {
        if (aoHi === 1) runPass(P.ssaoHi.mat, ssaoRT);
        else runPass(P.ssao.mat, ssaoRT);
        // Blur H (ssao -> blur) then V (blur -> ssao). Half res (ssaoHi: full).
        if (_fixedMats && P.blurAOH) {
          P.blurAOH.U.dir.value.set(1 / aoW, 0);
          runPass(P.blurAOH.mat, ssaoBlurRT);
          P.blurAOV.U.dir.value.set(0, 1 / aoH);
          runPass(P.blurAOV.mat, ssaoRT);
        } else {
          P.blurAO.tex.value = ssaoRT.texture;
          P.blurAO.U.dir.value.set(1 / aoW, 0);
          runPass(P.blurAO.mat, ssaoBlurRT);
          P.blurAO.tex.value = ssaoBlurRT.texture;
          P.blurAO.U.dir.value.set(0, 1 / aoH);
          runPass(P.blurAO.mat, ssaoRT);
        }
        }
      }

      // 0b) Volumetric sun shafts + lamp beams (js/render/glx/shaders/glsl-post.js)
      const haveGR = wantGR && ensureGR(gr11Knob && !aoFold);
      // raysHi (ULTRA+): the 32-step march over the nearest 12 lamps; it shares P.godray's scalar uniforms.
      const GRP = HV && HV.raysHi && P.godrayHi ? P.godrayHi : P.godray;
      if (haveGR) {
        const U = P.godray.U;
        U.invVP.value.fromArray(F.invVP);
        U.lightVP.value.fromArray(S.lightVP);
        const e = F.eye || [0, 0, 0];
        U.eye.value.set(e[0], e[1], e[2]);
        const sd = F.sunDir || [0, 1, 0];
        U.sunDir.value.set(sd[0], sd[1], sd[2]);
        const scl = F.sunColor || [1, 1, 1];
        U.sunColor.value.set(scl[0], scl[1], scl[2]);
        U.str.value = sunGR ? grStr : 0.0;
        // gCloud reads time only under cloudCover > 0.001: a clear sky skips the frame-varying write (as hazeTime).
        if ((F.cloud || 0) > 0.001) U.time.value = F.time || 0;
        U.cloudCover.value = F.cloud || 0;
        U.cloudSpeed.value = F.cloudSpeed != null ? F.cloudSpeed : 1;
        // Lamp volumetrics: nearest-12 to the eye + the mapped-lamp slot.
        let grNL = 0, grLampIdx = -1;
        const L = F.lights;
        if (lampVol > 0 && L) {
          const total = (L.length / 15) | 0;
          const ex = e[0], ey = e[1], ez = e[2];
          for (let i = 0; i < total; i++) {
            const oi = i * 15, dx = L[oi] - ex, dy = L[oi + 1] - ey, dz = L[oi + 2] - ez;
            const d = dx * dx + dy * dy + dz * dz;
            const s = _grSel[i]; if (s) { s.d = d; s.o = oi; } else _grSel[i] = { d, o: oi };
          }
          _grSel.length = total;
          // 6, not 12 — the TSL beam march is bounded at 6 (tsl-post.js Loop
          // end: int(6)). grLampIdx below is a position in THIS ordering, so a
          // mapped floodlight sorting 7th-12th produced a lampShadowIdx the
          // march can never equal: its beam glowed straight through cars and
          // walls instead of being carved by them, on any dense floodlit
          // section. Same defect GLX carried until glx/post.js was cut to 6.
          if (GRP !== P.godray) grNL = _grKeepNearest(total, GRP.maxLights);   // raysHi: its own march bound
          else grNL = _grKeepNearest(total, 6);
          for (let i = 0; i < grNL; i++) {
            const oi = _grSel[i].o;
            // Map the record holding this frame's spot-shadow map to its slot
            // in THIS pass's nearest-N ordering (js/render/glx/shaders/glsl-post.js).
            if (lampArmed && oi === S.lampIdx * 15) grLampIdx = i;
            GRP.lightPos[i].set(L[oi], L[oi + 1], L[oi + 2]);
            GRP.lightCol[i].set(L[oi + 3], L[oi + 4], L[oi + 5]);
            GRP.lightDir[i].set(L[oi + 7], L[oi + 8], L[oi + 9]);
            GRP.lightGeo[i].set(L[oi + 6], L[oi + 10], L[oi + 11], L[oi + 13]);
          }
        }
        U.numLights.value = grNL;
        U.lampStr.value = lampVol;
        U.mist.value = o.mist || 0;
        U.lampShadowVP.value.fromArray(S.lampLightVP);
        U.lampShadowIdx.value = grLampIdx;
        U.hgAniso.value = _gk(GT, "godrayAniso");       // GOD-RAY FOCUS knob
        U.hgFloor.value = _gk(GT, "godrayFloor");      // GOD-RAY HAZE knob
        U.aoOn.value = aoFold ? 1 : 0;
        vset(P.godray, grW, grH); vset(P.blurGRH, grW, grH); vset(P.blurGRV, grW, grH); vset(P.blurGR, grW, grH);
        runPass(GRP.mat, godrayRT);
        // Double separable blur (H+V twice) — soft wide volumes, no stripes.
        // TLX-PERF-PLAN G1: lamp beams alone (no sun shafts) take ONE blur pair.
        // The second pair exists for the sun march's shadow-slice stripes; a lamp
        // cone has no such slices. -2 half-res passes per night frame.
        // apex26.grLite=0 restores two pairs (same knob as GLX).
        // opts.grLite (GRAPHICS MEDIUM/LOW / mid autoShed) forces one pair even
        // with sun shafts — avoidable day cost at lower tiers.
        const grPairs = (o.grLite || (!sunGR && _grLite)) ? 1 : 2;
        for (let bp = 0; bp < grPairs; bp++) {
          // Pair 1 (the AO pair's spacing: aoW == grW) also blurs the folded AO.
          const aoA = aoFold && bp === 0 ? 1 : 0;
          if (_fixedMats && P.blurGRH) {
            // H/V materials stay bound to godrayRT / godrayBlurRT (bindFixedGR).
            P.blurGRH.U.dir.value.set((1 + bp) / grW, 0);
            P.blurGRH.U.aoA.value = aoA;
            runPass(P.blurGRH.mat, godrayBlurRT);
            P.blurGRV.U.dir.value.set(0, (1 + bp) / grH);
            P.blurGRV.U.aoA.value = aoA;
            runPass(P.blurGRV.mat, godrayRT);
          } else {
            P.blurGR.U.aoA.value = aoA;
            P.blurGR.tex.value = godrayRT.texture;
            P.blurGR.U.dir.value.set((1 + bp) / grW, 0);
            runPass(P.blurGR.mat, godrayBlurRT);
            P.blurGR.tex.value = godrayBlurRT.texture;
            P.blurGR.U.dir.value.set(0, (1 + bp) / grH);
            runPass(P.blurGR.mat, godrayRT);
          }
        }
      }

      // 0c) SSGI (EXTREME, tsl-gi.js): half-res one-bounce diffuse, then a depth-aware bilateral H+V. Spatial only:
      // no history target exists in this chain, so there is no temporal accumulation.
      const GIP = P.gi;
      const haveGI = !!(HV && HV.ssgi && GIP && GIP.ssgi && P.composite.matHi && F.invProj && F.proj && !viz) && ensureGI();
      let giOut = giRT;
      if (haveGI) {
        setPersp(GIP.ssgi.U, F.invProj, F.proj);
        if (GIP.ssgi.U.phase) { GIM.giPhase(_giN++, _giPh); GIP.ssgi.U.phase.value.set(_giPh[0], _giPh[1]); }
        runPass(GIP.ssgi.mat, giRT);
        GIP.giH.tex.value = giRT.texture; GIP.giH.U.dir.value.set(1 / giW, 0);
        runPass(GIP.giH.mat, giBlurRT);
        GIP.giV.tex.value = giBlurRT.texture; GIP.giV.U.dir.value.set(0, 1 / giH);
        runPass(GIP.giV.mat, giRT);
        // 0d) temporal accumulation: history <- blend(denoised GI, reprojected history); the composite reads the history.
        // A cut / teleport (TLXAA.camCut), a resize, a frame without GI or the first frame resets to spatial-only.
        const A = GIP.giAcc;
        if (A && giHist && F.invVP && F.viewProj) {
          let cut = !giPrevOk;
          if (!cut && F.eye && window.TLXAA) { TLXAA.forwardOf(F.invVP, _giFwdNow); cut = TLXAA.camCut(_giEye, F.eye, _giFwd, _giFwdNow); }
          A.U.invVP.value.fromArray(F.invVP);
          A.U.prevVP.value.fromArray(giPrevOk ? _giPrevVP : F.viewProj);
          A.U.texel.value.set(1 / giW, 1 / giH);
          A.U.reset.value = cut ? 1 : 0;
          A.cur.value = giRT.texture; A.hist.value = giHist[giHi].texture;
          giOut = giHist[giHi ^ 1];
          runPass(A.mat, giOut);
          if (!compileJobs && !_scissorWarm) {
            giHi ^= 1; giFrames++; if (cut) giResets++;
            _giPrevVP.set(F.viewProj); giPrevOk = true;
            if (F.eye) { _giEye[0] = F.eye[0]; _giEye[1] = F.eye[1]; _giEye[2] = F.eye[2]; }
            if (window.TLXAA) TLXAA.forwardOf(F.invVP, _giFwd);
          }
        } else giPrevOk = false;
      } else giPrevOk = false;

      // 1+2) bright pass + mip-chain bloom (js/render/glx/shaders/glsl-post.js)
      const haveBloom = bloomAmt > 0 && ensureBloom();
      // opts.bloomLevels>0 truncates the widest octaves (MEDIUM/LOW / mid shed).
      const useLv = haveBloom
        ? ((o.bloomLevels > 0) ? Math.min(nLv, o.bloomLevels | 0) : nLv)
        : 0;
      if (haveBloom && useLv > 0) {
        P.bright.U.threshold.value = threshold;
        P.bright.U.exposure.value = o.exposure !== undefined ? o.exposure : 1.0;   // threshold is in exposed units
        vset(P.bright, bloomLv[0].w, bloomLv[0].h);
        runPass(P.bright.mat, bloomLv[0].rt);
        for (let i = 1; i < useLv; i++) {
          if (_fixedMats && P.downFixed && P.downFixed[i - 1]) {
            const d = P.downFixed[i - 1];
            d.U.texel.value.set(1 / bloomLv[i - 1].w, 1 / bloomLv[i - 1].h);
            d.U.karis.value = i === 1 ? 1 : 0;
            vset(d, bloomLv[i].w, bloomLv[i].h);
            runPass(d.mat, bloomLv[i].rt);
          } else {
            P.down.tex.value = bloomLv[i - 1].rt.texture;
            P.down.U.texel.value.set(1 / bloomLv[i - 1].w, 1 / bloomLv[i - 1].h);
            P.down.U.karis.value = i === 1 ? 1 : 0;   // firefly fix on the first mip only
            vset(P.down, bloomLv[i].w, bloomLv[i].h);
            runPass(P.down.mat, bloomLv[i].rt);
          }
        }
        P.spread.value = _gk(GT, "bloomSpread");           // BLOOM SPREAD knob
        for (let i = useLv - 1; i >= 1; i--) {
          // Intermediates accumulate (ONE,ONE); the FINAL into level 0
          // OVERWRITES — level 0 still holds the sharp bright pass.
          let up;
          if (_fixedMats && i === 1 && P.upFinalFixed) {
            up = P.upFinalFixed;
          } else if (_fixedMats && P.upAddFixed && P.upAddFixed[i - 2]) {
            up = P.upAddFixed[i - 2];
          } else {
            up = i === 1 ? P.upFinal : P.upAdd;
            up.tex.value = bloomLv[i].rt.texture;
          }
          up.U.texel.value.set(1 / bloomLv[i].w, 1 / bloomLv[i].h);
          vset(up, bloomLv[i - 1].w, bloomLv[i - 1].h);
          runPass(up.mat, bloomLv[i - 1].rt, i > 1);   // i > 1: additive, must load
        }
      }

      // 3) composite (js/render/glx/shaders/glsl-post.js)
      const C = P.composite.U;
      P.composite.tex.bloom.value = haveBloom ? bloomLv[0].rt.texture : blackTex;
      // Normalise the mip-chain accumulation (useLv-1 summed octaves).
      C.bloomAmt.value = bloomAmt * 1.25 / Math.max(useLv - 1, 1);
      const aoGR = aoFold && haveGR;   // the AO term lives in godrayRT.a
      const aoOn = aoGR || haveAO;
      // NEVER one texture in two composite slots: three merges TextureNodes by
      // texture uuid when the program is built (fixed key, built once), and the
      // merged sampler then follows one slot forever. Binding godrayRT to the
      // ssao slot too made the godray add read the ssao slot's whiteTex on every
      // later unfolded frame (the night-veil defect). The fold reads godrayRT.a
      // through the godray slot (C.aoAlpha); godray-off has its own black.
      P.composite.tex.ssao.value = haveAO ? ssaoRT.texture : whiteTex;
      C.aoAlpha.value = aoGR ? 1 : 0;
      C.aoTexel.value.set(aoOn ? 1 / aoW : 0, aoOn ? 1 / aoH : 0);
      P.composite.tex.godray.value = haveGR ? godrayRT.texture : (P.composite.grOffTex || blackTex);
      C.haveGodray.value = haveGR ? 1 : 0;
      // Sun screen-UV projection + brightness gate + golden-hour flare curve:
      // PostCommon.sunScreen, shared with GLX / WGX.
      const sun = PostCommon.sunScreen(F.sunDir, F.viewProj, F.sunColor, _sunScr);
      const sunUVx = sun.visible ? sun.ndcx * 0.5 + 0.5 : -2;
      const sunUVy = sun.visible ? sun.ndcy * 0.5 + 0.5 : -2;
      const flareStr = sun.flare, sunShaft = sun.shaft;
      C.sunUV.value.set(sunUVx, sunUVy);
      C.flareStr.value = flareStr * (o.flareMul != null ? o.flareMul : 1);   // LENS FLARE knob
      C.exposure.value = o.exposure !== undefined ? o.exposure : 1.0;
      // GATED ON haveBloom: the shaft pass READS THE BLOOM CHAIN
      // (COMPOSITE_FS in js/render/glx/shaders/glsl-post.js). When bloom is off we
      // bind blackTex, so the 8 dependent fetches accumulated vec3(0).
      // GLX zeroes the uniform rather than paying the taps; same here.
      const shaftMul = haveBloom ? _gk(GT, "sunShaftMul") : 0;
      C.sunShaft.value = haveBloom ? sunShaft * shaftMul : 0;
      if (C.sunShaft.value > 0 && C.bloomAmt.value > 0.001) {
        C.shaftDecay.value = _gk(GT, "sunShaftDecay");
        C.shaftSpread.value = Math.sqrt(Math.max(0.05, shaftMul));
      }
      const grade = o.grade;
      const gs = (grade && grade.shadow) || null, gh = (grade && grade.hi) || null;
      C.gradeShadow.value.set(gs ? gs[0] : 1, gs ? gs[1] : 1, gs ? gs[2] : 1);
      C.gradeHi.value.set(gh ? gh[0] : 1, gh ? gh[1] : 1, gh ? gh[2] : 1);
      C.gradeStr.value = grade && grade.str !== undefined ? grade.str : 0;
      // IMAGE & COLOUR knobs — every default reproduces the shipped grade.
      const _hg = PostCommon.hdrGradeOn(GT);
      C.hdrGradeOn.value = _hg ? 1 : 0;
      if (_sceneHdr && _hg) {
        C.tone0.value.set(_gk(GT, "blacks"), _gk(GT, "shadows"), _gk(GT, "midtones"), _gk(GT, "highlights"));
        C.tone1.value.set(_gk(GT, "whites"), _gk(GT, "toe"), _gk(GT, "shoulder"), 0);
        C.lift.value.set(_gk(GT, "liftR"), _gk(GT, "liftG"), _gk(GT, "liftB"));
        C.gamma.value.set(_gk(GT, "gammaR"), _gk(GT, "gammaG"), _gk(GT, "gammaB"));
        C.gain.value.set(_gk(GT, "gainR"), _gk(GT, "gainG"), _gk(GT, "gainB"));
      }
      C.contrast.value = _gk(GT, "contrast");
      C.vibrance.value = _gk(GT, "vibrance");
      C.saturation.value = _gk(GT, "saturation");
      C.tint.value = _gk(GT, "tint");
      C.vignette.value = _gk(GT, "vignette");
      C.vigSoft.value = _gk(GT, "vignetteSoft");
      C.bloomKnee.value = _gk(GT, "bloomKnee");
      C.carReflect.value = o.carReflect != null ? o.carReflect : _gk(GT, "carReflect");
      C.carGloss.value = _gk(GT, "carGloss");
      C.chromAb.value = _gk(GT, "chromAb");
      C.grain.value = _gk(GT, "grain");
      C.grainTime.value = F.time || 0;
      if (C.dthOff) {   // tsl-post.js: the dither's time step, float32 like the GPU's floor (tsl-sky.js D.dthOff)
        const step60 = Math.floor(Math.fround(Math.fround(C.grainTime.value) * 60.0));
        C.dthOff.value = (step60 - 64 * Math.floor(step60 / 64)) * 5.588238;   // GLSL mod(): never negative
      }
      C.sharpen.value = _gk(GT, "sharpen");
      if (C.sharpenLimit) C.sharpenLimit.value = sharpenLimit;
      C.blackLift.value = _gk(GT, "blackLift");
      C.whitePoint.value = _gk(GT, "whitePoint");
      // ACES TONE CURVE knobs (defaults = the shipped Narkowicz coefficients).
      C.acesA.value = _gk(GT, "acesA");
      C.acesB.value = _gk(GT, "acesB");
      C.acesC.value = _gk(GT, "acesC");
      C.acesD.value = _gk(GT, "acesD");
      C.acesE.value = _gk(GT, "acesE");
      C.speedBlur.value = o.speedBlur != null ? o.speedBlur : 0.0;
      C.flareStreak.value = _gk(GT, "flareStreak");
      C.flareStreak2.value = _gk(GT, "flareStreak2");
      // EXHAUST HEAT HAZE plume anchor (opts.haze = {u, v, str} | null).
      const hz = o.haze;
      C.hazeUV.value.set(hz ? hz.u : -9, hz ? hz.v : -9);
      C.hazeStr.value = hz ? hz.str : 0;
      // Read only under hazeStr > 0 (tsl-post.js): a frame-varying write nothing reads is one writeBuffer a frame.
      if (hz) C.hazeTime.value = F.time || 0;
      C.ssrThick.value = _gk(GT, "ssrThick");
      // Camera-aware SSR extent (game.js sets these per camera; onboard cams get
      // a raised top cutoff and a pulled-in near fade).
      C.ssrTopUV.value = o.ssrTopUV != null ? o.ssrTopUV : 0.62;
      C.ssrNear.value = o.ssrNear != null ? o.ssrNear : -2.5;
      C.ssrQuality.value = o.ssrQuality >= 2 ? 2 : o.ssrQuality >= 1 ? 1 : 0;
      C.lensDirt.value = dirtTex ? _gk(GT, "lensDirt") : 0;
      // Reflection and vignette sample the full scene size, including under fixed physical targets.
      if (compositeSizeDirty) {
        C.reflTexel.value.set(1 / W, 1 / H);
        if (C.vigAspect) {
          const va = W / H;
          C.vigAspect.value = va;
          C.vigNorm.value = 0.70710678 / Math.hypot(va * 0.5, 0.5);
        }
        compositeSizeDirty = false;
      }
      // Wet-road/car SSR needs depth + view/proj + world-up-in-view; uSsrOk
      // gates the whole branch on probe-less paths (setup preview).
      const reflStr = o.reflect || 0;
      const haveRefl = !!(F.invProj && F.proj && F.upVS);
      const drawRefl = haveRefl && (reflStr > 0.001 || C.carReflect.value > 0.001);
      // Both reflection paths are shed on dry tier-2+ frames. Only their shader branches read this camera state.
      if (drawRefl) {
        setPersp(C, F.invProj, F.proj);
        C.upVS.value.set(F.upVS[0], F.upVS[1], F.upVS[2]);
        const hi = F.skyHi || [0.05, 0.06, 0.09];
        const lo = F.skyLo || [0.02, 0.025, 0.05];
        C.reflSkyHi.value.set(hi[0], hi[1], hi[2]);
        C.reflSkyLo.value.set(lo[0], lo[1], lo[2]);
      }
      C.ssrOk.value = haveRefl ? 1 : 0;
      C.reflect.value = haveRefl ? reflStr : 0;
      // Desktop tiers: the hi composite (ssrHi march + rough blur, the SSGI add) only while one of them is live.
      const compHi = !!(P.composite.matHi && HV && (HV.ssrHi || haveGI));
      if (P.composite.matHi) {
        P.composite.mat = compHi ? P.composite.matHi : P.composite.matBase;
        C.ssrHi.value = compHi && HV.ssrHi ? 1 : 0;
        C.giOn.value = haveGI ? 1 : 0;
        C.giStr.value = GIM.BUDGET.ssgiStr;
        C.giTexel.value.set(1 / giW, 1 / giH);
        if (P.composite.tex.gi) P.composite.tex.gi.value = haveGI ? giOut.texture : P.composite.giOffTex;
      }

      // 3/4) composite -> LDR, FXAA -> canvas (or the ?viz= bisect blit)
      // softDest: software-WebGPU present target. Never setRenderTarget(null)
      // on that path — three's default framebuffer calls getCurrentTexture(),
      // which breaks mapAsync device-wide (WGX / Dawn software adapters).
      dest = (typeof ctx.softDest === "function" ? ctx.softDest() : null) || null;
      if (viz) {
        const B = P.blit;
        B.U.mono.value = viz === "ssao" ? 1 : 0;
        B.U.gain.value = 1;
        B.tex.value =
          viz === "ssao" ? (haveAO ? ssaoRT.texture : whiteTex)
          : viz === "bloom" ? (haveBloom ? bloomLv[0].rt.texture : blackTex)
          : (viz === "shafts" || viz === "godray") ? (haveGR ? godrayRT.texture : blackTex)
          : sceneRT.texture;   // composite-off | scene: the raw HDR world
        _vizDest = dest;   // the blit must read what this pass wrote, not ldrRT
        _last.taa = false;
        if (AA) AA.skipped();
        if (phys) {
          const output = dest || renderer.domElement;
          vset(B, output.width, output.height);
        }
        runPass(B.mat, dest);
      } else {
        vset(P.composite, pW, pH); vset(P.fxaa, pW, pH);
        runPass(P.composite.mat, ldrRT);
        P.fxaa.tex.value = cinemaPost(ldrRT, F, o).texture;   // CINEMA: motion blur + DoF, else ldrRT itself
        P.fxaa.U.texel.value.set(1 / pW, 1 / pH);
        const useUpscale = !!(P.sgsr && aaRT && !!(ctx.wantSpatialUpscale && ctx.wantSpatialUpscale()) !== _warmFlipUp);
        const useTaa = !useUpscale && taaLive() && !!(F.invVP && F.viewProj);
        if (AA && !useTaa) AA.skipped();
        _last.taa = false;
        if (useTaa) {
          // TRAA: history <- resolve(ldr, history), history -> dest, the mirror inset on top (never jittered: its
          // own camera, composited after the resolve). Its retained target may be the pre-AA LDR when drawing to the canvas.
          if (P.fxaa.mirTex) fxaaMirror(false);
          AA.resolve(F, pW, pH, dest, !compileJobs && !_scissorWarm, P.fxaa.tex.value);
          _last.taa = true;
          mirrorPass(dest);
          _lastPresentRT = dest || ldrRT;
          _last.sgsr = false;
        } else if (useUpscale) {
          if (P.fxaa.mirTex) fxaaMirror(false);   // FXAA -> aaRT: the inset goes on after SGSR
          bindLens(null);
          runPass(P.fxaa.mat, aaRT);
          P.sgsr.tex.value = aaRT.texture;
          P.sgsr.U.viewport.value.set(1 / pW, 1 / pH, pW, pH);
          if (phys) {
            const ps = presentSize();
            vset(P.sgsr, ps[0], ps[1]);   // the canvas / soft target: always present-sized
            P.sgsr.U.plain.value = fixed && !(ctx.userSpatialUpscale && ctx.userSpatialUpscale()) ? 1 : 0;
          }
          runPass(P.sgsr.mat, dest);
          mirrorPass(dest);
          _lastPresentRT = dest || aaRT;
          _last.sgsr = true;
        } else {
          // FXAA reads the post-sized LDR but draws the whole destination.
          // Fixed phone targets keep that destination present-sized even at
          // scale 1, where SGSR is bypassed; pW/pH here would crop the image.
          if (fixed) { const ps = presentSize(); vset(P.fxaa, ps[0], ps[1]); }
          const mirIn = !!P.fxaa.mirTex && fxaaMirror(true);
          const lens = !dest && !compileJobs && !_scissorWarm && (!_mirTex || mirIn) ? o.visorLens : null;
          bindLens(lens);
          runPass(P.fxaa.mat, dest);
          if (lens && P.fxaa.bendTex) o.visorFolded = lens.light ? 2 : 1;
          if (mirIn) _mirComposites++;
          else mirrorPass(dest);
          _lastPresentRT = dest || ldrRT;
          _last.sgsr = false;
        }
      }
      _last.ssao = !!(haveAO || (aoFold && haveGR));
      _last.bloom = !!haveBloom;
      _last.shafts = !!haveGR;
      _last.ssr = drawRefl;
      _last.fxaa = !viz && !_last.taa;
      _last.aoHi = haveAO ? aoHi : 0;
      _last.rays = haveGR && GRP !== P.godray ? 1 : 0;
      _last.gi = !!haveGI;
      _last.ssrHi = !!(compHi && HV.ssrHi);
      _prevOk = !!(_last.mblur && F.viewProj && F.viewProj.length >= 16);
      if (_prevOk) _prevVP.set(F.viewProj);
      holdFlush(false);   // before a shed below destroys a target a held command buffer still names
      // After the composite has rebound the 1x1 fallbacks. Releasing on the
      // same frame the block drew would dispose a target runPass just wrote.
      if (!compileJobs && !_scissorWarm) {
        aoIdle = shedIdle(!!haveAO, aoIdle, releaseAO);
        grIdle = shedIdle(!!haveGR, grIdle, releaseGR);
        bloomIdle = shedIdle(!!(haveBloom && useLv > 0), bloomIdle, releaseBloom);
        if (HI) {
          giIdle = shedIdle(!!haveGI, giIdle, releaseGI);
          cineIdle = shedIdle(!!(_last.dof || _last.mblur), cineIdle, releaseCine);
        }
      }
      } finally {
        try { holdFlush(false); } catch (_) { /* a throw mid-chain: tlx.js's catch owns the fallback */ }
        if (!dest) {
          try { renderer.setRenderTarget(null); } catch (_) { /* device dying: tlx.js's catch owns the fallback */ }
        }
        renderer.autoClear = prevAutoClear;
      }
    }

    // A-P1 (perf hunt 4): SCENE DEPTH, DISCARDED WHEN NO PASS READS IT. The
    // scene target's depth is stored for SSAO (+ contact, + the composite's AO
    // upsample), the godray march, SSR (road and car paint) and the lens
    // flare's sun-occlusion tap — and for nothing else. At autoTier 4, at night
    // or on a dry phone frame every one of those is off, yet a tile GPU still
    // writes a full-res depth surface back to memory (~4 B/px, ~12 % of the
    // phone post chain's traffic). GLX's rule exactly (glx/post.js needDepth,
    // which invalidates the same way), evaluated per frame from the SAME
    // opts/F the chain is about to read, so a frame whose post reads depth
    // always has it: identical pixels by construction (the next scene pass
    // clears depth). On WebGL2: invalidateFramebuffer(DEPTH) on the scene FBO
    // while its pass is still open (ANGLE-Metal: store action DontCare), and on
    // an MSAA target the depth resolve blit is skipped instead
    // (resolveDepthBuffer). Pristine r186 has no lever on WebGPU (WebGPUBackend
    // discardDepth is MSAA-only); vendored patch 17 adds the per-pass hint that
    // depthBegin sets on a single-sample target (A-P2W, discardHint).
    // apex26.tlxDepthDiscard="0" always keeps it.
    let _depthDiscard = true;
    try { _depthDiscard = localStorage.getItem("apex26.tlxDepthDiscard") !== "0"; } catch (_) { /* no storage: on */ }
    let _depthKeep = true, _depthDiscards = 0, _invDepth = null;
    // A-P2 (phoneperf 2026-10-24): THE SSR TAG, DISCARDED THE SAME WAY. Attachment 1
    // (ssrTag) stays on every chain so a wet spell never reallocates the scene target
    // (_wantTag), yet its only readers are the composite's SSR gate (ssrOk &&
    // reflect|carReflect > 0.001, tsl-post.js) and the heat-haze plume (hazeStr >
    // 0.002) — both uniform-gated If blocks, so on a dry phone frame at tier >= 2
    // (carReflect 0, reflect 0, haze null on mobileTier) the tag is written and
    // stored by every scene fragment and fetched by nothing. Same rule shape as
    // needsDepth, from the SAME opts/F present() is about to upload, so a frame
    // whose composite reads the tag always has it. Single-sample targets only (an
    // MSAA tag has already been resolved by the time depthEnd runs). WebGPU: the
    // storeOp hint of vendored patch 17 (A-P2W, discardHint). apex26.tlxTagDiscard="0" always keeps it.
    let _tagDiscard = true;
    try { _tagDiscard = localStorage.getItem("apex26.tlxTagDiscard") !== "0"; } catch (_) { /* no storage: on */ }
    let _tagKeep = true, _tagDiscards = 0, _invTag = null, _invBoth = null;
    const isGpu = () => !!(renderer.backend && renderer.backend.isWebGPUBackend);
    let _gpuArmed = false;   // A-P2W: depthBegin put patch 17's hint on sceneRT
    function needsTag(opts, F) {
      const o = opts || {};
      if (viz) return true;
      if (_hiLive && (_hiLive.dof || _hiLive.motionBlur)) return true;   // CINEMA: the car mask / autofocus read the tag
      const hz = o.haze;
      if (hz && hz.str > 0.002) return true;   // the plume's car-mask fetch
      const car = o.carReflect != null ? o.carReflect : PostCommon.knob(o.tune || null, "carReflect");
      return !!(F.invProj && F.proj && F.upVS) && ((o.reflect || 0) > 0.001 || car > 0.001);   // the composite's SSR gate, exactly
    }
    // WebGL2 only: invalidate `list` on rt's FBO, and only while three still has THAT FBO bound
    // (the pass it just rendered) — never a guess. Returns true when it did.
    function discardAttachments(rt, list) {
      const be = renderer.backend, gl = be && be.gl, st = be && be.state;
      if (!rt || !list || !list.length || !gl || typeof gl.invalidateFramebuffer !== "function" || !st || !st.currentBoundFramebuffers) return false;
      const d = be.get(rt), fb = st.currentBoundFramebuffers[gl.DRAW_FRAMEBUFFER];
      if (!fb || !d || !d.framebuffers || Object.values(d.framebuffers).indexOf(fb) < 0) return false;
      gl.invalidateFramebuffer(gl.DRAW_FRAMEBUFFER, list);
      return true;
    }
    function needsDepth(opts, F) {
      const o = opts || {};
      if (viz) return true;
      if (_hiLive && (_hiLive.ssgi || _hiLive.dof || _hiLive.motionBlur)) return true;   // desktop tiers read scene depth
      if (taaLive() && F.invVP && F.viewProj) return true;   // TRAA reprojects from the scene depth
      if (((o.ssao !== undefined ? o.ssao : 0) > 0 || (o.contact !== undefined ? o.contact : 0) > 0) && F.invProj) return true;   // SSAO, contact, AO upsample
      const S = shadow ? shadow.S : null;
      const lampVol = (o.mist || 0) > 0 ? (o.lampVol || 0) : 0;
      if (P.godray && F.invVP && ((!!(S && S.enabled) && (o.godray !== undefined ? o.godray : 0) > 0) || lampVol > 0)) return true;
      const car = o.carReflect != null ? o.carReflect : PostCommon.knob(o.tune || null, "carReflect");
      if (F.invProj && F.proj && F.upVS && ((o.reflect || 0) > 0.001 || car > 0.001)) return true;   // SSR's depthAt gate
      const sun = PostCommon.sunScreen(F.sunDir, F.viewProj, F.sunColor, _sunScr);   // present() recomputes it
      if (!(sun.visible && sun.flare * (o.flareMul != null ? o.flareMul : 1) > 0)) return false;
      // The flare's depthAt(sunUV) runs only while sunUV is ON SCREEN (tsl-post.js composite), but sunScreen
      // calls any sun in front of the camera visible: off screen it kept the full-res depth store for nothing.
      // fround: the test is on the float32 the uniform will hold, so the two bounds cannot disagree.
      const ux = Math.fround(sun.ndcx * 0.5 + 0.5), uy = Math.fround(sun.ndcy * 0.5 + 0.5);
      return ux >= 0 && ux <= 1 && uy >= 0 && uy <= 1;
    }
    // Before the scene pass (tlx.js present): decide, and tell an MSAA target whether to resolve depth.
    function depthBegin(opts, F) {
      // Decide which desktop passes will read these attachments before the scene sets its store ops.
      if (HI) { hiLive(); _hiLatched = true; }
      _depthKeep = !_depthDiscard || needsDepth(opts, F);
      sceneRT.resolveDepthBuffer = _depthKeep;
      _tagKeep = !_tagDiscard || !tagOn || (sceneRT.samples | 0) > 0 || needsTag(opts, F);   // A-P2
      // A-P2W: WebGPU fixes a storeOp when the pass BEGINS, so the same decision rides on the
      // target as patch 17's hint before the scene render; depthEnd takes it off. Single-sample only.
      _gpuArmed = discardHint(sceneRT, _tagKeep ? 0 : 2, !_depthKeep && (sceneRT.samples | 0) === 0);
      return _depthKeep;
    }
    // WebGPU leg (vendored three patch 17): store nothing of the attachments in `colorMask` (bit i =
    // colour attachment i) and, with `depth`, of the depth, in the NEXT pass into rt. Only around the
    // LAST render of a frame into rt — the next pass's loadOp still reads what was stored. Returns
    // true when a hint went on; discardHintOff(rt) after the render, also on a throw.
    function discardHint(rt, colorMask, depth) {
      if (!rt || !isGpu()) return false;
      const c = _tagDiscard ? colorMask | 0 : 0, d = _depthDiscard && !!depth;
      rt.apexDiscardColor = c;
      rt.apexDiscardDepth = d;
      return c !== 0 || d;
    }
    function discardHintOff(rt) {
      const t = rt || sceneRT;
      if (t.apexDiscardColor) t.apexDiscardColor = 0;
      if (t.apexDiscardDepth) t.apexDiscardDepth = false;
      if (!rt) _gpuArmed = false;
    }
    // After the scene pass, before present(): drop the depth (and the tag) this frame does not read
    // (WebGL2: invalidate; WebGPU: depthBegin's hint already did it, count it and take it off).
    function depthEnd() {
      if (_gpuArmed) {
        discardHintOff();
        if (!_tagKeep) _tagDiscards++;
        if (!_depthKeep && (sceneRT.samples | 0) === 0) _depthDiscards++;
        return true;
      }
      if (_depthKeep && _tagKeep) return false;
      const be = renderer.backend, gl = be && be.gl, st = be && be.state;
      if (!gl || typeof gl.invalidateFramebuffer !== "function" || !st || !st.currentBoundFramebuffers) return false;
      const d = be.get(sceneRT), msaa = (sceneRT.samples | 0) > 0;
      // Only the FBO three just rendered the scene into (and, under MSAA, resolved out of) — never a guess.
      const target = msaa ? gl.READ_FRAMEBUFFER : gl.DRAW_FRAMEBUFFER;
      const fb = st.currentBoundFramebuffers[target];
      const ours = msaa ? (fb && fb === d.msaaFrameBuffer) : (fb && d.framebuffers && Object.values(d.framebuffers).indexOf(fb) >= 0);
      if (!ours) return false;
      if (!_invDepth) { _invDepth = [gl.DEPTH_ATTACHMENT]; _invTag = [gl.COLOR_ATTACHMENT1]; _invBoth = [gl.DEPTH_ATTACHMENT, gl.COLOR_ATTACHMENT1]; }
      gl.invalidateFramebuffer(target, _depthKeep ? _invTag : _tagKeep ? _invDepth : _invBoth);
      if (!_tagKeep) _tagDiscards++;
      if (!_depthKeep) _depthDiscards++;
      return true;
    }

    async function warm(opts, frame) {
      if (disposed) return;
      // Collect enabled passes first, then compile serially with stable targets.
      const jobs = [], target = renderer.getRenderTarget(), mrt = renderer.getMRT();
      const last = { ..._last }, lastRT = _lastPresentRT, vizDest = _vizDest;
      try {
        compileJobs = jobs;
        try { present(opts, frame); } finally { compileJobs = null; }
        // The caller's MRT is the LIVE one: present() runs the post chain with
        // the scene pass's ssrTag MRT node still set, so compiling these quads
        // under a null MRT built sixteen programs the race never used
        // (gpu-census 206). Whatever startProgramWarm has set is what runPass
        // will see; do not touch it here.
        const deadline = performance.now() + 3000;
        for (const job of jobs) {
          if (disposed) break;
          renderer.setRenderTarget(job.target);
          // THE LIVE QUAD, not a snapshot: a fresh QuadMesh per job does not
          // share a render-object cache key with the one present() draws, so
          // the race built the same 16 post programs AGAIN through runPass
          // (gpu-census 205 on macos-latest Metal: x16 tagged warm, x16 tagged
          // runPass, the same eight sites). Compiling `quad` itself with the job's material is
          // exactly what runPass does, so the hit is guaranteed whatever the key
          // contains.
          setQuadMat(job.mat);
          await renderer.compileAsync(quad, quad.camera);
          if (performance.now() >= deadline) break;
        }
      } finally {
        // Disposal clears our binding. A replacement chain can own the renderer
        // by the time this continuation runs.
        if (!disposed) {
          Object.assign(_last, last); _lastPresentRT = lastRT; _vizDest = vizDest;
          renderer.setMRT(mrt); renderer.setRenderTarget(target);
        }
      }
    }

    // A-W1: present() itself, every pass drawn under the 1x1 scissor into its
    // own target (runPass). Every target the chain draws is fully rewritten by
    // the next real present() before anything reads it (no pass reads a
    // previous frame), so the pixels the player sees are identical. Returns the
    // number of passes drawn; the chain's last-frame state is restored.
    function drawWarm(opts, frame) {
      const last = { ..._last }, lastRT = _lastPresentRT, vizDest = _vizDest, mc = _mirComposites, n0 = _warmDraws;
      _warmCanvas = 0;
      try {
        _scissorWarm = true;   // runPass sets each target's own scissorTest + 1x1 rect
        present(opts, frame);
        // The other side of the upscale switch, canvas passes only: a render
        // scale crossing 1.0 mid-race swaps FXAA->canvas for SGSR->canvas.
        if (P.sgsr && aaRT && !viz) {
          _warmCanvasOnly = true; _warmFlipUp = true;
          present(opts, frame);
        }
      } finally {
        _warmCanvasOnly = false; _warmFlipUp = false;
        _scissorWarm = false;
        Object.assign(_last, last); _lastPresentRT = lastRT; _vizDest = vizDest; _mirComposites = mc;
      }
      return _warmDraws - n0;
    }

    async function warmMirror(tex) {
      if (!P.mirror || viz) return;
      const target = renderer.getRenderTarget(), previousTex = P.mirror.tex.value;
      try {
        P.mirror.tex.value = tex;   // use the live mipmapped mirror sampling state
        setQuadMat(P.mirror.mat);
        renderer.setRenderTarget((typeof ctx.softDest === "function" ? ctx.softDest() : null) || null);
        await renderer.compileAsync(quad, quad.camera);
      } finally {
        P.mirror.tex.value = previousTex;
        renderer.setRenderTarget(target);
      }
    }

    try { Log.info("gfx", "TLX post init"); } catch (_) { /* harness */ }
    return {
      enabled: () => true,
      hdrOk: () => hdr,
      sceneTarget: () => sceneRT,
      tagOn: () => tagOn,   // R3: false = one colour attachment, present() must not set the ssrTag MRT
      targetFormats: () => ({ mir11, tag8 }),   // tlx.js _mirTarget: the mirror's attachments follow the scene's
      // UnsignedByte composite (FXAA input) — the screenshot / soft-present
      // source. three's readRenderTargetPixelsAsync → backend.copyTextureToBuffer
      // + mapAsync (WebGPU Fundamentals / Explainer). Never getCurrentTexture.
      ldrTarget: () => cap8(ldrRT),
      // Soft-present target, or the latest offscreen intermediate when rendering to the canvas.
      // captureTarget replays direct-to-canvas presentation on demand.
      captureTarget,
      presentedTarget: () => (viz ? _vizDest : cap8(_lastPresentRT || ldrRT)),
      // TRAA: this frame's NDC jitter for the main camera (tlx.js begin), or null while the TAA would not run.
      taaJitter: (w, h) => (taaLive() ? AA.jitter(w, h) : null),
      taaReset: () => { if (AA) AA.reset(); giPrevOk = false; },
      // tlx.js: write the per-object velocity MRT output (the scene target has its attachment) this chain.
      velocityOn: () => !!velTex,
      // AgX opt-in writer (the TLX debug surface: __tlx.post.setAgx(true), then reload). Returns this chain's state.
      setAgx(on) { try { localStorage.setItem("apex26.tlxAgx", on ? "1" : "0"); } catch (_) { /* no storage */ } return agx; },
      // SGSR linked — tlx.js wantSpatialUpscale() requires this (fail-closed).
      spatialOk: () => !!(P && P.sgsr && P.sgsr.mat),
      fixedOk: () => fixed && !!(P && P.sgsr && P.sgsr.mat),   // #2655: tlx.js keeps the canvas present-sized
      resize,
      warm,
      drawWarm,   // A-W1
      warmSettled: () => _warmCompiles,   // the draw warm's canvas compiles have landed
      warmMirror,
      needsDepth, depthBegin, depthEnd,   // A-P1
      needsTag, discardAttachments,   // A-P2 (the mirror discards its depth + tag through this)
      discardHint, discardHintOff,   // A-P2W: the WebGPU leg's twin (vendored three patch 17)
      present,
      dispose,
      viz,
      setMirror,
      releaseMirror,
      mirrorComposites: () => _mirComposites,
      state: () => ({
        on: true,
        hdr,
        attachments: tagOn ? (velTex ? 3 : 2) : 1,
        sceneFormat: scene11 ? "rg11b10" : hdr ? "rgba16f" : "rgba8",   // phoneperf: the scene colour attachment
        // Every post attachment's format (#2649 audit): what a phone readout should show on the WebGPU leg.
        formats: {
          scene: scene11 ? "rg11b10" : hdr ? "rgba16f" : "rgba8",
          tag: !tagOn ? null : tag8 ? "r8" : (_isWgpu || bk.drawBuffersIndexedExt) ? (hdr ? "r16f" : "r8") : (hdr ? "rgba16f" : "rgba8"),
          mirror11: mir11,
          bloom: bloom11 ? "rg11b10" : hdr ? "rgba16f" : "rgba8",
          godray: !godrayRT ? null : _gr11 ? "rg11b10" : hdr ? "rgba16f" : "rgba8",
          ssao: "r8", ldr: "rgba8",
        },
        // Counted oracle (#2649): godray pair colour bytes (2 targets × bpp).
        // RGBA16F = 8 B/px, rg11b10 = 4 B/px (GLX hdr3 parity). Half of post size.
        // apex26.tlxGodray11 only takes effect on unfolded frames (no AO-in-alpha).
        godrayPairBytes: !godrayRT ? 0 : grW * grH * (_gr11 ? 4 : hdr ? 8 : 4) * 2,
        godray11: _gr11,
        ssrQuality: P.composite.U.ssrQuality.value,
        depth: { discard: _depthDiscard, kept: _depthKeep, discards: _depthDiscards },   // A-P1: the last frame's call
        tag: { discard: _tagDiscard, kept: _tagKeep, discards: _tagDiscards },   // A-P2
        blocks: { ssao: _last.ssao, bloom: _last.bloom, shafts: _last.shafts,
                  ssr: _last.ssr, fxaa: _last.fxaa, sgsr: _last.sgsr },
        aa: { traa: !!AA, taa: _last.taa, hdrPeak, ldr: hdrPeak > 1 ? "rgba16f" : "rgba8", state: AA ? AA.state() : null },
        submitHold: { on: !!(ctx.postSubmitHold && ctx.postSubmitHold()), held: _last.held, submits: _last.submits },   // the last present: command buffers held, submit calls
        targets: [W, H],
        // Post working size (PHONE_POST_SCALE of scene on phones). Aux passes half of this.
        postTargets: [pW, pH],
        phonePost,
        // Lazy targets still alive. A shed that stuck must drop these; the
        // leak test counts them after N closed presents.
        held: { ssao: !!ssaoRT, bloom: !!bloomLv, shafts: !!godrayRT },
        // Desktop tiers (tsl-gi.js): what this chain built, what is live, and what the last present ran.
        hi: HI ? { built: Object.assign({}, HI), live: _hiLive ? Object.assign({}, _hiLive) : null, aoFull: _aoFull,
          ran: { aoHi: _last.aoHi, rays: _last.rays, gi: _last.gi, ssrHi: _last.ssrHi, dof: _last.dof, mblur: _last.mblur },
          held: { gi: !!giRT, cine: !!cineA, focus: !!focusRT } } : null,
        // Motion vectors and output (EXTREME): the velocity attachment and who reads it, SSGI accumulation, AgX.
        motion: { velocity: !!velTex, taaVel: !!(AA && AA.state().velocity),
          mblurVel: !!(P.gi && P.gi.motionBlur && P.gi.motionBlur.velocity), agx,
          giAcc: P.gi && P.gi.giAcc ? { frames: giFrames, resets: giResets, held: !!giHist, velocity: P.gi.giAcc.velocity } : null },
        rtResizes: _rtResizes,
        fixed: fixed ? { physical: [PW, PH], logical: [W, H], post: [pW, pH] } : null,
        // #3311 phone orientation cover (square physical; logical follows the flip).
        orientCover: orientCover ? { physical: [PW, PH], logical: [W, H], post: [pW, pH] } : null,
      }),
      // Drop last-presented block flags (Home garage / mid-warm frames must
      // not satisfy a race probe that waits on shafts/bloom before Singapore
      // has presented). Next present() rewrites _last from that frame.
      clearLast() {
        _last.ssao = false; _last.bloom = false; _last.shafts = false;
        _last.ssr = false; _last.fxaa = false; _last.sgsr = false; _last.taa = false;
        _last.aoHi = 0; _last.rays = 0; _last.gi = false; _last.ssrHi = false; _last.dof = false; _last.mblur = false;
      },
    };
    } catch (e) {
      dispose();
      throw e;
    }
  }

  window.TLXShaders = Object.assign(window.TLXShaders || {}, { postChain });
})();
