/*
 * Apex 26 — WebGL2 renderer core: the PBR GGX lit pass (sun + 32 spot lamps,
 * shadow maps, procedural materials, wet road, fog), the procedural sky and
 * the FX passes — ~13 programs. GLSL sources live in js/render/shaders/
 * (chunks/lit/sky/fx/post); the post, shadow and chunked-scenery subsystems
 * are split into js/render/glx/.
 */
"use strict";

const GLX = (function () {
  // GLSL sources live in js/render/shaders/{lit,sky,fx,post}.js (loaded before this
  // file). The post/shadow sources are destructured by the split subsystem modules
  // (js/render/glx/post.js, js/render/glx/shadow.js) instead of here.
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
  let _instCellCache = true;
  try { _forceMobile = localStorage.getItem("apex26.forceMobileTier") === "1"; } catch (_) {}
  const IS_MOBILE = _forceMobile ||
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
  // A capable phone can opt into the desktop-quality tier (full DPR + MSAA +
  // full-res atlases + 2048 shadows) via the pause-menu GRAPHICS: HIGH setting.
  // Default OFF — the safe tier is what keeps memory-limited devices alive.
  let _gfxHigh = false;
  try { _gfxHigh = localStorage.getItem("apex26.gfxHigh") === "1"; } catch (_) {}
  // INSTANCE CELL-SET CULL CACHE — ON; apex26.instCellCache=0 is the escape
  // hatch, the shape __apex.matTex(0) gives the baked-material path. Keys the
  // resident pack on the surviving CELL SET instead of the frustum, which the
  // plane cache below cannot do while driving. -48% instance upload bytes in a
  // pack; numbers, soundness and the real-GPU gate: docs/PERF-FINDINGS.md 2c.
  try { if (localStorage.getItem("apex26.instCellCache") === "0") _instCellCache = false; } catch (_) {}
  // MOBILE TIER = a phone NOT opted into high quality. All the memory downgrades
  // key off this, so HIGH restores full quality (a reload re-runs init with it).
  const MOBILE_TIER = IS_MOBILE && !_gfxHigh;
  let _ctxLost = false;   // true between webglcontextlost and the reload on restore
  // GPU error counter — WebGL has no onuncapturederror, so drain getError() once
  // per present. Exists because the real-GPU gate read null here and passed
  // vacuously: docs/PERF-FINDINGS.md 2e.
  let _glErrors = 0, _glFirstError = "";
  const GL_ERR_NAMES = { 1280: "INVALID_ENUM", 1281: "INVALID_VALUE", 1282: "INVALID_OPERATION",
                         1285: "OUT_OF_MEMORY", 1286: "INVALID_FRAMEBUFFER_OPERATION", 37442: "CONTEXT_LOST" };
  // gl.getError() is a synchronous command-buffer flush + a blocking IPC to
  // the GPU process (the same stall init() documents for getParameter), so a
  // drain on EVERY present serialised the JS thread behind the GPU process
  // every frame. Its consumers are the real-GPU gate (tools/gpu-game-check,
  // PERF-FINDINGS 2e) and gpuErrors(): drain for the first presents after
  // boot (shader/pipeline errors surface there) and whenever the diagnostic
  // flag is set (tools/gpu-game-check seeds it) — never on a steady-state
  // frame. gpuErrors() stays a pure read: the counter is drained at present().
  // 30 presents, not 120: shader/pipeline errors surface in the first handful,
  // and on Safari's out-of-process GPU each drain is a blocking IPC — 120 of
  // them after every track switch was three seconds of serialised frames.
  const DRAIN_PRESENTS = 30;
  let _drainLeft = DRAIN_PRESENTS, _glDrainAlways = false;
  try { _glDrainAlways = localStorage.getItem("apex26.glErrDrain") === "1"; } catch (_) {}
  function drainGlErrors(where) {
    if (!gl || _ctxLost) return;
    for (let i = 0; i < 8; i++) {          // bounded: a wedged context can loop
      const e = gl.getError();
      if (!e) return;
      _glErrors++;
      if (!_glFirstError) _glFirstError = (GL_ERR_NAMES[e] || ("0x" + e.toString(16))) + " @ " + where;
    }
  }
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
  // Identity model matrix for instanced draws: the transform lives in the
  // per-instance columns, so uModel is unused on that path.
  const IDENT4 = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  // Baked PBR material arrays (js/render/shared/assets.js). Layer index == MAT id, so
  // the shader indexes them with the per-vertex material id it already carries.
  // Null until a pack is loaded — a pack ships in assets/pack and loads at boot
  // (matTexMix def 1.0), but load is async and can fail, so every path below
  // has to survive them staying null and degrade to the procedural look.
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
  // ── Live environment probe ──────────────────────────────────────────────────
  // A small cubemap rendered around the player car (one face per frame — full
  // refresh every 6 frames) that the car-paint clearcoat samples for REAL
  // reflections of the surrounding world. 64px RGBA8 faces + mips: reflections
  // are blurred by paint roughness anyway, so tiny faces read perfectly.
  const ENV_SIZE = 64;
  // Probe draw-distance cull, metres. Counted reach in docs/PERF-FINDINGS.md /
  // tools/gfx/chunk-reach.cjs. A face is 90 deg across ENV_SIZE pixels = 1.41 deg/px,
  // so a 20 m building subtends ~2.7 px here and 0.9 px at the 900 m far plane.
  const ENV_CULL_M = 300;
  let envTex = null, envFBO = null, envDepthRB = null, envDummyTex = null;
  let _envDisabled = false;   // envInit() found the probe FBO incomplete: analytic reflections only
  let envFacesMask = 0, envReady = false, _envActive = false;
  // Saved game-frame fields while a probe face is open — restored in envFaceEnd
  // so drawWorldMeshes (propBatches cull via frame.viewProj) still sees the
  // probe frustum. Restoring in envFaceBegin left cull against the main camera.
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
  // Full baked track light list + the PER-CHUNK LAMPS toggle. GLXChunked reads
  // both to bind a per-chunk light subset instead of this frame's global 32.
  let frameAllLights = null, framePerChunkLights = 0, frameTailStart = 0, frameTailCount = 0;
  // Track-lamp intensity scale applied in uploadLightSet. 1 unless PER-CHUNK
  // LAMPS is on, in which case it is that knob's value — see begin().
  // Point-light upload scratch (lit program). Sized for MAX_LIGHTS (48) and
  // reused every frame — .subarray(0, nL*stride) is uploaded to avoid per-frame
  // typed-array allocs (GC jitter on dense night grids). Mirrors the _gr*
  // god-ray scratch, which moved to js/render/glx/post.js with present().
  // Four vec4s match lit.js packing (pos+rad / col+bleed / dir+coneIn / coneOut).
  const MAX_LIGHTS = 48;
  // ONE interleaved scratch, stride 16 floats (4 vec4s) per light — matches
  // uLight[] in shaders/lit.js so a chunk uploads in a single uniform4fv.
  const _luL = new Float32Array(MAX_LIGHTS * 16);
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

  // The split renderer subsystems (js/render/glx/{post,shadow,chunked}.js),
  // wired at init() through the GLXCore ctx built there. PST = post chain,
  // SHD = shadow maps (sun/car/lamp + PCSS blocker), CHK = chunked meshes.
  let core = null, PST = null, SHD = null, CHK = null;


  // Material uniform cache — skip redundant per-draw scalar uploads.
  let _matEmissive = -1, _matAlpha = -1, _matRough = -1, _matMetal = -1, _matSpec = -1, _matDetail = -1, _matCC = -1, _matCP = -1, _matSpark = -1;
  // uNumLights, last value written to the LIT program. Unlike the _mat* caches
  // above this is NOT cleared per frame: a WebGL uniform is per-PROGRAM state
  // and survives every unbind, so the only thing that can invalidate it is a
  // relink — which is where it is reset (beside the locs() call that fetches
  // the location). Uploading it is unconditional today, and uploadLightSet is
  // its only writer on this program; post.js's godray pass writes its OWN
  // program's uNumLights through a different location and cannot collide.
  let _luNL = -1;

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
  // Tuner-knob upload cache (PERF-FINDINGS §3). envFaceBegin() calls begin()
  // and the main camera calls begin() again in the same game frame with the
  // same LIGHTING TUNER scalars; WebGL uniforms persist on the program, so
  // equal values are skipped. View / eye / env / lights / time still upload
  // every begin(). Honest cost is ~0.05 ms — hygiene, not a GPU win.
  // Cleared when lit/sky programs are (re)linked.
  const _litUf = Object.create(null), _skyUf = Object.create(null);
  // Frozen fallbacks for the frame-global vec3s. These were inline literals, so
  // a frame that omitted the field allocated a fresh three-element array on
  // every begin() — and begin() runs up to eight times a game frame.
  const ZERO3 = [0, 0, 0];
  const SKY_ZENITH_DEF = [0.18, 0.40, 0.78], SKY_HORIZON_DEF = [0.62, 0.74, 0.88];

  function _clearUf(o) { for (const k in o) delete o[k]; }
  function uf1(loc, cache, key, v) {
    if (!loc) return;
    if (cache[key] !== v) { gl.uniform1f(loc, v); cache[key] = v; }
  }
  // int twin, for the sampler UNIT bindings and uLampShadowIdx: seven
  // uniform1i calls ran on every begin() — twice a game frame with the probe
  // live — to re-state unit numbers that change only on relink. The cache is
  // _litUf, cleared with it, so a relink re-uploads.
  function ufI(loc, cache, key, v) {
    if (!loc) return;
    if (cache[key] !== v) { gl.uniform1i(loc, v); cache[key] = v; }
  }
  // mat4 twin of uf1, for uModel: 103.2 uploads a frame against 50.3 distinct
  // values (docs/PERF-FINDINGS.md 2h),
  // because drawChunked calls litMaterial once per chunk RUN and every run of
  // one mesh shares that mesh's model matrix.
  //
  // It COPIES the sixteen floats rather than retaining the caller's array, and
  // that is load-bearing: callers hand in scratch matrices they mutate in place
  // between draws (game.js's _wheelWorld/_ringWorld, DebrisWorld's _mat), so a
  // retained reference would compare a value against itself and skip a real
  // change. Sixteen float compares to save a GL call is the right trade; the
  // measured 50.3 is what a COPYING cache achieves, not an idealised one.
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

  // vec3 twin of uf1. MEASURED on the current tree (vegas night, full field,
  // scratch/r10/state-ceiling.mjs): uniform3fv runs 32.4 times a frame and 22.8
  // of those re-send a value the program already holds — 70.2% collapsible, the
  // most concentrated redundancy left in the frame after uModel and uNumLights.
  // The cause is the same one those two had: begin() runs several times per game
  // frame (six env-cube faces, the shadow pass, the main camera) and the SUN,
  // AMBIENT, FOG and SKY terms are frame-global, identical in every one of them.
  //
  // It COPIES the three floats for the same load-bearing reason ufM4 does:
  // callers hand in scratch arrays they mutate in place between begins
  // (_ambScratchG / _ambScratchS above), so a retained reference would compare a
  // value against itself and skip a real change.
  // THE STORE IS A PLAIN ARRAY, NOT A Float32Array, and that is the whole
  // difference between a cache and a cost. Written first with Float32Array(3)
  // — the obvious mirror of ufM4 — it skipped NOTHING: measured 17.5 calls a
  // frame, 0 skips. A Float32Array ROUNDS on store, so the comparison was a
  // float32 against the float64 the caller passed and could not match:
  //     cached = 0.11999999731779099   incoming = 0.12
  // ufM4 gets away with Float32Array only because M4 hands it Float32Array
  // matrices already; these vec3s are plain JS number arrays off `frame`.
  // A cache that never hits is worse than none — it pays the branch and the
  // allocation to change nothing — so this one keeps the caller's precision.
  function uf3(loc, cache, key, v) {
    if (!loc) return;
    const p = cache[key];
    if (p !== undefined && p[0] === v[0] && p[1] === v[1] && p[2] === v[2]) return;
    // Copy, never retain: callers pass scratch arrays they mutate in place
    // (_ambScratchG / _ambScratchS), so a retained reference would compare a
    // value against itself and skip a real change — ufM4's reason, unchanged.
    if (p === undefined) cache[key] = [v[0], v[1], v[2]];
    else { p[0] = v[0]; p[1] = v[1]; p[2] = v[2]; }
    gl.uniform3fv(loc, v);
  }

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
  // The same idea extended to the three states draw() currently toggles on
  // EVERY call. MEASURED and found to save NOTHING: those four calls total 63.5
  // per frame on vegas and the cache collapses zero of them, because the toggles
  // strictly ALTERNATE (cars are doubleSided, their neighbours are not). The
  // PerfTry switch was removed; _stateCache() is now permanently false, so these
  // behave exactly as the direct gl calls they replaced. Kept because the routing
  // is tidier and because resetDrawState() is a real invariant.
  // GL defaults: culling ON, all four colour channels writable,
  // polygon offset disabled. resetDrawState() re-syncs to those from begin()
  // ONLY — present() does not call it, so a draw issued between present() and
  // the next begin() inherits whatever cull/mask/offset the frame left behind.
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
    if (!vs || !fs) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      return null;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    // Mark for deletion now (legal while attached) — freed with the program
    // instead of leaking one VS+FS pair per linked program for the ctx's life.
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      Log.error("gfx", "GLX program link failed: " + gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
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

    // Anisotropic filtering (ubiquitous, but still an extension in WebGL2).
    // Applied at a modest 4× to the mippy content textures (decal atlases,
    // env cube) so decals stay legible at grazing angles instead of smearing
    // into the LINEAR_MIPMAP_LINEAR blur. Query once; 0 = unavailable.
    try {
      _anisoExt = gl.getExtension("EXT_texture_filter_anisotropic")
               || gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic");
      _anisoMax = _anisoExt
        ? Math.min(4, gl.getParameter(_anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 0) : 0;
    } catch (_) { _anisoExt = null; _anisoMax = 0; }

    // WebGL context-loss recovery. Mobile tile GPUs can drop the context under
    // memory pressure (the per-frame env-probe cube adds load). Without a handler
    // the loss is permanent and later gl calls cascade into errors. preventDefault
    // lets the GPU restore; on restore we reload to cleanly rebuild every GL
    // resource (programs, FBOs, textures, meshes) rather than track them all.
    canvas.addEventListener("webglcontextlost", function (e) {
      e.preventDefault(); _ctxLost = true;
      // Only downgrade quality on a loss that happened while VISIBLE — that's the
      // memory-pressure signal. iOS also drops the context on backgrounding
      // (document.hidden), a benign transient loss that shouldn't permanently
      // disable the env probe. Persisting the opt-out otherwise stops a
      // lose→reload→lose loop on genuinely memory-tight devices.
      // PER-CHUNK LAMPS goes off with it, and for a stronger reason than the
      // probe's. The crash sentinel that would otherwise pre-degrade a device
      // that died last session is MOBILE ONLY by design (js/perf/governor.js gates
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
      //
      // A HIDDEN loss takes none of the above. iOS drops the context of a
      // backgrounded tab routinely; reloading on the timer put the player on
      // the title screen mid-race when they came back, and spent one of the
      // two bounded retries on a loss that was never a crash. Defer the
      // reload to the moment the tab is visible again, uncounted.
      if (document.hidden) {
        try {
          var _onVis = function () {
            if (document.hidden) return;
            document.removeEventListener("visibilitychange", _onVis);
            try { location.reload(); } catch (_) { /* harness */ }
          };
          document.addEventListener("visibilitychange", _onVis);
        } catch (_) { /* no document events: the restore handler below is the remaining path */ }
        return;
      }
      try {
        var _rk = "apex26.ctxLostReloads";
        var _n = (parseInt(sessionStorage.getItem(_rk), 10) || 0) + 1;
        sessionStorage.setItem(_rk, String(_n));
        if (_n <= 2) setTimeout(function () { try { location.reload(); } catch (_) { /* No location (harness/worker): nothing to reload, the latches above still took effect for the next real boot. */ } }, 1200);
      } catch (_) { /* No sessionStorage: skip the auto-recovery rather than risk an unbounded reload loop with no way to count attempts. */ }
    }, false);
    canvas.addEventListener("webglcontextrestored", function () { try { location.reload(); } catch (_) {} }, false);

    // FRAGMENT UNIFORM BUDGET. LIT_FS's default block is ~279 vec4 rows
    // (uLight 192 + uMatTexScale 17 + three mat4 + nine vec3 + ~47 scalars),
    // above the GLES 3.0 floor of 224 that shaders/lit.js still cites. Apple
    // and desktop drivers report 1024+, so iPhone links; an Adreno at the
    // floor does not, and until now the only symptom was init() returning
    // false with a 100 KB shader dumped to the console. Say the two numbers
    // side by side so a "no WebGL" report on a phone names its cause.
    const LIT_FS_ROWS = 279;
    try {
      const rows = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) | 0;
      if (rows && rows < LIT_FS_ROWS) {
        Log.warn("gfx", "GLX: MAX_FRAGMENT_UNIFORM_VECTORS " + rows + " < the lit shader's ~" + LIT_FS_ROWS + " rows — expect the lit program to fail to link on this GPU");
      }
    } catch (_) { /* a caps read must never cost the boot */ }
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
      // that build are provably no-ops (the per-chunk dimmer computed to exactly
      // 1, so col*1 was bit-identical — that scale and its per-lamp inFrameTail
      // test have since been removed as dead; the knob ranges change no runtime behaviour;
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
      // (Re-applied 2026-08-21: the 6-arg forwarding reappeared in the build-
      // 1496 squash merge with this decision record intact — the revert was
      // lost in the merge, not overturned; no crash repro has landed.)
      uploadLightSet: (L, idx, n) => uploadLightSet(L, idx, n),
      // Lamp-shadow SLOT retarget for per-chunk light sets (GLXChunked): the
      // lit shader gates its lamp PCF on loop slot == uLampShadowIdx — a slot
      // in the CURRENTLY BOUND set. A per-chunk set reorders lamps, so the
      // caller must point the slot at the mapped lamp's position in ITS set
      // (or -1) per draw, then restore the global slot. The lit program is
      // already bound on every chunked draw path.
      setLampShadowSlot: (i) => { gl.uniform1i(litU.uLampShadowIdx, i | 0); },
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
    _luNL = -1;   // a relink resets every uniform on the program — see the cache's note
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
      "uNumLights", "uLight[0]"]);
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
      // Dynamic interleaved buffer: [cornerX, cornerY, cx, cy, cz, r, g, b,
      // size, alpha] ×6 verts/particle (filled by js/fx/particles.js).
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

  // Adaptive render scale: the whole 3D pipeline (scene + every post FBO) sizes
  // off width/height, and the canvas CSS size is fixed — so scaling the backing
  // store down and letting the browser upscale is a single knob that trades
  // sharpness for fill-rate. The HUD is a DOM overlay, so only the 3D view
  // softens. setRenderScale() drives it from the frame-time governor in game.js.
  let renderScale = 1;
  // CACHED CSS SIZE. resize() is the first statement of every render() — and
  // clientWidth/clientHeight are LAYOUT reads, so asking for them there forces a
  // synchronous reflow of anything dirtied since the last frame. The HUD dirties
  // layout constantly (textContent, style and classList writes, plus a dataset
  // write on documentElement), so the frame loop was paying a forced reflow every
  // time the 10 Hz HUD tick, an announce, or a lights change landed. The CSS box
  // only changes on a viewport/orientation change or a rotation of the device, so
  // read it when the browser tells us it moved and cache it in between.
  let cssW = 0, cssH = 0, cssDirty = true;
  let canWatchCss = false;
  // The viewport this cache was last taken against, and how long to keep
  // distrusting it. See cssSize().
  let cssVW = -1, cssVH = -1, cssRecheck = 0;
  // 8, not 30: iOS Safari's toolbar collapse changes innerHeight on every
  // scroll-bar gesture, and each change bought 30 forced layouts. The latch
  // bug this countdown exists for (§2u) resolves in a handful of frames.
  const CSS_RECHECK_FRAMES = 8;
  const markCssDirty = () => { cssDirty = true; };
  // Wired from init(), NOT at IIFE eval: `canvas` is still null up here, so an
  // observer attached at module scope would silently observe nothing.
  function watchCanvasSize() {
    if (typeof window === "undefined" || !window.addEventListener) return;
    window.addEventListener("resize", markCssDirty);
    window.addEventListener("orientationchange", markCssDirty);
    canWatchCss = true;
    // Covers what a window resize never fires for: a layout change that moves
    // the canvas alone (entering photo mode, a rotated phone that keeps the same
    // window size). Feature-detected — without it the two listeners above still
    // cover the common cases, and cssSize()'s zero-guard covers first layout.
    if (typeof ResizeObserver === "function" && canvas) {
      try { new ResizeObserver(markCssDirty).observe(canvas); } catch (_) {}
    }
  }
  function cssSize() {
    // THE DIRTY FLAG ALONE IS NOT ENOUGH — measured, not reasoned. It is
    // edge-triggered and consumed unconditionally, so ONE read that lands before
    // the canvas box has reflowed caches the old box, clears the flag, and
    // nothing ever sets it again: GLX.aspect then reports the PREVIOUS
    // viewport's ratio for the rest of the session. In the garage that held a
    // landscape 1.7778 through a whole portrait session and a hand-called
    // resize() could not shift it, while dispatching one synthetic "resize"
    // corrected it on the very next call (artifacts/aspect-verdict.log,
    // artifacts/aspect-why.log; docs/PERF-FINDINGS.md §2u). A stale aspect is
    // not cosmetic — it feeds the main projection matrix, the FOV cap
    // and the FRUSTUM CULL RADIUS (6310), so geometry pops out of the world.
    // window.innerWidth/innerHeight are VIEWPORT metrics, not element layout:
    // reading them here does not force the reflow this cache exists to avoid.
    // A change in either arms a countdown of FRAMES during which the box is
    // re-read, so a read that was too early self-corrects on the next one.
    // A countdown rather than a one-shot re-mark, because a one-shot caches the
    // old box AND records the new viewport — after which nothing differs and
    // the staleness latches exactly as before.
    // FRAMES, not milliseconds: a 500 ms wall-clock window was tried first and
    // measured LEAVING one rotation stale (artifacts/r16-accept.log), because
    // on a box where a frame can take seconds the window expired before the
    // loop ran a single frame. N calls is N frames however slow they are, and
    // at 60fps it is the same half second the window was.
    if (typeof window !== "undefined") {
      const vw = window.innerWidth | 0, vh = window.innerHeight | 0;
      if (vw !== cssVW || vh !== cssVH) {
        // First observation has nothing to differ FROM, so it records without
        // arming: re-reading the frames right after init would spend exactly
        // the reflow this cache exists to avoid (webgpu-lifecycle.test.mjs
        // pins that for WGX).
        const first = cssVW < 0;
        cssVW = vw; cssVH = vh;
        if (!first) cssRecheck = CSS_RECHECK_FRAMES;
      }
    }
    // A zero is never a real size — it means the canvas has not been laid out
    // yet (init before first layout, a display:none ancestor). Keep re-reading
    // until it is real, so this can't latch a 1x1 backbuffer the way a plain
    // cache would; the old read-every-frame code self-corrected for free.
    // canWatchCss: with no listeners attached at all there is no signal left,
    // so never trust the cache (WGX has always done this; GLX did not, and
    // latched the first non-zero size forever).
    if (cssDirty || cssW <= 0 || cssH <= 0 || cssRecheck > 0 || !canWatchCss) {
      if (cssRecheck > 0) cssRecheck--;
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

    // Interleaved: [x,y,z, nx,ny,nz, r,g,b (, mat) (, s,x,hw)] per vertex — one
    // buffer. Optional per-vertex material id (data.mat) adds a 10th float
    // (attrib 3); meshes without it stay 9-float and aMat reads the generic
    // default (0=FLAT). Optional track coords (data.trk: arc-length s, signed
    // lateral offset, half-width — 3 floats, attrib 4) let the ROAD evaluate its
    // markings analytically in the fragment shader instead of carrying a vertex
    // column per painted line. Meshes without it read (0,0,0), and the shader
    // gates on hw > 0 so nothing else can accidentally paint lines on itself.
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
    // 4× anisotropy: decal atlases are read at grazing angles on the bodywork —
    // trilinear alone smears the sponsors/numbers into mip blur there.
    if (_anisoMax > 1) gl.texParameterf(gl.TEXTURE_2D, _anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, _anisoMax);
    // Mid-frame uploads (a livery-atlas miss during the lit pass) run with
    // unit 0 active, and unit 0 must stay bound to the shadow map (see
    // drawDecal) — a bare null unbind here left every later lit draw sampling
    // an empty unit as uShadowMap for one frame. Restore the invariant.
    gl.bindTexture(gl.TEXTURE_2D, (SHD && SHD.enabled && SHD.mapTex) || null);
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
  // size×size; the caller (js/render/shared/assets.js) guarantees that from the pack
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
    // REPEAT, unlike createTexture's CLAMP_TO_EDGE: these tile across a whole
    // circuit's worth of world-space triplanar coordinate.
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    // The road is the grazing-angle surface these exist for — trilinear alone
    // smears tarmac aggregate into mip mush ~20 m ahead of the car.
    if (_anisoMax > 1) gl.texParameterf(gl.TEXTURE_2D_ARRAY, _anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, _anisoMax);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    return tex;
  }

  // Adopt (or clear, with a falsy argument) the baked material maps. Frees any
  // previously-bound arrays so a pack swap — tier change, test teardown — can't
  // leak GPU memory.
  function setMaterialMaps(maps) {
    if (matAlbedoTex) { gl.deleteTexture(matAlbedoTex); matAlbedoTex = null; }
    if (matNormalTex) { gl.deleteTexture(matNormalTex); matNormalTex = null; }
    matTexScales.fill(0);
    if (!maps) return;
    matAlbedoTex = maps.albedo || null;
    matNormalTex = maps.normal || null;
    const sc = maps.scales;
    if (sc) for (let i = 0; i < MAT_TEX_LAYERS; i++) matTexScales[i] = +sc[i] > 0 ? +sc[i] : 0;
    // No albedo array means no baked material at all: zero every scale so the
    // shader's per-layer `scale <= 0` test short-circuits before it samples.
    if (!matAlbedoTex) matTexScales.fill(0);
  }

  // 1×1×1 dummy array — a COMPLETE sampler2DArray target for both material
  // units whenever no pack is loaded. Same reasoning as ensureEnvDummy(): a
  // sampler pointing at an incomplete texture unit is undefined behaviour and
  // renders black on strict drivers (SwiftShader) even when the shader branch
  // that would sample it is never taken.
  // A COMPLETE compare-mode depth texture for unit 0 whenever the shadow system
  // is off. uShadowMap / uCarShadowMap / uLampShadowMap are sampler2DShadow
  // uniforms that default to unit 0, and present() leaves unit 0 holding the
  // LDR / scene COLOUR texture from the post chain — sampling a colour texture
  // through a compare sampler is undefined in GLES and a validation error on
  // Metal. The uShadowStr <= 0 early-out makes it rare; a driver does not care
  // how rare. 1×1 DEPTH_COMPONENT16, depth 1.0, so a stray tap reads "lit".
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

  // Per-frame material-map binding. Units 10/11 are free — the lit pass holds 0
  // (shadow), 5 (decal), 6, 7 (PCSS blocker), 8 (car shadow), 9 (lamp shadow).
  function bindMaterialMaps(mix) {
    ensureMatDummy();
    gl.activeTexture(gl.TEXTURE10);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, matAlbedoTex || matDummyArrTex);
    ufI(litU.uMatAlbedoTex, _litUf, "u.matAlbedo", 10);
    gl.activeTexture(gl.TEXTURE11);
    // No baked normal array → sample the NEUTRAL 128-grey dummy, not the albedo
    // array. A pack with albedo but no normal is documented-valid ("albedo alone
    // still helps"); falling back to matAlbedoTex here fed coloured albedo RGB to
    // applyMaterialTexNormal as a tangent-space normal, warping shading on every
    // grass/rock/wall layer instead of degrading cleanly.
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, matNormalTex || matDummyArrTex);
    ufI(litU.uMatNormalTex, _litUf, "u.matNormal", 11);
    gl.activeTexture(gl.TEXTURE0);      // leave unit 0 active + bound to the shadow map
    uf1(litU.uMatTexMix, _litUf, "matTexMix", matAlbedoTex ? mix : 0);
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
    // Frame-constant uniforms once per frame (same token pattern as
    // drawShadow/drawMark) — this runs once per car livery, ~22x/frame.
    if (_decalVPToken !== _frameToken) {
      _decalVPToken = _frameToken;
      gl.uniformMatrix4fv(decalU.uViewProj, false, frameViewProj);
      gl.uniform3fv(decalU.uSunDir, frameSunDir);
      gl.uniform3fv(decalU.uSunColor, frameDecalSun || frameSunColor);
      gl.uniform3fv(decalU.uAmbSky, frameAmbSky);
      gl.uniform3fv(decalU.uAmbGround, frameAmbGround);
    }
    gl.uniform1f(decalU.uGlow, (opts && opts.glow) || 0);
    // Bind the decal texture to a SPARE unit (5), NOT unit 0 — the lit pass keeps
    // the shadow map bound to TEXTURE0 for the whole frame, so clobbering unit 0
    // here would make every later lit draw (e.g. the player's wheels, drawn right
    // after these decals) sample this RGBA image as the shadow map → broken/black.
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
    // HDR cube (RGBA16F) when float buffers are renderable — so emissive light
    // sources (neon, lit windows, floodlights, the sun) keep their >1 brightness
    // in the reflection and bloom on the paint, like the wet road's SSR. Falls
    // back to 8-bit (LDR, lights clamp to white) where float isn't renderable.
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
    // 4× anisotropy on the env cube: the clearcoat mirror samples it along
    // grazing reflection rays where plain trilinear over-blurs.
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
    // COMPLETENESS, checked once on face 0 — every other FBO in post.js and
    // shadow.js is checked and this one never was. On a driver where the
    // RGBA16F cube face + DEPTH_COMPONENT16 combination is incomplete every
    // probe face is INVALID_FRAMEBUFFER_OPERATION, envFaceEnd still flips
    // envReady after six of them, and the paint mirrors a cube nothing ever
    // wrote (a dark car, and 120 boot getError drains of noise).
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X, envTex, 0);
    const _envStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X, null, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (_envStatus !== gl.FRAMEBUFFER_COMPLETE) {
      try { Log.warn("gfx", "GLX env probe framebuffer incomplete (0x" + _envStatus.toString(16) + ") — analytic reflections only"); } catch (_) { /* Log optional */ }
      gl.deleteFramebuffer(envFBO); gl.deleteRenderbuffer(envDepthRB); gl.deleteTexture(envTex);
      envFBO = null; envDepthRB = null; envTex = null;
      _envDisabled = true;
    }
  }
  // Render one probe face: caller re-issues the world draws (sky + track meshes,
  // no cars) between envFaceBegin and envFaceEnd. Reuses begin() with the face's
  // camera so every lighting uniform (sun, shadow map, ambient, fog, tune)
  // matches the main frame exactly. Returns the face's invViewProj for drawSky.
  function envFaceBegin(face, eye, frame) {
    if (!gl || ctxGone() || _envDisabled) return null;
    // RE-TEST AFTER envInit. The gate above runs BEFORE the lazy init, and
    // envInit's completeness check (added with it) can set _envDisabled and
    // null envFBO/envTex on the very first face. Falling through then armed
    // _envActive for the life of the tab against a null FBO: begin() binds the
    // DEFAULT framebuffer at a 64px viewport and clears it every frame,
    // PST.bindSceneTarget() is never reached, and the player gets a permanently
    // black canvas with a 64-pixel corner — strictly worse than the dark
    // reflection this check was written to fix. Returning null here makes
    // game.js skip the probe, which is what "disabled" has to mean.
    if (!envTex) { envInit(); if (_envDisabled || !envTex || !envFBO) return null; }
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
    // Keep probe VP / eye / cullDist on `frame` until envFaceEnd so
    // drawWorldMeshes → makeFrustumPlanes(frame.viewProj) culls propBatches
    // against the face frustum (chunked draws already read frameViewProj from
    // begin()). Restoring here made reflections miss off-camera props.
    // Re-entrancy: if a world draw threw mid-face (LoopHealth swallows it and
    // resumes) envFaceEnd never ran, and the caller's frame is still carrying
    // the probe VP. Restore it before saving, or the probe VP is saved as the
    // camera's and the main view is lost for good.
    if (_envFrame) {
      _envFrame.viewProj = _envSvVP; _envFrame.eye = _envSvEye; _envFrame.cullDist = _envSvCull;
      _envFrame = null;
    }
    _envFrame = frame;
    _envSvVP = frame.viewProj; _envSvEye = frame.eye; _envSvCull = frame.cullDist;
    frame.viewProj = _envVP; frame.eye = eye;
    // Env-probe radial cull (counted reach in docs/PERF-FINDINGS.md): the
    // probe inherits the MAIN camera's cullDist, which game.js sets to 0 —
    // no radial cull at all — below PerfGov tier 3. A 64x64 reflection
    // target would otherwise re-draw the city through the 900 m frustum.
    // Counted with tools/gfx/chunk-reach.cjs: 238.3 chunks / 1,256,344 indices
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
    // _envActive comes down FIRST, before any early return. It is the flag that
    // redirects begin() to the probe FBO; leaving it set because the texture
    // went away mid-cycle is the same brick as above, one frame later.
    _envActive = false;
    if (!gl || !envTex) return;
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

  // Open a GPU timer query for this frame (if timing is on and none is already
  // open). Called from begin(); the matching endQuery is in present().
  function _gpuTimerBegin() {
    if (!_gpuTimerOn || !_gpuTimerExt || _gpuQActive) return;
    const q = gl.createQuery();
    if (!q) return;
    gl.beginQuery(_gpuTimerExt.TIME_ELAPSED_EXT, q);
    _gpuQActive = q;
  }

  // Close the frame's query and harvest any completed result. GPU_DISJOINT means
  // the GPU was interrupted (e.g. power-state change) and every in-flight timing
  // is invalid — drop them. Keeps at most a few queries in flight.
  // NOTE the _gpuTimerOn gate. The extension is acquired unconditionally at
  // context creation, so without it the gl.getParameter below ran at the END OF
  // EVERY FRAME on every device that has EXT_disjoint_timer_query_webgl2 (i.e.
  // all of Chrome desktop + Android) for a feature that ships off. getParameter
  // with an uncached pname is a synchronous round trip to the GPU process — a
  // command-buffer flush plus blocking IPC — so this was a per-frame pipeline
  // stall, worst exactly when the GPU process is already backed up. _gpuTimerBegin
  // has always had this guard; this one did not.
  function _gpuTimerEnd() {
    if (!_gpuTimerExt) return;
    // Timing just switched off: close and drain what is still in flight, then
    // stop touching the GPU until it is switched back on.
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
    // 0..1 AMOUNT, not a flag: > 0 enables per-chunk lamp sets and sets how
    // strongly they light. Kept numeric all the way through — coercing to 1
    // here is what made it a toggle.
    framePerChunkLights = +frame.perChunkLights || 0;
    // The knob is NO LONGER a brightness multiplier. It used to dim every track
    // lamp to compensate for chunked scenery reading too bright — and the reason
    // it read too bright is that the per-chunk path was fed the RAW baked list,
    // with none of LAMP LEVEL / TEMPERATURE / FLICKER / WARM-UP / the twilight
    // ramp applied. setFrameLights now scales that set exactly like the culled
    // one, so the compensation is not needed and actively harmed: applied to the
    // GLOBAL set too, it meant a governor tier shed (which zeroes the knob)
    // stepped the whole night ~3.3x brighter and back. The knob keeps its real
    // jobs — enabling per-chunk sets and setting their cap via capFor.
    frameTailStart = frame.tailStart | 0;
    frameTailCount = frame.tailCount | 0;
    _frameToken++;   // invalidate per-frame uViewProj upload caches
    // Render the scene into the HDR offscreen target when post is enabled, else
    // straight to the default framebuffer. With MSAA the geometry goes into the
    // multisampled renderbuffer, resolved into sceneTex/sceneDepth at present().
    // An env-probe face (envFaceBegin) instead targets the probe cubemap FBO.
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
    // Same resync for the three states the setters above route. This is
    // what keeps a cached value from outliving the frame that set it — and it
    // runs unconditionally, so the cached and uncached paths start each frame
    // from identical GL state.
    resetDrawState();
    const fc = frame.fogColor;
    gl.clearColor(fc[0], fc[1], fc[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    useProg(litProg);
    gl.uniformMatrix4fv(litU.uViewProj, false, frame.viewProj);
    uf3(litU.uEye, _litUf, "eye", frame.eye);
    uf3(litU.uSunDir, _litUf, "sunDir", frame.sunDir);
    uf3(litU.uSunColor, _litUf, "sunColor", frame.sunColor);
    // Live tunables (LIGHTING TUNER / __apex.lightTune) ride in on frame.tune;
    // defaults here MUST mirror LightTune.TUNE_DEFS (js/lighting/knobs.js) so a missing tune object
    // (unit harnesses driving GLX directly) renders the shipped look.
    const T = frame.tune || null;
    const _ambM = T && T.ambientMul != null ? T.ambientMul : 1;
    if (_ambM !== 1) {
      const g = frame.ambientGround, s = frame.ambientSky;
      _ambScratchG[0] = g[0] * _ambM; _ambScratchG[1] = g[1] * _ambM; _ambScratchG[2] = g[2] * _ambM;
      _ambScratchS[0] = s[0] * _ambM; _ambScratchS[1] = s[1] * _ambM; _ambScratchS[2] = s[2] * _ambM;
      uf3(litU.uAmbGround, _litUf, "ambGround", _ambScratchG);
      uf3(litU.uAmbSky, _litUf, "ambSky", _ambScratchS);
      // The decal pass reads frameAmb* — point it at the SAME scaled ambient the
      // lit pass just uploaded. Decals used the raw frame colours, so moving the
      // AMBIENT slider re-lit the bodywork but not the sponsor marks on it.
      frameAmbSky = _ambScratchS; frameAmbGround = _ambScratchG;
    } else {
      uf3(litU.uAmbGround, _litUf, "ambGround", frame.ambientGround);
      uf3(litU.uAmbSky, _litUf, "ambSky", frame.ambientSky);
    }
    // Same for the KEY LIGHT slider on the decals' sun term (raw frameSunColor
    // stays untouched for the god-ray/flare passes, which are not keyMul-lit).
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
    // BAKED MATERIALS knob. Ships at 1.0 (mirrors TUNE_DEFS matTexMix def);
    // __apex.matTex(0) is the A/B off-switch back to pure procedural. A missing
    // pack still renders procedural — bindMaterialMaps forces uMatTexMix to 0
    // whenever no albedo array is loaded, whatever the slider says.
    bindMaterialMaps(T && T.matTexMix != null ? T.matTexMix : 1.0);
    uf3(litU.uFogColor, _litUf, "fogColor", frame.fogColor);
    // FOG DENSITY knob: scale the per-condition haze depth (multiplier, def 1).
    // Default a missing fogDensity to 0 (fog off), like every sibling scalar here
    // and both other backends — an omitted field is documented-valid and must not
    // upload `undefined * mul = NaN`, which blacks out the whole scene.
    uf1(litU.uFogDensity, _litUf, "fogDensity", (frame.fogDensity != null ? frame.fogDensity : 0) * (T && T.fogDensityMul != null ? T.fogDensityMul : 1));
    // uBlockerMap's UNIT IS ASSIGNED UNCONDITIONALLY, the bind is not. It is the
    // only `sampler2D` in LIT_FS and uShadowMap on unit 0 is a `sampler2DShadow`,
    // so leaving it at its default unit 0 puts two DIFFERENT sampler types on one
    // texture image unit — GLES 3.0 §2.11.7 makes that an INVALID_OPERATION at the
    // next draw, not a link error, so the whole lit pass would draw nothing and
    // the world would vanish under sky + post. Reachable: glx/shadow.js allocates
    // the blocker as R16F, which needs EXT_color_buffer_float, so a device without
    // it fails checkFramebufferStatus and leaves pcssEnabled false forever. The
    // neighbouring uLampShadowMap comment makes this argument correctly for the
    // SAME sampler type; the blocker was the one case it did not cover. Hoisted
    // ABOVE the SHD.enabled branch because its else-arm leaves BOTH samplers at
    // their default unit 0, which is the same collision by another route.
    ufI(litU.uBlockerMap, _litUf, "u.blocker", 7);
    if (SHD.enabled) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, SHD.mapTex);
      ufI(litU.uShadowMap, _litUf, "u.shadow", 0);
      if (SHD.pcssEnabled) {
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, SHD.blockerTex);
        gl.activeTexture(gl.TEXTURE0);
      }
      uf1(litU.uPcss, _litUf, "pcss", SHD.pcssEnabled ? 1.0 : 0.0);
      // The three light VPs change only on a shadow snap; every begin()
      // (main + probe faces) re-sent them. ufM4 copies, so the snap's in-place
      // rewrite of SHD.lightVP is still seen.
      ufM4(litU.uLightVP, _litUf, "lightVP", SHD.lightVP);
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
      // Clear-night moon shadows: floor the key-dim fade with the MOON SHADOWS
      // knob scaled by the clear-night factor (game.js frame.moonGate — bright
      // moon, low cloud, dry road, no fog; or, above 0.5, the knob itself
      // forcing the gate open regardless of weather). 0 = old fade-to-nothing
      // night.
      const _mSh = (T && T.moonShadow != null ? T.moonShadow : 0.25) * (frame.moonGate || 0);
      if (_mSh > _hf) _hf = _mSh;
      uf1(litU.uShadowStr, _litUf, "shadowStr", (T && T.shadowStr != null ? T.shadowStr : 1.15) * _hf);
      // SHADOW DISTANCE knob: box half-size, drives the receiver-distance fade.
      uf1(litU.uShadowRange, _litUf, "shadowRange", T && T.shadowRange != null ? T.shadowRange : 80.0);
      // Fade anchor: the UNSNAPPED forward-biased ground point the shadow box is
      // snapped around (game.js shadow pass). It glides continuously with the
      // camera, so the fade front never jumps on a box recentre.
      uf3(litU.uShadowCtr, _litUf, "shadowCtr", frame.shadowCtr || frame.eye || ZERO3);
      uf1(litU.uShadowTexel, _litUf, "shadowTexel", 1.0 / SHD.SIZE);
      // Dynamic car shadow map — unit 8, armed only on frames where game.js ran
      // the car caster pass (carShadowBegin). The texture is always bound while
      // enabled so the sampler2DShadow stays complete even when gated off.
      if (SHD.carEnabled) {
        gl.activeTexture(gl.TEXTURE8);
        gl.bindTexture(gl.TEXTURE_2D, SHD.carTex);
        gl.activeTexture(gl.TEXTURE0);
        ufI(litU.uCarShadowMap, _litUf, "u.carShadow", 8);
        ufM4(litU.uCarLightVP, _litUf, "carLightVP", SHD.carLightVP);
        uf1(litU.uCarShadowOn, _litUf, "carShadowOn", SHD.carArmed ? 1.0 : 0.0);
        uf1(litU.uCarBiasScale, _litUf, "carBiasScale", SHD.carBoxScale || 1.0);
      } else {
        uf1(litU.uCarShadowOn, _litUf, "carShadowOn", 0.0);
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
        ufI(litU.uLampShadowMap, _litUf, "u.lampShadow", 9);
        ufM4(litU.uLampShadowVP, _litUf, "lampLightVP", SHD.lampLightVP);
        uf1(litU.uLampShadowOn, _litUf, "lampShadowOn", SHD.lampArmed ? 1.0 : 0.0);
        ufI(litU.uLampShadowIdx, _litUf, "lampShadowIdx", SHD.lampIdx | 0);
      } else {
        uf1(litU.uLampShadowOn, _litUf, "lampShadowOn", 0.0);
      }
    } else {
      // Shadows off: unit 0 must still hold a compare-mode DEPTH texture for
      // the three sampler2DShadow uniforms that default there (see
      // ensureShadowDummy) — present() leaves the post chain's colour texture
      // on it otherwise.
      ensureShadowDummy();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, shadowDummyTex);
      ufI(litU.uShadowMap, _litUf, "u.shadow", 0);
      uf1(litU.uShadowStr, _litUf, "shadowStr", 0.0);
      uf1(litU.uCarShadowOn, _litUf, "carShadowOn", 0.0);
      uf1(litU.uLampShadowOn, _litUf, "lampShadowOn", 0.0);
    }
    uf3(litU.uSkyZenith,  _litUf, "skyZenith",  frame.skyZenith  || SKY_ZENITH_DEF);
    uf3(litU.uSkyHorizon, _litUf, "skyHorizon", frame.skyHorizon || SKY_HORIZON_DEF);
    // FOG HEIGHT FALLOFF knob (absolute; def 0.018 matches the shipped palette).
    uf1(litU.uFogHeight, _litUf, "fogHeight", T && T.fogHeight != null ? T.fogHeight : (frame.fogHeight != null ? frame.fogHeight : 0.0));
    // GROUND MIST knob: scale the per-condition mist amount (multiplier, def 1).
    uf1(litU.uGroundMist, _litUf, "groundMist", (frame.groundMist != null ? frame.groundMist : 0.0) * (T && T.mistDensity != null ? T.mistDensity : 1));
    uf1(litU.uLampFog, _litUf, "lampFog", frame.lampFog != null ? frame.lampFog : 0.0);
    gl.uniform1f(litU.uTime,        frame.time  != null ? frame.time  : 0.0);
    uf1(litU.uCloudCover, _litUf, "cloudCover", frame.cloud != null ? frame.cloud : 0.0);
    uf1(litU.uCloudSpeed, _litUf, "cloudSpeed", frame.cloudSpeed != null ? frame.cloudSpeed : 1.0);
    uf1(litU.uCloudShadowDim, _litUf, "cloudShadowDim", T && T.cloudShadowDim != null ? T.cloudShadowDim : 0.80);
    // CAR SUN GLINT / CAR SPARKLE / FOG SUN CORE knobs (defaults = shipped look).
    uf1(litU.uCarSunGlint, _litUf, "carSunGlint", T && T.carSunGlint != null ? T.carSunGlint : 12.0);
    uf1(litU.uCarSparkle,  _litUf, "carSparkle",  T && T.carSparkle  != null ? T.carSparkle  : 1.6);
    uf1(litU.uFogSunCore,  _litUf, "fogSunCore",  T && T.fogSunCore  != null ? T.fogSunCore  : 0.6);
    // LAMP NEAR CLAMP / WINDOW SUN FLASH / SKY RIM GLOW / AMBIENT CONTACT DARK /
    // LAMP WALL SPILL knobs (defaults = shipped look).
    uf1(litU.uLampNearClamp,  _litUf, "lampNearClamp",  T && T.lampNearClamp  != null ? T.lampNearClamp  : 4.0);
    uf1(litU.uWindowSunFlash, _litUf, "windowSunFlash", T && T.windowSunFlash != null ? T.windowSunFlash : 1.0);
    uf1(litU.uSkyRimGlow,     _litUf, "skyRimGlow",     T && T.skyRimGlow     != null ? T.skyRimGlow     : 1.0);
    uf1(litU.uAmbContactDark, _litUf, "ambContactDark", T && T.ambContactDark != null ? T.ambContactDark : 1.0);
    uf1(litU.uLampWallSpill,  _litUf, "lampWallSpill",  T && T.lampWallSpill  != null ? T.lampWallSpill  : 1.0);
    uf1(litU.uWetness, _litUf, "wetness", frame.wetness != null ? frame.wetness : 0.0);
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
    // uEnvStr stays 0 until the first full 6-face cycle (probe still black), and
    // frame.noEnv forces it off for probe-less views (the SETUP MENU preview)
    // even when a stale cube lingers from a prior race — so the menu car reads
    // matte (gentle analytic sheen) instead of mirroring last race's scene.
    // Fallback 0 (= probe OFF) is the SAFE side of the tier-gated TUNE_DEFS
    // carEnvCube default (0.3 desktop / 0.0 mobile) — a caller with no tune obj
    // gets no probe rather than the old 1.0 fallback's full-mirror surprise.
    uf1(litU.uEnvStr, _litUf, "envStr", (envTex && envReady && !_envActive && !frame.noEnv)
      ? (T && T.carEnvCube != null ? T.carEnvCube : 0.0) : 0.0);
    // Point lights (floodlights / street lights). frame.lights is a flat array
    // of at most MAX_LIGHTS (48) entries, already culled to the nearest set by
    // the caller. Uploaded once per frame; uNumLights=0 on day.
    {
      const L = frame.lights;
      // Flat stride-15: [x,y,z, r,g,b, rad, dirX,dirY,dirZ, cosInner, cosOuter,
      // bleed, volW, glareW]. volW is consumed by the godray pass only; glareW
      // (lens-glare halo weight) by drawGlow only.
      uploadLightSet(L, null, L ? (L.length / 15) | 0 : 0);
    }
    _matEmissive = _matAlpha = _matRough = _matMetal = _matSpec = _matDetail = _matCC = _matCP = _matSpark = -1;
  }

  // Upload a set of point lights into the lit program's MAX_LIGHTS uniform
  // arrays. Two callers: begin() sends this frame's globally-culled
  // frame.lights (idx = null, entries read in order), and GLXChunked sends a
  // PER-CHUNK subset via an index array into the track's full baked light list
  // (PER-CHUNK LAMPS knob). The per-chunk path is why this is factored out: the
  // shader still only ever sees <= MAX_LIGHTS, so the fragment loop is
  // untouched — only WHICH lamps are bound changes, per draw. That lifts
  // the cap for the SCENE as a whole (each chunk gets its own budget)
  // without costing a uniform slot or a per-fragment iteration.
  // L2/o2/n2 (optional): a SECOND source appended after the idx-selected ones —
  // the per-frame dynamic lights (car tail-lights), which appendCarTailLights
  // pushes onto frame.lights AFTER the static cull and therefore live outside
  // track._lights. Without this a per-chunk set would silently drop them and
  // scenery would stop catching tail-light spill the moment the knob went on.
  // Tail lights are reserved FIRST (there are at most 5, and a car beside you
  // matters more than the 32nd-nearest lamp), then static lamps fill what's left.
  function uploadLightSet(L, idx, n, L2, o2, n2) {
    const nTail = (L2 && n2 > 0) ? Math.min(n2 | 0, MAX_LIGHTS) : 0;
    const nStatic = L ? Math.max(0, Math.min(MAX_LIGHTS - nTail, n | 0)) : 0;
    const nL = nStatic + nTail;
    // MEASURED BEFORE WRITING (docs/PERF-FINDINGS.md §2e's rule): vegas night,
    // full field in a pack, 111 uploads a frame against 53.7 distinct VALUES —
    // 52 % redundant, and not the 1,0,1,0 alternation that made a cache
    // worthless at `setCull` and `uInstanced`. It is chunk lamp counts in
    // spatial order, so it runs: ...8,8,8,8... and a long tail of 0 where the
    // per-chunk path uploads a count and returns without touching the array.
    if (nL !== _luNL) { gl.uniform1i(litU.uNumLights, nL); _luNL = nL; }
    if (nL <= 0) return;
    const L4 = _luL;
    for (let i = 0; i < nL; i++) {
      const fromTail = i >= nStatic;
      const src = fromTail ? L2 : L;
      const o = fromTail ? (((o2 | 0) + (i - nStatic)) * 15)
                         : ((idx ? idx[i] : i) * 15);
      const i4 = i * 16;
      // NO PER-CHUNK DIMMER HERE, and do not reintroduce one. The knob was once
      // a brightness multiplier applied at this point; setFrameLights now scales
      // the baked set exactly like the culled one, so this had already been
      // reduced to a guaranteed identity (see the retirement note at the
      // _lampScale assignment site, removed with it). What survived the
      // retirement was the machinery: a per-lamp `inFrameTail` test — four
      // comparisons for every lamp of every chunk of every chunked mesh, five
      // times a frame — feeding a scale that was provably 1, and three
      // multiplies by it. The knob's real jobs are enabling per-chunk sets and
      // setting their cap via capFor; neither is a factor on rgb.
      L4[i4] = src[o]; L4[i4 + 1] = src[o + 1]; L4[i4 + 2] = src[o + 2]; L4[i4 + 3] = src[o + 6];
      L4[i4 + 4] = src[o + 3]; L4[i4 + 5] = src[o + 4]; L4[i4 + 6] = src[o + 5]; L4[i4 + 7] = src[o + 12];
      L4[i4 + 8] = src[o + 7]; L4[i4 + 9] = src[o + 8]; L4[i4 + 10] = src[o + 9]; L4[i4 + 11] = src[o + 10];
      L4[i4 + 12] = src[o + 11]; L4[i4 + 13] = 0; L4[i4 + 14] = 0; L4[i4 + 15] = 0;
    }
    gl.uniform4fv(litU["uLight[0]"], L4, 0, nL * 16);
  }

  // Shared lit-pass material setup — draw() below and GLXChunked.drawChunked
  // both route through this single helper (formerly duplicated in lockstep):
  // bind the lit program, upload the model matrix, and set the material
  // scalars through the redundancy cache. Returns the resolved alpha for the
  // caller's blend/depth-mask decisions.
  function litMaterial(modelMat, opts, instanced) {
    useProg(litProg);
    // litU.uModel is written ONLY here — decal/shadow/mark/depth each own a
    // separate program and therefore a separate location, so this cache cannot
    // be staled by them. docs/PERF-FINDINGS.md 2h.
    ufM4(litU.uModel, _litUf, "model", modelMat);
    // The instancing gate rides the redundancy cache: 54.8 uniform1f/frame for a
    // value that changes 3.1 times. docs/PERF-FINDINGS.md 2e. It is declared
    // here, for every lit draw, rather than bracketed 1/0 around each instanced
    // draw — that alternation is what a cache collapses none of.
    uf1(litU.uInstanced, _litUf, "instanced", instanced ? 1 : 0);
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

  // ---------- instanced draw (the TrackGraph.batches() consumer) ----------
  // One canonical mesh + a per-instance transform, instead of the same geometry
  // fused into the world N times. See js/track/scenery/graph.js and
  // docs/research/SCENE-GRAPH-PLAN.md; the producer is graph.batches().
  //
  // Layout: the mesh's own vertex VBO keeps attributes 0-4 with divisor 0, and a
  // SECOND buffer carries the instance columns at 5-8 (+ colour at 9) with
  // divisor 1. Nothing about the vertex format changes, so the same {pos,nrm,
  // col,idx,mat} geometry works in both paths.
  function createInstancedBatch(data, matrices, colors, opts) {
    const mesh = createMesh(data);
    // createMesh returns null on a lost/absent context (ctxGone) — every batch
    // consumer (drawInstanced/castShadowInstanced/freeInstancedBatch) already
    // null-guards, so fail closed here rather than deref null.vao. The old
    // unguarded read threw "reading 'vao'" on racy menu-scene warmup.
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

    // Optional spatial buckets for per-frame frustum culling. WebGL2 has NO
    // baseInstance, so an instanced draw always starts at instance 0 — a visible
    // subset cannot be expressed as an offset. The only way to draw part of a
    // batch is to PACK the visible instances to the front of the buffer and
    // re-upload, which is what cullInstances() does; these buckets are what keep
    // that repack proportional to what is on screen rather than to the whole
    // batch. Same 72 m grid the chunked meshes use, so the two agree about what
    // "nearby" means.
    if (opts && opts.cellSize > 0) {
      const cell = opts.cellSize;
      // Conservative per-instance reach: the model's own extent, scaled by the
      // largest scale any instance applies. Cheap and never under-estimates.
      let reach = opts.radius || 0;
      if (!reach) {
        // Largest |component| in the canonical mesh: the model sits at the origin
        // (TrackGraph guarantees it), so this is its radius in every direction.
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
    // A batch with no per-instance colour falls back to the context-wide generic
    // value for attribute 9, which init() pins at (1,1,1).
    return mesh;
  }

  // Repack the instances whose cell survives the frustum to the front of the GPU
  // buffer and record how many. Returns the visible count. A batch created
  // without cellSize has no cells and is left whole (always drawn in full).
  // Skips bufferSubData when the visible cell set (count + cell-index hash) is
  // unchanged from the previous cull — static prop batches often match.
  function cullInstances(batch, planes) {
    if (!batch || !batch.cells) return batch ? batch.instances : 0;
    // There is one GPU instance buffer, so only its resident pack can be a hit.
    // A two-frustum count cache returned the right N with the wrong transforms.
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
    // CELL-SET KEY (apex26.instCellCache, off by default; docs/PERF-FINDINGS 2c).
    // The pack is a deterministic function of the surviving cell set, so this
    // is a strictly stronger key than the frustum. Skips the copy loop and the
    // upload, not the AABB sweep.
    let cellKeyN = -1;
    if (_instCellCache) {
      const cs = batch.cells, cn = cs.length;
      let ks = batch._cellKeyScratch;
      if (!ks || ks.length < cn) ks = batch._cellKeyScratch = new Int32Array(cn);
      let k = 0;
      for (let ci = 0; ci < cn; ci++) if (CHK.aabbInFrustum(planes, cs[ci].mn, cs[ci].mx)) ks[k++] = ci;
      cellKeyN = k;
      const res = batch._cellKey;
      if (res && batch._cellKeyN === k) {
        let same = true;
        for (let i = 0; i < k; i++) if (res[i] !== ks[i]) { same = false; break; }
        // NOT writing _cullPlanes here is load-bearing: it must keep describing
        // whichever frustum physically wrote the buffer (canary-pinned).
        if (same) { batch.visible = batch._cullN; return batch._cullN; }
      }
    }
    const src = batch.srcMatrices, dst = batch.packMatrices;
    const sc = batch.srcColors, dc = batch.packColors;
    let n = 0;
    for (const c of batch.cells) {
      if (!CHK.aabbInFrustum(planes, c.mn, c.mx)) continue;
      for (const i of c.idx) {
        // Copy without Float32Array.subarray — that view was a per-instance alloc
        // on Vegas-scale batches (tens of thousands/frame).
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
    if (_instCellCache && cellKeyN >= 0) {
      // Record the cell set that produced the bytes now resident.
      let res = batch._cellKey;
      if (!res || res.length < cellKeyN) res = batch._cellKey = new Int32Array(batch.cells.length);
      res.set(batch._cellKeyScratch.subarray(0, cellKeyN));
      batch._cellKeyN = cellKeyN;
    }
    return n;
  }

  // Hand a batch a caller-packed instance set. cullInstances() is for a STATIC
  // batch narrowed by a frustum; this is for one whose transforms are new every
  // frame — DebrisWorld's four Rapier pools, where the bodies move and the only
  // question is how many are live (docs/PERF-FINDINGS.md 2h). The caller packs
  // to the front because WebGL2 has no baseInstance (see createInstancedBatch).
  //
  // CLEARING THE CULL SNAPSHOTS IS LOAD-BEARING, not tidiness. cullInstances
  // memoises on _cullPlanes (the frustum that physically wrote the resident
  // bytes) and _cellKeyN (the surviving cell set); a hit SKIPS the re-upload
  // entirely. Bytes written here were produced by no frustum at all, so leaving
  // either snapshot standing would let a later cullInstances hit its cache and
  // draw this pack as though it were that frustum's. Pinned by
  // tests/unit/gfx-backend-canary.test.mjs.
  function updateInstances(batch, matrices, n) {
    if (ctxGone() || !batch || !batch.ibo) return 0;
    const cap = batch.instances | 0;
    const v = Math.max(0, Math.min(cap, n | 0));
    batch.visible = v;
    batch._cullPlanes = null;
    batch._cellKeyN = -1;
    if (v > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.ibo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, matrices, 0, v * 16);
    }
    return v;
  }

  // OPAQUE-ONLY: a blended instanced draw would drop depth writes (below) but
  // would NOT mask alpha writes the way draw() does, so it would drag the SSR
  // car-paint tag stored in scene alpha. Every current caller (the TrackGraph
  // prop batches; tests/specs/instanced-draw.spec.js) passes alpha 1 — route
  // translucent work through draw() instead.
  function drawInstanced(batch, opts) {
    if (ctxGone() || !batch || !batch.instances) return;
    // IDENTITY model matrix: the transform lives entirely in the instance
    // columns. Passing anything else would be silently ignored by the shader and
    // mislead the next reader.
    const alpha = litMaterial(IDENT4, opts, 1);
    setDepthMask(alpha >= 1);
    setBlend(alpha < 1);
    bindVAO(batch.vao);
    const dbl = opts && opts.doubleSided;
    if (dbl) setCull(false);
    const n = batch.visible === undefined ? batch.instances : batch.visible;
    // The gate is declared by litMaterial above, NOT bracketed here: 1,0,1,0
    // alternates and a cache collapses none of it. Why, and why a zero-instance
    // batch claiming the gate is harmless: docs/PERF-FINDINGS.md 2e.
    if (n > 0) gl.drawElementsInstanced(gl.TRIANGLES, batch.count, batch.indexType, 0, n);
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
    // Scene alpha is the SSR car-paint tag (see LIT_FS outColor), written only
    // by OPAQUE draws — so ANY blended draw masks alpha writes automatically
    // (default blending blends the alpha channel too, dragging a stored 0.35
    // tag across the composite's 0.42-0.55 threshold). noAlphaWrite remains as
    // an explicit opt-out for opaque FX quads.
    const noAW = (opts && opts.noAlphaWrite) || alpha < 1;
    if (noAW) setAlphaWrite(false);
    // doubleSided: render back faces too (cull off) — for the wheels + car body,
    // whose single-winding tyre walls must show from every angle without any
    // coincident duplicate to z-fight.
    const dbl = opts && opts.doubleSided;
    if (dbl) setCull(false);
    // Depth bias for DECAL geometry (start line, road markings): nudge the
    // fragment's depth toward the camera instead of lifting the mesh in Y.
    // A geometric lift is resolution-dependent — it holds up close and
    // z-fights at distance, where depth precision collapses under a 0.3 m
    // near plane. polygonOffset scales with the local depth slope, so a
    // decal wins at every distance and grazing angle without moving it.
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
    if (_shadowVPToken !== _frameToken) {
      gl.uniformMatrix4fv(shadowU.uViewProj, false, frameViewProj);
      _shadowVPToken = _frameToken;
    }
    gl.uniformMatrix4fv(shadowU.uModel, false, modelMat);
    gl.uniform2f(shadowU.uSize, w, l);
    setBlend(true);
    setDepthMask(false);
    // Pull the flat quad toward the camera in depth so it can't z-fight the
    // coplanar road underneath (the "shadow flickering under the car").
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

  // Batched skid marks. `verts` is an interleaved Float32Array (pos3 + uv2 per
  // vertex, 6 verts/mark); `vertCount` verts are live. When `dirty`, re-upload
  // the buffer (marks change at most every few frames). One draw for the whole
  // trail — replaces up to 120 per-mark drawMark calls. Returns false if the
  // batch path is unavailable (caller falls back to per-mark drawMark).
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
    if (p > glowCap) {
      glowCap = p;
      gl.bufferData(gl.ARRAY_BUFFER, glowCap * 4, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, glowData, 0, p);
    // Additive, depth-tested (halos occlude behind walls) but no depth write.
    // Alpha is masked like drawParticles below: GLOW_FS writes a=1.0 under
    // ONE/ONE blending, and unmasked that saturated the scene alpha — the SSR
    // car-paint tag — wherever a halo overlapped bodywork, so the car's
    // reflections dropped out exactly on floodlit night circuits.
    setBlend(true);
    gl.blendFunc(gl.ONE, gl.ONE);
    setDepthMask(false);
    setCull(false);
    setAlphaWrite(false);
    gl.drawArrays(gl.TRIANGLES, 0, nDraw * 6);
    setAlphaWrite(true);
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
    // TrackGraph.batches() consumer — see js/track/scenery/graph.js.
    createInstancedBatch,
    cullInstances,
    updateInstances,
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
    // Per-chunk lamp support (the LampChunks bake). Capability read, never a
    // backend string match: absent on TLX (shared node-material uniforms —
    // per-chunk sets would mint a program per chunk, the pinProgram lesson).
    hasPerChunkLights: true,
    createChunkedMesh: (data, cellSize) => CHK.createChunkedMesh(data, cellSize),
    freeMesh,
    freeChunkedMesh: (mesh) => CHK.freeChunkedMesh(mesh),
    begin,
    draw,
    drawChunked: (mesh, modelMat, opts) => CHK.drawChunked(mesh, modelMat, opts),
    castShadowChunked: (mesh, model) => CHK.castShadowChunked(mesh, model),
    // Cull-test helpers, so a caller outside the draw path (the agent world
    // view's visible()) runs the same frustum maths the GPU path runs.
    makeFrustumPlanes: (viewProj, out) => CHK.makeFrustumPlanes(viewProj, out),
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
    present: (opts) => {
      if (ctxGone()) return;
      const r = PST.present(opts);
      if (_glDrainAlways || _drainLeft > 0) { _drainLeft--; drainGlErrors("present"); }
      return r;
    },
    gpuErrors: () => _glErrors,
    gpuFirstError: () => _glFirstError || null,
    // The bound backend's account of itself, one shape on all three (TLX
    // carries the three.js decision tree, WGX the rung). Read by the GOV
    // panel and __apex.diag().env so a phone screenshot names the API and
    // the first GPU error — the evidence a "see-through car" report lacked.
    backendState: () => ({
      api: "webgl2", isMobile: IS_MOBILE, mobileTier: MOBILE_TIER,
      gpuErrors: _glErrors, gpuFirstError: _glFirstError || null,
      ctxLost: _ctxLost, packLive: !!matAlbedoTex,
    }),
    envFaceBegin,
    envFaceEnd,
    envProbeReady() { return envReady; },
    // New track/session: the cube still holds the OLD circuit — hold the
    // analytic fallback until a fresh 6-face cycle has re-rendered the world.
    // A track switch re-arms the boot-time getError drain: the first 120
    // presents were spent in the SETUP preview, so the first night lamp set /
    // first instanced draw on a new circuit went uncounted (gpuErrors() is a
    // pure read).
    envProbeReset() { envFacesMask = 0; envReady = false; _drainLeft = DRAIN_PRESENTS; },
    shadowBegin: (lightVP) => SHD.shadowBegin(lightVP),
    castShadow: (mesh, model) => SHD.castShadow(mesh, model),
    castShadowInstanced: (batch, count) => SHD.castShadowInstanced(batch, count),
    shadowEnd: () => SHD.shadowEnd(),
    // Active light VP for shadow-caster cull (lamp frustum while lamp pass is
    // open, else the sun ortho). game.js cullInstances before castShadowInstanced.
    get shadowCullVP() { return SHD ? (SHD.castCullVP || SHD.lightVP) : null; },
    carShadowBegin: (lightVP, boxScale) => SHD.carShadowBegin(lightVP, boxScale),
    carShadowEnd: () => SHD.carShadowEnd(),
    lampShadowBegin: (lightVP, lightIdx) => SHD.lampShadowBegin(lightVP, lightIdx),
    // "Skipped for cadence, map still valid" — see shadow.js §KEEP.
    carShadowKeep: () => SHD.carShadowKeep(),
    lampShadowKeep: (lightIdx) => SHD.lampShadowKeep(lightIdx),
    lampShadowEnd: () => SHD.lampShadowEnd(),
    get width() { return width; },
    get height() { return height; },
    get aspect() { return aspect; },
    hdrMode: () => PST.hdrOk(),
    // Debug introspection for the dynamic car shadow map (used by tests/tools).
    // `armed` is the frame-live gate the LIT uniform reads; `arms` is a lifetime
    // counter that stays true straight through a strobe, which is exactly why the
    // 30 Hz car strobe and the vanished lamp shadow were invisible to every test.
    carShadowState: () => ({ enabled: SHD.carEnabled, arms: SHD.carArms, armed: SHD.carArmed }),
    // Same for the nearest-floodlight spot shadow map (idx = frame.lights slot).
    lampShadowState: () => ({ enabled: SHD.lampEnabled, arms: SHD.lampArms, idx: SHD.lampIdx, armed: SHD.lampArmed }),
    msaa: () => PST.msaa(),
    pcss: () => SHD.pcssEnabled,
    setRenderScale, getRenderScale,
    // GPU frame timer. gpuTimer(true|false) toggles timing (returns whether it's
    // supported + on); gpuTimer() reads state. gpuMs() returns the most recent
    // GPU frame time in ms, or -1 if unsupported / no result yet.
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
