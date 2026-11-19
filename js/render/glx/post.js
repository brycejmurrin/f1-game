"use strict";

const GLXPost = (function () {

  function init(core) {
    const gl = core.gl;
    const { useProg, bindVAO, setBlend, setDepthMask, setCull, link, locs, beginLinks, resolveLinks } = core;
    const MOBILE_TIER = core.MOBILE_TIER;
    const IS_MOBILE = core.IS_MOBILE;
    const { POST_VS, BRIGHT_FS, BLUR_FS, DOWN_FS, UP_FS, SSAO_FS, GODRAY_FS,
            COMPOSITE_FS, FXAA_FS, SGSR_FS, MIRROR_FS, DECAL_VS, MIRROR_GLASS_FS } = GLXShaders;
    const F = core.frame;

    let ssaoProg = null, ssaoU = null, ssaoFBO = null, ssaoTex = null;
    let ssaoBlurFBO = null, ssaoBlurTex = null, whiteTex = null, blackTex = null, dirtTex = null;
    let godrayProg = null, godrayU = null, godrayFBO = null, godrayTex = null;
    let godrayBlurFBO = null, godrayBlurTex = null;
    let godrayW = 0, godrayH = 0;
    let _grLite = true;
    try { _grLite = localStorage.getItem("apex26.grLite") !== "0"; } catch (_) {  }
    let ssaoW = 0, ssaoH = 0;
    let fxaaProg = null, fxaaU = null, ldrFBO = null, ldrTex = null;
    let sgsrProg = null, sgsrU = null, aaFBO = null, aaTex = null;
    let sgsrTried = false;
    let targetW = 0, targetH = 0, aaW = 0, aaH = 0;
    let allocW = 0, allocH = 0;
    let coverMode = false;
    let _uvScaleX = 1, _uvScaleY = 1;
    const _uvLocs = new Map();

    let postEnabled = false;
    let brightProg = null, brightU = null;
    let blurProg = null, blurU = null;
    let downProg = null, downU = null, upProg = null, upU = null;
    let compProg = null, compU = null;
    let sceneFBO = null, sceneTex = null, sceneDepth = null;
    let colorType = null;
    let r11Ok = false;
    const BLOOM_DIV = 2;
    const BLOOM_LEVELS_MAX = 5;
    let bloomLv = [];
    let msaaSamples = 0;
    let msFBO = null, msColorRB = null, msDepthRB = null;

    const _grPos = new Float32Array(18), _grCol = new Float32Array(18),
          _grRad = new Float32Array(6), _grDir = new Float32Array(18),
          _grCone = new Float32Array(12), _grVolW = new Float32Array(6), _grSel = [];
    const _sunUV = [-2, -2];
    const _sunScr = { visible: false, ndcx: -5, ndcy: -5, flare: 0, shaft: 0 };
    const _ONE3 = [1, 1, 1];
    const _NEGZ = [0, 0, -1];
    const _SKY_HI = [0.05, 0.06, 0.09];
    const _SKY_LO = [0.02, 0.025, 0.05];
    const _compUf = Object.create(null);
    let _softReadFB = null;
    let _lastPath = null;
    function uf1(loc, key, v) {
      if (!loc) return;
      if (_compUf[key] !== v) { gl.uniform1f(loc, v); _compUf[key] = v; }
    }
    function uf3(loc, key, x, y, z) {
      if (!loc) return;
      const k1 = key + ".y", k2 = key + ".z";
      if (_compUf[key] !== x || _compUf[k1] !== y || _compUf[k2] !== z) {
        gl.uniform3f(loc, x, y, z);
        _compUf[key] = x; _compUf[k1] = y; _compUf[k2] = z;
      }
    }
    function uf4(loc, key, a, b, c, d) {
      if (!loc) return;
      const k1 = key + ".1", k2 = key + ".2", k3 = key + ".3";
      if (_compUf[key] !== a || _compUf[k1] !== b || _compUf[k2] !== c || _compUf[k3] !== d) {
        gl.uniform4f(loc, a, b, c, d);
        _compUf[key] = a; _compUf[k1] = b; _compUf[k2] = c; _compUf[k3] = d;
      }
    }
    const _grKeepNearest = (total, k) => PostCommon.keepNearest(_grSel, total, k);

    function usePost(prog, exactSize = false) {
      useProg(prog);
      let loc = _uvLocs.get(prog);
      if (loc === undefined) {
        loc = prog ? gl.getUniformLocation(prog, "uUVScale") : null;
        _uvLocs.set(prog, loc);
      }
      if (loc) gl.uniform2f(loc, exactSize ? 1 : _uvScaleX, exactSize ? 1 : _uvScaleY);
    }
    function setCoverScale(logicalW, logicalH) {
      _uvScaleX = allocW > 0 ? (logicalW / allocW) : 1;
      _uvScaleY = allocH > 0 ? (logicalH / allocH) : 1;
    }

    function ensureSpatial() {
      if (sgsrProg || sgsrTried) return !!sgsrProg;
      sgsrTried = true;
      try {
        sgsrProg = link(POST_VS, SGSR_FS);
        if (sgsrProg) sgsrU = locs(sgsrProg, ["uTex", "uViewport"]);
      } catch (_) { sgsrProg = null; sgsrU = null; }
      return !!sgsrProg;
    }

    function setup() {
      const ext = gl.getExtension("EXT_color_buffer_float")
        || gl.getExtension("EXT_color_buffer_half_float");
      colorType = ext ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
      r11Ok = !!gl.getExtension("EXT_color_buffer_float");

      if (beginLinks) beginLinks();
      brightProg = link(POST_VS, BRIGHT_FS);
      blurProg = link(POST_VS, BLUR_FS);
      downProg = link(POST_VS, DOWN_FS);
      upProg = link(POST_VS, UP_FS);
      compProg = link(POST_VS, COMPOSITE_FS);
      ssaoProg = link(POST_VS, SSAO_FS);
      godrayProg = link(POST_VS, GODRAY_FS);
      fxaaProg = link(POST_VS, FXAA_FS);
      if (resolveLinks) {
        const bad = resolveLinks(), ok = (p) => (p && !bad.has(p) ? p : null);
        brightProg = ok(brightProg); blurProg = ok(blurProg); downProg = ok(downProg); upProg = ok(upProg);
        compProg = ok(compProg); ssaoProg = ok(ssaoProg); godrayProg = ok(godrayProg); fxaaProg = ok(fxaaProg);
      }
      if (fxaaProg) fxaaU = locs(fxaaProg, ["uTex", "uTexel"]);
      if (!brightProg || !blurProg || !compProg || !downProg || !upProg) return false;
      for (const k in _compUf) delete _compUf[k];
      brightU = locs(brightProg, ["uScene", "uThreshold", "uExposure"]);
      blurU = locs(blurProg, ["uTex", "uDir"]);
      downU = locs(downProg, ["uTex", "uTexel", "uKaris"]);
      upU = locs(upProg, ["uTex", "uTexel", "uSpread"]);
      try {
        const fmt = colorType === gl.HALF_FLOAT ? gl.RGBA16F : gl.RGBA8;
        const cs = gl.getInternalformatParameter(gl.RENDERBUFFER, fmt, gl.SAMPLES);
        const ds = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, gl.SAMPLES);
        const cMax = cs && cs.length ? cs[0] : 0;
        const dMax = ds && ds.length ? ds[0] : 0;
        msaaSamples = IS_MOBILE ? 0 : Math.min(4, cMax, dMax);
        if (!IS_MOBILE) {
          let _ultra = false;
          try {
            let _p = localStorage.getItem("apex26.gfxPreset");
            try { _p = JSON.parse(_p); } catch (_) {  }
            _ultra = _p === "ultra" || (_p == null && localStorage.getItem("apex26.gfxHigh") === "1");
          } catch (_) {  }
          if (!_ultra && msaaSamples > 2) msaaSamples = 2;
        }
        if (msaaSamples < 2) msaaSamples = 0;
      } catch (e) { msaaSamples = 0; }
      compU = locs(compProg, ["uScene", "uBloom", "uSSAO", "uAOTexel", "uGodray", "uHaveGodray", "uBloomAmt", "uBloomKnee", "uSunUV", "uFlareStr", "uExposure", "uSunShaft", "uGradeShadow", "uGradeHi", "uGradeStr", "uContrast", "uVibrance", "uSaturation", "uTint", "uVignette", "uVigSoft", "uTone0", "uTone1", "uLift", "uGamma", "uGain", "uHdrGradeOn", "uCarReflect", "uCarGloss", "uDepth", "uInvProj", "uProj", "uUpVS", "uReflTexel", "uReflect", "uSsrOk", "uReflSkyHi", "uReflSkyLo", "uSsrThick", "uSsrTopUV", "uSsrNear", "uSsrQuality", "uChromAb", "uGrain", "uGrainTime", "uSharpen", "uBlackLift", "uWhitePoint", "uAcesA", "uAcesB", "uAcesC", "uAcesD", "uAcesE", "uSpeedBlur", "uDirt", "uLensDirt", "uHazeUV", "uHazeStr", "uHazeTime", "uShaftDecay", "uShaftSpread", "uFlareStreak", "uFlareStreak2"]);
      if (ssaoProg) ssaoU = locs(ssaoProg, ["uDepth", "uInvProj", "uProj", "uSunVS", "uTexel", "uStrength", "uContact", "uRadius"]);
      if (godrayProg) godrayU = locs(godrayProg, ["uDepth", "uShadowMap", "uInvVP", "uLightVP", "uEye", "uSunDir", "uSunColor", "uStr", "uTime", "uCloudCover", "uCloudSpeed", "uNumLights", "uLightPos[0]", "uLightCol[0]", "uLightRad[0]", "uLightDir[0]", "uLightCone[0]", "uLightVolW[0]", "uMist", "uLampStr", "uHgAniso", "uHgFloor", "uLampShadowMap", "uLampShadowVP", "uLampShadowIdx"]);
      whiteTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, whiteTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      blackTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, blackTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      makeDirtTex();
      return true;
    }

    function makeDirtTex() {
      try {
        const cv = PostCommon.makeDirtCanvas();
        if (!cv) return;
        dirtTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, dirtTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      } catch (e) { dirtTex = null; }
    }

    function abandonTargets() {
      const drop = (fbo, a, b) => {
        if (fbo) gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        if (a) gl.deleteTexture(a);
        if (b) gl.deleteTexture(b);
      };
      drop(sceneFBO, sceneTex, sceneDepth); sceneTex = sceneDepth = null;
      if (msFBO) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, msFBO);
        if (msColorRB) gl.deleteRenderbuffer(msColorRB);
        if (msDepthRB) gl.deleteRenderbuffer(msDepthRB);
        msColorRB = msDepthRB = null;
      }
      msaaSamples = 0;
      for (const lv of bloomLv) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, lv.fbo);
        if (lv.tex) gl.deleteTexture(lv.tex);
        gl.deleteFramebuffer(lv.fbo);
      }
      bloomLv = [];
      drop(ssaoFBO, ssaoTex); ssaoTex = null;
      drop(ssaoBlurFBO, ssaoBlurTex); ssaoBlurTex = null;
      drop(godrayFBO, godrayTex); godrayTex = null;
      drop(godrayBlurFBO, godrayBlurTex); godrayBlurTex = null;
      drop(ldrFBO, ldrTex); ldrTex = null;
      drop(aaFBO, aaTex); aaTex = null;
      allocW = 0; allocH = 0; aaW = 0; aaH = 0; coverMode = false;
      _uvScaleX = 1; _uvScaleY = 1;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); 
    }

    function createTargets() {
      if (!postEnabled) return;
      const { width, height } = core.getSize();
      if (sceneTex && width === targetW && height === targetH) {
        syncSpatialTarget(width, height); return;
      }
      if (sceneTex && coverMode && allocW >= width && allocH >= height) {
        targetW = width; targetH = height;
        ssaoW = Math.max(1, Math.floor(width / 2));
        ssaoH = Math.max(1, Math.floor(height / 2));
        godrayW = ssaoW; godrayH = ssaoH;
        let bw = Math.max(1, Math.floor(width / BLOOM_DIV));
        let bh = Math.max(1, Math.floor(height / BLOOM_DIV));
        for (let i = 0; i < bloomLv.length; i++) {
          bloomLv[i].w = bw; bloomLv[i].h = bh;
          bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
        }
        setCoverScale(width, height);
        syncSpatialTarget(width, height);
        return;
      }
      const cover = (IS_MOBILE || MOBILE_TIER) ? Math.max(1, width, height) : 0;
      const aw = cover || width, ah = cover || height;
      const internal = colorType === gl.HALF_FLOAT ? gl.RGBA16F : gl.RGBA8;
      const hdrOk = colorType === gl.HALF_FLOAT;
      const mk = (w, h, fmt) => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        if (fmt === "r8") gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, null);
        else if (fmt === "hdr3" && hdrOk && r11Ok) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R11F_G11F_B10F, w, h, 0, gl.RGB, colorType, null);
        else gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, colorType, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return tex;
      };
      if (!sceneFBO) sceneFBO = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO);
      if (sceneTex) gl.deleteTexture(sceneTex);
      if (sceneDepth) gl.deleteTexture(sceneDepth);
      sceneTex = mk(aw, ah);
      sceneDepth = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, sceneDepth);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, aw, ah, 0,
        gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, sceneDepth, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        abandonTargets();
        postEnabled = false;
        return;
      }
      if (msaaSamples > 1) {
        const internalD = gl.DEPTH_COMPONENT24;
        if (!msFBO) msFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, msFBO);
        if (msColorRB) gl.deleteRenderbuffer(msColorRB);
        if (msDepthRB) gl.deleteRenderbuffer(msDepthRB);
        msColorRB = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, msColorRB);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msaaSamples, internal, aw, ah);
        msDepthRB = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, msDepthRB);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msaaSamples, internalD, aw, ah);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, msColorRB);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, msDepthRB);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, null);
          gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, null);
          gl.deleteRenderbuffer(msColorRB); gl.deleteRenderbuffer(msDepthRB);
          msColorRB = null; msDepthRB = null;
          msaaSamples = 0;
        }
      }
      for (const lv of bloomLv) { if (lv.tex) gl.deleteTexture(lv.tex); if (lv.fbo) gl.deleteFramebuffer(lv.fbo); }
      bloomLv = [];
      let bw = Math.max(1, Math.floor(width / BLOOM_DIV));
      let bh = Math.max(1, Math.floor(height / BLOOM_DIV));
      let abw = Math.max(1, Math.floor(aw / BLOOM_DIV));
      let abh = Math.max(1, Math.floor(ah / BLOOM_DIV));
      for (let i = 0; i < BLOOM_LEVELS_MAX && bw >= 8 && bh >= 8; i++) {
        const tex = mk(abw, abh, "hdr3");
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        if (i === 0 && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          gl.deleteTexture(tex); gl.deleteFramebuffer(fbo);
          abandonTargets();
          postEnabled = false;
          return;
        }
        bloomLv.push({ fbo, tex, w: bw, h: bh, pw: abw, ph: abh });
        bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
        abw = Math.max(1, abw >> 1); abh = Math.max(1, abh >> 1);
      }
      if (ssaoProg) {
        ssaoW = Math.max(1, Math.floor(width / 2));
        ssaoH = Math.max(1, Math.floor(height / 2));
        const asW = Math.max(1, Math.floor(aw / 2)), asH = Math.max(1, Math.floor(ah / 2));
        if (!ssaoFBO) ssaoFBO = gl.createFramebuffer();
        if (!ssaoBlurFBO) ssaoBlurFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, ssaoFBO);
        if (ssaoTex) gl.deleteTexture(ssaoTex);
        ssaoTex = mk(asW, asH, "r8");
        gl.bindFramebuffer(gl.FRAMEBUFFER, ssaoFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ssaoTex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, ssaoBlurFBO);
        if (ssaoBlurTex) gl.deleteTexture(ssaoBlurTex);
        ssaoBlurTex = mk(asW, asH, "r8");
        gl.bindFramebuffer(gl.FRAMEBUFFER, ssaoBlurFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ssaoBlurTex, 0);
      }
      if (godrayProg) {
        godrayW = Math.max(1, Math.floor(width / 2));
        godrayH = Math.max(1, Math.floor(height / 2));
        const agW = Math.max(1, Math.floor(aw / 2)), agH = Math.max(1, Math.floor(ah / 2));
        if (!godrayFBO) godrayFBO = gl.createFramebuffer();
        if (!godrayBlurFBO) godrayBlurFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, godrayFBO);
        if (godrayTex) gl.deleteTexture(godrayTex);
        godrayTex = mk(agW, agH, "hdr3");
        gl.bindFramebuffer(gl.FRAMEBUFFER, godrayFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, godrayTex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, godrayBlurFBO);
        if (godrayBlurTex) gl.deleteTexture(godrayBlurTex);
        godrayBlurTex = mk(agW, agH, "hdr3");
        gl.bindFramebuffer(gl.FRAMEBUFFER, godrayBlurFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, godrayBlurTex, 0);
      }
      if (fxaaProg || sgsrProg) {
        if (!ldrFBO) ldrFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, ldrFBO);
        if (ldrTex) gl.deleteTexture(ldrTex);
        ldrTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, ldrTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, aw, ah, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, ldrFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ldrTex, 0);
      }
      allocW = aw; allocH = ah;
      coverMode = !!cover;
      targetW = width; targetH = height;
      setCoverScale(width, height);
      syncSpatialTarget(width, height);
    }

    function syncSpatialTarget(width, height) {
      const wantUp = !!(sgsrProg && fxaaProg && core.wantSpatialUpscale && core.wantSpatialUpscale());
      if (wantUp) {
        if (aaTex && ((coverMode && allocW >= width && allocH >= height) ||
            (aaW === width && aaH === height))) {
          aaW = width; aaH = height;
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);  return;
        }
        if (!aaFBO) aaFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, aaFBO);
        if (aaTex) gl.deleteTexture(aaTex);
        aaTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, aaTex);
        const aaAW = coverMode ? (allocW || width) : width;
        const aaAH = coverMode ? (allocH || height) : height;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, aaAW, aaAH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, aaFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, aaTex, 0);
        aaW = width; aaH = height;
      } else if (aaFBO || aaTex) {
        if (aaFBO) gl.bindFramebuffer(gl.FRAMEBUFFER, aaFBO);
        if (aaTex) gl.deleteTexture(aaTex);
        aaTex = null;
        if (aaFBO) { gl.deleteFramebuffer(aaFBO); aaFBO = null; }
      }
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        abandonTargets();
        postEnabled = false;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); 
    }

    const _INV_COLOR = [gl.COLOR_ATTACHMENT0], _INV_DEFAULT = [gl.COLOR], _INV_DEPTH = [gl.DEPTH_ATTACHMENT];
    const _canInvalidate = typeof gl.invalidateFramebuffer === "function";
    const _ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
    const _webkit = /CriOS|FxiOS|EdgiOS/.test(_ua) || (/Safari\//.test(_ua) && !/Chrome\/|Chromium\/|Edg\//.test(_ua));
    const _invFbo = _canInvalidate;
    const _invDefault = _invFbo && !_webkit;
    let _coverClr = -1;
    const halfPx = (a) => Math.max(1, Math.floor(a / 2));
    function bindOverwrite(fbo) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      if (coverMode && fbo && fbo !== core.outputFBO()) {
        const v = (fbo === ssaoFBO || fbo === ssaoBlurFBO) ? 1 : 0;
        if (_coverClr !== v) { gl.clearColor(v, v, v, v); _coverClr = v; }
        gl.clear(gl.COLOR_BUFFER_BIT); return;
      }
      if ((fbo ? _invFbo : _invDefault) && !(core.outputClipped && core.outputClipped())) {
        gl.invalidateFramebuffer(gl.FRAMEBUFFER, fbo ? _INV_COLOR : _INV_DEFAULT);
      }
    }

    function bindSceneTarget() {
      const { width, height } = core.getSize();
      if (postEnabled) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, msaaSamples > 1 ? msFBO : sceneFBO);
        gl.viewport(0, 0, width, height);
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, core.outputFBO());
        const v = core.outputViewport(width, height);
        gl.viewport(v[0], v[1], v[2], v[3]);
      }
    }

    function present(opts) {
      const SH = core.shadow;
      SH.carArmed = false;
      const lampArmed = SH.lampArmed;
      SH.lampArmed = false;
      if (!postEnabled) { _lastPath = { on: false }; mirrorComposite(opts); core.gpuTimerEnd(); return; }
      const { width, height } = core.getSize();
      setCoverScale(width, height);
      _coverClr = -1;
      let threshold = opts && opts.threshold !== undefined ? opts.threshold : 0.75;
      let bloomAmt = opts && opts.bloom !== undefined ? opts.bloom : 0.55;
      const swSoft = typeof PerfGov !== "undefined" && PerfGov.softwareRaster();
      if (swSoft) {
        if (colorType !== gl.HALF_FLOAT) { threshold *= 1.18; bloomAmt *= 0.5; }
        else { threshold *= 1.10; bloomAmt *= 0.62; }
      }
      const aoStr = opts && opts.ssao !== undefined ? opts.ssao : 0;
      const contactStr = opts && opts.contact !== undefined ? opts.contact : 0;
      const haveAO = ssaoProg && (aoStr > 0 || contactStr > 0) && F.invProj && ssaoFBO;
      const grStrPre = opts && opts.godray !== undefined ? opts.godray : 0;
      const lampVolPre = ((opts && opts.mist) || 0) > 0 ? ((opts && opts.lampVol) || 0) : 0;
      const haveGRPre = godrayProg && F.invVP && godrayFBO && ((SH.enabled && grStrPre > 0) || lampVolPre > 0);
      const _carReflPre = opts && opts.carReflect != null ? opts.carReflect
        : (PostCommon.knob(opts && opts.tune, "carReflect"));
      const ssrOn = ((opts && opts.reflect) > 0.001) || _carReflPre > 0.001;
      const flareMul = opts && opts.flareMul != null ? opts.flareMul : 1;
      const sun = PostCommon.sunScreen(F.sunDir, F.viewProj, F.sunColor, _sunScr);
      const flareMaybe = PostCommon.flareTapsDepth(sun, flareMul);
      const needDepth = haveAO || haveGRPre || ssrOn || flareMaybe;

      if (msaaSamples > 1) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msFBO);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, sceneFBO);
        gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height,
          needDepth ? (gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT) : gl.COLOR_BUFFER_BIT, gl.NEAREST);
        if (_invFbo) gl.invalidateFramebuffer(gl.READ_FRAMEBUFFER, [gl.COLOR_ATTACHMENT0, gl.DEPTH_ATTACHMENT]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); 
      } else if (!needDepth && _invFbo && sceneFBO) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO);
        gl.invalidateFramebuffer(gl.FRAMEBUFFER, _INV_DEPTH);
      }

      setBlend(false);
      setDepthMask(true);
      gl.disable(gl.DEPTH_TEST);
      bindVAO(core.skyVAO);

      if (haveAO) {
        gl.viewport(0, 0, ssaoW, ssaoH);
        bindOverwrite(ssaoFBO);
        usePost(ssaoProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneDepth);
        gl.uniform1i(ssaoU.uDepth, 0);
        gl.uniformMatrix4fv(ssaoU.uInvProj, false, F.invProj);
        gl.uniform2f(ssaoU.uTexel, 1 / ssaoW, 1 / ssaoH);
        gl.uniform1f(ssaoU.uStrength, aoStr);
        gl.uniform1f(ssaoU.uRadius, PostCommon.knob(opts && opts.tune, "ssaoRadius"));
        const csOn = contactStr > 0 && F.proj && F.sunVS;
        gl.uniformMatrix4fv(ssaoU.uProj, false, F.proj || F.invProj);
        gl.uniform3fv(ssaoU.uSunVS, F.sunVS || _NEGZ);
        gl.uniform1f(ssaoU.uContact, csOn ? contactStr : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        usePost(blurProg);
        gl.uniform1i(blurU.uTex, 0);
        bindOverwrite(ssaoBlurFBO);
        gl.bindTexture(gl.TEXTURE_2D, ssaoTex);
        gl.uniform2f(blurU.uDir, 1 / halfPx(allocW), 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        bindOverwrite(ssaoFBO);
        gl.bindTexture(gl.TEXTURE_2D, ssaoBlurTex);
        gl.uniform2f(blurU.uDir, 0, 1 / halfPx(allocH));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      const grStr = grStrPre;
      const lampVol = lampVolPre;
      const sunGR = SH.enabled && grStr > 0;
      const haveGR = haveGRPre;
      if (haveGR) {
        gl.viewport(0, 0, godrayW, godrayH);
        bindOverwrite(godrayFBO);
        usePost(godrayProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneDepth);
        gl.uniform1i(godrayU.uDepth, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, SH.mapTex);
        gl.uniform1i(godrayU.uShadowMap, 1);
        gl.uniformMatrix4fv(godrayU.uInvVP, false, F.invVP);
        gl.uniformMatrix4fv(godrayU.uLightVP, false, SH.lightVP);
        gl.uniform3fv(godrayU.uEye, F.eye);
        gl.uniform3fv(godrayU.uSunDir, F.sunDir);
        gl.uniform3fv(godrayU.uSunColor, F.sunColor || _ONE3);
        gl.uniform1f(godrayU.uStr, sunGR ? grStr : 0.0);
        gl.uniform1f(godrayU.uTime, F.time);
        gl.uniform1f(godrayU.uCloudCover, F.cloud);
        gl.uniform1f(godrayU.uCloudSpeed, F.cloudSpeed);
        let grNL = 0, grLampIdx = -1;
        const frameLights = F.lights, frameEye = F.eye;
        if (lampVol > 0 && frameLights) {
          const L = frameLights, total = (L.length / 15) | 0;
          const ex = frameEye[0], ey = frameEye[1], ez = frameEye[2];
          for (let i = 0; i < total; i++) {
            const o = i * 15, dx = L[o] - ex, dy = L[o + 1] - ey, dz = L[o + 2] - ez;
            const d = dx * dx + dy * dy + dz * dz;
            const e = _grSel[i]; if (e) { e.d = d; e.o = o; } else _grSel[i] = { d: d, o: o };
          }
          _grSel.length = total;
          grNL = _grKeepNearest(total, 6);
          for (let i = 0; i < grNL; i++) {
            const o = _grSel[i].o;
            if (lampArmed && o === SH.lampIdx * 15) grLampIdx = i;
            _grPos[i*3]=L[o]; _grPos[i*3+1]=L[o+1]; _grPos[i*3+2]=L[o+2];
            _grCol[i*3]=L[o+3]; _grCol[i*3+1]=L[o+4]; _grCol[i*3+2]=L[o+5];
            _grRad[i]=L[o+6];
            _grDir[i*3]=L[o+7]; _grDir[i*3+1]=L[o+8]; _grDir[i*3+2]=L[o+9];
            _grCone[i*2]=L[o+10]; _grCone[i*2+1]=L[o+11];
            _grVolW[i]=L[o+13];
          }
          gl.uniform3fv(godrayU["uLightPos[0]"], _grPos);
          gl.uniform3fv(godrayU["uLightCol[0]"], _grCol);
          gl.uniform1fv(godrayU["uLightRad[0]"], _grRad);
          gl.uniform3fv(godrayU["uLightDir[0]"], _grDir);
          gl.uniform2fv(godrayU["uLightCone[0]"], _grCone);
          gl.uniform1fv(godrayU["uLightVolW[0]"], _grVolW);
        }
        gl.uniform1i(godrayU.uNumLights, grNL);
        gl.uniform1f(godrayU.uLampStr, lampVol);
        gl.uniform1f(godrayU.uMist, (opts && opts.mist) || 0);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, SH.lampTex || SH.mapTex);
        gl.uniform1i(godrayU.uLampShadowMap, 2);
        gl.uniformMatrix4fv(godrayU.uLampShadowVP, false, SH.lampLightVP);
        gl.uniform1i(godrayU.uLampShadowIdx, grLampIdx);
        gl.activeTexture(gl.TEXTURE0);
        const GT = opts && opts.tune || null;
        gl.uniform1f(godrayU.uHgAniso, PostCommon.knob(GT, "godrayAniso"));
        gl.uniform1f(godrayU.uHgFloor, PostCommon.knob(GT, "godrayFloor"));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        usePost(blurProg);
        gl.uniform1i(blurU.uTex, 0);
        gl.activeTexture(gl.TEXTURE0);
        const grPairs = ((opts && opts.grLite) || (!sunGR && _grLite)) ? 1 : 2;
        for (let bp = 0; bp < grPairs; bp++) {
          bindOverwrite(godrayBlurFBO);
          gl.bindTexture(gl.TEXTURE_2D, godrayTex);
          gl.uniform2f(blurU.uDir, (1 + bp) / halfPx(allocW), 0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          bindOverwrite(godrayFBO);
          gl.bindTexture(gl.TEXTURE_2D, godrayBlurTex);
          gl.uniform2f(blurU.uDir, 0, (1 + bp) / halfPx(allocH));
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
      }

      const nLv = bloomLv.length;
      const useLv = (opts && opts.bloomLevels > 0) ? Math.min(nLv, opts.bloomLevels | 0) : nLv;
      const doBloom = bloomAmt > 0 && useLv > 0;
      const swFlareK = swSoft ? (doBloom ? 0.42 : 0) : 1;
      const swExposureK = swSoft ? (doBloom ? 1 : 0.72) : 1;
      if (doBloom) {
        gl.viewport(0, 0, bloomLv[0].w, bloomLv[0].h);
        bindOverwrite(bloomLv[0].fbo);
        usePost(brightProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneTex);
        gl.uniform1i(brightU.uScene, 0);
        gl.uniform1f(brightU.uThreshold, threshold);
        gl.uniform1f(brightU.uExposure, opts && opts.exposure !== undefined ? opts.exposure : 1.0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        usePost(downProg);
        gl.uniform1i(downU.uTex, 0);
        for (let i = 1; i < useLv; i++) {
          bindOverwrite(bloomLv[i].fbo);
          gl.viewport(0, 0, bloomLv[i].w, bloomLv[i].h);
          gl.bindTexture(gl.TEXTURE_2D, bloomLv[i - 1].tex);
          gl.uniform2f(downU.uTexel, 1 / bloomLv[i - 1].pw, 1 / bloomLv[i - 1].ph);
          gl.uniform1f(downU.uKaris, i === 1 ? 1 : 0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        usePost(upProg);
        gl.uniform1i(upU.uTex, 0);
        gl.uniform1f(upU.uSpread, PostCommon.knob(opts && opts.tune, "bloomSpread"));
        for (let i = useLv - 1; i >= 1; i--) {
          const last = i === 1;
          setBlend(!last);
          if (!last) gl.blendFunc(gl.ONE, gl.ONE);
          if (last) bindOverwrite(bloomLv[i - 1].fbo); else gl.bindFramebuffer(gl.FRAMEBUFFER, bloomLv[i - 1].fbo);
          gl.viewport(0, 0, bloomLv[i - 1].w, bloomLv[i - 1].h);
          gl.bindTexture(gl.TEXTURE_2D, bloomLv[i].tex);
          gl.uniform2f(upU.uTexel, 1 / bloomLv[i].pw, 1 / bloomLv[i].ph);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        setBlend(false);
      }

      const useFxaa = !!(fxaaProg && ldrFBO && ldrTex);
      const useUpscale = !!(sgsrProg && sgsrU && ldrFBO && ldrTex
        && core.wantSpatialUpscale && core.wantSpatialUpscale()
        && (!useFxaa || (aaFBO && aaTex)));
      const toLdr = (useFxaa || useUpscale) && ldrFBO && ldrTex;
      bindOverwrite(toLdr ? ldrFBO : core.outputFBO());
      if (toLdr) {
        gl.viewport(0, 0, width, height);
      } else {
        const _compVP = core.outputViewport(width, height);
        gl.viewport(_compVP[0], _compVP[1], _compVP[2], _compVP[3]);
      }
      usePost(compProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.uniform1i(compU.uScene, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, doBloom ? bloomLv[0].tex : blackTex);
      gl.uniform1i(compU.uBloom, 1);
      gl.uniform1f(compU.uBloomAmt, bloomAmt * 1.25 / Math.max(useLv - 1, 1));
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, haveAO ? ssaoTex : whiteTex);
      gl.uniform1i(compU.uSSAO, 2);
      gl.uniform2f(compU.uAOTexel, haveAO ? 1 / halfPx(allocW) : 0, haveAO ? 1 / halfPx(allocH) : 0);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, haveGR ? godrayTex : blackTex);
      gl.uniform1i(compU.uGodray, 3);
      uf1(compU.uHaveGodray, "haveGodray", haveGR ? 1 : 0);
      _sunUV[0] = sun.visible ? sun.ndcx * 0.5 + 0.5 : -2;
      _sunUV[1] = sun.visible ? sun.ndcy * 0.5 + 0.5 : -2;
      const flareStr = sun.flare * swFlareK, sunShaft = sun.shaft;
      gl.uniform2fv(compU.uSunUV, _sunUV);
      gl.uniform1f(compU.uFlareStr, flareStr * flareMul);
      const exposure = opts && opts.exposure !== undefined ? opts.exposure : 1.0;
      gl.uniform1f(compU.uExposure, exposure * swExposureK);
      gl.uniform1f(compU.uSunShaft, doBloom ? sunShaft * (PostCommon.knob(opts && opts.tune, "sunShaftMul")) : 0);
      const grade = opts && opts.grade;
      const gSh = grade && grade.shadow ? grade.shadow : _ONE3;
      const gHi = grade && grade.hi ? grade.hi : _ONE3;
      uf3(compU.uGradeShadow, "gradeShadow", gSh[0], gSh[1], gSh[2]);
      uf3(compU.uGradeHi, "gradeHi", gHi[0], gHi[1], gHi[2]);
      uf1(compU.uGradeStr, "gradeStr", grade && grade.str !== undefined ? grade.str : 0);
      const CT = opts && opts.tune || null;
      uf4(compU.uTone0, "tone0",
        PostCommon.knob(CT, "blacks"),
        PostCommon.knob(CT, "shadows"),
        PostCommon.knob(CT, "midtones"),
        PostCommon.knob(CT, "highlights"));
      uf4(compU.uTone1, "tone1",
        PostCommon.knob(CT, "whites"),
        PostCommon.knob(CT, "toe"),
        PostCommon.knob(CT, "shoulder"), 0);
      uf3(compU.uLift, "lift",
        PostCommon.knob(CT, "liftR"),
        PostCommon.knob(CT, "liftG"),
        PostCommon.knob(CT, "liftB"));
      uf3(compU.uGamma, "gamma",
        PostCommon.knob(CT, "gammaR"),
        PostCommon.knob(CT, "gammaG"),
        PostCommon.knob(CT, "gammaB"));
      uf3(compU.uGain, "gain",
        PostCommon.knob(CT, "gainR"),
        PostCommon.knob(CT, "gainG"),
        PostCommon.knob(CT, "gainB"));
      uf1(compU.uContrast,   "contrast",   PostCommon.knob(CT, "contrast"));
      uf1(compU.uVibrance,   "vibrance",   PostCommon.knob(CT, "vibrance"));
      uf1(compU.uSaturation, "saturation", PostCommon.knob(CT, "saturation"));
      const _hg = PostCommon.hdrGradeOn(CT);
      uf1(compU.uHdrGradeOn, "hdrGradeOn", _hg ? 1.0 : 0.0);
      uf1(compU.uTint,       "tint",       PostCommon.knob(CT, "tint"));
      uf1(compU.uVignette,   "vignette",   PostCommon.knob(CT, "vignette"));
      uf1(compU.uVigSoft,    "vigSoft",    PostCommon.knob(CT, "vignetteSoft"));
      uf1(compU.uBloomKnee,  "bloomKnee",  PostCommon.knob(CT, "bloomKnee"));
      gl.uniform1f(compU.uCarReflect, opts && opts.carReflect != null ? opts.carReflect
        : (PostCommon.knob(CT, "carReflect")));
      uf1(compU.uCarGloss, "carGloss", PostCommon.knob(CT, "carGloss"));
      uf1(compU.uChromAb,    "chromAb",    PostCommon.knob(CT, "chromAb"));
      uf1(compU.uGrain,      "grain",      PostCommon.knob(CT, "grain"));
      gl.uniform1f(compU.uGrainTime,  F.time);
      uf1(compU.uSharpen,    "sharpen",    PostCommon.knob(CT, "sharpen"));
      uf1(compU.uBlackLift,  "blackLift",  PostCommon.knob(CT, "blackLift"));
      uf1(compU.uWhitePoint, "whitePoint", PostCommon.knob(CT, "whitePoint"));
      uf1(compU.uAcesA, "acesA", PostCommon.knob(CT, "acesA"));
      uf1(compU.uAcesB, "acesB", PostCommon.knob(CT, "acesB"));
      uf1(compU.uAcesC, "acesC", PostCommon.knob(CT, "acesC"));
      uf1(compU.uAcesD, "acesD", PostCommon.knob(CT, "acesD"));
      uf1(compU.uAcesE, "acesE", PostCommon.knob(CT, "acesE"));
      gl.uniform1f(compU.uSpeedBlur,  opts && opts.speedBlur != null ? opts.speedBlur : 0.0);
      uf1(compU.uShaftDecay, "shaftDecay", PostCommon.knob(CT, "sunShaftDecay"));
      const _shaftMul = PostCommon.knob(opts && opts.tune, "sunShaftMul");
      uf1(compU.uShaftSpread, "shaftSpread", Math.sqrt(Math.max(0.05, _shaftMul)));
      uf1(compU.uFlareStreak, "flareStreak", PostCommon.knob(CT, "flareStreak") * swFlareK);
      uf1(compU.uFlareStreak2, "flareStreak2", PostCommon.knob(CT, "flareStreak2") * swFlareK);
      const hz = opts && opts.haze;
      gl.uniform2f(compU.uHazeUV, hz ? hz.u : -9, hz ? hz.v : -9);
      gl.uniform1f(compU.uHazeStr, hz ? hz.str : 0);
      gl.uniform1f(compU.uHazeTime, F.time);
      uf1(compU.uSsrThick,   "ssrThick",   PostCommon.knob(CT, "ssrThick"));
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, dirtTex || blackTex);
      gl.uniform1i(compU.uDirt, 5);
      uf1(compU.uLensDirt, "lensDirt", PostCommon.knob(CT, "lensDirt"));
      gl.uniform2f(compU.uReflTexel, 1 / width, 1 / height);
      gl.uniform1f(compU.uSsrTopUV, opts && opts.ssrTopUV != null ? opts.ssrTopUV : 0.62);
      gl.uniform1f(compU.uSsrNear,  opts && opts.ssrNear  != null ? opts.ssrNear  : -2.5);
      gl.uniform1f(compU.uSsrQuality, Math.max(0, Math.min(2, (opts && opts.ssrQuality) | 0)));
      const reflStr = (opts && opts.reflect) || 0;
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, sceneDepth);
      gl.uniform1i(compU.uDepth, 4);
      const haveRefl = F.invProj && F.proj && F.upVS;
      if (haveRefl) {
        gl.uniformMatrix4fv(compU.uInvProj, false, F.invProj);
        gl.uniformMatrix4fv(compU.uProj, false, F.proj);
        gl.uniform3fv(compU.uUpVS, F.upVS);
        gl.uniform3fv(compU.uReflSkyHi, F.skyHi || _SKY_HI);
        gl.uniform3fv(compU.uReflSkyLo, F.skyLo || _SKY_LO);
      }
      gl.uniform1f(compU.uSsrOk, haveRefl ? 1 : 0);
      gl.uniform1f(compU.uReflect, haveRefl ? reflStr : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (useFxaa) {
        bindOverwrite(useUpscale ? aaFBO : core.outputFBO());
        if (useUpscale) {
          gl.viewport(0, 0, width, height);
        } else {
          const _fxaaVP = core.outputViewport(width, height);
          gl.viewport(_fxaaVP[0], _fxaaVP[1], _fxaaVP[2], _fxaaVP[3]);
        }
        usePost(fxaaProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, ldrTex);
        gl.uniform1i(fxaaU.uTex, 0);
        gl.uniform2f(fxaaU.uTexel, 1 / allocW, 1 / allocH);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      if (useUpscale) {
        const src = useFxaa ? aaTex : ldrTex;
        const ps = core.getPresentSize();
        bindOverwrite(core.outputFBO());
        const _sgsrVP = core.outputViewport(ps.width, ps.height);
        gl.viewport(_sgsrVP[0], _sgsrVP[1], _sgsrVP[2], _sgsrVP[3]);
        usePost(sgsrProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, src);
        gl.uniform1i(sgsrU.uTex, 0);
        gl.uniform4f(sgsrU.uViewport, 1 / width, 1 / height, width, height);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      bindVAO(null);
      gl.activeTexture(gl.TEXTURE0);
      gl.enable(gl.DEPTH_TEST);

      _softReadFB = null;
      _lastPath = { on: true, fxaa: useFxaa, upscale: useUpscale, toLdr: !!toLdr, bloom: bloomAmt, ao: aoStr,
        readFb: "default" };

      mirrorComposite(opts);

      if (_invFbo) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO);
        gl.invalidateFramebuffer(gl.FRAMEBUFFER, [gl.DEPTH_ATTACHMENT]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, core.outputFBO());
        if (_invDefault && core.outputFBO() === null) gl.invalidateFramebuffer(gl.FRAMEBUFFER, [gl.DEPTH]);
      }

      core.gpuTimerEnd();
    }

    function readbackLdrPixels(buf, w, h, asked) {
      if (!gl || !buf || w < 1 || h < 1) return false;
      try {
        if (!asked && typeof PerfGov !== "undefined" && PerfGov.softwareGlUiReadbackDefer && PerfGov.softwareGlUiReadbackDefer()) return false;
      } catch (_) {  }
      try {
        gl.finish();
        gl.bindFramebuffer(gl.FRAMEBUFFER, _softReadFB);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        return true;
      } catch (_) {
        return false;
      } finally {
        try { gl.bindFramebuffer(gl.FRAMEBUFFER, core.outputFBO()); } catch (_) {  }
      }
    }

    let mirFBO = null, mirTex = null, mirDepthRB = null, mirW = 0, mirH = 0, mirHdr = false;
    let mirDead = false, mirActive = false, mirProg = null, mirU = null, mirRect = null, mirFlip = true;
    const _mirRectScratch = [0, 0, 0, 0];
    let mirRenders = 0, mirComposites = 0, mirGlass = 0, mirAllocs = 0;
    function mirrorMips() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, core.outputFBO());
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, mirTex);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
    }
    function mirrorFree() {
      if (mirFBO) gl.deleteFramebuffer(mirFBO);
      if (mirDepthRB) gl.deleteRenderbuffer(mirDepthRB);
      if (mirTex) gl.deleteTexture(mirTex);
      mirFBO = mirDepthRB = mirTex = null; mirW = mirH = 0; mirRenders = 0;
    }
    function mirrorTarget(w, h) {
      if (mirDead) return false;
      const hdr = postEnabled && colorType === gl.HALF_FLOAT;
      if (mirFBO && w === mirW && h === mirH && hdr === mirHdr) return true;
      mirrorFree();
      mirTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, mirTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, hdr ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA,
        hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, null);
      mirDepthRB = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, mirDepthRB);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.bindRenderbuffer(gl.RENDERBUFFER, null);
      mirFBO = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, mirFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, mirTex, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, mirDepthRB);
      const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); 
      if (st !== gl.FRAMEBUFFER_COMPLETE) {
        Log.warn("gfx", "GLX mirror framebuffer incomplete (0x" + st.toString(16) + ") — mirror off");
        mirrorFree(); mirDead = true;
        return false;
      }
      mirW = w; mirH = h; mirHdr = hdr; mirAllocs++;
      return true;
    }
    function bindMirrorTarget() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, mirFBO);
      gl.viewport(0, 0, mirW, mirH);
    }
    const _MIR_GRADE_KNOBS = [["uContrast", "contrast"], ["uVibrance", "vibrance"], ["uSaturation", "saturation"],
      ["uTint", "tint"], ["uBlackLift", "blackLift"]];
    function mirrorComposite(opts) {
      if (!mirRect || !mirTex || !mirRenders || mirDead) return;
      if (!mirProg) {
        mirProg = link(POST_VS, MIRROR_FS);
        if (!mirProg) { mirDead = true; Log.warn("gfx", "GLX mirror program failed — mirror off"); return; }
        mirU = locs(mirProg, ["uTex", "uHdr", "uExposure", "uWhitePoint", "uAcesA", "uAcesB", "uAcesC", "uAcesD", "uAcesE", "uFlip",
          "uGradeShadow", "uGradeHi", "uGradeStr", "uContrast", "uVibrance", "uSaturation", "uTint", "uBlackLift", "uGrainTime"]);
      }
      const cw = gl.drawingBufferWidth, ch = gl.drawingBufferHeight;
      const ov = core.outputViewport(cw, ch);
      const ox = ov[0], oy = ov[1], ow = ov[2], oh = ov[3];
      const x = ox + Math.round(mirRect[0] * ow), w = Math.round(mirRect[2] * ow);
      const h = Math.round(mirRect[3] * oh), y = oy + oh - Math.round(mirRect[1] * oh) - h;
      if (w < 2 || h < 2) return;
      const CT = opts && opts.tune;
      gl.bindFramebuffer(gl.FRAMEBUFFER, core.outputFBO());
      gl.viewport(x, y, w, h);
      gl.disable(gl.DEPTH_TEST);
      setBlend(false);
      usePost(mirProg, true);
      bindVAO(core.skyVAO);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, mirTex);
      gl.uniform1i(mirU.uTex, 0);
      gl.uniform1f(mirU.uHdr, mirHdr ? 1 : 0);
      gl.uniform1f(mirU.uExposure, opts && opts.exposure !== undefined ? opts.exposure : 1.0);
      gl.uniform1f(mirU.uWhitePoint, PostCommon.knob(CT, "whitePoint"));
      gl.uniform1f(mirU.uAcesA, PostCommon.knob(CT, "acesA"));
      gl.uniform1f(mirU.uAcesB, PostCommon.knob(CT, "acesB"));
      gl.uniform1f(mirU.uAcesC, PostCommon.knob(CT, "acesC"));
      gl.uniform1f(mirU.uAcesD, PostCommon.knob(CT, "acesD"));
      gl.uniform1f(mirU.uAcesE, PostCommon.knob(CT, "acesE"));
      gl.uniform1f(mirU.uFlip, mirFlip ? 1 : 0);
      const grade = opts && opts.grade;
      const gSh = grade && grade.shadow ? grade.shadow : _ONE3, gHi = grade && grade.hi ? grade.hi : _ONE3;
      gl.uniform3f(mirU.uGradeShadow, gSh[0], gSh[1], gSh[2]);
      gl.uniform3f(mirU.uGradeHi, gHi[0], gHi[1], gHi[2]);
      gl.uniform1f(mirU.uGradeStr, grade && grade.str !== undefined ? grade.str : 0);
      for (const k of _MIR_GRADE_KNOBS) gl.uniform1f(mirU[k[0]], PostCommon.knob(CT, k[1]));
      gl.uniform1f(mirU.uGrainTime, F.time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      bindVAO(null);
      gl.enable(gl.DEPTH_TEST);
      gl.viewport(ov[0], ov[1], ov[2], ov[3]);
      mirComposites++;
    }
    let glassProg = null, glassU = null, glassFailed = false;
    function mirrorGlass(mesh, model) {
      if (mirActive || mirDead || !mirTex || !mirRenders || !mirFlip || !mesh || !mesh.vao || !mesh.count || !model || core.ctxGone()) return false;
      if (!glassProg) {
        if (glassFailed) return false;
        glassProg = link(DECAL_VS, MIRROR_GLASS_FS);
        if (!glassProg) { glassFailed = true; Log.warn("gfx", "GLX mirror glass program failed — fallback glass"); return false; }
        glassU = locs(glassProg, ["uModel", "uViewProj", "uTex"]);
      }
      useProg(glassProg);
      gl.uniformMatrix4fv(glassU.uModel, false, model);
      gl.uniformMatrix4fv(glassU.uViewProj, false, F.viewProj);
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, mirTex);
      gl.uniform1i(glassU.uTex, 5);
      gl.activeTexture(gl.TEXTURE0);
      setBlend(false);
      setDepthMask(true);
      setCull(false);
      gl.colorMask(true, true, true, true);
      bindVAO(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
      setCull(true);
      mirGlass++;
      return true;
    }
    const mirror = {
      begin(w, h) { if (!mirrorTarget(w, h)) return false; mirActive = true; return true; },
      end() { if (!mirActive) return; mirActive = false; mirRenders++; mirrorMips(); },
      abort() { mirActive = false; },
      release() { if (mirActive) return false; mirrorFree(); return true; },
      active: () => mirActive,
      bindTarget: bindMirrorTarget,
      rect(r, flip) { mirRect = r && r.length === 4 ? _mirRectScratch : null; if (mirRect) for (let i = 0; i < 4; i++) mirRect[i] = +r[i] || 0; mirFlip = flip !== false; },
      composite: mirrorComposite,
      glass: mirrorGlass,
      state: () => ({ ready: !!mirTex && mirRenders > 0, dead: mirDead, w: mirW, h: mirH, hdr: mirHdr,
        renders: mirRenders, allocs: mirAllocs, composites: mirComposites, glass: mirGlass, rect: mirRect ? mirRect.slice() : null, flip: mirFlip }),
    };

    function invalidateUniformCache() {
      for (const k in _compUf) delete _compUf[k];
    }

    postEnabled = setup();
    Log.info("gfx", "GLX post init on=" + (postEnabled ? 1 : 0));

    return {
      enabled: () => postEnabled,
      hdrOk: () => postEnabled && colorType === gl.HALF_FLOAT,
      msaa: () => msaaSamples,
      ensureSpatial,
      spatialOk: () => !!sgsrProg && postEnabled,
      createTargets,
      bindSceneTarget,
      present,
      readbackLdrPixels,
      invalidateUniformCache,
      postPath: () => _lastPath,
      mirror,
    };
  }

  return { init };
})();
Object.freeze(GLXPost);
