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
 *   is resolved too, so a tag averages across an edge (accepted). No
 *   invalidateFramebuffer either (three owns attachment lifecycle).
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
    function ownRT(rt) { ownedRTs.add(rt); return rt; }
    function ownTexture(tex) { if (tex) ownedTextures.add(tex); return tex; }
    function trackMaterial(mat) { if (mat) ownedMaterials.add(mat); return mat; }
    function dispose() {
      if (disposed) return;
      disposed = true;
      if (quad) quad.material = null;
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
    // ctx.isMobile is deliberately NOT read here, and that is a decision, not a
    // dropped gate: the scene MSAA decision is the caller's (ctx.sceneSamples,
    // 0 on a phone — the GLX mobile-tier recipe, FXAA carries the AA), and
    // every remaining block is gated by the caller —
    // present(opts) receives ssao/godray/bloom already zeroed by PerfGov.tier()
    // and the GRAPHICS preset, so a disabled block allocates nothing (the
    // per-block bail above). A second phone-only gate here would shadow the
    // governor's decision rather than add to it. FORMATS: the SSAO pair is R8
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
    // the half-float one: iOS Safari stays RGBA16F); WebGPU the
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
    try { if (localStorage.getItem("apex26.tlxBloom11") === "0") bloom11 = false; } catch (_) { /* no storage: on */ }
    const hdrType = hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    bloom11 = bloom11 && hdr && THREE.UnsignedInt101111Type != null && THREE.RGBFormat != null;
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
    // Track depth independently until the RenderTarget adopts it, so a target
    // constructor throw still releases a partially-created depth texture.
    const sceneDepthTex = ownTexture(new THREE.DepthTexture(1, 1));
    sceneDepthTex.name = "TLXSceneDepth";
    // R3 (perf hunt 3): ctx.ssrTag false builds the scene target with ONE
    // colour attachment. tlx.js passes false only while nothing can read the
    // tag for the session (phone MEDIUM: po.carReflect is 0 at tier >= 2, the
    // wet-road march never reads the tag, and the heat haze is mobileTier-gated off), so every scene
    // fragment stops writing — and a tile GPU stops storing — an attachment
    // the composite never fetches. The tag slot then binds its OWN 1x1 white
    // ("not car", the tag's background value): three merges texture nodes
    // that share a texture into one sampler (hunt-1 lesson 4).
    const tagOn = ctx.ssrTag !== false;
    const sceneRT = ownRT(new THREE.RenderTarget(1, 1, {
      type: hdrType, count: tagOn ? 2 : 1, depthBuffer: true, depthTexture: sceneDepthTex,
      samples: ctx.sceneSamples || 0, resolveDepthBuffer: true,   // SCENE MSAA (header)
    }));
    ownedTextures.delete(sceneDepthTex); // sceneRT.dispose owns it from here
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
      sceneRT.textures[1].name = "ssrTag";
      sceneRT.textures[1].generateMipmaps = false;
      sceneRT.textures[1].colorSpace = THREE.NoColorSpace;
      sceneTagTex = sceneRT.textures[1];
    }
    // LDR target: composite output, FXAA input (always allocated — FXAA is
    // the unconditional resolve, like GLX's ldrFBO).
    const ldrRT = makeRT(1, 1, THREE.UnsignedByteType);
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
    function ensureGR() {
      if (!godrayRT) {
        godrayRT = makeRT(1, 1, hdrType);
        godrayBlurRT = makeRT(1, 1, hdrType);
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
    // three r184 leaked RT textures on setSize(); r185 (#33511) disposes them.
    // Keep the explicit texture disposals so a stale vendor cannot regress the
    // "black frame after resize" report; double-dispose is safe.
    function rtSetSize(rt, w, h) {
      if (rt.width === w && rt.height === h) return;
      rt.setSize(w, h);
      try {
        const ts = rt.textures || (rt.texture ? [rt.texture] : []);
        for (let i = 0; i < ts.length; i++) ts[i].dispose();
        if (rt.depthTexture) rt.depthTexture.dispose();
      } catch (_) { /* best-effort; the worst case is r184's own leak */ }
    }
    function layoutHalf() {
      aoW = Math.max(1, Math.floor(W / 2));
      aoH = Math.max(1, Math.floor(H / 2));
      grW = aoW; grH = aoH;
      if (ssaoRT) { rtSetSize(ssaoRT, aoW, aoH); rtSetSize(ssaoBlurRT, aoW, aoH); }
      if (godrayRT) { rtSetSize(godrayRT, grW, grH); rtSetSize(godrayBlurRT, grW, grH); }
    }
    function layoutBloom() {
      if (!bloomLv) return;
      let bw = Math.max(1, Math.floor(W / BLOOM_DIV));
      let bh = Math.max(1, Math.floor(H / BLOOM_DIV));
      nLv = 0;
      for (let i = 0; i < bloomLv.length; i++) {
        if (bw >= 8 && bh >= 8) {
          rtSetSize(bloomLv[i].rt, bw, bh);
          bloomLv[i].w = bw; bloomLv[i].h = bh;
          nLv++;
        }
        bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
      }
    }

    // the TSL pass set (tsl-post.js) — needs the REAL scene textures
    const P = TLXShaders.post(THREE, TSL, {
      chunks: ctx.chunks, shadow,
      sceneTex: sceneRT.texture, sceneTagTex, sceneDepthTex,
      dirtTex, whiteTex, blackTex,
      trackMaterial,
    });
    ownTexture(P.composite && P.composite.grOffTex);   // the godray slot's own "off" black
    if (P.composite && P.composite.U) P.composite.U.sceneHdr.value = _sceneHdr;

    // fullscreen runner
    quad = new THREE.QuadMesh();
    let compileJobs = null;
    // load=false CLEARS first (only called inside present(), which restores
    // autoClear): a full-viewport NoBlending quad overwrites every pixel, so a
    // clear is byte-identical and spares a tile GPU the read of the old target.
    // Only the additive UP passes and the mirror inset (a viewport rect) load.
    // A-W1 draw warm (drawWarm below): every pass DRAWS once into its own
    // target under a 1x1 scissor, so the driver's first-draw work (ANGLE-Metal's
    // pipeline state, vertex/format conversion) lands in the warm, not on the
    // race's first frames. Never the canvas (target null): a draw there would
    // present a fresh, black drawing buffer for the rest of the warm.
    let _scissorWarm = false, _warmDraws = 0, _warmSc = null;   // the scissor scratch, made on the first warm draw
    function runPass(mat, target, load) {
      if (compileJobs) { compileJobs.push({ mat, target }); return; }
      if (_scissorWarm) {
        if (!target) return;
        (_warmSc || (_warmSc = target.scissor.clone())).copy(target.scissor); target.scissor.set(0, 0, 1, 1);
        quad.material = mat;
        renderer.setRenderTarget(target);
        renderer.autoClear = false;   // a clear (WebGPU loadOp) ignores the scissor
        try { quad.render(renderer); _warmDraws++; } finally { target.scissor.copy(_warmSc); }
        return;
      }
      quad.material = mat;
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
    function mirrorPass(dest) {
      const M = P.mirror;
      if (!mirrorUniforms()) return;
      M.tex.value = _mirTex;
      if (dest) dest.viewport.set(_mirRect[0], _mirRect[1], _mirRect[2], _mirRect[3]);
      else { renderer.getViewport(_mirPrevVP || (_mirPrevVP = new THREE.Vector4())); renderer.setViewport(_mirRect[0], _mirRect[1], _mirRect[2], _mirRect[3]); }
      try { runPass(M.mat, dest, true); _mirComposites++; }
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
    const _last = { ssao: false, bloom: false, shafts: false, ssr: false, fxaa: false, sgsr: false };
    let _lastPresentRT = null;

    function resize(w, h) {
      if (w === W && h === H) {
        // Still may need aaRT when flag toggles at same render size.
        syncAaRT();
        return;
      }
      W = Math.max(1, w | 0); H = Math.max(1, h | 0);
      rtSetSize(sceneRT, W, H);
      rtSetSize(ldrRT, W, H);
      layoutHalf();
      layoutBloom();
      syncAaRT();
    }
    function syncAaRT() {
      const want = !!(P.sgsr && ctx.wantSpatialUpscale && ctx.wantSpatialUpscale());
      if (want) {
        if (!aaRT) {
          aaRT = makeRT(W, H, THREE.UnsignedByteType);
          aaRT.texture.name = "TLXPostAA";
        } else rtSetSize(aaRT, W, H);
      } else if (aaRT) {
        // _lastPresentRT may still BE this target (present() stores `dest ||
        // aaRT`), and presentedTarget() hands it to a capture. Disposing
        // without clearing it left a screenshot after setSpatialUpscale(false)
        // reading a destroyed render target; null it so the getter falls back
        // to ldrRT, which is the honest answer once the AA target is gone.
        if (_lastPresentRT === aaRT) _lastPresentRT = null;
        try { ownedRTs.delete(aaRT); aaRT.dispose(); } catch (_) { /* dying */ }
        aaRT = null;
      }
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
      const gk = (id) => PostCommon.knob(GT, id);
      const prevAutoClear = renderer.autoClear;
      renderer.autoClear = false;   // runPass sets it per pass (overwrite clears, UP/mirror load)
      let dest = null;
      // try/finally, not a plain restore at the end: tlx.js catches around
      // post.present() and repaints direct-to-canvas — without the finally, a
      // throw mid-chain latches autoClear=false for every later classic-path
      // frame, which skips three's clear and smears the canvas until reload.
      try {

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
      const aoFold = _aoFold && wantAO && wantGR && viz !== "ssao";
      const haveAO = wantAO && (!aoFold || !!compileJobs) && ensureAO();
      if (wantAO) {
        const U = P.ssao.U;
        setPersp(U, F.invProj, F.proj);
        const sv = F.sunVS || [0, 0, -1];
        U.sunVS.value.set(sv[0], sv[1], sv[2]);
        U.texel.value.set(1 / aoW, 1 / aoH);
        U.strength.value = aoStr;
        U.radius.value = gk("ssaoRadius");          // AO RADIUS knob
        const csOn = contactStr > 0 && F.proj && F.sunVS;
        U.contact.value = csOn ? contactStr : 0;
      }
      if (haveAO) {
        runPass(P.ssao.mat, ssaoRT);
        // Blur H (ssao -> blur) then V (blur -> ssao). Half res.
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

      // 0b) Volumetric sun shafts + lamp beams (js/render/glx/shaders/glsl-post.js)
      const haveGR = wantGR && ensureGR();
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
        U.time.value = F.time || 0;
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
          grNL = _grKeepNearest(total, 6);
          for (let i = 0; i < grNL; i++) {
            const oi = _grSel[i].o;
            // Map the record holding this frame's spot-shadow map to its slot
            // in THIS pass's nearest-N ordering (js/render/glx/shaders/glsl-post.js).
            if (lampArmed && oi === S.lampIdx * 15) grLampIdx = i;
            P.godray.lightPos[i].set(L[oi], L[oi + 1], L[oi + 2]);
            P.godray.lightCol[i].set(L[oi + 3], L[oi + 4], L[oi + 5]);
            P.godray.lightDir[i].set(L[oi + 7], L[oi + 8], L[oi + 9]);
            P.godray.lightGeo[i].set(L[oi + 6], L[oi + 10], L[oi + 11], L[oi + 13]);
          }
        }
        U.numLights.value = grNL;
        U.lampStr.value = lampVol;
        U.mist.value = o.mist || 0;
        U.lampShadowVP.value.fromArray(S.lampLightVP);
        U.lampShadowIdx.value = grLampIdx;
        U.hgAniso.value = gk("godrayAniso");       // GOD-RAY FOCUS knob
        U.hgFloor.value = gk("godrayFloor");      // GOD-RAY HAZE knob
        U.aoOn.value = aoFold ? 1 : 0;
        runPass(P.godray.mat, godrayRT);
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

      // 1+2) bright pass + mip-chain bloom (js/render/glx/shaders/glsl-post.js)
      const haveBloom = bloomAmt > 0 && ensureBloom();
      // opts.bloomLevels>0 truncates the widest octaves (MEDIUM/LOW / mid shed).
      const useLv = haveBloom
        ? ((o.bloomLevels > 0) ? Math.min(nLv, o.bloomLevels | 0) : nLv)
        : 0;
      if (haveBloom && useLv > 0) {
        P.bright.U.threshold.value = threshold;
        P.bright.U.exposure.value = o.exposure !== undefined ? o.exposure : 1.0;   // threshold is in exposed units
        runPass(P.bright.mat, bloomLv[0].rt);
        for (let i = 1; i < useLv; i++) {
          if (_fixedMats && P.downFixed && P.downFixed[i - 1]) {
            const d = P.downFixed[i - 1];
            d.U.texel.value.set(1 / bloomLv[i - 1].w, 1 / bloomLv[i - 1].h);
            d.U.karis.value = i === 1 ? 1 : 0;
            runPass(d.mat, bloomLv[i].rt);
          } else {
            P.down.tex.value = bloomLv[i - 1].rt.texture;
            P.down.U.texel.value.set(1 / bloomLv[i - 1].w, 1 / bloomLv[i - 1].h);
            P.down.U.karis.value = i === 1 ? 1 : 0;   // firefly fix on the first mip only
            runPass(P.down.mat, bloomLv[i].rt);
          }
        }
        P.spread.value = gk("bloomSpread");           // BLOOM SPREAD knob
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
      const _shaftMul = gk("sunShaftMul");
      C.sunShaft.value = haveBloom ? sunShaft * _shaftMul : 0;
      const grade = o.grade;
      const gs = (grade && grade.shadow) || null, gh = (grade && grade.hi) || null;
      C.gradeShadow.value.set(gs ? gs[0] : 1, gs ? gs[1] : 1, gs ? gs[2] : 1);
      C.gradeHi.value.set(gh ? gh[0] : 1, gh ? gh[1] : 1, gh ? gh[2] : 1);
      C.gradeStr.value = grade && grade.str !== undefined ? grade.str : 0;
      // IMAGE & COLOUR knobs — every default reproduces the shipped grade.
      C.tone0.value.set(gk("blacks"), gk("shadows"), gk("midtones"), gk("highlights"));
      C.tone1.value.set(gk("whites"), gk("toe"), gk("shoulder"), 0);
      C.lift.value.set(gk("liftR"), gk("liftG"), gk("liftB"));
      C.gamma.value.set(gk("gammaR"), gk("gammaG"), gk("gammaB"));
      C.gain.value.set(gk("gainR"), gk("gainG"), gk("gainB"));
      C.contrast.value = gk("contrast");
      C.vibrance.value = gk("vibrance");
      C.saturation.value = gk("saturation");
      // Skip the whole HDR block when every knob is neutral (js/render/glx/post.js).
      const _hg = PostCommon.hdrGradeOn(GT);
      C.hdrGradeOn.value = _hg ? 1 : 0;
      C.tint.value = gk("tint");
      C.vignette.value = gk("vignette");
      C.vigSoft.value = gk("vignetteSoft");
      C.bloomKnee.value = gk("bloomKnee");
      C.carReflect.value = o.carReflect != null ? o.carReflect : gk("carReflect");
      C.carGloss.value = gk("carGloss");
      C.chromAb.value = gk("chromAb");
      C.grain.value = gk("grain");
      C.grainTime.value = F.time || 0;
      C.sharpen.value = gk("sharpen");
      if (C.sharpenLimit) C.sharpenLimit.value = sharpenLimit;
      C.blackLift.value = gk("blackLift");
      C.whitePoint.value = gk("whitePoint");
      // ACES TONE CURVE knobs (defaults = the shipped Narkowicz coefficients).
      C.acesA.value = gk("acesA");
      C.acesB.value = gk("acesB");
      C.acesC.value = gk("acesC");
      C.acesD.value = gk("acesD");
      C.acesE.value = gk("acesE");
      C.speedBlur.value = o.speedBlur != null ? o.speedBlur : 0.0;
      C.shaftDecay.value = gk("sunShaftDecay");
      // Reach scales with SCREEN SUN-SHAFT, sub-linearly so the shipped
      // value (1) keeps the shipped radius (js/render/glx/post.js).
      C.shaftSpread.value = Math.sqrt(Math.max(0.05, _shaftMul));
      C.flareStreak.value = gk("flareStreak");
      C.flareStreak2.value = gk("flareStreak2");
      // EXHAUST HEAT HAZE plume anchor (opts.haze = {u, v, str} | null).
      const hz = o.haze;
      C.hazeUV.value.set(hz ? hz.u : -9, hz ? hz.v : -9);
      C.hazeStr.value = hz ? hz.str : 0;
      C.hazeTime.value = F.time || 0;
      C.ssrThick.value = gk("ssrThick");
      // Camera-aware SSR extent (game.js sets these per camera; onboard cams get
      // a raised top cutoff and a pulled-in near fade).
      C.ssrTopUV.value = o.ssrTopUV != null ? o.ssrTopUV : 0.62;
      C.ssrNear.value = o.ssrNear != null ? o.ssrNear : -2.5;
      C.lensDirt.value = dirtTex ? gk("lensDirt") : 0;
      // uReflTexel drives SSR + SHARPEN + the vignette aspect — every frame.
      C.reflTexel.value.set(1 / W, 1 / H);
      // Wet-road/car SSR needs depth + view/proj + world-up-in-view; uSsrOk
      // gates the whole branch on probe-less paths (setup preview).
      const reflStr = o.reflect || 0;
      const haveRefl = !!(F.invProj && F.proj && F.upVS);
      if (haveRefl) {
        setPersp(C, F.invProj, F.proj);
        C.upVS.value.set(F.upVS[0], F.upVS[1], F.upVS[2]);
        const hi = F.skyHi || [0.05, 0.06, 0.09];
        const lo = F.skyLo || [0.02, 0.025, 0.05];
        C.reflSkyHi.value.set(hi[0], hi[1], hi[2]);
        C.reflSkyLo.value.set(lo[0], lo[1], lo[2]);
      }
      C.ssrOk.value = haveRefl ? 1 : 0;
      C.reflect.value = haveRefl ? reflStr : 0;

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
        runPass(B.mat, dest);
      } else {
        runPass(P.composite.mat, ldrRT);
        P.fxaa.tex.value = ldrRT.texture;
        P.fxaa.U.texel.value.set(1 / W, 1 / H);
        const useUpscale = !!(P.sgsr && aaRT && ctx.wantSpatialUpscale && ctx.wantSpatialUpscale());
        if (useUpscale) {
          if (P.fxaa.mirTex) fxaaMirror(false);   // FXAA -> aaRT: the inset goes on after SGSR
          runPass(P.fxaa.mat, aaRT);
          P.sgsr.tex.value = aaRT.texture;
          P.sgsr.U.viewport.value.set(1 / W, 1 / H, W, H);
          runPass(P.sgsr.mat, dest);
          mirrorPass(dest);
          _lastPresentRT = dest || aaRT;
          _last.sgsr = true;
        } else {
          const mirIn = !!P.fxaa.mirTex && fxaaMirror(true);
          runPass(P.fxaa.mat, dest);
          if (mirIn) _mirComposites++;
          else mirrorPass(dest);
          _lastPresentRT = dest || ldrRT;
          _last.sgsr = false;
        }
      }
      _last.ssao = !!(haveAO || (aoFold && haveGR));
      _last.bloom = !!haveBloom;
      _last.shafts = !!haveGR;
      _last.ssr = !!(haveRefl && reflStr > 0.001);
      _last.fxaa = !viz;
      } finally {
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
    // (resolveDepthBuffer). three r186 has no lever on WebGPU: it stores a
    // single-sample depth whatever its usage (WebGPUBackend discardDepth is
    // MSAA-only), so a rebuild with a non-sampled depth would buy nothing there.
    // apex26.tlxDepthDiscard="0" always keeps it.
    let _depthDiscard = true;
    try { _depthDiscard = localStorage.getItem("apex26.tlxDepthDiscard") !== "0"; } catch (_) { /* no storage: on */ }
    let _depthKeep = true, _depthDiscards = 0, _invDepth = null;
    function needsDepth(opts, F) {
      const o = opts || {};
      if (viz) return true;
      if (((o.ssao !== undefined ? o.ssao : 0) > 0 || (o.contact !== undefined ? o.contact : 0) > 0) && F.invProj) return true;   // SSAO, contact, AO upsample
      const S = shadow ? shadow.S : null;
      const lampVol = (o.mist || 0) > 0 ? (o.lampVol || 0) : 0;
      if (P.godray && F.invVP && ((!!(S && S.enabled) && (o.godray !== undefined ? o.godray : 0) > 0) || lampVol > 0)) return true;
      const car = o.carReflect != null ? o.carReflect : PostCommon.knob(o.tune || null, "carReflect");
      if (F.invProj && F.proj && F.upVS && ((o.reflect || 0) > 0.001 || car > 0.001)) return true;   // SSR's depthAt gate
      const sun = PostCommon.sunScreen(F.sunDir, F.viewProj, F.sunColor, _sunScr);   // present() recomputes it
      return !!(sun.visible && sun.flare * (o.flareMul != null ? o.flareMul : 1) > 0);   // the flare's depthAt(sunUV)
    }
    // Before the scene pass (tlx.js present): decide, and tell an MSAA target whether to resolve depth.
    function depthBegin(opts, F) {
      _depthKeep = !_depthDiscard || needsDepth(opts, F);
      sceneRT.resolveDepthBuffer = _depthKeep;
      return _depthKeep;
    }
    // After the scene pass, before present(): drop the depth this frame does not read (WebGL2 only).
    function depthEnd() {
      if (_depthKeep) return false;
      const be = renderer.backend, gl = be && be.gl, st = be && be.state;
      if (!gl || typeof gl.invalidateFramebuffer !== "function" || !st || !st.currentBoundFramebuffers) return false;
      const d = be.get(sceneRT), msaa = (sceneRT.samples | 0) > 0;
      // Only the FBO three just rendered the scene into (and, under MSAA, resolved out of) — never a guess.
      const target = msaa ? gl.READ_FRAMEBUFFER : gl.DRAW_FRAMEBUFFER;
      const fb = st.currentBoundFramebuffers[target];
      const ours = msaa ? (fb && fb === d.msaaFrameBuffer) : (fb && d.framebuffers && Object.values(d.framebuffers).indexOf(fb) >= 0);
      if (!ours) return false;
      gl.invalidateFramebuffer(target, _invDepth || (_invDepth = [gl.DEPTH_ATTACHMENT]));
      _depthDiscards++;
      return true;
    }

    async function warm(opts, frame) {
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
          renderer.setRenderTarget(job.target);
          // THE LIVE QUAD, not a snapshot: a fresh QuadMesh per job does not
          // share a render-object cache key with the one present() draws, so
          // the race built the same 16 post programs AGAIN through runPass
          // (gpu-census 205 on macos-latest Metal: x16 tagged warm, x16 tagged
          // runPass, the same eight sites). Compiling `quad` itself with the job's material is
          // exactly what runPass does, so the hit is guaranteed whatever the key
          // contains.
          quad.material = job.mat;
          await renderer.compileAsync(quad, quad.camera);
          if (performance.now() >= deadline) break;
        }
      } finally {
        Object.assign(_last, last); _lastPresentRT = lastRT; _vizDest = vizDest;
        renderer.setMRT(mrt); renderer.setRenderTarget(target);
      }
    }

    // A-W1: present() itself, every pass drawn under the 1x1 scissor into its
    // own target (runPass). Every target the chain draws is fully rewritten by
    // the next real present() before anything reads it (no pass reads a
    // previous frame), so the pixels the player sees are identical. Returns the
    // number of passes drawn; the chain's last-frame state is restored.
    function drawWarm(opts, frame) {
      const last = { ..._last }, lastRT = _lastPresentRT, vizDest = _vizDest, mc = _mirComposites, n0 = _warmDraws;
      const sc0 = renderer.getScissorTest();
      try {
        _scissorWarm = true;
        renderer.setScissorTest(true);
        present(opts, frame);
      } finally {
        _scissorWarm = false;
        renderer.setScissorTest(sc0);
        Object.assign(_last, last); _lastPresentRT = lastRT; _vizDest = vizDest; _mirComposites = mc;
      }
      return _warmDraws - n0;
    }

    async function warmMirror(tex) {
      if (!P.mirror || viz) return;
      const target = renderer.getRenderTarget(), previousTex = P.mirror.tex.value;
      try {
        P.mirror.tex.value = tex;   // use the live mipmapped mirror sampling state
        quad.material = P.mirror.mat;
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
      // UnsignedByte composite (FXAA input) — the screenshot / soft-present
      // source. three's readRenderTargetPixelsAsync → backend.copyTextureToBuffer
      // + mapAsync (WebGPU Fundamentals / Explainer). Never getCurrentTexture.
      ldrTarget: () => ldrRT,
      // WHAT THE LAST FRAME ACTUALLY WROTE. Soft-present / capture must read
      // the FXAA (or SGSR) destination when upscaling — not pre-FXAA ldrRT.
      presentedTarget: () => (viz ? _vizDest : (_lastPresentRT || ldrRT)),
      // SGSR linked — tlx.js wantSpatialUpscale() requires this (fail-closed).
      spatialOk: () => !!(P && P.sgsr && P.sgsr.mat),
      resize,
      warm,
      drawWarm,   // A-W1
      warmMirror,
      needsDepth, depthBegin, depthEnd,   // A-P1
      present,
      dispose,
      viz,
      setMirror,
      mirrorComposites: () => _mirComposites,
      state: () => ({
        on: true,
        hdr,
        attachments: tagOn ? 2 : 1,
        depth: { discard: _depthDiscard, kept: _depthKeep, discards: _depthDiscards },   // A-P1: the last frame's call
        blocks: { ssao: _last.ssao, bloom: _last.bloom, shafts: _last.shafts,
                  ssr: _last.ssr, fxaa: _last.fxaa, sgsr: _last.sgsr },
        targets: [W, H],
      }),
      // Drop last-presented block flags (Home garage / mid-warm frames must
      // not satisfy a race probe that waits on shafts/bloom before Singapore
      // has presented). Next present() rewrites _last from that frame.
      clearLast() {
        _last.ssao = false; _last.bloom = false; _last.shafts = false;
        _last.ssr = false; _last.fxaa = false; _last.sgsr = false;
      },
    };
    } catch (e) {
      dispose();
      throw e;
    }
  }

  window.TLXShaders = Object.assign(window.TLXShaders || {}, { postChain });
})();
