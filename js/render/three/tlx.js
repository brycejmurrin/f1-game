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

      // M1 clear-path scene: present() renders this empty scene so the canvas
      // clears to frame.fogColor every frame (the no-track menu fallback).
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0.04, 0.04, 0.06);
      const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 4000);

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

        // resources (M2)
        createMesh: noopMesh,
        createTexMesh: noopMesh,
        createChunkedMesh: noopMesh,
        createTexture() { return { __tlx: true }; },
        freeMesh() {},
        freeChunkedMesh() {},
        freeTexture() {},

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
          return true;
        },
        drawSky() {}, draw() {}, drawChunked() {},
        drawShadow() {}, drawMark() {},
        drawSkidBatch() { return true; },    // true: swallow the batch (no per-mark fallback spam)
        drawGlow() {}, drawParticles() {}, drawDecal() {},
        present() { renderer.render(scene, camera); },

        // debug (grows into the __tlx shader-dump/?viz= tooling from M3 on)
        __tlx: { renderer, THREE, TSL },
      };

      return backend;
    } catch (_) {
      return null;   // any failure -> GLX fallback (Gfx.create contract)
    }
  }

  return { create };
})();

if (typeof window !== "undefined") window.TLX = TLX;
