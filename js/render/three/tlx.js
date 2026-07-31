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
 * (or localStorage apex26.tlxViz) paints bisect views. No shadow maps / sky /
 * post yet (M4/M5/M8).
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

      // ── M3: the TSL lit core (tsl-chunks.js + tsl-lit.js factories) ──────
      // Guarded: a missing/broken factory keeps the unlit material — the
      // backend must still boot (Gfx.create's never-throw contract).
      let lit = null;
      try {
        if (window.TLXShaders && TLXShaders.chunks && TLXShaders.lit) {
          const chunks = TLXShaders.chunks(THREE, TSL);
          lit = TLXShaders.lit(THREE, TSL, { chunks });
        }
      } catch (e) {
        try { console.warn("TLX: lit factory failed, falling back to unlit —", e); } catch (_) {}
        lit = null;
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

      // Shadow-map arming introspection (real lifecycle lands in M4; the
      // shape must exist now — webgl-probes-style tests read it).
      const carShadow = { enabled: false, arms: 0 };
      const lampShadow = { enabled: false, arms: 0, idx: -1 };

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
        hdrMode() { return true; },          // scene targets are RGBA16F from M2 on
        msaa() { return 1; },
        pcss() { return false; },            // real PCSS lands in M4
        isMobile,
        mobileTier,
        gpuTimer() { return { supported: false, on: false }; },
        gpuMs() { return -1; },
        carShadowState() { return { enabled: carShadow.enabled, arms: carShadow.arms }; },
        lampShadowState() { return { enabled: lampShadow.enabled, arms: lampShadow.arms, idx: lampShadow.idx }; },

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

        // frame protocol — M1: clear-only; every draw is a safe no-op
        shadowBegin() {}, castShadow() {}, castShadowChunked() {}, shadowEnd() {},
        carShadowBegin() {}, carShadowEnd() {},
        lampShadowBegin() {}, lampShadowEnd() {},
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
          drawList.length = 0;
          return true;
        },
        drawSky() {},
        draw(mesh, model, opts) {
          if (mesh && mesh.geo) drawList.push({ geo: mesh.geo, m: model, mat: materialFor(opts, false) });
        },
        drawChunked(mesh, model, opts) {
          if (mesh && mesh.geo) drawList.push({ geo: mesh.geo, m: model, mat: materialFor(opts, true) });
        },
        drawShadow() {}, drawMark() {},
        drawSkidBatch() { return true; },    // true: swallow the batch (no per-mark fallback spam)
        drawGlow() {}, drawParticles() {}, drawDecal() {},
        present() {
          poolUsed = 0;
          for (let i = 0; i < drawList.length; i++) acquireMesh(drawList[i].geo, drawList[i].m, drawList[i].mat);
          for (let i = poolUsed; i < meshPool.length; i++) meshPool[i].visible = false;
          renderer.render(scene, camera);
          drawList.length = 0;
        },

        // debug — the __tlx tooling (mirrors the spike's __spike hooks):
        //   shader(idx)  generated GLSL/WGSL for scene mesh #idx (async)
        //   viz          the active ?viz= / apex26.tlxViz mode (null = off)
        __tlx: {
          renderer, THREE, TSL,
          get lit() { return lit; },
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
