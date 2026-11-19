"use strict";

const GLXBackend = (function () {
  const { LIT_VS, LIT_FS, SKY_VS, SKY_FS, SHADOW_VS, SHADOW_FS, MARK_FS, MARK_BATCH_VS, DECAL_VS, DECAL_FS, GLOW_VS, GLOW_FS, PARTICLE_VS, PARTICLE_FS, LINE_VS, LINE_FS } = GLXShaders;

  let gl = null;
  let canvas = null;
  let /** @type {ReturnType<typeof GLXSoft.create> | null} */ Soft = null;
  const IS_MOBILE = GLX.isMobile;
  const MOBILE_TIER = GLX.mobileTier;
  let _ctxLost = false, _lossCounted = false;
  const recordGfxBudgetExhausted = (where, err) => {
    const msg = (err && (err.message || err)) || "unknown";
    try {
      const ring = window.__apexErrors || (window.__apexErrors = []);
      ring.push({ t: Date.now(), kind: "caught", msg: "Caught @ " + where + ": " + String(msg).slice(0, 400),
                  detail: String((err && err.stack) || "").slice(0, 800) });
      if (ring.length > 40) ring.shift();
    } catch (_) {  }
    try { Log.error("gfx", "Caught @ " + where + ":", msg); } catch (_) {  }
  };
  let _glErrors = 0, _glFirstError = "";
  let _softwareGl = false;
  function detectSoftwareGl() {
    if (!gl) return false;
    try {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (!ext) return false;
      const ren = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "").toLowerCase();
      return /swiftshader|llvmpipe|lavapipe|software|subzero|softpipe/.test(ren);
    } catch (_) { return false; }
  }
  const GL_ERR_NAMES = { 1280: "INVALID_ENUM", 1281: "INVALID_VALUE", 1282: "INVALID_OPERATION",
                         1285: "OUT_OF_MEMORY", 1286: "INVALID_FRAMEBUFFER_OPERATION", 37442: "CONTEXT_LOST" };
  const DRAIN_PRESENTS = 30;
  let _drainLeft = DRAIN_PRESENTS, _glDrainAlways = false;
  try { _glDrainAlways = localStorage.getItem("apex26.glErrDrain") === "1"; } catch (_) {}
  function drainGlErrors(where) {
    if (!gl || _ctxLost) return;
    for (let i = 0; i < 8; i++) {
      const e = gl.getError();
      if (!e) return;
      _glErrors++;
      if (!_glFirstError) _glFirstError = (GL_ERR_NAMES[e] || ("0x" + e.toString(16))) + " @ " + where;
    }
  }
  function ctxGone() { return _ctxLost || !!(gl && gl.isContextLost && gl.isContextLost()); }

  let _gpuTimerExt = null, _gpuTimerOn = false, _gpuQPending = [], _gpuMs = -1;
  let _gpuSamples = 0, _gpuSampleAt = -1;
  let _anisoExt = null, _anisoMax = 0;
  let _gpuQActive = null;
  let litProg = null, litU = null;
  let _bakeTex = null, _bakeIdxTex = null, _bakeDummy = null, _bakeSrc = null, _bakeOffN = 0;
  const IDENT4 = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  let matAlbedoTex = null, matNormalTex = null, matDummyArrTex = null, _matGen = 0, _matBoundGen = -1;
  const MAT_TEX_LAYERS = 17;
  const matTexScales = new Float32Array(MAT_TEX_LAYERS);
  const _ambScratchG = [0, 0, 0], _ambScratchS = [0, 0, 0];
  let skyProg = null, skyU = null;
  let shadowProg = null, shadowU = null;
  let markProg = null, markU = null;
  let markBatchProg = null, markBatchU = null, markBatchVAO = null, markBatchVBO = null, markBatchCap = 0;
  let glowProg = null, glowU = null, glowVAO = null, glowVBO = null, glowCap = 0;
  let lineProg = null, lineU = null, lineVAO = null, lineVBO = null, lineCap = 0;
  let glowData = null;
  let particleProg = null, particleU = null, particleVAO = [], particleVBO = [], particleCap = [0, 0];
  let _partEpochs = new WeakMap(), _partEpoch = 0, _partResident = [];
  let skyVAO = null;
  let shadowVAO = null;
  let width = 0, height = 0, aspect = 1;
  let outFBO = null, outVP = null, renderSizeOverride = null;
  const outputFBO = () => outFBO;
  const outputViewport = (w, h) => outVP ? [outVP.x, outVP.y, outVP.w, outVP.h] : [0, 0, w, h];
  function setOutput(fbo, vp) {
    outFBO = fbo || null;
    outVP = vp && vp.w > 0 && vp.h > 0 ? { x: vp.x | 0, y: vp.y | 0, w: vp.w | 0, h: vp.h | 0 } : null;
  }
  const clearOutput = () => { outFBO = null; outVP = null; };
  const setRenderSizeOverride = (sz) => { renderSizeOverride = sz && sz.width > 0 && sz.height > 0 ? { width: sz.width | 0, height: sz.height | 0 } : null; };
  const outputTargetState = () => ({ fbo: !!outFBO, vp: outVP ? [outVP.x, outVP.y, outVP.w, outVP.h] : null });
  function bindOutputViewport() {
    const v = outputViewport(width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, outputFBO());
    gl.viewport(v[0], v[1], v[2], v[3]);
  }
  let maxDim = 0;
  const ENV_SIZE = 64;
  const ENV_CULL_M = 150;
  let envTex = null, envFBO = null, envDepthRB = null, envDummyTex = null;
  let _envDisabled = false;
  let envFacesMask = 0, envReady = false, _envActive = false;
  let _envFrame = null, _envSvVP = null, _envSvEye = null, _envSvCull = 0;
  const _envView = new Float32Array(16), _envProj = new Float32Array(16),
        _envVP = new Float32Array(16), _envInvVP = new Float32Array(16),
        _envTgt = [0, 0, 0];
  const ENV_FACES = [
    [[ 1, 0, 0], [0, -1, 0]], [[-1, 0, 0], [0, -1, 0]],
    [[ 0, 1, 0], [0, 0,  1]], [[ 0, -1, 0], [0, 0, -1]],
    [[ 0, 0, 1], [0, -1, 0]], [[ 0, 0, -1], [0, -1, 0]],
  ];
  let frameViewProj = null;
  let frameSunDir = null;
  let frameEye = null;
  let frameCullDist = 0, frameCullFog = null;
  let frameLights = null;
  let frameAllLights = null, framePerChunkLights = 0, frameTailStart = 0, frameTailCount = 0;
  let frameRoadChunkLamps = 0;
  const MAX_LIGHTS = LightBudget.MAX;
  const _luL = new Float32Array(MAX_LIGHTS * 16);
  let frameInvProj = null;
  let frameInvVP = null;
  let frameProj = null;
  let frameSunVS = null;
  let frameUpVS = null;
  let frameSkyHorizon = null;
  let frameSkyZenith = null;
  let frameSunColor = null;
  let frameDecalSun = null;
  const _decalSunScr = [0, 0, 0];
  const _decalSh = new Float32Array(4);
  let _decalShCtr = null, _decalBake = null, _decalBakeSc = null;
  const _windScr = [0.819, 0.574, 1.0];
  let frameAmbSky = [0.3, 0.32, 0.36], frameAmbGround = [0.2, 0.19, 0.18];
  const _particleFog = { color: [0.5, 0.6, 0.7], density: 0 };
  let decalProg = null, decalU = null;
  let frameTime = 0, frameCloud = 0, frameCloudSpeed = 1;

  let core = null, /** @type {ReturnType<typeof GLXPost.init> | null} */ PST = null, /** @type {ReturnType<typeof GLXShadow.init> | null} */ SHD = null, /** @type {ReturnType<typeof GLXChunked.init> | null} */ CHK = null;
  Soft = GLXSoft.create({
    getGl: () => gl,
    getCanvas: () => canvas,
    ctxGone,
    getOutFBO: () => outFBO,
    getPST: () => PST,
    getWidth: () => width,
    getHeight: () => height,
  });


  const _matC = new Float64Array(10).fill(-1);
  let _luNL = -1;
  const _unitTex = [], _unitTgt = [];
  function bindUnit(n, target, tex) {
    if (_unitTex[n] === tex && _unitTgt[n] === target) return;
    gl.activeTexture(gl.TEXTURE0 + n);
    gl.bindTexture(target, tex);
    gl.activeTexture(gl.TEXTURE0);
    _unitTex[n] = tex; _unitTgt[n] = target;
  }
  let _envUnitSet = false;

  let _activeProg = null;
  function useProg(p) {
    if (p === _activeProg) return;
    if (_polyOn && p !== shadowProg && p !== markProg) setPolyOffset(null);
    gl.useProgram(p); _activeProg = p;
  }

  let _frameToken = 0;
  const _vpTok = { shadow: -1, mark: -1 };
  const _litUf = Object.create(null), _skyUf = Object.create(null);
  const ZERO3 = [0, 0, 0];
  const SKY_ZENITH_DEF = [0.18, 0.40, 0.78], SKY_HORIZON_DEF = [0.62, 0.74, 0.88];
  const REFL_SKY_HORIZON_DEF = [0.05, 0.06, 0.09], REFL_SKY_ZENITH_DEF = [0.02, 0.025, 0.05];
  const AMB_SKY_DEF = [0.3, 0.32, 0.36], AMB_GROUND_DEF = [0.2, 0.19, 0.18];

  function _clearUf(o) { for (const k in o) delete o[k]; }
  function _halfTex(w, h, data, nearest) {
    const t = gl.createTexture(), f = nearest ? gl.NEAREST : gl.LINEAR;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, data);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, f], [gl.TEXTURE_MAG_FILTER, f],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  }
  const _bakeShScr = [0, 0, 0];
  function bindLampBake(frame) {
    const lb = frame.lampBake, sc = frame.lampBakeScale;
    if (lb && sc && lb.data && lb.indir) {
      _bakeOffN = 0;
      if (lb !== _bakeSrc) {
        if (_bakeTex) gl.deleteTexture(_bakeTex);
        if (_bakeIdxTex) gl.deleteTexture(_bakeIdxTex);
        gl.activeTexture(gl.TEXTURE13);
        _bakeIdxTex = _halfTex(lb.tilesX, lb.tilesY, lb.indir, true);
        gl.activeTexture(gl.TEXTURE12);
        _bakeTex = _halfTex(lb.atlasW, lb.atlasH * 2, lb.data);
        _bakeSrc = lb;
      } else {
        gl.activeTexture(gl.TEXTURE13); gl.bindTexture(gl.TEXTURE_2D, _bakeIdxTex);
        gl.activeTexture(gl.TEXTURE12); gl.bindTexture(gl.TEXTURE_2D, _bakeTex);
      }
      uf1(litU.uBakeOn, _litUf, "bakeOn", 1);
      uf2(litU.uBakeOrigin, _litUf, "bakeOrigin", lb.x0, lb.z0);
      uf2(litU.uBakeSize, _litUf, "bakeSize", lb.tilesX * lb.T * lb.cell, lb.tilesY * lb.T * lb.cell);
      uf3(litU.uBakeScale, _litUf, "bakeScale", sc);
      if (litU.uBakeGrid) gl.uniform3f(litU.uBakeGrid, lb.tilesX, lb.tilesY, lb.T);
      if (litU.uBakeAtlas) uf2(litU.uBakeAtlas, _litUf, "bakeAtlas", lb.atlasW, lb.atlasH * 2);
    } else {
      if (_bakeTex && ++_bakeOffN > 120) {
        gl.deleteTexture(_bakeTex); _bakeTex = null; _bakeSrc = null;
        if (_bakeIdxTex) { gl.deleteTexture(_bakeIdxTex); _bakeIdxTex = null; }
      }
      gl.activeTexture(gl.TEXTURE12);
      if (!_bakeDummy) _bakeDummy = _halfTex(1, 1, new Uint16Array(4));
      else gl.bindTexture(gl.TEXTURE_2D, _bakeDummy);
      gl.activeTexture(gl.TEXTURE13); gl.bindTexture(gl.TEXTURE_2D, _bakeDummy);
      uf1(litU.uBakeOn, _litUf, "bakeOn", 0);
    }
    gl.activeTexture(gl.TEXTURE0);
    ufI(litU.uLampBake, _litUf, "u.lampBake", 12);
    ufI(litU.uLampBakeIdx, _litUf, "u.lampBakeIdx", 13);
  }
  function uf1(loc, cache, key, v) {
    if (!loc) return;
    if (cache[key] !== v) { gl.uniform1f(loc, v); cache[key] = v; }
  }
  function ufI(loc, cache, key, v) {
    if (!loc) return;
    if (cache[key] !== v) { gl.uniform1i(loc, v); cache[key] = v; }
  }
  function ufM4(loc, cache, key, m) {
    if (!loc) return;
    let p = cache[key];
    if (p) {
      let same = true;
      for (let i = 0; i < 16; i++) if (p[i] !== m[i]) { same = false; break; }
      if (same) return;
    } else p = cache[key] = new Float32Array(16);
    for (let i = 0; i < 16; i++) p[i] = m[i];
    gl.uniformMatrix4fv(loc, false, m);
  }

  function uf3(loc, cache, key, v) {
    if (!loc) return;
    const p = cache[key];
    if (p !== undefined && p[0] === v[0] && p[1] === v[1] && p[2] === v[2]) return;
    if (p === undefined) cache[key] = [v[0], v[1], v[2]];
    else { p[0] = v[0]; p[1] = v[1]; p[2] = v[2]; }
    gl.uniform3fv(loc, v);
  }
  function uf4(loc, cache, key, a, b, c, d) {
    if (!loc) return;
    const p = cache[key];
    if (p !== undefined && p[0] === a && p[1] === b && p[2] === c && p[3] === d) return;
    if (p === undefined) cache[key] = [a, b, c, d];
    else { p[0] = a; p[1] = b; p[2] = c; p[3] = d; }
    gl.uniform4f(loc, a, b, c, d);
  }
  function uf2(loc, cache, key, a, b) {
    if (!loc) return;
    const p = cache[key];
    if (p !== undefined && p[0] === a && p[1] === b) return;
    if (p === undefined) cache[key] = [a, b];
    else { p[0] = a; p[1] = b; }
    gl.uniform2f(loc, a, b);
  }

  let _activeVAO = null;
  function bindVAO(v) { if (v !== _activeVAO) { gl.bindVertexArray(v); _activeVAO = v; } }

  let _blendOn = false, _depthWrite = true;
  function setBlend(on) {
    if (on !== _blendOn) { if (on) gl.enable(gl.BLEND); else gl.disable(gl.BLEND); _blendOn = on; }
  }
  function setDepthMask(on) {
    if (on !== _depthWrite) { gl.depthMask(on); _depthWrite = on; }
  }
  function setCull(on) {
    if (on) gl.enable(gl.CULL_FACE);
    else gl.disable(gl.CULL_FACE);
  }
  function setAlphaWrite(on) {
    gl.colorMask(true, true, true, on);
  }
  const ROAD_BIAS = [-4.0, -8.0];
  let _polyOn = false, _polyF = 0, _polyU = 0;
  function setPolyOffset(bias) {
    if (bias) {
      const f = bias[0], u = bias[1];
      if (!_polyOn || _polyF !== f || _polyU !== u) {
        if (!_polyOn) gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(f, u);
        _polyOn = true; _polyF = f; _polyU = u;
      }
    } else if (_polyOn) {
      gl.polygonOffset(0, 0);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      _polyOn = false;
    }
  }
  function resetDrawState() {
    gl.enable(gl.CULL_FACE);
    gl.colorMask(true, true, true, true);
    gl.polygonOffset(0, 0);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    _polyOn = false; _polyF = 0; _polyU = 0;
  }

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return sh;
  }

  let _parallelExt = null, _pendingLinks = null;
  function beginLinks() { if (_parallelExt) _pendingLinks = []; }
  function checkLink(prog) {
    if (gl.getProgramParameter(prog, gl.LINK_STATUS)) return prog;
    Log.error("gfx", "GLX program link failed: " + gl.getProgramInfoLog(prog));
    for (const sh of gl.getAttachedShaders(prog) || []) {
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
        Log.error("gfx", "GLX shader compile failed:\n" + gl.getShaderInfoLog(sh) + "\n" + gl.getShaderSource(sh));
    }
    gl.deleteProgram(prog);
    return null;
  }
  function resolveLinks() {
    const list = _pendingLinks || []; _pendingLinks = null;
    const bad = new Set();
    for (let i = 0; i < list.length; i++) if (!checkLink(list[i])) bad.add(list[i]);
    return bad;
  }
  function link(vsSrc, fsSrc) {
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      return null;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (_pendingLinks) { _pendingLinks.push(prog); return prog; }
    return checkLink(prog);
  }

  function locs(prog, names) {
    const u = {};
    for (const n of names) u[n] = gl.getUniformLocation(prog, n);
    return u;
  }

  function init(canvasEl) {
    canvas = canvasEl;
    LightBudget.setSlots(MAX_LIGHTS);
    watchCanvasSize();
    const headlessUa = typeof navigator !== "undefined"
      && (/HeadlessChrome/i.test(navigator.userAgent || "")
        || !!navigator.webdriver);
    let capNative = false;
    try { capNative = (sessionStorage.getItem("apex26.wgxCapture") || localStorage.getItem("apex26.wgxCapture")) === "0"; } catch (_) {  }
    Soft.setEnabled(headlessUa && !capNative);
    gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: headlessUa && !capNative,
      ...(typeof navigator !== "undefined" && navigator.xr ? { xrCompatible: true } : {}),
    });
    if (!gl) return false;
    _softwareGl = detectSoftwareGl();
    if (Soft.isEnabled()) Soft.ensureSoftDisplay();

    try { _parallelExt = gl.getExtension("KHR_parallel_shader_compile"); } catch (_) { _parallelExt = null; }
    try { _gpuTimerExt = gl.getExtension("EXT_disjoint_timer_query_webgl2"); } catch (_) { _gpuTimerExt = null; }

    try {
      _anisoExt = gl.getExtension("EXT_texture_filter_anisotropic")
               || gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic");
      _anisoMax = _anisoExt
        ? Math.min(4, gl.getParameter(_anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 0) : 0;
    } catch (_) { _anisoExt = null; _anisoMax = 0; }

    try {
      const dims = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
      const lim = [gl.getParameter(gl.MAX_TEXTURE_SIZE) | 0, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) | 0,
                   (dims && dims[0]) | 0, (dims && dims[1]) | 0].filter((v) => v >= 2048);
      maxDim = lim.length ? Math.min(...lim) : 0;
    } catch (_) { maxDim = 0; }

    const _nowMs = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
    var _shownAt = -1e9;
    try {
      document.addEventListener("visibilitychange", function () { if (!document.hidden) _shownAt = _nowMs(); });
      window.addEventListener("pageshow", function (e) { if (e && e.persisted) _shownAt = _nowMs(); });
    } catch (_) {  }
    var _bgLoss = function () { return document.hidden || _nowMs() - _shownAt < 3000; };
    canvas.addEventListener("webglcontextlost", function (e) {
      e.preventDefault();
      if (_ctxLost) return;
      _ctxLost = true;
      if (!_bgLoss()) {
        try { localStorage.setItem("apex26.envProbeOff", "1"); } catch (_) {  }
        try { localStorage.setItem("apex26.perChunkOff", "1"); } catch (_) {  }
      }
      if (_bgLoss() && !document.hidden) {
        setTimeout(function () { try { location.reload(); } catch (_) {  } }, 300);
        return;
      }
      if (document.hidden) {
        try {
          var _onVis = function () {
            if (document.hidden) return;
            document.removeEventListener("visibilitychange", _onVis);
            try { location.reload(); } catch (_) {  }
          };
          document.addEventListener("visibilitychange", _onVis);
        } catch (_) {  }
        return;
      }
      var _n = GfxEscalation.nextReloadCount();
      _lossCounted = true;
      if (_n <= 2) setTimeout(function () {
        try { sessionStorage.setItem("apex26.ctxLostNotice", "1"); } catch (_) {  }
        try { location.reload(); } catch (_) {  }
      }, 1200);
      else {
        try {
          if (typeof GfxEscalation !== "undefined" && GfxEscalation.onReloadBudgetExceeded) {
            GfxEscalation.onReloadBudgetExceeded(_n, {
              recordGfxBudgetExhausted,
              showUnavailable: (opts) => {
                if (typeof RendererPicker !== "undefined" && RendererPicker.showUnavailable) RendererPicker.showUnavailable(opts);
              },
              panel: document.getElementById("nogl"),
            });
          } else {
            recordGfxBudgetExhausted("gfx", new Error("The graphics device keeps getting lost (" + _n + " times) — reload to try again, or pick another RENDERER in settings."));
            if (typeof RendererPicker !== "undefined" && RendererPicker.showUnavailable) {
              RendererPicker.showUnavailable({ panel: document.getElementById("nogl") });
            }
          }
        } catch (_) {  }
      }
    }, false);
    canvas.addEventListener("webglcontextrestored", function () {
      var n = GfxEscalation.reloadCount();
      if (n > 2) return;
      if (_lossCounted) try { sessionStorage.setItem("apex26.ctxLostNotice", "1"); } catch (_) {  }
      try { location.reload(); } catch (e) { Log.warn("gfx", "GLX: context restored but reload failed:", e && e.message); }
    }, false);

    const LIT_FS_ROWS = 288;
    try {
      const rows = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) | 0;
      if (rows && rows < LIT_FS_ROWS) {
        Log.warn("gfx", "GLX: MAX_FRAGMENT_UNIFORM_VECTORS " + rows + " < the lit shader's ~" + LIT_FS_ROWS + " rows — expect the lit program to fail to link on this GPU");
      }
    } catch (_) {  }
    beginLinks();
    litProg = link(LIT_VS, LIT_FS);
    skyProg = link(SKY_VS, SKY_FS);
    shadowProg = link(SHADOW_VS, SHADOW_FS);
    markProg = link(SHADOW_VS, MARK_FS);
    markBatchProg = link(MARK_BATCH_VS, MARK_FS);
    glowProg = link(GLOW_VS, GLOW_FS);
    lineProg = LINE_VS && LINE_FS ? link(LINE_VS, LINE_FS) : null;
    particleProg = link(PARTICLE_VS, PARTICLE_FS);
    decalProg = link(DECAL_VS, DECAL_FS);
    const _bad = resolveLinks(), _ok = (p) => (p && !_bad.has(p) ? p : null);
    litProg = _ok(litProg); skyProg = _ok(skyProg); shadowProg = _ok(shadowProg); markProg = _ok(markProg);
    markBatchProg = _ok(markBatchProg); glowProg = _ok(glowProg); particleProg = _ok(particleProg); decalProg = _ok(decalProg); lineProg = _ok(lineProg);
    decalU = decalProg && locs(decalProg, ["uModel", "uViewProj", "uSunDir", "uSunColor", "uAmbSky", "uAmbGround", "uGlow", "uTex",
      "uShadowMap", "uLightVP", "uShadowP", "uShadowCtr", "uEye", "uLampBake", "uLampBakeIdx", "uBakeOn", "uBakeA", "uBakeScale", "uBakeGrid", "uBakeAtlas"]);
    if (!litProg || !skyProg || !shadowProg || !markProg) return false;
    _clearUf(_litUf); _clearUf(_skyUf); _matBoundGen = -1;

    core = {
      gl,
      MOBILE_TIER,
      IS_MOBILE,
      ctxGone,
      useProg, bindVAO, setBlend, setDepthMask, setCull, setPolyOffset,
      compile, link, locs, beginLinks, resolveLinks,
      toF32, createMesh, litMaterial,
      uploadLightSet: (L, idx, n) => uploadLightSet(L, idx, n),
      setLampShadowSlot: (i) => { ufI(litU.uLampShadowIdx, _litUf, "lampShadowIdx", i | 0); },
      getSize: () => ({ width, height }),
      getPresentSize: () => ({ width: presentW || width, height: presentH || height }),
      outputFBO, outputViewport, setOutput, clearOutput,
      outputClipped: () => !!outVP,
      setRenderSizeOverride,
      wantSpatialUpscale,
      gpuTimerEnd: _gpuTimerEnd,
      get skyVAO() { return skyVAO; },
      invalidateVAO() { _activeVAO = null; },
      unbindVAOIf(v) { if (_activeVAO === v) { gl.bindVertexArray(null); _activeVAO = null; } },
      frame: {
        get viewProj() { return frameViewProj; },
        get sunDir() { return frameSunDir; },
        get sunColor() { return frameSunColor; },
        get eye() { return frameEye; },
        get cullDist() { return frameCullDist; }, get cullFog() { return frameCullFog; },
        get invProj() { return frameInvProj; },
        get invVP() { return frameInvVP; },
        get proj() { return frameProj; },
        get sunVS() { return frameSunVS; },
        get upVS() { return frameUpVS; },
        get skyHi() { return frameSkyHorizon; },
        get skyLo() { return frameSkyZenith; },
        get lights() { return frameLights; },
        get allLights() { return frameAllLights; },
        get perChunkLights() { return framePerChunkLights; },
        get roadChunkLamps() { return frameRoadChunkLamps; },
        get tailStart() { return frameTailStart; },
        get tailCount() { return frameTailCount; },
        get time() { return frameTime; },
        get cloud() { return frameCloud; },
        get cloudSpeed() { return frameCloudSpeed; },
      },
      post: null, shadow: null,
    };
    PST = GLXPost.init(core);   core.post = PST;
    if (spatialUpscale && PST.ensureSpatial) PST.ensureSpatial();
    SHD = GLXShadow.init(core); core.shadow = SHD;
    CHK = GLXChunked.init(core);
    try {
      if (localStorage.getItem("apex26.occlusionCull") === "1") CHK.occlusionCull(true);
      if (localStorage.getItem("apex26.multiDraw") === "1") CHK.multiDraw(true);
    } catch (_) {  }

    gl.vertexAttrib3f(9, 1, 1, 1);
    _luNL = -1;
    _matC.fill(-1);
    _unitTex.length = _unitTgt.length = 0;
    _envUnitSet = false;
    litU = locs(litProg, ["uModel", "uInstanced", "uViewProj", "uEye", "uSunDir", "uSunColor",
      "uAmbGround", "uAmbSky", "uFogColor", "uFogDensity", "uEmissive", "uAlpha",
      "uRoughness", "uMetalness", "uSpecular", "uDetail", "uClearcoat", "uCarPaint", "uCarFinish", "uSparkle", "uWetness", "uRain", "uSpecKnee", "uEnvCube", "uEnvStr",
      "uShadowMap", "uLightVP", "uShadowBias", "uShadowStr", "uShadowTexel", "uShadowRange", "uShadowCtr",
      "uCarShadowMap", "uCarLightVP", "uCarShadowOn", "uCarBiasScale",
      "uLampShadowMap", "uLampShadowVP", "uLampShadowOn", "uLampShadowIdx",
      "uSkyZenith", "uSkyHorizon", "uFogHeight", "uGroundMist", "uPitLane", "uPitBox", "uLampFog", "uBlockerMap", "uPcss", "uTime", "uWind", "uCloudCover", "uCloudSpeed", "uCloudShadowDim",
      "uBounceK", "uMistShare", "uLampFogClip", "uGlowAmp", "uBloomBoost", "uPcssPen", "uKeyMul",
      "uFogTint", "uMistHeight", "uShadowTintAmt", "uWetDark", "uPuddles",
      "uCarSunGlint", "uCarSparkle", "uFogSunCore",
      "uLampNearClamp", "uWindowSunFlash", "uSkyRimGlow", "uAmbContactDark", "uLampWallSpill",
      "uMatAlbedoTex", "uMatNormalTex", "uMatTexMix", "uMatTexScale[0]",
      "uLampBake", "uLampBakeIdx", "uBakeOn", "uBakeOrigin", "uBakeSize", "uBakeScale", "uBakeShCol", "uBakeGrid", "uBakeAtlas",
      "uNumLights", "uLight[0]"]);
    skyU = locs(skyProg, ["uInvViewProj", "uZenith", "uHorizon", "uSunDir", "uSunColor", "uStars", "uCloud", "uTime", "uMoon", "uCityGlow", "uStarBright", "uCloudSpeed", "uSkyGrad", "uStarDensity", "uDaySkyBlue", "uMieScatter", "uCloudSilver", "uCoronaAureole", "uSunDiscSize", "uStarSize", "uStarTwinkle", "uMoonDiscSize", "uMoonHalo", "uSunCorona", "uSunSquash", "uCityGlowReach", "uCloudDef", "uLightning"]);
    shadowU = locs(shadowProg, ["uModel", "uViewProj", "uSize"]);
    markU = locs(markProg, ["uModel", "uViewProj", "uSize"]);
    if (markBatchProg) {
      markBatchU = locs(markBatchProg, ["uViewProj"]);
      markBatchVAO = gl.createVertexArray();
      gl.bindVertexArray(markBatchVAO);
      markBatchVBO = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, markBatchVBO);
      const mst = 5 * 4;
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, mst, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, mst, 12);
      gl.bindVertexArray(null);
    }
    if (lineProg) {
      lineU = locs(lineProg, ["uViewProj", "uPlayerSpeed", "uCornersOnly", "uOnPace", "uLift", "uBrake", "uOpacity", "uStr"]);
      lineVAO = gl.createVertexArray();
      gl.bindVertexArray(lineVAO);
      lineVBO = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, lineVBO);
      const lst = 7 * 4;
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, lst, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, lst, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, lst, 16);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, lst, 20);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, lst, 24);
      gl.bindVertexArray(null);
    }
    if (glowProg) {
      glowU = locs(glowProg, ["uViewProj", "uEye", "uStr"]);
      glowVAO = gl.createVertexArray();
      gl.bindVertexArray(glowVAO);
      glowVBO = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, glowVBO);
      const st = 9 * 4;
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, st, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, st, 8);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, st, 20);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, st, 32);
      gl.bindVertexArray(null);
    }
    if (particleProg) {
      particleU = locs(particleProg, ["uViewProj", "uEye", "uAdditive", "uSunColor", "uAmbSky", "uAmbGround", "uFogColor", "uFogDensity"]);
      _partEpochs = new WeakMap(); _partResident = []; particleCap = [0, 0];
      for (let i = 0; i < 2; i++) {
      particleVAO[i] = gl.createVertexArray();
      gl.bindVertexArray(particleVAO[i]);
      particleVBO[i] = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, particleVBO[i]);
      const pst = 10 * 4;
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, pst, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, pst, 8);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, pst, 20);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, pst, 32);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, pst, 36);
      gl.bindVertexArray(null);
      }
    }

    skyVAO = gl.createVertexArray();

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
    setCull(true);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    resize();
    Log.info("gfx", "GLX context ready");
    return true;
  }

  let renderScale = 1;
  let presentW = 0, presentH = 0;
  let spatialUpscale = false;
  try {
    spatialUpscale = typeof DevFlags !== "undefined" && !!DevFlags.get("upscale");
  } catch (_) { spatialUpscale = false; }
  function setSpatialUpscale(on) {
    spatialUpscale = !!on;
    if (on && PST && PST.ensureSpatial) PST.ensureSpatial();
    resize();
    return spatialUpscale;
  }
  function getSpatialUpscale() { return spatialUpscale; }
  function wantSpatialUpscale() {
    return spatialUpscale && renderScale < 0.98 && !!(PST && PST.spatialOk && PST.spatialOk());
  }
  let /** @type {ReturnType<typeof CanvasCssSize.create> | null} */ cssSizeCache = null;
  function watchCanvasSize() {
    cssSizeCache = CanvasCssSize.create(canvas, { settleFrames: 8 });
  }
  function cssSize() {
    return cssSizeCache ? cssSizeCache.read() : { width: 0, height: 0 };
  }
  function resize() {
    if (ctxGone()) return;
    if (renderSizeOverride) {
      const rw = Math.max(1, renderSizeOverride.width), rh = Math.max(1, renderSizeOverride.height);
      presentW = rw; presentH = rh;
      const up = wantSpatialUpscale(), cw = up ? presentW : rw, ch = up ? presentH : rh;
      const changed = canvas.width !== cw || canvas.height !== ch || width !== rw || height !== rh;
      if (changed && (canvas.width !== cw || canvas.height !== ch)) { canvas.width = cw; canvas.height = ch; }
      gl.viewport(0, 0, rw, rh);
      const first = width === 0;
      width = rw; height = rh; aspect = rw / rh;
      if ((changed || first) && PST) PST.createTargets();
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, MOBILE_TIER ? 1.5 : 2);
    const css = cssSize();
    const lastPW = presentW, lastPH = presentH;
    presentW = Math.max(1, Math.round(css.width * dpr));
    presentH = Math.max(1, Math.round(css.height * dpr));
    if (maxDim > 0 && (presentW > maxDim || presentH > maxDim)) {
      const k = Math.min(maxDim / presentW, maxDim / presentH);
      presentW = Math.max(1, Math.floor(presentW * k));
      presentH = Math.max(1, Math.floor(presentH * k));
    }
    if (lastPW > 1 && lastPH > 1 && Math.abs(presentW - lastPW) <= 1 && Math.abs(presentH - lastPH) <= 1) {
      presentW = lastPW; presentH = lastPH;
    }
    let rw = Math.max(1, Math.round(presentW * renderScale));
    let rh = Math.max(1, Math.round(presentH * renderScale));
    if (width > 1 && height > 1 && Math.abs(rw - width) <= 1 && Math.abs(rh - height) <= 1) {
      rw = width; rh = height;
    }
    const up = wantSpatialUpscale();
    const cw = up ? presentW : rw;
    const ch = up ? presentH : rh;
    const changed = canvas.width !== cw || canvas.height !== ch || width !== rw || height !== rh;
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    gl.viewport(0, 0, rw, rh);
    const first = width === 0;
    width = rw;
    height = rh;
    aspect = rw / rh;
    if ((changed || first) && PST) PST.createTargets();
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
    if (ctxGone()) return null;
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

    const mat = data.mat && data.mat.length === vCount ? toF32(data.mat) : null;
    const trk = data.trk && data.trk.length === vCount * 3 ? toF32(data.trk) : null;
    const interleaved = VertexPack.pack(vCount, pos, nrm, col, mat, trk);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
    VertexPack.bindAttribs(gl, !!trk);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    _activeVAO = null;

    return { vao, vbo, ib, trk: !!trk, count: idx.length, indexType: idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
  }

  function createTexMesh(data) {
    if (ctxGone()) return null;
    const pos = toF32(data.pos), nrm = toF32(data.nrm), uv = toF32(data.uv);
    const vCount = pos.length / 3;
    const big = vCount > 65535;
    let idx = data.idx;
    idx = (idx instanceof Uint16Array || idx instanceof Uint32Array)
      ? (big && idx instanceof Uint16Array ? new Uint32Array(idx) : idx)
      : (big ? new Uint32Array(idx) : new Uint16Array(idx));
    const inter = new Float32Array(vCount * 8);
    for (let i = 0; i < vCount; i++) {
      inter[i*8  ] = pos[i*3  ]; inter[i*8+1] = pos[i*3+1]; inter[i*8+2] = pos[i*3+2];
      inter[i*8+3] = nrm[i*3  ]; inter[i*8+4] = nrm[i*3+1]; inter[i*8+5] = nrm[i*3+2];
      inter[i*8+6] = uv[i*2  ];  inter[i*8+7] = uv[i*2+1];
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, inter, gl.STATIC_DRAW);
    const stride = 32;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride,  0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 24);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    _activeVAO = null;
    return { vao, vbo, ib, count: idx.length, indexType: idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
  }
  const _texLedger = new Map();
  const TEX_EXCLUDES = ["shadow maps", "post chain", "env cube", "non-GLX backends"];

  function _mipBytes(w, h, layers, bytesPerTexel) {
    let total = 0, mw = w, mh = h;
    for (;;) {
      total += mw * mh * layers * bytesPerTexel;
      if (mw === 1 && mh === 1) return total;
      mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1);
    }
  }
  function _texNote(tex, kind, w, h, layers) {
    if (!tex || !(w > 0) || !(h > 0)) return tex;
    _texLedger.set(tex, { kind, w, h, layers, bytes: _mipBytes(w, h, layers, 4) });
    return tex;
  }
  function _texForget(tex) { if (tex) _texLedger.delete(tex); }

  function texCensus() {
    if (ctxGone()) return { bytes: 0, count: 0, mb: 0, byKind: Object.create(null),
                            biggest: null, contextLost: true, excludes: TEX_EXCLUDES.slice() };
    const byKind = Object.create(null);
    let bytes = 0, count = 0, biggest = null;
    _texLedger.forEach((r) => {
      bytes += r.bytes; count++;
      byKind[r.kind] = (byKind[r.kind] || 0) + r.bytes;
      if (!biggest || r.bytes > biggest.bytes) {
        biggest = { kind: r.kind, w: r.w, h: r.h, layers: r.layers, bytes: r.bytes };
      }
    });
    return { bytes, count, mb: +(bytes / 1048576).toFixed(2), byKind, biggest,
             excludes: TEX_EXCLUDES.slice() };
  }

  function createTexture(src) {
    if (ctxGone()) return null;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); }
    catch (e) { gl.deleteTexture(tex); throw e; }
    finally {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    }
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (_anisoMax > 1) gl.texParameterf(gl.TEXTURE_2D, _anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, _anisoMax);
    if (!(SHD && SHD.enabled && SHD.mapTex)) ensureShadowDummy();
    gl.bindTexture(gl.TEXTURE_2D, (SHD && SHD.enabled && SHD.mapTex) || shadowDummyTex);
    return _texNote(tex, "content2D", src && src.width, src && src.height, 1);
  }
  function freeTexture(t) {
    if (!t) return;
    _texForget(t);
    if (ctxGone()) return;
    gl.deleteTexture(t);
  }

  function createTextureArray(size, images, layers) {
    if (ctxGone() || !size || !images) return null;
    const n = layers || MAT_TEX_LAYERS;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    const mips = Math.floor(Math.log2(size)) + 1; drainGlErrors("pre-materialArray");
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, mips, gl.RGBA8, size, size, n);
    if (gl.getError()) { gl.deleteTexture(tex); gl.bindTexture(gl.TEXTURE_2D_ARRAY, null); return null; }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    let filled = 0, grey = null;
    for (let i = 0; i < n; i++) {
      const img = images[i];
      if (!img) continue;
      try { gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, size, size, 1, gl.RGBA, gl.UNSIGNED_BYTE, img); if (!gl.getError()) { filled++; continue; } } catch (_) {  }
      if (!grey) { grey = new Uint8Array(size * size * 4).fill(128); for (let k = 3; k < grey.length; k += 4) grey[k] = 255; }
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, size, size, 1, gl.RGBA, gl.UNSIGNED_BYTE, grey); gl.getError();
    }
    if (!filled) { gl.deleteTexture(tex); gl.bindTexture(gl.TEXTURE_2D_ARRAY, null); return null; }
    _texNote(tex, "materialArray", size, size, n);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    if (_anisoMax > 1) gl.texParameterf(gl.TEXTURE_2D_ARRAY, _anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, _anisoMax);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    return tex;
  }

  function setMaterialMaps(maps) {
    _matGen++;
    const albedo = maps && maps.albedo || null, normal = maps && maps.normal || null;
    for (const old of new Set([matAlbedoTex, matNormalTex]))
      if (old && old !== albedo && old !== normal) freeTexture(old);
    matAlbedoTex = albedo; matNormalTex = normal;
    matTexScales.fill(0);
    if (!maps) return;
    const sc = maps.scales;
    if (sc) for (let i = 0; i < MAT_TEX_LAYERS; i++) matTexScales[i] = +sc[i] > 0 ? +sc[i] : 0;
    if (!matAlbedoTex) matTexScales.fill(0);
  }

  let shadowDummyTex = null;
  function ensureShadowDummy() {
    if (shadowDummyTex) return;
    shadowDummyTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, shadowDummyTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT16, 1, 1, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, new Uint16Array([65535]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
  function ensureMatDummy() {
    if (matDummyArrTex) return;
    matDummyArrTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, matDummyArrTex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, 1, 1, 1);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE,
                     new Uint8Array([128, 128, 128, 255]));
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
  }

  function bindMaterialMaps(mix) {
    ensureMatDummy();
    if (_matBoundGen !== _matGen) {
      _matBoundGen = _matGen; gl.activeTexture(gl.TEXTURE10); gl.bindTexture(gl.TEXTURE_2D_ARRAY, matAlbedoTex || matDummyArrTex);
      gl.activeTexture(gl.TEXTURE11); gl.bindTexture(gl.TEXTURE_2D_ARRAY, matNormalTex || matDummyArrTex);
      if (litU["uMatTexScale[0]"]) gl.uniform1fv(litU["uMatTexScale[0]"], matTexScales);
    }
    gl.activeTexture(gl.TEXTURE0);
    ufI(litU.uMatAlbedoTex, _litUf, "u.matAlbedo", 10); ufI(litU.uMatNormalTex, _litUf, "u.matNormal", 11);
    uf1(litU.uMatTexMix, _litUf, "matTexMix", matAlbedoTex ? mix : 0);
  }
  let _decalVPToken = -1;
  function drawDecal(mesh, modelMat, tex, opts) {
    if (ctxGone() || !decalProg || !mesh || !tex) return;
    useProg(decalProg);
    gl.uniformMatrix4fv(decalU.uModel, false, modelMat);
    if (_decalVPToken !== _frameToken) {
      _decalVPToken = _frameToken;
      gl.uniformMatrix4fv(decalU.uViewProj, false, frameViewProj);
      gl.uniform3fv(decalU.uSunDir, frameSunDir);
      gl.uniform3fv(decalU.uSunColor, frameDecalSun || frameSunColor);
      gl.uniform3fv(decalU.uAmbSky, frameAmbSky);
      gl.uniform3fv(decalU.uAmbGround, frameAmbGround);
      gl.uniform1i(decalU.uShadowMap, 0); gl.uniform1i(decalU.uLampBake, 12); gl.uniform1i(decalU.uLampBakeIdx, 13);
      if (SHD && SHD.lightVP) gl.uniformMatrix4fv(decalU.uLightVP, false, SHD.lightVP);
      gl.uniform4fv(decalU.uShadowP, _decalSh);
      gl.uniform3fv(decalU.uShadowCtr, _decalShCtr || ZERO3);
      gl.uniform3fv(decalU.uEye, frameEye || ZERO3);
      const lb = _decalBake;
      gl.uniform1f(decalU.uBakeOn, lb ? 1 : 0);
      if (lb) {
        gl.uniform4f(decalU.uBakeA, lb.x0, lb.z0, lb.tilesX * lb.T * lb.cell, lb.tilesY * lb.T * lb.cell);
        gl.uniform3fv(decalU.uBakeScale, _decalBakeSc);
        gl.uniform3f(decalU.uBakeGrid, lb.tilesX, lb.tilesY, lb.T);
        gl.uniform2f(decalU.uBakeAtlas, lb.atlasW, lb.atlasH * 2);
      }
    }
    gl.uniform1f(decalU.uGlow, (opts && opts.glow) || 0);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(decalU.uTex, 5);
    gl.activeTexture(gl.TEXTURE0);
    setBlend(true);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    setDepthMask(false);
    setCull(false);
    setAlphaWrite(false);
    bindVAO(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    setAlphaWrite(true);
    setCull(true);
    setDepthMask(true);
  }

  function ensureEnvDummy() {
    if (envDummyTex) return;
    envDummyTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, envDummyTex);
    const px = new Uint8Array([0, 0, 0, 255]);
    for (let f = 0; f < 6; f++)
      gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
  }

  function envInit() {
    const envInternal = PST.hdrOk() ? gl.RGBA16F : gl.RGBA8;
    const envType = PST.hdrOk() ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    envTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, envTex);
    for (let f = 0; f < 6; f++)
      gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, 0, envInternal, ENV_SIZE, ENV_SIZE, 0, gl.RGBA, envType, null);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (_anisoMax > 1) gl.texParameterf(gl.TEXTURE_CUBE_MAP, _anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, _anisoMax);
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
    ensureEnvDummy();
    envDepthRB = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, envDepthRB);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, ENV_SIZE, ENV_SIZE);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    envFBO = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, envFBO);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, envDepthRB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X, envTex, 0);
    const _envStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X, null, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); 
    if (_envStatus !== gl.FRAMEBUFFER_COMPLETE) {
      try { Log.warn("gfx", "GLX env probe framebuffer incomplete (0x" + _envStatus.toString(16) + ") — analytic reflections only"); } catch (_) {  }
      gl.deleteFramebuffer(envFBO); gl.deleteRenderbuffer(envDepthRB); gl.deleteTexture(envTex);
      envFBO = null; envDepthRB = null; envTex = null;
      _envDisabled = true;
    }
  }
  function envFaceBegin(face, eye, frame) {
    if (!gl || ctxGone() || _envDisabled) return null;
    if (!envTex) { envInit(); if (_envDisabled || !envTex || !envFBO) return null; }
    const F = ENV_FACES[face];
    _envTgt[0] = eye[0] + F[0][0]; _envTgt[1] = eye[1] + F[0][1]; _envTgt[2] = eye[2] + F[0][2];
    M4.lookAtTo(_envView, eye, _envTgt, F[1]);
    M4.perspectiveTo(_envProj, Math.PI / 2, 1, 0.4, 900);
    M4.mulTo(_envVP, _envProj, _envView);
    M4.invertTo(_envInvVP, _envVP);
    gl.bindFramebuffer(gl.FRAMEBUFFER, envFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, envTex, 0);
    if (_envFrame) {
      _envFrame.viewProj = _envSvVP; _envFrame.eye = _envSvEye; _envFrame.cullDist = _envSvCull;
      _envFrame = null;
    }
    _envFrame = frame;
    _envSvVP = frame.viewProj; _envSvEye = frame.eye; _envSvCull = frame.cullDist;
    frame.viewProj = _envVP; frame.eye = eye;
    frame.cullDist = _envSvCull > 0 ? Math.min(_envSvCull, ENV_CULL_M) : ENV_CULL_M;
    _envActive = true;
    try { begin(frame); } catch (e) { _envActive = false; _envFrame.viewProj = _envSvVP; _envFrame.eye = _envSvEye; _envFrame.cullDist = _envSvCull; _envFrame = null; throw e; }
    return _envInvVP;
  }
  function envFaceEnd(face) {
    if (_envFrame) {
      _envFrame.viewProj = _envSvVP;
      _envFrame.eye = _envSvEye;
      _envFrame.cullDist = _envSvCull;
      _envFrame = null;
    }
    _envActive = false;
    if (!gl || !envTex) return;
    envFacesMask |= 1 << face;
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, null, 0);
    bindOutputViewport();
    if (envFacesMask === 63) {
      envFacesMask = 0; envReady = true;
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, envTex);
      gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
      gl.activeTexture(gl.TEXTURE0);
      _unitTex[6] = envTex; _unitTgt[6] = gl.TEXTURE_CUBE_MAP;
    }
  }

  function mirrorBegin(frame, w, h) {
    if (!gl || ctxGone() || !PST || _envActive) return false;
    if (!PST.mirror.begin(Math.max(16, Math.min(1024, w | 0)), Math.max(8, Math.min(512, h | 0)))) return false;
    _mirFreeze = !!frame.mirrorFreezeInstanced;
    try { begin(frame); } catch (e) { PST.mirror.abort(); bindOutputViewport(); throw e; }
    return true;
  }
  function mirrorEnd() {
    if (!PST || !PST.mirror.active()) return;
    PST.mirror.end();
    bindOutputViewport();
  }

  function _gpuTimerBegin() {
    if (!_gpuTimerOn || !_gpuTimerExt || _gpuQActive) return;
    const q = gl.createQuery();
    if (!q) return;
    gl.beginQuery(_gpuTimerExt.TIME_ELAPSED_EXT, q);
    _gpuQActive = q;
  }

  function _gpuTimerEnd() {
    if (!_gpuTimerExt) return;
    if (!_gpuTimerOn && !_gpuQActive && !_gpuQPending.length) return;
    if (_gpuQActive) {
      gl.endQuery(_gpuTimerExt.TIME_ELAPSED_EXT);
      _gpuQPending.push(_gpuQActive);
      _gpuQActive = null;
    }
    const disjoint = gl.getParameter(_gpuTimerExt.GPU_DISJOINT_EXT);
    if (disjoint) {
      for (let i = 0; i < _gpuQPending.length; i++) gl.deleteQuery(_gpuQPending[i]);
      _gpuQPending.length = 0; _gpuMs = -1; _gpuSampleAt = -1;
      return;
    }
    while (_gpuQPending.length) {
      const q = _gpuQPending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
      if (Number.isFinite(ms) && ms >= 0) {
        _gpuMs = ms; _gpuSampleAt = performance.now(); _gpuSamples++;
      }
      gl.deleteQuery(q);
      _gpuQPending.shift();
    }
    while (_gpuQPending.length > 4) { gl.deleteQuery(_gpuQPending.shift()); }
  }

  function begin(frame) {
    if (ctxGone()) return false;
    _gpuTimerBegin();
    frameViewProj = frame.viewProj;
    frameSunDir = frame.sunDir;
    frameSunColor = frame.sunColor;
    frameEye = frame.eye;
    _decalBake = frame.lampBake && frame.lampBake.data && frame.lampBake.indir && frame.lampBakeScale ? frame.lampBake : null;
    _decalBakeSc = frame.lampBakeScale;
    frameCullDist = frame.cullDist || 0; frameCullFog = frame.cullFog || null;
    frameInvProj = frame.invProj || null;
    frameInvVP = frame.invViewProj || null;
    frameProj = frame.proj || null;
    frameSunVS = frame.sunViewDir || null;
    frameUpVS = frame.upViewDir || null;
    frameSkyHorizon = frame.skyHorizon || REFL_SKY_HORIZON_DEF;
    frameSkyZenith = frame.skyZenith || REFL_SKY_ZENITH_DEF;
    frameAmbSky = frame.ambientSky || AMB_SKY_DEF;
    frameAmbGround = frame.ambientGround || AMB_GROUND_DEF;
    frameTime = frame.time != null ? frame.time : 0;
    frameCloud = frame.cloud != null ? frame.cloud : 0;
    frameCloudSpeed = frame.cloudSpeed != null ? frame.cloudSpeed : 1;
    frameLights = frame.lights || null;
    frameAllLights = frame.allLights || null;
    framePerChunkLights = +frame.perChunkLights || 0;
    frameRoadChunkLamps = +frame.roadChunkLamps || 0;
    frameTailStart = frame.tailStart | 0;
    frameTailCount = frame.tailCount | 0;
    _frameToken++;
    if (_envActive) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, envFBO);
      gl.viewport(0, 0, ENV_SIZE, ENV_SIZE);
    } else if (PST.mirror.active()) {
      PST.mirror.bindTarget();
    } else {
      PST.bindSceneTarget();
    }
    gl.disable(gl.BLEND); _blendOn = false;
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(true); _depthWrite = true;
    resetDrawState();
    const fc = frame.fogColor;
    gl.clearColor(fc[0], fc[1], fc[2], 1);
    const clipClear = !!(outVP && !_envActive && !PST.mirror.active() && !PST.enabled());
    if (clipClear) { gl.enable(gl.SCISSOR_TEST); gl.scissor(outVP.x, outVP.y, outVP.w, outVP.h); }
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (clipClear) gl.disable(gl.SCISSOR_TEST);

    useProg(litProg);
    if (!_envUnitSet) { gl.uniform1i(litU.uEnvCube, 6); _envUnitSet = true; }
    bindLampBake(frame);
    gl.uniformMatrix4fv(litU.uViewProj, false, frame.viewProj);
    uf3(litU.uEye, _litUf, "eye", frame.eye);
    uf3(litU.uSunDir, _litUf, "sunDir", frame.sunDir);
    uf3(litU.uSunColor, _litUf, "sunColor", frame.sunColor);
    const T = frame.tune || null;
    const _ambM = T && T.ambientMul != null ? T.ambientMul : 1;
    if (_ambM !== 1) {
      const g = frame.ambientGround, s = frame.ambientSky;
      _ambScratchG[0] = g[0] * _ambM; _ambScratchG[1] = g[1] * _ambM; _ambScratchG[2] = g[2] * _ambM;
      _ambScratchS[0] = s[0] * _ambM; _ambScratchS[1] = s[1] * _ambM; _ambScratchS[2] = s[2] * _ambM;
      uf3(litU.uAmbGround, _litUf, "ambGround", _ambScratchG);
      uf3(litU.uAmbSky, _litUf, "ambSky", _ambScratchS);
      frameAmbSky = _ambScratchS; frameAmbGround = _ambScratchG;
    } else {
      uf3(litU.uAmbGround, _litUf, "ambGround", frame.ambientGround);
      uf3(litU.uAmbSky, _litUf, "ambSky", frame.ambientSky);
    }
    const _kM = T && T.keyMul != null ? T.keyMul : 1.0;
    if (_kM !== 1 && frameSunColor) {
      _decalSunScr[0] = frameSunColor[0] * _kM;
      _decalSunScr[1] = frameSunColor[1] * _kM;
      _decalSunScr[2] = frameSunColor[2] * _kM;
      frameDecalSun = _decalSunScr;
    } else {
      frameDecalSun = frameSunColor;
    }
    uf1(litU.uBounceK,     _litUf, "bounceK",     T && T.bounceK     != null ? T.bounceK     : 0.04);
    uf1(litU.uMistShare,   _litUf, "mistShare",   T && T.mistShare   != null ? T.mistShare   : 1.5);
    uf1(litU.uLampFogClip, _litUf, "fogClip",     T && T.fogClip     != null ? T.fogClip     : 0.7);
    uf1(litU.uGlowAmp,     _litUf, "glowAmp",     T && T.glowAmp     != null ? T.glowAmp     : 2.3);
    uf1(litU.uBloomBoost,  _litUf, "neonBoost",   T && T.neonBoost   != null ? T.neonBoost   : 0.6);
    uf1(litU.uPcssPen,     _litUf, "pcssPen",     T && T.pcssPen     != null ? T.pcssPen     : 80.0);
    uf1(litU.uKeyMul,      _litUf, "keyMul",      T && T.keyMul      != null ? T.keyMul      : 1.0);
    uf1(litU.uFogTint,     _litUf, "fogTint",     T && T.fogTint     != null ? T.fogTint     : 0.0);
    uf1(litU.uMistHeight,  _litUf, "mistHeight",  T && T.mistHeight  != null ? T.mistHeight  : 0.30);
    uf1(litU.uShadowTintAmt, _litUf, "shadowTintAmt", T && T.shadowTintAmt != null ? T.shadowTintAmt : 0.0);
    uf1(litU.uWetDark,     _litUf, "wetDark",     T && T.wetDark     != null ? T.wetDark     : 1.0);
    uf1(litU.uPuddles,     _litUf, "puddles",     T && T.puddles     != null ? T.puddles     : 1.0);
    {
      const wd = (T && T.windDir != null ? T.windDir : 35) * (Math.PI / 180);
      _windScr[0] = Math.cos(wd); _windScr[1] = Math.sin(wd);
      _windScr[2] = T && T.windSpeed != null ? T.windSpeed : 1.0;
      uf3(litU.uWind, _litUf, "wind", _windScr);
    }
    bindMaterialMaps(T && T.matTexMix != null ? T.matTexMix : 1.0);
    uf3(litU.uFogColor, _litUf, "fogColor", frame.fogColor);
    uf1(litU.uFogDensity, _litUf, "fogDensity", (frame.fogDensity != null ? frame.fogDensity : 0) * (T && T.fogDensityMul != null ? T.fogDensityMul : 1));
    _particleFog.density = (frame.fogDensity != null ? frame.fogDensity : 0) * (T && T.fogDensityMul != null ? T.fogDensityMul : 1);
    if (frame.fogColor) _particleFog.color = frame.fogColor;
    ufI(litU.uBlockerMap, _litUf, "u.blocker", 7);
    if (SHD.enabled) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, SHD.mapTex);
      ufI(litU.uShadowMap, _litUf, "u.shadow", 0);
      if (SHD.pcssEnabled) {
        bindUnit(7, gl.TEXTURE_2D, SHD.blockerTex);
      }
      uf1(litU.uPcss, _litUf, "pcss", SHD.pcssEnabled ? 1.0 : 0.0);
      ufM4(litU.uLightVP, _litUf, "lightVP", SHD.lightVP);
      uf1(litU.uShadowBias, _litUf, "shadowBias", T && T.shadowBias != null ? T.shadowBias : 0.001);
      const _kl = frame.sunColor ? Math.max(frame.sunColor[0], frame.sunColor[1], frame.sunColor[2]) : 1;
      let _hf = (_kl - 0.28) / 0.14;
      _hf = _hf < 0 ? 0 : _hf > 1 ? 1 : _hf;
      _hf = _hf * _hf * (3 - 2 * _hf);
      const _mSh = (T && T.moonShadow != null ? T.moonShadow : 0.25) * (frame.moonGate || 0);
      if (_mSh > _hf) _hf = _mSh;
      _decalSh[0] = (T && T.shadowStr != null ? T.shadowStr : 1.15) * _hf;
      uf1(litU.uShadowStr, _litUf, "shadowStr", _decalSh[0]);
      uf1(litU.uShadowRange, _litUf, "shadowRange", T && T.shadowRange != null ? T.shadowRange : 80.0);
      uf3(litU.uShadowCtr, _litUf, "shadowCtr", frame.shadowCtr || frame.eye || ZERO3);
      uf1(litU.uShadowTexel, _litUf, "shadowTexel", 1.0 / SHD.SIZE);
      _decalSh[1] = 1.0 / SHD.SIZE; _decalSh[2] = _litUf.shadowBias || 0; _decalSh[3] = _litUf.shadowRange || 80;
      _decalShCtr = frame.shadowCtr || frame.eye || ZERO3;
      if (SHD.carEnabled) {
        bindUnit(8, gl.TEXTURE_2D, SHD.carTex);
        ufI(litU.uCarShadowMap, _litUf, "u.carShadow", 8);
        ufM4(litU.uCarLightVP, _litUf, "carLightVP", SHD.carLightVP);
        uf1(litU.uCarShadowOn, _litUf, "carShadowOn", SHD.carArmed ? 1.0 : 0.0);
        uf1(litU.uCarBiasScale, _litUf, "carBiasScale", SHD.carBoxScale || 1.0);
      } else {
        uf1(litU.uCarShadowOn, _litUf, "carShadowOn", 0.0);
      }
      if (SHD.lampEnabled) {
        bindUnit(9, gl.TEXTURE_2D, SHD.lampTex);
        ufI(litU.uLampShadowMap, _litUf, "u.lampShadow", 9);
        ufM4(litU.uLampShadowVP, _litUf, "lampLightVP", SHD.lampLightVP);
        const _lampOn = SHD.lampArmed && !PST.mirror.active();
        uf1(litU.uLampShadowOn, _litUf, "lampShadowOn", _lampOn ? 1.0 : 0.0);
        ufI(litU.uLampShadowIdx, _litUf, "lampShadowIdx", SHD.lampIdx | 0);
        uf3(litU.uBakeShCol, _litUf, "bakeShCol", (typeof LampBake !== "undefined" ? LampBake.shadowCol(frame, _lampOn ? SHD.lampIdx | 0 : -1, _bakeShScr) : _bakeShScr));
      } else {
        uf1(litU.uLampShadowOn, _litUf, "lampShadowOn", 0.0);
      }
    } else {
      ensureShadowDummy();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, shadowDummyTex);
      ufI(litU.uShadowMap, _litUf, "u.shadow", 0);
      uf1(litU.uShadowStr, _litUf, "shadowStr", 0.0);
      _decalSh[0] = 0;
      uf1(litU.uCarShadowOn, _litUf, "carShadowOn", 0.0);
      uf1(litU.uLampShadowOn, _litUf, "lampShadowOn", 0.0);
    }
    uf3(litU.uSkyZenith,  _litUf, "skyZenith",  frame.skyZenith  || SKY_ZENITH_DEF);
    uf3(litU.uSkyHorizon, _litUf, "skyHorizon", frame.skyHorizon || SKY_HORIZON_DEF);
    uf1(litU.uFogHeight, _litUf, "fogHeight", T && T.fogHeight != null ? T.fogHeight : (frame.fogHeight != null ? frame.fogHeight : 0.0));
    uf1(litU.uGroundMist, _litUf, "groundMist", (frame.groundMist != null ? frame.groundMist : 0.0) * (T && T.mistDensity != null ? T.mistDensity : 1));
    {
      const pl = frame.pitLane;
      uf4(litU.uPitLane, _litUf, "pitLane", pl ? pl[0] : 0, pl ? pl[1] : 0, pl ? pl[2] : 1, pl ? pl[3] : 1);
      const pb = frame.pitBox;
      uf4(litU.uPitBox, _litUf, "pitBox", pb ? pb[0] : 0, pb ? pb[1] : 0, 0, 0);
    }
    uf1(litU.uLampFog, _litUf, "lampFog", frame.lampFog != null ? frame.lampFog : 0.0);
    uf1(litU.uTime, _litUf, "time", frame.time != null ? frame.time : 0.0);
    uf1(litU.uCloudCover, _litUf, "cloudCover", frame.cloud != null ? frame.cloud : 0.0);
    uf1(litU.uCloudSpeed, _litUf, "cloudSpeed", frame.cloudSpeed != null ? frame.cloudSpeed : 1.0);
    uf1(litU.uCloudShadowDim, _litUf, "cloudShadowDim", T && T.cloudShadowDim != null ? T.cloudShadowDim : 0.80);
    uf1(litU.uCarSunGlint, _litUf, "carSunGlint", T && T.carSunGlint != null ? T.carSunGlint : 12.0);
    uf1(litU.uCarSparkle,  _litUf, "carSparkle",  T && T.carSparkle  != null ? T.carSparkle  : 1.6);
    uf1(litU.uFogSunCore,  _litUf, "fogSunCore",  T && T.fogSunCore  != null ? T.fogSunCore  : 0.6);
    uf1(litU.uLampNearClamp,  _litUf, "lampNearClamp",  T && T.lampNearClamp  != null ? T.lampNearClamp  : 4.0);
    uf1(litU.uWindowSunFlash, _litUf, "windowSunFlash", T && T.windowSunFlash != null ? T.windowSunFlash : 1.0);
    uf1(litU.uSkyRimGlow,     _litUf, "skyRimGlow",     T && T.skyRimGlow     != null ? T.skyRimGlow     : 1.0);
    uf1(litU.uAmbContactDark, _litUf, "ambContactDark", T && T.ambContactDark != null ? T.ambContactDark : 1.0);
    uf1(litU.uLampWallSpill,  _litUf, "lampWallSpill",  T && T.lampWallSpill  != null ? T.lampWallSpill  : 1.0);
    uf1(litU.uWetness, _litUf, "wetness", frame.wetness != null ? frame.wetness : 0.0);
    uf1(litU.uRain,    _litUf, "rain",    frame.rain != null ? frame.rain : 0.0);
    uf1(litU.uSpecKnee, _litUf, "specKnee", T && T.specKnee != null ? T.specKnee : 4.0);
    ensureEnvDummy();
    bindUnit(6, gl.TEXTURE_CUBE_MAP, (envTex && !_envActive) ? envTex : envDummyTex);
    uf1(litU.uEnvStr, _litUf, "envStr", (envTex && envReady && !_envActive && !frame.noEnv)
      ? (T && T.carEnvCube != null ? T.carEnvCube : 0.0) : 0.0);
    {
      const L = frame.lights;
      uploadLightSet(L, null, L ? (L.length / 15) | 0 : 0);
    }
  }

  function uploadLightSet(L, idx, n, L2, o2, n2) {
    const nTail = (L2 && n2 > 0) ? Math.min(n2 | 0, MAX_LIGHTS) : 0;
    const nStatic = L ? Math.max(0, Math.min(MAX_LIGHTS - nTail, n | 0)) : 0;
    const nL = nStatic + nTail;
    if (nL !== _luNL) { gl.uniform1i(litU.uNumLights, nL); _luNL = nL; }
    if (nL <= 0) return;
    const L4 = _luL;
    for (let i = 0; i < nL; i++) {
      const fromTail = i >= nStatic;
      const src = fromTail ? L2 : L;
      const o = fromTail ? (((o2 | 0) + (i - nStatic)) * 15)
                         : ((idx ? idx[i] : i) * 15);
      const i4 = i * 16;
      L4[i4] = src[o]; L4[i4 + 1] = src[o + 1]; L4[i4 + 2] = src[o + 2]; L4[i4 + 3] = src[o + 6];
      L4[i4 + 4] = src[o + 3]; L4[i4 + 5] = src[o + 4]; L4[i4 + 6] = src[o + 5]; L4[i4 + 7] = src[o + 12];
      L4[i4 + 8] = src[o + 7]; L4[i4 + 9] = src[o + 8]; L4[i4 + 10] = src[o + 9]; L4[i4 + 11] = src[o + 10];
      L4[i4 + 12] = src[o + 11]; L4[i4 + 14] = 0; L4[i4 + 15] = 0;
      L4[i4 + 13] = fromTail || typeof LampBake === "undefined" ? 0 : LampBake.liveOnlyAt(src, o);
    }
    gl.uniform4fv(litU["uLight[0]"], L4, 0, nL * 16);
  }

  function litMaterial(modelMat, opts, instanced) {
    useProg(litProg);
    ufM4(litU.uModel, _litUf, "model", modelMat);
    uf1(litU.uInstanced, _litUf, "instanced", instanced ? 1 : 0);
    const emissive = opts && opts.emissive !== undefined ? opts.emissive : 0;
    const alpha = opts && opts.alpha !== undefined ? opts.alpha : 1;
    const roughness = opts && opts.roughness !== undefined ? opts.roughness : 0.7;
    const metalness = opts && opts.metalness !== undefined ? opts.metalness : 0.0;
    const specular = opts && opts.specular !== undefined ? opts.specular : 0.5;
    const detail = opts && opts.detail !== undefined ? opts.detail : 0.0;
    const clearcoat = opts && opts.clearcoat !== undefined ? opts.clearcoat : 0.0;
    const carPaint = opts && opts.carPaint !== undefined ? opts.carPaint : 0.0;
    const sparkle = opts && opts.sparkle !== undefined ? opts.sparkle : 1.0;
    if (emissive !== _matC[0]) { gl.uniform1f(litU.uEmissive, emissive); _matC[0] = emissive; }
    if (alpha !== _matC[1]) { gl.uniform1f(litU.uAlpha, alpha); _matC[1] = alpha; }
    if (roughness !== _matC[2]) { gl.uniform1f(litU.uRoughness, roughness); _matC[2] = roughness; }
    if (metalness !== _matC[3]) { gl.uniform1f(litU.uMetalness, metalness); _matC[3] = metalness; }
    if (specular !== _matC[4]) { gl.uniform1f(litU.uSpecular, specular); _matC[4] = specular; }
    if (detail !== _matC[5]) { gl.uniform1f(litU.uDetail, detail); _matC[5] = detail; }
    if (clearcoat !== _matC[6]) { gl.uniform1f(litU.uClearcoat, clearcoat); _matC[6] = clearcoat; }
    if (carPaint !== _matC[7]) { gl.uniform1f(litU.uCarPaint, carPaint); _matC[7] = carPaint; }
    if (sparkle !== _matC[8]) { gl.uniform1f(litU.uSparkle, sparkle); _matC[8] = sparkle; }
    const carFinish = opts && opts.carFinish ? 1 : 0;
    if (carFinish !== _matC[9]) { gl.uniform1f(litU.uCarFinish, carFinish); _matC[9] = carFinish; }
    return alpha;
  }

  function createInstancedBatch(data, matrices, colors, opts) {
    const mesh = createMesh(data);
    if (!mesh) return null;
    const vao = mesh.vao;
    gl.bindVertexArray(vao);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ARRAY_BUFFER, matrices, gl.STATIC_DRAW);
    for (let c = 0; c < 4; c++) {
      const loc = 5 + c;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 64, c * 16);
      gl.vertexAttribDivisor(loc, 1);
    }

    let cbo = null;
    if (colors && colors.length) {
      cbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, cbo);
      gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(9);
      gl.vertexAttribPointer(9, 3, gl.FLOAT, false, 12, 0);
      gl.vertexAttribDivisor(9, 1);
    }
    gl.bindVertexArray(null);

    mesh.instances = matrices.length / 16;
    mesh.visible = mesh.instances;
    mesh.ibo = ibo;
    mesh.cbo = cbo;

    if (opts && opts.cellSize > 0) {
      const cell = opts.cellSize;
      mesh.cells = Frustum.bucketInstances(matrices, mesh.instances, data.pos, cell, opts.radius);
      mesh.srcMatrices = matrices;
      mesh.srcColors = colors && colors.length ? colors : null;
      mesh.packMatrices = new Float32Array(matrices.length);
      mesh.packColors = mesh.srcColors ? new Float32Array(mesh.srcColors.length) : null;
    }
    return mesh;
  }

  function _shadowPackFor(batch) {
    if (!batch.packMatrices || !batch.ibo) return null;
    if (!batch._shadowPacked) batch._shadowPacked = new Float32Array(batch.packMatrices.length);
    if (!batch.shadowIbo) {
      batch.shadowIbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.shadowIbo);
      gl.bufferData(gl.ARRAY_BUFFER, batch._shadowPacked.byteLength, gl.DYNAMIC_DRAW);
    }
    return batch._shadowPacked;
  }
  let _instPerPass = !MOBILE_TIER, _mirFreeze = false;
  try { if (localStorage.getItem("apex26.glxInstPerPass") === "0") _instPerPass = false; } catch (_) {  }
  function _passBatch(b) {
    if (!_instPerPass || !b.cells || !b.srcMatrices || !b.vbo || !PST || !PST.mirror.active()) return b;
    if (b._mir) return b._mir;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao); _activeVAO = null;
    gl.bindBuffer(gl.ARRAY_BUFFER, b.vbo); VertexPack.bindAttribs(gl, !!b.trk);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.ib);
    const ibo = gl.createBuffer(), cbo = b.srcColors ? gl.createBuffer() : null;
    gl.bindBuffer(gl.ARRAY_BUFFER, ibo); gl.bufferData(gl.ARRAY_BUFFER, b.srcMatrices, gl.DYNAMIC_DRAW);
    for (let c = 0; c < 4; c++) { gl.enableVertexAttribArray(5 + c); gl.vertexAttribPointer(5 + c, 4, gl.FLOAT, false, 64, c * 16); gl.vertexAttribDivisor(5 + c, 1); }
    if (cbo) { gl.bindBuffer(gl.ARRAY_BUFFER, cbo); gl.bufferData(gl.ARRAY_BUFFER, b.srcColors, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(9); gl.vertexAttribPointer(9, 3, gl.FLOAT, false, 12, 0); gl.vertexAttribDivisor(9, 1); }
    gl.bindVertexArray(null);
    return (b._mir = { vao, ibo, cbo, count: b.count, indexType: b.indexType, instances: b.instances, visible: b.instances, cells: b.cells,
      srcMatrices: b.srcMatrices, srcColors: b.srcColors, packMatrices: new Float32Array(b.srcMatrices.length),
      packColors: b.srcColors ? new Float32Array(b.srcColors.length) : null, _mirCulled: false });
  }
  function cullInstances(batch, planes, opts) {
    if (ctxGone()) return 0;
    if (!batch || !batch.cells) return batch ? batch.instances : 0;
    const shadow = !!(opts && opts.upload === false);
    const eye = shadow ? null : frameEye, cd = shadow ? 0 : frameCullDist,
          fog = shadow ? null : frameCullFog;
    if (!shadow) {
      const v = _passBatch(batch);
      if (v !== batch) {
        if (_mirFreeze && v._mirCulled && v.visible > 0) return v.visible;
        v._mirCulled = true;
        batch = v;
      }
    }
    let samePack = !shadow && !!batch._cullPlanes && InstCells.sameRadial(batch, eye, cd, fog);
    if (samePack) {
      let po = 0;
      for (let pi = 0; pi < 6 && samePack; pi++) {
        const p = planes[pi];
        for (let k = 0; k < 4; k++, po++) {
          if (batch._cullPlanes[po] !== p[k]) { samePack = false; break; }
        }
      }
    }
    if (samePack) { batch.visible = batch._cullN; return batch._cullN; }
    let cellKeyN = -1;
    const cs = batch.cells, cn = cs.length;
    let ks = null;
    if (InstCells.enabled() || shadow) {
      ks = InstCells.scratchKeys(batch, cn);
      cellKeyN = InstCells.collectVisible(planes, cs, ks, CHK.aabbInFrustum, eye, cd, fog);
      if (!shadow && InstCells.enabled() && InstCells.sameKey(batch, ks, cellKeyN)) {
        batch.visible = batch._cullN; return batch._cullN;
      }
      if (shadow) {
        const reach = opts.reach && opts.reach[3] > 0 ? opts.reach : null, r2 = reach ? reach[3] * reach[3] : 0;
        if (reach) {
          let w = 0;
          for (let i = 0; i < cellKeyN; i++) { const c = cs[ks[i]]; if (Frustum.aabbDist2(c.mn, c.mx, reach[0], reach[1], reach[2]) <= r2) ks[w++] = ks[i]; }
          cellKeyN = w;
        }
        const sk = batch._shKey;
        if (sk && InstCells.enabled() && batch._shKeyN === cellKeyN && batch._shadowPacked && batch.shadowIbo) {
          let same = true;
          for (let i = 0; i < cellKeyN && same; i++) same = sk[i] === ks[i];
          if (same) return batch._shadowN;
        }
      }
    }
    const src = batch.srcMatrices;
    const dst = shadow ? (_shadowPackFor(batch) || batch.packMatrices) : batch.packMatrices;
    const sc = batch.srcColors;
    const dc = shadow ? null : batch.packColors;
    let n = 0;
    if (cellKeyN >= 0 && ks) {
      for (let ci = 0; ci < cellKeyN; ci++) {
        const idx = cs[ks[ci]].idx;
        for (let j = 0, jn = idx.length; j < jn; j++) {
          const i = idx[j];
          const so = i * 16, dOff = n * 16;
          for (let k = 0; k < 16; k++) dst[dOff + k] = src[so + k];
          if (dc) {
            const sco = i * 3, dco = n * 3;
            dc[dco] = sc[sco]; dc[dco + 1] = sc[sco + 1]; dc[dco + 2] = sc[sco + 2];
          }
          n++;
        }
      }
    } else {
      for (let ci = 0; ci < cn; ci++) {
        const c = cs[ci];
        if (!CHK.aabbInFrustum(planes, c.mn, c.mx)) continue;
        if (eye && (cd > 0 || (fog && fog[0] > 0))
            && Frustum.radialCulled(c.mn, c.mx, eye[0], eye[1], eye[2], cd, fog)) continue;
        const idx = c.idx;
        for (let j = 0, jn = idx.length; j < jn; j++) {
          const i = idx[j];
          const so = i * 16, dOff = n * 16;
          for (let k = 0; k < 16; k++) dst[dOff + k] = src[so + k];
          if (dc) {
            const sco = i * 3, dco = n * 3;
            dc[dco] = sc[sco]; dc[dco + 1] = sc[sco + 1]; dc[dco + 2] = sc[sco + 2];
          }
          n++;
        }
      }
    }
    if (shadow) {
      batch._shadowN = n;
      if (n && batch.shadowIbo && dst === batch._shadowPacked) {
        gl.bindBuffer(gl.ARRAY_BUFFER, batch.shadowIbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, dst, 0, n * 16);
      }
      if (dst === batch._shadowPacked && InstCells.enabled()) {
        const sk = batch._shKey && batch._shKey.length >= cn ? batch._shKey : (batch._shKey = new Int32Array(cn));
        for (let i = 0; i < cellKeyN; i++) sk[i] = ks[i];
        batch._shKeyN = cellKeyN;
      } else batch._shKeyN = -1;
      return n;
    }
    batch.visible = n;
    if (n) {
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.ibo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, dst, 0, n * 16);
      if (dc) {
        gl.bindBuffer(gl.ARRAY_BUFFER, batch.cbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, dc, 0, n * 3);
      }
    }
    const snap = batch._cullPlanes || (batch._cullPlanes = new Float64Array(24));
    for (let pi = 0, po = 0; pi < 6; pi++) {
      const p = planes[pi];
      for (let k = 0; k < 4; k++, po++) snap[po] = p[k];
    }
    InstCells.recordRadial(batch, eye, cd, fog);
    batch._cullN = n;
    if (InstCells.enabled() && cellKeyN >= 0 && ks) {
      InstCells.recordKey(batch, ks, cellKeyN);
    }
    return n;
  }

  function updateInstances(batch, matrices, n, colors) {
    if (ctxGone() || !batch || !batch.ibo) return 0;
    const cap = batch.instances | 0;
    const v = Math.max(0, Math.min(cap, n | 0));
    batch.visible = v;
    batch._cullPlanes = null;
    InstCells.invalidate(batch);
    if (v > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.ibo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, matrices, 0, v * 16);
      const cols = colors || batch.packColors;
      if (cols && batch.cbo) {
        gl.bindBuffer(gl.ARRAY_BUFFER, batch.cbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, cols, 0, v * 3);
      }
    }
    return v;
  }

  function drawInstanced(batch, opts) {
    if (ctxGone() || !batch || !batch.instances) return;
    batch = _passBatch(batch);
    const alpha = litMaterial(IDENT4, opts, 1);
    setDepthMask(alpha >= 1);
    setBlend(alpha < 1);
    bindVAO(batch.vao);
    const dbl = opts && opts.doubleSided;
    if (dbl) setCull(false);
    const n = batch.visible === undefined ? batch.instances : batch.visible;
    if (n > 0) gl.drawElementsInstanced(gl.TRIANGLES, batch.count, batch.indexType, 0, n);
    if (dbl) setCull(true);
  }

  function freeInstancedBatch(batch) {
    if (!batch || ctxGone()) return;
    if (batch.ibo) gl.deleteBuffer(batch.ibo);
    if (batch.cbo) gl.deleteBuffer(batch.cbo);
    if (batch.shadowIbo) { gl.deleteBuffer(batch.shadowIbo); batch.shadowIbo = null; }
    if (batch.shadowCbo) { gl.deleteBuffer(batch.shadowCbo); batch.shadowCbo = null; }
    if (batch._shVao) { gl.deleteVertexArray(batch._shVao); batch._shVao = null; }
    const mv = batch._mir;
    if (mv) { gl.deleteBuffer(mv.ibo); if (mv.cbo) gl.deleteBuffer(mv.cbo); gl.deleteVertexArray(mv.vao); batch._mir = null; }
    batch._shadowPacked = null;
    batch._shadowColors = null;
    freeMesh(batch);
  }

  function draw(mesh, modelMat, opts) {
    if (ctxGone() || !mesh) return;
    const alpha = litMaterial(modelMat, opts);
    setDepthMask(alpha >= 1);
    setBlend(alpha < 1);
    bindVAO(mesh.vao);
    const noAW = (opts && opts.noAlphaWrite) || alpha < 1;
    if (noAW) setAlphaWrite(false);
    const dbl = opts && opts.doubleSided;
    if (dbl) setCull(false);
    const _db = opts && opts.depthBias;
    if (_db) { setPolyOffset(_db); }
    const _ndt = opts && opts.noDepthTest;
    if (_ndt) gl.disable(gl.DEPTH_TEST);
    const m = modelMat;
    const reflected = m[0] * (m[5] * m[10] - m[6] * m[9])
      - m[4] * (m[1] * m[10] - m[2] * m[9])
      + m[8] * (m[1] * m[6] - m[2] * m[5]) < 0;
    if (reflected) {
      gl.frontFace(gl.CW);
      try { gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0); }
      finally { gl.frontFace(gl.CCW); }
    } else gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
    if (_ndt) gl.enable(gl.DEPTH_TEST);
    if (_db) { setPolyOffset(null); }
    if (dbl) setCull(true);
    if (noAW) setAlphaWrite(true);
  }

  function drawSky(sky) {
    if (ctxGone() || !sky) return;
    useProg(skyProg);
    gl.uniformMatrix4fv(skyU.uInvViewProj, false, sky.invViewProj);
    uf3(skyU.uZenith, _skyUf, "zenith", sky.zenith);
    uf3(skyU.uHorizon, _skyUf, "horizon", sky.horizon);
    uf3(skyU.uSunDir, _skyUf, "sunDir", sky.sunDir);
    uf3(skyU.uSunColor, _skyUf, "sunColor", sky.sunColor);
    gl.uniform1f(skyU.uStars, sky.stars ? 1 : 0);
    gl.uniform1f(skyU.uCloud, sky.cloud !== undefined ? sky.cloud : 0);
    gl.uniform1f(skyU.uTime,  sky.time  !== undefined ? sky.time  : 0);
    gl.uniform1f(skyU.uMoon,  sky.moon  !== undefined ? sky.moon  : 0);
    uf3(skyU.uCityGlow, _skyUf, "cityGlow", sky.cityGlow || ZERO3);
    uf1(skyU.uStarBright, _skyUf, "starBright", sky.starBright !== undefined ? sky.starBright : 1);
    uf1(skyU.uCloudSpeed, _skyUf, "cloudSpeed", sky.cloudSpeed !== undefined ? sky.cloudSpeed : 1);
    uf1(skyU.uSkyGrad,     _skyUf, "skyGrad",     sky.skyGrad     !== undefined ? sky.skyGrad     : 0.35);
    uf1(skyU.uStarDensity, _skyUf, "starDensity", sky.starDensity !== undefined ? sky.starDensity : 1);
    uf1(skyU.uDaySkyBlue,  _skyUf, "daySkyBlue",  sky.daySkyBlue  !== undefined ? sky.daySkyBlue  : 1);
    uf1(skyU.uMieScatter,  _skyUf, "mieScatter",  sky.mieScatter  !== undefined ? sky.mieScatter  : 1);
    uf1(skyU.uCloudSilver, _skyUf, "cloudSilver", sky.cloudSilver !== undefined ? sky.cloudSilver : 1);
    uf1(skyU.uCoronaAureole, _skyUf, "coronaAureole", sky.coronaAureole !== undefined ? sky.coronaAureole : 1);
    uf1(skyU.uSunDiscSize, _skyUf, "sunDiscSize", sky.sunDiscSize !== undefined ? sky.sunDiscSize : 1);
    uf1(skyU.uStarSize,     _skyUf, "starSize",     sky.starSize     !== undefined ? sky.starSize     : 1);
    uf1(skyU.uStarTwinkle,  _skyUf, "starTwinkle",  sky.starTwinkle  !== undefined ? sky.starTwinkle  : 1);
    uf1(skyU.uMoonDiscSize, _skyUf, "moonDiscSize", sky.moonDiscSize !== undefined ? sky.moonDiscSize : 1);
    uf1(skyU.uMoonHalo,     _skyUf, "moonHalo",     sky.moonHalo     !== undefined ? sky.moonHalo     : 1);
    uf1(skyU.uSunCorona,    _skyUf, "sunCorona",    sky.sunCorona    !== undefined ? sky.sunCorona    : 1);
    uf1(skyU.uSunSquash,    _skyUf, "sunSquash",    sky.sunSquash    !== undefined ? sky.sunSquash    : 1);
    uf1(skyU.uCityGlowReach, _skyUf, "cityGlowReach", sky.cityGlowReach !== undefined ? sky.cityGlowReach : 1);
    uf1(skyU.uCloudDef,     _skyUf, "cloudDef",     sky.cloudDef     !== undefined ? sky.cloudDef     : 1);
    gl.uniform1f(skyU.uLightning,   sky.lightning   !== undefined ? sky.lightning   : 0);
    setBlend(false);
    setDepthMask(false);
    bindVAO(skyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function drawShadow(modelMat, w, l) {
    if (ctxGone()) return;
    useProg(shadowProg);
    if (_vpTok.shadow !== _frameToken) {
      gl.uniformMatrix4fv(shadowU.uViewProj, false, frameViewProj);
      _vpTok.shadow = _frameToken;
    }
    gl.uniformMatrix4fv(shadowU.uModel, false, modelMat);
    gl.uniform2f(shadowU.uSize, w, l);
    setBlend(true);
    setDepthMask(false);
    setPolyOffset(ROAD_BIAS);
    bindVAO(shadowVAO);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  function drawMark(modelMat, w, l) {
    if (ctxGone()) return;
    useProg(markProg);
    if (_vpTok.mark !== _frameToken) {
      gl.uniformMatrix4fv(markU.uViewProj, false, frameViewProj);
      _vpTok.mark = _frameToken;
    }
    gl.uniformMatrix4fv(markU.uModel, false, modelMat);
    gl.uniform2f(markU.uSize, w, l);
    setBlend(true);
    setDepthMask(false);
    setPolyOffset(ROAD_BIAS);
    bindVAO(shadowVAO);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  function drawSkidBatch(verts, vertCount, dirty) {
    if (ctxGone()) return true;
    if (!markBatchProg || vertCount <= 0) return !markBatchProg ? false : true;
    useProg(markBatchProg);
    gl.uniformMatrix4fv(markBatchU.uViewProj, false, frameViewProj);
    setBlend(true);
    setDepthMask(false);
    setPolyOffset(ROAD_BIAS);
    bindVAO(markBatchVAO);
    if (dirty) {
      gl.bindBuffer(gl.ARRAY_BUFFER, markBatchVBO);
      const nF = vertCount * 5;
      if (nF > markBatchCap) {
        markBatchCap = nF;
        gl.bufferData(gl.ARRAY_BUFFER, markBatchCap * 4, gl.DYNAMIC_DRAW);
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts, 0, nF);
    }
    gl.drawArrays(gl.TRIANGLES, 0, vertCount);
    setPolyOffset(null);
    return true;
  }

  const LINE_COLS_F1 = [0.10, 0.95, 0.35, 1.00, 0.72, 0.10, 1.00, 0.12, 0.10];
  function drawDrivingLine(verts, vertCount, dirty, opts) {
    if (ctxGone()) return true;
    if (!lineProg) return false;
    if (!(vertCount > 0)) return true;
    useProg(lineProg);
    gl.uniformMatrix4fv(lineU.uViewProj, false, frameViewProj);
    gl.uniform1f(lineU.uPlayerSpeed, (opts && opts.speed) || 0);
    gl.uniform1f(lineU.uCornersOnly, opts && opts.cornersOnly ? 1 : 0);
    const lc = (opts && opts.cols) || LINE_COLS_F1;
    gl.uniform3fv(lineU.uOnPace, lc, 0, 3); gl.uniform3fv(lineU.uLift, lc, 3, 3); gl.uniform3fv(lineU.uBrake, lc, 6, 3);
    gl.uniform1f(lineU.uOpacity, (opts && opts.opacity) || 1);
    gl.uniform1f(lineU.uStr, 1.6);
    setBlend(true);
    setDepthMask(false);
    setPolyOffset(ROAD_BIAS);
    bindVAO(lineVAO);
    if (dirty) {
      gl.bindBuffer(gl.ARRAY_BUFFER, lineVBO);
      const nF = vertCount * 7;
      if (nF > lineCap) {
        lineCap = nF;
        gl.bufferData(gl.ARRAY_BUFFER, lineCap * 4, gl.STATIC_DRAW);
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts, 0, nF);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertCount);
    setPolyOffset(null);
    return true;
  }

  const _glowCorners = [[-1, 0], [1, 0], [1, 1], [-1, 0], [1, 1], [-1, 1]];
  function drawGlow(lights, str) {
    if (ctxGone() || !glowProg || !lights || !lights.length || !(str > 0)) return;
    const nL = (lights.length / 15) | 0;
    const floatsPerLamp = 6 * 9;
    if (!glowData || glowData.length < nL * floatsPerLamp) glowData = new Float32Array(nL * floatsPerLamp);
    let p = 0, nDraw = 0;
    const ex = frameEye ? frameEye[0] : 0, ey = frameEye ? frameEye[1] : 0, ez = frameEye ? frameEye[2] : 0;
    for (let i = 0; i < nL; i++) {
      const o = i * 15;
      const glareW = lights[o + 14];
      if (!(glareW > 0)) continue;
      const cx = lights[o], cy = lights[o + 1], cz = lights[o + 2];
      const dxE = cx - ex, dyE = cy - ey, dzE = cz - ez;
      const dEye = Math.sqrt(dxE * dxE + dyE * dyE + dzE * dzE);
      const fade = Math.min(1, Math.max(0, (170 - dEye) / 110));
      if (fade <= 0) continue;
      let r = lights[o + 3], g = lights[o + 4], b = lights[o + 5];
      const rad = lights[o + 6];
      const cm = Math.max(r, g, b) || 1;
      const csc = Math.min(1, 3.2 / cm) * (0.5 + 0.5 * Math.min(1, cm / 40)) * fade * glareW;
      r *= csc; g *= csc; b *= csc;
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
    if (p > glowCap) {
      glowCap = p;
      gl.bufferData(gl.ARRAY_BUFFER, glowCap * 4, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, glowData, 0, p);
    setBlend(true);
    gl.blendFunc(gl.ONE, gl.ONE);
    setDepthMask(false);
    setCull(false);
    setAlphaWrite(false);
    gl.drawArrays(gl.TRIANGLES, 0, nDraw * 6);
    setAlphaWrite(true);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    setCull(true);
  }

  function drawParticles(data, floatCount, additive, dirty) {
    if (ctxGone() || !particleProg || !(floatCount > 0) || !frameEye) return;
    if (dirty !== false && !data) return;
    useProg(particleProg);
    gl.uniformMatrix4fv(particleU.uViewProj, false, frameViewProj);
    gl.uniform3fv(particleU.uEye, frameEye);
    gl.uniform1f(particleU.uAdditive, additive ? 1 : 0);
    gl.uniform3fv(particleU.uSunColor, frameSunColor || [1, 0.98, 0.9]);
    gl.uniform3fv(particleU.uAmbSky, frameAmbSky);
    gl.uniform3fv(particleU.uAmbGround, frameAmbGround);
    gl.uniform3fv(particleU.uFogColor, _particleFog.color);
    gl.uniform1f(particleU.uFogDensity, _particleFog.density);
    const addBit = additive ? 1 : 0;
    if (!data) return;
    let epoch = _partEpochs.get(data);
    if (!epoch || dirty !== false) { epoch = ++_partEpoch; _partEpochs.set(data, epoch); }
    const resident = _partResident[addBit];
    bindVAO(particleVAO[addBit]);
    gl.bindBuffer(gl.ARRAY_BUFFER, particleVBO[addBit]);
    const needUpload = !resident || resident.data !== data || resident.epoch !== epoch || resident.count !== floatCount;
    if (needUpload) {
      if (!data) return;
      if (floatCount > particleCap[addBit]) {
        particleCap[addBit] = floatCount;
        gl.bufferData(gl.ARRAY_BUFFER, particleCap[addBit] * 4, gl.DYNAMIC_DRAW);
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, floatCount);
      _partResident[addBit] = { data, epoch, count: floatCount };
    }
    setBlend(true);
    if (additive) gl.blendFunc(gl.ONE, gl.ONE);
    setDepthMask(false);
    setCull(false);
    setAlphaWrite(false);
    gl.drawArrays(gl.TRIANGLES, 0, (floatCount / 10) | 0);
    setAlphaWrite(true);
    if (additive) gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    setCull(true);
  }

  function freeMesh(mesh) {
    if (!mesh || ctxGone()) return;
    if (_activeVAO === mesh.vao) { gl.bindVertexArray(null); _activeVAO = null; }
    gl.deleteBuffer(mesh.ib);
    gl.deleteBuffer(mesh.vbo);
    gl.deleteVertexArray(mesh.vao);
  }

  return {
    init,
    resize,
    createMesh,
    createInstancedBatch,
    cullInstances,
    updateInstances,
    get instPerPass() { return _instPerPass; },
    drawInstanced,
    freeInstancedBatch,
    createTexMesh,
    createTexture,
    createTextureArray,
    setMaterialMaps,
    materialMapState: () => ({
      albedo: !!matAlbedoTex, normal: !!matNormalTex,
      layers: Array.from(matTexScales).reduce((n, s) => n + (s > 0 ? 1 : 0), 0),
      scales: Array.from(matTexScales),
    }),
    freeTexture, flushTexPool() {},
    texCensus,
    drawDecal,
    chunkedTrackCoords: true,
    hasPerChunkLights: true,
    hasLampBake: true,
    createChunkedMesh: (data, cellSize) => CHK.createChunkedMesh(data, cellSize),
    freeMesh,
    freeChunkedMesh: (mesh) => CHK.freeChunkedMesh(mesh),
    begin,
    draw,
    drawChunked: (mesh, modelMat, opts) => { if (_envActive) return; CHK.drawChunked(mesh, modelMat, opts); },
    castShadowChunked: (mesh, model, reach) => CHK.castShadowChunked(mesh, model, reach),
    makeFrustumPlanes: (viewProj, out) => CHK.makeFrustumPlanes(viewProj, out),
    aabbInFrustum: (planes, mn, mx) => CHK.aabbInFrustum(planes, mn, mx),
    aabbDist2: (mn, mx, ex, ey, ez) => CHK.aabbDist2(mn, mx, ex, ey, ez),
    drawSky,
    drawShadow,
    drawMark,
    drawSkidBatch,
    drawDrivingLine,
    drawGlow,
    drawParticles,
    postHealth: () => null, retryPost: () => false,
    setOutputTarget: setOutput,
    clearOutputTarget: clearOutput,
    outputTargetState,
    setRenderSizeOverride,
    present: (opts) => {
      if (ctxGone()) return;
      if (CHK && CHK.occlusionPass) { try { CHK.occlusionPass(); } catch (e) { Log.warn("gfx", "occlusionPass: " + (e && e.message)); } }
      let r;
      try { r = PST.present(opts); }
      catch (e) { try { gl.enable(gl.DEPTH_TEST); } catch (_) {  } throw e; }
      Soft.blitIfDue();
      Soft.drainFrameWaiters();
      if (_glDrainAlways || _drainLeft > 0) { _drainLeft--; drainGlErrors("present"); }
      return r;
    },
    occlusionCull: (on) => (CHK && CHK.occlusionCull ? CHK.occlusionCull(on) : { on: false, supported: false }),
    occlusionStats: () => (CHK && CHK.occlusionStats ? CHK.occlusionStats() : { supported: false, on: false }),
    multiDraw: (on) => (CHK && CHK.multiDraw ? CHK.multiDraw(on) : { on: false, supported: false }),
    multiDrawStats: () => (CHK && CHK.multiDrawStats ? CHK.multiDrawStats() : { supported: false, on: false }),
    softPresent: () => Soft.isEnabled(),
    softPresentState: Soft.softPresentState,
    awaitSoftPresent: Soft.awaitSoftPresent,
    invalidateSoftPresent: Soft.invalidateSoftPresent,
    gpuErrors: () => _glErrors,
    drainGpuErrors: () => { drainGlErrors("drain"); return _glErrors; },
    gpuFirstError: () => _glFirstError || null,
    ctxLost: () => _ctxLost,
    backendState: () => ({
      api: "webgl2", isMobile: IS_MOBILE, mobileTier: MOBILE_TIER,
      gpuErrors: _glErrors, gpuFirstError: _glFirstError || null,
      ctxLost: _ctxLost, packLive: !!matAlbedoTex,
      softPresent: Soft.isEnabled(), softBlitGen: Soft.gen(),
      softwareGL: _softwareGl, softAdapter: _softwareGl,
    }),
    envFaceBegin,
    envFaceEnd,
    mirrorBegin,
    mirrorEnd,
    mirrorRect: (r, flip) => { if (PST) PST.mirror.rect(r, flip); },
    mirrorState: () => (PST ? PST.mirror.state() : { ready: false, dead: true }), releaseMirror: () => !!(PST && PST.mirror.release()),
    drawMirrorGlass: (mesh, model, opts) => !!(PST && !ctxGone() && PST.mirror.glass(mesh, model, opts)),
    envProbeReady() { return envReady; },
    envProbeReset() { envFacesMask = 0; envReady = false; _drainLeft = DRAIN_PRESENTS; },
    shadowBegin: (lightVP) => SHD.shadowBegin(lightVP),
    castShadow: (mesh, model) => SHD.castShadow(mesh, model),
    castShadowInstanced: (batch, count) => SHD.castShadowInstanced(batch, count),
    shadowEnd: () => SHD.shadowEnd(),
    get shadowCullVP() { return SHD ? (SHD.castCullVP || SHD.lightVP) : null; },
    carShadowBegin: (lightVP, boxScale) => SHD.carShadowBegin(lightVP, boxScale),
    carShadowEnd: () => SHD.carShadowEnd(),
    lampShadowBegin: (lightVP, lightIdx) => SHD.lampShadowBegin(lightVP, lightIdx),
    carShadowKeep: () => SHD.carShadowKeep(),
    lampShadowKeep: (lightIdx) => SHD.lampShadowKeep(lightIdx),
    lampShadowEnd: () => SHD.lampShadowEnd(),
    get width() { return width; },
    get height() { return height; },
    get aspect() { return aspect; },
    hdrMode: () => PST.hdrOk(),
    maxLights: () => MAX_LIGHTS,
    get carShadowEnabled() { return !!SHD.carEnabled; },
    get lampShadowEnabled() { return !!SHD.lampEnabled; },
    carShadowState: () => ({ enabled: SHD.carEnabled, arms: SHD.carArms, armed: SHD.carArmed }),
    lampShadowState: () => ({ enabled: SHD.lampEnabled, arms: SHD.lampArms, idx: SHD.lampIdx, armed: SHD.lampArmed }),
    msaa: () => PST.msaa(),
    pcss: () => SHD.pcssEnabled,
    setRenderScale, getRenderScale,
    setSpatialUpscale, getSpatialUpscale,
    gpuTimer(on) {
      if (on !== undefined) {
        _gpuTimerOn = !!on && !!_gpuTimerExt;
        if (!_gpuTimerOn) {
          if (_gpuQActive) { try { gl.endQuery(_gpuTimerExt.TIME_ELAPSED_EXT); gl.deleteQuery(_gpuQActive); } catch (_) {} _gpuQActive = null; }
          for (let i = 0; i < _gpuQPending.length; i++) gl.deleteQuery(_gpuQPending[i]);
          _gpuQPending.length = 0; _gpuMs = -1; _gpuSampleAt = -1;
        }
      }
      if (ctxGone()) { _gpuMs = -1; _gpuSampleAt = -1; }
      return { supported: !!_gpuTimerExt, on: _gpuTimerOn, samples: _gpuSamples, sampleAt: _gpuSampleAt,
        sampleAgeMs: _gpuSampleAt < 0 ? -1 : Math.max(0, performance.now() - _gpuSampleAt) };
    },
    gpuMs() { return ctxGone() ? -1 : _gpuMs; },
    isMobile: IS_MOBILE,
    mobileTier: MOBILE_TIER,
  };
})();
GLX.install(GLXBackend);
