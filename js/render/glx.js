/* Apex 26 — WebGL2 renderer core: the PBR GGX lit pass (sun + 32 spot lamps, shadow maps, procedural materials, wet road, fog), the procedural sky and the FX pass… */
"use strict";

const GLX = (function () {
  const { LIT_VS, LIT_FS, SKY_VS, SKY_FS, SHADOW_VS, SHADOW_FS, MARK_FS, MARK_BATCH_VS, DECAL_VS, DECAL_FS, GLOW_VS, GLOW_FS, PARTICLE_VS, PARTICLE_FS } = GLXShaders;

  let gl = null;
  let canvas = null;
  // Mobile tier: iOS home-screen web apps (WKWebView) get a tight jetsam memory
  // budget that GPU/IOSurface allocations count against — a hard kill, no JS
  // error, no contextlost event. Shrink every discretionary GPU allocation on
  // phones/tablets. (iPadOS 13+ masquerades as Mac; catch it via touch points.)
  // apex26.forceMobileTier=1 makes a desktop browser take every mobile-tier
  // path — the only way Playwright/desktop DevTools can exercise and A/B the
  // phone-only downgrades (lamp budget, beams-off, atlas sizes, shadow sizes).
  //
  // THIS IS THE ONE COPY. The sniff was reimplemented in four files and the
  // copies had already drifted — js/game.js's omitted `_forceMobile` entirely,
  // so the override that exists to make the phone tier testable did not reach
  // the backend gate it most needed to (docs/ARCHITECTURE-REVIEW.md §8).
  // Everything else reads GLX.isMobile / GLX.mobileTier (exported below):
  // glx.js is the 11th <script> tag, ahead of every consumer, and the deferred
  // backends load last, so the value is always there to read. Any new consumer
  // does the same — do not re-sniff navigator.
  let _forceMobile = false;
  try { _forceMobile = localStorage.getItem("apex26.forceMobileTier") === "1"; } catch (_) {}
  const IS_MOBILE = _forceMobile ||
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
  let _gfxHigh = false;
  try { _gfxHigh = localStorage.getItem("apex26.gfxHigh") === "1"; } catch (_) {}
  const MOBILE_TIER = IS_MOBILE && !_gfxHigh;
  let _ctxLost = false;   // true between webglcontextlost and the reload on restore
  function ctxGone() { return _ctxLost || !!(gl && gl.isContextLost && gl.isContextLost()); }

  // ── GPU frame timer (opt-in via gpuTimer(true); __apex.gpuTimer()) ──
  // EXT_disjoint_timer_query_webgl2 measures GPU-side frame cost — the thing a
  // CPU flame chart (perf-profile skill) literally can't see, and the number the
  // "are night-track spikes GPU-bound?" / WebGL2-vs-WebGPU question turns on.
  // Results are async (ready a few frames after endQuery), so we keep a small
  // ring of queries and only read one whose result is available. No-op (and
  // gpuMs() returns -1) when the extension is missing — notably iOS Safari,
  // where it's unreliable/absent, so this is a Chrome/Android profiling aid.
  let _gpuTimerExt = null, _gpuTimerOn = false, _gpuQPending = [], _gpuMs = -1;
  let _anisoExt = null, _anisoMax = 0;   // EXT_texture_filter_anisotropic (capped 4×)
  let _gpuQActive = null;   // query open between begin() and present() this frame
  let litProg = null, litU = null;
  const IDENT4 = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  let matAlbedoTex = null, matNormalTex = null, matDummyArrTex = null;
  const MAT_TEX_LAYERS = 17;                                 // MAT.FLAT(0) … MAT.ASPHALT(16)
  const matTexScales = new Float32Array(MAT_TEX_LAYERS);     // world metres per tile; 0 = absent
  // Scratch vec3s for the tuner's ambient multiplier (no per-frame allocation).
  const _ambScratchG = [0, 0, 0], _ambScratchS = [0, 0, 0];
  let skyProg = null, skyU = null;
  let shadowProg = null, shadowU = null;
  let markProg = null, markU = null;
  let markBatchProg = null, markBatchU = null, markBatchVAO = null, markBatchVBO = null, markBatchCap = 0;
  let glowProg = null, glowU = null, glowVAO = null, glowVBO = null, glowCap = 0;
  let glowData = null;   // CPU-side dynamic vertex buffer for light-glow billboards
  let particleProg = null, particleU = null, particleVAO = null, particleVBO = null, particleCap = 0;
  let skyVAO = null;     // empty VAO (WebGL2 still needs one bound)
  let shadowVAO = null;
  let width = 0, height = 0, aspect = 1;
  const ENV_SIZE = 64;
  // Probe draw-distance cull, metres. Counted reach in docs/PERF-FINDINGS.md /
  // tools/chunk-reach.cjs. A face is 90 deg across ENV_SIZE pixels = 1.41 deg/px,
  // so a 20 m building subtends ~2.7 px here and 0.9 px at the 900 m far plane.
  const ENV_CULL_M = 300;
  let envTex = null, envFBO = null, envDepthRB = null, envDummyTex = null;
  let envFacesMask = 0, envReady = false, _envActive = false;
  let _envFrame = null, _envSvVP = null, _envSvEye = null, _envSvCull = 0;
  const _envView = new Float32Array(16), _envProj = new Float32Array(16),
        _envVP = new Float32Array(16), _envInvVP = new Float32Array(16),
        _envTgt = [0, 0, 0];
  // Cubemap face orientations (forward, up) — WebGL cube-face convention.
  const ENV_FACES = [
    [[ 1, 0, 0], [0, -1, 0]], [[-1, 0, 0], [0, -1, 0]],
    [[ 0, 1, 0], [0, 0,  1]], [[ 0, -1, 0], [0, 0, -1]],
    [[ 0, 0, 1], [0, -1, 0]], [[ 0, 0, -1], [0, -1, 0]],
  ];
  let frameViewProj = null;
  let frameSunDir = null;
  let frameEye = null;
  let frameCullDist = 0;   // >0: radial draw-distance cap for chunked scenery (mobile free-cam) — bounds chunk count when the far plane is pushed out
  let frameLights = null;
  let frameAllLights = null, framePerChunkLights = 0, frameTailStart = 0, frameTailCount = 0;
  let _lampScale = 1;
  const MAX_LIGHTS = 48;
  const _luA = new Float32Array(MAX_LIGHTS * 4), _luB = new Float32Array(MAX_LIGHTS * 4),
        _luC = new Float32Array(MAX_LIGHTS * 4), _luD = new Float32Array(MAX_LIGHTS * 4);
  let frameInvProj = null;
  let frameInvVP = null;
  let frameProj = null;
  let frameSunVS = null;
  let frameUpVS = null;
  let frameSkyHi = null;
  let frameSkyLo = null;
  let frameSunColor = null;
  let frameDecalSun = null;   // keyMul-scaled sun for the decal pass (raw frameSunColor feeds god rays)
  const _decalSunScr = [0, 0, 0];
  let frameAmbSky = [0.3, 0.32, 0.36], frameAmbGround = [0.2, 0.19, 0.18];   // for decal lighting
  let decalProg = null, decalU = null;   // textured car-decal (logo/sponsor) pass
  let frameTime = 0, frameCloud = 0, frameCloudSpeed = 1;

  let core = null, PST = null, SHD = null, CHK = null;

  // Material uniform cache — skip redundant per-draw scalar uploads.
  let _matEmissive = -1, _matAlpha = -1, _matRough = -1, _matMetal = -1, _matSpec = -1, _matDetail = -1, _matCC = -1, _matCP = -1, _matSpark = -1;

  let _activeProg = null;
  function useProg(p) { if (p !== _activeProg) { gl.useProgram(p); _activeProg = p; } }

  // Per-frame view-projection upload cache for the blob-shadow / skid-mark
  // programs. uViewProj never changes within a frame, but drawShadow/drawMark are
  // called dozens of times per frame (one per skid stamp / car shadow), each
  // re-uploading the same 16-float matrix. Track which program last received the
  // frame's matrix so the upload happens at most once per program per frame.
  let _frameToken = 0;
  let _shadowVPToken = -1, _markVPToken = -1;
  const _litUf = Object.create(null), _skyUf = Object.create(null);
  function _clearUf(o) { for (const k in o) delete o[k]; }
  function uf1(loc, cache, key, v) {
    if (!loc) return;
    if (cache[key] !== v) { gl.uniform1f(loc, v); cache[key] = v; }
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
  // The same idea extended to the three states draw() currently toggles on
  // EVERY call. MEASURED and found to save NOTHING: those four calls total 63.5
  // per frame on vegas and the cache collapses zero of them, because the toggles
  // strictly ALTERNATE (cars are doubleSided, their neighbours are not). The
  // PerfTry switch was removed; _stateCache() is now permanently false, so these
  // behave exactly as the direct gl calls they replaced. Kept because the routing
  // is tidier and because resetDrawState() is a real invariant.
  // GL defaults: culling ON, all four colour channels writable,
  // polygon offset disabled. resetDrawState() re-syncs to those, and is called
  // from begin()/present() alongside the blend/depth pair so state can
  // never outlive the frame that set it.
  function setCull(on) {
    if (on) gl.enable(gl.CULL_FACE);
    else gl.disable(gl.CULL_FACE);
  }
  function setAlphaWrite(on) {
    gl.colorMask(true, true, true, on);
  }
  function setPolyOffset(bias) {
    if (bias) {
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(bias[0], bias[1]);
    } else {
      gl.polygonOffset(0, 0);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
  }
  function resetDrawState() {
    gl.enable(gl.CULL_FACE);
    gl.colorMask(true, true, true, true);
    gl.polygonOffset(0, 0);
    gl.disable(gl.POLYGON_OFFSET_FILL);
  }

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      Log.error("gfx", "GLX shader compile failed:\n" + gl.getShaderInfoLog(sh) + "\n" + src);
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
      Log.error("gfx", "GLX program link failed: " + gl.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  }

  function locs(prog, names) {
    const u = {};
    for (const n of names) u[n] = gl.getUniformLocation(prog, n);
    return u;
  }

  function init(canvasEl) {
    canvas = canvasEl;
    watchCanvasSize();
    gl = canvas.getContext("webgl2", {
      // antialias:true makes the BROWSER allocate its own multisampled backbuffer
      // (Apple GPUs round the request up to 4×) — pure waste: the post path
      // renders offscreen with its own MSAA and only blits a resolved image to
      // the screen. Always false; never pay for unused browser MSAA.
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    if (!gl) return false;

    // GPU timer extension (Chrome/Android; absent on iOS Safari). Acquired once;
    // actual querying is gated behind gpuTimer(true).
    try { _gpuTimerExt = gl.getExtension("EXT_disjoint_timer_query_webgl2"); } catch (_) { _gpuTimerExt = null; }

    try {
      _anisoExt = gl.getExtension("EXT_texture_filter_anisotropic")
               || gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic");
      _anisoMax = _anisoExt
        ? Math.min(4, gl.getParameter(_anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 0) : 0;
    } catch (_) { _anisoExt = null; _anisoMax = 0; }

    canvas.addEventListener("webglcontextlost", function (e) {
      e.preventDefault(); _ctxLost = true;
      // Only downgrade quality on a loss that happened while VISIBLE — that's the
      // memory-pressure signal. iOS also drops the context on backgrounding
      // (document.hidden), a benign transient loss that shouldn't permanently
      // disable the env probe. Persisting the opt-out otherwise stops a
      // lose→reload→lose loop on genuinely memory-tight devices.
      // PER-CHUNK LAMPS goes off with it, and for a stronger reason than the
      // probe's. The crash sentinel that would otherwise pre-degrade a device
      // that died last session is MOBILE ONLY by design (js/game/perf.js gates
      // its whole strike ledger on gfx.isMobile so the desktop test suite never
      // enters safe mode) — so on desktop a context loss leaves NO persistent
      // trace at all. The tier gate on this feature only fires once PerfGov has
      // WATCHED frames run slow; a driver watchdog reset can arrive in a single
      // bad frame, long before the governor reacts. Without this line the cycle
      // is: reset -> reload -> knob still on (it is persisted in the tuner
      // store) -> same configuration -> reset again, which is a player reporting
      // that the game crashes every time they try to play rather than once.
      //
      // Same visibility condition as the probe: iOS drops the context on
      // backgrounding, and that benign transient must not disable a feature the
      // player deliberately turned on.
      if (!document.hidden) {
        try { localStorage.setItem("apex26.envProbeOff", "1"); } catch (_) { /* No storage (Safari private mode) or quota full: the probe simply stays on next boot, which is the pre-existing behaviour — a failed latch must not also break the loss handler. */ }
        try { localStorage.setItem("apex26.perChunkOff", "1"); } catch (_) { /* Same: without storage the knob stays as the player left it and the tier gate is the only defence left. Nothing here may throw — this runs inside webglcontextlost. */ }
      }
      // SELF-HEAL. The restore path below reloads on "webglcontextrestored" —
      // but that event is NOT guaranteed to fire. The browser only restores a
      // context it decides to restore, and on a driver reset or a GPU-process
      // kill it frequently never comes. In that case every frame after this one
      // is a no-op (every entry point tests _ctxLost), so the game sits on a
      // dead black canvas, silently, forever. That is a player reporting the
      // game "crashes when I try to play" with NOTHING in the console — no
      // exception, so index.html's error overlay never paints either.
      //
      // So reload on a timer instead of waiting for a promise the browser never
      // made. The delay lets a restore land first if one is coming (the handler
      // below wins the race and reloads immediately); 1.2 s is long enough for
      // that and short enough that the player reads it as a hitch.
      //
      // Bounded, because a device that dies on EVERY boot must not be trapped in
      // a reload loop: two automatic recoveries per tab session, then stop and
      // leave the dead canvas rather than cycling forever. The latches above
      // make each retry lighter than the last, which is what gives the retry a
      // reason to succeed. sessionStorage (not local) so a genuinely new visit
      // always gets its two attempts back.
      try {
        var _rk = "apex26.ctxLostReloads";
        var _n = (parseInt(sessionStorage.getItem(_rk), 10) || 0) + 1;
        sessionStorage.setItem(_rk, String(_n));
        if (_n <= 2) setTimeout(function () { try { location.reload(); } catch (_) { /* No location (harness/worker): nothing to reload, the latches above still took effect for the next real boot. */ } }, 1200);
      } catch (_) { /* No sessionStorage: skip the auto-recovery rather than risk an unbounded reload loop with no way to count attempts. */ }
    }, false);
    canvas.addEventListener("webglcontextrestored", function () { try { location.reload(); } catch (_) {} }, false);

    litProg = link(LIT_VS, LIT_FS);
    skyProg = link(SKY_VS, SKY_FS);
    shadowProg = link(SHADOW_VS, SHADOW_FS);
    markProg = link(SHADOW_VS, MARK_FS);
    markBatchProg = link(MARK_BATCH_VS, MARK_FS);
    glowProg = link(GLOW_VS, GLOW_FS);
    particleProg = link(PARTICLE_VS, PARTICLE_FS);
    decalProg = link(DECAL_VS, DECAL_FS);
    decalU = decalProg && locs(decalProg, ["uModel", "uViewProj", "uSunDir", "uSunColor", "uAmbSky", "uAmbGround", "uGlow", "uTex"]);
    if (!litProg || !skyProg || !shadowProg || !markProg) return false;
    _clearUf(_litUf); _clearUf(_skyUf);

    // ── GLXCore: the ctx façade handed to the split subsystem modules
    // (js/render/glx/{post,shadow,chunked}.js). Live getters close over this
    // file's per-frame state; the helpers are the same shared GL-state-cache
    // functions the rest of this file uses, so the subsystems never fight the
    // caches. core.post / core.shadow are filled in right after each init so
    // the subsystems can reach each other at call time.
    core = {
      gl,
      MOBILE_TIER,
      IS_MOBILE,
      ctxGone,
      useProg, bindVAO, setBlend, setDepthMask,
      compile, link, locs,
      toF32, createMesh, litMaterial,
      // ARITY 3 ON PURPOSE, and this is a REVERT, not the original oversight.
      //
      // The bug is real: GLXChunked's per-chunk lamp upload passes SIX
      // arguments, so L2/o2/n2 — the car tail-light slice — were dropped here
      // and every per-chunk lamp set silently lost the field's tail lights.
      // Forwarding them (2026-08-14) fixed that. It also turned a code path
      // that had been inert since PER-CHUNK LAMPS shipped into a live one for
      // the first time, and the very next build drew a crash report from a
      // player running with the knob on.
      //
      // That crash is NOT reproducible here: boot, build, race, night,
      // perChunkLights at 1 / 0.3, roadChunkLamps, and four track changes
      // including a free+rebuild of vegas all run clean under SwiftShader, and
      // test:tiny is 71/71. But with the knob at 1 the other three changes in
      // that build are provably no-ops (_lampScale computes to exactly 1, so
      // col*1 is bit-identical; the knob ranges change no runtime behaviour;
      // envCull was default-off), which leaves this as the only live behavioural
      // delta reaching that player.
      //
      // Suspect by elimination, not by a fault anyone has pointed at — so it
      // goes back to the shipped-for-months behaviour while the crash is
      // diagnosed, rather than staying in on the strength of my own reasoning.
      // The cost of reverting is one cosmetic loss (scenery does not catch
      // tail-light spill under per-chunk lamps) that nobody had until this
      // week. Re-land it WITH a repro of the crash it may or may not have
      // caused, not before.
      uploadLightSet: (L, idx, n, L2, o2, n2) => uploadLightSet(L, idx, n, L2, o2, n2),
      getSize: () => ({ width, height }),
      gpuTimerEnd: _gpuTimerEnd,
      get skyVAO() { return skyVAO; },
      invalidateVAO() { _activeVAO = null; },
      unbindVAOIf(v) { if (_activeVAO === v) { gl.bindVertexArray(null); _activeVAO = null; } },
      frame: {
        get viewProj() { return frameViewProj; },
        get sunDir() { return frameSunDir; },
        get sunColor() { return frameSunColor; },
        get eye() { return frameEye; },
        get cullDist() { return frameCullDist; },
        get invProj() { return frameInvProj; },
        get invVP() { return frameInvVP; },
        get proj() { return frameProj; },
        get sunVS() { return frameSunVS; },
        get upVS() { return frameUpVS; },
        get skyHi() { return frameSkyHi; },
        get skyLo() { return frameSkyLo; },
        get lights() { return frameLights; },
        get allLights() { return frameAllLights; },
        get perChunkLights() { return framePerChunkLights; },
        get tailStart() { return frameTailStart; },
        get tailCount() { return frameTailCount; },
        get time() { return frameTime; },
        get cloud() { return frameCloud; },
        get cloudSpeed() { return frameCloudSpeed; },
      },
      post: null, shadow: null,
    };
    PST = GLXPost.init(core);   core.post = PST;    // post chain (best-effort; disabled -> render straight to screen)
    SHD = GLXShadow.init(core); core.shadow = SHD;  // sun/car/lamp shadow maps + PCSS blocker
    CHK = GLXChunked.init(core);                    // frustum-culled chunked city/props meshes

    // The per-instance colour attribute is multiplied into vCol on EVERY lit
    // draw, so its generic value must be the identity or ordinary meshes — which
    // never bind attribute 9 — render black. WebGL's default generic value is
    // (0,0,0,1), which is exactly that failure: it crushed ~25% of the frame to
    // black and only the sky survived. Generic attribute values are CONTEXT
    // state, not VAO state, so setting it once here covers every mesh.
    gl.vertexAttrib3f(9, 1, 1, 1);
    litU = locs(litProg, ["uModel", "uInstanced", "uViewProj", "uEye", "uSunDir", "uSunColor",
      "uAmbGround", "uAmbSky", "uFogColor", "uFogDensity", "uEmissive", "uAlpha",
      "uRoughness", "uMetalness", "uSpecular", "uDetail", "uClearcoat", "uCarPaint", "uSparkle", "uWetness", "uEnvCube", "uEnvStr",
      "uShadowMap", "uLightVP", "uShadowBias", "uShadowStr", "uShadowTexel", "uShadowRange", "uShadowCtr",
      "uCarShadowMap", "uCarLightVP", "uCarShadowOn", "uCarBiasScale",
      "uLampShadowMap", "uLampShadowVP", "uLampShadowOn", "uLampShadowIdx",
      "uSkyZenith", "uSkyHorizon", "uFogHeight", "uGroundMist", "uLampFog", "uBlockerMap", "uPcss", "uTime", "uCloudCover", "uCloudSpeed", "uCloudShadowDim",
      "uBounceK", "uMistShare", "uLampFogClip", "uGlowAmp", "uBloomBoost", "uPcssPen", "uKeyMul",
      "uFogTint", "uMistHeight", "uShadowTintAmt", "uWetDark",
      "uCarSunGlint", "uCarSparkle", "uFogSunCore",
      "uLampNearClamp", "uWindowSunFlash", "uSkyRimGlow", "uAmbContactDark", "uLampWallSpill",
      "uMatAlbedoTex", "uMatNormalTex", "uMatTexMix", "uMatTexScale[0]",
      "uNumLights", "uLightA[0]", "uLightB[0]", "uLightC[0]", "uLightD[0]"]);
    skyU = locs(skyProg, ["uInvViewProj", "uZenith", "uHorizon", "uSunDir", "uSunColor", "uStars", "uCloud", "uTime", "uMoon", "uCityGlow", "uStarBright", "uCloudSpeed", "uSkyGrad", "uStarDensity", "uDaySkyBlue", "uMieScatter", "uCloudSilver", "uCoronaAureole", "uSunDiscSize", "uStarSize", "uStarTwinkle", "uMoonDiscSize", "uMoonHalo", "uSunCorona", "uSunSquash", "uCityGlowReach", "uCloudDef", "uLightning"]);
    shadowU = locs(shadowProg, ["uModel", "uViewProj", "uSize"]);
    markU = locs(markProg, ["uModel", "uViewProj", "uSize"]);
    if (markBatchProg) {
      markBatchU = locs(markBatchProg, ["uViewProj"]);
      // Dynamic interleaved buffer: [posX, posY, posZ, uvX, uvY] per vertex.
      markBatchVAO = gl.createVertexArray();
      gl.bindVertexArray(markBatchVAO);
      markBatchVBO = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, markBatchVBO);
      const mst = 5 * 4;   // 5 floats per vertex
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, mst, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, mst, 12);
      gl.bindVertexArray(null);
    }
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
    if (particleProg) {
      particleU = locs(particleProg, ["uViewProj", "uEye", "uAdditive"]);
      particleVAO = gl.createVertexArray();
      gl.bindVertexArray(particleVAO);
      particleVBO = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, particleVBO);
      const pst = 10 * 4;   // 10 floats per vertex
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, pst, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, pst, 8);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, pst, 20);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, pst, 32);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, pst, 36);
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
    setCull(true);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    resize();
    Log.info("gfx", "GLX context ready");
    return true;
  }

  let renderScale = 1;
  let cssW = 0, cssH = 0, cssDirty = true;
  const markCssDirty = () => { cssDirty = true; };
  function watchCanvasSize() {
    if (typeof window === "undefined" || !window.addEventListener) return;
    window.addEventListener("resize", markCssDirty);
    window.addEventListener("orientationchange", markCssDirty);
    // Covers what a window resize never fires for: a layout change that moves
    // the canvas alone (entering photo mode, a rotated phone that keeps the same
    // window size). Feature-detected — without it the two listeners above still
    // cover the common cases, and cssSize()'s zero-guard covers first layout.
    if (typeof ResizeObserver === "function" && canvas) {
      try { new ResizeObserver(markCssDirty).observe(canvas); } catch (_) {}
    }
  }
  function cssSize() {
    // A zero is never a real size — it means the canvas has not been laid out
    // yet (init before first layout, a display:none ancestor). Keep re-reading
    // until it is real, so this can't latch a 1x1 backbuffer the way a plain
    // cache would; the old read-every-frame code self-corrected for free.
    if (cssDirty || cssW <= 0 || cssH <= 0) {
      cssW = canvas.clientWidth;
      cssH = canvas.clientHeight;
      cssDirty = false;
    }
  }
  function resize() {
    if (ctxGone()) return;
    // Mobile: cap DPR at 1.5 (was 2) — every full-screen target scales with the
    // square of this; 1.5 is 56% of the pixels of 2 with little visible loss on
    // a ~6" screen, and it multiplies with every other saving.
    const dpr = Math.min(window.devicePixelRatio || 1, MOBILE_TIER ? 1.5 : 2);
    cssSize();
    const w = Math.max(1, Math.round(cssW * dpr * renderScale));
    const h = Math.max(1, Math.round(cssH * dpr * renderScale));
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
    if ((changed || first) && PST) PST.createTargets();   // (re)allocate HDR + bloom targets
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
    const fpv = 9 + (mat ? 1 : 0) + (trk ? 3 : 0);
    const trkOff = 9 + (mat ? 1 : 0);
    const interleaved = new Float32Array(vCount * fpv);
    for (let i = 0; i < vCount; i++) {
      const o = i * fpv;
      interleaved[o  ] = pos[i*3  ]; interleaved[o+1] = pos[i*3+1]; interleaved[o+2] = pos[i*3+2];
      interleaved[o+3] = nrm[i*3  ]; interleaved[o+4] = nrm[i*3+1]; interleaved[o+5] = nrm[i*3+2];
      interleaved[o+6] = col[i*3  ]; interleaved[o+7] = col[i*3+1]; interleaved[o+8] = col[i*3+2];
      if (mat) interleaved[o+9] = mat[i];
      if (trk) {
        interleaved[o+trkOff  ] = trk[i*3  ];
        interleaved[o+trkOff+1] = trk[i*3+1];
        interleaved[o+trkOff+2] = trk[i*3+2];
      }
    }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
    const stride = fpv * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride,  0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    if (mat) { gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 36); }
    if (trk) { gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 3, gl.FLOAT, false, stride, trkOff * 4); }
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    _activeVAO = null;   // keep the bind cache in sync with the direct bind above

    return { vao, vbo, ib, count: idx.length, indexType: idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
  }

  // Textured decal mesh: interleaved [x,y,z, nx,ny,nz, u,v], stride 32 (no colour).
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
  // Upload a canvas / ImageBitmap / ImageData as an RGBA texture (mipmapped, clamped).
  function createTexture(src) {
    if (ctxGone()) return null;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (_anisoMax > 1) gl.texParameterf(gl.TEXTURE_2D, _anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, _anisoMax);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }
  function freeTexture(t) { if (t) gl.deleteTexture(t); }

  // ── Baked PBR material texture arrays ──────────────────────────────────────
  // One TEXTURE_2D_ARRAY whose LAYER INDEX IS THE MAT ID, so the lit shader can
  // texture every surface in the game from the per-vertex material id it already
  // carries — no UV channel, no new vertex attribute, no per-material draw call.
  //
  // `images` is a sparse array indexed by MAT id (holes = that material has no
  // baked map and keeps its procedural look). Every image must already be
  // size×size; the caller (js/render/assets.js) guarantees that from the pack
  // manifest. Returns null rather than throwing on any failure — a missing or
  // malformed pack must degrade to the shipping look, never break the render.
  function createTextureArray(size, images, layers) {
    if (ctxGone() || !size || !images) return null;
    const n = layers || MAT_TEX_LAYERS;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    // texStorage3D allocates the whole mip chain immutably up front — required
    // for an array texture whose layers arrive one at a time, and it means a
    // layer we never fill is well-defined (zero) rather than undefined memory.
    const mips = Math.floor(Math.log2(size)) + 1;
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, mips, gl.RGBA8, size, size, n);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    let filled = 0;
    for (let i = 0; i < n; i++) {
      const img = images[i];
      if (!img) continue;
      try {
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, size, size, 1, gl.RGBA, gl.UNSIGNED_BYTE, img);
        filled++;
      } catch (_) { /* one bad layer must not sink the pack */ }
    }
    if (!filled) { gl.deleteTexture(tex); gl.bindTexture(gl.TEXTURE_2D_ARRAY, null); return null; }
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
    if (matAlbedoTex) { gl.deleteTexture(matAlbedoTex); matAlbedoTex = null; }
    if (matNormalTex) { gl.deleteTexture(matNormalTex); matNormalTex = null; }
    matTexScales.fill(0);
    if (!maps) return;
    matAlbedoTex = maps.albedo || null;
    matNormalTex = maps.normal || null;
    const sc = maps.scales;
    if (sc) for (let i = 0; i < MAT_TEX_LAYERS; i++) matTexScales[i] = +sc[i] > 0 ? +sc[i] : 0;
    if (!matAlbedoTex) matTexScales.fill(0);
  }

  // 1×1×1 dummy array — a COMPLETE sampler2DArray target for both material
  // units whenever no pack is loaded. Same reasoning as ensureEnvDummy(): a
  // sampler pointing at an incomplete texture unit is undefined behaviour and
  // renders black on strict drivers (SwiftShader) even when the shader branch
  // that would sample it is never taken.
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
    gl.activeTexture(gl.TEXTURE10);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, matAlbedoTex || matDummyArrTex);
    gl.uniform1i(litU.uMatAlbedoTex, 10);
    gl.activeTexture(gl.TEXTURE11);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, matNormalTex || matDummyArrTex);
    gl.uniform1i(litU.uMatNormalTex, 11);
    gl.activeTexture(gl.TEXTURE0);      // leave unit 0 active + bound to the shadow map
    gl.uniform1f(litU.uMatTexMix, matAlbedoTex ? mix : 0);
    if (litU["uMatTexScale[0]"]) gl.uniform1fv(litU["uMatTexScale[0]"], matTexScales);
  }
  // Draw textured decals over the just-drawn car body: depth test ON, depth write
  // OFF (decals are proud of the panel so they never z-fight), alpha-blended, and
  // the alpha channel is NOT written (the car's SSR paint tag underneath survives).
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
    }
    gl.uniform1f(decalU.uGlow, (opts && opts.glow) || 0);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(decalU.uTex, 5);
    gl.activeTexture(gl.TEXTURE0);   // leave unit 0 active + still bound to the shadow map
    setBlend(true);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    setDepthMask(false);
    setCull(false);                 // decals are single quads — draw both faces
    setAlphaWrite(false);    // keep the SSR alpha tag underneath
    bindVAO(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
    setAlphaWrite(true);
    setCull(true);
    setDepthMask(true);
  }

  // 1px black dummy cube — a COMPLETE samplerCube target for the env unit
  // whenever the real probe isn't live (menu / setup viewer / probe-less tools)
  // OR while rendering INTO the real cube (feedback-loop guard). Minted on demand
  // so the probe-less path never leaves uEnvCube pointing at an incomplete unit
  // (which renders the whole car black on strict drivers like SwiftShader).
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
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);   // texture-complete (black) from frame 0
    ensureEnvDummy();
    envDepthRB = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, envDepthRB);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, ENV_SIZE, ENV_SIZE);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    envFBO = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, envFBO);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, envDepthRB);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  function envFaceBegin(face, eye, frame) {
    if (!gl || ctxGone()) return null;
    if (!envTex) envInit();
    _envActive = true;   // begin() → env FBO + 64px viewport; env unit → dummy cube
    const F = ENV_FACES[face];
    _envTgt[0] = eye[0] + F[0][0]; _envTgt[1] = eye[1] + F[0][1]; _envTgt[2] = eye[2] + F[0][2];
    M4.lookAtTo(_envView, eye, _envTgt, F[1]);
    M4.perspectiveTo(_envProj, Math.PI / 2, 1, 0.4, 900);
    M4.mulTo(_envVP, _envProj, _envView);
    M4.invertTo(_envInvVP, _envVP);
    gl.bindFramebuffer(gl.FRAMEBUFFER, envFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, envTex, 0);
    _envFrame = frame;
    _envSvVP = frame.viewProj; _envSvEye = frame.eye; _envSvCull = frame.cullDist;
    frame.viewProj = _envVP; frame.eye = eye;
    // Env-probe radial cull (counted reach in docs/PERF-FINDINGS.md): the
    // probe inherits the MAIN camera's cullDist, which game.js sets to 0 —
    // no radial cull at all — below PerfGov tier 3. A 64x64 reflection
    // target would otherwise re-draw the city through the 900 m frustum.
    // Counted with tools/chunk-reach.cjs: 238.3 chunks / 1,256,344 indices
    // per cube on vegas at 900 m, 45.3 / 376,791 at 300 m.
    //
    // MIN, never an override: where the main camera is already culling tighter
    // (the tier-3 fog cull), the probe keeps that tighter value. A cullDist of
    // 0 means "no cull", so it is treated as unbounded rather than as zero.
    frame.cullDist = _envSvCull > 0 ? Math.min(_envSvCull, ENV_CULL_M) : ENV_CULL_M;
    begin(frame);
    return _envInvVP;
  }
  function envFaceEnd(face) {
    if (_envFrame) {
      _envFrame.viewProj = _envSvVP;
      _envFrame.eye = _envSvEye;
      _envFrame.cullDist = _envSvCull;
      _envFrame = null;
    }
    if (!gl || !envTex) return;
    _envActive = false;
    envFacesMask |= 1 << face;
    // Unbind the probe FBO FIRST. generateMipmap below must NOT run while envTex
    // is still the COLOR_ATTACHMENT0 of the bound framebuffer — that read/write
    // feedback is GL_INVALID_OPERATION (or a context loss) on strict/mobile
    // drivers, though SwiftShader silently tolerates it. Detaching + unbinding
    // before the mip pass removes the hazard.
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, null, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);  // restore for the (non-post) main pass
    if (envFacesMask === 63) {         // full cycle → refresh mips, probe is live
      envFacesMask = 0; envReady = true;
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, envTex);
      gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
      gl.activeTexture(gl.TEXTURE0);
    }
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
      _gpuQPending.length = 0;
      return;
    }
    while (_gpuQPending.length) {
      const q = _gpuQPending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      _gpuMs = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;   // ns → ms
      gl.deleteQuery(q);
      _gpuQPending.shift();
    }
    // Backstop: never let the ring grow unbounded if results stall.
    while (_gpuQPending.length > 4) { gl.deleteQuery(_gpuQPending.shift()); }
  }

  function begin(frame) {
    if (ctxGone()) return false;
    _gpuTimerBegin();
    frameViewProj = frame.viewProj;
    frameSunDir = frame.sunDir;
    frameSunColor = frame.sunColor;
    frameEye = frame.eye;
    frameCullDist = frame.cullDist || 0;
    frameInvProj = frame.invProj || null;
    frameInvVP = frame.invViewProj || null;
    frameProj = frame.proj || null;
    frameSunVS = frame.sunViewDir || null;
    frameUpVS = frame.upViewDir || null;
    frameSkyHi = frame.skyHorizon || [0.05, 0.06, 0.09];
    frameSkyLo = frame.skyZenith || [0.02, 0.025, 0.05];
    frameAmbSky = frame.ambientSky || [0.3, 0.32, 0.36];
    frameAmbGround = frame.ambientGround || [0.2, 0.19, 0.18];
    frameTime = frame.time != null ? frame.time : 0;
    frameCloud = frame.cloud != null ? frame.cloud : 0;
    frameCloudSpeed = frame.cloudSpeed != null ? frame.cloudSpeed : 1;
    frameLights = frame.lights || null;
    frameAllLights = frame.allLights || null;
    framePerChunkLights = +frame.perChunkLights || 0;
    _lampScale = framePerChunkLights > 0 ? framePerChunkLights : 1;
    frameTailStart = frame.tailStart | 0;
    frameTailCount = frame.tailCount | 0;
    _frameToken++;   // invalidate per-frame uViewProj upload caches
    if (_envActive) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, envFBO);
      gl.viewport(0, 0, ENV_SIZE, ENV_SIZE);
    } else if (PST.enabled()) {
      PST.bindSceneTarget();
    }
    // Resync cached render state to GL defaults — depthMask must be on for the
    // depth buffer to clear, and blend off is the opaque-pass default.
    gl.disable(gl.BLEND); _blendOn = false;
    gl.depthMask(true); _depthWrite = true;
    resetDrawState();
    const fc = frame.fogColor;
    gl.clearColor(fc[0], fc[1], fc[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    useProg(litProg);
    gl.uniformMatrix4fv(litU.uViewProj, false, frame.viewProj);
    gl.uniform3fv(litU.uEye, frame.eye);
    gl.uniform3fv(litU.uSunDir, frame.sunDir);
    gl.uniform3fv(litU.uSunColor, frame.sunColor);
    // Live tunables (LIGHTING TUNER / __apex.lightTune) ride in on frame.tune;
    // defaults here MUST mirror LightTune.TUNE_DEFS (js/game/lighting.js) so a missing tune object
    // (unit harnesses driving GLX directly) renders the shipped look.
    const T = frame.tune || null;
    const _ambM = T && T.ambientMul != null ? T.ambientMul : 1;
    if (_ambM !== 1) {
      const g = frame.ambientGround, s = frame.ambientSky;
      _ambScratchG[0] = g[0] * _ambM; _ambScratchG[1] = g[1] * _ambM; _ambScratchG[2] = g[2] * _ambM;
      _ambScratchS[0] = s[0] * _ambM; _ambScratchS[1] = s[1] * _ambM; _ambScratchS[2] = s[2] * _ambM;
      gl.uniform3fv(litU.uAmbGround, _ambScratchG);
      gl.uniform3fv(litU.uAmbSky, _ambScratchS);
      frameAmbSky = _ambScratchS; frameAmbGround = _ambScratchG;
    } else {
      gl.uniform3fv(litU.uAmbGround, frame.ambientGround);
      gl.uniform3fv(litU.uAmbSky, frame.ambientSky);
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
    bindMaterialMaps(T && T.matTexMix != null ? T.matTexMix : 1.0);
    gl.uniform3fv(litU.uFogColor, frame.fogColor);
    // FOG DENSITY knob: scale the per-condition haze depth (multiplier, def 1).
    // Default a missing fogDensity to 0 (fog off), like every sibling scalar here
    // and both other backends — an omitted field is documented-valid and must not
    // upload `undefined * mul = NaN`, which blacks out the whole scene.
    gl.uniform1f(litU.uFogDensity, (frame.fogDensity != null ? frame.fogDensity : 0) * (T && T.fogDensityMul != null ? T.fogDensityMul : 1));
    gl.uniform1i(litU.uBlockerMap, 7);
    if (SHD.enabled) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, SHD.mapTex);
      gl.uniform1i(litU.uShadowMap, 0);
      if (SHD.pcssEnabled) {
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, SHD.blockerTex);
        gl.activeTexture(gl.TEXTURE0);
      }
      gl.uniform1f(litU.uPcss, SHD.pcssEnabled ? 1.0 : 0.0);
      gl.uniformMatrix4fv(litU.uLightVP, false, SHD.lightVP);
      // SHADOW BIAS / DARKNESS knobs (repair + artistic; defaults mirror TUNE_DEFS).
      uf1(litU.uShadowBias, _litUf, "shadowBias", T && T.shadowBias != null ? T.shadowBias : 0.001);
      // Fade the cast shadow out as the KEY light dims toward moonlight: props stop
      // casting into the map once the key is dim (game.js shadow-pass perf skip is
      // now gated on key brightness, not sunDir.y — the night moon-key is held high
      // at y≈0.97 for the sky glow, so an elevation test never detected night and
      // left full-strength shadows on at night). Fading by key luminance keeps the
      // two in lock-step: as the key dims the terrain/road shadows fade out exactly
      // as the props stop casting, so nothing POPs when the SUN ELEVATION slider or
      // a time-of-day flip crosses into night.
      const _kl = frame.sunColor ? Math.max(frame.sunColor[0], frame.sunColor[1], frame.sunColor[2]) : 1;
      let _hf = (_kl - 0.28) / 0.14;
      _hf = _hf < 0 ? 0 : _hf > 1 ? 1 : _hf;
      _hf = _hf * _hf * (3 - 2 * _hf);
      const _mSh = (T && T.moonShadow != null ? T.moonShadow : 0.25) * (frame.moonGate || 0);
      if (_mSh > _hf) _hf = _mSh;
      gl.uniform1f(litU.uShadowStr, (T && T.shadowStr != null ? T.shadowStr : 1.15) * _hf);
      // SHADOW DISTANCE knob: box half-size, drives the receiver-distance fade.
      uf1(litU.uShadowRange, _litUf, "shadowRange", T && T.shadowRange != null ? T.shadowRange : 80.0);
      // Fade anchor: the UNSNAPPED forward-biased ground point the shadow box is
      // snapped around (game.js shadow pass). It glides continuously with the
      // camera, so the fade front never jumps on a box recentre.
      gl.uniform3fv(litU.uShadowCtr, frame.shadowCtr || frame.eye || [0, 0, 0]);
      gl.uniform1f(litU.uShadowTexel, 1.0 / SHD.SIZE);
      if (SHD.carEnabled) {
        gl.activeTexture(gl.TEXTURE8);
        gl.bindTexture(gl.TEXTURE_2D, SHD.carTex);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(litU.uCarShadowMap, 8);
        gl.uniformMatrix4fv(litU.uCarLightVP, false, SHD.carLightVP);
        gl.uniform1f(litU.uCarShadowOn, SHD.carArmed ? 1.0 : 0.0);
        gl.uniform1f(litU.uCarBiasScale, SHD.carBoxScale || 1.0);
      } else {
        gl.uniform1f(litU.uCarShadowOn, 0.0);
      }
      // Nearest-floodlight spot shadow map — unit 9, armed only on frames where
      // game.js ran the lamp caster pass (lampShadowBegin). Same always-bound
      // pattern as the car map: when disabled, uLampShadowMap stays at its
      // default unit 0, which holds the static sun map — the SAME sampler type,
      // so the program stays valid and the gated branch never samples it.
      if (SHD.lampEnabled) {
        gl.activeTexture(gl.TEXTURE9);
        gl.bindTexture(gl.TEXTURE_2D, SHD.lampTex);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(litU.uLampShadowMap, 9);
        gl.uniformMatrix4fv(litU.uLampShadowVP, false, SHD.lampLightVP);
        gl.uniform1f(litU.uLampShadowOn, SHD.lampArmed ? 1.0 : 0.0);
        gl.uniform1i(litU.uLampShadowIdx, SHD.lampIdx);
      } else {
        gl.uniform1f(litU.uLampShadowOn, 0.0);
      }
    } else {
      gl.uniform1f(litU.uShadowStr, 0.0);
      gl.uniform1f(litU.uCarShadowOn, 0.0);
      gl.uniform1f(litU.uLampShadowOn, 0.0);
    }
    gl.uniform3fv(litU.uSkyZenith,  frame.skyZenith  || [0.18, 0.40, 0.78]);
    gl.uniform3fv(litU.uSkyHorizon, frame.skyHorizon || [0.62, 0.74, 0.88]);
    // FOG HEIGHT FALLOFF knob (absolute; def 0.018 matches the shipped palette).
    uf1(litU.uFogHeight, _litUf, "fogHeight", T && T.fogHeight != null ? T.fogHeight : (frame.fogHeight != null ? frame.fogHeight : 0.0));
    // GROUND MIST knob: scale the per-condition mist amount (multiplier, def 1).
    gl.uniform1f(litU.uGroundMist,  (frame.groundMist != null ? frame.groundMist : 0.0) * (T && T.mistDensity != null ? T.mistDensity : 1));
    gl.uniform1f(litU.uLampFog,     frame.lampFog != null ? frame.lampFog : 0.0);
    gl.uniform1f(litU.uTime,        frame.time  != null ? frame.time  : 0.0);
    gl.uniform1f(litU.uCloudCover,  frame.cloud != null ? frame.cloud : 0.0);
    gl.uniform1f(litU.uCloudSpeed,  frame.cloudSpeed != null ? frame.cloudSpeed : 1.0);
    uf1(litU.uCloudShadowDim, _litUf, "cloudShadowDim", T && T.cloudShadowDim != null ? T.cloudShadowDim : 0.80);
    // CAR SUN GLINT / CAR SPARKLE / FOG SUN CORE knobs (defaults = shipped look).
    uf1(litU.uCarSunGlint, _litUf, "carSunGlint", T && T.carSunGlint != null ? T.carSunGlint : 12.0);
    uf1(litU.uCarSparkle,  _litUf, "carSparkle",  T && T.carSparkle  != null ? T.carSparkle  : 1.6);
    uf1(litU.uFogSunCore,  _litUf, "fogSunCore",  T && T.fogSunCore  != null ? T.fogSunCore  : 0.6);
    uf1(litU.uLampNearClamp,  _litUf, "lampNearClamp",  T && T.lampNearClamp  != null ? T.lampNearClamp  : 4.0);
    uf1(litU.uWindowSunFlash, _litUf, "windowSunFlash", T && T.windowSunFlash != null ? T.windowSunFlash : 1.0);
    uf1(litU.uSkyRimGlow,     _litUf, "skyRimGlow",     T && T.skyRimGlow     != null ? T.skyRimGlow     : 1.0);
    uf1(litU.uAmbContactDark, _litUf, "ambContactDark", T && T.ambContactDark != null ? T.ambContactDark : 1.0);
    uf1(litU.uLampWallSpill,  _litUf, "lampWallSpill",  T && T.lampWallSpill  != null ? T.lampWallSpill  : 1.0);
    gl.uniform1f(litU.uWetness,     frame.wetness != null ? frame.wetness : 0.0);
    // Env probe: dedicated unit 6 (0 shadow / 5 decal / 7 blocker). A COMPLETE
    // cube must ALWAYS be bound here with uEnvCube pointed at it — even with no
    // probe (menu / setup viewer / tools) — otherwise the samplerCube defaults to
    // unit 0 (a 2D texture), which is incomplete and renders the car black on
    // strict drivers. Bind the real cube only when it's live and not the current
    // render target (feedback guard); the dummy covers every other case.
    ensureEnvDummy();
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, (envTex && !_envActive) ? envTex : envDummyTex);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(litU.uEnvCube, 6);
    gl.uniform1f(litU.uEnvStr, (envTex && envReady && !_envActive && !frame.noEnv)
      ? (T && T.carEnvCube != null ? T.carEnvCube : 0.0) : 0.0);
    {
      const L = frame.lights;
      uploadLightSet(L, null, L ? (L.length / 15) | 0 : 0);
    }
    _matEmissive = _matAlpha = _matRough = _matMetal = _matSpec = _matDetail = _matCC = _matCP = _matSpark = -1;
  }

  function uploadLightSet(L, idx, n, L2, o2, n2) {
    const nTail = (L2 && n2 > 0) ? Math.min(n2 | 0, MAX_LIGHTS) : 0;
    const nStatic = L ? Math.max(0, Math.min(MAX_LIGHTS - nTail, n | 0)) : 0;
    const nL = nStatic + nTail;
    gl.uniform1i(litU.uNumLights, nL);
    if (nL <= 0) return;
    const A = _luA, B = _luB, C = _luC, D = _luD;
    for (let i = 0; i < nL; i++) {
      const fromTail = i >= nStatic;
      const src = fromTail ? L2 : L;
      const o = fromTail ? (((o2 | 0) + (i - nStatic)) * 15)
                         : ((idx ? idx[i] : i) * 15);
      const i4 = i * 4;
      // PER-CHUNK LAMPS intensity. The knob is now a 0..1 amount, not a
      // toggle: turning it on gives every chunk its OWN nearest-N lamps
      // instead of making the whole visible scene share one set, so a fragment
      // that previously saw a handful of lamps that actually reach it now sees
      // up to MAX_LIGHTS — and the scene reads far brighter at the same LAMP LEVEL.
      // That is not a bug in the feature, it is more light genuinely arriving;
      // the knob's value is the dimmer that makes it usable.
      //
      // TRACK lamps only. Car tail-lights ride the same uniform arrays (the
      // tail slice above nStatic) and are not per-chunk, so scaling them would
      // dim the field's lights for a reason that has nothing to do with them.
      const s = fromTail ? 1 : _lampScale;
      A[i4] = src[o]; A[i4 + 1] = src[o + 1]; A[i4 + 2] = src[o + 2]; A[i4 + 3] = src[o + 6];
      B[i4] = src[o + 3] * s; B[i4 + 1] = src[o + 4] * s; B[i4 + 2] = src[o + 5] * s; B[i4 + 3] = src[o + 12];
      C[i4] = src[o + 7]; C[i4 + 1] = src[o + 8]; C[i4 + 2] = src[o + 9]; C[i4 + 3] = src[o + 10];
      D[i4] = src[o + 11]; D[i4 + 1] = 0; D[i4 + 2] = 0; D[i4 + 3] = 0;
    }
    gl.uniform4fv(litU["uLightA[0]"], A, 0, nL * 4);
    gl.uniform4fv(litU["uLightB[0]"], B, 0, nL * 4);
    gl.uniform4fv(litU["uLightC[0]"], C, 0, nL * 4);
    gl.uniform4fv(litU["uLightD[0]"], D, 0, nL * 4);
  }

  function litMaterial(modelMat, opts) {
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
    const sparkle = opts && opts.sparkle !== undefined ? opts.sparkle : 1.0;
    if (emissive  !== _matEmissive) { gl.uniform1f(litU.uEmissive,  emissive);  _matEmissive = emissive; }
    if (alpha     !== _matAlpha)    { gl.uniform1f(litU.uAlpha,     alpha);     _matAlpha    = alpha; }
    if (roughness !== _matRough)    { gl.uniform1f(litU.uRoughness, roughness); _matRough    = roughness; }
    if (metalness !== _matMetal)    { gl.uniform1f(litU.uMetalness, metalness); _matMetal    = metalness; }
    if (specular  !== _matSpec)     { gl.uniform1f(litU.uSpecular,  specular);  _matSpec     = specular; }
    if (detail    !== _matDetail)   { gl.uniform1f(litU.uDetail,    detail);    _matDetail   = detail; }
    if (clearcoat !== _matCC)       { gl.uniform1f(litU.uClearcoat, clearcoat); _matCC       = clearcoat; }
    if (carPaint  !== _matCP)       { gl.uniform1f(litU.uCarPaint,  carPaint);  _matCP       = carPaint; }
    if (sparkle   !== _matSpark)    { gl.uniform1f(litU.uSparkle,   sparkle);   _matSpark    = sparkle; }
    return alpha;
  }

  // One canonical mesh + a per-instance transform, instead of the same geometry
  // fused into the world N times. See js/track/graph.js and
  // docs/research/SCENE-GRAPH-PLAN.md; the producer is graph.batches().
  //
  // Layout: the mesh's own vertex VBO keeps attributes 0-4 with divisor 0, and a
  // SECOND buffer carries the instance columns at 5-8 (+ colour at 9) with
  // divisor 1. Nothing about the vertex format changes, so the same {pos,nrm,
  // col,idx,mat} geometry works in both paths.
  function createInstancedBatch(data, matrices, colors, opts) {
    const mesh = createMesh(data);
    if (!mesh) return null;
    const vao = mesh.vao;
    gl.bindVertexArray(vao);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ARRAY_BUFFER, matrices, gl.STATIC_DRAW);
    // A mat4 attribute is four consecutive vec4 slots — WebGL2 has no mat4
    // attribute type, the four columns must be declared individually.
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
    mesh.visible = mesh.instances;    // culling narrows this; see cullInstances()
    mesh.ibo = ibo;
    mesh.cbo = cbo;

    if (opts && opts.cellSize > 0) {
      const cell = opts.cellSize;
      // Conservative per-instance reach: the model's own extent, scaled by the
      // largest scale any instance applies. Cheap and never under-estimates.
      let reach = opts.radius || 0;
      if (!reach) {
        const p0 = data.pos;
        for (let i = 0; i < p0.length; i++) { const a = Math.abs(p0[i]); if (a > reach) reach = a; }
      }
      const buckets = new Map();
      for (let i = 0; i < mesh.instances; i++) {
        const b = i * 16, x = matrices[b + 12], y = matrices[b + 13], z = matrices[b + 14];
        // Column lengths ARE the per-instance scale (orthonormal basis * scale).
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
      mesh.cells = [...buckets.values()];
      mesh.srcMatrices = matrices;      // CPU copies the repack reads from
      mesh.srcColors = colors && colors.length ? colors : null;
      mesh.packMatrices = new Float32Array(matrices.length);
      mesh.packColors = mesh.srcColors ? new Float32Array(mesh.srcColors.length) : null;
    }
    return mesh;
  }

  function cullInstances(batch, planes) {
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
      if (!CHK.aabbInFrustum(planes, c.mn, c.mx)) continue;
      for (const i of c.idx) {
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
    if (n) {
      // WebGL2 bufferSubData(srcOffset, length) — no .subarray view.
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
    batch._cullN = n;
    return n;
  }

  function drawInstanced(batch, opts) {
    if (ctxGone() || !batch || !batch.instances) return;
    // IDENTITY model matrix: the transform lives entirely in the instance
    // columns. Passing anything else would be silently ignored by the shader and
    // mislead the next reader.
    const alpha = litMaterial(IDENT4, opts);
    setDepthMask(alpha >= 1);
    setBlend(alpha < 1);
    bindVAO(batch.vao);
    const dbl = opts && opts.doubleSided;
    if (dbl) setCull(false);
    const n = batch.visible === undefined ? batch.instances : batch.visible;
    if (n > 0) {
      if (litU.uInstanced) gl.uniform1f(litU.uInstanced, 1);
      gl.drawElementsInstanced(gl.TRIANGLES, batch.count, batch.indexType, 0, n);
      if (litU.uInstanced) gl.uniform1f(litU.uInstanced, 0);
    }
    if (dbl) setCull(true);
  }

  function freeInstancedBatch(batch) {
    if (!batch) return;
    if (batch.ibo) gl.deleteBuffer(batch.ibo);
    if (batch.cbo) gl.deleteBuffer(batch.cbo);
    if (freeMesh) freeMesh(batch);
  }

  function draw(mesh, modelMat, opts) {
    if (ctxGone() || !mesh) return;
    const alpha = litMaterial(modelMat, opts);
    // Each draw declares the full render state it needs (no restores afterwards),
    // so runs of same-state draws collapse to a single real toggle via the cache.
    // Translucent draws (ghost car, boost flame, pulsing rain light) must NOT
    // write depth: a 35%-alpha ghost that lands in the depth buffer culls the
    // cars/props drawn after it (they pop invisible "through" the ghost) and
    // registers in sceneDepth as a solid wall for SSAO/SSR/god-rays.
    setDepthMask(alpha >= 1);
    setBlend(alpha < 1);
    bindVAO(mesh.vao);
    const noAW = (opts && opts.noAlphaWrite) || alpha < 1;
    if (noAW) setAlphaWrite(false);
    // doubleSided: render back faces too (cull off) — for the wheels + car body,
    // whose single-winding tyre walls must show from every angle without any
    // coincident duplicate to z-fight.
    const dbl = opts && opts.doubleSided;
    if (dbl) setCull(false);
    const _db = opts && opts.depthBias;
    if (_db) { setPolyOffset([_db[0], _db[1]]); }
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
    if (_db) { setPolyOffset(null); }
    if (dbl) setCull(true);
    if (noAW) setAlphaWrite(true);
  }

  function drawSky(sky) {
    if (ctxGone() || !sky) return;
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
    if (_shadowVPToken !== _frameToken) {
      gl.uniformMatrix4fv(shadowU.uViewProj, false, frameViewProj);
      _shadowVPToken = _frameToken;
    }
    gl.uniformMatrix4fv(shadowU.uModel, false, modelMat);
    gl.uniform2f(shadowU.uSize, w, l);
    setBlend(true);
    setDepthMask(false);
    setPolyOffset([-4.0, -8.0]);
    bindVAO(shadowVAO);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    setPolyOffset(null);
  }

  function drawMark(modelMat, w, l) {
    if (ctxGone()) return;
    useProg(markProg);
    if (_markVPToken !== _frameToken) {
      gl.uniformMatrix4fv(markU.uViewProj, false, frameViewProj);
      _markVPToken = _frameToken;
    }
    gl.uniformMatrix4fv(markU.uModel, false, modelMat);
    gl.uniform2f(markU.uSize, w, l);
    setBlend(true);
    setDepthMask(false);
    setPolyOffset([-4.0, -8.0]);
    bindVAO(shadowVAO);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    setPolyOffset(null);
  }

  function drawSkidBatch(verts, vertCount, dirty) {
    if (ctxGone()) return true; // no-op; per-mark fallback would also fail
    if (!markBatchProg || vertCount <= 0) return !markBatchProg ? false : true;
    useProg(markBatchProg);
    gl.uniformMatrix4fv(markBatchU.uViewProj, false, frameViewProj);
    setBlend(true);
    setDepthMask(false);
    setPolyOffset([-4.0, -8.0]);   // sit on the road, no z-fight
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

  // Additive lens-glare halos: one round billboard per lamp. `lights` is the
  // stride-15 frame.lights array; fields 0-6 (position, colour, radius) and 14
  // (glareW: per-lamp halo weight, 0 = no visible fixture = no halo) are
  // read here. Must be called while the HDR scene target is bound (after
  // drawSky, before present) so the glare lands in the scene buffer and
  // participates in bloom. `str` scales halo brightness (0 disables).
  const _glowCorners = [[-1, 0], [1, 0], [1, 1], [-1, 0], [1, 1], [-1, 1]];
  function drawGlow(lights, str) {
    if (ctxGone() || !glowProg || !lights || !lights.length || !(str > 0)) return;
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
    // Additive, depth-tested (halos occlude behind walls) but no depth write.
    setBlend(true);
    gl.blendFunc(gl.ONE, gl.ONE);
    setDepthMask(false);
    setCull(false);
    gl.drawArrays(gl.TRIANGLES, 0, nDraw * 6);
    // Restore the default alpha-blend + culling for subsequent passes.
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    setCull(true);
  }

  // Transient FX particle batch (tyre smoke / sparks / kickup / rain spray).
  // `data` is an interleaved Float32Array ([cornerX, cornerY, center xyz,
  // colour rgb, size, alpha] ×6 verts per particle); `floatCount` floats are
  // live. Two blend groups per frame: additive=false → classic alpha smoke/
  // dust/spray; additive=true → ONE/ONE sparks whose HDR tints feed bloom.
  // Depth-TESTED (puffs hide behind walls/cars) but never depth-written, and
  // the scene alpha channel (the SSR car-paint tag — see draw()) is masked.
  // Must be called while the HDR scene target is bound (before present) so
  // particles tone-map and bloom with the scene.
  function drawParticles(data, floatCount, additive) {
    if (ctxGone() || !particleProg || !data || !(floatCount > 0) || !frameEye) return;
    useProg(particleProg);
    gl.uniformMatrix4fv(particleU.uViewProj, false, frameViewProj);
    gl.uniform3fv(particleU.uEye, frameEye);
    gl.uniform1f(particleU.uAdditive, additive ? 1 : 0);
    bindVAO(particleVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, particleVBO);
    if (floatCount > particleCap) {
      particleCap = floatCount;
      gl.bufferData(gl.ARRAY_BUFFER, particleCap * 4, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, floatCount);
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
    // TrackGraph.batches() consumer — see js/track/graph.js.
    createInstancedBatch,
    cullInstances,
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
    freeTexture,
    drawDecal,
    chunkedTrackCoords: true,
    createChunkedMesh: (data, cellSize) => CHK.createChunkedMesh(data, cellSize),
    freeMesh,
    freeChunkedMesh: (mesh) => CHK.freeChunkedMesh(mesh),
    begin,
    draw,
    drawChunked: (mesh, modelMat, opts) => CHK.drawChunked(mesh, modelMat, opts),
    castShadowChunked: (mesh, model) => CHK.castShadowChunked(mesh, model),
    makeFrustumPlanes: (viewProj) => CHK.makeFrustumPlanes(viewProj),
    aabbInFrustum: (planes, mn, mx) => CHK.aabbInFrustum(planes, mn, mx),
    // WGX and TLX both export this; GLX had it in CHK but never forwarded it,
    // so a future gfx.aabbDist2 caller would die on the DEFAULT backend only —
    // the mirror image of the drift backend-surface-parity.test.mjs prevents.
    aabbDist2: (mn, mx, ex, ey, ez) => CHK.aabbDist2(mn, mx, ex, ey, ez),
    drawSky,
    drawShadow,
    drawMark,
    drawSkidBatch,
    drawGlow,
    drawParticles,
    present: (opts) => { if (ctxGone()) return; return PST.present(opts); },
    envFaceBegin,
    envFaceEnd,
    envProbeReady() { return envReady; },
    envProbeReset() { envFacesMask = 0; envReady = false; },
    shadowBegin: (lightVP) => SHD.shadowBegin(lightVP),
    castShadow: (mesh, model) => SHD.castShadow(mesh, model),
    castShadowInstanced: (batch, count) => SHD.castShadowInstanced(batch, count),
    shadowEnd: () => SHD.shadowEnd(),
    get shadowCullVP() { return SHD ? (SHD.castCullVP || SHD.lightVP) : null; },
    carShadowBegin: (lightVP, boxScale) => SHD.carShadowBegin(lightVP, boxScale),
    carShadowEnd: () => SHD.carShadowEnd(),
    lampShadowBegin: (lightVP, lightIdx) => SHD.lampShadowBegin(lightVP, lightIdx),
    lampShadowEnd: () => SHD.lampShadowEnd(),
    get width() { return width; },
    get height() { return height; },
    get aspect() { return aspect; },
    hdrMode: () => PST.hdrOk(),
    // Debug introspection for the dynamic car shadow map (used by tests/tools).
    carShadowState: () => ({ enabled: SHD.carEnabled, arms: SHD.carArms }),
    // Same for the nearest-floodlight spot shadow map (idx = frame.lights slot).
    lampShadowState: () => ({ enabled: SHD.lampEnabled, arms: SHD.lampArms, idx: SHD.lampIdx }),
    msaa: () => PST.msaa(),
    pcss: () => SHD.pcssEnabled,
    setRenderScale, getRenderScale,
    gpuTimer(on) {
      if (on !== undefined) {
        _gpuTimerOn = !!on && !!_gpuTimerExt;
        if (!_gpuTimerOn) {
          if (_gpuQActive) { try { gl.endQuery(_gpuTimerExt.TIME_ELAPSED_EXT); gl.deleteQuery(_gpuQActive); } catch (_) {} _gpuQActive = null; }
          for (let i = 0; i < _gpuQPending.length; i++) gl.deleteQuery(_gpuQPending[i]);
          _gpuQPending.length = 0; _gpuMs = -1;
        }
      }
      return { supported: !!_gpuTimerExt, on: _gpuTimerOn };
    },
    gpuMs() { return _gpuMs; },
    isMobile: IS_MOBILE,
    mobileTier: MOBILE_TIER,   // phone NOT opted into GRAPHICS: HIGH → memory-safe caps apply
  };
})();
