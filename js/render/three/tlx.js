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

      // ── PHONES GET TLX WHEN THEY PICK IT (decision 2026-09-02) ──────────
      // three retains the CPU copy of every geometry attribute (71.5 MB /
      // 5,665 buffers vs GLX 17.8 MB / 253) and that has jetsam-killed an
      // iPhone tab mid-race; releasing the arrays was DISPROVED live
      // (docs/PERF-FINDINGS.md 2m). The gate declined phones by default until
      // the owner chose three on phones despite the risk: now an OPT-OUT
      // (apex26.tlxMobile="0"), with the boot canary (gfxBackendProbe reverts
      // a load that never presented) and the RENDERER button as the way back.
      const _mobileOptOut = (function () {
        try { return localStorage.getItem("apex26.tlxMobile") === "0"; } catch (_) { return false; }
      })();
      if (isMobile && _mobileOptOut) {
        return _fail("mobile: three declined by apex26.tlxMobile=0 (three retains ~54 MB of CPU geometry copies; remove the key to try it again)");
      }
      if (isMobile) Log.warn("gfx", "TLX on a phone: three keeps ~54 MB of CPU geometry copies — a jetsam mid-race reverts to WebGL2 at the next boot; apex26.tlxMobile=0 declines");

      const THREE = await import("three/webgpu");
      const TSL = await import("three/tsl");

      THREE.ColorManagement.enabled = false;

      // The vendored bundle carries TWO local patches (swizzle omission for
      // Chromium 141, the #33952 bind-group-leak backport) — recipe and
      // rationale in vendor/three-0.185.1/PATCHES.md, guarded by
      // gfx-backend-canary. Re-apply both on any vendor bump.

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
      // GPU error tally — see the onuncapturederror hook below.
      let _gpuErrors = 0, _gpuFirstError = null;
      const GPU_ERR_LOG_CAP = 8;
      // Headless is a fact about PRESENTATION, not about silicon: headless
      // Chromium on a real GPU IS hardware. It belongs to _softBlit (which
      // exists because a headless swapchain does not composite) and never
      // here. This clause is what made the one machine that can test a
      // player's path — macos-latest, Apple/Metal, measured anyHardware:true —
      // take the software half of every content skip instead.
      const _headless = /HeadlessChrome/i.test(ua);
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
            // An EMPTY adapter.info is UNKNOWN, not software. Browsers trim
            // these fields to limit fingerprinting — Chrome already reports
            // architecture and device as "" on the Apple adapter, and only
            // vendor:"apple" kept it clear of the old infoEmpty clause. A
            // player whose browser returns no vendor string would have been
            // handed the degraded path on real hardware, which is this bug
            // reachable with no CI involved. Break the tie on LIMITS, measured
            // 2026-08-28: SwiftShader and llvmpipe both report
            // maxTextureDimension2D 8192 / maxBufferSize 1 GiB; the Apple
            // adapter reports 16384 / 2 GiB.
            const lim = ad.limits || null;
            const smallLimits = !!(lim && (lim.maxTextureDimension2D <= 8192
              || lim.maxBufferSize <= 1073741824));
            const named = /swiftshader|llvmpipe|lavapipe|microsoft basic render|soft/.test(infoBlob);
            _softAdapter = !!(ad.isFallbackAdapter || named || (!infoBlob && smallLimits));
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
      let _softBlit = !forceWebGL && _capPref !== "0" && !!(_softAdapter || _headless || _capPref === "1");
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
          // GPU ERROR CAPTURE — the instrument this backend never had. WGX has
          // hooked onuncapturederror since it shipped; TLX hooked nothing, so
          // Dawn could reject work on every frame and say it to nobody. That is
          // not hypothetical: a black three-on-WebGPU frame was chased for a
          // whole session with `gpuErrors: null` on every probe, which meant
          // "no reader", not "no errors". Count, log a bounded prefix (a flood
          // would evict Log's ring buffer and destroy the rest of the
          // evidence), and expose the total. Diagnosis only — deliberately NOT
          // WGX's escalate-and-fall-back ladder, which would hide the signal.
          if (!_dev.__apexErrHook) {
            try {
              _dev.onuncapturederror = function (ev) {
                const msg = (ev && ev.error && ev.error.message) || "gpu error";
                if (!_gpuFirstError) _gpuFirstError = msg;
                _gpuErrors++;
                if (_gpuErrors <= GPU_ERR_LOG_CAP) {
                  try { Log.warn("gfx", "TLX GPU error #" + _gpuErrors + ":", msg); } catch (_) { /* no Log in the node VM harness: the count is the load-bearing part */ }
                  if (_gpuErrors === GPU_ERR_LOG_CAP) {
                    try { Log.warn("gfx", "TLX: further GPU errors suppressed — read the count from GLX.gpuErrors()"); } catch (_) { /* same */ }
                  }
                }
              };
              _dev.__apexErrHook = true;
            } catch (_) { /* optional hook; _gpuErrors stays 0 if the build refuses it */ }
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
      _softBlit = !forceWebGL && _capPref !== "0" && !!(_softAdapter || _headless || _capPref === "1");
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
      // PRESENTATION needs the 2D blit whenever the native swapchain does not
      // composite — software adapter OR headless. CONTENT is a different
      // question and must not inherit that: headless Chromium on a REAL GPU is
      // hardware, and gating content on the blit is what made the macOS runner
      // (Apple/Metal, verified `anyHardware: true`) run the software half of
      // every skip — env probe cleared, batches dropped, fallback sky — so the
      // one machine that could test the player's path tested the other one.
      // softOutRT asks softGpu(); the content gates ask _softAdapter.
      function softGpu() { return !!(_softAdapter || _softBlit); }
      // apex26.tlxForceBatches=1 — run the INSTANCED draws (and their shadow
      // casters) even on a software adapter. The skips below exist for a Dawn
      // binding defect, but Dawn is Chrome's WebGPU implementation on real GPUs
      // too, so gating the workaround on softGpu() means the path real hardware
      // takes is the one nothing here ever executes. This switch lets a
      // software run exercise the REAL-GPU code path against the same Dawn, so
      // the defect is reproducible where it can be debugged.
      const _forceBatches = (function () {
        try { return localStorage.getItem("apex26.tlxForceBatches") === "1"; } catch (_) { return false; }
      })();
      // apex26.tlxForceHw — run the CONTENT paths a real GPU takes, on a
      // software adapter. The skips below are BUDGET guards for
      // SwiftShader/Lavapipe, not correctness fixes, so a software session
      // takes the software side of every one of them and never executes the
      // code a player's GPU runs — which makes a black real-GPU frame
      // unreproducible here by construction. llvmpipe reports
      // conformanceVersion 1.3.1.1, so Dawn on top of it is a valid
      // correctness oracle; it is only slow. PRESENTATION stays soft
      // (softOutRT / the 2D blit): that is the only part software genuinely
      // cannot do.
      //
      // Value is a comma list so ONE gate can be forced at a time — forcing
      // them all at once costs more llvmpipe seconds than a present budget
      // has, and a timeout would not say which path did it:
      //   sky | env | chunked | batches | shadow   (or "1" / "all")
      const _forceHw = (function () {
        let raw = "";
        try { raw = localStorage.getItem("apex26.tlxForceHw") || ""; } catch (_) { raw = ""; }
        const set = new Set(String(raw).split(",").map((p) => p.trim()).filter(Boolean));
        const all = set.has("1") || set.has("all");
        return { on: all || set.size > 0, has: (part) => all || set.has(part) };
      })();
      // Content skips ask these, not softGpu()/softwareGL, so the switches reach them.
      function skipBatches() { return _softAdapter && !_forceBatches && !_forceHw.has("batches"); }
      function softContent(part) { return (softwareGL || _softAdapter) && !_forceHw.has(part); }
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
          return fam + "|" + attrs + "|" + idx + "|" + inst + "|" + attachKey();
        };
      }
      // ...but the ATTACHMENT STATE has to stay in the key. A WGSL fragment
      // entry writes @location(0..n-1) for the pass it was built for and the
      // pipeline bakes those formats in, so a program is not portable between
      // targets. three's own key carries this through contextNode.id/version —
      // which is exactly what the replacement above drops. Without it the
      // 2-target scene pass's Background program is reused in the 1-target
      // env-probe pass, Dawn rejects the SetPipeline, the whole command
      // buffer is discarded, and every probe face comes back black. Measured
      // 2026-08-28 with the probe forced on (apex26.tlxForceHw=env): 290
      // uncaptured errors, "Attachment state of [RenderPipeline
      // renderPipeline_Background.material_48] is not compatible with
      // [RenderPassEncoder]" — pass expects 1 colorTarget, pipeline has 2.
      // Dawn validates the same on real hardware, so this is a PLAYER bug and
      // not a software-adapter artifact; it is invisible in CI only because
      // the probe is skipped there. The distinct targets are a small fixed set
      // (scene MRT / env cube / shadow / blit), so this costs a handful of
      // programs, not the 593 the lights hash cost.
      // Only the OUTPUT COUNT belongs here. What forks the WGSL is how many
      // `@location(n)` the fragment entry writes; formats, sample count and
      // blend really are pipeline state on the separate pipeline cache, as the
      // note above says. Keying on format/samples as well re-opened the
      // compile storm — the default soft-present run then missed its 60 s
      // budget twice (measured 2026-08-28). Count + MRT flag is two variants:
      // the 2-target scene pass, and everything else.
      function attachKey() {
        try {
          const rt = renderer.getRenderTarget();
          const n = rt ? (rt.textures ? rt.textures.length : 1) : 1;
          const mrt = renderer.getMRT ? renderer.getMRT() : null;
          return n + (mrt ? "m" : "");
        } catch (_) { return "?"; }
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
      // apex26.tlxShadowOff=1 drops the shadow pass — a MEMORY lever, sibling of
      // envProbeOff/perChunkOff. Worth 40.4 MB on the iPhone profile
      // (149.0 -> 108.6 MB in race, montreal; PERF-FINDINGS 2q), which is the
      // whole justification — the upstream thread below is what prompted the
      // measurement, NOT evidence for it, and the distinction matters:
      // yisky on three.js PR #33682 (2026-06-29, not the #32409 reporter)
      // retested r185 and posted "with shadows disabled ... cleanup appears to
      // behave normally", with a tentative path of DirectionalLightShadow ->
      // shadow.camera -> RenderList -> render item -> geometry. They label it
      // "a tentative observation rather than a confirmed diagnosis", and it is
      // a WebGPURenderer report — our 40.4 MB is measured on three's WebGL2
      // path, so the same mechanism is UNPROVEN here. The knob stands on the
      // measurement alone.
      const _shadowOff = (function () {
        try { return localStorage.getItem("apex26.tlxShadowOff") === "1"; } catch (_) { return false; }
      })();
      try {
        if (!_shadowOff && window.TLXShaders && TLXShaders.shadowSys) {
          // Shrink maps on software WebGPU too (detectSoftwareGL is WebGL-only
          // and returns false once the hidden canvas is a WebGPU context).
          shadowSys = TLXShaders.shadowSys(THREE, TSL, {
            renderer, mobileTier, isMobile, softwareGL: softContent("shadow"),
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
          // maxLights: see tsl-lit.js — 48 lamp array rows overrun the WebGL2
          // fragment-uniform floor (224) once three/TSL adds its own block, so
          // the lit shader fails to LINK on iOS Safari and every lit surface
          // draws nothing. Same _liteGpu gate as samples/outputType above.
          lit = TLXShaders.lit(THREE, TSL, { chunks, shadow: shadowSys, ssrTag: !!post,
            envCube: envRT ? envRT.texture : null, matMaps,
            maxLights: _liteGpu ? 16 : 48 });
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
          // isWebGPU feeds the pack's vertex-format rule (tlx-chunked.js
          // packAttr `fmt24`): WebGPU has no 1- or 3-wide 8/16-bit formats.
          chunkedSys = TLXShaders.chunked(THREE, {
            isWebGPU: () => !!(renderer.backend && renderer.backend.isWebGPUBackend),
          });
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
      const _matDispose = [];   // evicted materials; disposed in present() after paint
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
            // dispose() is DEFERRED, not skipped: the vendored bundle carries
            // the #33952 backport (PR #33954, vendor PATCHES.md) so disposing
            // no longer leaks shared texture bindGroups — but drawList may
            // still point at the evicted material until present() flushes, so
            // it goes on _matDispose and present() disposes it after paint.
            // Releasing the lit registry entry is what lets the JS object go
            // — setSsrMrt held every minted material forever, so its loop
            // grew and evictions freed nothing.
            for (const [k, v] of matCache) {
              if (v && v.__tlxFrame === _matFrame) continue;
              matCache.delete(k);
              if (lit.releaseMaterial) lit.releaseMaterial(v);
              if (v) _matDispose.push(v);
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
        // Straight into the attribute array — the Matrix4.fromArray/setMatrixAt
        // round trip copied every instance twice — and an UPDATE RANGE: with
        // none, needsUpdate uploads the whole cap x 64 B (+ cap x 12 B) every
        // frame the frustum moves (20 k instances = 1.5 MB/frame; audit 2026-09-02).
        const im = imesh.instanceMatrix, ia = im.array;
        const nf = drawN * 16;
        for (let i = 0; i < nf; i++) ia[i] = matrices[i];
        if (colors && colors.length && col) {
          const ca = col.array, nc = drawN * 3;
          for (let i = 0; i < nc; i++) ca[i] = colors[i];
        }
        im.clearUpdateRanges(); im.addUpdateRange(0, nf);
        im.needsUpdate = true;
        if (col) { col.clearUpdateRanges(); col.addUpdateRange(0, drawN * 3); col.needsUpdate = true; }
        imesh.count = drawN;
      }
      // Caller-packed set (DebrisWorld's Rapier pools, PERF-FINDINGS 2h): the
      // transforms are new every frame and the only question is how many are
      // live. Without this the per-body loop drew each cone/shard/marble/panel
      // as its own render object (17 steady, 98 in a pileup). The cull snapshot
      // is cleared for the same reason as GLX/WGX: these bytes came from no
      // frustum, so a later cullInstances must not claim them.
      function updateInstances(batch, matrices, n) {
        if (!batch || !batch.imesh) return 0;
        const v = Math.max(0, Math.min(batch.instances | 0, n | 0));
        _writeInstanceMatrices(batch.imesh, matrices, null, v);
        batch.visible = v;
        batch._cullPlanes = null;
        return v;
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
        if (skipBatches()) return;
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
        if (skipBatches()) return;
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
      // ── the mesh pool is keyed on (geometry, material), NOT on draw order ──
      // MEASURED (docs/PERF-FINDINGS.md 2o): a flat `meshPool[poolUsed]` gave
      // wrapper #0 whatever geometry happened to be first that frame, and the
      // pairing churned as the cull result changed. three's WebGPURenderer
      // caches a render object AND its bind groups keyed on the object
      // together with its material and geometry, so every new triple minted a
      // cache entry that was never released — a 4-minute race soak climbed
      // 119.9 -> 244.2 MB (GLX on the same loop: 47.0 -> 47.5) and V8's
      // sampling profiler put createRenderObject and _createBindings at the
      // top. The pool was bounded; the cache behind it was not.
      //
      // Keyed, a given wrapper always carries the same pair, so the number of
      // cache keys is bounded by the DISTINCT DRAWS the scene has rather than
      // by frames elapsed.
      // ── the SSR MRT node is built ONCE ────────────────────────────────
      // This was `renderer.setMRT(TSL.mrt({…}))` inline in present(), so a NEW
      // node was constructed every frame. three keys its render-context cache
      // on a STRING containing mrt.id:
      //     const i = fmt + "-" + (mrt !== null ? mrt.id : "default") + "-" + lvl;
      //     if (this._renderContexts[i] === undefined) … = new RenderContext();
      // — a plain object that never evicts. So each frame minted a permanent
      // context, and every object/material had to be re-created against it.
      // MEASURED (docs/PERF-FINDINGS.md 2p): distinct renderContexts climbed
      // 40 → 76 → 112 → 148 across four 15 s samples, dead linear, while the
      // object count stayed at ~217 and material at ~40; ~2,150
      // createRenderObject calls per interval, forever, and the heap with them.
      //
      // The node's contents are frame-invariant (output, a constant 1.0), so
      // building it once is not a cache — it is the correct lifetime.
      let _ssrMrt = null;
      function _ssrMrtNode() {
        if (!_ssrMrt) _ssrMrt = TSL.mrt({ output: TSL.output, ssrTag: TSL.float(1) });
        return _ssrMrt;
      }
      const meshPool = [];          // every wrapper ever made — the sweep walks this
      const meshByGeo = new Map();  // geometry -> Map(material -> Mesh)
      let poolUsed = 0;             // acquired THIS batch — diagnostics only, never an index
      // Batch stamp: bumped wherever the old code reset poolUsed to 0. A mesh
      // not stamped with the current batch is not being drawn and gets hidden.
      let _poolBatch = 0;
      let _pruneLast = 0;
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
      // A probe face that THREW used to be counted like a good one: six of
      // them latch envReady over a cube nothing ever wrote, and every lit
      // surface then samples black. Count the failures instead, and keep the
      // last good cube bound.
      let _envFailN = 0, _envFailMsg = "", _envFailStack = "";
      // Dawn does not THROW when it rejects a pipeline: renderer.render()
      // returns normally and the command buffer is discarded, so a face can
      // come back unwritten with faceOk still true. That is exactly how a
      // black env cube got bound and lit the whole world from black. Watch the
      // uncaptured-error tally across the six faces instead — errors during a
      // probe mean the probe's own commands did not run.
      let _envErrBase = -1, _envBadProbes = 0, _envGaveUp = false;
      // Has the probe ever asked for a single face? game.js gates it on
      // PerfGov.tier() < 1 (js/game.js "Live env probe"), so on every phone-tier
      // device envFaceBegin is NEVER called: envReady cannot latch, _envGaveUp
      // cannot flip (that latch only trips inside the probe path), and envRT is
      // allocated at init regardless. The mirror-release gate below reads
      // `envReady || _envGaveUp || !envRT`, which is therefore permanently
      // false on phones — measured gate "--T", drains 23, sweeps 0. That
      // silently disabled the CHUNKED release too, on exactly the devices it
      // exists for. A gate needs a term for "the probe is not coming".
      let _envEverAsked = false, _envFirstPaintAt = 0;
      function _envNeverComing() {
        if (_envEverAsked || !_envFirstPaintAt) return false;
        const t = typeof performance !== "undefined" ? performance.now() : Date.now();
        return (t - _envFirstPaintAt) > 5000;
      }
      let _envFaceErr = false;   // an uncaptured error DURING one of this cycle's six face renders
      const ENV_PROBE_TRIES = 3;
      const ENV_FAIL_CAP = 24;   // 4 probes x 6 faces
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

      // Keying on the geometry means the map holds a STRONG reference to it, so
      // a keyed pool with no eviction just trades three's unbounded cache for
      // one of our own: a chunk the game frees, or a debris geometry that goes
      // away, would be pinned here forever. Drop wrappers nothing has drawn
      // for a while, and the geometry goes with them.
      //
      // Cadence on the CLOCK, never a frame count — rAF runs at a fraction of
      // a Hz on a software rasteriser, where a "% N frames" gate fires either
      // never or constantly (measured, PERF-FINDINGS 2n).
      const PRUNE_EVERY_MS = 5000, PRUNE_IDLE_MS = 20000;
      function prunePool(now) {
        if (now - _pruneLast < PRUNE_EVERY_MS) return;
        _pruneLast = now;
        let w = 0;
        for (let i = 0; i < meshPool.length; i++) {
          const m = meshPool[i];
          if (now - (m.__tlxSeen || 0) < PRUNE_IDLE_MS) { meshPool[w++] = m; continue; }
          try { if (m.parent) m.parent.remove(m); } catch (_) { /* already detached */ }
          const byMat = meshByGeo.get(m.geometry);
          if (byMat) {
            // Drop the wrapper from its occurrence list; an emptied list and an
            // emptied per-geometry map go with it.
            const list = byMat.get(m.material);
            if (list) {
              const at = list.indexOf(m);
              if (at >= 0) list.splice(at, 1);
              if (!list.length) byMat.delete(m.material);
            }
            if (!byMat.size) meshByGeo.delete(m.geometry);
          }
          // NEVER dispose the geometry or the material here — both are owned by
          // the caller (tracks.js, the chunk system, matCache) and are still
          // live. Only the wrapper is ours to drop.
          m.geometry = null; m.material = null;
        }
        meshPool.length = w;
      }

      // (geometry, material, OCCURRENCE) — not (geometry, material). One
      // wrapper per pair handed every same-pair draw of a batch the SAME
      // Mesh, each overwriting the last one's matrix: 21 of 22 blob shadows,
      // both front and both rear wheels of every car, the second car of
      // every team (one shared paint scratch) and the debris cones all
      // vanished on TLX (renderer audit 2026-09-02, CONFIRMED from the
      // pool code; the "45 % fewer render objects" of c9f4dbea was partly
      // draws being dropped). The per-material list is stamped with the
      // batch and its counter reset once per present, so wrapper identity
      // stays stable per (geo, mat, k) and three's cache stays bounded.
      function acquireMesh(geo, matrixArr, material) {
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
          meshPool.push(m);
        }
        // Assigned anyway: the pair is what the mesh was KEYED on, so these are
        // no-ops in steady state — and a no-op assignment is what keeps three's
        // cache key stable instead of minting a new one.
        m.geometry = geo;
        m.material = mat;
        geo.__tlxDrawnBatch = _poolBatch;   // uploaded by the render that closes THIS batch
        m.__tlxBatch = _poolBatch;
        m.__tlxSeen = (typeof performance !== "undefined" ? performance.now() : Date.now());
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
      // Every geometry this backend creates, held WEAKLY — a census that
      // retains what it measures is a leak, not an instrument.
      const _geoReg = [];
      // ── STATIC-GEOMETRY MIRROR RELEASE ──────────────────────────────────
      // The non-chunked half of the lever chunkedSys.releaseMirrors() already
      // pulls. A post-GC heap snapshot says why it is worth pulling: on the
      // iPhone profile in race, JSArrayBufferData is 49.43 MB of TLX's 99.41
      // against GLX's 17.82 of 48.89 — 31.6 MB of the 50.5 MB gap — while
      // every named three object class TOGETHER is +3.75 MB. The node graphs
      // and RenderObjects are not the cost; the CPU mirrors are, exactly as
      // 2m said before 2n mis-attributed them. Evidence: PERF-FINDINGS 2r.
      //
      // Safe for reasons that DO NOT generalise — check them before widening:
      //  - every pooled mesh (acquireMesh) and every InstancedMesh sets
      //    frustumCulled = false, so three never calls computeBoundingSphere()
      //    and so never reads position.array to cull. A geometry that IS
      //    frustum-culled would be culled to nothing by this.
      //  - the array is swapped for a ZERO-LENGTH array of the same class, not
      //    null: draw()'s `index.array.BYTES_PER_ELEMENT` still resolves, and
      //    .count is a plain property set once in the BufferAttribute
      //    constructor (`this.count = t.length / e`), so it is untouched.
      //  - only AFTER a completed render: __tlxDrawnBatch is stamped when the
      //    mesh is acquired and must be strictly older than the current batch,
      //    so the upload has happened. Releasing before first draw uploads
      //    nothing and the mesh vanishes.
      //  - instanced and DynamicDrawUsage attributes are skipped: those ARE
      //    version-bumped, and updateAttribute() would then bufferSubData a
      //    zero-length array — a silent no-op instead of the new data.
      function releaseGeoMirrors(g) {
        if (!g || g.__tlxFreed) return 0;
        // THE BOUNDS ARE READ FROM THE POSITIONS THIS IS ABOUT TO EMPTY.
        // frustumCulled=false covers the cull, but it is not the only reader:
        // three's render walk does `sortObjects && (geometry.boundingSphere ===
        // null && geometry.computeBoundingSphere())` for EVERY drawn object
        // (vendored r185, WebGPURenderer projectObject), culled or not. Against
        // a zero-length array with a non-zero count that computes a NaN centre
        // and radius, which poisons the sort key and any later reader. Cache
        // the bounds while the data is still here; non-null is what stops
        // three from ever looking again. Refuse to free anything whose bounds
        // will not compute — an unmeasurable geometry is one this cannot make
        // safe.
        try {
          if (!g.boundingSphere) g.computeBoundingSphere();
          if (!g.boundingBox) g.computeBoundingBox();
        } catch (_) { return 0; }
        const _bs = g.boundingSphere;
        if (!_bs || !(_bs.radius >= 0) || !_bs.center
            || !(Math.abs(_bs.center.x) >= 0) || !(Math.abs(_bs.center.y) >= 0)
            || !(Math.abs(_bs.center.z) >= 0)) return 0;
        let freed = 0;
        const drop = (a) => {
          if (!a || !a.array || !a.array.length) return;
          if (a.isInstancedBufferAttribute || a.usage === THREE.DynamicDrawUsage) return;
          freed += a.array.byteLength;
          a.array = new a.array.constructor(0);
        };
        const atts = g.attributes;
        for (const k in atts) drop(atts[k]);
        // NEVER the index. three's WebGPU backend sizes the index buffer from
        // the array's byte length, so a zero-length array yields a ZERO-BYTE
        // index buffer and every indexed draw fails validation. Measured on
        // real hardware (gpu-census run 26, macos-latest/Metal): "Index range
        // (first: 0, count: 15, format: IndexFormat::Uint32) does not fit in
        // index buffer size (0)", 8 uncaptured GPU errors on the WebGPU leg
        // while the WebGL2 control leg reported 0 — WebGL2 tolerates it and
        // WebGPU does not, which is why a tlxForceGL=1 measurement here looked
        // clean. Vertex attributes are sized from count/itemSize and are fine.
        g.__tlxFreed = true;
        return freed;
      }
      let _mirrorSweepAt = 0;
      const _mirrorStat = { sweeps: 0, geos: 0, freedMB: 0, drains: 0, gate: "?" };
      // Throttled on performance.now(), never a frame counter: a frame counter
      // is not a clock, and the first attempt at this lever shipped
      // `(++n % 90) === 0` that never once fired (PERF-FINDINGS 2m).
      function sweepGeoMirrors(now) {
        // NOT ON A PHONE, until a handset says otherwise. The owner's phone
        // (2026-09-02, TLX bound, LOW preset = tier 4) rendered NO road and a
        // car in disconnected pieces while terrain and sky were fine — the
        // signature of geometry read after its mirror went. Tier >= 3 is the
        // only configuration that exposes the road to this sweep at all:
        // game.js builds ribbons chunked only below tier 3, and chunk geos are
        // skipped below because chunkedSys owns them. So a phone on LOW is the
        // one place a plain ROAD mesh reaches here, and no software probe can
        // see it (lavapipe renders the road at every tier — measured). The
        // desktop win (PERF-FINDINGS 2r) is untouched; re-open this only with
        // evidence from a real handset.
        if (isMobile) return;
        if (now - _mirrorSweepAt < 2000) return;
        _mirrorSweepAt = now;
        _mirrorStat.sweeps++;
        let freed = 0;
        for (let i = 0; i < _geoReg.length; i++) {
          const ref = _geoReg[i];
          const g = ref && ref.deref ? ref.deref() : null;
          if (!g || g.__tlxFreed) continue;
          if (g.__tlxKind === "chunk" || g.__tlxKind === "chunked") continue;   // chunkedSys owns those
          // Drawn at least once. NOT `__tlxDrawnBatch < _poolBatch`: every
          // visible geometry is re-acquired EVERY frame, so the stamp is
          // refreshed to the current batch before this sweep runs, and that
          // test could only ever fire for geometry that had STOPPED being
          // drawn — the opposite of the target. Measured geos:0 freedMB:0.
          // This sweep runs after paintCanvas(), so the batch is uploaded.
          if (g.__tlxDrawnBatch === undefined) continue;
          const n = releaseGeoMirrors(g);
          if (n) { freed += n; _mirrorStat.geos++; }
        }
        if (freed) _mirrorStat.freedMB = +(_mirrorStat.freedMB + freed / 1048576).toFixed(2);
      }

      function _regGeo(g, kind) { try { g.__tlxKind = kind; _geoReg.push(new WeakRef(g)); } catch (_) { /* no WeakRef: census degrades, nothing leaks */ } return g; }
      // Attributes go through TLXShaders.packAttr: it range-scans each source
      // and quantises ONLY what provably fits (colour 8-bit, unit normal 16,
      // MAT id 0..16), keeping Float32 otherwise, and backs an absent source
      // with a view into one shared zero buffer instead of a fresh array per
      // mesh. `trk` is the reason that last part exists — every mesh that is
      // not the road carries a zero-filled one, measured at 5.88 MB across 153
      // meshes on montreal, and the lit shader reads it unconditionally on the
      // non-chunked variant so it cannot simply be dropped.
      const _pk = (typeof TLXShaders !== "undefined" && TLXShaders.packAttr) || null;
      function buildGeometry(data) {
        const g = new THREE.BufferGeometry();
        const pos = data.pos.length ? data.pos : [0, 0, 0];
        const verts = pos.length / 3;
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
        if (_pk) {
          // fmt24: WebGPU has no 1- or 3-wide 8/16-bit vertex format, and
          // three names 'float16x3' / 'uint32' for them — pipeline refused
          // (tlx-chunked.js packAttr, PERF-FINDINGS 2n). Same rule, same arg.
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
        }
        return _regGeo(g, "mesh");
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
      // The viewport this cache was last taken against, and how long to keep
      // distrusting it. See the settle block in resize().
      let cssVW = -1, cssVH = -1, cssRecheck = 0;
      const CSS_RECHECK_FRAMES = 30;
      const markCssDirty = () => { cssDirty = true; };
      if (typeof window !== "undefined" && window.addEventListener) {
        window.addEventListener("resize", markCssDirty);
        window.addEventListener("orientationchange", markCssDirty);
      }
      // Registered OUTSIDE the addEventListener check, as GLX and WGX both do:
      // an engine with ResizeObserver but no addEventListener would otherwise
      // get no invalidation signal at all.
      if (typeof ResizeObserver === "function" && _layoutCanvas) {
        try { new ResizeObserver(markCssDirty).observe(_layoutCanvas); } catch (_) {}
      }
      function resize() {
        // CSS size only — NEVER fall back to canvas.width/.height. setSize() below
        // writes the backing store, so reading it back here fed the previous frame's
        // size into the DPR multiply: a hidden/detached canvas (clientWidth 0) then
        // doubled its render target every begin() until allocation failed. GLX and
        // WGX both read clientWidth with a floor of 1 for the same reason.
        // Soft-present: the hidden GPU canvas is 1×1 CSS — layout is #game.
        // Same settle window as GLX cssSize(): the dirty flag is edge-triggered
        // and consumed unconditionally, so one read that lands before the box
        // has reflowed latches the PREVIOUS viewport's size for the rest of the
        // session (docs/PERF-FINDINGS.md §2u). innerWidth/innerHeight are
        // viewport metrics, not element layout, so this costs no reflow.
        if (typeof window !== "undefined") {
          const vw = window.innerWidth | 0, vh = window.innerHeight | 0;
          if (vw !== cssVW || vh !== cssVH) {
            // First observation records without arming — see GLX cssSize().
            const first = cssVW < 0;
            cssVW = vw; cssVH = vh;
            if (!first) cssRecheck = CSS_RECHECK_FRAMES;
          }
        }
        if (cssDirty || cssW <= 0 || cssH <= 0 || cssRecheck > 0) {
          if (cssRecheck > 0) cssRecheck--;
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
        // presentedTarget() follows ?viz= (it returns ldrRT normally, the viz
        // dest in viz mode) — ldrTarget() alone made every viz bisect read a
        // stale RT on the soft path. Fall back for an older post module.
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
        // MUST be an explicit false, not an absence: game.js installs backends
        // by descriptor-copy onto GLX, so a missing name would inherit GLX's
        // `true` and the game would feed TLX a per-chunk bake it cannot bind
        // (shared node-material uniforms — per-chunk sets would mint a program
        // per chunk, the pinProgram lesson).
        hasPerChunkLights: false,
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
          return { __tlx: true, geo: _regGeo(g, "tex"), tex: true, count: data.idx.length };
        },
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
          // "A probe that cannot succeed must stop being retried" — the
          // producer half. After the give-up latch flipped, game.js kept
          // calling this every 4th frame and every face threw/warned for the
          // life of the session (the Metal case, 2026-08-29).
          if (_envGaveUp) return null;
          _envEverAsked = true;
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
          if (softContent("env")) {
            try {
              renderer.setRenderTarget(envRT, face & 7);
              renderer.setClearColor(0x000000, 1);
              renderer.clear();
            } catch (_) { /* a probe face must never strand the frame */ }
            renderer.setRenderTarget(softOutRT());
            drawList.length = 0;
            _dMatUsed = 0;
            poolUsed = 0; _poolBatch++;
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
          poolUsed = 0; _poolBatch++;
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
              if (softContent("chunked") || !chunkedSys) continue;
              const n = chunkedSys.cull(rec.chunked, faceVP, faceEye, faceCull);
              const vis = chunkedSys.visList;
              for (let j = 0; j < n; j++) acquireMesh(vis[j].geo, rec.m, rec.mat).renderOrder = i;
              continue;
            }
            acquireMesh(rec.geo, rec.m, rec.mat).renderOrder = i;
          }
          for (let i = 0; i < meshPool.length; i++) { const pm = meshPool[i]; if (pm.__tlxBatch !== _poolBatch) pm.visible = false; }
          const prevSky = scene.backgroundNode;
          // Baseline at the first face of each probe pass.
          if (envFacesMask === 0) { _envErrBase = _gpuErrors; _envFaceErr = false; }
          // Per-FACE window. The old cycle-wide compare (face 0 .. face 5 is
          // ~20 main frames) discarded a good cube for any unrelated error in
          // between — a post pass, a decal, a driver's steady one-off warning —
          // and three of those set the give-up latch for the session.
          const _errAtFace = _gpuErrors;
          let faceOk = true;
          try {
            if (lit && lit.setEnvCube && envDummy) lit.setEnvCube(envDummy.texture);
            // Software GL: the procedural sky is a second full TSL compile+
            // fill per face. Reflections stay road/terrain; the 64px cube
            // never resolved the sky disc anyway.
            if (softContent("env")) scene.backgroundNode = null;
            else pinSkyMaterial();
            renderer.setRenderTarget(envRT, face & 7);
            renderer.render(scene, faceCam);
          } catch (e) {
            // A probe face must never strand the frame — and it must never
            // silently darken the world either. Drop the face rather than
            // counting it, so envReady cannot latch over an unwritten cube.
            faceOk = false;
            _envFailN++;
            // A probe that cannot succeed must stop being retried: on real
            // hardware this threw on EVERY face, so the cost was an exception
            // per frame for the life of the session, and the mirror release
            // above would be held forever with it. Four probes' worth of
            // faces is enough evidence.
            if (_envFailN >= ENV_FAIL_CAP) _envGaveUp = true;
            if (!_envFailMsg) _envFailMsg = (e && e.message) || String(e);
            // The message alone ("Cannot read properties of null") names no
            // site. Keep the first STACK too: on real hardware this throws on
            // every face and there is no console to read it out of.
            if (!_envFailStack) _envFailStack = String((e && e.stack) || "").slice(0, 600);
          }
          if (softContent("env")) scene.backgroundNode = prevSky;
          renderer.setRenderTarget(softOutRT());
          if (lit && lit.setEnvCube) {
            // envReady means a PREVIOUS full probe wrote envRT; that stale cube
            // still beats the black dummy. Nothing ready yet -> stay on dummy.
            lit.setEnvCube((faceOk || envReady) || !envDummy ? envRT.texture : envDummy.texture);
          }
          drawList.length = 0;   // the main pass re-issues its own draws
          _dMatUsed = 0;
          poolUsed = 0; _poolBatch++;
          _envActive = false;
          if (_gpuErrors > _errAtFace) _envFaceErr = true;
          if (faceOk) envFacesMask |= 1 << (face & 7);
          const probeErrored = _envFaceErr;
          if (faceOk && envFacesMask === 63 && probeErrored) {
            // The GPU rejected something while the six faces were drawn, so at
            // least one of them holds nothing. Binding that cube would light
            // every surface from black — the symptom this guard exists to stop
            // shipping. Keep the dummy, and retry a bounded number of times
            // before standing down for good: a probe that fails three passes
            // running will not start working on the fourth, and re-probing
            // forever costs a player frames on top of the wrong image.
            envFacesMask = 0;
            _envBadProbes++;
            if (_envBadProbes >= ENV_PROBE_TRIES) { _envGaveUp = true; envReady = false; }
            if (lit && lit.setEnvCube && envDummy) lit.setEnvCube(envDummy.texture);
            try {
              Log.warn("gfx", "[TLX] env probe discarded — GPU errors during capture",
                _gpuErrors - _envErrBase, "pass", _envBadProbes);
            } catch (_) { /* logging must never cost the frame */ }
          } else if (faceOk && envFacesMask === 63) {
            envFacesMask = 0; envReady = true; _envBlank = false; _envBadProbes = 0;
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
        // _envGaveUp reads as READY on purpose: the caller polls this to stop
        // re-probing, and a probe that cannot succeed must stop being asked.
        // The cube stays unbound — envState() is where the difference shows.
        envProbeReady() { return envReady || _envGaveUp; },
        envProbeReset() {
          envFacesMask = 0; envReady = false; _envBlank = false;
          _envFailN = 0; _envFailMsg = ""; _envFailStack = ""; _envErrBase = -1;
          _envBadProbes = 0; _envGaveUp = false;
        },

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
        // Dawn's own verdict on this backend. Mirrors WGX.gpuErrors(); reachable
        // as GLX.gpuErrors() after game.js copies the backend onto GLX.
        gpuErrors() { return _gpuErrors; },
        gpuFirstError() { return _gpuFirstError; },
        aabbInFrustum: (planes, mn, mx) => TLXShaders.aabbInFrustum(planes, mn, mx),
        aabbDist2: (mn, mx, ex, ey, ez) => TLXShaders.aabbDist2(mn, mx, ex, ey, ez),

        // TrackGraph.batches() consumer — THREE.InstancedMesh. Must be real
        // functions (not omitted): descriptor-copy onto GLX would otherwise
        // keep dead GLX closures. See backend-surface-parity.test.mjs.
        createInstancedBatch,
        cullInstances,
        // NOT IMPLEMENTED, declared rather than omitted — same reason as the
        // members above. DebrisWorld feature-tests it and keeps the per-body
        // loop here, which is what TLX ships today. docs/PERF-FINDINGS.md 2h.
        updateInstances,
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
          scene.backgroundNode = (softContent("sky") && sky.fallbackNode)
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
          poolUsed = 0; _poolBatch++;
          prunePool(typeof performance !== "undefined" ? performance.now() : Date.now());
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
              // Hold the release until the env probe has LATCHED.
              // History, because the gate reads as superstition without it:
              // releaseMirrors() used to set attribute.array = null, on the
              // premise that "nothing walks the arrays later" — true of the
              // DRAW path, false of three's NODE BUILDER, which reads
              // attribute.array.constructor to type an attribute every time it
              // compiles a program for a pass it has not compiled for before.
              // The env probe is such a pass, so freeing first made every
              // probe face throw "Cannot read properties of null (reading
              // 'constructor')": measured 2026-08-29 on macos-latest/Metal,
              // 41 failed faces on WebGL2 and 81 on WebGPU in ~40 s — no
              // environment reflections at all, and a thrown exception every
              // frame forever. Invisible on a software adapter only because
              // the probe skips chunks there.
              // It now assigns a ZERO-LENGTH array of the same class instead,
              // so .constructor still resolves and the node builder still
              // types the attribute; .count is a plain property computed once
              // in the BufferAttribute constructor (vendored r185:
              // this.count = void 0 !== t ? t.length / e : 0), so swapping
              // .array afterwards cannot zero a draw count either. That makes
              // this gate belt-and-braces rather than load-bearing — it is
              // KEPT because the failure it guards is real-GPU-only and the
              // few frames of delay cost nothing.
              if (n > 0 && !rec.chunked._mirrorsFreed && !vizMat
                && (envReady || _envGaveUp || !envRT)) _mirrorRelease.push(rec.chunked);
              continue;
            }
            acquireMesh(rec.geo, rec.m, rec.mat).renderOrder = i;
          }
          for (let i = 0; i < meshPool.length; i++) { const pm = meshPool[i]; if (pm.__tlxBatch !== _poolBatch) pm.visible = false; }
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
            for (let i = 0; i < meshPool.length; i++) {
              const pm = meshPool[i];
              if (pm && pm.__tlxBatch === _poolBatch) pm.material = mat;
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
              if (_hadMrt) renderer.setMRT(_ssrMrtNode());
              try {
                renderer.setRenderTarget(post.sceneTarget());
                renderer.render(scene, camera);
                post.present(opts, _postF);
              } finally {
                if (lit && lit.setSsrMrt) lit.setSsrMrt(false);
                if (fx && fx.setSsrMrt) fx.setSsrMrt(false);
                if (_hadMrt) renderer.setMRT(_prevMrt || null);
              }
              if (_softBlit && post.presentedTarget) _queueSoftBlit(post.presentedTarget());
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
          // Same gate as the chunked release above: hold until the env probe
          // has latched, because the node builder types an attribute from
          // array.constructor the first time it compiles for a pass, and the
          // probe is such a pass.
          // sweeps:0 on the first run meant the gate never opened. Record WHICH
          // term holds it shut instead of guessing between the three.
          const _now = typeof performance !== "undefined" ? performance.now() : Date.now();
          if (!_envFirstPaintAt) _envFirstPaintAt = _now;
          // "or the probe is not coming": no face asked for in 5 s of painting
          // means game.js's tier gate has it off for this device, and waiting
          // on a latch that cannot flip is waiting forever. Safe to relax now
          // in a way it was not when the release nulled arrays: it assigns a
          // ZERO-LENGTH array of the same class, so a probe that starts later
          // (PerfGov can raise the tier mid-race) still finds array.constructor
          // and types the attribute correctly.
          // REVERTED 2026-09-02, live on a player's phone: with the sweep and the
          // _envNeverComing() term in, TLX on the handset drew sky, cars and
          // trackside markers but NO ROAD AND NO TERRAIN — precisely the chunked
          // meshes. The term was what first let the chunked release run on a
          // phone at all (game.js gates the env probe on PerfGov.tier() < 1, so
          // the shipped gate can never open there), and freeing those mirrors
          // takes the world with it on that device. Neither the in-container
          // WebGL2 runs (pixel-identical frame) nor gpu-census on macos-latest
          // Metal (gpuErrors 0 after the index fix) reproduced it: BOTH have
          // tier < 1, so both took the ordinary gate and neither exercised the
          // phone path this term opened. Off by default until a device that
          // reproduces it can prove a fix. apex26.tlxMirrorSweep=1 to A/B.
          const _sweepOptIn = (function () {
            try { return localStorage.getItem("apex26.tlxMirrorSweep") === "1"; } catch (_) { return false; }
          })();
          _mirrorStat.drains++;
          _mirrorStat.gate = (envReady ? "R" : "-") + (_envGaveUp ? "G" : "-")
                           + (envRT ? "T" : "-") + (_sweepOptIn ? "S" : "-");
          if (_sweepOptIn && (envReady || _envGaveUp || !envRT)) sweepGeoMirrors(_now);
          // Evicted materials dispose only now — after paint, when no drawList
          // record can still reference them (safe since the #33952 backport).
          for (let i = 0; i < _matDispose.length; i++) { try { _matDispose[i].dispose(); } catch (_) { /* already disposed */ } }
          _matDispose.length = 0;
          if (fx && fx.flushEvicted) fx.flushEvicted();
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
          // Where the retained CPU bytes actually ARE, per attribute NAME and
          // per geometry kind. Deduped on the underlying ArrayBuffer, because a
          // chunked mesh shares ONE position/normal/colour/mat set across all
          // its chunks and carries only the index per chunk — counting per
          // geometry would multiply that shared set by the chunk count and
          // invent tens of megabytes that do not exist.
          geoCensus() {
            const seen = new Set(), out = { live: 0, dead: 0, byAttr: {}, byKind: {}, zeroMB: 0, totalMB: 0 };
            // Compact as we walk: dead WeakRefs were retained forever (~150-200
            // per circuit build, monotonic across a season).
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
                // An attribute that is entirely zero is an allocation the
                // source data never asked for — buildGeometry fills normal /
                // color / mat / trk whether or not the caller supplied them.
                // FULL scan, not a sampled one: a stride would call a
                // mostly-zero array all-zero and overstate the waste.
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
            return { mesh: _meshMade.mesh, chunked: _meshMade.chunked, tex: _meshMade.tex };
          },
          envState() {
            let face = 0;
            while (face < 6 && (envFacesMask & (1 << face))) face++;
            return {
              on: !!envRT, face, size: ENV_SIZE, ready: envReady, blank: _envBlank,
              fail: _envFailN, failMsg: _envFailMsg,
              badProbes: _envBadProbes, gaveUp: _envGaveUp,
            };
          },
          envFailStack() { return _envFailStack; },
          viz: vizMode,
          // Which three backend actually came up, and why — the one question a
          // "TLX looks wrong on my phone" report has to answer first, since the
          // WebGPU/WebGL2 choice is now device-dependent (see the pin above).
          backendState() {
            return {
              api: (renderer.backend && renderer.backend.isWebGPUBackend) ? "webgpu" : "webgl2",
              forceWebGL, pin: _glPin, autoStayGL: _autoStayGL, hasGpu: _hasGpu,
              isMobile, mobileTier, isWebKit, liteGpu: _liteGpu,
              softwareGL, softAdapter: _softAdapter, headless: _headless,
              forceHw: _forceHw.on, forceBatches: _forceBatches,
              envFail: _envFailN, envFailMsg: _envFailMsg,
              softBlit: _softBlit, capPref: _capPref,
            };
          },
          materialCacheSize() { return matCache.size; },
          // What is growing when the GEOMETRY is not? A 4-minute race soak
          // measured the heap climbing 88-138 MB while geoCensus's registry
          // and attribute bytes both stayed flat (docs/PERF-FINDINGS.md 2o),
          // so the leak is in the bookkeeping around the meshes, not in them.
          // Everything here is a COUNT or a size the renderer already tracks —
          // reporting it costs nothing and guessing costs an afternoon.
          memState() {
            const o = { mats: matCache.size, pool: meshPool.length, draws: drawList.length,
                        geoKeys: meshByGeo.size, batch: _poolBatch,
                        // The mirror sweep reports what it FREED, not that it ran:
                        // the first version of this lever never executed and read
                        // as "the fix does nothing" (PERF-FINDINGS 2m).
                        mirror: { sweeps: _mirrorStat.sweeps, geos: _mirrorStat.geos,
                                  freedMB: _mirrorStat.freedMB, drains: _mirrorStat.drains,
                                  gate: _mirrorStat.gate } };
            try {
              const inf = renderer && renderer.info;
              if (inf) {
                o.progs = (inf.programs && inf.programs.length) || 0;
                if (inf.memory) { o.rGeo = inf.memory.geometries; o.rTex = inf.memory.textures; }
                if (inf.render) { o.calls = inf.render.calls; }
              }
            } catch (_) { /* three's info shape is version-dependent; absent is reported as absent */ }
            try { const b = renderer && renderer.backend; if (b && b.data && b.data.size != null) o.backendData = b.data.size; } catch (_) { /* DataMap may be a WeakMap */ }
            return o;
          },
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
