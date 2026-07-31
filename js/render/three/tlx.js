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

      // ── M3: the TSL lit core (tsl-chunks.js + tsl-lit.js factories) ──────
      // Guarded: a missing/broken factory keeps the unlit material — the
      // backend must still boot (Gfx.create's never-throw contract).
      let chunks = null;
      let lit = null;
      try {
        if (window.TLXShaders && TLXShaders.chunks && TLXShaders.lit) {
          chunks = TLXShaders.chunks(THREE, TSL);
          lit = TLXShaders.lit(THREE, TSL, { chunks, shadow: shadowSys });
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

      // Debug viz mode (?viz=mat|normal|lamp or localStorage apex26.tlxViz):
      // paints the mat attribute / world normal / raw lamp-loop output — the
      // bisect views that cracked the spike's black-lamp defect.
      const vizMode = (function () {
        try {
          return new URL(location.href).searchParams.get("viz")
            || localStorage.getItem("apex26.tlxViz") || null;
        } catch (_) { return null; }
      })();
      const vizMat = (lit && vizMode) ? lit.makeViz(vizMode) : null;

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
      // Per-frame FX record counters (reset in begin, latched at present) —
      // the __tlx.fxState() probe the M6 tests assert against.
      const _fxFrame = { shadows: 0, marks: 0, skidVerts: 0, glow: 0, particles: 0, decals: 0 };
      const _fxLast = { shadows: 0, marks: 0, skidVerts: 0, glow: 0, particles: 0, decals: 0 };

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
        hdrMode() { return false; },         // truthful: direct-to-canvas 8-bit until M8's HDR post chain
        msaa() { return 1; },
        pcss() { return false; },            // truthful: blocker map skipped (TODO M4-PCSS, tlx-shadow.js)
        isMobile,
        mobileTier,
        gpuTimer() { return { supported: false, on: false }; },
        gpuMs() { return -1; },
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
          return { __tlx: true, geo: buildGeometry(data), count: (data.idx && data.idx.length) || 0 };
        },
        createTexMesh(data) {
          if (!data || !data.pos || !data.pos.length) return noopMesh();
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(data.pos), 3));
          g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(data.nrm), 3));
          g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(data.uv), 2));
          g.setIndex(new THREE.BufferAttribute(new Uint32Array(data.idx), 1));
          return { __tlx: true, geo: g, tex: true, count: data.idx.length };
        },
        // M2: chunked meshes are a single un-culled geometry (one draw).
        // tlx-chunked.js (M7) adds binning + frustum/radial culling + the
        // staged memory-release discipline.
        createChunkedMesh(data) {
          if (!data || !data.pos || !data.pos.length) return noopMesh();
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
        freeChunkedMesh(m) { if (m && m.geo) { m.geo.dispose(); m.geo = null; } },
        freeTexture(t) { if (t && t.tex) { t.tex.dispose(); t.tex = null; } },

        // frame protocol — shadow passes delegate to the M4 subsystem
        // (tlx-shadow.js); a missing factory keeps them as safe no-ops.
        shadowBegin(vp) { if (shadowSys) shadowSys.shadowBegin(vp); },
        castShadow(mesh, model) { if (shadowSys) shadowSys.castShadow(mesh, model); },
        castShadowChunked(mesh, model) { if (shadowSys) shadowSys.castShadowChunked(mesh, model); },
        shadowEnd() { if (shadowSys) shadowSys.shadowEnd(); },
        carShadowBegin(vp) { if (shadowSys) shadowSys.carShadowBegin(vp); },
        carShadowEnd() { if (shadowSys) shadowSys.carShadowEnd(); },
        lampShadowBegin(vp, idx) { if (shadowSys) shadowSys.lampShadowBegin(vp, idx); },
        lampShadowEnd() { if (shadowSys) shadowSys.lampShadowEnd(); },
        envFaceBegin() { return null; },     // game.js skips the probe on null
        envFaceEnd() {},
        envProbeReady() { return false; },
        envProbeReset() {},
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
          if (lit && frame) lit.updateFrame(frame);
          // M6: decal-pass uniforms (keyMul sun / ambientMul ambient) + the
          // per-frame FX pools.
          if (fx && frame) fx.updateFrame(frame);
          frameEye = (frame && frame.eye) || null;
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
        drawChunked(mesh, model, opts) {
          if (mesh && mesh.geo) drawList.push({ geo: mesh.geo, m: model, mat: materialFor(opts, true) });
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
        present() {
          poolUsed = 0;
          // renderOrder = submission index: three sorts opaque and transparent
          // lists by renderOrder first, so caller order (the GLX contract)
          // survives its z-sort in BOTH lists. Opaques still render before
          // the transparent FX as a group — strictly safer than GLX's inline
          // order because FX never write depth.
          for (let i = 0; i < drawList.length; i++) {
            acquireMesh(drawList[i].geo, drawList[i].m, drawList[i].mat).renderOrder = i;
          }
          for (let i = poolUsed; i < meshPool.length; i++) meshPool[i].visible = false;
          renderer.render(scene, camera);
          _fxLast.shadows = _fxFrame.shadows; _fxLast.marks = _fxFrame.marks;
          _fxLast.skidVerts = _fxFrame.skidVerts; _fxLast.glow = _fxFrame.glow;
          _fxLast.particles = _fxFrame.particles; _fxLast.decals = _fxFrame.decals;
          drawList.length = 0;
          // Armed shadow flags clear AFTER the main render (GLX clears them
          // in the post-chain present; game.js re-arms every frame it runs
          // the car/lamp passes). The lit uniforms latched the armed state at
          // begin(), so this never races the frame that armed them.
          if (shadowSys) shadowSys.clearArmed();
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
