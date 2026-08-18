/* Apex 26 — TLX: the three.js/TSL renderer backend (migration milestone 1).
 *
 * Third backend behind the js/render/gfx.js seam (GLX = WebGL2 default,
 * WGX = frozen hand-written WebGPU, TLX = three.js r185.1 with WebGPURenderer
 * and automatic WebGL2 fallback). Opt-in via localStorage
 * apex26.gfxBackend = "three"; installed by game.js's descriptor-copy onto
 * the GLX object so every direct GLX.* call site and test monkey-patch keeps
 * working (object identity is the compatibility contract).
 *
 * ARCHITECTURE (see spike/ADOPTION-PLAN.md + the milestone plan):
 * - This file and its tlx-…/tsl-… siblings are classic IIFE scripts like the
 *   rest of the codebase. The ONLY ES-module content is the vendored three
 *   build in vendor/three-0.185.1/, reached through the inline importmap in
 *   index.html by a dynamic import() inside TLX.create() — so GLX users never
 *   fetch a byte of it and a failed import falls back to GLX via Gfx.create's
 *   never-throw null contract.
 * - tsl-….js files publish FACTORY functions on the TLXShaders global
 *   ((THREE, TSL, ctx) => nodes) and must NEVER touch THREE at script eval —
 *   three does not exist until create() runs.
 *
 * STANDING RULES (learned in the spike, see spike/README.md):
 * - Every shared varying-derived TSL node gets an unconditional Fn-body
 *   .toVar() anchor before any conditional use (TSL emits cached property
 *   chains at FIRST USE; a first use inside If/ElseIf strands the assignments
 *   in that branch and every out-of-branch consumer silently reads garbage).
 * - THREE.ColorManagement.enabled = false and outputColorSpace =
 *   LinearSRGBColorSpace; NO sRGB encode in any pass — the whole game look,
 *   the LightPresets and every pixel baseline are calibrated without one
 *   (js/render/shaders/chunks.js).
 * - Defaults for every frame.tune / present(opts.tune) knob MUST mirror
 *   LightTune.TUNE_DEFS, same as GLX (js/render/gfx.js contract note).
 *
 * M1 STATUS: renderer lifecycle is real (dynamic import, WebGPURenderer with
 * WebGL2 fallback, resize/renderScale, Color-clear begin/present — skyZenith
 * when the frame has one, else fogColor for the no-track menu path at
 * js/game.js); every other contract member is
 * present as a SAFE no-op so game.js can issue the full frame protocol without
 * crashing. M2+ replace the no-ops subsystem by subsystem.
 *
 * M3 STATUS: the TSL lit core is live — TLXShaders.chunks + TLXShaders.lit
 * (tsl-chunks.js / tsl-lit.js) supply the full lit fragment (15 procedural
 * materials, car ids 20-27, FLAG wave, sun+hemi+32-lamp lighting, fog stack,
 * wetness, cloud shadows). GLX's per-draw material scalars land through a
 * MATERIAL CACHE: three can't read per-object uniforms off one shared
 * material, so each distinct opts signature (9 scalars + flags, the game's
 * ~20 hoisted opts objects) gets its own material variant whose scalars are
 * uniform nodes — every variant emits identical program text, so the GL
 * program is compiled once. Cap 64 entries, oldest evicted (a continuously
 * animated scalar, e.g. dusk floodEmit, would otherwise mint variants per
 * frame — revisit in M8 if that path shows up hot).
 * Debug: __tlx.shader(idx) dumps generated GLSL/WGSL; ?viz=mat|normal|lamp
 * (or localStorage apex26.tlxViz) paints bisect views.
 *
 * M4 STATUS: the three-map shadow subsystem is live (tlx-shadow.js,
 * TLXShaders.shadowSys): static sun map (2048²/1024² mobile/512² software-GL,
 * snap-cached by game.js), per-frame car map (1024² desktop / 256² software-GL)
 * and nearest-floodlight spot map (512² / 256² software-GL), sampled in tsl-lit
 * via hardware-compare depth taps.
 * Armed flags clear in present() like GLX's post present. PCSS blocker map
 * is live on the WebGPU backend (sampler-free textureLoad downsample,
 * tlx-shadow.js); the WebGL2 fallback keeps the fixed-R look and pcss()
 * reports the live state.
 *
 * M5 STATUS: the procedural sky is live (tsl-sky.js, TLXShaders.sky — the
 * full SKY_FS port: gradient/golden hour, clouds, sun corona+disc, stars,
 * moon, city glow, lightning, dither). Delivered as scene.backgroundNode:
 * three renders it on its internal camera-following background mesh (depth
 * off, drawn first, z pinned to the far plane — GLX's exact draw order) and
 * the node reconstructs the per-pixel view ray from frameSky.invViewProj
 * (screenUV -> NDC -> both z planes), identical to SKY_VS. begin() clears
 * backgroundNode each frame; drawSky() re-arms it — so the no-track/menu
 * path keeps the flat Color clear (skyZenith when the frame has one, else
 * fogColor). A missed TSL sky (software-GL compile miss, HDR-target skip)
 * must not fall through to dusk fog (~beige [0.68,0.64,0.54]) or the whole
 * frame reads as a washed void. The env-probe double-call (M9) just
 * overwrites uniforms (last drawSky before render wins). Post chain is
 * live (M8, tlx-post.js).
 *
 * M6 STATUS: the FX draw paths are live (tsl-fx.js, TLXShaders.fx): blob
 * shadows + per-mark skid stamps (shared unit quad, per-draw w/l baked into
 * the record's matrix), the one-draw skid batch, additive lamp glare halos
 * (built from frame.lights stride-15 records with GLX's near-field fade +
 * colour normalisation), the two-group particle batches, and the textured
 * car decals (material cached per texture+glow). Each is a draw-list record
 * like the world draws; every FX material is transparent, so three renders
 * them in its transparent pass AFTER all opaques (strictly safer than GLX's
 * inline order — FX never write depth, so a later opaque would stomp them),
 * and present() stamps renderOrder = submission index on every record so
 * the callers' relative FX order (shadows -> decals -> glow -> skids ->
 * particles) survives three's z-sort. GLX's colorMask-alpha-off on
 * particles/decals maps to blendSrcAlpha=Zero/blendDstAlpha=One (three has
 * only a boolean Material.colorWrite — see the tsl-fx.js header).
 *
 * M7 STATUS: the chunked-mesh path is live (tlx-chunked.js,
 * TLXShaders.chunked): createChunkedMesh bins the city/props triangles into
 * 72 m XZ cells (GLXChunked port — shared attribute set, one index buffer +
 * AABB per cell, staged release of the multi-million-element source arrays),
 * drawChunked records the WHOLE chunked mesh and present() culls it against
 * begin()'s viewProj copy + frame.cullDist when the camera is final — every
 * visible chunk becomes one pooled mesh stamping the record's renderOrder
 * (the M6 LOAD-BEARING rule holds: FX/glass interleaving survives).
 * castShadowChunked culls against the shadow system's castCullVP (lamp cone)
 * or the sun lightVP, radial cull OFF — an off-camera building still casts
 * into view. Probe: __tlx.chunkState() = {on, total, visible} from the last
 * presented frame.
 *
 * M8 STATUS: the post-processing chain is live (tsl-post.js shaders +
 * tlx-post.js orchestration): present() renders the world into a full-res
 * HDR target (+ sampleable depth) and resolves through SSAO (+ bilateral
 * upsample in the composite), the world-space godray march (sampling the M4
 * sun/lamp shadow maps — the lamp's armed flag is read by the chain BEFORE
 * clearArmed()), the bright-pass + 13/9-tap mip-chain bloom, the full
 * 58-uniform COMPOSITE (parameterised Narkowicz ACES — never three's
 * tone-mapping —, colour grade, wet-road + car-paint SSR reading the alpha
 * tag, heat haze, lens dirt/flare, vignette, dither/grain) and FXAA. The lit
 * core now writes the SSR car tag into alpha (tsl-lit ctx.ssrTag) and
 * noAlphaWrite/translucent draws preserve dst alpha through the blend stage
 * (Zero/One alpha factors — the GLX colorMask discipline). hdrMode() is true
 * when the chain is up on a float target; every block bails per-frame on a
 * probe-less path (setup preview: no proj/invProj -> no SSAO/SSR/shafts) and
 * allocates nothing until first enabled. Debug: ?viz=ssao|bloom|shafts|
 * composite-off bisect views + __tlx.postState(). MSAA stays off (FXAA
 * carries AA — the GLX mobile-tier recipe; see tlx-post.js header).
 *
 * MOBILE (since every device may select every renderer — docs/ARCHITECTURE.md):
 * - A PHONE DEFAULTS TO three's WebGL2 BACKEND, desktop keeps auto-pick. iOS
 *   26+ ships navigator.gpu, so "three falls back by itself" is false exactly
 *   where it is needed; the full reasoning is at the forceWebGL pin in
 *   create(). apex26.tlxForceGL overrides in both directions ("1"/"0").
 * - Context/device loss is RECOVERED here (renderer.onDeviceLost +
 *   webglcontextrestored), because three's default handler leaves a silently
 *   dead canvas and GLX's recovery lives in a GLX.init() this path never runs.
 * - Every discretionary per-frame GPU pass keys on the DEVICE (isMobile), not
 *   the memory tier (mobileTier) — the js/render/glx/shadow.js + js/game/perf.js
 *   rule. See tlx-shadow.js.
 */
"use strict";

const TLX = (function () {
  let _lastFailure = null;
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
      // Capture the mobile-tier decision from GLX BEFORE game.js's
      // descriptor-copy overwrites GLX's own values with ours.
      // js/render/glx.js stays the single source of truth (lighting.js reads it
      // at script-eval time, long before any backend exists).
      const isMobile = (typeof GLX !== "undefined" && !!GLX.isMobile);
      const mobileTier = (typeof GLX !== "undefined" && !!GLX.mobileTier);

      // The ES-module island: resolved through the inline importmap in
      // index.html. Failure (old browser, missing vendor) -> null -> GLX.
      const THREE = await import("three/webgpu");
      const TSL = await import("three/tsl");

      // Calibration invariant: the game's look is authored with NO sRGB
      // encode anywhere (js/render/shaders/chunks.js).
      THREE.ColorManagement.enabled = false;

      // ── WHICH three BACKEND: apex26.tlxForceGL "1" = pin WebGL2, "0" = allow
      // WebGPU, UNSET = the phone/desktop split below. ─────────────────────────
      //
      // PHONES DEFAULT TO WebGL2, and that default is the point of this block.
      // iOS 26+ Safari ships navigator.gpu, so on an iPhone three picks its
      // WebGPU backend — and WebKit's WebGPU is documented-unstable through
      // 26.x (black frames, crashes, throughput below its own WebGL2; still
      // being patched in the 27 beta). three's automatic fallback does NOT
      // cover that: getFallback fires only when WebGPU is ABSENT, never when it
      // is present and broken, so "three falls back by itself" is true for an
      // old Android and false for exactly the device this shipped for.
      // The WebGL2 half is also the better-tested half of TLX — every milestone
      // was developed and CI-gated through this same pin, and tsl-lit.js's
      // STANDING RULE (the toVar anchors) was measured against GLSL codegen,
      // not WGSL. Desktop keeps auto-pick: Chrome/Edge WebGPU is where the
      // backend wins, and a desktop that renders garbage is one tap from the
      // RENDERER button, which a phone under a jetsam kill is not.
      // "1" is still the CI/SwiftShader repro pin the specs set
      // (tests/specs/tlx-probes.spec.js) and behaves exactly as before; "0" is
      // the escape hatch for deliberately exercising WebGPU on a real phone.
      const _glPin = (function () {
        try { return localStorage.getItem("apex26.tlxForceGL"); } catch (_) { return null; }
      })();
      // Unset pin: WebKit (Safari Mac + every iOS browser) → WebGL2. three's
      // getFallback fires only when navigator.gpu is ABSENT; Safari 26 exposes
      // it (user-enabled) and then WebGPURenderer paints black / throws.
      // Chromium desktop keeps auto-pick. `apex26.tlxForceGL` "1"/"0" overrides.
      const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
      const isWebKit = /CriOS|FxiOS|EdgiOS/.test(ua) ||
        (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua));
      const forceWebGL = _glPin === "1" ? true : _glPin === "0" ? false : !!(isMobile || isWebKit);

      // ── OPAQUE CANVAS (js/render/glx.js: `alpha: false`) ────────────────────
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
      if (forceWebGL) {
        try {
          ownGL = canvas.getContext("webgl2", {
            antialias: !isMobile,        // must agree with the renderer's own antialias
            alpha: false,
            depth: true,
            stencil: false,
            powerPreference: "high-performance",
          });
        } catch (_) { ownGL = null; }    // null -> three makes its own, as before
      }
      const renderer = new THREE.WebGPURenderer({
        canvas,
        alpha: false,
        ...(ownGL ? { context: ownGL } : {}),
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
        antialias: !isMobile,
        forceWebGL,
      });
      renderer.setPixelRatio(1);            // we manage DPR/renderScale ourselves
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;   // tone map lives in the post chain (M8)
      await renderer.init();
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
      // SwiftShader / llvmpipe / WARP: the WebGL2 context already exists
      // after init() (three claimed the canvas). Used to shrink shadow maps
      // — see tlx-shadow.js. Real GPUs keep the authored 2048/1024/512.
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
      const softwareGL = detectSoftwareGL();
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
          // 1.2 s: long enough for a real "restored" event to win the race
          // below, short enough that the player reads it as a hitch.
          if (n <= 2) setTimeout(function () { try { location.reload(); } catch (_) { /* no location (harness/worker): the latches above still took effect for the next real boot */ } }, 1200);
          else {
            // Third loss in one tab. GLX's identical 2-cap ends in a frozen
            // frame because GLX has nothing beneath it — TLX DOES: surrender
            // the tab to WebGL2 (the WGX device-lost idiom) and record why,
            // instead of freezing on the last frame with the label lying.
            try { localStorage.setItem("apex26.gfxTlxFail", "context lost x" + n + " — tab fell back to WebGL2"); } catch (_) { /* blocked storage: the label still flips via gfxBound */ }
            try { sessionStorage.setItem("apex26.gfxBound", "webgl2"); } catch (_) { /* label keeps the pick */ }
            sessionStorage.setItem("apex26.gfxClaimFail", "1");
            setTimeout(function () { try { location.reload(); } catch (_) { /* harness */ } }, 1200);
          }
        } catch (_) { /* no sessionStorage -> skip the auto-recovery rather than loop uncounted */ }
      };
      // three does NOT route "restored" anywhere (it only listens for the loss),
      // so the immediate-reload half of GLX's pair has to be registered here.
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

      // The seam is immediate-mode (draw(mesh, model, opts) between begin and
      // present) while three is retained-mode. Bridge: draw() appends a
      // (geometry, matrix) record; present() materialises records into a
      // pooled set of THREE.Mesh objects IN SUBMISSION ORDER (GLX semantics:
      // caller order is draw order) and renders once. TrackGraph.batches()
      // go through createInstancedBatch → THREE.InstancedMesh (one draw call
      // per batch, frustum-repacked by cullInstances).
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0.04, 0.04, 0.06);
      // Pooled meshes write matrixWorld themselves in acquireMesh (the scene
      // root is identity, so world = local). Auto-update would walk the whole
      // graph on each renderer.render() (shadow primes + env faces + present)
      // for no result — and a missed write leaves cars at the origin.
      scene.matrixAutoUpdate = false;
      scene.matrixWorldAutoUpdate = false;
      const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 4000);
      camera.matrixAutoUpdate = false;

      // ── Expose the three objects for the Three.js DevTools extension ────────
      // The extension discovers a scene by scanning globals; without these its
      // panel is simply empty and you cannot tell "nothing exposed" from
      // "backend not running". Publishing them also enables the standard
      // console workflow (scene.children, camera.position.set(...),
      // new THREE.BoxHelper(obj)) and, on this backend specifically, is the
      // only practical way to inspect the TSL material graph.
      //
      // Debug-only: nothing in the game reads these back, so they can be
      // deleted at any time. THREE itself is published too because every helper
      // (AxesHelper/BoxHelper/CameraHelper) needs the constructor, and the
      // module is loaded through a dynamic import that the console cannot reach.
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
      const rawUnlitMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
      rawUnlitMat.side = THREE.FrontSide;
      // 0 = lit/post, 1 = TSL unlit, 2 = classic (no TSL). Latched on the
      // first present() throw so later frames do not recompile the dead graph.
      let _drawMatMode = 0;

      // Debug viz mode (?viz=… or localStorage apex26.tlxViz), read BEFORE
      // the factories: lit viz modes replace the scene material, post viz
      // modes (M8) route through the chain's bisect blit instead.
      const vizMode = (function () {
        try {
          return new URL(location.href).searchParams.get("viz")
            || localStorage.getItem("apex26.tlxViz") || null;
        } catch (_) { return null; }
      })();
      const LIT_VIZ = ["mat", "normal", "lamp"];

      // ── M4: the three-map shadow subsystem (tlx-shadow.js factory) ───────
      // Created BEFORE the lit core: tsl-lit builds its shadow sampling
      // around the subsystem's depth textures at factory time. Guarded like
      // the lit factory — missing/broken keeps the no-op shadow members and
      // the lit core simply compiles without shadow taps.
      let shadowSys = null;
      try {
        if (window.TLXShaders && TLXShaders.shadowSys) {
          shadowSys = TLXShaders.shadowSys(THREE, TSL, { renderer, mobileTier, isMobile, softwareGL });
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

      // ── M8: the post chain (tsl-post.js + tlx-post.js factories) ─────────
      // Created BEFORE the lit core: lit bakes the SSR alpha-tag write only
      // when an offscreen HDR target exists to carry it (ctx.ssrTag).
      // Guarded: missing/broken keeps direct-to-canvas rendering (M7 look).
      let post = null;
      try {
        if (window.TLXShaders && TLXShaders.postChain && TLXShaders.post && chunks) {
          post = TLXShaders.postChain(THREE, TSL,
            { renderer, isMobile, chunks, shadow: shadowSys, viz: vizMode });
          if (post && !post.enabled()) post = null;
          // Phone + no renderable float target: ACES/FXAA on 8-bit is the
          // pale-ground look. Direct-to-canvas (M7) is the working picture.
          if (post && isMobile && !post.hdrOk()) post = null;
        }
      } catch (e) {
        try { Log.warn("gfx", "TLX: post factory failed, direct to canvas —", e); } catch (_) {}
        post = null;
      }

      // ── M9: the live environment probe cube target ───────────────────────
      // A 64px cubemap rendered around the player car (one face per ~2 frames,
      // driven by game.js's envFaceBegin/End), sky+world only. The car-paint
      // clearcoat samples it for real reflections of the surroundings — GLX's
      // envInit()/envFaceBegin/envFaceEnd port (those three functions in glx.js). Built BEFORE
      // the lit core so tsl-lit can bind ctx.envCube at factory time; starts
      // black (rendered nothing yet) and uEnvStr gates it to 0 until the first
      // full 6-face cycle completes. Type mirrors GLX: HDR (half-float) when
      // the post chain reports a renderable float target, else 8-bit — same
      // decision GLX makes via PST.hdrOk(). Guarded: a failure leaves envRT
      // null and every env member a safe no-op (the pre-M9 analytic look).
      // NO sRGB anywhere — NoColorSpace on the cube, the calibration invariant.
      const ENV_SIZE = 64;
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
        // A COMPLETE black cube bound whenever the live probe must NOT be
        // sampled: while rendering INTO envRT (feedback-loop guard) and before
        // the first full capture. Cleared black once so it reads as no-mirror.
        envDummy = new THREE.CubeRenderTarget(1, envOpts);
        envDummy.texture.colorSpace = THREE.NoColorSpace;
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
        // Mid-grey albedo (the shader's ×2.0 makes it a no-op) and a flat
        // tangent normal (0.5, 0.5) — a placeholder that changes nothing even
        // if it were sampled with the knob up before a pack lands.
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

      // ── M5: the procedural sky (tsl-sky.js factory) ──────────────────────
      // Guarded like the others: missing/broken keeps drawSky a no-op and the
      // flat scene.background clear (the M4 look). Shares ctx.chunks for
      // ignoise; the sky-family hash/vnoise/fbm live inside tsl-sky.js.
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

      // ── M6: the FX materials (tsl-fx.js factory) ─────────────────────────
      // Guarded like the others: missing/broken keeps every FX member a safe
      // no-op (drawSkidBatch still returns true — the per-mark fallback is
      // fx-backed too, so falling back would only spam dead records).
      let fx = null;
      try {
        if (window.TLXShaders && TLXShaders.fx) {
          fx = TLXShaders.fx(THREE, TSL, { chunks });
        }
      } catch (e) {
        try { Log.warn("gfx", "TLX: fx factory failed, FX paths off —", e); } catch (_) {}
        fx = null;
      }

      // ── M7: the chunked-mesh subsystem (tlx-chunked.js factory) ──────────
      // Guarded like the others: missing/broken keeps the M2 single-geometry
      // fallback (one un-culled draw — correct, just slower on street props).
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

      // ── material cache: GLX per-draw opts -> material variant ────────────
      // (see the M3 STATUS note in the header for why a cache, not per-draw
      // uniforms). Key = the 9 material scalars + render-state flags.
      const defaultMat = lit ? lit.makeMaterial({}) : null;
      const defaultMatChunked = lit ? lit.makeMaterial({ chunked: true }) : null;
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
      function fallbackMat() { return _drawMatMode >= 2 ? rawUnlitMat : unlitMat; }
      function materialFor(opts, chunked) {
        if (_drawMatMode || !lit) return fallbackMat();
        if (vizMat) return vizMat;
        if (!opts) return chunked ? defaultMatChunked : defaultMat;
        const o = opts;
        // emissive is the one scalar callers ANIMATE (dusk floodEmit ramps it
        // every frame): raw in the key it mints a variant per step of the
        // ramp, and on r185.1 every cache eviction still leaks bindings for shared
        // textures (three #33952, fixed only in r186). Quantised to 1/32 the
        // full ramp costs ≤33 variants — under the cap, so no evictions —
        // and the ≤0.03 emissive delta is invisible.
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
          (chunked ? "|ch" : "");
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
            // this frame; destroy() disposes the whole cache on teardown.
            for (const [k, v] of matCache) {
              if (v && v.__tlxFrame === _matFrame) continue;
              matCache.delete(k);
              break;
            }
          }
          m = lit.makeMaterial(chunked ? Object.assign({ chunked: true }, o) : o);
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
      const _instColor = new THREE.Color();
      const _instAlive = new Set();   // InstancedMesh objects shown this frame
      const _instRegistry = [];       // all live InstancedMeshes (hide undrawn)

      function _writeInstanceMatrices(imesh, matrices, colors, n) {
        for (let i = 0; i < n; i++) {
          _instMat.fromArray(matrices, i * 16);
          imesh.setMatrixAt(i, _instMat);
          if (colors && colors.length && imesh.setColorAt) {
            _instColor.setRGB(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
            imesh.setColorAt(i, _instColor);
          }
        }
        imesh.instanceMatrix.needsUpdate = true;
        if (imesh.instanceColor) imesh.instanceColor.needsUpdate = true;
        imesh.count = n;
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
        // Always allocate instanceColor to the instance cap. three's WebGPU
        // backend still binds a 12-byte (1-instance) dummy at slot 5 / stride
        // 12 when instanceColor is missing; DrawIndexed(..., count>1) then
        // fails validation and the Lavapipe canvas stays black. WebGL2 ignored
        // the dummy. Fill white when the batch has no per-instance colours.
        imesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
        imesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        if (!(colors && colors.length)) {
          const ca = imesh.instanceColor.array;
          for (let i = 0; i < ca.length; i++) ca[i] = 1;
        }
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

      function cullInstances(batch, planes) {
        if (!batch || !batch.cells) return batch ? batch.instances : 0;
        let sig = 0;
        for (let pi = 0; pi < 6; pi++) {
          const p = planes[pi];
          sig = (Math.imul(sig, 31) + (p[0] * 1024 | 0) + (p[3] * 64 | 0)) | 0;
        }
        if (sig === batch._cullSig0) { batch.visible = batch._cullN0; return batch._cullN0; }
        if (sig === batch._cullSig1) { batch.visible = batch._cullN1; return batch._cullN1; }
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
        if (n && batch.imesh) _writeInstanceMatrices(batch.imesh, dst, dc, n);
        batch._cullSig1 = batch._cullSig0; batch._cullN1 = batch._cullN0;
        batch._cullSig0 = sig; batch._cullN0 = n;
        return n;
      }

      function drawInstanced(batch, opts) {
        if (!batch || !batch.imesh || !batch.instances) return;
        const n = batch.visible === undefined ? batch.instances : batch.visible;
        if (n <= 0) return;
        drawList.push({ instanced: batch, mat: materialFor(opts, false) });
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

      function castShadowInstanced(batch) {
        if (shadowSys && shadowSys.castInstanced) shadowSys.castInstanced(batch);
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
      // Two scratch matrices for begin()'s view reconstruction. BOTH are
      // hoisted: multiplyMatrices reads its operands before writing, so the
      // second cannot be _tmpMat4 — and it used to be a `new THREE.Matrix4()`
      // per frame, the only per-frame allocation left in this file. 60 Hz of
      // garbage buys nothing on desktop and buys a GC hitch on a phone.
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
      // Dynamic interleaved vertex streams (skid batch / glow / particles):
      // ONE InterleavedBuffer each — the GLX VBO layouts verbatim, with the
      // billboard center riding in "position" so three derives the draw
      // count naturally. ensureStream grows (recreates) on demand; true =
      // freshly (re)created, so callers re-upload even when not dirty.
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
      // Skid trail: [px,py,pz,u,v] stride 5, 6 verts/mark (game.js MAX_SKID
      // 120 marks). Glow: [cornerX,cornerY, cx,cy,cz, r,g,b, radius] stride 9
      // (32 lamps preallocated — the frame.lights cull cap). Particles:
      // [corner2, center3, rgb3, size, alpha] stride 10 (pool cap 256), one
      // slot per blend group (particles.js issues one call per group/frame).
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
      // ── M7 chunked-cull frame state ──────────────────────────────────────
      // begin() copies frame.viewProj here (game.js may swap the frame's own
      // array between begin and present — the env-probe path does on GLX);
      // present() culls chunked records against THIS frustum, when the
      // frame's camera is final.
      const _frameVP = new Float32Array(16);
      let frameCullDist = 0;        // frame.cullDist — the radial draw cap (0 = off)
      // ── M8: frame state the post chain consumes at present() (the GLX
      // frameInvProj/frameInvVP/frameSunVS/… latch — js/render/glx.js). All
      // POINTERS into the game's stable per-frame arrays; nulled every
      // begin() so a probe-less path (setup preview, menus) self-disables
      // SSAO/SSR/godray rather than reconstructing with stale matrices. ─────
      const _postF = {
        proj: null, invProj: null, invVP: null, sunVS: null, upVS: null,
        skyHi: null, skyLo: null, viewProj: null, sunDir: null, sunColor: null,
        eye: null, time: 0, cloud: 0, cloudSpeed: 1, lights: null,
      };
      const _chunkFrame = { total: 0, visible: 0 };   // reset each begin
      const _chunkLast = { total: 0, visible: 0 };    // latched at present — __tlx.chunkState()
      const _mirrorRelease = [];    // chunked meshes whose first lit draw is THIS render
      // Per-frame FX record counters (reset in begin, latched at present) —
      // the __tlx.fxState() probe the M6 tests assert against.
      const _fxFrame = { shadows: 0, marks: 0, skidVerts: 0, glow: 0, particles: 0, decals: 0 };
      const _fxLast = { shadows: 0, marks: 0, skidVerts: 0, glow: 0, particles: 0, decals: 0 };
      // M10 façade-wiring probe: how many meshes this backend actually created.
      // tracks.js resolves its gfx handle from Tracks.build's opts.gfx and routes
      // createMesh/createChunkedMesh through it — so on the TLX opt-in path these
      // counters prove the track build ran on THIS backend (never a real GLX
      // WebGL2 context, which is never init'd when TLX is active).
      const _meshMade = { mesh: 0, chunked: 0, tex: 0 };

      // ── M9 env-probe frame state (js/render/glx.js port) ─────────────────────
      // A CubeCamera owns the 6 face sub-cameras with the correct cube-face
      // orientations (fov 90, aspect 1, near 0.4, far 900 — GLX's
      // perspectiveTo(π/2, 1, 0.4, 900)). envFaceBegin positions it at the
      // probe eye and returns the CURRENT face's invViewProj so game.js can
      // point the sky node's ray reconstruction at that face; envFaceEnd
      // materialises the world draw-list (sky + track, NO cars/FX) into the
      // face and advances the completed-face mask. A full 6-face cycle sets
      // envReady — until then uEnvStr stays 0 and the cube reads black.
      let envCubeCam = null;
      let envFacesMask = 0, envReady = false, _envActive = false;
      const _envInvArr = new Float32Array(16);
      const _envVP = new THREE.Matrix4(), _envInvVP = new THREE.Matrix4();
      function ensureEnvCam() {
        if (envCubeCam || !envRT) return;
        // CubeCamera(near, far, renderTarget): its 6 children are the face
        // PerspectiveCameras. three only orients them inside update() (which
        // renders all 6 faces at once); we render ONE face per call, so we
        // orient them ourselves via updateCoordinateSystem() — after which
        // children[f] pairs with setRenderTarget(envRT, f), the exact face
        // index/camera pairing three's own update() loop uses.
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
        if (!m) { m = new THREE.Mesh(geo, unlitMat); m.matrixAutoUpdate = false; m.frustumCulled = false; meshPool[poolUsed] = m; }
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
        // per-vertex procedural material id (0 = FLAT), consumed by tsl-lit.
        // ALWAYS present: the lit material reads attribute('mat') — a missing
        // attribute is undefined-read territory on strict GL drivers.
        g.setAttribute("mat", new THREE.BufferAttribute(
          new Float32Array(data.mat && data.mat.length === verts ? data.mat : verts), 1));
        // Road track-space coords (arc-length s, signed lateral x, half-width),
        // GLX attribute location 4 (js/render/glx.js trk). tsl-lit's roadMarkings()
        // paints the edge lines and the dashed centre line analytically from
        // these, so a road mesh WITHOUT them renders as bare tarmac — which is
        // exactly what this backend did until now. ALWAYS present, zero-filled
        // for every non-road mesh: hw = 0 makes roadMarkings() a no-op, and a
        // missing attribute is undefined-read territory (same rule as `mat`).
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
        // A canvas is bound to one context type for life — the 2d fallback
        // needs its own.
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

      // CACHED CSS SIZE — same forced-reflow trap GLX documented at
      // js/render/glx.js (clientWidth in begin() → HUD layout → jank).
      let cssW = 0, cssH = 0, cssDirty = true;
      const markCssDirty = () => { cssDirty = true; };
      if (typeof window !== "undefined" && window.addEventListener) {
        window.addEventListener("resize", markCssDirty);
        window.addEventListener("orientationchange", markCssDirty);
        if (typeof ResizeObserver === "function" && canvas) {
          try { new ResizeObserver(markCssDirty).observe(canvas); } catch (_) {}
        }
      }
      function resize() {
        // CSS size only — NEVER fall back to canvas.width/.height. setSize() below
        // writes the backing store, so reading it back here fed the previous frame's
        // size into the DPR multiply: a hidden/detached canvas (clientWidth 0) then
        // doubled its render target every begin() until allocation failed. GLX and
        // WGX both read clientWidth with a floor of 1 for the same reason.
        if (cssDirty || cssW <= 0 || cssH <= 0) {
          cssW = canvas.clientWidth;
          cssH = canvas.clientHeight;
          cssDirty = false;
        }
        const cw = cssW || 1;
        const ch = cssH || 1;
        const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
        const w = Math.max(1, Math.round(cw * dpr * renderScale));
        const h = Math.max(1, Math.round(ch * dpr * renderScale));
        if (w !== W || h !== H) {
          W = w; H = h;
          renderer.setSize(w, h, false);    // false: CSS keeps sizing the canvas
          // M8: the post targets track the scaled backing size (PerfGov
          // renderScale changes land here through setRenderScale -> resize).
          if (post) post.resize(w, h);
        }
      }

      const noopMesh = () => ({ __tlx: true, count: 0 });

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
        // M7: real chunked build (tlx-chunked.js) — spatial binning, per-cell
        // AABBs, staged release of the source arrays. Falls back to the M2
        // single un-culled geometry when the factory is missing.
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
            // Neutral fill so a layer with no image is a no-op if sampled:
            // mid-grey albedo (×2.0 in the shader) / flat tangent normal.
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
            // Pack ownership — NOT "placeholder exists" (placeholders are always
            // bound so a naïve matMaps.albedo check stayed true after unload).
            albedo: !!matOwnedAlbedo, normal: !!matOwnedNormal,
            layers: Array.from(sc).reduce((n, s) => n + (s > 0 ? 1 : 0), 0),
            scales: Array.from(sc),
          };
        },

        // frame protocol — shadow passes delegate to the M4 subsystem
        // (tlx-shadow.js); a missing factory keeps them as safe no-ops.
        shadowBegin(vp) { if (shadowSys) shadowSys.shadowBegin(vp); },
        castShadow(mesh, model) { if (shadowSys) shadowSys.castShadow(mesh, model); },
        // M7: cull chunked casters against the ACTIVE depth pass's light
        // frustum — castCullVP (the lamp's perspective cone between
        // lampShadowBegin/End) or the static sun box (js/render/glx/chunked.js).
        // NO radial cull: an off-camera building can still cast INTO view.
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
        // invariant. begin() is NOT called between begin/end, so envFaceEnd
        // owns the face render and leaves drawList clean for the main pass.
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
          return _envInvArr;
        },
        envFaceEnd(face) {
          if (!envRT || !envCubeCam || !_envActive) { _envActive = false; return; }
          const faceCam = envCubeCam.children[face & 7];
          // Materialise the world draw-list (sky background node + track meshes
          // — game.js issued NO car/FX draws in the probe pass) into the face.
          // Chunked records cull against the face frustum with cullDist=0 (no
          // radial cap in the probe pass — GLX frameCullDist stays 0 here).
          const faceVP = _envVP.elements;   // set in envFaceBegin for this face
          // Software GL: six world presents into a 64px cube miss the 360 s
          // test budget even after skipping city+sky (measured 2026-08-17:
          // M9 timed out at 424 s with park() done and ready still false —
          // each waitForFunction poll sat behind a SwiftShader frame).
          // Clear the face and count it; the main present still paints the
          // canvas. Real GPUs keep the full world capture.
          if (softwareGL) {
            try {
              renderer.setRenderTarget(envRT, face & 7);
              renderer.setClearColor(0x000000, 1);
              renderer.clear();
            } catch (_) { /* a probe face must never strand the frame */ }
            renderer.setRenderTarget(null);
            drawList.length = 0;
            _dMatUsed = 0;
            poolUsed = 0;
            _envActive = false;
            envFacesMask |= 1 << (face & 7);
            if (envFacesMask === 63) { envFacesMask = 0; envReady = true; }
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
              const n = chunkedSys.cull(rec.chunked, faceVP, null, 0);
              const vis = chunkedSys.visList;
              for (let j = 0; j < n; j++) acquireMesh(vis[j].geo, rec.m, rec.mat).renderOrder = i;
              continue;
            }
            acquireMesh(rec.geo, rec.m, rec.mat).renderOrder = i;
          }
          for (let i = poolUsed; i < meshPool.length; i++) meshPool[i].visible = false;
          const prevSky = scene.backgroundNode;
          try {
            // Feedback-loop guard: the glass we're about to draw is an
            // envSurface that samples the cube — point the shared cube node at
            // the black dummy while envRT is the render target, restore after.
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
          renderer.setRenderTarget(null);
          if (lit && lit.setEnvCube) lit.setEnvCube(envRT.texture);
          drawList.length = 0;   // the main pass re-issues its own draws
          _dMatUsed = 0;
          poolUsed = 0;
          _envActive = false;
          envFacesMask |= 1 << (face & 7);
          if (envFacesMask === 63) {
            envFacesMask = 0; envReady = true;
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
        },
        envProbeReady() { return envReady; },
        // New track/session: the cube still holds the OLD circuit — hold the
        // probe black (uEnvStr 0) until a fresh full cube captures (GLX 1:1).
        envProbeReset() { envFacesMask = 0; envReady = false; },

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
        makeFrustumPlanes(viewProj) {
          return TLXShaders.makeFrustumPlanes(viewProj);
        },
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
          // Color fallback when TSL backgroundNode misses. Fog at dusk is a
          // beige (~0.68,0.64,0.54) that filled every software-GL probe as a
          // washed void; zenith is the sky the node would have drawn. Menu
          // frames without skyZenith still clear to fogColor.
          const z = frame && frame.skyZenith;
          const f = (z && z.length >= 3) ? z
            : ((frame && frame.fogColor) || [0.04, 0.04, 0.06]);
          scene.background.setRGB(f[0], f[1], f[2]);
          // Camera from the game's column-major matrices. Main path supplies
          // proj + invProj + viewProj (view = invProj * viewProj); the
          // setup-preview and no-track paths supply only viewProj — then the
          // projection IS the viewProj with an identity view (correct MVP;
          // view-space effects self-disable on those paths anyway).
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
          // M3: push the frame + tune uniforms (sun/ambient/fog/wetness/knobs
          // + the stride-15 lamp arrays, capped 32) into the shared lit set.
          if (lit && frame) {
            lit.updateFrame(frame);
            // M9: env-probe strength. 0 until a full cube has captured; forced
            // 0 on a probe-less preview (frame.noEnv) even if a stale cube
            // lingers — js/render/glx.js 1:1 (fallback mirrors TUNE_DEFS
            // carEnvCube def 0). Held off while rendering INTO the cube.
            if (lit.setEnvStr) {
              const _T = frame.tune;
              const _envOn = envRT && envReady && !frame.noEnv && !_envActive;
              lit.setEnvStr(_envOn ? (_T && _T.carEnvCube != null ? _T.carEnvCube : 0) : 0);
            }
          }
          // M6: decal-pass uniforms (keyMul sun / ambientMul ambient) + the
          // per-frame FX pools.
          if (fx && frame) fx.updateFrame(frame);
          frameEye = (frame && frame.eye) || null;
          // M7: latch the cull frustum + radial cap for present()'s chunk cull.
          if (frame && frame.viewProj) _frameVP.set(frame.viewProj);
          frameCullDist = (frame && frame.cullDist) || 0;
          // M8: latch the post chain's frame inputs (js/render/glx.js). The
          // viewProj is the _frameVP COPY — immune to a swapped frame array.
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
          // M5: sky is opt-in PER FRAME — a frame that issues no drawSky
          // (menus, no-track) keeps the flat Color clear above (zenith/fog).
          scene.backgroundNode = null;
          drawList.length = 0;
          _dMatUsed = 0;
          return true;
        },
        // M5: update the sky uniforms from whatever frameSky carries and arm
        // the background node for this frame's render. game.js may call this
        // twice per frame (env-probe pass with a swapped invViewProj, then
        // the main pass with the restored one — js/game.js); the LAST update
        // before render owns the uniforms. Env-probe faces use setEnvCube's
        // dummy-cube guard while rendering into the probe (M9 landed).
        drawSky(frameSky) {
          if (!sky || !frameSky) return;
          sky.update(frameSky);
          // Keep the Color fallback in lockstep with the node: if this
          // frame's TSL sky fails to compile into the HDR target, the clear
          // is still zenith, not leftover fog from a previous menu frame.
          const z = frameSky.zenith || frameSky.skyZenith;
          if (z && z.length >= 3) scene.background.setRGB(z[0], z[1], z[2]);
          // Software GL: the full SKY_FS node is a second TSL compile that
          // either misses (Color fog → beige void) or reconstructs rays
          // against the HDR target so every pixel is horizon beige. Arm the
          // zenith-only fallback; real GPUs keep the procedural dome.
          // skyState().on stays true (M5) because a backgroundNode is set.
          scene.backgroundNode = (softwareGL && sky.fallbackNode)
            ? sky.fallbackNode : sky.node;
          // three lazily builds a NodeMaterial around backgroundNode. Pin it
          // so getForRenderCacheKey does not hash child-node ids (the same
          // compile-storm the mesh materials hit). Harmless if the mesh is
          // not born yet — present() retries.
          pinSkyMaterial();
        },
        draw(mesh, model, opts) {
          if (mesh && mesh.geo) drawList.push({ geo: mesh.geo, m: poolModelMat(model), mat: materialFor(opts, false) });
        },
        // M7: a chunked mesh records the WHOLE handle; present() culls it per
        // chunk against the frame's final camera. The M2 fallback shape
        // (chunks null / factory missing) stays a single-geometry record.
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
        // Single skid-mark stamp — the per-mark fallback when a caller skips
        // the batch (same quad + matrix treatment, MARK_FS falloff).
        drawMark(modelMat, w, l) {
          if (!fx || !modelMat) return;
          drawList.push({ geo: getFxQuad(), m: fxMatFor(modelMat, w, l), mat: fx.markMat });
          _fxFrame.marks++;
        },
        // Batched skid trail: glx.js drawSkidBatch — `verts` is the game's
        // complete interleaved CPU array ([pos3,uv2] x 6 verts/mark), so a
        // grow-recreate can re-upload it wholesale even when not dirty.
        // Always returns true (handled) — on a missing fx factory the per-
        // mark fallback would be dead records through the same factory.
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
        // Additive lamp lens-glare halos: glx.js drawGlow verbatim — reads
        // stride-15 frame.lights records (fields 0-6 + 14), skips glareW<=0,
        // near-field fade over 60..170 m, physical-intensity colour
        // normalisation, lens-housing radius — into one billboard batch.
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
        // Textured car decal: glx.js drawDecal — the record's material is
        // cached per (texture, glow) inside the fx factory (~2 textures/car,
        // 2 glow states). The matrix is copied (pool) — game.js reuses its
        // per-index arrays.
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
              // M7: cull NOW, against begin()'s viewProj copy — the camera is
              // final at present time. Every visible chunk stamps the SAME
              // renderOrder = submission index, so the record stays one unit
              // in three's list sort (the M6 LOAD-BEARING rule).
              const n = chunkedSys.cull(rec.chunked, _frameVP, frameEye, frameCullDist);
              const vis = chunkedSys.visList;
              for (let j = 0; j < n; j++) acquireMesh(vis[j].geo, rec.m, rec.mat).renderOrder = i;
              _chunkFrame.total += rec.chunked.chunks.length;
              _chunkFrame.visible += n;
              // First lit render with >= 1 chunk drawn uploads the shared
              // vertex attributes — the CPU mirrors can go after render()
              // (kept under a viz override: viz materials consume a subset
              // of the attributes, so not all buffers would be created).
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
            try { Log.warn("gfx", "TLX: present failed —", e); } catch (_) { /* Log absent in the node harness */ }
          };
          const paintCanvas = () => {
            pinSkyMaterial();
            renderer.setRenderTarget(null);
            renderer.render(scene, camera);
          };
          const dropTo = (mode, mat) => {
            _drawMatMode = mode;
            post = null;
            sky = null;
            try { scene.backgroundNode = null; } catch (_) { /* node already gone */ }
            lit = null;
            fx = null;
            for (let i = 0; i < poolUsed; i++) {
              if (meshPool[i]) meshPool[i].material = mat;
            }
          };
          const refuseTab = () => {
            try { sessionStorage.setItem("apex26.gfxClaimFail", "1"); } catch (_) { /* this tab keeps trying */ }
            try { localStorage.removeItem("apex26.gfxBackendProbe"); } catch (_) { /* skipClaim still blocks revert */ }
            try { location.reload(); } catch (_) { /* harness: GLX attaches next real boot */ }
          };
          let painted = false;
          try {
            if (post) {
              // Same pin as paintCanvas(): three lazily builds the
              // backgroundNode material on first render. Pinning only the
              // canvas fallback left the HDR scene target on the Color
              // clear whenever the lazy compile missed (software GL).
              pinSkyMaterial();
              renderer.setRenderTarget(post.sceneTarget());
              renderer.render(scene, camera);
              post.present(opts, _postF);
            } else {
              paintCanvas();
            }
            painted = true;
          } catch (e) { persistFail(e); }
          // Post-only death: same materials, canvas (the 1269 intent).
          if (!painted && post) {
            post = null;
            try { paintCanvas(); painted = true; } catch (e) { persistFail(e); }
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
          // M7 staged release, final stage: the render above created the GPU
          // buffers for any first-drawn chunked mesh — drop its shared vertex
          // mirrors (js/render/glx/chunked.js "uploaded to the VBO — drop the CPU
          // copy"; see tlx-chunked.js releaseMirrors for why this is safe).
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
        },

        // debug — the __tlx tooling (mirrors the spike's __spike hooks):
        //   shader(idx)  generated GLSL/WGSL for scene mesh #idx (async)
        //   viz          the active ?viz= / apex26.tlxViz mode (null = off)
        __tlx: {
          renderer, THREE, TSL,
          get lit() { return lit; },
          get shadow() { return shadowSys; },
          get sky() { return sky; },
          get fx() { return fx; },
          get post() { return post; },
          // M8 probe: chain liveness + which blocks ran on the last presented
          // frame + the current target size — what the M8 tests assert.
          postState() {
            if (!post) return { on: false, hdr: false, blocks: {}, targets: [0, 0] };
            return post.state();
          },
          // M6 probe: FX record counts from the last presented frame (blob
          // shadows, per-mark stamps, skid batch verts, glare halos, live
          // particles, decal draws) — what the M6 tests assert against.
          fxState() {
            return {
              on: !!fx,
              shadows: _fxLast.shadows, marks: _fxLast.marks,
              skidVerts: _fxLast.skidVerts, glow: _fxLast.glow,
              particles: _fxLast.particles, decals: _fxLast.decals,
            };
          },
          // M5 probe: is the sky armed for the current frame, and what did
          // the last drawSky upload? (tests assert the night/day gates here)
          skyState() {
            return {
              on: !!(sky && scene.backgroundNode),
              stars: sky ? sky.uniforms.stars.value : -1,
              cloud: sky ? sky.uniforms.cloud.value : -1,
              sunDir: sky ? sky.uniforms.sunDir.value.toArray() : null,
            };
          },
          // M7 probe: chunk totals from the last presented frame, summed over
          // every chunked record (props + glass on street circuits). visible
          // < total at any parked camera proves the cull engages.
          chunkState() {
            return { on: !!chunkedSys, total: _chunkLast.total, visible: _chunkLast.visible };
          },
          // M10 probe: cumulative mesh-creation counts routed through THIS
          // backend (createMesh/createChunkedMesh/createTexMesh). Non-zero after
          // a track build proves tracks.js resolved its gfx from Tracks.build's
          // opts.gfx and built through the façade, not a hardcoded GLX.
          meshState() {
            return { mesh: _meshMade.mesh, chunked: _meshMade.chunked, tex: _meshMade.tex };
          },
          // M9 probe: env-cube liveness — is the target allocated (on), which
          // face captures next (face bit-mask -> lowest unset), the cube edge
          // size, and whether a full 6-face cycle has completed (ready). The
          // M9 test asserts the cube goes ready on a parked race frame.
          envState() {
            let face = 0;
            while (face < 6 && (envFacesMask & (1 << face))) face++;
            return { on: !!envRT, face, size: ENV_SIZE, ready: envReady };
          },
          viz: vizMode,
          // Which three backend actually came up, and why — the one question a
          // "TLX looks wrong on my phone" report has to answer first, since the
          // WebGPU/WebGL2 choice is now device-dependent (see the pin above).
          backendState() {
            return {
              api: (renderer.backend && renderer.backend.isWebGPUBackend) ? "webgpu" : "webgl2",
              forceWebGL, pin: _glPin, isMobile, mobileTier, softwareGL,
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
      return backend;
    } catch (e) {
      return _fail((e && e.message) || e);   // any failure -> GLX fallback (Gfx.create contract)
    }
  }

  return { create, lastFailure: () => _lastFailure };
})();

if (typeof window !== "undefined") window.TLX = TLX;
