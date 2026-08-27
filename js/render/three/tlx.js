/* Apex 26 — TLX: three.js/TSL renderer backend. Third backend behind js/render/gfx.js (GLX default, WGX opt-in). Opt-in via apex26.gfxBackend=three. */
"use strict";

const TLX = (function () {
  let _lastFailure = null, _presentWarned = false;
  function _fail(reason) {
    _lastFailure = { reason: String(reason), at: Date.now() };
    try { localStorage.setItem("apex26.gfxTlxFail", _lastFailure.reason); } catch (_) { /* blocked storage */ }
    try { Log.warn("gfx", "TLX unavailable (" + _lastFailure.reason + ") — falling back to WebGL2"); } catch (_) { /* Log absent in the node harness */ }
    try { sessionStorage.setItem("apex26.gfxBound", "webgl2"); } catch (_) { /* label stays at the pick */ }
    try { window.dispatchEvent(new Event("apex-gfx-live")); } catch (_) { /* no window */ }
    return null;
  }

  /** create(canvas, opts) -> Promise<backend|null>. Never throws. */
  async function create(canvas /*, opts */) {
    try {
      const isMobile = (typeof GLX !== "undefined" && !!GLX.isMobile);
      const mobileTier = (typeof GLX !== "undefined" && !!GLX.mobileTier);

      const THREE = await import("three/webgpu");
      const TSL = await import("three/tsl");

      THREE.ColorManagement.enabled = false;

      // ── WHICH three BACKEND: apex26.tlxForceGL "1" = pin WebGL2, "0" =
      // pin WebGPU, UNSET = AUTO. AUTO may land on three's WebGL2 — that
      // is success, not a silent fall to game GLX. Decision:
      //   pin "1"                         → three WebGL2 (CI / escape hatch)
      //   pin "0"                         → three WebGPU only
      //   AUTO + no navigator.gpu         → three WebGL2
      //   AUTO + session tlxAutoGL="1"    → three WebGL2 (this tab already
      //                                     lost WebGPU; stay on TLX)
      //   AUTO + gpu present              → try WebGPU (lite caps on phone /
      //                                     WebKit / software). If init()
      //                                     throws before #game is claimed,
      //                                     retry three WebGL2 on the same
      //                                     canvas. Third device.lost sets
      //                                     tlxAutoGL and reloads — never
      //                                     gfxClaimFail (that binds GLX).
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
      // Software WebGPU never composites a visible swapchain — AUTO keeps
      // three's WebGPU backend and 2D-blits the LDR target (same as WGX)
      // until this tab proves WebGPU cannot stay up. mappedAtCreation
      // uploads are shimmed to queue.writeBuffer after init (Dawn's
      // mappable pool dies on the first large mesh; PlayCanvas #6676).
      // Phones / WebKit take the same WebGPU path with WGX-lite caps
      // (8-bit canvas, no MSAA 4, low-power) when AUTO tries WebGPU.
      let _softAdapter = false;
      try {
        if (navigator.gpu && navigator.gpu.requestAdapter) {
          const ad = await navigator.gpu.requestAdapter();
          if (ad) {
            const info = ad.info || null;
            const dev = info && info.device;
            const ven = info && info.vendor;
            const arch = info && info.architecture;
            const desc = info && info.description;
            const infoBlob = [dev, ven, arch, desc].filter(Boolean).join(" ").toLowerCase();
            const infoEmpty = !info || !(dev || ven || arch);
            _softAdapter = !!(ad.isFallbackAdapter
              || infoEmpty
              || /HeadlessChrome/i.test(ua)
              || /swiftshader|llvmpipe|lavapipe|microsoft basic render|soft/.test(infoBlob));
          }
        }
      } catch (_) { _softAdapter = false; /* sniff is best-effort; AUTO still tries WebGPU when gpu exists */ }
      let forceWebGL = _glPin === "1" || (_glPin !== "0" && (!_hasGpu || _autoStayGL));
      const _liteGpu = !!(isMobile || isWebKit || _softAdapter);

      // SCREENSHOTS (`apex26.wgxCapture`, same key as WGX): session then local.
      // NATIVE ("0") keeps three's swapchain so SETTINGS can show why software
      // shots are black. AUTO/2D BLIT on a software adapter (or an explicit
      // blit) copies the LDR target onto visible #game — never getCurrentTexture
      // (first call breaks mapAsync device-wide; WGX header + WebGPU Explainer).
      const _capPref = (function () {
        try {
          const s = sessionStorage.getItem("apex26.wgxCapture");
          if (s === "1" || s === "0") return s;
        } catch (_) { /* fall through */ }
        try {
          const s = localStorage.getItem("apex26.wgxCapture");
          if (s === "1" || s === "0") return s;
        } catch (_) { /* AUTO */ }
        return null;
      })();
      let _softBlit = !forceWebGL && _capPref !== "0" && !!(_softAdapter || _capPref === "1");
      let _displayCanvas = null, _displayCtx = null, _gpuCanvas = null;
      let _blitRT = null, _softImg = null, _softBlitGen = 0;
      let _softReadPending = false, _softReadQueued = null, _softReadEpoch = 0;
      const _softPresentWaiters = [];
      // Layout/CSS size follows the VISIBLE canvas. Soft-present is a sibling
      // 2D overlay — never getContext("2d") on #game (one context type per
      // canvas for life; three's WebGPU configure is lazy on first present).
      let _layoutCanvas = canvas;
      // Not cosmetic, and not a memory tweak: the lit fragment writes the SSR
      // car-paint TAG — 0.35 — into ALPHA (tsl-lit.js, ctx.ssrTag), and the
      // post-only death path in present() keeps those materials while painting
      // straight to the canvas. On an alpha-composited canvas that tag IS the
      // compositor's opacity, so from the first post failure onward the painted
      // bodywork of every car is 35% transparent and the page shows through it,
      // for the rest of the session. Reported from an iPhone on this backend,
      // which is exactly where a post present() throw happens — the tag is
      // written on ALL platforms, but only an alpha canvas turns it into
      // see-through cars. GLX has never been able to hit this: `alpha: false`
      // means the compositor ignores whatever it writes to alpha.
      //
      // three needs telling TWICE, because the two backends read different
      // things and neither reads the other's:
      //   WebGPU backend — honours this parameter (`alpha ? "premultiplied" :
      //     "opaque"` in its context configure()).
      //   WebGL backend  — IGNORES it. WebGLBackend.init() hardcodes
      //     `alpha: !0` in its own getContext attributes. It does honour a
      //     caller-supplied `context`, so on that path we make the context
      //     ourselves with GLX's attributes. Only when forceWebGL is set: the
      //     WebGPU backend reads `parameters.context` too and would try to
      //     configure a WebGL2 context as a WebGPU one.
      // Gfx.create() runs before any GLX.init(), so this getContext is the
      // FIRST on this canvas and its attributes are the ones that take (a
      // second getContext returns the existing context and silently drops
      // them).
      let ownGL = null;
      async function bootRenderer(forceWebGL) {
        let glCtx = null;
        if (forceWebGL) {
          try {
            glCtx = canvas.getContext("webgl2", {
              antialias: !isMobile,        // must agree with the renderer's own antialias
              alpha: false,
              depth: true,
              stencil: false,
              powerPreference: "high-performance",
            });
          } catch (_) { glCtx = null; }    // null -> three makes its own, as before
        }
        const renderer = new THREE.WebGPURenderer({
          canvas,
          alpha: false,
          premultipliedAlpha: false,
          ...(glCtx ? { context: glCtx } : {}),
          // js/render/glx.js's `antialias: !IS_MOBILE` 1:1 — "phones never take
          // the context-level AA path". This is NOT the scene target's MSAA
          // (msaa() below is honestly 1: the post chain deliberately has no
          // multisampled scene target — see the DEVIATION note in tlx-post.js).
          // three turns antialias:true into renderer.samples = 4, and samples
          // applies to the DEFAULT CANVAS target: a 4x multisampled colour+depth
          // store at the full backing-store size, resolved every frame. With the
          // post chain up the canvas receives exactly one fullscreen FXAA quad,
          // which has no interior edges for MSAA to find — so on a phone that is
          // ~20 MB and a full-res resolve per frame bought for nothing, against
          // the jetsam budget that made GLX write the same line. Desktop keeps it
          // for the post-less fallback path (a broken post factory renders the
          // world straight to the canvas, where the samples do work).
          // Lite WebGPU (phone / WebKit / software): MSAA-4 resolve has come
          // back blank (WGX forces 1).
          antialias: forceWebGL ? !isMobile : !_liteGpu,
          // WebKit #269582: a float swapchain crashed / painted black through
          // iOS 26.x. HDR stays in offscreen targets (tlx-post); only the
          // canvas format downgrades. Same as WGX_LITE → bgra8unorm.
          ...(!forceWebGL && (isMobile || isWebKit)
            ? { outputType: THREE.UnsignedByteType, powerPreference: "low-power" }
            : {}),
          forceWebGL,
        });
        renderer.setPixelRatio(1);            // we manage DPR/renderScale ourselves
        renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
        renderer.toneMapping = THREE.NoToneMapping;   // tone map lives in the post chain (M8)
        await renderer.init();
        // three r185.1 WebGPUAttributeUtils creates every GPUBuffer with
        // mappedAtCreation:true, then getMappedRange()+unmap(). Dawn's
        // client-visible mapping pool is tiny on SwiftShader — a 35 MB scenery
        // upload exhausts it and EVERY later createBuffer (even 24 B) throws
        // (mcp-probe 2026-08-18; same class as WGX _mkBuffer / PlayCanvas #6676).
        // Rewrite those creates to unmapped + queue.writeBuffer. Readback
        // (mapAsync) is unchanged — those buffers are not mappedAtCreation.
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
                } catch (_) { /* one failed upload must not take down present() */ }
                staging = null;
                parts.length = 0;
              };
              return buf;
            };
            _dev.__apexWriteBuf = true;
          }
          if (_liteGpu) {
            try { renderer.samples = 1; } catch (_) { /* samples is a three setter; ignore a frozen build */ }
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
        // init() does not getContext("webgpu") — configure is lazy on first
        // present() — so #game is still unbound and AUTO can retry WebGL2.
        if (_glPin !== "0" && _glPin !== "1" && !forceWebGL) {
          try { Log.warn("gfx", "[TLX] AUTO WebGPU init failed — three WebGL2", e); } catch (_) { /* Log optional */ }
          forceWebGL = true;
          const boot = await bootRenderer(true);
          renderer = boot.renderer;
          ownGL = boot.ownGL;
        } else {
          throw e;
        }
      }
      // Retry / stay-GL must not keep a WebGPU-only 2D overlay.
      _softBlit = !forceWebGL && _capPref !== "0" && !!(_softAdapter || _capPref === "1");
      // Soft-present overlay: a NEW 2D canvas sibling. Do not steal id="game"
      // or call getContext("2d"|"webgl2") on three's node — init() has not
      // claimed #game yet (see detectSoftwareGL). SAVE SCREENSHOT reads
      // capturePixels() when softPresent() is true, so a black native #game
      // is fine.
      if (_softBlit && typeof document !== "undefined" && canvas && canvas.parentNode) {
        _gpuCanvas = canvas;
        _displayCanvas = document.createElement("canvas");
        _displayCanvas.id = "game-soft";
        _displayCanvas.setAttribute("aria-hidden", "true");
        if (_displayCanvas.style) {
          _displayCanvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:1";
        }
        canvas.parentNode.insertBefore(_displayCanvas, canvas.nextSibling);
        // Opaque overlay — the lit fragment writes the SSR car-paint TAG
        // (0.35) into ALPHA. That is a post-chain mask, not opacity. A
        // default 2D context is alpha-composited, so bodywork ghosts at 35%
        // over #game / the page (tyres/wings stay solid). GLX asked for
        // `alpha: false`; the overlay must say the same.
        try { _displayCtx = _displayCanvas.getContext("2d", { alpha: false, willReadFrequently: true }); }
        catch (_) { _displayCtx = null; /* capturePixels can still read the RT */ }
      }
      function softGpu() { return !!(_softAdapter || _softBlit); }
      function softOutRT() { return softGpu() ? _ensureBlitRT(W, H) : null; }
      // r185.1 keys the TSL node-builder cache on RenderObject.initialCacheKey,
      // which folds in renderer.contextNode.version + the scene lights hash.
      // Both change across the many renderer.render() calls of a track load
      // (shadow primes, env faces, present), so every newly pooled mesh
      // misses, setup() mints new node ids, and the vertex shader text
      // changes only in `NodeUniforms<id>` — 593 unique programs / ~60 s of
      // getProgramParameter on Monza (measured 2026-08-17). Replace the key
      // with the program family + attribute layout, which is what actually
      // forks GLSL. Pipeline state (blend/side/depth) stays on the separate
      // pipeline cache and is not compiled into the program text.
      if (renderer._nodes && typeof renderer._nodes.getForRenderCacheKey === "function") {
        renderer._nodes.getForRenderCacheKey = function (ro) {
          const mat = ro.material;
          const geo = ro.geometry;
          const fam = (mat && typeof mat.customProgramCacheKey === "function")
            ? mat.customProgramCacheKey() : (mat && mat.type) || "mat";
          const attrs = geo && geo.attributes
            ? Object.keys(geo.attributes).sort().join(",") : "";
          const idx = geo && geo.index ? "i" : "n";
          const inst = ro.object && ro.object.isInstancedMesh ? "I" : "M";
          return fam + "|" + attrs + "|" + idx + "|" + inst;
        };
      }
      // SwiftShader / llvmpipe / WARP: shrink shadow maps (tlx-shadow.js).
      // Real GPUs keep the authored 2048/1024/512.
      //
      // CRITICAL: renderer.init() does NOT claim #game. r185.1 WebGPUBackend
      // init() requests the device, then updateSize() only deletes the
      // canvas-target cache. getContext("webgpu")+configure() is lazy — first
      // present() / setRenderTarget(null). A canvas is bound to one context
      // type for LIFE (MDN HTMLCanvasElement.getContext). Sniffing WebGL2 on
      // #game here is what made configure() throw on null (mcp-probe
      // 2026-08-18: data-engine already "three.js r185 webgpu",
      // getContext("webgpu")===null, getContext("webgl2") a live context).
      // Adapter.info already classified SwiftShader (_softAdapter). The
      // forceWebGL path already owns #game as WebGL2 (ownGL above).
      function detectSoftwareGL() {
        try {
          const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
          if (!gl) return false;
          const ext = gl.getExtension("WEBGL_debug_renderer_info");
          const name = ((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || "")
            + " " + (gl.getParameter(gl.RENDERER) || "");
          return /swiftshader|llvmpipe|softpipe|microsoft basic render|gdi generic/i.test(name);
        } catch (_) { return false; }
      }
      const softwareGL = forceWebGL ? detectSoftwareGL() : !!_softAdapter;
      try {
        if (canvas && typeof canvas.setAttribute === "function") {
          const api = (renderer.backend && renderer.backend.isWebGPUBackend) ? "webgpu" : "webgl2";
          canvas.setAttribute("data-engine", "three.js r185 " + api);
        }
      } catch (_) { /* three already stamped a label; ours is best-effort */ }
      try {
        Log.info("gfx", "[TLX] three backend:",
          (renderer.backend && renderer.backend.isWebGPUBackend) ? "WebGPU" : "WebGL2",
          "(forceWebGL", forceWebGL, "pin", _glPin, "isMobile", isMobile + ")");
      } catch (_) { /* logging must never cost the backend its boot */ }

      // ── CONTEXT / DEVICE LOSS RECOVERY (js/render/glx.js webglcontextlost) ──
      // three DETECTS a loss on both backends — the WebGL backend
      // preventDefault()s the canvas event, the WebGPU backend resolves
      // device.lost — and funnels both into renderer.onDeviceLost, whose
      // DEFAULT logs once, sets _isDeviceLost and returns. Every _renderScene
      // after that is a silent no-op: a dead canvas, forever, with no exception
      // for index.html's error overlay and no reason for the player to suspect
      // anything but "the game crashes when I try to play". That is the exact
      // failure GLX's handler exists to break — and GLX registers it inside
      // GLX.init(), which NEVER runs on this path, so TLX carried no recovery
      // at all. It matters most on phones, whose tile GPUs are the ones that
      // actually drop a context under memory pressure, and phones can now
      // select this backend.
      //
      // Same three moves as GLX, deliberately on the SAME keys so the latches
      // and the retry budget are shared with the WebGL2 path rather than
      // doubled: persist the two heavy-feature opt-outs (only on a VISIBLE
      // loss — iOS also drops the context on backgrounding, which is benign and
      // must not permanently disable a feature the player turned on), then
      // self-heal by reload, bounded to two per TAB session (sessionStorage) so
      // a device that dies every boot is not trapped in a reload loop.
      // Bound defensively: a three build that stopped seeding onDeviceLost must
      // cost us the recovery, not the whole backend — a throw here would return
      // null from create() and silently demote the player to GLX.
      const _threeOnLost = (typeof renderer.onDeviceLost === "function")
        ? renderer.onDeviceLost.bind(renderer) : null;
      renderer.onDeviceLost = function (info) {
        try { if (_threeOnLost) _threeOnLost(info); } catch (_) { /* three's own bookkeeping; ours must run regardless */ }
        try {
          if (!document.hidden) {
            try { localStorage.setItem("apex26.envProbeOff", "1"); } catch (_) { /* no storage: the knob stays as-is and the tier gate is the only defence left */ }
            try { localStorage.setItem("apex26.perChunkOff", "1"); } catch (_) { /* ditto — nothing in this handler may throw */ }
          }
          const rk = "apex26.ctxLostReloads";
          const n = (parseInt(sessionStorage.getItem(rk), 10) || 0) + 1;
          sessionStorage.setItem(rk, String(n));
          if (n <= 2) setTimeout(function () { try { location.reload(); } catch (_) { /* no location (harness/worker): the latches above still took effect for the next real boot */ } }, 1200);
          else {
            // Third loss in one tab. GLX's identical 2-cap ends in a frozen
            // frame because GLX has nothing beneath it. AUTO stays on TLX
            // by taking three WebGL2 next boot (mcp-probe 2026-08-18: pin
            // "1" already binds WebGL2RenderingContext on #game). gfxClaimFail
            // skips the three opt-in and binds game GLX — do not write it
            // on AUTO. Pin "0" (force WebGPU) still surrenders to GLX.
            const autoPath = _glPin !== "0" && _glPin !== "1";
            if (autoPath) {
              try { sessionStorage.setItem("apex26.tlxAutoGL", "1"); } catch (_) { /* next boot still tries WebGPU */ }
              try { localStorage.setItem("apex26.gfxTlxFail", "context lost x" + n + " — AUTO stayed on three WebGL2"); } catch (_) { /* backendState still names the path */ }
            } else {
              try { localStorage.setItem("apex26.gfxTlxFail", "context lost x" + n + " — tab fell back to WebGL2"); } catch (_) { /* blocked storage: the label still flips via gfxBound */ }
              try { sessionStorage.setItem("apex26.gfxBound", "webgl2"); } catch (_) { /* label keeps the pick */ }
              sessionStorage.setItem("apex26.gfxClaimFail", "1");
            }
            setTimeout(function () { try { location.reload(); } catch (_) { /* harness */ } }, 1200);
          }
        } catch (_) { /* no sessionStorage -> skip the auto-recovery rather than loop uncounted */ }
      };
      try {
        canvas.addEventListener("webglcontextrestored",
          function () { try { location.reload(); } catch (_) { /* same: nothing to reload, and the loss latches already landed */ } }, false);
      } catch (_) { /* detached/synthetic canvas in a harness: the timer above still covers it */ }

      // ── lifecycle state ───────────────────────────────────────────────────
      let renderScale = 1;
      let W = 1, H = 1;
      const DPR_CAP = isMobile ? 1.5 : 2;

      // ── M9 GPU frame timer state ─────────────────────────────────────────
      // supported only where three's timestamp-query feature is present — the
      // WebGPU backend with the adapter feature; never on the WebGL2 fallback
      // (SwiftShader/CI), keeping the GLX {supported:false} shape there.
      let _gpuTimerOn = false, _gpuMs = -1;
      function _gpuSupported() {
        try {
          return !!(renderer.backend && renderer.backend.isWebGPUBackend)
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
        window.scene = scene; window.camera = camera; window.renderer = renderer;
        window.THREE = THREE;
        Log.info("gfx", "[TLX] window.scene / camera / renderer / THREE exposed — Three.js DevTools will find the scene");
      } catch (_) { /* non-fatal: debug convenience only */ }

      // Fallback materials: unlit vertex colour (the M2 look). Node unlit is
      // the never-fail path when the lit *factory* throws at create time.
      // Classic MeshBasicMaterial is the last canvas paint if TSL *codegen*
      // itself throws on the first renderer.render() — that compile is lazy,
      // so a factory that returned is not a compiled program.
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
      // 0 = lit/post, 1 = TSL unlit, 2 = classic (no TSL). Latched on the
      // first present() throw so later frames do not recompile the dead graph.
      let _drawMatMode = 0;

      const vizMode = (function () {
        try {
          return new URL(location.href).searchParams.get("viz")
            || localStorage.getItem("apex26.tlxViz") || null;
        } catch (_) { return null; }
      })();
      const LIT_VIZ = ["mat", "normal", "lamp"];

      let shadowSys = null;
      try {
        if (window.TLXShaders && TLXShaders.shadowSys) {
          // Shrink maps on software WebGPU too (detectSoftwareGL is WebGL-only
          // and returns false once the hidden canvas is a WebGPU context).
          shadowSys = TLXShaders.shadowSys(THREE, TSL, {
            renderer, mobileTier, isMobile, softwareGL: softwareGL || softGpu(),
          });
        }
      } catch (e) {
        try { Log.warn("gfx", "TLX: shadow factory failed, shadows off —", e); } catch (_) {}
        shadowSys = null;
      }

      // Shared TSL chunk leaves — consumed by post, lit and sky below.
      let chunks = null;
      try {
        if (window.TLXShaders && TLXShaders.chunks) chunks = TLXShaders.chunks(THREE, TSL);
      } catch (_) { chunks = null; }

      let post = null;
      try {
        if (window.TLXShaders && TLXShaders.postChain && TLXShaders.post && chunks) {
          post = TLXShaders.postChain(THREE, TSL,
            { renderer, isMobile, chunks, shadow: shadowSys, viz: vizMode,
              softDest: function () { return softOutRT(); } });
          if (post && !post.enabled()) {
            try { if (post.dispose) post.dispose(); } catch (_) { /* disabled factory cleanup */ }
            post = null;
          }
          // GLX keeps the post chain on an RGBA8 scene when half-float is not
          // renderable (js/render/glx/post.js). Killing it here dropped ACES,
          // bloom, SSAO, god-ray, FXAA and SSR on phones that missed the float
          // target — a bigger look delta than 8-bit ACES. hdrOk() already
          // accepts EXT_color_buffer_half_float (iOS). The pale-ground look
          // was fog-as-clear + a missed TSL sky, not this gate.
        }
      } catch (e) {
        try { Log.warn("gfx", "TLX: post factory failed, direct to canvas —", e); } catch (_) {}
        try { if (post && post.dispose) post.dispose(); } catch (_) { /* partial factory cleanup */ }
        post = null;
      }

      const ENV_SIZE = 64;
      const ENV_CULL_M = 300;
      let envRT = null, envDummy = null;
      try {
        const envHdr = !!(post && post.hdrOk());
        const envOpts = {
          type: envHdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
          format: THREE.RGBAFormat,
          generateMipmaps: true,
          minFilter: THREE.LinearMipmapLinearFilter,
          magFilter: THREE.LinearFilter,
        };
        envRT = new THREE.CubeRenderTarget(ENV_SIZE, envOpts);
        envRT.texture.colorSpace = THREE.NoColorSpace;   // no-sRGB invariant (probe target too)
        envRT.texture.anisotropy = 4;                    // GLX env cube 4× (grazing clearcoat)
        // A COMPLETE black cube bound whenever the live probe must NOT be
        // sampled: while rendering INTO envRT (feedback-loop guard) and before
        // the first full capture. Cleared black once so it reads as no-mirror.
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

      // ── Baked PBR material arrays (js/render/assets.js) ──────────────────
      // Created as 1×1×17 mid-grey PLACEHOLDERS before the lit factory runs,
      // because tsl-lit.js binds its texture nodes once at factory time and the
      // asset pack loads asynchronously long after. setMaterialMaps() below
      // swaps the real DataArrayTextures onto those same nodes — the identical
      // shared-node .value trick the env cube uses. Guarded: if the placeholder
      // cannot be built, ctx.matMaps stays null and tsl-lit compiles the baked
      // path out entirely, leaving TLX exactly as it renders today.
      // matPlace* are NEVER disposed (nodes always have a complete texture);
      // matOwned* are the pack textures Assets handed over — freed on replace
      // or unload so a tier swap cannot leak a full pack (GLX parity).
      let matMaps = null;
      let matPlaceAlbedo = null, matPlaceNormal = null;
      let matOwnedAlbedo = null, matOwnedNormal = null;
      try {
        const grey = (v) => {
          const d = new Uint8Array(17 * 4);
          for (let i = 0; i < 17; i++) { d[i * 4] = v[0]; d[i * 4 + 1] = v[1]; d[i * 4 + 2] = v[2]; d[i * 4 + 3] = 255; }
          const t = new THREE.DataArrayTexture(d, 1, 1, 17);
          t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
          t.colorSpace = THREE.NoColorSpace;   // no-sRGB calibration invariant
          t.needsUpdate = true;
          return t;
        };
        matPlaceAlbedo = grey([128, 128, 128]);
        matPlaceNormal = grey([128, 128, 255]);
        matMaps = { albedo: matPlaceAlbedo, normal: matPlaceNormal };
      } catch (_) { matMaps = null; matPlaceAlbedo = matPlaceNormal = null; }

      // ── M3: the TSL lit core (tsl-chunks.js + tsl-lit.js factories) ──────
      // Guarded: a missing/broken factory keeps the unlit material — the
      // backend must still boot (Gfx.create's never-throw contract).
      let lit = null;
      try {
        if (window.TLXShaders && chunks && TLXShaders.lit) {
          lit = TLXShaders.lit(THREE, TSL, { chunks, shadow: shadowSys, ssrTag: !!post,
            envCube: envRT ? envRT.texture : null, matMaps });
        }
      } catch (e) {
        try { Log.warn("gfx", "TLX: lit factory failed, falling back to unlit —", e); } catch (_) {}
        lit = null;
      }

      let sky = null;
      try {
        if (window.TLXShaders && TLXShaders.sky) {
          if (!chunks && TLXShaders.chunks) chunks = TLXShaders.chunks(THREE, TSL);
          sky = TLXShaders.sky(THREE, TSL, { chunks });
        }
      } catch (e) {
        try { Log.warn("gfx", "TLX: sky factory failed, flat clear only —", e); } catch (_) {}
        sky = null;
      }

      let fx = null;
      try {
        if (window.TLXShaders && TLXShaders.fx) {
          fx = TLXShaders.fx(THREE, TSL, { chunks });
        }
      } catch (e) {
        try { Log.warn("gfx", "TLX: fx factory failed, FX paths off —", e); } catch (_) {}
        fx = null;
      }

      let chunkedSys = null;
      try {
        if (window.TLXShaders && TLXShaders.chunked) {
          chunkedSys = TLXShaders.chunked(THREE, {});
        }
      } catch (e) {
        try { Log.warn("gfx", "TLX: chunked factory failed, un-culled props —", e); } catch (_) {}
        chunkedSys = null;
      }

      // ?viz=mat|normal|lamp paints the mat attribute / world normal / raw
      // lamp-loop output (the spike's bisect views). Post viz modes (ssao/
      // bloom/shafts/composite-off) must NOT mint a lit viz material — they
      // keep the real scene shading and bisect inside the chain instead.
      const vizMat = (lit && vizMode && LIT_VIZ.indexOf(vizMode) >= 0)
        ? lit.makeViz(vizMode) : null;

      const defaultMat = lit ? lit.makeMaterial({}) : null;
      const defaultMatChunked = lit ? lit.makeMaterial({ chunked: true }) : null;
      const defaultMatInstanced = lit ? lit.makeMaterial({ instanced: true }) : null;
      const matCache = new Map();
      const MAT_CACHE_CAP = 64;
      // Frame stamp per cached material, so eviction can never dispose one that
      // is still queued to draw. drawList holds `mat` REFERENCES and is flushed
      // at the end of the frame, while eviction disposed the oldest INSERTED
      // entry the moment the cache hit its cap — FIFO, not LRU, so the earliest
      // material of the frame was the first to go. In the garage the cache never
      // fills and nothing is evicted; a 22-car race blows past 64 distinct keys
      // easily, so the car — drawn early — had its material disposed mid-frame
      // and its body silently vanished while everything else still drew.
      // Reported from an iPhone: garage correct, race identical to WebGL2 except
      // the car body was missing.
      let _matFrame = 0;
      function fallbackMat(instanced) {
        return _drawMatMode >= 2 ? rawUnlitMat : (instanced ? unlitInstancedMat : unlitMat);
      }
      function materialFor(opts, chunked, instanced) {
        if (_drawMatMode || !lit) return fallbackMat(instanced);
        if (vizMat) return vizMat;
        if (!opts) return chunked ? defaultMatChunked : (instanced ? defaultMatInstanced : defaultMat);
        const o = opts;
        const key =
          (o.emissive !== undefined ? Math.round(o.emissive * 32) / 32 : 0) + "," +
          (o.alpha !== undefined ? Math.round(o.alpha * 32) / 32 : 1) + "," +
          (o.roughness !== undefined ? o.roughness : 0.7) + "," +
          (o.metalness !== undefined ? o.metalness : 0) + "," +
          (o.specular !== undefined ? o.specular : 0.5) + "," +
          (o.detail !== undefined ? o.detail : 0) + "," +
          (o.clearcoat !== undefined ? o.clearcoat : 0) + "," +
          (o.carPaint !== undefined ? o.carPaint : 0) + "," +
          (o.sparkle !== undefined ? o.sparkle : 1) +
          (o.doubleSided ? "|ds" : "") +
          (o.noAlphaWrite ? "|na" : "") +
          (o.depthBias ? "|db" + o.depthBias[0] + "," + o.depthBias[1] : "") +
          (chunked ? "|ch" : "") +
          (instanced ? "|in" : "");
        let m = matCache.get(key);
        if (!m) {
          if (matCache.size >= MAT_CACHE_CAP) {
            // Evict the oldest entry NOT used this frame. If every entry is in
            // use the cache simply runs over cap for the rest of the frame:
            // exceeding a soft cap costs some variants, disposing a material
            // that drawList still points at costs the object on screen.
            //
            // Do NOT call dispose() here: three r185.1 still leaks shared
            // texture bindGroups on Material.dispose() (issue #33952; PR
            // #33954 is slated for unpublished r186). Dropping the Map entry
            // lets the material stay alive for any drawList still holding it
            // this frame. Releasing the lit registry entry is what lets the
            // JS object actually go — setSsrMrt held every minted material
            // forever, so its loop grew and evictions freed nothing. A full
            // dispose() pass lands with the r186 upgrade (same issue).
            for (const [k, v] of matCache) {
              if (v && v.__tlxFrame === _matFrame) continue;
              matCache.delete(k);
              if (lit.releaseMaterial) lit.releaseMaterial(v);
              break;
            }
          }
          m = lit.makeMaterial(chunked
            ? Object.assign({ chunked: true }, o)
            : (instanced ? Object.assign({ instanced: true }, o) : o));
          matCache.set(key, m);
        }
        if (m) m.__tlxFrame = _matFrame;
        return m;
      }

      const drawList = [];          // {geo, matrix, material} in submission order
      // Model matrices are COPIED into this per-frame pool at draw() time.
      // game.js reuses scratch Float32Arrays across draws (_wheelWorld is
      // written four times per car per frame), and drawList is only flushed at
      // present() — holding the caller's reference collapsed all four wheels
      // onto the LAST wheel's transform (measured: the player car rendered
      // with one visible wheel). GLX consumes the matrix inside draw(), so the
      // aliasing was invisible there; a deferred list must copy.
      const _dMats = [];
      let _dMatUsed = 0;
      function poolModelMat(model) {
        if (!model) return null;
        let m = _dMats[_dMatUsed] || (_dMats[_dMatUsed] = new Float32Array(16));
        _dMatUsed++;
        m.set(model);
        return m;
      }
      const _instMat = new THREE.Matrix4();
      const _instAlive = new Set();   // InstancedMesh objects shown this frame
      const _instRegistry = [];       // all live InstancedMeshes (hide undrawn)

      function _instColorAttr(imesh, cap) {
        const need = Math.max(1, cap | 0);
        const geo = imesh.geometry;
        if (!geo) return null;
        const attr = geo.getAttribute("instanceTint");
        if (attr && attr.isInstancedBufferAttribute && attr.count >= need) return attr;
        // Keep canonical per-vertex `color` intact and put the placement tint in
        // a dedicated instance-rate attribute. Replacing `color` discarded the
        // fixed-colour parts of mixed models; do NOT also set imesh.instanceColor:
        // NodeMaterial would multiply it into colorNode and bind a second
        // instance-rate slot (slot 5, 12 B when setColorAt lazily allocated 1).
        const next = new THREE.InstancedBufferAttribute(new Float32Array(need * 3), 3);
        next.setUsage(THREE.DynamicDrawUsage);
        next.array.fill(1);
        geo.setAttribute("instanceTint", next);
        return next;
      }
      function _writeInstanceMatrices(imesh, matrices, colors, n) {
        const cap = imesh.userData.tlxInstCap || n;
        const drawN = Math.min(n, cap);
        const col = _instColorAttr(imesh, cap);
        for (let i = 0; i < drawN; i++) {
          _instMat.fromArray(matrices, i * 16);
          imesh.setMatrixAt(i, _instMat);
          if (colors && colors.length && col) {
            col.setXYZ(i, colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
          }
        }
        imesh.instanceMatrix.needsUpdate = true;
        if (col) col.needsUpdate = true;
        imesh.count = drawN;
      }

      function createInstancedBatch(data, matrices, colors, opts) {
        if (!data || !data.pos || !data.pos.length || !matrices || !matrices.length) {
          return { __tlx: true, geo: null, instances: 0, visible: 0, imesh: null };
        }
        const geo = buildGeometry(data);
        const n = (matrices.length / 16) | 0;
        const imesh = new THREE.InstancedMesh(geo, unlitMat, n);
        imesh.matrixAutoUpdate = false;
        imesh.frustumCulled = false;
        imesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        imesh.userData.tlxInstCap = n;
        _instColorAttr(imesh, n);
        _writeInstanceMatrices(imesh, matrices, colors, n);
        imesh.visible = false;
        scene.add(imesh);
        _instRegistry.push(imesh);

        const batch = {
          __tlx: true,
          geo,
          instances: n,
          visible: n,
          imesh,
          srcMatrices: matrices,
          srcColors: colors && colors.length ? colors : null,
          packMatrices: new Float32Array(matrices.length),
          packColors: colors && colors.length ? new Float32Array(colors.length) : null,
          cells: null,
        };
        if (opts && opts.cellSize > 0 && n) {
          const cell = opts.cellSize;
          let reach = opts.radius || 0;
          if (!reach) {
            const p0 = data.pos;
            for (let i = 0; i < p0.length; i++) { const a = Math.abs(p0[i]); if (a > reach) reach = a; }
          }
          const buckets = new Map();
          for (let i = 0; i < n; i++) {
            const b = i * 16, x = matrices[b + 12], y = matrices[b + 13], z = matrices[b + 14];
            const sx = Math.hypot(matrices[b], matrices[b + 1], matrices[b + 2]);
            const sy = Math.hypot(matrices[b + 4], matrices[b + 5], matrices[b + 6]);
            const sz = Math.hypot(matrices[b + 8], matrices[b + 9], matrices[b + 10]);
            const r = reach * Math.max(sx, sy, sz);
            const key = (Math.floor(x / cell) + 1024) * 4096 + (Math.floor(z / cell) + 1024);
            let bk = buckets.get(key);
            if (!bk) buckets.set(key, (bk = { idx: [], mn: [Infinity, Infinity, Infinity], mx: [-Infinity, -Infinity, -Infinity] }));
            bk.idx.push(i);
            const mn = bk.mn, mx = bk.mx;
            if (x - r < mn[0]) mn[0] = x - r; if (x + r > mx[0]) mx[0] = x + r;
            if (y - r < mn[1]) mn[1] = y - r; if (y + r > mx[1]) mx[1] = y + r;
            if (z - r < mn[2]) mn[2] = z - r; if (z + r > mx[2]) mx[2] = z + r;
          }
          batch.cells = [...buckets.values()];
        }
        return batch;
      }

      function cullInstances(batch, planes, opts) {
        if (!batch || !batch.cells) return batch ? batch.instances : 0;
        let samePack = !!batch._cullPlanes;
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
        const src = batch.srcMatrices, dst = batch.packMatrices;
        const sc = batch.srcColors, dc = batch.packColors;
        let n = 0;
        for (const c of batch.cells) {
          if (!TLXShaders.aabbInFrustum(planes, c.mn, c.mx)) continue;
          for (const i of c.idx) {
            // No src.subarray — per-instance views were GC on Vegas-scale batches
            // (GLX/WGX already element-copy; design E mirrored here).
            const so = i * 16, dOff = n * 16;
            for (let k = 0; k < 16; k++) dst[dOff + k] = src[so + k];
            if (dc) {
              const sco = i * 3, dco = n * 3;
              dc[dco] = sc[sco]; dc[dco + 1] = sc[sco + 1]; dc[dco + 2] = sc[sco + 2];
            }
            n++;
          }
        }
        batch.visible = n;
        // upload:false — CPU pack only. The sun/lamp shadow path copies
        // packMatrices into a SECOND InstancedMesh (tlx-shadow castInstanced);
        // writing the lit imesh here was a full setMatrixAt walk discarded
        // when the camera cull overwrote it later in the same frame.
        // Do not touch _cullPlanes: that cache means "this pack is on the
        // GPU", and we did not upload.
        if (opts && opts.upload === false) return n;
        if (n && batch.imesh) _writeInstanceMatrices(batch.imesh, dst, dc, n);
        const snap = batch._cullPlanes || (batch._cullPlanes = new Float64Array(24));
        for (let pi = 0, po = 0; pi < 6; pi++) {
          const p = planes[pi];
          for (let k = 0; k < 4; k++, po++) snap[po] = p[k];
        }
        batch._cullN = n;
        return n;
      }

      function drawInstanced(batch, opts) {
        // Software WebGPU: InstancedMesh + per-vertex color/trk makes Dawn
        // bind a 16-vertex vec3 as instance-rate (slot 2, 192 B vs count*12)
        // and a 1-instance dummy at slot 5. One failed draw invalidates the
        // whole encoder — car/road/sky never land in softOutRT. Skip the
        // instanced scenery on that path; real GPUs keep the batches.
        if (softGpu()) return;
        if (!batch || !batch.imesh || !batch.instances) return;
        const n = batch.visible === undefined ? batch.instances : batch.visible;
        if (n <= 0) return;
        drawList.push({ instanced: batch, mat: materialFor(opts, false, true) });
      }

      function freeInstancedBatch(batch) {
        if (!batch) return;
        if (batch.imesh) {
          const ix = _instRegistry.indexOf(batch.imesh);
          if (ix >= 0) _instRegistry.splice(ix, 1);
          try { scene.remove(batch.imesh); } catch (_) { /* */ }
          try { batch.imesh.dispose(); } catch (_) { /* */ }
          batch.imesh = null;
        }
        if (batch.geo) {
          try { batch.geo.dispose(); } catch (_) { /* */ }
          batch.geo = null;
        }
      }

      function castShadowInstanced(batch, count) {
        if (softGpu()) return;
        if (shadowSys && shadowSys.castInstanced) shadowSys.castInstanced(batch, count);
      }

      function _showInstanced(rec, order) {
        const b = rec.instanced;
        const n = b.visible === undefined ? b.instances : b.visible;
        if (!(n > 0) || !b.imesh) return;
        b.imesh.count = n;
        b.imesh.material = rec.mat || unlitMat;
        b.imesh.renderOrder = order;
        b.imesh.visible = true;
        _instAlive.add(b.imesh);
      }

      function _hideUndrawnInstanced() {
        for (let i = 0; i < _instRegistry.length; i++) {
          const im = _instRegistry[i];
          if (!_instAlive.has(im)) im.visible = false;
        }
      }
      const meshPool = [];          // recycled THREE.Mesh wrappers
      let poolUsed = 0;
      const _tmpMat4 = new THREE.Matrix4(), _tmpMat4b = new THREE.Matrix4();

      // ── M6 FX plumbing ───────────────────────────────────────────────────
      // Shared unit quad for blob shadows + per-mark skid stamps: the GLX
      // shadowVAO 1:1 — xz footprint -0.5..0.5, y=0.02 (SHADOW_VS's lift
      // baked into the vertices; the matrix scale below never touches y).
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
      // Per-record matrix pool (reset each begin): drawShadow/drawMark bake
      // the GLX uSize scale into record.m = model * scale(w,1,l) — the caller
      // reuses its matrix arrays, so records must not alias them, and the
      // shader-side uSize uniform would otherwise force per-draw materials.
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
      function ensureStream(slot, verts) {
        if (slot.geo && slot.cap >= verts) return false;
        const cap = Math.max(slot.cap * 2, verts, slot.min);
        if (slot.geo) slot.geo.dispose();
        const geo = new THREE.BufferGeometry();
        const ib = new THREE.InterleavedBuffer(new Float32Array(cap * slot.stride), slot.stride);
        ib.setUsage(THREE.DynamicDrawUsage);
        for (const a of slot.attrs) geo.setAttribute(a[0], new THREE.InterleavedBufferAttribute(ib, a[1], a[2]));
        geo.setDrawRange(0, 0);
        slot.geo = geo; slot.ib = ib; slot.cap = cap;
        return true;
      }
      function uploadStream(slot, floats) {
        slot.ib.clearUpdateRanges();
        slot.ib.addUpdateRange(0, floats);
        slot.ib.needsUpdate = true;
      }
      const skidStream = { geo: null, ib: null, cap: 0, min: 120 * 6, stride: 5,
        attrs: [["position", 3, 0], ["uv", 2, 3]] };
      const glowStream = { geo: null, ib: null, cap: 0, min: 32 * 6, stride: 9,
        attrs: [["fxCorner", 2, 0], ["position", 3, 2], ["fxColor", 3, 5], ["fxRadius", 1, 8]] };
      const PART_ATTRS = [["fxCorner", 2, 0], ["position", 3, 2], ["fxColor", 3, 5], ["fxSize", 1, 8], ["fxAlpha", 1, 9]];
      const partStreams = [
        { geo: null, ib: null, cap: 0, min: 256 * 6, stride: 10, attrs: PART_ATTRS },   // alpha group
        { geo: null, ib: null, cap: 0, min: 256 * 6, stride: 10, attrs: PART_ATTRS },   // additive group
      ];
      // GLX _glowCorners with the GLOW_VS y*2-1 remap pre-baked (y 0..1 -> ±1).
      const _glowCorners = [-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1];
      let frameEye = null;          // frame.eye — the glow near-field fade origin
      const _frameVP = new Float32Array(16);
      let frameCullDist = 0;        // frame.cullDist — the radial draw cap (0 = off)
      const _postF = {
        proj: null, invProj: null, invVP: null, sunVS: null, upVS: null,
        skyHi: null, skyLo: null, viewProj: null, sunDir: null, sunColor: null,
        eye: null, time: 0, cloud: 0, cloudSpeed: 1, lights: null,
      };
      const _chunkFrame = { total: 0, visible: 0 };   // reset each begin
      const _chunkLast = { total: 0, visible: 0 };    // latched at present — __tlx.chunkState()
      const _mirrorRelease = [];    // chunked meshes whose first lit draw is THIS render
      const _fxFrame = { shadows: 0, marks: 0, skidVerts: 0, glow: 0, particles: 0, decals: 0 };
      const _fxLast = { shadows: 0, marks: 0, skidVerts: 0, glow: 0, particles: 0, decals: 0 };
      // M10 façade-wiring probe: how many meshes this backend actually created.
      // tracks.js resolves its gfx handle from Tracks.build's opts.gfx and routes
      // createMesh/createChunkedMesh through it — so on the TLX opt-in path these
      // counters prove the track build ran on THIS backend (never a real GLX
      // WebGL2 context, which is never init'd when TLX is active).
      const _meshMade = { mesh: 0, chunked: 0, tex: 0 };

      let envCubeCam = null;
      let envFacesMask = 0, envReady = false, _envActive = false;
      // Software / soft-GPU faces clear black and skip the world. envReady
      // still latches (M9 parked-race hook), but uEnvStr must stay 0 — a
      // ready black cube darkens clearcoat (envW absorb) and kills chrome.
      let _envBlank = false;
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
        } catch (_) { /* three internals: a miss just means the next present retries */ }
      }

      function acquireMesh(geo, matrixArr, material) {
        let m = meshPool[poolUsed];
        if (!m) {
          m = new THREE.Mesh(geo, unlitMat);
          m.matrixAutoUpdate = false;
          m.matrixWorldAutoUpdate = false;
          m.frustumCulled = false;
          meshPool[poolUsed] = m;
        }
        m.geometry = geo;
        m.material = material || fallbackMat();
        // scene.matrixWorldAutoUpdate is false (see create() above), so three
        // will NEVER promote m.matrix → matrixWorld. The renderer uploads
        // matrixWorld as the model matrix: writing only `.matrix` left every
        // pooled mesh at identity forever. World-baked track/terrain still
        // looked right (identity IS their model matrix); cars, flaps, blob
        // shadows, and any draw() with a non-identity model sat at the origin
        // — invisible from a chase cam on track, but correct in the garage
        // where the car IS near the origin. Same symptom the material-cache
        // dispose used to cause; this is the remaining half.
        if (matrixArr) m.matrix.fromArray(matrixArr); else m.matrix.identity();
        m.matrixWorld.copy(m.matrix);
        m.matrixWorldNeedsUpdate = false;
        m.visible = true;
        poolUsed++;
        if (!m.parent) scene.add(m);
        return m;
      }

      /** raw {pos,nrm,col,idx,mat?} (plain or typed arrays) -> BufferGeometry */
      function buildGeometry(data) {
        const g = new THREE.BufferGeometry();
        const pos = data.pos.length ? data.pos : [0, 0, 0];
        const verts = pos.length / 3;
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
        g.setAttribute("normal", new THREE.BufferAttribute(
          new Float32Array(data.nrm && data.nrm.length === pos.length ? data.nrm : verts * 3), 3));
        g.setAttribute("color", new THREE.BufferAttribute(
          new Float32Array(data.col && data.col.length === pos.length ? data.col : verts * 3), 3));
        g.setAttribute("mat", new THREE.BufferAttribute(
          new Float32Array(data.mat && data.mat.length === verts ? data.mat : verts), 1));
        g.setAttribute("trk", new THREE.BufferAttribute(
          new Float32Array(data.trk && data.trk.length === pos.length ? data.trk : verts * 3), 3));
        if (data.idx && data.idx.length) {
          g.setIndex(new THREE.BufferAttribute(new Uint32Array(data.idx), 1));
        }
        return g;
      }

      /** Read the raw (un-colour-managed, un-premultiplied) pixels of each
       * pack layer into `data` via a throwaway WebGL2 context — byte-parity
       * with GLX's texSubImage3D upload; see createTextureArray for why a 2d
       * canvas cannot do this. Falls back to the 2d round-trip only when
       * WebGL2 itself is unavailable (better a colour-shifted pack than none).
       * Returns the number of layers written. */
      function readbackTextureLayers(size, images, n, data) {
        let filled = 0;
        const page = size * size * 4;
        const cv = (typeof OffscreenCanvas !== "undefined")
          ? new OffscreenCanvas(size, size)
          : Object.assign(document.createElement("canvas"), { width: size, height: size });
        const gl = cv.getContext("webgl2", { premultipliedAlpha: false, antialias: false });
        if (gl) {
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
          gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
          const tex = gl.createTexture();
          const fbo = gl.createFramebuffer();
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
          for (let i = 0; i < n; i++) {
            const img = images[i];
            if (!img) continue;
            try {
              gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
              gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
              if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) continue;
              gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE,
                new Uint8Array(data.buffer, data.byteOffset + i * page, page));
              filled++;
            } catch (_) { /* one bad layer must not sink the pack (GLX parity) */ }
          }
          gl.deleteFramebuffer(fbo);
          gl.deleteTexture(tex);
          const lose = gl.getExtension("WEBGL_lose_context");
          if (lose) { try { lose.loseContext(); } catch (_) {} }
          if (filled) return filled;
        }
        const cv2 = (typeof OffscreenCanvas !== "undefined")
          ? new OffscreenCanvas(size, size)
          : Object.assign(document.createElement("canvas"), { width: size, height: size });
        const c2d = cv2.getContext("2d", { willReadFrequently: true });
        if (!c2d) return filled;
        for (let i = 0; i < n; i++) {
          const img = images[i];
          if (!img) continue;
          try {
            c2d.clearRect(0, 0, size, size);
            c2d.drawImage(img, 0, 0, size, size);
            data.set(c2d.getImageData(0, 0, size, size).data, i * page);
            filled++;
          } catch (_) { /* ditto */ }
        }
        return filled;
      }

      let cssW = 0, cssH = 0, cssDirty = true;
      const markCssDirty = () => { cssDirty = true; };
      if (typeof window !== "undefined" && window.addEventListener) {
        window.addEventListener("resize", markCssDirty);
        window.addEventListener("orientationchange", markCssDirty);
        if (typeof ResizeObserver === "function" && _layoutCanvas) {
          try { new ResizeObserver(markCssDirty).observe(_layoutCanvas); } catch (_) {}
        }
      }
      function resize() {
        // CSS size only — NEVER fall back to canvas.width/.height. setSize() below
        // writes the backing store, so reading it back here fed the previous frame's
        // size into the DPR multiply: a hidden/detached canvas (clientWidth 0) then
        // doubled its render target every begin() until allocation failed. GLX and
        // WGX both read clientWidth with a floor of 1 for the same reason.
        // Soft-present: the hidden GPU canvas is 1×1 CSS — layout is #game.
        if (cssDirty || cssW <= 0 || cssH <= 0) {
          cssW = _layoutCanvas.clientWidth;
          cssH = _layoutCanvas.clientHeight;
          cssDirty = false;
        }
        const cw = cssW || 1;
        const ch = cssH || 1;
        const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
        const w = Math.max(1, Math.round(cw * dpr * renderScale));
        const h = Math.max(1, Math.round(ch * dpr * renderScale));
        if (w !== W || h !== H) {
          // An old-size async read may finish after the visible canvas changes.
          // It is allowed to drain, but must never repaint the resized canvas.
          _softReadEpoch++;
          _softReadQueued = null;
          W = w; H = h;
          renderer.setSize(w, h, false);    // false: CSS keeps sizing the canvas
          if (_displayCanvas && (_displayCanvas.width !== w || _displayCanvas.height !== h)) {
            _displayCanvas.width = w;
            _displayCanvas.height = h;
          }
          if (post) post.resize(w, h);
        }
      }

      const noopMesh = () => ({ __tlx: true, count: 0 });

      function _captureRT() {
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
      // three pads copyTextureToBuffer rows to 256 bytes (WebGPU rule).
      function _unstrideRgba(src, w, h) {
        const bpr = 256 * Math.ceil((w * 4) / 256);
        const data = new Uint8ClampedArray(w * h * 4);
        const row = w * 4;
        if (src.length < (h - 1) * bpr + row) {
          // tight pack fallback (WebGL backend copy)
          if (src.length >= w * h * 4) data.set(src.subarray(0, w * h * 4));
        } else {
          for (let y = 0; y < h; y++) {
            data.set(src.subarray(y * bpr, y * bpr + row), y * row);
          }
        }
        // SSR car-paint tag is 0.35 in ALPHA — a channel, not opacity.
        // Screenshots and the 2D overlay must not treat it as compositor a.
        for (let i = 3; i < data.length; i += 4) data[i] = 255;
        return data;
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
        const ws = _softPresentWaiters.splice(0);
        for (let i = 0; i < ws.length; i++) {
          try { ws[i](_softBlitGen); } catch (_) { /* harness waiter */ }
        }
      }
      function _finishSoftBlitRead() {
        _softReadPending = false;
        const next = _softReadQueued;
        _softReadQueued = null;
        if (next) _startSoftBlitRead(next);
      }
      function _startSoftBlitRead(req) {
        _softReadPending = true;
        let read;
        try { read = _readLdr(req.rt, req.w, req.h); }
        catch (_) { _finishSoftBlitRead(); return; }
        read.then(function (pack) {
          try {
            const w = pack.w, h = pack.h, src = pack.data;
            // Resize/post-fallback invalidates an older source generation. One
            // in-flight read means same-size frames stay ordered, so do not drop
            // a valid completion merely because a newer frame is queued.
            if (req.epoch !== _softReadEpoch || !_displayCanvas ||
                _displayCanvas.width !== w || _displayCanvas.height !== h) return;
            if (!_softImg || _softImg.width !== w || _softImg.height !== h) {
              _softImg = _displayCtx.createImageData(w, h);
            }
            const img = _softImg;
            let maxPx = 0;
            for (let i = 0; i < src.length; i += 4) {
              img.data[i] = src[i];
              img.data[i + 1] = src[i + 1];
              img.data[i + 2] = src[i + 2];
              img.data[i + 3] = 255;
              const s = src[i] + src[i + 1] + src[i + 2];
              if (s > maxPx) maxPx = s;
            }
            if (maxPx >= 8) {
              _displayCtx.putImageData(img, 0, 0);
              _softBlitNotify();
            }
          } catch (_) { /* 2D blit failed */ }
        }, function () { /* RT not GPU-ready this frame */ }).then(_finishSoftBlitRead);
      }
      function _queueSoftBlit(rt) {
        if (!_softBlit || !_displayCtx || !rt || typeof renderer.readRenderTargetPixelsAsync !== "function") return;
        const req = {
          rt,
          w: (rt && rt.width) || W,
          h: (rt && rt.height) || H,
          epoch: _softReadEpoch,
        };
        if (_softReadPending) {
          _softReadQueued = req;       // newest frame wins; bounded to one waiter
          return;
        }
        _startSoftBlitRead(req);
      }
      function _cancelSoftBlits() {
        _softReadEpoch++;
        _softReadQueued = null;
      }

      // ── the backend object (the ~40-member seam contract) ────────────────
      const backend = {
        backend: "three",                    // WGX precedent: backend id marker
        get isWebGPU() { return !!(renderer.backend && renderer.backend.isWebGPUBackend); },

        // lifecycle / capability
        init() { return true; },             // already initialised by create()
        resize,
        setRenderScale(s) {
          const v = Math.min(1, Math.max(0.5, +s || 0));
          if (Math.abs(v - renderScale) < 0.02) return false;   // PerfGov contract
          renderScale = v; resize(); return true;
        },
        getRenderScale() { return renderScale; },
        get width() { return W; },
        get height() { return H; },
        get aspect() { return H ? W / H : 1; },
        hdrMode() { return !!(post && post.hdrOk()); },   // M8: float scene target when the chain is up
        msaa() { return 1; },
        pcss() { return !!(shadowSys && shadowSys.S.pcssEnabled); },   // WebGPU blocker map live (tlx-shadow.js)
        isMobile,
        mobileTier,
        // GPU frame timer — the GLX gpuTimer/gpuMs contract (_gpuTimerBegin/_gpuMs in glx.js).
        // WebGPU exposes it through three's timestamp-query pass; the WebGL2
        // fallback (SwiftShader/CI via tlxForceGL) has no timestamp-query
        // feature -> {supported:false} / gpuMs()=-1, byte-identical to GLX on
        // SwiftShader. Never fabricates: gpuMs mirrors three's own resolved
        // renderer.info.render.timestamp (already in ms), populated async in
        // present() only while the timer is on.
        gpuTimer(on) {
          const sup = _gpuSupported();
          if (on !== undefined) {
            _gpuTimerOn = !!on && sup;
            try { renderer.trackTimestamp = _gpuTimerOn; } catch (_) {}
            if (!_gpuTimerOn) _gpuMs = -1;
          }
          return { supported: sup, on: _gpuTimerOn };
        },
        gpuMs() { return _gpuMs; },
        carShadowState() {
          const s = shadowSys && shadowSys.S;
          return s ? { enabled: s.carEnabled, arms: s.carArms } : { enabled: false, arms: 0 };
        },
        lampShadowState() {
          const s = shadowSys && shadowSys.S;
          return s ? { enabled: s.lampEnabled, arms: s.lampArms, idx: s.lampIdx }
                   : { enabled: false, arms: 0, idx: -1 };
        },

        // resources
        chunkedTrackCoords: false, // chunked TSL variant deliberately omits road `trk` / markings
        createMesh(data) {
          if (!data || !data.pos || !data.pos.length) return noopMesh();
          _meshMade.mesh++;
          return { __tlx: true, geo: buildGeometry(data), count: (data.idx && data.idx.length) || 0 };
        },
        createTexMesh(data) {
          if (!data || !data.pos || !data.pos.length) return noopMesh();
          _meshMade.tex++;
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(data.pos), 3));
          g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(data.nrm), 3));
          g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(data.uv), 2));
          g.setIndex(new THREE.BufferAttribute(new Uint32Array(data.idx), 1));
          return { __tlx: true, geo: g, tex: true, count: data.idx.length };
        },
        createChunkedMesh(data, cellSize) {
          if (!data || !data.pos || !data.pos.length) return noopMesh();
          _meshMade.chunked++;
          if (chunkedSys) return chunkedSys.build(data, cellSize);
          return { __tlx: true, geo: buildGeometry(data), chunked: true, count: (data.idx && data.idx.length) || 0 };
        },
        createTexture(src) {
          const t = new THREE.Texture(src);
          t.flipY = true;                       // GLX uploads UNPACK_FLIP_Y
          t.anisotropy = 4;
          t.colorSpace = THREE.NoColorSpace;    // no-sRGB calibration invariant
          t.needsUpdate = true;
          return { __tlx: true, tex: t };
        },
        freeMesh(m) { if (m && m.geo) { m.geo.dispose(); m.geo = null; } },
        freeChunkedMesh(m) {
          if (m && m.chunks && chunkedSys) { chunkedSys.free(m); return; }
          if (m && m.geo) { m.geo.dispose(); m.geo = null; }
        },
        freeTexture(t) {
          if (t && t.tex) { t.tex.dispose(); t.tex = null; return; }
          if (t && t.isTexture) t.dispose();          // a material array (createTextureArray)
        },

        // ── Baked material arrays — the GLX.createTextureArray counterpart ──
        // `images` is sparse, indexed by MAT id. three needs RAW pixels for a
        // DataArrayTexture, so each ImageBitmap is read back once through a
        // scratch WebGL2 context; GLX can hand the bitmap straight to
        // texSubImage3D, which is why this readback lives here and not in
        // js/render/assets.js. Returns null on any failure — the caller then
        // keeps the procedural look.
        //
        // WHY WEBGL AND NOT A 2D CANVAS: drawImage()+getImageData() is
        // colour-MANAGED — the 2d canvas converts the PNG's tagged pixels into
        // its own working space, and on the shipped pack that conversion
        // recentres every texel toward mid-grey (MEASURED 2026-08-17, asphalt
        // layer 16: raw upload meanR 106.5, 2d round-trip meanR 128.2). The
        // shader blends `albedo * tex.rgb * 2.0`, so 128 is exactly a no-op:
        // the whole pack silently disappeared on this backend while
        // materialMapState() reported it live. A WebGL upload with
        // UNPACK_COLORSPACE_CONVERSION/PREMULTIPLY off + readPixels returns
        // the same bytes GLX samples.
        createTextureArray(size, images, layers) {
          if (!size || !images) return null;
          try {
            const n = layers || 17;
            const data = new Uint8Array(size * size * 4 * n);
            data.fill(128);
            for (let i = 3; i < data.length; i += 4) data[i] = 255;
            const filled = readbackTextureLayers(size, images, n, data);
            if (!filled) return null;
            const t = new THREE.DataArrayTexture(data, size, size, n);
            t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
            t.colorSpace = THREE.NoColorSpace;
            t.wrapS = t.wrapT = THREE.RepeatWrapping;   // these tile across a circuit
            t.minFilter = THREE.LinearMipmapLinearFilter;
            t.magFilter = THREE.LinearFilter;
            t.generateMipmaps = true;
            t.anisotropy = 4;                            // the road is the grazing surface
            t.needsUpdate = true;
            return t;
          } catch (_) { return null; }
        },
        // Swap the loaded arrays onto tsl-lit's shared texture nodes (a .value
        // assignment, never a material rebuild) and push the per-layer world
        // scales. A falsy `maps` zeroes the scales AND restores the placeholders
        // after disposing any owned pack textures — GLX deleteTexture parity.
        setMaterialMaps(maps) {
          if (!lit || !lit.setMaterialMaps) return;
          // A caller re-passing a texture it already handed over must not have
          // it disposed under the new binding (assets.js always builds fresh
          // arrays; webbake/__apex/tests need not).
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
              try { t.dispose(); } catch (_) { /* already disposed */ }
            }
            matOwnedAlbedo = null;
            matOwnedNormal = null;
          }
          releaseOwned(maps);
          if (!maps) {
            // Restore placeholder .value bindings and zero scales.
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
          lit.setMaterialMaps(maps);
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
        castShadowChunked(mesh, model) {
          if (!shadowSys) return;
          const S = shadowSys.S;
          if (mesh && mesh.chunks && chunkedSys && S.depthPassOn) {
            const n = chunkedSys.cull(mesh, S.castCullVP || S.lightVP, null, 0);
            const vis = chunkedSys.visList;
            for (let i = 0; i < n; i++) shadowSys.castShadow(vis[i].wrap, model);
            return;
          }
          shadowSys.castShadowChunked(mesh, model);
        },
        shadowEnd() { if (shadowSys) shadowSys.shadowEnd(); },
        carShadowBegin(vp, boxScale) { if (shadowSys) shadowSys.carShadowBegin(vp, boxScale); },
        carShadowEnd() { if (shadowSys) shadowSys.carShadowEnd(); },
        lampShadowBegin(vp, idx) { if (shadowSys) shadowSys.lampShadowBegin(vp, idx); },
        lampShadowEnd() { if (shadowSys) shadowSys.lampShadowEnd(); },
        // Active light VP for instanced shadow cull (GLX shadowCullVP).
        get shadowCullVP() {
          if (!shadowSys) return null;
          const S = shadowSys.S;
          return S.castCullVP || S.lightVP;
        },
        // M9 env probe. game.js issues one face per ~2 frames on a live race
        // (gated on LT.carEnvCube>0.001, tier<1, no debug/paused cam):
        //   const inv = envFaceBegin(face, eye, frame);
        //   if (inv) { frameSky.invViewProj = inv; drawSky(frameSky);
        //              drawWorldMeshes(...); envFaceEnd(face); }
        // Returning null (no cube target, or a probe-less setup-preview frame
        // with no viewProj) makes game.js skip the pass — the self-disable
        // invariant. Full begin() is NOT called here (it would reset the
        // main-pass camera / post latch); we do mutate frame.viewProj like
        // GLX/WGX so drawWorldMeshes culls props to THIS face, push lighting
        // via lit.updateFrame, and envFaceEnd owns the face render.
        envFaceBegin(face, eye, frame) {
          if (!envRT || !lit || !eye || !frame || !frame.viewProj) return null;
          ensureEnvCam();
          if (!envCubeCam) return null;
          _envActive = true;
          envCubeCam.position.set(eye[0], eye[1], eye[2]);
          envCubeCam.updateMatrixWorld(true);
          const faceCam = envCubeCam.children[face & 7];
          if (!faceCam) { _envActive = false; return null; }
          // invViewProj for THIS face -> the sky node's ray reconstruction.
          _envVP.multiplyMatrices(faceCam.projectionMatrix, faceCam.matrixWorldInverse);
          _envInvVP.copy(_envVP).invert();
          _envInvVP.toArray(_envInvArr);
          _envVP.toArray(_envVPArr);
          // Keep probe VP / eye / cullDist on `frame` until envFaceEnd so
          // drawWorldMeshes → makeFrustumPlanes(frame.viewProj) culls
          // propBatches against the face (GLX/WGX envFaceBegin parity).
          _envFrame = frame;
          _envSvVP = frame.viewProj; _envSvEye = frame.eye; _envSvCull = frame.cullDist;
          frame.viewProj = _envVPArr; frame.eye = eye;
          frame.cullDist = _envSvCull > 0 ? Math.min(_envSvCull, ENV_CULL_M) : ENV_CULL_M;
          if (lit.updateFrame) lit.updateFrame(frame);
          return _envInvArr;
        },
        envFaceEnd(face) {
          if (!envRT || !envCubeCam || !_envActive) {
            _envActive = false;
            _restoreEnvFrame();
            return;
          }
          const faceCam = envCubeCam.children[face & 7];
          const faceVP = _envVPArr;
          const faceCull = (_envFrame && _envFrame.cullDist) || 0;
          const faceEye = (_envFrame && _envFrame.eye) || null;
          // Software GL: six world presents into a 64px cube miss the 360 s
          // test budget even after skipping city+sky (measured 2026-08-17:
          // M9 timed out at 424 s with park() done and ready still false —
          // each waitForFunction poll sat behind a SwiftShader frame).
          // Clear the face and count it; the main present still paints the
          // canvas. Real GPUs keep the full world capture.
          if (softwareGL || softGpu()) {
            try {
              renderer.setRenderTarget(envRT, face & 7);
              renderer.setClearColor(0x000000, 1);
              renderer.clear();
            } catch (_) { /* a probe face must never strand the frame */ }
            renderer.setRenderTarget(softOutRT());
            drawList.length = 0;
            _dMatUsed = 0;
            poolUsed = 0;
            _envActive = false;
            envFacesMask |= 1 << (face & 7);
            if (envFacesMask === 63) {
              envFacesMask = 0;
              envReady = true;
              _envBlank = true;
            }
            _restoreEnvFrame();
            return;
          }
          poolUsed = 0;
          for (let i = 0; i < drawList.length; i++) {
            const rec = drawList[i];
            if (rec.instanced) {
              _showInstanced(rec, i);
              continue;
            }
            if (rec.chunked) {
              // A 64px blurred cube cannot resolve the city. On software GL
              // the chunked cull+draw is the fill that made M9 miss 360 s
              // (measured 2026-08-17: six full Monza presents into the cube
              // after M5 had already left the GPU process at 387%).
              if (softwareGL || !chunkedSys) continue;
              const n = chunkedSys.cull(rec.chunked, faceVP, faceEye, faceCull);
              const vis = chunkedSys.visList;
              for (let j = 0; j < n; j++) acquireMesh(vis[j].geo, rec.m, rec.mat).renderOrder = i;
              continue;
            }
            acquireMesh(rec.geo, rec.m, rec.mat).renderOrder = i;
          }
          for (let i = poolUsed; i < meshPool.length; i++) meshPool[i].visible = false;
          const prevSky = scene.backgroundNode;
          try {
            if (lit && lit.setEnvCube && envDummy) lit.setEnvCube(envDummy.texture);
            // Software GL: the procedural sky is a second full TSL compile+
            // fill per face. Reflections stay road/terrain; the 64px cube
            // never resolved the sky disc anyway.
            if (softwareGL) scene.backgroundNode = null;
            else pinSkyMaterial();
            renderer.setRenderTarget(envRT, face & 7);
            renderer.render(scene, faceCam);
          } catch (_) { /* a probe face must never strand the frame */ }
          if (softwareGL) scene.backgroundNode = prevSky;
          renderer.setRenderTarget(softOutRT());
          if (lit && lit.setEnvCube) lit.setEnvCube(envRT.texture);
          drawList.length = 0;   // the main pass re-issues its own draws
          _dMatUsed = 0;
          poolUsed = 0;
          _envActive = false;
          envFacesMask |= 1 << (face & 7);
          if (envFacesMask === 63) {
            envFacesMask = 0; envReady = true; _envBlank = false;
            // WebGPU does not gl.generateMipmap a CubeRenderTarget the way
            // WebGL2 does (three.js #31143 / #31639). Without an explicit
            // pass, cubeTexture(..., rough*2.5) samples empty mips and chrome
            // goes black/flat. WebGL2 already auto-mips; this is a no-op there
            // when the chain already exists.
            if (renderer.generateMipmaps && envRT.texture) {
              try { renderer.generateMipmaps(envRT.texture); }
              catch (_) { /* backend without cube-mip helper: lod 0 still works */ }
            }
          }
          _restoreEnvFrame();
        },
        envProbeReady() { return envReady; },
        envProbeReset() { envFacesMask = 0; envReady = false; _envBlank = false; },

        // ── Cull-test helpers (GLX parity) ──────────────────────────────────
        // js/game/agentview.js calls GLX.makeFrustumPlanes/aabbInFrustum
        // directly, so its "what is on screen" answer runs the SAME test the
        // draw path runs. These MUST be own properties of the backend object:
        // game.js installs a backend by descriptor-copy onto GLX
        //     Object.defineProperties(GLX, Object.getOwnPropertyDescriptors(backend))
        // so a name this object does not carry leaves GLX's OWN arrow in place
        // — closing over a `CHK` that is null, because GLX.init() never ran
        // under this backend. agentview then guards with `!GLX.makeFrustumPlanes`,
        // which is TRUE for a live-but-broken function, passes, and throws one
        // line later. WGX declares the same two for the same reason; TLX had
        // neither, so __apex.scene({visible}) threw on the three.js backend.
        makeFrustumPlanes(viewProj, out) {
          return TLXShaders.makeFrustumPlanes(viewProj, out);
        },
        // Screenshot counterparts of WGX capturePixels / awaitSoftPresent.
        // WebGL2: readPixels from the canvas (Y-flip). WebGPU: three's
        // readRenderTargetPixelsAsync → copyTextureToBuffer + mapAsync on the
        // LDR target (WebGPU Fundamentals). Never getCurrentTexture().
        capturePixels() {
          const gl = ownGL || (renderer.backend && renderer.backend.gl) || null;
          if (gl && typeof gl.readPixels === "function") {
            return new Promise((resolve, reject) => {
              try {
                const w = W, h = H;
                if (!(w > 0 && h > 0)) throw new Error("no frame size");
                const raw = new Uint8Array(w * h * 4);
                gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
                const data = new Uint8ClampedArray(w * h * 4);
                for (let y = 0; y < h; y++) {
                  const src = (h - 1 - y) * w * 4;
                  data.set(raw.subarray(src, src + w * 4), y * w * 4);
                }
                resolve({ width: w, height: h, data });
              } catch (e) { reject(e); }
            });
          }
          const rt = _captureRT();
          if (!rt || typeof renderer.readRenderTargetPixelsAsync !== "function") {
            return Promise.reject(new Error(
              "three.js WebGPU screenshot needs SCREENSHOTS: 2D BLIT (or AUTO on software)"));
          }
          return _readLdr(rt).then(function (pack) {
            return { width: pack.w, height: pack.h, data: pack.data };
          });
        },
        awaitSoftPresent(timeoutMs) {
          if (!_softBlit || !_displayCtx) return Promise.resolve(_softBlitGen);
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
                try { clearTimeout(timer); } catch (_) { /* harness */ }
                resolve(gen);
              }
            };
            _softPresentWaiters.push(waiter);
          });
        },
        softPresent() { return !!_softBlit; },
        aabbInFrustum: (planes, mn, mx) => TLXShaders.aabbInFrustum(planes, mn, mx),
        aabbDist2: (mn, mx, ex, ey, ez) => TLXShaders.aabbDist2(mn, mx, ex, ey, ez),

        // TrackGraph.batches() consumer — THREE.InstancedMesh. Must be real
        // functions (not omitted): descriptor-copy onto GLX would otherwise
        // keep dead GLX closures. See backend-surface-parity.test.mjs.
        createInstancedBatch,
        cullInstances,
        drawInstanced,
        freeInstancedBatch,
        castShadowInstanced,
        begin(frame) {
          _matFrame++;   // new frame: last frame's materials are evictable again
          resize();
          _instAlive.clear();
          const z = frame && frame.skyZenith;
          const f = (z && z.length >= 3) ? z
            : ((frame && frame.fogColor) || [0.04, 0.04, 0.06]);
          scene.background.setRGB(f[0], f[1], f[2]);
          camera.matrixWorldAutoUpdate = false;
          if (frame && frame.proj && frame.invProj && frame.viewProj) {
            camera.projectionMatrix.fromArray(frame.proj);
            camera.matrixWorldInverse.multiplyMatrices(
              _tmpMat4.fromArray(frame.invProj),
              _tmpMat4b.fromArray(frame.viewProj));
            camera.matrixWorld.copy(camera.matrixWorldInverse).invert();
          } else if (frame && frame.viewProj) {
            camera.projectionMatrix.fromArray(frame.viewProj);
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
          // M7: latch the cull frustum + radial cap for present()'s chunk cull.
          if (frame && frame.viewProj) _frameVP.set(frame.viewProj);
          frameCullDist = (frame && frame.cullDist) || 0;
          _postF.proj = (frame && frame.proj) || null;
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
          _fxFrame.glow = 0; _fxFrame.particles = 0; _fxFrame.decals = 0;
          scene.backgroundNode = null;
          drawList.length = 0;
          _dMatUsed = 0;
          return true;
        },
        drawSky(frameSky) {
          if (!sky || !frameSky) return;
          sky.update(frameSky);
          // Keep the Color fallback in lockstep with the node: if this
          // frame's TSL sky fails to compile into the HDR target, the clear
          // is still zenith, not leftover fog from a previous menu frame.
          const z = frameSky.zenith || frameSky.skyZenith;
          if (z && z.length >= 3) scene.background.setRGB(z[0], z[1], z[2]);
          scene.backgroundNode = ((softwareGL || softGpu()) && sky.fallbackNode)
            ? sky.fallbackNode : sky.node;
          pinSkyMaterial();
        },
        draw(mesh, model, opts) {
          if (mesh && mesh.geo) drawList.push({ geo: mesh.geo, m: poolModelMat(model), mat: materialFor(opts, false) });
        },
        drawChunked(mesh, model, opts) {
          if (!mesh) return;
          if (mesh.chunks && chunkedSys) {
            drawList.push({ geo: null, chunked: mesh, m: poolModelMat(model), mat: materialFor(opts, true) });
          } else if (mesh.geo) {
            drawList.push({ geo: mesh.geo, m: poolModelMat(model), mat: materialFor(opts, true) });
          }
        },
        // ── M6 FX paths — each appends a draw-list record; blend/offset/mask
        // state lives on the tsl-fx materials (three applies it per material,
        // nothing leaks into the next pass — the M4 caster-bug lesson). ─────
        // Blob shadow under a car: glx.js drawShadow — the record's matrix
        // bakes uSize (model * scale(w,1,l); the quad's y=0.02 lift is in the
        // shared geometry, untouched by the scale).
        drawShadow(modelMat, w, l) {
          if (!fx || !modelMat) return;
          drawList.push({ geo: getFxQuad(), m: fxMatFor(modelMat, w, l), mat: fx.shadowMat });
          _fxFrame.shadows++;
        },
        drawMark(modelMat, w, l) {
          if (!fx || !modelMat) return;
          drawList.push({ geo: getFxQuad(), m: fxMatFor(modelMat, w, l), mat: fx.markMat });
          _fxFrame.marks++;
        },
        drawSkidBatch(verts, vertCount, dirty) {
          if (!fx || !verts || !(vertCount > 0)) return true;
          const fresh = ensureStream(skidStream, vertCount);
          if (dirty || fresh) {
            skidStream.ib.array.set(verts.subarray(0, vertCount * 5));
            uploadStream(skidStream, vertCount * 5);
          }
          skidStream.geo.setDrawRange(0, vertCount);
          drawList.push({ geo: skidStream.geo, m: null, mat: fx.skidMat });
          _fxFrame.skidVerts = vertCount;
          return true;
        },
        drawGlow(lights, str) {
          if (!fx || !lights || !lights.length || !(str > 0)) return;
          const nL = (lights.length / 15) | 0;
          ensureStream(glowStream, nL * 6);
          const out = glowStream.ib.array;
          let p = 0, nDraw = 0;
          const ex = frameEye ? frameEye[0] : 0, ey = frameEye ? frameEye[1] : 0, ez = frameEye ? frameEye[2] : 0;
          for (let i = 0; i < nL; i++) {
            const o = i * 15;
            const glareW = lights[o + 14];   // 0 = fixture-less light — no halo
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
            for (let v = 0; v < 12; v += 2) {
              out[p++] = _glowCorners[v]; out[p++] = _glowCorners[v + 1];
              out[p++] = cx; out[p++] = cy; out[p++] = cz;
              out[p++] = r; out[p++] = g; out[p++] = b;
              out[p++] = brad;
            }
            nDraw++;
          }
          if (!nDraw) return;
          fx.glowStr.value = str;
          uploadStream(glowStream, p);
          glowStream.geo.setDrawRange(0, nDraw * 6);
          drawList.push({ geo: glowStream.geo, m: null, mat: fx.glowMat });
          _fxFrame.glow = nDraw;
        },
        // Transient FX particle batch: glx.js drawParticles — `data` is the
        // particles.js interleaved stream, copied wholesale into the group's
        // slot (one call per blend group per frame; a second same-group call
        // in one frame would overwrite — particles.js never does).
        drawParticles(data, floatCount, additive) {
          if (!fx || !data || !(floatCount > 0) || !frameEye) return;
          const slot = partStreams[additive ? 1 : 0];
          const verts = (floatCount / 10) | 0;
          ensureStream(slot, verts);
          slot.ib.array.set(data.subarray(0, floatCount));
          uploadStream(slot, floatCount);
          slot.geo.setDrawRange(0, verts);
          drawList.push({ geo: slot.geo, m: null, mat: fx.particleMats[additive ? 1 : 0] });
          _fxFrame.particles += verts / 6;
        },
        drawDecal(mesh, modelMat, tex, opts) {
          if (!fx || !mesh || !mesh.geo || !tex || !tex.tex || !modelMat) return;
          drawList.push({ geo: mesh.geo, m: fxMatFor(modelMat, 1, 1),
                          mat: fx.decalMaterialFor(tex.tex, (opts && opts.glow) || 0) });
          _fxFrame.decals++;
        },
        present(opts) {
          poolUsed = 0;
          // renderOrder = submission index: three sorts opaque and transparent
          // lists by renderOrder first, so caller order (the GLX contract)
          // survives its z-sort in BOTH lists. Opaques still render before
          // the transparent FX as a group — strictly safer than GLX's inline
          // order because FX never write depth.
          for (let i = 0; i < drawList.length; i++) {
            const rec = drawList[i];
            if (rec.instanced) {
              _showInstanced(rec, i);
              continue;
            }
            if (rec.chunked) {
              const n = chunkedSys.cull(rec.chunked, _frameVP, frameEye, frameCullDist);
              const vis = chunkedSys.visList;
              for (let j = 0; j < n; j++) acquireMesh(vis[j].geo, rec.m, rec.mat).renderOrder = i;
              _chunkFrame.total += rec.chunked.chunks.length;
              _chunkFrame.visible += n;
              if (n > 0 && !rec.chunked._mirrorsFreed && !vizMat) _mirrorRelease.push(rec.chunked);
              continue;
            }
            acquireMesh(rec.geo, rec.m, rec.mat).renderOrder = i;
          }
          for (let i = poolUsed; i < meshPool.length; i++) meshPool[i].visible = false;
          // Hide InstancedMeshes that were not drawn this frame (still in scene).
          _hideUndrawnInstanced();
          // First renderer.render() is when three compiles TSL → GLSL. A
          // factory that returned is not a compiled program — Safari WebGL2
          // often throws here. tick() reports any escape as the full-screen
          // overlay ("Caught @ tick") and rethrows. The 1269 post catch then
          // retried the SAME render unwrapped, so a compile error became the
          // crash. Every paint below stays inside try; the pick is never
          // written to webgl2 (session skip + reload if even classic dies).
          const persistFail = (e) => {
            const reason = (e && e.message) || String(e);
            _lastFailure = { reason, at: Date.now() };
            try { localStorage.setItem("apex26.gfxTlxFail", reason); } catch (_) { /* blocked storage */ }
            try { sessionStorage.setItem("apex26.gfxBound", "webgl2"); } catch (_) { /* label keeps the pick */ }
            try { if (!_presentWarned) { _presentWarned = true; Log.warn("gfx", "TLX: present failed —", e); } } catch (_) { /* Log absent in the node harness */ }
          };
          const paintCanvas = () => {
            pinSkyMaterial();
            if (_softBlit) {
              const rt = _ensureBlitRT(W, H);
              renderer.setRenderTarget(rt);
              renderer.render(scene, camera);
              _queueSoftBlit(rt);
              return;
            }
            renderer.setRenderTarget(null);
            renderer.render(scene, camera);
          };
          const dropTo = (mode, mat) => {
            _drawMatMode = mode;
            const deadPost = post;
            post = null;
            _cancelSoftBlits();
            try { if (deadPost && deadPost.dispose) deadPost.dispose(); } catch (_) { /* best-effort degradation */ }
            sky = null;
            try { scene.backgroundNode = null; } catch (_) { /* node already gone */ }
            lit = null;
            fx = null;
            for (let i = 0; i < poolUsed; i++) {
              if (meshPool[i]) meshPool[i].material = mat;
            }
            // Live InstancedMeshes hold their own material reference — leave
            // them on a dead lit material and the retry render throws again,
            // burning the remaining fallback rungs in one frame. They get the
            // fallbackMat contract's instanced rung (per-instance tint attribute)
            // — plain unlitMat has no instanceTint read and paints every
            // TrackGraph batch flat.
            const instMat = mode >= 2 ? mat : unlitInstancedMat;
            for (let i = 0; i < _instRegistry.length; i++) {
              if (_instRegistry[i]) _instRegistry[i].material = instMat;
            }
          };
          const refuseTab = () => {
            if (_glPin !== "0" && _glPin !== "1") {
              try { sessionStorage.setItem("apex26.tlxAutoGL", "1"); } catch (_) { /* this tab keeps trying WebGPU */ }
            } else {
              try { sessionStorage.setItem("apex26.gfxClaimFail", "1"); } catch (_) { /* this tab keeps trying */ }
            }
            try { localStorage.removeItem("apex26.gfxBackendProbe"); } catch (_) { /* skipClaim still blocks revert */ }
            try { location.reload(); } catch (_) { /* harness: GLX attaches next real boot */ }
          };
          let painted = false;
          try {
            // Garage / menu frames only send viewProj (no proj/invProj).
            // Routing those through the HDR scene target left the
            // turntable black — software GL's half-float FBO never got
            // the car, and ?viz=scene confirmed the RT itself is empty.
            // View-space post already self-disables; paint the default
            // framebuffer like GLX.
            if (post && _postF.proj) {
              pinSkyMaterial();
              if (lit && lit.setSsrMrt) lit.setSsrMrt(true);
              if (fx && fx.setSsrMrt) fx.setSsrMrt(true);
              const _hadMrt = !!(TSL.mrt && renderer.setMRT);
              const _prevMrt = _hadMrt && renderer.getMRT ? renderer.getMRT() : null;
              if (_hadMrt) {
                renderer.setMRT(TSL.mrt({
                  output: TSL.output,
                  ssrTag: TSL.float(1),
                }));
              }
              try {
                renderer.setRenderTarget(post.sceneTarget());
                renderer.render(scene, camera);
                post.present(opts, _postF);
              } finally {
                if (lit && lit.setSsrMrt) lit.setSsrMrt(false);
                if (fx && fx.setSsrMrt) fx.setSsrMrt(false);
                if (_hadMrt) renderer.setMRT(_prevMrt || null);
              }
              if (_softBlit && post.ldrTarget) _queueSoftBlit(post.ldrTarget());
            } else {
              paintCanvas();
            }
            painted = true;
          } catch (e) { persistFail(e); }
          // Post-only death: same materials, canvas (the 1269 intent).
          if (!painted && post) {
            const deadPost = post;
            post = null;
            _cancelSoftBlits();
            try { paintCanvas(); painted = true; } catch (e) { persistFail(e); }
            finally {
              try { if (deadPost.dispose) deadPost.dispose(); } catch (_) { /* device already dying */ }
            }
          }
          if (!painted) {
            dropTo(1, unlitMat);
            try { paintCanvas(); painted = true; } catch (e) { persistFail(e); }
          }
          if (!painted) {
            dropTo(2, rawUnlitMat);
            try { paintCanvas(); painted = true; }
            catch (e) { persistFail(e); refuseTab(); }
          }
          _chunkLast.total = _chunkFrame.total; _chunkLast.visible = _chunkFrame.visible;
          for (let i = 0; i < _mirrorRelease.length; i++) chunkedSys.releaseMirrors(_mirrorRelease[i]);
          _mirrorRelease.length = 0;
          _fxLast.shadows = _fxFrame.shadows; _fxLast.marks = _fxFrame.marks;
          _fxLast.skidVerts = _fxFrame.skidVerts; _fxLast.glow = _fxFrame.glow;
          _fxLast.particles = _fxFrame.particles; _fxLast.decals = _fxFrame.decals;
          drawList.length = 0;
          _dMatUsed = 0;
          // Armed shadow flags clear AFTER the main render (GLX clears them
          // in the post-chain present; game.js re-arms every frame it runs
          // the car/lamp passes). The lit uniforms latched the armed state at
          // begin(), so this never races the frame that armed them.
          if (shadowSys) shadowSys.clearArmed();
          // M9: resolve the GPU timestamp for the frame just presented (async
          // — the value lands a frame or two later, exactly like GLX's
          // deferred query readback). Truthful: three's own resolved ms.
          if (_gpuTimerOn) {
            try {
              renderer.resolveTimestampsAsync("render")
                .then((v) => { if (v != null && isFinite(v)) _gpuMs = v; })
                .catch(() => {});
            } catch (_) {}
          }
          // debug — the __tlx tooling
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
          skyState() {
            return {
              on: !!(sky && scene.backgroundNode),
              stars: sky ? sky.uniforms.stars.value : -1,
              cloud: sky ? sky.uniforms.cloud.value : -1,
              sunDir: sky ? sky.uniforms.sunDir.value.toArray() : null,
            };
          },
          chunkState() {
            return { on: !!chunkedSys, total: _chunkLast.total, visible: _chunkLast.visible };
          },
          meshState() {
            return { mesh: _meshMade.mesh, chunked: _meshMade.chunked, tex: _meshMade.tex };
          },
          envState() {
            let face = 0;
            while (face < 6 && (envFacesMask & (1 << face))) face++;
            return { on: !!envRT, face, size: ENV_SIZE, ready: envReady, blank: _envBlank };
          },
          viz: vizMode,
          // Which three backend actually came up, and why — the one question a
          // "TLX looks wrong on my phone" report has to answer first, since the
          // WebGPU/WebGL2 choice is now device-dependent (see the pin above).
          backendState() {
            return {
              api: (renderer.backend && renderer.backend.isWebGPUBackend) ? "webgpu" : "webgl2",
              forceWebGL, pin: _glPin, autoStayGL: _autoStayGL, hasGpu: _hasGpu,
              isMobile, mobileTier, isWebKit, liteGpu: _liteGpu,
              softwareGL, softAdapter: _softAdapter,
              softBlit: _softBlit, capPref: _capPref,
            };
          },
          materialCacheSize() { return matCache.size; },
          async shader(idx = 0) {
            const meshes = scene.children.filter((o) => o.isMesh && o.visible);
            const target = meshes[idx];
            if (!target) return null;
            const out = await renderer.debug.getShaderAsync(scene, camera, target);
            return { vertex: out.vertexShader, fragment: out.fragmentShader };
          },
        },
      };

      try { localStorage.removeItem("apex26.gfxTlxFail"); } catch (_) { /* blocked storage */ }
      try { sessionStorage.removeItem("apex26.gfxBound"); } catch (_) { /* blocked storage */ }
      try { window.dispatchEvent(new Event("apex-gfx-live")); } catch (_) { /* no window */ }
      _lastFailure = null;
      try { Log.info("gfx", "TLX bind ok"); } catch (_) { /* harness */ }
      return backend;
    } catch (e) {
      return _fail((e && e.message) || e);   // any failure -> GLX fallback (Gfx.create contract)
    }
  }

  return { create, lastFailure: () => _lastFailure };
})();

if (typeof window !== "undefined") window.TLX = TLX;
