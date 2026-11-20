"use strict";

const WGX = (function () {
  const IS_MOBILE = typeof GLX !== "undefined" && !!GLX.isMobile;
  const MOBILE_TIER = typeof GLX !== "undefined" && !!GLX.mobileTier;
  let _grLite = true;
  try { _grLite = localStorage.getItem("apex26.grLite") !== "0"; } catch (_) {  }
  const _ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  const IS_WEBKIT = /CriOS|FxiOS|EdgiOS/.test(_ua) ||
    (/Safari\//.test(_ua) && !/Chrome\/|Chromium\/|Edg\//.test(_ua));
  let _wgxLevel = 0;
  try {
    _wgxLevel = parseInt(localStorage.getItem("apex26.gfxWgxLevel") || "0", 10) || 0;
    if (!_wgxLevel && localStorage.getItem("apex26.gfxWgxLite") === "1") _wgxLevel = 1;
  } catch (_) {  }
  const _litePref = _wgxLevel >= 1;
  const WGX_LITE = !!(IS_MOBILE || IS_WEBKIT || _litePref);
  const WGX_MINIMAL = _wgxLevel >= 2;
  const HEAL_SESSIONS = 5;
  function _healTick() {
    if (_wgxLevel <= 0) return;
    try {
      const n = (parseInt(localStorage.getItem("apex26.gfxWgxOk") || "0", 10) || 0) + 1;
      if (n >= HEAL_SESSIONS) {
        localStorage.setItem("apex26.gfxWgxLevel", String(_wgxLevel - 1));
        if (_wgxLevel - 1 < 1) localStorage.removeItem("apex26.gfxWgxLite");
        localStorage.setItem("apex26.gfxWgxOk", "0");
      } else {
        localStorage.setItem("apex26.gfxWgxOk", String(n));
      }
    } catch (_) {  }
  }
  function _healReset() {
    try { localStorage.setItem("apex26.gfxWgxOk", "0"); } catch (_) {  }
  }

  const IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

  const Z01 = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,0.5,0, 0,0,0.5,1]);
  const Z01INV = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,2,0, 0,0,-1,1]);

  const _Post = (typeof window !== "undefined" && window.WGSLPost) || null;
  const _Fx   = (typeof window !== "undefined" && window.WGSLFx)   || null;

  const SCENE_FORMAT = "rgba16float";
  const DEPTH_FORMAT = "depth24plus";
  const LDR_FORMAT   = "rgba8unorm";
  const SSAO_FORMAT  = "r8unorm";
  let POST_HDR_FORMAT = "rg11b10ufloat";
  const BLOOM_MAX_LEVELS = 5;

  const _Chunks = (function () {
    try { if (typeof WGSLChunks !== "undefined" && WGSLChunks) return WGSLChunks; } catch (_) {  }
    try { if (typeof window !== "undefined" && window.WGSLChunks) return window.WGSLChunks; } catch (_) {  }
    return null;
  })();
  const _CH = _Chunks || {};

  const FRAME_BYTES = _CH.FRAME_UNIFORM_BYTES | 0;
  const FRAME_FLOATS = FRAME_BYTES / 4;
  const LIGHT_STRIDE = _CH.LIGHT_STRIDE_BYTES | 0;
  const MAX_LIGHTS = _CH.MAX_LIGHTS | 0;
  const LIGHT_BYTES = LIGHT_STRIDE * MAX_LIGHTS;
  const LIGHT_FLOATS = LIGHT_BYTES / 4;
  const DRAW_USED_BYTES = _CH.DRAW_UNIFORM_BYTES | 0;
  const LAMP_MASK_ALL = 16777215;
  const DRAW_STRIDE = 256;
  const MAX_DRAWS = 4096;
  const TRACK_LIGHT_CAP = 1024;
  const CHUNK_IDX_CAP = 16384;
  const BLIT_BYTES = _CH.BLIT_UNIFORM_BYTES | 0;

  const SHADOW_SLOTS = MAX_DRAWS;

  const VERTEX_STRIDE = 28;
  const VERTEX_FLOATS = VERTEX_STRIDE >> 2;
  const VERTEX_POS_LAYOUT = {
    arrayStride: VERTEX_STRIDE,
    attributes: [
      { shaderLocation: 0, offset: 0,  format: "float32x3" },
      { shaderLocation: 1, offset: 12, format: "snorm16x4" },
      { shaderLocation: 2, offset: 20, format: "float16x4" },
    ],
  };
  const INSTANCE_STRIDE = 80;
  const INSTANCE_LAYOUT = {
    arrayStride: INSTANCE_STRIDE,
    stepMode: "instance",
    attributes: [
      { shaderLocation: 5, offset: 0,  format: "float32x4" },
      { shaderLocation: 6, offset: 16, format: "float32x4" },
      { shaderLocation: 7, offset: 32, format: "float32x4" },
      { shaderLocation: 8, offset: 48, format: "float32x4" },
      { shaderLocation: 9, offset: 64, format: "float32x3" },
    ],
  };
  const SHADOW_VERTEX_LAYOUT = {
    arrayStride: VERTEX_STRIDE,
    attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
  };
  const SHADOW_INSTANCE_LAYOUT = {
    arrayStride: INSTANCE_STRIDE,
    stepMode: "instance",
    attributes: [
      { shaderLocation: 1, offset: 0,  format: "float32x4" },
      { shaderLocation: 2, offset: 16, format: "float32x4" },
      { shaderLocation: 3, offset: 32, format: "float32x4" },
      { shaderLocation: 4, offset: 48, format: "float32x4" },
    ],
  };
  const MAT_TEX_LAYERS = 17;
  let _wgxMsaa4 = false;
  try {
    let _p = localStorage.getItem("apex26.gfxPreset");
    try { _p = JSON.parse(_p); } catch (_) {  }
    _wgxMsaa4 = _p === "ultra" || (_p == null && localStorage.getItem("apex26.gfxHigh") === "1");
  } catch (_) {  }
  let MSAA_COUNT = WGX_LITE ? 1 : (_wgxMsaa4 ? 4 : 1);

  let _insetInPass = true, _packAsync = true, _transientOn = true;
  try {
    if (localStorage.getItem("apex26.wgxInsetInPass") === "0") _insetInPass = false;
    if (localStorage.getItem("apex26.wgxPackAsync") === "0") _packAsync = false;
    if (localStorage.getItem("apex26.wgxTransient") === "0") _transientOn = false;
  } catch (_) {  }
  function _transientRenderUsage() {
    const T = _transientOn && typeof GPUTextureUsage !== "undefined" && "TRANSIENT_ATTACHMENT" in GPUTextureUsage
      ? GPUTextureUsage.TRANSIENT_ATTACHMENT : 0;
    return GPUTextureUsage.RENDER_ATTACHMENT | T;
  }

  let _lastFailure = null;
  let _gpuErrors = 0;
  let _gpuFirstMsg = null;
  function _markGlxBound() {
    try { sessionStorage.setItem("apex26.gfxBound", "webgl2"); } catch (_) {  }
    try { window.dispatchEvent(new Event("apex-gfx-live")); } catch (_) {  }
  }
  function _clearGlxBound() {
    try { sessionStorage.removeItem("apex26.gfxBound"); } catch (_) {  }
    try { window.dispatchEvent(new Event("apex-gfx-live")); } catch (_) {  }
  }
  function _fail(reason) {
    _lastFailure = { reason: String(reason), at: Date.now() };
    try { localStorage.setItem("apex26.gfxWgxFail", _lastFailure.reason); } catch (_) {  }
    try { Log.warn("gfx", "WGX unavailable (" + _lastFailure.reason + ") — falling back to WebGL2"); } catch (_) {  }
    _markGlxBound();
    return null;
  }

  const { toF32, table: _roadLutTable } = WGXRoadLut;

  function _f16to32(h) {
    const s = (h & 0x8000) >> 15, e = (h & 0x7C00) >> 10, f = h & 0x03FF;
    if (!e) return (s ? -1 : 1) * 0.00006103515625 * (f / 1024);
    if (e === 31) return f ? NaN : (s ? -Infinity : Infinity);
    return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
  }

  function _mul4(out, a, b) {
    for (let c = 0; c < 4; c++) {
      const b0 = b[c*4], b1 = b[c*4+1], b2 = b[c*4+2], b3 = b[c*4+3];
      out[c*4]   = a[0]*b0 + a[4]*b1 + a[8]*b2  + a[12]*b3;
      out[c*4+1] = a[1]*b0 + a[5]*b1 + a[9]*b2  + a[13]*b3;
      out[c*4+2] = a[2]*b0 + a[6]*b1 + a[10]*b2 + a[14]*b3;
      out[c*4+3] = a[3]*b0 + a[7]*b1 + a[11]*b2 + a[15]*b3;
    }
    return out;
  }

  const _fcPlanes = [new Float32Array(4), new Float32Array(4), new Float32Array(4),
                     new Float32Array(4), new Float32Array(4), new Float32Array(4)];
  let _fcPlanesIsFrame = false;
  async function create(canvas, opts) {
    const initOwner = opts && opts.initOwner;
    const initActive = () => !initOwner || initOwner.active;
    if (!initActive()) return null;
    if (typeof navigator === "undefined" || !navigator.gpu) return null;
    _gpuErrors = 0; _gpuFirstMsg = null;
    if (!_Chunks || !_Chunks.LIT || !_Chunks.SKY || !_Chunks.BLIT || !_Chunks.SHADOW) {
      _fail("wgsl-chunks missing");
      return null;
    }

    let adapter, device, ctx, format, _softAdapter = false, _timestampOk = false;
    try {
      const _pref = WGX_LITE ? "low-power" : "high-performance";
      adapter = await navigator.gpu.requestAdapter({ powerPreference: _pref });
      if (!initActive()) return null;
      if (!adapter) adapter = await navigator.gpu.requestAdapter();
      if (!initActive()) return null;
      if (!adapter) return _fail("no adapter");
      let _softAdapterLocal = false;
      try {
        const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
        const info = adapter.info || null;
        const dev = info && info.device;
        const ven = info && info.vendor;
        const arch = info && info.architecture;
        const desc = info && info.description;
        const infoBlob = [dev, ven, arch, desc].filter(Boolean).join(" ").toLowerCase();
        _softAdapterLocal = !!((info && info.isFallbackAdapter) || adapter.isFallbackAdapter
            || /HeadlessChrome/i.test(ua)
            || /swiftshader|llvmpipe|lavapipe|microsoft basic render|soft(ware|pipe)/.test(infoBlob));
      } catch (_) {  }
      _softAdapter = _softAdapterLocal;
      if (!WGX_LITE && _softAdapter) MSAA_COUNT = 1;
      const _has = function (name) {
        return !!(adapter.features && adapter.features.has && adapter.features.has(name));
      };
      const _canTimestamp = !WGX_LITE && _has("timestamp-query");
      const _canPostHDR = _has("rg11b10ufloat-renderable");
      const _want = [];
      if (_canTimestamp) _want.push("timestamp-query");
      if (_canPostHDR) _want.push("rg11b10ufloat-renderable");
      device = await adapter.requestDevice(_want.length ? { requiredFeatures: _want } : {});
      if (!initActive()) { try { device.destroy(); } catch (_) {  } return null; }
      let _bornLost = null;
      device.lost.then(function (info) { _bornLost = (info && info.reason) || "unknown"; });
      await null; await null;
      if (_bornLost) return _fail("device arrived lost (" + _bornLost + ")");
      try {
        if (typeof WGXDebugLabels !== "undefined" && WGXDebugLabels.install) WGXDebugLabels.install(device);
      } catch (_) {  }
      const _devHas = function (name) {
        return !!(device.features && device.features.has && device.features.has(name));
      };
      _timestampOk = _canTimestamp && _devHas("timestamp-query");
      POST_HDR_FORMAT = (_canPostHDR && _devHas("rg11b10ufloat-renderable"))
        ? "rg11b10ufloat" : SCENE_FORMAT;
    } catch (e) {
      if (!initActive()) { try { if (device) device.destroy(); } catch (_) {  } return null; }
      return _fail("device request threw: " + ((e && e.message) || e));
    }

    try {
      format = navigator.gpu.getPreferredCanvasFormat();
    } catch (e) {
      try { if (device && typeof device.destroy === "function") device.destroy(); } catch (_) {  }
      return _fail("preferred canvas format threw: " + ((e && e.message) || e));
    }
    if (WGX_LITE && format === "rgba16float") format = "bgra8unorm";

    let _lost = false;
    let _capReq = null;
    function _rejectCapture(reason) {
      const req = _capReq; _capReq = null;
      if (req) req.reject(new Error(reason || "device lost"));
    }
    let _jsStrikes = 0;
    let _okCounted = false;
    const JS_STRIKE_CAP = 3;
    let _outProbeBuf = null, _outProbePending = false, _outProbeN = 0, _outBlack = 0;
    const OUT_PROBE_MAX = 12, OUT_BLACK_CAP = 3, OUT_BLACK_EPS = 0.02;
    let _outProbeOff = false;
    let _capPrefSrc = null; const _capPref = (function readCapturePref() {
      try {
        const s = sessionStorage.getItem("apex26.wgxCapture");
        if (s === "1" || s === "0") { _capPrefSrc = "session"; return s; }
      } catch (_) {  }
      try {
        const s = localStorage.getItem("apex26.wgxCapture");
        if (s === "1" || s === "0") { _capPrefSrc = "local"; return s; }
      } catch (_) {  }
      return null;
    })();
    _outProbeOff = _capPref === "1" || _capPref === "0";
    const _blitForced = _capPref === "1" && (_softAdapter || _capPrefSrc === "session");
    if (_capPref === "1" && !_blitForced) { try { Log.warn("gfx", "WGX: saved SCREENSHOTS=2D BLIT ignored on a hardware adapter (per-frame CPU present); tap it again in SETTINGS for this tab"); } catch (_) {  } }
    const _webdriverSoft = typeof navigator !== "undefined" && !!navigator.webdriver;
    const _softGpu = _capPref === "0" ? false : (_softAdapter || _blitForced || _webdriverSoft);
    if (_softGpu) _outProbeOff = true;
    const _presentFormat = _softGpu ? LDR_FORMAT : format;
    const _sceneProbeOn = !_outProbeOff && !WGX_LITE;
    let _displayCanvas = null, _displayCtx = null, _gpuCanvas = null;
    let softPresentTex = null, softPresentView = null;
    let _softW = 0, _softH = 0;
    let _softImg = null;
    let _softBlitSeq = 0;
    let _softBlitShown = 0;
    let _softDisplayPending = false, _softDisplayEpoch = 0;
    const SOFT_HOLD_MAX_MS = 20000;
    let _softDisplaySince = 0;
    const _softNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
    function _softFrameHeld() {
      return _softGpu && _softDisplayPending && _softNow() - _softDisplaySince <= SOFT_HOLD_MAX_MS;
    }
    let _softSceneGen = 0, _softShownGen = 0;
    let _softLastMaxPx = 0, _softLastSkip = "";
    let _softHold = false;
    try {
      _softHold = typeof sessionStorage !== "undefined" &&
        sessionStorage.getItem("apex26.wgxHoldPresent") === "1";
    } catch (_) {  }
    const _softPresentWaiters = [];
    if (_softGpu && typeof document !== "undefined") {
      _displayCanvas = canvas;
      _gpuCanvas = document.createElement("canvas");
      _gpuCanvas.setAttribute("aria-hidden", "true");
      if (_gpuCanvas.style) {
        _gpuCanvas.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none";
      }
      if (document.body) document.body.appendChild(_gpuCanvas);
      canvas = _gpuCanvas;
      try { Log.info("gfx", "WGX soft-present on"); } catch (_) {  }
    }
    let /** @type {ReturnType<typeof CanvasCssSize.create> | null} */ _cssSizeCache = null, _pageListenersOff = null;
    function _bootFail(reason) {
      try { if (_pageListenersOff) _pageListenersOff(); } catch (_) {  }
      try { if (_cssSizeCache) _cssSizeCache.dispose(); } catch (_) {  }
      try {
        if (_gpuCanvas && _gpuCanvas.parentNode) _gpuCanvas.parentNode.removeChild(_gpuCanvas);
      } catch (_) {  }
      _gpuCanvas = null;
      try { if (softPresentTex) softPresentTex.destroy(); } catch (_) {  }
      softPresentTex = null; softPresentView = null;
      try { if (device && typeof device.destroy === "function") device.destroy(); } catch (_) {  }
      return initActive() ? _fail(reason) : null;
    }
    const _layoutCanvas = (_softGpu && _displayCanvas) ? _displayCanvas : canvas;
    let _cssApplying = false;
    _cssSizeCache = CanvasCssSize.create(_layoutCanvas, {
      settleFrames: 30,
      ignore: () => _cssApplying,
    });
    let _capMuteWarned = false;
    function _wgxEscalate(why, force) {
      if (!initActive()) return;
      if (_outProbeOff && !force) {
        if (!_capMuteWarned) { _capMuteWarned = true; try { Log.warn("gfx", "WGX capture mode — suppressed escalate:", why); } catch (_) {  } }
        return;
      }
      if (_lost) return;
      _lost = true;
      _rejectCapture("renderer unavailable");
      _healReset();
      try { localStorage.setItem("apex26.gfxWgxFail", why); } catch (_) {  }
      try { localStorage.removeItem("apex26.gfxBackendProbe"); } catch (_) {  }
      const _rung = WGX_MINIMAL ? 2 : (WGX_LITE ? 1 : 0);
      if (_rung < 2) {
        const nextRung = String(_rung + 1);
        try {
          localStorage.setItem("apex26.gfxWgxLevel", nextRung);
          localStorage.setItem("apex26.gfxWgxLite", "1");
        } catch (_) {  }
        let armed = false;
        try { armed = localStorage.getItem("apex26.gfxWgxLevel") === nextRung; } catch (_) {  }
        if (armed) {
          try { Log.warn("gfx", "WGX " + why + " — retrying " + (nextRung === "1" ? "slim" : "minimal") + " WebGPU"); } catch (_) {  }
          try { sessionStorage.setItem("apex26.ctxLostNotice", "1"); } catch (_) {  }
          try { location.reload(); } catch (_) {  }
          return;
        }
      }
      _markGlxBound();
      let skipped = false;
      try {
        sessionStorage.setItem("apex26.gfxClaimFail", "1");
        skipped = sessionStorage.getItem("apex26.gfxClaimFail") === "1";
      } catch (_) {  }
      try {
        Log.warn("gfx", "WGX " + why + " — keeping WEBGPU pick" +
          (skipped ? ", this tab falls back to WebGL2" : " (could not arm session skip; not reloading)"));
      } catch (_) {  }
      if (skipped) { try { sessionStorage.setItem("apex26.ctxLostNotice", "1"); } catch (_) {  } try { location.reload(); } catch (_) {  } }
      else { try { localStorage.setItem("apex26.gfxBackendProbe", "webgpu"); } catch (_) {  } }
    }
    function _outputBlackSurrender() {
      _wgxEscalate("runtime output black (GPU drew nothing)");
    }
    function _queueOutputProbe() {
      if (!_sceneProbeOn || _lost || _outProbePending || _outProbeN >= OUT_PROBE_MAX || _drawSlot < 1) return;
      if (_outProbeBuf && _outProbeBuf.mapState !== "unmapped") return;
      if (!sceneTex || !encoder || typeof encoder.copyTextureToBuffer !== "function") return;
      try {
        if (!_outProbeBuf) {
          _outProbeBuf = device.createBuffer({
            size: 256 * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
          });
        }
        const tw = _texW || width, th = _texH || height;
        const cx = Math.max(0, (tw >> 1) - 2), cy = Math.max(0, (th >> 1) - 2);
        encoder.copyTextureToBuffer(
          { texture: sceneTex, origin: [cx, cy, 0] },
          { buffer: _outProbeBuf, bytesPerRow: 256, rowsPerImage: 4 },
          [4, 4, 1]
        );
        _outProbePending = true;
        _outProbeN++;
      } catch (_) {  }
    }
    function _readOutputProbe() {
      if (!_outProbePending || !_outProbeBuf || _outProbeBuf.mapState !== "unmapped") return;
      _outProbePending = false;
      if (typeof _outProbeBuf.mapAsync !== "function") return;
      try {
        _outProbeBuf.mapAsync(GPUMapMode.READ).then(function () {
          try {
            const px = new Uint16Array(_outProbeBuf.getMappedRange().slice(0, 1024));
            const LANES = 16;
            const STRIDE = 128;
            let max = 0;
            for (let r = 0; r < 4; r++) {
              const base = r * STRIDE;
              for (let i = 0; i < LANES && base + i < px.length; i++) {
                if ((i & 3) === 3) continue;
                const f = _f16to32(px[base + i]);
                if (f > max) max = f;
              }
            }
            if (max < OUT_BLACK_EPS) {
              _outBlack++;
              if (_outBlack >= OUT_BLACK_CAP) _outputBlackSurrender();
            } else _outBlack = 0;
          } catch (_) {  }
          try { _outProbeBuf.unmap(); } catch (_) {  }
        }).catch(function () {  });
      } catch (_) {  }
    }
    function _jsStrike(where, e) {
      litPass = null; encoder = null; currentView = null;
      try { if (!_jsStrikes) Log.warn("gfx", "WGX " + where + " failed —", e); } catch (_) {  }
      _jsStrikes++;
      if (_jsStrikes < JS_STRIKE_CAP) return;
      _lost = true;
      _rejectCapture("renderer unavailable");
      _healReset();
      try { localStorage.setItem("apex26.gfxWgxFail", where + " threw: " + ((e && e.message) || e)); } catch (_) {  }
      try { localStorage.removeItem("apex26.gfxBackendProbe"); } catch (_) {  }
      _markGlxBound();
      let skipped = false;
      try {
        sessionStorage.setItem("apex26.gfxClaimFail", "1");
        skipped = sessionStorage.getItem("apex26.gfxClaimFail") === "1";
      } catch (_) {  }
      if (skipped) { try { sessionStorage.setItem("apex26.ctxLostNotice", "1"); } catch (_) {  } try { location.reload(); } catch (_) {  } }
      else {
        try { localStorage.setItem("apex26.gfxBackendProbe", "webgpu"); } catch (_) {  }
      }
    }
    function _lostDetail(info) {
      let d = "";
      try {
        const msg = info && info.message ? String(info.message).replace(/\s+/g, " ").slice(0, 160) : "";
        if (msg) d += ": " + msg;
        const ven = adapter && adapter.info && adapter.info.vendor;
        if (ven) d += "; vendor=" + ven;
      } catch (_) {  }
      return d;
    }
    const _nowMs = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
    let _shownAt = -1e9;
    try {
      let onShown = null, onPageShow = null;
      document.addEventListener("visibilitychange", onShown = function () { if (!document.hidden) _shownAt = _nowMs(); });
      window.addEventListener("pageshow", onPageShow = function (e) { if (e && e.persisted) _shownAt = _nowMs(); });
      _pageListenersOff = function () { document.removeEventListener("visibilitychange", onShown); window.removeEventListener("pageshow", onPageShow); };
    } catch (_) {  }
    device.lost.then(function (info) {
      if (info && info.reason === "destroyed") return;
      if (!initActive()) return;
      let hidden = false;
      try { hidden = !!(typeof document !== "undefined" && document.hidden); } catch (_) {  }
      if (!hidden && _nowMs() - _shownAt < 3000) {
        _lost = true;
        _rejectCapture("renderer unavailable");
        setTimeout(function () { try { location.reload(); } catch (_) {  } }, 300);
        return;
      }
      if (!hidden) {
        try { localStorage.setItem("apex26.envProbeOff", "1"); } catch (_) {  }
        try { localStorage.setItem("apex26.perChunkOff", "1"); } catch (_) {  }
        _wgxEscalate("device lost (" + ((info && info.reason) || "unknown") + _lostDetail(info) + ")", true);
        return;
      }
      _lost = true;
      _rejectCapture("renderer unavailable");
      try { Log.warn("gfx", "WGX device lost while hidden (" + ((info && info.reason) || "unknown") + ") — reload deferred to visibility, rung kept"); } catch (_) {  }
      try {
        const onVisible = function () {
          if (document.hidden) return;
          document.removeEventListener("visibilitychange", onVisible);
          try { location.reload(); } catch (_) {  }
        };
        document.addEventListener("visibilitychange", onVisible);
      } catch (_) {  }
    });

    let _bootError = null;
    let _runtimeReady = false;
    const GPU_ERR_LOG_CAP = 8;
    const GPU_ERR_ESCALATE_CAP = 8;
    const GPU_ERR_ESCALATE_FRAMES = 3;
    let _gpuErrFrames = 0, _gpuErrLastPresent = -1, _presentCount = 0;
    const GPU_ERR_QUIET_FRAMES = 2;
    let _gpuErrRun = 0;
    try {
      const onGpuErr = function (ev) {
        const msg = (ev && ev.error && ev.error.message) || "gpu error";
        if (!_bootError) _bootError = msg;
        if (!_gpuFirstMsg) _gpuFirstMsg = msg;
        _gpuErrors++; _gpuErrRun++;
        if (_gpuErrLastPresent !== _presentCount) { _gpuErrLastPresent = _presentCount; _gpuErrFrames++; }
        if (_gpuErrors <= GPU_ERR_LOG_CAP) {
          try { Log.warn("gfx", "WGX GPU error #" + _gpuErrors + ":", msg); } catch (_) {  }
          if (_gpuErrors === GPU_ERR_LOG_CAP) {
            try { Log.warn("gfx", "WGX: further GPU errors suppressed — read the count from WGX.gpuErrors()"); } catch (_) {  }
          }
        }
        if (_runtimeReady && !_lost && _gpuErrRun >= GPU_ERR_ESCALATE_CAP
            && _gpuErrFrames >= GPU_ERR_ESCALATE_FRAMES) {
          _wgxEscalate("runtime GPU errors (" + _gpuErrRun + " over " + _gpuErrFrames + " frames)");
        }
      };
      if (typeof device.addEventListener === "function") device.addEventListener("uncapturederror", onGpuErr);
      else device.onuncapturederror = onGpuErr;
    } catch (_) {  }

    let width = 0, height = 0, aspect = 1, renderScale = 1;
    let presentW = 0, presentH = 0;
    let spatialUpscale = false;
    try {
      spatialUpscale = typeof DevFlags !== "undefined" && !!DevFlags.get("upscale");
    } catch (_) { spatialUpscale = false; }
    let lastFrame = null;

    const frameData = new Float32Array(FRAME_FLOATS);
    const lightData = new Float32Array(LIGHT_FLOATS);
    const grLightData = new Float32Array(LIGHT_FLOATS);
    const _grSel = [];
    const _grKeepNearest = (total, k) => PostCommon.keepNearest(_grSel, total, k);
    const DRAW_F32_STRIDE = DRAW_STRIDE >> 2;
    const drawRing = new Float32Array(MAX_DRAWS * DRAW_F32_STRIDE);
    const blitData  = new Float32Array(BLIT_BYTES / 4);
    const _TONE_IDS = ["acesA", "acesB", "acesC", "acesD", "acesE", "whitePoint"];
    const _TONE_STANDIN = Object.freeze({ acesA: 2.51, acesB: 0.03, acesC: 2.43, acesD: 0.59, acesE: 0.14, whitePoint: 1 });
    const skyData   = new Float32Array(WGSLChunks.SKY_UNIFORM_BYTES / 4);
    const _vpGpu    = new Float32Array(16);
    const _projZ01  = new Float32Array(16);
    const _viewScratch = new Float32Array(16);
    const _grInvTmp = new Float32Array(16);
    const _instDrawOpts = { _instanced: true };
    const _dynOff = [0];

    let frameViewProj = null, frameEye = null, frameCullDist = 0, frameCullFog = null;
    let framePerChunk = 0, frameAllLights = null, frameRoadChunkLamps = 0, frameAllLightsGen = -1;
    let _tlSrc = null, _tlCapPrev = -1, _tlGen = -1, _tlUpT = -1;
    const TL_VALUES_DT = 1 / 30;
    let _asAL = null, _asX = 0, _asY = 0, _asZ = 0, _asIdx = -1, _asGen = -1;
    let _tlFullPack = null, _tlLoGen = -1;
    const _tlScratch = new Float32Array(TRACK_LIGHT_CAP * 16);
    let frameLights = null, frameNL = 0;
    const _lmSnap = [new Float32Array(MAX_LIGHTS * 4), new Float32Array(MAX_LIGHTS * 4)], _lmSnapN = [0, 0];
    let _lmPass = 0;
    const frameVPGpu = new Float32Array(16);
    const frameInvProjW = new Float32Array(16);
    let frameSunDir = null, frameSunColor = null, frameProjRaw = null,
      frameTune = null,
        frameSunVS = null, frameUpVS = null, frameHaveProj = false, frameTime = 0,
        frameAmbSky = null, frameAmbGround = null;

    let g0Layout, g1Layout, g2Layout, litLayout, litModule, skyModule, blitModule;
    let frameUBO, lightSBO, grLightSBO, drawUBO, blitUBO, skyUBO;
    let trackLightSBO, chunkIdxSBO;
    let frameBindGroup, drawBindGroup, skyBindGroup;
    let skyPipeline, blitPipeline, linearSampler, envCubeSamp;
    const _litPipelines = new Map();
    const _litPending = new WeakMap();
    const _litPipelineKeys = [];
    let _pipeAtFirstPresent = -1;
    let /** @type {ReturnType<typeof WGXShadow.init> | null} */ SHD = null;
    let /** @type {ReturnType<typeof WGXChunked.init> | null} */ CHK = null;
    let /** @type {ReturnType<typeof WGXPost.init> | null} */ PST = null;

    let envCubeView = null, ssrView = null;
    let _ssrReady = false;
    const ENV_SIZE = 64;
    const ENV_LOD_MAX = 2.5;
    const ENV_CULL_M = 150;
    const ENV_FACES = [
      [[ 1, 0, 0], [0, -1, 0]], [[-1, 0, 0], [0, -1, 0]],
      [[ 0, -1, 0], [0, 0, -1]], [[ 0, 1, 0], [0, 0,  1]],
      [[ 0, 0, 1], [0, -1, 0]], [[ 0, 0, -1], [0, -1, 0]],
    ];
    let _envPlaceView = null;
    let envCubeTex = null, envSampleView = null, envFaceViews = null;
    let envDepthTex = null, envDepthView = null;
    let _envFrameBG = null;
    let _activeFrameBG = null;
    let _envProbeLive = false, _envFacesMask = 0;
    let _envEncoder = null;
    let _envFrame = null, _envSvVP = null, _envSvEye = null, _envSvCull = 0;
    const _envView = new Float32Array(16), _envProj = new Float32Array(16),
          _envVP = new Float32Array(16), _envVPGpu = new Float32Array(16), _envInvVP = new Float32Array(16);
    const _envTgt = [0, 0, 0];
    let _bakePlace = null, _bakeTexW = null, lampBakeView = null, _bakeSrcW = null, _bakeOffW = 0;
    let _bakeIdxW = null, lampBakeIdxView = null;
    const _bakeShScr = [0, 0, 0];
    function _halfTexW(w, h, data) {
      const tex = device.createTexture({ size: [w, h], format: "rgba16float",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
      try { device.queue.writeTexture({ texture: tex }, data, { bytesPerRow: w * 8, rowsPerImage: h }, { width: w, height: h }); }
      catch (e) { tex.destroy(); throw e; }
      return tex;
    }
    function _syncLampBake(lb) {
      if (!lb || lb === _bakeSrcW || !lb.data || !lb.indir) return;
      let tex = null, idx = null;
      const oldView = lampBakeView, oldIdxView = lampBakeIdxView;
      try {
        tex = _halfTexW(lb.atlasW, lb.atlasH * 2, lb.data);
        idx = _halfTexW(lb.tilesX, lb.tilesY, lb.indir);
        lampBakeView = tex.createView(); lampBakeIdxView = idx.createView();
        _rebuildFrameBG();
      } catch (e) {
        lampBakeView = oldView; lampBakeIdxView = oldIdxView;
        if (tex) tex.destroy(); if (idx) idx.destroy();
        throw e;
      }
      const old = _bakeTexW, oldIdx = _bakeIdxW;
      _bakeTexW = tex; _bakeIdxW = idx; _bakeSrcW = lb;
      if (old) _retiredBufs.push(old);
      if (oldIdx) _retiredBufs.push(oldIdx);
    }
    function _freeLampBake() {
      const old = _bakeTexW, oldIdx = _bakeIdxW;
      _bakeTexW = null; lampBakeView = _bakePlace.createView(); _bakeSrcW = null;
      _bakeIdxW = null; lampBakeIdxView = _bakePlace.createView();
      _rebuildFrameBG();
      _retiredBufs.push(old);
      if (oldIdx) _retiredBufs.push(oldIdx);
    }
    let matPlaceTex = null;
    let matAlbedoView = null, matNormalView = null, matArraySamp = null;
    let matPlaceAlbedoView = null, matPlaceNormalView = null;
    let _matOwnedAlbedo = null, _matOwnedNormal = null;
    let _matBindGen = 0, _matPendingFills = 0, _matPendingBinds = 0;
    let _matRequested = new Set();
    let matScaleUBO = null, matScaleData = new Float32Array(20);
    let _matAlbedoOn = false, _matNormalOn = false;
    const _matScales = new Float32Array(MAT_TEX_LAYERS);
    let _msaaCount = MSAA_COUNT, _passSamples = 1;
    let sceneMSTex = null, sceneMSView = null, depthMSTex = null, depthMSView = null;
    let pDepthResolve = null, depthResolveBG = null;
    let _gpuTimerOn = false, _gpuMs = -1, _gpuQuerySet = null, _gpuResolveBuf = null, _gpuReadBuf = null;
    let _gpuTimerEpoch = 0, _gpuFrameTimerEpoch = -1;
    let _gpuSamples = 0, _gpuSampleAt = -1;
    let identInstanceBuf = null, zeroAttrBG = null, _roadLutBG = null, _roadLutReady = false;
    let pParticle = null, pParticleAdd = null, particleBGL = null;
    let particleUBO = [null, null], particleVBO = [null, null], _particleCap = [0, 0];
    let _particleBG = [null, null], _particleFlip = 0;
    const _particleLast = [null, null];
    const _retiredBufs = [];
    let skyPipelineMS = null;


    let _dirtView = null;

    let sceneTex = null, depthTex = null, sceneView = null, depthView = null,
        depthSampleView = null, blitBindGroup = null, _texW = 0, _texH = 0,
        _targetRetryAt = 0, _targetRetryW = 0, _targetRetryH = 0, _targetFails = 0;

    let _postReady = false, _fxReady = false, _cfgWarned = false;
    let ssaoTex = null, ssaoView = null, godrayTex = null, godrayView = null,
        ssaoBlurTex = null, ssaoBlurView = null, godrayBlurTex = null, godrayBlurView = null,
        ldrTex = null, ldrView = null, ssrTex = null,
        aaTex = null, aaView = null;
    let _aaW = 0, _aaH = 0;
    let bloomLv = [];
    let bloomDownUBO = [], bloomUpUBO = [], bloomDownBG = [], bloomUpBG = [];
    let ssaoUBO, godrayUBO, compositeUBO, fxaaUBO, ssrUBO, blurUBO, sgsrUBO;
    let ssaoBG = null, godrayBG = null, compositeBG = null, fxaaBG = null, ssrBG = null, sgsrBG = null;
    let ssaoBlurSrcBG = null, ssaoBlurDstBG = null, godrayBlurSrcBG = null, godrayBlurDstBG = null;
    let pBloomDown, pBloomUp, pSSAO, pBlur, pBlurHDR, pGodray, pComposite, pFXAA, pFXAALdr, pSGSR, pointSampler, pSSR;
    let _sgsrGather = false, _sgsrTried = false;
    let _blurBGL = null, _blurStride = 256, _blurSlots = 16, _blurWriteSlot = 0;
    const postScratch = new Float32Array(80);

    let quadFxVBO = null, quadFxUBO = null, quadFxBG = null, fxQuadLayout = null;
    let pBlob = null, pMark = null;
    let pSkid = null, skidUBO = null, skidFxBG = null, skidVBO = null,
        _skidCap = 0, _skidScratch = null;
    let pLine = null, lineUBO = null, lineFxBG = null, lineVBO = null, _lineCap = 0;
    const LINE_COLS_F1 = [0.10, 0.95, 0.35, 1.00, 0.72, 0.10, 1.00, 0.12, 0.10];
    const _lineU = new Float32Array(36);
    let pGlow = null, glowUBO = null, glowFxBG = null, glowVBO = null,
        _glowCap = 0, _glowScratch = null;
    let pDecal = null, decalUBO = null, fxDecalLayout = null;
    let pGlass = null;
    let _fxQuadSlot = 0, _fxDecalSlot = 0, _fxQuadOverflow = 0;
    const FX_QUAD_SLOTS = 64, FX_DECAL_SLOTS = 128, FX_STRIDE = 256;
    const FX_F32_STRIDE = FX_STRIDE >> 2;
    const quadFxRing = new Float32Array(FX_QUAD_SLOTS * FX_F32_STRIDE);
    const decalFxRing = new Float32Array(FX_DECAL_SLOTS * FX_F32_STRIDE), _DECAL_SUN = [1, 0.95, 0.9], _DECAL_ASKY = [0.3, 0.32, 0.36], _DECAL_AGR = [0.2, 0.19, 0.18];
    const _fxQuadDynOff = [0], _fxDecalDynOff = [0];
    const fxScratch = new Float32Array(56);
    const _particleFrame = { sun: [1, 0.98, 0.9], ambSky: [0.3, 0.32, 0.36], ambGround: [0.2, 0.19, 0.18], fogColor: [0.5, 0.6, 0.7], fogDensity: 0 };
    const _glowCorners = [[-1, 0], [1, 0], [1, 1], [-1, 0], [1, 1], [-1, 1]];

    try {
      linearSampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
      try {
        envCubeSamp = device.createSampler({
          magFilter: "linear", minFilter: "linear", mipmapFilter: "linear",
          maxAnisotropy: 4,
        });
      } catch (_) {
        envCubeSamp = device.createSampler({
          magFilter: "linear", minFilter: "linear", mipmapFilter: "linear",
        });
      }



      SHD = WGXShadow.init({
        get device() { return device; },
        get lost() { return _lost; },
        DEPTH_FORMAT, SCENE_FORMAT, IDENT, Z01,
        SHADOW_VERTEX_LAYOUT, SHADOW_INSTANCE_LAYOUT,
        WGX_LITE, IS_MOBILE, MOBILE_TIER,
        SHADOW_SLOTS,
        mul4: _mul4,
        get setVB0() { return _setVB0; },
        get setVB1() { return _setVB1; },
        get drawGeom() { return _drawGeom; },
        get identInstanceBuf() { return identInstanceBuf; },
        get chunkFirstIndex() { return _chunkFirstIndex; },
        get fcPlanes() { return _fcPlanes; },
        get fcPlanesIsFrame() { return _fcPlanesIsFrame; },
        set fcPlanesIsFrame(v) { _fcPlanesIsFrame = v; },
      });

      CHK = WGXChunked.init({
        get device() { return device; },
        get lost() { return _lost; },
        get litPass() { return litPass; },
        get activeFrameBG() { return _activeFrameBG; },
        get frameViewProj() { return frameViewProj; },
        get frameEye() { return frameEye; },
        get frameCullDist() { return frameCullDist; },
        get frameCullFog() { return frameCullFog; },
        get framePerChunk() { return framePerChunk; },
        get frameAllLights() { return frameAllLights; },
        get frameRoadChunkLamps() { return frameRoadChunkLamps; },
        get frameNL() { return frameNL; },
        get lampPass() { return _lmPass; },
        get frameLights() { return frameLights; },
        get drawRing() { return drawRing; },
        get drawBindGroup() { return drawBindGroup; },
        get chunkIdxSBO() { return chunkIdxSBO; },
        get identInstanceBuf() { return identInstanceBuf; },
        get roadLutBG() { return _roadLutBG; },
        setRoadLutBG(v) { _roadLutBG = v; },
        setRoadLutReady(v) { _roadLutReady = v; },
        get fcPlanes() { return _fcPlanes; },
        get fcPlanesIsFrame() { return _fcPlanesIsFrame; },
        set fcPlanesIsFrame(v) { _fcPlanesIsFrame = v; },
        MAX_DRAWS, DRAW_STRIDE, DRAW_F32_STRIDE, CHUNK_IDX_CAP, LAMP_MASK_ALL,
        VERTEX_FLOATS, VERTEX_STRIDE,
        toF32, createMesh,
        freeBuf: _freeBuf,
        get mkBuffer() { return _mkBuffer; },
        get interleave() { return _interleave; },
        get expandPull() { return _expandPull; },
        get makeRoadLUT() { return _makeRoadLUT; },
        get rememberRoadLut() { return _rememberRoadLut; },
        get allocFail() { return _allocFail; },
        get attrOrZero() { return _attrOrZero; },
        get writeDraw() { return _writeDraw; },
        get drawGeom() { return _drawGeom; },
        get litOpts() { return _litOpts; },
        get setPipe() { return _setPipe; },
        get setBG0() { return _setBG0; },
        get bindLitVerts() { return _bindLitVerts; },
        get litPipeline() { return _litPipeline; },
        get dynOff() { return _dynOff; },
        allocDrawSlot() {
          if (_drawSlot >= MAX_DRAWS) return -1;
          return _drawSlot++;
        },
      });


      const _envPlace = device.createTexture({ size: [1, 1, 6], dimension: "2d",
        format: SCENE_FORMAT, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT });
      _envPlaceView = _envPlace.createView({ dimension: "cube" });
      envCubeView = _envPlaceView;
      const _ssrPlace = device.createTexture({ size: [1, 1], format: SCENE_FORMAT,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT });
      ssrView = _ssrPlace.createView();

      _dirtView = _makeDirtView();

      g0Layout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: "uniform" } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT,
            buffer: { type: "read-only-storage" } },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: "depth" } },
          { binding: 3, visibility: GPUShaderStage.FRAGMENT,
            sampler: { type: "comparison" } },
          { binding: 4, visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: "float", viewDimension: "cube" } },
          { binding: 5, visibility: GPUShaderStage.FRAGMENT,
            sampler: { type: "filtering" } },
          { binding: 6, visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: "float" } },
          { binding: 7, visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: "unfilterable-float" } },
          { binding: 8, visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: "depth" } },
          { binding: 9, visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: "float", viewDimension: "2d-array" } },
          { binding: 10, visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: "float", viewDimension: "2d-array" } },
          { binding: 11, visibility: GPUShaderStage.FRAGMENT,
            sampler: { type: "filtering" } },
          { binding: 12, visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: "depth" } },
          { binding: 13, visibility: GPUShaderStage.FRAGMENT,
            buffer: { type: "uniform" } },
          { binding: 14, visibility: GPUShaderStage.FRAGMENT,
            sampler: { type: "filtering" } },
          { binding: 15, visibility: GPUShaderStage.FRAGMENT,
            buffer: { type: "read-only-storage" } },
          { binding: 16, visibility: GPUShaderStage.FRAGMENT,
            buffer: { type: "read-only-storage" } },
          { binding: 17, visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: "float" } },
          { binding: 18, visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: "float" } },
        ],
      });
      g1Layout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: DRAW_USED_BYTES } },
        ],
      });
      g2Layout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: "read-only-storage", minBindingSize: 16 } },
        ],
      });
      litLayout = device.createPipelineLayout({ bindGroupLayouts: [g0Layout, g1Layout, g2Layout] });

      litModule  = device.createShaderModule({ code: WGSLChunks.LIT });
      skyModule  = device.createShaderModule({ code: WGSLChunks.SKY });
      blitModule = device.createShaderModule({ code: WGSLChunks.BLIT });

      frameUBO = device.createBuffer({ size: FRAME_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      lightSBO = device.createBuffer({ size: LIGHT_BYTES, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      grLightSBO = device.createBuffer({ size: LIGHT_BYTES, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      trackLightSBO = device.createBuffer({ size: TRACK_LIGHT_CAP * LIGHT_STRIDE, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      chunkIdxSBO = device.createBuffer({ size: CHUNK_IDX_CAP * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      _bakePlace = device.createTexture({ size: [1, 1], format: "rgba16float",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
      lampBakeView = _bakePlace.createView(); lampBakeIdxView = _bakePlace.createView(); _bakeSrcW = null;
      drawUBO  = device.createBuffer({ size: MAX_DRAWS * DRAW_STRIDE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      blitUBO  = device.createBuffer({ size: BLIT_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      skyUBO   = device.createBuffer({ size: WGSLChunks.SKY_UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

      drawBindGroup = device.createBindGroup({
        layout: g1Layout,
        entries: [{ binding: 0, resource: { buffer: drawUBO, offset: 0, size: DRAW_USED_BYTES } }],
      });

      const skyBGL = device.createBindGroupLayout({ entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" } },
      ] });
      const skyLayout = device.createPipelineLayout({ bindGroupLayouts: [skyBGL] });
      skyPipeline = device.createRenderPipeline({
        layout: skyLayout,
        vertex: { module: skyModule, entryPoint: "vs_main" },
        fragment: { module: skyModule, entryPoint: "fs_main", targets: [{ format: SCENE_FORMAT }] },
        primitive: { topology: "triangle-list" },
        depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "less-equal" },
      });
      if (MSAA_COUNT > 1) {
        skyPipelineMS = device.createRenderPipeline({
          layout: skyLayout,
          vertex: { module: skyModule, entryPoint: "vs_main" },
          fragment: { module: skyModule, entryPoint: "fs_main", targets: [{ format: SCENE_FORMAT }] },
          primitive: { topology: "triangle-list" },
          depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "less-equal" },
          multisample: { count: MSAA_COUNT },
        });
      }
      skyBindGroup = device.createBindGroup({
        layout: skyBGL,
        entries: [{ binding: 0, resource: { buffer: skyUBO } }],
      });

      blitPipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: { module: blitModule, entryPoint: "vs_main" },
        fragment: { module: blitModule, entryPoint: "fs_main", targets: [{ format: _presentFormat }] },
        primitive: { topology: "triangle-list" },
      });

      matPlaceTex = device.createTexture({
        size: [1, 1, MAT_TEX_LAYERS], format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      {
        const bpr = 256;
        const placePx = new Uint8Array(bpr * MAT_TEX_LAYERS);
        for (let i = 0; i < MAT_TEX_LAYERS; i++) {
          placePx[i * bpr] = placePx[i * bpr + 1] = placePx[i * bpr + 2] = 128;
          placePx[i * bpr + 3] = 255;
        }
        device.queue.writeTexture(
          { texture: matPlaceTex }, placePx,
          { bytesPerRow: bpr, rowsPerImage: 1 }, [1, 1, MAT_TEX_LAYERS]);
      }
      matPlaceAlbedoView = matPlaceTex.createView({ dimension: "2d-array" });
      matPlaceNormalView = matPlaceAlbedoView;
      matAlbedoView = matPlaceAlbedoView;
      matNormalView = matPlaceNormalView;
      const _matSampDesc = {
        magFilter: "linear", minFilter: "linear", mipmapFilter: "linear",
        addressModeU: "repeat", addressModeV: "repeat",
      };
      try {
        matArraySamp = device.createSampler(Object.assign({ maxAnisotropy: 4 }, _matSampDesc));
      } catch (_) {
        matArraySamp = device.createSampler(_matSampDesc);
      }
      matScaleUBO = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(matScaleUBO, 0, matScaleData);
      const _ident = new Float32Array(20);
      _ident[0] = _ident[5] = _ident[10] = _ident[15] = 1;
      _ident[16] = _ident[17] = _ident[18] = 1;
      identInstanceBuf = _mkBuffer(_ident, GPUBufferUsage.VERTEX);
      zeroAttrBG = device.createBindGroup({
        layout: g2Layout,
        entries: [{ binding: 0, resource: { buffer: _mkBuffer(new Float32Array(128), GPUBufferUsage.STORAGE) } }],
      });
      if (_timestampOk) {
        try {
          _gpuQuerySet = device.createQuerySet({ type: "timestamp", count: 2 });
          _gpuResolveBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
          _gpuReadBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        } catch (_) { _timestampOk = false;  }
      }


      _rebuildFrameBG();
      if (MSAA_COUNT > 1 && _Chunks.DEPTH_RESOLVE) {
        const drG0 = device.createBindGroupLayout({ entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth", multisampled: true } },
        ] });
        const drMod = device.createShaderModule({ code: _Chunks.DEPTH_RESOLVE });
        pDepthResolve = device.createRenderPipeline({
          layout: device.createPipelineLayout({ bindGroupLayouts: [drG0] }),
          vertex: { module: drMod, entryPoint: "vs_main" },
          fragment: { module: drMod, entryPoint: "fs_main", targets: [] },
          primitive: { topology: "triangle-list" },
          depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: "always" },
        });
      }
    } catch (e) {
      return _bootFail("init threw: " + ((e && e.message) || e));
    }

    const _UCD = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
    const ALPHA_BLEND = {
      color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
      alpha: { srcFactor: "one",       dstFactor: "one-minus-src-alpha", operation: "add" },
    };
    const PREMUL_BLEND = {
      color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
      alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
    };
    const ADD_BLEND = {
      color: { srcFactor: "one", dstFactor: "one", operation: "add" },
      alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
    };
    const fsPipe = (code, fmt, blend) => {
      const mod = device.createShaderModule({ code });
      const target = blend ? { format: fmt, blend } : { format: fmt };
      return device.createRenderPipeline({
        layout: "auto",
        vertex: { module: mod, entryPoint: "vs_main" },
        fragment: { module: mod, entryPoint: "fs_main", targets: [target] },
        primitive: { topology: "triangle-list" },
      });
    };
    function _buildPost() {
      if (PST) PST.buildPost();
    }

    function _ensureSpatial() {
      return PST ? PST.ensureSpatial() : false;
    }

    function _buildFx() {
      if (!_Fx) return;
      try {
        const quad = new Float32Array([-0.5,-0.5, 0.5,-0.5, 0.5,0.5, -0.5,-0.5, 0.5,0.5, -0.5,0.5]);
        quadFxVBO = _mkBuffer(quad, GPUBufferUsage.VERTEX);
        const quadVL = { arrayStride: _Fx.QUAD_VERTEX_BYTES,
          attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] };
        fxQuadLayout = device.createBindGroupLayout({
          entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: _Fx.BLOB_SHADOW_UNIFORM_BYTES } }],
        });
        quadFxUBO = device.createBuffer({ size: FX_QUAD_SLOTS * FX_STRIDE, usage: _UCD });
        quadFxBG = device.createBindGroup({ layout: fxQuadLayout,
          entries: [{ binding: 0, resource: { buffer: quadFxUBO, offset: 0, size: _Fx.BLOB_SHADOW_UNIFORM_BYTES } }] });
        const _fxMS = MSAA_COUNT > 1 ? { multisample: { count: MSAA_COUNT } } : {};
        const stampPipe = (code) => {
          const mod = device.createShaderModule({ code });
          return device.createRenderPipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [fxQuadLayout] }),
            vertex: { module: mod, entryPoint: "vs_main", buffers: [quadVL] },
            fragment: { module: mod, entryPoint: "fs_main", targets: [{ format: SCENE_FORMAT, blend: ALPHA_BLEND }] },
            primitive: { topology: "triangle-list", cullMode: "none" },
            depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "less-equal",
              depthBias: -2, depthBiasSlopeScale: -2, depthBiasClamp: 0 },
            ..._fxMS,
          });
        };
        pBlob = stampPipe(_Fx.BLOB_SHADOW);
        pMark = stampPipe(_Fx.MARK);

        const skidMod = device.createShaderModule({ code: _Fx.SKID });
        pSkid = device.createRenderPipeline({
          layout: "auto",
          vertex: { module: skidMod, entryPoint: "vs_main", buffers: [{ arrayStride: _Fx.SKID_VERTEX_BYTES,
            attributes: [
              { shaderLocation: 0, offset: 0,  format: "float32x3" },
              { shaderLocation: 1, offset: 12, format: "float32x2" },
              { shaderLocation: 2, offset: 20, format: "float32x4" },
            ] }] },
          fragment: { module: skidMod, entryPoint: "fs_main", targets: [{ format: SCENE_FORMAT, blend: ALPHA_BLEND }] },
          primitive: { topology: "triangle-list", cullMode: "none" },
          depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "less-equal",
            depthBias: -2, depthBiasSlopeScale: -2, depthBiasClamp: 0 },
          ..._fxMS,
        });
        skidUBO = device.createBuffer({ size: _Fx.SKID_UNIFORM_BYTES, usage: _UCD });
        skidFxBG = device.createBindGroup({ layout: pSkid.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: skidUBO } }] });

        const lineMod = device.createShaderModule({ code: _Fx.LINE });
        pLine = device.createRenderPipeline({
          layout: "auto",
          vertex: { module: lineMod, entryPoint: "vs_main", buffers: [{ arrayStride: _Fx.LINE_VERTEX_BYTES,
            attributes: [
              { shaderLocation: 0, offset: 0,  format: "float32x3" },
              { shaderLocation: 1, offset: 12, format: "float32" },
              { shaderLocation: 2, offset: 16, format: "float32" },
              { shaderLocation: 3, offset: 20, format: "float32" },
              { shaderLocation: 4, offset: 24, format: "float32" },
            ] }] },
          fragment: { module: lineMod, entryPoint: "fs_main", targets: [{ format: SCENE_FORMAT, blend: ALPHA_BLEND }] },
          primitive: { topology: "triangle-strip", cullMode: "none" },
          depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "less-equal",
            depthBias: -2, depthBiasSlopeScale: -2, depthBiasClamp: 0 },
          ..._fxMS,
        });
        lineUBO = device.createBuffer({ size: _Fx.LINE_UNIFORM_BYTES, usage: _UCD });
        lineFxBG = device.createBindGroup({ layout: pLine.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: lineUBO } }] });

        const glowMod = device.createShaderModule({ code: _Fx.GLOW });
        pGlow = device.createRenderPipeline({
          layout: "auto",
          vertex: { module: glowMod, entryPoint: "vs_main", buffers: [{ arrayStride: _Fx.GLOW_VERTEX_BYTES,
            attributes: [
              { shaderLocation: 0, offset: 0,  format: "float32x2" },
              { shaderLocation: 1, offset: 8,  format: "float32x3" },
              { shaderLocation: 2, offset: 20, format: "float32x3" },
              { shaderLocation: 3, offset: 32, format: "float32" },
            ] }] },
          fragment: { module: glowMod, entryPoint: "fs_main", targets: [{
            format: SCENE_FORMAT, blend: ADD_BLEND,
            writeMask: GPUColorWrite.RED | GPUColorWrite.GREEN | GPUColorWrite.BLUE,
          }] },
          primitive: { topology: "triangle-list", cullMode: "none" },
          depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "less-equal" },
          ..._fxMS,
        });
        glowUBO = device.createBuffer({ size: _Fx.GLOW_UNIFORM_BYTES, usage: _UCD });
        glowFxBG = device.createBindGroup({ layout: pGlow.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: glowUBO } }] });

        fxDecalLayout = device.createBindGroupLayout({
          entries: [
            { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
              buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: _Fx.DECAL_UNIFORM_BYTES } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
            { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
          ],
        });
        const decalMod = device.createShaderModule({ code: _Fx.DECAL });
        pDecal = device.createRenderPipeline({
          layout: device.createPipelineLayout({ bindGroupLayouts: [fxDecalLayout, g0Layout] }),
          vertex: { module: decalMod, entryPoint: "vs_main", buffers: [{ arrayStride: _Fx.DECAL_VERTEX_BYTES,
            attributes: [
              { shaderLocation: 0, offset: 0,  format: "float32x3" },
              { shaderLocation: 1, offset: 12, format: "float32x3" },
              { shaderLocation: 2, offset: 24, format: "float32x2" },
            ] }] },
          fragment: { module: decalMod, entryPoint: "fs_main", targets: [{
            format: SCENE_FORMAT, blend: PREMUL_BLEND,
            writeMask: GPUColorWrite.RED | GPUColorWrite.GREEN | GPUColorWrite.BLUE,
          }] },
          primitive: { topology: "triangle-list", cullMode: "none" },
          depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "less-equal" },
          ..._fxMS,
        });
        try {
          pGlass = device.createRenderPipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [fxDecalLayout] }),
            vertex: { module: decalMod, entryPoint: "vs_main", buffers: [{ arrayStride: _Fx.DECAL_VERTEX_BYTES,
              attributes: [
                { shaderLocation: 0, offset: 0,  format: "float32x3" },
                { shaderLocation: 1, offset: 12, format: "float32x3" },
                { shaderLocation: 2, offset: 24, format: "float32x2" },
              ] }] },
            fragment: { module: decalMod, entryPoint: "fs_glass", targets: [{ format: SCENE_FORMAT, writeMask: GPUColorWrite.ALL }] },
            primitive: { topology: "triangle-list", cullMode: "none" },
            depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: "less-equal" },
            ..._fxMS,
          });
        } catch (_) { pGlass = null; }
        decalUBO = device.createBuffer({ size: FX_DECAL_SLOTS * FX_STRIDE, usage: _UCD });
        if (_Fx.PARTICLE) {
          const pMod = device.createShaderModule({ code: _Fx.PARTICLE });
          const pVert = { module: pMod, entryPoint: "vs_main", buffers: [{ arrayStride: _Fx.PARTICLE_VERTEX_BYTES,
            attributes: [
              { shaderLocation: 0, offset: 0,  format: "float32x2" },
              { shaderLocation: 1, offset: 8,  format: "float32x3" },
              { shaderLocation: 2, offset: 20, format: "float32x3" },
              { shaderLocation: 3, offset: 32, format: "float32" },
              { shaderLocation: 4, offset: 36, format: "float32" },
            ] }] };
          const pPrim = { topology: "triangle-list", cullMode: "none" };
          const pDepth = { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "less-equal" };
          particleBGL = device.createBindGroupLayout({ entries: [
            { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
              buffer: { type: "uniform" } },
          ] });
          const pLayout = device.createPipelineLayout({ bindGroupLayouts: [particleBGL] });
          const pMask = GPUColorWrite.RED | GPUColorWrite.GREEN | GPUColorWrite.BLUE;
          pParticle = device.createRenderPipeline({
            layout: pLayout,
            vertex: pVert,
            fragment: { module: pMod, entryPoint: "fs_main", targets: [{ format: SCENE_FORMAT, blend: ALPHA_BLEND, writeMask: pMask }] },
            primitive: pPrim,
            depthStencil: pDepth,
            ..._fxMS,
          });
          pParticleAdd = device.createRenderPipeline({
            layout: pLayout,
            vertex: pVert,
            fragment: { module: pMod, entryPoint: "fs_main", targets: [{ format: SCENE_FORMAT, blend: ADD_BLEND, writeMask: pMask }] },
            primitive: pPrim,
            depthStencil: pDepth,
            ..._fxMS,
          });
          particleUBO[0] = device.createBuffer({ size: _Fx.PARTICLE_UNIFORM_BYTES, usage: _UCD });
          particleUBO[1] = device.createBuffer({ size: _Fx.PARTICLE_UNIFORM_BYTES, usage: _UCD });
          _particleBG[0] = device.createBindGroup({
            layout: particleBGL,
            entries: [{ binding: 0, resource: { buffer: particleUBO[0] } }],
          });
          _particleBG[1] = device.createBindGroup({
            layout: particleBGL,
            entries: [{ binding: 0, resource: { buffer: particleUBO[1] } }],
          });
        }
        _fxReady = true;
      } catch (_) { _fxReady = false;  }
    }
    PST = WGXPost.init({
      get device() { return device; },
      get presentFormat() { return _presentFormat; },
      get Post() { return _Post; },
      POST_HDR_FORMAT, SCENE_FORMAT, SSAO_FORMAT, LDR_FORMAT,
      WGX_MINIMAL, WGX_LITE,
      get UCD() { return _UCD; },
      get ADD_BLEND() { return ADD_BLEND; },
      get fsPipe() { return fsPipe; },
      get pBloomDown() { return pBloomDown; }, set pBloomDown(v) { pBloomDown = v; },
      get pBloomUp() { return pBloomUp; }, set pBloomUp(v) { pBloomUp = v; },
      get pSSAO() { return pSSAO; }, set pSSAO(v) { pSSAO = v; },
      get pSSR() { return pSSR; }, set pSSR(v) { pSSR = v; },
      get pGodray() { return pGodray; }, set pGodray(v) { pGodray = v; },
      get pBlur() { return pBlur; }, set pBlur(v) { pBlur = v; },
      get pBlurHDR() { return pBlurHDR; }, set pBlurHDR(v) { pBlurHDR = v; },
      get pComposite() { return pComposite; }, set pComposite(v) { pComposite = v; },
      get pFXAA() { return pFXAA; }, set pFXAA(v) { pFXAA = v; },
      get pFXAALdr() { return pFXAALdr; }, set pFXAALdr(v) { pFXAALdr = v; },
      get pSGSR() { return pSGSR; }, set pSGSR(v) { pSGSR = v; },
      get pointSampler() { return pointSampler; }, set pointSampler(v) { pointSampler = v; },
      get ssaoUBO() { return ssaoUBO; }, set ssaoUBO(v) { ssaoUBO = v; },
      get blurUBO() { return blurUBO; }, set blurUBO(v) { blurUBO = v; },
      get godrayUBO() { return godrayUBO; }, set godrayUBO(v) { godrayUBO = v; },
      get compositeUBO() { return compositeUBO; }, set compositeUBO(v) { compositeUBO = v; },
      get fxaaUBO() { return fxaaUBO; }, set fxaaUBO(v) { fxaaUBO = v; },
      get ssrUBO() { return ssrUBO; }, set ssrUBO(v) { ssrUBO = v; },
      get sgsrUBO() { return sgsrUBO; }, set sgsrUBO(v) { sgsrUBO = v; },
      get _blurBGL() { return _blurBGL; }, set _blurBGL(v) { _blurBGL = v; },
      get _blurStride() { return _blurStride; }, set _blurStride(v) { _blurStride = v; },
      get _blurSlots() { return _blurSlots; }, set _blurSlots(v) { _blurSlots = v; },
      get _sgsrTried() { return _sgsrTried; }, set _sgsrTried(v) { _sgsrTried = v; },
      get _sgsrGather() { return _sgsrGather; }, set _sgsrGather(v) { _sgsrGather = v; },
      onSpatialReady() { if (!_lost && spatialUpscale) { resize(); _syncSpatialAa(); } },
    });

    if (!WGX_MINIMAL) {
      _buildPost();
      if (spatialUpscale) _ensureSpatial();
    }
    _buildFx();

    function _litPipeline(opts, warm) {
      const blend = !!(opts && opts.alpha !== undefined && opts.alpha < 1);
      const dbl   = !!(opts && opts.doubleSided);
      const noAW  = blend || !!(opts && opts.noAlphaWrite);
      const decal = !!(opts && (opts.decal || opts.noDepthTest || opts.depthCompare === "always"));
      const samples = _passSamples | 0 || 1;
      const db = (opts && opts.depthBias && opts.depthBias.length >= 2) ? opts.depthBias : null;
      const dbC = db ? Math.round(db[1]) : 0;
      const dbS = db ? +db[0] || 0 : 0;
      const flags = (blend ? 1 : 0) | (dbl ? 2 : 0) | (noAW ? 4 : 0) | (decal ? 8 : 0) | (samples << 4);
      let byS = _litPipelines.get(dbC);
      if (!byS) { byS = new Map(); _litPipelines.set(dbC, byS); }
      let byF = byS.get(dbS);
      if (!byF) { byF = new Map(); byS.set(dbS, byF); }
      let p = byF.get(flags);
      if (p) return p;
      if (warm && _litPending.has(byF) && _litPending.get(byF).has(flags)) return null;
      const target = {
        format: SCENE_FORMAT,
        writeMask: noAW
          ? (GPUColorWrite.RED | GPUColorWrite.GREEN | GPUColorWrite.BLUE)
          : GPUColorWrite.ALL,
      };
      if (blend) target.blend = {
        color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
        alpha: { srcFactor: "one",       dstFactor: "one-minus-src-alpha", operation: "add" },
      };
      const depthStencil = {
        format: DEPTH_FORMAT,
        depthWriteEnabled: !blend,
        depthCompare: decal ? "always" : "less-equal",
      };
      if (db) {
        depthStencil.depthBias = dbC;
        depthStencil.depthBiasSlopeScale = dbS;
        depthStencil.depthBiasClamp = 0;
      }
      const desc = {
        layout: litLayout,
        vertex: { module: litModule, entryPoint: "vs_main", buffers: [VERTEX_POS_LAYOUT, INSTANCE_LAYOUT] },
        fragment: { module: litModule, entryPoint: "fs_main", targets: [target] },
        primitive: { topology: "triangle-list", cullMode: dbl ? "none" : "back", frontFace: "cw" },
        depthStencil,
        multisample: { count: samples },
      };
      const key = (blend ? 1 : 0) + "|" + (dbl ? 1 : 0) + "|" + (noAW ? 1 : 0) + "|" + samples
                + "|" + dbC + "|" + dbS + "|" + (decal ? 1 : 0);
      if (warm && device.createRenderPipelineAsync) {
        let pend = _litPending.get(byF);
        if (!pend) { pend = new Set(); _litPending.set(byF, pend); }
        pend.add(flags);
        device.createRenderPipelineAsync(desc).then((ap) => {
          if (_lost || byF.has(flags)) return;
          byF.set(flags, ap);
          _litPipelineKeys.push(key);
        }, () => {  })
          .finally(() => pend.delete(flags));
        return null;
      }
      p = device.createRenderPipeline(desc);
      byF.set(flags, p);
      _litPipelineKeys.push(key);
      return p;
    }

    let _swapCopyable = _capPref != null || (!_outProbeOff && !WGX_LITE);
    let _wantCopyable = false;
    function _configureCanvas() {
      if (!ctx || !device) return null;
      try {
        ctx.configure({
          device, format, alphaMode: "opaque",
          usage: GPUTextureUsage.RENDER_ATTACHMENT | (_swapCopyable ? GPUTextureUsage.COPY_SRC : 0),
        });
        return null;
      } catch (e) {
        return "canvas configure threw: " + ((e && e.message) || e);
      }
    }
    function _ensureSoftPresent() {
      if (!_softGpu || width < 1 || height < 1) return;
      const sw = wantSpatialUpscale() ? presentW : width;
      const sh = wantSpatialUpscale() ? presentH : height;
      if (sw < 1 || sh < 1) return;
      if (softPresentTex && _softW === sw && _softH === sh) return;
      try {
        if (softPresentTex) softPresentTex.destroy();
        softPresentTex = device.createTexture({
          size: [sw, sh], format: LDR_FORMAT,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC |
                 GPUTextureUsage.TEXTURE_BINDING,
        });
        softPresentView = softPresentTex.createView();
        _softW = sw; _softH = sh;
      } catch (e) {
        try { Log.warn("gfx", "WGX soft present target failed —", e); } catch (_) {  }
        softPresentTex = null; softPresentView = null;
      }
    }
    function _acquirePresentView() {
      if (_softGpu) {
        _ensureSoftPresent();
        return softPresentView || null;
      }
      return ctx.getCurrentTexture().createView();
    }
    function _softDisplayEncode() {
      if (!_softGpu || !_displayCtx || !softPresentTex || !encoder) return null;
      if (_softHold || _softDisplayPending) return null;
      let buf = null;
      try {
        const w = _softW || width, h = _softH || height;
        if (w < 2 || h < 2) return null;
        const bpr = (w * 4 + 255) & ~255;
        buf = device.createBuffer({
          size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        encoder.copyTextureToBuffer(
          { texture: softPresentTex },
          { buffer: buf, bytesPerRow: bpr, rowsPerImage: h },
          [w, h, 1]
        );
        _softBlitSeq++;
        _softDisplayPending = true;
        _softDisplaySince = _softNow();
        return { buf, bpr, w, h, seq: _softBlitSeq, epoch: _softDisplayEpoch, sceneGen: _softSceneGen };
      } catch (_) {
        try { if (buf) buf.destroy(); } catch (_) {  }
        return null;
      }
    }
    function _softDisplayFinish(cap) {
      if (!cap) return;
      const { buf, bpr, w, h, seq, epoch, sceneGen } = cap;
      const release = function () { _softDisplayPending = false; };
      if (!_displayCtx) {
        try { buf.destroy(); } catch (_) {  }
        release();
        return;
      }
      const finish = function () {
        try {
          buf.mapAsync(GPUMapMode.READ).then(function () {
            try {
              const src = new Uint8Array(buf.getMappedRange());
              if (epoch === _softDisplayEpoch && seq === _softBlitSeq &&
                  _displayCanvas && _displayCanvas.width === w && _displayCanvas.height === h) {
                let maxPx = 0;
                if (!_softImg || _softImg.width !== w || _softImg.height !== h) {
                  _softImg = _displayCtx.createImageData(w, h);
                }
                const img = _softImg;
                const d = img.data, rowBytes = w * 4;
                for (let y = 0; y < h; y++) d.set(src.subarray(y * bpr, y * bpr + rowBytes), y * rowBytes);
                for (let i = 3; i < d.length; i += 4) d[i] = 255;
                for (let i = 0; i < d.length; i += 64) { const v = d[i] + d[i + 1] + d[i + 2]; if (v > maxPx) maxPx = v; }
                _softLastMaxPx = maxPx;
                if (maxPx >= 8) {
                  _displayCtx.putImageData(img, 0, 0);
                  _softShownGen = sceneGen;
                  _softLastSkip = "";
                  _softBlitNotify(seq);
                } else {
                  _softLastSkip = "dim";
                }
              } else {
                _softLastSkip = epoch !== _softDisplayEpoch ? "epoch"
                  : (seq !== _softBlitSeq ? "seq" : "size");
              }
            } catch (_) {  }
            try { buf.unmap(); buf.destroy(); } catch (_) {  }
            release();
          }, function () {
            try { buf.destroy(); } catch (_) {  }
            release();
          });
        } catch (_) {
          try { buf.destroy(); } catch (_) {  }
          release();
        }
      };
      try {
        device.queue.onSubmittedWorkDone().then(finish, finish);
      } catch (_) { finish(); }
    }
    function _softDisplayAbort(cap) {
      if (!cap) return;
      try { cap.buf.destroy(); } catch (_) {  }
      _softDisplayPending = false;
    }
    function _softBlitNotify(seq) {
      _softBlitShown = seq;
      const keep = [];
      const ws = _softPresentWaiters.splice(0);
      for (let i = 0; i < ws.length; i++) {
        try {
          if (!ws[i](seq)) keep.push(ws[i]);
        } catch (_) {  }
      }
      for (let j = 0; j < keep.length; j++) _softPresentWaiters.push(keep[j]);
    }
    function holdSoftPresent(on) {
      if (on === undefined) return _softHold;
      _softHold = !!on;
      try {
        if (typeof sessionStorage === "undefined") return _softHold;
        if (_softHold) sessionStorage.setItem("apex26.wgxHoldPresent", "1");
        else sessionStorage.removeItem("apex26.wgxHoldPresent");
      } catch (_) {  }
      return _softHold;
    }
    function invalidateSoftPresent() {
      if (!_softGpu) return;
      _softSceneGen++;
    }
    function softPresentState() {
      return {
        seq: _softBlitSeq, shown: _softBlitShown, pending: _softDisplayPending,
        hold: _softHold,
        epoch: _softDisplayEpoch, sceneGen: _softSceneGen, shownGen: _softShownGen,
        lastMaxPx: _softLastMaxPx, lastSkip: _softLastSkip,
        display: _displayCanvas ? [_displayCanvas.width, _displayCanvas.height] : null,
        tex: [_softW, _softH],
      };
    }
    function awaitSoftPresent(timeoutMs) {
      if (!_softGpu || !_displayCtx) return Promise.resolve(_softBlitShown);
      const needGen = _softSceneGen;
      const shown0 = _softBlitShown;
      if (shown0 > 0 && _softShownGen >= needGen) return Promise.resolve(shown0);
      const ms = timeoutMs != null ? timeoutMs : 15000;
      return new Promise(function (resolve, reject) {
        let waiter = null;
        const timer = setTimeout(function () {
          const i = _softPresentWaiters.indexOf(waiter);
          if (i >= 0) _softPresentWaiters.splice(i, 1);
          reject(new Error("awaitSoftPresent timeout after " + ms + " ms"));
        }, ms);
        waiter = function (seq) {
          if (_softShownGen >= needGen || (shown0 === 0 && seq > 0)) {
            try { clearTimeout(timer); } catch (_) {  }
            resolve(seq);
            return true;
          }
          return false;
        };
        _softPresentWaiters.push(waiter);
      });
    }
    function wantSpatialUpscale() {
      return spatialUpscale && renderScale < 0.98 && !!pSGSR;
    }
    function setSpatialUpscale(on) {
      spatialUpscale = !!on;
      if (spatialUpscale) _ensureSpatial();
      resize();
      _syncSpatialAa();
      return spatialUpscale;
    }
    function getSpatialUpscale() { return spatialUpscale; }
    function getSpatialUpscaleGather() { return !!_sgsrGather; }
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, WGX_MINIMAL ? 1 : (WGX_LITE ? 1.5 : 2));
      const maxDim = (device.limits && device.limits.maxTextureDimension2D) || 8192;
      const css = _cssSizeCache.read();
      let pw = Math.max(1, Math.round(css.width * dpr));
      let ph = Math.max(1, Math.round(css.height * dpr));
      if (pw > maxDim || ph > maxDim) {
        const k = Math.min(maxDim / pw, maxDim / ph);
        pw = Math.max(1, Math.floor(pw * k));
        ph = Math.max(1, Math.floor(ph * k));
      }
      if (presentW > 1 && presentH > 1 && Math.abs(pw - presentW) <= 1 && Math.abs(ph - presentH) <= 1) {
        pw = presentW; ph = presentH;
      }
      let rw = Math.max(1, Math.round(pw * renderScale));
      let rh = Math.max(1, Math.round(ph * renderScale));
      if (width > 1 && height > 1 && Math.abs(rw - width) <= 1 && Math.abs(rh - height) <= 1) {
        rw = width; rh = height;
      }
      presentW = pw; presentH = ph;
      const up = wantSpatialUpscale();
      const cw = up ? pw : rw;
      const ch = up ? ph : rh;
      const sizeChanged = canvas.width !== cw || canvas.height !== ch ||
        (_displayCanvas && (_displayCanvas.width !== cw || _displayCanvas.height !== ch));
      if (sizeChanged) {
        _cssApplying = true;
        try {
          _softDisplayEpoch++;
          canvas.width = cw; canvas.height = ch;
          if (ctx) {
            const _cfgErr = _configureCanvas();
            if (_cfgErr) try { if (!_cfgWarned) { _cfgWarned = true; Log.warn("gfx", "WGX canvas configure failed —", _cfgErr); } } catch (_) {  }
            else _cfgWarned = false;
          }
          if (_softGpu && _displayCanvas) {
            _displayCanvas.width = cw;
            _displayCanvas.height = ch;
          }
        } finally {
          _cssApplying = false;
        }
      }
      width = rw; height = rh; aspect = rw / rh;
      if (_softGpu) _ensureSoftPresent();
    }
    function setRenderScale(s) {
      s = Math.max(0.5, Math.min(1, s));
      if (Math.abs(s - renderScale) < 0.02) return false;
      renderScale = s;
      resize();
      _syncSpatialAa();
      return true;
    }

    function _makeFrameBGs(nextSsrView) {
      if (!g0Layout || !frameUBO || !lightSBO || !matScaleUBO) return;
      if (!SHD.shadowView || !SHD.shadowSampler || !linearSampler || !envCubeSamp || !nextSsrView) return;
      if (!SHD.blockerView || !SHD.carShadowView || !SHD.lampShadowView) return;
      if (!matAlbedoView || !matNormalView || !matArraySamp || !lampBakeView || !lampBakeIdxView) return;
      const base = (cubeView) => ({
        layout: g0Layout,
        entries: [
          { binding: 0, resource: { buffer: frameUBO } },
          { binding: 1, resource: { buffer: lightSBO } },
          { binding: 2, resource: SHD.shadowView },
          { binding: 3, resource: SHD.shadowSampler },
          { binding: 4, resource: cubeView },
          { binding: 5, resource: linearSampler },
          { binding: 6, resource: nextSsrView },
          { binding: 7, resource: SHD.blockerView },
          { binding: 8, resource: SHD.carShadowView },
          { binding: 9, resource: matAlbedoView },
          { binding: 10, resource: matNormalView },
          { binding: 11, resource: matArraySamp },
          { binding: 12, resource: SHD.lampShadowView },
          { binding: 13, resource: { buffer: matScaleUBO } },
          { binding: 14, resource: envCubeSamp },
          { binding: 15, resource: { buffer: trackLightSBO } },
          { binding: 16, resource: { buffer: chunkIdxSBO } },
          { binding: 17, resource: lampBakeView },
          { binding: 18, resource: lampBakeIdxView },
        ],
      });
      return {
        main: device.createBindGroup(base(envCubeView)),
        env: device.createBindGroup(base(_envPlaceView || envCubeView)),
      };
    }
    function _rebuildFrameBG() {
      const groups = _makeFrameBGs(ssrView);
      if (!groups) return;
      frameBindGroup = groups.main;
      _envFrameBG = groups.env;
      if (!_activeFrameBG || _activeFrameBG !== _envFrameBG) _activeFrameBG = frameBindGroup;
    }

    function _destroyTargetSet(t) {
      if (!t) return;
      const textures = [t.sceneTex, t.depthTex, t.ssaoTex, t.godrayTex, t.ldrTex, t.ssrTex,
        t.ssaoBlurTex, t.godrayBlurTex, t.sceneMSTex, t.depthMSTex, t.aaTex];
      for (let i = 0; i < textures.length; i++) if (textures[i]) textures[i].destroy();
      const levels = t.bloomLv || [];
      for (let i = 0; i < levels.length; i++) levels[i].tex.destroy();
      const buffers = (t.bloomDownUBO || []).concat(t.bloomUpUBO || []);
      for (let i = 0; i < buffers.length; i++) buffers[i].destroy();
    }

    function _syncSpatialAa() {
      if (!device || width < 1 || height < 1) return;
      const wantUp = !!(pSGSR && sgsrUBO && wantSpatialUpscale());
      if (wantUp) {
        if (aaTex && aaView && sgsrBG && _aaW === width && _aaH === height) return;
        try {
          if (aaTex) { try { aaTex.destroy(); } catch (_) {  } aaTex = null; aaView = null; }
          aaTex = device.createTexture({
            size: [width, height], format: LDR_FORMAT,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
          });
          aaView = aaTex.createView();
          _aaW = width; _aaH = height;
          sgsrBG = device.createBindGroup({
            layout: pSGSR.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: aaView },
              { binding: 1, resource: linearSampler },
              { binding: 2, resource: { buffer: sgsrUBO } },
            ],
          });
        } catch (_) {
          try { if (aaTex) aaTex.destroy(); } catch (_) {  }
          aaTex = null; aaView = null; sgsrBG = null; _aaW = 0; _aaH = 0;
        }
      } else if (aaTex || sgsrBG) {
        try { if (aaTex) aaTex.destroy(); } catch (_) {  }
        aaTex = null; aaView = null; sgsrBG = null; _aaW = 0; _aaH = 0;
      }
    }

    let _pendingTargets = null;
    function _scopedTargets(next) {
      const p = { next, w: width, h: height, state: "wait" };
      _pendingTargets = p;
      const vPop = device.popErrorScope(), oPop = device.popErrorScope();
      Promise.all([vPop, oPop]).then(([vErr, oErr]) => {
        const err = vErr || oErr;
        p.state = err ? "bad" : "ok";
        if (err) Log.warn("gfx", "WGX target realloc " + p.w + "x" + p.h + " failed (" + (oErr ? "out-of-memory" : "validation") + "): " + (err.message || err) + " — keeping the previous set");
      }, () => { p.state = "bad"; });
    }
    const TARGET_RETRY_MAX = 8, TARGET_RETRY_CAP_MS = 30000;
    function _targetFailed(w, h) {
      _targetFails = (_targetRetryW === w && _targetRetryH === h) ? _targetFails + 1 : 1;
      _targetRetryW = w; _targetRetryH = h;
      if (_targetFails >= TARGET_RETRY_MAX) {
        _targetRetryAt = Infinity;
        Log.warn("gfx", "WGX target realloc " + w + "x" + h + " failed " + _targetFails + " times — keeping the previous set until the size changes");
      } else _targetRetryAt = Date.now() + Math.min(TARGET_RETRY_CAP_MS, 1000 * 2 ** (_targetFails - 1));
    }
    function ensureTargets() {
      if (width < 1 || height < 1) return;
      if (_pendingTargets) {
        const p = _pendingTargets;
        if (p.state === "wait") return;
        _pendingTargets = null;
        if (p.state === "ok" && p.w === width && p.h === height) { _swapTargets(p.next); return; }
        _destroyTargetSet(p.next);
        if (p.state === "bad") _targetFailed(p.w, p.h);
      }
      if (sceneTex && _texW === width && _texH === height) {
        _syncSpatialAa();
        return;
      }
      if (_targetRetryW === width && _targetRetryH === height && Date.now() < _targetRetryAt) return;
      if (sceneTex && _texW > 0 && _texH > 0 && (_texW * _texH > width * height)) {
        const old = { sceneTex, depthTex, ssaoTex, godrayTex, ldrTex, ssrTex,
          ssaoBlurTex, godrayBlurTex, bloomLv, bloomDownUBO, bloomUpUBO, sceneMSTex, depthMSTex };
        sceneTex = null; depthTex = null; sceneMSTex = null; depthMSTex = null;
        sceneMSView = null; depthMSView = null; depthResolveBG = null;
        sceneView = null; depthView = null; depthSampleView = null; blitBindGroup = null;
        ssaoTex = null; godrayTex = null; ssaoBlurTex = null; godrayBlurTex = null;
        ldrTex = null; ssrTex = null;
        ssaoView = null; godrayView = null; ssaoBlurView = null; godrayBlurView = null;
        ldrView = null;
        bloomLv = []; bloomDownUBO = []; bloomUpUBO = [];
        bloomDownBG = []; bloomUpBG = [];
        ssaoBG = null; ssaoBlurSrcBG = null; ssaoBlurDstBG = null;
        godrayBlurSrcBG = null; godrayBlurDstBG = null;
        godrayBG = null; compositeBG = null; fxaaBG = null; ssrBG = null;
        _postReady = false; _ssrReady = false; _texW = 0; _texH = 0;
        _destroyTargetSet(old);
      }
      const halfW = Math.max(1, width >> 1), halfH = Math.max(1, height >> 1);
      const next = { bloomLv: [], bloomDownUBO: [], bloomUpUBO: [],
        bloomDownBG: [], bloomUpBG: [], postReady: false, ssrReady: false };
      const scoped = !!sceneTex && typeof device.pushErrorScope === "function" &&
                     typeof device.popErrorScope === "function";
      if (scoped) { device.pushErrorScope("out-of-memory"); device.pushErrorScope("validation"); }
      try {
        next.sceneTex = device.createTexture({
          size: [width, height], format: SCENE_FORMAT,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
               | GPUTextureUsage.COPY_SRC });
        next.depthTex = device.createTexture({
          size: [width, height], format: DEPTH_FORMAT,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
        next.sceneView = next.sceneTex.createView();
        next.depthView = next.depthTex.createView();
        next.depthSampleView = next.depthTex.createView({ aspect: "depth-only" });
        if (_msaaCount > 1) {
          next.sceneMSTex = device.createTexture({
            size: [width, height], format: SCENE_FORMAT, sampleCount: _msaaCount,
            usage: _transientRenderUsage() });
          next.depthMSTex = device.createTexture({
            size: [width, height], format: DEPTH_FORMAT, sampleCount: _msaaCount,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
          next.sceneMSView = next.sceneMSTex.createView();
          next.depthMSView = next.depthMSTex.createView();
        }
        next.blitBindGroup = device.createBindGroup({
          layout: blitPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: next.sceneView },
            { binding: 1, resource: linearSampler },
            { binding: 2, resource: { buffer: blitUBO } },
          ],
        });

        if (!pComposite) {
          next.frameGroups = _makeFrameBGs(ssrView);
        } else {
          next.ssaoTex = device.createTexture({ size: [halfW, halfH], format: SSAO_FORMAT,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
          next.ssaoBlurTex = device.createTexture({ size: [halfW, halfH], format: SSAO_FORMAT,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
          next.godrayTex = device.createTexture({ size: [halfW, halfH], format: POST_HDR_FORMAT,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
          next.godrayBlurTex = device.createTexture({ size: [halfW, halfH], format: POST_HDR_FORMAT,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
          next.ldrTex = device.createTexture({ size: [width, height], format: LDR_FORMAT,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
          next.ssaoView = next.ssaoTex.createView();
          next.ssaoBlurView = next.ssaoBlurTex.createView();
          next.godrayView = next.godrayTex.createView();
          next.godrayBlurView = next.godrayBlurTex.createView();
          next.ldrView = next.ldrTex.createView();
          if (!WGX_LITE) {
            next.ssrTex = device.createTexture({ size: [halfW, halfH], format: SCENE_FORMAT,
              usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
            next.ssrView = next.ssrTex.createView();
          }

          let bw = halfW, bh = halfH;
          for (let i = 0; i < BLOOM_MAX_LEVELS; i++) {
            if (i > 0) { bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1); }
            if (i > 0 && (bw < 4 || bh < 4)) break;
            const tex = device.createTexture({ size: [bw, bh], format: POST_HDR_FORMAT,
              usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
            const level = { tex, view: null, w: bw, h: bh };
            next.bloomLv.push(level);
            level.view = tex.createView();
          }
          const nLv = next.bloomLv.length;
          for (let i = 0; i < nLv; i++) {
            const ubo = device.createBuffer({ size: _Post.BLOOM_DOWN_UNIFORM_BYTES,
              usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            next.bloomDownUBO.push(ubo);
            next.bloomDownBG.push(device.createBindGroup({
              layout: pBloomDown.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: i === 0 ? next.sceneView : next.bloomLv[i - 1].view },
                { binding: 1, resource: linearSampler },
                { binding: 2, resource: { buffer: ubo } },
              ],
            }));
          }
          for (let i = 0; i < nLv - 1; i++) {
            const ubo = device.createBuffer({ size: _Post.BLOOM_UP_UNIFORM_BYTES,
              usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            next.bloomUpUBO.push(ubo);
            next.bloomUpBG.push(device.createBindGroup({
              layout: pBloomUp.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: next.bloomLv[i + 1].view },
                { binding: 1, resource: linearSampler },
                { binding: 2, resource: { buffer: ubo } },
              ],
            }));
          }
          next.ssaoBG = device.createBindGroup({
            layout: pSSAO.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: next.depthSampleView },
              { binding: 1, resource: pointSampler },
              { binding: 2, resource: { buffer: ssaoUBO } },
            ],
          });
          next.ssaoBlurSrcBG = device.createBindGroup({
            layout: _blurBGL || pBlur.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: next.ssaoView },
              { binding: 1, resource: linearSampler },
              { binding: 2, resource: { buffer: blurUBO, offset: 0, size: _Post.BLUR_UNIFORM_BYTES } },
            ],
          });
          next.ssaoBlurDstBG = device.createBindGroup({
            layout: _blurBGL || pBlur.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: next.ssaoBlurView },
              { binding: 1, resource: linearSampler },
              { binding: 2, resource: { buffer: blurUBO, offset: 0, size: _Post.BLUR_UNIFORM_BYTES } },
            ],
          });
          next.godrayBlurSrcBG = device.createBindGroup({
            layout: _blurBGL || pBlurHDR.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: next.godrayView },
              { binding: 1, resource: linearSampler },
              { binding: 2, resource: { buffer: blurUBO, offset: 0, size: _Post.BLUR_UNIFORM_BYTES } },
            ],
          });
          next.godrayBlurDstBG = device.createBindGroup({
            layout: _blurBGL || pBlurHDR.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: next.godrayBlurView },
              { binding: 1, resource: linearSampler },
              { binding: 2, resource: { buffer: blurUBO, offset: 0, size: _Post.BLUR_UNIFORM_BYTES } },
            ],
          });
          next.godrayBG = device.createBindGroup({
            layout: pGodray.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: next.depthSampleView },
              { binding: 1, resource: pointSampler },
              { binding: 2, resource: SHD.shadowView },
              { binding: 3, resource: SHD.shadowSampler },
              { binding: 4, resource: SHD.lampShadowView },
              { binding: 5, resource: { buffer: godrayUBO } },
              { binding: 6, resource: { buffer: grLightSBO } },
            ],
          });
          next.compositeBG = device.createBindGroup({
            layout: pComposite.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: next.sceneView },
              { binding: 1, resource: next.bloomLv[0].view },
              { binding: 2, resource: next.ssaoView },
              { binding: 3, resource: next.godrayView },
              { binding: 4, resource: linearSampler },
              { binding: 5, resource: { buffer: compositeUBO } },
              { binding: 6, resource: _dirtView },
              { binding: 7, resource: next.depthSampleView },
              { binding: 8, resource: next.ssrView || ssrView },
            ],
          });
          next.fxaaBG = device.createBindGroup({
            layout: pFXAA.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: next.ldrView },
              { binding: 1, resource: linearSampler },
              { binding: 2, resource: { buffer: fxaaUBO } },
            ],
          });
          if (pSSR && next.ssrView) {
            next.ssrBG = device.createBindGroup({
              layout: pSSR.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: next.sceneView },
                { binding: 1, resource: next.depthSampleView },
                { binding: 2, resource: linearSampler },
                { binding: 3, resource: pointSampler },
                { binding: 4, resource: { buffer: ssrUBO } },
              ],
            });
            next.ssrReady = true;
          }
          next.frameGroups = _makeFrameBGs(next.ssrView || ssrView);
          next.postReady = true;
        }
      } catch (_) {
        if (scoped) { device.popErrorScope().catch(() => {}); device.popErrorScope().catch(() => {}); }
        _destroyTargetSet(next);
        _targetFailed(width, height);
        return;
      }
      if (scoped) { _scopedTargets(next); return; }
      _swapTargets(next);
    }

    function _swapTargets(next) {
      const old = { sceneTex, depthTex, ssaoTex, godrayTex, ldrTex, ssrTex,
        ssaoBlurTex, godrayBlurTex, bloomLv, bloomDownUBO, bloomUpUBO, sceneMSTex, depthMSTex };
      sceneTex = next.sceneTex; depthTex = next.depthTex;
      sceneMSTex = next.sceneMSTex || null; depthMSTex = next.depthMSTex || null;
      sceneMSView = next.sceneMSView || null; depthMSView = next.depthMSView || null;
      depthResolveBG = null;
      sceneView = next.sceneView; depthView = next.depthView;
      depthSampleView = next.depthSampleView; blitBindGroup = next.blitBindGroup;
      ssaoTex = next.ssaoTex || null; godrayTex = next.godrayTex || null;
      ssaoBlurTex = next.ssaoBlurTex || null; godrayBlurTex = next.godrayBlurTex || null;
      ldrTex = next.ldrTex || null; ssrTex = next.ssrTex || null;
      ssaoView = next.ssaoView || null; godrayView = next.godrayView || null;
      ssaoBlurView = next.ssaoBlurView || null; godrayBlurView = next.godrayBlurView || null;
      ldrView = next.ldrView || null; ssrView = next.ssrView || ssrView;
      bloomLv = next.bloomLv; bloomDownUBO = next.bloomDownUBO;
      bloomUpUBO = next.bloomUpUBO; bloomDownBG = next.bloomDownBG;
      bloomUpBG = next.bloomUpBG; ssaoBG = next.ssaoBG || null;
      ssaoBlurSrcBG = next.ssaoBlurSrcBG || null; ssaoBlurDstBG = next.ssaoBlurDstBG || null;
      godrayBlurSrcBG = next.godrayBlurSrcBG || null; godrayBlurDstBG = next.godrayBlurDstBG || null;
      godrayBG = next.godrayBG || null; compositeBG = next.compositeBG || null;
      fxaaBG = next.fxaaBG || null; ssrBG = next.ssrBG || null;
      if (next.frameGroups) {
        frameBindGroup = next.frameGroups.main;
        _envFrameBG = next.frameGroups.env;
        _activeFrameBG = frameBindGroup;
      }
      _postReady = next.postReady;
      _ssrReady = next.ssrReady;
      _texW = width; _texH = height;
      _targetRetryAt = 0; _targetFails = 0;
      _destroyTargetSet(old);
      _syncSpatialAa();
    }

    function _mkBuffer(data, usage) {
      const size = (data.byteLength + 3) & ~3;
      const buf = device.createBuffer({ size, usage: usage | GPUBufferUsage.COPY_DST });
      try {
        if (data.byteLength === size) {
          device.queue.writeBuffer(buf, 0, data);
        } else {
          const pad = new Uint8Array(size);
          pad.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
          device.queue.writeBuffer(buf, 0, pad);
        }
      } catch (e) {
        try { buf.destroy(); } catch (_) {  }
        throw e;
      }
      return buf;
    }

    const _mipPipes = new Map();
    let _mipSamp = null;
    let _mipMod = null;
    function _mipPipeDesc(format) {
      const code = `
@group(0) @binding(0) var src : texture_2d<f32>;
@group(0) @binding(1) var samp : sampler;
@vertex fn vs_main(@builtin(vertex_index) vi : u32) -> @builtin(position) vec4<f32> {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0,-1.0), vec2<f32>(3.0,-1.0), vec2<f32>(-1.0,3.0));
  return vec4<f32>(p[vi], 0.0, 1.0);
}
@fragment fn fs_main(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
  // dest pixel → UV over the FULL source. pos is dest-framebuffer pixels;
  // textureDimensions(src) is the PARENT mip. Dividing by src size (the old
  // formula) only read the top-left quadrant, so every MAT/env mip was a
  // zoomed corner — tarmac went to a washed smear vs GLX generateMipmap.
  let srcSize = vec2<f32>(textureDimensions(src));
  let dstSize = max(floor(srcSize * 0.5), vec2<f32>(1.0));
  return textureSampleLevel(src, samp, pos.xy / dstSize, 0.0);
}`;
      if (!_mipMod) _mipMod = device.createShaderModule({ code });
      return {
        layout: "auto",
        vertex: { module: _mipMod, entryPoint: "vs_main" },
        fragment: { module: _mipMod, entryPoint: "fs_main", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
      };
    }
    function _mipPrewarm(format) {
      if (!device || _mipPipes.has(format) || !device.createRenderPipelineAsync) return;
      try {
        device.createRenderPipelineAsync(_mipPipeDesc(format))
          .then((p) => { if (!_mipPipes.has(format)) _mipPipes.set(format, p); })
          .catch(() => {  });
      } catch (_) {  }
    }
    function _generateMips(tex, layers, intoEnc) {
      if (!tex || !device) return;
      const w0 = tex.width | 0, h0 = tex.height | 0;
      const levels = tex.mipLevelCount | 0;
      if (levels <= 1 || !w0) return;
      const nLay = layers || 1;
      try {
        let pipe = _mipPipes.get(tex.format);
        if (!pipe) {
          pipe = device.createRenderPipeline(_mipPipeDesc(tex.format));
          _mipPipes.set(tex.format, pipe);
        }
        if (!_mipSamp) _mipSamp = device.createSampler({ magFilter: "linear", minFilter: "linear" });
        let ladder = tex.__wgxMipLadder;
        if (!ladder || ladder.length !== nLay * (levels - 1)) {
          ladder = [];
          for (let layer = 0; layer < nLay; layer++) {
            for (let level = 1; level < levels; level++) {
              const srcView = tex.createView({ dimension: "2d", baseArrayLayer: layer, arrayLayerCount: 1,
                baseMipLevel: level - 1, mipLevelCount: 1 });
              const dstView = tex.createView({ dimension: "2d", baseArrayLayer: layer, arrayLayerCount: 1,
                baseMipLevel: level, mipLevelCount: 1 });
              ladder.push({ dstView, bg: device.createBindGroup({
                layout: pipe.getBindGroupLayout(0),
                entries: [{ binding: 0, resource: srcView }, { binding: 1, resource: _mipSamp }],
              }) });
            }
          }
          tex.__wgxMipLadder = ladder;
        }
        const enc = intoEnc || device.createCommandEncoder();
        for (let i = 0; i < ladder.length; i++) {
          const st = ladder[i];
          const p = enc.beginRenderPass({ colorAttachments: [{ view: st.dstView, loadOp: "clear",
            clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }] });
          p.setPipeline(pipe); p.setBindGroup(0, st.bg); p.draw(3); p.end();
        }
        if (!intoEnc) device.queue.submit([enc.finish()]);
      } catch (_) {  }
    }

    function _interleave(data) {
      const pos = toF32(data.pos), nrm = toF32(data.nrm), col = toF32(data.col);
      const vCount = pos.length / 3;
      const big = vCount > 65535;
      let idx = data.idx;
      if (idx instanceof Uint16Array || idx instanceof Uint32Array) {
        if (big && idx instanceof Uint16Array) idx = new Uint32Array(idx);
      } else {
        idx = big ? new Uint32Array(idx) : new Uint16Array(idx);
      }
      const mat = data.mat && data.mat.length === vCount ? toF32(data.mat) : null;
      const trk = data.trk && data.trk.length === vCount * 3 ? toF32(data.trk) : null;
      const buf = new ArrayBuffer(vCount * VERTEX_STRIDE);
      const inter = new Float32Array(buf);
      const i16 = new Int16Array(buf), u16 = new Uint16Array(buf);
      const attr = new Float32Array(vCount * 4);
      const SW = VERTEX_STRIDE >> 1;
      for (let i = 0; i < vCount; i++) {
        const o = i * VERTEX_FLOATS, h = i * SW;
        inter[o]   = pos[i*3];   inter[o+1] = pos[i*3+1]; inter[o+2] = pos[i*3+2];
        i16[h + 6] = VertexPack.snorm16(nrm[i*3]);
        i16[h + 7] = VertexPack.snorm16(nrm[i*3+1]);
        i16[h + 8] = VertexPack.snorm16(nrm[i*3+2]);
        const carId = mat && Number.isInteger(mat[i]) && mat[i] >= 20 && mat[i] <= 85 ? mat[i] : 0;
        const worldCode = mat && Number.isFinite(mat[i]) && mat[i] >= 0 && mat[i] < 17
          ? Math.round((mat[i] + 1) * 256) : 0;
        i16[h + 9] = carId ? carId * 256 : worldCode;
        u16[h + 10] = VertexPack.toHalf(col[i * 3]);
        u16[h + 11] = VertexPack.toHalf(col[i * 3 + 1]);
        u16[h + 12] = VertexPack.toHalf(col[i * 3 + 2]);
        u16[h + 13] = 0;
        attr[i * 4] = mat ? mat[i] : 0;
        if (trk) {
          attr[i * 4 + 1] = trk[i * 3];
          attr[i * 4 + 2] = trk[i * 3 + 1];
          attr[i * 4 + 3] = trk[i * 3 + 2];
        }
      }
      return {
        vert: inter, attr, idx, hasTrk: !!trk,
        indexFormat: idx instanceof Uint32Array ? "uint32" : "uint16",
        count: idx.length,
      };
    }

    function _allocFail(what, e) {
      try { Log.warn("gfx", "WGX " + what + " alloc failed —", e); } catch (_) {  }
      const msg = (e && e.message) || String(e);
      if (/too large|out of memory|device lost|invalid device|destroyed/i.test(msg)) {
        if (_outProbeOff) {
          try { Log.warn("gfx", "WGX capture mode — suppressed alloc escalate:", msg.slice(0, 80)); } catch (_) {  }
        } else _wgxEscalate(what + " alloc: " + msg.slice(0, 120));
      }
    }
    function _expandPull(vert, attr, idx) {
      const n = idx.length;
      const evBuf = new ArrayBuffer(n * VERTEX_STRIDE);
      const ev = new Float32Array(evBuf);
      const evW = new Uint32Array(evBuf);
      const srcW = new Uint32Array(vert.buffer, vert.byteOffset, vert.length);
      const ea = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        const flip = (i % 3 === 1) ? 1 : (i % 3 === 2) ? -1 : 0;
        const v = idx[i + flip], so = v * VERTEX_FLOATS, sao = v * 4, o = i * VERTEX_FLOATS, ao = i * 4;
        for (let k = 0; k < VERTEX_FLOATS; k++) evW[o + k] = srcW[so + k];
        ea[ao] = attr[sao]; ea[ao + 1] = attr[sao + 1];
        ea[ao + 2] = attr[sao + 2]; ea[ao + 3] = attr[sao + 3];
      }
      return { vert: ev, attr: ea, count: n };
    }
    function _makeAttrBG(attr) {
      const src = attr && attr.byteLength >= 16 ? attr : new Float32Array(4);
      const padded = new Float32Array(Math.max(128, Math.ceil(src.length / 64) * 64));
      padded.set(src);
      const sbuf = _mkBuffer(padded, GPUBufferUsage.STORAGE);
      let attrBG;
      try {
        attrBG = device.createBindGroup({
          layout: g2Layout,
          entries: [{ binding: 0, resource: { buffer: sbuf } }],
        });
      } catch (e) {
        try { sbuf.destroy(); } catch (_) {  }
        throw e;
      }
      return { sbuf, attrBG };
    }
    function _attrOrZero(attr) {
      if (_roadLutReady && zeroAttrBG) return { sbuf: null, attrBG: zeroAttrBG };
      return _makeAttrBG(attr);
    }
    function _makeRoadLUT(pos, trk, matArr) {
      const out = _roadLutTable(pos, trk, matArr);
      if (!out) return _makeAttrBG(null);
      const bg = _makeAttrBG(out);
      bg.isRoadLut = true;
      return bg;
    }
    function _rememberRoadLut(lut) {
      if (lut && lut.isRoadLut && lut.attrBG) { _roadLutBG = lut.attrBG; _roadLutReady = true; }
    }
    function _drawGeom(pass, mesh, instCount) {
      if (!mesh || !mesh.count) return;
      if (mesh.ibuf) {
        _setIB(pass, mesh.ibuf, mesh.indexFormat);
        const firstIndex = _chunkFirstIndex(mesh);
        if (instCount) pass.drawIndexed(mesh.count, instCount, firstIndex);
        else pass.drawIndexed(mesh.count, 1, firstIndex);
      } else if (instCount) pass.draw(mesh.count, instCount, mesh.first | 0);
      else pass.draw(mesh.count, 1, mesh.first | 0);
    }
    function _meshFromPull(vert, attr, count, indexFormat, shared) {
      const vbuf = _mkBuffer(vert, GPUBufferUsage.VERTEX);
      let a;
      try { a = shared || _makeAttrBG(attr); } catch (e) {
        try { vbuf.destroy(); } catch (_) {  }
        throw e;
      }
      return { vbuf, ibuf: null, sbuf: a.sbuf, attrBG: a.attrBG, count, indexFormat, chunks: null };
    }
    function createMesh(data) {
      const m = _createMesh(data);
      m._matReach = _matReach(data);
      return m;
    }
    function _createMesh(data) {
      const b = _interleave(data);
      const pulled = b.hasTrk ? _expandPull(b.vert, b.attr, b.idx) : null;
      const lut = b.hasTrk ? _makeRoadLUT(data.pos, data.trk, data.mat) : null;
      if (lut) _rememberRoadLut(lut);
      let vbuf = null, ibuf = null, sbuf = null, attrBG = null;
      let pieces = null;
      try {
        if (pulled) {
          const PIECE = 4095;
          if (pulled.count > PIECE) {
            pieces = [];
            for (let off = 0; off < pulled.count; off += PIECE) {
              let n = Math.min(PIECE, pulled.count - off);
              n -= n % 3;
              if (n <= 0) continue;
              const vert = new Float32Array(pulled.vert.buffer.slice(
                off * VERTEX_STRIDE, (off + n) * VERTEX_STRIDE));
              const attr = pulled.attr.slice(off * 4, (off + n) * 4);
              pieces.push(_meshFromPull(vert, attr, n, b.indexFormat));
            }
            const head = pieces[0] || { vbuf: null, sbuf: null, attrBG: null, count: 0 };
            return {
              _wgx: "mesh", vbuf: head.vbuf, ibuf: null, sbuf: head.sbuf, attrBG: head.attrBG,
              count: head.count, indexFormat: b.indexFormat, chunks: null, pieces,
              lutSbuf: lut && lut.sbuf, lutAttrBG: lut && lut.attrBG,
            };
          }
          const m = _meshFromPull(pulled.vert, pulled.attr, pulled.count, b.indexFormat);
          return Object.assign({ _wgx: "mesh", lutSbuf: lut && lut.sbuf, lutAttrBG: lut && lut.attrBG }, m);
        }
        vbuf = _mkBuffer(b.vert, GPUBufferUsage.VERTEX);
        ibuf = _mkBuffer(b.idx, GPUBufferUsage.INDEX);
        const a = lut || _attrOrZero(b.attr);
        sbuf = a.sbuf; attrBG = a.attrBG;
      } catch (e) {
        try { if (vbuf) vbuf.destroy(); } catch (_) {  }
        try { if (ibuf) ibuf.destroy(); } catch (_) {  }
        if (pieces) {
          for (let i = 0; i < pieces.length; i++) {
            const pc = pieces[i];
            try { if (pc.vbuf) pc.vbuf.destroy(); } catch (_) {  }
            try { if (pc.sbuf) pc.sbuf.destroy(); } catch (_) {  }
          }
        }
        try { if (sbuf && sbuf !== (lut && lut.sbuf)) sbuf.destroy(); } catch (_) {  }
        try { if (lut && lut.sbuf) { if (lut.attrBG === _roadLutBG) { _roadLutBG = null; _roadLutReady = false; } lut.sbuf.destroy(); } } catch (_) {  }
        _allocFail("createMesh", e);
        return { _wgx: "mesh", vbuf: null, ibuf: null, sbuf: null, attrBG: null, count: 0, indexFormat: b.indexFormat, chunks: null };
      }
      return { _wgx: "mesh", vbuf, ibuf, sbuf, attrBG, count: b.count, indexFormat: b.indexFormat, chunks: null };
    }
    function createTexMesh(data) {
      if (!data || !data.pos || !data.nrm || !data.uv) return { _wgx: "texmesh", _phase: 4 };
      const pos = toF32(data.pos), nrm = toF32(data.nrm), uv = toF32(data.uv);
      const vCount = pos.length / 3, big = vCount > 65535;
      let idx = data.idx;
      if (idx instanceof Uint16Array || idx instanceof Uint32Array) {
        if (big && idx instanceof Uint16Array) idx = new Uint32Array(idx);
      } else idx = big ? new Uint32Array(idx) : new Uint16Array(idx);
      const inter = new Float32Array(vCount * 8);
      for (let i = 0; i < vCount; i++) {
        const o = i * 8;
        inter[o]   = pos[i*3];   inter[o+1] = pos[i*3+1]; inter[o+2] = pos[i*3+2];
        inter[o+3] = nrm[i*3];   inter[o+4] = nrm[i*3+1]; inter[o+5] = nrm[i*3+2];
        inter[o+6] = uv[i*2];    inter[o+7] = uv[i*2+1];
      }
      let vbuf = null, ibuf = null;
      try {
        vbuf = _mkBuffer(inter, GPUBufferUsage.VERTEX);
        ibuf = _mkBuffer(idx, GPUBufferUsage.INDEX);
      } catch (e) {
        try { if (vbuf) vbuf.destroy(); } catch (_) {  }
        _allocFail("createTexMesh", e);
        return { _wgx: "texmesh", _phase: 4 };
      }
      return { _wgx: "texmesh", vbuf, ibuf, count: idx.length, indexFormat: idx instanceof Uint32Array ? "uint32" : "uint16", pos, uv, idx };
    }

    function _makeDirtView() {
      const _blackFallback = () => {
        try {
          const tex = device.createTexture({
            size: [1, 1], format: "rgba8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
          });
          device.queue.writeTexture({ texture: tex }, new Uint8Array([0, 0, 0, 255]),
            { bytesPerRow: 4, rowsPerImage: 1 }, [1, 1]);
          return tex.createView();
        } catch (_) { return null;  }
      };
      try {
        const cv = PostCommon.makeDirtCanvas();
        if (!cv) return _blackFallback();
        const S = cv.width;
        const tex = device.createTexture({
          size: [S, S], format: "rgba8unorm",
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        device.queue.copyExternalImageToTexture({ source: cv, flipY: true }, { texture: tex }, [S, S]);
        return tex.createView();
      } catch (_) { return _blackFallback();  }
    }

    function createTexture(src) {
      let tex = null;
      try {
        const w = src ? (src.width | 0) : 0, h = src ? (src.height | 0) : 0;
        if (!w || !h) return { _wgx: "texture", _phase: 4 };
        const mips = Math.floor(Math.log2(Math.max(w, h))) + 1;
        tex = device.createTexture({
          size: [w, h], format: "rgba8unorm", mipLevelCount: mips,
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        if (src instanceof Uint8Array || src instanceof Uint8ClampedArray) {
          const pm = new Uint8Array(src.length);
          for (let i = 0; i < src.length; i += 4) {
            const a = src[i + 3];
            pm[i] = (src[i] * a + 127) / 255; pm[i + 1] = (src[i + 1] * a + 127) / 255;
            pm[i + 2] = (src[i + 2] * a + 127) / 255; pm[i + 3] = a;
          }
          device.queue.writeTexture({ texture: tex }, pm, { bytesPerRow: w * 4, rowsPerImage: h }, [w, h]);
        } else {
          device.queue.copyExternalImageToTexture({ source: src, flipY: true },
            { texture: tex, premultipliedAlpha: true }, [w, h]);
        }
        _generateMips(tex, 1);
        return { _wgx: "texture", texture: tex, view: tex.createView() };
      } catch (_) {
        if (tex) try { tex.destroy(); } catch (__) {  }
        return { _wgx: "texture", _phase: 4 }; 
      }
    }

    function _freeBuf(b) {
      if (!b) return;
      if (encoder || (SHD && SHD.pendingEnc)) _retiredBufs.push(b);
      else { try { b.destroy(); } catch (_) {  } }
    }
    function freeMesh(m) {
      if (!m) return;
      if (m.lutSbuf) {
        _freeBuf(m.lutSbuf);
        if (m.lutAttrBG && m.lutAttrBG === _roadLutBG) { _roadLutBG = null; _roadLutReady = false; }
        m.lutSbuf = null;
      }
      if (m.pieces) {
        for (let i = 0; i < m.pieces.length; i++) freeMesh(m.pieces[i]);
        return;
      }
      _freeBuf(m.vbuf);
      _freeBuf(m.sbuf);
      _freeBuf(m.ibuf);
    }
    function freeTexture(t) {
      if (!t) return;
      _freeBuf(t.texture);
      t.view = null;
      t._wgxDecalBG = null;
    }

    function _writeFrame(f, mirror) {
      const d = frameData;
      const vp = (f.viewProj && f.viewProj.length >= 16) ? f.viewProj : IDENT;
      const pj = f.proj, ipj = f.invProj;
      if (pj && pj.length >= 16 && ipj && ipj.length >= 16 && (pj[8] !== 0 || pj[9] !== 0)) {
        const v = (f.view && f.view.length >= 16) ? f.view : null;
        if (v) _viewScratch.set(v);
        else _mul4(_viewScratch, ipj, vp);
        _mul4(_projZ01, Z01, pj);
        _mul4(_vpGpu, _projZ01, _viewScratch);
      } else {
        _mul4(_vpGpu, Z01, vp);
      }

      d.set(_vpGpu, 0);
      frameVPGpu.set(_vpGpu);
      const eye = f.eye || [0,0,0], sd = f.sunDir || [0.3,0.6,0.5], sc = f.sunColor || [1,0.95,0.9];
      frameSunDir = f.sunDir || null;
      frameSunColor = f.sunColor || null;
      frameProjRaw = f.proj || null;
      frameSunVS = f.sunViewDir || null;
      frameUpVS = f.upViewDir || null;
      frameTime = f.time != null ? f.time : 0;
      if (f.invProj && f.invProj.length >= 16) { _mul4(frameInvProjW, f.invProj, Z01INV); frameHaveProj = true; }
      else frameHaveProj = false;
      const T = f.tune || null;
      frameTune = T;
      const ambM = T && T.ambientMul != null ? T.ambientMul : 1;
      const as = f.ambientSky || [0.3,0.32,0.36], ag = f.ambientGround || [0.2,0.19,0.18];
      frameAmbSky = as; frameAmbGround = ag;
      const skz = f.skyZenith || [0.18,0.40,0.78], skh = f.skyHorizon || [0.62,0.74,0.88];
      const fc = f.fogColor || [0.5,0.6,0.7];
      d[16]=eye[0]; d[17]=eye[1]; d[18]=eye[2]; d[19]=0;
      d[20]=sd[0];  d[21]=sd[1];  d[22]=sd[2];  d[23]=0;
      d[24]=sc[0];  d[25]=sc[1];  d[26]=sc[2];  d[27]=0;
      d[28]=as[0]*ambM; d[29]=as[1]*ambM; d[30]=as[2]*ambM; d[31]=0;
      d[32]=ag[0]*ambM; d[33]=ag[1]*ambM; d[34]=ag[2]*ambM; d[35]=0;
      d[36]=skz[0]; d[37]=skz[1]; d[38]=skz[2]; d[39]=0;
      d[40]=skh[0]; d[41]=skh[1]; d[42]=skh[2]; d[43]=0;
      d[44]=fc[0];  d[45]=fc[1];  d[46]=fc[2];  d[47]=0;
      const fogDensity = (f.fogDensity != null ? f.fogDensity : 0) * (T && T.fogDensityMul != null ? T.fogDensityMul : 1);
      const fogHeight = T && T.fogHeight != null ? T.fogHeight : (f.fogHeight != null ? f.fogHeight : 0);
      const L = f.lights;
      const nL = L ? Math.min(MAX_LIGHTS, (L.length / 15) | 0) : 0;
      d[48]=fogDensity; d[49]=fogHeight; d[50]=f.time != null ? f.time : 0; d[51]=nL;
      const _pAS = _particleFrame.ambSky, _pAG = _particleFrame.ambGround;
      _pAS[0] = as[0]*ambM; _pAS[1] = as[1]*ambM; _pAS[2] = as[2]*ambM;
      _pAG[0] = ag[0]*ambM; _pAG[1] = ag[1]*ambM; _pAG[2] = ag[2]*ambM;
      _particleFrame.sun = sc; _particleFrame.fogColor = fc; _particleFrame.fogDensity = fogDensity;
      d[52]=T && T.keyMul != null ? T.keyMul : 1;
      d[53]=T && T.glowAmp != null ? T.glowAmp : 2.3;
      d[54]=f.wetness != null ? f.wetness : 0;
      d[55]=f.cloud != null ? f.cloud : 0;
      d.set(SHD.rendered ? SHD.shadowLVPData : IDENT, 56);
      const sunUp = !sd || sd[1] > -0.05;
      d[72] = (SHD.rendered && sunUp) ? 1 : 0;
      const _kl = f.sunColor ? Math.max(f.sunColor[0], f.sunColor[1], f.sunColor[2]) : 1;
      let _hf = (_kl - 0.28) / 0.14;
      _hf = _hf < 0 ? 0 : _hf > 1 ? 1 : _hf;
      _hf = _hf * _hf * (3 - 2 * _hf);
      const _mSh = (T && T.moonShadow != null ? T.moonShadow : 0.25) * (f.moonGate || 0);
      if (_mSh > _hf) _hf = _mSh;
      d[73] = ((T && T.shadowStr != null) ? T.shadowStr : 1.15) * _hf;
      d[74] = 1 / SHD.SHADOW_SIZE;
      d[75] = (T && T.shadowBias != null) ? T.shadowBias : 0.001;
      d[76] = (T && T.bounceK     != null) ? T.bounceK     : 0.04;
      d[77] = (T && T.fogTint     != null) ? T.fogTint     : 0.0;
      d[78] = (f.groundMist != null ? f.groundMist : 0) * (T && T.mistDensity != null ? T.mistDensity : 1);
      d[79] = (T && T.mistHeight  != null) ? T.mistHeight  : 0.30;
      d[80] = (T && T.pcssPen != null) ? T.pcssPen : 80;
      d[81] = (T && T.shadowTintAmt != null) ? T.shadowTintAmt : 0.0;
      d[82] = f.rain != null ? f.rain : 0;
      d[83] = (T && T.specKnee != null) ? T.specKnee : 4.0;
      d[84] = (_envProbeLive && !f.noEnv && T && T.carEnvCube != null) ? T.carEnvCube : 0.0;
      d[85] = f.cloudSpeed != null ? f.cloudSpeed : 1.0;
      d[86] = (T && T.cloudShadowDim != null) ? T.cloudShadowDim : 0.80;
      d[87] = (T && T.mistShare != null) ? T.mistShare : 1.5;
      const sctr = f.shadowCtr || f.eye || [0, 0, 0];
      d[88] = sctr[0]; d[89] = sctr[1]; d[90] = sctr[2];
      d[91] = (T && T.shadowRange != null) ? T.shadowRange : 80.0;
      d[92] = (T && T.wetDark != null) ? T.wetDark : 1.0;
      d[93] = SHD.carArmed ? (SHD.carBoxScale || 1.0) : 0.0;
      d[94] = (T && T.carSparkle != null) ? T.carSparkle : 1.6;
      d[95] = (T && T.fogSunCore != null) ? T.fogSunCore : 0.6;
      d.set(SHD.carShadowLVPData, 96);
      d[112] = (T && T.fogClip != null) ? T.fogClip : 0.7;
      d[113] = (T && T.carSunGlint != null) ? T.carSunGlint : 12.0;
      d[114] = (T && T.neonBoost != null) ? T.neonBoost : 0.6;
      d[115] = (T && T.lampNearClamp != null) ? T.lampNearClamp : 4.0;
      d.set(SHD.lampArmed ? SHD.lampShadowLVPData : IDENT, 116);
      d[132] = f.lampFog != null ? f.lampFog : 0;
      const _lampOn = SHD.lampArmed && !mirror;
      d[133] = _lampOn ? 1 : 0;
      d[134] = SHD.lampIdx;
      d[135] = _matAlbedoOn ? ((T && T.matTexMix != null) ? T.matTexMix : 1) : 0;
      d[136] = (T && T.ambContactDark != null) ? T.ambContactDark : 1.0;
      d[137] = (T && T.lampWallSpill  != null) ? T.lampWallSpill  : 1.0;
      d[138] = (T && T.windowSunFlash != null) ? T.windowSunFlash : 1.0;
      d[139] = (T && T.skyRimGlow     != null) ? T.skyRimGlow     : 1.0;
      let _absShadowIdx = -1;
      const _AL = f.allLights;
      if (_lampOn && SHD.lampIdx >= 0 && L && _AL &&
          !(f.tailCount > 0 && SHD.lampIdx >= f.tailStart)) {
        const so = SHD.lampIdx * 15;
        const lx = L[so], ly = L[so + 1], lz = L[so + 2];
        const ho = _asIdx * 15;
        if (_AL === _asAL && lx === _asX && ly === _asY && lz === _asZ &&
            (_asIdx >= 0 ? _AL[ho] === lx && _AL[ho + 1] === ly && _AL[ho + 2] === lz : _asGen === f.allLightsGen)) {
          _absShadowIdx = _asIdx;
        } else {
          for (let p = 0; p < _AL.length; p += 15) {
            if (_AL[p] === lx && _AL[p + 1] === ly && _AL[p + 2] === lz) { _absShadowIdx = p / 15; break; }
          }
          _asAL = _AL; _asX = lx; _asY = ly; _asZ = lz; _asIdx = _absShadowIdx; _asGen = f.allLightsGen;
        }
      }
      d[140] = _absShadowIdx;
      d[141] = (T && T.puddles != null) ? T.puddles : 1.0;
      {
        const pl = f.pitLane;
        d[144] = pl ? pl[0] : 0; d[145] = pl ? pl[1] : 0;
        d[146] = pl ? pl[2] : 1; d[147] = pl ? pl[3] : 1;
        const pb = f.pitBox;
        d[148] = pb ? pb[0] : 0; d[149] = pb ? pb[1] : 0; d[150] = 0; d[151] = 0;
      }
      {
        const lb = f.lampBake, sc = f.lampBakeScale;
        const on = !!(lb && sc && lb.data && lb.indir);
        if (on) { _bakeOffW = 0; _syncLampBake(lb); }
        else if (_bakeTexW && _bakePlace && ++_bakeOffW > 120) _freeLampBake();
        const live = on && lb === _bakeSrcW;
        d[152] = live ? lb.x0 : 0; d[153] = live ? lb.z0 : 0;
        d[154] = live ? lb.tilesX * lb.T * lb.cell : 1; d[155] = live ? lb.tilesY * lb.T * lb.cell : 1;
        d[156] = live ? sc[0] : 0; d[157] = live ? sc[1] : 0; d[158] = live ? sc[2] : 0; d[159] = live ? 1 : 0;
        const shc = live && typeof LampBake !== "undefined" ? LampBake.shadowCol(f, _lampOn ? SHD.lampIdx : -1, _bakeShScr) : null;
        d[160] = shc ? shc[0] : 0; d[161] = shc ? shc[1] : 0; d[162] = shc ? shc[2] : 0;
        d[163] = live ? lb.T : 1;
        d[164] = live ? lb.tilesX : 1; d[165] = live ? lb.tilesY : 1;
        d[166] = live ? lb.atlasW : 1; d[167] = live ? lb.atlasH * 2 : 1;
      }
      device.queue.writeBuffer(frameUBO, 0, frameData);

      _lmPass = mirror ? 1 : 0;
      const snap = _lmSnap[_lmPass];
      let _lmMoved = nL !== _lmSnapN[_lmPass];
      _lmSnapN[_lmPass] = nL;
      const _hasLB = typeof LampBake !== "undefined";
      if (nL > 0) {
        const ld = lightData;
        for (let i = 0; i < nL; i++) {
          const o = i * 15, b = i * 16, q = i * 4;
          if (snap[q] !== L[o] || snap[q+1] !== L[o+1] || snap[q+2] !== L[o+2] || snap[q+3] !== L[o+6]) {
            _lmMoved = true; snap[q] = L[o]; snap[q+1] = L[o+1]; snap[q+2] = L[o+2]; snap[q+3] = L[o+6];
          }
          ld[b]    = L[o];    ld[b+1]  = L[o+1];  ld[b+2]  = L[o+2];  ld[b+3]  = L[o+6];
          ld[b+4]  = L[o+3];  ld[b+5]  = L[o+4];  ld[b+6]  = L[o+5];  ld[b+7]  = L[o+12];
          ld[b+8]  = L[o+7];  ld[b+9]  = L[o+8];  ld[b+10] = L[o+9];  ld[b+11] = L[o+13];
          ld[b+12] = L[o+10]; ld[b+13] = L[o+11]; ld[b+14] = L[o+14];
          ld[b+15] = _hasLB ? LampBake.liveOnlyAt(L, o) : 0;
        }
        device.queue.writeBuffer(lightSBO, 0, lightData, 0, nL * 16);
      }
      if (_lmMoved) CHK.bumpLampGen(_lmPass);

      frameViewProj = f.viewProj || null;
      frameEye = f.eye || null;
      frameCullDist = f.cullDist || 0;
      frameCullFog = f.cullFog || null;
      framePerChunk = +f.perChunkLights || 0;
      frameRoadChunkLamps = +f.roadChunkLamps || 0;
      frameAllLightsGen = +f.allLightsGen || 0;
      frameAllLights = f.allLights || null;
      const _tlCap = (typeof LampChunks !== "undefined") ? LampChunks.capFor(framePerChunk) : 0;
      const _tlSetMoved = _tlSrc !== frameAllLights;
      const _lbGen = f.lampBake ? f.lampBake.gen | 0 : 0;
      const _tlValuesOnly = !_tlSetMoved && _tlLoGen === _lbGen;
      const _tlPaced = _tlValuesOnly && frameTime > _tlUpT && frameTime - _tlUpT < TL_VALUES_DT;
      if (framePerChunk > 0 && frameAllLights && !_tlPaced &&
          (_tlSetMoved || _tlGen !== frameAllLightsGen || _tlLoGen !== _lbGen)) {
        const AL = frameAllLights;
        const tn = Math.min(TRACK_LIGHT_CAP, (AL.length / 15) | 0), td = _tlScratch;
        if (_tlFullPack !== AL || _tlLoGen !== _lbGen) {
          for (let i = 0; i < tn; i++) {
            const o = i * 15, b = i * 16;
            td[b]    = AL[o];        td[b+1]  = AL[o+1];      td[b+2]  = AL[o+2];  td[b+3]  = AL[o+6];
            td[b+7]  = AL[o+12];
            td[b+8]  = AL[o+7];      td[b+9]  = AL[o+8];      td[b+10] = AL[o+9];  td[b+11] = AL[o+13];
            td[b+12] = AL[o+10];     td[b+13] = AL[o+11];     td[b+14] = AL[o+14];
            td[b+15] = _hasLB ? LampBake.liveOnlyAt(AL, o) : 0;
          }
          _tlFullPack = AL; _tlLoGen = _lbGen;
        }
        for (let i = 0; i < tn; i++) {
          const o = i * 15, b = i * 16;
          td[b+4] = AL[o+3];  td[b+5] = AL[o+4];  td[b+6] = AL[o+5];
        }
        if (tn > 0) device.queue.writeBuffer(trackLightSBO, 0, td, 0, tn * 16);
        _tlSrc = frameAllLights; _tlGen = frameAllLightsGen; _tlUpT = frameTime;
      }
      if (framePerChunk > 0 && frameAllLights && (_tlSetMoved || _tlCapPrev !== _tlCap)) {
        if (CHK) CHK.resetLampSeg();
        _tlCapPrev = _tlCap;
      }
      frameLights = nL > 0 ? L : null;
      frameNL = nL;
      _fcPlanesIsFrame = false;
    }

    function _writeSky(f) {
      const ivp = f.invViewProj || IDENT;
      skyData.set(ivp.length === 16 ? ivp : (ivp.length > 16 && ivp.subarray ? ivp.subarray(0, 16) : IDENT), 0);
      const z = f.zenith || f.skyZenith || [0.18, 0.40, 0.78];
      const h = f.horizon || f.skyHorizon || [0.62, 0.74, 0.88];
      const sd = f.sunDir || [0.3, 0.6, 0.5];
      const sc = f.sunColor || [1.0, 0.95, 0.9];
      const cg = f.cityGlow || [0, 0, 0];
      skyData[16]=z[0]; skyData[17]=z[1]; skyData[18]=z[2]; skyData[19]=0;
      skyData[20]=h[0]; skyData[21]=h[1]; skyData[22]=h[2]; skyData[23]=0;
      skyData[24]=sd[0]; skyData[25]=sd[1]; skyData[26]=sd[2]; skyData[27]=0;
      skyData[28]=sc[0]; skyData[29]=sc[1]; skyData[30]=sc[2]; skyData[31]=0;
      skyData[32]=cg[0]; skyData[33]=cg[1]; skyData[34]=cg[2]; skyData[35]=0;
      skyData[36]=f.stars ? 1 : 0;
      skyData[37]=f.cloud != null ? f.cloud : 0;
      skyData[38]=f.time != null ? f.time : 0;
      skyData[39]=f.moon != null ? f.moon : 0;
      skyData[40]=f.starBright != null ? f.starBright : 1;
      skyData[41]=f.cloudSpeed != null ? f.cloudSpeed : 1;
      skyData[42]=f.skyGrad     != null ? f.skyGrad     : 0.35;
      skyData[43]=f.starDensity != null ? f.starDensity : 1;
      skyData[44]=f.mieScatter    != null ? f.mieScatter    : 1;
      skyData[45]=f.cloudSilver   != null ? f.cloudSilver   : 1;
      skyData[46]=f.coronaAureole != null ? f.coronaAureole : 1;
      skyData[47]=f.sunDiscSize   != null ? f.sunDiscSize   : 1;
      skyData[48]=f.daySkyBlue    != null ? f.daySkyBlue    : 1;
      skyData[49]=f.starSize      != null ? f.starSize      : 1;
      skyData[50]=f.starTwinkle   != null ? f.starTwinkle   : 1;
      skyData[51]=f.moonDiscSize  != null ? f.moonDiscSize  : 1;
      skyData[52]=f.moonHalo      != null ? f.moonHalo      : 1;
      skyData[53]=f.sunCorona     != null ? f.sunCorona     : 1;
      skyData[54]=f.sunSquash     != null ? f.sunSquash     : 1;
      skyData[55]=f.cityGlowReach != null ? f.cityGlowReach : 1;
      skyData[56]=f.cloudDef      != null ? f.cloudDef      : 1;
      skyData[57]=f.lightning    != null ? f.lightning    : 0;
      skyData[58]=0; skyData[59]=0;
      device.queue.writeBuffer(skyUBO, 0, skyData);
    }

    let encoder = null, litPass = null, currentView = null, _drawSlot = 0;
    function begin(frame) {
      _presentCount++;
      if (_gpuErrLastPresent >= 0 && _presentCount - _gpuErrLastPresent > GPU_ERR_QUIET_FRAMES) { _gpuErrFrames = 0; _gpuErrRun = 0; }
      if (_lost) return false;
      if (_softGpu && _softDisplayPending) {
        if (_softFrameHeld()) return false;
        _softDisplaySince = _softNow();
      }
      try {
        if (_wantCopyable && !_swapCopyable && !_softGpu) {
          _wantCopyable = false; _swapCopyable = true;
          const _cfgErr = _configureCanvas();
          if (_cfgErr) { _swapCopyable = false; if (_capReq) { const r = _capReq; _capReq = null; r.reject(new Error("swapchain reconfigure failed: " + _cfgErr)); } }
        }
        lastFrame = frame || null;
        if (width < 1) resize();
        ensureTargets();
        if (!sceneView) return false;
        _drawSlot = 0;
        _fxQuadSlot = 0; _fxDecalSlot = 0; _fxQuadOverflow = 0;
        _mirDone = false;
        _activeFrameBG = frameBindGroup;
        _writeFrame(frame || {});
        const fc = (frame && frame.fogColor) || [0.5, 0.6, 0.7];
        encoder = device.createCommandEncoder();
        _passSamples = (_msaaCount > 1 && sceneMSView) ? _msaaCount : 1;
        const colorAtt = _passSamples > 1
          ? { view: sceneMSView, resolveTarget: sceneView, clearValue: { r: fc[0], g: fc[1], b: fc[2], a: 1 },
              loadOp: "clear", storeOp: "discard" }
          : { view: sceneView, clearValue: { r: fc[0], g: fc[1], b: fc[2], a: 1 },
              loadOp: "clear", storeOp: "store" };
        const rp = {
          colorAttachments: [colorAtt],
          depthStencilAttachment: {
            view: _passSamples > 1 ? depthMSView : depthView,
            depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store",
          },
        };
        _gpuFrameTimerEpoch = -1;
        if (_gpuTimerOn && _gpuQuerySet) {
          rp.timestampWrites = { querySet: _gpuQuerySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 };
          _gpuFrameTimerEpoch = _gpuTimerEpoch;
        }
        litPass = encoder.beginRenderPass(rp);
        return true;
      } catch (e) {
        _jsStrike("begin", e);
        return false;
      }
    }

    function drawSky(sky) {
      if (!litPass) return;
      _writeSky(sky || lastFrame || {});
      _setPipe(litPass, (_passSamples > 1 && skyPipelineMS) ? skyPipelineMS : skyPipeline);
      _setBG0(litPass, skyBindGroup);
      litPass.draw(3, 1, 0, 0);
    }

    function _writeDraw(slot, model, opts) {
      const base = slot * DRAW_F32_STRIDE;
      const d = drawRing;
      d.set(model && model.length === 16 ? model : (model && model.length > 16 && model.subarray ? model.subarray(0, 16) : IDENT), base);
      const o = opts || {};
      d[base + 16] = o.emissive  != null ? o.emissive  : 0;
      d[base + 17] = o.alpha     != null ? o.alpha     : 1;
      d[base + 18] = o.roughness != null ? o.roughness : 0.7;
      d[base + 19] = o.metalness != null ? o.metalness : 0;
      d[base + 20] = o.specular  != null ? o.specular  : 0.5;
      d[base + 21] = o.detail    != null ? o.detail    : 0;
      d[base + 22] = o.clearcoat != null ? o.clearcoat : 0;
      d[base + 23] = o.carPaint  != null ? o.carPaint  : 0;
      d[base + 24] = o.sparkle   != null ? o.sparkle   : 1;
      d[base + 25] = o._instanced ? 1 : 0;
      d[base + 26] = o.surfaceId != null ? o.surfaceId : 0;
      d[base + 27] = o.buryRibbon ? 1 : 0;
      d[base + 28] = LAMP_MASK_ALL; d[base + 29] = LAMP_MASK_ALL;
      d[base + 30] = o.carFinish ? 1 : 0;
      d[base + 32] = 0; d[base + 33] = 0; d[base + 34] = 0;
      d[base + 35] = 1;
    }
    const _isPackMid = (m) => { const i = Math.floor(m + 0.5); return i >= 1 && i <= 16 && i !== 3 && i !== 15; };
    function _matReach(data) {
      const pos = data && data.pos, mat = data && data.mat;
      const n = pos ? (pos.length / 3) | 0 : 0;
      if (!mat || mat.length !== n) return { pack: false, zero: n > 0 };
      let pack = false, zero = false;
      for (let i = 0; i < n && !(pack && zero); i++) {
        const m = mat[i];
        if (!(m > 0.5)) zero = true;
        else if (_isPackMid(m)) pack = true;
      }
      return { pack, zero };
    }
    function _packDraw(mesh, o) {
      const r = mesh && mesh._matReach;
      if (!r || o.buryRibbon || o.surfaceId === 16) return 1;
      return (r.pack || (r.zero && _isPackMid(o.surfaceId || 0))) ? 1 : 0;
    }
    const _uboShadow = new WeakMap();
    function _writeUBOIfChanged(buf, off, data, n) {
      let sh = _uboShadow.get(buf);
      const need = (off >> 2) + n;
      if (!sh) { sh = new Float32Array(Math.max(need, buf.size >> 2)).fill(NaN); _uboShadow.set(buf, sh); }
      else if (sh.length < need) { const g = new Float32Array(need).fill(NaN); g.set(sh); sh = g; _uboShadow.set(buf, sh); }
      const base = off >> 2;
      let same = true;
      for (let i = 0; i < n; i++) if (sh[base + i] !== data[i]) { same = false; break; }
      if (same) return;
      for (let i = 0; i < n; i++) sh[base + i] = data[i];
      device.queue.writeBuffer(buf, off, data, 0, n);
    }
    function _flushDrawUBO() {
      if (!drawUBO || _drawSlot <= 0) return;
      device.queue.writeBuffer(drawUBO, 0, drawRing, 0, Math.min(_drawSlot, MAX_DRAWS) * DRAW_F32_STRIDE);
    }
    function _flushQuadFxUBO() {
      if (!quadFxUBO || _fxQuadSlot <= 0) return;
      const nQ = Math.min(_fxQuadSlot, FX_QUAD_SLOTS);
      device.queue.writeBuffer(quadFxUBO, 0, quadFxRing, 0, nQ * FX_F32_STRIDE);
      if (_fxQuadOverflow) Log.warn("gfx", "WGX fx-quad ring overflow: " + _fxQuadOverflow + " stamp(s) dropped");
    }
    function _flushDecalUBO() {
      if (!decalUBO || _fxDecalSlot <= 0) return;
      device.queue.writeBuffer(decalUBO, 0, decalFxRing, 0, Math.min(_fxDecalSlot, FX_DECAL_SLOTS) * FX_F32_STRIDE);
    }
    function _flushLitRings() {
      _flushDrawUBO();
      _flushQuadFxUBO();
      _flushDecalUBO();
    }
    function _setPipe(pass, p) {
      if (pass.__pipe !== p) { pass.setPipeline(p); pass.__pipe = p; }
    }
    function _setBG0(pass, bg, dyn) {
      if (dyn) { pass.setBindGroup(0, bg, dyn); pass.__bg0 = null; return; }
      if (pass.__bg0 !== bg) { pass.setBindGroup(0, bg); pass.__bg0 = bg; }
    }
    function _setVB0(pass, buf) {
      if (pass.__vb0 !== buf) { pass.setVertexBuffer(0, buf); pass.__vb0 = buf; }
    }
    function _setVB1(pass, buf) {
      if (pass.__vb1 !== buf) { pass.setVertexBuffer(1, buf); pass.__vb1 = buf; }
    }
    function _setIB(pass, buf, fmt) {
      if (pass.__ib !== buf || pass.__ibf !== fmt) {
        pass.setIndexBuffer(buf, fmt);
        pass.__ib = buf; pass.__ibf = fmt;
      }
    }
    function _bindLitVerts(pass, vbuf, instBuf, attrBG, authored) {
      _setVB0(pass, vbuf);
      _setVB1(pass, instBuf || identInstanceBuf);
      const bg2 = _roadLutBG || attrBG || zeroAttrBG;
      if (pass.__bg2 !== bg2) { pass.setBindGroup(2, bg2); pass.__bg2 = bg2; }
      void authored;
    }

    const _litOptsBag = {
      emissive: 0, alpha: 1, roughness: 0.7, metalness: 0, specular: 0.5,
      detail: 0, clearcoat: 0, carPaint: 0, carFinish: false, sparkle: 1, _instanced: false,
      surfaceId: 0, buryRibbon: false, depthBias: null, doubleSided: false,
      noAlphaWrite: false, decal: false, depthCompare: undefined,
      noDepthTest: false,
    };
    const _BIAS_BURY = [5, 10], _BIAS_DETAIL = [3, 6];
    function _litOpts(opts) {
      const o = opts || {};
      let bias = o.depthBias !== undefined ? o.depthBias : null;
      let dbl = !!o.doubleSided;
      if (o.buryRibbon) bias = o.depthBias || _BIAS_BURY;
      else if (!o.depthBias && !o.surfaceId && (o.detail || 0) > 0.2) bias = _BIAS_DETAIL;
      if (o.surfaceId === 16) {
        dbl = true;
        bias = null;
      }
      if (bias === (o.depthBias !== undefined ? o.depthBias : null) && dbl === !!o.doubleSided) return o;
      const b = _litOptsBag;
      b.emissive = o.emissive; b.alpha = o.alpha; b.roughness = o.roughness;
      b.metalness = o.metalness; b.specular = o.specular; b.detail = o.detail;
      b.clearcoat = o.clearcoat; b.carPaint = o.carPaint; b.carFinish = o.carFinish; b.sparkle = o.sparkle;
      b._instanced = o._instanced; b.surfaceId = o.surfaceId;
      b.buryRibbon = o.buryRibbon; b.noAlphaWrite = o.noAlphaWrite;
      b.decal = o.decal; b.depthCompare = o.depthCompare;
      b.noDepthTest = o.noDepthTest;
      b.depthBias = bias; b.doubleSided = dbl;
      return b;
    }

    function draw(mesh, model, opts) {
      if (!litPass || !mesh || !mesh.vbuf) return;
      const o = _litOpts(opts);
      const slot = _drawSlot++;
      if (slot >= MAX_DRAWS) return;
      _writeDraw(slot, model, o);
      drawRing[slot * DRAW_F32_STRIDE + 35] = _packDraw(mesh, o);
      _setPipe(litPass, _litPipeline(o));
      _setBG0(litPass, _activeFrameBG);
      _dynOff[0] = slot * DRAW_STRIDE;
      litPass.setBindGroup(1, drawBindGroup, _dynOff);
      if (mesh.pieces) {
        for (let i = 0; i < mesh.pieces.length; i++) {
          const p = mesh.pieces[i];
          _bindLitVerts(litPass, p.vbuf, identInstanceBuf, p.attrBG, o.surfaceId === 16);
          _drawGeom(litPass, p);
        }
        return;
      }
      _bindLitVerts(litPass, mesh.vbuf, identInstanceBuf, mesh.attrBG, o.surfaceId === 16);
      _drawGeom(litPass, mesh);
    }


    function _tonemapBlit(exposure) {
      device.queue.writeBuffer(blitUBO, 0, _blitParams(blitData, exposure, _TONE_STANDIN));
      const bp = encoder.beginRenderPass({
        colorAttachments: [{ view: currentView, clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear", storeOp: "store" }],
      });
      bp.setPipeline(blitPipeline);
      bp.setBindGroup(0, blitBindGroup);
      bp.draw(3, 1, 0, 0);
      _mirrorComposite(exposure, _TONE_STANDIN, null, bp);
      bp.end();
    }

    const _ONE3W = [1, 1, 1];
    function _blitParams(dst, exposure, T) {
      dst[0] = exposure; dst[1] = 0; dst[2] = 0; dst[3] = 0;
      for (let i = 0; i < 6; i++) dst[4 + i] = PostCommon.knob(T, _TONE_IDS[i]);
      for (let i = 10; i < dst.length; i++) dst[i] = 0;
      return dst;
    }

    function _blurSep(pipe, srcView, tmpView, srcBG, tmpBG, texX, texY, times) {
      if (!pipe || !srcView || !tmpView || !srcBG || !tmpBG || !blurUBO) return;
      const n = times || 1;
      const stride = _blurStride || 256;
      const slots = _blurSlots || 16;
      for (let i = 0; i < n; i++) {
        const sx = (1 + i) * texX, sy = (1 + i) * texY;
        const s = postScratch;
        s[0] = sx; s[1] = 0; s[2] = 0; s[3] = 0;
        let off = ((_blurWriteSlot++) % slots) * stride;
        _writeUBOIfChanged(blurUBO, off, s, _Post.BLUR_UNIFORM_BYTES / 4);
        let p = encoder.beginRenderPass({ colorAttachments: [{ view: tmpView, loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }] });
        p.setPipeline(pipe); p.setBindGroup(0, srcBG, [off]); p.draw(3, 1, 0, 0); p.end();
        s[0] = 0; s[1] = sy;
        off = ((_blurWriteSlot++) % slots) * stride;
        _writeUBOIfChanged(blurUBO, off, s, _Post.BLUR_UNIFORM_BYTES / 4);
        p = encoder.beginRenderPass({ colorAttachments: [{ view: srcView, loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }] });
        p.setPipeline(pipe); p.setBindGroup(0, tmpBG, [off]); p.draw(3, 1, 0, 0); p.end();
      }
    }

    let _envInitFailed = false;
    function envInit() {
      if (envCubeTex || _envInitFailed) return;
      const envMips = Math.min(Math.floor(Math.log2(ENV_SIZE)) + 1, Math.ceil(ENV_LOD_MAX) + 1);
      try {
        envCubeTex = device.createTexture({
          size: [ENV_SIZE, ENV_SIZE, 6], dimension: "2d", format: SCENE_FORMAT,
          mipLevelCount: envMips,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        envSampleView = envCubeTex.createView({ dimension: "cube" });
        _mipPrewarm(SCENE_FORMAT);
        envFaceViews = [];
        for (let f = 0; f < 6; f++)
          envFaceViews.push(envCubeTex.createView({ dimension: "2d", baseArrayLayer: f, arrayLayerCount: 1, baseMipLevel: 0, mipLevelCount: 1 }));
        envDepthTex = device.createTexture({
          size: [ENV_SIZE, ENV_SIZE], format: DEPTH_FORMAT, usage: _transientRenderUsage(),
        });
        envDepthView = envDepthTex.createView();
      } catch (e) {
        try { if (envCubeTex) envCubeTex.destroy(); } catch (_) {  }
        try { if (envDepthTex) envDepthTex.destroy(); } catch (_) {  }
        envCubeTex = null; envSampleView = null; envFaceViews = null; envDepthTex = null; envDepthView = null;
        _envInitFailed = true;
        try { Log.warn("gfx", "WGX env probe allocation failed — analytic reflections only:", e && e.message); } catch (_) {  }
      }
    }

    function envFaceBegin(face, eye, frame) {
      if (_lost || WGX_MINIMAL || WGX_LITE || _envInitFailed || !skyPipeline) return null;
      if (!envCubeTex) envInit();
      if (!envFaceViews) return null;
      _passSamples = 1;
      const F = ENV_FACES[face];
      _envTgt[0] = eye[0] + F[0][0]; _envTgt[1] = eye[1] + F[0][1]; _envTgt[2] = eye[2] + F[0][2];
      M4.lookAtTo(_envView, eye, _envTgt, F[1]);
      M4.perspectiveTo(_envProj, Math.PI / 2, 1, 0.4, 900);
      M4.mulTo(_envVP, _envProj, _envView);
      M4.invertTo(_envInvVP, _envVP);
      const svVP = frame.viewProj, svEye = frame.eye, svCull = frame.cullDist;
      _envFrame = frame;
      _envSvVP = svVP; _envSvEye = svEye; _envSvCull = svCull;
      frame.viewProj = _envVP; frame.eye = eye;
      frame.cullDist = svCull > 0 ? Math.min(svCull, ENV_CULL_M) : ENV_CULL_M;
      _writeFrame(frame);
      const fc = (frame && frame.fogColor) || [0.5, 0.6, 0.7];
      if (SHD) SHD.flushPending();
      _envEncoder = device.createCommandEncoder();
      litPass = _envEncoder.beginRenderPass({
        colorAttachments: [{ view: envFaceViews[face], clearValue: { r: fc[0], g: fc[1], b: fc[2], a: 1 },
          loadOp: "clear", storeOp: "store" }],
        depthStencilAttachment: { view: envDepthView, depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "discard" },
      });
      encoder = _envEncoder;
      _drawSlot = 0; _fxQuadSlot = 0; _fxDecalSlot = 0; _fxQuadOverflow = 0;
      _activeFrameBG = _envFrameBG;
      return _envInvVP;
    }

    function envFaceEnd(face) {
      if (_envFrame) {
        _envFrame.viewProj = _envSvVP;
        _envFrame.eye = _envSvEye;
        _envFrame.cullDist = _envSvCull;
        _envFrame = null;
      }
      if (!envCubeTex || !litPass || !_envEncoder) return;
      _flushLitRings();
      litPass.end();
      _envFacesMask |= 1 << face;
      if (_envFacesMask === 63) _generateMips(envCubeTex, 6, _envEncoder);
      device.queue.submit([_envEncoder.finish()]);
      litPass = null; encoder = null; _envEncoder = null;
      _activeFrameBG = frameBindGroup;
      if (_envFacesMask === 63) {
        _envFacesMask = 0;
        if (!_envProbeLive) {
          _envProbeLive = true;
          envCubeView = envSampleView;
          _rebuildFrameBG();
        }
      }
    }

    let mirTex = null, mirView = null, mirDepthTex = null, mirDepthView = null, mirW = 0, mirH = 0;
    let mirSampleView = null, _mirSamp = null, _mirGlassLod = -Infinity, _mirGlassInf = 0;
    const _mirBox = [0, 0, 0, 0];
    let _mirPassSeq = 0;
    let _mirEncoder = null, _mirDead = false, _mirRect = null, _mirRenders = 0, _mirComposites = 0, _mirFlip = true, _mirAllocs = 0;
    let _mirInPass = 0, _mirDone = false;
    let _mirUBO = null, _mirBG = null;
    let _mirGlassBG = null, _mirGlass = 0;
    const _mirData = new Float32Array(BLIT_BYTES / 4);
    function _mirrorFree() {
      try { if (mirTex) mirTex.destroy(); } catch (_) {  }
      try { if (mirDepthTex) mirDepthTex.destroy(); } catch (_) {  }
      mirTex = mirView = mirSampleView = mirDepthTex = mirDepthView = null; _mirBG = null; _mirGlassBG = null; mirW = mirH = 0; _mirRenders = 0;
    }
    function _mirInsetBox() {
      if (!_mirRect) return null;
      const cw = wantSpatialUpscale() ? presentW : width, ch = wantSpatialUpscale() ? presentH : height;
      const x = Math.round(_mirRect[0] * cw), y = Math.round(_mirRect[1] * ch);
      const w = Math.min(cw - x, Math.round(_mirRect[2] * cw)), h = Math.min(ch - y, Math.round(_mirRect[3] * ch));
      if (w < 2 || h < 2 || x < 0 || y < 0) return null;
      _mirBox[0] = x; _mirBox[1] = y; _mirBox[2] = w; _mirBox[3] = h;
      return _mirBox;
    }
    const _mirLodFor = (tw, th, b) => Math.max(0, Math.log2(Math.max(tw / b[2], th / b[3])));
    function _mirLevels(w, h) {
      const full = Math.floor(Math.log2(Math.max(w, h))) + 1, b = _mirInsetBox();
      if (_mirGlassLod === Infinity) return full;
      let need = b ? Math.floor(_mirLodFor(w, h, b)) + 2 : 1;
      if (_mirGlassLod > -Infinity) need = Math.max(need, Math.ceil(_mirGlassLod + 0.25) + 1);
      return Math.max(1, Math.min(full, need));
    }
    function mirrorBegin(frame, w, h) {
      if (_lost || WGX_MINIMAL || _mirDead || !skyPipeline || litPass || encoder) return false;
      w = Math.max(16, Math.min(1024, w | 0)); h = Math.max(8, Math.min(512, h | 0));
      const lv = _mirLevels(w, h);
      if (!mirTex || w !== mirW || h !== mirH || lv > mirTex.mipLevelCount) {
        _mirrorFree();
        try {
          mirTex = device.createTexture({ size: [w, h], format: SCENE_FORMAT, mipLevelCount: lv,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
          mirView = mirTex.createView({ baseMipLevel: 0, mipLevelCount: 1 });
          mirSampleView = mirTex.createView();
          mirDepthTex = device.createTexture({ size: [w, h], format: DEPTH_FORMAT, usage: _transientRenderUsage() });
          mirDepthView = mirDepthTex.createView();
          mirW = w; mirH = h; _mirAllocs++;
        } catch (e) {
          _mirrorFree(); _mirDead = true;
          try { Log.warn("gfx", "WGX mirror allocation failed — mirror off:", e && e.message); } catch (_) {  }
          return false;
        }
      }
      _passSamples = 1;
      _writeFrame(frame, true);
      const fc = (frame && frame.fogColor) || [0.5, 0.6, 0.7];
      if (SHD) SHD.flushPending();
      _mirPassSeq++;
      _mirEncoder = device.createCommandEncoder();
      litPass = _mirEncoder.beginRenderPass({
        colorAttachments: [{ view: mirView, clearValue: { r: fc[0], g: fc[1], b: fc[2], a: 1 },
          loadOp: "clear", storeOp: "store" }],
        depthStencilAttachment: { view: mirDepthView, depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "discard" },
      });
      encoder = _mirEncoder;
      _drawSlot = 0; _fxQuadSlot = 0; _fxDecalSlot = 0; _fxQuadOverflow = 0;
      _activeFrameBG = frameBindGroup;
      return true;
    }
    function mirrorEnd() {
      if (!_mirEncoder) return;
      try {
        if (litPass) { _flushLitRings(); litPass.end(); }
        _generateMips(mirTex, 1, _mirEncoder);
        device.queue.submit([_mirEncoder.finish()]);
        _mirRenders++;
      } finally {
        litPass = null; encoder = null; _mirEncoder = null;
      }
    }
    function _mirrorComposite(exposure, T, o, pass) {
      if (pass && !_insetInPass) return;
      if (_mirDone) return;
      if (!_mirRect || !mirSampleView || !_mirRenders || !blitPipeline || !currentView || !encoder) return;
      const b = _mirInsetBox();
      if (!b) return;
      const x = b[0], y = b[1], w = b[2], h = b[3];
      if (!_mirUBO) _mirUBO = device.createBuffer({ size: BLIT_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      if (!_mirSamp) _mirSamp = device.createSampler({ magFilter: "linear", minFilter: "linear", mipmapFilter: "linear" });
      if (!_mirBG) _mirBG = device.createBindGroup({ layout: blitPipeline.getBindGroupLayout(0), entries: [
        { binding: 0, resource: mirSampleView }, { binding: 1, resource: _mirSamp }, { binding: 2, resource: { buffer: _mirUBO } }] });
      const lod = _mirLodFor(mirW, mirH, b);
      _blitParams(_mirData, exposure, T);
      _mirData[1] = _mirFlip ? 1 : 0; _mirData[2] = lod;
      if (o) {
        const g = o.grade || null, gsh = g && g.shadow ? g.shadow : _ONE3W, ghi = g && g.hi ? g.hi : _ONE3W;
        _mirData[3] = 1; _mirData[10] = frameTime;
        _mirData[12] = PostCommon.knob(T, "contrast"); _mirData[13] = PostCommon.knob(T, "vibrance");
        _mirData[14] = PostCommon.knob(T, "saturation"); _mirData[15] = PostCommon.knob(T, "tint");
        _mirData[16] = gsh[0]; _mirData[17] = gsh[1]; _mirData[18] = gsh[2]; _mirData[19] = g && g.str != null ? g.str : 0;
        _mirData[20] = ghi[0]; _mirData[21] = ghi[1]; _mirData[22] = ghi[2]; _mirData[23] = PostCommon.knob(T, "blackLift");
      }
      device.queue.writeBuffer(_mirUBO, 0, _mirData);
      const mp = pass || encoder.beginRenderPass({ colorAttachments: [{ view: currentView, loadOp: "load", storeOp: "store" }] });
      mp.setViewport(x, y, w, h, 0, 1);
      mp.setPipeline(blitPipeline);
      mp.setBindGroup(0, _mirBG);
      mp.draw(3, 1, 0, 0);
      if (!pass) mp.end(); else _mirInPass++;
      _mirDone = true;
      _mirComposites++;
    }

    function drawMirrorGlass(mesh, model, opts) {
      if (_mirEncoder || _mirDead || !mirSampleView || !_mirRenders || !_mirFlip) return false;
      if (!_fxReady || !pGlass || !litPass || _envEncoder || _passSamples !== (MSAA_COUNT > 1 ? MSAA_COUNT : 1)) return false;
      if (!mesh || !mesh.count || !mesh.vbuf || !model || _fxDecalSlot >= FX_DECAL_SLOTS) return false;
      if (!_mirGlassBG) {
        try {
          if (!_mirSamp) _mirSamp = device.createSampler({ magFilter: "linear", minFilter: "linear", mipmapFilter: "linear" });
          _mirGlassBG = device.createBindGroup({ layout: fxDecalLayout, entries: [
            { binding: 0, resource: { buffer: decalUBO, offset: 0, size: _Fx.DECAL_UNIFORM_BYTES } },
            { binding: 1, resource: mirSampleView },
            { binding: 2, resource: _mirSamp },
          ] });
        } catch (_) { _mirGlassBG = null; return false; }
      }
      const slot = _fxDecalSlot++, base = slot * FX_F32_STRIDE, s = decalFxRing;
      s.set(model.length > 16 && model.subarray ? model.subarray(0, 16) : model, base);
      s.set(frameVPGpu, base + 16);
      s[base + 48] = 0; s[base + 49] = 1; s[base + 50] = 1; s[base + 51] = -1;
      s[base + 52] = 1; s[base + 53] = 1; s[base + 54] = 1; s[base + 55] = 0;
      _setPipe(litPass, pGlass);
      _fxDecalDynOff[0] = slot * FX_STRIDE;
      _setBG0(litPass, _mirGlassBG, _fxDecalDynOff);
      _setVB0(litPass, mesh.vbuf);
      _setIB(litPass, mesh.ibuf, mesh.indexFormat);
      litPass.drawIndexed(mesh.count);
      _mirGlass++;
      if (_mirGlassLod < Infinity && (frameVPGpu[11] !== 0 || frameVPGpu[15] !== 0)) {
        const l = !mesh.pos || !mesh.uv ? Infinity
          : PostCommon.mipFootprintLod(mesh.pos, mesh.uv, mesh.idx, model, frameVPGpu, width, height, mirW, mirH);
        if (l < Infinity) { _mirGlassInf = 0; _mirGlassLod = Math.max(_mirGlassLod, l); }
        else if (++_mirGlassInf >= 2 || !(l === l) || !mesh.pos) _mirGlassLod = Infinity;
      }
      return true;
    }

    function envProbeReset() {
      _envFacesMask = 0; _envProbeLive = false;
      envCubeView = _envPlaceView || envCubeView;
      _rebuildFrameBG();
    }

    const _sunScr = { visible: false, ndcx: -5, ndcy: -5, flare: 0, shaft: 0 };
    const _sunOut = { ux: 0, uy: 0, flare: 0, shaft: 0, onScreen: false };
    function _sunScreen() {
      const r = PostCommon.sunScreen(frameSunDir, frameViewProj, frameSunColor, _sunScr);
      if (!r.visible) return null;
      const ux = r.ndcx * 0.5 + 0.5, uy = 0.5 - r.ndcy * 0.5;
      _sunOut.ux = ux; _sunOut.uy = uy; _sunOut.flare = r.flare; _sunOut.shaft = r.shaft;
      _sunOut.onScreen = ux >= 0 && ux <= 1 && uy >= 0 && uy <= 1;
      return _sunOut;
    }

    function capturePixels() {
      if (_lost) return Promise.reject(new Error("device lost"));
      if (_capReq) return Promise.reject(new Error("capture already pending"));
      return new Promise((resolve, reject) => { _capReq = { resolve, reject }; });
    }
    function _capEncode() {
      if (!_capReq) return null;
      try {
        if (!_softGpu && !_swapCopyable) { _wantCopyable = true; return null; }
        const capTex = _softGpu ? softPresentTex : ctx.getCurrentTexture();
        if (!capTex) throw new Error("no frame texture");
        const w = capTex.width, h = capTex.height;
        const bpr = (w * 4 + 255) & ~255;
        const buf = device.createBuffer({ size: bpr * h,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        try {
          encoder.copyTextureToBuffer({ texture: capTex },
            { buffer: buf, bytesPerRow: bpr }, [w, h]);
        } catch (e) {
          try { buf.destroy(); } catch (_) {  }
          throw e;
        }
        return { buf, bpr, w, h, bgra: !_softGpu && format === "bgra8unorm" };
      } catch (e) {
        const r = _capReq; _capReq = null; r.reject(e);
        return null;
      }
    }
    function _retireFlush() {
      for (let i = 0; i < _retiredBufs.length; i++) {
        try { _retiredBufs[i].destroy(); } catch (_) {  }
      }
      _retiredBufs.length = 0;
    }
    function _retireIdleFlush() { if (!(SHD && SHD.pendingEnc)) _retireFlush(); }
    function _capAbort(cap) {
      if (!cap) return;
      try { cap.buf.destroy(); } catch (_) {  }
    }
    function _capFinish(cap) {
      if (!cap) return;
      const req = _capReq; _capReq = null;
      const { buf, bpr, w, h } = cap;
      const finish = function () {
        buf.mapAsync(GPUMapMode.READ).then(function () {
          const src = new Uint8Array(buf.getMappedRange());
          const out = new Uint8ClampedArray(w * h * 4);
          const bgra = !!cap.bgra;
          for (let y = 0; y < h; y++) {
            const s = y * bpr, d = y * w * 4;
            for (let x = 0; x < w; x++) {
              const si = s + x * 4, di = d + x * 4;
              out[di]     = src[bgra ? si + 2 : si];
              out[di + 1] = src[si + 1];
              out[di + 2] = src[bgra ? si : si + 2];
              out[di + 3] = 255;
            }
          }
          try { buf.unmap(); buf.destroy(); } catch (_) {  }
          req.resolve({ width: w, height: h, data: out });
        }, function (e) {
          try { buf.destroy(); } catch (_) {  }
          req.reject(e);
        });
      };
      try {
        device.queue.onSubmittedWorkDone().then(finish, finish);
      } catch (_) { finish(); }
    }

    function present(opts) {
      if (_pipeAtFirstPresent < 0) _pipeAtFirstPresent = _litPipelineKeys.length;
      const lampArmed = SHD.lampArmed;
      SHD.carArmed = false;
      SHD.lampArmed = false;
      _blurWriteSlot = 0;
      _particleFlip = 0;
      if (_lost || !encoder) { litPass = null; encoder = null; currentView = null; return; }
      try {
      if (litPass) { _flushLitRings(); litPass.end(); litPass = null; }
      try {
        currentView = _acquirePresentView();
        if (!currentView) { litPass = null; encoder = null; currentView = null; _retireIdleFlush(); return; }
      } catch (_) {
        litPass = null; encoder = null; currentView = null; _retireIdleFlush(); return;
      }
      _queueOutputProbe();
      const o = opts || {};
      const _aoStrEarly = o.ssao != null ? o.ssao : 0;
      const _contactEarly = (o.contact > 0 && frameSunVS) ? o.contact : 0;
      const _haveAOEarly = frameHaveProj && ssaoBG && (_aoStrEarly > 0 || _contactEarly > 0);
      const _grStrEarly = o.godray != null ? o.godray : 0;
      const _lampVolEarly = ((o.mist || 0) > 0 && o.lampVol != null) ? o.lampVol : 0;
      const _haveGREarly = !!(godrayBG && lastFrame && lastFrame.invViewProj
        && ((!!SHD.shadowView && _grStrEarly > 0) || _lampVolEarly > 0));
      const _ssrStrEarly = o.reflect != null ? o.reflect : 0;
      const _carReflEarly = o.carReflect != null ? o.carReflect
        : PostCommon.knob(o.tune, "carReflect");
      const _ssrEarly = !!(frameHaveProj && _ssrReady && (
        _ssrStrEarly > 0.001 || _carReflEarly > 0.001));
      const _slEarly = frameSunColor
        ? Math.max(frameSunColor[0], frameSunColor[1], frameSunColor[2]) : 1;
      const _flareEarly = !!(frameSunDir && frameSunDir[1] > -0.02 && _slEarly > 0.35);
      const _needDepth = _haveAOEarly || _haveGREarly || _ssrEarly || _flareEarly;
      if (_needDepth && _passSamples > 1 && pDepthResolve && depthMSView && depthView) {
        try {
          if (!depthResolveBG) {
            depthResolveBG = device.createBindGroup({
              layout: pDepthResolve.getBindGroupLayout(0),
              entries: [{ binding: 0, resource: depthMSView }],
            });
          }
          const dr = encoder.beginRenderPass({
            colorAttachments: [],
            depthStencilAttachment: { view: depthView, depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store" },
          });
          dr.setPipeline(pDepthResolve);
          dr.setBindGroup(0, depthResolveBG);
          dr.draw(3);
          dr.end();
        } catch (_) {  }
      }
      _passSamples = 1;
      const exposure = o.exposure != null ? o.exposure : 1.0;

      if (!_postReady || !pComposite || !ldrView || bloomLv.length === 0) {
        _tonemapBlit(exposure);
        _mirrorComposite(exposure, _TONE_STANDIN);
        const disp = _softDisplayEncode();
        const cap = _capEncode();
        try { device.queue.submit(SHD.frameSubmitList(encoder)); }
        catch (e) { _capAbort(cap); _softDisplayAbort(disp); throw e; }
        _retireFlush();
        _capFinish(cap);
        _softDisplayFinish(disp);
        encoder = null; currentView = null;
        _readOutputProbe();
        _jsStrikes = 0;
        if (!_okCounted) { _okCounted = true; _healTick(); }
        return;
      }

      try {
      const T = o.tune || null;
      const tw = _texW || width, th = _texH || height;
      const halfW = Math.max(1, tw >> 1), halfH = Math.max(1, th >> 1);
      const sun = _sunScreen();
      const sunUVx = sun ? sun.ux : -2, sunUVy = sun ? sun.uy : -2;

      const _ssrStr = o.reflect != null ? o.reflect : 0;
      const _carRefl = o.carReflect != null ? o.carReflect
        : PostCommon.knob(T, "carReflect");
      const _ssrRan = !!(_ssrReady && ssrBG && frameHaveProj &&
          (_ssrStr > 0.001 || _carRefl > 0.001));
      if (_ssrRan) {
        const s = postScratch;
        s.set(frameInvProjW, 0);
        s.set(frameProjRaw && frameProjRaw.length >= 16 ? frameProjRaw : IDENT, 16);
        const up = frameUpVS || [0, 1, 0];
        s[32] = up[0]; s[33] = up[1]; s[34] = up[2];
        s[35] = _carRefl;
        const ssrThick = PostCommon.knob(T, "ssrThick");
        s[36] = 1 / halfW; s[37] = 1 / halfH; s[38] = ssrThick; s[39] = _ssrStr;
        const skz = (lastFrame && lastFrame.skyZenith) || [0.18, 0.40, 0.78];
        const skh = (lastFrame && lastFrame.skyHorizon) || [0.62, 0.74, 0.88];
        const topUV = (o.ssrTopUV != null) ? o.ssrTopUV : 0.62;
        const ssrNear = (o.ssrNear != null) ? o.ssrNear : -2.5;
        s[40] = skz[0]; s[41] = skz[1]; s[42] = skz[2]; s[43] = topUV;
        s[44] = skh[0]; s[45] = skh[1]; s[46] = skh[2]; s[47] = ssrNear;
        s[48] = PostCommon.knob(T, "carGloss");
        s[49] = 1 / tw; s[50] = 1 / th;
        s[51] = o.ssrQuality === 2 ? 2 : o.ssrQuality === 1 ? 1 : 0;
        device.queue.writeBuffer(ssrUBO, 0, s, 0, _Post.SSR_UNIFORM_BYTES / 4);
        const p = encoder.beginRenderPass({ colorAttachments: [{ view: ssrView, loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0, a: 0 }, storeOp: "store" }] });
        p.setPipeline(pSSR); p.setBindGroup(0, ssrBG); p.draw(3, 1, 0, 0); p.end();
      }

      const aoStr = o.ssao != null ? o.ssao : 0;
      const contact = (o.contact > 0 && frameSunVS) ? o.contact : 0;
      const haveAO = frameHaveProj && ssaoBG && (aoStr > 0 || contact > 0);
      if (haveAO) {
        const s = postScratch;
        s.set(frameInvProjW, 0);
        s.set(frameProjRaw && frameProjRaw.length >= 16 ? frameProjRaw : IDENT, 16);
        s[32] = frameSunVS ? frameSunVS[0] : 0; s[33] = frameSunVS ? frameSunVS[1] : 0;
        s[34] = frameSunVS ? frameSunVS[2] : -1; s[35] = 0;
        s[36] = 1 / halfW; s[37] = 1 / halfH; s[38] = aoStr; s[39] = contact;
        s[40] = PostCommon.knob(T, "ssaoRadius"); s[41] = 0.4; s[42] = 900; s[43] = 0;
        device.queue.writeBuffer(ssaoUBO, 0, s, 0, _Post.SSAO_UNIFORM_BYTES / 4);
        const p = encoder.beginRenderPass({ colorAttachments: [{ view: ssaoView, loadOp: "clear",
          clearValue: { r: 1, g: 1, b: 1, a: 1 }, storeOp: "store" }] });
        p.setPipeline(pSSAO); p.setBindGroup(0, ssaoBG); p.draw(3, 1, 0, 0); p.end();
        if (pBlur && ssaoBlurView && ssaoBlurSrcBG && ssaoBlurDstBG) {
          _blurSep(pBlur, ssaoView, ssaoBlurView, ssaoBlurSrcBG, ssaoBlurDstBG, 1 / halfW, 1 / halfH, 1);
        }
      }

      const grStr = o.godray != null ? o.godray : 0;
      const lampVol = ((o.mist || 0) > 0 && o.lampVol != null) ? o.lampVol : 0;
      const sunGR = !!SHD.shadowView && grStr > 0;
      const haveGR = godrayBG && lastFrame && lastFrame.invViewProj
        && (sunGR || lampVol > 0);
      if (haveGR) {
        const s = postScratch;
        const invVP = lastFrame && lastFrame.invViewProj;
        if (invVP && invVP.length >= 16) {
          _grInvTmp.set(invVP.length === 16 ? invVP : (invVP.length > 16 && invVP.subarray ? invVP.subarray(0, 16) : IDENT));
          _mul4(s.subarray(0, 16), _grInvTmp, Z01INV);
        } else s.set(IDENT, 0);
        s.set(SHD.rendered ? SHD.shadowLVPData : IDENT, 16);
        s.set(lampArmed ? SHD.lampShadowLVPData : IDENT, 32);
        const eye = frameEye || [0, 0, 0];
        s[48] = eye[0]; s[49] = eye[1]; s[50] = eye[2]; s[51] = 0;
        const sd = frameSunDir || [0.3, 0.6, 0.5];
        s[52] = sd[0]; s[53] = sd[1]; s[54] = sd[2]; s[55] = 0;
        const sc = frameSunColor || [1, 0.95, 0.85];
        s[56] = sc[0]; s[57] = sc[1]; s[58] = sc[2]; s[59] = 0;
        s[60] = sunGR ? grStr : 0;
        s[61] = lampVol;
        s[62] = o.mist != null ? o.mist : 0;
        s[63] = frameTime;
        s[64] = lastFrame && lastFrame.cloud != null ? lastFrame.cloud : 0;
        s[65] = lastFrame && lastFrame.cloudSpeed != null ? lastFrame.cloudSpeed : 1;
        s[66] = PostCommon.knob(T, "godrayAniso");
        s[67] = PostCommon.knob(T, "godrayFloor");
        let nL = 0, grLampIdx = -1;
        const L = lastFrame && lastFrame.lights;
        const total = L ? (L.length / 15) | 0 : 0;
        if (lampVol > 0 && total > 0) {
          const ex = eye[0], ey = eye[1], ez = eye[2];
          for (let i = 0; i < total; i++) {
            const off = i * 15;
            const dx = L[off] - ex, dy = L[off + 1] - ey, dz = L[off + 2] - ez;
            const e = _grSel[i];
            if (e) { e.d = dx * dx + dy * dy + dz * dz; e.o = off; e.i = i; }
            else _grSel[i] = { d: dx * dx + dy * dy + dz * dz, o: off, i: i };
          }
          _grSel.length = total;
          nL = _grKeepNearest(total, 6);
          const ld = grLightData;
          for (let i = 0; i < nL; i++) {
            const off = _grSel[i].o, b = i * 16;
            if (lampArmed && _grSel[i].i === SHD.lampIdx) grLampIdx = i;
            ld[b]    = L[off];    ld[b+1]  = L[off+1];  ld[b+2]  = L[off+2];  ld[b+3]  = L[off+6];
            ld[b+4]  = L[off+3];  ld[b+5]  = L[off+4];  ld[b+6]  = L[off+5];  ld[b+7]  = L[off+12];
            ld[b+8]  = L[off+7];  ld[b+9]  = L[off+8];  ld[b+10] = L[off+9];  ld[b+11] = L[off+13];
            ld[b+12] = L[off+10]; ld[b+13] = L[off+11]; ld[b+14] = L[off+14]; ld[b+15] = 0;
          }
          if (grLightSBO) device.queue.writeBuffer(grLightSBO, 0, ld, 0, nL * 16);
        }
        s[68] = nL;
        s[69] = grLampIdx;
        s[70] = 0; s[71] = 0;
        device.queue.writeBuffer(godrayUBO, 0, s, 0, _Post.GODRAY_UNIFORM_BYTES / 4);
        const p = encoder.beginRenderPass({ colorAttachments: [{ view: godrayView, loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }] });
        p.setPipeline(pGodray); p.setBindGroup(0, godrayBG); p.draw(3, 1, 0, 0); p.end();
        if (pBlurHDR && godrayBlurView && godrayBlurSrcBG && godrayBlurDstBG) {
          _blurSep(pBlurHDR, godrayView, godrayBlurView, godrayBlurSrcBG, godrayBlurDstBG,
            1 / halfW, 1 / halfH, (o.grLite || (!sunGR && _grLite)) ? 1 : 2);
        }
      }

      const bloomAmt = o.bloom != null ? o.bloom : 0.55;
      const threshold = o.threshold != null ? o.threshold : 0.75;
      const spread = PostCommon.knob(T, "bloomSpread");
      const nLv = bloomLv.length;
      const useLv = (o.bloomLevels > 0) ? Math.min(nLv, o.bloomLevels | 0) : nLv;
      if (bloomAmt > 0 && useLv > 0) {
        for (let i = 0; i < useLv; i++) {
          const src = i === 0 ? { w: tw, h: th } : bloomLv[i - 1];
          const s = postScratch;
          s[0] = 1 / src.w; s[1] = 1 / src.h; s[2] = i === 0 ? threshold : 0; s[3] = i === 0 ? 2 : i === 1 ? 1 : 0;
          s[4] = o.exposure != null ? o.exposure : 1.0; s[5] = s[6] = s[7] = 0;
          _writeUBOIfChanged(bloomDownUBO[i], 0, s, _Post.BLOOM_DOWN_UNIFORM_BYTES / 4);
          const p = encoder.beginRenderPass({ colorAttachments: [{ view: bloomLv[i].view,
            loadOp: "clear", clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }] });
          p.setPipeline(pBloomDown); p.setBindGroup(0, bloomDownBG[i]); p.draw(3, 1, 0, 0); p.end();
        }
        for (let i = useLv - 2; i >= 0; i--) {
          const s = postScratch;
          s[0] = 1 / bloomLv[i + 1].w; s[1] = 1 / bloomLv[i + 1].h; s[2] = spread; s[3] = 0;
          _writeUBOIfChanged(bloomUpUBO[i], 0, s, _Post.BLOOM_UP_UNIFORM_BYTES / 4);
          const last = i === 0;
          const p = encoder.beginRenderPass({ colorAttachments: [{ view: bloomLv[i].view,
            loadOp: last ? "clear" : "load",
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            storeOp: "store" }] });
          p.setPipeline(pBloomUp); p.setBindGroup(0, bloomUpBG[i]); p.draw(3, 1, 0, 0); p.end();
        }
      }

      {
        const s = postScratch;
        const bloomNorm = bloomAmt > 0 ? bloomAmt * 1.25 / Math.max(useLv - 1, 1) : 0;
        const flareStr = sun ? sun.flare * (o.flareMul != null ? o.flareMul : 1) : 0;
        const shaftMul = (bloomAmt > 0 && sun && sun.shaft > 0)
          ? (PostCommon.knob(T, "sunShaftMul")) * sun.shaft
          : 0.0;
        s[0] = exposure; s[1] = bloomNorm; s[2] = shaftMul; s[3] = flareStr;
        s[4] = sunUVx; s[5] = sunUVy;
        s[6] = PostCommon.knob(T, "whitePoint");
        s[7] = PostCommon.knob(T, "blackLift");
        s[8]  = PostCommon.knob(T, "contrast");
        s[9]  = PostCommon.knob(T, "vibrance");
        s[10] = PostCommon.knob(T, "saturation");
        s[11] = PostCommon.knob(T, "tint");
        s[12] = PostCommon.knob(T, "vignette");
        s[13] = PostCommon.knob(T, "grain");
        s[14] = frameTime;
        s[15] = PostCommon.knob(T, "sunShaftDecay");
        const grade = o.grade || null;
        const gsh = grade && grade.shadow ? grade.shadow : [1, 1, 1];
        const ghi = grade && grade.hi ? grade.hi : [1, 1, 1];
        s[16] = gsh[0]; s[17] = gsh[1]; s[18] = gsh[2];
        s[19] = grade && grade.str != null ? grade.str : 0;
        s[20] = ghi[0]; s[21] = ghi[1]; s[22] = ghi[2];
        const _shaftSpreadMul = PostCommon.knob(T, "sunShaftMul");
        s[23] = Math.sqrt(Math.max(0.05, _shaftSpreadMul));
        s[24] = 1 / tw; s[25] = 1 / th;
        s[26] = haveAO ? (1 / halfW) : 0; s[27] = haveAO ? (1 / halfH) : 0;
        s[28] = PostCommon.knob(T, "chromAb");
        s[29] = PostCommon.knob(T, "sharpen");
        s[30] = (o.speedBlur != null) ? o.speedBlur : (PostCommon.knob(T, "speedBlur"));
        s[31] = PostCommon.knob(T, "bloomKnee");
        s[32] = PostCommon.knob(T, "vignetteSoft");
        s[33] = PostCommon.knob(T, "flareStreak2");
        s[34] = PostCommon.knob(T, "acesE");
        s[35] = PostCommon.knob(T, "flareStreak");
        s[36] = PostCommon.knob(T, "blacks");
        s[37] = PostCommon.knob(T, "shadows");
        s[38] = PostCommon.knob(T, "midtones");
        s[39] = PostCommon.knob(T, "highlights");
        s[40] = PostCommon.knob(T, "whites");
        s[41] = PostCommon.knob(T, "toe");
        s[42] = PostCommon.knob(T, "shoulder");
        const _hg = PostCommon.hdrGradeOn(T);
        s[43] = _hg ? 1 : 0;
        s[44] = PostCommon.knob(T, "liftR");
        s[45] = PostCommon.knob(T, "liftG");
        s[46] = PostCommon.knob(T, "liftB");
        s[47] = haveGR ? 1 : 0;
        s[48] = PostCommon.knob(T, "gammaR");
        s[49] = PostCommon.knob(T, "gammaG");
        s[50] = PostCommon.knob(T, "gammaB");
        s[51] = _ssrRan && o.reflect != null ? o.reflect : 0;
        s[52] = PostCommon.knob(T, "gainR");
        s[53] = PostCommon.knob(T, "gainG");
        s[54] = PostCommon.knob(T, "gainB");
        s[55] = _ssrRan ? (o.carReflect != null ? o.carReflect
          : (PostCommon.knob(T, "carReflect"))) : 0;
        s[56] = PostCommon.knob(T, "acesA");
        s[57] = PostCommon.knob(T, "acesB");
        s[58] = PostCommon.knob(T, "acesC");
        s[59] = PostCommon.knob(T, "acesD");
        s[60] = PostCommon.knob(T, "lensDirt");
        const haze = o.haze || null;
        s[61] = haze && haze.u != null ? haze.u : 0;
        s[62] = haze && haze.v != null ? haze.v : 0;
        s[63] = haze && haze.str != null ? haze.str : 0;
        device.queue.writeBuffer(compositeUBO, 0, s, 0, _Post.COMPOSITE_UNIFORM_BYTES / 4);
        const p = encoder.beginRenderPass({ colorAttachments: [{ view: ldrView, loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }] });
        p.setPipeline(pComposite); p.setBindGroup(0, compositeBG); p.draw(3, 1, 0, 0); p.end();
      }

      {
        const useUpscale = !!(pSGSR && sgsrUBO && aaView && sgsrBG && wantSpatialUpscale());
        const s = postScratch;
        s[0] = 1 / tw; s[1] = 1 / th; s[2] = 0; s[3] = 0;
        _writeUBOIfChanged(fxaaUBO, 0, s, _Post.FXAA_UNIFORM_BYTES / 4);
        const fxaaView = useUpscale ? aaView : currentView;
        const fxaaPipe = useUpscale ? (pFXAALdr || pFXAA) : pFXAA;
        const p = encoder.beginRenderPass({ colorAttachments: [{ view: fxaaView, loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }] });
        p.setPipeline(fxaaPipe); p.setBindGroup(0, fxaaBG); p.draw(3, 1, 0, 0);
        if (!useUpscale) _mirrorComposite(exposure, o.tune, o, p);
        p.end();

        if (useUpscale) {
          s[0] = 1 / tw; s[1] = 1 / th; s[2] = tw; s[3] = th;
          _writeUBOIfChanged(sgsrUBO, 0, s, _Post.SGSR_UNIFORM_BYTES / 4);
          const p2 = encoder.beginRenderPass({ colorAttachments: [{ view: currentView, loadOp: "clear",
            clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }] });
          p2.setPipeline(pSGSR); p2.setBindGroup(0, sgsrBG); p2.draw(3, 1, 0, 0);
          _mirrorComposite(exposure, o.tune, o, p2);
          p2.end();
        }
      }

      } catch (postE) {
        if (_postReady) {
          try { Log.warn("gfx", "WGX post chain failed — tonemap blit fallback", postE); } catch (_) {  }
          _postReady = false;
        }
        _mirDone = false;
        _tonemapBlit(exposure);
      }

      let timerRead = null;
      const timerEpoch = _gpuFrameTimerEpoch;
      const timerSampleAt = _gpuTimerOn ? _nowMs() : -1;
      if (_gpuTimerOn && timerEpoch === _gpuTimerEpoch && _gpuQuerySet && _gpuResolveBuf && _gpuReadBuf && _gpuReadBuf.mapState === "unmapped") {
        try {
          encoder.resolveQuerySet(_gpuQuerySet, 0, 2, _gpuResolveBuf, 0);
          encoder.copyBufferToBuffer(_gpuResolveBuf, 0, _gpuReadBuf, 0, 16);
          timerRead = _gpuReadBuf;
        } catch (_) {  }
      }
      _mirrorComposite(exposure, _postReady ? o.tune : _TONE_STANDIN, _postReady ? o : null);
      const disp = _softDisplayEncode();
      const _cap = _capEncode();
      try { device.queue.submit(SHD.frameSubmitList(encoder)); }
      catch (e) { _capAbort(_cap); _softDisplayAbort(disp); throw e; }
      _retireFlush();
      _capFinish(_cap);
      _softDisplayFinish(disp);
      _readOutputProbe();
      if (timerRead && typeof timerRead.mapAsync === "function") {
        try {
          timerRead.mapAsync(GPUMapMode.READ).then(function () {
            try {
              if (_gpuTimerOn && timerEpoch === _gpuTimerEpoch) {
                const t = new BigUint64Array(timerRead.getMappedRange());
                _gpuMs = Number(t[1] - t[0]) / 1e6;
                _gpuSampleAt = timerSampleAt; _gpuSamples++;
              }
            } catch (_) {  }
            try { timerRead.unmap(); } catch (_) {  }
          }, function () {  });
        } catch (_) {  }
      }
      encoder = null; currentView = null;
      _jsStrikes = 0;
      if (!_okCounted) { _okCounted = true; _healTick(); }
      } catch (e) {
        _jsStrike("present", e);
        if (_capReq) { const r = _capReq; _capReq = null; r.reject(e); }
      }
    }


    function _matLayerBytes(size, images, n) {
      const out = new Array(n).fill(null);
      if (typeof Assets === "undefined" || !Assets.readLayerBytes) return out;
      const page = size * size * 4;
      const data = new Uint8Array(page * n);
      let done = [];
      try { done = Assets.readLayerBytes(size, images, n, data); } catch (_) { done = []; }
      for (const i of done) out[i] = data.subarray(i * page, (i + 1) * page);
      return out;
    }
    function createTextureArray(size, images, layers) {
      if (!size || !images) return null;
      const n = layers || MAT_TEX_LAYERS;
      let tex = null;
      try {
        const mips = Math.floor(Math.log2(size)) + 1;
        tex = device.createTexture({
          size: [size, size, n], format: "rgba8unorm", mipLevelCount: mips,
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        const tok = { _wgx: "texarray", texture: tex, view: tex.createView({ dimension: "2d-array" }), layers: n };
        const expected = [];
        for (let i = 0; i < n; i++) if (images[i]) expected.push(i);
        let filled = 0;
        const written = new Set();
        const bpr = size * 4;
        const writeLayer = (i, bytes) => {
          const img = images[i];
          if (!img || !tok.view) return;
          try {
            if (bytes && bytes.length >= bpr * size) {
              device.queue.writeTexture({ texture: tex, origin: [0, 0, i] }, bytes,
                { bytesPerRow: bpr, rowsPerImage: size }, [size, size, 1]);
            } else {
              device.queue.copyExternalImageToTexture(
                { source: img, flipY: false },
                { texture: tex, origin: [0, 0, i], premultipliedAlpha: false },
                [size, size]);
            }
            written.add(i);
            filled++;
          } catch (_) {  }
        };
        const job = _packAsync && typeof Assets !== "undefined" && Assets.readLayerBytesAsync
          ? Assets.readLayerBytesAsync(size, images, n, new Uint8Array(size * size * 4 * n), writeLayer) : null;
        if (job) {
          tok.pending = true;
          _matPendingFills++;
          const settle = (ok) => {
            tok.pending = false; _matPendingFills--;
            if (!tok.view) return false;
            if (!ok || !filled) { freeTexture(tok); return false; }
            _generateMips(tex, n);
            return true;
          };
          tok.ready = job.then(() => settle(written.size === expected.length), () => settle(false));
          return tok;
        }
        const layerBytes = _matLayerBytes(size, images, n);
        for (let i = 0; i < n; i++) writeLayer(i, layerBytes[i]);
        if (!filled || written.size !== expected.length) {
          try { tex.destroy(); } catch (_) {  }
          return null;
        }
        _generateMips(tex, n);
        return tok;
      } catch (_) {
        if (tex) try { tex.destroy(); } catch (__) {  }
        return null; 
      }
    }
    function _releaseOwnedMatMaps(keep) {
      const kept = new Set();
      if (keep) {
        if (keep.albedo && keep.albedo.texture) kept.add(keep.albedo.texture);
        if (keep.normal && keep.normal.texture) kept.add(keep.normal.texture);
      }
      const seen = new Set();
      for (const tok of [_matOwnedAlbedo, _matOwnedNormal]) {
        if (!tok || !tok.texture || seen.has(tok.texture) || kept.has(tok.texture)) continue;
        seen.add(tok.texture);
        _retiredBufs.push(tok.texture);
      }
      _matOwnedAlbedo = null;
      _matOwnedNormal = null;
    }
    function setMaterialMaps(maps) {
      const gen = ++_matBindGen;
      const toks = maps ? [maps.albedo, maps.normal] : [];
      _matRequested = new Set(toks);
      const waits = toks.filter((t) => t && t.pending && t.ready).map((t) => t.ready);
      if (!waits.length) { _setMaterialMapsNow(maps); return; }
      _matPendingBinds++;
      Promise.all(waits).then(() => {
        _matPendingBinds--;
        const live = (t) => !!(t && t.view && !t.pending);
        const a = live(maps.albedo) ? maps.albedo : null, nn = live(maps.normal) ? maps.normal : null;
        if (gen !== _matBindGen || !a) {
          for (const t of new Set([a, nn])) if (t && (gen === _matBindGen || !_matRequested.has(t))) freeTexture(t);
          return;
        }
        _setMaterialMapsNow({ albedo: a, normal: nn, scales: maps.scales });
      });
    }
    function _setMaterialMapsNow(maps) {
      _releaseOwnedMatMaps(maps);
      matAlbedoView = matPlaceAlbedoView;
      matNormalView = matPlaceNormalView;
      _matAlbedoOn = false;
      _matNormalOn = false;
      _matScales.fill(0);
      matScaleData.fill(0);
      if (!maps) {
        if (matScaleUBO) device.queue.writeBuffer(matScaleUBO, 0, matScaleData);
        _rebuildFrameBG();
        return;
      }
      if (maps.albedo && maps.albedo.view) {
        matAlbedoView = maps.albedo.view;
        _matAlbedoOn = true;
        _matOwnedAlbedo = maps.albedo;
      }
      if (maps.normal && maps.normal.view) {
        matNormalView = maps.normal.view;
        _matNormalOn = true;
        _matOwnedNormal = maps.normal;
      }
      const sc = maps.scales;
      if (sc) for (let i = 0; i < MAT_TEX_LAYERS; i++) _matScales[i] = +sc[i] > 0 ? +sc[i] : 0;
      if (!_matAlbedoOn) _matScales.fill(0);
      matScaleData.set(_matScales);
      if (matScaleUBO) device.queue.writeBuffer(matScaleUBO, 0, matScaleData);
      _rebuildFrameBG();
    }
    function materialMapState() {
      let layers = 0;
      for (let i = 0; i < MAT_TEX_LAYERS; i++) if (_matScales[i] > 0) layers++;
      return { albedo: _matAlbedoOn, normal: _matNormalOn, layers, scales: Array.from(_matScales),
        pending: _matPendingFills + _matPendingBinds };
    }

    function gpuTimer(on) {
      if (on !== undefined) {
        const next = !!on && !!_timestampOk;
        if (next !== _gpuTimerOn) { _gpuTimerEpoch++; _gpuSamples = 0; _gpuSampleAt = -1; }
        _gpuTimerOn = next;
        if (!_gpuTimerOn) _gpuMs = -1;
      }
      return { supported: !!_timestampOk, on: _gpuTimerOn, scope: "lit-pass",
        samples: _gpuSamples, sampleAgeMs: _gpuSampleAt < 0 ? -1 : Math.max(0, _nowMs() - _gpuSampleAt) };
    }
    function gpuMs() { return _gpuMs; }

    function createInstancedBatch(data, matrices, colors, opts) {
      const mesh = createMesh(data);
      const n = (matrices && matrices.length) ? (matrices.length / 16) | 0 : 0;
      const packed = new Float32Array(n * 20);
      for (let i = 0; i < n; i++) {
        packed.set(matrices.subarray ? matrices.subarray(i * 16, i * 16 + 16) : matrices.slice(i * 16, i * 16 + 16), i * 20);
        if (colors && colors.length) {
          packed[i * 20 + 16] = colors[i * 3];
          packed[i * 20 + 17] = colors[i * 3 + 1];
          packed[i * 20 + 18] = colors[i * 3 + 2];
        } else {
          packed[i * 20 + 16] = packed[i * 20 + 17] = packed[i * 20 + 18] = 1;
        }
      }
      try {
        mesh.instBuf = n ? _mkBuffer(packed, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST) : identInstanceBuf;
      } catch (e) {
        _allocFail("createInstancedBatch", e);
        mesh.instBuf = identInstanceBuf;
        mesh.instances = 0; mesh.visible = 0; mesh._instPacked = null;
        return mesh;
      }
      mesh.instances = n;
      mesh.visible = n;
      mesh._instPacked = packed;
      mesh.srcMatrices = matrices;
      mesh.srcColors = colors && colors.length ? colors : null;
      if (opts && opts.cellSize > 0 && n) {
        const cell = opts.cellSize;
        mesh.cells = Frustum.bucketInstances(matrices, n, data.pos, cell, opts.radius);
      }
      return mesh;
    }
    function _mirrorView(batch) {
      let v = batch._mir;
      if (!v) {
        if (batch._mirFail || !batch._instPacked || !batch.instBuf || batch.instBuf === identInstanceBuf) return null;
        const packed = new Float32Array(batch._instPacked);
        let ib;
        try { ib = _mkBuffer(packed, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST); } catch (e) { batch._mirFail = true; _allocFail("mirrorInstances", e); return null; }
        v = batch._mir = { cells: batch.cells, srcMatrices: batch.srcMatrices, srcColors: batch.srcColors, instances: batch.instances,
          _instPacked: packed, instBuf: ib, visible: 0, _pass: -1 };
      }
      v._pass = _mirPassSeq;
      return v;
    }
    function cullInstances(batch, planes, opts) {
      if (!batch || !batch.cells) return batch ? batch.instances : 0;
      const shadow = !!(opts && opts.upload === false);
      const eye = shadow ? null : frameEye, cd = shadow ? 0 : frameCullDist,
            fog = shadow ? null : frameCullFog;
      const tb = (!shadow && _mirEncoder && _mirrorView(batch)) || batch;
      let samePack = !shadow && !!tb._cullPlanes && InstCells.sameRadial(tb, eye, cd, fog);
      if (samePack) {
        let po = 0;
        for (let pi = 0; pi < 6 && samePack; pi++) {
          const p = planes[pi];
          for (let k = 0; k < 4; k++, po++) {
            if (tb._cullPlanes[po] !== p[k]) { samePack = false; break; }
          }
        }
      }
      if (samePack) { tb.visible = tb._cullN; return tb._cullN; }
      const cs = tb.cells, cn = cs.length;
      const ks = InstCells.scratchKeys(tb, cn);
      let kN = InstCells.collectVisible(planes, cs, ks, Frustum.aabbInFrustum, eye, cd, fog);
      if (!shadow && InstCells.enabled() && InstCells.sameKey(tb, ks, kN)) {
        tb.visible = tb._cullN; return tb._cullN;
      }
      if (shadow) {
        const reach = opts.reach && opts.reach[3] > 0 ? opts.reach : null, r2 = reach ? reach[3] * reach[3] : 0;
        if (reach) {
          let w = 0;
          for (let i = 0; i < kN; i++) { const c = cs[ks[i]]; if (Frustum.aabbDist2(c.mn, c.mx, reach[0], reach[1], reach[2]) <= r2) ks[w++] = ks[i]; }
          kN = w;
        }
        const sk = batch._shKey;
        if (sk && InstCells.enabled() && batch._shKeyN === kN && batch._shadowPacked && batch.shadowInstBuf) {
          let same = true;
          for (let i = 0; i < kN && same; i++) same = sk[i] === ks[i];
          if (same) return batch._shadowN;
        }
      }
      const src = tb.srcMatrices;
      const dst = shadow ? (_shadowPackFor(batch) || batch._instPacked) : tb._instPacked;
      const sc = shadow ? null : tb.srcColors;
      let n = 0;
      for (let ci = 0; ci < kN; ci++) {
        const idx = cs[ks[ci]].idx;
        for (let j = 0, jn = idx.length; j < jn; j++) {
          const i = idx[j];
          const so = i * 16, dOff = n * 20;
          for (let k = 0; k < 16; k++) dst[dOff + k] = src[so + k];
          if (sc) {
            dst[dOff + 16] = sc[i * 3]; dst[dOff + 17] = sc[i * 3 + 1]; dst[dOff + 18] = sc[i * 3 + 2];
          }
          n++;
        }
      }
      if (shadow) {
        batch._shadowN = n;
        if (n && batch.shadowInstBuf && dst === batch._shadowPacked) {
          device.queue.writeBuffer(batch.shadowInstBuf, 0, dst, 0, n * 20);
        }
        if (dst === batch._shadowPacked && InstCells.enabled()) {
          const sk = batch._shKey && batch._shKey.length >= cn ? batch._shKey : (batch._shKey = new Int32Array(cn));
          for (let i = 0; i < kN; i++) sk[i] = ks[i];
          batch._shKeyN = kN;
        } else batch._shKeyN = -1;
        return n;
      }
      tb.visible = n;
      if (n && tb.instBuf && tb.instBuf !== identInstanceBuf) {
        device.queue.writeBuffer(tb.instBuf, 0, dst, 0, n * 20);
      }
      const snap = tb._cullPlanes || (tb._cullPlanes = new Float64Array(24));
      for (let pi = 0, po = 0; pi < 6; pi++) {
        const p = planes[pi];
        for (let k = 0; k < 4; k++, po++) snap[po] = p[k];
      }
      InstCells.recordRadial(tb, eye, cd, fog);
      tb._cullN = n;
      if (InstCells.enabled()) InstCells.recordKey(tb, ks, kN);
      return n;
    }
    function updateInstances(batch, matrices, n, colors) {
      if (_lost || !batch || !batch._instPacked || !batch.instBuf || batch.instBuf === identInstanceBuf) return 0;
      const v = Math.max(0, Math.min(batch.instances | 0, n | 0)), dst = batch._instPacked;
      for (let i = 0; i < v; i++) {
        const so = i * 16, d = i * 20;
        for (let k = 0; k < 16; k++) dst[d + k] = matrices[so + k];
        if (colors) {
          dst[d + 16] = colors[i * 3]; dst[d + 17] = colors[i * 3 + 1]; dst[d + 18] = colors[i * 3 + 2];
        }
      }
      batch.visible = v;
      batch._cullPlanes = null;
      InstCells.invalidate(batch);
      if (v > 0) device.queue.writeBuffer(batch.instBuf, 0, dst, 0, v * 20);
      return v;
    }
    function drawInstanced(batch, opts) {
      if (!litPass || !batch || !batch.vbuf || !batch.instances) return;
      const mv = _mirEncoder && batch._mir;
      const src = mv && mv._pass === _mirPassSeq ? mv : batch;
      const n = src.visible === undefined ? batch.instances : src.visible;
      if (n <= 0) return;
      const slot = _drawSlot++;
      if (slot >= MAX_DRAWS) return;
      const o = _instDrawOpts;
      for (const k in o) { if (k !== "_instanced") o[k] = undefined; }
      if (opts) { for (const k in opts) o[k] = opts[k]; }
      o._instanced = true;
      _writeDraw(slot, IDENT, o);
      drawRing[slot * DRAW_F32_STRIDE + 35] = _packDraw(batch, o);
      _setPipe(litPass, _litPipeline(o));
      _setBG0(litPass, _activeFrameBG);
      _dynOff[0] = slot * DRAW_STRIDE;
      litPass.setBindGroup(1, drawBindGroup, _dynOff);
      _bindLitVerts(litPass, batch.vbuf, src.instBuf || identInstanceBuf, batch.attrBG);
      _drawGeom(litPass, batch, n);
    }
    function freeInstancedBatch(batch) {
      if (!batch) return;
      if (batch.instBuf && batch.instBuf !== identInstanceBuf) _freeBuf(batch.instBuf);
      if (batch.shadowInstBuf) { _freeBuf(batch.shadowInstBuf); batch.shadowInstBuf = null; }
      if (batch._mir) { _freeBuf(batch._mir.instBuf); batch._mir = null; }
      batch._shadowPacked = null; batch._shKeyN = -1;
      freeMesh(batch);
    }

    function drawParticles(data, floatCount, additive, dirty) {
      if (!litPass || !pParticle || !data || !(floatCount > 0)) return;
      const nVert = (floatCount / 10) | 0;
      if (nVert <= 0) return;
      const i = _particleFlip++ & 1;
      if (!_particleCap[i] || _particleCap[i] < floatCount) {
        if (particleVBO[i]) _retiredBufs.push(particleVBO[i]);
        _particleCap[i] = Math.max(floatCount, 2560);
        particleVBO[i] = device.createBuffer({
          size: _particleCap[i] * 4,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        _particleLast[i] = null;
      }
      const last = _particleLast[i], add = additive ? 1 : 0;
      if (dirty !== false || !last || last.data !== data || last.add !== add || last.n !== floatCount) {
        device.queue.writeBuffer(particleVBO[i], 0, data, 0, floatCount);
        _particleLast[i] = { data, add, n: floatCount };
      }
      const s = fxScratch;
      s.set(frameVPGpu, 0);
      const eye = frameEye || [0, 0, 0];
      s[16] = eye[0]; s[17] = eye[1]; s[18] = eye[2]; s[19] = additive ? 1 : 0;
      const pf = _particleFrame;
      s[20] = pf.sun[0]; s[21] = pf.sun[1]; s[22] = pf.sun[2]; s[23] = pf.fogDensity;
      s[24] = pf.ambSky[0]; s[25] = pf.ambSky[1]; s[26] = pf.ambSky[2]; s[27] = 0;
      s[28] = pf.ambGround[0]; s[29] = pf.ambGround[1]; s[30] = pf.ambGround[2]; s[31] = 0;
      s[32] = pf.fogColor[0]; s[33] = pf.fogColor[1]; s[34] = pf.fogColor[2]; s[35] = 0;
      device.queue.writeBuffer(particleUBO[i], 0, s, 0, 36);
      _setPipe(litPass, additive && pParticleAdd ? pParticleAdd : pParticle);
      if (_particleBG[i]) _setBG0(litPass, _particleBG[i]);
      _setVB0(litPass, particleVBO[i]);
      litPass.draw(nVert);
    }


    function _writeQuadFx(slot, model, w, l, p2, p3) {
      const base = slot * FX_F32_STRIDE;
      const s = quadFxRing;
      s.set(frameVPGpu, base);
      s.set(model && model.length === 16 ? model : (model && model.length > 16 && model.subarray ? model.subarray(0, 16) : IDENT), base + 16);
      s[base + 32] = w; s[base + 33] = l; s[base + 34] = p2; s[base + 35] = p3;
    }
    function _drawQuadStamp(pipeline, model, w, l, p2, p3) {
      if (!_fxReady || !litPass || !pipeline) return;
      const slot = _fxQuadSlot++;
      if (slot >= FX_QUAD_SLOTS) { _fxQuadOverflow++; return; }
      _writeQuadFx(slot, model, w, l, p2, p3);
      _setPipe(litPass, pipeline);
      _fxQuadDynOff[0] = slot * FX_STRIDE;
      _setBG0(litPass, quadFxBG, _fxQuadDynOff);
      _setVB0(litPass, quadFxVBO);
      litPass.draw(6, 1, 0, 0);
    }
    function drawShadow(model, w, l) { _drawQuadStamp(pBlob, model, w, l, 0.25, 0.45); }
    function drawMark(model, w, l)   { _drawQuadStamp(pMark, model, w, l, 0.38, 0.0); }

    function drawSkidBatch(verts, vertCount, dirty) {
      if (!_fxReady || !litPass || !pSkid) return false;
      if (!(vertCount > 0)) return true;
      const floats9 = vertCount * 9;
      const bytes = floats9 * 4;
      if (!skidVBO || _skidCap < bytes) {
        if (skidVBO) _retiredBufs.push(skidVBO);
        _skidCap = Math.max(bytes, 4096);
        skidVBO = device.createBuffer({ size: (_skidCap + 3) & ~3, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
        dirty = true;
      }
      if (dirty) {
        if (!_skidScratch || _skidScratch.length < floats9) _skidScratch = new Float32Array(floats9);
        const dst = _skidScratch;
        for (let v = 0; v < vertCount; v++) {
          const si = v * 5, di = v * 9;
          dst[di] = verts[si]; dst[di+1] = verts[si+1]; dst[di+2] = verts[si+2];
          dst[di+3] = verts[si+3]; dst[di+4] = verts[si+4];
          dst[di+5] = 0; dst[di+6] = 0; dst[di+7] = 0; dst[di+8] = 1;
        }
        device.queue.writeBuffer(skidVBO, 0, dst, 0, floats9);
      }
      device.queue.writeBuffer(skidUBO, 0, frameVPGpu);
      _setPipe(litPass, pSkid);
      _setBG0(litPass, skidFxBG);
      _setVB0(litPass, skidVBO);
      litPass.draw(vertCount, 1, 0, 0);
      return true;
    }

    function drawDrivingLine(verts, vertCount, dirty, opts) {
      if (!_fxReady || !litPass || !pLine) return false;
      if (!(vertCount > 0)) return true;
      const floats = vertCount * 7;
      const bytes = floats * 4;
      if (!lineVBO || _lineCap < bytes) {
        if (lineVBO) _retiredBufs.push(lineVBO);
        _lineCap = Math.max(bytes, 4096);
        lineVBO = device.createBuffer({ size: (_lineCap + 3) & ~3, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
        dirty = true;
      }
      if (dirty) device.queue.writeBuffer(lineVBO, 0, verts, 0, floats);
      _lineU.set(frameVPGpu, 0);
      _lineU[16] = (opts && opts.speed) || 0;
      _lineU[17] = opts && opts.cornersOnly ? 1 : 0;
      _lineU[18] = 1.6;
      _lineU[19] = 0;
      _lineU[20] = (opts && opts.opacity) || 1;
      const lc = (opts && opts.cols) || LINE_COLS_F1;
      for (let k = 0; k < 3; k++) { const o = 24 + k * 4; _lineU[o] = lc[k * 3]; _lineU[o + 1] = lc[k * 3 + 1]; _lineU[o + 2] = lc[k * 3 + 2]; }
      device.queue.writeBuffer(lineUBO, 0, _lineU);
      _setPipe(litPass, pLine);
      _setBG0(litPass, lineFxBG);
      _setVB0(litPass, lineVBO);
      litPass.draw(vertCount, 1, 0, 0);
      return true;
    }

    function drawGlow(lights, str) {
      if (!_fxReady || !litPass || !pGlow || !lights || !lights.length || !(str > 0)) return;
      const nL = (lights.length / 15) | 0, floatsPerLamp = 6 * 9;
      if (!_glowScratch || _glowScratch.length < nL * floatsPerLamp) _glowScratch = new Float32Array(nL * floatsPerLamp);
      const gd = _glowScratch;
      const ex = frameEye ? frameEye[0] : 0, ey = frameEye ? frameEye[1] : 0, ez = frameEye ? frameEye[2] : 0;
      let p = 0, nDraw = 0;
      for (let i = 0; i < nL; i++) {
        const o = i * 15, glareW = lights[o + 14];
        if (!(glareW > 0)) continue;
        const cx = lights[o], cy = lights[o + 1], cz = lights[o + 2];
        const dxE = cx - ex, dyE = cy - ey, dzE = cz - ez, dEye = Math.sqrt(dxE*dxE + dyE*dyE + dzE*dzE);
        const fade = Math.min(1, Math.max(0, (170 - dEye) / 110));
        if (fade <= 0) continue;
        let r = lights[o + 3], g = lights[o + 4], b = lights[o + 5];
        const rad = lights[o + 6], cm = Math.max(r, g, b) || 1;
        const csc = Math.min(1, 3.2 / cm) * (0.5 + 0.5 * Math.min(1, cm / 40)) * fade * glareW;
        r *= csc; g *= csc; b *= csc;
        const brad = Math.min(2.2, rad * 0.10) * (0.7 + 0.6 * Math.min(glareW, 2));
        for (let v = 0; v < 6; v++) {
          const c = _glowCorners[v];
          gd[p++] = c[0]; gd[p++] = c[1]; gd[p++] = cx; gd[p++] = cy; gd[p++] = cz;
          gd[p++] = r; gd[p++] = g; gd[p++] = b; gd[p++] = brad;
        }
        nDraw++;
      }
      if (!nDraw) return;
      const bytes = p * 4;
      if (!glowVBO || _glowCap < bytes) {
        if (glowVBO) _retiredBufs.push(glowVBO);
        _glowCap = Math.max(bytes, 4096);
        glowVBO = device.createBuffer({ size: (_glowCap + 3) & ~3, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      }
      device.queue.writeBuffer(glowVBO, 0, gd, 0, p);
      const gu = fxScratch;
      gu.set(frameVPGpu, 0);
      gu[16] = ex; gu[17] = ey; gu[18] = ez; gu[19] = str;
      device.queue.writeBuffer(glowUBO, 0, gu, 0, 20);
      _setPipe(litPass, pGlow);
      _setBG0(litPass, glowFxBG);
      _setVB0(litPass, glowVBO);
      litPass.draw(nDraw * 6, 1, 0, 0);
    }

    function drawDecal(mesh, model, tex, opts) {
      if (!_fxReady || !litPass || !pDecal || !mesh || !mesh.count || !mesh.vbuf || !tex || !tex.view) return;
      const slot = _fxDecalSlot++;
      if (slot >= FX_DECAL_SLOTS) return;
      const base = slot * FX_F32_STRIDE;
      const s = decalFxRing, o = opts || {};
      s.set(model && model.length === 16 ? model : (model && model.length > 16 && model.subarray ? model.subarray(0, 16) : IDENT), base);
      s.set(frameVPGpu, base + 16);
      const sd = frameSunDir || [0.3,0.6,0.5];
      const Td = frameTune || null;
      const kM = Td && Td.keyMul != null ? Td.keyMul : 1;
      const sc = frameSunColor || _DECAL_SUN;
      const ambM = Td && Td.ambientMul != null ? Td.ambientMul : 1;
      const asky = frameAmbSky || _DECAL_ASKY, agr = frameAmbGround || _DECAL_AGR;
      s[base + 32] = sd[0]; s[base + 33] = sd[1]; s[base + 34] = sd[2]; s[base + 35] = 0;
      s[base + 36] = sc[0] * kM; s[base + 37] = sc[1] * kM; s[base + 38] = sc[2] * kM; s[base + 39] = 0;
      s[base + 40] = asky[0] * ambM; s[base + 41] = asky[1] * ambM; s[base + 42] = asky[2] * ambM; s[base + 43] = 0;
      s[base + 44] = agr[0] * ambM;  s[base + 45] = agr[1] * ambM;  s[base + 46] = agr[2] * ambM;  s[base + 47] = 0;
      const uvr = o.uvRect || null;
      s[base + 48] = uvr ? uvr[0] : 0; s[base + 49] = uvr ? uvr[1] : 0; s[base + 50] = uvr ? uvr[2] : 1; s[base + 51] = uvr ? uvr[3] : 1;
      const tint = o.tint || null;
      s[base + 52] = tint ? tint[0] : 1; s[base + 53] = tint ? tint[1] : 1; s[base + 54] = tint ? tint[2] : 1;
      s[base + 55] = o.glow || 0;
      let bg = tex._wgxDecalBG;
      if (!bg) {
        bg = device.createBindGroup({ layout: fxDecalLayout, entries: [
          { binding: 0, resource: { buffer: decalUBO, offset: 0, size: _Fx.DECAL_UNIFORM_BYTES } },
          { binding: 1, resource: tex.view },
          { binding: 2, resource: linearSampler },
        ] });
        tex._wgxDecalBG = bg;
      }
      if (!_activeFrameBG) return;
      _setPipe(litPass, pDecal);
      _fxDecalDynOff[0] = slot * FX_STRIDE;
      _setBG0(litPass, bg, _fxDecalDynOff);
      litPass.setBindGroup(1, _activeFrameBG);
      _setVB0(litPass, mesh.vbuf);
      _setIB(litPass, mesh.ibuf, mesh.indexFormat);
      litPass.drawIndexed(mesh.count);
    }

    async function _selfTest() {
      const mods = [["lit", litModule], ["sky", skyModule], ["blit", blitModule],
                    ["shadow", SHD.shadowModule]];
      for (let i = 0; i < mods.length; i++) {
        const name = mods[i][0], mod = mods[i][1];
        if (!mod || typeof mod.getCompilationInfo !== "function") continue;
        let info = null;
        try { info = await mod.getCompilationInfo(); } catch (_) { continue;  }
        const msgs = (info && info.messages) || [];
        for (let j = 0; j < msgs.length; j++) {
          const m = msgs[j];
          if (m && m.type === "error") {
            return name + " shader compile error: " + ((m.message || "").slice(0, 200));
          }
        }
      }

      const scoped = typeof device.pushErrorScope === "function" &&
                     typeof device.popErrorScope === "function";

      if (scoped) device.pushErrorScope("validation");
      let litErr = null;
      try { _litPipeline({}); } catch (e) { litErr = (e && e.message) || String(e); }
      if (scoped) {
        const gpuErr = await device.popErrorScope();
        if (!litErr && gpuErr) litErr = (gpuErr.message || "invalid lit pipeline");
      }
      if (litErr) return "lit pipeline: " + String(litErr).slice(0, 200);

      if (MSAA_COUNT > 1) {
        if (scoped) device.pushErrorScope("validation");
        let msErr = null;
        try {
          _passSamples = MSAA_COUNT;
          _litPipeline({});
          if (!skyPipelineMS) msErr = "sky MSAA pipeline missing";
        } catch (e) { msErr = (e && e.message) || String(e); }
        _passSamples = 1;
        if (scoped) {
          const gpuErr = await device.popErrorScope();
          if (!msErr && gpuErr) msErr = (gpuErr.message || "invalid MSAA pipeline");
        }
        if (msErr) return "msaa pipeline: " + String(msErr).slice(0, 200);
      }

      const canRead = typeof GPUMapMode !== "undefined" &&
        typeof Uint8Array !== "undefined" &&
        ((GPUTextureUsage && GPUTextureUsage.COPY_SRC) | 0) > 0 &&
        ((GPUBufferUsage && GPUBufferUsage.MAP_READ) | 0) > 0 &&
        typeof device.createCommandEncoder === "function" &&
        blitPipeline && typeof blitPipeline.getBindGroupLayout === "function";
      if (!canRead) return _bootError ? ("gpu error during init: " + _bootError) : null;

      let src = null, dst = null, buf = null, reason = null;
      if (scoped) device.pushErrorScope("validation");
      try {
        src = device.createTexture({
          size: [1, 1], format: SCENE_FORMAT,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        dst = device.createTexture({
          size: [4, 4], format: _presentFormat,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });
        buf = device.createBuffer({ size: 256 * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        const enc = device.createCommandEncoder();
        if (typeof enc.copyTextureToBuffer !== "function" || typeof buf.mapAsync !== "function" ||
            typeof buf.getMappedRange !== "function") {
          throw { _skip: true };
        }
        device.queue.writeBuffer(blitUBO, 0, _blitParams(new Float32Array(BLIT_BYTES / 4), 1, _TONE_STANDIN));
        const bg = device.createBindGroup({
          layout: blitPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: src.createView() },
            { binding: 1, resource: linearSampler },
            { binding: 2, resource: { buffer: blitUBO } },
          ],
        });
        const p0 = enc.beginRenderPass({ colorAttachments: [{ view: src.createView(),
          clearValue: { r: 1, g: 1, b: 1, a: 1 }, loadOp: "clear", storeOp: "store" }] });
        p0.end();
        const p1 = enc.beginRenderPass({ colorAttachments: [{ view: dst.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" }] });
        p1.setPipeline(blitPipeline);
        p1.setBindGroup(0, bg);
        p1.draw(3);
        p1.end();
        enc.copyTextureToBuffer({ texture: dst }, { buffer: buf, bytesPerRow: 256, rowsPerImage: 4 }, [4, 4, 1]);
        device.queue.submit([enc.finish()]);
        await buf.mapAsync(GPUMapMode.READ);
        const px = new Uint8Array(buf.getMappedRange().slice(0, 4));
        buf.unmap();
        if (!(px[0] > 8 || px[1] > 8 || px[2] > 8)) reason = "smoke test rendered black";
      } catch (e) {
        if (!(e && e._skip)) reason = "smoke test threw: " + (((e && e.message) || String(e)).slice(0, 200));
      }
      if (scoped) {
        const gpuErr = await device.popErrorScope();
        if (!reason && gpuErr) reason = "smoke test validation: " + String(gpuErr.message || "error").slice(0, 200);
      }
      for (const resource of [src, dst, buf]) {
        try { if (resource) resource.destroy(); } catch (_) {  }
      }
      if (reason) return reason;
      if (_bootError) return "gpu error during init: " + _bootError;
      return null;
    }

    async function _selfTestPresent() {
      if (!ctx || width < 1 || height < 1) return null;
      const canRead = typeof GPUMapMode !== "undefined" &&
        ((GPUTextureUsage && GPUTextureUsage.COPY_SRC) | 0) > 0 &&
        ((GPUBufferUsage && GPUBufferUsage.MAP_READ) | 0) > 0;
      if (!canRead || !blitPipeline) return null;
      let buf = null, src = null, reason = null;
      const scoped = typeof device.pushErrorScope === "function" &&
                     typeof device.popErrorScope === "function";
      let gpuErrP = null;
      const popScope = function () {
        if (!scoped || gpuErrP) return;
        gpuErrP = device.popErrorScope();
        gpuErrP.catch(function () {  });
      };
      if (scoped) device.pushErrorScope("validation");
      try {
        let tex;
        try { tex = ctx.getCurrentTexture(); } catch (_) { throw { _skip: true }; }
        const tw = Math.min(64, width), th = Math.min(64, height);
        src = device.createTexture({
          size: [1, 1], format: SCENE_FORMAT,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        buf = device.createBuffer({ size: 256 * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        device.queue.writeBuffer(blitUBO, 0, _blitParams(new Float32Array(BLIT_BYTES / 4), 1, _TONE_STANDIN));
        const bg = device.createBindGroup({
          layout: blitPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: src.createView() },
            { binding: 1, resource: linearSampler },
            { binding: 2, resource: { buffer: blitUBO } },
          ],
        });
        const enc = device.createCommandEncoder();
        if (typeof enc.copyTextureToBuffer !== "function" || typeof buf.mapAsync !== "function" ||
            typeof buf.getMappedRange !== "function") {
          throw { _skip: true };
        }
        enc.beginRenderPass({ colorAttachments: [{ view: src.createView(),
          clearValue: { r: 1, g: 1, b: 1, a: 1 }, loadOp: "clear", storeOp: "store" }] }).end();
        const pass = enc.beginRenderPass({ colorAttachments: [{ view: tex.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" }] });
        pass.setPipeline(blitPipeline);
        pass.setBindGroup(0, bg);
        pass.draw(3);
        pass.end();
        enc.copyTextureToBuffer(
          { texture: tex, origin: [Math.max(0, (width >> 1) - 2), Math.max(0, (height >> 1) - 2), 0] },
          { buffer: buf, bytesPerRow: 256, rowsPerImage: 4 },
          [4, 4, 1]);
        device.queue.submit([enc.finish()]);
        const mapP = buf.mapAsync(GPUMapMode.READ);
        popScope();
        await mapP;
        const px = new Uint8Array(buf.getMappedRange().slice(0, 4));
        buf.unmap();
        if (!(px[0] > 8 || px[1] > 8 || px[2] > 8)) reason = "swapchain smoke test rendered black";
      } catch (e) {
        if (!(e && e._skip))
          reason = "swapchain smoke test threw: " + (((e && e.message) || String(e)).slice(0, 200));
      }
      popScope();
      let gpuErr = null;
      if (gpuErrP) {
        gpuErr = await gpuErrP;
      }
      try { if (buf) buf.destroy(); } catch (_) {  }
      try { if (src) src.destroy(); } catch (_) {  }
      if (!reason && gpuErr) return null;
      return reason;
    }

    const SELFTEST_BUDGET_MS = 8000;
    let _stTimer = null;
    const _stT0 = Date.now();
    let _stReason = await Promise.race([
      _selfTest().catch(function (e) {
        return "self-test threw: " + (((e && e.message) || String(e)).slice(0, 200));
      }),
      new Promise(function (res) {
        _stTimer = setTimeout(function () { res("self-test stalled past " + SELFTEST_BUDGET_MS + " ms"); },
                              SELFTEST_BUDGET_MS);
      }),
    ]);
    try { if (_stTimer !== null) clearTimeout(_stTimer); } catch (_) {  }
    if (!initActive()) return _bootFail("initialization cancelled");
    const _stMs = Date.now() - _stT0;
    if (!_stReason && _stMs > SELFTEST_BUDGET_MS) {
      _stReason = "self-test took " + _stMs + " ms (budget " + SELFTEST_BUDGET_MS + " ms)";
    }
    if (_stReason) {
      return _bootFail(_stReason);
    }
    try { localStorage.removeItem("apex26.gfxWgxFail"); } catch (_) {  }
    _lastFailure = null;
    _clearGlxBound();

    try {
      if (!initActive()) return _bootFail("initialization cancelled");
      ctx = canvas.getContext("webgpu");
      if (!ctx) return _bootFail("canvas has no webgpu context");
      resize();
      const _bootCfgErr = _configureCanvas();
      if (_bootCfgErr) return _bootFail(_bootCfgErr);
      if (_softGpu && _displayCanvas) {
        _displayCtx = _displayCanvas.getContext("2d", { alpha: false });
        if (!_displayCtx) return _bootFail("software WebGPU needs a 2D display canvas");
      }
    } catch (e) {
      return _bootFail("context configure threw: " + ((e && e.message) || e));
    }
    const PRESENT_TEST_MS = 4000;
    let _ptTimer = null;
    let _presentReason = null;
    if (!_outProbeOff && !_softGpu && !WGX_LITE) {
      _presentReason = await Promise.race([
        _selfTestPresent().catch(function (e) {
          return "swapchain self-test threw: " + (((e && e.message) || String(e)).slice(0, 200));
        }),
        new Promise(function (res) {
          _ptTimer = setTimeout(function () { res(null); }, PRESENT_TEST_MS);
        }),
      ]);
      try { if (_ptTimer !== null) clearTimeout(_ptTimer); } catch (_) {  }
    }
    if (_presentReason) {
      return _bootFail(_presentReason);
    }

    if (!initActive()) return _bootFail("initialization cancelled");
    LightBudget.setSlots(MAX_LIGHTS);
    _runtimeReady = true;
    try { Log.info("gfx", "WGX bind ok"); } catch (_) {  }
    try {
      setTimeout(function () {
        if (_lost || !_runtimeReady) return;
        const warm = [
          { alpha: 0.5 }, { alpha: 0.5, doubleSided: true },
          { doubleSided: true }, { noAlphaWrite: true }, { doubleSided: true, noAlphaWrite: true },
          { depthBias: [3, 6] }, { depthBias: [5, 10] },
          { depthBias: [4, 16] }, { depthBias: [2, 10] }, { depthBias: [-2, -4] },
          { depthBias: [-1, -2] }, { decal: true },
          { alpha: 0.26, noDepthTest: true },
        ];
        if (!WGX_MINIMAL) _mipPrewarm(SCENE_FORMAT);
        const save = _passSamples;
        const counts = MSAA_COUNT > 1 ? [1, MSAA_COUNT] : [1];
        try {
          for (let c = 0; c < counts.length; c++) {
            _passSamples = counts[c];
            for (let i = 0; i < warm.length; i++) {
              try { _litPipeline(warm[i], true); } catch (_) {  }
            }
          }
        } finally { _passSamples = save; }
      }, 0);
    } catch (_) {  }


    const createChunkedMesh = (...a) => CHK.createChunkedMesh(...a);
    const freeChunkedMesh = (...a) => CHK.freeChunkedMesh(...a);
    const drawChunked = (...a) => { if (_envEncoder) return; CHK.drawChunked(...a); };
    const _chunkFirstIndex = (ch) => CHK.chunkFirstIndex(ch);

    const shadowBegin = (...a) => SHD.shadowBegin(...a);
    const castShadow = (...a) => SHD.castShadow(...a);
    const castShadowChunked = (...a) => SHD.castShadowChunked(...a);
    const shadowEnd = (...a) => SHD.shadowEnd(...a);
    const carShadowBegin = (...a) => {
      if (_softGpu && _softDisplayPending) { SHD.carShadowKeep(); return; }
      SHD.carShadowBegin(...a);
    };
    const carShadowEnd = (...a) => SHD.carShadowEnd(...a);
    const lampShadowBegin = (...a) => SHD.lampShadowBegin(...a);
    const lampShadowEnd = (...a) => SHD.lampShadowEnd(...a);
    const castShadowInstanced = (...a) => SHD.castShadowInstanced(...a);
    const carShadowKeep = (...a) => SHD.carShadowKeep(...a);
    const lampShadowKeep = (...a) => SHD.lampShadowKeep(...a);
    const carShadowState = () => SHD.carShadowState();
    const lampShadowState = () => SHD.lampShadowState();
    const _shadowPackFor = (batch) => SHD._shadowPackFor ? SHD._shadowPackFor(batch) : null;

    return {
      init() { return true; },
      resize,
      setRenderScale,
      getRenderScale() { return renderScale; },
      setSpatialUpscale,
      getSpatialUpscale,
      getSpatialUpscaleGather,
      getPresentSize: () => ({ width: presentW || width, height: presentH || height }),
      get width() { return width; },
      get height() { return height; },
      get aspect() { return aspect; },
      hdrMode: () => !!sceneTex,
      maxLights: () => MAX_LIGHTS,
      msaa: () => _msaaCount,
      pcss: () => true,
      isMobile: IS_MOBILE,
      mobileTier: MOBILE_TIER,

      chunkedTrackCoords: true,
      hasPerChunkLights: true,
      hasLampBake: true,
      createMesh,
      createTexMesh,
      createChunkedMesh,
      createTexture,
      freeMesh,
      freeChunkedMesh,
      freeTexture,
      flushTexPool() {},
      texCensus: undefined,

      begin,
      present,
      draw,
      drawChunked,
      drawSky,
      drawShadow,
      drawMark,
      drawSkidBatch,
      drawDrivingLine,
      drawGlow,
      drawDecal,

      shadowBegin,
      castShadow,
      castShadowChunked,
      shadowEnd,
      carShadowBegin,
      carShadowEnd,

      envFaceBegin,
      envFaceEnd,
      mirrorBegin,
      mirrorEnd,
      mirrorRect(r, flip) { _mirRect = r && r.length === 4 ? [+r[0] || 0, +r[1] || 0, +r[2] || 0, +r[3] || 0] : null; _mirFlip = flip !== false; },
      mirrorState: () => ({ ready: !!mirTex && _mirRenders > 0, dead: _mirDead, w: mirW, h: mirH, hdr: true,
        renders: _mirRenders, allocs: _mirAllocs, composites: _mirComposites, inPass: _mirInPass, glass: _mirGlass, rect: _mirRect, flip: _mirFlip,
        mips: mirTex ? mirTex.mipLevelCount : 0, glassLod: _mirGlassLod }),
      drawMirrorGlass,
      releaseMirror() { if (_mirEncoder) return false; _mirrorFree(); return true; },
      envProbeReady() { return _envProbeLive; },
      envProbeReset,

      gpuErrors: () => _gpuErrors,
      gpuFirstError: () => _gpuFirstMsg,
      ctxLost: () => !!_lost,
      backendState: () => ({
        api: "webgpu", lite: WGX_LITE, minimal: WGX_MINIMAL, softGpu: _softGpu,
        isMobile: IS_MOBILE, gpuErrors: _gpuErrors, gpuFirstError: _gpuFirstMsg,
        lost: _lost, ctxLost: !!_lost, format,
      }),

      makeFrustumPlanes: Frustum.makeFrustumPlanes,
      aabbInFrustum: Frustum.aabbInFrustum,
      aabbDist2: Frustum.aabbDist2,

      drawParticles,
      lampShadowBegin,
      lampShadowEnd,
      get shadowCullVP() { return SHD.lightVP; },
      createTextureArray,
      setMaterialMaps,
      materialMapState,
      gpuTimer,
      gpuMs,
      createInstancedBatch,
      cullInstances,
      updateInstances,
      drawInstanced,
      freeInstancedBatch,
      castShadowInstanced,
      carShadowKeep,
      lampShadowKeep,
      get carShadowEnabled() { return !!SHD.carShadowView && !WGX_LITE; },
      get lampShadowEnabled() { return !!SHD.lampShadowView && !WGX_LITE; },
      carShadowState,
      lampShadowState,
      capturePixels,
      cancelCapture: (why) => _rejectCapture(why || "capture cancelled"),
      awaitSoftPresent,
      invalidateSoftPresent,
      holdSoftPresent,
      softPresentState,
      roadLutReady: () => _roadLutReady,
      litPipelineStats: () => ({
        count: _litPipelineKeys.length,
        keys: _litPipelineKeys.slice(),
        firstFrameCount: _pipeAtFirstPresent,
      }),
      softPresent: () => !!_softGpu,
      setOutputTarget: undefined,
      clearOutputTarget: undefined,
      outputTargetState: undefined,
      setRenderSizeOverride: undefined,
      drainGpuErrors: undefined,
      occlusionCull: () => ({ supported: false, on: false }),
      occlusionStats: () => ({ supported: false, on: false }),
      multiDraw: () => ({ supported: false, on: false }),
      multiDrawStats: () => ({ supported: false, on: false }),

      postHealth: () => null, retryPost: () => false,
      backend: "webgpu",
    };
  }

  return {
    create,
    lastFailure: () => _lastFailure,
    gpuErrors: () => _gpuErrors,
    isSupported: () => typeof navigator !== "undefined" && !!navigator.gpu,
    __roadLutTable: _roadLutTable,
  };
})();

if (typeof window !== "undefined") window.WGX = WGX;
