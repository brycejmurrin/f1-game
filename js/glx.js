/*
 * Apex 26 — WebGL2 renderer.
 * One standard lit shader (hemisphere ambient + lambert sun + exp2 fog),
 * a sky shader (fullscreen triangle via gl_VertexID) and a blob-shadow quad.
 */
"use strict";

const GLX = (function () {
  const {
    LIT_VS, LIT_FS, SKY_VS, SKY_FS, SHADOW_VS, SHADOW_FS, MARK_FS,
    GLOW_VS, GLOW_FS, POST_VS, BRIGHT_FS, BLUR_FS, DOWN_FS, UP_FS,
    SSAO_FS, GODRAY_FS, COMPOSITE_FS, FXAA_FS, DEPTH_VS, DEPTH_FS,
  } = GLXShaders;
  let gl = null;
  let canvas = null;
  let litProg = null, litU = null;
  // Scratch vec3s for the tuner's ambient multiplier (no per-frame allocation).
  const _ambScratchG = [0, 0, 0], _ambScratchS = [0, 0, 0];
  let skyProg = null, skyU = null;
  let shadowProg = null, shadowU = null;
  let markProg = null, markU = null;
  let glowProg = null, glowU = null, glowVAO = null, glowVBO = null;
  let glowData = null;   // CPU-side dynamic vertex buffer for light-glow billboards
  let skyVAO = null;     // empty VAO (WebGL2 still needs one bound)
  let shadowVAO = null;
  let width = 0, height = 0, aspect = 1;
  let frameViewProj = null;
  let frameSunDir = null;
  let frameEye = null;
  let frameLights = null;
  let frameGroundMist = 0;
  const _grPos = new Float32Array(36), _grCol = new Float32Array(36),
        _grRad = new Float32Array(12), _grDir = new Float32Array(36),
        _grCone = new Float32Array(24), _grVolW = new Float32Array(12), _grSel = [];
  let frameInvProj = null;
  let frameInvVP = null;
  let frameProj = null;
  let frameSunVS = null;
  let frameUpVS = null;
  let frameSkyHi = null;
  let frameSkyLo = null;
  let frameSunColor = null;
  let frameTime = 0, frameCloud = 0;
  let ssaoProg = null, ssaoU = null, ssaoFBO = null, ssaoTex = null;
  let ssaoBlurFBO = null, ssaoBlurTex = null, whiteTex = null, blackTex = null;
  let godrayProg = null, godrayU = null, godrayFBO = null, godrayTex = null;
  let godrayBlurFBO = null, godrayBlurTex = null;
  let godrayW = 0, godrayH = 0;
  let ssaoW = 0, ssaoH = 0;   // SSAO runs at half res (upscaled in composite)
  let fxaaProg = null, fxaaU = null, ldrFBO = null, ldrTex = null;   // FXAA pass + its LDR input

  let depthProg = null, depthU = null;
  let shadowMapFBO = null, shadowMapTex = null;
  let shadowLightVP = new Float32Array(16);
  const SHADOW_SIZE = 2048;
  let shadowEnabled = false;

  // Post-processing state. postEnabled stays false (and rendering goes straight
  // to the default framebuffer, exactly as before) if any target/program setup
  // fails, so the game always renders.
  let postEnabled = false;
  let brightProg = null, brightU = null;
  let blurProg = null, blurU = null;
  let downProg = null, downU = null, upProg = null, upU = null;
  let compProg = null, compU = null;
  let sceneFBO = null, sceneTex = null, sceneDepth = null;
  let colorType = null;        // HALF_FLOAT if renderable, else UNSIGNED_BYTE
  // Mip-chain bloom: progressive downsample levels (half res, /4, /8, …), then
  // additive tent upsample back to level 0 — wide multi-octave glow.
  const BLOOM_DIV = 2;         // level 0 at half resolution
  const BLOOM_LEVELS_MAX = 5;
  let bloomLv = [];            // [{fbo, tex, w, h}] — rebuilt on resize
  // MSAA scene target: the geometry passes render into multisampled renderbuffers,
  // resolved (blitFramebuffer) into sceneTex/sceneDepth before post — real edge AA
  // on the HDR path, with FXAA left to clean up what the resolve misses.
  let msaaSamples = 0;         // 0/1 = off (render straight into sceneFBO)
  let msFBO = null, msColorRB = null, msDepthRB = null;

  // Material uniform cache — skip redundant per-draw scalar uploads.
  let _matEmissive = -1, _matAlpha = -1, _matRough = -1, _matMetal = -1, _matSpec = -1, _matDetail = -1, _matCC = -1, _matCP = -1;

  // Active-program cache — gl.useProgram is a pipeline-flushing state change, so
  // skip it when the requested program is already bound. Route every bind here.
  let _activeProg = null;
  function useProg(p) { if (p !== _activeProg) { gl.useProgram(p); _activeProg = p; } }

  // Per-frame view-projection upload cache for the blob-shadow / skid-mark
  // programs. uViewProj never changes within a frame, but drawShadow/drawMark are
  // called dozens of times per frame (one per skid stamp / car shadow), each
  // re-uploading the same 16-float matrix. Track which program last received the
  // frame's matrix so the upload happens at most once per program per frame.
  let _frameToken = 0;
  let _shadowVPToken = -1, _markVPToken = -1;

  // VAO bind cache — drawElements requires the right VAO, but consecutive draws
  // of the same mesh (or repeated skid/shadow quads sharing shadowVAO) would
  // otherwise rebind redundantly. Binding null after every draw also forces a
  // rebind on the next; instead leave the last VAO bound and skip no-op binds.
  let _activeVAO = null;
  function bindVAO(v) { if (v !== _activeVAO) { gl.bindVertexArray(v); _activeVAO = v; } }

  // Render-state cache — enable/disable(BLEND) and depthMask are pipeline state
  // changes. Many consecutive draws share the same state (e.g. dozens of skid
  // marks and car shadows per frame), so collapse redundant toggles into no-ops.
  // begin() resyncs these to GL defaults each frame; present() restores them.
  let _blendOn = false, _depthWrite = true;
  function setBlend(on) {
    if (on !== _blendOn) { if (on) gl.enable(gl.BLEND); else gl.disable(gl.BLEND); _blendOn = on; }
  }
  function setDepthMask(on) {
    if (on !== _depthWrite) { gl.depthMask(on); _depthWrite = on; }
  }

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error("GLX shader compile failed:\n" + gl.getShaderInfoLog(sh) + "\n" + src);
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function link(vsSrc, fsSrc) {
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("GLX program link failed: " + gl.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  }

  function locs(prog, names) {
    const u = {};
    for (const n of names) u[n] = gl.getUniformLocation(prog, n);
    return u;
  }

  // Build the post-processing programs + pick a colour format. Returns true if
  // the whole chain is usable; on any failure the caller leaves post disabled.
  function initPost() {
    // RGBA16F is the ideal HDR target (preserves sun/specular > 1 for bloom);
    // fall back to 8-bit if float colour buffers aren't renderable.
    const ext = gl.getExtension("EXT_color_buffer_float");
    colorType = ext ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

    brightProg = link(POST_VS, BRIGHT_FS);
    blurProg = link(POST_VS, BLUR_FS);
    downProg = link(POST_VS, DOWN_FS);
    upProg = link(POST_VS, UP_FS);
    compProg = link(POST_VS, COMPOSITE_FS);
    ssaoProg = link(POST_VS, SSAO_FS);
    godrayProg = link(POST_VS, GODRAY_FS);
    fxaaProg = link(POST_VS, FXAA_FS);
    if (fxaaProg) fxaaU = locs(fxaaProg, ["uTex", "uTexel"]);
    if (!brightProg || !blurProg || !compProg || !downProg || !upProg) return false;
    brightU = locs(brightProg, ["uScene", "uThreshold"]);
    blurU = locs(blurProg, ["uTex", "uDir"]);
    downU = locs(downProg, ["uTex", "uTexel"]);
    upU = locs(upProg, ["uTex", "uTexel"]);
    // MSAA: pick the sample count the HDR colour format actually supports (many
    // mobile GPUs render RGBA16F but not multisampled RGBA16F — query, don't assume).
    try {
      const fmt = colorType === gl.HALF_FLOAT ? gl.RGBA16F : gl.RGBA8;
      const cs = gl.getInternalformatParameter(gl.RENDERBUFFER, fmt, gl.SAMPLES);
      const ds = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, gl.SAMPLES);
      const cMax = cs && cs.length ? cs[0] : 0;
      const dMax = ds && ds.length ? ds[0] : 0;
      // 2× (was 4×): halves the multisample colour+depth store and the resolve
      // blit bandwidth. FXAA (full-res, below) cleans up the specular/edge
      // shimmer the lower sample count misses, so the perceptual gap is small.
      msaaSamples = Math.min(2, cMax, dMax);
      if (msaaSamples < 2) msaaSamples = 0;
    } catch (e) { msaaSamples = 0; }
    compU = locs(compProg, ["uScene", "uBloom", "uSSAO", "uGodray", "uBloomAmt", "uSunUV", "uFlareStr", "uExposure", "uSunShaft", "uGradeShadow", "uGradeHi", "uGradeStr", "uContrast", "uVibrance", "uSaturation", "uTint", "uVignette", "uCarReflect", "uDepth", "uInvProj", "uProj", "uUpVS", "uReflTexel", "uReflect", "uReflSkyHi", "uReflSkyLo"]);
    if (ssaoProg) ssaoU = locs(ssaoProg, ["uDepth", "uInvProj", "uProj", "uSunVS", "uTexel", "uStrength", "uContact"]);
    if (godrayProg) godrayU = locs(godrayProg, ["uDepth", "uShadowMap", "uInvVP", "uLightVP", "uEye", "uSunDir", "uSunColor", "uStr", "uTime", "uCloudCover", "uNumLights", "uLightPos[0]", "uLightCol[0]", "uLightRad[0]", "uLightDir[0]", "uLightCone[0]", "uLightVolW[0]", "uMist", "uLampStr"]);
    // 1×1 white texture: the "AO off" fallback so the composite multiply is a no-op.
    whiteTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, whiteTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    // 1×1 black texture: the "god-ray off" fallback so the additive term is a no-op.
    blackTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, blackTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return true;
  }

  // (Re)allocate the scene + bloom render targets at the current size.
  function createTargets() {
    if (!postEnabled) return;
    const internal = colorType === gl.HALF_FLOAT ? gl.RGBA16F : gl.RGBA8;
    const mk = (w, h) => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, colorType, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    };
    // scene target (full res) + depth as a SAMPLEABLE texture (enables SSAO and
    // any depth-aware post; same pattern already used for the shadow map).
    if (sceneTex) gl.deleteTexture(sceneTex);
    if (sceneDepth) gl.deleteTexture(sceneDepth);
    if (!sceneFBO) sceneFBO = gl.createFramebuffer();
    sceneTex = mk(width, height);
    sceneDepth = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, sceneDepth);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, width, height, 0,
      gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, sceneDepth, 0);
    // MSAA scene target: multisampled colour + depth renderbuffers, resolved into
    // sceneTex/sceneDepth at present(). Falls back silently (msaaSamples = 0) if
    // the combo doesn't yield a complete FBO on this driver.
    if (msaaSamples > 1) {
      const internalD = gl.DEPTH_COMPONENT24;
      if (msColorRB) gl.deleteRenderbuffer(msColorRB);
      if (msDepthRB) gl.deleteRenderbuffer(msDepthRB);
      if (!msFBO) msFBO = gl.createFramebuffer();
      msColorRB = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, msColorRB);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msaaSamples, internal, width, height);
      msDepthRB = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, msDepthRB);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msaaSamples, internalD, width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, msFBO);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, msColorRB);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, msDepthRB);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) msaaSamples = 0;
    }
    // bloom mip chain (half res, /4, /8, … — stop once a level gets tiny)
    for (const lv of bloomLv) { if (lv.tex) gl.deleteTexture(lv.tex); if (lv.fbo) gl.deleteFramebuffer(lv.fbo); }
    bloomLv = [];
    let bw = Math.max(1, Math.floor(width / BLOOM_DIV));
    let bh = Math.max(1, Math.floor(height / BLOOM_DIV));
    for (let i = 0; i < BLOOM_LEVELS_MAX && bw >= 8 && bh >= 8; i++) {
      const tex = mk(bw, bh);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      bloomLv.push({ fbo, tex, w: bw, h: bh });
      bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
    }
    // SSAO targets (HALF res): raw AO + a blurred copy to denoise the 12-tap pass.
    // AO is low-frequency, so half-res + LINEAR upscale in the composite is ~75%
    // cheaper with no visible loss (depth is still sampled at full res per tap).
    if (ssaoProg) {
      ssaoW = Math.max(1, Math.floor(width / 2));
      ssaoH = Math.max(1, Math.floor(height / 2));
      if (ssaoTex) gl.deleteTexture(ssaoTex);
      if (ssaoBlurTex) gl.deleteTexture(ssaoBlurTex);
      if (!ssaoFBO) ssaoFBO = gl.createFramebuffer();
      if (!ssaoBlurFBO) ssaoBlurFBO = gl.createFramebuffer();
      ssaoTex = mk(ssaoW, ssaoH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, ssaoFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ssaoTex, 0);
      ssaoBlurTex = mk(ssaoW, ssaoH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, ssaoBlurFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ssaoBlurTex, 0);
    }
    // God-ray targets (half res): raw shafts + a blurred copy to soften the march.
    if (godrayProg) {
      godrayW = Math.max(1, Math.floor(width / 2));
      godrayH = Math.max(1, Math.floor(height / 2));
      if (godrayTex) gl.deleteTexture(godrayTex);
      if (godrayBlurTex) gl.deleteTexture(godrayBlurTex);
      if (!godrayFBO) godrayFBO = gl.createFramebuffer();
      if (!godrayBlurFBO) godrayBlurFBO = gl.createFramebuffer();
      godrayTex = mk(godrayW, godrayH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, godrayFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, godrayTex, 0);
      godrayBlurTex = mk(godrayW, godrayH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, godrayBlurFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, godrayBlurTex, 0);
    }
    // LDR target (full res, RGBA8): the composite renders here so the FXAA pass
    // can edge-detect on the final tonemapped image, then resolve to the screen.
    if (fxaaProg) {
      if (ldrTex) gl.deleteTexture(ldrTex);
      if (!ldrFBO) ldrFBO = gl.createFramebuffer();
      ldrTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, ldrTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, ldrFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ldrTex, 0);
    }
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      postEnabled = false;     // unsupported combo: fall back to direct rendering
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // Min-of-4 downsample of the shadow depth map (conservative nearest-blocker
  // per cell) - the PCSS-lite blocker-search source.
  const BLOCKER_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uDepthTex;
out vec4 o;
void main() {
  vec2 t = vec2(1.0 / 512.0);
  float d0 = texture(uDepthTex, vUV + t * vec2(-0.25, -0.25)).r;
  float d1 = texture(uDepthTex, vUV + t * vec2( 0.25, -0.25)).r;
  float d2 = texture(uDepthTex, vUV + t * vec2(-0.25,  0.25)).r;
  float d3 = texture(uDepthTex, vUV + t * vec2( 0.25,  0.25)).r;
  o = vec4(min(min(d0, d1), min(d2, d3)), 0.0, 0.0, 1.0);
}`;
  let blockerProg = null, blockerU = null, blockerTex = null, blockerFBO = null,
      blockerSampler = null, pcssEnabled = false;

  function initShadowMap() {
    depthProg = link(DEPTH_VS, DEPTH_FS);
    if (!depthProg) return false;
    depthU = locs(depthProg, ["uModel", "uLightVP"]);

    shadowMapTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, shadowMapTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SHADOW_SIZE, SHADOW_SIZE, 0,
      gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    // LINEAR + COMPARE_REF_TO_TEXTURE = guaranteed hardware 2x2 PCF per tap in
    // ES 3.0 (was NEAREST: every Poisson tap was a single hard compare).
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);

    shadowMapFBO = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowMapFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowMapTex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // ── PCSS-lite blocker map: a 512-square R16F min-depth downsample of the
    // shadow map, rebuilt only when the shadow map re-renders (the snap-grid
    // cache means once per ~10 m of travel, not per frame). LIT_FS samples it
    // as a plain sampler2D for the blocker search; the depth texture itself
    // stays a sampler2DShadow. A compare-off SAMPLER OBJECT lets the blocker
    // pass read the same depth texture without compare mode - the legal WebGL2
    // way to view a depth texture two different ways.
    pcssEnabled = false;
    if (ok) {
      blockerProg = link(POST_VS, BLOCKER_FS);
      if (blockerProg) {
        blockerU = locs(blockerProg, ["uDepthTex"]);
        blockerTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, blockerTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, 512, 512, 0, gl.RED, gl.HALF_FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        blockerFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, blockerFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, blockerTex, 0);
        pcssEnabled = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        if (pcssEnabled) {
          blockerSampler = gl.createSampler();
          gl.samplerParameteri(blockerSampler, gl.TEXTURE_COMPARE_MODE, gl.NONE);
          gl.samplerParameteri(blockerSampler, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.samplerParameteri(blockerSampler, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        }
      }
    }
    return ok;
  }

  function init(canvasEl) {
    canvas = canvasEl;
    gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    if (!gl) return false;

    litProg = link(LIT_VS, LIT_FS);
    skyProg = link(SKY_VS, SKY_FS);
    shadowProg = link(SHADOW_VS, SHADOW_FS);
    markProg = link(SHADOW_VS, MARK_FS);
    glowProg = link(GLOW_VS, GLOW_FS);
    if (!litProg || !skyProg || !shadowProg || !markProg) return false;

    postEnabled = initPost();   // best-effort; false -> render straight to screen
    shadowEnabled = initShadowMap();

    litU = locs(litProg, ["uModel", "uViewProj", "uEye", "uSunDir", "uSunColor",
      "uAmbGround", "uAmbSky", "uFogColor", "uFogDensity", "uEmissive", "uAlpha",
      "uRoughness", "uMetalness", "uSpecular", "uDetail", "uClearcoat", "uCarPaint", "uWetness",
      "uShadowMap", "uLightVP", "uShadowBias", "uShadowStr", "uShadowTexel",
      "uSkyZenith", "uSkyHorizon", "uFogHeight", "uGroundMist", "uLampFog", "uBlockerMap", "uPcss", "uTime", "uCloudCover",
      "uBounceK", "uMistShare", "uLampFogClip", "uGlowAmp", "uPcssPen", "uKeyMul",
      "uNumLights", "uLightPos[0]", "uLightCol[0]", "uLightRad[0]", "uLightDir[0]", "uLightCone[0]", "uLightBleed[0]"]);
    skyU = locs(skyProg, ["uInvViewProj", "uZenith", "uHorizon", "uSunDir", "uSunColor", "uStars", "uCloud", "uTime", "uMoon", "uCityGlow"]);
    shadowU = locs(shadowProg, ["uModel", "uViewProj", "uSize"]);
    markU = locs(markProg, ["uModel", "uViewProj", "uSize"]);
    if (glowProg) {
      glowU = locs(glowProg, ["uViewProj", "uEye", "uStr"]);
      // Dynamic interleaved buffer: [cornerX, cornerY, cx, cy, cz, r, g, b, radius] ×6 verts/lamp.
      glowVAO = gl.createVertexArray();
      gl.bindVertexArray(glowVAO);
      glowVBO = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, glowVBO);
      const st = 9 * 4;   // 9 floats per vertex
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, st, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, st, 8);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, st, 20);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, st, 32);
      gl.bindVertexArray(null);
    }

    skyVAO = gl.createVertexArray();

    // Cached unit quad for blob shadows (xz plane, CCW seen from +Y).
    shadowVAO = gl.createVertexArray();
    gl.bindVertexArray(shadowVAO);
    const qv = new Float32Array([-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5]);
    const qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, qv, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const qi = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, qi);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    resize();
    return true;
  }

  // Adaptive render scale: the whole 3D pipeline (scene + every post FBO) sizes
  // off width/height, and the canvas CSS size is fixed — so scaling the backing
  // store down and letting the browser upscale is a single knob that trades
  // sharpness for fill-rate. The HUD is a DOM overlay, so only the 3D view
  // softens. setRenderScale() drives it from the frame-time governor in game.js.
  let renderScale = 1;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr * renderScale));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr * renderScale));
    const changed = canvas.width !== w || canvas.height !== h;
    if (changed) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    const first = width === 0;
    width = w;
    height = h;
    aspect = w / h;
    if (changed || first) createTargets();   // (re)allocate HDR + bloom targets
  }
  function setRenderScale(s) {
    s = Math.max(0.5, Math.min(1, s));
    if (Math.abs(s - renderScale) < 0.02) return false;
    renderScale = s;
    resize();
    return true;
  }
  function getRenderScale() { return renderScale; }

  function toF32(a) {
    return a instanceof Float32Array ? a : new Float32Array(a);
  }

  function createMesh(data) {
    const pos = toF32(data.pos);
    const nrm = toF32(data.nrm);
    const col = toF32(data.col);
    let idx = data.idx;
    const vCount = pos.length / 3;
    const big = vCount > 65535;
    if (idx instanceof Uint16Array || idx instanceof Uint32Array) {
      if (big && idx instanceof Uint16Array) idx = new Uint32Array(idx);
    } else {
      idx = big ? new Uint32Array(idx) : new Uint16Array(idx);
    }

    // Interleaved: [x,y,z, nx,ny,nz, r,g,b] per vertex — one buffer, stride=36.
    // Better GPU cache locality vs 3 separate VBOs.
    const interleaved = new Float32Array(vCount * 9);
    for (let i = 0; i < vCount; i++) {
      interleaved[i*9  ] = pos[i*3  ]; interleaved[i*9+1] = pos[i*3+1]; interleaved[i*9+2] = pos[i*3+2];
      interleaved[i*9+3] = nrm[i*3  ]; interleaved[i*9+4] = nrm[i*3+1]; interleaved[i*9+5] = nrm[i*3+2];
      interleaved[i*9+6] = col[i*3  ]; interleaved[i*9+7] = col[i*3+1]; interleaved[i*9+8] = col[i*3+2];
    }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
    const stride = 36;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride,  0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    _activeVAO = null;   // keep the bind cache in sync with the direct bind above

    return { vao, vbo, ib, count: idx.length, indexType: idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
  }

  function begin(frame) {
    frameViewProj = frame.viewProj;
    frameSunDir = frame.sunDir;
    frameSunColor = frame.sunColor;
    frameEye = frame.eye;
    frameInvProj = frame.invProj || null;
    frameInvVP = frame.invViewProj || null;
    frameProj = frame.proj || null;
    frameSunVS = frame.sunViewDir || null;
    frameUpVS = frame.upViewDir || null;
    frameSkyHi = frame.skyHorizon || [0.05, 0.06, 0.09];
    frameSkyLo = frame.skyZenith || [0.02, 0.025, 0.05];
    frameTime = frame.time != null ? frame.time : 0;
    frameCloud = frame.cloud != null ? frame.cloud : 0;
    frameLights = frame.lights || null;
    frameGroundMist = frame.groundMist != null ? frame.groundMist : 0;
    _frameToken++;   // invalidate per-frame uViewProj upload caches
    // Render the scene into the HDR offscreen target when post is enabled, else
    // straight to the default framebuffer. With MSAA the geometry goes into the
    // multisampled renderbuffer, resolved into sceneTex/sceneDepth at present().
    if (postEnabled) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, msaaSamples > 1 ? msFBO : sceneFBO);
      gl.viewport(0, 0, width, height);
    }
    // Resync cached render state to GL defaults — depthMask must be on for the
    // depth buffer to clear, and blend off is the opaque-pass default.
    gl.disable(gl.BLEND); _blendOn = false;
    gl.depthMask(true); _depthWrite = true;
    const fc = frame.fogColor;
    gl.clearColor(fc[0], fc[1], fc[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    useProg(litProg);
    gl.uniformMatrix4fv(litU.uViewProj, false, frame.viewProj);
    gl.uniform3fv(litU.uEye, frame.eye);
    gl.uniform3fv(litU.uSunDir, frame.sunDir);
    gl.uniform3fv(litU.uSunColor, frame.sunColor);
    // Live tunables (LIGHTING TUNER / __apex.lightTune) ride in on frame.tune;
    // defaults here MUST mirror game.js TUNE_DEFS so a missing tune object
    // (unit harnesses driving GLX directly) renders the shipped look.
    const T = frame.tune || null;
    const _ambM = T && T.ambientMul != null ? T.ambientMul : 1;
    if (_ambM !== 1) {
      const g = frame.ambientGround, s = frame.ambientSky;
      _ambScratchG[0] = g[0] * _ambM; _ambScratchG[1] = g[1] * _ambM; _ambScratchG[2] = g[2] * _ambM;
      _ambScratchS[0] = s[0] * _ambM; _ambScratchS[1] = s[1] * _ambM; _ambScratchS[2] = s[2] * _ambM;
      gl.uniform3fv(litU.uAmbGround, _ambScratchG);
      gl.uniform3fv(litU.uAmbSky, _ambScratchS);
    } else {
      gl.uniform3fv(litU.uAmbGround, frame.ambientGround);
      gl.uniform3fv(litU.uAmbSky, frame.ambientSky);
    }
    gl.uniform1f(litU.uBounceK,     T && T.bounceK     != null ? T.bounceK     : 0.04);
    gl.uniform1f(litU.uMistShare,   T && T.mistShare   != null ? T.mistShare   : 1.5);
    gl.uniform1f(litU.uLampFogClip, T && T.fogClip     != null ? T.fogClip     : 0.7);
    gl.uniform1f(litU.uGlowAmp,     T && T.glowAmp     != null ? T.glowAmp     : 2.3);
    gl.uniform1f(litU.uPcssPen,     T && T.pcssPen     != null ? T.pcssPen     : 80.0);
    gl.uniform1f(litU.uKeyMul,      T && T.keyMul      != null ? T.keyMul      : 1.0);
    gl.uniform3fv(litU.uFogColor, frame.fogColor);
    gl.uniform1f(litU.uFogDensity, frame.fogDensity);
    if (shadowEnabled) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, shadowMapTex);
      gl.uniform1i(litU.uShadowMap, 0);
      if (pcssEnabled) {
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, blockerTex);
        gl.uniform1i(litU.uBlockerMap, 7);
        gl.activeTexture(gl.TEXTURE0);
      }
      gl.uniform1f(litU.uPcss, pcssEnabled ? 1.0 : 0.0);
      gl.uniformMatrix4fv(litU.uLightVP, false, shadowLightVP);
      gl.uniform1f(litU.uShadowBias, 0.001);
      gl.uniform1f(litU.uShadowStr, 1.0);
      gl.uniform1f(litU.uShadowTexel, 1.0 / SHADOW_SIZE);
    } else {
      gl.uniform1f(litU.uShadowStr, 0.0);
    }
    gl.uniform3fv(litU.uSkyZenith,  frame.skyZenith  || [0.18, 0.40, 0.78]);
    gl.uniform3fv(litU.uSkyHorizon, frame.skyHorizon || [0.62, 0.74, 0.88]);
    gl.uniform1f(litU.uFogHeight,   frame.fogHeight  != null ? frame.fogHeight : 0.0);
    gl.uniform1f(litU.uGroundMist,  frame.groundMist != null ? frame.groundMist : 0.0);
    gl.uniform1f(litU.uLampFog,     frame.lampFog != null ? frame.lampFog : 0.0);
    gl.uniform1f(litU.uTime,        frame.time  != null ? frame.time  : 0.0);
    gl.uniform1f(litU.uCloudCover,  frame.cloud != null ? frame.cloud : 0.0);
    gl.uniform1f(litU.uWetness,     frame.wetness != null ? frame.wetness : 0.0);
    // Point lights (floodlights / street lights). frame.lights is a flat array
    // of at most MAX_LIGHTS (32) entries, already culled to the nearest set by
    // the caller. Uploaded once per frame; uNumLights=0 on day.
    {
      const L = frame.lights;
      // Flat stride-15: [x,y,z, r,g,b, rad, dirX,dirY,dirZ, cosInner, cosOuter,
      // bleed, volW, glareW]. volW is consumed by the godray pass only; glareW
      // (lens-glare halo weight) by drawGlow only.
      const nL = L ? Math.min(32, (L.length / 15) | 0) : 0;
      gl.uniform1i(litU.uNumLights, nL);
      if (nL > 0) {
        const pos = new Float32Array(nL * 3), col = new Float32Array(nL * 3),
              rad = new Float32Array(nL), dir = new Float32Array(nL * 3),
              cone = new Float32Array(nL * 2), bleed = new Float32Array(nL);
        for (let i = 0; i < nL; i++) {
          const o = i * 15;
          pos[i * 3] = L[o]; pos[i * 3 + 1] = L[o + 1]; pos[i * 3 + 2] = L[o + 2];
          col[i * 3] = L[o + 3]; col[i * 3 + 1] = L[o + 4]; col[i * 3 + 2] = L[o + 5];
          rad[i] = L[o + 6];
          dir[i * 3] = L[o + 7]; dir[i * 3 + 1] = L[o + 8]; dir[i * 3 + 2] = L[o + 9];
          cone[i * 2] = L[o + 10]; cone[i * 2 + 1] = L[o + 11];
          bleed[i] = L[o + 12];
        }
        gl.uniform3fv(litU["uLightPos[0]"], pos);
        gl.uniform3fv(litU["uLightCol[0]"], col);
        gl.uniform1fv(litU["uLightRad[0]"], rad);
        gl.uniform3fv(litU["uLightDir[0]"], dir);
        gl.uniform2fv(litU["uLightCone[0]"], cone);
        gl.uniform1fv(litU["uLightBleed[0]"], bleed);
      }
    }
    _matEmissive = _matAlpha = _matRough = _matMetal = _matSpec = _matDetail = _matCC = _matCP = -1;
  }

  function draw(mesh, modelMat, opts) {
    useProg(litProg);
    gl.uniformMatrix4fv(litU.uModel, false, modelMat);
    const emissive = opts && opts.emissive !== undefined ? opts.emissive : 0;
    const alpha = opts && opts.alpha !== undefined ? opts.alpha : 1;
    // Material (set every draw so values never leak from the previous mesh).
    // Defaults give a matte dielectric, so callers that pass no material look
    // essentially like the original lambert shading, just with a faint sheen.
    const roughness = opts && opts.roughness !== undefined ? opts.roughness : 0.7;
    const metalness = opts && opts.metalness !== undefined ? opts.metalness : 0.0;
    const specular = opts && opts.specular !== undefined ? opts.specular : 0.5;
    const detail = opts && opts.detail !== undefined ? opts.detail : 0.0;
    const clearcoat = opts && opts.clearcoat !== undefined ? opts.clearcoat : 0.0;
    const carPaint = opts && opts.carPaint !== undefined ? opts.carPaint : 0.0;
    if (emissive  !== _matEmissive) { gl.uniform1f(litU.uEmissive,  emissive);  _matEmissive = emissive; }
    if (alpha     !== _matAlpha)    { gl.uniform1f(litU.uAlpha,     alpha);     _matAlpha    = alpha; }
    if (roughness !== _matRough)    { gl.uniform1f(litU.uRoughness, roughness); _matRough    = roughness; }
    if (metalness !== _matMetal)    { gl.uniform1f(litU.uMetalness, metalness); _matMetal    = metalness; }
    if (specular  !== _matSpec)     { gl.uniform1f(litU.uSpecular,  specular);  _matSpec     = specular; }
    if (detail    !== _matDetail)   { gl.uniform1f(litU.uDetail,    detail);    _matDetail   = detail; }
    if (clearcoat !== _matCC)       { gl.uniform1f(litU.uClearcoat, clearcoat); _matCC       = clearcoat; }
    if (carPaint  !== _matCP)       { gl.uniform1f(litU.uCarPaint,  carPaint);  _matCP       = carPaint; }
    // Each draw declares the full render state it needs (no restores afterwards),
    // so runs of same-state draws collapse to a single real toggle via the cache.
    setDepthMask(true);
    setBlend(alpha < 1);
    bindVAO(mesh.vao);
    // Blended FX quads (flames, glow rings) must not write the alpha channel —
    // scene alpha is the SSR car-paint tag (see LIT_FS outColor); a low-alpha
    // flame blended over the buffer would fake/blur that tag for the composite.
    const noAW = opts && opts.noAlphaWrite;
    if (noAW) gl.colorMask(true, true, true, false);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
    if (noAW) gl.colorMask(true, true, true, true);
  }

  // ── Frustum-culled chunked meshes (used for the heavy city/props geometry) ────
  // Gribb–Hartmann plane extraction from a COLUMN-MAJOR view-proj (m[col*4+row]).
  // Planes are [a,b,c,d], inside = a*x+b*y+c*z+d >= 0. Scratch is module-static so
  // culling allocates nothing per frame.
  const _fcPlanes = [new Float32Array(4), new Float32Array(4), new Float32Array(4),
                     new Float32Array(4), new Float32Array(4), new Float32Array(4)];
  function _setPlane(p, a, b, c, d) {
    const inv = 1 / (Math.hypot(a, b, c) || 1);
    p[0] = a * inv; p[1] = b * inv; p[2] = c * inv; p[3] = d * inv;
  }
  function _extractPlanes(m, planes) {
    const m0=m[0],m4=m[4],m8=m[8],m12=m[12], m1=m[1],m5=m[5],m9=m[9],m13=m[13],
          m2=m[2],m6=m[6],m10=m[10],m14=m[14], m3=m[3],m7=m[7],m11=m[11],m15=m[15];
    _setPlane(planes[0], m3+m0, m7+m4, m11+m8,  m15+m12); // left
    _setPlane(planes[1], m3-m0, m7-m4, m11-m8,  m15-m12); // right
    _setPlane(planes[2], m3+m1, m7+m5, m11+m9,  m15+m13); // bottom
    _setPlane(planes[3], m3-m1, m7-m5, m11-m9,  m15-m13); // top
    _setPlane(planes[4], m3+m2, m7+m6, m11+m10, m15+m14); // near
    _setPlane(planes[5], m3-m2, m7-m6, m11-m10, m15-m14); // far
  }
  // AABB vs frustum via the box's most-positive vertex per plane (conservative).
  function _aabbInFrustum(planes, mn, mx) {
    for (let i = 0; i < 6; i++) {
      const p = planes[i];
      const px = p[0] >= 0 ? mx[0] : mn[0];
      const py = p[1] >= 0 ? mx[1] : mn[1];
      const pz = p[2] >= 0 ? mx[2] : mn[2];
      if (p[0]*px + p[1]*py + p[2]*pz + p[3] < 0) return false;
    }
    return true;
  }

  // Build a chunked mesh: ONE shared VBO/VAO + one index buffer per spatial XZ
  // cell (cellSize metres), each with an AABB over the verts it references. Index
  // type is Uint32 whenever total verts > 65535 (chunk indices reference the full
  // shared vertex array). Returns an object that also works as a plain mesh
  // (top-level vao/vbo/ib/count) so a stray draw()/castShadow() won't crash.
  function createChunkedMesh(data, cellSize) {
    const cell = cellSize > 0 ? cellSize : 72;
    const pos = toF32(data.pos), nrm = toF32(data.nrm), col = toF32(data.col);
    const srcIdx = data.idx, vCount = pos.length / 3, big = vCount > 65535;
    const triCount = (srcIdx.length / 3) | 0;
    if (triCount < 2000) { const m = createMesh(data); m.chunks = null; return m; }
    const interleaved = new Float32Array(vCount * 9);
    for (let i = 0; i < vCount; i++) {
      interleaved[i*9  ]=pos[i*3  ]; interleaved[i*9+1]=pos[i*3+1]; interleaved[i*9+2]=pos[i*3+2];
      interleaved[i*9+3]=nrm[i*3  ]; interleaved[i*9+4]=nrm[i*3+1]; interleaved[i*9+5]=nrm[i*3+2];
      interleaved[i*9+6]=col[i*3  ]; interleaved[i*9+7]=col[i*3+1]; interleaved[i*9+8]=col[i*3+2];
    }
    // Bin triangles by centroid cell. Numeric key (fast, no string alloc): the
    // grid is bounded (tracks span a few km), so pack signed cell coords.
    const buckets = new Map();
    for (let t = 0; t < srcIdx.length; t += 3) {
      const a = srcIdx[t], b = srcIdx[t+1], c = srcIdx[t+2];
      const ax=pos[a*3],ay=pos[a*3+1],az=pos[a*3+2], bx=pos[b*3],by=pos[b*3+1],bz=pos[b*3+2],
            cx=pos[c*3],cy=pos[c*3+1],cz=pos[c*3+2];
      const gx = Math.floor(((ax+bx+cx)/3)/cell) + 1024;
      const gz = Math.floor(((az+bz+cz)/3)/cell) + 1024;
      const key = gx * 4096 + gz;
      let bk = buckets.get(key);
      if (!bk) { bk = { idx: [], mn: [Infinity,Infinity,Infinity], mx: [-Infinity,-Infinity,-Infinity] }; buckets.set(key, bk); }
      bk.idx.push(a, b, c);
      const mn = bk.mn, mx = bk.mx;
      if (ax<mn[0])mn[0]=ax; if (ax>mx[0])mx[0]=ax; if (ay<mn[1])mn[1]=ay; if (ay>mx[1])mx[1]=ay; if (az<mn[2])mn[2]=az; if (az>mx[2])mx[2]=az;
      if (bx<mn[0])mn[0]=bx; if (bx>mx[0])mx[0]=bx; if (by<mn[1])mn[1]=by; if (by>mx[1])mx[1]=by; if (bz<mn[2])mn[2]=bz; if (bz>mx[2])mx[2]=bz;
      if (cx<mn[0])mn[0]=cx; if (cx>mx[0])mx[0]=cx; if (cy<mn[1])mn[1]=cy; if (cy>mx[1])mx[1]=cy; if (cz<mn[2])mn[2]=cz; if (cz>mx[2])mx[2]=cz;
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
    const stride = 36;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride,  0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    const IndexArray = big ? Uint32Array : Uint16Array;
    const indexType = big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    const chunks = [];
    let firstIb = null;
    buckets.forEach((bk) => {
      const arr = new IndexArray(bk.idx);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      if (!firstIb) firstIb = ibo;
      chunks.push({ ibo, count: arr.length, indexType, min: bk.mn, max: bk.mx });
    });
    gl.bindVertexArray(null);
    _activeVAO = null;
    return { vao, vbo, ib: firstIb, count: chunks.length ? chunks[0].count : 0, indexType, chunks, cellSize: cell };
  }

  // Draw a chunked mesh, frustum-culling each chunk against the camera. Material
  // setup is identical to draw() (kept in lockstep).
  function drawChunked(mesh, modelMat, opts) {
    if (!mesh) return;
    useProg(litProg);
    gl.uniformMatrix4fv(litU.uModel, false, modelMat);
    const emissive = opts && opts.emissive !== undefined ? opts.emissive : 0;
    const alpha = opts && opts.alpha !== undefined ? opts.alpha : 1;
    const roughness = opts && opts.roughness !== undefined ? opts.roughness : 0.7;
    const metalness = opts && opts.metalness !== undefined ? opts.metalness : 0.0;
    const specular = opts && opts.specular !== undefined ? opts.specular : 0.5;
    const detail = opts && opts.detail !== undefined ? opts.detail : 0.0;
    const clearcoat = opts && opts.clearcoat !== undefined ? opts.clearcoat : 0.0;
    const carPaint = opts && opts.carPaint !== undefined ? opts.carPaint : 0.0;
    if (emissive  !== _matEmissive) { gl.uniform1f(litU.uEmissive,  emissive);  _matEmissive = emissive; }
    if (alpha     !== _matAlpha)    { gl.uniform1f(litU.uAlpha,     alpha);     _matAlpha    = alpha; }
    if (roughness !== _matRough)    { gl.uniform1f(litU.uRoughness, roughness); _matRough    = roughness; }
    if (metalness !== _matMetal)    { gl.uniform1f(litU.uMetalness, metalness); _matMetal    = metalness; }
    if (specular  !== _matSpec)     { gl.uniform1f(litU.uSpecular,  specular);  _matSpec     = specular; }
    if (detail    !== _matDetail)   { gl.uniform1f(litU.uDetail,    detail);    _matDetail   = detail; }
    if (clearcoat !== _matCC)       { gl.uniform1f(litU.uClearcoat, clearcoat); _matCC       = clearcoat; }
    if (carPaint  !== _matCP)       { gl.uniform1f(litU.uCarPaint,  carPaint);  _matCP       = carPaint; }
    setDepthMask(true);
    setBlend(alpha < 1);
    bindVAO(mesh.vao);
    if (!mesh.chunks) { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib); gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0); return; }
    _extractPlanes(frameViewProj, _fcPlanes);
    const chunks = mesh.chunks;
    for (let i = 0; i < chunks.length; i++) {
      const ch = chunks[i];
      if (!_aabbInFrustum(_fcPlanes, ch.min, ch.max)) continue;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ch.ibo);
      gl.drawElements(gl.TRIANGLES, ch.count, ch.indexType, 0);
    }
  }

  // Shadow cast for a chunked mesh, culled against the shadow light frustum (an
  // off-camera building can still cast INTO view, so we cull by the light-VP, not
  // the camera). Runs under depthProg (bound by shadowBegin).
  function castShadowChunked(mesh, model) {
    if (!shadowEnabled || !mesh) return;
    bindVAO(mesh.vao);
    gl.uniformMatrix4fv(depthU.uModel, false, model);
    if (!mesh.chunks) { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib); gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0); return; }
    _extractPlanes(shadowLightVP, _fcPlanes);
    const chunks = mesh.chunks;
    for (let i = 0; i < chunks.length; i++) {
      const ch = chunks[i];
      if (!_aabbInFrustum(_fcPlanes, ch.min, ch.max)) continue;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ch.ibo);
      gl.drawElements(gl.TRIANGLES, ch.count, ch.indexType, 0);
    }
  }

  function freeChunkedMesh(mesh) {
    if (!mesh) return;
    if (_activeVAO === mesh.vao) { gl.bindVertexArray(null); _activeVAO = null; }
    if (mesh.chunks) for (let i = 0; i < mesh.chunks.length; i++) gl.deleteBuffer(mesh.chunks[i].ibo);
    else if (mesh.ib) gl.deleteBuffer(mesh.ib);
    if (mesh.vbo) gl.deleteBuffer(mesh.vbo);
    if (mesh.vao) gl.deleteVertexArray(mesh.vao);
  }

  function drawSky(sky) {
    useProg(skyProg);
    gl.uniformMatrix4fv(skyU.uInvViewProj, false, sky.invViewProj);
    gl.uniform3fv(skyU.uZenith, sky.zenith);
    gl.uniform3fv(skyU.uHorizon, sky.horizon);
    gl.uniform3fv(skyU.uSunDir, sky.sunDir);
    gl.uniform3fv(skyU.uSunColor, sky.sunColor);
    gl.uniform1f(skyU.uStars, sky.stars ? 1 : 0);
    gl.uniform1f(skyU.uCloud, sky.cloud !== undefined ? sky.cloud : 0);
    gl.uniform1f(skyU.uTime,  sky.time  !== undefined ? sky.time  : 0);
    gl.uniform1f(skyU.uMoon,  sky.moon  !== undefined ? sky.moon  : 0);
    gl.uniform3fv(skyU.uCityGlow, sky.cityGlow || [0, 0, 0]);
    setBlend(false);
    setDepthMask(false);
    bindVAO(skyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function drawShadow(modelMat, w, l) {
    useProg(shadowProg);
    if (_shadowVPToken !== _frameToken) {
      gl.uniformMatrix4fv(shadowU.uViewProj, false, frameViewProj);
      _shadowVPToken = _frameToken;
    }
    gl.uniformMatrix4fv(shadowU.uModel, false, modelMat);
    gl.uniform2f(shadowU.uSize, w, l);
    setBlend(true);
    setDepthMask(false);
    bindVAO(shadowVAO);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  function drawMark(modelMat, w, l) {
    useProg(markProg);
    if (_markVPToken !== _frameToken) {
      gl.uniformMatrix4fv(markU.uViewProj, false, frameViewProj);
      _markVPToken = _frameToken;
    }
    gl.uniformMatrix4fv(markU.uModel, false, modelMat);
    gl.uniform2f(markU.uSize, w, l);
    setBlend(true);
    setDepthMask(false);
    bindVAO(shadowVAO);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  // Additive lens-glare halos: one round billboard per lamp. `lights` is the
  // stride-15 frame.lights array; fields 0-6 (position, colour, radius) and 14
  // (glareW: per-lamp halo weight, 0 = no visible fixture = no halo) are
  // read here. Must be called while the HDR scene target is bound (after
  // drawSky, before present) so the glare lands in the scene buffer and
  // participates in bloom. `str` scales halo brightness (0 disables).
  const _glowCorners = [[-1, 0], [1, 0], [1, 1], [-1, 0], [1, 1], [-1, 1]];
  function drawGlow(lights, str) {
    if (!glowProg || !lights || !lights.length || !(str > 0)) return;
    const nL = (lights.length / 15) | 0;  // stride-15 light records (see frame.lights)
    const floatsPerLamp = 6 * 9;
    if (!glowData || glowData.length < nL * floatsPerLamp) glowData = new Float32Array(nL * floatsPerLamp);
    let p = 0, nDraw = 0;
    const ex = frameEye ? frameEye[0] : 0, ey = frameEye ? frameEye[1] : 0, ez = frameEye ? frameEye[2] : 0;
    for (let i = 0; i < nL; i++) {
      const o = i * 15;
      // Per-lamp glare weight (record field 14): 0 = fixture-less light (edge
      // washers) that must never paint a floating halo; >1 = big soft glare
      // (heritage globes, flood banks).
      const glareW = lights[o + 14];
      if (!(glareW > 0)) continue;
      const cx = lights[o], cy = lights[o + 1], cz = lights[o + 2];
      // Lens glare is a NEAR-FIELD veiling effect. Distant sources already read
      // as bloom on their emissive head geometry — a halo billboard out there is
      // a detached orb hanging in the sky (elevated flood heads especially).
      const dxE = cx - ex, dyE = cy - ey, dzE = cz - ez;
      const dEye = Math.sqrt(dxE * dxE + dyE * dyE + dzE * dzE);
      const fade = Math.min(1, Math.max(0, (170 - dEye) / 110));
      if (fade <= 0) continue;
      // Light colours carry PHYSICAL intensities (hundreds, for the inverse-square
      // shader) — normalise to a display-scale corona colour that keeps the hue.
      let r = lights[o + 3], g = lights[o + 4], b = lights[o + 5];
      const rad = lights[o + 6];
      const cm = Math.max(r, g, b) || 1;
      const csc = Math.min(1, 3.2 / cm) * (0.5 + 0.5 * Math.min(1, cm / 40)) * fade * glareW;
      r *= csc; g *= csc; b *= csc;
      // Billboard size: a small LENS HALO hugging the lamp head — NOT a beam cone.
      // Sized to the lens housing (~2 m) and scaled by the lamp's glare weight.
      const brad = Math.min(2.2, rad * 0.10) * (0.7 + 0.6 * Math.min(glareW, 2));
      for (let v = 0; v < 6; v++) {
        const c = _glowCorners[v];
        glowData[p++] = c[0]; glowData[p++] = c[1];
        glowData[p++] = cx; glowData[p++] = cy; glowData[p++] = cz;
        glowData[p++] = r; glowData[p++] = g; glowData[p++] = b;
        glowData[p++] = brad;
      }
      nDraw++;
    }
    if (!nDraw) return;
    useProg(glowProg);
    gl.uniformMatrix4fv(glowU.uViewProj, false, frameViewProj);
    gl.uniform3fv(glowU.uEye, frameEye);
    gl.uniform1f(glowU.uStr, str);
    bindVAO(glowVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, glowVBO);
    gl.bufferData(gl.ARRAY_BUFFER, glowData.subarray(0, p), gl.DYNAMIC_DRAW);
    // Additive, depth-tested (halos occlude behind walls) but no depth write.
    setBlend(true);
    gl.blendFunc(gl.ONE, gl.ONE);
    setDepthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, nDraw * 6);
    // Restore the default alpha-blend + culling for subsequent passes.
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.CULL_FACE);
  }

  // Resolve the HDR scene to the screen: extract bright areas, blur them into a
  // bloom buffer, then composite scene + bloom with tonemap + vignette. No-op when
  // post is disabled (the scene was drawn straight to the screen already).
  function present(opts) {
    if (!postEnabled) return;
    const threshold = opts && opts.threshold !== undefined ? opts.threshold : 0.75;
    const bloomAmt = opts && opts.bloom !== undefined ? opts.bloom : 0.55;

    // MSAA resolve: average the multisampled scene into sceneTex (and copy depth
    // into sceneDepth for SSAO/god-rays/SSR) before any post pass samples them.
    if (msaaSamples > 1) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msFBO);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, sceneFBO);
      gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height,
        gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // Fullscreen passes must overwrite (no blend) and write depth normally; draws
    // above leave state undeclared, so set what we need through the cache.
    setBlend(false);
    setDepthMask(true);
    gl.disable(gl.DEPTH_TEST);
    bindVAO(skyVAO);   // reuse the empty VAO for fullscreen triangles

    const aoStr = opts && opts.ssao !== undefined ? opts.ssao : 0;
    // 0) SSAO: raw AO from the depth texture, then a separable blur to denoise.
    const haveAO = ssaoProg && aoStr > 0 && frameInvProj && ssaoFBO;
    if (haveAO) {
      gl.viewport(0, 0, ssaoW, ssaoH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, ssaoFBO);
      useProg(ssaoProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneDepth);
      gl.uniform1i(ssaoU.uDepth, 0);
      gl.uniformMatrix4fv(ssaoU.uInvProj, false, frameInvProj);
      gl.uniform2f(ssaoU.uTexel, 1 / ssaoW, 1 / ssaoH);
      gl.uniform1f(ssaoU.uStrength, aoStr);
      // Contact shadows ride along in the AO pass when proj + view-sun are present.
      const csOn = (opts && opts.contact > 0) && frameProj && frameSunVS;
      gl.uniformMatrix4fv(ssaoU.uProj, false, frameProj || frameInvProj);
      gl.uniform3fv(ssaoU.uSunVS, frameSunVS || [0, 0, -1]);
      gl.uniform1f(ssaoU.uContact, csOn ? opts.contact : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Blur H (ssaoTex -> ssaoBlurFBO) then V (ssaoBlurTex -> ssaoFBO). Half res.
      useProg(blurProg);
      gl.uniform1i(blurU.uTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, ssaoBlurFBO);
      gl.bindTexture(gl.TEXTURE_2D, ssaoTex);
      gl.uniform2f(blurU.uDir, 1 / ssaoW, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, ssaoFBO);
      gl.bindTexture(gl.TEXTURE_2D, ssaoBlurTex);
      gl.uniform2f(blurU.uDir, 0, 1 / ssaoH);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // 0b) Volumetric sun shafts: world-space march of the sun shadow map (half-res)
    // then a separable blur. Gated on the sun being up (grStr > 0) + shadows on.
    const grStr = opts && opts.godray !== undefined ? opts.godray : 0;
    const lampVol = (opts && opts.lampVol) || 0;
    const sunGR = shadowEnabled && grStr > 0;
    const haveGR = godrayProg && frameInvVP && godrayFBO && (sunGR || lampVol > 0);
    if (haveGR) {
      gl.viewport(0, 0, godrayW, godrayH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, godrayFBO);
      useProg(godrayProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneDepth);
      gl.uniform1i(godrayU.uDepth, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, shadowMapTex);
      gl.uniform1i(godrayU.uShadowMap, 1);
      gl.uniformMatrix4fv(godrayU.uInvVP, false, frameInvVP);
      gl.uniformMatrix4fv(godrayU.uLightVP, false, shadowLightVP);
      gl.uniform3fv(godrayU.uEye, frameEye);
      gl.uniform3fv(godrayU.uSunDir, frameSunDir);
      gl.uniform3fv(godrayU.uSunColor, frameSunColor || [1, 1, 1]);
      gl.uniform1f(godrayU.uStr, sunGR ? grStr : 0.0);
      gl.uniform1f(godrayU.uTime, frameTime);
      gl.uniform1f(godrayU.uCloudCover, frameCloud);
      // Lamp volumetrics: upload the nearest-8 lamps to the eye + the haze gate.
      let grNL = 0;
      if (lampVol > 0 && frameLights) {
        const L = frameLights, total = (L.length / 15) | 0;
        const ex = frameEye[0], ey = frameEye[1], ez = frameEye[2];
        for (let i = 0; i < total; i++) {
          const o = i * 15, dx = L[o] - ex, dy = L[o + 1] - ey, dz = L[o + 2] - ez;
          const d = dx * dx + dy * dy + dz * dz;
          const e = _grSel[i]; if (e) { e.d = d; e.o = o; } else _grSel[i] = { d: d, o: o };
        }
        _grSel.length = total;
        _grSel.sort((a, b) => a.d - b.d);
        grNL = Math.min(12, total);
        for (let i = 0; i < grNL; i++) {
          const o = _grSel[i].o;
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
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      useProg(blurProg);
      gl.uniform1i(blurU.uTex, 0);
      gl.activeTexture(gl.TEXTURE0);
      // Double separable blur (H+V twice): the march + shadow slices otherwise
      // leave thin stripe artifacts that read as "random tiny rays" — two passes
      // turn the shafts into wide, soft volumes.
      for (let bp = 0; bp < 2; bp++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, godrayBlurFBO);
        gl.bindTexture(gl.TEXTURE_2D, godrayTex);
        gl.uniform2f(blurU.uDir, (1 + bp) / godrayW, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, godrayFBO);
        gl.bindTexture(gl.TEXTURE_2D, godrayBlurTex);
        gl.uniform2f(blurU.uDir, 0, (1 + bp) / godrayH);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }

    // 1) bright-pass scene -> bloom level 0 (half res)
    const nLv = bloomLv.length;
    gl.viewport(0, 0, bloomLv[0].w, bloomLv[0].h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomLv[0].fbo);
    useProg(brightProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.uniform1i(brightU.uScene, 0);
    gl.uniform1f(brightU.uThreshold, threshold);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2) mip-chain bloom: progressive 13-tap downsample to the smallest level,
    //    then additive 9-tap tent upsample back up — each level contributes one
    //    octave of blur, so bright sources get a tight core AND a wide soft halo.
    useProg(downProg);
    gl.uniform1i(downU.uTex, 0);
    for (let i = 1; i < nLv; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomLv[i].fbo);
      gl.viewport(0, 0, bloomLv[i].w, bloomLv[i].h);
      gl.bindTexture(gl.TEXTURE_2D, bloomLv[i - 1].tex);
      gl.uniform2f(downU.uTexel, 1 / bloomLv[i - 1].w, 1 / bloomLv[i - 1].h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    useProg(upProg);
    gl.uniform1i(upU.uTex, 0);
    for (let i = nLv - 1; i >= 1; i--) {
      // Intermediate levels accumulate (ONE, ONE) so every octave sums; the FINAL
      // pass into level 0 OVERWRITES instead — level 0 still holds the sharp
      // unblurred bright-pass, and adding onto it would re-inject the scene's
      // bright areas at full sharpness (large lamp-lit surfaces wash out).
      const last = i === 1;
      setBlend(!last);
      if (!last) gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomLv[i - 1].fbo);
      gl.viewport(0, 0, bloomLv[i - 1].w, bloomLv[i - 1].h);
      gl.bindTexture(gl.TEXTURE_2D, bloomLv[i].tex);
      gl.uniform2f(upU.uTexel, 1 / bloomLv[i].w, 1 / bloomLv[i].h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    setBlend(false);

    // 3) composite — to the LDR target when FXAA is on (it resolves to screen),
    //    else straight to the screen.
    const useFxaa = fxaaProg && ldrFBO && ldrTex;
    gl.bindFramebuffer(gl.FRAMEBUFFER, useFxaa ? ldrFBO : null);
    gl.viewport(0, 0, width, height);
    useProg(compProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.uniform1i(compU.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomLv[0].tex);
    gl.uniform1i(compU.uBloom, 1);
    // Normalise the mip-chain accumulation (level 0 holds nLv-1 summed blur
    // octaves) so the hand-tuned per-time-of-day bloom amounts keep their overall
    // energy — same brightness budget, spread over a wider, smoother halo.
    gl.uniform1f(compU.uBloomAmt, bloomAmt * 1.25 / Math.max(nLv - 1, 1));
    // AO: post-blur result is in ssaoTex; when AO is off bind a white 1×1 so the
    // shader's `c *= texture(uSSAO).r` is a no-op.
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, haveAO ? ssaoTex : whiteTex);
    gl.uniform1i(compU.uSSAO, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, haveGR ? godrayTex : blackTex);
    gl.uniform1i(compU.uGodray, 3);
    // Project sun direction to screen UV for lens flare
    let sunUV = [-2, -2], flareStr = 0, sunShaft = 0;
    if (frameSunDir && frameViewProj) {
      const s = frameSunDir;
      // Treat sun as infinitely distant: clip pos = VP * (sunDir, 0)
      const vp = frameViewProj;
      const cx = vp[0]*s[0] + vp[4]*s[1] + vp[8]*s[2];
      const cy = vp[1]*s[0] + vp[5]*s[1] + vp[9]*s[2];
      const cw = vp[3]*s[0] + vp[7]*s[1] + vp[11]*s[2];
      if (cw > 0) {
        sunUV = [cx / cw * 0.5 + 0.5, cy / cw * 0.5 + 0.5];
        // Lens flare peaks at GOLDEN HOUR (low sun), fading as the sun climbs —
        // the opposite of the old height-scaled version that vanished at sunset.
        // Gate flare + shafts by the sun's actual BRIGHTNESS, not just elevation:
        // at night the key light is dim moonlight kept above the horizon for sky
        // glow, and without this gate the radial pass streaked every bright lamp
        // head toward the moon — random "beams from the sky".
        const _sl = frameSunColor ? Math.max(frameSunColor[0], frameSunColor[1], frameSunColor[2]) : 1;
        const _sunGate = Math.min(1, Math.max(0, (_sl - 0.35) / 0.45));
        if (s[1] > -0.02) {
          const golden = 1.0 - Math.min(Math.max(s[1], 0) / 0.45, 1.0);
          // Lower floor + peak (was 0.30 + golden*0.55, peaking ~0.85): combined
          // with the streak shape above, that washed the whole frame during
          // ordinary dusk driving. The shader-side soft-clip already taming the
          // wash, so this just keeps typical dusk flare present but subtle.
          flareStr = (0.14 + golden * 0.30) * _sunGate;
        }
        if (s[1] > 0.05) sunShaft = s[1] * 0.8 * _sunGate;
      }
    }
    gl.uniform2fv(compU.uSunUV, sunUV);
    gl.uniform1f(compU.uFlareStr, flareStr);
    const exposure = opts && opts.exposure !== undefined ? opts.exposure : 1.0;
    gl.uniform1f(compU.uExposure, exposure);
    gl.uniform1f(compU.uSunShaft, sunShaft);
    // Cinematic split-tone grade (neutral by default → existing look unchanged).
    const grade = opts && opts.grade;
    gl.uniform3fv(compU.uGradeShadow, grade && grade.shadow ? grade.shadow : [1, 1, 1]);
    gl.uniform3fv(compU.uGradeHi, grade && grade.hi ? grade.hi : [1, 1, 1]);
    gl.uniform1f(compU.uGradeStr, grade && grade.str !== undefined ? grade.str : 0);
    // Live colour-grade tunables (IMAGE & COLOUR panel); defaults reproduce the
    // shipped grade so a missing tune object changes nothing.
    const CT = opts && opts.tune || null;
    gl.uniform1f(compU.uContrast,   CT && CT.contrast   != null ? CT.contrast   : 1.12);
    gl.uniform1f(compU.uVibrance,   CT && CT.vibrance   != null ? CT.vibrance   : 0.20);
    gl.uniform1f(compU.uSaturation, CT && CT.saturation != null ? CT.saturation : 1.0);
    gl.uniform1f(compU.uTint,       CT && CT.tint       != null ? CT.tint       : 0.0);
    gl.uniform1f(compU.uVignette,   CT && CT.vignette   != null ? CT.vignette   : 0.80);
    gl.uniform1f(compU.uCarReflect, CT && CT.carReflect != null ? CT.carReflect : 0.55);
    // Wet-road screen-space reflection: needs depth + view/proj + world-up-in-view.
    const reflStr = (opts && opts.reflect) || 0;
    // SSR inputs bind every frame now — car paint reflects the world even in
    // dry sessions (the shader's carPx tag gates the work to car pixels).
    const haveRefl = frameInvProj && frameProj && frameUpVS;
    if (haveRefl) {
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, sceneDepth);
      gl.uniform1i(compU.uDepth, 4);
      gl.uniformMatrix4fv(compU.uInvProj, false, frameInvProj);
      gl.uniformMatrix4fv(compU.uProj, false, frameProj);
      gl.uniform3fv(compU.uUpVS, frameUpVS);
      gl.uniform2f(compU.uReflTexel, 1 / width, 1 / height);
      gl.uniform3fv(compU.uReflSkyHi, frameSkyHi || [0.05, 0.06, 0.09]);
      gl.uniform3fv(compU.uReflSkyLo, frameSkyLo || [0.02, 0.025, 0.05]);
    }
    gl.uniform1f(compU.uReflect, haveRefl ? reflStr : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 4) FXAA resolve: edge-AA the tonemapped LDR image straight to the screen.
    if (useFxaa) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      useProg(fxaaProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, ldrTex);
      gl.uniform1i(fxaaU.uTex, 0);
      gl.uniform2f(fxaaU.uTexel, 1 / width, 1 / height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    bindVAO(null);
    gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.DEPTH_TEST);
  }

  function freeMesh(mesh) {
    if (!mesh) return;
    if (_activeVAO === mesh.vao) { gl.bindVertexArray(null); _activeVAO = null; }
    gl.deleteBuffer(mesh.ib);
    gl.deleteBuffer(mesh.vbo);
    gl.deleteVertexArray(mesh.vao);
  }

  return {
    init,
    resize,
    createMesh,
    createChunkedMesh,
    freeMesh,
    freeChunkedMesh,
    begin,
    draw,
    drawChunked,
    castShadowChunked,
    drawSky,
    drawShadow,
    drawMark,
    drawGlow,
    present,
    shadowBegin(lightVP) {
      if (!shadowEnabled) return;
      // Depth must be writable to clear/render the shadow map. This pass runs
      // before begin(), so declare the state explicitly rather than assuming it.
      setDepthMask(true);
      shadowLightVP.set(lightVP);
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadowMapFBO);
      gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      useProg(depthProg);
      gl.uniformMatrix4fv(depthU.uLightVP, false, lightVP);
      gl.disable(gl.CULL_FACE);  // render back faces to avoid peter-panning
    },
    castShadow(mesh, model) {
      if (!shadowEnabled || !mesh) return;
      bindVAO(mesh.vao);
      gl.uniformMatrix4fv(depthU.uModel, false, model);
      gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
    },
    shadowEnd() {
      if (!shadowEnabled) return;
      gl.enable(gl.CULL_FACE);
      // Refresh the PCSS blocker map from the just-rendered shadow depth.
      // Zero per-frame cost: shadowEnd only runs when the snap cell changed.
      if (pcssEnabled) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, blockerFBO);
        gl.viewport(0, 0, 512, 512);
        useProg(blockerProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, shadowMapTex);
        gl.bindSampler(0, blockerSampler);
        gl.uniform1i(blockerU.uDepthTex, 0);
        gl.disable(gl.DEPTH_TEST); setBlend(false);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindSampler(0, null);
        gl.enable(gl.DEPTH_TEST);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, postEnabled ? (msaaSamples > 1 ? msFBO : sceneFBO) : null);
      gl.viewport(0, 0, width, height);
    },
    get width() { return width; },
    get height() { return height; },
    get aspect() { return aspect; },
    hdrMode: () => colorType === gl.HALF_FLOAT,
    msaa: () => msaaSamples,
    pcss: () => pcssEnabled,
    setRenderScale, getRenderScale,
  };
})();
