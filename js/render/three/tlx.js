/* Apex 26 — TLX: the three.js/TSL renderer backend (migration milestone 1).
 *
 * Third backend behind the js/render/gfx.js seam (GLX = WebGL2 default,
 * WGX = frozen hand-written WebGPU, TLX = three.js r184 with WebGPURenderer
 * and automatic WebGL2 fallback). Opt-in via localStorage
 * apex26.gfxBackend = "three"; installed by game.js's descriptor-copy onto
 * the GLX object so every direct GLX.* call site and test monkey-patch keeps
 * working (object identity is the compatibility contract).
 *
 * ARCHITECTURE (see spike/ADOPTION-PLAN.md + the milestone plan):
 * - This file and its tlx-…/tsl-… siblings are classic IIFE scripts like the
 *   rest of the codebase. The ONLY ES-module content is the vendored three
 *   build in vendor/three-0.184.0/, reached through the inline importmap in
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
 *   (js/render/shaders/chunks.js:93-98).
 * - Defaults for every frame.tune / present(opts.tune) knob MUST mirror
 *   LightTune.TUNE_DEFS, same as GLX (js/render/gfx.js contract note).
 *
 * M1 STATUS: renderer lifecycle is real (dynamic import, WebGPURenderer with
 * WebGL2 fallback, resize/renderScale, clear-to-fogColor begin/present so the
 * no-track menu path at game.js:3105 works); every other contract member is
 * present as a SAFE no-op so game.js can issue the full frame protocol without
 * crashing. M2+ replace the no-ops subsystem by subsystem.
 *
 * M3 STATUS: the TSL lit core is live — TLXShaders.chunks + TLXShaders.lit
 * (tsl-chunks.js / tsl-lit.js) supply the full lit fragment (15 procedural
 * materials, car ids 20-26, FLAG wave, sun+hemi+32-lamp lighting, fog stack,
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
 * TLXShaders.shadowSys): static sun map (2048²/1024² mobile, snap-cached by
 * game.js), per-frame car map (1024², desktop) and nearest-floodlight spot
 * map (512², desktop), sampled in tsl-lit via hardware-compare depth taps.
 * Armed flags clear in present() like GLX's post present. PCSS blocker map
 * skipped (pcss() = false — TODO M4-PCSS in tlx-shadow.js).
 *
 * M5 STATUS: the procedural sky is live (tsl-sky.js, TLXShaders.sky — the
 * full SKY_FS port: gradient/golden hour, clouds, sun corona+disc, stars,
 * moon, city glow, lightning, dither). Delivered as scene.backgroundNode:
 * three renders it on its internal camera-following background mesh (depth
 * off, drawn first, z pinned to the far plane — GLX's exact draw order) and
 * the node reconstructs the per-pixel view ray from frameSky.invViewProj
 * (screenUV -> NDC -> both z planes), identical to SKY_VS. begin() clears
 * backgroundNode each frame; drawSky() re-arms it — so the no-track/menu
 * path keeps the flat fogColor clear, and the env-probe double-call (M9)
 * just overwrites uniforms (last drawSky before render wins). No post yet
 * (M8).
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
 */
"use strict";

const TLX = (function () {

  /** create(canvas, opts) -> Promise<backend|null>. Never throws. */
  async function create(canvas /*, opts */) {
    try {
      // Capture the mobile-tier decision from GLX BEFORE game.js's
      // descriptor-copy overwrites GLX's own values with ours.
      // glx.js:23-34 stays the single source of truth (lighting.js reads it
      // at script-eval time, long before any backend exists).
      const isMobile = (typeof GLX !== "undefined" && !!GLX.isMobile);
      const mobileTier = (typeof GLX !== "undefined" && !!GLX.mobileTier);

      // The ES-module island: resolved through the inline importmap in
      // index.html. Failure (old browser, missing vendor) -> null -> GLX.
      const THREE = await import("three/webgpu");
      const TSL = await import("three/tsl");

      // Calibration invariant: the game's look is authored with NO sRGB
      // encode anywhere (shaders/chunks.js:93-98).
      THREE.ColorManagement.enabled = false;

      const renderer = new THREE.WebGPURenderer({
        canvas,
        antialias: true,
        // Test/debug pin: apex26.tlxForceGL=1 keeps three on its WebGL2
        // backend (SwiftShader CI has no WebGPU; this makes local repros
        // match CI exactly). Desktop default: auto-pick WebGPU.
        forceWebGL: (function () {
          try { return localStorage.getItem("apex26.tlxForceGL") === "1"; } catch (_) { return false; }
        })(),
      });
      renderer.setPixelRatio(1);            // we manage DPR/renderScale ourselves
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;   // tone map lives in the post chain (M8)
      await renderer.init();

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
      // caller order is draw order) and renders once. InstancedMesh batching
      // of repeated geometries lands with the lit material (M3+).
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0.04, 0.04, 0.06);
      const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 4000);
      camera.matrixAutoUpdate = false;

      // Fallback material: unlit vertex colour (the M2 look). Kept as the
      // never-fail path — if the lit factory is missing or throws, the
      // backend still boots and renders geometry.
      const unlitMat = new THREE.MeshBasicNodeMaterial();
      unlitMat.colorNode = TSL.attribute("color", "vec3");
      unlitMat.side = THREE.FrontSide;

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
          shadowSys = TLXShaders.shadowSys(THREE, TSL, { renderer, mobileTier });
        }
      } catch (e) {
        try { console.warn("TLX: shadow factory failed, shadows off —", e); } catch (_) {}
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
        }
      } catch (e) {
        try { console.warn("TLX: post factory failed, direct to canvas —", e); } catch (_) {}
        post = null;
      }

      // ── M9: the live environment probe cube target ───────────────────────
      // A 64px cubemap rendered around the player car (one face per ~2 frames,
      // driven by game.js's envFaceBegin/End), sky+world only. The car-paint
      // clearcoat samples it for real reflections of the surroundings — GLX's
      // envInit()/envFaceBegin/envFaceEnd port (glx.js:553-621). Built BEFORE
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
        try { console.warn("TLX: env-probe target alloc failed, analytic reflections only —", e); } catch (_) {}
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
      let matMaps = null;
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
        matMaps = { albedo: grey([128, 128, 128]), normal: grey([128, 128, 255]) };
      } catch (_) { matMaps = null; }

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
        try { console.warn("TLX: lit factory failed, falling back to unlit —", e); } catch (_) {}
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
        try { console.warn("TLX: sky factory failed, flat clear only —", e); } catch (_) {}
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
        try { console.warn("TLX: fx factory failed, FX paths off —", e); } catch (_) {}
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
        try { console.warn("TLX: chunked factory failed, un-culled props —", e); } catch (_) {}
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
      function materialFor(opts, chunked) {
        if (!lit) return unlitMat;
        if (vizMat) return vizMat;
        if (!opts) return chunked ? defaultMatChunked : defaultMat;
        const o = opts;
        const key =
          (o.emissive !== undefined ? o.emissive : 0) + "," +
          (o.alpha !== undefined ? o.alpha : 1) + "," +
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
            const oldest = matCache.keys().next().value;
            const old = matCache.get(oldest);
            matCache.delete(oldest);
            if (old) old.dispose();
          }
          m = lit.makeMaterial(chunked ? Object.assign({ chunked: true }, o) : o);
          matCache.set(key, m);
        }
        return m;
      }

      const drawList = [];          // {geo, matrix, material} in submission order
      const meshPool = [];          // recycled THREE.Mesh wrappers
      let poolUsed = 0;
      const _tmpMat4 = new THREE.Matrix4();

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
      // frameInvProj/frameInvVP/frameSunVS/… latch — glx.js:666-682). All
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

      // ── M9 env-probe frame state (glx.js:62-81 port) ─────────────────────
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
          try { console.warn("TLX: env cube-cam orient failed, probe off —", e); } catch (_) {}
          envCubeCam = null;
        }
      }

      function acquireMesh(geo, matrixArr, material) {
        let m = meshPool[poolUsed];
        if (!m) { m = new THREE.Mesh(geo, unlitMat); m.matrixAutoUpdate = false; m.frustumCulled = false; meshPool[poolUsed] = m; }
        m.geometry = geo;
        m.material = material || unlitMat;
        if (matrixArr) m.matrix.fromArray(matrixArr); else m.matrix.identity();
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
        if (data.idx && data.idx.length) {
          g.setIndex(new THREE.BufferAttribute(new Uint32Array(data.idx), 1));
        }
        return g;
      }

      function resize() {
        const cw = canvas.clientWidth || canvas.width || 1;
        const ch = canvas.clientHeight || canvas.height || 1;
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
        pcss() { return false; },            // truthful: blocker map skipped (TODO M4-PCSS, tlx-shadow.js)
        isMobile,
        mobileTier,
        // GPU frame timer — the GLX gpuTimer/gpuMs contract (glx.js:1215-1226).
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
        // DataArrayTexture, so each ImageBitmap is drawn once into a scratch
        // canvas and read back; GLX can hand the bitmap straight to
        // texSubImage3D, which is why this readback lives here and not in
        // js/render/assets.js. Returns null on any failure — the caller then
        // keeps the procedural look.
        createTextureArray(size, images, layers) {
          if (!size || !images) return null;
          try {
            const n = layers || 17;
            const data = new Uint8Array(size * size * 4 * n);
            // Neutral fill so a layer with no image is a no-op if sampled:
            // mid-grey albedo (×2.0 in the shader) / flat tangent normal.
            data.fill(128);
            for (let i = 3; i < data.length; i += 4) data[i] = 255;
            const cv = (typeof OffscreenCanvas !== "undefined")
              ? new OffscreenCanvas(size, size)
              : Object.assign(document.createElement("canvas"), { width: size, height: size });
            const c2d = cv.getContext("2d", { willReadFrequently: true });
            if (!c2d) return null;
            let filled = 0;
            for (let i = 0; i < n; i++) {
              const img = images[i];
              if (!img) continue;
              c2d.clearRect(0, 0, size, size);
              c2d.drawImage(img, 0, 0, size, size);
              data.set(c2d.getImageData(0, 0, size, size).data, i * size * size * 4);
              filled++;
            }
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
        // scales. A falsy `maps` zeroes the scales, which is what actually
        // turns the feature back off — the placeholder textures stay bound.
        setMaterialMaps(maps) {
          if (!lit || !lit.setMaterialMaps) return;
          const prevA = matMaps && matMaps.albedo, prevN = matMaps && matMaps.normal;
          lit.setMaterialMaps(maps || null);
          if (maps && matMaps) {
            // Track what the nodes now point at, and drop the textures we
            // displaced — a tier switch would otherwise leak a full pack.
            if (maps.albedo) { matMaps.albedo = maps.albedo; if (prevA && prevA !== maps.albedo) prevA.dispose(); }
            if (maps.normal) { matMaps.normal = maps.normal; if (prevN && prevN !== maps.normal) prevN.dispose(); }
          }
        },
        materialMapState() {
          const sc = (lit && lit.uniforms && lit.uniforms.matTexScale && lit.uniforms.matTexScale.array) || [];
          return {
            albedo: !!(matMaps && matMaps.albedo), normal: !!(matMaps && matMaps.normal),
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
        // lampShadowBegin/End) or the static sun box (glx/chunked.js:170-191).
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
        carShadowBegin(vp) { if (shadowSys) shadowSys.carShadowBegin(vp); },
        carShadowEnd() { if (shadowSys) shadowSys.carShadowEnd(); },
        lampShadowBegin(vp, idx) { if (shadowSys) shadowSys.lampShadowBegin(vp, idx); },
        lampShadowEnd() { if (shadowSys) shadowSys.lampShadowEnd(); },
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
          poolUsed = 0;
          for (let i = 0; i < drawList.length; i++) {
            const rec = drawList[i];
            if (rec.chunked) {
              if (!chunkedSys) continue;
              const n = chunkedSys.cull(rec.chunked, faceVP, null, 0);
              const vis = chunkedSys.visList;
              for (let j = 0; j < n; j++) acquireMesh(vis[j].geo, rec.m, rec.mat).renderOrder = i;
              continue;
            }
            acquireMesh(rec.geo, rec.m, rec.mat).renderOrder = i;
          }
          for (let i = poolUsed; i < meshPool.length; i++) meshPool[i].visible = false;
          try {
            // Feedback-loop guard: the glass we're about to draw is an
            // envSurface that samples the cube — point the shared cube node at
            // the black dummy while envRT is the render target, restore after.
            if (lit && lit.setEnvCube && envDummy) lit.setEnvCube(envDummy.texture);
            renderer.setRenderTarget(envRT, face & 7);
            renderer.render(scene, faceCam);
          } catch (_) { /* a probe face must never strand the frame */ }
          renderer.setRenderTarget(null);
          if (lit && lit.setEnvCube) lit.setEnvCube(envRT.texture);
          drawList.length = 0;   // the main pass re-issues its own draws
          poolUsed = 0;
          _envActive = false;
          envFacesMask |= 1 << (face & 7);
          if (envFacesMask === 63) { envFacesMask = 0; envReady = true; }   // full cube captured
        },
        envProbeReady() { return envReady; },
        // New track/session: the cube still holds the OLD circuit — hold the
        // probe black (uEnvStr 0) until a fresh full cube captures (GLX 1:1).
        envProbeReset() { envFacesMask = 0; envReady = false; },
        begin(frame) {
          resize();
          const f = (frame && frame.fogColor) || [0.04, 0.04, 0.06];
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
              new THREE.Matrix4().fromArray(frame.viewProj));
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
            // lingers — glx.js:864-867 1:1 (fallback mirrors TUNE_DEFS
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
          // M8: latch the post chain's frame inputs (glx.js:666-682). The
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
          // (menus, no-track) keeps the flat fogColor clear above.
          scene.backgroundNode = null;
          drawList.length = 0;
          return true;
        },
        // M5: update the sky uniforms from whatever frameSky carries and arm
        // the background node for this frame's render. game.js may call this
        // twice per frame (env-probe pass with a swapped invViewProj, then
        // the main pass with the restored one — game.js:3744/3759); the env
        // face is skipped on TLX until M9 (envFaceBegin -> null), and even
        // when it lands, the LAST update before render owns the uniforms.
        drawSky(frameSky) {
          if (!sky || !frameSky) return;
          sky.update(frameSky);
          scene.backgroundNode = sky.node;
        },
        draw(mesh, model, opts) {
          if (mesh && mesh.geo) drawList.push({ geo: mesh.geo, m: model, mat: materialFor(opts, false) });
        },
        // M7: a chunked mesh records the WHOLE handle; present() culls it per
        // chunk against the frame's final camera. The M2 fallback shape
        // (chunks null / factory missing) stays a single-geometry record.
        drawChunked(mesh, model, opts) {
          if (!mesh) return;
          if (mesh.chunks && chunkedSys) {
            drawList.push({ geo: null, chunked: mesh, m: model, mat: materialFor(opts, true) });
          } else if (mesh.geo) {
            drawList.push({ geo: mesh.geo, m: model, mat: materialFor(opts, true) });
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
          // M8: with the post chain up, the world (opaques, sky background
          // node, transparent FX — glow/particles feed bloom) renders into
          // the HDR scene target; the chain resolves it to the canvas. The
          // chain reads the lamp shadow map + its armed flag BEFORE
          // clearArmed() below retires them (godrays sample the spot map).
          if (post) {
            renderer.setRenderTarget(post.sceneTarget());
            renderer.render(scene, camera);
            post.present(opts, _postF);
          } else {
            renderer.setRenderTarget(null);
            renderer.render(scene, camera);
          }
          _chunkLast.total = _chunkFrame.total; _chunkLast.visible = _chunkFrame.visible;
          // M7 staged release, final stage: the render above created the GPU
          // buffers for any first-drawn chunked mesh — drop its shared vertex
          // mirrors (glx/chunked.js:118 "uploaded to the VBO — drop the CPU
          // copy"; see tlx-chunked.js releaseMirrors for why this is safe).
          for (let i = 0; i < _mirrorRelease.length; i++) chunkedSys.releaseMirrors(_mirrorRelease[i]);
          _mirrorRelease.length = 0;
          _fxLast.shadows = _fxFrame.shadows; _fxLast.marks = _fxFrame.marks;
          _fxLast.skidVerts = _fxFrame.skidVerts; _fxLast.glow = _fxFrame.glow;
          _fxLast.particles = _fxFrame.particles; _fxLast.decals = _fxFrame.decals;
          drawList.length = 0;
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

      return backend;
    } catch (_) {
      return null;   // any failure -> GLX fallback (Gfx.create contract)
    }
  }

  return { create };
})();

if (typeof window !== "undefined") window.TLX = TLX;
