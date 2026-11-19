"use strict";

(function () {
  const _gk = (T, id) => PostCommon.knob(T, id);
  const POST_VIZ = ["ssao", "bloom", "shafts", "godray", "composite-off", "scene"];

  function postChain(THREE, TSL, ctx) {
    const renderer = ctx.renderer;
    let sharpenLimit = 0;
    try { sharpenLimit = localStorage.getItem("apex26.tlxSharpenLimit") === "1" ? 1 : 0; } catch (_) {  }
    const ownedRTs = new Set();
    const ownedTextures = new Set();
    const ownedMaterials = new Set();
    let quad = null;
    let disposed = false;
    let viewportScope = null;
    function ownRT(rt) { ownedRTs.add(rt); return rt; }
    function ownTexture(tex) { if (tex) ownedTextures.add(tex); return tex; }
    function trackMaterial(mat) { if (mat) ownedMaterials.add(mat); return mat; }
    function dispose() {
      if (disposed) return;
      disposed = true;
      if (quad) quad.material = null;
      if (viewportScope) viewportScope.dispose();
      for (const mat of ownedMaterials) {
        try { mat.dispose(); } catch (_) {  }
      }
      for (const rt of ownedRTs) {
        try { rt.dispose(); } catch (_) {  }
      }
      for (const tex of ownedTextures) {
        try { tex.dispose(); } catch (_) {  }
      }
      ownedMaterials.clear(); ownedRTs.clear(); ownedTextures.clear();
    }
    try {
    const shadow = ctx.shadow || null;
    const viz = (ctx.viz && POST_VIZ.indexOf(ctx.viz) >= 0) ? ctx.viz : null;
    let _vizDest = null;

    let hdr = !!(renderer.backend && renderer.backend.isWebGPUBackend);
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
    const r11Renderable = bloom11 && hdr && THREE.UnsignedInt101111Type != null && THREE.RGBFormat != null;
    try { if (localStorage.getItem("apex26.tlxBloom11") === "0") bloom11 = false; } catch (_) {  }
    const hdrType = hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    bloom11 = bloom11 && hdr && THREE.UnsignedInt101111Type != null && THREE.RGBFormat != null;
    const _r11Blendable = r11Renderable && !!(renderer.backend && renderer.backend.isWebGPUBackend);
    let scene11 = _r11Blendable && !!ctx.isMobile;
    try {
      const k = localStorage.getItem("apex26.tlxScene11");
      if (k === "0") scene11 = false; else if (k === "1") scene11 = _r11Blendable;
    } catch (_) {  }
    const _isWgpu = !!(renderer.backend && renderer.backend.isWebGPUBackend);
    const _fmtOn = (k) => { try { return localStorage.getItem(k) === "1"; } catch (_) { return false; } };
    const mir11 = scene11 && _fmtOn("apex26.tlxMir11");
    const tag8 = _isWgpu && _fmtOn("apex26.tlxTag8");
    const gr11Knob = _r11Blendable && _fmtOn("apex26.tlxGodray11");
    let _sceneHdr = hdr ? 1 : 0;

    function onePx(v) {
      const t = ownTexture(new THREE.DataTexture(new Uint8Array([v, v, v, 255]), 1, 1));
      t.colorSpace = THREE.NoColorSpace;
      t.needsUpdate = true;
      return t;
    }
    const whiteTex = onePx(255);
    const blackTex = onePx(0);
    blackTex.minFilter = blackTex.magFilter = THREE.LinearFilter;

    function makeDirtTex() {
      try {
        const cv = PostCommon.makeDirtCanvas();
        if (!cv) return null;
        const t = ownTexture(new THREE.Texture(cv));
        t.minFilter = THREE.LinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.generateMipmaps = false;
        t.colorSpace = THREE.NoColorSpace;
        t.needsUpdate = true;
        return t;
      } catch (_) { return null; }
    }
    const dirtTex = makeDirtTex();

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
    const phys = fixed || orientCover;
    let PW = 1, PH = 1;
    let pW = 1, pH = 1;

    function makeRT(w, h, type, format) {
      const rt = ownRT(new THREE.RenderTarget(w, h, {
        type, depthBuffer: false,
        format: format || THREE.RGBAFormat,
      }));
      rt.texture.generateMipmaps = false;
      rt.texture.colorSpace = THREE.NoColorSpace;
      return rt;
    }

    let W = 1, H = 1;
    const sceneDepthTex = ownTexture(new THREE.DepthTexture(1, 1));
    sceneDepthTex.name = "TLXSceneDepth";
    const tagOn = ctx.ssrTag !== false;
    const sceneRT = ownRT(new THREE.RenderTarget(1, 1, {
      type: hdrType, count: tagOn ? 2 : 1, depthBuffer: true, depthTexture: sceneDepthTex,
      samples: ctx.sceneSamples || 0, resolveDepthBuffer: true,
    }));
    ownedTextures.delete(sceneDepthTex);
    if (scene11) { sceneRT.texture.type = THREE.UnsignedInt101111Type; sceneRT.texture.format = THREE.RGBFormat; }
    sceneRT.texture.name = "output";
    sceneRT.texture.generateMipmaps = false;
    sceneRT.texture.colorSpace = THREE.NoColorSpace;
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
    const ldrRT = makeRT(1, 1, THREE.UnsignedByteType);
    ldrRT.texture.name = "TLXPostLDR";
    let aaRT = null;

    let ssaoRT = null, ssaoBlurRT = null, aoW = 1, aoH = 1;
    let godrayRT = null, godrayBlurRT = null, grW = 1, grH = 1;
    let _grLite = true;
    try { _grLite = localStorage.getItem("apex26.grLite") !== "0"; } catch (_) {  }
    let _aoFold = true;
    try { _aoFold = localStorage.getItem("apex26.tlxAoFold") !== "0"; } catch (_) {  }
    let _fixedMats = true;
    try { _fixedMats = localStorage.getItem("apex26.tlxPostFixedMats") !== "0"; } catch (_) {  }
    const BLOOM_DIV = 2, BLOOM_LEVELS_MAX = 5;
    let bloomLv = null;
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
        ssaoRT = makeRT(1, 1, THREE.UnsignedByteType, THREE.RedFormat);
        ssaoBlurRT = makeRT(1, 1, THREE.UnsignedByteType, THREE.RedFormat);
        layoutHalf();
        bindFixedAO();
      }
      return true;
    }
    let _gr11 = false;
    function ensureGR(r11) {
      if (godrayRT && _gr11 !== r11) releaseGR();
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
    let _rtResizes = 0;
    function rtSetSize(rt, w, h) {
      if (rt.width === w && rt.height === h) return;
      _rtResizes++;
      rt.setSize(w, h);
    }
    function place(rt, lw, lh, pw, ph) {
      if (!phys) { rtSetSize(rt, lw, lh); return; }
      rtSetSize(rt, pw, ph);
      rt.viewport.set(0, 0, lw, lh);
      const ts = rt.textures || (rt.texture ? [rt.texture] : []);
      for (let i = 0; i < ts.length; i++) VP.layout(ts[i], lw, lh, pw, ph);
      if (rt.depthTexture) VP.layout(rt.depthTexture, lw, lh, pw, ph);
    }
    const halfOf = (v) => Math.max(1, Math.floor(v / 2));
    const PHONE_POST_SCALE = 1;
    const postSize = (v) => Math.max(1, Math.floor(Math.max(1, v | 0) * (phonePost ? PHONE_POST_SCALE : 1)));
    function layoutHalf() {
      aoW = halfOf(pW);
      aoH = halfOf(pH);
      grW = aoW; grH = aoH;
      const physBaseW = fixed ? postSize(PW) : (orientCover ? PW : pW);
      const physBaseH = fixed ? postSize(PH) : (orientCover ? PH : pH);
      const pw = phys ? halfOf(physBaseW) : aoW, ph = phys ? halfOf(physBaseH) : aoH;
      if (ssaoRT) { place(ssaoRT, aoW, aoH, pw, ph); place(ssaoBlurRT, aoW, aoH, pw, ph); }
      if (godrayRT) { place(godrayRT, grW, grH, pw, ph); place(godrayBlurRT, grW, grH, pw, ph); }
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
        if (bw >= 8 && bh >= 8) {
          place(bloomLv[i].rt, bw, bh, pbw, pbh);
          bloomLv[i].w = bw; bloomLv[i].h = bh;
          nLv++;
        } else if (phys && pbw >= 8 && pbh >= 8) {
          place(bloomLv[i].rt, 1, 1, pbw, pbh);
          bloomLv[i].w = 1; bloomLv[i].h = 1;
        }
        bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
        pbw = Math.max(1, pbw >> 1); pbh = Math.max(1, pbh >> 1);
      }
    }

    const P = TLXShaders.post(THREE, TSL, {
      chunks: ctx.chunks, shadow,
      sceneTex: sceneRT.texture, sceneTagTex, sceneDepthTex,
      dirtTex, whiteTex, blackTex,
      trackMaterial, vp: phys ? VP : null,
    });
    ownTexture(P.composite && P.composite.grOffTex);
    if (P.composite && P.composite.U) P.composite.U.sceneHdr.value = _sceneHdr;

    const SHED_FRAMES = 8;
    let aoIdle = 0, grIdle = 0, bloomIdle = 0;
    function dropRT(rt) {
      if (!rt) return;
      ownedRTs.delete(rt);
      try { rt.dispose(); } catch (_) {  }
    }
    function unbind(slot, fallback) {
      if (slot) slot.value = fallback;
    }
    function releaseAO() {
      if (!ssaoRT && !ssaoBlurRT) return;
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
    function shedIdle(live, idle, release) {
      if (live) return 0;
      idle++;
      if (idle >= SHED_FRAMES) { release(); return 0; }
      return idle;
    }

    quad = new THREE.QuadMesh();
    let _quadVN = null;
    quad.render({ render(q) { _quadVN = q.material.vertexNode; } });
    function setQuadMat(mat) {
      if (_quadVN && mat && !mat.vertexNode) mat.vertexNode = _quadVN;
      quad.material = mat;
    }
    let compileJobs = null;
    let _scissorWarm = false, _warmDraws = 0, _warmSc = null, _warmCanvas = 0, _warmCanvasOnly = false, _warmFlipUp = false;
    let _warmCompiles = Promise.resolve();
    function compileCanvas(mat) {
      const mrt = renderer.getMRT();
      const job = () => {
        const rt = renderer.getRenderTarget(), mrt0 = renderer.getMRT();
        setQuadMat(mat); renderer.setRenderTarget(null); renderer.setMRT(mrt);
        try { return renderer.compileAsync(quad, quad.camera); } finally { renderer.setRenderTarget(rt); renderer.setMRT(mrt0); }
      };
      _warmCompiles = _warmCompiles.then(job).catch(() => {  });
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
        const st0 = target.scissorTest;
        (_warmSc || (_warmSc = target.scissor.clone())).copy(target.scissor); target.scissor.set(0, 0, 1, 1); target.scissorTest = true;
        setQuadMat(mat);
        renderer.setRenderTarget(target);
        renderer.autoClear = false;
        try { quad.render(renderer); _warmDraws++; } finally { target.scissor.copy(_warmSc); target.scissorTest = st0; }
        return;
      }
      setQuadMat(mat);
      renderer.setRenderTarget(target);
      renderer.autoClear = !load;
      quad.render(renderer);
    }

    let _mirTex = null, _mirHdr = true, _mirComposites = 0, _mirFlip = true;
    const _mirRect = [0, 0, 0, 0];
    let _mirPrevVP = null;
    function setMirror(tex, rect, hdr, flip) {
      _mirTex = tex && rect && rect[2] >= 2 && rect[3] >= 2 ? tex : null;
      if (_mirTex) { _mirRect[0] = rect[0]; _mirRect[1] = rect[1]; _mirRect[2] = rect[2]; _mirRect[3] = rect[3]; }
      _mirHdr = !!hdr;
      _mirFlip = flip !== false;
    }
    function releaseMirror() {
      _mirTex = null;
      if (P && P.mirror) P.mirror.tex.value = blackTex;
      if (P && P.fxaa && P.fxaa.mirTex) P.fxaa.mirTex.value = blackTex;
    }
    function mirrorUniforms() {
      const M = P.mirror;
      if (!_mirTex || !M) return false;
      M.U.rect.value.set(_mirRect[0], _mirRect[1], _mirRect[2], _mirRect[3]);
      M.U.hdr.value = _mirHdr ? 1 : 0;
      if (M.U.flip) M.U.flip.value = _mirFlip ? 1 : 0;
      return true;
    }
    let _mirFold = true;
    try { _mirFold = localStorage.getItem("apex26.tlxMirFold") !== "0"; } catch (_) {  }
    function fxaaMirror(on) {
      const FX = P.fxaa;
      const fold = !!(on && _mirFold && FX.mirTex && mirrorUniforms());
      FX.U.mir.value = fold ? 1 : 0;
      FX.mirTex.value = fold ? _mirTex : blackTex;
      return fold;
    }
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

    let _perspWarned = false;
    function setPersp(U, ip, p) {
      U.ipXY.value.set(ip[0], ip[5], ip[12], ip[13]);
      U.ipZW.value.set(ip[14], ip[11], ip[15]);
      if (!p) return;
      U.pXY.value.set(p[0], p[5], p[8], p[9]);
      U.pW.value = p[11];
      if (!_perspWarned && (p[1] || p[2] || p[3] || p[4] || p[6] || p[7] || p[12] || p[13] || p[15])) {
        _perspWarned = true;
        try { Log.warn("gfx", "TLX post: non-perspective projection; SSAO/SSR assume a perspective proj"); } catch (_) {  }
      }
    }

    const _grSel = [];
    const _sunScr = { visible: false, ndcx: -5, ndcy: -5, flare: 0, shaft: 0 };
    const _grKeepNearest = (total, k) => PostCommon.keepNearest(_grSel, total, k);

    const _last = { ssao: false, bloom: false, shafts: false, ssr: false, fxaa: false, sgsr: false };
    let _lastPresentRT = null;

    function resize(w, h, pw, ph) {
      let nPW = 0, nPH = 0;
      if (fixed) {
        nPW = Math.max(1, pw | 0, w | 0);
        nPH = Math.max(1, ph | 0, h | 0);
        if (PW > 1 && PH > 1 && Math.abs(nPW - PH) <= 1 && Math.abs(nPH - PW) <= 1) {
          nPW = Math.max(PW, nPW); nPH = Math.max(PH, nPH);
        }
      } else if (orientCover) {
        const side = Math.max(1, w | 0, h | 0);
        nPW = side; nPH = side;
        if (PW > 1 && PH > 1) {
          const transpose = Math.abs((w | 0) - H) <= 1 && Math.abs((h | 0) - W) <= 1;
          if (transpose) { nPW = Math.max(PW, nPW); nPH = Math.max(PH, nPH); }
        }
      }
      const nPostW = postSize(w);
      const nPostH = postSize(h);
      if (w === W && h === H && nPW === PW && nPH === PH && nPostW === pW && nPostH === pH) {
        syncAaRT();
        return;
      }
      W = Math.max(1, w | 0); H = Math.max(1, h | 0);
      PW = nPW; PH = nPH;
      pW = nPostW; pH = nPostH;
      const ldrPW = fixed ? postSize(PW) : (orientCover ? PW : pW);
      const ldrPH = fixed ? postSize(PH) : (orientCover ? PH : pH);
      place(sceneRT, W, H, PW, PH);
      place(ldrRT, pW, pH, ldrPW, ldrPH);
      layoutHalf();
      layoutBloom();
      syncAaRT();
    }
    function syncAaRT() {
      const want = !!(P.sgsr && (fixed || (ctx.wantSpatialUpscale && ctx.wantSpatialUpscale())));
      if (want) {
        if (!aaRT) {
          aaRT = makeRT(phys ? 1 : pW, phys ? 1 : pH, THREE.UnsignedByteType);
          aaRT.texture.name = "TLXPostAA";
        }
        const aaPW = fixed ? postSize(PW) : (orientCover ? PW : pW);
        const aaPH = fixed ? postSize(PH) : (orientCover ? PH : pH);
        place(aaRT, pW, pH, aaPW, aaPH);
      } else if (aaRT) {
        if (_lastPresentRT === aaRT) _lastPresentRT = null;
        try { ownedRTs.delete(aaRT); aaRT.dispose(); } catch (_) {  }
        aaRT = null;
      }
    }

    function vset(pass, w, h) { if (phys && pass && pass.V) pass.V.set(w, h); }
    const _psOut = { width: 0, height: 0 }, _ps = [0, 0];
    function presentSize() {
      const ps = ctx.getPresentSize ? ctx.getPresentSize(_psOut) : null;
      _ps[0] = ps && ps.width ? ps.width : PW; _ps[1] = ps && ps.height ? ps.height : PH;
      return _ps;
    }

    function present(opts, F) {
      const S = shadow ? shadow.S : null;
      const lampArmed = !!(S && S.lampArmed);
      const o = opts || {};
      const GT = o.tune || null;
      const prevAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      let dest = null;
      try {
      if (phys) VP.sync();

      const threshold = o.threshold !== undefined ? o.threshold : 0.75;
      const bloomAmt = o.bloom !== undefined ? o.bloom : 0.55;
      let aoStr = o.ssao !== undefined ? o.ssao : 0;
      const contactStr = o.contact !== undefined ? o.contact : 0;
      let grStr = o.godray !== undefined ? o.godray : 0;
      const lampVol = (o.mist || 0) > 0 ? (o.lampVol || 0) : 0;
      if (viz === "ssao") aoStr = Math.max(aoStr, 0.95);
      if (viz === "shafts" || viz === "godray") grStr = Math.max(grStr, 0.8);

      const wantAO = !!((aoStr > 0 || contactStr > 0) && F.invProj);
      const sunGR = !!(S && S.enabled) && grStr > 0;
      const wantGR = !!(P.godray && F.invVP && (sunGR || lampVol > 0));
      const aoFold = _aoFold && wantAO && wantGR && viz !== "ssao";
      const haveAO = wantAO && (!aoFold || !!compileJobs) && ensureAO();
      if (wantAO) {
        const U = P.ssao.U;
        setPersp(U, F.invProj, F.proj);
        const sv = F.sunVS || [0, 0, -1];
        U.sunVS.value.set(sv[0], sv[1], sv[2]);
        U.strength.value = aoStr;
        U.radius.value = _gk(GT, "ssaoRadius");
        const csOn = contactStr > 0 && F.proj && F.sunVS;
        U.contact.value = csOn ? contactStr : 0;
      }
      if (haveAO) {
        vset(P.ssao, aoW, aoH); vset(P.blurAOH, aoW, aoH); vset(P.blurAOV, aoW, aoH); vset(P.blurAO, aoW, aoH);
        runPass(P.ssao.mat, ssaoRT);
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

      const haveGR = wantGR && ensureGR(gr11Knob && !aoFold);
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
        if ((F.cloud || 0) > 0.001) U.time.value = F.time || 0;
        U.cloudCover.value = F.cloud || 0;
        U.cloudSpeed.value = F.cloudSpeed != null ? F.cloudSpeed : 1;
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
          grNL = _grKeepNearest(total, 6);
          for (let i = 0; i < grNL; i++) {
            const oi = _grSel[i].o;
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
        U.hgAniso.value = _gk(GT, "godrayAniso");
        U.hgFloor.value = _gk(GT, "godrayFloor");
        U.aoOn.value = aoFold ? 1 : 0;
        vset(P.godray, grW, grH); vset(P.blurGRH, grW, grH); vset(P.blurGRV, grW, grH); vset(P.blurGR, grW, grH);
        runPass(P.godray.mat, godrayRT);
        const grPairs = (o.grLite || (!sunGR && _grLite)) ? 1 : 2;
        for (let bp = 0; bp < grPairs; bp++) {
          const aoA = aoFold && bp === 0 ? 1 : 0;
          if (_fixedMats && P.blurGRH) {
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

      const haveBloom = bloomAmt > 0 && ensureBloom();
      const useLv = haveBloom
        ? ((o.bloomLevels > 0) ? Math.min(nLv, o.bloomLevels | 0) : nLv)
        : 0;
      if (haveBloom && useLv > 0) {
        P.bright.U.threshold.value = threshold;
        P.bright.U.exposure.value = o.exposure !== undefined ? o.exposure : 1.0;
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
            P.down.U.karis.value = i === 1 ? 1 : 0;
            vset(P.down, bloomLv[i].w, bloomLv[i].h);
            runPass(P.down.mat, bloomLv[i].rt);
          }
        }
        P.spread.value = _gk(GT, "bloomSpread");
        for (let i = useLv - 1; i >= 1; i--) {
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
          runPass(up.mat, bloomLv[i - 1].rt, i > 1);
        }
      }

      const C = P.composite.U;
      P.composite.tex.bloom.value = haveBloom ? bloomLv[0].rt.texture : blackTex;
      C.bloomAmt.value = bloomAmt * 1.25 / Math.max(useLv - 1, 1);
      const aoGR = aoFold && haveGR;
      const aoOn = aoGR || haveAO;
      P.composite.tex.ssao.value = haveAO ? ssaoRT.texture : whiteTex;
      C.aoAlpha.value = aoGR ? 1 : 0;
      C.aoTexel.value.set(aoOn ? 1 / aoW : 0, aoOn ? 1 / aoH : 0);
      P.composite.tex.godray.value = haveGR ? godrayRT.texture : (P.composite.grOffTex || blackTex);
      C.haveGodray.value = haveGR ? 1 : 0;
      const sun = PostCommon.sunScreen(F.sunDir, F.viewProj, F.sunColor, _sunScr);
      const sunUVx = sun.visible ? sun.ndcx * 0.5 + 0.5 : -2;
      const sunUVy = sun.visible ? sun.ndcy * 0.5 + 0.5 : -2;
      const flareStr = sun.flare, sunShaft = sun.shaft;
      C.sunUV.value.set(sunUVx, sunUVy);
      C.flareStr.value = flareStr * (o.flareMul != null ? o.flareMul : 1);
      C.exposure.value = o.exposure !== undefined ? o.exposure : 1.0;
      const _shaftMul = _gk(GT, "sunShaftMul");
      C.sunShaft.value = haveBloom ? sunShaft * _shaftMul : 0;
      const grade = o.grade;
      const gs = (grade && grade.shadow) || null, gh = (grade && grade.hi) || null;
      C.gradeShadow.value.set(gs ? gs[0] : 1, gs ? gs[1] : 1, gs ? gs[2] : 1);
      C.gradeHi.value.set(gh ? gh[0] : 1, gh ? gh[1] : 1, gh ? gh[2] : 1);
      C.gradeStr.value = grade && grade.str !== undefined ? grade.str : 0;
      C.tone0.value.set(_gk(GT, "blacks"), _gk(GT, "shadows"), _gk(GT, "midtones"), _gk(GT, "highlights"));
      C.tone1.value.set(_gk(GT, "whites"), _gk(GT, "toe"), _gk(GT, "shoulder"), 0);
      C.lift.value.set(_gk(GT, "liftR"), _gk(GT, "liftG"), _gk(GT, "liftB"));
      C.gamma.value.set(_gk(GT, "gammaR"), _gk(GT, "gammaG"), _gk(GT, "gammaB"));
      C.gain.value.set(_gk(GT, "gainR"), _gk(GT, "gainG"), _gk(GT, "gainB"));
      C.contrast.value = _gk(GT, "contrast");
      C.vibrance.value = _gk(GT, "vibrance");
      C.saturation.value = _gk(GT, "saturation");
      const _hg = PostCommon.hdrGradeOn(GT);
      C.hdrGradeOn.value = _hg ? 1 : 0;
      C.tint.value = _gk(GT, "tint");
      C.vignette.value = _gk(GT, "vignette");
      C.vigSoft.value = _gk(GT, "vignetteSoft");
      C.bloomKnee.value = _gk(GT, "bloomKnee");
      C.carReflect.value = o.carReflect != null ? o.carReflect : _gk(GT, "carReflect");
      C.carGloss.value = _gk(GT, "carGloss");
      C.chromAb.value = _gk(GT, "chromAb");
      C.grain.value = _gk(GT, "grain");
      C.grainTime.value = F.time || 0;
      if (C.dthOff) {
        const step60 = Math.floor(Math.fround(Math.fround(C.grainTime.value) * 60.0));
        C.dthOff.value = (step60 - 64 * Math.floor(step60 / 64)) * 5.588238;
      }
      C.sharpen.value = _gk(GT, "sharpen");
      if (C.sharpenLimit) C.sharpenLimit.value = sharpenLimit;
      C.blackLift.value = _gk(GT, "blackLift");
      C.whitePoint.value = _gk(GT, "whitePoint");
      C.acesA.value = _gk(GT, "acesA");
      C.acesB.value = _gk(GT, "acesB");
      C.acesC.value = _gk(GT, "acesC");
      C.acesD.value = _gk(GT, "acesD");
      C.acesE.value = _gk(GT, "acesE");
      C.speedBlur.value = o.speedBlur != null ? o.speedBlur : 0.0;
      C.shaftDecay.value = _gk(GT, "sunShaftDecay");
      C.shaftSpread.value = Math.sqrt(Math.max(0.05, _shaftMul));
      C.flareStreak.value = _gk(GT, "flareStreak");
      C.flareStreak2.value = _gk(GT, "flareStreak2");
      const hz = o.haze;
      C.hazeUV.value.set(hz ? hz.u : -9, hz ? hz.v : -9);
      C.hazeStr.value = hz ? hz.str : 0;
      if (hz) C.hazeTime.value = F.time || 0;
      C.ssrThick.value = _gk(GT, "ssrThick");
      C.ssrTopUV.value = o.ssrTopUV != null ? o.ssrTopUV : 0.62;
      C.ssrNear.value = o.ssrNear != null ? o.ssrNear : -2.5;
      C.ssrQuality.value = o.ssrQuality >= 2 ? 2 : o.ssrQuality >= 1 ? 1 : 0;
      C.lensDirt.value = dirtTex ? _gk(GT, "lensDirt") : 0;
      C.reflTexel.value.set(1 / W, 1 / H);
      if (C.vigAspect) {
        const va = W > 0 && H > 0 ? W / H : 1;
        C.vigAspect.value = va;
        C.vigNorm.value = 0.70710678 / Math.hypot(va * 0.5, 0.5);
      }
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

      dest = (typeof ctx.softDest === "function" ? ctx.softDest() : null) || null;
      if (viz) {
        const B = P.blit;
        B.U.mono.value = viz === "ssao" ? 1 : 0;
        B.U.gain.value = 1;
        B.tex.value =
          viz === "ssao" ? (haveAO ? ssaoRT.texture : whiteTex)
          : viz === "bloom" ? (haveBloom ? bloomLv[0].rt.texture : blackTex)
          : (viz === "shafts" || viz === "godray") ? (haveGR ? godrayRT.texture : blackTex)
          : sceneRT.texture;
        _vizDest = dest;
        if (fixed) { const ps = presentSize(); vset(B, ps[0], ps[1]); }
        runPass(B.mat, dest);
      } else {
        vset(P.composite, pW, pH); vset(P.fxaa, pW, pH);
        runPass(P.composite.mat, ldrRT);
        P.fxaa.tex.value = ldrRT.texture;
        P.fxaa.U.texel.value.set(1 / pW, 1 / pH);
        const useUpscale = !!(P.sgsr && aaRT && !!(ctx.wantSpatialUpscale && ctx.wantSpatialUpscale()) !== _warmFlipUp);
        if (useUpscale) {
          if (P.fxaa.mirTex) fxaaMirror(false);
          runPass(P.fxaa.mat, aaRT);
          P.sgsr.tex.value = aaRT.texture;
          P.sgsr.U.viewport.value.set(1 / pW, 1 / pH, pW, pH);
          if (fixed) {
            const ps = presentSize();
            vset(P.sgsr, ps[0], ps[1]);
            P.sgsr.U.plain.value = ctx.userSpatialUpscale && ctx.userSpatialUpscale() ? 0 : 1;
          }
          runPass(P.sgsr.mat, dest);
          mirrorPass(dest);
          _lastPresentRT = dest || aaRT;
          _last.sgsr = true;
        } else {
          if (fixed) { const ps = presentSize(); vset(P.fxaa, ps[0], ps[1]); }
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
      _last.ssr = !!(haveRefl && (C.reflect.value > 0.001 || C.carReflect.value > 0.001));
      _last.fxaa = !viz;
      aoIdle = shedIdle(!!haveAO, aoIdle, releaseAO);
      grIdle = shedIdle(!!haveGR, grIdle, releaseGR);
      bloomIdle = shedIdle(!!(haveBloom && useLv > 0), bloomIdle, releaseBloom);
      } finally {
        if (!dest) {
          try { renderer.setRenderTarget(null); } catch (_) {  }
        }
        renderer.autoClear = prevAutoClear;
      }
    }

    let _depthDiscard = true;
    try { _depthDiscard = localStorage.getItem("apex26.tlxDepthDiscard") !== "0"; } catch (_) {  }
    let _depthKeep = true, _depthDiscards = 0, _invDepth = null;
    let _tagDiscard = true;
    try { _tagDiscard = localStorage.getItem("apex26.tlxTagDiscard") !== "0"; } catch (_) {  }
    let _tagKeep = true, _tagDiscards = 0, _invTag = null, _invBoth = null;
    const isGpu = () => !!(renderer.backend && renderer.backend.isWebGPUBackend);
    let _gpuArmed = false;
    function needsTag(opts, F) {
      const o = opts || {};
      if (viz) return true;
      const hz = o.haze;
      if (hz && hz.str > 0.002) return true;
      const car = o.carReflect != null ? o.carReflect : PostCommon.knob(o.tune || null, "carReflect");
      return !!(F.invProj && F.proj && F.upVS) && ((o.reflect || 0) > 0.001 || car > 0.001);
    }
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
      if (((o.ssao !== undefined ? o.ssao : 0) > 0 || (o.contact !== undefined ? o.contact : 0) > 0) && F.invProj) return true;
      const S = shadow ? shadow.S : null;
      const lampVol = (o.mist || 0) > 0 ? (o.lampVol || 0) : 0;
      if (P.godray && F.invVP && ((!!(S && S.enabled) && (o.godray !== undefined ? o.godray : 0) > 0) || lampVol > 0)) return true;
      const car = o.carReflect != null ? o.carReflect : PostCommon.knob(o.tune || null, "carReflect");
      if (F.invProj && F.proj && F.upVS && ((o.reflect || 0) > 0.001 || car > 0.001)) return true;
      const sun = PostCommon.sunScreen(F.sunDir, F.viewProj, F.sunColor, _sunScr);
      if (!(sun.visible && sun.flare * (o.flareMul != null ? o.flareMul : 1) > 0)) return false;
      const ux = Math.fround(sun.ndcx * 0.5 + 0.5), uy = Math.fround(sun.ndcy * 0.5 + 0.5);
      return ux >= 0 && ux <= 1 && uy >= 0 && uy <= 1;
    }
    function depthBegin(opts, F) {
      _depthKeep = !_depthDiscard || needsDepth(opts, F);
      sceneRT.resolveDepthBuffer = _depthKeep;
      _tagKeep = !_tagDiscard || !tagOn || (sceneRT.samples | 0) > 0 || needsTag(opts, F);
      _gpuArmed = discardHint(sceneRT, _tagKeep ? 0 : 2, !_depthKeep && (sceneRT.samples | 0) === 0);
      return _depthKeep;
    }
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
      const jobs = [], target = renderer.getRenderTarget(), mrt = renderer.getMRT();
      const last = { ..._last }, lastRT = _lastPresentRT, vizDest = _vizDest;
      try {
        compileJobs = jobs;
        try { present(opts, frame); } finally { compileJobs = null; }
        const deadline = performance.now() + 3000;
        for (const job of jobs) {
          renderer.setRenderTarget(job.target);
          setQuadMat(job.mat);
          await renderer.compileAsync(quad, quad.camera);
          if (performance.now() >= deadline) break;
        }
      } finally {
        Object.assign(_last, last); _lastPresentRT = lastRT; _vizDest = vizDest;
        renderer.setMRT(mrt); renderer.setRenderTarget(target);
      }
    }

    function drawWarm(opts, frame) {
      const last = { ..._last }, lastRT = _lastPresentRT, vizDest = _vizDest, mc = _mirComposites, n0 = _warmDraws;
      _warmCanvas = 0;
      try {
        _scissorWarm = true;
        present(opts, frame);
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
        P.mirror.tex.value = tex;
        setQuadMat(P.mirror.mat);
        renderer.setRenderTarget((typeof ctx.softDest === "function" ? ctx.softDest() : null) || null);
        await renderer.compileAsync(quad, quad.camera);
      } finally {
        P.mirror.tex.value = previousTex;
        renderer.setRenderTarget(target);
      }
    }

    try { Log.info("gfx", "TLX post init"); } catch (_) {  }
    return {
      enabled: () => true,
      hdrOk: () => hdr,
      sceneTarget: () => sceneRT,
      tagOn: () => tagOn,
      targetFormats: () => ({ mir11, tag8 }),
      ldrTarget: () => ldrRT,
      presentedTarget: () => (viz ? _vizDest : (_lastPresentRT || ldrRT)),
      spatialOk: () => !!(P && P.sgsr && P.sgsr.mat),
      fixedOk: () => fixed && !!(P && P.sgsr && P.sgsr.mat),
      resize,
      warm,
      drawWarm,
      warmSettled: () => _warmCompiles,
      warmMirror,
      needsDepth, depthBegin, depthEnd,
      needsTag, discardAttachments,
      discardHint, discardHintOff,
      present,
      dispose,
      viz,
      setMirror,
      releaseMirror,
      mirrorComposites: () => _mirComposites,
      state: () => ({
        on: true,
        hdr,
        attachments: tagOn ? 2 : 1,
        sceneFormat: scene11 ? "rg11b10" : hdr ? "rgba16f" : "rgba8",
        formats: {
          scene: scene11 ? "rg11b10" : hdr ? "rgba16f" : "rgba8",
          tag: !tagOn ? null : tag8 ? "r8" : (_isWgpu || bk.drawBuffersIndexedExt) ? (hdr ? "r16f" : "r8") : (hdr ? "rgba16f" : "rgba8"),
          mirror11: mir11,
          bloom: bloom11 ? "rg11b10" : hdr ? "rgba16f" : "rgba8",
          godray: !godrayRT ? null : _gr11 ? "rg11b10" : hdr ? "rgba16f" : "rgba8",
          ssao: "r8", ldr: "rgba8",
        },
        godrayPairBytes: !godrayRT ? 0 : grW * grH * (_gr11 ? 4 : hdr ? 8 : 4) * 2,
        godray11: _gr11,
        ssrQuality: P.composite.U.ssrQuality.value,
        depth: { discard: _depthDiscard, kept: _depthKeep, discards: _depthDiscards },
        tag: { discard: _tagDiscard, kept: _tagKeep, discards: _tagDiscards },
        blocks: { ssao: _last.ssao, bloom: _last.bloom, shafts: _last.shafts,
                  ssr: _last.ssr, fxaa: _last.fxaa, sgsr: _last.sgsr },
        targets: [W, H],
        postTargets: [pW, pH],
        phonePost,
        held: { ssao: !!ssaoRT, bloom: !!bloomLv, shafts: !!godrayRT },
        rtResizes: _rtResizes,
        fixed: fixed ? { physical: [PW, PH], logical: [W, H], post: [pW, pH] } : null,
        orientCover: orientCover ? { physical: [PW, PH], logical: [W, H], post: [pW, pH] } : null,
      }),
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
