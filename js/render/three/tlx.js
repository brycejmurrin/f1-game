"use strict";

const TLX = (function () {
  function pumpAnimation(r) {
    const anim = r && r._animation;
    if (!anim || typeof anim.setContext !== "function" || typeof anim.stop !== "function" || typeof anim.start !== "function") return null;
    const pump = { cb: null };
    pump.requestAnimationFrame = (cb) => { pump.cb = cb; return 1; };
    pump.cancelAnimationFrame = () => { pump.cb = null; };
    pump.drain = () => { const cb = pump.cb; if (cb) { pump.cb = null; cb(typeof performance !== "undefined" ? performance.now() : 0); } };
    anim.stop(); anim.setContext(pump); anim.start();
    return pump;
  }
  const LINE_COLS_F1 = [0.10, 0.95, 0.35, 1.00, 0.72, 0.10, 1.00, 0.12, 0.10];
  let _lastFailure = null, _presentWarned = false;
  function _fail(reason) {
    _lastFailure = { reason: String(reason), at: Date.now() };
    try { localStorage.setItem("apex26.gfxTlxFail", _lastFailure.reason); } catch (_) {  }
    try { Log.warn("gfx", "TLX unavailable (" + _lastFailure.reason + ") — falling back to WebGL2"); } catch (_) {  }
    try { sessionStorage.setItem("apex26.gfxBound", "webgl2"); } catch (_) {  }
    try { window.dispatchEvent(new Event("apex-gfx-live")); } catch (_) {  }
    return null;
  }
  function recordGfxBudgetExhausted(where, err) {
    const msg = (err && (err.message || err)) || "unknown";
    try {
      const ring = window.__apexErrors || (window.__apexErrors = []);
      ring.push({ t: Date.now(), kind: "caught", msg: "Caught @ " + where + ": " + String(msg).slice(0, 400),
                  detail: String((err && err.stack) || "").slice(0, 800) });
      if (ring.length > 40) ring.shift();
    } catch (_) {  }
    try { Log.error("gfx", "Caught @ " + where + ":", msg); } catch (_) {  }
  }

  let _texStandIn = null;
  function texStandIn() {
    if (!_texStandIn && typeof document !== "undefined" && document.createElement) {
      _texStandIn = document.createElement("canvas");
      _texStandIn.width = _texStandIn.height = 1;
    }
    return _texStandIn;
  }
  function releaseTexSource(t) {
    if (!t) return false;
    t.onUpdate = null;
    t.__tlxUp = true;
    const img = t.image;
    if (!img || (typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap)) return false;
    const stand = texStandIn();
    if (!stand || img === stand) return false;
    t.image = stand;
    return true;
  }

  const _captureReads = new WeakSet();
  async function readGlCapture(gl, w, h) {
    if (!(w > 0 && h > 0)) throw new Error("no frame size");
    if (_captureReads.has(gl)) throw new Error("capture already in progress");
    _captureReads.add(gl);
    let pbo = null, sync = null;
    try {
      const bytes = w * h * 4;
      pbo = gl.createBuffer();
      if (!pbo) throw new Error("capture buffer unavailable");
      const binding = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
      const names = [gl.PACK_ALIGNMENT, gl.PACK_ROW_LENGTH, gl.PACK_SKIP_PIXELS, gl.PACK_SKIP_ROWS];
      const pack = names.map((n) => gl.getParameter(n));
      try {
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
        gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.STREAM_READ);
        if (gl.getBufferParameter(gl.PIXEL_PACK_BUFFER, gl.BUFFER_SIZE) !== bytes)
          throw new Error("capture buffer allocation failed");
        for (let i = 0; i < names.length; i++) gl.pixelStorei(names[i], i === 0 ? 4 : 0);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
        sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (!sync) throw new Error("capture fence unavailable");
        gl.flush();
      } finally {
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, binding);
        for (let i = 0; i < names.length; i++) gl.pixelStorei(names[i], pack[i]);
      }
      await new Promise((resolve, reject) => {
        const deadline = performance.now() + 120000;
        const poll = () => {
          try {
            if (gl.isContextLost()) throw new Error("capture context lost");
            const status = gl.clientWaitSync(sync, 0, 0);
            if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) { resolve(); return; }
            if (status === gl.WAIT_FAILED) throw new Error("capture fence failed");
            if (performance.now() >= deadline) throw new Error("capture timed out");
            setTimeout(poll, 10);
          } catch (e) { reject(e); }
        };
        setTimeout(poll, 0);
      });
      const data = new Uint8ClampedArray(bytes);
      const bindingNow = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
      try {
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, data);
        if (gl.isContextLost()) throw new Error("capture context lost");
      } finally { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, bindingNow); }
      const stride = w * 4, row = new Uint8ClampedArray(stride);
      for (let y = 0; y < Math.floor(h / 2); y++) {
        const a = y * stride, b = (h - 1 - y) * stride;
        row.set(data.subarray(a, a + stride)); data.copyWithin(a, b, b + stride); data.set(row, b);
      }
      return { width: w, height: h, data };
    } finally {
      try { if (sync) gl.deleteSync(sync); } catch (_) {  }
      try { if (pbo) gl.deleteBuffer(pbo); } catch (_) {  }
      _captureReads.delete(gl);
    }
  }

  function setRange0(attr, count) {
    const r = attr.__tlxRange || (attr.__tlxRange = { start: 0, count: 0 });
    r.count = count;
    const ur = attr.updateRanges;
    if (ur.length === 1 && ur[0] === r) return;
    ur.length = 0; ur.push(r);
  }

  function setInstanceRange(attr, start, count) {
    if (count <= 0) return;
    let end = start + count;
    const ur = attr.updateRanges;
    if (start) for (let i = 0; i < ur.length; i++) { start = Math.min(start, ur[i].start); end = Math.max(end, ur[i].start + ur[i].count); }
    const r = attr.__tlxInstRange || (attr.__tlxInstRange = { start: 0, count: 0 });
    r.start = start; r.count = end - start;
    if (ur.length !== 1 || ur[0] !== r) { ur.length = 0; ur.push(r); }
    attr.needsUpdate = true;
  }

  const LITE = Object.freeze({ dprCap: 1.25, sunSize: 512, bloomLevels: 2, ssrQuality: 2 });
  let _labs = null;
  function labOn(name) {
    if (_labs === null) {
      _labs = [];
      try {
        const v = new URLSearchParams(location.search).get("lab");
        if (v) _labs = v.split(",").map((s) => s.trim()).filter(Boolean);
      } catch (_) {  }
    }
    return _labs.indexOf(name) >= 0;
  }
  function liteTier(webgl2, phone) { return labOn("tlxLite") && !!webgl2 && !!phone ? LITE : null; }
  function labDprCap(base) { return labOn("dpr3") ? 3 : (labOn("dpr2") ? 2 : base); }
  function liteOpts(o) {
    if (!o) return o;
    o.ssao = 0; o.contact = 0; o.godray = 0; o.lampVol = 0; o.flareMul = 0;
    o.bloomLevels = o.bloomLevels > 0 ? Math.min(o.bloomLevels | 0, LITE.bloomLevels) : LITE.bloomLevels;
    o.grLite = true;
    o.carReflect = 0;
    o.ssrQuality = Math.max(o.ssrQuality | 0, LITE.ssrQuality);
    return o;
  }

  async function create(canvas, opts) {
    let _abortDisplay = null, _abortRenderer = null;
    const _createUndo = [];
    let materialArrayDetail = null;
    const initOwner = opts && opts.initOwner;
    const checkInit = () => { if (initOwner) initOwner.check(); };
    checkInit();
    try {
      const isMobile = (typeof GLX !== "undefined" && !!GLX.isMobile);
      const mobileTier = (typeof GLX !== "undefined" && !!GLX.mobileTier);

      const _mobileOptOut = (function () {
        try { return localStorage.getItem("apex26.tlxMobile") === "0"; } catch (_) { return false; }
      })();
      if (isMobile && _mobileOptOut) {
        return _fail("mobile: three declined by apex26.tlxMobile=0 (three retains ~54 MB of CPU geometry copies; remove the key to try it again)");
      }
      if (isMobile) Log.warn("gfx", "TLX on a phone: three keeps ~54 MB of CPU geometry copies — a jetsam mid-race reverts to WebGL2 at the next boot; apex26.tlxMobile=0 declines");

      const THREE = await import("three/webgpu"); checkInit();
      const TSL = await import("three/tsl"); checkInit();

      THREE.ColorManagement.enabled = false;


      const _glPin = (function () {
        try { return localStorage.getItem("apex26.tlxForceGL"); } catch (_) { return null; }
      })();
      const _autoStayGL = (function () {
        try { return sessionStorage.getItem("apex26.tlxAutoGL") === "1"; } catch (_) { return false; }
      })();
      const _hasGpu = !!(typeof navigator !== "undefined" && navigator.gpu);
      const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
      const isWebKit = /CriOS|FxiOS|EdgiOS/.test(ua) ||
        (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua));
      const _webkitKey = (ua.match(/Version\/[\d.]+|OS \d+[_\d]*/g) || []).join(",");
      const _webkitStayGL = isWebKit && (function () {
        try {
          const m = /^(\d+)\|([^|]*)\|/.exec(localStorage.getItem("apex26.tlxWebKitGL") || "");
          return !!m && Date.now() - +m[1] < 7 * 864e5 && m[2] === _webkitKey;
        } catch (_) { return false; }
      })();
      const _latchWebKitGL = (why) => {
        if (!isWebKit || _glPin === "0" || _glPin === "1") return;
        try { localStorage.setItem("apex26.tlxWebKitGL", (Date.now() + "|" + _webkitKey + "|" + String(why)).slice(0, 200)); } catch (_) {  }
      };
      const _phoneHw = isMobile && (/iPhone|iPad|iPod|Android/i.test(ua)
        || ((navigator.maxTouchPoints || 0) > 1 && /Mac/.test(ua)));
      let _softAdapter = false;
      let _gpuErrors = 0, _gpuFirstError = null;
      const _gpuRecentErrors = [];
      let _gpuLastResize = null, _gpuLastOperation = "boot";
      let _warmRequested = false, _warmPending = null, _warmAttempts = 0, _warmAt = 0, _warmDone = false;
      let _deviceLost = false;
      const _warmStages = { at: 0, scene: null, fx: null, post: null, shadow: null, draw: null, drawn: null, total: null, attempts: 0, failed: 0,
        garageScene: null, mirrorDeferred: false, mirrorLazy: null, rig: null };
      const _warmHistory = [];
      const GPU_ERR_LOG_CAP = 8;
      let _presentN = 0, _healTried = false, _gpuErrFrames = 0, _gpuErrLastPresent = -1;
      let _presentAcc = 0, _presentMs = 0;
      let _sceneRenders = 0;
      const _renderTimed = (sc, cam) => {
        const t0 = performance.now();
        renderer.render(sc, cam);
        _sceneRenders++;
        _presentAcc += performance.now() - t0;
      };
      const _headless = /HeadlessChrome/i.test(ua)
        || (typeof navigator !== "undefined" && !!navigator.webdriver);
      let _gpuAdapterOk = false;
      try {
        if (navigator.gpu && navigator.gpu.requestAdapter) {
          const ad = (opts && opts.adapter) || await navigator.gpu.requestAdapter(); checkInit();
          _gpuAdapterOk = !!ad;
          if (ad) {
            const info = ad.info || null;
            const dev = info && info.device;
            const ven = info && info.vendor;
            const arch = info && info.architecture;
            const desc = info && info.description;
            const infoBlob = [dev, ven, arch, desc].filter(Boolean).join(" ").toLowerCase();
            const lim = ad.limits || null;
            const smallLimits = !!(lim && (lim.maxTextureDimension2D <= 8192
              || lim.maxBufferSize <= 1073741824));
            const named = /swiftshader|llvmpipe|lavapipe|microsoft basic render|soft(ware|pipe)/.test(infoBlob);
            _softAdapter = !_phoneHw && !!((info && info.isFallbackAdapter) || ad.isFallbackAdapter || named || (!infoBlob && smallLimits));
          }
        }
      } catch (_) { _softAdapter = false;  }
      let _gpuCanvasOk = false;
      if (_gpuAdapterOk && typeof document !== "undefined") {
        try {
          const _pc = document.createElement("canvas");
          _pc.width = _pc.height = 1;
          _gpuCanvasOk = !!_pc.getContext("webgpu");
        } catch (_) { _gpuCanvasOk = false; }
      }
      let forceWebGL = _glPin === "1"
        || (_glPin !== "0" && (!_gpuCanvasOk || _autoStayGL || _webkitStayGL));
      const _liteGpu = !!(isMobile || isWebKit || _softAdapter);

      const _capPref = (function () {
        try {
          const s = sessionStorage.getItem("apex26.wgxCapture");
          if (s === "1" || s === "0") return s;
        } catch (_) {  }
        try {
          const s = localStorage.getItem("apex26.wgxCapture");
          if (s === "1" || s === "0") return s;
        } catch (_) {  }
        return null;
      })();
      let _softBlit = !forceWebGL && _capPref !== "0" && !!(_softAdapter || _headless || _capPref === "1");
      let _displayCanvas = null, _displayCtx = null, _gpuCanvas = null;
      let _blitRT = null, _softImg = null, _softBlitGen = 0;
      let _unstridePool = null;
      let _softReadPending = false, _softReadQueued = null, _softReadEpoch = 0;
      let _softSubmittedGen = 0, _softShownGen = 0;
      const _softPresentWaiters = [];
      const _frameWaiters = [];
      const _awaitFrame = (ms) => new Promise((resolve) => {
        const w = () => { clearTimeout(t); resolve("frame"); };
        const t = setTimeout(() => { const i = _frameWaiters.indexOf(w); if (i >= 0) _frameWaiters.splice(i, 1); resolve("stale"); }, ms);
        _frameWaiters.push(w);
      });
      let _layoutCanvas = canvas;
      let ownGL = null;
      async function bootRenderer(forceWebGL) {
        let glCtx = null;
        if (forceWebGL) {
          try {
            glCtx = canvas.getContext("webgl2", {
              antialias: false,
              alpha: false,
              depth: true,
              stencil: false,
              powerPreference: "high-performance",
            });
          } catch (_) { glCtx = null; }
        }
        checkInit();
        const renderer = new THREE.WebGPURenderer({
          canvas,
          alpha: false,
          premultipliedAlpha: false,
          ...(glCtx ? { context: glCtx } : {}),
          antialias: forceWebGL ? false : !_liteGpu,
          ...(!forceWebGL && (isMobile || isWebKit)
            ? { outputType: THREE.UnsignedByteType, powerPreference: "low-power" }
            : {}),
          forceWebGL,
          multiview: false,
        });
        if (!forceWebGL && _glPin !== "0" && "_getFallback" in renderer) renderer._getFallback = null;
        renderer.setPixelRatio(1);
        renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
        renderer.toneMapping = THREE.NoToneMapping;
        try {
          await renderer.init();
          checkInit();
          renderer.__apexPump = pumpAnimation(renderer);
        } catch (e) {
          try { disposeKeepingContext(renderer); } catch (_) {  }
          throw e;
        }
        if (renderer.backend && renderer.backend.isWebGPUBackend && renderer.backend.device) {
          const _dev = renderer.backend.device;
          if (!_dev.__apexWriteBuf && typeof _dev.createBuffer === "function") {
            const _origCreate = _dev.createBuffer.bind(_dev);
            const COPY_DST = (typeof GPUBufferUsage !== "undefined" && GPUBufferUsage.COPY_DST)
              ? GPUBufferUsage.COPY_DST : 0x0008;
            _dev.createBuffer = function (desc) {
              if (!desc || !desc.mappedAtCreation) return _origCreate(desc);
              const size = desc.size | 0;
              const buf = _origCreate({
                size,
                usage: (desc.usage | COPY_DST),
                label: desc.label,
              });
              let staging = new ArrayBuffer(size);
              const parts = [];
              buf.getMappedRange = function (offset, mapSize) {
                const o = offset | 0;
                const n = mapSize == null ? (size - o) : (mapSize | 0);
                if (o === 0 && n === size) return staging;
                const part = new ArrayBuffer(n);
                parts.push({ o, part });
                return part;
              };
              buf.unmap = function () {
                try {
                  for (let i = 0; i < parts.length; i++) {
                    const p = parts[i];
                    new Uint8Array(staging, p.o, p.part.byteLength).set(new Uint8Array(p.part));
                  }
                  if (staging && size) _dev.queue.writeBuffer(buf, 0, staging);
                } catch (_) {  }
                staging = null;
                parts.length = 0;
              };
              return buf;
            };
            _dev.__apexWriteBuf = true;
          }
          if (!_dev.__apexErrHook) {
            try {
              const onErr = function (ev) {
                const msg = (ev && ev.error && ev.error.message) || "gpu error";
                if (!_gpuFirstError) _gpuFirstError = msg;
                _gpuErrors++;
                if (_gpuRecentErrors.length === GPU_ERR_LOG_CAP) _gpuRecentErrors.shift();
                _gpuRecentErrors.push({ message: msg, type: ev && ev.error && ev.error.constructor && ev.error.constructor.name,
                  receivedAt: performance.now(), presentAtReceipt: _presentN, warmingAtReceipt: !!_warmPending,
                  lastOperation: _gpuLastOperation, lastResize: _gpuLastResize });
                if (_gpuErrLastPresent !== _presentN) { _gpuErrLastPresent = _presentN; _gpuErrFrames++; }
                if (_gpuErrors <= GPU_ERR_LOG_CAP) {
                  try { Log.warn("gfx", "TLX GPU error #" + _gpuErrors + ":", msg); } catch (_) {  }
                  if (_gpuErrors === GPU_ERR_LOG_CAP) {
                    try { Log.warn("gfx", "TLX: further GPU errors suppressed — read the count from GLX.gpuErrors()"); } catch (_) {  }
                  }
                }
              };
              if (typeof _dev.addEventListener === "function") _dev.addEventListener("uncapturederror", onErr);
              else _dev.onuncapturederror = onErr;
              _dev.__apexErrHook = true;
            } catch (_) {  }
          }
          if (!_dev.__apexShaderHook && typeof _dev.createShaderModule === "function") {
            try {
              const _origCSM = _dev.createShaderModule.bind(_dev);
              _dev.createShaderModule = function (desc) {
                const mod = _origCSM(desc);
                try {
                  if (mod && typeof mod.getCompilationInfo === "function") {
                    mod.getCompilationInfo().then(function (info) {
                      const msgs = (info && info.messages) || [];
                      for (let i = 0; i < msgs.length; i++) {
                        const m = msgs[i];
                        if (!m || m.type !== "error") continue;
                        const label = (desc && desc.label) || "shader";
                        const text = "WGSL " + label + " " + (m.lineNum | 0) + ":" + (m.linePos | 0) + " " + m.message;
                        if (!_gpuFirstError) _gpuFirstError = text;
                        _gpuErrors++;
                        if (_gpuErrLastPresent !== _presentN) { _gpuErrLastPresent = _presentN; _gpuErrFrames++; }
                        if (_gpuErrors <= GPU_ERR_LOG_CAP) {
                          try { Log.warn("gfx", "TLX shader error #" + _gpuErrors + ":", text); } catch (_) {  }
                        }
                      }
                    }, function () {  });
                  }
                } catch (_) {  }
                return mod;
              };
              _dev.__apexShaderHook = true;
            } catch (_) {  }
          }
        }
        return { renderer: renderer, ownGL: glCtx };
      }
      let renderer;
      try {
        const boot = await bootRenderer(forceWebGL);
        renderer = boot.renderer;
        ownGL = boot.ownGL;
      } catch (e) {
        checkInit();
        if (_glPin !== "0" && _glPin !== "1" && !forceWebGL) {
          try { Log.warn("gfx", "[TLX] AUTO WebGPU init failed — three WebGL2", e); } catch (_) {  }
          _latchWebKitGL("WebGPU init failed: " + ((e && e.message) || e));
          forceWebGL = true;
          const boot = await bootRenderer(true);
          renderer = boot.renderer;
          ownGL = boot.ownGL;
        } else {
          throw e;
        }
      }
      let _initSwapGL = false;
      if (!forceWebGL && renderer.backend && renderer.backend.isWebGLBackend) {
        _initSwapGL = true;
        forceWebGL = true;
        try { Log.warn("gfx", "[TLX] three swapped in its WebGL2 backend during init (WebGPU failed); pin", _glPin); } catch (_) {  }
        _latchWebKitGL("WebGPU init fell back inside three");
      }
      _abortRenderer = renderer;
      _softBlit = !forceWebGL && _capPref !== "0" && !!(_softAdapter || _headless || _capPref === "1");
      if (_softBlit && typeof document !== "undefined" && canvas && canvas.parentNode) {
        _gpuCanvas = canvas;
        _displayCanvas = document.createElement("canvas");
        _displayCanvas.id = "game-soft";
        _displayCanvas.setAttribute("aria-hidden", "true");
        if (_displayCanvas.style) {
          _displayCanvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:1";
        }
        canvas.parentNode.insertBefore(_displayCanvas, canvas.nextSibling);
        _abortDisplay = _displayCanvas;
        try { _displayCtx = _displayCanvas.getContext("2d", { alpha: false, willReadFrequently: true }); }
        catch (_) { _displayCtx = null;  }
      }
      function softGpu() { return !!(_softAdapter || _softBlit); }
      const _forceBatches = (function () {
        try { return localStorage.getItem("apex26.tlxForceBatches") === "1"; } catch (_) { return false; }
      })();
      const _sharedUniforms = (function () {
        try { return localStorage.getItem("apex26.tlxSharedUniforms") !== "0"; } catch (_) { return true; }
      })();
      const _skipBatchesPin = (function () {
        try { return localStorage.getItem("apex26.tlxSkipBatches") === "1"; } catch (_) { return false; }
      })();
      const _arrayNearest = (function () {
        try { return localStorage.getItem("apex26.tlxArrayNearest") === "1"; } catch (_) { return false; }
      })();
      const _forceHw = (function () {
        let raw = "";
        try { raw = localStorage.getItem("apex26.tlxForceHw") || ""; } catch (_) { raw = ""; }
        const set = new Set(String(raw).split(",").map((p) => p.trim()).filter(Boolean));
        const all = set.has("1") || set.has("all");
        return { on: all || set.size > 0, has: (part) => all || set.has(part) };
      })();
      function isWebGPU() { return !!(renderer.backend && renderer.backend.isWebGPUBackend); }
      function skipBatches() {
        if (_skipBatchesPin) return true;
        return _softAdapter && isWebGPU() && !_forceBatches && !_forceHw.has("batches");
      }
      function softContent(part) { return softwareGL && !_forceHw.has(part); }
      function softOutRT() {
        if (!softGpu()) return null;
        const up = wantSpatialUpscale();
        const tw = up ? presentW : W, th = up ? presentH : H;
        return _ensureBlitRT(tw, th);
      }
      if (renderer._nodes && typeof renderer._nodes.getForRenderCacheKey === "function") {
        renderer._nodes.getForRenderCacheKey = function (ro) {
          if (ro.__tlxNbKey !== undefined) return ro.__tlxNbKey;
          const mat = ro.material;
          const geo = ro.geometry;
          const fam = (mat && typeof mat.customProgramCacheKey === "function")
            ? mat.customProgramCacheKey() : (mat && mat.type) || "mat";
          const attrs = geo && geo.attributes
            ? Object.keys(geo.attributes).sort().join(",") : "";
          const idx = geo && geo.index ? "i" : "n";
          const inst = ro.object && ro.object.isInstancedMesh
            ? "I" + ro.object.id : "M";
          return (ro.__tlxNbKey = fam + "|" + attrs + "|" + idx + "|" + inst + "|" + attachKey());
        };
      }
      function attachKey() {
        try {
          const rt = renderer.getRenderTarget();
          const n = rt ? (rt.textures ? rt.textures.length : 1) : 1;
          const mrt = renderer.getMRT ? renderer.getMRT() : null;
          return n + (mrt ? "m" : "");
        } catch (_) { return "?"; }
      }
      function detectSoftwareGL() {
        try {
          const gl = (renderer.backend && renderer.backend.gl)
            || canvas.getContext("webgl2") || canvas.getContext("webgl");
          if (!gl) return false;
          const ext = gl.getExtension("WEBGL_debug_renderer_info");
          const name = ((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || "")
            + " " + (gl.getParameter(gl.RENDERER) || "");
          return /swiftshader|llvmpipe|lavapipe|softpipe|microsoft basic render|gdi generic|subzero/i.test(name);
        } catch (_) { return false; }
      }
      const softwareGL = !!_softAdapter
        || (!!(renderer.backend && renderer.backend.isWebGLBackend) && detectSoftwareGL());
      function setSwRaceShed(on) {
        try {
          if (on) localStorage.setItem("apex26.swRaceShed", "1");
          else localStorage.removeItem("apex26.swRaceShed");
        } catch (_) {  }
      }
      function softwareRaceShedOn() {
        let knob = null;
        try { knob = localStorage.getItem("apex26.swRaceShed"); } catch (_) {  }
        const nav = typeof navigator !== "undefined" ? navigator : null;
        return typeof PostCommon !== "undefined" && PostCommon.softwareRaceShed
          ? !!PostCommon.softwareRaceShed(!!softwareGL, nav, knob) : false;
      }
      const _swRaceShed = softwareRaceShedOn();
      let _swRaceShedPinned = false;
      try {
        if (canvas && typeof canvas.setAttribute === "function") {
          const api = (renderer.backend && renderer.backend.isWebGPUBackend) ? "webgpu" : "webgl2";
          canvas.setAttribute("data-engine", engineLabel(THREE, api));
        }
      } catch (_) {  }
      try {
        Log.info("gfx", "[TLX] three backend:",
          (renderer.backend && renderer.backend.isWebGPUBackend) ? "WebGPU" : "WebGL2",
          "(forceWebGL", forceWebGL, "pin", _glPin, "isMobile", isMobile + ")");
      } catch (_) {  }

      const _threeOnLost = (typeof renderer.onDeviceLost === "function")
        ? renderer.onDeviceLost.bind(renderer) : null;
      const _nowMs = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
      let _shownAt = -1e9;
      let _lossCounted = false;
      try {
        let onShown = null, onPageShow = null;
        document.addEventListener("visibilitychange", onShown = function () { if (!document.hidden) _shownAt = _nowMs(); });
        window.addEventListener("pageshow", onPageShow = function (e) { if (e && e.persisted) _shownAt = _nowMs(); });
        _createUndo.push(function () { document.removeEventListener("visibilitychange", onShown); window.removeEventListener("pageshow", onPageShow); });
      } catch (_) {  }
      renderer.onDeviceLost = function (info) {
        if (initOwner && !initOwner.active) return;
        if (_deviceLost) return;
        try { if (_threeOnLost) _threeOnLost(info); } catch (_) {  }
        _deviceLost = true;
        _warmRequested = false;
        _warmPending = null;
        _warmDone = true;
        if (typeof _pinnedPipes !== "undefined") _pinnedPipes.clear();
        try {
          if (!document.hidden && _nowMs() - _shownAt < 3000) {
            setTimeout(function () { try { location.reload(); } catch (_) {  } }, 300);
            return;
          }
          if (!document.hidden) {
            try { localStorage.setItem("apex26.envProbeOff", "1"); } catch (_) {  }
            try { localStorage.setItem("apex26.perChunkOff", "1"); } catch (_) {  }
          } else {
            const onVisible = function () {
              if (document.hidden) return;
              document.removeEventListener("visibilitychange", onVisible);
              try { location.reload(); } catch (_) {  }
            };
            document.addEventListener("visibilitychange", onVisible);
            return;
          }
          const n = GfxEscalation.nextReloadCount();
          _lossCounted = true;
          if (n <= 2) setTimeout(function () { try { sessionStorage.setItem("apex26.ctxLostNotice", "1"); } catch (_) {  } try { location.reload(); } catch (_) {  } }, 1200);
          else {
            const autoPath = _glPin !== "0" && _glPin !== "1";
            if (autoPath) {
              try { sessionStorage.setItem("apex26.tlxAutoGL", "1"); } catch (_) {  }
              _latchWebKitGL("context lost x" + n);
              try { localStorage.setItem("apex26.gfxTlxFail", "context lost x" + n + " — AUTO stayed on three WebGL2"); } catch (_) {  }
            } else {
              try { localStorage.setItem("apex26.gfxTlxFail", "context lost x" + n + " — tab fell back to WebGL2"); } catch (_) {  }
              try { sessionStorage.setItem("apex26.gfxBound", "webgl2"); } catch (_) {  }
              try { sessionStorage.setItem("apex26.gfxClaimFail", "1"); } catch (_) {  }
            }
            if (n === 3 && !(typeof GfxEscalation !== "undefined" && GfxEscalation.raceEntryActive && GfxEscalation.raceEntryActive())) {
              setTimeout(function () { try { sessionStorage.setItem("apex26.ctxLostNotice", "1"); } catch (_) {  } try { location.reload(); } catch (_) {  } }, 1200);
            } else if (n === 3) {
              try {
                if (typeof GfxEscalation !== "undefined" && GfxEscalation.onReloadBudgetExceeded) {
                  GfxEscalation.onReloadBudgetExceeded(n, {
                    recordGfxBudgetExhausted,
                    showUnavailable: (opts) => {
                      if (typeof RendererPicker !== "undefined" && RendererPicker.showUnavailable) RendererPicker.showUnavailable(opts);
                    },
                    panel: document.getElementById("nogl"),
                  });
                }
              } catch (_) {  }
            } else {
              try {
                if (typeof GfxEscalation !== "undefined" && GfxEscalation.onReloadBudgetExceeded) {
                  GfxEscalation.onReloadBudgetExceeded(n, {
                    recordGfxBudgetExhausted,
                    showUnavailable: (opts) => {
                      if (typeof RendererPicker !== "undefined" && RendererPicker.showUnavailable) RendererPicker.showUnavailable(opts);
                    },
                    panel: document.getElementById("nogl"),
                  });
                } else {
                  recordGfxBudgetExhausted("gfx", new Error("The graphics device keeps getting lost (" + n + " times) — reload to try again, or pick another RENDERER in settings."));
                  if (typeof RendererPicker !== "undefined" && RendererPicker.showUnavailable) {
                    RendererPicker.showUnavailable({ panel: document.getElementById("nogl") });
                  }
                }
              } catch (_) {  }
            }
          }
        } catch (_) {  }
      };
      try {
        let onRestored = null;
        canvas.addEventListener("webglcontextrestored", onRestored = function () {
          const n = GfxEscalation.reloadCount();
          if (n > 2) return;
          if (_lossCounted) try { sessionStorage.setItem("apex26.ctxLostNotice", "1"); } catch (_) {  }
          try { location.reload(); } catch (_) {  }
        }, false);
        _createUndo.push(function () { canvas.removeEventListener("webglcontextrestored", onRestored, false); });
      } catch (_) {  }

      let renderScale = 1;
      let W = 1, H = 1;
      let presentW = 1, presentH = 1;
      let spatialUpscale = false;
      try {
        spatialUpscale = typeof DevFlags !== "undefined" && !!DevFlags.get("upscale");
      } catch (_) { spatialUpscale = false; }
      function setSpatialUpscale(on) {
        spatialUpscale = !!on;
        resizeNow();
        return spatialUpscale;
      }
      function getSpatialUpscale() { return spatialUpscale; }
      let fixedTargets = false;
      try { fixedTargets = localStorage.getItem("apex26.tlxFixedTargets") === "1"; } catch (_) {  }
      function fixedActive() { return fixedTargets && !!(post && post.fixedOk && post.fixedOk()); }
      function wantSpatialUpscale() {
        if (fixedActive()) return W !== presentW || H !== presentH;
        return spatialUpscale && renderScale < 0.98 && !!(post && post.spatialOk && post.spatialOk());
      }
      function getPresentSize(out) { const o = out || {}; o.width = presentW || W; o.height = presentH || H; return o; }
      const _lite = liteTier(!!(renderer.backend && !renderer.backend.isWebGPUBackend), mobileTier || _phoneHw);
      let DPR_CAP = _lite ? _lite.dprCap : (mobileTier ? 1.5 : 2);
      if (!_lite) DPR_CAP = labDprCap(DPR_CAP);

      let _gpuTimerOn = false, _gpuMs = -1, _gpuTimerEpoch = 0, _gpuTimerFailLogged = false;
      let _gpuSamples = 0, _gpuSampleAt = -1, _gpuResolvePending = false;
      let _inspectorHold = false;
      function resolveGpuTimer() {
        if (!_gpuTimerOn || _deviceLost || _gpuResolvePending) return;
        const epoch = _gpuTimerEpoch, be = renderer.backend;
        const pool = be && be.timestampQueryPool && be.timestampQueryPool.render;
        if (!pool || pool.isDisposed || pool.pendingResolve || !pool.currentQueryIndex) return;
        const frames = pool.frames, gl = be.isWebGLBackend && be.gl;
        const queries = [];
        if (gl) {
          for (const i of pool.queryOffsets.values()) if (pool.queryStates.get(i) === "ended") queries.push(pool.queries[i]);
          if (!queries.length) return;
        }
        _gpuResolvePending = true;
        try {
          renderer.resolveTimestampsAsync("render").then(v => {
            if (!_gpuTimerOn || _deviceLost || epoch !== _gpuTimerEpoch || pool.isDisposed) return;
            if (gl && (gl.getParameter(pool.ext.GPU_DISJOINT_EXT) || queries.some(q => !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)))) {
              _gpuMs = -1; _gpuSampleAt = -1; return;
            }
            if (pool.frames === frames || !pool.frames.length || v == null || !isFinite(v) || v < 0) return;
            _gpuMs = v; _gpuSampleAt = _nowMs(); _gpuSamples++;
          }).catch((e) => {
            if (!_gpuTimerFailLogged) { _gpuTimerFailLogged = true; Log.debug("gfx", "TLX: GPU timestamp resolve rejected:", e && e.message); }
          }).finally(() => { _gpuResolvePending = false; });
        } catch (_) { _gpuResolvePending = false;  }
      }
      function _gpuSupported() {
        try {
          const be = renderer.backend;
          return !!(be && (be.isWebGPUBackend || (be.isWebGLBackend && !softwareGL)))
            && typeof renderer.hasFeature === "function"
            && !!renderer.hasFeature("timestamp-query");
        } catch (_) { return false; }
      }

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0.04, 0.04, 0.06);
      scene.matrixAutoUpdate = false;
      scene.matrixWorldAutoUpdate = false;
      const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 4000);
      camera.matrixAutoUpdate = false;

      try {
        if (typeof DevFlags !== "undefined" && DevFlags.get("three-devtools")) {
          window.scene = scene; window.camera = camera; window.renderer = renderer;
          window.THREE = THREE;
          Log.info("gfx", "[TLX] window.scene / camera / renderer / THREE exposed — Three.js DevTools will find the scene");
        }
      } catch (_) {  }

      const unlitMat = new THREE.MeshBasicNodeMaterial();
      unlitMat.colorNode = TSL.attribute("color", "vec3");
      unlitMat.side = THREE.FrontSide;
      unlitMat.lights = false;
      unlitMat.customProgramCacheKey = () => "tlx-unlit";
      const unlitInstancedMat = new THREE.MeshBasicNodeMaterial();
      unlitInstancedMat.colorNode = TSL.attribute("color", "vec3")
        .mul(TSL.attribute("instanceTint", "vec3"));
      unlitInstancedMat.side = THREE.FrontSide;
      unlitInstancedMat.lights = false;
      unlitInstancedMat.customProgramCacheKey = () => "tlx-unlit-instanced";
      const rawUnlitMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
      rawUnlitMat.side = THREE.FrontSide;
      let _drawMatMode = 0;
      const HEAL_WINDOW = 120;
      const HEAL_MIN_FRAMES = 2;

      const vizMode = (function () {
        try {
          return typeof DevFlags !== "undefined" ? DevFlags.get("viz") : null;
        } catch (_) { return null; }
      })();
      const LIT_VIZ = ["mat", "normal", "lamp"];

      let shadowSys = null;
      const _shadowOff = (function () {
        try { return localStorage.getItem("apex26.tlxShadowOff") === "1"; } catch (_) { return false; }
      })();
      try {
        if (!_shadowOff && window.TLXShaders && TLXShaders.shadowSys) {
          shadowSys = TLXShaders.shadowSys(THREE, TSL, {
            renderer, mobileTier, isMobile, softwareGL: softContent("shadow"), sunSize: _lite ? _lite.sunSize : 0,
            isWarming: () => !!_warmPending && !_ownershipFreeDepth,
          });
        }
      } catch (e) {
        try { Log.warn("gfx", "TLX: shadow factory failed, shadows off —", e); } catch (_) {}
        shadowSys = null;
      }

      let chunks = null;
      try {
        if (window.TLXShaders && TLXShaders.chunks) chunks = TLXShaders.chunks(THREE, TSL);
      } catch (_) { chunks = null; }

      let post = null;
      let _sceneSamples = 0;
      let _xrActive = false;
      function _wantTag() {
        return true;
      }
      function _tagSwap() {
        if (!post || !post.tagOn || _warmPending || post.tagOn() === _wantTag()) return;
        const old = post; post = null;
        _cancelSoftBlits();
        try { if (old.dispose) old.dispose(); } catch (_) {  }
        post = buildPost(); if (post) post.resize(W, H, presentW, presentH);
      }
      const vport = (fixedTargets && window.TLXShaders && TLXShaders.viewport)
        ? TLXShaders.viewport(THREE, TSL, { enabled: true }) : null;
      if (!vport) fixedTargets = false;
      const sceneView = vport ? vport.view() : null;
      function buildPost() {
      let post = null;
      try {
        if (window.TLXShaders && TLXShaders.postChain && TLXShaders.post && chunks) {
          post = TLXShaders.postChain(THREE, TSL,
            { renderer, isMobile, chunks, shadow: shadowSys, viz: vizMode, ssrTag: _wantTag(),
              softDest: function () { return softOutRT(); },
              wantSpatialUpscale, getPresentSize,
              fixedTargets, vp: vport, userSpatialUpscale: getSpatialUpscale,
              sceneSamples: (_sceneSamples = sceneSamplesFor(renderer, forceWebGL, isMobile)) });
          if (post && !post.enabled()) {
            try { if (post.dispose) post.dispose(); } catch (_) {  }
            post = null;
          }
        }
      } catch (e) {
        try { Log.warn("gfx", "TLX: post factory failed, direct to canvas —", e); } catch (_) {}
        try { if (post && post.dispose) post.dispose(); } catch (_) {  }
        post = null;
      }
      return post;
      }
      post = buildPost();
      let _postStrikes = 0, _postRebuild = false, _postRetryAt = 0;
      let _postHealth = { state: post ? "recovering" : "degraded", attempts: 0, maxAttempts: 3, reason: post ? "Waiting for first completed post frame" : "Post-processing unavailable" };
      function postFailure(reason) {
        _postHealth = { state: _postRebuild ? "recovering" : "degraded", attempts: _postStrikes, maxAttempts: 3,
          reason: String(reason || "Post-processing failed").replace(/\s+/g, " ").slice(0, 160) };
      }
      const ENV_SIZE = 64;
      const ENV_CULL_M = 150;
      let envRT = null, envDummy = null;
      let mirRT = null, mirCam = null, _mirActive = false, _mirDead = false, _mirFails = 0, _mirErr = null;
      let _mirRect = null, _mirRenders = 0, _mirEye = null, _mirCull = 0, _mirFog = null, _mirFlip = true;
      let _mirGlass = 0, _glassProbeGeo = null;
      let _mirUsed = false;
      const _mirVP = new Float32Array(16), _mirProjGpu = new Float32Array(16);
      const _mirRectScratch = [0, 0, 0, 0];
      const _mirRectPx = [0, 0, 0, 0];
      function _mirPx(cw, ch) {
        const r = _mirRect, px = _mirRectPx;
        px[0] = Math.round(r[0] * cw); px[1] = Math.round(r[1] * ch); px[2] = Math.round(r[2] * cw); px[3] = Math.round(r[3] * ch);
        return px;
      }
      let _mirWarmLazy = false;
      try { _mirWarmLazy = localStorage.getItem("apex26.tlxMirWarmLazy") === "1"; } catch (_) {  }
      let _mirWarmOwed = false, _mirWarmReq = false;
      function wantMirrorWarm() {
        _mirWarmOwed = false; _mirWarmReq = false; _warmStages.mirrorDeferred = false;
        if (!_warmFx || !post || !post.enabled() || _mirDead || !lit || vizMat) return false;
        let mode = "auto", pip = "auto";
        try { mode = GameStore.store.get("hudMirror", "auto"); pip = GameStore.store.get("bcPip", "auto"); } catch (_) {  }
        if (mode === "on" || pip === "on") return true;
        if (!((mode !== "off" || pip !== "off") && !softGpu() && !softwareGL)) return false;
        if (!_mirWarmLazy) return true;
        _mirWarmOwed = true; _mirUsed = true; _warmStages.mirrorDeferred = true;
        return false;
      }
      function mirrorWarmGate() {
        if (!_mirWarmOwed) return false;
        _mirWarmReq = true;
        return true;
      }
      function prepareMirrorTarget(w, h, forWarm) {
        if (forWarm && _instPerPass && !skipBatches()) _mirWarmSwap();
        const lv = _mirLevels(w, h);
        if (!mirRT || mirRT.width !== w || mirRT.height !== h || lv > _mirLevelsNow(w, h)) prepareMirrorTarget.allocs = (prepareMirrorTarget.allocs | 0) + 1;
        if (!mirRT) {
          mirRT = _mirTarget(post && post.hdrOk() ? THREE.HalfFloatType : THREE.UnsignedByteType, w, h, _mirMrtWant());
          _mirSetLevels(lv, w, h);
          mirCam = new THREE.PerspectiveCamera();
          mirCam.matrixAutoUpdate = false; mirCam.matrixWorldAutoUpdate = false;
        } else if (mirRT.width !== w || mirRT.height !== h) { _mirSetLevels(lv, w, h); mirRT.setSize(w, h); }
        else if (lv > _mirLevelsNow(w, h)) { _mirSetLevels(lv, w, h); mirRT.dispose(); }
      }
      let _mirMrtKnob = true;
      try { _mirMrtKnob = typeof DevFlags === "undefined" || DevFlags.get("mirMrt") !== false; } catch (_) {  }
      const _mirMrt = () => !!(mirRT && mirRT.textures && mirRT.textures.length > 1);
      const _mirMrtWant = () => _mirMrtKnob && !!(post && post.tagOn && post.tagOn() && TSL.mrt && renderer.setMRT);
      function _mirTarget(type, w, h, mrt) {
        const tf = post && post.targetFormats ? post.targetFormats() : null;
        const c11 = !!(tf && tf.mir11) && type !== THREE.UnsignedByteType;
        if (type === THREE.UnsignedInt101111Type) type = THREE.HalfFloatType;
        const rt = new THREE.RenderTarget(w, h, {
          type, format: THREE.RGBAFormat, depthBuffer: true, count: mrt ? 2 : 1,
          generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
        });
        rt.texture.colorSpace = THREE.NoColorSpace;
        if (c11) { rt.texture.type = THREE.UnsignedInt101111Type; rt.texture.format = THREE.RGBFormat; }
        if (mrt && rt.textures && rt.textures[1]) {
          const bk = renderer.backend || {};
          rt.texture.name = "output";
          if (bk.isWebGPUBackend || bk.drawBuffersIndexedExt) rt.textures[1].format = THREE.RedFormat;
          if (tf && tf.tag8) rt.textures[1].type = THREE.UnsignedByteType;
          rt.textures[1].name = "ssrTag";
          rt.textures[1].generateMipmaps = false;
          rt.textures[1].minFilter = THREE.NearestFilter; rt.textures[1].magFilter = THREE.NearestFilter;
          rt.textures[1].colorSpace = THREE.NoColorSpace;
        }
        return rt;
      }
      let _mirDiscards = 0, _mirInvD = null, _mirInvDT = null;
      function _mirInv(mrt) {
        const gl = renderer.backend && renderer.backend.gl;
        if (!gl) return null;
        if (!_mirInvD) { _mirInvD = [gl.DEPTH_ATTACHMENT]; _mirInvDT = [gl.DEPTH_ATTACHMENT, gl.COLOR_ATTACHMENT1]; }
        return mrt ? _mirInvDT : _mirInvD;
      }
      function _mirMrtArm(on, prev) {
        if (lit && lit.setSsrMrt) lit.setSsrMrt(on);
        if (fx && fx.setSsrMrt) fx.setSsrMrt(on);
        renderer.setMRT(on ? _ssrMrtNode() : (prev || null));
      }
      let _mirMipCap = 3, _mirMipPinned = false, _mirGlassSeen = false, _mirGlassLod = -Infinity, _mirGlassInf = 0;
      try {
        const v = localStorage.getItem("apex26.tlxMirMips");
        if (v !== null && v !== "" && +v >= 0) { _mirMipCap = Math.floor(+v); _mirMipPinned = true; }
      } catch (_) {  }
      const _mirFull = (w, h) => Math.floor(Math.log2(Math.max(w, h, 1))) + 1;
      function _mirLevels(w, h) {
        const full = _mirFull(w, h);
        if (_mirMipCap <= 0 || (_mirGlassSeen && !_mirMipPinned && !(_mirGlassLod < Infinity))) return full;
        let need = _mirMipCap;
        if (_mirGlassSeen && !_mirMipPinned) need = Math.max(need, Math.ceil(_mirGlassLod + 0.25) + 1);
        if (_mirRect) {
          const up = wantSpatialUpscale(), cw = up ? presentW : W, ch = up ? presentH : H;
          const r = Math.max(w / Math.max(1, Math.round(_mirRect[2] * cw)), h / Math.max(1, Math.round(_mirRect[3] * ch)));
          need = Math.max(need, Math.ceil(Math.log2(r) + 0.25) + 1);
        }
        return Math.min(full, need);
      }
      const _mirLevelsNow = (w, h) => (mirRT && mirRT.texture.mipmaps.length) || _mirFull(w, h);
      function _mirSetLevels(lv, w, h) {
        mirRT.texture.mipmaps = lv >= _mirFull(w, h) ? [] : Array.from({ length: lv }, () => ({}));
      }
      let _envOptOut = true;
      try { _envOptOut = GameStore.store.raw("apex26.tlxEnvProbe") !== "1"; } catch (_) {  }
      if (!_envOptOut) try {
        const envHdr = !!(post && post.hdrOk());
        const envOpts = {
          type: envHdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
          format: THREE.RGBAFormat,
          generateMipmaps: true,
          minFilter: THREE.LinearMipmapLinearFilter,
          magFilter: THREE.LinearFilter,
        };
        envRT = new THREE.CubeRenderTarget(ENV_SIZE, envOpts);
        envRT.texture.colorSpace = THREE.NoColorSpace;
        envRT.texture.anisotropy = 4;
        envDummy = new THREE.CubeRenderTarget(1, envOpts);
        envDummy.texture.colorSpace = THREE.NoColorSpace;
        envDummy.texture.anisotropy = 4;
        const _prevTgt = renderer.getRenderTarget();
        const _prevA = renderer.getClearAlpha ? renderer.getClearAlpha() : 1;
        renderer.setClearColor(0x000000, 1);
        for (let f = 0; f < 6; f++) { renderer.setRenderTarget(envDummy, f); renderer.clear(); }
        renderer.setRenderTarget(_prevTgt);
        try { renderer.setClearAlpha(_prevA); } catch (_) {}
      } catch (e) {
        try { Log.warn("gfx", "TLX: env-probe target alloc failed, analytic reflections only —", e); } catch (_) {}
        envRT = null; envDummy = null;
      }

      let matMaps = null;
      let matPlaceAlbedo = null, matPlaceNormal = null;
      let matOwnedAlbedo = null, matOwnedNormal = null;
      try {
        const grey = (v) => {
          const d = new Uint8Array(17 * 4);
          for (let i = 0; i < 17; i++) { d[i * 4] = v[0]; d[i * 4 + 1] = v[1]; d[i * 4 + 2] = v[2]; d[i * 4 + 3] = 255; }
          const t = new THREE.DataArrayTexture(d, 1, 1, 17);
          t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
          t.colorSpace = THREE.NoColorSpace;
          if (!_arrayNearest) {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.minFilter = THREE.LinearMipmapLinearFilter;
            t.magFilter = THREE.LinearFilter;
            t.generateMipmaps = true;
            t.anisotropy = materialArrayAnisotropy();
          }
          t.needsUpdate = true;
          return t;
        };
        matPlaceAlbedo = grey([128, 128, 128]);
        matPlaceNormal = grey([128, 128, 255]);
        matMaps = { albedo: matPlaceAlbedo, normal: matPlaceNormal };
      } catch (_) { matMaps = null; matPlaceAlbedo = matPlaceNormal = null; }

      const LG_LAMPS = 1024, LG_IDX = 256, LG_G = 256;
      let lampGrid = null;
      try {
        const f32 = (n) => new Float32Array(n);
        const mk = (data, w, h, fmt) => {
          const t = new THREE.DataTexture(data, w, h, fmt, THREE.FloatType);
          t.minFilter = t.magFilter = THREE.NearestFilter;
          t.generateMipmaps = false;
          t.colorSpace = THREE.NoColorSpace;
          t.needsUpdate = true;
          return t;
        };
        lampGrid = {
          lampTex: mk(f32(4 * LG_LAMPS * 4), 4, LG_LAMPS, THREE.RGBAFormat),
          idxTex:  mk(f32(LG_IDX * LG_IDX), LG_IDX, LG_IDX, THREE.RedFormat),
          gridTex: mk(f32(LG_G * LG_G * 2), LG_G, LG_G, THREE.RGFormat),
          LAMPS: LG_LAMPS, IDXW: LG_IDX, G: LG_G,
        };
      } catch (_) { lampGrid = null; }

      let lit = null;
      try {
        if (window.TLXShaders && chunks && TLXShaders.lit) {
          lit = TLXShaders.lit(THREE, TSL, { chunks, shadow: shadowSys, ssrTag: !!(TSL.mrt && renderer.setMRT),
            envCube: envRT ? envRT.texture : null, matMaps, lampGrid,
            sharedUniforms: _sharedUniforms,
            maxLights: _liteGpu ? LightBudget.LITE : LightBudget.MAX });
        }
      } catch (e) {
        try { Log.warn("gfx", "TLX: lit factory failed, falling back to unlit —", e); } catch (_) {}
        lit = null;
      }
      if (lit && lampGrid && lit.setLampGrid && lit.setLampGridColors) {
        const lt = lampGrid.lampTex, _setGrid = lit.setLampGrid, _setCols = lit.setLampGridColors;
        let fullOwed = true;
        lt.onUpdate = (t) => { if (t.image.height === LG_LAMPS) fullOwed = false; t.image.height = LG_LAMPS; };
        lit.setLampGrid = function (info) {
          lt.image.height = LG_LAMPS;
          if (info) fullOwed = true;
          return _setGrid.call(this, info);
        };
        lit.setLampGridColors = function (L) {
          const ok = _setCols.call(this, L);
          if (ok && !fullOwed) lt.image.height = Math.min(LG_LAMPS, Math.max(64, Math.ceil(((L.length / 15) | 0) / 64) * 64));
          return ok;
        };
      }
      const _maxLights = () => (lit && lit.MAX_LIGHTS > 0) ? lit.MAX_LIGHTS : (_liteGpu ? LightBudget.LITE : LightBudget.MAX);
      LightBudget.setSlots(_maxLights());

      let sky = null;
      let skyMesh = null, skyMatFull = null, skyMatFallback = null;
      const _skyCacheOn = (function () {
        try { return localStorage.getItem("apex26.tlxSkyCache") !== "0"; } catch (_) { return true; }
      })() && !softContent("sky") && !!(post && post.hdrOk && post.hdrOk());
      const _skyCacheSize = (function () {
        let v = "";
        try { v = localStorage.getItem("apex26.tlxSkyCache512") || ""; } catch (_) {  }
        return (v === "all" || (v === "1" && mobileTier)) ? 512 : 0;
      })();
      try {
        if (window.TLXShaders && TLXShaders.sky) {
          if (!chunks && TLXShaders.chunks) chunks = TLXShaders.chunks(THREE, TSL);
          sky = TLXShaders.sky(THREE, TSL, { chunks, cache: _skyCacheOn, cacheSize: _skyCacheSize, vp: vport, sceneView });
        }
      } catch (e) {
        try { Log.warn("gfx", "TLX: sky factory failed, flat clear only —", e); } catch (_) {}
        sky = null;
      }
      function skyClipNode() {
        return TSL.vec4(TSL.positionGeometry.x, TSL.positionGeometry.y, 1.0, 1.0);
      }
      function makeSkyMat(node, key) {
        const m = new THREE.MeshBasicNodeMaterial();
        m.colorNode = node;
        m.vertexNode = skyClipNode();
        m.depthTest = true;
        m.depthWrite = false;
        m.depthFunc = THREE.LessEqualDepth;
        m.lights = false;
        m.fog = false;
        m.toneMapped = false;
        m.transparent = false;
        m.side = THREE.FrontSide;
        m.customProgramCacheKey = () => key;
        return m;
      }
      if (sky && sky.node && TSL.positionGeometry && TSL.vec4) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
        skyMatFull = makeSkyMat(sky.node, "tlx-sky");
        skyMatFallback = sky.fallbackNode ? makeSkyMat(sky.fallbackNode, "tlx-sky-fb") : skyMatFull;
        skyMesh = new THREE.Mesh(geo, skyMatFull);
        skyMesh.frustumCulled = false;
        skyMesh.matrixAutoUpdate = false;
        skyMesh.renderOrder = 1000000;
        skyMesh.visible = false;
        scene.add(skyMesh);
      }
      function armSkyMesh(useFallback) {
        if (!skyMesh) return;
        skyMesh.material = useFallback && skyMatFallback ? skyMatFallback : skyMatFull;
        skyMesh.visible = true;
      }
      function hideSkyMesh() {
        if (skyMesh) skyMesh.visible = false;
      }
      let _skyCacheErr = null;
      function skyCacheStep() {
        if (!sky || !sky.cacheStep) return;
        try { _gpuLastOperation = "render-sky-cache"; sky.cacheStep(renderer); }
        catch (e) {
          if (!_skyCacheErr) {
            _skyCacheErr = (e && e.message) || String(e);
            try { Log.warn("gfx", "TLX: sky cloud cache failed, per-pixel clouds —", _skyCacheErr); } catch (_) {  }
          }
        }
      }

      let fx = null;
      try {
        if (window.TLXShaders && TLXShaders.fx) {
          fx = TLXShaders.fx(THREE, TSL, { chunks, sharedUniforms: _sharedUniforms, lit });
        }
      } catch (e) {
        try { Log.warn("gfx", "TLX: fx factory failed, FX paths off —", e); } catch (_) {}
        fx = null;
      }

      let chunkedSys = null;
      try {
        if (window.TLXShaders && TLXShaders.chunked) {
          const noteNulled = (a) => _mirrorLedger.note(a);
          chunkedSys = TLXShaders.chunked(THREE, {
            isWebGPU: () => !!(renderer.backend && renderer.backend.isWebGPUBackend),
            releaseGeometry,
            releaseAttribute,
            noteNulled,
          });
        }
      } catch (e) {
        try { Log.warn("gfx", "TLX: chunked factory failed, un-culled props —", e); } catch (_) {}
        chunkedSys = null;
      }

      const vizMat = (lit && vizMode && LIT_VIZ.indexOf(vizMode) >= 0)
        ? lit.makeViz(vizMode) : null;

      const defaultMat = lit ? lit.makeMaterial({}) : null;
      const defaultMatChunked = lit ? lit.makeMaterial({ chunked: true }) : null;
      const defaultMatInstanced = lit ? lit.makeMaterial({ instanced: true }) : null;
      const matCache = new Map();
      const _matDispose = [];
      const MAT_CACHE_CAP = 64;
      function lruVictim(cache, frame) {
        let best, bestAt = Infinity;
        for (const [k, v] of cache) {
          const at = v ? v.__tlxFrame : -1;
          if (at === frame) continue;
          if (at < bestAt) { bestAt = at; best = k; }
        }
        return best;
      }
      let _matFrame = 0;
      let _matHit = 0, _matMiss = 0, _matEvict = 0;
      const _matMissLog = [];
      function fallbackMat(instanced) {
        if (instanced === 2) return _drawMatMode >= 2 ? null : _aiOf(unlitInstancedMat);
        return _drawMatMode >= 2 ? rawUnlitMat : (instanced ? unlitInstancedMat : unlitMat);
      }
      const drawEm = (o) => (o && o.emissive !== undefined ? o.emissive : 0);
      const drawAl = (o) => (o && o.alpha !== undefined ? o.alpha : 1);
      const _matKeyMemo = new WeakMap();
      function buildMatKey(o, chunked, instanced) {
        return (o.alpha !== undefined && o.alpha < 1 ? "t," : "o,") +
          (o.roughness !== undefined ? o.roughness : 0.7) + "," +
          (o.metalness !== undefined ? o.metalness : 0) + "," +
          (o.specular !== undefined ? o.specular : 0.5) + "," +
          (o.detail !== undefined ? o.detail : 0) + "," +
          (o.clearcoat !== undefined ? o.clearcoat : 0) + "," +
          (o.carPaint !== undefined ? o.carPaint : 0) + "," +
          (o.sparkle !== undefined ? o.sparkle : 1) +
          (o.carFinish ? "|cf" : "") +
          (o.doubleSided ? "|ds" : "") +
          (o.noAlphaWrite ? "|na" : "") +
          (o.depthBias ? "|db" + o.depthBias[0] + "," + o.depthBias[1] : "") +
          (o.noDepthTest ? "|nd" : "") +
          (chunked ? "|ch" : "") +
          (instanced === 2 ? "|ai" : instanced ? "|in" : "");
      }
      const _instMode = (i) => (i === 2 ? 2 : i ? 1 : 0);
      function matKeyFor(o, chunked, instanced) {
        const db = o.depthBias, db0 = db ? db[0] : 0, db1 = db ? db[1] : 0;
        let c = _matKeyMemo.get(o);
        const tr = o.alpha !== undefined && o.alpha < 1;
        if (c !== undefined && c.tr === tr && c.ro === o.roughness
          && c.me === o.metalness && c.sp === o.specular && c.de === o.detail
          && c.cc === o.clearcoat && c.cp === o.carPaint && c.sk === o.sparkle
          && c.cf === !!o.carFinish && c.ds === !!o.doubleSided && c.na === !!o.noAlphaWrite && c.nd === !!o.noDepthTest
          && c.hb === !!db && c.b0 === db0 && c.b1 === db1
          && c.ch === !!chunked && c.in === _instMode(instanced)) return c.key;
        if (c === undefined) { c = {}; _matKeyMemo.set(o, c); }
        c.tr = tr; c.ro = o.roughness; c.me = o.metalness;
        c.sp = o.specular; c.de = o.detail; c.cc = o.clearcoat; c.cp = o.carPaint;
        c.sk = o.sparkle; c.cf = !!o.carFinish; c.ds = !!o.doubleSided; c.na = !!o.noAlphaWrite;
        c.nd = !!o.noDepthTest; c.hb = !!db; c.b0 = db0; c.b1 = db1;
        c.ch = !!chunked; c.in = _instMode(instanced);
        c.key = buildMatKey(o, chunked, instanced);
        return c.key;
      }
      const _fxKeys = new Map();
      function materialFor(opts, chunked, instanced, fx) {
        if (_drawMatMode || !lit) return fallbackMat(instanced);
        if (vizMat) return instanced === 2 ? _aiOf(vizMat) : vizMat;
        if (!opts) return chunked ? defaultMatChunked : instanced === 2
          ? (_aiDefault || (_aiDefault = _attrInst(lit.makeMaterial({ instanced: true })))) : (instanced ? defaultMatInstanced : defaultMat);
        const o = opts;
        let key = matKeyFor(o, chunked, instanced);
        if (fx) { let fk = _fxKeys.get(key); if (fk === undefined) _fxKeys.set(key, fk = key + "|fx"); key = fk; }
        let m = matCache.get(key);
        if (m) _matHit++; else {
          _matMiss++;
          if (_matMissLog.push(key) > 64) _matMissLog.shift();
          if (matCache.size >= MAT_CACHE_CAP) {
            const k = lruVictim(matCache, _matFrame);
            if (k !== undefined) {
              const v = matCache.get(k);
              matCache.delete(k);
              if (lit.releaseMaterial) lit.releaseMaterial(v);
              if (v) _matDispose.push(v);
              _matEvict++;
            }
          }
          m = lit.makeMaterial(chunked
            ? Object.assign({ chunked: true }, o)
            : (instanced ? Object.assign({ instanced: true }, o, fx ? { finishX: true } : null) : (fx ? Object.assign({ finishX: true }, o) : o)));
          if (instanced === 2 && m) _attrInst(m);
          matCache.set(key, m);
        }
        if (m) m.__tlxFrame = _matFrame;
        return m;
      }

      const _recPool = [];
      const drawList = _recPool;
      drawList.n = 0;
      function pushRec(geo, m, mat, em, al, lg, chunked, instanced) {
        let r = _recPool[drawList.n];
        if (!r) r = _recPool[drawList.n] = { geo: null, m: null, mat: null, em: undefined, al: undefined, lg: 0, chunked: null, instanced: null, split: null };
        drawList.n++;
        r.geo = geo; r.m = m; r.mat = mat; r.em = em; r.al = al; r.lg = lg; r.chunked = chunked; r.instanced = instanced;
        r.split = _roadSplitOn && geo && geo.__tlxSplit && !m ? geo.__tlxSplit : null;
      }
      const SPLIT_TRIS = 1024, SPLIT_MIN_IDX = 18000, SPLIT_SLOTS = 4;
      let _roadSplitOn = (function () { try { return localStorage.getItem("apex26.tlxRoadSplit") !== "0"; } catch (_) { return true; } })();
      let _chunkMerge = true;
      try { _chunkMerge = localStorage.getItem("apex26.tlxChunkMerge") !== "0"; } catch (_) {  }
      const _shMergeWrap = { __tlx: true, geo: null };
      let _chunkPrime = false, _chunkPrimeNow = false, _chunkPrimeN = 0;
      const _chunkPrimeZ = new Float32Array(16);
      function _primeMergeSlot(rec, order) {
        const mesh = rec.chunked, mat = rec.mat;
        if (!mesh || !mesh.chunks || mesh.chunks.length < 2 || (mesh._tlxMv && mesh._tlxMv[0])) return false;
        if ((mat && (mat.transparent || mat.depthWrite === false)) || rec.al < 1) return false;
        const vis = chunkedSys.visList;
        vis[0] = mesh.chunks[0]; vis[1] = mesh.chunks[1];
        const g = chunkedSys.mergeVisible(mesh, 2, 0);
        if (!g) return false;
        acquireMesh(g, _chunkPrimeZ, mat, rec).renderOrder = order;
        _chunkPrimeN++;
        return true;
      }
      function _drawChunked(rec, order, vp, eye, cd, fog, slot) {
        if (!chunkedSys) return 0;
        if (_chunkPrimeNow && slot === 0 && _chunkMerge && chunkedSys.mergeVisible) _primeMergeSlot(rec, order);
        const mat = rec.mat;
        if (slot === 1 && cd > 0 && _chunkMerge && chunkedSys.fineCells
            && !(mat && (mat.transparent || mat.depthWrite === false)) && !(rec.al < 1)) {
          const fine = chunkedSys.fineCells(rec.chunked);
          const fn = fine ? chunkedSys.cull(fine, vp, eye, cd, fog) : 0;
          const fg = fn > 1 ? chunkedSys.mergeVisible(fine, fn, slot) : null;
          if (fg) { acquireMesh(fg, rec.m, rec.mat, rec).renderOrder = order; return fn; }
          if (fine && fn === 0) return 0;
        }
        const n = chunkedSys.cull(rec.chunked, vp, eye, cd, fog);
        if (_chunkMerge && n > 1 && chunkedSys.mergeVisible
            && !(mat && (mat.transparent || mat.depthWrite === false))
            && !(rec.al < 1)) {
          const g = chunkedSys.mergeVisible(rec.chunked, n, slot);
          if (g) { acquireMesh(g, rec.m, rec.mat, rec).renderOrder = order; return n; }
        }
        const vis = chunkedSys.visList;
        for (let j = 0; j < n; j++) acquireMesh(vis[j].geo, rec.m, rec.mat, rec).renderOrder = order;
        return n;
      }
      function _drawSplit(rec, i, vp, eye, cd, fog) {
        const sp = rec.split;
        if (!chunkedSys || !TLXShaders.mergeRuns || sp.batch === _poolBatch) return false;
        sp.batch = _poolBatch;
        const n = chunkedSys.cull(sp, vp, eye, cd, fog);
        const r = TLXShaders.mergeRuns(chunkedSys.visList, n, SPLIT_SLOTS, sp.runs);
        for (let k = 0; k < r; k++) {
          const g = sp.slots[k];
          g.setDrawRange(sp.runs[2 * k], sp.runs[2 * k + 1]);
          acquireMesh(g, rec.m, rec.mat, rec).renderOrder = i;
        }
        rec.geo.__tlxDrawnBatch = _poolBatch;
        return true;
      }
      function makeSplit(geo, data) {
        geo.computeBoundingSphere(); geo.computeBoundingBox();
        const slots = [];
        for (let k = 0; k < SPLIT_SLOTS; k++) {
          const g = new THREE.BufferGeometry();
          for (const a of Object.keys(geo.attributes)) g.setAttribute(a, geo.attributes[a]);
          g.setIndex(geo.index);
          g.boundingSphere = geo.boundingSphere.clone(); g.boundingBox = geo.boundingBox.clone();
          slots.push(g);
        }
        return { chunks: TLXShaders.splitRanges(data.pos, data.idx, SPLIT_TRIS), slots, runs: new Array(SPLIT_SLOTS * 2).fill(0), batch: -1 };
      }
      function resetRecs() {
        for (let i = 0; i < drawList.n; i++) { const r = _recPool[i]; r.geo = null; r.m = null; r.mat = null; r.chunked = null; r.instanced = null; r.split = null; }
        drawList.n = 0;
      }
      const _dMats = [];
      let _dMatUsed = 0;
      function poolModelMat(model) {
        if (!model) return null;
        if (model[0] === 1 && model[5] === 1 && model[10] === 1 && model[15] === 1
            && model[1] === 0 && model[2] === 0 && model[3] === 0
            && model[4] === 0 && model[6] === 0 && model[7] === 0
            && model[8] === 0 && model[9] === 0 && model[11] === 0
            && model[12] === 0 && model[13] === 0 && model[14] === 0) return null;
        let m = _dMats[_dMatUsed] || (_dMats[_dMatUsed] = new Float32Array(16));
        _dMatUsed++;
        m.set(model);
        return m;
      }
      let _instStamp = 0;
      const _instRegistry = [];
      const _instRootOn = true;
      const instRoot = new THREE.Object3D();
      instRoot.matrixAutoUpdate = false; instRoot.matrixWorldAutoUpdate = false;
      if (_instRootOn) scene.add(instRoot);
      scene.userData.instRegistry = _instRegistry;
      const _instKids = [];
      function _instAdd(im) {
        if (!_instRootOn) { scene.add(im); return; }
        if (im.parent && im.parent !== instRoot) im.parent.remove(im);
        im.parent = instRoot;
      }
      function _instRemove(im) {
        if (!_instRootOn || im.parent !== instRoot) { scene.remove(im); return; }
        const k = instRoot.children.indexOf(im);
        if (k >= 0) instRoot.children.splice(k, 1);
        im.parent = null;
      }
      function _instShow() {
        if (!_instRootOn) return;
        let n = 0;
        for (let i = 0; i < _instRegistry.length; i++) { const im = _instRegistry[i]; if (im.visible) _instKids[n++] = im; }
        if (_instKids.length !== n) _instKids.length = n;
        instRoot.children = _instKids;
      }
      let _instUsage = THREE.StreamDrawUsage;
      try { if (localStorage.getItem("apex26.tlxDynUsage") === "1") _instUsage = THREE.DynamicDrawUsage; } catch (_) {  }
      const _instUsageOf = (mesh) => (mesh.isInstancedMesh ? THREE.DynamicDrawUsage : _instUsage);

      function _instColorAttr(imesh, cap) {
        const need = Math.max(1, cap | 0);
        const geo = imesh.geometry;
        if (!geo) return null;
        const attr = geo.getAttribute("instanceTint");
        if (attr && attr.isInstancedBufferAttribute && attr.count >= need) return attr;
        const next = new THREE.InstancedBufferAttribute(new Float32Array(need * 3), 3);
        next.setUsage(_instUsage);
        next.array.fill(1);
        geo.setAttribute("instanceTint", next);
        return next;
      }
      function _writeInstanceMatrices(imesh, matrices, colors, n, firstDirty = 0) {
        const cap = imesh.userData.tlxInstCap || n;
        const drawN = Math.min(n, cap);
        const col = _instColorAttr(imesh, cap);
        const im = imesh.instanceMatrix, ia = im.array;
        const nf = drawN * 16;
        const ownMatrices = matrices.buffer === ia.buffer && matrices.byteOffset === ia.byteOffset;
        if (!ownMatrices) ia.set(matrices.length === nf ? matrices : matrices.subarray(0, nf));
        const first = Math.max(0, Math.min(drawN, firstDirty));
        if (colors && colors.length && col) {
          const ca = col.array, nc = drawN * 3;
          const ownColors = colors.buffer === ca.buffer && colors.byteOffset === ca.byteOffset;
          if (!ownColors) ca.set(colors.length === nc ? colors : colors.subarray(0, nc));
          const from = ownColors ? first * 3 : 0;
          setInstanceRange(col, from, nc - from);
        }
        const from = ownMatrices ? first * 16 : 0;
        setInstanceRange(im, from, nf - from);
        imesh.count = drawN;
      }
      function updateInstances(batch, matrices, n, colors) {
        if (!batch || !batch.imesh) return 0;
        const v = Math.max(0, Math.min(batch.instances | 0, n | 0));
        _writeInstanceMatrices(batch.imesh, matrices, colors || null, v);
        batch.visible = v;
        batch._cullPlanes = null;
        InstCells.invalidate(batch);
        return v;
      }

      function createInstancedBatch(data, matrices, colors, opts) {
        if (!data || !data.pos || !data.pos.length || !matrices || !matrices.length) {
          return { __tlx: true, geo: null, instances: 0, visible: 0, imesh: null };
        }
        const geo = buildGeometry(data);
        const n = (matrices.length / 16) | 0;
        const cap = _aiInst ? n : (window.TLXShaders && TLXShaders.uboInstCap) ? TLXShaders.uboInstCap(renderer, n) : n;
        const imesh = _aiInst ? _aiMesh(geo, unlitMat, n) : new THREE.InstancedMesh(geo, unlitMat, cap);
        imesh.matrixAutoUpdate = false;
        imesh.frustumCulled = false;
        imesh.instanceMatrix.setUsage(_instUsageOf(imesh));
        imesh.userData.tlxInstCap = n;
        _instColorAttr(imesh, n);
        _writeInstanceMatrices(imesh, matrices, colors, n);
        imesh.visible = false;
        _instAdd(imesh);
        _instRegistry.push(imesh);

        const batch = {
          __tlx: true,
          geo,
          instances: n,
          visible: n,
          imesh,
          srcMatrices: matrices,
          srcColors: colors && colors.length ? colors : null,
          packMatrices: imesh.instanceMatrix.array.subarray(0, matrices.length),
          packColors: colors && colors.length ? _instColorAttr(imesh, n).array.subarray(0, colors.length) : null,
          cells: null,
        };
        if (opts && opts.cellSize > 0 && n) {
          const cell = opts.cellSize;
          batch.cells = Frustum.bucketInstances(matrices, n, data.pos, cell, opts.radius);
        }
        imesh.userData.tlxBatch = batch;
        return batch;
      }

      function cullInstances(batch, planes, opts) {
        if (!batch || !batch.cells) return batch ? batch.instances : 0;
        const shadow = !!(opts && opts.upload === false);
        const eye = shadow ? null : (_mirActive ? _mirEye : frameEye);
        const cd = shadow ? 0 : (_mirActive ? _mirCull : frameCullDist);
        const fog = shadow ? null : (_mirActive ? _mirFog : frameCullFog);
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
        const cs = batch.cells;
        const useKey = !shadow && InstCells.enabled();
        const ks = useKey ? InstCells.scratchKeys(batch, cs.length) : null;
        const kN = useKey ? InstCells.collectVisible(planes, cs, ks, TLXShaders.aabbInFrustum, eye, cd, fog) : -1;
        if (useKey && InstCells.sameKey(batch, ks, kN)) { batch.visible = batch._cullN; return batch._cullN; }
        let firstCell = 0, firstDirty = 0;
        if (useKey && batch._cellKeyN >= 0) {
          while (firstCell < kN && firstCell < batch._cellKeyN && batch._cellKey[firstCell] === ks[firstCell]) firstDirty += cs[ks[firstCell++]].idx.length;
        }
        const src = batch.srcMatrices;
        let dst = batch.packMatrices;
        if (shadow) {
          const ca = batch._shCasterArr;
          if (ca && ca.length >= src.length) dst = ca;
          else {
            let sp = cullInstances._shPack;
            if (!sp || sp.length < src.length) sp = cullInstances._shPack = new Float32Array(src.length);
            const prev = cullInstances._shOwner;
            if (prev && prev !== batch && prev._shadowPack === sp) { prev._shadowFresh = false; prev._shadowPack = null; }
            cullInstances._shOwner = batch;
            dst = sp;
          }
          batch._shadowPack = dst;
        }
        const reach = shadow && opts.reach && opts.reach[3] > 0 ? opts.reach : null, reach2 = reach ? reach[3] * reach[3] : 0;
        const sc = batch.srcColors, dc = shadow ? null : batch.packColors;
        let n = firstDirty;
        for (let ci = firstCell, cn = useKey ? kN : cs.length; ci < cn; ci++) {
          const c = useKey ? cs[ks[ci]] : cs[ci];
          if (!useKey && !TLXShaders.aabbInFrustum(planes, c.mn, c.mx)) continue;
          if (!useKey && eye && (cd > 0 || (fog && fog[0] > 0))
              && Frustum.radialCulled(c.mn, c.mx, eye[0], eye[1], eye[2], cd, fog)) continue;
          if (reach && TLXShaders.aabbDist2(c.mn, c.mx, reach[0], reach[1], reach[2]) > reach2) continue;
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
        if (opts && opts.upload === false) { batch._shadowFresh = true; return n; }
        batch.visible = n;
        if (batch.imesh) _writeInstanceMatrices(batch.imesh, dst, dc, n, firstDirty);
        const snap = batch._cullPlanes || (batch._cullPlanes = new Float64Array(24));
        for (let pi = 0, po = 0; pi < 6; pi++) {
          const p = planes[pi];
          for (let k = 0; k < 4; k++, po++) snap[po] = p[k];
        }
        InstCells.recordRadial(batch, eye, cd, fog);
        batch._cullN = n;
        if (useKey) InstCells.recordKey(batch, ks, kN);
        return n;
      }

      function drawInstanced(batch, opts) {
        if (skipBatches()) return;
        if (!batch || !batch.imesh || !batch.instances) return;
        const n = batch.visible === undefined ? batch.instances : batch.visible;
        if (n <= 0) return;
        const mat = materialFor(opts, false, batch.imesh.isInstancedMesh ? true : 2);
        if (mat) pushRec(null, null, mat, drawEm(opts), drawAl(opts), 0, null, batch);
      }

      function disposeInstancedObject(mesh) {
        if (!mesh) return;
        try {
          if (mesh.isInstancedMesh && typeof mesh.dispose === "function") mesh.dispose();
          else if (typeof mesh.dispatchEvent === "function") mesh.dispatchEvent({ type: "dispose" });
        } catch (_) {  }
      }

      function freeInstancedBatch(batch) {
        if (!batch) return;
        if (shadowSys && shadowSys.freeInstanced) shadowSys.freeInstanced(batch);
        const mv = batch._mir;
        if (mv) {
          batch._mir = null;
          const ix = _instRegistry.indexOf(mv.imesh);
          if (ix >= 0) _instRegistry.splice(ix, 1);
          try { _instRemove(mv.imesh); } catch (_) {  }
          disposeInstancedObject(mv.imesh);
          try { mv.imesh.geometry.dispose(); } catch (_) {  }
          mv.imesh = null; mv.cells = null; mv.srcMatrices = mv.srcColors = mv.packMatrices = mv.packColors = null;
        }
        if (batch.imesh) {
          const ix = _instRegistry.indexOf(batch.imesh);
          if (ix >= 0) _instRegistry.splice(ix, 1);
          try { _instRemove(batch.imesh); } catch (_) {  }
          disposeInstancedObject(batch.imesh);
          batch.imesh = null;
        }
        if (batch.geo) {
          try { batch.geo.dispose(); } catch (_) {  }
          batch.geo = null;
        }
        batch._shadowPack = null; batch._shadowFresh = false;
        if (cullInstances._shOwner === batch) cullInstances._shOwner = null;
      }

      function castShadowInstanced(batch, count) {
        const sh = count !== undefined && batch && batch._shadowFresh ? batch._shadowPack : null, cam = sh && batch.packMatrices;
        if (batch) { batch._shadowFresh = false; batch._shadowPack = null; }
        if (skipBatches() || !shadowSys || !shadowSys.castInstanced) return;
        if (sh) batch.packMatrices = sh;
        try { shadowSys.castInstanced(batch, count); } finally { if (sh) batch.packMatrices = cam; }
      }

      const _instPerPass = !isMobile;
      function _mirOf(batch) {
        if (batch._mir) return batch._mir;
        const main = batch.imesh, src = batch.geo, n = main.userData.tlxInstCap | 0;
        const g = new THREE.BufferGeometry();
        if (src.index) g.setIndex(src.index);
        for (const k in src.attributes) if (k !== "instanceTint" && !_AI_ATTR.test(k)) g.setAttribute(k, src.attributes[k]);
        g.drawRange.start = src.drawRange.start; g.drawRange.count = src.drawRange.count;
        for (let i = 0; i < src.groups.length; i++) g.addGroup(src.groups[i].start, src.groups[i].count, src.groups[i].materialIndex);
        const im = main.isInstancedMesh ? new THREE.InstancedMesh(g, main.material || unlitMat, main.instanceMatrix.count)
          : _aiMesh(g, main.material || unlitMat, main.instanceMatrix.count);
        im.matrixAutoUpdate = false;
        im.frustumCulled = false;
        im.instanceMatrix.setUsage(_instUsageOf(im));
        im.userData.tlxInstCap = n;
        const tint = _instColorAttr(im, n);
        _writeInstanceMatrices(im, batch.srcMatrices, batch.srcColors, n);
        im.visible = false;
        _instAdd(im);
        _instRegistry.push(im);
        return (batch._mir = {
          __tlx: true, geo: batch.geo, instances: batch.instances, visible: batch.instances, imesh: im,
          srcMatrices: batch.srcMatrices, srcColors: batch.srcColors,
          packMatrices: im.instanceMatrix.array.subarray(0, batch.srcMatrices.length),
          packColors: batch.srcColors && tint ? tint.array.subarray(0, batch.srcColors.length) : null,
          cells: batch.cells,
        });
      }
      function _passBatch(batch) {
        return _mirActive && _instPerPass && batch && batch.imesh && batch.geo && !skipBatches() ? _mirOf(batch) : batch;
      }
      function _mirWarmSwap() {
        _mirSwapped.length = 0;
        for (let i = 0, n = _instRegistry.length; i < n; i++) {
          const im = _instRegistry[i], b = im.userData.tlxBatch;
          if (!b || !im.visible || !b.geo) continue;
          const v = _mirOf(b).imesh;
          v.material = im.material; v.count = im.count;
          v.userData.tlxEmissive = im.userData.tlxEmissive; v.userData.tlxAlpha = im.userData.tlxAlpha;
          v.visible = true; im.visible = false;
          _mirSwapped.push(im, v);
        }
        _instShow();
      }
      const _mirSwapped = [];
      function _mirWarmUnswap() {
        for (let i = 0; i < _mirSwapped.length; i += 2) { _mirSwapped[i].visible = true; _mirSwapped[i + 1].visible = false; }
        if (_mirSwapped.length) _instShow();
        _mirSwapped.length = 0;
      }

      function _showInstanced(rec, order) {
        const b = rec.instanced;
        const n = b.visible === undefined ? b.instances : b.visible;
        if (!(n > 0) || !b.imesh) return;
        b.imesh.count = n;
        b.imesh.material = rec.mat || unlitMat;
        b.imesh.userData.tlxEmissive = rec.em;
        b.imesh.userData.tlxAlpha = rec.al;
        b.imesh.renderOrder = order;
        b.imesh.visible = true;
        b.imesh.__tlxShown = _instStamp;
      }

      function _hideUndrawnInstanced() {
        for (let i = 0; i < _instRegistry.length; i++) {
          const im = _instRegistry[i];
          if (im.__tlxShown !== _instStamp) im.visible = false;
        }
        _instShow();
        _instStamp++;
      }
      let _ssrMrt = null;
      function _ssrMrtNode() {
        if (!_ssrMrt) _ssrMrt = TSL.mrt({ output: TSL.output, ssrTag: TSL.float(1) });
        return _ssrMrt;
      }
      let _poolNow = typeof performance !== "undefined" ? performance.now() : Date.now();
      const meshPool = [];
      const meshByGeo = new Map();
      let _poolBatch = 0;
      let _pruneLast = 0;
      let _r6 = true;
      try { _r6 = localStorage.getItem("apex26.tlxPoolRoot") !== "0"; } catch (_) {  }
      const poolRoot = new THREE.Object3D();
      poolRoot.matrixAutoUpdate = false; poolRoot.matrixWorldAutoUpdate = false;
      if (_r6) scene.add(poolRoot);
      const _kidsMain = [], _kidsMir = [], _kidsEnv = [];
      let _kids = _kidsMain, _kidN = 0, _kidBatch = -1;
      function _kidsBegin(arr) { _kids = arr; _kidN = 0; _kidBatch = _poolBatch; }
      function _poolShow() {
        if (!_r6) {
          for (let i = 0; i < meshPool.length; i++) { const pm = meshPool[i]; if (pm.__tlxBatch !== _poolBatch) pm.visible = false; }
          return;
        }
        if (_kidBatch !== _poolBatch) _kidN = 0;
        if (_kids.length !== _kidN) _kids.length = _kidN;
        poolRoot.children = _kids;
      }
      const _tmpMat4 = new THREE.Matrix4(), _tmpMat4b = new THREE.Matrix4();
      const Z01 = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,0.5,0, 0,0,0.5,1]);
      const _projGpu = new Float32Array(16);
      const _vpGpuTlx = new Float32Array(16);
      function _mul4Col(out, a, b) {
        for (let c = 0; c < 4; c++) {
          const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
          out[c * 4]     = a[0] * b0 + a[4] * b1 + a[8] * b2  + a[12] * b3;
          out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2  + a[13] * b3;
          out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
          out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
        }
        return out;
      }

      let fxQuadGeo = null;
      function getFxQuad() {
        if (!fxQuadGeo) {
          fxQuadGeo = new THREE.BufferGeometry();
          fxQuadGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
            -0.5, 0.02, -0.5, -0.5, 0.02, 0.5, 0.5, 0.02, 0.5, 0.5, 0.02, -0.5]), 3));
          fxQuadGeo.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
        }
        return fxQuadGeo;
      }
      const _fxMats = [];
      let _fxMatUsed = 0;
      function fxMatFor(model, w, l) {
        let a = _fxMats[_fxMatUsed] || (_fxMats[_fxMatUsed] = new Float32Array(16));
        _fxMatUsed++;
        for (let r = 0; r < 4; r++) {
          a[r] = model[r] * w;
          a[4 + r] = model[4 + r];
          a[8 + r] = model[8 + r] * l;
          a[12 + r] = model[12 + r];
        }
        return a;
      }
      const BLOB_CAP = 64;
      let _blob = null;
      function _blobAppend(model, w, l) {
        if (skipBatches()) return false;
        let b = _blob;
        if (!b) {
          const cap = (window.TLXShaders && TLXShaders.uboInstCap) ? TLXShaders.uboInstCap(renderer, BLOB_CAP) : BLOB_CAP;
          const im = new THREE.InstancedMesh(getFxQuad(), fx.shadowMat, cap);
          im.matrixAutoUpdate = false;
          im.frustumCulled = false;
          im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          im.visible = false;
          _instAdd(im);
          _instRegistry.push(im);
          b = _blob = { __tlx: true, imesh: im, instances: BLOB_CAP, visible: 0, rec: -1 };
        }
        const live = b.rec >= 0 && b.rec < drawList.n && drawList[b.rec].instanced === b;
        if (live) {
          if (b.rec !== drawList.n - 1 || b.visible >= BLOB_CAP) return false;
        } else {
          b.visible = 0; b.rec = drawList.n;
          pushRec(null, null, fx.shadowMat, undefined, undefined, 0, null, b);
        }
        const im = b.imesh.instanceMatrix, a = im.array, o = b.visible * 16;
        for (let r = 0; r < 4; r++) {
          a[o + r] = model[r] * w;
          a[o + 4 + r] = model[4 + r];
          a[o + 8 + r] = model[8 + r] * l;
          a[o + 12 + r] = model[12 + r];
        }
        b.visible++;
        setRange0(im, b.visible * 16);
        im.needsUpdate = true;
        return true;
      }
      const _decalRuns = new Map();
      function _decalAppend(geo, w, mat) {
        if (skipBatches()) return false;
        let b = _decalRuns.get(geo);
        if (!b) {
          const im = new THREE.InstancedMesh(geo, mat, (window.TLXShaders && TLXShaders.uboInstCap) ? TLXShaders.uboInstCap(renderer, BLOB_CAP) : BLOB_CAP);
          im.matrixAutoUpdate = false; im.frustumCulled = false; im.visible = false;
          im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          _instAdd(im); _instRegistry.push(im);
          _decalRuns.set(geo, b = { __tlx: true, imesh: im, instances: BLOB_CAP, visible: 0, rec: -1 });
        }
        if (b.rec >= 0 && b.rec < drawList.n && drawList[b.rec].instanced === b) {
          if (b.rec !== drawList.n - 1 || b.visible >= BLOB_CAP || drawList[b.rec].mat !== mat) return false;
        } else { b.visible = 0; b.rec = drawList.n; pushRec(null, null, mat, undefined, undefined, 0, null, b); }
        const im = b.imesh.instanceMatrix, a = im.array, o = b.visible * 16;
        for (let k = 0; k < 16; k++) a[o + k] = w[k];
        const nx = w[9] * w[2] - w[10] * w[1], ny = w[10] * w[0] - w[8] * w[2], nz = w[8] * w[1] - w[9] * w[0];
        a[o + 4] = nx; a[o + 5] = ny; a[o + 6] = nz; a[o + 7] = 0;
        b.visible++; setRange0(im, b.visible * 16); im.needsUpdate = true;
        return true;
      }
      function _decalDrop(geo) {
        const b = _decalRuns.get(geo);
        if (!b) return;
        _decalRuns.delete(geo);
        const ix = _instRegistry.indexOf(b.imesh);
        if (ix >= 0) _instRegistry.splice(ix, 1);
        dropWrapper(b.imesh);
        b.rec = -1;
      }
      let _coOn = true;
      try { _coOn = localStorage.getItem("apex26.tlxCoalesce") !== "0"; } catch (_) {  }
      const CO_CAP = 128, CO_STRIDE = 19;
      const _coRuns = new Map();
      const _coStat = { recs: 0, inst: 0, fall: 0 };
      const _coReflect = new THREE.Matrix4().makeScale(-1, 1, 1);
      const _aiInstance = TSL.Fn((_, builder) => {
        const iM = TSL.mat4(TSL.attribute("iM0", "vec4"), TSL.attribute("iM1", "vec4"),
          TSL.attribute("iM2", "vec4"), TSL.attribute("iM3", "vec4"));
        TSL.positionLocal.assign(iM.mul(TSL.positionLocal).xyz);
        if (builder.hasGeometryAttribute("normal")) TSL.normalLocal.assign(TSL.transformNormal(TSL.normalLocal, iM));
      }, "void");
      function _attrInst(m) {
        const setup = m.setupPosition, key = m.customProgramCacheKey;
        m.setupPosition = function (builder) { _aiInstance(); return setup.call(this, builder); };
        m.customProgramCacheKey = () => "ai-" + key();
        return m;
      }
      let _aiInst = true;
      try { _aiInst = localStorage.getItem("apex26.tlxAttrInst") !== "0"; } catch (_) {  }
      const _AI_ATTR = /^iM[0-3]$/;
      function _aiMesh(geo, mat, n) {
        const ib = new THREE.InstancedInterleavedBuffer(new Float32Array(Math.max(1, n) * 16), 16, 1);
        for (let c = 0; c < 4; c++) geo.setAttribute("iM" + c, new THREE.InterleavedBufferAttribute(ib, 4, c * 4));
        const m = new THREE.Mesh(geo, mat);
        m.instanceMatrix = ib; m.count = n;
        return m;
      }
      const _aiOfMemo = new WeakMap();
      function _aiOf(m) {
        let a = _aiOfMemo.get(m);
        if (!a) {
          a = m.clone();
          if (Object.prototype.hasOwnProperty.call(m, "customProgramCacheKey")) a.customProgramCacheKey = m.customProgramCacheKey;
          _aiOfMemo.set(m, a = _attrInst(a));
        }
        return a;
      }
      let _aiDefault = null;
      function _coRun(geo, neg) {
        let pair = _coRuns.get(geo);
        if (!pair) _coRuns.set(geo, pair = [null, null]);
        const s = neg ? 1 : 0;
        if (pair[s]) return pair[s];
        const v = new THREE.BufferGeometry();
        if (geo.index) v.setIndex(geo.index);
        for (const k in geo.attributes) v.setAttribute(k, geo.attributes[k]);
        v.drawRange.start = geo.drawRange.start; v.drawRange.count = geo.drawRange.count;
        for (let i = 0; i < geo.groups.length; i++) v.addGroup(geo.groups[i].start, geo.groups[i].count, geo.groups[i].materialIndex);
        const a = new Float32Array(CO_CAP * CO_STRIDE);
        for (let o = 16; o < a.length; o += CO_STRIDE) a[o] = a[o + 1] = a[o + 2] = 1;
        const ib = new THREE.InstancedInterleavedBuffer(a, CO_STRIDE, 1);
        ib.setUsage(_instUsage);
        for (let c = 0; c < 4; c++) v.setAttribute("iM" + c, new THREE.InterleavedBufferAttribute(ib, 4, c * 4));
        v.setAttribute("instanceTint", new THREE.InterleavedBufferAttribute(ib, 3, 16));
        const m = new THREE.Mesh(v, unlitMat);
        m.matrixAutoUpdate = false; m.matrixWorldAutoUpdate = false; m.frustumCulled = false;
        if (neg) m.matrixWorld.copy(_coReflect);
        m.visible = false;
        _instAdd(m); _instRegistry.push(m);
        return (pair[s] = { __tlx: true, imesh: m, ib, instances: CO_CAP, visible: 0, rec: -1 });
      }
      function _coAppend(geo, w, opts) {
        if (!_coOn || !w || _drawMatMode || vizMat || !lit || (opts.alpha !== undefined && opts.alpha < 1) || skipBatches() || fxFor(geo, opts)) return false;
        const neg = w[0] * (w[5] * w[10] - w[6] * w[9]) - w[4] * (w[1] * w[10] - w[2] * w[9]) + w[8] * (w[1] * w[6] - w[2] * w[5]) < 0;
        const b = _coRun(geo, neg), mat = materialFor(opts, false, 2), em = drawEm(opts);
        if (b.rec >= 0 && b.rec < drawList.n && drawList[b.rec].instanced === b) {
          const r = drawList[b.rec];
          if (r.mat !== mat || r.em !== em || b.visible >= CO_CAP) { _coStat.fall++; return false; }
        } else { b.visible = 0; b.rec = drawList.n; pushRec(null, null, mat, em, 1, 0, null, b); _coStat.recs++; }
        const a = b.ib.array, o = b.visible * CO_STRIDE;
        for (let k = 0; k < 16; k++) a[o + k] = w[k];
        if (neg) { a[o] = -w[0]; a[o + 4] = -w[4]; a[o + 8] = -w[8]; a[o + 12] = -w[12]; }
        b.visible++; _coStat.inst++;
        setRange0(b.ib, b.visible * CO_STRIDE); b.ib.needsUpdate = true;
        return true;
      }
      function _coDrop(geo, later) {
        const pair = _coRuns.get(geo);
        if (!pair) return;
        _coRuns.delete(geo);
        for (const b of pair) {
          if (!b) continue;
          const ix = _instRegistry.indexOf(b.imesh);
          if (ix >= 0) _instRegistry.splice(ix, 1);
          b.imesh._ownGeo = true;
          dropWrapper(b.imesh, null, later);
          b.rec = -1;
        }
      }
      let _coProbe = null;
      async function _coWarm() {
        if (!_coOn || !lit || skipBatches()) return;
        if (!_coProbe) _coProbe = buildGeometry({ pos: [0, 0, 0, 1, 0, 0, 0, 1, 0], nrm: [0, 0, 1, 0, 0, 1, 0, 0, 1], col: [1, 1, 1, 1, 1, 1, 1, 1, 1], idx: [0, 1, 2] });
        const b = _coRun(_coProbe, true), m = b.imesh;
        b.ib.array[0] = b.ib.array[5] = b.ib.array[10] = b.ib.array[15] = 1;
        setRange0(b.ib, CO_STRIDE); b.ib.needsUpdate = true;
        m.count = 1; m.visible = true;
        m.material = materialFor({ doubleSided: true }, false, 2);
        try { await renderer.compileAsync(m, camera, scene); } finally { m.visible = false; }
      }
      function ensureStream(slot, verts) {
        if (slot.geo && slot.cap >= verts) return false;
        const cap = Math.max(slot.cap * 2, verts, slot.min);
        if (slot.geo) disposeGeometry(slot.geo);
        const geo = new THREE.BufferGeometry();
        const ib = new THREE.InterleavedBuffer(new Float32Array(cap * slot.stride), slot.stride);
        ib.setUsage(_instUsage);
        for (const a of slot.attrs) geo.setAttribute(a[0], new THREE.InterleavedBufferAttribute(ib, a[1], a[2]));
        geo.setDrawRange(0, 0);
        geo.__tlxPin = true;
        slot.geo = geo; slot.ib = ib; slot.cap = cap; slot.builds = (slot.builds | 0) + 1;
        return true;
      }
      function ensureGlowStream(instances, slot = glowStream) {
        if (slot.geo && slot.cap >= instances) return false;
        const cap = Math.max(slot.cap * 2, instances, slot.min || 32);
        if (slot.geo) disposeGeometry(slot.geo);
        const geo = new THREE.InstancedBufferGeometry();
        const corners = new Float32Array(18);
        for (let i = 0; i < 6; i++) {
          corners[i * 3] = _glowCorners[i * 2];
          corners[i * 3 + 1] = _glowCorners[i * 2 + 1];
        }
        const quad = new THREE.InterleavedBuffer(corners, 3);
        quad.name = "tlx-glow-quad";
        geo.setAttribute("position", new THREE.InterleavedBufferAttribute(quad, 3, 0));
        geo.setAttribute("fxCorner", new THREE.InterleavedBufferAttribute(quad, 2, 0));
        const ib = new THREE.InstancedInterleavedBuffer(new Float32Array(cap * 7), 7, 1);
        ib.name = "tlx-glow-instances";
        ib.setUsage(_instUsage);
        geo.setAttribute("fxCenter", new THREE.InterleavedBufferAttribute(ib, 3, 0));
        geo.setAttribute("fxColor", new THREE.InterleavedBufferAttribute(ib, 3, 3));
        geo.setAttribute("fxRadius", new THREE.InterleavedBufferAttribute(ib, 1, 6));
        geo.setDrawRange(0, 6);
        geo.instanceCount = 0;
        geo.__tlxPin = true;
        slot.geo = geo; slot.ib = ib; slot.cap = cap; slot.builds = (slot.builds | 0) + 1;
        return true;
      }
      function wrapStream(slot, arr) {
        if (slot.geo && slot.ib.array === arr) return false;
        if (slot.geo) disposeGeometry(slot.geo);
        const geo = new THREE.BufferGeometry();
        const ib = new THREE.InterleavedBuffer(arr, slot.stride);
        ib.setUsage(_instUsage);
        for (const a of slot.attrs) geo.setAttribute(a[0], new THREE.InterleavedBufferAttribute(ib, a[1], a[2]));
        geo.setDrawRange(0, 0);
        geo.__tlxPin = true;
        slot.geo = geo; slot.ib = ib; slot.cap = (arr.length / slot.stride) | 0; slot.builds = (slot.builds | 0) + 1;
        return true;
      }
      function uploadStream(slot, floats) {
        setRange0(slot.ib, floats);
        slot.ib.needsUpdate = true;
      }
      const skidStream = { geo: null, ib: null, cap: 0, min: 120 * 6, stride: 5,
        attrs: [["position", 3, 0], ["uv", 2, 3]] };
      const lineStream = { geo: null, ib: null, cap: 0, min: 2048 * 2, stride: 7,
        attrs: [["position", 3, 0], ["lineAcross", 1, 3], ["lineSpeed", 1, 4], ["lineZone", 1, 5], ["lineAlong", 1, 6]] };
      const glowStream = { geo: null, ib: null, cap: 0 };
      let _wrapPart = true;
      try { _wrapPart = localStorage.getItem("apex26.tlxPartWrap") !== "0"; } catch (_) {  }
      const PART_ATTRS = [["fxCorner", 2, 0], ["position", 3, 2], ["fxColor", 3, 5], ["fxSize", 1, 8], ["fxAlpha", 1, 9]];
      const _partEpochs = new WeakMap(); let _partEpoch = 0;
      const partStreams = [
        { geo: null, ib: null, cap: 0, min: 256 * 6, stride: 10, attrs: PART_ATTRS },
        { geo: null, ib: null, cap: 0, min: 256 * 6, stride: 10, attrs: PART_ATTRS },
      ];
      const _glowCorners = [-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1];
      let frameEye = null;
      const _frameVP = new Float32Array(16);
      let frameCullDist = 0;
      let frameCullFog = null;
      let frameAllLights = null;
      let framePerChunk = 0;
      let _lgKey = null, _lgSrc = null, _lgChunks = null, _lgKP = [NaN, NaN, NaN, NaN, NaN];
      let _lgChs = null, _lgChsFirst = null, _lgChsTotal = -1, _lgChsNrec = -1;
      let frameAllLightsGen = -1, _lgGen = -1;
      let _lampGridState = null;
      const _postF = {
        proj: null, invProj: null, invVP: null, sunVS: null, upVS: null,
        skyHi: null, skyLo: null, viewProj: null, sunDir: null, sunColor: null,
        eye: null, time: 0, cloud: 0, cloudSpeed: 1, lights: null,
      };
      const _chunkFrame = { total: 0, visible: 0 };
      const _chunkLast = { total: 0, visible: 0 };
      const _mirrorRelease = [];
      const _fxFrame = { shadows: 0, marks: 0, skidVerts: 0, glow: 0, particles: 0, decals: 0, lineVerts: 0 };
      function _lineDiag() {
        const out = { meshes: 0, visible: 0, inScene: 0, geo: null };
        try {
          if (!fx || !fx.lineMat) return out;
          for (let i = 0; i < meshPool.length; i++) {
            const pm = meshPool[i];
            if (pm.material !== fx.lineMat) continue;
            out.meshes++; if (pm.visible) out.visible++; if (pm.parent === scene || (pm.parent === poolRoot && poolRoot.children.includes(pm))) out.inScene++;
            const g = pm.geometry;
            out.geo = { index: g.index ? g.index.count : null, indexType: g.index ? g.index.array.constructor.name : null,
              range: g.drawRange.count, pos: g.attributes.position ? g.attributes.position.count : null,
              attrs: Object.keys(g.attributes), renderOrder: pm.renderOrder,
              bs: g.boundingSphere ? [+g.boundingSphere.radius.toFixed(1)] : null };
          }
        } catch (e) { out.err = String(e && e.message || e); }
        return out;
      }
      const _fxLast = { shadows: 0, marks: 0, skidVerts: 0, glow: 0, particles: 0, decals: 0 };
      const _meshMade = { mesh: 0, chunked: 0, tex: 0 };
      const _texPool = [];
      const TEX_POOL_MAX = 4, TEX_POOL_MS = 10000;
      const _texStat = { made: 0, reused: 0, retired: 0, disposed: 0 };
      const _isBitmap = (img) => typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap;
      function takePooledTexture(src) {
        if (!src || !(src.width > 0 && src.height > 0)) return null;
        const bmp = _isBitmap(src);
        for (let i = 0; i < _texPool.length; i++) {
          const e = _texPool[i];
          if (e.w === src.width && e.h === src.height && e.bmp === bmp) { _texPool.splice(i, 1); return e.t; }
        }
        return null;
      }
      function disposePooled(t) {
        _texStat.disposed++;
        if (fx && fx.releaseTexture) { try { fx.releaseTexture(t); } catch (_) {  } }
        try { t.dispose(); } catch (_) {  }
      }
      function retireTexture(t, now) {
        if (!t.__tlxPoolW) { disposePooled(t); return; }
        _texStat.retired++;
        if (t.__tlxRelease) t.__tlxRelease();
        else if (t.image && !_isBitmap(t.image)) { const stand = texStandIn(); if (stand) t.image = stand; }
        t.onUpdate = null;
        _texPool.push({ t, w: t.__tlxPoolW, h: t.__tlxPoolH, bmp: !!t.__tlxPoolBmp, at: now });
        while (_texPool.length > TEX_POOL_MAX) disposePooled(_texPool.shift().t);
      }
      function ageTexPool(now) {
        while (_texPool.length && now - _texPool[0].at > TEX_POOL_MS) disposePooled(_texPool.shift().t);
      }
      function flushTexPool() {
        while (_texPool.length) disposePooled(_texPool.shift().t);
      }
      let envCubeCam = null;
      let envFacesMask = 0, envReady = false, _envActive = false;
      let _envBlank = false;
      let _envFailN = 0, _envFailMsg = "", _envFailStack = "";
      let _envBegins = 0, _envEnds = 0;
      let _envErrBase = -1, _envBadProbes = 0, _envGaveUp = false;
      let _envFaceErr = false;
      let _envMipFn = "?", _envMipRan = 0, _envMipErr = "", _envMipWhere = "?";
      let _envMipsAlloc = false;
      let _envCube = null, _envCubeRead = false;
      let _warmFx = true;
      try { _warmFx = localStorage.getItem("apex26.tlxWarmFx") !== "0"; } catch (_) {  }
      const _warmProbes = new WeakMap();
      async function compileWarmProbe(geo, mat, sx = 1) {
        let mats = _warmProbes.get(geo);
        if (!mats) _warmProbes.set(geo, mats = new Map());
        let p = mats.get(mat);
        if (!p) {
          p = { meshes: new Map(), pending: 0, dead: false };
          p.release = () => {
            if (!p.dead) {
              p.dead = true; mats.delete(mat);
              geo.removeEventListener("dispose", p.release); mat.removeEventListener("dispose", p.release);
            }
            if (p.pending) return;
            for (const m of p.meshes.values()) {
              try { m.dispatchEvent({ type: "dispose" }); } catch (_) {  }
              m.geometry = null; m.material = null;
            }
            p.meshes.clear();
          };
          mats.set(mat, p);
          geo.addEventListener("dispose", p.release); mat.addEventListener("dispose", p.release);
        }
        let m = p.meshes.get(sx);
        if (!m) {
          m = new THREE.Mesh(geo, mat); m.frustumCulled = false;
          m.scale.x = sx; m.updateMatrixWorld(true); p.meshes.set(sx, m);
        }
        p.pending++;
        try { await renderer.compileAsync(m, camera, scene); }
        finally { if (!--p.pending && p.dead) p.release(); }
      }
      function lineIndex(slot) {
        const capTris = Math.max(0, slot.cap - 2);
        if (slot.geo.index && slot.geo.index.count >= capTris * 3) return;
        const idx = new Uint32Array(capTris * 3);
        for (let i = 0; i < capTris; i++) { idx[i * 3] = i; idx[i * 3 + 1] = i + 1; idx[i * 3 + 2] = i + 2; }
        slot.geo.setIndex(new THREE.BufferAttribute(idx, 1));
      }
      async function warmFxPrograms() {
        if (!_warmFx || !fx) return;
        const jobs = [[skidStream, fx.skidMat], [partStreams[0], fx.particleMats && fx.particleMats[0]],
          [partStreams[1], fx.particleMats && fx.particleMats[1]], [glowStream, fx.glowMat], [lineStream, fx.lineMat]];
        for (const [stream, mat] of jobs) {
          if (!mat) continue;
          if (stream === glowStream) {
            let probe = stream.warm;
            if (!probe) {
              probe = stream.warm = { geo: null, ib: null, cap: 0, min: 1 };
              const release = () => {
                mat.removeEventListener("dispose", release);
                disposeGeometry(probe.geo);
                if (stream.warm === probe) stream.warm = null;
              };
              mat.addEventListener("dispose", release);
            }
            ensureGlowStream(1, probe);
            probe.geo.instanceCount = 1;
            await compileWarmProbe(probe.geo, mat);
          } else {
            ensureStream(stream, 1);
            if (stream === lineStream) lineIndex(stream);
            await compileWarmProbe(stream.geo, mat);
          }
        }
        if (fx.shadowMat) for (const sx of [1, -1]) await compileWarmProbe(getFxQuad(), fx.shadowMat, sx);
        for (const run of [_blob, ..._decalRuns.values()]) {
          if (!run || run.imesh.visible) continue;
          const bm = run.imesh, cnt = bm.count;
          if (run === _blob) bm.material = fx.shadowMat;
          bm.count = Math.max(1, cnt); bm.visible = true;
          let p;
          try { p = renderer.compileAsync(bm, camera, scene); } finally { bm.visible = false; bm.count = cnt; }
          await p;
        }
        await _coWarm();
      }
      const _LATE_LIT = [{ roughness: 0.9, specular: 0, noAlphaWrite: true, alpha: 0.5 },
        { doubleSided: true, roughness: 0.9, specular: 0, noAlphaWrite: true, alpha: 0.5 }];
      const _LATE_FX = [{ roughness: 1, specular: 0, noAlphaWrite: true, alpha: 0.5 },
        { roughness: 1, specular: 0, noAlphaWrite: true, alpha: 1 }];
      let _lateFxGeo = null;
      const _lateFxOn = () => typeof FieldLod === "undefined" || FieldLod.on;
      function _layoutKey(g) {
        let k = g.index ? g.index.array.constructor.name : "-";
        for (const n of Object.keys(g.attributes).sort()) {
          const a = g.attributes[n];
          k += "|" + n + ":" + (a.array ? a.array.constructor.name : "?") + a.itemSize + (a.normalized ? "n" : "");
        }
        return k;
      }
      function mintLateLit() {
        if (!_warmFx || !lit || _drawMatMode || vizMat) return;
        for (const o of _LATE_LIT) materialFor(o, false, false);
        if (_lateFxOn()) for (const o of _LATE_FX) materialFor(o, false, false);
      }
      async function warmLateLit() {
        if (!_warmFx || !lit || _drawMatMode || vizMat) return;
        const geos = new Map();
        for (let i = 0; i < _geoReg.length; i++) {
          const g = _geoReg[i] && _geoReg[i].deref();
          if (!g || g.__tlxKind !== "mesh" || !g.attributes || !g.attributes.position || g.attributes.instanceTint) continue;
          const k = _layoutKey(g);
          if (!geos.has(k)) geos.set(k, g);
        }
        _warmStages.lateLayouts = geos.size;
        for (const o of _LATE_LIT) {
          const mat = materialFor(o, false, false);
          for (const g of geos.values()) for (const sx of [1, -1]) {
            await compileWarmProbe(g, mat, sx);
          }
        }
        if (!_lateFxOn()) return;
        const quad = _lateFxGeo || (_lateFxGeo = buildGeometry({ pos: [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], nrm: [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1],
          col: [2.6, 1.05, 0.25, 2.6, 1.05, 0.25, 2.6, 1.05, 0.25, 2.6, 1.05, 0.25], idx: [0, 2, 1, 0, 3, 2, 0, 1, 2, 0, 2, 3] }));
        for (const o of _LATE_FX) {
          const mat = materialFor(o, false, false);
          for (const sx of [1, -1]) {
            await compileWarmProbe(quad, mat, sx);
          }
        }
        _warmStages.lateFx = _LATE_FX.length;
      }
      let _warmPlus = null;
      let _warmWhere = "menu";
      try { const v = localStorage.getItem("apex26.tlxWarmPlus"); _warmPlus = v === "1" ? true : v === "0" ? false : null; } catch (_) {  }
      function _resolveWarmWhere(opts) {
        if (opts && typeof opts.where === "string" && (opts.where === "menu" || opts.where === "loading" || opts.where === "race")) return opts.where;
        try {
          if (typeof RaceEntryProfile !== "undefined" && RaceEntryProfile.armed && RaceEntryProfile.armed()) {
            if (RaceEntryProfile.menuEntrySession && RaceEntryProfile.menuEntrySession()) return "loading";
            return "race";
          }
        } catch (_) {  }
        return "menu";
      }
      const warmPlusOn = () => {
        if (_warmPlus !== null) return _warmPlus;
        if (renderer && renderer.backend && renderer.backend.isWebGLBackend) return true;
        return _warmWhere === "menu";
      };
      const warmIdleChunks = () => _warmWhere === "menu";
      const _idleYield = (ms) => (typeof TLXShaders !== "undefined" && TLXShaders.idleYield)
        ? TLXShaders.idleYield(ms)
        : new Promise((r) => { if (typeof requestIdleCallback === "function") requestIdleCallback(r, { timeout: ms || 48 }); else setTimeout(r, 0); });
      const casterWarmOn = () => _warmPlus !== null ? _warmPlus : true;
      let _drawWarmKnob = null;
      try { const v = localStorage.getItem("apex26.tlxDrawWarm"); _drawWarmKnob = v === "1" ? true : v === "0" ? false : null; } catch (_) {  }
      const drawWarmOn = () => (_drawWarmKnob !== null ? _drawWarmKnob : !(softGpu() || softwareGL));
      function casterSources() {
        const seen = new Set(), out = [];
        const visit = (o) => {
          const g = o.isMesh && o.geometry, m = o.material;
          if (!g || !g.attributes || !g.attributes.position || !m || typeof m.customProgramCacheKey !== "function") return;
          if (String(m.customProgramCacheKey()).indexOf("tlx-lit") !== 0) return;
          const sig = Object.keys(g.attributes).sort().join(",") + (g.index ? "|i" : "");
          if (seen.has(sig) || out.length >= 8) return;
          seen.add(sig); out.push(g);
        };
        scene.traverse(visit);
        if (_instRootOn) for (let i = 0; i < _instRegistry.length; i++) if (!_instRegistry[i].visible) visit(_instRegistry[i]);
        return out;
      }
      function drawWarmStage(usePost, useTag, opts, mirrorWarmed, mirrorOnly) {
        const drawn = { mirror: 0, scene: 0, post: 0, casts: 0, sky: 0 };
        if (!usePost || !post || !post.sceneTarget) { _mirWarmUnswap(); return drawn; }
        const autoClear0 = renderer.autoClear;
        const sRT = post.sceneTarget(), sSc = sRT.scissor.clone(), sST = sRT.scissorTest;
        let tmp = null;
        try {
          renderer.autoClear = false;
          if (mirrorWarmed && mirRT) {
            const mrt = _mirMrt();
            tmp = _mirTarget(mirRT.texture.type, 4, 4, mrt);
            _mirMrtArm(mrt);
            renderer.setRenderTarget(tmp);
            try { renderer.render(scene, camera); drawn.mirror++; } finally { _mirMrtArm(false); }
          }
          _mirWarmUnswap();
          if (mirrorOnly) return drawn;
          if (lit && lit.setSsrMrt) lit.setSsrMrt(useTag);
          if (fx && fx.setSsrMrt) fx.setSsrMrt(useTag);
          renderer.setMRT(useTag ? _ssrMrtNode() : null);
          sRT.scissor.set(0, 0, 1, 1); sRT.scissorTest = true;
          renderer.setRenderTarget(sRT);
          renderer.render(scene, camera); drawn.scene++;
          sRT.scissor.copy(sSc); sRT.scissorTest = sST;
          if (post.drawWarm) drawn.post = post.drawWarm(opts, _postF);
          renderer.setMRT(null);
          if (lit && lit.setSsrMrt) lit.setSsrMrt(false);
          if (fx && fx.setSsrMrt) fx.setSsrMrt(false);
          if (shadowSys && shadowSys.drawWarm) drawn.casts = shadowSys.drawWarm();
          if (typeof sky !== "undefined" && sky && sky.cacheDrawWarm) drawn.sky = sky.cacheDrawWarm(renderer);
        } finally {
          _mirWarmUnswap();
          sRT.scissor.copy(sSc); sRT.scissorTest = sST;
          renderer.autoClear = autoClear0;
          if (tmp) try { tmp.dispose(); } catch (_) {  }
        }
        return drawn;
      }
      function _gpuSettled(capMs) {
        const be = renderer.backend, t0 = performance.now();
        try {
          const q = be && be.device && be.device.queue;
          if (q && typeof q.onSubmittedWorkDone === "function") {
            let timer = 0;
            const cap = new Promise((res) => { timer = setTimeout(res, capMs); });
            return Promise.race([q.onSubmittedWorkDone(), cap]).finally(() => clearTimeout(timer));
          }
          const gl = be && be.gl;
          if (gl && typeof gl.fenceSync === "function") {
            const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
            gl.flush();
            return new Promise((res) => {
              (function poll() {
                let st = gl.WAIT_FAILED;
                try { st = gl.clientWaitSync(sync, 0, 0); } catch (_) {  }
                if (st === gl.TIMEOUT_EXPIRED && performance.now() - t0 < capMs) { setTimeout(poll, 4); return; }
                try { gl.deleteSync(sync); } catch (_) {  }
                res();
              })();
            });
          }
        } catch (_) {  }
        return Promise.resolve();
      }
      function warmShowSky() {
        if (typeof skyMesh !== "undefined" && skyMesh) {
          skyMesh.material = (softContent("sky") && skyMatFallback) ? skyMatFallback : skyMatFull;
          skyMesh.visible = true;
        }
      }
      async function warmMirrorStage(usePost, useTag) {
        prepareMirrorTarget(16, 8, true);
        _mirUsed = true;
        _mirMrtArm(_mirMrt());
        renderer.setRenderTarget(mirRT);
        _gpuLastOperation = "compile-mirror";
        await renderer.compileAsync(scene, camera);
        _mirMrtArm(false);
        renderer.setMRT(useTag ? _ssrMrtNode() : null);
        if (fx && fx.mirrorGlassMaterial) {
          renderer.setRenderTarget(usePost ? post.sceneTarget() : softOutRT());
          if (!_glassProbeGeo) {
            _glassProbeGeo = new THREE.BufferGeometry();
            _glassProbeGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
            _glassProbeGeo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array([0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1]), 3));
            _glassProbeGeo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
            _glassProbeGeo.setIndex(new THREE.BufferAttribute(new Uint32Array([0, 1, 2, 0, 2, 3]), 1));
          }
          const gm = fx.mirrorGlassMaterial(mirRT.texture);
          for (const sx of [1, -1]) {
            await compileWarmProbe(_glassProbeGeo, gm, sx);
          }
        }
        if (post.warmMirror) await post.warmMirror(mirRT.texture);
      }
      async function runProgramWarmStages(usePost, useTag, opts, garageSceneOnly) {
        if (garageSceneOnly) {
          if (lit && lit.setSsrMrt) lit.setSsrMrt(false);
          if (fx && fx.setSsrMrt) fx.setSsrMrt(false);
          renderer.setMRT(null);
          renderer.setRenderTarget(softOutRT());
          _gpuLastOperation = "compile-garage-scene";
          warmShowSky();
          await renderer.compileAsync(scene, camera);
          return;
        }
        pinSkyMaterial();
        mintLateLit();
        if (lit && lit.setSsrMrt) lit.setSsrMrt(useTag);
        if (fx && fx.setSsrMrt) fx.setSsrMrt(useTag);
        renderer.setMRT(useTag ? _ssrMrtNode() : null);
        renderer.setRenderTarget(usePost ? post.sceneTarget() : softOutRT());
        let _tStage = performance.now();
        _gpuLastOperation = "compile-scene";
        warmShowSky();
        await renderer.compileAsync(scene, camera);
        _warmStages.scene = Math.round(performance.now() - _tStage); _tStage = performance.now();
        _gpuLastOperation = "compile-fx";
        await warmFxPrograms();
        await warmLateLit();
        _warmStages.fx = Math.round(performance.now() - _tStage); _tStage = performance.now();
        if (typeof warmIdleChunks === "function" && warmIdleChunks()) await _idleYield(48);
        if (usePost && post.warm && (warmPlusOn() || performance.now() - _warmAt < 3000)) {
          _gpuLastOperation = "compile-post"; await post.warm(opts, _postF);
        }
        _warmStages.post = Math.round(performance.now() - _tStage); _tStage = performance.now();
        renderer.setMRT(null);
        if (typeof warmIdleChunks === "function" && warmIdleChunks()) await _idleYield(48);
        if (casterWarmOn() && shadowSys && shadowSys.warm) { _gpuLastOperation = "compile-shadow"; await shadowSys.warm(casterSources()); }
        _warmStages.shadow = Math.round(performance.now() - _tStage); _tStage = performance.now();
        if (typeof sky !== "undefined" && sky && sky.cacheWarm) { _gpuLastOperation = "compile-sky-cache"; await sky.cacheWarm(renderer); }
        _warmStages.mirror = null;
        if (wantMirrorWarm()) {
          await warmMirrorStage(usePost, useTag);
          _warmStages.mirror = Math.round(performance.now() - _tStage);
        }
        _tStage = performance.now();
        _warmStages.draw = null; _warmStages.drawn = null;
        if (drawWarmOn()) {
          try {
            _gpuLastOperation = "warm-draw";
            _warmStages.drawn = drawWarmStage(usePost, useTag, opts, _warmStages.mirror !== null);
            if (post && post.warmSettled) await post.warmSettled();
            await _gpuSettled(5000);
          } catch (e) {
            _warmStages.drawn = { error: String((e && e.message) || e) };
            try { Log.warn("gfx", "TLX draw warm failed", String(e)); } catch (_) {  }
          }
          _warmStages.draw = Math.round(performance.now() - _tStage);
        }
      }
      function pinSoftwareRaceShed(opts) {
        if (!_swRaceShed) return;
        if (!_swRaceShedPinned) {
          _swRaceShedPinned = true;
          try {
            if (typeof PerfGov !== "undefined") {
              if (PerfGov.setAutoRes) PerfGov.setAutoRes(false);
              if (PerfGov.setUserTier) PerfGov.setUserTier(4);
            }
          } catch (_) {  }
        }
        if (renderScale > 0.52) { renderScale = 0.5; resizeNow(); }
        if (opts) {
          opts.bloom = 0; opts.ssao = 0; opts.godray = 0; opts.contact = 0; opts.lampVol = 0; opts.flareMul = 0;
          opts.reflect = 0; opts.carReflect = 0;
        }
      }
      function startProgramWarm(opts) {
        _warmRequested = false;
        if (typeof renderer.compileAsync !== "function") return;
        if (typeof _swRaceShed !== "undefined" && _swRaceShed && typeof _warmWhere !== "undefined" && _warmWhere !== "menu") pinSoftwareRaceShed(opts);
        _warmAt = performance.now(); _warmAttempts++;
        _warmStages.at = Math.round(_warmAt); _warmStages.attempts = _warmAttempts;
        _warmStages.garageScene = null;
        const target = renderer.getRenderTarget(), mrt = renderer.getMRT();
        const postCapable = !!(post && post.enabled() && _postF.proj && !vizMat);
        const noEnvGarage = postCapable && !!_postF.noEnv;
        const usePost = postCapable && !noEnvGarage;
        const useTag = usePost && (!post.tagOn || post.tagOn());
        _warmPending = (async () => {
          try {
            if (noEnvGarage) {
              const useTagPost = postCapable && (!post.tagOn || post.tagOn());
              await runProgramWarmStages(true, useTagPost, opts, false);
              const tGarage = performance.now();
              await runProgramWarmStages(false, false, opts, true);
              _warmStages.garageScene = Math.round(performance.now() - tGarage);
            } else {
              await runProgramWarmStages(usePost, useTag, opts, false);
            }
          } catch (e) {
            _warmStages.failed++;
            _warmRequested = _warmAttempts < 2;
            try { Log.warn("gfx", "TLX program warm failed", String(e), (e && e.stack) || ""); } catch (_) {  }
          } finally {
            _warmStages.total = Math.round(performance.now() - _warmAt);
            const _warmRec = { where: (typeof _warmWhere !== "undefined" ? _warmWhere : "menu"), at: _warmStages.at, scene: _warmStages.scene, fx: _warmStages.fx, post: _warmStages.post, shadow: _warmStages.shadow,
              mirror: _warmStages.mirror, draw: _warmStages.draw, garageScene: _warmStages.garageScene, total: _warmStages.total, failed: _warmStages.failed };
            _warmHistory.push(_warmRec);
            if (_warmHistory.length > 6) _warmHistory.shift();
            try { if (typeof RaceEntryProfile !== "undefined" && RaceEntryProfile.noteWarm) RaceEntryProfile.noteWarm(_warmRec); } catch (_) {  }
            if (lit && lit.setSsrMrt) lit.setSsrMrt(false);
            if (fx && fx.setSsrMrt) fx.setSsrMrt(false);
            renderer.setMRT(mrt); renderer.setRenderTarget(target);
          }
        })().finally(() => { _warmPending = null; _warmDone = true; if (typeof pinPipelines === "function") pinPipelines(); });
      }
      function startMirrorWarm(opts) {
        _mirWarmReq = false;
        if (!_mirWarmOwed || typeof renderer.compileAsync !== "function") { _mirWarmOwed = false; return; }
        _mirWarmOwed = false;
        const t0 = performance.now(), target = renderer.getRenderTarget(), mrt = renderer.getMRT();
        const usePost = !!(post && post.enabled() && _postF.proj && !vizMat);
        const useTag = usePost && (!post.tagOn || post.tagOn());
        _warmStages.mirrorLazy = null;
        _warmPending = (async () => {
          let drawn = 0, ok = false;
          try {
            pinSkyMaterial();
            warmShowSky();
            await warmMirrorStage(usePost, useTag);
            if (drawWarmOn()) {
              _gpuLastOperation = "warm-draw";
              drawn = drawWarmStage(usePost, useTag, opts, true, true).mirror;
              await _gpuSettled(5000);
            }
            ok = true;
          } catch (e) {
            try { Log.warn("gfx", "TLX deferred mirror warm failed", String(e)); } catch (_) {  }
          } finally {
            _mirWarmUnswap();
            _warmStages.mirrorLazy = { ms: Math.round(performance.now() - t0), drawn, ok };
            if (lit && lit.setSsrMrt) lit.setSsrMrt(false);
            if (fx && fx.setSsrMrt) fx.setSsrMrt(false);
            renderer.setMRT(mrt); renderer.setRenderTarget(target);
          }
        })().finally(() => { _warmPending = null; if (typeof pinPipelines === "function") pinPipelines(); });
      }
      let _capture = null, _rigWarm = null;
      const _rigDone = new WeakMap();
      const _rigKey = (r) => r.mat.id + (r.sx < 0 ? 0.5 : 0);
      let _rigMirrorKey = null;
      const _rigMirrorOn = () => !!(_warmFx && post && post.enabled() && !_mirDead && !vizMat && !softGpu() && !softwareGL);
      function warmDraws(fn, opts) {
        if (_deviceLost || !lit || _drawMatMode || vizMat || typeof renderer.compileAsync !== "function") return Promise.resolve(false);
        const recs = [];
        const co = _coOn;
        _capture = recs; _coOn = false;
        try { fn(); } catch (e) { try { Log.warn("gfx", "TLX warmDraws capture failed", String(e)); } catch (_) {  } }
        finally { _capture = null; _coOn = co; }
        const todo = recs.filter((r) => { const s = _rigDone.get(r.geo); return !(s && s.has(_rigKey(r))); });
        const mirror = !!(opts && opts.mirror) && opts.mirror !== _rigMirrorKey && _rigMirrorOn() ? opts.mirror : null;
        if (!todo.length && !mirror) return Promise.resolve(recs.length > 0);
        if (_rigWarm && !_rigWarm.started) {
          const job = _rigWarm;
          for (const r of todo) job.recs.push(r);
          if (mirror && !job.mirror) job.mirror = mirror;
          return _warmRequested || _warmPending ? Promise.resolve(true) : job.finished.then(() => true);
        }
        if (_rigWarm) return _rigWarm.finished.then(() => warmDraws(() => { for (const r of todo) _capture.push(r); }, mirror ? { mirror } : null));
        if (_warmRequested || _warmPending) {
          let fin;
          const job = _rigWarm = { recs: todo, mirror, seen: 0, finished: new Promise((r) => { fin = r; }),
            done: () => { clearTimeout(job.timer); if (_rigWarm === job) _rigWarm = null; fin(); } };
          const arm = () => { job.timer = setTimeout(() => { if (job.started) return; if (job.seen) { job.seen = 0; arm(); } else job.done(); }, 20000); };
          arm();
          return Promise.resolve(true);
        }
        return new Promise((resolve) => {
          let fin;
          const job = _rigWarm = { recs: todo, mirror, finished: new Promise((r) => { fin = r; }),
            done: (ok) => { clearTimeout(job.timer); if (_rigWarm === job) _rigWarm = null; fin(); resolve(ok); } };
          job.timer = setTimeout(() => job.done(false), 20000);
        });
      }
      function _captureRec(mesh, model, opts) {
        if (!mesh || !mesh.geo || (opts && opts.coalesce)) return;
        const w = model;
        const neg = !!w && w[0] * (w[5] * w[10] - w[6] * w[9]) - w[4] * (w[1] * w[10] - w[2] * w[9]) + w[8] * (w[1] * w[6] - w[2] * w[5]) < 0;
        _capture.push({ geo: mesh.geo, mat: materialFor(opts, false, false, fxFor(mesh.geo, opts)), sx: neg ? -1 : 1,
          key: opts && typeof matKeyFor === "function" ? matKeyFor(opts, false, false) : "" });
      }
      function startRigWarm() {
        const job = _rigWarm;
        if (!job || job.started) return;
        job.started = true;
        const target = renderer.getRenderTarget(), mrt = renderer.getMRT();
        const usePost = !!(post && post.enabled() && _postF.proj && !vizMat);
        const useTag = usePost && (!post.tagOn || post.tagOn());
        let ok = false;
        const t0 = performance.now();
        const sp = { pairs: 0, mirror: 0, settle: 0, probes: 0, worst: [] };
        _warmPending = (async () => {
          try {
            if (lit.setSsrMrt) lit.setSsrMrt(useTag);
            if (fx && fx.setSsrMrt) fx.setSsrMrt(useTag);
            renderer.setMRT(useTag ? _ssrMrtNode() : null);
            renderer.setRenderTarget(usePost ? post.sceneTarget() : softOutRT());
            _gpuLastOperation = "compile-rig";
            for (let i = 0; i < job.recs.length; i++) {
              if (i && typeof warmIdleChunks === "function" && warmIdleChunks() && (i & 1) === 0) await _idleYield(32);
              const r = job.recs[i], tp = performance.now();
              await compileWarmProbe(r.geo, r.mat, r.sx); sp.probes++;
              if (r.mat.side === THREE.DoubleSide) { await compileWarmProbe(r.geo, r.mat, -r.sx); sp.probes++; }
              sp.worst.push([Math.round(performance.now() - tp), r.mat.id, r.key, r.geo.attributes.position ? r.geo.attributes.position.count : 0, r.sx]);
              let s = _rigDone.get(r.geo);
              if (!s) _rigDone.set(r.geo, s = new Set());
              s.add(_rigKey(r));
            }
            sp.pairs = performance.now() - t0;
            if (job.mirror) {
              if (typeof warmIdleChunks === "function" && warmIdleChunks()) await _idleYield(48);
              _gpuLastOperation = "compile-rig-mirror"; await warmMirrorStage(usePost, useTag); _rigMirrorKey = job.mirror;
            }
            sp.mirror = performance.now() - t0 - sp.pairs;
            await _gpuSettled(3000);
            sp.settle = performance.now() - t0 - sp.pairs - sp.mirror;
            ok = true;
          } catch (e) {
            try { Log.warn("gfx", "TLX rig warm failed", String(e)); } catch (_) {  }
          } finally {
            _warmStages.rig = { ms: Math.round(performance.now() - t0), pairs: job.recs.length, mirror: !!job.mirror, ok,
              probes: sp.probes, pairsMs: Math.round(sp.pairs), mirrorMs: Math.round(sp.mirror), settleMs: Math.round(sp.settle),
              worst: sp.worst.sort((a, b) => b[0] - a[0]).slice(0, 4) };
            if (job.mirror) _mirWarmUnswap();
            if (lit.setSsrMrt) lit.setSsrMrt(false);
            if (fx && fx.setSsrMrt) fx.setSsrMrt(false);
            renderer.setMRT(mrt); renderer.setRenderTarget(target);
          }
        })().finally(() => { _warmPending = null; if (typeof pinPipelines === "function") pinPipelines(); job.done(ok); });
      }
      const ENV_PROBE_TRIES = 3;
      const ENV_FAIL_CAP = 24;
      let _envFrame = null, _envSvVP = null, _envSvEye = null, _envSvCull = 0;
      const _envInvArr = new Float32Array(16);
      const _envVPArr = new Float32Array(16);
      const _envVP = new THREE.Matrix4(), _envInvVP = new THREE.Matrix4();
      function _restoreEnvFrame() {
        if (!_envFrame) return;
        _envFrame.viewProj = _envSvVP;
        _envFrame.eye = _envSvEye;
        _envFrame.cullDist = _envSvCull;
        _envFrame = null;
      }
      function ensureEnvCam() {
        if (envCubeCam || !envRT) return;
        envCubeCam = new THREE.CubeCamera(0.4, 900, envRT);
        try {
          envCubeCam.coordinateSystem = renderer.coordinateSystem;
          envCubeCam.updateCoordinateSystem();
        } catch (e) {
          try { Log.warn("gfx", "TLX: env cube-cam orient failed, probe off —", e); } catch (_) {}
          envCubeCam = null;
        }
      }

      function pinSkyMaterial() {
        if (!scene.backgroundNode) return;
        try {
          const store = renderer._background;
          if (!store) return;
          const data = (typeof store.get === "function") ? store.get(scene) : store;
          const mesh = data && (data.backgroundMesh || data.mesh || data.box);
          const m = mesh && mesh.material;
          if (m && !m.userData.tlxSkyPin) {
            m.lights = false;
            m.customProgramCacheKey = () => "tlx-sky";
            m.userData.tlxSkyPin = 1;
          }
        } catch (_) {  }
      }

      const PIPE_PIN_CAP = 512;
      const _pinnedPipes = new Set();
      let _pinArmed = null;
      function pinPipe(p) {
        if (!p || _pinnedPipes.size >= PIPE_PIN_CAP || _pinnedPipes.has(p) || !p.vertexProgram || !p.fragmentProgram) return;
        p.usedTimes++; p.vertexProgram.usedTimes++; p.fragmentProgram.usedTimes++;
        _pinnedPipes.add(p);
      }
      function pinPipelines() {
        const P = renderer && renderer._pipelines, caches = P && P.caches;
        if (!caches || typeof caches.values !== "function") return _pinnedPipes.size;
        if (_pinArmed !== P && typeof P._getRenderPipeline === "function") {
          const get = P._getRenderPipeline;
          P._getRenderPipeline = function () { const p = get.apply(this, arguments); pinPipe(p); return p; };
          _pinArmed = P;
        }
        for (const p of caches.values()) pinPipe(p);
        return _pinnedPipes.size;
      }
      const PRUNE_EVERY_MS = 5000, PRUNE_IDLE_MS = 600000;
      function prunePool(now) {
        const pin = typeof pinPipelines === "function" ? pinPipelines : null;
        if (pin && !_pinArmed) pin();
        if (now - _pruneLast < PRUNE_EVERY_MS) return;
        _pruneLast = now;
        if (pin) pin();
        let w = 0;
        for (let i = 0; i < meshPool.length; i++) {
          const m = meshPool[i];
          if (now - (m.__tlxSeen || 0) < PRUNE_IDLE_MS || (m.geometry && m.geometry.__tlxPin)) { meshPool[w++] = m; continue; }
          const byMat = meshByGeo.get(m.geometry);
          if (byMat) {
            const list = byMat.get(m.material);
            if (list) {
              const at = list.indexOf(m);
              if (at >= 0) list.splice(at, 1);
              if (!list.length) byMat.delete(m.material);
            }
            if (!byMat.size) meshByGeo.delete(m.geometry);
          }
          dropWrapper(m); prunePool.n = (prunePool.n | 0) + 1;
        }
        meshPool.length = w;
      }

      const _dropQueue = [];
      let _ownershipFreeDepth = 0;
      let _ownershipFreeBatch = null;
      const _dropLater = [];
      const DROP_LATER_MAX = 64;
      const _dropStat = { held: 0, overflow: 0 };
      function flushDropLater(all) {
        let w = 0;
        for (let i = 0; i < _dropLater.length; i++) {
          const e = _dropLater[i];
          if (all || _sceneRenders > e.at) dropWrapper(e.mesh);
          else _dropLater[w++] = e;
        }
        _dropLater.length = w;
      }
      function dropWrapper(m, ownedGeometry, afterRender) {
        try { if (m.parent === instRoot) _instRemove(m); else if (m.parent) m.parent.remove(m); } catch (_) {  }
        m.visible = false;
        if (_warmPending && !_ownershipFreeDepth) {
          if (!_dropQueue.some((entry) => entry.mesh === m)) {
            _dropQueue.push({ mesh: m, ownedGeometry, freedGeo: ownedGeometry || m.geometry });
          }
          return;
        }
        if (m.__tlxDropped) return;
        if (afterRender && !ownedGeometry && !_ownershipFreeDepth) {
          if (_dropLater.length < DROP_LATER_MAX) { _dropLater.push({ mesh: m, at: _sceneRenders, freedGeo: m.geometry }); _dropStat.held++; return; }
          _dropStat.overflow++;
          flushDropLater(true);
        }
        m.__tlxDropped = true;
        try { m.dispatchEvent({ type: "dispose" }); } catch (_) {  }
        if (m._ownGeo && m.geometry) m.geometry.dispose();
        m.geometry = null; m.material = null;
        if (ownedGeometry) try { ownedGeometry.dispose(); } catch (_) {  }
      }
      function flushDropped(force) {
        if ((!force && _warmPending) || !_dropQueue.length) return;
        for (const entry of _dropQueue) dropWrapper(entry.mesh, entry.ownedGeometry);
        _dropQueue.length = 0;
      }
      function ownershipDropQueued(m, owned, freedGeo) {
        try { if (m.parent) m.parent.remove(m); } catch (_) {  }
        const live = freedGeo && m.geometry && m.geometry !== freedGeo;
        if (live) {
          try { m.dispatchEvent({ type: "dispose" }); } catch (_) {  }
          return;
        }
        m.visible = false;
        if (m.__tlxDropped) return;
        m.__tlxDropped = true;
        try { m.dispatchEvent({ type: "dispose" }); } catch (_) {  }
        if (m._ownGeo && m.geometry) m.geometry.dispose();
        m.geometry = null; m.material = null;
        if (owned) try { owned.dispose(); } catch (_) {  }
      }
      function purgeOwnershipRenderObjects(freedGeos) {
        const ros = renderer._objects && renderer._objects._renderObjects;
        if (!ros || !freedGeos || !freedGeos.size) return;
        const list = typeof ros.values === "function" ? Array.from(ros.values()) : Array.from(ros);
        for (let i = 0; i < list.length; i++) {
          const ro = list[i];
          const g = ro && ro.geometry;
          if (!g || !freedGeos.has(g)) continue;
          const o = ro.object;
          if (o && typeof o.dispatchEvent === "function") {
            try { if (o.parent) o.parent.remove(o); } catch (_) {  }
            o.visible = false;
            if (!o.__tlxDropped) ownershipDropQueued(o, o._ownGeo ? o.geometry : null, g);
            else try { o.dispatchEvent({ type: "dispose" }); } catch (_) {  }
          }
          if (typeof g.dispatchEvent === "function") {
            try { g.dispatchEvent({ type: "dispose" }); } catch (_) {  }
          }
          if (typeof ros.delete === "function") ros.delete(ro);
        }
      }
      function flushOwnershipRelease(freedGeos) {
        if (!freedGeos || !freedGeos.size) return;
        for (let i = 0; i < meshPool.length; i++) {
          const m = meshPool[i];
          const g = m.geometry;
          if (g && freedGeos.has(g)) ownershipDropQueued(m, m._ownGeo ? m.geometry : null, g);
        }
        flushDropped(true);
        for (let i = _dropQueue.length - 1; i >= 0; i--) {
          const e = _dropQueue[i];
          const fg = e.freedGeo || (e.mesh && e.mesh.geometry);
          if (!fg || !freedGeos.has(fg)) continue;
          _dropQueue.splice(i, 1);
          ownershipDropQueued(e.mesh, e.ownedGeometry, fg);
        }
        let w = 0;
        for (let i = 0; i < _dropLater.length; i++) {
          const e = _dropLater[i];
          const fg = e.freedGeo || (e.mesh && e.mesh.geometry);
          if (!fg || !freedGeos.has(fg)) { _dropLater[w++] = e; continue; }
          ownershipDropQueued(e.mesh, null, fg);
        }
        _dropLater.length = w;
        if (shadowSys && shadowSys.flushOwnershipDropped) shadowSys.flushOwnershipDropped(freedGeos);
        if (shadowSys && shadowSys.purgeCastersForGeos) shadowSys.purgeCastersForGeos(freedGeos);
        purgeOwnershipRenderObjects(freedGeos);
      }

      function releaseGeometry(geo) {
        if (!geo) return;
        let w = 0;
        for (let i = 0; i < meshPool.length; i++) {
          const m = meshPool[i];
          if (m.geometry !== geo) { meshPool[w++] = m; continue; }
          dropWrapper(m, null, true);
        }
        meshPool.length = w;
        meshByGeo.delete(geo);
        if (shadowSys && shadowSys.releaseGeometry) shadowSys.releaseGeometry(geo);
        _coDrop(geo, !_ownershipFreeDepth);
        _decalDrop(geo);
      }

      function releaseAttribute(attr) {
        try { if (renderer._attributes) renderer._attributes.delete(attr); } catch (_) {  }
      }

      function disposeGeometry(geo) {
        if (!geo) return;
        if (geo.__tlxSplit) { for (const g of geo.__tlxSplit.slots) { releaseGeometry(g); g.dispose(); } geo.__tlxSplit = null; }
        releaseGeometry(geo);
        geo.dispose();
      }

      function acquireMesh(geo, matrixArr, material, rec) {
        const mat = material || fallbackMat();
        let byMat = meshByGeo.get(geo);
        if (!byMat) { byMat = new Map(); meshByGeo.set(geo, byMat); }
        let list = byMat.get(mat);
        if (!list) { list = []; list.batch = -1; list.n = 0; byMat.set(mat, list); }
        if (list.batch !== _poolBatch) { list.batch = _poolBatch; list.n = 0; }
        const k = list.n++;
        let m = list[k];
        if (!m) {
          m = new THREE.Mesh(geo, mat);
          m.matrixAutoUpdate = false;
          m.matrixWorldAutoUpdate = false;
          m.frustumCulled = false;
          list[k] = m;
          meshPool.push(m); acquireMesh.n = (acquireMesh.n | 0) + 1;
        }
        m.geometry = geo;
        m.material = mat;
        const ud = m.userData;
        ud.tlxEmissive = rec && rec.em !== undefined ? rec.em : undefined;
        ud.tlxAlpha = rec && rec.al !== undefined ? rec.al : undefined;
        ud.tlxLgRoad = rec && rec.lg ? 1 : 0;
        geo.__tlxDrawnBatch = _poolBatch;
        m.__tlxBatch = _poolBatch;
        m.__tlxSeen = _poolNow;
        if (!matrixArr) {
          if (!m.__tlxIdent) {
            m.matrix.identity();
            m.matrixWorld.identity();
            m.__tlxIdent = true;
          }
        } else {
          const prev = m.__tlxMat;
          let same = !m.__tlxIdent && !!prev;
          if (same) {
            for (let i = 0; i < 16; i++) if (prev[i] !== matrixArr[i]) { same = false; break; }
          }
          if (!same) {
            if (!prev) m.__tlxMat = new Float32Array(16);
            m.__tlxMat.set(matrixArr);
            m.matrix.fromArray(matrixArr);
            m.matrixWorld.copy(m.matrix);
            m.__tlxIdent = false;
          }
        }
        m.matrixWorldNeedsUpdate = false;
        m.visible = true;
        if (_r6) {
          if (m.parent !== poolRoot) { if (m.parent) m.parent.remove(m); m.parent = poolRoot; }
          if (_kidBatch === _poolBatch) _kids[_kidN++] = m;
        } else if (!m.parent) scene.add(m);
        return m;
      }

      const _geoReg = [];
      const _geoSeen = (typeof WeakSet !== "undefined") ? new WeakSet() : null;
      let _geoPruneAt = -Infinity;
      function pruneGeoRegistry(now) {
        if (now - _geoPruneAt < 2000) return;
        _geoPruneAt = now;
        let w = 0;
        for (let i = 0; i < _geoReg.length; i++) {
          const ref = _geoReg[i];
          if (ref && ref.deref()) _geoReg[w++] = ref;
        }
        _geoReg.length = w;
      }
      function releaseGeoMirrors(g) {
        if (!g || g.__tlxFreed) return 0;
        if (renderer && renderer.backend && renderer.backend.isWebGPUBackend) { g.__tlxFreed = true; g.__tlxKept = true; return 0; }
        try {
          if (!g.boundingSphere) g.computeBoundingSphere();
          if (!g.boundingBox) g.computeBoundingBox();
        } catch (_) { return 0; }
        const _bs = g.boundingSphere;
        if (!_bs || !(_bs.radius >= 0) || !_bs.center
            || !(Math.abs(_bs.center.x) >= 0) || !(Math.abs(_bs.center.y) >= 0)
            || !(Math.abs(_bs.center.z) >= 0)) return 0;
        let freed = 0, kept = 0;
        const _be = renderer && renderer.backend;
        const uploaded = (a) => {
          try {
            const d = _be && _be.get(a);
            return !!d && (d.buffer !== undefined || d.bufferGPU !== undefined);
          } catch (_) { return false; }
        };
        const drop = (a) => {
          if (!a || !a.array || !a.array.length) return;
          if (a.isInstancedBufferAttribute || a.usage === THREE.DynamicDrawUsage) return;
          if (!uploaded(a)) { kept++; return; }
          freed += a.array.byteLength;
          _mirrorLedger.note(a);
          a.array = null;
        };
        const atts = g.attributes;
        for (const k in atts) drop(atts[k]);
        if (!kept) g.__tlxFreed = true;
        return freed;
      }
      const _chunkRelOptIn = (function () {
        try { return localStorage.getItem("apex26.tlxChunkRelease") === "1"; } catch (_) { return false; }
      })();
      let _mirrorSweepAt = 0, _carMirrorAt = 0;
      const _mirrorLedger = mirrorLedger();
      const _mirrorStat = { sweeps: 0, geos: 0, freedMB: 0, drains: 0, chunks: 0, carSh: 0, gate: "?", gateBits: -1, repaired: 0 };
      function sweepGeoMirrors(now) {
        if (isMobile) return;
        if (now - _mirrorSweepAt < 2000) return;
        _mirrorSweepAt = now;
        _mirrorStat.sweeps++;
        let freed = 0;
        for (let i = 0; i < _geoReg.length; i++) {
          const ref = _geoReg[i];
          const g = ref && ref.deref ? ref.deref() : null;
          if (!g) continue;
          if (g.__tlxFreed) continue;
          if (g.__tlxKind === "chunk" || g.__tlxKind === "chunked") continue;
          if (g.__tlxDrawnBatch === undefined) continue;
          const n = releaseGeoMirrors(g);
          if (n) { freed += n; _mirrorStat.geos++; }
        }
        if (freed) _mirrorStat.freedMB = +(_mirrorStat.freedMB + freed / 1048576).toFixed(2);
      }
      const _carShReg = [];
      function sweepCarShadowMirrors(now) {
        if (now - _carMirrorAt < 2000) return;
        _carMirrorAt = now;
        let w = 0;
        for (let i = 0; i < _carShReg.length; i++) {
          const ref = _carShReg[i];
          const g = ref.deref();
          if (!g || g.__tlxFreed) continue;
          if (g.__tlxDrawnBatch !== undefined) {
            const n = releaseGeoMirrors(g);
            if (n) { _mirrorStat.carSh++; _mirrorStat.freedMB = +(_mirrorStat.freedMB + n / 1048576).toFixed(2); }
          }
          if (!g.__tlxFreed) _carShReg[w++] = ref;
        }
        _carShReg.length = w;
      }

      function _regGeo(g, kind) {
        try {
          g.__tlxKind = kind;
          if (kind === "carSh" && !g.__tlxCarShReg) { g.__tlxCarShReg = true; _carShReg.push(new WeakRef(g)); }
          if (_geoSeen) {
            if (_geoSeen.has(g)) return g;
            _geoSeen.add(g);
          }
          _geoReg.push(new WeakRef(g));
        } catch (_) {  }
        return g;
      }
      const _pk = (typeof TLXShaders !== "undefined" && TLXShaders.packAttr) || null;
      function buildGeometry(data) {
        const g = new THREE.BufferGeometry();
        const pos = data.pos.length ? data.pos : [0, 0, 0];
        const verts = pos.length / 3;
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
        if (_pk) {
          const fmt24 = !!(renderer.backend && renderer.backend.isWebGPUBackend);
          g.setAttribute("normal", _pk(THREE, data.nrm, verts * 3, 3, "unit", fmt24));
          g.setAttribute("color", _pk(THREE, data.col, verts * 3, 3, "unorm", fmt24));
          g.setAttribute("mat", _pk(THREE, data.mat, verts, 1, "id", fmt24));
          g.setAttribute("trk", _pk(THREE, data.trk, verts * 3, 3, null, fmt24));
        } else {
          g.setAttribute("normal", new THREE.BufferAttribute(
            new Float32Array(data.nrm && data.nrm.length === pos.length ? data.nrm : verts * 3), 3));
          g.setAttribute("color", new THREE.BufferAttribute(
            new Float32Array(data.col && data.col.length === pos.length ? data.col : verts * 3), 3));
          g.setAttribute("mat", new THREE.BufferAttribute(
            new Float32Array(data.mat && data.mat.length === verts ? data.mat : verts), 1));
          g.setAttribute("trk", new THREE.BufferAttribute(
            new Float32Array(data.trk && data.trk.length === pos.length ? data.trk : verts * 3), 3));
        }
        if (data.idx && data.idx.length) {
          g.setIndex(TLXShaders.packIndex
            ? TLXShaders.packIndex(THREE, data.idx, verts)
            : new THREE.BufferAttribute(new Uint32Array(data.idx), 1));
          if (g.index.array instanceof Uint16Array) g.index.__apexUint16Index = true;
        }
        const ids = data.mat;
        if (ids) for (let i = 0; i < ids.length; i++) { const v = Math.round(ids[i]); if (v >= 60 && v <= 85) { g.userData.tlxFx = true; break; } }
        return _regGeo(g, "mesh");
      }
      const fxFor = (geo, opts) => !!(opts && opts.carFinish && geo && geo.userData.tlxFx);

      function readbackTextureLayers(size, images, n, data) {
        const expected = [];
        for (let i = 0; i < n; i++) if (images[i]) expected.push(i);
        let done = [];
        try {
          if (typeof Assets !== "undefined" && Assets.readLayerBytes) done = Assets.readLayerBytes(size, images, n, data);
        } catch (_) { done = []; }
        let filled = done.length;
        const have = new Set(done), c2d = { ctx: null };
        for (let i = 0; i < n; i++) {
          if (!images[i] || have.has(i)) continue;
          const r = fill2dLayer(c2d, size, images[i], i, data);
          if (r < 0) return filled;
          filled += r;
        }
        return filled === expected.length ? filled : 0;
      }
      function fill2dLayer(c2d, size, img, i, data) {
        try {
          if (!c2d.ctx) {
            const cv2 = (typeof OffscreenCanvas !== "undefined")
              ? new OffscreenCanvas(size, size)
              : Object.assign(document.createElement("canvas"), { width: size, height: size });
            c2d.ctx = cv2.getContext("2d", { willReadFrequently: true });
            if (!c2d.ctx) return -1;
          }
          c2d.ctx.clearRect(0, 0, size, size);
          c2d.ctx.drawImage(img, 0, 0, size, size);
          data.set(c2d.ctx.getImageData(0, 0, size, size).data, i * size * size * 4);
          return 1;
        } catch (_) { return 0;  }
      }
      let _packAsync = true;
      try { _packAsync = localStorage.getItem("apex26.tlxPackAsync") !== "0"; } catch (_) {  }
      let _matBindGen = 0;
      let _matRequested = new Set();

      let _mirrorSweepOptIn = false;
      try { _mirrorSweepOptIn = localStorage.getItem("apex26.tlxMirrorSweep") === "1"; } catch (_) {  }
      let _glMaxDim = -1, _glMaxTries = 0;
      const cssSizeCache = CanvasCssSize.create(_layoutCanvas, { settleFrames: 30 });
      _createUndo.push(function () { cssSizeCache.dispose(); });
      let _resizeRaf = 0, _resizeNow = false, _sizeOwned = false;
      function applyResize() {
        if (_xrActive) return;
        const css = cssSizeCache.read();
        const cw = css.width || 1;
        const ch = css.height || 1;
        const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
        presentW = Math.max(1, Math.round(cw * dpr));
        presentH = Math.max(1, Math.round(ch * dpr));
        const _gpuDev = (renderer.backend && renderer.backend.isWebGPUBackend && renderer.backend.device) || null;
        let maxDim = _gpuDev ? ((_gpuDev.limits && _gpuDev.limits.maxTextureDimension2D) || 8192) : 0;
        if (!_gpuDev) {
          if (_glMaxDim < 0) {
            const _gl = (renderer.backend && renderer.backend.gl) || null;
            try {
              const lim = _gl ? [_gl.getParameter(_gl.MAX_TEXTURE_SIZE) | 0, _gl.getParameter(_gl.MAX_RENDERBUFFER_SIZE) | 0].filter((v) => v >= 2048) : [];
              if (lim.length) _glMaxDim = Math.min(...lim);
              else if (++_glMaxTries >= 120) _glMaxDim = 0;
            } catch (_) { if (++_glMaxTries >= 120) _glMaxDim = 0; }
          }
          maxDim = Math.max(0, _glMaxDim);
        }
        if (maxDim && (presentW > maxDim || presentH > maxDim)) {
          const k = Math.min(maxDim / presentW, maxDim / presentH);
          presentW = Math.max(1, Math.floor(presentW * k));
          presentH = Math.max(1, Math.floor(presentH * k));
        }
        const rw = Math.max(1, Math.round(presentW * renderScale));
        const rh = Math.max(1, Math.round(presentH * renderScale));
        const fixedNow = fixedActive();
        const up = fixedNow ? (rw !== presentW || rh !== presentH) : wantSpatialUpscale();
        const cwBuf = (up || fixedNow) ? presentW : rw;
        const chBuf = (up || fixedNow) ? presentH : rh;
        const sizeChanged = rw !== W || rh !== H ||
          (_displayCanvas && (_displayCanvas.width !== cwBuf || _displayCanvas.height !== chBuf)) ||
          (renderer.domElement && (renderer.domElement.width !== cwBuf || renderer.domElement.height !== chBuf));
        if (sizeChanged) {
          _softReadEpoch++;
          _softReadQueued = null;
          _softReadPending = false;
          W = rw; H = rh;
          _gpuLastOperation = "resize";
          _gpuLastResize = { at: performance.now(), width: rw, height: rh };
          if (!fixedNow || !renderer.domElement || renderer.domElement.width !== cwBuf || renderer.domElement.height !== chBuf) {
            renderer.setSize(cwBuf, chBuf, false);
          }
          if (_displayCanvas && (_displayCanvas.width !== cwBuf || _displayCanvas.height !== chBuf)) {
            _displayCanvas.width = cwBuf;
            _displayCanvas.height = chBuf;
          }
          if (sceneView) sceneView.set(rw, rh);
          if (_postRebuild && !post) {
            _postRebuild = false; post = buildPost();
            if (!post) postFailure("Post-processing reconstruction failed");
          }
          if (post) post.resize(rw, rh, presentW, presentH);
        }
      }
      function resize() {
        if (_warmPending) { cssSizeCache.markDirty(); return; }
        if (_resizeNow) { applyResize(); return; }
        if (_sizeOwned) { _sizeOwned = false; return; }
        if (_resizeRaf) return;
        const schedule = typeof requestAnimationFrame === "function"
          ? requestAnimationFrame
          : (fn) => setTimeout(fn, 0);
        _resizeRaf = schedule(() => {
          _resizeRaf = 0;
          if (_warmPending) { cssSizeCache.markDirty(); return; }
          applyResize();
        });
      }
      function resizeNow() {
        _resizeNow = true;
        try {
          if (_resizeRaf) {
            try {
              if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(_resizeRaf);
            } catch (_) {  }
            _resizeRaf = 0;
          }
          resize();
        } finally { _resizeNow = false; }
      }

      const noopMesh = () => ({ __tlx: true, count: 0 });

      function _captureRT() {
        if (post && typeof post.presentedTarget === "function") return post.presentedTarget();
        if (post && typeof post.ldrTarget === "function") return post.ldrTarget();
        return _blitRT;
      }
      function _ensureBlitRT(w, h) {
        if (!_blitRT) {
          _blitRT = new THREE.RenderTarget(w, h, {
            type: THREE.UnsignedByteType, depthBuffer: true,
          });
          _blitRT.texture.generateMipmaps = false;
          _blitRT.texture.colorSpace = THREE.NoColorSpace;
        } else if (_blitRT.width !== w || _blitRT.height !== h) {
          _blitRT.setSize(w, h);
        }
        return _blitRT;
      }
      function _ensureUnstridePool(need) {
        if (!_unstridePool || _unstridePool.length < need) {
          _unstridePool = new Uint8ClampedArray(need);
        }
        return _unstridePool.length === need ? _unstridePool : _unstridePool.subarray(0, need);
      }
      function _unstrideRgba(src, w, h) {
        const bpr = 256 * Math.ceil((w * 4) / 256);
        const need = w * h * 4;
        const data = _ensureUnstridePool(need);
        const row = w * 4;
        if (src.length < (h - 1) * bpr + row) {
          if (src.length >= need) data.set(src.subarray(0, need));
        } else {
          for (let y = 0; y < h; y++) {
            data.set(src.subarray(y * bpr, y * bpr + row), y * row);
          }
        }
        for (let i = 3; i < need; i += 4) data[i] = 255;
        return data;
      }
      function _unstrideIntoSoft(src, w, h, dest) {
        const bpr = 256 * Math.ceil((w * 4) / 256);
        const row = w * 4;
        const need = w * h * 4;
        let maxPx = 0;
        if (src.length < (h - 1) * bpr + row) {
          if (src.length < need) return 0;
          for (let i = 0; i < need; i += 4) {
            const r = src[i], g = src[i + 1], b = src[i + 2];
            dest[i] = r; dest[i + 1] = g; dest[i + 2] = b; dest[i + 3] = 255;
            const s = r + g + b;
            if (s > maxPx) maxPx = s;
          }
        } else {
          for (let y = 0; y < h; y++) {
            const so = y * bpr, d0 = y * row;
            for (let x = 0; x < row; x += 4) {
              const r = src[so + x], g = src[so + x + 1], b = src[so + x + 2];
              dest[d0 + x] = r; dest[d0 + x + 1] = g; dest[d0 + x + 2] = b; dest[d0 + x + 3] = 255;
              const s = r + g + b;
              if (s > maxPx) maxPx = s;
            }
          }
        }
        return maxPx;
      }
      function _readLdr(rt, readW, readH) {
        const w = readW || (rt && rt.width) || W;
        const h = readH || (rt && rt.height) || H;
        return renderer.readRenderTargetPixelsAsync(rt, 0, 0, w, h).then(function (src) {
          return { w, h, data: _unstrideRgba(src, w, h) };
        });
      }
      function _softBlitNotify() {
        _softBlitGen++;
        const keep = [];
        const ws = _softPresentWaiters.splice(0);
        for (let i = 0; i < ws.length; i++) {
          try { if (!ws[i](_softBlitGen)) keep.push(ws[i]); } catch (_) {  }
        }
        for (let j = 0; j < keep.length; j++) _softPresentWaiters.push(keep[j]);
      }
      function _finishSoftBlitRead() {
        _softReadPending = false;
        const next = _softReadQueued;
        _softReadQueued = null;
        if (next) _startSoftBlitRead(next);
      }
      function _startSoftBlitRead(req) {
        _softReadPending = true;
        _softReadSince = (typeof performance !== "undefined" ? performance.now() : Date.now());
        let read;
        try {
          read = renderer.readRenderTargetPixelsAsync(req.rt, 0, 0, req.w, req.h);
        } catch (_) { _finishSoftBlitRead(); return; }
        read.then(function (src) {
          try {
            const w = req.w, h = req.h;
            if (req.epoch !== _softReadEpoch || !_displayCanvas ||
                _displayCanvas.width !== w || _displayCanvas.height !== h) return;
            if (!_softImg || _softImg.width !== w || _softImg.height !== h) {
              _softImg = _displayCtx.createImageData(w, h);
            }
            const maxPx = _unstrideIntoSoft(src, w, h, _softImg.data);
            if (maxPx >= 8) {
              _displayCtx.putImageData(_softImg, 0, 0);
              _softShownGen = req.gen;
              _softBlitNotify();
            }
            _softReadLastMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - _softReadSince;
          } catch (_) {  }
        }, function (err) {
          _softReadFails++;
          _softReadLastErr = String((err && err.message) || err || "readback rejected").slice(0, 120);
        }).then(function () {
          if (req.epoch === _softReadEpoch) _finishSoftBlitRead();
        });
      }
      const SOFT_READ_STALE_MS = 20000;
      let _softReadSince = 0, _softReadLastMs = 0, _softReadFails = 0, _softReadLastErr = null, _softReadAbandoned = 0;
      function _softReadStaleMs() { return Math.max(SOFT_READ_STALE_MS, 3 * _softReadLastMs); }
      function _queueSoftBlit(rt) {
        if (!_softBlit || !_displayCtx || !rt || typeof renderer.readRenderTargetPixelsAsync !== "function") return;
        try {
          if (typeof PerfGov !== "undefined" && PerfGov.softwareGlSoftPresentDefer && PerfGov.softwareGlSoftPresentDefer()) {
            if (_softPresentWaiters.length) _softBlitNotify();
            return;
          }
        } catch (_) {  }
        const req = {
          rt,
          w: (rt && rt.width) || W,
          h: (rt && rt.height) || H,
          epoch: _softReadEpoch,
          gen: ++_softSubmittedGen,
        };
        if (_softReadPending) {
          const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
          if (now - _softReadSince > _softReadStaleMs()) {
            _softReadEpoch++;
            _softReadPending = false;
            _softReadQueued = null;
            _softReadAbandoned++;
            req.epoch = _softReadEpoch;
          } else {
            _softReadQueued = req;
            return;
          }
        }
        _startSoftBlitRead(req);
      }
      function _cancelSoftBlits() {
        _softReadEpoch++;
        _softReadQueued = null;
        _softReadPending = false;
      }

      let _nullMirrorLogged = false;
      const nullMirrorSkip = (e) => {
        if (_deviceLost || !isNullMirrorError(e)) return false;
        const n = _mirrorLedger.repair();
        if (!n) return false;
        _mirrorStat.repaired += n;
        try { if (!_nullMirrorLogged) { _nullMirrorLogged = true; Log.warn("gfx", "TLX: freed vertex mirror read by three; repaired", n, "attribute(s), frame skipped —", e); } } catch (_) {  }
        return true;
      };
      const refuseTab = () => {
        const toGlx = _glPin === "0" || _glPin === "1" || forceWebGL || _autoStayGL;
        try { sessionStorage.setItem(toGlx ? "apex26.gfxClaimFail" : "apex26.tlxAutoGL", "1"); } catch (_) {  }
        if (!toGlx) _latchWebKitGL("first render refused");
        try { localStorage.removeItem("apex26.gfxBackendProbe"); } catch (_) {  }
        const n = GfxEscalation.nextReloadCount();
        if (n <= 2) { try { sessionStorage.setItem("apex26.ctxLostNotice", "1"); } catch (_) {  } try { location.reload(); } catch (_) {  } return; }
        try {
          recordGfxBudgetExhausted("gfx", new Error("The graphics renderer cannot draw on this device — reload to try again, or pick another RENDERER in settings."));
        } catch (_) {  }
      };
      const persistFail = (e, postOnly) => {
        const reason = (e && e.message) || String(e);
        _lastFailure = { reason, at: Date.now() };
        try { localStorage.setItem("apex26.gfxTlxFail", reason); } catch (_) {  }
        if (!postOnly) try { sessionStorage.setItem("apex26.gfxBound", "webgl2"); } catch (_) {  }
        try { if (!_presentWarned) { _presentWarned = true; Log.warn("gfx", "TLX: present failed —", e); } } catch (_) {  }
      };
      const paintCanvas = (self) => {
        _gpuLastOperation = "render-canvas";
        pinSkyMaterial();
        const xrEyes = self._pendingXrEyes;
        const xrLayer = self._xrLayer;
        if (xrEyes && xrEyes.length && xrLayer) {
          const gl = ownGL || (renderer.backend && renderer.backend.gl) || null;
          if (gl && xrLayer.framebuffer) {
            try { gl.bindFramebuffer(gl.FRAMEBUFFER, xrLayer.framebuffer); } catch (_) {  }
          }
          renderer.setRenderTarget(null);
          for (let ei = 0; ei < xrEyes.length; ei++) {
            const eye = xrEyes[ei];
            const vp = eye.viewport;
            if (vp && !(vp.width > 0 && vp.height > 0)) continue;
            self._applyXrEye(eye);
            if (vp && typeof renderer.setViewport === "function") {
              renderer.setViewport(vp.x, vp.y, vp.width, vp.height);
            } else if (vp && gl) {
              gl.viewport(vp.x, vp.y, vp.width, vp.height);
            }
            _gpuLastOperation = "render-xr-" + ei;
            _renderTimed(scene, camera);
          }
          try { renderer.setViewport(0, 0, W, H); } catch (_) {  }
          if (gl && xrLayer.framebuffer) {
            try { gl.bindFramebuffer(gl.FRAMEBUFFER, null); } catch (_) {  }
          }
          return;
        }
        if (_softBlit) {
          const rt = _ensureBlitRT(W, H);
          renderer.setRenderTarget(rt);
          _renderTimed(scene, camera);
          _queueSoftBlit(rt);
          return;
        }
        renderer.setRenderTarget(null);
        _renderTimed(scene, camera);
      };
      const dropTo = (mode, mat) => {
        _drawMatMode = mode;
        const deadPost = post;
        post = null;
        _postRebuild = false;
        postFailure("Renderer fallback requires reload for post-processing");
        _cancelSoftBlits();
        try { if (deadPost && deadPost.dispose) deadPost.dispose(); } catch (_) {  }
        try { if (sky && sky.dispose) sky.dispose(); } catch (_) {  }
        sky = null;
        hideSkyMesh();
        try { scene.backgroundNode = null; } catch (_) {  }
        lit = null;
        fx = null;
        for (let i = 0; i < meshPool.length; i++) {
          const pm = meshPool[i];
          if (pm && pm.__tlxBatch === _poolBatch) pm.material = mat;
        }
        const instMat = mode >= 2 ? mat : unlitInstancedMat;
        for (let i = 0; i < _instRegistry.length; i++) {
          const im = _instRegistry[i];
          if (!im) continue;
          if (im.isInstancedMesh) im.material = instMat;
          else if (mode >= 2) im.visible = false;
          else im.material = _aiOf(unlitInstancedMat);
        }
      };
      function materialArrayAnisotropy() {
        if (materialArrayDetail !== null) return materialArrayDetail;
        let requested = 4;
        try { if (localStorage.getItem("apex26.tlxMaterialDetail") === "8") requested = 8; } catch (_) {  }
        let cap = 1;
        try {
          const b = renderer.backend;
          cap = renderer.getMaxAnisotropy ? renderer.getMaxAnisotropy() : (b && b.capabilities && b.capabilities.getMaxAnisotropy ? b.capabilities.getMaxAnisotropy() : 1);
        } catch (_) {  }
        materialArrayDetail = Math.max(1, Math.min(requested, Number.isFinite(cap) ? cap : 1));
        return materialArrayDetail;
      }
      const backend = {
        postHealth: () => ({ ..._postHealth, retryable: !post && !!lit && !!fx }),
        retryPost() {
          if (post || !lit || !fx) return false;
          _postStrikes = 0; _postRebuild = true; _postRetryAt = 0;
          postFailure("Manual recovery requested"); return true;
        },
        backend: "three",
        occlusionCull: () => ({ supported: false, on: false }),
        occlusionStats: () => ({ supported: false, on: false }),
        multiDraw: () => ({ supported: false, on: false }),
        multiDrawStats: () => ({ supported: false, on: false }),
        get isWebGPU() { return !!(renderer.backend && renderer.backend.isWebGPUBackend); },

        init() { return true; },
        resize,
        setRenderScale(s) {
          const v = Math.min(1, Math.max(0.5, +s || 0));
          if (Math.abs(v - renderScale) < 0.02) return false;
          renderScale = v; resizeNow(); return true;
        },
        getRenderScale() { return renderScale; },
        capDpr(n) {
          if (!(n >= 1) || n >= DPR_CAP) return false;
          DPR_CAP = n; resizeNow(); return true;
        },
        setSpatialUpscale, getSpatialUpscale,
        getPresentSize,
        get width() { return W; },
        get height() { return H; },
        get aspect() { return H ? W / H : 1; },
        hdrMode() { return !!(post && post.hdrOk()); },
        maxLights: _maxLights,
        msaa() { return post && _sceneSamples > 1 ? _sceneSamples : 1; },
        pcss() { return !!(shadowSys && shadowSys.S.pcssEnabled); },
        isMobile,
        mobileTier,
        gpuTimer(on) {
          const sup = _gpuSupported();
          if (on !== undefined) {
            const next = !!on && sup && !_inspectorHold;
            if (next !== _gpuTimerOn) { _gpuTimerEpoch++; _gpuMs = -1; _gpuSampleAt = -1; }
            _gpuTimerOn = next;
            if (!_inspectorHold) try { renderer.backend.trackTimestamp = _gpuTimerOn; } catch (_) {}
            if (!_gpuTimerOn) { _gpuMs = -1; _gpuSampleAt = -1; }
          }
          if (_deviceLost) { _gpuMs = -1; _gpuSampleAt = -1; }
          return { supported: sup, on: _gpuTimerOn, samples: _gpuSamples, sampleAt: _gpuSampleAt,
            sampleAgeMs: _gpuSampleAt < 0 ? -1 : Math.max(0, _nowMs() - _gpuSampleAt) };
        },
        gpuMs() { return _deviceLost ? -1 : _gpuMs; },
        inspectorHost() {
          return { renderer, hold(on) { _inspectorHold = !!on; if (on) { _gpuTimerOn = false; _gpuMs = -1; _gpuSampleAt = -1; _gpuTimerEpoch++; } } };
        },
        carShadowKeep() { return !!(shadowSys && shadowSys.carShadowKeep()); },
        lampShadowKeep(idx) { return !!(shadowSys && shadowSys.lampShadowKeep(idx)); },
        get carShadowEnabled() { return !!(shadowSys && shadowSys.S.carEnabled); },
        get lampShadowEnabled() { return !!(shadowSys && shadowSys.S.lampEnabled); },
        carShadowState() {
          const s = shadowSys && shadowSys.S;
          return s ? { enabled: s.carEnabled, arms: s.carArms, armed: s.carArmed } : { enabled: false, arms: 0, armed: false };
        },
        lampShadowState() {
          const s = shadowSys && shadowSys.S;
          return s ? { enabled: s.lampEnabled, arms: s.lampArms, idx: s.lampIdx, armed: s.lampArmed }
                   : { enabled: false, arms: 0, idx: -1, armed: false };
        },

        chunkedTrackCoords: false,
        hasPerChunkLights: true,
        hasLampBake: true,
        lampGridState() { return _lampGridState; },
        createMesh(data) {
          if (!data || !data.pos || !data.pos.length) return noopMesh();
          _meshMade.mesh++;
          const kind = data._releaseCpuMirror ? "carSh" : "mesh";
          const geo = _regGeo(buildGeometry(data), kind);
          if (TLXShaders.splitRanges && data.trk && data.trk.length === data.pos.length && data.idx && data.idx.length >= SPLIT_MIN_IDX) geo.__tlxSplit = makeSplit(geo, data);
          return { __tlx: true, geo, count: (data.idx && data.idx.length) || 0 };
        },
        createTexMesh(data) {
          if (!data || !data.pos || !data.pos.length) return noopMesh();
          _meshMade.tex++;
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(data.pos), 3));
          g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(data.nrm), 3));
          g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(data.uv), 2));
          const vCount = data.pos.length / 3;
          const IndexArray = vCount > 65535 ? Uint32Array : Uint16Array;
          g.setIndex(new THREE.BufferAttribute(new IndexArray(data.idx), 1));
          if (g.index.array instanceof Uint16Array) g.index.__apexUint16Index = true;
          return { __tlx: true, geo: _regGeo(g, "tex"), tex: true, count: data.idx.length };
        },
        trackPrepareConfig: () => chunkedSys ? chunkedSys.prepareConfig() : null,
        createChunkedMesh(data, cellSize) {
          if (!data || !data.pos || !data.pos.length) return noopMesh();
          _meshMade.chunked++;
          if (chunkedSys) {
            const m = chunkedSys.build(data, cellSize);
            if (m && m.chunks) for (const c of m.chunks) _regGeo(c.geo, "chunk");
            else if (m && m.geo) _regGeo(m.geo, "chunked");
            return m;
          }
          return { __tlx: true, geo: buildGeometry(data), chunked: true, count: (data.idx && data.idx.length) || 0 };
        },
        createTexture(src, opts) {
          let t = takePooledTexture(src);
          if (t) { t.image = src; _texStat.reused++; }
          else { t = new THREE.Texture(src); _texStat.made++; }
          t.__tlxRelease = null;
          if (opts && typeof opts.disposeSource === "function") {
            const disposeSource = opts.disposeSource;
            const release = () => {
              t.removeEventListener("dispose", release);
              if (t.__tlxRelease === release) t.__tlxRelease = null;
              try { disposeSource(src); } catch (_) {  }
            };
            t.addEventListener("dispose", release);
            t.__tlxRelease = release;
          }
          if (src && src.width > 0 && src.height > 0) { t.__tlxPoolW = src.width; t.__tlxPoolH = src.height; t.__tlxPoolBmp = _isBitmap(src); }
          t.flipY = true;
          const anisotropy = opts && Number.isFinite(opts.anisotropy) ? Math.max(4, Math.min(16, opts.anisotropy)) : 4;
          if (!(t.anisotropy >= anisotropy)) t.anisotropy = anisotropy;
          t.colorSpace = THREE.NoColorSpace;
          t.premultiplyAlpha = true;
          t.onUpdate = releaseTexSource;
          t.needsUpdate = true;
          if (mobileTier || isMobile) { try { renderer.initTexture(t); } catch (_) {  } }
          return { __tlx: true, tex: t };
        },
        uploadTexture(h) {
          try { if (h && h.tex) renderer.initTexture(h.tex); } catch (_) {  }
        },
        refillTexture(h, src) {
          const t = h && h.tex;
          if (!t || !src || src.width !== t.__tlxPoolW || src.height !== t.__tlxPoolH || _isBitmap(src) !== !!t.__tlxPoolBmp) return false;
          t.image = src;
          t.onUpdate = releaseTexSource;
          t.needsUpdate = true;
          if (mobileTier || isMobile || !t.__tlxUp) { try { renderer.initTexture(t); } catch (_) {  } }
          return true;
        },
        freeMesh(m) { if (m && m.geo) { disposeGeometry(m.geo); m.geo = null; } },
        pinMesh(m) { if (m && m.geo) m.geo.__tlxPin = true; },
        freeChunkedMesh(m) {
          if (m && m.chunks && chunkedSys) {
            if (!_ownershipFreeBatch) { _ownershipFreeBatch = new Set(); _ownershipFreeDepth = 1; }
            chunkedSys.free(m, _ownershipFreeBatch);
            return;
          }
          if (m && m.geo) { disposeGeometry(m.geo); m.geo = null; }
        },
        flushChunkedOwnership() {
          if (_ownershipFreeBatch && _ownershipFreeBatch.size) {
            flushOwnershipRelease(_ownershipFreeBatch);
            if (chunkedSys && chunkedSys.disposeShared) chunkedSys.disposeShared(_ownershipFreeBatch);
          }
          _ownershipFreeBatch = null;
          _ownershipFreeDepth = 0;
        },
        freeTexture(t) {
          if (t && t.tex) {
            retireTexture(t.tex, typeof performance !== "undefined" ? performance.now() : Date.now());
            t.tex = null; return;
          }
          if (t && t.isTexture) t.dispose();
        },
        flushTexPool,
        texCensus: undefined,

        createTextureArray(size, images, layers) {
          if (!size || !images) return null;
          try {
            const n = layers || 17;
            let data = new Uint8Array(size * size * 4 * n);
            data.fill(128);
            for (let i = 3; i < data.length; i += 4) data[i] = 255;
            let filled = 0;
            const c2d = { ctx: null };
            const job = _packAsync && typeof Assets !== "undefined" && Assets.readLayerBytesAsync
              ? Assets.readLayerBytesAsync(size, images, n, data, (i, bytes) => {
                if (bytes) filled++;
                else if (images[i] && fill2dLayer(c2d, size, images[i], i, data) > 0) filled++;
              }) : null;
            if (!job) filled = readbackTextureLayers(size, images, n, data);
            if (!job && !filled) return null;
            const t = new THREE.DataArrayTexture(data, size, size, n);
            t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
            t.colorSpace = THREE.NoColorSpace;
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.minFilter = THREE.LinearMipmapLinearFilter;
            t.magFilter = THREE.LinearFilter;
            t.generateMipmaps = true;
            t.anisotropy = materialArrayAnisotropy();
            const letGo = () => { data = null; images = null; };
            t.onUpdate = (tex) => { tex.onUpdate = null; tex.image = { data: null, width: size, height: size, depth: n }; };
            const dropImage = t.onUpdate;
            t.onUpdate = (tex) => { dropImage(tex); letGo(); };
            if (!job) { t.needsUpdate = true; return t; }
            t.pending = true;
            t.addEventListener("dispose", () => { t._freed = true; });
            const settle = () => {
              t.pending = false;
              if (t._freed) { letGo(); return false; }
              if (!filled) { t.dispose(); letGo(); return false; }
              t.needsUpdate = true;
              return true;
            };
            t.ready = job.then(settle, () => { filled = 0; return settle(); });
            return t;
          } catch (_) { return null; }
        },
        setMaterialMaps(maps) {
          if (!lit || !lit.setMaterialMaps) return;
          const gen = ++_matBindGen;
          _matRequested = new Set(maps ? [maps.albedo, maps.normal] : []);
          const waits = maps ? [maps.albedo, maps.normal].filter((t) => t && t.pending && t.ready).map((t) => t.ready) : [];
          if (waits.length) {
            Promise.all(waits).then(() => {
              const live = (t) => !!(t && !t.pending && !t._freed);
              const a = live(maps.albedo) ? maps.albedo : null, nn = live(maps.normal) ? maps.normal : null;
              if (gen !== _matBindGen || !a) {
                for (const t of new Set([a, nn])) if (t && (gen === _matBindGen || !_matRequested.has(t))) t.dispose();
                return;
              }
              bindNow(Object.assign({}, maps, { albedo: a, normal: nn }));
            });
            return;
          }
          bindNow(maps);
          function bindNow(maps) {
            function releaseOwned(keep) {
              const kept = new Set();
              if (keep) {
                if (keep.albedo) kept.add(keep.albedo);
                if (keep.normal) kept.add(keep.normal);
              }
              const seen = new Set();
              for (const t of [matOwnedAlbedo, matOwnedNormal]) {
                if (!t || seen.has(t) || kept.has(t)) continue;
                seen.add(t);
                try { t.dispose(); } catch (_) {  }
              }
              matOwnedAlbedo = null;
              matOwnedNormal = null;
            }
            releaseOwned(maps);
            if (!maps) {
              if (matPlaceAlbedo || matPlaceNormal) {
                lit.setMaterialMaps({
                  albedo: matPlaceAlbedo, normal: matPlaceNormal,
                });
              } else {
                lit.setMaterialMaps(null);
              }
              return;
            }
            if (maps.albedo) matOwnedAlbedo = maps.albedo;
            if (maps.normal) matOwnedNormal = maps.normal;
            if ((!maps.albedo && matPlaceAlbedo) || (!maps.normal && matPlaceNormal)) {
              lit.setMaterialMaps(Object.assign({}, maps, {
                albedo: maps.albedo || matPlaceAlbedo, normal: maps.normal || matPlaceNormal,
              }));
            } else {
              lit.setMaterialMaps(maps);
            }
          }
        },
        materialMapState() {
          const sc = (lit && lit.uniforms && lit.uniforms.matTexScale && lit.uniforms.matTexScale.array) || [];
          return {
            albedo: !!matOwnedAlbedo, normal: !!matOwnedNormal,
            layers: Array.from(sc).reduce((n, s) => n + (s > 0 ? 1 : 0), 0),
            scales: Array.from(sc),
          };
        },

        shadowBegin(vp) { if (shadowSys) shadowSys.shadowBegin(vp); },
        castShadow(mesh, model) { if (shadowSys) shadowSys.castShadow(mesh, model); },
        castShadowChunked(mesh, model, reach) {
          if (!shadowSys) return;
          const S = shadowSys.S;
          if (mesh && mesh.chunks && chunkedSys && S.depthPassOn) {
            const n = chunkedSys.cull(mesh, S.castCullVP || S.lightVP, reach || null, reach ? reach[3] : 0);
            const g = _chunkMerge && n > 1 ? chunkedSys.mergeVisible(mesh, n, 2) : null;
            if (g) { _shMergeWrap.geo = g; shadowSys.castShadow(_shMergeWrap, model); _shMergeWrap.geo = null; return; }
            const vis = chunkedSys.visList;
            for (let i = 0; i < n; i++) shadowSys.castShadow(vis[i].wrap, model);
            return;
          }
          shadowSys.castShadowChunked(mesh, model);
        },
        shadowEnd() { if (shadowSys) shadowSys.shadowEnd(); },
        carShadowBegin(vp, boxScale) {
          if (!shadowSys) return;
          if (_softBlit && _softReadPending) { shadowSys.carShadowKeep(); return; }
          shadowSys.carShadowBegin(vp, boxScale);
        },
        carShadowEnd() { if (shadowSys) shadowSys.carShadowEnd(); },
        lampShadowBegin(vp, idx) { if (shadowSys) shadowSys.lampShadowBegin(vp, idx); },
        lampShadowEnd() { if (shadowSys) shadowSys.lampShadowEnd(); },
        lampStaticBegin(vp) { return !!(shadowSys && shadowSys.lampStaticOn && shadowSys.lampStaticBegin(vp)); },
        lampStaticEnd() { if (shadowSys) shadowSys.lampStaticEnd(); },
        lampCarsBegin(vp, idx) { return !!(shadowSys && shadowSys.lampStaticOn && shadowSys.lampCarsBegin(vp, idx)); },
        get shadowCullVP() {
          if (!shadowSys) return null;
          const S = shadowSys.S;
          return S.castCullVP || S.lightVP;
        },
        envFaceBegin(face, eye, frame) {
          if (_envOptOut) return null;
          if (!envRT || !lit || !eye || !frame || !frame.viewProj) return null;
          if (_envGaveUp) return null;
          ensureEnvCam();
          if (!envCubeCam) return null;
          _envActive = true;
          envCubeCam.position.set(eye[0], eye[1], eye[2]);
          envCubeCam.updateMatrixWorld(true);
          const faceCam = envCubeCam.children[face & 7];
          if (!faceCam) { _envActive = false; return null; }
          _envVP.multiplyMatrices(faceCam.projectionMatrix, faceCam.matrixWorldInverse);
          _envInvVP.copy(_envVP).invert();
          _envInvVP.toArray(_envInvArr);
          _envVP.toArray(_envVPArr);
          _envFrame = frame;
          _envSvVP = frame.viewProj; _envSvEye = frame.eye; _envSvCull = frame.cullDist;
          frame.viewProj = _envVPArr; frame.eye = eye;
          frame.cullDist = _envSvCull > 0 ? Math.min(_envSvCull, ENV_CULL_M) : ENV_CULL_M;
          if (lit.updateFrame) lit.updateFrame(frame);
          _envBegins++;
          return _envInvArr;
        },
        readEnvCube() {
          if (_envCubeRead || !envRT || typeof renderer.readRenderTargetPixelsAsync !== "function") return;
          _envCubeRead = true;
          const half = (h) => {
            const sg = (h & 0x8000) ? -1 : 1, ex = (h >> 10) & 0x1f, fr = h & 0x3ff;
            if (ex === 0) return sg * Math.pow(2, -14) * (fr / 1024);
            if (ex === 31) return fr ? NaN : sg * Infinity;
            return sg * Math.pow(2, ex - 15) * (1 + fr / 1024);
          };
          (async () => {
            const faces = [];
            for (let f = 0; f < 6; f++) {
              const px = await renderer.readRenderTargetPixelsAsync(envRT, 0, 0, ENV_SIZE, ENV_SIZE, 0, f);
              const isHalf = !!px && px.BYTES_PER_ELEMENT === 2;
              let sum = 0, mx = 0, n = 0;
              for (let i = 0; i + 3 < px.length; i += 4) {
                const r = isHalf ? half(px[i]) : px[i] / 255;
                const g = isHalf ? half(px[i + 1]) : px[i + 1] / 255;
                const b = isHalf ? half(px[i + 2]) : px[i + 2] / 255;
                const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                sum += y; if (y > mx) mx = y; n++;
              }
              faces.push({ m: +(sum / Math.max(1, n)).toFixed(4), x: +mx.toFixed(4) });
            }
            _envCube = {
              faces, hdr: !!(post && post.hdrOk()),
              mean: +(faces.reduce((a, v) => a + v.m, 0) / 6).toFixed(4),
              max: +Math.max.apply(null, faces.map((v) => v.x)).toFixed(4),
            };
          })().catch((e) => { _envCube = { error: String((e && e.message) || e).slice(0, 80) }; });
        },
        envFaceEnd(face) {
          if (!envRT || !envCubeCam || !_envActive) {
            _envActive = false;
            _restoreEnvFrame();
            return;
          }
          const faceCam = envCubeCam.children[face & 7];
          if (softContent("env")) {
            try {
              renderer.setRenderTarget(envRT, face & 7);
              renderer.setClearColor(0x000000, 1);
              renderer.clear();
            } catch (_) {  }
            renderer.setRenderTarget(softOutRT());
            resetRecs();
            _dMatUsed = 0;
            _poolBatch++;
            _envActive = false;
            envFacesMask |= 1 << (face & 7); _envEnds++;
            if (envFacesMask === 63) {
              envFacesMask = 0;
              envReady = true;
              _envBlank = true;
            }
            _restoreEnvFrame();
            return;
          }
          _poolBatch++;
          _kidsBegin(_kidsEnv);
          _instStamp++;
          for (let i = 0; i < drawList.n; i++) {
            const rec = drawList[i];
            if (rec.instanced) continue;
            if (rec.chunked) {
              if (softContent("chunked") || !chunkedSys) continue;
              continue;
            }
            acquireMesh(rec.geo, rec.m, rec.mat, rec).renderOrder = i;
          }
          _poolShow();
          _hideUndrawnInstanced();
          if (envFacesMask === 0) { _envErrBase = _gpuErrors; _envFaceErr = false; }
          const _errAtFace = _gpuErrors;
          let faceOk = true;
          try {
            if (lit && lit.setEnvCube && envDummy) lit.setEnvCube(envDummy.texture);
            pinSkyMaterial();
            renderer.setRenderTarget(envRT, face & 7);
            _gpuLastOperation = "render-env";
            const _envOneMip = _envMipsAlloc && (typeof renderer.generateMipmaps === "function"
              || !!(renderer.backend && typeof renderer.backend.generateMipmaps === "function"));
            if (_envOneMip) envRT.texture.generateMipmaps = false;
            try { renderer.render(scene, faceCam); } finally { envRT.texture.generateMipmaps = true; }
            _envMipsAlloc = true;
          } catch (e) {
            faceOk = false;
            _envFailN++;
            if (_envFailN >= ENV_FAIL_CAP) _envGaveUp = true;
            if (!_envFailMsg) _envFailMsg = (e && e.message) || String(e);
            if (!_envFailStack) _envFailStack = String((e && e.stack) || "").slice(0, 600);
          }
          renderer.setRenderTarget(softOutRT());
          if (lit && lit.setEnvCube) {
            lit.setEnvCube((faceOk || envReady) || !envDummy ? envRT.texture : envDummy.texture);
          }
          resetRecs();
          _dMatUsed = 0;
          _poolBatch++;
          _envActive = false;
          if (_gpuErrors > _errAtFace) _envFaceErr = true;
          if (faceOk) { envFacesMask |= 1 << (face & 7); _envEnds++; }
          const probeErrored = _envFaceErr;
          if (faceOk && envFacesMask === 63 && probeErrored) {
            envFacesMask = 0;
            _envBadProbes++;
            if (_envBadProbes >= ENV_PROBE_TRIES) { _envGaveUp = true; envReady = false; }
            if (lit && lit.setEnvCube && envDummy) lit.setEnvCube(envDummy.texture);
            try {
              Log.warn("gfx", "[TLX] env probe discarded — GPU errors during capture",
                _gpuErrors - _envErrBase, "pass", _envBadProbes);
            } catch (_) {  }
          } else if (faceOk && envFacesMask === 63) {
            envFacesMask = 0; envReady = true; _envBlank = false; _envBadProbes = 0;
            _envMipFn = typeof renderer.generateMipmaps;
            const _mipVia = typeof renderer.generateMipmaps === "function"
              ? renderer
              : (renderer.backend && typeof renderer.backend.generateMipmaps === "function"
                 ? renderer.backend : null);
            _envMipWhere = _mipVia === renderer ? "renderer" : _mipVia ? "backend" : "none";
            if (_mipVia && envRT.texture) {
              try { _mipVia.generateMipmaps(envRT.texture); _envMipRan++; }
              catch (e) { _envMipErr = (e && e.message) || String(e); }
            }
            try { this.readEnvCube(); } catch (_) {  }
          }
          _restoreEnvFrame();
        },
        mirrorBegin(frame, w, h) {
          if (_softBlit && _softReadPending) return false;
          if (_mirDead || _warmPending || _envActive || !lit || !frame || !frame.proj || !frame.view || !frame.viewProj) return false;
          if (mirrorWarmGate()) return false;
          w = Math.max(16, Math.min(1024, w | 0)); h = Math.max(8, Math.min(512, h | 0));
          try {
            prepareMirrorTarget(w, h);
          } catch (e) {
            _mirDead = true; _mirErr = (e && e.message) || String(e);
            try { Log.warn("gfx", "TLX mirror target failed — mirror off:", _mirErr); } catch (_) {  }
            return false;
          }
          if (renderer.backend && renderer.backend.isWebGPUBackend) {
            _mul4Col(_mirProjGpu, Z01, frame.proj);
            mirCam.projectionMatrix.fromArray(_mirProjGpu);
            if (renderer.coordinateSystem != null) mirCam.coordinateSystem = renderer.coordinateSystem;
          } else mirCam.projectionMatrix.fromArray(frame.proj);
          mirCam.projectionMatrixInverse.copy(mirCam.projectionMatrix).invert();
          mirCam.matrixWorldInverse.fromArray(frame.view);
          mirCam.matrixWorld.copy(mirCam.matrixWorldInverse).invert();
          if (frame.eye) mirCam.position.set(frame.eye[0], frame.eye[1], frame.eye[2]);
          const z = frame.skyZenith || frame.fogColor;
          if (z && z.length >= 3) scene.background.setRGB(z[0], z[1], z[2]);
          lit.updateFrame(frame, true);
          if (fx) fx.updateFrame(frame);
          _mirVP.set(frame.viewProj); _mirEye = frame.eye || null; _mirCull = frame.cullDist || 0; _mirFog = frame.cullFog || null;
          scene.backgroundNode = null;
          resetRecs(); _dMatUsed = 0; _fxMatUsed = 0;
          _instStamp++;
          _mirActive = true;
          _mirUsed = true;
          return true;
        },
        mirrorEnd() {
          if (!_mirActive) return;
          _mirActive = false;
          try {
            _poolBatch++;
            _kidsBegin(_kidsMir);
            for (let i = 0; i < drawList.n; i++) {
              const rec = drawList[i];
              if (rec.instanced) { _showInstanced(rec, i); continue; }
              if (rec.chunked) { _drawChunked(rec, i, _mirVP, _mirEye, _mirCull, _mirFog, 1); continue; }
              if (rec.split && _drawSplit(rec, i, _mirVP, _mirEye, _mirCull, _mirFog)) continue;
              acquireMesh(rec.geo, rec.m, rec.mat, rec).renderOrder = i;
            }
            _poolShow();
            _hideUndrawnInstanced();
            pinSkyMaterial();
            renderer.setRenderTarget(mirRT);
            _gpuLastOperation = "render-mirror";
            const mrt = _mirMrt(), prevMrt = mrt ? renderer.getMRT() : null;
            if (mrt) _mirMrtArm(true);
            const hinted = !!(post && post.discardHint && post.discardHint(mirRT, mrt ? 2 : 0, true));
            try { renderer.render(scene, mirCam); } finally { if (mrt) _mirMrtArm(false, prevMrt); if (hinted) post.discardHintOff(mirRT); }
            if (hinted || (post && post.discardAttachments && post.discardAttachments(mirRT, _mirInv(mrt)))) _mirDiscards++;
            _mirRenders++;
            _mirFails = 0;
          } catch (e) {
            if (++_mirFails >= 4) _mirDead = true;
            if (!_mirErr) _mirErr = (e && e.message) || String(e);
          }
          try { renderer.setRenderTarget(softOutRT()); } catch (_) {  }
          resetRecs();
          _dMatUsed = 0; _fxMatUsed = 0;
          _poolBatch++;
        },
        mirrorRect(r, flip) { _mirRect = r && r.length === 4 ? _mirRectScratch : null; if (_mirRect) for (let i = 0; i < 4; i++) _mirRect[i] = +r[i] || 0; _mirFlip = flip !== false; },
        mirrorState() {
          return { ready: !!mirRT && _mirRenders > 0, dead: _mirDead, w: mirRT ? mirRT.width : 0, h: mirRT ? mirRT.height : 0,
            hdr: !!(mirRT && mirRT.texture.type !== THREE.UnsignedByteType), renders: _mirRenders, allocs: prepareMirrorTarget.allocs | 0,
            composites: post && post.mirrorComposites ? post.mirrorComposites() : 0, glass: _mirGlass, rect: _mirRect, flip: _mirFlip, error: _mirErr, discards: _mirDiscards,
            mips: mirRT ? _mirLevelsNow(mirRT.width, mirRT.height) : 0, mipCap: _mirMipCap, mipFull: _mirGlassSeen && !_mirMipPinned && !(_mirGlassLod < Infinity), glassLod: _mirGlassLod };
        },
        releaseMirror() {
          if (_mirActive || _warmPending) return false;
          if (!mirRT) return true;
          const t = mirRT.texture;
          try { if (post && post.releaseMirror) post.releaseMirror(); } catch (_) {  }
          try { if (fx && fx.releaseTexture) fx.releaseTexture(t); } catch (_) {  }
          try { mirRT.dispose(); } catch (_) {  }
          mirRT = null; mirCam = null; _mirRenders = 0;
          return true;
        },
        drawMirrorGlass(mesh, model, opts) {
          if (_mirActive || _mirDead || !mirRT || _mirRenders <= 0 || !_mirFlip || !fx || !fx.mirrorGlassMaterial
              || !mesh || !mesh.geo || !model) return false;
          pushRec(mesh.geo, poolModelMat(model), fx.mirrorGlassMaterial(mirRT.texture), undefined, undefined, 0, null, null);
          _mirGlass++;
          _mirGlassSeen = true;
          if (_mirGlassLod < Infinity && (_frameVP[11] !== 0 || _frameVP[15] !== 0)) {
            const g = mesh.geo, pa = g.attributes && g.attributes.position, ua = g.attributes && g.attributes.uv, st = post && post.sceneTarget ? post.sceneTarget() : null;
            const l = !pa || !pa.array || !ua || !ua.array || typeof PostCommon === "undefined" ? Infinity
              : PostCommon.mipFootprintLod(pa.array, ua.array, g.index && g.index.array, model, _frameVP,
                Math.min(W, st ? st.width : W), Math.min(H, st ? st.height : H), mirRT.width, mirRT.height);
            if (l < Infinity) { _mirGlassInf = 0; _mirGlassLod = Math.max(_mirGlassLod, l); }
            else if (++_mirGlassInf >= 2 || !(l === l) || !pa || !ua) _mirGlassLod = Infinity;
          }
          return true;
        },
        envProbeOptOut: _envOptOut,
        envProbeReady() { return envReady || _envGaveUp; },
        envProbeReset() {
          envFacesMask = 0; envReady = false; _envBlank = false;
          _envFailN = 0; _envFailMsg = ""; _envFailStack = ""; _envErrBase = -1;
          _envBadProbes = 0; _envGaveUp = false;
        },

        backendState() {
          const t = this && this.__tlx;
          return (t && typeof t.backendState === "function") ? t.backendState() : null;
        },
        ctxLost() {
          const t = this && this.__tlx;
          return !!(t && typeof t.ctxLost === "function" && t.ctxLost());
        },
        makeFrustumPlanes(viewProj, out) {
          return TLXShaders.makeFrustumPlanes(viewProj, out);
        },
        capturePixels() {
          const gl = ownGL || (renderer.backend && renderer.backend.gl) || null;
          if (gl && typeof gl.readPixels === "function") {
            return fixedActive() ? readGlCapture(gl, presentW, presentH) : readGlCapture(gl, W, H);
          }
          const rt = _captureRT();
          if (!rt || typeof renderer.readRenderTargetPixelsAsync !== "function") {
            return Promise.reject(new Error(
              "three.js WebGPU screenshot needs SCREENSHOTS: 2D BLIT (or AUTO on software)"));
          }
          return _readLdr(rt).then(function (pack) {
            return { width: pack.w, height: pack.h, data: new Uint8ClampedArray(pack.data) };
          });
        },
        awaitSoftPresent(timeoutMs) {
          if (!_softBlit) return arguments[1] === "frame" ? _awaitFrame(timeoutMs != null ? timeoutMs : 8000) : Promise.resolve(_softBlitGen);
          if (!_displayCtx) return Promise.reject(new Error("no display ctx"));
          const start = _softBlitGen;
          const ms = timeoutMs != null ? timeoutMs : 15000;
          return new Promise(function (resolve, reject) {
            let waiter = null;
            const timer = setTimeout(function () {
              const i = _softPresentWaiters.indexOf(waiter);
              if (i >= 0) _softPresentWaiters.splice(i, 1);
              reject(new Error("awaitSoftPresent timeout after " + ms + " ms"));
            }, ms);
            waiter = function (gen) {
              if (gen > start) {
                try { clearTimeout(timer); } catch (_) {  }
                resolve(gen);
                return true;
              }
              return false;
            };
            _softPresentWaiters.push(waiter);
          });
        },
        invalidateSoftPresent() { _cancelSoftBlits(); },
        softPresent() { return !!_softBlit; },
        setOutputTarget: undefined,
        clearOutputTarget: undefined,
        outputTargetState: undefined,
        setRenderSizeOverride: undefined,
        drainGpuErrors: undefined,
        softPresentState() {
          return {
            on: !!_softBlit,
            gen: _softBlitGen,
            submittedGen: _softSubmittedGen, shownGen: _softShownGen,
            pending: !!_softReadPending,
            lastMs: _softReadLastMs,
            lastErr: _softReadLastErr || null,
            display: _displayCanvas ? [_displayCanvas.width, _displayCanvas.height] : null,
          };
        },
        gpuErrors() { return _gpuErrors; },
        gpuFirstError() { return _gpuFirstError; },
        aabbInFrustum: (planes, mn, mx) => TLXShaders.aabbInFrustum(planes, mn, mx),
        aabbDist2: (mn, mx, ex, ey, ez) => TLXShaders.aabbDist2(mn, mx, ex, ey, ez),

        createInstancedBatch,
        cullInstances: (b, planes, opts) => cullInstances(opts && opts.upload === false ? b : _passBatch(b), planes, opts),
        updateInstances: (b, m, n, c) => updateInstances(_passBatch(b), m, n, c),
        drawInstanced: (b, opts) => drawInstanced(_passBatch(b), opts),
        instPerPass: _instPerPass,
        freeInstancedBatch,
        castShadowInstanced,
        warm(opts) {
          if (_deviceLost) return;
          if (!_warmPending) { _warmWhere = _resolveWarmWhere(opts); _warmRequested = true; _warmAttempts = 0; }
        },
        warming() { return !_deviceLost && !!_warmPending; },
        warmSettled() { return _warmPending || Promise.resolve(); },
        cancelWarmRetry() { _warmRequested = false; },
        warmQueued() { return !_deviceLost && !!_rigWarm && !_rigWarm.started; },
        primeChunkMerge() { _chunkPrime = true; return _chunkPrimeN; },
        warmDraws,
        _xrLayer: null,
        _xrSession: null,
        xrPresenting() { return !!(this._xrSession); },
        xrLayer() { return this._xrLayer; },
        xrCapable() {
          return !!(ownGL || (renderer && renderer.backend && renderer.backend.gl));
        },
        async attachXrSession(session) {
          const generation = this._xrAttachGeneration = (this._xrAttachGeneration || 0) + 1;
          const gl = ownGL || (renderer.backend && renderer.backend.gl) || null;
          if (!gl) throw new Error("TLX XR needs the WebGL2 backend (apex26.tlxForceGL=1)");
          if (typeof gl.makeXRCompatible === "function") {
            try { await gl.makeXRCompatible(); } catch (_) {  }
          }
          if (generation !== this._xrAttachGeneration) return null;
          if (typeof XRWebGLLayer === "undefined") throw new Error("XRWebGLLayer missing");
          const layer = new XRWebGLLayer(session, gl, { antialias: false, alpha: false });
          await session.updateRenderState({ baseLayer: layer });
          if (generation !== this._xrAttachGeneration) return null;
          this._xrLayer = layer;
          this._xrSession = session;
          _xrActive = true;
          if (layer.framebuffer == null) {
            try {
              const st = renderer.backend && renderer.backend.state;
              if (st && st.currentDrawbuffers instanceof WeakMap) {
                st.currentDrawbuffers = new Map();
                try { Log.info("gfx", "TLX XR: IWER null framebuffer — remapped currentDrawbuffers to Map"); } catch (_) {  }
              }
            } catch (_) {  }
            try {
              renderer.setPixelRatio(1);
              const fw = layer.framebufferWidth || (canvas && canvas.width) || 0;
              const fh = layer.framebufferHeight || (canvas && canvas.height) || 0;
              if (fw > 0 && fh > 0) renderer.setSize(fw, fh, false);
            } catch (_) {  }
          }
          try { Log.info("gfx", "TLX XRWebGLLayer attached"); } catch (_) {  }
          return layer;
        },
        detachXrSession() {
          this._xrAttachGeneration = (this._xrAttachGeneration || 0) + 1;
          this._xrLayer = null;
          this._xrSession = null;
          this._pendingXrEyes = null;
          _xrActive = false;
        },
        setFoveation(v) {
          if (!this._xrLayer || !("fixedFoveation" in this._xrLayer)) return false;
          const n = Math.max(0, Math.min(1, +v || 0));
          try { this._xrLayer.fixedFoveation = n; return true; } catch (_) { return false; }
        },
        getFoveation() {
          if (!this._xrLayer || !("fixedFoveation" in this._xrLayer)) return null;
          try { return this._xrLayer.fixedFoveation; } catch (_) { return null; }
        },
        xrInfo() {
          const r = renderer && renderer.info && renderer.info.render;
          if (!r) return { calls: null, triangles: null, points: null, lines: null };
          return { calls: r.calls, triangles: r.triangles, points: r.points, lines: r.lines };
        },
        _applyXrEye(eye) {
          if (!eye) return;
          const _wgpu = !!(renderer.backend && renderer.backend.isWebGPUBackend);
          if (eye.proj && eye.view) {
            if (_wgpu) {
              _mul4Col(_projGpu, Z01, eye.proj);
              camera.projectionMatrix.fromArray(_projGpu);
            } else {
              camera.projectionMatrix.fromArray(eye.proj);
            }
            camera.matrixWorldInverse.fromArray(eye.view);
            camera.matrixWorld.copy(camera.matrixWorldInverse).invert();
            camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
            if (eye.eye) camera.position.set(eye.eye[0], eye.eye[1], eye.eye[2]);
          }
        },
        presentXR(eyes, opts) {
          this._pendingXrEyes = eyes && eyes.length ? eyes : null;
          const savedPost = post;
          post = null;
          try { this.present(opts || {}); }
          finally { post = savedPost; this._pendingXrEyes = null; }
        },
        begin(frame) {
          _matFrame++;
          if (renderer.__apexPump) renderer.__apexPump.drain();
          resizeNow();
          _sizeOwned = true;
          if (_postRebuild && !post && !_warmPending
              && (typeof performance !== "undefined" ? performance.now() : Date.now()) >= _postRetryAt) {
            _postRebuild = false; post = buildPost(); if (post) post.resize(W, H, presentW, presentH);
            else postFailure("Post-processing reconstruction failed");
          }
          _tagSwap();
          _instStamp++;
          const z = frame && frame.skyZenith;
          const f = (z && z.length >= 3) ? z
            : ((frame && frame.fogColor) || [0.04, 0.04, 0.06]);
          scene.background.setRGB(f[0], f[1], f[2]);
          camera.matrixWorldAutoUpdate = false;
          const _wgpu = !!(renderer.backend && renderer.backend.isWebGPUBackend);
          if (frame && frame.proj && frame.invProj && frame.viewProj) {
            if (_wgpu) {
              _mul4Col(_projGpu, Z01, frame.proj);
              camera.projectionMatrix.fromArray(_projGpu);
              if (renderer.coordinateSystem != null) camera.coordinateSystem = renderer.coordinateSystem;
            } else {
              camera.projectionMatrix.fromArray(frame.proj);
            }
            if (frame.view && frame.view.length >= 16) {
              camera.matrixWorldInverse.fromArray(frame.view);
              camera.matrixWorld.copy(camera.matrixWorldInverse).invert();
            } else {
              _tmpMat4.fromArray(frame.invProj);
              _tmpMat4b.fromArray(frame.viewProj);
              camera.matrixWorldInverse.multiplyMatrices(_tmpMat4, _tmpMat4b);
              camera.matrixWorld.copy(camera.matrixWorldInverse).invert();
            }
          } else if (frame && frame.viewProj) {
            if (_wgpu) {
              _mul4Col(_vpGpuTlx, Z01, frame.viewProj);
              camera.projectionMatrix.fromArray(_vpGpuTlx);
              if (renderer.coordinateSystem != null) camera.coordinateSystem = renderer.coordinateSystem;
            } else {
              camera.projectionMatrix.fromArray(frame.viewProj);
            }
            camera.matrixWorldInverse.identity();
            camera.matrixWorld.identity();
          }
          camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
          if (frame && frame.eye) camera.position.set(frame.eye[0], frame.eye[1], frame.eye[2]);
          if (lit && frame) {
            lit.updateFrame(frame);
            if (lit.setEnvStr) {
              const _T = frame.tune;
              const _envOn = envRT && envReady && !_envBlank && !frame.noEnv && !_envActive;
              lit.setEnvStr(_envOn ? (_T && _T.carEnvCube != null ? _T.carEnvCube : 0) : 0);
            }
          }
          if (fx && frame) fx.updateFrame(frame);
          frameEye = (frame && frame.eye) || null;
          if (frame && frame.viewProj) _frameVP.set(frame.viewProj);
          frameCullDist = (frame && frame.cullDist) || 0;
          frameCullFog = (frame && frame.cullFog) || null;
          frameAllLights = (frame && frame.allLights) || null;
          frameAllLightsGen = frame && frame.allLightsGen != null ? +frame.allLightsGen : -1;
          framePerChunk = +(frame && frame.perChunkLights) || 0;
          if (lit && lit.uniforms && lit.uniforms.lgRoad)
            lit.uniforms.lgRoad.value = (framePerChunk > 0 && +(frame && frame.roadChunkLamps) > 0) ? 1.0 : 0.0;
          _postF.proj = (frame && frame.proj) || null;
          _postF.noEnv = !!(frame && frame.noEnv);
          _postF.invProj = (frame && frame.invProj) || null;
          _postF.invVP = (frame && frame.invViewProj) || null;
          _postF.sunVS = (frame && frame.sunViewDir) || null;
          _postF.upVS = (frame && frame.upViewDir) || null;
          _postF.skyHi = (frame && frame.skyHorizon) || null;
          _postF.skyLo = (frame && frame.skyZenith) || null;
          _postF.viewProj = (frame && frame.viewProj) ? _frameVP : null;
          _postF.sunDir = (frame && frame.sunDir) || null;
          _postF.sunColor = (frame && frame.sunColor) || null;
          _postF.eye = (frame && frame.eye) || null;
          _postF.time = (frame && frame.time != null) ? frame.time : 0;
          _postF.cloud = (frame && frame.cloud != null) ? frame.cloud : 0;
          _postF.cloudSpeed = (frame && frame.cloudSpeed != null) ? frame.cloudSpeed : 1;
          _postF.lights = (frame && frame.lights) || null;
          _chunkFrame.total = 0; _chunkFrame.visible = 0;
          _fxMatUsed = 0;
          _fxFrame.shadows = 0; _fxFrame.marks = 0; _fxFrame.skidVerts = 0;
          _fxFrame.glow = 0; _fxFrame.particles = 0; _fxFrame.decals = 0; _fxFrame.lineVerts = 0;
          scene.backgroundNode = null;
          hideSkyMesh();
          resetRecs();
          _dMatUsed = 0;
          return true;
        },
        drawSky(frameSky) {
          if (!sky || !frameSky) return;
          sky.update(frameSky);
          const z = frameSky.zenith || frameSky.skyZenith;
          if (z && z.length >= 3) scene.background.setRGB(z[0], z[1], z[2]);
          scene.backgroundNode = null;
          armSkyMesh(!!(softContent("sky") && sky.fallbackNode));
        },
        draw(mesh, model, opts) {
          if (opts && opts.coalesce && mesh && mesh.geo && _coAppend(mesh.geo, model, opts)) return;
          if (_capture) { _captureRec(mesh, model, opts); return; }
          if (mesh && mesh.geo) pushRec(mesh.geo, poolModelMat(model), materialFor(opts, false, undefined, fxFor(mesh.geo, opts)), drawEm(opts), drawAl(opts),
            opts && opts.surfaceId === 16 ? 1 : 0, null, null);
        },
        drawChunked(mesh, model, opts) {
          if (!mesh) return;
          if (mesh.chunks && chunkedSys) {
            pushRec(null, poolModelMat(model), materialFor(opts, true), drawEm(opts), drawAl(opts), 0, mesh, null);
          } else if (mesh.geo) {
            pushRec(mesh.geo, poolModelMat(model), materialFor(opts, true), drawEm(opts), drawAl(opts), 0, null, null);
          }
        },
        drawShadow(modelMat, w, l) {
          if (!fx || !modelMat) return;
          _fxFrame.shadows++;
          if (_blobAppend(modelMat, w, l)) return;
          pushRec(getFxQuad(), fxMatFor(modelMat, w, l), fx.shadowMat, undefined, undefined, 0, null, null);
        },
        drawMark(modelMat, w, l) {
          if (!fx || !modelMat) return;
          pushRec(getFxQuad(), fxMatFor(modelMat, w, l), fx.markMat, undefined, undefined, 0, null, null);
          _fxFrame.marks++;
        },
        drawSkidBatch(verts, vertCount, dirty) {
          if (!fx || !verts || !(vertCount > 0)) return true;
          const fresh = ensureStream(skidStream, vertCount);
          if (dirty || fresh) {
            skidStream.ib.array.set(verts.length <= vertCount * 5 ? verts : verts.subarray(0, vertCount * 5));
            uploadStream(skidStream, vertCount * 5);
          }
          skidStream.geo.setDrawRange(0, vertCount);
          pushRec(skidStream.geo, null, fx.skidMat, undefined, undefined, 0, null, null);
          _fxFrame.skidVerts = vertCount;
          return true;
        },
        drawDrivingLine(verts, vertCount, dirty, opts) {
          if (!fx || !fx.lineMat || !verts || !(vertCount > 0)) return false;
          const fresh = ensureStream(lineStream, vertCount);
          if (dirty || fresh) {
            lineStream.ib.array.set(verts.length <= vertCount * 7 ? verts : verts.subarray(0, vertCount * 7));
            uploadStream(lineStream, vertCount * 7);
            const tris = Math.max(0, vertCount - 2);
            lineIndex(lineStream);
            lineStream.geo.setDrawRange(0, tris * 3);
          }
          fx.lineSpeed.value = (opts && opts.speed) || 0;
          fx.lineCorners.value = opts && opts.cornersOnly ? 1 : 0;
          fx.lineStr.value = 1.6;
          const lc = (opts && opts.cols) || LINE_COLS_F1;
          fx.lineOnPace.value.set(lc[0], lc[1], lc[2]);
          fx.lineLift.value.set(lc[3], lc[4], lc[5]);
          fx.lineBrake.value.set(lc[6], lc[7], lc[8]);
          fx.lineOpacity.value = (opts && opts.opacity) || 1;
          pushRec(lineStream.geo, null, fx.lineMat, undefined, undefined, 0, null, null);
          _fxFrame.lineVerts = vertCount;
          return true;
        },
        drawGlow(lights, str) {
          if (!fx || !lights || !lights.length || !(str > 0)) return;
          const nL = (lights.length / 15) | 0;
          ensureGlowStream(nL);
          const out = glowStream.ib.array;
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
            out[p++] = cx; out[p++] = cy; out[p++] = cz;
            out[p++] = r; out[p++] = g; out[p++] = b;
            out[p++] = brad;
            nDraw++;
          }
          glowStream.geo.instanceCount = nDraw;
          if (!nDraw) return;
          fx.glowStr.value = str;
          uploadStream(glowStream, p);
          glowStream.geo.setDrawRange(0, 6);
          pushRec(glowStream.geo, null, fx.glowMat, undefined, undefined, 0, null, null);
          _fxFrame.glow = nDraw;
        },
        drawParticles(data, floatCount, additive, dirty) {
          if (!fx || !(floatCount > 0) || !frameEye) return;
          if (dirty !== false && !data) return;
          const slot = partStreams[additive ? 1 : 0];
          const verts = (floatCount / 10) | 0;
          const wrap = !!(data && data instanceof Float32Array && data.length >= floatCount
            && data.length % slot.stride === 0 && _wrapPart);
          const fresh = wrap ? wrapStream(slot, data) : ensureStream(slot, verts);
          if (!data) return;
          let epoch = _partEpochs.get(data);
          if (!epoch || dirty !== false) { epoch = ++_partEpoch; _partEpochs.set(data, epoch); }
          if (fresh || slot.payload !== data || slot.epoch !== epoch || slot.payloadCount !== floatCount) {
            slot.payload = data; slot.epoch = epoch; slot.payloadCount = floatCount;
            if (slot.ib.array !== data) slot.ib.array.set(data.length <= floatCount ? data : data.subarray(0, floatCount));
            uploadStream(slot, floatCount);
          }
          slot.geo.setDrawRange(0, verts);
          pushRec(slot.geo, null, fx.particleMats[additive ? 1 : 0], undefined, undefined, 0, null, null);
          _fxFrame.particles += verts / 6;
        },
        drawDecal(mesh, modelMat, tex, opts) {
          if (!fx || !mesh || !mesh.geo || !tex || !tex.tex || !modelMat) return;
          const mat = fx.decalMaterialFor(tex.tex, (opts && opts.glow) || 0);
          _fxFrame.decals++;
          if (opts && opts.batch && _decalAppend(mesh.geo, modelMat, mat)) return;
          pushRec(mesh.geo, fxMatFor(modelMat, 1, 1), mat, undefined, undefined, 0, null, null);
        },
        decalRuns: true,
        get coalesce() { return _coOn && !skipBatches(); },
        present(opts) {
          _poolBatch++;
          _kidsBegin(_kidsMain);
          _chunkPrimeNow = _chunkPrime; _chunkPrime = false;
          _poolNow = typeof performance !== "undefined" ? performance.now() : Date.now();
          prunePool(_poolNow);
          flushDropped();
          if (shadowSys && shadowSys.flushDropped) shadowSys.flushDropped();
          if (lit && lit.setLampGrid) {
            const AL = frameAllLights;
            const knob = framePerChunk;
            let total = 0, nrec = 0, cell = 0, cellSplit = false, first = null;
            for (let k = 0; k < drawList.length; k++) {
              const ck = drawList[k].chunked;
              if (!ck || !ck.chunks || !ck.chunks.length) continue;
              if (!first) first = ck.chunks;
              nrec++; total += (ck.lampCells || ck.chunks).length;
              const c = ck.cellSize > 0 ? ck.cellSize : 72;
              if (cell && c !== cell) cellSplit = true;
              cell = c;
            }
            if (!AL || !(knob > 0) || !total || cellSplit) {
              if (_lgKey !== "off") { lit.setLampGrid(null); _lgKey = "off"; }
              if (first !== _lgChsFirst) _lgChs = _lgChsFirst = _lgChunks = _lgSrc = null;
              const lamps = AL ? (AL.length / 15) | 0 : 0;
              const why = cellSplit ? "chunked records disagree on cellSize"
                : !(knob > 0) ? "knob is 0"
                : !AL ? "no baked lamp set" : "no chunked geometry";
              const st = _lampGridState;
              if (!st || st.on || st.lamps !== lamps || st.chunks !== total || st.idx !== 0 || st.why !== why)
                _lampGridState = { on: false, lamps, chunks: total, idx: 0, why };
            } else {
              const kp = _lgKP, kCap = LampChunks.capFor(knob), kGen = typeof LampBake !== "undefined" ? LampBake.gen() : 0;
              if (kp[0] !== kCap || kp[1] !== total || kp[2] !== nrec || kp[3] !== cell || kp[4] !== kGen) {
                kp[0] = kCap; kp[1] = total; kp[2] = nrec; kp[3] = cell; kp[4] = kGen;
                kp.str = kCap + "|" + total + "|" + nrec + "|" + cell + "|" + kGen;
              }
              const key = kp.str;
              if (_lgKey !== key || _lgSrc !== AL || _lgChunks !== first) {
                let note;
                try {
                  if (!_lgChs || _lgChsFirst !== first || _lgChsTotal !== total || _lgChsNrec !== nrec) {
                    const fresh = [];
                    for (let k = 0; k < drawList.length; k++) {
                      const ck = drawList[k].chunked;
                      if (!ck || !ck.chunks || !ck.chunks.length) continue;
                      const cells = ck.lampCells || ck.chunks;
                      for (let j = 0; j < cells.length; j++) fresh.push(cells[j]);
                    }
                    _lgChs = fresh; _lgChsFirst = first; _lgChsTotal = total; _lgChsNrec = nrec;
                  }
                  const chs = _lgChs;
                  const table = LampChunks.resolve(AL, chs, knob);
                  const grid = LampChunks.buildGrid(table, chs);
                  const okG = lit.setLampGrid({ lights: AL, table, grid, cell });
                  _lampGridState = { on: !!okG, lamps: (AL.length / 15) | 0,
                                     chunks: chs.length, recs: nrec, idx: (grid.concat || table.concat).length,
                                     gw: grid.gw, gh: grid.gh, cell,
                                     why: okG ? null : "does not fit the fixed textures" };
                  note = "TLX per-chunk lamps " + (okG ? "ON" : "REFUSED")
                    + " lamps=" + _lampGridState.lamps + " chunks=" + chs.length
                    + " recs=" + nrec + " idx=" + (grid.concat || table.concat).length
                    + " grid=" + grid.gw + "x" + grid.gh;
                } catch (e) {
                  lit.setLampGrid(null);
                  _lampGridState = { on: false, why: String(e).slice(0, 120) };
                  note = "TLX per-chunk lamp bake failed - " + e;
                }
                try { Log.info("gfx", note); } catch (_) {}
                _lgKey = key; _lgSrc = AL; _lgChunks = first; _lgGen = frameAllLightsGen;
              } else if (_lgGen !== frameAllLightsGen && lit.setLampGridColors) {
                lit.setLampGridColors(AL);
                _lgGen = frameAllLightsGen;
              }
            }
          }

          for (let i = 0; i < drawList.n; i++) {
            const rec = drawList[i];
            if (rec.instanced) {
              _showInstanced(rec, i);
              continue;
            }
            if (rec.chunked) {
              const n = _drawChunked(rec, i, _frameVP, frameEye, frameCullDist, frameCullFog, 0);
              _chunkFrame.total += rec.chunked.chunks.length;
              _chunkFrame.visible += n;
              if (n > 0 && !rec.chunked._mirrorsFreed && !vizMat
                && (_chunkRelOptIn || envReady || _envGaveUp) && !_mirUsed)
                _mirrorRelease.push(rec.chunked);
              continue;
            }
            if (rec.split && _drawSplit(rec, i, _frameVP, frameEye, 0, null)) continue;
            acquireMesh(rec.geo, rec.m, rec.mat, rec).renderOrder = i;
          }
          _poolShow();
          _hideUndrawnInstanced();
          if (_lite) liteOpts(opts);
          if (_swRaceShed && _postF.proj && !_postF.noEnv && !_warmPending) pinSoftwareRaceShed(opts);
          if (_rigWarm && !_rigWarm.started) _rigWarm.seen++;
          if (!_warmPending && !_deviceLost) { if (_warmRequested) startProgramWarm(opts); else if (_mirWarmReq) startMirrorWarm(opts); else if (_rigWarm) startRigWarm(); }
          if (_warmPending) return;
          let painted = false;
          try {
            if (_softBlit && _softReadPending
                && ((typeof performance !== "undefined" ? performance.now() : Date.now()) - _softReadSince) <= _softReadStaleMs()) {
              painted = true;
            } else if (post && _postF.proj && !_postF.noEnv) {
              pinSkyMaterial();
              skyCacheStep();
              const _tag = !post.tagOn || post.tagOn();
              if (_tag && lit && lit.setSsrMrt) lit.setSsrMrt(true);
              if (_tag && fx && fx.setSsrMrt) fx.setSsrMrt(true);
              const _hadMrt = _tag && !!(TSL.mrt && renderer.setMRT);
              const _prevMrt = _hadMrt && renderer.getMRT ? renderer.getMRT() : null;
              if (_hadMrt) renderer.setMRT(_ssrMrtNode());
              if (post.setMirror) {
                const up = wantSpatialUpscale(), ok = !!(_mirRect && mirRT && _mirRenders > 0 && !_mirDead);
                post.setMirror(ok ? mirRT.texture : null, ok ? _mirPx(up ? presentW : W, up ? presentH : H) : null, ok && mirRT.texture.type !== THREE.UnsignedByteType, _mirFlip);
              }
              try {
                renderer.setRenderTarget(post.sceneTarget());
                _gpuLastOperation = "render-scene";
                if (post.depthBegin) post.depthBegin(opts, _postF);
                _renderTimed(scene, camera);
                if (post.depthEnd) post.depthEnd();
                _gpuLastOperation = "render-post";
                post.present(opts, _postF);
                if (_postHealth.state !== "healthy" || _postHealth.attempts !== _postStrikes) {
                  _postHealth = { state: "healthy", attempts: _postStrikes, maxAttempts: 3, reason: "" };
                }
              } finally {
                if (post.discardHintOff) post.discardHintOff();
                if (lit && lit.setSsrMrt) lit.setSsrMrt(false);
                if (fx && fx.setSsrMrt) fx.setSsrMrt(false);
                if (_hadMrt) renderer.setMRT(_prevMrt || null);
              }
              if (_softBlit && post.presentedTarget) _queueSoftBlit(post.presentedTarget());
            } else {
              paintCanvas(this);
            }
            painted = true;
          } catch (e) {
            if (!nullMirrorSkip(e)) persistFail(e, !!post);
            else painted = true;
          }
          if (!painted && post) {
            const deadPost = post;
            post = null;
            _cancelSoftBlits();
            _postRebuild = ++_postStrikes <= 3;
            postFailure("Post-processing presentation failed");
            _postRetryAt = (typeof performance !== "undefined" ? performance.now() : Date.now()) + 2000;
            try { paintCanvas(this); painted = true; } catch (e) { persistFail(e); }
            finally {
              try { if (deadPost.dispose) deadPost.dispose(); } catch (_) {  }
            }
          }
          if (!painted) {
            dropTo(1, unlitMat);
            try { paintCanvas(this); painted = true; } catch (e) { persistFail(e); }
          }
          if (!painted) {
            dropTo(2, rawUnlitMat);
            try { paintCanvas(this); painted = true; }
            catch (e) { if (nullMirrorSkip(e)) painted = true; else { persistFail(e); refuseTab(); } }
          }
          _presentN++;
          _presentMs += (_presentAcc - _presentMs) * 0.1; _presentAcc = 0;
          if (painted && _frameWaiters.length) _frameWaiters.splice(0).forEach((w) => w());
          if (painted && !_healTried && _gpuErrFrames >= HEAL_MIN_FRAMES && _presentN <= HEAL_WINDOW
              && renderer.backend && renderer.backend.isWebGPUBackend
              && _glPin !== "0" && _glPin !== "1" && !_forceHw.on && !_softBlit) {
            _healTried = true;
            try {
              const n = GfxEscalation.reloadCount() + 1;
              if (n <= 2) {
                GfxEscalation.nextReloadCount();
                sessionStorage.setItem("apex26.tlxAutoGL", "1");
                _latchWebKitGL("GPU errors in the first " + _presentN + " frames");
                try { localStorage.setItem("apex26.gfxTlxFail", "WebGPU rejected work in the first " + _presentN + " frames (" + String(_gpuFirstError || "gpu error").slice(0, 160) + ") — AUTO takes three WebGL2"); } catch (_) {  }
                try { Log.warn("gfx", "TLX: " + _gpuErrors + " GPU error(s) in the first " + _presentN + " frames — reloading on three WebGL2:", _gpuFirstError); } catch (_) {  }
                setTimeout(function () { try { location.reload(); } catch (_) {  } }, 300);
              }
            } catch (_) {  }
          }
          _chunkLast.total = _chunkFrame.total; _chunkLast.visible = _chunkFrame.visible;
          _mirrorStat.chunks += _mirrorRelease.length;
          for (let i = 0; i < _mirrorRelease.length; i++) chunkedSys.releaseMirrors(_mirrorRelease[i]);
          _mirrorRelease.length = 0;
          const _now = typeof performance !== "undefined" ? performance.now() : Date.now();
          const _sweepOptIn = _mirrorSweepOptIn;
          pruneGeoRegistry(_now);
          _mirrorStat.drains++;
          const _gb = (envReady ? 1 : 0) | (_envGaveUp ? 2 : 0) | (envRT ? 4 : 0) | (_sweepOptIn ? 8 : 0);
          if (_gb !== _mirrorStat.gateBits) {
            _mirrorStat.gateBits = _gb;
            _mirrorStat.gate = (envReady ? "R" : "-") + (_envGaveUp ? "G" : "-")
                             + (envRT ? "T" : "-") + (_sweepOptIn ? "S" : "-");
          }
          if (_sweepOptIn && !_mirUsed) sweepGeoMirrors(_now);
          sweepCarShadowMirrors(_now);
          for (let i = 0; i < _matDispose.length; i++) { try { _matDispose[i].dispose(); } catch (_) {  } }
          _matDispose.length = 0;
          if (_dropLater.length) flushDropLater(false);
          if (fx && fx.flushEvicted) fx.flushEvicted();
          if (_texPool.length) ageTexPool(_now);
          _fxLast.shadows = _fxFrame.shadows; _fxLast.marks = _fxFrame.marks;
          _fxLast.skidVerts = _fxFrame.skidVerts; _fxLast.glow = _fxFrame.glow;
          _fxLast.particles = _fxFrame.particles; _fxLast.decals = _fxFrame.decals;
          resetRecs();
          _dMatUsed = 0;
          if (shadowSys) shadowSys.clearArmed();
          resolveGpuTimer();
        },

        __tlx: {
          renderer, THREE, TSL,
          get lit() { return lit; },
          get shadow() { return shadowSys; },
          get sky() { return sky; },
          get fx() { return fx; },
          get post() { return post; },
          postState() {
            if (!post) return { on: false, hdr: false, blocks: {}, targets: [0, 0] };
            return post.state();
          },
          fxState() {
            return {
              on: !!fx,
              shadows: _fxLast.shadows, marks: _fxLast.marks,
              skidVerts: _fxLast.skidVerts, glow: _fxLast.glow,
              particles: _fxLast.particles, decals: _fxLast.decals,
            };
          },
          clearFxState() {
            _fxLast.shadows = 0; _fxLast.marks = 0; _fxLast.skidVerts = 0;
            _fxLast.glow = 0; _fxLast.particles = 0; _fxLast.decals = 0;
            _fxFrame.shadows = 0; _fxFrame.marks = 0; _fxFrame.skidVerts = 0;
            _fxFrame.glow = 0; _fxFrame.particles = 0; _fxFrame.decals = 0;
            if (post && typeof post.clearLast === "function") post.clearLast();
          },
          skyState() {
            return {
              on: !!(sky && skyMesh && skyMesh.visible),
              fallback: !!(skyMesh && skyMatFallback && skyMatFallback !== skyMatFull && skyMesh.material === skyMatFallback),
              stars: sky ? sky.uniforms.stars.value : -1,
              cloud: sky ? sky.uniforms.cloud.value : -1,
              sunDir: sky ? sky.uniforms.sunDir.value.toArray() : null,
              cache: sky && sky.cacheState ? sky.cacheState() : null,
            };
          },
          chunkState() {
            return { on: !!chunkedSys, total: _chunkLast.total, visible: _chunkLast.visible };
          },
          roadSplit(on) {
            if (on !== undefined) {
              _roadSplitOn = !!on;
              try { if (_roadSplitOn) localStorage.removeItem("apex26.tlxRoadSplit"); else localStorage.setItem("apex26.tlxRoadSplit", "0"); } catch (_) {  }
            }
            return _roadSplitOn;
          },
          geoCensus() {
            const seen = new Set(), out = { live: 0, dead: 0, byAttr: {}, byKind: {}, zeroMB: 0, totalMB: 0 };
            for (let ri = _geoReg.length - 1; ri >= 0; ri--) {
              const ref = _geoReg[ri];
              const g = ref.deref ? ref.deref() : null;
              if (!g) { out.dead++; _geoReg.splice(ri, 1); continue; }
              out.live++;
              const kind = g.__tlxKind || "?";
              const k = out.byKind[kind] || (out.byKind[kind] = { n: 0, mb: 0 });
              k.n++;
              const put = (name, a) => {
                if (!a || !a.array) return;
                const b = a.array.buffer;
                if (seen.has(b)) return;
                seen.add(b);
                const mb = a.array.byteLength / 1048576;
                out.byAttr[name] = +(((out.byAttr[name] || 0) + mb)).toFixed(3);
                out.totalMB += mb; k.mb += mb;
                let z = a.array.length > 0;
                for (let i = 0; i < a.array.length; i++) { if (a.array[i] !== 0) { z = false; break; } }
                if (z) { out.zeroMB += mb; out.byAttr[name + ":zero"] = +(((out.byAttr[name + ":zero"] || 0) + mb)).toFixed(3); }
              };
              for (const name in g.attributes) put(name, g.attributes[name]);
              put("index", g.index);
            }
            out.totalMB = +out.totalMB.toFixed(2); out.zeroMB = +out.zeroMB.toFixed(2);
            try { const ps = TLXShaders.packStats;
              out.pack = { small: ps.small, wide: ps.wide, zero: ps.zero, savedMB: +ps.savedMB.toFixed(2),
                half: ps.half, wideBy: ps.wideBy, wideMax: ps.wideMax, wideLen: ps.wideLen };
            } catch (_) { out.pack = null; }
            for (const kk in out.byKind) out.byKind[kk].mb = +out.byKind[kk].mb.toFixed(2);
            return out;
          },
          meshState() {
            return { mesh: _meshMade.mesh, chunked: _meshMade.chunked, tex: _meshMade.tex,
                     texMade: _texStat.made, texReused: _texStat.reused, texRetired: _texStat.retired,
                     texDisposed: _texStat.disposed, texPooled: _texPool.length };
          },
          coState() {
            let runs = 0, shown = 0;
            for (const pair of _coRuns.values()) for (const b of pair) if (b) { runs++; if (b.imesh.visible) shown++; }
            return { on: _coOn && !skipBatches(), runs, shown, recs: _coStat.recs, inst: _coStat.inst, fall: _coStat.fall };
          },
          lumaDbg() {
            const half = function (h) {
              const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
              if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
              if (e === 31) return f ? NaN : s * Infinity;
              return s * Math.pow(2, e - 15) * (1 + f / 1024);
            };
            const read = function (rt, label) {
              if (!rt) return Promise.resolve({ label, err: "no rt" });
              const w = rt.width, h = rt.height;
              const isHalf = rt.texture && rt.texture.type === THREE.HalfFloatType;
              if (rt.texture && rt.texture.type === THREE.UnsignedInt101111Type) return Promise.resolve({ label, err: "rg11b10 target: this probe decodes half/byte only (apex26.tlxScene11=0 for a reading)" });
              return renderer.readRenderTargetPixelsAsync(rt, 0, 0, w, h).then(function (src) {
                const bpp = isHalf ? 8 : 4;
                const bpr = 256 * Math.ceil((w * bpp) / 256), stride = bpr / (isHalf ? 2 : 1);
                const tight = src.length < (h - 1) * stride + w * 4;
                let sum = 0, mx = 0, n = 0;
                for (let y = 0; y < h; y++) {
                  const row = tight ? y * w * 4 : y * stride;
                  for (let x = 0; x < w; x++) {
                    const i = row + x * 4;
                    const r = isHalf ? half(src[i]) : src[i];
                    const g = isHalf ? half(src[i + 1]) : src[i + 1];
                    const b = isHalf ? half(src[i + 2]) : src[i + 2];
                    const v = (r + g + b) / 3;
                    if (!isFinite(v)) continue;
                    sum += v; if (v > mx) mx = v; n++;
                  }
                }
                return { label, w, h, type: isHalf ? "half" : "byte",
                         mean: +(sum / (n || 1)).toFixed(3), max: +mx.toFixed(3), arr: src.constructor.name };
              }).catch(function (e) { return { label, err: String(e && e.message).slice(0, 80) }; });
            };
            return Promise.all([
              read(post && post.sceneTarget && post.sceneTarget(), "sceneRT (post IN, HDR world)"),
              read(post && post.ldrTarget && post.ldrTarget(), "ldrRT (post OUT)"),
              read(_captureRT(), "captureRT (what capturePixels reads)"),
            ]);
          },
          envState() {
            let face = 0;
            while (face < 6 && (envFacesMask & (1 << face))) face++;
            return {
              on: !!envRT, face, size: ENV_SIZE, ready: envReady, blank: _envBlank,
              mask: envFacesMask, begins: _envBegins, ends: _envEnds,
              fail: _envFailN, failMsg: _envFailMsg,
              mipFn: _envMipFn, mipRan: _envMipRan, mipErr: _envMipErr, mipWhere: _envMipWhere,
              cube: _envCube,
              badProbes: _envBadProbes, gaveUp: _envGaveUp,
            };
          },
          envFailStack() { return _envFailStack; },
          viz: vizMode,
          ctxLost() { return !!_deviceLost; },
          swRaceShed(on) { setSwRaceShed(on); },
          backendState() {
            return {
              api: (renderer.backend && renderer.backend.isWebGPUBackend) ? "webgpu" : "webgl2",
              forceWebGL, initSwapGL: _initSwapGL, pin: _glPin, autoStayGL: _autoStayGL, webkitStayGL: _webkitStayGL, hasGpu: _hasGpu,
              gpuAdapterOk: _gpuAdapterOk, gpuCanvasOk: _gpuCanvasOk,
              canvasAlpha: (function () {
                try {
                  const g = renderer.backend && renderer.backend.gl;
                  if (g && g.getContextAttributes) return !!g.getContextAttributes().alpha;
                } catch (_) {  }
                return null;
              })(),
              isMobile, mobileTier, isWebKit, liteGpu: _liteGpu, liteLab: !!_lite,
              softwareGL, softwareRaceShed: _swRaceShed, softAdapter: _softAdapter, headless: _headless,
              forceHw: _forceHw.on, forceBatches: _forceBatches,
              skipBatches: skipBatches(), skipBatchesPin: _skipBatchesPin,
              gpuErrFrames: _gpuErrFrames,
              envFail: _envFailN, envFailMsg: _envFailMsg,
              softBlit: _softBlit, capPref: _capPref,
              fx: { shadows: _fxFrame.shadows, marks: _fxFrame.marks, skidVerts: _fxFrame.skidVerts, glow: _fxFrame.glow,
                    particles: _fxFrame.particles, decals: _fxFrame.decals, lineVerts: _fxFrame.lineVerts || 0 },
              line: _lineDiag(),
              softRead: { gen: _softBlitGen, lastMs: Math.round(_softReadLastMs), fails: _softReadFails,
                          lastErr: _softReadLastErr, abandoned: _softReadAbandoned, pending: _softReadPending },
              gpuErrors: _gpuErrors, gpuFirstError: _gpuFirstError,
              gpuRecentErrors: _gpuRecentErrors.map(e => ({ ...e, lastResize: e.lastResize && { ...e.lastResize } })),
              presents: _presentN, healed: _healTried,
              ctxLost: !!_deviceLost,
              calls: (renderer && renderer.info && renderer.info.render) ? (renderer.info.render.drawCalls | 0) : null,
              arrayNearest: _arrayNearest,
              hasMaterialMaps: !!(lit && lit.hasMaterialMaps),
              packLive: !!matOwnedAlbedo,
              drawMatMode: _drawMatMode,
            };
          },
          materialCacheSize() { return matCache.size; },
          matKeyOf(m) { for (const [k, v] of matCache) if (v === m) return k; return null; },
          memState() {
            const o = { mats: matCache.size, pool: meshPool.length, draws: drawList.n,
                        geoKeys: meshByGeo.size, batch: _poolBatch,
                        dropLater: { now: _dropLater.length, held: _dropStat.held, overflow: _dropStat.overflow },
                        churn: { poolNew: acquireMesh.n | 0, poolPruned: prunePool.n | 0, softReads: _softBlitGen,
                                 streamNew: [skidStream, lineStream, glowStream, ...partStreams].reduce((n, s) => n + (s.builds | 0), 0) },
                        mirror: { sweeps: _mirrorStat.sweeps, geos: _mirrorStat.geos,
                                  freedMB: _mirrorStat.freedMB, drains: _mirrorStat.drains,
                                  chunks: _mirrorStat.chunks, gate: _mirrorStat.gate,
                                  carSh: _mirrorStat.carSh, repaired: _mirrorStat.repaired } };
            try {
              const inf = renderer && renderer.info;
              if (inf) {
                o.progs = inf.memory && typeof inf.memory.programs === "number" ? inf.memory.programs : null;
                if (inf.memory) {
                  o.rGeo = inf.memory.geometries; o.rTex = inf.memory.textures;
                  o.resources = {};
                  for (const key of ["total", "geometries", "textures", "texturesSize", "programs", "programsSize",
                    "attributes", "attributesSize", "indexAttributes", "indexAttributesSize", "storageAttributes", "storageAttributesSize",
                    "indirectStorageAttributes", "indirectStorageAttributesSize", "readbackBuffers", "readbackBuffersSize",
                    "renderTargets", "uniformBuffers", "uniformBuffersSize"]) {
                    if (typeof inf.memory[key] === "number") o.resources[key] = inf.memory[key];
                  }
                  o.rUbo = inf.memory.uniformBuffers;
                  o.rUboKB = inf.memory.uniformBuffersSize != null ? +(inf.memory.uniformBuffersSize / 1024).toFixed(1) : null;
                  const ro = renderer._objects && renderer._objects._renderObjects;
                  o.rObj = ro && typeof ro.size === "number" ? ro.size : null;
                }
                if (inf.render) { o.calls = inf.render.calls; }
              }
            } catch (_) {  }
            try { const g = lit && lit.uniforms && lit.uniforms.sunDir && lit.uniforms.sunDir.groupNode; o.groupVer = g ? g.version : null; } catch (_) { o.groupVer = null; }
            o.sharedUniforms = !!(lit && lit.sharedUniforms);
            o.matHit = _matHit; o.matMiss = _matMiss; o.matEvict = _matEvict;
            o.matMissKeys = _matMissLog.slice(-16);
            o.presentMs = +_presentMs.toFixed(3);
            o.warm = { where: _warmWhere, at: _warmStages.at, scene: _warmStages.scene, fx: _warmStages.fx, lateLayouts: _warmStages.lateLayouts, post: _warmStages.post, shadow: _warmStages.shadow, mirror: _warmStages.mirror,
                       draw: _warmStages.draw, drawn: _warmStages.drawn, garageScene: _warmStages.garageScene,
                       mirrorDeferred: _warmStages.mirrorDeferred, mirrorLazy: _warmStages.mirrorLazy, rig: _warmStages.rig,
                       total: _warmStages.total, attempts: _warmStages.attempts, failed: _warmStages.failed,
                       pending: !!_warmPending, done: _warmDone, history: _warmHistory.slice(), pinned: _pinnedPipes.size };
            o.presents = _presentN;
            try {
              const b = renderer && renderer.backend;
              const dm = b && b.data;
              if (dm) {
                o.backendData = (typeof dm.size === "number") ? dm.size : null;
                o.backendDataKind = (typeof dm.size === "number") ? "Map" : (dm instanceof WeakMap ? "WeakMap" : typeof dm);
              }
            } catch (_) { o.backendData = null; }
            try {
              const kinds = {};
              let live = 0;
              for (let gi = 0; gi < _geoReg.length; gi++) {
                const ref = _geoReg[gi];
                const g = ref && ref.deref();
                if (!g) continue;
                live++;
                const k = g.__tlxKind || "?";
                kinds[k] = (kinds[k] || 0) + 1;
              }
              o.geoLive = live; o.geoKinds = kinds; o.geoRegLen = _geoReg.length;
            } catch (_) {  }
            return o;
          },
          async shader(idx = 0) {
            const meshes = scene.children.concat(poolRoot.children, instRoot.children).filter((o) => o.isMesh && o.visible);
            const target = meshes[idx];
            if (!target) return null;
            const out = await renderer.debug.getShaderAsync(scene, camera, target);
            return { vertex: out.vertexShader, fragment: out.fragmentShader };
          },
        },
      };

      checkInit();
      try { localStorage.removeItem("apex26.gfxTlxFail"); } catch (_) {  }
      try { sessionStorage.removeItem("apex26.gfxBound"); } catch (_) {  }
      try { window.dispatchEvent(new Event("apex-gfx-live")); } catch (_) {  }
      _lastFailure = null;
      try { Log.info("gfx", "TLX bind ok"); } catch (_) {  }
      return backend;
    } catch (e) {
      for (let i = _createUndo.length - 1; i >= 0; i--) { try { _createUndo[i](); } catch (_) {  } }
      try {
        if (_abortDisplay && _abortDisplay.parentNode) _abortDisplay.parentNode.removeChild(_abortDisplay);
      } catch (_) {  }
      try { disposeKeepingContext(_abortRenderer); } catch (_) {  }
      if (initOwner && !initOwner.active) return null;
      return _fail((e && e.message) || e);
    }
  }

  function disposeKeepingContext(r) {
    if (!r || typeof r.dispose !== "function") return;
    const be = r.backend;
    if (be && !be.isWebGPUBackend) {
      const ext = be.extensions;
      if (!ext || typeof ext.get !== "function") return;
      const get = ext.get;
      ext.get = function (name) { return name === "WEBGL_lose_context" ? null : get.apply(this, arguments); };
    }
    const p = r.dispose();
    if (p && typeof p.catch === "function") p.catch(function () {  });
  }

  function mirrorLedger() {
    let refs = [];
    return {
      note(a) {
        if (!a || !a.array) return;
        a.__tlxArrayCtor = a.array.constructor;
        refs.push(typeof WeakRef === "function" ? new WeakRef(a) : { deref: () => a });
      },
      repair() {
        let n = 0;
        const keep = [];
        for (const r of refs) {
          const a = r.deref();
          if (!a) continue;
          if (a.array == null) { a.array = new (a.__tlxArrayCtor || Float32Array)(0); n++; }
          else keep.push(r);
        }
        refs = keep;
        return n;
      },
      size: () => refs.length,
    };
  }
  function isNullMirrorError(e) {
    if (!e || e.name !== "TypeError") return false;
    const m = String(e.message || "");
    return /null/.test(m) && /BYTES_PER_ELEMENT|constructor|byteLength/.test(m);
  }

  function engineLabel(THREE, api) {
    const rev = THREE && THREE.REVISION ? String(THREE.REVISION) : "?";
    return "three.js r" + rev + " " + api;
  }

  function sceneSamplesFor(renderer, forceWebGL, isMobile) {
    if (!forceWebGL || isMobile) return 0;
    let s = 4;
    try {
      const gl = renderer && renderer.backend && renderer.backend.gl;
      if (gl && typeof gl.getInternalformatParameter === "function") {
        const hdr = !!(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
        const cs = gl.getInternalformatParameter(gl.RENDERBUFFER, hdr ? gl.RGBA16F : gl.RGBA8, gl.SAMPLES);
        const ds = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, gl.SAMPLES);
        s = Math.min(s, cs && cs.length ? cs[0] : 0, ds && ds.length ? ds[0] : 0);
      }
    } catch (_) { s = 0; }
    let ultra = false;
    try {
      let p = localStorage.getItem("apex26.gfxPreset");
      try { p = JSON.parse(p); } catch (_) {  }
      ultra = p === "ultra" || (p == null && localStorage.getItem("apex26.gfxHigh") === "1");
    } catch (_) {  }
    if (!ultra && s > 2) s = 2;
    return s < 2 ? 0 : s;
  }

  return { create, lastFailure: () => _lastFailure, liteTier, liteOpts, labDprCap };
})();

if (typeof window !== "undefined") window.TLX = TLX;
